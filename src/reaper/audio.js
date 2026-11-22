import * as THREE from 'three';

// Dźwięki kostuchy: kroki, skrzypienie drzwi, bicie serca, buczenie, świst kosy i głos "Już czas".
const rnd = (a, b) => a + Math.random() * (b - a);

function buffer(ctx, dur, fn) {
  const sr = ctx.sampleRate, n = Math.floor(sr * dur), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  const st = {};
  for (let i = 0; i < n; i++) d[i] = fn(i / sr, st, i);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0) for (let i = 0; i < n; i++) d[i] *= 0.95 / peak;
  return b;
}
// ciężki krok: tąpnięcie + szur stopy po podłodze
function stepBuf(ctx, v) {
  const f0 = 52 + v * 9, scrapeT = 0.05 + v * 0.02;
  return buffer(ctx, 0.75, (t, s) => {
    s.lp = (s.lp || 0) + 0.08 * ((Math.random() * 2 - 1) - (s.lp || 0));
    s.bp = (s.bp || 0) + 0.35 * ((Math.random() * 2 - 1) - (s.bp || 0));
    const thump = Math.sin(2 * Math.PI * f0 * t * (1 - t * 0.6)) * Math.exp(-t * 16) * Math.min(1, t * 900);
    const knock = s.lp * 4 * Math.exp(-t * 30);
    const ts = t - scrapeT, scrape = ts > 0 ? (s.bp - s.lp) * 0.35 * Math.exp(-ts * 7) * Math.min(1, ts * 40) : 0;
    return Math.tanh((thump * 1.1 + knock + scrape) * 1.3);
  });
}
function creakBuf(ctx) {
  return buffer(ctx, 2.4, (t, s) => {
    s.ph = (s.ph || 0) + (95 + 70 * Math.sin(t * 2.3) + 40 * Math.sin(t * 7.1) + 25 * Math.sin(t * 13)) / ctx.sampleRate;
    const saw = 2 * (s.ph % 1) - 1;
    const stick = 0.55 + 0.45 * Math.sin(t * 31 + Math.sin(t * 5) * 3);
    s.lp = (s.lp || 0) + 0.18 * (saw * stick - (s.lp || 0));
    const env = Math.min(1, t * 6) * Math.min(1, (2.4 - t) * 2.5);
    const bump = t > 2.1 ? Math.sin(2 * Math.PI * 60 * (t - 2.1)) * Math.exp(-(t - 2.1) * 18) * 1.4 : 0;
    return (s.lp * env + bump) * 0.9;
  });
}
function heartBuf(ctx) {
  const beat = (t) => (t > 0 ? Math.sin(2 * Math.PI * 48 * t) * Math.exp(-t * 22) * Math.min(1, t * 300) : 0);
  return buffer(ctx, 0.6, (t) => Math.tanh((beat(t) + 0.75 * beat(t - 0.22)) * 1.8));
}
function droneBuf(ctx) {
  const L = 6;   // pętla bez szwu: częstotliwości całkowite w okresie L
  return buffer(ctx, L, (t, s) => {
    s.lp = (s.lp || 0) + 0.004 * ((Math.random() * 2 - 1) - (s.lp || 0));
    const w = (f) => Math.sin(2 * Math.PI * (Math.round(f * L) / L) * t);
    const pulse = 0.7 + 0.3 * Math.sin(2 * Math.PI * (1 / L) * 2 * t);
    return (w(36.7) * 0.5 + w(37.3) * 0.5 + w(55) * 0.25 + w(73.4) * 0.12 + s.lp * 6) * pulse;
  });
}
function whooshBuf(ctx) {
  return buffer(ctx, 0.5, (t, s) => {
    const k = Math.min(0.45, 0.02 + t * 1.4);
    s.lp = (s.lp || 0) + k * ((Math.random() * 2 - 1) - (s.lp || 0));
    s.lp2 = (s.lp2 || 0) + k * 0.6 * (s.lp - (s.lp2 || 0));
    const env = Math.pow(Math.min(1, t / 0.32), 3) * Math.exp(-Math.max(0, t - 0.32) * 25);
    return (s.lp - s.lp2) * env * 3;
  });
}
function slashBuf(ctx) {
  const fr = [1730, 2410, 3320, 4580, 5900];
  return buffer(ctx, 1.4, (t, s) => {
    s.lp = (s.lp || 0) + 0.6 * ((Math.random() * 2 - 1) - (s.lp || 0));
    let ring = 0; fr.forEach((f, k) => { ring += Math.sin(2 * Math.PI * f * t + k) * Math.exp(-t * (5 + k * 2)) / (k + 1); });
    const hit = s.lp * Math.exp(-t * 40);
    const thud = Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 14);
    return Math.tanh((ring * 0.9 + hit * 1.2 + thud * 0.8) * 1.4);
  });
}

