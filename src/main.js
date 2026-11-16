import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import {
  MAP_SCALE, LETHAL_RADIUS, TABLE_DEFAULT, SHADOWS, SEED, OPTS, saveOpts, shellTimeScale,
  ANGLE_MIN, ANGLE_MAX, GUNS_MAX, CRATER, AMMO, AMMO_ORDER, ammoKey, NUKE,
} from './config.js';
import { Terrain } from './terrain.js';
import { Effects, Sound, shockRadius } from './effects.js';
import { Battery } from './artillery.js';
import { Enemies } from './enemies.js';
import { TableManipulator } from './table.js';
import { Hud, Menu } from './hud.js';

// ---------- renderer / scena ----------
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
const SKY = new THREE.Color(0x1d262c);
const makeFog = () => new THREE.Fog(0x1d262c, 10, 45);
scene.background = SKY;
scene.fog = makeFog();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 200);
scene.add(camera);

// otoczenie (ukrywane w trybie MR/passthrough)
const env = new THREE.Group();
scene.add(env);
{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3a5a78) }, bottom: { value: new THREE.Color(0x1a2026) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = smoothstep(-0.1, 0.6, vP.y); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
  });
  env.add(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), skyMat));
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#2a2f2c'; c.fillRect(0, 0, 256, 256);
  c.strokeStyle = '#3d4540'; c.lineWidth = 3; c.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(24, 24);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(24, 64), new THREE.MeshLambertMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  env.add(floor);
}

const hemi = new THREE.HemisphereLight(0xe4f0ff, 0x4a3c28, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
const SUN_DIR = new THREE.Vector3(0.45, 1, 0.35).normalize();
sun.castShadow = SHADOWS;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

// ---------- lewitująca platforma ze światem w miniaturze ----------
const tableRoot = new THREE.Group();
scene.add(tableRoot);
const mapGroup = new THREE.Group();
mapGroup.scale.setScalar(MAP_SCALE);
tableRoot.add(mapGroup);

const terrain = new Terrain(SEED);
mapGroup.add(terrain.group);
const effects = new Effects(mapGroup, terrain);
const sound = new Sound(camera, scene);
const battery = new Battery(terrain, mapGroup, effects);
const enemies = new Enemies(terrain, mapGroup);
const table = new TableManipulator(tableRoot);

const hud = new Hud();
const menu = new Menu();
document.getElementById('hud').appendChild(hud.canvas);
document.getElementById('menu').appendChild(menu.canvas);

function placeTable() {
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  camera.getWorldPosition(p); camera.getWorldQuaternion(q);
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q); f.y = 0;
  if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
  f.normalize();
  const s = TABLE_DEFAULT.scale;
  tableRoot.scale.setScalar(s);
  const dist = 0.38 + 1.0 * s;
  const y = renderer.xr.isPresenting ? THREE.MathUtils.clamp(p.y - 0.65, 0.5, 1.1) : TABLE_DEFAULT.height;
  tableRoot.position.set(p.x + f.x * dist, y, p.z + f.z * dist);
  tableRoot.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
  if (table.active) table.begin();
}

// ---------- stan gry ----------
let gameOver = false;
let flash = { text: '', until: 0, color: '#ffe9a0' };
let aim = null;          // punkt na terenie, w który celuje promień
let lock = null;         // zablokowany cel: {type:'point',p} lub obszar {type:'area',x0,x1,z0,z1}
let drawing = null;      // wyznaczanie obszaru w toku
let lastTrig = -10;
let clockT = 0;
let menuHover = false;
let optsDirty = 0;
let flashLight = 0;      // błysk atomowy rozjaśnia scenę
const nukes = [];        // trwające fale uderzeniowe

function showFlash(text, dur = 2, color = '#ffe9a0') { flash = { text, until: clockT + dur, color }; }

function newGame() {
  enemies.reset();
  battery.reset();
  effects.clear();
  terrain.resetDamage();
  gameOver = false;
  lock = null;
  nukes.length = 0;
  showFlash('Nowa gra — pierwsza fala za chwilę', 2.5);
}

function currentSpec() {
  if (lock) return lock;
  return aim ? { type: 'point', p: aim.local } : null;
}

function rectOf(d) {
  return {
    x0: Math.min(d.start.x, d.cur.x), x1: Math.max(d.start.x, d.cur.x),
    z0: Math.min(d.start.z, d.cur.z), z1: Math.max(d.start.z, d.cur.z),
  };
}

