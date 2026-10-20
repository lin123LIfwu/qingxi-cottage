// DOM user interface: HUD, hotbar, panels, fishing widgets, title & transitions
import { CSS } from './style.js';
import { ICONS } from './icons.js';
import { CROPS, CROP_KEYS } from '../game/farm.js';
import { FISH, FISH_KEYS, HOUR_TEXT, WHERE_TEXT, fishSVG, fmtWeight } from '../game/fishData.js';

export const SLOTS = [
  { type: 'tool', id: 'hoe', name: '锄头' },
  { type: 'tool', id: 'can', name: '水壶' },
  { type: 'tool', id: 'rod', name: '鱼竿' },
  ...CROP_KEYS.map(k => ({ type: 'seed', id: k, name: CROPS[k].name + '种子' })),
];
const WX = { sunny: ['sun', '晴朗'], cloudy: ['cloud', '多云'], rain: ['rain', '小雨'] };
export const UPGRADES = {
  can: { name: '大号水壶', icon: 'can', price: 500, desc: '水壶容量 30 → 60，少跑几趟水边。' },
  rod: { name: '精制鱼竿', icon: 'rod', price: 800, desc: '绿条更宽、鱼咬钩更快，更容易钓到大鱼和稀有鱼。' },
};

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const pad2 = n => String(n).padStart(2, '0');
export function fmtTime(min) {
  const m = Math.floor(min) % 1440;
  return pad2(Math.floor(m / 60)) + ':' + pad2(Math.floor(m % 60 / 10) * 10);
}
function phaseName(min) {
  const h = (min / 60) % 24;
  if (h < 5) return '深夜'; if (h < 8) return '清晨'; if (h < 11) return '上午'; if (h < 13) return '中午';
  if (h < 17) return '下午'; if (h < 19.5) return '傍晚'; return '夜晚';
}

