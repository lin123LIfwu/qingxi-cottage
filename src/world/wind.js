// Shared vegetation vertex animation (wind sway, flutter, player push, distance fade)
import * as THREE from 'three';
import { GLSL_NOISE } from '../util/glsl.js';
const NOFLIP = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');

export function patchVeg(mat, U, o = {}) {
  const amp = (o.amp ?? 0.15).toFixed(3), flutter = (o.flutter ?? 0).toFixed(3);
  const weight = o.attr ? o.attr : `clamp(position.y * ${(o.yScale ?? 1).toFixed(3)}, 0.0, 1.0)`;
  const key = JSON.stringify(o);
  mat.customProgramCacheKey = () => 'veg' + key;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind; sh.uniforms.uPlayerPos = U.uPlayerPos;
    sh.uniforms.uSunDir = U.uSunDir; sh.uniforms.uSunColor = U.uSunColor;
    if (o.occlude) { sh.uniforms.uFocus = U.uFocus; sh.uniforms.uOccR = U.uOccR; sh.uniforms.uOccK = U.uOccK; }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime; uniform vec2 uWind; uniform vec3 uPlayerPos;
${o.attr ? `attribute float ${o.attr};` : ''}
${o.mask ? 'attribute float aMask;' : ''}
varying vec3 vWP; varying float vH; varying float vTint;
${GLSL_NOISE}
vec3 windOffset(vec3 io, vec3 wp, float w){
  float ph = dot(io.xz, vec2(0.37, 0.23));
  float gust = vnoise(io.xz * 0.035 + uTime * vec2(0.11, 0.06));
  float s = sin(uTime * ${(o.freq ?? 1.1).toFixed(3)} + ph) * 0.55 + sin(uTime * ${((o.freq ?? 1.1) * 2.1).toFixed(3)} + ph * 1.7) * 0.2 + gust * 0.9;
  vec2 d = uWind * s * w * w * ${amp};
  vec3 f = vec3(sin(uTime * 7.0 + wp.y * 4.0 + wp.x * 3.0), 0.6 * sin(uTime * 6.0 + wp.x * 5.0), cos(uTime * 7.5 + wp.z * 4.0)) * ${flutter} * w * (0.4 + length(uWind));
  return vec3(d.x, 0.0, d.y) + f;
}`)
      .replace('#include <color_vertex>', o.mask ? `
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
vColor = vec4(1.0);
vColor.rgb *= color;
#ifdef USE_INSTANCING_COLOR
vColor.rgb = mix(vColor.rgb, vColor.rgb * instanceColor.rgb, aMask);
#endif
#endif` : '#include <color_vertex>')
      .replace('#include <project_vertex>', `
vec4 mvPosition = vec4(transformed, 1.0);
vec3 io = vec3(0.0);
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
io = instanceMatrix[3].xyz;
#endif
mvPosition = modelMatrix * mvPosition;
io = (modelMatrix * vec4(io, 1.0)).xyz;
float wgt = ${weight};
vH = wgt;
mvPosition.xyz += windOffset(io, mvPosition.xyz, wgt);
${o.push ? `{
  vec2 dp = mvPosition.xz - uPlayerPos.xz;
  float dl = length(dp);
  float pk = (1.0 - smoothstep(0.15, ${o.push.toFixed(2)}, dl)) * step(abs(mvPosition.y - uPlayerPos.y), 1.2);
  mvPosition.xz += dp / max(dl, 0.001) * pk * wgt * 0.32;
  mvPosition.y -= pk * wgt * 0.12;
}` : ''}
${o.fade ? `{
  float cd = distance(io.xz, cameraPosition.xz);
  float fk = smoothstep(${o.fade[0].toFixed(1)}, ${o.fade[1].toFixed(1)}, cd);
  mvPosition.y = mix(mvPosition.y, io.y - 0.05, fk);
}` : ''}
vTint = ${o.tint ? '(0.86 + 0.28 * fbm3(io.xz * 0.21)) * (0.92 + 0.16 * vnoise(io.xz * 1.7))' : '1.0'};
vWP = mvPosition.xyz;
mvPosition = viewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', `
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
vec4 worldPosition = vec4(vWP, 1.0);
#endif`);
    if (sh.fragmentShader.includes('#include <color_fragment>')) {
      if (o.noflip) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', NOFLIP);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform vec3 uSunDir; uniform vec3 uSunColor;
${o.occlude ? 'uniform vec3 uFocus; uniform float uOccR; uniform float uOccK;' : ''}
varying vec3 vWP; varying float vH; varying float vTint;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= vTint;
${o.occlude ? `{
  // dithered see-through for foliage between the camera and the player / very close to the camera
  vec3 seg = uFocus - cameraPosition; float L = length(seg); vec3 dr = seg / max(L, 1e-3);
  vec3 rel = vWP - cameraPosition; float tt = dot(rel, dr); float perp = length(rel - dr * tt);
  float occ = (1.0 - smoothstep(uOccR * 0.55, uOccR, perp)) * smoothstep(0.2, 0.8, tt) * (1.0 - smoothstep(L - 1.8, L - 0.7, tt));
  float nearK = 1.0 - smoothstep(1.4, 2.8, length(rel));
  float kk = max(occ * uOccK, nearK);
  float dth = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (kk > dth) discard;
}` : ''}`)
        .replace('#include <opaque_fragment>', `
{
  vec3 vd = normalize(vWP - cameraPosition);
  float bl = pow(max(dot(vd, uSunDir), 0.0), 5.0);
  outgoingLight += uSunColor * diffuseColor.rgb * bl * vH * ${(o.trans ?? 0.35).toFixed(3)};
}
#include <opaque_fragment>`);
    }
  };
  return mat;
}
