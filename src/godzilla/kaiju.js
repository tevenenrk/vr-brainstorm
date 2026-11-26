import * as THREE from 'three';

// Ciało potwora w układzie rig-u (metry gracza; rig jest przeskalowany do rozmiaru potwora).
// Układ ciała: x w prawo, y w górę, −z do przodu.
const SKIN = new THREE.MeshLambertMaterial({ color: 0x4a5c4e, flatShading: true });
const SKIN2 = new THREE.MeshLambertMaterial({ color: 0x3a4a3e, flatShading: true });
const BELLY = new THREE.MeshLambertMaterial({ color: 0x6a6650, flatShading: true });
const CLAW = new THREE.MeshLambertMaterial({ color: 0xf0e8d0, emissive: 0x2a2620 });

function plateShape(s) {
  const sh = new THREE.Shape();
  const pts = [[0, 0], [0.35, 0.25], [0.22, 0.32], [0.5, 0.62], [0.28, 0.6], [0.3, 0.95], [0, 0.7], [-0.3, 0.95], [-0.28, 0.6], [-0.5, 0.62], [-0.22, 0.32], [-0.35, 0.25]];
  sh.moveTo(pts[0][0] * s, pts[0][1] * s); for (const [x, y] of pts.slice(1)) sh.lineTo(x * s, y * s); sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }).translate(0, 0, -0.006);
}
function bumpy(geo, amp, seed = 1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = Math.sin(x * 61 + seed) * Math.sin(y * 47 + seed * 2) * Math.sin(z * 53 + seed * 3); p.setXYZ(i, x * (1 + n * amp), y, z * (1 + n * amp)); }
  geo.computeVertexNormals(); return geo;
}
function clawHand(side) {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(bumpy(new THREE.BoxGeometry(0.085, 0.05, 0.1, 3, 2, 3), 0.15, side + 3), SKIN); palm.position.set(0, 0, 0.0); g.add(palm);
  for (let k = 0; k < 4; k++) {
    const x = -0.03 + k * 0.02, f = new THREE.Group(); f.position.set(x, 0, -0.05); f.rotation.x = 0.35; g.add(f);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.045, 6).rotateX(Math.PI / 2).translate(0, 0, -0.022), SKIN2); f.add(seg);
    const cl = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.035, 5).rotateX(-Math.PI / 2 - 0.5).translate(0, -0.006, -0.058), CLAW); f.add(cl);
  }
  const th = new THREE.Group(); th.position.set(-side * 0.045, -0.005, -0.01); th.rotation.set(0.3, side * 0.7, 0); g.add(th);
  th.add(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.04, 6).rotateX(Math.PI / 2).translate(0, 0, -0.02), SKIN2));
  th.add(new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 5).rotateX(-Math.PI / 2).translate(0, 0, -0.05), CLAW));
  return g;
}

