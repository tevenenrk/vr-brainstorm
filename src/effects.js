import * as THREE from 'three';

// Pula cząsteczek oparta o InstancedMesh (jedno wywołanie rysowania na pulę).
class ParticlePool {
  constructor(parent, material, capacity, detail = 1) {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, detail), material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    parent.add(this.mesh);
    this.capacity = capacity;
    this.items = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  spawn(o) {
    if (this.items.length >= this.capacity) this.items.shift();
    this.items.push({
      p: o.p.clone(), v: o.v ? o.v.clone() : new THREE.Vector3(),
      life: 0, max: o.life, s0: o.s0, s1: o.s1 ?? o.s0,
      c0: new THREE.Color(o.c0), c1: new THREE.Color(o.c1 ?? o.c0),
      drag: o.drag ?? 1, g: o.g ?? 0, fadeShrink: o.fadeShrink ?? true,
      ground: o.ground,
    });
  }

  update(dt) {
    const items = this.items;
    let n = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      it.life += dt;
      if (it.life >= it.max) continue;
      it.v.y -= it.g * dt;
      it.v.multiplyScalar(Math.pow(it.drag, dt));
      it.p.addScaledVector(it.v, dt);
      if (it.ground) {
        const gy = it.ground(it.p.x, it.p.z);
        if (it.p.y < gy) { it.p.y = gy; it.v.set(0, 0, 0); }
      }
      const t = it.life / it.max;
      let s = it.s0 + (it.s1 - it.s0) * (1 - (1 - t) * (1 - t));
      if (it.fadeShrink) s *= 1 - Math.max(0, (t - 0.65) / 0.35);
      this._s.setScalar(Math.max(0.001, s));
      this._m.compose(it.p, this._q, this._s);
      this.mesh.setMatrixAt(n, this._m);
      this._c.copy(it.c0).lerp(it.c1, t);
      this.mesh.setColorAt(n, this._c);
      items[n++] = it;
    }
    items.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.items.length = 0; this.mesh.count = 0; }
}

const rnd = (a = 1) => (Math.random() * 2 - 1) * a;

export class Effects {
  constructor(parent, terrain) {
    this.terrain = terrain;
    this.fire = new ParticlePool(parent, new THREE.MeshBasicMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), 500, 1);
    this.smoke = new ParticlePool(parent, new THREE.MeshLambertMaterial({ flatShading: true }), 1000, 1);
    this.ground = (x, z) => terrain.surfaceAt(x, z);
    this.smokers = [];
  }

  explosion(p, inWater) {
    const up = new THREE.Vector3();
    for (let i = 0; i < 14; i++) {
      this.fire.spawn({
        p: p.clone().add(new THREE.Vector3(rnd(6), Math.random() * 8, rnd(6))),
        v: up.set(rnd(25), 15 + Math.random() * 35, rnd(25)),
        life: 0.35 + Math.random() * 0.35, s0: 8, s1: 24,
        c0: inWater ? 0xbfe6ff : 0xfff0a0, c1: 0x000000, drag: 0.05,
      });
    }
    if (inWater) {
      for (let i = 0; i < 40; i++) {
        this.smoke.spawn({
          p: p.clone().add(new THREE.Vector3(rnd(8), 0, rnd(8))),
          v: new THREE.Vector3(rnd(18), 40 + Math.random() * 60, rnd(18)),
          life: 1.2 + Math.random() * 0.8, s0: 3 + Math.random() * 3, s1: 2,
          c0: 0xeaf6ff, c1: 0x9cc6e0, g: 70, drag: 0.6, ground: this.ground,
        });
      }
      return;
    }
    for (let i = 0; i < 22; i++) {
      const up = Math.random();
      this.smoke.spawn({
        p: p.clone().add(new THREE.Vector3(rnd(8), Math.random() * 4, rnd(8))),
        v: new THREE.Vector3(rnd(30), 6 + up * 40, rnd(30)),
        life: 2 + Math.random() * 2.5, s0: 3 + Math.random() * 3, s1: 8 + Math.random() * 10 + up * 6,
        c0: 0x4a4540, c1: 0xbdb8b0, drag: 0.25,
      });
    }
    for (let i = 0; i < 26; i++) {
      this.smoke.spawn({
        p: p.clone().add(new THREE.Vector3(0, 2, 0)),
        v: new THREE.Vector3(rnd(45), 35 + Math.random() * 70, rnd(45)),
        life: 1.4 + Math.random() * 0.8, s0: 1.6 + Math.random() * 1.8, s1: 1.2,
        c0: 0x4a3622, c1: 0x2a2018, g: 90, drag: 0.7, ground: this.ground, fadeShrink: true,
      });
    }
  }

  muzzle(p, dir) {
    for (let i = 0; i < 10; i++) {
      this.fire.spawn({
        p: p.clone(), v: dir.clone().multiplyScalar(30 + Math.random() * 60).add(new THREE.Vector3(rnd(8), rnd(8), rnd(8))),
        life: 0.15 + Math.random() * 0.15, s0: 4, s1: 9, c0: 0xffe9a0, c1: 0x000000, drag: 0.01,
      });
    }
    for (let i = 0; i < 7; i++) {
      this.smoke.spawn({
        p: p.clone(), v: dir.clone().multiplyScalar(10 + Math.random() * 25).add(new THREE.Vector3(rnd(6), 4 + Math.random() * 6, rnd(6))),
        life: 1.6 + Math.random() * 1.2, s0: 2, s1: 6 + Math.random() * 4, c0: 0xb8b2a8, c1: 0xd8d4ce, drag: 0.3,
      });
    }
  }

  trail(p) {
    this.smoke.spawn({
      p: p.clone(), v: new THREE.Vector3(rnd(1), 1, rnd(1)), life: 0.7, s0: 2.2, s1: 3.5, c0: 0xdcd6cc, c1: 0xffffff, drag: 0.5,
    });
  }

  // źródło dymu (płonący dom, zniszczony most)
  addSmoker(p, dur, fire = true) { this.smokers.push({ p: p.clone(), t: 0, dur, acc: 0, fire }); }

  burst(p) {
    for (let i = 0; i < 10; i++) {
      this.fire.spawn({
        p: p.clone().add(new THREE.Vector3(rnd(8), Math.random() * 10, rnd(8))),
        v: new THREE.Vector3(rnd(15), 10 + Math.random() * 25, rnd(15)),
        life: 0.4 + Math.random() * 0.4, s0: 6, s1: 16, c0: 0xffb060, c1: 0x000000, drag: 0.1,
      });
    }
  }

  update(dt) {
    for (let i = this.smokers.length - 1; i >= 0; i--) {
      const s = this.smokers[i];
      s.t += dt; s.acc += dt;
      if (s.t > s.dur) { this.smokers.splice(i, 1); continue; }
      const k = 1 - s.t / s.dur;
      if (s.acc > 0.14) {
        s.acc = 0;
        this.smoke.spawn({
          p: s.p.clone().add(new THREE.Vector3(rnd(5), 4, rnd(5))),
          v: new THREE.Vector3(rnd(3) + 4, 14 + Math.random() * 10, rnd(3)),
          life: 3 + Math.random() * 2, s0: 3, s1: 9 + 8 * k, c0: 0x2a2624, c1: 0x8d8a86, drag: 0.6,
        });
        if (s.fire && k > 0.4) {
          this.fire.spawn({
            p: s.p.clone().add(new THREE.Vector3(rnd(5), 2 + Math.random() * 4, rnd(5))),
            v: new THREE.Vector3(rnd(2), 8 + Math.random() * 8, rnd(2)),
            life: 0.5 + Math.random() * 0.4, s0: 3.5, s1: 1.5, c0: 0xff9a40, c1: 0x000000, drag: 0.5,
          });
        }
      }
    }
    this.fire.update(dt); this.smoke.update(dt);
  }

  clear() { this.fire.clear(); this.smoke.clear(); this.smokers.length = 0; }
}

