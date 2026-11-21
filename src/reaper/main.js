import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { CanvasPanel } from '../hud.js';
import { Room, NavGrid, itemsFromXR, simulatedItems } from './room.js';
import { Reaper, POSES, SWING, lerpPose, loadModel } from './reaper.js';
import { FirePortal, K_FULL } from './fire.js';
import { Afterlife, T_LIGHT } from './afterlife.js';
import { ReaperAudio } from './audio.js';

const params = new URLSearchParams(location.search);
const STOP = 1.85;          // odległość, z której kostucha tnie
const WALK_V = 0.5;         // m/s — powolny krok
const STEP_LEN = 0.62;
const BEHIND = 6.2;         // skąd słychać pierwsze kroki (za drzwiami)
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// ---------- panel ----------
class Panel extends CanvasPanel {
  constructor() { super(720, 600, 0.46); this.buttons = []; this.hover = -1; }
  hit(px, py) { return this.buttons.findIndex((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h); }
  draw(o) {
    const key = JSON.stringify([o, this.hover]);
    if (key === this.last) return;
    this.last = key;
    const c = this.ctx;
    this.background('rgba(160,30,24,0.8)');
    this.buttons = [];
    const btn = (x, y, w, h, label, act, accent) => {
      const i = this.buttons.length; this.buttons.push({ x, y, w, h, act });
      c.fillStyle = this.hover === i ? '#e8c0b0' : (accent || '#2e2224');
      this.roundRect(x, y, w, h, 12); c.fill();
      c.fillStyle = this.hover === i ? '#2a0806' : '#f2e6e0';
      let fs = 28; c.font = `bold ${fs}px system-ui, sans-serif`;
      while (c.measureText(label).width > w - 16 && fs > 12) { fs--; c.font = `bold ${fs}px system-ui, sans-serif`; }
      c.textAlign = 'center'; c.fillText(label, x + w / 2, y + h / 2 + 10); c.textAlign = 'left';
    };
    c.fillStyle = '#ff6a50'; c.font = 'bold 48px Georgia, serif'; c.fillText('KOSTUCHA', 30, 64);
    c.font = '24px system-ui, sans-serif';
    o.lines.forEach(([t, col], i) => { c.fillStyle = col || '#e6d8d2'; c.fillText(t, 30, 108 + i * 34); });
    let y = 108 + o.lines.length * 34 + 10;
    btn(30, y, 660, 80, o.picking ? 'Wskaż kontrolerem miejsce drzwi…' : '▶  START', o.picking ? 'pick' : 'start', o.picking ? '#5a4a1a' : '#7a1a14'); y += 94;
    btn(30, y, 325, 60, o.scan ? 'Skan: ukryj' : 'Skan: pokaż', 'scan'); btn(365, y, 325, 60, 'Wskaż drzwi ręcznie', 'pick'); y += 72;
    btn(30, y, 325, 60, 'Zeskanuj pokój', 'capture'); btn(365, y, 325, 60, o.xr ? 'Wyjdź' : 'Widok z góry', o.xr ? 'exit' : 'top'); y += 76;
    c.font = '20px system-ui, sans-serif'; c.fillStyle = '#a8908a';
    c.fillText(o.xr ? 'Spust: wybór · w trakcie sceny B/Y: przerwij' : 'Spacja: start · WASD + mysz: ruch · K: skan · M: widok z góry', 30, y + 10);
    this.tex.needsUpdate = true;
  }
}

// ---------- scena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.shadowMap.enabled = false;
document.getElementById('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const BG = new THREE.Color(0x07080a);
scene.background = BG;
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.02, 60);
scene.add(camera);
const hemi = new THREE.HemisphereLight(0x8c9ab8, 0x141210, 0.9);
const key = new THREE.DirectionalLight(0xc8d4ff, 1.4);
key.position.set(1, 3, 2);
scene.add(hemi, key);

const reaper = new Reaper();
scene.add(reaper.root);
const faceLight = new THREE.PointLight(0xbfc8ff, 1.2, 3.2, 1.6);
faceLight.position.set(0, 2.2, 0.9);
reaper.root.add(faceLight);
reaper.root.visible = false;
const audio = new ReaperAudio(camera, scene);
const fireP = new FirePortal();
const afterlife = new Afterlife(scene, camera);
let modelState = 'ładowanie';
loadModel('./assets/reaper/reaper.glb').then((g) => {
  reaper.useModel(g);
  reaper.root.traverse((o) => { if (o.material) reaperMats.add(o.material); });
  reaperStencil = null; modelState = 'ok';
}).catch((e) => { console.warn('Model kostuchy niedostępny', e); modelState = 'błąd'; });

// zaciemnienie pokoju (rysowane jako pierwsze, przyciemnia obraz z kamer) i czerń po cięciu
const darkMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, depthTest: false, depthWrite: false, transparent: false, opacity: 0,
  blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
const dark = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8), darkMat);
dark.renderOrder = -100; dark.frustumCulled = false; camera.add(dark);
const black = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 8), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, depthTest: false, depthWrite: false }));
black.renderOrder = 10000; black.frustumCulled = false; black.visible = false; camera.add(black);

