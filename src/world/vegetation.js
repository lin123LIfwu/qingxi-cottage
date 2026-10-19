import * as THREE from 'three';
import { GeoBuilder, blobGeo } from '../util/geo.js';
import { patchVeg } from './wind.js';
import { GrassField } from './grass.js';
import { TreeField } from './trees.js';
import { genLog, genStump, ringTexture } from '../gen/treegen.js';
import { TEX } from '../gen/texgen.js';
import { mulberry32 } from '../util/noise.js';
import { clamp, lerp, smoothstep, distToSegment2 } from '../util/math.js';
import { POND } from '../config.js';

const r6 = (x, z) => Math.pow(x ** 6 + z ** 6, 1 / 6);
const C = (h) => new THREE.Color(h);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const UPV = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- prototypes
function rockGeo(noise, seed, flat) {
  const B = new GeoBuilder(['aWind']);
  const base = C('#8f8b84'), moss = C('#6f8c45'), dark = C('#6c6a66');
  B.add(blobGeo(1, 2, noise, 0.42, seed, flat), {
    pos: [0, flat[1] * 0.45, 0], sphere: { c: [0, 0.2, 0], k: 0.3 },
    colorFn: (c, x, y, z, nx, ny) => {
      const n = noise(x * 2.1 + seed, z * 2.1 + y) * 0.5 + 0.5;
      c.copy(base).lerp(dark, smoothstep(0.55, 0.9, n)).multiplyScalar(0.8 + 0.3 * noise(x * 6, y * 6 + z));
      c.lerp(moss, smoothstep(0.55, 0.85, ny + (n - 0.5) * 0.4) * 0.85);
      c.multiplyScalar(0.75 + 0.25 * smoothstep(-0.2, 0.6, y));
    },
  });
  return B.build();
}

// small plant geometries --------------------------------------------------
function grassClumpGeo(seed, blades = 5, hMul = 1) {
  const rnd = mulberry32(seed);
  const pos = [], nrm = [], col = [], hh = [], idx = [];
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2, off = rnd() * 0.13;
    const bx = Math.cos(a) * off, bz = Math.sin(a) * off;
    const h = (0.26 + rnd() * 0.24) * hMul, w = 0.05 + rnd() * 0.03;
    const face = rnd() * Math.PI * 2, lean = 0.06 + rnd() * 0.16;
    const sx = Math.cos(face + Math.PI / 2) * w / 2, sz = Math.sin(face + Math.PI / 2) * w / 2;
    const fnx = Math.cos(face) * 0.35, fnz = Math.sin(face) * 0.35;
    const v0 = pos.length / 3;
    for (let r = 0; r <= 3; r++) {
      const t = r / 3, y = h * t, lo = lean * t * t;
      const cx = bx + Math.cos(a) * lo, cz = bz + Math.sin(a) * lo;
      const wk = 1 - t * 0.88;
      const shade = 0.5 + 0.5 * t;
      const tip = smoothstep(0.55, 1, t);
      const push = (x, z) => {
        pos.push(x, y, z); const l = Math.hypot(fnx, 1, fnz); nrm.push(fnx / l, 1 / l, fnz / l);
        col.push(shade * (1 + 0.06 * tip), shade * (1 + 0.04 * tip), shade * (1 - 0.25 * tip)); hh.push(t);
      };
      if (r < 3) { push(cx - sx * wk, cz - sz * wk); push(cx + sx * wk, cz + sz * wk); } else push(cx, cz);
    }
    for (let r = 0; r < 2; r++) { const i0 = v0 + r * 2; idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2); }
    idx.push(v0 + 4, v0 + 5, v0 + 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(hh, 1));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}

