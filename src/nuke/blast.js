import * as THREE from 'three';

// Bomby i przybliżone wzory skalowania efektów (W w kilotonach). Wartości orientacyjne,
// zgodne co do rzędu wielkości z danymi publicznymi (np. NUKEMAP, Glasstone & Dolan).
export const BOMBS = [
  { name: 'Little Boy (Hiroszima)', kt: 15, info: 'bomba 3,0 m × 0,71 m, 4,4 t' },
  { name: 'Fat Man (Nagasaki)', kt: 21, info: 'bomba 3,25 m × 1,52 m, 4,7 t' },
  { name: 'W76 (głowica SLBM)', kt: 100, info: 'głowica ok. 1,8 m, ~160 kg' },
  { name: 'W88', kt: 475, info: 'głowica ok. 1,75 m, ~360 kg' },
  { name: 'B83', kt: 1200, info: 'bomba 3,7 m × 0,46 m, 1,1 t' },
  { name: 'Castle Bravo', kt: 15000, info: 'urządzenie testowe ~10,7 t' },
  { name: 'Car-bomba', kt: 50000, info: 'bomba 8 m × 2,1 m, 27 t' },
];

export function blastParams(kt, air) {
  const W = kt, c3 = Math.cbrt(W);
  const p = {
    W, air,
    burstH: air ? 240 * c3 : 0,
    fireball: 75 * Math.pow(W, 0.4) * (air ? 1 : 1.25),
    psi20: 190 * c3, psi5: 490 * c3, psi1: 1300 * c3,
    thermal: 630 * Math.pow(W, 0.41),
    cloudTop: 3700 * Math.pow(W, 0.236),
    tFb: 0.3 * Math.pow(W, 0.4),
  };
  p.capR = 0.42 * p.cloudTop;
  p.tauC = 90 * Math.pow(W / 15, 0.08);
  p.crater = air ? 0 : 35 * Math.pow(W, 0.3);
  return p;
}

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// promień fali uderzeniowej w funkcji czasu
export function shockR(p, t) {
  if (t < p.tFb) return p.fireball * Math.pow(Math.max(t, 1e-4) / p.tFb, 0.4) * 1.05;
  const tt = t - p.tFb;
  return p.fireball + 340 * tt + 2 * p.fireball * (1 - Math.exp(-tt / (p.fireball / 340)));
}

