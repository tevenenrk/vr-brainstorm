import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import {
  MAP_SCALE, LETHAL_RADIUS, MAX_BREACHES, SHELL_TIME_SCALE, TABLE_DEFAULT, SHADOWS, SEED, RELOAD_TIME,
} from './config.js';
import { Terrain } from './terrain.js';
import { Effects, Sound } from './effects.js';
import { Battery } from './artillery.js';
import { Enemies } from './enemies.js';
import { TableManipulator } from './table.js';
import { Hud, HelpBoard } from './hud.js';

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
scene.background = SKY;
scene.fog = new THREE.Fog(0x1d262c, 10, 45);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 200);
camera.position.set(0.55, 1.55, 0.45);
scene.add(camera);

// otoczenie (ukrywane w trybie MR/passthrough)
const env = new THREE.Group();
scene.add(env);
{
  const skyGeo = new THREE.SphereGeometry(60, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3a5a78) }, bottom: { value: new THREE.Color(0x1a2026) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = smoothstep(-0.1, 0.6, vP.y); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
  });
  env.add(new THREE.Mesh(skyGeo, skyMat));
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#2a2f2c'; c.fillRect(0, 0, 256, 256);
  c.strokeStyle = '#3d4540'; c.lineWidth = 3; c.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(24, 24);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(24, 64), new THREE.MeshLambertMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  env.add(floor);
}

// nogi stołu (tylko w VR / na komputerze; w MR stół "stoi" w Twoim pokoju)
const legMat = new THREE.MeshLambertMaterial({ color: 0x3b2516 });
const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), legMat);
  m.castShadow = true;
  m.userData.corner = new THREE.Vector3(sx * 0.255, 0, sz * 1.0);
  env.add(m);
  return m;
});

const hemi = new THREE.HemisphereLight(0xe4f0ff, 0x4a3c28, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
const SUN_DIR = new THREE.Vector3(0.45, 1, 0.35).normalize();
sun.castShadow = SHADOWS;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

// ---------- stół i świat w miniaturze ----------
const tableRoot = new THREE.Group();
scene.add(tableRoot);
const mapGroup = new THREE.Group();
mapGroup.scale.setScalar(MAP_SCALE);
tableRoot.add(mapGroup);

const terrain = new Terrain(SEED);
mapGroup.add(terrain.group);
const effects = new Effects(mapGroup, terrain);
const sound = new Sound(camera, scene);
const battery = new Battery(terrain, mapGroup, effects, sound);
const enemies = new Enemies(terrain, mapGroup);
const table = new TableManipulator(tableRoot);

const hud = new Hud();
const help = new HelpBoard();
help.mesh.position.set(-0.62, 0.22, 0.62);
help.mesh.rotation.set(-0.2, 0.75, 0, 'YXZ');
tableRoot.add(help.mesh);
document.getElementById('hud').appendChild(hud.canvas);

function placeTable() {
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  camera.getWorldPosition(p); camera.getWorldQuaternion(q);
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q); f.y = 0;
  if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
  f.normalize();
  const s = TABLE_DEFAULT.scale;
  tableRoot.scale.setScalar(s);
  const dist = 0.38 + 1.0 * s; // bliższa krawędź ~38 cm od użytkownika
  const y = renderer.xr.isPresenting ? THREE.MathUtils.clamp(p.y - 0.7, 0.5, 1.05) : TABLE_DEFAULT.height;
  tableRoot.position.set(p.x + f.x * dist, y, p.z + f.z * dist);
  tableRoot.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
  if (table.active) table.begin();
}

// ---------- stan gry ----------
let gameOver = false;
let flash = { text: '', until: 0, color: '#ffe9a0' };
let aim = null;
let clockT = 0;

function newGame() {
  enemies.reset();
  battery.reset();
  effects.clear();
  terrain.resetDamage();
  gameOver = false;
  showFlash('Nowa gra — pierwsza fala za chwilę', 2.5);
}

function showFlash(text, dur = 2, color = '#ffe9a0') { flash = { text, until: clockT + dur, color }; }

function toggleArc() {
  battery.highArc = !battery.highArc;
  showFlash(battery.highArc ? 'Tor STROMY' : 'Tor PŁASKI', 1.2, '#cfe8ff');
}

function toggleHelp(v) { help.mesh.visible = v ?? !help.mesh.visible; }

const toWorld = (pLocal) => pLocal.clone().applyMatrix4(mapGroup.matrixWorld);

