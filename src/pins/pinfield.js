import * as THREE from 'three';

// Matryca pinów renderowana w całości na GPU: wysokości siedzą w teksturze,
// a shader ustawia każdy pin (wierzch + ściany dzielone z sąsiadami).
const PIN_GLSL = /* glsl */`
uniform sampler2D uPinH;
uniform sampler2D uPinC;
uniform ivec2 uGrid;
uniform float uPitch;
uniform vec2 uOrigin;
uniform float uColorMode;
uniform float uMaxH;
attribute float aPart;
varying vec2 vPinUV;
varying float vPart;
varying float vDepth;
varying vec3 vPinCol;
float pinH(int c, int r) {
  if (c < 0 || r < 0 || c >= uGrid.x || r >= uGrid.y) return 0.0;
  return texelFetch(uPinH, ivec2(c, r), 0).r;
}
vec3 pinRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 a = vec3(0.18, 0.32, 0.75), b = vec3(0.2, 0.75, 0.6), c = vec3(0.95, 0.85, 0.3), d = vec3(0.95, 0.35, 0.25);
  return t < 0.33 ? mix(a, b, t / 0.33) : t < 0.66 ? mix(b, c, (t - 0.33) / 0.33) : mix(c, d, (t - 0.66) / 0.34);
}
void pinCompute(out vec3 P, out vec3 N) {
  int id = gl_InstanceID;
  int c = id % uGrid.x;
  int r = id / uGrid.x;
  float h = pinH(c, r);
  float x0 = uOrigin.x + float(c) * uPitch;
  float z0 = uOrigin.y + float(r) * uPitch;
  vPart = aPart; vPinUV = position.xz; vDepth = 0.0;
  vPinCol = texelFetch(uPinC, ivec2(c, r), 0).rgb;
  float hc = h;
  if (aPart < 0.5) {
    P = vec3(x0 + position.x * uPitch, h, z0 + position.z * uPitch);
    N = vec3(0.0, 1.0, 0.0);
  } else if (aPart < 1.5) {
    float hn = pinH(c + 1, r);
    float lo = min(h, hn), hi = max(h, hn);
    float s = h >= hn ? 1.0 : -1.0;
    float a = s > 0.0 ? position.y : 1.0 - position.y;
    float y = mix(lo, hi, a);
    P = vec3(x0 + uPitch, y, z0 + position.z * uPitch);
    N = vec3(s, 0.0, 0.0);
    vDepth = hi - y; hc = hi;
    if (s < 0.0) vPinCol = texelFetch(uPinC, ivec2(min(c + 1, uGrid.x - 1), r), 0).rgb;
  } else {
    float hn = pinH(c, r + 1);
    float lo = min(h, hn), hi = max(h, hn);
    float s = h >= hn ? 1.0 : -1.0;
    float a = s > 0.0 ? position.y : 1.0 - position.y;
    float y = mix(lo, hi, a);
    P = vec3(x0 + position.x * uPitch, y, z0 + uPitch);
    N = vec3(0.0, 0.0, s);
    vDepth = hi - y; hc = hi;
    if (s < 0.0) vPinCol = texelFetch(uPinC, ivec2(c, min(r + 1, uGrid.y - 1)), 0).rgb;
  }
  if (uColorMode > 0.5) vPinCol = mix(vPinCol, pinRamp(hc / uMaxH), 0.85);
}
`;

// ściany na zewnętrznej krawędzi (północ i zachód)
const BORDER_GLSL = /* glsl */`
uniform sampler2D uPinH;
uniform ivec2 uGrid;
uniform float uPitch;
uniform vec2 uOrigin;
varying float vBorderY;
void borderCompute(out vec3 P, out vec3 N) {
  int id = gl_InstanceID;
  if (id < uGrid.x) {
    float h = texelFetch(uPinH, ivec2(id, 0), 0).r;
    float x0 = uOrigin.x + float(id) * uPitch;
    P = vec3(x0 + position.x * uPitch, position.y * h, uOrigin.y);
    N = vec3(0.0, 0.0, -1.0);
  } else {
    int r = id - uGrid.x;
    float h = texelFetch(uPinH, ivec2(0, r), 0).r;
    float z0 = uOrigin.y + float(r) * uPitch;
    P = vec3(uOrigin.x, position.y * h, z0 + (1.0 - position.x) * uPitch);
    N = vec3(-1.0, 0.0, 0.0);
  }
  vBorderY = position.y;
}
`;

