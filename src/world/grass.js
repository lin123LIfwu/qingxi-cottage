// GPU meadow grass.
// Every blade is generated in the vertex shader from gl_InstanceID: blades live on a
// world-anchored jittered grid (so nothing swims when the camera moves), are grouped in
// square tiles that are frustum-culled on the CPU each frame, and come in two layers —
// dense, finely segmented blades near the camera and a sparser far layer that cross-fades
// into the ground texture.  Blades are thin and gather into tufts (Voronoi clumps that share
// height, tint and a fan-out direction), so the field reads as a soft natural sward rather
// than as individual strips.  Height and placement come from the terrain height grid and the
// baked grass-density mask (blue channel of the ground mask).
import * as THREE from 'three';
import { GLSL_NOISE } from '../util/glsl.js';
import { GLSL_MEADOW } from '../util/meadow.js';

const QUAL = {
  low: { near: { sp: 0.075, tile: 4.5, segs: 2 }, far: { sp: 0.15, tile: 9.0, segs: 1 }, rn: 10, rf: 26 },
  medium: { near: { sp: 0.056, tile: 4.5, segs: 3 }, far: { sp: 0.11, tile: 9.0, segs: 1 }, rn: 13, rf: 34 },
  high: { near: { sp: 0.046, tile: 4.6, segs: 4 }, far: { sp: 0.092, tile: 9.2, segs: 2 }, rn: 16, rf: 42 },
};
const MAX_TILES = 256;
const FADE_W = 4;
const CLUMP = 0.42;   // tuft cell size (m)

