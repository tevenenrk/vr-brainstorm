import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { Effects, Sound } from '../effects.js';
import { TableManipulator } from '../table.js';
import { World, MAP_SCALE, W, BASE_Y, RESERVOIR_LEVEL, RIVER, DAM, coastX } from './world.js';
import { Fluid } from './fluid.js';
import { Agents } from './agents.js';
import { FireSystem, DISASTERS } from './scenarios.js';
import { DisasterHud, DisasterMenu } from './ui.js';

const params = new URLSearchParams(location.search);
const SHADOWS = params.get('shadows') !== '0';
const TABLE = { scale: 1, height: 0.85 };

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
const SKY = new THREE.Color(0x26323a), SKY_DARK = new THREE.Color(0x14110f);
scene.background = SKY.clone();
scene.fog = new THREE.Fog(SKY.clone(), 10, 45);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 200);
scene.add(camera);

const env = new THREE.Group();
scene.add(env);
{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x4a6a88) }, bottom: { value: new THREE.Color(0x1a2026) }, dark: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; uniform float dark; varying vec3 vP; void main(){ float t = smoothstep(-0.1, 0.6, vP.y); vec3 c = mix(bottom, top, t); c = mix(c, vec3(0.09,0.07,0.06), dark); gl_FragColor = vec4(c, 1.0); }',
  });
  env.add(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), skyMat));
  env.userData.sky = skyMat;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#2a2f2c'; c.fillRect(0, 0, 256, 256); c.strokeStyle = '#3d4540'; c.lineWidth = 3; c.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(24, 24); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(24, 64), new THREE.MeshLambertMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  env.add(floor);
}
const hemi = new THREE.HemisphereLight(0xe4f0ff, 0x4a3c28, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
const SUN_DIR = new THREE.Vector3(0.45, 1, 0.35).normalize();
sun.castShadow = SHADOWS; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

// ---------- makieta ----------
const tableRoot = new THREE.Group();
scene.add(tableRoot);
const mapGroup = new THREE.Group();
mapGroup.scale.setScalar(MAP_SCALE);
tableRoot.add(mapGroup);

const loading = document.getElementById('xr-note');
const world = new World(parseInt(params.get('seed') || '7', 10));
mapGroup.add(world.group);
const water = new Fluid(world, world.group, { N: 128, kind: 'water' });
const lava = new Fluid(world, world.group, { N: 128, kind: 'lava' });
function initWater() {
  water.reset(); lava.reset();
  water.syncBed(); lava.syncBed();
  water.boundary = 0;
  water.fill(water.eastEdge(), 0);
  water.fill([water.cell(RIVER[0][0], RIVER[0][1]), water.cell(RIVER[1][0], RIVER[1][1])], RESERVOIR_LEVEL);
  water.sources.push({ x: DAM.x + DAM.dx * 40, z: DAM.z + DAM.dz * 40, rate: 120 });
  for (let k = 0; k < 250; k++) water.step(0.12);
  water.updateMesh(); lava.updateMesh();
}
initWater();
world.waterSurface = (x, z) => water.levelAt(x, z);
const effects = new Effects(world.group, world, { fire: 1600, smoke: 2600 });
const sound = new Sound(camera, scene);
sound.buffers.rumble = sound.makeBoom(sound.listener.context, 5, 160, 18, 0.45);
const agents = new Agents(world, world.group);
const table = new TableManipulator(tableRoot);
const hud = new DisasterHud();
const menu = new DisasterMenu();
document.getElementById('hud').appendChild(hud.canvas);
document.getElementById('menu').appendChild(menu.canvas);

// ---------- stan ----------
let scenarios = [];
let armed = null;          // indeks wybranej katastrofy
let timeScale = 1, paused = false;
let shakeAmp = 0, flashLight = 0, darkTarget = 0, dark = 0;
let flash = { text: '', until: 0, color: '#ffe9a0' };
let clockT = 0, aim = null, menuHover = false, hazardT = 0, bedT = 0;
const SPEEDS = [0.25, 0.5, 1, 2, 4];

const toWorld = (p) => p.clone().applyMatrix4(mapGroup.matrixWorld);
const ctx = {
  world, water, lava, agents, fx: effects,
  sound: (name, p, vol = 1) => sound.play(name, toWorld(p), vol),
  shake: (a) => { shakeAmp = Math.max(shakeAmp, a); },
  flash: (v) => { flashLight = Math.max(flashLight, v); },
  darken: (v) => { darkTarget = v; },
  haptic: (i, ms) => { for (const o of ctrls) pulse(o, i, ms); },
  msg: (text, color = '#ffe9a0') => { flash = { text, until: clockT + 3, color }; },
  start: (s) => { if (!s.done) scenarios.push(s); },
  resyncBed: () => { water.syncBed(); lava.syncBed(); world.bedDirty = false; },
};
const fire = new FireSystem(ctx);
ctx.fire = fire;

world.onCollapse = (b, cause) => {
  agents.hitRadius(b.x, b.z, Math.max(b.w, b.d) / 2 + 5, cause === 'fire' || cause === 'lava' ? 'burnt' : 'dead', 0.8);
  const p = new THREE.Vector3(b.x, b.y + 4, b.z);
  const n = Math.min(14, 4 + b.h / 8);
  for (let i = 0; i < n; i++) effects.smoke.spawn({ p: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * b.w, Math.random() * b.h * 0.5, (Math.random() - 0.5) * b.d)), v: new THREE.Vector3((Math.random() - 0.5) * 12, 6 + Math.random() * 10, (Math.random() - 0.5) * 12), life: 3 + Math.random() * 2, s0: 6, s1: 14 + b.h / 4, c0: cause === 'snow' ? 0xffffff : 0x9a8f80, c1: cause === 'snow' ? 0xe8eef8 : 0xc8beb0, drag: 0.5 });
  if (b.h > 30 && Math.random() < 0.5) sound.play('boom', toWorld(p), 0.35);
};

