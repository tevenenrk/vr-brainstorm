import * as THREE from 'three';

// Dźwięki generowane proceduralnie (bez plików).
export class TrenchAudio {
  constructor(camera, scene) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    const ctx = this.listener.context;
    this.ctx = ctx;
    const B = (dur, fn) => { const sr = ctx.sampleRate, n = Math.floor(sr * dur), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0); const st = {}; for (let i = 0; i < n; i++) d[i] = fn(i / sr, st); return b; };
    const noiseLP = (cut) => { let lp = 0; const a = Math.min(1, cut * 2 * Math.PI / ctx.sampleRate); return () => (lp += a * ((Math.random() * 2 - 1) - lp)); };
    const shot = (dur, cut, thump, decay, crack) => { const n1 = noiseLP(cut), n2 = noiseLP(cut * 0.35); return B(dur, (t) => Math.tanh(((n1() * 2.2 + n2() * 1.5) * Math.exp(-t * decay) * Math.min(1, t * 2000) + Math.sin(2 * Math.PI * thump * t) * Math.exp(-t * 18) * 0.8 + (t < 0.006 ? (Math.random() * 2 - 1) * crack : 0)) * 1.6) * 0.85); };
    this.buffers = {
      rifle: shot(0.55, 4200, 95, 11, 1.0),
      pistol: shot(0.4, 3600, 130, 14, 0.8),
      far: shot(1.2, 1300, 60, 4.5, 0.2),
      boom: shot(2.4, 900, 42, 2.0, 0.6),
      thunder: shot(4, 350, 30, 1.1, 0),
      click: B(0.05, (t) => (t < 0.004 ? (Math.random() * 2 - 1) : 0) + Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t * 300) * 0.6),
      magout: B(0.18, (t) => (t < 0.005 ? (Math.random() * 2 - 1) * 0.8 : 0) + Math.sin(2 * Math.PI * 900 * t) * Math.exp(-t * 60) * 0.4 + Math.sin(2 * Math.PI * 1800 * (t - 0.06)) * (t > 0.06 ? Math.exp(-(t - 0.06) * 120) : 0) * 0.3),
      magin: B(0.22, (t) => { const k = (u) => (u > 0 && u < 0.006 ? (Math.random() * 2 - 1) : 0) + (u > 0 ? Math.sin(2 * Math.PI * 1400 * u) * Math.exp(-u * 160) * 0.5 : 0); return k(t) * 0.8 + k(t - 0.11); }),
      pin: B(0.25, (t) => Math.sin(2 * Math.PI * (3000 - t * 4000) * t) * Math.exp(-t * 18) * 0.35 + (t < 0.01 ? (Math.random() * 2 - 1) * 0.6 : 0)),
      whiz: (() => { const n = noiseLP(5000); return B(0.35, (t) => n() * 2 * Math.sin(Math.PI * Math.min(1, t / 0.35)) ** 2 * (1 + Math.sin(2 * Math.PI * (900 - t * 1500) * t) * 0.6)); })(),
      snap: (() => { const n = noiseLP(7000); return B(0.12, (t) => n() * 3 * Math.exp(-t * 60) + (t < 0.003 ? (Math.random() * 2 - 1) : 0)); })(),
      dirt: (() => { const n = noiseLP(1800); return B(0.3, (t) => n() * 2.2 * Math.exp(-t * 18)); })(),
      flesh: (() => { const n = noiseLP(900); return B(0.25, (t) => n() * 2.5 * Math.exp(-t * 25) + Math.sin(2 * Math.PI * 110 * t) * Math.exp(-t * 30) * 0.6); })(),
      hurt: B(0.5, (t) => Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 9) + Math.sin(2 * Math.PI * 70 * (t - 0.2)) * (t > 0.2 ? Math.exp(-(t - 0.2) * 12) : 0) * 0.7),
      clang: B(0.35, (t) => (Math.sin(2 * Math.PI * 1250 * t) * 0.5 + Math.sin(2 * Math.PI * 1870 * t) * 0.35 + (Math.random() - 0.5) * 0.3 * Math.exp(-t * 60)) * Math.exp(-t * 12)),
      stab: (() => { const n = noiseLP(1200); return B(0.3, (t) => n() * 2 * Math.exp(-t * 14) + Math.sin(2 * Math.PI * 160 * t) * Math.exp(-t * 20) * 0.5); })(),
      hitmark: B(0.09, (t) => (Math.sin(2 * Math.PI * 3100 * t) * 0.5 + Math.sin(2 * Math.PI * 4650 * t) * 0.3 + Math.sin(2 * Math.PI * 6900 * t) * 0.15) * Math.exp(-t * 70) + (t < 0.004 ? (Math.random() - 0.5) * 0.9 : 0)),
      hitkill: B(0.22, (t) => { const a = (u) => (u > 0 ? (Math.sin(2 * Math.PI * 2600 * u) * 0.5 + Math.sin(2 * Math.PI * 3900 * u) * 0.3) * Math.exp(-u * 45) : 0); return a(t) + a(t - 0.075) * 0.9; }),
      // gwizdek oficera (początek fali)
      whistle: B(1.6, (t) => { const env = Math.min(1, t * 20) * (t < 0.55 ? 1 : t < 0.7 ? 0 : t < 1.5 ? 1 : 0) * 0.5; const f = 2950 + Math.sin(2 * Math.PI * 38 * t) * 120; return Math.sin(2 * Math.PI * f * t) * env * (0.8 + 0.2 * Math.random()); }),
      // minigun: ~45 strzałów/s, pętla
      minigun: (() => { const n = noiseLP(3000); return B(1, (t) => { const ph = (t * 45) % 1; return Math.tanh((n() * 2.4 * Math.exp(-ph * 9) + Math.sin(2 * Math.PI * 85 * t) * 0.3 + Math.sin(2 * Math.PI * 270 * t) * 0.15) * 1.6) * 0.8; }); })(),
      spin: B(1, (t) => (Math.sin(2 * Math.PI * 180 * t) * 0.2 + Math.sin(2 * Math.PI * 361 * t) * 0.12 + (Math.random() - 0.5) * 0.08)),
      steam: (() => { const n = noiseLP(6000); return B(2.2, (t) => n() * 1.5 * Math.min(1, t * 8) * Math.exp(-t * 1.2)); })(),
      wind: (() => { const n = noiseLP(400), m = noiseLP(1.2); return B(6, (t) => n() * 1.8 * (0.6 + m() * 6) * Math.min(1, t, 6 - t)); })(),
      heart: B(1, (t) => { const k = (u) => (u > 0 ? Math.sin(2 * Math.PI * 50 * u) * Math.exp(-u * 22) : 0); return k(t) + k(t - 0.22) * 0.7; }),
    };
    this.pool = [];
    for (let i = 0; i < 20; i++) {
      const a = new THREE.PositionalAudio(this.listener);
      a.setRefDistance(2); a.setRolloffFactor(1.1); a.setDistanceModel('inverse');
      scene.add(a); this.pool.push(a);
    }
    this.next = 0;
    this.flat = Array.from({ length: 6 }, () => new THREE.Audio(this.listener)); this.fi = 0;
    this.loops = {};
  }
  resume() { if (this.ctx.state !== 'running') this.ctx.resume(); }
  get ok() { return this.ctx.state === 'running'; }
  play(name, pos, vol = 1, rate = 1, ref = 2) {
    if (!this.ok) return;
    const a = this.pool[this.next]; this.next = (this.next + 1) % this.pool.length;
    if (a.isPlaying) a.stop();
    a.setBuffer(this.buffers[name]); a.setVolume(vol); a.setRefDistance(ref); a.playbackRate = rate * (0.94 + Math.random() * 0.12);
    a.position.copy(pos); a.updateMatrixWorld(); a.play();
  }
  // bez przestrzeni (w głowie gracza)
  ui(name, vol = 1, rate = 1) {
    if (!this.ok) return;
    const a = this.flat[this.fi]; this.fi = (this.fi + 1) % this.flat.length;
    if (a.isPlaying) a.stop();
    a.setBuffer(this.buffers[name]); a.setVolume(vol); a.playbackRate = rate; a.play();
  }
  // pętle (minigun, wiatr, serce)
  loop(key, name, obj, vol) {
    if (!this.ok) return;
    let a = this.loops[key];
    if (!a) { a = this.loops[key] = obj ? new THREE.PositionalAudio(this.listener) : new THREE.Audio(this.listener); if (obj) { a.setRefDistance(3); obj.add(a); } a.setBuffer(this.buffers[name]); a.setLoop(true); }
    a.setVolume(vol);
    if (vol > 0.001 && !a.isPlaying) a.play();
    if (vol <= 0.001 && a.isPlaying) a.pause();
  }
}