const panel = new Panel();
scene.add(panel.mesh);
document.getElementById('hud').appendChild(panel.canvas);

// ---------- materiały okluderów / portalu ----------
const S1 = { stencilWrite: true, stencilRef: 1, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp };
const furnMat = new THREE.MeshLambertMaterial({ color: 0x3a3430 });
const wallMat = new THREE.MeshLambertMaterial({ color: 0x4a4744, side: THREE.DoubleSide, ...S1, stencilFunc: THREE.NotEqualStencilFunc });
const doorClosedMat = new THREE.MeshLambertMaterial({ color: 0x5a3c26, ...S1, stencilFunc: THREE.NotEqualStencilFunc });
const floorMat = new THREE.MeshLambertMaterial({ color: 0x2c2a28 });
const trimMat = new THREE.MeshLambertMaterial({ color: 0x3a2818 });
const tunnelMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, ...S1, stencilFunc: THREE.EqualStencilFunc, uniforms: { fire: { value: 0 } },
  vertexShader: 'varying vec3 vL; void main(){ vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float fire; varying vec3 vL;
    void main(){
      float d = clamp(-vL.z / 5.0, 0.0, 1.0);
      float fl = smoothstep(0.3, 0.0, vL.y) * 0.6;
      vec3 c = vec3(0.05, 0.045, 0.05) * (1.0 + fl);
      c = mix(c, vec3(0.0), pow(d, 0.55));
      c += vec3(0.42, 0.08, 0.02) * exp(vL.z * 1.1) * fire;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
// materiały kostuchy: za progiem widać ją tylko przez otwór drzwi
const reaperMats = new Set();
reaper.root.traverse((o) => { if (o.material) reaperMats.add(o.material); });
let reaperStencil = null;
function setReaperStencil(on) {
  if (reaperStencil === on) return;
  reaperStencil = on;
  for (const m of reaperMats) { Object.assign(m, S1); m.stencilWrite = on; m.stencilFunc = THREE.EqualStencilFunc; m.needsUpdate = true; }
}

const roomGroup = new THREE.Group(), doorGroup = new THREE.Group(), debugGroup = new THREE.Group();
scene.add(roomGroup, doorGroup, debugGroup);
debugGroup.visible = false;
const pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd040, depthTest: false }));
pathLine.renderOrder = 50; pathLine.frustumCulled = false;
scene.add(pathLine);

// mgła wypływająca z drzwi
const fogTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'); const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); return t; })();
const fog = Array.from({ length: 48 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fogTex, color: 0x9aa0a8, transparent: true, opacity: 0, depthWrite: false })); s.visible = false; scene.add(s); return { s, life: 0, max: 1, v: new THREE.Vector3() }; });

// ---------- stan ----------
const state = { phase: 'setup', t: 0, xr: false, ar: false, scan: false, picking: false, top: false, darkness: 0, flicker: 0, voice: '', msg: '' };
let room = null, nav = null, door = null, doorSource = 'auto', manualDoor = null;
const user = new THREE.Vector3(0, 1.65, 0);     // pozycja głowy gracza (świat)
const look = { yaw: 0, pitch: 0 };
const rp = { pos: new THREE.Vector3(), yaw: 0, path: null, wp: 1, replan: 0, stepAcc: 0, openA: 0, swingFired: false, voiced: false, voiceAt: 0 };
let swingAt = 3.5, cutDone = false, endShown = false, lastSig = '', scanTimer = 0, items = [];
let portalK = 0, fireK = 0, closeT = -1, glared = false;

function setUserFromCamera() {
  if (renderer.xr.isPresenting) camera.getWorldPosition(user);
}
function fwd() { return new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())); }

