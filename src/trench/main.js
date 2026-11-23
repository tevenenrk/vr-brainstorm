import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { CanvasPanel } from '../hud.js';
import { TrenchMap, FLOOR, DUG_FLOOR } from './world.js';
import { Troops, MAG } from './soldiers.js';
import { GUNS, POUCH_CAP, rifleMesh, pistolMesh, knifeMesh, magMesh, grenadeMesh, Items, Minigun, Fx } from './gear.js';
import { TrenchAudio } from './audio.js';

const params = new URLSearchParams(location.search);
const EYE_T = 0.52;                    // wysokość oczu stojącego gracza nad gruntem (tuż nad workami)
const ALLIES = 8;
const rnd = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const V = () => new THREE.Vector3();

// ---------- scena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
renderer.shadowMap.enabled = params.get('shadows') === '1';
document.getElementById('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const FOG = new THREE.Color(0x6a6a66);
scene.background = FOG;
scene.fog = new THREE.FogExp2(FOG, 0.0085);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 600);
camera.rotation.order = 'YXZ';
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x4a5058) }, mid: { value: new THREE.Color(0x8a7a6a) }, bot: { value: FOG } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top, mid, bot; varying vec3 vP; void main(){ float y = vP.y; vec3 c = y < 0.05 ? mix(bot, mid, smoothstep(-0.05, 0.05, y)) : mix(mid, top, smoothstep(0.05, 0.5, y)); gl_FragColor = vec4(c, 1.0); }' }));
  sky.frustumCulled = false; sky.renderOrder = -1;
  scene.add(sky);
}
scene.add(new THREE.HemisphereLight(0xc8ccd0, 0x4a3c2c, 1.5));
const sun = new THREE.DirectionalLight(0xffd8b0, 1.6);
sun.position.set(-40, 30, -60); sun.castShadow = renderer.shadowMap.enabled;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 200 });
scene.add(sun);

const map = new TrenchMap();
scene.add(map.group);
const troops = new Troops(map, scene);
const items = new Items(map, scene);
const fx = new Fx(scene);
const audio = new TrenchAudio(camera, scene);
const guns = map.mgPos.map((p) => new Minigun(p, scene));
// skrzynki pod posterunkami (stopień strzelecki)
{
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.16, 0.38).translate(0, 0.08, 0), new THREE.MeshLambertMaterial({ color: 0x5a4632 }), map.posts.length);
  map.posts.forEach((p, i) => m.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, FLOOR, p.y)));
  scene.add(m);
}

// ---------- arsenał w ziemiance ----------
const ars = { rifle: 40, pistol: 20, grenade: 24 };
troops.arsenal = ars;
const crates = [['rifle', -2.3], ['pistol', 0], ['grenade', 2.3]].map(([type, x]) => {
  const g = new THREE.Group(); g.position.set(x, DUG_FLOOR, 24.1);
  const wood = new THREE.MeshLambertMaterial({ color: 0x6a5034 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.6).translate(0, 0.03, 0), wood));
  for (const [w, d, px, pz] of [[1.0, 0.04, 0, 0.28], [1.0, 0.04, 0, -0.28], [0.04, 0.6, 0.48, 0], [0.04, 0.6, -0.48, 0]]) g.add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.55, d).translate(px, 0.3, pz), wood));
  const fill = new THREE.Group(); g.add(fill);
  for (let k = 0; k < 12; k++) {
    const m = type === 'grenade' ? grenadeMesh() : magMesh(type);
    m.position.set(-0.38 + (k % 6) * 0.15, type === 'grenade' ? 0.5 : 0.58, -0.12 + Math.floor(k / 6) * 0.22);
    if (type !== 'grenade') m.rotation.x = 0.2;
    fill.add(m);
  }
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  label.position.set(0, 0.36, -0.31); label.rotation.y = Math.PI; g.add(label);
  scene.add(g);
  const box = new THREE.Box3(new THREE.Vector3(x - 0.55, DUG_FLOOR, 23.75), new THREE.Vector3(x + 0.55, DUG_FLOOR + 0.85, 24.45));
  const names = { rifle: 'MAGAZYNKI KARABIN', pistol: 'MAGAZYNKI PISTOLET', grenade: 'GRANATY' };
  return { type, g, fill, box, center: box.getCenter(new THREE.Vector3()), draw: () => { const c = cv.getContext('2d'); c.fillStyle = '#d8c8a0'; c.fillRect(0, 0, 256, 96); c.fillStyle = '#2a1a0a'; c.font = 'bold 24px system-ui'; c.textAlign = 'center'; c.fillText(names[type], 128, 36); c.font = 'bold 40px system-ui'; c.fillText(`${ars[type]}`, 128, 82); tex.needsUpdate = true; fill.children.forEach((m, i) => { m.visible = i < Math.ceil(ars[type] / 3); }); } };
});
const drawCrates = () => crates.forEach((c) => c.draw());
drawCrates();

// ---------- gracz ----------
const P = { isPlayer: true, side: 0, alive: true, hp: 100, regenT: 0, x: 0, z: 0, head: V(), chest: V(), speed: 0, kills: 0,
  rifle: { mag: { rounds: 30 }, cd: 0, kick: 0, mesh: rifleMesh() }, pistol: { mag: { rounds: 12 }, cd: 0, kick: 0, mesh: pistolMesh() }, knife: { mesh: knifeMesh() },
  pouch: { rifle: [30, 30, 30, 30], pistol: [12, 12], grenade: 2 } };
for (const k of ['rifle', 'pistol', 'knife']) scene.add(P[k].mesh);
let base = FLOOR, bodyYaw = 0, crouch = false;
const state = { phase: 'idle', wave: 0, timer: 0, paused: false, msg: '', msgT: 0, msgCol: '#ffe8b0', hurt: 0, dead: 0 };
function placeRig(x, z) { rig.position.set(x, map.floorAt(x, z) - FLOOR + base, z); }
placeRig(map.spawnPoint.x, map.spawnPoint.y + 0.3);

