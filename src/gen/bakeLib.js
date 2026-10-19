// Shared GLSL for procedural texture baking (all noise is tileable through integer periods)
export const BAKE_LIB = /* glsl */`
uniform float uSeed;
float hh(vec2 p){ p += uSeed * 0.731; vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hh2(vec2 p){ p += uSeed * 0.731; vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
// periodic gradient noise in [0,1]
float gn(vec2 x, vec2 P){
  vec2 i = floor(x), f = fract(x);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 ga = hh2(mod(i, P)) * 2.0 - 1.0, gb = hh2(mod(i + vec2(1.0, 0.0), P)) * 2.0 - 1.0;
  vec2 gc = hh2(mod(i + vec2(0.0, 1.0), P)) * 2.0 - 1.0, gd = hh2(mod(i + vec2(1.0, 1.0), P)) * 2.0 - 1.0;
  float va = dot(ga, f), vb = dot(gb, f - vec2(1.0, 0.0)), vc = dot(gc, f - vec2(0.0, 1.0)), vd = dot(gd, f - vec2(1.0, 1.0));
  return clamp(0.5 + 0.75 * mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y), 0.0, 1.0);
}
float fbm2(vec2 uv, vec2 f0, int oct, float gain){
  float s = 0.0, a = 0.5, n = 0.0; vec2 f = f0;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * gn(uv * f + float(i) * 3.17, f); n += a; a *= gain; f *= 2.0; }
  return s / n;
}
float ridge(float n){ return 1.0 - abs(n * 2.0 - 1.0); }
// periodic voronoi: x = F1, y = F2, zw = cell id (periodic)
vec4 vor(vec2 x, vec2 P, float jit){
  vec2 i = floor(x), f = fract(x);
  float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int xx = -1; xx <= 1; xx++) {
    vec2 g = vec2(float(xx), float(y));
    vec2 c = mod(i + g, P);
    vec2 o = 0.5 + (hh2(c) - 0.5) * jit;
    vec2 r = g + o - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = c; } else if (d < d2) { d2 = d; }
  }
  return vec4(sqrt(d1), sqrt(d2), id);
}
vec3 enc(vec3 c){ return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }
`;