// ---------- budowa pokoju ----------
function geoFromTris(tris) {
  const a = new Float32Array(tris.length * 3);
  tris.forEach((p, i) => { a[i * 3] = p.x; a[i * 3 + 1] = p.y; a[i * 3 + 2] = p.z; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.computeVertexNormals();
  return g;
}
function clearGroup(g) { for (const c of [...g.children]) { g.remove(c); if (c !== fireP.group) c.traverse((o) => { if (o !== fireP.points) o.geometry?.dispose(); }); } }
function buildRoom(newItems) {
  items = newItems;
  room = new Room(items, user);
  nav = new NavGrid(room, user);
  clearGroup(roomGroup); clearGroup(debugGroup);
  for (const oc of room.occluders) {
    const m = new THREE.Mesh(geoFromTris(oc.tris), oc.kind === 'wall' ? wallMat : furnMat);
    m.renderOrder = oc.kind === 'wall' ? -2 : -4; m.userData.kind = oc.kind;
    roomGroup.add(m);
  }
  if (room.floorPoly && room.floorPoly.length >= 3) {
    const sh = new THREE.Shape(room.floorPoly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const fm = new THREE.Mesh(new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).translate(0, room.floorY - 0.002, 0), floorMat);
    fm.userData.kind = 'floor'; roomGroup.add(fm);
  }
  // podgląd skanu
  const line = (pts, color) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, depthTest: false })); l.renderOrder = 40; debugGroup.add(l); };
  const loop = (poly, y, color) => line([...poly, poly[0]].map(([x, z]) => new THREE.Vector3(x, y, z)), color);
  if (room.floorPoly) loop(room.floorPoly, room.floorY + 0.01, 0x40ff80);
  for (const w of room.walls) { line([new THREE.Vector3(w.a[0], w.y0, w.a[1]), new THREE.Vector3(w.b[0], w.y0, w.b[1]), new THREE.Vector3(w.b[0], w.y1, w.b[1]), new THREE.Vector3(w.a[0], w.y1, w.a[1]), new THREE.Vector3(w.a[0], w.y0, w.a[1])], 0x5aa0ff); }
  for (const o of room.obstacles) if (o.poly.length >= 3) { loop(o.poly, o.top, 0xff9a40); loop(o.poly, room.floorY + 0.01, 0xff9a40); }
  applyMode();
  chooseDoor();
}
function chooseDoor() {
  if (manualDoor) { door = manualDoor; doorSource = 'manual'; }
  else if (room.doors.length) {
    // przy kilku drzwiach: najdalsze od gracza
    door = room.doors.reduce((a, b) => (b.c.distanceTo(user) > a.c.distanceTo(user) ? b : a)); doorSource = 'auto';
  } else { door = room.fallbackDoor(user, fwd()); doorSource = room.walls.length ? 'wall' : 'portal'; }
  buildDoor();
}
let closedDoor = null;
function buildDoor() {
  clearGroup(doorGroup);
  const { c, n, w, h } = door;
  const rotY = Math.atan2(n.x, n.z);
  const g = new THREE.Group();
  g.position.copy(c); g.rotation.y = rotY;
  doorGroup.add(g);
  fireP.build(door);
  const tunnel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, h + 0.45, BEHIND + 1.2).translate(0, (h + 0.45) / 2 - 0.01, -(BEHIND + 1.2) / 2), tunnelMat);
  tunnel.renderOrder = -1;
  closedDoor = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03).translate(0, h / 2, 0.012), doorClosedMat);
  closedDoor.renderOrder = -2; closedDoor.userData.kind = 'visual';
  const trim = new THREE.Group(); trim.userData.kind = 'visual';
  for (const [x, y, sx, sy] of [[-w / 2 - 0.04, h / 2, 0.08, h + 0.08], [w / 2 + 0.04, h / 2, 0.08, h + 0.08], [0, h + 0.04, w + 0.16, 0.08]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.05), trimMat); b.position.set(x, y, 0.02); trim.add(b); }
  g.add(fireP.group, tunnel, closedDoor, trim);
  // podgląd skanu: drzwi
  const r = [[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h], [-w / 2, 0]].map(([x, y]) => new THREE.Vector3(x, y, 0.02));
  const dl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(r), new THREE.LineBasicMaterial({ color: 0xff3a3a, depthTest: false }));
  dl.renderOrder = 41; g.add(dl); dl.userData.kind = 'debug';
  applyMode();
  setPortal(0, 0);
}
function setPortal(k, f) {
  portalK = k; fireK = f;
  fireP.set(k, f);
  tunnelMat.uniforms.fire.value = f;
}
// AR: okludery niewidoczne (tylko głębia), wnętrze pokoju to obraz z kamer
function applyMode() {
  const vis = !state.ar;
  for (const m of [furnMat, wallMat]) { m.colorWrite = vis; m.needsUpdate = true; }
  roomGroup.traverse((o) => { if (o.userData.kind === 'floor') o.visible = vis; });
  doorGroup.traverse((o) => { if (o.userData.kind === 'visual') o.visible = vis; if (o.userData.kind === 'debug') o.visible = state.scan; });
  debugGroup.visible = state.scan;
  pathLine.visible = state.scan;
  scene.background = state.ar ? null : BG;
}

