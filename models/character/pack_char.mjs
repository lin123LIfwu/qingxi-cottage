// Compress the farmer GLB: per-texture WebP sizes, meshopt geometry (skinned).  node pack_char.mjs in.glb out.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, meshopt, dedup, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
const [inp, out] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inp);
const SIZES = JSON.parse(process.env.SIZES || '{}');
const rules = [   // [regex on texture/image name, size, quality]
  [/skin|lightskinned/i, SIZES.skin || 2048, 86], [/suit_diffuse|clothes/i, SIZES.clothes || 1024, 84], [/casualsuit06_normal/i, 1024, 88],
  [/hair_diffuse/i, 1024, 86], [/short02_normal/i, 512, 88], [/eye/i, 256, 88], [/eyebrow|eyelash|lash_diffuse/i, 256, 90],
  [/shoes/i, 512, 84], [/hat_basecolor/i, 1024, 86], [/hat_normal/i, 512, 88], [/hat_orm/i, 512, 88],
];
const fns = [dedup()];
for (const t of doc.getRoot().listTextures()) {
  const n = t.getName() || t.getURI() || '';
  const r = rules.find(([re]) => re.test(n)) || [null, 1024, 85];
  console.log('tex', n, t.getSize()?.join('x'), '->', r[1]);
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  fns.push(textureCompress({ encoder: sharp, targetFormat: 'webp', pattern: new RegExp('^' + esc + '$'), resize: [r[1], r[1]], quality: r[2] }));
}
fns.push(prune(), meshopt({ encoder: MeshoptEncoder, level: process.env.LEVEL || 'high' }));
await doc.transform(...fns);
fs.mkdirSync((await import('node:path')).dirname(out), { recursive: true });
await io.write(out, doc);
const tex = doc.getRoot().listTextures().map(t => `${t.getName()}:${t.getSize()?.join('x')}:${(t.getImage().byteLength / 1024).toFixed(0)}K`);
console.log(out, (fs.statSync(out).size / 1024).toFixed(0), 'KB |', tex.join(' '));
