// CPU particle pools (lit + additive), GPU rain, butterflies, fireflies & ambient effects
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../util/math.js';
import { GeoBuilder } from '../util/geo.js';

const PVERT = /* glsl */`
attribute vec4 aColor; attribute float aSize; attribute float aShape;
uniform float uScale;
varying vec4 vColor; varying float vShape;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aColor.a <= 0.001 ? 0.0 : clamp(aSize * uScale / max(0.05, -mv.z), 0.0, 256.0);
  vColor = aColor; vShape = aShape;
}`;
const PFRAG = /* glsl */`
uniform vec3 uSunColor; uniform vec3 uSunDir; uniform vec3 uSkyAmbient; uniform float uLit;
varying vec4 vColor; varying float vShape;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float a;
  if (vShape < 0.5) a = exp(-r * r * 3.2) * (1.0 - smoothstep(0.85, 1.0, r));           // soft puff
  else if (vShape < 1.5) { vec2 q = abs(p); a = max(1.0 - smoothstep(0.0, 0.16, q.x * (0.2 + q.y)), 1.0 - smoothstep(0.0, 0.16, q.y * (0.2 + q.x))) * (1.0 - smoothstep(0.6, 1.0, r)); a = max(a, exp(-r * r * 10.0)); } // sparkle
  else if (vShape < 2.5) { vec2 q = abs(p); a = 1.0 - smoothstep(0.55, 0.75, max(q.x, q.y)); }  // chunk
  else a = 1.0 - smoothstep(0.55, 1.0, r);                                                   // droplet
  if (a < 0.01) discard;
  vec3 c = vColor.rgb;
  if (uLit > 0.5) {
    vec3 L = uSkyAmbient * 0.9 + uSunColor * (0.35 + 0.4 * max(uSunDir.y, 0.0));
    c *= L;
    if (vShape > 2.5) c += uSunColor * 0.25 * smoothstep(0.5, 0.0, length(p - vec2(-0.3, -0.3)));
  }
  gl_FragColor = vec4(c, vColor.a * a);
}`;

