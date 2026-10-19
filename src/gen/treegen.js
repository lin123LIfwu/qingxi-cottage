// Procedural "realistic" trees.
// Recursive branch skeletons → bark tubes (parallel-transport frames, tiled bark UVs, root flare),
// foliage as bent, V-folded alpha cards cut from the leaf atlas.  Foliage normals are blended
// towards the crown ellipsoid (soft volumetric shading), AO is baked into vertex colours and
// every vertex carries the same position-derived wind weight so leaves stay on their branches.
import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';
import { CELL, cellUV } from './leafgen.js';

const BARK_U = 0.6, BARK_V = 1.2;
const UP = new THREE.Vector3(0, 1, 0);
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rr = (R, a) => (Array.isArray(a) ? a[0] + (a[1] - a[0]) * R() : a);
const ri = (R, a) => (Array.isArray(a) ? Math.floor(a[0] + (a[1] - a[0] + 1) * R()) : a);
const DEG = Math.PI / 180;

class MeshData {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.w = []; this.i = []; this.nv = 0; }
  v(p, n, u, v, c, w) {
    this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.uv.push(u, v); this.c.push(c[0], c[1], c[2]); this.w.push(w);
    return this.nv++;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.w, 1));
    g.setIndex(this.nv > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

function perp(d) { const a = Math.abs(d.y) < 0.92 ? UP : v3(1, 0, 0); return a.clone().cross(d).normalize(); }

// direction tilted by alpha away from d, at azimuth phi measured from the "upper side" of d
function childDir(d, phi, alpha) {
  let a = UP.clone().addScaledVector(d, -UP.dot(d));
  if (a.lengthSq() < 1e-4) a = perp(d); else a.normalize();
  const b = d.clone().cross(a).normalize();
  const s = Math.sin(alpha), c = Math.cos(alpha);
  return d.clone().multiplyScalar(c).addScaledVector(a, s * Math.cos(phi)).addScaledVector(b, s * Math.sin(phi)).normalize();
}

function grow(p0, d0, len, segs, o, R, r0, r1) {
  const pts = [p0.clone()], rad = [r0];
  const p = p0.clone(), d = d0.clone();
  const ds = len / segs, g = o.gnarl || 0;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    d.x += (R() - 0.5) * 2 * g; d.y += (R() - 0.5) * 1.2 * g; d.z += (R() - 0.5) * 2 * g;
    d.y += (o.up || 0) * ds - (o.droop || 0) * ds * t;
    d.normalize();
    p.addScaledVector(d, ds);
    pts.push(p.clone());
    rad.push(lerp(r0, r1, Math.pow(t, o.taperPow ?? 0.9)));
  }
  return { pts, rad, len, segs, level: 0, v0: R() * 4 };
}

function at(br, t) {
  const f = clamp01(t) * br.segs; const i = Math.min(br.segs - 1, Math.floor(f)); const k = f - i;
  const p = br.pts[i].clone().lerp(br.pts[i + 1], k);
  const d = br.pts[i + 1].clone().sub(br.pts[i]).normalize();
  return { p, d, r: lerp(br.rad[i], br.rad[i + 1], k) };
}

// bark tube with parallel-transport frames
function tube(M, br, radial, env, step = 1) {
  const idx = [];
  for (let i = 0; i < br.pts.length; i += step) idx.push(i);
  if (idx[idx.length - 1] !== br.pts.length - 1) idx.push(br.pts.length - 1);
  const pts = idx.map(i => br.pts[i]), rad = idx.map(i => br.rad[i]);
  const n = pts.length;
  const T = pts.map((p, i) => pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize());
  let N = perp(T[0]);
  const uRep = Math.max(1, Math.round((2 * Math.PI * rad[0]) / BARK_U));
  let vAcc = br.v0;
  const rows = [];
  const flare = br.flare || 0, ph = br.v0 * 1.7;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const ax = T[i - 1].clone().cross(T[i]); const s = ax.length();
      if (s > 1e-6) N.applyAxisAngle(ax.multiplyScalar(1 / s), Math.atan2(s, T[i - 1].dot(T[i])));
      vAcc += pts[i].distanceTo(pts[i - 1]) / BARK_V;
    }
    const B = T[i].clone().cross(N).normalize(); N = B.clone().cross(T[i]).normalize();
    const row = [];
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const dir = N.clone().multiplyScalar(Math.cos(th)).addScaledVector(B, Math.sin(th));
      let r = rad[i];
      if (flare) {
        const lob = 0.5 + 0.5 * Math.cos(5 * th + ph);
        r *= 1 + flare * Math.exp(-Math.max(0, pts[i].y) / 0.42) * (0.3 + 0.7 * lob * lob);
      }
      const pos = pts[i].clone().addScaledVector(dir, r);
      const ao = env.aoBark(pos);
      row.push(M.v(pos, dir, (j / radial) * uRep, vAcc, [ao, ao, ao], env.wind(pos)));
    }
    rows.push(row);
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j], d = rows[i + 1][j + 1];
    M.tri(a, b, c); M.tri(b, d, c);
  }
}

