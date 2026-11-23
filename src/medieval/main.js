import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { Effects, Sound } from '../effects.js';
import { TableManipulator } from '../table.js';
import { CanvasPanel } from '../hud.js';
import { Field, MW, MD, MAP_SCALE, UNIT_K } from './world.js';
import { Army, SIDES, TYPES, ARROW_V, RIDER_EYE } from './army.js';
import { bakeKnight } from './knight.js';

const params = new URLSearchParams(location.search);
const SHADOWS = params.get('shadows') !== '0';
const SPEEDS = [0.25, 0.5, 1, 2, 3];
const TYPE_KEYS = ['sword', 'bow', 'spear', 'cav', 'cat'];

// ---------- panele ----------
class MHud extends CanvasPanel {
  constructor() { super(640, 470, 0.17); }
  draw(s) {
    const key = JSON.stringify(s);
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx, W = this.canvas.width;
    this.background(s.avatar ? 'rgba(255,210,120,0.8)' : 'rgba(210,190,150,0.7)');
    c.textAlign = 'left'; c.fillStyle = '#f4ead8'; c.font = 'bold 32px system-ui, sans-serif';
    c.fillText(s.avatar ? 'W SZEREGU' : 'BITWA', 30, 52);
    c.textAlign = 'right'; c.font = 'bold 26px system-ui, sans-serif'; c.fillStyle = s.status.startsWith('PAUZA') || s.status.startsWith('ROZ') ? '#ffd08a' : '#cfe8ff';
    c.fillText(s.status, W - 30, 50);
    c.textAlign = 'left'; c.font = '24px system-ui, sans-serif';
    c.fillStyle = SIDES[0].css; c.fillText(`Niebiescy: ${s.blue} ludzi (${s.blueSq} oddz.)`, 30, 92);
    c.fillStyle = SIDES[1].css; c.fillText(`Czerwoni: ${s.red} ludzi (${s.redSq} oddz.)`, 30, 124);
    c.font = 'bold 27px system-ui, sans-serif'; c.fillStyle = '#ffe08a';
    if (s.avatar) {
      c.fillText(`${s.type} · zdrowie ${s.hp}%`, 30, 170);
      c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(30, 182, W - 60, 14);
      c.fillStyle = s.hp > 40 ? '#7dffb0' : '#ff6a5a'; c.fillRect(30, 182, (W - 60) * s.hp / 100, 14);
      c.font = '24px system-ui, sans-serif'; c.fillStyle = '#e8dcc8';
      c.fillText(`Mój oddział: ${s.squad} · rozkaz: ${s.order}`, 30, 230);
    } else {
      c.fillText(s.sel ? `▶ ${s.sel}` : 'Wskaż swój oddział (sztandar) spustem', 30, 170);
      c.font = '24px system-ui, sans-serif'; c.fillStyle = '#e8dcc8';
      c.fillText(s.sel ? `rozkaz: ${s.order}` : '', 30, 206);
    }
    c.font = 'bold 26px system-ui, sans-serif'; c.fillStyle = s.msgColor || '#9fe8b0';
    if (s.msg) c.fillText(s.msg, 30, 276);
    c.font = '20px system-ui, sans-serif'; c.fillStyle = '#a89c88';
    (s.avatar ? [
      'Lewa gałka: chód · prawa gałka ←→: obrót · B: menu',
      'Spust / zamach prawą ręką: cios (łuk: trzymaj i puść)',
      'Lewy spust na wroga: oddział atakuje biegiem · na ziemię: „tam!”',
      'Oddział idzie za Tobą · X: „za mną!” · Y: „do ataku!”',
    ] : [
      'Przeciągnij spustem po ziemi: zaznacz oddziały prostokątem',
      'Spust na oddział: dodaj/usuń · na ziemię: marsz, 2× — biegiem',
      'Skręt kontrolera obraca linię · na wroga: atak · gałka: odznacz',
      'A: start · B: menu · lewy Y: wciel się w żołnierza',
    ]).forEach((l, i) => c.fillText(l, 30, 326 + i * 30));
    this.tex.needsUpdate = true;
  }
}
class MMenu extends CanvasPanel {
  constructor() { super(720, 900, 0.2); this.buttons = []; this.hover = -1; this.mesh.visible = false; }
  hit(px, py) { return this.buttons.findIndex((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h); }
  draw(o) {
    const key = JSON.stringify([o, this.hover]);
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx;
    this.background('#c8a870');
    this.buttons = [];
    const btn = (x, y, w, h, label, act, accent) => {
      const i = this.buttons.length; this.buttons.push({ x, y, w, h, act });
      c.fillStyle = this.hover === i ? '#f4e0b0' : (accent || '#3a3228');
      this.roundRect(x, y, w, h, 12); c.fill();
      c.fillStyle = this.hover === i ? '#2a1a06' : '#f4ece0';
      let fs = 24; c.font = `bold ${fs}px system-ui, sans-serif`;
      while (c.measureText(label).width > w - 12 && fs > 12) { fs--; c.font = `bold ${fs}px system-ui, sans-serif`; }
      c.textAlign = 'center'; c.fillText(label, x + w / 2, y + h / 2 + 8); c.textAlign = 'left';
    };
    const row = (items, y, h = 56) => { const n = items.length, gap = 10, w = (660 - gap * (n - 1)) / n; items.forEach(([l, a, acc], k) => btn(30 + k * (w + gap), y, w, h, l, a, acc)); };
    c.fillStyle = '#f4ead8'; c.font = 'bold 40px system-ui, sans-serif'; c.fillText('BITWA ŚREDNIOWIECZNA', 30, 56);
    let y = 78;
    SIDES.forEach((S, side) => {
      c.fillStyle = S.css; c.font = 'bold 26px system-ui, sans-serif'; c.fillText(`Dodaj oddział: ${S.name}`, 30, y + 26); y += 36;
      row(TYPE_KEYS.map((t) => [`+ ${TYPES[t].name}`, `add:${side}:${t}`, side ? '#6a2a22' : '#2a3a6a']), y); y += 68;
    });
    row([[o.started ? (o.paused ? '▶ Wznów' : '❚❚ Pauza') : '▶ START BITWY', 'run', '#3a6a2a'], ['Gotowe armie', 'preset'], ['Wyczyść', 'clear', '#5a2a2a']], y, 62); y += 76;
    row([[o.avatar ? 'Wyjdź z postaci' : 'Wciel się w żołnierza', 'avatar', '#6a4a1a']], y, 62); y += 76;
    c.fillStyle = '#f4ead8'; c.font = '26px system-ui, sans-serif'; c.fillText('Tempo czasu', 30, y + 37);
    btn(250, y, 60, 54, '−', 'speed-'); c.fillStyle = '#fff'; c.font = 'bold 26px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(`${o.speed}×`, 370, y + 37); c.textAlign = 'left'; btn(430, y, 60, 54, '+', 'speed+');
    btn(510, y, 180, 54, 'Przed siebie', 'place'); y += 70;
    row([['Artyleria', 'mode:index.html', '#2a3a5a'], ['Bitwa XX w.', 'mode:battle.html', '#2a3a5a'], ['Flak', 'mode:flak.html', '#3a4a1a'], ['Zamknij', 'close']], y); y += 76;
    c.font = '20px system-ui, sans-serif'; c.fillStyle = '#f4ead8';
    ['Rozstawianie: przed startem zaznacz oddział i wskaż miejsce —', 'oddział od razu tam staje (przeciągnięcie ustawia front).', 'Po wcieleniu dowodzisz tylko swoim oddziałem; reszta walczy sama.'].forEach((l, i) => c.fillText(l, 30, y + i * 26));
    this.tex.needsUpdate = true;
  }
}

// ---------- scena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
renderer.shadowMap.enabled = SHADOWS;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const SKY = new THREE.Color(0x28303a);
scene.background = SKY; scene.fog = new THREE.Fog(SKY, 10, 45);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 200);
scene.add(camera);
const env = new THREE.Group();
scene.add(env);
{
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new THREE.Color(0x4a6a88) }, bottom: { value: new THREE.Color(0x1a2026) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.1, 0.6, vP.y)), 1.0); }' });
  env.add(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), skyMat));
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d'); c.fillStyle = '#2a2f2c'; c.fillRect(0, 0, 256, 256); c.strokeStyle = '#3d4540'; c.lineWidth = 3; c.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(24, 24); tex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(24, 64), new THREE.MeshLambertMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; env.add(floor);
}
scene.add(new THREE.HemisphereLight(0xe4f0ff, 0x4a3c28, 1.6));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
const SUN_DIR = new THREE.Vector3(0.45, 1, 0.35).normalize();
sun.castShadow = SHADOWS; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);
const tableRoot = new THREE.Group();
scene.add(tableRoot);
const mapGroup = new THREE.Group();
mapGroup.scale.setScalar(MAP_SCALE);
tableRoot.add(mapGroup);
const field = new Field();
mapGroup.add(field.group);
const effects = new Effects(mapGroup, field, { fire: 400, smoke: 800 });
const sound = new Sound(camera, scene);
{
  const ctx = sound.listener.context, sr = ctx.sampleRate, n = Math.floor(sr * 0.35), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.sin(2 * Math.PI * 1250 * t) * 0.5 + Math.sin(2 * Math.PI * 1870 * t) * 0.35 + (Math.random() - 0.5) * 0.3 * Math.exp(-t * 60)) * Math.exp(-t * 12); }
  sound.buffers.clang = buf;
  sound.buffers.thud = sound.makeBoom(ctx, 1.1, 650, 38, 5);
  // katapulta: trzask ramienia o poprzeczkę + świst
  const m = Math.floor(sr * 0.5), b2 = ctx.createBuffer(1, m, sr), e = b2.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < m; i++) { const t = i / sr; lp += 0.15 * ((Math.random() - 0.5) - lp); e[i] = (t < 0.03 ? (Math.random() - 0.5) * 1.4 * (1 - t / 0.03) : 0) + Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t * 30) * 0.8 + lp * 2.5 * Math.exp(-((t - 0.2) ** 2) / 0.01); }
  sound.buffers.launch = b2;
}
const army = new Army(field, mapGroup, effects);
// model rycerza dla piechoty (dwa poziomy szczegółów: makieta i widok 1:1)
Promise.all([bakeKnight('./assets/medieval/knight_hi.glb', UNIT_K), bakeKnight('./assets/medieval/knight_lo.glb', UNIT_K)])
  .then(([hi, lo]) => army.useKnight(hi, lo)).catch((e) => console.warn('Model rycerza niedostępny', e));
