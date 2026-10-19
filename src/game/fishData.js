// Fish species, appearance, 3D geometry + SVG icon generators
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GeoBuilder } from '../util/geo.js';
import { clamp, lerp, smoothstep } from '../util/math.js';

export const HOURS = {
  any: () => true,
  day: h => h >= 6 && h < 19,
  night: h => h >= 19 || h < 5,
  dusknight: h => h >= 17 || h < 5,
  dawndusk: h => (h >= 5 && h < 9.5) || (h >= 16 && h < 20.5),
  dusk: h => h >= 16 && h < 21.5,
};
export const HOUR_TEXT = { any: '全天', day: '白天', night: '夜晚', dusknight: '傍晚到深夜', dawndusk: '清晨与傍晚', dusk: '傍晚' };
export const WHERE_TEXT = { pond: '池塘', river: '小河', stream: '瀑布下的急流' };

export const FISH = {
  medaka: { name: '青鳉', where: { pond: 9, river: 1.5 }, hours: 'day', len: [2.5, 4.5], price: 12, diff: 0.1, beh: 'dart', desc: '成群在池塘浅水里游来游去的小不点。',
    look: { back: '#7d8f6c', side: '#cfd8bf', belly: '#f1f2e4', fin: '#dfe3cf', bw: 0.15, bh: 0.2, tail: 'round', dorsal: 'small', eye: 1.6 } },
  crucian: { name: '鲫鱼', where: { pond: 10, river: 7, stream: 1 }, hours: 'any', len: [10, 26], price: 30, diff: 0.24, beh: 'smooth', desc: '最常见的淡水鱼，温和又好钓。',
    look: { back: '#575d43', side: '#b3a874', belly: '#ece3c2', fin: '#8e8a66', bw: 0.19, bh: 0.38, tail: 'fork', dorsal: 'tall' } },
  bleak: { name: '白条', where: { river: 10, stream: 3 }, hours: 'day', len: [8, 18], price: 22, diff: 0.18, beh: 'dart', desc: '银光闪闪，喜欢在水面附近抢食。',
    look: { back: '#5d717d', side: '#d7dfe2', belly: '#f6f8f8', fin: '#c9d2d6', bw: 0.12, bh: 0.22, tail: 'fork', dorsal: 'small', eye: 1.25 } },
  carp: { name: '鲤鱼', where: { pond: 5, river: 4 }, hours: 'any', len: [28, 62], price: 85, diff: 0.45, beh: 'smooth', desc: '力气很大，拉起来要稳住。',
    look: { back: '#5a4d30', side: '#c09d4f', belly: '#f0e3b6', fin: '#cf7a3c', bw: 0.2, bh: 0.3, tail: 'fork', dorsal: 'long', barbels: 1 } },
  grass: { name: '草鱼', where: { pond: 4, river: 3.5 }, hours: 'day', len: [35, 80], price: 95, diff: 0.5, beh: 'floater', desc: '爱吃水草，体形修长的大块头。',
    look: { back: '#4b563a', side: '#aaa574', belly: '#ece8cc', fin: '#8f8a5f', bw: 0.17, bh: 0.24, tail: 'fork', dorsal: 'small' } },
  crayfish: { name: '小龙虾', where: { pond: 4.5, river: 1.5 }, hours: 'any', len: [7, 13], price: 35, diff: 0.2, beh: 'sinker', desc: '举着大钳子不肯松手的家伙。',
    look: { back: '#9c2f22', side: '#c9503a', belly: '#e9a080', fin: '#b84430', bw: 0.2, bh: 0.16 } },
  yellowcat: { name: '黄颡鱼', where: { river: 6, pond: 1 }, hours: 'dusknight', len: [12, 28], price: 70, diff: 0.4, beh: 'sinker', desc: '傍晚才出来活动，背鳍有硬刺。',
    look: { back: '#4f421d', side: '#d3a640', belly: '#f2e2a6', fin: '#a88a3a', bw: 0.18, bh: 0.2, tail: 'fork', dorsal: 'small', pattern: 'blotch', barbels: 2 } },
  catfish: { name: '鲶鱼', where: { pond: 3, river: 3 }, hours: 'night', rain: true, len: [40, 95], price: 150, diff: 0.55, beh: 'sinker', desc: '长长的胡须，下雨天和夜里最活跃。',
    look: { back: '#3b3d34', side: '#686955', belly: '#d3ccb4', fin: '#4c4d40', bw: 0.2, bh: 0.17, tail: 'round', dorsal: 'tiny', barbels: 3, head: 'flat' } },
  perch: { name: '鲈鱼', where: { river: 4, stream: 2.5 }, hours: 'dawndusk', len: [25, 55], price: 110, diff: 0.55, beh: 'dart', desc: '清晨和傍晚出来捕食的猎手。',
    look: { back: '#3e5838', side: '#aab581', belly: '#eef0dc', fin: '#df8a3e', bw: 0.17, bh: 0.28, tail: 'fork', dorsal: 'spiny', pattern: 'bars' } },
  trout: { name: '虹鳟', where: { stream: 8, river: 0.6 }, hours: 'any', len: [25, 60], price: 130, diff: 0.62, beh: 'mixed', desc: '只在冰凉湍急的水里出没，身上有一道彩虹。',
    look: { back: '#4b6857', side: '#cfcbb4', belly: '#f3f0e6', fin: '#a8a58a', bw: 0.16, bh: 0.25, tail: 'fork', dorsal: 'small', pattern: 'trout' } },
  snakehead: { name: '乌鳢', where: { pond: 2 }, hours: 'dusk', rain: true, len: [40, 85], price: 180, diff: 0.75, beh: 'dart', desc: '池塘里的霸主，脾气火爆。',
    look: { back: '#2d3127', side: '#585c45', belly: '#c4bd9c', fin: '#3f4334', bw: 0.16, bh: 0.17, tail: 'round', dorsal: 'long', pattern: 'blotch' } },
  koi: { name: '锦鲤', where: { pond: 0.8 }, hours: 'day', len: [40, 75], price: 420, diff: 0.7, beh: 'mixed', rare: true, desc: '传说能带来好运的美丽鲤鱼。',
    look: { back: '#f6f0e6', side: '#f8f3ea', belly: '#fbf8f2', fin: '#f3ece0', bw: 0.2, bh: 0.28, tail: 'fan', dorsal: 'long', pattern: 'koi', barbels: 1 } },
};
export const FISH_KEYS = Object.keys(FISH);

