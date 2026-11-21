import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Kostucha: czarna szata z kapturem, czaszka, kościste dłonie, kosa.
// Oś przodu: +Z. Kosa obraca się wokół dłoni (pivot) — pozy: niesienie, zamach, cięcie.
const ROBE = new THREE.MeshStandardMaterial({ color: 0x0d0d11, roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
const ROBE_IN = new THREE.MeshBasicMaterial({ color: 0x020203, side: THREE.BackSide });
const BONE = new THREE.MeshStandardMaterial({ color: 0xd8cfb6, roughness: 0.75 });
const HOLE = new THREE.MeshBasicMaterial({ color: 0x000000 });
const EYE = new THREE.MeshBasicMaterial({ color: 0xff3b1c, toneMapped: false });
const WOOD = new THREE.MeshStandardMaterial({ color: 0x3b2b1d, roughness: 0.85 });
const METAL = new THREE.MeshStandardMaterial({ color: 0xaeb4ba, metalness: 0.7, roughness: 0.28 });
const Y = new THREE.Vector3(0, 1, 0);

export const POSES = {
  carry: { px: -0.3, py: 1.02, pz: 0.16, pitch: 0.1, yaw: -Math.PI / 2, lh: 0 },
  windup: { px: -0.42, py: 1.78, pz: 0.08, pitch: Math.PI / 2 - 0.5, yaw: -2.3, lh: 1 },
};
export const SWING = { px: -0.1, pz: 0.4 };
export const MODEL_SCALE = 1.15;       // model 1,7 m → ok. 1,95 m
export function loadModel(url) { return new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej)); }
const GRIP2 = 0.3;                     // druga dłoń na drzewcu (m od pivotu)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
// obrót kości tak, by kierunek (kość → childWorld) wskazywał desiredWorld; k = ułamek obrotu
function aimBone(bone, childWorld, desiredWorld, k = 1, maxAng = Math.PI) {
  bone.getWorldPosition(_a);
  const from = _b.subVectors(childWorld, _a).normalize(), to = _c.subVectors(desiredWorld, _a).normalize();
  _q.setFromUnitVectors(from, to);
  const ang = 2 * Math.acos(Math.min(1, Math.abs(_q.w)));
  const f = Math.min(k, ang > 1e-5 ? maxAng / ang : 1);
  if (f < 1) _q.slerp(_q3.identity(), 1 - f);
  bone.getWorldQuaternion(_q2);
  _q2.premultiply(_q);
  bone.parent.getWorldQuaternion(_q3).invert();
  bone.quaternion.copy(_q3.multiply(_q2));
  bone.updateMatrixWorld(true);
}
// IK dwóch kości (ramię–przedramię) z biegunem łokcia
function solveArm(upper, lower, hand, target, pole) {
  const A = upper.getWorldPosition(new THREE.Vector3()), B = lower.getWorldPosition(new THREE.Vector3()), C = hand.getWorldPosition(new THREE.Vector3());
  const l1 = A.distanceTo(B), l2 = B.distanceTo(C);
  const d = new THREE.Vector3().subVectors(target, A);
  const dist = THREE.MathUtils.clamp(d.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  d.normalize();
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const pd = new THREE.Vector3().subVectors(pole, A); pd.addScaledVector(d, -pd.dot(d));
  if (pd.lengthSq() < 1e-6) pd.set(0, -1, 0);
  pd.normalize();
  const elbow = A.clone().addScaledVector(d, x).addScaledVector(pd, h);
  aimBone(upper, B, elbow);
  aimBone(lower, hand.getWorldPosition(new THREE.Vector3()), A.clone().addScaledVector(d, dist));
}
export const lerpPose = (a, b, t) => { const o = {}; for (const k in a) o[k] = a[k] + (b[k] - a[k]) * t; return o; };

function robeGeo() {
  const prof = [[0.48, 0.02], [0.44, 0.25], [0.38, 0.6], [0.32, 1.0], [0.28, 1.28], [0.31, 1.44], [0.27, 1.55], [0.16, 1.63], [0.07, 1.67]].map(([r, y]) => new THREE.Vector2(r, y));
  const seg = 30, g = new THREE.LatheGeometry(prof, seg);
  const a = g.attributes.position, np = prof.length;
  const jag = Array.from({ length: seg }, () => [Math.random() * 0.16, 1 + Math.random() * 0.08]);
  for (let s = 0; s <= seg; s++) {
    const i = s * np, [dy, dr] = jag[s % seg];
    a.setY(i, a.getY(i) + dy); a.setX(i, a.getX(i) * dr); a.setZ(i, a.getZ(i) * dr);
    a.setY(i + 1, a.getY(i + 1) + dy * 0.4);
  }
  g.scale(1, 1, 0.82);
  g.computeVertexNormals();
  return g;
}
function handGeo() {
  const parts = [new THREE.BoxGeometry(0.06, 0.085, 0.032).translate(0, 0.04, 0)];
  for (let k = 0; k < 4; k++) parts.push(new THREE.BoxGeometry(0.011, 0.07, 0.012).rotateX(0.9).translate(-0.022 + k * 0.015, 0.1, 0.022));
  parts.push(new THREE.BoxGeometry(0.012, 0.05, 0.012).rotateZ(0.6).translate(0.04, 0.05, 0.01));
  return parts;
}

export class Reaper {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const robe = new THREE.Mesh(robeGeo(), ROBE);
    robe.castShadow = true;
    this.robe = robe;
    this.body.add(robe);
    // kaptur + czaszka (obraca się, patrząc na gracza)
    this.head = new THREE.Group();
    this.head.position.set(0, 1.64, 0);
    this.body.add(this.head);
    const gap = 1.25;
    const hoodG = new THREE.SphereGeometry(0.2, 22, 14, Math.PI / 2 + gap / 2, Math.PI * 2 - gap, 0, Math.PI * 0.8);
    const hood = new THREE.Mesh(hoodG, ROBE);
    hood.scale.set(1, 1.15, 1.2); hood.position.set(0, 0.17, -0.01);
    const hoodIn = new THREE.Mesh(new THREE.SphereGeometry(0.185, 16, 10), ROBE_IN);
    hoodIn.scale.set(1, 1.12, 1.15); hoodIn.position.copy(hood.position);
    const peak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 10).rotateX(-2.2).translate(0, 0.27, -0.2), ROBE);
    this.head.add(hood, hoodIn, peak);
    const skull = new THREE.Group();
    skull.position.set(0, 0.14, 0.055);
    const cran = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), BONE); cran.scale.set(0.9, 1.04, 1.02);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.045, 0.08).translate(0, -0.082, 0.032), BONE);
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.07).translate(0, -0.03, 0.04), BONE);
    skull.add(cran, jaw, cheek);
    for (const s of [-1, 1]) {
      const sock = new THREE.Mesh(new THREE.SphereGeometry(0.029, 10, 8), HOLE); sock.position.set(s * 0.036, 0.008, 0.077); sock.scale.set(1, 0.85, 0.6);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 8, 6), EYE); eye.position.set(s * 0.036, 0.006, 0.093);
      skull.add(sock, eye);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.03, 3).rotateX(Math.PI).translate(0, -0.035, 0.093), HOLE);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.004, 0.01).translate(0, -0.072, 0.079), HOLE);
    for (let k = -2; k <= 2; k++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.012, 0.006), HOLE); t.position.set(k * 0.013, -0.072, 0.08); skull.add(t); }
    skull.add(nose, mouth);
    this.head.add(skull);
    this.eyes = EYE;
    // rękawy i dłonie (dzieci root, liczone co klatkę)
    const sleeveG = new THREE.CylinderGeometry(0.11, 0.07, 1, 12, 1, true).translate(0, 0.5, 0);
    this.sleeves = [new THREE.Mesh(sleeveG, ROBE), new THREE.Mesh(sleeveG, ROBE)];
    this.hands = [0, 1].map(() => { const g = new THREE.Group(); for (const p of handGeo()) g.add(new THREE.Mesh(p, BONE)); return g; });
    this.root.add(...this.sleeves, ...this.hands);
    // kosa
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);
    const snath = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.024, 1.95, 8).translate(0, 0.325, 0), WOOD);
    const nib = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.15, 6).rotateZ(Math.PI / 2).translate(0.07, 0.5, 0), WOOD);
    const s = new THREE.Shape();
    s.moveTo(0, 0.035);
    s.quadraticCurveTo(0.45, 0.17, 0.98, -0.07);
    s.quadraticCurveTo(0.5, 0.02, 0.0, -0.065);
    s.closePath();
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false, curveSegments: 16 }).translate(0, 1.27, -0.004), METAL);
    const ferrule = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.04).translate(0, 1.27, 0), METAL);
    this.pivot.add(snath, nib, blade, ferrule);
    this.blade = blade;
    for (const m of [snath, blade, ...this.sleeves]) m.castShadow = true;
    // stan animacji
    this.pose = { ...POSES.carry };
    this.walk = 0; this.twist = 0; this.lookAt = null; this.breath = 0;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion();
  }

  // punkt na kosie (lokalny) w układzie root
  scytheLocal(x, y, z, out) { return out.set(x, y, z).applyQuaternion(this.pivot.quaternion).add(this.pivot.position); }
  bladeTipWorld(out = new THREE.Vector3()) { this.scytheLocal(0.95, 1.2, 0, out); return this.root.localToWorld(out); }

  // podmiana na model GLB (szkielet Mixamo + animacja biegu)
  useModel(gltf) {
    const m = gltf.scene;
    m.scale.setScalar(MODEL_SCALE);
    this.root.add(m);
    this.model = m;
    this.body.visible = false;
    for (const o of [...this.sleeves, ...this.hands]) o.visible = false;
    const B = {};
    m.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } if (o.isBone || o.name === 'headfront') B[o.name.replace('mixamorig', '')] = o; });
    this.B = B;
    m.updateMatrixWorld(true);
    // świecące oczy (żar) w oczodołach
    const glow = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'); const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,220,150,1)'); g.addColorStop(0.25, 'rgba(255,120,30,0.9)'); g.addColorStop(1, 'rgba(255,40,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
    this.eyeSprites = [];
    for (const sx of [-1, 1]) {
      const w = m.localToWorld(new THREE.Vector3(sx * 0.036 + 0.002, 1.503, 0.15));
      const e = new THREE.Group(); e.position.copy(B.Head.worldToLocal(w)); e.position.z += 0.02; B.Head.add(e);
      // bez testu głębi (oczodoły są głęboko); chowane, gdy patrzysz na tył głowy
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
      sp.scale.setScalar(0.065); sp.renderOrder = 30;
      e.add(sp); this.eyeSprites.push(sp);
    }
    this.mixer = new THREE.AnimationMixer(m);
    this.run = this.mixer.clipAction(gltf.animations[0]);
    this.run.play(); this.run.setEffectiveWeight(0);
    this.ww = 0;
  }
  updateModel(dt, moving, speed) {
    const B = this.B;
    // chód = zwolniony bieg o zmniejszonym zasięgu (mieszany z pozą spoczynkową)
    this.ww += ((moving ? 0.5 : 0) - this.ww) * Math.min(1, dt * 3);
    this.run.setEffectiveWeight(this.ww);
    this.run.timeScale = 0.27 * Math.max(0.4, speed / 0.5);
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
    // skręt tułowia (zamach)
    if (Math.abs(this.twist) > 1e-3) {
      const sp = B.Spine1; sp.getWorldQuaternion(_q2); _q.setFromAxisAngle(Y, this.twist); _q2.premultiply(_q);
      sp.parent.getWorldQuaternion(_q3).invert(); sp.quaternion.copy(_q3.multiply(_q2)); sp.updateMatrixWorld(true);
    }
    // głowa patrzy na gracza
    if (this.lookAt) aimBone(B.Head, B.headfront.getWorldPosition(new THREE.Vector3()), this.lookAt, 0.8, 0.9);
    // ręce na kosie
    const piv = this.root.localToWorld(this.pivot.position.clone());
    const pr = this.root.localToWorld(new THREE.Vector3(-0.6, 0.9, -0.35)), pl = this.root.localToWorld(new THREE.Vector3(0.6, 0.9, -0.35));
    solveArm(B.RightArm, B.RightForeArm, B.RightHand, piv, pr);
    const lh = this.pose.lh;
    if (lh > 0.01) {
      const grip = this.root.localToWorld(this.scytheLocal(0, GRIP2, 0, new THREE.Vector3()));
      const cur = B.LeftHand.getWorldPosition(new THREE.Vector3());
      solveArm(B.LeftArm, B.LeftForeArm, B.LeftHand, cur.lerp(grip, lh), pl);
    }
    const fl = 0.85 + 0.15 * Math.sin(this.breath * 23) * Math.sin(this.breath * 7.3);
    let front = true;
    if (this.viewer) {
      const hp = B.Head.getWorldPosition(new THREE.Vector3()), hf = B.headfront.getWorldPosition(new THREE.Vector3()).sub(hp).normalize();
      front = hf.dot(this.viewer.clone().sub(hp).normalize()) > 0.25;
    }
    for (const s of this.eyeSprites) { s.scale.setScalar(0.065 * fl); s.visible = front; }
  }

  update(dt, moving, speed = 0.5) {
    this.breath += dt;
    if (this.model) {
      const p = this.pose;
      this.pivot.position.set(p.px, p.py, p.pz);
      this.pivot.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
      this.pivot.updateMatrix();
      this.updateModel(dt, moving, speed);
      return;
    }
    const bob = moving ? Math.abs(Math.sin(this.walk)) * 0.035 : Math.sin(this.breath * 1.3) * 0.006;
    const sway = moving ? Math.sin(this.walk) * 0.035 : 0;
    this.body.position.y = bob;
    this.body.rotation.set(0, this.twist, sway, 'YXZ');
    this.robe.rotation.x = moving ? Math.sin(this.walk * 2) * 0.02 : 0;
    // głowa patrzy na cel (lokalnie)
    if (this.lookAt) {
      const t = this.root.worldToLocal(this._v.copy(this.lookAt));
      const hx = 0, hy = 1.64 + bob + 0.15, hz = 0;
      const yaw = THREE.MathUtils.clamp(Math.atan2(t.x - hx, t.z - hz) - this.twist, -1.1, 1.1);
      const pitch = THREE.MathUtils.clamp(Math.atan2(-(t.y - hy), Math.hypot(t.x - hx, t.z - hz)), -0.6, 0.7);
      this.head.rotation.x += (pitch - this.head.rotation.x) * Math.min(1, dt * 4);
      this.head.rotation.y += (yaw - this.head.rotation.y) * Math.min(1, dt * 4);
      this.head.rotation.order = 'YXZ';
    }
    // kosa
    const p = this.pose;
    const carryBob = p.lh < 0.5 ? bob : 0;
    this.pivot.position.set(p.px, p.py + carryBob, p.pz);
    this.pivot.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    this.pivot.updateMatrix();
    // ręce: prawa trzyma kosę w pivocie, lewa wisi albo chwyta drzewce
    const c = Math.cos(this.twist), sn = Math.sin(this.twist);
    const sh = (x) => new THREE.Vector3(x * c, 1.5 + bob, -x * sn);
    const right = this.pivot.position.clone();
    const hang = new THREE.Vector3(0.27 * c + 0.06 * sn, 0.9 + bob, -0.27 * sn + 0.06 * c);
    const grip = this.scytheLocal(0, GRIP2, 0, new THREE.Vector3());
    const left = hang.lerp(grip, p.lh);
    this.limb(0, sh(-0.24), right);
    this.limb(1, sh(0.24), left);
  }
  limb(k, from, to) {
    const d = this._w.subVectors(to, from), L = Math.max(0.22, d.length());
    const sl = this.sleeves[k];
    sl.position.copy(from);
    sl.quaternion.setFromUnitVectors(Y, d.clone().normalize());
    sl.scale.set(1, L - 0.04, 1);
    const h = this.hands[k];
    h.position.copy(from).addScaledVector(d.clone().normalize(), L - 0.07);
    h.quaternion.copy(sl.quaternion);
  }
}
