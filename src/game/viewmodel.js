// First-person "view model": the farmer's own arms (fpArms.js) and whatever they are holding.
//
// The whole group is parented to the camera, so it moves rigidly with the view. A one-line
// vertex patch squeezes these meshes into the front few percent of the depth range: they can
// never poke into a fence post or a tree trunk, yet they are still lit and shadowed by the real
// sun (their world position really is just in front of the eyes).
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../util/math.js';
import { toolModel, cropIconNow } from '../assets/models.js';
import { FPArms } from './fpArms.js';

const _e = new THREE.Euler(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export function vmPatch(mat, U) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
gl_Position.z = mix(-gl_Position.w, gl_Position.z, 0.035);`);
    if (U) {
      // the (invisible) body stands right behind the hands: look the shadow up a metre towards the
      // sun, so it no longer shades them, while trees, roofs and clouds of shade still do
      sh.uniforms.uSunDir = U.uSunDir;
      sh.vertexShader = 'uniform vec3 uSunDir;\n' + sh.vertexShader.replace('#include <shadowmap_vertex>', `#ifdef USE_SHADOWMAP
worldPosition.xyz += uSunDir * 1.05;
#endif
#include <shadowmap_vertex>`);
      // and a little warm fill, so a hand turned away from the sun reads as skin, not grey clay
      sh.uniforms.uSunColor = U.uSunColor;
      sh.fragmentShader = 'uniform vec3 uSunColor;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * uSunColor * 0.05;`);
    }
  };
  mat.customProgramCacheKey = () => (U ? 'vm-s' : 'vm');
  return mat;
}

const quat = (rx, ry, rz, tw = 0) => {
  const q = new THREE.Quaternion().setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
  return tw ? q.multiply(_q.setFromAxisAngle(UP, tw)) : q;
};
// pose: grip position, tool orientation (Euler YXZ + twist about the handle), elbow hint (all camera space)
const P = (x, y, z, rx = 0, ry = 0, rz = 0, tw = 0, e = [0.34, -0.58, -0.1]) => ({ p: new THREE.Vector3(x, y, z), q: quat(rx, ry, rz, tw), e: new THREE.Vector3(...e) });
const ease = (x) => x * x * (3 - 2 * x);
function mixPose(a, b, t, out) { out.p.lerpVectors(a.p, b.p, t); out.q.slerpQuaternions(a.q, b.q, t); out.e.lerpVectors(a.e, b.e, t); return out; }
function copyPose(a, out) { out.p.copy(a.p); out.q.copy(a.q); out.e.copy(a.e); return out; }
// out = a ∘ b (b expressed in a's frame)
function compose(a, b, out) { out.p.copy(b.p).applyQuaternion(a.q).add(a.p); out.q.multiplyQuaternions(a.q, b.q); return out; }
function invPose(a) { const q = a.q.clone().invert(); return { p: a.p.clone().applyQuaternion(q).negate(), q }; }

// ------------------------------------------------------------------ tools
// The tools are the Blender models (src/assets): each one was built in the same frame as the
// old procedural stand-ins here (grip at the origin), so the poses below did not change.
function vmTool(key, U, cache) {
  const g = toolModel(key);
  g.traverse(o => {
    if (!o.isMesh) return;
    let m = cache.get(o.material);
    if (!m) { m = vmPatch(o.material.clone(), U); cache.set(o.material, m); }
    o.material = m;
  });
  return g;
}
const firstMesh = (o) => { let r = null; o.traverse(c => { if (!r && c.isMesh) r = c; }); return r; };

