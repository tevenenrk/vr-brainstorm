import * as THREE from 'three';
import { DIFFICULTY_NAMES, AMMO, AMMO_ORDER } from './config.js';

// Panel rysowany na canvasie: tekstura w VR, element HTML na komputerze.
export class CanvasPanel {
  constructor(w, h, widthMeters) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const hm = (widthMeters * h) / w;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(widthMeters, hm),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthWrite: false }),
    );
    this.mesh.renderOrder = 10;
    this.last = '';
  }

  roundRect(x, y, w, h, r) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  background(stroke) {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(14,20,16,0.9)';
    this.roundRect(4, 4, W - 8, H - 8, 26); c.fill();
    c.strokeStyle = stroke; c.lineWidth = 3; c.stroke();
  }
}

export class Hud extends CanvasPanel {
  constructor() { super(640, 540, 0.17); }

  draw(s) {
    const key = JSON.stringify(s);
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx, W = this.canvas.width;
    this.background(s.continuous ? 'rgba(255,110,90,0.9)' : 'rgba(160,220,170,0.6)');
    c.textAlign = 'left';
    c.fillStyle = '#d8f5dc'; c.font = 'bold 44px system-ui, sans-serif';
    c.fillText(`FALA ${s.wave}`, 30, 62);
    c.textAlign = 'right'; c.fillStyle = '#ffb4a8';
    c.fillText(`☠ ${s.kills}`, W - 30, 62);
    c.textAlign = 'left';

    c.font = '27px system-ui, sans-serif'; c.fillStyle = '#b9d6bd';
    c.fillText(`Piechota: ${s.alive}  ·  Czołgi: ${s.tanks}  ·  zniszczone: ${s.tankKills}`, 30, 106);
    c.font = '30px system-ui, sans-serif';
    c.fillStyle = s.homeAlive < s.homeTotal / 2 ? '#ff9a8a' : '#b9d6bd';
    c.fillText(`Wioska: ${s.homeAlive} / ${s.homeTotal} domów`, 30, 144);
    c.fillStyle = '#b9d6bd';
    c.fillText(`Kąt lufy: ${s.angle}°   ·   ${s.mode}`, 30, 182);

    // gotowość dział
    const n = s.guns.length;
    const bw = Math.min(100, (W - 60) / n - 8);
    s.guns.forEach((r, i) => {
      const x = 30 + i * (bw + 8), y = 202, h = 28;
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x, y, bw, h);
      c.fillStyle = r >= 1 ? '#7dffb0' : '#e8a040';
      c.fillRect(x, y, bw * r, h);
    });

    c.font = 'bold 30px system-ui, sans-serif';
    c.fillStyle = s.ammoColor;
    c.fillText(`▶ ${s.ammo}${s.nukeCd ? `  (gotowa za ${s.nukeCd} s)` : ''}`, 30, 262);
    const colors = { ok: '#7dffb0', blocked: '#ffa53a', range: '#ff6a5a', none: '#8aa08e' };
    c.fillStyle = colors[s.status] || '#fff';
    const txt = {
      ok: `Cel: ${(s.dist / 1000).toFixed(2)} km · lot ${s.flight.toFixed(1)} s`,
      blocked: 'TOR ZASŁONIĘTY — zmień kąt',
      range: 'POZA ZASIĘGIEM — zmniejsz kąt',
      none: 'Wyceluj w teren na stole',
    }[s.status];
    c.fillText(txt, 30, 304);

    if (s.continuous) {
      c.fillStyle = '#ff7a64'; c.font = 'bold 32px system-ui, sans-serif';
      c.fillText('● OGIEŃ CIĄGŁY (spust = stop)', 30, 350);
    }
    c.font = 'bold 32px system-ui, sans-serif';
    c.fillStyle = s.msgColor || '#ffe9a0';
    if (s.msg) c.fillText(s.msg, 30, 396);

    c.font = '22px system-ui, sans-serif'; c.fillStyle = '#7f9c84';
    c.fillText('Spust: salwa · 2× spust: ogień ciągły · B: menu', 30, 448);
    c.fillText('Prawa gałka ↑↓ kąt · ←→ amunicja · klik: blokada', 30, 480);
    c.fillText('Trzymaj A i przesuń: obszar · Y: następna fala', 30, 512);
    this.tex.needsUpdate = true;
  }
}