function startDisaster(k, point) {
  const d = DISASTERS[k];
  if (d.target && !point) { armed = k; ctx.msg(`${d.name}: ${d.hint}`, '#ffd08a'); return; }
  const s = d.make(ctx, point || null);
  s.name = s.name || d.name;
  ctx.start(s);
  if (!d.target) armed = null;
}

function resetWorld() {
  for (const s of scenarios) s.dispose();
  scenarios = [];
  fire.reset();
  effects.clear();
  world.reset();
  world.damBroken = false;
  initWater();
  agents.spawn();
  darkTarget = 0;
  ctx.msg('Świat odbudowany', '#9fe8b0');
}

function setSpeed(dir) {
  const i = Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(timeScale) + dir));
  timeScale = SPEEDS[i];
}

function toggleMenu(v) {
  const show = v ?? !menu.mesh.visible;
  menu.mesh.visible = show; hud.mesh.visible = !show;
  document.getElementById('menu').style.display = show ? 'block' : 'none';
}

function menuAction(act) {
  if (act.startsWith('d:')) {
    const k = Number(act.slice(2));
    startDisaster(k, null);
    toggleMenu(false);
    return;
  }
  switch (act) {
    case 'speed-': setSpeed(-1); break;
    case 'speed+': setSpeed(1); break;
    case 'pause': paused = !paused; break;
    case 'reset': resetWorld(); toggleMenu(false); break;
    case 'place': placeTable(); break;
    case 'mode': location.href = 'index.html'; break;
    case 'mode2': location.href = 'pins.html'; break;
    case 'close': toggleMenu(false); break;
    default: break;
  }
}

function onTrigger() {
  sound.resume();
  if (menuHover && menu.hover >= 0) { menuAction(menu.buttons[menu.hover].act); return; }
  if (armed === null) { ctx.msg('Naciśnij B i wybierz katastrofę', '#cfe8ff'); return; }
  if (!aim) return;
  startDisaster(armed, aim.local);
}