function buildHoe(U, c) {
  // held one-handed near the butt end, the blade hanging towards the knuckle side (-Z)
  return { g: vmTool('hoe', U, c), gripR: P(0, 0, 0, 0, -0.35, 0), gripL: P(0, -0.32, 0, 0, -0.1, 0) };
}
function buildCan(U, c) {
  // grip = the top of the strap handle; the spout runs out towards -Z
  const g = vmTool('can', U, c);
  return { g, spout: g.getObjectByName('Spout'), gripR: P(0, 0.016, 0, -Math.PI / 2, 0, 0) };
}
function buildRod(U, c) {
  // three bamboo segments (pivots at the ferrules) so the blank can bend; the crank turns about X
  const g = vmTool('rod', U, c);
  const segs = ['Seg1', 'Seg2', 'Seg3'].map(n => g.getObjectByName(n));
  const crank = g.getObjectByName('Crank'), knob = g.getObjectByName('Knob').position.clone();
  return { g, segs, tip: g.getObjectByName('Tip'), crank, knob, gripR: P(0, 0, 0, 0, 0.25, 0) };
}
function buildSeeds(U, c) {
  // the crop icon is a separate decal over the label window: its texture is swapped per seed
  const g = vmTool('packet', U, c);
  const icon = firstMesh(g.getObjectByName('Icon'));
  icon.material = icon.material.clone();
  return { g, icon, gripR: P(0.0, -0.005, 0.0, 0, 1.25, 0) };
}

// ------------------------------------------------------------------ poses (camera space)
// Hand-held tool poses: position of the right-hand grip and the tool's orientation (Euler YXZ).
const POSE = {
  hoe: {
    idle: P(0.22, -0.25, -0.44, -1.0, -0.2, 0, 0, [0.33, -0.6, -0.12]),
    up: P(0.26, -0.06, -0.45, 0.25, 0.05, -0.35, 0, [0.44, -0.34, -0.06]),
    // the blade comes down across the body and bites in just below the crosshair, above the hotbar
    strike: P(0.27, -0.1, -0.46, -1.956, 0.304, 0, 0, [0.42, -0.53, -0.15]),
  },
  can: {
    idle: P(0.27, -0.15, -0.5, 0.05, 0.42, 0.03, 0, [0.38, -0.46, -0.1]),
    pour: P(0.21, -0.11, -0.47, -0.7, 0.3, 0.1, 0, [0.42, -0.38, -0.2]),
    dip: P(0.22, -0.5, -0.42, -0.9, 0.35, 0, 0, [0.33, -0.76, -0.2]),
  },
  rod: {
    idle: P(0.24, -0.25, -0.46, -1.0, 0.16, -0.06, 0, [0.34, -0.55, -0.1]),
    back: P(0.27, -0.03, -0.36, 0.25, 0.1, -0.1, 0, [0.4, -0.3, -0.05]),
    cast: P(0.16, -0.17, -0.43, -1.24, 0.08, 0, 0, [0.32, -0.52, -0.15]),
    fish: P(0.15, -0.17, -0.41, -1.12, 0.1, -0.02, 0, [0.32, -0.52, -0.14]),
  },
  seeds: {
    idle: P(0.2, -0.22, -0.4, -0.12, -0.35, 0.12, 0, [0.3, -0.5, -0.1]),
    sow: P(0.19, -0.25, -0.52, -1.0, -0.2, 0.25, 0, [0.32, -0.6, -0.2]),
  },
};
// left-hand elbow hints; the left hand's parking spot below the view (it rises from there)
const ELBOW_L = new THREE.Vector3(-0.45, -0.4, -0.12), ELBOW_CRANK = new THREE.Vector3(-0.2, -0.6, -0.16);
const LOW_L = new THREE.Vector3(-0.16, -0.62, -0.3);
// finger / thumb curl round each tool's grip (the third-person carry values, human.js CARRY)
const CURL = { hoe: [0.8, 0.65], can: [0.85, 0.5], rod: [0.74, 0.55], seeds: [0.5, 0.75] };
// presenting a fish: palms up under it, fingers forward and a little inwards
const FISH_R = quat(0, 0.3, -Math.PI / 2), FISH_L = quat(0, -0.3, Math.PI / 2), KNOB_Q = quat(-0.25, -0.35, -Math.PI / 2);