// Menu opcji z przyciskami (klik promieniem lub myszą)
export class Menu extends CanvasPanel {
  constructor() {
    super(720, 1030, 0.2);
    this.buttons = [];
    this.hover = -1;
    this.mesh.visible = false;
  }

  hit(px, py) {
    return this.buttons.findIndex((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
  }

  draw(o) {
    const key = JSON.stringify([o, this.hover]);
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx, W = this.canvas.width;
    this.background('#b08d3c');
    this.buttons = [];
    c.textAlign = 'left';
    c.fillStyle = '#f0e2b8'; c.font = 'bold 46px system-ui, sans-serif';
    c.fillText('OPCJE', 34, 66);

    const btn = (x, y, w, h, label, act, accent) => {
      const i = this.buttons.length;
      this.buttons.push({ x, y, w, h, act });
      c.fillStyle = this.hover === i ? '#7dffb0' : (accent || '#2f3f35');
      this.roundRect(x, y, w, h, 14); c.fill();
      c.fillStyle = this.hover === i ? '#10301c' : '#e6f3e8';
      c.font = 'bold 30px system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText(label, x + w / 2, y + h / 2 + 11);
      c.textAlign = 'left';
    };
    const row = (y, label, value, act) => {
      c.fillStyle = '#c9dccc'; c.font = '30px system-ui, sans-serif';
      c.fillText(label, 34, y + 40);
      btn(390, y, 70, 58, '−', act + '-');
      c.fillStyle = '#ffffff'; c.font = 'bold 32px system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText(value, 540, y + 41); c.textAlign = 'left';
      btn(620, y, 70, 58, '+', act + '+');
    };
    let y = 100;
    row(y, 'Liczba dział', String(o.guns), 'guns'); y += 76;
    row(y, 'Czas ładowania', `${o.reload.toFixed(1)} s`, 'reload'); y += 76;
    row(y, 'Kąt lufy', `${Math.round(o.angle)}°`, 'angle'); y += 76;
    row(y, 'Szybkość pocisków', `${Math.round(o.speed * 100)}%`, 'speed'); y += 76;
    row(y, 'Trudność', DIFFICULTY_NAMES[o.difficulty], 'diff'); y += 76;
    c.fillStyle = '#c9dccc'; c.font = '30px system-ui, sans-serif';
    c.fillText('Amunicja', 34, y + 40);
    btn(190, y, 70, 58, '−', 'ammo-');
    const am = AMMO[AMMO_ORDER[o.ammo]];
    c.fillStyle = am.color; c.font = 'bold 28px system-ui, sans-serif'; c.textAlign = 'center';
    c.fillText(am.name, 440, y + 40); c.textAlign = 'left';
    btn(620, y, 70, 58, '+', 'ammo+'); y += 92;

    btn(34, y, 316, 66, 'Następna fala', 'wave', '#5a2a2a');
    btn(370, y, 316, 66, 'Nowa gra', 'new', '#5a3a2a'); y += 84;
    btn(34, y, 316, 66, 'Stół przed siebie', 'place');
    btn(370, y, 316, 66, 'Zamknij menu', 'close'); y += 104;

    c.font = '22px system-ui, sans-serif'; c.fillStyle = '#9fb8a4';
    const help = [
      'Spust — salwa z gotowych dział',
      '2× spust szybko — ogień ciągły (spust — stop)',
      'Prawa gałka ↑↓ — kąt lufy · ←→ — amunicja',
      'Klik prawej gałki — zablokuj / odblokuj cel',
      'Trzymaj A + przesuń — obszar ostrzału; A krótko — usuń',
      'Grip — chwyć stół, oburącz — skaluj',
      'Lewa gałka — obrót / zoom stołu',
      'X — stół przed siebie · Y — następna fala',
    ];
    help.forEach((l, i) => c.fillText(l, 34, y + i * 31));
    this.tex.needsUpdate = true;
  }
}
