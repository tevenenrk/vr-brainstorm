import * as THREE from 'three';

// Po cięciu: ciemność → małe światło w oddali → okazuje się, że stoisz w tunelu →
// światło zbliża się coraz szybciej → oślepiający blask (za nim miejsce sądu).
const NOISE = `
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { s += a * vnoise(p); p *= 2.07; a *= 0.5; } return s; }`;
const FAR = 48;
export const T_LIGHT = 3.5;     // s od cięcia do pojawienia się światła
const GROW = 6.5, APPROACH = 12;

function glowTex(stops) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) g.addColorStop(o, col);
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

export class Afterlife {
  constructor(scene, camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.uni = { Lz: { value: -FAR }, Li: { value: 0 }, time: { value: 0 } };
    const L = 90;
    const geo = new THREE.CylinderGeometry(2.3, 2.3, L, 48, 60, true).rotateX(-Math.PI / 2).translate(0, 0, -L / 2 + 5);
    // nieregularne ściany
    const a = geo.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), y = a.getY(i), z = a.getZ(i), ang = Math.atan2(y, x);
      const r = 1 + 0.12 * Math.sin(ang * 3 + z * 0.4) + 0.08 * Math.sin(ang * 7 - z * 0.9) + 0.06 * Math.sin(z * 1.7);
      a.setXYZ(i, x * r, y * r, z);
    }
    this.tunnel = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uni, side: THREE.BackSide, depthWrite: true,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float Lz, Li, time; varying vec3 vP; ${NOISE}
        void main(){
          float rock = fbm(vec2(vP.x * 1.3 + vP.z * 0.35, vP.y * 1.3 - vP.z * 0.22));
          float ribs = 0.55 + 0.45 * sin(vP.z * 1.9 + rock * 4.0);
          float d = distance(vP, vec3(0.0, 0.0, Lz));
          float light = Li * 7.0 / (1.0 + d * d * 0.06) + Li * 1.3 / (1.0 + d * 0.04);
          vec3 base = mix(vec3(0.30, 0.30, 0.36), vec3(0.62, 0.56, 0.50), rock) * (0.5 + 0.5 * ribs);
          vec3 c = base * light * vec3(1.0, 0.96, 0.88);
          c += vec3(0.85, 0.9, 1.0) * Li * Li * 0.12 * (1.0 - smoothstep(0.0, 30.0, abs(vP.z - Lz)));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    this.tunnel.frustumCulled = false;
    const back = new THREE.Mesh(new THREE.CircleGeometry(3, 24).translate(0, 0, 5), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }));
    this.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,252,240,0.95)'], [0.5, 'rgba(255,240,210,0.35)'], [1, 'rgba(255,230,200,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex([[0, 'rgba(220,230,255,0.6)'], [0.4, 'rgba(200,215,255,0.15)'], [1, 'rgba(200,215,255,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.core.renderOrder = this.halo.renderOrder = 5;
    this.group.add(this.tunnel, back, this.halo, this.core);
    // biały blask i napis
    this.white = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.white.renderOrder = 10010; this.white.frustumCulled = false; this.white.visible = false;
    camera.add(this.white);
    this.active = false; this.t = 0; this.glareT = -1;
  }

  start(head, yaw) {
    this.active = true; this.t = 0; this.glareT = -1; this.done = false;
    this.yaw = yaw;
    this.group.visible = true;
    this.group.position.copy(head);
    this.group.rotation.set(0, yaw, 0);
    this.uni.Li.value = 0; this.uni.Lz.value = -FAR;
  }
  stop() {
    this.active = false;
    this.group.visible = false; this.white.visible = false;
  }
  // zwraca { light 0..1, glare 0..1, done }
  update(dt, head) {
    if (!this.active) return null;
    this.t += dt;
    const t = this.t;
    this.uni.time.value = t;
    this.group.position.copy(head);
    let Li, Lz;
    if (t < GROW) { const s = t / GROW; Li = 0.02 + 0.33 * s * s * (3 - 2 * s); Lz = -FAR; }
    else { const s = Math.min(1, (t - GROW) / APPROACH); Lz = -FAR * (1 - s * s * s); Li = 0.35 + 1.6 * s * s; }
    this.uni.Li.value = Li; this.uni.Lz.value = Lz;
    const prox = 1 / Math.max(0.6, -Lz);
    this.core.position.set(0, 0, Lz); this.halo.position.set(0, 0, Lz);
    this.core.scale.setScalar(0.25 + Li * 1.4 + prox * 6);
    this.halo.scale.setScalar(1.5 + Li * 6 + prox * 25);
    this.halo.material.opacity = Math.min(1, Li * 1.5);
    if (Lz > -3.2 && this.glareT < 0) this.glareT = t;
    let glare = 0;
    if (this.glareT >= 0) {
      const g = t - this.glareT;
      glare = Math.min(1, g / 0.7);
      this.white.visible = true; this.white.material.opacity = glare;
      if (g > 1.3) this.done = true;      // za blaskiem czeka miejsce sądu
    }
    return { light: Math.min(1, Li / 2), glare, done: !!this.done, approach: t > GROW ? Math.min(1, (t - GROW) / APPROACH) : 0 };
  }
}