function ribbonClumpGeo(seed, n, hMin, hMax, w0, cBase, cTip, curl = 0.25) {
  const rnd = mulberry32(seed);
  const pos = [], nrm = [], col = [], hh = [], idx = [];
  const cb = C(cBase), ct = C(cTip);
  for (let b = 0; b < n; b++) {
    const a = rnd() * Math.PI * 2, off = rnd() * 0.18;
    const bx = Math.cos(a) * off, bz = Math.sin(a) * off;
    const h = hMin + rnd() * (hMax - hMin), w = w0 * (0.8 + rnd() * 0.4);
    const face = rnd() * Math.PI * 2, lean = curl * (0.4 + rnd());
    const sx = Math.cos(face + Math.PI / 2) * w / 2, sz = Math.sin(face + Math.PI / 2) * w / 2;
    const v0 = pos.length / 3, S = 5;
    for (let r = 0; r <= S; r++) {
      const t = r / S, y = h * t, lo = lean * t * t * h;
      const cx = bx + Math.cos(a) * lo, cz = bz + Math.sin(a) * lo, wk = 1 - t * 0.75;
      _c.copy(cb).lerp(ct, t).multiplyScalar(0.6 + 0.4 * t);
      for (const sgn of [-1, 1]) {
        pos.push(cx + sx * wk * sgn, y, cz + sz * wk * sgn); nrm.push(Math.cos(face) * 0.4, 1, Math.sin(face) * 0.4);
        col.push(_c.r, _c.g, _c.b); hh.push(t);
      }
    }
    for (let r = 0; r < S; r++) { const i0 = v0 + r * 2; idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(hh, 1));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

function flowerGeo(seed, petals = 6) {
  const B = new GeoBuilder(['aH', 'aMask']);
  const H = 0.3;
  const stem = new THREE.CylinderGeometry(0.008, 0.012, H, 3, 2);
  B.add(stem, { pos: [0, H / 2, 0], color: '#4f8a32', aH: (x, y) => y / H, aMask: 0 });
  for (let i = 0; i < 2; i++) {
    const leaf = new THREE.SphereGeometry(0.05, 5, 3);
    B.add(leaf, { pos: [0.035 * (i ? 1 : -1), 0.07 + i * 0.04, 0], scale: [1.0, 0.25, 0.45], rot: [0, i * 2.4, 0.4 * (i ? -1 : 1)], color: '#5a9638', aH: 0.25, aMask: 0 });
  }
  // petals: flattened spheres arranged radially
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const p = new THREE.SphereGeometry(0.045, 6, 3);
    B.add(p, { pos: [Math.cos(a) * 0.045, H + 0.008, Math.sin(a) * 0.045], scale: [1.0, 0.18, 0.5], rot: [0, -a, 0.18], color: '#ffffff', colorFn: (c, x, y, z) => c.multiplyScalar(0.85 + 0.15 * smoothstep(0, 0.09, Math.hypot(x, z))), aH: 1, aMask: 1 });
  }
  B.add(new THREE.SphereGeometry(0.026, 6, 4), { pos: [0, H + 0.015, 0], scale: [1, 0.6, 1], color: '#f2c13d', aH: 1, aMask: 0 });
  const g = B.build();
  g.attributes.normal.array.forEach((v, i, arr) => { if (i % 3 === 1) arr[i] = Math.max(arr[i], 0.35); });
  return g;
}

function reedClumpGeo(seed) {
  const rnd = mulberry32(seed);
  const parts = [ribbonClumpGeo(seed, 9, 0.7, 1.45, 0.045, '#48703a', '#9bb862', 0.12)];
  const B = new GeoBuilder(['aH']);
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * 0.15, h = 1.0 + rnd() * 0.5;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    B.add(new THREE.CylinderGeometry(0.008, 0.012, h, 3), { pos: [x, h / 2, z], color: '#5e7f3d', aH: (px, py) => py / 1.5 });
    B.add(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 7), { pos: [x, h - 0.12, z], color: '#6b4329', colorFn: (c, px, py, pz, nx, ny) => c.multiplyScalar(0.8 + 0.3 * (ny * 0.5 + 0.5)), aH: (h - 0.1) / 1.5 });
  }
  const g2 = B.build();
  g2.deleteAttribute('normal'); g2.computeVertexNormals();
  const a = parts[0].toNonIndexed();
  const merged = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'aH']) {
    const A = a.attributes[name], Bb = g2.attributes[name];
    const arr = new Float32Array(A.array.length + Bb.array.length); arr.set(A.array); arr.set(Bb.array, A.array.length);
    merged.setAttribute(name, new THREE.BufferAttribute(arr, A.itemSize));
  }
  merged.computeBoundingSphere();
  return merged;
}