// ---------- panele ----------
class Wrist extends CanvasPanel {
  constructor() { super(520, 350, 0.14); }
  draw(s) {
    const key = JSON.stringify(s); if (key === this.last) return; this.last = key;
    const c = this.ctx, W = this.canvas.width;
    this.background(s.hp < 35 ? 'rgba(255,90,70,0.9)' : 'rgba(200,190,140,0.7)');
    c.textAlign = 'left'; c.fillStyle = '#f0e6c8'; c.font = 'bold 34px system-ui'; c.fillText(s.title, 24, 48);
    c.textAlign = 'right'; c.font = 'bold 26px system-ui'; c.fillStyle = '#ffb4a0'; c.fillText(`☠ ${s.kills}`, W - 24, 46);
    c.textAlign = 'left';
    c.fillStyle = '#3a1a14'; c.fillRect(24, 64, W - 48, 22); c.fillStyle = s.hp < 35 ? '#ff4a3a' : '#7ad06a'; c.fillRect(24, 64, (W - 48) * s.hp / 100, 22);
    c.font = '25px system-ui'; c.fillStyle = '#e8e0c8';
    c.fillText(`Karabin: ${s.r} · w kieszeni ${s.rp}`, 24, 124);
    c.fillText(`Pistolet: ${s.p} · w kieszeni ${s.pp}`, 24, 158);
    c.fillText(`Granaty: ${s.g}   ·   Obrońcy: ${s.allies}`, 24, 192);
    c.fillStyle = '#c8b890'; c.font = '22px system-ui';
    c.fillText(`Arsenał: ${s.ar} mag. kar. · ${s.ap} mag. pist. · ${s.ag} gran.`, 24, 228);
    c.fillStyle = s.subCol || '#ffd890'; c.font = 'bold 24px system-ui'; c.fillText(s.sub, 24, 272);
    c.fillStyle = '#b8b0a0'; c.font = '19px system-ui'; c.fillText(s.hint, 24, 318);
    this.tex.needsUpdate = true;
  }
}
class Banner extends CanvasPanel {
  constructor() { super(900, 150, 0.9); this.mesh.material.depthTest = false; this.mesh.renderOrder = 9000; }
  draw(text, col) {
    if (this.last === text + col) return; this.last = text + col;
    const c = this.ctx; c.clearRect(0, 0, 900, 150);
    if (!text) { this.tex.needsUpdate = true; return; }
    c.fillStyle = 'rgba(10,10,8,0.55)'; this.roundRect(10, 20, 880, 110, 24); c.fill();
    c.fillStyle = col; c.textAlign = 'center'; let fs = 46; c.font = `bold ${fs}px system-ui`;
    while (c.measureText(text).width > 840 && fs > 20) { fs -= 2; c.font = `bold ${fs}px system-ui`; }
    c.fillText(text, 450, 92); this.tex.needsUpdate = true;
  }
}
class Menu extends CanvasPanel {
  constructor() { super(720, 640, 0.6); this.buttons = []; this.hover = -1; this.mesh.visible = false; this.mesh.material.depthTest = false; this.mesh.renderOrder = 9500; }
  hit(px, py) { return this.buttons.findIndex((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h); }
  draw(o) {
    const key = JSON.stringify([o, this.hover]); if (key === this.last) return; this.last = key;
    const c = this.ctx; this.background('#b8a878'); this.buttons = [];
    const btn = (x, y, w, h, label, act, accent) => { const i = this.buttons.length; this.buttons.push({ x, y, w, h, act }); c.fillStyle = this.hover === i ? '#f4e0b0' : accent || '#3a3228'; this.roundRect(x, y, w, h, 12); c.fill(); c.fillStyle = this.hover === i ? '#2a1a06' : '#f4ece0'; c.font = 'bold 26px system-ui'; c.textAlign = 'center'; c.fillText(label, x + w / 2, y + h / 2 + 9); c.textAlign = 'left'; };
    c.fillStyle = '#f4ead8'; c.font = 'bold 40px system-ui'; c.fillText('OBRONA OKOPÓW', 30, 58);
    let y = 84;
    btn(30, y, 660, 64, o.phase === 'idle' || o.phase === 'dead' ? '▶ START (nowa gra)' : o.paused ? '▶ Wznów' : '❚❚ Pauza', 'run', '#3a6a2a'); y += 78;
    btn(30, y, 320, 60, 'Od nowa', 'restart', '#6a2a22'); btn(370, y, 320, 60, 'Dopasuj wzrost', 'calib', '#5a4a1a'); y += 74;
    btn(30, y, 210, 56, 'Artyleria', 'mode:index.html', '#2a3a5a'); btn(255, y, 210, 56, 'Bitwa średniow.', 'mode:medieval.html', '#2a3a5a'); btn(480, y, 210, 56, 'Kostucha', 'mode:reaper.html', '#2a3a5a'); y += 70;
    btn(30, y, 660, 56, 'Zamknij menu', 'close'); y += 80;
    c.font = '21px system-ui'; c.fillStyle = '#f4ead8';
    ['Chwyt (grip): weź broń z kabury / magazynek z kieszeni / z arsenału.', 'Spust: strzał · granat: spust = zawleczka, puść chwyt = rzut.', 'A / X: wyrzuć magazynek · włóż nowy, przykładając go do broni.', 'Puść magazynek przy kieszeni na pasie — schowasz go.', 'Minigun: chwyć uchwyty z tyłu, spust = ogień, uważaj na temperaturę.', 'Kucnij, by schować się za workami. Lewa gałka: chód, prawa: obrót.'].forEach((l, i) => c.fillText(l, 30, y + i * 30));
    this.tex.needsUpdate = true;
  }
}
const wrist = new Wrist(), banner = new Banner(), menu = new Menu();
camera.add(banner.mesh); banner.mesh.position.set(0, 0.22, -1.4);
scene.add(menu.mesh);
document.getElementById('hud').appendChild(wrist.canvas);
// znacznik trafienia (X) i winieta obrażeń
const hitMark = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  m.renderOrder = 9999; m.position.set(0, 0, -0.6); m.visible = false; camera.add(m);
  m.userData.draw = (kill) => { const c = cv.getContext('2d'); c.clearRect(0, 0, 128, 128); c.strokeStyle = kill ? '#ff3a2a' : '#ffffff'; c.lineWidth = 9; c.lineCap = 'round'; for (const [a, b] of [[1, 1], [-1, 1]]) { c.beginPath(); c.moveTo(64 + a * 18, 64 + b * 18); c.lineTo(64 + a * 50, 64 + b * 50); c.moveTo(64 - a * 18, 64 - b * 18); c.lineTo(64 - a * 50, 64 - b * 50); c.stroke(); } tex.needsUpdate = true; };
  return m;
})();
let hitT = 0;
const vignette = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d'), g = c.createRadialGradient(128, 128, 40, 128, 128, 128);
  g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(0.6, 'rgba(150,0,0,0.35)'); g.addColorStop(1, 'rgba(110,0,0,0.95)');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
  m.renderOrder = 9800; m.position.set(0, 0, -0.12); camera.add(m);
  return m;
})();
const blackout = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0x100404, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
blackout.renderOrder = 9700; camera.add(blackout);

function msg(t, col = '#ffe8b0', dur = 3) { state.msg = t; state.msgCol = col; state.msgT = dur; }
function hitFx(kill) {
  hitT = kill ? 0.28 : 0.12; hitMark.userData.draw(kill); hitMark.visible = true;
  audio.ui(kill ? 'hitkill' : 'hitmark', kill ? 0.9 : 0.7);
  for (const h of hands) if (h.held && (h.held.kind === 'rifle' || h.held.kind === 'pistol' || h.held.kind === 'knife') || h.mg) pulse(h, kill ? 1 : 0.7, kill ? 120 : 50);
}

// ---------- kontrolery ----------
const factory = new XRControllerModelFactory();
const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
const hands = [0, 1].map((i) => {
  const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i);
  grip.add(factory.createControllerModel(grip));
  rig.add(c, grip);
  const ray = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  ray.scale.z = 2; ray.visible = false; c.add(ray);
  const h = { i, c, grip, ray, source: null, hand: null, held: null, trigger: false, squeeze: false, prev: [], pos: V(), last: V(), vel: V(), q: new THREE.Quaternion(), support: false, mg: null };
  c.addEventListener('connected', (e) => { h.source = e.data; h.hand = e.data.handedness; if (h.hand === 'left') grip.add(wrist.mesh); });
  c.addEventListener('disconnected', () => { h.source = null; });
  c.addEventListener('selectstart', () => { audio.resume(); h.trigger = true; if (menu.mesh.visible && h.hand === 'right') { if (menu.hover >= 0) menuAction(menu.buttons[menu.hover].act); return; } triggerDown(h); });
  c.addEventListener('selectend', () => { h.trigger = false; });
  c.addEventListener('squeezestart', () => { audio.resume(); h.squeeze = true; grab(h); });
  c.addEventListener('squeezeend', () => { h.squeeze = false; release(h); });
  return h;
});
wrist.mesh.position.set(0, 0.035, 0.1); wrist.mesh.rotation.x = -1.1;
const other = (h) => hands[1 - h.i];
function pulse(h, v, ms) { const a = h.source?.gamepad?.hapticActuators?.[0]; if (a) a.pulse(v, ms); }

