import * as THREE from 'three';
import { ParticlePool } from '../effects.js';

// Broń, przedmioty (magazynki, granaty), granaty z fizyką, miniguny i efekty.
// Modele: uchwyt w początku układu, lufa wzdłuż −Z, góra +Y.
const STEEL = new THREE.MeshLambertMaterial({ color: 0x2a2c30 });
const DARK = new THREE.MeshLambertMaterial({ color: 0x1a1b1e });
const WOODM = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });
const OLIVE = new THREE.MeshLambertMaterial({ color: 0x4a5236 });
const BRASS = new THREE.MeshLambertMaterial({ color: 0xb08a3a });
const bx = (w, h, d, x, y, z, m = STEEL) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cyl = (r, l, x, y, z, m = STEEL, seg = 10) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, seg).rotateX(Math.PI / 2), m); o.position.set(x, y, z); return o; };

export const GUNS = {
  rifle: { name: 'Karabin', ammo: 'rifle', mag: 30, auto: true, rate: 11, dmg: [36, 48], head: 100, spread: 0.0012, recoil: 0.012, muzzle: new THREE.Vector3(0, 0.045, -0.66), well: new THREE.Vector3(0, -0.03, -0.12), fore: new THREE.Vector3(0, 0.0, -0.34), sound: 'rifle' },
  sniper: { name: 'Snajperka', ammo: 'sniper', mag: 5, auto: false, rate: 0.9, dmg: [110, 140], head: 200, spread: 0.0002, recoil: 0.07, muzzle: new THREE.Vector3(0, 0.045, -0.98), well: new THREE.Vector3(0, -0.03, -0.1), fore: new THREE.Vector3(0, 0.0, -0.42), scope: new THREE.Vector3(0, 0.105, -0.06), sound: 'sniper' },
  launcher: { name: 'Granatnik', ammo: 'gl', mag: 1, auto: false, rate: 1.2, projectile: true, speed: 48, spread: 0.004, recoil: 0.09, muzzle: new THREE.Vector3(0, 0.03, -0.56), well: new THREE.Vector3(0, 0.07, -0.02), fore: new THREE.Vector3(0, -0.04, -0.3), sound: 'gl' },
  pistol: { name: 'Pistolet', ammo: 'pistol', mag: 12, auto: false, rate: 6, dmg: [28, 38], head: 100, spread: 0.003, recoil: 0.03, muzzle: new THREE.Vector3(0, 0.065, -0.17), well: new THREE.Vector3(0, -0.085, 0.015), sound: 'pistol' },
};
export const POUCH_CAP = { primary: 4, pistol: 3, grenade: 3 };
export const AMMO_NAME = { rifle: 'karabin', sniper: 'snajperka', gl: 'granatnik', pistol: 'pistolet' };

