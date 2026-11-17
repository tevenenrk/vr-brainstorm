import * as THREE from 'three';

export const BRUSH_OPS = [
  { key: 'raise', name: 'Podnieś' },
  { key: 'lower', name: 'Opuść' },
  { key: 'smooth', name: 'Wygładź' },
  { key: 'flatten', name: 'Wyrównaj' },
  { key: 'erase', name: 'Zeruj' },
];

// pędzel działający na warstwie bazowej (to, co "wyrzeźbione")
export function brush(f, op, x, z, radius, dt, opts = {}) {
  const B = f.base;
  const [c0, c1, r0, r1] = f.range(x - radius, x + radius, z - radius, z + radius);
  const rate = opts.rate ?? 0.12;
  let tmp = null;
  if (op === 'smooth') {
    tmp = new Float32Array((c1 - c0 + 1) * (r1 - r0 + 1));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      let s = 0, n = 0;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= f.rows || cc >= f.cols) continue;
        s += B[rr * f.cols + cc]; n++;
      }
      tmp[(r - r0) * (c1 - c0 + 1) + (c - c0)] = s / n;
    }
  }
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const d = Math.hypot(f.cx(c) - x, f.cz(r) - z) / radius;
    if (d >= 1) continue;
    const w = (1 - d * d) * (1 - d * d);
    const i = r * f.cols + c;
    switch (op) {
      case 'raise': B[i] += rate * dt * w; break;
      case 'lower': B[i] -= rate * dt * w; break;
      case 'smooth': B[i] += (tmp[(r - r0) * (c1 - c0 + 1) + (c - c0)] - B[i]) * Math.min(1, w * dt * 10); break;
      case 'flatten': B[i] += ((opts.level ?? 0) - B[i]) * Math.min(1, w * dt * 8); break;
      case 'erase': B[i] += (0 - B[i]) * Math.min(1, w * dt * 10); break;
      default: break;
    }
    if (B[i] < 0) B[i] = 0; else if (B[i] > f.maxH) B[i] = f.maxH;
  }
}

// wciskanie pinów fizycznie końcówką kontrolera (jak w glinie)
export function press(f, x, y, z, radius) {
  if (y > f.maxH + 0.01) return false;
  const [c0, c1, r0, r1] = f.range(x - radius, x + radius, z - radius, z + radius);
  let hit = false;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const d = Math.hypot(f.cx(c) - x, f.cz(r) - z);
    if (d > radius) continue;
    const i = r * f.cols + c;
    const yy = Math.max(0, y - (radius - Math.sqrt(radius * radius - d * d)) * 0);
    if (f.base[i] > yy) { f.base[i] = yy; hit = true; }
    if (f.h[i] > yy) { f.h[i] = yy; f.dirty = true; hit = true; }
  }
  return hit;
}

// ---------- splajny ----------
function rasterTri(f, out, a, b, c) {
  const minx = Math.min(a.x, b.x, c.x), maxx = Math.max(a.x, b.x, c.x), minz = Math.min(a.z, b.z, c.z), maxz = Math.max(a.z, b.z, c.z);
  const [c0, c1, r0, r1] = f.range(minx, maxx, minz, maxz);
  const den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  if (Math.abs(den) < 1e-12) return;
  for (let r = r0; r <= r1; r++) {
    const z = f.cz(r);
    for (let cc = c0; cc <= c1; cc++) {
      const x = f.cx(cc);
      const wa = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / den;
      const wb = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / den;
      const wc = 1 - wa - wb;
      if (wa < -1e-4 || wb < -1e-4 || wc < -1e-4) continue;
      const y = wa * a.y + wb * b.y + wc * c.y;
      const i = r * f.cols + cc;
      if (y > out[i]) out[i] = y;
    }
  }
}

function resample(pts, n) {
  const clean = [pts[0]];
  for (const p of pts) if (p.distanceTo(clean[clean.length - 1]) > 0.004) clean.push(p);
  if (clean.length < 2) return null;
  if (clean.length === 2) clean.splice(1, 0, clean[0].clone().lerp(clean[1], 0.5));
  return new THREE.CatmullRomCurve3(clean, false, 'centripetal').getSpacedPoints(n);
}

// powierzchnia rozpięta między dwiema krzywymi (lub grzbiet wzdłuż jednej)
export function buildSurface(f, curves) {
  const out = new Float32Array(f.n).fill(-1);
  const valid = curves.filter((c) => c && c.length > 3);
  if (valid.length >= 2) {
    const M = 140, K = 70;
    const pa = resample(valid[0], M), pb = resample(valid[1], M);
    if (!pa || !pb) return false;
    if (pa[0].distanceTo(pb[0]) + pa[M].distanceTo(pb[M]) > pa[0].distanceTo(pb[M]) + pa[M].distanceTo(pb[0])) pb.reverse();
    const grid = [];
    for (let i = 0; i <= M; i++) { const row = []; for (let k = 0; k <= K; k++) row.push(pa[i].clone().lerp(pb[i], k / K)); grid.push(row); }
    for (let i = 0; i < M; i++) for (let k = 0; k < K; k++) {
      const a = grid[i][k], b = grid[i + 1][k], c = grid[i][k + 1], d = grid[i + 1][k + 1];
      rasterTri(f, out, a, b, c); rasterTri(f, out, b, d, c);
    }
  } else if (valid.length === 1) {
    const pts = resample(valid[0], 300);
    if (!pts) return false;
    const R = 0.018;
    for (const p of pts) {
      const [c0, c1, r0, r1] = f.range(p.x - R, p.x + R, p.z - R, p.z + R);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const d = Math.hypot(f.cx(c) - p.x, f.cz(r) - p.z) / R;
        if (d > 1) continue;
        const i = r * f.cols + c, y = p.y * (d < 0.6 ? 1 : 1 - (d - 0.6) / 0.4 * 0.7);
        if (y > out[i]) out[i] = y;
      }
    }
  } else return false;
  for (let i = 0; i < f.n; i++) if (out[i] >= 0) f.base[i] = Math.min(f.maxH, Math.max(0, out[i]));
  return true;
}

// widoczna krzywa rysowana ręką
export class CurveLine {
  constructor(parent, color) {
    this.max = 4000;
    this.pts = [];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.max * 3), 3));
    g.setDrawRange(0, 0);
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    this.line.frustumCulled = false;
    this.dots = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.006, sizeAttenuation: true }));
    this.dots.frustumCulled = false;
    parent.add(this.line, this.dots);
  }
  add(p) {
    if (this.pts.length && p.distanceTo(this.pts[this.pts.length - 1]) < 0.003) return;
    if (this.pts.length >= this.max) return;
    this.pts.push(p.clone());
    const a = this.line.geometry.attributes.position;
    a.setXYZ(this.pts.length - 1, p.x, p.y, p.z);
    a.needsUpdate = true;
    this.line.geometry.setDrawRange(0, this.pts.length);
  }
  clear() { this.pts = []; this.line.geometry.setDrawRange(0, 0); }
}