class Pool {
  constructor(n, additive, U) {
    this.n = n; this.i = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n); this.shape = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aShape', new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uSunColor: U.uSunColor, uSunDir: U.uSunDir, uSkyAmbient: U.uSkyAmbient, uLit: { value: additive ? 0 : 1 } },
      vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.layers.set(1);
    this.points.renderOrder = additive ? 12 : 10;
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n).fill(1); this.max = new Float32Array(n).fill(1);
    this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.s0 = new Float32Array(n); this.s1 = new Float32Array(n);
    this.a0 = new Float32Array(n); this.base = new Float32Array(n * 3); this.kind = new Uint8Array(n); this.ph = new Float32Array(n);
    this.floorY = new Float32Array(n).fill(-1e9);
    this.alive = 0;
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0, shape = 0, kind = 0, floorY = -1e9) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = 0; this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.base[i * 3] = r; this.base[i * 3 + 1] = g; this.base[i * 3 + 2] = b; this.a0[i] = a;
    this.grav[i] = grav; this.drag[i] = drag; this.shape[i] = shape; this.kind[i] = kind; this.ph[i] = Math.random() * 100;
    this.floorY[i] = floorY;
    return i;
  }
  update(dt, t, wind) {
    const P = this.pos, V = this.vel, C = this.col;
    for (let i = 0; i < this.n; i++) {
      const L = this.life[i], M = this.max[i];
      if (L >= M) { if (C[i * 4 + 3] !== 0) { C[i * 4 + 3] = 0; this.size[i] = 0; } continue; }
      const nl = L + dt; this.life[i] = nl;
      const u = nl / M;
      const k = this.kind[i];
      if (k === 1) { // firefly wander
        const ph = this.ph[i];
        V[i * 3] += Math.sin(t * 1.3 + ph) * dt * 0.6; V[i * 3 + 1] += Math.sin(t * 1.7 + ph * 2.1) * dt * 0.35; V[i * 3 + 2] += Math.cos(t * 1.1 + ph * 1.3) * dt * 0.6;
        V[i * 3] *= 0.985; V[i * 3 + 1] *= 0.985; V[i * 3 + 2] *= 0.985;
      } else if (k === 2) { // drifting with wind (smoke, mist, motes)
        V[i * 3] += wind.x * dt * 0.25; V[i * 3 + 2] += wind.y * dt * 0.25;
      }
      const dr = Math.exp(-this.drag[i] * dt);
      V[i * 3] *= dr; V[i * 3 + 1] = V[i * 3 + 1] * dr - this.grav[i] * dt; V[i * 3 + 2] *= dr;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      if (P[i * 3 + 1] < this.floorY[i]) { P[i * 3 + 1] = this.floorY[i]; V[i * 3] *= 0.3; V[i * 3 + 1] = 0; V[i * 3 + 2] *= 0.3; if (k === 3) this.life[i] = Math.max(this.life[i], M * 0.85); }
      let a;
      if (k === 1) a = this.a0[i] * smoothstep(0, 0.15, u) * smoothstep(1, 0.8, u) * Math.pow(Math.max(0, Math.sin(t * 2.2 + this.ph[i] * 3.0)), 3.0);
      else if (k === 2) a = this.a0[i] * smoothstep(0, 0.15, u) * (1 - smoothstep(0.4, 1, u));
      else a = this.a0[i] * (1 - smoothstep(0.6, 1, u));
      C[i * 4] = this.base[i * 3]; C[i * 4 + 1] = this.base[i * 3 + 1]; C[i * 4 + 2] = this.base[i * 3 + 2]; C[i * 4 + 3] = a;
      this.size[i] = lerp(this.s0[i], this.s1[i], u);
    }
    const g = this.geo.attributes;
    g.position.needsUpdate = true; g.aColor.needsUpdate = true; g.aSize.needsUpdate = true; g.aShape.needsUpdate = true;
  }
}

// GPU rain streaks
function makeRain(U, n) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 2 * 3), seed = new Float32Array(n * 2 * 4);
  for (let i = 0; i < n; i++) {
    const a = Math.random(), b = Math.random(), c = Math.random(), d = Math.random();
    for (let e = 0; e < 2; e++) { const k = (i * 2 + e) * 4; seed[k] = a; seed[k + 1] = b; seed[k + 2] = c; seed[k + 3] = e === 0 ? d : -1 - d; }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uRain: U.uRain, uWind: U.uWind, uCam: { value: new THREE.Vector3() }, uSkyAmbient: U.uSkyAmbient, uSunColor: U.uSunColor },
    vertexShader: /* glsl */`attribute vec4 aSeed; uniform float uTime; uniform float uRain; uniform vec2 uWind; uniform vec3 uCam; varying float vA;
      void main(){
        float box = 26.0, H = 16.0;
        float show = step(aSeed.x * 0.999, uRain);
        float sp = 0.75 + aSeed.y * 0.35;
        float y = fract(aSeed.z - uTime * sp * 0.62) * H;
        vec2 wp = vec2(aSeed.x, fract(aSeed.y * 7.31 + aSeed.z * 3.7)) * box;
        vec2 xz = uCam.xz + mod(wp - uCam.xz, box) - box * 0.5;
        vec3 p = vec3(xz.x, uCam.y - 6.0 + y, xz.y);
        vec3 vel = normalize(vec3(uWind.x * 0.25, -1.0, uWind.y * 0.25));
        bool tail = aSeed.w < 0.0;
        if (tail) p -= vel * (0.5 + 0.25 * fract(-aSeed.w));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = show * (tail ? 0.0 : 1.0) * smoothstep(0.0, 1.5, y) * smoothstep(H, H - 3.0, y) * smoothstep(0.6, 3.0, -mv.z);
      }`,
    fragmentShader: /* glsl */`uniform vec3 uSkyAmbient; uniform vec3 uSunColor; uniform float uRain; varying float vA;
      void main(){ vec3 c = uSkyAmbient * 1.3 + uSunColor * 0.12 + vec3(0.04); gl_FragColor = vec4(c, vA * 0.32 * uRain); }`,
    transparent: true, depthWrite: false,
  });
  const ls = new THREE.LineSegments(g, m);
  ls.frustumCulled = false; ls.layers.set(1); ls.renderOrder = 15;
  return ls;
}

