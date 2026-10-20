import * as THREE from 'three';
import { buildCropGeos } from './cropModels.js';
import { patchVeg } from '../world/wind.js';
import { GLSL_NOISE } from '../util/glsl.js';
import { smoothstep, clamp } from '../util/math.js';

export const CROPS = {
  bokchoy: { name: '小白菜', icon: '🥬', days: 1, seed: 15, sell: 38, regrow: 0, yield: [1, 1], desc: '长得最快的叶菜，一天就能收。' },
  carrot: { name: '胡萝卜', icon: '🥕', days: 2, seed: 25, sell: 70, regrow: 0, yield: [1, 1], desc: '甜甜脆脆，兔子最爱。' },
  strawberry: { name: '草莓', icon: '🍓', days: 3, seed: 45, sell: 40, regrow: 1, yield: [2, 3], desc: '成熟后可以反复采摘。' },
  tomato: { name: '番茄', icon: '🍅', days: 3, seed: 40, sell: 45, regrow: 1, yield: [2, 3], desc: '搭好支架，结果不停。' },
  corn: { name: '玉米', icon: '🌽', days: 4, seed: 60, sell: 125, regrow: 0, yield: [1, 2], desc: '长得比人还高的大家伙。' },
  pumpkin: { name: '南瓜', icon: '🎃', days: 5, seed: 90, sell: 260, regrow: 0, yield: [1, 1], desc: '慢慢长大的圆滚滚。' },
};
export const CROP_KEYS = Object.keys(CROPS);

const hash = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

function soilGeo() {
  const g = new THREE.BoxGeometry(0.96, 0.12, 0.96, 8, 1, 8);
  const P = g.attributes.position.array;
  const col = new Float32Array(P.length);
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], z = P[i + 2];
    const e = Math.max(Math.abs(x), Math.abs(z)) / 0.48;
    if (P[i + 1] > 0) {
      const furrow = Math.cos((x / 0.96) * Math.PI * 2 * 3);
      P[i + 1] = 0.07 + 0.012 * furrow - smoothstep(0.7, 1.0, e) * 0.05;
      const sh = 0.86 + 0.14 * (furrow * 0.5 + 0.5);
      col[i] = col[i + 1] = col[i + 2] = sh;
    } else { P[i + 1] = -0.04; col[i] = col[i + 1] = col[i + 2] = 0.7; }
    const k = 1 - smoothstep(0.75, 1.0, e) * 0.06;
    P[i] *= k; P[i + 2] *= k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
