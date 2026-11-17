import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { TableManipulator } from '../table.js';
import { PinField } from './pinfield.js';
import { Physics, Body, SHAPES } from './physics.js';
import { PRESETS } from './presets.js';
import { PROGRAMS, runPrograms, startProgram } from './programs.js';
import { BRUSH_OPS, brush, press, buildSurface, CurveLine } from './tools.js';
import { PinHud, PinMenu, CameraMonitor, TOOLS, PROGRAM_KEYS } from './ui.js';

const params = new URLSearchParams(location.search);
const RES_LIST = [150, 200, 250, 300, 400];
const opts = {
  cols: Number(params.get('cols')) || 300,
  maxH: 0.12, speed: 0.3, colorMode: 0, shadows: params.get('shadows') !== '0', touch: true,
};
const TABLE = { height: 0.8 };

// ---------- renderer / scena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY = new THREE.Color(0x1f2a33);
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 10, 45);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 200);
scene.add(camera);
const env = new THREE.Group();
scene.add(env);
{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3c5a78) }, bottom: { value: new THREE.Color(0x161c22) } },
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
scene.add(new THREE.HemisphereLight(0xe4f0ff, 0x4a3c28, 1.5));
const sun = new THREE.DirectionalLight(0xfff4e4, 2.4);
const SUN_DIR = new THREE.Vector3(0.5, 1, 0.3).normalize();
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0003;
scene.add(sun, sun.target);

// ---------- stół ----------
const tableRoot = new THREE.Group();
scene.add(tableRoot);
const field = new PinField(tableRoot, { cols: opts.cols, maxH: opts.maxH, speed: opts.speed });
field.setShadows(opts.shadows);
const W = field.cols * field.pitch, D = field.rows * field.pitch;
{
  const body = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.6, metalness: 0.3 });
  const add = (w, h, d, x, y, z, m = body) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.receiveShadow = true; o.castShadow = true; tableRoot.add(o); };
  const F = 0.06, T = 0.004;
  add(W + 2 * F, 0.16, D + 2 * F, 0, -0.08 - 0.0006, 0);
  add(F, T, D + 2 * F, -W / 2 - F / 2, T / 2, 0); add(F, T, D + 2 * F, W / 2 + F / 2, T / 2, 0);
  add(W, T, F, 0, T / 2, -D / 2 - F / 2); add(W, T, F, 0, T / 2, D / 2 + F / 2);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(W + 2 * F + 0.01, 0.008, D + 2 * F + 0.01), new THREE.MeshBasicMaterial({ color: 0x6fb4ff, toneMapped: false }));
  glow.position.y = -0.165; tableRoot.add(glow);
  tableRoot.userData.glow = glow;
  // bramownica z kamerą nad stołem
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a9098, roughness: 0.4, metalness: 0.6 });
  const H = 1.25;
  for (const s of [-1, 1]) add(0.04, H, 0.04, s * (W / 2 + F + 0.05), H / 2 - 0.16, 0, metal);
  add(W + 2 * F + 0.14, 0.05, 0.05, 0, H - 0.16, 0, metal);
  const cam = new THREE.Group();
  cam.position.set(0, H - 0.22, 0);
  const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.08), new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5 }));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.04, 20), new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.2, metalness: 0.8 }));
  lens.position.y = -0.05;
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3030, toneMapped: false }));
  led.position.set(0.045, -0.02, 0.04);
  cam.add(camBody, lens, led);
  tableRoot.add(cam);
  tableRoot.userData.led = led;
  // stożek widzenia kamery
  const apex = new THREE.Vector3(0, H - 0.29, 0);
  const corners = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]].map(([x, z]) => new THREE.Vector3(x, 0.002, z));
  const pts = [];
  for (let k = 0; k < 4; k++) pts.push(apex, corners[k], corners[k], corners[(k + 1) % 4]);
  const fr = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.18 }));
  tableRoot.add(fr);
}
const physics = new Physics(field, tableRoot);
const table = new TableManipulator(tableRoot);
const hud = new PinHud(), menu = new PinMenu(), monitor = new CameraMonitor();
monitor.mesh.position.set(-W / 2 - 0.32, 0.32, D / 2 - 0.35);
monitor.mesh.rotation.set(-0.15, 0.6, 0, 'YXZ');
tableRoot.add(monitor.mesh);
document.getElementById('hud').appendChild(hud.canvas);
document.getElementById('menu').appendChild(menu.canvas);
document.getElementById('cam').appendChild(monitor.canvas);
const curves = [new CurveLine(tableRoot, 0xff9a4a), new CurveLine(tableRoot, 0x4ad0ff)];