function startArea() {
  aim = computeAim();
  if (aim) drawing = { start: aim.local.clone(), cur: aim.local.clone() };
  else drawing = null;
}

function endArea() {
  const hadArea = lock && lock.type === 'area';
  if (!drawing) { if (hadArea) { lock = null; showFlash('Obszar usunięty', 1.5); } return; }
  const r = rectOf(drawing);
  drawing = null;
  if (r.x1 - r.x0 < 25 && r.z1 - r.z0 < 25) {
    if (hadArea) { lock = null; showFlash('Obszar usunięty', 1.5); }
    return;
  }
  lock = { type: 'area', ...r };
  showFlash(`Obszar ostrzału ${Math.round(r.x1 - r.x0)} × ${Math.round(r.z1 - r.z0)} m`, 2, '#cfe8ff');
}

function toggleLock() {
  if (lock) { lock = null; showFlash('Cel odblokowany', 1.2, '#cfe8ff'); }
  else if (aim) { lock = { type: 'point', p: aim.local.clone() }; showFlash('Cel zablokowany', 1.2, '#cfe8ff'); }
}

function setAngle(a) {
  OPTS.angle = THREE.MathUtils.clamp(a, ANGLE_MIN, ANGLE_MAX);
  optsDirty = 1;
}

function setAmmo(i) {
  OPTS.ammo = (i + AMMO_ORDER.length) % AMMO_ORDER.length;
  saveOpts();
  const a = AMMO[ammoKey()];
  showFlash(`Amunicja: ${a.name}`, 1.5, a.color);
}

function nextWave() {
  if (gameOver) return;
  enemies.startWave();
  showFlash(`Wysłano falę ${enemies.wave}!`, 1.5, '#ffb4a8');
}

function toggleMenu(v) {
  const show = v ?? !menu.mesh.visible;
  menu.mesh.visible = show;
  hud.mesh.visible = !show;
  document.getElementById('menu').style.display = show ? 'block' : 'none';
}

function menuAction(act) {
  const clamp = THREE.MathUtils.clamp;
  switch (act) {
    case 'guns-': case 'guns+':
      OPTS.guns = clamp(OPTS.guns + (act.endsWith('+') ? 1 : -1), 1, GUNS_MAX);
      battery.setGunCount(OPTS.guns);
      break;
    case 'reload-': case 'reload+':
      OPTS.reload = clamp(OPTS.reload + (act.endsWith('+') ? 0.5 : -0.5), 1, 20); break;
    case 'angle-': case 'angle+':
      setAngle(Math.round(OPTS.angle / 5) * 5 + (act.endsWith('+') ? 5 : -5)); break;
    case 'speed-': case 'speed+':
      OPTS.speed = clamp(OPTS.speed + (act.endsWith('+') ? 0.25 : -0.25), 0.25, 3); break;
    case 'diff-': case 'diff+':
      OPTS.difficulty = clamp(OPTS.difficulty + (act.endsWith('+') ? 1 : -1), 0, 3); break;
    case 'ammo-': case 'ammo+': setAmmo(OPTS.ammo + (act.endsWith('+') ? 1 : -1)); break;
    case 'wave': nextWave(); break;
    case 'new': newGame(); toggleMenu(false); break;
    case 'place': placeTable(); break;
    case 'close': toggleMenu(false); break;
    default: break;
  }
  saveOpts();
}

function onTrigger() {
  sound.resume();
  if (menuHover && menu.hover >= 0) { menuAction(menu.buttons[menu.hover].act); return; }
  if (gameOver) { showFlash('Koniec gry — Y / N: nowa gra', 2, '#ff8a7a'); return; }
  if (battery.continuous) { battery.continuous = false; lastTrig = -10; showFlash('Ogień ciągły: STOP', 1.2); return; }
  if (clockT - lastTrig < 0.4) { battery.continuous = true; lastTrig = -10; showFlash('OGIEŃ CIĄGŁY', 1.5, '#ff8a7a'); return; }
  lastTrig = clockT;
  const spec = currentSpec();
  if (!spec) return;
  if (battery.fire(spec) === 0) {
    if (ammoKey() === 'nuke' && battery.nukeCooldown > 0) showFlash(`Atomówka gotowa za ${Math.ceil(battery.nukeCooldown)} s`, 1.2, '#ff8a7a');
    else showFlash('Działa się ładują…', 1, '#e8a040');
  }
}

const toWorld = (pLocal) => pLocal.clone().applyMatrix4(mapGroup.matrixWorld);

