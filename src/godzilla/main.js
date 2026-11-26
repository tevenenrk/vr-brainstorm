import * as THREE from 'three';
import { CanvasPanel } from '../hud.js';
import { City, CW, CH, HALF, WATER_Z } from './city.js';
import { Bodies, Dust, Clusters } from './physics.js';
import { Kaiju } from './kaiju.js';
import { KaijuAudio } from './audio.js';
import { Robot } from './robot.js';

const params = new URLSearchParams(location.search);
const rnd = (a, b) => a + Math.random() * (b - a);
const V = () => new THREE.Vector3();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const SIZES = [{ S: 35, name: 'mały (55 m)' }, { S: 60, name: 'klasyczny (95 m)' }, { S: 90, name: 'ogromny (145 m)' }];
let sizeI = 1, S = SIZES[sizeI].S;
const EYE = 1.6;
const K = { hand: 0.022, held: 0.05, body: 0.6, tail: 0.035 };    // energia uderzenia = K · v² (v w m/s świata)
const FOG_D = 0.0011;

// ---------- scena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.getElementById('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const FOG = new THREE.Color(0xa8b4c0);
scene.background = FOG;
scene.fog = new THREE.FogExp2(FOG, FOG_D * S);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.02, 140);
camera.rotation.order = 'YXZ';
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
const sky = new THREE.Mesh(new THREE.SphereGeometry(2800, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x5a84b8) }, bot: { value: FOG } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top, bot; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(0.0, 0.45, vP.y)), 1.0); }' }));
sky.frustumCulled = false; sky.renderOrder = -2; scene.add(sky);
scene.add(new THREE.HemisphereLight(0xdde8f0, 0x6a6458, 1.6));
const sun = new THREE.DirectionalLight(0xfff0dc, 1.9); sun.position.set(-300, 500, 200); scene.add(sun);

const city = new City(scene, Number(params.get('seed')) || 7);
const frags = new Bodies(scene, city, new THREE.BoxGeometry(1, 1, 1), 2600);
const carGeo = (() => { const a = new THREE.BoxGeometry(1, 0.5, 1).translate(0, -0.2, 0), b = new THREE.BoxGeometry(0.8, 0.45, 0.5).translate(0, 0.25, 0.05); const g = new THREE.BufferGeometry(); const m = [a, b]; let n = 0; const pos = [], nor = []; for (const x of m) { const ni = x.toNonIndexed(); pos.push(...ni.attributes.position.array); nor.push(...ni.attributes.normal.array); n++; } g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g; })();
const cars = new Bodies(scene, city, carGeo, 900);
const dust = new Dust(scene, 420);
const clusters = new Clusters(city);
const kaiju = new Kaiju(rig, scene);
const audio = new KaijuAudio(camera, scene);
const robot = new Robot(scene);
// czerwona winieta po ciosie robota (widoczna też w goglach)
const vignette = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d'), g = c.createRadialGradient(128, 128, 40, 128, 128, 128);
  g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(0.6, 'rgba(150,0,0,0.35)'); g.addColorStop(1, 'rgba(110,0,0,0.95)');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
  m.renderOrder = 9800; m.position.set(0, 0, -0.12); camera.add(m);
  return m;
})();
const CAR_COLS = [0xb03028, 0x2a4a8a, 0xd8d4c8, 0x1e1e22, 0x8a8a8e, 0xc8a030, 0x3a6a3a];
function spawnCars() {
  cars.clear();
  for (const c of city.carSpots) cars.spawn({ p: new THREE.Vector3(c.x, 0.8, c.z), s: [4.4, 1.6, 2.0], q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw + Math.PI / 2), color: CAR_COLS[(Math.random() * CAR_COLS.length) | 0], kind: 5, mass: 0.5, sleep: true, w: [0, 0, 0] });
}
spawnCars();

const stats = { hits: 0, maxE: 0, lastE: 0, lastT: 0 };
const state = { fight: false, php: 100, phurtT: 0, hurt: 0, koT: 0, slow: false, msg: '', msgT: 0, shake: 0, breath: 0, breathCool: 0, charging: 0, roarCool: 0, t: 0 };
function msg(t, d = 3) { state.msg = t; state.msgT = d; }

