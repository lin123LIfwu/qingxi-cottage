import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep } from '../util/math.js';

export const EYE_H = 1.58;
const FOV_TP = 50, FOV_FP = 66;
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

// Third-person orbit camera + first-person eye camera, with a short blend between the two.
export class CameraRig {
  constructor(camera, dom, T) {
    this.cam = camera; this.T = T; this.dom = dom;
    this.yaw = 0.35; this.pitch = 0.38; this.dist = 8.5; this.tDist = 8.5;
    this.target = new THREE.Vector3(); this.inited = false;
    this.blockers = [];
    this.drag = null; this.onClick = null; this.onPress = null; this.onRelease = null;
    this.enabled = true;
    // first person
    this.fp = false; this.fpK = 0; this.fpPitch = 0.15; this.sens = 1;
    this.eye = new THREE.Vector3(); this.tpPos = new THREE.Vector3(); this.tpQuat = new THREE.Quaternion();
    this.bobY = 0; this.crouch = 0; this.landDip = 0; this.fov = FOV_TP; this.onFov = null; this.onViewRequest = null;
    this.yawVel = 0; this.pitchVel = 0; this.lastYaw = this.yaw; this.lastPitch = this.fpPitch;
    // pointer lock (first-person mouse look)
    this.locked = false; this.everLocked = false; this.lockErr = 0; this.lockReleasedAt = -1e9; this.selfExit = false; this.swallow = false;
    this.lockSupported = 'requestPointerLock' in dom;
    this.zoomAt = 0; this.wheelBlock = 0;
    document.addEventListener('pointerlockchange', () => {
      const L = document.pointerLockElement === dom;
      if (this.locked && !L && !this.selfExit) this.lockReleasedAt = performance.now();
      if (!L) this.selfExit = false;
      this.locked = L; if (L) this.everLocked = true;
    });
    document.addEventListener('pointerlockerror', () => { this.lockErr++; });
    dom.addEventListener('contextmenu', e => e.preventDefault());
    dom.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      // first click in first person only captures the mouse
      if (this.fp && !this.locked && e.button === 0 && this.canLock()) { this.swallow = true; this.requestLock(); return; }
      this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, b: e.button, moved: false, id: e.pointerId };
      if (!this.locked) { try { dom.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } }
      if (e.button === 0) this.onPress && this.onPress();
    });
    dom.addEventListener('pointermove', e => {
      if (this.locked) {
        if (!this.enabled || !this.fp) return;
        const k = 0.0022 * this.sens;
        this.yaw -= clamp(e.movementX || 0, -200, 200) * k;
        this.fpPitch = clamp(this.fpPitch + clamp(e.movementY || 0, -200, 200) * k, -1.35, 1.4);
        return;
      }
      const d = this.drag; if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) d.moved = true;
      if (d.moved && (d.b === 2 || d.b === 1 || (d.b === 0 && this.dragLeft !== false))) {
        if (this.fp) { this.yaw -= dx * 0.0042 * this.sens; this.fpPitch = clamp(this.fpPitch + dy * 0.0036 * this.sens, -1.35, 1.4); }
        else { this.yaw -= dx * 0.0055; this.pitch = clamp(this.pitch + dy * 0.0042, 0.06, 1.25); }
      }
    });
    const up = e => {
      if (this.swallow) { this.swallow = false; this.drag = null; return; }
      const d = this.drag; if (!d) return;
      this.drag = null;
      if (d.b === 0) { this.onRelease && this.onRelease(d.moved); if (!d.moved) this.onClick && this.onClick(); }
      void e;
    };
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', e => {
      if (!this.enabled || e.altKey) return;
      e.preventDefault();
      const now = performance.now();
      if (now < this.wheelBlock || !e.deltaY) return;
      if (this.fp) {
        // scrolling out of first person goes back to a close third-person view
        if (e.deltaY > 0 && this.onViewRequest) { this.wheelBlock = now + 350; this.onViewRequest('third', true); }
        return;
      }
      const nd = clamp(this.tDist * (1 + Math.sign(e.deltaY) * 0.1), 3.2, 20);
      if (nd !== this.tDist) { this.tDist = nd; this.zoomAt = now; return; }
      // already as close as it goes: one more notch in (after a short pause) enters first person
      if (e.deltaY < 0 && now - this.zoomAt > 220 && this.onViewRequest) { this.wheelBlock = now + 350; this.onViewRequest('first', true); }
    }, { passive: false });
  }
  canLock() { return this.lockSupported && (this.everLocked || this.lockErr < 2); }
  requestLock() {
    try {
      const r = this.dom.requestPointerLock();
      if (r && r.catch) r.catch(() => { /* counted by pointerlockerror */ });
    } catch (e) { this.lockErr++; }
  }
  exitLock() {
    if (document.pointerLockElement === this.dom) { this.selfExit = true; try { document.exitPointerLock(); } catch (e) { /* ignore */ } }
  }
  // mouse look falls back to dragging when the pointer cannot be locked (e.g. inside some iframes)
  get dragLook() { return this.fp && !this.canLock(); }
  setFP(on, fromWheel) {
    if (this.fp === on) return;
    this.fp = on;
    if (on) { this.fpPitch = clamp(this.pitch * 0.45, 0.05, 0.4); this.lastPitch = this.fpPitch; }
    else {
      this.exitLock();
      if (fromWheel) { this.tDist = 3.6; this.dist = Math.min(this.dist, 3.6); this.zoomAt = performance.now(); }
    }
  }
  isDragging() { return this.drag && this.drag.moved; }
  // o: { speed, run, walkPhase, grounded, crouch (0..1), landed (bool) }
  update(dt, focus, keys, o = {}) {
    if (keys) {
      if (keys.rotL) this.yaw += dt * 1.8;
      if (keys.rotR) this.yaw -= dt * 1.8;
    }
    const snap = !this.inited;
    // ---- third person ----
    const tgt = _p.set(focus.x, focus.y + 1.32, focus.z);
    if (snap) { this.target.copy(tgt); }
    this.target.x = damp(this.target.x, tgt.x, 10, dt); this.target.z = damp(this.target.z, tgt.z, 10, dt);
    this.target.y = damp(this.target.y, tgt.y, 6, dt);
    this.dist = damp(this.dist, this.tDist, 8, dt);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    let d = this.dist;
    for (let s = 0.6; s < d; s += 0.2) {
      const p = this.target.clone().addScaledVector(dir, s);
      let hit = false;
      for (const b of this.blockers) if (p.x > b[0] && p.x < b[3] && p.y > b[1] && p.y < b[4] && p.z > b[2] && p.z < b[5]) { hit = true; break; }
      if (hit) { d = Math.max(0.8, s - 0.25); break; }
    }
    const pos = this.tpPos.copy(this.target).addScaledVector(dir, d);
    const gh = this.T.heightAt(pos.x, pos.z);
    let minY = gh + 0.45;
    const lv = this.T.waterLevelAt(pos.x, pos.z);
    if (lv > -40) minY = Math.max(minY, lv + 0.3);
    if (pos.y < minY) pos.y = minY;
    _m.lookAt(pos, this.target, UP); this.tpQuat.setFromRotationMatrix(_m);
    // ---- first person ----
    if (snap) { this.fpK = this.fp ? 1 : 0; }
    else this.fpK = clamp(this.fpK + (this.fp ? dt : -dt) / 0.45, 0, 1);
    const k = this.fpK > 0 && this.fpK < 1 ? smoothstep(0, 1, this.fpK) : this.fpK;
    const mv = (o.grounded !== false) ? smoothstep(0.3, 3.0, o.speed || 0) : 0;
    const ph = o.walkPhase || 0, run = o.run && (o.speed || 0) > 4.5;
    const bobT = (Math.abs(Math.sin(ph)) - 0.5) * (run ? 0.05 : 0.032) * mv;
    this.bobY = snap ? bobT : damp(this.bobY, bobT, 14, dt);
    this.crouch = snap ? (o.crouch || 0) : damp(this.crouch, o.crouch || 0, 7, dt);
    if (o.landed) this.landDip = 1;
    this.landDip = Math.max(0, this.landDip - dt / 0.3);
    const dip = Math.sin(this.landDip * Math.PI) * 0.07;
    const lat = Math.sin(ph) * 0.014 * mv;
    this.eye.set(focus.x + Math.cos(this.yaw) * lat, focus.y + EYE_H + this.bobY - this.crouch * 0.42 - dip, focus.z - Math.sin(this.yaw) * lat);
    _q2.setFromEuler(_e.set(-this.fpPitch, this.yaw, 0, 'YXZ'));
    if (k <= 0) { this.cam.position.copy(pos); this.cam.quaternion.copy(this.tpQuat); }
    else if (k >= 1) { this.cam.position.copy(this.eye); this.cam.quaternion.copy(_q2); }
    else {
      this.cam.position.lerpVectors(pos, this.eye, k);
      this.cam.quaternion.slerpQuaternions(this.tpQuat, _q2, k);
    }
    // look velocities (for view-model sway)
    let dy = this.yaw - this.lastYaw; this.lastYaw = this.yaw;
    const dp = this.fpPitch - this.lastPitch; this.lastPitch = this.fpPitch;
    if (snap) dy = 0;
    const idt = 1 / Math.max(dt, 1e-3);
    this.yawVel = damp(this.yawVel, clamp(dy * idt, -12, 12), 12, dt);
    this.pitchVel = damp(this.pitchVel, snap ? 0 : clamp(dp * idt, -12, 12), 12, dt);
    // field of view
    const fov = lerp(FOV_TP, FOV_FP + (run ? 4 : 0) * k, k);
    this.fov = snap ? fov : damp(this.fov, fov, 10, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.01) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); this.onFov && this.onFov(this.fov); }
    this.inited = true;
    this.cam.updateMatrixWorld();
  }
  // title screen etc. reset the lens
  resetFov() { this.fov = FOV_TP; if (this.cam.fov !== FOV_TP) { this.cam.fov = FOV_TP; this.cam.updateProjectionMatrix(); this.onFov && this.onFov(FOV_TP); } }
}
