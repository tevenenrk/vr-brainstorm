import * as THREE from 'three';
import { shockRadius } from '../effects.js';
import { W, DAM, VOLCANO, coastX, lerp, smoothstep } from './world.js';

const G = 9.81;
const rnd = (a = 1) => (Math.random() * 2 - 1) * a;
const SNOW = new THREE.Color(0.96, 0.97, 1);
const ROCK = new THREE.Color(0.45, 0.38, 0.3);
const SCORCH = new THREE.Color(0.1, 0.09, 0.08);
const ASH = new THREE.Color(0.42, 0.41, 0.4);

// Bazowa klasa scenariusza katastrofy. ctx: world, water, lava, agents, fx, fire, sound, shake, flash, darken, haptic, msg, start
class Scenario {
  constructor(ctx, p) { this.ctx = ctx; this.p = p ? p.clone() : null; this.t = 0; this.done = false; this.seaOffset = 0; this.fluidSpeed = 1; }
  dangers() { return []; }
  update() {}
  dispose() {}
}

// ---------- system pożarów (wspólny dla wszystkich scenariuszy) ----------
export class FireSystem {
  constructor(ctx) { this.ctx = ctx; this.burning = []; this.acc = 0; this.extent = null; }
  igniteTree(t) {
    if (t.state !== 'ok') return false;
    if (!this.ctx.world.setTree(t, 'burning')) return false;
    t.burnDur = 9 + Math.random() * 9;
    this.burning.push(t);
    return true;
  }
  igniteNear(x, z, r) {
    let n = 0;
    this.ctx.world.treesNear(x, z, r, (t) => { if (this.igniteTree(t)) n++; });
    for (const b of this.ctx.world.buildings) if (Math.hypot(b.x - x, b.z - z) < r + Math.max(b.w, b.d) / 2 && this.ctx.world.ignite(b)) n++;
    return n;
  }
  update(dt) {
    const { world, fx, agents } = this.ctx;
    this.acc += dt;
    if (this.acc >= 0.25) {
      const step = this.acc; this.acc = 0;
      const next = [];
      let sx = 0, sz = 0;
      for (const t of this.burning) {
        t.t += step;
        if (t.t > t.burnDur) {
          world.setTree(t, 'burnt');
          world.paint(t.x, t.z, 14, SCORCH, 0.5);
          continue;
        }
        world.placeTree(t);
        next.push(t); sx += t.x; sz += t.z;
        // rozprzestrzenianie (wiatr z zachodu)
        world.treesNear(t.x, t.z, 34, (o, d) => {
          if (o.state !== 'ok' || d < 1) return;
          const wind = 1 + 0.9 * ((o.x - t.x) / d);
          if (Math.random() < 0.075 * step * 4 * wind * (1 - d / 34)) this.igniteTree(o);
        });
        if (Math.random() < 0.05) {
          for (const b of world.buildings) if (b.state === 'ok' && Math.hypot(b.x - t.x, b.z - t.z) < 22 + Math.max(b.w, b.d) / 2) world.ignite(b);
        }
        if (Math.random() < 0.1) agents.hitRadius(t.x, t.z, 14, 'burnt', 0.5);
      }
      this.burning = next;
      if (next.length) {
        const cx = sx / next.length, cz = sz / next.length;
        let r = 0;
        for (const t of next) r = Math.max(r, Math.hypot(t.x - cx, t.z - cz));
        this.extent = { x: cx, z: cz, r: r + 140 };
      } else this.extent = null;
    }
    // płomienie i dym
    const n = Math.min(this.burning.length, 30);
    for (let k = 0; k < n; k++) {
      const t = this.burning[(Math.random() * this.burning.length) | 0];
      const top = t.y + 14 * t.s;
      fx.fire.spawn({ p: new THREE.Vector3(t.x + rnd(3), top - 4 + Math.random() * 6, t.z + rnd(3)), v: new THREE.Vector3(rnd(3), 10 + Math.random() * 10, rnd(3)), life: 0.5 + Math.random() * 0.4, s0: 4 + Math.random() * 3, s1: 1, c0: Math.random() < 0.5 ? 0xffc060 : 0xff5a10, c1: 0x200000, drag: 0.5 });
      if (k % 4 === 0) fx.smoke.spawn({ p: new THREE.Vector3(t.x, top + 4, t.z), v: new THREE.Vector3(8 + rnd(3), 14 + Math.random() * 8, rnd(3)), life: 4 + Math.random() * 3, s0: 5, s1: 22, c0: 0x2e2a28, c1: 0x8a8682, drag: 0.6 });
    }
    // płonące budynki
    for (const b of world.active) {
      if (b.state !== 'burning' || Math.random() > 0.6) continue;
      fx.fire.spawn({ p: new THREE.Vector3(b.x + rnd(b.w / 2), b.y + b.h + Math.random() * 4, b.z + rnd(b.d / 2)), v: new THREE.Vector3(rnd(3), 12 + Math.random() * 12, rnd(3)), life: 0.6, s0: 6, s1: 1.5, c0: 0xffb050, c1: 0x200000, drag: 0.5 });
      if (Math.random() < 0.25) fx.smoke.spawn({ p: new THREE.Vector3(b.x, b.y + b.h + 6, b.z), v: new THREE.Vector3(6, 16, rnd(3)), life: 5, s0: 6, s1: 26, c0: 0x2a2624, c1: 0x7d7a76, drag: 0.6 });
    }
  }
  reset() { this.burning.length = 0; this.extent = null; }
}

