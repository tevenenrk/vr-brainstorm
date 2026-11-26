import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Miasto z budynków złożonych z segmentów (jedno piętro × 4 m × 4 m).
// Każdy segment ma strop, słupy i (na zewnątrz) płyty fasady. Uszkodzenia:
//  - uderzenie przekazuje energię w głąb konstrukcji (więcej w kierunku ciosu), segmenty pękają albo się kruszą,
//  - fasady (szyby, okładzina) pękają przy słabszych ciosach,
//  - po każdej zmianie liczona jest ścieżka podparcia do gruntu (wspornik ma ograniczony zasięg) — co traci podparcie, odpada jako bryła,
//  - liczone jest obciążenie słupów; przeciążone i nadwyrężone segmenty po chwili się łamią (postępujące zawalenie).
export const CW = 4, CH = 3.6, SLAB = 0.45;
const NB = 6, BLOCK = 64, STREET = 20;
export const HALF = (NB * BLOCK + (NB + 1) * STREET) / 2;
export const WATER_Z = HALF + 46;
const RG = 4, RN = Math.ceil((HALF + 50) * 2 / RG), R0 = -(RN * RG) / 2;
const HB = 64;                       // komórka siatki budynków

export const TYPES = {
  brick: { name: 'kamienica', hp: 45, span: 1, panelHp: 16, row: 0, color: [0.78, 0.66, 0.58], debris: [0x8a4a36, 0xa08a74, 0x6e4c3c, 0xb09a84], density: 1.0 },
  concrete: { name: 'biurowiec', hp: 95, span: 2, panelHp: 26, row: 1, color: [0.72, 0.71, 0.68], debris: [0x9a9a92, 0x84847c, 0xb0aea4, 0x6a6a64], density: 1.2 },
  glass: { name: 'wieżowiec', hp: 140, span: 3, panelHp: 5, row: 2, color: [0.62, 0.64, 0.68], debris: [0x8e9298, 0x6a7686, 0x9aa8b8, 0x5a6066], density: 1.1 },
};
const TYPE_LIST = ['brick', 'concrete', 'glass'];
const FACES = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
const NB6 = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- tekstury fasad (atlas 2 × 4: nienaruszona / zniszczona; cegła, beton, szkło, dach) ----------
function facadeAtlas() {
  const T = 256, cv = document.createElement('canvas'); cv.width = T * 2; cv.height = T * 4;
  const c = cv.getContext('2d'), R = mulberry32(3);
  const noise = (x0, y0, n, cols, s = 3) => { for (let k = 0; k < n; k++) { c.fillStyle = cols[(R() * cols.length) | 0]; c.fillRect(x0 + R() * T, y0 + R() * T, s * (0.5 + R()), s * (0.5 + R())); } };
  const crack = (x0, y0, n, w = 3) => { c.strokeStyle = 'rgba(20,16,12,0.85)'; c.lineWidth = w; for (let k = 0; k < n; k++) { let x = x0 + R() * T, y = y0 + R() * T; c.beginPath(); c.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (R() - 0.5) * 60; y += (R() - 0.3) * 50; c.lineTo(Math.min(x0 + T, Math.max(x0, x)), Math.min(y0 + T, Math.max(y0, y))); } c.stroke(); } };
  const brokenWin = (x, y, w, h) => { c.fillStyle = '#0c0d10'; c.fillRect(x, y, w, h); c.fillStyle = 'rgba(150,180,200,0.55)'; for (let k = 0; k < 3; k++) { c.beginPath(); const sx = x + R() * w; c.moveTo(sx, y); c.lineTo(sx + (R() - 0.5) * w * 0.6, y + h * (0.3 + R() * 0.5)); c.lineTo(sx + (R() - 0.5) * w * 0.3, y); c.fill(); } };
  for (let col = 0; col < 2; col++) {
    const dmg = col === 1;
    // cegła
    let x0 = col * T, y0 = 0;
    c.fillStyle = '#8a4e3a'; c.fillRect(x0, y0, T, T);
    for (let y = 0; y < T; y += 12) for (let x = (y / 12) % 2 ? -12 : 0; x < T; x += 24) { c.fillStyle = ['#94553e', '#7e4634', '#9a5c44'][(R() * 3) | 0]; c.fillRect(x0 + x + 1, y0 + y + 1, 22, 10); }
    for (const wx of [40, 148]) { c.fillStyle = '#e8dcc8'; c.fillRect(x0 + wx - 6, y0 + 60, 80, 120); if (dmg) brokenWin(x0 + wx, y0 + 66, 68, 108); else { const g = c.createLinearGradient(0, y0 + 66, 0, y0 + 174); g.addColorStop(0, '#5a7a96'); g.addColorStop(1, '#2a3a4a'); c.fillStyle = g; c.fillRect(x0 + wx, y0 + 66, 68, 108); c.fillStyle = '#e8dcc8'; c.fillRect(x0 + wx + 32, y0 + 66, 4, 108); c.fillRect(x0 + wx, y0 + 112, 68, 4); } }
    c.fillStyle = '#6a3a2a'; c.fillRect(x0, y0 + 240, T, 16);
    if (dmg) { crack(x0, y0, 7); noise(x0, y0, 120, ['#3a2a20', '#5a4a3a'], 5); }
    // beton
    y0 = T;
    c.fillStyle = '#a8a69e'; c.fillRect(x0, y0, T, T); noise(x0, y0, 400, ['#9a988f', '#b4b2aa'], 3);
    if (dmg) brokenWin(x0 + 10, y0 + 70, T - 20, 100); else { const g = c.createLinearGradient(0, y0 + 70, 0, y0 + 170); g.addColorStop(0, '#6a8aa4'); g.addColorStop(1, '#30404e'); c.fillStyle = g; c.fillRect(x0 + 10, y0 + 70, T - 20, 100); c.fillStyle = '#8a8880'; for (let x = 10; x < T; x += 59) c.fillRect(x0 + x, y0 + 70, 5, 100); }
    c.fillStyle = '#8a8880'; c.fillRect(x0, y0 + 236, T, 20);
    if (dmg) { crack(x0, y0 + 0, 6); noise(x0, y0, 100, ['#4a4844', '#6a6862'], 6); }
    // szkło
    y0 = T * 2;
    if (dmg) { c.fillStyle = '#101216'; c.fillRect(x0, y0, T, T); for (let k = 0; k < 9; k++) { c.fillStyle = `rgba(${120 + R() * 60},${150 + R() * 60},${180 + R() * 50},0.6)`; c.beginPath(); const sx = x0 + R() * T, sy = y0 + R() * T; c.moveTo(sx, sy); c.lineTo(sx + (R() - 0.5) * 90, sy + (R() - 0.5) * 90); c.lineTo(sx + (R() - 0.5) * 90, sy + (R() - 0.5) * 90); c.fill(); } }
    else { const g = c.createLinearGradient(x0, y0, x0 + T, y0 + T); g.addColorStop(0, '#7aa0c0'); g.addColorStop(0.5, '#3a5a7a'); g.addColorStop(1, '#5a7c9a'); c.fillStyle = g; c.fillRect(x0, y0, T, T); c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.moveTo(x0 + 40, y0); c.lineTo(x0 + 120, y0); c.lineTo(x0 + 30, y0 + T); c.lineTo(x0 - 50, y0 + T); c.fill(); }
    c.fillStyle = '#2a3036'; for (let x = 0; x <= T; x += 64) c.fillRect(x0 + x - 3, y0, 6, T); c.fillRect(x0, y0 + T - 18, T, 18); c.fillRect(x0, y0, T, 5);
    // dach
    y0 = T * 3;
    c.fillStyle = '#6a6862'; c.fillRect(x0, y0, T, T); noise(x0, y0, 900, ['#5e5c56', '#76746e', '#4e4c48'], 2);
    c.fillStyle = '#4a4844'; c.fillRect(x0, y0, T, 10); c.fillRect(x0, y0, 10, T); c.fillRect(x0 + T - 10, y0, 10, T); c.fillRect(x0, y0 + T - 10, T, 10);
    if (dmg) { crack(x0, y0, 8, 4); noise(x0, y0, 160, ['#2a2826', '#3a3834'], 7); }
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

export class City {
  constructor(scene, seed = 7) {
    this.scene = scene; this.seed = seed;
    this.onBreak = null; this.onPanel = null; this.onCreak = null; this.onFail = null;
    this.atlas = facadeAtlas();
    this.group = new THREE.Group(); scene.add(this.group);
    this.buildGround();
    this.build();
  }

  // ---------- generowanie ----------
  generate(R) {
    const out = [], cars = [], blocks = [];
    for (let j = 0; j < NB; j++) for (let i = 0; i < NB; i++) {
      const bx = -HALF + STREET + i * (BLOCK + STREET), bz = -HALF + STREET + j * (BLOCK + STREET);
      blocks.push([bx, bz, i, j]);
      if (i === 2 && j === 3) continue;                          // park
      const d = Math.hypot(bx + BLOCK / 2, bz + BLOCK / 2);
      const M = 14, base = 4;                                    // 14 segmentów w kwartale (chodnik 4 m)
      const sx = R() < 0.5 ? 7 : 6 + ((R() * 3) | 0), sz = R() < 0.5 ? 7 : 6 + ((R() * 3) | 0);
      const lots = [[0, 0, sx, sz], [sx, 0, M - sx, sz], [0, sz, sx, M - sz], [sx, sz, M - sx, M - sz]];
      // śródmieście: czasem jeden wielki wieżowiec na pół kwartału
      if (d < 90 && R() < 0.5) { lots.length = 0; lots.push([0, 0, M, 7], [0, 7, 7, 7], [7, 7, 7, 7]); }
      for (const [lx, lz, lw, ld] of lots) {
        if (d > 200 && R() < 0.22) continue;                     // podwórko / parking
        let type, ny;
        const r = R();
        if (d < 95) { if (r < 0.55) { type = 'glass'; ny = 14 + ((R() * 13) | 0); } else { type = 'concrete'; ny = 8 + ((R() * 7) | 0); } }
        else if (d < 175) { if (r < 0.6) { type = 'concrete'; ny = 5 + ((R() * 7) | 0); } else { type = 'brick'; ny = 3 + ((R() * 4) | 0); } }
        else { if (r < 0.72) { type = 'brick'; ny = 2 + ((R() * 4) | 0); } else { type = 'concrete'; ny = 4 + ((R() * 4) | 0); } }
        const [lo, hi] = type === 'glass' ? [5, 6] : type === 'concrete' ? [4, 5] : [3, 4];
        const pick = () => lo + ((R() * (hi - lo + 1)) | 0);
        const nx = Math.max(3, Math.min(pick(), lw - 1)), nz = Math.max(3, Math.min(pick(), ld - 1));
        const ox = lx + Math.floor((lw - nx) / 2), oz = lz + Math.floor((ld - nz) / 2);
        out.push({ type, x0: bx + base / 2 + ox * CW, z0: bz + base / 2 + oz * CW, nx, ny, nz });
      }
    }
    // budżet segmentów (wydajność gogli)
    // budżet: proporcjonalnie niższe budynki, gdy segmentów za dużo
    const total = out.reduce((s, b) => s + b.nx * b.ny * b.nz, 0), f = Math.min(1, 14000 / total);
    if (f < 1) for (const b of out) b.ny = Math.max(2, Math.round(b.ny * f));
    this.genTotal = total;
    // samochody na krawężnikach
    const streets = [];
    for (let k = 0; k <= NB; k++) { const c = -HALF + k * (BLOCK + STREET) + STREET / 2; streets.push(c); }
    for (const c of streets) for (let t = -HALF + 6; t < HALF - 6; t += 9 + R() * 7) {
      if (streets.some((s) => Math.abs(s - t) < 13)) continue;
      for (const side of [-1, 1]) if (R() < 0.42) {
        cars.push({ x: c + side * 6.2, z: t, yaw: Math.PI / 2 * (R() < 0.5 ? 0 : 2) });
        cars.push({ x: t, z: c + side * 6.2, yaw: Math.PI / 2 });
      }
    }
    return { buildings: out, cars, blocks };
  }

  build() {
    const R = mulberry32(this.seed);
    const g = this.generate(R);
    this.carSpots = g.cars; this.blocks = g.blocks;
    const B = this.buildings = g.buildings.map((b, id) => ({ ...b, id, T: TYPES[b.type], broken: 0, dirty: true, needSupport: false, loadDirty: true }));
    let N = 0, M = 0;
    for (const b of B) {
      b.c0 = N; b.n = b.nx * b.ny * b.nz; N += b.n;
      b.cap = 1.7 * b.ny + 4;
      b.p0 = M;
      for (let iy = 0; iy < b.ny; iy++) for (let iz = 0; iz < b.nz; iz++) for (let ix = 0; ix < b.nx; ix++) {
        if (ix === b.nx - 1) M++; if (ix === 0) M++; if (iz === b.nz - 1) M++; if (iz === 0) M++; if (iy === b.ny - 1) M++;
      }
      b.p1 = M;
    }
    this.N = N; this.M = M;
    this.bld = new Int32Array(N); this.cx = new Int16Array(N); this.cy = new Int16Array(N); this.cz = new Int16Array(N);
    this.st = new Uint8Array(N);              // 0 stoi, 1 w spadającej bryle, 2 zniszczony, 3 bryła leży
    this.hp = new Float32Array(N); this.dmg = new Float32Array(N); this.heat = new Float32Array(N); this.load = new Float32Array(N);
    this.clusterOf = new Int32Array(N).fill(-1);
    this.cpos = new Float32Array(N * 3); this.cmat = new Float32Array(N * 16);
    this.panelOf = new Int32Array(N * 5).fill(-1);
    this.pChunk = new Int32Array(M); this.pFace = new Uint8Array(M); this.pDmg = new Float32Array(M); this.pSt = new Uint8Array(M);
    let p = 0;
    for (const b of B) {
      for (let iy = 0; iy < b.ny; iy++) for (let iz = 0; iz < b.nz; iz++) for (let ix = 0; ix < b.nx; ix++) {
        const id = b.c0 + (iy * b.nz + iz) * b.nx + ix;
        this.bld[id] = b.id; this.cx[id] = ix; this.cy[id] = iy; this.cz[id] = iz;
        this.hp[id] = b.T.hp * (iy === 0 ? 1.25 : 1) * (0.85 + R() * 0.3);
        this.cpos[id * 3] = b.x0 + (ix + 0.5) * CW; this.cpos[id * 3 + 1] = (iy + 0.5) * CH; this.cpos[id * 3 + 2] = b.z0 + (iz + 0.5) * CW;
        const faces = [ix === b.nx - 1, ix === 0, iz === b.nz - 1, iz === 0, iy === b.ny - 1];
        for (let f = 0; f < 5; f++) if (faces[f]) { this.panelOf[id * 5 + f] = p; this.pChunk[p] = id; this.pFace[p] = f; p++; }
      }
    }
    // siatka budynków
    this.hash = new Map();
    for (const b of B) {
      b.box = new THREE.Box3(new THREE.Vector3(b.x0, 0, b.z0), new THREE.Vector3(b.x0 + b.nx * CW, b.ny * CH, b.z0 + b.nz * CW));
      for (let i = Math.floor(b.x0 / HB); i <= Math.floor(b.box.max.x / HB); i++) for (let j = Math.floor(b.z0 / HB); j <= Math.floor(b.box.max.z / HB); j++) {
        const k = i * 1000 + j; if (!this.hash.has(k)) this.hash.set(k, []); this.hash.get(k).push(b);
      }
    }
    this.failing = []; this.recent = [];
    this.totalChunks = N; this.brokenChunks = 0;
    this.buildMeshes();
    this.rubbleInit();
    for (const b of B) this.refresh(b);
    this.flush();
  }
  reset() {
    this.group.remove(this.frameMesh, this.panelMesh, this.rubbleMesh);
    this.frameMesh.geometry.dispose(); this.panelMesh.geometry.dispose(); this.rubbleMesh.geometry.dispose();
    this.build();
  }

  // ---------- siatki ----------
  buildMeshes() {
    // szkielet segmentu: strop + dwa słupy (widoczny tylko, gdy segment jest odsłonięty)
    const slab = new THREE.BoxGeometry(CW - 0.06, SLAB, CW - 0.06).translate(0, -CH / 2 + SLAB / 2, 0);
    const colA = new THREE.BoxGeometry(0.5, CH - SLAB, 0.5).translate(-CW / 2 + 0.3, SLAB / 2, -CW / 2 + 0.3);
    const colB = new THREE.BoxGeometry(0.5, CH - SLAB, 0.5).translate(CW / 2 - 0.3, SLAB / 2, CW / 2 - 0.3);
    const wall = new THREE.BoxGeometry(0.18, CH - SLAB - 0.9, CW * 0.45).translate(0.4, SLAB / 2 - 0.45, -0.6);    // ścianka działowa
    const geo = mergeGeometries([slab, colA, colB, wall]);
    this.frameMesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), this.N);
    this.frameMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.frameMesh.setColorAt(0, new THREE.Color()); this.frameMesh.count = 0; this.frameMesh.frustumCulled = false;
    this.group.add(this.frameMesh);
    this.frameSet = new Set(); this.frameDirty = true;
    // płyty fasad i dachów
    const pg = new THREE.PlaneGeometry(CW, CH);
    this.tile = new THREE.InstancedBufferAttribute(new Float32Array(this.M * 2), 2).setUsage(THREE.DynamicDrawUsage);
    pg.setAttribute('aTile', this.tile);
    const pm = new THREE.MeshLambertMaterial({ map: this.atlas });
    pm.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aTile;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vMapUv * vec2(0.5, 0.25) + aTile;');
    };
    this.panelMesh = new THREE.InstancedMesh(pg, pm, this.M);
    this.panelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.panelMesh.setColorAt(0, new THREE.Color()); this.panelMesh.frustumCulled = false;
    this.group.add(this.panelMesh);
    this.panelMesh.renderOrder = -1;
    this.panelLocal = FACES.map((n, f) => {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3(n[0] * (CW / 2 + 0.03), n[1] * (CH / 2 + 0.02), n[2] * (CW / 2 + 0.03));
      if (f === 0) q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      if (f === 1) q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
      if (f === 3) q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      if (f === 4) { q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); s.set(1, CW / CH, 1); }
      return m.compose(pos, q, s);
    });
    this.pRange = [Infinity, -1];
    for (let p = 0; p < this.M; p++) this.writePanel(p);
  }
  // macierz segmentu (stojący: przesunięcie; w bryle: zapisana przez fizykę)
  chunkMatrix(id, out) {
    if (this.st[id] === 0) return out.makeTranslation(this.cpos[id * 3], this.cpos[id * 3 + 1], this.cpos[id * 3 + 2]);
    return out.fromArray(this.cmat, id * 16);
  }
  setClusterMatrix(id, m) {
    m.toArray(this.cmat, id * 16);
    this.cpos[id * 3] = m.elements[12]; this.cpos[id * 3 + 1] = m.elements[13]; this.cpos[id * 3 + 2] = m.elements[14];
    const b = this.buildings[this.bld[id]];
    for (let f = 0; f < 5; f++) { const p = this.panelOf[id * 5 + f]; if (p >= 0 && this.pSt[p] < 2) this.writePanel(p); }
    this.frameDirty = true; void b;
  }
  writePanel(p) {
    const id = this.pChunk[p], m = this._pm || (this._pm = new THREE.Matrix4()), cm = this._cm || (this._cm = new THREE.Matrix4());
    if (this.pSt[p] === 2 || this.st[id] === 2) m.makeScale(0, 0, 0);
    else m.multiplyMatrices(this.chunkMatrix(id, cm), this.panelLocal[this.pFace[p]]);
    this.panelMesh.setMatrixAt(p, m);
    const b = this.buildings[this.bld[id]], row = this.pFace[p] === 4 ? 3 : b.T.row;
    this.tile.setXY(p, this.pSt[p] === 1 || this.dmg[id] > this.hp[id] * 0.55 ? 0.5 : 0, 1 - (row + 1) * 0.25);
    const r = Math.min(1, this.dmg[id] / this.hp[id]), h = this.heat[id];
    const c = this._col || (this._col = new THREE.Color());
    c.setRGB((1 - 0.4 * r) + h * 2.2, (1 - 0.42 * r) + h * 0.7, (1 - 0.45 * r) + h * 0.1);
    this.panelMesh.setColorAt(p, c);
    if (p < this.pRange[0]) this.pRange[0] = p; if (p > this.pRange[1]) this.pRange[1] = p;
  }
  // czy szkielet segmentu jest widoczny (odsłonięty)
  exposed(id) {
    const s = this.st[id];
    if (s === 2) return false;
    if (s !== 0) return true;
    const b = this.buildings[this.bld[id]], ix = this.cx[id], iy = this.cy[id], iz = this.cz[id];
    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = NB6[f], jx = ix + dx, jy = iy + dy, jz = iz + dz;
      if (jy < 0) continue;
      if (jx < 0 || jz < 0 || jx >= b.nx || jz >= b.nz || jy >= b.ny) { const p = this.panelOf[id * 5 + f]; if (p < 0 || this.pSt[p] === 2) return true; continue; }
      if (this.st[b.c0 + (jy * b.nz + jz) * b.nx + jx] !== 0) return true;
    }
    return false;
  }
  refresh(b) {
    for (let id = b.c0; id < b.c0 + b.n; id++) { if (this.exposed(id)) this.frameSet.add(id); else this.frameSet.delete(id); }
    for (let p = b.p0; p < b.p1; p++) this.writePanel(p);
    this.frameDirty = true; b.dirty = false;
  }
  // zapis do GPU: szkielety (zwarta lista) i zakres zmienionych fasad
  flush() {
    if (this.frameDirty) {
      const m = this._fm || (this._fm = new THREE.Matrix4()), c = this._fc || (this._fc = new THREE.Color());
      let n = 0;
      for (const id of this.frameSet) {
        if (n >= this.N) break;
        this.frameMesh.setMatrixAt(n, this.chunkMatrix(id, m));
        const T = this.buildings[this.bld[id]].T, r = Math.min(1, this.dmg[id] / this.hp[id]), h = this.heat[id];
        c.setRGB(T.color[0] * 0.62 * (1 - 0.5 * r) + h * 2.4, T.color[1] * 0.62 * (1 - 0.5 * r) + h * 0.8, T.color[2] * 0.62 * (1 - 0.52 * r) + h * 0.15);     // wnętrze ciemniejsze od fasady
        this.frameMesh.setColorAt(n, c);
        n++;
      }
      this.frameMesh.count = n; this.frameMesh.instanceMatrix.needsUpdate = true; if (this.frameMesh.instanceColor) this.frameMesh.instanceColor.needsUpdate = true;
      this.frameDirty = false;
    }
    if (this.pRange[1] >= 0) {
      const [a, z] = this.pRange, im = this.panelMesh.instanceMatrix, ic = this.panelMesh.instanceColor;
      im.clearUpdateRanges(); im.addUpdateRange(a * 16, (z - a + 1) * 16); im.needsUpdate = true;
      ic.clearUpdateRanges(); ic.addUpdateRange(a * 3, (z - a + 1) * 3); ic.needsUpdate = true;
      this.tile.clearUpdateRanges(); this.tile.addUpdateRange(a * 2, (z - a + 1) * 2); this.tile.needsUpdate = true;
      this.pRange = [Infinity, -1];
    }
  }

  // ---------- grunt, ulice, woda ----------
  buildGround() {
    const S = 2048, ext = HALF + 30, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d'), k = S / (ext * 2), X = (x) => (x + ext) * k;
    c.fillStyle = '#4a4a48'; c.fillRect(0, 0, S, S);
    // kwartały: chodnik + trawa/beton
    for (let j = 0; j < NB; j++) for (let i = 0; i < NB; i++) {
      const bx = -HALF + STREET + i * (BLOCK + STREET), bz = -HALF + STREET + j * (BLOCK + STREET);
      c.fillStyle = '#9a968c'; c.fillRect(X(bx), X(bz), BLOCK * k, BLOCK * k);
      c.fillStyle = i === 2 && j === 3 ? '#4a6e36' : '#8a867c'; c.fillRect(X(bx + 3), X(bz + 3), (BLOCK - 6) * k, (BLOCK - 6) * k);
      if (i === 2 && j === 3) { c.fillStyle = '#c8bca0'; c.fillRect(X(bx + 30), X(bz + 3), 4 * k, (BLOCK - 6) * k); c.fillRect(X(bx + 3), X(bz + 30), (BLOCK - 6) * k, 4 * k); c.fillStyle = '#5a8aa8'; c.beginPath(); c.arc(X(bx + 32), X(bz + 32), 6 * k, 0, 7); c.fill(); }
    }
    // linie na jezdniach
    c.strokeStyle = '#d8d0a0'; c.lineWidth = Math.max(1, 0.25 * k); c.setLineDash([3 * k, 3 * k]);
    for (let n = 0; n <= NB; n++) { const s = -HALF + n * (BLOCK + STREET) + STREET / 2; c.beginPath(); c.moveTo(X(s), 0); c.lineTo(X(s), S); c.stroke(); c.beginPath(); c.moveTo(0, X(s)); c.lineTo(S, X(s)); c.stroke(); }
    c.setLineDash([]);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const city = new THREE.Mesh(new THREE.PlaneGeometry(ext * 2, ext * 2).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex }));
    this.group.add(city);
    // okolica: trawa, plaża i zatoka od południa
    const far = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2).translate(0, -1.6, 0), new THREE.MeshLambertMaterial({ color: 0x5a6a44 }));
    this.group.add(far);
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(4000, 34).rotateX(-Math.PI / 2).translate(0, -0.8, WATER_Z - 10), new THREE.MeshLambertMaterial({ color: 0xc8b88a }));
    this.group.add(beach);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 2000).rotateX(-Math.PI / 2).translate(0, -1.2, WATER_Z + 1000), new THREE.MeshLambertMaterial({ color: 0x2a5a78, transparent: true, opacity: 0.88 }));
    this.group.add(water);
    const seabed = new THREE.Mesh(new THREE.PlaneGeometry(4000, 2000).rotateX(-Math.PI / 2).translate(0, -14, WATER_Z + 1000), new THREE.MeshLambertMaterial({ color: 0x3a4a3a }));
    this.group.add(seabed);
  }
  terrainAt(x, z) { return z > WATER_Z ? -14 * Math.min(1, (z - WATER_Z) / 30) : 0; }

  // ---------- gruz (mapa wysokości) ----------
  rubbleInit() {
    this.rubVis = new Float32Array(RN * RN); this.colH = new Float32Array(RN * RN);
    const g = new THREE.PlaneGeometry(RN * RG, RN * RG, RN, RN).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0x8e887c, flatShading: true });
    this.rubbleMesh = new THREE.Mesh(g, mat); this.rubbleMesh.frustumCulled = false;
    this.group.add(this.rubbleMesh);
    this.rubbleDirty = true; this.rubbleT = 0; this.updateRubbleMesh();
  }
  rIdx(x, z) { const i = Math.floor((x - R0) / RG), j = Math.floor((z - R0) / RG); return i < 0 || j < 0 || i >= RN || j >= RN ? -1 : j * RN + i; }
  addRubble(x, z, vol) {
    const k = this.rIdx(x, z); if (k < 0) return;
    this.rubVis[k] = Math.min(9, this.rubVis[k] + vol / (RG * RG) * 0.6);
    this.colH[k] = Math.max(this.colH[k], this.rubVis[k]);
    this.rubbleDirty = true;
  }
  raiseCol(x, z, h) { const k = this.rIdx(x, z); if (k >= 0) this.colH[k] = Math.max(this.colH[k], h); }
  groundAt(x, z) { const k = this.rIdx(x, z); return Math.max(this.terrainAt(x, z), k < 0 ? 0 : this.colH[k]); }
  updateRubbleMesh() {
    const pos = this.rubbleMesh.geometry.attributes.position, V = this.rubVis;
    for (let j = 0; j <= RN; j++) for (let i = 0; i <= RN; i++) {
      let h = 0, n = 0;
      for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) if (a >= 0 && b >= 0 && a < RN && b < RN) { h += V[b * RN + a]; n++; }
      const v = n ? h / n : 0;
      pos.setY(j * (RN + 1) + i, v > 0.05 ? v - 0.25 + Math.sin(i * 12.9 + j * 78.2) * 0.25 * Math.min(1, v) : -1.2);
    }
    pos.needsUpdate = true; this.rubbleDirty = false;
  }

  // ---------- zapytania przestrzenne ----------
  near(x, z, r, out = []) {
    out.length = 0;
    const seen = this._seen || (this._seen = new Set()); seen.clear();
    for (let i = Math.floor((x - r) / HB); i <= Math.floor((x + r) / HB); i++) for (let j = Math.floor((z - r) / HB); j <= Math.floor((z + r) / HB); j++) {
      const l = this.hash.get(i * 1000 + j); if (!l) continue;
      for (const b of l) if (!seen.has(b) && x + r > b.x0 && x - r < b.box.max.x && z + r > b.z0 && z - r < b.box.max.z) { seen.add(b); out.push(b); }
    }
    return out;
  }
  idAt(b, ix, iy, iz) { return ix < 0 || iy < 0 || iz < 0 || ix >= b.nx || iy >= b.ny || iz >= b.nz ? -1 : b.c0 + (iy * b.nz + iz) * b.nx + ix; }
  // stojący segment w punkcie
  staticAt(x, y, z) {
    if (y < 0) return -1;
    for (const b of this.near(x, z, 0, this._na || (this._na = []))) {
      const id = this.idAt(b, Math.floor((x - b.x0) / CW), Math.floor(y / CH), Math.floor((z - b.z0) / CW));
      if (id >= 0 && this.st[id] === 0) return id;
    }
    return -1;
  }
  // podłoga pod punktem: grunt/gruz albo strop stojącego segmentu
  floorAt(x, y, z) {
    let f = this.groundAt(x, z);
    for (const b of this.near(x, z, 0, this._na || (this._na = []))) {
      const ix = Math.floor((x - b.x0) / CW), iz = Math.floor((z - b.z0) / CW);
      // stojący segment traktujemy jak pełny (zamknięty fasadą): gruz leży na jego wierzchu
      for (let iy = Math.min(b.ny - 1, Math.floor((y + 0.5) / CH)); iy >= 0; iy--) {
        const id = this.idAt(b, ix, iy, iz);
        if (id >= 0 && this.st[id] === 0) { f = Math.max(f, (iy + 1) * CH); break; }
      }
    }
    return f;
  }
  // stojące segmenty przecinające kulę
  sphere(p, r, out = []) {
    out.length = 0;
    for (const b of this.near(p.x, p.z, r, this._ns || (this._ns = []))) {
      const ix0 = Math.max(0, Math.floor((p.x - r - b.x0) / CW)), ix1 = Math.min(b.nx - 1, Math.floor((p.x + r - b.x0) / CW));
      const iz0 = Math.max(0, Math.floor((p.z - r - b.z0) / CW)), iz1 = Math.min(b.nz - 1, Math.floor((p.z + r - b.z0) / CW));
      const iy0 = Math.max(0, Math.floor((p.y - r) / CH)), iy1 = Math.min(b.ny - 1, Math.floor((p.y + r) / CH));
      for (let iy = iy0; iy <= iy1; iy++) for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
        const id = b.c0 + (iy * b.nz + iz) * b.nx + ix;
        if (this.st[id] !== 0) continue;
        const x0 = b.x0 + ix * CW, z0 = b.z0 + iz * CW, y0 = iy * CH;
        const qx = Math.max(x0, Math.min(p.x, x0 + CW)), qy = Math.max(y0, Math.min(p.y, y0 + CH)), qz = Math.max(z0, Math.min(p.z, z0 + CW));
        const d2 = (p.x - qx) ** 2 + (p.y - qy) ** 2 + (p.z - qz) ** 2;
        if (d2 < r * r) out.push(id, qx, qy, qz, Math.sqrt(d2));
      }
    }
    return out;     // płaska lista: id, punkt styku (x, y, z), odległość
  }
  // promień → pierwszy stojący segment (krok 1 m)
  ray(o, d, max) {
    for (let t = 0; t < max; t += 1) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y < this.groundAt(x, z)) return { t, id: -1 };
      const id = this.staticAt(x, y, z);
      if (id >= 0) return { t, id };
    }
    return null;
  }

  // ---------- zniszczenia ----------
  // uderzenie energią E w segment id, kierunek dir (znormalizowany); energia rozchodzi się po sąsiadach
  impact(id, E, dir, cause = 'hit') {
    const q = [id, E], seen = this._seenI || (this._seenI = new Set()); seen.clear();
    let broke = 0;
    while (q.length) {
      const e = q.pop(), c = q.pop();
      if (seen.has(c)) continue; seen.add(c);
      const s = this.st[c]; if (s === 2) continue;
      const b = this.buildings[this.bld[c]];
      this.hitPanels(c, e, dir);
      const remain = this.hp[c] - this.dmg[c];
      let left;
      if (e >= remain) {
        const over = e - remain;
        this.breakChunk(c, dir, Math.min(32, 4 + Math.sqrt(over) * 1.5), cause);
        broke++; left = (e - remain) * 0.8;
      } else {
        this.dmg[c] += e; left = e * 0.32;
        if (s === 0) { b.dirty = true; b.loadDirty = true; }
      }
      if (left < 4) continue;
      // przekazanie sąsiadom: więcej w kierunku ciosu
      const ix = this.cx[c], iy = this.cy[c], iz = this.cz[c], cl = this.clusterOf[c];
      let sw = 0; const nb = [];
      for (const [dx, dy, dz] of NB6) {
        const j = this.idAt(b, ix + dx, iy + dy, iz + dz);
        if (j < 0 || seen.has(j) || this.st[j] === 2 || (this.st[j] === 0) !== (s === 0) || (s !== 0 && this.clusterOf[j] !== cl)) continue;
        const w = 0.22 + 0.78 * Math.max(0, dx * dir.x + dy * dir.y + dz * dir.z);
        nb.push(j, w); sw += w;
      }
      for (let k = 0; k < nb.length; k += 2) q.push(nb[k], left * nb[k + 1] / Math.max(sw, 1));
    }
    return broke;
  }
  hitPanels(c, e, dir) {
    for (let f = 0; f < 5; f++) {
      const p = this.panelOf[c * 5 + f]; if (p < 0 || this.pSt[p] === 2) continue;
      const n = FACES[f], facing = Math.max(0, -(n[0] * dir.x + n[1] * dir.y + n[2] * dir.z));
      const T = this.buildings[this.bld[c]].T;
      this.pDmg[p] += e * (0.25 + 1.4 * facing);
      if (this.pDmg[p] >= T.panelHp) this.breakPanel(p, dir);
      else if (this.pDmg[p] >= T.panelHp * 0.35 && this.pSt[p] === 0) { this.pSt[p] = 1; this.writePanel(p); }
      else this.writePanel(p);
    }
  }
  breakPanel(p, dir, quiet) {
    if (this.pSt[p] === 2) return;
    this.pSt[p] = 2;
    const c = this.pChunk[p], b = this.buildings[this.bld[c]];
    this.writePanel(p);
    if (this.st[c] === 0) { b.dirty = true; }
    else this.frameDirty = true;
    if (this.onPanel && !quiet) {
      const m = this.chunkMatrix(c, this._bm || (this._bm = new THREE.Matrix4())).multiply(this.panelLocal[this.pFace[p]]);
      const pos = new THREE.Vector3().setFromMatrixPosition(m), n = new THREE.Vector3(0, 0, 1).transformDirection(m);
      this.onPanel(pos, n, b.T, dir);
    }
  }
  breakChunk(id, dir, speed = 6, cause = 'hit') {
    const s = this.st[id]; if (s === 2) return;
    this.st[id] = 2; this.dmg[id] = this.hp[id];
    const b = this.buildings[this.bld[id]];
    b.broken++; this.brokenChunks++;
    if (s === 0) { b.needSupport = true; b.loadDirty = true; }
    b.dirty = true;
    for (let f = 0; f < 5; f++) { const p = this.panelOf[id * 5 + f]; if (p >= 0 && this.pSt[p] < 2) { this.pSt[p] = 2; this.writePanel(p); } }
    this.frameSet.delete(id); this.frameDirty = true;
    const pos = new THREE.Vector3(this.cpos[id * 3], this.cpos[id * 3 + 1], this.cpos[id * 3 + 2]);
    if (s === 0) { this.recent.push({ b, x: pos.x, y: pos.y, z: pos.z, t: 0 }); if (this.recent.length > 60) this.recent.shift(); }
    if (this.onBreak) this.onBreak(id, pos, dir, speed, cause, b.T, s);
  }
  // wyrwanie segmentu (chwyt): znika bez gruzu, fizyka tworzy z niego bryłę w dłoni
  rip(id) {
    const s = this.st[id]; if (s === 2) return false;
    const b = this.buildings[this.bld[id]];
    this.st[id] = 2; b.broken++; this.brokenChunks++; b.dirty = true;
    if (s === 0) { b.needSupport = true; b.loadDirty = true; }
    for (let f = 0; f < 5; f++) { const p = this.panelOf[id * 5 + f]; if (p >= 0 && this.pSt[p] < 2) { this.pSt[p] = 2; this.writePanel(p); } }
    this.frameSet.delete(id); this.frameDirty = true;
    return true;
  }
  damageChunk(id, e, dir) { if (this.st[id] === 2) return false; this.dmg[id] += e; if (this.dmg[id] >= this.hp[id]) { this.breakChunk(id, dir || new THREE.Vector3(0, -1, 0), 4, 'crush'); return true; } if (this.st[id] === 0) { const b = this.buildings[this.bld[id]]; b.dirty = true; b.loadDirty = true; } else this.frameDirty = true; return false; }
  heatChunk(id, e, dir) {
    if (this.st[id] === 2) return;
    this.heat[id] = Math.min(1, this.heat[id] + e / this.hp[id] * 0.9);
    const b = this.buildings[this.bld[id]];
    if (this.dmg[id] + e >= this.hp[id]) {
      this.breakChunk(id, dir, 22, 'heat');
      // wybuch rozgrzanego segmentu: energia rozchodzi się po sąsiadach
      const ix = this.cx[id], iy = this.cy[id], iz = this.cz[id];
      for (const [dx, dy, dz] of NB6) { const j = this.idAt(b, ix + dx, iy + dy, iz + dz); if (j >= 0 && this.st[j] !== 2) { this.heat[j] = Math.min(1, this.heat[j] + 0.35); this.impact(j, 28, new THREE.Vector3(dx, dy, dz), 'heat'); } }
    } else { this.dmg[id] += e; this.hitPanels(id, e * 0.6, dir); b.dirty = true; b.loadDirty = true; }
  }
  // fala dźwiękowa (ryk): pękają szyby w zasięgu
  shatter(c, R, rnd) {
    let n = 0;
    for (let p = 0; p < this.M; p++) {
      if (this.pSt[p] === 2) continue;
      const id = this.pChunk[p]; if (this.st[id] === 2) continue;
      const dx = this.cpos[id * 3] - c.x, dz = this.cpos[id * 3 + 2] - c.z, dy = this.cpos[id * 3 + 1] - c.y, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > R) continue;
      const T = this.buildings[this.bld[id]].T, f = FACES[this.pFace[p]];
      const facing = Math.max(0.15, -(f[0] * dx + f[2] * dz) / Math.max(1, Math.hypot(dx, dz)));
      const k = (1 - d / R) * facing;
      if (T.row === 2 ? rnd() < k * 1.4 : rnd() < k * 0.35) {
        if (T.row === 2 || rnd() < 0.3) { this.breakPanel(p, new THREE.Vector3(dx, 0, dz).normalize(), n > 120); n++; }
        else if (this.pSt[p] === 0) { this.pSt[p] = 1; this.writePanel(p); }
        const b = this.buildings[this.bld[id]]; b.dirty = true;
      }
    }
    return n;
  }

  // ---------- statyka: podparcie i obciążenia ----------
  // zwraca listę brył (tablice id), które straciły podparcie
  solveSupport(b) {
    const n = b.n, dist = this._dist && this._dist.length >= n ? this._dist : (this._dist = new Int16Array(Math.max(n, 4096)));
    dist.fill(999, 0, n);
    const span = b.T.span, buckets = []; for (let k = 0; k <= span; k++) buckets.push([]);
    for (let iz = 0; iz < b.nz; iz++) for (let ix = 0; ix < b.nx; ix++) { const id = b.c0 + iz * b.nx + ix; if (this.st[id] === 0) { dist[id - b.c0] = 0; buckets[0].push(id); } }
    for (let d = 0; d <= span; d++) {
      const Q = buckets[d];
      for (let qi = 0; qi < Q.length; qi++) {
        const u = Q[qi]; if (dist[u - b.c0] !== d) continue;
        const ix = this.cx[u], iy = this.cy[u], iz = this.cz[u];
        for (let f = 0; f < 6; f++) {
          const [dx, dy, dz] = NB6[f], v = this.idAt(b, ix + dx, iy + dy, iz + dz);
          if (v < 0 || this.st[v] !== 0) continue;
          const cost = dy === 1 ? 0 : dy === -1 ? 2 : 1, nd = d + cost;
          if (nd <= span && nd < dist[v - b.c0]) { dist[v - b.c0] = nd; buckets[nd].push(v); }
        }
      }
    }
    const comps = [], mark = this._mark && this._mark.length >= n ? this._mark : (this._mark = new Uint8Array(Math.max(n, 4096)));
    mark.fill(0, 0, n);
    for (let id = b.c0; id < b.c0 + n; id++) {
      if (this.st[id] !== 0 || dist[id - b.c0] <= span || mark[id - b.c0]) continue;
      const comp = [id]; mark[id - b.c0] = 1;
      for (let k = 0; k < comp.length; k++) {
        const u = comp[k], ix = this.cx[u], iy = this.cy[u], iz = this.cz[u];
        for (const [dx, dy, dz] of NB6) { const v = this.idAt(b, ix + dx, iy + dy, iz + dz); if (v >= 0 && this.st[v] === 0 && dist[v - b.c0] > span && !mark[v - b.c0]) { mark[v - b.c0] = 1; comp.push(v); } }
      }
      comps.push(comp);
    }
    return comps;
  }
  computeLoads(b) {
    const n = b.n, extra = this._extra && this._extra.length >= n ? this._extra : (this._extra = new Float32Array(Math.max(n, 4096)));
    extra.fill(0, 0, n);
    // ciężar nad brakującymi segmentami przechodzi na sąsiadów na tym samym poziomie
    for (let iz = 0; iz < b.nz; iz++) for (let ix = 0; ix < b.nx; ix++) {
      let run = 0;
      for (let iy = b.ny - 1; iy >= 0; iy--) {
        const id = b.c0 + (iy * b.nz + iz) * b.nx + ix;
        if (this.st[id] === 0) run += 1;
        else if (run > 0) {
          const nbs = [];
          for (const [dx, , dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) { const j = this.idAt(b, ix + dx, iy, iz + dz); if (j >= 0 && this.st[j] === 0) nbs.push(j); }
          for (const j of nbs) extra[j - b.c0] += run / nbs.length;
          run = 0;
        }
      }
    }
    for (let iz = 0; iz < b.nz; iz++) for (let ix = 0; ix < b.nx; ix++) {
      let run = 0;
      for (let iy = b.ny - 1; iy >= 0; iy--) {
        const id = b.c0 + (iy * b.nz + iz) * b.nx + ix;
        if (this.st[id] === 0) { run += extra[id - b.c0]; this.load[id] = run; run += 1; } else run = 0;
      }
    }
    b.loadDirty = false;
  }
  capacity(id) { const b = this.buildings[this.bld[id]]; return b.cap * Math.max(0, 1 - this.dmg[id] / this.hp[id]) ** 1.4; }

  update(dt, onDetach) {
    for (const r of this.recent) r.t += dt;
    while (this.recent.length && this.recent[0].t > 2.5) this.recent.shift();
    let solved = 0;
    for (const b of this.buildings) {
      if (b.needSupport && solved < 6) {
        solved++; b.needSupport = false;
        const comps = this.solveSupport(b);
        for (const comp of comps) {
          if (comp.length <= 2) { for (const id of comp) this.breakChunk(id, new THREE.Vector3(0, -1, 0), 3, 'fall'); }
          else if (onDetach) onDetach(b, comp);
        }
        b.loadDirty = true;
      }
      if (b.loadDirty) {
        this.computeLoads(b);
        for (let id = b.c0; id < b.c0 + b.n; id++) {
          if (this.st[id] !== 0 || this.load[id] <= this.capacity(id) || this.failing.some((f) => f.id === id)) continue;
          this.failing.push({ id, t: 0.15 + Math.random() * 0.7 });
          if (this.onCreak) this.onCreak(new THREE.Vector3(this.cpos[id * 3], this.cpos[id * 3 + 1], this.cpos[id * 3 + 2]), b);
        }
      }
      if (b.dirty) this.refresh(b);
    }
    for (let i = this.failing.length - 1; i >= 0; i--) {
      const f = this.failing[i]; f.t -= dt;
      if (f.t > 0) continue;
      this.failing.splice(i, 1);
      if (this.st[f.id] !== 0) continue;
      const b = this.buildings[this.bld[f.id]];
      if (b.loadDirty) this.computeLoads(b);
      if (this.load[f.id] <= this.capacity(f.id)) continue;
      // zgniecenie: segment pęka, sąsiedzi dostają wstrząs
      this.breakChunk(f.id, new THREE.Vector3((Math.random() - 0.5) * 0.4, -1, (Math.random() - 0.5) * 0.4).normalize(), 3, 'load');
      if (this.onFail) this.onFail(f.id);
      const ix = this.cx[f.id], iy = this.cy[f.id], iz = this.cz[f.id];
      for (const [dx, dy, dz] of NB6) { const j = this.idAt(b, ix + dx, iy + dy, iz + dz); if (j >= 0 && this.st[j] === 0) this.impact(j, this.hp[j] * 0.18, new THREE.Vector3(dx, dy, dz), 'load'); }
    }
    this.rubbleT -= dt;
    if (this.rubbleDirty && this.rubbleT <= 0) { this.updateRubbleMesh(); this.rubbleT = 0.3; }
    this.flush();
  }
  stats() {
    let down = 0; for (const b of this.buildings) if (b.broken > b.n * 0.6) down++;
    return { down, total: this.buildings.length, pct: this.brokenChunks / this.totalChunks };
  }
}
export { TYPE_LIST };