// ---------- sloty na ciele (względem głowy i kierunku tułowia) ----------
const SLOTS = {
  rifle: new THREE.Vector3(0.2, -0.28, 0.16), pistol: new THREE.Vector3(0.22, -0.8, 0.0), knife: new THREE.Vector3(-0.14, -0.4, -0.12),
  'pouch-rifle': new THREE.Vector3(-0.12, -0.66, -0.17), 'pouch-pistol': new THREE.Vector3(-0.25, -0.72, -0.04), 'pouch-grenade': new THREE.Vector3(0.12, -0.66, -0.17),
};
const bodyQ = new THREE.Quaternion();
function slotPos(name, out = V()) { const h = camera.getWorldPosition(V()); return out.copy(SLOTS[name]).applyQuaternion(bodyQ).add(h); }
// kieszenie: widoczne ładownice z wystającymi magazynkami
const pouches = {};
for (const type of ['rifle', 'pistol', 'grenade']) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(type === 'grenade' ? 0.12 : 0.13, 0.1, 0.06), new THREE.MeshLambertMaterial({ color: 0x4a4a32 })));
  const tops = [];
  for (let k = 0; k < POUCH_CAP[type]; k++) { const m = type === 'grenade' ? grenadeMesh() : magMesh(type); m.scale.setScalar(0.9); m.position.set(-0.045 + k * (0.09 / Math.max(1, POUCH_CAP[type] - 1)), type === 'grenade' ? 0.07 : 0.1, 0); g.add(m); tops.push(m); }
  g.userData.tops = tops; g.visible = false; scene.add(g); pouches[type] = g;
}

