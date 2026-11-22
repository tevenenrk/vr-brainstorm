import * as THREE from 'three';
import { CanvasPanel } from '../hud.js';

// Miejsce sądu: lewa połowa — brama do nieba, prawa — brama do piekła, przed graczem waga.
// Lewy spust dokłada na lewą szalę, prawy na prawą. Przeważenie → błysk → chmury albo piekło.
const NOISE = `
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }`;
const ADD = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
const STEP = 0.05, TIP = 0.55;     // przechył na jedno kliknięcie, przechył rozstrzygający (rad)
const rnd = (a, b) => a + Math.random() * (b - a);

function glowTex(stops) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) g.addColorStop(o, col);
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}
function cloudTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 128 + rnd(-70, 70), y = 140 + rnd(-40, 40) - Math.abs(x - 128) * 0.2, r = rnd(30, 70);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(250,250,255,0.25)'); g.addColorStop(1, 'rgba(240,244,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(cv);
}

// pole ognia: cząsteczki addytywne wypuszczane z emiterów
class FireField {
  constructor(N, emitters) {
    this.N = N; this.emitters = emitters; this.acc = 0; this.on = true;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3); this.col = new Float32Array(N * 4); this.size = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('col', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uni = { scale: { value: 800 } };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.uni, ...ADD,
      vertexShader: `attribute float size; attribute vec4 col; uniform float scale; varying vec4 vC;
        void main(){ vC = col; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(512.0, size * scale / max(0.05, -mv.z)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float a = (1.0 - smoothstep(0.0, 0.5, length(c))); a *= a; gl_FragColor = vec4(vC.rgb * vC.a * a, 0.0); }`,
    }));
    this.points.frustumCulled = false; this.points.renderOrder = 15;
    this.parts = Array.from({ length: N }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0, ember: false }));
    const tot = emitters.reduce((s, e) => s + e.rate, 0);
    this.rate = tot;
  }
  update(dt, scale) {
    this.uni.scale.value = scale;
    if (this.on) {
      this.acc += dt * this.rate;
      let n = Math.floor(this.acc); this.acc -= n;
      for (const p of this.parts) {
        if (n <= 0) break;
        if (p.life > 0) continue;
        n--;
        let r = Math.random() * this.rate, e = this.emitters[0];
        for (const em of this.emitters) { r -= em.rate; if (r <= 0) { e = em; break; } }
        p.ember = Math.random() < (e.ember ?? 0.1);
        const ed = e.d ?? e.w; p.x = e.x + rnd(-e.w, e.w) / 2; p.z = e.z + rnd(-ed, ed) / 2; p.y = e.y + rnd(0, e.h || 0);
        p.vx = rnd(-0.2, 0.2) * e.s; p.vz = rnd(-0.2, 0.2) * e.s; p.vy = (p.ember ? rnd(0.6, 1.6) : rnd(0.8, 1.6)) * e.s;
        p.max = p.life = p.ember ? rnd(2, 4) : rnd(0.5, 1.0) * Math.sqrt(e.s);
        p.s = p.ember ? rnd(0.02, 0.05) * Math.sqrt(e.s) : rnd(0.25, 0.5) * e.s;
      }
    }
    let i = 0;
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += dt * (p.ember ? 0.05 : 0.8); p.vx += rnd(-1, 1) * dt * 0.6;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const t = 1 - p.life / p.max, k = i * 3, c = i * 4;
      this.pos[k] = p.x; this.pos[k + 1] = p.y; this.pos[k + 2] = p.z;
      if (p.ember) { this.col[c] = 1; this.col[c + 1] = 0.5; this.col[c + 2] = 0.12; this.col[c + 3] = (1 - t) * 1.5; this.size[i] = p.s; }
      else {
        this.col[c] = 1; this.col[c + 1] = t < 0.25 ? 0.8 - t * 1.4 : Math.max(0.1, 0.45 - (t - 0.25) * 0.5); this.col[c + 2] = t < 0.2 ? 0.35 - t * 1.5 : 0.03;
        this.col[c + 3] = Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.8;
        this.size[i] = p.s * (0.6 + Math.sin(Math.PI * t) * 0.8);
      }
      i++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, i);
    g.attributes.position.needsUpdate = g.attributes.col.needsUpdate = g.attributes.size.needsUpdate = true;
  }
}

