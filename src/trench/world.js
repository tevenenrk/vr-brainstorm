import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../terrain.js';

// Mapa obrony okopów (metry). Wróg nadciąga od północy (−Z) przez ziemię niczyją,
// nasza linia frontu leży przy z ≈ 0, za nią labirynt łączników, okop wspierający i ziemianka z arsenałem.
export const FLOOR = -1.25;        // dno stanowisk strzeleckich (linia ognia)
export const DEEP = -1.85;         // dno łączników i okopu wspierającego (głowa poniżej gruntu)
export const DUG_FLOOR = -2.6;     // podłoga ziemianki
export const DUG_CEIL = -0.42;     // strop ziemianki
export const PARAPET = 0.42;       // worki z piaskiem na przedpiersiu
export const EYE = 0.55;           // wysokość oczu obrońcy stojącego w okopie (nad poziomem gruntu)
// strefa okopów (siatka 1 m)
export const ZX0 = -50, ZX1 = 50, ZZ0 = -6, ZZ1 = 34;
const GW = ZX1 - ZX0, GD = ZZ1 - ZZ0;
// cały teren
export const TX0 = -90, TX1 = 90, TZ0 = -210, TZ1 = 60;
export const SPAWN_Z = [-150, -128];
export const WIRE_Z = [-13, -27];
const T_GROUND = 0, T_TRENCH = 1, T_DUG = 2, T_STAIRS = 3;

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

function canvasTex(w, h, draw, rep) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (rep) t.repeat.set(rep[0], rep[1]);
  return t;
}
function speckle(c, w, h, n, cols, rng, size = 3) { for (let i = 0; i < n; i++) { c.fillStyle = cols[(rng() * cols.length) | 0]; c.fillRect(rng() * w, rng() * h, 1 + rng() * size, 1 + rng() * size); } }

export class TrenchMap {
  constructor(seed = 11) {
    this.rng = mulberry32(seed);
    this.n1 = noise(seed); this.n2 = noise(seed + 5);
    this.cells = new Uint8Array(GW * GD);
    this.floorH = new Float32Array(GW * GD);
    this.extra = new Float32Array(GW * GD);   // worki na przedpiersiu (osłona)
    this.layout();
    this.craters = [];
    for (let k = 0; k < 70; k++) {
      const z = -10 - this.rng() * 175, x = -80 + this.rng() * 160, r = 1.6 + this.rng() * 3.2;
      if (z > -9 - r) continue;
      this.craters.push({ x, z, r, d: r * (0.28 + this.rng() * 0.15) });
    }
    // wysokości terenu poza strefą: siatka 1 m
    this.HX = TX1 - TX0 + 1; this.HZ = TZ1 - TZ0 + 1;
    this.hg = new Float32Array(this.HX * this.HZ);
    for (let j = 0; j < this.HZ; j++) for (let i = 0; i < this.HX; i++) this.hg[j * this.HX + i] = this.gen(TX0 + i, TZ0 + j);
    this.group = new THREE.Group();
    this.buildTerrain();
    this.buildZone();
    this.buildProps();
  }

