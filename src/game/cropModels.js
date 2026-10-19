import * as THREE from 'three';
import { GeoBuilder } from '../util/geo.js';
import { mulberry32 } from '../util/noise.js';
import { smoothstep, clamp } from '../util/math.js';

const C = (h) => new THREE.Color(h);

// parametric leaf: base at origin, extends along +z
export function leafGeo(len, wid, shape = 'ovate', droop = 0.3, cup = 0.15, segs = 6) {
  const sf = {
    ovate: t => Math.pow(Math.sin(Math.PI * t), 0.8),
    spoon: t => Math.sin(Math.PI * Math.pow(t, 0.62)),
    lance: t => Math.pow(1 - t, 0.7) * smoothstep(0, 0.12, t),
    heart: t => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.5),
    round: t => Math.sqrt(Math.max(0, Math.sin(Math.PI * t))),
  }[shape];
  const pos = [], idx = [];
  const cols = 5;
  for (let r = 0; r <= segs; r++) {
    const t = r / segs, w = wid * sf(t) / 2;
    for (let c = 0; c < cols; c++) {
      const u = -1 + (2 * c) / (cols - 1);
      const x = u * w, z = t * len;
      const y = -droop * t * t * len + cup * Math.abs(u) * w;
      pos.push(x, y, z);
    }
  }
  for (let r = 0; r < segs; r++) for (let c = 0; c < cols - 1; c++) {
    const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  // bias normals upward for soft cartoon lighting
  const N = g.attributes.normal.array;
  for (let i = 0; i < N.length; i += 3) { N[i] *= 0.6; N[i + 2] *= 0.6; N[i + 1] = Math.abs(N[i + 1]) + 0.4; const l = Math.hypot(N[i], N[i + 1], N[i + 2]); N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
  return g;
}

function addLeaf(B, g, pos, yaw, pitch, c0, c1, len, roll = 0) {
  const a = C(c0), b = C(c1);
  B.add(g, { pos, rot: [-pitch, yaw, roll], color: a, colorFn: (c, x, y, z) => { const d = Math.hypot(x - pos[0], y - pos[1], z - pos[2]) / len; c.copy(a).lerp(b, clamp(d, 0, 1)); } });
}

function sprout(B, rnd, s = 1) {
  const lg = leafGeo(0.07 * s, 0.05 * s, 'round', 0.1, 0.1, 4);
  B.add(new THREE.CylinderGeometry(0.005, 0.007, 0.05 * s, 4), { pos: [0, 0.025 * s, 0], color: '#7fb04a' });
  const a = rnd() * 6;
  addLeaf(B, lg, [0, 0.05 * s, 0], a, 0.35, '#5f9e38', '#9fd264', 0.07 * s);
  addLeaf(B, lg, [0, 0.05 * s, 0], a + Math.PI, 0.35, '#5f9e38', '#9fd264', 0.07 * s);
}

const builders = {
  bokchoy(stage, rnd) {
    const B = new GeoBuilder();
    if (stage === 0) { sprout(B, rnd); return B; }
    const n = [0, 4, 6, 8, 11][stage], L = [0, 0.13, 0.19, 0.25, 0.29][stage];
    for (let i = 0; i < n; i++) {
      const yaw = i * 2.4 + rnd() * 0.3, inner = i / n;
      const pitch = 0.85 + inner * 0.45 + (stage === 4 ? 0.15 : 0);
      const len = L * (0.8 + 0.35 * (1 - inner));
      const stem = new THREE.CylinderGeometry(0.012, 0.02, len * 0.45, 5);
      stem.translate(0, len * 0.225, 0);
      B.add(stem, { pos: [0, 0.01, 0], rot: [Math.PI / 2 - pitch, yaw, 0], color: '#eef4dc' });
      const lg = leafGeo(len * 0.8, len * 0.62, 'spoon', 0.25, 0.25, 6);
      const ox = Math.sin(yaw) * Math.cos(pitch) * len * 0.35, oz = Math.cos(yaw) * Math.cos(pitch) * len * 0.35, oy = Math.sin(pitch) * len * 0.38;
      addLeaf(B, lg, [ox, oy + 0.01, oz], yaw, pitch - 0.1, '#4a9437', '#86c95d', len * 0.8);
    }
    return B;
  },
  carrot(stage, rnd) {
    const B = new GeoBuilder();
    if (stage === 0) { sprout(B, rnd, 0.9); return B; }
    const n = [0, 3, 5, 7, 8][stage], H = [0, 0.13, 0.2, 0.28, 0.32][stage];
    const lf = leafGeo(0.045, 0.03, 'ovate', 0.1, 0.1, 3);
    for (let i = 0; i < n; i++) {
      const yaw = i * 2.3 + rnd() * 0.4, tilt = 0.25 + rnd() * 0.3;
      const h = H * (0.8 + rnd() * 0.3);
      const stem = new THREE.CylinderGeometry(0.004, 0.007, h, 3); stem.translate(0, h / 2, 0);
      B.add(stem, { rot: [tilt, yaw, 0], color: '#5f9a3a' });
      const dx = Math.sin(yaw) * Math.sin(tilt), dy = Math.cos(tilt), dz = Math.cos(yaw) * Math.sin(tilt);
      for (let k = 2; k <= 6; k++) {
        const t = k / 6, p = [dx * h * t, dy * h * t, dz * h * t];
        for (const sd of [-1, 1]) addLeaf(B, lf, p, yaw + sd * 1.2, 0.4 + t * 0.3, '#4f9136', '#8ccf5c', 0.045);
      }
    }
    if (stage >= 3) {
      const r = stage === 4 ? 0.05 : 0.032;
      B.add(new THREE.ConeGeometry(r, r * 3, 9), { pos: [0, -r * 0.6, 0], rot: [Math.PI, 0, 0], color: '#f08a24', colorFn: (c, x, y) => c.multiplyScalar(0.85 + 0.25 * Math.sin(y * 160)) });
      B.add(new THREE.SphereGeometry(r, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), { pos: [0, 0.0, 0], scale: [1, 0.4, 1], color: '#f39a35' });
    }
    return B;
  },
  strawberry(stage, rnd) {
    const B = new GeoBuilder();
    if (stage === 0) { sprout(B, rnd, 0.8); return B; }
    const n = [0, 3, 5, 6, 7][stage], H = [0, 0.09, 0.13, 0.17, 0.19][stage];
    const lf = leafGeo(0.07, 0.06, 'round', 0.08, 0.12, 4);
    for (let i = 0; i < n; i++) {
      const yaw = i * 2.5 + rnd() * 0.4, tilt = 0.45 + rnd() * 0.35, h = H * (0.8 + rnd() * 0.3);
      const stem = new THREE.CylinderGeometry(0.004, 0.006, h, 3); stem.translate(0, h / 2, 0);
      B.add(stem, { rot: [tilt, yaw, 0], color: '#6a9c3c' });
      const p = [Math.sin(yaw) * Math.sin(tilt) * h, Math.cos(tilt) * h, Math.cos(yaw) * Math.sin(tilt) * h];
      for (const d of [-0.9, 0, 0.9]) addLeaf(B, lf, p, yaw + d, 0.15, '#3f8530', '#6fb247', 0.07);
    }
    if (stage >= 3) {
      for (let i = 0; i < (stage === 3 ? 4 : 3); i++) {
        const a = rnd() * 6.28, d = 0.08 + rnd() * 0.06, p = [Math.cos(a) * d, 0.1 + rnd() * 0.04, Math.sin(a) * d];
        for (let k = 0; k < 5; k++) { const pa = (k / 5) * 6.28; B.add(new THREE.SphereGeometry(0.014, 5, 3), { pos: [p[0] + Math.cos(pa) * 0.015, p[1], p[2] + Math.sin(pa) * 0.015], scale: [1, 0.35, 1], color: '#ffffff' }); }
        B.add(new THREE.SphereGeometry(0.008, 5, 3), { pos: [p[0], p[1] + 0.004, p[2]], color: '#f2c13d' });
      }
    }
    if (stage === 4) {
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + rnd() * 0.5, d = 0.1 + rnd() * 0.06, p = [Math.cos(a) * d, 0.035 + rnd() * 0.03, Math.sin(a) * d];
        B.add(new THREE.SphereGeometry(0.03, 8, 6), { pos: p, scale: [1, 1.25, 1], warp: (x, y, z) => { const t = clamp((p[1] - y) / 0.04 + 0.5, 0, 1); const k = 1 - t * 0.45; return [p[0] + (x - p[0]) * k, y, p[2] + (z - p[2]) * k]; }, color: '#e3302d', colorFn: (c, x, y, z) => { if (Math.sin(x * 420) * Math.sin(y * 380) * Math.sin(z * 400) > 0.6) c.set('#f6d04d'); } });
        B.add(new THREE.ConeGeometry(0.02, 0.012, 5), { pos: [p[0], p[1] + 0.036, p[2]], rot: [Math.PI, 0, 0], color: '#4c8f30' });
      }
    }
    return B;
  },
  tomato(stage, rnd) {
    const B = new GeoBuilder();
    if (stage === 0) { sprout(B, rnd, 1.1); return B; }
    const H = [0, 0.22, 0.48, 0.72, 0.8][stage];
    if (stage >= 2) {
      B.add(new THREE.CylinderGeometry(0.012, 0.014, H + 0.25, 5), { pos: [0.06, (H + 0.25) / 2 - 0.04, 0], color: '#b08a5a' });
      B.add(new THREE.TorusGeometry(0.04, 0.006, 3, 8), { pos: [0.04, H * 0.55, 0], rot: [Math.PI / 2, 0, 0], color: '#d8c79a' });
    }
    B.add(new THREE.CylinderGeometry(0.008, 0.014, H, 5), { pos: [0, H / 2, 0], color: '#5b8f35' });
    const lf = leafGeo(0.11, 0.09, 'ovate', 0.3, 0.15, 4);
    const nl = [0, 4, 7, 10, 10][stage];
    for (let i = 0; i < nl; i++) {
      const y = H * (0.2 + 0.78 * i / nl), yaw = i * 2.4;
      addLeaf(B, lf, [0, y, 0], yaw, 0.25 + rnd() * 0.3, '#3f7f2f', '#6aae45', 0.11);
      addLeaf(B, lf, [Math.sin(yaw) * 0.05, y + 0.02, Math.cos(yaw) * 0.05], yaw + 0.6, 0.5, '#3f7f2f', '#6aae45', 0.11);
    }
    if (stage === 3) for (let i = 0; i < 4; i++) {
      const a = rnd() * 6.28, y = H * (0.45 + rnd() * 0.45);
      B.add(new THREE.SphereGeometry(0.04, 8, 6), { pos: [Math.cos(a) * 0.09, y, Math.sin(a) * 0.09], color: '#8fbf4a' });
      B.add(new THREE.ConeGeometry(0.02, 0.03, 5), { pos: [Math.cos(a + 1) * 0.1, y + 0.05, Math.sin(a + 1) * 0.1], rot: [Math.PI, 0, 0], color: '#f5d23a' });
    }
    if (stage === 4) for (let i = 0; i < 6; i++) {
      const a = i * 1.1 + rnd() * 0.4, y = H * (0.35 + rnd() * 0.5), d = 0.08 + rnd() * 0.04;
      const p = [Math.cos(a) * d, y, Math.sin(a) * d];
      B.add(new THREE.SphereGeometry(0.052, 10, 8), { pos: p, scale: [1, 0.85, 1], color: i === 5 ? '#f08a3a' : '#e2402f', colorFn: (c, x, yy, z, nx, ny) => c.multiplyScalar(0.8 + 0.35 * (ny * 0.5 + 0.5)) });
      B.add(new THREE.ConeGeometry(0.026, 0.012, 5), { pos: [p[0], p[1] + 0.045, p[2]], rot: [Math.PI, 0, 0], color: '#3f7f2f' });
    }
    return B;
  },
  corn(stage, rnd) {
    const B = new GeoBuilder();
    if (stage === 0) { sprout(B, rnd, 1.1); return B; }
    const H = [0, 0.3, 0.75, 1.5, 1.7][stage];
    B.add(new THREE.CylinderGeometry(0.014, 0.026, H, 6), { pos: [0, H / 2, 0], color: '#79a845' });
    const nl = [0, 3, 6, 8, 9][stage];
    for (let i = 0; i < nl; i++) {
      const y = H * (0.08 + 0.8 * i / nl), yaw = i * 2.9 + rnd() * 0.3, len = Math.min(0.75, H * 0.62) * (1 - i / nl * 0.35);
      addLeaf(B, leafGeo(len, 0.085, 'lance', 0.55, 0.2, 7), [0, y, 0], yaw, 0.95, '#4e8a33', '#9cc75a', len);
    }
    if (stage >= 3) {
      for (let k = 0; k < 7; k++) {
        const yaw = k * 0.9, t = 0.25;
        const g = new THREE.CylinderGeometry(0.004, 0.006, t, 3); g.translate(0, t / 2, 0);
        B.add(g, { pos: [0, H - 0.02, 0], rot: [0.5, yaw, 0], color: '#d9c46a' });
      }
    }
    if (stage === 4) {
      for (const [y, yaw] of [[H * 0.48, 0.5], [H * 0.62, 3.4]]) {
        const p = [Math.sin(yaw) * 0.05, y, Math.cos(yaw) * 0.05];
        B.add(new THREE.CylinderGeometry(0.032, 0.04, 0.2, 9), { pos: [p[0] + Math.sin(yaw) * 0.03, y + 0.07, p[2] + Math.cos(yaw) * 0.03], rot: [0.45, yaw, 0], color: '#f2cf4a', colorFn: (c, x, yy) => c.multiplyScalar(0.85 + 0.2 * Math.abs(Math.sin(yy * 260))) });
        addLeaf(B, leafGeo(0.22, 0.07, 'lance', 0.05, 0.4, 5), p, yaw, 1.05, '#86b552', '#c3d98a', 0.22);
        addLeaf(B, leafGeo(0.2, 0.06, 'lance', 0.02, 0.4, 5), p, yaw + 0.5, 1.15, '#86b552', '#c3d98a', 0.2);
      }
    }
    return B;
  },
  pumpkin(stage, rnd) {
    const B = new GeoBuilder();
    if (stage === 0) { sprout(B, rnd, 1.2); return B; }
    const nl = [0, 3, 5, 7, 7][stage], spread = [0, 0.12, 0.25, 0.33, 0.36][stage];
    const lf = leafGeo(0.17, 0.2, 'heart', 0.15, 0.15, 5);
    for (let i = 0; i < nl; i++) {
      const yaw = i * 2.2 + rnd() * 0.4, d = spread * (0.4 + rnd() * 0.6);
      const p = [Math.sin(yaw) * d, 0.02, Math.cos(yaw) * d];
      const st = new THREE.CylinderGeometry(0.006, 0.008, 0.16, 4); st.translate(0, 0.08, 0);
      B.add(st, { pos: p, rot: [0.3, yaw, 0], color: '#6a9c3c' });
      addLeaf(B, lf, [p[0] + Math.sin(yaw) * 0.05, 0.14, p[2] + Math.cos(yaw) * 0.05], yaw, 0.15, '#3f7d2e', '#73b04a', 0.17);
    }
    // vine
    if (stage >= 1) for (let i = 0; i < 3; i++) { const yaw = i * 2.1; B.add(new THREE.CylinderGeometry(0.008, 0.008, spread * 1.8, 4), { pos: [Math.sin(yaw) * spread * 0.9, 0.015, Math.cos(yaw) * spread * 0.9], rot: [Math.PI / 2, yaw, 0], color: '#5f9036' }); }
    if (stage === 2) B.add(new THREE.ConeGeometry(0.04, 0.07, 6, 1, true), { pos: [0.1, 0.1, 0.05], rot: [Math.PI, 0, 0], color: '#f5c431' });
    if (stage >= 3) {
      const r = stage === 4 ? 0.21 : 0.1, col = stage === 4 ? '#f08c2a' : '#7fae4a';
      const g = new THREE.SphereGeometry(r, 18, 12);
      B.add(g, { pos: [0.04, r * 0.7, -0.02], scale: [1, 0.74, 1], warp: (x, y, z) => { const dx = x - 0.04, dz = z + 0.02; const a = Math.atan2(dz, dx); const k = 1 + 0.07 * Math.cos(a * 10); return [0.04 + dx * k, y, -0.02 + dz * k]; }, color: col, colorFn: (c, x, y, z, nx, ny) => { const a = Math.atan2(z + 0.02, x - 0.04); c.multiplyScalar((0.8 + 0.25 * (Math.cos(a * 10) * 0.5 + 0.5)) * (0.8 + 0.25 * (ny * 0.5 + 0.5))); } });
      B.add(new THREE.CylinderGeometry(0.018, 0.026, 0.08, 6), { pos: [0.04, r * 1.42, -0.02], rot: [0.2, 0, 0.2], color: '#6b5a2e' });
    }
    return B;
  },
};

export function buildCropGeos() {
  const out = {};
  for (const k of Object.keys(builders)) {
    out[k] = [];
    for (let s = 0; s < 5; s++) {
      const B = builders[k](s, mulberry32(k.length * 97 + s * 13));
      out[k].push(B.build());
    }
  }
  return out;
}