function placeTable() {
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  camera.getWorldPosition(p); camera.getWorldQuaternion(q);
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q); f.y = 0;
  if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
  f.normalize();
  tableRoot.scale.setScalar(TABLE.scale);
  const dist = 0.35 + (W * MAP_SCALE) / 2;
  const y = renderer.xr.isPresenting ? THREE.MathUtils.clamp(p.y - 0.65, 0.5, 1.1) : TABLE.height;
  tableRoot.position.set(p.x + f.x * dist, y, p.z + f.z * dist);
  tableRoot.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
  if (table.active) table.begin();
}

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
  off.grip.add(hud.mesh); off.grip.add(menu.mesh);
  hud.mesh.position.set(0, 0.075, 0.035); hud.mesh.rotation.set(-0.75, 0, 0);
  menu.mesh.position.set(0, 0.14, -0.01); menu.mesh.rotation.set(-0.55, 0, 0);
}
const ctrls = [0, 1].map((i) => {
  const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
  grip.add(factory.createControllerModel(grip));
  scene.add(c, grip);
  const ray = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  ray.scale.z = 2; ray.visible = false; c.add(ray);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  tip.visible = false; scene.add(tip);
  const o = { c, grip, ray, tip, source: null, hand: null, prev: [] };
  c.addEventListener('connected', (e) => { o.source = e.data; o.hand = e.data.handedness; ray.visible = true; if (!aimCtrl || o.hand === 'right') aimCtrl = o; attachPanels(); });
  c.addEventListener('disconnected', () => { o.source = null; ray.visible = false; tip.visible = false; table.release(grip); if (aimCtrl === o) aimCtrl = ctrls.find((x) => x.source) || null; attachPanels(); });
  c.addEventListener('selectstart', () => { if (!(menuHover && menu.hover >= 0) && aimCtrl !== o) { aimCtrl = o; attachPanels(); aim = computeAim(); } onTrigger(); });
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
      if (down(5)) resetWorld();
      if (Math.abs(ax) > 0.2 || Math.abs(ay) > 0.2) {
        const pivot = aim ? aim.world : tableRoot.getWorldPosition(new THREE.Vector3());
        table.nudge(pivot, Math.exp(-ay * dt * 1.4), -ax * dt * 1.6);
      }
    }
    o.prev = pressed;
  }
}

// ---------- komputer ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minDistance = 0.05; controls.maxDistance = 8;
const mouse = new THREE.Vector2();
let mouseInside = false, downAt = null;
const raycaster = new THREE.Raycaster();
renderer.domElement.addEventListener('pointermove', (e) => { mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); mouseInside = true; });
renderer.domElement.addEventListener('pointerleave', () => { mouseInside = false; });
renderer.domElement.addEventListener('pointerdown', (e) => { sound.resume(); downAt = { x: e.clientX, y: e.clientY, b: e.button }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (downAt && downAt.b === 0 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) { aim = computeAim(); onTrigger(); }
  downAt = null;
});
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k >= '1' && k <= '8') startDisaster(Number(k) - 1, null);
  if (k === ' ') { paused = !paused; e.preventDefault(); }
  if (k === 'r' || k === 'y') resetWorld();
  if (k === 'o' || k === 'b') toggleMenu();
  if (k === '+' || k === '=') setSpeed(1);
  if (k === '-') setSpeed(-1);
  if (k === 'v') resetView();
});
document.getElementById('btn-menu').onclick = () => toggleMenu();
const menuPx = (e) => [e.offsetX * (menu.canvas.width / menu.canvas.clientWidth), e.offsetY * (menu.canvas.height / menu.canvas.clientHeight)];
menu.canvas.addEventListener('pointermove', (e) => { const [x, y] = menuPx(e); menu.hover = menu.hit(x, y); });
menu.canvas.addEventListener('pointerleave', () => { menu.hover = -1; });
menu.canvas.addEventListener('click', (e) => { const [x, y] = menuPx(e); const i = menu.hit(x, y); if (i >= 0) menuAction(menu.buttons[i].act); });
function resetView() {
  camera.position.set(0.55, 1.65, 0.75);
  tableRoot.position.set(0, TABLE.height, -0.55); tableRoot.rotation.set(0, 0, 0); tableRoot.scale.setScalar(TABLE.scale);
  controls.target.set(0, TABLE.height, -0.55); controls.update();
}
resetView();
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

// ---------- celowanie ----------
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _inv = new THREE.Matrix4();
function aimRay() {
  if (renderer.xr.isPresenting) {
    if (!aimCtrl?.source) return false;
    aimCtrl.c.getWorldPosition(_o); aimCtrl.c.getWorldQuaternion(_q); _d.set(0, 0, -1).applyQuaternion(_q);
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
  const hit = world.raycast(_o.clone().applyMatrix4(_inv), _d.clone().transformDirection(_inv));
  return hit ? { local: hit, world: toWorld(hit), origin: _o.clone() } : null;
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
// znacznik celu
const marker = new THREE.Mesh(new THREE.RingGeometry(34, 46, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
marker.add(new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 220, 6).translate(0, 110, 0), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false })));
marker.renderOrder = 5;
world.group.add(marker);

