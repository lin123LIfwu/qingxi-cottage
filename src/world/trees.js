// Instanced realistic trees & bushes with per-frame LOD / culling.
// Each (species, variant) owns a high- and a low-detail InstancedMesh pair (bark + foliage
// sharing one instance buffer).  Every frame the trees inside the shadow area or close to
// the camera go to the detailed set, the rest of the visible ones to the light set.
import * as THREE from 'three';
import { patchVeg } from './wind.js';
import { TEX } from '../gen/texgen.js';
import { ATLAS } from '../gen/leafgen.js';
import { buildTreeLibrary } from '../gen/treegen.js';

const LODQ = { low: { hi: 30, shadowR: 36 }, medium: { hi: 44, shadowR: 40 }, high: { hi: 60, shadowR: 44 } };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);

export class TreeField {
  constructor(U, trees, bushes) {
    this.group = new THREE.Group(); this.group.name = 'trees';
    this.q = LODQ.medium;
    const lib = this.lib = buildTreeLibrary();
    const W = { attr: 'aWind', amp: 0.2, freq: 0.9, occlude: true };
    this.leafMat = patchVeg(new THREE.MeshStandardMaterial({ map: ATLAS.tex, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.8, metalness: 0 }), U, { ...W, flutter: 0.016, trans: 0.6, sss: 0.035, noflip: true, alphaSharp: true });
    this.leafDepth = patchVeg(new THREE.MeshDepthMaterial({ map: ATLAS.tex, alphaTest: 0.5, side: THREE.DoubleSide }), U, { ...W, flutter: 0.016, alphaSharp: true });
    this.barkDepth = patchVeg(new THREE.MeshDepthMaterial(), U, { ...W, flutter: 0 });
    this.barkMats = {};
    for (const name of Object.keys(TEX.bark)) {
      const b = TEX.bark[name];
      this.barkMats[name] = patchVeg(new THREE.MeshStandardMaterial({ map: b.map, normalMap: b.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), vertexColors: true, roughness: 0.9, metalness: 0 }), U, { ...W, flutter: 0, trans: 0 });
    }
    this.sets = [];
    const byKey = new Map();
    const push = (kind, it) => { const k = kind + '|' + it.v; let a = byKey.get(k); if (!a) { a = []; byKey.set(k, a); } a.push(it); };
    for (const it of trees) push(it.kind, it);
    for (const it of bushes) push('bush', it);
    for (const [k, list] of byKey) {
      const [kind, vs] = k.split('|');
      const variants = lib[kind];
      const V = variants[(+vs) % variants.length];
      this.sets.push(this.makeSet(V, list));
    }
  }
  makeSet(V, list) {
    const n = list.length;
    const mk = (part, castShadow) => {
      const bark = new THREE.InstancedMesh(part.bark, this.barkMats[V.bark], n);
      const leaf = new THREE.InstancedMesh(part.leaf, this.leafMat, n);
      leaf.instanceMatrix = bark.instanceMatrix;
      bark.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      bark.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      bark.instanceColor.setUsage(THREE.DynamicDrawUsage);
      leaf.instanceColor = bark.instanceColor;
      for (const m of [bark, leaf]) {
        m.frustumCulled = false; m.castShadow = castShadow; m.receiveShadow = true; m.count = 0;
        this.group.add(m);
      }
      bark.customDepthMaterial = this.barkDepth; leaf.customDepthMaterial = this.leafDepth;
      return { bark, leaf, ids: new Int32Array(n).fill(-1), count: 0 };
    };
    const items = list.map((it, i) => {
      _q.setFromAxisAngle(UPV, it.rot); _s.setScalar(it.s); _p.set(it.x, it.y, it.z);
      _m.compose(_p, _q, _s);
      const tint = it.tint ?? 1;
      return {
        i, x: it.x, z: it.z, m: _m.toArray(new Float32Array(16)),
        c: [tint, tint * (0.98 + (i % 5) * 0.01), tint * 0.97],
        sphere: new THREE.Sphere(new THREE.Vector3(it.x, it.y + V.H * it.s * 0.5, it.z), Math.max(V.H * 0.55, V.R) * it.s + 0.5),
      };
    });
    return { V, items, hi: mk(V.hi, true), lo: mk(V.lo, false) };
  }
  setQuality(q) { this.q = LODQ[q] || LODQ.medium; }
  update(camera, focus, frustum) {
    const cam = camera.position, hiD2 = this.q.hi * this.q.hi, sR2 = this.q.shadowR * this.q.shadowR;
    for (const S of this.sets) {
      let nh = 0, nl = 0, dh = false, dl = false;
      const H = S.hi, L = S.lo;
      for (const it of S.items) {
        const fx = it.x - focus.x, fz = it.z - focus.z;
        const inSh = fx * fx + fz * fz < sR2;
        const inView = frustum.intersectsSphere(it.sphere);
        if (!inSh && !inView) continue;
        const dx = it.x - cam.x, dz = it.z - cam.z;
        if (inSh || dx * dx + dz * dz < hiD2) {
          if (H.ids[nh] !== it.i) { H.ids[nh] = it.i; H.bark.instanceMatrix.array.set(it.m, nh * 16); H.bark.instanceColor.array.set(it.c, nh * 3); dh = true; }
          nh++;
        } else {
          if (L.ids[nl] !== it.i) { L.ids[nl] = it.i; L.bark.instanceMatrix.array.set(it.m, nl * 16); L.bark.instanceColor.array.set(it.c, nl * 3); dl = true; }
          nl++;
        }
      }
      for (const [P, n, d] of [[H, nh, dh], [L, nl, dl]]) {
        if (d) { P.bark.instanceMatrix.needsUpdate = true; P.bark.instanceColor.needsUpdate = true; }
        if (P.count !== n) { P.count = n; P.bark.count = P.leaf.count = n; }
        P.bark.visible = P.leaf.visible = n > 0;
      }
    }
  }
}