// ---------- lawina (śnieżna albo skalna) ----------
export class Avalanche extends Scenario {
  constructor(ctx, p, opts = {}) {
    super(ctx, p);
    const w = ctx.world;
    this.rock = !!opts.rock;
    this.name = this.rock ? 'Osuwisko' : 'Lawina';
    let ox = p.x, oz = p.z;
    if (!this.rock && w.heightAt(ox, oz) < 170) {
      let best = -Infinity;
      for (let dz = -600; dz <= 600; dz += 25) for (let dx = -600; dx <= 600; dx += 25) {
        const x = p.x + dx, z = p.z + dz;
        if (!w.inside(x, z)) continue;
        const h = w.heightAt(x, z);
        const sc = (h > 180 && w.volcanoCone(x, z) < 0.3 ? h : -1e3) - Math.hypot(dx, dz) * 0.35;
        if (sc > best) { best = sc; ox = x; oz = z; }
      }
    }
    this.o = { x: ox, z: oz };
    const N = this.rock ? 110 : 480, R = this.rock ? 45 : 110;
    this.chunks = [];
    for (let k = 0; k < N; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
      this.chunks.push({ x: ox + Math.cos(a) * r, z: oz + Math.sin(a) * r, vx: 0, vz: 0, s: (this.rock ? 3.5 : 7) + Math.random() * (this.rock ? 4 : 8), delay: Math.random() * 3, moved: 0, done: false, chk: Math.random() * 0.3 });
    }
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: this.rock ? 0x7a6a58 : 0xf4f7ff, flatShading: true }), N);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    w.group.add(this.mesh);
    if (!this.rock) w.addHeight(ox, oz, R * 0.9, -5);
    ctx.sound('rumble', new THREE.Vector3(ox, w.heightAt(ox, oz), oz), 1.2);
    ctx.msg(this.rock ? 'Osuwisko skalne!' : 'LAWINA!', this.rock ? '#d8b48a' : '#e8f4ff');
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
  }
  dangers() { return this.c ? [{ x: this.c.x, z: this.c.z, r: 260 }] : []; }
  update(dt) {
    this.t += dt;
    const { world: w, agents, fx } = this.ctx;
    let alive = 0, sx = 0, sz = 0, n = 0;
    for (const c of this.chunks) {
      if (c.done) continue;
      alive++;
      if (this.t > c.delay) {
        const s = w.slopeAt(c.x, c.z);
        const fr = this.rock ? 0.5 : 0.22;
        c.vx += (-s.gx * G * 5.5 + rnd(1.5)) * dt; c.vz += (-s.gz * G * 5.5 + rnd(1.5)) * dt;
        const k = Math.max(0, 1 - dt * (fr + (s.s < 0.12 ? 1.6 : 0)));
        c.vx *= k; c.vz *= k;
        const sp = Math.hypot(c.vx, c.vz);
        if (sp > 75) { c.vx *= 75 / sp; c.vz *= 75 / sp; }
        c.x += c.vx * dt; c.z += c.vz * dt;
        c.moved += dt;
        if (!w.inside(c.x, c.z)) { c.done = true; continue; }
        if (c.moved > 1.5 && sp < 2.5) {
          w.addHeight(c.x, c.z, this.rock ? 10 : 15, this.rock ? 2 : 3.2, this.rock ? ROCK : SNOW, 1);
          c.done = true; continue;
        }
        c.chk -= dt;
        if (sp > 7 && c.chk <= 0) {
          c.chk = 0.3;
          agents.hitRadius(c.x, c.z, 12, 'buried');
          w.treesNear(c.x, c.z, 11, (t) => w.setTree(t, this.rock ? 'down' : 'buried', c.vx, c.vz));
          for (const b of w.buildings) if (Math.abs(b.x - c.x) < b.w / 2 + 6 && Math.abs(b.z - c.z) < b.d / 2 + 6) w.collapse(b, this.rock ? 'blast' : 'snow');
        }
        if (sp > 8 && Math.random() < (this.rock ? 0.12 : 0.3)) fx.smoke.spawn({ p: new THREE.Vector3(c.x, w.heightAt(c.x, c.z) + 6, c.z), v: new THREE.Vector3(c.vx * 0.5, 6 + Math.random() * 12, c.vz * 0.5), life: 2.5 + Math.random() * 1.5, s0: 8, s1: this.rock ? 18 : 30, c0: this.rock ? 0x8a7a66 : 0xffffff, c1: this.rock ? 0xb0a490 : 0xe8eef8, drag: 0.5 });
        sx += c.x; sz += c.z; n++;
      }
      const y = w.heightAt(c.x, c.z) + c.s * 0.6;
      this._q.setFromAxisAngle(this._v.set(0.3, 1, 0.2).normalize(), c.moved * 3);
      this._m.compose(this._v.set(c.x, y, c.z), this._q, this._s.setScalar(c.s));
      this.mesh.setMatrixAt(alive - 1, this._m);
    }
    this.mesh.count = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.c = n ? { x: sx / n, z: sz / n } : null;
    if (alive === 0 || this.t > 80) this.done = true;
  }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); }
}

