import { CanvasPanel } from '../hud.js';
import { BRUSH_OPS } from './tools.js';
import { PROGRAMS } from './programs.js';
import { SHAPES } from './physics.js';
import { PRESETS, PRESET_ORDER } from './presets.js';

export const TOOLS = [{ key: 'brush', name: 'Pędzel' }, { key: 'spline', name: 'Splajny' }, { key: 'objects', name: 'Przedmioty' }];
export const PROGRAM_KEYS = Object.keys(PROGRAMS);

export class PinHud extends CanvasPanel {
  constructor() { super(640, 430, 0.17); }
  draw(s) {
    const key = JSON.stringify(s);
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx, W = this.canvas.width;
    this.background('rgba(140,200,255,0.7)');
    c.textAlign = 'left'; c.fillStyle = '#d6ecff'; c.font = 'bold 40px system-ui, sans-serif';
    c.fillText('STÓŁ PINÓW', 30, 56);
    c.textAlign = 'right'; c.font = '24px system-ui, sans-serif'; c.fillStyle = '#9fb8cc';
    c.fillText(`${s.cols}×${s.rows} · ${s.fps} fps`, W - 30, 54);
    c.textAlign = 'left'; c.font = 'bold 30px system-ui, sans-serif'; c.fillStyle = '#ffe08a';
    c.fillText(`▶ ${s.tool}: ${s.sub}`, 30, 104);
    c.font = '26px system-ui, sans-serif'; c.fillStyle = '#c8d8e4';
    c.fillText(`Pędzel ⌀ ${(s.radius * 200).toFixed(1)} cm · Pin ${s.pin} mm · Wys. ${s.maxH} cm`, 30, 144);
    c.fillText(s.hint, 30, 184);
    c.font = 'bold 28px system-ui, sans-serif'; c.fillStyle = s.msgColor || '#9fe8b0';
    if (s.msg) c.fillText(s.msg, 30, 234);
    c.font = '21px system-ui, sans-serif'; c.fillStyle = '#8aa0b0';
    [
      'Spust: użyj narzędzia · A: zmień tryb narzędzia · B: menu',
      'Prawa gałka ↑↓ podnieś/opuść piny · ←→ wielkość pędzla',
      'Grip przy przedmiocie: chwyć go · gdzie indziej: chwyć stół',
      'Splajny: trzymaj spust na obu rękach i rysuj w powietrzu',
      'Końcówką kontrolera możesz wciskać piny · Y: cofnij',
    ].forEach((l, i) => c.fillText(l, 30, 290 + i * 28));
    this.tex.needsUpdate = true;
  }
}

