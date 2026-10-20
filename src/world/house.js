// The two-storey timber house (Blender model, see models/source/house). Walk-in: colliders tagged
// per floor, the upper floor as `upper` decks, a straight stair as a ramp deck, a swinging front
// door, interior lamps and the bed on the upper floor. All numbers come from houseLayout.js, which
// the Blender script writes from the same layout as the model.
import * as THREE from 'three';
import L from '../assets/houseLayout.js';
import { CABIN, HOME_H } from '../config.js';
import { clamp, damp, lerp, smoothstep } from '../util/math.js';

const OX = CABIN.x, OZ = CABIN.z;
const W = (x, z) => [OX + x, OZ + z];

const FLAME_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FLAME_FS = `
varying vec2 vUv; uniform float uTime; uniform float uK; uniform float uSeed;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 uv = vUv; float t = uTime + uSeed * 7.0;
  float n = vn(vec2(uv.x * 4.0 + uSeed * 3.0, uv.y * 3.0 - t * 2.3)) * 0.6 + vn(vec2(uv.x * 9.0, uv.y * 7.0 - t * 4.1)) * 0.4;
  float w = (1.0 - uv.y) * 0.42 + 0.04;
  float d = abs(uv.x - 0.5 + (n - 0.5) * 0.35 * uv.y);
  float shape = smoothstep(w, w * 0.35, d) * (1.0 - smoothstep(0.25, 1.0, uv.y + n * 0.45)) * smoothstep(0.0, 0.1, uv.y);
  vec3 col = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.82, 0.42), smoothstep(0.25, 0.95, shape));
  gl_FragColor = vec4(col * shape * uK * 2.4, 1.0);
}`;

export class House {
  // registered while the world is built (colliders / decks / no-grass must exist before plants)
  constructor(T, U, col, structures) {
    this.T = T; this.U = U; this.col = col; this.st = structures;
    this.F1 = L.F1; this.F2 = L.F2;
    const [ix0, ix1, iz0, iz1] = L.interior;
    this.rect = [OX + ix0, OZ + iz0, OX + ix1, OZ + iz1];
    for (const c of L.colliders) {
      const [x, z] = W(c.x, c.z);
      if (c.t === 'circle') col.addCircle(x, z, c.r, 'house', c.lv);
      else col.addBox(x, z, c.hx, c.hz, c.rot || 0, 'house', c.lv);
    }
    for (const d of L.decks) {
      const cx = OX + (d.x0 + d.x1) / 2, cz = OZ + (d.z0 + d.z1) / 2, hl = (d.x1 - d.x0) / 2;
      const fn = d.h0 !== undefined ? (u) => HOME_H + d.h0 + (d.h1 - d.h0) * clamp((u + hl) / (2 * hl), 0, 1) : () => HOME_H + d.h;
      T.decks.push({ cx, cz, ax: 1, az: 0, halfLen: hl, halfW: (d.z1 - d.z0) / 2, heightFn: fn, type: 'wood', upper: !!d.upper });
    }
    for (const r of L.noGrass) structures.noGrassRects.push([OX + r[0], OZ + r[1], OX + r[2], OZ + r[3]]);
    const [bx, bz] = W(L.bed.x, L.bed.z);
    structures.interact.push({ id: 'bed', x: bx, z: bz, r: L.bed.r, lv: 1, label: '上床睡觉' });
    structures.chimneyTop = new THREE.Vector3(OX + L.chimneyTop[0], HOME_H + L.chimneyTop[1], OZ + L.chimneyTop[2]);
    this.blockers = L.blockers.map(b => [OX + b[0], HOME_H + b[1], OZ + b[2], OX + b[3], HOME_H + b[4], OZ + b[5]]);
    const [wx, wz] = W(L.wake.x, L.wake.z);
    this.wake = { x: wx, z: wz, y: HOME_H + L.F2, yaw: L.wake.yaw };
    const [dx, dz] = W(L.door.x, L.door.z);
    this.doorPos = new THREE.Vector2(dx, dz); this.doorK = 0; this.doorOpen = false;
    this.indoor = false; this.indoorK = 0; this.camIndoor = false;
    this.group = new THREE.Group(); this.group.name = 'house';
    this.group.position.set(OX, HOME_H, OZ);
    structures.group.add(this.group);
    // porch lantern: lit with the other lanterns at dusk (structures.update)
    const pl = new THREE.PointLight('#ffb35c', 0, 9, 1.6);
    pl.position.set(...L.porchLamp); this.group.add(pl); structures.lights.push({ l: pl, k: 6 });
    this.onDoor = null;
  }

  // ---------------------------------------------------------------- queries (world coordinates)
  inside(x, z) { const r = this.rect; return x > r[0] && x < r[2] && z > r[1] && z < r[3]; }
  levelOf(x, z, y) { return this.inside(x, z) && y - HOME_H - L.F1 > L.level1Above ? 1 : 0; }
  noJump(x, z) {
    const lx = x - OX, lz = z - OZ;
    return this.inside(x, z) || (lx > -4.1 && lx < 4.1 && lz > 3.3 && lz < 5.6);
  }