export class Judgement {
  constructor(scene, camera) {
    this.camera = camera;
    this.root = new THREE.Group(); this.root.visible = false;
    scene.add(this.root);
    this.uni = { mode: { value: 0 }, time: { value: 0 } };
    this.time = 0;
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8a842, metalness: 0.55, roughness: 0.32, emissive: 0x2a1800 });
    const marble = new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.45, emissive: 0x2a2620 });
    const basalt = new THREE.MeshStandardMaterial({ color: 0x2a1c18, roughness: 0.9, emissive: 0x200400, flatShading: true });
    this.mats = { gold, marble, basalt };
    // niebo/kopuła
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), new THREE.ShaderMaterial({
      uniforms: this.uni, side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float mode, time; varying vec3 vP; ${NOISE}
        vec3 heavenSky(vec3 d){
          vec3 c = mix(vec3(1.0, 0.9, 0.75), vec3(0.3, 0.55, 1.0), smoothstep(0.0, 0.5, d.y));
          vec3 sd = normalize(vec3(-0.45, 0.35, -0.8)); float s = max(dot(d, sd), 0.0);
          c += vec3(1.0, 0.95, 0.8) * (pow(s, 300.0) * 4.0 + pow(s, 10.0) * 0.45);
          float cl = fbm(d.xz / max(0.08, d.y + 0.1) * 1.5 + vec2(time * 0.01, 0.0));
          c = mix(c, vec3(1.0), smoothstep(0.55, 0.85, cl) * smoothstep(0.02, 0.25, d.y) * 0.6);
          if (d.y < 0.0) c = mix(vec3(1.0, 0.97, 0.93), vec3(0.88, 0.9, 0.97), clamp(-d.y * 2.0, 0.0, 1.0));
          return c;
        }
        vec3 hellSky(vec3 d){
          float n = fbm(vec2(d.x * 2.5, d.z * 2.5) + vec2(d.y * 3.0 - time * 0.12, time * 0.05));
          vec3 c = mix(vec3(0.6, 0.12, 0.02), vec3(0.06, 0.0, 0.0), smoothstep(-0.05, 0.55, d.y));
          c *= 0.55 + 0.9 * n;
          if (d.y < 0.0) c = vec3(0.4, 0.06, 0.0) * (0.7 + 0.6 * n);
          return c;
        }
        void main(){
          vec3 d = normalize(vP), c;
          if (mode < 0.5) c = mix(heavenSky(d), hellSky(d), smoothstep(-0.12, 0.12, d.x));
          else if (mode < 1.5) c = heavenSky(d);
          else c = hellSky(d);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    this.dome.renderOrder = -50; this.dome.frustumCulled = false;
    // podłoże: chmury z lewej, lawa z prawej
    this.floor = new THREE.Mesh(new THREE.RingGeometry(0.01, 80, 64, 40).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: this.uni,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float mode, time; varying vec3 vP; ${NOISE}
        vec3 clouds(vec2 p){ float n = fbm(p * 0.35 + vec2(time * 0.02, 0.0)); return mix(vec3(0.82, 0.85, 0.93), vec3(1.0, 0.99, 0.96), smoothstep(0.3, 0.75, n)); }
        vec3 lava(vec2 p){
          float n = fbm(p * 0.45 + vec2(0.0, time * 0.03));
          float v = (1.0 - smoothstep(0.0, 0.07, abs(n - 0.5))) + 0.5 * (1.0 - smoothstep(0.0, 0.04, abs(fbm(p * 1.3 - time * 0.05) - 0.5)));
          vec3 rock = vec3(0.09, 0.05, 0.04) * (0.6 + 0.6 * fbm(p * 2.0));
          return rock + vec3(1.0, 0.35, 0.05) * v * (0.75 + 0.25 * sin(time * 2.0 + n * 9.0));
        }
        void main(){
          vec2 p = vP.xz; vec3 c;
          float dist = length(p);
          if (mode < 0.5) c = mix(clouds(p), lava(p), smoothstep(-0.6, 0.6, vP.x));
          else if (mode < 1.5) c = clouds(p);
          else c = lava(p);
          float fade = (1.0 - smoothstep(30.0, 80.0, dist));
          gl_FragColor = vec4(mix(mode > 1.5 ? vec3(0.35, 0.05, 0.0) : vec3(1.0, 0.95, 0.9), c, fade), 1.0);
        }`,
    }));
    this.floor.renderOrder = -40;
    // pod stopami: krąg pół jasny, pół ciemny
    this.disk = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48).rotateX(-Math.PI / 2).translate(0, 0.01, 0), new THREE.ShaderMaterial({
      uniforms: this.uni,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float mode; varying vec3 vP; ${NOISE}
        void main(){
          float n = fbm(vP.xz * 3.0), r = length(vP.xz);
          vec3 w = vec3(0.92, 0.9, 0.86) * (0.85 + 0.2 * n), b = vec3(0.07, 0.05, 0.05) * (0.8 + 0.6 * n);
          vec3 c = mode < 0.5 ? mix(w, b, smoothstep(-0.02, 0.02, vP.x)) : mode < 1.5 ? w : b;
          c = mix(c, vec3(0.75, 0.6, 0.3), smoothstep(1.3, 1.36, r));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    this.root.add(this.dome, this.floor, this.disk);
    // światła
    this.hemi = new THREE.HemisphereLight(0xfff6e8, 0x3a1810, 1.2);
    this.lightL = new THREE.DirectionalLight(0xfff2d8, 2.0); this.lightL.position.set(-6, 6, 2);
    this.lightR = new THREE.DirectionalLight(0xff5a20, 2.0); this.lightR.position.set(6, 4, 2);
    this.root.add(this.hemi, this.lightL, this.lightR, this.lightL.target, this.lightR.target);

    this.judge = new THREE.Group(); this.root.add(this.judge);
    this.buildHeavenGate(); this.buildHellGate(); this.buildScale();
    this.heaven = new THREE.Group(); this.hell = new THREE.Group();
    this.root.add(this.heaven, this.hell);
    this.buildHeaven(); this.buildHell();
    // podpowiedź nad wagą i napis po wszystkim
    this.tip = new CanvasPanel(720, 120, 0.6);
    { const c = this.tip.ctx; c.clearRect(0, 0, 720, 120); c.font = 'bold 44px Georgia, serif'; c.textAlign = 'left'; c.fillStyle = '#fff4d0'; c.fillText('◄ NIEBO', 20, 76); c.textAlign = 'right'; c.fillStyle = '#ff7040'; c.fillText('PIEKŁO ►', 700, 76); this.tip.tex.needsUpdate = true; }
    this.tip.mesh.position.set(0, 1.62, -0.95);
    this.judge.add(this.tip.mesh);
    this.hint = new CanvasPanel(640, 110, 0.55);
    { const c = this.hint.ctx; c.clearRect(0, 0, 640, 110); c.textAlign = 'center'; c.font = '38px Georgia, serif'; c.fillStyle = '#ffffff'; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 6; c.strokeText('Spust — jeszcze raz', 320, 66); c.fillText('Spust — jeszcze raz', 320, 66); this.hint.tex.needsUpdate = true; }
    this.hint.mesh.material.depthTest = false; this.hint.mesh.renderOrder = 10030; this.hint.mesh.visible = false;
    this.root.add(this.hint.mesh);
    // błysk (przy kamerze)
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.flash.renderOrder = 10020; this.flash.frustumCulled = false; this.flash.visible = false;
    camera.add(this.flash);
    this.mode = 'off';
  }

  buildHeavenGate() {
    const g = new THREE.Group(), { marble, gold } = this.mats;
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(3.6 - i * 0.3, 0.16, 0.6), marble); s.position.set(0, 0.08 + i * 0.16, 0.6 - i * 0.45); g.add(s); }
    for (const x of [-1.5, 1.5]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 4.2, 20), marble); p.position.set(x, 0.48 + 2.1, -0.3); g.add(p);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.75), marble); cap.position.set(x, 4.78, -0.3); g.add(cap);
      const bs = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.75), marble); bs.position.set(x, 0.58, -0.3); g.add(bs);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.2, 10, 40, Math.PI), marble); arch.position.set(0, 4.85, -0.3); g.add(arch);
    // złote skrzydła bramy, uchylone
    for (const sgn of [-1, 1]) {
      const leaf = new THREE.Group(); leaf.position.set(sgn * 1.22, 0.48, -0.3); leaf.rotation.y = sgn * 0.45;
      for (let k = 0; k < 7; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 3.6, 6), gold); b.position.set(-sgn * (0.08 + k * 0.17), 1.8, 0); leaf.add(b); }
      for (const y of [0.4, 1.8, 3.4]) { const r = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.05), gold); r.position.set(-sgn * 0.6, y, 0); leaf.add(r); }
      g.add(leaf);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex([[0, 'rgba(255,255,240,1)'], [0.3, 'rgba(255,240,200,0.7)'], [1, 'rgba(255,230,180,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.set(5, 6, 1); glow.position.set(0, 2.6, -1.4); g.add(glow);
    const l = new THREE.PointLight(0xfff0d0, 6, 12, 1.5); l.position.set(0, 2.5, 0.8); g.add(l);
    g.position.set(-4.4, 0, -6.6); g.lookAt(0, 0, 0);
    this.judge.add(g);
  }
  buildHellGate() {
    const g = new THREE.Group(), { basalt } = this.mats;
    for (const x of [-1.55, 1.55]) {
      for (let k = 0; k < 6; k++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.48 - k * 0.03, 0), basalt); r.position.set(x + rnd(-0.08, 0.08), 0.4 + k * 0.72, -0.3); r.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)); r.scale.y = 1.25; g.add(r); }
    }
    for (let k = 0; k <= 12; k++) {
      const a = Math.PI * (k / 12), sp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7 + (k % 2) * 0.5, 6), basalt);
      sp.position.set(Math.cos(a) * 1.6, 4.4 + Math.sin(a) * 1.6, -0.3); sp.rotation.z = a - Math.PI / 2; g.add(sp);
    }
    for (const sgn of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.8, 8), basalt); horn.position.set(sgn * 1.9, 5.4, -0.3); horn.rotation.z = -sgn * 0.6; g.add(horn); }
    // wnętrze: wir ognia
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 5.6).translate(0, 2.4, -0.4), new THREE.ShaderMaterial({
      uniforms: this.uni, ...ADD, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float time; varying vec2 vUv; ${NOISE}
        void main(){
          vec2 p = (vUv - vec2(0.5, 0.35)) * vec2(2.8, 5.6);
          float r = length(p), a = atan(p.y, p.x);
          float sw = fbm(vec2(a * 1.5 + r * 1.2 - time * 0.8, r * 2.0 - time * 0.5));
          float m = (1.0 - smoothstep(0.6, 2.0, r)) * step(vUv.y, 0.78 + 0.0 * sw);
          vec3 c = mix(vec3(0.5, 0.03, 0.0), vec3(1.0, 0.55, 0.1), smoothstep(0.45, 0.8, sw)) * (0.5 + sw);
          gl_FragColor = vec4(c * m, 0.0);
        }`,
    }));
    inner.renderOrder = 14; g.add(inner);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 5.8).translate(0, 2.5, -0.5), new THREE.MeshBasicMaterial({ color: 0x080000 }));
    g.add(back);
    this.hellLight = new THREE.PointLight(0xff4a10, 6, 12, 1.5); this.hellLight.position.set(0, 2.2, 0.8); g.add(this.hellLight);
    this.gateFire = new FireField(500, [{ x: -1.55, z: 0.1, y: 0, w: 0.9, d: 0.6, h: 0.3, rate: 80, s: 1.2 }, { x: 1.55, z: 0.1, y: 0, w: 0.9, d: 0.6, h: 0.3, rate: 80, s: 1.2 }, { x: 0, z: 0.3, y: 0, w: 2.6, d: 0.6, rate: 60, s: 0.8, ember: 0.25 }]);
    g.add(this.gateFire.points);
    g.position.set(4.4, 0, -6.6); g.lookAt(0, 0, 0);
    this.judge.add(g);
  }
  buildScale() {
    const { gold } = this.mats, s = new THREE.Group();
    s.add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.06, 24).translate(0, 0.03, 0), gold));
    s.add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 1.12, 12).translate(0, 0.62, 0), gold));
    s.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8).translate(0, 1.22, 0), gold));
    const beam = new THREE.Group(); beam.position.set(0, 1.15, 0);
    beam.add(new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.022, 0.022), gold));
    beam.add(new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 4).rotateZ(Math.PI).translate(0, -0.05, 0), gold));
    for (const x of [-0.46, 0.46]) beam.add(new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6).translate(x, 0, 0), gold));
    s.add(beam);
    this.beam = beam;
    const bowl = new THREE.SphereGeometry(0.15, 24, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38).translate(0, 0.12, 0);
    const bowlMat = gold.clone(); bowlMat.side = THREE.DoubleSide;
    this.pans = [-1, 1].map((sgn) => {
      const p = new THREE.Group(); p.add(new THREE.Mesh(bowl, bowlMat));
      const chain = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(Array(6).fill(0).map(() => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xe8c060 }));
      chain.frustumCulled = false; s.add(chain);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex([[0, sgn < 0 ? 'rgba(255,250,220,1)' : 'rgba(255,120,40,1)'], [1, 'rgba(255,200,120,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      glow.scale.setScalar(0.35); glow.position.y = 0.05; p.add(glow);
      s.add(p);
      return { g: p, chain, glow, sgn, orbs: [] };
    });
    this.orbMat = [new THREE.MeshBasicMaterial({ color: 0xfff6d0 }), new THREE.MeshBasicMaterial({ color: 0xff5a18 })];
    this.orbGeo = new THREE.SphereGeometry(0.022, 10, 8);
    s.position.set(0, 0, -0.85);
    this.scale = s;
    this.judge.add(s);
  }
  buildHeaven() {
    const tex = cloudTex();
    this.clouds = [];
    for (let i = 0; i < 70; i++) {
      const near = i < 16;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false, opacity: near ? 0.45 : 0.9 }));
      const a = rnd(0, Math.PI * 2), r = near ? rnd(1.6, 4.5) : rnd(6, 45);
      // morze chmur poniżej oczu, pojedyncze obłoki wyżej
      sp.position.set(Math.cos(a) * r, near ? rnd(-0.4, 0.4) : (i % 4 === 0 ? rnd(4, 14) : rnd(-5, 0.5)), Math.sin(a) * r);
      const sc = near ? rnd(1.5, 3) : rnd(5, 16); sp.scale.set(sc * 1.6, sc, 1);
      sp.userData.v = rnd(0.05, 0.25);
      this.heaven.add(sp); this.clouds.push(sp);
    }
    // złote drobinki
    const N = 260, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = rnd(-12, 12); pos[i * 3 + 1] = rnd(0, 6); pos[i * 3 + 2] = rnd(-12, 12); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex([[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]), color: 0xffe8a0, size: 0.07, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.heaven.add(this.motes);
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex([[0, 'rgba(255,255,245,1)'], [0.25, 'rgba(255,245,210,0.6)'], [1, 'rgba(255,240,200,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sun.position.copy(new THREE.Vector3(-0.45, 0.35, -0.8).normalize().multiplyScalar(60)); sun.scale.setScalar(26);
    this.heaven.add(sun);
    this.heaven.visible = false;
  }
  buildHell() {
    const em = [];
    for (let i = 0; i < 18; i++) { const a = rnd(0, Math.PI * 2), r = rnd(2.6, 16); em.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0, w: rnd(0.8, 2), d: rnd(0.8, 2), rate: 60 + 260 / r, s: rnd(1.5, 3.2), ember: 0.12 }); }
    em.push({ x: 0, z: 0, y: 0, w: 14, d: 14, h: 4, rate: 50, s: 0.6, ember: 1 });
    this.hellFire = new FireField(2400, em);
    this.hell.add(this.hellFire.points);
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 0.6, 9).translate(0, -0.29, 0), this.mats.basalt);
    this.hell.add(rock);
    this.hellLights = [0, 1, 2].map((k) => { const l = new THREE.PointLight(0xff4010, 4, 14, 1.4); l.position.set(Math.cos(k * 2.1) * 4, 1.5, Math.sin(k * 2.1) * 4); this.hell.add(l); return l; });
    this.hell.visible = false;
  }

  start(floorPos, yaw) {
    this.root.visible = true; this.root.position.copy(floorPos); this.root.rotation.set(0, yaw, 0);
    this.mode = 'choose'; this.t = 0; this.theta = 0; this.tv = 0; this.target = 0; this.choice = null;
    this.uni.mode.value = 0;
    this.judge.visible = true; this.heaven.visible = false; this.hell.visible = false; this.disk.visible = true; this.floor.visible = true; this.floor.position.y = 0;
    this.hint.mesh.visible = false; this.tip.mesh.visible = true;
    for (const p of this.pans) { for (const o of p.orbs) p.g.remove(o); p.orbs = []; p.glow.material.opacity = 0; }
    this.counts = [0, 0];
    this.flash.visible = true; this.flash.material.color.setHex(0xffffff); this.flash.material.opacity = 1; this.flashFade = 2.2;
  }
  stop() { this.root.visible = false; this.flash.visible = false; this.mode = 'off'; }
  // side: -1 lewa szala (niebo), +1 prawa (piekło)
  click(side) {
    if (this.mode !== 'choose') return false;
    const i = side < 0 ? 0 : 1, p = this.pans[i];
    this.counts[i]++;
    this.target = THREE.MathUtils.clamp((this.counts[0] - this.counts[1]) * STEP, -0.7, 0.7);
    this.tv += -side * 0.9;
    if (p.orbs.length < 40) {
      const o = new THREE.Mesh(this.orbGeo, this.orbMat[i]);
      const n = p.orbs.length, a = n * 2.4, r = 0.03 + (n % 7) * 0.012;
      o.position.set(Math.cos(a) * r, 0.04 + Math.floor(n / 7) * 0.03, Math.sin(a) * r);
      p.g.add(o); p.orbs.push(o);
    }
    return true;
  }
  update(dt, head, scale) {
    if (this.mode === 'off') return null;
    this.t += dt; this.time += dt; this.uni.time.value = this.time;
    // błysk wygasa
    if (this.flashFade > 0) { this.flashFade -= dt; this.flash.material.opacity = Math.min(1, Math.max(0, this.flashFade / 1.6)); if (this.flashFade <= 0) this.flash.visible = false; }
    if (this.mode === 'choose') {
      // sprężyste wahanie belki
      this.tv += (40 * (this.target - this.theta) - 5 * this.tv) * dt;
      this.theta += this.tv * dt;
      this.beam.rotation.z = this.theta;
      const c = Math.cos(this.theta), s = Math.sin(this.theta);
      for (const p of this.pans) {
        const ex = p.sgn * 0.46 * c, ey = 1.15 + p.sgn * 0.46 * s;
        p.g.position.set(ex, ey - 0.42, 0);
        const pts = p.chain.geometry.attributes.position;
        [[0.13, 0], [-0.065, 0.11], [-0.065, -0.11]].forEach(([x, z], k) => { pts.setXYZ(k * 2, ex, ey, 0); pts.setXYZ(k * 2 + 1, ex + x, ey - 0.42 + 0.07, z); });
        pts.needsUpdate = true;
        p.glow.material.opacity = Math.min(1, this.counts[p.sgn < 0 ? 0 : 1] * 0.08);
      }
      if (Math.abs(this.target) >= TIP && Math.abs(this.theta) >= TIP * 0.92) {
        this.choice = this.target > 0 ? 'heaven' : 'hell';
        this.mode = 'flash'; this.t = 0;
        this.flash.visible = true; this.flash.material.color.setHex(this.choice === 'heaven' ? 0xffffff : 0xff5a10); this.flash.material.opacity = 0; this.flashFade = 0;
      }
      this.gateFire.update(dt, scale);
      this.hellLight.intensity = 6 * (0.8 + 0.2 * Math.sin(this.time * 13) * Math.sin(this.time * 5.3));
    } else if (this.mode === 'flash') {
      this.flash.material.opacity = Math.min(1, this.t / 0.25);
      if (this.t > 0.45) {
        const heaven = this.choice === 'heaven';
        this.judge.visible = false; this.tip.mesh.visible = false;
        this.heaven.visible = heaven; this.hell.visible = !heaven;
        this.uni.mode.value = heaven ? 1 : 2;
        this.disk.visible = false;
        this.floor.position.y = heaven ? -1.2 : 0;
        this.hemi.color.setHex(heaven ? 0xffffff : 0xff6a3a); this.hemi.groundColor.setHex(heaven ? 0xd8e0ff : 0x401008);
        this.hemi.intensity = heaven ? 2.2 : 1.0;
        this.mode = this.choice; this.t = 0; this.flashFade = 2.2;
      }
    } else if (this.mode === 'heaven') {
      for (const c of this.clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 45) c.position.x = -45; }
      const a = this.motes.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * 0.12; if (y > 6) y = 0; a.setY(i, y); }
      a.needsUpdate = true;
    } else if (this.mode === 'hell') {
      this.hellFire.update(dt, scale);
      this.hellLights.forEach((l, k) => { l.intensity = 4 * (0.7 + 0.3 * Math.sin(this.time * (9 + k * 3)) * Math.sin(this.time * (4 + k))); });
    }
    const dest = this.mode === 'heaven' || this.mode === 'hell';
    if (dest && this.t > 8 && !this.hint.mesh.visible) {
      const cam = this.camera, p = cam.getWorldPosition(new THREE.Vector3());
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion())); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
      const w = p.clone().addScaledVector(f, 1.8); w.y -= 0.35;
      this.hint.mesh.position.copy(this.root.worldToLocal(w));
      this.hint.mesh.lookAt(p); this.hint.mesh.visible = true;
    }
    return { mode: this.mode, canRestart: dest && this.t > 8, choice: this.choice, tilt: this.theta };
  }
}
