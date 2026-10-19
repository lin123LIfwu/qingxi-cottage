// Fishing: cast / wait / bite / reel minigame + ambient swimming fish
import * as THREE from 'three';
import { GeoBuilder } from '../util/geo.js';
import { clamp, lerp, smoothstep, damp, dampAngle } from '../util/math.js';
import { POND } from '../config.js';
import { FISH, pickFish, fishGeometry, fishMaterial, makeFishMesh, fishWeight, koiVariantCount } from './fishData.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _s = new THREE.Vector3();

// ------------------------------------------------------------------ ambient swimmers
class Swimmers {
  constructor(T, U, water) {
    this.T = T; this.U = U; this.water = water;
    this.group = new THREE.Group(); this.group.name = 'swimmers';
    this.mat = fishMaterial(true);
    this.list = [];
    this.meshes = [];
    // find river s nearest to the bridge (home stretch)
    let sb = 120, bd = 1e9;
    for (const p of T.river.pts) { const d = Math.hypot(p.x - T.bridge.cx, p.z - T.bridge.cz); if (d < bd) { bd = d; sb = p.s; } }
    this.sBridge = sb;
    const spec = [
      ['koi', 0, 1, 'pond', 0.62], ['koi', 1, 1, 'pond', 0.55], ['koi', 2, 1, 'pond', 0.5], ['koi', 3, 1, 'pond', 0.48],
      ['crucian', 0, 4, 'pond', 0.2], ['carp', 0, 2, 'pond', 0.45], ['medaka', 0, 10, 'pond', 0.045],
      ['bleak', 0, 12, 'river', 0.14], ['trout', 0, 3, 'stream', 0.42], ['carp', 0, 2, 'river', 0.5], ['grass', 0, 1, 'river', 0.6],
    ];
    for (const [key, variant, n, where, len] of spec) {
      const geo = fishGeometry(key, variant);
      const im = new THREE.InstancedMesh(geo, this.mat, n);
      const swim = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
      swim.setUsage(THREE.DynamicDrawUsage);
      im.geometry = geo.clone(); im.geometry.setAttribute('aSwim', swim);
      im.castShadow = where === 'pond'; im.receiveShadow = false; im.frustumCulled = false;
      this.group.add(im);
      this.meshes.push(im);
      for (let i = 0; i < n; i++) {
        const f = { im, idx: i, key, where, len: len * (0.8 + Math.random() * 0.4), h: Math.random() * 6.28, sp: 0, tsp: 0.2, timer: Math.random() * 3,
          phase: Math.random() * 10, x: 0, y: 0, z: 0, tx: 0, tz: 0, ty: 0, flee: 0, curious: Math.random() < 0.6, vy: 0 };
        if (where === 'pond') {
          const p = this.randPond(0.65); f.x = p.x; f.z = p.z; f.tx = p.x; f.tz = p.z;
          f.y = this.pondY(f.x, f.z, key === 'medaka'); f.ty = f.y;
        } else {
          const s0 = where === 'stream' ? 74 + Math.random() * 12 : (key === 'bleak' ? sb - 28 + Math.random() * 56 : sb + 8 + Math.random() * 36);
          f.s = s0; f.s0 = s0; f.ts = s0; f.v = (Math.random() - 0.5) * 0.9; f.tv = f.v;
          this.riverPos(f);
          f.y = f.ty;
        }
        this.list.push(f);
      }
    }
    this.leader = this.list.find(f => f.key === 'medaka');
    this.riseT = 3;
  }
  randPond(maxD) {
    const T = this.T;
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * maxD;
      const x = POND.x + Math.cos(a) * T.pondR(a) * rr, z = POND.z + Math.sin(a) * T.pondR(a) * rr;
      const w = T.waterAt(x, z);
      if (w && w.depth > 0.55) return { x, z };
    }
    return { x: POND.x, z: POND.z };
  }
  pondY(x, z, top) {
    const T = this.T; const lv = POND.level, b = T.heightAt(x, z);
    if (top) return lv - 0.1 - Math.random() * 0.12;
    const lo = b + 0.22, hi = lv - 0.28;
    return hi < lo ? (lo + hi) / 2 : lerp(lo, hi, 0.25 + Math.random() * 0.6);
  }
  riverPos(f) {
    const T = this.T;
    const p = T.riverPointAt(f.s); const hw = T.riverHalfW(f.s);
    f.x = p.x - p.tz * f.v * hw; f.z = p.z + p.tx * f.v * hw;
    f.tx_ = p.tx; f.tz_ = p.tz;
    const lv = T.riverLevel(f.s), b = T.heightAt(f.x, f.z);
    const dep = lv - b;
    f.ty = dep < 0.35 ? lv - dep * 0.5 : clamp(lv - 0.22 - dep * 0.35, b + 0.15, lv - 0.15);
    f.depth = dep;
  }
  scare(x, z, r) {
    for (const f of this.list) {
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < r) { f.flee = 1.4 + Math.random() * 0.6; f.fx = x; f.fz = z; }
    }
  }
  update(dt, t, bob, player, camPos) {
    const T = this.T;
    const pIn = player.waterDepth > 0.08;
    // occasional surface rise rings in the pond
    this.riseT -= dt;
    if (this.riseT < 0) {
      this.riseT = 5 + Math.random() * 9;
      const f = this.list[Math.floor(Math.random() * this.list.length)];
      if (f && f.where === 'pond' && Math.hypot(camPos.x - f.x, camPos.z - f.z) < 60) this.water.addRipple(f.x + Math.sin(f.h) * f.len * 0.4, f.z + Math.cos(f.h) * f.len * 0.4, 0.28);
    }
    for (const f of this.list) {
      const far = Math.hypot(camPos.x - f.x, camPos.z - f.z) > 70;
      if (far && f.where !== 'pond') continue;
      // flee from wading player
      if (pIn && Math.hypot(player.pos.x - f.x, player.pos.z - f.z) < 2.6) { f.flee = Math.max(f.flee, 0.8); f.fx = player.pos.x; f.fz = player.pos.z; }
      if (f.where === 'pond') this.updatePond(f, dt, bob);
      else this.updateRiver(f, dt, bob);
      f.phase += dt * (3.5 + f.sp * 14 / Math.max(0.3, f.len * 2.5));
      const amp = clamp(0.25 + f.sp * 1.2, 0.25, 1.0);
      const sw = f.im.geometry.attributes.aSwim;
      sw.array[f.idx * 2] = f.phase; sw.array[f.idx * 2 + 1] = amp;
      _e.set(clamp(-f.vy * 1.5, -0.4, 0.4), f.h, Math.sin(f.phase * 0.5) * 0.05);
      _q.setFromEuler(_e); _s.setScalar(f.len);
      _m.compose(_v.set(f.x, f.y, f.z), _q, _s);
      f.im.setMatrixAt(f.idx, _m);
    }
    for (const im of this.meshes) { im.instanceMatrix.needsUpdate = true; im.geometry.attributes.aSwim.needsUpdate = true; }
  }
  steer(f, dt, tx, tz, tsp, turn) {
    const dh = Math.atan2(tx - f.x, tz - f.z);
    f.h = dampAngle(f.h, dh, turn, dt);
    f.sp = damp(f.sp, tsp, 2.2, dt);
  }
  updatePond(f, dt, bob) {
    const T = this.T;
    f.timer -= dt;
    let tsp = f.tsp, tx = f.tx, tz = f.tz;
    const medaka = f.key === 'medaka';
    if (f.flee > 0) {
      f.flee -= dt;
      const ax = f.x - f.fx, az = f.z - f.fz, l = Math.hypot(ax, az) || 1;
      tx = f.x + ax / l * 3; tz = f.z + az / l * 3; tsp = medaka ? 1.6 : 1.9;
    } else if (bob && bob.where === 'pond' && f.curious && !medaka && Math.hypot(bob.x - f.x, bob.z - f.z) < 6.5) {
      const a = f.idx * 2.1 + performance.now() * 0.0003;
      tx = bob.x + Math.cos(a) * 0.55; tz = bob.z + Math.sin(a) * 0.55; tsp = 0.28;
      if (Math.hypot(tx - f.x, tz - f.z) < 0.3) tsp = 0.05;
    } else if (medaka && this.leader && f !== this.leader) {
      const L = this.leader; const a = f.idx * 0.9;
      tx = L.x + Math.cos(a) * 0.35 * (1 + f.idx % 3) * 0.6; tz = L.z + Math.sin(a) * 0.35 * (1 + f.idx % 3) * 0.6;
      tsp = clamp(Math.hypot(tx - f.x, tz - f.z) * 1.5, 0.05, 0.9);
    } else if (f.timer < 0) {
      const p = this.randPond(medaka ? 0.55 : 0.72);
      f.tx = p.x; f.tz = p.z; tx = p.x; tz = p.z;
      f.tsp = Math.random() < 0.18 ? 0.04 : (medaka ? 0.3 + Math.random() * 0.35 : 0.18 + Math.random() * 0.35);
      tsp = f.tsp;
      f.ty = this.pondY(p.x, p.z, medaka);
      f.timer = 3 + Math.random() * 6;
    }
    this.steer(f, dt, tx, tz, tsp, medaka ? 4 : 1.4 + f.sp * 2);
    let nx = f.x + Math.sin(f.h) * f.sp * dt, nz = f.z + Math.cos(f.h) * f.sp * dt;
    // keep inside deep enough water
    const ax = nx + Math.sin(f.h) * f.len * 0.8, az = nz + Math.cos(f.h) * f.len * 0.8;
    const w = T.waterAt(ax, az);
    if (!w || w.depth < 0.4 || T.pondD(ax, az) > 0.86) {
      f.h += dt * 2.5; nx = f.x; nz = f.z;
      if (f.timer > 0.5 && f.flee <= 0) f.timer = 0;
    }
    f.x = nx; f.z = nz;
    const b = T.heightAt(f.x, f.z);
    const ty = clamp(f.ty, b + 0.16 + f.len * 0.1, POND.level - 0.08);
    const ny = damp(f.y, ty, 0.8, dt);
    f.vy = (ny - f.y) / Math.max(dt, 1e-3); f.y = ny;
  }
  updateRiver(f, dt, bob) {
    const T = this.T;
    f.timer -= dt;
    if (f.flee > 0) {
      f.flee -= dt;
      if (!f.fled) { f.fled = true; f.ts = f.s + (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3); f.tv = clamp(-f.v + (Math.random() - 0.5) * 0.5, -0.75, 0.75); }
    } else f.fled = false;
    if (f.timer < 0 && f.flee <= 0) {
      f.timer = 2 + Math.random() * 5;
      const range = f.where === 'stream' ? 6 : 9;
      f.ts = clamp(f.s0 + (Math.random() - 0.5) * 2 * range, 66, T.river.total - 20);
      f.tv = (Math.random() - 0.5) * 1.3;
    }
    const dsp = f.flee > 0 ? 3.0 : 0.9;
    const ds = clamp(f.ts - f.s, -dsp * dt, dsp * dt);
    f.s += ds; f.v = damp(f.v, f.tv, f.flee > 0 ? 4 : 0.8, dt);
    const ox = f.x, oz = f.z;
    this.riverPos(f);
    if (f.depth < 0.25) { f.tv *= 0.5; f.v *= 0.98; }
    const mx = f.x - ox, mz = f.z - oz;
    // face upstream except when darting downstream fast
    const up = Math.atan2(-f.tx_, -f.tz_);
    const moving = Math.hypot(mx, mz) / Math.max(dt, 1e-3);
    const heading = moving > 1.2 && ds > 0 ? Math.atan2(mx, mz) : up + Math.sin(f.phase * 0.13 + f.idx) * 0.25 + clamp((f.tv - f.v) * 1.5, -0.6, 0.6);
    f.h = dampAngle(f.h, heading, 3, dt);
    f.sp = clamp(0.25 + moving * 0.6, 0.25, 2.5);
    const ny = damp(f.y, f.ty, 1.2, dt); f.vy = (ny - f.y) / Math.max(dt, 1e-3); f.y = ny;
    void bob;
  }
}

