import * as THREE from 'three';
import { GeoBuilder } from '../util/geo.js';
import { clamp, lerp, smoothstep, damp, dampAngle } from '../util/math.js';

const r6 = (x, z) => Math.pow(x ** 6 + z ** 6, 1 / 6);
const PLAY_R = 82;

function rimPatch(mat, U) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = U.uSkyAmbient;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ float rim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += (uRim * 0.5 + vec3(0.04)) * rim * 0.55 * diffuseColor.rgb * 2.0; }`);
  };
  mat.customProgramCacheKey = () => 'rim';
  return mat;
}

function part(builderFn, mat) {
  const B = new GeoBuilder();
  builderFn(B);
  const m = new THREE.Mesh(B.build(), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export class Player {
  constructor(T, colliders, U) {
    this.T = T; this.col = colliders; this.U = U;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.vy = 0;
    this.yaw = 0; this.grounded = true; this.walkPhase = 0; this.speed = 0;
    this.action = null; this.actionT = 0; this.actionDur = 0; this.actionCb = null; this.actionFired = false;
    this.pose = 'none'; this.tool = 'none'; this.blink = 0; this.blinkT = 2;
    this.waterDepth = 0; this.surface = 'grass'; this.stepAcc = 0;
    this.onStep = null; this.onLand = null;
    this.mat = rimPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }), U);
    this.eyeMat = new THREE.MeshStandardMaterial({ color: '#1f1a17', roughness: 0.15, metalness: 0 });
    this.build();
  }

  build() {
    const M = this.mat;
    const skin = '#f7d2b1', shirt = '#f6efe0', denim = '#4f7fc0', boot = '#7a4e2e', hair = '#6b3f22', straw = '#ecc66e';
    const root = new THREE.Group(); root.name = 'player'; this.root = root;
    const hips = new THREE.Group(); hips.position.y = 0.5; root.add(hips); this.hips = hips;
    // torso
    const torso = part(B => {
      B.add(new THREE.SphereGeometry(1, 14, 10), { pos: [0, 0.2, 0], scale: [0.25, 0.27, 0.2], color: shirt });
      B.add(new THREE.SphereGeometry(1, 14, 10), { pos: [0, 0.02, 0], scale: [0.27, 0.2, 0.215], color: denim });
      B.add(new THREE.BoxGeometry(0.26, 0.2, 0.06), { pos: [0, 0.2, 0.165], rot: [-0.12, 0, 0], color: denim });
      B.add(new THREE.BoxGeometry(0.1, 0.07, 0.02), { pos: [0, 0.2, 0.2], rot: [-0.12, 0, 0], color: '#3f6aa6' });
      for (const s of [-1, 1]) {
        B.add(new THREE.BoxGeometry(0.05, 0.3, 0.035), { pos: [s * 0.1, 0.3, 0.15], rot: [-0.35, 0, 0], color: denim });
        B.add(new THREE.BoxGeometry(0.05, 0.3, 0.035), { pos: [s * 0.1, 0.3, -0.15], rot: [0.35, 0, 0], color: denim });
        B.add(new THREE.SphereGeometry(0.022, 6, 4), { pos: [s * 0.1, 0.28, 0.2], color: '#f2c94c' });
      }
      B.add(new THREE.TorusGeometry(0.1, 0.035, 6, 14), { pos: [0, 0.43, 0.01], rot: [Math.PI / 2 + 0.15, 0, 0], color: '#d9534a' });
      B.add(new THREE.ConeGeometry(0.05, 0.09, 6), { pos: [0.02, 0.37, 0.12], rot: [0.4, 0, 0.3], color: '#d9534a' });
    }, M);
    hips.add(torso); this.torso = torso;
    // head
    const head = new THREE.Group(); head.position.y = 0.47; hips.add(head); this.head = head;
    const face = part(B => {
      B.add(new THREE.SphereGeometry(0.27, 20, 16), { pos: [0, 0.2, 0], scale: [1, 0.95, 0.95], color: skin });
      B.add(new THREE.SphereGeometry(0.28, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), { pos: [0, 0.215, -0.02], rot: [-0.35, 0, 0], color: hair });
      for (let i = 0; i < 5; i++) B.add(new THREE.SphereGeometry(0.075, 8, 6), { pos: [-0.16 + i * 0.08, 0.36 - Math.abs(i - 2) * 0.012, 0.17], scale: [1, 0.7, 0.6], color: hair });
      for (const s of [-1, 1]) {
        B.add(new THREE.SphereGeometry(0.05, 8, 6), { pos: [s * 0.265, 0.18, 0], scale: [0.5, 1, 0.8], color: skin });
        B.add(new THREE.SphereGeometry(0.045, 10, 6), { pos: [s * 0.15, 0.12, 0.215], scale: [1, 0.55, 0.3], color: '#f4a7a0' });
      }
      B.add(new THREE.SphereGeometry(0.022, 8, 6), { pos: [0, 0.155, 0.26], color: '#efb895' });
      B.add(new THREE.TorusGeometry(0.035, 0.01, 4, 10, Math.PI), { pos: [0, 0.095, 0.245], rot: [0.25, 0, Math.PI], color: '#8a3b2e' });
    }, M);
    head.add(face);
    // eyes
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), this.eyeMat);
      e.position.set(s * 0.095, 0.205, 0.235); e.scale.set(0.85, 1.15, 0.5);
      head.add(e); this.eyes.push(e);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      hl.position.set(s * 0.095 + 0.012, 0.222, 0.255); head.add(hl); this.eyes.push(hl);
    }
    // hat
    const hat = part(B => {
      B.add(new THREE.CylinderGeometry(0.43, 0.45, 0.03, 28), { pos: [0, 0, 0], color: straw, colorFn: (c, x, y, z) => c.multiplyScalar(0.88 + 0.14 * Math.sin(Math.hypot(x, z) * 90)) });
      B.add(new THREE.CylinderGeometry(0.19, 0.225, 0.18, 22), { pos: [0, 0.1, 0], color: straw, colorFn: (c, x, y) => c.multiplyScalar(0.88 + 0.12 * Math.sin(y * 120)) });
      B.add(new THREE.SphereGeometry(0.19, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), { pos: [0, 0.19, 0], scale: [1, 0.35, 1], color: straw });
      B.add(new THREE.CylinderGeometry(0.228, 0.228, 0.05, 22), { pos: [0, 0.04, 0], color: '#d9534a' });
    }, M);
    hat.position.set(0, 0.39, -0.02); hat.rotation.x = -0.18; head.add(hat); this.hat = hat;
    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.25, 0.3, 0); hips.add(sh);
      const arm = part(B => {
        B.add(new THREE.SphereGeometry(1, 10, 8), { pos: [0, -0.07, 0], scale: [0.075, 0.1, 0.075], color: shirt });
        B.add(new THREE.CylinderGeometry(0.055, 0.06, 0.2, 10), { pos: [0, -0.18, 0], color: shirt });
        B.add(new THREE.SphereGeometry(0.062, 10, 8), { pos: [0, -0.3, 0], color: skin });
      }, M);
      sh.add(arm);
      const hand = new THREE.Group(); hand.position.set(0, -0.3, 0); sh.add(hand);
      this.arms.push({ sh, hand, s });
    }
    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const hp = new THREE.Group(); hp.position.set(s * 0.11, 0.5, 0); root.add(hp);
      const leg = part(B => {
        B.add(new THREE.CylinderGeometry(0.075, 0.07, 0.3, 10), { pos: [0, -0.17, 0], color: denim });
        B.add(new THREE.SphereGeometry(1, 10, 8), { pos: [0, -0.42, 0.035], scale: [0.085, 0.07, 0.12], color: boot });
        B.add(new THREE.CylinderGeometry(0.08, 0.085, 0.08, 10), { pos: [0, -0.36, 0], color: boot });
      }, M);
      hp.add(leg);
      this.legs.push({ hp, s });
    }
    // tools
    this.tools = {};
    const hand = this.arms[1].hand;
    const toolMat = M;
    const hoe = part(B => {
      B.add(new THREE.CylinderGeometry(0.022, 0.025, 1.0, 7), { pos: [0, -0.35, 0], color: '#a8784a' });
      B.add(new THREE.BoxGeometry(0.18, 0.04, 0.15), { pos: [0, -0.86, 0.06], rot: [0.3, 0, 0], color: '#9aa3a8' });
      B.add(new THREE.BoxGeometry(0.06, 0.06, 0.06), { pos: [0, -0.84, 0], color: '#5a5a5a' });
    }, toolMat);
    const can = part(B => {
      B.add(new THREE.CylinderGeometry(0.11, 0.12, 0.2, 14), { pos: [0, -0.08, 0.06], rot: [Math.PI / 2, 0, 0], color: '#5aa59a' });
      B.add(new THREE.CylinderGeometry(0.115, 0.115, 0.02, 14), { pos: [0, -0.08, 0.17], rot: [Math.PI / 2, 0, 0], color: '#3f857b' });
      B.add(new THREE.CylinderGeometry(0.018, 0.026, 0.3, 7), { pos: [0, -0.02, 0.29], rot: [Math.PI / 2 - 0.7, 0, 0], color: '#5aa59a' });
      B.add(new THREE.CylinderGeometry(0.04, 0.025, 0.04, 8), { pos: [0, 0.08, 0.4], rot: [Math.PI / 2 - 0.7, 0, 0], color: '#3f857b' });
      B.add(new THREE.TorusGeometry(0.07, 0.014, 5, 10, Math.PI), { pos: [0, 0.0, 0.0], rot: [0, Math.PI / 2, 0], color: '#3f857b' });
    }, toolMat);
    const rod = part(B => {
      B.add(new THREE.CylinderGeometry(0.008, 0.022, 1.7, 6), { pos: [0, -0.75, 0], color: '#c79a5b', colorFn: (c, x, y) => { if (y > -0.2) c.set('#6b4a2c'); } });
      B.add(new THREE.CylinderGeometry(0.04, 0.04, 0.035, 10), { pos: [0.04, -0.12, 0], rot: [0, 0, Math.PI / 2], color: '#4a4f57' });
    }, toolMat);
    const rodTip = new THREE.Object3D(); rodTip.position.set(0, -1.6, 0); rod.add(rodTip); this.rodTip = rodTip;
    const seeds = part(B => {
      B.add(new THREE.SphereGeometry(0.09, 10, 8), { pos: [0, -0.06, 0.03], scale: [1, 1.15, 0.9], color: '#d8c39a' });
      B.add(new THREE.CylinderGeometry(0.03, 0.05, 0.05, 8), { pos: [0, 0.05, 0.03], color: '#b89a6a' });
      B.add(new THREE.BoxGeometry(0.06, 0.05, 0.01), { pos: [0, -0.05, 0.11], color: '#6aa84f' });
    }, toolMat);
    const fish = new THREE.Group();
    for (const [k, m] of Object.entries({ hoe, can, rod, seeds, fish })) { m.visible = false; hand.add(m); this.tools[k] = m; }
    const spout = new THREE.Object3D(); spout.position.set(0, 0.09, 0.42); can.add(spout); this.spout = spout;
    this.canMesh = can;
    root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    // blob shadow-less contact darkening: not needed (real shadows)
  }

  setTool(t) {
    this.tool = t;
    for (const k in this.tools) this.tools[k].visible = (k === t) && k !== 'fish';
  }
  showFishModel(mesh) {
    const f = this.tools.fish;
    while (f.children.length) f.remove(f.children[0]);
    if (mesh) { f.add(mesh); f.visible = true; } else f.visible = false;
  }
  place(x, z, yaw) {
    // never drop the player into deep water / inside a wall: spiral out to the nearest valid spot
    const ok = (px, pz) => { const q = { x: px, z: pz }; this.col.resolve(q, 0.3); return Math.hypot(q.x - px, q.z - pz) < 1e-3 && this.canStand(px, pz, this.T.groundHeight(px, pz)); };
    if (!ok(x, z)) {
      search: for (let r = 0.5; r < 30; r += 0.5) {
        for (let a = 0; a < 24; a++) {
          const px = x + Math.cos(a / 24 * Math.PI * 2) * r, pz = z + Math.sin(a / 24 * Math.PI * 2) * r;
          if (ok(px, pz)) { x = px; z = pz; break search; }
        }
      }
    }
    this.pos.set(x, this.T.groundHeight(x, z), z); this.yaw = yaw; this.vel.set(0, 0, 0); this.vy = 0;
    this.root.position.copy(this.pos); this.root.rotation.y = yaw;
  }
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  // action: {name, dur, at (0..1 fire time), cb}
  startAction(name, dur, at, cb, done) {
    this.action = name; this.actionT = 0; this.actionDur = dur; this.actionAt = at; this.actionCb = cb; this.actionDone = done; this.actionFired = false;
  }
  busy() { return !!this.action; }

  canStand(x, z, fromH) {
    const T = this.T;
    if (r6(x, z) > PLAY_R) return false;
    const gh = T.groundHeight(x, z);
    const deck = T.onDeck(x, z);
    const lv = T.waterLevelAt(x, z);
    if (!deck && lv > -40 && lv - gh > 0.78) return false;
    if (!deck && gh - fromH > 0.45) return false;
    if (deck && gh - fromH > 0.5) return false;
    return true;
  }

  update(dt, input, camYaw, t) {
    const T = this.T;
    // ---- movement intent ----
    let mx = 0, mz = 0;
    if (!this.action && !input.locked) {
      const f = (input.fwd ? 1 : 0) - (input.back ? 1 : 0), r = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (f || r) {
        const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
        mx = fx * f + rx * r; mz = fz * f + rz * r;
        const l = Math.hypot(mx, mz); mx /= l; mz /= l;
      }
    }
    const wade = clamp(this.waterDepth / 0.75, 0, 1);
    const maxSp = (input.run ? 6.0 : 3.4) * lerp(1, 0.5, wade);
    const tvx = mx * maxSp, tvz = mz * maxSp;
    const acc = (mx || mz) ? 10 : 12;
    this.vel.x = damp(this.vel.x, tvx, acc, dt); this.vel.z = damp(this.vel.z, tvz, acc, dt);
    if (mx || mz) this.yaw = dampAngle(this.yaw, Math.atan2(mx, mz), 12, dt);
    // ---- horizontal move with checks ----
    const cur = this.pos;
    const curH = T.groundHeight(cur.x, cur.z);
    let nx = cur.x + this.vel.x * dt, nz = cur.z + this.vel.z * dt;
    const footH = this.grounded ? curH : Math.max(curH, cur.y);
    if (!this.canStand(nx, nz, footH)) {
      if (this.canStand(nx, cur.z, footH)) nz = cur.z;
      else if (this.canStand(cur.x, nz, footH)) nx = cur.x;
      else { nx = cur.x; nz = cur.z; }
    }
    const p = { x: nx, z: nz };
    this.col.resolve(p, 0.3);
    if (!this.canStand(p.x, p.z, footH)) { p.x = cur.x; p.z = cur.z; }
    const moved = Math.hypot(p.x - cur.x, p.z - cur.z);
    cur.x = p.x; cur.z = p.z;
    this.speed = moved / Math.max(dt, 1e-4);
    // ---- vertical ----
    const gh = T.groundHeight(cur.x, cur.z);
    if (input.jump && this.grounded && !this.action && wade < 0.6) { this.vy = 6.0; this.grounded = false; this.onJump && this.onJump(); }
    if (!this.grounded) {
      this.vy -= 19 * dt; cur.y += this.vy * dt;
      if (cur.y <= gh) { cur.y = gh; this.grounded = true; if (this.vy < -3) this.onLand && this.onLand(); this.vy = 0; }
    } else {
      if (gh < cur.y - 0.35) { this.grounded = false; this.vy = 0; }
      else cur.y = damp(cur.y, gh, 30, dt);
    }
    // ---- environment info ----
    const lv = T.waterLevelAt(cur.x, cur.z);
    const deck = T.onDeck(cur.x, cur.z);
    this.waterDepth = (!deck && lv > -40) ? Math.max(0, lv - cur.y) : 0;
    this.waterLevel = lv;
    this.surface = deck ? 'wood' : this.waterDepth > 0.05 ? 'water' : (T.pathAt(cur.x, cur.z) > 0.4 ? 'path' : 'grass');
    // steps
    if (this.grounded && this.speed > 0.5) {
      this.stepAcc += this.speed * dt;
      const stride = input.run ? 0.95 : 0.7;
      if (this.stepAcc > stride) { this.stepAcc = 0; this.onStep && this.onStep(this.surface, input.run); }
    }
    // ---- action timeline ----
    if (this.action) {
      this.actionT += dt / this.actionDur;
      if (!this.actionFired && this.actionT >= this.actionAt) { this.actionFired = true; this.actionCb && this.actionCb(); }
      if (this.actionT >= 1) {
        const done = this.actionDone; const name = this.action;
        if (!this.holdAction) { this.action = null; }
        else this.actionT = 1;
        done && done(name);
      }
    }
    this.animate(dt, t, input);
    this.root.position.copy(cur);
    this.root.rotation.y = this.yaw;
    this.U.uPlayerPos.value.copy(cur);
  }

  animate(dt, t, input) {
    const sp = this.speed, run = sp > 4.5;
    const k = smoothstep(0.2, 2.5, sp);
    this.walkPhase += dt * (run ? 11.5 : 8.6) * clamp(sp / (run ? 6 : 3.4), 0.3, 1.25);
    const ph = this.walkPhase;
    const L = this.legs, A = this.arms;
    const air = !this.grounded;
    // defaults
    let hipsY = 0.5 + Math.abs(Math.sin(ph)) * 0.05 * k + Math.sin(t * 2.2) * 0.006 * (1 - k);
    let hipsRX = (run ? 0.2 : 0.06) * k, hipsRY = Math.sin(ph) * 0.12 * k;
    let legA = Math.sin(ph) * (run ? 0.95 : 0.7) * k;
    let armL = { x: -legA * 0.8, z: -0.12 }, armR = { x: legA * 0.8, z: 0.12 };
    let headRX = -hipsRX * 0.6, headRY = 0;
    let toolRot = null;
    if (air) { legA = 0; L[0].hp.rotation.x = -0.6; L[1].hp.rotation.x = 0.3; armL = { x: -2.2, z: -0.4 }; armR = { x: -2.2, z: 0.4 }; }
    // tool carry pose
    const T = this.tool;
    if (!this.action && !air) {
      if (T === 'hoe') { armR = { x: -0.45 + legA * 0.2, z: 0.08 }; toolRot = [-2.69, 0, 0]; }
      else if (T === 'can') { armR = { x: -0.25 + legA * 0.3, z: 0.1 }; toolRot = [0.25, 0, 0]; }
      else if (T === 'rod') { armR = { x: -0.55 + legA * 0.15, z: 0.1 }; toolRot = [-1.55, 0, 0]; }
      else if (T === 'seeds') { armR = { x: -0.5 + legA * 0.3, z: 0.1 }; toolRot = [0.4, 0, 0]; }
    }
    // actions
    const a = this.action, u = clamp(this.actionT, 0, 1);
    if (a === 'hoe') {
      const up = smoothstep(0, 0.42, u), down = smoothstep(0.42, 0.6, u), back = smoothstep(0.8, 1, u);
      const ax = lerp(lerp(-0.45, -2.9, up), -1.05, down);
      armR = { x: lerp(ax, -0.45, back), z: 0.05 }; armL = { x: lerp(ax, 0, back), z: -0.05 };
      toolRot = [lerp(lerp(lerp(-2.69, -1.3, up), 0.35, down), -2.69, back), 0, 0];
      hipsRX = lerp(-0.1 * up, 0.3, down) * (1 - back); hipsY -= 0.06 * down * (1 - back);
      headRX = 0.2 * down;
    } else if (a === 'water') {
      const tilt = smoothstep(0.1, 0.3, u) * (1 - smoothstep(0.85, 1, u));
      armR = { x: lerp(-0.25, -1.0, tilt), z: 0.12 }; toolRot = [lerp(0.25, 1.35, tilt), 0, 0];
      hipsRX = 0.12 * tilt; headRX = 0.35 * tilt;
    } else if (a === 'plant' || a === 'harvest') {
      const dn = smoothstep(0, 0.35, u) * (1 - smoothstep(0.7, 1, u));
      hipsY -= 0.2 * dn; hipsRX = 0.55 * dn; headRX = 0.2 * dn;
      L[0].hp.rotation.x = -0.9 * dn; L[1].hp.rotation.x = -0.9 * dn;
      armR = { x: lerp(0, -1.2, dn), z: 0.1 }; armL = { x: lerp(0, -0.9, dn), z: -0.1 };
      if (a === 'harvest') { const pull = smoothstep(0.45, 0.65, u) * (1 - smoothstep(0.8, 1, u)); armR.x += 0.4 * pull; armL.x += 0.4 * pull; hipsRX -= 0.25 * pull; }
      toolRot = [0.6, 0, 0];
    } else if (a === 'cast') {
      const back = smoothstep(0, 0.45, u), fwd = smoothstep(0.5, 0.65, u);
      armR = { x: lerp(lerp(-0.55, -2.9, back), -1.1, fwd), z: 0.15 }; armL = { x: lerp(-0.3, -0.9, fwd), z: -0.1 };
      toolRot = [lerp(lerp(-1.55, -1.17, back), -0.99, fwd), 0, 0];
      hipsRY = lerp(0.3 * back, -0.15, fwd); hipsRX = 0.15 * fwd;
    } else if (a === 'fishing') {
      const w = this.reelK || 0;
      armR = { x: -1.05 + Math.sin(t * 14) * 0.03 * w, z: 0.15 }; armL = { x: -0.95 + Math.sin(t * 18) * 0.05 * w, z: -0.25 };
      toolRot = [-1.05 + (this.rodBend || 0) * 0.35, 0, 0];
      hipsRX = -0.06 - 0.12 * w; hipsRY = Math.sin(t * 9) * 0.03 * w;
    } else if (a === 'showfish') {
      const up = smoothstep(0, 0.2, u);
      armR = { x: lerp(0, -2.9, up), z: 0.25 }; armL = { x: lerp(0, -2.9, up), z: -0.25 };
      headRX = -0.25 * up; hipsY += 0.03 * Math.sin(u * 20) * up;
    } else if (a === 'sleep') {
      hipsRX = 0.1; headRX = 0.4;
    } else if (a === 'refill') {
      const dn = smoothstep(0, 0.3, u) * (1 - smoothstep(0.7, 1, u));
      hipsY -= 0.15 * dn; hipsRX = 0.5 * dn; armR = { x: -1.3 * dn - 0.25, z: 0.12 }; toolRot = [0.25 + 1.2 * dn, 0, 0];
      L[0].hp.rotation.x = -0.6 * dn; L[1].hp.rotation.x = -0.6 * dn;
    }
    const legsFree = !a || a === 'fishing' || a === 'cast' || a === 'hoe' || a === 'water' || a === 'showfish';
    if (!air && legsFree) { L[0].hp.rotation.x = legA; L[1].hp.rotation.x = -legA; }
    const r = 1 - Math.exp(-dt * 18);
    this.hips.position.y = lerp(this.hips.position.y, hipsY, r);
    this.hips.rotation.x = lerp(this.hips.rotation.x, hipsRX, r);
    this.hips.rotation.y = lerp(this.hips.rotation.y, hipsRY, r);
    A[0].sh.rotation.x = lerp(A[0].sh.rotation.x, armL.x, r); A[0].sh.rotation.z = lerp(A[0].sh.rotation.z, armL.z - 0.08, r);
    A[1].sh.rotation.x = lerp(A[1].sh.rotation.x, armR.x, r); A[1].sh.rotation.z = lerp(A[1].sh.rotation.z, armR.z + 0.08, r);
    this.head.rotation.x = lerp(this.head.rotation.x, headRX, r);
    this.head.rotation.y = lerp(this.head.rotation.y, headRY, r);
    if (toolRot) for (const k in this.tools) { const m = this.tools[k]; m.rotation.x = lerp(m.rotation.x, toolRot[0], r); }
    // fish model held overhead
    this.tools.fish.rotation.set(0, 0, Math.PI / 2);
    // breathing & blink
    this.torso.scale.y = 1 + Math.sin(t * 2.2) * 0.012;
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 0.14; this.blinkT = 2 + Math.random() * 3.5; }
    this.blink -= dt;
    const ey = this.blink > 0 ? 0.12 : 1.15;
    this.eyes[0].scale.y = ey; this.eyes[2].scale.y = ey; this.eyes[1].visible = this.eyes[3].visible = this.blink <= 0;
  }

  // world positions helpers
  rodTipWorld(out) { this.root.updateMatrixWorld(true); return this.rodTip.getWorldPosition(out); }
  spoutWorld(out) { this.root.updateMatrixWorld(true); return this.spout.getWorldPosition(out); }
}
