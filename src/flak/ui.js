import { CanvasPanel } from '../hud.js';

export const FIRE_MODES = [
  { key: 'sync', name: 'Zsynchronizowany' },
  { key: 'salvo', name: 'Pojedyncza salwa' },
  { key: 'cont', name: 'Ogień ciągły' },
];
export const VIEWS = [
  { key: 'none', name: 'Brak' },
  { key: 'shell', name: 'Z pocisku' },
  { key: 'chase', name: 'Za samolotem' },
  { key: 'cockpit', name: 'Z kokpitu' },
];

export class FlakHud extends CanvasPanel {
  constructor() { super(640, 470, 0.17); }
  draw(s) {
    const key = JSON.stringify(s);
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx, W = this.canvas.width;
    this.background(s.pilot ? 'rgba(255,210,90,0.8)' : 'rgba(170,190,140,0.7)');
    c.textAlign = 'left'; c.fillStyle = '#eef2d8'; c.font = 'bold 40px system-ui, sans-serif';
    c.fillText(s.pilot ? 'PILOT' : 'FLAK', 30, 56);
    c.textAlign = 'right'; c.font = 'bold 30px system-ui, sans-serif'; c.fillStyle = '#ffb4a8';
    c.fillText(`Fala ${s.wave} · ✈↓ ${s.down}`, W - 30, 54);
    c.textAlign = 'left'; c.font = '26px system-ui, sans-serif'; c.fillStyle = '#d0dcc8';
    c.fillText(`Samoloty: ${s.planes} · uciekły: ${s.escaped} · wioska: ${s.home}`, 30, 100);
    if (s.pilot) {
      c.fillText(`Wysokość ${s.alt} m · prędkość ${s.spd} m/s · HP ${s.hp}`, 30, 140);
      c.font = 'bold 28px system-ui, sans-serif'; c.fillStyle = '#ffe08a';
      c.fillText(s.bombs ? `Bomby: ${s.bombs} — spust: zrzut` : 'Bomby zrzucone', 30, 186);
    } else {
      c.fillText(`Działa: ${s.ready}/${s.guns} gotowe · tryb: ${s.mode}`, 30, 140);
      c.font = 'bold 30px system-ui, sans-serif'; c.fillStyle = '#ffe08a';
      c.fillText(s.countdown !== null ? `WYBUCH ZA ${s.countdown.toFixed(1)} s` : s.tof ? `Lot pocisku do strefy: ${s.tof}` : 'Strefa poza zasięgiem', 30, 186);
      c.font = '24px system-ui, sans-serif'; c.fillStyle = '#c0ccb8';
      c.fillText(`Strefa: ${s.box}`, 30, 222);
    }
    c.font = 'bold 28px system-ui, sans-serif'; c.fillStyle = s.msgColor || '#9fe8b0';
    if (s.msg) c.fillText(s.msg, 30, 272);
    c.font = '21px system-ui, sans-serif'; c.fillStyle = '#93a08c';
    (s.pilot ? [
      'Prawa gałka: skręt ←→, wznoszenie ↑↓ · spust: bomby',
      'Działa AI celują w Twój samolot — manewruj!',
      'B: menu · klik prawej gałki: widok · Y: następna fala',
    ] : [
      'Spust: ognia · trzymaj A: rozciągnij strefę obiema rękami',
      'Prawa gałka ↑↓ wysokość strefy · ←→ jej wielkość',
      'Klik prawej gałki: widok · klik lewej: następny samolot',
      'B: menu · Y: następna fala · X: makieta przed siebie',
    ]).forEach((l, i) => c.fillText(l, 30, 320 + i * 30));
    this.tex.needsUpdate = true;
  }
}

export class FlakMenu extends CanvasPanel {
  constructor() { super(720, 980, 0.2); this.buttons = []; this.hover = -1; this.mesh.visible = false; }
  hit(px, py) { return this.buttons.findIndex((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h); }
  draw(o) {
    const key = JSON.stringify([o, this.hover]);
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx;
    this.background('#a8b48a');
    this.buttons = [];
    const btn = (x, y, w, h, label, act, active, accent) => {
      const i = this.buttons.length;
      this.buttons.push({ x, y, w, h, act });
      c.fillStyle = this.hover === i ? '#e8f0b0' : active ? '#5a6a2a' : (accent || '#33392c');
      this.roundRect(x, y, w, h, 12); c.fill();
      c.fillStyle = this.hover === i ? '#1a2008' : '#f0f2e6';
      let fs = 25; c.font = `bold ${fs}px system-ui, sans-serif`;
      while (c.measureText(label).width > w - 14 && fs > 13) { fs--; c.font = `bold ${fs}px system-ui, sans-serif`; }
      c.textAlign = 'center'; c.fillText(label, x + w / 2, y + h / 2 + 9); c.textAlign = 'left';
    };
    const label = (t, y) => { c.fillStyle = '#d8e0b8'; c.font = 'bold 23px system-ui, sans-serif'; c.fillText(t, 30, y); };
    const row = (items, y, h = 58) => { const n = items.length, gap = 10, w = (660 - gap * (n - 1)) / n; items.forEach(([l, a, act, acc], k) => btn(30 + k * (w + gap), y, w, h, l, a, act, acc)); };
    c.fillStyle = '#eef2d8'; c.font = 'bold 42px system-ui, sans-serif'; c.fillText('OBRONA PRZECIWLOTNICZA', 30, 58);
    let y = 78;
    label('ROLA', y + 22); y += 32;
    row([['Działa (Flak)', 'role:gun', !o.pilot], ['Pilot samolotu', 'role:pilot', o.pilot]], y, 62); y += 76;
    label('TRYB OGNIA', y + 22); y += 32;
    row(FIRE_MODES.map((m, i) => [m.name, 'fire:' + i, o.fire === i]), y); y += 72;
    c.fillStyle = '#eef2d8'; c.font = '27px system-ui, sans-serif'; c.fillText('Liczba dział', 30, y + 38);
    btn(390, y, 64, 56, '−', 'guns-'); c.fillStyle = '#fff'; c.font = 'bold 28px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(String(o.guns), 540, y + 38); c.textAlign = 'left'; btn(626, y, 64, 56, '+', 'guns+');
    y += 72;
    label('PODGLĄD (OBRAZ W OBRAZIE)', y + 22); y += 32;
    row(VIEWS.map((v, i) => [v.name, 'view:' + i, o.view === i]), y); y += 68;
    row([['◀ Samolot', 'plane-'], ['Samolot ▶', 'plane+'], [`Predykcja: ${o.pred ? 'wł.' : 'wył.'}`, 'pred']], y); y += 76;
    row([['Następna fala', 'wave', false, '#5a2a2a'], ['Nowa gra', 'new', false, '#5a3a2a']], y); y += 68;
    row([['Przed siebie', 'place'], ['Zamknij', 'close']], y); y += 68;
    row([['Artyleria', 'mode:index.html', false, '#2a3a5a'], ['Katastrofy', 'mode:disasters.html', false, '#5a3a1a'], ['Stół pinów', 'mode:pins.html', false, '#1a3a5a']], y); y += 86;
    c.font = '21px system-ui, sans-serif'; c.fillStyle = '#d0d8b8';
    [
      'Zsynchronizowany: działa same dobierają opóźnienia,',
      'tak by wszystkie pociski wybuchły w strefie w jednej chwili.',
      'Przerywane linie: tor samolotów na 30 s, kropki co 10 s,',
      'żółte romby: gdzie samolot będzie w chwili wybuchu.',
    ].forEach((l, i) => c.fillText(l, 30, y + i * 28));
    this.tex.needsUpdate = true;
  }
}
