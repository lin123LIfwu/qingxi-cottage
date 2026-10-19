import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export function mat4(pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  _e.set(rot[0], rot[1], rot[2], 'YXZ');
  _q.setFromEuler(_e);
  if (typeof scale === 'number') _s.set(scale, scale, scale); else _s.set(scale[0], scale[1], scale[2]);
  return new THREE.Matrix4().compose(_p.set(pos[0], pos[1], pos[2]), _q, _s);
}

// Merges many primitive parts into one vertex-coloured geometry.
export class GeoBuilder {
  constructor(extra = []) { this.parts = []; this.extra = extra; }
  add(geo, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (o.matrix) g.applyMatrix4(o.matrix);
    else if (o.pos || o.rot || o.scale) g.applyMatrix4(mat4(o.pos, o.rot, o.scale ?? 1));
    const P = g.attributes.position.array, N = g.attributes.normal.array, n = P.length / 3;
    if (o.warp) for (let i = 0; i < n; i++) {
      const r = o.warp(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      if (r) { P[i * 3] = r[0]; P[i * 3 + 1] = r[1]; P[i * 3 + 2] = r[2]; }
    }
    if (o.warp && o.renormal) g.computeVertexNormals();
    if (o.sphere) {
      const { c, k } = o.sphere;
      for (let i = 0; i < n; i++) {
        let rx = P[i * 3] - c[0], ry = (P[i * 3 + 1] - c[1]) * (o.sphere.sy ?? 1), rz = P[i * 3 + 2] - c[2];
        const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
        let nx = N[i * 3] * (1 - k) + rx * k, ny = N[i * 3 + 1] * (1 - k) + ry * k, nz = N[i * 3 + 2] * (1 - k) + rz * k;
        const nl = Math.hypot(nx, ny, nz) || 1;
        N[i * 3] = nx / nl; N[i * 3 + 1] = ny / nl; N[i * 3 + 2] = nz / nl;
      }
    }
    const col = new Float32Array(n * 3);
    const base = new THREE.Color(o.color ?? '#ffffff');
    for (let i = 0; i < n; i++) {
      _c.copy(base);
      if (o.colorFn) o.colorFn(_c, P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const ea of this.extra) {
      const arr = new Float32Array(n);
      const v = o[ea];
      for (let i = 0; i < n; i++) arr[i] = typeof v === 'function' ? v(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]) : (v ?? 0);
      g.setAttribute(ea, new THREE.BufferAttribute(arr, 1));
    }
    this.parts.push(g);
    return this;
  }
  build() {
    const g = mergeGeometries(this.parts, false);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// noisy blob (for foliage / bushes / rocks)
export function blobGeo(r, detail, noise, amp = 0.18, seed = 0, flat = [1, 1, 1]) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const P = g.attributes.position.array;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    const k = 1 + amp * (noise(x * 1.3 / r + seed, y * 1.3 / r - seed) * 0.6 + noise(z * 1.7 / r - seed * 2, x * 1.7 / r + y) * 0.4);
    P[i] = x * k * flat[0]; P[i + 1] = y * k * flat[1]; P[i + 2] = z * k * flat[2];
  }
  g.computeVertexNormals();
  return g;
}

export function jitterColor(c, rnd, amt = 0.06) {
  const f = 1 + (rnd() - 0.5) * 2 * amt;
  c.r *= f; c.g *= f * (1 + (rnd() - 0.5) * amt * 0.5); c.b *= f;
  return c;
}