// ---------- stan ----------
let tool = 'brush', op = 0, prog = 0, radius = 0.04, anim = null, clockT = 0;
let flash = { text: '', until: 0, color: '#9fe8b0' };
let aim = null, menuHover = false, pendingBody = null, flattenLevel = 0, strokeOn = false;
const undo = [];
const msg = (text, color = '#9fe8b0') => { flash = { text, until: clockT + 3, color }; };
const ctxP = { msg };

function pushUndo() { undo.push(field.base.slice()); if (undo.length > 15) undo.shift(); }
function doUndo() { const b = undo.pop(); if (b && b.length === field.n) { field.base.set(b); msg('Cofnięto'); } }

function applyPreset(key, extra) {
  pushUndo();
  const p = PRESETS[key];
  p.run(field, extra);
  field.colorTex.needsUpdate = true;
  anim = p.anim ? key : null;
  msg(`Kształt: ${p.name}`);
}

function spawn(kind) {
  const b = new Body(kind, new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.25, (Math.random() - 0.5) * 0.3 + D * 0.15));
  b.quat.setFromEuler(new THREE.Euler(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3));
  physics.add(b);
  msg(`Dodano: ${SHAPES[kind].name}`);
}

function setResolution(dir) {
  const i = Math.max(0, Math.min(RES_LIST.length - 1, RES_LIST.indexOf(field.cols) + dir));
  if (RES_LIST[i] === field.cols) return;
  const old = { base: field.base, color: field.color, cols: field.cols, rows: field.rows };
  field.build(RES_LIST[i]);
  for (let r = 0; r < field.rows; r++) for (let c = 0; c < field.cols; c++) {
    const oc = Math.min(old.cols - 1, Math.floor((c / field.cols) * old.cols)), or = Math.min(old.rows - 1, Math.floor((r / field.rows) * old.rows));
    const i2 = r * field.cols + c, o = or * old.cols + oc;
    field.base[i2] = old.base[o];
    for (let k = 0; k < 4; k++) field.color[i2 * 4 + k] = old.color[o * 4 + k];
  }
  field.colorTex.needsUpdate = true;
  undo.length = 0;
  msg(`Rozdzielczość ${field.cols}×${field.rows} = ${(field.n / 1000).toFixed(0)} tys. pinów, pin ${(field.pitch * 1000).toFixed(1)} mm`);
}

function pickImage() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    const file = inp.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => applyPreset('image', { image: img });
    img.src = URL.createObjectURL(file);
  };
  inp.click();
}

function menuAction(act) {
  const [k, v] = act.split(':');
  switch (k) {
    case 'tool': tool = v; break;
    case 'op': tool = 'brush'; op = Number(v); break;
    case 'prog': tool = 'objects'; prog = Number(v); pendingBody = null; break;
    case 'stopall': for (const b of physics.bodies) { b.program = null; b.hover = false; if (!b.held) b.kinematic = false; } msg('Programy zatrzymane'); break;
    case 'spawn': spawn(v); break;
    case 'clearobj': physics.clear(); msg('Usunięto przedmioty'); break;
    case 'preset':
      if (v === 'image') pickImage();
      else if (v === 'text') applyPreset('text', { text: renderer.xr.isPresenting ? undefined : (prompt('Tekst na stole (\\n = nowa linia):', 'STÓŁ PINÓW') || '').replace(/\\n/g, '\n') || undefined });
      else applyPreset(v);
      break;
    case 'res-': setResolution(-1); break;
    case 'res+': setResolution(1); break;
    case 'maxh-': case 'maxh+': opts.maxH = Math.max(0.04, Math.min(0.3, opts.maxH + (k.endsWith('+') ? 0.02 : -0.02))); field.maxH = opts.maxH; field.uniforms.uMaxH.value = opts.maxH; break;
    case 'speed-': case 'speed+': opts.speed = Math.max(0.05, Math.min(2, opts.speed * (k.endsWith('+') ? 1.4 : 1 / 1.4))); field.speed = opts.speed; break;
    case 'colors': opts.colorMode = 1 - opts.colorMode; field.setColorMode(opts.colorMode); break;
    case 'shadows': opts.shadows = !opts.shadows; field.setShadows(opts.shadows); break;
    case 'touch': opts.touch = !opts.touch; break;
    case 'undo': doUndo(); break;
    case 'place': placeTable(); break;
    case 'close': toggleMenu(false); break;
    case 'mode': location.href = v; break;
    default: break;
  }
}

