import * as THREE from 'three';
import {
  G, MUZZLE_V, SHELL_TIME_SCALE, RELOAD_TIME, LETHAL_RADIUS, DISPERSION,
  BATTERY_Z, MAP_W, MAP_D, BASE_Y, WATER_LEVEL,
} from './config.js';

const DEG = Math.PI / 180;
const BARREL_LEN = 24;
const PIVOT_H = 6.5;

// Kąt podniesienia potrzebny, by trafić w punkt odległy o d (poziomo) i h (pionowo).
export function solveElevation(d, h, v, high) {
  const v2 = v * v;
  const disc = v2 * v2 - G * (G * d * d + 2 * h * v2);
  if (disc < 0 || d < 1) return null;
  const s = Math.sqrt(disc);
  return Math.atan((v2 + (high ? s : -s)) / (G * d));
}

// Śledzi tor pocisku aż do zderzenia z terenem/wodą.
export function traceTrajectory(terrain, P, V, maxT = 80) {
  const pos = (t, out) => out.set(P.x + V.x * t, P.y + V.y * t - 0.5 * G * t * t, P.z + V.z * t);
  const p = new THREE.Vector3();
  const tStart = BARREL_LEN / V.length() + 0.02;
  const dt = 0.08;
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

function makeGunModel() {
  const olive = new THREE.MeshLambertMaterial({ color: 0x55602c });
  const dark = new THREE.MeshLambertMaterial({ color: 0x353b1c });
  const black = new THREE.MeshLambertMaterial({ color: 0x1d1d1b });
  const sand = new THREE.MeshLambertMaterial({ color: 0xb9a57a, flatShading: true });
  const root = new THREE.Group();
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

  // worki z piaskiem (stanowisko)
  const bags = add(root, new THREE.TorusGeometry(17, 2.4, 5, 18), sand, 0, 1.2, 0);
  bags.rotation.x = Math.PI / 2; bags.scale.z = 0.8;
  add(root, new THREE.CylinderGeometry(15, 15, 0.6, 18), new THREE.MeshLambertMaterial({ color: 0x6b5a3d }), 0, 0.3, 0);

  const yaw = new THREE.Group(); root.add(yaw);
  add(yaw, new THREE.BoxGeometry(6, 3, 10), olive, 0, 4.2, 0.5);
  // koła
  for (const sx of [-1, 1]) {
    const w = add(yaw, new THREE.CylinderGeometry(3.3, 3.3, 1.6, 12), black, sx * 4.4, 3.3, 0);
    w.rotation.z = Math.PI / 2;
    const hub = add(yaw, new THREE.CylinderGeometry(1.2, 1.2, 1.8, 8), dark, sx * 4.5, 3.3, 0);
    hub.rotation.z = Math.PI / 2;
  }
  // ogony łoża
  for (const sx of [-1, 1]) {
    const tr = add(yaw, new THREE.BoxGeometry(1.2, 1.2, 15), olive, sx * 2.6, 1.8, 8.5);
    tr.rotation.y = sx * 0.22; tr.rotation.x = 0.12;
    add(yaw, new THREE.BoxGeometry(2.4, 1.2, 1.2), dark, sx * 4.2, 0.8, 15.5);
  }
  // tarcza
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

  // skrzynki z amunicją
  for (let i = 0; i < 3; i++) add(root, new THREE.BoxGeometry(4, 2.4, 2.8), new THREE.MeshLambertMaterial({ color: 0x5d4a2a }), 9 + i * 0.6, 1.3, 9 - i * 3.2);
  return { root, yaw, pitch, recoil };
}

export class Battery {
  constructor(terrain, mapGroup, effects, sound) {
    this.terrain = terrain;
    this.map = mapGroup;
    this.effects = effects;
    this.sound = sound;
    this.highArc = false;
    this.guns = [];
    const xs = [-165, -55, 55, 165];
    xs.forEach((x, i) => {
      const z = BATTERY_Z + (i % 2) * 22;
      const model = makeGunModel();
      model.root.position.set(x, terrain.surfaceAt(x, z) - 0.3, z);
      mapGroup.add(model.root);
      this.guns.push({ ...model, reload: 0, yawCur: 0, pitchCur: 10 * DEG, recoilT: 1 });
    });
    this.pending = [];
    this.shells = [];
    this.onFire = null;    // callback(gunWorldPos)
    this.onImpact = null;  // callback(point, water)

    // podgląd toru: kropki
    const dotGeo = new THREE.IcosahedronGeometry(3.4, 1);
    this.dotMat = new THREE.MeshBasicMaterial({ color: 0x7dffb0, toneMapped: false, transparent: true, opacity: 0.95 });
    this.DOTS = 70;
    this.dots = new THREE.InstancedMesh(dotGeo, this.dotMat, this.DOTS);
    this.dots.frustumCulled = false;
    this.dots.count = 0;
    mapGroup.add(this.dots);

    // pierścień strefy rażenia (wstęga dopasowana do terenu)
    this.RING_SEG = 56;
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((this.RING_SEG + 1) * 2 * 3), 3));
    const ri = [];
    for (let s = 0; s < this.RING_SEG; s++) { const a = s * 2; ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    rg.setIndex(ri);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x7dffb0, side: THREE.DoubleSide, toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false });
    this.ring = new THREE.Mesh(rg, this.ringMat);
    this.ring.frustumCulled = false; this.ring.renderOrder = 3;
    mapGroup.add(this.ring);
    // słup nad punktem upadku
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 140, 6).translate(0, 70, 0),
      new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
    mapGroup.add(this.beam);
    // krzyżyk w miejscu celowania
    const cross = new THREE.Group();
    const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    cross.add(new THREE.Mesh(new THREE.BoxGeometry(22, 1.2, 2.4), cm));
    cross.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 22), cm));
    this.cross = cross;
    mapGroup.add(cross);

    // pociski
    const shellGeo = new THREE.SphereGeometry(3, 8, 6);
    const shellMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false });
    this.shellPool = [];
    for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(shellGeo, shellMat); m.visible = false; mapGroup.add(m); this.shellPool.push(m); }

    this.preview = null;
    this.phase = 0;
  }

  pivotOf(gun) { return gun.root.position.clone().add(new THREE.Vector3(0, PIVOT_H, 0)); }

  center() {
    const c = new THREE.Vector3();
    for (const g of this.guns) c.add(this.pivotOf(g));
    return c.multiplyScalar(1 / this.guns.length);
  }

  // rozwiązanie strzału z danego punktu na cel
  solution(P, target, high) {
    const dx = target.x - P.x, dz = target.z - P.z;
    const d = Math.hypot(dx, dz);
    const h = target.y - P.y;
    let elev = solveElevation(d, h, MUZZLE_V, high);
    const inRange = elev !== null;
    if (!inRange) elev = 45 * DEG;
    const az = Math.atan2(dx, dz);
    return { elev, az, d, inRange };
  }

  velocity(elev, az, v = MUZZLE_V) {
    const c = Math.cos(elev);
    return new THREE.Vector3(Math.sin(az) * c * v, Math.sin(elev) * v, Math.cos(az) * c * v);
  }

  update(dt, target) {
    this.phase = (this.phase + dt * 0.8) % 1;
    // podgląd
    this.preview = null;
    if (target) {
      const P = this.center();
      const sol = this.solution(P, target, this.highArc);
      const V = this.velocity(sol.elev, sol.az);
      const tr = traceTrajectory(this.terrain, P, V);
      let status = 'ok';
      if (!sol.inRange) status = 'range';
      else if (!tr.hit || tr.point.distanceTo(target) > 25) status = 'blocked';
      this.preview = { P, V, tr, status, dist: sol.d, target: target.clone() };
      this.drawPreview();
    } else {
      this.dots.count = 0; this.ring.visible = false; this.beam.visible = false; this.cross.visible = false;
    }

    // celowanie dział (animacja)
    for (const gun of this.guns) {
      gun.reload = Math.max(0, gun.reload - dt);
      let wantYaw = gun.yawCur, wantPitch = gun.pitchCur;
      if (target) {
        const s = this.solution(this.pivotOf(gun), target, this.highArc);
        wantYaw = s.az + Math.PI; // model patrzy w -Z
        wantPitch = s.elev;
      }
      let dy = ((wantYaw - gun.yawCur + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      gun.yawCur += Math.sign(dy) * Math.min(Math.abs(dy), 2.5 * dt);
      const dp = wantPitch - gun.pitchCur;
      gun.pitchCur += Math.sign(dp) * Math.min(Math.abs(dp), 1.6 * dt);
      gun.yaw.rotation.y = gun.yawCur;
      gun.pitch.rotation.x = gun.pitchCur;
      gun.recoilT = Math.min(1, gun.recoilT + dt * 1.6);
      const r = gun.recoilT < 0.12 ? gun.recoilT / 0.12 : 1 - (gun.recoilT - 0.12) / 0.88;
      gun.recoil.position.z = Math.max(0, r) * 5;
    }

    // zaplanowane strzały (salwa z niewielkim opóźnieniem)
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const pd = this.pending[i];
      pd.delay -= dt;
      if (pd.delay <= 0) { this.pending.splice(i, 1); this.shoot(pd.gun, pd.target, pd.high); }
    }

    // lot pocisków
    const tmp = new THREE.Vector3();
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt * SHELL_TIME_SCALE;
      const t = Math.min(s.t, s.tr.t);
      tmp.set(s.P.x + s.V.x * t, s.P.y + s.V.y * t - 0.5 * G * t * t, s.P.z + s.V.z * t);
      s.mesh.position.copy(tmp);
      s.mesh.visible = s.t > BARREL_LEN / MUZZLE_V;
      s.trailAcc += dt;
      if (s.trailAcc > 0.03 && s.mesh.visible) { s.trailAcc = 0; this.effects.trail(tmp); }
      if (s.t >= s.tr.t) {
        s.mesh.visible = false;
        this.shellPool.push(s.mesh);
        this.shells.splice(i, 1);
        if (s.tr.hit && this.onImpact) this.onImpact(s.tr.point, s.tr.water);
      }
    }
  }

  drawPreview() {
    const pv = this.preview;
    const col = pv.status === 'ok' ? 0x7dffb0 : pv.status === 'blocked' ? 0xffa53a : 0xff4a4a;
    this.dotMat.color.setHex(col);
    this.ringMat.color.setHex(col);
    this.beam.material.color.setHex(col);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const t0 = BARREL_LEN / MUZZLE_V;
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

    if (pv.tr.hit) {
      const c = pv.tr.point;
      const arr = this.ring.geometry.attributes.position.array;
      const R = LETHAL_RADIUS;
      for (let s = 0; s <= this.RING_SEG; s++) {
        const a = (s / this.RING_SEG) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        for (let k = 0; k < 2; k++) {
          const r = k === 0 ? R - 2.2 : R + 2.2;
          const x = Math.max(-MAP_W / 2, Math.min(MAP_W / 2, c.x + ca * r));
          const z = Math.max(-MAP_D / 2, Math.min(MAP_D / 2, c.z + sa * r));
          const o = (s * 2 + k) * 3;
          arr[o] = x; arr[o + 1] = this.terrain.surfaceAt(x, z) + 2.5; arr[o + 2] = z;
        }
      }
      this.ring.geometry.attributes.position.needsUpdate = true;
      this.ring.visible = true;
      this.beam.visible = true;
      this.beam.position.copy(c);
    } else {
      this.ring.visible = false; this.beam.visible = false;
    }
    this.cross.visible = true;
    this.cross.position.copy(pv.target).add(new THREE.Vector3(0, 1.5, 0));
  }

  readyCount() { return this.guns.filter((g) => g.reload <= 0).length; }

  fire(target) {
    if (!target) return 0;
    let delay = 0, n = 0;
    for (const gun of this.guns) {
      if (gun.reload > 0 || this.pending.some((p) => p.gun === gun)) continue;
      gun.reload = RELOAD_TIME;
      this.pending.push({ gun, target: target.clone(), high: this.highArc, delay });
      delay += 0.14 + Math.random() * 0.1;
      n++;
    }
    return n;
  }

  shoot(gun, target, high) {
    const P = this.pivotOf(gun);
    const sol = this.solution(P, target, high);
    const gr = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    const elev = sol.elev + gr() * DISPERSION.elevationDeg * DEG;
    const az = sol.az + gr() * DISPERSION.azimuthDeg * DEG;
    const v = MUZZLE_V * (1 + gr() * DISPERSION.velocity);
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
    for (const s of this.shells) { s.mesh.visible = false; this.shellPool.push(s.mesh); }
    this.shells.length = 0;
    for (const g of this.guns) g.reload = 0;
  }
}
