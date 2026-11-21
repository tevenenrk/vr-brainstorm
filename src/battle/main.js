import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { MAP_SCALE, SEED, TABLE_DEFAULT } from '../config.js';
import { Terrain } from '../terrain.js';
import { Effects, Sound } from '../effects.js';
import { TableManipulator } from '../table.js';
import { CanvasPanel } from '../hud.js';
import { Battle, SIDES } from './army.js';

const params = new URLSearchParams(location.search);
const SHADOWS = params.get('shadows') !== '0';
const TYPES = [['inf', 'Piechota (oddz.)'], ['tank', 'Czołgi'], ['gun', 'Działa']];

// ---------- panele ----------
class BattleHud extends CanvasPanel {
  constructor() { super(640, 400, 0.17); }
  draw(s) {
    const key = JSON.stringify(s);
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx, W = this.canvas.width;
    this.background('rgba(200,200,200,0.6)');
    c.textAlign = 'left'; c.fillStyle = '#eef'; c.font = 'bold 38px system-ui, sans-serif'; c.fillText('BITWA', 30, 54);
    c.textAlign = 'right'; c.font = 'bold 28px system-ui, sans-serif'; c.fillStyle = s.paused ? '#ff8a7a' : '#cfe8ff';
    c.fillText(s.paused ? '❚❚ PAUZA' : `${s.speed}× · ${s.time}`, W - 30, 52);
    c.textAlign = 'left';
    s.sides.forEach((sd, i) => {
      const y = 92 + i * 92;
      c.fillStyle = SIDES[i].css; c.font = 'bold 30px system-ui, sans-serif'; c.fillText(SIDES[i].name, 30, y + 6);
      c.font = '24px system-ui, sans-serif'; c.fillStyle = '#d8dde4';
      c.fillText(`piechota ${sd.inf} · czołgi ${sd.tank} · działa ${sd.gun} · zabici wrogowie ${sd.kills}`, 30, y + 40);
      const tot = Math.max(1, s.sides[0].total + s.sides[1].total);
      c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(30, y + 52, W - 60, 12);
      c.fillStyle = SIDES[i].css; c.fillRect(30, y + 52, (W - 60) * (sd.total / tot), 12);
    });
    c.font = 'bold 30px system-ui, sans-serif'; c.fillStyle = '#ffe08a';
    c.fillText(s.winner ? (s.winner === 'remis' ? 'REMIS — obie armie zniszczone' : `WYGRYWAJĄ: ${s.winner.toUpperCase()}!`) : s.msg || 'Trwa bitwa — obserwuj', 30, 300);
    c.font = '21px system-ui, sans-serif'; c.fillStyle = '#9aa4ae';
    c.fillText('B: menu (siły, posiłki) · A: pauza · prawa gałka ↑↓: tempo', 30, 342);
    c.fillText('Y: nowa bitwa · X: makieta przed siebie · grip: chwyć makietę', 30, 372);
    this.tex.needsUpdate = true;
  }
}
class BattleMenu extends CanvasPanel {
  constructor() { super(760, 900, 0.22); this.buttons = []; this.hover = -1; this.mesh.visible = false; }
  hit(px, py) { return this.buttons.findIndex((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h); }
  draw(o) {
    const key = JSON.stringify([o, this.hover]);
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx;
    this.background('#b8c0cc');
    this.buttons = [];
    const btn = (x, y, w, h, label, act, accent) => {
      const i = this.buttons.length;
      this.buttons.push({ x, y, w, h, act });
      c.fillStyle = this.hover === i ? '#e8eef8' : (accent || '#2e343c');
      this.roundRect(x, y, w, h, 12); c.fill();
      c.fillStyle = this.hover === i ? '#102030' : '#f0f4f8';
      let fs = 24; c.font = `bold ${fs}px system-ui, sans-serif`;
      while (c.measureText(label).width > w - 12 && fs > 12) { fs--; c.font = `bold ${fs}px system-ui, sans-serif`; }
      c.textAlign = 'center'; c.fillText(label, x + w / 2, y + h / 2 + 8); c.textAlign = 'left';
    };
    c.fillStyle = '#eef2f8'; c.font = 'bold 40px system-ui, sans-serif'; c.fillText('BITWA — SKŁAD ARMII', 30, 56);
    let y = 80;
    SIDES.forEach((S, side) => {
      c.fillStyle = S.css; c.font = 'bold 30px system-ui, sans-serif'; c.fillText(S.name + (side === 0 ? ' (bliżej Ciebie)' : ' (daleki koniec)'), 30, y + 30); y += 44;
      for (const [k, name] of TYPES) {
        c.fillStyle = '#e8ecf2'; c.font = '25px system-ui, sans-serif'; c.fillText(name, 30, y + 36);
        btn(290, y, 56, 52, '−', `cfg-:${side}:${k}`);
        c.fillStyle = '#fff'; c.font = 'bold 26px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(String(o.cfg[side][k]), 385, y + 36); c.textAlign = 'left';
        btn(424, y, 56, 52, '+', `cfg+:${side}:${k}`);
        btn(500, y, 230, 52, `Posiłki: +1 ${k === 'inf' ? 'oddział' : k === 'tank' ? 'czołg' : 'działo'}`, `add:${side}:${k}`, side === 0 ? '#28406e' : '#6e2c24');
        y += 60;
      }
      y += 14;
    });
    btn(30, y, 340, 64, 'Nowa bitwa (skład wyżej)', 'start', '#3a5a2a');
    btn(390, y, 340, 64, o.paused ? 'Wznów' : 'Pauza', 'pause'); y += 78;
    c.fillStyle = '#e8ecf2'; c.font = '25px system-ui, sans-serif'; c.fillText('Tempo czasu', 30, y + 38);
    btn(290, y, 56, 52, '−', 'speed-'); c.fillStyle = '#fff'; c.font = 'bold 26px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(`${o.speed}×`, 385, y + 37); c.textAlign = 'left'; btn(424, y, 56, 52, '+', 'speed+');
    btn(500, y, 230, 52, 'Przed siebie', 'place'); y += 70;
    const modes = [['Artyleria', 'index.html'], ['Flak', 'flak.html'], ['Katastrofy', 'disasters.html'], ['Miecze', 'medieval.html'], ['Zamknij', '']];
    modes.forEach(([l, m], i) => btn(30 + i * 142, y, 132, 56, l, m ? 'mode:' + m : 'close', m ? '#2a3a5a' : undefined));
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
const SKY = new THREE.Color(0x232a30);
scene.background = SKY; scene.fog = new THREE.Fog(SKY, 10, 45);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 200);
scene.add(camera);
const env = new THREE.Group();
scene.add(env);
{
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new THREE.Color(0x4a6278) }, bottom: { value: new THREE.Color(0x1a2026) } },
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
const terrain = new Terrain(SEED);
mapGroup.add(terrain.group);
const effects = new Effects(mapGroup, terrain, { fire: 1600, smoke: 2000 });
const sound = new Sound(camera, scene);
const battle = new Battle(terrain, mapGroup, effects);
const table = new TableManipulator(tableRoot);
const hud = new BattleHud(), menu = new BattleMenu();
document.getElementById('hud').appendChild(hud.canvas);
document.getElementById('menu').appendChild(menu.canvas);
const toWorld = (p) => p.clone().applyMatrix4(mapGroup.matrixWorld);
let lastSound = 0, clockT = 0;
battle.onSound = (name, p, vol) => { if (clockT - lastSound < 0.05) return; lastSound = clockT; sound.play(name, toWorld(p), vol); };

const cfg = [{ inf: 6, tank: 3, gun: 3 }, { inf: 6, tank: 3, gun: 3 }];
const SPEEDS = [0.25, 0.5, 1, 2, 4];
let speed = 1, paused = false, flash = { text: '', until: 0 }, menuHover = false;
const msg = (t) => { flash = { text: t, until: clockT + 2.5 }; };
function newBattle() { battle.setup(cfg); effects.clear(); terrain.resetDamage(); msg('Armie ruszają!'); }
function setSpeed(d) { speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + d))]; }
function toggleMenu(v) { const show = v ?? !menu.mesh.visible; menu.mesh.visible = show; hud.mesh.visible = !show; document.getElementById('menu').style.display = show ? 'block' : 'none'; }
function menuAction(act) {
  const [k, a, b] = act.split(':');
  switch (k) {
    case 'cfg-': case 'cfg+': cfg[a][b] = Math.max(0, Math.min(b === 'inf' ? 40 : b === 'tank' ? 30 : 12, cfg[a][b] + (k === 'cfg+' ? 1 : -1))); break;
    case 'add': battle.add(Number(a), b, 1); msg(`Posiłki dla: ${SIDES[a].name}`); break;
    case 'start': newBattle(); toggleMenu(false); break;
    case 'pause': paused = !paused; break;
    case 'speed-': setSpeed(-1); break;
    case 'speed+': setSpeed(1); break;
    case 'place': placeTable(); break;
    case 'close': toggleMenu(false); break;
    case 'mode': location.href = a; break;
    default: break;
  }
}