// ------------------------------------------------------------------ bobber
function bobberGeo() {
  const B = new GeoBuilder();
  B.add(new THREE.SphereGeometry(0.045, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), { color: '#e2483a' });
  B.add(new THREE.SphereGeometry(0.045, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), { color: '#fbf7ee' });
  B.add(new THREE.CylinderGeometry(0.047, 0.047, 0.01, 14), { color: '#2d2a26' });
  B.add(new THREE.CylinderGeometry(0.007, 0.009, 0.12, 6), { pos: [0, 0.085, 0], color: '#fbf7ee' });
  B.add(new THREE.SphereGeometry(0.012, 8, 6), { pos: [0, 0.148, 0], color: '#ff5a3c' });
  B.add(new THREE.CylinderGeometry(0.004, 0.01, 0.06, 6), { pos: [0, -0.07, 0], color: '#3a3a3a' });
  return B.build();
}

// ------------------------------------------------------------------ fishing controller
export class Fishing {
  constructor(o) {
    this.scene = o.scene; this.T = o.T; this.U = o.U; this.water = o.water; this.player = o.player;
    this.fx = o.fx || null; this.audio = o.audio || null; this.getCtx = o.getCtx; this.onEvent = o.onEvent || (() => {});
    this.state = 'idle'; this.power = 0; this.pdir = 1; this.holding = false;
    this.bobber = new THREE.Mesh(bobberGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0 }));
    this.bobber.visible = false; this.bobber.castShadow = true;
    this.scene.add(this.bobber);
    this.N = 28;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array((this.N + 1) * 3), 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#f8f4ea', transparent: true, opacity: 0.8, fog: true }));
    this.line.frustumCulled = false; this.line.visible = false; this.line.layers.set(1);
    this.scene.add(this.line);
    this.swimmers = new Swimmers(this.T, this.U, this.water);
    this.scene.add(this.swimmers.group);
    this.heldMat = fishMaterial(false);
    this.bobPos = new THREE.Vector3(); this.land = new THREE.Vector3(); this.hook = new THREE.Vector3();
    this.reel = { zy: 0, zv: 0, zh: 0.25, fy: 0.5, fv: 0, ft: 0, target: 0.5, prog: 0.3, inZone: false, shake: 0 };
    this.biteK = 0; this.dip = 0; this.fishKey = null; this.lastNibble = -10; this.tw = 0; this.splashT = 0; this.reelTick = 0;
    this.ambT = 0;
  }
  get active() { return this.state !== 'idle'; }
  get locked() { return this.state !== 'idle'; }

  // is there castable water in front of the player?
  waterAhead() {
    const p = this.player, f = p.forward(_v2);
    for (let d = 2; d <= 11; d += 0.75) {
      const w = this.T.waterAt(p.pos.x + f.x * d, p.pos.z + f.z * d);
      if (w && w.depth > 0.25) return true;
    }
    return false;
  }
  canStart() { return this.state === 'idle' && !this.player.busy(); }

  press() {
    const s = this.state;
    if (s === 'idle') {
      if (this.player.busy()) return false;
      this.state = 'charge'; this.power = 0; this.pdir = 1;
      this.audio && this.audio.play('click', { vol: 0.4 });
      return true;
    }
    if (s === 'wait') {
      if (this.tw - this.lastNibble < 0.35) this.onEvent('toast', '太心急啦，鱼被吓跑了～');
      this.retrieve();
      return true;
    }
    if (s === 'bite') { this.hookFish(); return true; }
    return s !== 'idle';
  }
  release() {
    if (this.state === 'charge') this.cast();
  }
  cast() {
    const p = this.player;
    this.state = 'casting';
    this.castDist = 2.2 + this.power * 8.8;
    p.holdAction = false;
    p.startAction('cast', 0.8, 0.6, () => this.launch(), null);
    this.audio && this.audio.play('swish', { vol: 0.5 + this.power * 0.4 });
  }
  launch() {
    const p = this.player, T = this.T;
    const f = p.forward(_v2);
    const from = p.rodTipWorld(new THREE.Vector3());
    const tx = p.pos.x + f.x * this.castDist, tz = p.pos.z + f.z * this.castDist;
    const lv = T.waterLevelAt(tx, tz), gh = T.heightAt(tx, tz);
    const ty = lv > -40 && lv > gh ? lv : gh + 0.04;
    this.flight = { from, to: new THREE.Vector3(tx, ty, tz), t: 0, dur: 0.42 + 0.38 * this.power, apex: 0.9 + this.power * 1.7 };
    this.state = 'cast';
    this.bobber.visible = true; this.line.visible = true;
    this.bobPos.copy(from);
  }
  landed() {
    const T = this.T, to = this.flight.to;
    const w = T.waterAt(to.x, to.z);
    if (!w || w.depth < 0.22) {
      this.onEvent('toast', w ? '水太浅了，往深一点的地方抛吧' : '没有抛进水里哦');
      this.audio && this.audio.play('thud', { vol: 0.5 });
      this.retrieve();
      return;
    }
    if (w.type === 'pond') this.where = 'pond';
    else { const ri = T.riverInfo(to.x, to.z); this.where = T.riverSpeed(ri.s) > 1.25 ? 'stream' : 'river'; }
    this.depthAt = w.depth;
    this.land.copy(to); this.bobPos.copy(to);
    this.water.addRipple(to.x, to.z, 0.9);
    this.fx && this.fx.splash(_v.set(to.x, w.level, to.z), 12, 0.8);
    this.audio && this.audio.play('plop', { vol: 0.8 });
    this.swimmers.scare(to.x, to.z, 1.2);
    this.state = 'wait';
    this.player.holdAction = true;
    this.player.startAction('fishing', 0.4, 1, null, null);
    this.startWait();
  }
  startWait() {
    const ctx = this.getCtx();
    const rain = ctx.weather === 'rain';
    this.fishKey = pickFish(this.where, ctx.hour, rain, ctx.rodLevel, this.depthAt);
    const f = FISH[this.fishKey];
    let wt = 3 + Math.random() * 8 + f.diff * 4;
    if (rain) wt *= 0.7;
    const h = ctx.hour; if ((h > 5 && h < 8.5) || (h > 16.5 && h < 19.5)) wt *= 0.8;
    if (ctx.rodLevel > 1) wt *= 0.75;
    this.tw = 0; this.biteAt = wt;
    const nn = f.diff > 0.5 ? Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 3);
    this.nibbles = [];
    for (let i = 0; i < nn; i++) this.nibbles.push(wt * (0.45 + 0.5 * Math.random()));
    this.nibbles.sort((a, b) => a - b);
    this.lastNibble = -10;
  }
  // debug / testing helper: make the current wait end with a bite on the next update
  forceBite() { if (this.state === 'wait') { this.nibbles = []; this.tw = this.biteAt; } }
  hookFish() {
    const f = FISH[this.fishKey];
    this.state = 'reel';
    const R = this.reel;
    const rod = this.getCtx().rodLevel;
    R.zh = clamp(0.25 + (rod > 1 ? 0.07 : 0) - f.diff * 0.06, 0.16, 0.36);
    R.zy = 0.0; R.zv = 0; R.fy = 0.35 + Math.random() * 0.3; R.fv = 0; R.ft = 0.3; R.target = R.fy; R.prog = 0.3; R.inZone = false;
    this.hook.copy(this.bobPos);
    this.audio && this.audio.play('hook', { vol: 0.8 });
    this.fx && this.fx.splash(_v.set(this.bobPos.x, this.T.waterLevelAt(this.bobPos.x, this.bobPos.z), this.bobPos.z), 14, 1);
    this.water.addRipple(this.bobPos.x, this.bobPos.z, 1.0);
    this.swimmers.scare(this.bobPos.x, this.bobPos.z, 5);
    this.onEvent('hook', this.fishKey);
  }
  catchFish() {
    const key = this.fishKey, f = FISH[key];
    const rod = this.getCtx().rodLevel;
    const k = Math.pow(Math.random(), rod > 1 ? 1.15 : 1.6);
    const len = +(f.len[0] + (f.len[1] - f.len[0]) * k).toFixed(1);
    const weight = fishWeight(key, len);
    const variant = key === 'koi' ? Math.floor(Math.random() * koiVariantCount()) : 0;
    const p = this.player;
    const lvl = this.T.waterLevelAt(this.hook.x, this.hook.z);
    this.fx && this.fx.splash(_v.set(this.hook.x, lvl, this.hook.z), 22, 1.3);
    this.water.addRipple(this.hook.x, this.hook.z, 1.2);
    this.audio && this.audio.play('splash', { vol: 0.8 });
    this.bobber.visible = false; this.line.visible = false;
    const size = clamp(len / 100, 0.16, 0.85);
    const wrap = new THREE.Group();
    const mesh = makeFishMesh(key, variant, size, this.heldMat);
    mesh.quaternion.setFromRotationMatrix(_m.makeBasis(_v.set(0, 0, 1), _v2.set(-1, 0, 0), new THREE.Vector3(0, -1, 0)));
    wrap.add(mesh); wrap.position.set(0, -size * 0.15, 0);
    this.prevTool = p.tool;
    p.holdAction = false; p.action = null;
    p.setTool('none');
    p.showFishModel(wrap);
    this.state = 'caught';
    p.startAction('showfish', 2.4, 0.15, () => this.audio && this.audio.play('catch', { vol: 0.9 }), () => {
      p.showFishModel(null); p.setTool(this.prevTool || 'rod'); this.state = 'idle';
    });
    this.onEvent('catch', { key, len, weight, variant });
  }
  lose() {
    this.onEvent('toast', '啊，鱼挣脱了！');
    this.audio && this.audio.play('lose', { vol: 0.7 });
    this.retrieve();
  }
  retrieve() {
    if (this.state === 'idle' || this.state === 'retrieve') return;
    const p = this.player;
    if (!this.bobber.visible) { this.finish(); return; }
    this.state = 'retrieve';
    this.flight = { from: this.bobPos.clone(), t: 0, dur: 0.38 };
    this.audio && this.audio.play('reel', { vol: 0.5 });
    if (p.action === 'fishing') { p.holdAction = false; p.action = null; }
  }
  finish() {
    const p = this.player;
    this.state = 'idle'; this.bobber.visible = false; this.line.visible = false;
    if (p.action === 'fishing' || p.action === 'cast') { p.holdAction = false; p.action = null; }
    this.biteK = 0;
  }
  cancel() {
    if (this.state === 'caught') return;
    if (this.state !== 'idle') this.finish();
  }

  update(dt, t) {
    const T = this.T, p = this.player;
    const s = this.state;
    const bobInfo = (s === 'wait' || s === 'bite') ? { x: this.bobPos.x, z: this.bobPos.z, where: this.where } : null;
    this.swimmers.update(dt, t, bobInfo, p, p.pos);
    this.biteK = Math.max(0, this.biteK - dt * 2);
    if (s === 'charge') {
      this.power += this.pdir * dt * 1.05;
      if (this.power >= 1) { this.power = 1; this.pdir = -1; }
      if (this.power <= 0) { this.power = 0; this.pdir = 1; }
      p.reelK = 0; p.rodBend = 0;
    } else if (s === 'cast') {
      const F = this.flight; F.t += dt / F.dur;
      const u = clamp(F.t, 0, 1);
      this.bobPos.lerpVectors(F.from, F.to, u);
      this.bobPos.y += Math.sin(u * Math.PI) * F.apex;
      if (F.t >= 1) this.landed();
    } else if (s === 'wait' || s === 'bite') {
      this.tw += dt;
      const lv = T.waterLevelAt(this.bobPos.x, this.bobPos.z);
      // river drift
      if (this.where !== 'pond' && s === 'wait') {
        const ri = T.riverInfo(this.bobPos.x, this.bobPos.z);
        const rp = T.riverPointAt(ri.s);
        const sp = T.riverSpeed(ri.s) * 0.14;
        const nx = this.bobPos.x + rp.tx * sp * dt, nz = this.bobPos.z + rp.tz * sp * dt;
        const w = T.waterAt(nx, nz);
        if (w && w.depth > 0.18 && Math.hypot(nx - this.land.x, nz - this.land.z) < 2.6) { this.bobPos.x = nx; this.bobPos.z = nz; }
      }
      if (s === 'wait') {
        while (this.nibbles.length && this.tw >= this.nibbles[0]) {
          this.nibbles.shift(); this.dip = 0.045; this.lastNibble = this.tw;
          this.water.addRipple(this.bobPos.x, this.bobPos.z, 0.35);
          this.audio && this.audio.play('nibble', { vol: 0.45 });
          this.fx && this.fx.splash(_v.set(this.bobPos.x, lv, this.bobPos.z), 2, 0.35);
        }
        this.ambT -= dt;
        if (this.ambT < 0) { this.ambT = 2.2 + Math.random() * 1.5; this.water.addRipple(this.bobPos.x, this.bobPos.z, 0.12); }
        if (this.tw >= this.biteAt) {
          this.state = 'bite'; this.biteWin = lerp(1.2, 0.72, FISH[this.fishKey].diff); this.biteT = 0;
          this.biteK = 1;
          this.water.addRipple(this.bobPos.x, this.bobPos.z, 0.9);
          this.audio && this.audio.play('bite', { vol: 0.9 });
          this.fx && this.fx.splash(_v.set(this.bobPos.x, lv, this.bobPos.z), 8, 0.7);
          this.onEvent('bite');
        }
        this.dip = Math.max(0, this.dip - dt * 0.2);
        this.bobPos.y = lv - 0.005 + Math.sin(t * 2.3) * 0.01 - (this.dip > 0.03 ? 0.045 : 0) * smoothstep(0.03, 0.045, this.dip);
      } else {
        this.biteT += dt;
        this.biteK = 1;
        this.bobPos.y = lv - 0.13 + Math.sin(t * 30) * 0.02;
        if (this.biteT > this.biteWin) {
          this.onEvent('toast', '鱼溜走了…再等等看');
          this.state = 'wait'; this.startWait(); this.biteAt += 1.5;
        }
      }
      p.reelK = 0; p.rodBend = s === 'bite' ? 0.6 + Math.sin(t * 25) * 0.2 : 0;
    } else if (s === 'reel') {
      this.updateReel(dt, t);
    } else if (s === 'retrieve') {
      const F = this.flight; F.t += dt / F.dur;
      const tip = p.rodTipWorld(_v2);
      const u = smoothstep(0, 1, clamp(F.t, 0, 1));
      this.bobPos.lerpVectors(F.from, tip, u);
      this.bobPos.y += Math.sin(u * Math.PI) * 0.5;
      if (F.t >= 1) this.finish();
    }
    // visuals
    if (this.bobber.visible) {
      this.bobber.position.copy(this.bobPos);
      const tilt = s === 'reel' ? 0.6 : s === 'bite' ? 0.35 : 0.06;
      this.bobber.rotation.set(Math.sin(t * 2.1) * tilt, 0, Math.cos(t * 1.7) * tilt);
    }
    if (this.line.visible) this.updateLine(t);
  }

  updateReel(dt, t) {
    const R = this.reel, f = FISH[this.fishKey], d = f.diff, p = this.player, T = this.T;
    // player-controlled zone
    const up = this.holding;
    R.zv += (up ? 3.1 : -2.6) * dt;
    R.zv = clamp(R.zv, -1.6, 1.6);
    R.zy += R.zv * dt;
    const top = 1 - R.zh;
    if (R.zy < 0) { R.zy = 0; R.zv = R.zv < -0.25 ? -R.zv * 0.35 : 0; }
    if (R.zy > top) { R.zy = top; R.zv = Math.min(0, R.zv) * 0.3; }
    // fish motion
    R.ft -= dt;
    let beh = f.beh;
    if (beh === 'mixed') beh = R.mixBeh || 'smooth';
    if (R.ft <= 0) {
      if (f.beh === 'mixed') R.mixBeh = ['smooth', 'dart', 'sinker', 'floater'][Math.floor(Math.random() * 4)];
      const rnd = Math.random();
      if (beh === 'dart') { R.target = clamp(R.fy + (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.4), 0.04, 0.96); R.ft = lerp(1.3, 0.45, d) * (0.6 + Math.random() * 0.8); }
      else if (beh === 'sinker') { R.target = 0.04 + Math.pow(rnd, 1.8) * 0.75; R.ft = lerp(1.8, 0.7, d) * (0.6 + Math.random() * 0.8); }
      else if (beh === 'floater') { R.target = 0.96 - Math.pow(rnd, 1.8) * 0.75; R.ft = lerp(1.8, 0.7, d) * (0.6 + Math.random() * 0.8); }
      else { R.target = 0.08 + rnd * 0.84; R.ft = lerp(2.2, 0.9, d) * (0.6 + Math.random() * 0.8); }
    }
    const stiff = beh === 'dart' ? 10 + 22 * d : 3 + 7 * d;
    const maxv = beh === 'dart' ? 0.7 + 1.5 * d : 0.3 + 0.9 * d;
    R.fv += (R.target - R.fy) * stiff * dt;
    R.fv *= Math.exp(-(beh === 'dart' ? 5 : 3) * dt);
    R.fv = clamp(R.fv, -maxv, maxv);
    R.fy = clamp(R.fy + R.fv * dt + Math.sin(t * 9) * 0.004 * d, 0.02, 0.98);
    // progress
    R.inZone = R.fy >= R.zy - 0.01 && R.fy <= R.zy + R.zh + 0.01;
    R.prog += (R.inZone ? 0.3 - 0.09 * d : -(0.13 + 0.12 * d)) * dt;
    R.shake = R.inZone ? 0 : 1;
    // world feedback
    const pf = p.forward(_v2);
    const across = (R.fy - 0.5) * 2.2;
    const toward = clamp(R.prog, 0, 1) * 0.55;
    const tx = lerp(this.land.x, p.pos.x + pf.x * 1.4, toward) + -pf.z * across;
    const tz = lerp(this.land.z, p.pos.z + pf.z * 1.4, toward) + pf.x * across;
    const w = T.waterAt(tx, tz);
    if (w && w.depth > 0.15) { this.hook.x = damp(this.hook.x, tx, 3, dt); this.hook.z = damp(this.hook.z, tz, 3, dt); }
    const lv = T.waterLevelAt(this.hook.x, this.hook.z);
    this.bobPos.set(this.hook.x, lv - 0.06 + Math.sin(t * 22) * 0.03, this.hook.z);
    this.splashT -= dt;
    if (this.splashT < 0) {
      this.splashT = 0.22 + Math.random() * 0.25;
      this.fx && this.fx.splash(_v.set(this.hook.x, lv, this.hook.z), 4 + Math.floor(d * 6), 0.6 + d * 0.5);
      this.water.addRipple(this.hook.x, this.hook.z, 0.5);
      if (Math.random() < 0.35) this.audio && this.audio.play('splash', { vol: 0.25 + d * 0.3 });
    }
    this.reelTick -= dt;
    if (up && this.reelTick < 0) { this.reelTick = 0.075; this.audio && this.audio.play('tick', { vol: 0.25 }); }
    p.reelK = up ? 1 : 0.35; p.rodBend = R.inZone ? 0.55 : 1.0;
    if (R.prog >= 1) this.catchFish();
    else if (R.prog <= 0) this.lose();
  }

  updateLine(t) {
    const p = this.player, s = this.state;
    const tip = p.rodTipWorld(_v2);
    const A = this.line.geometry.attributes.position, arr = A.array;
    const b = this.bobPos;
    const top = _v.set(b.x, b.y + (s === 'reel' ? 0 : 0.14), b.z);
    const dist = tip.distanceTo(top);
    let sag = 0;
    if (s === 'wait') sag = Math.min(0.7, dist * 0.07);
    else if (s === 'bite') sag = 0.02;
    else if (s === 'cast') sag = 0.15;
    else if (s === 'retrieve') sag = 0.1;
    const vib = s === 'reel' ? 0.012 : 0;
    for (let i = 0; i <= this.N; i++) {
      const u = i / this.N;
      const x = lerp(tip.x, top.x, u), z = lerp(tip.z, top.z, u);
      let y = lerp(tip.y, top.y, u) - sag * 4 * u * (1 - u);
      y += Math.sin(t * 60 + u * 20) * vib * Math.sin(u * Math.PI);
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
    A.needsUpdate = true;
  }
}
