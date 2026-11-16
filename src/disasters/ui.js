import { CanvasPanel } from '../hud.js';
import { DISASTERS } from './scenarios.js';

export class DisasterHud extends CanvasPanel {
  constructor() { super(640, 470, 0.17); }
  draw(s) {
    const key = JSON.stringify(s);
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx, W = this.canvas.width;
    this.background('rgba(255,170,90,0.7)');
    c.textAlign = 'left';
    c.fillStyle = '#ffe2c4'; c.font = 'bold 40px system-ui, sans-serif';
    c.fillText('KATASTROFY', 30, 58);
    c.textAlign = 'right'; c.font = 'bold 30px system-ui, sans-serif';
    c.fillStyle = s.paused ? '#ff8a7a' : '#cfe8ff';
    c.fillText(s.paused ? '❚❚ PAUZA' : `${s.speed}×`, W - 30, 56);
    c.textAlign = 'left';
    c.font = '28px system-ui, sans-serif'; c.fillStyle = '#d8e6da';
    c.fillText(`Mieszkańcy: ${s.alive} / ${s.total}   ·   Ofiary: ${s.dead}`, 30, 104);
    c.fillText(`Budynki: ${s.buildings}  ·  Pojazdy: ${s.cars}  ·  Drzewa: ${s.trees}`, 30, 142);
    c.font = 'bold 28px system-ui, sans-serif';
    c.fillStyle = '#ffd08a';
    c.fillText(s.armed ? `▶ ${s.armed}${s.armedTarget ? ' — celuj i spust' : ''}` : 'B: wybierz katastrofę', 30, 192);
    c.font = '26px system-ui, sans-serif'; c.fillStyle = '#b8c8bc';
    c.fillText(s.active.length ? `Trwa: ${s.active.join(', ')}` : 'Spokojny dzień w miasteczku', 30, 236);
    c.font = 'bold 27px system-ui, sans-serif'; c.fillStyle = s.msgColor || '#ffe9a0';
    if (s.msg) c.fillText(s.msg, 30, 292);
    c.font = '22px system-ui, sans-serif'; c.fillStyle = '#8fa494';
    c.fillText('Spust: uruchom · B: menu · A: pauza', 30, 362);
    c.fillText('Prawa gałka ↑↓: tempo czasu · Y: odbuduj świat', 30, 394);
    c.fillText('Grip: chwyć makietę (oburącz: skala) · X: przed siebie', 30, 426);
    this.tex.needsUpdate = true;
  }
}

export class DisasterMenu extends CanvasPanel {
  constructor() { super(720, 900, 0.2); this.buttons = []; this.hover = -1; this.mesh.visible = false; }
  hit(px, py) { return this.buttons.findIndex((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h); }
  draw(o) {
    const key = JSON.stringify([o, this.hover]);
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx;
    this.background('#e08a3c');
    this.buttons = [];
    c.textAlign = 'left';
    c.fillStyle = '#ffe2c4'; c.font = 'bold 44px system-ui, sans-serif';
    c.fillText('WYBIERZ KATASTROFĘ', 34, 64);
    const btn = (x, y, w, h, label, act, accent, sub) => {
      const i = this.buttons.length;
      this.buttons.push({ x, y, w, h, act });
      c.fillStyle = this.hover === i ? '#ffc27a' : (accent || '#33403a');
      this.roundRect(x, y, w, h, 14); c.fill();
      c.fillStyle = this.hover === i ? '#2a1606' : '#f2f2ee';
      c.textAlign = 'center';
      c.font = `bold ${sub ? 30 : 28}px system-ui, sans-serif`;
      c.fillText(label, x + w / 2, y + (sub ? 36 : h / 2 + 10));
      if (sub) { c.font = '20px system-ui, sans-serif'; c.fillStyle = this.hover === i ? '#4a2a10' : '#b9c4bc'; c.fillText(sub, x + w / 2, y + 64); }
      c.textAlign = 'left';
    };
    let y = 92;
    DISASTERS.forEach((d, k) => {
      const x = 34 + (k % 2) * 336, yy = y + Math.floor(k / 2) * 92;
      btn(x, yy, 316, 80, `${d.target ? '🎯 ' : ''}${d.name}`, 'd:' + k, o.armed === k ? '#7a3a1a' : '#33403a', d.hint);
    });
    y += 4 * 92 + 14;
    c.fillStyle = '#d8e6da'; c.font = '30px system-ui, sans-serif';
    c.fillText('Tempo czasu', 34, y + 40);
    btn(250, y, 70, 58, '−', 'speed-');
    c.fillStyle = '#fff'; c.font = 'bold 32px system-ui, sans-serif'; c.textAlign = 'center';
    c.fillText(`${o.speed}×`, 375, y + 41); c.textAlign = 'left';
    btn(430, y, 70, 58, '+', 'speed+');
    btn(520, y, 166, 58, o.paused ? 'Wznów' : 'Pauza', 'pause');
    y += 82;
    btn(34, y, 316, 66, 'Odbuduj świat', 'reset', '#5a3a2a');
    btn(370, y, 316, 66, 'Przed siebie', 'place');
    y += 84;
    btn(34, y, 316, 66, 'Tryb: Artyleria', 'mode', '#2a3a5a');
    btn(370, y, 316, 66, 'Zamknij menu', 'close');
    y += 100;
    c.font = '22px system-ui, sans-serif'; c.fillStyle = '#9fb0a4';
    [
      '🎯 — wybierz, potem wskaż miejsce promieniem i naciśnij spust',
      'Pozostałe startują od razu. Katastrofy mogą się nakładać:',
      'silne trzęsienie przy tamie ją urwie, pod morzem — tsunami.',
      'A — pauza · prawa gałka ↑↓ — tempo · Y — odbuduj świat',
    ].forEach((l, i) => c.fillText(l, 34, y + i * 31));
    this.tex.needsUpdate = true;
  }
}