function toggleMenu(v) {
  const show = v ?? !menu.mesh.visible;
  menu.mesh.visible = show; hud.mesh.visible = !show;
  document.getElementById('menu').style.display = show ? 'block' : 'none';
}

function cycleSub() {
  if (tool === 'brush') op = (op + 1) % BRUSH_OPS.length;
  else if (tool === 'objects') { prog = (prog + 1) % PROGRAM_KEYS.length; pendingBody = null; }
  else tool = 'brush';
}

// ---------- celowanie ----------
const raycaster = new THREE.Raycaster();
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _inv = new THREE.Matrix4();
let aimCtrl = null;
function aimRay(ctrl) {
  if (renderer.xr.isPresenting) {
    const c = ctrl || aimCtrl;
    if (!c?.source) return false;
    c.c.getWorldPosition(_o); c.c.getWorldQuaternion(_q); _d.set(0, 0, -1).applyQuaternion(_q);
    return true;
  }
  if (!mouseInside) return false;
  raycaster.setFromCamera(mouse, camera);
  _o.copy(raycaster.ray.origin); _d.copy(raycaster.ray.direction);
  return true;
}
function computeAim(ctrl) {
  if (!aimRay(ctrl)) return null;
  raycaster.set(_o, _d);
  const hitB = raycaster.intersectObjects(physics.bodies.map((b) => b.mesh), false)[0];
  _inv.copy(tableRoot.matrixWorld).invert();
  const oL = _o.clone().applyMatrix4(_inv), dL = _d.clone().transformDirection(_inv);
  const s = tableRoot.scale.x;
  const hitP = field.raycast(oL, dL);
  const distP = hitP ? hitP.distanceTo(oL) * s : Infinity;
  if (hitB && hitB.distance < distP) return { body: hitB.object.userData.body, world: hitB.point.clone(), local: hitB.point.clone().applyMatrix4(_inv), origin: _o.clone() };
  if (!hitP) return null;
  return { local: hitP, world: hitP.clone().applyMatrix4(tableRoot.matrixWorld), origin: _o.clone() };
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

// znacznik pędzla (pierścień na powierzchni)
const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false, side: THREE.DoubleSide }));
ring.renderOrder = 20;
tableRoot.add(ring);
const targetMark = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 8).translate(0, 0.1, 0), new THREE.MeshBasicMaterial({ color: 0x7dffb0, toneMapped: false }));
targetMark.visible = false;
tableRoot.add(targetMark);

// ---------- akcje spustu ----------
function onTrigger(ctrl) {
  if (menuHover && menu.hover >= 0) { menuAction(menu.buttons[menu.hover].act); return; }
  if (tool === 'spline') return; // obsługa rysowania w pętli
  const a = computeAim(ctrl);
  if (tool === 'brush') {
    pushUndo(); strokeOn = true;
    if (a && !a.body) flattenLevel = field.heightAt(a.local.x, a.local.z);
    return;
  }
  if (tool === 'objects') {
    const key = PROGRAM_KEYS[prog];
    if (pendingBody && a && !a.body) {
      pendingBody.program.target = new THREE.Vector3(a.local.x, 0, a.local.z);
      targetMark.visible = true; targetMark.position.set(a.local.x, 0, a.local.z);
      msg(key === 'copy' ? 'Kopia kształtu w tym miejscu' : 'Cel ustawiony — piny przesuwają przedmiot');
      pendingBody = null;
      return;
    }
    if (!a || !a.body) { msg('Wskaż przedmiot (pomarańczowy, niebieski…)', '#ffd08a'); return; }
    const b = a.body;
    if (b.program && b.program.type === key) { b.program = null; msg(`${b.name}: stop`); return; }
    let extra = {};
    if (key === 'tip') {
      const from = (ctrl?.c || camera).getWorldPosition(new THREE.Vector3()).applyMatrix4(_inv.copy(tableRoot.matrixWorld).invert());
      extra.dir = new THREE.Vector3(b.pos.x - from.x, 0, b.pos.z - from.z);
    }
    startProgram(key, b, ctxP, extra);
    if (key === 'carry' || key === 'copy') { pendingBody = b; msg(`${PROGRAMS[key].name}: teraz wskaż miejsce na stole`, '#ffd08a'); }
  }
}

