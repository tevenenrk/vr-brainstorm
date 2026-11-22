import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../terrain.js';

// Pole bitwy 480 × 640 m (skala 1:400 -> 1,2 × 1,6 m na stole)
export const MW = 480, MD = 640;
export const MAP_SCALE = 1 / 400;
export const UNIT_K = 1.6;          // ludziki i drzewa przesadzone 1,6× (żeby były widoczne na stole)
export const BASE_Y = -14;
const RX = 96, RZ = 128, DX = MW / RX;

function noise(seed) {
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
const POND = { x: 140, z: -60, r: 38 };
const roadX = (z) => -60 + 45 * Math.sin(z / 110);

export class Field {
  constructor(seed = 3) {
    this.n1 = noise(seed); this.n2 = noise(seed + 1);
    this.NX = RX + 1; this.NZ = RZ + 1;
    this.h = new Float32Array(this.NX * this.NZ);
    for (let j = 0; j < this.NZ; j++) for (let i = 0; i < this.NX; i++) this.h[j * this.NX + i] = this.gen(-MW / 2 + i * DX, -MD / 2 + j * DX);
    this.group = new THREE.Group();
    this.build();
    this.buildTrees();
  }

  gen(x, z) {
    let h = 4 + fbm(this.n1, x / 160 + 4, z / 160, 4) * 14 + fbm(this.n2, x / 40, z / 40, 2) * 1.2;
    h += 10 * Math.exp(-(((x + 150) / 70) ** 2 + ((z - 40) / 90) ** 2));   // wzgórze
    h += 7 * Math.exp(-(((x - 160) / 60) ** 2 + ((z + 210) / 70) ** 2));
    const dp = Math.hypot(x - POND.x, z - POND.z) / POND.r;
    h = h * sm(0.6, 1.3, dp) + (-2.5) * (1 - sm(0.6, 1.3, dp));
    const dr = Math.abs(x - roadX(z));
    if (dr < 8) h = h * 0.7 + (h - 0.3) * 0.3;
    return h;
  }
  forest(x, z) { return fbm(this.n2, x / 120 + 7, z / 120 - 3, 3) > 0.4 && Math.abs(z) < 240; }

  heightAt(x, z) {
    let fx = (x + MW / 2) / DX, fz = (z + MD / 2) / DX;
    fx = Math.min(RX - 1e-4, Math.max(0, fx)); fz = Math.min(RZ - 1e-4, Math.max(0, fz));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, H = this.h, n = this.NX;
    const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
  surfaceAt(x, z) { return Math.max(this.heightAt(x, z), 0); }
  inside(x, z) { return Math.abs(x) < MW / 2 && Math.abs(z) < MD / 2; }
  water(x, z) { return this.heightAt(x, z) < 0.2; }

  raycast(o, d) {
    let t0 = 0, t1 = 1e6;
    for (const [oo, dd, lo, hi] of [[o.x, d.x, -MW / 2, MW / 2], [o.y, d.y, BASE_Y, 200], [o.z, d.z, -MD / 2, MD / 2]]) {
      if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return null; continue; }
      let a = (lo - oo) / dd, b = (hi - oo) / dd; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (t1 < t0) return null;
    let prev = t0;
    for (let t = t0; t <= t1 + 1; t += 1) {
      const tt = Math.min(t, t1);
      if (o.y + d.y * tt <= this.surfaceAt(o.x + d.x * tt, o.z + d.z * tt)) {
        let a = prev, b = tt;
        for (let k = 0; k < 12; k++) { const m = (a + b) / 2; if (o.y + d.y * m <= this.surfaceAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
        const x = o.x + d.x * b, z = o.z + d.z * b;
        return new THREE.Vector3(x, this.surfaceAt(x, z), z);
      }
      prev = tt;
      if (tt >= t1) break;
    }
    return null;
  }

  build() {
    const NX = this.NX, NZ = this.NZ, pos = new Float32Array(NX * NZ * 3), col = new Float32Array(NX * NZ * 3);
    const c = new THREE.Color(), t = new THREE.Color();
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, x = -MW / 2 + i * DX, z = -MD / 2 + j * DX, h = this.h[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      c.setRGB(0.38, 0.56, 0.24).lerp(t.setRGB(0.55, 0.62, 0.3), sm(-0.4, 0.4, fbm(this.n2, x / 60, z / 60, 3)));
      if (this.forest(x, z)) c.lerp(t.setRGB(0.22, 0.36, 0.15), 0.8);
      if (Math.abs(x - roadX(z)) < 5) c.lerp(t.setRGB(0.55, 0.47, 0.34), 0.85);
      if (h < 0.5) c.setRGB(0.45, 0.42, 0.3);
      // strefy rozstawienia (lekko zaznaczone)
      if (z > MD / 2 - 110) c.lerp(t.setRGB(0.45, 0.55, 0.75), 0.12);
      if (z < -MD / 2 + 110) c.lerp(t.setRGB(0.8, 0.45, 0.4), 0.12);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    const idx = [];
    for (let j = 0; j < RZ; j++) for (let i = 0; i < RX; i++) { const a = j * NX + i, b = a + 1, cc = a + NX, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = true; m.castShadow = true;
    this.group.add(m); this.terrain = m;
    const water = new THREE.Mesh(new THREE.CircleGeometry(POND.r * 1.3, 40).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x2f6f99, transparent: true, opacity: 0.85, shininess: 80 }));
    water.position.set(POND.x, 0, POND.z); this.group.add(water);
    // bryła i świecąca krawędź
    const side = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
    for (const [w, d, x, z] of [[MW, 1, 0, MD / 2], [MW, 1, 0, -MD / 2], [1, MD, MW / 2, 0], [1, MD, -MW / 2, 0]]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, -BASE_Y, d), side); s.position.set(x, BASE_Y / 2, z); this.group.add(s);
    }
    const slab = new THREE.Mesh(new THREE.BoxGeometry(MW + 14, 6, MD + 14), new THREE.MeshLambertMaterial({ color: 0x2b3036 }));
    slab.position.y = BASE_Y - 3; this.group.add(slab);
    this.glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffc860, toneMapped: false });
    const rim = new THREE.Mesh(new THREE.BoxGeometry(MW + 16, 1.2, MD + 16), this.glowMaterial);
    rim.position.y = BASE_Y - 6.6; this.group.add(rim);
  }

  buildTrees() {
    const rng = mulberry32(9);
    const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
    const geo = mergeGeometries([new THREE.CylinderGeometry(0.25, 0.35, 3, 5).translate(0, 1.5, 0), new THREE.ConeGeometry(2.2, 5, 7).translate(0, 4.6, 0), new THREE.ConeGeometry(1.6, 3.6, 7).translate(0, 6.6, 0)].map(nonIdx)).scale(UNIT_K, UNIT_K, UNIT_K);
    const list = [];
    for (let z = -MD / 2 + 4; z < MD / 2 - 4; z += 5) for (let x = -MW / 2 + 4; x < MW / 2 - 4; x += 5) {
      const px = x + (rng() - 0.5) * 4, pz = z + (rng() - 0.5) * 4;
      if (this.water(px, pz) || Math.abs(px - roadX(pz)) < 7) continue;
      if (this.forest(px, pz) ? rng() < 0.2 : rng() < 0.0012) list.push([px, this.heightAt(px, pz), pz, 0.8 + rng() * 0.5]);
    }
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ flatShading: true }), list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    list.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28);
      m.compose(new THREE.Vector3(t[0], t[1] - 0.2, t[2]), q, new THREE.Vector3(t[3], t[3], t[3]));
      mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.setRGB(0.2, 0.38, 0.2).offsetHSL((rng() - 0.5) * 0.04, 0, (rng() - 0.5) * 0.1));
    });
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere();
    this.group.add(mesh);
  }
}
