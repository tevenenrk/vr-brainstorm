import * as THREE from 'three';
import { mulberry32 } from '../terrain.js';

// Makieta 40 × 40 km (1:20 000 -> 2 m na stole) z miastem pośrodku.
export const SIZE = 40000;
export const MAP_SCALE = 1 / 20000;
export const RES = 200;
const DX = SIZE / RES;
export const BASE_Y = -400;

function makeNoise(seed) {
  const rng = mulberry32(seed), v = new Float32Array(65536);
  for (let i = 0; i < v.length; i++) v[i] = rng() * 2 - 1;
  const at = (i, j) => v[((j & 255) << 8) | (i & 255)];
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
}
const fbm = (n, x, y, o) => { let a = 1, f = 1, s = 0, t = 0; for (let k = 0; k < o; k++) { s += a * n(x * f, y * f); t += a; a *= 0.5; f *= 2.1; } return s / t; };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const riverX = (z) => 2200 * Math.sin(z / 7000 + 0.6) + 700 * Math.sin(z / 2300);
const coastX = (z) => 13500 + 1500 * Math.sin(z / 6000);

export class NukeWorld {
  constructor() {
    this.n1 = makeNoise(21); this.n2 = makeNoise(22);
    this.N = RES + 1;
    this.h = new Float32Array(this.N * this.N);
    for (let j = 0; j < this.N; j++) for (let i = 0; i < this.N; i++) this.h[j * this.N + i] = this.gen(-SIZE / 2 + i * DX, -SIZE / 2 + j * DX);
    this.group = new THREE.Group();
    this.buildTerrain();
    this.buildCity();
  }

  gen(x, z) {
    let h = 40 + fbm(this.n1, x / 9000 + 3, z / 9000, 5) * 160 + fbm(this.n2, x / 2500, z / 2500, 3) * 30;
    h = Math.max(h, 8);
    const city = 1 - sm(4000, 9000, Math.hypot(x, z));
    h = h * (1 - city * 0.7) + 25 * city * 0.7;
    const dr = Math.abs(x - riverX(z));
    h = h * sm(120, 700, dr) + (-6) * (1 - sm(120, 700, dr));
    const xc = coastX(z);
    if (x > xc - 1500) h = h * (1 - sm(xc - 1500, xc, x)) + 3 * sm(xc - 1500, xc, x);
    if (x > xc) h = 3 - (x - xc) * 0.05;
    return h;
  }

