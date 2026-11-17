import * as THREE from 'three';

// Programy, w których piny manipulują przedmiotami. Każdy co klatkę dopisuje wysokości do field.target.
export const PROGRAMS = {
  support: { name: 'Podpieraj', hint: 'piny podjeżdżają pod spód przedmiotu' },
  carry: { name: 'Przenieś', hint: 'wskaż przedmiot, potem cel' },
  spin: { name: 'Obracaj', hint: 'obrotowe ramiona z pinów' },
  tip: { name: 'Przewróć', hint: 'przewraca na inną ścianę' },
  toss: { name: 'Podrzuć', hint: 'szybkie wybicie pinami' },
  copy: { name: 'Kopiuj kształt', hint: 'wskaż przedmiot, potem miejsce kopii' },
};

const _v = new THREE.Vector3();

function footprintRange(f, b, pad = 0) {
  const r = b.radius + pad;
  return f.range(b.pos.x - r, b.pos.x + r, b.pos.z - r, b.pos.z + r);
}

// wysokość pinów pod przedmiotem tak, by go dotykały od spodu
function supportUnder(f, b, T, lift = 0) {
  const [c0, c1, r0, r1] = footprintRange(f, b);
  let maxGap = 0;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const span = b.verticalSpan(f.cx(c), f.cz(r));
    if (!span) continue;
    const i = r * f.cols + c, y = Math.min(f.maxH, span[0] - 0.0008 + lift);
    if (y > T[i]) T[i] = y;
    maxGap = Math.max(maxGap, y - f.h[i]);
  }
  return maxGap;
}

