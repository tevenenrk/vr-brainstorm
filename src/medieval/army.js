import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MW, MD, UNIT_K } from './world.js';
import { RUN_FRAMES, IDLE } from './knight.js';

const G = 9.81;
const K = UNIT_K;
export const SIDES = [
  { name: 'Niebiescy', color: new THREE.Color(0.45, 0.6, 1.0), css: '#7fa6ff', home: MD / 2 - 60, dir: -1 },
  { name: 'Czerwoni', color: new THREE.Color(1.0, 0.5, 0.42), css: '#ff8a72', home: -MD / 2 + 60, dir: 1 },
];
export const TYPES = {
  sword: { name: 'Miecznicy', letter: 'M', hp: 100, dmg: 22, reach: 2.1 * K, cd: 1.0, walk: 1.6 * K, run: 3.6 * K, cols: 7, n: 21, shield: true },
  spear: { name: 'Włócznicy', letter: 'W', hp: 100, dmg: 19, reach: 3.3 * K, cd: 1.25, walk: 1.5 * K, run: 3.2 * K, cols: 7, n: 21, firstStrike: 1.4 },
  bow: { name: 'Łucznicy', letter: 'Ł', hp: 70, dmg: 8, reach: 1.7 * K, cd: 1.4, walk: 1.7 * K, run: 3.8 * K, cols: 9, n: 18, range: 95, arrow: 34, reload: [3.2, 4.6] },
  // kawaleria: szarża w pędzie ×2, włócznicy zadają jej ×2,5
  cav: { name: 'Kawaleria', letter: 'K', hp: 160, dmg: 26, reach: 2.6 * K, cd: 1.1, walk: 2.6 * K, run: 7.5 * K, cols: 6, n: 12, charge: 2.4, barding: 0.5, spx: 2.4 * K, spz: 3.6 * K, mount: true },
  // katapulty: wolne, strzelają kamieniem z daleka po stromym torze, kamień rani wszystkich wokół miejsca upadku
  cat: { name: 'Katapulty', letter: 'C', hp: 260, dmg: 0, reach: 0, cd: 2, walk: 0.8 * K, run: 1.2 * K, cols: 3, n: 3, spx: 9 * K, spz: 9 * K, siege: true, range: 270, minRange: 45, reload: [9, 12.5], stone: 85, splash: 3.6 * K, armor: 0.3 },
};
const ANTI_CAV = 2.5;           // mnożnik obrażeń włóczni przeciw koniom
export const RIDER_EYE = 0.8;   // o ile wyżej siedzi jeździec (m)
export const ARROW_V = 62;
const MAX_LOFT = 0.7;           // maks. kąt strzału łucznika (rad), gdy płaski tor zasłaniają swoi
const SP = 1.7 * K;            // odstęp w szyku
const rnd = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- modele (wymiary realne × K) ----------
const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
const tint = (g, r, gg = r, b = r) => { g = nonIdx(g); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gg; a[i * 3 + 2] = b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
function bodyGeo(type) {
  const P = [
    tint(new THREE.BoxGeometry(0.18, 0.85, 0.2).translate(-0.12, 0.42, 0), 0.32, 0.28, 0.24),
    tint(new THREE.BoxGeometry(0.18, 0.85, 0.2).translate(0.12, 0.42, 0), 0.32, 0.28, 0.24),
    tint(new THREE.BoxGeometry(0.5, 0.62, 0.28).translate(0, 1.15, 0), 1),
    tint(new THREE.BoxGeometry(0.13, 0.55, 0.13).translate(-0.33, 1.15, 0.02), 1),
    tint(new THREE.SphereGeometry(0.14, 8, 6).translate(0, 1.6, 0), 1, 0.85, 0.72),
    tint(new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.62, 0), 0.72, 0.74, 0.78),
  ];
  if (type === 'sword') P.push(tint(new THREE.BoxGeometry(0.08, 0.7, 0.55).translate(-0.42, 1.1, 0.12), 0.62, 0.45, 0.25));
  if (type === 'cav') return horseGeo();
  if (type === 'cat') return catapultGeo();
  return mergeGeometries(P).scale(K, K, K);
}
// koń + jeździec, przód w +Z
function horseGeo() {
  const br = [0.42, 0.28, 0.17], dk = [0.2, 0.14, 0.1];
  const P = [
    tint(new THREE.BoxGeometry(0.55, 0.62, 1.7).translate(0, 1.22, 0), ...br),
    tint(new THREE.BoxGeometry(0.6, 0.42, 1.25).translate(0, 1.1, -0.05), 1),                       // czaprak w barwach
    tint(new THREE.BoxGeometry(0.3, 0.8, 0.36).rotateX(0.62).translate(0, 1.68, 0.86), ...br),       // szyja
    tint(new THREE.BoxGeometry(0.26, 0.3, 0.62).rotateX(0.35).translate(0, 1.98, 1.18), ...br),      // łeb
    tint(new THREE.BoxGeometry(0.06, 0.5, 0.12).translate(0, 1.82, 0.78), ...dk),                    // grzywa
    tint(new THREE.BoxGeometry(0.1, 0.6, 0.12).rotateX(0.45).translate(0, 1.1, -0.98), ...dk),       // ogon
    tint(new THREE.BoxGeometry(0.66, 0.22, 0.34).translate(0, 1.62, -0.05), 0.3, 0.27, 0.24),        // nogi jeźdźca
    tint(new THREE.BoxGeometry(0.46, 0.62, 0.3).translate(0, 2.02, -0.05), 1),                       // tułów
    tint(new THREE.BoxGeometry(0.13, 0.52, 0.13).translate(-0.31, 2.0, 0.0), 1),                     // lewe ramię
    tint(new THREE.BoxGeometry(0.06, 0.6, 0.45).translate(-0.4, 1.95, 0.08), 0.62, 0.45, 0.25),      // tarcza
    tint(new THREE.SphereGeometry(0.14, 8, 6).translate(0, 2.47, -0.05), 1, 0.85, 0.72),
    tint(new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 2.49, -0.05), 0.72, 0.74, 0.78),
  ];
  for (const [x, z] of [[-0.18, 0.66], [0.18, 0.66], [-0.18, -0.64], [0.18, -0.64]]) P.push(tint(new THREE.BoxGeometry(0.14, 0.95, 0.15).translate(x, 0.47, z), ...br));
  return mergeGeometries(P).scale(K, K, K);
}
// katapulta (mangonel) na kołach, przód w +Z, oś ramienia na wys. 1,25 m
function catapultGeo() {
  const wd = [0.46, 0.33, 0.2], dk = [0.3, 0.22, 0.14];
  const P = [];
  for (const x of [-0.7, 0.7]) {
    P.push(tint(new THREE.BoxGeometry(0.22, 0.24, 4.2).translate(x, 0.6, 0), ...wd));                 // podłużnice
    P.push(tint(new THREE.BoxGeometry(0.18, 1.9, 0.2).translate(x, 1.35, 0.15), ...wd));              // słupy osi
    P.push(tint(new THREE.BoxGeometry(0.16, 2.1, 0.16).rotateX(-0.55).translate(x, 1.1, 0.85), ...dk)); // zastrzały
    for (const z of [-1.4, 1.4]) P.push(tint(new THREE.CylinderGeometry(0.48, 0.48, 0.14, 12).rotateZ(Math.PI / 2).translate(x * 1.22, 0.48, z), ...dk));
  }
  P.push(tint(new THREE.BoxGeometry(1.6, 0.2, 0.22).translate(0, 0.6, 1.9), ...wd), tint(new THREE.BoxGeometry(1.6, 0.2, 0.22).translate(0, 0.6, -1.9), ...wd));
  P.push(tint(new THREE.BoxGeometry(1.62, 0.2, 0.22).translate(0, 2.2, 0.5), ...wd));                  // poprzeczka-ogranicznik
  P.push(tint(new THREE.CylinderGeometry(0.32, 0.32, 1.2, 10).rotateZ(Math.PI / 2).translate(0, 0.62, 0.15), 0.55, 0.5, 0.42)); // zwój lin
  P.push(tint(new THREE.BoxGeometry(1.2, 0.5, 0.06).translate(0, 1.0, -2.05), 1));                    // tarcza z barwami
  return mergeGeometries(P).scale(K, K, K);
}
// broń: pivot w barku (0.33, 1.4), oś obrotu X
function weaponGeo(type) {
  let P;
  if (type === 'sword') P = [tint(new THREE.BoxGeometry(0.05, 0.05, 0.85).translate(0, 0, 0.55), 0.85, 0.87, 0.9), tint(new THREE.BoxGeometry(0.22, 0.04, 0.04).translate(0, 0, 0.12), 0.4, 0.32, 0.2)];
  else if (type === 'spear') P = [tint(new THREE.CylinderGeometry(0.025, 0.025, 2.6, 5).rotateX(Math.PI / 2).translate(0, 0, 0.8), 0.45, 0.33, 0.2), tint(new THREE.ConeGeometry(0.05, 0.25, 5).rotateX(Math.PI / 2).translate(0, 0, 2.2), 0.85, 0.87, 0.9)];
  else if (type === 'cat') P = [tint(new THREE.BoxGeometry(0.2, 0.2, 3.1).translate(0, 0, -1.45), 0.5, 0.36, 0.22), tint(new THREE.CylinderGeometry(0.36, 0.22, 0.28, 10).translate(0, 0.12, -2.95), 0.36, 0.27, 0.17)];
  else if (type === 'cav') P = [tint(new THREE.CylinderGeometry(0.035, 0.025, 3.4, 5).rotateX(Math.PI / 2).translate(0, 0, 1.0), 0.55, 0.4, 0.25), tint(new THREE.ConeGeometry(0.05, 0.3, 5).rotateX(Math.PI / 2).translate(0, 0, 2.85), 0.85, 0.87, 0.9), tint(new THREE.CylinderGeometry(0.09, 0.03, 0.2, 6).rotateX(Math.PI / 2).translate(0, 0, -0.05), 0.75, 0.76, 0.8)];
  else P = [tint(new THREE.TorusGeometry(0.55, 0.02, 4, 12, Math.PI * 0.9).rotateZ(Math.PI / 2 - Math.PI * 0.45).rotateY(Math.PI / 2).translate(0, 0, 0.25), 0.45, 0.32, 0.18)];
  return mergeGeometries(P).scale(K, K, K);
}