  // ---------- układ okopów ----------
  paint(x, z, w, d, type = T_TRENCH, floor = DEEP) {
    for (let j = z; j < z + d; j++) for (let i = x; i < x + w; i++) {
      const k = this.idx(i + 0.5, j + 0.5);
      if (k < 0) continue;
      if (this.cells[k] && this.floorH[k] > floor && type === T_TRENCH) continue;   // stanowisko zostaje wyżej
      this.cells[k] = type;
      this.floorH[k] = type === T_DUG ? DUG_FLOOR : floor;
    }
  }
  layout() {
    // linia ognia: stanowiska (z −2..0) i przejścia za trawersami (z 0..2)
    this.bays = [];
    for (let i = -4; i <= 3; i++) {
      const x = i * 10;
      this.paint(x, -2, 7, 2, T_TRENCH, FLOOR);
      this.bays.push({ x0: x, x1: x + 7 });
      if (i < 3) this.paint(x + 5, 0, 7, 2);
    }
    this.paint(-42, -2, 2, 2, T_TRENCH, FLOOR); this.paint(-42, 0, 2, 2);      // skrajne zamknięcie
    // łączniki do okopu wspierającego
    for (const x of [-25, 5, 26]) this.paint(x, 2, 2, 12);
    this.paint(-36, 14, 72, 2);    // okop wspierający
    // labirynt: poprzeczne łączniki i ślepe zaułki
    this.paint(-15, 2, 2, 6); this.paint(-15, 7, 22, 2);
    this.paint(13, 6, 2, 8); this.paint(13, 6, 9, 2);
    this.paint(-34, 8, 11, 2); this.paint(-34, 8, 2, 6);
    this.paint(30, 9, 8, 2); this.paint(36, 9, 2, 5);
    // ziemianka: schody w dół i izba
    this.paint(-1, 16, 2, 4, T_STAIRS);
    for (let j = 16; j < 20; j++) for (let i = -1; i < 1; i++) this.floorH[this.idx(i + 0.5, j + 0.5)] = DEEP + (DUG_FLOOR - DEEP) * ((j - 16 + 0.5) / 4);
    this.paint(-4, 20, 8, 5, T_DUG);
    // przedpiersie: worki na gruncie tuż przed stanowiskami
    for (let i = 0; i < GW; i++) for (let j = 1; j < GD; j++) {
      const k = j * GW + i, kn = (j - 1) * GW + i, z = ZZ0 + j - 1;
      if (this.cells[k] === T_TRENCH && this.cells[kn] === T_GROUND && z < -1) this.extra[kn] = PARAPET;
    }
    // stanowiska minigunów (w trzech stanowiskach): niższy przepust w workach, broń na wysokości piersi
    this.mgPos = [-26.5, 3.5, 23.5].map((x) => new THREE.Vector3(x, 0.3, -2.45));
    for (const p of this.mgPos) for (let x = Math.floor(p.x - 1); x <= Math.floor(p.x + 1); x++) { const k = this.idx(x + 0.5, -2.5); if (this.extra[k]) this.extra[k] = 0.14; }
    // posterunki obrońców (środek każdego stanowiska + zapas)
    this.posts = [];
    for (const b of this.bays) for (const f of [0.25, 0.75]) this.posts.push(new THREE.Vector2(b.x0 + (b.x1 - b.x0) * f, -1.25));
    this.arsenal = { pos: new THREE.Vector3(0, DUG_FLOOR, 23.6), cell: [0, 22] };
    this.spawnPoint = new THREE.Vector2(4.5, -1.1);
  }
  idx(x, z) {
    const i = Math.floor(x - ZX0), j = Math.floor(z - ZZ0);
    if (i < 0 || j < 0 || i >= GW || j >= GD) return -1;
    return j * GW + i;
  }
  cellType(x, z) { const k = this.idx(x, z); return k < 0 ? T_GROUND : this.cells[k]; }
  walkable(x, z) { return this.cellType(x, z) !== T_GROUND; }
  inTrench(x, z) { return this.cellType(x, z) !== T_GROUND; }
  covered(x, z) { const t = this.cellType(x, z); return t === T_DUG || (t === T_STAIRS && Math.floor(z) >= 18); }

