import * as THREE from 'three';
import { W } from './world.js';

const G = 9.81;

// Symulacja płytkiej wody metodą "wirtualnych rur" na siatce N×N.
// kind: 'water' (woda) lub 'lava' (lepka, stygnąca lawa).
export class Fluid {
  constructor(world, parent, { N = 128, kind = 'water' } = {}) {
    this.world = world;
    this.kind = kind;
    this.N = N;
    this.L = W / N;
    const n = N * N;
    this.B = new Float32Array(n);
    this.D = new Float32Array(n);
    this.FL = new Float32Array(n); this.FR = new Float32Array(n); this.FT = new Float32Array(n); this.FB = new Float32Array(n);
    this.U = new Float32Array(n); this.V = new Float32Array(n);
    this.T = new Float32Array(n);   // temperatura lawy 0..1
    this.boundary = null;           // poziom morza na wschodniej krawędzi
    this.sources = [];              // {x,z,rate (m3/s), heat}
    this.rain = 0;                  // m/s
    this.syncBed();
    this.buildMesh(parent);
  }

  cx(i) { return -W / 2 + (i + 0.5) * this.L; }
  cell(x, z) {
    const i = Math.max(0, Math.min(this.N - 1, Math.floor((x + W / 2) / this.L)));
    const j = Math.max(0, Math.min(this.N - 1, Math.floor((z + W / 2) / this.L)));
    return j * this.N + i;
  }

