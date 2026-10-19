// Canvas-2D foliage atlas: leaf sprigs, needle sprays, blossoms, fruit and wildflowers.
// 4×4 cells of 512 px. Every cell is drawn with its attachment point at the bottom centre.
import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';

export const ATLAS = { size: 2048, grid: 4, cell: 512 };
export const CELL = {
  oakA: 0, oakB: 1, birchA: 2, birchB: 3,
  appleA: 4, appleB: 5, blossomA: 6, blossomB: 7,
  spruceA: 8, spruceB: 9, bushA: 10, bushWhite: 11,
  bushPink: 12, bushBlue: 13, flowers: 14, fern: 15,
};
// atlas uv rect of a cell: [u0, vTop, u1, vBottom] with v measured from the canvas top (DataTexture, flipY = false)
export function cellUV(i, lu, lv) {
  const g = ATLAS.grid, cx = i % g, cy = Math.floor(i / g);
  return [(cx + lu) / g, (cy + 1 - lv) / g];
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
function hsl(h, s, l, a = 1) { return `hsla(${h.toFixed(1)},${(s * 100).toFixed(1)}%,${(l * 100).toFixed(1)}%,${a})`; }
function jit(R, c, dh = 6, ds = 0.06, dl = 0.05) { return [c[0] + (R() - 0.5) * 2 * dh, clamp01(c[1] + (R() - 0.5) * 2 * ds), clamp01(c[2] + (R() - 0.5) * 2 * dl)]; }

// half-width profile of a leaf along t in [0,1]
function profile(shape, t, R0) {
  switch (shape) {
    case 'oak': {
      const env = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.85) * (0.7 + 0.4 * t);
      const l = Math.pow(Math.abs(Math.sin(Math.PI * (R0 * 0.8 + 4.2) * t)), 0.55);
      return env * (0.5 + 0.5 * l) * (t > 0.96 ? (1 - t) / 0.04 : 1);
    }
    case 'birch': {
      const w = t < 0.32 ? Math.sin((t / 0.32) * Math.PI / 2) : Math.pow((1 - t) / 0.68, 0.85);
      return w * (1 - 0.1 * Math.abs(Math.sin(t * 46)));
    }
    case 'ovate': return Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 1.05) * (1 - 0.04 * Math.abs(Math.sin(t * 60)));
    case 'lance': return Math.pow(Math.sin(Math.PI * Math.pow(t, 0.6)), 1.3);
    case 'round': return Math.pow(Math.sin(Math.PI * t), 0.75);
    default: return Math.sin(Math.PI * t);
  }
}
// leaf pointing towards -y (up on the canvas) after rotation `ang`
function drawLeaf(ctx, R, x, y, ang, len, wid, shape, col, shade = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const pet = len * 0.1;
  ctx.strokeStyle = hsl(col[0] - 8, col[1] * 0.8, col[2] * 0.75 * shade); ctx.lineWidth = Math.max(1.2, wid * 0.07); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -pet); ctx.stroke();
  ctx.translate(0, -pet);
  const N = 30, R0 = R(), bend = (R() - 0.5) * 0.25, asym = 0.9 + R() * 0.15;
  const pts = [];
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push([profile(shape, t, R0) * wid * 0.5, -t * len, bend * t * t * len]); }
  const c = jit(R, col);
  const L = c[2] * shade;
  for (const side of [1, -1]) {
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (const [w, yy, b] of pts) ctx.lineTo(b + side * w * (side < 0 ? asym : 1), yy);
    ctx.closePath();
    const gr = ctx.createLinearGradient(0, 0, 0, -len);
    const l1 = L * (side > 0 ? 1.0 : 0.86);
    gr.addColorStop(0, hsl(c[0] + 4, c[1] * 0.95, l1 * 0.82));
    gr.addColorStop(0.55, hsl(c[0], c[1], l1));
    gr.addColorStop(1, hsl(c[0] - 3, c[1] * 1.05, l1 * 1.06));
    ctx.fillStyle = gr; ctx.fill();
  }
  // midrib + veins
  ctx.strokeStyle = hsl(c[0] + 10, c[1] * 0.7, Math.min(0.9, L * 1.35), 0.55); ctx.lineWidth = Math.max(0.8, wid * 0.035);
  ctx.beginPath(); ctx.moveTo(0, 0);
  for (let i = 0; i <= N; i += 3) ctx.lineTo(pts[i][2], pts[i][1] * 0.97);
  ctx.stroke();
  const nv = shape === 'birch' ? 7 : shape === 'oak' ? 5 : 6;
  ctx.lineWidth = Math.max(0.6, wid * 0.018); ctx.strokeStyle = hsl(c[0] + 8, c[1] * 0.7, Math.min(0.9, L * 1.25), 0.3);
  for (let k = 1; k <= nv; k++) {
    const t = k / (nv + 1), i = Math.round(t * N), [w, yy, b] = pts[i];
    for (const side of [1, -1]) { ctx.beginPath(); ctx.moveTo(b, yy); ctx.lineTo(b + side * w * 0.8, yy - len * 0.09); ctx.stroke(); }
  }
  ctx.restore();
}
function twig(ctx, pts, w0, w1, col) {
  for (let i = 0; i < pts.length - 1; i++) {
    const t = i / (pts.length - 1);
    ctx.strokeStyle = col; ctx.lineWidth = w0 + (w1 - w0) * t; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke();
  }
}
// curved polyline from (x,y) along angle a (0 = up), with curvature
function curve(x, y, a, len, curv, n = 10) {
  const pts = [[x, y]];
  for (let i = 1; i <= n; i++) { a += curv / n; x += Math.sin(a) * len / n; y -= Math.cos(a) * len / n; pts.push([x, y]); }
  return pts;
}
const at = (pts, t) => { const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), k = f - i; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k, Math.atan2(pts[i + 1][0] - pts[i][0], -(pts[i + 1][1] - pts[i][1]))]; };