// ogień: szum z niskim rykiem + trzaski (pętla)
function fireBuf(ctx) {
  const L = 4, sr = ctx.sampleRate;
  const cr = Array.from({ length: 70 }, () => [Math.random() * L, 0.2 + Math.random() * 0.8, 2000 + Math.random() * 4000]);
  return buffer(ctx, L, (t, s) => {
    s.lp = (s.lp || 0) + 0.05 * ((Math.random() * 2 - 1) - (s.lp || 0));
    s.lp2 = (s.lp2 || 0) + 0.01 * (s.lp - (s.lp2 || 0));
    let c = 0;
    for (const [t0, a, f] of cr) { const d = t - t0; if (d > 0 && d < 0.03) c += a * Math.sin(2 * Math.PI * f * d) * Math.exp(-d * 160) * (Math.random() * 0.6 + 0.7); }
    const roar = s.lp * 1.6 + s.lp2 * 6 * (0.8 + 0.2 * Math.sin(2 * Math.PI * t / L * 3));
    return roar * 0.6 + c * 0.9;
  });
}
function igniteBuf(ctx) {
  return buffer(ctx, 1.8, (t, s) => {
    const k = Math.min(0.5, 0.01 + t * 0.9);
    s.lp = (s.lp || 0) + k * ((Math.random() * 2 - 1) - (s.lp || 0));
    const env = Math.min(1, t / 0.35) * Math.exp(-Math.max(0, t - 0.35) * 2.2);
    const thump = Math.sin(2 * Math.PI * 45 * t) * Math.exp(-t * 5) * Math.min(1, t * 60);
    return s.lp * env * 2 + thump * 0.8;
  });
}
// eteryczny akord (pętla bez szwu) i dzwon blasku
function padBuf(ctx) {
  const L = 8, fr = [110, 164.81, 220, 277.18, 329.63, 440, 554.37, 659.25];
  return buffer(ctx, L, (t) => {
    let v = 0;
    fr.forEach((f, k) => { const ff = Math.round(f * L) / L, df = Math.round((f * 1.004) * L) / L; v += (Math.sin(2 * Math.PI * ff * t) + Math.sin(2 * Math.PI * df * t)) * (0.6 + 0.4 * Math.sin(2 * Math.PI * (k % 3 + 1) * t / L)) / (k + 2); });
    return v;
  });
}
function chimeBuf(ctx) {
  const fr = [880, 1318.5, 1760, 2217, 2637, 3520];
  return buffer(ctx, 6, (t, s) => {
    s.lp = (s.lp || 0) + 0.02 * ((Math.random() * 2 - 1) - (s.lp || 0));
    let v = 0; fr.forEach((f, k) => { v += Math.sin(2 * Math.PI * f * t + k) * Math.exp(-t * (0.5 + k * 0.25)) / (k + 1); });
    return v * Math.min(1, t * 30) + s.lp * 4 * Math.exp(-t * 0.8);
  });
}

function clinkBuf(ctx) {
  const fr = [2093, 3136, 4186, 5274];
  return buffer(ctx, 0.9, (t) => { let v = 0; fr.forEach((f, k) => { v += Math.sin(2 * Math.PI * f * t + k) * Math.exp(-t * (4 + k * 3)) / (k + 1); }); return v * Math.min(1, t * 400); });
}