// ---------- powódź ----------
export class Flood extends Scenario {
  constructor(ctx) {
    super(ctx, null);
    this.name = 'Powódź';
    this.src = { x: DAM.x + DAM.dx * 60, z: DAM.z + DAM.dz * 60, rate: 0 };
    ctx.water.sources.push(this.src);
    const N = 500;
    this.rain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 22, 0.7), new THREE.MeshBasicMaterial({ color: 0xbcd8f0, transparent: true, opacity: 0.55 }), N);
    this.rain.frustumCulled = false;
    this.drops = Array.from({ length: N }, () => ({ x: rnd(W / 2), z: rnd(W / 2), y: Math.random() * 500 }));
    ctx.world.group.add(this.rain);
    ctx.msg('Ulewa — poziom wód rośnie', '#9fd0ff');
    this._m = new THREE.Matrix4();
  }
  update(dt) {
    this.t += dt;
    const t = this.t, { water, world } = this.ctx;
    const raining = t < 70;
    water.rain = raining ? 0.01 : 0;
    this.src.rate = t < 80 ? 2500 : 0;
    this.seaOffset = t < 8 ? 0 : t < 60 ? lerp(0, 16, smoothstep(8, 60, t)) : t < 85 ? 16 : lerp(16, 0, smoothstep(85, 125, t));
    this.ctx.darken(raining ? 0.55 : Math.max(0, 0.55 - (t - 70) / 20));
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      d.y -= 320 * dt;
      if (d.y < world.surfaceAt(d.x, d.z) || !raining) { d.x = rnd(W / 2); d.z = rnd(W / 2); d.y = raining ? 380 + Math.random() * 200 : -500; }
      this._m.makeTranslation(d.x, d.y, d.z);
      this.rain.setMatrixAt(i, this._m);
    }
    this.rain.instanceMatrix.needsUpdate = true;
    if (t > 140) this.done = true;
  }
  dispose() {
    this.ctx.water.rain = 0;
    this.ctx.water.sources.splice(this.ctx.water.sources.indexOf(this.src), 1);
    this.rain.parent?.remove(this.rain);
    this.ctx.darken(0);
  }
}