function pinGeometry() {
  // część 0: wierzch, 1: ściana wschodnia (x=1), 2: ściana południowa (z=1)
  const pos = [], part = [], idx = [];
  const quad = (verts, p, tris) => { const b = pos.length / 3; for (const v of verts) { pos.push(...v); part.push(p); } for (const t of tris) idx.push(b + t); };
  quad([[0, 0, 0], [0, 0, 1], [1, 0, 0], [1, 0, 1]], 0, [0, 1, 2, 2, 1, 3]);
  quad([[1, 0, 0], [1, 1, 0], [1, 0, 1], [1, 1, 1]], 1, [0, 1, 2, 2, 1, 3]);
  quad([[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], 2, [0, 1, 2, 1, 3, 2]);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  return g;
}

function borderGeometry() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  return g;
}

export class PinField {
  constructor(parent, { cols = 300, width = 1.5, depth = 2.0, maxH = 0.12, speed = 0.3 } = {}) {
    this.parent = parent;
    this.width = width; this.depth = depth; this.maxH = maxH; this.speed = speed;
    this.group = new THREE.Group();
    parent.add(this.group);
    this.uniforms = {
      uPinH: { value: null }, uPinC: { value: null }, uGrid: { value: new THREE.Vector2() }, uPitch: { value: 0 },
      uOrigin: { value: new THREE.Vector2() }, uColorMode: { value: 0 }, uMaxH: { value: maxH },
    };
    this.colorMode = 0;
    this.build(cols);
  }

