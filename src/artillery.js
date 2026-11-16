import * as THREE from 'three';
import {
  G, MAX_V, LETHAL_RADIUS, DISPERSION, BATTERY_Z, MAP_W, MAP_D, BASE_Y, WATER_LEVEL,
  OPTS, shellTimeScale,
} from './config.js';

const DEG = Math.PI / 180;
const BARREL_LEN = 24;
const PIVOT_H = 6.5;

// Prędkość wylotowa potrzebna, by przy zadanym kącie trafić w punkt odległy o d (poziomo) i h (pionowo).
export function solveVelocity(d, h, elev) {
  d = Math.max(d, 1);
  const c = Math.cos(elev);
  const denom = 2 * c * c * (d * Math.tan(elev) - h);
  if (denom <= 0) return { v: MAX_V, ok: false };
  const v = Math.sqrt((G * d * d) / denom);
  if (v > MAX_V) return { v: MAX_V, ok: false };
  return { v, ok: true };
}

// Śledzi tor pocisku aż do zderzenia z terenem/wodą.
export function traceTrajectory(terrain, P, V, maxT = 160) {
  const pos = (t, out) => out.set(P.x + V.x * t, P.y + V.y * t - 0.5 * G * t * t, P.z + V.z * t);
  const p = new THREE.Vector3();
  const tStart = BARREL_LEN / V.length() + 0.02;
  const dt = Math.max(0.05, Math.min(0.15, 12 / V.length()));
  let prev = tStart;
  for (let t = tStart; t <= maxT; t += dt) {
    pos(t, p);
    if (!terrain.inside(p.x, p.z)) {
      if (p.y < BASE_Y - 60) return { hit: false, t, point: p.clone() };
      prev = t; continue;
    }
    if (p.y <= terrain.surfaceAt(p.x, p.z)) {
      let a = prev, b = t;
      for (let k = 0; k < 14; k++) {
        const m = (a + b) / 2; pos(m, p);
        if (terrain.inside(p.x, p.z) && p.y <= terrain.surfaceAt(p.x, p.z)) b = m; else a = m;
      }
      pos(b, p);
      p.y = terrain.surfaceAt(p.x, p.z);
      return { hit: true, t: b, point: p.clone(), water: terrain.heightAt(p.x, p.z) < WATER_LEVEL };
    }
    prev = t;
  }
  return { hit: false, t: maxT, point: pos(maxT, p).clone() };
}

const MATS = {
  olive: new THREE.MeshLambertMaterial({ color: 0x55602c }),
  dark: new THREE.MeshLambertMaterial({ color: 0x353b1c }),
  black: new THREE.MeshLambertMaterial({ color: 0x1d1d1b }),
  sand: new THREE.MeshLambertMaterial({ color: 0xb9a57a, flatShading: true }),
  pit: new THREE.MeshLambertMaterial({ color: 0x6b5a3d }),
  crate: new THREE.MeshLambertMaterial({ color: 0x5d4a2a }),
};