export class UI {
  constructor(game) {
    this.g = game;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const root = el('div'); root.id = 'ui'; document.body.appendChild(root); this.root = root;
    this.modalName = null; this.toastList = [];
    this.buildHUD();
    this.buildFishing();
    this.buildModal();
    this.buildTitle();
    this.last = {};
  }
  // ------------------------------------------------------------------ HUD
  buildHUD() {
    const r = this.root;
    const tl = el('div', 'hud-tl'); r.appendChild(tl); this.hudTL = tl;
    this.dateCard = el('div', 'card datecard', `<div class="wx"></div><div><div class="d1"></div><div class="d2"><span class="tm"></span><span class="ph"></span></div></div>`);
    tl.appendChild(this.dateCard);
    this.coinsEl = el('div', 'card coins', `${ICONS.coin}<span>0</span>`); tl.appendChild(this.coinsEl);
    this.speedEl = el('div', 'card speed pe', '1×'); this.speedEl.title = '时间流速'; tl.appendChild(this.speedEl);
    this.speedEl.addEventListener('click', () => { this.g.cycleSpeed(); this.g.sfx('click'); });
    const tr = el('div', 'hud-tr'); r.appendChild(tr); this.hudTR = tr;
    const row = el('div', 'btnrow'); tr.appendChild(row);
    for (const [id, icon, key, title] of [['view', 'eye', 'V', '切换第一 / 第三人称视角'], ['bag', 'bag', 'Tab', '背包'], ['log', 'book', 'L', '图鉴'], ['settings', 'gear', 'Esc', '设置'], ['help', 'help', 'H', '帮助']]) {
      const b = el('div', 'card ibtn pe', `${ICONS[icon]}<span class="k">${key}</span>`); b.title = title;
      if (id === 'view') { b.addEventListener('click', () => this.g.toggleView()); this.viewBtn = b; }
      else b.addEventListener('click', () => { this.g.sfx('open'); this.open(id); });
      row.appendChild(b);
    }
    this.mapWrap = el('div', 'card minimap'); this.mapCanvas = el('canvas'); this.mapCanvas.width = 344; this.mapCanvas.height = 344;
    this.mapWrap.appendChild(this.mapCanvas); tr.appendChild(this.mapWrap);
    this.hotbar = el('div', 'card hotbar pe'); r.appendChild(this.hotbar);
    this.slotEls = SLOTS.map((s, i) => {
      const d = el('div', 'slot'); d.dataset.i = i;
      d.addEventListener('click', (e) => { e.stopPropagation(); this.g.selectSlot(i); });
      d.addEventListener('pointerdown', e => e.stopPropagation());
      this.hotbar.appendChild(d); return d;
    });
    this.toolName = el('div', 'toolname'); r.appendChild(this.toolName);
    this.promptEl = el('div', 'card prompt'); r.appendChild(this.promptEl);
    this.toasts = el('div', 'toasts'); r.appendChild(this.toasts);
    this.hintEl = el('div', 'card hint'); r.appendChild(this.hintEl);
    this.xhair = el('div', 'xhair'); r.appendChild(this.xhair);
    this.lockHint = el('div', 'card lockhint', '🖱️ 点击画面开始环顾'); r.appendChild(this.lockHint);
    this.renderViewState();
  }
  renderHotbar() {
    const S = this.g.S;
    SLOTS.forEach((s, i) => {
      const d = this.slotEls[i];
      let html = `<span class="num">${i + 1}</span>`;
      if (s.type === 'tool') {
        html += ICONS[s.id];
        if (s.id === 'can') html += `<div class="wbar"><i style="width:${Math.round(100 * S.water / S.waterMax)}%"></i></div>`;
        if (s.id === 'rod' && S.rodLevel > 1) html += `<span class="cnt">★</span>`;
      } else {
        const n = S.seeds[s.id] || 0;
        html += `<div class="seedbag"><span class="emo">${CROPS[s.id].icon}</span></div><span class="cnt">${n}</span>`;
        d.classList.toggle('empty', n <= 0);
      }
      d.innerHTML = html;
      d.classList.toggle('sel', S.tool === i);
      d.title = s.name;
    });
  }
  flashToolName(text) {
    this.toolName.textContent = text; this.toolName.classList.add('show');
    clearTimeout(this._tnT); this._tnT = setTimeout(() => this.toolName.classList.remove('show'), 1100);
  }
  updateHUD(env) {
    const S = this.g.S, L = this.last;
    const day = `第 ${S.day} 天`;
    if (L.day !== day) { this.dateCard.querySelector('.d1').textContent = day; L.day = day; }
    const tm = fmtTime(S.minutes);
    if (L.tm !== tm) { this.dateCard.querySelector('.tm').textContent = tm; this.dateCard.querySelector('.ph').textContent = phaseName(S.minutes); L.tm = tm; }
    const night = env && env.nightK > 0.5;
    const wxKey = S.weather + (night ? 'n' : '');
    if (L.wx !== wxKey) {
      const ic = S.weather === 'rain' ? 'rain' : night ? 'moon' : WX[S.weather][0];
      this.dateCard.querySelector('.wx').innerHTML = ICONS[ic]; this.dateCard.querySelector('.wx').title = WX[S.weather][1]; L.wx = wxKey;
    }
    if (L.coins !== S.coins) {
      this.coinsEl.querySelector('span').textContent = S.coins;
      if (L.coins !== undefined) { this.coinsEl.classList.remove('bump'); void this.coinsEl.offsetWidth; this.coinsEl.classList.add('bump'); }
      L.coins = S.coins;
    }
    const sp = S.settings.speed + '×';
    if (L.sp !== sp) { this.speedEl.textContent = '⏱ ' + sp; L.sp = sp; }
    const hint = !!S.settings.showHints;
    if (L.hint !== hint) { this.hintEl.style.display = hint ? '' : 'none'; L.hint = hint; }
  }
  // first / third person: hint text and the view button
  renderViewState() {
    const fp = this.g.rig ? this.g.rig.fp : this.g.S.settings.view === 'first';
    if (this.last && this.last.view === fp) return;
    if (this.last) this.last.view = fp;
    this.hintEl.innerHTML = fp
      ? `<b>WASD</b> 移动　<b>Shift</b> 奔跑　<b>空格</b> 跳跃<br><b>鼠标左键</b> 使用工具　<b>E</b> 互动/收获<br><b>移动鼠标</b> 环顾　<b>Esc</b> 释放鼠标<br><b>1–9</b> 切换工具　<b>V</b> 第三人称`
      : `<b>WASD</b> 移动　<b>Shift</b> 奔跑　<b>空格</b> 跳跃<br><b>鼠标左键</b> 使用工具　<b>E</b> 互动/收获<br><b>拖动鼠标</b> 旋转视角　<b>滚轮</b> 缩放<br><b>1–9</b> 切换工具　<b>V</b> 第一人称`;
    if (this.viewBtn) { this.viewBtn.classList.toggle('on', fp); this.viewBtn.title = fp ? '切换到第三人称（V）' : '切换到第一人称（V）'; }
  }
  // crosshair + "click to look around" card while in first person
  setFPState(on, locked, dragLook) {
    const L = this.last, x = !!on, h = !!(on && !locked && !dragLook);
    if (L.xh !== x) { this.xhair.classList.toggle('show', x); L.xh = x; }
    if (L.lh !== h) { this.lockHint.classList.toggle('show', h); L.lh = h; }
  }
  setPrompt(html) {
    if (this.last.prompt === html) return;
    this.last.prompt = html;
    if (!html) { this.promptEl.classList.remove('show'); return; }
    this.promptEl.innerHTML = html; this.promptEl.classList.add('show');
  }
  toast(text, kind = '', icon = '') {
    const t = el('div', 'card toast ' + kind, (icon ? `<span>${icon}</span>` : '') + `<span>${text}</span>`);
    this.toasts.appendChild(t);
    const all = this.toasts.children;
    while (all.length > 4) all[0].remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 420); }, 2400);
  }
  setHUDVisible(v) {
    for (const e of [this.hudTL, this.hudTR, this.hotbar, this.hintEl, this.promptEl, this.toolName, this.xhair, this.lockHint]) e.style.visibility = v ? '' : 'hidden';
  }
  // ------------------------------------------------------------------ minimap
  initMinimap(T, pois) {
    this.mapT = T; this.pois = pois;
    const N = 300, c = document.createElement('canvas'); c.width = N; c.height = N;
    const ctx = c.getContext('2d'); const img = ctx.createImageData(N, N);
    const col = { r: 0, g: 0, b: 0, setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; } };
    const range = 92;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -range + (i + 0.5) / N * range * 2, z = -range + (j + 0.5) / N * range * 2;
      T.colorAt(x, z, col);
      let r = Math.pow(col.r, 1 / 2.2), g = Math.pow(col.g, 1 / 2.2), b = Math.pow(col.b, 1 / 2.2);
      const h = T.heightAt(x, z), lv = T.waterLevelAt(x, z);
      if (lv > h) { const d = Math.min(1, (lv - h) / 1.2); r = 0.45 - 0.2 * d; g = 0.72 - 0.15 * d; b = 0.86 - 0.05 * d; }
      else { const nx = T.heightAt(x + 0.6, z) - h; const sh = 1 + nx * 0.6; r *= sh; g *= sh; b *= sh; }
      if (T.forest && T.sampleGrid(T.forest, x, z) > 0.5) { r *= 0.78; g *= 0.88; b *= 0.78; }
      const rr = Math.pow(Math.pow(Math.abs(x), 6) + Math.pow(Math.abs(z), 6), 1 / 6);
      if (rr > 82) { r *= 0.6; g *= 0.6; b *= 0.6; }
      const k = (j * N + i) * 4;
      img.data[k] = Math.min(255, r * 255); img.data[k + 1] = Math.min(255, g * 255); img.data[k + 2] = Math.min(255, b * 255); img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.mapImg = c; this.mapRange = range;
  }
  drawMinimap(px, pz, pyaw, camYaw) {
    if (!this.mapImg) return;
    const c = this.mapCanvas, ctx = c.getContext('2d'), W = c.width;
    const view = 70; // metres across
    const scale = W / view;
    const imgScale = this.mapImg.width / (this.mapRange * 2);
    ctx.save();
    ctx.fillStyle = '#7c9a5c'; ctx.fillRect(0, 0, W, W);
    ctx.translate(W / 2, W / 2);
    ctx.rotate(camYaw);
    ctx.scale(scale / imgScale, scale / imgScale);
    ctx.translate(-(px + this.mapRange) * imgScale, -(pz + this.mapRange) * imgScale);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mapImg, 0, 0);
    ctx.restore();
    // POIs
    const toScreen = (x, z) => {
      const dx = x - px, dz = z - pz;
      const a = -(camYaw);
      const cs = Math.cos(a), sn = Math.sin(a);
      const rx = dx * cs + dz * sn, rz = -dx * sn + dz * cs;
      return [W / 2 + rx * scale, W / 2 + rz * scale];
    };
    ctx.font = '26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of this.pois) {
      let [sx, sy] = toScreen(p.x, p.z);
      const m = 18, inside = sx > m && sx < W - m && sy > m && sy < W - m;
      if (!inside) { if (!p.edge) continue; sx = Math.max(m, Math.min(W - m, sx)); sy = Math.max(m, Math.min(W - m, sy)); ctx.globalAlpha = 0.7; }
      ctx.fillText(p.icon, sx, sy); ctx.globalAlpha = 1;
    }
    // player arrow
    const a = pyaw - camYaw;
    ctx.save(); ctx.translate(W / 2, W / 2); ctx.rotate(-a + Math.PI);
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(11, 12); ctx.lineTo(0, 6); ctx.lineTo(-11, 12); ctx.closePath();
    ctx.fillStyle = '#ff7a4a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); ctx.fill();
    ctx.restore();
    // north marker
    const [nx, ny] = toScreen(px, pz - 1000);
    const ang = Math.atan2(ny - W / 2, nx - W / 2);
    const R = W / 2 - 18;
    ctx.fillStyle = 'rgba(90,67,48,.85)'; ctx.beginPath(); ctx.arc(W / 2 + Math.cos(ang) * R, W / 2 + Math.sin(ang) * R, 15, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.fillText('北', W / 2 + Math.cos(ang) * R, W / 2 + Math.sin(ang) * R + 1);
  }
  // ------------------------------------------------------------------ fishing widgets
  buildFishing() {
    const r = this.root;
    this.powerEl = el('div', 'card power', '<i></i>'); r.appendChild(this.powerEl);
    this.biteEl = el('div', 'bite', '!'); r.appendChild(this.biteEl);
    this.reelEl = el('div', 'card reel', `<div class="track"><div class="zone"></div><div class="fish">${fishSVG('crucian', 34, 0, true)}</div></div><div class="prog"><i></i></div>`);
    r.appendChild(this.reelEl);
    this.catchEl = el('div', 'card catch'); r.appendChild(this.catchEl);
  }
  updateFishing(F, anchor) {
    const s = F.state;
    const ax = anchor ? anchor.x : innerWidth / 2, ay = anchor ? anchor.y : innerHeight / 2;
    if (s === 'charge') {
      this.powerEl.classList.add('show');
      this.powerEl.style.left = (ax + 50) + 'px'; this.powerEl.style.top = (ay - 40) + 'px';
      this.powerEl.firstChild.style.height = `calc(${Math.round(F.power * 100)}% - 6px)`;
    } else this.powerEl.classList.remove('show');
    if (s === 'bite') {
      this.biteEl.classList.add('show'); this.biteEl.style.left = ax + 'px'; this.biteEl.style.top = (ay - 20) + 'px';
    } else this.biteEl.classList.remove('show');
    if (s === 'reel') {
      const R = F.reel, H = 270;
      this.reelEl.classList.add('show');
      const left = Math.min(innerWidth - 110, ax + 70), top = Math.max(70, Math.min(innerHeight - 330, ay - 150));
      this.reelEl.style.left = left + 'px'; this.reelEl.style.top = top + 'px';
      const z = this.reelEl.querySelector('.zone');
      z.style.height = (R.zh * H) + 'px'; z.style.bottom = (R.zy * H) + 'px';
      z.classList.toggle('out', !R.inZone);
      this.reelEl.querySelector('.fish').style.bottom = (R.fy * H) + 'px';
      this.reelEl.querySelector('.prog i').style.height = (Math.max(0, Math.min(1, R.prog)) * 100) + '%';
      this.reelEl.classList.toggle('shake', !R.inZone);
    } else this.reelEl.classList.remove('show');
  }
  showCatch(d, isNew, isRecord) {
    const f = FISH[d.key];
    this.catchEl.innerHTML = `<div>${fishSVG(d.key, 120, d.variant)}</div><div><div class="nm">${f.name}${isNew ? '<span class="badge g">新发现！</span>' : isRecord ? '<span class="badge">新纪录！</span>' : ''}</div>
      <div class="meta">体长 ${d.len} 厘米 · 重 ${fmtWeight(d.weight)}</div><div class="meta">售价 ${f.price} 金 · 已放入背包</div></div>`;
    this.catchEl.classList.remove('show'); void this.catchEl.offsetWidth; this.catchEl.classList.add('show');
    clearTimeout(this._catchT); this._catchT = setTimeout(() => this.catchEl.classList.remove('show'), 3800);
  }
  // ------------------------------------------------------------------ modal panels
  buildModal() {
    this.modalBg = el('div', 'modal-bg'); this.root.appendChild(this.modalBg);
    this.modalBg.addEventListener('pointerdown', e => { if (e.target === this.modalBg) { this.g.sfx('close'); this.close(); } });
    this.fadeEl = el('div', 'fade', '<div class="big"></div><div class="sub"></div>'); this.root.appendChild(this.fadeEl);
  }
  get modal() { return this.modalName; }
  panel(title, body, foot, cls = '') {
    this.modalBg.innerHTML = '';
    const p = el('div', 'panel ' + cls);
    p.innerHTML = `<div class="hd"><h2>${title}</h2><button class="x" title="关闭 (Esc)"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button></div><div class="bd"></div>${foot !== undefined ? '<div class="ft"></div>' : ''}`;
    p.querySelector('.bd').append(...[].concat(body));
    if (foot !== undefined) p.querySelector('.ft').append(...[].concat(foot));
    p.querySelector('.x').addEventListener('click', () => { this.g.sfx('close'); this.close(); });
    this.modalBg.appendChild(p);
    this.modalBg.classList.add('show');
    return p;
  }
  open(name, data) {
    this.modalName = name; this.modalData = data; this.tab = this.tab || {};
    this.g.onModal(true);
    this.render();
  }
  close() {
    if (!this.modalName) return;
    const cb = this.onCloseCb; this.onCloseCb = null;
    this.modalName = null; this.modalBg.classList.remove('show'); this.modalBg.innerHTML = '';
    this.g.onModal(false);
    cb && cb();
  }
  render() {
    const n = this.modalName; if (!n) return;
    const fn = this['render_' + n]; if (fn) fn.call(this, this.modalData);
  }
  button(text, cls, onClick, disabled) {
    const b = el('button', 'btn ' + (cls || ''), text);
    if (disabled) b.disabled = true;
    b.addEventListener('click', (e) => { e.stopPropagation(); if (!b.disabled) onClick(); });
    return b;
  }
  tabs(key, list) {
    const t = el('div', 'tabs');
    const cur = this.tab[key] || list[0][0];
    for (const [id, label] of list) {
      const b = el('div', 'tab' + (cur === id ? ' on' : ''), label);
      b.addEventListener('click', () => { this.tab[key] = id; this.g.sfx('click'); this.render(); });
      t.appendChild(b);
    }
    return [t, cur];
  }
  coinChip() { return el('div', 'chip', `${ICONS.coin.replace('<svg', '<svg width="22" height="22"')}<span>${this.g.S.coins} 金</span>`); }

  render_shop() {
    const S = this.g.S;
    const [tabs, cur] = this.tabs('shop', [['seeds', '🌱 种子'], ['tools', '🛠️ 工具升级']]);
    const body = [tabs];
    if (cur === 'seeds') {
      for (const k of CROP_KEYS) {
        const c = CROPS[k];
        const row = el('div', 'row', `<div class="ic">${c.icon}</div><div class="tx"><b>${c.name}种子</b> <span style="font-size:13px;opacity:.7">（持有 ${S.seeds[k] || 0}）</span><div class="s">${c.desc} 生长 ${c.days} 天${c.regrow ? ' · 可反复采摘' : ''} · 每个售价 ${c.sell} 金</div></div><div class="pr">${c.seed} 金</div>`);
        row.append(this.button('买 1', '', () => this.g.buySeed(k, 1), S.coins < c.seed), this.button('买 5', 'alt', () => this.g.buySeed(k, 5), S.coins < c.seed * 5));
        body.push(row);
      }
    } else {
      for (const id in UPGRADES) {
        const u = UPGRADES[id];
        const owned = id === 'can' ? S.canLevel > 1 : S.rodLevel > 1;
        const row = el('div', 'row', `<div class="ic">${ICONS[u.icon]}</div><div class="tx"><b>${u.name}</b><div class="s">${u.desc}</div></div><div class="pr">${owned ? '' : u.price + ' 金'}</div>`);
        row.append(owned ? el('span', 'badge g', '已拥有') : this.button('购买', '', () => this.g.buyUpgrade(id), S.coins < u.price));
        body.push(row);
      }
    }
    this.panel('🌱 种子铺', body, [el('div', '', '<span style="font-size:13px;opacity:.75">老板不在，钱放进木盒就好～</span>'), el('div', '', '').appendChild(this.coinChip()).parentNode]);
  }
  sellables() {
    const S = this.g.S, out = [];
    for (const k of CROP_KEYS) if (S.items[k] > 0) out.push({ k, n: S.items[k], name: CROPS[k].name, icon: `<span>${CROPS[k].icon}</span>`, price: CROPS[k].sell });
    for (const k of FISH_KEYS) if (S.items[k] > 0) out.push({ k, n: S.items[k], name: FISH[k].name, icon: fishSVG(k, 40), price: FISH[k].price });
    return out;
  }
  render_bin() {
    const list = this.sellables();
    const body = [];
    let total = 0;
    if (!list.length) body.push(el('div', 'empty-note', '背包里还没有可以出货的东西。去菜园收获，或者到水边钓鱼吧！'));
    for (const it of list) {
      total += it.n * it.price;
      const row = el('div', 'row', `<div class="ic">${it.icon}</div><div class="tx"><b>${it.name}</b> × ${it.n}<div class="s">单价 ${it.price} 金</div></div><div class="pr">${it.n * it.price} 金</div>`);
      row.append(this.button('卖 1', 'alt', () => this.g.sellItem(it.k, 1)), this.button('全部', '', () => this.g.sellItem(it.k, it.n)));
      body.push(row);
    }
    this.panel('📦 出货箱', body, [this.coinChip(), this.button(`全部卖出（${total} 金）`, '', () => this.g.sellAll(), !list.length)]);
  }
  render_bag() {
    const S = this.g.S;
    const body = [];
    body.push(el('div', 'sec', '🧰 工具'));
    const tools = el('div', 'chips');
    tools.append(el('div', 'chip', `${ICONS.hoe}锄头`), el('div', 'chip', `${ICONS.can}${S.canLevel > 1 ? '大号水壶' : '水壶'}（${Math.round(S.water)}/${S.waterMax}）`), el('div', 'chip', `${ICONS.rod}${S.rodLevel > 1 ? '精制鱼竿' : '竹鱼竿'}`));
    body.push(tools);
    body.push(el('div', 'sec', '🌱 种子'));
    const seeds = el('div', 'chips');
    for (const k of CROP_KEYS) seeds.appendChild(el('div', 'chip', `<span class="e">${CROPS[k].icon}</span>${CROPS[k].name} × ${S.seeds[k] || 0}`));
    body.push(seeds);
    body.push(el('div', 'sec', '🧺 收获'));
    const items = this.sellables();
    if (!items.length) body.push(el('div', 'empty-note', '空空如也～'));
    else { const ch = el('div', 'chips'); for (const it of items) ch.appendChild(el('div', 'chip', `${it.icon.includes('<svg') ? it.icon : `<span class="e">${CROPS[it.k].icon}</span>`}${it.name} × ${it.n}`)); body.push(ch); }
    body.push(el('div', 'sec', '📒 小结'));
    const st = S.stats;
    body.push(el('div', 'stat', `<div><b>${S.day}</b>天数</div><div><b>${st.harvested}</b>收获次数</div><div><b>${st.fishCaught}</b>钓到的鱼</div><div><b>${st.earned}</b>累计收入</div>`));
    this.panel('🎒 背包', body);
  }
  render_log() {
    const S = this.g.S;
    const [tabs, cur] = this.tabs('log', [['fish', '🐟 鱼类'], ['crops', '🥕 作物']]);
    const body = [tabs];
    const grid = el('div', 'grid');
    if (cur === 'fish') {
      const got = FISH_KEYS.filter(k => S.fishLog[k]).length;
      body.push(el('div', 'empty-note', `已收集 ${got} / ${FISH_KEYS.length} 种。不同的水域、时间和天气会遇到不同的鱼。`));
      for (const k of FISH_KEYS) {
        const f = FISH[k], L = S.fishLog[k];
        const where = Object.keys(f.where).map(w => WHERE_TEXT[w]).join('、');
        const c = el('div', 'fcard' + (L ? '' : ' no'), `${fishSVG(k, 110, 0, !L)}<div class="nm">${L ? f.name : f.name + '（未钓到）'}${f.rare ? ' ✨' : ''}</div>
          <div class="s">${where} · ${HOUR_TEXT[f.hours]}${f.rain ? ' · 雨天' : ''}<br>${L ? `钓到 ${L.n} 条 · 最大 ${L.max} 厘米` : f.desc}</div>`);
        grid.appendChild(c);
      }
    } else {
      for (const k of CROP_KEYS) {
        const c = CROPS[k], n = S.cropLog[k] || 0;
        grid.appendChild(el('div', 'fcard' + (n ? '' : ' no'), `<div style="font-size:52px;line-height:1.3">${c.icon}</div><div class="nm">${c.name}</div><div class="s">生长 ${c.days} 天${c.regrow ? ' · 可反复采摘' : ''}<br>售价 ${c.sell} 金 · 已收获 ${n}</div>`));
      }
    }
    body.push(grid);
    this.panel('📖 图鉴', body);
  }
  render_settings() {
    const S = this.g.S, st = S.settings;
    const body = [];
    const seg = (label, key, opts) => {
      const row = el('div', 'set', `<label>${label}</label>`); const g = el('div', 'seg');
      for (const [v, t] of opts) g.appendChild(this.button(t, st[key] === v ? '' : 'alt', () => { this.g.setSetting(key, v); this.render(); }));
      row.appendChild(g); return row;
    };
    body.push(seg('画面质量', 'quality', [['auto', '自动'], ['low', '流畅'], ['medium', '均衡'], ['high', '精美']]));
    for (const [label, key] of [['音乐音量', 'music'], ['音效音量', 'sfx']]) {
      const row = el('div', 'set', `<label>${label}</label>`);
      const inp = el('input'); inp.type = 'range'; inp.min = 0; inp.max = 1; inp.step = 0.05; inp.value = st[key];
      inp.addEventListener('input', () => this.g.setSetting(key, +inp.value));
      row.appendChild(inp); body.push(row);
    }
    body.push(seg('视角', 'view', [['third', '第三人称'], ['first', '第一人称']]));
    {
      const row = el('div', 'set', `<label>鼠标灵敏度</label>`);
      const inp = el('input'); inp.type = 'range'; inp.min = 0.3; inp.max = 2.5; inp.step = 0.05; inp.value = st.sens ?? 1;
      inp.addEventListener('input', () => this.g.setSetting('sens', +inp.value));
      row.appendChild(inp); body.push(row);
    }
    body.push(seg('时间流速', 'speed', [[1, '1×'], [2, '2×'], [4, '4×']]));
    body.push(seg('操作提示', 'showHints', [[true, '显示'], [false, '隐藏']]));
    body.push(el('div', 'empty-note', `游戏每 30 秒和每次睡觉时会自动保存在本机浏览器中。当前画质：${this.g.qualityName()}`));
    this.panel('⚙️ 设置', body, [this.button('回到标题', 'alt', () => { this.close(); this.g.toTitle(); }), this.button('删除存档并重新开始', 'warn', () => this.confirm('确定要删除存档、从第 1 天重新开始吗？', '删除并重开', () => this.g.resetSave()))]);
  }
  render_help() {
    const body = el('div', 'help', `
      <h3>🎮 基本操作</h3><table>
      <tr><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / 方向键</td><td>移动（相对镜头方向）</td></tr>
      <tr><td><kbd>Shift</kbd></td><td>奔跑</td></tr><tr><td><kbd>空格</kbd></td><td>跳跃（屋里和门廊上不能跳）</td></tr>
      <tr><td>鼠标左键 / <kbd>F</kbd></td><td>使用手中的工具（开垦、浇水、播种、抛竿）</td></tr>
      <tr><td><kbd>E</kbd></td><td>互动：收获成熟的作物、开店、出货、装水、在床边睡觉</td></tr>
      <tr><td>拖动鼠标 / <kbd>Q</kbd><kbd>R</kbd></td><td>旋转视角；滚轮缩放</td></tr>
      <tr><td><kbd>V</kbd> / 滚轮拉到最近</td><td>切换第一人称：点击画面锁定鼠标后，移动鼠标环顾、准星对准要耕种的地块；<kbd>Esc</kbd> 释放鼠标，再按 <kbd>V</kbd> 或向外滚动滚轮回到第三人称（进屋会自动切到第一人称）</td></tr>
      <tr><td><kbd>1</kbd> – <kbd>9</kbd> / 滚轮+Alt</td><td>切换锄头、水壶、鱼竿和种子</td></tr>
      <tr><td><kbd>Tab</kbd> <kbd>L</kbd> <kbd>M</kbd> <kbd>Esc</kbd></td><td>背包 / 图鉴 / 小地图 / 设置</td></tr></table>
      <h3>🌱 种田</h3>
      <p>1. 拿起<b>锄头</b>，在空地上点击开垦出一格田（小路、水边和斜坡不行）。<br>2. 选中<b>种子</b>，对着开垦好的空田点击播种。<br>3. 用<b>水壶</b>浇水——只有当天浇过水的田里作物才会生长。下雨天会自动浇透。<br>4. 作物长成后会闪闪发光，走近按 <kbd>E</kbd> 或点击收获，再拿到<b>出货箱</b>卖掉换钱。<br>水壶空了，就去池塘、小河边或菜园门口的水桶装水。</p>
      <h3>🎣 钓鱼</h3>
      <p>拿起<b>鱼竿</b>面向水面，<b>按住</b>鼠标左键蓄力，松开抛竿。浮漂轻轻点动是鱼在试探，猛地沉下并出现 <b>“!”</b> 时立刻点击！<br>收线时按住鼠标左键（或空格）让绿条上升、松开下降，尽量让鱼待在绿条里，直到进度条充满。<br>池塘、小河、瀑布下的急流里住着不同的鱼；清晨、傍晚、夜晚和雨天还会有特别的访客。</p>
      <h3>🏡 生活</h3>
      <p>一天从早上 6 点开始。晚上回到木屋，走上二楼卧室，在床边按 <kbd>E</kbd> 睡觉；进屋会自动切换到第一人称，出门恢复原来的视角。熬到凌晨 2 点会累倒哦。<br>沿着小路去探索吧：西边的池塘与木码头、北边的森林和瀑布、南边的拱桥和小河。</p>`);
    this.panel('❓ 玩法说明', body);
  }
  render_sign() {
    const body = el('div', 'sign', `<div><span>⬅️</span>西：清澈的池塘、钓鱼码头</div><div><span>➡️</span>东：菜园、水桶</div><div><span>⬇️</span>南：小河与拱桥</div><div><span>↗️</span>东北：沿河而上，有一道小瀑布</div><div><span>↖️</span>西北：森林深处有一片蘑菇圈</div>`);
    this.panel('🪧 路牌', body, undefined, 'dialog');
  }
  confirm(text, okText, onOk, cancelText = '取消', onCancel) {
    this.modalName = 'confirm'; this.g.onModal(true);
    const body = el('div', '', text);
    this.panel('🌙 提示', body, [this.button(cancelText, 'alt', () => { this.close(); onCancel && onCancel(); }), this.button(okText, '', () => { this.close(); onOk(); })], 'dialog');
  }
  // ------------------------------------------------------------------ fades & banners
  fadeText(big, sub) {
    this.fadeEl.querySelector('.big').textContent = big; this.fadeEl.querySelector('.sub').innerHTML = sub || '';
    this.fadeEl.classList.add('show'); void this.fadeEl.offsetWidth; this.fadeEl.classList.add('txt');
  }
  fadeTextHide() { this.fadeEl.classList.remove('txt'); setTimeout(() => this.fadeEl.classList.remove('show'), 700); }
  // ------------------------------------------------------------------ title & loading
  buildTitle() {
    this.titleEl = el('div', 'title', `<h1>青溪小筑</h1><div class="sub">种一畦菜 · 钓一尾鱼 · 过一段慢日子</div><div class="menu"></div><div class="foot">建议使用电脑浏览器 · 键盘 + 鼠标游玩 · 进度自动保存在本机</div>`);
    this.root.appendChild(this.titleEl);
  }
  showTitle(hasSave) {
    const m = this.titleEl.querySelector('.menu'); m.innerHTML = '';
    if (hasSave) m.appendChild(this.button('继续生活', '', () => this.g.continueGame()));
    m.appendChild(this.button(hasSave ? '新的开始' : '开始新生活', hasSave ? 'alt' : '', () => {
      if (hasSave) this.confirm('开始新的生活会覆盖现在的存档，确定吗？', '确定', () => this.g.newGame());
      else this.g.newGame();
    }));
    m.appendChild(this.button('玩法说明', 'alt', () => { this.g.sfx('open'); this.open('help'); }));
    this.titleEl.classList.add('show');
    this.setHUDVisible(false);
  }
  hideTitle() { this.titleEl.classList.remove('show'); this.setHUDVisible(true); }
}

export function makeLoading() {
  const d = document.createElement('div'); d.className = 'loading';
  d.innerHTML = `<h1>青溪小筑</h1><div class="bar"><i></i></div><div class="msg">正在准备……</div>`;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  document.body.appendChild(d);
  return {
    set(msg, k) { d.querySelector('.msg').textContent = msg; d.querySelector('.bar i').style.width = Math.round(k * 100) + '%'; },
    done() { d.style.opacity = '0'; setTimeout(() => d.remove(), 650); },
    error(msg) { d.querySelector('.msg').innerHTML = msg; d.querySelector('.bar').style.display = 'none'; },
  };
}
