import * as THREE from 'three';
import { POND } from '../config.js';
import { mulberry32 } from '../util/noise.js';
import { clamp, lerp, smoothstep } from '../util/math.js';
import { GLSL_NOISE } from '../util/glsl.js';

function makeWaterNormalTex(size = 256) {
  const rand = mulberry32(911);
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const grads = {};
  const grad = (P) => {
    if (grads[P]) return grads[P];
    const g = new Float32Array(P * P * 2);
    for (let i = 0; i < P * P; i++) { const a = rand() * Math.PI * 2; g[i * 2] = Math.cos(a); g[i * 2 + 1] = Math.sin(a); }
    return (grads[P] = g);
  };
  const pnoise = (x, y, P) => {
    const g = grad(P);
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const d = (ix, iy, dx, dy) => { const k = ((((iy % P) + P) % P) * P + (((ix % P) + P) % P)) * 2; return g[k] * dx + g[k + 1] * dy; };
    const u = fade(xf), v = fade(yf);
    return lerp(lerp(d(xi, yi, xf, yf), d(xi + 1, yi, xf - 1, yf), u), lerp(d(xi, yi + 1, xf, yf - 1), d(xi + 1, yi + 1, xf - 1, yf - 1), u), v);
  };
  const H = new Float32Array(size * size), Fm = new Float32Array(size * size);
  const waves = [[3, 1, 0.3, 0.2], [-1, 4, 0.22, 1.3], [5, -2, 0.16, 2.1], [-6, -3, 0.1, 0.4], [2, 7, 0.08, 3.3]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    let h = 0;
    const oct = [[4, 1], [8, 0.55], [16, 0.3], [32, 0.15], [64, 0.07]];
    for (const [P, a] of oct) h += pnoise(u * P, v * P, P) * a;
    for (const [kx, ky, a, ph] of waves) h += Math.sin(Math.PI * 2 * (kx * u + ky * v) + ph) * a;
    H[y * size + x] = h;
    let f = 0;
    for (const [P, a] of [[6, 1], [12, 0.5], [24, 0.25]]) f += (1 - Math.abs(pnoise(u * P + 0.5, v * P + 0.5, P) * 1.6)) * a;
    Fm[y * size + x] = f / 1.75;
  }
  let sum = 0;
  const gx = new Float32Array(size * size), gy = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = (x - 1 + size) % size, xr = (x + 1) % size, yu = (y - 1 + size) % size, yd = (y + 1) % size;
    const dx = (H[y * size + xr] - H[y * size + xl]) * 0.5, dy = (H[yd * size + x] - H[yu * size + x]) * 0.5;
    gx[y * size + x] = dx; gy[y * size + x] = dy; sum += dx * dx + dy * dy;
  }
  const rms = Math.sqrt(sum / (size * size));
  const k = 0.42 / rms;
  let fmin = 1e9, fmax = -1e9;
  for (let i = 0; i < size * size; i++) { fmin = Math.min(fmin, Fm[i]); fmax = Math.max(fmax, Fm[i]); }
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    let nx = -gx[i] * k, ny = -gy[i] * k, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    data[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    data[i * 4 + 3] = Math.round(((Fm[i] - fmin) / (fmax - fmin)) * 255);
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.anisotropy = 4; tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
attribute vec2 aFlow;
attribute float aFoam;
varying vec3 vWPos; varying vec3 vVPos; varying vec2 vFlow; varying float vFoam;
void main() {
  vec3 transformed = position;
  vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );
  vWPos = worldPosition.xyz;
  vec4 mvPosition = viewMatrix * worldPosition;
  vVPos = mvPosition.xyz;
  vFlow = aFlow; vFoam = aFoam;
  gl_Position = projectionMatrix * mvPosition;
  vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );
  vec3 transformedNormal = normalMatrix * objectNormal;
  #include <shadowmap_vertex>
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tNormal; uniform samplerCube tSky;
uniform mat4 projectionMatrix;
uniform vec2 uResolution; uniform float uNear; uniform float uFar; uniform float uTime;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyAmbient; uniform float uRain; uniform float uNight;
uniform vec3 uAbsorb; uniform vec3 uScatter; uniform vec4 uRipples[ 12 ];
varying vec3 vWPos; varying vec3 vVPos; varying vec2 vFlow; varying float vFoam;
${GLSL_NOISE}
float linZ( float d ) { return perspectiveDepthToViewZ( d, uNear, uFar ); }
vec3 nrmS( vec2 uv ) { vec3 n = texture2D( tNormal, uv ).xyz * 2.0 - 1.0; return vec3( n.x, n.z, n.y ); }

