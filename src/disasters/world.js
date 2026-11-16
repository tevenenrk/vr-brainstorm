import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../terrain.js';

// Kwadratowy miniaturowy świat 2 × 2 km. Jednostki: metry "makiety" (wysokości przesadzone).
export const W = 2000;
export const RES = 200;
export const DX = W / RES;
export const MAP_SCALE = 1 / 2500;           // 2 km -> 0,8 m na stole
export const BASE_Y = -70;
export const RESERVOIR_LEVEL = 75;
export const VALLEY_FLOOR = 28;
export const VOLCANO = { x: 230, z: -620, r: 380, h: 300 };
const MOUNT = { x: -620, z: -640 };
export const TOWN = { x0: -60, x1: 340, z0: 60, z1: 460, cx: 140, cz: 260, xs: [-60, 40, 140, 240, 340], zs: [60, 160, 260, 360, 460] };
export const RIVER = [[-560, -520], [-470, -430], [-400, -360], [-330, -280], [-250, -160], [-170, -20], [-130, 130], [-120, 260], [-135, 420], [-60, 600], [120, 680], [420, 725], [620, 760], [1000, 790]];
const DAM_I = 2;
export const DAM = (() => {
  const [px, pz] = RIVER[DAM_I], [ax, az] = RIVER[DAM_I - 1], [bx, bz] = RIVER[DAM_I + 1];
  let dx = bx - ax, dz = bz - az; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
  return { x: px, z: pz, dx, dz, nx: -dz, nz: dx, half: 125, thick: 13, top: 92 };
})();
export const coastX = (z) => 560 + 50 * Math.sin(z / 260) + 25 * Math.sin(z / 90 + 1);
const CAPE = { x: 700, z: -380 };
const MESAS = [{ x: -720, z: 620, r: 85, top: 95 }, { x: -560, z: 860, r: 60, top: 75 }];

// ---------- szum ----------
function makeNoise(rng) {
  const vals = new Float32Array(256), p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) { vals[i] = rng() * 2 - 1; p[i] = i; }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const hash = (i, j) => vals[perm[(i & 255) + perm[j & 255]]];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
const fbm = (n, x, y, o) => { let a = 1, f = 1, s = 0, t = 0; for (let i = 0; i < o; i++) { s += a * n(x * f, y * f); t += a; a *= 0.5; f *= 2.03; } return s / t; };
export const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
const UP = new THREE.Vector3(0, 1, 0);

// odległość punktu od łamanej + parametr długości
function polyDist(pts, x, z) {
  let best = Infinity, bestS = 0, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, l = Math.sqrt(l2);
    let t = ((x - ax) * dx + (z - az) * dz) / l2; t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < best) { best = d; bestS = acc + t * l; }
    acc += l;
  }
  return { d: best, s: bestS };
}
const RIVER_S_DAM = (() => { let s = 0; for (let i = 0; i < DAM_I; i++) s += Math.hypot(RIVER[i + 1][0] - RIVER[i][0], RIVER[i + 1][1] - RIVER[i][1]); return s; })();

function riverShape(s) {
  const k = s - RIVER_S_DAM;
  if (k < -40) return { bed: VALLEY_FLOOR, w: 125, bank: 110 };
  if (k < 0) return { bed: VALLEY_FLOOR, w: lerp(125, 30, (k + 40) / 40), bank: 90 };
  if (k < 320) return { bed: lerp(VALLEY_FLOOR - 2, -3, smoothstep(0, 320, k)), w: lerp(30, 18, k / 320), bank: 80 };
  return { bed: lerp(-3, -8, smoothstep(320, 1900, k)), w: 18 + Math.max(0, k - 1500) * 0.04, bank: 70 };
}

export class World {
  constructor(seed = 7) {
    const rng = mulberry32(seed);
    this.rng = rng;
    this.n1 = makeNoise(rng); this.n2 = makeNoise(rng); this.n3 = makeNoise(rng); this.n4 = makeNoise(rng);
    this.N = RES + 1;
    this.heights = new Float32Array(this.N * this.N);
    for (let j = 0; j < this.N; j++) for (let i = 0; i < this.N; i++) this.heights[j * this.N + i] = this.genHeight(-W / 2 + i * DX, -W / 2 + j * DX);
    this.buildRoads();
    this.applyDam(true);
    this.baseHeights = this.heights.slice();
    this.group = new THREE.Group();
    this.dirty = [Infinity, -1];
    this.bedDirty = false;
    this.stats = { buildings: 0, trees: 0 };
    this.buildTerrainMesh();
    this.buildSkirt();
    this.buildPlatform();
    this.buildBridges();
    this.buildDam();
    this.buildBuildings();
    this.buildTrees();
    this.buildProps();
    this.active = new Set();     // budynki w trakcie animacji
    this.onCollapse = null;
    this.waterSurface = null;    // (x,z) => poziom wody albo null — ustawiane przez symulację wody
  }

  // ---------- ukształtowanie terenu ----------
  desertMask(x, z) { return smoothstep(-300, -430, x) * smoothstep(190, 330, z); }
  volcanoCone(x, z) { return Math.max(0, 1 - Math.hypot(x - VOLCANO.x, z - VOLCANO.z) / VOLCANO.r); }
  townMask(x, z) {
    const dx = Math.max(TOWN.x0 - x, 0, x - TOWN.x1), dz = Math.max(TOWN.z0 - z, 0, z - TOWN.z1);
    return 1 - smoothstep(10, 90, Math.hypot(dx, dz));
  }

