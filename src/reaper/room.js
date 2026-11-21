import * as THREE from 'three';

// ---------- geometria 2D (płaszczyzna podłogi XZ) ----------
export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
// główna oś zbioru punktów (ściana / drzwi widziane z góry)
function principal(pts) {
  let mx = 0, mz = 0; for (const p of pts) { mx += p[0]; mz += p[1]; } mx /= pts.length; mz /= pts.length;
  let a = 0, b = 0, c = 0; for (const p of pts) { const dx = p[0] - mx, dz = p[1] - mz; a += dx * dx; b += dx * dz; c += dz * dz; }
  const ang = 0.5 * Math.atan2(2 * b, a - c), u = [Math.cos(ang), Math.sin(ang)];
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { const t = (p[0] - mx) * u[0] + (p[1] - mz) * u[1]; lo = Math.min(lo, t); hi = Math.max(hi, t); }
  return { c: [mx + (u[0] * (lo + hi)) / 2, mz + (u[1] * (lo + hi)) / 2], u, len: hi - lo };
}

// ---------- odczyt skanu pokoju z WebXR (plane-detection / mesh-detection) ----------
export function itemsFromXR(frame, ref) {
  const items = [], m = new THREE.Matrix4();
  if (frame.detectedPlanes) for (const pl of frame.detectedPlanes) {
    const pose = frame.getPose(pl.planeSpace, ref);
    if (!pose || !pl.polygon || pl.polygon.length < 3) continue;
    m.fromArray(pose.transform.matrix);
    const pts = pl.polygon.map((p) => new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(m));
    const tris = []; for (let i = 1; i < pts.length - 1; i++) tris.push(pts[0], pts[i], pts[i + 1]);
    items.push({ label: (pl.semanticLabel || '').toLowerCase(), pts, tris, plane: true, vertical: pl.orientation === 'vertical' });
  }
  if (frame.detectedMeshes) for (const me of frame.detectedMeshes) {
    const label = (me.semanticLabel || '').toLowerCase();
    if (/global|invisible/.test(label)) continue;
    const pose = frame.getPose(me.meshSpace, ref);
    if (!pose || !me.vertices || !me.indices) continue;
    m.fromArray(pose.transform.matrix);
    const v = me.vertices, idx = me.indices, pts = [];
    for (let i = 0; i < v.length; i += 3) pts.push(new THREE.Vector3(v[i], v[i + 1], v[i + 2]).applyMatrix4(m));
    if (pts.length < 3) continue;
    const tris = []; for (let i = 0; i < idx.length; i += 3) tris.push(pts[idx[i]], pts[idx[i + 1]], pts[idx[i + 2]]);
    items.push({ label, pts, tris, plane: false });
  }
  return items;
}

// ---------- pokój zastępczy (komputer / VR bez skanu) ----------
export function simulatedItems() {
  const items = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const quad = (label, a, b, c, d, extra = {}) => items.push({ label, pts: [a, b, c, d], tris: [a, b, c, a, c, d], plane: true, ...extra });
  const X0 = -2.1, X1 = 2.1, Z0 = -3.6, Z1 = 1.4, H = 2.6;
  quad('floor', V(X0, 0, Z0), V(X1, 0, Z0), V(X1, 0, Z1), V(X0, 0, Z1));
  quad('wall', V(X0, 0, Z0), V(X1, 0, Z0), V(X1, H, Z0), V(X0, H, Z0), { vertical: true });
  quad('wall', V(X1, 0, Z0), V(X1, 0, Z1), V(X1, H, Z1), V(X1, H, Z0), { vertical: true });
  quad('wall', V(X1, 0, Z1), V(X0, 0, Z1), V(X0, H, Z1), V(X1, H, Z1), { vertical: true });
  quad('wall', V(X0, 0, Z1), V(X0, 0, Z0), V(X0, H, Z0), V(X0, H, Z1), { vertical: true });
  quad('door frame', V(0.75, 0, Z0 + 0.01), V(1.65, 0, Z0 + 0.01), V(1.65, 2.05, Z0 + 0.01), V(0.75, 2.05, Z0 + 0.01), { vertical: true });
  const box = (label, x0, x1, z0, z1, y1) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1, z1 - z0).translate((x0 + x1) / 2, y1 / 2, (z0 + z1) / 2).toNonIndexed();
    const a = g.attributes.position, tris = [];
    for (let i = 0; i < a.count; i++) tris.push(V(a.getX(i), a.getY(i), a.getZ(i)));
    items.push({ label, pts: tris, tris, plane: false });
  };
  box('couch', -2.1, -1.25, -2.7, -0.7, 0.85);
  box('table', -0.1, 1.3, -2.1, -1.4, 0.76);
  box('storage', 1.6, 2.1, -1.6, -0.5, 1.8);
  box('plant', 1.55, 1.95, 0.6, 1.0, 1.1);
  return items;
}