function lilyPadGeo() {
  const g = new THREE.CircleGeometry(0.36, 16, 0.25, Math.PI * 2 - 0.5);
  g.rotateX(-Math.PI / 2);
  const P = g.attributes.position.array, n = P.length / 3, col = new Float32Array(n * 3);
  const a = C('#3f7f34'), b = C('#78ad4a');
  for (let i = 0; i < n; i++) {
    const r = Math.hypot(P[i * 3], P[i * 3 + 2]) / 0.36;
    P[i * 3 + 1] = 0.012 * r * r;
    _c.copy(a).lerp(b, 0.25 + 0.5 * r * r);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}
function lotusGeo() {
  const B = new GeoBuilder();
  const pk = C('#f39bbb'), wh = C('#fff1f5');
  for (let ring = 0; ring < 2; ring++) {
    const n = ring ? 6 : 8, tilt = ring ? 0.45 : 0.85, s = ring ? 0.8 : 1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.4;
      B.add(new THREE.SphereGeometry(0.06, 7, 4), {
        pos: [Math.cos(a) * 0.05 * s, 0.05, Math.sin(a) * 0.05 * s], scale: [0.55 * s, 1.15 * s, 0.25 * s], rot: [0, -a + Math.PI / 2, 0], color: pk,
        warp: null,
        colorFn: (c, x, y) => c.copy(wh).lerp(pk, smoothstep(0.02, 0.12, y)),
      });
      // tilt petals outward by rotating around tangent: approximate via second add not needed
      void tilt;
    }
  }
  B.add(new THREE.CylinderGeometry(0.03, 0.025, 0.03, 8), { pos: [0, 0.05, 0], color: '#f4cf4a' });
  return B.build();
}
function mushroomGeo(red) {
  const B = new GeoBuilder();
  B.add(new THREE.CylinderGeometry(0.035, 0.045, 0.16, 7), { pos: [0, 0.08, 0], color: '#f1ead8' });
  const cap = new THREE.SphereGeometry(0.11, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  B.add(cap, { pos: [0, 0.15, 0], scale: [1, 0.75, 1], color: red ? '#d2392b' : '#9a6a3f', colorFn: red ? (c, x, y, z) => { const d = Math.sin(x * 70) * Math.sin(z * 70) * Math.sin(y * 50 + 1); if (d > 0.45) c.set('#fbf6ea'); } : (c, x, y) => c.multiplyScalar(0.85 + 0.6 * (y - 0.15)) });
  return B.build();
}
// ---------------------------------------------------------------- vegetation
export class Vegetation {
  constructor(T, U, colliders) {
    this.T = T; this.U = U; this.col = colliders;
    this.rand = mulberry32(4242);
    this.group = new THREE.Group(); this.group.name = 'vegetation';
    this.items = { tree: [], bush: [], rock: [], mush: [], log: [], stump: [] };
    this.grassChunks = []; this.quality = 1;
    this.buildPathDist();
    this.spacing = new Map();
  }
  buildPathDist() {
    const S = 193, R = 96, d = new Float32Array(S * S).fill(99);
    for (const [ax, az, bx, bz] of this.T.pathSegs) {
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - 7 + R)), x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx) + 7 + R));
      const z0 = Math.max(0, Math.floor(Math.min(az, bz) - 7 + R)), z1 = Math.min(S - 1, Math.ceil(Math.max(az, bz) + 7 + R));
      for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
        const r = Math.sqrt(distToSegment2(ix - R, iz - R, ax, az, bx, bz).d2);
        const k = iz * S + ix; if (r < d[k]) d[k] = r;
      }
    }
    this.pd = { S, R, d };
  }
  pathDist(x, z) {
    const { S, R, d } = this.pd;
    const ix = Math.round(x + R), iz = Math.round(z + R);
    if (ix < 0 || iz < 0 || ix >= S || iz >= S) return 99;
    return d[iz * S + ix];
  }
  // spacing hash
  spOk(x, z, r) {
    const cs = 6, ix = Math.floor(x / cs), iz = Math.floor(z / cs);
    for (let a = ix - 2; a <= ix + 2; a++) for (let b = iz - 2; b <= iz + 2; b++) {
      const L = this.spacing.get(a * 10007 + b); if (!L) continue;
      for (const o of L) if ((o[0] - x) ** 2 + (o[1] - z) ** 2 < (o[2] + r) ** 2) return false;
    }
    return true;
  }
  spAdd(x, z, r) {
    const cs = 6, k = Math.floor(x / cs) * 10007 + Math.floor(z / cs);
    let L = this.spacing.get(k); if (!L) { L = []; this.spacing.set(k, L); }
    L.push([x, z, r]);
  }
  blocked(x, z, pad = 0, home = true) {
    const T = this.T;
    if (r6(x, z) > 112) return true;
    const lv = T.waterLevelAt(x, z), h = T.heightAt(x, z);
    if (lv > -40 && h < lv + 0.3) return true;
    if (T.pondD(x, z) < 1.32 + pad * 0.08) return true;
    const ri = T.riverInfo(x, z);
    if (ri.d < 46 && ri.edge < 1.4 + pad) return true;
    if (home && T.homeMask(x, z) > 0.02) return true;
    if (this.pathDist(x, z) < 2.0 + pad) return true;
    const B = T.bridge; if (Math.hypot(x - B.cx, z - B.cz) < B.span / 2 + 3.5) return true;
    const c = T.cascade; if (Math.hypot(x - c.x, z - c.z) < 4) return true;
    return false;
  }

  addTree(kind, x, z, s, opts = {}) {
    const T = this.T, R = this.rand;
    const y = T.heightAt(x, z) - 0.05;
    const it = { kind, x, y, z, s, rot: R() * Math.PI * 2, tint: 0.9 + R() * 0.2, v: Math.floor(R() * 3) };
    this.items.tree.push(it);
    const info = TREE_INFO[kind];
    this.col.addCircle(x, z, info.trunk * s, 'tree');
    this.spAdd(x, z, info.space * s);
    T.stampAO(x, z, info.crown * s * 0.62, 0.3);
    if (opts.forest) T.stampForest(x, z, 4.2 * s);
    return it;
  }

  plan() {
    const T = this.T, R = this.rand;
    // ---- hand placed trees around home ----
    const manual = [
      ['apple', -4.6, -19.8, 1.0], ['apple', 1.6, -21.6, 0.95], ['apple', 5.4, -20.2, 0.9],
      ['oak', -9.8, 1.4, 1.3], ['blossom', -29.5, -15.6, 1.05], ['blossom', -33.2, -3.4, 0.9],
      ['birch', 21.5, -13.8, 1.0], ['birch', 23.2, -18.8, 1.1], ['oak', 25.5, -1.5, 1.15],
      ['oak', -7.5, 26.5, 1.2], ['blossom', 8.5, 14.5, 0.95], ['pine', -15.5, -24.5, 1.0],
      ['birch', -13.4, 10.5, 1.0], ['oak', 14, 6, 1.0],
    ];
    for (const [k, x, z, s] of manual) this.addTree(k, x, z, s);
    // ---- forest (NW hill) ----
    const FC = [-41, -45], FR = 24;
    for (let i = 0; i < 1400; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * FR;
      const x = FC[0] + Math.cos(a) * d, z = FC[1] + Math.sin(a) * d;
      if (Math.hypot(x + 34, z + 44) < 6.5) continue; // clearing
      if (this.blocked(x, z, 0)) continue;
      const roll = R();
      const kind = roll < 0.32 ? 'oak' : roll < 0.6 ? 'birch' : 'pine';
      const s = 0.85 + R() * 0.45;
      if (!this.spOk(x, z, TREE_INFO[kind].space * s * 0.75)) continue;
      this.addTree(kind, x, z, s, { forest: true });
    }
    // ---- groves ----
    const groves = [
      { c: [18, -52], r: 13, n: 260, mix: [['birch', 0.6], ['oak', 0.85], ['pine', 1]], sp: 1.0 },
      { c: [50, 50], r: 15, n: 260, mix: [['oak', 0.55], ['blossom', 0.75], ['birch', 1]], sp: 1.1 },
      { c: [-62, 12], r: 13, n: 260, mix: [['pine', 0.75], ['oak', 1]], sp: 1.0 },
      { c: [-48, 58], r: 12, n: 200, mix: [['oak', 0.5], ['pine', 1]], sp: 1.1 },
      { c: [58, -12], r: 12, n: 200, mix: [['pine', 0.6], ['birch', 1]], sp: 1.1 },
    ];
    for (const g of groves) for (let i = 0; i < g.n; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * g.r;
      const x = g.c[0] + Math.cos(a) * d, z = g.c[1] + Math.sin(a) * d;
      if (this.blocked(x, z, 0.5)) continue;
      const roll = R(); const kind = g.mix.find(m => roll < m[1])[0];
      const s = 0.85 + R() * 0.4;
      if (!this.spOk(x, z, TREE_INFO[kind].space * s * g.sp)) continue;
      this.addTree(kind, x, z, s, { forest: true });
    }
    // ---- boundary ring ----
    for (let i = 0; i < 9000; i++) {
      const x = (R() * 2 - 1) * 112, z = (R() * 2 - 1) * 112;
      const rr = r6(x, z);
      if (rr < 74 || rr > 110) continue;
      if (rr < 80 && R() < 0.5) continue;
      if (this.blocked(x, z, 1.5, false)) continue;
      const roll = R();
      const kind = roll < 0.68 ? 'pine' : roll < 0.88 ? 'oak' : 'birch';
      const s = 0.9 + R() * 0.55 + smoothstep(85, 110, rr) * 0.3;
      if (!this.spOk(x, z, TREE_INFO[kind].space * s * 0.85)) continue;
      this.addTree(kind, x, z, s, { forest: rr > 82 });
    }
    // ---- scattered meadow trees ----
    for (let i = 0; i < 2000 && this.items.tree.length < 99999; i++) {
      const x = (R() * 2 - 1) * 74, z = (R() * 2 - 1) * 74;
      if (r6(x, z) > 72) continue;
      if (this.blocked(x, z, 1.5)) continue;
      if (!this.spOk(x, z, 9)) continue;
      const roll = R();
      const kind = roll < 0.45 ? 'oak' : roll < 0.68 ? 'birch' : roll < 0.8 ? 'blossom' : 'pine';
      this.addTree(kind, x, z, 0.9 + R() * 0.4);
    }
    // ---- bushes ----
    const bushManual = [[-4.3, -10.0, 0.9, 0], [4.35, -10.2, 0.85, 1], [-4.2, -16.4, 1.0, 0], [-7.3, -13.5, 0.9, 2], [6.0, -7.6, 0.8, 1], [18.2, -16.6, 0.9, 0], [-10.6, -6.6, 0.75, 2], [-3.2, -4.6, 0.7, 1]];
    for (const [x, z, s, v] of bushManual) this.addBush(x, z, s, v);
    for (let i = 0; i < 3000; i++) {
      const x = (R() * 2 - 1) * 90, z = (R() * 2 - 1) * 90;
      if (r6(x, z) > 86) continue;
      if (this.blocked(x, z, 0.2)) continue;
      const fk = T.sampleGrid(T.forest, x, z);
      if (R() > 0.06 + fk * 0.5) continue;
      if (!this.spOk(x, z, 1.6)) continue;
      this.addBush(x, z, 0.7 + R() * 0.6, Math.floor(R() * 4));
    }
    // ---- rocks ----
    const c = T.cascade;
    for (let i = 0; i < 26; i++) {
      const s = T.cascadeS0 - 6 + R() * 20;
      const p = T.riverPointAt(s), w = T.riverHalfW(s);
      const side = R() < 0.5 ? -1 : 1, off = w + 0.2 + R() * 2.6;
      const x = p.x - p.tz * off * side, z = p.z + p.tx * off * side;
      this.addRock(x, z, 0.7 + R() * 1.1, true);
    }
    void c;
    for (let i = 0; i < 2600; i++) {
      const s = R() * T.river.total; if (s < 8) continue;
      const p = T.riverPointAt(s), w = T.riverHalfW(s);
      if (r6(p.x, p.z) > 100) continue;
      const side = R() < 0.5 ? -1 : 1, off = w + 0.3 + R() * 1.8;
      const x = p.x - p.tz * off * side, z = p.z + p.tx * off * side;
      if (R() > 0.025) continue;
      const B = T.bridge; if (Math.hypot(x - B.cx, z - B.cz) < B.span / 2 + 2) continue;
      if (this.pathDist(x, z) < 1.6 || T.homeMask(x, z) > 0.2) continue;
      this.addRock(x, z, 0.25 + R() * 0.55, true);
    }
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2; if (Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI - 0.22) < 0.45) continue;
      const pr = T.pondR(a) * (1.06 + R() * 0.22);
      const x = POND.x + Math.cos(a) * pr, z = POND.z + Math.sin(a) * pr;
      if (this.pathDist(x, z) < 1.4) continue;
      this.addRock(x, z, 0.3 + R() * 0.5, true);
    }
    for (let i = 0; i < 4000; i++) {
      const x = (R() * 2 - 1) * 108, z = (R() * 2 - 1) * 108;
      const rr = r6(x, z);
      const fk = T.sampleGrid(T.forest, x, z);
      const p = rr > 76 ? 0.05 : 0.004 + fk * 0.03;
      if (R() > p) continue;
      if (this.blocked(x, z, 0.4, rr < 76)) continue;
      if (!this.spOk(x, z, 1.2)) continue;
      this.addRock(x, z, rr > 76 ? 0.8 + R() * 1.6 : 0.3 + R() * 0.7, true);
    }
    // pond bottom stones
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2, d = 0.25 + R() * 0.6;
      const x = POND.x + Math.cos(a) * T.pondR(a) * d, z = POND.z + Math.sin(a) * T.pondR(a) * d;
      this.addRock(x, z, 0.18 + R() * 0.3, false);
    }
    // ---- forest floor detail ----
    for (let i = 0; i < 5000; i++) {
      const x = (R() * 2 - 1) * 90, z = (R() * 2 - 1) * 90;
      const fk = T.sampleGrid(T.forest, x, z);
      if (fk < 0.3 || R() > 0.12) continue;
      if (this.blocked(x, z, -0.8)) continue;
      if (this.col.hit(x, z, 0.3)) continue;
      this.items.mush.push({ x, z, y: T.heightAt(x, z), s: 0.7 + R() * 0.8, rot: R() * 6.28, red: R() < 0.45 });
    }
    // fairy ring in forest clearing
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2, x = -34 + Math.cos(a) * 2.6, z = -44 + Math.sin(a) * 2.6;
      this.items.mush.push({ x, z, y: T.heightAt(x, z), s: 1.1 + R() * 0.5, rot: R() * 6.28, red: i % 3 !== 0 });
    }
    this.items.stump.push({ x: -34, z: -44, s: 1.1 });
    this.col.addCircle(-34, -44, 0.45, 'stump');
    const logs = [[-37.8, -39.5, 0.6, 3.2], [-45, -50, 2.1, 4], [14, -48, 1.2, 3.4], [-58, 8, 0.4, 3.6]];
    for (const [x, z, rot, len] of logs) {
      this.items.log.push({ x, z, rot, len });
      this.col.addWall(x - Math.cos(rot) * len / 2, z + Math.sin(rot) * len / 2, x + Math.cos(rot) * len / 2, z - Math.sin(rot) * len / 2, 0.32, 'log');
    }
    for (let i = 0; i < 14; i++) {
      const x = FC[0] + (R() - 0.5) * 40, z = FC[1] + (R() - 0.5) * 40;
      if (this.blocked(x, z, 0) || this.col.hit(x, z, 0.6)) continue;
      this.items.stump.push({ x, z, s: 0.8 + R() * 0.5 });
      this.col.addCircle(x, z, 0.4, 'stump');
    }
  }
  addBush(x, z, s, v) {
    this.items.bush.push({ x, z, y: this.T.heightAt(x, z) - 0.05, s, rot: this.rand() * 6.28, v, tint: 0.9 + this.rand() * 0.2 });
    this.col.addCircle(x, z, 0.5 * s, 'bush');
    this.spAdd(x, z, 1.0 * s);
    this.T.stampAO(x, z, 0.9 * s, 0.25);
  }
  addRock(x, z, s, solid) {
    const T = this.T;
    const n = T.normalAt(x, z);
    this.items.rock.push({ x, z, y: T.heightAt(x, z) - 0.12 * s, s, rot: this.rand() * 6.28, v: Math.floor(this.rand() * 3), n: n.clone() });
    if (solid && s > 0.45) this.col.addCircle(x, z, 0.75 * s, 'rock');
    this.spAdd(x, z, 1.0 * s);
    T.stampAO(x, z, 0.9 * s, 0.22);
  }

  // ---------------------------------------------------------------- meshes
  build(structures, isTilled) {
    const T = this.T, U = this.U, noise = T.noise;
    // realistic trees & bushes (procedural skeletons + bark textures + leaf-atlas cards, LOD managed per frame)
    this.trees = new TreeField(U, this.items.tree, this.items.bush);
    if (this.qk) this.trees.setQuality(this.qk);
    this.group.add(this.trees.group);
    this.frustum = new THREE.Frustum(); this._pm = new THREE.Matrix4();
    // rocks
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
    const rockG = [rockGeo(noise, 1.3, [1, 0.62, 0.86]), rockGeo(noise, 7.7, [1.1, 0.5, 0.8]), rockGeo(noise, 3.1, [0.9, 0.78, 0.9])];
    this.instanceSet(rockG, this.items.rock, rockMat, null, true, true);
    // mushrooms
    const mushMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    const mr = this.items.mush.filter(m => m.red), mb = this.items.mush.filter(m => !m.red);
    if (mr.length) this.group.add(this.inst(mushroomGeo(true), mushMat, mr, true));
    if (mb.length) this.group.add(this.inst(mushroomGeo(false), mushMat, mb, true));
    // logs & stumps (static)
    // realistic dead wood: bark-textured tubes with mossy tops + tree-ring cut ends
    const bk = TEX.bark && TEX.bark.oak;
    const woodMat = new THREE.MeshStandardMaterial({ map: bk ? bk.map : null, normalMap: bk ? bk.normalMap : null, normalScale: new THREE.Vector2(1.3, 1.3), vertexColors: true, roughness: 0.92 });
    const ringMat = new THREE.MeshStandardMaterial({ map: ringTexture(), vertexColors: true, roughness: 0.86 });
    const addWood = (g, x, y, z, rotY, sc) => {
      for (const [geo, mat] of [[g.bark, woodMat], [g.cap, ringMat]]) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z); m.rotation.y = rotY; m.scale.setScalar(sc);
        m.castShadow = m.receiveShadow = true; this.group.add(m);
      }
    };
    this.items.log.forEach((l, i) => addWood(genLog(l.len, 0.3, 11 + i * 7), l.x, T.heightAt(l.x, l.z) + 0.22, l.z, l.rot, 1));
    const stumps = [genStump(3), genStump(8), genStump(21)];
    this.items.stump.forEach((s, i) => addWood(stumps[i % 3], s.x, T.heightAt(s.x, s.z) - 0.05, s.z, i * 2.1, s.s));
    this.buildWaterPlants();
    this.bakeGrassMask(structures);
    this.grass = new GrassField(this.T, this.U, this.qk || 'medium');
    this.group.add(this.grass.group);
    this.buildFlowers(structures, isTilled);
  }
  // grass density (0..1) baked into the blue channel of the ground mask; read by the GPU grass
  grassDensity(x, z, structures) {
    const T = this.T;
    const rr = r6(x, z); if (rr > 88) return 0;
    let d = smoothstep(88, 82, rr);
    const h = T.heightAt(x, z), lv = T.waterLevelAt(x, z);
    if (lv > -40) {
      d *= smoothstep(lv + 0.04, lv + 0.22, h) * (1 - 0.85 * smoothstep(lv + 0.5, lv + 0.12, h));
      if (d <= 0) return 0;
    }
    d *= smoothstep(21, 17, h);
    d *= 1 - smoothstep(0.12, 0.42, T.pathAt(x, z));
    if (d <= 0) return 0;
    const n = T.normalAt(x, z, _p); d *= smoothstep(0.76, 0.87, n.y);
    if (d <= 0) return 0;
    if (T.onDeck(x, z)) return 0;
    if (structures && structures.noGrass(x, z)) return 0;
    if (this.col.hit(x, z, 0.05)) return 0;
    const fk = T.sampleGrid(T.forest, x, z);
    d *= 1 - fk * 0.55;
    const pn = T.noise(x * 0.08 + 5, z * 0.08 - 3);
    d *= 0.62 + 0.38 * smoothstep(-0.8, -0.35, pn);
    return d;
  }
  bakeGrassMask(structures) {
    const T = this.T, { S, R, data } = T.gm, texel = (2 * R) / S;
    for (let tz = 0; tz < S; tz++) for (let tx = 0; tx < S; tx++) {
      const x = -R + (tx + 0.5) * texel, z = -R + (tz + 0.5) * texel;
      data[(tz * S + tx) * 4 + 2] = Math.round(clamp(this.grassDensity(x, z, structures), 0, 1) * 255);
    }
    T.groundTex.needsUpdate = true;
  }
  inst(geo, mat, list, shadow, normalAlign = false) {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    const q2 = new THREE.Quaternion();
    list.forEach((it, i) => {
      _q.setFromAxisAngle(UPV, it.rot);
      if (normalAlign && it.n) { q2.setFromUnitVectors(UPV, _p.copy(it.n).lerp(UPV, 0.4).normalize()); _q.premultiply(q2); }
      _s.setScalar(it.s); _p.set(it.x, it.y ?? this.T.heightAt(it.x, it.z), it.z);
      _m.compose(_p, _q, _s); m.setMatrixAt(i, _m);
      if (it.tint) m.setColorAt(i, _c.setScalar(it.tint));
    });
    m.castShadow = shadow; m.receiveShadow = true;
    m.computeBoundingSphere();
    return m;
  }
  instanceSet(geos, items, mat, depth, shadow, normalAlign = false) {
    const groups = new Map();
    for (const it of items) {
      const key = it.v + '|' + Math.floor((it.x + 130) / 52) + ',' + Math.floor((it.z + 130) / 52);
      let a = groups.get(key); if (!a) { a = []; groups.set(key, a); }
      a.push(it);
    }
    for (const [key, list] of groups) {
      const v = +key.split('|')[0];
      const m = this.inst(geos[v % geos.length], mat, list, shadow, normalAlign);
      if (depth) m.customDepthMaterial = depth;
      this.group.add(m);
    }
  }

  buildWaterPlants() {
    const T = this.T, U = this.U, R = mulberry32(99);
    // reeds around pond & slow river edges
    const reedMat = patchVeg(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), U, { attr: 'aH', amp: 0.35, freq: 1.3, trans: 0.4, noflip: true });
    const reeds = [];
    for (let i = 0; i < 140; i++) {
      const a = R() * Math.PI * 2;
      const da = Math.atan2(-3.6 - POND.z, -11.5 - POND.x);
      if (Math.abs(Math.atan2(Math.sin(a - da), Math.cos(a - da))) < 0.42) continue;
      const d = 0.93 + R() * 0.16;
      const x = POND.x + Math.cos(a) * T.pondR(a) * d, z = POND.z + Math.sin(a) * T.pondR(a) * d;
      if (this.pathDist(x, z) < 1.8) continue;
      if (R() < 0.45) continue;
      reeds.push({ x, z, y: T.heightAt(x, z) - 0.05, s: 0.8 + R() * 0.5, rot: R() * 6.28 });
    }
    for (let i = 0; i < 1600; i++) {
      const s = 110 + R() * (T.river.total - 110);
      const p = T.riverPointAt(s); if (r6(p.x, p.z) > 92) continue;
      const w = T.riverHalfW(s), side = R() < 0.5 ? -1 : 1, off = w - 0.6 + R() * 1.2;
      const x = p.x - p.tz * off * side, z = p.z + p.tx * off * side;
      if (R() > 0.06) continue;
      const B = T.bridge; if (Math.hypot(x - B.cx, z - B.cz) < B.span / 2 + 2.5) continue;
      if (this.pathDist(x, z) < 2) continue;
      reeds.push({ x, z, y: T.heightAt(x, z) - 0.05, s: 0.8 + R() * 0.5, rot: R() * 6.28 });
    }
    const reedGeo = reedClumpGeo(5);
    if (reeds.length) this.group.add(this.inst(reedGeo, reedMat, reeds, false));
    // lily pads & lotus
    const padMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0 });
    const pads = [], lotus = [];
    const clusters = [[-0.5, -0.55], [0.35, 0.45], [-0.55, 0.35], [0.5, -0.4]];
    for (const [cx, cz] of clusters) {
      const px = POND.x + cx * POND.r, pz = POND.z + cz * POND.r;
      for (let k = 0; k < 11; k++) {
        const x = px + (R() - 0.5) * 3.6, z = pz + (R() - 0.5) * 3.6;
        const d = T.pondD(x, z); if (d > 0.88 || d < 0.2) continue;
        if (Math.abs(z + 3.6) < 1.6 && x > -20.5) continue;
        let ok = true; for (const p of pads) if ((p.x - x) ** 2 + (p.z - z) ** 2 < 0.55) { ok = false; break; }
        if (!ok) continue;
        const s = 0.7 + R() * 0.6;
        pads.push({ x, z, y: POND.level + 0.012, s, rot: R() * 6.28 });
        if (R() < 0.22) lotus.push({ x: x + 0.05, z: z + 0.03, y: POND.level + 0.01, s: 0.9 + R() * 0.4, rot: R() * 6.28 });
      }
    }
    this.pads = pads;
    if (pads.length) { const m = this.inst(lilyPadGeo(), padMat, pads, false); m.receiveShadow = true; this.group.add(m); }
    if (lotus.length) this.group.add(this.inst(lotusGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, emissive: '#3a1020', emissiveIntensity: 0.25 }), lotus, true));
    // underwater weeds (pond + river pools)
    const weedMat = patchVeg(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), U, { attr: 'aH', amp: 0.55, freq: 0.6, flutter: 0.02, trans: 0.0, noflip: true });
    const weeds = [];
    for (let i = 0; i < 400; i++) {
      const a = R() * Math.PI * 2, d = 0.15 + R() * 0.72;
      const x = POND.x + Math.cos(a) * T.pondR(a) * d, z = POND.z + Math.sin(a) * T.pondR(a) * d;
      const h = T.heightAt(x, z), depth = POND.level - h;
      if (depth < 0.6 || R() > 0.3) continue;
      weeds.push({ x, z, y: h - 0.03, s: Math.min(1.3, (depth - 0.35) / 1.2) * (0.7 + R() * 0.4), rot: R() * 6.28 });
    }
    const weedGeo = ribbonClumpGeo(17, 7, 0.6, 1.25, 0.06, '#2f5f2d', '#7aa64a', 0.3);
    if (weeds.length) this.group.add(this.inst(weedGeo, weedMat, weeds, false));
  }

  grassOk(x, z, structures, isTilled) {
    const T = this.T;
    if (r6(x, z) > 86) return 0;
    const h = T.heightAt(x, z), lv = T.waterLevelAt(x, z);
    if (lv > -40 && h < lv + 0.1) return 0;
    if (h > 19) return 0;
    if (T.pathAt(x, z) > 0.3) return 0;
    const n = T.normalAt(x, z, _p); if (n.y < 0.8) return 0;
    if (isTilled && isTilled(x, z)) return 0;
    if (structures && structures.noGrass(x, z)) return 0;
    if (this.col.hit(x, z, 0.08)) return 0;
    if (T.onDeck(x, z)) return 0;
    const fk = T.sampleGrid(T.forest, x, z);
    return 1 - fk * 0.62;
  }
  buildGrass(structures, isTilled) {
    const T = this.T, U = this.U, R = mulberry32(31337);
    const mat = patchVeg(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }), U, { attr: 'aH', amp: 0.26, freq: 1.6, push: 0.85, fade: [40, 58], tint: true, trans: 0.55, noflip: true });
    this.grassMat = mat;
    const geos = [grassClumpGeo(1, 5), grassClumpGeo(2, 5, 1.15), grassClumpGeo(3, 4, 0.85)];
    const CS = 16, forestC = C('#5e5a32');
    for (let cz = -96; cz < 96; cz += CS) for (let cx = -96; cx < 96; cx += CS) {
      const ccx = cx + CS / 2, ccz = cz + CS / 2;
      if (r6(ccx, ccz) > 98) continue;
      const near = smoothstep(52, 30, Math.hypot(ccx - 2, ccz + 8));
      const dens = lerp(1.05, 2.1, near);
      const n = Math.floor(CS * CS * dens);
      const list = [];
      for (let i = 0; i < n; i++) {
        const x = cx + R() * CS, z = cz + R() * CS;
        const k = this.grassOk(x, z, structures, isTilled);
        if (k <= 0 || R() > k) continue;
        const pn = T.noise(x * 0.08 + 5, z * 0.08 - 3);
        if (pn < -0.55 && R() < 0.7) continue;
        list.push([x, z, T.heightAt(x, z), R()]);
      }
      if (!list.length) continue;
      const gi = Math.floor(R() * 3);
      const m = new THREE.InstancedMesh(geos[gi], mat, list.length);
      const pos = new Float32Array(list.length * 2);
      list.forEach(([x, z, y, r], i) => {
        _q.setFromAxisAngle(UPV, r * 6.28);
        const sc = 0.75 + r * 0.6 + T.noise(x * 0.05, z * 0.05) * 0.25;
        _s.set(sc, sc * (0.85 + 0.3 * (T.noise(x * 0.11 - 4, z * 0.11) * 0.5 + 0.5)), sc);
        _p.set(x, y - 0.02, z); _m.compose(_p, _q, _s); m.setMatrixAt(i, _m);
        T.colorAt(x, z, _c);
        const fk = T.sampleGrid(T.forest, x, z), ao = T.sampleGrid(T.ao, x, z);
        _c.lerp(forestC, fk * 0.55).multiplyScalar(lerp(0.6, 1.0, ao) * 1.04);
        m.setColorAt(i, _c);
        pos[i * 2] = x; pos[i * 2 + 1] = z;
      });
      m.receiveShadow = true; m.castShadow = false;
      m.computeBoundingSphere();
      m.userData = { cx: ccx, cz: ccz, n: list.length, pos };
      this.grassChunks.push(m);
      this.group.add(m);
    }
  }
  buildFlowers(structures, isTilled) {
    const T = this.T, U = this.U, R = mulberry32(777);
    const mat = patchVeg(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }), U, { attr: 'aH', amp: 0.3, freq: 1.5, push: 0.7, fade: [45, 60], mask: true, trans: 0.5, noflip: true });
    const palette = ['#ffffff', '#ffe066', '#ff9ec4', '#c7a6ff', '#8fb8ff', '#ff8a65', '#ffffff', '#fff2a8'].map(C);
    const list = [];
    const centers = [];
    for (let i = 0; i < 1600 && centers.length < 95; i++) {
      const x = (R() * 2 - 1) * 78, z = (R() * 2 - 1) * 78;
      if (r6(x, z) > 76) continue;
      if (this.grassOk(x, z, structures, isTilled) < 0.9) continue;
      if (T.homeMask(x, z) > 0.6 && R() < 0.6) continue;
      centers.push([x, z]);
    }
    // extra flowers near home & pond
    centers.push([-8.5, -11], [-14.5, -1.5], [3.5, -2.5], [-16, -14], [20.5, -9], [-3.5, 3]);
    for (const [cx, cz] of centers) {
      const col = palette[Math.floor(R() * palette.length)], col2 = palette[Math.floor(R() * palette.length)];
      const n = 8 + Math.floor(R() * 18), rad = 1.4 + R() * 2.2;
      for (let k = 0; k < n; k++) {
        const a = R() * Math.PI * 2, d = Math.sqrt(R()) * rad;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (this.grassOk(x, z, structures, isTilled) <= 0.5) continue;
        list.push({ x, z, y: T.heightAt(x, z) - 0.01, s: 0.75 + R() * 0.65, rot: R() * 6.28, c: R() < 0.75 ? col : col2 });
      }
    }
    this.flowerSpots = centers;
    const m = new THREE.InstancedMesh(flowerGeo(1), mat, list.length);
    list.forEach((it, i) => {
      _q.setFromAxisAngle(UPV, it.rot); _s.setScalar(it.s); _p.set(it.x, it.y, it.z);
      _m.compose(_p, _q, _s); m.setMatrixAt(i, _m); m.setColorAt(i, it.c);
    });
    m.receiveShadow = true; m.castShadow = false; m.computeBoundingSphere();
    m.userData.pos = new Float32Array(list.flatMap(it => [it.x, it.z]));
    this.flowers = m;
    this.group.add(m);
  }

  // remove grass/flowers inside rect (when tilling)
  clearRect(x0, z0, x1, z1) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const kill = (m, pos, n) => {
      let changed = false;
      for (let i = 0; i < n; i++) {
        const x = pos[i * 2], z = pos[i * 2 + 1];
        if (x > x0 - 0.1 && x < x1 + 0.1 && z > z0 - 0.1 && z < z1 + 0.1) { m.setMatrixAt(i, zero); changed = true; }
      }
      if (changed) m.instanceMatrix.needsUpdate = true;
    };
    if (this.flowers) kill(this.flowers, this.flowers.userData.pos, this.flowers.count);
  }
  setQuality(q) {
    this.qk = q; this.quality = q === 'high' ? 1 : q === 'low' ? 0.38 : 0.7;
    if (this.grass) this.grass.setQuality(q);
    if (this.trees) this.trees.setQuality(q);
  }
  update(camera, focus) {
    camera.updateMatrixWorld();
    if (this.grass) this.grass.update(camera);
    if (this.trees) {
      this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this._pm);
      this.trees.update(camera, focus || camera.position, this.frustum);
    }
  }
}

const TREE_INFO = {
  oak: { trunk: 0.36, crown: 3.6, space: 3.2 },
  birch: { trunk: 0.22, crown: 2.2, space: 2.4 },
  blossom: { trunk: 0.3, crown: 3.1, space: 3.2 },
  apple: { trunk: 0.24, crown: 2.4, space: 2.8 },
  pine: { trunk: 0.34, crown: 2.6, space: 2.7 },
};