// ---------- zdarzenia zniszczeń: gruz, pył, dźwięk ----------
const camPos = () => camera.getWorldPosition(V());
function distVol(p, base = 1) { return Math.min(1.2, base * 300 / (camPos().distanceTo(p) + 60)); }
city.onBreak = (id, pos, dir, speed, cause, T, prevSt) => {
  const n = cause === 'hit' ? 4 : 3;
  for (let k = 0; k < n; k++) {
    const sz = rnd(0.9, 2.3), v = dir.clone().multiplyScalar(speed * rnd(0.4, 1)).add(V().set(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).multiplyScalar(speed * 0.35 + 2));
    frags.spawn({ p: pos.clone().add(V().set(rnd(-1.5, 1.5), rnd(-1.2, 1.2), rnd(-1.5, 1.5))), v, s: [sz, sz * rnd(0.5, 1), sz * rnd(0.6, 1.1)], color: T.debris[(Math.random() * T.debris.length) | 0] });
  }
  if (Math.random() < 0.45) frags.spawn({ p: pos.clone().add(V().set(0, -CH / 2 + 0.3, 0)), v: dir.clone().multiplyScalar(speed * 0.3).add(V().set(0, 1, 0)), s: [rnd(2.6, 3.8), 0.45, rnd(2.4, 3.6)], color: 0x9a988e, w: [rnd(-1, 1), rnd(-0.5, 0.5), rnd(-1, 1)] });
  if (cause === 'heat') for (let k = 0; k < 3; k++) frags.spawn({ p: pos, v: V().set(rnd(-1, 1), rnd(0.2, 1.2), rnd(-1, 1)).multiplyScalar(20), s: [0.7, 0.7, 0.7], color: 0xff8a30, kind: 2, life: rnd(1.2, 2.4) });
  if (dust.list.length < 300 && Math.random() < 0.7) dust.spawn(pos, dir.clone().multiplyScalar(speed * 0.15).add(V().set(0, -1.5, 0)), 4, rnd(9, 14), rnd(3, 5), cause === 'heat' ? 0.25 : 0.66, 0.38);
  audio.play('crash', pos, distVol(pos, cause === 'load' ? 1.2 : 0.9), rnd(0.8, 1.2), 50, 0.05);
};
city.onPanel = (pos, n, T, dir) => {
  if (T.row === 2) {
    for (let k = 0; k < 5; k++) frags.spawn({ p: pos.clone().add(V().set(rnd(-1.6, 1.6), rnd(-1.4, 1.4), rnd(-1.6, 1.6))), v: n.clone().multiplyScalar(rnd(2, 6)).addScaledVector(dir, rnd(2, 8)).add(V().set(0, rnd(0, 3), 0)), s: [rnd(0.35, 0.9), 0.06, rnd(0.35, 0.8)], color: 0xbfdcf0, kind: 1, life: rnd(2.5, 4.5) });
    audio.play('glass', pos, distVol(pos, 0.8), rnd(0.85, 1.2), 40, 0.07);
  } else {
    for (let k = 0; k < 2; k++) frags.spawn({ p: pos, v: n.clone().multiplyScalar(rnd(1, 4)).addScaledVector(dir, rnd(1, 5)), s: [rnd(1.2, 2.2), rnd(0.9, 1.6), 0.28], color: T.debris[(Math.random() * T.debris.length) | 0] });
    if (Math.random() < 0.5) audio.play('glass', pos, distVol(pos, 0.45), 0.7, 30, 0.1);
  }
};
city.onCreak = (pos) => { audio.play('creak', pos, distVol(pos, 1.1), rnd(0.7, 1.1), 60, 0.35); if (dust.list.length < 560) dust.spawn(pos, V().set(0, -1.5, 0), 2, 7, 2.5, 0.7, 0.5); };
const onDetach = (b, comp) => {
  // punkt podparcia: ostatnie zniszczenia w tym budynku (bryła przechyla się w stronę braku podpór)
  const rec = city.recent.filter((r) => r.b === b && r.t < 1.5).slice(-6);
  const pivot = rec.length ? rec.reduce((a, r) => a.add(V().set(r.x, r.y, r.z)), V()).divideScalar(rec.length) : null;
  // ostatnie pęknięcia to miejsce, na którym bryła jeszcze się opierała — obraca się wokół niego
  clusters.create(b, comp, pivot);
  const p = V().set(city.cpos[comp[0] * 3], city.cpos[comp[0] * 3 + 1], city.cpos[comp[0] * 3 + 2]);
  audio.play('creak', p, distVol(p, 1.4), 0.6, 80, 0.2);
  audio.play('rumble', p, distVol(p, comp.length > 30 ? 1.3 : 0.7), rnd(0.8, 1.1), 80, 0.6);
};
clusters.onImpact = (p, sp, sid, cl) => {
  if (dust.list.length < 360) dust.spawn(p, V().set(rnd(-3, 3), rnd(0, 2), rnd(-3, 3)), 4, rnd(10, 18), rnd(4, 6), 0.68, 0.42);
  audio.play(sp > 9 && cl.mass > 20 ? 'rumble' : 'crash', p, distVol(p, Math.min(1.3, 0.4 + cl.mass / 60)), rnd(0.7, 1), 70, 0.12);
  const d = camPos().distanceTo(p);
  if (cl.mass > 15 && d < 400) { state.shake = Math.max(state.shake, Math.min(1, cl.mass / 120) * (1 - d / 400)); for (const h of hands) pulse(h, 0.25, 30); }
};
clusters.onSettle = (cl) => { const p = cl.pos; for (let k = 0; k < Math.min(5, cl.nAlive / 6); k++) dust.spawn(p.clone().add(V().set(rnd(-15, 15), rnd(-5, 5), rnd(-15, 15))), V().set(rnd(-4, 4), 1, rnd(-4, 4)), 8, rnd(18, 28), rnd(5, 8), 0.68, 0.4); };
frags.onLand = (i, imp) => { if (frags.s[i * 3] > 1.6 && imp > 9) { const p = frags.pos(i); if (Math.random() < 0.3) audio.play('crash', p, distVol(p, 0.25), rnd(1.2, 1.6), 25, 0.08); if (Math.random() < 0.25 && dust.list.length < 500) dust.spawn(p, V(), 2, 6, 2.5, 0.7, 0.45); } };
const thrownHit = (sys) => (i, id, sp) => {
  const dir = sys.vel(i).normalize(), E = 0.5 * Math.max(sys.mass[i], 0.4) * sp * sp * K.held;
  city.impact(id, E, dir, 'hit');
  const p = sys.pos(i); audio.play('crash', p, distVol(p, 1), 0.8, 60, 0.05); if (sys === cars) audio.play('metal', p, distVol(p, 0.8), 0.7, 40, 0.1);
  dust.spawn(p, V(), 4, 14, 4, 0.66, 0.6);
};
frags.onHit = thrownHit(frags); cars.onHit = thrownHit(cars);
cars.onLand = (i, imp) => { if (imp > 10) { const p = cars.pos(i); audio.play('metal', p, distVol(p, 0.6), rnd(0.8, 1.2), 30, 0.08); if (imp > 18) { cars.squash[i] = Math.max(0.35, cars.squash[i] - 0.25); } } };