export function magMesh(type) {
  const g = new THREE.Group();
  if (type === 'rifle') {
    const a = bx(0.026, 0.1, 0.06, 0, -0.05, 0, DARK), b = bx(0.026, 0.09, 0.058, 0, -0.135, -0.012, DARK);
    b.rotation.x = 0.25; g.add(a, b);
    g.add(bx(0.018, 0.012, 0.045, 0, 0.004, 0, BRASS));
  } else if (type === 'sniper') { g.add(bx(0.024, 0.075, 0.075, 0, -0.037, 0, DARK), bx(0.016, 0.012, 0.06, 0, 0.004, 0, BRASS));
  } else if (type === 'gl') {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 10).translate(0, -0.035, 0), BRASS));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, -0.07, 0), OLIVE));
  } else { g.add(bx(0.02, 0.11, 0.03, 0, -0.055, 0, DARK), bx(0.024, 0.012, 0.034, 0, -0.113, 0, DARK)); g.add(bx(0.012, 0.01, 0.022, 0, 0.003, 0, BRASS)); }
  g.userData.top = new THREE.Vector3();
  return g;
}
export function grenadeMesh() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8).scale(1, 1.25, 1), OLIVE));
  g.add(bx(0.016, 0.022, 0.016, 0, 0.048, 0, STEEL));
  const lever = bx(0.008, 0.07, 0.012, 0.022, 0.025, 0, STEEL); lever.rotation.z = -0.25; g.add(lever);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, 4, 12), BRASS); ring.position.set(-0.02, 0.055, 0); g.add(ring);
  g.userData.ring = ring;
  return g;
}
function counterPanel() {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.02), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  m.userData.draw = (n, max) => { const c = cv.getContext('2d'); c.fillStyle = '#0a0c08'; c.fillRect(0, 0, 64, 32); c.fillStyle = n === 0 ? '#ff5040' : n < max * 0.3 ? '#ffc040' : '#a0ff80'; c.font = 'bold 26px monospace'; c.textAlign = 'center'; c.fillText(n === null ? '--' : String(n), 32, 26); tex.needsUpdate = true; };
  return m;
}
export function rifleMesh() {
  const g = new THREE.Group();
  const grip = bx(0.03, 0.1, 0.04, 0, -0.035, 0.01, DARK); grip.rotation.x = -0.25; g.add(grip);
  g.add(bx(0.05, 0.075, 0.32, 0, 0.035, -0.09), bx(0.05, 0.055, 0.24, 0, 0.03, -0.34, WOODM), cyl(0.011, 0.3, 0, 0.045, -0.52), cyl(0.016, 0.05, 0, 0.045, -0.66, DARK));
  g.add(bx(0.04, 0.085, 0.26, 0, 0.015, 0.2, WOODM), bx(0.045, 0.1, 0.03, 0, 0.0, 0.33, DARK));
  // celownik kolimatorowy
  g.add(bx(0.03, 0.012, 0.06, 0, 0.078, -0.07, DARK), bx(0.01, 0.012, 0.012, 0, 0.088, -0.075, DARK));     // podstawa pod okienkiem (nic nie zasłania szkła)
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.003, 6, 20), DARK); frame.position.set(0, 0.112, -0.075); g.add(frame);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.02, 20), new THREE.MeshBasicMaterial({ color: 0x7090a0, transparent: true, opacity: 0.1, depthWrite: false })); glass.position.copy(frame.position); g.add(glass);
  g.add(bx(0.006, 0.03, 0.006, 0, 0.075, -0.6, DARK));
  const cnt = counterPanel(); cnt.position.set(-0.026, 0.05, -0.12); cnt.rotation.y = -Math.PI / 2; g.add(cnt);
  g.userData.counter = cnt; g.userData.sight = frame.position.clone(); g.userData.sightR = 0.02;
  return g;
}
export function sniperMesh() {
  const g = new THREE.Group();
  const grip = bx(0.03, 0.1, 0.04, 0, -0.04, 0.02, WOODM); grip.rotation.x = -0.35; g.add(grip);
  g.add(bx(0.05, 0.07, 0.36, 0, 0.03, -0.12, WOODM), bx(0.045, 0.06, 0.3, 0, 0.025, -0.44, WOODM), cyl(0.012, 0.6, 0, 0.045, -0.7), cyl(0.017, 0.06, 0, 0.045, -0.98, DARK));
  g.add(bx(0.045, 0.1, 0.3, 0, 0.0, 0.2, WOODM), bx(0.05, 0.11, 0.03, 0, -0.01, 0.35, DARK));
  // zamek z rączką
  g.add(bx(0.04, 0.04, 0.16, 0, 0.065, -0.04, STEEL)); const bolt = cyl(0.007, 0.05, 0.035, 0.06, 0.0, STEEL); bolt.rotation.set(0, Math.PI / 2, 0); g.add(bolt);
  // luneta: obudowa + soczewka tylna (obraz z kamery lunety) i przednia
  g.add(bx(0.012, 0.02, 0.012, 0, 0.083, -0.1, DARK), bx(0.012, 0.02, 0.012, 0, 0.083, 0.02, DARK));
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.26, 14, 1, true).rotateX(Math.PI / 2), DARK); tube.position.set(0, 0.105, -0.07); g.add(tube);
  g.add(cyl(0.027, 0.06, 0, 0.105, -0.2, DARK, 14), cyl(0.025, 0.04, 0, 0.105, 0.065, DARK, 14));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.021, 20), new THREE.MeshBasicMaterial({ color: 0x223040 })); lens.position.set(0, 0.105, 0.086); g.add(lens);
  const front = new THREE.Mesh(new THREE.CircleGeometry(0.025, 16), new THREE.MeshBasicMaterial({ color: 0x5a7890 })); front.position.set(0, 0.105, -0.231); front.rotation.y = Math.PI; g.add(front);
  const cnt = counterPanel(); cnt.position.set(-0.026, 0.04, -0.15); cnt.rotation.y = -Math.PI / 2; g.add(cnt);
  g.userData.counter = cnt; g.userData.lens = lens;
  return g;
}
export function launcherMesh() {
  const g = new THREE.Group();
  const grip = bx(0.03, 0.1, 0.04, 0, -0.045, 0.01, DARK); grip.rotation.x = -0.25; g.add(grip);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.62, 14, 1, true).rotateX(Math.PI / 2), OLIVE); tube.position.set(0, 0.03, -0.25); g.add(tube);
  g.add(cyl(0.05, 0.04, 0, 0.03, -0.54, DARK, 14), cyl(0.05, 0.04, 0, 0.03, 0.04, DARK, 14));
  const fg = bx(0.03, 0.09, 0.04, 0, -0.04, -0.3, DARK); fg.rotation.x = 0.1; g.add(fg);
  g.add(bx(0.04, 0.06, 0.22, 0, 0.0, 0.16, DARK), bx(0.045, 0.09, 0.03, 0, -0.01, 0.27, DARK));
  // celownik ramkowy
  g.add(bx(0.03, 0.05, 0.004, 0, 0.1, -0.12, DARK), bx(0.006, 0.02, 0.006, 0, 0.088, -0.45, DARK));
  const cnt = counterPanel(); cnt.position.set(-0.05, 0.03, -0.1); cnt.rotation.y = -Math.PI / 2; g.add(cnt);
  g.userData.counter = cnt;
  return g;
}
export function pistolMesh() {
  const g = new THREE.Group();
  const grip = bx(0.028, 0.11, 0.04, 0, -0.03, 0.01, DARK); grip.rotation.x = -0.22; g.add(grip);
  g.add(bx(0.03, 0.035, 0.19, 0, 0.055, -0.065), bx(0.026, 0.02, 0.12, 0, 0.03, -0.07, DARK));
  const cnt = counterPanel(); cnt.scale.setScalar(0.7); cnt.position.set(-0.016, 0.055, -0.04); cnt.rotation.y = -Math.PI / 2; g.add(cnt);
  g.userData.counter = cnt;
  return g;
}
export function knifeMesh() {
  const g = new THREE.Group();
  g.add(bx(0.025, 0.03, 0.11, 0, 0, 0.02, WOODM), bx(0.06, 0.012, 0.012, 0, 0, -0.04, STEEL));
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.028, 0.17), new THREE.MeshLambertMaterial({ color: 0xb8bcc4 })); blade.position.set(0, 0.002, -0.13); g.add(blade);
  return g;
}