// ---------- sekwencja ----------
function resetVisuals() {
  black.visible = false; endShown = false; cutDone = false; closeT = -1; glared = false;
  afterlife.stop(); roomGroup.visible = doorGroup.visible = true;
  hemi.intensity = 0.9; key.intensity = 1.4; faceLight.intensity = 1.2;
  for (const f of fog) { f.life = 0; f.s.visible = false; }
  reaper.pose = { ...POSES.carry }; reaper.twist = 0; reaper.head.rotation.set(0, 0, 0);
  setPortal(0, 0);
}
function startSequence() {
  audio.resume();
  audio.silence();
  resetVisuals();
  state.picking = false;
  chooseDoor();
  rp.pos.copy(door.c).addScaledVector(door.n, -BEHIND);
  rp.yaw = Math.atan2(door.n.x, door.n.z);
  rp.path = null; rp.stepAcc = 0; rp.voiced = false;
  reaper.root.visible = true;
  setReaperStencil(true);
  setPhase('wait');
  panel.mesh.visible = false;
}
function abort() {
  audio.silence();
  resetVisuals();
  reaper.root.visible = false;
  setPhase('setup');
  showPanel();
}
function setPhase(p) { state.phase = p; state.t = 0; }
function planPath() {
  const p = nav.path([rp.pos.x, rp.pos.z], [user.x, user.z]);
  rp.path = p; rp.wp = 1; rp.replan = 0.7;
  if (p) { pathLine.geometry.dispose(); pathLine.geometry = new THREE.BufferGeometry().setFromPoints(p.map(([x, z]) => new THREE.Vector3(x, room.floorY + 0.03, z))); }
}
function walkTo(tx, tz, dt, v = WALK_V) {
  const dx = tx - rp.pos.x, dz = tz - rp.pos.z, d = Math.hypot(dx, dz);
  if (d < 1e-3) return 0;
  const want = Math.atan2(dx, dz);
  let dy = Math.atan2(Math.sin(want - rp.yaw), Math.cos(want - rp.yaw));
  const turn = Math.max(-1.8 * dt, Math.min(1.8 * dt, dy));
  rp.yaw += turn; dy -= turn;
  const s = Math.min(d, v * dt * Math.max(0.25, Math.cos(Math.min(1.5, Math.abs(dy)))));
  rp.pos.x += (dx / d) * s; rp.pos.z += (dz / d) * s;
  rp.stepAcc += s;
  if (rp.stepAcc >= STEP_LEN) { rp.stepAcc -= STEP_LEN; audio.step(new THREE.Vector3(rp.pos.x, room.floorY + 0.05, rp.pos.z), 1); }
  reaper.walk += (s / STEP_LEN) * Math.PI;
  return d - s;
}
function faceUser(dt, rate = 2) {
  const want = Math.atan2(user.x - rp.pos.x, user.z - rp.pos.z);
  const dy = Math.atan2(Math.sin(want - rp.yaw), Math.cos(want - rp.yaw));
  rp.yaw += Math.max(-rate * dt, Math.min(rate * dt, dy));
}
function spawnFog(dt, rate) {
  let n = rate * dt + (Math.random() < (rate * dt) % 1 ? 1 : 0);
  for (const f of fog) {
    if (n < 1) break;
    if (f.life > 0) continue;
    n--;
    f.life = f.max = 5 + Math.random() * 4;
    f.s.position.copy(door.c).addScaledVector(door.u, (Math.random() - 0.5) * door.w * 0.9).addScaledVector(door.n, 0.08); f.s.position.y += 0.05 + Math.random() * 0.3;
    f.v.copy(door.n).multiplyScalar(0.08 + Math.random() * 0.14).addScaledVector(door.u, (Math.random() - 0.5) * 0.12); f.v.y = 0.01;
    f.s.visible = true;
  }
}
function updateFog(dt) {
  for (const f of fog) {
    if (f.life <= 0) continue;
    f.life -= dt;
    if (f.life <= 0) { f.s.visible = false; continue; }
    const k = 1 - f.life / f.max;
    f.s.position.addScaledVector(f.v, dt); f.v.multiplyScalar(1 - dt * 0.15);
    f.s.scale.setScalar(0.35 + k * 1.3);
    f.s.material.opacity = 0.2 * Math.min(1, k * 5) * Math.min(1, (f.life / f.max) * 2);
  }
}

