import * as THREE from 'three';

// Manipulacja stołem: jedna ręka = przesuwanie + obrót wokół pionu,
// dwie ręce = skalowanie, obrót i przesuwanie (stół zawsze pozostaje poziomy).
const yawOf = (q) => {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return Math.atan2(f.x, f.z);
};
const rotY = (v, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return new THREE.Vector3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
};

export class TableManipulator {
  constructor(root) {
    this.root = root;
    this.hands = new Map(); // grip object -> true
    this.state = null;
    this.minScale = 0.15;
    this.maxScale = 25;
  }

  grab(grip) { this.hands.set(grip, true); this.begin(); }
  release(grip) { this.hands.delete(grip); this.begin(); }
  get active() { return this.hands.size > 0; }

  handPose(grip) {
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    grip.getWorldPosition(p); grip.getWorldQuaternion(q);
    return { p, q };
  }

  begin() {
    const grips = [...this.hands.keys()];
    const r = this.root;
    if (grips.length === 0) { this.state = null; return; }
    if (grips.length === 1) {
      const h = this.handPose(grips[0]);
      this.state = { mode: 1, grip: grips[0], p0: h.p, yaw0: yawOf(h.q), T0: r.position.clone(), ry0: r.rotation.y };
    } else {
      const a = this.handPose(grips[0]).p, b = this.handPose(grips[1]).p;
      this.state = {
        mode: 2, ga: grips[0], gb: grips[1],
        mid0: a.clone().add(b).multiplyScalar(0.5),
        dist0: Math.max(0.02, a.distanceTo(b)),
        ang0: Math.atan2(b.x - a.x, b.z - a.z),
        T0: r.position.clone(), ry0: r.rotation.y, s0: r.scale.x,
      };
    }
  }

  update() {
    const st = this.state;
    if (!st) return;
    const r = this.root;
    if (st.mode === 1) {
      const h = this.handPose(st.grip);
      const dyaw = yawOf(h.q) - st.yaw0;
      const off = rotY(st.T0.clone().sub(st.p0), dyaw);
      r.position.copy(h.p).add(off);
      r.rotation.y = st.ry0 + dyaw;
    } else {
      const a = this.handPose(st.ga).p, b = this.handPose(st.gb).p;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      let s = a.distanceTo(b) / st.dist0;
      const ns = THREE.MathUtils.clamp(st.s0 * s, this.minScale, this.maxScale);
      s = ns / st.s0;
      const dyaw = Math.atan2(b.x - a.x, b.z - a.z) - st.ang0;
      const off = rotY(st.T0.clone().sub(st.mid0), dyaw).multiplyScalar(s);
      r.position.copy(mid).add(off);
      r.rotation.y = st.ry0 + dyaw;
      r.scale.setScalar(ns);
    }
  }

  // skalowanie / obrót gałką wokół zadanego punktu (np. środka stołu)
  nudge(pivotWorld, dScaleFactor, dYaw) {
    const r = this.root;
    const ns = THREE.MathUtils.clamp(r.scale.x * dScaleFactor, this.minScale, this.maxScale);
    const k = ns / r.scale.x;
    const off = rotY(r.position.clone().sub(pivotWorld), dYaw).multiplyScalar(k);
    r.position.copy(pivotWorld).add(off);
    r.rotation.y += dYaw;
    r.scale.setScalar(ns);
    if (this.active) this.begin();
  }
}