// ---------- chwytanie ----------
function heldMeshPose(h, mesh, kind) {
  mesh.position.copy(h.pos); mesh.quaternion.copy(h.q);
  if (kind === 'mag') mesh.position.add(V().set(0, 0.07, -0.03).applyQuaternion(h.q));
  if (kind === 'grenade') mesh.position.add(V().set(0, 0.01, -0.03).applyQuaternion(h.q));
}
function wellWorld(gun) { return GUNS[gun].well.clone().applyMatrix4(P[gun].mesh.matrixWorld); }
function grab(h) {
  if (!P.alive || h.held || h.mg) return;
  const hp = h.pos;
  // minigun
  for (const g of guns) for (let k = 0; k < 2; k++) if (g.handleWorld(k).distanceTo(hp) < 0.16) { h.mg = { g, k }; pulse(h, 0.5, 40); return; }
  // druga ręka na łożu karabinu
  const o = other(h);
  if (o.held?.kind === 'rifle' && GUNS.rifle.fore.clone().applyMatrix4(P.rifle.mesh.matrixWorld).distanceTo(hp) < 0.13) { h.support = true; pulse(h, 0.3, 30); return; }
  // sloty: broń
  const near = (n, r = 0.17) => slotPos(n).distanceTo(hp) < r;
  for (const gun of ['rifle', 'pistol', 'knife']) if (near(gun, gun === 'rifle' ? 0.24 : 0.17) && o.held?.kind !== gun) { h.held = { kind: gun }; audio.ui('click', 0.4); pulse(h, 0.4, 40); return; }
  // kieszenie
  for (const type of ['rifle', 'pistol', 'grenade']) if (near('pouch-' + type, 0.15)) {
    if (type === 'grenade') { if (P.pouch.grenade > 0) { P.pouch.grenade--; holdItem(h, items.add('grenade', null, hp, null)); } else msg('Brak granatów — arsenał w ziemiance', '#ffb090'); }
    else { const arr = P.pouch[type]; if (arr.length) { arr.sort((a, b) => b - a); holdItem(h, items.add('mag', type, hp, null, { rounds: arr.shift() })); } else msg('Kieszeń pusta — weź magazynki z arsenału albo od poległych', '#ffb090'); }
    return;
  }
  // przedmiot na ziemi
  const it = items.nearest(hp, 0.16);
  if (it) { holdItem(h, it); return; }
  // arsenał
  for (const c of crates) if (c.box.clone().expandByScalar(0.08).containsPoint(hp)) {
    if (ars[c.type] <= 0) { msg('Arsenał pusty!', '#ff8a7a'); return; }
    ars[c.type]--; drawCrates();
    holdItem(h, c.type === 'grenade' ? items.add('grenade', null, hp, null) : items.add('mag', c.type, hp, null));
    return;
  }
  // ciało poległego
  const body = lootBody(hp, 0.5);
  if (body) {
    if (body.loot.mags > 0) { body.loot.mags--; holdItem(h, items.add('mag', 'rifle', hp, null, { rounds: body.side ? Math.round(rnd(12, 30)) : 30 })); }
    else if (body.loot.grenades > 0) { body.loot.grenades--; holdItem(h, items.add('grenade', null, hp, null)); }
  }
}
function lootBody(p, r) {
  let best = null, bd = r;
  for (const s of troops.soldiers) {
    if (s.state !== 'dead' || !s.loot || (s.loot.mags <= 0 && s.loot.grenades <= 0)) continue;
    const c = new THREE.Vector3(s.x + s.fall.x * 0.6, s.y + 0.2, s.z + s.fall.z * 0.6), d = c.distanceTo(p);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function holdItem(h, it) { it.held = h; it.rest = false; h.held = { kind: 'item', item: it }; it.drop = null; pulse(h, 0.35, 30); audio.ui('click', 0.3, 0.8); }
function release(h) {
  if (h.mg) { h.mg = null; return; }
  if (h.support) { h.support = false; return; }
  const H = h.held; if (!H) return;
  h.held = null;
  if (H.kind !== 'item') { audio.ui('click', 0.3, 0.7); return; }      // broń wraca do kabury / na plecy
  const it = H.item; it.held = null;
  const typeKey = it.kind === 'grenade' ? 'grenade' : it.type;
  // schowanie do kieszeni
  if (slotPos('pouch-' + typeKey).distanceTo(it.pos) < 0.2 && !(it.kind === 'grenade' && it.armed)) {
    if (it.kind === 'grenade') { if (P.pouch.grenade < POUCH_CAP.grenade) { P.pouch.grenade++; items.remove(it); audio.ui('magin', 0.4, 0.8); return; } }
    else if (it.rounds <= 0) msg('Pusty magazynek — wyrzuć go', '#ffb090');
    else if (P.pouch[it.type].length < POUCH_CAP[it.type]) { P.pouch[it.type].push(it.rounds); items.remove(it); audio.ui('magin', 0.4, 0.8); return; }
    else msg('Kieszeń pełna', '#ffb090');
  }
  // rzut / upuszczenie z prędkością dłoni
  it.vel.copy(h.vel).multiplyScalar(it.kind === 'grenade' ? 1.25 : 1);
  if (it.kind === 'grenade' && it.armed) { it.byPlayer = true; it.fuse = Math.min(it.fuse, 3.6); }
}
function triggerDown(h) {
  if (!P.alive) return;
  const H = h.held;
  if (H?.kind === 'pistol') firePistol(h);
  if (H?.kind === 'item' && H.item.kind === 'grenade' && !H.item.armed) { H.item.armed = true; H.item.fuse = 3.6 + 1.2; H.item.mesh.userData.ring.visible = false; audio.ui('pin', 0.7); pulse(h, 0.5, 40); }
}

// ---------- strzelanie ----------
function shootRay(o, d, dmg, head) {
  const tT = map.rayTerrain(o, d, 450);
  const hit = troops.hitscan(o, d, Math.min(tT, 450));
  if (hit) {
    const p = o.clone().addScaledVector(d, hit.t);
    const kill = troops.damage(hit.s, hit.part === 'head' ? head : rnd(...dmg), P, hit.part);
    fx.blood(p);
    if (hit.t < 40) audio.play('flesh', p, 0.6);
    if (kill) P.kills++;
    hitFx(kill);
    return p;
  }
  if (tT < 450) { const p = o.clone().addScaledVector(d, tT); fx.dirt(p, 4); if (tT < 30) audio.play('dirt', p, 0.4); return p; }
  return o.clone().addScaledVector(d, 450);
}
let shotN = 0;
function fireGun(kind, muzzle, dir, h) {
  const g = P[kind], G = GUNS[kind];
  if (!g.mag || g.mag.rounds <= 0) { audio.ui('click', 0.6); g.cd = 0.25; return; }
  g.mag.rounds--; g.cd = 1 / G.rate; g.kick = Math.min(0.1, g.kick + G.recoil);
  const d = dir.clone().add(V().set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(G.spread)).normalize();
  const end = shootRay(muzzle, d, G.dmg, G.head);
  fx.flash(muzzle, kind === 'rifle' ? 0.22 : 0.16);
  audio.play(G.sound, muzzle, 0.9, 1, 3);
  if (++shotN % 3 === 0) troops.tracers.push({ a: muzzle.clone(), b: end, t: 0, T: muzzle.distanceTo(end) / 700, side: 0 });
  if (h) pulse(h, kind === 'rifle' ? 0.55 : 0.75, kind === 'rifle' ? 35 : 55);
  P.shotT = 0;
}
function firePistol(h) { const g = P.pistol; if (g.cd > 0) return; fireGun('pistol', GUNS.pistol.muzzle.clone().applyMatrix4(g.mesh.matrixWorld), V().set(0, 0, -1).transformDirection(g.mesh.matrixWorld), h); }
function eject(kind, h) {
  const g = P[kind]; if (!g.mag) return;
  items.add('mag', kind, wellWorld(kind), h ? h.vel.clone().add(V().set(0, -0.5, 0)) : V().set(0, -0.5, 0), { rounds: g.mag.rounds });
  g.mag = null; audio.ui('magout', 0.7);
}
function insert(kind, it) { P[kind].mag = { rounds: it.rounds }; items.remove(it); audio.ui('magin', 0.8); }

// nóż: trafienie ostrzem w ruchu
const knifeHitT = new Map();
function knifeContact(h, dt) {
  if (h.vel.length() < 1.5) return;
  const m = P.knife.mesh.matrixWorld, a = V().set(0, 0, -0.06).applyMatrix4(m), b = V().set(0, 0, -0.22).applyMatrix4(m);
  for (const s of troops.soldiers) {
    if (s.state !== 'alive' || s.side !== 1 || (knifeHitT.get(s) || 0) > clockT) continue;
    if (Math.hypot(s.x - b.x, s.z - b.z) > 1) continue;
    const head = troops.headPos(s, V()), pose = troops.pose(s);
    const near = (p) => (p.distanceTo(head) < 0.17 ? 'head' : Math.hypot(p.x - s.x, p.z - s.z) < 0.24 && p.y > s.y + 0.2 && p.y < s.y + pose.head ? 'body' : null);
    const part = near(b) || near(a.clone().lerp(b, 0.5));
    if (!part) continue;
    knifeHitT.set(s, clockT + 0.5);
    const kill = troops.damage(s, part === 'head' ? 100 : 65 + h.vel.length() * 6, P, part);
    if (kill) P.kills++;
    fx.blood(b); audio.play('stab', b, 0.9); hitFx(kill);
  }
}

// ---------- obrażenia gracza ----------
troops.onPlayerHit = (dmg, from, melee) => hurt(dmg, melee ? 'stab' : 'flesh');
function hurt(dmg, snd = 'flesh') {
  if (!P.alive) return;
  P.hp -= dmg; P.regenT = 5; state.hurt = Math.min(1, state.hurt + 0.35 + dmg / 60);
  audio.ui('hurt', 0.9); audio.ui(snd, 0.6);
  for (const h of hands) pulse(h, 1, 160);
  if (P.hp <= 0) die();
}
function die() {
  P.alive = false; P.hp = 0; state.phase = 'dead'; state.dead = 0;
  for (const h of hands) { if (h.held?.kind === 'item') release(h); h.held = null; h.mg = null; h.support = false; }
  msg(`Poległeś. Przetrwane fale: ${Math.max(0, state.wave - 1)} · zabici: ${P.kills}`, '#ff8a7a', 1e9);
}
troops.onNearMiss = (from, dir, end) => {
  // tor kuli mija głowę gracza: świst lub trzask
  const h = P.head, w = h.clone().sub(from), t = Math.max(0, w.dot(dir)), c = from.clone().addScaledVector(dir, t), d = c.distanceTo(h);
  if (d < 3 && t < from.distanceTo(end) + 2) audio.play(d < 1 ? 'snap' : 'whiz', c, d < 1 ? 0.8 : 0.6, 1, 1);
  if (end.distanceTo(h) < 6) { fx.dirt(end, 6); audio.play('dirt', end, 0.6, 1, 1); }
};
let enemyShotSnd = 0;
troops.onShot = (s, p) => {
  fx.flash(p, 0.2);
  const d = p.distanceTo(P.head);
  if (enemyShotSnd < 14 || d < 25) { enemyShotSnd++; audio.play(d > 60 ? 'far' : 'rifle', p, Math.min(1, 0.35 + 18 / (d + 10)), d > 60 ? 0.9 : 1, d > 60 ? 12 : 4); }
};
troops.onImpact = (p) => { if (p.distanceTo(P.head) < 40) fx.dirt(p, 3); };
troops.onMelee = (s) => audio.play('stab', V().set(s.x, s.y + 1.2, s.z), 0.8);
troops.onDeath = (s, from, part) => { if (s.side === 0) msg('Padł jeden z naszych!', '#ff9a8a', 1.6); };
troops.onThrow = (s, target) => {
  const from = troops.eyePos(s, V()).add(V().set(0, 0.2, 0));
  const dx = target.x - from.x, dz = target.z - from.z, dist = Math.hypot(dx, dz), T = 0.5 + dist / 13, dy = target.y + 0.3 - from.y;
  const vel = V().set(dx / T, (dy + 0.5 * 9.81 * T * T) / T, dz / T);
  items.add('grenade', null, from, vel, { armed: true, fuse: T + rnd(0.8, 1.8), enemy: true });
  if (from.distanceTo(P.head) < 30) msg('GRANAT!', '#ff7a5a', 1.5);
};
items.onBounce = (it) => audio.play('click', it.pos, 0.5, 0.6, 1);
items.onExplode = (p, it) => {
  fx.explosion(p); audio.play('boom', p, 1.4, 1, 8);
  const before = troops.soldiers.filter((s) => s.state === 'alive' && s.side === 1).length;
  troops.explode(p, 7, it.byPlayer ? P : null);
  if (it.byPlayer) { const k = before - troops.soldiers.filter((s) => s.state === 'alive' && s.side === 1).length; if (k > 0) { P.kills += k; hitFx(true); } }
  const d = p.distanceTo(P.chest);
  if (d < 7 && (map.los(p.clone().add(V().set(0, 0.3, 0)), P.head, 0.2) || map.los(p.clone().add(V().set(0, 0.3, 0)), P.chest, 0.2) || d < 1.6)) hurt(130 * (1 - d / 7) ** 1.3, 'boom');
  if (d < 25) state.shake = Math.max(state.shake || 0, 0.6 * (1 - d / 25));
};

// ---------- przebieg gry ----------
function clearAll() {
  troops.clear();
  for (const it of [...items.list]) items.remove(it);
  for (const g of guns) { g.heat = 0; g.over = false; }
}
function startGame() {
  clearAll();
  Object.assign(ars, { rifle: 40, pistol: 20, grenade: 24 }); drawCrates();
  Object.assign(P, { alive: true, hp: 100, regenT: 0, kills: 0 });
  P.rifle.mag = { rounds: 30 }; P.pistol.mag = { rounds: 12 };
  P.pouch = { rifle: [30, 30, 30, 30], pistol: [12, 12], grenade: 2 };
  state.phase = 'prep'; state.timer = 20; state.wave = 0; state.paused = false; state.dead = 0;
  topUpAllies();
  placeRig(map.spawnPoint.x, map.spawnPoint.y + 0.3);
  if (!renderer.xr.isPresenting) { look.yaw = 0; look.pitch = 0; }
  else { hands[0].held = null; hands[1].held = null; const r = hands.find((h) => h.hand === 'right'); if (r) r.held = { kind: 'rifle' }; }
  menu.mesh.visible = false;
  msg('Zajmij stanowisko. Pierwsza fala za 20 s', '#ffe8b0', 4);
}
function topUpAllies() {
  const alive = troops.alive(0);
  const used = new Set(alive.map((s) => s.post));
  const free = map.posts.filter((p, i) => i % 2 === 0 && !used.has(p)).concat(map.posts.filter((p, i) => i % 2 === 1 && !used.has(p)));
  const cap = state.wave === 0 ? ALLIES : Math.min(ALLIES, alive.length + 3);   // posiłki: najwyżej 3 na falę
  for (let k = alive.length; k < cap && free.length; k++) {
    const post = free.shift();
    // posiłki nadchodzą z okopu wspierającego
    const s = troops.spawnAlly(post, rnd(-30, 30) | 0, 15); s.x = Math.round(s.x / 1) + 0.5; s.mode = state.phase === 'prep' && state.wave === 0 ? 'post' : 'return';
    if (state.phase === 'prep' && state.wave === 0) { s.x = post.x; s.z = post.y; }
  }
}
function nextWave() {
  state.wave++; state.phase = 'wave';
  const n = 8 + state.wave * 5;
  troops.spawnWave(n, state.wave);
  topUpAllies();
  audio.play('whistle', V().set(0, 1.5, -150), 1.4, 1, 60);
  setTimeout(() => audio.ui('whistle', 0.35, 1.05), 900);
  msg(`FALA ${state.wave} — ${n} wrogów nadchodzi!`, '#ffb070', 3.5);
}
function updateGame(dt) {
  if (state.msgT > 0) state.msgT -= dt;
  if (state.phase === 'prep' || state.phase === 'between') {
    state.timer -= dt;
    if (state.timer <= 0) nextWave();
  } else if (state.phase === 'wave') {
    if (!troops.soldiers.some((s) => s.side === 1 && s.state === 'alive')) {
      state.phase = 'between'; state.timer = 25;
      msg(`Fala ${state.wave} odparta! Uzupełnij amunicję (arsenał w ziemiance)`, '#9fe8b0', 5);
    }
  } else if (state.phase === 'dead') state.dead += dt;
  // regeneracja
  if (P.alive) { P.regenT -= dt; if (P.regenT <= 0) P.hp = Math.min(100, P.hp + 12 * dt); }
  state.hurt = Math.max(0, state.hurt - dt * 0.8);
}
function menuAction(act) {
  const [k, a] = act.split(':');
  if (k === 'run') { if (state.phase === 'idle' || state.phase === 'dead') startGame(); else state.paused = !state.paused; if (!state.paused) menu.mesh.visible = false; }
  else if (k === 'restart') startGame();
  else if (k === 'calib') calibrate();
  else if (k === 'close') { menu.mesh.visible = false; if (renderer.xr.isPresenting) state.paused = false; }
  else if (k === 'mode') location.href = a;
  menu.last = '';
}
function toggleMenu() {
  const show = !menu.mesh.visible;
  menu.mesh.visible = show;
  if (show) {
    const h = camera.getWorldPosition(V()), f = V().set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())); f.y = 0; f.normalize();
    menu.mesh.position.copy(h).addScaledVector(f, 0.9); menu.mesh.position.y -= 0.1; menu.mesh.lookAt(h);
    if (state.phase !== 'idle' && state.phase !== 'dead') state.paused = true;
  } else if (state.phase !== 'idle') state.paused = false;
}
function calibrate() {
  if (!renderer.xr.isPresenting) return;
  base = EYE_T - camera.position.y;
  const h = camera.getWorldPosition(V());
  placeRig(rig.position.x, rig.position.z); void h;
  msg('Wzrost dopasowany — stojąc widzisz ponad workami', '#9fe8b0', 2.5);
}

