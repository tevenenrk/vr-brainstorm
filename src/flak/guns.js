import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const G = 9.81;
// kąt podniesienia (niski tor), by trafić w punkt odległy o d poziomo i h pionowo
function solveElevation(d, h, v) {
  const v2 = v * v, disc = v2 * v2 - G * (G * d * d + 2 * h * v2);
  if (disc < 0) return null;
  return Math.atan((v2 - Math.sqrt(disc)) / (G * d));
}

export const SHELL_V = 330;        // prędkość wylotowa (przeskalowana do makiety), m/s
const PIVOT_H = 7, BARREL = 30;
const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
const tint = (g, r, gg = r, b = r) => {
  g = nonIdx(g);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gg; a[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};

// działo przeciwlotnicze na krzyżowej podstawie: część stała, obrotowa i lufa
function gunGeometries() {
  const o = [0.42, 0.45, 0.32];
  const base = mergeGeometries([
    tint(new THREE.TorusGeometry(20, 2.6, 5, 20).rotateX(Math.PI / 2).translate(0, 1.3, 0), 0.72, 0.65, 0.48),
    tint(new THREE.BoxGeometry(26, 1.4, 2.6).translate(0, 1, 0), ...o),
    tint(new THREE.BoxGeometry(2.6, 1.4, 26).translate(0, 1, 0), ...o),
    ...[[13, 0], [-13, 0], [0, 13], [0, -13]].map(([x, z]) => tint(new THREE.CylinderGeometry(1.8, 2.2, 0.8, 8).translate(x, 0.5, z), 0.3)),
    tint(new THREE.CylinderGeometry(2.4, 3, 4, 10).translate(0, 3, 0), ...o),
  ]);
  const turret = mergeGeometries([
    tint(new THREE.CylinderGeometry(3.6, 3.6, 1.2, 12).translate(0, 5.4, 0), ...o),
    tint(new THREE.BoxGeometry(1.2, 4, 5).translate(-2.4, 7, 0), ...o),
    tint(new THREE.BoxGeometry(1.2, 4, 5).translate(2.4, 7, 0), ...o),
    tint(new THREE.BoxGeometry(9, 5, 0.5).translate(0, 7.5, 3.6), 0.38, 0.41, 0.3),
  ]);
  const barrel = mergeGeometries([
    tint(new THREE.CylinderGeometry(0.75, 1.0, BARREL, 10).rotateX(Math.PI / 2).translate(0, 0, BARREL / 2 - 6), 0.25, 0.27, 0.22),
    tint(new THREE.CylinderGeometry(1.25, 1.25, 2.4, 8).rotateX(Math.PI / 2).translate(0, 0, BARREL - 6), 0.15),
    tint(new THREE.BoxGeometry(2.6, 2.6, 7).translate(0, 0, -4), ...o),
    tint(new THREE.CylinderGeometry(0.5, 0.5, 10, 6).rotateX(Math.PI / 2).translate(0, 1.4, 0), ...o),
  ]);
  return { base, turret, barrel };
}

export class Flak {
  constructor(terrain, parent, effects) {
    this.terrain = terrain; this.effects = effects;
    const g = gunGeometries(), mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.meshes = {};
    for (const k of ['base', 'turret', 'barrel']) {
      const m = new THREE.InstancedMesh(g[k], mat, 30);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      parent.add(m); this.meshes[k] = m;
    }
    this.shellMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(2.2, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe2a0, toneMapped: false }), 200);
    this.shellMesh.frustumCulled = false; this.shellMesh.count = 0;
    parent.add(this.shellMesh);
    this.guns = []; this.shells = [];
    this.reloadTime = 3.2;
    this.onBurst = null; this.onFire = null;
    this.lastShell = null;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }

  setCount(n) {
    const old = this.guns;
    this.guns = [];
    const cols = 6;
    for (let i = 0; i < n; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const x = (c - (Math.min(n, cols) - 1) / 2) * 140 + (r % 2) * 50, z = 1370 + r * 70 + (c % 2) * 20;
      const y = this.terrain.surfaceAt(x, z) - 0.3;
      const prev = old[i];
      this.guns.push({ x, y, z, yaw: prev?.yaw ?? Math.PI, pitch: prev?.pitch ?? 0.8, wantYaw: Math.PI, wantPitch: 0.8, reload: 0, recoil: 0, factor: 0.85 + Math.random() * 0.3, fireAt: null });
    }
    for (const m of Object.values(this.meshes)) m.count = n;
  }

  pivot(g) { return new THREE.Vector3(g.x, g.y + PIVOT_H, g.z); }

  // kąt, azymut i czas lotu, by pocisk dotarł do punktu p
  solve(g, p) {
    const P = this.pivot(g), dx = p.x - P.x, dz = p.z - P.z, d = Math.hypot(dx, dz), h = p.y - P.y;
    const elev = solveElevation(Math.max(d, 1), h, SHELL_V);
    if (elev === null) return null;
    return { elev, az: Math.atan2(dx, dz), t: Math.max(d, 1) / (SHELL_V * Math.cos(elev)) };
  }

  // punkty wybuchów rozłożone równomiernie w prostopadłościanie
  boxPoints(box, n) {
    const sz = new THREE.Vector3().subVectors(box.max, box.min);
    const a = Math.cbrt(n / Math.max(1, sz.x * sz.y * sz.z));
    const dims = [Math.max(1, Math.round(sz.x * a)), Math.max(1, Math.round(sz.y * a)), Math.max(1, Math.round(sz.z * a))];
    while (dims[0] * dims[1] * dims[2] < n) { const k = [sz.x / dims[0], sz.y / dims[1], sz.z / dims[2]].reduce((bi, v, i, arr) => (v > arr[bi] ? i : bi), 0); dims[k]++; }
    const [nx, ny, nz] = dims;
    const cells = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let l = 0; l < nz; l++) cells.push([i, j, l]);
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    return Array.from({ length: n }, (_, q) => {
      const [i, j, l] = cells[q % cells.length];
      return new THREE.Vector3(box.min.x + (i + Math.random()) / nx * sz.x, box.min.y + (j + Math.random()) / ny * sz.y, box.min.z + (l + Math.random()) / nz * sz.z);
    });
  }

  ready() { return this.guns.filter((g) => g.reload <= 0 && g.fireAt === null); }

  // czas do wybuchu dla środka prostopadłościanu (najdłuższy lot spośród dział)
  flightTimes(p) {
    let min = Infinity, max = 0;
    for (const g of this.guns) { const s = this.solve(g, p); if (s) { min = Math.min(min, s.t); max = Math.max(max, s.t); } }
    return max ? { min, max } : null;
  }

  // mode: 'sync' — wszystkie wybuchają naraz; 'salvo' — strzał od razu; zwraca czas do wybuchu
  fire(box, mode) {
    const guns = this.ready();
    if (!guns.length) return null;
    const pts = this.boxPoints(box, guns.length);
    const plan = [];
    guns.forEach((g, i) => { const s = this.solve(g, pts[i]); if (s) plan.push({ g, p: pts[i], s }); });
    if (!plan.length) return null;
    const T = Math.max(...plan.map((x) => x.s.t)) + (mode === 'sync' ? 0.4 : 0);
    for (const x of plan) {
      x.g.wantYaw = x.s.az; x.g.wantPitch = x.s.elev;
      x.g.fireAt = mode === 'sync' ? T - x.s.t : 0.05 + Math.random() * 0.15;
      x.g.plan = x;
      x.g.reload = this.reloadTime * x.g.factor + (x.g.fireAt || 0);
    }
    return mode === 'sync' ? T : Math.min(...plan.map((x) => x.s.t));
  }

  // ogień ciągły: każde gotowe działo strzela w losowy punkt prostopadłościanu
  fireContinuous(box) {
    for (const g of this.ready()) {
      const p = this.boxPoints(box, 1)[0], s = this.solve(g, p);
      if (!s) continue;
      g.wantYaw = s.az; g.wantPitch = s.elev; g.fireAt = 0.1 + Math.random() * 0.4; g.plan = { g, p, s };
      g.reload = this.reloadTime * g.factor + g.fireAt;
    }
  }

  // tryb AI (gracz w samolocie): strzał w przewidywane położenie z rozrzutem
  fireAt(g, p, spread) {
    const q = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread * 0.6, (Math.random() - 0.5) * spread));
    const s = this.solve(g, q);
    if (!s) return false;
    g.wantYaw = s.az; g.wantPitch = s.elev; g.fireAt = 0.05; g.plan = { g, p: q, s };
    g.reload = this.reloadTime * g.factor;
    return true;
  }

  aimIdle(p) {
    for (const g of this.guns) {
      if (g.fireAt !== null) continue;
      const s = this.solve(g, p);
      if (s) { g.wantYaw = s.az; g.wantPitch = s.elev; }
    }
  }

  update(dt) {
    for (const g of this.guns) {
      g.reload = Math.max(0, g.reload - dt);
      const dy = Math.atan2(Math.sin(g.wantYaw - g.yaw), Math.cos(g.wantYaw - g.yaw));
      g.yaw += Math.sign(dy) * Math.min(Math.abs(dy), 3 * dt);
      g.pitch += Math.sign(g.wantPitch - g.pitch) * Math.min(Math.abs(g.wantPitch - g.pitch), 2 * dt);
      g.recoil = Math.max(0, g.recoil - dt * 3);
      if (g.fireAt !== null) {
        g.fireAt -= dt;
        if (g.fireAt <= 0) { g.fireAt = null; this.shoot(g); }
      }
    }
    // pociski z zapalnikiem czasowym
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt;
      const t = Math.min(s.t, s.T);
      s.pos.set(s.P.x + s.V.x * t, s.P.y + s.V.y * t - 0.5 * G * t * t, s.P.z + s.V.z * t);
      if (Math.random() < 0.5) this.effects.smoke.spawn({ p: s.pos.clone(), v: new THREE.Vector3(0, 0.5, 0), life: 0.6, s0: 1.4, s1: 2.4, c0: 0xd8d4cc, c1: 0xffffff, drag: 0.5 });
      if (s.t >= s.T) {
        this.shells.splice(i, 1);
        s.burst = true;
        this.burstFx(s.pos, this.burstScale || 1);
        if (this.onBurst) this.onBurst(s.pos.clone(), s);
      } else if (s.pos.y < this.terrain.surfaceAt(s.pos.x, s.pos.z)) this.shells.splice(i, 1);
    }
    this.render();
  }

  shoot(g) {
    const x = g.plan;
    if (!x) return;
    // drobny rozrzut kąta i prędkości
    const elev = x.s.elev + (Math.random() - 0.5) * 0.004, az = x.s.az + (Math.random() - 0.5) * 0.004, v = SHELL_V * (1 + (Math.random() - 0.5) * 0.006);
    const c = Math.cos(elev);
    const V = new THREE.Vector3(Math.sin(az) * c * v, Math.sin(elev) * v, Math.cos(az) * c * v);
    const P = this.pivot(g);
    const shell = { P, V, t: BARREL / SHELL_V, T: x.s.t, pos: P.clone(), target: x.p };
    this.shells.push(shell);
    this.lastShell = shell;
    g.recoil = 1;
    const muzzle = P.clone().addScaledVector(V.clone().normalize(), BARREL - 6);
    this.effects.muzzle(muzzle, V.clone().normalize());
    if (this.onFire) this.onFire(muzzle);
  }

  // wybuch flaku: błysk, czarny obłok i drobne odłamki
  burstFx(p, k = 1) {
    const fx = this.effects;
    for (let i = 0; i < 4; i++) fx.fire.spawn({ p: p.clone(), v: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20), life: 0.18, s0: 9 * k, s1: 16 * k, c0: 0xffe8b0, c1: 0x000000, drag: 0.1 });
    for (let i = 0; i < 26; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((140 + Math.random() * 160) * k);
      fx.fire.spawn({ p: p.clone(), v: d, life: 0.22 + Math.random() * 0.15, s0: 1.1, s1: 0.6, c0: 0xffd070, c1: 0x301000, drag: 0.2 });
    }
    for (let i = 0; i < 7; i++) fx.smoke.spawn({ p: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6)), v: new THREE.Vector3((Math.random() - 0.5) * 6, 1 + Math.random() * 2, (Math.random() - 0.5) * 6), life: 7 + Math.random() * 4, s0: 6 * k, s1: (16 + Math.random() * 6) * k, c0: 0x161514, c1: 0x5e5a56, drag: 0.4 });
  }

  render() {
    const { base, turret, barrel } = this.meshes, m = this._m, q = this._q;
    this.guns.forEach((g, i) => {
      m.makeTranslation(g.x, g.y, g.z); base.setMatrixAt(i, m);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), g.yaw);
      m.compose(this._v.set(g.x, g.y, g.z), q, this._s); turret.setMatrixAt(i, m);
      const qb = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -g.pitch));
      const off = new THREE.Vector3(0, 0, -g.recoil * 4).applyQuaternion(qb);
      m.compose(this._v.set(g.x, g.y + PIVOT_H, g.z).add(off), qb, this._s); barrel.setMatrixAt(i, m);
    });
    for (const k of [base, turret, barrel]) k.instanceMatrix.needsUpdate = true;
    let n = 0;
    for (const s of this.shells) { m.makeTranslation(s.pos.x, s.pos.y, s.pos.z); this.shellMesh.setMatrixAt(n++, m); }
    this.shellMesh.count = n; this.shellMesh.instanceMatrix.needsUpdate = true;
  }

  reset() { this.shells.length = 0; for (const g of this.guns) { g.reload = 0; g.fireAt = null; } }
}
