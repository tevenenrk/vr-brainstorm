import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { CanvasPanel } from '../hud.js';
import { TrenchMap, FLOOR, DUG_FLOOR } from './world.js';
import { Troops, MAG, KIT, TRACER_V } from './soldiers.js';
import { Smoke } from './smoke.js';
import { GUNS, POUCH_CAP, AMMO_NAME, rifleMesh, sniperMesh, launcherMesh, pistolMesh, knifeMesh, magMesh, grenadeMesh, Items, Minigun, Fx } from './gear.js';
import { TrenchAudio } from './audio.js';

const params = new URLSearchParams(location.search);
const EYE_T = 0.52;                    // wysokość oczu stojącego gracza nad gruntem (tuż nad workami)
const ALLIES = 8;
const ALLY_KIT = ['rifle', 'sniper', 'rifle', 'launcher', 'rifle', 'rifle', 'sniper', 'rifle', 'launcher', 'rifle', 'rifle', 'rifle', 'rifle', 'sniper', 'rifle', 'rifle'];
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
const smoke = new Smoke(scene, map);
troops.smoke = smoke;
// skrzynki pod posterunkami (stopień strzelecki)
{
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.16, 0.38).translate(0, 0.08, 0), new THREE.MeshLambertMaterial({ color: 0x5a4632 }), map.posts.length);
  map.posts.forEach((p, i) => m.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, FLOOR, p.y)));
  scene.add(m);
}

// ---------- arsenał w ziemiance ----------
const ARS0 = { rifle: 40, sniper: 16, gl: 14, pistol: 20, grenade: 24 };
const ars = { ...ARS0 };
troops.arsenal = ars;
const CRATE_NAMES = { rifle: 'MAG. KARABIN', sniper: 'MAG. SNAJPERKA', gl: 'GRANATNIK', pistol: 'MAG. PISTOLET', grenade: 'GRANATY' };
const crates = [['rifle', -3.2], ['sniper', -1.6], ['gl', 0], ['pistol', 1.6], ['grenade', 3.2]].map(([type, x]) => {
  const g = new THREE.Group(); g.position.set(x, DUG_FLOOR, 24.1);
  const wood = new THREE.MeshLambertMaterial({ color: 0x6a5034 }), W2 = 0.74;
  g.add(new THREE.Mesh(new THREE.BoxGeometry(W2, 0.06, 0.6).translate(0, 0.03, 0), wood));
  for (const [w, d, px, pz] of [[W2, 0.04, 0, 0.28], [W2, 0.04, 0, -0.28], [0.04, 0.6, W2 / 2 - 0.02, 0], [0.04, 0.6, -W2 / 2 + 0.02, 0]]) g.add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.55, d).translate(px, 0.3, pz), wood));
  const fill = new THREE.Group(); g.add(fill);
  for (let k = 0; k < 8; k++) {
    const m = type === 'grenade' ? grenadeMesh() : magMesh(type);
    m.position.set(-0.24 + (k % 4) * 0.16, type === 'grenade' || type === 'gl' ? 0.5 : 0.58, -0.12 + Math.floor(k / 4) * 0.22);
    if (type !== 'grenade') m.rotation.x = 0.2;
    fill.add(m);
  }
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  label.position.set(0, 0.36, -0.31); label.rotation.y = Math.PI; g.add(label);
  scene.add(g);
  const box = new THREE.Box3(new THREE.Vector3(x - W2 / 2 - 0.03, DUG_FLOOR, 23.75), new THREE.Vector3(x + W2 / 2 + 0.03, DUG_FLOOR + 0.85, 24.45));
  return { type, g, fill, box, center: box.getCenter(new THREE.Vector3()), draw: () => { const c = cv.getContext('2d'); c.fillStyle = '#d8c8a0'; c.fillRect(0, 0, 256, 96); c.fillStyle = '#2a1a0a'; c.font = 'bold 24px system-ui'; c.textAlign = 'center'; c.fillText(CRATE_NAMES[type], 128, 36); c.font = 'bold 40px system-ui'; c.fillText(`${ars[type]}`, 128, 82); tex.needsUpdate = true; fill.children.forEach((m, i) => { m.visible = i < Math.ceil(ars[type] / ARS0[type] * 8); }); } };
});
const drawCrates = () => crates.forEach((c) => c.draw());
drawCrates();

// ---------- gracz ----------
const P = { isPlayer: true, side: 0, alive: true, hp: 100, regenT: 0, x: 0, z: 0, head: V(), chest: V(), speed: 0, kills: 0,
  slots: { back: null, hip: null, chest: null }, pouch: { primary: [], pistol: [], grenade: 2 } };

// ---------- broń jako przedmioty: w dłoni, w kaburze/na plecach albo na ziemi ----------
const MESH = { rifle: rifleMesh, sniper: sniperMesh, launcher: launcherMesh, pistol: pistolMesh, knife: knifeMesh };
const SLOT_OF = { rifle: 'back', sniper: 'back', launcher: 'back', pistol: 'hip', knife: 'chest' };
const TWO_HAND = { rifle: true, sniper: true, launcher: true };
const WNAME = { rifle: 'Karabin', sniper: 'Snajperka', launcher: 'Granatnik', pistol: 'Pistolet', knife: 'Nóż' };
const weapons = [];
function makeWeapon(type, rounds) {
  const G = GUNS[type] || null;
  const w = { type, G, mesh: MESH[type](), mag: G ? { rounds: rounds ?? G.mag } : null, cd: 0, kick: 0, where: 'none', hand: null, slot: null, it: null, born: performance.now() };
  scene.add(w.mesh); weapons.push(w);
  return w;
}
function detach(w) {
  if (w.where === 'slot') { P.slots[w.slot] = null; w.slot = null; }
  if (w.where === 'hand') { const h = w.hand; if (h.held?.w === w) h.held = null; const o = other(h); if (o.support) o.support = false; w.hand = null; }
  if (w.where === 'world' && w.it) { items.remove(w.it); scene.add(w.mesh); w.it = null; }
  w.where = 'none';
}
function toSlot(w, slot) { detach(w); w.where = 'slot'; w.slot = slot; P.slots[slot] = w; }
function toHand(w, h) { detach(w); w.where = 'hand'; w.hand = h; h.held = { kind: 'weapon', w }; }
function toWorld(w, pos, vel, lieAt) {
  detach(w);
  const it = items.add('weapon', w.type, pos, vel || V(), { mesh: w.mesh, persist: true, w });
  it.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  w.where = 'world'; w.it = it; w.flat = false;
  // położona w konkretnym miejscu (np. na stole) — bez fizyki
  if (lieAt) { it.rest = true; w.flat = true; w.mesh.position.copy(pos); w.mesh.rotation.set(0, lieAt, Math.PI / 2); }
  // limit leżącej broni
  const lying = weapons.filter((x) => x.where === 'world');
  if (lying.length > 26) { const old = lying.sort((a, b) => a.born - b.born)[0]; if (old !== w) removeWeapon(old); }
}
function removeWeapon(w) { detach(w); scene.remove(w.mesh); const i = weapons.indexOf(w); if (i >= 0) weapons.splice(i, 1); }
function heldWeapon(h) { return h.held?.kind === 'weapon' ? h.held.w : null; }
// odległość punktu od broni (odcinek kolba–wylot)
function nearWeapon(w, p, r) {
  w.mesh.updateWorldMatrix(true, false);
  const a = V().set(0, 0, w.type === 'pistol' ? 0.03 : w.type === 'knife' ? 0.06 : 0.22).applyMatrix4(w.mesh.matrixWorld);
  const b = (w.G ? w.G.muzzle.clone() : V().set(0, 0, -0.2)).applyMatrix4(w.mesh.matrixWorld);
  const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return a.addScaledVector(ab, t).distanceTo(p) < r;
}
function primaryW() { return heldPrimary() || P.slots.back; }
function heldPrimary() { for (const h of hands) { const w = heldWeapon(h); if (w && TWO_HAND[w.type]) return w; } return null; }
let base = FLOOR, bodyYaw = 0, crouch = false;
const state = { phase: 'idle', wave: 0, timer: 0, auto: true, loadout: 'rifle', paused: false, msg: '', msgT: 0, msgCol: '#ffe8b0', hurt: 0, dead: 0 };
function placeRig(x, z) { rig.position.set(x, map.floorAt(x, z) - FLOOR + base, z); }
placeRig(map.spawnPoint.x, map.spawnPoint.y + 0.3);