// ---------- ruch ----------
function tryMove(dx, dz) {
  const h = camera.getWorldPosition(V());
  const nx = h.x + dx, nz = h.z + dz;
  const ok = (x, z) => map.walkable(x, z) && map.walkable(x + 0.2, z) && map.walkable(x - 0.2, z) && map.walkable(x, z + 0.2) && map.walkable(x, z - 0.2);
  if (ok(nx, nz)) { rig.position.x += dx; rig.position.z += dz; }
  else if (ok(nx, h.z)) rig.position.x += dx;
  else if (ok(h.x, nz)) rig.position.z += dz;
}
function snapTurn(a) {
  const h0 = camera.getWorldPosition(V());
  rig.rotation.y += a; rig.updateMatrixWorld(true);
  const h1 = camera.getWorldPosition(V());
  rig.position.x += h0.x - h1.x; rig.position.z += h0.z - h1.z;
}

// ---------- wejście XR ----------
function pollXR(dt) {
  for (const h of hands) {
    const gp = h.source?.gamepad;
    if (!gp) continue;
    const pr = gp.buttons.map((b) => b.pressed), down = (i) => pr[i] && !h.prev[i];
    const ax = gp.axes[2] || 0, ay = gp.axes[3] || 0;
    if (h.hand === 'left') {
      if (!h.mg && (Math.abs(ax) > 0.15 || Math.abs(ay) > 0.15) && P.alive) {
        const q = camera.getWorldQuaternion(new THREE.Quaternion()), f = V().set(0, 0, -1).applyQuaternion(q), r = V().set(1, 0, 0).applyQuaternion(q);
        f.y = 0; r.y = 0; f.normalize(); r.normalize();
        const v = f.multiplyScalar(-ay).add(r.multiplyScalar(ax)).multiplyScalar(2.3 * dt);
        tryMove(v.x, v.z); P.speed = 2.3;
      }
      if (down(5)) toggleMenu();
      if (down(4) && h.held && P[h.held.kind]?.mag !== undefined) eject(h.held.kind, h);
    } else {
      if (Math.abs(ax) > 0.75 && !h.flick) { h.flick = true; snapTurn(ax > 0 ? -Math.PI / 6 : Math.PI / 6); }
      if (Math.abs(ax) < 0.35) h.flick = false;
      if (down(5)) toggleMenu();
      if (down(4)) { if (state.phase === 'idle' || state.phase === 'dead') startGame(); else if (h.held && P[h.held.kind]?.mag !== undefined) eject(h.held.kind, h); }
    }
    h.prev = pr;
  }
}