// ---------- trzęsienie ziemi ----------
export class Earthquake extends Scenario {
  constructor(ctx, p) {
    super(ctx, p);
    this.name = 'Trzęsienie ziemi';
    const w = ctx.world;
    this.cracks = [];
    for (let k = 0; k < 4; k++) {
      let a = Math.random() * Math.PI * 2, x = p.x, z = p.z;
      const pts = [];
      for (let s = 0; s < 14; s++) { a += rnd(0.5); x += Math.cos(a) * 28; z += Math.sin(a) * 28; if (w.inside(x, z)) pts.push([x, z]); }
      this.cracks.push(pts);
    }
    this.crackIdx = 0; this.acc = 0; this.rumbleT = 0; this.slides = false;
    this.offshore = w.heightAt(p.x, p.z) < -5;
    this.damRisk = Math.exp(-Math.hypot(p.x - DAM.x, p.z - DAM.z) / 800) > 0.42;
    ctx.msg('TRZĘSIENIE ZIEMI!', '#ffd08a');
  }
  I() { const t = this.t; return t < 2 ? t / 2 : t < 10 ? 1 : Math.max(0, 1 - (t - 10) / 8); }
  dangers() { return this.t < 18 ? [{ x: this.p.x, z: this.p.z, r: 380 * this.I() }] : []; }
  update(dt) {
    this.t += dt;
    const { world: w, fx, agents } = this.ctx, I = this.I();
    this.ctx.shake(I * 10);
    this.rumbleT -= dt;
    if (this.rumbleT <= 0 && I > 0.2) { this.rumbleT = 3.5; this.ctx.sound('rumble', new THREE.Vector3(this.p.x, w.heightAt(this.p.x, this.p.z), this.p.z), 1.4 * I); this.ctx.haptic(0.5 * I, 300); }
    // szczeliny
    if (this.t > 1 && this.t < 8) {
      const want = Math.floor(((this.t - 1) / 7) * 14);
      while (this.crackIdx < want) {
        for (const c of this.cracks) if (c[this.crackIdx]) w.addHeight(c[this.crackIdx][0], c[this.crackIdx][1], 10, -4.5, new THREE.Color(0.16, 0.12, 0.09), 1);
        this.crackIdx++;
      }
    }
    // zawalenia budynków i drzew
    this.acc += dt;
    if (this.acc > 0.5) {
      this.acc = 0;
      for (const b of w.buildings) {
        if (b.state !== 'ok') continue;
        const local = I * Math.exp(-Math.hypot(b.x - this.p.x, b.z - this.p.z) / 450) * (0.45 + b.h / 70);
        if (Math.random() < Math.max(0, local - 0.15) * 0.4) w.collapse(b, 'quake');
      }
      for (let k = 0; k < 40; k++) {
        const t = w.trees[(Math.random() * w.trees.length) | 0];
        if (Math.random() < I * Math.exp(-Math.hypot(t.x - this.p.x, t.z - this.p.z) / 450) * 0.5) w.setTree(t, 'down', rnd(1), rnd(1));
      }
      if (Math.random() < I * 0.3) fx.smoke.spawn({ p: new THREE.Vector3(this.p.x + rnd(150), w.heightAt(this.p.x, this.p.z) + 5, this.p.z + rnd(150)), v: new THREE.Vector3(rnd(5), 6, rnd(5)), life: 4, s0: 8, s1: 26, c0: 0x9a8a78, c1: 0xc8beb0, drag: 0.5 });
    }
    // osuwiska na stromych zboczach
    if (!this.slides && this.t > 2.5) {
      this.slides = true;
      let made = 0;
      for (let k = 0; k < 400 && made < 3; k++) {
        const x = this.p.x + rnd(900), z = this.p.z + rnd(900);
        if (!w.inside(x, z) || w.heightAt(x, z) < 70 || w.slopeAt(x, z).s < 0.9) continue;
        this.ctx.start(new Avalanche(this.ctx, new THREE.Vector3(x, 0, z), { rock: true }));
        made++;
      }
    }
    if (this.damRisk && this.t > 6 && !w.damBroken) { this.damRisk = false; this.ctx.start(new DamBreak(this.ctx)); }
    if (this.offshore && this.t > 8) { this.offshore = false; this.ctx.start(new Tsunami(this.ctx)); }
    void agents;
    if (this.t > 20) this.done = true;
  }
}

// ---------- bomba atomowa ----------
export class Nuke extends Scenario {
  constructor(ctx, p) {
    super(ctx, p);
    this.name = 'Bomba atomowa';
    const w = ctx.world;
    ctx.fx.nuke(p);
    w.addHeight(p.x, p.z, 75, -24, new THREE.Color(0.18, 0.15, 0.12), 1);
    w.paint(p.x, p.z, 430, SCORCH, 0.6);
    ctx.flash(1);
    ctx.sound('nuke', p, 2.5);
    ctx.haptic(1, 700);
    ctx.msg('WYBUCH JĄDROWY', '#ff6a5a');
    this.r = 0; this.fires = false;
  }
  dangers() { return this.t < 25 ? [{ x: this.p.x, z: this.p.z, r: 1000 }] : []; }
  update(dt) {
    this.t += dt;
    const { world: w, agents } = this.ctx, p = this.p;
    if (this.t < 4.2) {
      const r = shockRadius(this.t, 760);
      agents.hitRing(p.x, p.z, this.r, Math.min(r, 720), this.r < 400 ? 'burnt' : 'dead');
      w.treesNear(p.x, p.z, Math.min(r, 620), (t, d) => {
        if (d < this.r) return;
        if (d < 380) w.setTree(t, 'burnt');
        w.setTree(t, 'down', t.x - p.x, t.z - p.z);
      });
      for (const b of w.buildings) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (d >= this.r && d < Math.min(r, 680)) w.collapse(b, d < 380 ? 'fire' : 'blast'); }
      this.r = r;
      this.ctx.shake(Math.max(0, 6 - this.t * 1.5));
    }
    if (!this.fires && this.t > 2) {
      this.fires = true;
      let n = 0;
      for (let k = 0; k < 600 && n < 14; k++) {
        const t = w.trees[(Math.random() * w.trees.length) | 0];
        const d = Math.hypot(t.x - p.x, t.z - p.z);
        if (d > 600 && d < 900 && this.ctx.fire.igniteTree(t)) n++;
      }
    }
    if (this.t > 36) this.done = true;
  }
}

