import * as THREE from 'three';
import { CW, CH } from './city.js';

const G = 9.81;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color();

// ---------- odłamki, gruz, samochody (proste bryły z obrotem, lądują na gruncie/stropach) ----------
export class Bodies {
  constructor(parent, city, geo, cap, mat) {
    this.city = city; this.cap = cap;
    this.mesh = new THREE.InstancedMesh(geo, mat || new THREE.MeshLambertMaterial({ color: 0xffffff }), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.setColorAt(0, new THREE.Color()); this.mesh.frustumCulled = false; this.mesh.count = 0;
    parent.add(this.mesh);
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3); this.w = new Float32Array(cap * 3);
    this.q = new Float32Array(cap * 4); this.s = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3);
    this.state = new Int8Array(cap).fill(-1);      // -1 wolny, 0 w ruchu, 1 śpi, 2 trzymany
    this.kind = new Uint8Array(cap); this.life = new Float32Array(cap); this.mass = new Float32Array(cap); this.age = new Float32Array(cap);
    this.hi = 0; this.ring = 0; this.onLand = null; this.onHit = null; this.squash = new Float32Array(cap).fill(1);
  }
  clear() { this.state.fill(-1); this.hi = 0; this.mesh.count = 0; }
  alloc() {
    for (let k = 0; k < this.cap; k++) { const i = (this.ring + k) % this.cap; if (this.state[i] === -1) { this.ring = (i + 1) % this.cap; return i; } }
    // brak miejsca: najstarszy śpiący
    let best = -1, ba = -1;
    for (let i = 0; i < this.cap; i++) if (this.state[i] === 1 && this.age[i] > ba) { ba = this.age[i]; best = i; }
    return best;
  }
  spawn(o) {
    const i = this.alloc(); if (i < 0) return -1;
    this.p.set([o.p.x, o.p.y, o.p.z], i * 3); this.v.set(o.v ? [o.v.x, o.v.y, o.v.z] : [0, 0, 0], i * 3);
    this.w.set(o.w || [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6], i * 3);
    const qq = o.q || _q.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    this.q.set([qq.x, qq.y, qq.z, qq.w], i * 4);
    this.s.set(o.s, i * 3);
    _c.set(o.color ?? 0x888888); this.col.set([_c.r, _c.g, _c.b], i * 3);
    this.state[i] = o.sleep ? 1 : 0; this.kind[i] = o.kind || 0; this.life[i] = o.life ?? 1e9; this.age[i] = 0; this.squash[i] = 1;
    this.mass[i] = o.mass ?? o.s[0] * o.s[1] * o.s[2] / (CW * CH * CW);
    if (i >= this.hi) this.hi = i + 1;
    return i;
  }
  pos(i, out = new THREE.Vector3()) { return out.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]); }
  vel(i, out = new THREE.Vector3()) { return out.set(this.v[i * 3], this.v[i * 3 + 1], this.v[i * 3 + 2]); }
  setVel(i, v) { this.v[i * 3] = v.x; this.v[i * 3 + 1] = v.y; this.v[i * 3 + 2] = v.z; if (this.state[i] === 1) this.state[i] = 0; }
  // pchnięcie wszystkiego w kuli (dłoń, stopa, ogon)
  push(c, r, vel, gain = 0.9) {
    let n = 0; const sp = vel.length();
    for (let i = 0; i < this.hi; i++) {
      if (this.state[i] < 0 || this.state[i] === 2) continue;
      const dx = this.p[i * 3] - c.x, dy = this.p[i * 3 + 1] - c.y, dz = this.p[i * 3 + 2] - c.z, rr = r + this.s[i * 3] * 0.5;
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      this.v[i * 3] = vel.x * gain + (dx / d) * sp * 0.3 + (Math.random() - 0.5) * sp * 0.15;
      this.v[i * 3 + 1] = Math.max(vel.y * gain, 0) + sp * (0.15 + Math.random() * 0.2);
      this.v[i * 3 + 2] = vel.z * gain + (dz / d) * sp * 0.3 + (Math.random() - 0.5) * sp * 0.15;
      for (let k = 0; k < 3; k++) this.w[i * 3 + k] = (Math.random() - 0.5) * 8;
      this.state[i] = 0; n++;
    }
    return n;
  }
  nearest(c, r, minSize = 0) {
    let best = -1, bd = r;
    for (let i = 0; i < this.hi; i++) {
      if (this.state[i] < 0 || this.state[i] === 2 || this.s[i * 3] < minSize) continue;
      const d = Math.hypot(this.p[i * 3] - c.x, this.p[i * 3 + 1] - c.y, this.p[i * 3 + 2] - c.z) - this.s[i * 3] * 0.4;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  update(dt) {
    const C = this.city;
    for (let i = 0; i < this.hi; i++) {
      const st = this.state[i]; if (st < 0) continue;
      this.age[i] += dt;
      if (this.life[i] < 1e8) { this.life[i] -= dt; if (this.life[i] <= 0) { this.state[i] = -1; continue; } }
      if (st !== 0) continue;
      const k3 = i * 3;
      this.v[k3 + 1] -= G * dt;
      const ox = this.p[k3], oy = this.p[k3 + 1], oz = this.p[k3 + 2];
      const vx = this.v[k3], vy = this.v[k3 + 1], vz = this.v[k3 + 2], sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const steps = Math.min(6, Math.max(1, Math.ceil(sp * dt / 2)));
      const hh = Math.max(this.s[k3 + 1], Math.min(this.s[k3], this.s[k3 + 2])) * 0.42 * this.squash[i];
      for (let s = 0; s < steps; s++) {
        const h = dt / steps;
        let nx = this.p[k3] + this.v[k3] * h, ny = this.p[k3 + 1] + this.v[k3 + 1] * h, nz = this.p[k3 + 2] + this.v[k3 + 2] * h;
        // ciężkie rzucone przedmioty uderzają w budynki
        if (this.mass[i] > 0.25 && sp > 14) {
          const id = C.staticAt(nx, ny, nz);
          if (id >= 0) {
            if (this.onHit) this.onHit(i, id, sp);
            this.v[k3] *= 0.35; this.v[k3 + 1] *= 0.35; this.v[k3 + 2] *= 0.35;
            nx = this.p[k3]; nz = this.p[k3 + 2];
          }
        } else if (C.staticAt(nx, ny, nz) >= 0 && C.staticAt(this.p[k3], ny, this.p[k3 + 2]) < 0) { this.v[k3] *= -0.25; this.v[k3 + 2] *= -0.25; nx = this.p[k3]; nz = this.p[k3 + 2]; }
        const f = C.floorAt(nx, this.p[k3 + 1] + 0.3, nz) + hh;
        if (ny < f) {
          ny = f;
          const impact = -this.v[k3 + 1];
          if (impact > 3 && this.onLand) this.onLand(i, impact);
          this.v[k3 + 1] = impact > 2 ? impact * 0.22 : 0;
          this.v[k3] *= 0.55; this.v[k3 + 2] *= 0.55;
          for (let k = 0; k < 3; k++) this.w[k3 + k] *= 0.55;
        }
        this.p[k3] = nx; this.p[k3 + 1] = ny; this.p[k3 + 2] = nz;
      }
      // obrót
      const wx = this.w[k3], wy = this.w[k3 + 1], wz = this.w[k3 + 2], wl = Math.sqrt(wx * wx + wy * wy + wz * wz);
      if (wl > 1e-3) {
        _q.setFromAxisAngle(_v.set(wx / wl, wy / wl, wz / wl), wl * dt);
        const a = new THREE.Quaternion(this.q[i * 4], this.q[i * 4 + 1], this.q[i * 4 + 2], this.q[i * 4 + 3]).premultiply(_q);
        this.q[i * 4] = a.x; this.q[i * 4 + 1] = a.y; this.q[i * 4 + 2] = a.z; this.q[i * 4 + 3] = a.w;
      }
      // uśpienie: leży i prawie się nie rusza
      const moved = Math.abs(this.p[k3] - ox) + Math.abs(this.p[k3 + 1] - oy) + Math.abs(this.p[k3 + 2] - oz);
      if (moved < 0.02 && Math.abs(this.v[k3 + 1]) < 0.5 && this.age[i] > 0.3) {
        this.state[i] = 1;
        if (this.kind[i] === 0 && this.life[i] > 1e8) C.addRubble(this.p[k3], this.p[k3 + 2], this.s[k3] * this.s[k3 + 1] * this.s[k3 + 2]);
      }
    }
  }
  render() {
    let top = 0;
    for (let i = 0; i < this.hi; i++) {
      if (this.state[i] < 0) { this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      top = i + 1;
      _q.set(this.q[i * 4], this.q[i * 4 + 1], this.q[i * 4 + 2], this.q[i * 4 + 3]);
      _s.set(this.s[i * 3], this.s[i * 3 + 1] * this.squash[i], this.s[i * 3 + 2]);
      if (this.life[i] < 0.6) _s.multiplyScalar(Math.max(0.01, this.life[i] / 0.6));
      _m.compose(_v.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]), _q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.setRGB(this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]));
    }
    this.hi = top; this.mesh.count = top;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  active() { let n = 0; for (let i = 0; i < this.hi; i++) if (this.state[i] >= 0) n++; return n; }
}

