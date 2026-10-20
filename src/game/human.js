// Procedural animation for the skinned farmer (MakeHuman "game engine" skeleton, built in
// models/character). There are no baked clips: every frame a small set of pose channels —
// pelvis, spine, head, clavicles, feet, arm angles, hand / tool targets — is built from layers
// (idle / gait / air, the carried tool, keyframed or procedural actions), cross-faded whenever
// the layer stack changes, and then solved onto the bones: two-bone IK for arms and legs, a
// heel / ball roll model for the feet, and finger curls for the grips.
//
// Character space = the 'Farmer' node: +Z forward, +X the character's left, +Y up, feet at y=0.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, damp } from '../util/math.js';

const TAU = Math.PI * 2, PI = Math.PI;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), q4 = () => new THREE.Quaternion();
const AX = v3(1, 0, 0), AY = v3(0, 1, 0), AZ = v3(0, 0, 1), DOWN = v3(0, -1, 0);
const _e = new THREE.Euler(), _mA = new THREE.Matrix4(), _mB = new THREE.Matrix4();
const _f1 = v3(), _f2 = v3(), _f3 = v3();

export function qYXZ(out, y, x, z) { return out.setFromEuler(_e.set(x, y, z, 'YXZ')); }
function perp(out, a) {
  if (Math.abs(a.x) < 0.9) out.set(1, 0, 0); else out.set(0, 1, 0);
  return out.addScaledVector(a, -out.dot(a)).normalize();
}
// unit part of v orthogonal to the unit vector a
export function orth(out, v, a) {
  out.copy(v).addScaledVector(a, -v.dot(a));
  if (out.lengthSq() < 1e-10) return perp(out, a);
  return out.normalize();
}
function frame(m, d, p) {
  _f1.copy(d).normalize(); orth(_f2, p, _f1); _f3.crossVectors(_f1, _f2);
  return m.makeBasis(_f1, _f2, _f3);
}
// the rotation taking direction d0 onto d1, and p0 (its part orthogonal to d0) onto p1's
export function alignQ(out, d0, p0, d1, p1) {
  frame(_mA, d0, p0); frame(_mB, d1, p1);
  return out.setFromRotationMatrix(_mB.multiply(_mA.transpose()));
}
// signed twist angle of q about the unit axis
export function twist(q, a) {
  const s = q.w < 0 ? -1 : 1;
  return 2 * Math.atan2(s * (q.x * a.x + q.y * a.y + q.z * a.z), s * q.w);
}
const herm = (p0, m0, p1, m1, s) => {
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (3 * s2 - 2 * s3) * p1 + (s3 - s2) * m1;
};
// piecewise curve through [x, y] points, eased between them
function curve(T, x) {
  if (x <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (x <= T[i][0]) {
    const a = T[i - 1], b = T[i], s = (x - a[0]) / (b[0] - a[0]);
    return a[1] + (b[1] - a[1]) * s * s * (3 - 2 * s);
  }
  return T[T.length - 1][1];
}
function table(T, x) {
  if (x <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const a = T[i - 1], b = T[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
  return T[T.length - 1][1];
}
const frac = x => x - Math.floor(x);

// ---------------------------------------------------------------- tool / hand orientations
// A grip target is a frame whose +Y runs along the handle (for a bare hand: the thumb side)
// and whose -Z is the tool's working direction (bare hand: where the fingers point).
// Angles: e = elevation of +Y above the horizon, a = its azimuth (+ towards the character's
// left), r = roll about +Y. e = a = r = 0: handle pointing forward, working end down.
const Q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(v3(-1, 0, 0), v3(0, 0, 1), v3(0, 1, 0)));
const _qa = q4(), _qb = q4();
function toolQ(out, e, a, r) {
  qYXZ(out, a, -e, 0).multiply(Q0);
  return out.multiply(_qb.setFromAxisAngle(AY, r));
}
// (e, a, r) for a frame given by its +Y (u) and -Z (w) directions, picking the equivalent
// triple nearest to `ref` so keyframes interpolate the short way round
function toolAngles(u, w, ref) {
  const U = v3(...u).normalize(), W = orth(v3(), v3(...w), U);
  const e = Math.asin(clamp(U.y, -1, 1)), a = Math.atan2(U.x, U.z);
  const w0 = v3(0, -Math.cos(e), Math.sin(e)).applyAxisAngle(AY, a);
  const r = Math.atan2(v3().crossVectors(w0, W).dot(U), w0.dot(W));
  const cands = [[e, a, r], [PI - e, a + PI, r + PI]];
  let best = cands[0], bd = 1e9;
  for (const c of cands) {
    if (ref) { c[1] = ref[1] + Math.atan2(Math.sin(c[1] - ref[1]), Math.cos(c[1] - ref[1])); c[2] = ref[2] + Math.atan2(Math.sin(c[2] - ref[2]), Math.cos(c[2] - ref[2])); }
    const d = ref ? Math.abs(c[0] - ref[0]) + Math.abs(c[1] - ref[1]) + Math.abs(c[2] - ref[2]) : (c === cands[0] ? 0 : 1);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// ---------------------------------------------------------------- skeleton
export class Rig {
  constructor(root) {
    this.root = root;
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), m = new THREE.Matrix4(), s = v3();
    const B = []; root.traverse(o => { if (o.isBone) B.push(o); });
    this.B = B; this.n = B.length; this.ix = {};
    B.forEach((b, i) => { this.ix[b.name] = i; });
    this.par = B.map(b => (b.parent && b.parent.isBone) ? this.ix[b.parent.name] : -1);
    this.rP = []; this.rQ = []; this.P = []; this.Q = []; this.G = []; this.pp = [];
    B.forEach((b, i) => {
      const p = v3(), q = q4();
      m.multiplyMatrices(inv, b.matrixWorld).decompose(p, q, s);
      this.rP.push(p); this.rQ.push(q); this.P.push(p.clone()); this.Q.push(q.clone()); this.G.push(q4());
      if (this.par[i] < 0) { const P = v3(), Q = q4(); m.multiplyMatrices(inv, b.parent.matrixWorld).decompose(P, Q, s); this.pp[i] = { p: P, q: Q }; }
    });
    this._q = q4();
  }
  i(n) { const k = this.ix[n]; if (k === undefined) throw new Error('bone ' + n); return k; }
  // place bone i from its parent's pose (positions follow the parent's rotation)
  fk(i) {
    const p = this.par[i];
    if (p < 0) this.P[i].copy(this.rP[i]);
    else this.P[i].subVectors(this.rP[i], this.rP[p]).applyQuaternion(this.G[p]).add(this.P[p]);
  }
  apply() {
    const q = this._q;
    for (let i = 0; i < this.n; i++) {
      const b = this.B[i], p = this.par[i];
      this.Q[i].multiplyQuaternions(this.G[i], this.rQ[i]);
      const PQ = p >= 0 ? this.Q[p] : this.pp[i].q, PP = p >= 0 ? this.P[p] : this.pp[i].p;
      q.copy(PQ).invert();
      b.quaternion.multiplyQuaternions(q, this.Q[i]);
      b.position.subVectors(this.P[i], PP).applyQuaternion(q);
    }
  }
}

// two-bone IK: shoulder/hip S, target T, bone lengths, pole direction. Writes the joint E, the
// reached end W and the solve basis a (S->W) / b (towards the joint).
const _d = v3();
export function ik2(S, T, L1, L2, pole, E, W, a, b) {
  _d.subVectors(T, S);
  let d = _d.length();
  if (d < 1e-6) a.set(0, -1, 0); else a.copy(_d).multiplyScalar(1 / d);
  d = clamp(d, Math.abs(L1 - L2) + 1e-3, (L1 + L2) * 0.9995);
  orth(b, pole, a);
  const c = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), s = Math.sqrt(1 - c * c);
  E.copy(S).addScaledVector(a, c * L1).addScaledVector(b, s * L1);
  W.copy(S).addScaledVector(a, d);
}

// ---------------------------------------------------------------- pose channels
// pelvis offset (m) / pitch / yaw / roll; spine bend (split over the three spine bones); head in
// character space (the neck follows halfway); clavicle up / forward; per foot: sole point under
// the ankle, yaw, roll pitch (+ heel up, - toes up), toe bend, knee-out; per arm: FK angles
// (flexion, abduction, inward twist, elbow, pronation, wrist flex / deviation), finger curl,
// thumb, IK weight, elbow pole (chest frame); the right hand's grip target (tool frame, weight
// tw over the carry pose), the left hand's explicit target, and left-hand-on-tool (lt at lg
// along the handle, rolled lq) / on-the-reel-knob (lk) weights.
const CH = ['dx', 'dy', 'dz', 'pp', 'py', 'pr', 'sp', 'sy', 'sr', 'hp', 'hy', 'hr', 'cu0', 'cf0', 'cu1', 'cf1',
  'f0x', 'f0y', 'f0z', 'f0r', 'f0p', 'f0t', 'k0', 'f1x', 'f1y', 'f1z', 'f1r', 'f1p', 'f1t', 'k1',
  'a0fl', 'a0ab', 'a0tw', 'a0el', 'a0pr', 'a0wf', 'a0wd', 'a0c', 'a0th', 'a0w',
  'a1fl', 'a1ab', 'a1tw', 'a1el', 'a1pr', 'a1wf', 'a1wd', 'a1c', 'a1th', 'a1w',
  'e0x', 'e0y', 'e0z', 'e1x', 'e1y', 'e1z',
  'tx', 'ty', 'tz', 'te', 'ta', 'tr', 'tw', 'lx', 'ly', 'lz', 'le', 'la', 'lr', 'lt', 'lg', 'lq', 'lk'];
const DEF = {
  f0x: .12, f0z: .025, f0r: .14, k0: .04, f1x: -.12, f1z: -.035, f1r: -.12, k1: .04,
  a0fl: .03, a0ab: .09, a0tw: .05, a0el: .2, a0pr: .35, a0wf: .08, a0c: .3, a0th: .25,
  a1fl: .03, a1ab: .09, a1tw: .05, a1el: .2, a1pr: .35, a1wf: .08, a1c: .3, a1th: .25,
  e0x: .5, e0y: -.75, e0z: -.45, e1x: -.5, e1y: -.75, e1z: -.45,
};
for (const k of CH) if (DEF[k] === undefined) DEF[k] = 0;
// target channels whose implicit start key copies the first keyed value (their blend in is
// done by a weight channel instead: tw, a0w / a1w)
const GROUP = new Set(['tx', 'ty', 'tz', 'te', 'ta', 'tr', 'lx', 'ly', 'lz', 'le', 'la', 'lr']);

class Pose {
  constructor() { this.c = { ...DEF }; this.TP = v3(); this.TQ = q4(); this.LP = v3(); this.LQ = q4(); }
  copy(o) { Object.assign(this.c, o.c); this.TP.copy(o.TP); this.TQ.copy(o.TQ); this.LP.copy(o.LP); this.LQ.copy(o.LQ); return this; }
  // blend towards o; targets a side does not use (zero weight) borrow the other side's
  blend(o, k) {
    const a = this.c, b = o.c;
    const rA = a.a1w > 1e-3, rB = b.a1w > 1e-3, lA = a.a0w > 1e-3, lB = b.a0w > 1e-3, tA = a.lt > 1e-3, tB = b.lt > 1e-3;
    if (!rA && rB) { this.TP.copy(o.TP); this.TQ.copy(o.TQ); } else if (rB) { this.TP.lerp(o.TP, k); this.TQ.slerp(o.TQ, k); }
    if (!lA && lB) { this.LP.copy(o.LP); this.LQ.copy(o.LQ); } else if (lB) { this.LP.lerp(o.LP, k); this.LQ.slerp(o.LQ, k); }
    const lg = !tA && tB ? b.lg : tA && !tB ? a.lg : a.lg + (b.lg - a.lg) * k;
    const lq = !tA && tB ? b.lq : tA && !tB ? a.lq : a.lq + (b.lq - a.lq) * k;
    for (const n of CH) a[n] += (b[n] - a[n]) * k;
    a.lg = lg; a.lq = lq;
    return this;
  }
}

// ---------------------------------------------------------------- keyframed actions
// keys: [u, {channel: value | U/W (or LU/LW): direction vectors for the target frames}, stop]
// Values carry over to later keys; before a channel's first key it follows the layer below
// (target channels: their own first key). Cubic Hermite with monotone tangents; stop keys
// have zero velocity.
function compile(keys) {
  let refT = null, refL = null;
  const K = keys.map(([u, ch, stop]) => {
    const c = { ...ch };
    if (c.U) { [c.te, c.ta, c.tr] = toolAngles(c.U, c.W, refT); delete c.U; delete c.W; }
    if (c.te !== undefined) refT = [c.te, c.ta ?? (refT ? refT[1] : 0), c.tr ?? (refT ? refT[2] : 0)];
    if (c.LU) { [c.le, c.la, c.lr] = toolAngles(c.LU, c.LW, refL); delete c.LU; delete c.LW; }
    if (c.le !== undefined) refL = [c.le, c.la ?? (refL ? refL[1] : 0), c.lr ?? (refL ? refL[2] : 0)];
    return { u, c, stop: !!stop };
  });
  const lead = K[0].u > 0;
  const times = lead ? [0, ...K.map(k => k.u)] : K.map(k => k.u);
  const stops = lead ? [true, ...K.map(k => k.stop)] : K.map(k => k.stop);
  const chans = [...new Set(K.flatMap(k => Object.keys(k.c)))], tr = {};
  for (const n of chans) {
    const vals = lead ? [NaN] : []; let last = NaN;
    for (const k of K) { if (k.c[n] !== undefined) last = k.c[n]; vals.push(last); }
    if (GROUP.has(n)) { const first = vals.find(x => !isNaN(x)); for (let i = 0; i < vals.length && isNaN(vals[i]); i++) vals[i] = first; }
    tr[n] = vals;
  }
  return { times, stops, chans, tr, val: new Float64Array(times.length) };
}
function evalTrack(K, u, C) {
  const t = K.times, n = t.length, V = K.val;
  let i = 0;
  while (i < n - 2 && u > t[i + 1]) i++;
  const h = n > 1 ? t[i + 1] - t[i] : 1, s = n > 1 ? clamp((u - t[i]) / h, 0, 1) : 0;
  for (const c of K.chans) {
    const src = K.tr[c];
    for (let j = 0; j < n; j++) V[j] = isNaN(src[j]) ? C[c] : src[j];
    if (n === 1) { C[c] = V[0]; continue; }
    const tan = j => {
      if (j <= 0 || j >= n - 1 || K.stops[j]) return 0;
      const d0 = (V[j] - V[j - 1]) / (t[j] - t[j - 1]), d1 = (V[j + 1] - V[j]) / (t[j + 1] - t[j]);
      if (d0 * d1 <= 0) return 0;
      const m = (V[j + 1] - V[j - 1]) / (t[j + 1] - t[j - 1]), lim = 3 * Math.min(Math.abs(d0), Math.abs(d1));
      return clamp(m, -lim, lim);
    };
    C[c] = herm(V[i], tan(i) * h, V[i + 1], tan(i + 1) * h, s);
  }
}

// how each tool sits in the right hand: the hand's pose in the tool frame [x, y, z, rx, ry, rz]
// (Euler YXZ) — the same grips as the first-person view model
const GRIP = { hoe: [0, 0, 0, 0, -.35, 0], can: [0, .016, 0, -PI / 2, 0, 0], rod: [0, 0, 0, 0, .25, 0], seeds: [0, -.005, 0, 0, 1.25, 0] };
// carry poses (chest frame: character-space numbers for the rest pose; they ride on the torso)
const CARRY = {
  hoe: { p: [-.14, 1.15, .35], U: [-.08, .65, -.75], W: [0, -1, 0], c: .8, th: .65, pole: [-.5, -.75, -.4], sw: .02 },
  can: { p: [-.3, .84, .04], U: [0, 1, 0], W: [0, 0, 1], c: .85, th: .5, pole: [-.45, -.4, -.8], sw: .07 },
  rod: { p: [-.2, 1.02, .28], U: [-.05, .6, .8], W: [0, -1, 0], c: .74, th: .55, pole: [-.5, -.75, -.4], sw: .025 },
  seeds: { p: [-.16, 1.0, .3], U: [0, 1, 0], W: [0, 0, -1], c: .5, th: .75, pole: [-.5, -.75, -.4], sw: .025 },
};
for (const k in CARRY) { const c = CARRY[k]; [c.e, c.a, c.r] = toolAngles(c.U, c.W, null); c.P = v3(...c.p); c.E = v3(...c.pole).normalize(); }

const ACT = {
  hoe: [
    [.30, { tx: -.2, ty: 1.56, tz: .16, te: 2.4, ta: -.25, tr: 0, tw: 1, lt: 1, lg: -.1, sp: -.06, pp: -.02, hp: .1,
      f0z: .14, f1z: -.14, f1r: -.3, a0c: .8, a0th: .65, e1x: -.6, e1y: -.3, e1z: .1, e0x: .6, e0y: -.3, e0z: .1 }],
    [.45, { tx: -.1, ty: 1.05, tz: .36, te: .45, ta: -.05, sp: .3, pp: .14, hp: .4, dy: -.07 }],
    [.52, { tx: -.06, ty: .76, tz: .40, te: -.75, ta: 0, sp: .42, pp: .2, hp: .5, dy: -.1, e1x: -.5, e1y: -.7, e1z: -.5, e0x: .5, e0y: -.7, e0z: -.5 }, 1],
    [.68, { ty: .78, tz: .38, te: -.7 }, 1],
    [.86, { tx: -.1, ty: 1.0, tz: .34, te: .4, tr: 1.2, sp: .16, pp: .07, hp: .28, dy: -.03 }],
    [1, { tx: -.13, ty: 1.12, tz: .34, te: 1.9, tr: PI, sp: .05, pp: .02, hp: .12, dy: 0, lt: .3 }],
  ],
  water: [
    [.22, { tx: -.21, ty: .98, tz: .36, U: [0, .96, .28], W: [0, -.28, .96], tw: 1, sp: .1, hp: .35,
      e1x: -.6, e1y: -.7, e1z: -.3, a0ab: .25, a0fl: .12, a0el: .45 }],
    [.32, { U: [0, .78, .62], W: [0, -.62, .78], sp: .14, hp: .45 }],
    [.82, { ty: .96, U: [0, .76, .65], W: [0, -.65, .76] }],
    [.94, { ty: .98, U: [0, .97, .25], W: [0, -.25, .97], sp: .06, hp: .2 }],
  ],
  refill: [
    [.28, { dy: -.36, sp: .5, pp: .25, hp: .55, f0x: .16, f0z: .13, f1x: -.17, f1z: -.08, f1p: .25,
      tx: -.24, ty: .44, tz: .5, U: [0, .94, .34], W: [0, -.34, .94], tw: 1,
      a0w: 1, lx: .13, ly: .5, lz: .33, LU: [-1, 0, 0], LW: [0, -.5, .87], a0c: .45 }],
    [.42, { ty: .24, tz: .6, U: [0, .55, .83], W: [0, -.83, .55] }],
    [.64, { ty: .22, tz: .61, U: [0, .5, .86], W: [0, -.86, .5] }],
    [.8, { ty: .46, tz: .5, U: [0, .97, .25], W: [0, -.25, .97], dy: -.3 }],
  ],
  plant: [
    [.3, { dy: -.46, dz: -.04, sp: .5, pp: .32, hp: .65, f0x: .14, f0z: .2, f1x: -.15, f1z: -.24, f1p: .9, f1t: -.7, k1: .12,
      tx: -.12, ty: .42, tz: .48, U: [0, .2, .98], W: [0, -.98, .2], tw: 1,
      a0w: 1, lx: .06, ly: .14, lz: .5, LU: [-1, 0, 0], LW: [0, -.95, .3], a0c: .35, a0th: .3 }],
    [.42, { ly: .07 }],
    [.52, { ly: .07 }, 1],
    [.62, { ly: .16 }],
    [.86, { dy: -.2, sp: .25, pp: .14, hp: .4, ly: .4, lz: .4, ty: .7, tz: .4 }],
  ],
  harvest: [
    [.32, { dy: -.42, sp: .45, pp: .3, hp: .6, f0x: .16, f0z: .14, f1x: -.17, f1z: -.1, f1p: .3,
      a0w: 1, lx: .02, ly: .2, lz: .55, LU: [-1, 0, 0], LW: [0, -.8, .6], a0c: .35, a0th: .3 }],
    [.42, { ly: .16, a0c: .95, a0th: .75 }, 1],
    [.66, { ly: .6, lz: .44, dy: -.2, sp: .25, pp: .15, hp: .4 }],
    [.86, { ly: .78, lz: .36, dy: -.06, sp: .1, pp: .05, hp: .2 }],
  ],
  cast: [
    [.06, { tx: -.3, ty: 1.46, tz: .1, te: 2.05, ta: -.12, tr: 0, tw: 1, lt: 1, lg: -.22, py: .24, sy: .12, sp: -.03,
      f0z: .12, f1z: -.12, f1r: -.3, e1x: -.6, e1y: -.4, e1z: .1 }],
    [.45, { ty: 1.48, tz: .06, te: 2.2, py: .28, sy: .14, sp: -.05, hp: .05 }],
    [.6, { tx: -.18, ty: 1.2, tz: .42, te: .46, ta: -.04, py: -.15, sy: -.1, sp: .15, hp: .12 }],
    [.8, { tx: -.18, ty: 1.05, tz: .45, te: .3, py: -.1, sy: -.05, sp: .1 }],
    [1, { tx: -.18, ty: 1.02, tz: .42, te: .45, py: -.04, sy: 0, sp: .05, lt: 0 }],
  ],
  // the fishing-rod wind-up, keyed on the cast power instead of time
  charge: [
    [.3, { tx: -.28, ty: 1.4, tz: .14, te: 1.85, ta: -.12, tr: 0, tw: 1, lt: 1, lg: -.22, py: .16, sy: .08, sp: -.03,
      f0z: .12, f1z: -.12, f1r: -.3, e1x: -.6, e1y: -.4, e1z: .1 }],
    [1, { ty: 1.46, tz: .1, te: 2.05, py: .24, sy: .12 }],
  ],
  showfish: [
    [.16, { tx: -.15, ty: 1.86, tz: .16, U: [-1, 0, .05], W: [.3, 0, .95], tw: 1, a1w: 1,
      a0w: 1, lx: .15, ly: 1.86, lz: .16, LU: [1, 0, .05], LW: [-.3, 0, .95],
      a0c: .3, a1c: .3, a0th: .2, a1th: .2, hp: -.38, sp: -.06, e1x: -.8, e1y: -.3, e1z: 0, e0x: .8, e0y: -.3, e0z: 0 }],
    [.86, { hp: -.35 }],
    [1, { ty: 1.3, ly: 1.3, tz: .3, lz: .3, hp: 0, sp: 0 }],
  ],
};
{
  const side = {
    hoe: { tx: -.3, ty: .5, tz: .3, U: [-.05, 1, .1], W: [0, 0, 1] },
    rod: { tx: -.3, ty: .5, tz: .3, U: [-.1, .75, .65], W: [0, -.65, .75] },
    can: { tx: -.32, ty: .42, tz: .22, U: [0, 1, 0], W: [0, 0, 1] },
    seeds: { tx: -.2, ty: .55, tz: .38, U: [0, 1, 0], W: [0, 0, -1] },
  };
  for (const k in side) ACT['harvest_' + k] = ACT.harvest.map(([u, c, st], i) =>
    [u, i === 0 ? { ...c, ...side[k], tw: 1 } : i === ACT.harvest.length - 1 ? { ...c, tw: 0 } : c, st]);
}
for (const k in ACT) ACT[k] = compile(ACT[k]);

const CAD = [[0, 1.5], [.5, 1.55], [1.4, 1.9], [2.2, 2.2], [3.4, 2.7], [6, 3.05], [8, 3.2]];
const SWW = [[0, .55], [.35, .2], [.7, -.08], [1, -.26]], SWR = [[0, .85], [.3, .7], [.7, .1], [1, -.06]];
const bump = (u, pk) => Math.sin(PI * (u < pk ? .5 * u / pk : .5 + .5 * (u - pk) / (1 - pk)));
const CURL = [1.45, 1.65, 1.0], CMAX = [1.55, 1.8, 1.25], TCURL = [.55, .6, .7];
const FISHQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(v3(0, -1, 0), v3(-1, 0, 0), v3(0, 0, -1)));

// ---------------------------------------------------------------- arms (shared with the first-person view model)
// arm chain, grip socket and finger / thumb curl axes of one side (k: 0 = left, 1 = right)
export function makeArm(R, k) {
  const sf = k ? 'r' : 'l', s = k ? -1 : 1, rP = R.rP;
  const A = { k, s, clav: R.i('clavicle_' + sf), up: R.i('upperarm_' + sf), lo: R.i('lowerarm_' + sf), hand: R.i('hand_' + sf) };
  A.L1 = rP[A.lo].distanceTo(rP[A.up]); A.L2 = rP[A.hand].distanceTo(rP[A.lo]);
  A.u0 = v3().subVectors(rP[A.lo], rP[A.up]).normalize(); A.l0 = v3().subVectors(rP[A.hand], rP[A.lo]).normalize();
  A.h0 = v3().crossVectors(A.u0, A.l0).normalize();
  const f0 = v3().subVectors(rP[R.i('middle_01_' + sf)], rP[A.hand]).normalize();
  const t0 = v3().subVectors(rP[R.i('index_01_' + sf)], rP[R.i('pinky_01_' + sf)]).normalize();
  const X = v3().crossVectors(f0, t0).normalize();          // palmar (left) / dorsal (right)
  const palm = X.clone().multiplyScalar(s);
  A.f0 = f0; A.p0 = palm;
  // grip socket: +Y along a held handle (thumb side), -Z where the fingers point, origin in the fist
  const Ys = orth(v3(), v3().copy(t0).multiplyScalar(Math.cos(.3)).addScaledVector(f0, Math.sin(.3)), X);
  const Zs = v3().crossVectors(X, Ys);
  const qs = q4().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Ys, Zs));
  const ps = v3().copy(rP[A.hand]).addScaledVector(f0, .082).addScaledVector(palm, .03);
  A.rQi = R.rQ[A.hand].clone().invert();
  A.qloc = A.rQi.clone().multiply(qs); A.qlocI = A.qloc.clone().invert();
  A.ploc = ps.sub(rP[A.hand]).applyQuaternion(A.rQi);
  A.fingers = [['index', .8], ['middle', .93], ['ring', 1.07], ['pinky', 1.2]].map(([n, kk]) => {
    const j = [1, 2, 3].map(m => R.i(`${n}_0${m}_${sf}`));
    const ax = j.map((ji, m) => {
      const d = m < 2 ? v3().subVectors(rP[j[m + 1]], rP[ji]) : v3().subVectors(rP[ji], rP[j[m - 1]]);
      return v3().crossVectors(d.normalize(), palm).normalize();
    });
    return { j, k: kk, ax };
  });
  const tj = [1, 2, 3].map(m => R.i(`thumb_0${m}_${sf}`));
  const across = v3().copy(palm).multiplyScalar(.7).addScaledVector(t0, -.7).normalize();
  A.thumb = { j: tj, ax: tj.map((ji, m) => {
    const d = m < 2 ? v3().subVectors(rP[tj[m + 1]], rP[ji]) : v3().subVectors(rP[ji], rP[tj[m - 1]]);
    return v3().crossVectors(d.normalize(), across).normalize();
  }) };
  A.W = v3(); A.Wr = v3(); A.E = v3(); A.a = v3(); A.b = v3(); A.pole = v3(); A.Gh = q4();
  return A;
}