// ---------- sesja XR ----------
let xrFrames = 0;
async function startXR(mode) {
  try {
    sound.resume();
    const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    const ar = mode === 'immersive-ar';
    env.visible = !ar; scene.background = ar ? null : SKY.clone(); scene.fog = ar ? null : new THREE.Fog(SKY.clone(), 10, 45);
    session.addEventListener('end', () => {
      env.visible = true; scene.background = SKY.clone(); scene.fog = new THREE.Fog(SKY.clone(), 10, 45);
      document.body.classList.remove('in-xr'); hud.mesh.visible = true; resetView();
    });
    await renderer.xr.setSession(session);
    document.body.classList.add('in-xr');
    xrFrames = 0;
    toggleMenu(true);
  } catch (err) { console.error(err); alert('Nie udało się uruchomić sesji XR: ' + err.message); }
}
async function setupButtons() {
  const vrBtn = document.getElementById('btn-vr'), arBtn = document.getElementById('btn-ar');
  vrBtn.onclick = () => startXR('immersive-vr'); arBtn.onclick = () => startXR('immersive-ar');
  if (!navigator.xr) { loading.textContent = window.isSecureContext ? 'Ta przeglądarka nie obsługuje WebXR — podgląd na komputerze.' : 'WebXR wymaga HTTPS.'; vrBtn.disabled = arBtn.disabled = true; return; }
  const [vr, ar] = await Promise.all([navigator.xr.isSessionSupported('immersive-vr').catch(() => false), navigator.xr.isSessionSupported('immersive-ar').catch(() => false)]);
  vrBtn.disabled = !vr; arBtn.disabled = !ar;
  loading.textContent = !vr && !ar ? 'Brak gogli VR — podgląd na komputerze (mysz + klawiatura).' : '';
}
setupButtons();

// ---------- pętla ----------
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
function updateSun() {
  const c = tableRoot.getWorldPosition(tmpV), s = tableRoot.scale.x;
  sun.position.copy(c).addScaledVector(SUN_DIR, 2 * s); sun.target.position.copy(c); sun.target.updateMatrixWorld();
  const cam = sun.shadow.camera, r = 0.62 * s;
  cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 0.3 * s; cam.far = 5 * s;
  cam.updateProjectionMatrix();
  sun.shadow.normalBias = 0.0012 * s;
}
function updateRays(menuHit) {
  for (const o of ctrls) {
    if (!o.source) continue;
    const isAim = o === aimCtrl;
    o.ray.material.opacity = isAim ? 0.75 : 0.2; o.tip.visible = false; o.ray.scale.z = 1.5;
    if (!isAim) continue;
    if (menuHit) { o.ray.scale.z = menuHit.distance; o.tip.visible = true; o.tip.position.copy(menuHit.point); }
    else if (aim) { o.ray.scale.z = aim.origin.distanceTo(aim.world); o.tip.visible = true; o.tip.position.copy(aim.world); }
  }
}

// woda i lawa niszczą budynki i drzewa
function hazards() {
  for (const b of world.buildings) {
    if (b.state !== 'ok' && b.state !== 'burning') continue;
    const v = water.velAt(b.x, b.z);
    const sp = Math.hypot(v.u, v.v);
    if ((v.d > 3.5 && sp > 2.5) || v.d > 7) world.collapse(b, 'water');
    else if (lava.depthAt(b.x, b.z) > 0.6) { if (b.h > 25) world.collapse(b, 'lava'); else world.ignite(b); }
  }
  for (const t of world.trees) {
    if (t.state === 'buried' || t.state === 'burnt') continue;
    const ld = lava.D[lava.cell(t.x, t.z)];
    if (ld > 0.4) { world.setTree(t, 'burnt'); continue; }
    if (t.state === 'down') continue;
    const k = water.cell(t.x, t.z);
    if (water.D[k] > 4 && Math.hypot(water.U[k], water.V[k]) > 3) world.setTree(t, 'down', water.U[k], water.V[k]);
  }
}

