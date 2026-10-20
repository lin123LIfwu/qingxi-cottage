import * as THREE from 'three';
import { clamp, lerp, damp, dampAngle } from '../util/math.js';
import { toolModel, farmerModel, cropIconNow } from '../assets/models.js';
import { Human } from './human.js';

const r6 = (x, z) => Math.pow(x ** 6 + z ** 6, 1 / 6);
const PLAY_R = 82;

export class Player {
  constructor(T, colliders, U) {
    this.T = T; this.col = colliders; this.U = U;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.vy = 0;
    this.yaw = 0; this.grounded = true; this.walkPhase = 0; this.speed = 0;
    this.action = null; this.actionT = 0; this.actionDur = 0; this.actionCb = null; this.actionFired = false;
    this.pose = 'none'; this.tool = 'none';
    this.waterDepth = 0; this.surface = 'grass';
    this.onStep = null; this.onLand = null;
    // fishing state mirrored in by main.js / fishing.js
    this.charge = 0; this.lineOut = false; this.reelK = 0; this.rodBend = 0; this.rodK = 0;
    this.yawPrev = null; this.yawRate = 0;
    // the timber house (set by main.js): floor level 0 / 1 and indoor rules
    this.house = null; this.level = 0; this._tight = false;
    this.build();
  }

  // The farmer: a skinned, MakeHuman-based character (src/assets/farmer.glb) driven by the
  // procedural animator in human.js. The tools ride in the right hand, the caught fish between
  // both hands.
  build() {
    const root = new THREE.Group(); root.name = 'player'; this.root = root;
    const body = farmerModel(); root.add(body); this.body = body;
    const h = this.human = new Human(body);
    h.onStep = (k, run) => { if (this.grounded && this.speed > 0.3 && this.onStep) this.onStep(this.surface, run); };
    this.tools = {};
    for (const [k, key] of [['hoe', 'hoe'], ['can', 'can'], ['rod', 'rod'], ['seeds', 'packet']]) {
      const w = h.holdTool(k, toolModel(key)); w.visible = false; this.tools[k] = w;
    }
    this.tools.fish = h.fishHolder; h.fishHolder.visible = false;
    const rod = this.tools.rod, can = this.tools.can, seeds = this.tools.seeds;
    this.rodTip = rod.getObjectByName('Tip');
    this.rodSegs = ['Seg1', 'Seg2', 'Seg3'].map(n => rod.getObjectByName(n));
    this.spout = can.getObjectByName('Spout');
    let icon = null; seeds.getObjectByName('Icon').traverse(o => { if (!icon && o.isMesh) icon = o; });
    icon.material = icon.material.clone(); this.packetIcon = icon;
    this.canMesh = can;
    for (const k of ['hoe', 'can', 'rod', 'seeds']) this.tools[k].traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    body.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
    // settle into the idle pose before the first frame is drawn
    h.update(0, this.animState(0));
  }

