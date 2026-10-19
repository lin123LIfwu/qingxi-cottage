// Procedural "photo-like" material baking on the GPU.
// Every texture is generated at load time (no image assets): a full-screen base pass
// (tileable noise recipes) followed by thousands of instanced sprites (grass blades,
// pebbles, leaves, needles, clods …) that are depth-sorted by their own height, then a
// normal/AO pass derived from the height channel.
import * as THREE from 'three';
import { BAKE_LIB } from './bakeLib.js';
import { mulberry32 } from '../util/noise.js';

const COMMON = BAKE_LIB + /* glsl */`
uniform vec2 uRes;
vec3 srgb(vec3 c){ return pow(c, vec3(2.2)); }
float px(vec2 uv){ return hh(floor(uv * uRes)); }
`;

const VS_FULL = /* glsl */`
varying vec2 vUv;
void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// ------------------------------------------------------------------ base recipes
const FS_BASE = /* glsl */`
uniform int uKind;
varying vec2 vUv;
${COMMON}
vec4 kTurf(vec2 uv){
  float n1 = fbm2(uv, vec2(5.0), 5, 0.5);
  float n2 = fbm2(uv + 0.37, vec2(22.0), 4, 0.5);
  float g = px(uv);
  vec3 soil = srgb(vec3(0.19, 0.15, 0.10));
  vec3 grn = srgb(vec3(0.16, 0.23, 0.08));
  vec3 dead = srgb(vec3(0.33, 0.30, 0.17));
  vec3 c = mix(soil, grn, smoothstep(0.32, 0.62, n1));
  c = mix(c, dead, smoothstep(0.6, 0.8, n2) * 0.45);
  c *= (0.75 + 0.35 * g) * 0.8;
  return vec4(c, 0.04 + 0.08 * n2);
}
vec4 kDirt(vec2 uv){
  vec2 w = vec2(fbm2(uv, vec2(4.0), 4, 0.5), fbm2(uv + 5.2, vec2(4.0), 4, 0.5)) - 0.5;
  vec2 p = uv + w * 0.045;
  float n1 = fbm2(p, vec2(3.0), 5, 0.55);
  float n2 = fbm2(p + 1.3, vec2(14.0), 5, 0.5);
  float g = px(uv), g2 = hh(floor(uv * uRes * 0.5) + 7.0);
  vec3 lt = srgb(vec3(0.58, 0.49, 0.38)), md = srgb(vec3(0.47, 0.38, 0.28)), dk = srgb(vec3(0.33, 0.25, 0.18));
  vec3 c = mix(dk, md, smoothstep(0.25, 0.55, n1));
  c = mix(c, lt, smoothstep(0.55, 0.8, n1 + (n2 - 0.5) * 0.3));
  c *= (0.84 + 0.3 * n2) * (0.88 + 0.12 * g + 0.08 * g2);
  vec4 v = vor(p * 9.0, vec2(9.0), 1.0);
  float crack = (1.0 - smoothstep(0.0, 0.035, v.y - v.x)) * smoothstep(0.45, 0.7, fbm2(uv + 9.1, vec2(6.0), 3, 0.5));
  c *= 1.0 - crack * 0.5;
  return vec4(c, 0.25 + 0.15 * n1 + 0.12 * n2 + 0.04 * g - crack * 0.15);
}
vec4 kTilled(vec2 uv){
  float n1 = fbm2(uv, vec2(4.0), 5, 0.55), n2 = fbm2(uv + 2.7, vec2(18.0), 4, 0.5);
  float g = px(uv);
  vec3 a = srgb(vec3(0.33, 0.24, 0.16)), b = srgb(vec3(0.21, 0.15, 0.10));
  vec3 c = mix(b, a, n1) * (0.85 + 0.25 * n2) * (0.85 + 0.2 * g);
  return vec4(c, 0.18 + 0.2 * n1 + 0.1 * n2 + 0.03 * g);
}
vec4 kGravel(vec2 uv){
  float n1 = fbm2(uv, vec2(4.0), 5, 0.5), n2 = fbm2(uv + 3.3, vec2(24.0), 4, 0.5);
  float g = px(uv), g2 = hh(floor(uv * uRes * 0.5) + 2.0);
  vec3 a = srgb(vec3(0.64, 0.58, 0.47)), b = srgb(vec3(0.50, 0.45, 0.36));
  vec3 c = mix(b, a, n1) * (0.86 + 0.22 * n2) * (0.82 + 0.2 * g + 0.1 * g2);
  return vec4(c, 0.12 + 0.1 * n1 + 0.05 * g);
}
vec4 kRock(vec2 uv){
  vec2 w = vec2(fbm2(uv, vec2(2.0), 5, 0.5), fbm2(uv + 4.1, vec2(2.0), 5, 0.5)) - 0.5;
  vec2 p = uv + w * 0.16;
  float n = fbm2(p, vec2(2.0), 7, 0.55);
  float n2 = fbm2(p + 2.3, vec2(8.0), 5, 0.5);
  float n3 = fbm2(p + 6.1, vec2(32.0), 3, 0.5);
  vec4 v = vor(p * 4.0, vec2(4.0), 1.0);
  float crack = (1.0 - smoothstep(0.0, 0.025, v.y - v.x)) * smoothstep(0.38, 0.6, fbm2(uv + 9.3, vec2(5.0), 4, 0.5));
  vec4 v2 = vor(p * 11.0 + 0.5, vec2(11.0), 1.0);
  float crack2 = (1.0 - smoothstep(0.0, 0.018, v2.y - v2.x)) * smoothstep(0.52, 0.7, n2);
  float strata = gn(vec2(p.x * 2.0, p.y * 22.0 + n * 6.0), vec2(2.0, 22.0));
  float g = px(uv);
  vec3 c1 = srgb(vec3(0.41, 0.40, 0.38)), c2 = srgb(vec3(0.57, 0.55, 0.51)), c3 = srgb(vec3(0.49, 0.44, 0.37)), c4 = srgb(vec3(0.31, 0.31, 0.31));
  vec3 c = mix(c1, c2, smoothstep(0.3, 0.7, n));
  c = mix(c, c3, smoothstep(0.5, 0.8, n2) * 0.5);
  c = mix(c, c4, smoothstep(0.6, 0.85, fbm2(p + 5.5, vec2(3.0), 4, 0.5)) * 0.45);
  float sp = hh(floor(uv * uRes * 0.5) + 1.3), sp2 = hh(floor(uv * uRes * 0.25) + 4.1);
  c *= (0.84 + 0.3 * n3) * (0.88 + 0.2 * g) * (0.94 + 0.12 * strata) * (0.9 + 0.2 * sp * sp2);
  c = mix(c, c4 * 0.6, step(0.985, sp) * 0.6);
  float lich = smoothstep(0.67, 0.72, fbm2(uv + 7.7, vec2(16.0), 4, 0.5)) * (1.0 - crack);
  c = mix(c, srgb(vec3(0.63, 0.64, 0.56)), lich * 0.4);
  float lich2 = smoothstep(0.7, 0.74, fbm2(uv + 1.1, vec2(24.0), 3, 0.5)) * (1.0 - crack);
  c = mix(c, srgb(vec3(0.70, 0.63, 0.38)), lich2 * 0.35);
  float h = 0.42 + 0.3 * n + 0.14 * n2 + 0.08 * n3 + 0.04 * strata - 0.3 * crack - 0.14 * crack2;
  float moss = smoothstep(0.4, 0.26, h) * smoothstep(0.4, 0.65, fbm2(uv + 3.3, vec2(8.0), 4, 0.5));
  c = mix(c, srgb(vec3(0.29, 0.34, 0.15)), moss * 0.7);
  c *= 1.0 - 0.6 * crack - 0.35 * crack2;
  return vec4(c, clamp(h, 0.0, 1.0));
}
vec4 kForest(vec2 uv){
  float n1 = fbm2(uv, vec2(4.0), 5, 0.5), n2 = fbm2(uv + 1.9, vec2(16.0), 4, 0.5);
  float g = px(uv);
  vec3 hu = srgb(vec3(0.24, 0.18, 0.12)), dk = srgb(vec3(0.13, 0.10, 0.07));
  vec3 c = mix(dk, hu, n1) * (0.85 + 0.3 * n2) * (0.9 + 0.15 * g);
  return vec4(c, 0.08 + 0.1 * n1);
}
// ---- bark (u = around the trunk 0.6 m, v = along the trunk 1.2 m)
vec4 kOak(vec2 uv){
  float w1 = fbm2(uv, vec2(3.0, 2.0), 4, 0.5);
  float w2 = fbm2(uv + 2.2, vec2(6.0, 3.0), 3, 0.5);
  float x = uv.x * 10.0 + (w1 - 0.5) * 4.0 + (w2 - 0.5) * 1.6;
  float s = abs(sin(3.14159265 * x));
  float cI = mod(floor(x), 10.0);
  float yy = uv.y * 6.0 + hh(vec2(cI, 1.0)) * 3.0 + (w2 - 0.5) * 0.4;
  float fy = fract(yy), cy = mod(floor(yy), 6.0);
  float hc = (smoothstep(0.07, 0.0, fy) + smoothstep(0.93, 1.0, fy)) * step(0.35, hh(vec2(cI, cy) + 3.0));
  float fib = gn(vec2(uv.x * 64.0, uv.y * 4.0), vec2(64.0, 4.0));
  float plate = fbm2(uv + vec2(cI, cy) * 0.17, vec2(12.0, 6.0), 4, 0.5);
  float g = px(uv);
  float grain = fbm2(uv + 7.7, vec2(24.0, 10.0), 4, 0.55);
  float sR = clamp(s + (grain - 0.5) * 0.45 + (fib - 0.5) * 0.12, 0.0, 1.0);
  float rh = smoothstep(0.06, 0.62, sR);
  float h = rh * (0.5 + 0.25 * plate + 0.15 * fib + 0.12 * grain) * (1.0 - 0.7 * hc) + 0.05 * g;
  vec3 hi = srgb(vec3(0.50, 0.47, 0.43)), md = srgb(vec3(0.34, 0.30, 0.26)), lo = srgb(vec3(0.10, 0.085, 0.07));
  vec3 c = mix(lo, mix(md, hi, plate * smoothstep(0.3, 0.95, sR)), smoothstep(0.06, 0.4, h));
  c *= (0.78 + 0.3 * g) * (0.88 + 0.24 * fib) * (0.8 + 0.4 * grain);
  float lich = smoothstep(0.6, 0.72, fbm2(uv + 5.5, vec2(6.0, 4.0), 4, 0.5)) * smoothstep(0.3, 0.55, h);
  c = mix(c, srgb(vec3(0.56, 0.59, 0.49)), lich * 0.45);
  float moss = smoothstep(0.62, 0.76, fbm2(uv + 1.5, vec2(3.0, 2.0), 4, 0.5));
  c = mix(c, srgb(vec3(0.26, 0.31, 0.13)), moss * 0.4);
  return vec4(c, h);
}
vec4 kBirch(vec2 uv){
  float band = fbm2(uv, vec2(2.0, 24.0), 4, 0.5);
  float n2 = fbm2(uv + 1.1, vec2(6.0, 8.0), 4, 0.5);
  vec3 wh = srgb(vec3(0.87, 0.86, 0.81)), cr = srgb(vec3(0.80, 0.76, 0.68)), gr = srgb(vec3(0.60, 0.60, 0.58));
  vec3 c = mix(wh, cr, smoothstep(0.4, 0.72, band));
  c = mix(c, gr, smoothstep(0.55, 0.82, n2) * 0.55);
  float strip = smoothstep(0.7, 0.78, fbm2(uv + 4.4, vec2(3.0, 40.0), 3, 0.5));
  c = mix(c, srgb(vec3(0.80, 0.64, 0.50)), strip * 0.35);
  vec4 v = vor(vec2(uv.x * 3.0, uv.y * 10.0), vec2(3.0, 10.0), 1.0);
  float pm = step(0.8, hh(v.zw)) * smoothstep(0.34, 0.18, v.x + (n2 - 0.5) * 0.35 + (fbm2(uv + 2.9, vec2(12.0, 20.0), 3, 0.5) - 0.5) * 0.2);
  float rough = fbm2(uv + 8.0, vec2(16.0, 6.0), 3, 0.5);
  c = mix(c, srgb(vec3(0.11, 0.10, 0.09)) * (0.7 + 0.6 * rough), pm);
  c *= 0.93 + 0.1 * px(uv);
  return vec4(c, 0.5 + 0.08 * band + 0.06 * strip - pm * (0.25 + 0.2 * rough));
}
vec4 kSpruce(vec2 uv){
  vec2 w = vec2(fbm2(uv, vec2(4.0), 3, 0.5), fbm2(uv + 2.0, vec2(4.0), 3, 0.5)) - 0.5;
  vec2 p = uv + w * 0.05;
  vec4 v = vor(vec2(p.x * 16.0, p.y * 14.0), vec2(16.0, 14.0), 0.95);
  float gap = 1.0 - smoothstep(0.0, 0.09, v.y - v.x);
  float tone = hh(v.zw);
  float n = fbm2(p, vec2(10.0), 4, 0.5);
  vec3 a = srgb(vec3(0.43, 0.34, 0.28)), b = srgb(vec3(0.30, 0.24, 0.20)), gr = srgb(vec3(0.47, 0.45, 0.42));
  vec3 c = mix(a, b, tone);
  c = mix(c, gr, smoothstep(0.35, 0.75, n) * 0.7);
  c *= 0.85 + 0.25 * px(uv);
  c = mix(c, srgb(vec3(0.08, 0.06, 0.05)), gap * 0.85);
  return vec4(c, (1.0 - gap) * (0.5 + 0.3 * n + 0.2 * (1.0 - v.x)));
}
vec4 kFruit(vec2 uv){
  float band = fbm2(uv, vec2(3.0, 16.0), 4, 0.5);
  float n = fbm2(uv + 1.7, vec2(6.0, 6.0), 5, 0.5);
  vec4 v = vor(vec2(uv.x * 10.0, uv.y * 7.0), vec2(10.0, 7.0), 0.9);
  float cr = (1.0 - smoothstep(0.0, 0.08, v.y - v.x)) * smoothstep(0.45, 0.68, n);
  vec3 a = srgb(vec3(0.40, 0.32, 0.27)), b = srgb(vec3(0.27, 0.20, 0.17)), gr = srgb(vec3(0.46, 0.44, 0.41));
  vec3 c = mix(b, a, band);
  c = mix(c, gr, smoothstep(0.55, 0.8, n) * 0.5);
  c *= (0.88 + 0.2 * px(uv)) * (1.0 - cr * 0.6);
  return vec4(c, 0.5 + 0.2 * band + 0.1 * n - 0.3 * cr);
}
void main(){
  vec4 r;
  if (uKind == 0) r = kTurf(vUv);
  else if (uKind == 1) r = kDirt(vUv);
  else if (uKind == 2) r = kTilled(vUv);
  else if (uKind == 3) r = kGravel(vUv);
  else if (uKind == 4) r = kRock(vUv);
  else if (uKind == 5) r = kForest(vUv);
  else if (uKind == 6) r = kOak(vUv);
  else if (uKind == 7) r = kBirch(vUv);
  else if (uKind == 8) r = kSpruce(vUv);
  else r = kFruit(vUv);
  float h = clamp(r.a + (px(vUv + 0.5) - 0.5) / 255.0, 0.0, 1.0);
  gl_FragColor = vec4(max(r.rgb, vec3(0.0)), h);
  gl_FragDepth = 1.0 - h * 0.998;
}`;

// ------------------------------------------------------------------ sprites
const VS_SPRITE = /* glsl */`
attribute vec4 a0; attribute vec4 a1; attribute vec4 a2;
uniform vec2 uAspect;
varying vec2 vQ; varying vec4 vA1; varying vec4 vA2; varying vec2 vUv;
void main(){
  vQ = position.xy;
  float c = cos(a1.x), s = sin(a1.x);
  vec2 lp = position.xy * a0.zw;
  vec2 d = vec2(c * lp.x - s * lp.y, s * lp.x + c * lp.y) * uAspect;
  vec2 p = a0.xy + d;
  vUv = p; vA1 = a1; vA2 = a2;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const FS_SPRITE = /* glsl */`
varying vec2 vQ; varying vec4 vA1; varying vec4 vA2; varying vec2 vUv;
${COMMON}
float rs(float k){ return fract(sin(vA2.w * 12.9898 + k * 78.233) * 43758.5453); }
void main(){
  int type = int(vA1.y + 0.5);
  vec2 q = vQ;
  float h0 = vA1.z, hs = vA1.w;
  vec3 col = vA2.rgb;
  float g = px(vUv);
  float h = h0; bool keep = false;
  if (type == 0) {            // grass blade: base at q.x = -1, tip at +1
    float t = q.x * 0.5 + 0.5;
    float y = q.y - (rs(1.0) - 0.5) * 1.4 * t * t;
    float hw = 1.0 - pow(t, 2.2) * 0.94;
    float e = abs(y) / hw;
    keep = e < 1.0;
    col *= (0.5 + 0.5 * t) * (0.9 + 0.2 * g) * (1.0 + 0.14 * (1.0 - e));
    col = mix(col, col * vec3(1.3, 1.15, 0.6), smoothstep(0.7, 1.0, t) * rs(2.0) * 0.8);
    h = h0 + hs * (0.25 + 0.75 * t) + 0.06 * hs * (1.0 - e * e);
  } else if (type == 1 || type == 4) {   // pebble / soil clod
    float a = atan(q.y, q.x);
    float rr = 0.84 + 0.07 * sin(2.0 * a + rs(1.0) * 6.283) + 0.05 * sin(3.0 * a + rs(2.0) * 6.283) + 0.03 * sin(5.0 * a + rs(3.0) * 6.283);
    if (type == 4) rr += 0.05 * sin(7.0 * a + rs(4.0) * 6.283) + 0.07 * (g - 0.5);
    float d = length(q) / rr;
    keep = d < 1.0;
    float dome = sqrt(max(1.0 - d * d, 0.0));
    if (type == 1) {
      float sp = hh(floor(vUv * uRes * 0.5) + vA2.w);
      col *= (0.84 + 0.28 * g) * (0.9 + 0.16 * sp);
      float va = rs(5.0) * 6.283;
      float vein = 1.0 - smoothstep(0.0, 0.07, abs(q.x * cos(va) + q.y * sin(va) + (rs(6.0) - 0.5)));
      col = mix(col, vec3(0.72, 0.70, 0.66), vein * step(0.72, rs(7.0)) * 0.6);
      col *= 0.72 + 0.28 * smoothstep(0.0, 0.6, dome);
      h = h0 + hs * pow(dome, 0.7);
    } else {
      col *= (0.74 + 0.36 * g) * (0.68 + 0.36 * dome);
      h = h0 + hs * dome * (0.85 + 0.15 * g);
    }
  } else if (type == 2) {     // fallen leaf, stem at q.x = -1
    float t = q.x * 0.5 + 0.5;
    float lobed = step(0.5, rs(1.0));
    float w = pow(max(sin(3.14159 * clamp(t * 0.92 + 0.04, 0.0, 1.0)), 0.0), 0.8);
    w *= 1.0 - lobed * 0.32 * abs(sin(t * 3.14159 * (4.0 + floor(rs(2.0) * 3.0))));
    float y = q.y - (rs(3.0) - 0.5) * 0.3 * t;
    float e = abs(y) / max(w, 1e-3);
    bool stem = t < 0.12 && abs(q.y) < 0.06;
    keep = (e < 1.0 && t > 0.06) || stem;
    float rib = 1.0 - smoothstep(0.0, 0.05, abs(y));
    float veins = 1.0 - smoothstep(0.0, 0.08, abs(fract(t * 6.0 - abs(y) * 1.5) - 0.5));
    col *= (0.85 + 0.25 * e) * (0.9 + 0.15 * g);
    col *= 1.0 - 0.25 * rib - 0.1 * veins * (1.0 - e);
    float bl = smoothstep(0.55, 0.78, hh(floor(vUv * uRes * 0.25) + vA2.w));
    col *= 1.0 - 0.25 * bl;
    if (stem) col = vA2.rgb * 0.6;
    h = h0 + hs * (0.4 + 0.6 * e * e);
  } else if (type == 3) {     // needle / twig / straw
    float t = q.x * 0.5 + 0.5;
    float tap = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.9, t);
    keep = abs(q.y) < max(tap, 0.2);
    float cc = sqrt(max(1.0 - q.y * q.y, 0.0));
    col *= (0.75 + 0.3 * cc) * (0.9 + 0.15 * g);
    h = h0 + hs * cc;
  } else if (type == 5) {     // moss cushion
    float d = length(q);
    float fz = hh(floor(vUv * uRes) + 3.0);
    keep = d < 0.7 + 0.3 * fz;
    col *= (0.65 + 0.5 * fz) * (1.0 - 0.3 * d);
    h = h0 + hs * (1.0 - d) * (0.6 + 0.4 * fz);
  } else if (type == 6) {     // clover: three notched leaflets
    float best = 9.0;
    for (int k = 0; k < 3; k++) {
      float a = float(k) * 2.0944;
      vec2 dir = vec2(cos(a), sin(a));
      vec2 l = vec2(dot(q, dir), dot(q, vec2(-dir.y, dir.x)));
      float d = length((l - vec2(0.5, 0.0)) * vec2(1.1, 0.95)) / 0.48;
      d += smoothstep(0.12, 0.0, abs(l.y)) * smoothstep(0.72, 0.98, l.x) * 0.6;
      best = min(best, d);
    }
    keep = best < 1.0;
    float chev = smoothstep(0.06, 0.0, abs(best - 0.55));
    col *= (0.85 + 0.2 * g) * (0.8 + 0.25 * (1.0 - best));
    col = mix(col, col * 2.2 + 0.02, chev * 0.35);
    h = h0 + hs * (1.0 - best * best);
  } else {                    // 7: lenticel / dash
    float d = length(q);
    keep = d < 1.0;
    col *= 0.85 + 0.25 * g;
    h = h0 + hs * (1.0 - d);
  }
  if (!keep) discard;
  h = clamp(h, 0.0, 1.0);
  gl_FragColor = vec4(max(col, vec3(0.0)), h);
  gl_FragDepth = 1.0 - h * 0.998;
}`;

// ------------------------------------------------------------------ normal / AO
const FS_NORMAL = /* glsl */`
#ifdef ARRAY
uniform sampler2DArray tSrc; uniform float uLayer;
float H(vec2 uv){ return textureLod(tSrc, vec3(uv, uLayer), 0.0).a; }
float HB(vec2 uv, float l){ return textureLod(tSrc, vec3(uv, uLayer), l).a; }
#else
uniform sampler2D tSrc;
float H(vec2 uv){ return textureLod(tSrc, uv, 0.0).a; }
float HB(vec2 uv, float l){ return textureLod(tSrc, uv, l).a; }
#endif
uniform vec2 uTexel; uniform float uStrength; uniform float uAO;
varying vec2 vUv;
void main(){
  vec2 e = uTexel;
  float tl = H(vUv + vec2(-e.x, e.y)), t = H(vUv + vec2(0.0, e.y)), tr = H(vUv + e);
  float l = H(vUv - vec2(e.x, 0.0)), r = H(vUv + vec2(e.x, 0.0));
  float bl = H(vUv - e), b = H(vUv - vec2(0.0, e.y)), br = H(vUv + vec2(e.x, -e.y));
  float dx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
  float dy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
  vec3 n = normalize(vec3(-dx * uStrength, -dy * uStrength, 8.0));
  float h = H(vUv);
  float hb = HB(vUv, 2.0) * 0.4 + HB(vUv, 4.0) * 0.6;
  float ao = clamp(1.0 - max(hb - h, 0.0) * uAO, 0.3, 1.0);
  gl_FragColor = vec4(n * 0.5 + 0.5, ao);
}`;

// ------------------------------------------------------------------ sprite lists
class Sprites {
  constructor(aspect = 1) { this.a0 = []; this.a1 = []; this.a2 = []; this.aspect = aspect; }
  // x,y in [0,1]; sx,sy half extents in u-units; col = THREE.Color (linear)
  add(x, y, sx, sy, rot, type, h0, hs, col, seed) {
    const ext = Math.hypot(sx, sy), ey = ext * this.aspect;
    const xs = [0], ys = [0];
    if (x - ext < 0) xs.push(1); if (x + ext > 1) xs.push(-1);
    if (y - ey < 0) ys.push(1); if (y + ey > 1) ys.push(-1);
    for (const dx of xs) for (const dy of ys) {
      this.a0.push(x + dx, y + dy, sx, sy);
      this.a1.push(rot, type, h0, hs);
      this.a2.push(col.r, col.g, col.b, seed);
    }
  }
  get count() { return this.a0.length / 4; }
}
const _hsl = { h: 0, s: 0, l: 0 };
// sRGB hex palette entry with brightness / hue jitter -> linear THREE.Color
function pick(R, list, jl = 0.12, jh = 0.0) {
  let tot = 0; for (const e of list) tot += e[1];
  let r = R() * tot, hex = list[0][0];
  for (const e of list) { r -= e[1]; if (r <= 0) { hex = e[0]; break; } }
  const c = new THREE.Color(hex);
  if (jh) { c.getHSL(_hsl); c.setHSL(_hsl.h + (R() - 0.5) * jh, _hsl.s, _hsl.l); }
  return c.multiplyScalar(1 + (R() - 0.5) * 2 * jl);
}

function turfSprites(R) {
  const S = new Sprites();
  const greens = [['#55772e', 3], ['#4a6b28', 3], ['#647f33', 2], ['#3d5a22', 2], ['#71883a', 1.2], ['#7d8a3f', 0.6]];
  const dry = [['#9a8c58', 1], ['#a89a68', 1], ['#857a4a', 1]];
  // clumped blades: tufts give the lawn its natural irregular texture
  const tufts = [];
  for (let i = 0; i < 900; i++) tufts.push([R(), R(), 0.006 + R() * 0.02]);
  for (let i = 0; i < 24000; i++) {
    let x, y;
    if (R() < 0.7) { const t = tufts[Math.floor(R() * tufts.length)]; const a = R() * 6.283, d = Math.sqrt(R()) * t[2]; x = t[0] + Math.cos(a) * d; y = t[1] + Math.sin(a) * d; }
    else { x = R(); y = R(); }
    x = ((x % 1) + 1) % 1; y = ((y % 1) + 1) % 1;
    const len = 0.016 + R() * 0.03, w = 0.0011 + R() * 0.0012;
    const rot = R() * 6.283;
    const isDry = R() < 0.07;
    const c = pick(R, isDry ? dry : greens, 0.14);
    S.add(x + Math.cos(rot) * len, y + Math.sin(rot) * len, len, w, rot, 0, 0.08 + R() * 0.25, 0.3 + R() * 0.4, c, R() * 100);
  }
  // clover patches
  for (let k = 0; k < 10; k++) {
    const cx = R(), cy = R(), rad = 0.03 + R() * 0.05;
    const n = 25 + Math.floor(R() * 45);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.283, d = Math.sqrt(R()) * rad, s = 0.006 + R() * 0.004;
      S.add((cx + Math.cos(a) * d + 1) % 1, (cy + Math.sin(a) * d + 1) % 1, s, s, R() * 6.283, 6, 0.2 + R() * 0.3, 0.25, pick(R, [['#3f6a2a', 1], ['#4b7631', 1]], 0.12), R() * 100);
    }
  }
  return S;
}
function dirtSprites(R) {
  const S = new Sprites();
  const stones = [['#857a6c', 2], ['#968a78', 2], ['#6e665c', 1.5], ['#a29580', 1], ['#5f574e', 1], ['#8a7660', 1]];
  const bands = [[150, 0.006, 0.011, 0.3], [1300, 0.0025, 0.005, 0.22], [3000, 0.001, 0.002, 0.14]];
  for (const [n, s0, s1, hs] of bands) for (let i = 0; i < n; i++) {
    const s = s0 + R() * (s1 - s0);
    S.add(R(), R(), s * (0.8 + R() * 0.4), s, R() * 6.283, 1, 0.25 + R() * 0.15, hs * (0.7 + R() * 0.6), pick(R, stones, 0.15), R() * 100);
  }
  for (let i = 0; i < 90; i++) { const l = 0.008 + R() * 0.016; S.add(R(), R(), l, 0.0007, R() * 6.283, 3, 0.4, 0.1, pick(R, [['#a89466', 1], ['#8c7a52', 1]], 0.15), R() * 100); }
  for (let i = 0; i < 40; i++) { const l = 0.008 + R() * 0.008; S.add(R(), R(), l, l * 0.6, R() * 6.283, 2, 0.45 + R() * 0.2, 0.1, pick(R, [['#7a5a35', 1], ['#95703f', 1], ['#5e4a33', 1]], 0.12), R() * 100); }
  return S;
}
function tilledSprites(R) {
  const S = new Sprites();
  const soil = [['#4d3828', 2], ['#413023', 2], ['#5a4331', 1.5], ['#37281d', 1]];
  for (let i = 0; i < 1500; i++) { const s = 0.008 + R() * 0.014; S.add(R(), R(), s * (0.8 + R() * 0.5), s, R() * 6.283, 4, 0.2 + R() * 0.2, 0.35 + R() * 0.3, pick(R, soil, 0.15), R() * 100); }
  for (let i = 0; i < 7000; i++) { const s = 0.002 + R() * 0.004; S.add(R(), R(), s, s * (0.7 + R() * 0.5), R() * 6.283, 4, 0.25 + R() * 0.3, 0.22, pick(R, soil, 0.14), R() * 100); }
  for (let i = 0; i < 60; i++) { const l = 0.01 + R() * 0.02; S.add(R(), R(), l, 0.0011, R() * 6.283, 3, 0.55, 0.12, pick(R, [['#c2ad78', 1], ['#a8925e', 1]], 0.12), R() * 100); }
  for (let i = 0; i < 30; i++) { const s = 0.003 + R() * 0.004; S.add(R(), R(), s, s, R() * 6.283, 1, 0.4, 0.25, pick(R, [['#8a8278', 1], ['#a09484', 1]], 0.12), R() * 100); }
  return S;
}
function gravelSprites(R) {
  const S = new Sprites();
  const stones = [['#8e8c87', 3], ['#5f5d5a', 2], ['#a39886', 2], ['#7d6c5a', 1.5], ['#8f6f5c', 1], ['#c9c3b8', 0.8], ['#6f7568', 1], ['#b3a58c', 1.5]];
  const bands = [[70, 0.012, 0.024, 0.5], [700, 0.006, 0.012, 0.4], [3600, 0.003, 0.006, 0.3], [6000, 0.0012, 0.003, 0.2]];
  for (const [n, s0, s1, hs] of bands) for (let i = 0; i < n; i++) {
    const s = s0 + R() * (s1 - s0);
    S.add(R(), R(), s * (0.75 + R() * 0.5), s, R() * 6.283, 1, 0.12 + R() * 0.15, hs * (0.7 + R() * 0.6), pick(R, stones, 0.14), R() * 100);
  }
  return S;
}
function forestSprites(R) {
  const S = new Sprites();
  const leaves = [['#6b4c32', 3], ['#87653f', 2], ['#4a3424', 2], ['#8f5a30', 0.8], ['#675a46', 1.2], ['#97804c', 0.8], ['#55452c', 1.5]];
  for (let i = 0; i < 4000; i++) {
    const l = 0.011 + R() * 0.014;
    S.add(R(), R(), l, l * (0.5 + R() * 0.25), R() * 6.283, 2, 0.15 + R() * 0.65, 0.12, pick(R, leaves, 0.15), R() * 100);
  }
  for (let i = 0; i < 2600; i++) { const l = 0.006 + R() * 0.006; S.add(R(), R(), l, 0.0006, R() * 6.283, 3, 0.1 + R() * 0.8, 0.06, pick(R, [['#8a5d36', 2], ['#a06e3e', 1], ['#6b4a2e', 1]], 0.15), R() * 100); }
  for (let i = 0; i < 120; i++) { const l = 0.02 + R() * 0.05; S.add(R(), R(), l, 0.0016 + R() * 0.0016, R() * 6.283, 3, 0.5 + R() * 0.4, 0.15, pick(R, [['#4f4032', 1], ['#5f5244', 1], ['#3d3128', 1]], 0.1), R() * 100); }
  for (let k = 0; k < 40; k++) {
    const cx = R(), cy = R(), rad = 0.02 + R() * 0.04, n = 10 + Math.floor(R() * 20);
    const base = pick(R, [['#4c5c26', 1], ['#56682b', 1], ['#425020', 1]], 0.1);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.283, d = Math.sqrt(R()) * rad, s = 0.006 + R() * 0.01;
      S.add((cx + Math.cos(a) * d + 1) % 1, (cy + Math.sin(a) * d + 1) % 1, s, s, 0, 5, 0.5 + R() * 0.2, 0.2, base.clone().multiplyScalar(0.85 + R() * 0.3), R() * 100);
    }
  }
  for (let i = 0; i < 40; i++) { const s = 0.006 + R() * 0.004; S.add(R(), R(), s, s, R() * 6.283, 6, 0.55 + R() * 0.3, 0.2, pick(R, [['#3c5f27', 1], ['#46692b', 1]], 0.1), R() * 100); }
  return S;
}
function lenticelSprites(R, n, l0, l1, w, palette, aspect) {
  const S = new Sprites(aspect);
  for (let i = 0; i < n; i++) { const l = l0 + R() * (l1 - l0); S.add(R(), R(), l, w * (0.7 + R() * 0.6), (R() - 0.5) * 0.08, 7, 0.55, 0.15, pick(R, palette, 0.15), R() * 100); }
  return S;
}