// foliage card: bottom-centre attachment at P, growing along D, side S; V-folded and bent
function card(M, P, D, S, w, h, o, env) {
  const Nc = S.clone().cross(D).normalize();
  const rows = o.rows || 3, base = M.nv;
  for (let r = 0; r < rows; r++) {
    const lv = r / (rows - 1);
    for (let c = 0; c < 3; c++) {
      const lu = c * 0.5;
      const pos = P.clone().addScaledVector(D, lv * h).addScaledVector(S, (lu - 0.5) * w)
        .addScaledVector(Nc, Math.abs(lu - 0.5) * o.fold * w);
      pos.y -= (o.bend || 0) * lv * lv * h;
      const [u, v] = cellUV(o.cell, 0.02 + lu * 0.96, 0.012 + lv * 0.976);
      const ao = env.aoLeaf(pos, lv);
      M.v(pos, env.nLeaf(pos, Nc), u, v, [ao * o.tint[0], ao * o.tint[1], ao * o.tint[2]], env.wind(pos));
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    const a = base + r * 3;
    M.tri(a, a + 1, a + 3); M.tri(a + 1, a + 4, a + 3);
    M.tri(a + 1, a + 2, a + 4); M.tri(a + 2, a + 5, a + 4);
  }
}

// a card that follows a branch polyline (conifer sprays)
function stripCard(M, pts, S0, w, o, env) {
  const base = M.nv, n = pts.length;
  for (let r = 0; r < n; r++) {
    const lv = r / (n - 1);
    const d = pts[Math.min(n - 1, r + 1)].clone().sub(pts[Math.max(0, r - 1)]).normalize();
    const S = S0.clone().addScaledVector(d, -S0.dot(d)).normalize();
    const Nc = S.clone().cross(d).normalize();
    for (let c = 0; c < 3; c++) {
      const lu = c * 0.5;
      const pos = pts[r].clone().addScaledVector(S, (lu - 0.5) * w).addScaledVector(Nc, Math.abs(lu - 0.5) * o.fold * w);
      const [u, v] = cellUV(o.cell, 0.02 + lu * 0.96, 0.012 + lv * 0.976);
      const ao = env.aoLeaf(pos, lv);
      M.v(pos, env.nLeaf(pos, Nc), u, v, [ao * o.tint[0], ao * o.tint[1], ao * o.tint[2]], env.wind(pos));
    }
  }
  for (let r = 0; r < n - 1; r++) {
    const a = base + r * 3;
    M.tri(a, a + 1, a + 3); M.tri(a + 1, a + 4, a + 3);
    M.tri(a + 1, a + 2, a + 4); M.tri(a + 2, a + 5, a + 4);
  }
}

// ------------------------------------------------------------------ species
const BROADLEAF = {
  oak: {
    bark: 'oak',
    trunk: { len: 6.4, segs: 8, r0: 0.31, r1: 0.07, gnarl: 0.045, lean: 0.06, flare: 0.65 },
    levels: [
      { n: [8, 10], t: [0.34, 0.95], angle: [38, 66], angleT: -22, len: [3.2, 4.2], lenT: 0.5, segs: 6, rRatio: 0.62, tip: 0.16, gnarl: 0.1, up: 0.14, droop: 0.03, phi: 'spiral', radial: 7 },
      { n: [7, 9], t: [0.12, 0.98], angle: [34, 60], len: [1.1, 1.8], lenT: 0.45, segs: 4, rRatio: 0.55, tip: 0.25, gnarl: 0.14, up: 0.06, droop: 0.08, phi: 'flat', radial: 4 },
    ],
    leaves: [{ level: 2, t: [0.15, 1.0], n: [4, 5] }, { level: 1, t: [0.45, 1.0], n: [3, 4] }],
    cells: [CELL.oakA, CELL.oakB], size: [0.95, 1.25], fold: 0.32, bend: 0.12, upBias: 0.35, hang: 0, radial0: 10,
  },
  birch: {
    bark: 'birch',
    trunk: { len: 9.6, segs: 10, r0: 0.17, r1: 0.025, gnarl: 0.022, lean: 0.05, flare: 0.35 },
    levels: [
      { n: [15, 19], t: [0.3, 0.97], angle: [32, 50], angleT: -12, len: [2.3, 3.0], lenT: 0.72, segs: 5, rRatio: 0.5, tip: 0.2, gnarl: 0.06, up: 0.03, droop: 0.32, phi: 'spiral', radial: 5 },
      { n: [4, 6], t: [0.3, 1.0], angle: [35, 70], len: [0.8, 1.3], lenT: 0.3, segs: 3, rRatio: 0.5, tip: 0.3, gnarl: 0.08, up: 0, droop: 0.9, phi: 'flat', radial: 3 },
    ],
    leaves: [{ level: 2, t: [0.25, 1.0], n: [2, 3] }, { level: 1, t: [0.45, 1.0], n: [2, 3] }],
    cells: [CELL.birchA, CELL.birchB], size: [0.85, 1.1], fold: 0.25, bend: 0.22, upBias: -0.05, hang: 0.5, radial0: 9,
  },
  blossom: {
    bark: 'fruit',
    trunk: { len: 2.3, segs: 4, r0: 0.25, r1: 0.16, gnarl: 0.05, lean: 0.08, flare: 0.5 },
    levels: [
      { n: [4, 5], t: [0.78, 1.0], angle: [30, 52], len: [3.3, 4.0], lenT: 0.1, segs: 6, rRatio: 0.75, tip: 0.15, gnarl: 0.1, up: 0.05, droop: 0.04, phi: 'spiral', radial: 7 },
      { n: [5, 7], t: [0.2, 0.98], angle: [35, 62], len: [1.2, 1.8], lenT: 0.4, segs: 4, rRatio: 0.55, tip: 0.25, gnarl: 0.12, up: 0.04, droop: 0.1, phi: 'flat', radial: 4 },
    ],
    leaves: [{ level: 2, t: [0.2, 1.0], n: [3, 4] }, { level: 1, t: [0.5, 1.0], n: [2, 3] }],
    cells: [CELL.blossomA, CELL.blossomB], size: [1.15, 1.5], fold: 0.3, bend: 0.1, upBias: 0.3, hang: 0, radial0: 9,
  },
  apple: {
    bark: 'fruit',
    trunk: { len: 1.8, segs: 3, r0: 0.18, r1: 0.11, gnarl: 0.07, lean: 0.1, flare: 0.4 },
    levels: [
      { n: [5, 6], t: [0.55, 1.0], angle: [40, 62], len: [2.3, 2.9], lenT: 0.25, segs: 5, rRatio: 0.72, tip: 0.18, gnarl: 0.14, up: 0.14, droop: 0.06, phi: 'spiral', radial: 6 },
      { n: [5, 7], t: [0.15, 0.98], angle: [40, 70], len: [0.9, 1.35], lenT: 0.35, segs: 3, rRatio: 0.55, tip: 0.3, gnarl: 0.15, up: 0.05, droop: 0.12, phi: 'flat', radial: 4 },
    ],
    leaves: [{ level: 2, t: [0.15, 1.0], n: [3, 4] }, { level: 1, t: [0.4, 1.0], n: [3, 3] }],
    cells: [CELL.appleA, CELL.appleB], size: [0.85, 1.05], fold: 0.3, bend: 0.1, upBias: 0.25, hang: 0.05, radial0: 8,
  },
  bush: {
    bark: 'fruit',
    trunk: null,
    stems: { n: [7, 9], angle: [10, 58], len: [0.85, 1.3], segs: 4, r0: 0.028, tip: 0.3, gnarl: 0.12, up: 0.05, droop: 0.22, radial: 3 },
    levels: [
      null, // level 1 = the stems above
      { n: [2, 3], t: [0.35, 0.9], angle: [35, 60], len: [0.35, 0.6], lenT: 0.2, segs: 2, rRatio: 0.6, tip: 0.4, gnarl: 0.12, up: 0, droop: 0.2, phi: 'flat', radial: 3 },
    ],
    leaves: [{ level: 1, t: [0.2, 1.0], n: [4, 5] }, { level: 2, t: [0.3, 1.0], n: [1, 2] }],
    cells: [CELL.bushA], size: [0.55, 0.78], fold: 0.35, bend: 0.1, upBias: 0.45, hang: 0, radial0: 3,
  },
};

function makeEnv(cards, H, kind) {
  // crown ellipsoid from the card centres
  const bb = new THREE.Box3();
  for (const c of cards) bb.expandByPoint(c.P.clone().addScaledVector(c.D, c.h * 0.5));
  const C = bb.getCenter(v3()), Rv = bb.getSize(v3()).multiplyScalar(0.5).addScalar(0.35);
  const Rh = Math.max(Rv.x, Rv.z);
  const ell = (p) => { const q = p.clone().sub(C); return Math.sqrt((q.x / Rv.x) ** 2 + (q.y / Rv.y) ** 2 + (q.z / Rv.z) ** 2); };
  return {
    C, Rv, H,
    wind: (p) => Math.pow(clamp01(p.y / H), 1.3) * 0.85 + clamp01(Math.hypot(p.x, p.z) / Rh) * 0.25,
    nLeaf: (p, Nc) => {
      const q = p.clone().sub(C);
      const g = v3(q.x / (Rv.x * Rv.x), q.y / (Rv.y * Rv.y), q.z / (Rv.z * Rv.z));
      if (g.lengthSq() < 1e-8) g.copy(UP); g.normalize();
      const nc = Nc.dot(g) < 0 ? Nc.clone().negate() : Nc.clone();
      return nc.multiplyScalar(0.28).addScaledVector(g, 0.72).normalize();
    },
    aoLeaf: (p) => {
      const e = ell(p);
      return lerp(kind === 'bush' ? 0.64 : 0.58, 1.0, sstep(0.15, 1.0, e)) * lerp(0.84, 1.0, sstep(C.y - Rv.y, C.y + Rv.y * 0.5, p.y));
    },
    aoBark: (p) => {
      const e = ell(p);
      return lerp(0.62, 1.0, sstep(0.35, 1.15, e)) * lerp(0.66, 1.0, sstep(-0.1, 0.7, p.y));
    },
  };
}

function genBroadleaf(kind, seed, cellOverride) {
  const sp = BROADLEAF[kind];
  const R = mulberry32(seed);
  const branches = [];
  const spawn = (parent, level) => {
    const L = sp.levels[level - 1];
    if (!L) return;
    const n = ri(R, L.n);
    let phi = R() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const tl = (k + 0.15 + R() * 0.7) / n;
      const t = lerp(L.t[0], L.t[1], tl);
      const s = at(parent, t);
      if (L.phi === 'spiral') phi += 2.39996 + (R() - 0.5) * 0.5;
      else phi = (k % 2 ? 1 : -1) * (Math.PI * 0.5 - 0.35 + (R() - 0.5) * 0.7);
      const alpha = (rr(R, L.angle) + (L.angleT || 0) * (tl - 0.5)) * DEG;
      const d = childDir(s.d, phi, alpha);
      const len = rr(R, L.len) * (1 - (L.lenT || 0) * tl);
      const r0 = Math.max(0.012, s.r * L.rRatio);
      const br = grow(s.p.clone().addScaledVector(d, -s.r * 0.3), d, len, L.segs, L, R, r0, Math.max(0.006, r0 * L.tip));
      br.level = level; br.radial = L.radial;
      branches.push(br);
      spawn(br, level + 1);
    }
  };
  if (sp.trunk) {
    const tk = sp.trunk;
    const d0 = v3((R() - 0.5) * 2 * tk.lean, 1, (R() - 0.5) * 2 * tk.lean).normalize();
    const trunk = grow(v3(0, -0.25, 0), d0, tk.len * (0.92 + R() * 0.16), tk.segs, { gnarl: tk.gnarl, taperPow: 0.75 }, R, tk.r0, tk.r1);
    trunk.level = 0; trunk.radial = sp.radial0; trunk.flare = tk.flare;
    branches.push(trunk);
    spawn(trunk, 1);
  } else {
    const st = sp.stems, n = ri(R, st.n);
    let phi = R() * 6.28;
    for (let k = 0; k < n; k++) {
      phi += 2.39996 + (R() - 0.5) * 0.6;
      const d = childDir(UP, phi, rr(R, st.angle) * DEG);
      const p0 = v3(Math.cos(phi) * 0.06 * R(), -0.08, Math.sin(phi) * 0.06 * R());
      const br = grow(p0, d, rr(R, st.len), st.segs, st, R, st.r0, st.r0 * st.tip);
      br.level = 1; br.radial = st.radial;
      branches.push(br);
      spawn(br, 2);
    }
  }
  // foliage card specs
  const cells = cellOverride != null ? [cellOverride] : sp.cells;
  const cards = [];
  for (const rule of sp.leaves) for (const br of branches) {
    if (br.level !== rule.level) continue;
    const n = ri(R, rule.n);
    for (let k = 0; k <= n; k++) {
      const t = k === n ? 1 : lerp(rule.t[0], rule.t[1], (k + R() * 0.8) / n);
      const s = at(br, t);
      const out = v3(s.p.x, 0, s.p.z); if (out.lengthSq() < 1e-4) out.set(R() - 0.5, 0, R() - 0.5); out.normalize();
      const D = s.d.clone().multiplyScalar(0.55).addScaledVector(out, 0.45).addScaledVector(UP, sp.upBias)
        .add(v3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.9)).normalize();
      if (sp.hang) D.lerp(v3(0, -1, 0), sp.hang * (0.6 + 0.4 * R())).normalize();
      const S = D.clone().cross(v3(R() - 0.5, R() - 0.5, R() - 0.5).normalize()).normalize();
      const size = rr(R, sp.size) * (k === n ? 0.85 : 1);
      const tv = 0.92 + R() * 0.12;
      cards.push({ P: s.p, D, S, w: size, h: size, cell: cells[Math.floor(R() * cells.length)], tint: [tv * (0.97 + R() * 0.06), tv, tv * (0.92 + R() * 0.1)], r: R() });
    }
  }
  let H = 0;
  for (const b of branches) for (const p of b.pts) H = Math.max(H, p.y);
  for (const c of cards) H = Math.max(H, c.P.y + c.h * Math.max(0, c.D.y));
  const env = makeEnv(cards, H, kind);
  const build = (lo) => {
    const bark = new MeshData(), leaf = new MeshData();
    for (const b of branches) {
      if (lo && b.level > 1) continue;
      const radial = lo ? Math.max(3, Math.round(b.radial * 0.55)) : b.radial;
      tube(bark, b, radial, env, lo && b.level > 0 ? 2 : 1);
    }
    for (const c of cards) {
      if (lo && c.r > 0.38) continue;
      const k = lo ? 1.55 : 1;
      card(leaf, c.P, c.D, c.S, c.w * k, c.h * k, { cell: c.cell, fold: sp.fold, bend: lo ? sp.bend * 0.7 : sp.bend, rows: lo ? 2 : 3, tint: c.tint }, env);
    }
    return { bark: bark.geo(), leaf: leaf.geo() };
  };
  return { hi: build(false), lo: build(true), H, R: Math.max(env.Rv.x, env.Rv.z), C: env.C, bark: sp.bark };
}