// curl the fingers (c) and thumb (th) of arm A round its grip, relative to the hand bone
export function curlFingers(G, A, c, th) {
  for (const F of A.fingers) {
    let par = G[A.hand];
    for (let m = 0; m < 3; m++) {
      const j = F.j[m];
      G[j].copy(par).multiply(_qx.setFromAxisAngle(F.ax[m], Math.min(CMAX[m], CURL[m] * c * F.k)));
      par = G[j];
    }
  }
  let par = G[A.hand];
  for (let m = 0; m < 3; m++) {
    const j = A.thumb.j[m];
    G[j].copy(par).multiply(_qx.setFromAxisAngle(A.thumb.ax[m], TCURL[m] * th));
    par = G[j];
  }
}

// ---------------------------------------------------------------- the animator
const _v = v3(), _v2 = v3(), _v3 = v3(), _u = v3(), _l = v3(), _h = v3(), _w = v3(), _p = v3(), _p2 = v3();
const _qS = q4(), _qU = q4(), _qF = q4(), _qH = q4(), _qT = q4(), _qT2 = q4(), _qc = q4(), _qx = q4(), _qy = q4();
const KNOBQ = new THREE.Quaternion().setFromAxisAngle(AZ, PI / 2);

export class Human {
  constructor(scene) {
    this.scene = scene;
    const root = this.root = scene.getObjectByName('Farmer') || scene;
    const R = this.rig = new Rig(root);
    this.ib = { root: R.i('Root'), pelvis: R.i('pelvis'), s1: R.i('spine_01'), s2: R.i('spine_02'), s3: R.i('spine_03'), neck: R.i('neck_01'), head: R.i('head') };
    this.arms = [0, 1].map(k => makeArm(R, k));
    this.legs = [0, 1].map(k => this.makeLeg(k));
    this.base = new Pose(); this.tmp = new Pose(); this.out = new Pose();
    this.sources = []; this.grips = {}; this.toolKey = 'none';
    this.t = 0; this.v = 0; this.vx = 0; this.vz = 1; this.ph = 0; this.gw = 0; this.runK = 0; this.aw = 0; this.drop = 0;
    this.airT = 0; this.landT = 9; this.landK = 0; this.vyLast = 0; this.yawRate = 0;
    this.gz = 0; this.gp = .04; this.gzT = 2; this.hy = 0; this.hp = .04;
    this.psi = [0, .5]; this.walkPhase = 0;
    this.crankA = 0; this.knob = null;
    this.fishHolder = new THREE.Group(); this.fishHolder.name = 'fishHolder'; root.add(this.fishHolder);
    this.TPa = v3(); this.TQa = q4(); this.toolOK = false;
    this.onStep = null; this.first = true;
  }