function update(dt) {
  state.t += dt;
  const ph = state.phase;
  const dUser = Math.hypot(user.x - rp.pos.x, user.z - rp.pos.z);
  let moving = false, targetDark = 0;
  if (ph === 'wait') {
    targetDark = 0.18; audio.droneLevel = Math.min(0.35, state.t * 0.1);
    if (state.t > 3.5) setPhase('steps');
  } else if (ph === 'steps') {
    targetDark = 0.3; audio.droneLevel = 0.4;
    const t = door.c.clone().addScaledVector(door.n, -0.75);
    moving = true;
    if (walkTo(t.x, t.z, dt) < 0.02) { setPhase('ignite'); audio.ignite(door.c.clone().setY(room.floorY + 1)); }
  } else if (ph === 'ignite') {
    // drzwi zapłonęły: płonący prostokąt, wnętrze wypala się w portal
    targetDark = 0.35;
    setPortal(K_FULL * ease(clamp01((state.t - 0.5) / 1.9)), clamp01(state.t / 0.7));
    if (state.t > 1.2) spawnFog(dt, 3);
    if (state.t > 4.0) setPhase('emerge');
  } else if (ph === 'emerge') {
    targetDark = 0.4; moving = true; spawnFog(dt, 4);
    const t = door.c.clone().addScaledVector(door.n, 0.55);
    if (walkTo(t.x, t.z, dt) < 0.02) { setPhase('walk'); planPath(); }
  } else if (ph === 'walk') {
    spawnFog(dt, 1.5);
    targetDark = 0.38 + 0.32 * clamp01(1 - (dUser - STOP) / 4);
    audio.droneLevel = 0.45 + 0.4 * clamp01(1 - (dUser - STOP) / 4);
    rp.replan -= dt;
    if (rp.replan <= 0) planPath();
    if (dUser <= STOP) setPhase('raise');
    else if (rp.path && rp.wp < rp.path.length) {
      moving = true;
      const [tx, tz] = rp.path[rp.wp];
      if (walkTo(tx, tz, dt) < 0.05) rp.wp++;
    } else if (dUser < STOP + 0.8) setPhase('raise');
    else { moving = true; walkTo(user.x, user.z, dt, WALK_V * 0.6); }    // brak ścieżki: prosto do gracza
    if (Math.random() < dt * 0.35) state.flicker = 0.12 + Math.random() * 0.1;
  } else if (ph === 'raise') {
    targetDark = 0.72; audio.droneLevel = 0.9;
    faceUser(dt, 2.2);
    if (dUser > STOP + 0.25) { moving = true; const k = (dUser - STOP) / dUser; walkTo(rp.pos.x + (user.x - rp.pos.x) * k, rp.pos.z + (user.z - rp.pos.z) * k, dt, 0.45); faceUser(dt, 2.2); }
    reaper.pose = lerpPose(POSES.carry, POSES.windup, ease(clamp01(state.t / 1.7)));
    reaper.twist = -0.25 * ease(clamp01(state.t / 1.7));
    if (!rp.voiced && state.t > 0.35) {
      rp.voiced = true;
      state.voice = audio.voice(reaper.root.localToWorld(new THREE.Vector3(0, 1.8, 0.1)));
      swingAt = state.t + (state.voice === 'file' ? 3.15 : 2.6);
    }
    if (rp.voiced && state.t >= swingAt) { setPhase('swing'); audio.whoosh(reaper.root.localToWorld(new THREE.Vector3(-0.6, 1.8, 0.4))); }
  } else if (ph === 'swing') {
    targetDark = 0.75;
    faceUser(dt, 3);
    const k = clamp01(state.t / 0.42), a = clamp01(state.t / 0.17);
    const neck = THREE.MathUtils.clamp(user.y - room.floorY - 0.2, 0.9, 1.85);
    const yaw = -2.3 + 3.6 * k * k;
    reaper.pose = { px: THREE.MathUtils.lerp(POSES.windup.px, SWING.px, a), py: THREE.MathUtils.lerp(POSES.windup.py, neck, a), pz: THREE.MathUtils.lerp(POSES.windup.pz, SWING.pz, a), pitch: THREE.MathUtils.lerp(POSES.windup.pitch, Math.PI / 2, a), yaw, lh: 1 };
    reaper.twist = THREE.MathUtils.clamp(yaw * 0.25, -0.5, 0.35);
    // cięcie: ostrze przechodzi przez szyję gracza
    const mid = reaper.root.localToWorld(reaper.scytheLocal(0.5, 1.27, 0, new THREE.Vector3()));
    if (!cutDone && (Math.hypot(mid.x - user.x, mid.z - user.z) < 0.35 || yaw >= 0.25)) cut();
  } else if (ph === 'black') {
    if (state.t > T_LIGHT) {
      // po ciemności: tunel i światło
      const f = fwd(); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
      black.visible = false; roomGroup.visible = doorGroup.visible = false;
      afterlife.start(user, Math.atan2(-f.x, -f.z));
      setPhase('light');
    }
  } else if (ph === 'light') {
    const r = afterlife.update(dt, user);
    audio.padLevel = 0.05 + 0.6 * r.light + 0.4 * r.approach;
    if (r.glare > 0 && !glared) { glared = true; audio.glare(); }
    endShown = r.done;
  }
  // portal gaśnie, gdy kostucha jest już w pokoju
  if (door && ['emerge', 'walk', 'raise', 'swing'].includes(ph)) {
    const inRoom = rp.pos.clone().sub(door.c).dot(door.n);
    if (closeT < 0 && inRoom > 1.4) closeT = 0;
    if (closeT >= 0) { closeT += dt; setPortal(K_FULL * (1 - ease(clamp01((closeT - 0.6) / 2.2))), Math.max(0, 1 - closeT / 2.8)); }
  }
  if (door) audio.setFirePos(door.c.clone().setY(room.floorY + door.h * 0.5));
  audio.fireLevel = ph === 'black' || ph === 'light' ? 0 : fireK;
  // kostucha: pozycja, widoczność przez próg
  reaper.root.position.set(rp.pos.x, room ? room.floorY : 0, rp.pos.z);
  reaper.root.rotation.y = rp.yaw;
  if (door && reaper.root.visible) {
    const depth = -(rp.pos.clone().sub(door.c).dot(door.n));        // >0 = za drzwiami
    setReaperStencil(depth > -0.35);
    const lightK = clamp01(1 - (depth - 0.3) / 3.5);
    hemi.intensity = 0.9 * (0.15 + 0.85 * lightK); key.intensity = 1.4 * lightK; faceLight.intensity = 1.2 * (0.25 + 0.75 * lightK);
  }
  reaper.lookAt = ph === 'steps' || ph === 'wait' ? null : user;
  reaper.viewer = user;
  reaper.update(dt, moving, WALK_V);
  updateFog(dt);
  fireP.update(dt, pointScale());
  // tętno i ciemność
  audio.bpm = ph === 'walk' ? 64 + 80 * clamp01(1 - (dUser - STOP) / 3.5) * (dUser < 5 ? 1 : 0) : ph === 'raise' || ph === 'swing' ? 150 : ph === 'ignite' || ph === 'emerge' ? 72 : 0;
  audio.update(dt);
  state.flicker = Math.max(0, state.flicker - dt);
  if (ph === 'setup' || ph === 'black' || ph === 'light') targetDark = 0;
  state.darkness += (targetDark - state.darkness) * Math.min(1, dt * 1.2);
  darkMat.opacity = Math.min(0.92, state.darkness + (state.flicker > 0 ? 0.3 : 0));
}
function pointScale() {
  if (renderer.xr.isPresenting) { const c0 = renderer.xr.getCamera().cameras[0]; if (c0) return (c0.viewport.w * c0.projectionMatrix.elements[5]) / 2; }
  return (renderer.domElement.height * camera.projectionMatrix.elements[5]) / 2;
}
function cut() {
  cutDone = true;
  audio.silence();
  audio.cut();
  black.visible = true;
  reaper.root.visible = false;
  setPortal(0, 0);
  for (const f of fog) { f.life = 0; f.s.visible = false; }
  for (const o of ctrls) { pulse(o, 1, 220); }
  setPhase('black');
}