// generic broadleaf sprig: a main twig with side twigs, leaves on alternating nodes
function sprig(ctx, R, o) {
  const items = [];
  const main = curve((R() - 0.5) * 30, 0, (R() - 0.5) * 0.3, o.len, (R() - 0.5) * 0.6, 14);
  const branches = [{ pts: main, w0: o.tw, w1: o.tw * 0.35 }];
  for (let k = 0; k < o.sides; k++) {
    const t = 0.18 + (k + R() * 0.7) / o.sides * 0.62;
    const [x, y, a] = at(main, t), s = k % 2 ? 1 : -1;
    const pts = curve(x, y, a + s * (0.45 + R() * 0.5), o.len * (0.38 + R() * 0.3) * (1 - t * 0.4), s * (R() - 0.2) * 0.5, 8);
    branches.push({ pts, w0: o.tw * 0.6, w1: o.tw * 0.25 });
  }
  for (const b of branches) twig(ctx, b.pts, b.w0, b.w1, o.twigCol);
  for (const b of branches) {
    const n = o.perTwig, L = b.pts.length;
    for (let i = 0; i < n; i++) {
      const t = o.tipCluster ? 0.55 + 0.45 * Math.pow(R(), 0.6) : 0.12 + (i + R() * 0.5) / n * 0.88;
      const [x, y, a] = at(b.pts, Math.min(1, t)), s = i % 2 ? 1 : -1;
      const la = a + s * (o.spread[0] + R() * (o.spread[1] - o.spread[0]));
      const len = o.leafLen * (0.75 + R() * 0.45) * (o.tipCluster ? 1 : 1 - 0.25 * Math.abs(t - 0.6));
      items.push({ x, y, a: la, len, wid: len * o.aspect * (0.85 + R() * 0.3), z: R() });
    }
    const [x, y, a] = at(b.pts, 1);
    items.push({ x, y, a: a + (R() - 0.5) * 0.4, len: o.leafLen * 1.05, wid: o.leafLen * o.aspect, z: R() });
    void L;
  }
  items.sort((p, q) => p.z - q.z);
  for (const it of items) drawLeaf(ctx, R, it.x, it.y, it.a, it.len, it.wid, o.shape, o.col, 0.72 + 0.38 * it.z);
  return branches;
}
function blossom(ctx, R, x, y, r, pal) {
  const n = 5, rot = R() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    ctx.save(); ctx.translate(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45); ctx.rotate(a + Math.PI / 2);
    const c = jit(R, pal, 4, 0.05, 0.04);
    const gr = ctx.createRadialGradient(0, r * 0.25, 0, 0, 0, r * 0.62);
    gr.addColorStop(0, hsl(c[0] - 5, c[1] * 1.1, c[2] * 0.82)); gr.addColorStop(1, hsl(c[0], c[1], Math.min(0.97, c[2] * 1.06)));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.38, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = hsl(340, 0.5, 0.45); ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, 6.28); ctx.fill();
  for (let i = 0; i < 9; i++) { const a = R() * 6.28, d = r * (0.12 + R() * 0.2); ctx.fillStyle = hsl(48, 0.85, 0.62); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(1, r * 0.05), 0, 6.28); ctx.fill(); }
}
function apple(ctx, R, x, y, r) {
  ctx.strokeStyle = '#5a4128'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y - r * 0.85); ctx.lineTo(x + r * 0.15, y - r * 1.4); ctx.stroke();
  const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r * 1.05);
  const red = 352 + (R() - 0.5) * 12;
  gr.addColorStop(0, hsl(30, 0.75, 0.62)); gr.addColorStop(0.25, hsl(red, 0.68, 0.45)); gr.addColorStop(0.85, hsl(red - 4, 0.72, 0.3)); gr.addColorStop(1, hsl(red - 8, 0.7, 0.22));
  ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,220,0.25)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.38, r * 0.22, r * 0.14, -0.6, 0, 6.28); ctx.fill();
}
function needleSpray(ctx, R, o) {
  const main = curve((R() - 0.5) * 20, 0, (R() - 0.5) * 0.2, o.len, (R() - 0.5) * 0.4, 16);
  const branches = [{ pts: main, l: 1 }];
  for (let k = 0; k < o.sides; k++) {
    const t = 0.12 + (k + R() * 0.6) / o.sides * 0.8, [x, y, a] = at(main, t), s = k % 2 ? 1 : -1;
    branches.push({ pts: curve(x, y, a + s * (0.7 + R() * 0.35), o.len * (0.42 - t * 0.25) * (0.8 + R() * 0.4), -s * 0.25, 8), l: 0.75 });
  }
  for (const b of branches) twig(ctx, b.pts, 4.5 * b.l, 2, '#5b4636');
  for (const b of branches) {
    let total = 0; for (let i = 0; i < b.pts.length - 1; i++) total += Math.hypot(b.pts[i + 1][0] - b.pts[i][0], b.pts[i + 1][1] - b.pts[i][1]);
    const n = Math.floor(total / o.step);
    for (let i = 0; i < n; i++) {
      const t = i / n, [x, y, a] = at(b.pts, t);
      for (const s of [-1, 1]) {
        const na = a + s * (0.75 + R() * 0.35) - 0.25 * s * t;
        const nl = o.nLen * (0.75 + R() * 0.4) * (1 - 0.35 * t);
        const c = jit(R, t > 0.82 ? o.tip : o.col, 5, 0.05, 0.05);
        ctx.strokeStyle = hsl(c[0], c[1], c[2] * (0.75 + 0.35 * R())); ctx.lineWidth = o.nW; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(na) * nl, y - Math.cos(na) * nl); ctx.stroke();
      }
      // needles pointing forward/over the twig
      if (R() < 0.6) {
        const na = a + (R() - 0.5) * 0.8, nl = o.nLen * 0.8, c = jit(R, o.col, 5, 0.05, 0.05);
        ctx.strokeStyle = hsl(c[0], c[1], c[2] * 1.05); ctx.lineWidth = o.nW;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(na) * nl, y - Math.cos(na) * nl); ctx.stroke();
      }
    }
  }
}
function fernFrond(ctx, R) {
  const main = curve(0, 0, -0.1, 470, 0.5, 20);
  twig(ctx, main, 5, 1.5, '#5c6e34');
  const n = 26;
  for (let i = 2; i < n; i++) {
    const t = i / n, [x, y, a] = at(main, t);
    for (const s of [-1, 1]) {
      const L = 150 * Math.sin(Math.PI * Math.pow(t, 0.8)) * (0.9 + R() * 0.2);
      const pin = curve(x, y, a + s * 1.15, L, s * 0.3, 8);
      ctx.strokeStyle = '#4f6a2e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pin[0][0], pin[0][1]); for (const p of pin) ctx.lineTo(p[0], p[1]); ctx.stroke();
      const m = Math.max(3, Math.floor(L / 11));
      for (let k = 0; k < m; k++) {
        const u = (k + 0.5) / m, [px, py, pa] = at(pin, u);
        for (const s2 of [-1, 1]) drawLeaf(ctx, R, px, py, pa + s2 * 1.2, 16 * (1 - u * 0.6), 9 * (1 - u * 0.5), 'round', [95, 0.42, 0.3], 0.85 + 0.25 * R());
      }
    }
  }
}
function wildflowers(ctx, R) {
  // 2×2 sub-cells (256 px): daisy, buttercup, red clover, cornflower — head seen from above
  const head = (cx, cy, fn) => { ctx.save(); ctx.translate(cx, cy); fn(); ctx.restore(); };
  head(-128, -384, () => { // daisy
    for (let i = 0; i < 26; i++) { const a = (i / 26) * 6.283 + R() * 0.05; ctx.save(); ctx.rotate(a); const gr = ctx.createLinearGradient(0, 0, 0, -105); gr.addColorStop(0, '#e9e6dc'); gr.addColorStop(1, '#fbfaf6'); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, -62, 11, 46, 0, 0, 6.283); ctx.fill(); ctx.restore(); }
    const g = ctx.createRadialGradient(-6, -6, 2, 0, 0, 30); g.addColorStop(0, '#ffd84a'); g.addColorStop(1, '#d99a12'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 28, 0, 6.283); ctx.fill();
  });
  head(128, -384, () => { // buttercup
    for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.283; ctx.save(); ctx.rotate(a); const gr = ctx.createRadialGradient(0, -20, 4, 0, -45, 60); gr.addColorStop(0, '#ffe14d'); gr.addColorStop(1, '#f2b705'); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, -50, 44, 52, 0, 0, 6.283); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = '#c88a06'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, 6.283); ctx.fill();
    for (let i = 0; i < 20; i++) { const a = R() * 6.283, d = 14 + R() * 10; ctx.fillStyle = '#ffe98a'; ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 3, 0, 6.283); ctx.fill(); }
  });
  head(-128, -128, () => { // red clover
    for (let i = 0; i < 160; i++) { const a = R() * 6.283, d = Math.sqrt(R()) * 80; const c = jit(R, [330, 0.45, 0.62], 8, 0.08, 0.08); ctx.fillStyle = hsl(c[0], c[1], c[2] * (0.75 + 0.3 * (1 - d / 80))); ctx.beginPath(); ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d, 7, 16, a + 1.57, 0, 6.283); ctx.fill(); }
  });
  head(128, -128, () => { // cornflower
    for (let i = 0; i < 11; i++) { const a = (i / 11) * 6.283; ctx.save(); ctx.rotate(a); ctx.fillStyle = hsl(222 + R() * 10, 0.72, 0.52); ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(-22, -92); ctx.lineTo(-8, -82); ctx.lineTo(0, -100); ctx.lineTo(8, -82); ctx.lineTo(22, -92); ctx.closePath(); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = hsl(250, 0.5, 0.3); ctx.beginPath(); ctx.arc(0, 0, 24, 0, 6.283); ctx.fill();
  });
}

