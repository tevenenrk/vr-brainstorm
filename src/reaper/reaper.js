import * as THREE from 'three';

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
  windup: { px: -0.26, py: 1.6, pz: 0.18, pitch: Math.PI / 2 - 0.5, yaw: -2.3, lh: 1 },
};
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
    const nib = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.15, 6).rotateZ(Math.PI / 2).translate(0.07, 0.45, 0), WOOD);
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

  update(dt, moving) {
    this.breath += dt;
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
    const grip = this.scytheLocal(0, 0.45, 0, new THREE.Vector3());
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
