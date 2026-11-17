import * as THREE from 'three';

// Prosta fizyka brył sztywnych na powierzchni z pinów (impulsy sekwencyjne).
const G = 9.81;
const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _m3 = new THREE.Matrix3(), _q = new THREE.Quaternion();

export const SHAPES = {
  box: { name: 'Prostopadłościan', dims: [0.06, 0.025, 0.03], color: 0xe8743b },
  cube: { name: 'Sześcian', dims: [0.035, 0.035, 0.035], color: 0x3b82e8, type: 'box' },
  sphere: { name: 'Kula', dims: [0.03], color: 0xe8c43b },
  cyl: { name: 'Walec', dims: [0.025, 0.045], color: 0x3bbf6a },
};

export class Body {
  constructor(kind, pos) {
    const def = SHAPES[kind];
    this.kind = kind;
    this.type = def.type || kind;
    this.name = def.name;
    this.dims = def.dims.slice();
    this.pos = pos.clone();
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.ang = new THREE.Vector3();
    this.kinematic = false;   // trzymany ręką albo zawieszony
    this.hover = false;        // czeka aż piny go podeprą
    this.program = null;
    const density = 600;
    let vol, I;
    if (this.type === 'box') {
      const [hx, hy, hz] = this.dims;
      vol = 8 * hx * hy * hz;
      const m = vol * density;
      I = new THREE.Vector3((m / 3) * (hy * hy + hz * hz), (m / 3) * (hx * hx + hz * hz), (m / 3) * (hx * hx + hy * hy));
      this.radius = Math.hypot(hx, hy, hz);
      this.geo = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
    } else if (this.type === 'sphere') {
      const r = this.dims[0];
      vol = (4 / 3) * Math.PI * r ** 3;
      const m = vol * density, i = 0.4 * m * r * r;
      I = new THREE.Vector3(i, i, i);
      this.radius = r;
      this.geo = new THREE.SphereGeometry(r, 24, 16);
    } else {
      const [r, hh] = this.dims;
      vol = Math.PI * r * r * hh * 2;
      const m = vol * density;
      I = new THREE.Vector3(m * (3 * r * r + 4 * hh * hh) / 12, 0.5 * m * r * r, m * (3 * r * r + 4 * hh * hh) / 12);
      this.radius = Math.hypot(r, hh);
      this.geo = new THREE.CylinderGeometry(r, r, hh * 2, 28);
    }
    this.mass = vol * density;
    this.invMass = 1 / this.mass;
    this.invI = new THREE.Vector3(1 / I.x, 1 / I.y, 1 / I.z);
    this.samples = this.makeSamples();
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.55, metalness: 0.05 }));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.userData.body = this;
    // obrys (podświetlenie programu)
    this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(this.geo, 30), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    this.mesh.add(this.outline);
    this.sync();
  }

  // punkty próbkujące powierzchnię bryły: [x,y,z, nx,ny,nz] (normalna zewnętrzna)
  makeSamples() {
    const pts = [];
    const push = (x, y, z, nx, ny, nz) => { const l = Math.hypot(nx, ny, nz) || 1; pts.push(x, y, z, nx / l, ny / l, nz / l); };
    if (this.type === 'box') {
      const [hx, hy, hz] = this.dims, st = 0.01;
      const nx = Math.max(2, Math.ceil((hx * 2) / st)), ny = Math.max(2, Math.ceil((hy * 2) / st)), nz = Math.max(2, Math.ceil((hz * 2) / st));
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) for (let k = 0; k <= nz; k++) {
        const fx = i === 0 ? -1 : i === nx ? 1 : 0, fy = j === 0 ? -1 : j === ny ? 1 : 0, fz = k === 0 ? -1 : k === nz ? 1 : 0;
        if (!fx && !fy && !fz) continue;
        push(-hx + (2 * hx * i) / nx, -hy + (2 * hy * j) / ny, -hz + (2 * hz * k) / nz, fx, fy, fz);
      }
    } else if (this.type === 'cyl') {
      const [r, hh] = this.dims;
      for (let ring = 0; ring <= 4; ring++) {
        const rr = (r * ring) / 4, n = Math.max(1, ring * 8);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a), edge = ring === 4 ? 1 : 0;
          push(cx * rr, -hh, cz * rr, cx * edge, -1, cz * edge);
          push(cx * rr, hh, cz * rr, cx * edge, 1, cz * edge);
        }
      }
      for (let l = 1; l < 10; l++) for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2; push(Math.cos(a) * r, -hh + (2 * hh * l) / 10, Math.sin(a) * r, Math.cos(a), 0, Math.sin(a)); }
    }
    return new Float32Array(pts);
  }

  sync() { this.mesh.position.copy(this.pos); this.mesh.quaternion.copy(this.quat); }

  // pionowa prosta przez (x,z): [dolna, górna] wysokość bryły albo null
  verticalSpan(x, z) {
    if (this.type === 'sphere') {
      const r = this.dims[0], d2 = (x - this.pos.x) ** 2 + (z - this.pos.z) ** 2;
      if (d2 >= r * r) return null;
      const s = Math.sqrt(r * r - d2);
      return [this.pos.y - s, this.pos.y + s];
    }
    _q.copy(this.quat).invert();
    const o = _a.set(x - this.pos.x, -this.pos.y, z - this.pos.z).applyQuaternion(_q);
    const d = _b.set(0, 1, 0).applyQuaternion(_q);
    let t0 = -Infinity, t1 = Infinity;
    if (this.type === 'box') {
      const h = this.dims;
      const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
      for (let k = 0; k < 3; k++) {
        if (Math.abs(dd[k]) < 1e-9) { if (Math.abs(oo[k]) > h[k]) return null; continue; }
        let a = (-h[k] - oo[k]) / dd[k], b = (h[k] - oo[k]) / dd[k];
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      }
    } else {
      const [r, hh] = this.dims;
      const A = d.x * d.x + d.z * d.z, B = 2 * (o.x * d.x + o.z * d.z), C = o.x * o.x + o.z * o.z - r * r;
      if (A < 1e-9) { if (C > 0) return null; } else {
        const disc = B * B - 4 * A * C;
        if (disc < 0) return null;
        const s = Math.sqrt(disc);
        t0 = (-B - s) / (2 * A); t1 = (-B + s) / (2 * A);
      }
      if (Math.abs(d.y) < 1e-9) { if (Math.abs(o.y) > hh) return null; } else {
        let a = (-hh - o.y) / d.y, b = (hh - o.y) / d.y;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      }
    }
    if (t1 < t0) return null;
    return [t0, t1];
  }

  // wymiary w rzucie z góry (do etykiet kamery)
  footprint() {
    if (this.type === 'sphere') return { w: this.dims[0] * 2, d: this.dims[0] * 2, angle: 0 };
    const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quat);
    return { angle: Math.atan2(ax.z, ax.x) };
  }
}

