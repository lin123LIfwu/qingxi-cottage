import * as THREE from 'three';
import { GeoBuilder, mat4 } from '../util/geo.js';
import { GLSL_NOISE } from '../util/glsl.js';
import { mulberry32 } from '../util/noise.js';
import { clamp, lerp, smoothstep } from '../util/math.js';
import { FARM, POND, SHOP, BIN, BARREL, HOME_H } from '../config.js';
import { House } from './house.js';

const C = (h) => new THREE.Color(h);
const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC","Noto Sans CJK SC",sans-serif';

function patchGrain(mat, scale = 2.5, amt = 0.3, key = 'g') {
  mat.customProgramCacheKey = () => 'grain' + key + scale + amt;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSP;\n' + GLSL_NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float gn = fbm3(vSP.xz * ${scale.toFixed(2)} + vSP.y * ${(scale * 0.8).toFixed(2)} + vec2(vSP.y * 3.1, 0.0));
  float gl = vnoise(vec2(vSP.x * 1.3 + vSP.z * 1.3, vSP.y * 14.0));
  diffuseColor.rgb *= (1.0 - ${amt.toFixed(2)} * 0.5) + ${amt.toFixed(2)} * (gn * 0.7 + gl * 0.3); }`);
  };
  return mat;
}

export function textTexture(text, w, h, o = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = o.bg ?? '#b98a58'; g.fillRect(0, 0, w, h);
  // wood grain
  const rnd = mulberry32(text.length * 31 + w);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(80,45,20,${0.06 + rnd() * 0.08})`; g.lineWidth = 1 + rnd() * 3;
    g.beginPath(); const y = rnd() * h; g.moveTo(0, y);
    g.bezierCurveTo(w * 0.3, y + (rnd() - 0.5) * 12, w * 0.7, y + (rnd() - 0.5) * 12, w, y + (rnd() - 0.5) * 8); g.stroke();
  }
  g.strokeStyle = 'rgba(60,35,15,0.55)'; g.lineWidth = Math.max(4, h * 0.05); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
  g.fillStyle = o.fg ?? '#4a2c16';
  g.font = `bold ${o.size ?? Math.floor(h * 0.56)}px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + (o.dy ?? h * 0.03));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class Structures {
  constructor(T, U, colliders) {
    this.T = T; this.U = U; this.col = colliders;
    this.group = new THREE.Group(); this.group.name = 'structures';
    this.rand = mulberry32(555);
    this.noGrassRects = [];
    this.interact = [];
    this.glows = []; this.lights = [];
    this.mats = {
      wood: patchGrain(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }), 2.2, 0.34, 'w'),
      stone: patchGrain(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 3.5, 0.3, 's'),
      roof: patchGrain(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }), 4.0, 0.25, 'r'),
      metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.65 }),
      cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }),
      plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
      glass: new THREE.MeshStandardMaterial({ color: '#33414d', roughness: 0.08, metalness: 0.1, emissive: '#ffb45e', emissiveIntensity: 0 }),
      glow: new THREE.MeshStandardMaterial({ color: '#fff0c8', roughness: 0.4, emissive: '#ffb04a', emissiveIntensity: 0.0 }),
    };
    this.house = new House(T, U, colliders, this);   // the timber house (model attached after loadModels)
    this.buildFence();
    this.buildBridge();
    this.buildDock();
    this.buildShop();
    this.buildBin();
    this.buildBarrel();
    this.buildProps();
  }
  mesh(B, mat, shadow = true, parent = this.group) {
    const m = new THREE.Mesh(B.build(), mat);
    m.castShadow = shadow; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  noGrass(x, z) {
    for (const r of this.noGrassRects) if (x > r[0] && x < r[2] && z > r[1] && z < r[3]) return true;
    return false;
  }
  box(B, w, h, d, pos, rot = [0, 0, 0], color = '#ffffff', jit = 0, colorFn) {
    const c = C(color);
    if (jit) c.multiplyScalar(1 + (this.rand() - 0.5) * 2 * jit);
    B.add(new THREE.BoxGeometry(w, h, d), { pos, rot, color: c, colorFn });
  }

  // ----------------------------------------------------------- fence
  buildFence() {
    const F = FARM, R = this.rand, B = new GeoBuilder();
    const H = HOME_H;
    const post = (x, z, h = 1.0) => {
      B.add(new THREE.BoxGeometry(0.13, h, 0.13), { pos: [x, H + h / 2 - 0.05, z], rot: [0, (R() - 0.5) * 0.2, (R() - 0.5) * 0.05], color: C('#c9a878').multiplyScalar(0.85 + R() * 0.2) });
      B.add(new THREE.ConeGeometry(0.1, 0.14, 4), { pos: [x, H + h + 0.02, z], rot: [0, Math.PI / 4, 0], color: '#b8956a' });
    };
    const rail = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az), rot = -Math.atan2(bz - az, bx - ax);
      for (const y of [0.38, 0.74]) B.add(new THREE.BoxGeometry(len + 0.1, 0.09, 0.05), { pos: [(ax + bx) / 2, H + y, (az + bz) / 2], rot: [0, rot, (R() - 0.5) * 0.03], color: C('#d2b388').multiplyScalar(0.85 + R() * 0.2) });
    };
    const side = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 1.25));
      for (let i = 0; i <= n; i++) post(lerp(ax, bx, i / n), lerp(az, bz, i / n));
      for (let i = 0; i < n; i++) rail(lerp(ax, bx, i / n), lerp(az, bz, i / n), lerp(ax, bx, (i + 1) / n), lerp(az, bz, (i + 1) / n));
      this.col.addWall(ax, az, bx, bz, 0.1, 'fence');
    };
    side(F.x0, F.z0, F.x1, F.z0); side(F.x0, F.z0, F.x0, F.z1); side(F.x1, F.z0, F.x1, F.z1);
    side(F.x0, F.z1, F.gateX0, F.z1); side(F.gateX1, F.z1, F.x1, F.z1);
    // gate arch
    for (const x of [F.gateX0 - 0.1, F.gateX1 + 0.1]) {
      B.add(new THREE.BoxGeometry(0.2, 2.6, 0.2), { pos: [x, H + 1.25, F.z1], color: '#9a6b44' });
      this.col.addCircle(x, F.z1, 0.16, 'post');
    }
    B.add(new THREE.BoxGeometry(F.gateX1 - F.gateX0 + 0.8, 0.18, 0.24), { pos: [(F.gateX0 + F.gateX1) / 2, H + 2.5, F.z1], color: '#8a5b3a' });
    // open gate leaf
    const gx = F.gateX1 + 0.1;
    for (const y of [0.35, 0.75]) B.add(new THREE.BoxGeometry(0.06, 0.09, 1.0), { pos: [gx + 0.05, H + y, F.z1 + 0.55], color: '#d2b388' });
    for (const dz of [0.15, 0.55, 0.95]) B.add(new THREE.BoxGeometry(0.06, 0.8, 0.1), { pos: [gx + 0.05, H + 0.5, F.z1 + dz], color: '#c9a878' });
    this.mesh(B, this.mats.wood);
    // sign board
    const tex = textTexture('青溪菜园', 512, 160, { bg: '#c49463' });
    const sb = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.56, 0.08), [this.mats.plain, this.mats.plain, this.mats.plain, this.mats.plain, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })]);
    sb.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sb.geometry.attributes.position.count * 3).fill(0.55), 3));
    sb.position.set((F.gateX0 + F.gateX1) / 2, H + 2.05, F.z1 + 0.02); sb.castShadow = true;
    this.group.add(sb);
    const ch = new GeoBuilder();
    for (const x of [-0.6, 0.6]) ch.add(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 3), { pos: [(F.gateX0 + F.gateX1) / 2 + x, H + 2.38, F.z1], color: '#333' });
    this.mesh(ch, this.mats.metal, false);
  }

  // ----------------------------------------------------------- bridge
  buildBridge() {
    const b = this.T.bridge, R = this.rand;
    const g = new THREE.Group(); g.position.set(b.cx, 0, b.cz); g.rotation.y = -Math.atan2(b.az, b.ax); this.group.add(g);
    const W = new GeoBuilder(), S = new GeoBuilder();
    const hw = b.halfW;
    const half = b.span / 2 + 0.5;
    const hf = (u) => b.heightFn(clamp(u, -b.span / 2, b.span / 2));
    for (let u = -half; u <= half; u += 0.27) {
      const y = hf(u), dy = (hf(u + 0.1) - hf(u - 0.1)) / 0.2;
      W.add(new THREE.BoxGeometry(0.25, 0.08, hw * 2 + (R() - 0.5) * 0.08), { pos: [u, y - 0.04, (R() - 0.5) * 0.04], rot: [0, 0, Math.atan(dy)], color: C('#a87a4e').multiplyScalar(0.82 + R() * 0.28) });
    }
    const seg = 16;
    for (const v of [-hw + 0.12, hw - 0.12, -hw - 0.04, hw + 0.04]) {
      for (let i = 0; i < seg; i++) {
        const u0 = -half + (i / seg) * 2 * half, u1 = -half + ((i + 1) / seg) * 2 * half;
        const y0 = hf(u0), y1 = hf(u1), len = Math.hypot(u1 - u0, y1 - y0);
        const under = Math.abs(v) < hw;
        W.add(new THREE.BoxGeometry(len + 0.02, under ? 0.22 : 0.16, 0.12), { pos: [(u0 + u1) / 2, (y0 + y1) / 2 - (under ? 0.19 : 0.12), v], rot: [0, 0, Math.atan2(y1 - y0, u1 - u0)], color: '#7c5434' });
      }
    }
    // railings
    const np = 9;
    for (const v of [-hw - 0.02, hw + 0.02]) {
      const tops = [];
      for (let i = 0; i <= np; i++) {
        const u = -b.span / 2 - 0.2 + (i / np) * (b.span + 0.4), y = hf(u);
        W.add(new THREE.BoxGeometry(0.12, 1.0, 0.12), { pos: [u, y + 0.42, v], color: '#8d5f3b' });
        W.add(new THREE.SphereGeometry(0.085, 8, 6), { pos: [u, y + 0.95, v], color: '#9c6b43' });
        tops.push([u, y]);
      }
      for (let i = 0; i < np; i++) {
        const [u0, y0] = tops[i], [u1, y1] = tops[i + 1], len = Math.hypot(u1 - u0, y1 - y0), a = Math.atan2(y1 - y0, u1 - u0);
        W.add(new THREE.BoxGeometry(len, 0.09, 0.1), { pos: [(u0 + u1) / 2, (y0 + y1) / 2 + 0.85, v], rot: [0, 0, a], color: '#b58556' });
        W.add(new THREE.BoxGeometry(len, 0.06, 0.06), { pos: [(u0 + u1) / 2, (y0 + y1) / 2 + 0.45, v], rot: [0, 0, a], color: '#a1734a' });
      }
    }
    // stone abutments
    for (const sgn of [-1, 1]) {
      const u = sgn * (b.span / 2 - 0.2), y = hf(u);
      for (let k = 0; k < 7; k++) S.add(new THREE.DodecahedronGeometry(1, 0), { pos: [u + (R() - 0.5) * 0.8, y - 0.45 - R() * 0.3, (k - 3) * 0.42], scale: [0.45, 0.35, 0.3], rot: [R(), R(), R()], color: C('#8d877e').multiplyScalar(0.85 + R() * 0.25) });
    }
    this.mesh(W, this.mats.wood, true, g); this.mesh(S, this.mats.stone, true, g);
    // railing colliders (world)
    const ax = b.ax, az = b.az, nx = -az, nz = ax;
    for (const v of [-hw - 0.05, hw + 0.05]) {
      const u0 = -b.span / 2 - 0.2, u1 = b.span / 2 + 0.2;
      this.col.addWall(b.cx + ax * u0 + nx * v, b.cz + az * u0 + nz * v, b.cx + ax * u1 + nx * v, b.cz + az * u1 + nz * v, 0.1, 'rail');
    }
  }

  // ----------------------------------------------------------- dock
  buildDock() {
    const d = this.T.dock, R = this.rand, T = this.T;
    const B = new GeoBuilder(), M = new GeoBuilder(), G = new GeoBuilder();
    const x0 = d.cx - d.halfLen, x1 = d.cx + d.halfLen, hw = d.halfW, y = d.h;
    for (let x = x0 + 0.13; x < x1; x += 0.26) B.add(new THREE.BoxGeometry(0.23, 0.07, hw * 2 + (R() - 0.5) * 0.06), { pos: [x, y - 0.035, d.cz + (R() - 0.5) * 0.04], rot: [0, (R() - 0.5) * 0.03, 0], color: C('#a87a4e').multiplyScalar(0.82 + R() * 0.26) });
    for (const v of [-hw + 0.1, hw - 0.1]) B.add(new THREE.BoxGeometry(x1 - x0, 0.16, 0.12), { pos: [(x0 + x1) / 2, y - 0.15, d.cz + v], color: '#6d4a30' });
    for (let x = x0 + 0.3; x <= x1 + 0.01; x += 2.0) for (const v of [-hw, hw]) {
      const gy = T.heightAt(x, d.cz + v) - 0.3, h = y - gy + 0.12;
      B.add(new THREE.CylinderGeometry(0.1, 0.11, h, 8), { pos: [x, gy + h / 2, d.cz + v], color: '#5e4029' });
    }
    // lantern post at end
    const lx = x0 + 0.25, lz = d.cz - hw + 0.12;
    B.add(new THREE.BoxGeometry(0.12, 1.7, 0.12), { pos: [lx, y + 0.85, lz], color: '#6d4a30' });
    B.add(new THREE.BoxGeometry(0.5, 0.08, 0.08), { pos: [lx + 0.2, y + 1.66, lz], color: '#6d4a30' });
    M.add(new THREE.CylinderGeometry(0.11, 0.09, 0.05, 8), { pos: [lx + 0.4, y + 1.56, lz], color: '#2b2b2b' });
    M.add(new THREE.ConeGeometry(0.13, 0.1, 8), { pos: [lx + 0.4, y + 1.6, lz], color: '#2b2b2b' });
    G.add(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), { pos: [lx + 0.4, y + 1.43, lz] });
    const lamp = new THREE.PointLight('#ffb35c', 0, 10, 1.6); lamp.position.set(lx + 0.4, y + 1.3, lz); this.group.add(lamp); this.lights.push({ l: lamp, k: 5 });
    this.col.addCircle(lx, lz, 0.12, 'post');
    this.mesh(B, this.mats.wood); this.mesh(M, this.mats.metal); this.mesh(G, this.mats.glow, false);
    // rowboat
    const hull = new THREE.BoxGeometry(2.7, 0.5, 1.05, 10, 2, 3);
    const P = hull.attributes.position.array;
    for (let i = 0; i < P.length; i += 3) {
      const u = P[i] / 1.35, t = (P[i + 1] + 0.25) / 0.5;
      P[i + 2] *= (1 - Math.pow(Math.abs(u), 2.4) * 0.82) * (0.62 + 0.38 * t);
      P[i + 1] += Math.pow(Math.abs(u), 3) * 0.22 * (1 - t * 0.4);
    }
    hull.computeVertexNormals();
    const BB = new GeoBuilder();
    BB.add(hull, { color: '#8f5d3b', colorFn: (c, x, yy, z, nx, ny) => { if (ny > 0.8 && yy > 0.2) c.set('#5a3a25'); else if (yy > 0.12) c.set('#3f8a8c'); else if (yy > 0.05) c.set('#f1ead8'); } });
    for (const x of [-0.5, 0.5]) BB.add(new THREE.BoxGeometry(0.26, 0.05, 0.85), { pos: [x, 0.27, 0], color: '#b58556' });
    BB.add(new THREE.BoxGeometry(1.6, 0.04, 0.06), { pos: [0.1, 0.32, 0.25], rot: [0, 0.1, 0.05], color: '#c9a878' });
    this.boat = new THREE.Mesh(BB.build(), this.mats.wood); this.boat.castShadow = true; this.boat.receiveShadow = true;
    this.boatBase = new THREE.Vector3(d.cx + 0.4, POND.level - 0.12, d.cz + hw + 0.95);
    this.boat.position.copy(this.boatBase); this.boat.rotation.y = 0.12;
    this.group.add(this.boat);
    this.col.addBox(this.boatBase.x, this.boatBase.z, 1.35, 0.5, 0.12, 'boat');
    // rope
    const rope = new GeoBuilder();
    rope.add(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 4), { pos: [d.cx - 0.6, y - 0.05, d.cz + hw + 0.4], rot: [0, 0, 1.2], color: '#d9c49a' });
    this.mesh(rope, this.mats.plain, false);
    this.noGrassRects.push([x0 - 0.2, d.cz - hw - 0.2, x1 + 0.3, d.cz + hw + 0.2]);
  }

  // ----------------------------------------------------------- seed stall
  buildShop() {
    const R = this.rand, g = new THREE.Group(); g.position.set(SHOP.x, HOME_H, SHOP.z); this.group.add(g);
    const W = new GeoBuilder(), Cl = new GeoBuilder(), P = new GeoBuilder();
    this.box(W, 2.4, 0.9, 0.85, [0, 0.45, 0], [0, 0, 0], '#9c6b43');
    for (let i = 0; i < 6; i++) this.box(W, 0.36, 0.8, 0.04, [-1.0 + i * 0.4, 0.45, 0.44], [0, 0, 0], '#b07c4f', 0.08);
    this.box(W, 2.6, 0.08, 1.0, [0, 0.93, 0.02], [0, 0, 0], '#c49463');
    for (const [x, z] of [[-1.25, -0.45], [1.25, -0.45], [-1.25, 0.55], [1.25, 0.55]]) this.box(W, 0.12, z > 0 ? 2.15 : 2.45, 0.12, [x, (z > 0 ? 2.15 : 2.45) / 2, z], [0, 0, 0], '#8a5b3a');
    // striped awning
    const n = 8, aw = 2.9;
    for (let i = 0; i < n; i++) {
      const x = -aw / 2 + (i + 0.5) * aw / n;
      Cl.add(new THREE.BoxGeometry(aw / n + 0.005, 0.03, 1.5), { pos: [x, 2.33, 0.1], rot: [-0.28, 0, 0], color: i % 2 ? '#f6ecd8' : '#d9534a' });
      Cl.add(new THREE.CylinderGeometry(aw / n / 2, aw / n / 2, 0.03, 10, 1, false, 0, Math.PI), { pos: [x, 2.12, 0.83], rot: [0, 0, Math.PI / 2], scale: [1, 1, 1], color: i % 2 ? '#f6ecd8' : '#d9534a' });
    }
    // goods
    const crate = (x, z, col) => {
      this.box(W, 0.55, 0.22, 0.4, [x, 1.08, z], [0, (R() - 0.5) * 0.2, 0], '#b58556');
      for (let k = 0; k < 7; k++) P.add(new THREE.SphereGeometry(0.075, 8, 6), { pos: [x + (R() - 0.5) * 0.42, 1.22 + R() * 0.04, z + (R() - 0.5) * 0.28], color: C(col).multiplyScalar(0.9 + R() * 0.2) });
    };
    crate(-0.85, 0.05, '#e5533b'); crate(-0.25, 0.1, '#f39c32'); crate(0.95, 0.05, '#6fb24a');
    const packs = ['#f5d36b', '#f08f6b', '#8fd18f', '#e86b6b', '#ffd94a', '#f0a04a'];
    for (let i = 0; i < 6; i++) this.box(P, 0.13, 0.18, 0.03, [0.2 + (i % 3) * 0.17, 1.07 + Math.floor(i / 3) * 0.02, -0.1 + Math.floor(i / 3) * 0.22], [-0.3, (R() - 0.5) * 0.3, 0], packs[i]);
    // pots of seedlings
    for (const x of [-1.5, 1.55]) {
      P.add(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 10), { pos: [x, 0.15, 0.7], color: '#c26a45' });
      P.add(new THREE.IcosahedronGeometry(0.24, 1), { pos: [x, 0.42, 0.7], scale: [1, 0.8, 1], color: '#5c9c3c' });
    }
    this.mesh(W, this.mats.wood, true, g); this.mesh(Cl, this.mats.cloth, true, g); this.mesh(P, this.mats.plain, true, g);
    const tex = textTexture('种子铺', 384, 128, { bg: '#f3e2bf', fg: '#7a3b22' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    sign.position.set(0, 2.42, 0.92); sign.rotation.x = -0.28; g.add(sign);
    this.col.addBox(SHOP.x, SHOP.z + 0.05, 1.32, 0.62, 0, 'shop');
    this.noGrassRects.push([SHOP.x - 1.4, SHOP.z - 0.7, SHOP.x + 1.4, SHOP.z + 0.8]);
    this.interact.push({ id: 'shop', x: SHOP.x, z: SHOP.z + 1.15, r: 1.7, label: '打开种子铺' });
  }
  buildBin() {
    const g = new THREE.Group(); g.position.set(BIN.x, HOME_H, BIN.z); g.rotation.y = -0.15; this.group.add(g);
    const W = new GeoBuilder(), M = new GeoBuilder();
    this.box(W, 1.25, 0.78, 0.85, [0, 0.39, 0], [0, 0, 0], '#9a6a43');
    for (let i = 0; i < 4; i++) this.box(W, 1.27, 0.06, 0.87, [0, 0.12 + i * 0.19, 0], [0, 0, 0], '#7a4f32');
    this.box(W, 1.32, 0.08, 0.92, [0, 0.86, -0.25], [-0.55, 0, 0], '#b07c4f');
    this.box(M, 0.4, 0.22, 0.02, [0, 0.45, 0.44], [0, 0, 0], '#e8d9b0');
    for (const x of [-0.55, 0.55]) M.add(new THREE.BoxGeometry(0.05, 0.8, 0.88), { pos: [x, 0.4, 0], color: '#4a4a4a' });
    this.mesh(W, this.mats.wood, true, g); this.mesh(M, this.mats.metal, true, g);
    const tex = textTexture('出货箱', 256, 96, { bg: '#e8d9b0', fg: '#5a3418' });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    s.position.set(0, 0.45, 0.452); g.add(s);
    this.col.addBox(BIN.x, BIN.z, 0.66, 0.46, -0.15, 'bin');
    this.noGrassRects.push([BIN.x - 0.7, BIN.z - 0.5, BIN.x + 0.7, BIN.z + 0.5]);
    this.interact.push({ id: 'bin', x: BIN.x, z: BIN.z + 0.95, r: 1.6, label: '出货' });
  }
  buildBarrel() {
    const g = new THREE.Group(); g.position.set(BARREL.x, HOME_H, BARREL.z); this.group.add(g);
    const W = new GeoBuilder(), M = new GeoBuilder();
    const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.95, 16, 6, true);
    W.add(geo, { pos: [0, 0.475, 0], warp: (x, y, z) => { const t = (y) / 0.95; const k = 1 + 0.12 * Math.sin(Math.PI * clamp(t, 0, 1)); return [x * k, y, z * k]; }, color: '#9a6a43', colorFn: (c, x, y, z) => c.multiplyScalar(0.8 + 0.3 * Math.abs(Math.sin(Math.atan2(z, x) * 8))) });
    W.add(new THREE.CircleGeometry(0.4, 16), { pos: [0, 0.05, 0], rot: [-Math.PI / 2, 0, 0], color: '#6a4a30' });
    for (const y of [0.12, 0.83]) M.add(new THREE.TorusGeometry(0.445, 0.022, 4, 20), { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], color: '#3d3d3d' });
    M.add(new THREE.TorusGeometry(0.47, 0.022, 4, 20), { pos: [0, 0.475, 0], rot: [Math.PI / 2, 0, 0], color: '#3d3d3d' });
    this.mesh(W, this.mats.wood, true, g); this.mesh(M, this.mats.metal, true, g);
    const wm = new THREE.Mesh(new THREE.CircleGeometry(0.43, 20), new THREE.MeshStandardMaterial({ color: '#2d6f8a', roughness: 0.05, metalness: 0.1 }));
    wm.rotation.x = -Math.PI / 2; wm.position.y = 0.86; g.add(wm);
    this.col.addCircle(BARREL.x, BARREL.z, 0.5, 'barrel');
    this.noGrassRects.push([BARREL.x - 0.5, BARREL.z - 0.5, BARREL.x + 0.5, BARREL.z + 0.5]);
    this.interact.push({ id: 'barrel', x: BARREL.x, z: BARREL.z + 0.4, r: 1.4, label: '装满水壶' });
  }

  // ----------------------------------------------------------- props
  buildProps() {
    const T = this.T, R = this.rand;
    // scarecrow in the farm
    {
      const x = 16.0, z = -16.0, y = T.heightAt(x, z);
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = -0.6; this.group.add(g);
      const W = new GeoBuilder(), P = new GeoBuilder(), Cl = new GeoBuilder();
      W.add(new THREE.CylinderGeometry(0.05, 0.06, 1.9, 6), { pos: [0, 0.95, 0], color: '#7a5233' });
      W.add(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), { pos: [0, 1.35, 0], rot: [0, 0, Math.PI / 2], color: '#7a5233' });
      Cl.add(new THREE.CylinderGeometry(0.22, 0.3, 0.62, 8), { pos: [0, 1.25, 0], color: '#5f8dc2' });
      Cl.add(new THREE.BoxGeometry(0.06, 0.4, 0.31), { pos: [0, 1.15, 0.0], color: '#c94c3a' });
      for (const s of [-1, 1]) Cl.add(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 6), { pos: [s * 0.42, 1.35, 0], rot: [0, 0, Math.PI / 2], color: '#5f8dc2' });
      for (const s of [-1, 1]) P.add(new THREE.ConeGeometry(0.08, 0.2, 6), { pos: [s * 0.72, 1.33, 0], rot: [0, 0, -s * Math.PI / 2], color: '#e7c66a' });
      P.add(new THREE.SphereGeometry(0.21, 12, 9), { pos: [0, 1.75, 0], color: '#efe0bd' });
      P.add(new THREE.SphereGeometry(0.03, 6, 4), { pos: [-0.07, 1.78, 0.19], color: '#2a2a2a' });
      P.add(new THREE.SphereGeometry(0.03, 6, 4), { pos: [0.07, 1.78, 0.19], color: '#2a2a2a' });
      P.add(new THREE.TorusGeometry(0.05, 0.012, 4, 8, Math.PI), { pos: [0, 1.7, 0.195], rot: [0, 0, Math.PI], color: '#a33' });
      P.add(new THREE.CylinderGeometry(0.42, 0.44, 0.04, 14), { pos: [0, 1.9, 0], color: '#e2c26c' });
      P.add(new THREE.CylinderGeometry(0.17, 0.21, 0.2, 12), { pos: [0, 2.0, 0], color: '#e2c26c' });
      P.add(new THREE.CylinderGeometry(0.215, 0.215, 0.05, 12), { pos: [0, 1.94, 0], color: '#c84a3a' });
      this.mesh(W, this.mats.wood, true, g); this.mesh(P, this.mats.plain, true, g); this.mesh(Cl, this.mats.cloth, true, g);
      this.col.addCircle(x, z, 0.25, 'scarecrow');
      this.noGrassRects.push([x - 0.4, z - 0.4, x + 0.4, z + 0.4]);
      this.scarecrow = { x, z };
    }
    // signpost
    {
      const x = -1.6, z = -5.0, y = T.heightAt(x, z);
      const g = new THREE.Group(); g.position.set(x, y, z); this.group.add(g);
      const W = new GeoBuilder();
      W.add(new THREE.CylinderGeometry(0.07, 0.08, 2.1, 7), { pos: [0, 1.05, 0], color: '#7a5233' });
      W.add(new THREE.ConeGeometry(0.1, 0.14, 7), { pos: [0, 2.15, 0], color: '#6a4529' });
      this.mesh(W, this.mats.wood, true, g);
      const boards = [['← 池塘', -2.6, 1.85], ['菜园 →', 0.3, 1.5], ['石桥 ↓', -1.4, 1.15]];
      for (const [txt, ang, hy] of boards) {
        const tex = textTexture(txt, 320, 96, { bg: '#c9a06e', size: 54 });
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.26, 0.05), [this.mats.plain, this.mats.plain, this.mats.plain, this.mats.plain, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })]);
        m.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m.geometry.attributes.position.count * 3).fill(0.5), 3));
        m.position.set(0, hy, 0); m.rotation.y = ang; m.translateX(0.32); m.castShadow = true;
        g.add(m);
      }
      this.col.addCircle(x, z, 0.14, 'sign');
      this.interact.push({ id: 'sign', x, z, r: 1.3, label: '看看路牌' });
    }
    // lamp posts
    const lampSpots = [[2.1, -2.6], [-1.6, 13.4], [-4.6, 27.5], [-9.2, -2.2], [13.9, -5.0], [-12.2, -14.8], [27.4, -13]];
    const W = new GeoBuilder(), M = new GeoBuilder(), G = new GeoBuilder();
    for (const [x, z] of lampSpots) {
      const y = T.heightAt(x, z);
      W.add(new THREE.BoxGeometry(0.13, 1.9, 0.13), { pos: [x, y + 0.95, z], color: '#6d4a30' });
      W.add(new THREE.BoxGeometry(0.42, 0.08, 0.08), { pos: [x + 0.15, y + 1.86, z], color: '#6d4a30' });
      M.add(new THREE.CylinderGeometry(0.1, 0.08, 0.04, 6), { pos: [x + 0.3, y + 1.76, z], color: '#2b2b2b' });
      M.add(new THREE.ConeGeometry(0.13, 0.1, 6), { pos: [x + 0.3, y + 1.8, z], color: '#2b2b2b' });
      G.add(new THREE.CylinderGeometry(0.075, 0.075, 0.19, 6), { pos: [x + 0.3, y + 1.64, z] });
      M.add(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 6), { pos: [x + 0.3, y + 1.535, z], color: '#2b2b2b' });
      this.col.addCircle(x, z, 0.12, 'lamp');
      this.glows.push(new THREE.Vector3(x + 0.3, y + 1.64, z));
    }
    this.mesh(W, this.mats.wood); this.mesh(M, this.mats.metal); this.mesh(G, this.mats.glow, false);
    // benches: by the pond, at the cascade lookout
    const benches = [[-12.6, -12.4, Math.atan2(-6 + 12.4, -22 + 12.6)], [38.3, -54.6, 2.4], [-30.5, -40.5, 0.8]];
    const BW = new GeoBuilder();
    for (const [x, z, face] of benches) {
      const y = T.heightAt(x, z);
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = -face + Math.PI / 2; this.group.add(g);
      const L = new GeoBuilder();
      for (let i = 0; i < 3; i++) this.box(L, 1.5, 0.05, 0.13, [0, 0.46, -0.16 + i * 0.15], [0, 0, 0], '#a1734a', 0.06);
      for (let i = 0; i < 2; i++) this.box(L, 1.5, 0.11, 0.04, [0, 0.72 + i * 0.16, -0.3], [-0.15, 0, 0], '#a1734a', 0.06);
      for (const sx of [-0.62, 0.62]) { this.box(L, 0.08, 0.46, 0.42, [sx, 0.23, -0.04], [0, 0, 0], '#6d4a30'); this.box(L, 0.07, 0.6, 0.06, [sx, 0.7, -0.3], [-0.15, 0, 0], '#6d4a30'); }
      this.mesh(L, this.mats.wood, true, g);
      this.col.addBox(x, z, 0.78, 0.3, -face + Math.PI / 2, 'bench');
    }
    void BW; void R;
    // flower pots near porch steps
    const pots = new GeoBuilder();
    for (const [x, z, c] of [[0.30, -7.80, '#ff7aa2'], [2.70, -7.80, '#ffd34d']]) {
      const y = HOME_H;
      pots.add(new THREE.CylinderGeometry(0.2, 0.15, 0.32, 10), { pos: [x, y + 0.16, z], color: '#c26a45' });
      pots.add(new THREE.IcosahedronGeometry(0.22, 1), { pos: [x, y + 0.42, z], scale: [1, 0.75, 1], color: '#4f8f3a' });
      for (let i = 0; i < 6; i++) pots.add(new THREE.IcosahedronGeometry(0.06, 0), { pos: [x + Math.cos(i) * 0.15, y + 0.52 + (i % 2) * 0.04, z + Math.sin(i) * 0.15], color: c });
      this.col.addCircle(x, z, 0.22, 'pot');
    }
    this.mesh(pots, this.mats.plain);
  }

  update(dt, t, nightK) {
    const n = smoothstep(0.15, 0.7, nightK);
    this.mats.glass.emissiveIntensity = n * 2.4;
    this.mats.glow.emissiveIntensity = 0.15 + n * 5.5;
    for (const L of this.lights) L.l.intensity = n * L.k;
    if (this.boat) {
      this.boat.position.y = this.boatBase.y + Math.sin(t * 1.1) * 0.025;
      this.boat.rotation.z = Math.sin(t * 0.8) * 0.025; this.boat.rotation.x = Math.sin(t * 0.9 + 1) * 0.015;
    }
  }
}