vec3 surfaceNormal( vec2 p, out float foamN ) {
  vec3 n = vec3( 0.0 );
  float strength;
#if RIVER
  vec2 fl = vFlow;
  float sp = length( fl );
  float rate = 0.32;
  float ph0 = fract( uTime * rate ); float ph1 = fract( uTime * rate + 0.5 );
  float w0 = 1.0 - abs( 1.0 - 2.0 * ph0 );
  float w1 = 1.0 - w0;
  vec2 o0 = fl * ( ph0 - 0.5 ) / rate;
  vec2 o1 = fl * ( ph1 - 0.5 ) / rate;
  n += nrmS( ( p - o0 ) * 0.2 ) * w0 + nrmS( ( p - o1 ) * 0.2 + 0.37 ) * w1;
  n += ( nrmS( ( p - o0 ) * 0.47 + 0.11 ) * w0 + nrmS( ( p - o1 ) * 0.47 + 0.71 ) * w1 ) * 0.65;
  n += nrmS( p * 0.9 + uTime * vec2( 0.03, -0.02 ) ) * 0.25;
  strength = 0.30 + clamp( sp, 0.0, 3.0 ) * 0.16;
  // foam streaks: sample in flow-aligned space, stretched along the current (strongly on the cascade)
  vec2 dirF = sp > 0.01 ? fl / sp : vec2( 1.0, 0.0 );
  vec2 prp = vec2( -dirF.y, dirF.x );
  float stretch = mix( 0.8, 0.28, clamp( vFoam, 0.0, 1.0 ) );
  vec2 q0 = p - o0, q1 = p - o1;
  vec2 a0 = vec2( dot( q0, prp ), dot( q0, dirF ) * stretch ), a1 = vec2( dot( q1, prp ), dot( q1, dirF ) * stretch );
  foamN = texture2D( tNormal, a0 * 0.31 ).a * w0 + texture2D( tNormal, a1 * 0.31 + 0.5 ).a * w1;
  foamN = foamN * 0.75 + 0.25 * ( texture2D( tNormal, a0 * 0.83 + 0.21 ).a * w0 + texture2D( tNormal, a1 * 0.83 + 0.67 ).a * w1 );
#else
  n += nrmS( p * 0.05 + uTime * vec2( 0.007, 0.0045 ) );
  n += nrmS( p * 0.13 + uTime * vec2( -0.010, 0.008 ) ) * 0.7;
  n += nrmS( p * 0.37 + uTime * vec2( 0.014, -0.019 ) ) * 0.4;
  strength = 0.13 + uRain * 0.06;
  foamN = texture2D( tNormal, p * 0.21 + uTime * 0.006 ).a;
#endif
  vec2 g = n.xz * strength;
  for ( int i = 0; i < 12; i ++ ) {
    vec4 r = uRipples[ i ];
    float age = uTime - r.z;
    if ( r.w > 0.0 && age > 0.0 && age < 3.5 ) {
      vec2 d = p - r.xy; float dist = length( d ) + 1e-4;
      float x = dist - age * 1.05;
      float env = exp( -x * x * 6.0 ) * ( 1.0 - age / 3.5 ) * r.w;
      g += ( d / dist ) * sin( x * 15.0 ) * env * 0.45;
    }
  }
  if ( uRain > 0.01 ) {
    for ( int k = 0; k < 2; k ++ ) {
      vec2 cp = p * 2.1 + float( k ) * 7.31;
      vec2 ci = floor( cp ); vec2 cf = fract( cp ) - 0.5;
      float rnd = hash12( ci + float( k ) * 3.7 );
      float t = fract( uTime * 0.85 + rnd );
      vec2 off = ( hash22( ci + 1.3 ) - 0.5 ) * 0.5;
      vec2 dd = cf - off; float dist = length( dd ) + 1e-4;
      float x = dist - t * 0.45;
      float env = exp( -x * x * 260.0 ) * ( 1.0 - t ) * uRain;
      g += ( dd / dist ) * sin( x * 60.0 ) * env * 0.55;
    }
  }
  return normalize( vec3( g.x, 1.0, g.y ) );
}