function bladeGeo(segs) {
  // rows are packed towards the tip, where the blade bends and tapers
  const pos = [], idx = [];
  for (let i = 0; i < segs; i++) { const t = 1 - Math.pow(1 - i / segs, 1.25); pos.push(-1, t, 0, 1, t, 0); }
  pos.push(0, 1, 0);
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const a = (segs - 1) * 2; idx.push(a, a + 1, segs * 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.instanceCount = 0;
  return g;
}

const VS_PARS = /* glsl */`
uniform float uTime; uniform vec2 uWind; uniform vec3 uPlayerPos; uniform float uWet;
uniform sampler2D tTiles; uniform sampler2D tH; uniform sampler2D tGM;
uniform int uN; uniform int uBPT; uniform float uSp; uniform float uMode;
uniform float uRn; uniform float uRf; uniform float uFadeW; uniform float uClump;
uniform vec4 uGMRect; uniform vec3 uGrid; // x: -half, y: cell, z: V
varying vec3 vGC; varying float vTrans; varying float vBT;
${GLSL_NOISE}
${GLSL_MEADOW}
float gH(ivec2 c){ return texelFetch(tH, c, 0).r; }
`;

const VS_MAIN = /* glsl */`
bool gDead = true;
vec3 gPos = vec3(0.0); vec3 gNrm = vec3(0.0, 1.0, 0.0);
vGC = vec3(0.0); vTrans = 0.0; vBT = 0.0;
{
  int tileI = gl_InstanceID / uBPT;
  int lid = gl_InstanceID - tileI * uBPT;
  vec4 TT = texelFetch(tTiles, ivec2(tileI, 0), 0);
  vec2 cell = TT.xy + vec2(float(lid % uN), float(lid / uN));
  vec2 r0 = hash22(cell); vec2 r1 = hash22(cell + 17.31);
  vec2 rxz = (cell + r0) * uSp;
  float dC = length(rxz - cameraPosition.xz);
  // layer cross-fade (complementary probabilities) + far shrink
  float pN = 1.0 - smoothstep(uRn - uFadeW, uRn, dC);
  float keep = uMode < 0.5 ? pN : (1.0 - pN);
  float shrink = uMode < 0.5 ? 1.0 : 1.0 - smoothstep(uRf - 9.0, uRf, dC);
  if (r1.x < keep && shrink > 0.02) {
    // tufts: every blade belongs to the nearest jittered clump centre
    vec2 cgi = floor(rxz / uClump);
    float cd2 = 1e9; vec2 cc = rxz; vec2 cid = cgi;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 c = cgi + vec2(float(i), float(j));
      vec2 q = (c + 0.5 + (hash22(c * 1.37 + 3.1) - 0.5) * 0.85) * uClump;
      vec2 dq = q - rxz; float d2 = dot(dq, dq);
      if (d2 < cd2) { cd2 = d2; cc = q; cid = c; }
    }
    vec2 cr = hash22(cid * 0.71 + 13.7);
    vec2 toC = cc - rxz;
    rxz += toC * 0.28;
    vec4 gm = textureLod(tGM, (rxz - uGMRect.xy) / uGMRect.zw, 0.0);
    float dens = gm.b * (1.0 - smoothstep(0.2, 0.55, gm.r));
    if (r1.y < dens * 1.12) {
      gDead = false;
      vec2 r2 = hash22(cell * 1.37 + 5.17); vec2 r3 = hash22(cell + 41.7);
      // terrain height / normal (same triangulation as the terrain mesh)
      vec2 gg = (rxz - uGrid.x) / uGrid.y;
      ivec2 ic = clamp(ivec2(floor(gg)), ivec2(0), ivec2(int(uGrid.z) - 2));
      vec2 tf = clamp(gg - vec2(ic), 0.0, 1.0);
      float ha = gH(ic), hb = gH(ic + ivec2(1, 0)), hc = gH(ic + ivec2(0, 1)), hd = gH(ic + ivec2(1, 1));
      float hy; vec2 dh;
      if (tf.x + tf.y <= 1.0) { hy = ha + (hb - ha) * tf.x + (hc - ha) * tf.y; dh = vec2(hb - ha, hc - ha); }
      else { hy = hd + (hc - hd) * (1.0 - tf.x) + (hb - hd) * (1.0 - tf.y); dh = vec2(hd - hc, hd - hb); }
      vec3 tN = normalize(vec3(-dh.x / uGrid.y, 1.0, -dh.y / uGrid.y));
      vec3 root = vec3(rxz.x, hy - 0.03, rxz.y);

      vec4 md = meadow(rxz);
      float hgt = mix(0.15, 0.4, r2.x * r2.x) * mix(0.72, 1.3, cr.x) * mix(0.62, 1.42, md.z)
                * (0.35 + 0.65 * smoothstep(0.0, 0.7, dens)) * shrink;
      float wid = mix(0.011, 0.019, r2.y) * (uMode < 0.5 ? 1.0 : 1.6) * (1.0 + dC * 0.05);
      // blades fan out from the tuft centre and bend over along their face normal
      float ol = length(toC);
      float aOut = ol > 1e-4 ? atan(-toC.y, -toC.x) : r3.x * 6.2831853;
      float ang = aOut - 1.5707963 + (r3.x - 0.5) * 2.2;
      vec3 sd = vec3(cos(ang), 0.0, sin(ang));
      vec3 fw = vec3(-sd.z, 0.0, sd.x);
      float lean = mix(0.12, 0.55, r3.y) * mix(0.6, 1.25, smoothstep(0.0, uClump * 0.5, ol));
      // wind: travelling gust waves + per-blade flutter
      float wl = length(uWind);
      vec2 wd = uWind / max(wl, 1e-3);
      float gust = vnoise(rxz * 0.11 - wd * uTime * 1.6) * 0.75 + vnoise(rxz * 0.43 - wd * uTime * 2.7) * 0.25;
      float flut = sin(uTime * (2.4 + r1.x * 1.6) + r0.x * 6.28) * 0.12;
      vec2 wv = wd * (0.18 + gust * 1.05 + flut) * wl;
      vec3 horiz = fw * lean * hgt + vec3(wv.x, 0.0, wv.y) * hgt * 0.95;
      // player push
      vec2 pd = rxz - uPlayerPos.xz; float pl = length(pd);
      float pk = (1.0 - smoothstep(0.2, 0.85, pl)) * step(abs(root.y - uPlayerPos.y), 1.5);
      horiz += vec3(pd.x, 0.0, pd.y) / max(pl, 1e-3) * pk * hgt * 0.9;
      float hl = length(horiz);
      if (hl > hgt * 0.92) horiz *= hgt * 0.92 / hl;
      hl = min(hl, hgt * 0.92);
      float tipY = sqrt(max(hgt * hgt - hl * hl, 0.0));
      vec3 P1 = vec3(0.0, tipY * 0.72, 0.0) + horiz * 0.12;
      vec3 P2 = vec3(0.0, tipY, 0.0) + horiz;
      float t = position.y;
      vec3 B = 2.0 * (1.0 - t) * t * P1 + t * t * P2;
      vec3 dB = 2.0 * (1.0 - t) * P1 + 2.0 * t * (P2 - P1);
      // parallel-sided blade that tapers to a point over its upper third, with a slight twist
      float w = wid * pow(max(1.0 - t * t, 0.0), 0.7) * 0.5;
      float tw = (r2.x - 0.5) * 1.2 * t;
      vec3 sdT = sd * cos(tw) + fw * sin(tw);
      gPos = root + B + sdT * position.x * w;
      vec3 nF = normalize(cross(sdT, normalize(dB + vec3(0.0, 1e-4, 0.0))));
      if (dot(nF, cameraPosition - root) < 0.0) nF = -nF;
      vec3 nR = normalize(nF + sdT * position.x * 0.6);
      float flatK = 0.45 + 0.45 * smoothstep(3.0, 28.0, dC);
      gNrm = normalize(mix(nR, tN, flatK));
      // colour: lush/mid greens varied per tuft, some yellowed & dry blades, shared meadow tint
      vec3 cLush = vec3(0.055, 0.125, 0.022), cMid = vec3(0.105, 0.175, 0.038), cDry = vec3(0.34, 0.28, 0.12);
      vec3 c = mix(cLush, cMid, r2.y * 0.5 + cr.y * 0.5);
      float dryP = 0.04 + md.x * 0.45 + (cr.x - 0.5) * 0.06;
      c = mix(c, cDry * (0.75 + 0.5 * r3.y), step(r0.y, dryP) * (0.55 + 0.45 * r2.x));
      c *= meadowTint(md) * (0.88 + 0.24 * cr.y);
      c *= mix(0.42, 1.0, smoothstep(0.0, 0.8, t));
      c = mix(c, c * vec3(1.2, 1.16, 0.76), t * t * 0.55);
      c *= 1.0 + (gust - 0.45) * 0.22 * wl;
      c *= mix(1.0, 0.72, uWet);
      vGC = c;
      vTrans = 0.3 + 0.7 * t;
      vBT = t;
    }
  }
}
`;

export class GrassField {
  constructor(T, U, quality = 'medium') {
    this.T = T; this.U = U;
    this.group = new THREE.Group(); this.group.name = 'grass';
    // terrain height texture (exact grid heights)
    const V = T.V;
    const hd = new Float32Array(V * V); hd.set(T.h);
    const ht = new THREE.DataTexture(hd, V, V, THREE.RedFormat, THREE.FloatType);
    ht.minFilter = ht.magFilter = THREE.NearestFilter; ht.needsUpdate = true;
    this.hTex = ht;
    this.frustum = new THREE.Frustum(); this._m = new THREE.Matrix4(); this._box = new THREE.Box3();
    this.yCache = new Map();
    this.layers = [];
    this.setQuality(quality);
  }
  setQuality(q) {
    const Q = QUAL[q] || QUAL.medium;
    if (this.qk === q) return;
    this.qk = q;
    for (const L of this.layers) { this.group.remove(L.mesh); L.geo.dispose(); L.mat.dispose(); L.tex.dispose(); }
    this.layers = [];
    this.rn = Q.rn; this.rf = Q.rf;
    // the terrain darkens the ground between the blades out to where the grass ends
    if (!this.T.grassR) this.T.grassR = { value: new THREE.Vector2() };
    this.T.grassR.value.set(Q.rf - 14, Q.rf);
    this.layers.push(this.makeLayer(Q.near, 0), this.makeLayer(Q.far, 1));
  }
  makeLayer(cfg, mode) {
    const T = this.T, U = this.U;
    const n = Math.round(cfg.tile / cfg.sp);
    cfg = { ...cfg, tile: n * cfg.sp };   // tiles hold a whole number of cells
    const data = new Float32Array(MAX_TILES * 4);
    const tex = new THREE.DataTexture(data, MAX_TILES, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
    const geo = bladeGeo(cfg.segs);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
    const uni = {
      tTiles: { value: tex }, tH: { value: this.hTex }, tGM: { value: T.groundTex },
      uN: { value: n }, uBPT: { value: n * n }, uSp: { value: cfg.sp }, uMode: { value: mode },
      uRn: { value: this.rn }, uRf: { value: this.rf }, uFadeW: { value: FADE_W }, uClump: { value: CLUMP },
      uGMRect: { value: T.groundRect }, uGrid: { value: new THREE.Vector3(-T.half, T.cell, T.V) },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni);
      sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind; sh.uniforms.uPlayerPos = U.uPlayerPos; sh.uniforms.uWet = U.uWet;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VS_PARS)
        .replace('#include <beginnormal_vertex>', VS_MAIN + '\nvec3 objectNormal = gNrm;')
        .replace('#include <begin_vertex>', 'vec3 transformed = gPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nif (gDead) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform float uWet;
varying vec3 vGC; varying float vTrans; varying float vBT;`)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vGC;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.62, 0.36, uWet) - vBT * 0.12;')
        .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
        .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
void RE_Direct_Grass( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  float nl = dot( geometryNormal, directLight.direction );
  vec3 irradiance = saturate( nl ) * directLight.color;
  reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material ) * material.multiScatteringCompensation;
  float wrap = saturate( ( nl + 0.35 ) / 1.35 );
  reflectedLight.directDiffuse += wrap * directLight.color * BRDF_Lambert( material.diffuseContribution );
  // light scattering through the thin blades (strongest when looking towards the sun)
  float bt = pow( saturate( dot( -geometryViewDir, directLight.direction ) ), 4.0 );
  reflectedLight.directDiffuse += directLight.color * material.diffuseContribution * ( saturate( -nl ) * 0.22 + bt * 0.75 ) * vTrans;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Grass`)
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= mix(0.45, 1.0, vBT);');
    };
    mat.customProgramCacheKey = () => 'grassblade2';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.visible = false; mesh.name = mode ? 'grassFar' : 'grassNear';
    this.group.add(mesh);
    return { cfg, n, bpt: n * n, data, tex, geo, mat, mesh, mode, uni };
  }
  tileY(ix, iz, ts) {
    const key = ts * 1e7 + ix * 4096 + iz;
    let r = this.yCache.get(key);
    if (r) return r;
    const T = this.T, V = T.V;
    const a = Math.max(0, Math.floor((ix * ts + T.half) / T.cell)), b = Math.min(V - 1, Math.ceil(((ix + 1) * ts + T.half) / T.cell));
    const c = Math.max(0, Math.floor((iz * ts + T.half) / T.cell)), d = Math.min(V - 1, Math.ceil(((iz + 1) * ts + T.half) / T.cell));
    let lo = 1e9, hi = -1e9;
    for (let z = c; z <= d; z++) for (let x = a; x <= b; x++) { const h = T.h[z * V + x]; if (h < lo) lo = h; if (h > hi) hi = h; }
    if (lo > hi) { lo = 0; hi = 0; }
    r = [lo - 0.2, hi + 1.0];
    this.yCache.set(key, r);
    return r;
  }
  update(camera) {
    const cam = camera.position;
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._m);
    const lim = this.T.groundRect.x + this.T.groundRect.z; // +90
    for (const L of this.layers) {
      const ts = L.cfg.tile, R = L.mode ? this.rf : this.rn, inner = L.mode ? this.rn - FADE_W : -1;
      const i0 = Math.floor((cam.x - R) / ts), i1 = Math.floor((cam.x + R) / ts);
      const j0 = Math.floor((cam.z - R) / ts), j1 = Math.floor((cam.z + R) / ts);
      let n = 0;
      for (let iz = j0; iz <= j1; iz++) for (let ix = i0; ix <= i1; ix++) {
        const x0 = ix * ts, z0 = iz * ts, x1 = x0 + ts, z1 = z0 + ts;
        if (x1 < -lim || z1 < -lim || x0 > lim || z0 > lim) continue;
        const dx = Math.max(x0 - cam.x, 0, cam.x - x1), dz = Math.max(z0 - cam.z, 0, cam.z - z1);
        if (dx * dx + dz * dz > R * R) continue;
        if (inner > 0) {
          const fx = Math.max(Math.abs(x0 - cam.x), Math.abs(x1 - cam.x)), fz = Math.max(Math.abs(z0 - cam.z), Math.abs(z1 - cam.z));
          if (fx * fx + fz * fz < inner * inner) continue;
        }
        const [y0, y1] = this.tileY(ix, iz, ts);
        this._box.min.set(x0 - 0.6, y0, z0 - 0.6); this._box.max.set(x1 + 0.6, y1, z1 + 0.6);
        if (!this.frustum.intersectsBox(this._box)) continue;
        if (n >= MAX_TILES) break;
        L.data[n * 4] = ix * L.n; L.data[n * 4 + 1] = iz * L.n;
        n++;
      }
      L.geo.instanceCount = n * L.bpt;
      L.mesh.visible = n > 0;
      if (n) L.tex.needsUpdate = true;
    }
  }
}