export function fishWeight(key, len) {
  const L = FISH[key].look;
  return 0.0105 * Math.pow(len / 10, 3) * ((L.bh || 0.25) / 0.28) * ((L.bw || 0.18) / 0.18) * 1.5;
}
export function fmtWeight(kg) { return kg < 1 ? Math.max(1, Math.round(kg * 1000)) + ' 克' : kg.toFixed(kg < 10 ? 2 : 1) + ' 千克'; }

export function pickFish(where, hour, rain, rodLevel, depth) {
  const list = []; let total = 0;
  for (const k of FISH_KEYS) {
    const f = FISH[k];
    let w = f.where[where] || 0; if (!w) continue;
    if (!HOURS[f.hours](hour)) { if (f.rain && rain) w *= 0.8; else continue; }
    else if (f.rain && rain) w *= 1.8;
    if (rodLevel > 1 && f.price >= 100) w *= 1.6;
    if (k === 'crayfish' && depth > 1.1) w *= 0.35;
    if ((k === 'catfish' || k === 'carp' || k === 'grass' || k === 'snakehead' || k === 'koi') && depth < 0.7) w *= 0.4;
    if (k === 'medaka' && depth > 1.2) w *= 0.5;
    list.push([k, w]); total += w;
  }
  let r = Math.random() * total;
  for (const [k, w] of list) { r -= w; if (r <= 0) return k; }
  return list.length ? list[list.length - 1][0] : 'crucian';
}

// --------------------------------------------------------------- noise helpers
function hash3(x, y, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const v = (a, b, c) => hash3(xi + a, yi + b, zi + c);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(v(0, 0, 0), v(1, 0, 0), sx), l(v(0, 1, 0), v(1, 1, 0), sx), sy),
           l(l(v(0, 0, 1), v(1, 0, 1), sx), l(v(0, 1, 1), v(1, 1, 1), sx), sy), sz);
}