const table = new TableManipulator(tableRoot);
const hud = new MHud(), menu = new MMenu();
document.getElementById('hud').appendChild(hud.canvas);
document.getElementById('menu').appendChild(menu.canvas);
const toWorld = (p) => p.clone().applyMatrix4(mapGroup.matrixWorld);
let lastSnd = 0, clockT = 0;
army.onImpact = (p) => sound.play('thud', toWorld(p), state.avatar ? 1 : 0.7);
army.onLaunch = (p) => sound.play('launch', toWorld(p), 0.6);
army.onHit = (s) => { if (clockT - lastSnd < 0.06) return; lastSnd = clockT; sound.play('clang', toWorld(new THREE.Vector3(s.x, field.heightAt(s.x, s.z) + 2, s.z)), 0.4); };

// tupot oddziałów w marszu: najbliższe maszerujące oddziały
const marchSrc = Array.from({ length: 6 }, () => { const a = new THREE.PositionalAudio(sound.listener); a.setDistanceModel('inverse'); a.setRolloffFactor(1.2); scene.add(a); return a; });
let marchI = 0;
function updateMarch(dt) {
  if (sound.listener.context.state !== 'running' || !state.started || state.paused) return;
  const cam = camera.getWorldPosition(new THREE.Vector3()), cand = [];
  for (const sq of army.squads) {
    const al = army.alive(sq);
    if (!al.length) continue;
    let v = 0; const k = Math.min(6, al.length); for (let i = 0; i < k; i++) v += Math.hypot(al[i].vx, al[i].vz); v /= k;
    if (v < 0.8 * UNIT_K) { sq.marchT = 0; continue; }
    sq.marchT = (sq.marchT || 0) - dt * state.speed;
    if (sq.marchT > 0) continue;
    const [cx, cz] = army.center(sq), w = toWorld(new THREE.Vector3(cx, field.heightAt(cx, cz) + 1, cz));
    cand.push({ sq, w, d: w.distanceTo(cam), n: al.length, run: v > 3 * UNIT_K });
  }
  cand.sort((a, b) => a.d - b.d);
  for (const c of cand.slice(0, 3)) {
    c.sq.marchT = c.run ? 0.34 : 0.55;
    const a = marchSrc[marchI = (marchI + 1) % marchSrc.length];
    if (a.isPlaying) a.stop();
    a.setBuffer(sound.buffers.march); a.setRefDistance(state.avatar ? 5 : 0.35);
    a.setVolume(Math.min(1, c.n / 18) * (c.sq.type === 'cav' ? 1.1 : c.sq.type === 'cat' ? 1.6 : 0.75)); a.playbackRate = (c.sq.type === 'cav' ? 0.7 : c.sq.type === 'cat' ? 0.45 : 1) * (0.92 + Math.random() * 0.16);
    a.position.copy(c.w); a.updateMatrixWorld(); a.play();
  }
}
// celownik trybu żołnierza: wskazany wrogi oddział
const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
aimRing.visible = false; aimRing.frustumCulled = false;

// znaczniki: pierścień zaznaczenia, cel marszu, linia rozkazu
const selRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
const targetFlag = new THREE.Group();
targetFlag.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1 * UNIT_K, 0.1 * UNIT_K, 5 * UNIT_K, 5).translate(0, 2.5 * UNIT_K, 0), new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false })));
targetFlag.add(new THREE.Mesh(new THREE.ConeGeometry(1.2 * UNIT_K, 2 * UNIT_K, 4).rotateX(Math.PI).translate(0, 1 * UNIT_K, 0), new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false })));
const orderLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8 }));
const dragLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff }));
for (const o of [selRing, targetFlag, orderLine, dragLine]) { o.visible = false; o.frustumCulled = false; mapGroup.add(o); }
mapGroup.add(aimRing);
// zaznaczenie wielu oddziałów: pierścienie i linie rozkazów, zarys szyku w punkcie docelowym
const ringPool = Array.from({ length: 24 }, () => { const r = new THREE.Mesh(selRing.geometry, selRing.material); r.visible = false; r.frustumCulled = false; mapGroup.add(r); return r; });
const linePool = Array.from({ length: 24 }, () => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8 })); l.visible = false; l.frustumCulled = false; mapGroup.add(l); return l; });
const ghost = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.75 * UNIT_K, 0.75 * UNIT_K, 0.4 * UNIT_K, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }), 2000);
ghost.instanceMatrix.setUsage(THREE.DynamicDrawUsage); ghost.setColorAt(0, new THREE.Color()); ghost.count = 0; ghost.frustumCulled = false; mapGroup.add(ghost);
const ghostArrow = new THREE.Mesh(new THREE.ConeGeometry(2.2 * UNIT_K, 6 * UNIT_K, 4).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
ghostArrow.visible = false; mapGroup.add(ghostArrow);
const boxLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array(5).fill(0).map(() => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xffffff }));
boxLine.visible = false; boxLine.frustumCulled = false; mapGroup.add(boxLine);

// ---------- stan ----------
const state = { started: false, paused: true, speed: 1, avatar: false };
let sel = new Set(), rotOff = 0, flash = { text: '', until: 0, color: '#9fe8b0' }, aim = null, menuHover = false, drag = null, player = null;
const primary = () => { let p = null; for (const q of sel) if (army.alive(q).length) p = q; return p; };
const msg = (t, c = '#9fe8b0') => { flash = { text: t, until: clockT + 2.5, color: c }; };