// ---------- XR ----------
const factory = new XRControllerModelFactory();
const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
let aimCtrl = null;
function attachPanels() {
  const off = ctrls.find((o) => o.source && o !== aimCtrl);
  if (!off) return;
  off.grip.add(hud.mesh); off.grip.add(menu.mesh);
  hud.mesh.position.set(0, 0.075, 0.035); hud.mesh.rotation.set(-0.75, 0, 0);
  menu.mesh.position.set(0, 0.17, -0.01); menu.mesh.rotation.set(-0.55, 0, 0);
}
const raycaster = new THREE.Raycaster();
const ctrls = [0, 1].map((i) => {
  const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
  grip.add(factory.createControllerModel(grip));
  scene.add(c, grip);
  const ray = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  ray.scale.z = 0.6; ray.visible = false; c.add(ray);
  const o = { c, grip, ray, source: null, hand: null, prev: [] };
  c.addEventListener('connected', (e) => { o.source = e.data; o.hand = e.data.handedness; ray.visible = true; if (!aimCtrl || o.hand === 'right') aimCtrl = o; attachPanels(); });
  c.addEventListener('disconnected', () => { o.source = null; ray.visible = false; table.release(grip); if (aimCtrl === o) aimCtrl = ctrls.find((x) => x.source) || null; attachPanels(); });
  c.addEventListener('selectstart', () => { sound.resume(); if (menuHover && menu.hover >= 0) menuAction(menu.buttons[menu.hover].act); else if (!menu.mesh.visible) toggleMenu(true); });
  c.addEventListener('squeezestart', () => table.grab(grip));
  c.addEventListener('squeezeend', () => table.release(grip));
  return o;
});
function pollXRInput(dt) {
  for (const o of ctrls) {
    const gp = o.source?.gamepad;
    if (!gp) continue;
    const pressed = gp.buttons.map((b) => b.pressed);
    const down = (i) => pressed[i] && !o.prev[i];
    const ax = gp.axes[2] || 0, ay = gp.axes[3] || 0;
    if (o.hand === 'right') {
      if (down(4)) paused = !paused;
      if (down(5)) toggleMenu();
      if (Math.abs(ay) > 0.75 && !o.flick) { o.flick = true; setSpeed(ay < 0 ? 1 : -1); }
      if (Math.abs(ay) < 0.35) o.flick = false;
    } else if (o.hand === 'left') {
      if (down(4)) placeTable();
      if (down(5)) newBattle();
      if (Math.abs(ax) > 0.2 || Math.abs(ay) > 0.2) table.nudge(tableRoot.getWorldPosition(new THREE.Vector3()), Math.exp(-ay * dt * 1.4), -ax * dt * 1.6);
    }
    o.prev = pressed;
  }
}
function updateMenuHover() {
  menuHover = false;
  if (!renderer.xr.isPresenting || !menu.mesh.visible || !aimCtrl?.source) return null;
  const o = new THREE.Vector3(), q = new THREE.Quaternion();
  aimCtrl.c.getWorldPosition(o); aimCtrl.c.getWorldQuaternion(q);
  raycaster.set(o, new THREE.Vector3(0, 0, -1).applyQuaternion(q));
  const hit = raycaster.intersectObject(menu.mesh, false)[0];
  if (!hit) { menu.hover = -1; return null; }
  menuHover = true;
  menu.hover = menu.hit(hit.uv.x * menu.canvas.width, (1 - hit.uv.y) * menu.canvas.height);
  return hit;
}
function placeTable() {
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  camera.getWorldPosition(p); camera.getWorldQuaternion(q);
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q); f.y = 0;
  if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
  f.normalize();
  const s = TABLE_DEFAULT.scale;
  tableRoot.scale.setScalar(s);
  const dist = 0.38 + 1.0 * s;
  const y = renderer.xr.isPresenting ? THREE.MathUtils.clamp(p.y - 0.7, 0.5, 1.05) : TABLE_DEFAULT.height;
  tableRoot.position.set(p.x + f.x * dist, y, p.z + f.z * dist);
  tableRoot.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
  if (table.active) table.begin();
}