// fill transparent texels with nearby opaque colours (push-pull) so mip-maps don't darken edges
function dilate(d, W, x0, y0, cs) {
  const levels = [];
  let w = cs, cur = new Float32Array(w * w * 4);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const s = ((y0 + y) * W + x0 + x) * 4, k = d[s + 3] > 8 ? 1 : 0, o = (y * w + x) * 4;
    cur[o] = d[s] * k; cur[o + 1] = d[s + 1] * k; cur[o + 2] = d[s + 2] * k; cur[o + 3] = k;
  }
  levels.push(cur);
  while (w > 1) {
    const nw = w >> 1, nd = new Float32Array(nw * nw * 4);
    for (let y = 0; y < nw; y++) for (let x = 0; x < nw; x++) {
      const o = (y * nw + x) * 4;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const s = ((y * 2 + dy) * w + x * 2 + dx) * 4; nd[o] += cur[s]; nd[o + 1] += cur[s + 1]; nd[o + 2] += cur[s + 2]; nd[o + 3] += cur[s + 3]; }
    }
    levels.push(nd); cur = nd; w = nw;
  }
  for (let l = levels.length - 2; l >= 0; l--) {
    const L = levels[l], P = levels[l + 1], lw = cs >> l, pw = lw >> 1;
    for (let y = 0; y < lw; y++) for (let x = 0; x < lw; x++) {
      const o = (y * lw + x) * 4; if (L[o + 3] > 0) continue;
      const p = ((y >> 1) * pw + (x >> 1)) * 4, pa = P[p + 3] || 1;
      L[o] = P[p] / pa * 1e-3; L[o + 1] = P[p + 1] / pa * 1e-3; L[o + 2] = P[p + 2] / pa * 1e-3; L[o + 3] = 1e-3;
    }
  }
  const L0 = levels[0];
  for (let y = 0; y < cs; y++) for (let x = 0; x < cs; x++) {
    const s = ((y0 + y) * W + x0 + x) * 4; if (d[s + 3] > 8) continue;
    const o = (y * cs + x) * 4, a = L0[o + 3] || 1;
    d[s] = L0[o] / a; d[s + 1] = L0[o + 1] / a; d[s + 2] = L0[o + 2] / a;
  }
}

