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
  // walkable ground: terrain or decks
  groundHeight(x, z) {
    let h = this.heightAt(x, z);
    for (const dk of this.decks) {
      const dx = x - dk.cx, dz = z - dk.cz;
      const u = dx * dk.ax + dz * dk.az, v = -dx * dk.az + dz * dk.ax;
      if (Math.abs(u) <= dk.halfLen && Math.abs(v) <= dk.halfW) {
        const dh = dk.heightFn(u);
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
    const segA = 160, rings = [118, 135, 160, 200, 260, 340, 450, 600, 800];
    const pos = [], col = [], idx = [];
    const cF = new THREE.Color('#3f6b3a'), cR = new THREE.Color('#7d8a8f'), cS = new THREE.Color('#f2f4f6');
    const c = new THREE.Color();
    for (let r = 0; r < rings.length; r++) {
      for (let a = 0; a <= segA; a++) {
        const ang = (a / segA) * Math.PI * 2;
        const R = rings[r];
        const x = Math.cos(ang) * R, z = Math.sin(ang) * R;
        const n = fbm(this.noise, Math.cos(ang) * 2.2 + r * 0.31, Math.sin(ang) * 2.2 - r * 0.17, 5);
        const ridge = 1 - Math.abs(this.noise(Math.cos(ang) * 4.5 + 40, Math.sin(ang) * 4.5 + r * 0.5));
        let h = 0;
        if (r === 0) h = 22 + 8 * n;
        else h = (30 + r * 14) * (0.55 + 0.45 * n) + ridge * ridge * (18 + r * 9);
        if (r === rings.length - 1) h *= 0.35;
        pos.push(x, h, z);
        c.copy(cF).lerp(cR, smoothstep(40, 110, h)).lerp(cS, smoothstep(125, 170, h));
        col.push(c.r, c.g, c.b);
      }
    }
    const W = segA + 1;
    for (let r = 0; r < rings.length - 1; r++) for (let a = 0; a < segA; a++) {
      const i0 = r * W + a, i1 = i0 + 1, i2 = i0 + W, i3 = i2 + 1;
      idx.push(i0, i1, i2, i1, i3, i2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
    m.name = 'farMountains';
    return m;
  }
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
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSplat;\nvarying vec4 vSplat;\nvarying vec3 vWPos;\nvarying vec3 vNW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = aSplat;\nvNW = normal;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime; uniform float uWet;
uniform sampler2D tGround; uniform sampler2D tWaterLv; uniform vec4 uGroundRect; uniform vec4 uWaterRect;
uniform sampler2DArray tGC; uniform sampler2DArray tGN;
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