// ---------- pył (miękkie billboardy, jeden draw call) ----------
function puffTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  for (let k = 0; k < 16; k++) { const x = 64 + (Math.random() - 0.5) * 56, y = 64 + (Math.random() - 0.5) * 56, r = 20 + Math.random() * 26; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }
  c.globalCompositeOperation = 'destination-in';
  const e = c.createRadialGradient(64, 64, 18, 64, 64, 64); e.addColorStop(0, '#000'); e.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = e; c.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}
export class Dust {
  constructor(scene, cap = 1600) {
    this.cap = cap; this.n = 0;
    const base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
    this.a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.b = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('pa', this.a); geo.setAttribute('pb', this.b); geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: puffTex() }, fogCol: { value: scene.fog.color }, fogD: { value: scene.fog.density }, invS: { value: 1 } },
      vertexShader: `uniform float fogD; uniform float invS; attribute vec4 pa; attribute vec4 pb; varying vec2 vUv; varying vec4 vC; varying float vFog;
        void main(){ vec4 mv = modelViewMatrix * vec4(pa.xyz, 1.0); float c = cos(pb.w), s = sin(pb.w);
          mv.xy += vec2(position.x * c - position.y * s, position.x * s + position.y * c) * pa.w * invS;     // widok jest w skali gracza
          gl_Position = projectionMatrix * mv; vUv = uv; float d = -mv.z; vFog = 1.0 - exp(-fogD * fogD * d * d);
          vC = vec4(pb.x, 0.0, 0.0, pb.y); }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 fogCol; varying vec2 vUv; varying vec4 vC; varying float vFog;
        void main(){ vec4 t = texture2D(map, vUv); float a = t.a * vC.a; if (a < 0.004) discard; gl_FragColor = vec4(mix(vec3(vC.x) * vec3(1.0, 0.96, 0.9), fogCol, vFog), a); }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 10;
    scene.add(this.mesh);
    this.list = [];
  }
  clear() { this.list.length = 0; }
  // jasność 0..1, rozmiar startowy/końcowy (m), czas życia
  spawn(p, v, s0, s1, life, bright = 0.62, alpha = 0.7) {
    if (this.list.length >= this.cap) this.list.shift();
    this.list.push({ x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, s0, s1, life, t: 0, br: bright, al: alpha, rot: Math.random() * 6, sp: (Math.random() - 0.5) * 0.4 });
  }
  update(dt) {
    const A = this.a.array, Bb = this.b.array;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i]; d.t += dt;
      if (d.t >= d.life) { this.list.splice(i, 1); continue; }
      const k = Math.exp(-dt * 0.9);
      d.vx *= k; d.vy = d.vy * k + 0.1 * dt; d.vz *= k;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rot += d.sp * dt;
    }
    for (const d of this.list) {
      const u = d.t / d.life, s = d.s0 + (d.s1 - d.s0) * (1 - (1 - u) ** 2);
      A[n * 4] = d.x; A[n * 4 + 1] = d.y; A[n * 4 + 2] = d.z; A[n * 4 + 3] = s;
      Bb[n * 4] = d.br; Bb[n * 4 + 1] = d.al * Math.min(1, u * 8) * (1 - u) ** 1.3; Bb[n * 4 + 2] = 0; Bb[n * 4 + 3] = d.rot;
      n++;
    }
    this.mesh.geometry.instanceCount = n;
    this.a.needsUpdate = true; this.b.needsUpdate = true;
  }
}

// ---------- bryły, które straciły podparcie: bryła sztywna z kontaktami kulowymi ----------
const RS = 1.75;           // promień kuli kontaktowej segmentu
const CRUSH_V = 3.2, CRUSH_K = 0.55;
export class Clusters {
  constructor(city) { this.city = city; this.list = []; this.nextId = 0; this.onImpact = null; this.onBreakOff = null; this.onSettle = null; }
  clear() { this.list.length = 0; }
  create(b, ids, pivot) {
    const C = this.city, n = ids.length;
    const com = new THREE.Vector3();
    for (const id of ids) com.x += C.cpos[id * 3], com.y += C.cpos[id * 3 + 1], com.z += C.cpos[id * 3 + 2];
    com.divideScalar(n);
    const off = new Float32Array(n * 3), I = new THREE.Matrix3(), e = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const box = (CW * CW + CH * CH) / 12;
    ids.forEach((id, k) => {
      const x = C.cpos[id * 3] - com.x, y = C.cpos[id * 3 + 1] - com.y, z = C.cpos[id * 3 + 2] - com.z;
      off[k * 3] = x; off[k * 3 + 1] = y; off[k * 3 + 2] = z;
      e[0] += y * y + z * z + box; e[4] += x * x + z * z + box; e[8] += x * x + y * y + box;
      e[1] -= x * y; e[3] -= x * y; e[2] -= x * z; e[6] -= x * z; e[5] -= y * z; e[7] -= y * z;
    });
    I.fromArray(e);
    const Iinv = I.clone().invert();
    const cl = { id: this.nextId++, b, ids: ids.slice(), alive: new Uint8Array(n).fill(1), off, pos: com, q: new THREE.Quaternion(), v: new THREE.Vector3(0, -0.4, 0), w: new THREE.Vector3(), mass: n * b.T.density, Iinv, sleepT: 0, asleep: false, age: 0, m: new THREE.Matrix4(), nAlive: n };
    // przechył: obrót wokół miejsca, gdzie ostatnio miała podparcie
    if (pivot) {
      const arm = com.clone().sub(pivot); arm.y = 0;
      const L = arm.length();
      if (L > 0.5) cl.w.copy(arm.clone().cross(new THREE.Vector3(0, -1, 0)).normalize().multiplyScalar(Math.min(0.5, 0.06 + L * 0.03)));      // środek ciężkości opada na stronę bez podpór
    }
    for (const id of ids) { C.st[id] = 1; C.clusterOf[id] = cl.id; }
    this.list.push(cl);
    this.place(cl);
    return cl;
  }
  place(cl) {
    const C = this.city, M = _m;
    cl.m.compose(cl.pos, cl.q, _s.set(1, 1, 1));
    for (let k = 0; k < cl.ids.length; k++) {
      if (!cl.alive[k]) continue;
      const id = cl.ids[k];
      if (C.st[id] === 2) { cl.alive[k] = 0; cl.nAlive--; continue; }
      M.makeTranslation(cl.off[k * 3], cl.off[k * 3 + 1], cl.off[k * 3 + 2]).premultiply(cl.m);
      C.setClusterMatrix(id, M);
    }
  }
  worldOf(cl, k, out) { return out.set(cl.off[k * 3], cl.off[k * 3 + 1], cl.off[k * 3 + 2]).applyQuaternion(cl.q).add(cl.pos); }
  // uderzenie w bryłę z zewnątrz (dłoń, ogon): pęd + obrażenia
  hit(cl, k, point, vel, E, dir) {
    const C = this.city, id = cl.ids[k];
    if (cl.asleep && E > 30) { cl.asleep = false; cl.sleepT = 0; for (let j = 0; j < cl.ids.length; j++) if (cl.alive[j]) C.st[cl.ids[j]] = 1; }
    if (!cl.asleep) {
      const r = point.clone().sub(cl.pos), J = vel.clone().multiplyScalar(Math.min(6, E / 60));
      cl.v.addScaledVector(J, 1 / cl.mass);
      cl.w.add(r.cross(J).applyMatrix3(this.worldIinv(cl)));
    }
    C.impact(id, E, dir, 'hit');
  }
  worldIinv(cl) {
    const R = new THREE.Matrix3().setFromMatrix4(_m.makeRotationFromQuaternion(cl.q));
    return R.clone().multiply(cl.Iinv).multiply(R.transpose());
  }
  update(dt) {
    const C = this.city, SUB = 3, h = dt / SUB;
    for (let ci = this.list.length - 1; ci >= 0; ci--) {
      const cl = this.list[ci];
      if (cl.nAlive <= 0) { this.list.splice(ci, 1); continue; }
      if (cl.asleep) continue;
      cl.age += dt;
      let contacts = 0;
      for (let s = 0; s < SUB; s++) {
        cl.v.y -= G * h;
        cl.pos.addScaledVector(cl.v, h);
        const wl = cl.w.length();
        if (wl > 1e-5) cl.q.premultiply(_q.setFromAxisAngle(_v.copy(cl.w).divideScalar(wl), wl * h)).normalize();
        const Iw = this.worldIinv(cl);
        const list = [];
        const c = new THREE.Vector3();
        for (let k = 0; k < cl.ids.length; k++) {
          if (!cl.alive[k]) continue;
          if (C.st[cl.ids[k]] === 2) { cl.alive[k] = 0; cl.nAlive--; continue; }
          this.worldOf(cl, k, c);
          const g = C.groundAt(c.x, c.z);
          if (c.y - RS < g) list.push(k, -1, c.x, g, c.z, 0, 1, 0, g - (c.y - RS));
          const hits = C.sphere(c, RS, this._sp || (this._sp = []));
          for (let j = 0; j < hits.length; j += 5) {
            const d = hits[j + 4];
            let nx = c.x - hits[j + 1], ny = c.y - hits[j + 2], nz = c.z - hits[j + 3];
            if (d < 1e-3) { nx = 0; ny = 1; nz = 0; } else { nx /= d; ny /= d; nz /= d; }
            list.push(k, hits[j], hits[j + 1], hits[j + 2], hits[j + 3], nx, ny, nz, RS - d);
          }
        }
        const nC = list.length / 9; contacts += nC;
        if (!nC) continue;
        const r = new THREE.Vector3(), n = new THREE.Vector3(), vp = new THREE.Vector3(), tmp = new THREE.Vector3();
        let corr = 0;
        for (let j = 0; j < list.length; j += 9) {
          const k = list[j], sid = list[j + 1];
          if (!cl.alive[k]) continue;
          r.set(list[j + 2], list[j + 3], list[j + 4]).sub(cl.pos);
          n.set(list[j + 5], list[j + 6], list[j + 7]);
          vp.copy(cl.w).cross(r).add(cl.v);
          const vn = vp.dot(n);
          if (vn < 0) {
            // zgniatanie: to, w co bryła uderza, i jej własny segment
            if (vn < -CRUSH_V) {
              const E = 0.5 * Math.min(cl.mass, 3 + cl.mass / Math.max(1, nC)) * vn * vn * CRUSH_K;
              const dir = n.clone().negate();
              if (sid >= 0) C.impact(sid, E, dir, 'crush');
              const self = C.damageChunk(cl.ids[k], E * (sid >= 0 ? 0.55 : 0.8), n);
              if (self) { cl.alive[k] = 0; cl.nAlive--; }
              if (this.onImpact) this.onImpact(tmp.set(list[j + 2], list[j + 3], list[j + 4]), -vn, sid, cl);
            }
            const rn = tmp.copy(r).cross(n).applyMatrix3(Iw).cross(r);
            const denom = 1 / cl.mass + n.dot(rn);
            const jn = -(1.08) * vn / denom / Math.max(1, nC * 0.35);
            cl.v.addScaledVector(n, jn / cl.mass);
            cl.w.add(tmp.copy(r).cross(n).multiplyScalar(jn).applyMatrix3(Iw));
            // tarcie
            vp.copy(cl.w).cross(r).add(cl.v);
            const vt = vp.sub(n.clone().multiplyScalar(vp.dot(n)));
            const vtl = vt.length();
            if (vtl > 1e-3) {
              const jt = Math.min(0.6 * jn, vtl / denom);
              vt.divideScalar(vtl).multiplyScalar(-jt);
              cl.v.addScaledVector(vt, 1 / cl.mass);
              cl.w.add(tmp.copy(r).cross(vt).applyMatrix3(Iw));
            }
          }
          corr = Math.max(corr, list[j + 8]);
        }
        // wypchnięcie z przenikania (średni kierunek)
        if (corr > 0) {
          const avg = new THREE.Vector3();
          for (let j = 0; j < list.length; j += 9) avg.x += list[j + 5] * list[j + 8], avg.y += list[j + 6] * list[j + 8], avg.z += list[j + 7] * list[j + 8];
          if (avg.lengthSq() > 1e-8) cl.pos.addScaledVector(avg.normalize(), Math.min(corr, 0.5) * 0.6);
        }
      }
      // kule kontaktowe toczyłyby się bez końca: opór toczenia i tarcie o podłoże przy kontakcie
      if (contacts > 0) { cl.w.multiplyScalar(Math.exp(-dt * 2.2)); cl.v.x *= Math.exp(-dt * 1.2); cl.v.z *= Math.exp(-dt * 1.2); cl.touchT = (cl.touchT || 0) + dt; }
      else cl.w.multiplyScalar(Math.exp(-dt * 0.15));
      this.place(cl);
      // uspokojenie: bryła leży
      if (contacts > 0 && cl.v.length() < 1.2 && cl.w.length() < 0.15) cl.sleepT += dt; else cl.sleepT = 0;
      if (cl.sleepT > 0.6 || (cl.touchT || 0) > 14 || cl.age > 40) {
        cl.asleep = true;
        const c = new THREE.Vector3();
        for (let k = 0; k < cl.ids.length; k++) if (cl.alive[k]) { C.st[cl.ids[k]] = 3; this.worldOf(cl, k, c); C.raiseCol(c.x, c.z, c.y + 1.6); }
        if (this.onSettle) this.onSettle(cl);
      }
    }
  }
  // segmenty brył w kuli (do ciosów)
  sphere(p, r, cb) {
    const c = new THREE.Vector3();
    for (const cl of this.list) {
      if (cl.pos.distanceTo(p) > r + 200) continue;
      for (let k = 0; k < cl.ids.length; k++) {
        if (!cl.alive[k]) continue;
        this.worldOf(cl, k, c);
        if (c.distanceTo(p) < r + RS) cb(cl, k, c);
      }
    }
  }
  moving() { return this.list.filter((c) => !c.asleep).length; }
}