  genHeight(x, z) {
    let h = 18 + fbm(this.n1, x / 520 + 3, z / 520 - 2, 4) * 34 + fbm(this.n2, x / 140, z / 140, 3) * 6;
    h = Math.max(h, 6 + fbm(this.n2, x / 80, z / 80, 2) * 2);
    // góry (grzbiety) na północnym zachodzie
    const dm = Math.hypot(x - MOUNT.x, z - MOUNT.z);
    const fall = smoothstep(760, 220, dm);
    if (fall > 0) {
      let m = 0, a = 1, f = 1, t = 0;
      for (let o = 0; o < 5; o++) { const v = 1 - Math.abs(this.n3((x / 420) * f + 9, (z / 420) * f + 4)); m += a * v * v; t += a; a *= 0.5; f *= 2.1; }
      m /= t;
      h += 380 * Math.pow(m, 1.3) * fall + 60 * fall;
    }
    // wulkan ze stożkiem, kraterem i wyrwą w krawędzi (kierunek miasta)
    const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    const cone = Math.max(0, 1 - dv / VOLCANO.r);
    h += VOLCANO.h * Math.pow(cone, 1.6);
    if (dv < 90) h -= (1 - (dv / 90) ** 2) * 50;
    const nx = VOLCANO.x - 10, nz = VOLCANO.z + 88;
    h -= 32 * Math.exp(-(((x - nx) ** 2 + (z - nz) ** 2) / (45 * 45)));
    // pustynia z wydmami i mesami
    const dsm = this.desertMask(x, z);
    if (dsm > 0) {
      const dune = 22 + 9 * Math.sin(x * 0.021 + z * 0.012 + fbm(this.n4, x / 200, z / 200, 2) * 3) + fbm(this.n2, x / 120, z / 120, 2) * 6;
      h = lerp(h, dune, dsm);
    }
    for (const m of MESAS) {
      const d = Math.hypot(x - m.x, z - m.z) + fbm(this.n4, x / 40, z / 40, 2) * 12;
      h = Math.max(h, lerp(m.top, h, smoothstep(m.r * 0.85, m.r * 1.15, d)));
    }
    // miasteczko — wyrównane
    h = lerp(h, 14, this.townMask(x, z));
    // wybrzeże: łagodne zejście, plaża i morze
    const xc = coastX(z);
    h = lerp(h, 4, smoothstep(xc - 240, xc - 30, x));
    if (x > xc - 30) h = lerp(h, 2.4, smoothstep(xc - 30, xc - 5, x));
    if (x > xc) h = lerp(2.4, -42, smoothstep(xc + 5, xc + 280, x)) + fbm(this.n2, x / 60, z / 60, 2) * 2;
    // przylądek z latarnią
    const dc = Math.hypot(x - CAPE.x, z - CAPE.z);
    h = lerp(h, 34 + fbm(this.n2, x / 30, z / 30, 2) * 6, smoothstep(150, 70, dc));
    // obrzeże zbiornika zawsze wyższe niż lustro wody
    const rv = polyDist(RIVER.slice(0, DAM_I + 1), x, z);
    if (rv.d < 380) h = Math.max(h, lerp(RESERVOIR_LEVEL + 35, h, smoothstep(250, 380, rv.d)));
    // rzeka (dolina, zbiornik, kanał do morza)
    const r = polyDist(RIVER, x, z);
    const rs = riverShape(r.s);
    if (r.d < rs.w + rs.bank) h = lerp(rs.bed, h, smoothstep(rs.w, rs.w + rs.bank, r.d));
    return h;
  }

