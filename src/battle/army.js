import * as THREE from 'three';
import { soldierGeometry, tankGeometry } from '../enemies.js';
import { makeGunModel } from '../artillery.js';
import { MAP_W } from '../config.js';

const G = 9.81;
export const SIDES = [
  { name: 'Niebiescy', color: new THREE.Color(0.26, 0.42, 0.9), css: '#6f9cff', dir: -1, baseZ: 1650 },
  { name: 'Czerwoni', color: new THREE.Color(0.85, 0.24, 0.17), css: '#ff7a64', dir: 1, baseZ: -1650 },
];
const STATS = {
  inf: { hp: 1, speed: 7, range: 260, sight: 380, reload: [1.6, 2.6] },
  tank: { hp: 3, speed: 9, range: 650, sight: 850, reload: [4, 6] },
  gun: { hp: 2, speed: 0, range: 4200, sight: 4200, reload: [6, 9] },
};
const rnd = (a, b) => a + Math.random() * (b - a);

export class Battle {
  constructor(terrain, parent, effects) {
    this.terrain = terrain; this.parent = parent; this.fx = effects;
    this.inf = new THREE.InstancedMesh(soldierGeometry(), new THREE.MeshLambertMaterial({ flatShading: true }), 1000);
    this.tank = new THREE.InstancedMesh(tankGeometry(), new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true }), 160);
    for (const m of [this.inf, this.tank]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, new THREE.Color());
      m.castShadow = true; m.frustumCulled = false; m.count = 0; parent.add(m);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(600 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, toneMapped: false }));
    this.tracerLines.frustumCulled = false;
    parent.add(this.tracerLines);
    this.shellMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(3, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false }), 200);
    this.shellMesh.frustumCulled = false; this.shellMesh.count = 0;
    parent.add(this.shellMesh);
    this.units = []; this.shells = []; this.tracers = [];
    this.kills = [0, 0]; this.time = 0; this.winner = null;
    this.onSound = null;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1); this._ax = new THREE.Vector3(); this._c = new THREE.Color(); this._up = new THREE.Vector3(0, 1, 0);
  }

  clear() {
    for (const u of this.units) if (u.model) this.parent.remove(u.model.root);
    this.units = []; this.shells = []; this.tracers = []; this.kills = [0, 0]; this.time = 0; this.winner = null;
  }

  setup(cfg) {
    this.clear();
    cfg.forEach((c, side) => { this.add(side, 'inf', c.inf); this.add(side, 'tank', c.tank); this.add(side, 'gun', c.gun); });
  }

  // posiłki: oddziały piechoty (po 8), czołgi, działa
  add(side, type, n) {
    const S = SIDES[side];
    for (let k = 0; k < n; k++) {
      if (type === 'inf') {
        const cx = rnd(-MAP_W / 2 + 70, MAP_W / 2 - 70), cz = S.baseZ + rnd(-120, 120) - S.dir * 60;
        for (let i = 0; i < 8; i++) this.spawn(side, 'inf', cx + ((i % 4) - 1.5) * 15 + rnd(-4, 4), cz - S.dir * Math.floor(i / 4) * 15);
      } else if (type === 'tank') this.spawn(side, 'tank', rnd(-MAP_W / 2 + 80, MAP_W / 2 - 80), S.baseZ + rnd(-80, 80));
      else {
        const guns = this.units.filter((u) => u.side === side && u.type === 'gun').length;
        const x = ((guns % 6) - 2.5) * 140 + rnd(-15, 15), z = S.baseZ - S.dir * (230 + Math.floor(guns / 6) * 60);
        this.spawn(side, 'gun', x, z);
      }
    }
  }

  spawn(side, type, x, z) {
    const st = STATS[type];
    const u = { side, type, x: Math.max(-MAP_W / 2 + 10, Math.min(MAP_W / 2 - 10, x)), z, yaw: side === 0 ? Math.PI : 0, hp: st.hp, state: 'move', t: 0, cd: rnd(1, st.reload[1]), look: Math.random() * 0.4, target: null, lane: x, wob: Math.random() * 100, phase: Math.random() * 10, fall: new THREE.Vector3(1, 0, 0) };
    if (type === 'gun') {
      u.model = makeGunModel();
      const flag = new THREE.Mesh(new THREE.BoxGeometry(5, 3.5, 0.4), new THREE.MeshBasicMaterial({ color: SIDES[side].color }));
      flag.position.set(-8, 14, 8);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 14, 4), new THREE.MeshLambertMaterial({ color: 0x333333 }));
      pole.position.set(-10.5, 7, 8);
      u.model.root.add(flag, pole);
      u.model.root.position.set(u.x, this.terrain.surfaceAt(u.x, u.z) - 0.3, u.z);
      u.model.yaw.rotation.y = side === 0 ? 0 : Math.PI;
      u.model.pitch.rotation.x = 0.6;
      this.parent.add(u.model.root);
    }
    this.units.push(u);
  }

  alive(side) { let n = 0; for (const u of this.units) if (u.side === side && u.state !== 'dead') n++; return n; }
  count(side, type) { let n = 0; for (const u of this.units) if (u.side === side && u.type === type && u.state !== 'dead') n++; return n; }

  kill(u, fx, fz) {
    if (u.state === 'dead') return;
    u.state = 'dead'; u.t = 0;
    const dx = u.x - fx, dz = u.z - fz, d = Math.hypot(dx, dz) || 1;
    u.fall.set(dx / d, 0, dz / d);
    this.kills[1 - u.side]++;
    if (u.type !== 'inf') this.fx.addSmoker(new THREE.Vector3(u.x, this.terrain.heightAt(u.x, u.z) + 6, u.z), 30);
    if (u.type === 'gun') { u.model.root.rotation.z = 0.3; u.model.pitch.rotation.x = -0.1; }
  }

  damage(u, dmg, fx, fz) { u.hp -= dmg; if (u.hp <= 0) this.kill(u, fx, fz); }

  // wybuch: zabija piechotę, uszkadza czołgi i działa (także własne)
  blast(p, R, tankR, dmg) {
    for (const u of this.units) {
      if (u.state === 'dead') continue;
      const d = Math.hypot(u.x - p.x, u.z - p.z);
      if (u.type === 'inf') { if (d < R && Math.random() < (d < R * 0.5 ? 0.95 : 0.6) * (this.terrain.isForest(u.x, u.z) ? 0.6 : 1)) this.kill(u, p.x, p.z); }
      else if (d < tankR) this.damage(u, dmg * (d < tankR * 0.5 ? 1 : 0.5), p.x, p.z);
    }
  }

  findTarget(u) {
    const st = STATS[u.type];
    let best = null, bd = st.sight;
    if (u.type === 'gun') {
      // artyleria: cel w skupisku wrogów
      let bestScore = 0;
      for (let k = 0; k < 14; k++) {
        const c = this.units[(Math.random() * this.units.length) | 0];
        if (!c || c.side === u.side || c.state === 'dead') continue;
        let score = 0;
        for (const o of this.units) if (o.state !== 'dead' && Math.abs(o.x - c.x) < 60 && Math.abs(o.z - c.z) < 60) score += o.side === u.side ? -3 : (o.type === 'inf' ? 1 : 2.5);
        if (score > bestScore) { bestScore = score; best = c; }
      }
      return best;
    }
    for (const o of this.units) {
      if (o.side === u.side || o.state === 'dead') continue;
      const d = Math.hypot(o.x - u.x, o.z - u.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  update(dt) {
    this.time += dt;
    const T = this.terrain;
    for (const u of this.units) {
      u.t += dt;
      if (u.state === 'dead') continue;
      const st = STATS[u.type];
      u.look -= dt; u.cd -= dt;
      if (u.look <= 0) { u.look = u.type === 'gun' ? 2.5 : 0.4 + Math.random() * 0.3; u.target = this.findTarget(u); }
      if (u.target && u.target.state === 'dead') u.target = null;
      const tg = u.target;
      const d = tg ? Math.hypot(tg.x - u.x, tg.z - u.z) : Infinity;
      // ruch
      let moving = u.type !== 'gun';
      if (tg && d < st.range * (u.type === 'tank' ? 0.55 : 0.9)) moving = false;
      if (moving) {
        let gx, gz;
        if (tg && d < st.sight) { gx = tg.x; gz = tg.z; }
        else { gx = u.lane + Math.sin(u.wob + u.z / 150) * 30; gz = SIDES[1 - u.side].baseZ - SIDES[u.side].dir * 200; }
        let dx = gx - u.x, dz = gz - u.z;
        const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
        // omijanie wody
        if (T.heightAt(u.x + dx * 20, u.z + dz * 20) < 1) { const s = (u.wob % 2 < 1) ? 1 : -1; const c = Math.cos(0.9 * s), sn = Math.sin(0.9 * s); [dx, dz] = [dx * c + dz * sn, -dx * sn + dz * c]; }
        let f = 1;
        const h = T.heightAt(u.x, u.z), ahead = T.heightAt(u.x + dx * 8, u.z + dz * 8);
        if ((ahead - h) / 8 > 0) f *= Math.max(0.4, 1 - ((ahead - h) / 8) * 2);
        if (T.isForest(u.x, u.z)) f *= u.type === 'tank' ? 0.6 : 0.8;
        if (h < 0) f *= 0.35;
        u.x += dx * st.speed * f * dt; u.z += dz * st.speed * f * dt;
        u.x = Math.max(-MAP_W / 2 + 5, Math.min(MAP_W / 2 - 5, u.x));
        const want = Math.atan2(dx, dz);
        u.yaw += Math.atan2(Math.sin(want - u.yaw), Math.cos(want - u.yaw)) * Math.min(1, dt * (u.type === 'tank' ? 1.5 : 5));
        u.phase += dt * st.speed * 0.5;
      } else if (tg) {
        const want = Math.atan2(tg.x - u.x, tg.z - u.z);
        u.yaw += Math.atan2(Math.sin(want - u.yaw), Math.cos(want - u.yaw)) * Math.min(1, dt * 3);
      }
      // strzał
      if (tg && d < st.range && u.cd <= 0) {
        u.cd = rnd(...st.reload);
        this.shoot(u, tg, d);
      }
      if (u.type === 'gun' && u.model) {
        const want = tg ? Math.atan2(tg.x - u.x, tg.z - u.z) + Math.PI : u.model.yaw.rotation.y;
        const cur = u.model.yaw.rotation.y;
        u.model.yaw.rotation.y = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * Math.min(1, dt * 2);
        u.recoil = Math.max(0, (u.recoil || 0) - dt * 2);
        u.model.recoil.position.z = u.recoil * 5;
      }
    }
    this.updateShells(dt);
    // zwycięstwo
    const a = this.alive(0), b = this.alive(1);
    if (!this.winner && this.units.length && (a === 0 || b === 0)) this.winner = a === 0 && b === 0 ? 'remis' : a ? SIDES[0].name : SIDES[1].name;
    if (this.winner && a && b) this.winner = null;
    this.units = this.units.filter((u) => !(u.state === 'dead' && u.t > (u.type === 'inf' ? 25 : 60) && !u.model));
    this.render(dt);
  }

  shoot(u, tg, d) {
    const T = this.terrain;
    const from = new THREE.Vector3(u.x, T.heightAt(u.x, u.z) + (u.type === 'tank' ? 8.5 : 7), u.z);
    if (u.type === 'inf') {
      const hitP = 0.35 * (1 - d / STATS.inf.range) * (T.isForest(tg.x, tg.z) ? 0.55 : 1);
      const to = new THREE.Vector3(tg.x + rnd(-6, 6), T.heightAt(tg.x, tg.z) + 6, tg.z + rnd(-6, 6));
      this.tracers.push({ a: from, b: to, t: 0.07, side: u.side });
      this.fx.fire.spawn({ p: from.clone(), v: new THREE.Vector3(0, 0, 0), life: 0.06, s0: 2.2, s1: 1, c0: 0xffe0a0, c1: 0x000000 });
      if (Math.random() < hitP) { if (tg.type === 'inf') this.kill(tg, u.x, u.z); else this.damage(tg, 0.08, u.x, u.z); }
      if (this.onSound && Math.random() < 0.06) this.onSound('pop', from, 0.15);
    } else if (u.type === 'tank') {
      const to = new THREE.Vector3(tg.x + rnd(-8, 8), T.heightAt(tg.x, tg.z) + 3, tg.z + rnd(-8, 8));
      this.shells.push({ kind: 'tank', a: from, b: to, t: 0, T: d / 320, side: u.side });
      this.fx.muzzle(from, to.clone().sub(from).normalize());
      if (this.onSound) this.onSound('gun', from, 0.35);
    } else {
      const lead = new THREE.Vector3(tg.x + rnd(-25, 25), 0, tg.z + rnd(-25, 25));
      lead.y = T.surfaceAt(lead.x, lead.z);
      const apex = Math.max(120, d * 0.35);
      this.shells.push({ kind: 'art', a: from.clone().add(new THREE.Vector3(0, 6, 0)), b: lead, t: 0, T: 2.5 + d / 450, apex, side: u.side });
      u.recoil = 1;
      this.fx.muzzle(from.clone().add(new THREE.Vector3(0, 8, 0)), lead.clone().sub(from).setY(d * 0.6).normalize());
      if (this.onSound) this.onSound('gun', from, 0.6);
    }
  }

  updateShells(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.T);
      s.pos = s.a.clone().lerp(s.b, k);
      if (s.kind === 'art') { s.pos.y += 4 * s.apex * k * (1 - k); if (Math.random() < 0.5) this.fx.trail(s.pos); }
      if (k >= 1) {
        this.shells.splice(i, 1);
        const p = s.b;
        if (s.kind === 'tank') {
          this.fx.miniExplosion(p, false);
          this.blast(p, 13, 9, 1.5);
          this.terrain.scorch(p.x, p.z, 10, 0, 6);
        } else {
          const water = this.terrain.heightAt(p.x, p.z) < 0;
          this.fx.explosion(p, water);
          if (!water) this.terrain.crater(p.x, p.z, 12, 4);
          for (const { h } of this.terrain.scorch(p.x, p.z, 32)) this.fx.addSmoker(new THREE.Vector3(h.x, h.y + 6, h.z), 25);
          this.blast(p, 36, 18, 2);
          if (this.onSound) this.onSound('boom', p, 0.8);
        }
      }
    }
  }

  render(dt) {
    const T = this.terrain;
    let ni = 0, nt = 0;
    for (const u of this.units) {
      if (u.type === 'gun') continue;
      let y = T.heightAt(u.x, u.z);
      this._q.setFromAxisAngle(this._up, u.yaw);
      this._c.copy(SIDES[u.side].color);
      if (u.state === 'dead') {
        if (u.type === 'inf') {
          this._ax.set(u.fall.z, 0, -u.fall.x);
          this._q2.setFromAxisAngle(this._ax, Math.min(1, u.t / 0.35) * Math.PI / 2);
          this._q.premultiply(this._q2);
          y += 1;
          if (u.t > 20) y -= (u.t - 20) * 2;
        }
        this._c.multiplyScalar(0.35);
      } else if (u.type === 'inf') y += Math.abs(Math.sin(u.phase)) * 0.8;
      this._p.set(u.x, y, u.z);
      this._m.compose(this._p, this._q, this._s);
      if (u.type === 'inf') { if (ni < 1000) { this.inf.setMatrixAt(ni, this._m); this.inf.setColorAt(ni, this._c); ni++; } }
      else if (nt < 160) { this.tank.setMatrixAt(nt, this._m); this.tank.setColorAt(nt, this._c); nt++; }
    }
    this.inf.count = ni; this.tank.count = nt;
    for (const m of [this.inf, this.tank]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    // smugi pocisków karabinowych
    const pos = this.tracerLines.geometry.attributes.position.array, col = this.tracerLines.geometry.attributes.color.array;
    let v = 0;
    this.tracers = this.tracers.filter((t) => (t.t -= dt) > 0);
    for (const t of this.tracers) {
      if (v >= 1200) break;
      const c = t.side === 0 ? [0.6, 0.8, 1] : [1, 0.75, 0.5];
      const mid = t.a.clone().lerp(t.b, 0.55);
      pos.set([mid.x, mid.y, mid.z, t.b.x, t.b.y, t.b.z], v * 3); col.set([...c, ...c], v * 3); v += 2;
    }
    this.tracerLines.geometry.setDrawRange(0, v);
    this.tracerLines.geometry.attributes.position.needsUpdate = true; this.tracerLines.geometry.attributes.color.needsUpdate = true;
    let n = 0;
    for (const s of this.shells) { if (!s.pos) continue; this._m.makeTranslation(s.pos.x, s.pos.y, s.pos.z); this.shellMesh.setMatrixAt(n++, this._m); }
    this.shellMesh.count = n; this.shellMesh.instanceMatrix.needsUpdate = true;
  }
}