// chunkier, more readable crops (models are authored at near-real scale)
const CROP_SCALE = { bokchoy: 1.45, carrot: 1.4, strawberry: 1.5, tomato: 1.12, corn: 1.0, pumpkin: 1.18 };
function soilMat(rough, color) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, color, roughness: rough, metalness: 0 });
  m.customProgramCacheKey = () => 'soil';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 spw = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nspw = instanceMatrix * spw;\n#endif\nvSP = (modelMatrix * spw).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSP;\n' + GLSL_NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float n1 = vnoise(vSP.xz * 9.0); float n2 = vnoise(vSP.xz * 23.0 + 3.1); float clod = smoothstep(0.62, 0.8, n2);
  diffuseColor.rgb *= (0.82 + 0.3 * n1) * (1.0 + 0.18 * clod) * (1.0 - 0.15 * smoothstep(0.75, 0.95, vnoise(vSP.xz * 41.0))); }`);
  };
  return m;
}

export class Farm {
  constructor(T, U, veg, colliders, structures) {
    this.T = T; this.U = U; this.veg = veg; this.col = colliders; this.st = structures;
    this.tiles = new Map();
    this.group = new THREE.Group(); this.group.name = 'farm';
    this.cap = 900;
    this.soilDry = new THREE.InstancedMesh(soilGeo(), soilMat(0.96, '#94673f'), this.cap);
    this.soilWet = new THREE.InstancedMesh(this.soilDry.geometry, soilMat(0.42, '#57391f'), this.cap);
    for (const m of [this.soilDry, this.soilWet]) { m.count = 0; m.receiveShadow = true; m.castShadow = false; m.frustumCulled = false; this.group.add(m); }
    this.soilWet.instanceColor = null;
    this.geos = buildCropGeos();
    this.cropMat = patchVeg(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, side: THREE.DoubleSide }), U, { yScale: 1.3, amp: 0.1, freq: 1.4, trans: 0.4, noflip: true });
    this.cropMeshes = {};
    for (const k in this.geos) {
      this.cropMeshes[k] = this.geos[k].map(g => {
        const m = new THREE.InstancedMesh(g, this.cropMat, 256);
        m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
        this.group.add(m); return m;
      });
    }
    this.dirty = true;
    // target highlight
    const hl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uTime: U.uTime, uA: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uA; varying vec2 vUv;
        void main(){ vec2 q = abs(vUv - 0.5) * 2.0; float d = max(q.x, q.y);
          float r = length(max(q - 0.78, 0.0)) / 0.22;
          float border = smoothstep(0.82, 0.88, d) * (1.0 - smoothstep(0.97, 1.0, d)) * (1.0 - smoothstep(0.9, 1.0, r));
          float fill = (1.0 - smoothstep(0.85, 0.95, d)) * 0.12;
          float a = (border * (0.75 + 0.25 * sin(uTime * 5.0)) + fill) * uA;
          gl_FragColor = vec4(uColor, a); }`,
    }));
    hl.rotation.x = -Math.PI / 2; hl.renderOrder = 5; hl.visible = false;
    hl.material.polygonOffset = true; hl.material.polygonOffsetFactor = -4;
    this.highlight = hl; this.group.add(hl);
    this.pops = [];
  }
  key(i, j) { return i + ',' + j; }
  get(i, j) { return this.tiles.get(this.key(i, j)); }
  isTilled(x, z) { return this.tiles.has(this.key(Math.floor(x), Math.floor(z))); }

  canTill(i, j) {
    const T = this.T;
    if (this.get(i, j)) return { ok: false, reason: '这里已经开垦过了' };
    const cx = i + 0.5, cz = j + 0.5;
    if (Math.pow(cx ** 6 + cz ** 6, 1 / 6) > 78) return { ok: false, reason: '太远啦，回家附近开垦吧' };
    const hs = [];
    for (const [dx, dz] of [[0, 0], [-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) {
      const x = cx + dx, z = cz + dz;
      const lv = T.waterLevelAt(x, z), h = T.heightAt(x, z);
      if (lv > -40 && h < lv + 0.25) return { ok: false, reason: '太靠近水边了' };
      if (T.pathAt(x, z) > 0.35) return { ok: false, reason: '小路上不能开垦' };
      if (T.onDeck(x, z)) return { ok: false, reason: '这里不能开垦' };
      if (this.st.noGrass(x, z)) return { ok: false, reason: '这里不能开垦' };
      hs.push(h);
    }
    if (Math.max(...hs) - Math.min(...hs) > 0.2) return { ok: false, reason: '地面太陡了' };
    if (T.pondD(cx, cz) < 1.2) return { ok: false, reason: '太靠近水边了' };
    const ri = T.riverInfo(cx, cz); if (ri.d < 40 && ri.edge < 0.8) return { ok: false, reason: '太靠近水边了' };
    if (this.col.hit(cx, cz, 0.52)) return { ok: false, reason: '有东西挡着' };
    return { ok: true };
  }
  till(i, j, silent) {
    const c = this.canTill(i, j);
    if (!c.ok && !silent) return c;
    const t = { i, j, wet: false, crop: null, y: this.T.heightAt(i + 0.5, j + 0.5) };
    this.tiles.set(this.key(i, j), t);
    this.T.paintTilled(i - 0.08, j - 0.08, i + 1.08, j + 1.08, 255);
    this.veg && this.veg.clearRect(i - 0.1, j - 0.1, i + 1.1, j + 1.1);
    this.dirty = true;
    return { ok: true, tile: t };
  }
  water(i, j) {
    const t = this.get(i, j); if (!t) return false;
    t.wet = true; this.dirty = true; return true;
  }
  plant(i, j, type) {
    const t = this.get(i, j); if (!t || t.crop) return false;
    t.crop = { type, g: 0, stage: 0 }; this.dirty = true; return true;
  }
  ripe(t) { return t && t.crop && t.crop.g >= 1; }
  harvest(i, j) {
    const t = this.get(i, j); if (!this.ripe(t)) return null;
    const def = CROPS[t.crop.type];
    const n = def.yield[0] + Math.floor(Math.random() * (def.yield[1] - def.yield[0] + 1));
    const type = t.crop.type;
    const pos = new THREE.Vector3(i + 0.5, t.y + 0.1, j + 0.5);
    this.spawnPop(type, pos);
    if (def.regrow) { t.crop.g = 1 - def.regrow / def.days; t.crop.stage = this.stageOf(t.crop.g); }
    else t.crop = null;
    this.dirty = true;
    return { type, n, pos };
  }
  stageOf(g) { return g >= 1 ? 4 : Math.min(3, Math.floor(g * 4)); }
  newDay(rain) {
    for (const t of this.tiles.values()) t.wet = !!rain;
    this.dirty = true;
  }
  setAllWet() { for (const t of this.tiles.values()) if (!t.wet) { t.wet = true; this.dirty = true; } }
  grow(dMin) {
    for (const t of this.tiles.values()) {
      const c = t.crop; if (!c || !t.wet || c.g >= 1) continue;
      c.g = Math.min(1, c.g + dMin / (CROPS[c.type].days * 1200));
      const st = this.stageOf(c.g);
      if (st !== c.stage) { c.stage = st; this.dirty = true; if (st === 4) this.onRipe && this.onRipe(t); }
    }
  }
  spawnPop(type, pos) {
    const m = new THREE.Mesh(this.geos[type][4], this.cropMat);
    m.position.copy(pos); m.castShadow = true;
    this.group.add(m);
    this.pops.push({ m, t: 0, from: pos.clone(), type });
  }
  rebuild() {
    let nd = 0, nw = 0;
    const counts = {};
    for (const k in this.cropMeshes) counts[k] = [0, 0, 0, 0, 0];
    for (const t of this.tiles.values()) {
      _p.set(t.i + 0.5, t.y - 0.005, t.j + 0.5);
      _q.identity(); _s.set(1, 1, 1);
      _m.compose(_p, _q, _s);
      if (t.wet) this.soilWet.setMatrixAt(nw++, _m); else this.soilDry.setMatrixAt(nd++, _m);
      const c = t.crop;
      if (c) {
        const h = hash(t.i, t.j);
        const mesh = this.cropMeshes[c.type][c.stage];
        const n = counts[c.type][c.stage]++;
        if (n >= mesh.instanceMatrix.count) continue;
        _q.setFromAxisAngle(UP, h * Math.PI * 2);
        const sc = (0.92 + hash(t.j, t.i) * 0.16) * (CROP_SCALE[c.type] || 1);
        _s.set(sc, sc, sc);
        _p.set(t.i + 0.5 + (h - 0.5) * 0.08, t.y + 0.055, t.j + 0.5 + (hash(t.i + 7, t.j) - 0.5) * 0.08);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(n, _m);
      }
    }
    this.soilDry.count = nd; this.soilWet.count = nw;
    this.soilDry.instanceMatrix.needsUpdate = true; this.soilWet.instanceMatrix.needsUpdate = true;
    for (const k in this.cropMeshes) this.cropMeshes[k].forEach((m, s) => { m.count = counts[k][s]; m.instanceMatrix.needsUpdate = true; });
    this.dirty = false;
  }
  setHighlight(i, j, ok, visible) {
    const h = this.highlight;
    h.visible = visible;
    if (!visible) return;
    const t = this.get(i, j);
    const y = t ? t.y + 0.085 : this.T.heightAt(i + 0.5, j + 0.5) + 0.03;
    h.position.set(i + 0.5, y, j + 0.5);
    h.material.uniforms.uColor.value.set(ok ? '#fff6d8' : '#ff7a6b');
  }
  update(dt, playerHand) {
    if (this.dirty) this.rebuild();
    for (let k = this.pops.length - 1; k >= 0; k--) {
      const p = this.pops[k]; p.t += dt;
      const u = clamp(p.t / 0.7, 0, 1);
      const target = playerHand || p.from;
      p.m.position.lerpVectors(p.from, target, smoothstep(0, 1, u));
      p.m.position.y += Math.sin(u * Math.PI) * 0.8;
      p.m.scale.setScalar((1 - u * 0.6) * (CROP_SCALE[p.type] || 1));
      p.m.rotation.y += dt * 6;
      if (u >= 1) { this.group.remove(p.m); this.pops.splice(k, 1); }
    }
  }
  serialize() {
    const out = [];
    for (const t of this.tiles.values()) out.push([t.i, t.j, t.wet ? 1 : 0, t.crop ? t.crop.type : 0, t.crop ? +t.crop.g.toFixed(4) : 0]);
    return out;
  }
  load(arr) {
    // tiles from older saves that now lie under a building (the bigger house / props) are dropped
    const covered = (i, j) => [[0.5, 0.5], [0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95]]
      .some(([a, b]) => this.st.noGrass(i + a, j + b));
    for (const [i, j, wet, type, g] of arr) {
      if (covered(i, j)) continue;
      this.till(i, j, true);
      const t = this.get(i, j); t.wet = !!wet;
      if (type && CROPS[type]) t.crop = { type, g, stage: this.stageOf(g) };
    }
    this.dirty = true;
  }
  seedDefault() {
    const plan = [
      [-16, [['bokchoy', 1], ['bokchoy', 1], ['bokchoy', 1], ['bokchoy', 0.55], ['bokchoy', 0.5], ['bokchoy', 0.3]]],
      [-15, [['carrot', 0.62], ['carrot', 0.6], ['carrot', 0.55], ['carrot', 1], ['carrot', 0.4], null]],
      [-13, [['strawberry', 0.8], ['strawberry', 0.78], ['strawberry', 1], ['strawberry', 0.7], ['tomato', 0.55], ['tomato', 1]]],
      [-12, [['corn', 0.3], ['corn', 0.55], ['corn', 0.8], ['corn', 1], ['pumpkin', 0.92], ['pumpkin', 0.45]]],
      [-10, [null, null, null, null, null, null]],
    ];
    for (const [j, row] of plan) row.forEach((c, k) => {
      const i = 8 + k;
      this.till(i, j, true);
      if (c) { const t = this.get(i, j); t.crop = { type: c[0], g: c[1], stage: this.stageOf(c[1]) }; }
    });
    this.dirty = true;
  }
}
