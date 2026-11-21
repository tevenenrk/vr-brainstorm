import * as THREE from 'three';

// Płonący prostokąt drzwi: maska portalu (stencil) wypalana od środka, żarzący się brzeg,
// ogień wzdłuż ramy (cząsteczki + poświata) i migoczące światło.
const NOISE = `
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int k = 0; k < 4; k++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }`;
// pole wypalania: 0 w środku drzwi, ~1,3 w narożnikach, z poszarpaną krawędzią
const FIELD = `
  float burnField(vec2 uv, vec2 size, float t){
    vec2 p = (uv - 0.5) * size;
    return length(p / (size * 0.55)) * 0.8 + fbm(uv * size * 3.0 + vec2(0.0, -t * 0.25)) * 0.35 - 0.1;
  }`;
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// addytywnie: kolor dodany do obrazu, alfa bez zmian (w MR świeci na obrazie z kamer)
const ADD = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
export const K_FULL = 1.38;

export class FirePortal {
  constructor() {
    this.group = new THREE.Group();
    this.k = 0; this.fire = 0; this.time = 0;
    this.uni = { k: { value: 0 }, fire: { value: 0 }, time: { value: 0 }, size: { value: new THREE.Vector2(1, 2) } };
    this.maskMat = new THREE.ShaderMaterial({
      uniforms: this.uni, vertexShader: VS, colorWrite: false, depthWrite: false, side: THREE.DoubleSide,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
      fragmentShader: `uniform float k, time; uniform vec2 size; varying vec2 vUv; ${NOISE} ${FIELD}
        void main(){ if (burnField(vUv, size, time) > k) discard; gl_FragColor = vec4(0.0); }`,
    });
    this.rimMat = new THREE.ShaderMaterial({
      uniforms: this.uni, vertexShader: VS, ...ADD, side: THREE.DoubleSide,
      fragmentShader: `uniform float k, fire, time; uniform vec2 size; varying vec2 vUv; ${NOISE} ${FIELD}
        void main(){
          float f = burnField(vUv, size, time);
          float e = smoothstep(0.09, 0.0, abs(f - k)) * step(0.005, k) * (1.0 - smoothstep(${(K_FULL - 0.06).toFixed(2)}, ${K_FULL.toFixed(2)}, k));
          float inner = step(f, k) * smoothstep(0.35, 0.0, k - f) * 0.35;
          float fl = 0.7 + 0.6 * fbm(vUv * size * 6.0 + vec2(0.0, -time * 3.0));
          vec3 c = mix(vec3(1.0, 0.25, 0.03), vec3(1.0, 0.85, 0.45), e) * (e * 1.6 + inner) * fl;
          gl_FragColor = vec4(c * min(1.0, fire + 0.2), 0.0);
        }`,
    });
    // poświata ramy: świecący obrys prostokąta, płomienie liżą w górę
    this.frameMat = new THREE.ShaderMaterial({
      uniforms: this.uni, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', ...ADD, side: THREE.DoubleSide,
      fragmentShader: `uniform float fire, time; uniform vec2 size; varying vec3 vP; ${NOISE}
        void main(){
          vec2 q = vec2(vP.x, vP.y - size.y * 0.5);
          vec2 d2 = abs(q) - size * 0.5;
          float sd = length(max(d2, 0.0)) + min(max(d2.x, d2.y), 0.0);
          float n = fbm(vec2(vP.x * 7.0, vP.y * 5.0 - time * 4.0));
          float up = clamp(n * 1.6 - 0.25, 0.0, 1.0);
          float g = exp(-abs(sd) / (0.035 + 0.09 * up * step(0.0, sd)));
          float core = exp(-abs(sd) / 0.012);
          vec3 c = vec3(1.0, 0.32, 0.05) * g * (0.6 + 0.9 * n) + vec3(1.0, 0.8, 0.45) * core * 0.9;
          gl_FragColor = vec4(c * fire, 0.0);
        }`,
    });
    // cząsteczki ognia
    const N = this.N = 900;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3); this.col = new Float32Array(N * 4); this.size = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('col', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.pointsUni = { scale: { value: 800 } };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.pointsUni, ...ADD,
      vertexShader: `attribute float size; attribute vec4 col; uniform float scale; varying vec4 vC;
        void main(){ vC = col; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / max(0.05, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); a *= a; gl_FragColor = vec4(vC.rgb * vC.a * a, 0.0); }`,
    }));
    this.points.frustumCulled = false;
    this.parts = Array.from({ length: N }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0, ember: false }));
    this.light = new THREE.PointLight(0xff6a20, 0, 6, 1.4);
    this.acc = 0;
  }

  build(door) {
    const { w, h } = door;
    for (const c of [...this.group.children]) { this.group.remove(c); if (c !== this.points && c.geometry) c.geometry.dispose(); }
    this.w = w; this.h = h;
    this.uni.size.value.set(w, h);
    this.mask = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0.015), this.maskMat);
    this.mask.renderOrder = -3;
    this.rim = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0.025), this.rimMat);
    this.rim.renderOrder = 20;
    const W = w + 0.6, H = h + 0.45;
    this.frame = new THREE.Mesh(new THREE.PlaneGeometry(W, H).translate(0, H / 2 - 0.03, 0.03), this.frameMat);
    this.frame.renderOrder = 21;
    this.points.renderOrder = 22;
    this.light.position.set(0, h * 0.55, 0.45);
    this.group.add(this.mask, this.rim, this.frame, this.points, this.light);
    for (const p of this.parts) p.life = 0;
    this.set(0, 0);
  }
  set(k, fire) { this.k = k; this.fire = fire; this.uni.k.value = k; this.uni.fire.value = fire; }

  spawn(n) {
    const { w, h } = this, per = 2 * h + 2 * w;
    for (const p of this.parts) {
      if (n <= 0) break;
      if (p.life > 0) continue;
      n--;
      let r = Math.random() * per, x, y;
      if (r < h) { x = -w / 2; y = r; } else if (r < 2 * h) { x = w / 2; y = r - h; } else if (r < 2 * h + w) { x = -w / 2 + (r - 2 * h); y = h; } else { x = -w / 2 + (r - 2 * h - w); y = 0.01; }
      p.ember = Math.random() < 0.08;
      p.x = x + (Math.random() - 0.5) * 0.05; p.y = y; p.z = 0.03 + Math.random() * 0.05;
      p.vx = (Math.random() - 0.5) * (p.ember ? 0.5 : 0.12); p.vy = p.ember ? 0.4 + Math.random() * 0.6 : 0.35 + Math.random() * 0.55; p.vz = Math.random() * (p.ember ? 0.4 : 0.1);
      p.max = p.life = p.ember ? 1.2 + Math.random() * 1.2 : 0.35 + Math.random() * 0.45;
      p.s = p.ember ? 0.014 + Math.random() * 0.012 : 0.07 + Math.random() * 0.1;
    }
  }

  update(dt, scale) {
    this.time += dt;
    this.uni.time.value = this.time;
    this.pointsUni.scale.value = scale;
    const f = this.fire;
    if (f > 0.01) { this.acc += dt * 520 * f; const n = Math.floor(this.acc); this.acc -= n; this.spawn(n); }
    const fl = 0.75 + 0.25 * Math.sin(this.time * 17) * Math.sin(this.time * 6.1 + 1.3);
    this.light.intensity = 3.2 * f * fl;
    let i = 0;
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += dt * (p.ember ? 0.1 : 0.9); p.vx += (Math.random() - 0.5) * dt * 0.8;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const t = 1 - p.life / p.max;
      const k = i * 3, c = i * 4;
      this.pos[k] = p.x; this.pos[k + 1] = p.y; this.pos[k + 2] = p.z;
      if (p.ember) { this.col[c] = 1; this.col[c + 1] = 0.55; this.col[c + 2] = 0.15; this.col[c + 3] = (1 - t) * 1.4; this.size[i] = p.s; }
      else {
        // biało-żółty → pomarańcz → czerwień → zgaśnięcie
        const r = 1, g = t < 0.25 ? 0.85 - t * 1.6 : Math.max(0.12, 0.45 - (t - 0.25) * 0.5), b = t < 0.2 ? 0.45 - t * 2 : 0.04;
        this.col[c] = r; this.col[c + 1] = g; this.col[c + 2] = b; this.col[c + 3] = Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.9;
        this.size[i] = p.s * (0.6 + Math.sin(Math.PI * t) * 0.9);
      }
      i++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, i);
    g.attributes.position.needsUpdate = g.attributes.col.needsUpdate = g.attributes.size.needsUpdate = true;
    this.group.visible = f > 0.001 || this.k > 0.001 || i > 0;
  }
}