// ---------- panel / akcje ----------
function panelLines() {
  const src = state.ar ? (items.length ? 'Skan pokoju z gogli' : 'Brak skanu pokoju — zrób go w ustawieniach przestrzeni') : state.xr ? 'Pokój zastępczy (VR)' : 'Pokój zastępczy (podgląd na komputerze)';
  const L = [[src, items.length || !state.ar ? '#e6d8d2' : '#ffb070']];
  if (room) {
    L.push([`Podłoga: ${room.floorPoly ? 'tak' : 'brak'} · ściany: ${room.walls.length} · meble: ${room.obstacles.length}`]);
    const ds = { auto: `Drzwi: znalezione w skanie${room.doors.length > 1 ? ` (${room.doors.length}, wybrane najdalsze)` : ''}`, manual: 'Drzwi: wskazane ręcznie', wall: 'Drzwi: brak w skanie — wejdzie z najdalszej ściany', portal: 'Drzwi: brak — otworzy się portal przed Tobą' }[doorSource];
    L.push([ds, doorSource === 'auto' || doorSource === 'manual' ? '#9fe0a0' : '#ffb070']);
  }
  if (modelState !== 'ok') L.push([modelState === 'błąd' ? 'Model kostuchy: błąd wczytania (zastępczy)' : 'Model kostuchy: wczytywanie…', '#ffb070']);
  L.push([state.voice === 'tts' ? 'Głos: syntezator przeglądarki' : 'Stań na środku pokoju i naciśnij START.', '#a8908a']);
  return L;
}
function showPanel() {
  panel.mesh.visible = renderer.xr.isPresenting;
  if (!renderer.xr.isPresenting) return;
  const p = camera.getWorldPosition(new THREE.Vector3()), f = fwd(); f.y = 0;
  if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
  f.normalize();
  panel.mesh.position.copy(p).addScaledVector(f, 0.85); panel.mesh.position.y -= 0.15;
  panel.mesh.lookAt(p.x, panel.mesh.position.y, p.z);
}
function action(a) {
  audio.resume();
  if (a === 'start') startSequence();
  else if (a === 'scan') { state.scan = !state.scan; applyMode(); }
  else if (a === 'pick') { state.picking = !state.picking; state.scan = state.scan || state.picking; applyMode(); }
  else if (a === 'capture') { const s = renderer.xr.getSession(); if (s?.initiateRoomCapture) s.initiateRoomCapture().catch?.(() => {}); else flash('Skanowanie pokoju: Ustawienia → Przestrzeń fizyczna → Ustawienia przestrzeni'); }
  else if (a === 'exit') renderer.xr.getSession()?.end();
  else if (a === 'top') { state.top = !state.top; }
}
let flashT = 0, flashMsg = '';
function flash(m) { flashMsg = m; flashT = 4; }
// wskazanie drzwi: promień w ścianę (albo w podłogę → wolnostojący portal)
const raycaster = new THREE.Raycaster();
function pickDoor(origin, dir) {
  raycaster.set(origin, dir);
  const walls = roomGroup.children.filter((m) => m.userData.kind === 'wall');
  const hit = raycaster.intersectObjects(walls, false)[0];
  if (hit) {
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld); n.y = 0;
    if (n.lengthSq() < 0.1) return false;
    n.normalize();
    if (n.dot(new THREE.Vector3(user.x - hit.point.x, 0, user.z - hit.point.z)) < 0) n.negate();
    manualDoor = room.door(hit.point.x + n.x * 0.02, hit.point.z + n.z * 0.02, n);
  } else {
    if (dir.y > -0.05) return false;
    const t = (room.floorY - origin.y) / dir.y, p = origin.clone().addScaledVector(dir, t);
    manualDoor = room.door(p.x, p.z, new THREE.Vector3(user.x - p.x, 0, user.z - p.z));
  }
  state.picking = false;
  chooseDoor();
  return true;
}