  makeLeg(k) {
    const R = this.rig, sf = k ? 'r' : 'l', s = k ? -1 : 1, rP = R.rP;
    const L = { k, s, th: R.i('thigh_' + sf), ca: R.i('calf_' + sf), ft: R.i('foot_' + sf), ball: R.i('ball_' + sf) };
    L.L1 = rP[L.ca].distanceTo(rP[L.th]); L.L2 = rP[L.ft].distanceTo(rP[L.ca]);
    L.u0 = v3().subVectors(rP[L.ca], rP[L.th]).normalize(); L.l0 = v3().subVectors(rP[L.ft], rP[L.ca]).normalize();
    L.h0 = orth(v3(), AX, L.u0);
    L.ankH = rP[L.ft].y;                                  // ankle height over the sole
    L.ballZ = rP[L.ball].z - rP[L.ft].z + .02;            // roll-over line under the ball of the foot
    L.heelZ = -.06;
    L.A = v3(); L.H = v3(); L.E = v3(); L.W = v3(); L.a = v3(); L.b = v3(); L.pole = v3(); L.Gf = q4(); L.Gb = q4(); L.lift = 0;
    return L;
  }

  // put a tool model into the right hand (returns the holder; toggle its visibility to switch)
  holdTool(key, model) {
    const A = this.arms[1], g = GRIP[key] || [0, 0, 0, 0, 0, 0];
    const qg = q4().setFromEuler(_e.set(g[3], g[4], g[5], 'YXZ')), pg = v3(g[0], g[1], g[2]), qgi = qg.clone().invert();
    const w = new THREE.Group(); w.name = 'tool_' + key;
    w.quaternion.copy(A.qloc).multiply(qgi);
    w.position.copy(pg).applyQuaternion(qgi).negate().applyQuaternion(A.qloc).add(A.ploc);
    if (model) w.add(model);
    this.rig.B[A.hand].add(w);
    this.grips[key] = { p: pg, q: qg, qi: qgi };
    if (key === 'rod' && model) {
      const c = model.getObjectByName('Crank'), kb = model.getObjectByName('Knob');
      if (c && kb) this.knob = { crank: c, p: c.position.clone(), k: kb.position.clone() };
    }
    return w;
  }

