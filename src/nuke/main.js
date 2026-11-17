import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { Effects, Sound } from '../effects.js';
import { TableManipulator } from '../table.js';
import { CanvasPanel } from '../hud.js';
import { NukeWorld, SIZE, MAP_SCALE } from './world.js';
import { BOMBS, blastParams, shockR, NukeBlast } from './blast.js';

const params = new URLSearchParams(location.search);
const SHADOWS = params.get('shadows') !== '0';
const SPEEDS = [0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15, 40];
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`);

// ---------- panele ----------
class NukeHud extends CanvasPanel {
  constructor() { super(640, 470, 0.17); }
  draw(s) {
    const key = JSON.stringify(s);
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx, W = this.canvas.width;
    this.background('rgba(255,140,90,0.7)');
    c.textAlign = 'left'; c.fillStyle = '#ffe2c4'; c.font = 'bold 34px system-ui, sans-serif'; c.fillText(s.bomb, 30, 52);
    c.textAlign = 'right'; c.font = 'bold 26px system-ui, sans-serif'; c.fillStyle = s.paused ? '#ff8a7a' : '#cfe8ff';
    c.fillText(s.paused ? '❚❚ PAUZA' : `${s.speed}${s.cine ? ' (film)' : ''}`, W - 30, 50);
    c.textAlign = 'left'; c.font = '24px system-ui, sans-serif'; c.fillStyle = '#e0d4c8';
    c.fillText(`${s.yield} · ${s.air ? 'wybuch powietrzny' : 'wybuch naziemny'} · ${s.info}`, 30, 90);
    const rows = [
      ['#ffe36a', 'Kula ognia', s.fb], ['#ff4a3a', '20 psi (zniszczenie)', s.p20], ['#ff9a40', '5 psi (zawalenia)', s.p5],
      ['#ffcf6a', 'Oparzenia III st.', s.th], ['#9fc0e0', '1 psi (szyby)', s.p1], ['#e8e8e8', 'Grzyb (szczyt)', s.cloud],
    ];
    rows.forEach(([col, l, v], i) => { const y = 128 + i * 32; c.fillStyle = col; c.fillRect(30, y - 16, 18, 18); c.fillStyle = '#e8e0d8'; c.font = '23px system-ui, sans-serif'; c.fillText(`${l}: ${v}`, 58, y); });
    c.font = 'bold 28px system-ui, sans-serif'; c.fillStyle = '#ffe08a';
    c.fillText(s.status, 30, 336);
    c.font = '22px system-ui, sans-serif'; c.fillStyle = '#c8bcb0';
    c.fillText(s.detail, 30, 368);
    c.font = '20px system-ui, sans-serif'; c.fillStyle = '#9a9088';
    c.fillText('Spust: wskaż punkt zero · A: detonacja · B: menu', 30, 410);
    c.fillText('Prawa gałka ↑↓: tempo · klik gałki: pauza · Y: odbuduj', 30, 438);
    this.tex.needsUpdate = true;
  }
}
class NukeMenu extends CanvasPanel {
  constructor() { super(720, 900, 0.2); this.buttons = []; this.hover = -1; this.mesh.visible = false; }
  hit(px, py) { return this.buttons.findIndex((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h); }
  draw(o) {
    const key = JSON.stringify([o, this.hover]);
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx;
    this.background('#e07a4c');
    this.buttons = [];
    const btn = (x, y, w, h, label, act, active, accent) => {
      const i = this.buttons.length; this.buttons.push({ x, y, w, h, act });
      c.fillStyle = this.hover === i ? '#ffc8a0' : active ? '#8a3a1a' : (accent || '#3a3230');
      this.roundRect(x, y, w, h, 12); c.fill();
      c.fillStyle = this.hover === i ? '#2a1006' : '#f4ece6';
      let fs = 24; c.font = `bold ${fs}px system-ui, sans-serif`;
      while (c.measureText(label).width > w - 12 && fs > 12) { fs--; c.font = `bold ${fs}px system-ui, sans-serif`; }
      c.textAlign = 'center'; c.fillText(label, x + w / 2, y + h / 2 + 8); c.textAlign = 'left';
    };
    const row = (items, y, h = 56) => { const n = items.length, gap = 10, w = (660 - gap * (n - 1)) / n; items.forEach(([l, a, act, acc], k) => btn(30 + k * (w + gap), y, w, h, l, a, act, acc)); };
    c.fillStyle = '#ffe2c4'; c.font = 'bold 40px system-ui, sans-serif'; c.fillText('BOMBA W SKALI 1:20 000', 30, 56);
    let y = 80;
    for (let r = 0; r < 4; r++) { const items = BOMBS.slice(r * 2, r * 2 + 2).map((b, k) => [`${b.name} · ${b.kt >= 1000 ? b.kt / 1000 + ' Mt' : b.kt + ' kt'}`, 'bomb:' + (r * 2 + k), o.bomb === r * 2 + k]); if (items.length) { row(items, y); y += 66; } }
    row([['Wybuch powietrzny', 'air:1', o.air], ['Wybuch naziemny', 'air:0', !o.air]], y); y += 70;
    row([['DETONACJA', 'detonate', false, '#a01e10'], ['Odbuduj miasto', 'reset', false, '#5a3a2a']], y, 66); y += 80;
    c.fillStyle = '#ffe2c4'; c.font = '26px system-ui, sans-serif'; c.fillText('Tempo czasu', 30, y + 37);
    btn(250, y, 60, 54, '−', 'speed-'); c.fillStyle = '#fff'; c.font = 'bold 26px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(`${o.speed}×`, 370, y + 37); c.textAlign = 'left'; btn(430, y, 60, 54, '+', 'speed+');
    btn(510, y, 180, 54, o.paused ? 'Wznów' : 'Pauza', 'pause'); y += 68;
    row([[`Tryb filmowy: ${o.cine ? 'wł.' : 'wył.'}`, 'cine', o.cine], [`Strefy zniszczeń: ${o.rings ? 'wł.' : 'wył.'}`, 'rings', o.rings]], y); y += 70;
    row([['Przed siebie', 'place'], ['Zamknij', 'close']], y); y += 66;
    row([['Artyleria', 'mode:index.html', false, '#2a3a5a'], ['Bitwa', 'mode:battle.html', false, '#2a3a5a'], ['Katastrofy', 'mode:disasters.html', false, '#5a3a1a'], ['Flak', 'mode:flak.html', false, '#3a4a1a']], y); y += 76;
    c.font = '20px system-ui, sans-serif'; c.fillStyle = '#ffe2c4';
    ['Tryb filmowy sam zwalnia błysk i kulę ognia (nawet 50×)', 'i przyspiesza wznoszenie grzyba (kilka minut realnie).', 'Wartości są przybliżone (wzory skalujące, rząd wielkości).'].forEach((l, i) => c.fillText(l, 30, y + i * 26));
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
const SKY = new THREE.Color(0x26303a);
scene.background = SKY.clone(); scene.fog = new THREE.Fog(SKY.clone(), 12, 50);
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
const hemi = new THREE.HemisphereLight(0xe4f0ff, 0x4a3c28, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
const SUN_DIR = new THREE.Vector3(0.45, 1, 0.35).normalize();
sun.castShadow = SHADOWS; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);
const tableRoot = new THREE.Group();
scene.add(tableRoot);
const mapGroup = new THREE.Group();
mapGroup.scale.setScalar(MAP_SCALE);
tableRoot.add(mapGroup);
const world = new NukeWorld();
mapGroup.add(world.group);
const effects = new Effects(mapGroup, world, { fire: 1200, smoke: 1600 });
const sound = new Sound(camera, scene);
const table = new TableManipulator(tableRoot);
const hud = new NukeHud(), menu = new NukeMenu();
document.getElementById('hud').appendChild(hud.canvas);
document.getElementById('menu').appendChild(menu.canvas);
const toWorld = (p) => p.clone().applyMatrix4(mapGroup.matrixWorld);

// podziałka 10 km przy bliższej krawędzi
{
  const bar = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  bar.add(new THREE.Mesh(new THREE.BoxGeometry(10000, 30, 120), m));
  for (let k = 0; k <= 10; k++) { const t = new THREE.Mesh(new THREE.BoxGeometry(40, 30, k % 5 ? 220 : 420), m); t.position.x = -5000 + k * 1000; bar.add(t); }
  bar.position.set(-SIZE / 2 + 6500, 10, SIZE / 2 + 700);
  const lbl = new CanvasPanel(256, 64, 3200);
  const c = lbl.ctx; c.fillStyle = '#fff'; c.font = 'bold 44px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('10 km', 128, 48); lbl.tex.needsUpdate = true;
  lbl.mesh.rotation.x = -Math.PI / 2; lbl.mesh.position.set(0, 20, 1100); lbl.mesh.material.depthWrite = false;
  bar.add(lbl.mesh);
  mapGroup.add(bar);
}

// strefy zniszczeń (pierścienie na ziemi)
const RING_COLORS = [0xffe36a, 0xff4a3a, 0xff9a40, 0xffcf6a, 0x9fc0e0];
const rings = RING_COLORS.map((col) => {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 160).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const f = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.07, depthWrite: false, toneMapped: false }));
  m.add(f); m.renderOrder = 4; mapGroup.add(m); return m;
});
const gzMark = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 3000, 12).translate(0, 1500, 0), new THREE.MeshBasicMaterial({ color: 0xff5030, transparent: true, opacity: 0.6, toneMapped: false }));
mapGroup.add(gzMark);

// ---------- stan ----------
const state = { bomb: 0, air: true, speed: 5, cine: true, paused: false, rings: true };
let gz = new THREE.Vector3(0, world.surfaceAt(0, 0), 0);
let blast = null, damagePtr = 0, sorted = null, flash = { text: '', until: 0 }, clockT = 0, menuHover = false, fires = 0;
const P = () => blastParams(BOMBS[state.bomb].kt, state.air);
const msg = (t) => { flash = { text: t, until: clockT + 2.5 }; };

function detonate() {
  sound.resume();
  if (blast) resetCity();
  const p = P();
  blast = new NukeBlast(mapGroup, gz, p, world, effects);
  sorted = world.buildings.map((b) => ({ b, d: Math.hypot(b.x - gz.x, b.z - gz.z) })).sort((a, b) => a.d - b.d);
  damagePtr = 0; fires = 0;
  if (state.cine) state.speed = 1;
  sound.play('nuke', toWorld(gz), 3);
  for (const o of ctrls) pulse(o, 1, 800);
}
function resetCity() {
  if (blast) { blast.dispose(); blast = null; }
  effects.clear(); world.reset();
}
function toggleMenu(v) { const show = v ?? !menu.mesh.visible; menu.mesh.visible = show; hud.mesh.visible = !show; document.getElementById('menu').style.display = show ? 'block' : 'none'; }
function setSpeed(d) { state.cine = false; state.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(nearestSpeed(state.speed)) + d))]; }
function nearestSpeed(v) { return SPEEDS.reduce((a, b) => (Math.abs(Math.log(b / v)) < Math.abs(Math.log(a / v)) ? b : a)); }
function menuAction(act) {
  const [k, v] = act.split(':');
  switch (k) {
    case 'bomb': state.bomb = Number(v); break;
    case 'air': state.air = v === '1'; break;
    case 'detonate': detonate(); toggleMenu(false); break;
    case 'reset': resetCity(); msg('Miasto odbudowane'); break;
    case 'speed-': setSpeed(-1); break;
    case 'speed+': setSpeed(1); break;
    case 'pause': state.paused = !state.paused; break;
    case 'cine': state.cine = !state.cine; break;
    case 'rings': state.rings = !state.rings; break;
    case 'place': placeTable(); break;
    case 'close': toggleMenu(false); break;
    case 'mode': location.href = v; break;
    default: break;
  }
}

// tempo w trybie filmowym: zwolnione przy błysku, normalne przy fali, przyspieszone przy grzybie
function cineSpeed(p, t) {
  const tf = p.tFb;
  if (t < tf * 3) return Math.max(0.02, (tf * 3) / 14);
  const tShock = tf + (p.psi1 - p.fireball) / 340;
  if (t < tShock) return Math.max(0.5, (tShock - tf * 3) / 12);
  return Math.max(4, (p.tauC * 4) / 25);
}

// ---------- XR ----------
const factory = new XRControllerModelFactory();
const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
let aimCtrl = null, aim = null;
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
  const o = { c, grip, ray, source: null, hand: null, prev: [] };
  c.addEventListener('connected', (e) => { o.source = e.data; o.hand = e.data.handedness; ray.visible = true; if (!aimCtrl || o.hand === 'right') aimCtrl = o; attachPanels(); });
  c.addEventListener('disconnected', () => { o.source = null; ray.visible = false; table.release(grip); if (aimCtrl === o) aimCtrl = ctrls.find((x) => x.source) || null; attachPanels(); });
  c.addEventListener('selectstart', () => onTrigger());
  c.addEventListener('squeezestart', () => table.grab(grip));
  c.addEventListener('squeezeend', () => table.release(grip));
  return o;
});
function onTrigger() {
  sound.resume();
  if (menuHover && menu.hover >= 0) { menuAction(menu.buttons[menu.hover].act); return; }
  if (aim) { gz.copy(aim); msg(`Punkt zero ustawiony — A / Spacja: detonacja`); }
}
function pollXRInput(dt) {
  for (const o of ctrls) {
    const gp = o.source?.gamepad;
    if (!gp) continue;
    const pressed = gp.buttons.map((b) => b.pressed);
    const down = (i) => pressed[i] && !o.prev[i];
    const ax = gp.axes[2] || 0, ay = gp.axes[3] || 0;
    if (o.hand === 'right') {
      if (down(4)) detonate();
      if (down(5)) toggleMenu();
      if (down(3)) state.paused = !state.paused;
      if (Math.abs(ay) > 0.75 && !o.flick) { o.flick = true; setSpeed(ay < 0 ? 1 : -1); }
      if (Math.abs(ay) < 0.35) o.flick = false;
    } else if (o.hand === 'left') {
      if (down(4)) placeTable();
      if (down(5)) resetCity();
      if (Math.abs(ax) > 0.2 || Math.abs(ay) > 0.2) table.nudge(aim ? toWorld(aim) : tableRoot.getWorldPosition(new THREE.Vector3()), Math.exp(-ay * dt * 1.4), -ax * dt * 1.6);
    }
    o.prev = pressed;
  }
}
function aimRay(o, d) {
  if (renderer.xr.isPresenting) {
    if (!aimCtrl?.source) return false;
    aimCtrl.c.getWorldPosition(o); d.set(0, 0, -1).applyQuaternion(aimCtrl.c.getWorldQuaternion(new THREE.Quaternion()));
    return true;
  }
  if (!mouseInside) return false;
  raycaster.setFromCamera(mouse, camera); o.copy(raycaster.ray.origin); d.copy(raycaster.ray.direction);
  return true;
}
function computeAim() {
  const o = new THREE.Vector3(), d = new THREE.Vector3();
  if (!aimRay(o, d)) return null;
  const inv = mapGroup.matrixWorld.clone().invert();
  return world.raycast(o.applyMatrix4(inv), d.transformDirection(inv));
}
function updateMenuHover() {
  menuHover = false;
  if (!renderer.xr.isPresenting || !menu.mesh.visible) return null;
  const o = new THREE.Vector3(), d = new THREE.Vector3();
  if (!aimRay(o, d)) return null;
  raycaster.set(o, d);
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
  tableRoot.scale.setScalar(1);
  const dist = 0.35 + (SIZE * MAP_SCALE) / 2;
  const y = renderer.xr.isPresenting ? THREE.MathUtils.clamp(p.y - 0.8, 0.45, 0.9) : 0.75;
  tableRoot.position.set(p.x + f.x * dist, y, p.z + f.z * dist);
  tableRoot.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
  if (table.active) table.begin();
}

// ---------- komputer ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minDistance = 0.05; controls.maxDistance = 10;
const mouse = new THREE.Vector2();
let mouseInside = false, downAt = null;
renderer.domElement.addEventListener('pointermove', (e) => { mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); mouseInside = true; });
renderer.domElement.addEventListener('pointerleave', () => { mouseInside = false; });
renderer.domElement.addEventListener('pointerdown', (e) => { sound.resume(); downAt = { x: e.clientX, y: e.clientY, b: e.button }; });
renderer.domElement.addEventListener('pointerup', (e) => { if (downAt && downAt.b === 0 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) { aim = computeAim(); onTrigger(); } downAt = null; });
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ') { detonate(); e.preventDefault(); }
  if (k >= '1' && k <= '7') state.bomb = Number(k) - 1;
  if (k === 'p') state.paused = !state.paused;
  if (k === 'c') state.cine = !state.cine;
  if (k === 'g') state.air = !state.air;
  if (k === 'r') resetCity();
  if (k === 'o' || k === 'b') toggleMenu();
  if (k === '+' || k === '=') setSpeed(1);
  if (k === '-') setSpeed(-1);
});
document.getElementById('btn-menu').onclick = () => toggleMenu();
const menuPx = (e) => [e.offsetX * (menu.canvas.width / menu.canvas.clientWidth), e.offsetY * (menu.canvas.height / menu.canvas.clientHeight)];
menu.canvas.addEventListener('pointermove', (e) => { const [x, y] = menuPx(e); menu.hover = menu.hit(x, y); });
menu.canvas.addEventListener('pointerleave', () => { menu.hover = -1; });
menu.canvas.addEventListener('click', (e) => { const [x, y] = menuPx(e); const i = menu.hit(x, y); if (i >= 0) menuAction(menu.buttons[i].act); });
function resetView() {
  camera.position.set(1.4, 1.9, 1.5);
  tableRoot.position.set(0, 0.75, -0.6); tableRoot.rotation.set(0, 0, 0); tableRoot.scale.setScalar(1);
  controls.target.set(0, 1.0, -0.6); controls.update();
}
resetView();
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
let xrFrames = 0;
async function startXR(mode) {
  try {
    sound.resume();
    const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    const ar = mode === 'immersive-ar';
    env.visible = !ar; scene.background = ar ? null : SKY.clone(); scene.fog = ar ? null : new THREE.Fog(SKY.clone(), 12, 50);
    session.addEventListener('end', () => { env.visible = true; scene.background = SKY.clone(); scene.fog = new THREE.Fog(SKY.clone(), 12, 50); document.body.classList.remove('in-xr'); hud.mesh.visible = true; resetView(); });
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
  const cam = sun.shadow.camera, r = 1.5 * s;
  cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 0.3 * s; cam.far = 8 * s;
  cam.updateProjectionMatrix(); sun.shadow.normalBias = 0.0015 * s;
}
function simStep(sdt, dt) {
  if (!blast) return;
  const p = blast.p;
  const r = blast.update(sdt, dt);
  // zniszczenia, gdy fala mija budynki
  let changed = false;
  while (damagePtr < sorted.length && sorted[damagePtr].d < r.sr) {
    const { b, d } = sorted[damagePtr++];
    b.state = d < p.psi20 ? 3 : d < p.psi5 ? 2 : d < p.psi1 ? 1 : 0;
    if (d < p.thermal) b.burnt = true;
    world.placeBuilding(b); changed = true;
  }
  if (!blast.burnt && blast.t > p.tFb) {
    blast.burnt = true;
    for (const { b, d } of sorted) { if (d < p.thermal && b.state === 0) { b.burnt = true; world.placeBuilding(b); changed = true; } }
    world.scorch(gz.x, gz.z, Math.min(p.thermal, SIZE), 0.55);
  }
  if (changed) { world.city.instanceMatrix.needsUpdate = true; world.city.instanceColor.needsUpdate = true; }
  // pożary w strefie termicznej
  if (blast.burnt && blast.t < p.tauC * 6) {
    for (let k = 0; k < 3; k++) {
      const s = sorted[(Math.random() * sorted.length) | 0];
      if (!s || s.d > p.thermal || s.d < p.fireball) continue;
      const pt = new THREE.Vector3(s.b.x, s.b.y + s.b.h * 0.3, s.b.z);
      effects.fire.spawn({ p: pt, v: new THREE.Vector3(0, 20, 0), life: Math.max(2, p.tauC * 0.2), s0: 60, s1: 20, c0: 0xff9a40, c1: 0x200000, drag: 0.9 });
      if (Math.random() < 0.1) effects.smoke.spawn({ p: pt.clone().add(new THREE.Vector3(0, 150, 0)), v: new THREE.Vector3(30, 50, 0), life: p.tauC, s0: 40, s1: 170, c0: 0x5a5450, c1: 0x9a9690, drag: 0.98 });
    }
  }
  effects.update(sdt);
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  clockT += dt;
  const xr = renderer.xr.isPresenting;
  controls.enabled = !xr;
  if (xr) { xrFrames++; if (xrFrames === 3) placeTable(); pollXRInput(dt); }
  table.update();
  scene.updateMatrixWorld();
  const menuHit = updateMenuHover();
  aim = computeAim();
  const p = blast ? blast.p : P();
  if (blast && state.cine && !state.paused) state.speed = cineSpeed(p, blast.t);
  if (!state.paused) simStep(dt * state.speed, dt);
  // błysk rozjaśnia całą scenę
  const fl = blast ? blast.flashK : 0;
  hemi.intensity = 1.6 * (1 + 12 * fl * fl);
  sun.intensity = 2.6 * (1 + 3 * fl);
  // strefy zniszczeń
  const radii = [p.fireball, p.psi20, p.psi5, p.thermal, p.psi1];
  rings.forEach((m, i) => { m.visible = state.rings; m.position.set(gz.x, world.surfaceAt(gz.x, gz.z) + 40 + i * 5, gz.z); m.scale.setScalar(radii[i]); });
  gzMark.visible = !blast;
  gzMark.position.copy(gz);
  for (const o of ctrls) if (o.source) o.ray.scale.z = menuHit && o === aimCtrl ? menuHit.distance : 1.5;
  updateSun();
  world.glowMaterial.color.setHex(table.active ? 0xffd0b0 : 0xff7040);
  const b = BOMBS[state.bomb];
  const t = blast ? blast.t : 0;
  hud.draw({
    bomb: b.name, yield: b.kt >= 1000 ? `${b.kt / 1000} Mt` : `${b.kt} kt`, info: b.info, air: state.air,
    speed: state.speed < 1 ? `${state.speed.toFixed(state.speed < 0.1 ? 2 : 1)}× (zwolnione)` : `${Math.round(state.speed * 10) / 10}×`, cine: state.cine, paused: state.paused,
    fb: `Ø ${km(p.fireball * 2)}`, p20: km(p.psi20), p5: km(p.psi5), th: km(p.thermal), p1: km(p.psi1), cloud: `${km(p.cloudTop)} (Ø czapy ${km(p.capR * 2)})`,
    status: blast ? `${blast.phase} · t = ${t < 10 ? t.toFixed(2) : Math.round(t)} s` : (flash.until > clockT ? flash.text : 'Wskaż punkt zero i zdetonuj'),
    detail: blast ? `fala: ${km(shockR(p, t))} · chmura: ${km(blast.top(t))} · zniszczone budynki: ${world.buildings.filter((x) => x.state >= 2).length}` : `Wysokość wybuchu: ${km(p.burstH)} · miasto: ${world.buildings.length} budynków`,
  });
  menu.draw({ bomb: state.bomb, air: state.air, speed: Math.round(state.speed * 100) / 100, paused: state.paused, cine: state.cine, rings: state.rings });
  if (!xr) controls.update();
  renderer.render(scene, camera);
});
window.__nuke = { simStep, detonate, resetCity, state, world, camera, controls, menuAction, THREE, get blast() { return blast; } };
