import * as THREE from 'three';

// Dźwięki generowane proceduralnie.
export class KaijuAudio {
  constructor(camera, scene) {
    this.listener = new THREE.AudioListener(); camera.add(this.listener);
    const ctx = this.ctx = this.listener.context, sr = ctx.sampleRate;
    const B = (dur, fn) => { const n = Math.floor(sr * dur), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), st = {}; for (let i = 0; i < n; i++) d[i] = fn(i / sr, st); let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(d[i])); if (m > 0) for (let i = 0; i < n; i++) d[i] /= m; return b; };
    const lp = (cut) => { let y = 0; const a = Math.min(1, cut * 2 * Math.PI / sr); return () => (y += a * ((Math.random() * 2 - 1) - y)); };
    this.buffers = {
      // kruszenie betonu: trzaski + niski szum
      crash: (() => { const n1 = lp(1400), n2 = lp(260); return B(1.4, (t) => (n1() * 1.6 + n2() * 3) * Math.exp(-t * 3) * Math.min(1, t * 80) + (Math.random() < 0.004 * Math.exp(-t * 2) ? (Math.random() - 0.5) * 3 : 0)); })(),
      // zawalenie: długi pomruk
      rumble: (() => { const n = lp(90), m = lp(400); return B(4.5, (t) => (n() * 4 + m() * 0.8 * Math.exp(-t)) * Math.min(1, t * 6) * Math.exp(-t * 0.6)); })(),
      glass: (() => { const n = lp(7000); return B(1.1, (t) => n() * Math.exp(-t * 7) * 1.2 + (Math.random() < 0.02 * Math.exp(-t * 3) ? Math.sin(t * 2 * Math.PI * (3000 + Math.random() * 4000)) * 2 : 0) + Math.sin(2 * Math.PI * (2400 + 900 * Math.sin(t * 40)) * t) * 0.12 * Math.exp(-t * 4)); })(),
      thud: (() => { const n = lp(150); return B(1.6, (t) => Math.sin(2 * Math.PI * (38 - t * 10) * t) * Math.exp(-t * 3.5) * 2 + n() * 2 * Math.exp(-t * 4)); })(),
      creak: B(1.3, (t, s) => { const f = 70 + 30 * Math.sin(t * 3.1) + 18 * Math.sin(t * 11); s.p = (s.p || 0) + 2 * Math.PI * f / sr; return (Math.sin(s.p) + 0.5 * Math.sin(s.p * 2.03) + (Math.random() - 0.5) * 0.3) * Math.sin(Math.PI * t / 1.3); }),
      roar: (() => { const n = lp(900); return B(3.2, (t, s) => { const f = 150 - 40 * t / 3.2 + 12 * Math.sin(t * 23); s.p = (s.p || 0) + 2 * Math.PI * f / sr; const saw = ((s.p / (2 * Math.PI)) % 1) * 2 - 1; const env = Math.min(1, t * 3) * Math.min(1, (3.2 - t) * 1.5); return (saw * 0.8 + Math.sin(s.p * 1.5) * 0.5 + n() * 1.6) * env * (0.7 + 0.3 * Math.sin(t * 7)); }); })(),
      beam: B(1, (t) => { const ph = t * 220; return (((ph % 1) * 2 - 1) * 0.4 + Math.sin(2 * Math.PI * 110 * t) * 0.5 + (Math.random() - 0.5) * 0.7) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 8 * t)); }),
      charge: B(1.2, (t, s) => { const f = 80 + t * 500; s.p = (s.p || 0) + 2 * Math.PI * f / sr; return (Math.sin(s.p) * 0.6 + (Math.random() - 0.5) * 0.3) * t; }),
      woosh: (() => { const n = lp(900); return B(0.5, (t) => n() * Math.sin(Math.PI * t / 0.5) * 3); })(),
      splash: (() => { const n = lp(2500), m = lp(300); return B(1.5, (t) => (n() * Math.exp(-t * 3) + m() * 2 * Math.exp(-t * 2)) * Math.min(1, t * 30)); })(),
      metal: B(0.8, (t) => (Math.sin(2 * Math.PI * 420 * t) * 0.6 + Math.sin(2 * Math.PI * 690 * t) * 0.4 + (Math.random() - 0.5) * Math.exp(-t * 30)) * Math.exp(-t * 6)),
    };
    this.pool = [];
    for (let i = 0; i < 24; i++) { const a = new THREE.PositionalAudio(this.listener); a.setDistanceModel('inverse'); a.setRolloffFactor(1); scene.add(a); this.pool.push(a); }
    this.next = 0; this.loops = {}; this.flat = [0, 1, 2].map(() => new THREE.Audio(this.listener)); this.fi = 0;
    this.lastT = {};
  }
  resume() { if (this.ctx.state !== 'running') this.ctx.resume(); }
  get ok() { return this.ctx.state === 'running'; }
  // gap: minimalny odstęp tego samego dźwięku (s), by nie zalać miksu
  play(name, pos, vol = 1, rate = 1, ref = 40, gap = 0.04) {
    if (!this.ok) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastT[name] || 0) < gap) return; this.lastT[name] = now;
    const a = this.pool[this.next]; this.next = (this.next + 1) % this.pool.length;
    if (a.isPlaying) a.stop();
    a.setBuffer(this.buffers[name]); a.setRefDistance(ref); a.setVolume(vol); a.playbackRate = rate * (0.92 + Math.random() * 0.16);
    a.position.copy(pos); a.updateMatrixWorld(); a.play();
  }
  ui(name, vol = 1, rate = 1) { if (!this.ok) return; const a = this.flat[this.fi]; this.fi = (this.fi + 1) % 3; if (a.isPlaying) a.stop(); a.setBuffer(this.buffers[name]); a.setVolume(vol); a.playbackRate = rate; a.play(); }
  loop(key, name, vol, rate = 1) {
    if (!this.ok) return;
    let a = this.loops[key];
    if (!a) { a = this.loops[key] = new THREE.Audio(this.listener); a.setBuffer(this.buffers[name]); a.setLoop(true); }
    a.setVolume(vol); a.playbackRate = rate;
    if (vol > 0.001 && !a.isPlaying) a.play();
    if (vol <= 0.001 && a.isPlaying) a.pause();
  }
}