// ------------------------------------------------------------------ painter
export const GROUND_LAYERS = { turf: 0, dirt: 1, tilled: 2, gravel: 3, rock: 4, forest: 5 };
export const GROUND_TILE = [1.6, 2.5, 1.5, 2.4, 4.0, 2.2];
const GROUND_SPEC = [
  { kind: 0, sprites: turfSprites, strength: 2.2, ao: 2.2 },
  { kind: 1, sprites: dirtSprites, strength: 3.0, ao: 2.5 },
  { kind: 2, sprites: tilledSprites, strength: 3.4, ao: 2.4 },
  { kind: 3, sprites: gravelSprites, strength: 3.4, ao: 2.6 },
  { kind: 4, sprites: null, strength: 2.6, ao: 1.8 },
  { kind: 5, sprites: forestSprites, strength: 2.6, ao: 2.0 },
];
const BARK_SPEC = {
  oak: { kind: 6, strength: 3.2, sprites: null },
  birch: { kind: 7, strength: 1.6, sprites: (R) => lenticelSprites(R, 900, 0.01, 0.035, 0.0022, [['#3b3430', 2], ['#2a2522', 1], ['#57483c', 1]], 0.5) },
  spruce: { kind: 8, strength: 3.0, sprites: null },
  fruit: { kind: 9, strength: 2.0, sprites: (R) => lenticelSprites(R, 520, 0.006, 0.02, 0.0016, [['#9a7a5c', 2], ['#7d6450', 1]], 0.5) },
};