void main() {
  vec2 suv = gl_FragCoord.xy / uResolution;
  vec3 V = normalize( cameraPosition - vWPos );
  float foamN;
  vec3 N = surfaceNormal( vWPos.xz, foamN );
  float waterZ = vVPos.z;
  float viewDist = length( vVPos );
  // fine capillary ripples, used only for the sun glitter (breaks the highlight into sparkles);
  // they fade out with distance so far water does not shimmer
  float gFar = smoothstep( 8.0, 45.0, viewDist );
  vec3 nm = nrmS( vWPos.xz * 1.7 + uTime * vec2( 0.045, -0.035 ) ) + nrmS( vWPos.xz * 2.9 + uTime * vec2( -0.03, 0.05 ) + 0.5 );
  vec3 Ng = normalize( N + vec3( nm.x, 0.0, nm.z ) * mix( 0.085, 0.02, gFar ) );
  float sceneZ = linZ( texture2D( tDepth, suv ).r );
  float thick0 = max( 0.0, ( sceneZ / waterZ - 1.0 ) * viewDist );

  // refraction
  vec3 nV = ( viewMatrix * vec4( N - vec3( 0.0, 1.0, 0.0 ), 0.0 ) ).xyz;
  vec2 offs = nV.xy * 0.06 * clamp( thick0, 0.0, 1.6 ) / max( 1.0, viewDist * 0.07 );
  vec2 ruv = suv + offs;
  float rz = linZ( texture2D( tDepth, ruv ).r );
  if ( rz > waterZ - 0.03 ) { ruv = suv; rz = sceneZ; }
  float thick = max( 0.0, ( rz / waterZ - 1.0 ) * viewDist );
  vec3 refr = texture2D( tColor, ruv ).rgb;

  float shadow = getShadowMask();
  float sunUp = clamp( uSunDir.y * 1.5, 0.0, 1.0 );
  vec3 lightC = uSunColor * ( 0.2 + 0.8 * shadow ) * sunUp + uSkyAmbient * 1.1;
  vec3 T = exp( -uAbsorb * thick );
  vec3 body = uScatter * lightC;
  vec3 under = refr * T + body * ( 1.0 - T );

  // reflection
  vec3 R = reflect( -V, N );
  R.y = abs( R.y ) + 0.02;
  R = normalize( R );
  vec3 skyR = textureCube( tSky, R ).rgb;
  // the physical sky (sun aureole especially) is far brighter than lit surfaces: compress it so
  // reflections read as soft blue sky instead of a blown-out white sheet (the sun glint is added below)
  float skyL = dot( skyR, vec3( 0.2126, 0.7152, 0.0722 ) );
  skyR *= min( 1.0, 1.6 / max( skyL, 1e-3 ) ) * mix( 0.75, 1.0, uNight );
  skyR *= 1.0 - 0.6 * smoothstep( 0.8, 0.99, dot( R, normalize( uSunDir ) ) ) * ( 1.0 - uNight );
  vec3 rV = normalize( ( viewMatrix * vec4( R, 0.0 ) ).xyz );
  float hit = 0.0; vec2 huv = vec2( 0.5 );
  vec3 p = vVPos; vec3 prevP = p;
  float stp = 0.3 + viewDist * 0.012;
  for ( int i = 0; i < SSR_STEPS; i ++ ) {
    prevP = p;
    p += rV * stp; stp *= 1.2;
    if ( p.z > -uNear ) break;
    vec4 cp = projectionMatrix * vec4( p, 1.0 );
    vec2 uvp = cp.xy / cp.w * 0.5 + 0.5;
    if ( uvp.x < 0.0 || uvp.x > 1.0 || uvp.y < 0.0 || uvp.y > 1.0 ) break;
    float sz = linZ( texture2D( tDepth, uvp ).r );
    // the first-person hands live in the very front of the depth range: never reflect them
    if ( sz > -uNear * 1.12 ) continue;
    float dz = sz - p.z;
    if ( dz > 0.0 && dz < stp * 2.5 + 0.35 ) {
      vec3 a = prevP; vec3 b = p;
      for ( int j = 0; j < 5; j ++ ) {
        vec3 m = ( a + b ) * 0.5;
        vec4 cm = projectionMatrix * vec4( m, 1.0 );
        vec2 um = cm.xy / cm.w * 0.5 + 0.5;
        float zm = linZ( texture2D( tDepth, um ).r );
        if ( zm - m.z > 0.0 ) b = m; else a = m;
      }
      vec4 cb = projectionMatrix * vec4( b, 1.0 );
      huv = cb.xy / cb.w * 0.5 + 0.5;
      hit = 1.0;
      break;
    }
  }
  vec2 ef = smoothstep( vec2( 0.0 ), vec2( 0.07 ), huv ) * smoothstep( vec2( 1.0 ), vec2( 0.93 ), huv );
  hit *= ef.x * ef.y;
  vec3 ssrC = texture2D( tColor, huv ).rgb;
  vec3 refl = mix( skyR, ssrC, hit );

  float NdV = max( dot( N, V ), 0.0 );
  float F = 0.02 + 0.98 * pow( 1.0 - NdV, 5.0 );
  vec3 col = mix( under, refl, F );

  // sun / moon glint (GGX)
  vec3 L = normalize( uSunDir );
  vec3 H = normalize( L + V );
  float NdH = max( dot( N, H ), 0.0 ); float NdL = max( dot( N, L ), 0.0 );
  float NdHg = max( dot( Ng, H ), 0.0 );
  // two lobes: tiny sharp sparkles (on the capillary normal) + a soft sheen; capped so the bloom stays a gentle glitter
  float Fs = 0.02 + 0.98 * pow( 1.0 - max( dot( H, V ), 0.0 ), 5.0 );
  float a2 = mix( 0.00045, 0.0022, gFar ) + uRain * 0.004;
  float dd = NdHg * NdHg * ( a2 - 1.0 ) + 1.0;
  float D = a2 / ( PI * dd * dd );
  float a2b = 0.03;
  float ddb = NdH * NdH * ( a2b - 1.0 ) + 1.0;
  float Db = a2b / ( PI * ddb * ddb );
  float spec = min( D * Fs * 0.25 / max( NdV, 0.15 ), 7.0 ) + min( Db * Fs * 0.25 / max( NdV, 0.15 ), 0.6 ) * 0.12;
  col += uSunColor * spec * NdL * shadow;

  // shoreline & foam
  float vDepth = thick * clamp( V.y, 0.08, 1.0 );
  float shore = 1.0 - smoothstep( 0.0, 0.22, vDepth );
#if RIVER
  float fth = mix( 0.62, 0.40, clamp( vFoam, 0.0, 1.0 ) );
  // broken, lacy foam where the current laps the banks (not a solid white rim)
  float foamMask = smoothstep( fth, fth + 0.22, foamN + shore * 0.24 ) * clamp( shore * 0.75 + vFoam * 1.1, 0.0, 1.0 );
  // aerated, milky water body on the cascade
  col = mix( col, lightC * 0.16 + col * 0.5, clamp( vFoam, 0.0, 1.0 ) * 0.35 );
#else
  float foamMask = smoothstep( 0.66, 0.95, foamN + shore * 0.3 ) * shore * 0.3;
#endif
  vec3 foamCol = lightC * ( 0.24 + 0.08 * foamN );
  col = mix( col, foamCol, clamp( foamMask, 0.0, 0.95 ) );
  float edgeA = smoothstep( 0.0, 0.045, vDepth );
  col = mix( texture2D( tColor, suv ).rgb, col, edgeA );
  gl_FragColor = vec4( col, 1.0 );
  #include <fog_fragment>
}`;

export class Water {
  constructor(terrain, U, pipelineTargets) {
    this.T = terrain; this.U = U;
    this.normalTex = makeWaterNormalTex(256);
    this.ripples = [];
    for (let i = 0; i < 12; i++) this.ripples.push(new THREE.Vector4(0, 0, -100, 0));
    this.rippleIdx = 0;
    this.materials = [];
    this.pond = new THREE.Mesh(this.buildPondGeometry(), this.makeMaterial(false));
    this.river = new THREE.Mesh(this.buildRiverGeometry(), this.makeMaterial(true));
    for (const m of [this.pond, this.river]) {
      m.layers.set(1); m.receiveShadow = true; m.frustumCulled = true;
    }
    this.pond.material.uniforms.uAbsorb.value.set(0.26, 0.068, 0.05);
    this.pond.material.uniforms.uScatter.value.set(0.020, 0.085, 0.095);
    this.river.material.uniforms.uAbsorb.value.set(0.33, 0.095, 0.075);
    this.river.material.uniforms.uScatter.value.set(0.028, 0.10, 0.085);
    this.group = new THREE.Group();
    this.group.add(this.pond, this.river);
  }
  makeMaterial(river) {
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.lights, THREE.UniformsLib.fog, {
      tColor: { value: null }, tDepth: { value: null }, tNormal: { value: this.normalTex }, tSky: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.1 }, uFar: { value: 1000 },
      uAbsorb: { value: new THREE.Vector3() }, uScatter: { value: new THREE.Vector3() },
    }]);
    uniforms.tNormal.value = this.normalTex;
    uniforms.uRipples = { value: this.ripples };
    for (const k of ['uTime', 'uSunDir', 'uSunColor', 'uSkyAmbient', 'uRain', 'uNight']) uniforms[k] = this.U[k];
    const m = new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: FRAG, lights: true, fog: true,
      defines: { RIVER: river ? 1 : 0, SSR_STEPS: 20 },
    });
    this.materials.push(m);
    return m;
  }
  setQuality(q) {
    const steps = q === 'high' ? 32 : q === 'low' ? 10 : 20;
    for (const m of this.materials) { if (m.defines.SSR_STEPS !== steps) { m.defines.SSR_STEPS = steps; m.needsUpdate = true; } }
  }
  bindTargets(colorTex, depthTex, w, h, camera, skyTex) {
    for (const m of this.materials) {
      const u = m.uniforms;
      u.tColor.value = colorTex; u.tDepth.value = depthTex; u.uResolution.value.set(w, h);
      u.uNear.value = camera.near; u.uFar.value = camera.far; u.tSky.value = skyTex;
    }
  }
  addRipple(x, z, strength = 1) {
    const r = this.ripples[this.rippleIdx];
    r.set(x, z, this.U.uTime.value, strength);
    this.rippleIdx = (this.rippleIdx + 1) % this.ripples.length;
  }
  buildPondGeometry() {
    const segA = 128, rings = [0, 0.2, 0.4, 0.6, 0.75, 0.88, 1.0, 1.1, 1.2, 1.32, 1.45];
    const pos = [], idx = [];
    const L = POND.level;
    for (let r = 0; r < rings.length; r++) {
      for (let a = 0; a < segA; a++) {
        const ang = (a / segA) * Math.PI * 2;
        const R = this.T.pondR(ang) * rings[r];
        pos.push(POND.x + Math.cos(ang) * R, L, POND.z + Math.sin(ang) * R);
        if (r === 0) break;
      }
    }
    // ring 0 is a single centre vertex
    for (let a = 0; a < segA; a++) idx.push(0, 1 + ((a + 1) % segA), 1 + a);
    for (let r = 1; r < rings.length - 1; r++) {
      const b0 = 1 + (r - 1) * segA, b1 = 1 + r * segA;
      for (let a = 0; a < segA; a++) {
        const a1 = (a + 1) % segA;
        idx.push(b0 + a, b0 + a1, b1 + a, b0 + a1, b1 + a1, b1 + a);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const n = pos.length / 3;
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('aFoam', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    g.setIndex(idx);
    // fix winding to face up
    g.computeBoundingSphere();
    return g;
  }
  buildRiverGeometry() {
    const T = this.T, P = T.river.pts, across = 11;
    const pos = [], flow = [], foam = [], idx = [], nrm = [];
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const L = T.riverLevel(p.s), w = T.riverHalfW(p.s) + 1.6, sp = T.riverSpeed(p.s);
      const nx = -p.tz, nz = p.tx;
      const fo = smoothstep(T.cascadeS0 - 3, T.cascadeS0, p.s) * smoothstep(T.cascadeS1 + 7, T.cascadeS1 + 1, p.s) + (p.s < T.cascadeS0 ? 0.25 : 0);
      for (let j = 0; j < across; j++) {
        const a = -1 + (2 * j) / (across - 1);
        pos.push(p.x + nx * a * w, L, p.z + nz * a * w);
        nrm.push(0, 1, 0);
        const f = sp * (1 - 0.55 * a * a);
        flow.push(p.tx * f, p.tz * f);
        foam.push(fo);
      }
    }
    for (let i = 0; i < P.length - 1; i++) for (let j = 0; j < across - 1; j++) {
      const a = i * across + j, b = a + 1, c = a + across, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
    g.setAttribute('aFoam', new THREE.Float32BufferAttribute(foam, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
}