// ---------- komputer ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minDistance = 0.05; controls.maxDistance = 8;
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ') { paused = !paused; e.preventDefault(); }
  if (k === 'o' || k === 'b') toggleMenu();
  if (k === 'n' || k === 'y') newBattle();
  if (k === '+' || k === '=') setSpeed(1);
  if (k === '-') setSpeed(-1);
  if (k === '1') battle.add(0, 'inf', 1); if (k === '2') battle.add(0, 'tank', 1); if (k === '3') battle.add(0, 'gun', 1);
  if (k === '7') battle.add(1, 'inf', 1); if (k === '8') battle.add(1, 'tank', 1); if (k === '9') battle.add(1, 'gun', 1);
});
document.getElementById('btn-menu').onclick = () => toggleMenu();
const menuPx = (e) => [e.offsetX * (menu.canvas.width / menu.canvas.clientWidth), e.offsetY * (menu.canvas.height / menu.canvas.clientHeight)];
menu.canvas.addEventListener('pointermove', (e) => { const [x, y] = menuPx(e); menu.hover = menu.hit(x, y); });
menu.canvas.addEventListener('pointerleave', () => { menu.hover = -1; });
menu.canvas.addEventListener('click', (e) => { sound.resume(); const [x, y] = menuPx(e); const i = menu.hit(x, y); if (i >= 0) menuAction(menu.buttons[i].act); });
renderer.domElement.addEventListener('pointerdown', () => sound.resume());
function resetView() {
  camera.position.set(0.9, 1.5, 0.2);
  tableRoot.position.set(0, TABLE_DEFAULT.height, -1.18); tableRoot.rotation.set(0, 0, 0); tableRoot.scale.setScalar(TABLE_DEFAULT.scale);
  controls.target.set(0, TABLE_DEFAULT.height, -1.18); controls.update();
}
resetView();
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