function makeGunModel() {
  const { olive, dark, black, sand } = MATS;
  const root = new THREE.Group();
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const bags = add(root, new THREE.TorusGeometry(17, 2.4, 5, 18), sand, 0, 1.2, 0);
  bags.rotation.x = Math.PI / 2; bags.scale.z = 0.8;
  add(root, new THREE.CylinderGeometry(15, 15, 0.6, 18), MATS.pit, 0, 0.3, 0);
  const yaw = new THREE.Group(); root.add(yaw);
  add(yaw, new THREE.BoxGeometry(6, 3, 10), olive, 0, 4.2, 0.5);
  for (const sx of [-1, 1]) {
    const w = add(yaw, new THREE.CylinderGeometry(3.3, 3.3, 1.6, 12), black, sx * 4.4, 3.3, 0);
    w.rotation.z = Math.PI / 2;
    const hub = add(yaw, new THREE.CylinderGeometry(1.2, 1.2, 1.8, 8), dark, sx * 4.5, 3.3, 0);
    hub.rotation.z = Math.PI / 2;
    const tr = add(yaw, new THREE.BoxGeometry(1.2, 1.2, 15), olive, sx * 2.6, 1.8, 8.5);
    tr.rotation.y = sx * 0.22; tr.rotation.x = 0.12;
    add(yaw, new THREE.BoxGeometry(2.4, 1.2, 1.2), dark, sx * 4.2, 0.8, 15.5);
  }
  const shield = add(yaw, new THREE.BoxGeometry(11, 5.5, 0.5), olive, 0, 6.5, -2.6);
  shield.rotation.x = -0.15;
  const pitch = new THREE.Group(); pitch.position.set(0, PIVOT_H, 0); yaw.add(pitch);
  const recoil = new THREE.Group(); pitch.add(recoil);
  const barrel = add(recoil, new THREE.CylinderGeometry(0.85, 1.1, BARREL_LEN, 10), dark, 0, 0, 0);
  barrel.rotation.x = Math.PI / 2; barrel.position.z = -BARREL_LEN / 2 + 3;
  const brake = add(recoil, new THREE.CylinderGeometry(1.5, 1.5, 2.6, 8), black, 0, 0, -BARREL_LEN + 2);
  brake.rotation.x = Math.PI / 2;
  add(recoil, new THREE.BoxGeometry(2.8, 2.8, 5), olive, 0, 0, 4.5);
  add(recoil, new THREE.CylinderGeometry(0.6, 0.6, 9, 6).rotateX(Math.PI / 2), olive, 0, 1.5, -2);
  for (let i = 0; i < 3; i++) add(root, new THREE.BoxGeometry(4, 2.4, 2.8), MATS.crate, 9 + i * 0.6, 1.3, 9 - i * 3.2);
  return { root, yaw, pitch, recoil };
}