// ---------- panele ----------
class Wrist extends CanvasPanel {
  constructor() { super(520, 390, 0.14); }
  draw(s) {
    const key = JSON.stringify(s); if (key === this.last) return; this.last = key;
    const c = this.ctx, W = this.canvas.width;
    this.background(s.hp < 35 ? 'rgba(255,90,70,0.9)' : 'rgba(200,190,140,0.7)');
    c.textAlign = 'left'; c.fillStyle = '#f0e6c8'; c.font = 'bold 34px system-ui'; c.fillText(s.title, 24, 48);
    c.textAlign = 'right'; c.font = 'bold 26px system-ui'; c.fillStyle = '#ffb4a0'; c.fillText(`☠ ${s.kills}`, W - 24, 46);
    c.textAlign = 'left';
    c.fillStyle = '#3a1a14'; c.fillRect(24, 64, W - 48, 22); c.fillStyle = s.hp < 35 ? '#ff4a3a' : '#7ad06a'; c.fillRect(24, 64, (W - 48) * s.hp / 100, 22);
    c.font = '25px system-ui'; c.fillStyle = '#e8e0c8';
    c.fillText(`${s.pn}: ${s.r} · w kieszeni ${s.rp}`, 24, 124);
    c.fillText(`Pistolet: ${s.p} · w kieszeni ${s.pp}`, 24, 158);
    c.fillText(`Granaty: ${s.g}   ·   Obrońcy: ${s.allies}`, 24, 192);
    c.fillStyle = '#c8b890'; c.font = '22px system-ui';
    c.fillText(`Arsenał: kar. ${s.ar} · snaj. ${s.as} · gran. ${s.agl} · pist. ${s.ap} · gr. ${s.ag}`, 24, 228);
    c.fillStyle = s.artReady ? '#9fe8b0' : '#c8a080'; c.font = 'bold 22px system-ui'; c.fillText(s.art, 24, 264);
    c.fillStyle = s.subCol || '#ffd890'; c.font = 'bold 24px system-ui'; c.fillText(s.sub, 24, 306);
    c.fillStyle = '#b8b0a0'; c.font = '19px system-ui'; c.fillText(s.hint, 24, 352);
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
  constructor() { super(720, 900, 0.6); this.buttons = []; this.hover = -1; this.mesh.visible = false; this.mesh.material.depthTest = false; this.mesh.renderOrder = 9500; }
  hit(px, py) { return this.buttons.findIndex((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h); }
  draw(o) {
    const key = JSON.stringify([o, this.hover]); if (key === this.last) return; this.last = key;
    const c = this.ctx; this.background('#b8a878'); this.buttons = [];
    const btn = (x, y, w, h, label, act, accent) => { const i = this.buttons.length; this.buttons.push({ x, y, w, h, act }); c.fillStyle = this.hover === i ? '#f4e0b0' : accent || '#3a3228'; this.roundRect(x, y, w, h, 12); c.fill(); c.fillStyle = this.hover === i ? '#2a1a06' : '#f4ece0'; c.font = 'bold 26px system-ui'; c.textAlign = 'center'; c.fillText(label, x + w / 2, y + h / 2 + 9); c.textAlign = 'left'; };
    c.fillStyle = '#f4ead8'; c.font = 'bold 40px system-ui'; c.fillText('OBRONA OKOPÓW', 30, 58);
    let y = 84;
    btn(30, y, 660, 64, o.phase === 'idle' || o.phase === 'dead' ? '▶ START (nowa gra)' : o.paused ? '▶ Wznów' : '❚❚ Pauza', 'run', '#3a6a2a'); y += 78;
    btn(30, y, 320, 60, 'Od nowa', 'restart', '#6a2a22'); btn(370, y, 320, 60, 'Dopasuj wzrost', 'calib', '#5a4a1a'); y += 74;
    btn(30, y, 320, 60, '⚑ Wezwij falę teraz', 'wave', '#7a4a12'); btn(370, y, 320, 60, o.auto ? 'Fale: automatyczne' : 'Fale: na żądanie', 'auto', '#4a3a5a'); y += 74;
    btn(30, y, 320, 60, `Broń: ${o.loadout}`, 'loadout', '#3a4a2a'); btn(370, y, 320, 60, o.art, 'art', '#6a2a1a'); y += 74;
    btn(30, y, 152, 56, 'Artyleria', 'mode:index.html', '#2a3a5a'); btn(199, y, 152, 56, 'Średniow.', 'mode:medieval.html', '#2a3a5a'); btn(368, y, 152, 56, 'Kostucha', 'mode:reaper.html', '#2a3a5a'); btn(537, y, 152, 56, 'Godzilla', 'mode:godzilla.html', '#1a3a5a'); y += 70;
    btn(30, y, 660, 56, 'Zamknij menu', 'close'); y += 80;
    c.font = '21px system-ui'; c.fillStyle = '#f4ead8';
    ['Chwyt: broń z kabury / z ziemi / z drugiej dłoni, magazynek z kieszeni.', 'Puść broń przy kaburze = schowaj; gdzie indziej upada na ziemię.', 'Spust: strzał · granat: spust = zawleczka, puść chwyt = rzut.', 'A / X: wyrzuć magazynek · włóż nowy, przykładając go do broni.', 'Puść magazynek przy kieszeni na pasie — schowasz go.', 'Pusta ręka + spust: najbliższy przedmiot (wskazany) leci do dłoni.', 'Drabinka: idź w jej stronę albo chwyć szczebel — wyjście z okopu.', 'Wciśnij gałkę: artyleria — wskaż cel, spust = ogień.', 'Minigun: chwyć uchwyty z tyłu, spust = ogień, uważaj na temperaturę.', 'Kucnij, by schować się za workami. Lewa gałka: chód, prawa: obrót.'].forEach((l, i) => c.fillText(l, 30, y + i * 30));
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
  for (const h of hands) if (heldWeapon(h) || h.mg) pulse(h, kill ? 1 : 0.7, kill ? 120 : 50);
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
  const h = { i, c, grip, ray, source: null, hand: null, held: null, trigger: false, squeeze: false, prev: [], pos: V(), last: V(), vel: V(), hist: [], q: new THREE.Quaternion(), support: false, mg: null, blockFire: false, zone: null };
  c.addEventListener('connected', (e) => { h.source = e.data; h.hand = e.data.handedness; if (h.hand === 'left') grip.add(wrist.mesh); });
  c.addEventListener('disconnected', () => { h.source = null; });
  c.addEventListener('selectstart', () => {
    audio.resume(); h.trigger = true;
    if (menu.mesh.visible && h.hand === 'right') { h.blockFire = true; if (menu.hover >= 0) menuAction(menu.buttons[menu.hover].act); return; }
    if (art.aim === h) { h.blockFire = true; artFire(); return; }
    triggerDown(h);
  });
  c.addEventListener('selectend', () => { h.trigger = false; h.blockFire = false; });
  c.addEventListener('squeezestart', () => { audio.resume(); h.squeeze = true; grab(h); });
  c.addEventListener('squeezeend', () => { h.squeeze = false; release(h); });
  return h;
});
wrist.mesh.position.set(0, 0.035, 0.1); wrist.mesh.rotation.x = -1.1;
const other = (h) => hands[1 - h.i];
function pulse(h, v, ms) { const a = h.source?.gamepad?.hapticActuators?.[0]; if (a) a.pulse(v, ms); }

// ---------- sloty na ciele (względem głowy i kierunku tułowia) ----------
// broń główna na plecach za prawym ramieniem, pistolet na prawym biodrze, nóż wysoko na lewej piersi;
// magazynki do broni głównej z przodu pasa po lewej, pistoletowe na lewym boku, granaty z przodu po prawej
const SLOTS = {
  back: new THREE.Vector3(0.17, -0.24, 0.13), hip: new THREE.Vector3(0.27, -0.84, 0.06), chest: new THREE.Vector3(-0.15, -0.3, -0.13),
  'pouch-primary': new THREE.Vector3(-0.12, -0.68, -0.2), 'pouch-pistol': new THREE.Vector3(-0.31, -0.74, 0.0), 'pouch-grenade': new THREE.Vector3(0.2, -0.66, -0.15),
};
const SLOT_R = { back: 0.24, hip: 0.14, chest: 0.12, 'pouch-primary': 0.14, 'pouch-pistol': 0.12, 'pouch-grenade': 0.12 };
const SLOT_COL = { back: 0xa0d0ff, hip: 0xa0d0ff, chest: 0xe0e0e0, 'pouch-primary': 0x90ff90, 'pouch-pistol': 0x60e0c0, 'pouch-grenade': 0xffb060 };
const bodyQ = new THREE.Quaternion();
function slotPos(name, out = V()) { const h = camera.getWorldPosition(V()); return out.copy(SLOTS[name]).applyQuaternion(bodyQ).add(h); }
// slot pod dłonią (najbliższy względem promienia); puste kabury się pomija
function slotAt(h) {
  let best = null, bs = 1;
  for (const n of Object.keys(SLOTS)) {
    if (P.slots[n] === null) continue;
    const sc = slotPos(n).distanceTo(h.pos) / SLOT_R[n];
    if (sc < bs) { bs = sc; best = n; }
  }
  // dotknięcie broni wiszącej na plecach / w kaburze też ją łapie
  if (!best) for (const n of ['back', 'hip', 'chest']) if (P.slots[n] && nearWeapon(P.slots[n], h.pos, 0.09)) return n;
  return best;
}
const zoneMarks = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false })); m.visible = false; m.renderOrder = 50; scene.add(m); return m; });
// ładownice z widocznymi magazynkami (kolor wg typu amunicji)
const AMMO_COL = { rifle: 0x1e2024, sniper: 0x4a3420, gl: 0xb08a3a, pistol: 0x26282c };
const pouches = {};
for (const type of ['primary', 'pistol', 'grenade']) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(type === 'grenade' ? 0.12 : 0.14, 0.1, 0.06), new THREE.MeshLambertMaterial({ color: 0x4a4a32 })));
  const tops = [];
  for (let k = 0; k < POUCH_CAP[type]; k++) {
    const m = type === 'grenade' ? grenadeMesh() : new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.05, 0.05), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    m.scale.setScalar(0.9); m.position.set(-0.05 + k * (0.1 / Math.max(1, POUCH_CAP[type] - 1)), type === 'grenade' ? 0.07 : 0.07, 0); g.add(m); tops.push(m);
  }
  g.userData.tops = tops; g.visible = false; scene.add(g); pouches[type] = g;
}
const POUCH_OF = { rifle: 'primary', sniper: 'primary', gl: 'primary', pistol: 'pistol' };
// najlepszy magazynek z kieszeni na broń główną: pasujący do broni w drugiej dłoni / na plecach
function takePrimaryMag(pref) {
  const arr = P.pouch.primary; if (!arr.length) return null;
  const want = pref || primaryW()?.G?.ammo;
  let k = arr.findIndex((m) => m.type === want);
  if (k < 0) k = 0;
  const pick = arr.filter((m) => m.type === arr[k].type).sort((a, b) => b.rounds - a.rounds)[0];
  arr.splice(arr.indexOf(pick), 1);
  return pick;
}