  heightAt(x, z) {
    let fx = (x + SIZE / 2) / DX, fz = (z + SIZE / 2) / DX;
    fx = Math.min(RES - 1e-4, Math.max(0, fx)); fz = Math.min(RES - 1e-4, Math.max(0, fz));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, H = this.h, n = this.N;
    const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
  surfaceAt(x, z) { return Math.max(0, this.heightAt(x, z)); }

  raycast(o, d) {
    let t0 = 0, t1 = 1e7;
    for (const [oo, dd, lo, hi] of [[o.x, d.x, -SIZE / 2, SIZE / 2], [o.y, d.y, BASE_Y, 60000], [o.z, d.z, -SIZE / 2, SIZE / 2]]) {
      if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return null; continue; }
      let a = (lo - oo) / dd, b = (hi - oo) / dd; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (t1 < t0) return null;
    const step = 60;
    let prev = t0;
    for (let t = t0; t <= t1 + step; t += step) {
      const tt = Math.min(t, t1);
      if (o.y + d.y * tt <= this.surfaceAt(o.x + d.x * tt, o.z + d.z * tt)) {
        let a = prev, b = tt;
        for (let k = 0; k < 14; k++) { const m = (a + b) / 2; if (o.y + d.y * m <= this.surfaceAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
        const x = o.x + d.x * b, z = o.z + d.z * b;
        return new THREE.Vector3(x, this.surfaceAt(x, z), z);
      }
      prev = tt;
      if (tt >= t1) break;
    }
    return null;
  }

  buildTerrain() {
    const N = this.N, pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3);
    const c = new THREE.Color(), t = new THREE.Color();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, x = -SIZE / 2 + i * DX, z = -SIZE / 2 + j * DX, h = this.h[k];
      pos[k * 3] = x; pos[k * 3 + 1] = Math.max(h, -6); pos[k * 3 + 2] = z;
      if (h < 0.5) c.setRGB(0.3, 0.33, 0.28);
      else {
        c.setRGB(0.42, 0.55, 0.28).lerp(t.setRGB(0.58, 0.6, 0.34), sm(-0.4, 0.4, fbm(this.n2, x / 3000, z / 3000, 3)));
        const id = ((Math.floor(x / 900) * 73856093) ^ (Math.floor(z / 700) * 19349663)) >>> 0;
        const pal = [[0.72, 0.64, 0.32], [0.5, 0.42, 0.28], [0.42, 0.58, 0.25], [0.62, 0.6, 0.3]];
        c.lerp(t.setRGB(...pal[id % 4]), 0.45);
        if (fbm(this.n1, x / 4000 + 9, z / 4000, 3) > 0.15) c.lerp(t.setRGB(0.2, 0.34, 0.16), 0.8);
        const r = Math.hypot(x, z);
        c.lerp(t.setRGB(0.55, 0.55, 0.54), (1 - sm(3000, 7500, r)) * 0.85);
        if (h > 150) c.lerp(t.setRGB(0.5, 0.48, 0.42), sm(150, 220, h) * 0.5);
        if (x > coastX(z) - 200) c.setRGB(0.84, 0.78, 0.58);
      }
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    const idx = [];
    for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) { const a = j * N + i, b = a + 1, cc = a + N, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    this.baseCol = col.slice();
    this.terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.terrain.receiveShadow = true;
    this.group.add(this.terrain);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x2f6f99, transparent: true, opacity: 0.85, shininess: 60 }));
    water.position.y = 0; this.group.add(water);
    // bryła makiety
    const slab = new THREE.Mesh(new THREE.BoxGeometry(SIZE + 600, 300, SIZE + 600), new THREE.MeshLambertMaterial({ color: 0x2b3036 }));
    slab.position.y = BASE_Y; this.group.add(slab);
    const sideMat = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
    for (const [w, d, x, z] of [[SIZE, 20, 0, SIZE / 2], [SIZE, 20, 0, -SIZE / 2], [20, SIZE, SIZE / 2, 0], [20, SIZE, -SIZE / 2, 0]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, -BASE_Y, d), sideMat); m.position.set(x, BASE_Y / 2, z); this.group.add(m);
    }
    this.glowMaterial = new THREE.MeshBasicMaterial({ color: 0xff7040, toneMapped: false });
    const rim = new THREE.Mesh(new THREE.BoxGeometry(SIZE + 700, 60, SIZE + 700), this.glowMaterial);
    rim.position.y = BASE_Y - 180; this.group.add(rim);
  }

  buildCity() {
    const rng = mulberry32(5);
    const B = [];
    const step = 170;
    for (let z = -8000; z <= 8000; z += step) for (let x = -8000; x <= 8000; x += step) {
      const r = Math.hypot(x, z) * (1 + fbm(this.n2, x / 3000, z / 3000, 2) * 0.5);
      if (r > 7200) continue;
      if (Math.abs(x - riverX(z)) < 260 || this.heightAt(x, z) < 1) continue;
      if (x % 1020 === 0 || z % 1020 === 0) continue; // główne aleje
      const p = r < 1400 ? 1 : r < 3500 ? 0.85 : 0.55 * (1 - r / 7200) + 0.2;
      if (rng() > p) continue;
      const sub = r < 1400 ? 2 : 1;
      for (let a = 0; a < sub; a++) for (let b = 0; b < sub; b++) {
        const s = step / sub;
        const bx = x + (a - (sub - 1) / 2) * s + (rng() - 0.5) * 10, bz = z + (b - (sub - 1) / 2) * s + (rng() - 0.5) * 10;
        let h, w;
        if (r < 1400) { h = 40 + rng() * 220 * (1 - r / 1600); w = s * (0.55 + rng() * 0.25); }
        else if (r < 3500) { h = 12 + rng() * 30; w = s * (0.5 + rng() * 0.3); }
        else { h = 6 + rng() * 6; w = s * (0.3 + rng() * 0.25); }
        const col = r < 1400 ? new THREE.Color().setHSL(0.58, 0.08 + rng() * 0.1, 0.55 + rng() * 0.2) : new THREE.Color().setHSL(0.08 + rng() * 0.05, 0.15 + rng() * 0.2, 0.6 + rng() * 0.2);
        B.push({ x: bx, z: bz, y: this.heightAt(bx, bz) - 1, w, d: w * (0.7 + rng() * 0.6), h, r: rng() * 0.3, col, state: 0, burnt: false });
      }
    }
    this.buildings = B;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial(), B.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.city = mesh;
    B.forEach((b, i) => { b.i = i; this.placeBuilding(b); });
    mesh.computeBoundingSphere();
    this.group.add(mesh);
  }

  placeBuilding(b) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    const sy = [1, 1, 0.22, 0.04][b.state];
    q.setFromEuler(new THREE.Euler(b.state === 2 ? 0.15 : 0, b.r, b.state === 2 ? 0.2 : 0));
    m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.w * (b.state === 3 ? 1.4 : 1), Math.max(1, b.h * sy), b.d * (b.state === 3 ? 1.4 : 1)));
    this.city.setMatrixAt(b.i, m);
    const c = b.col.clone();
    if (b.state === 1) c.multiplyScalar(0.8);
    if (b.state >= 2) c.lerp(new THREE.Color(0.38, 0.33, 0.28), 0.8);
    if (b.burnt) c.lerp(new THREE.Color(0.08, 0.07, 0.06), b.state >= 2 ? 0.85 : 0.6);
    this.city.setColorAt(b.i, c);
  }

  reset() {
    for (const b of this.buildings) { b.state = 0; b.burnt = false; this.placeBuilding(b); }
    this.city.instanceMatrix.needsUpdate = true; this.city.instanceColor.needsUpdate = true;
    this.terrain.geometry.attributes.color.array.set(this.baseCol);
    this.terrain.geometry.attributes.color.needsUpdate = true;
  }

  // osmalenie terenu wokół punktu zero
  scorch(x, z, r, k = 0.6) {
    const col = this.terrain.geometry.attributes.color.array, pos = this.terrain.geometry.attributes.position.array;
    for (let i = 0; i < this.N * this.N; i++) {
      const d = Math.hypot(pos[i * 3] - x, pos[i * 3 + 2] - z) / r;
      if (d >= 1) continue;
      const f = (1 - d * d) * k;
      col[i * 3] += (0.12 - col[i * 3]) * f; col[i * 3 + 1] += (0.1 - col[i * 3 + 1]) * f; col[i * 3 + 2] += (0.08 - col[i * 3 + 2]) * f;
    }
    this.terrain.geometry.attributes.color.needsUpdate = true;
  }
}
