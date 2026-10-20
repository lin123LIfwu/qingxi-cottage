import * as THREE from 'three';
import { WORLD_SIZE, WORLD_HALF, WORLD_SEG, HOME_H, POND, RIVER_PTS, DOCK } from '../config.js';
import { makeSimplex2, fbm, mulberry32 } from '../util/noise.js';
import { clamp, lerp, smoothstep, distToSegment2 } from '../util/math.js';
import { GLSL_NOISE, GLSL_CAUSTIC } from '../util/glsl.js';
import { glslColor } from '../util/color.js';
import { GLSL_MEADOW } from '../util/meadow.js';
import { TEX, GROUND_TILE } from '../gen/texgen.js';

const gauss = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * r * r));

export class Terrain {
  constructor(seed = 20241) {
    this.rand = mulberry32(seed);
    this.noise = makeSimplex2(this.rand);
    this.N = WORLD_SEG; this.V = WORLD_SEG + 1;
    this.size = WORLD_SIZE; this.half = WORLD_HALF; this.cell = WORLD_SIZE / WORLD_SEG;
    const n = this.V * this.V;
    this.h = new Float32Array(n);
    this.waterLv = new Float32Array(n).fill(-50);
    this.riverD = new Float32Array(n).fill(1e9);
    this.riverS = new Float32Array(n);
    this.ao = new Float32Array(n).fill(1);
    this.forest = new Float32Array(n);
    this.nrm = new Float32Array(n * 3);
    this.decks = [];
    this.buildRiver();
    this.rasterRiver();
    this.computeHeights();
    this.computeNormals();
    this.computeBridge();
    this.buildGroundMask();
  }