// --------------------------------------------------------------- geometry
const KOI_VARIANTS = 4;
export function koiVariantCount() { return KOI_VARIANTS; }

function profileR(u, L) {
  // u: -1 (tail end of body) .. +1 (snout)
  const flat = L.head === 'flat';
  const hs = flat ? 0.35 : 0.25;
  if (u > hs) { const t = (u - hs) / (1 - hs); return Math.sqrt(Math.max(0, 1 - Math.pow(t, flat ? 2.6 : 2))); }
  return lerp(0.17, 1, Math.pow(smoothstep(-1.0, hs, u), 0.75));
}
// body occupies z in [-0.3, 0.5]
const bodyZ = u => 0.1 + 0.4 * u;
const uOf = z => (z - 0.1) / 0.4;

function shapeGeo(cmds, segs = 5) {
  const s = new THREE.Shape();
  for (const c of cmds) {
    if (c[0] === 'M') s.moveTo(c[1], c[2]);
    else if (c[0] === 'L') s.lineTo(c[1], c[2]);
    else if (c[0] === 'Q') s.quadraticCurveTo(c[1], c[2], c[3], c[4]);
  }
  const g = new THREE.ShapeGeometry(s, segs);
  const P = g.attributes.position.array;
  for (let i = 0; i < P.length; i += 3) { const x = P[i]; P[i] = 0; P[i + 2] = x; }
  g.deleteAttribute('normal'); g.computeVertexNormals();
  return g;
}

function bodyColorFn(key, L, variant) {
  const back = new THREE.Color(L.back), side = new THREE.Color(L.side), belly = new THREE.Color(L.belly);
  const red = new THREE.Color('#e0442a'), black = new THREE.Color('#1c1c1c'), gold = new THREE.Color('#f0b03c'), pink = new THREE.Color('#e27c86'), spot = new THREE.Color('#26261f');
  const seed = variant * 17 + 3;
  return (c, x, y, z) => {
    const hb = L.bh * 0.5;
    const v = clamp(y / hb, -1, 1);
    c.copy(belly).lerp(side, smoothstep(-0.75, -0.05, v)).lerp(back, smoothstep(0.12, 0.85, v));
    const p = L.pattern;
    if (p === 'koi') {
      if (variant === 2) { c.copy(gold).lerp(new THREE.Color('#fbe3a0'), smoothstep(0.0, -0.8, v)); }
      else if (variant === 3) { c.copy(new THREE.Color('#f07a2a')).lerp(new THREE.Color('#ffd09a'), smoothstep(0.0, -0.9, v)); }
      else {
        const n = vnoise3(x * 7 + seed, y * 7, z * 6.5 + seed * 0.37);
        if (n > 0.5 && v > -0.55) c.lerp(red, smoothstep(0.5, 0.56, n));
        if (variant === 1) { const n2 = vnoise3(x * 13 - seed, y * 13 + 4, z * 12); if (n2 > 0.7 && v > -0.3) c.lerp(black, smoothstep(0.7, 0.75, n2)); }
      }
    } else if (p === 'trout') {
      const band = 1 - smoothstep(0.0, 0.28, Math.abs(v - 0.02));
      c.lerp(pink, band * 0.75);
      const n = vnoise3(x * 34, y * 34, z * 34);
      if (n > 0.78 && v > -0.25) c.lerp(spot, 0.85);
    } else if (p === 'bars') {
      const bar = smoothstep(0.55, 0.78, Math.sin(z * 38 + 1.3) * 0.5 + 0.5) * smoothstep(-0.45, 0.2, v);
      c.multiplyScalar(1 - 0.5 * bar);
    } else if (p === 'blotch') {
      const n = vnoise3(x * 10 + 2, y * 10, z * 9);
      if (n > 0.52 && v > -0.35) c.multiplyScalar(lerp(1, 0.45, smoothstep(0.52, 0.6, n)));
    }
    // scales shimmer + lateral line
    const sc = 0.93 + 0.07 * Math.sin(z * 150 + Math.sin(y * 95) * 1.6) * Math.sin(y * 120 + z * 40);
    c.multiplyScalar(sc);
    if (Math.abs(v - 0.05) < 0.035 && z < 0.32) c.multiplyScalar(0.88);
    // darker snout top
    if (z > 0.38 && v > 0.1) c.multiplyScalar(0.9);
  };
}

