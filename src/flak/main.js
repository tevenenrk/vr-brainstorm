import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { MAP_SCALE, SEED, TABLE_DEFAULT } from '../config.js';
import { Terrain } from '../terrain.js';
import { Effects, Sound } from '../effects.js';
import { TableManipulator } from '../table.js';
import { CanvasPanel } from '../hud.js';
import { Flak } from './guns.js';
import { Airforce, Group } from './planes.js';
import { FlakHud, FlakMenu, FIRE_MODES, VIEWS, MANEUVER } from './ui.js';

const params = new URLSearchParams(location.search);
const SHADOWS = params.get('shadows') !== '0';

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
const SKY = new THREE.Color(0x24303a);
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 10, 45);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 200);
scene.add(camera);
const env = new THREE.Group();
scene.add(env);
{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x5a7a98) }, bottom: { value: new THREE.Color(0x1a2026) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.1, 0.6, vP.y)), 1.0); }',
  });
  env.add(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), skyMat));
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#2a2f2c'; c.fillRect(0, 0, 256, 256); c.strokeStyle = '#3d4540'; c.lineWidth = 3; c.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(24, 24); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(24, 64), new THREE.MeshLambertMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  env.add(floor);
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
const effects = new Effects(mapGroup, terrain, { fire: 1800, smoke: 2400 });
const sound = new Sound(camera, scene);
const flak = new Flak(terrain, mapGroup, effects);
const air = new Airforce(terrain, mapGroup, effects);
const table = new TableManipulator(tableRoot);
const hud = new FlakHud(), menu = new FlakMenu();
document.getElementById('hud').appendChild(hud.canvas);
document.getElementById('menu').appendChild(menu.canvas);

// ---------- stan ----------
const state = { guns: 12, fire: 0, view: 0, pilot: false, pred: true, burstR: 75, speed: 1, maneuver: 2 };
let lastTrig = -10;
let box = { min: new THREE.Vector3(-150, 420, 300), max: new THREE.Vector3(150, 560, 600) };
let countdown = null, boomT = 0, contOn = false, wave = 0, waveTimer = 5, clockT = 0, aim = null, menuHover = false;
let flash = { text: '', until: 0, color: '#9fe8b0' }, selected = null, respawnT = 0, lastGunSound = 0;
const msg = (text, color = '#9fe8b0') => { flash = { text, until: clockT + 2.5, color }; };
flak.setCount(state.guns);

const toWorld = (p) => p.clone().applyMatrix4(mapGroup.matrixWorld);
const homeTarget = () => {
  const alive = terrain.home.houses.filter((h) => !h.destroyed);
  const h = alive.length ? alive[Math.floor(Math.random() * alive.length)] : { x: 0, z: 1820, y: 70 };
  return new THREE.Vector3(h.x, h.y ?? 70, h.z);
};

flak.onFire = (m) => { if (clockT - lastGunSound > 0.07) { lastGunSound = clockT; sound.play('gun', toWorld(m), 0.35); } };
flak.onBurst = (p) => {
  const hits = air.burst(p, state.burstR);
  if (Math.random() < 0.5) sound.play('pop', toWorld(p), 0.6);
  if (hits) msg(hits > 1 ? `Trafienia: ${hits}!` : 'Trafienie!', '#ffb4a8');
};
air.onCrash = (p) => {
  effects.explosion(p.pos, false);
  terrain.crater(p.pos.x, p.pos.z, 14, 4);
  for (const { v, h } of terrain.scorch(p.pos.x, p.pos.z, 40)) { if (v.home) msg('Wrak spadł na wioskę!', '#ff8a7a'); effects.addSmoker(new THREE.Vector3(h.x, h.y + 6, h.z), 25); }
  sound.play('boom', toWorld(p.pos), 0.8);
  if (p.group.player && !p.group.leader) { msg('Zestrzelono Cię! Nowy samolot za chwilę…', '#ff8a7a'); respawnT = 4; }
};
air.onBombHit = (p) => {
  effects.explosion(p, terrain.heightAt(p.x, p.z) < 0);
  terrain.crater(p.x, p.z, 12, 3);
  for (const { v, h } of terrain.scorch(p.x, p.z, 34)) if (v.home) effects.addSmoker(new THREE.Vector3(h.x, h.y + 6, h.z), 30);
  if (Math.random() < 0.4) sound.play('boom', toWorld(p), 0.6);
};