function preset() {
  army.clear(); state.started = false; state.paused = true; sel.clear();
  for (const side of [0, 1]) for (const t of ['cav', 'spear', 'sword', 'sword', 'spear', 'bow', 'bow', 'sword', 'cav']) army.addSquad(side, t);
    for (const side of [0, 1]) army.addSquad(side, 'cat', 0, SIDES[side].home + SIDES[side].dir * -40);
  msg('Armie rozstawione — możesz je przestawić, potem START');
}
function toggleMenu(v) { const show = v ?? !menu.mesh.visible; menu.mesh.visible = show; hud.mesh.visible = !show; document.getElementById('menu').style.display = show ? 'block' : 'none'; }
function runToggle() {
  if (!state.started) { state.started = true; state.paused = false; msg('Bitwa się zaczyna!', '#ffd08a'); }
  else state.paused = !state.paused;
}
function menuAction(act) {
  const [k, a, b] = act.split(':');
  switch (k) {
    case 'add': { const sq = army.addSquad(Number(a), b); sel = new Set([sq]); msg(`Dodano: ${TYPES[b].name} (${SIDES[a].name})`); break; }
    case 'run': runToggle(); toggleMenu(false); break;
    case 'preset': preset(); break;
    case 'clear': army.clear(); state.started = false; state.paused = true; sel.clear(); break;
    case 'avatar': if (state.avatar) exitAvatar(); else enterAvatar(); toggleMenu(false); break;
    case 'speed-': case 'speed+': state.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(state.speed) + (k === 'speed+' ? 1 : -1)))]; break;
    case 'place': placeTable(); break;
    case 'close': toggleMenu(false); break;
    case 'mode': location.href = a; break;
    default: break;
  }
}

// najbliższy żołnierz w punkcie mapy
function soldierAt(p, r = 6) {
  let best = null, bd = r;
  for (const s of army.soldiers) { if (s.state !== 'alive') continue; const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; best = s; } }
  return best;
}
function teleport(sq, x, z, facing) {
  sq.ax = x; sq.az = z; if (facing !== undefined) sq.facing = facing;
  for (const s of sq.soldiers) { const p = army.slotPos(sq, s); s.x = p[0]; s.z = p[1]; s.yaw = sq.facing; }
}
// kierunek frontu: VR — kierunek wskazania kontrolera, skręt nadgarstka obraca linię; komputer — kierunek kamery
function aimFacing() {
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  let F, roll = 0;
  if (renderer.xr.isPresenting && aimCtrl?.source) {
    aimCtrl.c.getWorldQuaternion(q);
    F = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(q), r0 = new THREE.Vector3().crossVectors(F, up);
    if (r0.lengthSq() > 1e-4) roll = THREE.MathUtils.clamp(Math.atan2(-r.y, r.dot(r0.normalize())), -1.8, 1.8);
  } else { camera.getWorldQuaternion(q); F = new THREE.Vector3(0, 0, -1).applyQuaternion(q); }
  F.y = 0; if (F.lengthSq() < 1e-6) F.set(0, 0, -1); F.normalize();
  F.applyAxisAngle(up, -roll + rotOff);
  const d = F.transformDirection(mapGroup.matrixWorld.clone().invert());
  return Math.atan2(d.x, d.z);
}
// szyk grupy: piechota w linii frontu, łucznicy za nią, jazda na skrzydłach (kolejność jak obecnie, bez krzyżowania)
const ROLE = (t) => (t === 'bow' ? 'back' : t === 'cat' ? 'rear' : t === 'cav' ? 'wing' : 'front');
function groupFormation(list, p, facing) {
  const c = Math.cos(facing), sn = Math.sin(facing), L = [c, -sn], Fv = [sn, c], GAP = 5;
  const proj = (q) => { const [x, z] = army.center(q); return x * L[0] + z * L[1]; };
  const T = (q) => TYPES[q.type], SPX = 1.7 * UNIT_K;
  const width = (q) => (T(q).cols - 1) * (T(q).spx || SPX) + 3;
  const depth = (q) => Math.ceil(Math.max(1, army.alive(q).length) / T(q).cols) * (T(q).spz || SPX);
  const by = (r) => list.filter((q) => ROLE(q.type) === r).sort((a, b) => proj(a) - proj(b));
  let front = by('front'), back = by('back'), rear = by('rear');
  const wings = by('wing');
  if (!front.length) { front = back; back = []; }
  if (!front.length) { front = rear; rear = []; }
  const out = [];
  const put = (q, lx, off) => out.push({ sq: q, x: p.x + L[0] * lx + Fv[0] * off, z: p.z + L[1] * lx + Fv[1] * off });
  const lay = (arr, off) => {
    const W = arr.reduce((a, q) => a + width(q), 0) + GAP * Math.max(0, arr.length - 1);
    let x = -W / 2; for (const q of arr) { put(q, x + width(q) / 2, off); x += width(q) + GAP; }
    return W;
  };
  const W = lay(front, 0);
  const dF = Math.max(...front.map(depth), 0) + 8;
  if (back.length) lay(back, -dF);
  if (rear.length) lay(rear, -(dF + (back.length ? Math.max(...back.map(depth)) + 16 : 10)));
  let left = -W / 2 - GAP * 2, right = W / 2 + GAP * 2;
  wings.forEach((q, i) => {
    const w = width(q);
    if (i % 2 === 0 && (wings.length > 1 || proj(q) <= 0)) { put(q, left - w / 2, 0); left -= w + GAP; }
    else { put(q, right + w / 2, 0); right += w + GAP; }
  });
  return out;
}
function selList() { return [...sel].filter((q) => army.alive(q).length); }
// rozkaz dla zaznaczonych oddziałów: atak na wskazanego wroga albo marsz w szyku
function issueGroup(p, facing, run = false) {
  const list = selList();
  if (!list.length) return;
  const t = soldierAt(p, 5);
  if (t && state.started && list.every((q) => q.side !== t.side)) {
    for (const q of list) army.order(q, { type: 'attack', squad: t.sq, run });
    msg((list.length > 1 ? `${list.length} oddziały: do ataku` : `${TYPES[list[0].type].name}: do ataku`) + (run ? ' biegiem!' : '!'), '#ff8a7a');
    return;
  }
  const plan = groupFormation(list, p, facing);
  if (!state.started) {
    let ok = 0;
    for (const a of plan) { const own = a.sq.side === 0 ? a.z > 20 : a.z < -20; if (!own) continue; teleport(a.sq, a.x, a.z, facing); army.order(a.sq, null); ok++; }
    if (ok === plan.length) msg(plan.length > 1 ? `Ustawiono ${ok} oddziały` : 'Oddział ustawiony');
    else msg('Przed bitwą rozstawiaj na swojej połowie', '#ffb070');
    return;
  }
  for (const a of plan) army.order(a.sq, { type: 'move', x: a.x, z: a.z, facing, run });
  msg(run ? (list.length > 1 ? `${list.length} oddziały: biegiem!` : `${TYPES[list[0].type].name}: biegiem!`) : list.length > 1 ? `${list.length} oddziały: marsz w szyku!` : `${TYPES[list[0].type].name}: marsz!`, run ? '#ffd08a' : '#9fe8b0');
}
// spust: przeciągnięcie = zaznaczenie prostokątem (zawsze); krótkie kliknięcie = oddział dodaj/usuń albo rozkaz;
// dwuklik w ten sam cel = biegiem
const BOX_MIN = 8;
let lastClick = null;
function pointerDown(p) {
  if (!p) return;
  drag = { start: p.clone(), cur: p.clone() };
}
function clickAt(p) {
  const s = soldierAt(p, 6), list = selList(), side = list.length ? list[0].side : null;
  const enemyTarget = s && list.length && s.sq.side !== side && state.started;
  if (s && !enemyTarget && (!state.started || s.sq.side === 0)) {
    if (sel.has(s.sq)) sel.delete(s.sq);
    else { if (side !== null && side !== s.sq.side) sel.clear(); sel.add(s.sq); }
    lastClick = null;
    return;
  }
  if (!list.length) return;
  const prev = lastClick;
  const dbl = !!prev && clockT - prev.t < 0.5 && Math.hypot(p.x - prev.p.x, p.z - prev.p.z) < 14;
  const facing = dbl ? prev.f : aimFacing(), at = dbl ? prev.p : p;
  issueGroup(at, facing, dbl);
  lastClick = dbl ? null : { t: clockT, p: p.clone(), f: facing };
}
function boxSelect(a, b) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
  const inside = army.squads.filter((q) => { if (!army.alive(q).length) return false; const [x, z] = army.center(q); return x >= x0 && x <= x1 && z >= z0 && z <= z1; });
  const side = inside.some((q) => q.side === 0) || state.started ? 0 : 1;
  const pick = inside.filter((q) => q.side === side);
  sel = new Set(pick);
  msg(pick.length ? `Zaznaczono: ${pick.length} oddz.` : 'Nic nie zaznaczono', pick.length ? '#9fe8b0' : '#ffb070');
}
function pointerUp(p) {
  const d = drag; drag = null;
  if (!d) return;
  const end = p || d.cur;
  if (Math.hypot(end.x - d.start.x, end.z - d.start.z) > BOX_MIN) { boxSelect(d.start, end); return; }
  clickAt(d.start);
}

