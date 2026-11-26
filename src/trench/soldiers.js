import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLOOR, EYE, SPAWN_Z } from './world.js';

export const TRACER_V = 320;          // widoczna prędkość smugi (m/s) — wolniej niż kula, żeby było ją widać

// Żołnierze (sojusznicy i wrogowie): rysowani jako instancje części ciała, proste AI.
const rnd = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const CAP = 180;
export const MAG = 30;
// broń żołnierzy: pojemność magazynka, zapas, typ amunicji (łup)
export const KIT = { rifle: { mag: 30, spare: [3, 4], ammo: 'rifle' }, sniper: { mag: 5, spare: [4, 5], ammo: 'sniper' }, launcher: { mag: 1, spare: [6, 6], ammo: 'gl' } };
export const COLORS = [new THREE.Color(0.56, 0.52, 0.34), new THREE.Color(0.44, 0.47, 0.45)];

const tint = (g, r, gg = r, b = r) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gg; a[i * 3 + 2] = b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; };
const box = (w, h, d, x, y, z, c) => tint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), ...c);
const W = [1, 1, 1], BOOT = [0.16, 0.13, 0.1], LEATHER = [0.32, 0.24, 0.16], WOOD = [0.36, 0.25, 0.15], STEEL = [0.18, 0.18, 0.2], SKIN = [0.92, 0.76, 0.62];
function rifleGeo() {
  return [box(0.05, 0.07, 0.75, 0, 0, 0.22, WOOD), box(0.025, 0.025, 0.4, 0, 0.03, 0.75, STEEL), box(0.04, 0.12, 0.06, 0, -0.08, 0.05, STEEL), box(0.045, 0.1, 0.22, 0, -0.03, -0.25, WOOD)];
}
function legGeo() { return mergeGeometries([box(0.16, 0.5, 0.18, 0, -0.25, 0, W), box(0.14, 0.42, 0.16, 0, -0.68, 0, W), box(0.15, 0.1, 0.27, 0, -0.88, 0.05, BOOT)]); }
function torsoGeo() {
  return mergeGeometries([box(0.4, 0.6, 0.24, 0, 0.3, 0, W), box(0.42, 0.07, 0.26, 0, 0.06, 0, LEATHER), box(0.3, 0.34, 0.14, 0, 0.36, -0.18, [0.4, 0.36, 0.26]),
    box(0.12, 0.08, 0.06, -0.12, 0.08, 0.14, LEATHER), box(0.12, 0.08, 0.06, 0.12, 0.08, 0.14, LEATHER), tint(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8).translate(0, 0.64, 0), ...SKIN)]);
}
function headGeo() { return tint(new THREE.SphereGeometry(0.105, 10, 8).scale(1, 1.1, 1.05), ...SKIN); }
function helmetGeo(side) {
  if (side === 0) return mergeGeometries([tint(new THREE.SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1.05).translate(0, 0.04, 0), 1), tint(new THREE.CylinderGeometry(0.2, 0.2, 0.015, 14).translate(0, 0.04, 0), 1)]);
  return mergeGeometries([tint(new THREE.SphereGeometry(0.135, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.95, 1.08).translate(0, 0.02, 0), 1), tint(new THREE.CylinderGeometry(0.15, 0.17, 0.08, 12, 1, true).translate(0, -0.02, -0.01), 1)]);
}
// ręce + karabin w pozycji „do strzału” (przód +Z, pivot na linii barków)
function armsAimGeo() {
  const r = rifleGeo().map((g) => g.clone().translate(0.08, -0.02, 0.2));
  const arm = (x0, y0, z0, x1, y1, z1) => { const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), L = a.distanceTo(b); const g = new THREE.BoxGeometry(0.1, 0.1, L).translate(0, 0, L / 2); g.lookAt(b.clone().sub(a)); return tint(g.translate(a.x, a.y, a.z), 1); };
  return mergeGeometries([...r, arm(0.21, 0, 0, 0.1, -0.08, 0.2), arm(0.1, -0.08, 0.2, 0.08, -0.08, 0.22), arm(-0.21, 0, 0, -0.08, -0.12, 0.3), arm(-0.08, -0.12, 0.3, 0.06, -0.06, 0.5)]);
}
// dodatki na broni: luneta snajperki / tuba granatnika (w układzie karabinu z rifleGeo)
function kitGeo(type) {
  if (type === 'sniper') return mergeGeometries([tint(new THREE.CylinderGeometry(0.022, 0.022, 0.26, 8).rotateX(Math.PI / 2).translate(0, 0.075, 0.2), 0.12, 0.12, 0.13), box(0.02, 0.02, 0.35, 0, 0.03, 1.05, STEEL)]);
  return mergeGeometries([tint(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10).rotateX(Math.PI / 2).translate(0, 0.02, 0.62), 0.22, 0.25, 0.2), box(0.03, 0.06, 0.05, 0, 0.09, 0.4, STEEL)]);
}
function kitAimGeo(type) { return kitGeo(type).translate(0.08, -0.02, 0.2); }
function kitCarryGeo(type) { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9, 0.5, 0.35)); return kitGeo(type).applyQuaternion(q).translate(0.02, -0.3, 0.2); }
function armsCarryGeo(bare) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9, 0.5, 0.35));
  const r = bare ? [] : rifleGeo().map((g) => g.clone().applyQuaternion(q).translate(0.02, -0.3, 0.2));
  const arm = (x0, y0, z0, x1, y1, z1) => { const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), L = a.distanceTo(b); const g = new THREE.BoxGeometry(0.1, 0.1, L).translate(0, 0, L / 2); g.lookAt(b.clone().sub(a)); return tint(g.translate(a.x, a.y, a.z), 1); };
  return mergeGeometries([...r, arm(0.22, 0, 0, 0.24, -0.3, 0.08), arm(0.24, -0.3, 0.08, 0.1, -0.38, 0.2), arm(-0.22, 0, 0, -0.22, -0.28, 0.1), arm(-0.22, -0.28, 0.1, -0.05, -0.18, 0.3)]);
}