// ---------- kontrolery XR ----------
const factory = new XRControllerModelFactory();
const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
function attachPanels() {
  const off = ctrls.find((o) => o.source && o !== aimCtrl);
  if (!off) return;
  off.grip.add(hud.mesh); off.grip.add(menu.mesh);
  hud.mesh.position.set(0, 0.075, 0.035); hud.mesh.rotation.set(-0.75, 0, 0);
  menu.mesh.position.set(0, 0.2, -0.02); menu.mesh.rotation.set(-0.5, 0, 0);
}
const ctrls = [0, 1].map((i) => {
  const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
  grip.add(factory.createControllerModel(grip));
  scene.add(c, grip);
  const ray = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  ray.scale.z = 2; ray.visible = false; c.add(ray);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  tip.visible = false; scene.add(tip);
  const o = { c, grip, ray, tip, source: null, hand: null, prev: [], trig: false, held: null, hist: [] };
  c.addEventListener('connected', (e) => { o.source = e.data; o.hand = e.data.handedness; ray.visible = true; if (!aimCtrl || o.hand === 'right') aimCtrl = o; attachPanels(); });
  c.addEventListener('disconnected', () => { o.source = null; ray.visible = false; tip.visible = false; table.release(grip); if (aimCtrl === o) aimCtrl = ctrls.find((x) => x.source) || null; attachPanels(); });
  c.addEventListener('selectstart', () => {
    o.trig = true;
    if (tool !== 'spline' && !(menuHover && menu.hover >= 0) && aimCtrl !== o) { aimCtrl = o; attachPanels(); }
    if (tool === 'spline' && !(menuHover && menu.hover >= 0)) { const k = o.hand === 'left' ? 0 : 1; curves[k].clear(); o.drawing = k; }
    onTrigger(o);
  });
  c.addEventListener('selectend', () => { o.trig = false; strokeOn = ctrls.some((x) => x.trig) && strokeOn; o.drawing = undefined; maybeBuildSurface(); });
  c.addEventListener('squeezestart', () => grabStart(o));
  c.addEventListener('squeezeend', () => grabEnd(o));
  return o;
});

// chwytanie przedmiotów (gdy blisko) albo stołu
function ctrlLocal(o) { return o.grip.getWorldPosition(new THREE.Vector3()).applyMatrix4(_inv.copy(tableRoot.matrixWorld).invert()); }
function grabStart(o) {
  const p = ctrlLocal(o);
  let best = null, bd = Infinity;
  for (const b of physics.bodies) { const d = b.pos.distanceTo(p); if (d < b.radius + 0.05 / tableRoot.scale.x && d < bd) { bd = d; best = b; } }
  if (!best) { table.grab(o.grip); return; }
  o.held = best; best.held = true; best.kinematic = true; best.hover = false;
  if (best.program && best.program.type !== 'support') best.program = null;
  // przesunięcie przedmiotu względem kontrolera (w układzie stołu)
  const gq = o.grip.getWorldQuaternion(new THREE.Quaternion()), tq = tableRoot.getWorldQuaternion(new THREE.Quaternion());
  const ql = tq.clone().invert().multiply(gq);
  o.heldOff = best.pos.clone().sub(p).applyQuaternion(ql.clone().invert());
  o.heldRot = ql.clone().invert().multiply(best.quat);
  o.hist = [];
}
function grabEnd(o) {
  if (!o.held) { table.release(o.grip); return; }
  const b = o.held;
  o.held = null; b.held = false;
  const supportMode = (tool === 'objects' && PROGRAM_KEYS[prog] === 'support') || (b.program && b.program.type === 'support');
  if (supportMode) {
    b.hover = true; b.kinematic = true;
    startProgram('support', b, ctxP);
    msg(`${b.name}: piny podjeżdżają, by go podeprzeć`);
  } else {
    b.kinematic = false;
    if (o.hist.length > 2) {
      const a = o.hist[0], z = o.hist[o.hist.length - 1];
      b.vel.copy(z.p).sub(a.p).multiplyScalar(1 / Math.max(0.01, z.t - a.t));
    }
    b.ang.set(0, 0, 0);
  }
}
function updateHeld(dt) {
  for (const o of ctrls) {
    if (!o.held) continue;
    const p = ctrlLocal(o);
    const gq = o.grip.getWorldQuaternion(new THREE.Quaternion()), tq = tableRoot.getWorldQuaternion(new THREE.Quaternion());
    const ql = tq.invert().multiply(gq);
    o.held.pos.copy(p).add(o.heldOff.clone().applyQuaternion(ql));
    o.held.quat.copy(ql).multiply(o.heldRot);
    o.held.vel.set(0, 0, 0); o.held.ang.set(0, 0, 0);
    o.held.sync();
    o.hist.push({ p: o.held.pos.clone(), t: clockT }); if (o.hist.length > 6) o.hist.shift();
  }
}