battery.onFire = (muzzle) => {
  sound.play('gun', toWorld(muzzle), 0.7);
  pulse(aimCtrl, 0.7, 70);
};
battery.onImpact = (p, water) => {
  effects.explosion(p, water);
  if (!water) terrain.scorch(p.x, p.z, LETHAL_RADIUS * 0.75);
  const k = enemies.blast(p, LETHAL_RADIUS);
  sound.play(water ? 'splash' : 'boom', toWorld(p), 1);
  if (k > 0) showFlash(k === 1 ? 'Trafiony 1 żołnierz' : `Trafionych: ${k}!`, 1.8, '#ffb4a8');
  for (const o of ctrls) pulse(o, 0.25, 40);
};

function fire() {
  sound.resume();
  if (gameOver) { showFlash('Koniec gry — Y / N: nowa gra', 2, '#ff8a7a'); return; }
  if (!aim) return;
  const n = battery.fire(aim.local);
  if (n > 0) toggleHelp(false);
  else showFlash('Działa się ładują…', 1, '#e8a040');
}

// ---------- kontrolery XR ----------
const factory = new XRControllerModelFactory();
const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
let aimCtrl = null;

function pulse(o, intensity, ms) {
  const act = o?.source?.gamepad?.hapticActuators?.[0];
  if (act && act.pulse) act.pulse(intensity, ms).catch?.(() => {});
}

const ctrls = [0, 1].map((i) => {
  const c = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  grip.add(factory.createControllerModel(grip));
  scene.add(c, grip);
  const ray = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  ray.scale.z = 2;
  ray.visible = false;
  c.add(ray);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  tip.visible = false;
  scene.add(tip);
  const o = { c, grip, ray, tip, source: null, hand: null, prev: [] };
  c.addEventListener('connected', (e) => {
    o.source = e.data; o.hand = e.data.handedness; ray.visible = true;
    if (o.hand === 'left') {
      grip.add(hud.mesh);
      hud.mesh.position.set(0, 0.075, 0.035);
      hud.mesh.rotation.set(-0.75, 0, 0);
    }
    if (!aimCtrl || o.hand === 'right') aimCtrl = o;
  });
  c.addEventListener('disconnected', () => {
    o.source = null; ray.visible = false; tip.visible = false;
    if (hud.mesh.parent === grip) grip.remove(hud.mesh);
    table.release(grip);
    if (aimCtrl === o) aimCtrl = ctrls.find((x) => x.source) || null;
  });
  c.addEventListener('selectstart', () => { aimCtrl = o; aim = computeAim(); fire(); });
  c.addEventListener('squeezestart', () => table.grab(grip));
  c.addEventListener('squeezeend', () => table.release(grip));
  return o;
});

function pollXRInput(dt) {
  for (const o of ctrls) {
    const gp = o.source?.gamepad;
    if (!gp) continue;
    const pressed = gp.buttons.map((b) => b.pressed);
    const edge = (i) => pressed[i] && !o.prev[i];
    if (o.hand === 'right') {
      if (edge(4)) toggleArc();
      if (edge(5)) toggleHelp();
    } else if (o.hand === 'left') {
      if (edge(4)) placeTable();
      if (edge(5)) newGame();
    }
    const ax = gp.axes[2] || 0, ay = gp.axes[3] || 0;
    if (Math.abs(ax) > 0.2 || Math.abs(ay) > 0.2) {
      const pivot = aim ? aim.world : tableRoot.getWorldPosition(new THREE.Vector3());
      table.nudge(pivot, Math.exp(-ay * dt * 1.4), -ax * dt * 1.6);
    }
    o.prev = pressed;
  }
}

// ---------- desktop: mysz + klawiatura ----------
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
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY, b: e.button }; sound.resume(); });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (downAt && downAt.b === 0 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) { aim = computeAim(); fire(); }
  downAt = null;
});
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ') { aim = computeAim(); fire(); e.preventDefault(); }
  if (k === 'h' || k === 'a') toggleArc();
  if (k === 'n' || k === 'y') newGame();
  if (k === 'b' || k === '?') toggleHelp();
  if (k === 'r' || k === 'x') resetDesktopView();
});