// ---------- przedmioty w świecie ----------
export class Items {
  constructor(map, parent) {
    this.map = map; this.parent = parent; this.list = [];
    this.onBounce = null; this.onExplode = null;
  }
  add(kind, type, pos, vel, extra = {}) {
    const mesh = extra.mesh || (kind === 'grenade' ? grenadeMesh() : magMesh(type));
    mesh.position.copy(pos);
    this.parent.add(mesh);
    const it = { kind, type, mesh, pos: mesh.position, vel: vel ? vel.clone() : new THREE.Vector3(), held: null, rest: false, rounds: extra.rounds ?? (kind === 'mag' ? GUNS[type].mag : 0), armed: !!extra.armed, fuse: extra.fuse ?? 3.6, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(), age: 0, ...extra };
    if (it.kind === 'grenade' && it.armed) it.mesh.userData.ring.visible = false;
    this.list.push(it);
    return it;
  }
  remove(it) { this.parent.remove(it.mesh); const i = this.list.indexOf(it); if (i >= 0) this.list.splice(i, 1); }
  nearest(p, r, filter) {
    let best = null, bd = r;
    for (const it of this.list) { if (it.held || it.pull || (filter && !filter(it))) continue; const d = it.pos.distanceTo(p); if (d < bd) { bd = d; best = it; } }
    return best;
  }
  update(dt) {
    const M = this.map, r = 0.04;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      it.age += dt;
      if (it.kind === 'grenade' && it.armed) {
        it.fuse -= dt;
        if (it.fuse <= 0) { const p = it.pos.clone(); if (it.drop) it.drop(it); this.remove(it); if (this.onExplode) this.onExplode(p, it); continue; }
      }
      if (it.held || it.pull) continue;
      if (!it.armed && !it.persist && it.age > 120) { this.remove(it); continue; }
      if (it.rest) continue;
      it.vel.y -= 9.81 * dt;
      const steps = Math.max(1, Math.ceil(it.vel.length() * dt / 0.05)), h = dt / steps;
      for (let k = 0; k < steps; k++) {
        const nx = it.pos.x + it.vel.x * h, nz = it.pos.z + it.vel.z * h, ny = it.pos.y + it.vel.y * h;
        // ściany okopu: odbicie poziome
        if (M.solid(nx, ny, it.pos.z) && !M.solid(it.pos.x, ny, it.pos.z)) { it.vel.x *= -0.35; } else it.pos.x = nx;
        if (M.solid(it.pos.x, ny, nz) && !M.solid(it.pos.x, ny, it.pos.z)) { it.vel.z *= -0.35; } else it.pos.z = nz;
        const g = M.heightAt(it.pos.x, it.pos.z) + r;
        if (ny < g && it.vel.y < 0) {
          it.pos.y = g;
          if (Math.abs(it.vel.y) > 1.2 && this.onBounce) this.onBounce(it);
          it.vel.y *= -0.28; it.vel.x *= 0.55; it.vel.z *= 0.55;
          if (Math.abs(it.vel.y) < 0.4 && Math.hypot(it.vel.x, it.vel.z) < 0.15) { it.rest = true; it.vel.set(0, 0, 0); break; }
        } else it.pos.y = ny;
      }
      it.mesh.rotateOnAxis(it.spin, Math.min(1, it.vel.length()) * dt * 8);
    }
  }
}

