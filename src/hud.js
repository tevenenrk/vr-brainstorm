import * as THREE from 'three';

// Panel rysowany na canvasie i wyświetlany jako tekstura (VR) lub HTML (desktop).
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
  }

  roundRect(x, y, w, h, r) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
}

export class Hud extends CanvasPanel {
  constructor() {
    super(640, 470, 0.17);
    this.last = '';
  }

  draw(s) {
    const key = JSON.stringify(s);
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(14,20,16,0.86)';
    this.roundRect(4, 4, W - 8, H - 8, 26); c.fill();
    c.strokeStyle = 'rgba(160,220,170,0.6)'; c.lineWidth = 3; c.stroke();

    c.fillStyle = '#d8f5dc'; c.font = 'bold 44px system-ui, sans-serif';
    c.fillText(`FALA ${s.wave}`, 30, 62);
    c.textAlign = 'right';
    c.fillStyle = '#ffb4a8';
    c.fillText(`☠ ${s.kills}`, W - 30, 62);
    c.textAlign = 'left';

    c.font = '30px system-ui, sans-serif';
    c.fillStyle = '#b9d6bd';
    c.fillText(`Wróg na mapie: ${s.alive}`, 30, 108);
    c.fillText(`Przełamania: ${s.breaches} / ${s.maxBreaches}`, 30, 146);
    c.fillText(`Tor: ${s.high ? 'STROMY (górny)' : 'PŁASKI (dolny)'}`, 30, 184);

    // gotowość dział
    c.fillText('Działa:', 30, 232);
    s.guns.forEach((r, i) => {
      const x = 150 + i * 110, y = 208, w = 92, h = 30;
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x, y, w, h);
      c.fillStyle = r >= 1 ? '#7dffb0' : '#e8a040';
      c.fillRect(x, y, w * r, h);
    });

    // cel
    c.font = 'bold 32px system-ui, sans-serif';
    const colors = { ok: '#7dffb0', blocked: '#ffa53a', range: '#ff6a5a', none: '#8aa08e' };
    c.fillStyle = colors[s.status] || '#fff';
    const txt = {
      ok: `Cel: ${(s.dist / 1000).toFixed(2)} km · lot ${s.flight.toFixed(1)} s`,
      blocked: 'TOR ZASŁONIĘTY — zmień tor (A)',
      range: 'POZA ZASIĘGIEM',
      none: 'Wyceluj w teren na stole',
    }[s.status];
    c.fillText(txt, 30, 290);

    c.font = 'bold 34px system-ui, sans-serif';
    c.fillStyle = s.msgColor || '#ffe9a0';
    if (s.msg) c.fillText(s.msg, 30, 346);

    c.font = '22px system-ui, sans-serif';
    c.fillStyle = '#7f9c84';
    c.fillText('Spust: ognia · Grip: chwyć stół · A: tor · B: pomoc', 30, 404);
    c.fillText('X: przywróć stół · Y: nowa gra · lewa gałka: obrót/zoom', 30, 438);
    this.tex.needsUpdate = true;
  }
}

export class HelpBoard extends CanvasPanel {
  constructor() {
    super(900, 560, 0.42);
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.fillStyle = 'rgba(16,22,18,0.9)';
    this.roundRect(4, 4, W - 8, H - 8, 30); c.fill();
    c.strokeStyle = '#b08d3c'; c.lineWidth = 5; c.stroke();
    c.fillStyle = '#f0e2b8'; c.font = 'bold 54px system-ui, sans-serif';
    c.fillText('BATERIA — stół dowodzenia', 40, 80);
    c.font = '32px system-ui, sans-serif'; c.fillStyle = '#d8e8d8';
    const lines = [
      '🎯  Celuj promieniem z kontrolera w teren',
      '🔫  Spust — salwa z gotowych dział',
      '✊  Grip (jedna ręka) — przesuń i obróć stół',
      '🙌  Grip obiema rękami — skaluj i obracaj',
      '🅰  A — tor płaski / stromy (przez wzgórza)',
      '🅱  B — pokaż / ukryj tę tablicę',
      '❎  X — przywróć stół przed siebie',
      '🔄  Y — nowa gra   ·   lewa gałka — obrót/zoom',
    ];
    lines.forEach((l, i) => c.fillText(l, 40, 150 + i * 48));
    c.fillStyle = '#ffb4a8'; c.font = 'bold 30px system-ui, sans-serif';
    c.fillText('Nie pozwól wrogowi dojść do linii baterii!', 40, 535);
    this.tex.needsUpdate = true;
  }
}
