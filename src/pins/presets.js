// Gotowe kształty dla matrycy pinów. Każdy ustawia field.base (wysokości w m) i opcjonalnie kolory.
import { mulberry32 } from '../terrain.js';

function noise2(seed) {
  const rng = mulberry32(seed), N = 256, v = new Float32Array(N * N);
  for (let i = 0; i < v.length; i++) v[i] = rng();
  const at = (i, j) => v[((j & 255) << 8) | (i & 255)];
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
}

function forEach(f, fn) {
  const { cols, rows, pitch } = f, W = cols * pitch, D = rows * pitch;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    // u, v w metrach od środka stołu
    fn(i, (c + 0.5) * pitch - W / 2, (r + 0.5) * pitch - D / 2, c, r);
  }
}

const setC = (f, i, r, g, b) => { f.color[i * 4] = r; f.color[i * 4 + 1] = g; f.color[i * 4 + 2] = b; };
const gauss = (dx, dy, sx, sy) => Math.exp(-((dx * dx) / (sx * sx) + (dy * dy) / (sy * sy)));
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export const PRESETS = {
  flat: { name: 'Płasko', run(f) { f.base.fill(0); f.fillColor(222, 224, 228); } },

  terrain: {
    name: 'Teren',
    run(f) {
      const n = noise2(5), H = f.maxH;
      forEach(f, (i, x, z) => {
        let h = 0, a = 1, fr = 3, t = 0;
        for (let o = 0; o < 5; o++) { h += a * n(x * fr + 20, z * fr + 7); t += a; a *= 0.5; fr *= 2.1; }
        h = Math.max(0, (h / t - 0.35) / 0.55);
        h = h * h * H * 0.9;
        f.base[i] = h;
        const k = h / H;
        if (h < H * 0.04) setC(f, i, 70, 120, 200); else if (k < 0.3) setC(f, i, 90, 160, 80); else if (k < 0.6) setC(f, i, 120, 110, 80); else setC(f, i, 240, 240, 245);
      });
    },
  },

  waves: { name: 'Fale', anim: true, run(f) { f.base.fill(0.02); f.fillColor(120, 180, 240); } },

  city: {
    name: 'Miasto',
    run(f) {
      const rng = mulberry32(11), H = f.maxH;
      const block = 0.16, street = 0.035;
      const lots = new Map();
      forEach(f, (i, x, z) => {
        const bx = Math.floor((x + 10) / block), bz = Math.floor((z + 10) / block);
        const lx = (x + 10) - bx * block, lz = (z + 10) - bz * block;
        if (lx < street || lz < street) { f.base[i] = 0; setC(f, i, 70, 72, 78); return; }
        const key = bx * 1000 + bz;
        if (!lots.has(key)) {
          const park = rng() < 0.12;
          const dc = Math.hypot(bx * block - 10, bz * block - 10);
          const subs = [];
          for (let k = 0; k < 4; k++) {
            const tall = Math.exp(-dc * dc / 0.25);
            subs.push({ h: park ? 0 : (0.008 + rng() * 0.03 + tall * rng() * 0.08), col: [170 + rng() * 60, 160 + rng() * 60, 150 + rng() * 60] });
          }
          lots.set(key, { park, subs });
        }
        const lot = lots.get(key);
        const half = (block + street) / 2;
        const s = (lx > half ? 1 : 0) + (lz > half ? 2 : 0);
        const inner = Math.min(Math.abs(lx - half), Math.abs(lz - half)) < 0.004;
        if (lot.park) {
          const tree = Math.sin(x * 260) * Math.sin(z * 260) > 0.75;
          f.base[i] = tree ? 0.012 : 0.002; setC(f, i, tree ? 40 : 90, tree ? 120 : 170, tree ? 50 : 80);
          return;
        }
        const b = lot.subs[s];
        f.base[i] = inner ? 0.002 : Math.min(H, b.h);
        if (inner) setC(f, i, 120, 120, 125); else setC(f, i, b.col[0], b.col[1], b.col[2]);
      });
    },
  },

  face: {
    name: 'Twarz',
    run(f) {
      const H = f.maxH, S = 0.62;   // promień twarzy (m)
      const hair = noise2(3);
      forEach(f, (i, x, z) => {
        const u = x / S, v = -z / S;  // v w górę (w stronę dalszego końca stołu)
        const e = 1 - (u / 0.78) ** 2 - ((v - 0.05) / 1.0) ** 2;
        let h = e > 0 ? Math.sqrt(e) * 0.55 : 0;
        if (e > 0) {
          h += 0.08 * gauss(u, v - 0.38, 0.5, 0.12);                       // czoło / łuki brwiowe
          h += 0.05 * gauss(Math.abs(u) - 0.3, v - 0.27, 0.16, 0.04);      // brwi
          h -= 0.15 * gauss(Math.abs(u) - 0.3, v - 0.15, 0.15, 0.09);      // oczodoły
          h += 0.06 * gauss(Math.abs(u) - 0.3, v - 0.14, 0.07, 0.045);     // gałki oczne
          h += 0.26 * gauss(u, v + 0.02, 0.07, 0.22) * (v < 0.25 ? 1 : 0.4); // nos
          h += 0.08 * gauss(u, v + 0.18, 0.11, 0.06);                      // czubek nosa
          h -= 0.05 * gauss(Math.abs(u) - 0.06, v + 0.22, 0.03, 0.02);     // nozdrza
          h += 0.07 * gauss(Math.abs(u) - 0.36, v + 0.12, 0.17, 0.15);     // policzki
          h += 0.07 * gauss(u, v + 0.42, 0.17, 0.035);                     // górna warga
          h += 0.08 * gauss(u, v + 0.5, 0.15, 0.04);                       // dolna warga
          h -= 0.05 * gauss(u, v + 0.455, 0.17, 0.012);                    // usta
          h += 0.08 * gauss(u, v + 0.75, 0.2, 0.1);                        // broda
        }
        // uszy
        h += 0.22 * gauss(Math.abs(u) - 0.8, v - 0.05, 0.06, 0.16);
        // włosy
        const hairZone = e > -0.15 && v > 0.42 + 0.25 * (u * u) - 0.05;
        if (hairZone) h = Math.max(h, 0.4 + 0.14 * Math.sqrt(Math.max(0, 1 - u * u)) + 0.1 * hair(x * 45, z * 45) + 0.05 * Math.sin(u * 40 + hair(x * 20, z * 20) * 6));
        h = Math.max(0, h);
        f.base[i] = Math.min(H, h * H * 1.25);
        if (hairZone) setC(f, i, 90, 60, 40);
        else if (e > 0 || gauss(Math.abs(u) - 0.8, v - 0.05, 0.06, 0.16) > 0.25) {
          const lip = Math.abs(v + 0.47) < 0.06 && Math.abs(u) < 0.17;
          const eye = gauss(Math.abs(u) - 0.3, v - 0.14, 0.06, 0.035) > 0.5;
          if (eye) setC(f, i, 245, 245, 245); else if (lip) setC(f, i, 200, 100, 100); else setC(f, i, 236, 196, 168);
        } else setC(f, i, 60, 70, 90);
      });
    },
  },

  pyramids: {
    name: 'Piramidy',
    run(f) {
      const H = f.maxH;
      const P = [[0, -0.3, 0.42, 1], [0.38, 0.35, 0.28, 0.7], [-0.4, 0.45, 0.22, 0.55]];
      forEach(f, (i, x, z) => {
        let h = 0;
        for (const [px, pz, s, k] of P) {
          const d = Math.max(Math.abs(x - px), Math.abs(z - pz));
          const step = Math.floor((1 - d / s) * 12) / 12;
          h = Math.max(h, step * H * k);
        }
        f.base[i] = Math.max(0, h);
        setC(f, i, h > 0 ? 220 : 210, h > 0 ? 190 : 180, h > 0 ? 130 : 120);
      });
    },
  },

  dome: {
    name: 'Kopuła',
    run(f) {
      const H = f.maxH;
      forEach(f, (i, x, z) => {
        const d = Math.hypot(x, z) / 0.6;
        f.base[i] = d < 1 ? Math.sqrt(1 - d * d) * H : 0;
        const k = Math.round(Math.atan2(z, x) * 8 / Math.PI) & 1;
        setC(f, i, k ? 230 : 200, k ? 230 : 205, 235);
      });
    },
  },

  text: {
    name: 'Napis',
    run(f, opts = {}) {
      const txt = opts.text || 'STÓŁ\nPINÓW';
      const cv = document.createElement('canvas'); cv.width = f.cols; cv.height = f.rows;
      const c = cv.getContext('2d');
      c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const lines = txt.split('\n');
      let size = cv.height / (lines.length + 1);
      c.font = `900 ${size}px system-ui, sans-serif`;
      while (Math.max(...lines.map((l) => c.measureText(l).width)) > cv.width * 0.92 && size > 8) { size *= 0.92; c.font = `900 ${size}px system-ui, sans-serif`; }
      lines.forEach((l, k) => c.fillText(l, cv.width / 2, cv.height / 2 + (k - (lines.length - 1) / 2) * size * 1.05));
      const d = c.getImageData(0, 0, cv.width, cv.height).data;
      forEach(f, (i, x, z, col, row) => {
        const k = d[(row * cv.width + col) * 4] / 255;
        f.base[i] = k * f.maxH * 0.35;
        setC(f, i, k > 0.5 ? 255 : 40, k > 0.5 ? 140 : 44, k > 0.5 ? 60 : 52);
      });
    },
  },

  image: {
    name: 'Obraz…',
    run(f, opts = {}) {
      const img = opts.image;
      if (!img) return;
      const cv = document.createElement('canvas'); cv.width = f.cols; cv.height = f.rows;
      const c = cv.getContext('2d');
      const s = Math.max(cv.width / img.width, cv.height / img.height);
      c.drawImage(img, (cv.width - img.width * s) / 2, (cv.height - img.height * s) / 2, img.width * s, img.height * s);
      const d = c.getImageData(0, 0, cv.width, cv.height).data;
      forEach(f, (i, x, z, col, row) => {
        const p = (row * cv.width + col) * 4;
        const lum = (0.3 * d[p] + 0.59 * d[p + 1] + 0.11 * d[p + 2]) / 255;
        f.base[i] = clamp01(lum) * f.maxH * 0.5;
        setC(f, i, d[p], d[p + 1], d[p + 2]);
      });
    },
  },
};

export const PRESET_ORDER = ['flat', 'terrain', 'waves', 'city', 'face', 'pyramids', 'dome', 'text', 'image'];
