import * as THREE from 'three';

// Zasłony dymne: kanister leci po paraboli, po upadku rośnie chmura, która zasłania widok (także AI).
const PUFFS = 18, MAXC = 10;

function puffTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  for (let k = 0; k < 14; k++) {
    const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 22 + Math.random() * 26;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.32)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  }
  // miękka krawędź całości
  c.globalCompositeOperation = 'destination-in';
  const e = c.createRadialGradient(64, 64, 20, 64, 64, 64); e.addColorStop(0, 'rgba(0,0,0,1)'); e.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = e; c.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

export class Smoke {
  constructor(scene, map) {
    this.map = map; this.clouds = []; this.cans = [];
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
    this.puff = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS * MAXC * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS * MAXC * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('puff', this.puff); geo.setAttribute('alpha', this.alpha);
    geo.instanceCount = 0;
    const fog = scene.fog;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: puffTexture() }, col: { value: new THREE.Color(0xb4b4ac) }, fogCol: { value: fog ? fog.color : new THREE.Color() }, fogD: { value: fog ? fog.density : 0 } },
      vertexShader: `uniform float fogD; attribute vec4 puff; attribute vec2 alpha; varying vec2 vUv; varying float vA; varying float vFog; varying float vShade;
        void main(){
          vec4 mv = modelViewMatrix * vec4(puff.xyz, 1.0);
          float c = cos(alpha.y), s = sin(alpha.y);
          vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
          mv.xy += p * puff.w;
          gl_Position = projectionMatrix * mv;
          vUv = uv; vA = alpha.x; float d = -mv.z; vFog = 1.0 - exp(-fogD * fogD * d * d);
          vShade = 0.8 + 0.2 * position.y;
        }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 col; uniform vec3 fogCol; varying vec2 vUv; varying float vA; varying float vFog; varying float vShade;
        void main(){ vec4 t = texture2D(map, vUv); float a = t.a * vA; if (a < 0.004) discard; gl_FragColor = vec4(mix(col * vShade, fogCol, vFog), a); }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.canGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.13, 8);
    this.canMat = new THREE.MeshLambertMaterial({ color: 0x5a6248 });
    this.parent = scene;
    this.onLand = null;
  }
  clear() { this.clouds = []; for (const c of this.cans) this.parent.remove(c.mesh); this.cans = []; }
  // rzut kanistra z punktu from do celu (y celu liczone z terenu)
  throw(from, target) {
    const ty = this.map.heightAt(target.x, target.z), dx = target.x - from.x, dz = target.z - from.z, dist = Math.hypot(dx, dz);
    const T = 0.6 + dist / 15, dy = ty - from.y;
    const mesh = new THREE.Mesh(this.canGeo, this.canMat); mesh.position.copy(from); this.parent.add(mesh);
    this.cans.push({ mesh, vel: new THREE.Vector3(dx / T, (dy + 0.5 * 9.81 * T * T) / T, dz / T), landed: false, t: 0 });
  }
  add(p) {
    if (this.clouds.length >= MAXC) this.clouds.shift();
    const puffs = [];
    for (let k = 0; k < PUFFS; k++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()); puffs.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: Math.random() * 0.75, s: 0.55 + Math.random() * 0.4, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.3, lag: Math.random() * 2.5 }); }
    this.clouds.push({ p: p.clone(), age: 0, life: 34 + Math.random() * 8, puffs, R: 0, dens: 0 });
  }
  // czy odcinek a→b przechodzi przez gęsty dym
  blocks(a, b) {
    for (const c of this.clouds) {
      if (c.dens < 0.35 || c.R < 1.5) continue;
      const R = c.R * 0.85, cy = c.p.y + c.R * 0.35, sy = 1.6;    // elipsoida spłaszczona w pionie
      const ax = a.x - c.p.x, ay = (a.y - cy) * sy, az = a.z - c.p.z;
      const dx = b.x - a.x, dy = (b.y - a.y) * sy, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy + az * dz) / Math.max(L2, 1e-6)));
      const px = ax + dx * t, py = ay + dy * t, pz = az + dz * t;
      if (px * px + py * py + pz * pz < R * R) return true;
    }
    return false;
  }
  update(dt) {
    for (let i = this.cans.length - 1; i >= 0; i--) {
      const c = this.cans[i]; c.t += dt;
      if (!c.landed) {
        c.vel.y -= 9.81 * dt; c.mesh.position.addScaledVector(c.vel, dt); c.mesh.rotation.x += dt * 9;
        const g = this.map.heightAt(c.mesh.position.x, c.mesh.position.z) + 0.03;
        if (c.mesh.position.y < g && c.vel.y < 0) { c.mesh.position.y = g; c.landed = true; c.mesh.rotation.set(Math.PI / 2, Math.random() * 6, 0); this.add(c.mesh.position); if (this.onLand) this.onLand(c.mesh.position.clone()); }
      } else if (c.t > 45) { this.parent.remove(c.mesh); this.cans.splice(i, 1); }
    }
    let n = 0;
    const P = this.puff.array, A = this.alpha.array;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i]; c.age += dt;
      if (c.age > c.life) { this.clouds.splice(i, 1); continue; }
      c.p.x += 0.35 * dt; c.p.z += 0.08 * dt;                       // wiatr
      c.R = 7.5 * Math.min(1, c.age / 6) ** 0.6 + Math.max(0, c.age - c.life + 8) * 0.3;
      c.dens = Math.min(1, c.age / 1.5) * Math.min(1, (c.life - c.age) / 8);
    }
    for (const c of this.clouds) for (const q of c.puffs) {
      if (n >= PUFFS * MAXC) break;
      const grow = Math.min(1, Math.max(0, (c.age - q.lag * 0.4) / 5));
      if (grow <= 0) continue;
      q.rot += q.spin * dt;
      const R = Math.max(0.6, c.R);
      P[n * 4] = c.p.x + q.x * R * 0.8; P[n * 4 + 1] = c.p.y + 0.3 + q.y * R * 0.7; P[n * 4 + 2] = c.p.z + q.z * R * 0.8; P[n * 4 + 3] = Math.max(0.8, R * q.s * 1.5 * grow);
      A[n * 2] = c.dens * (0.5 + 0.4 * grow); A[n * 2 + 1] = q.rot;
      n++;
    }
    this.mesh.geometry.instanceCount = n;
    this.puff.needsUpdate = true; this.alpha.needsUpdate = true;
  }
}