function finColorFn(L, alphaEdge = true) {
  const fin = new THREE.Color(L.fin);
  return (c, x, y, z) => { c.copy(fin); const r = 0.9 + 0.12 * Math.sin(z * 90 + y * 30); c.multiplyScalar(r); void alphaEdge; };
}

const _geoCache = new Map();
export function fishGeometry(key, variant = 0) {
  const ck = key + ':' + variant;
  if (_geoCache.has(ck)) return _geoCache.get(ck);
  const g = key === 'crayfish' ? crayfishGeometry() : buildFish(key, variant);
  _geoCache.set(ck, g);
  return g;
}

function buildFish(key, variant) {
  const L = FISH[key].look;
  const B = new GeoBuilder();
  // body (smooth)
  let sg = new THREE.SphereGeometry(0.5, 26, 16);
  sg.deleteAttribute('uv'); sg.deleteAttribute('normal');
  sg = mergeVertices(sg);
  sg.rotateX(Math.PI / 2);
  const P = sg.attributes.position.array;
  const flat = L.head === 'flat';
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    const u = clamp(z / 0.5, -1, 1);
    const r0 = Math.hypot(x, y);
    const nx = r0 > 1e-6 ? x / r0 : 0, ny = r0 > 1e-6 ? y / r0 : 0;
    const R = profileR(u, L);
    let sx = L.bw * 0.5 * R, sy = L.bh * 0.5 * R;
    if (flat) { const k = smoothstep(0.0, 1.0, u); sx *= 1 + 0.35 * k; sy *= 1 - 0.3 * k; }
    // belly slightly fuller, back slightly arched
    const yy = ny * sy * (ny < 0 ? 1.06 : 1.0);
    P[i] = nx * sx; P[i + 1] = yy + 0.012 * Math.cos(u * 1.4) * L.bh; P[i + 2] = bodyZ(u);
  }
  sg.computeVertexNormals();
  B.add(sg, { colorFn: bodyColorFn(key, L, variant) });
  const topY = z => { const u = clamp(uOf(z), -1, 1); return L.bh * 0.5 * profileR(u, L) * (flat ? 1 - 0.3 * smoothstep(0, 1, u) : 1) + 0.012 * Math.cos(u * 1.4) * L.bh; };
  const th = clamp(L.bh / 0.28, 0.75, 1.35);
  const finC = finColorFn(L);
  // tail
  let tail;
  if (L.tail === 'fork') tail = [['M', -0.27, 0.045 * th], ['Q', -0.38, 0.09 * th, -0.5, 0.2 * th], ['Q', -0.44, 0.07 * th, -0.425, 0], ['Q', -0.44, -0.07 * th, -0.5, -0.2 * th], ['Q', -0.38, -0.09 * th, -0.27, -0.045 * th]];
  else if (L.tail === 'fan') tail = [['M', -0.27, 0.05 * th], ['Q', -0.42, 0.15 * th, -0.53, 0.22 * th], ['Q', -0.5, 0.06 * th, -0.46, 0], ['Q', -0.5, -0.06 * th, -0.53, -0.22 * th], ['Q', -0.42, -0.15 * th, -0.27, -0.05 * th]];
  else tail = [['M', -0.27, 0.045 * th], ['Q', -0.42, 0.17 * th, -0.5, 0.06 * th], ['Q', -0.53, 0, -0.5, -0.06 * th], ['Q', -0.42, -0.17 * th, -0.27, -0.045 * th]];
  B.add(shapeGeo(tail), { colorFn: (c, x, y, z) => { finC(c, x, y, z); if (L.pattern === 'trout' && vnoise3(y * 40, z * 40, 1) > 0.78) c.multiplyScalar(0.35); } });
  // dorsal
  const d = L.dorsal || 'small';
  let dz0, dz1, dh;
  if (d === 'tall') { dz0 = 0.14; dz1 = -0.12; dh = 0.12; }
  else if (d === 'long') { dz0 = 0.18; dz1 = -0.22; dh = 0.075; }
  else if (d === 'spiny') { dz0 = 0.16; dz1 = -0.2; dh = 0.1; }
  else if (d === 'tiny') { dz0 = 0.06; dz1 = -0.02; dh = 0.04; }
  else { dz0 = 0.08; dz1 = -0.1; dh = 0.085; }
  const dc = [['M', dz0, topY(dz0) - 0.012]];
  if (d === 'spiny') {
    const n = 7;
    for (let k = 0; k <= n; k++) {
      const z = lerp(dz0 - 0.02, dz1 + 0.02, k / n);
      const hk = k < 4 ? dh * (1 - k * 0.12) : dh * 0.55;
      dc.push(['L', z + 0.012, topY(z) + hk * th]);
      dc.push(['L', z - 0.012, topY(z) + hk * th * 0.6]);
    }
  } else {
    dc.push(['Q', dz0 - 0.01, topY(dz0) + dh * th * 1.1, lerp(dz0, dz1, 0.3), topY(lerp(dz0, dz1, 0.3)) + dh * th]);
    dc.push(['Q', lerp(dz0, dz1, 0.75), topY(lerp(dz0, dz1, 0.75)) + dh * th * 0.45, dz1 - 0.02, topY(dz1) + 0.008]);
  }
  dc.push(['L', dz1, topY(dz1) - 0.012]);
  B.add(shapeGeo(dc), { colorFn: finC });
  // anal fin
  const botY = z => -topY(z) * 1.04;
  const az0 = -0.1, az1 = -0.23;
  B.add(shapeGeo([['M', az0, botY(az0) + 0.012], ['Q', az0 - 0.02, botY(az0) - 0.07 * th, az1, botY(az1) - 0.02], ['L', az1 + 0.01, botY(az1) + 0.01]]), { colorFn: finC });
  // pelvic fins (pair)
  for (const s of [-1, 1]) {
    const pf = new THREE.Shape(); pf.moveTo(0, 0); pf.quadraticCurveTo(0.05, -0.03, 0.09, -0.012); pf.quadraticCurveTo(0.05, 0.012, 0, 0);
    const pg = new THREE.ShapeGeometry(pf, 4);
    B.add(pg, { pos: [s * L.bw * 0.22, -L.bh * 0.36, 0.06], rot: [0.0, s > 0 ? -Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.5 + Math.PI, s * 0.6], colorFn: finC });
  }
  // pectoral fins
  for (const s of [-1, 1]) {
    const pf = new THREE.Shape(); pf.moveTo(0, 0); pf.quadraticCurveTo(0.03, 0.035, 0.1, 0.01); pf.quadraticCurveTo(0.06, -0.02, 0, 0);
    const pg = new THREE.ShapeGeometry(pf, 4);
    const hw = L.bw * 0.5 * profileR(uOf(0.28), L) * (flat ? 1.2 : 1);
    B.add(pg, { pos: [s * hw * 0.85, -L.bh * 0.16, 0.27], rot: [0.5, s > 0 ? -Math.PI / 2 - 0.6 : Math.PI / 2 + 0.6, s * -0.4], colorFn: finC });
  }
  // eyes
  const ez = 0.37, eu = uOf(ez);
  const ehw = L.bw * 0.5 * profileR(eu, L) * (flat ? 1 + 0.35 * smoothstep(0, 1, eu) : 1);
  const re = 0.026 * (L.eye || 1) * (flat ? 0.75 : 1);
  for (const s of [-1, 1]) {
    const ey = flat ? L.bh * 0.12 : L.bh * 0.08;
    B.add(new THREE.SphereGeometry(re, 10, 8), { pos: [s * (ehw * 0.86), ey, ez], color: '#efe6c8' });
    B.add(new THREE.SphereGeometry(re * 0.66, 10, 8), { pos: [s * (ehw * 0.86 + re * 0.5), ey, ez + re * 0.12], color: '#141414' });
    B.add(new THREE.SphereGeometry(re * 0.2, 6, 4), { pos: [s * (ehw * 0.86 + re * 0.95), ey + re * 0.3, ez + re * 0.3], color: '#ffffff' });
  }
  // barbels
  const nb = L.barbels || 0;
  if (nb) {
    const len = nb === 3 ? 0.28 : nb === 2 ? 0.12 : 0.06;
    const pairs = nb === 3 ? [[0.03, 0.0, len], [0.05, -0.03, len * 0.35]] : nb === 2 ? [[0.03, -0.01, len], [0.02, -0.03, len * 0.6]] : [[0.025, -0.02, len]];
    for (const [ox, oy, l] of pairs) for (const s of [-1, 1]) {
      const cg = new THREE.CylinderGeometry(0.004, 0.0055, l, 4, 4);
      cg.translate(0, -l / 2, 0);
      B.add(cg, { pos: [s * ox, oy - L.bh * 0.05, 0.47], rot: [-1.2 - (nb === 3 ? 0.3 : 0), s * 0.9, 0], color: L.back,
        warp: (x, y, z) => [x, y + 0.25 * (z - 0.47) * (z - 0.47) * 4, z] });
    }
  }
  return B.build();
}