  gen(x, z) {
    const inZone = x >= ZX0 && x <= ZX1 && z >= ZZ0 && z <= ZZ1;
    if (inZone) return 0;
    const dzone = Math.max(ZX0 - x, x - ZX1, ZZ0 - z, z - ZZ1, 0);
    let h = fbm(this.n1, x / 30, z / 30, 3) * 0.9 + fbm(this.n2, x / 7, z / 7, 2) * 0.18;
    h *= sm(0, 8, dzone);
    if (z > ZZ1) h += sm(ZZ1, TZ1, z) * 2.5;          // za naszymi plecami lekkie wzniesienie
    for (const c of this.craters) {
      const d = Math.hypot(x - c.x, z - c.z) / c.r;
      if (d < 1) h -= c.d * (1 - d * d) ** 1.2;
      else if (d < 1.45) h += c.d * 0.35 * Math.sin(((d - 1) / 0.45) * Math.PI);
    }
    return h;
  }
  groundAt(x, z) {
    let fx = x - TX0, fz = z - TZ0;
    fx = Math.min(this.HX - 1.0001, Math.max(0, fx)); fz = Math.min(this.HZ - 1.0001, Math.max(0, fz));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, H = this.hg, n = this.HX;
    const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
  // wysokość, na której stoi się w punkcie (dno okopu albo grunt)
  floorAt(x, z) {
    const k = this.idx(x, z);
    if (k >= 0 && this.cells[k] !== T_GROUND) return this.floorH[k];
    return this.groundAt(x, z);
  }
  // wysokość przesłony (grunt + worki; w okopie dno)
  heightAt(x, z) {
    const k = this.idx(x, z);
    if (k >= 0) return this.cells[k] !== T_GROUND ? this.floorH[k] : this.extra[k];
    return this.groundAt(x, z);
  }
  // czy punkt jest w ziemi (uwzględnia strop ziemianki)
  solid(x, y, z) {
    const k = this.idx(x, z);
    if (k >= 0 && this.cells[k] !== T_GROUND) return y < this.floorH[k] || (this.covered(x, z) && y > DUG_CEIL && y < 0.05);
    return y < this.heightAt(x, z);
  }
  // linia wzroku a→b (próbki co 0,45 m; pomija końcówki)
  los(a, b, skipEnd = 0.6) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz);
    const n = Math.ceil(L / 0.45);
    for (let k = 1; k < n; k++) {
      const t = k / n, d = t * L;
      if (d < skipEnd || L - d < skipEnd) continue;
      if (this.solid(a.x + dx * t, a.y + dy * t, a.z + dz * t)) return false;
    }
    return true;
  }
  // promień → teren; zwraca odległość albo Infinity
  rayTerrain(o, d, max) {
    let prev = 0;
    for (let t = 0.3; t < max; t += t < 30 ? 0.25 : 0.6) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (this.solid(x, y, z)) {
        let a = prev, b = t;
        for (let k = 0; k < 8; k++) { const m = (a + b) / 2; if (this.solid(o.x + d.x * m, o.y + d.y * m, o.z + d.z * m)) b = m; else a = m; }
        return b;
      }
      prev = t;
    }
    return Infinity;
  }
  wireAt(x, z) { return WIRE_Z.some((wz) => Math.abs(z - wz) < 1.6) && !this.wireGaps.some((g) => Math.abs(x - g) < 2.2); }

  // ---------- nawigacja po okopach (A*) ----------
  path(fx, fz, tx, tz) {
    const s = this.idx(fx, fz), g = this.idx(tx, tz);
    if (s < 0 || g < 0 || !this.cells[s] || !this.cells[g]) return null;
    if (s === g) return [new THREE.Vector2(tx, tz)];
    const N = GW * GD, gs = this._gs || (this._gs = new Float32Array(N)), from = this._from || (this._from = new Int32Array(N)), mark = this._mark || (this._mark = new Uint32Array(N));
    this._gen = (this._gen || 0) + 1; const gen = this._gen;
    const gi = g % GW, gj = (g / GW) | 0, hfn = (k) => Math.abs((k % GW) - gi) + Math.abs(((k / GW) | 0) - gj);
    const open = [s]; gs[s] = 0; from[s] = -1; mark[s] = gen;
    let found = false, it = 0;
    while (open.length && it++ < 6000) {
      let bi = 0, bf = Infinity;
      for (let q = 0; q < open.length; q++) { const f = gs[open[q]] + hfn(open[q]); if (f < bf) { bf = f; bi = q; } }
      const c = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (c === g) { found = true; break; }
      const ci = c % GW, cj = (c / GW) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= GW || nj >= GD) continue;
        const nk = nj * GW + ni;
        if (!this.cells[nk]) continue;
        const ng = gs[c] + 1;
        if (mark[nk] === gen && ng >= gs[nk]) continue;
        if (mark[nk] !== gen) open.push(nk);
        mark[nk] = gen; gs[nk] = ng; from[nk] = c;
      }
    }
    if (!found) return null;
    const pts = [];
    for (let k = g; k !== -1; k = from[k]) pts.push(new THREE.Vector2(ZX0 + (k % GW) + 0.5, ZZ0 + ((k / GW) | 0) + 0.5));
    pts.reverse(); pts[pts.length - 1].set(tx, tz);
    // wygładzanie: pomijamy punkty, gdy prosty odcinek biegnie po okopie
    const out = [pts[0]];
    let a = 0;
    while (a < pts.length - 1) {
      let b = pts.length - 1;
      while (b > a + 1 && !this.walkLine(pts[a], pts[b])) b--;
      out.push(pts[b]); a = b;
    }
    return out;
  }
  walkLine(a, b) {
    const L = a.distanceTo(b), n = Math.ceil(L / 0.3);
    for (let k = 1; k < n; k++) {
      const t = k / n, x = a.x + (b.x - a.x) * t, z = a.y + (b.y - a.y) * t;
      for (const [ox, oz] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) if (!this.walkable(x + ox, z + oz)) return false;
    }
    return true;
  }
  // najbliższa komórka okopu (dla wroga wskakującego do środka)
  nearestTrench(x, z, r = 4) {
    let best = null, bd = Infinity;
    for (let j = Math.floor(z - r); j <= z + r; j++) for (let i = Math.floor(x - r); i <= x + r; i++) {
      if (!this.walkable(i + 0.5, j + 0.5) || this.covered(i + 0.5, j + 0.5)) continue;
      const d = Math.hypot(i + 0.5 - x, j + 0.5 - z);
      if (d < bd) { bd = d; best = new THREE.Vector2(i + 0.5, j + 0.5); }
    }
    return best;
  }

  // ---------- geometria ----------
  buildTerrain() {
    const rng = this.rng;
    const mud = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#6a5a44'; c.fillRect(0, 0, w, h);
      speckle(c, w, h, 2600, ['#5a4a36', '#7a684e', '#4a3d2c', '#81714f', '#5f5a3c'], rng, 5);
    }, [1, 1]);
    this.mudTex = mud;
    const xs = [], zs = [];
    for (let x = TX0; x < -60; x += 2) xs.push(x);
    for (let x = -60; x < 60; x++) xs.push(x);
    for (let x = 60; x <= TX1; x += 2) xs.push(x);
    for (let z = TZ0; z < -80; z += 2) zs.push(z);
    for (let z = -80; z <= TZ1; z++) zs.push(z);
    const pos = [], col = [], uv = [], idx = [];
    const NXs = xs.length;
    for (const z of zs) for (const x of xs) {
      const h = this.gen(x, z);
      pos.push(x, h, z); uv.push(x / 4, z / 4);
      const g = sm(-60, -200, z) * 0.25, crater = Math.min(1, Math.max(0, -h * 0.6));
      const v = 0.88 + fbm(this.n2, x / 5, z / 5, 2) * 0.25 - crater * 0.25;
      col.push(v * (1 - g * 0.1), v * (1 + g * 0.25), v * (1 - g * 0.3));
    }
    const inZone = (x, z) => x >= ZX0 && x < ZX1 && z >= ZZ0 && z < ZZ1;
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < NXs - 1; i++) {
      if (inZone(xs[i], zs[j])) continue;
      const a = j * NXs + i, b = a + 1, c = a + NXs, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: mud, vertexColors: true }));
    m.receiveShadow = true;
    this.group.add(m);
  }

  buildZone() {
    const rng = this.rng;
    const planks = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#5a4430'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) { c.fillStyle = `rgb(${86 + rng() * 30},${64 + rng() * 22},${42 + rng() * 14})`; c.fillRect(0, y + 2, w, 28); c.fillStyle = '#3a2a1c'; c.fillRect(0, y, w, 2); }
      speckle(c, w, h, 900, ['#4a3a28', '#6a5238', '#3e3020'], rng, 6);
      c.fillStyle = '#2e2218'; for (let x = 0; x < w; x += 64) c.fillRect(x, 0, 6, h);
    });
    const boards = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#3a2e22'; c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 22) { c.fillStyle = `rgb(${92 + rng() * 26},${72 + rng() * 20},${48 + rng() * 14})`; c.fillRect(x + 2, 0, 16, h); }
      c.fillStyle = '#2a2018'; c.fillRect(0, 60, w, 10); c.fillRect(0, 190, w, 10);
      speckle(c, w, h, 600, ['#4a3a2a', '#5a4630'], rng, 4);
    });
    const top = { p: [], c: [], u: [] }, floor = { p: [], c: [], u: [] }, wall = { p: [], c: [], u: [] }, ceil = { p: [], c: [], u: [] };
    const quad = (o, a, b, c, d, ua, shade = 1) => {
      for (const v of [a, b, c, a, c, d]) o.p.push(...v);
      for (const v of [ua[0], ua[1], ua[2], ua[0], ua[2], ua[3]]) o.u.push(...v);
      for (let k = 0; k < 6; k++) o.c.push(shade, shade, shade);
    };
    for (let j = 0; j < GD; j++) for (let i = 0; i < GW; i++) {
      const k = j * GW + i, x0 = ZX0 + i, z0 = ZZ0 + j, x1 = x0 + 1, z1 = z0 + 1, t = this.cells[k];
      if (t === T_GROUND || this.covered(x0 + 0.5, z0 + 0.5)) {
        const v = 0.85 + rng() * 0.2;
        quad(top, [x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [[x0 / 4, z0 / 4], [x0 / 4, z1 / 4], [x1 / 4, z1 / 4], [x1 / 4, z0 / 4]], v);
      }
      if (t === T_GROUND) continue;
      const dark = t === T_DUG ? 0.45 : t === T_STAIRS ? 0.6 : 1;
      const f = this.floorH[k];
      // dno (deski); schody jako stopnie
      quad(floor, [x0, f, z0], [x0, f, z1], [x1, f, z1], [x1, f, z0], [[x0 / 2, z0 / 2], [x0 / 2, z1 / 2], [x1 / 2, z1 / 2], [x1 / 2, z0 / 2]], dark * (0.85 + rng() * 0.2));
      if (this.covered(x0 + 0.5, z0 + 0.5)) quad(ceil, [x0, DUG_CEIL, z0], [x1, DUG_CEIL, z0], [x1, DUG_CEIL, z1], [x0, DUG_CEIL, z1], [[x0 / 2, z0 / 2], [x1 / 2, z0 / 2], [x1 / 2, z1 / 2], [x0 / 2, z1 / 2]], 0.4);
      // ściany tam, gdzie sąsiad to grunt
      const nb = [[0, -1, [x0, z0], [x1, z0]], [0, 1, [x1, z1], [x0, z1]], [-1, 0, [x0, z1], [x0, z0]], [1, 0, [x1, z0], [x1, z1]]];
      for (const [di, dj, A, B] of nb) {
        const ni = i + di, nj = j + dj;
        const nt = ni < 0 || nj < 0 || ni >= GW || nj >= GD ? T_GROUND : this.cells[nj * GW + ni];
        let lo = f, hi = 0;
        // nadproże: zadaszona komórka obok odkrytej
        if (nt !== T_GROUND && this.covered(x0 + 0.5, z0 + 0.5) && !this.covered(ZX0 + ni + 0.5, ZZ0 + nj + 0.5)) {
          quad(wall, [B[0], DUG_CEIL, B[1]], [B[0], 0, B[1]], [A[0], 0, A[1]], [A[0], DUG_CEIL, A[1]], [[0, 0], [0, 0.4], [1, 0.4], [1, 0]], 0.7);
        }
        if (nt !== T_GROUND) {
          // stopień między schodami a sąsiadem
          const nf = this.floorH[nj * GW + ni];
          if (nf >= f - 1e-3) continue;
          hi = f; lo = nf;
          // ściana schodu widoczna od strony niższej komórki
          quad(wall, [B[0], lo, B[1]], [B[0], hi, B[1]], [A[0], hi, A[1]], [A[0], lo, A[1]], [[0, lo], [0, hi], [1, hi], [1, lo]], dark * 0.8);
          continue;
        }
        if (this.covered(x0 + 0.5, z0 + 0.5)) hi = DUG_CEIL;
        const L = Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]), u0 = (A[0] + A[1]) / 2;
        quad(wall, [A[0], lo, A[1]], [A[0], hi, A[1]], [B[0], hi, B[1]], [B[0], lo, B[1]], [[u0, lo / 1.3], [u0, hi / 1.3], [u0 + L / 2, hi / 1.3], [u0 + L / 2, lo / 1.3]], dark * (0.8 + rng() * 0.2));
      }
    }
    const mk = (o, map, side = THREE.FrontSide) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(o.u, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map, vertexColors: true, side }));
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    mk(top, this.mudTex);
    mk(floor, boards);
    mk(wall, planks, THREE.DoubleSide);
    mk(ceil, planks);
  }

  buildProps() {
    const rng = this.rng;
    // worki z piaskiem
    const bagGeo = new THREE.BoxGeometry(0.62, 0.15, 0.36, 2, 1, 1);
    { const p = bagGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setY(i, y * (1 - 0.35 * (Math.abs(x) / 0.31) ** 2)); p.setZ(i, z * (1 - 0.15 * (Math.abs(x) / 0.31) ** 2)); } bagGeo.computeVertexNormals(); }
    const bags = [];
    for (let j = 0; j < GD; j++) for (let i = 0; i < GW; i++) {
      const k = j * GW + i;
      if (!this.extra[k]) continue;
      const x0 = ZX0 + i, z0 = ZZ0 + j;
      for (let l = 0; l < Math.round(this.extra[k] / 0.14); l++) for (let b = 0; b < 2; b++) bags.push([x0 + 0.25 + b * 0.55 + (l % 2) * 0.22, 0.075 + l * 0.14, z0 + 0.6 + (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.15]);
    }
    // osłony minigunów: półkole worków
    for (const p of this.mgPos) for (const sx of [-1, 1]) for (let l = 0; l < 4; l++) bags.push([p.x + sx * 1.75, 0.075 + l * 0.14, p.z - 0.3, Math.PI / 2 + (rng() - 0.5) * 0.2]);
    // nasyp nad ziemianką
    for (let x = -4.5; x < 4.5; x += 0.62) for (let z = 19.6; z < 25.4; z += 0.4) bags.push([x + (rng() - 0.5) * 0.1, 0.075, z, (rng() - 0.5) * 0.3]);
    const bm = new THREE.InstancedMesh(bagGeo, new THREE.MeshLambertMaterial({ color: 0x9a8a62 }), bags.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    bags.forEach(([x, y, z, r], n) => { q.setFromAxisAngle(up, r); m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)); bm.setMatrixAt(n, m); c.setHSL(0.11, 0.25, 0.42 + rng() * 0.1); bm.setColorAt(n, c); });
    bm.castShadow = bm.receiveShadow = true;
    this.group.add(bm);
    // drut kolczasty: pale + zygzaki, z przejściami
    this.wireGaps = [-38 + rng() * 6, -8 + rng() * 6, 22 + rng() * 6];
    const posts = [], wire = [];
    for (const wz of WIRE_Z) {
      for (let x = TX0 + 12; x < TX1 - 12; x += 3) {
        if (this.wireGaps.some((g) => Math.abs(x - g) < 2.2)) continue;
        const y0 = this.groundAt(x, wz);
        posts.push([x, y0, wz + (rng() - 0.5) * 0.6]);
        const n = posts.length - 1;
        if (n > 0 && Math.abs(posts[n - 1][0] - x) < 3.5 && Math.abs(posts[n - 1][2] - posts[n][2]) < 2) {
          const a = posts[n - 1], b = posts[n];
          for (const h of [0.25, 0.55, 0.85]) {
            let prev = [a[0], a[1] + h, a[2]];
            for (let s = 1; s <= 6; s++) {
              const t = s / 6, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + h + (s % 2 ? 0.12 : -0.1), a[2] + (b[2] - a[2]) * t + (s % 2 ? 0.35 : -0.35)];
              wire.push(...prev, ...p); prev = p;
            }
          }
        }
      }
    }
    const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.05, 1.1, 5).translate(0, 0.55, 0), new THREE.MeshLambertMaterial({ color: 0x3a2c1e }), posts.length);
    posts.forEach(([x, y, z], n) => { m.makeRotationZ((rng() - 0.5) * 0.25); m.setPosition(x, y, z); pm.setMatrixAt(n, m); });
    this.group.add(pm);
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    this.group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x5a5650 })));
    // pnie spalonych drzew i kikuty na ziemi niczyjej
    const stumps = [];
    for (let k = 0; k < 26; k++) { const x = -85 + rng() * 170, z = -30 - rng() * 170; stumps.push([x, this.groundAt(x, z), z, 0.6 + rng() * 3.5]); }
    const sm2 = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.22, 1, 6).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x2a221c }), stumps.length);
    stumps.forEach(([x, y, z, h], n) => { m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3)), new THREE.Vector3(1, h, 1)); sm2.setMatrixAt(n, m); });
    this.group.add(sm2);
    // stemple w okopach (pionowe belki co kilka metrów przy ścianach)
    const beams = [];
    for (let j = 0; j < GD; j++) for (let i = 0; i < GW; i++) {
      const k = j * GW + i; if (this.cells[k] !== T_TRENCH || (i + j) % 3) continue;
      for (const [di, dj, ox, oz] of [[0, -1, 0.5, 0.06], [0, 1, 0.5, 0.94], [-1, 0, 0.06, 0.5], [1, 0, 0.94, 0.5]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= GW || nj >= GD || this.cells[nj * GW + ni] === T_GROUND) beams.push([ZX0 + i + ox, ZZ0 + j + oz]);
      }
    }
    const be = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1, 0.12).translate(0, -0.5, 0), new THREE.MeshLambertMaterial({ color: 0x3e2e20 }), beams.length);
    beams.forEach(([x, z], n) => { const f = this.floorAt(x, z); m.makeScale(1, -f + 0.1, 1); m.setPosition(x, 0.1, z); be.setMatrixAt(n, m); });
    this.group.add(be);
    // ziemianka: belki stropu i latarnia
    const dug = new THREE.Group();
    for (let x = -3.5; x <= 3.5; x += 1.2) dug.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 5.2).translate(x, DUG_CEIL - 0.09, 22.5), new THREE.MeshLambertMaterial({ color: 0x3a2a1c })));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false }));
    lamp.position.set(0, DUG_CEIL - 0.35, 22.2); dug.add(lamp);
    const pl = new THREE.PointLight(0xffb060, 3.2, 9, 1.6); pl.position.copy(lamp.position); dug.add(pl);
    this.lampLight = pl;
    // ławka i stół
    dug.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.8).translate(-2.2, DUG_FLOOR + 0.75, 21.2), new THREE.MeshLambertMaterial({ color: 0x5a4430 })));
    for (const [x, z] of [[-3.3, 20.9], [-1.1, 20.9], [-3.3, 21.5], [-1.1, 21.5]]) dug.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.06).translate(x, DUG_FLOOR + 0.375, z), new THREE.MeshLambertMaterial({ color: 0x3a2a1c })));
    this.group.add(dug);
  }
}
