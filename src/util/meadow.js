// Shared, slowly varying "meadow state" so the ground texture and the grass blades agree
// on where the grass is lush, dry or tall.  Requires GLSL_NOISE.
export const GLSL_MEADOW = /* glsl */`
// x = dryness (straw patches), y = lushness, z = height factor, w = fine variation
vec4 meadow(vec2 p){
  float a = fbm3(p * 0.021 + vec2(3.1, -8.2));
  float b = vnoise(p * 0.083 + 11.0);
  float c = vnoise(p * 0.37 + 4.0);
  float dry = smoothstep(0.64, 0.84, a * 0.8 + b * 0.35);
  float lush = smoothstep(0.56, 0.3, b) * (1.0 - dry);
  float tall = clamp(0.55 + (b - 0.5) * 0.9 + (a - 0.5) * 0.5 - dry * 0.25, 0.0, 1.0);
  return vec4(dry, lush, tall, c);
}
vec3 meadowTint(vec4 m){
  vec3 t = mix(vec3(1.0), vec3(0.88, 1.03, 0.80), m.y);
  t = mix(t, vec3(1.30, 1.10, 0.62), m.x * 0.8);
  return t * (0.9 + 0.2 * m.w);
}`;