// ---------- tsunami ----------
export class Tsunami extends Scenario {
  constructor(ctx) {
    super(ctx, null);
    this.name = 'Tsunami';
    this.fluidSpeed = 1.6;
    this.roar = false;
    ctx.msg('Morze się cofa…', '#9fd0ff');
  }
  dangers() { return this.t > 8 && this.t < 50 ? [{ x: coastX(0) + 150, z: 0, r: 900 }] : []; }
  update(dt) {
    this.t += dt;
    const t = this.t;
    // cofnięcie morza, potem krótki, wysoki impuls — fala biegnie w stronę lądu
    this.seaOffset = t < 10 ? lerp(0, -12, smoothstep(0, 9, t)) : t < 13.5 ? lerp(-12, 50, smoothstep(10, 13.5, t)) : t < 18 ? 50 : t < 21 ? lerp(50, 4, smoothstep(18, 21, t)) : lerp(4, 0, smoothstep(21, 40, t));
    if (!this.roar && t > 11) {
      this.roar = true;
      this.ctx.msg('TSUNAMI!', '#5fb0ff');
      this.ctx.sound('rumble', new THREE.Vector3(800, 0, 0), 2);
      this.ctx.haptic(0.6, 600);
    }
    if (t > 13 && t < 24) this.ctx.shake(1.5);
    if (t > 110) this.done = true;
  }
}

// ---------- pożar lasu ----------
export class ForestFire extends Scenario {
  constructor(ctx, p) {
    super(ctx, p);
    this.name = 'Pożar lasu';
    let n = ctx.fire.igniteNear(p.x, p.z, 40);
    if (!n) {
      let best = null, bd = Infinity;
      for (const t of ctx.world.trees) { const d = Math.hypot(t.x - p.x, t.z - p.z); if (t.state === 'ok' && d < bd) { bd = d; best = t; } }
      if (best) { ctx.fire.igniteNear(best.x, best.z, 30); this.p.set(best.x, 0, best.z); n = 1; }
    }
    ctx.msg(n ? 'Pożar lasu! Wiatr z zachodu' : 'Brak drzew w pobliżu', '#ffb070');
    if (!n) this.done = true;
  }
  update(dt) { this.t += dt; if (this.t > 3 && !this.ctx.fire.burning.length) this.done = true; }
}

