// Compress the Blender GLBs for the single-file game: WebP textures (resized per slot),
// quantized + meshopt-compressed geometry.  usage: node pack.mjs <in.glb> <out.glb> [baseSize normalSize ormSize]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, meshopt, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
const [inp, out, bs = '1024', ns = '1024', os = '512', q = '84'] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inp);
const fit = (s) => { const n = +s; return n > 0 ? [n, n] : null; };
await doc.transform(
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColor/, resize: fit(bs), quality: +q }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^normal/, resize: fit(ns), quality: +q + 6 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^metallicRoughness/, resize: fit(os), quality: +q + 4 }),
  meshopt({ encoder: MeshoptEncoder, level: process.env.LEVEL || 'medium' }),
);
const fs = await import('node:fs');
fs.mkdirSync((await import('node:path')).dirname(out), { recursive: true });
await io.write(out, doc);
const tex = doc.getRoot().listTextures().map(t => `${t.getName()}:${t.getSize()?.join('x')}:${(t.getImage().byteLength / 1024).toFixed(0)}K`);
console.log(doc.getRoot().listNodes().map(n => n.getName()).join(','));
console.log(out, (fs.statSync(out).size / 1024).toFixed(0), 'KB |', tex.join(' '));