// ---------- dźwięk (generowany proceduralnie, przestrzenny) ----------
export class Sound {
  constructor(camera, scene) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    const ctx = this.listener.context;
    this.buffers = {
      boom: this.makeBoom(ctx, 2.6, 900, 42, 1.8),
      gun: this.makeBoom(ctx, 1.6, 2400, 60, 3.2),
      splash: this.makeSplash(ctx),
    };
    this.pool = [];
    for (let i = 0; i < 12; i++) {
      const a = new THREE.PositionalAudio(this.listener);
      a.setRefDistance(0.6);
      a.setRolloffFactor(1.2);
      a.setDistanceModel('inverse');
      scene.add(a);
      this.pool.push(a);
    }
    this.next = 0;
  }

  resume() { if (this.listener.context.state !== 'running') this.listener.context.resume(); }

  makeBoom(ctx, dur, cutoff, thumpHz, decay) {
    const sr = ctx.sampleRate, n = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    let lp = 0, lp2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const a = Math.min(1, (cutoff * 2 * Math.PI) / sr * Math.exp(-t * 1.5));
      lp += a * ((Math.random() * 2 - 1) - lp);
      lp2 += a * (lp - lp2);
      const env = Math.exp(-t * decay) * Math.min(1, t * 400);
      const thump = Math.sin(2 * Math.PI * thumpHz * t * (1 - t * 0.25)) * Math.exp(-t * 5);
      const crack = t < 0.02 ? (Math.random() * 2 - 1) * (1 - t / 0.02) : 0;
      d[i] = Math.tanh((lp2 * 3.2 * env + thump * 0.9 + crack * 0.7) * 1.4) * 0.9;
    }
    return buf;
  }

  makeSplash(ctx) {
    const sr = ctx.sampleRate, n = Math.floor(sr * 1.6);
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      lp += 0.25 * ((Math.random() * 2 - 1) - lp);
      d[i] = (lp * 1.6 * Math.exp(-t * 3) + Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 7) * 0.6) * Math.min(1, t * 300);
    }
    return buf;
  }

  play(name, worldPos, volume = 1) {
    if (this.listener.context.state !== 'running') return;
    const a = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    if (a.isPlaying) a.stop();
    a.setBuffer(this.buffers[name]);
    a.setVolume(volume);
    a.playbackRate = 0.9 + Math.random() * 0.2;
    a.position.copy(worldPos);
    a.updateMatrixWorld();
    a.play();
  }
}