// ---------- urwanie tamy ----------
export class DamBreak extends Scenario {
  constructor(ctx) {
    super(ctx, new THREE.Vector3(DAM.x, DAM.top, DAM.z));
    this.name = 'Urwanie tamy';
    if (ctx.world.damBroken) { ctx.msg('Tama jest już zniszczona', '#ffb070'); this.done = true; return; }
    ctx.world.damBroken = true;
    this.broken = false;
    ctx.msg('Tama pęka…', '#ffd08a');
    ctx.sound('rumble', this.p, 1.5);
  }
  dangers() { return this.t < 40 ? [{ x: DAM.x, z: DAM.z, r: 300 }] : []; }
  update(dt) {
    this.t += dt;
    const { world: w, fx } = this.ctx;
    const face = (k) => new THREE.Vector3(DAM.x + DAM.dx * (DAM.thick + 2) + DAM.nx * rnd(60), lerp(40, 85, Math.random()) * k + 30 * (1 - k), DAM.z + DAM.dz * (DAM.thick + 2) + DAM.nz * rnd(60));
    if (!this.broken) {
      this.ctx.shake(this.t);
      const k = this.t / 4;
      for (let i = 0; i < 1 + k * 4; i++) fx.smoke.spawn({ p: face(1), v: new THREE.Vector3(DAM.dx * (20 + Math.random() * 30), rnd(5), DAM.dz * (20 + Math.random() * 30)), life: 1.2, s0: 2 + k * 3, s1: 5, c0: 0xffffff, c1: 0xcfe6f5, g: 30, drag: 0.6 });
      if (this.t > 4) {
        this.broken = true;
        w.breakDam();
        this.ctx.resyncBed();
        this.ctx.sound('boom', this.p, 2);
        this.ctx.haptic(0.9, 500);
        this.ctx.msg('TAMA PĘKŁA!', '#5fb0ff');
        for (let i = 0; i < 40; i++) fx.smoke.spawn({ p: face(0.6), v: new THREE.Vector3(rnd(30) + DAM.dx * 30, 10 + Math.random() * 40, rnd(30) + DAM.dz * 30), life: 3 + Math.random() * 2, s0: 8, s1: 26, c0: 0xb0aca4, c1: 0xe0dcd6, drag: 0.5 });
      }
    } else if (this.t < 12) {
      for (let i = 0; i < 3; i++) fx.smoke.spawn({ p: face(0.3), v: new THREE.Vector3(DAM.dx * 40 + rnd(15), 15 + Math.random() * 20, DAM.dz * 40 + rnd(15)), life: 2, s0: 5, s1: 14, c0: 0xffffff, c1: 0xd8ecf8, g: 20, drag: 0.6 });
    }
    if (this.t > 160) this.done = true;
  }
}

