import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP_W, SPAWN_Z, BREACH_Z, BATTERY_Z, WATER_LEVEL } from './config.js';

const CAP = 420;
const ALIVE_COLOR = new THREE.Color(0.72, 0.2, 0.14);
const DEAD_COLOR = new THREE.Color(0.22, 0.12, 0.1);

function soldierGeometry() {
  const parts = [
    new THREE.BoxGeometry(1.3, 4.6, 1.5).translate(-0.9, 2.3, 0),   // nogi
    new THREE.BoxGeometry(1.3, 4.6, 1.5).translate(0.9, 2.3, 0),
    new THREE.BoxGeometry(3.8, 4.4, 2.2).translate(0, 6.7, 0),      // tułów
    new THREE.BoxGeometry(1.0, 3.8, 1.0).translate(-2.3, 6.6, 0.4), // ręce
    new THREE.BoxGeometry(1.0, 3.8, 1.0).translate(2.3, 6.6, 0.4),
    new THREE.SphereGeometry(1.45, 8, 6).translate(0, 10.0, 0),     // głowa
    new THREE.SphereGeometry(1.85, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 10.3, 0), // hełm
    new THREE.BoxGeometry(0.5, 0.6, 7).rotateX(-0.6).translate(1.4, 7.6, 1.4), // karabin
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
    this.breaches = 0;
    this.queue = [];
    this.waveTimer = 6;       // odliczanie do następnej fali
    this.waveElapsed = 0;
    this.waveActive = false;
  }

  get aliveCount() { return this.soldiers.filter((s) => s.state === 'alive').length; }

  startWave() {
    this.wave++;
    const n = this.wave;
    const squads = Math.min(2 + n, 9);
    const per = Math.min(5 + n, 12);
    const speed = Math.min(13 + n * 0.9, 24);
    for (let k = 0; k < squads; k++) {
      this.queue.push({ at: k * 5 + Math.random() * 2, cx: (Math.random() * 2 - 1) * (MAP_W / 2 - 90), per, speed });
    }
    this.queue.sort((a, b) => a.at - b.at);
    this.waveElapsed = 0;
    this.waveActive = true;
  }

  spawnSquad(q) {
    const cols = 4;
    for (let i = 0; i < q.per && this.soldiers.length < CAP; i++) {
      const ox = ((i % cols) - (cols - 1) / 2) * 16 + (Math.random() - 0.5) * 6;
      const oz = -Math.floor(i / cols) * 16 + (Math.random() - 0.5) * 6;
      this.soldiers.push({
        x: Math.max(-MAP_W / 2 + 15, Math.min(MAP_W / 2 - 15, q.cx + ox)),
        z: SPAWN_Z + oz,
        lane: q.cx + ox,
        speed: q.speed * (0.9 + Math.random() * 0.2),
        yaw: 0, phase: Math.random() * 10, state: 'alive', t: 0,
        fall: new THREE.Vector3(1, 0, 0), wob: Math.random() * 100,
      });
    }
  }

  // wybuch: zwraca liczbę zabitych
  blast(p, R) {
    let killed = 0;
    for (const s of this.soldiers) {
      if (s.state !== 'alive') continue;
      const dx = s.x - p.x, dz = s.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > R) continue;
      let prob = d < R * 0.5 ? 1 : 1 - ((d - R * 0.5) / (R * 0.5)) * 0.8;
      if (this.terrain.isForest(s.x, s.z)) prob *= 0.6; // las daje osłonę
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
      // fale
      if (!this.waveActive) {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) this.startWave();
      } else {
        this.waveElapsed += dt;
        while (this.queue.length && this.queue[0].at <= this.waveElapsed) this.spawnSquad(this.queue.shift());
        if (!this.queue.length && (this.aliveCount === 0 || this.waveElapsed > 140)) {
          this.waveActive = false;
          this.waveTimer = this.aliveCount === 0 ? 6 : 0.1;
        }
      }
    }

    const T = this.terrain;
    let n = 0;
    for (let i = 0; i < this.soldiers.length; i++) {
      const s = this.soldiers[i];
      if (s.state === 'alive' && running) {
        const prog = Math.min(1, Math.max(0, (BATTERY_Z - s.z) / (BATTERY_Z - SPAWN_Z)));
        const gx = s.lane * (0.25 + 0.75 * prog) + Math.sin(s.wob + s.z / 140) * 25;
        let dx = gx - s.x, dz = BATTERY_Z - s.z;
        const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
        const h = T.heightAt(s.x, s.z);
        let f = 1;
        if (h < WATER_LEVEL - 0.5) f = 0.32;           // brodzenie / przeprawa
        else {
          const ahead = T.heightAt(s.x + dx * 8, s.z + dz * 8);
          const grade = (ahead - h) / 8;
          if (grade > 0) f *= Math.max(0.35, 1 - grade * 2.2);
          if (T.isForest(s.x, s.z)) f *= 0.75;
        }
        const v = s.speed * f;
        s.x += dx * v * dt; s.z += dz * v * dt;
        const wantYaw = Math.atan2(dx, dz);
        s.yaw += (wantYaw - s.yaw) * Math.min(1, dt * 4);
        s.phase += dt * v * 0.45;
        if (s.z > BREACH_Z) { s.state = 'gone'; this.breaches++; continue; }
      } else if (s.state === 'dying') {
        s.t += dt;
        if (s.t < 0.4 && s.knock) { s.x += s.fall.x * s.knock * dt * 2.5; s.z += s.fall.z * s.knock * dt * 2.5; }
        if (s.t > 12) s.state = 'gone';
      }
      if (s.state === 'gone') continue;

      // macierz instancji
      let y = T.heightAt(s.x, s.z);
      this._q.setFromAxisAngle(this._up, s.yaw);
      if (s.state === 'alive') {
        y += Math.abs(Math.sin(s.phase)) * 0.9;
        this._c.copy(ALIVE_COLOR);
      } else {
        const a = Math.min(1, s.t / 0.35) * Math.PI / 2;
        this._ax.set(s.fall.z, 0, -s.fall.x);
        this._q2.setFromAxisAngle(this._ax, a);
        this._q.premultiply(this._q2);
        if (s.t < 0.35) y += Math.sin((s.t / 0.35) * Math.PI) * 4;
        if (s.t > 9) y -= (s.t - 9) * 2.5;
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
}