  // st: {speed, vx, vz (character-space velocity), grounded, vy, yawRate, wade, action, u, tool,
  //      charge, lineOut, reelK, rodBend, fishSize, ground(x, z) -> height offset under a foot}
  update(dt, st) {
    if (dt <= 0 && !this.first) return;
    this.first = false;
    this.t += dt;
    this.toolKey = st.tool || 'none';
    this.locomotion(dt, st);
    this.updateSources(dt, st);
    const S = this.sources, out = this.out;
    for (let i = 0; i < S.length; i++) {
      if (i === 0) this.buildPose(S[i], out);
      else { this.buildPose(S[i], this.tmp); out.blend(this.tmp, smoothstep(0, 1, S[i].w)); }
    }
    if (this.knob) {
      if (st.action === 'fishing') this.crankA += dt * (st.reelK || 0) * 14;
      this.knob.crank.rotation.x = this.crankA;
    }
    this.solve(out, st, dt);
    this.placeFish();
    this.walkPhase = TAU * this.ph;
  }

  updateSources(dt, st) {
    const S = this.sources;
    const mode = st.action ? '' : (st.tool === 'rod' && st.lineOut) ? 'line' : (st.tool === 'rod' && st.charge > 0) ? 'charge' : '';
    const key = (st.action || '') + '|' + st.tool + '|' + mode;
    let cur = S[S.length - 1];
    if (!cur || cur.key !== key) {
      const prev = cur;
      const fade = !prev ? 0 : (st.action && st.action !== prev.action) ? .12 : (!st.action && prev.action) ? .25 : .2;
      cur = { key, action: st.action || null, tool: st.tool || 'none', mode, prm: { u: 0, charge: 0, reelK: 0, rodBend: 0, size: .3 }, w: fade > 0 ? 0 : 1, rate: fade > 0 ? 1 / fade : 0 };
      S.push(cur);
      if (S.length > 4) S.splice(0, S.length - 4);
    }
    const p = cur.prm;
    p.u = clamp(st.u || 0, 0, 1); p.charge = st.charge || 0; p.reelK = st.reelK || 0; p.rodBend = st.rodBend || 0;
    if (st.fishSize) p.size = st.fishSize;
    for (const s of S) if (s.w < 1) s.w = Math.min(1, s.w + dt * s.rate);
    for (let i = S.length - 1; i > 0; i--) if (S[i].w >= 1) { S.splice(0, i); break; }
  }