export class ReaperAudio {
  constructor(camera, scene) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    const ctx = this.ctx = this.listener.context;
    this.steps = [0, 1, 2].map((v) => stepBuf(ctx, v));
    this.creakB = creakBuf(ctx); this.heartB = heartBuf(ctx); this.whooshB = whooshBuf(ctx); this.slashB = slashBuf(ctx);
    const pos = () => { const a = new THREE.PositionalAudio(this.listener); a.setRefDistance(1.2); a.setRolloffFactor(1.1); a.setDistanceModel('inverse'); scene.add(a); return a; };
    this.stepSrc = [pos(), pos(), pos()]; this.si = 0;
    this.creakSrc = pos(); this.voiceSrc = pos(); this.voiceSrc.setRefDistance(2);
    this.whooshSrc = pos();
    this.heart = new THREE.Audio(this.listener);
    this.slash = new THREE.Audio(this.listener);
    this.drone = new THREE.Audio(this.listener);
    this.drone.setBuffer(droneBuf(ctx)); this.drone.setLoop(true); this.drone.setVolume(0);
    this.fireSrc = pos(); this.fireSrc.setBuffer(fireBuf(ctx)); this.fireSrc.setLoop(true); this.fireSrc.setVolume(0); this.fireSrc.setRefDistance(1.5);
    this.igniteB = igniteBuf(ctx); this.igniteSrc = pos();
    this.pad = new THREE.Audio(this.listener); this.pad.setBuffer(padBuf(ctx)); this.pad.setLoop(true); this.pad.setVolume(0);
    this.chimeB = chimeBuf(ctx); this.chime = new THREE.Audio(this.listener);
    this.clinkB = clinkBuf(ctx); this.clink1 = new THREE.Audio(this.listener);
    this.fireLevel = 0; this.padLevel = 0;
    this.heartT = 0; this.bpm = 0; this.droneLevel = 0;
    this.voiceB = null;
    fetch('./assets/reaper/juz_czas.mp3').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then((a) => ctx.decodeAudioData(a)).then((b) => { this.voiceB = b; }).catch(() => {});
  }
  get ready() { return this.ctx.state === 'running'; }
  resume() { if (this.ctx.state !== 'running') this.ctx.resume(); }
  at(a, p, buf, vol, rate = 1) {
    if (!this.ready) return;
    if (a.isPlaying) a.stop();
    a.setBuffer(buf); a.setVolume(vol); a.playbackRate = rate;
    a.position.copy(p); a.updateMatrixWorld(); a.play();
  }
  step(p, vol = 1) { this.at(this.stepSrc[this.si = (this.si + 1) % 3], p, this.steps[(Math.random() * 3) | 0], vol * 1.6, rnd(0.9, 1.05)); }
  creak(p) { this.at(this.creakSrc, p, this.creakB, 1.1); }
  whoosh(p) { this.at(this.whooshSrc, p, this.whooshB, 1.6); }
  cut() { if (!this.ready) return; if (this.slash.isPlaying) this.slash.stop(); this.slash.setBuffer(this.slashB); this.slash.setVolume(1.2); this.slash.play(); }
  // "Już czas" — nagranie, a jeśli go brak: syntezator mowy przeglądarki
  voice(p) {
    if (this.voiceB) { this.at(this.voiceSrc, p, this.voiceB, 2.2); return 'file'; }
    try {
      const u = new SpeechSynthesisUtterance('Już czas.');
      u.lang = 'pl-PL'; u.pitch = 0.1; u.rate = 0.55; u.volume = 1;
      const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith('pl'));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
      return 'tts';
    } catch { return 'none'; }
  }
  ignite(p) { this.at(this.igniteSrc, p, this.igniteB, 1.6); }
  clink(left) { if (!this.ready) return; const a = this.clink1; if (a.isPlaying) a.stop(); a.setBuffer(this.clinkB); a.setVolume(0.6); a.playbackRate = left ? 1.15 + Math.random() * 0.1 : 0.55 + Math.random() * 0.08; a.play(); }
  glare() { if (!this.ready) return; if (this.chime.isPlaying) this.chime.stop(); this.chime.setBuffer(this.chimeB); this.chime.setVolume(0.9); this.chime.play(); }
  setFirePos(p) { this.fireSrc.position.copy(p); this.fireSrc.updateMatrixWorld(); }
  update(dt) {
    if (!this.ready) return;
    const loop = (a, lv, k) => { if (lv > 0.001 && !a.isPlaying) a.play(); if (a.isPlaying) { a.setVolume(lv * k); if (lv <= 0.001) a.stop(); } };
    loop(this.fireSrc, this.fireLevel, 1.3);
    loop(this.pad, this.padLevel, 0.35);
    if (this.bpm > 0) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 60 / this.bpm;
        if (this.heart.isPlaying) this.heart.stop();
        this.heart.setBuffer(this.heartB); this.heart.setVolume(0.35 + 0.5 * Math.min(1, (this.bpm - 60) / 90)); this.heart.play();
      }
    }
    if (this.droneLevel > 0.001 && !this.drone.isPlaying) this.drone.play();
    if (this.drone.isPlaying) this.drone.setVolume(this.droneLevel * 0.55);
  }
  silence() {
    this.bpm = 0; this.droneLevel = 0;
    this.fireLevel = 0; this.padLevel = 0;
    for (const a of [this.drone, this.heart, ...this.stepSrc, this.creakSrc, this.voiceSrc, this.whooshSrc, this.fireSrc, this.igniteSrc, this.pad, this.chime]) if (a.isPlaying) a.stop();
    try { speechSynthesis.cancel(); } catch { /* brak */ }
  }
}
