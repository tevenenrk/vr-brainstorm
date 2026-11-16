import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_W, SPAWN_Z, WATER_LEVEL, OPTS } from './config.js';

const CAP = 480;
const ALIVE_COLOR = new THREE.Color(0.72, 0.2, 0.14);
const DEAD_COLOR = new THREE.Color(0.22, 0.12, 0.1);

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
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
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
    this.soldiers = [];
    this.onHouseDestroyed = null;
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
    this.queue = [];
    this.waveTimer = 6;
    this.waveElapsed = 0;
    this.waveActive = false;
  }

  get aliveCount() { let n = 0; for (const s of this.soldiers) if (s.state === 'alive') n++; return n; }

  startWave() {
    this.wave++;
    const n = this.wave, d = OPTS.difficulty;
    const squads = Math.min(1 + n + d, 12);
    const per = Math.min(4 + n + d, 14);
    const speed = Math.min((16 + n * 0.8) * (0.85 + 0.15 * d), 30);
    for (let k = 0; k < squads; k++) {
      this.queue.push({ at: k * (6 - d) + Math.random() * 2, cx: (Math.random() * 2 - 1) * (MAP_W / 2 - 90), per, speed });
    }
    this.queue.sort((a, b) => a.at - b.at);
    this.waveElapsed = 0;
    this.waveActive = true;
  }

  spawnSquad(q) {
    const cols = 4;
    const pref = Math.random();
    for (let i = 0; i < q.per && this.soldiers.length < CAP; i++) {
      const ox = ((i % cols) - (cols - 1) / 2) * 16 + (Math.random() - 0.5) * 6;
      const oz = -Math.floor(i / cols) * 16 + (Math.random() - 0.5) * 6;
      this.soldiers.push({
        x: Math.max(-MAP_W / 2 + 15, Math.min(MAP_W / 2 - 15, q.cx + ox)),
        z: SPAWN_Z + oz, ox, oz,
        speed: q.speed * (0.9 + Math.random() * 0.2),
        yaw: 0, phase: Math.random() * 10, state: 'alive', t: 0,
        fall: new THREE.Vector3(1, 0, 0), wob: Math.random() * 100,
        crossed: false, bridge: null, leg: 0, rethink: 0, house: null, pref, attacking: false,
      });
    }
  }

  chooseBridge(s) {
    let best = null, bd = Infinity;
    for (const b of this.terrain.bridges) {
      if (b.destroyed) continue;
      const d = Math.hypot(b.entry.x - s.x, b.entry.z - s.z) + s.pref * 120 * ((b.entry.x > 0) ? 1 : -1);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
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

  blast(p, R) {
    let killed = 0;
    for (const s of this.soldiers) {
      if (s.state !== 'alive') continue;
      const dx = s.x - p.x, dz = s.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > R) continue;
      let prob = d < R * 0.5 ? 1 : 1 - ((d - R * 0.5) / (R * 0.5)) * 0.8;
      if (this.terrain.isForest(s.x, s.z)) prob *= 0.6;
      if (Math.random() > prob) continue;
      s.state = 'dying'; s.t = 0;
      if (d > 0.1) s.fall.set(dx / d, 0, dz / d); else s.fall.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
      s.knock = (1 - d / R) * 30;
      killed++;
    }
    this.kills += killed;
    return killed;
  }

  update(dt, running) {
    if (running) {
      if (!this.waveActive) {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) this.startWave();
      } else {
        this.waveElapsed += dt;
        while (this.queue.length && this.queue[0].at <= this.waveElapsed) this.spawnSquad(this.queue.shift());
        if (!this.queue.length && (this.aliveCount === 0 || this.waveElapsed > 170)) {
          this.waveActive = false;
          this.waveTimer = this.aliveCount === 0 ? 8 : 0.1;
        }
      }
    }

    const T = this.terrain;
    let n = 0;
    for (let i = 0; i < this.soldiers.length; i++) {
      const s = this.soldiers[i];
      if (s.state === 'alive' && running) this.think(s, dt);
      else if (s.state === 'dying') {
        s.t += dt;
        if (s.t < 0.4 && s.knock) { s.x += s.fall.x * s.knock * dt * 2.5; s.z += s.fall.z * s.knock * dt * 2.5; }
        if (s.t > 14) s.state = 'gone';
      }
      if (s.state === 'gone') continue;

      const deck = T.bridgeDeckAt(s.x, s.z);
      let y = deck !== null && s.state === 'alive' ? Math.max(deck, T.heightAt(s.x, s.z)) : T.heightAt(s.x, s.z);
      this._q.setFromAxisAngle(this._up, s.yaw);
      if (s.state === 'alive') {
        y += s.attacking ? Math.abs(Math.sin(this.wavePhase(s) * 3)) * 1.5 : Math.abs(Math.sin(s.phase)) * 0.9;
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
  }

  wavePhase(s) { s.phase += 0.05; return s.phase; }

  think(s, dt) {
    const T = this.terrain;
    s.rethink -= dt;
    s.attacking = false;
    const rz = T.riverZ(s.x);
    if (!s.crossed && s.z > rz + 45) { s.crossed = true; s.bridge = null; }
    let gx, gz, arrive = 0;
    if (!s.crossed) {
      if (s.bridge && s.bridge.destroyed) { s.bridge = null; s.leg = 0; }
      if (!s.bridge && s.rethink <= 0) { s.bridge = this.chooseBridge(s); s.leg = 0; s.rethink = 1.5; }
      if (s.bridge) {
        const b = s.bridge, ex = s.leg === 0 ? b.entry : b.exit;
        const far = Math.hypot(ex.x - s.x, ex.z - s.z);
        // przed mostem oddział się zwęża, na moście idą gęsiego
        const spread = s.leg === 0 ? Math.min(1, far / 300) : 0;
        gx = ex.x + s.ox * spread + Math.sin(s.wob + s.z / 140) * 20 * spread;
        gz = ex.z + (s.leg === 0 ? -8 : 8);
        if (far < 14) { if (s.leg === 0) s.leg = 1; else { s.crossed = true; s.bridge = null; } }
      } else {
        gx = s.x + Math.sin(s.wob + s.z / 140) * 25; gz = rz + 120; // brak mostów — w bród
      }
    } else {
      if (!s.house || s.house.destroyed || s.rethink <= 0) { s.house = this.chooseHouse(s); s.rethink = 2.5; }
      if (!s.house) return;
      gx = s.house.x + s.ox * 0.3; gz = s.house.z + s.oz * 0.3; arrive = 15;
    }
    let dx = gx - s.x, dz = gz - s.z;
    const len = Math.hypot(dx, dz) || 1;
    if (arrive && len < arrive) {
      // atak na dom
      s.attacking = true;
      s.yaw = Math.atan2(dx, dz);
      const h = s.house;
      h.hp -= dt;
      if (h.hp <= 0 && T.destroyHouse(T.home, h) && this.onHouseDestroyed) this.onHouseDestroyed(h);
      return;
    }
    dx /= len; dz /= len;
    // omijanie wody (jezioro, staw, rzeka poza mostem) — w bród tylko, gdy nie ma mostów
    const wade = !s.crossed && !s.bridge;
    if (!wade && len > 30) {
      const wet = (ddx, ddz) => {
        for (const r of [12, 28]) {
          const px = s.x + ddx * r, pz = s.z + ddz * r;
          if (T.heightAt(px, pz) < 1 && T.bridgeDeckAt(px, pz) === null) return true;
        }
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
    const onDeck = T.bridgeDeckAt(s.x, s.z) !== null;
    if (!onDeck && h < WATER_LEVEL - 0.5) f = 0.3;
    else if (!onDeck) {
      const ahead = T.heightAt(s.x + dx * 8, s.z + dz * 8);
      const grade = (ahead - h) / 8;
      if (grade > 0) f *= Math.max(0.35, 1 - grade * 2.2);
      if (T.isForest(s.x, s.z)) f *= 0.75;
    }
    const v = s.speed * f;
    s.x += dx * v * dt; s.z += dz * v * dt;
    s.x = Math.max(-MAP_W / 2 + 5, Math.min(MAP_W / 2 - 5, s.x));
    const wantYaw = Math.atan2(dx, dz);
    let dy = wantYaw - s.yaw;
    dy = ((dy + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    s.yaw += dy * Math.min(1, dt * 4);
    s.phase += dt * v * 0.45;
  }
}