export class Troops {
  constructor(map, parent) {
    this.map = map; this.parent = parent;
    this.soldiers = []; this.tracers = [];
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mk = (g) => { const m = new THREE.InstancedMesh(g, mat, CAP); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, new THREE.Color()); m.frustumCulled = false; m.count = 0; m.castShadow = true; parent.add(m); return m; };
    this.parts = { legL: mk(legGeo()), legR: mk(legGeo()), torso: mk(torsoGeo()), head: mk(headGeo()), helm0: mk(helmetGeo(0)), helm1: mk(helmetGeo(1)), aim: mk(armsAimGeo()), carry: mk(armsCarryGeo()), bare: mk(armsCarryGeo(true)),
      snA: mk(kitAimGeo('sniper')), snC: mk(kitCarryGeo('sniper')), glA: mk(kitAimGeo('launcher')), glC: mk(kitCarryGeo('launcher')) };
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(400 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.tracerLines.frustumCulled = false;
    parent.add(this.tracerLines);
    // smugi z objętością (widoczne z bliska w goglach): rozciągnięte walce
    this.tracerGlow = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true).translate(0, 0.5, 0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), 400);
    this.tracerGlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.tracerGlow.setColorAt(0, new THREE.Color()); this.tracerGlow.frustumCulled = false; this.tracerGlow.count = 0;
    parent.add(this.tracerGlow);
    // zdarzenia dla dźwięku i efektów
    this.onSmoke = null; this.onLaunch = null; this.smoke = null;      // zasłony dymne: { blocks(a, b) }
    this.onShot = null; this.onDeath = null; this.onPlayerHit = null; this.onNearMiss = null; this.onThrow = null; this.onImpact = null; this.onMelee = null; this.onResupply = null;
    this.arsenal = null;      // { rifle } — zapas magazynków
    this._m = new THREE.Matrix4(); this._m2 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._v = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0); this._c = new THREE.Color(); this._x = new THREE.Vector3(1, 0, 0);
  }
  clear() { this.soldiers = []; this.tracers = []; }
  alive(side) { return this.soldiers.filter((s) => s.state === 'alive' && (side === undefined || s.side === side)); }

  add(side, x, z, extra = {}) {
    const s = { side, x, z, y: this.map.floorAt(x, z), yaw: side === 1 ? 0 : Math.PI, hp: 100, state: 'alive', stance: 0, phase: Math.random() * 6, speed: 0, aim: 0, aimPitch: 0,
      cd: rnd(0.5, 2), look: 0, target: null, mag: KIT[extra.weapon || 'rifle'].mag, spare: KIT[extra.weapon || 'rifle'].spare[side ? 0 : 1], weapon: 'rifle', grenades: side ? (Math.random() < 0.45 ? 1 : 0) : 0, smokes: 0, reload: 0, path: null, pathT: 0, t: 0,
      fall: new THREE.Vector3(1, 0, 0), mode: side ? 'advance' : 'post', moveT: 0, ...extra };
    this.soldiers.push(s);
    return s;
  }
  spawnWave(n, wave) {
    const bays = this.map.bays;
    for (let k = 0; k < n; k++) {
      const x = rnd(-60, 60), z = rnd(SPAWN_Z[0], SPAWN_Z[1]);
      const b = bays[(Math.random() * bays.length) | 0];
      const s = this.add(1, x, z, { delay: k * rnd(0.3, 0.8), goal: new THREE.Vector2(rnd(b.x0 + 0.8, b.x1 - 0.8), -2.7), rush: wave > 3 && Math.random() < 0.25 });
      if (Math.random() < Math.min(0.3, 0.1 + wave * 0.03)) s.smokes = 1;
      // strzelcy wyborowi i grenadierzy
      const r = Math.random();
      if (r < Math.min(0.16, 0.05 + wave * 0.025)) this.arm(s, 'sniper');
      else if (wave >= 2 && r < Math.min(0.3, 0.16 + wave * 0.02)) this.arm(s, 'launcher');
      s.yaw = 0;
    }
  }
  spawnAlly(post, x, z, weapon) { const s = this.add(0, x ?? post.x, z ?? post.y, { post }); if (weapon) this.arm(s, weapon); return s; }
  arm(s, weapon) { s.weapon = weapon; s.mag = KIT[weapon].mag; s.spare = KIT[weapon].spare[s.side ? 0 : 1]; if (weapon === 'sniper') s.holdD = rnd(85, 135); }

  // ---------- pozy i trafienia ----------
  pose(s) {
    const c = s.stance;
    return { hip: 0.93 - 0.38 * c, head: 1.66 - 0.55 * c };
  }
  headPos(s, out = new THREE.Vector3()) {
    const p = this.pose(s), lean = 0.08 + 0.12 * s.stance;
    return out.set(s.x + Math.sin(s.yaw) * lean, s.y + p.head, s.z + Math.cos(s.yaw) * lean);
  }
  chestPos(s, out = new THREE.Vector3()) { const p = this.pose(s); return out.set(s.x, s.y + p.hip + 0.32, s.z); }
  eyePos(s, out = new THREE.Vector3()) { return this.headPos(s, out).add(this._v.set(0, 0.02, 0)); }

  // promień vs żołnierze: najbliższe trafienie { s, part, t }
  hitscan(o, d, max, skip) {
    let best = null, bt = max;
    const P = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3();
    for (const s of this.soldiers) {
      if (s.state !== 'alive' || s === skip) continue;
      // szybkie odrzucenie
      const rx = s.x - o.x, rz = s.z - o.z, along = rx * d.x + rz * d.z;
      if (along < -1 || along > bt + 1) continue;
      const hp = this.headPos(s, P);
      const th = raySphere(o, d, hp, 0.135);
      if (th !== null && th < bt) { bt = th; best = { s, part: 'head', t: th }; }
      const p = this.pose(s);
      A.set(s.x, s.y + 0.12, s.z); B.set(s.x + Math.sin(s.yaw) * 0.06 * s.stance, s.y + p.head - 0.2, s.z + Math.cos(s.yaw) * 0.06 * s.stance);
      const tb = rayCapsule(o, d, A, B, 0.2);
      if (tb !== null && tb < bt) { bt = tb; best = { s, part: 'body', t: tb }; }
    }
    return best;
  }

  damage(s, dmg, from, part = 'body') {
    if (s.state !== 'alive') return false;
    s.hp -= dmg; s.hurtT = 0.3;
    if (s.hp <= 0) {
      s.state = 'dead'; s.t = 0;
      const dx = s.x - (from ? from.x : s.x - Math.sin(s.yaw)), dz = s.z - (from ? from.z : s.z - Math.cos(s.yaw)), d = Math.hypot(dx, dz) || 1;
      s.fall.set(dx / d, 0, dz / d);
      // łup: magazynki i granaty zostają przy ciele
      const K = KIT[s.weapon];
      s.loot = { mags: Math.min(4, Math.max(s.side ? 1 : 0, s.spare + (s.mag > K.mag * 0.4 ? 1 : 0))), type: K.ammo, grenades: s.grenades, weapon: s.weapon };
      if (this.onDeath) this.onDeath(s, from, part);
      return true;
    }
    return false;
  }
  explode(p, R, from) {
    const hits = [];
    for (const s of this.soldiers) {
      if (s.state !== 'alive') continue;
      const c = this.chestPos(s, this._p), d = c.distanceTo(p);
      if (d > R) continue;
      if (!this.map.los(p.clone().add(new THREE.Vector3(0, 0.25, 0)), c, 0.2) && d > 1.5) continue;
      const dmg = 160 * (1 - d / R) ** 1.3 + (d < 2 ? 60 : 0);
      if (this.damage(s, dmg, { x: p.x, z: p.z }, 'blast')) hits.push(s); else if (dmg > 0) hits.push(s);
    }
    return hits;
  }

  // ---------- AI ----------
  update(dt, player, running) {
    for (const s of this.soldiers) {
      s.t += dt;
      if (s.state !== 'alive') continue;
      if (s.hurtT) s.hurtT = Math.max(0, s.hurtT - dt);
      if (!running) continue;
      if (s.delay > 0) { s.delay -= dt; continue; }
      if (s.side === 1) this.enemyAI(s, dt, player); else this.allyAI(s, dt, player);
      s.y = this.map.floorAt(s.x, s.z) + (s.side === 0 && s.mode === 'post' && s.speed < 0.1 ? 0.16 : 0);   // obrońca na skrzynce (stopień strzelecki)
      s.phase += s.speed * dt * 2.4;
    }
    this.separate(dt);
    // tracery
    for (let i = this.tracers.length - 1; i >= 0; i--) { const t = this.tracers[i]; t.t += dt; if (t.t > t.T + 0.03) this.tracers.splice(i, 1); }
    // ciała: limit
    const dead = this.soldiers.filter((s) => s.state === 'dead');
    if (dead.length > 90) { const old = dead.sort((a, b) => b.t - a.t).slice(0, dead.length - 90); this.soldiers = this.soldiers.filter((s) => !old.includes(s)); }
  }
  separate(dt) {
    const a = this.soldiers.filter((s) => s.state === 'alive' && !(s.delay > 0));
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      const p = a[i], q = a[j], dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz);
      if (d < 0.55 && d > 1e-4) {
        const f = ((0.55 - d) / d) * 0.5 * Math.min(1, dt * 8);
        const ok = (s, ox, oz) => !this.map.inTrench(s.x, s.z) || this.map.walkable(s.x + ox, s.z + oz);
        if (ok(p, dx * f, dz * f)) { p.x += dx * f; p.z += dz * f; }
        if (ok(q, -dx * f, -dz * f)) { q.x -= dx * f; q.z -= dz * f; }
      }
    }
  }
  // cele dla strony: wrogowie (dla sojuszników) albo obrońcy + gracz (dla wroga)
  candidates(side, player) {
    const out = [];
    for (const o of this.soldiers) if (o.state === 'alive' && o.side !== side && !(o.delay > 0)) out.push(o);
    if (side === 1 && player && player.alive) out.push(player);
    return out;
  }
  visible(s, o) {
    // obrońca wygląda zza worków (oko jak na stojąco), atakujący patrzy z bieżącej pozycji
    const st = s.stance; if (s.side === 0) s.stance = 0;
    const eye = this.eyePos(s, new THREE.Vector3()); s.stance = st;
    if (this.smoke && this.smoke.blocks(eye, o.isPlayer ? o.head : this.chestPos(o, new THREE.Vector3()))) return 0;
    if (o.isPlayer) {
      if (this.map.los(eye, o.head)) return o.chestVisible = this.map.los(eye, o.chest), 1;
      return 0;
    }
    const c = this.chestPos(o, new THREE.Vector3());
    if (this.map.los(eye, c)) return 2;
    if (this.map.los(eye, this.headPos(o, new THREE.Vector3()))) return 1;
    return 0;
  }
  // najbliższy widoczny cel (sprawdzane od najbliższych, max kilka prób linii wzroku)
  pickTarget(s, player, maxD) {
    const list = [];
    for (const o of this.candidates(s.side, player)) { const d = Math.hypot(o.x - s.x, o.z - s.z); if (d < maxD) list.push([d, o]); }
    list.sort((a, b) => a[0] - b[0]);
    let tries = 0;
    for (const [, o] of list) {
      if (tries++ > 6) break;
      const v = this.visible(s, o);
      if (v) { s.targetVis = v; return o; }
    }
    s.targetVis = 0;
    return null;
  }
  faceTo(s, x, z, dt, rate = 6) { s.yaw += wrap(Math.atan2(x - s.x, z - s.z) - s.yaw) * Math.min(1, dt * rate); }
  moveTo(s, x, z, speed, dt) {
    const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { s.speed = 0; return d; }
    let sp = speed;
    if (this.map.wireAt(s.x, s.z)) sp *= 0.32;
    const st = Math.min(d, sp * dt);
    const nx = s.x + (dx / d) * st, nz = s.z + (dz / d) * st;
    if (this.map.inTrench(s.x, s.z) && !this.map.walkable(nx, nz)) {
      if (this.map.walkable(nx, s.z)) s.x = nx; else if (this.map.walkable(s.x, nz)) s.z = nz;
    } else { s.x = nx; s.z = nz; }
    s.speed = sp;
    this.faceTo(s, x, z, dt, 8);
    return d;
  }
  followPath(s, tx, tz, speed, dt) {
    s.pathT -= dt;
    if (!s.path || s.pathT <= 0 || (s.pathGoal && Math.hypot(s.pathGoal.x - tx, s.pathGoal.y - tz) > 1.5)) {
      s.path = this.map.path(s.x, s.z, tx, tz); s.pathT = 1.2; s.pathGoal = new THREE.Vector2(tx, tz);
      if (!s.path) { const c = this.map.nearestTrench(tx, tz, 2) , c0 = this.map.walkable(s.x, s.z) ? null : this.map.nearestTrench(s.x, s.z, 2); if (c0) { s.x = c0.x; s.z = c0.y; } if (c) s.path = this.map.path(s.x, s.z, c.x, c.y); }
    }
    if (!s.path || !s.path.length) { s.speed = 0; return Infinity; }
    const p = s.path[0];
    const d = this.moveTo(s, p.x, p.y, speed, dt);
    if (d < 0.25 && s.path.length > 1) s.path.shift();
    return Math.hypot(tx - s.x, tz - s.z);
  }
  // strzał AI: trafienie wg odległości, osłony i ruchu
  shoot(s, o, player) {
    if (s.mag <= 0) return;
    s.mag--; s.aim = 1; s.shotT = 0;
    const muzzle = this.eyePos(s, new THREE.Vector3()).add(new THREE.Vector3(Math.sin(s.yaw) * 0.7 + Math.cos(s.yaw) * 0.08, -0.08, Math.cos(s.yaw) * 0.7 - Math.sin(s.yaw) * 0.08));
    const tgt = o.isPlayer ? (o.chestVisible ? o.chest.clone() : o.head.clone()) : (s.targetVis === 2 ? this.chestPos(o, new THREE.Vector3()) : this.headPos(o, new THREE.Vector3()));
    const d = muzzle.distanceTo(tgt);
    const sn = s.weapon === 'sniper';
    let p = sn ? (s.side ? 0.62 : 0.58) * (140 / (140 + d)) ** 0.6 : (s.side ? 0.5 : 0.42) * 2 * (30 / (30 + d)) ** 1.4;
    if ((o.isPlayer && !o.chestVisible) || s.targetVis === 1) p *= 0.38;
    if (s.speed > 0.5) p *= 0.5;
    if ((o.speed || 0) > 2) p *= 0.6;
    if (o.isPlayer) p *= 0.65;
    p = Math.min(0.85, Math.max(0.03, p));
    const hit = Math.random() < p;
    let end = tgt.clone();
    if (!hit) {
      const off = new THREE.Vector3(rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.3, 1.4));
      const dir = tgt.clone().add(off).sub(muzzle).normalize();
      const tt = this.map.rayTerrain(muzzle, dir, 300);
      end = muzzle.clone().addScaledVector(dir, Math.min(tt, 300));
      if (o.isPlayer && this.onNearMiss) this.onNearMiss(muzzle, dir, end);
      else if (tt < 300 && this.onImpact) this.onImpact(end);
    } else if (o.isPlayer) {
      if (this.onPlayerHit) this.onPlayerHit((sn ? rnd(55, 75) : rnd(14, 24)) * (o.chestVisible ? 1 : 1.25), s);
    } else {
      const head = Math.random() < 0.15;
      this.damage(o, head || sn ? (sn ? rnd(85, 120) : 100) : rnd(34, 48), s, head ? 'head' : 'body');
    }
    this.tracers.push({ a: muzzle, b: end, t: 0, T: muzzle.distanceTo(end) / (sn ? TRACER_V * 1.5 : TRACER_V), side: s.side, len: sn ? 10 : 6 });
    if (sn) s.snipeShot = true;
    if (this.onShot) this.onShot(s, muzzle);
  }
  melee(s, o) {
    s.cd = rnd(1, 1.4); s.aim = 1;
    if (o.isPlayer) { if (this.onPlayerHit) this.onPlayerHit(rnd(25, 35), s, true); }
    else this.damage(o, rnd(30, 45), s, 'body');
    if (this.onMelee) this.onMelee(s);
  }
  combat(s, dt, player, maxD, canMove) {
    s.look -= dt;
    if (s.look <= 0 || (s.target && s.target.state === 'dead')) { s.look = rnd(0.4, 0.8); s.target = this.pickTarget(s, player, maxD); }
    const o = s.target;
    if (!o || (o.isPlayer ? !o.alive : o.state !== 'alive')) { s.target = null; return false; }
    this.faceTo(s, o.x, o.z, dt, 5);
    const d = Math.hypot(o.x - s.x, o.z - s.z);
    if (d < 1.3) { if (s.cd <= 0) this.melee(s, o); return true; }
    if (s.reload > 0) return true;
    if (s.mag <= 0) { if (s.spare > 0) { s.spare--; s.reload = s.weapon === 'launcher' ? 3 : 2.6; s.mag = KIT[s.weapon].mag; } return !!canMove; }
    if (s.cd <= 0) {
      if (s.weapon === 'launcher' && d > 14 && this.onLaunch) {
        s.cd = rnd(5, 8); s.mag--; s.aim = 1; s.shotT = 0;
        const t = o.isPlayer ? o.chest.clone() : this.chestPos(o, new THREE.Vector3());
        this.onLaunch(s, t);
      } else if (s.weapon === 'sniper') { s.cd = rnd(3.2, 5.5); this.shoot(s, o, player); }
      else { s.cd = (s.side ? rnd(1.1, 2.2) : rnd(1.2, 2.2)) * (d < 25 ? 0.6 : d > 70 ? 1.4 : 1); this.shoot(s, o, player); }
    }
    return true;
  }

  enemyAI(s, dt, player) {
    s.cd -= dt; s.reload = Math.max(0, s.reload - dt); s.aim = Math.max(0, s.aim - dt * 0.6);
    if (s.mode === 'advance') {
      const g = s.goal, d = Math.hypot(g.x - s.x, g.y - s.z);
      s.moveT -= dt;
      if (d < 1.0) {
        // skok do okopu
        const c = this.map.nearestTrench(s.x, s.z + 1.6, 3);
        if (c) { s.x = c.x; s.z = c.y; s.mode = 'trench'; s.stance = 0; s.path = null; return; }
      }
      // zasłona dymna przed natarciem
      if (s.smokes > 0 && d > 32 && d < 95 && Math.random() < dt * 0.12 && this.onSmoke) {
        s.smokes--; s.aim = 1;
        const k = Math.min(1, rnd(16, 26) / d);
        this.onSmoke(s, new THREE.Vector3(s.x + (g.x - s.x) * k + rnd(-4, 4), 0, s.z + (g.y - s.z) * k));
      }
      // strzelec wyborowy zostaje z tyłu i strzela z daleka (rusza, gdy zostanie prawie sam)
      if (s.weapon === 'sniper' && d < s.holdD && this.alive(1).length > 3) {
        s.speed = 0; s.stance += (1 - s.stance) * Math.min(1, dt * 5);
        this.combat(s, dt, player, 280);
        return;
      }
      const assault = d < 24 || s.rush;
      if (assault || s.phaseMove) {
        s.stance += (0.25 - s.stance) * Math.min(1, dt * 4);
        this.moveTo(s, g.x, g.y, assault ? 3.6 : 3.2, dt);
        // granat z bliska
        if (s.grenades > 0 && d < 17 && d > 7 && Math.random() < dt * 0.6) {
          const t = this.pickTarget(s, player, 30);
          if (t && this.onThrow) { s.grenades--; s.aim = 1; this.onThrow(s, new THREE.Vector3(t.x, t.isPlayer ? t.head.y - 1.5 : t.y, t.z)); }
        }
        if (!assault && s.moveT <= 0) { s.phaseMove = false; s.moveT = rnd(1.5, 3.2); }
        // strzał w biegu, gdy blisko
        if (assault && d < 20) { s.look -= dt; if (s.look <= 0) { s.look = 0.7; s.target = this.pickTarget(s, player, 40); } if (s.target && s.cd <= 0 && s.mag > 0) { s.cd = rnd(1.4, 2.6); this.shoot(s, s.target, player); } }
      } else {
        // przyklęk i ogień
        s.speed = 0;
        s.stance += (1 - s.stance) * Math.min(1, dt * 5);
        this.combat(s, dt, player, 230);
        if (s.moveT <= 0) { s.phaseMove = true; s.moveT = rnd(4, 7); }
      }
      return;
    }
    // w okopie: pościg za najbliższym obrońcą
    s.stance += (0 - s.stance) * Math.min(1, dt * 5);
    let o = null, bd = Infinity;
    for (const c of this.candidates(1, player)) { if (!this.map.inTrench(c.x, c.z)) continue; const d = Math.hypot(c.x - s.x, c.z - s.z); if (d < bd) { bd = d; o = c; } }
    const fighting = this.combat(s, dt, player, 35, true);
    if (o && (!fighting || bd > 6 || !s.target)) this.followPath(s, o.x, o.z, 2.8, dt);
    else if (!o) s.speed = 0;
    else s.speed = 0;
  }

  allyAI(s, dt, player) {
    s.cd -= dt; s.reload = Math.max(0, s.reload - dt); s.aim = Math.max(0, s.aim - dt * 0.4);
    const ars = this.arsenal;
    if (s.mode === 'resupply') {
      const a = this.map.arsenal.cell;
      const d = this.followPath(s, a[0], a[1], 3, dt);
      if (d < 1.4) {
        s.speed = 0; s.waitT = (s.waitT || 0) + dt;
        if (s.waitT > 1.5) {
          s.waitT = 0;
          const key = KIT[s.weapon].ammo, take = Math.min(4, ars ? ars[key] || 0 : 0);
          if (take > 0) { ars[key] -= take; s.spare += take; if (this.onResupply) this.onResupply(s, take); s.mode = 'return'; }
          else s.mode = 'loot';
        }
      }
      return;
    }
    if (s.mode === 'loot') {
      let body = null, bd = 40;
      for (const b of this.soldiers) if (b.state === 'dead' && b.loot && b.loot.mags > 0 && b.loot.type === KIT[s.weapon].ammo && this.map.inTrench(b.x, b.z)) { const d = Math.hypot(b.x - s.x, b.z - s.z); if (d < bd) { bd = d; body = b; } }
      if (!body) { s.mode = 'return'; s.dry = true; return; }
      if (this.followPath(s, body.x, body.z, 3, dt) < 0.9) { s.spare += body.loot.mags; body.loot.mags = 0; s.mode = 'return'; s.dry = false; }
      return;
    }
    if (s.mode === 'return') {
      if (this.combat(s, dt, player, 30)) { s.speed = 0; return; }
      if (this.followPath(s, s.post.x, s.post.y, 3, dt) < 0.4) s.mode = 'post';
      return;
    }
    // posterunek
    const atPost = Math.hypot(s.post.x - s.x, s.post.y - s.z) < 0.4;
    if (!atPost) { this.followPath(s, s.post.x, s.post.y, 2.6, dt); s.stance = Math.max(0, s.stance - dt * 3); }
    else s.speed = 0;
    const fighting = this.combat(s, dt, player, 240);
    s.stance += ((fighting && s.reload <= 0 ? 0 : 0.85) - s.stance) * Math.min(1, dt * 4);
    if (s.mag <= 0 && s.spare <= 0 && s.reload <= 0 && !s.dry) s.mode = ars && ars[KIT[s.weapon].ammo] > 0 ? 'resupply' : 'loot';
  }

  // ---------- rysowanie ----------
  render() {
    const P = this.parts, cnt = { n: 0 };
    let n = 0, h0 = 0, h1 = 0, na = 0, nc = 0;
    const kc = { snA: 0, snC: 0, glA: 0, glC: 0 }; let nb = 0;
    const M = this._m, Mt = new THREE.Matrix4(), tmp = new THREE.Matrix4(), q = this._q, col = new THREE.Color(), skin = new THREE.Color(1, 1, 1);
    for (const s of this.soldiers) {
      if (n >= CAP || s.delay > 0) continue;
      const pose = this.pose(s), c = s.stance, dead = s.state === 'dead';
      col.copy(COLORS[s.side]);
      if (s.hurtT) col.lerp(new THREE.Color(1, 0.3, 0.25), s.hurtT * 1.5);
      if (dead) col.multiplyScalar(0.7);
      // korzeń
      q.setFromAxisAngle(this._up, s.yaw);
      M.compose(this._p.set(s.x, s.y + (dead ? 0.12 : 0), s.z), q, this._s);
      if (dead) {
        const ax = this._v.set(s.fall.z, 0, -s.fall.x).applyQuaternion(q.clone().invert());
        M.multiply(tmp.makeRotationAxis(ax.normalize(), Math.min(1, s.t / 0.45) * Math.PI / 2));
      }
      const hip = dead ? 0.93 : pose.hip;
      const sw = dead ? 0 : Math.sin(s.phase) * Math.min(1, s.speed / 2) * 0.65;
      const kneel = dead ? 0 : c;
      // nogi
      for (const [part, sx, sg] of [[P.legL, -0.1, 1], [P.legR, 0.1, -1]]) {
        Mt.copy(M).multiply(tmp.makeTranslation(sx, hip, 0)).multiply(tmp.makeRotationX(-sw * sg - kneel * (sg > 0 ? 1.35 : 0.25)));
        part.setMatrixAt(n, Mt); part.setColorAt(n, col);
      }
      // tułów
      const lean = dead ? 0 : 0.12 * c + Math.min(0.3, s.speed * 0.07);
      const T = new THREE.Matrix4().copy(M).multiply(tmp.makeTranslation(0, hip, 0)).multiply(tmp.makeRotationX(lean));
      P.torso.setMatrixAt(n, T); P.torso.setColorAt(n, col);
      const H = new THREE.Matrix4().copy(T).multiply(tmp.makeTranslation(0, 0.8, 0.02));
      P.head.setMatrixAt(n, H); P.head.setColorAt(n, skin);
      const helm = s.side ? P.helm1 : P.helm0, hi = s.side ? h1++ : h0++;
      helm.setMatrixAt(hi, Mt.copy(H).multiply(tmp.makeTranslation(0, 0.06, 0))); helm.setColorAt(hi, s.side ? col.clone().multiplyScalar(0.8) : new THREE.Color(0.42, 0.42, 0.3));
      // ręce z karabinem
      const A = new THREE.Matrix4().copy(T).multiply(tmp.makeTranslation(0, 0.56, 0));
      const kit = s.weapon === 'sniper' ? 'sn' : s.weapon === 'launcher' ? 'gl' : null;
      if (!dead && (s.aim > 0.05 || s.target)) { A.multiply(tmp.makeRotationX(-lean + (s.aimPitch || 0))); P.aim.setMatrixAt(na, A); P.aim.setColorAt(na++, col); if (kit) { const m = P[kit + 'A']; m.setMatrixAt(kc[kit + 'A'], A); m.setColorAt(kc[kit + 'A']++, skin); } }
      else if (dead) { P.bare.setMatrixAt(nb, A); P.bare.setColorAt(nb++, col); }
      else { P.carry.setMatrixAt(nc, A); P.carry.setColorAt(nc++, col); if (kit) { const m = P[kit + 'C']; m.setMatrixAt(kc[kit + 'C'], A); m.setColorAt(kc[kit + 'C']++, skin); } }
      n++;
    }
    for (const k of ['legL', 'legR', 'torso', 'head']) P[k].count = n;
    P.helm0.count = h0; P.helm1.count = h1; P.aim.count = na; P.carry.count = nc;
    for (const k in kc) P[k].count = kc[k];
    P.bare.count = nb;
    for (const m of Object.values(P)) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    void cnt;
    // tracery: krótki odcinek lecący wzdłuż toru
    const pa = this.tracerLines.geometry.attributes.position, ca = this.tracerLines.geometry.attributes.color;
    let k = 0;
    for (const t of this.tracers) {
      if (k >= 400) break;
      const L = t.a.distanceTo(t.b), u1 = Math.min(1, t.t / Math.max(t.T, 1e-3)), u0 = Math.max(0, u1 - (t.len || 6) / Math.max(L, 1));
      const a = this._v.copy(t.a).lerp(t.b, u0), b = new THREE.Vector3().copy(t.a).lerp(t.b, u1);
      pa.setXYZ(k * 2, a.x, a.y, a.z); pa.setXYZ(k * 2 + 1, b.x, b.y, b.z);
      const cc = t.side ? [0.75, 0.5, 0.25] : t.player ? [1, 0.75, 0.35] : [1, 0.85, 0.5];
      ca.setXYZ(k * 2, cc[0] * 0.2, cc[1] * 0.2, cc[2] * 0.2); ca.setXYZ(k * 2 + 1, ...cc);
      const seg = a.distanceTo(b);
      if (seg > 0.05) {
        const r = t.player ? 0.009 : 0.006;
        this._m.lookAt(b, a, this._up); this._q.setFromRotationMatrix(this._m);
        this._m2.compose(b, this._q, this._s.set(r, r, seg));     // walec biegnie wzdłuż −Z: od czoła smugi (b) do ogona (a)
        this.tracerGlow.setMatrixAt(k, this._m2); this._s.set(1, 1, 1);
        this.tracerGlow.setColorAt(k, this._c.setRGB(cc[0] * 0.9, cc[1] * 0.7, cc[2] * 0.5));
      } else this.tracerGlow.setMatrixAt(k, this._m2.makeScale(0, 0, 0));
      k++;
    }
    this.tracerLines.geometry.setDrawRange(0, k * 2);
    pa.needsUpdate = true; ca.needsUpdate = true;
    this.tracerGlow.count = k; this.tracerGlow.instanceMatrix.needsUpdate = true; if (this.tracerGlow.instanceColor) this.tracerGlow.instanceColor.needsUpdate = true;
  }
}

// ---------- geometria promieni ----------
export function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}
// przybliżenie: najbliższe zbliżenie promienia do odcinka AB
export function rayCapsule(o, d, A, B, r) {
  const u = new THREE.Vector3().subVectors(B, A), w = new THREE.Vector3().subVectors(o, A);
  const a = 1, b = d.dot(u), c = u.dot(u), dd = d.dot(w), e = u.dot(w);
  const den = a * c - b * b;
  let sc, tc;
  if (den < 1e-8) { sc = 0; tc = e / c; }
  else { sc = (b * e - c * dd) / den; tc = (a * e - b * dd) / den; }
  tc = Math.max(0, Math.min(1, tc));
  sc = Math.max(0, d.dot(new THREE.Vector3().copy(A).addScaledVector(u, tc).sub(o)));
  const p = new THREE.Vector3().copy(o).addScaledVector(d, sc), q = new THREE.Vector3().copy(A).addScaledVector(u, tc);
  return p.distanceTo(q) <= r ? Math.max(0, sc - r * 0.5) : null;
}
export { FLOOR, EYE };
