import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { W, TOWN, coastX, lerp } from './world.js';

const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
const tint = (g, r, gg = r, b = r) => {
  g = nonIdx(g);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gg; a[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};

function personGeometry() {
  return mergeGeometries([
    tint(new THREE.BoxGeometry(0.9, 3.4, 1).translate(-0.6, 1.7, 0), 0.3, 0.32, 0.4),
    tint(new THREE.BoxGeometry(0.9, 3.4, 1).translate(0.6, 1.7, 0), 0.3, 0.32, 0.4),
    tint(new THREE.BoxGeometry(2.4, 3.2, 1.4).translate(0, 5, 0), 1),
    tint(new THREE.BoxGeometry(0.7, 2.8, 0.7).translate(-1.6, 5, 0), 1),
    tint(new THREE.BoxGeometry(0.7, 2.8, 0.7).translate(1.6, 5, 0), 1),
    tint(new THREE.SphereGeometry(1.05, 8, 6).translate(0, 7.6, 0), 1.0, 0.86, 0.72),
  ]);
}

function carGeometry() {
  return mergeGeometries([
    tint(new THREE.BoxGeometry(6, 2.6, 13).translate(0, 2.3, 0), 1),
    tint(new THREE.BoxGeometry(5.2, 2.2, 6.5).translate(0, 4.6, -0.8), 0.25, 0.3, 0.38),
    ...[[-3, 4], [3, 4], [-3, -4], [3, -4]].map(([x, z]) => tint(new THREE.CylinderGeometry(1.3, 1.3, 1, 8).rotateZ(Math.PI / 2).translate(x, 1.3, z), 0.1)),
  ]);
}

const SHIRTS = [0xe85a4f, 0x4f8ee8, 0xf2c94c, 0x6fcf97, 0xbb6bd9, 0xf2994a, 0xffffff, 0x56ccf2, 0xeb5757, 0x27ae60];
const CARS = [0xd63a2f, 0x2f6fd6, 0xf2f2f2, 0x222428, 0xf2c94c, 0x8a8f98, 0x2e9e5b, 0xff8a3d];
const DEAD = new THREE.Color(0.35, 0.12, 0.1);
const BURNT = new THREE.Color(0.1, 0.09, 0.08);
const UP = new THREE.Vector3(0, 1, 0);

export class Agents {
  constructor(world, parent) {
    this.world = world;
    this.people = [];
    this.cars = [];
    this.pMesh = new THREE.InstancedMesh(personGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 600);
    this.cMesh = new THREE.InstancedMesh(carGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 120);
    for (const m of [this.pMesh, this.cMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color());
      m.castShadow = true; m.frustumCulled = false;
      parent.add(m);
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
    this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._ax = new THREE.Vector3(); this._c = new THREE.Color();
    this.spawn();
  }

  spawn() {
    const w = this.world, rnd = Math.random;
    this.people.length = 0; this.cars.length = 0;
    this.stats = { dead: 0, cars: 0 };
    const { xs, zs } = TOWN;
    // piesi na ulicach (poruszają się po siatce ulic)
    for (let k = 0; k < 280; k++) {
      const alongX = rnd() < 0.5;
      const line = alongX ? zs[(rnd() * zs.length) | 0] : xs[(rnd() * xs.length) | 0];
      const t = lerp(alongX ? xs[0] : zs[0], alongX ? xs[xs.length - 1] : zs[zs.length - 1], rnd());
      const side = (rnd() < 0.5 ? -1 : 1) * (8 + rnd() * 1.5);
      const p = { mode: 'street', x: alongX ? t : line, z: alongX ? line : t, dirX: alongX ? (rnd() < 0.5 ? -1 : 1) : 0, dirZ: alongX ? 0 : (rnd() < 0.5 ? -1 : 1), side, speed: 3 + rnd() * 2.5 };
      this.addPerson(p);
    }
    // plażowicze
    for (let k = 0; k < 110; k++) {
      const z = -500 + rnd() * 1150, x = coastX(z) - 40 + rnd() * 45;
      if (w.heightAt(x, z) < 0.5) continue;
      this.addPerson({ mode: rnd() < 0.35 ? 'lie' : 'beach', x, z, speed: 1.5 + rnd() * 2, tx: x, tz: z });
    }
    // turyści w parku, na wulkanie, przy zaporze, na pustyni
    for (const [cx, cz, n, r] of [[90, 310, 25, 40], [40, -430, 6, 25], [-330, -470, 6, 20], [-655, 470, 6, 25]]) {
      for (let k = 0; k < n; k++) this.addPerson({ mode: 'wander', hx: cx, hz: cz, hr: r, x: cx + (rnd() - 0.5) * r, z: cz + (rnd() - 0.5) * r, tx: cx, tz: cz, speed: 1.5 + rnd() * 2 });
    }
    // samochody na drogach
    const roads = w.roads;
    for (let k = 0; k < 80; k++) {
      const road = roads[k < 40 ? (rnd() * roads.length) | 0 : ((rnd() * 10) | 0) % roads.length];
      this.cars.push({ road, s: rnd() * road.length, dir: rnd() < 0.5 ? 1 : -1, speed: 9 + rnd() * 8, color: new THREE.Color(CARS[(rnd() * CARS.length) | 0]), len: rnd() < 0.12 ? 1.6 : 1, state: 'drive', x: 0, z: 0, y: 0, yaw: 0, t: 0 });
    }
  }

  addPerson(p) {
    const ox = p.mode === 'street' && p.dirZ !== 0 ? p.side : 0, oz = p.mode === 'street' && p.dirX !== 0 ? p.side : 0;
    if (this.world.heightAt(p.x + ox, p.z + oz) < 1.5) return;
    this.people.push({ yaw: 0, phase: Math.random() * 10, state: 'alive', t: 0, color: new THREE.Color(SHIRTS[(Math.random() * SHIRTS.length) | 0]), panic: 0, ...p });
  }

  // ---------- obrażenia ----------
  killPerson(p, how = 'dead') {
    if (p.state !== 'alive' && p.state !== 'swept') return false;
    p.state = how; p.t = 0; p.fall = Math.random() * Math.PI * 2;
    this.stats.dead++;
    return true;
  }
  wreckCar(c, how = 'wreck') {
    if (c.state !== 'drive' && c.state !== 'swept') return false;
    c.state = how; c.t = 0; c.flip = how === 'flip' ? (Math.random() < 0.5 ? 1 : -1) : 0;
    this.stats.cars++;
    return true;
  }

  // zabija/niszczy w promieniu; how: 'dead' | 'burnt' | 'buried' | 'flip'
  hitRadius(x, z, r, how = 'dead', chance = 1) {
    let n = 0;
    for (const p of this.people) {
      if (p.state === 'alive' && Math.hypot(p.x - x, p.z - z) < r && Math.random() < chance) {
        if (this.killPerson(p, how === 'flip' ? 'dead' : how)) n++;
      }
    }
    for (const c of this.cars) {
      if ((c.state === 'drive' || c.state === 'swept') && Math.hypot(c.x - x, c.z - z) < r && Math.random() < chance) this.wreckCar(c, how === 'buried' ? 'buried' : how === 'burnt' ? 'burnt' : 'flip');
    }
    return n;
  }

  hitRing(x, z, r0, r1, how = 'dead') {
    let n = 0;
    for (const p of this.people) {
      if (p.state !== 'alive' && p.state !== 'swept') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d >= r0 && d < r1 && this.killPerson(p, how)) n++;
    }
    for (const c of this.cars) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d >= r0 && d < r1) this.wreckCar(c, how === 'burnt' ? 'burnt' : 'flip');
    }
    return n;
  }

  // ---------- ruch ----------
  // dangers: [{x,z,r}] — ludzie uciekają; fluid — woda (porywa ludzi i auta)
  update(dt, dangers, water, lava) {
    const w = this.world;
    this.water = water;
    const { xs, zs } = TOWN;
    for (const p of this.people) {
      p.t += dt;
      if (p.state === 'swept') {
        const v = water.velAt(p.x, p.z);
        p.x += (v.u * 0.9 + (Math.random() - 0.5) * 2) * dt; p.z += (v.v * 0.9 + (Math.random() - 0.5) * 2) * dt;
        p.yaw += dt * 2;
        if (p.t > 8) { p.state = 'dead'; p.t = 0; p.floating = true; this.stats.dead++; }
        continue;
      }
      if (p.state !== 'alive') continue;
      // woda i lawa
      if (water) {
        const v = water.velAt(p.x, p.z);
        if (v.d > 1.3 || (v.d > 0.6 && Math.hypot(v.u, v.v) > 2.5)) { p.state = 'swept'; p.t = 0; continue; }
      }
      if (lava && lava.depthAt(p.x, p.z) > 0.3) { this.killPerson(p, 'burnt'); continue; }
      // ucieczka
      let fx = 0, fz = 0, fear = 0;
      for (const d of dangers) {
        const dx = p.x - d.x, dz = p.z - d.z, dist = Math.hypot(dx, dz) || 1;
        if (dist < d.r) { const k = 1 - dist / d.r; fx += (dx / dist) * k; fz += (dz / dist) * k; fear = Math.max(fear, k); }
      }
      if (water) {
        // woda w pobliżu: uciekaj pod górę
        let wet = false;
        for (const [ox, oz] of [[25, 0], [-25, 0], [0, 25], [0, -25], [0, 0]]) if (water.depthAt(p.x + ox, p.z + oz) > 0.2 && w.heightAt(p.x + ox, p.z + oz) > 1) wet = true;
        if (wet || p.uphill > 0) {
          const s = w.slopeAt(p.x, p.z);
          const l = Math.hypot(s.gx, s.gz) || 1;
          fx += (s.gx / l) * 1.5 + (p.x < 400 ? -0.3 : -1); fz += (s.gz / l) * 1.5;
          fear = Math.max(fear, 0.9);
          p.uphill = wet ? 6 : p.uphill - dt;
        }
      }
      if (fear > 0.05) p.panic = 3;
      if (p.panic > 0) {
        p.panic -= dt;
        const l = Math.hypot(fx, fz);
        if (l > 0.01) { p.fleeX = fx / l; p.fleeZ = fz / l; }
        if (p.fleeX !== undefined) {
          const sp = 7 + (p.speed - 3);
          p.x += p.fleeX * sp * dt; p.z += p.fleeZ * sp * dt;
          p.yaw = Math.atan2(p.fleeX, p.fleeZ);
          p.phase += dt * sp * 0.8;
          if (p.mode === 'street') { p.x += p.dirZ !== 0 ? p.side : 0; p.z += p.dirX !== 0 ? p.side : 0; }
          if (p.mode === 'street' || p.mode === 'lie') { p.mode = 'wander'; p.hx = p.x; p.hz = p.z; p.hr = 40; p.tx = p.x; p.tz = p.z; }
        }
      } else if (p.mode === 'street') {
        const ox = p.x, oz = p.z;
        p.x += p.dirX * p.speed * dt; p.z += p.dirZ * p.speed * dt;
        // skrzyżowania: losowy skręt
        const crossed = (a, b, v) => (a < v && b >= v) || (a > v && b <= v);
        const nodeX = p.dirX !== 0 ? xs.find((x) => crossed(ox, p.x, x)) : undefined;
        const nodeZ = p.dirZ !== 0 ? zs.find((z) => crossed(oz, p.z, z)) : undefined;
        const node = nodeX !== undefined || nodeZ !== undefined;
        if (node) {
          if (nodeX !== undefined) p.x = nodeX; if (nodeZ !== undefined) p.z = nodeZ;
          const opts = [];
          if (zs.includes(p.z)) { if (p.x > xs[0]) opts.push([-1, 0]); if (p.x < xs[xs.length - 1]) opts.push([1, 0]); }
          if (xs.includes(p.x)) { if (p.z > zs[0]) opts.push([0, -1]); if (p.z < zs[zs.length - 1]) opts.push([0, 1]); }
          const back = opts.filter(([a, b]) => !(a === -p.dirX && b === -p.dirZ));
          const cand = back.length && Math.random() < 0.9 ? back : opts;
          const pick = cand[(Math.random() * cand.length) | 0] || [-p.dirX, -p.dirZ];
          p.dirX = pick[0]; p.dirZ = pick[1];
        }
        p.yaw = Math.atan2(p.dirX, p.dirZ);
        p.phase += dt * p.speed * 0.8;
      } else if (p.mode === 'beach' || p.mode === 'wander') {
        const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
        if (d < 2) {
          if (p.mode === 'beach') { p.tz = p.z + (Math.random() - 0.5) * 60; p.tx = coastX(p.tz) - 30 + Math.random() * 42; }
          else { p.tx = p.hx + (Math.random() - 0.5) * p.hr * 2; p.tz = p.hz + (Math.random() - 0.5) * p.hr * 2; }
          p.wait = Math.random() * 4;
        } else if ((p.wait = (p.wait || 0) - dt) <= 0) {
          p.x += (dx / d) * p.speed * dt; p.z += (dz / d) * p.speed * dt;
          p.yaw = Math.atan2(dx, dz);
          p.phase += dt * p.speed * 0.8;
        }
      }
      p.x = Math.max(-W / 2 + 3, Math.min(W / 2 - 3, p.x)); p.z = Math.max(-W / 2 + 3, Math.min(W / 2 - 3, p.z));
    }

    const panicAll = dangers.length > 0;
    for (const c of this.cars) {
      c.t += dt;
      if (c.state === 'swept') {
        const v = water.velAt(c.x, c.z);
        c.x += v.u * 0.7 * dt; c.z += v.v * 0.7 * dt; c.yaw += dt * 0.8;
        c.y = (water.levelAt(c.x, c.z) ?? w.heightAt(c.x, c.z)) - 1.5;
        if (c.t > 10 || v.d < 0.3) { c.state = 'wreck'; c.t = 0; this.stats.cars++; }
        continue;
      }
      if (c.state !== 'drive') continue;
      if (water) {
        const v = water.velAt(c.x, c.z);
        if (v.d > 1.6 && c.y < (water.levelAt(c.x, c.z) ?? -1e9) - 0.5) { c.state = 'swept'; c.t = 0; continue; }
      }
      if (lava && lava.depthAt(c.x, c.z) > 0.4) { this.wreckCar(c, 'burnt'); continue; }
      const sp = c.speed * (panicAll ? 1.7 : 1);
      c.s += c.dir * sp * dt;
      if (c.s > c.road.length) { c.s = c.road.length; c.dir = -1; }
      if (c.s < 0) { c.s = 0; c.dir = 1; }
      const rp = w.roadPoint(c.road, c.s);
      const lane = 3.2 * c.dir;
      c.x = rp.x - rp.dz * lane; c.z = rp.z + rp.dx * lane;
      c.y = rp.y;
      c.yaw = Math.atan2(rp.dx * c.dir, rp.dz * c.dir);
    }
    this.render();
  }

  render() {
    const w = this.world;
    let n = 0;
    for (const p of this.people) {
      if (p.state === 'buried') continue;
      const rx = p.mode === 'street' && p.state === 'alive' ? p.x + (p.dirZ !== 0 ? p.side : 0) : p.x;
      const rz = p.mode === 'street' && p.state === 'alive' ? p.z + (p.dirX !== 0 ? p.side : 0) : p.z;
      let y = w.heightAt(rx, rz);
      this._q.setFromAxisAngle(UP, p.yaw);
      if (p.state === 'alive') {
        if (p.mode === 'lie') { this._ax.set(1, 0, 0); this._q2.setFromAxisAngle(this._ax, -Math.PI / 2); this._q.multiply(this._q2); y += 1; }
        else y += Math.abs(Math.sin(p.phase)) * 0.5;
        this._c.copy(p.color);
      } else {
        if (p.state === 'swept' || p.floating) {
          const lv = this.water?.levelAt(p.x, p.z);
          if (lv !== null && lv !== undefined) y = Math.max(y, lv - 1);
        }
        this._ax.set(Math.cos(p.fall || 0), 0, Math.sin(p.fall || 0));
        this._q2.setFromAxisAngle(this._ax, p.state === 'swept' ? Math.sin(p.t * 3) * 1.2 : Math.PI / 2);
        this._q.premultiply(this._q2);
        y += 1;
        this._c.copy(p.color).lerp(p.state === 'burnt' ? BURNT : DEAD, p.state === 'swept' ? 0.2 : 0.65);
      }
      this._p.set(rx, y, rz);
      this._m.compose(this._p, this._q, this._s);
      this.pMesh.setMatrixAt(n, this._m);
      this.pMesh.setColorAt(n, this._c);
      if (++n >= 600) break;
    }
    this.pMesh.count = n;
    this.pMesh.instanceMatrix.needsUpdate = true; this.pMesh.instanceColor.needsUpdate = true;
    let m = 0;
    for (const c of this.cars) {
      if (c.state === 'buried') continue;
      this._q.setFromAxisAngle(UP, c.yaw);
      let y = c.state === 'swept' ? c.y : c.state === 'drive' ? c.y : Math.max(w.heightAt(c.x, c.z), c.y - 3);
      if (c.flip) { this._ax.set(Math.cos(c.yaw), 0, -Math.sin(c.yaw)); this._q2.setFromAxisAngle(this._ax, Math.PI * c.flip * 0.9); this._q.premultiply(this._q2); y += 4; }
      if (c.state === 'swept') { this._ax.set(1, 0, 0); this._q2.setFromAxisAngle(this._ax, Math.sin(c.t * 2) * 0.4); this._q.multiply(this._q2); }
      this._c.copy(c.color);
      if (c.state === 'burnt') this._c.copy(BURNT); else if (c.state !== 'drive' && c.state !== 'swept') this._c.multiplyScalar(0.45);
      this._p.set(c.x, y, c.z);
      this._s.set(1, 1, c.len);
      this._m.compose(this._p, this._q, this._s);
      this._s.set(1, 1, 1);
      this.cMesh.setMatrixAt(m, this._m);
      this.cMesh.setColorAt(m, this._c);
      m++;
    }
    this.cMesh.count = m;
    this.cMesh.instanceMatrix.needsUpdate = true; this.cMesh.instanceColor.needsUpdate = true;
  }

  get alive() { let n = 0; for (const p of this.people) if (p.state === 'alive') n++; return n; }
}