function hudState() {
  const active = [...new Set(scenarios.map((s) => s.name).filter(Boolean))];
  if (fire.burning.length && !active.includes('Pożar lasu')) active.push(`pożar (${fire.burning.length} drzew)`);
  return {
    alive: agents.alive, total: agents.people.length, dead: agents.stats.dead,
    buildings: world.stats.buildings, cars: agents.stats.cars, trees: world.stats.trees,
    armed: armed !== null ? DISASTERS[armed].name : null, armedTarget: armed !== null && DISASTERS[armed].target,
    active, speed: timeScale, paused,
    msg: flash.until > clockT ? flash.text : '', msgColor: flash.color,
  };
}

function simulate(sdt) {
  for (const s of scenarios) s.update(sdt);
  for (const s of scenarios.filter((x) => x.done)) s.dispose();
  scenarios = scenarios.filter((s) => !s.done);
  fire.update(sdt);
  // woda: poziom morza = suma przesunięć od scenariuszy
  water.boundary = scenarios.reduce((a, s) => a + (s.seaOffset || 0), 0);
  const fs = 2 * Math.max(1, ...scenarios.map((s) => s.fluidSpeed || 1));
  const wt = sdt * fs;
  const steps = Math.min(6, Math.ceil(wt / 0.12));
  for (let i = 0; i < steps; i++) water.step(wt / steps);
  if (lava.sources.length || scenarios.some((s) => s.name === 'Superwulkan')) { const ls = Math.ceil((sdt * 2) / 0.12); for (let i = 0; i < ls; i++) lava.step((sdt * 2) / ls); }
  const dangers = scenarios.flatMap((s) => s.dangers());
  if (fire.extent) dangers.push(fire.extent);
  agents.update(sdt, dangers, water, lava);
  hazardT += sdt;
  if (hazardT > 0.25) { hazardT = 0; hazards(); }
  world.update(sdt);
  effects.update(sdt);
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  clockT += dt;
  const xr = renderer.xr.isPresenting;
  controls.enabled = !xr;
  if (xr) { xrFrames++; if (xrFrames === 3) placeTable(); pollXRInput(dt); }
  table.update();
  mapGroup.position.set(0, 0, 0);
  scene.updateMatrixWorld();
  const menuHit = updateMenuHover();
  aim = computeAim();

  const sdt = paused ? 0 : dt * timeScale;
  shakeAmp = 0;
  if (sdt > 0) simulate(sdt);
  bedT += dt;
  if (world.bedDirty && bedT > 1) { bedT = 0; water.syncBed(); lava.syncBed(); world.bedDirty = false; }
  water.updateMesh();
  if (lava.mesh.visible || lava.sources.length) lava.updateMesh();

  // wstrząsy, błysk, zaciemnienie nieba
  if (shakeAmp > 0) mapGroup.position.set((Math.random() - 0.5) * shakeAmp * MAP_SCALE, (Math.random() - 0.5) * shakeAmp * 0.5 * MAP_SCALE, (Math.random() - 0.5) * shakeAmp * MAP_SCALE);
  flashLight = Math.max(0, flashLight - dt * 0.9);
  dark += (darkTarget - dark) * Math.min(1, dt * 0.8);
  hemi.intensity = 1.6 * (1 - 0.55 * dark) * (1 + 6 * flashLight * flashLight);
  sun.intensity = 2.6 * (1 - 0.7 * dark);
  if (scene.background) scene.background.copy(SKY).lerp(SKY_DARK, dark);
  if (scene.fog) scene.fog.color.copy(SKY).lerp(SKY_DARK, dark);
  env.userData.sky.uniforms.dark.value = dark;

  // znacznik celu
  marker.visible = !!(aim && armed !== null && DISASTERS[armed].target);
  if (marker.visible) { marker.position.copy(aim.local).add(new THREE.Vector3(0, 3, 0)); marker.rotation.y += dt; }
  updateSun();
  updateRays(menuHit);
  world.glowMaterial.color.setHex(table.active ? 0xffe0b0 : 0xffa34f);
  hud.draw(hudState());
  menu.draw({ armed, speed: timeScale, paused });
  if (!xr) controls.update();
  renderer.render(scene, camera);
});

window.__dis = { simulate, THREE, world, water, lava, agents, scenarios: () => scenarios, startDisaster, resetWorld, camera, controls, ctx, effects, fire, coastX, BASE_Y };