function noisy(geo) {
  const pos = geo.attributes.position;
  const dirs = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(pos, i).normalize(); dirs[i * 3] = v.x; dirs[i * 3 + 1] = v.y; dirs[i * 3 + 2] = v.z; }
  geo.userData.dirs = dirs;
  return geo;
}
function wobble(geo, t, amp, f) {
  const pos = geo.attributes.position.array, d = geo.userData.dirs;
  for (let i = 0; i < d.length; i += 3) {
    const x = d[i], y = d[i + 1], z = d[i + 2];
    const n = Math.sin(x * f + t * 1.3) * Math.sin(y * f * 1.3 + t) * Math.sin(z * f * 0.9 + t * 0.7) + 0.5 * Math.sin((x + z) * f * 2.1 - t * 1.7);
    const r = 1 + amp * n;
    pos[i] = x * r; pos[i + 1] = y * r; pos[i + 2] = z * r;
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
}

export class NukeBlast {
  constructor(parent, gz, params, world, fx) {
    this.p = params; this.gz = gz.clone(); this.world = world; this.fx = fx; this.t = 0;
    const g = this.g = new THREE.Group();
    g.position.copy(gz);
    parent.add(g);
    this.mats = [];
    const lam = (o) => { const m = new THREE.MeshLambertMaterial({ transparent: true, ...o }); this.mats.push(m); return m; };
    const basic = (o) => { const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, ...o }); this.mats.push(m); return m; };
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), basic({ color: 0xffffff, blending: THREE.AdditiveBlending }));
    this.ball = new THREE.Mesh(noisy(new THREE.IcosahedronGeometry(1, 4)), lam({ color: 0x302820, emissive: 0xffffff }));
    this.cap = new THREE.Mesh(noisy(new THREE.IcosahedronGeometry(1, 3)), lam({ color: 0x5a4a40, emissive: 0x000000, flatShading: false }));
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.42, 14, 40), lam({ color: 0x5e5048 }));
    this.ring.rotation.x = Math.PI / 2;
    this.stem = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1, 1, 20, 6, true).translate(0, 0.5, 0), lam({ color: 0x6e5e50, side: THREE.DoubleSide }));
    this.skirt = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 1, 40, 1, true).translate(0, 0.5, 0), lam({ color: 0x8a7a64, side: THREE.DoubleSide }));
    this.shockRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 128).rotateX(-Math.PI / 2), basic({ color: 0xffffff, side: THREE.DoubleSide }));
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), basic({ color: 0xdde8ff, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.wilson = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), basic({ color: 0xffffff, side: THREE.DoubleSide }));
    for (const o of [this.flash, this.ball, this.cap, this.ring, this.stem, this.skirt, this.shockRing, this.dome, this.wilson]) { o.visible = false; g.add(o); }
    this.r = 0; this.burnt = false; this.flashK = 1;
    this.phase = '';
  }

  // wysokość szczytu chmury i promień "czapy" w czasie
  top(t) { const p = this.p, h0 = p.burstH + p.fireball; return h0 + (p.cloudTop - h0) * (1 - Math.exp(-Math.max(0, t - p.tFb) / p.tauC)); }
  capR(t) { const p = this.p; return p.fireball + (p.capR - p.fireball) * (1 - Math.exp(-Math.max(0, t - p.tFb) / (p.tauC * 1.2))); }

  update(dt, realDt) {
    const p = this.p;
    const t = (this.t += dt);
    const tf = p.tFb;
    // błysk
    const fl = Math.max(0, 1 - t / (1.5 * tf));
    this.flash.visible = fl > 0;
    this.flash.scale.setScalar(p.fireball * 3 * Math.pow(Math.min(1, t / (0.1 * tf)), 0.3) + 1);
    this.flash.material.opacity = fl * fl;
    this.flash.position.y = p.burstH;
    this.flashK = fl;
    // kula ognia -> rdzeń grzyba
    const rf = t < tf ? p.fireball * Math.pow(Math.max(t, 1e-4) / tf, 0.4) : p.fireball * (1 + 0.15 * Math.min(1, (t - tf) / (3 * tf)));
    const top = this.top(t), cr = this.capR(t);
    const capY = top - cr * 0.38;
    const ballR = Math.max(rf, cr * 0.62);
    const ballY = t < tf ? Math.max(p.burstH, p.air ? p.burstH : rf * 0.2) : Math.max(p.burstH, capY);
    this.ball.visible = true;
    this.ball.position.y = ballY;
    this.ball.scale.set(ballR, ballR * (t < tf ? 1 : 0.72), ballR);
    wobble(this.ball.geometry, t * 0.6 / Math.max(0.3, tf), t < tf ? 0.03 : 0.09, 3.2);
    const heat = t < tf ? 1 : Math.max(0, 1 - (t - tf) / (7 * tf + 20));
    const em = this.ball.material.emissive;
    if (t < tf * 0.4) em.setRGB(1, 1, 0.92);
    else em.setRGB(1 * Math.min(1, heat * 1.3), 0.75 * heat * heat, 0.35 * heat * heat * heat);
    this.ball.material.color.setRGB(0.18 + 0.4 * (1 - heat), 0.15 + 0.37 * (1 - heat), 0.13 + 0.35 * (1 - heat));
    // czapa grzyba i pierścień wiru
    const rise = t > tf;
    this.cap.visible = this.ring.visible = rise;
    if (rise) {
      this.cap.position.y = capY + cr * 0.08;
      this.cap.scale.set(cr * 0.95, cr * 0.5, cr * 0.95);
      wobble(this.cap.geometry, t / p.tauC * 6, 0.07, 4.5);
      this.ring.position.y = capY - cr * 0.12;
      this.ring.scale.set(cr * 0.95, cr * 0.95, cr * 0.45);
      this.ring.rotation.z += realDt * 0.05;
      for (const m of [this.cap.material, this.ring.material]) {
        m.color.copy(this.ball.material.color);
        m.emissive.setRGB(0.9 * heat * heat, 0.35 * heat * heat * heat, 0.05 * heat);
      }
    }
    // trzon
    const stemOn = t > tf * 1.5;
    this.stem.visible = stemOn;
    if (stemOn) {
      const sr = cr * (0.11 + 0.05 * Math.min(1, (t - tf) / p.tauC));
      const k = Math.min(1, (t - tf * 1.5) / (tf * 6 + 8));
      this.stem.scale.set(sr, Math.max(1, (capY - cr * 0.25) * k + p.burstH * (1 - k) * 0), sr);
      this.stem.material.opacity = 0.85 * k;
      this.stem.material.emissive.setRGB(0.6 * heat * heat, 0.2 * heat * heat, 0);
    }
    // fala uderzeniowa
    const sr = shockR(p, t);
    const sOn = sr < p.psi1 * 1.15;
    this.shockRing.visible = sOn;
    if (sOn) {
      this.shockRing.scale.setScalar(sr);
      this.shockRing.position.y = this.world.surfaceAt(this.gz.x, this.gz.z) - this.gz.y + 20;
      this.shockRing.material.opacity = 0.85 * (1 - sm(p.psi20, p.psi1 * 1.15, sr) * 0.85);
    }
    this.dome.visible = sr < p.psi5 * 1.3;
    if (this.dome.visible) { this.dome.scale.set(sr, sr * 0.9, sr); this.dome.position.y = 0; this.dome.material.opacity = 0.22 * (1 - sm(p.fireball, p.psi5 * 1.3, sr)); }
    // chmura kondensacyjna (Wilsona) — tylko wybuch powietrzny
    const wOn = p.air && t > tf * 0.3 && t < tf * 4 && p.W < 3000;
    this.wilson.visible = wOn;
    if (wOn) {
      const k = (t - tf * 0.3) / (tf * 3.7);
      this.wilson.position.y = p.burstH;
      this.wilson.scale.setScalar(sr * 0.98);
      this.wilson.material.opacity = 0.45 * Math.sin(Math.PI * Math.min(1, k)) ;
    }
    // pył przy ziemi
    const skOn = t > tf * 0.8;
    this.skirt.visible = skOn;
    if (skOn) {
      const rr = Math.min(sr, p.psi5 * 1.25);
      this.skirt.scale.set(rr, p.cloudTop * 0.05 * Math.min(1, (t - tf) / (p.tauC * 0.5) + 0.2), rr);
      this.skirt.material.opacity = 0.75 * (1 - sm(p.tauC * 2, p.tauC * 6, t));
    }
    // kłęby dymu dla objętości
    if (rise && t < p.tauC * 5) {
      for (let k = 0; k < 3; k++) {
        const a = Math.random() * Math.PI * 2;
        this.fx.smoke.spawn({
          p: new THREE.Vector3(this.gz.x + Math.cos(a) * cr * (0.75 + Math.random() * 0.3), this.gz.y + capY + (Math.random() - 0.5) * cr * 0.5, this.gz.z + Math.sin(a) * cr * (0.75 + Math.random() * 0.3)),
          v: new THREE.Vector3(Math.cos(a) * cr * 0.01, cr * 0.004, Math.sin(a) * cr * 0.01),
          life: p.tauC * 1.5, s0: cr * 0.18, s1: cr * 0.38, c0: heat > 0.3 ? 0x7a4a30 : 0x6e665e, c1: 0xb0a8a0, drag: 0.99,
        });
      }
    }
    this.phase = t < tf * 0.3 ? 'Błysk' : t < tf * 2 ? 'Kula ognia' : sr < p.psi1 ? 'Fala uderzeniowa' : top < p.cloudTop * 0.9 ? 'Grzyb się wznosi' : 'Chmura osiąga szczyt';
    return { sr, top, cr };
  }

  dispose() {
    this.g.parent?.remove(this.g);
    this.g.traverse((o) => o.geometry?.dispose());
    for (const m of this.mats) m.dispose();
  }
}