// ---------- komputer: mysz + klawiatura ----------
const look = { yaw: 0, pitch: 0 };
const keys = new Set();
let desk = 'rifle', ads = false, mouseDown = false, mounted = null;
const viewModel = new THREE.Group(); camera.add(viewModel);
const vm = { rifle: rifleMesh(), pistol: pistolMesh(), knife: knifeMesh(), grenade: grenadeMesh() };
for (const m of Object.values(vm)) { m.visible = false; viewModel.add(m); }
renderer.domElement.addEventListener('click', () => { audio.resume(); if (!renderer.xr.isPresenting && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.(); });
document.addEventListener('mousemove', (e) => { if (document.pointerLockElement === renderer.domElement) { look.yaw -= e.movementX * 0.0022; look.pitch = Math.max(-1.4, Math.min(1.4, look.pitch - e.movementY * 0.0022)); } });
renderer.domElement.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  if (e.button === 2) { ads = true; return; }
  if (e.button !== 0 || !P.alive) return;
  mouseDown = true;
  if (mounted) return;
  if (desk === 'pistol') deskFire('pistol');
  else if (desk === 'knife') deskStab();
  else if (desk === 'grenade') deskThrow();
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) ads = false; });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  keys.add(e.code); audio.resume();
  if (e.repeat) return;
  if (e.code === 'Digit1') desk = 'rifle';
  if (e.code === 'Digit2') desk = 'pistol';
  if (e.code === 'Digit3') desk = 'grenade';
  if (e.code === 'Digit4') desk = 'knife';
  if (e.code === 'KeyR') deskReload();
  if (e.code === 'KeyG') deskThrow();
  if (e.code === 'KeyC') crouch = !crouch;
  if (e.code === 'KeyE') deskInteract();
  if (e.code === 'Enter') { if (state.phase === 'idle' || state.phase === 'dead') startGame(); else state.paused = !state.paused; }
  if (e.code === 'KeyO' || e.code === 'Escape') { document.getElementById('menu').style.display = document.getElementById('menu').style.display === 'block' ? 'none' : 'block'; }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
function deskDir() { return V().set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())); }
function deskFire(kind) {
  const g = P[kind]; if (g.cd > 0) return;
  const o = camera.getWorldPosition(V()), d = deskDir();
  fireGun(kind, o.clone().addScaledVector(d, 0.5).add(V().set(0, -0.08, 0)), d, null);
  // trafienie liczone od oka (celownik na środku ekranu)
  void o;
}
function deskStab() {
  const o = camera.getWorldPosition(V()), d = deskDir();
  let best = null, bd = 1.8;
  for (const s of troops.soldiers) { if (s.state !== 'alive' || s.side !== 1) continue; const c = troops.chestPos(s, V()), v = c.clone().sub(o), dist = v.length(); if (dist < bd && v.normalize().dot(d) > 0.6) { bd = dist; best = s; } }
  vm.knife.userData.stab = 0.25;
  if (best) { const kill = troops.damage(best, 80, P, 'body'); if (kill) P.kills++; fx.blood(troops.chestPos(best, V())); audio.play('stab', o, 0.9); hitFx(kill); }
}
function deskThrow() {
  if (P.pouch.grenade <= 0) { msg('Brak granatów', '#ffb090'); return; }
  P.pouch.grenade--;
  const o = camera.getWorldPosition(V()), d = deskDir();
  const it = items.add('grenade', null, o.clone().addScaledVector(d, 0.4), d.multiplyScalar(14).add(V().set(0, 3, 0)), { armed: true, fuse: 3.4 });
  it.byPlayer = true; audio.ui('pin', 0.6);
}
function deskReload() {
  const kind = desk === 'pistol' ? 'pistol' : 'rifle', g = P[kind], arr = P.pouch[kind];
  if (!arr.length) { msg('Brak magazynków w kieszeni', '#ffb090'); return; }
  if (g.reloadT > 0) return;
  arr.sort((a, b) => b - a);
  const old = g.mag; g.mag = null; audio.ui('magout', 0.7);
  if (old && old.rounds > 0) arr.push(old.rounds);
  const r = arr.shift();
  g.reloadT = kind === 'rifle' ? 1.8 : 1.3;
  g.pending = r;
}
function deskInteract() {
  const h = camera.getWorldPosition(V());
  if (mounted) { mounted = null; msg('Zszedłeś z minigunu'); return; }
  for (const g of guns) { const mid = g.handleWorld(0).add(g.handleWorld(1)).multiplyScalar(0.5); if (Math.hypot(mid.x - h.x, mid.z - h.z) < 1.4) { mounted = g; msg('Minigun: LPM ogień · E zejdź', '#ffe8b0'); return; } }
  for (const c of crates) if (Math.hypot(c.center.x - h.x, c.center.z - h.z) < 2.2) {
    let got = 0;
    for (const type of ['rifle', 'pistol']) while (P.pouch[type].length < POUCH_CAP[type] && ars[type] > 0) { P.pouch[type].push(GUNS[type].mag); ars[type]--; got++; }
    while (P.pouch.grenade < POUCH_CAP.grenade && ars.grenade > 0) { P.pouch.grenade++; ars.grenade--; got++; }
    drawCrates(); msg(got ? `Uzupełniono z arsenału (${got})` : 'Kieszenie pełne albo arsenał pusty', '#9fe8b0'); audio.ui('magin', 0.6);
    return;
  }
  const body = lootBody(V().set(h.x, h.y - 1.2, h.z), 2.2);
  if (body) {
    let got = 0;
    while (body.loot.mags > 0 && P.pouch.rifle.length < POUCH_CAP.rifle) { body.loot.mags--; P.pouch.rifle.push(body.side ? Math.round(rnd(12, 30)) : 30); got++; }
    while (body.loot.grenades > 0 && P.pouch.grenade < POUCH_CAP.grenade) { body.loot.grenades--; P.pouch.grenade++; got++; }
    msg(got ? `Zabrano od poległego: ${got}` : 'Kieszenie pełne', '#9fe8b0'); audio.ui('magin', 0.5);
    return;
  }
  const it = items.nearest(V().set(h.x, h.y - 1.3, h.z), 1.6) || items.nearest(h, 1.6);
  if (it) {
    if (it.kind === 'grenade') { if (it.armed) { it.vel.copy(deskDir().multiplyScalar(12).add(V().set(0, 3, 0))); it.rest = false; it.byPlayer = true; msg('Odrzucony granat!', '#ffd080'); } else if (P.pouch.grenade < POUCH_CAP.grenade) { P.pouch.grenade++; items.remove(it); } }
    else if (it.rounds > 0 && P.pouch[it.type].length < POUCH_CAP[it.type]) { P.pouch[it.type].push(it.rounds); items.remove(it); audio.ui('magin', 0.5); }
  }
}
function updateDesktop(dt) {
  camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
  const eyeLocal = (crouch ? 1.2 : EYE_T - FLOOR);
  camera.position.set(0, camera.position.y + (eyeLocal - camera.position.y) * Math.min(1, dt * 10), 0);
  if (mounted) {
    const g = mounted, d = V().set(0, 0, -1).applyAxisAngle(V().set(1, 0, 0), look.pitch).applyAxisAngle(V().set(0, 1, 0), look.yaw);
    g.aim(Math.atan2(-d.x, -d.z), Math.asin(d.y), 1);
    // stań za uchwytami
    const mid = g.handleWorld(0).add(g.handleWorld(1)).multiplyScalar(0.5), back = V().set(0, 0, 1).applyAxisAngle(V().set(0, 1, 0), g.yaw);
    const want = mid.addScaledVector(back, 0.35);
    rig.position.x = want.x; rig.position.z = want.z;
    crouch = false;
  } else if (P.alive) {
    const f = V().set(-Math.sin(look.yaw), 0, -Math.cos(look.yaw)), r = V().set(Math.cos(look.yaw), 0, -Math.sin(look.yaw));
    const mv = V();
    if (keys.has('KeyW')) mv.add(f); if (keys.has('KeyS')) mv.sub(f); if (keys.has('KeyD')) mv.add(r); if (keys.has('KeyA')) mv.sub(r);
    if (mv.lengthSq()) { const sp = (keys.has('ShiftLeft') ? 4.2 : 2.4) * (crouch ? 0.5 : 1); mv.normalize().multiplyScalar(sp * dt); tryMove(mv.x, mv.z); P.speed = sp; }
  }
  // przeładowanie z opóźnieniem
  for (const kind of ['rifle', 'pistol']) { const g = P[kind]; if (g.reloadT > 0) { g.reloadT -= dt; if (g.reloadT <= 0) { g.mag = { rounds: g.pending }; audio.ui('magin', 0.8); } } }
  if (mouseDown && desk === 'rifle' && !mounted && P.alive && P.rifle.cd <= 0) deskFire('rifle');
  // model broni przed kamerą
  for (const [k, m] of Object.entries(vm)) m.visible = k === desk && !mounted && P.alive;
  const m = vm[desk], g = P[desk];
  const kick = g?.kick || 0;
  const aimPos = desk === 'rifle' ? V().set(0, -0.112, -0.28) : desk === 'pistol' ? V().set(0, -0.075, -0.32) : V().set(0.15, -0.2, -0.35);
  const hip = V().set(0.17, -0.2, -0.38);
  m.position.copy(ads && (desk === 'rifle' || desk === 'pistol') ? aimPos : hip);
  m.position.z += kick * 1.2; m.rotation.set(kick * 2, 0, 0);
  if (desk === 'knife') { const st = vm.knife.userData.stab || 0; vm.knife.userData.stab = Math.max(0, st - dt); m.position.z -= Math.sin((st / 0.25) * Math.PI) * 0.25; }
  if (g?.reloadT > 0) m.rotation.x -= 0.6;
  if (vm[desk].userData.counter) vm[desk].userData.counter.userData.draw(g.mag ? g.mag.rounds : null, GUNS[desk].mag);
  document.getElementById('cross').style.display = ads || mounted ? 'none' : 'block';
}