  build(cols) {
    this.cols = cols;
    this.pitch = this.width / cols;
    this.rows = Math.round(this.depth / this.pitch);
    const n = this.n = cols * this.rows;
    this.ox = -cols * this.pitch / 2; this.oz = -this.rows * this.pitch / 2;
    this.h = new Float32Array(n);
    this.vel = new Float32Array(n);
    this.base = new Float32Array(n);
    this.target = new Float32Array(n);
    this.boost = new Float32Array(n);
    this.color = new Uint8Array(n * 4);
    this.fillColor(222, 224, 228);
    this.heightTex?.dispose(); this.colorTex?.dispose();
    this.heightTex = new THREE.DataTexture(this.h, cols, this.rows, THREE.RedFormat, THREE.FloatType);
    this.heightTex.minFilter = this.heightTex.magFilter = THREE.NearestFilter;
    this.heightTex.needsUpdate = true;
    this.colorTex = new THREE.DataTexture(this.color, cols, this.rows, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.colorTex.minFilter = this.colorTex.magFilter = THREE.NearestFilter;
    this.colorTex.colorSpace = THREE.SRGBColorSpace;
    this.colorTex.needsUpdate = true;
    const U = this.uniforms;
    U.uPinH.value = this.heightTex; U.uPinC.value = this.colorTex;
    U.uGrid.value.set(cols, this.rows); U.uPitch.value = this.pitch; U.uOrigin.value.set(this.ox, this.oz);
    if (!this.mesh) this.createMeshes();
    this.mesh.geometry.instanceCount = n;
    this.border.geometry.instanceCount = cols + this.rows;
    this.dirty = true;
  }

  createMeshes() {
    const U = this.uniforms;
    const inject = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = PIN_GLSL + sh.vertexShader
        .replace('#include <beginnormal_vertex>', 'vec3 pinP; vec3 pinN; pinCompute(pinP, pinN); vec3 objectNormal = pinN;')
        .replace('#include <begin_vertex>', 'vec3 transformed = pinP;');
      sh.fragmentShader = 'varying vec2 vPinUV;\nvarying float vPart;\nvarying float vDepth;\nvarying vec3 vPinCol;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float pinShade = 1.0;
          if (vPart < 0.5) { vec2 pe = min(vPinUV, 1.0 - vPinUV); pinShade = mix(0.68, 1.0, smoothstep(0.03, 0.12, min(pe.x, pe.y))); }
          else pinShade = clamp(1.0 - vDepth / 0.03, 0.32, 0.9);
          diffuseColor.rgb *= vPinCol * pinShade;`);
    };
    const mat = new THREE.MeshLambertMaterial();
    mat.onBeforeCompile = inject;
    const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depthMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = PIN_GLSL + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 pinP; vec3 pinN; pinCompute(pinP, pinN); vec3 transformed = pinP;');
    };
    this.mesh = new THREE.Mesh(pinGeometry(), mat);
    this.mesh.customDepthMaterial = depthMat;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.group.add(this.mesh);

    const bmat = new THREE.MeshLambertMaterial({ color: 0xb8bcc4 });
    bmat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = BORDER_GLSL + sh.vertexShader
        .replace('#include <beginnormal_vertex>', 'vec3 bP; vec3 bN; borderCompute(bP, bN); vec3 objectNormal = bN;')
        .replace('#include <begin_vertex>', 'vec3 transformed = bP;');
    };
    this.border = new THREE.Mesh(borderGeometry(), bmat);
    this.border.frustumCulled = false;
    this.group.add(this.border);
  }

  setShadows(on) { this.mesh.castShadow = on; }
  setColorMode(m) { this.colorMode = m; this.uniforms.uColorMode.value = m; }

  fillColor(r, g, b) {
    const c = this.color;
    for (let i = 0; i < this.n; i++) { c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b; c[i * 4 + 3] = 255; }
    if (this.colorTex) this.colorTex.needsUpdate = true;
  }

  // ---------- zapytania ----------
  col(x) { return Math.floor((x - this.ox) / this.pitch); }
  row(z) { return Math.floor((z - this.oz) / this.pitch); }
  idxAt(x, z) {
    const c = this.col(x), r = this.row(z);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }
  heightAt(x, z) { const i = this.idxAt(x, z); return i < 0 ? -1 : this.h[i]; }
  // powierzchnia, na której mogą leżeć przedmioty (ramka stołu na wysokości 0, poza stołem przepaść)
  surfaceAt(x, z) {
    const i = this.idxAt(x, z);
    if (i >= 0) return this.h[i];
    const m = 0.06;
    if (x > this.ox - m && x < -this.ox + m && z > this.oz - m && z < -this.oz + m) return 0.004;
    return -10;
  }
  inField(x, z) { return this.idxAt(x, z) >= 0; }
  cx(c) { return this.ox + (c + 0.5) * this.pitch; }
  cz(r) { return this.oz + (r + 0.5) * this.pitch; }

  // przecięcie promienia (w układzie stołu) z powierzchnią pinów
  raycast(o, d) {
    const x0 = this.ox, x1 = -this.ox, z0 = this.oz, z1 = -this.oz, y0 = -0.01, y1 = this.maxH + 0.02;
    let tmin = 0, tmax = 20;
    for (const [oo, dd, lo, hi] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
      if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return null; continue; }
      let a = (lo - oo) / dd, b = (hi - oo) / dd;
      if (a > b) [a, b] = [b, a];
      tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
    }
    if (tmax < tmin) return null;
    const step = this.pitch * 0.5;
    let prev = tmin;
    for (let t = tmin; t <= tmax + step; t += step) {
      const tt = Math.min(t, tmax);
      const px = o.x + d.x * tt, py = o.y + d.y * tt, pz = o.z + d.z * tt;
      const h = this.heightAt(px, pz);
      if (h >= 0 && py <= h) {
        let a = prev, b = tt;
        for (let k = 0; k < 10; k++) { const m = (a + b) / 2; const hh = this.heightAt(o.x + d.x * m, o.z + d.z * m); if (o.y + d.y * m <= hh) b = m; else a = m; }
        return new THREE.Vector3(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b);
      }
      prev = tt;
      if (tt >= tmax) break;
    }
    return null;
  }

  // zakres pinów w prostokącie
  range(xa, xb, za, zb) {
    return [Math.max(0, this.col(xa)), Math.min(this.cols - 1, this.col(xb)), Math.max(0, this.row(za)), Math.min(this.rows - 1, this.row(zb))];
  }

  // ---------- ruch ----------
  update(dt) {
    const { h, vel, target, boost, n } = this;
    const maxH = this.maxH;
    const s0 = this.speed * dt;
    let moved = false;
    for (let i = 0; i < n; i++) {
      let t = target[i];
      if (t < 0) t = 0; else if (t > maxH) t = maxH;
      const d = t - h[i];
      if (d === 0) { if (vel[i] !== 0) vel[i] = 0; continue; }
      const s = boost[i] > 0 ? s0 * boost[i] : s0;
      const st = d > s ? s : d < -s ? -s : d;
      h[i] += st;
      vel[i] = st / dt;
      moved = true;
    }
    if (moved || this.dirty) { this.heightTex.needsUpdate = true; this.dirty = false; }
    return moved;
  }
}