export function runPrograms(f, bodies, dt, ctx) {
  const T = f.target;
  for (const b of bodies) {
    const p = b.program;
    if (!p) continue;
    p.t += dt;
    switch (p.type) {
      case 'support': {
        const gap = supportUnder(f, b, T);
        // przedmiot "zawieszony" czeka, aż piny go dosięgną
        if (b.hover && gap < 0.002) { b.hover = false; b.kinematic = false; b.vel.set(0, 0, 0); b.ang.set(0, 0, 0); }
        break;
      }
      case 'carry': {
        if (!p.target) { supportUnder(f, b, T); break; }
        const dx = p.target.x - b.pos.x, dz = p.target.z - b.pos.z, dist = Math.hypot(dx, dz);
        if (dist < 0.015) { b.program = null; b.vel.multiplyScalar(0.3); ctx.msg(`${b.name}: na miejscu`); break; }
        const ux = dx / dist, uz = dz / dist, px = -uz, pz = ux;
        // zasięg przedmiotu w kierunku ruchu
        let ext = 0, wid = 0;
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          if (b.type === 'sphere') { ext = wid = b.dims[0]; break; }
          const d = b.type === 'box' ? b.dims : [b.dims[0], b.dims[1], b.dims[0]];
          for (const sy of [1, -1]) {
            _v.set(sx * d[0], sy * d[1], sz * d[2]).applyQuaternion(b.quat);
            ext = Math.max(ext, -(_v.x * ux + _v.z * uz)); wid = Math.max(wid, Math.abs(_v.x * px + _v.z * pz));
          }
        }
        // przy celu ściana niższa i wolniejsza, żeby nie przestrzelić
        const near = Math.min(1, dist / 0.08);
        const wallH = Math.min(f.maxH, Math.max(0.008, (b.pos.y - b.radius * 0.2) * (0.4 + 0.6 * near)));
        const R = b.radius + 0.03;
        const [c0, c1, r0, r1] = f.range(b.pos.x - R, b.pos.x + R, b.pos.z - R, b.pos.z + R);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const ox = f.cx(c) - b.pos.x, oz = f.cz(r) - b.pos.z;
          const along = ox * ux + oz * uz, perp = ox * px + oz * pz;
          const i = r * f.cols + c;
          // ściana z pinów pchająca od tyłu
          if (along < -ext + 0.004 && along > -ext - 0.02 && Math.abs(perp) < wid * 0.9) { T[i] = Math.max(T[i], wallH); f.boost[i] = 1 + 1.5 * near; }
          // hamulec: niski próg przed przedmiotem, gdy jest blisko celu
          else if (near < 0.6 && along > ext + 0.004 && along < ext + 0.016 && Math.abs(perp) < wid * 0.9) T[i] = Math.max(T[i], 0.008);
          // płasko pod spodem i przed przedmiotem
          else if (along > -ext + 0.004 && Math.abs(perp) < wid + 0.01) T[i] = Math.min(T[i], 0.001);
        }
        break;
      }
      case 'spin': {
        const rin = b.type === 'sphere' ? b.dims[0] * 0.6 : Math.min(b.dims[0], b.type === 'box' ? b.dims[2] : b.dims[0]) * 1.02;
        const rout = b.radius * 1.15 + 0.015;
        const armH = Math.min(f.maxH, Math.max(0.015, b.pos.y));
        const ang = p.t * 1.6;
        const [c0, c1, r0, r1] = f.range(p.cx - rout, p.cx + rout, p.cz - rout, p.cz + rout);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const ox = f.cx(c) - p.cx, oz = f.cz(r) - p.cz, d = Math.hypot(ox, oz);
          if (d < rin || d > rout) continue;
          const th = Math.atan2(oz, ox);
          const i = r * f.cols + c;
          let on = false;
          for (let k = 0; k < 3; k++) {
            let dd = th - ang - (k * Math.PI * 2) / 3;
            dd = Math.atan2(Math.sin(dd), Math.cos(dd));
            if (Math.abs(dd * d) < 0.006) on = true;
          }
          if (on) { T[i] = Math.max(T[i], armH); f.boost[i] = 3; } else T[i] = Math.min(T[i], 0.001);
        }
        break;
      }
      case 'tip': {
        // faza 0: unieś połowę podstawy (bliżej użytkownika), faza 1: przytrzymaj, faza 2: opuść
        const ux = p.dir.x, uz = p.dir.z;
        const [c0, c1, r0, r1] = footprintRange(f, b, 0.08);
        const lift = p.t < 0.9 ? Math.min(f.maxH, b.radius * 1.6) : 0;
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const x = f.cx(c), z = f.cz(r), i = r * f.cols + c;
          const along = (x - p.cx) * ux + (z - p.cz) * uz;
          const span = b.verticalSpan(x, z);
          if (p.t < 0.9 && span && along < 0) { T[i] = Math.max(T[i], Math.min(lift, span[1])); f.boost[i] = 3; }
          // ogranicznik: ściana daleko za krawędzią przewrotu, żeby przedmiot się nie toczył
          const stop = p.reach + 0.012;
          if (along > stop && along < stop + 0.015 && Math.abs((x - p.cx) * -uz + (z - p.cz) * ux) < b.radius) T[i] = Math.max(T[i], Math.min(f.maxH, 0.02));
        }
        if (p.t > 2.2) b.program = null;
        break;
      }
      case 'toss': {
        const [c0, c1, r0, r1] = footprintRange(f, b);
        if (p.t < 0.12) {
          for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
            const span = b.verticalSpan(f.cx(c), f.cz(r));
            if (!span) continue;
            const i = r * f.cols + c;
            T[i] = Math.max(T[i], Math.min(f.maxH, span[0] + 0.035)); f.boost[i] = 4;
          }
        } else if (p.t > 1.5) b.program = null;
        break;
      }
      case 'copy': {
        if (!p.target) break;
        const offx = p.target.x - b.pos.x, offz = p.target.z - b.pos.z;
        const R = b.radius;
        const [c0, c1, r0, r1] = f.range(p.target.x - R, p.target.x + R, p.target.z - R, p.target.z + R);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const span = b.verticalSpan(f.cx(c) - offx, f.cz(r) - offz);
          if (!span) continue;
          const i = r * f.cols + c;
          T[i] = Math.max(T[i], Math.min(f.maxH, span[1] - Math.max(0, b.pos.y - b.radius) + 0.001));
        }
        break;
      }
      default: break;
    }
  }
}

export function startProgram(type, b, ctx, extra = {}) {
  const p = { type, t: 0, cx: b.pos.x, cz: b.pos.z, ...extra };
  if (type === 'tip') {
    const d = extra.dir || new THREE.Vector3(0, 0, -1);
    p.dir = new THREE.Vector3(d.x, 0, d.z).normalize();
    // zasięg przedmiotu w kierunku przewrotu
    let reach = 0;
    if (b.type === 'sphere') reach = b.dims[0];
    else {
      const d3 = b.type === 'box' ? b.dims : [b.dims[0], b.dims[1], b.dims[0]];
      for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
        _v.set(sx * d3[0], sy * d3[1], sz * d3[2]).applyQuaternion(b.quat);
        reach = Math.max(reach, _v.x * p.dir.x + _v.z * p.dir.z);
      }
    }
    p.reach = reach + b.radius * 1.2;
  }
  b.program = p;
  b.outline.material.opacity = 0.9;
  ctx.msg(`${b.name}: ${PROGRAMS[type].name}`);
  return p;
}