// ---------- superwulkan ----------
export class Supervolcano extends Scenario {
  constructor(ctx) {
    super(ctx, new THREE.Vector3(VOLCANO.x, ctx.world.heightAt(VOLCANO.x, VOLCANO.z), VOLCANO.z));
    this.name = 'Superwulkan';
    this.phase = 0; this.bombs = []; this.pyro = []; this.boltT = 1; this.ashT = 0; this.r = 0;
    const w = ctx.world;
    this.bombMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3, 0), new THREE.MeshBasicMaterial({ color: 0xff7a30, toneMapped: false }), 80);
    this.bombMesh.frustumCulled = false; this.bombMesh.count = 0;
    this.bolt = new THREE.Mesh(new THREE.BoxGeometry(3, 380, 3), new THREE.MeshBasicMaterial({ color: 0xe8e8ff, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.bolt.visible = false;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd0a0, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    this.ring.visible = false;
    w.group.add(this.bombMesh, this.bolt, this.ring);
    ctx.msg('Wulkan się budzi… wstrząsy', '#ffb070');
    ctx.sound('rumble', this.p, 1.5);
    this._m = new THREE.Matrix4();
  }
  dangers() { return this.t > 6 && this.t < 120 ? [{ x: VOLCANO.x, z: VOLCANO.z, r: 1200 }] : []; }
  crater() { return new THREE.Vector3(VOLCANO.x + rnd(40), this.ctx.world.heightAt(VOLCANO.x, VOLCANO.z) + 10, VOLCANO.z + rnd(40)); }
  update(dt) {
    this.t += dt;
    const t = this.t, { world: w, fx, agents, lava } = this.ctx;
    if (t < 10) {
      this.ctx.shake(1 + t * 0.5);
      w.addHeight(VOLCANO.x, VOLCANO.z, 330, 1.6 * dt);
      if (Math.random() < 0.5) fx.smoke.spawn({ p: this.crater(), v: new THREE.Vector3(rnd(4), 25 + Math.random() * 20, rnd(4)), life: 6, s0: 10, s1: 35, c0: 0x6a6460, c1: 0xa09a94, drag: 0.7 });
      if (t > 5 && Math.random() < dt) this.ctx.sound('rumble', this.p, 1);
      return;
    }
    if (this.phase === 0) {
      this.phase = 1;
      this.ctx.flash(0.8);
      this.ctx.sound('nuke', this.p, 2.5);
      this.ctx.haptic(1, 800);
      this.ctx.msg('ERUPCJA SUPERWULKANU!', '#ff6a3a');
      w.addHeight(VOLCANO.x, VOLCANO.z, 130, -30, new THREE.Color(0.15, 0.12, 0.1), 1);
      this.ctx.resyncBed();
      lava.sources.push(this.lavaSrc = { x: VOLCANO.x, z: VOLCANO.z + 20, rate: 14000 });
      // spływy piroklastyczne
      for (let k = 0; k < 240; k++) {
        const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 30;
        this.pyro.push({ x: VOLCANO.x + Math.cos(a) * r, z: VOLCANO.z + Math.sin(a) * r, vx: Math.cos(a) * 45, vz: Math.sin(a) * 45, chk: Math.random() * 0.3, done: false });
      }
    }
    // fala uderzeniowa erupcji
    if (t < 14) {
      const r = shockRadius(t - 10, 600);
      this.ring.visible = true; this.ring.position.set(VOLCANO.x, w.heightAt(VOLCANO.x, VOLCANO.z) * 0.4, VOLCANO.z);
      this.ring.scale.setScalar(Math.max(1, r)); this.ring.material.opacity = Math.max(0, 1 - (t - 10) / 4);
      w.treesNear(VOLCANO.x, VOLCANO.z, Math.min(r, 520), (tr, d) => { if (d >= this.r) w.setTree(tr, 'down', tr.x - VOLCANO.x, tr.z - VOLCANO.z); });
      agents.hitRing(VOLCANO.x, VOLCANO.z, this.r, Math.min(r, 520), 'dead');
      for (const b of w.buildings) { const d = Math.hypot(b.x - VOLCANO.x, b.z - VOLCANO.z); if (d >= this.r && d < Math.min(r, 500)) w.collapse(b, 'blast'); }
      this.r = r;
      this.ctx.shake(8 - (t - 10) * 1.5);
    } else this.ring.visible = false;
    const erupting = t < 75;
    if (erupting) {
      this.ctx.shake(2.5);
      // kolumna erupcyjna i parasol popiołu
      for (let k = 0; k < 4; k++) fx.smoke.spawn({ p: this.crater(), v: new THREE.Vector3(rnd(12), 110 + Math.random() * 90, rnd(12)), life: 9 + Math.random() * 5, s0: 22, s1: 70, c0: 0x3a3532, c1: 0x6e6862, drag: 0.72 });
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 50;
        fx.smoke.spawn({ p: new THREE.Vector3(VOLCANO.x + rnd(60), 700 + Math.random() * 200, VOLCANO.z + rnd(60)), v: new THREE.Vector3(Math.cos(a) * sp, rnd(4), Math.sin(a) * sp), life: 20 + Math.random() * 8, s0: 50, s1: 110, c0: 0x4a4542, c1: 0x7a7470, drag: 0.92 });
      }
      if (Math.random() < 0.5) fx.fire.spawn({ p: this.crater(), v: new THREE.Vector3(rnd(20), 60 + Math.random() * 80, rnd(20)), life: 1.2, s0: 10, s1: 4, c0: 0xffd070, c1: 0x300000, g: 40, drag: 0.8 });
      // bomby wulkaniczne
      if (Math.random() < dt * 18 && this.bombs.length < 80) {
        const a = Math.random() * Math.PI * 2, el = (45 + Math.random() * 35) * Math.PI / 180, v = 110 + Math.random() * 110;
        const c = this.crater();
        this.bombs.push({ x: c.x, y: c.y, z: c.z, vx: Math.cos(a) * Math.cos(el) * v, vy: Math.sin(el) * v, vz: Math.sin(a) * Math.cos(el) * v });
      }
      // błyskawice w chmurze
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 0.4 + Math.random() * 1.2;
        this.bolt.visible = true; this.bolt.userData.t = 0.12;
        this.bolt.position.set(VOLCANO.x + rnd(150), 650 + Math.random() * 250, VOLCANO.z + rnd(150));
        this.bolt.rotation.set(rnd(0.4), 0, rnd(0.4));
        this.ctx.flash(0.12);
      }
    } else if (this.lavaSrc) { lava.sources.splice(lava.sources.indexOf(this.lavaSrc), 1); this.lavaSrc = null; }
    if (this.bolt.visible && (this.bolt.userData.t -= dt) <= 0) this.bolt.visible = false;
    // lot bomb
    let n = 0;
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.vy -= G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (!w.inside(b.x, b.z)) { this.bombs.splice(i, 1); continue; }
      if (b.y <= w.heightAt(b.x, b.z)) {
        this.bombs.splice(i, 1);
        const p = new THREE.Vector3(b.x, w.heightAt(b.x, b.z), b.z);
        fx.miniExplosion(p, false);
        w.paint(b.x, b.z, 12, SCORCH, 0.7);
        agents.hitRadius(b.x, b.z, 12, 'burnt');
        this.ctx.fire.igniteNear(b.x, b.z, 16);
        continue;
      }
      if (Math.random() < 0.4) fx.smoke.spawn({ p: new THREE.Vector3(b.x, b.y, b.z), v: new THREE.Vector3(0, 2, 0), life: 1.2, s0: 3, s1: 6, c0: 0x3a3532, c1: 0x8a8480, drag: 0.5 });
      this._m.makeTranslation(b.x, b.y, b.z);
      this.bombMesh.setMatrixAt(n++, this._m);
    }
    this.bombMesh.count = n; this.bombMesh.instanceMatrix.needsUpdate = true;
    // spływy piroklastyczne
    for (const c of this.pyro) {
      if (c.done) continue;
      const s = w.slopeAt(c.x, c.z);
      c.vx += (-s.gx * G * 6 + rnd(2)) * dt; c.vz += (-s.gz * G * 6 + rnd(2)) * dt;
      const k = Math.max(0, 1 - dt * 0.12); c.vx *= k; c.vz *= k;
      const sp = Math.hypot(c.vx, c.vz);
      if (sp > 85) { c.vx *= 85 / sp; c.vz *= 85 / sp; }
      c.x += c.vx * dt; c.z += c.vz * dt;
      if (!w.inside(c.x, c.z) || sp < 6 || w.heightAt(c.x, c.z) < -2) { c.done = true; continue; }
      if (Math.random() < 0.35) fx.smoke.spawn({ p: new THREE.Vector3(c.x, w.heightAt(c.x, c.z) + 6, c.z), v: new THREE.Vector3(c.vx * 0.4, 6 + Math.random() * 10, c.vz * 0.4), life: 4 + Math.random() * 3, s0: 14, s1: 40, c0: 0x6e6660, c1: 0xa49c94, drag: 0.55 });
      c.chk -= dt;
      if (c.chk <= 0) {
        c.chk = 0.3;
        agents.hitRadius(c.x, c.z, 28, 'burnt');
        w.treesNear(c.x, c.z, 26, (tr) => { w.setTree(tr, 'burnt'); w.setTree(tr, 'down', c.vx, c.vz); });
        for (const b of w.buildings) if (Math.hypot(b.x - c.x, b.z - c.z) < 26 + Math.max(b.w, b.d) / 2) w.collapse(b, 'pyro');
        w.paint(c.x, c.z, 24, ASH, 0.3);
      }
    }
    // opad popiołu i przyciemnienie nieba
    this.ctx.darken(t < 90 ? Math.min(0.85, (t - 10) / 15) : Math.max(0.25, 0.85 - (t - 90) / 50));
    this.ashT -= dt;
    if (t < 110 && this.ashT <= 0) {
      this.ashT = 1;
      const k = t < 80 ? 0.03 : 0.015;
      w.paintAll(ASH, (x, z) => k * Math.exp(-Math.hypot(x - VOLCANO.x, z - VOLCANO.z) / 1100));
    }
    if (t < 110) for (let k = 0; k < 4; k++) fx.smoke.spawn({ p: new THREE.Vector3(rnd(W / 2), 350 + Math.random() * 200, rnd(W / 2)), v: new THREE.Vector3(rnd(3), -30 - Math.random() * 20, rnd(3)), life: 10, s0: 1.6, s1: 1.2, c0: 0x8a8582, c1: 0x6a6562, drag: 0.98, ground: (x, z) => w.heightAt(x, z) });
    if (t > 170) this.done = true;
  }
  dispose() {
    if (this.lavaSrc) this.ctx.lava.sources.splice(this.ctx.lava.sources.indexOf(this.lavaSrc), 1);
    for (const m of [this.bombMesh, this.bolt, this.ring]) m.parent?.remove(m);
    this.ctx.darken(0);
  }
}

export const DISASTERS = [
  { key: 'avalanche', name: 'Lawina', target: true, make: (c, p) => new Avalanche(c, p), hint: 'wskaż zbocze w górach' },
  { key: 'flood', name: 'Powódź', target: false, make: (c) => new Flood(c), hint: 'ulewa i wezbrana rzeka' },
  { key: 'quake', name: 'Trzęsienie ziemi', target: true, make: (c, p) => new Earthquake(c, p), hint: 'wskaż epicentrum' },
  { key: 'nuke', name: 'Bomba atomowa', target: true, make: (c, p) => new Nuke(c, p), hint: 'wskaż cel' },
  { key: 'tsunami', name: 'Tsunami', target: false, make: (c) => new Tsunami(c), hint: 'fala z morza' },
  { key: 'fire', name: 'Pożar lasu', target: true, make: (c, p) => new ForestFire(c, p), hint: 'wskaż las' },
  { key: 'dam', name: 'Urwanie tamy', target: false, make: (c) => new DamBreak(c), hint: 'zapora w górach' },
  { key: 'volcano', name: 'Superwulkan', target: false, make: (c) => new Supervolcano(c), hint: 'erupcja wulkanu' },
];
