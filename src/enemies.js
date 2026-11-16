import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_W, SPAWN_Z, WATER_LEVEL, OPTS } from './config.js';

const CAP = 520;
const TANK_CAP = 80;
const ALIVE_COLOR = new THREE.Color(0.72, 0.2, 0.14);
const DEAD_COLOR = new THREE.Color(0.22, 0.12, 0.1);
const TANK_COLOR = new THREE.Color(0.62, 0.3, 0.22);
const TANK_DMG_COLOR = new THREE.Color(0.75, 0.45, 0.2);
const WRECK_COLOR = new THREE.Color(0.16, 0.14, 0.13);
const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);

function soldierGeometry() {
  const parts = [
    new THREE.BoxGeometry(1.3, 4.6, 1.5).translate(-0.9, 2.3, 0),
    new THREE.BoxGeometry(1.3, 4.6, 1.5).translate(0.9, 2.3, 0),
    new THREE.BoxGeometry(3.8, 4.4, 2.2).translate(0, 6.7, 0),
    new THREE.BoxGeometry(1.0, 3.8, 1.0).translate(-2.3, 6.6, 0.4),
    new THREE.BoxGeometry(1.0, 3.8, 1.0).translate(2.3, 6.6, 0.4),
    new THREE.SphereGeometry(1.45, 8, 6).translate(0, 10.0, 0),
    new THREE.SphereGeometry(1.85, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 10.3, 0),
    new THREE.BoxGeometry(0.5, 0.6, 7).rotateX(-0.6).translate(1.4, 7.6, 1.4),
  ];
  return mergeGeometries(parts.map(nonIdx));
}

// czołg: przód w +Z; gąsienice ciemniejsze (kolor wierzchołków), reszta barwiona kolorem instancji
function tankGeometry() {
  const colored = (g, c) => {
    g = nonIdx(g);
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c; arr[i * 3 + 1] = c; arr[i * 3 + 2] = c; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  };
  const parts = [
    colored(new THREE.BoxGeometry(3.4, 4.2, 22).translate(-6.2, 2.1, 0), 0.32),   // gąsienice
    colored(new THREE.BoxGeometry(3.4, 4.2, 22).translate(6.2, 2.1, 0), 0.32),
    colored(new THREE.BoxGeometry(10, 4, 20).translate(0, 4.6, 0), 1),             // kadłub
    colored(new THREE.BoxGeometry(12.5, 0.8, 21).translate(0, 4.6, 0), 0.85),      // błotniki
    colored(new THREE.CylinderGeometry(4.4, 5.2, 3.6, 8).translate(0, 8.4, -1), 1), // wieża
    colored(new THREE.CylinderGeometry(0.75, 0.9, 15, 8).rotateX(Math.PI / 2).translate(0, 8.6, 10.5), 0.7), // lufa
    colored(new THREE.BoxGeometry(1.6, 1.4, 1.6).translate(1.8, 10.8, -2), 0.8),   // właz
  ];
  return mergeGeometries(parts);
}