battery.onFire = (muzzle) => {
  sound.play('gun', toWorld(muzzle), 0.6);
  pulse(aimCtrl, 0.6, 60);
};
function houseLosses(houses) {
  for (const { v, h } of houses) {
    effects.addSmoker(new THREE.Vector3(h.x, h.y + 6, h.z), 30);
    if (v.home) showFlash('Trafiłeś własny dom!', 2, '#ff8a7a');
  }
}
function killFlash(k) {
  if (k > 0) showFlash(k === 1 ? 'Trafiony 1 cel' : `Trafionych: ${k}!`, 1.8, '#ffb4a8');
}

battery.onBurst = (p) => {
  effects.airburst(p);
  sound.play('pop', toWorld(p), 0.6);
};
battery.onImpact = (p, water, ammo = 'he', first = false) => {
  if (ammo === 'bomblet') {
    effects.miniExplosion(p, water);
    if (!water) { terrain.scorchColors(p.x, p.z, 11); terrain.crater(p.x, p.z, 6, 1.6); }
    houseLosses(terrain.burn(p.x, p.z, 0, 8));
    killFlash(enemies.blast(p, 17, 5, 9));
    if (first || Math.random() < 0.25) sound.play('pop', toWorld(p), 0.5);
    return;
  }
  if (ammo === 'nuke') {
    effects.nuke(p);
    if (!water) terrain.crater(p.x, p.z, NUKE.crater, NUKE.craterDepth);
    terrain.scorchColors(p.x, p.z, NUKE.trees);
    nukes.push({ p: p.clone(), t: 0, r: 0 });
    flashLight = 1;
    sound.play('nuke', toWorld(p), 2.5);
    for (const o of ctrls) pulse(o, 1, 600);
    showFlash('UDERZENIE ATOMOWE', 3, '#ff5050');
    return;
  }
  if (ammo === 'fire') {
    effects.explosion(p, water);
    if (!water) {
      effects.incendiary(p, AMMO.fire.radius, AMMO.fire.burnTime);
      terrain.scorchColors(p.x, p.z, AMMO.fire.radius * 1.1);
      terrain.crater(p.x, p.z, 9, 2);
    }
    houseLosses(terrain.burn(p.x, p.z, 0, AMMO.fire.radius * 0.8));
    killFlash(enemies.blast(p, 20, 6, 14));
    sound.play(water ? 'splash' : 'boom', toWorld(p), 0.8);
    return;
  }
  effects.explosion(p, water);
  houseLosses(terrain.scorch(p.x, p.z, LETHAL_RADIUS * 0.8));
  if (!water) terrain.crater(p.x, p.z);
  killFlash(enemies.blast(p, LETHAL_RADIUS));
  sound.play(water ? 'splash' : 'boom', toWorld(p), 1);
  for (const o of ctrls) pulse(o, 0.2, 35);
};
enemies.onTankDestroyed = (s) => {
  const p = new THREE.Vector3(s.x, terrain.heightAt(s.x, s.z) + 6, s.z);
  effects.burst(p);
  effects.addSmoker(p, 25);
};
enemies.onHouseDestroyed = (h) => {
  const p = new THREE.Vector3(h.x, h.y + 6, h.z);
  effects.burst(p);
  effects.addSmoker(p, 40);
  sound.play('boom', toWorld(p), 0.5);
  showFlash('Wróg podpalił dom we wiosce!', 2, '#ff8a7a');
};

// ---------- kontrolery XR ----------
const factory = new XRControllerModelFactory();
const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
let aimCtrl = null;

function pulse(o, intensity, ms) {
  const act = o?.source?.gamepad?.hapticActuators?.[0];
  if (act && act.pulse) act.pulse(intensity, ms).catch?.(() => {});
}

function attachPanels() {
  const off = ctrls.find((o) => o.source && o !== aimCtrl);
  if (!off) return;
  off.grip.add(hud.mesh);
  off.grip.add(menu.mesh);
  hud.mesh.position.set(0, 0.075, 0.035); hud.mesh.rotation.set(-0.75, 0, 0);
  menu.mesh.position.set(0, 0.15, -0.01); menu.mesh.rotation.set(-0.55, 0, 0);
}