// ---------- chwytanie ----------
function heldMeshPose(h, mesh, kind) {
  mesh.position.copy(h.pos); mesh.quaternion.copy(h.q);
  if (kind === 'mag') mesh.position.add(V().set(0, 0.07, -0.03).applyQuaternion(h.q));
  if (kind === 'grenade') mesh.position.add(V().set(0, 0.01, -0.03).applyQuaternion(h.q));
}
function wellWorld(w) { return w.G.well.clone().applyMatrix4(w.mesh.matrixWorld); }
function grab(h) {
  if (!P.alive || h.held || h.mg) return;
  const hp = h.pos;
  // minigun
  for (const g of guns) for (let k = 0; k < 2; k++) if (g.handleWorld(k).distanceTo(hp) < 0.16) { h.mg = { g, k }; pulse(h, 0.5, 40); return; }
  // szczebel drabinki: wspinaczka w górę albo zejście
  const rung = !P.climb && ladderAtHand(hp);
  if (rung && !slotAt(h)) { startClimb(rung.lad, rung.dir); pulse(h, 0.4, 40); return; }
  // broń w drugiej dłoni: łoże = trzymanie oburącz, reszta = przełożenie do tej dłoni
  const o = other(h), ow = heldWeapon(o);
  if (ow) {
    if (TWO_HAND[ow.type] && ow.G.fore.clone().applyMatrix4(ow.mesh.matrixWorld).distanceTo(hp) < 0.13) { h.support = true; pulse(h, 0.3, 30); return; }
    if (nearWeapon(ow, hp, 0.1)) { toHand(ow, h); audio.ui('click', 0.35, 0.9); pulse(h, 0.4, 40); pulse(o, 0.2, 20); return; }
  }
  // sloty: broń albo kieszeń
  const slot = slotAt(h);
  if (slot === 'back' || slot === 'hip' || slot === 'chest') { toHand(P.slots[slot], h); audio.ui('click', 0.4); pulse(h, 0.4, 40); return; }
  if (slot) {
    if (slot === 'pouch-grenade') { if (P.pouch.grenade > 0) { P.pouch.grenade--; holdItem(h, items.add('grenade', null, hp, null)); } else msg('Brak granatów — arsenał w ziemiance', '#ffb090'); }
    else if (slot === 'pouch-pistol') { const arr = P.pouch.pistol; if (arr.length) { arr.sort((a, b) => b - a); holdItem(h, items.add('mag', 'pistol', hp, null, { rounds: arr.shift() })); } else msg('Kieszeń pusta — magazynki są w arsenale i przy poległych', '#ffb090'); }
    else { const ow2 = heldWeapon(o); const m = takePrimaryMag(ow2?.G?.ammo); if (m) holdItem(h, items.add('mag', m.type, hp, null, { rounds: m.rounds })); else msg('Kieszeń pusta — magazynki są w arsenale i przy poległych', '#ffb090'); }
    return;
  }
  // broń leżąca w świecie
  let bw = null;
  for (const w of weapons) if (w.where === 'world' && nearWeapon(w, hp, 0.13)) { bw = w; break; }
  if (bw) { toHand(bw, h); audio.ui('click', 0.4); pulse(h, 0.4, 40); return; }
  // przedmiot na ziemi
  const it = items.nearest(hp, 0.16, (x) => x.kind !== 'weapon');
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
  if (body) { const it2 = takeFromBody(body, hp); if (it2) holdItem(h, it2); }
}
function magRounds(type) { return type === 'pistol' ? GUNS.pistol.mag : type === 'sniper' ? 5 : type === 'gl' ? 1 : 30; }
function takeFromBody(body, p) {
  const t = body.loot.type || 'rifle';
  if (body.loot.mags > 0) { body.loot.mags--; return items.add('mag', t, p, null, { rounds: body.side && t === 'rifle' ? Math.round(rnd(12, 30)) : magRounds(t) }); }
  if (body.loot.grenades > 0) { body.loot.grenades--; return items.add('grenade', null, p, null); }
  return null;
}
function bodyCenter(s, out = V()) { return out.set(s.x + s.fall.x * 0.6, s.y + 0.2, s.z + s.fall.z * 0.6); }
function lootBody(p, r) {
  let best = null, bd = r;
  for (const s of troops.soldiers) {
    if (s.state !== 'dead' || !s.loot || (s.loot.mags <= 0 && s.loot.grenades <= 0)) continue;
    const c = bodyCenter(s), d = c.distanceTo(p);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function holdItem(h, it) {
  if (it.kind === 'weapon') { toHand(it.w, h); pulse(h, 0.4, 40); audio.ui('click', 0.4); return; }
  it.held = h; it.pull = null; it.rest = false; h.held = { kind: 'item', item: it }; it.drop = null; pulse(h, 0.35, 30); audio.ui('click', 0.3, 0.8);
}
function release(h) {
  if (h.mg) { h.mg = null; return; }
  if (h.support) { h.support = false; return; }
  const H = h.held; if (!H) return;
  const peak = h.hist.reduce((a, v) => (v.lengthSq() > a.lengthSq() ? v : a), h.vel);
  if (H.kind === 'weapon') {
    const w = H.w, slot = SLOT_OF[w.type];
    // przy kaburze / na plecach: chowamy; w innym miejscu broń upada
    if (!P.slots[slot] && slotPos(slot).distanceTo(h.pos) < SLOT_R[slot] * 1.5) { toSlot(w, slot); audio.ui('click', 0.35, 0.7); pulse(h, 0.3, 30); return; }
    toWorld(w, w.mesh.position.clone(), peak.clone());
    return;
  }
  h.held = null;
  const it = H.item; it.held = null;
  const key = it.kind === 'grenade' ? 'grenade' : POUCH_OF[it.type];
  // schowanie do kieszeni
  if (slotPos('pouch-' + key).distanceTo(it.pos) < 0.2 && !(it.kind === 'grenade' && it.armed)) {
    if (it.kind === 'grenade') { if (P.pouch.grenade < POUCH_CAP.grenade) { P.pouch.grenade++; items.remove(it); audio.ui('magin', 0.4, 0.8); return; } }
    else if (it.rounds <= 0) msg('Pusty magazynek — wyrzuć go', '#ffb090');
    else if (key === 'pistol' ? P.pouch.pistol.length < POUCH_CAP.pistol : P.pouch.primary.length < POUCH_CAP.primary) {
      if (key === 'pistol') P.pouch.pistol.push(it.rounds); else P.pouch.primary.push({ type: it.type, rounds: it.rounds });
      items.remove(it); audio.ui('magin', 0.4, 0.8); return;
    } else msg('Kieszeń pełna', '#ffb090');
  }
  // rzut / upuszczenie z prędkością dłoni (szczyt z ostatnich ~0,1 s)
  if (it.kind === 'grenade') { it.vel.copy(peak).multiplyScalar(2.1); if (peak.length() > 2.5) it.vel.y += 1.5; if (it.vel.length() > 34) it.vel.setLength(34); }
  else it.vel.copy(peak);
  if (it.kind === 'grenade' && it.armed) { it.byPlayer = true; it.fuse = Math.min(it.fuse, 3.6); }
}
function triggerDown(h) {
  if (!P.alive) return;
  const H = h.held;
  if (!H && !h.mg && !h.support) { pullToHand(h); return; }
  const w = heldWeapon(h);
  if (w && w.G && !w.G.auto) fireHeld(w, h);
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
// strzał z broni w (VR: z wylotu wzdłuż lufy; komputer: od oka przez środek ekranu)
function fireWeapon(w, muzzle, dir, h, origin = muzzle) {
  const G = w.G;
  if (!w.mag || w.mag.rounds <= 0) { audio.ui('click', 0.6); w.cd = 0.25; return; }
  w.mag.rounds--; w.cd = 1 / G.rate; w.kick = Math.min(0.12, w.kick + G.recoil);
  const d = dir.clone().add(V().set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(G.spread)).normalize();
  fx.flash(muzzle, w.type === 'pistol' ? 0.16 : w.type === 'launcher' ? 0.3 : 0.24);
  audio.play(G.sound, muzzle, w.type === 'sniper' ? 1.2 : 0.9, 1, w.type === 'sniper' ? 6 : 3);
  if (G.projectile) {
    launchShell(muzzle.clone().addScaledVector(d, 0.1), d.clone().multiplyScalar(G.speed), true, 0);
  } else {
    const end = shootRay(origin, d, G.dmg, G.head);
    troops.tracers.push({ a: muzzle.clone(), b: end, t: 0, T: muzzle.distanceTo(end) / (w.type === 'sniper' ? TRACER_V * 1.6 : TRACER_V), side: 0, player: true, len: w.type === 'sniper' ? 9 : 5 });
  }
  if (w.type === 'sniper' && w.mag.rounds > 0) setTimeout(() => audio.ui('bolt', 0.6), 380);
  shotN++;
  if (h) pulse(h, w.type === 'rifle' ? 0.55 : 0.85, w.type === 'rifle' ? 35 : 70);
  P.shotT = 0;
}
function fireHeld(w, h) {
  if (w.cd > 0 || !w.G) return;
  w.mesh.updateWorldMatrix(true, false);
  fireWeapon(w, w.G.muzzle.clone().applyMatrix4(w.mesh.matrixWorld), V().set(0, 0, -1).transformDirection(w.mesh.matrixWorld), h);
}
function eject(w, h) {
  if (!w.mag) return;
  items.add('mag', w.G.ammo, wellWorld(w), h ? h.vel.clone().add(V().set(0, -0.5, 0)) : V().set(0, -0.5, 0), { rounds: w.mag.rounds });
  w.mag = null; audio.ui('magout', 0.7);
}
function insert(w, it) { w.mag = { rounds: it.rounds }; items.remove(it); audio.ui('magin', 0.8); }

// ---------- pociski granatnika (gracz i AI) ----------
const shells = [];
const shellGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.09, 8).rotateX(Math.PI / 2), shellMat = new THREE.MeshLambertMaterial({ color: 0x5a6040 });
function launchShell(from, vel, byPlayer, side) {
  const m = new THREE.Mesh(shellGeo, shellMat); m.position.copy(from); scene.add(m);
  shells.push({ m, p: m.position, v: vel.clone(), byPlayer, side, t: 0 });
}
function ballisticVel(from, to, speed) {
  const dx = to.x - from.x, dz = to.z - from.z, X = Math.hypot(dx, dz), Y = to.y - from.y, g = 9.81, v2 = speed * speed;
  const disc = v2 * v2 - g * (g * X * X + 2 * Y * v2);
  const th = disc < 0 ? Math.PI / 4 : Math.atan((v2 - Math.sqrt(disc)) / (g * X));
  return V().set(dx / X * Math.cos(th) * speed, Math.sin(th) * speed, dz / X * Math.cos(th) * speed);
}
troops.onLaunch = (s, target) => {
  const from = troops.eyePos(s, V()).add(V().set(Math.sin(s.yaw) * 0.7, -0.05, Math.cos(s.yaw) * 0.7));
  const d = from.distanceTo(target), err = 0.04 * d + 1;
  const tgt = target.clone().add(V().set(rnd(-err, err), 0, rnd(-err, err)));
  launchShell(from, ballisticVel(from, tgt, 46), false, s.side);
  const dd = from.distanceTo(P.head);
  audio.play('gl', from, Math.min(1, 0.4 + 15 / (dd + 10)), 1, 6);
  fx.flash(from, 0.25);
};
function updateShells(dt) {
  for (let i = shells.length - 1; i >= 0; i--) {
    const sh = shells[i]; sh.t += dt;
    let boom = false;
    const steps = Math.ceil(sh.v.length() * dt / 0.4);
    for (let k = 0; k < steps && !boom; k++) {
      const h = dt / steps;
      sh.v.y -= 9.81 * h; sh.p.addScaledVector(sh.v, h);
      if (map.solid(sh.p.x, sh.p.y, sh.p.z) || sh.t > 12) { boom = true; break; }
      if (sh.t > 0.08) {
        for (const s of troops.soldiers) if (s.state === 'alive' && !(s.delay > 0) && troops.chestPos(s, V()).distanceTo(sh.p) < 0.55) { boom = true; break; }
        if (!sh.byPlayer && P.alive && P.chest.distanceTo(sh.p) < 0.6) boom = true;
      }
    }
    sh.m.lookAt(sh.p.clone().add(sh.v));
    if (Math.random() < 0.6) fx.steam(sh.p);
    if (boom) { scene.remove(sh.m); shells.splice(i, 1); explodeAt(sh.p.clone(), 6, sh.byPlayer, 0.9); }
  }
}

// nóż: trafienie ostrzem w ruchu
const knifeHitT = new Map();
function knifeContact(h, dt) {
  if (h.vel.length() < 1.5) return;
  const kw = heldWeapon(h); if (!kw) return;
  const m = kw.mesh.matrixWorld, a = V().set(0, 0, -0.06).applyMatrix4(m), b = V().set(0, 0, -0.22).applyMatrix4(m);
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
  P.alive = false; P.hp = 0; state.phase = 'dead'; state.dead = 0; P.climb = null;
  for (const h of hands) { if (h.held) release(h); h.held = null; h.mg = null; h.support = false; }
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
troops.onDeath = (s, from, part) => {
  if (s.side === 0) msg('Padł jeden z naszych!', '#ff9a8a', 1.6);
  // broń poległego upada obok ciała (można ją podnieść)
  if (Math.hypot(s.x - P.x, s.z - P.z) < 160) {
    const w = makeWeapon(s.weapon || 'rifle', Math.max(0, Math.min(s.mag, GUNS[s.weapon || 'rifle'].mag)));
    w.mesh.position.set(s.x, s.y + 1.1, s.z);
    toWorld(w, w.mesh.position.clone(), V().set(rnd(-1, 1), 1, rnd(-1, 1)));
  }
};
troops.onThrow = (s, target) => {
  const from = troops.eyePos(s, V()).add(V().set(0, 0.2, 0));
  const dx = target.x - from.x, dz = target.z - from.z, dist = Math.hypot(dx, dz), T = 0.5 + dist / 13, dy = target.y + 0.3 - from.y;
  const vel = V().set(dx / T, (dy + 0.5 * 9.81 * T * T) / T, dz / T);
  items.add('grenade', null, from, vel, { armed: true, fuse: T + rnd(0.8, 1.8), enemy: true });
  if (from.distanceTo(P.head) < 30) msg('GRANAT!', '#ff7a5a', 1.5);
};
items.onBounce = (it) => audio.play('click', it.pos, 0.5, 0.6, 1);
items.onExplode = (p, it) => explodeAt(p, 7, it.byPlayer, 1);
function explodeAt(p, R, byPlayer, S) {
  fx.explosion(p, S); audio.play('boom', p, 1.4 * Math.sqrt(S), S > 1 ? 0.8 : 1, 8 * S);
  const before = troops.soldiers.filter((s) => s.state === 'alive' && s.side === 1).length;
  troops.explode(p, R, byPlayer ? P : null);
  if (byPlayer) { const k = before - troops.soldiers.filter((s) => s.state === 'alive' && s.side === 1).length; if (k > 0) { P.kills += k; hitFx(true); } }
  const d = p.distanceTo(P.chest);
  if (d < R && (map.los(p.clone().add(V().set(0, 0.3, 0)), P.head, 0.2) || map.los(p.clone().add(V().set(0, 0.3, 0)), P.chest, 0.2) || d < 1.6)) hurt(130 * (1 - d / R) ** 1.3, 'boom');
  const sr = 25 * S;
  if (d < sr) { state.shake = Math.max(state.shake || 0, 0.6 * (1 - d / sr)); for (const h of hands) pulse(h, 0.6 * (1 - d / sr), 80); }
}
// zasłony dymne wroga
troops.onSmoke = (s, target) => {
  smoke.throw(troops.eyePos(s, V()).add(V().set(0, 0.2, 0)), target);
  if (Math.hypot(s.x - P.x, s.z - P.z) < 110 && Math.random() < 0.6) msg('Wróg stawia zasłonę dymną!', '#d8d8c8', 2);
};
smoke.onLand = (p) => audio.play('steam', p, 1.1, 0.55, 6);

// ---------- przebieg gry ----------
function clearAll() {
  troops.clear();
  for (const it of [...items.list]) items.remove(it);
  for (const w of [...weapons]) removeWeapon(w);
  for (const sh of shells) scene.remove(sh.m); shells.length = 0;
  for (const g of guns) { g.heat = 0; g.over = false; }
  smoke.clear();
  art.shells = []; art.aim = null; art.cd = 0; art.markT = 0;
}
function startGame() {
  clearAll();
  Object.assign(ars, ARS0); drawCrates();
  Object.assign(P, { alive: true, hp: 100, regenT: 0, kills: 0, surface: false, climb: null });
  for (const h of hands) { h.held = null; h.support = false; h.mg = null; }
  // wyposażenie: wybrana broń główna, pistolet, nóż; zapasowe bronie na stole w ziemiance
  const prim = state.loadout, ammo = GUNS[prim].ammo;
  toSlot(makeWeapon(prim), 'back'); toSlot(makeWeapon('pistol'), 'hip'); toSlot(makeWeapon('knife'), 'chest');
  P.pouch = { primary: Array.from({ length: prim === 'launcher' ? 4 : 3 }, () => ({ type: ammo, rounds: magRounds(ammo) })), pistol: [12, 12], grenade: 2 };
  ['rifle', 'sniper', 'launcher'].filter((t) => t !== prim).forEach((t, k) => { const w = makeWeapon(t); toWorld(w, V().set(-2.2 + (k - 0.5) * 1.1, DUG_FLOOR + 0.82, 21.2), V(), Math.PI / 2 + 0.1); });
  state.phase = 'prep'; state.timer = 20; state.wave = 0; state.paused = false; state.dead = 0;
  topUpAllies();
  placeRig(map.spawnPoint.x, map.spawnPoint.y + 0.3);
  if (!renderer.xr.isPresenting) { look.yaw = 0; look.pitch = 0; }
  else { const r = hands.find((h) => h.hand === 'right'); if (r && P.slots.back) toHand(P.slots.back, r); }
  menu.mesh.visible = false;
  msg(state.auto ? 'Zajmij stanowisko. Pierwsza fala za 20 s' : 'Zajmij stanowisko. Falę wzywasz z menu (Y/B)', '#ffe8b0', 4);
}
function topUpAllies() {
  const alive = troops.alive(0);
  const used = new Set(alive.map((s) => s.post));
  const free = map.posts.filter((p, i) => i % 2 === 0 && !used.has(p)).concat(map.posts.filter((p, i) => i % 2 === 1 && !used.has(p)));
  const cap = state.wave === 0 ? ALLIES : Math.min(ALLIES, alive.length + 3);   // posiłki: najwyżej 3 na falę
  for (let k = alive.length; k < cap && free.length; k++) {
    const post = free.shift();
    // posiłki nadchodzą z okopu wspierającego
    const s = troops.spawnAlly(post, rnd(-30, 30) | 0, 15, ALLY_KIT[map.posts.indexOf(post) % ALLY_KIT.length]); s.x = Math.round(s.x / 1) + 0.5; s.mode = state.phase === 'prep' && state.wave === 0 ? 'post' : 'return';
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
    if (state.auto) state.timer -= dt;
    if (state.timer <= 0) nextWave();
  } else if (state.phase === 'wave') {
    if (!troops.soldiers.some((s) => s.side === 1 && s.state === 'alive')) {
      state.phase = 'between'; state.timer = 25;
      msg(state.auto ? `Fala ${state.wave} odparta! Uzupełnij amunicję (arsenał w ziemiance)` : `Fala ${state.wave} odparta! Następną wezwij z menu`, '#9fe8b0', 5);
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
  else if (k === 'loadout') { const L = ['rifle', 'sniper', 'launcher']; state.loadout = L[(L.indexOf(state.loadout) + 1) % 3]; msg(`Broń główna: ${WNAME[state.loadout]} (od następnej gry; inne leżą na stole w ziemiance)`, '#ffe8b0', 3); }
  else if (k === 'art') { menu.mesh.visible = false; if (state.phase !== 'idle') state.paused = false; artToggle(renderer.xr.isPresenting ? hands.find((h) => h.hand === 'right') || hands[1] : 'desk'); }
  else if (k === 'wave') { callWave(); menu.mesh.visible = false; state.paused = false; }
  else if (k === 'auto') { state.auto = !state.auto; if (state.auto && (state.phase === 'prep' || state.phase === 'between')) state.timer = Math.min(state.timer, 15); msg(state.auto ? 'Fale nadchodzą same' : 'Fale tylko na żądanie (menu → Wezwij falę)', '#ffe8b0', 2.5); }
  else if (k === 'close') { menu.mesh.visible = false; if (renderer.xr.isPresenting) state.paused = false; }
  else if (k === 'mode') location.href = a;
  menu.last = '';
}
function callWave() {
  if (state.phase === 'idle' || state.phase === 'dead') { startGame(); }
  if (troops.alive(1).length > 80) { msg('Za dużo wrogów na polu — najpierw ich przerzedź', '#ffb090', 2.5); return; }
  nextWave();
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
  if (P.climb) return;
  const h = camera.getWorldPosition(V());
  const L = ladderFor(h, dx, dz);
  if (L) { startClimb(L.lad, L.dir); return; }
  if (P.surface) {
    // poza okopem: wszędzie w granicach mapy, przez drut kolczasty powoli
    const slow = map.wireAt(h.x + dx, h.z + dz) ? 0.3 : 1;
    if (map.inBounds(h.x + dx * slow, h.z + dz * slow)) { rig.position.x += dx * slow; rig.position.z += dz * slow; }
    return;
  }
  const nx = h.x + dx, nz = h.z + dz;
  const ok = (x, z) => map.walkable(x, z) && map.walkable(x + 0.2, z) && map.walkable(x - 0.2, z) && map.walkable(x, z + 0.2) && map.walkable(x, z - 0.2);
  if (ok(nx, nz)) { rig.position.x += dx; rig.position.z += dz; }
  else if (ok(nx, h.z)) rig.position.x += dx;
  else if (ok(h.x, nz)) rig.position.z += dz;
}
// ---------- drabinki: wyjście z okopu i zejście ----------
function ladderFor(h, dx, dz) {
  if (Math.hypot(dx, dz) < 1e-5) return null;
  for (const lad of map.ladders) {
    if (!P.surface) { if (Math.abs(h.x - lad.x) < 0.55 && Math.abs(h.z - lad.bottom.y) < 0.75 && dz * lad.side > 0 && Math.abs(dz) > Math.abs(dx) * 0.5) return { lad, dir: 'up' }; }
    else if (Math.abs(h.x - lad.x) < 0.7 && Math.abs(h.z - lad.exit.y) < 0.9 && dz * lad.side < 0 && Math.abs(dz) > Math.abs(dx) * 0.5) return { lad, dir: 'down' };
  }
  return null;
}
function ladderAtHand(hp) {
  const h = camera.getWorldPosition(V());
  for (const lad of map.ladders) {
    const lz = lad.wallZ - lad.side * 0.2;
    if (Math.abs(hp.x - lad.x) > 0.4 || Math.abs(hp.z - lz) > 0.5 || hp.y < lad.floor + 0.15 || hp.y > lad.top + 0.8) continue;
    if (!P.surface && Math.abs(h.x - lad.x) < 1.2 && Math.abs(h.z - lad.bottom.y) < 1.3) return { lad, dir: 'up' };
    if (P.surface && Math.abs(h.x - lad.x) < 1.3 && Math.abs(h.z - lad.exit.y) < 1.6) return { lad, dir: 'down' };
  }
  return null;
}
function deskClimb() {
  const h = camera.getWorldPosition(V());
  for (const lad of map.ladders) {
    if (!P.surface && Math.abs(h.x - lad.x) < 1.2 && Math.abs(h.z - lad.bottom.y) < 1.4) return startClimb(lad, 'up');
    if (P.surface && Math.abs(h.x - lad.x) < 1.3 && Math.abs(h.z - lad.exit.y) < 1.6) return startClimb(lad, 'down');
  }
  msg('Podejdź do drabinki', '#c8c0a8', 1.2);
}
const CL_T1 = 1.0, CL_T2 = 1.45;
function startClimb(lad, dir) {
  if (P.climb || !P.alive) return;
  const h = camera.getWorldPosition(V());
  P.climb = { lad, dir, t: 0, from: V().set(h.x, rig.position.y + FLOOR - base, h.z), step: 0 };
  crouch = false;
}
function climbPath(lad, s) {
  const e = (k) => k * k * (3 - 2 * k);
  if (s < CL_T1) { const k = e(s / CL_T1); return V().set(lad.x, lad.floor + (lad.top + 0.05 - lad.floor) * k, lad.bottom.y + (lad.wallZ - lad.bottom.y) * k); }
  const k = e((s - CL_T1) / (CL_T2 - CL_T1)), gz = lad.wallZ + (lad.exit.y - lad.wallZ) * k;
  return V().set(lad.x, lad.top + 0.05 + (map.surfaceAt(lad.x, lad.exit.y) - lad.top - 0.05) * k, gz);
}
function updateClimb(dt) {
  const C = P.climb; C.t += dt;
  const up = C.dir === 'up', s = up ? C.t : CL_T2 - C.t;
  const p = climbPath(C.lad, Math.max(0, Math.min(CL_T2, s)));
  const b = Math.min(1, C.t / 0.25);
  p.lerp(C.from, 1 - b);
  const h = camera.getWorldPosition(V());
  rig.position.x += p.x - h.x; rig.position.z += p.z - h.z; rig.position.y = p.y - FLOOR + base;
  // szczeble: drgnięcie i stuk
  const st = Math.floor(C.t / 0.22);
  if (st !== C.step && C.t < (up ? CL_T1 : CL_T2)) { C.step = st; for (const hh of hands) pulse(hh, 0.25, 20); audio.play('click', V().set(C.lad.x, p.y + 0.6, C.lad.wallZ), 0.5, 0.6, 1); }
  if (C.t >= CL_T2) { P.climb = null; P.surface = up; msg(up ? 'Na przedpolu! Uważaj — jesteś odsłonięty' : 'Z powrotem w okopie', up ? '#ffb070' : '#9fe8b0', 1.8); }
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
      if (down(3)) artToggle(h);
      if (down(4) && heldWeapon(h)?.G) eject(heldWeapon(h), h);
    } else {
      if (Math.abs(ax) > 0.75 && !h.flick) { h.flick = true; snapTurn(ax > 0 ? -Math.PI / 6 : Math.PI / 6); }
      if (Math.abs(ax) < 0.35) h.flick = false;
      if (down(5)) toggleMenu();
      if (down(3)) artToggle(h);
      if (down(4)) { if (state.phase === 'idle' || state.phase === 'dead') startGame(); else if (heldWeapon(h)?.G) eject(heldWeapon(h), h); }
    }
    h.prev = pr;
  }
}

// ---------- komputer: mysz + klawiatura ----------
const look = { yaw: 0, pitch: 0 };
const keys = new Set();
let desk = 'primary', ads = false, mouseDown = false, mounted = null;
const viewModel = new THREE.Group(); camera.add(viewModel);
const vm = { rifle: rifleMesh(), sniper: sniperMesh(), launcher: launcherMesh(), pistol: pistolMesh(), knife: knifeMesh(), grenade: grenadeMesh() };
for (const m of Object.values(vm)) { m.visible = false; viewModel.add(m); }
const DESK_SLOT = { primary: 'back', pistol: 'hip', knife: 'chest' };
function deskWeapon() { return DESK_SLOT[desk] ? P.slots[DESK_SLOT[desk]] : null; }
renderer.domElement.addEventListener('click', () => { audio.resume(); if (!renderer.xr.isPresenting && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.(); });
document.addEventListener('mousemove', (e) => { if (document.pointerLockElement === renderer.domElement) { const k = camera.fov < 30 ? 0.25 : 1; look.yaw -= e.movementX * 0.0022 * k; look.pitch = Math.max(-1.4, Math.min(1.4, look.pitch - e.movementY * 0.0022 * k)); } });
renderer.domElement.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  if (e.button === 2) { ads = true; return; }
  if (e.button !== 0 || !P.alive) return;
  if (art.aim === 'desk') { artFire(); return; }
  mouseDown = true;
  if (mounted) return;
  const w = deskWeapon();
  if (desk === 'knife') deskStab();
  else if (desk === 'grenade') deskThrow();
  else if (w && w.G && !w.G.auto) deskFire();
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) ads = false; });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  keys.add(e.code); audio.resume();
  if (e.repeat) return;
  if (e.code === 'Digit1') desk = 'primary';
  if (e.code === 'Digit2') desk = 'pistol';
  if (e.code === 'Digit3') desk = 'grenade';
  if (e.code === 'Digit4') desk = 'knife';
  if (e.code === 'KeyR') deskReload();
  if (e.code === 'KeyG') deskThrow();
  if (e.code === 'KeyC') crouch = !crouch;
  if (e.code === 'KeyE') deskInteract();
  if (e.code === 'KeyQ') deskDrop();
  if (e.code === 'KeyF') deskPull();
  if (e.code === 'KeyT') artToggle('desk');
  if (e.code === 'KeyN') callWave();
  if (e.code === 'Space') { e.preventDefault(); deskClimb(); }
  if (e.code === 'Enter') { if (state.phase === 'idle' || state.phase === 'dead') startGame(); else state.paused = !state.paused; }
  if (e.code === 'KeyO' || e.code === 'Escape') { document.getElementById('menu').style.display = document.getElementById('menu').style.display === 'block' ? 'none' : 'block'; }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
function deskDir() { return V().set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())); }
function deskFire() {
  const w = deskWeapon(); if (!w || !w.G || w.cd > 0 || w.reloadT > 0) return;
  const o = camera.getWorldPosition(V()), d = deskDir(), m = vm[w.type];
  // trafienie liczone od oka (dokładnie tam, gdzie celownik), smuga i błysk od lufy
  const mz = m.visible ? w.G.muzzle.clone().applyMatrix4(m.matrixWorld) : o.clone().addScaledVector(d, 0.5).add(V().set(0, -0.08, 0));
  fireWeapon(w, mz, d, null, w.G.projectile ? mz : o);
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
  const it = items.add('grenade', null, o.clone().addScaledVector(d, 0.4), d.multiplyScalar(21).add(V().set(0, 4, 0)), { armed: true, fuse: 3.6 });
  it.byPlayer = true; audio.ui('pin', 0.6);
}
function deskReload() {
  const w = deskWeapon(); if (!w || !w.G || w.reloadT > 0) return;
  let r = null;
  if (w.type === 'pistol') { const arr = P.pouch.pistol; if (arr.length) { arr.sort((a, b) => b - a); r = arr.shift(); } }
  else if (P.pouch.primary.some((m) => m.type === w.G.ammo)) r = takePrimaryMag(w.G.ammo).rounds;
  if (r === null) { msg(`Brak amunicji (${AMMO_NAME[w.G.ammo]}) w kieszeni`, '#ffb090'); return; }
  const old = w.mag; w.mag = null; audio.ui('magout', 0.7);
  if (old && old.rounds > 0) { if (w.type === 'pistol') P.pouch.pistol.push(old.rounds); else P.pouch.primary.push({ type: w.G.ammo, rounds: old.rounds }); }
  w.reloadT = w.type === 'pistol' ? 1.3 : w.type === 'launcher' ? 1.6 : 1.9; w.pending = r;
}
function pocket(type, rounds) {
  if (type === 'pistol') { if (P.pouch.pistol.length >= POUCH_CAP.pistol) return false; P.pouch.pistol.push(rounds); return true; }
  if (P.pouch.primary.length >= POUCH_CAP.primary) return false; P.pouch.primary.push({ type, rounds }); return true;
}
function deskPickWeapon(w) {
  const slot = SLOT_OF[w.type], old = P.slots[slot], at = camera.getWorldPosition(V()).add(V().set(0, -1, 0));
  if (old) toWorld(old, at, deskDir().multiplyScalar(1.5));
  toSlot(w, slot); desk = slot === 'back' ? 'primary' : slot === 'hip' ? 'pistol' : 'knife';
  msg(`Podniesiono: ${WNAME[w.type]}${old ? ` (upuszczono: ${WNAME[old.type]})` : ''}`, '#9fe8b0', 2);
  audio.ui('click', 0.5);
}
function deskDrop() {
  const w = deskWeapon(); if (!w) return;
  toWorld(w, camera.getWorldPosition(V()).addScaledVector(deskDir(), 0.5).add(V().set(0, -0.3, 0)), deskDir().multiplyScalar(2.5).add(V().set(0, 1, 0)));
  msg(`Upuszczono: ${WNAME[w.type]}`, '#c8c0a8', 1.5);
}
function deskInteract() {
  const h = camera.getWorldPosition(V());
  if (mounted) { mounted = null; msg('Zszedłeś z minigunu'); return; }
  for (const g of guns) { const mid = g.handleWorld(0).add(g.handleWorld(1)).multiplyScalar(0.5); if (Math.hypot(mid.x - h.x, mid.z - h.z) < 1.4) { mounted = g; msg('Minigun: LPM ogień · E zejdź', '#ffe8b0'); return; } }
  // broń na ziemi (najbliższa, w zasięgu ręki)
  let bw = null, bd = 1.9;
  for (const w of weapons) if (w.where === 'world') { const p2 = w.mesh.position, d = Math.hypot(p2.x - h.x, p2.z - h.z); if (d < bd && h.y - p2.y < 2.4) { bd = d; bw = w; } }
  if (bw) { deskPickWeapon(bw); return; }
  for (const c of crates) if (Math.hypot(c.center.x - h.x, c.center.z - h.z) < 2.6) {
    let got = 0;
    const pa = primaryW()?.G?.ammo || 'rifle';
    while (ars[pa] > 0 && pocket(pa, magRounds(pa))) { ars[pa]--; got++; }
    while (ars.pistol > 0 && pocket('pistol', GUNS.pistol.mag)) { ars.pistol--; got++; }
    while (P.pouch.grenade < POUCH_CAP.grenade && ars.grenade > 0) { P.pouch.grenade++; ars.grenade--; got++; }
    drawCrates(); msg(got ? `Uzupełniono z arsenału (${got})` : 'Kieszenie pełne albo arsenał pusty', '#9fe8b0'); audio.ui('magin', 0.6);
    return;
  }
  const body = lootBody(V().set(h.x, h.y - 1.2, h.z), 2.2);
  if (body) {
    let got = 0;
    while (body.loot.mags > 0 && pocket(body.loot.type || 'rifle', magRounds(body.loot.type || 'rifle'))) { body.loot.mags--; got++; }
    while (body.loot.grenades > 0 && P.pouch.grenade < POUCH_CAP.grenade) { body.loot.grenades--; P.pouch.grenade++; got++; }
    msg(got ? `Zabrano od poległego: ${got}` : 'Kieszenie pełne', '#9fe8b0'); audio.ui('magin', 0.5);
    return;
  }
  const it = items.nearest(V().set(h.x, h.y - 1.3, h.z), 1.6, (x) => x.kind !== 'weapon') || items.nearest(h, 1.6, (x) => x.kind !== 'weapon');
  if (it) {
    if (it.kind === 'grenade') { if (it.armed) { it.vel.copy(deskDir().multiplyScalar(12).add(V().set(0, 3, 0))); it.rest = false; it.byPlayer = true; msg('Odrzucony granat!', '#ffd080'); } else if (P.pouch.grenade < POUCH_CAP.grenade) { P.pouch.grenade++; items.remove(it); } }
    else if (it.rounds > 0 && pocket(it.type, it.rounds)) { items.remove(it); audio.ui('magin', 0.5); }
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
  for (const w of weapons) if (w.reloadT > 0) { w.reloadT -= dt; if (w.reloadT <= 0) { w.mag = { rounds: w.pending }; audio.ui('magin', 0.8); } }
  const w = deskWeapon();
  if (mouseDown && w && w.G?.auto && !mounted && P.alive && w.cd <= 0) deskFire();
  // model broni przed kamerą
  const vk = desk === 'grenade' ? 'grenade' : w ? w.type : null;
  const scoped = ads && vk === 'sniper' && !mounted;
  for (const [k, m] of Object.entries(vm)) m.visible = k === vk && !mounted && P.alive && !scoped;
  const fov = scoped ? 12 : 70;
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  document.getElementById('scope').style.display = scoped ? 'block' : 'none';
  if (vk) {
    const m = vm[vk], kick = w?.kick || 0;
    const aimPos = vk === 'rifle' ? V().set(0, -0.112, -0.28) : vk === 'pistol' ? V().set(0, -0.075, -0.32) : vk === 'launcher' ? V().set(0, -0.098, -0.3) : V().set(0.15, -0.2, -0.35);
    const hip = V().set(0.17, -0.2, -0.38);
    m.position.copy(ads && (vk === 'rifle' || vk === 'pistol' || vk === 'launcher') ? aimPos : hip);
    m.position.z += kick * 1.2; m.rotation.set(kick * 2, 0, 0);
    if (vk === 'knife') { const st = vm.knife.userData.stab || 0; vm.knife.userData.stab = Math.max(0, st - dt); m.position.z -= Math.sin((st / 0.25) * Math.PI) * 0.25; }
    if (w?.reloadT > 0) m.rotation.x -= 0.6;
    if (m.userData.counter && w?.G) m.userData.counter.userData.draw(w.mag ? w.mag.rounds : null, w.G.mag);
  }
  document.getElementById('cross').style.display = (ads && (vk === 'rifle' || vk === 'sniper')) || mounted ? 'none' : 'block';
}


// ---------- przyciąganie przedmiotów (pusta ręka + spust) ----------
const PULL_R = 15;
function pullCandidate(o, dir) {
  let best = null, bs = Infinity;
  const consider = (p, make) => {
    const v = p.clone().sub(o), d = v.length();
    if (d > PULL_R || d < 0.05) return;
    const c = v.divideScalar(d).dot(dir);
    if (c < -0.1 && d > 1.5) return;                      // za plecami — tylko to, co tuż obok
    const sc = d * (1 + (1 - c) * 2.5);
    if (sc >= bs) return;
    if (d > 0.8 && !map.los(o, p.clone().add(V().set(0, 0.1, 0)), 0.2)) return;
    bs = sc; best = { p, make };
  };
  for (const it of items.list) if (!it.held && !it.pull) consider(it.pos.clone(), () => it);
  for (const s of troops.soldiers) if (s.state === 'dead' && s.loot && (s.loot.mags > 0 || s.loot.grenades > 0)) { const c = bodyCenter(s); consider(c, () => takeFromBody(s, c)); }
  for (const c of crates) if (ars[c.type] > 0) consider(c.center.clone().add(V().set(0, 0.2, 0)), () => { ars[c.type]--; drawCrates(); return c.type === 'grenade' ? items.add('grenade', null, c.center.clone().add(V().set(0, 0.45, 0)), null) : items.add('mag', c.type, c.center.clone().add(V().set(0, 0.45, 0)), null); });
  return best;
}
function startPull(it, to) {
  it.pull = to; it.pullT = 0; it.rest = false;
  audio.play('woosh', it.pos, 0.5, 1.2, 1);
}
function pullToHand(h) {
  const dir = V().set(0, 0, -1).applyQuaternion(h.q);
  const c = pullCandidate(h.pos, dir);
  if (!c) { pulse(h, 0.15, 20); return; }
  const it = c.make(); if (!it) return;
  startPull(it, h); pulse(h, 0.3, 30);
}
function deskPull() {
  const o = camera.getWorldPosition(V());
  const c = pullCandidate(o, deskDir());
  if (!c) { msg('Nic do przyciągnięcia', '#c8c0a8', 1.2); return; }
  const it = c.make(); if (it) startPull(it, 'desk');
}
function updatePulls(dt) {
  for (const it of [...items.list]) {
    if (!it.pull) continue;
    const h = it.pull;
    it.pullT += dt;
    const target = h === 'desk' ? camera.getWorldPosition(V()).add(V().set(0, -0.35, 0)).addScaledVector(deskDir(), 0.4) : h.pos;
    const v = target.clone().sub(it.pos), d = v.length();
    if (d < 0.14 || it.pullT > 3) {
      it.pull = null;
      if (h === 'desk') {
        // komputer: prosto do kieszeni (albo odrzut uzbrojonego granatu)
        if (it.kind === 'grenade' && it.armed) { it.vel.copy(deskDir().multiplyScalar(18).add(V().set(0, 4, 0))); it.byPlayer = true; msg('Odrzucony granat!', '#ffd080'); }
        else if (it.kind === 'grenade' && P.pouch.grenade < POUCH_CAP.grenade) { P.pouch.grenade++; items.remove(it); audio.ui('magin', 0.5); }
        else if (it.kind === 'weapon') { it.vel.set(0, 0, 0); deskPickWeapon(it.w); }
        else if (it.kind === 'mag' && it.rounds > 0 && pocket(it.type, it.rounds)) { items.remove(it); audio.ui('magin', 0.5); }
        else { it.vel.set(0, 0, 0); msg('Kieszeń pełna', '#ffb090', 1.2); }
      } else if (!h.held && !h.mg && P.alive && d < 0.3) holdItem(h, it);
      else it.vel.set(0, 0, 0);
      continue;
    }
    const sp = Math.min(18, 3 + it.pullT * 30);
    it.pos.addScaledVector(v.divideScalar(d), Math.min(d, sp * dt));
    it.vel.set(0, 0, 0);
    it.mesh.rotateOnAxis(it.spin, dt * 10);
  }
}

// ---------- wsparcie artylerii ----------
const ART_CD = 60, ART_R = 9;
const art = { cd: 0, aim: null, target: V(), valid: false, has: false, shells: [], markT: 0 };
const artMark = (() => {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xff5030, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false });
  g.add(new THREE.Mesh(new THREE.RingGeometry(ART_R - 0.35, ART_R, 64).rotateX(-Math.PI / 2), mat));
  g.add(new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 24).rotateX(-Math.PI / 2), mat));
  for (const a of [0, Math.PI / 2]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.25, ART_R * 2 - 1).rotateX(-Math.PI / 2), mat); m.rotation.y = a; g.add(m); }
  // słup światła, żeby cel był widać z daleka
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 40, 8, 1, true).translate(0, 20, 0), new THREE.MeshBasicMaterial({ color: 0xff6040, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false, fog: false, blending: THREE.AdditiveBlending }));
  g.add(beam);
  g.traverse((o) => { o.renderOrder = 9100; });
  g.userData.mat = mat; g.visible = false; scene.add(g);
  return g;
})();
function artToggle(who) {
  if (!P.alive || !['prep', 'wave', 'between'].includes(state.phase)) { msg('Najpierw rozpocznij grę', '#ffb090', 1.5); return; }
  if (art.aim === who) { art.aim = null; msg('Artyleria: anulowano', '#c8c0a8', 1.2); return; }
  if (art.cd > 0 || art.shells.length) { msg(`Artyleria niegotowa — ${Math.ceil(Math.max(art.cd, 1))} s`, '#ffb090', 1.8); audio.ui('click', 0.4); return; }
  art.aim = who; audio.ui('radio', 0.5);
  msg(who === 'desk' ? 'Artyleria: wskaż cel celownikiem, LPM = ogień, T = anuluj' : 'Artyleria: wskaż cel kontrolerem, spust = ogień', '#ffd080', 3);
}
function artRay() {
  if (art.aim === 'desk') return [camera.getWorldPosition(V()), deskDir()];
  const h = art.aim;
  return [h.c.getWorldPosition(V()), V().set(0, 0, -1).applyQuaternion(h.c.getWorldQuaternion(new THREE.Quaternion()))];
}
function artFire() {
  if (!art.has) { msg('Wskaż ziemię na przedpolu', '#ffb090', 1.5); return; }
  if (!art.valid) { msg('Za blisko naszych okopów! Wskaż cel dalej', '#ff8a7a', 2); audio.ui('click', 0.5); return; }
  art.aim = null; art.cd = ART_CD; art.markT = 9;
  const c = art.target.clone();
  for (let k = 0; k < 9; k++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * ART_R;
    art.shells.push({ p: V().set(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r), t: 2.4 + k * 0.32 + rnd(0, 0.25), whistle: false });
  }
  audio.ui('radio', 0.7);
  msg('Ogień! Salwa artylerii za 2 s', '#ffd080', 2.5);
}
function updateArtillery(dt) {
  if (!state.paused) art.cd = Math.max(0, art.cd - dt);
  // celowanie
  for (const h of hands) if (h === art.aim) { h.ray.visible = true; }
  if (art.aim) {
    if (!P.alive) art.aim = null;
  }
  if (art.aim) {
    const [o, d] = artRay(), t = map.rayTerrain(o, d, 520);
    art.has = isFinite(t);
    if (art.has) { art.target.copy(o).addScaledVector(d, t); art.valid = art.target.z < -9 && art.target.z > -215; }
    if (art.aim !== 'desk') { const r = art.aim.ray; r.visible = true; r.scale.z = art.has ? t : 60; r.material.color.set(art.has && art.valid ? 0x60ff60 : 0xff5040); }
    artMark.visible = art.has; artMark.position.copy(art.target).add(V().set(0, 0.25, 0));
    artMark.userData.mat.color.set(art.valid ? 0x60ff60 : 0xff4030);
  } else if (art.markT > 0) {
    art.markT -= dt; artMark.visible = true; artMark.userData.mat.color.set(0xff8030);
    artMark.userData.mat.opacity = 0.75 * Math.min(1, art.markT);
  } else { artMark.visible = false; artMark.userData.mat.opacity = 0.75; }
  for (const h of hands) if (h !== art.aim && !menu.mesh.visible) { h.ray.visible = false; h.ray.material.color.set(0xffffff); h.ray.scale.z = 2; }
  if (state.paused) return;
  // pociski w drodze
  for (let i = art.shells.length - 1; i >= 0; i--) {
    const sh = art.shells[i]; sh.t -= dt;
    if (!sh.whistle && sh.t < 1.7) { sh.whistle = true; sh.p.y = map.heightAt(sh.p.x, sh.p.z); audio.play('incoming', sh.p.clone().add(V().set(0, 25, 0)), 1.6, rnd(0.9, 1.1), 40); }
    if (sh.t <= 0) { sh.p.y = map.heightAt(sh.p.x, sh.p.z); explodeAt(sh.p, ART_R * 0.9, true, 2.3); audio.play('thunder', sh.p, 1, 1.3, 30); art.shells.splice(i, 1); }
  }
}