export class Enemies {
  constructor(terrain, mapGroup) {
    this.terrain = terrain;
    this.mesh = new THREE.InstancedMesh(soldierGeometry(), new THREE.MeshLambertMaterial({ flatShading: true }), CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, ALIVE_COLOR);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    mapGroup.add(this.mesh);
    this.tankMesh = new THREE.InstancedMesh(tankGeometry(), new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true }), TANK_CAP);
    this.tankMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tankMesh.setColorAt(0, TANK_COLOR);
    this.tankMesh.castShadow = true; this.tankMesh.receiveShadow = true;
    this.tankMesh.frustumCulled = false;
    this.tankMesh.count = 0;
    mapGroup.add(this.tankMesh);
    this.soldiers = [];
    this.onHouseDestroyed = null;
    this.onTankDestroyed = null;
    this.reset();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._ax = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._c = new THREE.Color();
  }

  reset() {
    this.soldiers.length = 0;
    this.wave = 0;
    this.kills = 0;
    this.tankKills = 0;
    this.queue = [];
    this.time = 0;
    this.waveTimer = 8;     // odliczanie do automatycznej następnej fali
  }

  get aliveCount() { let n = 0; for (const s of this.soldiers) if (s.state === 'alive' && !s.tank) n++; return n; }
  get tankCount() { let n = 0; for (const s of this.soldiers) if (s.state === 'alive' && s.tank) n++; return n; }
  get pendingSpawns() { return this.queue.length; }

  // nowa fala — można wywołać w dowolnym momencie, także gdy poprzednia trwa
  startWave() {
    this.wave++;
    const n = this.wave, d = OPTS.difficulty;
    const squads = Math.min(1 + n + d, 12);
    const per = Math.min(4 + n + d, 14);
    const speed = Math.min((16 + n * 0.8) * (0.85 + 0.15 * d), 30);
    const tanks = Math.min(Math.max(0, n - 1 + Math.max(0, d - 1)), 10);
    const gap = 6 - d;
    for (let k = 0; k < squads; k++) {
      this.queue.push({ at: this.time + k * gap + Math.random() * 2, cx: (Math.random() * 2 - 1) * (MAP_W / 2 - 90), per, speed });
    }
    for (let k = 0; k < tanks; k++) {
      this.queue.push({ at: this.time + 3 + k * gap * 1.3 + Math.random() * 2, cx: (Math.random() * 2 - 1) * (MAP_W / 2 - 80), tank: true, speed: speed * 0.7 });
    }
    this.queue.sort((a, b) => a.at - b.at);
    this.waveTimer = 150; // kolejna fala sama przyjdzie najpóźniej za 150 s
  }

  newSoldier(x, z, extra) {
    return {
      x, z, ox: 0, oz: 0, yaw: 0, phase: Math.random() * 10, state: 'alive', t: 0,
      fall: new THREE.Vector3(1, 0, 0), wob: Math.random() * 100, rethink: 0, house: null,
      pref: Math.random(), attacking: false, tank: false, ...extra,
    };
  }

  spawn(q) {
    if (q.tank) {
      if (this.soldiers.filter((s) => s.tank).length >= TANK_CAP) return;
      this.soldiers.push(this.newSoldier(q.cx, SPAWN_Z, { tank: true, hp: 3, speed: q.speed, smoke: 0 }));
      return;
    }
    const cols = 4;
    const pref = Math.random();
    for (let i = 0; i < q.per && this.soldiers.length < CAP; i++) {
      const ox = ((i % cols) - (cols - 1) / 2) * 16 + (Math.random() - 0.5) * 6;
      const oz = -Math.floor(i / cols) * 16 + (Math.random() - 0.5) * 6;
      this.soldiers.push(this.newSoldier(
        Math.max(-MAP_W / 2 + 15, Math.min(MAP_W / 2 - 15, q.cx + ox)), SPAWN_Z + oz,
        { ox, oz, pref, speed: q.speed * (0.9 + Math.random() * 0.2) },
      ));
    }
  }

  chooseHouse(s) {
    let best = null, bd = Infinity;
    for (const h of this.terrain.home.houses) {
      if (h.destroyed) continue;
      const d = Math.hypot(h.x - s.x, h.z - s.z) + (s.pref - 0.5) * 80;
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  kill(s, fromX, fromZ, R) {
    const dx = s.x - fromX, dz = s.z - fromZ, d = Math.hypot(dx, dz);
    s.state = 'dying'; s.t = 0;
    if (d > 0.1) s.fall.set(dx / d, 0, dz / d); else s.fall.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    s.knock = Math.max(0, (1 - d / R)) * 30;
    if (s.tank) { this.tankKills++; if (this.onTankDestroyed) this.onTankDestroyed(s); } else this.kills++;
  }

  damageTank(s, dmg, fx, fz) {
    s.hp -= dmg;
    if (s.hp <= 0) { this.kill(s, fx, fz, 1); return true; }
    return false;
  }

  // wybuch: R — promień rażenia piechoty; tankKill — promień zniszczenia czołgu; tankHit — promień uszkodzenia
  blast(p, R, tankKill = 12, tankHit = 26, tankDmg = 1) {
    let killed = 0;
    for (const s of this.soldiers) {
      if (s.state !== 'alive') continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (s.tank) {
        if (d < tankKill) { this.damageTank(s, 99, p.x, p.z); killed++; } else if (d < tankHit && this.damageTank(s, tankDmg, p.x, p.z)) killed++;
        continue;
      }
      if (d > R) continue;
      let prob = d < R * 0.5 ? 1 : 1 - ((d - R * 0.5) / (R * 0.5)) * 0.8;
      if (this.terrain.isForest(s.x, s.z)) prob *= 0.6;
      if (Math.random() > prob) continue;
      this.kill(s, p.x, p.z, R);
      killed++;
    }
    return killed;
  }

  // strefa ognia (amunicja zapalająca)
  burn(p, R, dt) {
    let killed = 0;
    for (const s of this.soldiers) {
      if (s.state !== 'alive' || Math.hypot(s.x - p.x, s.z - p.z) > R) continue;
      if (s.tank) {
        s.burnT = (s.burnT || 0) + dt;
        if (s.burnT > 4) { s.burnT = 0; if (this.damageTank(s, 1, p.x, p.z)) killed++; }
      } else if (Math.random() < dt * 0.9) { this.kill(s, p.x, p.z, R); killed++; }
    }
    return killed;
  }

  // fala uderzeniowa atomówki: niszczy wszystko w pierścieniu [r0, r1]
  shock(p, r0, r1) {
    let killed = 0;
    for (const s of this.soldiers) {
      if (s.state !== 'alive') continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d >= r0 && d < r1) { if (s.tank) this.damageTank(s, 99, p.x, p.z); else this.kill(s, p.x, p.z, r1 * 0.3); killed++; }
    }
    return killed;
  }

  update(dt, running) {
    if (running) {
      this.time += dt;
      while (this.queue.length && this.queue[0].at <= this.time) this.spawn(this.queue.shift());
      // automatycznie: kolejna fala po wybiciu wszystkich albo po upływie czasu
      if (!this.queue.length && this.aliveCount + this.tankCount === 0 && this.waveTimer > 8) this.waveTimer = 8;
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.startWave();
    }

    const T = this.terrain;
    let n = 0, nt = 0;
    for (let i = 0; i < this.soldiers.length; i++) {
      const s = this.soldiers[i];
      if (s.state === 'alive' && running) this.think(s, dt);
      else if (s.state === 'dying') {
        s.t += dt;
        if (!s.tank && s.t < 0.4 && s.knock) { s.x += s.fall.x * s.knock * dt * 2.5; s.z += s.fall.z * s.knock * dt * 2.5; }
        if (s.t > (s.tank ? 30 : 14)) s.state = 'gone';
      }
      if (s.state === 'gone') continue;

      let y = T.heightAt(s.x, s.z);
      this._q.setFromAxisAngle(this._up, s.yaw);
      if (s.tank) {
        // nachylenie czołgu do terenu
        const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
        const pitch = Math.atan2(T.heightAt(s.x + fx * 9, s.z + fz * 9) - T.heightAt(s.x - fx * 9, s.z - fz * 9), 18);
        this._ax.set(fz, 0, -fx);
        this._q2.setFromAxisAngle(this._ax, -pitch);
        this._q.premultiply(this._q2);
        if (s.state === 'alive') this._c.copy(TANK_COLOR).lerp(TANK_DMG_COLOR, (3 - s.hp) / 3 * 0.6);
        else { this._c.copy(WRECK_COLOR); if (s.t > 26) y -= (s.t - 26) * 3; }
        this._p.set(s.x, y - 0.5, s.z);
        this._m.compose(this._p, this._q, this._s);
        this.tankMesh.setMatrixAt(nt, this._m);
        this.tankMesh.setColorAt(nt, this._c);
        nt++;
        continue;
      }
      if (s.state === 'alive') {
        y += s.attacking ? Math.abs(Math.sin(s.phase * 3)) * 1.5 : Math.abs(Math.sin(s.phase)) * 0.9;
        this._c.copy(ALIVE_COLOR);
      } else {
        const a = Math.min(1, s.t / 0.35) * Math.PI / 2;
        this._ax.set(s.fall.z, 0, -s.fall.x);
        this._q2.setFromAxisAngle(this._ax, a);
        this._q.premultiply(this._q2);
        if (s.t < 0.35) y += Math.sin((s.t / 0.35) * Math.PI) * 4;
        if (s.t > 11) y -= (s.t - 11) * 2.5;
        this._c.copy(ALIVE_COLOR).lerp(DEAD_COLOR, Math.min(1, s.t / 1.5));
      }
      this._p.set(s.x, y, s.z);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(n, this._m);
      this.mesh.setColorAt(n, this._c);
      n++;
    }
    this.soldiers = this.soldiers.filter((s) => s.state !== 'gone');
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.tankMesh.count = nt;
    this.tankMesh.instanceMatrix.needsUpdate = true;
    this.tankMesh.instanceColor.needsUpdate = true;
  }

  think(s, dt) {
    const T = this.terrain;
    s.rethink -= dt;
    s.attacking = false;
    if (!s.house || s.house.destroyed || s.rethink <= 0) { s.house = this.chooseHouse(s); s.rethink = 2.5; }
    if (!s.house) return;
    const gx = s.house.x + s.ox * 0.3 + (s.tank ? 0 : Math.sin(s.wob + s.z / 140) * 25 * Math.min(1, Math.abs(s.house.z - s.z) / 800));
    const gz = s.house.z + s.oz * 0.3;
    let dx = gx - s.x, dz = gz - s.z;
    const len = Math.hypot(dx, dz) || 1;
    const reach = s.tank ? 60 : 15; // czołg strzela z dystansu
    if (len < reach) {
      s.attacking = true;
      if (s.tank) {
        let dy = Math.atan2(dx, dz) - s.yaw;
        dy = ((dy + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        s.yaw += dy * Math.min(1, dt * 2);
      } else s.yaw = Math.atan2(dx, dz);
      const h = s.house;
      h.hp -= dt * (s.tank ? 3 : 1);
      s.phase += dt * 4;
      if (h.hp <= 0 && T.destroyHouse(T.home, h) && this.onHouseDestroyed) this.onHouseDestroyed(h);
      return;
    }
    dx /= len; dz /= len;
    // omijanie wody (jezioro, staw)
    if (len > 30) {
      const wet = (ddx, ddz) => {
        for (const r of [12, 28]) if (T.heightAt(s.x + ddx * r, s.z + ddz * r) < 1) return true;
        return false;
      };
      if (wet(dx, dz)) {
        s.avoidT = 3;
        const side = s.avoidSide || (s.avoidSide = Math.random() < 0.5 ? 1 : -1);
        for (const a of [0.45, 0.9, 1.35, 1.8, -0.45, -0.9, -1.35, -1.8]) {
          const aa = a * side, c = Math.cos(aa), sn = Math.sin(aa);
          const ndx = dx * c + dz * sn, ndz = -dx * sn + dz * c;
          if (!wet(ndx, ndz)) { dx = ndx; dz = ndz; break; }
        }
      } else if ((s.avoidT = (s.avoidT || 0) - dt) <= 0) s.avoidSide = 0;
    }
    const h = T.heightAt(s.x, s.z);
    let f = 1;
    if (h < WATER_LEVEL - 0.5) f = 0.3;
    else {
      const ahead = T.heightAt(s.x + dx * 8, s.z + dz * 8);
      const grade = (ahead - h) / 8;
      if (grade > 0) f *= Math.max(s.tank ? 0.5 : 0.35, 1 - grade * (s.tank ? 1.4 : 2.2));
      if (T.isForest(s.x, s.z)) f *= s.tank ? 0.6 : 0.75;
    }
    const v = s.speed * f;
    s.x += dx * v * dt; s.z += dz * v * dt;
    s.x = Math.max(-MAP_W / 2 + 5, Math.min(MAP_W / 2 - 5, s.x));
    let dy = Math.atan2(dx, dz) - s.yaw;
    dy = ((dy + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    s.yaw += dy * Math.min(1, dt * (s.tank ? 1.5 : 4));
    s.phase += dt * v * 0.45;
  }
}