function genSpruce(seed) {
  const R = mulberry32(seed);
  const H = 11.2 + R() * 1.6;
  const trunk = grow(v3(0, -0.25, 0), v3((R() - 0.5) * 0.04, 1, (R() - 0.5) * 0.04).normalize(), H + 0.25, 12, { gnarl: 0.01, taperPow: 0.85 }, R, 0.27, 0.02);
  trunk.level = 0; trunk.radial = 8; trunk.flare = 0.45;
  const branches = [trunk], sprays = [];
  let y = 1.0 + R() * 0.3, wPhi = R() * 6.28;
  while (y < H - 0.55) {
    const t = y / H, rel = 1 - t;
    const nb = rel < 0.16 ? 4 : 5 + (R() < 0.5 ? 1 : 0);
    wPhi += 0.6 + R() * 0.6;
    const s = at(trunk, (y + 0.25) / (H + 0.25));
    for (let b = 0; b < nb; b++) {
      const phi = wPhi + (b / nb) * 6.2832 + (R() - 0.5) * 0.55;
      const L = (0.32 + 3.25 * Math.pow(rel, 0.9)) * (0.85 + R() * 0.3);
      const elev = lerp(-0.4, 0.32, Math.pow(t, 0.85)) + (R() - 0.5) * 0.14;
      const d = v3(Math.cos(phi) * Math.cos(elev), Math.sin(elev), Math.sin(phi) * Math.cos(elev));
      const br = grow(s.p, d, L, 3, { gnarl: 0.035, up: 0.02 + t * 0.06, droop: lerp(0.26, 0.04, t) }, R, lerp(0.055, 0.016, t), 0.007);
      br.level = 1; br.radial = 3;
      // spruce branch tips curl upward slightly
      const tip = br.pts[3]; tip.y += L * 0.06;
      branches.push(br);
      const side = v3(-d.z, 0, d.x).normalize();
      const tv = 0.9 + R() * 0.14;
      sprays.push({ br, L, w: 0.42 + L * 0.42, S: side, cell: R() < 0.5 ? CELL.spruceA : CELL.spruceB, t, r: R(), tint: [tv * 0.97, tv, tv * (0.95 + R() * 0.08)], roll: (R() < 0.5 ? 1 : -1) * (0.9 + R() * 0.35) });
    }
    y += 0.34 + R() * 0.12;
  }
  const Rmax = 3.6;
  const env = {
    H,
    wind: (p) => Math.pow(clamp01(p.y / H), 1.3) * 0.85 + clamp01(Math.hypot(p.x, p.z) / Rmax) * 0.25,
    nLeaf: (p, Nc) => {
      const out = v3(p.x, 0, p.z); if (out.lengthSq() < 1e-6) out.set(1, 0, 0); out.normalize();
      const g = out.multiplyScalar(0.78).addScaledVector(UP, 0.62).normalize();
      const nc = Nc.dot(g) < 0 ? Nc.clone().negate() : Nc.clone();
      return nc.multiplyScalar(0.3).addScaledVector(g, 0.7).normalize();
    },
    aoLeaf: (p, lv) => lerp(0.48, 1.0, Math.pow(lv, 0.7)) * lerp(0.72, 1.0, clamp01(p.y / H)),
    aoBark: (p) => lerp(0.42, 0.85, clamp01(Math.hypot(p.x, p.z) / 2.5)) * lerp(0.65, 1.0, sstep(-0.1, 0.8, p.y)),
  };
  const build = (lo) => {
    const bark = new MeshData(), leaf = new MeshData();
    tube(bark, trunk, lo ? 5 : 8, env, lo ? 2 : 1);
    if (!lo) for (const b of branches) if (b.level === 1) tube(bark, b, 3, env);
    for (const s of sprays) {
      const pts = lo ? [s.br.pts[0], s.br.pts[3]] : s.br.pts;
      stripCard(leaf, pts, s.S, s.w * (lo ? 1.2 : 1), { cell: s.cell, fold: 0.18, tint: s.tint }, env);
      if (!lo && s.L > 0.7) {
        const d = s.br.pts[3].clone().sub(s.br.pts[0]).normalize();
        const S2 = s.S.clone().applyAxisAngle(d, s.roll);
        stripCard(leaf, s.br.pts, S2, s.w * 0.85, { cell: s.cell === CELL.spruceA ? CELL.spruceB : CELL.spruceA, fold: 0.15, tint: s.tint }, env);
      }
    }
    // leader spire
    const top = at(trunk, 1).p;
    const nTop = lo ? 2 : 3;
    for (let k = 0; k < nTop; k++) {
      const a = (k / nTop) * Math.PI + 0.3;
      card(leaf, top.clone().add(v3(0, -1.5, 0)), UP, v3(Math.cos(a), 0, Math.sin(a)), 0.8, 1.8, { cell: CELL.spruceA, fold: 0.1, bend: 0, rows: 2, tint: [0.95, 1, 0.97] }, env);
    }
    return { bark: bark.geo(), leaf: leaf.geo() };
  };
  return { hi: build(false), lo: build(true), H: H + 0.3, R: Rmax, C: v3(0, H * 0.45, 0), bark: 'spruce' };
}