export class Army {
  constructor(field, parent, effects) {
    this.field = field; this.parent = parent; this.fx = effects;
    this.squads = []; this.soldiers = []; this.arrows = []; this.nextId = 1;
    this.meshes = {};
    for (const t of Object.keys(TYPES)) {
      const body = new THREE.InstancedMesh(bodyGeo(t), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 600);
      const weap = new THREE.InstancedMesh(weaponGeo(t), new THREE.MeshLambertMaterial({ vertexColors: true }), 600);
      for (const m of [body, weap]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, new THREE.Color()); m.castShadow = true; m.frustumCulled = false; m.count = 0; parent.add(m); }
      this.meshes[t] = { body, weap };
    }
    this.arrowMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4).rotateX(Math.PI / 2).scale(K, K, K), new THREE.MeshBasicMaterial({ color: 0x3a2a1a }), 1500);
    this.arrowMesh.frustumCulled = false; this.arrowMesh.count = 0;
    parent.add(this.arrowMesh);
    this.stoneMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.33 * K, 0), new THREE.MeshLambertMaterial({ color: 0x8a8378, flatShading: true }), 200);
    this.stoneMesh.frustumCulled = false; this.stoneMesh.count = 0; this.stoneMesh.castShadow = true;
    parent.add(this.stoneMesh);
    this.grid = new Map();
    this.onHit = null; this.onPlayerHit = null; this.onDeath = null; this.onImpact = null; this.onLaunch = null;
    this.knight = null; this.lod = 'lo';
    this.time = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._c = new THREE.Color(); this._up = new THREE.Vector3(0, 1, 0); this._x = new THREE.Vector3(1, 0, 0); this._v = new THREE.Vector3();
  }

  clear() { for (const s of this.squads) this.parent.remove(s.banner); this.squads = []; this.soldiers = []; this.arrows = []; this.time = 0; }

  // ---------- oddziały ----------
  addSquad(side, type, x, z) {
    const T = TYPES[type], S = SIDES[side];
    if (x === undefined) {
      const mine = this.squads.filter((q) => q.side === side).length;
      x = ((mine % 5) - 2) * 70 + rnd(-8, 8);
      z = S.home - S.dir * (Math.floor(mine / 5) * -28) + (type === 'bow' ? -S.dir * -24 : 0);
    }
    const sq = { id: this.nextId++, side, type, ax: x, az: z, facing: side === 0 ? Math.PI : 0, order: null, soldiers: [], routed: false, routT: 0, aiT: 0, size0: T.n };
    for (let i = 0; i < T.n; i++) {
      const col = i % T.cols, row = Math.floor(i / T.cols);
      const s = { momentum: 0, sq, side, type, slot: [(col - (T.cols - 1) / 2) * (T.spx || SP), -row * (T.spz || SP)], x: 0, z: 0, yaw: sq.facing, hp: T.hp, state: 'alive', t: 0, cd: rnd(0, 1.5), anim: 0, target: null, look: Math.random() * 0.5, vx: 0, vz: 0, fall: new THREE.Vector3(1, 0, 0), phase: Math.random() * 6 };
      const p = this.slotPos(sq, s);
      s.x = p[0]; s.z = p[1];
      sq.soldiers.push(s); this.soldiers.push(s);
    }
    sq.banner = this.makeBanner(sq);
    this.parent.add(sq.banner);
    this.squads.push(sq);
    return sq;
  }

  makeBanner(sq) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * K, 0.06 * K, 4.2 * K, 5).translate(0, 2.1 * K, 0), new THREE.MeshLambertMaterial({ color: 0x4a3a28 }));
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    c.fillStyle = SIDES[sq.side].css; c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#fff'; c.font = 'bold 44px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(TYPES[sq.type].letter, 32, 48);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4 * K, 1.1 * K).translate(0.7 * K, 3.6 * K, 0), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false }));
    g.add(pole, flag);
    g.userData.flag = flag; g.userData.squad = sq;
    flag.userData.squad = sq; pole.userData.squad = sq;
    return g;
  }

  slotPos(sq, s) {
    const c = Math.cos(sq.facing), sn = Math.sin(sq.facing);
    // przód szyku = kierunek facing (wektor sin, cos); kolumny w poprzek
    const [ox, oz] = s.slot;
    return [sq.ax + ox * c + oz * sn, sq.az - ox * sn + oz * c];
  }

  alive(sq) { return sq.soldiers.filter((s) => s.state === 'alive'); }
  center(sq) {
    const a = this.alive(sq);
    if (!a.length) return [sq.ax, sq.az];
    let x = 0, z = 0; for (const s of a) { x += s.x; z += s.z; }
    return [x / a.length, z / a.length];
  }
  sideAlive(side) { let n = 0; for (const s of this.soldiers) if (s.side === side && s.state === 'alive') n++; return n; }

  order(sq, o) { sq.order = o; sq.routed = false; }

  // ---------- siatka przestrzenna ----------
  buildGrid() {
    this.grid.clear();
    for (const s of this.soldiers) {
      if (s.state !== 'alive') continue;
      const k = (Math.floor(s.x / 8) + 100) * 1000 + Math.floor(s.z / 8) + 100;
      let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(s);
    }
  }
  near(x, z, r, fn) {
    for (let i = Math.floor((x - r) / 8); i <= Math.floor((x + r) / 8); i++) for (let j = Math.floor((z - r) / 8); j <= Math.floor((z + r) / 8); j++) {
      const a = this.grid.get((i + 100) * 1000 + j + 100);
      if (a) for (const s of a) fn(s);
    }
  }
  friendNear(x, z, side, r) {
    let f = false;
    this.near(x, z, r, (o) => { if (!f && o.side === side && o.state === 'alive' && Math.hypot(o.x - x, o.z - z) < r) f = true; });
    return f;
  }
  nearestEnemy(s, r) {
    let best = null, bd = r;
    this.near(s.x, s.z, r, (o) => { if (o.side === s.side) return; const d = Math.hypot(o.x - s.x, o.z - s.z); if (d < bd) { bd = d; best = o; } });
    return best;
  }

  // ---------- AI oddziałów ----------
  squadAI(sq, dt, auto) {
    const T = TYPES[sq.type], alive = this.alive(sq);
    if (!alive.length) return;
    // morale: duże straty -> ucieczka
    if (!T.siege && !sq.routed && alive.length < sq.size0 * 0.33 && this.enemyNear(sq, 25)) { sq.routed = true; sq.routT = 12; sq.order = null; }
    if (sq.routed) {
      sq.withdraw = 0;
      sq.routT -= dt;
      const S = SIDES[sq.side];
      const [cx, cz] = this.center(sq);
      sq.ax = cx; sq.az = cz + (S.home - cz > 0 ? 1 : -1) * T.run * dt * 3;
      if (sq.routT <= 0) { sq.routed = false; sq.size0 = alive.length; sq.ax = cx; sq.az = cz; }
      return;
    }
    let o = sq.order;
    // samoobrona: oddział bez rozkazu atakuje wroga, który podszedł blisko
    const idle = !o || (o.type === 'move' && (o.reached || Math.hypot(o.x - sq.ax, o.z - sq.az) < 3));
    if (idle && !auto && this.enemyNear(sq, 35)) { const t = this.nearestSquad(sq); if (t) o = sq.order = { type: 'attack', squad: t, auto: true }; }
    if (o && o.type === 'attack' && this.alive(o.squad).length === 0) o = sq.order = null;
    if (!o && auto) {
      sq.aiT -= dt;
      if (sq.aiT <= 0 || !o) {
        sq.aiT = 2;
        const t = this.nearestSquad(sq);
        o = sq.order = t ? { type: 'attack', squad: t, auto: true } : null;
      }
    }
    if (!o) return;
    let tx = sq.ax, tz = sq.az, wantFacing = sq.facing, speed = T.walk;
    if (o.type === 'move') { tx = o.x; tz = o.z; if (o.run) speed = T.run; if (o.facing !== undefined && Math.hypot(tx - sq.ax, tz - sq.az) < 2) wantFacing = o.facing; }
    else if (o.type === 'attack') {
      const [ex, ez] = this.center(o.squad);
      const d = Math.hypot(ex - sq.ax, ez - sq.az);
      if (T.range) { const near = T.minRange ? T.minRange + 15 : 30; if (d > T.range * 0.85) { tx = ex; tz = ez; } else if (d < near) { tx = sq.ax - (ex - sq.ax) / d * 20; tz = sq.az - (ez - sq.az) / d * 20; } }
      else { tx = ex; tz = ez; if (d < (T.mount ? 130 : 40) || o.run) speed = T.run; }
      wantFacing = Math.atan2(ex - sq.ax, ez - sq.az);
      // jazda: po kilku sekundach zwarcia odskakuje i szarżuje ponownie
      if (T.mount) {
        if (sq.withdraw > 0) {
          sq.withdraw -= dt;
          tx = sq.ax - (ex - sq.ax) / (d || 1) * 40; tz = sq.az - (ez - sq.az) / (d || 1) * 40; speed = T.run;
          wantFacing = Math.atan2(tx - sq.ax, tz - sq.az);
        } else if (d < 12) { sq.melee = (sq.melee || 0) + dt; if (sq.melee > 7) { sq.melee = 0; sq.withdraw = 5; } }
      }
    } else if (o.type === 'follow' && o.soldier) {
      const p = o.soldier;
      tx = p.x - Math.sin(p.yaw) * 6; tz = p.z - Math.cos(p.yaw) * 6;
      if (Math.hypot(tx - sq.ax, tz - sq.az) > 12) speed = T.run;
      wantFacing = p.yaw;
    }
    const dx = tx - sq.ax, dz = tz - sq.az, d = Math.hypot(dx, dz);
    if (d > 1) {
      const step = Math.min(d, speed * dt * (this.field.water(sq.ax, sq.az) ? 0.4 : 1));
      sq.ax += (dx / d) * step; sq.az += (dz / d) * step;
      if (o.type === 'move' && d > 3) wantFacing = Math.atan2(dx, dz);
    } else if (o.type === 'move' && !o.reached) { o.reached = true; }
    sq.facing += wrap(wantFacing - sq.facing) * Math.min(1, dt * 1.5);
    sq.ax = Math.max(-MW / 2 + 5, Math.min(MW / 2 - 5, sq.ax)); sq.az = Math.max(-MD / 2 + 5, Math.min(MD / 2 - 5, sq.az));
  }
  enemyNear(sq, r) { const [x, z] = this.center(sq); let f = false; this.near(x, z, r, (o) => { if (o.side !== sq.side) f = true; }); return f; }
  nearestSquad(sq) {
    let best = null, bd = Infinity;
    const [x, z] = this.center(sq);
    for (const o of this.squads) {
      if (o.side === sq.side || !this.alive(o).length) continue;
      const [ox, oz] = this.center(o), d = Math.hypot(ox - x, oz - z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // ---------- żołnierze ----------
  soldierAI(s, dt) {
    const sq = s.sq, T = TYPES[s.type];
    s.look -= dt; s.cd -= dt; s.anim = Math.max(0, s.anim - dt * 2.5);
    const o = sq.order;
    const engaged = o && o.type === 'attack' && !sq.routed;
    if (s.look <= 0) {
      s.look = 0.3 + Math.random() * 0.3;
      const r = sq.routed || sq.withdraw > 0 || T.siege ? 0 : s.type === 'bow' ? 6 : engaged ? (T.mount ? 22 : 16) : 7;
      s.target = r ? this.nearestEnemy(s, r) : null;
    }
    if (s.target && (s.target.state !== 'alive' || sq.withdraw > 0)) s.target = null;
    let gx, gz, speed = T.walk * 1.4;
    if (s.target) {
      const t = s.target, d = Math.hypot(t.x - s.x, t.z - s.z);
      s.yaw += wrap(Math.atan2(t.x - s.x, t.z - s.z) - s.yaw) * Math.min(1, dt * 8);
      if (d > T.reach * 0.85) { gx = t.x - (t.x - s.x) / d * T.reach * 0.7; gz = t.z - (t.z - s.z) / d * T.reach * 0.7; speed = T.run; }
      else { gx = s.x; gz = s.z; }
      if (d <= T.reach && s.cd <= 0) {
        s.cd = T.cd * rnd(0.85, 1.2); s.anim = 1;
        const charging = T.charge && s.momentum > 0.35;
        if (charging || Math.random() < 0.68) {
          let dmg = T.dmg * rnd(0.8, 1.2);
          if (T.firstStrike && t.type !== 'spear' && d > TYPES[t.type].reach) dmg *= T.firstStrike;
          if (s.type === 'spear' && TYPES[t.type].mount) dmg *= ANTI_CAV;
          if (charging) { dmg *= T.charge; s.momentum = 0; this.charges = (this.charges || 0) + 1; }
          this.damage(t, dmg, s);
        }
        if (this.onHit && Math.random() < 0.25) this.onHit(s);
      }
    } else {
      const p = this.slotPos(sq, s);
      gx = p[0]; gz = p[1];
      // łucznik, któremu swoi zasłaniają płaski tor, odsuwa się w bok
      if (s.dodge) { s.dodgeT -= dt; if (s.dodgeT <= 0) s.dodge = 0; gx += Math.cos(sq.facing) * s.dodge; gz -= Math.sin(sq.facing) * s.dodge; }
      if (sq.routed) speed = T.run;
      else if (Math.hypot(gx - s.x, gz - s.z) > (o && o.run ? 1.2 : 6)) speed = T.run;
      // łucznicy strzelają do celu oddziału
      if (s.type === 'bow' && o && o.type === 'attack' && s.cd <= 0 && !sq.routed) {
        const tgts = this.alive(o.squad);
        if (tgts.length) {
          // cel bez swoich tuż obok (nie strzela w kłębowisko)
          let t = null;
          for (let k = 0; k < 5 && !t; k++) { const c = tgts[(Math.random() * tgts.length) | 0]; if (!this.friendNear(c.x, c.z, s.side, 2.6 * K)) t = c; }
          const d = t ? Math.hypot(t.x - s.x, t.z - s.z) : Infinity;
          if (!t) s.cd = 0.5;
          else if (d < T.range) {
            if (this.shootArrow(s, t)) { s.cd = rnd(...T.reload); s.anim = 1; }
            else { s.cd = 0.6; if (!s.dodge) { s.dodge = (Math.random() < 0.5 ? -1 : 1) * rnd(1.2, 2.6) * K; s.dodgeT = rnd(3, 6); } }
          }
        }
      }
      // katapulta: kamień w losowego żołnierza celu
      s.shotT = (s.shotT ?? 99) + dt;
      if (T.siege && o && o.type === 'attack' && s.cd <= 0) {
        let tgts = this.alive(o.squad).filter((c) => !this.friendNear(c.x, c.z, s.side, T.splash + 0.04 * Math.hypot(c.x - s.x, c.z - s.z) + 3));
        if (!tgts.length) tgts = this.soldiers.filter((c) => c.side !== s.side && c.state === 'alive' && Math.abs(wrap(Math.atan2(c.x - s.x, c.z - s.z) - s.yaw)) < 0.25 && !this.friendNear(c.x, c.z, s.side, T.splash + 0.04 * Math.hypot(c.x - s.x, c.z - s.z) + 3));
        if (!tgts.length) s.cd = 1;
        else {
          const t = tgts[(Math.random() * tgts.length) | 0];
          const d = Math.hypot(t.x - s.x, t.z - s.z);
          if (d < T.range && d > T.minRange && Math.abs(wrap(Math.atan2(t.x - s.x, t.z - s.z) - s.yaw)) < 0.25) { s.cd = rnd(...T.reload); s.shotT = 0; this.launchStone(s, t); }
          else s.cd = 0.4;
        }
      }
      if (T.siege && o && o.type === 'attack') { const [ex, ez] = this.center(o.squad); s.aimYaw = Math.atan2(ex - s.x, ez - s.z); }
      else s.aimYaw = undefined;
    }
    const dx = gx - s.x, dz = gz - s.z, d = Math.hypot(dx, dz);
    let vx = 0, vz = 0;
    if (d > 0.3) {
      const sp = Math.min(d / dt, speed * (this.field.water(s.x, s.z) ? 0.45 : 1));
      vx = (dx / d) * sp; vz = (dz / d) * sp;
      if (!s.target) s.yaw += wrap(Math.atan2(dx, dz) - s.yaw) * Math.min(1, dt * (T.siege ? 1.5 : 6));
    } else if (!s.target) s.yaw += wrap((s.aimYaw ?? sq.facing) - s.yaw) * Math.min(1, dt * (T.siege ? 1 : 3));
    // rozpychanie
    const rad = (t) => (TYPES[t].siege ? 2.2 * K : TYPES[t].mount ? 1.3 * K : 0.75 * K);
    const rs = rad(s.type);
    this.near(s.x, s.z, 2.9 * K, (o2) => {
      if (o2 === s) return;
      const ox = s.x - o2.x, oz = s.z - o2.z, dd = Math.hypot(ox, oz), r = Math.max(rs, rad(o2.type));
      if (dd < r && dd > 1e-4) { const f = (r - dd) / dd * 3; vx += ox * f; vz += oz * f; }
    });
    s.vx = vx; s.vz = vz;
    if (T.charge) s.momentum = Math.hypot(vx, vz) > T.run * 0.6 ? 1 : Math.max(0, s.momentum - dt * 1.2);
    s.x += vx * dt; s.z += vz * dt;
    s.x = Math.max(-MW / 2 + 1, Math.min(MW / 2 - 1, s.x)); s.z = Math.max(-MD / 2 + 1, Math.min(MD / 2 - 1, s.z));
    s.phase += Math.hypot(vx, vz) * dt * (T.mount ? 0.9 : 2);
  }

  damage(t, dmg, from) {
    if (t.state !== 'alive') return;
    t.hp -= dmg;
    if (from && from.isPlayer && t.side !== from.side && this.onPlayerDealt) this.onPlayerDealt(t, dmg, t.hp <= 0);
    if (t.isPlayer && this.onPlayerHit) this.onPlayerHit(dmg, from);
    if (t.hp <= 0) {
      t.state = 'dead'; t.t = 0;
      const dx = t.x - (from?.x ?? t.x), dz = t.z - (from?.z ?? t.z), d = Math.hypot(dx, dz) || 1;
      t.fall.set(dx / d, 0, dz / d);
      this.fx.smoke.spawn({ p: new THREE.Vector3(t.x, this.field.heightAt(t.x, t.z) + 1.5, t.z), v: new THREE.Vector3(0, 1.5, 0), life: 0.8, s0: 0.5, s1: 1.4, c0: 0x7a1a14, c1: 0x4a2a20, drag: 0.5 });
      if (this.onDeath) this.onDeath(t);
    }
  }

  // ---------- strzały ----------
  // prędkość startowa dla kąta el (rad); null gdy nie da się dorzucić prędkością ≤ vmax
  velForAngle(from, to, el, vmax) {
    const dx = to.x - from.x, dz = to.z - from.z, d = Math.max(1, Math.hypot(dx, dz)), h = to.y - from.y;
    const den = 2 * Math.cos(el) ** 2 * (d * Math.tan(el) - h);
    if (den <= 0) return null;
    const v = Math.sqrt((G * d * d) / den);
    if (v > vmax) return null;
    const c = Math.cos(el);
    return { v: new THREE.Vector3((dx / d) * c * v, Math.sin(el) * v, (dz / d) * c * v), T: d / (v * c) };
  }
  // najniższy kąt przy pełnej sile naciągu
  lowAngle(from, to) {
    const dx = to.x - from.x, dz = to.z - from.z, d = Math.max(1, Math.hypot(dx, dz)), h = to.y - from.y, v2 = ARROW_V * ARROW_V;
    const disc = v2 * v2 - G * (G * d * d + 2 * h * v2);
    return disc < 0 ? null : Math.atan((v2 - Math.sqrt(disc)) / (G * d));
  }
  // czy tor strzału omija swoich (próbki co ~1 m aż do celu)
  pathClear(s, from, v, T) {
    const F = this.field, n = Math.ceil(T * v.length() / (0.9 * K));
    for (let k = 1; k < n; k++) {
      const t = (k / n) * T, x = from.x + v.x * t, z = from.z + v.z * t, y = from.y + v.y * t - 0.5 * G * t * t;
      if (Math.hypot(x - from.x, z - from.z) < 0.5 * K) continue;
      if (y - F.heightAt(x, z) > 3.2 * K) continue;   // wysoko nad głowami
      let blocked = false;
      this.near(x, z, 2.4 * K, (o) => {
        if (blocked || o === s || o.side !== s.side || o.state !== 'alive') return;
        const tp = TYPES[o.type], r = (tp.siege ? 1.8 : tp.mount ? 1.25 : 0.8) * K, top = (tp.siege ? 2.6 : tp.mount ? 2.9 : 2.0) * K;
        if (Math.hypot(o.x - x, o.z - z) < r && y < F.heightAt(o.x, o.z) + top) blocked = true;
      });
      if (blocked) return false;
    }
    return true;
  }
  // strzał jak najpłaściej, ale ponad głowami swoich; false = brak czystego toru
  shootArrow(s, t) {
    const F = this.field;
    const from = new THREE.Vector3(s.x, F.heightAt(s.x, s.z) + 1.5 * K, s.z);
    let to = new THREE.Vector3(t.x, F.heightAt(t.x, t.z) + 1.0 * K, t.z);
    let el0 = this.lowAngle(from, to);
    if (el0 === null) return false;
    const first = this.velForAngle(from, to, el0 + 1e-4, ARROW_V * 1.001);
    if (first) to = new THREE.Vector3(t.x + t.vx * first.T, to.y, t.z + t.vz * first.T);
    el0 = this.lowAngle(from, to);
    if (el0 === null) return false;
    let sol = null;
    for (let el = el0 + 1e-4; el <= MAX_LOFT; el += 0.045) {
      const c = this.velForAngle(from, to, el, ARROW_V * 1.001);
      if (c && this.pathClear(s, from, c.v, c.T)) { sol = c; break; }
    }
    if (!sol) return false;
    const spread = 0.015;
    sol.v.applyAxisAngle(this._up, rnd(-spread, spread)).multiplyScalar(rnd(0.99, 1.01));
    this.fire(from, sol.v, s.side, s);
    return true;
  }
  launchStone(s, t) {
    const F = this.field, T = TYPES[s.type];
    const from = new THREE.Vector3(s.x + Math.sin(s.yaw) * 0.6 * K, F.heightAt(s.x, s.z) + 3.6 * K, s.z + Math.cos(s.yaw) * 0.6 * K);
    const d = Math.hypot(t.x - s.x, t.z - s.z), err = 0.03 * d + 2;
    const to = new THREE.Vector3(t.x + rnd(-err, err), 0, t.z + rnd(-err, err));
    to.y = F.heightAt(to.x, to.z);
    const sol = this.velForAngle(from, to, 0.75, 200);
    if (!sol) return;
    this.arrows.push({ pos: from, vel: sol.v, side: s.side, shooter: s, t: 0, stuck: false, stone: true, spin: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize() });
    if (this.onLaunch) this.onLaunch(from);
  }
  stoneImpact(a) {
    const F = this.field, R = TYPES.cat.splash;
    this.near(a.pos.x, a.pos.z, R, (o) => {
      if (o.state !== 'alive') return;
      const d = Math.hypot(o.x - a.pos.x, o.z - a.pos.z);
      if (d > R) return;
      let dmg = TYPES.cat.stone * (1 - d / R * 0.7) * rnd(0.8, 1.2);
      if (TYPES[o.type].armor) dmg *= 0.6;
      this.damage(o, dmg, a.shooter);
    });
    for (let k = 0; k < 14; k++) this.fx.smoke.spawn({ p: a.pos.clone().add(new THREE.Vector3(rnd(-1, 1), 0.3, rnd(-1, 1))), v: new THREE.Vector3(rnd(-4, 4), rnd(2, 6), rnd(-4, 4)), life: rnd(1.2, 2.4), s0: 0.6, s1: 2.4, c0: 0x6a5a44, c1: 0xa89a82, drag: 0.35, g: 2 });
    if (this.onImpact) this.onImpact(a.pos);
  }
  fire(from, vel, side, shooter) { this.arrows.push({ pos: from.clone(), vel: vel.clone(), side, shooter, t: 0, stuck: false }); }

  updateArrows(dt) {
    const F = this.field;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.t += dt;
      if (a.stuck) { if (a.t > 10) this.arrows.splice(i, 1); continue; }
      // lot w pod-krokach po ~0,5 m, żeby strzała nie "przeskoczyła" żołnierza
      const n = Math.max(1, Math.ceil((a.vel.length() * dt) / 0.5)), h = dt / n;
      let done = false;
      for (let k = 0; k < n && !done; k++) {
        a.vel.y -= G * h;
        a.pos.addScaledVector(a.vel, h);
        let hit = null;
        this.near(a.pos.x, a.pos.z, 1.2 * K, (s) => {
          if (hit || s === a.shooter || s.state !== 'alive' || (s.side === a.side && a.t < 0.08)) return;
          const sy = F.heightAt(s.x, s.z), m = TYPES[s.type].mount;
          const sg = TYPES[s.type].siege;
          if (Math.hypot(s.x - a.pos.x, s.z - a.pos.z) < (sg ? 1.6 : m ? 1.05 : 0.6) * K && a.pos.y > sy && a.pos.y < sy + (sg ? 2.4 : m ? 2.7 : 1.8) * K) hit = s;
        });
        if (hit && a.stone) hit = null;      // kamień rani dopiero przy upadku
        if (hit) {
          let dmg = TYPES.bow.arrow * rnd(0.8, 1.2);
          // tarcza: strzała z przodu dużo słabsza
          if (TYPES[hit.type].barding) dmg *= TYPES[hit.type].barding;
          if (TYPES[hit.type].armor) dmg *= TYPES[hit.type].armor;
          if (TYPES[hit.type].shield) { const f = Math.sin(hit.yaw) * -a.vel.x + Math.cos(hit.yaw) * -a.vel.z; if (f > 0.3 * a.vel.length()) dmg *= 0.25; }
          this.damage(hit, dmg, a.shooter);
          this.arrows.splice(i, 1);
          done = true; break;
        }
        const g = F.heightAt(a.pos.x, a.pos.z);
        if (!F.inside(a.pos.x, a.pos.z)) { this.arrows.splice(i, 1); done = true; break; }
        if (a.pos.y <= g) {
          if (a.stone) { a.pos.y = g; this.stoneImpact(a); a.stuck = true; a.t = 0; a.pos.y = g + 0.2 * K; done = true; break; }
          a.stuck = true; a.t = 0; a.pos.y = g; done = true;
        }
      }
      if (!done && a.t > 12) this.arrows.splice(i, 1);
    }
  }

  // atak gracza: cios w stożku przed nim
  playerStrike(p, dirX, dirZ) {
    const T = TYPES[p.type];
    let hits = 0;
    const reach = (p.type === 'bow' ? 1.7 : T.reach / K) * K * 1.1;
    this.near(p.x, p.z, reach + 1, (o) => {
      if (o.side === p.side || o.state !== 'alive') return;
      const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz);
      if (d > reach || (dx * dirX + dz * dirZ) / (d || 1) < 0.45) return;
      let dmg = T.dmg * 1.25;
      if (p.type === 'spear' && TYPES[o.type].mount) dmg *= ANTI_CAV;
      if (T.charge && Math.hypot(p.vx, p.vz) > T.run * 0.45) dmg *= T.charge;
      this.damage(o, dmg, p); hits++;
    });
    return hits;
  }

  // trafienie bronią gracza (fizyczny kontakt w VR); power ~ prędkość zamachu
  playerHit(p, o, power = 1) {
    const T = TYPES[p.type];
    let dmg = T.dmg * (0.7 + 0.6 * power) * 1.25;
    if (p.type === 'spear' && TYPES[o.type].mount) dmg *= ANTI_CAV;
    if (T.charge && Math.hypot(p.vx, p.vz) > T.run * 0.45) dmg *= T.charge;
    this.damage(o, dmg, p);
  }

  update(dt, running) {
    this.buildGrid();
    if (running) {
      this.time += dt;
      for (const sq of this.squads) this.squadAI(sq, dt, sq.auto || sq.side === 1);
      for (const s of this.soldiers) { if (s.state === 'alive' && !s.isPlayer) this.soldierAI(s, dt); else s.t += dt; }
      this.updateArrows(dt);
    }
    this.soldiers = this.soldiers.filter((s) => !(s.state === 'dead' && s.t > 90));
    for (const sq of this.squads) sq.soldiers = sq.soldiers.filter((s) => !(s.state === 'dead' && s.t > 90));
  }

  // piechota jako model rycerza: klatki animacji (dwa poziomy szczegółów) + tarcza
  useKnight(hi, lo) {
    const CAP = 1200, mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mk = (data) => data.frames.map((g) => {
      const m = new THREE.InstancedMesh(g, mat, CAP);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, new THREE.Color()); m.castShadow = true; m.frustumCulled = false; m.count = 0;
      this.parent.add(m); return m;
    });
    const shield = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.72, 0.56).scale(K, K, K), new THREE.MeshLambertMaterial({ color: 0xffffff }), CAP);
    shield.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shield.setColorAt(0, new THREE.Color()); shield.castShadow = true; shield.frustumCulled = false; shield.count = 0;
    this.parent.add(shield);
    this.knight = { sets: { hi: mk(hi), lo: mk(lo) }, hands: hi.hands, shield, buckets: new Array(RUN_FRAMES + 1).fill(0), ns: 0 };
  }
  drawKnight(s, sel, i) {
    const F = this.field, kn = this.knight;
    let y = F.heightAt(s.x, s.z);
    this._q.setFromAxisAngle(this._up, s.yaw);
    this._c.setRGB(1, 1, 1).lerp(SIDES[s.side].color, 0.8).multiplyScalar(2.0);
    if (sel.has(s.sq)) this._c.lerp(new THREE.Color(1, 1, 0.55), 0.4);
    let f = IDLE;
    if (s.state === 'dead') {
      this._v.set(s.fall.z, 0, -s.fall.x);
      this._q2.setFromAxisAngle(this._v, Math.min(1, s.t / 0.4) * Math.PI / 2);
      this._q.premultiply(this._q2);
      y += 0.12 * K;
      this._c.multiplyScalar(0.45);
    } else if (Math.hypot(s.vx, s.vz) > 0.4 && !(s.anim > 0)) f = Math.floor((((s.phase / 8.4) % 1) + 1) % 1 * RUN_FRAMES) % RUN_FRAMES;
    this._p.set(s.x, y, s.z);
    this._m.compose(this._p, this._q, this._s);
    const mesh = kn.sets[this.lod][f], bi = kn.buckets[f]++;
    mesh.setMatrixAt(bi, this._m); mesh.setColorAt(bi, this._c);
    const side = this._c.copy(SIDES[s.side].color);
    // tarcza miecznika w lewej dłoni (w barwach strony)
    const hand = kn.hands[f];
    if (s.type === 'sword') {
      const ns = kn.ns++;
      if (s.state === 'dead') this._m.makeScale(0, 0, 0);
      else this._m.compose(this._p.clone().add(hand.l.clone().add(new THREE.Vector3(0.07 * K, 0.02 * K, 0.1 * K)).applyQuaternion(this._q)), this._q, this._s);
      kn.shield.setMatrixAt(ns, this._m); kn.shield.setColorAt(ns, side);
    }
    // broń w dłoni
    const sw = s.anim > 0 ? Math.sin(s.anim * Math.PI) : 0, wq = new THREE.Quaternion();
    let off;
    if (s.type === 'sword') { wq.setFromAxisAngle(this._x, -0.9 + sw * 1.8); off = hand.r.clone(); }
    else if (s.type === 'spear') { wq.setFromAxisAngle(this._x, 0.15); off = hand.r.clone().add(new THREE.Vector3(0, 0.05 * K, (-0.45 + sw * 0.6) * K)); }
    else { wq.setFromAxisAngle(this._up, 0.15); off = hand.l.clone().add(new THREE.Vector3(0, 0.05 * K, 0.05 * K)); }
    if (s.state === 'dead') this._m.makeScale(0, 0, 0);
    else this._m.compose(this._p.clone().add(off.applyQuaternion(this._q)), this._q.clone().multiply(wq), this._s);
    const M = this.meshes[s.type];
    M.weap.setMatrixAt(i, this._m); M.weap.setColorAt(i, this._c.set(0xffffff));
  }

  render(selected, hidePlayer) {
    const F = this.field, counts = {};
    const sel = selected instanceof Set ? selected : new Set(selected ? [selected] : []);
    for (const t of Object.keys(TYPES)) counts[t] = 0;
    const kn = this.knight;
    if (kn) { kn.buckets.fill(0); kn.ns = 0; }
    for (const s of this.soldiers) {
      if (hidePlayer && s.isPlayer) continue;
      const M = this.meshes[s.type], i = counts[s.type]++;
      if (i >= 600) continue;
      if (kn && !TYPES[s.type].mount && !TYPES[s.type].siege) { this.drawKnight(s, sel, i); continue; }
      let y = F.heightAt(s.x, s.z);
      this._q.setFromAxisAngle(this._up, s.yaw);
      this._c.copy(SIDES[s.side].color);
      if (sel.has(s.sq)) this._c.lerp(new THREE.Color(1, 1, 0.6), 0.35);
      if (s.state === 'dead' && TYPES[s.type].siege) this._c.multiplyScalar(0.3);
      else if (s.state === 'dead') {
        this._v.set(s.fall.z, 0, -s.fall.x);
        this._q2.setFromAxisAngle(this._v, Math.min(1, s.t / 0.4) * Math.PI / 2);
        this._q.premultiply(this._q2);
        y += 0.15 * K;
        this._c.multiplyScalar(0.45);
      } else if (!TYPES[s.type].siege) y += Math.abs(Math.sin(s.phase)) * (TYPES[s.type].mount ? 0.14 : 0.06) * K;
      this._p.set(s.x, y, s.z);
      this._m.compose(this._p, this._q, this._s);
      M.body.setMatrixAt(i, this._m); M.body.setColorAt(i, this._c);
      // broń: pivot w prawym barku, zamach wokół osi X
      const sw = s.anim > 0 ? Math.sin(s.anim * Math.PI) : 0;
      const wq = new THREE.Quaternion();
      let off;
      if (s.type === 'sword') { wq.setFromAxisAngle(this._x, -0.9 + sw * 1.8); off = new THREE.Vector3(0.33 * K, 1.35 * K, 0.05 * K); }
      else if (s.type === 'spear') { wq.setFromAxisAngle(this._x, 0.15); off = new THREE.Vector3(0.3 * K, 1.25 * K, (-0.5 + sw * 0.6) * K); }
      else if (s.type === 'cat') {
        // ramię: wyrzut w 0,3 s, potem powolne naciąganie
        const st = s.shotT ?? 99, rel = TYPES.cat.reload[0] * 0.8;
        const a = st < 0.3 ? 0.28 + (st / 0.3) * 1.7 : Math.max(0.28, 1.98 - ((st - 0.3) / rel) * 1.7);
        wq.setFromAxisAngle(this._x, a); off = new THREE.Vector3(0, 1.25 * K, 0.15 * K);
      }
      else if (s.type === 'cav') { wq.setFromAxisAngle(this._x, s.momentum > 0.35 ? 0.04 : -0.35 + sw * 0.4); off = new THREE.Vector3(0.32 * K, 2.12 * K, (-0.3 + sw * 0.7) * K); }
      else { wq.setFromAxisAngle(this._up, 0.15); off = new THREE.Vector3(-0.32 * K, 1.25 * K, 0.1 * K); }
      if (s.state === 'dead' && s.type !== 'cat') { this._m.makeScale(0, 0, 0); }
      else { const q = this._q.clone().multiply(wq); this._m.compose(this._p.clone().add(off.applyQuaternion(this._q)), q, this._s); }
      M.weap.setMatrixAt(i, this._m); M.weap.setColorAt(i, this._c.set(0xffffff));
    }
    for (const t of Object.keys(TYPES)) { const M = this.meshes[t]; M.body.count = M.weap.count = Math.min(600, counts[t]); if (kn && !TYPES[t].mount && !TYPES[t].siege) M.body.count = 0; for (const m of [M.body, M.weap]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; } }
    if (kn) {
      for (const lod of ['hi', 'lo']) kn.sets[lod].forEach((m, f) => { m.visible = lod === this.lod; m.count = lod === this.lod ? kn.buckets[f] : 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
      kn.shield.count = kn.ns; kn.shield.instanceMatrix.needsUpdate = true; kn.shield.instanceColor.needsUpdate = true;
    }
    let n = 0, ns = 0;
    for (const a of this.arrows) {
      if (a.stone) {
        if (ns >= 200) continue;
        this._q.setFromAxisAngle(a.spin, a.t * 5);
        this._m.compose(a.pos, this._q, this._s);
        this.stoneMesh.setMatrixAt(ns++, this._m);
        continue;
      }
      if (n >= 1500) break;
      this._q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._v.copy(a.vel).normalize());
      this._m.compose(a.pos, this._q, this._s);
      this.arrowMesh.setMatrixAt(n++, this._m);
    }
    this.arrowMesh.count = n; this.arrowMesh.instanceMatrix.needsUpdate = true;
    this.stoneMesh.count = ns; this.stoneMesh.instanceMatrix.needsUpdate = true;
    for (const sq of this.squads) {
      const alive = this.alive(sq);
      sq.banner.visible = alive.length > 0;
      if (!alive.length) continue;
      const [cx, cz] = this.center(sq);
      sq.banner.position.set(cx, F.heightAt(cx, cz), cz);
      sq.banner.rotation.y = sq.facing + Math.PI / 2;
      sq.banner.userData.flag.scale.setScalar(sel.has(sq) ? 1.5 : 1);
    }
  }
}