const ctrls = [0, 1].map((i) => {
  const c = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  grip.add(factory.createControllerModel(grip));
  scene.add(c, grip);
  const ray = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  ray.scale.z = 2; ray.visible = false;
  c.add(ray);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  tip.visible = false;
  scene.add(tip);
  const o = { c, grip, ray, tip, source: null, hand: null, prev: [] };
  c.addEventListener('connected', (e) => {
    o.source = e.data; o.hand = e.data.handedness; ray.visible = true;
    if (!aimCtrl || o.hand === 'right') aimCtrl = o;
    attachPanels();
  });
  c.addEventListener('disconnected', () => {
    o.source = null; ray.visible = false; tip.visible = false;
    table.release(grip);
    if (aimCtrl === o) aimCtrl = ctrls.find((x) => x.source) || null;
    attachPanels();
  });
  c.addEventListener('selectstart', () => {
    if (!(menuHover && menu.hover >= 0) && aimCtrl !== o) { aimCtrl = o; attachPanels(); aim = computeAim(); }
    onTrigger();
  });
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
    const up = (i) => !pressed[i] && o.prev[i];
    const ax = gp.axes[2] || 0, ay = gp.axes[3] || 0;
    if (o.hand === 'right') {
      if (down(4)) startArea();
      if (up(4)) endArea();
      if (down(5)) toggleMenu();
      if (down(3)) toggleLock();
      if (Math.abs(ay) > 0.25 && Math.abs(ax) < 0.6) setAngle(OPTS.angle - ay * dt * 25);
      // prawa gałka w bok: zmiana amunicji (pojedyncze pchnięcie)
      if (Math.abs(ax) > 0.75 && Math.abs(ay) < 0.5 && !o.flick) { o.flick = true; setAmmo(OPTS.ammo + (ax > 0 ? 1 : -1)); }
      if (Math.abs(ax) < 0.35) o.flick = false;
    } else if (o.hand === 'left') {
      if (down(4)) placeTable();
      if (down(5)) nextWave();
      if (Math.abs(ax) > 0.2 || Math.abs(ay) > 0.2) {
        const pivot = aim ? aim.world : tableRoot.getWorldPosition(new THREE.Vector3());
        table.nudge(pivot, Math.exp(-ay * dt * 1.4), -ax * dt * 1.6);
      }
    }
    o.prev = pressed;
  }
}

// ---------- komputer: mysz + klawiatura ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 0.05;
controls.maxDistance = 8;
const mouse = new THREE.Vector2();
let mouseInside = false;
let downAt = null;
const raycaster = new THREE.Raycaster();
renderer.domElement.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  mouseInside = true;
});
renderer.domElement.addEventListener('pointerleave', () => { mouseInside = false; });
renderer.domElement.addEventListener('pointerdown', (e) => {
  sound.resume();
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  mouseInside = true;
  if (e.shiftKey && e.button === 0) { controls.enabled = false; startArea(); downAt = null; return; }
  downAt = { x: e.clientX, y: e.clientY, b: e.button };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (drawing) { endArea(); return; }
  if (downAt && downAt.b === 0 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) { aim = computeAim(); onTrigger(); }
  downAt = null;
});
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ') { aim = computeAim(); onTrigger(); e.preventDefault(); }
  if (k === 'c') { battery.continuous = !battery.continuous; showFlash(battery.continuous ? 'OGIEŃ CIĄGŁY' : 'Ogień ciągły: STOP', 1.2); }
  if (k === 'l') toggleLock();
  if (k === 'escape') { lock = null; drawing = null; }
  if (k === 'w' || k === 'arrowup') { setAngle(OPTS.angle + 5); saveOpts(); }
  if (k === 's' || k === 'arrowdown') { setAngle(OPTS.angle - 5); saveOpts(); }
  if (k === 'n') newGame();
  if (k === 'f' || k === 'y') nextWave();
  if (['1', '2', '3', '4'].includes(k)) setAmmo(Number(k) - 1);
  if (k === 'o' || k === 'b') toggleMenu();
  if (k === 'r' || k === 'x') resetDesktopView();
});
document.getElementById('btn-menu').onclick = () => toggleMenu();

// menu na komputerze (to samo menu co w VR)
const menuPx = (e) => [e.offsetX * (menu.canvas.width / menu.canvas.clientWidth), e.offsetY * (menu.canvas.height / menu.canvas.clientHeight)];
menu.canvas.addEventListener('pointermove', (e) => { const [x, y] = menuPx(e); menu.hover = menu.hit(x, y); });
menu.canvas.addEventListener('pointerleave', () => { menu.hover = -1; });
menu.canvas.addEventListener('click', (e) => { const [x, y] = menuPx(e); const i = menu.hit(x, y); if (i >= 0) menuAction(menu.buttons[i].act); });

