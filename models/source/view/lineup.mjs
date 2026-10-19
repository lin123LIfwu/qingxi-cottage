// three.js 加载检查：先在仓库根目录起一个静态服务器（例如 npx serve -l 8124 .），再运行
//   node models/source/view/lineup.mjs [lineup|can|reel] [宽] [高]
// lineup.html 默认从 ../out/ 读取 GLB；import map 指向仓库的 node_modules/three
import { chromium } from 'playwright';
const view = process.argv[2] || 'lineup', W = +(process.argv[3] || 1280), H = +(process.argv[4] || 720);
const BASE = process.env.BASE || 'http://localhost:8124';
const b = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: H } });
p.on('pageerror', e => console.log('[pageerror]', e.message));
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console.' + m.type() + ']', m.text().slice(0, 200)); });
await p.goto(`${BASE}/models/source/view/lineup.html?view=${view}&w=${W}&h=${H}`);
await p.waitForFunction(() => window.__done, null, { timeout: 240000 });
if (view === 'lineup') for (const s of await p.evaluate(() => window.__stats)) console.log(JSON.stringify(s));
await p.screenshot({ path: `threejs_${view}.png` });
await b.close(); process.exit(0);
