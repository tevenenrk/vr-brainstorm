import * as THREE from 'three';

// Pula cząsteczek oparta o InstancedMesh (jedno wywołanie rysowania na pulę).
export class ParticlePool {
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
  constructor(parent, terrain, cap = {}) {
    this.terrain = terrain;
    this.fire = new ParticlePool(parent, new THREE.MeshBasicMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), cap.fire || 1100, 1);
    this.smoke = new ParticlePool(parent, new THREE.MeshLambertMaterial({ flatShading: true }), cap.smoke || 1000, 1);
    this.ground = (x, z) => terrain.surfaceAt(x, z);
    this.smokers = [];
    this.fireZones = [];
    this.nukes = [];
    this.parent = parent;
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

  // mały wybuch podpocisku kasetowego
  miniExplosion(p, inWater) {
    for (let i = 0; i < 5; i++) {
      this.fire.spawn({
        p: p.clone().add(new THREE.Vector3(rnd(3), Math.random() * 3, rnd(3))),
        v: new THREE.Vector3(rnd(14), 8 + Math.random() * 18, rnd(14)),
        life: 0.3 + Math.random() * 0.25, s0: 5, s1: 14, c0: inWater ? 0xbfe6ff : 0xfff0a0, c1: 0x000000, drag: 0.05,
      });
    }
    for (let i = 0; i < 4; i++) {
      this.smoke.spawn({
        p: p.clone().add(new THREE.Vector3(rnd(4), 1, rnd(4))),
        v: new THREE.Vector3(rnd(8), 5 + Math.random() * 12, rnd(8)),
        life: 1.8 + Math.random(), s0: 3, s1: 9 + Math.random() * 5, c0: inWater ? 0xeaf6ff : 0x4a4540, c1: 0xbdb8b0, drag: 0.3,
      });
    }
  }

  // rozerwanie pocisku kasetowego w powietrzu
  airburst(p) {
    for (let i = 0; i < 8; i++) {
      this.fire.spawn({ p: p.clone(), v: new THREE.Vector3(rnd(40), rnd(25), rnd(40)), life: 0.2 + Math.random() * 0.2, s0: 5, s1: 12, c0: 0xffffd0, c1: 0x000000, drag: 0.02 });
    }
    for (let i = 0; i < 6; i++) {
      this.smoke.spawn({ p: p.clone(), v: new THREE.Vector3(rnd(10), rnd(5), rnd(10)), life: 2 + Math.random(), s0: 3, s1: 9, c0: 0x8a8580, c1: 0xd0ccc6, drag: 0.4 });
    }
  }

  // pocisk zapalający: rozprysk płonących odłamków i strefa ognia
  incendiary(p, R, dur) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 45;
      this.fire.spawn({
        p: p.clone().add(new THREE.Vector3(0, 3, 0)),
        v: new THREE.Vector3(Math.cos(a) * sp, 30 + Math.random() * 50, Math.sin(a) * sp),
        life: 1.2 + Math.random() * 0.8, s0: 3.5, s1: 1.5, c0: 0xfff2c0, c1: 0xff4010, g: 70, drag: 0.6, ground: this.ground,
      });
    }
    this.fireZones.push({ p: p.clone(), R, t: 0, dur, acc: 0 });
  }

  nuke(p) { this.nukes.push(new NukeFx(this.parent, p, this)); }

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
    for (let i = this.fireZones.length - 1; i >= 0; i--) {
      const z = this.fireZones[i];
      z.t += dt; z.acc += dt;
      if (z.t > z.dur) { this.fireZones.splice(i, 1); continue; }
      const k = 1 - z.t / z.dur;
      while (z.acc > 0.012) {
        z.acc -= 0.012;
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * z.R;
        const x = z.p.x + Math.cos(a) * r, zz = z.p.z + Math.sin(a) * r;
        const y = this.terrain.surfaceAt(x, zz);
        if (Math.random() < 0.3 + 0.7 * k) {
          this.fire.spawn({
            p: new THREE.Vector3(x, y + 1, zz), v: new THREE.Vector3(rnd(2), 6 + Math.random() * 10, rnd(2)),
            life: 0.5 + Math.random() * 0.6, s0: 4 + 5 * k, s1: 1.5, c0: Math.random() < 0.5 ? 0xffc060 : 0xff6a20, c1: 0x200000, drag: 0.5,
          });
        }
        if (Math.random() < 0.08) {
          this.smoke.spawn({
            p: new THREE.Vector3(x, y + 4, zz), v: new THREE.Vector3(rnd(3) + 3, 10 + Math.random() * 8, rnd(3)),
            life: 3 + Math.random() * 2, s0: 3, s1: 10, c0: 0x2a2624, c1: 0x7d7a76, drag: 0.6,
          });
        }
      }
    }
    for (let i = this.nukes.length - 1; i >= 0; i--) if (!this.nukes[i].update(dt)) this.nukes.splice(i, 1);
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

  clear() {
    this.fire.clear(); this.smoke.clear(); this.smokers.length = 0; this.fireZones.length = 0;
    for (const n of this.nukes) n.dispose();
    this.nukes.length = 0;
  }
}