// ---------- panele ----------
class Wrist extends CanvasPanel {
  constructor() { super(520, 330, 0.15); }
  draw(s) {
    const key = JSON.stringify(s); if (key === this.last) return; this.last = key;
    const c = this.ctx, W = this.canvas.width;
    this.background('rgba(120,200,255,0.7)');
    c.fillStyle = '#e8f4ff'; c.font = 'bold 34px system-ui'; c.textAlign = 'left'; c.fillText('GODZILLA', 24, 48);
    c.textAlign = 'right'; c.font = '22px system-ui'; c.fillStyle = '#a8c8e0'; c.fillText(s.size, W - 24, 46); c.textAlign = 'left';
    c.font = '25px system-ui'; c.fillStyle = '#e0ecf4';
    c.fillText(`Zniszczenia: ${(s.pct * 100).toFixed(1)}% miasta`, 24, 92);
    c.fillText(`Zburzone budynki: ${s.down} / ${s.total}`, 24, 126);
    if (s.fight) { c.fillStyle = s.php < 30 ? '#ff7a6a' : '#9fe8b0'; c.fillText(`Ty: ${s.php}   ·   Robot: ${s.rhp}   ·   cios: ${s.lastE}`, 24, 160); }
    else c.fillText(`Ostatni cios: ${s.lastE}   ·   najmocniejszy: ${s.maxE}`, 24, 160);
    c.fillStyle = '#16304a'; c.fillRect(24, 180, W - 48, 20);
    c.fillStyle = s.cool ? '#ff7a5a' : '#6ab8ff'; c.fillRect(24, 180, (W - 48) * s.breath, 20);
    c.fillStyle = '#c8e0f4'; c.font = '19px system-ui'; c.fillText(s.cool ? 'Oddech: stygnie…' : 'Oddech atomowy (spust)', 24, 224);
    c.fillStyle = '#a8bccc'; c.font = '18px system-ui';
    s.hints.forEach((h, i) => c.fillText(h, 24, 258 + i * 26));
    this.tex.needsUpdate = true;
  }
}
class Menu extends CanvasPanel {
  constructor() { super(720, 600, 0.62); this.buttons = []; this.hover = -1; this.mesh.visible = false; this.mesh.material.depthTest = false; this.mesh.renderOrder = 9500; }
  hit(px, py) { return this.buttons.findIndex((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h); }
  draw(o) {
    const key = JSON.stringify([o, this.hover]); if (key === this.last) return; this.last = key;
    const c = this.ctx; this.background('#6aa0c8'); this.buttons = [];
    const btn = (x, y, w, h, label, act, accent) => { const i = this.buttons.length; this.buttons.push({ x, y, w, h, act }); c.fillStyle = this.hover === i ? '#d8ecff' : accent || '#1e3044'; this.roundRect(x, y, w, h, 12); c.fill(); c.fillStyle = this.hover === i ? '#0a1a2a' : '#eef6ff'; c.font = 'bold 26px system-ui'; c.textAlign = 'center'; c.fillText(label, x + w / 2, y + h / 2 + 9); c.textAlign = 'left'; };
    c.fillStyle = '#eef6ff'; c.font = 'bold 40px system-ui'; c.fillText('GODZILLA', 30, 58);
    let y = 84;
    btn(30, y, 660, 62, '↻ Odbuduj miasto', 'reset', '#2a5a3a'); y += 76;
    btn(30, y, 660, 58, `Rozmiar: ${o.size}`, 'size', '#3a3a5a'); y += 72;
    btn(30, y, 320, 58, o.slow ? 'Zwolnione tempo: WŁ.' : 'Zwolnione tempo: wył.', 'slow', '#4a3a2a'); btn(370, y, 320, 58, o.fight ? '🥊 Walka: zakończ' : '🥊 Walka z robotem', 'fight', '#7a2a1a'); y += 72;
    btn(30, y, 210, 56, 'Okopy', 'mode:trench.html', '#2a3a5a'); btn(255, y, 210, 56, 'Bitwa średniow.', 'mode:medieval.html', '#2a3a5a'); btn(480, y, 210, 56, 'Artyleria', 'mode:index.html', '#2a3a5a'); y += 70;
    btn(30, y, 660, 56, 'Zamknij menu', 'close'); y += 80;
    c.font = '21px system-ui'; c.fillStyle = '#eef6ff';
    ['Bij pazurami — siła zależy od szybkości ruchu ręki.', 'Chwyt (grip): wyrwij kawałek budynku / złap auto, puść = rzut.', 'Spust: oddech atomowy · A/X: ryk (pękają szyby).', 'Lewa gałka: chód · prawa: obrót · klik prawej gałki: ogon.'].forEach((l, i) => c.fillText(l, 30, y + i * 28));
    this.tex.needsUpdate = true;
  }
}
class Banner extends CanvasPanel {
  constructor() { super(900, 130, 0.9); this.mesh.material.depthTest = false; this.mesh.renderOrder = 9000; }
  draw(text) {
    if (this.last === text) return; this.last = text;
    const c = this.ctx; c.clearRect(0, 0, 900, 130);
    if (text) { c.fillStyle = 'rgba(8,16,24,0.55)'; this.roundRect(10, 15, 880, 100, 24); c.fill(); c.fillStyle = '#e8f4ff'; c.textAlign = 'center'; let fs = 42; c.font = `bold ${fs}px system-ui`; while (c.measureText(text).width > 840 && fs > 20) { fs -= 2; c.font = `bold ${fs}px system-ui`; } c.fillText(text, 450, 80); }
    this.tex.needsUpdate = true;
  }
}
const wrist = new Wrist(), menu = new Menu(), banner = new Banner();
rig.add(menu.mesh);
camera.add(banner.mesh); banner.mesh.position.set(0, 0.25, -1.4);
document.getElementById('hud').appendChild(wrist.canvas);

// ---------- dłonie (VR: kontrolery; komputer: wirtualne pięści) ----------
const hands = [0, 1].map((i) => {
  const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
  rig.add(c, grip);
  const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V().set(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffffff }));
  ray.scale.z = 2; ray.visible = false; c.add(ray);
  const h = { i, c, grip, ray, source: null, hand: null, side: i === 0 ? -1 : 1, local: { pos: V().set(i ? 0.22 : -0.22, 1.25, -0.3), q: new THREE.Quaternion() }, world: V(), last: V(), vel: V(), hist: [], trigger: false, held: null, prev: [] };
  c.addEventListener('connected', (e) => { h.source = e.data; h.hand = e.data.handedness; h.side = h.hand === 'left' ? -1 : 1; if (h.hand === 'left') grip.add(wrist.mesh); });
  c.addEventListener('disconnected', () => { h.source = null; });
  c.addEventListener('selectstart', () => { audio.resume(); h.trigger = true; if (menu.mesh.visible && h.hand === 'right') { if (menu.hover >= 0) menuAction(menu.buttons[menu.hover].act); } });
  c.addEventListener('selectend', () => { h.trigger = false; });
  c.addEventListener('squeezestart', () => { audio.resume(); grab(h); });
  c.addEventListener('squeezeend', () => release(h));
  return h;
});
wrist.mesh.position.set(0, 0.03, 0.1); wrist.mesh.rotation.x = -1.1;
function pulse(h, v, ms) { const a = h.source?.gamepad?.hapticActuators?.[0]; if (a) a.pulse(Math.min(1, v), ms); }
const handOf = (side) => hands.find((h) => h.side === side) || hands[side < 0 ? 0 : 1];