// ---------- XR ----------
const factory = new XRControllerModelFactory();
const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
function pulse(o, i, ms) { const a = o?.source?.gamepad?.hapticActuators?.[0]; if (a && a.pulse) a.pulse(i, ms).catch?.(() => {}); }
const ctrls = [0, 1].map((i) => {
  const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
  grip.add(factory.createControllerModel(grip));
  scene.add(c, grip);
  const ray = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
  ray.scale.z = 2; ray.visible = false; c.add(ray);
  const o = { c, grip, ray, source: null, hand: null, prev: [] };
  c.addEventListener('connected', (e) => { o.source = e.data; o.hand = e.data.handedness; });
  c.addEventListener('disconnected', () => { o.source = null; });
  c.addEventListener('selectstart', () => onTrigger(o));
  return o;
});
function ctrlRay(o) {
  const p = o.c.getWorldPosition(new THREE.Vector3()), d = new THREE.Vector3(0, 0, -1).applyQuaternion(o.c.getWorldQuaternion(new THREE.Quaternion()));
  return [p, d];
}
function onTrigger(o) {
  audio.resume();
  if (state.phase === 'black' || state.phase === 'light') { if (endShown) startSequence(); return; }
  if (state.phase !== 'setup') return;
  const [p, d] = ctrlRay(o);
  raycaster.set(p, d);
  if (panel.mesh.visible) {
    const hit = raycaster.intersectObject(panel.mesh, false)[0];
    if (hit) { const i = panel.hit(hit.uv.x * panel.canvas.width, (1 - hit.uv.y) * panel.canvas.height); if (i >= 0) { const a = panel.buttons[i].act; if (!(a === 'pick' && state.picking)) action(a); } return; }
  }
  if (state.picking) pickDoor(p, d);
}
function pollXR() {
  for (const o of ctrls) {
    const gp = o.source?.gamepad;
    o.ray.visible = !!o.source && (state.phase === 'setup');
    if (!gp) continue;
    const pr = gp.buttons.map((b) => b.pressed), down = (i) => pr[i] && !o.prev[i];
    if (down(5) && state.phase !== 'setup') abort();
    o.prev = pr;
    if (o.ray.visible && panel.mesh.visible) {
      const [p, d] = ctrlRay(o); raycaster.set(p, d);
      const hit = raycaster.intersectObject(panel.mesh, false)[0];
      o.ray.scale.z = hit ? hit.distance : 2;
      if (hit && (o.hand === 'right' || !ctrls.some((x) => x.hand === 'right' && x.source))) panel.hover = panel.hit(hit.uv.x * panel.canvas.width, (1 - hit.uv.y) * panel.canvas.height);
    }
  }
}
async function startXR(mode) {
  try {
    audio.resume();
    const ar = mode === 'immersive-ar';
    const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'hand-tracking', ...(ar ? ['plane-detection', 'mesh-detection'] : [])] });
    session.addEventListener('end', () => { state.xr = state.ar = false; document.body.classList.remove('in-xr'); abort(); manualDoor = null; buildRoom(simulatedItems()); resetDesktop(); });
    await renderer.xr.setSession(session);
    document.body.classList.add('in-xr');
    state.xr = true; state.ar = ar; lastSig = ''; scanTimer = 0; manualDoor = null;
    abort();
    if (!ar) buildRoom(simulatedItems());
    else { buildRoom([]); }
    xrFrames = 0;
  } catch (err) { console.error(err); alert('Nie udało się uruchomić sesji XR: ' + err.message); }
}
let xrFrames = 0;
// odczyt skanu co sekundę (tylko przed startem, potem pokój jest zamrożony)
function readScan(frame, dt) {
  if (!state.ar || state.phase !== 'setup' || !frame) return;
  scanTimer -= dt;
  if (scanTimer > 0) return;
  scanTimer = 1;
  const ref = renderer.xr.getReferenceSpace();
  const it = itemsFromXR(frame, ref);
  const sig = it.map((x) => x.label + x.pts.length + x.pts[0].x.toFixed(1)).join('|');
  if (sig !== lastSig) { lastSig = sig; buildRoom(it); }
}