// ---------- minigun na stanowisku ----------
export class Minigun {
  constructor(pos, parent) {
    this.pivot = pos.clone();
    this.root = new THREE.Group(); this.root.position.copy(pos); parent.add(this.root);
    // trójnóg na workach
    for (const a of [0, 2.1, 4.2]) {
      const end = new THREE.Vector3(Math.sin(a) * 0.32, -0.42, Math.cos(a) * 0.32), L = end.length();
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, L, 6).translate(0, L / 2, 0), STEEL);
      l.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().normalize()); l.position.set(0, -0.05, 0);
      this.root.add(l);
    }
    this.yawG = new THREE.Group(); this.root.add(this.yawG);
    this.pitchG = new THREE.Group(); this.yawG.add(this.pitchG);
    this.yawG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8).translate(0, -0.05, 0), DARK));
    const P = this.pitchG;
    P.add(bx(0.16, 0.14, 0.34, 0, 0, 0.05, DARK));
    this.barrels = new THREE.Group(); this.barrels.position.set(0, 0, -0.12); P.add(this.barrels);
    this.barrelMat = new THREE.MeshLambertMaterial({ color: 0x3a3c40, emissive: 0x000000 });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, b = cyl(0.011, 0.62, Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.31, this.barrelMat, 6); this.barrels.add(b); }
    this.barrels.add(cyl(0.06, 0.03, 0, 0, -0.1, DARK, 12), cyl(0.06, 0.03, 0, 0, -0.55, DARK, 12));
    // skrzynka amunicji i taśma
    P.add(bx(0.14, 0.14, 0.22, -0.17, -0.06, 0.08, OLIVE));
    // uchwyty łopatkowe z tyłu
    this.handles = [new THREE.Vector3(-0.12, -0.06, 0.48), new THREE.Vector3(0.12, -0.06, 0.48)];
    for (const h of this.handles) { P.add(bx(0.03, 0.12, 0.03, h.x, h.y, h.z, WOODM)); P.add(bx(Math.abs(h.x), 0.02, 0.02, h.x / 2, h.y + 0.05, h.z, DARK)); }
    P.add(bx(0.02, 0.02, 0.32, -0.12, -0.02, 0.32, DARK), bx(0.02, 0.02, 0.32, 0.12, -0.02, 0.32, DARK));
    // wskaźnik temperatury
    this.heatBar = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.016), new THREE.MeshBasicMaterial({ color: 0x40ff60, toneMapped: false }));
    this.heatBar.position.set(0, 0.078, 0.2); this.heatBar.rotation.x = -Math.PI / 2 + 0.3; P.add(this.heatBar);
    const bg = bx(0.13, 0.002, 0.024, 0, 0.075, 0.2, DARK); bg.rotation.x = 0.3; P.add(bg);
    this.muzzleLocal = new THREE.Vector3(0, 0, -0.75);
    this.yaw = 0; this.pitch = 0; this.spin = 0; this.heat = 0; this.over = false; this.acc = 0; this.firing = false;
    this.users = new Set();
  }
  handleWorld(i, out = new THREE.Vector3()) { this.pitchG.updateWorldMatrix(true, false); return out.copy(this.handles[i]).applyMatrix4(this.pitchG.matrixWorld); }
  muzzleWorld(out = new THREE.Vector3()) { this.pitchG.updateWorldMatrix(true, false); return out.copy(this.muzzleLocal).applyMatrix4(this.pitchG.matrixWorld); }
  dirWorld(out = new THREE.Vector3()) { this.pitchG.updateWorldMatrix(true, false); return out.set(0, 0, -1).transformDirection(this.pitchG.matrixWorld); }
  // ręce na uchwytach → kierunek
  aimFromHands(mid, dt) {
    const d = this.pivot.clone().sub(mid);
    const yaw = Math.atan2(-d.x, -d.z), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) - Math.atan2(0.06, 0.48);
    this.aim(yaw, pitch, dt);
  }
  aim(yaw, pitch, dt) {
    yaw = Math.max(-1.3, Math.min(1.3, yaw)); pitch = Math.max(-0.35, Math.min(0.45, pitch));
    const k = Math.min(1, dt * 18);
    this.yaw += (yaw - this.yaw) * k; this.pitch += (pitch - this.pitch) * k;
    this.yawG.rotation.y = this.yaw; this.pitchG.rotation.x = this.pitch;
  }
  // zwraca liczbę strzałów w tej klatce
  update(dt, trigger) {
    const want = trigger && !this.over;
    this.spin = Math.max(0, Math.min(1, this.spin + (want ? dt / 0.35 : -dt / 1.2)));
    this.barrels.rotation.z += this.spin * dt * 45;
    let shots = 0;
    this.firing = want && this.spin > 0.85;
    if (this.firing) {
      this.acc += dt * 42;
      shots = Math.floor(this.acc); this.acc -= shots;
      this.heat += shots / (42 * 7);         // ~7 s ciągłego ognia do przegrzania
      if (this.heat >= 1) { this.heat = 1; this.over = true; this.justOver = true; }
    } else { this.acc = 0; this.heat = Math.max(0, this.heat - dt / (this.over ? 6.5 : 9)); }
    if (this.over && this.heat < 0.3) { this.over = false; this.justCool = true; }
    const h = this.heat;
    this.barrelMat.emissive.setRGB(Math.max(0, h - 0.35) * 1.6, Math.max(0, h - 0.6) * 0.5, 0);
    this.heatBar.scale.x = Math.max(0.02, h); this.heatBar.position.x = -0.06 * (1 - h);
    this.heatBar.material.color.setRGB(this.over ? 1 : Math.min(1, h * 1.6), this.over ? 0.15 : 1 - h * 0.8, 0.2);
    return shots;
  }
}

