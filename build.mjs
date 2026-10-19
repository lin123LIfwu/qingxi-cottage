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
console.log(`built dist/青溪小筑.html  ${(html.length / 1024).toFixed(0)} KB`);