function crayfishGeometry() {
  const L = FISH.crayfish.look;
  const B = new GeoBuilder();
  const shell = (c, x, y, z) => { c.set(L.belly).lerp(new THREE.Color(L.side), smoothstep(-0.05, 0.0, y)).lerp(new THREE.Color(L.back), smoothstep(0.01, 0.06, y)); c.multiplyScalar(0.92 + 0.08 * Math.sin(z * 80)); };
  B.add(new THREE.SphereGeometry(1, 16, 12), { pos: [0, 0.01, 0.12], scale: [0.085, 0.07, 0.17], colorFn: shell });
  B.add(new THREE.ConeGeometry(0.03, 0.08, 8), { pos: [0, 0.01, 0.31], rot: [Math.PI / 2, 0, 0], colorFn: shell });
  for (let k = 0; k < 6; k++) {
    const z = -0.06 - k * 0.062, s = 1 - k * 0.1;
    B.add(new THREE.SphereGeometry(1, 12, 8), { pos: [0, 0.0 - k * 0.004, z], scale: [0.072 * s, 0.05 * s, 0.045], colorFn: shell });
  }
  for (const a of [-0.6, 0, 0.6]) B.add(new THREE.SphereGeometry(1, 8, 6), { pos: [Math.sin(a) * 0.05, -0.02, -0.46 - Math.cos(a) * 0.02], scale: [0.035, 0.008, 0.055], rot: [0, a, 0], colorFn: shell });
  for (const s of [-1, 1]) {
    // arm
    B.add(new THREE.CylinderGeometry(0.014, 0.018, 0.16, 6), { pos: [s * 0.1, 0.0, 0.3], rot: [Math.PI / 2, s * -0.5, 0], colorFn: shell });
    // claw
    B.add(new THREE.SphereGeometry(1, 12, 8), { pos: [s * 0.15, 0.0, 0.42], scale: [0.042, 0.03, 0.08], rot: [0, s * -0.25, 0], colorFn: shell });
    B.add(new THREE.ConeGeometry(0.018, 0.09, 6), { pos: [s * 0.165, 0.0, 0.52], rot: [Math.PI / 2, s * -0.15, 0], colorFn: shell });
    B.add(new THREE.ConeGeometry(0.014, 0.08, 6), { pos: [s * 0.13, 0.0, 0.51], rot: [Math.PI / 2, s * 0.15, 0], colorFn: shell });
    // antennae
    const ag = new THREE.CylinderGeometry(0.0025, 0.004, 0.5, 3, 6); ag.translate(0, 0.25, 0);
    B.add(ag, { pos: [s * 0.03, 0.03, 0.3], rot: [Math.PI / 2 - 0.25, s * -0.35, 0], color: L.back, warp: (x, y, z) => [x, y + 0.12 * Math.max(0, z - 0.3) ** 2 * 4, z] });
    // legs
    for (let k = 0; k < 4; k++) B.add(new THREE.CylinderGeometry(0.006, 0.008, 0.1, 4), { pos: [s * 0.08, -0.04, 0.17 - k * 0.04], rot: [0, 0, s * 1.0], colorFn: shell });
    // eyes
    B.add(new THREE.SphereGeometry(0.012, 6, 4), { pos: [s * 0.03, 0.045, 0.3], color: '#111111' });
  }
  return B.build();
}