function maybeBuildSurface() {
  if (tool !== 'spline' || ctrls.some((x) => x.trig) || desktopDrawing) return;
  const cs = curves.map((c) => c.pts).filter((p) => p.length > 3);
  if (!cs.length) return;
  pushUndo();
  if (buildSurface(field, cs)) msg(cs.length >= 2 ? 'Powierzchnia z dwóch splajnów' : 'Grzbiet wzdłuż splajnu');
  setTimeout(() => { if (!ctrls.some((x) => x.trig)) curves.forEach((c) => c.clear()); }, 1500);
}

function pollXRInput(dt) {
  for (const o of ctrls) {
    const gp = o.source?.gamepad;
    if (!gp) continue;
    const pressed = gp.buttons.map((b) => b.pressed);
    const down = (i) => pressed[i] && !o.prev[i];
    const ax = gp.axes[2] || 0, ay = gp.axes[3] || 0;
    if (o.hand === 'right') {
      if (down(4)) cycleSub();
      if (down(5)) toggleMenu();
      if (Math.abs(ay) > 0.2 && aim && !aim.body && !menuHover) brush(field, ay < 0 ? 'raise' : 'lower', aim.local.x, aim.local.z, radius, dt * Math.abs(ay), { rate: 0.15 });
      if (Math.abs(ax) > 0.3) radius = Math.max(0.006, Math.min(0.25, radius * Math.exp(ax * dt * 1.5)));
    } else if (o.hand === 'left') {
      if (down(4)) placeTable();
      if (down(5)) doUndo();
      if (Math.abs(ax) > 0.2 || Math.abs(ay) > 0.2) {
        const pivot = aim ? aim.world : tableRoot.getWorldPosition(new THREE.Vector3());
        table.nudge(pivot, Math.exp(-ay * dt * 1.4), -ax * dt * 1.6);
      }
    }
    // rysowanie splajnu końcówką kontrolera
    if (o.drawing !== undefined) {
      const tipP = o.c.localToWorld(new THREE.Vector3(0, 0, -0.03)).applyMatrix4(_inv.copy(tableRoot.matrixWorld).invert());
      curves[o.drawing].add(tipP);
    }
    // wciskanie pinów końcówką kontrolera
    if (opts.touch && !o.held) {
      const tipP = o.c.localToWorld(new THREE.Vector3(0, 0, -0.02)).applyMatrix4(_inv.copy(tableRoot.matrixWorld).invert());
      if (press(field, tipP.x, tipP.y, tipP.z, 0.012 / tableRoot.scale.x) && clockT - (o.lastPulse || 0) > 0.08) { o.lastPulse = clockT; o.source.gamepad.hapticActuators?.[0]?.pulse?.(0.15, 20); }
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
  tableRoot.scale.setScalar(1);
  const dist = 0.3 + D / 2;
  const y = renderer.xr.isPresenting ? THREE.MathUtils.clamp(p.y - 0.75, 0.5, 1.0) : TABLE.height;
  tableRoot.position.set(p.x + f.x * dist, y, p.z + f.z * dist);
  tableRoot.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
  if (table.active) table.begin();
}

// ---------- komputer ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minDistance = 0.05; controls.maxDistance = 8;
const mouse = new THREE.Vector2();
let mouseInside = false, downAt = null, desktopDrawing = false, shiftBrush = false, drawLift = 0.05;
const keys = new Set();
renderer.domElement.addEventListener('pointermove', (e) => { mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); mouseInside = true; });
renderer.domElement.addEventListener('pointerleave', () => { mouseInside = false; });
renderer.domElement.addEventListener('pointerdown', (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); mouseInside = true;
  if (e.shiftKey && e.button === 0) {
    controls.enabled = false;
    if (tool === 'spline') { const k = curves[0].pts.length > 3 && !curves[1].pts.length ? 1 : 0; if (k === 0) curves.forEach((c) => c.clear()); desktopDrawing = k + 1; }
    else { shiftBrush = true; pushUndo(); const a = computeAim(); if (a && !a.body) flattenLevel = field.heightAt(a.local.x, a.local.z); }
    return;
  }
  downAt = { x: e.clientX, y: e.clientY, b: e.button };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (desktopDrawing) { const k = desktopDrawing; desktopDrawing = false; if (k === 2) maybeBuildSurface(); else msg('Pierwszy splajn gotowy — narysuj drugi (Shift) albo Enter'); return; }
  if (shiftBrush) { shiftBrush = false; return; }
  if (downAt && downAt.b === 0 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) { onTrigger(null); strokeOn = false; }
  downAt = null;
});
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k >= '1' && k <= '5') { tool = 'brush'; op = Number(k) - 1; }
  if (k === 'o' || k === 'b') toggleMenu();
  if (k === 'a') cycleSub();
  if (k === '[') radius = Math.max(0.006, radius / 1.25);
  if (k === ']') radius = Math.min(0.25, radius * 1.25);
  if (k === 'z' || k === 'y') doUndo();
  if (k === 'enter') maybeBuildSurface();
  if (k === 'w') drawLift = Math.min(0.2, drawLift + 0.01);
  if (k === 's') drawLift = Math.max(0, drawLift - 0.01);
  if (k === 't') tool = TOOLS[(TOOLS.findIndex((t) => t.key === tool) + 1) % TOOLS.length].key;
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
document.getElementById('btn-menu').onclick = () => toggleMenu();
const menuPx = (e) => [e.offsetX * (menu.canvas.width / menu.canvas.clientWidth), e.offsetY * (menu.canvas.height / menu.canvas.clientHeight)];
menu.canvas.addEventListener('pointermove', (e) => { const [x, y] = menuPx(e); menu.hover = menu.hit(x, y); });
menu.canvas.addEventListener('pointerleave', () => { menu.hover = -1; });
menu.canvas.addEventListener('click', (e) => { const [x, y] = menuPx(e); const i = menu.hit(x, y); if (i >= 0) menuAction(menu.buttons[i].act); });
function resetView() {
  camera.position.set(0.9, 1.75, 1.75);
  tableRoot.position.set(0, TABLE.height, 0); tableRoot.rotation.set(0, 0, 0); tableRoot.scale.setScalar(1);
  controls.target.set(0, TABLE.height, 0.1); controls.update();
}
resetView();
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

