// Hand-held tool models (built in Blender, see /models in the repo), embedded as base64 GLB.
// loadModels() must finish before the player / view model are built.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
// pure-JS meshopt decoder: no WebAssembly, so the game also loads under strict CSP hosts
import { MeshoptDecoder } from '../util/meshoptDecoder.js';
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

// Decode images straight from bytes. GLTFLoader (and <img src="data:...">) go through blob: /
// data: URLs, which a strict Content-Security-Policy (img-src / connect-src) may refuse;
// createImageBitmap(blob) involves no URL at all.
const BITMAP_OPTS = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
const canBitmap = typeof createImageBitmap !== 'undefined';
function bytesToImage(bytes, mime) {
  const blob = new Blob([bytes], { type: mime });
  if (canBitmap) return createImageBitmap(blob, BITMAP_OPTS).catch(() => urlImage(blob));
  return urlImage(blob);
}
function urlImage(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}
// GLTFLoader plugin: embedded (bufferView) images are decoded from their bytes, where the
// loader would otherwise fetch() a blob: URL
function bitmapImages(parser) {
  const orig = parser.loadImageSource.bind(parser);
  parser.loadImageSource = function (sourceIndex, loader) {
    const def = this.json.images[sourceIndex];
    // keep three's choice of <img> for browsers with unreliable ImageBitmap (old Safari / Firefox)
    if (def.bufferView === undefined || !loader.isImageBitmapLoader) return orig(sourceIndex, loader);
    if (this.sourceCache[sourceIndex] !== undefined) return this.sourceCache[sourceIndex].then(t => t.clone());
    const p = this.getDependency('bufferView', def.bufferView)
      .then(bv => bytesToImage(new Uint8Array(bv), def.mimeType))
      .then(img => {
        const t = new THREE.Texture(img);
        t.needsUpdate = true;
        t.userData.mimeType = def.mimeType;
        return t;
      });
    this.sourceCache[sourceIndex] = p;
    return p;
  };
  return { name: 'QX_bitmap_images' };
}

export async function loadModels(renderer) {
  const L = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(bitmapImages);
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
  // a second, independent skeleton for the first-person arms, copied while still in the rest pose
  // (the player poses the main instance as soon as it is built)
  MODELS.farmerFP = cloneSkinned(MODELS.farmer);
  await Promise.all(Object.keys(ICONS).map(k => cropIcon(k)));
}

// a deep copy of a tool model (geometry + materials shared with the original)
export function toolModel(key) { return MODELS[key].clone(true); }

// The farmer is a skinned mesh: the game uses the single loaded instance; the first-person view
// model gets its own skeleton (SkeletonUtils clone: geometry, materials and textures shared).
export function farmerModel() { return MODELS.farmer; }
export function farmerArmsModel() { return MODELS.farmerFP; }

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
  const url = ICONS[key] || ICONS.sprout, comma = url.indexOf(',');
  const mime = url.slice(5, url.indexOf(';')), bytes = new Uint8Array(b64(url.slice(comma + 1)));
  t.ready = bytesToImage(bytes, mime).then(img => { t.image = img; t.needsUpdate = true; }, () => { /* icon stays blank */ });
  iconTex[key] = t;
  return t.ready.then(() => t);
}
export function cropIconNow(key) { return iconTex[key] || iconTex.sprout || null; }
