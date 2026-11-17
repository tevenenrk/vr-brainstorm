import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const G = 9.81;
const DEG = Math.PI / 180;
const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
const tint = (g, r, gg = r, b = r) => {
  g = nonIdx(g);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gg; a[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// modele (przód w +Z, wymiary przesadzone ~2x, żeby były widoczne na makiecie)
function bomberGeometry() {
  const P = [];
  P.push(tint(new THREE.CylinderGeometry(2.2, 1.4, 38, 10).rotateX(Math.PI / 2), 1));
  P.push(tint(new THREE.SphereGeometry(2.25, 10, 8).scale(1, 1, 1.4).translate(0, 0, 19), 0.55, 0.65, 0.75));
  P.push(tint(new THREE.BoxGeometry(60, 0.9, 7.5).translate(0, 0, 3), 1));
  P.push(tint(new THREE.BoxGeometry(18, 0.7, 4).translate(0, 0.6, -17), 1));
  P.push(tint(new THREE.BoxGeometry(0.7, 7, 5).translate(0, 3.6, -17), 1));
  for (const x of [-18, -9, 9, 18]) {
    P.push(tint(new THREE.CylinderGeometry(1.4, 1.1, 8, 8).rotateX(Math.PI / 2).translate(x, -0.4, 6.5), 0.75));
    P.push(tint(new THREE.CylinderGeometry(3.4, 3.4, 0.2, 14).rotateX(Math.PI / 2).translate(x, -0.4, 10.7), 0.18));
  }
  return mergeGeometries(P);
}
function fighterGeometry() {
  const P = [];
  P.push(tint(new THREE.CylinderGeometry(1.4, 0.8, 19, 10).rotateX(Math.PI / 2), 1));
  P.push(tint(new THREE.SphereGeometry(0.9, 8, 6).scale(1, 0.8, 1.6).translate(0, 1.2, 2), 0.5, 0.65, 0.8));
  P.push(tint(new THREE.BoxGeometry(24, 0.6, 4).translate(0, -0.4, 2), 1));
  P.push(tint(new THREE.BoxGeometry(8, 0.5, 2.4).translate(0, 0.3, -8), 1));
  P.push(tint(new THREE.BoxGeometry(0.5, 3.6, 2.6).translate(0, 1.8, -8), 1));
  P.push(tint(new THREE.CylinderGeometry(2.6, 2.6, 0.2, 14).rotateX(Math.PI / 2).translate(0, 0, 9.8), 0.18));
  return mergeGeometries(P);
}

export const TYPES = {
  bomber: { name: 'Bombowiec', speed: 105, turn: 7 * DEG, climb: 9, hp: 3, bombs: 6, color: new THREE.Color(0.48, 0.52, 0.4), cap: 60 },
  fighter: { name: 'Myśliwiec', speed: 155, turn: 22 * DEG, climb: 25, hp: 1, bombs: 0, color: new THREE.Color(0.55, 0.57, 0.6), cap: 40 },
};

const UP = new THREE.Vector3(0, 1, 0);

export class Plane {
  constructor(type, group, pos, yaw) {
    this.type = type; this.def = TYPES[type]; this.group = group;
    this.pos = pos.clone(); this.yaw = yaw; this.pitch = 0; this.roll = 0;
    this.speed = this.def.speed; this.turnRate = 0; this.climbRate = 0;
    this.hp = this.def.hp; this.state = 'fly'; this.t = 0; this.bombs = this.def.bombs;
    this.smoke = 0; this.id = Plane.next++;
  }
  forward(out = new THREE.Vector3()) { const c = Math.cos(this.pitch); return out.set(Math.sin(this.yaw) * c, Math.sin(this.pitch), Math.cos(this.yaw) * c); }
  quaternion(out = new THREE.Quaternion()) { return out.setFromEuler(new THREE.Euler(-this.pitch, this.yaw, -this.roll, 'YXZ')); }
}
Plane.next = 1;

// grupa samolotów (klucz/formacja) z prowadzącym
export class Group {
  constructor(type, n, start, yaw, target, color) {
    this.type = type; this.planes = []; this.target = target; this.color = color;
    this.targetYaw = yaw; this.targetAlt = start.y; this.nextMan = 4 + Math.random() * 4; this.bombed = false;
    this.player = false;
    const sp = type === 'bomber' ? 75 : 45;
    for (let k = 0; k < n; k++) {
      // klucz w kształcie V
      const side = k === 0 ? 0 : (k % 2 ? -1 : 1) * Math.ceil(k / 2);
      const off = new THREE.Vector3(side * sp, (Math.random() - 0.5) * 20, -Math.abs(side) * sp * 0.8);
      const p = new Plane(type, this, start.clone().add(off.clone().applyAxisAngle(UP, yaw)), yaw);
      p.slot = off;
      this.planes.push(p);
    }
  }
  get leader() { return this.planes.find((p) => p.state === 'fly'); }
}

export class Airforce {
  constructor(terrain, parent, effects) {
    this.terrain = terrain; this.effects = effects; this.parent = parent;
    this.groups = [];
    this.meshes = {};
    for (const [k, g] of [['bomber', bomberGeometry()], ['fighter', fighterGeometry()]]) {
      const m = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), TYPES[k].cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, new THREE.Color());
      m.castShadow = true; m.frustumCulled = false; m.count = 0;
      parent.add(m); this.meshes[k] = m;
    }
    // przerywane linie predykcji toru (wszystkie samoloty w jednej geometrii)
    this.PRED_T = 30; this.PRED_DT = 0.5;
    const maxSeg = 80 * (this.PRED_T / this.PRED_DT);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxSeg * 3), 3).setUsage(THREE.DynamicDrawUsage));
    lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxSeg * 3), 3).setUsage(THREE.DynamicDrawUsage));
    lg.setDrawRange(0, 0);
    this.predLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false }));
    this.predLines.frustumCulled = false;
    parent.add(this.predLines);
    // znaczniki: pozycja w chwili wybuchu i co 10 s
    this.ghosts = new THREE.InstancedMesh(new THREE.OctahedronGeometry(6, 0), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, toneMapped: false }), 80);
    this.ticks = new THREE.InstancedMesh(new THREE.SphereGeometry(2.8, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, toneMapped: false }), 240);
    for (const m of [this.ghosts, this.ticks]) { m.frustumCulled = false; m.count = 0; parent.add(m); }
    // bomby
    this.bombs = [];
    this.bombMesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.9, 3, 2, 6), new THREE.MeshLambertMaterial({ color: 0x2a2a28 }), 200);
    this.bombMesh.frustumCulled = false; this.bombMesh.count = 0;
    parent.add(this.bombMesh);
    this.stats = { down: 0, escaped: 0 };
    this.onBombHit = null; this.onCrash = null;
    this.showPrediction = true;
    this.speedMult = 1;     // mnożnik prędkości samolotów
    this.maneuver = 2;      // 0 brak … 3 agresywne
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._c = new THREE.Color();
    this._ps = new THREE.Vector3(1.4, 1.4, 1.4);
  }

  get planes() { return this.groups.flatMap((g) => g.planes); }
  alive() { return this.planes.filter((p) => p.state === 'fly'); }

  spawnWave(n, homeTarget) {
    const groups = Math.min(1 + Math.floor((n + 1) / 2), 6);
    const palette = [0xff9a4a, 0x4ad0ff, 0xb48aff, 0x7dffb0, 0xffe08a, 0xff6a8a];
    for (let k = 0; k < groups; k++) {
      const fighters = n >= 3 && k % 3 === 2;
      const type = fighters ? 'fighter' : 'bomber';
      const cnt = fighters ? 2 + Math.floor(Math.random() * 3) : 3 + Math.min(4, Math.floor(Math.random() * (2 + n / 2)));
      const start = new THREE.Vector3((Math.random() - 0.5) * 700, 380 + Math.random() * 380, -2150 - k * 400 - Math.random() * 200);
      const target = homeTarget();
      const yaw = Math.atan2(target.x - start.x, target.z - start.z);
      const g = new Group(type, cnt, start, yaw, target, palette[(this.groups.length + k) % palette.length]);
      this.groups.push(g);
    }
  }

  playerGroup() { return this.groups.find((g) => g.player && g.leader); }

  // pociski wybuchają w punkcie b — szansa trafienia zależy od odległości
  burst(b, R = 75) {
    let hits = 0;
    for (const p of this.planes) {
      if (p.state !== 'fly') continue;
      const d = p.pos.distanceTo(b);
      if (d > R * 2.5) continue;
      p.group.lastThreat = 0;
      if (d > R) continue;
      const prob = Math.pow(1 - d / R, 1.4) * 0.95;
      if (Math.random() < prob) {
        p.hp -= d < R * 0.3 ? 2 : 1;
        p.smoke = Math.max(p.smoke, 1);
        hits++;
        if (p.hp <= 0) this.shootDown(p);
      }
    }
    return hits;
  }

  shootDown(p) {
    p.state = 'falling'; p.t = 0; p.spin = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.2);
    this.stats.down++;
  }

  // ---------- sterowanie grupą ----------
  steerAI(g, dt) {
    const L = g.leader;
    if (!L) return;
    g.nextMan -= dt;
    g.lastThreat = (g.lastThreat ?? 99) + dt;
    const base = !g.bombed && g.target ? Math.atan2(g.target.x - L.pos.x, g.target.z - L.pos.z) : 0;
    const lvl = this.maneuver, amp = [0, 0.5, 1, 1.7][lvl], every = [1e9, 1.6, 1, 0.55][lvl];
    if (lvl === 0) { g.targetYaw = base; return; }
    if (g.nextMan <= 0 || (g.lastThreat < 0.3 && g.nextMan > 2 && Math.random() < 0.01 * lvl)) {
      const fighter = g.type === 'fighter';
      g.nextMan = ((fighter ? 3 : 6) + Math.random() * (fighter ? 4 : 8)) * every;
      g.targetYaw = base + (Math.random() - 0.5) * (fighter ? 110 : 60) * DEG * amp;
      if (Math.random() < 0.5) g.targetAlt = Math.max(250, Math.min(950, L.pos.y + (Math.random() - 0.5) * (fighter ? 400 : 260) * amp));
    }
    // poza makietą wracaj nad nią
    if (Math.abs(L.pos.x) > 650) g.targetYaw = Math.atan2(-L.pos.x, 300);
    if (!g.bombed && g.target && Math.abs(wrap(g.targetYaw - base)) > 70 * DEG) g.targetYaw = base;
  }

  steerLeader(g, L, dt) {
    const d = L.def;
    L.speed = d.speed * this.speedMult;
    const tm = [0.6, 0.8, 1, 1.6][this.maneuver];
    const dy = wrap(g.targetYaw - L.yaw);
    L.turnRate += (Math.max(-d.turn * tm, Math.min(d.turn * tm, dy * 0.6)) - L.turnRate) * Math.min(1, dt * 1.5);
    const dalt = g.targetAlt - L.pos.y;
    L.climbRate += (Math.max(-d.climb, Math.min(d.climb, dalt * 0.25)) - L.climbRate) * Math.min(1, dt * 1.2);
    L.yaw += L.turnRate * dt;
    L.pitch = Math.atan2(L.climbRate, L.speed);
    L.roll += ((L.turnRate / d.turn) * (g.type === 'fighter' ? 1.1 : 0.5) - L.roll) * Math.min(1, dt * 2);
    L.pos.addScaledVector(L.forward(this._v), L.speed * dt);
  }

  update(dt, player) {
    for (const g of this.groups) {
      const L = g.leader;
      if (!L) continue;
      if (g.player && player) {
        // gracz: skręt i wznoszenie z drążka
        const d = L.def;
        L.speed = d.speed * this.speedMult;
        L.turnRate += (player.turn * d.turn * 1.4 - L.turnRate) * Math.min(1, dt * 2.5);
        L.climbRate += (player.climb * d.climb * 1.6 - L.climbRate) * Math.min(1, dt * 2);
        L.yaw += L.turnRate * dt;
        L.pitch = Math.atan2(L.climbRate, L.speed);
        L.roll += ((L.turnRate / d.turn) * 0.7 - L.roll) * Math.min(1, dt * 3);
        L.pos.addScaledVector(L.forward(this._v), L.speed * dt);
        L.pos.y = Math.max(this.terrain.heightAt(L.pos.x, L.pos.z) + 60, Math.min(1300, L.pos.y));
        g.targetYaw = L.yaw; g.targetAlt = L.pos.y;
      } else {
        this.steerAI(g, dt);
        this.steerLeader(g, L, dt);
      }
      // skrzydłowi trzymają pozycje w kluczu
      const lv = L.forward(new THREE.Vector3()).multiplyScalar(L.speed);
      for (const p of g.planes) {
        if (p === L || p.state !== 'fly') continue;
        const want = L.pos.clone().add(p.slot.clone().applyAxisAngle(UP, L.yaw));
        const v = lv.clone().add(want.sub(p.pos).multiplyScalar(0.6));
        const sp = v.length(), maxS = p.def.speed * this.speedMult * 1.35;
        if (sp > maxS) v.multiplyScalar(maxS / sp);
        p.pos.addScaledVector(v, dt);
        const yaw = Math.atan2(v.x, v.z);
        p.turnRate = wrap(yaw - p.yaw) / Math.max(dt, 1e-3) * 0.2 + L.turnRate * 0.8;
        p.yaw += wrap(yaw - p.yaw) * Math.min(1, dt * 4);
        p.pitch = Math.atan2(v.y, Math.hypot(v.x, v.z));
        p.climbRate = L.climbRate;
        p.roll += (L.roll - p.roll) * Math.min(1, dt * 3);
        p.speed = Math.max(p.def.speed * this.speedMult * 0.7, Math.hypot(v.x, v.z));
      }
      // zrzut bomb nad celem (bombowce)
      if (!g.bombed && g.type === 'bomber' && g.target) {
        const dist = Math.hypot(g.target.x - L.pos.x, g.target.z - L.pos.z);
        const lead = L.speed * Math.sqrt((2 * Math.max(50, L.pos.y - g.target.y)) / G);
        if (!g.player && dist < lead + 20) this.dropBombs(g);
      }
    }
    for (const p of this.planes) {
      p.t += dt;
      if (p.state === 'fly') {
        if (p.smoke > 0 && Math.random() < 0.3) this.effects.smoke.spawn({ p: p.pos.clone(), v: new THREE.Vector3(0, 2, 0), life: 3, s0: 3, s1: 9, c0: 0x3a3634, c1: 0x8a8682, drag: 0.6 });
        if (p.pos.z > 2300 || Math.abs(p.pos.x) > 1600 || p.pos.z < -3500) { p.state = 'gone'; this.stats.escaped++; }
      } else if (p.state === 'falling') {
        p.yaw += p.spin * dt; p.roll += p.spin * 1.5 * dt;
        p.pitch = Math.max(-1.2, p.pitch - dt * 0.35);
        p.pos.addScaledVector(p.forward(this._v), p.speed * dt);
        p.pos.y -= (10 + p.t * 12) * dt;
        if (Math.random() < 0.8) this.effects.smoke.spawn({ p: p.pos.clone(), v: new THREE.Vector3(0, 3, 0), life: 5, s0: 4, s1: 14, c0: 0x1e1c1b, c1: 0x6a6662, drag: 0.6 });
        if (Math.random() < 0.6) this.effects.fire.spawn({ p: p.pos.clone(), v: new THREE.Vector3(0, 0, 0), life: 0.3, s0: 4, s1: 1, c0: 0xffa040, c1: 0x200000 });
        const ground = this.terrain.surfaceAt(p.pos.x, p.pos.z);
        if (p.pos.y <= ground) {
          p.state = 'dead'; p.t = 0; p.pos.y = ground;
          if (this.onCrash) this.onCrash(p);
        }
      } else if (p.state === 'dead' && p.t > 20) p.state = 'gone';
    }
    for (const g of this.groups) g.planes = g.planes.filter((p) => p.state !== 'gone');
    this.groups = this.groups.filter((g) => g.planes.length);
    this.updateBombs(dt);
  }

  dropBombs(g) {
    g.bombed = true;
    for (const p of g.planes) {
      if (p.state !== 'fly') continue;
      for (let k = 0; k < p.bombs; k++) {
        const v = p.forward(new THREE.Vector3()).multiplyScalar(p.speed);
        this.bombs.push({ pos: p.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, -3, 0)), vel: v, delay: k * 0.25 });
      }
      p.bombs = 0;
    }
  }

  updateBombs(dt) {
    let n = 0;
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      if (b.delay > 0) { b.delay -= dt; continue; }
      b.vel.y -= G * dt; b.vel.multiplyScalar(1 - dt * 0.05);
      b.pos.addScaledVector(b.vel, dt);
      if (b.pos.y <= this.terrain.surfaceAt(b.pos.x, b.pos.z)) {
        b.pos.y = this.terrain.surfaceAt(b.pos.x, b.pos.z);
        this.bombs.splice(i, 1);
        if (this.onBombHit) this.onBombHit(b.pos);
      }
    }
    for (const b of this.bombs) {
      if (b.delay > 0) continue;
      this._q.setFromUnitVectors(UP, this._v.copy(b.vel).normalize().negate());
      this._m.compose(b.pos, this._q, this._s);
      this.bombMesh.setMatrixAt(n++, this._m);
    }
    this.bombMesh.count = n; this.bombMesh.instanceMatrix.needsUpdate = true;
  }

  // przewidywane położenie: stałe tempo skrętu i wznoszenia
  predict(p, t) {
    let yaw = p.yaw, y = p.pos.y, x = p.pos.x, z = p.pos.z, turned = 0;
    const L = p.group.leader || p;
    const tr = p.state === 'fly' ? L.turnRate : 0, dy = p.pos.y - L.pos.y;
    const dt = 0.25;
    for (let s = 0; s < t; s += dt) {
      const h = Math.min(dt, t - s);
      const cr = this.predClimb(p, L, y - dy, h);
      if (Math.abs(turned) < 2.1) { yaw += tr * h; turned += tr * h; }
      y += cr * h;
      const c = Math.cos(Math.atan2(cr, p.speed));
      x += Math.sin(yaw) * p.speed * c * h; z += Math.cos(yaw) * p.speed * c * h;
    }
    return new THREE.Vector3(x, y, z);
  }

  // tempo wznoszenia w przewidywaniu: dąży do docelowej wysokości klucza (bez zejścia pod ziemię)
  predClimb(p, L, yLeader, h) {
    const d = L.def, g = p.group;
    const target = g.player ? yLeader + L.climbRate * 3 : g.targetAlt;
    return Math.max(-d.climb, Math.min(d.climb, (target - yLeader) * 0.25));
  }

  render(burstTime) {
    const counts = { bomber: 0, fighter: 0 };
    for (const p of this.planes) {
      const m = this.meshes[p.type];
      if (counts[p.type] >= TYPES[p.type].cap) continue;
      this._m.compose(p.pos, p.quaternion(this._q), this._ps);
      m.setMatrixAt(counts[p.type], this._m);
      this._c.copy(p.def.color);
      if (p.group.player) this._c.lerp(new THREE.Color(1, 0.85, 0.3), 0.6);
      if (p.state !== 'fly') this._c.multiplyScalar(0.35);
      else if (p.hp < p.def.hp) this._c.lerp(new THREE.Color(0.25, 0.22, 0.2), 0.4);
      if (p.selected) this._c.lerp(new THREE.Color(0.4, 0.9, 1), 0.5);
      m.setColorAt(counts[p.type], this._c);
      counts[p.type]++;
    }
    for (const k of Object.keys(counts)) { const m = this.meshes[k]; m.count = counts[k]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }

    // linie predykcji (przerywane) i znaczniki
    const pos = this.predLines.geometry.attributes.position.array, col = this.predLines.geometry.attributes.color.array;
    let v = 0, gi = 0, ti = 0;
    const c = new THREE.Color();
    if (this.showPrediction) {
      for (const p of this.planes) {
        if (p.state !== 'fly') continue;
        c.set(p.group.color);
        let yaw = p.yaw, x = p.pos.x, y = p.pos.y, z = p.pos.z, turned = 0;
        const L = p.group.leader || p, tr = L.turnRate, h = this.PRED_DT, dy = p.pos.y - L.pos.y;
        for (let k = 0, t = 0; t < this.PRED_T - 1e-6; k++, t += h) {
          const x0 = x, y0 = y, z0 = z;
          const cr = this.predClimb(p, L, y - dy, h);
          if (Math.abs(turned) < 2.1) { yaw += tr * h; turned += tr * h; }
          y = Math.max(y + cr * h, 60);
          const cp = Math.cos(Math.atan2(cr, p.speed));
          x += Math.sin(yaw) * p.speed * cp * h; z += Math.cos(yaw) * p.speed * cp * h;
          if (k % 2 === 0 && v + 2 <= pos.length / 3) {
            const fade = 1 - t / this.PRED_T * 0.7;
            pos.set([x0, y0, z0, x, y, z], v * 3);
            col.set([c.r * fade, c.g * fade, c.b * fade, c.r * fade, c.g * fade, c.b * fade], v * 3);
            v += 2;
          }
          const tt = t + h;
          if (Math.abs(tt % 10) < 1e-6 && ti < 240) { this._m.makeTranslation(x, y, z); this.ticks.setMatrixAt(ti++, this._m); }
        }
        if (burstTime > 0 && burstTime <= this.PRED_T && gi < 80) {
          this._m.makeTranslation(this.predict(p, burstTime));
          this.ghosts.setMatrixAt(gi++, this._m);
        }
      }
    }
    this.predLines.geometry.setDrawRange(0, v);
    this.predLines.geometry.attributes.position.needsUpdate = true; this.predLines.geometry.attributes.color.needsUpdate = true;
    this.ghosts.count = gi; this.ghosts.instanceMatrix.needsUpdate = true;
    this.ticks.count = ti; this.ticks.instanceMatrix.needsUpdate = true;
  }

  clear() { this.groups = []; this.bombs = []; this.stats = { down: 0, escaped: 0 }; }
}