export class Physics {
  constructor(pins, parent) {
    this.pins = pins;
    this.parent = parent;
    this.bodies = [];
    this.contacts = [];
  }

  add(body) { this.bodies.push(body); this.parent.add(body.mesh); return body; }
  remove(body) { this.parent.remove(body.mesh); this.bodies.splice(this.bodies.indexOf(body), 1); }
  clear() { for (const b of [...this.bodies]) this.remove(b); }

  worldInvI(b, out) {
    // R * diag(invI) * R^T zastosowane do wektora — liczymy w miejscu
    return out;
  }

  applyInvI(b, v, out) {
    _q.copy(b.quat).invert();
    out.copy(v).applyQuaternion(_q);
    out.set(out.x * b.invI.x, out.y * b.invI.y, out.z * b.invI.z);
    return out.applyQuaternion(b.quat);
  }

  // kontakt punktu bryły z pinem: kierunek wypychania = przeciwny do normalnej powierzchni bryły
  pointContact(px, py, pz, onx, ony, onz, list) {
    const P = this.pins;
    const top = P.surfaceAt(px, pz);
    let pen = top - py;
    if (pen <= 0) return;
    const i = P.idxAt(px, pz);
    let nx = -onx, ny = -ony, nz = -onz;
    if (ny < -0.2) { nx = 0; ny = 1; nz = 0; }           // punkt z górnej ściany "pod" pinem — wypchnij w górę
    if (ny < 0.5) pen = Math.min(pen, P.pitch * 0.6);   // kontakt boczny: głębokość ograniczona szerokością pinu
    list.push(px, py, pz, nx, ny, nz, pen, i >= 0 ? P.vel[i] : 0);
  }