// ---------- pętla ----------
const clock = new THREE.Clock();
let clockT = 0, xrStartT = -1, ambT = 3;
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
function updateHands(dt) {
  const xr = renderer.xr.isPresenting;
  for (const h of hands) {
    h.grip.getWorldPosition(h.pos); h.c.getWorldQuaternion(h.q);
    const v = h.pos.clone().sub(h.last).divideScalar(Math.max(dt, 1e-3));
    h.vel.lerp(v, 0.5); h.last.copy(h.pos);
  }
  // kierunek tułowia nadąża za głową
  const cq = camera.getWorldQuaternion(new THREE.Quaternion()), f = V().set(0, 0, -1).applyQuaternion(cq);
  const yaw = Math.atan2(-f.x, -f.z), dy = wrap(yaw - bodyYaw);
  if (Math.abs(dy) > 0.5) bodyYaw += (dy - Math.sign(dy) * 0.5);
  bodyYaw += wrap(yaw - bodyYaw) * Math.min(1, dt * 0.8);
  bodyQ.setFromAxisAngle(V().set(0, 1, 0), bodyYaw);
  // broń w dłoniach albo w kaburach
  const heldBy = (k) => hands.find((h) => h.held?.kind === k);
  for (const k of ['rifle', 'pistol', 'knife']) {
    const mesh = P[k].mesh, h = xr && heldBy(k);
    mesh.visible = xr;
    if (!xr) continue;
    if (h) {
      const o = other(h);
      if (k === 'rifle' && o.support) {
        _m.lookAt(h.pos, o.pos.clone().add(V().set(0, 0.0, 0)), V().set(0, 1, 0).applyQuaternion(h.q));
        mesh.quaternion.setFromRotationMatrix(_m);
        // karabin obrócony tak, by łoże leżało w drugiej dłoni
        const foreDir = GUNS.rifle.fore.clone().normalize(); _q.setFromUnitVectors(V().set(0, 0, -1), foreDir); mesh.quaternion.multiply(_q.invert());
      } else mesh.quaternion.copy(h.q);
      mesh.position.copy(h.pos);
      const g = P[k];
      if (g.kick) { mesh.position.add(V().set(0, 0, g.kick).applyQuaternion(mesh.quaternion)); mesh.quaternion.multiply(_q.setFromAxisAngle(V().set(1, 0, 0), g.kick * 2.5)); }
    } else {
      // kabura / plecy / pochwa
      mesh.position.copy(slotPos(k));
      if (k === 'rifle') mesh.quaternion.copy(bodyQ).multiply(_q.setFromEuler(new THREE.Euler(-1.2, 0, 0.5)));
      else mesh.quaternion.copy(bodyQ).multiply(_q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));
    }
    mesh.updateMatrixWorld(true);
    if (mesh.userData.counter) mesh.userData.counter.userData.draw(P[k].mag ? P[k].mag.rounds : null, GUNS[k].mag);
  }
  // przedmioty w dłoni, wkładanie magazynka
  for (const h of hands) {
    if (h.held?.kind !== 'item') continue;
    const it = h.held.item;
    if (!items.list.includes(it)) { h.held = null; continue; }
    heldMeshPose(h, it.mesh, it.kind);
    it.drop = () => { h.held = null; };
    if (it.kind === 'mag') {
      const o = other(h), gk = o.held?.kind;
      if (gk === it.type && !P[gk].mag && wellWorld(gk).distanceTo(it.mesh.position) < 0.12) { insert(gk, it); h.held = null; pulse(h, 0.6, 50); pulse(o, 0.6, 50); }
    }
  }
  // kieszenie
  for (const [type, g] of Object.entries(pouches)) {
    g.visible = xr; if (!xr) continue;
    g.position.copy(slotPos('pouch-' + type)); g.quaternion.copy(bodyQ);
    const n = type === 'grenade' ? P.pouch.grenade : P.pouch[type].length;
    g.userData.tops.forEach((m, i) => { m.visible = i < n; });
  }
  // strzelanie z karabinu (ogień ciągły) i nóż
  for (const h of hands) {
    if (h.held?.kind === 'rifle' && h.trigger && P.rifle.cd <= 0 && P.alive) fireGun('rifle', GUNS.rifle.muzzle.clone().applyMatrix4(P.rifle.mesh.matrixWorld), V().set(0, 0, -1).transformDirection(P.rifle.mesh.matrixWorld), h);
    if (h.held?.kind === 'knife' && P.alive) knifeContact(h, dt);
  }
}
function updateGuns(dt) {
  for (const g of guns) {
    const users = hands.filter((h) => h.mg && h.mg.g === g);
    let trig = false;
    if (users.length) {
      const mid = V();
      for (const h of users) { const off = g.handles[h.mg.k].clone().setY(0).setZ(0); mid.add(h.pos.clone().sub(off.applyQuaternion(g.pitchG.getWorldQuaternion(new THREE.Quaternion())))); }
      mid.divideScalar(users.length);
      g.aimFromHands(mid, dt);
      trig = users.some((h) => h.trigger);
    }
    if (mounted === g) trig = mouseDown && P.alive;
    if (!P.alive) trig = false;
    const shots = g.update(dt, trig && !state.paused);
    for (let k = 0; k < shots; k++) {
      const mz = g.muzzleWorld(), d = g.dirWorld().add(V().set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.012)).normalize();
      const end = shootRay(mz, d, [26, 34], 100);
      if (k % 2 === 0) troops.tracers.push({ a: mz.clone(), b: end, t: 0, T: mz.distanceTo(end) / 750, side: 0 });
      fx.flash(mz, 0.3);
    }
    if (users.length && g.firing) for (const h of users) pulse(h, 0.45, 30);
    audio.loop('mg' + guns.indexOf(g), 'minigun', g.root, g.firing ? 1.1 : 0);
    audio.loop('sp' + guns.indexOf(g), 'spin', g.root, g.firing ? 0 : g.spin * 0.5);
    if (g.justOver) { g.justOver = false; audio.play('steam', g.muzzleWorld(), 1, 1, 3); msg('Minigun przegrzany! Odczekaj, aż ostygnie', '#ff9a6a', 2.5); }
    if (g.justCool) { g.justCool = false; audio.play('click', g.root.position, 0.6); }
    if (g.heat > 0.6 && Math.random() < dt * 20 * g.heat) fx.steam(g.muzzleWorld().addScaledVector(g.dirWorld(), -0.3));
  }
}
function updatePlayerProxy() {
  camera.getWorldPosition(P.head);
  P.chest.copy(P.head).add(V().set(0, -0.42, 0));
  P.x = P.head.x; P.z = P.head.z;
}
function updateHud() {
  const enemies = troops.soldiers.filter((s) => s.side === 1 && s.state === 'alive').length;
  const ph = state.phase;
  const sub = ph === 'idle' ? 'Naciśnij A (Enter), by zacząć' : ph === 'prep' || ph === 'between' ? `Następna fala za ${Math.ceil(state.timer)} s` : ph === 'wave' ? `Wrogów: ${enemies}` : 'Poległeś — A / Enter: od nowa';
  const s = {
    title: state.wave ? `FALA ${state.wave}` : 'OKOPY', kills: P.kills, hp: Math.round(P.hp),
    r: P.rifle.mag ? P.rifle.mag.rounds : '—', rp: P.pouch.rifle.length, p: P.pistol.mag ? P.pistol.mag.rounds : '—', pp: P.pouch.pistol.length, g: P.pouch.grenade,
    allies: troops.alive(0).length, ar: ars.rifle, ap: ars.pistol, ag: ars.grenade, sub: state.paused ? 'PAUZA' : sub,
    hint: renderer.xr.isPresenting ? 'Y/B: menu · A/X: wyrzuć magazynek' : '1–4 broń · R przeład. · G granat · E użyj · C kucnij',
  };
  wrist.draw(s);
  banner.mesh.visible = renderer.xr.isPresenting;
  banner.draw(state.msgT > 0 ? state.msg : '', state.msgCol);
  const dm = document.getElementById('msg'); dm.textContent = state.msgT > 0 ? state.msg : ''; dm.style.color = state.msgCol;
  menu.draw({ phase: state.phase, paused: state.paused });
}
function updateMenuHover() {
  const r = hands.find((h) => h.hand === 'right' && h.source);
  for (const h of hands) h.ray.visible = menu.mesh.visible && h === r;
  if (!menu.mesh.visible || !r) { menu.hover = -1; return; }
  const rc = new THREE.Raycaster(r.c.getWorldPosition(V()), V().set(0, 0, -1).applyQuaternion(r.c.getWorldQuaternion(new THREE.Quaternion())));
  const hit = rc.intersectObject(menu.mesh, false)[0];
  menu.hover = hit ? menu.hit(hit.uv.x * menu.canvas.width, (1 - hit.uv.y) * menu.canvas.height) : -1;
}
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  clockT += dt;
  const xr = renderer.xr.isPresenting;
  if (xr && xrStartT < 0) xrStartT = clockT;
  if (xr && xrStartT >= 0 && clockT - xrStartT > 1.5 && !frame.calibrated) { frame.calibrated = true; calibrate(); }
  P.speed = 0;
  if (xr) pollXR(dt); else updateDesktop(dt);
  // wysokość: dno pod głową
  const hh = camera.getWorldPosition(V());
  if (map.walkable(hh.x, hh.z)) rig.position.y += (map.floorAt(hh.x, hh.z) - FLOOR + base - rig.position.y) * Math.min(1, dt * 8);
  rig.updateMatrixWorld(true);
  updatePlayerProxy();
  const running = !state.paused && (state.phase === 'prep' || state.phase === 'wave' || state.phase === 'between');
  enemyShotSnd = Math.max(0, enemyShotSnd - dt * 14);
  if (!state.paused) {
    updateGame(dt);
    troops.update(dt, P, running);
    items.update(dt);
  }
  updateHands(dt);
  updateGuns(dt);
  for (const k of ['rifle', 'pistol']) { const g = P[k]; g.cd = Math.max(0, g.cd - dt); g.kick = Math.max(0, g.kick - dt * 0.35); }
  fx.update(dt);
  troops.render();
  // efekty ekranu
  hitT -= dt; hitMark.visible = hitT > 0;
  const low = P.alive && P.hp < 35 ? 0.25 + 0.15 * Math.sin(clockT * 6) : 0;
  vignette.material.opacity = Math.min(0.95, state.hurt + low);
  blackout.material.opacity = state.phase === 'dead' ? Math.min(0.85, state.dead * 0.5) : 0;
  audio.loop('heart', 'heart', null, P.alive && P.hp < 35 ? 0.6 : 0);
  if (state.shake > 0) { state.shake -= dt; if (!xr) camera.rotation.z = (Math.random() - 0.5) * state.shake * 0.05; }
  // tło: wiatr i odległa artyleria
  audio.loop('wind', 'wind', null, 0.22);
  ambT -= dt; if (ambT <= 0) { ambT = rnd(5, 14); audio.play('thunder', V().set(rnd(-300, 300), 0, rnd(-400, -150)), 0.9, rnd(0.7, 1.1), 60); }
  map.lampLight.intensity = 3 + Math.sin(clockT * 13) * 0.2 + Math.sin(clockT * 7.3) * 0.25;
  updateMenuHover();
  updateHud();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);