// ---------- grzyb atomowy i fala uderzeniowa ----------
export function shockRadius(t, max) {
  const k = Math.min(1, t / 3.5);
  return max * (1 - (1 - k) * (1 - k) * (1 - k));
}

class NukeFx {
  constructor(parent, p, fx) {
    this.fx = fx;
    this.p = p.clone();
    this.t = 0;
    this.life = 34;
    this.g = new THREE.Group();
    this.g.position.copy(p);
    parent.add(this.g);
    this.mats = [];
    const mat = (o) => { const m = new THREE.MeshLambertMaterial({ transparent: true, ...o }); this.mats.push(m); return m; };
    const basic = (o) => { const m = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false, ...o }); this.mats.push(m); return m; };
    // błysk
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), basic({ color: 0xffffff, blending: THREE.AdditiveBlending }));
    this.g.add(this.flash);
    // kula ognia (później główka grzyba)
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), mat({ color: 0x4a3a30, emissive: 0xff7a20, flatShading: true }));
    this.g.add(this.ball);
    // pierścień (kołnierz) grzyba
    this.cap = new THREE.Mesh(new THREE.TorusGeometry(1, 0.5, 12, 28), mat({ color: 0x6a5a50, emissive: 0xff5010, flatShading: true }));
    this.cap.rotation.x = Math.PI / 2;
    this.g.add(this.cap);
    // trzon
    this.stem = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1, 1, 14, 4, true).translate(0, 0.5, 0), mat({ color: 0x7a6a5e, emissive: 0xff6010, flatShading: true, side: THREE.DoubleSide }));
    this.g.add(this.stem);
    // obłok pyłu u podstawy
    this.base = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.15, 1, 24, 1).translate(0, 0.5, 0), mat({ color: 0x8a7a68 }));
    this.g.add(this.base);
    // fala uderzeniowa: pierścień przy ziemi + półprzezroczysta kopuła
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 96).rotateX(-Math.PI / 2), basic({ color: 0xffffff, side: THREE.DoubleSide }));
    this.ring.position.y = 8;
    this.g.add(this.ring);
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), basic({ color: 0xdfefff, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.g.add(this.dome);
  }

  update(dt) {
    const t = (this.t += dt);
    if (t > this.life) { this.dispose(); return false; }
    const fade = 1 - Math.max(0, (t - (this.life - 10)) / 10);
    // błysk
    const fl = Math.max(0, 1 - t / 1.2);
    this.flash.scale.setScalar(40 + 260 * Math.min(1, t / 0.35));
    this.flash.material.opacity = fl * fl;
    this.flash.visible = fl > 0;
    // kula ognia unosi się i stygnie
    const rise = 1 - Math.exp(-t / 5);
    const h = 40 + 560 * rise;
    const br = 55 + 95 * Math.min(1, t / 6);
    this.ball.position.y = h;
    this.ball.scale.set(br * 1.2, br * (0.85 + 0.15 * Math.min(1, t / 6)), br * 1.2);
    this.ball.rotation.y += dt * 0.15;
    const heat = Math.max(0, 1 - t / 7);
    this.ball.material.emissive.setRGB(1.0 * heat, 0.45 * heat * heat, 0.1 * heat * heat);
    this.ball.material.color.setRGB(0.22 + 0.3 * (1 - heat), 0.18 + 0.3 * (1 - heat), 0.16 + 0.3 * (1 - heat));
    // kołnierz
    this.cap.position.y = h - br * 0.35;
    const cr = br * (1.0 + 0.5 * Math.min(1, t / 8));
    this.cap.scale.set(cr, cr, br * 1.25);
    this.cap.rotation.z += dt * 0.25;
    this.cap.material.emissive.copy(this.ball.material.emissive).multiplyScalar(0.8);
    this.cap.material.color.copy(this.ball.material.color);
    // trzon
    const sr = 34 + 26 * Math.min(1, t / 6);
    this.stem.scale.set(sr, Math.max(1, h - br * 0.5), sr);
    this.stem.material.emissive.copy(this.ball.material.emissive).multiplyScalar(0.5);
    // podstawa
    const brd = 60 + 300 * (1 - Math.exp(-t / 3));
    this.base.scale.set(brd, 18 + 25 * Math.min(1, t / 4), brd);
    // fala uderzeniowa
    const sh = shockRadius(t, 760);
    const sf = Math.max(0, 1 - t / 4.5);
    this.ring.scale.setScalar(Math.max(1, sh));
    this.ring.material.opacity = sf;
    this.ring.visible = sf > 0;
    this.dome.scale.set(sh, sh * 0.45, sh);
    this.dome.material.opacity = 0.22 * Math.max(0, 1 - t / 3.2);
    this.dome.visible = t < 3.2;
    for (const m of [this.ball.material, this.cap.material, this.stem.material]) m.opacity = fade;
    this.base.material.opacity = 0.85 * fade * Math.max(0.3, 1 - t / 25);
    // kłęby dymu dla objętości
    for (let n = 0; n < 2; n++) if (t < 16 && Math.random() < 0.7) {
      const a = Math.random() * Math.PI * 2;
      const fx = this.fx;
      fx.smoke.spawn({
        p: new THREE.Vector3(this.p.x + Math.cos(a) * cr * 1.1, this.p.y + h - br * 0.2 + rnd(br * 0.4), this.p.z + Math.sin(a) * cr * 1.1),
        v: new THREE.Vector3(Math.cos(a) * 8, 4 + Math.random() * 6, Math.sin(a) * 8),
        life: 5 + Math.random() * 4, s0: 22, s1: 50, c0: heat > 0.3 ? 0x7a3a1a : 0x6e625a, c1: 0xa49a90, drag: 0.7,
      });
      if (t < 6) {
        const b = Math.random() * Math.PI * 2, r = brd * (0.8 + Math.random() * 0.3);
        fx.smoke.spawn({
          p: new THREE.Vector3(this.p.x + Math.cos(b) * r, this.p.y + 8, this.p.z + Math.sin(b) * r),
          v: new THREE.Vector3(Math.cos(b) * 25, 6, Math.sin(b) * 25),
          life: 4 + Math.random() * 3, s0: 10, s1: 30, c0: 0x8a7a68, c1: 0xb0a594, drag: 0.6,
        });
      }
    }
    return true;
  }

  dispose() {
    this.g.parent?.remove(this.g);
    this.g.traverse((o) => o.geometry?.dispose());
    for (const m of this.mats) m.dispose();
  }
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
      pop: this.makeBoom(ctx, 0.9, 2800, 90, 5),
      nuke: this.makeBoom(ctx, 7, 260, 24, 0.55),
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