  // dno = maksimum terenu w obrębie komórki (żeby cienkie ściany, np. zapora, były szczelne)
  syncBed() {
    const { N, L, world } = this;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let m = -Infinity;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        m = Math.max(m, world.heightAt(-W / 2 + (i + 0.17 + a * 0.33) * L, -W / 2 + (j + 0.17 + b * 0.33) * L));
      }
      this.B[j * N + i] = m;
    }
  }

  // wypełnia połączony obszar poniżej poziomu `level`, startując z komórek seeds
  fill(seeds, level, heat = 0) {
    const { N, B, D } = this;
    const seen = new Uint8Array(N * N);
    const q = seeds.filter((k) => B[k] < level);
    for (const k of q) seen[k] = 1;
    while (q.length) {
      const k = q.pop();
      D[k] = Math.max(D[k], level - B[k]);
      if (heat) this.T[k] = heat;
      const i = k % N, j = (k / N) | 0;
      for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const kk = b * N + a;
        if (!seen[kk] && B[kk] < level) { seen[kk] = 1; q.push(kk); }
      }
    }
  }

  eastEdge() { const r = []; for (let j = 0; j < this.N; j++) r.push(j * this.N + this.N - 1); return r; }

  reset() {
    this.D.fill(0); this.FL.fill(0); this.FR.fill(0); this.FT.fill(0); this.FB.fill(0); this.U.fill(0); this.V.fill(0); this.T.fill(0);
    this.sources.length = 0; this.rain = 0; this.boundary = null;
  }

  step(dt) {
    const { N, L, B, D, FL, FR, FT, FB, T } = this;
    const area = L * L, A = dt * G * L;
    const lava = this.kind === 'lava';
    for (const s of this.sources) {
      const k = this.cell(s.x, s.z);
      D[k] += (s.rate * dt) / area;
      if (lava) T[k] = 1;
    }
    if (this.rain) for (let k = 0; k < N * N; k++) D[k] += this.rain * dt;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        if (D[k] <= 0 && FL[k] === 0 && FR[k] === 0 && FT[k] === 0 && FB[k] === 0) continue;
        const h = B[k] + D[k];
        let damp;
        if (lava) { const t = T[k]; damp = t > 0.05 ? Math.max(0, 1 - dt * (1.5 + (1 - t) * 14)) : 0; }
        else damp = 1 - dt * 0.06;
        const Ak = lava ? (T[k] > 0.05 ? A * 0.35 : 0) : A;
        const fl = i > 0 ? Math.max(0, FL[k] * damp + Ak * (h - B[k - 1] - D[k - 1])) : 0;
        const fr = i < N - 1 ? Math.max(0, FR[k] * damp + Ak * (h - B[k + 1] - D[k + 1])) : 0;
        const ft = j > 0 ? Math.max(0, FT[k] * damp + Ak * (h - B[k - N] - D[k - N])) : 0;
        const fb = j < N - 1 ? Math.max(0, FB[k] * damp + Ak * (h - B[k + N] - D[k + N])) : 0;
        const sum = fl + fr + ft + fb, vol = D[k] * area;
        const sc = sum * dt > vol ? vol / (sum * dt + 1e-9) : 1;
        FL[k] = fl * sc; FR[k] = fr * sc; FT[k] = ft * sc; FB[k] = fb * sc;
      }
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const inL = i > 0 ? FR[k - 1] : 0, inR = i < N - 1 ? FL[k + 1] : 0, inT = j > 0 ? FB[k - N] : 0, inB = j < N - 1 ? FT[k + N] : 0;
        const inflow = inL + inR + inT + inB;
        const out = FL[k] + FR[k] + FT[k] + FB[k];
        if (inflow === 0 && out === 0) continue;
        const d0 = D[k];
        let d = d0 + (dt * (inflow - out)) / area;
        if (d < 1e-4) d = 0;
        if (lava && inflow > 0) {
          // mieszanie temperatury napływającej lawy
          const tin = ((i > 0 ? inL * T[k - 1] : 0) + (i < N - 1 ? inR * T[k + 1] : 0) + (j > 0 ? inT * T[k - N] : 0) + (j < N - 1 ? inB * T[k + N] : 0)) / inflow;
          const vin = inflow * dt / area, keep = Math.max(0, d0 - out * dt / area);
          T[k] = (T[k] * keep + tin * vin) / Math.max(1e-4, keep + vin);
        }
        D[k] = d;
        const dm = Math.max(0.05, (d0 + d) / 2);
        this.U[k] = (inL - FL[k] + FR[k] - inR) / (2 * L * dm);
        this.V[k] = (inT - FT[k] + FB[k] - inB) / (2 * L * dm);
      }
    }
    if (this.boundary !== null) {
      for (let j = 0; j < N; j++) for (const i of [N - 1, N - 2]) {
        const k = j * N + i;
        D[k] = Math.max(0, this.boundary - B[k]);
      }
    }
    if (lava) for (let k = 0; k < N * N; k++) if (D[k] > 0) T[k] = Math.max(0, T[k] - dt / 55);
  }

  depthAt(x, z) { return this.D[this.cell(x, z)]; }
  levelAt(x, z) { const k = this.cell(x, z); return this.D[k] > 0.15 ? this.B[k] + this.D[k] : null; }
  velAt(x, z) { const k = this.cell(x, z); return { u: this.U[k], v: this.V[k], d: this.D[k], t: this.T[k] }; }

  // ---------- wygląd ----------
  buildMesh(parent) {
    const N = this.N;
    const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3), nrm = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = (j * N + i) * 3; pos[k] = this.cx(i); pos[k + 2] = this.cx(j); nrm[k + 1] = 1; }
    const idx = [];
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) { const a = j * N + i, b = a + 1, c = a + N, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), W);
    const mat = this.kind === 'lava'
      ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
      : new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.82, shininess: 70, specular: 0x9fc8e8, depthWrite: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 2;
    this.mesh.receiveShadow = this.kind !== 'lava';
    parent.add(this.mesh);
  }

  updateMesh() {
    const { N, B, D, U, V, T } = this;
    const g = this.mesh.geometry.attributes, pos = g.position.array, col = g.color.array, nrm = g.normal.array;
    const lava = this.kind === 'lava';
    const wetMin = lava ? 0.08 : 0.12;
    let any = false;
    for (let k = 0; k < N * N; k++) {
      const d = D[k];
      const wet = d > wetMin;
      if (wet) any = true;
      pos[k * 3 + 1] = wet ? B[k] + d - (lava ? 0.2 : 0.4) : B[k] - 4;
      if (lava) {
        const t = T[k];
        const r = 0.12 + 0.95 * Math.min(1, t * 1.6), gg = 0.08 + 0.75 * Math.max(0, t - 0.45) * 1.6, b = 0.06 + 0.2 * Math.max(0, t - 0.8) * 4;
        col[k * 3] = r; col[k * 3 + 1] = gg; col[k * 3 + 2] = b;
      } else {
        const sp = Math.hypot(U[k], V[k]);
        const foam = Math.min(0.9, Math.max(0, (sp - 4.5) / 9)) * Math.min(1, d / 2);
        const deep = Math.min(1, d / 25);
        let r = 0.36 - 0.22 * deep, gg = 0.62 - 0.26 * deep, b = 0.78 - 0.2 * deep;
        if (d < 3 && B[k] > 1) { r = lerp3(r, 0.5, 0.5); gg = lerp3(gg, 0.45, 0.5); b = lerp3(b, 0.32, 0.5); } // mętna woda powodziowa
        col[k * 3] = r + (0.95 - r) * foam; col[k * 3 + 1] = gg + (0.97 - gg) * foam; col[k * 3 + 2] = b + (1 - b) * foam;
      }
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const hl = pos[(j * N + Math.max(0, i - 1)) * 3 + 1], hr = pos[(j * N + Math.min(N - 1, i + 1)) * 3 + 1];
      const ht = pos[(Math.max(0, j - 1) * N + i) * 3 + 1], hb = pos[(Math.min(N - 1, j + 1) * N + i) * 3 + 1];
      let nx = -(hr - hl) / (2 * this.L), nz = -(hb - ht) / (2 * this.L);
      const l = Math.hypot(nx, 1, nz);
      nrm[k * 3] = nx / l; nrm[k * 3 + 1] = 1 / l; nrm[k * 3 + 2] = nz / l;
    }
    g.position.needsUpdate = true; g.color.needsUpdate = true; g.normal.needsUpdate = true;
    this.mesh.visible = any;
  }
}

const lerp3 = (a, b, t) => a + (b - a) * t;