function resetDesktopView() {
  camera.position.set(0.55, 1.55, 0.45);
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
function computeAim() {
  if (renderer.xr.isPresenting) {
    if (!aimCtrl?.source) return null;
    aimCtrl.c.getWorldPosition(_o);
    aimCtrl.c.getWorldQuaternion(_q);
    _d.set(0, 0, -1).applyQuaternion(_q);
  } else {
    if (!mouseInside) return null;
    raycaster.setFromCamera(mouse, camera);
    _o.copy(raycaster.ray.origin); _d.copy(raycaster.ray.direction);
  }
  _inv.copy(mapGroup.matrixWorld).invert();
  const oL = _o.clone().applyMatrix4(_inv);
  const dL = _d.clone().transformDirection(_inv);
  const hit = terrain.raycast(oL, dL);
  if (!hit) return null;
  return { local: hit, world: toWorld(hit), origin: _o.clone() };
}

// ---------- XR: start / koniec sesji ----------
let xrMode = null;
let xrFrames = 0;
async function startXR(mode) {
  try {
    sound.resume();
    const session = await navigator.xr.requestSession(mode, {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    });
    xrMode = mode;
    const ar = mode === 'immersive-ar';
    env.visible = !ar;
    scene.background = ar ? null : SKY;
    scene.fog = ar ? null : new THREE.Fog(0x1d262c, 10, 45);
    session.addEventListener('end', () => {
      xrMode = null;
      env.visible = true; scene.background = SKY; scene.fog = new THREE.Fog(0x1d262c, 10, 45);
      document.body.classList.remove('in-xr');
      resetDesktopView();
    });
    await renderer.xr.setSession(session);
    document.body.classList.add('in-xr');
    xrFrames = 0;
    toggleHelp(true);
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

function updateLegs() {
  const s = tableRoot.scale.x;
  const topLocalY = (-45 - 42) * MAP_SCALE;
  for (const leg of legs) {
    const w = tableRoot.localToWorld(tmpV.copy(leg.userData.corner).setY(topLocalY));
    const h = w.y;
    leg.visible = h > 0.03;
    if (!leg.visible) continue;
    leg.position.set(w.x, 0, w.z);
    leg.rotation.y = tableRoot.rotation.y;
    const t = Math.min(0.05, 0.035 * s);
    leg.scale.set(t, h, t);
  }
}

function updateRays() {
  for (const o of ctrls) {
    if (!o.source) continue;
    const isAim = o === aimCtrl;
    o.ray.material.opacity = isAim ? 0.75 : 0.2;
    if (isAim && aim) {
      const dist = aim.origin.distanceTo(aim.world);
      o.ray.scale.z = dist;
      o.tip.visible = true;
      o.tip.position.copy(aim.world);
    } else {
      o.ray.scale.z = 1.5;
      o.tip.visible = false;
    }
  }
}

function hudState() {
  const pv = battery.preview;
  let msg = '', msgColor = '#ffe9a0';
  if (gameOver) { msg = 'KONIEC GRY — Y: nowa gra'; msgColor = '#ff8a7a'; }
  else if (flash.until > clockT) { msg = flash.text; msgColor = flash.color; }
  else if (!enemies.waveActive) msg = `Fala ${enemies.wave + 1} za ${Math.ceil(enemies.waveTimer)} s`;
  return {
    wave: enemies.wave, kills: enemies.kills, alive: enemies.aliveCount,
    breaches: enemies.breaches, maxBreaches: MAX_BREACHES, high: battery.highArc,
    guns: battery.guns.map((g) => Math.round((1 - g.reload / RELOAD_TIME) * 10) / 10),
    status: pv ? pv.status : 'none',
    dist: pv ? Math.round(pv.dist / 10) * 10 : 0,
    flight: pv ? Math.round((pv.tr.t / SHELL_TIME_SCALE) * 10) / 10 : 0,
    msg, msgColor,
  };
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  clockT += dt;
  const xr = renderer.xr.isPresenting;
  controls.enabled = !xr;

  if (xr) {
    xrFrames++;
    if (xrFrames === 3) placeTable();
    pollXRInput(dt);
  }
  table.update();
  scene.updateMatrixWorld();

  aim = computeAim();
  battery.update(dt, aim ? aim.local : null);
  enemies.update(dt, !gameOver);
  if (!gameOver && enemies.breaches >= MAX_BREACHES) {
    gameOver = true;
    sound.play('boom', camera.getWorldPosition(tmpV), 0.6);
  }
  effects.update(dt);
  terrain.update();
  updateSun();
  updateLegs();
  updateRays();
  terrain.trimMaterial.emissive.setHex(table.active ? 0x5a4410 : 0x000000);
  hud.draw(hudState());

  if (!xr) controls.update();
  renderer.render(scene, camera);
});

// do testów w konsoli
window.__sim = { THREE, controls, table, scene, terrain, battery, enemies, tableRoot, camera, fire, newGame, toggleArc, get aim() { return aim; }, set aim(v) { aim = v; } };