// Wstęga leżąca na terenie (pierścień lub prostokąt)
class GroundRibbon {
  constructor(parent, n, color, opacity = 0.9) {
    this.n = n;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const idx = [];
    for (let s = 0; s < n - 1; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false, transparent: true, opacity, depthWrite: false });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; this.mesh.visible = false;
    parent.add(this.mesh);
  }
  // pts: [[x,z,nx,nz],...]
  set(terrain, pts, half) {
    const arr = this.mesh.geometry.attributes.position.array;
    for (let s = 0; s < this.n; s++) {
      const [x, z, nx, nz] = pts[Math.min(s, pts.length - 1)];
      for (let k = 0; k < 2; k++) {
        const o = k === 0 ? -half : half;
        const px = Math.max(-MAP_W / 2, Math.min(MAP_W / 2, x + nx * o));
        const pz = Math.max(-MAP_D / 2, Math.min(MAP_D / 2, z + nz * o));
        const i = (s * 2 + k) * 3;
        arr[i] = px; arr[i + 1] = terrain.surfaceAt(px, pz) + 2.5; arr[i + 2] = pz;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.visible = true;
  }
}

function ringPoints(c, R, n) {
  const pts = [];
  for (let s = 0; s < n; s++) {
    const a = (s / (n - 1)) * Math.PI * 2;
    pts.push([c.x + Math.cos(a) * R, c.z + Math.sin(a) * R, Math.cos(a), Math.sin(a)]);
  }
  return pts;
}

function rectPoints(r, n) {
  const per = Math.floor(n / 4);
  const corners = [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
  const normals = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const pts = [];
  for (let e = 0; e < 4; e++) {
    const [ax, az] = corners[e], [bx, bz] = corners[(e + 1) % 4];
    for (let k = 0; k < per; k++) {
      const t = k / (per - 1);
      pts.push([ax + (bx - ax) * t, az + (bz - az) * t, normals[e][0], normals[e][1]]);
    }
  }
  while (pts.length < n) pts.push(pts[pts.length - 1]);
  return pts;
}

export function specCenter(terrain, spec) {
  if (spec.type === 'point') return spec.p;
  const x = (spec.x0 + spec.x1) / 2, z = (spec.z0 + spec.z1) / 2;
  return new THREE.Vector3(x, terrain.surfaceAt(x, z), z);
}

export class Battery {
  constructor(terrain, mapGroup, effects) {
    this.terrain = terrain;
    this.map = mapGroup;
    this.effects = effects;
    this.continuous = false;
    this.guns = [];
    this.pending = [];
    this.shells = [];
    this.onFire = null;    // (muzzlePos)
    this.onImpact = null;  // (point, water)
    this.setGunCount(OPTS.guns);

    const dotGeo = new THREE.IcosahedronGeometry(3.4, 1);
    this.dotMat = new THREE.MeshBasicMaterial({ color: 0x7dffb0, toneMapped: false, transparent: true, opacity: 0.95 });
    this.DOTS = 90;
    this.dots = new THREE.InstancedMesh(dotGeo, this.dotMat, this.DOTS);
    this.dots.frustumCulled = false;
    this.dots.count = 0;
    mapGroup.add(this.dots);

    this.ring = new GroundRibbon(mapGroup, 57, 0x7dffb0);
    this.rect = new GroundRibbon(mapGroup, 84, 0x7dffb0);
    this.drawRect = new GroundRibbon(mapGroup, 84, 0xffffff, 0.8);
    // wypełnienie obszaru
    const FN = 14;
    this.FN = FN;
    const fg = new THREE.PlaneGeometry(1, 1, FN - 1, FN - 1);
    fg.rotateX(-Math.PI / 2);
    this.fillMat = new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.fill = new THREE.Mesh(fg, this.fillMat);
    this.fill.frustumCulled = false; this.fill.visible = false; this.fill.renderOrder = 3;
    mapGroup.add(this.fill);

    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 160, 6).translate(0, 80, 0),
      new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
    mapGroup.add(this.beam);
    const cross = new THREE.Group();
    const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    cross.add(new THREE.Mesh(new THREE.BoxGeometry(22, 1.2, 2.4), cm));
    cross.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 22), cm));
    this.cross = cross;
    mapGroup.add(cross);

    const shellGeo = new THREE.SphereGeometry(3, 8, 6);
    const shellMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false });
    this.shellPool = [];
    for (let i = 0; i < 64; i++) { const m = new THREE.Mesh(shellGeo, shellMat); m.visible = false; mapGroup.add(m); this.shellPool.push(m); }

    this.preview = null;
    this.phase = 0;
    this.time = 0;
  }

  setGunCount(n) {
    for (const g of this.guns) this.map.remove(g.root);
    this.guns = [];
    this.pending.length = 0;
    const spacing = Math.min(120, 820 / Math.max(1, n));
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * spacing;
      const z = BATTERY_Z + (i % 2) * 28;
      const model = makeGunModel();
      model.root.position.set(x, this.terrain.surfaceAt(x, z) - 0.3, z);
      this.map.add(model.root);
      const factor = 0.85 + Math.random() * 0.3; // każde działo ma swój czas ładowania
      this.guns.push({ ...model, factor, reload: 0, yawCur: Math.PI, pitchCur: OPTS.angle * DEG, recoilT: 1 });
    }
  }

  reloadTime(gun) { return OPTS.reload * gun.factor; }

  pivotOf(gun) { return gun.root.position.clone().add(new THREE.Vector3(0, PIVOT_H, 0)); }

  center() {
    const c = new THREE.Vector3();
    for (const g of this.guns) c.add(this.pivotOf(g));
    return c.multiplyScalar(1 / Math.max(1, this.guns.length));
  }

  solution(P, target) {
    const dx = target.x - P.x, dz = target.z - P.z;
    const d = Math.hypot(dx, dz);
    const elev = OPTS.angle * DEG;
    const { v, ok } = solveVelocity(d, target.y - P.y, elev);
    return { elev, az: Math.atan2(dx, dz), d, v, inRange: ok };
  }

  velocity(elev, az, v) {
    const c = Math.cos(elev);
    return new THREE.Vector3(Math.sin(az) * c * v, Math.sin(elev) * v, Math.cos(az) * c * v);
  }

  pickPoint(spec) {
    if (spec.type === 'point') return spec.p.clone();
    const x = spec.x0 + Math.random() * (spec.x1 - spec.x0), z = spec.z0 + Math.random() * (spec.z1 - spec.z0);
    return new THREE.Vector3(x, this.terrain.surfaceAt(x, z), z);
  }

  // spec: cel {type:'point',p} | {type:'area',x0,x1,z0,z1}; drawing: prostokąt w trakcie wyznaczania
  update(dt, spec, drawing, locked) {
    this.time += dt;
    this.phase = (this.phase + dt * 0.6) % 1;
    const target = spec ? specCenter(this.terrain, spec) : null;
    this.preview = null;
    if (target) {
      const P = this.center();
      const sol = this.solution(P, target);
      const V = this.velocity(sol.elev, sol.az, sol.v);
      const tr = traceTrajectory(this.terrain, P, V);
      let status = 'ok';
      if (!sol.inRange) status = 'range';
      else if (!tr.hit || tr.point.distanceTo(target) > 25) status = 'blocked';
      this.preview = { P, V, tr, status, dist: sol.d, target: target.clone(), spec };
      this.drawPreview(locked);
    } else {
      this.dots.count = 0; this.ring.mesh.visible = false; this.rect.mesh.visible = false;
      this.fill.visible = false; this.beam.visible = false; this.cross.visible = false;
    }
    if (drawing) this.drawRect.set(this.terrain, rectPoints(drawing, 84), 2.2);
    else this.drawRect.mesh.visible = false;

    if (this.continuous && spec) this.fire(spec);

    for (const gun of this.guns) {
      gun.reload = Math.max(0, gun.reload - dt);
      let wantYaw = gun.yawCur, wantPitch = gun.pitchCur;
      if (target) {
        const s = this.solution(this.pivotOf(gun), target);
        wantYaw = s.az + Math.PI; // model patrzy w -Z
        wantPitch = s.elev;
      }
      const dy = ((wantYaw - gun.yawCur + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      gun.yawCur += Math.sign(dy) * Math.min(Math.abs(dy), 2.5 * dt);
      const dp = wantPitch - gun.pitchCur;
      gun.pitchCur += Math.sign(dp) * Math.min(Math.abs(dp), 1.6 * dt);
      gun.yaw.rotation.y = gun.yawCur;
      gun.pitch.rotation.x = gun.pitchCur;
      gun.recoilT = Math.min(1, gun.recoilT + dt * 1.6);
      const r = gun.recoilT < 0.12 ? gun.recoilT / 0.12 : 1 - (gun.recoilT - 0.12) / 0.88;
      gun.recoil.position.z = Math.max(0, r) * 5;
    }

    for (let i = this.pending.length - 1; i >= 0; i--) {
      const pd = this.pending[i];
      pd.delay -= dt;
      if (pd.delay <= 0) { this.pending.splice(i, 1); this.shoot(pd.gun, pd.spec); }
    }

    const ts = shellTimeScale();
    const tmp = new THREE.Vector3();
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt * ts;
      const t = Math.min(s.t, s.tr.t);
      tmp.set(s.P.x + s.V.x * t, s.P.y + s.V.y * t - 0.5 * G * t * t, s.P.z + s.V.z * t);
      s.mesh.position.copy(tmp);
      s.mesh.visible = s.t > BARREL_LEN / s.V.length();
      s.trailAcc += dt;
      if (s.trailAcc > 0.035 && s.mesh.visible) { s.trailAcc = 0; this.effects.trail(tmp); }
      if (s.t >= s.tr.t) {
        s.mesh.visible = false;
        this.shellPool.push(s.mesh);
        this.shells.splice(i, 1);
        if (s.tr.hit && this.onImpact) this.onImpact(s.tr.point, s.tr.water);
      }
    }
  }

  drawPreview(locked) {
    const pv = this.preview;
    const col = pv.status === 'ok' ? 0x7dffb0 : pv.status === 'blocked' ? 0xffa53a : 0xff4a4a;
    this.dotMat.color.setHex(col);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const t0 = BARREL_LEN / pv.V.length();
    const T = pv.tr.t;
    let n = 0;
    for (let i = 0; i < this.DOTS; i++) {
      const t = t0 + ((i + this.phase) / this.DOTS) * (T - t0);
      p.set(pv.P.x + pv.V.x * t, pv.P.y + pv.V.y * t - 0.5 * G * t * t, pv.P.z + pv.V.z * t);
      if (!this.terrain.inside(p.x, p.z) && p.y < BASE_Y) continue;
      m.makeTranslation(p.x, p.y, p.z);
      this.dots.setMatrixAt(n++, m);
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;

    const spec = pv.spec;
    if (spec.type === 'area') {
      this.rect.mat.color.setHex(col);
      this.rect.set(this.terrain, rectPoints(spec, 84), 2.4);
      this.fillMat.color.setHex(col);
      const pos = this.fill.geometry.attributes.position.array;
      const FN = this.FN;
      for (let j = 0; j < FN; j++) {
        for (let i = 0; i < FN; i++) {
          const x = spec.x0 + (spec.x1 - spec.x0) * (i / (FN - 1));
          const z = spec.z0 + (spec.z1 - spec.z0) * (j / (FN - 1));
          const k = (j * FN + i) * 3;
          pos[k] = x; pos[k + 1] = this.terrain.surfaceAt(x, z) + 2; pos[k + 2] = z;
        }
      }
      this.fill.geometry.attributes.position.needsUpdate = true;
      this.fill.visible = true;
      this.ring.mesh.visible = false;
    } else {
      this.rect.mesh.visible = false; this.fill.visible = false;
      if (pv.tr.hit) {
        this.ring.mat.color.setHex(col);
        this.ring.set(this.terrain, ringPoints(pv.tr.point, LETHAL_RADIUS, 57), 2.2);
      } else this.ring.mesh.visible = false;
    }
    if (pv.tr.hit) {
      this.beam.visible = true;
      this.beam.position.copy(pv.tr.point);
      this.beam.material.color.setHex(locked ? 0xffffff : col);
      this.beam.material.opacity = locked ? 0.35 + 0.3 * Math.sin(this.time * 6) : 0.35;
      this.beam.scale.set(locked ? 1.8 : 1, 1, locked ? 1.8 : 1);
    } else this.beam.visible = false;
    this.cross.visible = true;
    this.cross.position.copy(pv.target).add(new THREE.Vector3(0, 1.5, 0));
  }

  readyCount() { return this.guns.filter((g) => g.reload <= 0).length; }

  // salwa z gotowych dział
  fire(spec) {
    if (!spec) return 0;
    let delay = 0, n = 0;
    for (const gun of this.guns) {
      if (gun.reload > 0 || this.pending.some((p) => p.gun === gun)) continue;
      gun.reload = this.reloadTime(gun);
      this.pending.push({ gun, spec, delay });
      delay += 0.12 + Math.random() * 0.1;
      n++;
    }
    return n;
  }

  shoot(gun, spec) {
    const target = this.pickPoint(spec);
    const P = this.pivotOf(gun);
    const sol = this.solution(P, target);
    const gr = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    const elev = sol.elev + gr() * DISPERSION.elevationDeg * DEG;
    const az = sol.az + gr() * DISPERSION.azimuthDeg * DEG;
    const v = sol.v * (1 + gr() * DISPERSION.velocity);
    const V = this.velocity(elev, az, v);
    const tr = traceTrajectory(this.terrain, P, V);
    const mesh = this.shellPool.pop();
    if (!mesh) return;
    this.shells.push({ P, V, tr, t: 0, mesh, trailAcc: 0 });
    gun.recoilT = 0;
    const dir = V.clone().normalize();
    const muzzle = P.clone().addScaledVector(dir, BARREL_LEN);
    this.effects.muzzle(muzzle, dir);
    if (this.onFire) this.onFire(muzzle);
  }

  reset() {
    this.pending.length = 0;
    this.continuous = false;
    for (const s of this.shells) { s.mesh.visible = false; this.shellPool.push(s.mesh); }
    this.shells.length = 0;
    for (const g of this.guns) g.reload = 0;
  }
}