export class PinMenu extends CanvasPanel {
  constructor() { super(760, 1290, 0.24); this.buttons = []; this.hover = -1; this.mesh.visible = false; }
  hit(px, py) { return this.buttons.findIndex((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h); }
  draw(o) {
    const key = JSON.stringify([o, this.hover]);
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx;
    this.background('#6fb4ff');
    this.buttons = [];
    const btn = (x, y, w, h, label, act, active, accent) => {
      const i = this.buttons.length;
      this.buttons.push({ x, y, w, h, act });
      c.fillStyle = this.hover === i ? '#9fe0ff' : active ? '#2d6aa8' : (accent || '#2c3a44');
      this.roundRect(x, y, w, h, 12); c.fill();
      c.fillStyle = this.hover === i ? '#0a2236' : '#eef6fb';
      let fs = h > 50 ? 25 : 22;
      c.font = `bold ${fs}px system-ui, sans-serif`;
      while (c.measureText(label).width > w - 12 && fs > 12) { fs--; c.font = `bold ${fs}px system-ui, sans-serif`; }
      c.textAlign = 'center';
      c.fillText(label, x + w / 2, y + h / 2 + 9);
      c.textAlign = 'left';
    };
    const label = (t, y) => { c.fillStyle = '#9fc8e8'; c.font = 'bold 24px system-ui, sans-serif'; c.fillText(t, 30, y); };
    const row = (items, y, h = 56) => {
      const n = items.length, gap = 10, w = (700 - gap * (n - 1)) / n;
      items.forEach(([l, a, act, acc], k) => btn(30 + k * (w + gap), y, w, h, l, a, act, acc));
    };
    c.fillStyle = '#d6ecff'; c.font = 'bold 42px system-ui, sans-serif'; c.fillText('STÓŁ PINÓW', 30, 58);
    let y = 80;
    label('NARZĘDZIE', y + 22); y += 34;
    row(TOOLS.map((t) => [t.name, 'tool:' + t.key, o.tool === t.key]), y, 62); y += 76;
    label('PĘDZEL', y + 22); y += 34;
    row(BRUSH_OPS.map((b, k) => [b.name, 'op:' + k, o.tool === 'brush' && o.op === k]), y); y += 70;
    label('PROGRAMY (wybierz, potem spust na przedmiocie)', y + 22); y += 34;
    row(PROGRAM_KEYS.slice(0, 3).map((k, i) => [PROGRAMS[k].name, 'prog:' + i, o.tool === 'objects' && o.prog === i]), y); y += 66;
    row([...PROGRAM_KEYS.slice(3).map((k, i) => [PROGRAMS[k].name, 'prog:' + (i + 3), o.tool === 'objects' && o.prog === i + 3]), ['Stop', 'stopall', false, '#5a2a2a']], y); y += 70;
    label('DODAJ PRZEDMIOT', y + 22); y += 34;
    row([...Object.keys(SHAPES).map((k) => [SHAPES[k].name, 'spawn:' + k]), ['Usuń', 'clearobj', false, '#5a2a2a']], y); y += 70;
    label('KSZTAŁTY', y + 22); y += 34;
    for (let r = 0; r < 3; r++) { row(PRESET_ORDER.slice(r * 3, r * 3 + 3).map((k) => [PRESETS[k].name, 'preset:' + k, o.anim === k]), y); y += 66; }
    y += 4;
    label('USTAWIENIA', y + 22); y += 34;
    const setting = (t, v, a) => {
      c.fillStyle = '#d6ecff'; c.font = '26px system-ui, sans-serif'; c.fillText(t, 30, y + 38);
      btn(420, y, 64, 54, '−', a + '-'); c.fillStyle = '#fff'; c.font = 'bold 26px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(v, 580, y + 37); c.textAlign = 'left'; btn(666, y, 64, 54, '+', a + '+');
      y += 64;
    };
    setting('Rozdzielczość', `${o.cols}×${o.rows}`, 'res');
    setting('Wysuw maks.', `${Math.round(o.maxH * 100)} cm`, 'maxh');
    setting('Prędkość pinów', `${o.speed.toFixed(2)} m/s`, 'speed');
    row([[`Kolory: ${o.colorMode ? 'mapa' : 'naturalne'}`, 'colors'], [`Cienie: ${o.shadows ? 'wł.' : 'wył.'}`, 'shadows'], [`Dotyk: ${o.touch ? 'wł.' : 'wył.'}`, 'touch']], y); y += 70;
    row([['Cofnij', 'undo'], ['Przed siebie', 'place'], ['Zamknij', 'close']], y); y += 66;
    row([['Artyleria', 'mode:index.html', false, '#2a3a5a'], ['Katastrofy', 'mode:disasters.html', false, '#5a3a1a'], ['Flak', 'mode:flak.html', false, '#3a4a1a'], ['Bitwa', 'mode:battle.html', false, '#2a3a5a'], ['Bomba', 'mode:nuke.html', false, '#6a2a1a']], y);
    this.tex.needsUpdate = true;
  }
}

// "kamera" nad stołem: obraz głębi + rozpoznane przedmioty
export class CameraMonitor extends CanvasPanel {
  constructor() {
    super(480, 680, 0.3);
    this.small = document.createElement('canvas');
    this.sctx = this.small.getContext('2d');
    this.t = 0;
  }
  update(f, bodies, time) {
    const step = f.cols > 220 ? 2 : 1;
    const w = Math.floor(f.cols / step), h = Math.floor(f.rows / step);
    if (this.small.width !== w) { this.small.width = w; this.small.height = h; this.img = this.sctx.createImageData(w, h); }
    const d = this.img.data;
    const depth = new Float32Array(w * h), mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) depth[y * w + x] = f.h[(y * step) * f.cols + x * step];
    bodies.forEach((b, bi) => {
      const [c0, c1, r0, r1] = f.range(b.pos.x - b.radius, b.pos.x + b.radius, b.pos.z - b.radius, b.pos.z + b.radius);
      for (let r = r0; r <= r1; r += step) for (let c = c0; c <= c1; c += step) {
        const sp = b.verticalSpan(f.cx(c), f.cz(r));
        if (!sp) continue;
        const k = Math.floor(r / step) * w + Math.floor(c / step);
        if (k >= 0 && k < depth.length && sp[1] > depth[k]) { depth[k] = sp[1]; mask[k] = bi + 1; }
      }
    });
    const maxH = f.maxH;
    for (let k = 0; k < w * h; k++) {
      const t = Math.min(1, Math.max(0, depth[k] / (maxH * 1.3)));
      let r = 20 + 60 * t, g = 30 + 200 * t, b = 90 + 120 * (1 - t);
      if (t > 0.5) { r = 80 + 175 * (t - 0.5) * 2; g = 230 - 60 * (t - 0.5) * 2; b = 60; }
      if (mask[k]) { r = r * 0.4 + 255 * 0.6; g = g * 0.4 + 140 * 0.6; b = b * 0.4 + 40 * 0.6; }
      d[k * 4] = r; d[k * 4 + 1] = g; d[k * 4 + 2] = b; d[k * 4 + 3] = 255;
    }
    this.sctx.putImageData(this.img, 0, 0);
    const c = this.ctx, Wc = this.canvas.width, Hc = this.canvas.height;
    this.background('rgba(120,200,255,0.7)');
    const ix = 20, iy = 70, iw = Wc - 40, ih = Hc - 160;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.small, ix, iy, iw, ih);
    c.fillStyle = '#d6ecff'; c.font = 'bold 28px system-ui, sans-serif'; c.fillText('KAMERA · GŁĘBIA', 22, 46);
    if (Math.floor(time * 2) % 2 === 0) { c.fillStyle = '#ff4040'; c.beginPath(); c.arc(Wc - 40, 38, 10, 0, Math.PI * 2); c.fill(); }
    // linia skanu
    const sy = iy + ((time * 0.35) % 1) * ih;
    c.fillStyle = 'rgba(140,255,200,0.5)'; c.fillRect(ix, sy, iw, 2);
    // rozpoznane przedmioty
    const toPx = (x, z) => [ix + ((x - f.ox) / (f.cols * f.pitch)) * iw, iy + ((z - f.oz) / (f.rows * f.pitch)) * ih];
    c.font = 'bold 15px system-ui, sans-serif';
    let list = 0;
    for (const b of bodies) {
      const [px, py] = toPx(b.pos.x, b.pos.z);
      const rr = (b.radius / (f.cols * f.pitch)) * iw;
      c.strokeStyle = b.program ? '#ffe08a' : '#7dffb0'; c.lineWidth = 2;
      c.strokeRect(px - rr, py - rr, rr * 2, rr * 2);
      c.fillStyle = c.strokeStyle;
      c.fillText(b.name, px - rr, py - rr - 5);
      if (list < 4) {
        const dims = b.type === 'box' ? b.dims.map((v) => (v * 200).toFixed(0)).join('×') : b.type === 'sphere' ? `⌀${(b.dims[0] * 200).toFixed(0)}` : `⌀${(b.dims[0] * 200).toFixed(0)}×${(b.dims[1] * 200).toFixed(0)}`;
        const fp = b.footprint();
        c.fillStyle = '#cfe6f5'; c.font = '17px system-ui, sans-serif';
        c.fillText(`• ${b.name} ${dims} cm, kąt ${Math.round((fp.angle * 180) / Math.PI)}°, wys. ${((b.pos.y + b.radius * 0.3) * 100).toFixed(1)} cm${b.program ? ' — ' + b.program.type : ''}`, 22, Hc - 74 + list * 20);
        c.font = 'bold 15px system-ui, sans-serif';
        list++;
      }
    }
    if (!bodies.length) { c.fillStyle = '#9fb8cc'; c.font = '18px system-ui, sans-serif'; c.fillText('Brak przedmiotów na stole', 22, Hc - 60); }
    this.tex.needsUpdate = true;
  }
}