export function buildLeafAtlas(renderer) {
  const S = ATLAS.size, CS = ATLAS.cell;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, S, S);
  const cell = (i, seed, fn) => {
    const cx = (i % 4) * CS, cy = Math.floor(i / 4) * CS;
    ctx.save(); ctx.beginPath(); ctx.rect(cx + 4, cy + 4, CS - 8, CS - 8); ctx.clip();
    ctx.translate(cx + CS / 2, cy + CS - 6);
    fn(mulberry32(seed));
    ctx.restore();
  };
  const twigCol = '#5d4a3a';
  cell(CELL.oakA, 11, R => sprig(ctx, R, { len: 400, sides: 4, perTwig: 6, tipCluster: true, leafLen: 92, aspect: 0.55, spread: [0.3, 1.1], shape: 'oak', col: [88, 0.42, 0.27], tw: 6, twigCol }));
  cell(CELL.oakB, 12, R => sprig(ctx, R, { len: 380, sides: 5, perTwig: 5, tipCluster: true, leafLen: 86, aspect: 0.55, spread: [0.3, 1.2], shape: 'oak', col: [84, 0.4, 0.25], tw: 6, twigCol }));
  cell(CELL.birchA, 21, R => sprig(ctx, R, { len: 440, sides: 5, perTwig: 9, leafLen: 50, aspect: 0.72, spread: [0.5, 1.2], shape: 'birch', col: [78, 0.5, 0.36], tw: 3.5, twigCol: '#4a3b33' }));
  cell(CELL.birchB, 22, R => sprig(ctx, R, { len: 420, sides: 6, perTwig: 8, leafLen: 46, aspect: 0.75, spread: [0.5, 1.3], shape: 'birch', col: [74, 0.48, 0.34], tw: 3.5, twigCol: '#4a3b33' }));
  cell(CELL.appleA, 31, R => {
    const br = sprig(ctx, R, { len: 400, sides: 4, perTwig: 6, leafLen: 74, aspect: 0.5, spread: [0.4, 1.1], shape: 'ovate', col: [92, 0.42, 0.29], tw: 5, twigCol });
    for (let k = 0; k < 3; k++) { const b = br[1 + (k % (br.length - 1))], [x, y] = at(b.pts, 0.5 + R() * 0.4); apple(ctx, R, x + (R() - 0.5) * 30, y + 26, 26 + R() * 6); }
    const b = br[0]; const [x, y] = at(b.pts, 0.7); drawLeaf(ctx, R, x + 10, y, 0.8, 70, 34, 'ovate', [92, 0.42, 0.3], 1.05);
  });
  cell(CELL.appleB, 32, R => sprig(ctx, R, { len: 410, sides: 5, perTwig: 6, leafLen: 70, aspect: 0.5, spread: [0.4, 1.1], shape: 'ovate', col: [90, 0.4, 0.28], tw: 5, twigCol }));
  for (const [ci, seed] of [[CELL.blossomA, 41], [CELL.blossomB, 42]]) cell(ci, seed, R => {
    const br = sprig(ctx, R, { len: 410, sides: 5, perTwig: 2, leafLen: 50, aspect: 0.5, spread: [0.5, 1.0], shape: 'ovate', col: [95, 0.45, 0.4], tw: 5, twigCol: '#4b3631' });
    const fl = [];
    for (const b of br) for (let k = 0; k < 13; k++) { const [x, y] = at(b.pts, 0.15 + R() * 0.85); fl.push([x + (R() - 0.5) * 52, y + (R() - 0.5) * 52, 17 + R() * 9, R()]); }
    fl.sort((a, b) => a[3] - b[3]);
    for (const f of fl) blossom(ctx, R, f[0], f[1], f[2], [342 + R() * 10, 0.62, 0.8 + f[3] * 0.08]);
  });
  cell(CELL.spruceA, 51, R => needleSpray(ctx, R, { len: 460, sides: 9, step: 3.2, nLen: 26, nW: 2.6, col: [140, 0.35, 0.2], tip: [110, 0.4, 0.33] }));
  cell(CELL.spruceB, 52, R => needleSpray(ctx, R, { len: 440, sides: 11, step: 3.0, nLen: 24, nW: 2.6, col: [145, 0.32, 0.18], tip: [115, 0.38, 0.3] }));
  cell(CELL.bushA, 61, R => sprig(ctx, R, { len: 420, sides: 7, perTwig: 11, leafLen: 44, aspect: 0.55, spread: [0.5, 1.2], shape: 'ovate', col: [96, 0.42, 0.26], tw: 3.5, twigCol }));
  const flowerBush = (ci, seed, pal, kind) => cell(ci, seed, R => {
    const br = sprig(ctx, R, { len: 420, sides: 6, perTwig: 9, leafLen: 46, aspect: 0.55, spread: [0.5, 1.2], shape: 'ovate', col: [98, 0.42, 0.26], tw: 3.5, twigCol });
    for (const b of br) {
      const [x, y] = at(b.pts, 1);
      if (kind === 'blue') { for (let k = 0; k < 26; k++) { const a = R() * 6.28, d = Math.sqrt(R()) * 44; blossom(ctx, R, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, 10 + R() * 4, jit(R, pal, 10, 0.08, 0.06)); } }
      else for (let k = 0; k < 3; k++) blossom(ctx, R, x + (R() - 0.5) * 50, y + (R() - 0.5) * 40, kind === 'pink' ? 24 + R() * 6 : 15 + R() * 5, jit(R, pal, 6, 0.06, 0.04));
    }
  });
  flowerBush(CELL.bushWhite, 62, [50, 0.25, 0.92], 'white');
  flowerBush(CELL.bushPink, 63, [338, 0.6, 0.68], 'pink');
  flowerBush(CELL.bushBlue, 64, [222, 0.55, 0.66], 'blue');
  cell(CELL.flowers, 71, R => wildflowers(ctx, R));
  cell(CELL.fern, 81, R => fernFrond(ctx, R));

  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < 16; i++) dilate(img.data, S, (i % 4) * CS, Math.floor(i / 4) * CS, CS);
  const tex = new THREE.DataTexture(new Uint8Array(img.data.buffer), S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(4, renderer ? renderer.capabilities.getMaxAnisotropy() : 1);
  tex.flipY = false; tex.needsUpdate = true;
  ATLAS.tex = tex; ATLAS.canvas = cv;
  return tex;
}