// ---------- wcielenie w żołnierza ----------
let saved = null, avatarYaw = 0, playerHp = 100, hurt = 0, drawStart = null, lastStrike = 0;
const hurtFx = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8), new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false }));
hurtFx.renderOrder = 999; camera.add(hurtFx);
const weapons = {};
{
  const metal = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.8, roughness: 0.3 }), wood = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const sw = new THREE.Group();
  sw.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.85).translate(0, 0, -0.52), metal), new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.03).translate(0, 0, -0.09), wood), new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6).rotateX(Math.PI / 2).translate(0, 0, 0), wood));
  const sp = new THREE.Group();
  sp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 6).rotateX(Math.PI / 2).translate(0, 0, -0.9), wood), new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.25, 6).rotateX(-Math.PI / 2).translate(0, 0, -2.2), metal));
  const bow = new THREE.Group();
  bow.add(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.015, 5, 16, Math.PI * 0.85).rotateZ(Math.PI / 2 - Math.PI * 0.425).rotateY(Math.PI / 2).translate(0, 0, 0.3), wood));
  const arrow = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.75, 4).rotateX(Math.PI / 2).translate(0, 0, -0.35), wood);
  const lance = new THREE.Group();
  lance.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 3.4, 6).rotateX(Math.PI / 2).translate(0, 0, -1.3), wood), new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 6).rotateX(-Math.PI / 2).translate(0, 0, -3.15), metal), new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.09, 0.2, 8).rotateX(Math.PI / 2).translate(0, 0, -0.15), metal));
  Object.assign(weapons, { sword: sw, spear: sp, bow, arrow, cav: lance });
  for (const w of Object.values(weapons)) w.visible = false;
}
function enterAvatar() {
  if (state.avatar) return;
  const pr = primary();
  let sq = pr && pr.side === 0 && !TYPES[pr.type].siege ? pr : army.squads.find((q) => q.side === 0 && !TYPES[q.type].siege && army.alive(q).length);
  if (!sq) { msg('Brak oddziału do wcielenia', '#ff8a7a'); return; }
  const alive = army.alive(sq);
  player = alive.reduce((a, b) => (Math.abs(b.slot[0]) + Math.abs(b.slot[1]) < Math.abs(a.slot[0]) + Math.abs(a.slot[1]) ? b : a));
  player.isPlayer = true; player.hp = Math.max(player.hp, TYPES[player.type].hp);
  playerHp = 100;
  for (const q of army.squads) if (q.side === 0 && q !== sq) { q.auto = true; if (q.order && !q.order.auto) q.order = null; }
  army.order(sq, { type: 'follow', soldier: player });
  sel = new Set([sq]);
  saved = { pos: tableRoot.position.clone(), quat: tableRoot.quaternion.clone(), scale: tableRoot.scale.x, cam: camera.position.clone(), target: controls.target.clone() };
  state.avatar = true;
  if (!state.started) runToggle(); else state.paused = false;
  const s = 1 / (MAP_SCALE * UNIT_K);
  tableRoot.scale.setScalar(s);
  // pozycja startowa: głowa użytkownika nad żołnierzem, przodem do wroga
  const head = camera.getWorldPosition(new THREE.Vector3());
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())); f.y = 0;
  const alpha = f.lengthSq() > 1e-4 ? Math.atan2(-f.x, -f.z) : 0;
  avatarYaw = player.yaw;
  tableRoot.rotation.set(0, alpha + Math.PI - avatarYaw, 0);
  tableRoot.updateMatrixWorld();
  const pm = new THREE.Vector3(player.x, 0, player.z).applyMatrix4(mapGroup.matrixWorld);
  tableRoot.position.x += head.x - pm.x; tableRoot.position.z += head.z - pm.z;
  if (!renderer.xr.isPresenting) { camera.position.set(0, 1.7, 0); camera.rotation.set(0, 0, 0, 'YXZ'); look.yaw = 0; look.pitch = 0; tableRoot.position.x -= head.x; tableRoot.position.z -= head.z; }
  camera.near = 0.05; camera.far = 700; camera.updateProjectionMatrix();
  env.visible = false; scene.background = new THREE.Color(0x9fc0dc); scene.fog = new THREE.Fog(0x9fc0dc, 120, 420);
  sun.castShadow = false;
  const w = weapons[player.type];
  if (renderer.xr.isPresenting) {
    const right = ctrls.find((o) => o.hand === 'right') || ctrls[0], left = ctrls.find((o) => o.hand === 'left') || ctrls[1];
    if (player.type === 'bow') { left.grip.add(w); right.grip.add(weapons.arrow); weapons.arrow.visible = true; } else right.grip.add(w);
    w.position.set(0, 0, 0); w.rotation.set(0, 0, 0);
  } else { camera.add(w); w.position.set(0.25, -0.28, -0.45); w.rotation.set(player.type === 'bow' ? 0 : -0.3, player.type === 'bow' ? 0.4 : 0.1, 0); if (player.type === 'cav') { w.position.set(0.32, -0.42, -0.2); w.rotation.set(0.02, 0.06, 0); } }
  w.visible = true;
  msg(`Jesteś w oddziale: ${TYPES[player.type].name}`, '#ffe08a');
}
function exitAvatar(reason) {
  if (!state.avatar) return;
  state.avatar = false;
  if (player) { player.isPlayer = false; player = null; }
  bladePrev = null;
  for (const w of Object.values(weapons)) { w.visible = false; w.parent?.remove(w); }
  tableRoot.position.copy(saved.pos); tableRoot.quaternion.copy(saved.quat); tableRoot.scale.setScalar(saved.scale);
  if (!renderer.xr.isPresenting) { camera.position.copy(saved.cam); controls.target.copy(saved.target); controls.update(); }
  camera.near = 0.01; camera.far = 200; camera.updateProjectionMatrix();
  env.visible = !arMode; scene.background = arMode ? null : SKY; scene.fog = arMode ? null : new THREE.Fog(SKY, 10, 45);
  sun.castShadow = SHADOWS;
  hurtFx.material.opacity = 0;
  if (reason) msg(reason, '#ff8a7a');
}
// pozycja gracza na mapie = rzut głowy użytkownika; wysokość świata wg terenu pod nim
const _inv = new THREE.Matrix4();
function updateAvatar(dt) {
  if (!state.avatar || !player) return;
  if (player.state !== 'alive') { exitAvatar('Polegałeś w bitwie…'); return; }
  scene.updateMatrixWorld();
  const head = camera.getWorldPosition(new THREE.Vector3());
  _inv.copy(mapGroup.matrixWorld).invert();
  const hm = head.clone().applyMatrix4(_inv);
  const cx = Math.max(-MW / 2 + 2, Math.min(MW / 2 - 2, hm.x)), cz = Math.max(-MD / 2 + 2, Math.min(MD / 2 - 2, hm.z));
  player.vx = (cx - player.x) / Math.max(dt, 1e-3); player.vz = (cz - player.z) / Math.max(dt, 1e-3);
  player.x = cx; player.z = cz;
  const fw = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())).transformDirection(_inv);
  player.yaw = Math.atan2(fw.x, fw.z);
  player.phase += Math.hypot(player.vx, player.vz) * dt;
  // teren pod stopami na poziomie podłogi
  const g = field.heightAt(cx, cz);
  const gw = new THREE.Vector3(cx, g, cz).applyMatrix4(mapGroup.matrixWorld);
  tableRoot.position.y -= gw.y + (TYPES[player.type].mount ? RIDER_EYE : 0);
  if (cx !== hm.x || cz !== hm.z) { const ew = new THREE.Vector3(cx, hm.y, cz).applyMatrix4(mapGroup.matrixWorld); tableRoot.position.x += head.x - ew.x; tableRoot.position.z += head.z - ew.z; }
  hurt = Math.max(0, hurt - dt * 1.5);
  hurtFx.material.opacity = hurt * 0.45;
  playerHp = Math.max(0, Math.round((player.hp / TYPES[player.type].hp) * 100));
}
// ruch gałką: świat przesuwa się względem gracza
function locomote(mx, mz, dt) {
  const fw = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())); fw.y = 0; fw.normalize();
  const rt = new THREE.Vector3(-fw.z, 0, fw.x);
  const v = fw.multiplyScalar(mz).add(rt.multiplyScalar(mx)).multiplyScalar((TYPES[player.type].mount ? 7 : 3.2) * dt * (field.water(player.x, player.z) ? 0.5 : 1));
  tableRoot.position.sub(v);
}
function snapTurn(a) {
  const head = camera.getWorldPosition(new THREE.Vector3());
  const rel = tableRoot.position.clone().sub(head).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
  tableRoot.position.copy(head).add(rel); tableRoot.position.y = tableRoot.position.y;
  tableRoot.rotation.y += a;
}
function playerAttack(dirWorld, power = 1) {
  if (!player || clockT - lastStrike < TYPES[player.type].cd * 0.7) return;
  lastStrike = clockT;
  const d = dirWorld.clone().transformDirection(_inv.copy(mapGroup.matrixWorld).invert()); d.y = 0; d.normalize();
  const hits = army.playerStrike(player, d.x, d.z);
  player.anim = 1;
  if (hits) { sound.play('clang', camera.getWorldPosition(new THREE.Vector3()), 0.8); for (const o of ctrls) if (o.hand === 'right') pulse(o, 0.8, 80); }
  void power;
}
// trafienie ostrzem: odcinek broni (w dłoni) przecina sylwetkę wroga z odpowiednią prędkością
const BLADE = { sword: [-0.15, -0.95], spear: [-1.0, -2.3], cav: [-1.6, -3.25] };
let bladePrev = null;
function meleeContact(o, dt) {
  const [z0, z1] = BLADE[player.type] || BLADE.sword;
  _inv.copy(mapGroup.matrixWorld).invert();
  const N = 6, now = [];
  for (let k = 0; k < N; k++) now.push(o.grip.localToWorld(new THREE.Vector3(0, 0, z0 + ((z1 - z0) * k) / (N - 1))));
  const prev = bladePrev; bladePrev = now.map((v) => v.clone());
  if (!prev) return;
  const tipSpeed = now[N - 1].distanceTo(prev[N - 1]) / Math.max(dt, 1e-3);
  if (tipSpeed < 1.3) return;                       // samo dotknięcie bez zamachu nie rani
  const pts = [];
  for (let s = 0; s <= 2; s++) for (let k = 0; k < N; k++) pts.push(prev[k].clone().lerp(now[k], s / 2).applyMatrix4(_inv));
  const r = 0.42 * UNIT_K, hit = new Set();
  const cx = pts[0].x, cz = pts[0].z;
  for (const s of army.soldiers) {
    if (s.state !== 'alive' || s.side === player.side || s.isPlayer) continue;
    if (Math.abs(s.x - cx) > 5 * UNIT_K || Math.abs(s.z - cz) > 5 * UNIT_K) continue;
    if (s.playerHitT && clockT - s.playerHitT < 0.45) continue;
    const base = field.heightAt(s.x, s.z), top = base + (TYPES[s.type].mount ? 2.6 : 1.8) * UNIT_K, rr = TYPES[s.type].mount ? r * 2.2 : r;
    for (const q of pts) if (q.y > base && q.y < top && Math.hypot(q.x - s.x, q.z - s.z) < rr) { hit.add(s); break; }
  }
  if (!hit.size) return;
  const power = Math.min(2, tipSpeed / 3);
  for (const s of hit) { s.playerHitT = clockT; army.playerHit(player, s, power); }
  player.anim = 1;
  sound.play('clang', now[N - 1], 0.8);
}
function playerShoot(fromWorld, dirWorld, power) {
  if (!player) return;
  _inv.copy(mapGroup.matrixWorld).invert();
  const from = fromWorld.clone().applyMatrix4(_inv), d = dirWorld.clone().transformDirection(_inv);
  army.fire(from, d.multiplyScalar(ARROW_V * (0.45 + 0.55 * power)), player.side, player);
  sound.play('pop', fromWorld, 0.3);
}
// znacznik trafienia (X na środku widoku) i krótkie „tyk”
const hitMark = new CanvasPanel(128, 128, 0.05);
function drawHitMark(kill) {
  const c = hitMark.ctx; c.clearRect(0, 0, 128, 128);
  for (const [w, col] of [[11, 'rgba(0,0,0,0.6)'], [6, kill ? '#ff3a2a' : '#ffffff']]) {
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { c.moveTo(64 + sx * 18, 64 + sy * 18); c.lineTo(64 + sx * 48, 64 + sy * 48); }
    c.stroke();
  }
  hitMark.tex.needsUpdate = true;
}
hitMark.mesh.material.depthTest = false; hitMark.mesh.renderOrder = 1000; hitMark.mesh.position.set(0, 0, -0.6); hitMark.mesh.visible = false;
camera.add(hitMark.mesh);
let hitT = 0, hitKill = false;
{
  const ctx = sound.listener.context, sr = ctx.sampleRate;
  const mk = (dur, fn) => { const n = Math.floor(sr * dur), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = fn(i / sr); return b; };
  sound.buffers.hitmark = mk(0.09, (t) => (Math.sin(2 * Math.PI * 3100 * t) * 0.5 + Math.sin(2 * Math.PI * 4650 * t) * 0.3 + Math.sin(2 * Math.PI * 6900 * t) * 0.15) * Math.exp(-t * 70) + (t < 0.004 ? (Math.random() - 0.5) * 0.9 : 0));
  sound.buffers.hitkill = mk(0.22, (t) => { const a = (u) => (u > 0 ? (Math.sin(2 * Math.PI * 2600 * u) * 0.5 + Math.sin(2 * Math.PI * 3900 * u) * 0.3) * Math.exp(-u * 45) : 0); return a(t) + a(t - 0.075) * 0.9; });
  // tupot maszerującego oddziału: kilkanaście kroków + pobrzękiwanie zbroi
  const steps = Array.from({ length: 12 }, () => [Math.random() * 0.32, 55 + Math.random() * 35, 0.5 + Math.random() * 0.5]);
  const jingle = Array.from({ length: 10 }, () => [Math.random() * 0.4, 2800 + Math.random() * 3200]);
  let lp = 0;
  sound.buffers.march = mk(0.6, (t) => {
    lp += 0.12 * ((Math.random() * 2 - 1) - lp);
    let v = 0;
    for (const [t0, f, a] of steps) { const u = t - t0; if (u > 0) v += (Math.sin(2 * Math.PI * f * u) * 0.8 + lp * 2.2) * a * Math.exp(-u * 28); }
    for (const [t0, f] of jingle) { const u = t - t0; if (u > 0) v += Math.sin(2 * Math.PI * f * u) * 0.06 * Math.exp(-u * 40); }
    return Math.tanh(v * 0.7);
  });
}
const tick = new THREE.Audio(sound.listener);
function playerHitFx(kill) {
  hitT = kill ? 0.4 : 0.22; hitKill = kill; drawHitMark(kill);
  if (sound.listener.context.state === 'running') { if (tick.isPlaying) tick.stop(); tick.setBuffer(sound.buffers[kill ? 'hitkill' : 'hitmark']); tick.setVolume(kill ? 0.9 : 0.75); tick.play(); }
  for (const o of ctrls) if (o.source && (o.hand === 'right' || player?.type === 'bow')) pulse(o, kill ? 1 : 0.85, kill ? 140 : 60);
}
army.onPlayerDealt = (t, dmg, kill) => { if (state.avatar) playerHitFx(kill); };
army.onPlayerHit = (dmg) => { hurt = Math.min(1, hurt + dmg / 40); for (const o of ctrls) pulse(o, 0.6, 120); };
// rozkazy z poziomu żołnierza
function squadCommand(kind, p) {
  if (!player) return;
  const sq = player.sq;
  if (kind === 'follow') { army.order(sq, { type: 'follow', soldier: player }); msg('„Za mną!”', '#ffe08a'); }
  else if (kind === 'charge') { const t = army.nearestSquad(sq); if (t) { army.order(sq, { type: 'attack', squad: t, run: true }); msg('„Do ataku!”', '#ff8a7a'); } }
  else if (kind === 'point' && p) {
    const t = soldierAt(p, 8);
    if (t && t.side !== sq.side) { army.order(sq, { type: 'attack', squad: t.sq, run: true, fromPlayer: true }); msg('„Na nich — biegiem!”', '#ff8a7a'); }
    else { army.order(sq, { type: 'move', x: p.x, z: p.z }); msg('„Naprzód — tam!”', '#ffe08a'); }
  }
}

