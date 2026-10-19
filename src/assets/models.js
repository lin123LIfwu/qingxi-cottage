// Hand-held tool models (built in Blender, see /models in the repo), embedded as base64 GLB.
// loadModels() must finish before the player / view model are built.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import HOE from './hoe.glb.js';
import CAN from './can.glb.js';
import ROD from './rod.glb.js';
import PACKET from './packet.glb.js';
import ICONS from './cropIcons.js';
import FARMER from './farmer.js';

export const MODELS = {};
const SRC = { hoe: HOE, can: CAN, rod: ROD, packet: PACKET, farmer: FARMER };

function b64(s) {
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

export async function loadModels(renderer) {
  const L = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const aniso = Math.min(8, renderer ? renderer.capabilities.getMaxAnisotropy() : 4);
  await Promise.all(Object.entries(SRC).map(([k, s]) => L.parseAsync(b64(s), '').then(g => { MODELS[k] = g.scene; })));
  for (const k in MODELS) MODELS[k].traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material;
    for (const t of [m.map, m.normalMap, m.roughnessMap]) if (t) t.anisotropy = aniso;
    // the ORM texture's red channel is baked ambient occlusion
    if (m.roughnessMap && !m.aoMap) { m.aoMap = m.roughnessMap; m.aoMapIntensity = 0.6; }
  });
  setupFarmer(MODELS.farmer);
  await Promise.all(Object.keys(ICONS).map(k => cropIcon(k)));
}

// a deep copy of a tool model (geometry + materials shared with the original)
export function toolModel(key) { return MODELS[key].clone(true); }

// The farmer is a skinned mesh: the game uses the single loaded instance (no clone).
export function farmerModel() { return MODELS.farmer; }

function setupFarmer(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material, n = m.name;
    if (o.isSkinnedMesh) o.frustumCulled = false;   // bounds come from the bind pose
    if (n === 'hair') {                             // alpha-tested cards: no sorting problems
      m.transparent = false; m.alphaTest = 0.4; m.depthWrite = true;
    } else if (n === 'brows' || n === 'lashes') {
      m.transparent = true; m.depthWrite = false; o.castShadow = false; o.renderOrder = 2;
    } else if (n === 'eyes') {
      o.castShadow = false;
    }
    if (n === 'skin') { m.roughness = 0.58; }
    if (n === 'clothes') { m.roughness = 0.9; }
  });
}

// seed-packet crop decals (same layout as the default sprout icon baked into packet.glb)
const iconTex = {};
export function cropIcon(key) {
  if (iconTex[key]) return iconTex[key].ready.then(() => iconTex[key]);
  const t = new THREE.Texture(); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4;
  const img = new Image();
  t.ready = new Promise(res => { img.onload = () => { t.image = img; t.needsUpdate = true; res(); }; img.onerror = res; });
  img.src = ICONS[key] || ICONS.sprout;
  iconTex[key] = t;
  return t.ready.then(() => t);
}
export function cropIconNow(key) { return iconTex[key] || iconTex.sprout || null; }