function nextWave() {
  wave++;
  air.spawnWave(wave, homeTarget);
  waveTimer = 75;
  msg(`Nadlatuje fala ${wave}!`, '#ffd08a');
}

function spawnPlayer() {
  const start = new THREE.Vector3((Math.random() - 0.5) * 400, 520, -1900);
  const target = homeTarget();
  const g = new Group('bomber', 4, start, Math.atan2(target.x - start.x, target.z - start.z), target, 0xffe08a);
  g.player = true;
  air.groups.push(g);
  selected = g.leader;
  msg('Lecisz! Omijaj flak i zrzuć bomby nad wioską', '#ffe08a');
}

function setRole(pilot) {
  state.pilot = pilot;
  contOn = false; countdown = null;
  for (const g of air.groups) g.player = false;
  if (pilot) { spawnPlayer(); enterCockpit(); toggleMenu(false); } else { selected = null; exitCockpit(); }
}

function newGame() {
  air.clear(); flak.reset(); effects.clear(); terrain.resetDamage();
  wave = 0; waveTimer = 4; countdown = null; contOn = false;
  if (state.pilot) spawnPlayer();
  msg('Nowa gra');
}

function cyclePlane(dir) {
  const list = air.alive();
  if (!list.length) return;
  const i = list.indexOf(selected);
  selected = list[((i < 0 ? 0 : i + dir) + list.length) % list.length];
  if (state.view < 1) state.view = 1;
}

function toggleMenu(v) {
  const show = v ?? !menu.mesh.visible;
  menu.mesh.visible = show; hud.mesh.visible = !show;
  document.getElementById('menu').style.display = show ? 'block' : 'none';
}

function menuAction(act) {
  const [k, v] = act.split(':');
  switch (k) {
    case 'role': setRole(v === 'pilot'); break;
    case 'fire': state.fire = Number(v); contOn = false; break;
    case 'guns-': case 'guns+':
      state.guns = Math.max(1, Math.min(30, state.guns + (k.endsWith('+') ? 1 : -1))); flak.setCount(state.guns); break;
    case 'view': state.view = Number(v); if (state.view >= 1 && !selected) cyclePlane(1); break;
    case 'burst-': case 'burst+': state.burstR = Math.max(20, Math.min(250, state.burstR + (k.endsWith('+') ? 10 : -10))); flak.burstScale = state.burstR / 75; break;
    case 'pspeed-': case 'pspeed+': state.speed = Math.max(0.3, Math.min(2.5, Math.round((state.speed + (k.endsWith('+') ? 0.1 : -0.1)) * 10) / 10)); air.speedMult = state.speed; break;
    case 'man-': case 'man+': state.maneuver = Math.max(0, Math.min(3, state.maneuver + (k.endsWith('+') ? 1 : -1))); air.maneuver = state.maneuver; break;
    case 'plane-': cyclePlane(-1); break;
    case 'plane+': cyclePlane(1); break;
    case 'pred': state.pred = !state.pred; air.showPrediction = state.pred; break;
    case 'wave': nextWave(); break;
    case 'new': newGame(); toggleMenu(false); break;
    case 'place': placeTable(); break;
    case 'close': toggleMenu(false); break;
    case 'mode': location.href = v; break;
    default: break;
  }
}

function onTrigger() {
  sound.resume();
  if (menuHover && menu.hover >= 0) { menuAction(menu.buttons[menu.hover].act); return; }
  if (state.pilot) {
    const g = air.playerGroup();
    if (g && !g.bombed) { air.dropBombs(g); msg('Bomby poszły!', '#ffe08a'); }
    return;
  }
  const mode = FIRE_MODES[state.fire].key;
  // ogień ciągły: włącza go tryb "ciągły" albo podwójny spust; kolejny spust zatrzymuje
  if (contOn) { contOn = false; lastTrig = -10; msg('Ogień ciągły: STOP'); return; }
  if (mode === 'cont' || clockT - lastTrig < 0.4) { contOn = true; lastTrig = -10; msg('OGIEŃ CIĄGŁY — spust zatrzymuje', '#ff8a7a'); return; }
  lastTrig = clockT;
  const T = flak.fire(box, mode);
  if (T === null) { msg(flak.ready().length ? 'Strefa poza zasięgiem dział' : 'Działa się ładują…', '#e8a040'); return; }
  countdown = T;
}