function resetDesktopView() {
  camera.position.set(0.5, 1.6, 0.45);
  tableRoot.position.set(0, TABLE_DEFAULT.height, -1.18);
  tableRoot.rotation.set(0, 0, 0);
  tableRoot.scale.setScalar(TABLE_DEFAULT.scale);
  controls.target.set(0, TABLE_DEFAULT.height, -1.0);
  controls.update();
}
resetDesktopView();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- celowanie ----------
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
const _inv = new THREE.Matrix4();
function aimRay() {
  if (renderer.xr.isPresenting) {
    if (!aimCtrl?.source) return false;
    aimCtrl.c.getWorldPosition(_o);
    aimCtrl.c.getWorldQuaternion(_q);
    _d.set(0, 0, -1).applyQuaternion(_q);
    return true;
  }
  if (!mouseInside) return false;
  raycaster.setFromCamera(mouse, camera);
  _o.copy(raycaster.ray.origin); _d.copy(raycaster.ray.direction);
  return true;
}

function computeAim() {
  if (!aimRay()) return null;
  _inv.copy(mapGroup.matrixWorld).invert();
  const hit = terrain.raycast(_o.clone().applyMatrix4(_inv), _d.clone().transformDirection(_inv));
  if (!hit) return null;
  return { local: hit, world: toWorld(hit), origin: _o.clone() };
}

function updateMenuHover() {
  menuHover = false;
  if (!renderer.xr.isPresenting || !menu.mesh.visible || !aimRay()) return null;
  raycaster.set(_o, _d);
  const hit = raycaster.intersectObject(menu.mesh, false)[0];
  if (!hit) { menu.hover = -1; return null; }
  menuHover = true;
  menu.hover = menu.hit(hit.uv.x * menu.canvas.width, (1 - hit.uv.y) * menu.canvas.height);
  return hit;
}

// ---------- XR: start / koniec sesji ----------
let xrFrames = 0;
async function startXR(mode) {
  try {
    sound.resume();
    const session = await navigator.xr.requestSession(mode, {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    });
    const ar = mode === 'immersive-ar';
    env.visible = !ar;
    scene.background = ar ? null : SKY;
    scene.fog = ar ? null : makeFog();
    session.addEventListener('end', () => {
      env.visible = true; scene.background = SKY; scene.fog = makeFog();
      document.body.classList.remove('in-xr');
      document.getElementById('hud').appendChild(hud.canvas);
      hud.mesh.visible = true;
      resetDesktopView();
    });
    await renderer.xr.setSession(session);
    document.body.classList.add('in-xr');
    xrFrames = 0;
    toggleMenu(true);
  } catch (err) {
    console.error(err);
    alert('Nie udało się uruchomić sesji XR: ' + err.message);
  }
}

async function setupButtons() {
  const vrBtn = document.getElementById('btn-vr');
  const arBtn = document.getElementById('btn-ar');
  const note = document.getElementById('xr-note');
  vrBtn.onclick = () => startXR('immersive-vr');
  arBtn.onclick = () => startXR('immersive-ar');
  if (!navigator.xr) {
    note.textContent = window.isSecureContext
      ? 'Ta przeglądarka nie obsługuje WebXR — tryb podglądu na komputerze.'
      : 'WebXR wymaga HTTPS. Otwórz stronę przez https:// (np. GitHub Pages).';
    vrBtn.disabled = arBtn.disabled = true;
    return;
  }
  const [vr, ar] = await Promise.all([
    navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
    navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
  ]);
  vrBtn.disabled = !vr; arBtn.disabled = !ar;
  if (!vr && !ar) note.textContent = 'Brak gogli VR — tryb podglądu na komputerze (mysz + klawiatura).';
}
setupButtons();

// ---------- pętla ----------
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();

function updateSun() {
  const c = tableRoot.getWorldPosition(tmpV);
  const s = tableRoot.scale.x;
  sun.position.copy(c).addScaledVector(SUN_DIR, 3 * s);
  sun.target.position.copy(c);
  sun.target.updateMatrixWorld();
  const cam = sun.shadow.camera;
  const r = 1.12 * s;
  cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
  cam.near = 0.5 * s; cam.far = 6 * s;
  cam.updateProjectionMatrix();
  sun.shadow.normalBias = 0.0015 * s;
}