// ---------- kolimator: czerwona kropka widoczna tylko przez okienko celownika ----------
// osobno dla każdego oka (warstwy 1 i 2 kamer XR): kropkę widzi oko, które patrzy przez okienko
const dotTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  c.strokeStyle = 'rgba(255,40,30,0.9)'; c.lineWidth = 3; c.beginPath(); c.arc(64, 64, 50, 0, Math.PI * 2); c.stroke();
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 6); g.addColorStop(0, 'rgba(255,80,60,1)'); g.addColorStop(0.6, 'rgba(255,30,20,1)'); g.addColorStop(1, 'rgba(255,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.arc(64, 64, 6, 0, Math.PI * 2); c.fill();
  for (const [x, y] of [[64, 6], [64, 122], [6, 64], [122, 64]]) { c.fillStyle = 'rgba(255,40,30,0.9)'; c.fillRect(x - 1.5, y - 1.5, 3, 3); }
  return new THREE.CanvasTexture(cv);
})();
const dots = [0, 1, 2].map((layer) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, depthTest: false, depthWrite: false, transparent: true, toneMapped: false, fog: false }));
  s.renderOrder = 9990; s.visible = false; s.layers.set(layer); scene.add(s);
  return s;
});
const redDot = dots[0];
const _inv = new THREE.Matrix4();
function eyePositions() {
  const xc = renderer.xr.getCamera();
  if (renderer.xr.isPresenting && xc.cameras && xc.cameras.length >= 2) return [V().setFromMatrixPosition(xc.cameras[0].matrixWorld), V().setFromMatrixPosition(xc.cameras[1].matrixWorld)];
  return null;
}
function placeDot(s, eye, dir) { const D = 60; s.position.copy(eye).addScaledVector(dir, D); s.scale.setScalar(0.02 * D / 0.39); s.visible = true; }
function updateRedDot(mesh, desk) {
  for (const d of dots) d.visible = false;
  if (!mesh || !mesh.visible || !mesh.userData.sight) return;
  mesh.updateWorldMatrix(true, false);
  if (desk) { placeDot(dots[0], camera.getWorldPosition(V()), deskDir()); return; }      // komputer: środek ekranu
  _inv.copy(mesh.matrixWorld).invert();
  const S = mesh.userData.sight, R = mesh.userData.sightR * 1.25, dir = V().set(0, 0, -1).transformDirection(mesh.matrixWorld);
  const inWin = (eye) => { const e = eye.clone().applyMatrix4(_inv); return e.z > S.z + 0.04 && Math.hypot(e.x - S.x, e.y - S.y) < R; };
  const eyes = eyePositions();
  if (!eyes) { const e = camera.getWorldPosition(V()); if (inWin(e)) placeDot(dots[0], e, dir); return; }
  // kropka „w nieskończoności” wzdłuż lufy — każde oko widzi ją, gdy patrzy przez okienko
  eyes.forEach((e, k) => { if (inWin(e)) placeDot(dots[k + 1], e, dir); });
}