  gatherContacts(b, list) {
    list.length = 0;
    const P = this.pins;
    if (b.type === 'sphere') {
      const r = b.dims[0], c = b.pos;
      if (c.y - r > P.maxH + 0.01 && P.inField(c.x, c.z)) return;
      const [c0, c1, r0, r1] = P.range(c.x - r, c.x + r, c.z - r, c.z + r);
      for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
        const i = rr * P.cols + cc, h = P.h[i];
        const x0 = P.ox + cc * P.pitch, z0 = P.oz + rr * P.pitch;
        const qx = Math.min(Math.max(c.x, x0), x0 + P.pitch), qz = Math.min(Math.max(c.z, z0), z0 + P.pitch), qy = Math.min(c.y, h);
        const dx = c.x - qx, dy = c.y - qy, dz = c.z - qz, d = Math.hypot(dx, dy, dz);
        if (d >= r) continue;
        if (d < 1e-6) list.push(c.x, c.y - r, c.z, 0, 1, 0, r, P.vel[i]);
        else list.push(c.x - (dx / d) * r, c.y - (dy / d) * r, c.z - (dz / d) * r, dx / d, dy / d, dz / d, r - d, dy / d > 0.7 ? P.vel[i] : 0);
      }
      if (!P.inField(c.x, c.z)) this.pointContact(c.x, c.y - r, c.z, 0, -1, 0, list);
      return;
    }
    const s = b.samples;
    const m = new THREE.Matrix4().compose(b.pos, b.quat, _t.set(1, 1, 1));
    const e = m.elements;
    const lowest = b.pos.y - b.radius;
    if (lowest > P.maxH + 0.01 && P.inField(b.pos.x, b.pos.z)) return;
    for (let k = 0; k < s.length; k += 6) {
      const x = s[k], y = s[k + 1], z = s[k + 2];
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (wy > P.maxH + 0.002 && P.inField(wx, wz)) continue;
      const nx = s[k + 3], ny = s[k + 4], nz = s[k + 5];
      this.pointContact(wx, wy, wz, e[0] * nx + e[4] * ny + e[8] * nz, e[1] * nx + e[5] * ny + e[9] * nz, e[2] * nx + e[6] * ny + e[10] * nz, list);
    }
  }

  step(dt) {
    const SUB = 6, h = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      for (const b of this.bodies) {
        if (b.kinematic) continue;
        b.vel.y -= G * h;
        this.gatherContacts(b, this.contacts);
        const C = this.contacts, nC = C.length / 8;
        for (let it = 0; it < 2; it++) {
          for (let k = 0; k < C.length; k += 8) {
            _r.set(C[k] - b.pos.x, C[k + 1] - b.pos.y, C[k + 2] - b.pos.z);
            _n.set(C[k + 3], C[k + 4], C[k + 5]);
            const pen = C[k + 6], vp = C[k + 7];
            // prędkość względna w punkcie
            _v.crossVectors(b.ang, _r).add(b.vel); _v.y -= vp;
            const vn = _v.dot(_n);
            // kontakt boczny (ściana pinów) pcha mocno — siłowniki nie ustępują
            const side = C[k + 4] < 0.5;
            const bias = side ? Math.min(0.25, (0.6 / h) * Math.max(0, pen - 0.0003)) : Math.min(0.5, (0.25 / h) * Math.max(0, pen - 0.0005)) / Math.max(1, nC * 0.15);
            let j = 0;
            if (vn < bias) {
              _a.crossVectors(_r, _n); this.applyInvI(b, _a, _b); _a.crossVectors(_b, _r);
              const K = b.invMass + _n.dot(_a);
              j = Math.max(0, (-vn * 1.05 + bias) / K);
              if (j > 0) {
                b.vel.addScaledVector(_n, j * b.invMass);
                _a.crossVectors(_r, _n).multiplyScalar(j); this.applyInvI(b, _a, _b); b.ang.add(_b);
              }
            }
            // tarcie
            _v.crossVectors(b.ang, _r).add(b.vel); _v.y -= vp;
            _t.copy(_v).addScaledVector(_n, -_v.dot(_n));
            const vt = _t.length();
            if (vt > 1e-6) {
              _t.multiplyScalar(1 / vt);
              _a.crossVectors(_r, _t); this.applyInvI(b, _a, _b); _a.crossVectors(_b, _r);
              const Kt = b.invMass + _t.dot(_a);
              // limit tarcia: impuls normalny albo udział w ciężarze (kontakt spoczynkowy)
              const jt = Math.min(vt / Kt, 0.5 * Math.max(j, (b.mass * G * h * Math.max(0, _n.y)) / Math.max(1, nC)));
              b.vel.addScaledVector(_t, -jt * b.invMass);
              _a.crossVectors(_r, _t).multiplyScalar(-jt); this.applyInvI(b, _a, _b); b.ang.add(_b);
            }
          }
        }
        // tłumienie, szczególnie przy spoczynku (mniej drgań)
        const slow = nC > 0 && b.vel.lengthSq() < 0.0004 && b.ang.lengthSq() < 0.04;
        const lin = Math.exp(-(slow ? 6 : 0.15) * h), ang = Math.exp(-(slow ? 8 : 0.4) * h);
        b.vel.multiplyScalar(lin); b.ang.multiplyScalar(ang);
        if (b.ang.lengthSq() > 900) b.ang.setLength(30);
        b.pos.addScaledVector(b.vel, h);
        const w = b.ang.length();
        if (w > 1e-8) { _q.setFromAxisAngle(_a.copy(b.ang).multiplyScalar(1 / w), w * h); b.quat.premultiply(_q).normalize(); }
      }
      this.collideBodies();
    }
    for (const b of this.bodies) {
      if (b.pos.y < -2) { b.pos.set(0, 0.25, 0); b.vel.set(0, 0, 0); b.ang.set(0, 0, 0); }
      b.sync();
    }
  }

  // uproszczone zderzenia przedmiotów między sobą (sfery wpisane)
  collideBodies() {
    const B = this.bodies;
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j];
      const ra = a.type === 'sphere' ? a.dims[0] : Math.min(...a.dims) * 1.15, rb = b.type === 'sphere' ? b.dims[0] : Math.min(...b.dims) * 1.15;
      _v.subVectors(b.pos, a.pos);
      const d = _v.length(), min = ra + rb;
      if (d >= min || d < 1e-6) continue;
      _v.multiplyScalar(1 / d);
      const pen = min - d, wa = a.kinematic ? 0 : a.invMass, wb = b.kinematic ? 0 : b.invMass, ws = wa + wb;
      if (ws === 0) continue;
      a.pos.addScaledVector(_v, -pen * wa / ws); b.pos.addScaledVector(_v, pen * wb / ws);
      const rv = _t.subVectors(b.vel, a.vel).dot(_v);
      if (rv < 0) { const jj = -rv / ws; a.vel.addScaledVector(_v, -jj * wa); b.vel.addScaledVector(_v, jj * wb); }
    }
  }
}
