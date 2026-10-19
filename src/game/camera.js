import * as THREE from 'three';
import { clamp, damp, lerp } from '../util/math.js';

export class CameraRig {
  constructor(camera, dom, T) {
    this.cam = camera; this.T = T; this.dom = dom;
    this.yaw = 0.35; this.pitch = 0.38; this.dist = 8.5; this.tDist = 8.5;
    this.target = new THREE.Vector3(); this.inited = false;
    this.blockers = [];
    this.drag = null; this.onClick = null; this.onPress = null; this.onRelease = null;
    this.enabled = true;
    dom.addEventListener('contextmenu', e => e.preventDefault());
    dom.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, b: e.button, moved: false, id: e.pointerId };
      try { dom.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      if (e.button === 0) this.onPress && this.onPress();
    });
    dom.addEventListener('pointermove', e => {
      const d = this.drag; if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) d.moved = true;
      if (d.moved && (d.b === 2 || d.b === 1 || (d.b === 0 && this.dragLeft !== false))) {
        this.yaw -= dx * 0.0055; this.pitch = clamp(this.pitch + dy * 0.0042, 0.06, 1.25);
      }
    });
    const up = e => {
      const d = this.drag; if (!d) return;
      this.drag = null;
      if (d.b === 0) { this.onRelease && this.onRelease(d.moved); if (!d.moved) this.onClick && this.onClick(); }
    };
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', e => { if (!this.enabled) return; e.preventDefault(); this.tDist = clamp(this.tDist * (1 + Math.sign(e.deltaY) * 0.1), 3.2, 20); }, { passive: false });
  }
  isDragging() { return this.drag && this.drag.moved; }
  update(dt, focus, keys) {
    if (keys) {
      if (keys.rotL) this.yaw += dt * 1.8;
      if (keys.rotR) this.yaw -= dt * 1.8;
    }
    const tgt = new THREE.Vector3(focus.x, focus.y + 1.15, focus.z);
    if (!this.inited) { this.target.copy(tgt); this.inited = true; }
    this.target.x = damp(this.target.x, tgt.x, 10, dt); this.target.z = damp(this.target.z, tgt.z, 10, dt);
    this.target.y = damp(this.target.y, tgt.y, 6, dt);
    this.dist = damp(this.dist, this.tDist, 8, dt);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    let d = this.dist;
    // blockers (AABBs)
    for (let s = 0.6; s < d; s += 0.2) {
      const p = this.target.clone().addScaledVector(dir, s);
      let hit = false;
      for (const b of this.blockers) if (p.x > b[0] && p.x < b[3] && p.y > b[1] && p.y < b[4] && p.z > b[2] && p.z < b[5]) { hit = true; break; }
      if (hit) { d = Math.max(0.8, s - 0.25); break; }
    }
    const pos = this.target.clone().addScaledVector(dir, d);
    const gh = this.T.heightAt(pos.x, pos.z);
    let minY = gh + 0.45;
    const lv = this.T.waterLevelAt(pos.x, pos.z);
    if (lv > -40) minY = Math.max(minY, lv + 0.3);
    if (pos.y < minY) pos.y = minY;
    this.cam.position.copy(pos);
    this.cam.lookAt(this.target);
  }
}