// ---------- kolizje ciała z miastem ----------
const cool = new Map();
function hitCity(key, p, r, v, kind, mass = 1) {
  const sp = v.length();
  if (sp < 6) return 0;
  const dir = v.clone().divideScalar(sp);
  const now = state.t;
  // fragmenty i auta odlatują
  frags.push(p, r, v, 0.9); cars.push(p, r, v, 0.8);
  const hits = city.sphere(p, r, []), fresh = [];
  for (let j = 0; j < hits.length; j += 5) { const id = hits[j], k = key + ':' + id; if ((cool.get(k) || -1) > now) continue; cool.set(k, now + 0.25); fresh.push(id); }
  let total = 0;
  const Etot = K[kind] * sp * sp * mass;
  if (fresh.length) {
    const E = Etot / fresh.length ** 0.7;
    for (const id of fresh) city.impact(id, E, dir, 'hit');
    total = Etot;
    if (kind !== 'tail' && kind !== 'body') { stats.lastE = Math.round(Etot); stats.maxE = Math.max(stats.maxE, stats.lastE); }
  }
  clusters.sphere(p, r, (cl, k, c) => { const kk = key + ':c' + cl.ids[k]; if ((cool.get(kk) || -1) > now) return; cool.set(kk, now + 0.3); clusters.hit(cl, k, c, v, Etot / 2, dir); total += Etot / 2; });
  return total;
}
function stomp(pw, sd) {
  if (state.menu) return;
  const r = 0.13 * S;
  const inWater = pw.z > WATER_Z;
  if (inWater) { audio.play('splash', pw, 1.2, rnd(0.7, 0.9), 80, 0.1); for (let k = 0; k < 5; k++) dust.spawn(pw.clone().add(V().set(rnd(-8, 8), 2, rnd(-8, 8))), V().set(rnd(-6, 6), rnd(6, 14), rnd(-6, 6)), 3, 12, 2.5, 0.95, 0.6); return; }
  audio.play('thud', pw, 1.4, rnd(0.85, 1.05), 120, 0.15);
  // nadepnięte: segmenty, auta (zgniecione), gruz
  const hits = city.sphere(pw.clone().setY(r * 0.5), r, []);
  for (let j = 0; j < hits.length; j += 5) city.impact(hits[j], 170, V().set(0, -1, 0), 'hit');
  for (let i = 0; i < cars.hi; i++) { if (cars.state[i] < 0) continue; const p = cars.pos(i); if (Math.hypot(p.x - pw.x, p.z - pw.z) < r * 0.9) { cars.squash[i] = 0.3; cars.state[i] = 1; cars.p[i * 3 + 1] = 0.35; audio.play('metal', p, 0.9, 0.6, 40, 0.1); } }
  frags.push(pw, r * 1.6, V().set(0, 4, 0), 0.6); cars.push(pw, r * 1.6, V().set(0, 3, 0), 0.4);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; dust.spawn(pw.clone().add(V().set(Math.cos(a) * r, 1.5, Math.sin(a) * r)), V().set(Math.cos(a) * 10, 1, Math.sin(a) * 10), 3, 12, 3, 0.66, 0.55); }
  state.shake = Math.max(state.shake, 0.35);
  pulse(handOf(sd), 0.3, 40);
}
kaiju.onStep = (base, sd) => stomp(rig.localToWorld(base.clone()), sd);

// ---------- chwytanie i rzut ----------
function grab(h) {
  if (h.held || menu.mesh.visible) return;
  const p = h.world, r = 0.13 * S;
  // auto
  let i = cars.nearest(p, r);
  if (i >= 0) { h.held = { sys: cars, i }; cars.state[i] = 2; audio.play('metal', p, 0.8, 0.8, 30); pulse(h, 0.4, 40); return; }
  i = frags.nearest(p, r, 1.4);
  if (i >= 0) { h.held = { sys: frags, i }; frags.state[i] = 2; pulse(h, 0.4, 40); return; }
  // wyrwanie segmentu budynku (stojącego albo z leżącej bryły)
  const hits = city.sphere(p, r, []);
  let best = -1, bd = 1e9;
  for (let j = 0; j < hits.length; j += 5) if (hits[j + 4] < bd) { bd = hits[j + 4]; best = hits[j]; }
  if (best < 0) clusters.sphere(p, r, (cl, k, c) => { const d = c.distanceTo(p); if (d < bd) { bd = d; best = cl.ids[k]; } });
  // komputer: sięgnięcie tam, gdzie celownik (do 2,2 wzrostu przed sobą)
  if (best < 0 && !renderer.xr.isPresenting) {
    const o = camPos(), d = V().set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    const hit = city.ray(o, d, 2.2 * S);
    if (hit) {
      const at = o.clone().addScaledVector(d, hit.t);
      let j = cars.nearest(at, 10);
      if (j >= 0) { h.held = { sys: cars, i: j }; cars.state[j] = 2; audio.play('metal', at, 0.8, 0.8, 30); return; }
      j = frags.nearest(at, 8, 1.4);
      if (j >= 0) { h.held = { sys: frags, i: j }; frags.state[j] = 2; return; }
      if (hit.id >= 0) best = hit.id;
    }
  }
  if (best >= 0) {
    const b = city.buildings[city.bld[best]], c = V().set(city.cpos[best * 3], city.cpos[best * 3 + 1], city.cpos[best * 3 + 2]);
    city.rip(best);
    const j = frags.spawn({ p: c, s: [CW * 0.92, CH * 0.92, CW * 0.92], color: b.T.debris[0], mass: b.T.density, q: new THREE.Quaternion() });
    if (j >= 0) { frags.state[j] = 2; h.held = { sys: frags, i: j }; }
    audio.play('crash', c, 1, 0.7, 60); for (let k = 0; k < 2; k++) dust.spawn(c, V().set(rnd(-2, 2), -2, rnd(-2, 2)), 4, 12, 4, 0.66, 0.6);
    pulse(h, 0.8, 80);
    msg('Wyrwany kawałek budynku — puść chwyt, by rzucić', 2);
  }
}
function release(h) {
  const H = h.held; if (!H) return;
  h.held = null;
  const peak = h.hist.reduce((a, v) => (v.lengthSq() > a.lengthSq() ? v : a), h.vel);
  H.sys.setVel(H.i, peak.clone().multiplyScalar(1.15));
  H.sys.state[H.i] = 0;
  H.sys.w[H.i * 3] = rnd(-2, 2); H.sys.w[H.i * 3 + 1] = rnd(-2, 2);
  audio.play('woosh', h.world, 0.9, 0.7, 40);
}