  // ---------------- river -----------------
  buildRiver() {
    const curve = new THREE.CatmullRomCurve3(RIVER_PTS.map(p => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal', 0.5);
    const total = curve.getLength();
    const n = Math.ceil(total / 1.2);
    const pts = curve.getSpacedPoints(n);
    const R = { pts: [], total };
    let s = 0;
    for (let i = 0; i <= n; i++) {
      const p = pts[i];
      if (i > 0) s += p.distanceTo(pts[i - 1]);
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)];
      const tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1;
      R.pts.push({ x: p.x, z: p.z, s, tx: tx / tl, tz: tz / tl });
    }
    R.total = s;
    this.river = R;
    // cascade location
    this.cascadeS0 = 64; this.cascadeS1 = 69.5;
    const cp = this.riverPointAt((this.cascadeS0 + this.cascadeS1) / 2);
    this.cascade = { x: cp.x, z: cp.z, tx: cp.tx, tz: cp.tz };
  }
  riverPointAt(s) {
    const P = this.river.pts;
    let lo = 0, hi = P.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s < s) lo = m; else hi = m; }
    const a = P[lo], b = P[hi]; const t = clamp((s - a.s) / (b.s - a.s || 1), 0, 1);
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), tx: lerp(a.tx, b.tx, t), tz: lerp(a.tz, b.tz, t) };
  }
  riverLevel(s) {
    const K = [[0, 11.0], [40, 7.6], [this.cascadeS0, 6.0], [this.cascadeS1, 3.4], [100, 1.65], [140, 0.78], [230, 0.42], [400, -1.2]];
    for (let i = 0; i < K.length - 1; i++) {
      if (s <= K[i + 1][0]) {
        let t = (s - K[i][0]) / (K[i + 1][0] - K[i][0]);
        t = clamp(t, 0, 1);
        if (i === 2) t = t * t * (3 - 2 * t);
        return lerp(K[i][1], K[i + 1][1], t);
      }
    }
    return K[K.length - 1][1];
  }
  riverHalfW(s) {
    const n = this.noise(s * 0.025, 3.7) * 0.5;
    if (s < this.cascadeS0) return 2.3 + n * 0.5;
    if (s < 110) return lerp(2.6, 3.5, smoothstep(this.cascadeS0, 110, s)) + n * 0.5;
    return 3.7 + n * 0.9;
  }
  riverDepth(s) {
    let d = s < this.cascadeS0 ? 0.75 : lerp(0.95, 1.45, smoothstep(this.cascadeS0, 130, s));
    d += 0.25 * this.noise(s * 0.05, 9.1);
    d += 0.9 * Math.exp(-((s - 74) ** 2) / 30); // plunge pool
    return d;
  }
  riverSpeed(s) {
    if (s < this.cascadeS0 - 2) return 1.7;
    if (s < this.cascadeS1 + 1) return 3.2;
    if (s < 110) return lerp(1.5, 0.75, smoothstep(this.cascadeS1, 110, s));
    return 0.62;
  }
  rasterRiver() {
    const P = this.river.pts, V = this.V, cell = this.cell, half = this.half;
    const RMAX = 46;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const minX = Math.min(a.x, b.x) - RMAX, maxX = Math.max(a.x, b.x) + RMAX;
      const minZ = Math.min(a.z, b.z) - RMAX, maxZ = Math.max(a.z, b.z) + RMAX;
      const ix0 = Math.max(0, Math.floor((minX + half) / cell)), ix1 = Math.min(V - 1, Math.ceil((maxX + half) / cell));
      const iz0 = Math.max(0, Math.floor((minZ + half) / cell)), iz1 = Math.min(V - 1, Math.ceil((maxZ + half) / cell));
      for (let iz = iz0; iz <= iz1; iz++) {
        const z = -half + iz * cell;
        for (let ix = ix0; ix <= ix1; ix++) {
          const x = -half + ix * cell;
          const r = distToSegment2(x, z, a.x, a.z, b.x, b.z);
          const idx = iz * V + ix;
          if (r.d2 < this.riverD[idx] * this.riverD[idx]) {
            this.riverD[idx] = Math.sqrt(r.d2);
            this.riverS[idx] = lerp(a.s, b.s, r.t);
          }
        }
      }
    }
  }

  // ---------------- heights -----------------
  pondR(ang) {
    return POND.r * (1 + 0.12 * Math.sin(3 * ang + 1.0) + 0.07 * Math.sin(5 * ang + 2.3) + 0.04 * Math.sin(7 * ang + 0.7));
  }
  pondD(x, z) {
    const dx = x - POND.x, dz = z - POND.z;
    return Math.hypot(dx, dz) / this.pondR(Math.atan2(dz, dx));
  }
  homeMask(x, z) {
    const dx = Math.max(-9.5 - x, 0, x - 19.5), dz = Math.max(-19.5 - z, 0, z + 2.0);
    return 1 - smoothstep(0, 7.5, Math.hypot(dx, dz));
  }
  baseHeight(x, z) {
    const N = this.noise;
    const n1 = fbm(N, x * 0.0105, z * 0.0105, 4);
    const n2 = fbm(N, x * 0.034 + 7.7, z * 0.034 - 3.1, 3);
    const n3 = N(x * 0.09 - 2.3, z * 0.09 + 5.5);
    let h = 1.7 + 0.3 * n2 + 0.12 * n3;
    const dHome = Math.hypot(x - 2, z + 9);
    const homeK = smoothstep(24, 52, dHome);
    const hillK = smoothstep(0.0, 0.5, n1);
    h += homeK * hillK * (5.0 + 2.5 * n2);
    h += 6.5 * gauss(x, z, -46, -46, 19) * (0.85 + 0.3 * n2);
    h += 4.5 * gauss(x, z, 50, 50, 17);
    h += 3.2 * gauss(x, z, -62, 12, 15);
    h += 3.0 * gauss(x, z, 18, -52, 14);
    const c = this.cascade;
    h += 5.0 * gauss(x, z, c.x, c.z, 12) * smoothstep(0, 1, 1);
    const r = Math.pow(Math.pow(Math.abs(x), 6) + Math.pow(Math.abs(z), 6), 1 / 6);
    const e = smoothstep(78, 124, r + 6 * n2);
    h += e * e * (26 + 10 * n1) + e * 5 * fbm(N, x * 0.05, z * 0.05, 3);
    return h;
  }
  carveRiver(h, d, s) {
    const L = this.riverLevel(s), w = this.riverHalfW(s), dep = this.riverDepth(s);
    let hb = h;
    const need = L + 0.5;
    if (hb < need) hb += (need - hb) * (1 - smoothstep(w + 2, w + 16, d));
    const bankW = 2.2 + Math.max(0, hb - L) * 1.1;
    if (d < w) {
      const bed = L - 0.1 - dep * smoothstep(w, w * 0.2, d) * (0.85 + 0.3 * (this.noise(d * 0.7, s * 0.2) * 0.5 + 0.5));
      return bed;
    }
    return lerp(L - 0.1, hb, smoothstep(w, w + bankW, d));
  }
  carvePond(h, x, z) {
    const d = this.pondD(x, z);
    if (d > 1.8) return h;
    const L = POND.level;
    const target = Math.max(h, L + 0.35);
    if (d < 1) {
      const prof = smoothstep(1.0, 0.25, d);
      const n = this.noise(x * 0.25, z * 0.25) * 0.5 + 0.5;
      return L - 0.08 - POND.depth * prof * (0.8 + 0.35 * n);
    }
    return lerp(L - 0.08, target, smoothstep(1.0, 1.8, d));
  }
  computeHeights() {
    const V = this.V, cell = this.cell, half = this.half, N = this.noise;
    for (let iz = 0; iz < V; iz++) {
      const z = -half + iz * cell;
      for (let ix = 0; ix < V; ix++) {
        const x = -half + ix * cell;
        const idx = iz * V + ix;
        let h = this.baseHeight(x, z);
        const hm = this.homeMask(x, z);
        if (hm > 0) h = lerp(h, HOME_H + 0.035 * N(x * 0.3, z * 0.3), hm);
        const d = this.riverD[idx];
        const s = this.riverS[idx];
        if (d < 46) h = this.carveRiver(h, d, s);
        h = this.carvePond(h, x, z);
        this.h[idx] = h;
        // water level grid
        if (d < this.riverHalfW(s) + 6) this.waterLv[idx] = this.riverLevel(s);
        if (this.pondD(x, z) < 1.6) this.waterLv[idx] = POND.level;
      }
    }
  }
  computeNormals() {
    const V = this.V, h = this.h, c2 = this.cell * 2;
    for (let iz = 0; iz < V; iz++) for (let ix = 0; ix < V; ix++) {
      const l = h[iz * V + Math.max(0, ix - 1)], r = h[iz * V + Math.min(V - 1, ix + 1)];
      const u = h[Math.max(0, iz - 1) * V + ix], d = h[Math.min(V - 1, iz + 1) * V + ix];
      let nx = (l - r) / c2, nz = (u - d) / c2, ny = 1;
      const len = Math.hypot(nx, ny, nz);
      const k = (iz * V + ix) * 3;
      this.nrm[k] = nx / len; this.nrm[k + 1] = ny / len; this.nrm[k + 2] = nz / len;
    }
  }

  // ---------------- queries -----------------
  heightAt(x, z) {
    const V = this.V, cell = this.cell;
    let fx = (x + this.half) / cell, fz = (z + this.half) / cell;
    fx = clamp(fx, 0, this.N - 1e-4); fz = clamp(fz, 0, this.N - 1e-4);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const a = this.h[iz * V + ix], b = this.h[iz * V + ix + 1], c = this.h[(iz + 1) * V + ix], d = this.h[(iz + 1) * V + ix + 1];
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }
  sampleGrid(arr, x, z) {
    const V = this.V, cell = this.cell;
    let fx = clamp((x + this.half) / cell, 0, this.N - 1e-4), fz = clamp((z + this.half) / cell, 0, this.N - 1e-4);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const a = arr[iz * V + ix], b = arr[iz * V + ix + 1], c = arr[(iz + 1) * V + ix], d = arr[(iz + 1) * V + ix + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }
  colorAt(x, z, out) {
    const V = this.V, cell = this.cell;
    const ix = Math.round(clamp((x + this.half) / cell, 0, this.N)), iz = Math.round(clamp((z + this.half) / cell, 0, this.N));
    const k = (iz * V + ix) * 3;
    return out.setRGB(this.col[k], this.col[k + 1], this.col[k + 2], THREE.LinearSRGBColorSpace);
  }
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 0.5;
    const l = this.heightAt(x - e, z), r = this.heightAt(x + e, z), u = this.heightAt(x, z - e), d = this.heightAt(x, z + e);
    return out.set(l - r, 2 * e, u - d).normalize();
  }
  waterLevelAt(x, z) {
    const V = this.V, cell = this.cell;
    const ix = Math.round(clamp((x + this.half) / cell, 0, this.N)), iz = Math.round(clamp((z + this.half) / cell, 0, this.N));
    return this.waterLv[iz * V + ix];
  }
  // returns {type, level, depth} or null
  waterAt(x, z) {
    const lv = this.waterLevelAt(x, z);
    if (lv < -40) return null;
    const h = this.heightAt(x, z);
    const depth = lv - h;
    if (depth <= 0) return null;
    const type = this.pondD(x, z) < 1.6 ? 'pond' : 'river';
    return { type, level: lv, depth };
  }
  riverInfo(x, z) {
    const d = this.sampleGrid(this.riverD, x, z);
    const V = this.V, cell = this.cell;
    const ix = Math.round(clamp((x + this.half) / cell, 0, this.N)), iz = Math.round(clamp((z + this.half) / cell, 0, this.N));
    const s = this.riverS[iz * V + ix];
    return { d, s, edge: d - this.riverHalfW(s) };
  }
  // walkable ground: terrain or decks. `ref` = the walker's current foot height: decks marked
  // `upper` (the house's first floor) only count for feet already near that floor, so people
  // downstairs are not lifted onto the floor above their heads. Without `ref` they never count.
  groundHeight(x, z, ref) {
    let h = this.heightAt(x, z);
    for (const dk of this.decks) {
      const dx = x - dk.cx, dz = z - dk.cz;
      const u = dx * dk.ax + dz * dk.az, v = -dx * dk.az + dz * dk.ax;
      if (Math.abs(u) <= dk.halfLen && Math.abs(v) <= dk.halfW) {
        const dh = dk.heightFn(u);
        if (dk.upper && !(ref !== undefined && ref > dh - 0.6)) continue;
        if (dh > h - 0.5) h = Math.max(h, dh);
      }
    }
    return h;
  }
  onDeck(x, z) {
    for (const dk of this.decks) {
      const dx = x - dk.cx, dz = z - dk.cz;
      const u = dx * dk.ax + dz * dk.az, v = -dx * dk.az + dz * dk.ax;
      if (Math.abs(u) <= dk.halfLen && Math.abs(v) <= dk.halfW) return dk;
    }
    return null;
  }

  // ---------------- bridge & paths -----------------
  computeBridge() {
    // find river point nearest to target
    let best = null, bd = 1e9;
    for (const p of this.river.pts) { const d = Math.hypot(p.x + 3, p.z - 35); if (d < bd) { bd = d; best = p; } }
    const w = this.riverHalfW(best.s);
    const ax = -best.tz, az = best.tx; // across-river direction
    const span = (w + 3.2) * 2;
    const L = this.riverLevel(best.s);
    const e1x = best.x - ax * span / 2, e1z = best.z - az * span / 2;
    const e2x = best.x + ax * span / 2, e2z = best.z + az * span / 2;
    const h1 = this.heightAt(e1x, e1z), h2 = this.heightAt(e2x, e2z);
    const self = this;
    this.bridge = {
      cx: best.x, cz: best.z, ax, az, span, halfW: 1.15, level: L, h1, h2,
      ends: [[e1x, e1z], [e2x, e2z]],
      heightFn(u) {
        const t = clamp(u / span + 0.5, 0, 1);
        const base = lerp(h1, h2, t) + 0.12;
        return base + 0.85 * Math.sin(Math.PI * t);
      },
    };
    this.decks.push({ cx: best.x, cz: best.z, ax, az, halfLen: span / 2 + 0.6, halfW: 1.15, heightFn: this.bridge.heightFn, type: 'bridge' });
    // dock
    const dkLen = Math.abs(DOCK.x1 - DOCK.x0);
    const dockH = POND.level + 0.45;
    this.dock = { cx: (DOCK.x0 + DOCK.x1) / 2, cz: DOCK.z, ax: -1, az: 0, halfLen: dkLen / 2, halfW: DOCK.w / 2, h: dockH };
    this.decks.push({ ...this.dock, heightFn: () => dockH, type: 'dock' });
    void self;
  }
  buildGroundMask() {
    const S = 512, R = 90;
    this.gm = { S, R, data: new Uint8Array(S * S * 4) };
    const b = this.bridge;
    const north = b.ends[0][1] < b.ends[1][1] ? b.ends[0] : b.ends[1];
    const south = north === b.ends[0] ? b.ends[1] : b.ends[0];
    const ext = (p, k) => [p[0] + (p[0] - b.cx) / (b.span / 2) * k, p[1] + (p[1] - b.cz) / (b.span / 2) * k];
    const nEnd = ext(north, 0.6), sEnd = ext(south, 0.6);
    this.paths = [
      [[0.3, -9.4], [0.6, -6], [0.8, -2], [0.2, 6], [-1.6, 15], [-2.6, 23], [nEnd[0], nEnd[1] - 2.5], nEnd],
      [sEnd, [sEnd[0] - 0.5, sEnd[1] + 4], [-5.5, 52], [-8, 60], [-12, 68]],
      [[0.8, -6.6], [4, -5.3], [8, -5.1], [12, -5.9], [12, -7.4]],
      [[0.2, -7.2], [-3.5, -5.6], [-6.5, -4.5], [-9.4, -3.7]],
      [[-6.5, -4.5], [-8.6, -9], [-10.4, -16], [-16, -22.5], [-23, -29], [-29, -36], [-34, -44]],
      [[12, -5.9], [19, -5.2], [24.5, -8.5], [28, -18], [31, -30], [35, -44], [39.5, -56.5]],
    ];
    this.pathSegs = [];
    for (const raw of this.paths) {
      const curve = new THREE.CatmullRomCurve3(raw.map(p => new THREE.Vector3(p[0], 0, p[1])));
      const n = Math.max(8, Math.ceil(curve.getLength() / 0.8));
      const pts = curve.getSpacedPoints(n);
      for (let i = 0; i < pts.length - 1; i++) this.pathSegs.push([pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z]);
    }
    const data = this.gm.data, texel = (2 * R) / S, hw = 0.85;
    for (const [ax, az, bx, bz] of this.pathSegs) {
      const pad = hw + 1.2;
      const x0 = Math.floor((Math.min(ax, bx) - pad + R) / texel), x1 = Math.ceil((Math.max(ax, bx) + pad + R) / texel);
      const z0 = Math.floor((Math.min(az, bz) - pad + R) / texel), z1 = Math.ceil((Math.max(az, bz) + pad + R) / texel);
      for (let tz = Math.max(0, z0); tz <= Math.min(S - 1, z1); tz++) for (let tx = Math.max(0, x0); tx <= Math.min(S - 1, x1); tx++) {
        const x = -R + (tx + 0.5) * texel, z = -R + (tz + 0.5) * texel;
        const r = distToSegment2(x, z, ax, az, bx, bz);
        const nn = this.noise(x * 0.9, z * 0.9) * 0.25;
        const v = smoothstep(hw + 0.45, hw - 0.35, Math.sqrt(r.d2) + nn);
        const k = (tz * S + tx) * 4 + 1;
        data[k] = Math.max(data[k], Math.round(v * 255));
      }
    }
    const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    this.groundTex = tex;
    this.groundRect = new THREE.Vector4(-R, -R, 2 * R, 2 * R);
  }
  pathAt(x, z) {
    const { S, R, data } = this.gm; const texel = (2 * R) / S;
    const tx = Math.floor((x + R) / texel), tz = Math.floor((z + R) / texel);
    if (tx < 0 || tz < 0 || tx >= S || tz >= S) return 0;
    return data[(tz * S + tx) * 4 + 1] / 255;
  }
  paintTilled(x0, z0, x1, z1, v = 255) {
    const { S, R, data } = this.gm; const texel = (2 * R) / S;
    const a = Math.floor((x0 + R) / texel), b = Math.ceil((x1 + R) / texel);
    const c = Math.floor((z0 + R) / texel), d = Math.ceil((z1 + R) / texel);
    for (let tz = Math.max(0, c); tz < Math.min(S, d); tz++) for (let tx = Math.max(0, a); tx < Math.min(S, b); tx++) {
      data[(tz * S + tx) * 4] = v;
    }
    this.groundTex.needsUpdate = true;
  }

  // ---------------- stamps from vegetation -----------------
  stampAO(x, z, radius, strength) {
    const V = this.V, cell = this.cell, half = this.half;
    const r = radius * 1.6;
    const ix0 = Math.max(0, Math.floor((x - r + half) / cell)), ix1 = Math.min(V - 1, Math.ceil((x + r + half) / cell));
    const iz0 = Math.max(0, Math.floor((z - r + half) / cell)), iz1 = Math.min(V - 1, Math.ceil((z + r + half) / cell));
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const px = -half + ix * cell, pz = -half + iz * cell;
      const d2 = (px - x) ** 2 + (pz - z) ** 2;
      const k = Math.exp(-d2 / (2 * radius * radius)) * strength;
      const idx = iz * V + ix;
      this.ao[idx] *= 1 - k;
    }
  }
  stampForest(x, z, radius) {
    const V = this.V, cell = this.cell, half = this.half;
    const ix0 = Math.max(0, Math.floor((x - radius + half) / cell)), ix1 = Math.min(V - 1, Math.ceil((x + radius + half) / cell));
    const iz0 = Math.max(0, Math.floor((z - radius + half) / cell)), iz1 = Math.min(V - 1, Math.ceil((z + radius + half) / cell));
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const px = -half + ix * cell, pz = -half + iz * cell;
      const d = Math.hypot(px - x, pz - z) / radius;
      const idx = iz * V + ix;
      this.forest[idx] = Math.max(this.forest[idx], smoothstep(1, 0.3, d));
    }
  }

  // ---------------- mesh -----------------
  buildMesh(U) {
    const V = this.V, N = this.N, cell = this.cell, half = this.half;
    const pos = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3), spl = new Float32Array(V * V * 4);
    const cLush = new THREE.Color('#6aa13a'), cWarm = new THREE.Color('#97ab46'), cDeep = new THREE.Color('#4d8a38'), cHigh = new THREE.Color('#7f9a52');
    const tmp = new THREE.Color();
    for (let iz = 0; iz < V; iz++) for (let ix = 0; ix < V; ix++) {
      const idx = iz * V + ix, x = -half + ix * cell, z = -half + iz * cell, h = this.h[idx];
      pos[idx * 3] = x; pos[idx * 3 + 1] = h; pos[idx * 3 + 2] = z;
      const n1 = fbm(this.noise, x * 0.018 + 3, z * 0.018 - 8, 3) * 0.5 + 0.5;
      const n2 = this.noise(x * 0.07 + 11, z * 0.07) * 0.5 + 0.5;
      tmp.copy(cLush).lerp(cWarm, smoothstep(0.45, 0.8, n1)).lerp(cDeep, smoothstep(0.55, 0.15, n2) * 0.6);
      tmp.lerp(cHigh, smoothstep(6, 18, h) * 0.6);
      col[idx * 3] = tmp.r; col[idx * 3 + 1] = tmp.g; col[idx * 3 + 2] = tmp.b;
      const ny = this.nrm[idx * 3 + 1];
      const L = this.waterLv[idx];
      let sand = 0;
      if (L > -40) sand = smoothstep(L + 0.6, L + 0.1, h);
      const rd = this.riverD[idx] - this.riverHalfW(this.riverS[idx]);
      if (rd < 3) sand = Math.max(sand, smoothstep(3, 0.5, rd) * 0.6);
      let rock = smoothstep(0.86, 0.66, ny) + smoothstep(18, 32, h) * 0.5;
      const cd = Math.hypot(x - this.cascade.x, z - this.cascade.z);
      rock += smoothstep(9, 3, cd) * 0.7 * (L > -40 ? smoothstep(L - 0.4, L + 0.3, h) : 1);
      spl[idx * 4] = clamp(sand, 0, 1);
      spl[idx * 4 + 1] = clamp(rock, 0, 1);
      spl[idx * 4 + 2] = this.forest[idx];
      spl[idx * 4 + 3] = this.ao[idx];
    }
    const index = new Uint32Array(N * N * 6);
    let k = 0;
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
      const a = iz * V + ix, b = a + 1, c = a + V, d = c + 1;
      index[k++] = a; index[k++] = c; index[k++] = b;
      index[k++] = b; index[k++] = c; index[k++] = d;
    }
    this.col = col;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
    g.setAttribute('aSplat', new THREE.BufferAttribute(spl, 4));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingSphere();
    // water level texture
    const wl = new Uint16Array(V * V);
    for (let i = 0; i < V * V; i++) wl[i] = THREE.DataUtils.toHalfFloat(this.waterLv[i]);
    const wtex = new THREE.DataTexture(wl, V, V, THREE.RedFormat, THREE.HalfFloatType);
    wtex.magFilter = wtex.minFilter = THREE.LinearFilter; wtex.needsUpdate = true;
    this.waterTex = wtex;
    this.waterRect = new THREE.Vector4(-half - cell * 0.5, -half - cell * 0.5, this.size + cell, this.size + cell);
    const mat = makeTerrainMaterial(U, this);
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.mesh = mesh;
    return mesh;
  }

  buildFarMountains() {
    // Distant ranges ringing the valley.  A polar grid (fine in azimuth, rings spaced
    // geometrically out to 1.1 km) carries a domain-warped ridged multifractal, shaped by a
    // radial envelope (forested foothills behind the rim, high snowy peaks further out) and a
    // broad massif mask; both river valleys continue out through the ranges.  Inside the
    // playable square the surface stays under the terrain so the two meshes join seamlessly.
    const N = this.noise, half = this.half;
    const NA = 720, NR = 84, R0 = 100, R1 = 1100;
    const KR = [100, 135, 230, 400, 620, 880, 1100], KH = [24, 30, 72, 155, 245, 320, 280];
    const envAt = (r) => {
      for (let k = 1; k < KR.length; k++) if (r <= KR[k]) return KH[k - 1] + (KH[k] - KH[k - 1]) * smoothstep(KR[k - 1], KR[k], r);
      return KH[KH.length - 1];
    };
    const mountainH = (x, z, r) => {
      const wx = x + 60 * fbm(N, x * 0.0018 + 5.2, z * 0.0018 - 1.3, 2);
      const wz = z + 60 * fbm(N, x * 0.0018 - 7.7, z * 0.0018 + 3.9, 2);
      // ridged multifractal; octaves finer than the local grid spacing fade out
      const minL = r * 0.06;
      let s = 0, a = 1, f = 0.0012, w = 1, n = 0;
      for (let o = 0; o < 6; o++) {
        let v = 1 - Math.abs(N(wx * f + o * 31.7, wz * f - o * 17.3));
        v *= v * w;
        w = clamp(v * 1.1, 0.25, 1);
        s += v * a * smoothstep(minL, minL * 1.6, 1 / f); n += a;
        a *= o < 2 ? 0.5 : 0.38; f *= 2.05;
      }
      const m = smoothstep(-0.5, 0.6, fbm(N, x * 0.0008 + 2.1, z * 0.0008 + 8.4, 3));
      return envAt(r) * (0.06 + 0.3 * m + 1.1 * (s / n) * (0.25 + 0.75 * m));
    };
    // the river leaves the square at both ends: carve meandering valleys outwards
    const P = this.river.pts, pa = P[0], pb = P[P.length - 1];
    const exits = [{ x: pa.x, z: pa.z, dx: -pa.tx, dz: -pa.tz, k: 0.0 }, { x: pb.x, z: pb.z, dx: pb.tx, dz: pb.tz, k: 4.7 }];
    const carve = (h, x, z) => {
      for (const e of exits) {
        const rx = x - e.x, rz = z - e.z;
        const along = rx * e.dx + rz * e.dz;
        if (along < -40) continue;
        const side = -rx * e.dz + rz * e.dx;
        const mean = 90 * N(along * 0.003 + e.k, 3.7 + e.k) * smoothstep(0, 220, along);
        const wv = 30 + Math.max(along, 0) * 0.32;
        const v = (1 - smoothstep(wv * 0.3, wv, Math.abs(side - mean))) * smoothstep(-40, 10, along);
        const floor = 3 + Math.max(along, 0) * 0.07 + 6 * N(x * 0.02, z * 0.02);
        h = lerp(h, Math.min(h, floor), v * 0.95);
      }
      return h;
    };
    const V = NA * NR;
    const pos = new Float32Array(V * 3), H = new Float32Array(V);
    for (let j = 0; j < NR; j++) {
      const r = R0 * Math.pow(R1 / R0, j / (NR - 1));
      for (let i = 0; i < NA; i++) {
        const ang = (i / NA) * Math.PI * 2;
        const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
        const out = Math.max(Math.abs(x), Math.abs(z)) - half;
        let h;
        if (out < 1) h = this.heightAt(x, z) - 4;
        else {
          h = carve(mountainH(x, z, r), x, z);
          const hEdge = this.heightAt(clamp(x, -half + 0.5, half - 0.5), clamp(z, -half + 0.5, half - 0.5));
          h = lerp(hEdge - 1, h, smoothstep(0, 70, out));
        }
        const k = j * NA + i;
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; H[k] = h;
      }
    }
    const idx = new Uint32Array((NR - 1) * NA * 6);
    let q = 0;
    for (let j = 0; j < NR - 1; j++) for (let i = 0; i < NA; i++) {
      const i0 = j * NA + i, i1 = j * NA + (i + 1) % NA, i2 = i0 + NA, i3 = i1 + NA;
      idx[q++] = i0; idx[q++] = i1; idx[q++] = i2; idx[q++] = i1; idx[q++] = i3; idx[q++] = i2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    // surface classes (forest / rock / snow) and valley occlusion, refined per pixel by the shader
    const nrm = g.attributes.normal.array, mt = new Float32Array(V * 4);
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
      const k = j * NA + i, x = pos[k * 3], h = H[k], z = pos[k * 3 + 2];
      const steep = 1 - nrm[k * 3 + 1];
      const tl = 215 + 40 * N(x * 0.003 + 9.1, z * 0.003 - 4.2), sl = 300 + 30 * N(x * 0.004 - 3.3, z * 0.004 + 7.7);
      const forest = (1 - smoothstep(tl - 40, tl + 25, h)) * (1 - smoothstep(0.36, 0.52, steep));
      const rock = Math.max(smoothstep(0.42, 0.58, steep), smoothstep(tl + 15, tl + 80, h) * smoothstep(0.1, 0.26, steep));
      const snow = smoothstep(sl - 20, sl + 25, h) * (1 - smoothstep(0.42, 0.6, steep));
      // concavity against the local mean height: valleys and gullies darker, crests lighter
      let sum = 0, cnt = 0;
      for (let dj = -2; dj <= 2; dj++) {
        const jj = j + dj; if (jj < 0 || jj >= NR) continue;
        for (let di = -6; di <= 6; di += 2) { sum += H[jj * NA + (i + di + NA) % NA]; cnt++; }
      }
      const ao = clamp(0.84 + (h - sum / cnt) / 70, 0.5, 1.08);
      mt[k * 4] = forest; mt[k * 4 + 1] = rock; mt[k * 4 + 2] = snow; mt[k * 4 + 3] = ao;
    }
    g.setAttribute('aMt', new THREE.BufferAttribute(mt, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), R1 + 600);
    const m = new THREE.Mesh(g, makeMountainMaterial());
    m.name = 'farMountains';
    return m;
  }
}

function makeMountainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aMt;\nvarying vec4 vMt;\nvarying vec3 vMW;\nvarying vec3 vMN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMt = aMt;\nvMN = normal;\nvMW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vMt; varying vec3 vMW; varying vec3 vMN;
vec3 mNW; float mRough;
${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 N0 = normalize(vMN);
  float dist = distance(vMW, cameraPosition);
  float fine = 1.0 - smoothstep(350.0, 900.0, dist);
  vec2 p = vMW.xz;
  float nA = fbm3(p * 0.004), nB = fbm3(p * 0.03), nC = vnoise(p * 0.12);
  // ragged tree line, rock bands and snow fields
  float forest = smoothstep(0.3, 0.7, vMt.x + (nB - 0.5) * 0.7);
  float rock = smoothstep(0.35, 0.65, vMt.y + (nB - 0.5) * 0.6 + (nA - 0.5) * 0.3);
  float snow = smoothstep(0.4, 0.6, vMt.z + (nB - 0.5) * 0.45 + (nA - 0.5) * 0.25);
  vec3 cMeadow = mix(vec3(0.10, 0.13, 0.045), vec3(0.17, 0.18, 0.07), nA);
  vec3 cForest = mix(vec3(0.022, 0.05, 0.02), vec3(0.045, 0.075, 0.028), nB) * mix(1.0, 0.7 + 0.6 * nC, fine);
  vec3 cRock = mix(vec3(0.14, 0.13, 0.11), vec3(0.23, 0.215, 0.19), nB) * mix(1.0, 0.8 + 0.4 * nC, fine);
  vec3 c = mix(cMeadow, cForest, forest);
  c = mix(c, cRock, rock);
  c = mix(c, vec3(0.78, 0.8, 0.84), snow);
  diffuseColor.rgb = c * vMt.w;
  mRough = mix(0.95, 0.7, snow);
  // canopy / crag relief: bump mapping from screen-space derivatives (no tangents needed)
  float bh = (nB * 6.0 + nC * 2.5 * fine) * mix(1.0, 0.35, snow);
  vec3 dpx = dFdx(vMW), dpy = dFdy(vMW);
  vec3 r1 = cross(dpy, N0), r2 = cross(N0, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(bh) * r1 + dFdy(bh) * r2);
  mNW = normalize(abs(det) * N0 - grad * (0.35 + 0.65 * fine));
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(mNW, 0.0)).xyz);')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= vMt.w;');
  };
  mat.customProgramCacheKey = () => 'farMountains2';
  return mat;
}

