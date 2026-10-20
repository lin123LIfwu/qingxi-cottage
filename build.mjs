// Bundles the game into a single self-contained HTML file.
//   node build.mjs          -> dist/青溪小筑.html + dist/index.html
// For development just serve this folder with any static server (index.html uses an import map).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2020'],
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
});
let js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const header = '/* 青溪小筑 · three.js (MIT) © 2010-2025 three.js authors */\n';
let html = readFileSync('index.html', 'utf8')
  .replace(/<!--DEV-->[\s\S]*?<!--\/DEV-->\n?/, '')
  .replace(/<!--APP-->[\s\S]*?<!--\/APP-->/, () => `<script>${header}${js}</script>`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/青溪小筑.html', html);
writeFileSync('dist/index.html', html);
const bytes = Buffer.byteLength(html);
console.log(`built dist/青溪小筑.html  ${(bytes / 1024).toFixed(0)} KB (${bytes} bytes)`);
if (bytes > 4_800_000) console.warn('warning: above the 4.8 MB target — the two-storey house keeps its 114k-triangle model by decision');
if (bytes > 4_900_000) console.warn('warning: above the 4.9 MB Notion free-plan safe line');