// ---------- oddech atomowy i ryk ----------
function breathActive() { return hands.some((h) => h.trigger) && !menu.mesh.visible || keys.has('KeyF'); }
function updateBreath(dt) {
  const want = breathActive() && state.breathCool <= 0;
  if (want) state.charging = Math.min(1, state.charging + dt / 0.6); else state.charging = Math.max(0, state.charging - dt * 2);
  kaiju.glow = Math.max(state.charging, state.breath > 0 ? 1 : 0) * (0.8 + 0.2 * Math.sin(state.t * 30));
  audio.loop('charge', 'charge', want && state.charging < 1 ? 0.4 : 0, 0.8 + state.charging);
  const firing = want && state.charging >= 1;
  if (firing) {
    state.breath = Math.min(1, state.breath + dt / 6);
    if (state.breath >= 1) { state.breathCool = 4; msg('Oddech wyczerpany — chwila na odpoczynek', 2); }
    const q = camera.getWorldQuaternion(new THREE.Quaternion()), f = V().set(0, 0, -1).applyQuaternion(q), up = V().set(0, 1, 0).applyQuaternion(q);
    const from = camPos().addScaledVector(f, 0.12 * S).addScaledVector(up, -0.07 * S);
    let hit = city.ray(from, f, 1200);
    // robot na linii ognia
    if (state.fight && robot.active && robot.alive) {
      let best = Infinity;
      for (const sp of robot.spheres(S)) { const w = sp.p.clone().sub(from), t = w.dot(f); if (t > 0 && w.lengthSq() - t * t < sp.r * sp.r && t < best) best = t; }
      if (best < (hit ? hit.t : 1200)) { hit = null; const at = from.clone().addScaledVector(f, best); robot.hit(18 * dt, f, 'chest', S); robot.hitFlash = 0.1; if (Math.random() < dt * 20) sparks(at, 2, 0x8ac8ff); kaiju.setBeam(true, from, at, S, state.t); audio.loop('beam', 'beam', 0.7, 1); return; }
    }
    const L = hit ? hit.t : 1200, to = from.clone().addScaledVector(f, L);
    kaiju.setBeam(true, from, to, S, state.t);
    if (hit) {
      if (hit.id >= 0) {
        city.heatChunk(hit.id, 330 * dt, f);
        const near = city.sphere(to, CW * 1.3, []);
        for (let j = 0; j < near.length; j += 5) if (near[j] !== hit.id) city.heatChunk(near[j], 70 * dt, f);
      }
      clusters.sphere(to, 6, (cl, k) => city.heatChunk(cl.ids[k], 200 * dt, f));
      frags.push(to, 8, f.clone().multiplyScalar(30), 0.5); cars.push(to, 8, f.clone().multiplyScalar(40).add(V().set(0, 20, 0)), 0.5);
      if (Math.random() < dt * 30) frags.spawn({ p: to, v: V().set(rnd(-1, 1), rnd(0.3, 1.5), rnd(-1, 1)).multiplyScalar(18).addScaledVector(f, -8), s: [0.6, 0.6, 0.6], color: Math.random() < 0.5 ? 0x8ac8ff : 0xffa040, kind: 2, life: rnd(0.8, 1.8) });
      if (Math.random() < dt * 14) dust.spawn(to, V().set(rnd(-3, 3), rnd(3, 8), rnd(-3, 3)), 4, rnd(14, 24), rnd(3, 6), 0.3, 0.6);
    }
    audio.loop('beam', 'beam', 0.7, 1);
    for (const h of hands) pulse(h, 0.2, 20);
    state.shake = Math.max(state.shake, 0.15);
  } else {
    kaiju.setBeam(false);
    audio.loop('beam', 'beam', 0);
    if (!want) state.breath = Math.max(0, state.breath - dt / 5);
  }
  if (state.breathCool > 0) { state.breathCool -= dt; state.breath = Math.max(0, state.breath - dt / 4); }
}
function roar() {
  if (state.roarCool > 0) return;
  state.roarCool = 5;
  const h = camPos();
  audio.ui('roar', 1);
  const n = city.shatter(h, 2.4 * S, Math.random);
  state.shake = Math.max(state.shake, 0.4);
  for (const hh of hands) pulse(hh, 0.6, 600);
  msg(n ? `RYK! Pękło ${n} szyb` : 'RYK!', 2);
}

// ---------- menu ----------
function menuAction(act) {
  const [k, a] = act.split(':');
  if (k === 'reset') resetCity();
  else if (k === 'size') { sizeI = (sizeI + 1) % SIZES.length; setSize(); }
  else if (k === 'slow') state.slow = !state.slow;
  else if (k === 'fight') { menu.mesh.visible = false; if (state.fight) stopFight(); else startFight(); }
  else if (k === 'close') menu.mesh.visible = false;
  else if (k === 'mode') location.href = a;
  menu.last = '';
}
function toggleMenu() {
  menu.mesh.visible = !menu.mesh.visible;
  if (menu.mesh.visible) {
    const f = V().set(0, 0, -1).applyQuaternion(camera.quaternion); f.y = 0; f.normalize();
    menu.mesh.position.copy(camera.position).addScaledVector(f, 0.9); menu.mesh.position.y -= 0.1;
    menu.mesh.lookAt(rig.localToWorld(camera.position.clone()));
  }
}
function setSize() {
  S = SIZES[sizeI].S; rig.scale.setScalar(S); scene.fog.density = FOG_D * S; dust.mat.uniforms.fogD.value = scene.fog.density; dust.mat.uniforms.invS.value = 1 / S;
  kaiju.inited = false; msg(`Rozmiar: ${SIZES[sizeI].name}`, 2);
}
function resetCity() {
  if (state.fight) stopFight();
  clusters.clear(); frags.clear(); dust.clear();
  city.reset(); spawnCars();
  stats.maxE = 0; stats.lastE = 0;
  msg('Miasto odbudowane', 2);
}

// ---------- ruch ----------
function moveRig(dx, dz) {
  const h = camPos(), nx = h.x + dx, nz = h.z + dz;
  if (Math.abs(nx) > HALF + 300 || nz < -HALF - 300 || nz > WATER_Z + 320) return;
  rig.position.x += dx; rig.position.z += dz;
}
function snapTurn(a) {
  const h0 = camPos(); rig.rotation.y += a; rig.updateMatrixWorld(true);
  const h1 = camPos(); rig.position.x += h0.x - h1.x; rig.position.z += h0.z - h1.z;
}
let bodyYaw = 0, walkSpeed = 0, tailSwing = 0;
function pollXR(dt) {
  for (const h of hands) {
    const gp = h.source?.gamepad; if (!gp) continue;
    const pr = gp.buttons.map((b) => b.pressed), down = (i) => pr[i] && !h.prev[i];
    const ax = gp.axes[2] || 0, ay = gp.axes[3] || 0;
    if (h.hand === 'left') {
      if (Math.abs(ax) > 0.15 || Math.abs(ay) > 0.15) {
        const q = camera.getWorldQuaternion(new THREE.Quaternion()), f = V().set(0, 0, -1).applyQuaternion(q), r = V().set(1, 0, 0).applyQuaternion(q);
        f.y = 0; r.y = 0; f.normalize(); r.normalize();
        const v = f.multiplyScalar(-ay).add(r.multiplyScalar(ax)).multiplyScalar(26 * slowWalk);
        walkSpeed = v.length(); moveRig(v.x * dt, v.z * dt);
      }
    } else {
      if (Math.abs(ax) > 0.75 && !h.flick) { h.flick = true; snapTurn(ax > 0 ? -Math.PI / 6 : Math.PI / 6); }
      if (Math.abs(ax) < 0.35) h.flick = false;
      if (down(3)) tailSwing = 1;
    }
    if (down(5)) toggleMenu();
    if (down(4)) roar();
    h.prev = pr;
  }
}

