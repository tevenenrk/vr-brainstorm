import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  MAP_W, MAP_D, RES_X, RES_Z, WATER_LEVEL, BASE_Y, BATTERY_Z,
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

export const VILLAGE = { x: 240, z: -380, r: 120 };
const LAKE = { x: -230, z: -760, r: 170 };

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
      const z = -MAP_D / 2 + (j * MAP_D) / RES_Z;
      for (let i = 0; i < this.nx; i++) {
        const x = -MAP_W / 2 + (i * MAP_W) / RES_X;
        this.heights[j * this.nx + i] = this.genHeight(x, z);
      }
    }
    this.group = new THREE.Group();
    this.buildTerrainMesh();
    this.buildSkirt();
    this.buildWater();
    this.buildTable();
    this.buildTrees();
    this.buildVillage();
    this.colorsDirty = false;
  }

  riverZ(x) { return 220 + 150 * Math.sin(x / 210 + 1.3) + 45 * Math.sin(x / 73 + 0.4); }

  genHeight(x, z) {
    let h = 20 + fbm(this.n1, x / 650 + 10, z / 650 - 3, 5) * 70;
    h += fbm(this.n2, x / 160, z / 160, 3) * 7;
    // wzgórza
    h += 75 * gauss(x - 130, z - 820, 230, 200);   // grzbiet przed baterią — zasłania tor płaski
    h += 55 * gauss(x + 230, z + 1350, 200, 260);
    h += 35 * gauss(x - 280, z + 1700, 180, 180);
    // minimalna wysokość — łąki
    h = Math.max(h, 4 + fbm(this.n2, x / 90, z / 90, 2) * 2);
    // płaskowyż baterii
    h = lerp(h, 40 + fbm(this.n2, x / 120, z / 120, 2) * 4, smoothstep(1420, 1640, z));
    // wioska — wyrównanie
    const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
    h = lerp(h, 12, (1 - smoothstep(VILLAGE.r * 0.6, VILLAGE.r * 1.6, dv)) * 0.8);
    // rzeka
    const dr = Math.abs(z - this.riverZ(x));
    const w = 9 + 6 * fbm(this.n4, x / 120, 0.5, 2);
    h = lerp(-7, h, smoothstep(w, w + 75, dr));
    // jezioro
    const dl = Math.hypot((x - LAKE.x) / LAKE.r, (z - LAKE.z) / (LAKE.r * 1.4)) + fbm(this.n4, x / 80, z / 80, 2) * 0.25;
    h = lerp(-9, h, smoothstep(0.7, 1.25, dl));
    // staw
    const dp = Math.hypot(x - 300, z - 1250) / 70;
    h = lerp(-4, h, smoothstep(0.6, 1.3, dp));
    // przewyższenie pionowe — jak na makiecie, żeby pagórki były wyraźne
    return h > 0 ? h * 1.7 : h;
  }

  forestValue(x, z) { return fbm(this.n3, x / 380 + 5, z / 380 + 7, 3); }

  isForest(x, z) {
    return this.forestValue(x, z) > 0.1 && this.heightAt(x, z) > 2 && z < 1500;
  }

  fieldColor(x, z, out) {
    // pola uprawne w okolicy wioski
    const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
    if (dv < VILLAGE.r * 0.75 || dv > 520) return false;
    const a = 0.35;
    const u = x * Math.cos(a) - z * Math.sin(a), v = x * Math.sin(a) + z * Math.cos(a);
    const fu = Math.floor(u / 85), fv = Math.floor(v / 60);
    const k = ((fu * 73856093) ^ (fv * 19349663)) >>> 0;
    const pal = [[0.78, 0.68, 0.32], [0.55, 0.42, 0.26], [0.45, 0.6, 0.22], [0.7, 0.62, 0.28], [0.38, 0.5, 0.2]];
    const c = pal[k % pal.length];
    out.setRGB(c[0], c[1], c[2]);
    return true;
  }

  heightAt(x, z) {
    let fx = ((x + MAP_W / 2) / MAP_W) * RES_X;
    let fz = ((z + MAP_D / 2) / MAP_D) * RES_Z;
    fx = Math.min(RES_X - 1e-4, Math.max(0, fx));
    fz = Math.min(RES_Z - 1e-4, Math.max(0, fz));
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const H = this.heights, n = this.nx;
    const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  surfaceAt(x, z) { return Math.max(this.heightAt(x, z), WATER_LEVEL); }

  inside(x, z) { return Math.abs(x) <= MAP_W / 2 && Math.abs(z) <= MAP_D / 2; }

  // Przecięcie promienia (w układzie mapy) z powierzchnią terenu/wody.
  raycast(o, d) {
    let tmin = -Infinity, tmax = Infinity;
    const lo = [-MAP_W / 2, BASE_Y - 1, -MAP_D / 2], hi = [MAP_W / 2, 220, MAP_D / 2];
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
          const mx = o.x + d.x * m, my = o.y + d.y * m, mz = o.z + d.z * m;
          if (my <= this.surfaceAt(mx, mz)) b = m; else a = m;
        }
        const x = o.x + d.x * b, z = o.z + d.z * b;
        return new THREE.Vector3(x, this.surfaceAt(x, z), z);
      }
      prev = tt;
      if (tt >= tmax) break;
    }
    return null;
  }

  // ---------- budowa geometrii ----------
  buildTerrainMesh() {
    const { nx, nz } = this;
    const pos = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        pos[k * 3] = -MAP_W / 2 + (i * MAP_W) / RES_X;
        pos[k * 3 + 1] = this.heights[k];
        pos[k * 3 + 2] = -MAP_D / 2 + (j * MAP_D) / RES_Z;
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
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    const nrm = geo.attributes.normal.array;
    const col = new Float32Array(nx * nz * 3);
    const c = new THREE.Color(), t = new THREE.Color();
    const sand = new THREE.Color(0.78, 0.71, 0.5), mud = new THREE.Color(0.33, 0.3, 0.22);
    const g1 = new THREE.Color(0.3, 0.5, 0.18), g2 = new THREE.Color(0.52, 0.6, 0.27);
    const forest = new THREE.Color(0.16, 0.3, 0.11), rock = new THREE.Color(0.5, 0.46, 0.4);
    const dirt = new THREE.Color(0.55, 0.47, 0.34);
    for (let k = 0; k < nx * nz; k++) {
      const x = pos[k * 3], h = pos[k * 3 + 1], z = pos[k * 3 + 2];
      const ny = nrm[k * 3 + 1];
      if (h < -0.5) {
        c.copy(mud).lerp(sand, Math.max(0, 1 + h / 6) * 0.6);
      } else if (h < 2.2) {
        c.copy(sand);
      } else {
        c.copy(g1).lerp(g2, smoothstep(-0.4, 0.4, fbm(this.n2, x / 140, z / 140, 3)));
        if (this.fieldColor(x, z, t)) c.lerp(t, 0.85);
        const fv = this.forestValue(x, z);
        if (z < 1500) c.lerp(forest, smoothstep(0.02, 0.14, fv));
        const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
        if (dv < VILLAGE.r) c.lerp(dirt, 0.5 * (1 - dv / VILLAGE.r));
        if (h > 120) c.lerp(new THREE.Color(0.6, 0.62, 0.45), smoothstep(120, 180, h) * 0.6);
        c.lerp(sand, 1 - smoothstep(2.2, 4.5, h));
      }
      if (ny < 0.85) c.lerp(rock, Math.min(1, (0.85 - ny) * 3.5));
      // lekki szum kolorów
      const jitter = 1 + fbm(this.n4, x / 25, z / 25, 2) * 0.12;
      col[k * 3] = c.r * jitter; col[k * 3 + 1] = c.g * jitter; col[k * 3 + 2] = c.b * jitter;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.baseColors = col.slice();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.Mesh(geo, mat);
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
    for (let i = 0; i <= RES_X; i++) xs.push(-MAP_W / 2 + (i * MAP_W) / RES_X);
    for (let j = 0; j <= RES_Z; j++) zs.push(-MAP_D / 2 + (j * MAP_D) / RES_Z);
    // wierzchołki ułożone tak, by trójkąty były skierowane na zewnątrz
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
    this.water = water;
  }

  buildTable() {
    const wood = new THREE.MeshLambertMaterial({ color: 0x4a2f1c });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(MAP_W + 70, 36, MAP_D + 70), wood);
    slab.position.y = BASE_Y - 18;
    slab.receiveShadow = true;
    this.group.add(slab);
    const trim = new THREE.MeshLambertMaterial({ color: 0xb08d3c, emissive: 0x000000 });
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(MAP_W + 80, 6, MAP_D + 80), trim);
    t1.position.y = BASE_Y - 36 - 3;
    this.group.add(t1);
    this.slabMaterial = wood;
    this.trimMaterial = trim;
  }

  buildTrees() {
    const rng = this.rng;
    const conifer = mergeGeometries([
      new THREE.CylinderGeometry(1.0, 1.4, 6, 5).translate(0, 3, 0),
      new THREE.ConeGeometry(7, 15, 7).translate(0, 11, 0),
      new THREE.ConeGeometry(5, 11, 7).translate(0, 18, 0),
    ].map((g) => (g.index ? g.toNonIndexed() : g)));
    const decid = mergeGeometries([
      new THREE.CylinderGeometry(1.1, 1.5, 7, 5).translate(0, 3.5, 0),
      new THREE.IcosahedronGeometry(7.5, 0).translate(0, 12, 0),
    ].map((g) => (g.index ? g.toNonIndexed() : g)));
    const listC = [], listD = [];
    const step = 13;
    for (let z = -MAP_D / 2 + 10; z < MAP_D / 2 - 10; z += step) {
      for (let x = -MAP_W / 2 + 10; x < MAP_W / 2 - 10; x += step) {
        const px = x + (rng() - 0.5) * step * 0.9, pz = z + (rng() - 0.5) * step * 0.9;
        const h = this.heightAt(px, pz);
        if (h < 2.5) continue;
        if (Math.hypot(px - VILLAGE.x, pz - VILLAGE.z) < VILLAGE.r * 0.9) continue;
        if (pz > 1500) { if (rng() > 0.004) continue; }
        const fv = this.forestValue(px, pz);
        const t = new THREE.Color();
        const inField = this.fieldColor(px, pz, t);
        let place = false;
        if (fv > 0.1) place = rng() < 0.75;
        else if (!inField) place = rng() < 0.012;
        if (!place) continue;
        // stromizna
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
      const c = new THREE.Color();
      list.forEach((tr, i) => {
        p.set(tr[0], tr[1], tr[2]); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), tr[4]); s.setScalar(tr[3]);
        m.compose(p, q, s); mesh.setMatrixAt(i, m);
        c.copy(base).offsetHSL((rng() - 0.5) * 0.05, (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.12);
        mesh.setColorAt(i, c);
        this.trees.push({ mesh, i, x: tr[0], y: tr[1], z: tr[2], s: tr[3], r: tr[4], burnt: false });
      });
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      return mesh;
    };
    mk(conifer, listC, new THREE.Color(0.2, 0.38, 0.2));
    mk(decid, listD, new THREE.Color(0.33, 0.52, 0.2));
    // siatka do szybkiego wyszukiwania
    this.treeGrid = new Map();
    for (const t of this.trees) {
      const key = Math.floor(t.x / 50) + ',' + Math.floor(t.z / 50);
      if (!this.treeGrid.has(key)) this.treeGrid.set(key, []);
      this.treeGrid.get(key).push(t);
    }
  }

  buildVillage() {
    const rng = this.rng;
    const walls = new THREE.BoxGeometry(16, 11, 12).translate(0, 5.5, 0);
    // graniastosłup trójkątny: oś wzdłuż X, kalenica u góry
    const roofG = new THREE.CylinderGeometry(9.5, 9.5, 18, 3, 1)
      .rotateZ(Math.PI / 2).rotateX(-Math.PI / 2)
      .scale(1, 0.75, 1)
      .translate(0, 11 + 0.5 * 9.5 * 0.75, 0);
    const houses = [];
    for (let k = 0; k < 40 && houses.length < 16; k++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * VILLAGE.r * 0.85;
      const x = VILLAGE.x + Math.cos(a) * d, z = VILLAGE.z + Math.sin(a) * d;
      if (this.heightAt(x, z) < 3) continue;
      if (houses.some((h) => Math.hypot(h.x - x, h.z - z) < 30)) continue;
      houses.push({ x, z, y: this.heightAt(x, z) - 0.5, r: Math.round(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.3 });
    }
    const wm = new THREE.InstancedMesh(walls, new THREE.MeshLambertMaterial(), houses.length);
    const rm = new THREE.InstancedMesh(roofG, new THREE.MeshLambertMaterial({ flatShading: true }), houses.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    houses.forEach((h, i) => {
      q.setFromAxisAngle(up, h.r);
      m.compose(new THREE.Vector3(h.x, h.y, h.z), q, new THREE.Vector3(1, 1, 1));
      wm.setMatrixAt(i, m); rm.setMatrixAt(i, m);
      wm.setColorAt(i, c.setHSL(0.1, 0.25, 0.75 + rng() * 0.15));
      rm.setColorAt(i, c.setHSL(0.02 + rng() * 0.03, 0.55, 0.35 + rng() * 0.1));
    });
    for (const mm of [wm, rm]) { mm.castShadow = true; mm.receiveShadow = true; mm.computeBoundingSphere(); this.group.add(mm); }
    this.houses = houses.map((h, i) => ({ ...h, i, destroyed: false }));
    this.houseMeshes = [wm, rm];
  }

  // ---------- zniszczenia ----------
  scorch(x, z, r) {
    const col = this.mesh.geometry.attributes.color.array;
    const i0 = Math.max(0, Math.floor(((x - r + MAP_W / 2) / MAP_W) * RES_X));
    const i1 = Math.min(RES_X, Math.ceil(((x + r + MAP_W / 2) / MAP_W) * RES_X));
    const j0 = Math.max(0, Math.floor(((z - r + MAP_D / 2) / MAP_D) * RES_Z));
    const j1 = Math.min(RES_Z, Math.ceil(((z + r + MAP_D / 2) / MAP_D) * RES_Z));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const vx = -MAP_W / 2 + (i * MAP_W) / RES_X, vz = -MAP_D / 2 + (j * MAP_D) / RES_Z;
        const d = Math.hypot(vx - x, vz - z) / r;
        if (d >= 1) continue;
        const k = (j * this.nx + i) * 3;
        const f = (1 - d * d) * 0.65;
        col[k] = lerp(col[k], 0.12, f); col[k + 1] = lerp(col[k + 1], 0.1, f); col[k + 2] = lerp(col[k + 2], 0.08, f);
      }
    }
    this.colorsDirty = true;

    // spalone drzewa
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const burnt = new THREE.Color(0.13, 0.11, 0.09);
    const touched = new Set();
    for (let gx = Math.floor((x - r) / 50); gx <= Math.floor((x + r) / 50); gx++) {
      for (let gz = Math.floor((z - r) / 50); gz <= Math.floor((z + r) / 50); gz++) {
        const list = this.treeGrid.get(gx + ',' + gz);
        if (!list) continue;
        for (const t of list) {
          if (t.burnt || Math.hypot(t.x - x, t.z - z) > r * 0.6) continue;
          t.burnt = true;
          q.setFromAxisAngle(up, t.r);
          m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s * 0.6, t.s * 0.45, t.s * 0.6));
          t.mesh.setMatrixAt(t.i, m); t.mesh.setColorAt(t.i, burnt);
          touched.add(t.mesh);
        }
      }
    }
    for (const mesh of touched) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }

    // zniszczone domy
    for (const h of this.houses) {
      if (h.destroyed || Math.hypot(h.x - x, h.z - z) > r * 0.7) continue;
      h.destroyed = true;
      q.setFromAxisAngle(up, h.r + 0.3);
      m.compose(new THREE.Vector3(h.x, h.y - 1, h.z), q, new THREE.Vector3(1.05, 0.28, 1.05));
      const [wm, rm] = this.houseMeshes;
      wm.setMatrixAt(h.i, m); wm.setColorAt(h.i, new THREE.Color(0.3, 0.27, 0.24));
      m.compose(new THREE.Vector3(h.x, h.y - 8, h.z), q, new THREE.Vector3(0.9, 0.5, 0.9));
      rm.setMatrixAt(h.i, m); rm.setColorAt(h.i, new THREE.Color(0.2, 0.15, 0.12));
      for (const mm of this.houseMeshes) { mm.instanceMatrix.needsUpdate = true; mm.instanceColor.needsUpdate = true; }
    }
  }

  resetDamage() {
    this.mesh.geometry.attributes.color.array.set(this.baseColors);
    this.mesh.geometry.attributes.color.needsUpdate = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const touched = new Set();
    for (const t of this.trees) {
      if (!t.burnt) continue;
      t.burnt = false;
      q.setFromAxisAngle(up, t.r);
      m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      t.mesh.setMatrixAt(t.i, m);
      t.mesh.setColorAt(t.i, t.mesh === this.trees[0].mesh ? new THREE.Color(0.2, 0.38, 0.2) : new THREE.Color(0.33, 0.52, 0.2));
      touched.add(t.mesh);
    }
    for (const mesh of touched) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    const rng = mulberry32(99);
    const c = new THREE.Color();
    for (const h of this.houses) {
      if (!h.destroyed) continue;
      h.destroyed = false;
      q.setFromAxisAngle(up, h.r);
      m.compose(new THREE.Vector3(h.x, h.y, h.z), q, new THREE.Vector3(1, 1, 1));
      const [wm, rm] = this.houseMeshes;
      wm.setMatrixAt(h.i, m); rm.setMatrixAt(h.i, m);
      wm.setColorAt(h.i, c.setHSL(0.1, 0.25, 0.75 + rng() * 0.15));
      rm.setColorAt(h.i, c.setHSL(0.03, 0.55, 0.38));
      for (const mm of this.houseMeshes) { mm.instanceMatrix.needsUpdate = true; mm.instanceColor.needsUpdate = true; }
    }
  }

  update() {
    if (this.colorsDirty) {
      this.mesh.geometry.attributes.color.needsUpdate = true;
      this.colorsDirty = false;
    }
  }
}

export { smoothstep, lerp };