// ---------- XR ----------
const factory = new XRControllerModelFactory();
const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
let aimCtrl = null;
function pulse(o, i, ms) { const a = o?.source?.gamepad?.hapticActuators?.[0]; if (a && a.pulse) a.pulse(i, ms).catch?.(() => {}); }
function attachPanels() {
  const off = ctrls.find((o) => o.source && o !== aimCtrl);
  if (!off) return;
  off.grip.add(hud.mesh); off.grip.add(menu.mesh);
  hud.mesh.position.set(0, 0.075, 0.035); hud.mesh.rotation.set(-0.75, 0, 0);
  menu.mesh.position.set(0, 0.15, -0.01); menu.mesh.rotation.set(-0.55, 0, 0);
}
const raycaster = new THREE.Raycaster();
const ctrls = [0, 1].map((i) => {
  const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
  grip.add(factory.createControllerModel(grip));
  scene.add(c, grip);
  const ray = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  ray.scale.z = 2; ray.visible = false; c.add(ray);
  const o = { c, grip, ray, source: null, hand: null, prev: [], lastPos: new THREE.Vector3(), speed: 0 };
  c.addEventListener('connected', (e) => { o.source = e.data; o.hand = e.data.handedness; ray.visible = true; if (!aimCtrl || o.hand === 'right') aimCtrl = o; attachPanels(); });
  c.addEventListener('disconnected', () => { o.source = null; ray.visible = false; table.release(grip); if (aimCtrl === o) aimCtrl = ctrls.find((x) => x.source) || null; attachPanels(); });
  c.addEventListener('selectstart', () => {
    sound.resume();
    if (menuHover && menu.hover >= 0) { menuAction(menu.buttons[menu.hover].act); return; }
    if (state.avatar) {
      if (o.hand === 'left') { squadCommand('point', groundHit(o)); return; }
      if (player?.type === 'bow') { drawStart = clockT; return; }
      return;      // broń biała w VR: liczy się fizyczne trafienie ostrzem (bez klikania)
    }
    pointerDown(groundHit(o));
  });
  c.addEventListener('selectend', () => {
    if (state.avatar) {
      if (o.hand !== 'left' && player?.type === 'bow' && drawStart !== null) {
        const power = Math.min(1, (clockT - drawStart) / 0.9); drawStart = null;
        playerShoot(o.c.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0, 0, -1).applyQuaternion(o.c.getWorldQuaternion(new THREE.Quaternion())), power);
      }
      return;
    }
    pointerUp(groundHit(o));
  });
  c.addEventListener('squeezestart', () => { if (!state.avatar) table.grab(grip); });
  c.addEventListener('squeezeend', () => table.release(grip));
  return o;
});
function groundHit(o) {
  const org = new THREE.Vector3(), dir = new THREE.Vector3();
  if (o) { o.c.getWorldPosition(org); dir.set(0, 0, -1).applyQuaternion(o.c.getWorldQuaternion(new THREE.Quaternion())); }
  else { if (!mouseInside) return null; raycaster.setFromCamera(mouse, camera); org.copy(raycaster.ray.origin); dir.copy(raycaster.ray.direction); }
  const inv = mapGroup.matrixWorld.clone().invert();
  return field.raycast(org.applyMatrix4(inv), dir.transformDirection(inv));
}
function pollXRInput(dt) {
  for (const o of ctrls) {
    const gp = o.source?.gamepad;
    if (!gp) continue;
    const pressed = gp.buttons.map((b) => b.pressed);
    const down = (i) => pressed[i] && !o.prev[i];
    const ax = gp.axes[2] || 0, ay = gp.axes[3] || 0;
    // prędkość dłoni — zamach mieczem/włócznią
    const wp = o.grip.getWorldPosition(new THREE.Vector3());
    o.speed = wp.distanceTo(o.lastPos) / Math.max(dt, 1e-3); const vdir = wp.clone().sub(o.lastPos); o.lastPos.copy(wp);
    if (state.avatar && o.hand === 'right' && player && player.type !== 'bow') meleeContact(o, dt);
    void vdir;
    if (o.hand === 'right') {
      if (down(5)) toggleMenu();
      if (state.avatar) {
        if (Math.abs(ax) > 0.75 && !o.flick) { o.flick = true; snapTurn(ax > 0 ? Math.PI / 6 : -Math.PI / 6); }
        if (Math.abs(ax) < 0.35) o.flick = false;
      } else {
        if (down(4)) runToggle();
        if (down(3)) { sel.clear(); rotOff = 0; }
        if (Math.abs(ax) > 0.25 && sel.size) rotOff -= ax * dt * 1.6;      // dokręcenie linii prawą gałką
      }
    } else if (o.hand === 'left') {
      if (state.avatar) {
        if (Math.abs(ax) > 0.15 || Math.abs(ay) > 0.15) locomote(ax, -ay, dt);
        if (down(4)) squadCommand('follow');
        if (down(5)) squadCommand('charge');
      } else {
        if (down(4)) placeTable();
        if (down(5)) enterAvatar();
        if (Math.abs(ax) > 0.2 || Math.abs(ay) > 0.2) table.nudge(tableRoot.getWorldPosition(new THREE.Vector3()), Math.exp(-ay * dt * 1.4), -ax * dt * 1.6);
      }
    }
    o.prev = pressed;
  }
}
function updateMenuHover() {
  menuHover = false;
  if (!renderer.xr.isPresenting || !menu.mesh.visible || !aimCtrl?.source) return null;
  const o = new THREE.Vector3(); aimCtrl.c.getWorldPosition(o);
  raycaster.set(o, new THREE.Vector3(0, 0, -1).applyQuaternion(aimCtrl.c.getWorldQuaternion(new THREE.Quaternion())));
  const hit = raycaster.intersectObject(menu.mesh, false)[0];
  if (!hit) { menu.hover = -1; return null; }
  menuHover = true;
  menu.hover = menu.hit(hit.uv.x * menu.canvas.width, (1 - hit.uv.y) * menu.canvas.height);
  return hit;
}
function placeTable() {
  if (state.avatar) return;
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  camera.getWorldPosition(p); camera.getWorldQuaternion(q);
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q); f.y = 0;
  if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
  f.normalize();
  tableRoot.scale.setScalar(1);
  const dist = 0.35 + (MD * MAP_SCALE) / 2;
  const y = renderer.xr.isPresenting ? THREE.MathUtils.clamp(p.y - 0.7, 0.5, 1.05) : 0.85;
  tableRoot.position.set(p.x + f.x * dist, y, p.z + f.z * dist);
  tableRoot.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
  if (table.active) table.begin();
}