// ---------- komputer ----------
const keys = new Set(), look = { yaw: 0, pitch: -0.15 };
const punch = [{ t: -1, charge: 0, holding: false, dur: 0.3 }, { t: -1, charge: 0, holding: false, dur: 0.3 }];
renderer.domElement.addEventListener('click', () => { audio.resume(); if (!renderer.xr.isPresenting && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.(); });
document.addEventListener('mousemove', (e) => { if (document.pointerLockElement === renderer.domElement) { look.yaw -= e.movementX * 0.0022; look.pitch = Math.max(-1.45, Math.min(1.2, look.pitch - e.movementY * 0.0022)); } });
renderer.domElement.addEventListener('mousedown', (e) => { if (document.pointerLockElement !== renderer.domElement) return; const k = e.button === 2 ? 1 : e.button === 0 ? 0 : -1; if (k < 0) return; punch[k].holding = true; punch[k].charge = 0; });
document.addEventListener('mouseup', (e) => { const k = e.button === 2 ? 1 : e.button === 0 ? 0 : -1; if (k < 0 || !punch[k].holding) return; const P = punch[k]; P.holding = false; P.dur = 0.34 - 0.26 * Math.min(1, P.charge / 0.8); P.t = 0; audio.play('woosh', camPos(), 0.6 + P.charge, 0.8 + P.charge * 0.4, 40); });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  keys.add(e.code); audio.resume(); if (e.repeat) return;
  if (e.code === 'KeyR') roar();
  if (e.code === 'KeyT') tailSwing = 1;
  if (e.code === 'KeyE') { const h = handOf(1); if (h.held) { h.hist = [V().set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())).multiplyScalar(110).add(V().set(0, 18, 0))]; h.vel.copy(h.hist[0]); release(h); } else grab(h); }
  if (e.code === 'KeyM') state.slow = !state.slow;
  if (e.code === 'KeyB') { if (state.fight) stopFight(); else startFight(); }
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') { sizeI = +e.code.slice(5) - 1; setSize(); }
  if (e.code === 'Enter') resetCity();
  if (e.code === 'KeyO' || e.code === 'Escape') { const m = document.getElementById('menu'); m.style.display = m.style.display === 'block' ? 'none' : 'block'; }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
let slowWalk = 1;
function updateDesktop(dt) {
  camera.position.set(0, EYE, 0); camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
  const f = V().set(-Math.sin(look.yaw), 0, -Math.cos(look.yaw)), r = V().set(Math.cos(look.yaw), 0, -Math.sin(look.yaw)), mv = V();
  if (keys.has('KeyW')) mv.add(f); if (keys.has('KeyS')) mv.sub(f); if (keys.has('KeyD')) mv.add(r); if (keys.has('KeyA')) mv.sub(r);
  if (mv.lengthSq()) { mv.normalize().multiplyScalar((keys.has('ShiftLeft') ? 42 : 24) * slowWalk); walkSpeed = mv.length(); moveRig(mv.x * dt, mv.z * dt); }
  // pięści: odpoczynek → (naciąganie) → cios; siła zależy od czasu naciągania
  for (let k = 0; k < 2; k++) {
    const P = punch[k], sd = k === 0 ? -1 : 1, h = handOf(sd);
    if (P.holding) P.charge = Math.min(1.2, P.charge + dt);
    const rest = V().set(sd * 0.24, -0.3, -0.32), tgt = V().set(sd * 0.05, -0.1, -0.86);
    let o = rest.clone();
    if (P.holding) o.z += Math.min(1, P.charge / 0.8) * 0.12;
    if (P.t >= 0) {
      P.t += dt;
      const u = P.t < P.dur ? (P.t / P.dur) ** 2 : Math.max(0, 1 - (P.t - P.dur) / 0.3);
      o = rest.clone().lerp(tgt, u);
      if (P.t > P.dur + 0.3) P.t = -1;
    }
    h.local.pos.copy(o).applyQuaternion(camera.quaternion).add(camera.position);
    h.local.q.copy(camera.quaternion);
  }
}

// ---------- pętla ----------
const clock = new THREE.Clock();
function updateHands(dt, xr) {
  for (const h of hands) {
    if (xr) { h.local.pos.copy(h.grip.position); h.local.q.copy(h.c.quaternion); }
    h.world.copy(h.local.pos).add(V().set(0, 0, -0.03).applyQuaternion(h.local.q)).applyMatrix4(rig.matrixWorld);
    const v = h.world.clone().sub(h.last).divideScalar(Math.max(dt, 1e-3));
    if (h.last.lengthSq() === 0 || v.length() > 2000) v.set(0, 0, 0);
    h.vel.lerp(v, 0.6); h.last.copy(h.world);
    h.hist.push(h.vel.clone()); if (h.hist.length > 6) h.hist.shift();
    // trzymany przedmiot w dłoni
    if (h.held) {
      const { sys, i } = h.held;
      if (sys.state[i] !== 2) { h.held = null; continue; }
      const wq = rig.getWorldQuaternion(new THREE.Quaternion()).multiply(h.local.q);
      const off = V().set(0, 0, -sys.s[i * 3 + 2] * 0.5 - 0.02 * S).applyQuaternion(wq);
      sys.p[i * 3] = h.world.x + off.x; sys.p[i * 3 + 1] = h.world.y + off.y; sys.p[i * 3 + 2] = h.world.z + off.z;
      sys.q.set([wq.x, wq.y, wq.z, wq.w], i * 4);
    }
  }
}
const bodyPrev = [V(), V()];

