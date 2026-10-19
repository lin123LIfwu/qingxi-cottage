import * as THREE from 'three';
const _c = new THREE.Color();
// sRGB hex -> GLSL vec3 (linear)
export function glslColor(hex) {
  _c.set(hex);
  return `vec3(${_c.r.toFixed(4)},${_c.g.toFixed(4)},${_c.b.toFixed(4)})`;
}
export function linColor(hex) { return new THREE.Color(hex); }