// ---------- model pokoju ----------
const NOT_OBSTACLE = /floor|ceiling|wall|door|window|global|invisible|art/;
export class Room {
  constructor(items, user) {
    this.items = items;
    this.floorY = 0; this.floorPoly = null; this.walls = []; this.doors = []; this.obstacles = []; this.occluders = [];
    const floors = items.filter((it) => it.label.includes('floor') || (!it.label && it.plane && !it.vertical && Math.abs(it.pts[0].y) < 0.2));
    if (floors.length) {
      const f = floors.reduce((a, b) => (b.pts.length > a.pts.length ? b : a));
      this.floorY = f.pts.reduce((s, p) => s + p.y, 0) / f.pts.length;
      const poly = f.pts.map((p) => [p.x, p.z]);
      this.floorPoly = f.plane ? poly : convexHull(poly);
    }
    for (const it of items) {
      const l = it.label, flat = it.pts.map((p) => [p.x, p.z]);
      let y0 = Infinity, y1 = -Infinity; for (const p of it.pts) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      if (l.includes('door')) { this.doors.push({ pts: flat, y0, y1 }); continue; }
      if (l.includes('wall') && !l.includes('art') || (!l && it.vertical)) {
        const pc = principal(flat);
        const a = [pc.c[0] - (pc.u[0] * pc.len) / 2, pc.c[1] - (pc.u[1] * pc.len) / 2], b = [pc.c[0] + (pc.u[0] * pc.len) / 2, pc.c[1] + (pc.u[1] * pc.len) / 2];
        this.walls.push({ a, b, y0, y1 });
        this.occluders.push({ tris: it.tris, kind: 'wall' });
        continue;
      }
      if (/window/.test(l)) { this.occluders.push({ tris: it.tris, kind: 'wall' }); continue; }
      if (NOT_OBSTACLE.test(l) || floors.includes(it)) continue;
      if (y1 < this.floorY + 0.12 || y0 > this.floorY + 1.9) continue;   // dywan / lampa pod sufitem
      this.obstacles.push({ poly: convexHull(flat), top: y1, label: l });
      this.occluders.push({ tris: it.tris, kind: 'furn' });
    }
    if (!this.floorPoly && this.walls.length >= 3) this.floorPoly = convexHull(this.walls.flatMap((w) => [w.a, w.b]));
    // środek pokoju: odniesienie dla "do wewnątrz"
    this.center = this.floorPoly ? this.floorPoly.reduce((s, p) => [s[0] + p[0] / this.floorPoly.length, s[1] + p[1] / this.floorPoly.length], [0, 0]) : [user.x, user.z];
    this.doors = this.doors.map((d) => this.makeDoor(d)).filter(Boolean);
    // duplikaty (ta sama rama z płaszczyzny i z bryły)
    this.doors = this.doors.filter((d, i) => !this.doors.some((e, j) => j < i && e.c.distanceTo(d.c) < 0.5));
    this.doorAuto = this.doors.length > 0;
  }

  makeDoor(d) {
    const pc = principal(d.pts);
    if (pc.len < 0.4) return null;
    let n = new THREE.Vector3(-pc.u[1], 0, pc.u[0]);
    const toC = new THREE.Vector3(this.center[0] - pc.c[0], 0, this.center[1] - pc.c[1]);
    if (n.dot(toC) < 0) n.negate();
    return this.door(pc.c[0], pc.c[1], n, Math.min(1.6, pc.len), Math.max(1.7, Math.min(2.6, d.y1 - this.floorY)));
  }
  // drzwi: c = środek progu, n = kierunek do pokoju, u = w poprzek
  door(x, z, n, w = 0.9, h = 2.05) {
    n = n.clone().setY(0).normalize();
    return { c: new THREE.Vector3(x, this.floorY, z), n, u: new THREE.Vector3(n.z, 0, -n.x), w, h };
  }
  // zastępcze wejście, gdy skan nie ma drzwi: środek najdalszej ściany albo portal przed graczem
  fallbackDoor(user, fwd) {
    if (this.walls.length) {
      let best = null, bd = -1;
      for (const w of this.walls) {
        const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        if (len < 1.2) continue;
        const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2, d = Math.hypot(mx - user.x, mz - user.z);
        if (d > bd) { bd = d; best = { mx, mz, w }; }
      }
      if (best) {
        const u = [best.w.b[0] - best.w.a[0], best.w.b[1] - best.w.a[1]];
        const n = new THREE.Vector3(-u[1], 0, u[0]);
        if (n.dot(new THREE.Vector3(this.center[0] - best.mx, 0, this.center[1] - best.mz)) < 0) n.negate();
        return this.door(best.mx + n.x * 0.02, best.mz + n.z * 0.02, n);
      }
    }
    const f = fwd.clone().setY(0); if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
    return this.door(user.x + f.x * 3.5, user.z + f.z * 3.5, f.clone().negate());
  }
}