// ---------- luneta snajperki: obraz z kamery na tylnej soczewce ----------
const scopeRT = new THREE.WebGLRenderTarget(400, 400);
const scopeCam = new THREE.PerspectiveCamera(4.5, 1, 0.5, 700);
scene.add(scopeCam);
const reticle = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.strokeStyle = 'rgba(0,0,0,0.9)'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, 128); c.lineTo(108, 128); c.moveTo(148, 128); c.lineTo(256, 128); c.moveTo(128, 0); c.lineTo(128, 108); c.moveTo(128, 148); c.lineTo(128, 256); c.stroke();
  c.lineWidth = 6; c.beginPath(); c.moveTo(0, 128); c.lineTo(60, 128); c.moveTo(196, 128); c.lineTo(256, 128); c.moveTo(128, 196); c.lineTo(128, 256); c.stroke();
  c.fillStyle = 'rgba(255,40,30,0.95)'; c.beginPath(); c.arc(128, 128, 2.5, 0, 7); c.fill();
  const g = c.createRadialGradient(128, 128, 100, 128, 128, 128); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)'); c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv);
})();
const lensMat = new THREE.ShaderMaterial({
  uniforms: { view: { value: scopeRT.texture }, ret: { value: reticle } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform sampler2D view; uniform sampler2D ret; varying vec2 vUv; void main(){ vec4 c = texture2D(view, vUv); vec4 r = texture2D(ret, vUv); gl_FragColor = vec4(mix(c.rgb, r.rgb, r.a), 1.0); #include <colorspace_fragment> }',
});
function updateScope() {
  const w = hands.map(heldWeapon).find((x) => x && x.type === 'sniper');
  if (!w || !renderer.xr.isPresenting) return;
  const lens = w.mesh.userData.lens;
  if (lens.material !== lensMat) lens.material = lensMat;
  w.mesh.updateWorldMatrix(true, true);
  const lp = V().setFromMatrixPosition(lens.matrixWorld);
  if (lp.distanceTo(camera.getWorldPosition(V())) > 0.35) return;      // oko daleko od lunety — nie liczymy obrazu
  scopeCam.position.copy(w.G.scope).add(V().set(0, 0, -0.2)).applyMatrix4(w.mesh.matrixWorld);
  scopeCam.quaternion.setFromRotationMatrix(w.mesh.matrixWorld);
  scopeCam.updateMatrixWorld(true);
  const xrOn = renderer.xr.enabled; renderer.xr.enabled = false;
  const prev = renderer.getRenderTarget();
  for (const d of dots) d.visible = false;
  renderer.setRenderTarget(scopeRT); renderer.render(scene, scopeCam);
  renderer.setRenderTarget(prev); renderer.xr.enabled = xrOn;
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
    h.hist.push(h.vel.clone()); if (h.hist.length > 8) h.hist.shift();
  }
  // kierunek tułowia nadąża za głową
  const cq = camera.getWorldQuaternion(new THREE.Quaternion()), f = V().set(0, 0, -1).applyQuaternion(cq);
  const yaw = Math.atan2(-f.x, -f.z), dy = wrap(yaw - bodyYaw);
  if (Math.abs(dy) > 0.5) bodyYaw += (dy - Math.sign(dy) * 0.5);
  bodyYaw += wrap(yaw - bodyYaw) * Math.min(1, dt * 0.8);
  bodyQ.setFromAxisAngle(V().set(0, 1, 0), bodyYaw);
  // broń w dłoniach, w kaburach i na ziemi
  for (const w of weapons) {
    const mesh = w.mesh;
    if (w.where === 'world') {
      mesh.visible = true;
      // leżąca broń kładzie się płasko
      if (w.it && w.it.rest && !w.flat) { const f = V().set(0, 0, -1).applyQuaternion(mesh.quaternion); mesh.rotation.set(0, Math.atan2(-f.x, -f.z), Math.PI / 2); mesh.position.y = map.heightAt(mesh.position.x, mesh.position.z) + 0.03; w.flat = true; }
      continue;
    }
    mesh.visible = xr && w.where !== 'none';
    if (!xr) continue;
    if (w.where === 'hand') {
      const h = w.hand, o = other(h);
      if (TWO_HAND[w.type] && o.support) {
        _m.lookAt(h.pos, o.pos, V().set(0, 1, 0).applyQuaternion(h.q));
        mesh.quaternion.setFromRotationMatrix(_m);
        // broń obrócona tak, by łoże leżało w drugiej dłoni
        const foreDir = w.G.fore.clone().normalize(); _q.setFromUnitVectors(V().set(0, 0, -1), foreDir); mesh.quaternion.multiply(_q.invert());
      } else mesh.quaternion.copy(h.q);
      mesh.position.copy(h.pos);
      if (w.kick) { mesh.position.add(V().set(0, 0, w.kick).applyQuaternion(mesh.quaternion)); mesh.quaternion.multiply(_q.setFromAxisAngle(V().set(1, 0, 0), w.kick * 0.9)); }
    } else if (w.where === 'slot') {
      mesh.position.copy(slotPos(w.slot));
      if (w.slot === 'back') mesh.quaternion.copy(bodyQ).multiply(_q.setFromEuler(new THREE.Euler(-1.2, 0, 0.5)));
      else mesh.quaternion.copy(bodyQ).multiply(_q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));
    }
    mesh.updateMatrixWorld(true);
    if (mesh.userData.counter && w.G) mesh.userData.counter.userData.draw(w.mag ? w.mag.rounds : null, w.G.mag);
  }
  // przedmioty w dłoni, wkładanie magazynka
  for (const h of hands) {
    if (h.held?.kind !== 'item') continue;
    const it = h.held.item;
    if (!items.list.includes(it)) { h.held = null; continue; }
    heldMeshPose(h, it.mesh, it.kind);
    it.drop = () => { h.held = null; };
    if (it.kind === 'mag') {
      const o = other(h), ow = heldWeapon(o);
      if (ow && ow.G && ow.G.ammo === it.type && !ow.mag && wellWorld(ow).distanceTo(it.mesh.position) < 0.12) { insert(ow, it); h.held = null; pulse(h, 0.6, 50); pulse(o, 0.6, 50); }
    }
  }
  // podświetlenie slotu, który złapie wolna dłoń (+ lekkie drgnięcie przy wejściu)
  for (const h of hands) {
    const m = zoneMarks[h.i];
    const z = xr && P.alive && !h.held && !h.mg && !h.support && h.source ? slotAt(h) : null;
    if (z !== h.zone) { h.zone = z; if (z) pulse(h, 0.12, 15); }
    m.visible = !!z;
    if (z) { slotPos(z, m.position); m.scale.setScalar(SLOT_R[z] * 0.45); m.material.color.setHex(SLOT_COL[z]); }
  }
  // kieszenie
  for (const [type, g] of Object.entries(pouches)) {
    g.visible = xr; if (!xr) continue;
    g.position.copy(slotPos('pouch-' + type)); g.quaternion.copy(bodyQ);
    const n = type === 'grenade' ? P.pouch.grenade : P.pouch[type].length;
    g.userData.tops.forEach((m, i) => { m.visible = i < n; if (type === 'primary' && i < n) m.material.color.setHex(AMMO_COL[P.pouch.primary[i].type]); });
  }
  // strzelanie z karabinu (ogień ciągły) i nóż
  for (const h of hands) {
    const w = heldWeapon(h);
    if (w && w.G?.auto && h.trigger && !h.blockFire && art.aim !== h && w.cd <= 0 && P.alive) fireHeld(w, h);
    if (w && w.type === 'knife' && P.alive) knifeContact(h, dt);
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
      if (k % 2 === 0) troops.tracers.push({ a: mz.clone(), b: end, t: 0, T: mz.distanceTo(end) / (TRACER_V * 1.2), side: 0, player: true, len: 6 });
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
  const xr = renderer.xr.isPresenting;
  const sub = ph === 'idle' ? 'Naciśnij A (Enter), by zacząć' : ph === 'prep' || ph === 'between' ? (state.auto ? `Następna fala za ${Math.ceil(state.timer)} s` : xr ? 'Wezwij falę: menu (Y/B)' : 'Wezwij falę: N') : ph === 'wave' ? `Wrogów: ${enemies}` : 'Poległeś — A / Enter: od nowa';
  const artReady = art.cd <= 0, pw = primaryW();
  const artTxt = art.aim ? 'ARTYLERIA: wskaż cel, spust = ogień' : art.shells.length ? 'Artyleria: salwa w drodze…' : artReady ? (xr ? 'Artyleria gotowa — wciśnij gałkę' : 'Artyleria gotowa — T') : `Artyleria: ${Math.ceil(art.cd)} s`;
  const s = {
    title: state.wave ? `FALA ${state.wave}` : 'OKOPY', kills: P.kills, hp: Math.round(P.hp),
    pn: pw ? WNAME[pw.type] : 'Broń główna', r: pw?.mag ? pw.mag.rounds : '—', rp: pw ? P.pouch.primary.filter((m) => m.type === pw.G.ammo).length : P.pouch.primary.length,
    p: P.slots.hip?.mag ? P.slots.hip.mag.rounds : hands.map(heldWeapon).find((x) => x?.type === 'pistol')?.mag?.rounds ?? '—', pp: P.pouch.pistol.length, g: P.pouch.grenade,
    allies: troops.alive(0).length, ar: ars.rifle, as: ars.sniper, agl: ars.gl, ap: ars.pistol, ag: ars.grenade, sub: state.paused ? 'PAUZA' : sub,
    art: artTxt, artReady,
    hint: xr ? 'Y/B: menu · A/X: wyrzuć mag. · spust pustą ręką: przyciągnij' : '1–4 broń · R · G granat · E/F weź · T artyl. · N fala',
  };
  wrist.draw(s);
  banner.mesh.visible = renderer.xr.isPresenting;
  banner.draw(state.msgT > 0 ? state.msg : '', state.msgCol);
  const dm = document.getElementById('msg'); dm.textContent = state.msgT > 0 ? state.msg : ''; dm.style.color = state.msgCol;
  menu.draw({ phase: state.phase, paused: state.paused, auto: state.auto, loadout: WNAME[state.loadout], art: art.cd > 0 ? `Artyleria: ${Math.ceil(art.cd)} s` : '💥 Artyleria — wskaż cel' });
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
  if (P.climb) updateClimb(dt);
  else if (P.surface) {
    // z przedpola można wpaść do okopu (poza dachem ziemianki)
    if (map.walkable(hh.x, hh.z) && !map.covered(hh.x, hh.z)) { P.surface = false; audio.play('dirt', hh.clone().setY(map.floorAt(hh.x, hh.z)), 0.8, 0.8, 2); for (const h of hands) pulse(h, 0.6, 60); }
    else rig.position.y += (map.surfaceAt(hh.x, hh.z) - FLOOR + base - rig.position.y) * Math.min(1, dt * 8);
  }
  if (!P.climb && !P.surface && map.walkable(hh.x, hh.z)) rig.position.y += (map.floorAt(hh.x, hh.z) - FLOOR + base - rig.position.y) * Math.min(1, dt * 8);
  rig.updateMatrixWorld(true);
  updatePlayerProxy();
  const running = !state.paused && (state.phase === 'prep' || state.phase === 'wave' || state.phase === 'between');
  enemyShotSnd = Math.max(0, enemyShotSnd - dt * 14);
  if (!state.paused) {
    updateGame(dt);
    troops.update(dt, P, running);
    updatePulls(dt);
    items.update(dt);
    smoke.update(dt);
  }
  updateHands(dt);
  updateGuns(dt);
  viewModel.visible = !xr;
  updateRedDot(xr ? hands.map(heldWeapon).find((w) => w?.type === 'rifle')?.mesh : vm.rifle.visible && ads ? vm.rifle : null, !xr);
  for (const w of weapons) { w.cd = Math.max(0, w.cd - dt); w.kick = Math.max(0, w.kick - dt * 0.35); }
  if (!state.paused) updateShells(dt);
  updateScope();
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
  updateArtillery(dt);
  updateHud();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);
function simStep(dt) { updatePlayerProxy(); if (!state.paused) { updateGame(dt); troops.update(dt, P, !state.paused && ['prep', 'wave', 'between'].includes(state.phase)); updatePulls(dt); items.update(dt); smoke.update(dt); updateShells(dt); } updateArtillery(dt); fx.update(dt); }
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

window.__trench = { startClimb, deskClimb, tryMove, smoke, art, artToggle, artFire, callWave, pullToHand, deskPull, redDot, vm, set ads(v) { ads = v; }, simStep, map, troops, items, guns, P, state, startGame, nextWave, camera, rig, scene, THREE, hands, fireWeapon, fireHeld, shootRay, weapons, makeWeapon, toHand, toWorld, toSlot, grab, release, triggerDown, shells, updateHands, updateScope, ars, look, keys, updateDesktop, menuAction, get desk() { return desk; }, set desk(v) { desk = v; }, deskReload, deskInteract, deskThrow, set mounted(v) { mounted = v; }, get mounted() { return mounted; } };
void MAG;