  setSeed(key) {
    const m = this.packetIcon && this.packetIcon.material, t = cropIconNow(key);
    if (m && t && m.map !== t) { m.map = t; m.needsUpdate = true; }
  }
  setTool(t) {
    this.tool = t;
    for (const k in this.tools) this.tools[k].visible = (k === t) && k !== 'fish';
  }
  showFishModel(mesh) {
    this.heldFish = mesh || null;
    this.placeHeldFish();
  }
  // the caught fish goes into the first-person hands or the third-person hand
  placeHeldFish() {
    const f = this.tools.fish, m = this.heldFish, vm = this.vm;
    const inVM = !!(m && vm && this.fpActive);
    if (vm && vm.fish && (!inVM || vm.fish !== m)) vm.releaseFish();
    while (f.children.length) f.remove(f.children[0]);
    if (!m) { f.visible = false; return; }
    if (inVM) { f.visible = false; vm.holdFish(m); }
    else { f.add(m); f.visible = true; }
  }
  // first person: hide the body from the camera but keep its shadow (a per-material clone that
  // writes neither colour nor depth still renders into the shadow map, alpha-tested hair and all),
  // and hand the tool-tip / spout / held-fish queries over to the view model
  setFirstPerson(on, vm) {
    if (vm) this.vm = vm;
    if (!!this.fpActive === on) return;
    this.fpActive = on;
    this._tight = false;
    this.placeHeldFish();
    if (!this.hideMats) this.hideMats = new Map();
    const hide = (m) => {
      let h = this.hideMats.get(m);
      if (!h) { h = m.clone(); h.colorWrite = false; h.depthWrite = false; this.hideMats.set(m, h); }
      return h;
    };
    this.root.traverse(o => {
      if (!o.isMesh) return;
      if (on) { if (!o.userData.mat0) { o.userData.mat0 = o.material; o.material = Array.isArray(o.material) ? o.material.map(hide) : hide(o.material); } }
      else if (o.userData.mat0) { o.material = o.userData.mat0; delete o.userData.mat0; }
    });
  }
  // the third-person camera is very close to a wall: hide the body (shadow stays) so it does not
  // fill the screen. First person owns the same material slots, so it takes precedence.
  setTightHide(on) {
    if (this.fpActive) on = false;
    if (this._tight === on) return;
    this._tight = on;
    if (!this.hideMats) this.hideMats = new Map();
    const hide = (m) => {
      let h = this.hideMats.get(m);
      if (!h) { h = m.clone(); h.colorWrite = false; h.depthWrite = false; this.hideMats.set(m, h); }
      return h;
    };
    this.root.traverse(o => {
      if (!o.isMesh) return;
      if (on) { if (!o.userData.mat0) { o.userData.mat0 = o.material; o.material = Array.isArray(o.material) ? o.material.map(hide) : hide(o.material); } }
      else if (o.userData.mat0) { o.material = o.userData.mat0; delete o.userData.mat0; }
    });
  }
  place(x, z, yaw, y) {
    // never drop the player into deep water / inside a wall: spiral out to the nearest valid spot
    // (y: optional foot height, e.g. waking up on the upper floor of the house)
    const lvAt = (px, pz) => this.house ? this.house.levelOf(px, pz, this.T.groundHeight(px, pz, y)) : 0;
    const ok = (px, pz) => { const q = { x: px, z: pz }; this.col.resolve(q, 0.3, lvAt(px, pz)); return Math.hypot(q.x - px, q.z - pz) < 1e-3 && this.canStand(px, pz, this.T.groundHeight(px, pz, y)); };
    if (!ok(x, z)) {
      search: for (let r = 0.5; r < 30; r += 0.5) {
        for (let a = 0; a < 24; a++) {
          const px = x + Math.cos(a / 24 * Math.PI * 2) * r, pz = z + Math.sin(a / 24 * Math.PI * 2) * r;
          if (ok(px, pz)) { x = px; z = pz; break search; }
        }
      }
    }
    this.pos.set(x, this.T.groundHeight(x, z, y), z); this.yaw = yaw; this.vel.set(0, 0, 0); this.vy = 0;
    this.level = lvAt(x, z); this.grounded = true;
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
    const gh = T.groundHeight(x, z, fromH);
    const deck = T.onDeck(x, z, fromH);
    // indoors nothing to fall off (the stair opening has a rail, but just in case)
    if (this.house && this.house.inside(x, z) && gh < fromH - 0.6) return false;
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
    const indoor = !!(this.house && this.house.inside(this.pos.x, this.pos.z));
    const maxSp = (input.run ? 6.0 : 3.4) * lerp(1, 0.5, wade) * (indoor ? 0.72 : 1);
    const tvx = mx * maxSp, tvz = mz * maxSp;
    const acc = (mx || mz) ? 10 : 12;
    this.vel.x = damp(this.vel.x, tvx, acc, dt); this.vel.z = damp(this.vel.z, tvz, acc, dt);
    // first person: the body always faces where the camera looks (strafing keeps the facing)
    if (input.face !== undefined && input.face !== null) this.yaw = dampAngle(this.yaw, input.face, 30, dt);
    else if (mx || mz) this.yaw = dampAngle(this.yaw, Math.atan2(mx, mz), 12, dt);
    // ---- horizontal move with checks ----
    // Sub-step the horizontal move: the thinnest collider (stair rail) is 0.10 m thick, so no
    // single step may carry the player past a box's mid-plane even at the 10 fps dt cap.
    const cur = this.pos;
    const sx0 = cur.x, sz0 = cur.z;
    const dx = this.vel.x * dt, dz = this.vel.z * dt;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.08));
    const ux = dx / n, uz = dz / n;
    for (let i = 0; i < n; i++) {
      const h0 = T.groundHeight(cur.x, cur.z, cur.y);
      const footH = this.grounded ? h0 : Math.max(h0, cur.y);
      let nx = cur.x + ux, nz = cur.z + uz;
      if (!this.canStand(nx, nz, footH)) {
        if (this.canStand(nx, cur.z, footH)) nz = cur.z;
        else if (this.canStand(cur.x, nz, footH)) nx = cur.x;
        else { nx = cur.x; nz = cur.z; }
      }
      const p = { x: nx, z: nz };
      this.col.resolve(p, 0.3, this.level);
      if (!this.canStand(p.x, p.z, footH)) { p.x = cur.x; p.z = cur.z; }
      cur.x = p.x; cur.z = p.z;
    }
    this.speed = Math.hypot(cur.x - sx0, cur.z - sz0) / Math.max(dt, 1e-4);
    // ---- vertical ----
    const gh = T.groundHeight(cur.x, cur.z, cur.y);
    const noJump = this.house && this.house.noJump(cur.x, cur.z);
    if (input.jump && this.grounded && !this.action && wade < 0.6 && !noJump) { this.vy = 6.0; this.grounded = false; this.onJump && this.onJump(); }
    if (!this.grounded) {
      this.vy -= 19 * dt; cur.y += this.vy * dt;
      if (cur.y <= gh) { cur.y = gh; this.grounded = true; if (this.vy < -3) this.onLand && this.onLand(); this.vy = 0; }
    } else {
      if (gh < cur.y - 0.35) { this.grounded = false; this.vy = 0; }
      else cur.y = damp(cur.y, gh, 30, dt);
    }
    if (this.house) this.level = this.house.levelOf(cur.x, cur.z, cur.y);
    // ---- environment info ----
    const lv = T.waterLevelAt(cur.x, cur.z);
    const deck = T.onDeck(cur.x, cur.z, cur.y);
    this.waterDepth = (!deck && lv > -40) ? Math.max(0, lv - cur.y) : 0;
    this.waterLevel = lv;
    this.surface = deck ? 'wood' : this.waterDepth > 0.05 ? 'water' : (T.pathAt(cur.x, cur.z) > 0.4 ? 'path' : 'grass');
    // footsteps come from the animator's foot plants (human.onStep)
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
    this.animate(dt);
    this.root.position.copy(cur);
    this.root.rotation.y = this.yaw;
    this.U.uPlayerPos.value.copy(cur);
  }

  // what the animator needs to know this frame (velocity in character space: +Z = facing)
  animState(dt) {
    const yaw = this.yaw, c = Math.cos(yaw), s = Math.sin(yaw), vx = this.vel.x, vz = this.vel.z;
    if (this.yawPrev === null) this.yawPrev = yaw;
    let dy = yaw - this.yawPrev; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yawPrev = yaw;
    this.yawRate = dt > 1e-4 ? clamp(dy / dt, -12, 12) : 0;
    const st = this._st || (this._st = {
      // ground height under a foot (character space), relative to the root
      ground: (lx, lz) => {
        const p = this.pos, cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
        return this.T.groundHeight(p.x + cy * lx + sy * lz, p.z - sy * lx + cy * lz, p.y) - p.y;
      },
    });
    st.speed = this.speed; st.vx = c * vx - s * vz; st.vz = s * vx + c * vz;
    st.grounded = this.grounded; st.vy = this.vy; st.yawRate = this.yawRate;
    st.wade = clamp(this.waterDepth / 0.75, 0, 1);
    st.action = this.action; st.u = clamp(this.actionT, 0, 1); st.tool = this.tool || 'none';
    st.charge = this.charge || 0; st.lineOut = !!this.lineOut; st.reelK = this.reelK || 0; st.rodBend = this.rodBend || 0;
    const fw = this.tools && this.tools.fish.children[0], fm = fw && fw.children[0];
    st.fishSize = fm ? fm.scale.x : 0.3;
    return st;
  }

  animate(dt) {
    const h = this.human;
    h.update(dt, this.animState(dt));
    this.walkPhase = h.walkPhase;
    // the bamboo blank bends at its ferrules while a fish pulls
    const bend = this.action === 'fishing' ? (this.rodBend || 0) : 0;
    this.rodK = damp(this.rodK, bend, 12, dt);
    this.rodSegs[0].rotation.x = -this.rodK * 0.06; this.rodSegs[1].rotation.x = -this.rodK * 0.16; this.rodSegs[2].rotation.x = -this.rodK * 0.3;
  }

  // world positions helpers
  rodTipWorld(out) { if (this.fpActive && this.vm) return this.vm.rodTipWorld(out); this.root.updateMatrixWorld(true); return this.rodTip.getWorldPosition(out); }
  spoutWorld(out) { if (this.fpActive && this.vm) return this.vm.spoutWorld(out); this.root.updateMatrixWorld(true); return this.spout.getWorldPosition(out); }
}