  // ---------------------------------------------------------------- model
  attach(model, renderer) {
    const g = this.group;
    g.add(model);
    const aniso = Math.min(8, renderer ? renderer.capabilities.getMaxAnisotropy() : 4);
    this.interior = []; this.flames = []; this.shades = new Set(); this.embers = new Set();
    this.glass = new THREE.MeshStandardMaterial({ color: '#a9bcc4', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16,
      depthWrite: false, envMapIntensity: 1.3, emissive: new THREE.Color('#ffb45e'), emissiveIntensity: 0 });
    let k = 0;
    model.traverse(o => {
      if (o.name === 'Door') this.door = o;
      if (!o.isMesh) return;
      const n = o.name, m = o.material;
      for (const t of [m.map, m.normalMap]) if (t) t.anisotropy = aniso;
      o.castShadow = true; o.receiveShadow = true;
      if (/glass/.test(m.name)) { o.material = this.glass; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 2; }
      else if (/flame/.test(m.name)) {
        o.material = new THREE.ShaderMaterial({ vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: this.U.uTime, uK: { value: 1 }, uSeed: { value: (k++) * 0.37 } } });
        o.castShadow = false; o.receiveShadow = false; o.renderOrder = 3; this.flames.push(o.material);
      } else if (/ember/.test(m.name)) { m.emissive = new THREE.Color('#ff5a1a'); this.embers.add(m); o.castShadow = false; }
      else if (/shade/.test(m.name)) { m.emissive = new THREE.Color('#ffc27a'); m.emissiveIntensity = 0; this.shades.add(m); o.castShadow = n.startsWith('Int_'); }
      else if (/wood/.test(m.name)) { if (m.normalScale) m.normalScale.setScalar(m.name === 'wood_ext' ? 1.3 : 0.7); }
      if (n.startsWith('Int_') || n.startsWith('Fire_')) this.interior.push(o);
    });
    // interior lamps (no shadows; lit only while the player is inside, so nothing glows through walls)
    const mk = (key, color, dist) => { const p = L.lights[key]; const l = new THREE.PointLight(color, 0, dist, 1.7); l.position.set(p[0], p[1], p[2]); g.add(l); return l; };
    this.lamps = { fire: mk('fire', '#ff9a4a', 7.5), table: mk('table', '#ffc98a', 6.5), nook: mk('nook', '#ffc98a', 4.5), bed: mk('bed', '#ffc98a', 5.5) };
  }

  // ---------------------------------------------------------------- per frame
  update(dt, t, player, camera, nightK) {
    const p = player.pos;
    const lz = p.z - OZ, lx = p.x - OX;
    // indoor once past the inner face of the front wall (z = 3.3); stays indoor until a step out onto
    // the porch, so the third-person camera has room behind the player when it comes back
    const stay = this.inside(p.x, p.z) || (lx > 0.2 && lx < 2.8 && lz > 3.0 && lz < 4.4);
    if (!this.indoor && this.inside(p.x, p.z) && lz < 3.12) this.indoor = true;
    else if (this.indoor && !stay) this.indoor = false;
    this.indoorK = damp(this.indoorK, this.indoor ? 1 : 0, 3.5, dt);
    const cx = camera.position.x - OX, cz = camera.position.z - OZ;
    this.camIndoor = Math.abs(cx) < 3.85 && Math.abs(cz) < 3.4 && camera.position.y < HOME_H + 7.5;
    const far = Math.hypot(cx, cz) > 30;
    if (this.interior) for (const o of this.interior) o.visible = !far || this.indoor;
    if (!this.lamps) return;
    // front door swings open when someone is near (inside or out)
    const want = Math.hypot(p.x - this.doorPos.x, p.z - this.doorPos.y) < L.door.open;
    if (want !== this.doorOpen) { this.doorOpen = want; this.onDoor && this.onDoor(want); }
    this.doorK = damp(this.doorK, want ? 1 : 0, want ? 5 : 3.2, dt);
    if (this.door) this.door.rotation.y = -smoothstep(0, 1, this.doorK) * 1.62;
    // lamps
    const n = smoothstep(0.1, 0.65, nightK), lv = player.level, ik = this.indoorK;
    const fl = 0.82 + 0.1 * Math.sin(t * 11.3) + 0.06 * Math.sin(t * 23.7 + 1.3) + 0.05 * Math.sin(t * 5.1);
    const ground = lv === 0 ? 1 : 0;
    this.lamps.fire.intensity = ik * fl * (ground ? 5.5 : 1.2);
    this.lamps.table.intensity = ik * ground * n * 4.0;
    this.lamps.nook.intensity = ik * ground * n * 2.4;
    this.lamps.bed.intensity = ik * (1 - ground) * (0.6 + n * 2.6);
    for (const m of this.flames) m.uniforms.uK.value = fl;
    for (const m of this.embers) m.emissiveIntensity = 1.6 + 0.6 * Math.sin(t * 2.3) + 0.3 * fl;
    for (const m of this.shades) m.emissiveIntensity = n * 1.6;
    // glass: a warm glow from outside at night, clear from inside
    this.glass.emissiveIntensity = this.camIndoor ? 0 : n * (far ? 1.6 : 0.9);
    this.glass.opacity = this.camIndoor ? 0.08 : lerp(0.16, 0.55, n);
  }
}