export const TEX = { ready: false };

export function bakeTextures(renderer, opts = {}) {
  const t0 = performance.now();
  const r = renderer;
  const GS = opts.groundSize || 1024;
  const prev = { rt: r.getRenderTarget(), auto: r.autoClear, cc: r.getClearColor(new THREE.Color()), ca: r.getClearAlpha() };
  r.autoClear = false;
  const cam = new THREE.Camera();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const baseMat = new THREE.ShaderMaterial({
    uniforms: { uKind: { value: 0 }, uSeed: { value: 0 }, uRes: { value: new THREE.Vector2() } },
    vertexShader: VS_FULL, fragmentShader: FS_BASE, depthTest: true, depthWrite: true,
  });
  const spriteMat = new THREE.ShaderMaterial({
    uniforms: { uSeed: { value: 0 }, uRes: { value: new THREE.Vector2() }, uAspect: { value: new THREE.Vector2(1, 1) } },
    vertexShader: VS_SPRITE, fragmentShader: FS_SPRITE, depthTest: true, depthWrite: true, side: THREE.DoubleSide,
  });
  const mkNormMat = (array) => new THREE.ShaderMaterial({
    defines: array ? { ARRAY: '' } : {},
    uniforms: { tSrc: { value: null }, uLayer: { value: 0 }, uTexel: { value: new THREE.Vector2() }, uStrength: { value: 1 }, uAO: { value: 1 } },
    vertexShader: VS_FULL, fragmentShader: FS_NORMAL, depthTest: false, depthWrite: false,
  });
  const normArr = mkNormMat(true), norm2D = mkNormMat(false);
  const aniso = Math.min(8, r.capabilities.getMaxAnisotropy());
  const setupTex = (t, srgb) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false; t.anisotropy = aniso;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  };
  const sprGeo = (S) => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('a0', new THREE.InstancedBufferAttribute(new Float32Array(S.a0), 4));
    g.setAttribute('a1', new THREE.InstancedBufferAttribute(new Float32Array(S.a1), 4));
    g.setAttribute('a2', new THREE.InstancedBufferAttribute(new Float32Array(S.a2), 4));
    g.instanceCount = S.count;
    return g;
  };
  const paint = (rt, layer, kind, S, seed, W, H, last) => {
    r.setRenderTarget(rt, layer);
    r.setClearColor(0x000000, 0); r.clear(true, true, false);
    baseMat.uniforms.uKind.value = kind; baseMat.uniforms.uSeed.value = seed; baseMat.uniforms.uRes.value.set(W, H);
    rt.texture.generateMipmaps = last && !S;
    quad.material = baseMat; r.render(quad, cam);
    if (S && S.count) {
      const g = sprGeo(S);
      const m = new THREE.Mesh(g, spriteMat); m.frustumCulled = false;
      spriteMat.uniforms.uSeed.value = seed + 0.5; spriteMat.uniforms.uRes.value.set(W, H);
      spriteMat.uniforms.uAspect.value.set(1, S.aspect);
      rt.texture.generateMipmaps = last;
      r.render(m, cam);
      g.dispose();
    }
  };
  const normal = (src, dst, layer, W, H, strength, ao, last) => {
    const m = layer >= 0 ? normArr : norm2D;
    m.uniforms.tSrc.value = src.texture; m.uniforms.uLayer.value = Math.max(layer, 0);
    m.uniforms.uTexel.value.set(1 / W, 1 / H); m.uniforms.uStrength.value = strength; m.uniforms.uAO.value = ao;
    r.setRenderTarget(dst, Math.max(layer, 0));
    dst.texture.generateMipmaps = last;
    quad.material = m; r.render(quad, cam);
  };

  // ---------------- ground array
  const NL = GROUND_SPEC.length;
  const gC = new THREE.WebGLArrayRenderTarget(GS, GS, NL, { depthBuffer: true, type: THREE.UnsignedByteType });
  const gN = new THREE.WebGLArrayRenderTarget(GS, GS, NL, { depthBuffer: false, type: THREE.UnsignedByteType });
  setupTex(gC.texture, true); setupTex(gN.texture, false);
  GROUND_SPEC.forEach((sp, i) => {
    const R = mulberry32(1000 + i * 77);
    const S = sp.sprites ? sp.sprites(R) : null;
    paint(gC, i, sp.kind, S, 3.7 + i * 1.31, GS, GS, i === NL - 1);
  });
  GROUND_SPEC.forEach((sp, i) => normal(gC, gN, i, GS, GS, sp.strength * GS / 1024, sp.ao, i === NL - 1));

  // ---------------- bark (2D targets)
  const bark = {};
  const BW = opts.barkW || 512, BH = opts.barkH || 1024;
  let bi = 0;
  for (const [name, sp] of Object.entries(BARK_SPEC)) {
    const c = new THREE.WebGLRenderTarget(BW, BH, { depthBuffer: true, type: THREE.UnsignedByteType });
    const n = new THREE.WebGLRenderTarget(BW, BH, { depthBuffer: false, type: THREE.UnsignedByteType });
    setupTex(c.texture, true); setupTex(n.texture, false);
    const R = mulberry32(5000 + bi * 31);
    const S = sp.sprites ? sp.sprites(R) : null;
    paint(c, 0, sp.kind, S, 11.3 + bi * 2.7, BW, BH, true);
    normal(c, n, -1, BW, BH, sp.strength, 1.5, true);
    bark[name] = { map: c.texture, normalMap: n.texture, rtC: c, rtN: n };
    bi++;
  }

  r.setRenderTarget(prev.rt); r.autoClear = prev.auto; r.setClearColor(prev.cc, prev.ca);
  baseMat.dispose(); spriteMat.dispose(); normArr.dispose(); norm2D.dispose(); quad.geometry.dispose();
  Object.assign(TEX, { ready: true, groundC: gC.texture, groundN: gN.texture, gRT: [gC, gN], groundSize: GS, bark, ms: performance.now() - t0 });
  return TEX;
}

// debug: read back a baked layer as a PNG data URL (QA only)
export function dumpTexture(renderer, which, layer = 0) {
  let rt, W, H;
  if (which === 'groundC' || which === 'groundN') { rt = TEX.gRT[which === 'groundC' ? 0 : 1]; W = H = TEX.groundSize; }
  else { const [name, k] = which.split('.'); rt = TEX.bark[name][k === 'n' ? 'rtN' : 'rtC']; W = rt.width; H = rt.height; layer = 0; }
  const buf = new Uint8Array(W * H * 4);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt, layer);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  renderer.setRenderTarget(prev);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'); const id = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = ((H - 1 - y) * W + x) * 4, d = (y * W + x) * 4;
    id.data[d] = buf[s]; id.data[d + 1] = buf[s + 1]; id.data[d + 2] = buf[s + 2]; id.data[d + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  return cv.toDataURL('image/png');
}