function makeTerrainMaterial(U, T) {
  // Layered, height-blended ground built from the procedurally baked texture array (texgen.js):
  // turf / dirt path / tilled soil / gravel shore & river bed / triplanar rock / forest floor.
  const it = GROUND_TILE.map(t => (1 / t).toFixed(5));
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWet = U.uWet;
    sh.uniforms.tGround = { value: T.groundTex }; sh.uniforms.tWaterLv = { value: T.waterTex };
    sh.uniforms.uGroundRect = { value: T.groundRect }; sh.uniforms.uWaterRect = { value: T.waterRect };
    sh.uniforms.tGC = { value: TEX.groundC }; sh.uniforms.tGN = { value: TEX.groundN };
    // radius band where the grass field ends (set by GrassField for the active quality)
    sh.uniforms.uGrassR = T.grassR || (T.grassR = { value: new THREE.Vector2(20, 34) });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSplat;\nvarying vec4 vSplat;\nvarying vec3 vWPos;\nvarying vec3 vNW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = aSplat;\nvNW = normal;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime; uniform float uWet;
uniform sampler2D tGround; uniform sampler2D tWaterLv; uniform vec4 uGroundRect; uniform vec4 uWaterRect;
uniform sampler2DArray tGC; uniform sampler2DArray tGN; uniform vec2 uGrassR;
varying vec4 vSplat; varying vec3 vWPos; varying vec3 vNW;
float tUnder; float tWetK; vec3 gNW; float gRough; float gAO;
${GLSL_NOISE}
${GLSL_CAUSTIC}
${GLSL_MEADOW}
// c: albedo (linear) + height in .a     n: world-space normal + AO in .a
struct GS { vec4 c; vec4 n; };
vec3 udn(vec3 tn, vec3 N){ return normalize(vec3(N.x + tn.x, N.y, N.z + tn.y)); }
GS gTex(float L, vec2 uv, vec2 dx, vec2 dy, vec3 N){
  GS s;
  s.c = textureGrad(tGC, vec3(uv, L), dx, dy);
  vec4 nn = textureGrad(tGN, vec3(uv, L), dx, dy);
  s.n = vec4(udn(nn.xyz * 2.0 - 1.0, N), nn.a);
  return s;
}
// two offset copies of the tile blended by a slow noise index: hides the repetition of large fields
GS gTexNT(float L, vec2 uv, vec2 dx, vec2 dy, vec3 N){
  float k = vnoise(uv * 0.45 + L * 7.0) * 8.0;
  float i = floor(k); float f = fract(k);
  vec2 oa = sin(vec2(3.0, 7.0) * i); vec2 ob = sin(vec2(3.0, 7.0) * (i + 1.0));
  vec4 ca = textureGrad(tGC, vec3(uv + oa, L), dx, dy), cb = textureGrad(tGC, vec3(uv + ob, L), dx, dy);
  vec4 na = textureGrad(tGN, vec3(uv + oa, L), dx, dy), nb = textureGrad(tGN, vec3(uv + ob, L), dx, dy);
  float t = smoothstep(0.2, 0.8, f - 0.1 * dot(ca.rgb - cb.rgb, vec3(1.0)));
  GS s; s.c = mix(ca, cb, t);
  vec4 nn = mix(na, nb, t);
  s.n = vec4(udn(nn.xyz * 2.0 - 1.0, N), nn.a);
  return s;
}
// blend factor of layer b over a, using both height maps (sharp, natural transitions)
float hbk(float ha, float hb, float w){ return clamp(((hb - ha) * 0.8 + (w * 2.0 - 1.0) * 1.6) / 0.22 + 0.5, 0.0, 1.0); }
void gMix(inout GS a, GS b, float k){ a.c = mix(a.c, b.c, k); a.n = mix(a.n, b.n, k); }
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 gp = vWPos.xz;
  vec3 N = normalize(vNW);
  vec2 dxW = dFdx(gp), dyW = dFdy(gp);
  vec2 dxX = dFdx(vWPos.zy), dyX = dFdy(vWPos.zy);
  vec2 dxZ = dFdx(vWPos.xy), dyZ = dFdy(vWPos.xy);
  float nA = fbm3(gp * 0.21);
  float nB = vnoise(gp * 1.7);
  vec4 gm = texture2D(tGround, (gp - uGroundRect.xy) / uGroundRect.zw);
  float wl = texture2D(tWaterLv, (gp - uWaterRect.xy) / uWaterRect.zw).r;
  tUnder = wl - vWPos.y;
  vec4 md = meadow(gp);

  // --- turf (always)
  GS cur = gTexNT(0.0, gp * ${it[0]}, dxW * ${it[0]}, dyW * ${it[0]}, N);
  cur.c.rgb *= meadowTint(md) * vec3(1.0, 1.0, 0.92);
  float rough = 0.95;
  // --- forest floor (leaf litter, needles, moss) under the trees
  float wF = vSplat.z * smoothstep(0.2, 0.7, nB * 0.6 + nA * 0.6);
  if (wF > 0.002) {
    GS s = gTexNT(5.0, gp * ${it[5]}, dxW * ${it[5]}, dyW * ${it[5]}, N);
    float k = hbk(cur.c.a, s.c.a, wF); gMix(cur, s, k); rough = mix(rough, 0.92, k);
  }
  // --- trodden dirt paths
  float wP = smoothstep(0.3, 0.75, gm.g + (nB - 0.5) * 0.3);
  if (wP > 0.002) {
    GS s = gTexNT(1.0, gp * ${it[1]}, dxW * ${it[1]}, dyW * ${it[1]}, N);
    float k = hbk(cur.c.a, s.c.a, wP); gMix(cur, s, k); rough = mix(rough, 0.9, k);
  }
  // --- tilled soil
  float wT = smoothstep(0.3, 0.7, gm.r);
  if (wT > 0.002) {
    GS s = gTex(2.0, gp * ${it[2]}, dxW * ${it[2]}, dyW * ${it[2]}, N);
    float k = hbk(cur.c.a, s.c.a, wT); gMix(cur, s, k); rough = mix(rough, 0.95, k);
  }
  // --- gravel: shores and the beds of the river and ponds
  float sandK = clamp(vSplat.x * 1.2 + (nB - 0.5) * 0.35, 0.0, 1.0);
  float bedK = smoothstep(-0.25, 0.2, tUnder) * smoothstep(0.1, 0.55, nA + 0.25);
  float wG = max(sandK, bedK);
  if (wG > 0.002) {
    GS s = gTexNT(3.0, gp * ${it[3]}, dxW * ${it[3]}, dyW * ${it[3]}, N);
    // drier, sandier tone on the banks, darker silt-washed stones underwater
    s.c.rgb *= mix(vec3(1.08, 1.04, 0.96), vec3(0.92, 0.95, 0.9), smoothstep(-0.05, 0.4, tUnder));
    float k = hbk(cur.c.a, s.c.a, wG); gMix(cur, s, k); rough = mix(rough, 0.78, k);
  }
  // sparse algae on the deeper bed
  cur.c.rgb = mix(cur.c.rgb, ${glslColor('#4f6334')}, smoothstep(0.62, 0.8, nA) * smoothstep(0.6, 1.4, tUnder) * 0.55);
  // --- rock on steep slopes / high ground / the cascade (triplanar)
  float wR = smoothstep(0.2, 0.8, vSplat.y + (nA - 0.5) * 0.3);
  if (wR > 0.002) {
    vec3 bw = pow(abs(N), vec3(4.0)); bw /= dot(bw, vec3(1.0));
    vec3 p = vWPos * ${it[4]};
    vec4 cY = textureGrad(tGC, vec3(p.xz, 4.0), dxW * ${it[4]}, dyW * ${it[4]});
    vec4 nY = textureGrad(tGN, vec3(p.xz, 4.0), dxW * ${it[4]}, dyW * ${it[4]});
    vec4 cX = textureGrad(tGC, vec3(p.zy, 4.0), dxX * ${it[4]}, dyX * ${it[4]});
    vec4 nX = textureGrad(tGN, vec3(p.zy, 4.0), dxX * ${it[4]}, dyX * ${it[4]});
    vec4 cZ = textureGrad(tGC, vec3(p.xy, 4.0), dxZ * ${it[4]}, dyZ * ${it[4]});
    vec4 nZ = textureGrad(tGN, vec3(p.xy, 4.0), dxZ * ${it[4]}, dyZ * ${it[4]});
    vec3 tX = nX.xyz * 2.0 - 1.0, tY = nY.xyz * 2.0 - 1.0, tZ = nZ.xyz * 2.0 - 1.0;
    tX = vec3(tX.xy + N.zy, abs(tX.z) * N.x);
    tY = vec3(tY.xy + N.xz, abs(tY.z) * N.y);
    tZ = vec3(tZ.xy + N.xy, abs(tZ.z) * N.z);
    GS s;
    s.c = cX * bw.x + cY * bw.y + cZ * bw.z;
    s.n = vec4(normalize(tX.zyx * bw.x + tY.xzy * bw.y + tZ.xyz * bw.z), nX.a * bw.x + nY.a * bw.y + nZ.a * bw.z);
    float k = hbk(cur.c.a, s.c.a, wR); gMix(cur, s, k); rough = mix(rough, 0.8, k);
  }
  vec3 col = cur.c.rgb;
  gNW = normalize(cur.n.xyz);
  gAO = cur.n.a;
  col *= mix(0.62, 1.0, vSplat.w) * mix(0.75, 1.0, gAO);
  // soil between the grass blades sits in the shade of the sward: darker and greener,
  // fading back to the plain turf where the grass field ends
  float gUnder = gm.b * (1.0 - smoothstep(0.2, 0.55, gm.r)) * (1.0 - wP) * (1.0 - wG)
               * (1.0 - smoothstep(uGrassR.x, uGrassR.y, distance(vWPos.xz, cameraPosition.xz)));
  col = mix(col, col * vec3(0.52, 0.6, 0.42), gUnder * 0.75);
  float wetK = clamp(1.0 - (vWPos.y - wl) / 0.45, 0.0, 1.0);
  wetK = max(wetK, uWet * 0.75);
  col *= mix(1.0, 0.62, wetK * (1.0 - smoothstep(0.1, 0.6, tUnder) * 0.4));
  // glossy sheen only in a thin band right at the waterline (or everywhere while it rains)
  tWetK = max(clamp(1.0 - (vWPos.y - wl) / 0.16, 0.0, 1.0), uWet * 0.75);
  gRough = rough;
  diffuseColor.rgb = col;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = gRough;
// wet sheen only on the shore band / rain-soaked ground, never on the submerged bed
roughnessFactor = mix(roughnessFactor, 0.35, tWetK * (1.0 - smoothstep(-0.02, 0.06, tUnder)));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize((viewMatrix * vec4(gNW, 0.0)).xyz);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{
  reflectedLight.indirectDiffuse *= gAO;
  // the water surface handles reflections; the submerged bed is purely diffuse
  float uwK = smoothstep(0.0, 0.1, tUnder);
  reflectedLight.indirectSpecular *= 1.0 - uwK;
  reflectedLight.directSpecular *= 1.0 - uwK * 0.85;
}`)
      .replace('#include <opaque_fragment>', `
if (tUnder > 0.0) {
  float cz = causticLayer(vWPos.xz * 0.21 + vec2(uTime * 0.013, uTime * 0.009), uTime * 0.5) * 0.65
           + causticLayer(vWPos.xz * 0.33 + vec2(-uTime * 0.008, uTime * 0.014) + 3.7, uTime * 0.42) * 0.45;
  float fade = smoothstep(0.0, 0.35, tUnder) * exp(-tUnder * 0.22);
  outgoingLight += reflectedLight.directDiffuse * cz * 2.6 * fade;
  outgoingLight *= exp(-vec3(0.20, 0.05, 0.035) * tUnder);
}
#include <opaque_fragment>`);
  };
  return mat;
}