// ---------- walka z robotem ----------
const hitCool = [0, 0];
let robotPrev = V();
function startFight() {
  state.fight = true; state.php = 100; state.koT = 0;
  const h = camPos(), f = V().set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())); f.y = 0; f.normalize();
  const p = h.clone().addScaledVector(f, 3.6 * S); p.y = 0;
  robot.spawn(p, Math.atan2(f.x, f.z), S); robotPrev.copy(p);
  msg('Robot nadchodzi! Gardę w górę — bij pięściami, blokuj dłońmi', 3.5);
  audio.play('roar', p, 0.8, 1.6, 120);
}
function stopFight() { state.fight = false; robot.hide(); msg('Walka zakończona', 2); }
function sparks(p, n, col = 0xffb040) { for (let k = 0; k < n; k++) frags.spawn({ p, v: V().set(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).multiplyScalar(rnd(10, 30)), s: [0.6, 0.6, 0.6], color: col, kind: 2, life: rnd(0.4, 0.9) }); }
function playerHurt(d, dir) {
  if (state.php <= 0) return;
  state.php = Math.max(0, state.php - d); state.phurtT = 3; state.hurt = Math.min(1, state.hurt + 0.3 + d / 30);
  // odrzut gracza
  const k = Math.min(0.25, 0.04 + d / 80) * S; rig.position.x += dir.x * k; rig.position.z += dir.z * k;
  for (const h of hands) pulse(h, 1, 120 + d * 6);
  state.shake = Math.max(state.shake, 0.5);
  if (state.php <= 0) { msg('Robot cię znokautował! Rewanż za chwilę…', 4); state.koT = 4; robot.punch = null; }
}
function fightUpdate(dt) {
  if (!state.fight || !robot.active) return;
  const head = camPos();
  robot.update(state.php > 0 ? dt : 0.0001, S, head, hands.map((h) => ({ p: h.world, v: h.vel })));
  // robot taranuje budynki ciałem i pięściami
  const rp = robot.root.position, rv = rp.clone().sub(robotPrev).divideScalar(Math.max(dt, 1e-3)); robotPrev.copy(rp);
  if (rv.length() < 300) robot.colliders(S).forEach((c, k) => hitCity('rb' + k, c.p, c.r, rv, 'body'));
  const fists = robot.fists();
  fists.forEach((f, k) => { if (f.striking) hitCity('rf' + k, f.p, 0.08 * S, f.v, 'hand'); });
  // cios robota w gracza: blok dłonią albo trafienie w głowę/tułów
  const P = robot.punch;
  if (P && P.phase === 'strike' && !P.done && state.php > 0) {
    const fp = P.arm.fist.getWorldPosition(V()), dir = P.arm.vel.clone().setY(0).normalize();
    const block = hands.find((h) => h.world.distanceTo(fp) < 0.17 * S);
    const chest = head.clone().add(V().set(0, -0.42 * S, 0));
    if (block) {
      P.done = true; P.phase = 'back'; P.t = 0;
      audio.play('metal', fp, 1.2, 0.6, 60); sparks(fp, 4, 0xffe0a0); pulse(block, 0.9, 90);
      playerHurt(1.5, dir); robot.stun = 0.25;
    } else if (fp.distanceTo(head) < 0.16 * S || fp.distanceTo(chest) < 0.24 * S) {
      P.done = true;
      const dmg = { jab: 8, hook: 12, upper: 14 }[P.type] * (fp.distanceTo(head) < 0.16 * S ? 1.3 : 1);
      audio.play('thud', head, 1.3, 1.3, 40); audio.play('metal', fp, 0.9, 0.5, 40);
      playerHurt(dmg, dir);
    }
  }
  // regeneracja, nokauty, rewanż
  state.phurtT -= dt; if (state.phurtT <= 0 && state.php > 0) state.php = Math.min(100, state.php + 3 * dt);
  if (state.koT > 0) { state.koT -= dt; if (state.koT <= 0) { state.php = 100; robot.hp = Math.max(robot.hp, 90); robot.vel.addScaledVector(rp.clone().sub(head).setY(0).normalize(), 1.2 * S); msg('Rewanż! Do boju', 2); } }
  if (!robot.alive && robot.landed && !state.wonT) { state.wonT = 7; }
  if (state.wonT > 0) { state.wonT -= dt; if (state.wonT <= 0) { state.wonT = 0; robot.hide(); startFight(); } }
}
robot.onStep = (p) => {
  const hits = city.sphere(p.clone().setY(0.08 * S), 0.11 * S, []);
  for (let j = 0; j < hits.length; j += 5) city.impact(hits[j], 140, V().set(0, -1, 0), 'hit');
  cars.push(p, 0.15 * S, V().set(0, 3, 0), 0.4);
  audio.play('thud', p, 1, rnd(1.1, 1.3), 100, 0.12);
  dust.spawn(p.clone().setY(2), V().set(rnd(-4, 4), 1, rnd(-4, 4)), 3, 12, 2.5, 0.66, 0.4);
};
robot.onSwing = () => audio.play('woosh', robot.root.position.clone().setY(1.3 * S), 0.9, 0.6, 80);
robot.onLand = () => {
  // nokaut: robot wali się na budynki
  const rp = robot.root.position, d = robot.fallDir;
  for (let t = 0.3; t < 1.9; t += 0.3) {
    const p = rp.clone().addScaledVector(d, t * S).setY(0.15 * S);
    const hits = city.sphere(p, 0.28 * S, []);
    for (let j = 0; j < hits.length; j += 5) city.impact(hits[j], 260, V().set(d.x, -1, d.z).normalize(), 'crush');
    cars.push(p, 0.3 * S, V().set(d.x * 20, 15, d.z * 20), 0.5);
    dust.spawn(p, V().set(rnd(-6, 6), 2, rnd(-6, 6)), 8, 26, 6, 0.66, 0.5);
  }
  audio.play('rumble', rp, 1.4, 0.8, 150); audio.play('metal', rp, 1.3, 0.4, 150);
  state.shake = Math.max(state.shake, 0.8);
  msg('K.O.! Wygrałeś — następny robot za chwilę', 4);
};
// cios gracza w robota (dłoń albo trzymany przedmiot)
function punchRobot(h, p, r, mass) {
  if (!state.fight || !robot.active || !robot.alive || hitCool[h.i] > state.t) return;
  const vp = h.vel.length() / S;
  if (vp < 1.6) return;
  for (const sp of robot.spheres(S)) {
    if (p.distanceTo(sp.p) > sp.r + r) continue;
    // garda robota: pięść przed głową przyjmuje cios
    const guarded = robot.guard > 0 && sp.part !== 'belly';
    const dmg = Math.min(24, 0.75 * vp * vp * mass);
    const done = robot.hit(dmg, h.vel, sp.part, S);
    hitCool[h.i] = state.t + 0.35;
    stats.lastE = Math.round(done); stats.maxE = Math.max(stats.maxE, stats.lastE);
    sparks(p, guarded ? 3 : 6 + Math.round(dmg / 4));
    audio.play('metal', p, Math.min(1.4, 0.5 + dmg / 20), guarded ? 0.9 : 0.6 + Math.random() * 0.2, 60, 0.05);
    if (!guarded && dmg > 10) audio.play('crash', p, 0.6, 1.4, 40, 0.1);
    pulse(h, Math.min(1, 0.4 + dmg / 25), 60 + dmg * 3);
    if (dmg > 14) state.shake = Math.max(state.shake, 0.3);
    return;
  }
}
function collisions(dt) {
  const sc = S;
  let hit = false;
  for (const h of hands) {
    const E = hitCity('h' + h.i, h.world, 0.075 * sc, h.vel, 'hand');
    if (E > 0) { hit = true; pulse(h, Math.min(1, 0.25 + E / 1500), 30 + Math.min(80, E / 20)); if (E > 400) state.shake = Math.max(state.shake, Math.min(0.6, E / 3000)); }
    if (h.held) { const { sys, i } = h.held; const p = sys.pos(i); hitCity('held' + h.i, p, sys.s[i * 3] * 0.55, h.vel, 'held', Math.max(0.5, sys.mass[i])); punchRobot(h, p, sys.s[i * 3] * 0.5, 1.4); }
    else punchRobot(h, h.world, 0.075 * sc, 1);
  }
  // tułów (biodra i pierś): przepychanie się przez budynki
  const head = camera.position;
  const parts = [V().set(head.x, 0.78, head.z), V().set(head.x, 1.15, head.z)];
  let resist = 0;
  parts.forEach((pl, k) => {
    const pw = pl.applyMatrix4(rig.matrixWorld), v = pw.clone().sub(bodyPrev[k]).divideScalar(Math.max(dt, 1e-3));
    if (bodyPrev[k].lengthSq() === 0 || v.length() > 400) v.set(0, 0, 0);
    bodyPrev[k].copy(pw);
    const n = city.sphere(pw, 0.24 * sc, []).length / 5; resist += n;
    hitCity('b' + k, pw, 0.24 * sc, v, 'body');
  });
  slowWalk = resist > 3 ? 0.45 : 1;
  for (const c of kaiju.tailColliders(sc)) hitCity(c.key, c.p, c.r, c.v, 'tail');
  return hit;
}
function updateHud(xr) {
  const st = city.stats();
  wrist.draw({ pct: st.pct, down: st.down, total: st.total, lastE: stats.lastE, maxE: stats.maxE, breath: state.breathCool > 0 ? state.breathCool / 4 : 1 - state.breath, cool: state.breathCool > 0, size: SIZES[sizeI].name, fight: state.fight, php: Math.round(state.php), rhp: Math.round(robot.hp),
    hints: xr ? ['Y/B: menu · A/X: ryk · chwyt: wyrwij / rzuć', 'klik prawej gałki: zamach ogonem'] : ['LPM/PPM (przytrzymaj = mocniej) · F oddech · R ryk', 'E chwyć/rzuć · T ogon · B robot · M zwolnij · Enter odbuduj'] });
  const dm = document.getElementById('msg'); dm.textContent = state.msgT > 0 ? state.msg : '';
  banner.mesh.visible = xr; banner.draw(state.msgT > 0 ? state.msg : '');
  menu.draw({ size: SIZES[sizeI].name, slow: state.slow, fight: state.fight });
}
function updateMenuHover() {
  const r = hands.find((h) => h.hand === 'right' && h.source);
  for (const h of hands) h.ray.visible = menu.mesh.visible && h === r;
  if (!menu.mesh.visible || !r) { menu.hover = -1; return; }
  const rc = new THREE.Raycaster(r.c.getWorldPosition(V()), V().set(0, 0, -1).applyQuaternion(r.c.getWorldQuaternion(new THREE.Quaternion())));
  const hit = rc.intersectObject(menu.mesh, false)[0];
  menu.hover = hit ? menu.hit(hit.uv.x * menu.canvas.width, (1 - hit.uv.y) * menu.canvas.height) : -1;
}
let tailDir = 1;
function step(dtReal) {
  const xr = renderer.xr.isPresenting;
  const dt = dtReal * (state.slow ? 0.3 : 1);
  state.t += dt;
  walkSpeed = 0;
  if (xr) pollXR(dtReal); else updateDesktop(dtReal);
  // głębokość wody: potwór brodzi
  const hp = camPos();
  rig.position.y += (city.terrainAt(hp.x, hp.z) * 0.6 - rig.position.y) * Math.min(1, dtReal * 3);
  rig.updateMatrixWorld(true);
  // tułów nadąża za głową
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'), dy = wrap(e.y - bodyYaw);
  if (Math.abs(dy) > 0.6) bodyYaw += dy - Math.sign(dy) * 0.6;
  bodyYaw += wrap(e.y - bodyYaw) * Math.min(1, dtReal * 0.9);
  // zamach ogonem
  if (tailSwing > 0) { tailSwing = Math.max(0, tailSwing - dtReal * 1.4); if (tailSwing === 0) tailDir = -tailDir; }
  kaiju.swing = Math.sin((1 - tailSwing) * Math.PI) * 1.5 * tailDir * (tailSwing > 0 ? 1 : 0);
  updateHands(dtReal, xr);
  kaiju.update(dtReal, camera.position, bodyYaw + kaiju.swing * 0, walkSpeed, [handOf(-1).local, handOf(1).local], S);     // lewa dłoń do lewego barku, prawa do prawego
  if (!menu.mesh.visible) collisions(dtReal);
  updateBreath(dtReal);
  state.roarCool = Math.max(0, state.roarCool - dtReal);
  fightUpdate(dt);
  state.hurt = Math.max(0, state.hurt - dtReal * 0.8);
  vignette.material.opacity = Math.min(0.9, state.hurt + (state.fight && state.php < 30 ? 0.25 + 0.1 * Math.sin(state.t * 6) : 0));
  clusters.update(dt);
  frags.update(dt); cars.update(dt); dust.update(dt);
  city.update(dt, onDetach);
  frags.render(); cars.render();
  for (const [k, t] of cool) if (t < state.t - 1) cool.delete(k);
  if (state.msgT > 0) state.msgT -= dtReal;
  if (state.shake > 0) { state.shake = Math.max(0, state.shake - dtReal * 1.5); if (!xr) { camera.rotation.z = (Math.random() - 0.5) * state.shake * 0.03; camera.rotation.x += (Math.random() - 0.5) * state.shake * 0.02; } }
  sky.position.copy(hp);
  updateMenuHover();
  updateHud(xr);
}
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  step(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

// start: w zatoce, przodem do miasta
rig.scale.setScalar(S); dust.mat.uniforms.invS.value = 1 / S;
rig.position.set(0, 0, WATER_Z + 70);
camera.position.set(0, EYE, 0);
msg('Wyjdź z zatoki i wejdź do miasta', 4);

async function startXR() {
  try {
    audio.resume();
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    session.addEventListener('end', () => { document.body.classList.remove('in-xr'); camera.position.set(0, EYE, 0); });
    await renderer.xr.setSession(session);
    document.body.classList.add('in-xr');
  } catch (err) { console.error(err); alert('Nie udało się uruchomić VR: ' + err.message); }
}
(async () => {
  const b = document.getElementById('btn-vr'), note = document.getElementById('xr-note');
  b.onclick = startXR;
  document.getElementById('btn-start').onclick = () => { audio.resume(); document.getElementById('panel').style.display = 'none'; renderer.domElement.requestPointerLock?.(); };
  document.querySelectorAll('#menu [data-act]').forEach((el) => { el.onclick = () => { menuAction(el.dataset.act); document.getElementById('menu').style.display = 'none'; }; });
  if (!navigator.xr) { note.textContent = window.isSecureContext ? 'Ta przeglądarka nie obsługuje WebXR — gra na komputerze.' : 'WebXR wymaga HTTPS.'; b.disabled = true; return; }
  const vr = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  b.disabled = !vr; if (!vr) note.textContent = 'Brak gogli VR — gra na komputerze (mysz + klawiatura).';
})();

window.__gz = { robot, startFight, stopFight, punchRobot, city, frags, cars, dust, clusters, kaiju, rig, camera, scene, THREE, hands, look, keys, punch, state, stats, step, roar, resetCity, hitCity, stomp, grab, release, setSize, get S() { return S; } };