// material shared by fish meshes; optional tail-wiggle driven by instanced attribute aSwim (phase, amp)
export function fishMaterial(wiggle) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.08, side: THREE.DoubleSide });
  if (wiggle) {
    m.customProgramCacheKey = () => 'fishwiggle';
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aSwim;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{ float tw = clamp(0.3 - position.z, 0.0, 1.0);
  transformed.x += sin(aSwim.x - position.z * 6.5) * aSwim.y * (0.015 + tw * tw * 0.42);
  transformed.x -= sin(aSwim.x) * aSwim.y * 0.02 * clamp(position.z * 3.0, 0.0, 1.0); }`);
    };
  }
  return m;
}

export function makeFishMesh(key, variant, size, mat) {
  const g = fishGeometry(key, variant);
  const m = new THREE.Mesh(g, mat);
  m.scale.setScalar(size);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// --------------------------------------------------------------- SVG icons
let _svgId = 0;
export function fishSVG(key, size = 64, variant = 0, silhouette = false) {
  const f = FISH[key]; const L = f.look; const id = 'fg' + (_svgId++);
  if (silhouette) return `<svg viewBox="0 0 100 60" width="${size}" height="${size * 0.6}"><path d="M14 30 Q30 12 62 14 Q86 16 92 30 Q86 44 62 46 Q30 48 14 30 Z M16 30 L4 18 L8 30 L4 42 Z" fill="#5e5a52" opacity="0.55"/></svg>`;
  if (key === 'crayfish') {
    return `<svg viewBox="0 0 100 60" width="${size}" height="${size * 0.6}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L.back}"/><stop offset="1" stop-color="${L.side}"/></linearGradient></defs>
<g stroke="${L.back}" stroke-width="1.2" fill="none"><path d="M70 26 Q88 10 98 6"/><path d="M70 34 Q88 50 98 54"/></g>
<path d="M66 22 Q80 12 92 18 Q84 22 78 24 Z" fill="url(#${id})"/><path d="M66 38 Q80 48 92 42 Q84 38 78 36 Z" fill="url(#${id})"/>
<ellipse cx="56" cy="30" rx="16" ry="9" fill="url(#${id})"/>
${[0, 1, 2, 3, 4].map(k => `<ellipse cx="${40 - k * 6}" cy="30" rx="5" ry="${8 - k * 0.8}" fill="url(#${id})" stroke="#7a2418" stroke-width="0.6"/>`).join('')}
<path d="M14 30 L6 22 L4 30 L6 38 Z" fill="${L.side}"/><circle cx="68" cy="27" r="1.6" fill="#111"/><circle cx="68" cy="33" r="1.6" fill="#111"/></svg>`;
  }
  const bh = clamp(L.bh * 100 * 0.95, 14, 38), half = bh / 2;
  const top = 30 - half, bot = 30 + half;
  const tailH = clamp(half * 0.9, 8, 16);
  let tail;
  if (L.tail === 'fork' || L.tail === 'fan') tail = `M24 30 Q14 ${30 - tailH * 0.5} 5 ${30 - tailH} Q11 30 5 ${30 + tailH} Q14 ${30 + tailH * 0.5} 24 30 Z`;
  else tail = `M24 30 Q10 ${30 - tailH} 6 ${30 - tailH * 0.4} Q3 30 6 ${30 + tailH * 0.4} Q10 ${30 + tailH} 24 30 Z`;
  const dh = L.dorsal === 'tall' ? 12 : L.dorsal === 'long' ? 7 : L.dorsal === 'spiny' ? 10 : L.dorsal === 'tiny' ? 3 : 8;
  const dorsal = L.dorsal === 'long' ? `M66 ${top + 2} Q60 ${top - dh} 52 ${top - dh * 0.7} L34 ${top + 4} Z` : L.dorsal === 'spiny' ? `M64 ${top + 2} L61 ${top - dh} L57 ${top - dh * 0.4} L54 ${top - dh * 0.9} L50 ${top - dh * 0.35} L47 ${top - dh * 0.7} L42 ${top - dh * 0.4} L36 ${top + 4} Z` : `M60 ${top + 1} Q56 ${top - dh} 50 ${top - dh * 0.9} Q46 ${top - dh * 0.3} 42 ${top + 3} Z`;
  const body = `M22 30 Q30 ${top - 1} 60 ${top} Q84 ${top + 2} 93 30 Q84 ${bot - 1} 60 ${bot} Q30 ${bot + 1} 22 30 Z`;
  let pat = '';
  if (L.pattern === 'koi') {
    if (variant === 2) pat = `<path d="${body}" fill="#f0b03c" opacity="0.9"/>`;
    else if (variant === 3) pat = `<path d="${body}" fill="#f07a2a" opacity="0.85"/>`;
    else pat = `<g clip-path="url(#c${id})"><circle cx="74" cy="${top + 4}" r="9" fill="#e0442a"/><circle cx="50" cy="${top + 2}" r="11" fill="#e0442a"/><circle cx="32" cy="${top + 6}" r="6" fill="#e0442a"/>${variant === 1 ? `<circle cx="60" cy="${top + 8}" r="3" fill="#1c1c1c"/><circle cx="40" cy="${top + 5}" r="2.4" fill="#1c1c1c"/>` : ''}</g>`;
  } else if (L.pattern === 'trout') pat = `<path d="M26 31 Q60 26 90 30 Q60 35 26 31 Z" fill="#e27c86" opacity="0.8"/>${[[40, top + 5], [52, top + 4], [64, top + 6], [46, top + 9], [72, top + 5], [58, top + 9]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="1.3" fill="#26261f"/>`).join('')}`;
  else if (L.pattern === 'bars') pat = `<g clip-path="url(#c${id})" opacity="0.4">${[36, 46, 56, 66, 76].map(x => `<rect x="${x}" y="${top}" width="4" height="${bh * 0.7}" fill="#1f2a1c"/>`).join('')}</g>`;
  else if (L.pattern === 'blotch') pat = `<g clip-path="url(#c${id})" opacity="0.5">${[[38, top + 6, 5], [55, top + 5, 6], [70, top + 7, 4], [46, top + 12, 3]].map(p => `<ellipse cx="${p[0]}" cy="${p[1]}" rx="${p[2]}" ry="${p[2] * 0.7}" fill="#1b1d14"/>`).join('')}</g>`;
  const barb = L.barbels ? `<path d="M92 31 Q98 ${L.barbels === 3 ? 44 : 37} ${L.barbels === 3 ? 90 : 96} ${L.barbels === 3 ? 52 : 40}" stroke="${L.back}" stroke-width="1" fill="none"/>` : '';
  const er = 2.4 * (L.eye || 1);
  return `<svg viewBox="0 0 100 60" width="${size}" height="${size * 0.6}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L.back}"/><stop offset="0.5" stop-color="${L.side}"/><stop offset="1" stop-color="${L.belly}"/></linearGradient><clipPath id="c${id}"><path d="${body}"/></clipPath></defs>
<path d="${tail}" fill="${L.fin}"/><path d="${dorsal}" fill="${L.fin}"/><path d="M46 ${bot - 1} Q42 ${bot + 6} 36 ${bot + 4} L34 ${bot - 2} Z" fill="${L.fin}"/>
<path d="${body}" fill="url(#${id})"/>${pat}
<path d="M70 ${30 + half * 0.25} Q64 ${30 + half * 0.6} 58 ${30 + half * 0.5}" stroke="${L.fin}" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M76 ${top + 3} Q79 30 76 ${bot - 3}" stroke="rgba(0,0,0,0.18)" stroke-width="1.2" fill="none"/>
<circle cx="84" cy="${30 - half * 0.15}" r="${er}" fill="#f4eedc"/><circle cx="84.6" cy="${30 - half * 0.15}" r="${er * 0.62}" fill="#111"/>${barb}</svg>`;
}