// ---------- siatka nawigacyjna + A* ----------
export class NavGrid {
  constructor(room, user, radius = 0.3, cell = 0.08) {
    this.room = room; this.cell = cell;
    let x0, x1, z0, z1;
    const pts = room.floorPoly || room.walls.flatMap((w) => [w.a, w.b]);
    if (pts.length >= 3) { x0 = Math.min(...pts.map((p) => p[0])); x1 = Math.max(...pts.map((p) => p[0])); z0 = Math.min(...pts.map((p) => p[1])); z1 = Math.max(...pts.map((p) => p[1])); }
    else { x0 = user.x - 6; x1 = user.x + 6; z0 = user.z - 6; z1 = user.z + 6; }
    x0 -= 0.5; z0 -= 0.5; x1 += 0.5; z1 += 0.5;
    this.x0 = x0; this.z0 = z0;
    this.nx = Math.min(260, Math.ceil((x1 - x0) / cell)); this.nz = Math.min(260, Math.ceil((z1 - z0) / cell));
    const N = this.nx * this.nz, raw = new Uint8Array(N);
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell;
      let b = room.floorPoly && room.floorPoly.length >= 3 ? !pointInPoly(x, z, room.floorPoly) : false;
      if (!b) for (const o of room.obstacles) if (o.poly.length >= 3 && pointInPoly(x, z, o.poly)) { b = true; break; }
      if (!b) for (const w of room.walls) if (segDist(x, z, w.a, w.b) < 0.06) { b = true; break; }
      raw[j * this.nx + i] = b ? 1 : 0;
    }
    this.raw = raw;
    this.blocked = this.inflate(raw, radius);
  }
  inflate(raw, radius) {
    const r = Math.ceil(radius / this.cell), offs = [];
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (di * di + dj * dj <= r * r) offs.push([di, dj]);
    const out = new Uint8Array(raw.length), nx = this.nx, nz = this.nz;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (!raw[j * nx + i]) continue;
      // tylko komórki brzegowe rozlewają się dalej
      let edge = false;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < nz && !raw[b * nx + a]) edge = true; }
      out[j * nx + i] = 1;
      if (!edge) continue;
      for (const [di, dj] of offs) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < nz) out[b * nx + a] = 1; }
    }
    return out;
  }
  cellOf(x, z) { return [Math.floor((x - this.x0) / this.cell), Math.floor((z - this.z0) / this.cell)]; }
  pos(i, j) { return [this.x0 + (i + 0.5) * this.cell, this.z0 + (j + 0.5) * this.cell]; }
  ok(i, j, grid = this.blocked) { return i >= 0 && j >= 0 && i < this.nx && j < this.nz && !grid[j * this.nx + i]; }
  nearestFree(i, j, grid = this.blocked, maxR = 40) {
    if (this.ok(i, j, grid)) return [i, j];
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !this.ok(i + di, j + dj, grid)) continue;
        const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i + di, j + dj]; }
      }
      if (best) return best;
    }
    return null;
  }
  los(a, b, grid) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(d / (this.cell * 0.5));
    for (let k = 0; k <= n; k++) { const t = k / Math.max(1, n); const [i, j] = this.cellOf(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); if (!this.ok(i, j, grid)) return false; }
    return true;
  }
  // ścieżka [x,z]→[x,z]; najpierw z marginesem, w razie braku bez marginesu
  path(from, to) {
    for (const grid of [this.blocked, this.raw]) {
      const p = this.astar(from, to, grid);
      if (p) return p;
    }
    return null;
  }
  astar(from, to, grid) {
    const nx = this.nx, N = nx * this.nz;
    const s = this.nearestFree(...this.cellOf(...from), grid), g = this.nearestFree(...this.cellOf(...to), grid);
    if (!s || !g) return null;
    const si = s[1] * nx + s[0], gi = g[1] * nx + g[0];
    const G = new Float32Array(N).fill(Infinity), par = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [], push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const h = (i) => { const dx = Math.abs((i % nx) - g[0]), dz = Math.abs(((i / nx) | 0) - g[1]); return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz); };
    G[si] = 0; push(si, h(si));
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    let found = false, iter = 0;
    while (heap.length && iter++ < 200000) {
      const [, c] = pop();
      if (closed[c]) continue;
      closed[c] = 1;
      if (c === gi) { found = true; break; }
      const ci = c % nx, cj = (c / nx) | 0;
      for (const [di, dj, w] of nb) {
        const a = ci + di, b = cj + dj;
        if (!this.ok(a, b, grid)) continue;
        if (di && dj && (!this.ok(ci + di, cj, grid) || !this.ok(ci, cj + dj, grid))) continue;   // bez ścinania narożników
        const k = b * nx + a, ng = G[c] + w;
        if (ng < G[k]) { G[k] = ng; par[k] = c; push(k, ng + h(k)); }
      }
    }
    if (!found) return null;
    const cells = []; for (let c = gi; c !== -1; c = par[c]) cells.push(this.pos(c % nx, (c / nx) | 0));
    cells.reverse();
    cells[0] = from.slice();
    // wygładzenie: pomiń punkty widoczne w linii prostej
    const out = [cells[0]];
    let k = 0;
    while (k < cells.length - 1) {
      let m = cells.length - 1;
      while (m > k + 1 && !this.los(cells[k], cells[m], grid)) m--;
      out.push(cells[m]); k = m;
    }
    return out;
  }
}