// ---------- sesja XR ----------
let xrFrames = 0;
async function startXR(mode) {
  try {
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

// ---------- pętla ----------
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
const SIN = new Float32Array(1024); for (let i = 0; i < 1024; i++) SIN[i] = Math.sin((i / 1024) * Math.PI * 2);
let dist = null;
function waves(t) {
  if (!dist || dist.length !== field.n) {
    dist = new Float32Array(field.n);
    for (let r = 0; r < field.rows; r++) for (let c = 0; c < field.cols; c++) dist[r * field.cols + c] = Math.hypot(field.cx(c), field.cz(r) * 0.9);
  }
  const T = field.target, A = 0.018, k = 1024 / 0.22, ph = t * 0.35 * 1024;
  for (let i = 0; i < field.n; i++) T[i] += A * (1 + SIN[((dist[i] * k - ph) | 0) & 1023]) * 0.5;
}
function updateSun() {
  const c = tableRoot.getWorldPosition(tmpV), s = tableRoot.scale.x;
  sun.position.copy(c).addScaledVector(SUN_DIR, 3 * s); sun.target.position.copy(c); sun.target.updateMatrixWorld();
  const cam = sun.shadow.camera, r = 1.35 * s;
  cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 0.5 * s; cam.far = 6 * s;
  cam.updateProjectionMatrix();
  sun.shadow.normalBias = 0.0008 * s;
}
function updateRays(menuHit) {
  for (const o of ctrls) {
    if (!o.source) continue;
    const isAim = o === aimCtrl;
    o.ray.material.opacity = isAim ? 0.75 : 0.25; o.tip.visible = false; o.ray.scale.z = 1.5;
    if (!isAim) continue;
    if (menuHit) { o.ray.scale.z = menuHit.distance; o.tip.visible = true; o.tip.position.copy(menuHit.point); }
    else if (aim) { o.ray.scale.z = aim.origin.distanceTo(aim.world); o.tip.visible = true; o.tip.position.copy(aim.world); }
  }
}
let fpsAcc = 0, fpsN = 0, fps = 0, camT = 0;
function hudState() {
  const sub = tool === 'brush' ? BRUSH_OPS[op].name : tool === 'objects' ? PROGRAMS[PROGRAM_KEYS[prog]].name : 'rysuj obiema rękami';
  const hint = tool === 'brush' ? 'Trzymaj spust i maluj po pinach' : tool === 'objects' ? (pendingBody ? 'Wskaż miejsce docelowe na stole' : PROGRAMS[PROGRAM_KEYS[prog]].hint) : '2 krzywe → powierzchnia, 1 krzywa → grzbiet';
  return {
    cols: field.cols, rows: field.rows, fps, tool: TOOLS.find((t) => t.key === tool).name, sub, radius,
    pin: (field.pitch * 1000).toFixed(1), maxH: Math.round(opts.maxH * 100), hint,
    msg: flash.until > clockT ? flash.text : '', msgColor: flash.color,
  };
}

// cele pinów = warstwa bazowa + animacja + programy przedmiotów, potem ruch pinów i fizyka
function simStep(dt) {
  field.target.set(field.base);
  field.boost.fill(0);
  if (anim === 'waves') waves(clockT);
  updateHeld(dt);
  runPrograms(field, physics.bodies, dt, ctxP);
  field.update(dt);
  physics.step(dt);
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  clockT += dt;
  fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  const xr = renderer.xr.isPresenting;
  controls.enabled = !xr && !desktopDrawing && !shiftBrush;
  if (xr) { xrFrames++; if (xrFrames === 3) placeTable(); }
  table.update();
  scene.updateMatrixWorld();
  const menuHit = updateMenuHover();
  aim = computeAim();
  if (xr) pollXRInput(dt);

  // pędzel trzymany spustem (VR) lub Shift (komputer)
  const painting = tool === 'brush' && ((xr && aimCtrl?.trig) || shiftBrush);
  if (painting && aim && !aim.body && !menuHover) brush(field, BRUSH_OPS[op].key, aim.local.x, aim.local.z, radius, dt, { level: flattenLevel });
  if (!xr && aim && !aim.body) {
    if (keys.has('q')) brush(field, 'raise', aim.local.x, aim.local.z, radius, dt, { rate: 0.15 });
    if (keys.has('e')) brush(field, 'lower', aim.local.x, aim.local.z, radius, dt, { rate: 0.15 });
  }
  if (desktopDrawing && aim) curves[desktopDrawing - 1].add(aim.local.clone().add(new THREE.Vector3(0, drawLift, 0)));

  simStep(dt);
  for (const b of physics.bodies) b.outline.material.opacity = b.program ? 0.6 + 0.4 * Math.sin(clockT * 6) : 0;

  // wskaźniki
  ring.visible = !!(aim && !aim.body && tool !== 'objects');
  if (ring.visible) { ring.position.copy(aim.local).add(new THREE.Vector3(0, 0.002, 0)); ring.scale.setScalar(radius); }
  if (targetMark.visible && !physics.bodies.some((b) => b.program && b.program.target)) targetMark.visible = false;
  camT += dt;
  if (camT > 0.25) { camT = 0; monitor.update(field, physics.bodies, clockT); }
  tableRoot.userData.led.visible = Math.floor(clockT * 2) % 2 === 0;
  tableRoot.userData.glow.material.color.setHex(table.active ? 0xbfe4ff : 0x6fb4ff);
  updateSun();
  updateRays(menuHit);
  hud.draw(hudState());
  menu.draw({ tool, op, prog, cols: field.cols, rows: field.rows, maxH: opts.maxH, speed: opts.speed, colorMode: opts.colorMode, shadows: opts.shadows, touch: opts.touch, anim });
  if (!xr) controls.update();
  renderer.render(scene, camera);
});

applyPreset('face');
undo.length = 0;
spawn('box');
window.__pins = { simStep, THREE, field, physics, applyPreset, spawn, menuAction, startProgram, camera, controls, curves, buildSurface, Body, ctxP, setResolution, tableRoot, get fps() { return fps; } };
