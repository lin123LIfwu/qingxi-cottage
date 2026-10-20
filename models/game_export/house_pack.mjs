// Pack the timber-house GLB for the single-file game: WebP textures + Meshopt geometry.
// usage: node house_pack.mjs [in.glb] [out.glb]
// The house keeps its preview-level geometry (≈114k triangles), so the packed file is larger than
// the old 1.1 MB budget; the game build accepts it deliberately (see 开发交接.md).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, meshopt, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const inp = process.argv[2] || resolve(HERE, '../source/out/house.glb');
const out = process.argv[3] || resolve(HERE, '../source/out/house_packed.glb');
const BASE = 512, NORMAL = 512, ORM = 256, Q = 74;

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inp);
await doc.transform(
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColor/, resize: [BASE, BASE], quality: Q }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^normal/, resize: [NORMAL, NORMAL], quality: Q + 6 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^metallicRoughness/, resize: [ORM, ORM], quality: Q + 4 }),
  meshopt({ encoder: MeshoptEncoder, level: process.env.LEVEL || 'medium' }),
);
mkdirSync(dirname(out), { recursive: true });
await io.write(out, doc);
const size = statSync(out).size;
const tex = doc.getRoot().listTextures().map(t => `${t.getName()}:${t.getSize()?.join('x')}:${(t.getImage().byteLength / 1024).toFixed(0)}K`);
console.log(out, (size / 1024).toFixed(0), 'KB |', tex.join(' '));
if (size > 3_000_000) { console.error('house_pack: packed GLB is unexpectedly large (> 3 MB)'); process.exit(1); }
if (size > 1_493_476) console.warn('house_pack: above the old 1.1 MB budget — keeping the 114k-triangle model by decision');