function updateRays(menuHit) {
  for (const o of ctrls) {
    if (!o.source) continue;
    const isAim = o === aimCtrl;
    o.ray.material.opacity = isAim ? 0.75 : 0.2;
    o.tip.visible = false;
    o.ray.scale.z = 1.5;
    if (!isAim) continue;
    if (menuHit) {
      o.ray.scale.z = menuHit.distance;
      o.tip.visible = true; o.tip.position.copy(menuHit.point);
    } else if (aim) {
      o.ray.scale.z = aim.origin.distanceTo(aim.world);
      o.tip.visible = true; o.tip.position.copy(aim.world);
    }
  }
}

function hudState() {
  const pv = battery.preview;
  let msg = '', msgColor = '#ffe9a0';
  if (gameOver) { msg = 'WIOSKA SPALONA — Y: nowa gra'; msgColor = '#ff8a7a'; }
  else if (flash.until > clockT) { msg = flash.text; msgColor = flash.color; }
  else if (enemies.waveTimer < 30) msg = `Fala ${enemies.wave + 1} za ${Math.ceil(enemies.waveTimer)} s`;
  const mode = drawing ? 'wyznaczanie obszaru' : lock ? (lock.type === 'area' ? 'OBSZAR' : 'CEL ZABLOKOWANY') : 'celowanie';
  return {
    wave: enemies.wave, kills: enemies.kills, alive: enemies.aliveCount, tanks: enemies.tankCount, tankKills: enemies.tankKills,
    ammo: AMMO[ammoKey()].name, ammoColor: AMMO[ammoKey()].color,
    nukeCd: ammoKey() === 'nuke' ? Math.ceil(battery.nukeCooldown) : 0,
    homeAlive: terrain.homeAlive(), homeTotal: terrain.home.houses.length,
    angle: Math.round(OPTS.angle), mode, continuous: battery.continuous,
    guns: battery.guns.map((g) => Math.round((1 - g.reload / battery.reloadTime(g)) * 10) / 10),
    status: pv ? pv.status : 'none',
    dist: pv ? Math.round(pv.dist / 10) * 10 : 0,
    flight: pv ? Math.round((pv.tr.t / shellTimeScale()) * 10) / 10 : 0,
    msg, msgColor,
  };
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  clockT += dt;
  const xr = renderer.xr.isPresenting;
  controls.enabled = !xr && !drawing;

  if (xr) {
    xrFrames++;
    if (xrFrames === 3) placeTable();
    pollXRInput(dt);
  }
  table.update();
  scene.updateMatrixWorld();

  const menuHit = updateMenuHover();
  aim = computeAim();
  if (drawing && aim) drawing.cur = aim.local.clone();

  battery.update(dt, gameOver ? null : currentSpec(), drawing ? rectOf(drawing) : null, !!lock);
  enemies.update(dt, !gameOver);
  if (!gameOver && terrain.homeAlive() === 0) {
    gameOver = true;
    battery.continuous = false;
  }
  // fala uderzeniowa: niszczy wszystko w pierścieniu, który właśnie przeszła
  for (let i = nukes.length - 1; i >= 0; i--) {
    const n = nukes[i];
    n.t += dt;
    const r = shockRadius(n.t, NUKE.shockMax);
    const k = enemies.shock(n.p, n.r, Math.min(r, NUKE.kill));
    if (n.r < NUKE.houses) houseLosses(terrain.burn(n.p.x, n.p.z, n.r, Math.min(r, NUKE.trees)));
    if (k > 0) killFlash(k);
    n.r = r;
    if (n.t > 4) nukes.splice(i, 1);
  }
  // fire zones (zapalająca)
  for (const z of effects.fireZones) {
    const k = enemies.burn(z.p, z.R, dt);
    if (k > 0) killFlash(k);
  }
  flashLight = Math.max(0, flashLight - dt * 0.8);
  hemi.intensity = 1.6 * (1 + 6 * flashLight * flashLight);
  effects.update(dt);
  terrain.update();
  updateSun();
  updateRays(menuHit);
  terrain.glowMaterial.color.setHex(table.active ? 0xbff4ff : 0x4fd2ff);
  hud.draw(hudState());
  menu.draw({ ...OPTS });
  if (optsDirty) { optsDirty += dt; if (optsDirty > 1.5) { saveOpts(); optsDirty = 0; } }

  if (!xr) controls.update();
  renderer.render(scene, camera);
});

// do testów w konsoli
window.__sim = {
  THREE, controls, table, scene, terrain, battery, enemies, tableRoot, camera, newGame, onTrigger, menuAction, toggleLock,
  get aim() { return aim; }, set aim(v) { aim = v; }, get lock() { return lock; }, set lock(v) { lock = v; }, CRATER,
};