  // zapora: pas wysokiego terenu w poprzek doliny (intact=false — wyrwa w środku)
  applyDam(intact) {
    const N = this.N;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -W / 2 + i * DX, z = -W / 2 + j * DX;
        const rx = x - DAM.x, rz = z - DAM.z;
        const along = rx * DAM.dx + rz * DAM.dz, across = rx * DAM.nx + rz * DAM.nz;
        if (Math.abs(along) > DAM.thick || Math.abs(across) > DAM.half) continue;
        const k = j * N + i;
        if (intact) this.heights[k] = Math.max(this.heights[k], DAM.top);
        else if (Math.abs(across) < 70) this.heights[k] = Math.min(this.heights[k], VALLEY_FLOOR - 1);
      }
    }
  }

  // ---------- drogi ----------
  buildRoads() {
    const xs = TOWN.xs, zs = TOWN.zs;
    const lines = [];
    for (const x of xs) lines.push({ pts: [[x, zs[0]], [x, zs[zs.length - 1]]], town: true });
    for (const z of zs) lines.push({ pts: [[xs[0], z], [xs[xs.length - 1], z]], town: true });
    const coast = [];
    for (let z = -950; z <= 950; z += 50) coast.push([coastX(z) - 75 + (Math.abs(z - CAPE.z) < 160 ? -40 * Math.cos(((z - CAPE.z) / 160) * Math.PI / 2) : 0), z]);
    lines.push({ pts: coast });
    lines.push({ pts: [[-60, 260], [-180, 262], [-300, 280], [-460, 330], [-650, 430], [-820, 520], [-985, 560]] });
    lines.push({ pts: [[340, 260], [coastX(260) - 75, 260]] });
    lines.push({ pts: [[140, 60], [150, -80], [110, -220], [60, -330], [20, -420]] });
    lines.push({ pts: [[-60, 60], [-80, -80], [-150, -200], [-230, -330], [DAM.x - DAM.nx * DAM.half, DAM.z - DAM.nz * DAM.half]] });
    lines.push({ pts: [[140, 460], [150, 600], [170, 760], [140, 985]] });
    lines.push({ pts: [[-650, 430], [-620, 640], [-640, 820], [-700, 985]] });
    lines.push({ pts: [[340, 160], [coastX(160) - 75, 160]] });
    lines.push({ pts: [[340, 360], [coastX(360) - 75, 360]] });

    // profil wysokości wzdłuż drogi (wygładzony, z mostami nad rzeką)
    const N = this.N;
    const bestD = new Float32Array(N * N).fill(Infinity), target = new Float32Array(N * N);
    this.roads = [];
    this.bridgeRuns = [];
    for (const line of lines) {
      const samples = [];
      let acc = 0;
      for (let i = 0; i < line.pts.length - 1; i++) {
        const [ax, az] = line.pts[i], [bx, bz] = line.pts[i + 1];
        const l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / 8));
        for (let k = 0; k < n; k++) {
          const t = k / n;
          samples.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, s: acc + l * t });
        }
        acc += l;
      }
      const last = line.pts[line.pts.length - 1];
      samples.push({ x: last[0], z: last[1], s: acc });
      for (const sm of samples) {
        sm.h = this.heightAtRaw(sm.x, sm.z);
        const r = polyDist(RIVER, sm.x, sm.z);
        sm.chan = r.d < riverShape(r.s).w + 22 && r.s > RIVER_S_DAM + 20;
      }
      // wygładzanie
      const prof = samples.map((sm, i) => {
        if (sm.chan) return null;
        let s = 0, c = 0;
        for (let k = -6; k <= 6; k++) { const o = samples[i + k]; if (o && !o.chan) { s += o.h; c++; } }
        return s / c;
      });
      // most: interpolacja nad kanałem
      for (let i = 0; i < samples.length; i++) {
        if (prof[i] !== null) continue;
        let a = i; while (a > 0 && prof[a] === null) a--;
        let b = i; while (b < samples.length - 1 && prof[b] === null) b++;
        const ha = prof[a] ?? prof[b] ?? 8, hb = prof[b] ?? ha;
        const run = { i0: a, i1: b };
        if (!this.bridgeRuns.some((r) => r.line === line && r.i0 === a)) this.bridgeRuns.push({ ...run, line, samples });
        for (let k = a + 1; k < b; k++) prof[k] = Math.max(lerp(ha, hb, (k - a) / (b - a)), 7);
      }
      samples.forEach((sm, i) => { sm.p = prof[i]; });
      // spłaszczenie terenu pod drogą
      for (const sm of samples) {
        if (sm.chan) continue;
        const i0 = Math.round((sm.x + W / 2) / DX), j0 = Math.round((sm.z + W / 2) / DX);
        for (let j = j0 - 2; j <= j0 + 2; j++) for (let i = i0 - 2; i <= i0 + 2; i++) {
          if (i < 0 || j < 0 || i >= N || j >= N) continue;
          const k = j * N + i, d = Math.hypot(-W / 2 + i * DX - sm.x, -W / 2 + j * DX - sm.z);
          if (d < bestD[k]) { bestD[k] = d; target[k] = sm.p; }
        }
      }
      this.roads.push({ samples, length: acc, town: !!line.town });
    }
    this.roadDist = bestD;
    for (let k = 0; k < N * N; k++) {
      if (bestD[k] > 16) continue;
      this.heights[k] = lerp(this.heights[k], target[k], 1 - smoothstep(7, 16, bestD[k]));
    }
  }

  // punkt na drodze dla parametru s
  roadPoint(road, s) {
    const sm = road.samples;
    s = Math.max(0, Math.min(road.length, s));
    let lo = 0, hi = sm.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (sm[m].s <= s) lo = m; else hi = m; }
    const a = sm[lo], b = sm[hi], t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: lerp(a.p, b.p, t), dx: dx / l, dz: dz / l };
  }

  // ---------- zapytania ----------
  heightAtRaw(x, z) {
    let fx = (x + W / 2) / DX, fz = (z + W / 2) / DX;
    fx = Math.min(RES - 1e-4, Math.max(0, fx)); fz = Math.min(RES - 1e-4, Math.max(0, fz));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, H = this.heights, n = this.N;
    return lerp(lerp(H[j * n + i], H[j * n + i + 1], tx), lerp(H[(j + 1) * n + i], H[(j + 1) * n + i + 1], tx), tz);
  }
  heightAt(x, z) { return this.heightAtRaw(x, z); }
  surfaceAt(x, z) {
    const h = this.heightAt(x, z);
    const w = this.waterSurface ? this.waterSurface(x, z) : null;
    return w !== null && w > h ? w : h;
  }
  inside(x, z) { return Math.abs(x) <= W / 2 && Math.abs(z) <= W / 2; }
  slopeAt(x, z) {
    const gx = (this.heightAt(x + 6, z) - this.heightAt(x - 6, z)) / 12, gz = (this.heightAt(x, z + 6) - this.heightAt(x, z - 6)) / 12;
    return { gx, gz, s: Math.hypot(gx, gz) };
  }

  raycast(o, d) {
    let tmin = -Infinity, tmax = Infinity;
    const lo = [-W / 2, BASE_Y - 1, -W / 2], hi = [W / 2, 700, W / 2];
    const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
    for (let k = 0; k < 3; k++) {
      if (Math.abs(dd[k]) < 1e-9) { if (oo[k] < lo[k] || oo[k] > hi[k]) return null; continue; }
      let t1 = (lo[k] - oo[k]) / dd[k], t2 = (hi[k] - oo[k]) / dd[k];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    }
    if (tmax < tmin || tmax < 0) return null;
    tmin = Math.max(0, tmin);
    let prev = tmin;
    for (let t = tmin; t <= tmax + 4; t += 4) {
      const tt = Math.min(t, tmax);
      if (o.y + d.y * tt <= this.surfaceAt(o.x + d.x * tt, o.z + d.z * tt)) {
        let a = prev, b = tt;
        for (let k = 0; k < 12; k++) { const m = (a + b) / 2; if (o.y + d.y * m <= this.surfaceAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
        const x = o.x + d.x * b, z = o.z + d.z * b;
        return new THREE.Vector3(x, this.surfaceAt(x, z), z);
      }
      prev = tt;
      if (tt >= tmax) break;
    }
    return null;
  }

  // ---------- siatka terenu ----------
  normalAt(i, j, out, k) {
    const N = this.N, H = this.heights;
    const g = (a, b) => H[Math.max(0, Math.min(RES, b)) * N + Math.max(0, Math.min(RES, a))];
    const nx = -(g(i + 1, j) - g(i - 1, j)) / (2 * DX), nz = -(g(i, j + 1) - g(i, j - 1)) / (2 * DX);
    const l = Math.hypot(nx, 1, nz);
    out[k] = nx / l; out[k + 1] = 1 / l; out[k + 2] = nz / l;
  }

  baseColor(x, z, h, ny, k, c) {
    const t = new THREE.Color();
    const grass = c.setRGB(0.34, 0.52, 0.2).lerp(t.setRGB(0.5, 0.6, 0.27), smoothstep(-0.4, 0.4, fbm(this.n2, x / 150, z / 150, 3)));
    if (h < -0.5) return c.setRGB(0.42, 0.4, 0.3).lerp(t.setRGB(0.78, 0.72, 0.52), Math.max(0, 1 + h / 8) * 0.6);
    const xc = coastX(z);
    if (x > xc - 40 && h < 6) return c.setRGB(0.88, 0.81, 0.6);
    // pola uprawne
    const fields = (x > -440 && x < -170 && z > -60 && z < 330) || (z > 690 && x > -260 && x < 430);
    if (fields) {
      const a = 0.25, u = x * Math.cos(a) - z * Math.sin(a), v = x * Math.sin(a) + z * Math.cos(a);
      const id = ((Math.floor(u / 70) * 73856093) ^ (Math.floor(v / 50) * 19349663)) >>> 0;
      const pal = [[0.8, 0.7, 0.33], [0.56, 0.43, 0.26], [0.45, 0.62, 0.22], [0.72, 0.64, 0.3], [0.38, 0.52, 0.2]];
      const p = pal[id % pal.length];
      c.lerp(t.setRGB(p[0], p[1], p[2]), 0.85);
    }
    const ds = this.desertMask(x, z);
    if (ds > 0) c.lerp(t.setRGB(0.86, 0.66, 0.42).lerp(new THREE.Color(0.78, 0.55, 0.34), smoothstep(-0.3, 0.3, fbm(this.n4, x / 90, z / 90, 2))), ds);
    if (this.forestValue(x, z) > 0.05 && this.canForest(x, z, h)) c.lerp(t.setRGB(0.18, 0.32, 0.13), smoothstep(0.05, 0.15, this.forestValue(x, z)));
    // miasto — chodniki
    if (this.townMask(x, z) > 0.9) c.lerp(t.setRGB(0.62, 0.62, 0.6), 0.75);
    // skały, wulkan, śnieg
    const cone = this.volcanoCone(x, z);
    if (cone > 0.25) c.lerp(t.setRGB(0.3, 0.27, 0.26), smoothstep(0.25, 0.45, cone));
    if (ny < 0.8) c.lerp(t.setRGB(0.5, 0.47, 0.43), Math.min(1, (0.8 - ny) * 3));
    if (h > 120 && cone < 0.25) c.lerp(t.setRGB(0.52, 0.5, 0.47), smoothstep(120, 180, h));
    const snow = 215 + fbm(this.n4, x / 60, z / 60, 2) * 25;
    if (h > snow && cone < 0.3) c.lerp(t.setRGB(0.95, 0.96, 0.99), smoothstep(snow, snow + 20, h) * (ny > 0.55 ? 1 : 0.5));
    // drogi
    if (this.roadDist[k] < 7) c.setRGB(0.22, 0.22, 0.24);
    else if (this.roadDist[k] < 10 && this.townMask(x, z) < 0.5) c.lerp(t.setRGB(0.5, 0.45, 0.36), 0.6);
    return c;
  }

  forestValue(x, z) { return fbm(this.n3, x / 300 + 5, z / 300 + 7, 3); }
  canForest(x, z, h) {
    if (h < 6 || h > 215) return false;
    if (this.desertMask(x, z) > 0.3 || this.townMask(x, z) > 0.05 || this.volcanoCone(x, z) > 0.42) return false;
    if (x > coastX(z) - 120) return false;
    const r = polyDist(RIVER, x, z);
    return r.d > riverShape(r.s).w + 15;
  }

  buildTerrainMesh() {
    const N = this.N;
    const pos = new Float32Array(N * N * 3), nrm = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3);
    const c = new THREE.Color();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const x = -W / 2 + i * DX, z = -W / 2 + j * DX, h = this.heights[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      this.normalAt(i, j, nrm, k * 3);
    }
    for (let k = 0; k < N * N; k++) {
      this.baseColor(pos[k * 3], pos[k * 3 + 2], pos[k * 3 + 1], nrm[k * 3 + 1], k, c);
      const jit = 1 + fbm(this.n4, pos[k * 3] / 22, pos[k * 3 + 2] / 22, 2) * 0.1;
      col[k * 3] = c.r * jit; col[k * 3 + 1] = c.g * jit; col[k * 3 + 2] = c.b * jit;
    }
    const idx = new Uint32Array(RES * RES * 6);
    let p = 0;
    for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
      const a = j * N + i, b = a + 1, cc = a + N, d = cc + 1;
      idx[p++] = a; idx[p++] = cc; idx[p++] = b; idx[p++] = b; idx[p++] = cc; idx[p++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    this.basePos = pos.slice(); this.baseNrm = nrm.slice(); this.baseCol = col.slice();
    this.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.mesh.receiveShadow = true; this.mesh.castShadow = true;
    this.group.add(this.mesh);
  }

  buildSkirt() {
    const ROWS = 10, posA = [], colA = [], nrmA = [], idxA = [];
    const c = new THREE.Color();
    const layers = [[0.42, 0.3, 0.2], [0.52, 0.4, 0.27], [0.36, 0.26, 0.18], [0.6, 0.5, 0.36]];
    const edge = (pts, n) => {
      const base = posA.length / 3;
      for (const [x, z] of pts) {
        const h = this.heightAt(x, z);
        for (let r = 0; r <= ROWS; r++) {
          const y = lerp(BASE_Y, h, r / ROWS);
          posA.push(x, y, z); nrmA.push(...n);
          if (r === ROWS || h - y < 4) c.setRGB(0.25, 0.2, 0.13);
          else { const li = Math.floor((y - BASE_Y) / 10 + Math.sin(x * 0.01 + z * 0.01) * 0.6); const l = layers[((li % 4) + 4) % 4]; c.setRGB(l[0], l[1], l[2]); }
          const sh = 0.75 + 0.25 * (r / ROWS);
          colA.push(c.r * sh, c.g * sh, c.b * sh);
        }
      }
      for (let s = 0; s < pts.length - 1; s++) for (let r = 0; r < ROWS; r++) {
        const a = base + s * (ROWS + 1) + r, b = a + 1, cc = a + ROWS + 1, d = cc + 1;
        idxA.push(a, cc, b, b, cc, d);
      }
    };
    const t = [];
    for (let i = 0; i <= RES; i++) t.push(-W / 2 + i * DX);
    edge(t.map((x) => [x, W / 2]), [0, 0, 1]);
    edge(t.slice().reverse().map((x) => [x, -W / 2]), [0, 0, -1]);
    edge(t.slice().reverse().map((z) => [W / 2, z]), [1, 0, 0]);
    edge(t.map((z) => [-W / 2, z]), [-1, 0, 0]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrmA, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3));
    geo.setIndex(idxA);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    this.group.add(m);
  }

  buildPlatform() {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 70, 30, W + 70), new THREE.MeshLambertMaterial({ color: 0x2b3036 }));
    slab.position.y = BASE_Y - 15; slab.receiveShadow = true; slab.castShadow = true;
    this.group.add(slab);
    this.glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffa34f, toneMapped: false });
    const rim = new THREE.Mesh(new THREE.BoxGeometry(W + 76, 5, W + 76), this.glowMaterial);
    rim.position.y = BASE_Y - 32.5;
    this.group.add(rim);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(W + 20, 8, W + 20), new THREE.MeshLambertMaterial({ color: 0x1c2024 }));
    bottom.position.y = BASE_Y - 39;
    this.group.add(bottom);
  }

  buildBridges() {
    const deck = new THREE.MeshLambertMaterial({ color: 0x8b8680 });
    const rail = new THREE.MeshLambertMaterial({ color: 0x5a5d62 });
    for (const run of this.bridgeRuns) {
      const a = run.samples[Math.max(0, run.i0 - 1)], b = run.samples[Math.min(run.samples.length - 1, run.i1 + 1)];
      const len = Math.hypot(b.x - a.x, b.z - a.z), y = Math.max(a.p, b.p, 7);
      const g = new THREE.Group();
      g.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
      g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      const add = (geo, mat, x, yy, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, yy, z); m.castShadow = true; m.receiveShadow = true; g.add(m); };
      add(new THREE.BoxGeometry(16, 2.5, len), deck, 0, -1.2, 0);
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.8, 2.2, len), rail, s * 7.6, 1, 0);
      for (let k = 1; k < 3; k++) add(new THREE.CylinderGeometry(2.4, 2.8, y + 12, 7), rail, 0, -(y + 12) / 2 - 2, -len / 2 + (k * len) / 3);
      this.group.add(g);
    }
  }

  buildDam() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xb7b3aa });
    this.damPieces = [];
    const g = new THREE.Group();
    g.position.set(DAM.x, 0, DAM.z);
    g.rotation.y = Math.atan2(DAM.nx, DAM.nz);
    const n = 7, seg = (DAM.half * 2) / n;
    for (let k = 0; k < n; k++) {
      const off = -DAM.half + seg * (k + 0.5);
      const bottom = Math.min(this.heightAt(DAM.x + DAM.nx * off + DAM.dx * 25, DAM.z + DAM.nz * off + DAM.dz * 25), VALLEY_FLOOR) - 4;
      const h = DAM.top + 2 - bottom;
      const m = new THREE.Mesh(new THREE.BoxGeometry(DAM.thick * 2.2, h, seg + 0.5), mat);
      m.position.set(0, bottom + h / 2, off);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      this.damPieces.push({ mesh: m, base: m.position.clone(), off, center: Math.abs(off) < 70 });
    }
    this.damGroup = g;
    this.group.add(g);
  }

  // ---------- budynki ----------
  buildBuildings() {
    const rng = this.rng;
    const B = [];
    const pastel = () => new THREE.Color().setHSL(rng(), 0.35 + rng() * 0.25, 0.7 + rng() * 0.15);
    const add = (o) => B.push({ rot: 0, roof: false, ...o });
    const { xs, zs } = TOWN;
    for (let bi = 0; bi < xs.length - 1; bi++) for (let bj = 0; bj < zs.length - 1; bj++) {
      const x0 = xs[bi] + 11, x1 = xs[bi + 1] - 11, z0 = zs[bj] + 11, z1 = zs[bj + 1] - 11;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (bi === 1 && bj === 2) { this.park = { x0, x1, z0, z1 }; continue; }     // park
      if (bi === 2 && bj === 1) {                                                   // kościół z wieżą
        add({ x: cx, z: cz + 6, w: 26, d: 44, h: 22, color: new THREE.Color(0.92, 0.88, 0.8), roof: true, roofColor: new THREE.Color(0.35, 0.3, 0.3), kind: 'church' });
        add({ x: cx, z: cz - 26, w: 12, d: 12, h: 52, color: new THREE.Color(0.92, 0.88, 0.8), roof: true, roofColor: new THREE.Color(0.3, 0.42, 0.35), kind: 'church' });
        continue;
      }
      const dc = Math.hypot(cx - TOWN.cx, cz - TOWN.cz);
      for (let li = 0; li < 2; li++) for (let lj = 0; lj < 2; lj++) {
        const lx = lerp(x0, x1, (li + 0.5) / 2), lz = lerp(z0, z1, (lj + 0.5) / 2);
        if (dc < 110) add({ x: lx, z: lz, w: 24 + rng() * 8, d: 24 + rng() * 8, h: 45 + rng() * 55, color: new THREE.Color().setHSL(0.55 + rng() * 0.1, 0.15 + rng() * 0.15, 0.55 + rng() * 0.2), kind: 'tower' });
        else if (dc < 200) add({ x: lx, z: lz, w: 28 + rng() * 6, d: 20 + rng() * 10, h: 16 + rng() * 20, color: pastel(), kind: 'apt' });
        else {
          for (const o of [-1, 1]) add({ x: lx + o * 9, z: lz + (rng() - 0.5) * 8, w: 14, d: 12 + rng() * 4, h: 9 + rng() * 3, color: pastel(), roof: true, roofColor: new THREE.Color().setHSL(0.02 + rng() * 0.05, 0.5, 0.3 + rng() * 0.15), rot: Math.PI / 2, kind: 'house' });
        }
      }
    }
    // hotele przy plaży
    for (let z = -140; z <= 560; z += 115) {
      const x = coastX(z) - 125 + (rng() - 0.5) * 20;
      if (this.heightAt(x, z) < 2) continue;
      add({ x, z, w: 26, d: 40, h: 26 + rng() * 26, color: new THREE.Color().setHSL(0.1 + rng() * 0.5, 0.4, 0.82), kind: 'hotel' });
    }
    // domki plażowe
    for (let z = -600; z <= 800; z += 70) {
      if (z > -180 && z < 600) continue;
      const x = coastX(z) - 100;
      if (this.heightAt(x, z) < 2) continue;
      add({ x, z, w: 12, d: 10, h: 7, color: pastel(), roof: true, roofColor: new THREE.Color(0.6, 0.35, 0.25), kind: 'house' });
    }
    // farmy
    for (const [x, z] of [[-330, 60], [-260, 220], [-400, 200], [60, 780], [300, 820], [-120, 860]]) {
      if (this.heightAt(x, z) < 3) continue;
      add({ x, z, w: 22, d: 30, h: 13, color: new THREE.Color(0.65, 0.18, 0.14), roof: true, roofColor: new THREE.Color(0.3, 0.3, 0.32), kind: 'barn', rot: rng() * Math.PI });
    }
    // stacja benzynowa i domki na pustyni, obserwatorium, domek przy zaporze
    add({ x: -655, z: 470, w: 30, d: 18, h: 7, color: new THREE.Color(0.95, 0.95, 0.9), kind: 'apt' });
    add({ x: -700, z: 400, w: 14, d: 12, h: 8, color: new THREE.Color(0.85, 0.7, 0.55), roof: true, roofColor: new THREE.Color(0.5, 0.3, 0.2), kind: 'house' });
    add({ x: 40, z: -440, w: 18, d: 18, h: 12, color: new THREE.Color(0.9, 0.9, 0.92), roof: true, roofColor: new THREE.Color(0.6, 0.62, 0.65), kind: 'house' });
    add({ x: DAM.x - DAM.nx * (DAM.half + 25), z: DAM.z - DAM.nz * (DAM.half + 25), w: 14, d: 12, h: 8, color: new THREE.Color(0.8, 0.8, 0.78), kind: 'apt' });

    for (const b of B) { b.y = this.heightAt(b.x, b.z) - 0.5; b.state = 'ok'; b.t = 0; b.base = { color: b.color.clone(), roofColor: b.roofColor?.clone() }; }
    this.buildings = B;

    // korpusy budynków: wspólny materiał z proceduralnymi oknami
    const bodyMat = new THREE.MeshLambertMaterial();
    bodyMat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec3 vWinPos;\nvarying vec3 vWinN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 wsc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vWinPos = position * wsc; vWinN = normal;`);
      sh.fragmentShader = 'varying vec3 vWinPos;\nvarying vec3 vWinN;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        if (abs(vWinN.y) < 0.5 && vWinPos.y > 2.5) {
          vec2 wp = abs(vWinN.x) > 0.5 ? vec2(vWinPos.z, vWinPos.y) : vec2(vWinPos.x, vWinPos.y);
          vec2 wf = fract(wp / vec2(5.0, 4.5));
          float ww = step(0.25, wf.x) * step(wf.x, 0.75) * step(0.3, wf.y) * step(wf.y, 0.78);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.21, 0.27), ww * 0.85);
        }`);
    };
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), bodyMat, B.length);
    const roofs = B.filter((b) => b.roof);
    const roofGeo = new THREE.CylinderGeometry(1, 1, 1, 3, 1).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0.5, 0).scale(1.05, 1 / 1.5, (0.5 / 0.866) * 1.08);
    const roof = new THREE.InstancedMesh(roofGeo, new THREE.MeshLambertMaterial({ flatShading: true }), roofs.length);
    let ri = 0;
    B.forEach((b, i) => { b.i = i; if (b.roof) b.ri = ri++; });
    for (const m of [body, roof]) { m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(m); }
    this.bodyMesh = body; this.roofMesh = roof;
    for (const b of B) this.placeBuilding(b);
    body.computeBoundingSphere(); roof.computeBoundingSphere();
  }

  placeBuilding(b) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    let sy = 1, tilt = 0, col = b.color;
    if (b.state === 'collapsing') { const k = Math.min(1, b.t / 2.2); sy = lerp(1, 0.16, k * k); tilt = 0.25 * k * (b.tiltDir || 1); }
    else if (b.state === 'ruin') { sy = 0.16; tilt = 0.25 * (b.tiltDir || 1); }
    else if (b.state === 'gone') sy = 0.04;
    e.set(tilt * 0.4, b.rot, tilt);
    q.setFromEuler(e);
    const h = Math.max(1.2, b.h * sy);
    m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.w, h, b.d));
    this.bodyMesh.setMatrixAt(b.i, m);
    this.bodyMesh.setColorAt(b.i, col);
    if (b.roof) {
      const rh = b.state === 'ok' || b.state === 'burning' ? Math.min(b.w, b.d) * 0.55 : 0.01;
      m.compose(new THREE.Vector3(b.x, b.y + h, b.z), q, new THREE.Vector3(b.w, rh, b.d));
      this.roofMesh.setMatrixAt(b.ri, m);
      this.roofMesh.setColorAt(b.ri, b.roofColor);
    }
    this.bodyMesh.instanceMatrix.needsUpdate = true; this.bodyMesh.instanceColor.needsUpdate = true;
    if (b.roof) { this.roofMesh.instanceMatrix.needsUpdate = true; this.roofMesh.instanceColor.needsUpdate = true; }
  }

  // przyczyna: 'quake' | 'blast' | 'water' | 'fire' | 'snow' | 'lava' | 'pyro'
  collapse(b, cause = 'blast') {
    if (b.state === 'collapsing' || b.state === 'ruin' || b.state === 'gone') return false;
    b.state = 'collapsing'; b.t = 0; b.cause = cause; b.tiltDir = Math.random() < 0.5 ? -1 : 1;
    const dark = cause === 'fire' || cause === 'lava' || cause === 'pyro' ? 0.18 : cause === 'snow' ? 0.85 : 0.42;
    b.color = b.base.color.clone().lerp(new THREE.Color(dark, dark * 0.95, dark * 0.9), cause === 'snow' ? 0.7 : 0.75);
    if (cause === 'water') b.color = new THREE.Color(0.45, 0.4, 0.32);
    this.stats.buildings++;
    this.active.add(b);
    if (b.mesh) b.mesh.visible = false;
    if (this.onCollapse) this.onCollapse(b, cause);
    return true;
  }

  ignite(b) {
    if (b.state !== 'ok') return false;
    b.state = 'burning'; b.t = 0; b.burnTime = 14 + Math.random() * 10;
    this.active.add(b);
    return true;
  }

  // ---------- drzewa ----------
  buildTrees() {
    const rng = this.rng;
    const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
    const geos = {
      conifer: mergeGeometries([new THREE.CylinderGeometry(0.9, 1.2, 5, 5).translate(0, 2.5, 0), new THREE.ConeGeometry(6, 13, 7).translate(0, 9.5, 0), new THREE.ConeGeometry(4.3, 10, 7).translate(0, 15.5, 0)].map(nonIdx)),
      decid: mergeGeometries([new THREE.CylinderGeometry(1, 1.3, 6, 5).translate(0, 3, 0), new THREE.IcosahedronGeometry(6.5, 0).translate(0, 10.5, 0)].map(nonIdx)),
      palm: mergeGeometries([new THREE.CylinderGeometry(0.6, 0.9, 14, 5).translate(0, 7, 0), ...[0, 1, 2, 3, 4].map((k) => new THREE.BoxGeometry(1.2, 0.4, 8).translate(0, 0, 4).rotateX(0.35).rotateY((k * Math.PI * 2) / 5).translate(0, 14, 0))].map(nonIdx)),
      cactus: mergeGeometries([new THREE.CylinderGeometry(1.2, 1.3, 9, 6).translate(0, 4.5, 0), new THREE.CylinderGeometry(0.7, 0.7, 4, 5).translate(2.2, 6, 0), new THREE.CylinderGeometry(0.7, 0.7, 3, 5).translate(-2.0, 5, 0)].map(nonIdx)),
    };
    const colors = { conifer: [0.2, 0.38, 0.2], decid: [0.33, 0.52, 0.2], palm: [0.35, 0.55, 0.22], cactus: [0.3, 0.5, 0.25] };
    const lists = { conifer: [], decid: [], palm: [], cactus: [] };
    const step = 14;
    for (let z = -W / 2 + 8; z < W / 2 - 8; z += step) for (let x = -W / 2 + 8; x < W / 2 - 8; x += step) {
      const px = x + (rng() - 0.5) * step * 0.9, pz = z + (rng() - 0.5) * step * 0.9;
      const h = this.heightAt(px, pz);
      if (this.roadDist[Math.round((pz + W / 2) / DX) * this.N + Math.round((px + W / 2) / DX)] < 12) continue;
      const xc = coastX(pz);
      if (px > xc - 70 && px < xc - 25 && h > 2 && rng() < 0.12) { lists.palm.push([px, h, pz, 0.8 + rng() * 0.4]); continue; }
      if (this.desertMask(px, pz) > 0.7) { if (rng() < 0.012) lists.cactus.push([px, h, pz, 0.8 + rng() * 0.5]); continue; }
      if (!this.canForest(px, pz, h)) {
        if (this.park && px > this.park.x0 && px < this.park.x1 && pz > this.park.z0 && pz < this.park.z1 && rng() < 0.5) lists.decid.push([px, h, pz, 0.7 + rng() * 0.4]);
        continue;
      }
      const fv = this.forestValue(px, pz);
      const sl = this.slopeAt(px, pz).s;
      if (sl > 1.4) continue;
      if (fv > 0.05 ? rng() < 0.72 : rng() < 0.015) {
        const kind = h > 110 || fbm(this.n4, px / 260, pz / 260, 2) + (rng() - 0.5) * 0.5 > 0 ? 'conifer' : 'decid';
        lists[kind].push([px, h, pz, 0.7 + rng() * 0.6]);
      }
    }
    this.trees = [];
    this.treeMeshes = {};
    for (const kind of Object.keys(lists)) {
      const list = lists[kind];
      const mesh = new THREE.InstancedMesh(geos[kind], new THREE.MeshLambertMaterial({ flatShading: true }), Math.max(1, list.length));
      mesh.count = list.length;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const base = new THREE.Color(...colors[kind]);
      list.forEach((tr, i) => {
        const t = { kind, mesh, i, x: tr[0], y: tr[1] - 0.5, z: tr[2], s: tr[3], r: rng() * Math.PI * 2, state: 'ok', t: 0, color: base.clone().offsetHSL((rng() - 0.5) * 0.05, (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.12) };
        this.trees.push(t);
        this.placeTree(t);
      });
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.treeMeshes[kind] = mesh;
      this.group.add(mesh);
    }
    this.treeGrid = new Map();
    for (const t of this.trees) {
      const key = Math.floor(t.x / 50) + ',' + Math.floor(t.z / 50);
      if (!this.treeGrid.has(key)) this.treeGrid.set(key, []);
      this.treeGrid.get(key).push(t);
    }
  }

  treesNear(x, z, r, fn) {
    for (let gx = Math.floor((x - r) / 50); gx <= Math.floor((x + r) / 50); gx++) for (let gz = Math.floor((z - r) / 50); gz <= Math.floor((z + r) / 50); gz++) {
      const l = this.treeGrid.get(gx + ',' + gz);
      if (!l) continue;
      for (const t of l) { const d = Math.hypot(t.x - x, t.z - z); if (d <= r) fn(t, d); }
    }
  }

  placeTree(t) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    let s = new THREE.Vector3(t.s, t.s, t.s), y = t.y, col = t.color;
    if (t.state === 'burning') col = new THREE.Color(1, 0.35 + 0.25 * Math.sin(t.t * 9 + t.i), 0.08);
    else if (t.state === 'burnt') { col = new THREE.Color(0.12, 0.1, 0.09); s.set(t.s * 0.55, t.s * 0.5, t.s * 0.55); }
    else if (t.state === 'buried') { s.setScalar(0.001); }
    if (t.state === 'down') {
      q.setFromAxisAngle(new THREE.Vector3(t.fz || 0, 0, -(t.fx || 1)).normalize(), Math.PI / 2 * 0.95);
      col = t.burnt ? new THREE.Color(0.12, 0.1, 0.09) : col.clone().multiplyScalar(0.7);
    } else q.setFromAxisAngle(UP, t.r);
    y = Math.min(y, this.heightAt(t.x, t.z) - 0.5);
    if (t.state === 'buried') y -= 20;
    m.compose(new THREE.Vector3(t.x, y, t.z), q, s);
    t.mesh.setMatrixAt(t.i, m);
    t.mesh.setColorAt(t.i, col);
    t.mesh.instanceMatrix.needsUpdate = true; t.mesh.instanceColor.needsUpdate = true;
  }

  setTree(t, state, fx = 0, fz = 0) {
    if (t.state === state || t.state === 'buried') return false;
    if (state === 'burning' && t.state !== 'ok') return false;
    if (state === 'down') { t.fx = fx; t.fz = fz; t.burnt = t.state === 'burnt' || t.state === 'burning'; }
    if (t.state === 'ok' && state !== 'burning') this.stats.trees++;
    t.state = state; t.t = 0;
    this.placeTree(t);
    return true;
  }

  // ---------- rekwizyty ----------
  buildProps() {
    const add = (geo, color, x, y, z, ry = 0) => {
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
      m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true;
      this.group.add(m); return m;
    };
    // molo
    const pz = 200, px0 = coastX(pz) - 10;
    add(new THREE.BoxGeometry(200, 2, 12).translate(100, 0, 0), 0x8a6a48, px0, 5, pz);
    for (let k = 0; k < 6; k++) add(new THREE.CylinderGeometry(1, 1, 30, 6), 0x5a4a38, px0 + 20 + k * 34, -10, pz);
    // latarnia morska na przylądku
    const lh = this.heightAt(CAPE.x, CAPE.z);
    const light = new THREE.Group();
    light.position.set(CAPE.x, lh, CAPE.z);
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(5.5 - k * 0.5, 6 - k * 0.5, 9, 12), new THREE.MeshLambertMaterial({ color: k % 2 ? 0xd23a2a : 0xf4f2ee }));
      m.position.y = 4.5 + k * 9; m.castShadow = true; light.add(m);
    }
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 5, 10), new THREE.MeshBasicMaterial({ color: 0xffe9a0, toneMapped: false }));
    lamp.position.y = 48; light.add(lamp);
    this.group.add(light);
    this.buildings.push({ x: CAPE.x, z: CAPE.z, y: lh, w: 12, d: 12, h: 50, kind: 'lighthouse', state: 'ok', mesh: light, color: new THREE.Color(1, 1, 1), base: { color: new THREE.Color(1, 1, 1) }, i: -1 });
    // parasole plażowe
    const umb = [];
    for (let z = -500; z < 700; z += 22) {
      if (this.rng() < 0.45) continue;
      const x = coastX(z) - 15 + (this.rng() - 0.5) * 25;
      if (this.heightAt(x, z) < 1) continue;
      umb.push([x, this.heightAt(x, z), z]);
    }
    const uGeo = mergeGeometries([new THREE.CylinderGeometry(0.3, 0.3, 6, 4).translate(0, 3, 0), new THREE.ConeGeometry(5, 2.5, 8).translate(0, 6.5, 0)].map((g) => g.toNonIndexed()));
    const um = new THREE.InstancedMesh(uGeo, new THREE.MeshLambertMaterial(), umb.length);
    const mm = new THREE.Matrix4();
    umb.forEach((u, i) => { mm.makeTranslation(u[0], u[1], u[2]); um.setMatrixAt(i, mm); um.setColorAt(i, new THREE.Color().setHSL(this.rng(), 0.8, 0.55)); });
    um.computeBoundingSphere();
    this.group.add(um);
    this.umbrellas = { mesh: um, list: umb };
  }

  // ---------- modyfikacje terenu ----------
  markDirty(j0, j1) { this.dirty[0] = Math.min(this.dirty[0], Math.max(0, j0)); this.dirty[1] = Math.max(this.dirty[1], Math.min(RES, j1)); }

  forVerts(x, z, r, fn) {
    const N = this.N;
    const i0 = Math.max(0, Math.floor((x - r + W / 2) / DX)), i1 = Math.min(RES, Math.ceil((x + r + W / 2) / DX));
    const j0 = Math.max(0, Math.floor((z - r + W / 2) / DX)), j1 = Math.min(RES, Math.ceil((z + r + W / 2) / DX));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(-W / 2 + i * DX - x, -W / 2 + j * DX - z);
      if (d <= r) fn(j * N + i, d / r, i, j);
    }
    return [i0, i1, j0, j1];
  }

  refreshGeometry(i0, i1, j0, j1) {
    const pos = this.mesh.geometry.attributes.position.array, nrm = this.mesh.geometry.attributes.normal.array, N = this.N;
    for (let j = Math.max(0, j0 - 1); j <= Math.min(RES, j1 + 1); j++) for (let i = Math.max(0, i0 - 1); i <= Math.min(RES, i1 + 1); i++) {
      const k = j * N + i;
      pos[k * 3 + 1] = this.heights[k];
      this.normalAt(i, j, nrm, k * 3);
    }
    this.markDirty(j0 - 1, j1 + 1);
    this.bedDirty = true;
  }

  // podniesienie/obniżenie terenu pędzlem; color — opcjonalny kolor nakładany z siłą
  addHeight(x, z, r, dh, color, strength = 1) {
    const col = this.mesh.geometry.attributes.color.array;
    const ext = this.forVerts(x, z, r, (k, d) => {
      const f = (1 - d * d) * (1 - d * d);
      this.heights[k] += dh * f;
      if (color) { const s = Math.min(1, f * strength * 1.5); col[k * 3] = lerp(col[k * 3], color.r, s); col[k * 3 + 1] = lerp(col[k * 3 + 1], color.g, s); col[k * 3 + 2] = lerp(col[k * 3 + 2], color.b, s); }
    });
    this.refreshGeometry(...ext);
  }

  paint(x, z, r, color, strength = 0.6) {
    const col = this.mesh.geometry.attributes.color.array;
    const ext = this.forVerts(x, z, r, (k, d) => {
      const s = (1 - d * d) * strength;
      col[k * 3] = lerp(col[k * 3], color.r, s); col[k * 3 + 1] = lerp(col[k * 3 + 1], color.g, s); col[k * 3 + 2] = lerp(col[k * 3 + 2], color.b, s);
    });
    this.markDirty(ext[2], ext[3]);
  }

  // globalne przyciemnienie (np. popiół): f(x,z) -> siła 0..1
  paintAll(color, fn) {
    const col = this.mesh.geometry.attributes.color.array, pos = this.basePos;
    for (let k = 0; k < this.N * this.N; k++) {
      const s = fn(pos[k * 3], pos[k * 3 + 2]);
      if (s <= 0) continue;
      col[k * 3] = lerp(col[k * 3], color.r, s); col[k * 3 + 1] = lerp(col[k * 3 + 1], color.g, s); col[k * 3 + 2] = lerp(col[k * 3 + 2], color.b, s);
    }
    this.markDirty(0, RES);
  }

  breakDam() {
    this.applyDam(false);
    this.refreshGeometry(0, RES, Math.max(0, Math.floor((DAM.z - 200 + W / 2) / DX)), Math.min(RES, Math.ceil((DAM.z + 200 + W / 2) / DX)));
    for (const p of this.damPieces) if (p.center) { p.falling = true; p.t = 0; }
  }

  update(dt) {
    for (const b of this.active) {
      b.t += dt;
      if (b.state === 'collapsing') {
        if (b.t >= 2.2) { b.state = 'ruin'; this.active.delete(b); }
        if (b.i >= 0) this.placeBuilding(b);
      } else if (b.state === 'burning') {
        const k = Math.min(1, b.t / b.burnTime);
        b.color = b.base.color.clone().lerp(new THREE.Color(0.12, 0.1, 0.09), k);
        if (b.roofColor) b.roofColor = b.base.roofColor.clone().lerp(new THREE.Color(0.1, 0.08, 0.07), k);
        if (b.i >= 0) this.placeBuilding(b);
        if (b.t > b.burnTime) { b.state = 'ok'; this.collapse(b, 'fire'); }
      } else this.active.delete(b);
    }
    for (const p of this.damPieces) {
      if (!p.falling) continue;
      p.t += dt;
      const k = Math.min(1, p.t / 2.5);
      p.mesh.position.set(p.base.x + k * 40 * Math.sign(p.off || 1) * 0.2 + k * 60, p.base.y - k * k * 50, p.base.z);
      p.mesh.rotation.z = -k * 1.1;
      if (k >= 1) { p.falling = false; p.mesh.visible = false; }
    }
    if (this.dirty[1] >= 0) {
      const N = this.N, start = this.dirty[0] * N * 3, count = (this.dirty[1] - this.dirty[0] + 1) * N * 3;
      const g = this.mesh.geometry.attributes;
      for (const a of [g.position, g.normal, g.color]) { a.clearUpdateRanges(); a.addUpdateRange(start, count); a.needsUpdate = true; }
      this.dirty = [Infinity, -1];
    }
  }

  reset() {
    this.heights.set(this.baseHeights);
    const g = this.mesh.geometry.attributes;
    g.position.array.set(this.basePos); g.normal.array.set(this.baseNrm); g.color.array.set(this.baseCol);
    this.markDirty(0, RES);
    this.bedDirty = true;
    for (const t of this.trees) if (t.state !== 'ok') { t.state = 'ok'; t.t = 0; this.placeTree(t); }
    for (const b of this.buildings) {
      b.state = 'ok'; b.t = 0; b.color = b.base.color.clone(); if (b.base.roofColor) b.roofColor = b.base.roofColor.clone();
      if (b.mesh) b.mesh.visible = true;
      if (b.i >= 0) this.placeBuilding(b);
    }
    this.active.clear();
    for (const p of this.damPieces) { p.falling = false; p.mesh.visible = true; p.mesh.position.copy(p.base); p.mesh.rotation.set(0, 0, 0); }
    this.stats = { buildings: 0, trees: 0 };
  }
}