// ---------- komputer ----------
const keys = new Set();
let drag = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  audio.resume(); drag = { x: e.clientX, y: e.clientY, moved: false };
});
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  look.yaw -= dx * 0.004; look.pitch = THREE.MathUtils.clamp(look.pitch - dy * 0.004, -1.4, 1.4);
  drag.x = e.clientX; drag.y = e.clientY;
});
window.addEventListener('pointerup', (e) => {
  if (drag && !drag.moved && state.picking && e.target === renderer.domElement) {
    const m = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(m, camera); pickDoor(raycaster.ray.origin.clone(), raycaster.ray.direction.clone());
  }
  drag = null;
});
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase(); keys.add(k);
  if (k === ' ') { e.preventDefault(); audio.resume(); if (state.phase === 'setup' || (state.phase === 'light' && endShown)) startSequence(); }
  if (k === 'escape' || k === 'b') abort();
  if (k === 'k') action('scan');
  if (k === 'm') action('top');
  if (k === 'p') action('pick');
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
const pxOf = (e) => [e.offsetX * (panel.canvas.width / panel.canvas.clientWidth), e.offsetY * (panel.canvas.height / panel.canvas.clientHeight)];
panel.canvas.addEventListener('pointermove', (e) => { const [x, y] = pxOf(e); panel.hover = panel.hit(x, y); });
panel.canvas.addEventListener('pointerleave', () => { panel.hover = -1; });
panel.canvas.addEventListener('click', (e) => { const [x, y] = pxOf(e); const i = panel.hit(x, y); if (i >= 0) action(panel.buttons[i].act); });
function resetDesktop() { user.set(0, 1.65, 0.2); look.yaw = 0.1; look.pitch = -0.05; }
function desktopCamera(dt) {
  const mx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0), mz = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
  if ((mx || mz) && state.phase !== 'black') {
    const f = new THREE.Vector3(-Math.sin(look.yaw), 0, -Math.cos(look.yaw)), r = new THREE.Vector3(-f.z, 0, f.x);
    user.addScaledVector(f, mz * 1.4 * dt).addScaledVector(r, mx * 1.4 * dt);
  }
  if (state.top) {
    const c = room?.floorPoly ? room.center : [0, 0];
    camera.position.set(c[0], 7.5, c[1] + 0.01); camera.lookAt(c[0], 0, c[1]);
  } else {
    camera.position.copy(user); camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
  }
}
const userMark = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 16), new THREE.MeshBasicMaterial({ color: 0x40a0ff }));
scene.add(userMark);
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
(async () => {
  const vrBtn = document.getElementById('btn-vr'), arBtn = document.getElementById('btn-ar'), note = document.getElementById('xr-note');
  vrBtn.onclick = () => startXR('immersive-vr'); arBtn.onclick = () => startXR('immersive-ar');
  if (!navigator.xr) { note.textContent = window.isSecureContext ? 'Ta przeglądarka nie obsługuje WebXR — podgląd na komputerze.' : 'WebXR wymaga HTTPS.'; vrBtn.disabled = arBtn.disabled = true; return; }
  const [vr, ar] = await Promise.all([navigator.xr.isSessionSupported('immersive-vr').catch(() => false), navigator.xr.isSessionSupported('immersive-ar').catch(() => false)]);
  vrBtn.disabled = !vr; arBtn.disabled = !ar;
  note.textContent = !vr && !ar ? 'Brak gogli — podgląd na komputerze w pokoju zastępczym.' : '';
})();

// ---------- pętla ----------
resetDesktop();
buildRoom(simulatedItems());
const clock = new THREE.Clock();
function frame(dt, xrFrame) {
  const xr = renderer.xr.isPresenting;
  if (xr) { xrFrames++; setUserFromCamera(); pollXR(); readScan(xrFrame, dt); if (xrFrames === 5 && state.phase === 'setup') showPanel(); }
  else { desktopCamera(dt); panel.mesh.visible = false; }
  update(dt);
  userMark.visible = !xr && state.top; userMark.position.set(user.x, (room?.floorY || 0) + 0.03, user.z);
  if (flashT > 0) flashT -= dt;
  panel.draw({ lines: flashT > 0 ? [...panelLines(), [flashMsg, '#ffe08a']] : panelLines(), scan: state.scan, picking: state.picking, xr });
}
renderer.setAnimationLoop((time, xrFrame) => {
  const dt = Math.min(0.05, clock.getDelta());
  frame(dt, xrFrame);
  renderer.render(scene, camera);
});
window.__reaper = { afterlife, fireP, get modelState() { return modelState; }, state, rp, reaper, user, look, startSequence, abort, action, frame, update, buildRoom, simulatedItems, camera, renderer, scene, THREE, get room() { return room; }, get nav() { return nav; }, get door() { return door; }, audio };