// ---------- strefa wybuchów (prostopadłościan) ----------
const boxGroup = new THREE.Group();
mapGroup.add(boxGroup);
const boxFill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false }));
const boxEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.9, toneMapped: false }));
boxGroup.add(boxFill, boxEdges);
const stems = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffd060, dashSize: 12, gapSize: 10, transparent: true, opacity: 0.6 }));
mapGroup.add(stems);
const shadowBox = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }));
mapGroup.add(shadowBox);
const label = new CanvasPanel(256, 96, 120);
label.mesh.material.depthTest = false;
mapGroup.add(label.mesh);
function drawLabel(text, color) {
  const c = label.ctx;
  if (label.last === text + color) return;
  label.last = text + color;
  c.clearRect(0, 0, 256, 96);
  c.fillStyle = 'rgba(20,24,14,0.8)'; label.roundRect(4, 4, 248, 88, 18); c.fill();
  c.fillStyle = color; c.font = 'bold 40px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(text, 128, 62);
  label.tex.needsUpdate = true;
}
function updateBoxVis(burstT) {
  const sz = new THREE.Vector3().subVectors(box.max, box.min), c = new THREE.Vector3().addVectors(box.min, box.max).multiplyScalar(0.5);
  boxGroup.position.copy(c); boxGroup.scale.copy(sz);
  const corners = [[box.min.x, box.min.z], [box.max.x, box.min.z], [box.max.x, box.max.z], [box.min.x, box.max.z]];
  const pts = [];
  for (const [x, z] of corners) pts.push(new THREE.Vector3(x, box.min.y, z), new THREE.Vector3(x, terrain.surfaceAt(x, z), z));
  stems.geometry.setFromPoints(pts); stems.computeLineDistances();
  shadowBox.position.set(c.x, terrain.surfaceAt(c.x, c.z) + 3, c.z); shadowBox.scale.set(sz.x, 1, sz.z);
  label.mesh.position.set(c.x, box.max.y + 45, c.z);
  label.mesh.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion())).premultiply(mapGroup.getWorldQuaternion(new THREE.Quaternion()).invert());
  const vis = !state.pilot;
  for (const o of [boxGroup, stems, shadowBox, label.mesh]) o.visible = vis;
  if (countdown !== null) drawLabel(`WYBUCH ${countdown.toFixed(1)} s`, '#ffe08a');
  else if (boomT > 0) drawLabel('BUM!', '#ff9a6a');
  else drawLabel(burstT ? `lot ${burstT.toFixed(1)} s` : 'poza zasięgiem', burstT ? '#d8f0c0' : '#ff8a7a');
  const flashOn = countdown !== null && countdown < 0.6;
  boxEdges.material.color.setHex(flashOn ? 0xff7040 : 0xffd060);
}
function setBoxFromCorners(a, b) {
  box.min.set(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
  box.max.set(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
  fixBox();
}
function fixBox() {
  for (const k of ['x', 'y', 'z']) if (box.max[k] - box.min[k] < 30) { const m = (box.max[k] + box.min[k]) / 2; box.min[k] = m - 15; box.max[k] = m + 15; }
  const ground = terrain.surfaceAt((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2) + 40;
  if (box.min.y < ground) { const d = ground - box.min.y; box.min.y += d; box.max.y += d; }
}
function moveBox(dx, dy, dz) { box.min.add(new THREE.Vector3(dx, dy, dz)); box.max.add(new THREE.Vector3(dx, dy, dz)); fixBox(); }
function scaleBox(f) {
  const c = new THREE.Vector3().addVectors(box.min, box.max).multiplyScalar(0.5), h = new THREE.Vector3().subVectors(box.max, box.min).multiplyScalar(0.5 * f);
  box.min.copy(c).sub(h); box.max.copy(c).add(h); fixBox();
}

// ---------- podgląd obraz-w-obrazie ----------
const pipCam = new THREE.PerspectiveCamera(55, 1.6, 0.00005, 40);
scene.add(pipCam);
const pipRT = new THREE.WebGLRenderTarget(640, 400);
const monitor = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.1375), new THREE.MeshBasicMaterial({ map: pipRT.texture, toneMapped: false }));
const monitorFrame = new THREE.Mesh(new THREE.PlaneGeometry(0.23, 0.1475), new THREE.MeshBasicMaterial({ color: 0x1a1d16 }));
monitorFrame.position.z = -0.001; monitor.add(monitorFrame);
monitor.visible = false;
function updatePip(dt) {
  const view = VIEWS[state.view].key;
  if (view === 'none' || state.pilot) return false;
  const eye = new THREE.Vector3(), look = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  {
    if (!selected || selected.state === 'gone') { cyclePlane(1); if (!selected) return false; }
    const p = selected, f = p.forward(new THREE.Vector3()), q = p.quaternion(new THREE.Quaternion());
    if (view === 'chase') { eye.copy(p.pos).addScaledVector(f, -95).add(new THREE.Vector3(0, 28, 0)); look.copy(p.pos).addScaledVector(f, 40); }
    else { up.set(0, 1, 0).applyQuaternion(q); eye.copy(p.pos).addScaledVector(f, p.type === 'bomber' ? 20 : 4).addScaledVector(up, 2.5); look.copy(eye).addScaledVector(f, 300); }
  }
  const tq = mapGroup.getWorldQuaternion(new THREE.Quaternion());
  pipCam.position.copy(toWorld(eye));
  pipCam.up.copy(up.applyQuaternion(tq));
  pipCam.lookAt(toWorld(look));
  pipCam.near = 0.00005 * tableRoot.scale.x; pipCam.updateProjectionMatrix();
  pipCam.updateMatrixWorld();
  for (const p of air.planes) p.selected = p === selected;
  return true;
}
function renderPipToTarget() {
  const prevXR = renderer.xr.enabled, prevRT = renderer.getRenderTarget();
  renderer.xr.enabled = false;
  renderer.shadowMap.autoUpdate = false;
  monitor.visible = false;
  pipCam.aspect = 1.6; pipCam.updateProjectionMatrix();
  renderer.setRenderTarget(pipRT);
  renderer.render(scene, pipCam);
  renderer.setRenderTarget(prevRT);
  renderer.shadowMap.autoUpdate = true;
  renderer.xr.enabled = prevXR;
  monitor.visible = true;
}

// ---------- widok pilota z kabiny (świat w skali 1:1 przesuwa się wokół Ciebie) ----------
const cockpit = new THREE.Group();
{
  const dark = new THREE.MeshLambertMaterial({ color: 0x23261f }), metal = new THREE.MeshLambertMaterial({ color: 0x4a5040 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); cockpit.add(o); return o; };
  add(new THREE.BoxGeometry(0.9, 0.22, 0.28), dark, 0, -0.38, -0.62);
  for (const [x, c] of [[-0.25, 0xf2f0e0], [0, 0xf2f0e0], [0.25, 0xf2f0e0]]) {
    const g = add(new THREE.CircleGeometry(0.055, 24), new THREE.MeshBasicMaterial({ color: 0x0c0d0a }), x, -0.3, -0.475);
    g.add(new THREE.Mesh(new THREE.RingGeometry(0.05, 0.055, 24), new THREE.MeshBasicMaterial({ color: c })));
  }
  for (const x of [-0.55, 0.55]) add(new THREE.BoxGeometry(0.04, 0.9, 0.04), metal, x, 0.05, -0.7).rotation.z = x > 0 ? -0.18 : 0.18;
  add(new THREE.BoxGeometry(1.1, 0.04, 0.04), metal, 0, 0.48, -0.66);
  add(new THREE.CylinderGeometry(0.02, 0.025, 0.35, 8), dark, 0, -0.55, -0.35).rotation.x = 0.4;
}
cockpit.visible = false;
scene.add(cockpit);
let saved = null;
const anchor = { pos: new THREE.Vector3(0, 1.4, 0), yaw: 0 };
function enterCockpit() {
  if (saved) return;
  saved = { pos: tableRoot.position.clone(), quat: tableRoot.quaternion.clone(), scale: tableRoot.scale.x, cam: camera.position.clone(), target: controls.target.clone() };
  if (renderer.xr.isPresenting) {
    camera.getWorldPosition(anchor.pos);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())); f.y = 0;
    anchor.yaw = f.lengthSq() > 1e-4 ? Math.atan2(-f.x, -f.z) : 0;
  } else { anchor.pos.set(0, 1.4, 0); anchor.yaw = 0; camera.position.copy(anchor.pos); camera.quaternion.identity(); }
  cockpit.position.copy(anchor.pos); cockpit.rotation.set(0, anchor.yaw, 0); cockpit.visible = true;
  tableRoot.scale.setScalar(1 / MAP_SCALE);
  camera.near = 0.15; camera.far = 16000; camera.updateProjectionMatrix();
  env.visible = false;
  scene.background = new THREE.Color(0x8fb2d4); scene.fog = new THREE.Fog(0x8fb2d4, 2500, 11000);
  sun.castShadow = false;
}
function exitCockpit() {
  if (!saved) return;
  tableRoot.position.copy(saved.pos); tableRoot.quaternion.copy(saved.quat); tableRoot.scale.setScalar(saved.scale);
  if (!renderer.xr.isPresenting) { camera.position.copy(saved.cam); controls.target.copy(saved.target); controls.update(); }
  saved = null;
  cockpit.visible = false;
  camera.near = 0.01; camera.far = 200; camera.updateProjectionMatrix();
  env.visible = !arMode; scene.background = arMode ? null : SKY; scene.fog = arMode ? null : new THREE.Fog(SKY, 10, 45);
  sun.castShadow = SHADOWS;
}
const EYE = { bomber: new THREE.Vector3(0, 1.0, 24), fighter: new THREE.Vector3(0, 1.9, 2.4) };
function updateCockpit() {
  if (!saved) return;
  const g = air.playerGroup(), p = g?.leader;
  if (!p) return; // czekamy na nowy samolot — świat zastyga
  const q = p.quaternion(new THREE.Quaternion());
  const eye = EYE[p.type].clone().multiplyScalar(1.4).applyQuaternion(q).add(p.pos);
  const seat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), anchor.yaw + Math.PI);
  const rt = seat.multiply(q.clone().invert());
  tableRoot.quaternion.copy(rt);
  tableRoot.position.copy(anchor.pos).sub(eye.applyQuaternion(rt));
  if (!renderer.xr.isPresenting) { camera.position.copy(anchor.pos); camera.quaternion.identity(); }
}