export class ViewModel {
  constructor(camera, U) {
    this.cam = camera; this.U = U || null;
    this.root = new THREE.Group(); this.root.name = 'viewmodel'; this.root.visible = false;
    camera.add(this.root);
    this.rig = new THREE.Group(); this.root.add(this.rig);
    // the farmer's own arms
    this.arms = new FPArms((m) => vmPatch(m, U));
    this.rig.add(this.arms.root);
    // tools
    this.toolG = new THREE.Group(); this.rig.add(this.toolG);
    const mc = new Map();
    this.T = { hoe: buildHoe(U, mc), can: buildCan(U, mc), rod: buildRod(U, mc), seeds: buildSeeds(U, mc) };
    for (const k in this.T) { const T = this.T[k]; T.g.visible = false; T.gripRi = invPose(T.gripR); this.toolG.add(T.g); }
    this.fishG = new THREE.Group(); this.rig.add(this.fishG);
    this.rig.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; o.frustumCulled = false; } });
    // state
    this.shown = 'none'; this.lowerK = 1; this.sway = new THREE.Vector2(); this.runK = 0; this.airY = 0; this.landT = 1;
    this.wasGrounded = true; this.crankA = 0; this.bend = 0; this.offK = 1; this.offX = 0.05; this.lK = 0;
    this.pose = P(0, 0, 0); this.tmpA = P(0, 0, 0); this.tmpB = P(0, 0, 0); this.hR = P(0, 0, 0); this.hL = P(0, 0, 0); this.lFree = P(0, 0, 0);
    this.sock = P(0, 0, 0);
    this.fish = null;
  }
  swapTo(k) {
    if (k === this.shown) return;
    if (this.T[this.shown]) this.T[this.shown].g.visible = false;
    this.shown = k;
    if (this.T[k]) this.T[k].g.visible = true;
  }
  // everything visible at once, so the renderer can compile every shader up front
  warmup(on) {
    for (const k in this.T) this.T[k].g.visible = on || this.shown === k;
    this.arms.showAll(on);
  }
  // keep the hands clear of the hotbar (fixed-size, bottom centre): on narrow windows it covers
  // more of the screen, so the whole rig slides a little further right
  resize(w, h) {
    const hbW = w <= 800 ? 476 : 570, aspect = w / Math.max(1, h), tanH = Math.tan(33 * Math.PI / 180);
    this.offX = 0.05 + clamp((hbW / w + 0.08) * tanH * aspect * 0.45 - 0.27, 0, 0.09);
  }
  // start fully lowered so the hands rise into view (entering first person)
  drop() { this.lowerK = 1; }
  setSeed(key) {
    const m = this.T.seeds.icon.material, t = cropIconNow(key);
    if (t && m.map !== t) { m.map = t; m.needsUpdate = true; }
  }
  // the caught fish, presented with both hands
  holdFish(wrap) {
    if (this.fish && this.fish !== wrap) this.releaseFish();
    this.fish = wrap || null;
    if (!wrap) return;
    const inner = wrap.children[0];
    this.fishSize = inner ? inner.scale.x : 0.3;
    wrap.userData.tp = { p: wrap.position.clone(), q: wrap.quaternion.clone() };
    // the fish model is set up for the third-person hand; turn it side-on to the camera, head left
    wrap.position.set(0, 0, 0); wrap.rotation.set(0, 0, -Math.PI / 2);
    // squeeze it into the view-model depth range too, so the hands and fish sort correctly
    wrap.traverse(o => {
      if (!o.isMesh) return;
      if (!this.fishMats) this.fishMats = new Map();
      let m = this.fishMats.get(o.material);
      if (!m) { m = vmPatch(o.material.clone(), this.U); this.fishMats.set(o.material, m); }
      o.userData.vm0 = { mat: o.material, cast: o.castShadow, cull: o.frustumCulled };
      o.material = m; o.castShadow = false; o.frustumCulled = false;
    });
    this.fishG.add(wrap);
  }
  releaseFish() {
    const w = this.fish; if (!w) return null;
    this.fishG.remove(w);
    if (w.userData.tp) { w.position.copy(w.userData.tp.p); w.quaternion.copy(w.userData.tp.q); }
    w.traverse(o => { const b = o.userData.vm0; if (b) { o.material = b.mat; o.castShadow = b.cast; o.frustumCulled = b.cull; delete o.userData.vm0; } });
    this.fish = null;
    return w;
  }
  rodTipWorld(out) { this.root.updateMatrixWorld(true); return this.T.rod.tip.getWorldPosition(out); }
  spoutWorld(out) { this.root.updateMatrixWorld(true); return this.T.can.spout.getWorldPosition(out); }
  // direction the spout is pointing (world space)
  spoutDir(out) {
    this.root.updateMatrixWorld(true);
    const s = this.T.can.spout;
    out.set(0, Math.sin(1.03), -Math.cos(1.03)).transformDirection(s.parent.matrixWorld);
    return out;
  }

  // s: { tool, action, u, speed, run, walkPhase, grounded, vy, reelK, rodBend, charge, yawVel, pitchVel, snap }
  update(dt, t, s) {
    const snap = !!s.snap;
    const R = (k) => snap ? 1 : 1 - Math.exp(-k * dt);
    const a = s.action, u = clamp(s.u || 0, 0, 1);
    // ---- tool switching: lower, swap, raise ----
    const want = s.tool in this.T ? s.tool : 'none';
    if (snap) { this.swapTo(want); this.lowerK = 0; }
    else if (want !== this.shown) {
      this.lowerK = Math.min(1, this.lowerK + dt / 0.13);
      if (this.lowerK >= 1) this.swapTo(want);
    } else this.lowerK = Math.max(0, this.lowerK - dt / 0.2);
    const tool = this.shown;
    // ---- body motion: bob, sway, run, jump ----
    const k = s.grounded ? smoothstep(0.3, 3.0, s.speed) : 0;
    const ph = s.walkPhase, run = s.run && s.speed > 4.5;
    this.runK = lerp(this.runK, run ? 1 : 0, R(6));
    const amp = 1 + this.runK * 0.6;
    const bobX = Math.sin(ph) * 0.011 * k * amp, bobY = (Math.abs(Math.cos(ph)) - 0.6) * -0.014 * k * amp;
    const tsx = clamp(-(s.yawVel || 0) * 0.014, -0.08, 0.08), tsy = clamp((s.pitchVel || 0) * 0.012, -0.06, 0.06);
    this.sway.x = lerp(this.sway.x, tsx, R(9)); this.sway.y = lerp(this.sway.y, tsy, R(9));
    if (s.grounded && !this.wasGrounded) this.landT = 0;
    this.wasGrounded = s.grounded;
    this.landT = Math.min(1, this.landT + dt / 0.32);
    const land = Math.sin(this.landT * Math.PI) * 0.028 * (this.landT < 1 ? 1 : 0);
    this.airY = lerp(this.airY, s.grounded ? 0 : clamp(-(s.vy || 0) * 0.006, -0.035, 0.035), R(10));
    const lw = ease(this.lowerK), br = Math.sin(t * 1.7);
    // the caught fish is shown dead centre; everything else sits right of the hotbar
    const fishing = a === 'showfish' && this.fish;
    this.offK = lerp(this.offK, fishing ? 0 : 1, R(8));
    const ox = this.offX * this.offK, oy = 0.03 * this.offK;
    this.rig.position.set(bobX + this.sway.x * 0.35 + ox, bobY + this.airY - land - lw * 0.32 - this.runK * 0.03 + br * 0.003 + oy, this.runK * 0.02);
    this.rig.rotation.set(this.sway.y - lw * 0.55 - this.runK * 0.1 + br * 0.004, this.sway.x, Math.sin(ph) * 0.012 * k - this.runK * 0.06, 'YXZ');
    // ---- tool pose ----
    const pose = this.pose;
    let showR = tool !== 'none', showL = false, lFree = null, lc = 0.55, lth = 0.5;
    const T = this.T[tool];
    if (tool === 'hoe') {
      const A = POSE.hoe;
      if (a === 'hoe') {
        const up = smoothstep(0, 0.42, u), dn = smoothstep(0.42, 0.58, u), back = smoothstep(0.78, 1, u);
        mixPose(A.idle, A.up, ease(up), this.tmpA);
        mixPose(this.tmpA, A.strike, dn, this.tmpB);
        mixPose(this.tmpB, A.idle, back, pose);
      } else copyPose(A.idle, pose);
    } else if (tool === 'can') {
      const A = POSE.can;
      if (a === 'water') {
        const tilt = smoothstep(0.08, 0.28, u) * (1 - smoothstep(0.85, 1, u));
        mixPose(A.idle, A.pour, ease(tilt), pose);
        pose.p.y += Math.sin(t * 9) * 0.004 * tilt;
      } else if (a === 'refill') {
        const dn = smoothstep(0, 0.32, u) * (1 - smoothstep(0.7, 1, u));
        mixPose(A.idle, A.dip, ease(dn), pose);
      } else copyPose(A.idle, pose);
    } else if (tool === 'rod') {
      const A = POSE.rod;
      if (a === 'cast') {
        const back = smoothstep(0, 0.45, u), fwd = smoothstep(0.5, 0.66, u);
        mixPose(A.idle, A.back, ease(back), this.tmpA);
        mixPose(this.tmpA, A.cast, fwd, pose);
      } else if (a === 'fishing') {
        copyPose(A.fish, pose);
        const w = s.reelK || 0;
        pose.p.x += Math.sin(t * 14) * 0.004 * w; pose.p.y += Math.sin(t * 17) * 0.004 * w;
        _q.setFromEuler(_e.set(-(s.rodBend || 0) * 0.12, 0, Math.sin(t * 9) * 0.03 * w, 'YXZ'));
        pose.q.multiply(_q);
        showL = w > 0.01;
      } else {
        mixPose(A.idle, A.back, (s.charge || 0) * 0.35, pose);
      }
      const bendT = a === 'fishing' ? (s.rodBend || 0) : a === 'cast' ? smoothstep(0.45, 0.6, u) * (1 - smoothstep(0.62, 0.8, u)) * -0.6 : 0;
      this.bend = lerp(this.bend, bendT, R(14));
      T.segs[0].rotation.x = -this.bend * 0.06; T.segs[1].rotation.x = -this.bend * 0.16; T.segs[2].rotation.x = -this.bend * 0.3;
      this.crankA += dt * (s.reelK || 0) * 14;
      T.crank.rotation.x = this.crankA;
    } else if (tool === 'seeds') {
      const A = POSE.seeds;
      if (a === 'plant') {
        const dn = smoothstep(0, 0.35, u) * (1 - smoothstep(0.72, 1, u));
        mixPose(A.idle, A.sow, ease(dn), pose);
        _q.setFromEuler(_e.set(0, 0, Math.sin(u * 48) * 0.09 * smoothstep(0.3, 0.45, u) * (1 - smoothstep(0.6, 0.7, u)), 'YXZ'));
        pose.q.multiply(_q);
      } else copyPose(A.idle, pose);
    }
    // harvesting: the free left hand reaches down, closes round the crop and pulls; the tool dips
    // out of the way
    if (a === 'harvest') {
      const dn = smoothstep(0, 0.35, u) * (1 - smoothstep(0.75, 1, u)), pull = smoothstep(0.45, 0.65, u) * (1 - smoothstep(0.8, 1, u));
      pose.p.y -= 0.2 * dn; pose.p.x += 0.06 * dn;
      lFree = this.lFree; lFree.e.copy(ELBOW_L);
      lFree.p.set(lerp(-0.3, -0.06, ease(dn)), lerp(-0.62, -0.26, ease(dn)) + 0.1 * pull, lerp(-0.36, -0.46, ease(dn)) + 0.08 * pull);
      lFree.q.setFromEuler(_e.set(-0.5 - 0.4 * dn, -0.3, -0.6, 'YXZ'));
      const grab = smoothstep(0.33, 0.43, u) * (1 - smoothstep(0.85, 1, u));
      lc = lerp(0.35, 0.95, grab); lth = lerp(0.3, 0.75, grab);
      showL = dn > 0.02;
    }
    const arms = this.arms;
    if (fishing) {
      // presenting a caught fish with both hands, palms up
      const up = smoothstep(0, 0.13, u), dn = smoothstep(0.86, 1, u);
      const y = lerp(-0.62, -0.08, ease(up)) - 0.6 * ease(dn) + Math.sin(u * 30) * 0.006 * up;
      const f = this.fishSize || 0.3;
      this.fishG.visible = true;
      this.fishG.position.set(0.02, y, -0.42 - f * 0.14);
      this.fishG.rotation.set(-0.35 + Math.sin(t * 3) * 0.04, 0.12, Math.sin(u * 20) * 0.05 * up, 'YXZ');
      this.toolG.visible = false;
      this.fishG.updateMatrix();
      const span = Math.max(0.07, f * 0.3);
      this.hR.p.set(span, -0.035 - f * 0.08, 0.02).applyMatrix4(this.fishG.matrix); this.hR.q.copy(this.fishG.quaternion).multiply(FISH_R);
      this.hL.p.set(-span, -0.035 - f * 0.08, 0.02).applyMatrix4(this.fishG.matrix); this.hL.q.copy(this.fishG.quaternion).multiply(FISH_L);
      this.hR.e.set(0.34, -0.55, -0.12); this.hL.e.set(-0.34, -0.55, -0.12);
      arms.arm(1, this.hR, 0.3, 0.2);
      arms.arm(0, this.hL, 0.3, 0.2);
      this.lK = 0;
    } else {
      this.fishG.visible = false;
      // right hand on the tool: the tool goes where the hand actually got to
      this.toolG.visible = tool !== 'none';
      const toolP = this.toolG.position, toolQ = this.toolG.quaternion;
      if (showR && T) {
        compose(pose, T.gripR, this.hR); this.hR.e.copy(pose.e);
        const c = CURL[tool];
        arms.arm(1, this.hR, c[0], c[1], this.sock);
        compose(this.sock, T.gripRi, this.tmpA);
        toolP.copy(this.tmpA.p); toolQ.copy(this.tmpA.q);
      } else {
        arms.arm(1, null);
        toolP.copy(pose.p); toolQ.copy(pose.q);
      }
      // left hand: rises in from below, onto the reel's crank knob or down to the crop
      this.lK = snap ? (showL ? 1 : 0) : clamp(this.lK + (showL ? dt : -dt) / 0.16, 0, 1);
      let lt = null;
      if (lFree) lt = copyPose(lFree, this.hL);
      else if (tool === 'rod' && this.lK > 0) {
        _v.copy(T.knob).applyAxisAngle(_v2.set(1, 0, 0), T.crank.rotation.x).add(T.crank.position);
        lt = this.hL;
        lt.p.copy(_v).applyQuaternion(toolQ).add(toolP);
        lt.q.copy(KNOB_Q).multiply(_q.setFromAxisAngle(_v2.set(0, 0, 1), Math.sin(T.crank.rotation.x) * 0.12));
        lt.p.x -= 0.012; lt.e.copy(ELBOW_CRANK);
        const w = ease(this.lK);
        lt.p.lerpVectors(LOW_L, lt.p, w);
      }
      if (lt && (lFree ? showL : this.lK > 0)) arms.arm(0, lt, lc, lth);
      else arms.arm(0, null);
    }
    arms.end();
    this.root.updateMatrixWorld(true);
  }
}