// ---------- komputer ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minDistance = 0.05; controls.maxDistance = 8;
const mouse = new THREE.Vector2();
const look = { yaw: 0, pitch: 0 };
let mouseInside = false, downAt = null;
const keys = new Set();
renderer.domElement.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); mouseInside = true;
  if (state.avatar && !renderer.xr.isPresenting && e.buttons & 2) { look.yaw -= e.movementX * 0.004; look.pitch = Math.max(-1.2, Math.min(1.2, look.pitch - e.movementY * 0.004)); }
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerleave', () => { mouseInside = false; });
renderer.domElement.addEventListener('pointerdown', (e) => {
  sound.resume();
  downAt = { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey };
  if (state.avatar) { if (e.button === 0) { if (player?.type === 'bow') drawStart = clockT; else playerAttack(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)); } return; }
  if (e.button === 0 && e.shiftKey) { const p = groundHit(null); if (p) { controls.enabled = false; pointerDown(p); } }
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (state.avatar) {
    if (e.button === 0 && player?.type === 'bow' && drawStart !== null) { const power = Math.min(1, (clockT - drawStart) / 0.9); drawStart = null; playerShoot(camera.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), power); }
    downAt = null; return;
  }
  const p = groundHit(null);
  if (drag) { pointerUp(p); controls.enabled = true; }
  else if (downAt && downAt.b === 0 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) { pointerDown(p); if (drag) pointerUp(p); }
  downAt = null;
});
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === ' ') { runToggle(); e.preventDefault(); }
  if (k === 'o' || k === 'b') toggleMenu();
  if (k === 'e' && !state.avatar) enterAvatar();
  if ((k === 'escape' || k === 'q') && state.avatar) exitAvatar();
  if (k === 'escape' && !state.avatar) sel.clear();
  if (k === 'z') rotOff += Math.PI / 12;
  if (k === 'x') rotOff -= Math.PI / 12;
  if (k === '1') menuAction('add:0:sword'); if (k === '2') menuAction('add:0:bow'); if (k === '3') menuAction('add:0:spear');
  if (k === '7') menuAction('add:1:sword'); if (k === '8') menuAction('add:1:bow'); if (k === '9') menuAction('add:1:spear');
  if (state.avatar) {
    if (k === 'f') squadCommand('follow');
    if (k === 'g') squadCommand('charge');
    if (k === 't') { mouse.set(0, 0); mouseInside = true; squadCommand('point', groundHit(null)); }
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
document.getElementById('btn-menu').onclick = () => toggleMenu();
const menuPx = (e) => [e.offsetX * (menu.canvas.width / menu.canvas.clientWidth), e.offsetY * (menu.canvas.height / menu.canvas.clientHeight)];
menu.canvas.addEventListener('pointermove', (e) => { const [x, y] = menuPx(e); menu.hover = menu.hit(x, y); });
menu.canvas.addEventListener('pointerleave', () => { menu.hover = -1; });
menu.canvas.addEventListener('click', (e) => { sound.resume(); const [x, y] = menuPx(e); const i = menu.hit(x, y); if (i >= 0) menuAction(menu.buttons[i].act); });
function desktopAvatar(dt) {
  camera.position.set(0, 1.7, 0);
  camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
  const mx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0), mz = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
  if (mx || mz) locomote(mx, mz, dt * (keys.has('shift') ? 1.8 : 1));
}
function resetView() {
  camera.position.set(0.8, 1.7, 1.3);
  tableRoot.position.set(0, 0.85, -0.2); tableRoot.rotation.set(0, 0, 0); tableRoot.scale.setScalar(1);
  controls.target.set(0, 0.85, -0.2); controls.update();
}
resetView();
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
let xrFrames = 0, arMode = false;
async function startXR(mode) {
  try {
    sound.resume();
    if (state.avatar) exitAvatar();
    const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    arMode = mode === 'immersive-ar';
    env.visible = !arMode; scene.background = arMode ? null : SKY; scene.fog = arMode ? null : new THREE.Fog(SKY, 10, 45);
    session.addEventListener('end', () => { if (state.avatar) exitAvatar(); arMode = false; env.visible = true; scene.background = SKY; scene.fog = new THREE.Fog(SKY, 10, 45); document.body.classList.remove('in-xr'); hud.mesh.visible = true; resetView(); });
    await renderer.xr.setSession(session);
    document.body.classList.add('in-xr');
    xrFrames = 0;
    toggleMenu(true);
  } catch (err) { console.error(err); alert('Nie udało się uruchomić sesji XR: ' + err.message); }
}
(async () => {
  const vrBtn = document.getElementById('btn-vr'), arBtn = document.getElementById('btn-ar'), note = document.getElementById('xr-note');
  vrBtn.onclick = () => startXR('immersive-vr'); arBtn.onclick = () => startXR('immersive-ar');
  if (!navigator.xr) { note.textContent = window.isSecureContext ? 'Ta przeglądarka nie obsługuje WebXR — podgląd na komputerze.' : 'WebXR wymaga HTTPS.'; vrBtn.disabled = arBtn.disabled = true; return; }
  const [vr, ar] = await Promise.all([navigator.xr.isSessionSupported('immersive-vr').catch(() => false), navigator.xr.isSessionSupported('immersive-ar').catch(() => false)]);
  vrBtn.disabled = !vr; arBtn.disabled = !ar;
  note.textContent = !vr && !ar ? 'Brak gogli VR — podgląd na komputerze (mysz + klawiatura).' : '';
})();