// ---------- kontrolery XR ----------
const factory = new XRControllerModelFactory();
const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
let aimCtrl = null;
function attachPanels() {
  const off = ctrls.find((o) => o.source && o !== aimCtrl);
  if (!off) return;
  off.grip.add(hud.mesh); off.grip.add(menu.mesh); off.grip.add(monitor);
  hud.mesh.position.set(0, 0.075, 0.035); hud.mesh.rotation.set(-0.75, 0, 0);
  menu.mesh.position.set(0, 0.15, -0.01); menu.mesh.rotation.set(-0.55, 0, 0);
  monitor.position.set(0, 0.2, 0.0); monitor.rotation.set(-0.55, 0, 0);
}
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
  c.addEventListener('squeezestart', () => { if (!state.pilot) table.grab(grip); });
  c.addEventListener('squeezeend', () => table.release(grip));
  return o;
});
const playerInput = { turn: 0, climb: 0 };
function tipMap(o) { return mapGroup.worldToLocal(o.c.localToWorld(new THREE.Vector3(0, 0, -0.03))); }
function pollXRInput(dt) {
  for (const o of ctrls) {
    const gp = o.source?.gamepad;
    if (!gp) continue;
    const pressed = gp.buttons.map((b) => b.pressed);
    const down = (i) => pressed[i] && !o.prev[i];
    const ax = gp.axes[2] || 0, ay = gp.axes[3] || 0;
    if (o.hand === 'right') {
      if (down(5)) toggleMenu();
      if (down(3) && !state.pilot) state.view = (state.view + 1) % VIEWS.length;
      if (state.pilot) { playerInput.turn = Math.abs(ax) > 0.1 ? -ax : 0; playerInput.climb = Math.abs(ay) > 0.1 ? -ay : 0; }
      else {
        // trzymaj A: prostopadłościan rozpięty między końcówkami obu kontrolerów
        if (pressed[4]) {
          const other = ctrls.find((x) => x !== o && x.source);
          const a = tipMap(o);
          if (other) setBoxFromCorners(a, tipMap(other));
          else { const h = new THREE.Vector3().subVectors(box.max, box.min).multiplyScalar(0.5); box.min.copy(a).sub(h); box.max.copy(a).add(h); fixBox(); }
        }
        if (Math.abs(ay) > 0.2) moveBox(0, -ay * dt * 220, 0);
        if (Math.abs(ax) > 0.3) scaleBox(Math.exp(ax * dt * 0.9));
      }
    } else if (o.hand === 'left') {
      if (down(4) && !state.pilot) placeTable();
      if (down(5)) nextWave();
      if (down(3)) cyclePlane(1);
      if (!state.pilot && (Math.abs(ax) > 0.2 || Math.abs(ay) > 0.2)) {
        const pivot = tableRoot.getWorldPosition(new THREE.Vector3());
        table.nudge(pivot, Math.exp(-ay * dt * 1.4), -ax * dt * 1.6);
      }
    }
    o.prev = pressed;
  }
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
  const y = renderer.xr.isPresenting ? THREE.MathUtils.clamp(p.y - 0.8, 0.45, 0.95) : 0.8;
  tableRoot.position.set(p.x + f.x * dist, y, p.z + f.z * dist);
  tableRoot.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
  if (table.active) table.begin();
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

// ---------- komputer ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minDistance = 0.05; controls.maxDistance = 8;
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let mouseInside = false, downAt = null, dragBox = null;
const keys = new Set();
function mouseGround() {
  if (!mouseInside) return null;
  raycaster.setFromCamera(mouse, camera);
  const inv = mapGroup.matrixWorld.clone().invert();
  return terrain.raycast(raycaster.ray.origin.clone().applyMatrix4(inv), raycaster.ray.direction.clone().transformDirection(inv));
}
renderer.domElement.addEventListener('pointermove', (e) => { mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); mouseInside = true; });
renderer.domElement.addEventListener('pointerleave', () => { mouseInside = false; });
renderer.domElement.addEventListener('pointerdown', (e) => {
  sound.resume();
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); mouseInside = true;
  if (e.shiftKey && e.button === 0 && !state.pilot) { const g = mouseGround(); if (g) { dragBox = g; controls.enabled = false; } return; }
  downAt = { x: e.clientX, y: e.clientY, b: e.button };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (dragBox) { dragBox = null; return; }
  if (downAt && downAt.b === 0 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) onTrigger();
  downAt = null;
});
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === ' ') { onTrigger(); e.preventDefault(); }
  if (k >= '1' && k <= '3') { state.fire = Number(k) - 1; contOn = false; }
  if (k === 'v') state.view = (state.view + 1) % VIEWS.length;
  if (k === 'n') cyclePlane(1);
  if (k === 'f' || k === 'y') nextWave();
  if (k === 'p') setRole(!state.pilot);
  if (k === 'o' || k === 'b') toggleMenu();
  if (k === 'l') { state.pred = !state.pred; air.showPrediction = state.pred; }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
