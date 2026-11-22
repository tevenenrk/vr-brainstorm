import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Rycerz (model Mixamo z animacją biegu) „wypiekany” do statycznych klatek:
// setki żołnierzy rysowane jako InstancedMesh, każdy w klatce zależnej od fazy kroku.
export const RUN_FRAMES = 10;
export const IDLE = RUN_FRAMES;           // indeks klatki spoczynkowej (ręce opuszczone)

function load(url) { return new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej)); }

// kość tak, by kierunek do dziecka wskazywał punkt (w świecie)
function aim(bone, child, target) {
  const a = bone.getWorldPosition(new THREE.Vector3());
  const from = child.getWorldPosition(new THREE.Vector3()).sub(a).normalize(), to = target.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(from, to);
  const wq = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(q);
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq));
  bone.updateMatrixWorld(true);
}

// scale: metry modelu → jednostki mapy; zwraca { frames: [BufferGeometry], hands: [{ r, l }], duration }
export async function bakeKnight(url, scale) {
  const g = await load(url);
  const root = g.scene;
  let mesh = null; const B = {};
  root.traverse((o) => { if (o.isSkinnedMesh) mesh = o; if (o.isBone) B[o.name.replace('mixamorig', '')] = o; });
  const rest = new Map(); root.traverse((o) => { if (o.isBone) rest.set(o, o.quaternion.clone()); });
  const clip = g.animations[0];
  const mixer = new THREE.AnimationMixer(root);
  const act = mixer.clipAction(clip); act.play();
  const base = mesh.geometry, n = base.attributes.position.count, v = new THREE.Vector3();
  const frames = [], hands = [];
  const capture = () => {
    root.updateMatrixWorld(true);
    mesh.skeleton.update();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld).multiplyScalar(scale); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (base.attributes.color) geo.setAttribute('color', base.attributes.color);
    geo.setIndex(base.index);
    geo.computeVertexNormals();
    frames.push(geo);
    hands.push({ r: B.RightHand.getWorldPosition(new THREE.Vector3()).multiplyScalar(scale), l: B.LeftHand.getWorldPosition(new THREE.Vector3()).multiplyScalar(scale) });
  };
  for (let k = 0; k < RUN_FRAMES; k++) { mixer.setTime((k / RUN_FRAMES) * clip.duration); capture(); }
  // spoczynek: poza bazowa (A-pose) z opuszczonymi rękami i lekko zgiętymi łokciami
  act.stop(); mixer.update(0);
  for (const [b, q] of rest) b.quaternion.copy(q);
  root.updateMatrixWorld(true);
  for (const [arm, fore, hand, sx] of [['RightArm', 'RightForeArm', 'RightHand', -1], ['LeftArm', 'LeftForeArm', 'LeftHand', 1]]) {
    const sh = B[arm].getWorldPosition(new THREE.Vector3());
    aim(B[arm], B[fore], sh.clone().add(new THREE.Vector3(sx * 0.1, -1, 0.04)));
    const el = B[fore].getWorldPosition(new THREE.Vector3());
    aim(B[fore], B[hand], el.clone().add(new THREE.Vector3(sx * 0.03, -0.75, 0.55)));
  }
  capture();
  return { frames, hands };
}