  // ------------------------------------------------------------ base layer: idle / gait / air
  locomotion(dt, st) {
    const C = this.base.c, t = this.t;
    Object.assign(C, DEF);
    const v = this.v = damp(this.v, st.grounded ? st.speed : this.v, 10, dt);
    if (st.speed > .05) {
      const l = Math.hypot(st.vx || 0, st.vz || 0);
      if (l > 1e-3) { this.vx = damp(this.vx, st.vx / l, 10, dt); this.vz = damp(this.vz, st.vz / l, 10, dt); }
    }
    const dl = Math.hypot(this.vx, this.vz) || 1, ax = this.vx / dl, az = this.vz / dl;
    const run = this.runK = damp(this.runK, smoothstep(2.0, 2.9, v), 6, dt);
    const gw = this.gw = damp(this.gw, smoothstep(.04, .45, v), 9, dt);
    const air = !st.grounded;
    if (air) this.airT += dt;
    else { if (this.airT > .22) { this.landT = 0; this.landK = clamp(-this.vyLast / 7, .35, 1); } this.airT = 0; }
    this.vyLast = st.vy || 0;
    const aw = this.aw = damp(this.aw, air && this.airT > .06 ? 1 : 0, air ? 9 : 16, dt);
    // gait cycle: phase 0 = left heel strike, right foot half a cycle later
    const cad = table(CAD, v);
    if (gw > .002) this.ph += dt * cad / 2;
    const ph = this.ph, c1 = Math.cos(TAU * ph), s1 = Math.sin(TAU * ph);
    const beta = lerp(lerp(.64, .6, clamp((v - .5) / 1.7, 0, 1)), lerp(.36, .25, clamp((v - 3.4) / 2.6, 0, 1)), run);
    const T = 2 / cad, travel = v * T * beta, kap = lerp(.45, .4, run), wade = st.wade || 0;
    const Hs = lerp(.06 + .03 * v + .12 * wade, Math.min(.4, .1 + .068 * Math.max(0, v - 2)), run), pk = lerp(.3, .35, run);
    const width = lerp(.075, .05, run), toeOut = lerp(.1, .05, run), pTO = lerp(.55, .85, run);
    const gwf = gw * (1 - aw);
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, psi = frac(ph + (k ? .5 : 0));
      let z, y = 0, p, toe;
      if (psi < beta) {                        // stance: the foot stays put on the ground
        const u = psi / beta;
        z = kap * travel - u * travel;
        const pW = u < .12 ? lerp(-.26, 0, smoothstep(0, .12, u)) : u > .55 ? .55 * Math.pow((u - .55) / .45, 1.4) : 0;
        const pR = u < .15 ? lerp(-.06, 0, smoothstep(0, .15, u)) : u > .45 ? .85 * Math.pow((u - .45) / .55, 1.3) : 0;
        p = lerp(pW, pR, run); toe = p > 0 ? -p : 0;
      } else {                                 // swing
        const u = (psi - beta) / (1 - beta), Tsw = T * (1 - beta);
        z = herm((kap - 1) * travel, -lerp(1, .2, run) * v * Tsw, kap * travel, -lerp(.3, .25, run) * v * Tsw, u);
        y = Hs * bump(u, pk);
        p = lerp(curve(SWW, u), curve(SWR, u), run);
        toe = -pTO * (1 - smoothstep(0, .3, u));
      }
      if (psi < this.psi[k] && gwf > .5 && this.onStep) this.onStep(k, run > .5);
      this.psi[k] = psi;
      const f = 'f' + k;
      C[f + 'x'] = lerp(C[f + 'x'], s * width + ax * z, gwf);
      C[f + 'z'] = lerp(C[f + 'z'], az * z, gwf);
      C[f + 'y'] = y * gwf; C[f + 'p'] = p * gwf; C[f + 't'] = toe * gwf;
      C[f + 'r'] = lerp(C[f + 'r'], s * toeOut, gwf);
    }
    // pelvis / spine: bob, sway, rotation and lean; idle weight shift and breathing
    const br = Math.sin(TAU * t / 4.4), ws = Math.sin(t * .45), ws2 = Math.sin(t * .31 + 1);
    const bob = lerp(-.035 + .016 * Math.cos(TAU * (2 * ph - beta)), -.04 - .024 * Math.cos(TAU * (2 * ph - beta)), run);
    C.dx = lerp(.014 * ws, lerp(.02, .008, run) * s1, gwf);
    C.dy = lerp(-.004 + .003 * br, bob, gwf);
    C.py = lerp(.03 * ws2, -lerp(.08, .06, run) * c1, gwf);
    C.pr = lerp(.018 * ws, lerp(.045, .02, run) * s1, gwf);
    C.pp = lerp(0, lerp(.02, .07, run), gwf);
    C.sp = lerp(.025 - .012 * br, lerp(.04 + .015 * v, .08 + .018 * v, run), gwf);
    C.sy = -1.7 * C.py; C.sr = -.5 * C.pr;
    C.cu0 = C.cu1 = .012 * br * (1 - gwf);
    // head: steady, idle glances
    this.gzT -= dt;
    if (this.gzT < 0) { this.gzT = 2.5 + Math.random() * 4; this.gz = Math.random() < .35 ? 0 : (Math.random() - .5) * 1.0; this.gp = .02 + Math.random() * .14; }
    const idle = (1 - gw) * (st.action ? 0 : 1);
    this.hy = damp(this.hy, this.gz * idle, 3, dt); this.hp = damp(this.hp, lerp(.05, this.gp, idle), 3, dt);
    C.hy = this.hy; C.hp = this.hp;
    // arms swing against the legs (walk: loose, run: bent elbows)
    const Aw = .12 + .11 * v, Ar = .3 + .04 * v;
    for (let k = 0; k < 2; k++) {
      const a = 'a' + k, sw = (k ? 1 : -1) * c1;
      C[a + 'fl'] = lerp(DEF.a0fl, lerp(.05 + Aw * sw, .12 + Ar * sw, run), gwf);
      C[a + 'el'] = lerp(DEF.a0el, lerp(.22 + .18 * Math.max(0, sw), 1.4 + .3 * sw, run), gwf);
      C[a + 'ab'] = lerp(DEF.a0ab, lerp(.1, .2, run), gwf);
      C[a + 'tw'] = lerp(DEF.a0tw, lerp(.1, .45, run), gwf);
      C[a + 'pr'] = lerp(DEF.a0pr, lerp(.35, .2, run), gwf);
      C[a + 'c'] = lerp(DEF.a0c, lerp(.32, .62, run), gwf);
      C[a + 'th'] = lerp(DEF.a0th, lerp(.25, .5, run), gwf);
    }
    // airborne: legs tuck on the way up, reach for the ground on the way down
    if (aw > .001) {
      const up = smoothstep(-3, 3, st.vy || 0), A = (n, x) => { C[n] += (x - C[n]) * aw; };
      A('f0x', .1); A('f0y', lerp(.1, .3, up)); A('f0z', lerp(.08, .16, up)); A('f0p', lerp(.15, .35, up)); A('f0t', 0); A('f0r', .1);
      A('f1x', -.1); A('f1y', lerp(.16, .4, up)); A('f1z', lerp(-.1, -.14, up)); A('f1p', lerp(.3, .6, up)); A('f1t', 0); A('f1r', -.1);
      A('a0fl', .35); A('a0ab', .4); A('a0el', .6); A('a1fl', .25); A('a1ab', .4); A('a1el', .6);
      A('sp', .07); A('dy', 0); A('py', 0); A('pr', 0); A('sy', 0);
    }
    if (this.landT < .6) {
      this.landT += dt;
      const x = this.landT / .09, d = x * Math.exp(1 - x) * this.landK;
      C.dy -= .1 * d; C.sp += .12 * d; C.hp += .05 * d;
    }
    // lean into turns, look where we turn
    this.yawRate = damp(this.yawRate, st.yawRate || 0, 8, dt);
    const lean = clamp(-.03 * this.yawRate * v, -.12, .12) * (1 - aw);
    C.pr += .6 * lean; C.sr += .4 * lean;
    C.hy += clamp(.1 * this.yawRate, -.35, .35);
  }

  // ------------------------------------------------------------ one layer stack -> pose
  buildPose(src, P) {
    P.copy(this.base);
    const C = P.c, prm = src.prm, tool = src.tool, carry = CARRY[tool];
    if (carry) { C.a1w = 1; C.a1c = carry.c; C.a1th = carry.th; C.e1x = carry.E.x; C.e1y = carry.E.y; C.e1z = carry.E.z; }
    let trk = null, u = 0;
    if (src.action && ACT[src.action]) { trk = ACT[src.action === 'harvest' ? ACT['harvest_' + tool] ? 'harvest_' + tool : 'harvest' : src.action]; u = prm.u; }
    else if (src.mode === 'charge') { trk = ACT.charge; u = prm.charge; }
    C.tw = 0;
    if (trk) evalTrack(trk, u, C);
    const fishing = tool === 'rod' && (src.action === 'fishing' || src.mode === 'line');
    if (fishing) this.fishingPose(C, prm);
    if (src.action === 'water' && u > .3 && u < .84) C.te += Math.sin(this.t * 13) * .045;
    if (src.action === 'plant' && u > .3 && u < .58) C.te += Math.sin(this.t * 34) * .12;
    if (src.action === 'showfish') {
      const hx = .06 + .3 * prm.size, b = Math.sin(clamp((u - .16) / .7, 0, 1) * PI * 4) * .025;
      C.tx = -hx; C.lx = hx; C.ty += b; C.ly += b;
    }
    // the carry pose rides on the torso as it is posed now
    this.chest(C, _p, _qc);
    if (carry && !fishing) {
      const sw = carry.sw * Math.cos(TAU * this.ph) * this.gw;
      _v.copy(carry.P); _v.z += sw;
      P.TP.copy(_v).sub(this.rig.rP[this.ib.s3]).applyQuaternion(_qc).add(_p);
      toolQ(P.TQ, carry.e + (tool === 'can' ? sw * 1.5 : 0), carry.a, carry.r).premultiply(_qc);
    }
    if (C.tw > 0 || fishing) {
      _v.set(C.tx, C.ty, C.tz); toolQ(_qT, C.te, C.ta, C.tr);
      if (carry && !fishing) { P.TP.lerp(_v, C.tw); P.TQ.slerp(_qT, C.tw); }
      else { P.TP.copy(_v); P.TQ.copy(_qT); }
    }
    if (C.a0w > 0) { P.LP.set(C.lx, C.ly, C.lz); toolQ(P.LQ, C.le, C.la, C.lr); }
  }

  // rod held out over the water, left hand on the reel; leans back as a fish pulls
  fishingPose(C, prm) {
    const b = prm.rodBend, r = prm.reelK, t = this.t;
    C.tx = -.18; C.ty = 1.0 + .16 * b; C.tz = .38 - .1 * b;
    C.te = .52 + .4 * b; C.ta = -.05 + Math.sin(t * 9) * .03 * r; C.tr = 0;
    C.tw = 1; C.a1w = 1; C.lk = 1; C.lt = 0;
    C.sp += -.05 - .1 * b; C.pp += -.04 * b; C.dy -= .03; C.hp = .15 - .05 * b;
    C.f0z = .12; C.f1z = -.1; C.f1r = -.25;
    C.e1x = -.5; C.e1y = -.75; C.e1z = -.35; C.e0x = .6; C.e0y = -.6; C.e0z = -.3;
    C.a0c = .55; C.a0th = .5;
  }

  // chest (spine_03) pose implied by the channels: position + rotation delta
  chest(C, outP, outQ) {
    const rP = this.rig.rP, ib = this.ib;
    qYXZ(_qx, C.py, C.pp, C.pr); qYXZ(_qS, C.sy, C.sp, C.sr);
    outP.set(rP[ib.pelvis].x + C.dx, rP[ib.pelvis].y + C.dy - this.drop, rP[ib.pelvis].z + C.dz);
    outP.add(_v2.subVectors(rP[ib.s1], rP[ib.pelvis]).applyQuaternion(_qx));
    outQ.copy(_qx).multiply(_qy.identity().slerp(_qS, .3));
    outP.add(_v2.subVectors(rP[ib.s2], rP[ib.s1]).applyQuaternion(outQ));
    outQ.copy(_qx).multiply(_qy.identity().slerp(_qS, .65));
    outP.add(_v2.subVectors(rP[ib.s3], rP[ib.s2]).applyQuaternion(outQ));
    outQ.copy(_qx).multiply(_qS);
  }

  // ------------------------------------------------------------ pose -> bones
  solve(Ps, st, dt) {
    const R = this.rig, G = R.G, P = R.P, rP = R.rP, C = Ps.c, ib = this.ib;
    G[ib.root].identity(); R.fk(ib.root);
    qYXZ(G[ib.pelvis], C.py, C.pp, C.pr);
    P[ib.pelvis].set(rP[ib.pelvis].x + C.dx, rP[ib.pelvis].y + C.dy, rP[ib.pelvis].z + C.dz);
    for (const L of this.legs) this.footTarget(L, C, st);
    // lower the hips rather than over-stretch a planted leg
    let need = 0;
    for (const L of this.legs) {
      L.H.subVectors(rP[L.th], rP[ib.pelvis]).applyQuaternion(G[ib.pelvis]).add(P[ib.pelvis]);
      if (L.lift > .03) continue;
      const dx = L.A.x - L.H.x, dz = L.A.z - L.H.z, h2 = dx * dx + dz * dz, Lm = (L.L1 + L.L2) * .985;
      if (h2 < Lm * Lm) need = Math.max(need, (L.H.y - L.A.y) - Math.sqrt(Lm * Lm - h2));
    }
    need = clamp(need, 0, .09) * (1 - this.aw);
    this.drop = Math.max(need, damp(this.drop, need, 10, dt));
    P[ib.pelvis].y -= this.drop;
    for (const L of this.legs) L.H.y -= this.drop;
    // spine, neck, head
    qYXZ(_qS, C.sy, C.sp, C.sr);
    G[ib.s1].copy(G[ib.pelvis]).multiply(_qy.identity().slerp(_qS, .3)); R.fk(ib.s1);
    G[ib.s2].copy(G[ib.pelvis]).multiply(_qy.identity().slerp(_qS, .65)); R.fk(ib.s2);
    G[ib.s3].copy(G[ib.pelvis]).multiply(_qS); R.fk(ib.s3);
    qYXZ(G[ib.head], C.hy, C.hp, C.hr);
    G[ib.neck].copy(G[ib.s3]).slerp(G[ib.head], .45); R.fk(ib.neck); R.fk(ib.head);
    for (const A of this.arms) {
      const cu = A.k ? C.cu1 : C.cu0, cf = A.k ? C.cf1 : C.cf0;
      qYXZ(_qx, -A.s * cf, 0, A.s * cu);
      G[A.clav].copy(G[ib.s3]).multiply(_qx); R.fk(A.clav); R.fk(A.up);
    }
    // right hand first: the left one may be holding on to its tool
    this.solveArm(this.arms[1], Ps);
    this.toolPose();
    this.solveArm(this.arms[0], Ps);
    for (const L of this.legs) this.solveLeg(L);
    for (let i = 0; i < R.n; i++) if (i !== ib.pelvis) R.fk(i);
    R.apply();
  }

  footTarget(L, C, st) {
    const f = 'f' + L.k, x = C[f + 'x'], z = C[f + 'z'], r = C[f + 'r'], p = C[f + 'p'];
    let y = C[f + 'y'];
    if (st.ground && this.aw < .999) y += clamp(st.ground(x, z) || 0, -.3, .3) * (1 - this.aw);
    // the foot rolls over the ball (heel up) or the heel (toes up)
    const pz = p >= 0 ? L.ballZ : L.heelZ, cp = Math.cos(p), sp = Math.sin(p);
    const oy = L.ankH * cp + pz * sp, oz = pz + L.ankH * sp - pz * cp;
    L.A.set(x + Math.sin(r) * oz, y + oy, z + Math.cos(r) * oz);
    qYXZ(L.Gf, r, p, 0);
    L.Gb.copy(L.Gf).multiply(_qx.setFromAxisAngle(AX, C[f + 't']));
    L.pole.set(Math.sin(r) + L.s * C['k' + L.k], 0, Math.cos(r));
    L.lift = C[f + 'y'];
  }

  solveLeg(L) {
    const G = this.rig.G;
    ik2(L.H, L.A, L.L1, L.L2, L.pole, L.E, L.W, L.a, L.b);
    _u.subVectors(L.E, L.H).normalize(); _l.subVectors(L.W, L.E).normalize(); _h.crossVectors(L.b, L.a).normalize();
    alignQ(G[L.th], L.u0, L.h0, _u, _h);
    alignQ(G[L.ca], L.l0, L.h0, _l, _h);
    G[L.ft].copy(L.Gf); G[L.ball].copy(L.Gb);
  }

  solveArm(A, Ps) {
    const R = this.rig, G = R.G, C = Ps.c, k = A.k, s = A.s, a = 'a' + k, Gc = G[this.ib.s3];
    const S = R.P[A.up];
    // forward kinematics from the arm angles (chest frame)
    _qU.setFromAxisAngle(AX, -C[a + 'fl']).multiply(_qx.setFromAxisAngle(AZ, s * C[a + 'ab'])).multiply(_qx.setFromAxisAngle(AY, -s * C[a + 'tw']));
    _qF.copy(_qU).multiply(_qx.setFromAxisAngle(AX, -C[a + 'el'])).multiply(_qx.setFromAxisAngle(AY, -s * C[a + 'pr']));
    _qH.copy(_qF).multiply(_qx.setFromAxisAngle(AX, C[a + 'wd'])).multiply(_qx.setFromAxisAngle(AZ, -s * C[a + 'wf']));
    _qU.premultiply(Gc); _qF.premultiply(Gc); _qH.premultiply(Gc);
    A.W.copy(S).addScaledVector(_v.copy(DOWN).applyQuaternion(_qU), A.L1).addScaledVector(_v2.copy(DOWN).applyQuaternion(_qF), A.L2);
    A.pole.set(0, 0, -1).applyQuaternion(_qU);
    alignQ(A.Gh, A.f0, A.p0, _v.copy(DOWN).applyQuaternion(_qH), _v2.set(-s, 0, 0).applyQuaternion(_qH));
    // IK targets, blended over the FK pose by their weights
    if (k === 1) {
      if (C.a1w > 1e-3) this.reach(A, Ps.TP, Ps.TQ, C.a1w, Gc, C.e1x, C.e1y, C.e1z, this.grips[this.toolKey]);
    } else {
      if (C.a0w > 1e-3) this.reach(A, Ps.LP, Ps.LQ, C.a0w, Gc, C.e0x, C.e0y, C.e0z, null);
      if (C.lt > 1e-3 && this.toolOK) {
        const g = this.grips[this.toolKey];
        _qT2.copy(this.TQa).multiply(_qx.setFromAxisAngle(AY, C.lq)).multiply(g.q);
        _p2.set(0, C.lg, 0).applyQuaternion(this.TQa).add(this.TPa);
        this.reach(A, _p2, _qT2, C.lt, Gc, C.e0x, C.e0y, C.e0z, null);
      }
      if (C.lk > 1e-3 && this.toolOK && this.knob && this.toolKey === 'rod') {
        const kb = this.knob;
        _p2.copy(kb.k).applyAxisAngle(AX, this.crankA).add(kb.p).applyQuaternion(this.TQa).add(this.TPa);
        _qT2.copy(this.TQa).multiply(KNOBQ);
        this.reach(A, _p2, _qT2, C.lk, Gc, C.e0x, C.e0y, C.e0z, null);
      }
    }
    ik2(S, A.W, A.L1, A.L2, A.pole, A.E, A.Wr, A.a, A.b);
    _u.subVectors(A.E, S).normalize(); _l.subVectors(A.Wr, A.E).normalize(); _h.crossVectors(A.b, A.a).normalize();
    alignQ(G[A.up], A.u0, A.h0, _u, _h);
    alignQ(G[A.lo], A.l0, A.h0, _l, _h);
    // share the forearm roll between the forearm and the wrist (no twist bones in this rig)
    _qx.copy(G[A.lo]).invert().multiply(A.Gh);
    const tw = twist(_qx, A.l0);
    G[A.lo].multiply(_qx.setFromAxisAngle(A.l0, clamp(tw * .5, -1.4, 1.4)));
    G[A.hand].copy(A.Gh);
    curlFingers(G, A, C[a + 'c'], C[a + 'th']);
  }

  // blend the arm towards placing its grip socket at (tp, tq) (a tool frame when grip is given)
  reach(A, tp, tq, w, Gc, ex, ey, ez, grip) {
    if (grip) { _qT.copy(tq).multiply(grip.q); _p.copy(grip.p).applyQuaternion(tq).add(tp); }
    else { _qT.copy(tq); _p.copy(tp); }
    _qc.copy(_qT).multiply(A.qlocI);                       // hand bone orientation
    _w.copy(A.ploc).applyQuaternion(_qc).negate().add(_p);  // wrist
    _qc.multiply(A.rQi);                                   // as a delta from the rest pose
    A.W.lerp(_w, w); A.Gh.slerp(_qc, w);
    A.pole.lerp(_v3.set(ex, ey, ez).normalize().applyQuaternion(Gc), w);
  }

  // where the right hand's tool actually is (after the arm solve)
  toolPose() {
    const A = this.arms[1], R = this.rig, g = this.grips[this.toolKey];
    this.toolOK = !!g;
    if (!g) return;
    _qx.copy(R.G[A.hand]).multiply(R.rQ[A.hand]);
    _qT.copy(_qx).multiply(A.qloc); _p.copy(A.ploc).applyQuaternion(_qx).add(A.Wr);
    this.TQa.copy(_qT).multiply(g.qi);
    this.TPa.copy(g.p).applyQuaternion(this.TQa).negate().add(_p);
  }

  // grip socket of a hand in character space
  socket(k, out) {
    const A = this.arms[k], R = this.rig;
    _qx.copy(R.G[A.hand]).multiply(R.rQ[A.hand]);
    return out.copy(A.ploc).applyQuaternion(_qx).add(R.P[A.hand]);
  }

  // a held-up fish sits on both hands
  placeFish() {
    const H = this.fishHolder;
    if (!H.children.length) return;
    this.socket(0, _v); this.socket(1, _v2);
    _v.add(_v2).multiplyScalar(.5); _v.y += .05;
    const w = H.children[0];
    H.quaternion.copy(FISHQ);
    H.position.copy(w.position).applyQuaternion(FISHQ).negate().add(_v);
  }
}