document.getElementById('btn-menu').onclick = () => toggleMenu();
const menuPx = (e) => [e.offsetX * (menu.canvas.width / menu.canvas.clientWidth), e.offsetY * (menu.canvas.height / menu.canvas.clientHeight)];
menu.canvas.addEventListener('pointermove', (e) => { const [x, y] = menuPx(e); menu.hover = menu.hit(x, y); });
menu.canvas.addEventListener('pointerleave', () => { menu.hover = -1; });
menu.canvas.addEventListener('click', (e) => { const [x, y] = menuPx(e); const i = menu.hit(x, y); if (i >= 0) menuAction(menu.buttons[i].act); });
function desktopInput(dt) {
  if (state.pilot) {
    playerInput.turn = (keys.has('arrowleft') || keys.has('a') ? 1 : 0) - (keys.has('arrowright') || keys.has('d') ? 1 : 0);
    playerInput.climb = (keys.has('arrowup') || keys.has('w') ? 1 : 0) - (keys.has('arrowdown') || keys.has('s') ? 1 : 0);
    return;
  }
  if (dragBox) { const g = mouseGround(); if (g) { const h = box.max.y - box.min.y, y0 = box.min.y; box.min.set(Math.min(dragBox.x, g.x), y0, Math.min(dragBox.z, g.z)); box.max.set(Math.max(dragBox.x, g.x), y0 + h, Math.max(dragBox.z, g.z)); fixBox(); } }
  const sp = 300 * dt;
  if (keys.has('w')) moveBox(0, sp, 0);
  if (keys.has('s')) moveBox(0, -sp, 0);
  if (keys.has('arrowup')) moveBox(0, 0, -sp);
  if (keys.has('arrowdown')) moveBox(0, 0, sp);
  if (keys.has('arrowleft')) moveBox(-sp, 0, 0);
  if (keys.has('arrowright')) moveBox(sp, 0, 0);
  if (keys.has('q')) { box.max.y += sp * 0.5; box.min.y -= sp * 0.5; fixBox(); }
  if (keys.has('e')) { const m = (box.max.y + box.min.y) / 2; box.max.y = Math.max(m + 15, box.max.y - sp * 0.5); box.min.y = Math.min(m - 15, box.min.y + sp * 0.5); }
}
function resetView() {
  camera.position.set(0.55, 1.55, 0.45);
  tableRoot.position.set(0, 0.8, -1.18); tableRoot.rotation.set(0, 0, 0); tableRoot.scale.setScalar(TABLE_DEFAULT.scale);
  controls.target.set(0, 0.95, -0.7); controls.update();
}
resetView();
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