// ---------- efekty ----------
export class Fx {
  constructor(parent) {
    this.fire = new ParticlePool(parent, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 500, 1);
    this.smoke = new ParticlePool(parent, new THREE.MeshLambertMaterial({ flatShading: true, transparent: true, opacity: 0.85 }), 900, 1);
    const flashTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'); const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.3, 'rgba(255,200,90,0.8)'); g.addColorStop(1, 'rgba(255,120,20,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
    this.flashes = Array.from({ length: 6 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })); s.visible = false; s.userData.t = 0; parent.add(s); return s; });
    this.fi = 0;
  }
  flash(p, size = 0.25) { const s = this.flashes[this.fi = (this.fi + 1) % this.flashes.length]; s.position.copy(p); s.scale.setScalar(size * (0.8 + Math.random() * 0.4)); s.material.rotation = Math.random() * 6; s.visible = true; s.userData.t = 0.05; }
  dirt(p, n = 6) { for (let k = 0; k < n; k++) this.smoke.spawn({ p, v: new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 2), life: 0.5 + Math.random() * 0.6, s0: 0.04, s1: 0.18, c0: 0x6a5840, c1: 0x9a8a70, drag: 0.3, g: 6 }); }
  blood(p) { for (let k = 0; k < 6; k++) this.smoke.spawn({ p, v: new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5), life: 0.35 + Math.random() * 0.3, s0: 0.03, s1: 0.1, c0: 0x8a1010, c1: 0x4a0808, drag: 0.4, g: 5 }); }
  sparks(p) { for (let k = 0; k < 5; k++) this.fire.spawn({ p, v: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), life: 0.15 + Math.random() * 0.15, s0: 0.012, s1: 0.004, c0: 0xffe0a0, c1: 0xff6000, drag: 0.5, g: 9 }); }
  steam(p) { this.smoke.spawn({ p, v: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3), life: 1.2 + Math.random(), s0: 0.04, s1: 0.25, c0: 0xe8e8e8, c1: 0xb8b8b8, drag: 0.6 }); }
  explosion(p, S = 1) {
    for (let k = 0; k < 26; k++) this.fire.spawn({ p, v: new THREE.Vector3((Math.random() - 0.5) * 9 * S, Math.random() * 7 * S, (Math.random() - 0.5) * 9 * S), life: 0.2 + Math.random() * 0.3 * S, s0: 0.3 * S, s1: 0.9 * S, c0: 0xffe8b0, c1: 0x802000, drag: 0.05 });
    for (let k = 0; k < 30; k++) this.smoke.spawn({ p: p.clone().add(new THREE.Vector3(0, 0.2, 0)), v: new THREE.Vector3((Math.random() - 0.5) * 5 * S, 1 + Math.random() * 5 * S, (Math.random() - 0.5) * 5 * S), life: 1.5 + Math.random() * 2 * S, s0: 0.3 * S, s1: 1.6 * S, c0: 0x3a3028, c1: 0x7a7066, drag: 0.4, g: 1.5 });
    for (let k = 0; k < 14 * S; k++) this.smoke.spawn({ p, v: new THREE.Vector3((Math.random() - 0.5) * 8 * S, 3 + Math.random() * 6 * S, (Math.random() - 0.5) * 8 * S), life: 1 + Math.random() * S, s0: 0.06 * S, s1: 0.1 * S, c0: 0x4a3a28, c1: 0x4a3a28, drag: 0.9, g: 9.8 });
  }
  update(dt) {
    this.fire.update(dt); this.smoke.update(dt);
    for (const s of this.flashes) if (s.visible) { s.userData.t -= dt; if (s.userData.t <= 0) s.visible = false; }
  }
}