export const BUSH_CELLS = [CELL.bushA, CELL.bushWhite, CELL.bushPink, CELL.bushBlue];

export function buildTreeLibrary() {
  const t0 = performance.now();
  const lib = {};
  for (const kind of ['oak', 'birch', 'blossom', 'apple']) lib[kind] = [0, 1, 2].map(v => genBroadleaf(kind, 1000 + v * 101 + kind.length * 7919));
  lib.pine = [0, 1, 2].map(v => genSpruce(5000 + v * 77));
  lib.bush = BUSH_CELLS.map((c, v) => genBroadleaf('bush', 9000 + v * 31, c));
  lib.ms = performance.now() - t0;
  return lib;
}

// ---------------------------------------------------------------- dead wood
// Cut ends: procedural tree-ring texture (heartwood/sapwood, growth rings, drying cracks, bark rim).
let _rings = null;
export function ringTexture() {
  if (_rings) return _rings;
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S), d = img.data;
  const R = mulberry32(77);
  const cracks = Array.from({ length: 5 }, () => ({ a: R() * Math.PI * 2, len: 0.35 + R() * 0.5, w: 0.012 + R() * 0.02 }));
  const wob = Array.from({ length: 6 }, () => ({ k: 2 + Math.floor(R() * 5), ph: R() * 6.28, a: 0.004 + R() * 0.01 }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S * 2 - 1, v = (y + 0.5) / S * 2 - 1;
    const th = Math.atan2(v, u);
    let r = Math.hypot(u + 0.06, v - 0.04);                      // pith slightly off-centre
    for (const w of wob) r += w.a * Math.sin(w.k * th + w.ph);
    const ring = r * 22, f = ring - Math.floor(ring);
    const late = sstep(0.62, 0.86, f) * (1 - sstep(0.9, 1.0, f)); // dark latewood band
    const heart = 1 - sstep(0.42, 0.62, r);
    let cr = lerp(0.80, 0.66, heart), cg = lerp(0.64, 0.47, heart), cb = lerp(0.44, 0.30, heart);
    const k = 1 - 0.28 * late;
    cr *= k; cg *= k; cb *= k;
    // weathering towards grey + grain noise
    const n = (Math.sin(u * 91 + v * 37) * Math.sin(u * 23 - v * 71) + Math.sin(th * 40 + r * 9) * 0.5) * 0.04;
    const gk = 0.38 + 0.12 * sstep(0.3, 0.9, r);
    cr = lerp(cr, 0.5, gk) * 0.92 + n; cg = lerp(cg, 0.46, gk) * 0.92 + n; cb = lerp(cb, 0.41, gk) * 0.92 + n;
    for (const c of cracks) {
      let da = Math.abs(((th - c.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const wdt = c.w * (1 - r / 1.2);
      if (r > 1 - c.len && r < 0.93 && da * r < wdt) { const q = 1 - da * r / wdt; cr *= 1 - 0.65 * q; cg *= 1 - 0.65 * q; cb *= 1 - 0.65 * q; }
    }
    // cambium + bark rim
    const rim = sstep(0.86, 0.9, r), bark = sstep(0.92, 0.95, r);
    cr = lerp(lerp(cr, 0.5, rim * 0.6), 0.26, bark); cg = lerp(lerp(cg, 0.36, rim * 0.6), 0.2, bark); cb = lerp(lerp(cb, 0.24, rim * 0.6), 0.15, bark);
    const i = (y * S + x) * 4;
    d[i] = Math.max(0, Math.min(255, cr * 255)); d[i + 1] = Math.max(0, Math.min(255, cg * 255)); d[i + 2] = Math.max(0, Math.min(255, cb * 255)); d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return (_rings = tex);
}

// disc cap (ring texture) at C facing N, radius from rf(theta)
function cap(M, C, N, rf, radial, aoC = 0.9) {
  const A = perp(N), B = N.clone().cross(A).normalize();
  const c0 = M.v(C, N, 0.5, 0.5, [aoC, aoC, aoC], 0);
  const ring = [];
  for (let j = 0; j <= radial; j++) {
    const th = (j / radial) * Math.PI * 2, r = rf(th);
    const dir = A.clone().multiplyScalar(Math.cos(th)).addScaledVector(B, Math.sin(th));
    ring.push(M.v(C.clone().addScaledVector(dir, r), N, 0.5 + 0.47 * Math.cos(th), 0.5 + 0.47 * Math.sin(th), [aoC, aoC, aoC], 0));
  }
  for (let j = 0; j < radial; j++) M.tri(c0, ring[j], ring[j + 1]);
}

const MOSS = [0.62, 0.95, 0.34];
// fallen log lying along x (centre at origin), mossy on top; returns { bark, cap } geometries
export function genLog(len, r, seed = 1) {
  const R = mulberry32(seed), radial = 14;
  const segs = Math.max(4, Math.round(len / 0.35));
  const pts = [], rad = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(v3(-len / 2 + t * len, Math.sin(t * 3.1 + seed) * 0.03, Math.sin(t * 2.3 + seed * 2) * 0.05));
    rad.push(r * (1.04 - 0.08 * t + 0.03 * Math.sin(t * 9 + seed)));
  }
  const M = new MeshData();
  const env = {
    aoBark: (p) => 0.62 + 0.38 * sstep(-r, r * 0.6, p.y),
    wind: () => 0,
  };
  tube(M, { pts, rad, segs, v0: R() * 4, flare: 0 }, radial, env);
  // moss: tint upward-facing bark
  for (let k = 0; k < M.nv; k++) {
    const ny = M.n[k * 3 + 1], x = M.p[k * 3];
    const m = sstep(0.25, 0.85, ny + 0.25 * Math.sin(x * 3.7 + seed) * Math.sin(x * 1.3));
    for (let c = 0; c < 3; c++) M.c[k * 3 + c] *= lerp(1, MOSS[c] * 1.25, m * 0.85);
  }
  const C = new MeshData();
  const t0 = pts[1].clone().sub(pts[0]).normalize(), t1 = pts[segs].clone().sub(pts[segs - 1]).normalize();
  cap(C, pts[0], t0.negate(), () => rad[0], radial);
  cap(C, pts[segs], t1, () => rad[segs], radial);
  return { bark: M.geo(), cap: C.geo() };
}

// tree stump with root flare and a slanted, ring-textured cut
export function genStump(seed = 1) {
  const R = mulberry32(seed), radial = 16;
  const H = 0.5, r0 = 0.36, r1 = 0.31;
  const pts = [], rad = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(v3(0, -0.18 + t * (H + 0.18), 0)); rad.push(lerp(r0, r1, t)); }
  const M = new MeshData(), v0 = R() * 4, flare = 0.7;
  tube(M, { pts, rad, segs: 5, v0, flare }, radial, { aoBark: (p) => 0.6 + 0.4 * sstep(-0.1, 0.4, p.y), wind: () => 0 });
  // slanted cut: shift top-row vertices
  const tilt = 0.06;
  for (let k = 0; k < M.nv; k++) if (M.p[k * 3 + 1] > H - 0.01) M.p[k * 3 + 1] += M.p[k * 3] * tilt;
  for (let k = 0; k < M.nv; k++) {
    const ny = M.n[k * 3 + 1], y = M.p[k * 3 + 1];
    const m = sstep(0.0, 0.2, -y + 0.12) * 0.6 * (0.5 + 0.5 * Math.sin(Math.atan2(M.p[k * 3 + 2], M.p[k * 3]) * 3 + seed));
    for (let c = 0; c < 3; c++) M.c[k * 3 + c] *= lerp(1, MOSS[c] * 1.25, m);
    void ny;
  }
  const C = new MeshData();
  const n = v3(-tilt, 1, 0).normalize();
  // same radius profile as the tube's top ring (root-flare lobes)
  const ph = v0 * 1.7, fk = flare * Math.exp(-H / 0.42);
  cap(C, v3(0, H, 0), n, (th) => { const lob = 0.5 + 0.5 * Math.cos(5 * th + ph); return r1 * (1 + fk * (0.3 + 0.7 * lob * lob)); }, radial);
  return { bark: M.geo(), cap: C.geo() };
}