function simStep(dt) { updatePlayerProxy(); if (!state.paused) { updateGame(dt); troops.update(dt, P, !state.paused && ['prep', 'wave', 'between'].includes(state.phase)); items.update(dt); } fx.update(dt); }
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

// ---------- przyciski strony ----------
async function startXR() {
  try {
    audio.resume();
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    session.addEventListener('end', () => { document.body.classList.remove('in-xr'); camera.position.set(0, EYE_T - FLOOR, 0); xrStartT = -1; frame.calibrated = false; base = FLOOR; placeRig(rig.position.x, rig.position.z); });
    await renderer.xr.setSession(session);
    document.body.classList.add('in-xr');
    rig.rotation.y = 0;
    if (state.phase === 'idle') { const r = () => hands.find((h) => h.hand === 'right'); setTimeout(() => { const h = r(); if (h && !h.held) h.held = { kind: 'rifle' }; }, 1200); }
  } catch (err) { console.error(err); alert('Nie udało się uruchomić VR: ' + err.message); }
}
(async () => {
  const b = document.getElementById('btn-vr'), note = document.getElementById('xr-note');
  b.onclick = startXR;
  document.getElementById('btn-start').onclick = () => { audio.resume(); startGame(); renderer.domElement.requestPointerLock?.(); };
  document.querySelectorAll('#menu [data-act]').forEach((el) => { el.onclick = () => { menuAction(el.dataset.act); document.getElementById('menu').style.display = 'none'; }; });
  if (!navigator.xr) { note.textContent = window.isSecureContext ? 'Ta przeglądarka nie obsługuje WebXR — gra na komputerze.' : 'WebXR wymaga HTTPS.'; b.disabled = true; return; }
  const vr = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  b.disabled = !vr; if (!vr) note.textContent = 'Brak gogli VR — gra na komputerze (mysz + klawiatura).';
})();
camera.position.set(0, EYE_T - FLOOR, 0);

window.__trench = { simStep, map, troops, items, guns, P, state, startGame, nextWave, camera, rig, scene, THREE, hands, fireGun, shootRay, ars, look, keys, updateDesktop, menuAction, get desk() { return desk; }, set desk(v) { desk = v; }, deskReload, deskInteract, deskThrow, set mounted(v) { mounted = v; }, get mounted() { return mounted; } };
void MAG;