// ---------- sesja XR ----------
let xrFrames = 0, arMode = false, xrPilotPending = false;
async function startXR(mode) {
  try {
    sound.resume();
    const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    const ar = mode === 'immersive-ar';
    arMode = ar;
    env.visible = !ar; scene.background = ar ? null : SKY; scene.fog = ar ? null : new THREE.Fog(SKY, 10, 45);
    session.addEventListener('end', () => { arMode = false; if (state.pilot) setRole(false); env.visible = true; scene.background = SKY; scene.fog = new THREE.Fog(SKY, 10, 45); document.body.classList.remove('in-xr'); hud.mesh.visible = true; resetView(); });
    await renderer.xr.setSession(session);
    document.body.classList.add('in-xr');
    xrFrames = 0;
    if (state.pilot) { exitCockpit(); xrPilotPending = true; }
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
  const cam = sun.shadow.camera, r = 1.12 * s;
  cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 0.5 * s; cam.far = 6 * s;
  cam.updateProjectionMatrix();
  sun.shadow.normalBias = 0.0015 * s;
}

// AI dział, gdy gracz pilotuje: celują w przewidywane położenie samolotu gracza
function aiFlak() {
  const g = air.playerGroup();
  if (!g) return;
  const L = g.leader;
  for (const gun of flak.ready()) {
    if (Math.random() > 0.08) continue;
    const d = Math.hypot(L.pos.x - gun.x, L.pos.z - gun.z);
    if (d > 2600) continue;
    let p = L.pos.clone();
    for (let k = 0; k < 2; k++) { const s = flak.solve(gun, p); if (!s) break; p = air.predict(L, s.t); }
    flak.fireAt(gun, p, 110);
  }
}

function simStep(dt) {
  waveTimer -= dt;
  if (waveTimer <= 0 || (wave > 0 && !air.alive().filter((p) => !p.group.player).length && waveTimer > 8)) { if (waveTimer <= 0) nextWave(); else waveTimer = 8; }
  if (state.pilot && !air.playerGroup()) { respawnT -= dt; if (respawnT <= 0) spawnPlayer(); }
  air.update(dt, state.pilot ? playerInput : null);
  if (state.pilot) aiFlak();
  else {
    if (contOn) flak.fireContinuous(box);
    if (countdown === null) flak.aimIdle(new THREE.Vector3().addVectors(box.min, box.max).multiplyScalar(0.5));
  }
  flak.update(dt);
  effects.update(dt);
  terrain.update();
  if (countdown !== null) { countdown -= dt; if (countdown <= 0) { countdown = null; boomT = 1; } }
  boomT = Math.max(0, boomT - dt);
}

function hudState(tof) {
  const g = air.playerGroup(), L = g?.leader;
  return {
    pilot: state.pilot, wave, down: air.stats.down, escaped: air.stats.escaped,
    planes: air.alive().length, home: `${terrain.homeAlive()}/${terrain.home.houses.length}`,
    ready: flak.ready().length, guns: flak.guns.length, mode: FIRE_MODES[state.fire].name + (contOn ? ' · CIĄGŁY' : ''),
    countdown: countdown !== null ? Math.max(0, countdown) : null,
    tof: tof ? `${tof.min.toFixed(1)}–${tof.max.toFixed(1)} s` : null,
    box: `${Math.round(box.max.x - box.min.x)}×${Math.round(box.max.y - box.min.y)}×${Math.round(box.max.z - box.min.z)} m, wys. ${Math.round(box.min.y)}–${Math.round(box.max.y)} m`,
    alt: L ? Math.round(L.pos.y) : 0, spd: L ? Math.round(L.speed) : 0, hp: L ? L.hp : 0, bombs: g && !g.bombed ? 'gotowe' : 0,
    msg: flash.until > clockT ? flash.text : (wave === 0 ? `Pierwsza fala za ${Math.ceil(waveTimer)} s` : ''), msgColor: flash.color,
  };
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  clockT += dt;
  const xr = renderer.xr.isPresenting;
  controls.enabled = !xr && !dragBox && !state.pilot;
  if (xr) { xrFrames++; if (xrFrames === 3) { placeTable(); if (xrPilotPending) { xrPilotPending = false; enterCockpit(); } } pollXRInput(dt); } else desktopInput(dt);
  table.update();
  scene.updateMatrixWorld();
  const menuHit = updateMenuHover();
  simStep(dt);
  updateCockpit();
  scene.updateMatrixWorld();
  const center = new THREE.Vector3().addVectors(box.min, box.max).multiplyScalar(0.5);
  const tof = flak.flightTimes(center);
  const burstT = countdown !== null ? countdown : tof ? tof.max + (FIRE_MODES[state.fire].key === 'sync' ? 0.4 : 0) : 0;
  air.render(state.pilot ? 0 : burstT);
  updateBoxVis(tof ? burstT : 0);
  for (const o of ctrls) { if (!o.source) continue; o.ray.material.opacity = o === aimCtrl ? 0.7 : 0.2; o.ray.scale.z = menuHit && o === aimCtrl ? menuHit.distance : 0.6; }
  if (!state.pilot) updateSun();
  terrain.glowMaterial.color.setHex(table.active ? 0xbff4ff : 0x4fd2ff);
  hud.draw(hudState(tof));
  menu.draw({ pilot: state.pilot, fire: state.fire, guns: state.guns, view: state.view, pred: state.pred, burstR: state.burstR, speed: state.speed, maneuver: MANEUVER[state.maneuver] });
  const pip = updatePip(dt);
  if (!xr && !state.pilot) controls.update();
  if (pip && xr) renderPipToTarget(); else monitor.visible = false;
  renderer.render(scene, camera);
  // na komputerze: podgląd w rogu ekranu
  if (pip && !xr) {
    const w = Math.round(Math.min(480, window.innerWidth * 0.36)), h = Math.round(w / 1.6);
    pipCam.aspect = 1.6; pipCam.updateProjectionMatrix();
    renderer.setScissorTest(true);
    renderer.setViewport(16, 16, w, h); renderer.setScissor(16, 16, w, h);
    renderer.shadowMap.autoUpdate = false;
    renderer.render(scene, pipCam);
    renderer.shadowMap.autoUpdate = true;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  }
});

window.__flak = { simStep, THREE, flak, air, terrain, camera, controls, menuAction, state, get box() { return box; }, onTrigger, nextWave, setRole, moveBox, setBoxFromCorners };
