import * as THREE from 'three';

// Wielki robot-bokser (model w metrach „gracza”, skalowany jak rig). Przód: −Z modelu.
const METAL = new THREE.MeshLambertMaterial({ color: 0x8a96a4, flatShading: true });
const DARKM = new THREE.MeshLambertMaterial({ color: 0x3a424c, flatShading: true });
const ORANGE = new THREE.MeshLambertMaterial({ color: 0xd8742a, flatShading: true });
const rnd = (a, b) => a + Math.random() * (b - a);
const V = () => new THREE.Vector3();
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };

export class Robot {
  constructor(scene) {
    this.root = new THREE.Group(); scene.add(this.root);
    const R = this.root;
    this.pelvis = new THREE.Group(); this.pelvis.position.y = 0.86; R.add(this.pelvis);
    this.pelvis.add(box(0.36, 0.16, 0.22, DARKM));
    this.torso = new THREE.Group(); this.torso.position.y = 0.08; this.pelvis.add(this.torso);
    const T = this.torso;
    T.add(box(0.3, 0.2, 0.2, METAL, 0, 0.14, 0), box(0.46, 0.3, 0.28, METAL, 0, 0.4, 0), box(0.3, 0.12, 0.05, ORANGE, 0, 0.42, -0.15));
    // reaktor na piersi
    this.core = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x60d0ff, toneMapped: false }));
    this.core.position.set(0, 0.33, -0.15); T.add(this.core);
    T.add(box(0.14, 0.1, 0.2, DARKM, -0.29, 0.52, 0), box(0.14, 0.1, 0.2, DARKM, 0.29, 0.52, 0));
    this.head = new THREE.Group(); this.head.position.set(0, 0.62, -0.01); T.add(this.head);
    this.head.add(box(0.17, 0.17, 0.19, METAL, 0, 0.08, 0), box(0.2, 0.04, 0.2, ORANGE, 0, 0.18, 0));
    this.visor = box(0.15, 0.04, 0.02, new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }), 0, 0.1, -0.1); this.head.add(this.visor);
    // ręce: ramię + przedramię + pięść (pozycje liczone co klatkę)
    this.arms = [-1, 1].map((sd) => {
      const up = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1).translate(0, 0.5, 0), METAL), lo = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1, 0.09).translate(0, 0.5, 0), DARKM);
      const fist = box(0.13, 0.13, 0.15, ORANGE), el = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), DARKM);
      R.add(up, lo, fist, el);
      return { sd, up, lo, fist, el, cur: V(), prev: V(), vel: V() };
    });
    // nogi
    this.legs = [-1, 1].map((sd) => {
      const th = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1, 0.14).translate(0, -0.5, 0), METAL), sh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.12).translate(0, -0.5, 0), DARKM), ft = box(0.16, 0.08, 0.28, DARKM);
      R.add(th, sh, ft);
      return { sd, th, sh, ft, down: true };
    });
    // pasek życia nad głową
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 40;
    this.barCv = cv; this.barTex = new THREE.CanvasTexture(cv);
    this.bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.barTex, toneMapped: false, fog: false }));
    this.bar.scale.set(0.24, 0.038, 1); R.add(this.bar); this.bar.position.y = 1.98;
    this.root.visible = false;
    this.reset();
    this.onStep = null; this.onSwing = null;
  }
  reset() {
    this.hp = 150; this.maxHp = 150; this.mode = 'approach'; this.alive = true; this.stun = 0; this.guard = 0; this.atkT = 2; this.punch = null; this.walkT = 0; this.fall = 0; this.koT = 0;
    this.vel = V(); this.tilt = 0; this.lastBar = -1; this.root.rotation.set(0, this.root.rotation.y, 0); this.hitFlash = 0; this.strafe = Math.random() < 0.5 ? 1 : -1;
  }
  spawn(pos, yaw, S) { this.root.position.copy(pos); this.root.rotation.y = yaw; this.root.scale.setScalar(S); this.bar.scale.set(0.24 / S, 0.038 / S, 1);     // sprite liczy rozmiar w układzie widoku (skala gracza)
    this.root.visible = true; this.reset(); this.active = true; }
  hide() { this.root.visible = false; this.active = false; }
  // punkty trafień (świat): głowa, pierś, brzuch
  spheres(S) {
    this.root.updateMatrixWorld(true);
    return [['head', this.head, V().set(0, 0.08, 0), 0.13], ['chest', this.torso, V().set(0, 0.4, 0), 0.24], ['belly', this.torso, V().set(0, 0.12, 0), 0.2]]
      .map(([part, o, p, r]) => ({ part, p: o.localToWorld(p.clone()), r: r * S }));
  }
  fists() { return this.arms.map((a) => ({ p: a.fist.getWorldPosition(V()), v: a.vel, striking: this.punch && this.punch.arm === a && this.punch.phase === 'strike' })); }
  // trafienie przez gracza; dmg 0..; dir — kierunek ciosu (świat)
  hit(dmg, dir, part, S) {
    if (!this.alive) return 0;
    let d = dmg * (part === 'head' ? 1.5 : 1);
    if (this.guard > 0 && part !== 'belly') d *= 0.25;
    this.hp = Math.max(0, this.hp - d);
    this.hitFlash = 0.2;
    const k = Math.min(1, d / 20);
    this.vel.addScaledVector(dir.clone().setY(0).normalize(), (0.25 + k * 0.9) * S);
    this.tilt = Math.min(0.6, this.tilt + 0.15 + k * 0.4);
    if (d > 9) { this.stun = Math.max(this.stun, 0.15 + k * 0.35); if (Math.random() < 0.6) this.punch = null; }
    if (this.hp <= 0) { this.alive = false; this.mode = 'ko'; this.koT = 0; this.landed = false; this.koYaw = this.root.rotation.y; this.fallDir = dir.clone().setY(0).normalize(); }
    return d;
  }
  // AI i animacja. playerHead/playerChest/playerHands — świat; S — skala; zwraca nic, zdarzenia przez callbacki
  update(dt, S, playerHead, handsW) {
    if (!this.active) return;
    const R = this.root, pos = R.position;
    // do gracza (w poziomie)
    const to = V().set(playerHead.x - pos.x, 0, playerHead.z - pos.z), dist = to.length() / S;
    const wantYaw = Math.atan2(-to.x, -to.z);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.visor.material.color.setHex(this.hitFlash > 0 ? 0xffffff : this.alive ? 0xff3020 : 0x301010);
    this.core.material.color.setHex(this.alive ? (this.hitFlash > 0 ? 0xffffff : 0x60d0ff) : 0x203040);
    if (this.mode === 'ko') {
      // nokaut: przewraca się na plecy
      this.koT += dt;
      const f = Math.min(1, (this.koT / 1.6) ** 2);
      const axis = V().set(this.fallDir.z, 0, -this.fallDir.x).applyAxisAngle(V().set(0, 1, 0), -this.koYaw);
      R.quaternion.setFromAxisAngle(V().set(0, 1, 0), this.koYaw).multiply(new THREE.Quaternion().setFromAxisAngle(axis.normalize(), f * Math.PI / 2 * 0.95));
      if (f >= 1 && !this.landed) { this.landed = true; if (this.onLand) this.onLand(); }
      this.drawBar();
      this.pose(dt, S, playerHead, 0);
      return;
    }
    // obrót do gracza
    let dy = Math.atan2(Math.sin(wantYaw - R.rotation.y), Math.cos(wantYaw - R.rotation.y));
    R.rotation.y += Math.max(-dt * 2.5, Math.min(dt * 2.5, dy));
    // ruch: odrzut po ciosie, podejście, krążenie
    let move = V();
    this.stun = Math.max(0, this.stun - dt); this.guard = Math.max(0, this.guard - dt); this.tilt = Math.max(0, this.tilt - dt * 1.2);
    if (this.stun <= 0) {
      const fwd = to.clone().normalize(), side = V().set(-fwd.z, 0, fwd.x);
      if (dist > 0.72) move.addScaledVector(fwd, dist > 1.2 ? 0.55 : 0.35);
      else if (dist < 0.42) move.addScaledVector(fwd, -0.4);
      else move.addScaledVector(side, 0.18 * this.strafe);
      if (Math.random() < dt * 0.3) this.strafe = -this.strafe;
    }
    move.multiplyScalar(S);
    pos.addScaledVector(move, dt).addScaledVector(this.vel, dt);
    this.vel.multiplyScalar(Math.exp(-dt * 3));
    this.speed = move.length() + this.vel.length();
    // garda, gdy dłoń gracza szybko się zbliża
    for (const h of handsW) {
      const d = h.p.distanceTo(V().set(pos.x, playerHead.y, pos.z)) / S;
      if (d < 1.1 && h.v.length() / S > 2.2 && this.guard <= 0 && !this.punch && this.stun <= 0 && Math.random() < 0.5) this.guard = rnd(0.5, 0.9);
    }
    // ataki
    this.atkT -= dt;
    if (!this.punch && this.stun <= 0 && dist < 0.8 && this.atkT <= 0) {
      const r = Math.random(), type = r < 0.55 ? 'jab' : r < 0.85 ? 'hook' : 'upper';
      const arm = this.arms[Math.random() < 0.5 ? 0 : 1];
      this.punch = { arm, type, phase: 'wind', t: 0, combo: type === 'jab' && Math.random() < 0.35 };
      this.atkT = rnd(0.9, 1.9); this.guard = 0;
    }
    if (this.punch) {
      const P = this.punch; P.t += dt;
      const dur = { wind: P.type === 'jab' ? 0.16 : 0.26, strike: P.type === 'jab' ? 0.14 : 0.2, back: 0.3 };
      if (P.t > dur[P.phase]) {
        P.t = 0;
        if (P.phase === 'wind') { P.phase = 'strike'; P.target = playerHead.clone().add(V().set(0, P.type === 'upper' ? -0.1 * S : -0.03 * S, 0)); if (this.onSwing) this.onSwing(P); }
        else if (P.phase === 'strike') P.phase = 'back';
        else { const c = P.combo; this.punch = null; if (c) this.punch = { arm: this.arms.find((a) => a !== P.arm), type: 'jab', phase: 'wind', t: 0.08, combo: false }; }
      }
    }
    this.pose(dt, S, playerHead, move.length() / S);
    this.drawBar();
  }
  // ustawienie kończyn
  pose(dt, S, playerHead, walk) {
    const R = this.root;
    this.walkT += dt * (walk > 0.05 ? 5 : 0);
    this.pelvis.rotation.x = 0; this.torso.rotation.x = this.tilt * 0.6;
    this.torso.rotation.y = this.punch && this.punch.phase === 'strike' ? -this.punch.arm.sd * 0.35 : this.punch && this.punch.phase === 'wind' ? this.punch.arm.sd * 0.2 : 0;
    this.pelvis.position.y = 0.86 + Math.abs(Math.sin(this.walkT)) * 0.02;
    R.updateMatrixWorld(true);
    const inv = R.matrixWorld.clone().invert();
    for (const a of this.arms) {
      const sh = this.torso.localToWorld(V().set(a.sd * 0.29, 0.5, 0)).applyMatrix4(inv);
      let tgt = V().set(a.sd * 0.13, 1.5, -0.3);                               // garda przed twarzą
      if (this.guard > 0) tgt.set(a.sd * 0.07, 1.62, -0.27);
      const P = this.punch;
      if (P && P.arm === a) {
        const hit = P.target ? P.target.clone().applyMatrix4(inv) : tgt.clone();
        const reach = (v) => { const d = v.clone().sub(sh); if (d.length() > 0.76) d.setLength(0.76); return sh.clone().add(d); };
        if (P.phase === 'wind') tgt = tgt.clone().add(V().set(a.sd * (P.type === 'hook' ? 0.12 : 0.03), P.type === 'upper' ? -0.25 : 0, 0.12));
        else if (P.phase === 'strike') {
          const u = Math.min(1, P.t / (P.type === 'jab' ? 0.14 : 0.2));
          const end = reach(hit);
          if (P.type === 'hook') { const side = tgt.clone().add(V().set(a.sd * 0.4, 0, -0.15)); tgt = side.lerp(end, u); tgt.x += a.sd * Math.sin(u * Math.PI) * 0.15; }
          else if (P.type === 'upper') tgt = tgt.clone().add(V().set(0, -0.25, 0)).lerp(end, u);
          else tgt = tgt.clone().lerp(end, u * u * (3 - 2 * u));
        } else tgt = reach(hit).lerp(tgt, Math.min(1, P.t / 0.3));
      }
      // dwuczłonowe ramię (0,38 + 0,36)
      const d = tgt.clone().sub(sh), L = Math.min(0.77, d.length()); d.setLength(L);
      const mid = sh.clone().addScaledVector(d, 0.5), bend = Math.sqrt(Math.max(0, 0.39 * 0.39 - (L / 2) ** 2));
      const pole = V().set(a.sd, -1, 0.4); pole.sub(d.clone().normalize().multiplyScalar(pole.dot(d.clone().normalize()))).normalize();
      const el = mid.addScaledVector(pole, bend), hand = sh.clone().add(d);
      const seg = (m, p, q) => { m.position.copy(p); m.scale.set(1, p.distanceTo(q), 1); m.quaternion.setFromUnitVectors(V().set(0, 1, 0), q.clone().sub(p).normalize()); };
      seg(a.up, sh, el); seg(a.lo, el, hand); a.el.position.copy(el); a.fist.position.copy(hand); a.fist.lookAt(R.localToWorld(hand.clone().add(d)));
      a.prev.copy(a.cur); a.cur.copy(R.localToWorld(hand.clone()));
      a.vel.copy(a.cur).sub(a.prev).divideScalar(Math.max(dt, 1e-3));
    }
    for (const L of this.legs) {
      const ph = this.walkT + (L.sd > 0 ? Math.PI : 0), sw = walk > 0.05 ? Math.sin(ph) * 0.18 : 0, lift = walk > 0.05 ? Math.max(0, Math.cos(ph)) * 0.08 : 0;
      const hip = V().set(L.sd * 0.13, 0.82, 0), foot = V().set(L.sd * 0.15, 0.04 + lift, -sw);
      const knee = hip.clone().lerp(foot, 0.5).add(V().set(0, 0, -0.08));
      const seg = (m, p, q) => { m.position.copy(p); m.scale.set(1, p.distanceTo(q), 1); m.quaternion.setFromUnitVectors(V().set(0, -1, 0), q.clone().sub(p).normalize()); };
      seg(L.th, hip, knee); seg(L.sh, knee, foot); L.ft.position.copy(foot);
      const down = lift < 0.004;
      if (down && !L.down && this.onStep) this.onStep(this.root.localToWorld(foot.clone()));
      L.down = down;
    }
  }
  drawBar() {
    const v = Math.round(this.hp);
    if (v === this.lastBar) return; this.lastBar = v;
    const c = this.barCv.getContext('2d');
    c.clearRect(0, 0, 256, 40); c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, 256, 40);
    c.fillStyle = v > this.maxHp * 0.3 ? '#ff9a3a' : '#ff3a2a'; c.fillRect(4, 4, 248 * v / this.maxHp, 32);
    c.fillStyle = '#fff'; c.font = 'bold 22px system-ui'; c.textAlign = 'center'; c.fillText(this.alive ? `ROBOT ${v}` : 'K.O.!', 128, 28);
    this.barTex.needsUpdate = true;
  }
  colliders(S) {
    // ciało robota taranuje budynki
    const p = this.root.position;
    return [{ p: V().set(p.x, 0.75 * S, p.z), r: 0.22 * S }, { p: V().set(p.x, 1.25 * S, p.z), r: 0.24 * S }];
  }
}
