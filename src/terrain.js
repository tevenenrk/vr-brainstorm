import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  MAP_W, MAP_D, RES_X, RES_Z, WATER_LEVEL, BASE_Y, HOME, CRATER, BRIDGES_X,
} from './config.js';

// ---------- losowość i szum ----------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(rng) {
  const vals = new Float32Array(256);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) { vals[i] = rng() * 2 - 1; p[i] = i; }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const hash = (i, j) => vals[perm[(i & 255) + perm[j & 255]]];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function fbm(noise, x, y, oct) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let o = 0; o < oct; o++) { s += a * noise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const gauss = (dx, dz, sx, sz) => Math.exp(-((dx * dx) / (sx * sx) + (dz * dz) / (sz * sz)));

export const VILLAGE = { x: 240, z: -380, r: 120 };   // wioska "w terenie" (dekoracja)
const LAKE = { x: -230, z: -760, r: 170 };
const PLATEAU_Z0 = 1280, PLATEAU_Z1 = 1460;
const FOREST_MAX_Z = 1380;
const DX = MAP_W / RES_X, DZ = MAP_D / RES_Z;
const UP = new THREE.Vector3(0, 1, 0);

export class Terrain {
  constructor(seed = 1337) {
    const rng = mulberry32(seed);
    this.rng = rng;
    this.n1 = makeNoise(rng);
    this.n2 = makeNoise(rng);
    this.n3 = makeNoise(rng);
    this.n4 = makeNoise(rng);
    this.nx = RES_X + 1;
    this.nz = RES_Z + 1;
    this.heights = new Float32Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) {
      const z = -MAP_D / 2 + j * DZ;
      for (let i = 0; i < this.nx; i++) {
        const x = -MAP_W / 2 + i * DX;
        this.heights[j * this.nx + i] = this.genHeight(x, z);
      }
    }
    this.planBridges();
    this.baseHeights = this.heights.slice();
    this.group = new THREE.Group();
    this.dirtyJ0 = Infinity; this.dirtyJ1 = -1;
    this.buildTerrainMesh();
    this.buildSkirt();
    this.buildWater();
    this.buildPlatform();
    this.buildBridges();
    this.villages = [];
    this.buildVillages();
    this.buildTrees();
  }

  riverZ(x) { return 220 + 150 * Math.sin(x / 210 + 1.3) + 45 * Math.sin(x / 73 + 0.4); }

  genHeight(x, z) {
    let h = 20 + fbm(this.n1, x / 650 + 10, z / 650 - 3, 5) * 70;
    h += fbm(this.n2, x / 160, z / 160, 3) * 7;
    h += 75 * gauss(x - 130, z - 820, 230, 200);   // grzbiet przed baterią — zasłania tor płaski
    h += 55 * gauss(x + 230, z + 1350, 200, 260);
    h += 35 * gauss(x - 280, z + 1700, 180, 180);
    h = Math.max(h, 4 + fbm(this.n2, x / 90, z / 90, 2) * 2);
    // płaskowyż: baterie + wioska za nimi
    h = lerp(h, 40 + fbm(this.n2, x / 120, z / 120, 2) * 4, smoothstep(PLATEAU_Z0, PLATEAU_Z1, z));
    const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
    h = lerp(h, 12, (1 - smoothstep(VILLAGE.r * 0.6, VILLAGE.r * 1.6, dv)) * 0.8);
    // rzeka
    const dr = Math.abs(z - this.riverZ(x));
    const w = 9 + 6 * fbm(this.n4, x / 120, 0.5, 2);
    h = lerp(-7, h, smoothstep(w, w + 75, dr));
    // jezioro i staw
    const dl = Math.hypot((x - LAKE.x) / LAKE.r, (z - LAKE.z) / (LAKE.r * 1.4)) + fbm(this.n4, x / 80, z / 80, 2) * 0.25;
    h = lerp(-9, h, smoothstep(0.7, 1.25, dl));
    const dp = Math.hypot(x - 300, z - 1150) / 65;
    h = lerp(-4, h, smoothstep(0.6, 1.3, dp));
    // przewyższenie pionowe — jak na makiecie
    return h > 0 ? h * 1.7 : h;
  }

  forestValue(x, z) { return fbm(this.n3, x / 380 + 5, z / 380 + 7, 3); }

  isForest(x, z) {
    return z < FOREST_MAX_Z && this.forestValue(x, z) > 0.1 && this.heightAt(x, z) > 2;
  }

  fieldColor(x, z, out) {
    const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
    const homeFields = z > HOME.z0 - 40;
    if (!homeFields && (dv < VILLAGE.r * 0.75 || dv > 520)) return false;
    const a = homeFields ? 0.1 : 0.35;
    const u = x * Math.cos(a) - z * Math.sin(a), v = x * Math.sin(a) + z * Math.cos(a);
    const fu = Math.floor(u / 85), fv = Math.floor(v / 60);
    const k = ((fu * 73856093) ^ (fv * 19349663)) >>> 0;
    const pal = [[0.78, 0.68, 0.32], [0.55, 0.42, 0.26], [0.45, 0.6, 0.22], [0.7, 0.62, 0.28], [0.38, 0.5, 0.2]];
    const c = pal[k % pal.length];
    out.setRGB(c[0], c[1], c[2]);
    return true;
  }

  H(i, j) {
    i = Math.max(0, Math.min(RES_X, i)); j = Math.max(0, Math.min(RES_Z, j));
    return this.heights[j * this.nx + i];
  }

  heightAt(x, z) {
    let fx = (x + MAP_W / 2) / DX;
    let fz = (z + MAP_D / 2) / DZ;
    fx = Math.min(RES_X - 1e-4, Math.max(0, fx));
    fz = Math.min(RES_Z - 1e-4, Math.max(0, fz));
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const Hh = this.heights, n = this.nx;
    const a = Hh[j * n + i], b = Hh[j * n + i + 1], c = Hh[(j + 1) * n + i], d = Hh[(j + 1) * n + i + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  surfaceAt(x, z) { return Math.max(this.heightAt(x, z), WATER_LEVEL); }

  inside(x, z) { return Math.abs(x) <= MAP_W / 2 && Math.abs(z) <= MAP_D / 2; }

  // Przecięcie promienia (w układzie mapy) z powierzchnią terenu/wody.
  raycast(o, d) {
    let tmin = -Infinity, tmax = Infinity;
    const lo = [-MAP_W / 2, BASE_Y - 1, -MAP_D / 2], hi = [MAP_W / 2, 260, MAP_D / 2];
    const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
    for (let k = 0; k < 3; k++) {
      if (Math.abs(dd[k]) < 1e-9) {
        if (oo[k] < lo[k] || oo[k] > hi[k]) return null;
      } else {
        let t1 = (lo[k] - oo[k]) / dd[k], t2 = (hi[k] - oo[k]) / dd[k];
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      }
    }
    if (tmax < tmin || tmax < 0) return null;
    tmin = Math.max(tmin, 0);
    const step = 3;
    let prev = tmin;
    for (let t = tmin; t <= tmax + step; t += step) {
      const tt = Math.min(t, tmax);
      const px = o.x + d.x * tt, py = o.y + d.y * tt, pz = o.z + d.z * tt;
      if (py <= this.surfaceAt(px, pz)) {
        let a = prev, b = tt;
        for (let k = 0; k < 12; k++) {
          const m = (a + b) / 2;
          if (o.y + d.y * m <= this.surfaceAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m;
        }
        const x = o.x + d.x * b, z = o.z + d.z * b;
        return new THREE.Vector3(x, this.surfaceAt(x, z), z);
      }
      prev = tt;
      if (tt >= tmax) break;
    }
    return null;
  }

  // ---------- teren ----------
  computeNormal(i, j, out, k) {
    const nx = -(this.H(i + 1, j) - this.H(i - 1, j)) / (2 * DX);
    const nz = -(this.H(i, j + 1) - this.H(i, j - 1)) / (2 * DZ);
    const l = Math.hypot(nx, 1, nz);
    out[k] = nx / l; out[k + 1] = 1 / l; out[k + 2] = nz / l;
  }

  buildTerrainMesh() {
    const { nx, nz } = this;
    const pos = new Float32Array(nx * nz * 3);
    const nrm = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        pos[k * 3] = -MAP_W / 2 + i * DX;
        pos[k * 3 + 1] = this.heights[k];
        pos[k * 3 + 2] = -MAP_D / 2 + j * DZ;
        this.computeNormal(i, j, nrm, k * 3);
      }
    }
    const idx = new Uint32Array(RES_X * RES_Z * 6);
    let p = 0;
    for (let j = 0; j < RES_Z; j++) {
      for (let i = 0; i < RES_X; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx[p++] = a; idx[p++] = c; idx[p++] = b;
        idx[p++] = b; idx[p++] = c; idx[p++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    this.basePos = pos.slice();
    this.baseNrm = nrm.slice();

    const col = new Float32Array(nx * nz * 3);
    const c = new THREE.Color(), t = new THREE.Color();
    const sand = new THREE.Color(0.78, 0.71, 0.5), mud = new THREE.Color(0.33, 0.3, 0.22);
    const g1 = new THREE.Color(0.3, 0.5, 0.18), g2 = new THREE.Color(0.52, 0.6, 0.27);
    const forest = new THREE.Color(0.16, 0.3, 0.11), rock = new THREE.Color(0.5, 0.46, 0.4);
    const dirt = new THREE.Color(0.55, 0.47, 0.34), high = new THREE.Color(0.6, 0.62, 0.45);
    for (let k = 0; k < nx * nz; k++) {
      const x = pos[k * 3], h = pos[k * 3 + 1], z = pos[k * 3 + 2];
      const ny = nrm[k * 3 + 1];
      if (h < -0.5) {
        c.copy(mud).lerp(sand, Math.max(0, 1 + h / 6) * 0.6);
      } else if (h < 2.2) {
        c.copy(sand);
      } else {
        c.copy(g1).lerp(g2, smoothstep(-0.4, 0.4, fbm(this.n2, x / 140, z / 140, 3)));
        if (this.fieldColor(x, z, t)) c.lerp(t, z > HOME.z0 - 40 ? 0.55 : 0.85);
        if (z < FOREST_MAX_Z) c.lerp(forest, smoothstep(0.02, 0.14, this.forestValue(x, z)));
        const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
        if (dv < VILLAGE.r) c.lerp(dirt, 0.5 * (1 - dv / VILLAGE.r));
        if (h > 120) c.lerp(high, smoothstep(120, 180, h) * 0.6);
        c.lerp(sand, 1 - smoothstep(2.2, 4.5, h));
      }
      if (ny < 0.85) c.lerp(rock, Math.min(1, (0.85 - ny) * 3.5));
      const jitter = 1 + fbm(this.n4, x / 25, z / 25, 2) * 0.12;
      col[k * 3] = c.r * jitter; col[k * 3 + 1] = c.g * jitter; col[k * 3 + 2] = c.b * jitter;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    this.baseColors = col.slice();
    this.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
  }

  buildSkirt() {
    const ROWS = 10;
    const posArr = [], colArr = [], nrmArr = [], idxArr = [];
    const wPos = [], wIdx = [], wNrm = [];
    const c = new THREE.Color();
    const layers = [new THREE.Color(0.42, 0.3, 0.2), new THREE.Color(0.52, 0.4, 0.27), new THREE.Color(0.36, 0.26, 0.18), new THREE.Color(0.6, 0.5, 0.36)];
    const edge = (pts, nrm) => {
      const base = posArr.length / 3;
      const wbase = wPos.length / 3;
      for (const [x, z] of pts) {
        const h = this.heightAt(x, z);
        for (let r = 0; r <= ROWS; r++) {
          const y = lerp(BASE_Y, h, r / ROWS);
          posArr.push(x, y, z); nrmArr.push(...nrm);
          if (r === ROWS || h - y < 4) c.setRGB(0.25, 0.2, 0.13);
          else {
            const li = Math.floor((y - BASE_Y) / 9 + Math.sin(x * 0.01 + z * 0.01) * 0.6);
            c.copy(layers[((li % 4) + 4) % 4]);
          }
          const sh = 0.75 + 0.25 * (r / ROWS);
          colArr.push(c.r * sh, c.g * sh, c.b * sh);
        }
        wPos.push(x, h, z, x, Math.max(h, WATER_LEVEL), z);
        wNrm.push(...nrm, ...nrm);
      }
      for (let s = 0; s < pts.length - 1; s++) {
        for (let r = 0; r < ROWS; r++) {
          const a = base + s * (ROWS + 1) + r, b = a + 1, cc = a + ROWS + 1, d = cc + 1;
          idxArr.push(a, cc, b, b, cc, d);
        }
        const a = wbase + s * 2, b = a + 1, cc = a + 2, d = a + 3;
        wIdx.push(a, cc, b, b, cc, d);
      }
    };
    const xs = [], zs = [];
    for (let i = 0; i <= RES_X; i++) xs.push(-MAP_W / 2 + i * DX);
    for (let j = 0; j <= RES_Z; j++) zs.push(-MAP_D / 2 + j * DZ);
    edge(xs.map((x) => [x, MAP_D / 2]), [0, 0, 1]);
    edge(xs.slice().reverse().map((x) => [x, -MAP_D / 2]), [0, 0, -1]);
    edge(zs.slice().reverse().map((z) => [MAP_W / 2, z]), [1, 0, 0]);
    edge(zs.map((z) => [-MAP_W / 2, z]), [-1, 0, 0]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrmArr, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    geo.setIndex(idxArr);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    this.group.add(m);
    const wgeo = new THREE.BufferGeometry();
    wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
    wgeo.setAttribute('normal', new THREE.Float32BufferAttribute(wNrm, 3));
    wgeo.setIndex(wIdx);
    this.waterSkirtGeo = wgeo;
  }

  buildWater() {
    const mat = new THREE.MeshPhongMaterial({
      color: 0x2f6f99, specular: 0x9fc8e8, shininess: 80,
      transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(MAP_W, MAP_D, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(geo, mat);
    water.position.y = WATER_LEVEL;
    water.receiveShadow = true;
    water.renderOrder = 2;
    this.group.add(water);
    const ws = new THREE.Mesh(this.waterSkirtGeo, mat);
    ws.renderOrder = 2;
    this.group.add(ws);
  }

  // lewitująca platforma: ciemna płyta + świecąca krawędź i poświata od spodu
  buildPlatform() {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(MAP_W + 70, 30, MAP_D + 70), new THREE.MeshLambertMaterial({ color: 0x2b3036 }));
    slab.position.y = BASE_Y - 15;
    slab.receiveShadow = true;
    slab.castShadow = true;
    this.group.add(slab);
    this.glowMaterial = new THREE.MeshBasicMaterial({ color: 0x4fd2ff, toneMapped: false });
    const rim = new THREE.Mesh(new THREE.BoxGeometry(MAP_W + 76, 5, MAP_D + 76), this.glowMaterial);
    rim.position.y = BASE_Y - 30 - 2.5;
    this.group.add(rim);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(MAP_W + 20, 8, MAP_D + 20), new THREE.MeshLambertMaterial({ color: 0x1c2024 }));
    bottom.position.y = BASE_Y - 39;
    this.group.add(bottom);
    // miękka poświata pod spodem
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, 'rgba(90,210,255,0.45)'); grad.addColorStop(0.6, 'rgba(90,210,255,0.12)'); grad.addColorStop(1, 'rgba(90,210,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    this.underGlow = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W + 500, MAP_D + 900),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
    this.underGlow.rotation.x = Math.PI / 2;
    this.underGlow.position.y = BASE_Y - 46;
    this.group.add(this.underGlow);
  }

  // ---------- mosty ----------
  // wyznacza przyczółki mostów i wyrównuje teren przy nich (najazdy)
  planBridges() {
    this.bridgePlans = [];
    for (const x0 of BRIDGES_X) {
      const zc = this.riverZ(x0);
      const dzdx = (this.riverZ(x0 + 1) - this.riverZ(x0 - 1)) / 2;
      let nx = -dzdx, nz = 1; const l = Math.hypot(nx, nz); nx /= l; nz /= l;
      let ta = 0, tb = 0;
      while (ta < 220 && this.heightAt(x0 - nx * ta, zc - nz * ta) < 4) ta += 2;
      while (tb < 220 && this.heightAt(x0 + nx * tb, zc + nz * tb) < 4) tb += 2;
      ta += 6; tb += 6;
      const ax = x0 - nx * ta, az = zc - nz * ta, bx = x0 + nx * tb, bz = zc + nz * tb;
      const y = 8;
      // najazdy: teren wokół przyczółków stopniowo do wysokości pomostu
      for (const [ex, ez, sx, sz] of [[ax, az, -nx, -nz], [bx, bz, nx, nz]]) {
        for (let j = 0; j <= RES_Z; j++) {
          for (let i = 0; i <= RES_X; i++) {
            const vx = -MAP_W / 2 + i * DX, vz = -MAP_D / 2 + j * DZ;
            const along = (vx - ex) * sx + (vz - ez) * sz;      // >0: w głąb lądu
            const side = Math.abs((vx - ex) * sz - (vz - ez) * sx);
            if (along < -4 || along > 90 || side > 26) continue;
            const k = j * this.nx + i;
            const target = y - 0.5 + Math.max(0, along - 15) * 0.18; // łagodna rampa w górę
            const w = (1 - smoothstep(12, 26, side)) * (1 - smoothstep(60, 90, along));
            const cur = this.heights[k];
            const blended = lerp(cur, Math.min(cur, target), w);
            this.heights[k] = along < 15 ? lerp(cur, y - 0.5, w) : blended;
          }
        }
      }
      this.bridgePlans.push({ ax, az, bx, bz, y });
    }
  }

  buildBridges() {
    this.bridges = [];
    const stone = new THREE.MeshLambertMaterial({ color: 0x8b8478, flatShading: true });
    const wood = new THREE.MeshLambertMaterial({ color: 0x6e4b2c });
    for (const { ax, az, bx, bz, y } of this.bridgePlans) {
      const len = Math.hypot(bx - ax, bz - az);
      const grp = new THREE.Group();
      grp.position.set((ax + bx) / 2, y, (az + bz) / 2);
      grp.rotation.y = Math.atan2(bx - ax, bz - az);
      const add = (parent, geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
      const halves = [];
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.z = side * len / 2;
        grp.add(pivot);
        const hz = -side * len / 4;
        add(pivot, new THREE.BoxGeometry(15, 2.6, len / 2), wood, 0, 0, hz);
        for (const sx of [-1, 1]) add(pivot, new THREE.BoxGeometry(0.9, 2.6, len / 2), stone, sx * 7.2, 2.4, hz);
        halves.push(pivot);
      }
      // filary
      for (let k = 1; k < 4; k++) {
        const pz = -len / 2 + (k * len) / 4;
        add(grp, new THREE.CylinderGeometry(2.6, 3.2, y + 10, 7), stone, 0, -(y + 10) / 2 - 1.3, pz);
      }
      this.group.add(grp);
      const entryFirst = az < bz;
      this.bridges.push({
        ax, az, bx, bz, y, len, dx: (bx - ax) / len, dz: (bz - az) / len, group: grp, halves, hp: 3, destroyed: false,
        entry: entryFirst ? { x: ax, z: az } : { x: bx, z: bz },
        exit: entryFirst ? { x: bx, z: bz } : { x: ax, z: az },
      });
    }
  }

  bridgeDistance(b, x, z) {
    const t = Math.max(0, Math.min(b.len, (x - b.ax) * b.dx + (z - b.az) * b.dz));
    return Math.hypot(b.ax + b.dx * t - x, b.az + b.dz * t - z);
  }

  // wysokość pomostu, jeśli punkt leży na nienaruszonym moście
  bridgeDeckAt(x, z) {
    for (const b of this.bridges) {
      if (b.destroyed) continue;
      const t = (x - b.ax) * b.dx + (z - b.az) * b.dz;
      if (t < -2 || t > b.len + 2) continue;
      if (Math.abs((x - b.ax) * b.dz - (z - b.az) * b.dx) < 9) return b.y + 1.3;
    }
    return null;
  }

  damageBridges(x, z) {
    const destroyed = [];
    for (const b of this.bridges) {
      if (b.destroyed || this.bridgeDistance(b, x, z) > 24) continue;
      b.hp--;
      if (b.hp <= 0) {
        b.destroyed = true;
        b.halves[0].rotation.x = 0.55; b.halves[1].rotation.x = -0.5;
        b.halves[0].position.y = -3; b.halves[1].position.y = -4;
        destroyed.push(b);
      }
    }
    return destroyed;
  }

  // ---------- wioski ----------
  buildVillages() {
    const rng = this.rng;
    // dekoracyjna wioska w terenie
    const spots = [];
    for (let k = 0; k < 40 && spots.length < 16; k++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * VILLAGE.r * 0.85;
      const x = VILLAGE.x + Math.cos(a) * d, z = VILLAGE.z + Math.sin(a) * d;
      if (this.heightAt(x, z) < 3) continue;
      if (spots.some((h) => Math.hypot(h.x - x, h.z - z) < 30)) continue;
      spots.push({ x, z, r: Math.round(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.3 });
    }
    this.villages.push(this.makeVillage(spots, 0.03, false));
    // Twoja wioska za działami
    const home = [];
    for (let k = 0; k < 400 && home.length < HOME.count; k++) {
      const x = (rng() * 2 - 1) * 420, z = HOME.z0 + rng() * (HOME.z1 - HOME.z0);
      if (home.some((h) => Math.hypot(h.x - x, h.z - z) < 55)) continue;
      home.push({ x, z, r: Math.round(rng() * 2) * (Math.PI / 2) + (rng() - 0.5) * 0.15 });
    }
    // kościół w środku
    home.push({ x: 0, z: (HOME.z0 + HOME.z1) / 2 + 10, r: 0, church: true });
    this.home = this.makeVillage(home, 0.58, true);
    this.villages.push(this.home);
  }

  makeVillage(spots, roofHue, isHome) {
    const rng = this.rng;
    const walls = new THREE.BoxGeometry(16, 11, 12).translate(0, 5.5, 0);
    const roofG = new THREE.CylinderGeometry(9.5, 9.5, 18, 3, 1)
      .rotateZ(Math.PI / 2).rotateX(-Math.PI / 2)
      .scale(1, 0.75, 1)
      .translate(0, 11 + 0.5 * 9.5 * 0.75, 0);
    const wm = new THREE.InstancedMesh(walls, new THREE.MeshLambertMaterial(), spots.length);
    const rm = new THREE.InstancedMesh(roofG, new THREE.MeshLambertMaterial({ flatShading: true }), spots.length);
    const houses = spots.map((s, i) => {
      const scale = s.church ? new THREE.Vector3(1.4, 2.4, 1.6) : new THREE.Vector3(1, 1, 1);
      const h = {
        ...s, i, y: this.heightAt(s.x, s.z) - 0.5, scale, destroyed: false, hp: isHome ? 6 : 1, maxHp: isHome ? 6 : 1,
        wallColor: new THREE.Color().setHSL(0.1, 0.25, 0.75 + rng() * 0.15),
        roofColor: new THREE.Color().setHSL(roofHue + rng() * 0.03, 0.5, 0.36 + rng() * 0.1),
      };
      return h;
    });
    const v = { houses, meshes: [wm, rm], home: isHome };
    for (const h of houses) this.placeHouse(v, h, false);
    for (const mm of [wm, rm]) { mm.castShadow = true; mm.receiveShadow = true; mm.computeBoundingSphere(); this.group.add(mm); }
    return v;
  }

  placeHouse(v, h, ruined) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    const [wm, rm] = v.meshes;
    if (!ruined) {
      q.setFromAxisAngle(UP, h.r);
      m.compose(new THREE.Vector3(h.x, h.y, h.z), q, h.scale);
      wm.setMatrixAt(h.i, m); rm.setMatrixAt(h.i, m);
      wm.setColorAt(h.i, h.wallColor); rm.setColorAt(h.i, h.roofColor);
    } else {
      q.setFromAxisAngle(UP, h.r + 0.3);
      m.compose(new THREE.Vector3(h.x, h.y - 1, h.z), q, new THREE.Vector3(h.scale.x * 1.05, 0.25, h.scale.z * 1.05));
      wm.setMatrixAt(h.i, m); wm.setColorAt(h.i, new THREE.Color(0.28, 0.25, 0.22));
      m.compose(new THREE.Vector3(h.x, h.y - 8, h.z), q, new THREE.Vector3(0.9, 0.45, 0.9));
      rm.setMatrixAt(h.i, m); rm.setColorAt(h.i, new THREE.Color(0.16, 0.12, 0.1));
    }
    for (const mm of v.meshes) { mm.instanceMatrix.needsUpdate = true; mm.instanceColor.needsUpdate = true; }
  }

  destroyHouse(v, h) {
    if (h.destroyed) return false;
    h.destroyed = true; h.hp = 0;
    this.placeHouse(v, h, true);
    return true;
  }

  homeAlive() { return this.home.houses.filter((h) => !h.destroyed).length; }

  // ---------- drzewa ----------
  buildTrees() {
    const rng = this.rng;
    const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
    const conifer = mergeGeometries([
      new THREE.CylinderGeometry(1.0, 1.4, 6, 5).translate(0, 3, 0),
      new THREE.ConeGeometry(7, 15, 7).translate(0, 11, 0),
      new THREE.ConeGeometry(5, 11, 7).translate(0, 18, 0),
    ].map(nonIdx));
    const decid = mergeGeometries([
      new THREE.CylinderGeometry(1.1, 1.5, 7, 5).translate(0, 3.5, 0),
      new THREE.IcosahedronGeometry(7.5, 0).translate(0, 12, 0),
    ].map(nonIdx));
    const listC = [], listD = [];
    const step = 13;
    const allHouses = this.villages.flatMap((v) => v.houses);
    for (let z = -MAP_D / 2 + 10; z < MAP_D / 2 - 10; z += step) {
      for (let x = -MAP_W / 2 + 10; x < MAP_W / 2 - 10; x += step) {
        const px = x + (rng() - 0.5) * step * 0.9, pz = z + (rng() - 0.5) * step * 0.9;
        const h = this.heightAt(px, pz);
        if (h < 2.5) continue;
        if (Math.hypot(px - VILLAGE.x, pz - VILLAGE.z) < VILLAGE.r * 0.9) continue;
        if (allHouses.some((hh) => Math.abs(hh.x - px) < 22 && Math.abs(hh.z - pz) < 22)) continue;
        if (this.bridges.some((b) => this.bridgeDistance(b, px, pz) < 18)) continue;
        if (pz > FOREST_MAX_Z) { if (rng() > 0.02 || Math.abs(pz - 1540) < 60) continue; }
        const fv = this.forestValue(px, pz);
        const t = new THREE.Color();
        const inField = this.fieldColor(px, pz, t);
        let place = false;
        if (fv > 0.1 && pz < FOREST_MAX_Z) place = rng() < 0.75;
        else if (!inField || pz > FOREST_MAX_Z) place = rng() < 0.012 || pz > FOREST_MAX_Z;
        if (!place) continue;
        const s = Math.abs(this.heightAt(px + 4, pz) - this.heightAt(px - 4, pz)) + Math.abs(this.heightAt(px, pz + 4) - this.heightAt(px, pz - 4));
        if (s > 11) continue;
        const kind = fbm(this.n4, px / 300, pz / 300, 2) + (rng() - 0.5) * 0.5 > 0 ? listC : listD;
        kind.push([px, h - 0.5, pz, 0.7 + rng() * 0.6, rng() * Math.PI * 2]);
      }
    }
    this.trees = [];
    const mk = (geo, list, base) => {
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ flatShading: true }), list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      list.forEach((tr, i) => {
        p.set(tr[0], tr[1], tr[2]); q.setFromAxisAngle(UP, tr[4]); s.setScalar(tr[3]);
        m.compose(p, q, s); mesh.setMatrixAt(i, m);
        const c = base.clone().offsetHSL((rng() - 0.5) * 0.05, (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.12);
        mesh.setColorAt(i, c);
        this.trees.push({ mesh, i, x: tr[0], y: tr[1], z: tr[2], s: tr[3], r: tr[4], color: c, burnt: false });
      });
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    };
    mk(conifer, listC, new THREE.Color(0.2, 0.38, 0.2));
    mk(decid, listD, new THREE.Color(0.33, 0.52, 0.2));
    this.treeGrid = new Map();
    for (const t of this.trees) {
      const key = Math.floor(t.x / 50) + ',' + Math.floor(t.z / 50);
      if (!this.treeGrid.has(key)) this.treeGrid.set(key, []);
      this.treeGrid.get(key).push(t);
    }
  }

  // ---------- zniszczenia ----------
  markDirty(j0, j1) { this.dirtyJ0 = Math.min(this.dirtyJ0, j0); this.dirtyJ1 = Math.max(this.dirtyJ1, j1); }

  // lej po pocisku: wgłębienie z wałem dookoła
  crater(x, z) {
    if (this.heightAt(x, z) < WATER_LEVEL + 0.5) return;
    const R = CRATER.r, D = CRATER.depth, RR = R * 1.45;
    const i0 = Math.max(0, Math.floor((x - RR + MAP_W / 2) / DX)), i1 = Math.min(RES_X, Math.ceil((x + RR + MAP_W / 2) / DX));
    const j0 = Math.max(0, Math.floor((z - RR + MAP_D / 2) / DZ)), j1 = Math.min(RES_Z, Math.ceil((z + RR + MAP_D / 2) / DZ));
    const Hh = this.heights, pos = this.mesh.geometry.attributes.position.array;
    const col = this.mesh.geometry.attributes.color.array;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const vx = -MAP_W / 2 + i * DX, vz = -MAP_D / 2 + j * DZ;
        const d = Math.hypot(vx - x, vz - z) / R;
        if (d > 1.45) continue;
        let dh = 0;
        if (d < 1) { const q = 1 - d * d; dh -= D * q * q; }
        dh += 1.8 * Math.exp(-(((d - 1.05) / 0.25) ** 2));
        const k = j * this.nx + i;
        Hh[k] += dh;
        pos[k * 3 + 1] = Hh[k];
        // kolor: wnętrze leja — rozkopana ziemia, wał — jaśniejsza ziemia
        const ci = k * 3;
        if (d < 1) {
          const f = 0.85 * (1 - d * d * 0.6);
          col[ci] = lerp(col[ci], 0.2, f); col[ci + 1] = lerp(col[ci + 1], 0.14, f); col[ci + 2] = lerp(col[ci + 2], 0.09, f);
        } else {
          const f = 0.5 * (1 - (d - 1) / 0.45);
          col[ci] = lerp(col[ci], 0.42, f); col[ci + 1] = lerp(col[ci + 1], 0.33, f); col[ci + 2] = lerp(col[ci + 2], 0.22, f);
        }
      }
    }
    const nrm = this.mesh.geometry.attributes.normal.array;
    for (let j = Math.max(0, j0 - 1); j <= Math.min(RES_Z, j1 + 1); j++) {
      for (let i = Math.max(0, i0 - 1); i <= Math.min(RES_X, i1 + 1); i++) this.computeNormal(i, j, nrm, (j * this.nx + i) * 3);
    }
    this.markDirty(Math.max(0, j0 - 1), Math.min(RES_Z, j1 + 1));
    // drzewa przy leju osiadają razem z terenem
    const touched = new Set();
    for (let gx = Math.floor((x - RR) / 50); gx <= Math.floor((x + RR) / 50); gx++) {
      for (let gz = Math.floor((z - RR) / 50); gz <= Math.floor((z + RR) / 50); gz++) {
        for (const t of this.treeGrid.get(gx + ',' + gz) || []) {
          if (Math.hypot(t.x - x, t.z - z) > RR) continue;
          this.placeTree(t); touched.add(t.mesh);
        }
      }
    }
    for (const mesh of touched) mesh.instanceMatrix.needsUpdate = true;
  }

  placeTree(t) {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, t.r);
    const sc = t.burnt ? new THREE.Vector3(t.s * 0.6, t.s * 0.45, t.s * 0.6) : new THREE.Vector3(t.s, t.s, t.s);
    const y = t.burnt ? this.heightAt(t.x, t.z) - 0.5 : Math.min(t.y, this.heightAt(t.x, t.z) - 0.5);
    t.mesh.setMatrixAt(t.i, new THREE.Matrix4().compose(new THREE.Vector3(t.x, y, t.z), q, sc));
  }

  // osmalenie, spalone drzewa, zniszczone domy. Zwraca zniszczone domy.
  scorch(x, z, r) {
    const col = this.mesh.geometry.attributes.color.array;
    const i0 = Math.max(0, Math.floor((x - r + MAP_W / 2) / DX)), i1 = Math.min(RES_X, Math.ceil((x + r + MAP_W / 2) / DX));
    const j0 = Math.max(0, Math.floor((z - r + MAP_D / 2) / DZ)), j1 = Math.min(RES_Z, Math.ceil((z + r + MAP_D / 2) / DZ));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-MAP_W / 2 + i * DX - x, -MAP_D / 2 + j * DZ - z) / r;
        if (d >= 1) continue;
        const k = (j * this.nx + i) * 3;
        const f = (1 - d * d) * 0.6;
        col[k] = lerp(col[k], 0.09, f); col[k + 1] = lerp(col[k + 1], 0.08, f); col[k + 2] = lerp(col[k + 2], 0.07, f);
      }
    }
    this.markDirty(j0, j1);

    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    const burnt = new THREE.Color(0.13, 0.11, 0.09);
    const touched = new Set();
    for (let gx = Math.floor((x - r) / 50); gx <= Math.floor((x + r) / 50); gx++) {
      for (let gz = Math.floor((z - r) / 50); gz <= Math.floor((z + r) / 50); gz++) {
        const list = this.treeGrid.get(gx + ',' + gz);
        if (!list) continue;
        for (const t of list) {
          if (t.burnt || Math.hypot(t.x - x, t.z - z) > r * 0.7) continue;
          t.burnt = true;
          q.setFromAxisAngle(UP, t.r);
          m.compose(new THREE.Vector3(t.x, this.heightAt(t.x, t.z) - 0.5, t.z), q, new THREE.Vector3(t.s * 0.6, t.s * 0.45, t.s * 0.6));
          t.mesh.setMatrixAt(t.i, m); t.mesh.setColorAt(t.i, burnt);
          touched.add(t.mesh);
        }
      }
    }
    for (const mesh of touched) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }

    const destroyed = [];
    for (const v of this.villages) {
      for (const h of v.houses) {
        if (!h.destroyed && Math.hypot(h.x - x, h.z - z) < r * 0.7 && this.destroyHouse(v, h)) destroyed.push({ v, h });
      }
    }
    return destroyed;
  }

  resetDamage() {
    const g = this.mesh.geometry.attributes;
    this.heights.set(this.baseHeights);
    g.position.array.set(this.basePos);
    g.normal.array.set(this.baseNrm);
    g.color.array.set(this.baseColors);
    this.markDirty(0, RES_Z);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    const touched = new Set();
    for (const t of this.trees) {
      if (!t.burnt) continue;
      t.burnt = false;
      q.setFromAxisAngle(UP, t.r);
      m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      t.mesh.setMatrixAt(t.i, m); t.mesh.setColorAt(t.i, t.color);
      touched.add(t.mesh);
    }
    for (const mesh of touched) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    for (const v of this.villages) {
      for (const h of v.houses) {
        h.hp = h.maxHp;
        if (h.destroyed) { h.destroyed = false; this.placeHouse(v, h, false); }
      }
    }
    for (const b of this.bridges) {
      b.hp = 3; b.destroyed = false;
      for (const hv of b.halves) { hv.rotation.x = 0; hv.position.y = 0; }
    }
  }

  update() {
    if (this.dirtyJ1 < 0) return;
    const start = this.dirtyJ0 * this.nx * 3;
    const count = (this.dirtyJ1 - this.dirtyJ0 + 1) * this.nx * 3;
    const g = this.mesh.geometry.attributes;
    for (const a of [g.position, g.normal, g.color]) {
      a.clearUpdateRanges();
      a.addUpdateRange(start, count);
      a.needsUpdate = true;
    }
    this.dirtyJ0 = Infinity; this.dirtyJ1 = -1;
  }
}

export { smoothstep, lerp };