export class Kaiju {
  constructor(rig, scene) {
    this.rig = rig; this.scene = scene;
    this.body = new THREE.Group(); rig.add(this.body);
    const B = this.body;
    const torso = new THREE.Mesh(bumpy(new THREE.CylinderGeometry(0.17, 0.26, 0.78, 12, 4), 0.06, 2), SKIN); torso.position.set(0, 1.02, 0.22); torso.rotation.x = 0.12; B.add(torso);
    const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.62, 10, 1, false, -1.0, 2.0), BELLY); belly.position.set(0, 1.0, 0.2); belly.rotation.x = 0.12; belly.rotation.y = Math.PI; belly.scale.set(1.05, 1, 1.12); B.add(belly);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.3, 10), SKIN); neck.position.set(0, 1.34, 0.17); neck.rotation.x = -0.45; B.add(neck);
    const hips = new THREE.Mesh(bumpy(new THREE.SphereGeometry(0.25, 12, 8), 0.06, 4), SKIN); hips.position.set(0, 0.72, 0.24); hips.scale.set(1.05, 0.8, 1); B.add(hips);
    // nogi
    this.legs = [-1, 1].map((sd) => {
      const thigh = new THREE.Mesh(bumpy(new THREE.CylinderGeometry(0.12, 0.16, 0.4, 10), 0.06, sd + 5), SKIN); B.add(thigh);
      const shin = new THREE.Mesh(bumpy(new THREE.CylinderGeometry(0.1, 0.125, 0.4, 10), 0.05, sd + 7), SKIN); B.add(shin);
      const foot = new THREE.Group(); B.add(foot);
      foot.add(new THREE.Mesh(bumpy(new THREE.BoxGeometry(0.22, 0.09, 0.3, 2, 1, 2), 0.1, sd), SKIN2).translateY(0.045));
      for (let k = 0; k < 3; k++) foot.add(new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 5).rotateX(-Math.PI / 2).translate(-0.065 + k * 0.065, 0.025, -0.18), CLAW));
      return { sd, thigh, shin, foot, phase: sd > 0 ? Math.PI : 0, plant: new THREE.Vector3(), down: true };
    });
    // płyty grzbietowe (świecą przy ziejeniu)
    this.plateMat = new THREE.MeshLambertMaterial({ color: 0xbab4a4, emissive: 0x000000, flatShading: true });
    for (let k = 0; k < 9; k++) {
      const s = 0.2 - Math.abs(k - 3) * 0.02 - Math.max(0, k - 4) * 0.012, pl = new THREE.Mesh(plateShape(s), this.plateMat);
      pl.position.set(0, 1.4 - k * 0.09, 0.3 + k * 0.03 + Math.max(0, k - 4) * 0.02);
      pl.rotation.set(-0.9 + k * 0.05, Math.PI / 2, 0); pl.rotateX(0); B.add(pl);
    }
    // ogon: łańcuch węzłów w świecie (bezwładność przy skrętach i krokach)
    this.TN = 11;
    this.tailMeshes = []; this.tailW = []; this.tailP = [];
    for (let k = 0; k < this.TN; k++) {
      const r0 = 0.15 * (1 - k / this.TN) + 0.02, r1 = 0.15 * (1 - (k + 1) / this.TN) + 0.02;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 1, 9).translate(0, 0.5, 0), SKIN); rig.add(m); this.tailMeshes.push(m);
      if (k % 2 === 0 && k < this.TN - 1) { const pl = new THREE.Mesh(plateShape(0.09 * (1 - k / this.TN) + 0.03), this.plateMat); m.add(pl); pl.position.set(0, 0.5, 0); pl.userData.tail = true; m.userData.plate = pl; }
      this.tailW.push(new THREE.Vector3()); this.tailP.push(new THREE.Vector3());
    }
    this.segLen = 0.15;
    // ramiona i dłonie
    this.arms = [-1, 1].map((sd) => {
      const up = new THREE.Mesh(bumpy(new THREE.CylinderGeometry(0.055, 0.07, 1, 10).translate(0, 0.5, 0), 0.08, sd + 9), SKIN);
      const lo = new THREE.Mesh(bumpy(new THREE.CylinderGeometry(0.045, 0.058, 1, 10).translate(0, 0.5, 0), 0.08, sd + 11), SKIN);
      const el = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), SKIN2);
      rig.add(up, lo, el); return { up, lo, el };
    });
    this.hands = [-1, 1].map((sd) => { const h = clawHand(sd); h.scale.setScalar(1.55); rig.add(h); return h; });
    // ziejący promień
    const bg = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true).translate(0, 0.5, 0);
    this.beamOuter = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0x3a8cff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    this.beamCore = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xdff0ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    this.beamOuter.visible = this.beamCore.visible = false; scene.add(this.beamOuter, this.beamCore);
    this.beamLight = new THREE.PointLight(0x6aa8ff, 0, 400, 1.2); scene.add(this.beamLight);
    this.yaw = 0; this.walkT = 0; this.onStep = null; this.glow = 0; this.inited = false;
  }
  // head: pozycja głowy w rig-u; yaw: kierunek tułowia; speed: prędkość chodu (m/s świata)
  update(dt, head, yaw, speed, handsL, S) {
    const B = this.body;
    this.yaw = yaw;
    B.position.set(head.x, 0, head.z); B.rotation.y = yaw;
    B.updateMatrix();
    // nogi: krok, gdy idzie (pozycje stóp w rig-u)
    const moving = speed > 0.5;
    this.walkT += dt * (moving ? 1.6 + speed / S * 3 : 0);
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    for (const L of this.legs) {
      const ph = this.walkT * Math.PI + L.phase, sw = moving ? Math.sin(ph) : 0, lift = moving ? Math.max(0, Math.cos(ph)) * 0.09 : 0;
      const base = new THREE.Vector3(head.x, 0, head.z).addScaledVector(right, L.sd * 0.17).addScaledVector(fwd, 0.16 + sw * 0.2);
      base.y = lift;
      const down = lift < 0.005;
      if (down && !L.down && this.onStep) this.onStep(base.clone(), L.sd);
      L.down = down;
      L.foot.position.copy(base).applyMatrix4(B.matrix.clone().invert()); L.foot.rotation.y = 0;
      const hip = new THREE.Vector3(L.sd * 0.14, 0.76, 0.22), ankle = L.foot.position.clone().add(new THREE.Vector3(0, 0.07, 0.03));
      const knee = hip.clone().lerp(ankle, 0.5).add(new THREE.Vector3(0, 0.02, -0.12));
      const seg = (m, a, b) => { m.position.copy(a).lerp(b, 0.5); m.scale.set(1, a.distanceTo(b) / 0.4, 1); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); };
      seg(L.thigh, hip, knee); seg(L.shin, knee, ankle);
      L.world = this.rig.localToWorld(base.clone());
    }
    // ogon (świat): węzeł 0 przyczepiony z tyłu bioder, dalej łańcuch z bezwładnością i kołysaniem
    const rootL = new THREE.Vector3(0, 0.64, 0.44).applyMatrix4(B.matrix), root = this.rig.localToWorld(rootL.clone());
    const back = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw + this.rig.rotation.y);
    const segW = this.segLen * S;
    if (!this.inited) { for (let k = 0; k < this.TN; k++) { this.tailW[k].copy(root).addScaledVector(back, segW * k); this.tailW[k].y = Math.max(0.5 * S * 0.1, root.y - k * segW * 0.12); this.tailP[k].copy(this.tailW[k]); } this.inited = true; }
    const sway = Math.sin(performance.now() * 0.0012) * 0.25 + (this.swing || 0);
    this.tailVel = this.tailVel || this.tailW.map(() => new THREE.Vector3());
    let prev = root;
    for (let k = 0; k < this.TN; k++) {
      const p = this.tailW[k], old = this.tailP[k].copy(p);
      // cel: przedłużenie poprzedniego segmentu ku tyłowi, opadające ku ziemi
      const dirK = back.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), sway * (k / this.TN));
      const want = prev.clone().addScaledVector(dirK, segW); want.y = Math.max(prev.y - segW * 0.25, 0.03 * S);
      p.lerp(want, Math.min(1, dt * (5.5 - k * 0.32)));
      const d = p.clone().sub(prev); d.setLength(segW); p.copy(prev).add(d);
      if (p.y < 0.025 * S) p.y = 0.025 * S;
      this.tailVel[k].copy(p).sub(old).divideScalar(Math.max(dt, 1e-3));
      const m = this.tailMeshes[k], a = this.rig.worldToLocal(prev.clone()), b = this.rig.worldToLocal(p.clone());
      m.position.copy(a); m.scale.set(1, a.distanceTo(b), 1); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      if (m.userData.plate) m.userData.plate.scale.set(1, 1 / Math.max(0.01, m.scale.y), 1);
      prev = p;
    }
    // ramiona: od barku do nadgarstka
    for (let i = 0; i < 2; i++) {
      const sd = i === 0 ? -1 : 1, sh = new THREE.Vector3(sd * 0.21, 1.33, 0.02).applyMatrix4(B.matrix);
      const h = handsL[i];
      const wr = h.pos.clone().add(new THREE.Vector3(0, 0, 0.06).applyQuaternion(h.q));
      // łokieć: dwa odcinki po 0,3 m, staw odchylony w dół i na zewnątrz
      const A = this.arms[i], d = sh.distanceTo(wr), L1 = 0.3, mid = sh.clone().lerp(wr, 0.5);
      const bend = Math.sqrt(Math.max(0, L1 * L1 - (d / 2) ** 2));
      const axis = wr.clone().sub(sh).normalize(), pole = new THREE.Vector3(sd * 0.5, -1, 0.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      pole.sub(axis.clone().multiplyScalar(pole.dot(axis))).normalize();
      const elbow = mid.addScaledVector(pole, bend);
      const seg = (m, a, b) => { m.position.copy(a); m.scale.set(1, a.distanceTo(b), 1); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); };
      seg(A.up, sh, elbow); seg(A.lo, elbow, wr); A.el.position.copy(elbow);
      this.hands[i].position.copy(h.pos); this.hands[i].quaternion.copy(h.q);
    }
    this.plateMat.emissive.setRGB(0.1 * this.glow, 0.45 * this.glow, 1.2 * this.glow);
  }
  // kule kolizyjne (świat): ogon
  tailColliders(S) {
    const out = [];
    for (let k = 2; k < this.TN; k++) out.push({ p: this.tailW[k], r: (0.12 * (1 - k / this.TN) + 0.04) * S, v: this.tailVel ? this.tailVel[k] : new THREE.Vector3(), kind: 'tail', key: 'tail' + k });
    return out;
  }
  setBeam(on, from, to, S, t) {
    this.beamOuter.visible = this.beamCore.visible = on; this.beamLight.intensity = on ? 3e4 : 0;
    if (!on) return;
    const d = to.clone().sub(from), L = d.length(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const fl = 1 + Math.sin(t * 60) * 0.12 + Math.sin(t * 23) * 0.08;
    for (const [m, r] of [[this.beamOuter, 0.035 * S * fl], [this.beamCore, 0.014 * S * fl]]) { m.position.copy(from); m.quaternion.copy(q); m.scale.set(r, L, r); }
    this.beamLight.position.copy(to).addScaledVector(d, -6);
  }
}