let xrFrames = 0;
async function startXR(mode) {
  try {
    sound.resume();
    const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    const ar = mode === 'immersive-ar';
    env.visible = !ar; scene.background = ar ? null : SKY; scene.fog = ar ? null : new THREE.Fog(SKY, 10, 45);
    session.addEventListener('end', () => { env.visible = true; scene.background = SKY; scene.fog = new THREE.Fog(SKY, 10, 45); document.body.classList.remove('in-xr'); hud.mesh.visible = true; resetView(); });
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

const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
function updateSun() {
  const c = tableRoot.getWorldPosition(tmpV), s = tableRoot.scale.x;
  sun.position.copy(c).addScaledVector(SUN_DIR, 3 * s); sun.target.position.copy(c); sun.target.updateMatrixWorld();
  const cam = sun.shadow.camera, r = 1.12 * s;
  cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 0.5 * s; cam.far = 6 * s;
  cam.updateProjectionMatrix(); sun.shadow.normalBias = 0.0015 * s;
}
function simStep(dt) { battle.update(dt); effects.update(dt); terrain.update(); }
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  clockT += dt;
  const xr = renderer.xr.isPresenting;
  controls.enabled = !xr;
  if (xr) { xrFrames++; if (xrFrames === 3) placeTable(); pollXRInput(dt); }
  table.update();
  scene.updateMatrixWorld();
  const menuHit = updateMenuHover();
  if (!paused) {
    const sdt = dt * speed, n = Math.ceil(sdt / 0.05);
    for (let i = 0; i < n; i++) simStep(sdt / n);
  }
  for (const o of ctrls) if (o.source) o.ray.scale.z = menuHit && o === aimCtrl ? menuHit.distance : 0.6;
  updateSun();
  terrain.glowMaterial.color.setHex(table.active ? 0xbff4ff : 0x4fd2ff);
  const t = Math.floor(battle.time);
  hud.draw({
    speed, paused, time: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, winner: battle.winner, msg: flash.until > clockT ? flash.text : '',
    sides: [0, 1].map((s) => ({ inf: battle.count(s, 'inf'), tank: battle.count(s, 'tank'), gun: battle.count(s, 'gun'), total: battle.alive(s), kills: battle.kills[s] })),
  });
  menu.draw({ cfg, speed, paused });
  if (!xr) controls.update();
  renderer.render(scene, camera);
});
newBattle();
window.__battle = { simStep, battle, camera, controls, menuAction, THREE, terrain };