// ---------- pętla ----------
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
function updateSun() {
  const c = tableRoot.getWorldPosition(tmpV), s = tableRoot.scale.x;
  sun.position.copy(c).addScaledVector(SUN_DIR, 3 * s); sun.target.position.copy(c); sun.target.updateMatrixWorld();
  const cam = sun.shadow.camera, r = 1.1 * s;
  cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 0.3 * s; cam.far = 6 * s;
  cam.updateProjectionMatrix(); sun.shadow.normalBias = 0.0015 * s;
}
function simStep(dt) { army.update(dt, state.started && !state.paused); effects.update(dt); }
function orderText(sq) {
  const o = sq?.order;
  if (sq?.routed) return 'UCIEKA!';
  if (!o) return 'stoi';
  if (o.type === 'move') return 'marsz';
  if (o.type === 'attack') return `atak na ${TYPES[o.squad.type].name.toLowerCase()}`;
  if (o.type === 'follow') return 'za mną';
  return '';
}
const GHOST_COL = { front: new THREE.Color(0xffe08a), back: new THREE.Color(0x9fe8a0), wing: new THREE.Color(0xffa860) };
function selText() {
  const l = selList();
  if (!l.length) return null;
  if (l.length === 1) return `${TYPES[l[0].type].name} (${SIDES[l[0].side].name}) · ${army.alive(l[0]).length} ludzi`;
  return `${l.length} oddziały · ${l.reduce((a, q) => a + army.alive(q).length, 0)} ludzi`;
}
function updateMarkers() {
  const list = state.avatar ? [] : selList();
  selRing.visible = orderLine.visible = targetFlag.visible = false;
  ringPool.forEach((r, i) => {
    const sq = list[i]; r.visible = !!sq;
    if (!sq) { linePool[i].visible = false; return; }
    const [cx, cz] = army.center(sq), rad = Math.max(8, TYPES[sq.type].cols * 1.7 * UNIT_K * 0.7);
    r.position.set(cx, field.heightAt(cx, cz) + 0.5, cz); r.scale.setScalar(rad);
    const o = sq.order, l = linePool[i];
    let tx = null, tz = null;
    if (o?.type === 'move' && !o.reached) { tx = o.x; tz = o.z; } else if (o?.type === 'attack') [tx, tz] = army.center(o.squad);
    l.visible = tx !== null;
    if (l.visible) { l.geometry.setFromPoints([new THREE.Vector3(cx, field.heightAt(cx, cz) + 2, cz), new THREE.Vector3(tx, field.heightAt(tx, tz) + 2, tz)]); l.material.color.setHex(o.type === 'attack' ? 0xff6a5a : 0xffe08a); }
  });
  // zarys szyku w punkcie docelowym (kursor albo przytrzymany spust)
  ghost.count = 0; ghostArrow.visible = false;
  const xr = renderer.xr.isPresenting;
  const cur = state.avatar ? null : xr ? (aimCtrl?.source && !menuHover ? groundHit(aimCtrl) : null) : groundHit(null);
  if (drag && cur) drag.cur = cur.clone();
  const boxing = !!drag && Math.hypot(drag.cur.x - drag.start.x, drag.cur.z - drag.start.z) > BOX_MIN;
  const at = drag ? drag.start : cur;
  if (list.length && at && !boxing) {
    const enemy = soldierAt(at, 5);
    if (!(enemy && state.started && list.every((q) => q.side !== enemy.side))) {
      let facing = aimFacing();
      const m = new THREE.Matrix4(), v = new THREE.Vector3();
      let n = 0;
      for (const a of groupFormation(list, at, facing)) {
        const tmp = { ax: a.x, az: a.z, facing }, col = GHOST_COL[ROLE(a.sq.type)];
        for (const s of army.alive(a.sq)) { if (n >= 2000) break; const [x, z] = army.slotPos(tmp, s); m.makeTranslation(v.set(x, field.heightAt(x, z) + 0.35 * UNIT_K, z)); ghost.setMatrixAt(n, m); ghost.setColorAt(n, col); n++; }
      }
      ghost.count = n; ghost.instanceMatrix.needsUpdate = true; ghost.instanceColor.needsUpdate = true;
      const ax = at.x + Math.sin(facing) * 14, az = at.z + Math.cos(facing) * 14;
      ghostArrow.visible = true; ghostArrow.position.set(ax, field.heightAt(ax, az) + 3 * UNIT_K, az); ghostArrow.rotation.set(0, facing, 0);
    }
  }
  // prostokąt zaznaczania
  boxLine.visible = boxing;
  if (boxLine.visible) {
    const a = drag.start, cur = drag.cur, y = Math.max(field.heightAt(a.x, a.z), field.heightAt(cur.x, cur.z)) + 1.5, pts = boxLine.geometry.attributes.position;
    [[a.x, a.z], [cur.x, a.z], [cur.x, cur.z], [a.x, cur.z], [a.x, a.z]].forEach(([x, z], k) => pts.setXYZ(k, x, y, z));
    pts.needsUpdate = true;
  }
  dragLine.visible = false;
}
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  clockT += dt;
  const xr = renderer.xr.isPresenting;
  controls.enabled = !xr && !state.avatar && !drag;
  if (xr) { xrFrames++; if (xrFrames === 3) placeTable(); pollXRInput(dt); }
  else if (state.avatar) desktopAvatar(dt);
  table.update();
  scene.updateMatrixWorld();
  const menuHit = updateMenuHover();
  const sdt = dt * state.speed, n = Math.ceil(sdt / 0.04);
  for (let i = 0; i < n; i++) simStep(sdt / n);
  updateAvatar(dt);
  updateMarch(dt);
  // oddział gracza: po wykonaniu rozkazu wraca za dowódcą
  if (state.avatar && player && player.sq && !player.sq.routed && (!player.sq.order || (player.sq.order.type === 'move' && player.sq.order.reached && player.sq.order.auto))) army.order(player.sq, { type: 'follow', soldier: player });
  hitT = Math.max(0, hitT - dt);
  hitMark.mesh.visible = hitT > 0;
  if (hitT > 0) hitMark.mesh.scale.setScalar((hitKill ? 1.35 : 1) * (1 + Math.max(0, hitT - 0.12) * 2));
  aimRing.visible = false; let aimDist = 0;
  if (state.avatar && player) {
    const lc = ctrls.find((o) => o.hand === 'left' && o.source);
    const p = xr ? (lc ? groundHit(lc) : null) : (mouse.set(0, 0), mouseInside = true, groundHit(null));
    const t = p && soldierAt(p, 8);
    if (t && t.side !== player.side) {
      const [cx, cz] = army.center(t.sq);
      aimDist = lc ? toWorld(p.clone()).distanceTo(lc.c.getWorldPosition(new THREE.Vector3())) : 0;
      aimRing.visible = true; aimRing.position.set(cx, field.heightAt(cx, cz) + 0.6, cz); aimRing.scale.setScalar(Math.max(8, TYPES[t.sq.type].cols * 1.7 * UNIT_K * 0.7));
    }
  }
  scene.updateMatrixWorld();
  army.lod = state.avatar || tableRoot.scale.x > 12 || (!xr && camera.position.distanceTo(controls.target) < 0.12) ? 'hi' : 'lo';
  army.render(state.avatar ? null : sel, state.avatar);
  updateMarkers();
  // łuk: naciąganie widać po strzale cofanej do twarzy
  if (state.avatar && player?.type === 'bow' && weapons.arrow.visible) weapons.arrow.position.z = drawStart !== null ? Math.min(0.5, (clockT - drawStart) * 0.6) : 0;
  for (const o of ctrls) if (o.source) o.ray.scale.z = menuHit && o === aimCtrl ? menuHit.distance : state.avatar ? (o.hand === 'left' && aimDist ? aimDist : 0.5) : 2;
  if (!state.avatar) updateSun();
  field.glowMaterial.color.setHex(table.active ? 0xffe8b0 : 0xffc860);
  const blue = army.sideAlive(0), red = army.sideAlive(1);
  const status = !state.started ? 'ROZSTAWIANIE' : state.paused ? 'PAUZA' : `${state.speed}× · ${Math.floor(army.time / 60)}:${String(Math.floor(army.time % 60)).padStart(2, '0')}`;
  let m = flash.until > clockT ? flash.text : '';
  if (!m && state.started && army.squads.length && (blue === 0 || red === 0)) m = blue ? 'ZWYCIĘSTWO NIEBIESKICH!' : red ? 'Zwyciężyli czerwoni…' : 'Obie armie poległy';
  const psq = player?.sq;
  hud.draw({
    avatar: state.avatar, status, blue, red,
    blueSq: army.squads.filter((q) => q.side === 0 && army.alive(q).length).length, redSq: army.squads.filter((q) => q.side === 1 && army.alive(q).length).length,
    sel: selText(), order: orderText(state.avatar ? psq : primary()),
    type: player ? TYPES[player.type].name : '', hp: playerHp, squad: psq ? `${army.alive(psq).length} ludzi` : '',
    msg: m, msgColor: flash.until > clockT ? flash.color : '#ffe08a',
  });
  menu.draw({ started: state.started, paused: state.paused, avatar: state.avatar, speed: state.speed });
  if (!xr && !state.avatar) controls.update();
  renderer.render(scene, camera);
});
preset();
window.__med = { simStep, army, state, camera, controls, menuAction, enterAvatar, exitAvatar, THREE, field, get selected() { return primary(); }, set selected(v) { sel = new Set(v ? [v] : []); }, get sel() { return sel; }, set sel(v) { sel = v; }, groupFormation, issueGroup, pointerDown, pointerUp, aimFacing, meleeContact, mapGroup, scene, updateAvatar, get player() { return player; } };