// instanced butterflies with shader wing flaps
function makeButterflies(U, n) {
  const B = new GeoBuilder();
  for (const s of [-1, 1]) {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.bezierCurveTo(0.03, 0.09, 0.12, 0.1, 0.13, 0.03); sh.bezierCurveTo(0.13, -0.01, 0.08, -0.02, 0.0, -0.005);
    sh.bezierCurveTo(0.07, -0.03, 0.1, -0.07, 0.07, -0.1); sh.bezierCurveTo(0.04, -0.11, 0.01, -0.06, 0, -0.01);
    const g = new THREE.ShapeGeometry(sh, 6);
    const P = g.attributes.position.array;
    for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1]; P[i] = s * (x + 0.006); P[i + 1] = 0; P[i + 2] = y; }
    g.computeVertexNormals();
    B.add(g, { colorFn: (c, x, y, z) => { const d = Math.hypot(x, z); c.setScalar(1); if (d > 0.1) c.multiplyScalar(0.35); else if (d > 0.085) c.multiplyScalar(0.8); if (Math.abs(x) > 0.05 && Math.abs(x) < 0.065 && z > 0.02 && z < 0.04) c.setScalar(0.25); } });
  }
  B.add(new THREE.CapsuleGeometry(0.008, 0.07, 3, 6), { rot: [Math.PI / 2, 0, 0], color: '#3b3128' });
  const geo = B.build();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{ float side = sign(position.x); float ax = abs(position.x);
  if (ax > 0.009) {
    float f = 0.5 + 0.5 * sin(uTime * 17.0 + float(gl_InstanceID) * 2.31);
    float ang = mix(-0.25, 1.25, f);
    transformed.x = side * (0.009 + (ax - 0.009) * cos(ang));
    transformed.y = (ax - 0.009) * sin(ang);
  } }`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>');
  };
  m.customProgramCacheKey = () => 'butterfly';
  const im = new THREE.InstancedMesh(geo, m, n);
  im.frustumCulled = false; im.castShadow = false;
  const cols = ['#ffffff', '#ffe27a', '#ffb25c', '#9fd0ff', '#f5a9d0', '#fff3c4'];
  for (let i = 0; i < n; i++) im.setColorAt(i, new THREE.Color(cols[i % cols.length]));
  return im;
}

export class FX {
  constructor(scene, U, T) {
    this.scene = scene; this.U = U; this.T = T;
    this.lit = new Pool(2200, false, U);
    this.glow = new Pool(700, true, U);
    scene.add(this.lit.points, this.glow.points);
    this.rain = makeRain(U, 2600); scene.add(this.rain);
    this.bfN = 8; this.bf = makeButterflies(U, this.bfN); scene.add(this.bf);
    this.bfs = [];
    this.timers = { smoke: 0, mist: 0, fly: 0, mote: 0, rain: 0, glint: 0 };
    this._c = new THREE.Color(); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ'); this._s = new THREE.Vector3(1, 1, 1); this._p = new THREE.Vector3();
  }
  setViewport(hPx, fovDeg) {
    const s = hPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    this.lit.mat.uniforms.uScale.value = s; this.glow.mat.uniforms.uScale.value = s;
  }
  setButterflySpots(spots) {
    const R = Math.random;
    this.bfs = [];
    for (let i = 0; i < this.bfN; i++) {
      const sp = spots.length ? spots[i % spots.length] : { x: 10, z: -5 };
      const cx = sp.x !== undefined ? sp.x : sp[0], cz = sp.z !== undefined ? sp.z : sp[1];
      this.bfs.push({ cx, cz, x: cx, z: cz, y: 1, ph: R() * 100, sp: 0.6 + R() * 0.5, h: 0, vis: 1 });
    }
  }
  // -------------------------------------------------- one-shot emitters
  splash(p, n = 10, s = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.7 * s;
      this.lit.spawn(p.x + Math.cos(a) * 0.08 * s, p.y + 0.02, p.z + Math.sin(a) * 0.08 * s, Math.cos(a) * r, (1.4 + Math.random() * 1.8) * s, Math.sin(a) * r,
        0.5 + Math.random() * 0.4, 0.035 * s + 0.02, 0.02, 0.85, 0.92, 1.0, 0.85, 9.8, 0.4, 3, 3, p.y - 0.05);
    }
    for (let i = 0; i < Math.ceil(n / 3); i++) this.lit.spawn(p.x + (Math.random() - 0.5) * 0.3 * s, p.y + 0.05, p.z + (Math.random() - 0.5) * 0.3 * s, 0, 0.25, 0, 0.6, 0.15 * s, 0.5 * s, 0.9, 0.95, 1, 0.25, 0, 1.5, 0, 2);
  }
  dirt(p, n = 14, color) {
    const c = color || this._c.set('#6b4a2e');
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 1.2;
      const k = 0.8 + Math.random() * 0.4;
      this.lit.spawn(p.x, p.y + 0.05, p.z, Math.cos(a) * r, 1.5 + Math.random() * 2.2, Math.sin(a) * r, 0.7 + Math.random() * 0.4,
        0.05 + Math.random() * 0.05, 0.03, c.r * k, c.g * k, c.b * k, 1, 9.8, 0.6, 2, 3, p.y);
    }
    for (let i = 0; i < 5; i++) this.lit.spawn(p.x + (Math.random() - 0.5) * 0.4, p.y + 0.1, p.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 0.35, (Math.random() - 0.5) * 0.4, 1.0, 0.2, 0.7, 0.62, 0.52, 0.4, 0.35, 0, 1.2, 0, 2);
  }
  dust(p, s = 1) {
    for (let i = 0; i < 3; i++) this.lit.spawn(p.x + (Math.random() - 0.5) * 0.25, p.y + 0.06, p.z + (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.4, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.4, 0.8, 0.12 * s, 0.45 * s, 0.75, 0.66, 0.52, 0.28, 0, 1.5, 0, 2);
  }
  sparkle(p, n = 8, color = '#ffe9a0', spread = 0.5) {
    const c = this._c.set(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.glow.spawn(p.x + Math.cos(a) * spread * Math.random(), p.y + Math.random() * spread, p.z + Math.sin(a) * spread * Math.random(),
        Math.cos(a) * 0.3, 0.6 + Math.random() * 0.8, Math.sin(a) * 0.3, 0.6 + Math.random() * 0.5, 0.12 + Math.random() * 0.08, 0.02, c.r * 2.5, c.g * 2.5, c.b * 2.5, 1, 0, 1.2, 1);
    }
  }
  leaves(p, n = 6, color = '#7fae4a') {
    const c = this._c.set(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.8;
      this.lit.spawn(p.x, p.y + 0.2, p.z, Math.cos(a) * r, 1 + Math.random() * 1.5, Math.sin(a) * r, 1.0 + Math.random() * 0.5, 0.06, 0.05, c.r, c.g, c.b, 1, 4, 1.8, 2, 0, p.y - 0.2);
    }
  }
  // continuous: watering can stream (call each frame while pouring)
  pour(from, dir, dt) {
    const n = Math.max(1, Math.round(dt * 160));
    for (let i = 0; i < n; i++) {
      const sp = 1.6 + Math.random() * 0.5;
      const fl = this.T.heightAt(from.x + dir.x * 0.5, from.z + dir.z * 0.5);
      this.lit.spawn(from.x + (Math.random() - 0.5) * 0.04, from.y, from.z + (Math.random() - 0.5) * 0.04,
        dir.x * sp + (Math.random() - 0.5) * 0.3, dir.y * sp + (Math.random() - 0.5) * 0.2, dir.z * sp + (Math.random() - 0.5) * 0.3,
        0.7, 0.03, 0.025, 0.75, 0.88, 1.0, 0.8, 9.8, 0.2, 3, 3, fl + 0.06);
    }
  }
  // -------------------------------------------------- per-frame ambient
  update(dt, t, ctx) {
    const { camPos, player, env, structures, weather, nightK, dayK, wind } = ctx;
    const T = this.T, R = Math.random;
    // chimney smoke
    this.timers.smoke -= dt;
    if (structures && structures.chimneyTop && this.timers.smoke < 0) {
      this.timers.smoke = 0.16;
      const c = structures.chimneyTop;
      if (Math.hypot(camPos.x - c.x, camPos.z - c.z) < 90) {
        const g = 0.78 + R() * 0.1;
        this.lit.spawn(c.x + (R() - 0.5) * 0.2, c.y, c.z + (R() - 0.5) * 0.2, (R() - 0.5) * 0.15, 0.55 + R() * 0.25, (R() - 0.5) * 0.15, 5 + R() * 2, 0.35, 2.4, g, g, g * 1.02, 0.32, -0.02, 0.25, 0, 2);
      }
    }
    // cascade mist
    const cs = T.cascade; const cd = Math.hypot(camPos.x - cs.x, camPos.z - cs.z);
    if (cd < 75) {
      this.timers.mist -= dt;
      while (this.timers.mist < 0) {
        this.timers.mist += 0.035;
        const s = T.cascadeS1 + 0.5 + R() * 2.5;
        const p = T.riverPointAt(s), hw = T.riverHalfW(s) * 0.9, off = (R() - 0.5) * 2 * hw;
        const lv = T.riverLevel(s);
        this.lit.spawn(p.x - p.tz * off, lv + 0.1, p.z + p.tx * off, p.tx * 0.6 + (R() - 0.5) * 0.3, 0.35 + R() * 0.5, p.tz * 0.6 + (R() - 0.5) * 0.3, 2.2 + R(), 0.5, 2.2, 0.95, 0.97, 1.0, 0.2, -0.03, 0.6, 0, 2);
        if (R() < 0.4) this.lit.spawn(p.x - p.tz * off, lv + 0.2, p.z + p.tx * off, p.tx * 1.5 + (R() - 0.5), 1 + R() * 2, p.tz * 1.5 + (R() - 0.5), 0.6, 0.03, 0.02, 0.9, 0.95, 1, 0.8, 9.8, 0.3, 3, 3, lv);
      }
    }
    // fireflies at night (not in rain)
    if (nightK > 0.5 && weather !== 'rain') {
      this.timers.fly -= dt;
      if (this.timers.fly < 0) {
        this.timers.fly = 0.12;
        const a = R() * Math.PI * 2, r = 3 + R() * 20;
        const x = camPos.x + Math.cos(a) * r, z = camPos.z + Math.sin(a) * r;
        const h = T.heightAt(x, z), lv = T.waterLevelAt(x, z);
        const base = Math.max(h, lv > -40 ? lv : -1e9);
        this.glow.spawn(x, base + 0.4 + R() * 1.6, z, (R() - 0.5) * 0.3, (R() - 0.5) * 0.1, (R() - 0.5) * 0.3, 6 + R() * 6, 0.09, 0.09, 1.6, 2.6, 0.6, 1, 0, 0.0, 0, 1);
      }
    }
    // pollen motes by day
    if (dayK > 0.6 && weather === 'sunny') {
      this.timers.mote -= dt;
      if (this.timers.mote < 0) {
        this.timers.mote = 0.25;
        const a = R() * Math.PI * 2, r = 1 + R() * 9;
        const x = camPos.x + Math.cos(a) * r, z = camPos.z + Math.sin(a) * r;
        this.glow.spawn(x, T.heightAt(x, z) + 0.5 + R() * 2.2, z, (R() - 0.5) * 0.1, 0.03, (R() - 0.5) * 0.1, 5 + R() * 3, 0.025, 0.025, 0.9, 0.85, 0.6, 0.6, 0, 0.1, 0, 2);
      }
    }
    // rain splashes on ground
    const rain = this.U.uRain.value;
    this.rain.material.uniforms.uCam.value.copy(camPos);
    this.rain.visible = rain > 0.01;
    if (rain > 0.2) {
      this.timers.rain -= dt;
      while (this.timers.rain < 0) {
        this.timers.rain += 0.02 / rain;
        const a = R() * Math.PI * 2, r = R() * 12;
        const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
        if (T.waterLevelAt(x, z) > T.heightAt(x, z)) continue;
        const y = T.groundHeight(x, z);
        for (let k = 0; k < 2; k++) this.lit.spawn(x, y + 0.02, z, (R() - 0.5) * 0.6, 0.8 + R() * 0.6, (R() - 0.5) * 0.6, 0.25, 0.025, 0.015, 0.85, 0.9, 1, 0.6, 9.8, 0, 3, 3, y);
      }
    }
    // ripe crop glints
    if (ctx.ripeTiles && ctx.ripeTiles.length) {
      this.timers.glint -= dt;
      if (this.timers.glint < 0) {
        this.timers.glint = 0.5;
        const tl = ctx.ripeTiles[Math.floor(R() * ctx.ripeTiles.length)];
        this.glow.spawn(tl.i + 0.3 + R() * 0.4, tl.y + 0.35 + R() * 0.4, tl.j + 0.3 + R() * 0.4, 0, 0.15, 0, 0.9, 0.16, 0.02, 2.4, 2.2, 1.4, 1, 0, 0, 1);
      }
    }
    // butterflies
    const showBf = dayK > 0.5 && weather !== 'rain';
    this.bf.visible = showBf && this.bfs.length > 0;
    if (this.bf.visible) {
      for (let i = 0; i < this.bfs.length; i++) {
        const b = this.bfs[i];
        const tt = t * b.sp + b.ph;
        const tx = b.cx + Math.sin(tt * 0.37) * 2.2 + Math.sin(tt * 0.91) * 0.8, tz = b.cz + Math.cos(tt * 0.29) * 2.2 + Math.cos(tt * 1.13) * 0.8;
        const nx = lerp(b.x, tx, 1 - Math.exp(-dt * 1.5)), nz = lerp(b.z, tz, 1 - Math.exp(-dt * 1.5));
        const dx = nx - b.x, dz = nz - b.z;
        if (Math.abs(dx) + Math.abs(dz) > 1e-5) b.h = Math.atan2(dx, dz);
        b.x = nx; b.z = nz;
        b.y = T.heightAt(b.x, b.z) + 0.55 + Math.sin(tt * 2.3) * 0.25 + Math.sin(tt * 5.1) * 0.06;
        this._e.set(Math.sin(tt * 3) * 0.2 - 0.2, b.h, 0);
        this._q.setFromEuler(this._e);
        this._m.compose(this._p.set(b.x, b.y, b.z), this._q, this._s.setScalar(1.15));
        this.bf.setMatrixAt(i, this._m);
      }
      this.bf.instanceMatrix.needsUpdate = true;
    }
    this.lit.update(dt, t, wind);
    this.glow.update(dt, t, wind);
    void env; void smoothstep; void clamp;
  }
}
