// First-person arms: the farmer's own skinned arms (skin and T-shirt sleeves, same textures),
// cut out of a second copy of the character (models.js) and posed with the third-person
// animator's two-bone IK, grip sockets and finger curls (human.js). So the hands seen in first
// person are the very hands of the character, holding the tools the same way.
import * as THREE from 'three';
import { Rig, ik2, alignQ, twist, makeArm, curlFingers } from './human.js';
import { clamp } from '../util/math.js';
import { farmerArmsModel } from '../assets/models.js';

const ARM_BONE = /^(upperarm|lowerarm|hand|thumb_0\d|index_0\d|middle_0\d|ring_0\d|pinky_0\d)_(l|r)$/;
// character space -> view-model space: turned round to look down -Z, with this point at the eyes
// (head centre, like the third-person camera's eye height)
const EYE = new THREE.Vector3(0, 1.58, 0);
// beyond this share of the arm's length the shoulder starts helping (up to CLAV_MAX radians)
const REACH = 0.86, CLAV_MAX = 0.4;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _l = new THREE.Vector3(), _h = new THREE.Vector3(), _pole = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _qx = new THREE.Quaternion(), _qi = new THREE.Quaternion();

// the triangles of a skinned mesh whose three corners are mostly (> 1/2) weighted to `bones`
// (attributes shared with the full mesh: only a new index buffer)
function cutGeometry(mesh, bones) {
  const g = mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, idx = g.index;
  const sel = mesh.skeleton.bones.map(b => bones.has(b.name));
  const n = si.count, w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < si.itemSize; c++) if (sel[si.getComponent(i, c)]) s += sw.getComponent(i, c);
    w[i] = s;
  }
  const out = [], m = idx ? idx.count : n;
  for (let t = 0; t < m; t += 3) {
    const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
    if (w[a] > 0.5 && w[b] > 0.5 && w[c] > 0.5) out.push(a, b, c);
  }
  if (!out.length) return null;
  const ng = new THREE.BufferGeometry();
  for (const k in g.attributes) ng.setAttribute(k, g.attributes[k]);
  ng.setIndex(out);
  return ng;
}

export class FPArms {
  // patch: material -> material (the view-model depth / shadow patch)
  constructor(patch) {
    const src = farmerArmsModel();
    const root = this.root = new THREE.Group(); root.name = 'fpArms';
    root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    root.position.copy(EYE).applyQuaternion(root.quaternion).negate();
    const farmer = src.getObjectByName('Farmer') || src;
    const R = this.R = new Rig(farmer);
    this.A = [makeArm(R, 0), makeArm(R, 1)];
    const sets = [new Set(), new Set()];
    for (const b of R.B) { const m = ARM_BONE.exec(b.name); if (m) sets[m[2] === 'l' ? 0 : 1].add(b.name); }
    // keep only the arms of the skin and the shirt (one mesh per side, so an idle arm can hide)
    const meshes = []; src.traverse(o => { if (o.isMesh) meshes.push(o); });
    const mats = new Map();
    this.meshes = [[], []];
    for (const o of meshes) {
      const par = o.parent, n = o.material.name;
      par.remove(o);
      if (!o.isSkinnedMesh || (n !== 'skin' && n !== 'clothes')) continue;
      let mat = mats.get(o.material);
      if (!mat) { mat = patch(o.material.clone()); mats.set(o.material, mat); }
      for (const k of [0, 1]) {
        const g = cutGeometry(o, sets[k]);
        if (!g) continue;
        const a = o.clone(); a.geometry = g; a.material = mat; a.name = o.name + (k ? '_armR' : '_armL');
        a.castShadow = false; a.receiveShadow = true; a.frustumCulled = false; a.visible = false;
        par.add(a); this.meshes[k].push(a);
      }
    }
    root.add(src);
    this.reachK = [0, 0];   // shoulder -> wrist distance over the arm's length (diagnostics)
  }
  // all four arm meshes on (for shader warm-up) / back to the last pose's visibility
  showAll(on) { for (const k of [0, 1]) for (const m of this.meshes[k]) m.visible = on || !!m.userData.on; }
  // Pose one arm (k: 0 left, 1 right) so its grip socket sits at h = {p, q, e: elbow hint} (view-
  // model rig space; socket frame as in human.js: +Y along a held handle, -Z where the fingers
  // point), fingers curled c / thumb th. h = null hides the arm. Returns the socket actually
  // reached (= h unless out of reach) in out.
  arm(k, h, c, th, out) {
    for (const m of this.meshes[k]) m.visible = m.userData.on = !!h;
    if (!h) return null;
    const A = this.A[k], R = this.R, G = R.G, rq = this.root.quaternion, rp = this.root.position;
    _qi.copy(rq).invert();
    const tp = _v.copy(h.p).sub(rp).applyQuaternion(_qi), tq = _q.copy(_qi).multiply(h.q);
    _qh.copy(tq).multiply(A.qlocI);                          // hand bone orientation
    _w.copy(A.ploc).applyQuaternion(_qh).negate().add(tp);   // wrist
    // a far reach brings the shoulder along: the clavicle swings towards the target (protraction /
    // elevation), as much as needed to keep the elbow from locking straight
    G[A.clav].identity(); R.fk(A.clav); R.fk(A.up);
    const S = R.P[A.up], C = R.P[A.clav], L = A.L1 + A.L2;
    const need = _w.distanceTo(S) - REACH * L;
    if (need > 0) {
      _u.subVectors(S, C); const lc = _u.length();
      _l.subVectors(_w, S); _h.crossVectors(_u, _l);
      if (_h.lengthSq() > 1e-12) {
        G[A.clav].setFromAxisAngle(_h.normalize(), Math.min(CLAV_MAX, need / lc));
        R.fk(A.up);
      }
    }
    this.reachK[k] = _w.distanceTo(S) / L;
    _pole.copy(h.e).sub(rp).applyQuaternion(_qi).sub(S);
    ik2(S, _w, A.L1, A.L2, _pole, A.E, A.Wr, A.a, A.b);
    _u.subVectors(A.E, S).normalize(); _l.subVectors(A.Wr, A.E).normalize(); _h.crossVectors(A.b, A.a).normalize();
    alignQ(G[A.up], A.u0, A.h0, _u, _h);
    alignQ(G[A.lo], A.l0, A.h0, _l, _h);
    // share the forearm roll between the forearm and the wrist (no twist bones in this rig)
    _qh.multiply(A.rQi);
    _qx.copy(G[A.lo]).invert().multiply(_qh);
    const tw = twist(_qx, A.l0);
    G[A.lo].multiply(_qx.setFromAxisAngle(A.l0, clamp(tw * 0.5, -1.4, 1.4)));
    G[A.hand].copy(_qh);
    curlFingers(G, A, c, th);
    if (out) {
      _qx.copy(G[A.hand]).multiply(R.rQ[A.hand]);
      out.p.copy(A.ploc).applyQuaternion(_qx).add(A.Wr).applyQuaternion(rq).add(rp);
      out.q.copy(h.q);
    }
    return out;
  }
  // after posing the arms: forward kinematics down every chain, then write the bones
  end() {
    const R = this.R;
    for (let i = 0; i < R.n; i++) R.fk(i);
    R.apply();
  }
}
