// 青溪小筑 — cozy three.js farming & fishing game
import * as THREE from 'three';
import { Terrain } from './world/terrain.js';
import { bakeTextures } from './gen/texgen.js';
import { buildLeafAtlas } from './gen/leafgen.js';
import { Colliders } from './world/colliders.js';
import { Vegetation } from './world/vegetation.js';
import { Environment } from './world/environment.js';
import { Water } from './world/water.js';
import { Structures } from './world/structures.js';
import { Pipeline } from './render/pipeline.js';
import { Player } from './game/player.js';
import { CameraRig } from './game/camera.js';
import { ViewModel } from './game/viewmodel.js';
import { Farm, CROPS, CROP_KEYS } from './game/farm.js';
import { Fishing } from './game/fishing.js';
import { FISH } from './game/fishData.js';
import { FX } from './fx/particles.js';
import { AudioSys } from './audio/audio.js';
import { UI, SLOTS, UPGRADES, makeLoading } from './ui/ui.js';
import { defaultState, loadState, saveState, hasSave, clearSave } from './game/state.js';
import { SPAWN, CABIN, POND, SHOP, BIN, BARREL, MINUTES_PER_SEC, HOME_H } from './config.js';
import { clamp, lerp, smoothstep, damp } from './util/math.js';

const loading = makeLoading();
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
const QUALITY = {
  low: { pr: 0.75, shadow: 'low', msaa: 0, name: '流畅' },
  medium: { pr: 1.0, shadow: 'medium', msaa: 2, name: '均衡' },
  high: { pr: 1.5, shadow: 'high', msaa: 4, name: '精美' },
};
const WEATHER_NAME = { sunny: '☀️ 晴朗', cloudy: '⛅ 多云', rain: '🌧️ 小雨' };
const REACH = 2.6;   // first person: how far (horizontally) the hands can work the soil
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _dir = new THREE.Vector3(), _sz = new THREE.Vector2();

class Game {
  async boot() {
    // ---------- renderer ----------
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    } catch (e) {
      loading.error('抱歉，你的浏览器暂不支持 WebGL2，无法运行这个游戏。<br>请使用新版 Chrome / Edge / Firefox / Safari 打开。');
      return;
    }
    if (!renderer.capabilities.isWebGL2) { loading.error('需要支持 WebGL2 的浏览器。'); return; }
    this.renderer = renderer;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setSize(innerWidth, innerHeight);
    renderer.domElement.id = 'game';
    document.body.prepend(renderer.domElement);
    const params = new URLSearchParams(location.search);
    this.params = params;

    // ---------- state ----------
    this.saved = hasSave();
    this.S = loadState() || defaultState();
    const S = this.S;
    if (params.get('quality')) S.settings.quality = params.get('quality');

    const U = this.U = {
      uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSkyAmbient: { value: new THREE.Color(0.3, 0.35, 0.4) }, uNight: { value: 0 }, uRain: { value: 0 }, uWet: { value: 0 },
      uWind: { value: new THREE.Vector2(0.55, 0.3) }, uPlayerPos: { value: new THREE.Vector3() },
      uFocus: { value: new THREE.Vector3(0, -999, 0) }, uOccR: { value: 2.2 }, uOccK: { value: 0.82 },
      uNearF: { value: new THREE.Vector2(1.4, 2.8) },
    };
    const scene = this.scene = new THREE.Scene();
    const camera = this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.15, 1400);
    scene.add(camera);   // the first-person hands are parented to the camera

    loading.set('正在生成写实材质……', 0.04); await nextFrame();
    bakeTextures(renderer, { groundSize: this.qualityKey() === 'low' ? 512 : 1024 });
    buildLeafAtlas(renderer);
    loading.set('正在堆起山丘、挖出小河……', 0.08); await nextFrame();
    const T = this.T = new Terrain();
    const col = this.col = new Colliders();
    loading.set('正在种下树木和花草……', 0.25); await nextFrame();
    const veg = this.veg = new Vegetation(T, U, col);
    veg.plan();
    loading.set('正在铺开草地……', 0.4); await nextFrame();
    const tMesh = T.buildMesh(U); scene.add(tMesh);
    const far = T.buildFarMountains(); if (far) scene.add(far);
    loading.set('正在引来一池清水……', 0.5); await nextFrame();
    this.env = new Environment(renderer, scene, U);
    this.env.snapWeather(S.weather);
    const water = this.water = new Water(T, U);
    scene.add(water.group);
    loading.set('正在搭建小木屋……', 0.6); await nextFrame();
    const st = this.structures = new Structures(T, U, col);
    scene.add(st.group);
    const farm = this.farm = new Farm(T, U, veg, col, st);
    if (S.tiles && S.tiles.length) farm.load(S.tiles); else farm.seedDefault();
    scene.add(farm.group);
    loading.set('正在长出青草……', 0.72); await nextFrame();
    veg.build(st, (x, z) => farm.isTilled(x, z));
    scene.add(veg.group);
    loading.set('正在叫醒小镇居民……', 0.86); await nextFrame();
    const player = this.player = new Player(T, col, U);
    scene.add(player.root);
    const P = S.player;
    if (P && isFinite(P.x)) player.place(P.x, P.z, P.yaw); else player.place(SPAWN.x, SPAWN.z, 0);
    this.rig = new CameraRig(camera, renderer.domElement, T);
    this.rig.blockers = [[-4.2, 0, -16.6, 4.2, 9.5, -8.4], [SHOP.x - 1.5, 0, SHOP.z - 0.8, SHOP.x + 1.5, 4.2, SHOP.z + 0.9]];
    this.rig.sens = S.settings.sens || 1;
    this.rig.onFov = (fov) => this.fx && this.fx.setViewport(this.renderer.getDrawingBufferSize(_sz).y, fov);
    this.rig.onViewRequest = (v, wheel) => { if (this.mode === 'play' && !this.ui.modal) this.setView(v, wheel); };
    this.rig.setFP(S.settings.view === 'first');
    this.vm = new ViewModel(camera, U);
    player.vm = this.vm;
    this.fpVis = false; this.frameNo = 0;
    this.fx = new FX(scene, U, T);
    this.fx.setButterflySpots((veg.flowerSpots || []).filter(s => Math.hypot((s.x ?? s[0]) - 2, (s.z ?? s[1]) + 6) < 45).slice(0, 8));
    this.audio = new AudioSys();
    this.audio.setVolumes({ music: S.settings.music, sfx: S.settings.sfx });
    this.fishing = new Fishing({
      scene, T, U, water, player, fx: this.fx, audio: this.audio,
      getCtx: () => ({ hour: (this.S.minutes / 60) % 24, weather: this.S.weather, rodLevel: this.S.rodLevel }),
      onEvent: (type, d) => this.onFishEvent(type, d),
    });
    this.pipeline = new Pipeline(renderer, scene, camera);
    this.pipeline.onTargets = () => this.bindTargets();
    this.ui = new UI(this);
    this.ui.initMinimap(T, [
      { x: CABIN.x, z: CABIN.z, icon: '🏠', edge: true }, { x: SHOP.x, z: SHOP.z, icon: '🌱' }, { x: BIN.x, z: BIN.z, icon: '📦' },
      { x: 12, z: -12, icon: '🥕' }, { x: -15.5, z: -3.6, icon: '🎣', edge: true }, { x: T.bridge.cx, z: T.bridge.cz, icon: '🌉', edge: true },
      { x: T.cascade.x, z: T.cascade.z, icon: '💧', edge: true }, { x: -34, z: -44, icon: '🍄', edge: true },
    ]);
    this.applyQuality(true);
    addEventListener('resize', () => this.onResize());
    this.onResize();
    this.setupInput();
    // misc runtime
    this.mode = 'title'; this.realT = 0; this.keys = {}; this.mouseDown = false;
    this.saveT = 0; this.mapT = 0; this.ripeT = 0; this.ripeTiles = []; this.wadeT = 0; this.rainWetT = 0; this.fpsAcc = []; this.autoChecked = false;
    this.toastCool = {}; this.seq = null; this.tipT = 0;
    U.uWet.value = S.weather === 'rain' ? 1 : 0;
    farm.onRipe = () => {};
    player.onStep = (surface, run) => this.onStep(surface, run);
    player.onJump = () => this.audio.play('jump', { vol: 0.6 });
    player.onLand = () => { this.audio.play('land', { vol: 0.6 }); this.fx.dust(player.pos, 1.2); this.landed = true; };
    this.setTool(S.tool || 0, true);
    this.ui.renderHotbar(); this.ui.updateHUD(this.env);
    // warm up: compile + first render
    loading.set('马上就好……', 0.95); await nextFrame();
    this.env.update(0.016, (S.minutes / 60) % 24, S.weather, player.pos, 0);
    this.titleCamera(0);
    {
      const vm = this.vm; vm.root.visible = true;
      for (const k in vm.T) vm.T[k].g.visible = true;
      try { renderer.compile(scene, camera); } catch (e) { /* ignore */ }
      for (const k in vm.T) vm.T[k].g.visible = vm.shown === k;
      vm.root.visible = false;
    }
    this.pipeline.render(this.env.exposure, 0);
    loading.done();
    const auto = sessionStorage.getItem('qingxi-autostart');
    if (auto) { sessionStorage.removeItem('qingxi-autostart'); this.startPlay(true); }
    else if (params.get('autostart')) this.startPlay(!this.saved);
    else this.ui.showTitle(this.saved);
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
    window.__game = this;
  }

  // ------------------------------------------------------------------ setup helpers
  bindTargets() {
    const p = this.pipeline;
    this.water.bindTargets(p.rt1.texture, p.rt1.depthTexture, p.width, p.height, this.camera, this.env.cubeRT.texture);
  }
  onResize() {
    const r = this.renderer;
    r.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    const v = r.getDrawingBufferSize(new THREE.Vector2());
    this.pipeline.setSize(v.x, v.y);
    this.bindTargets();
    this.fx.setViewport(v.y, this.camera.fov);
    this.vm && this.vm.resize(innerWidth, innerHeight);
  }
  qualityKey() { const q = this.S.settings.quality; return q === 'auto' ? (this.autoQ || 'medium') : q; }
  qualityName() { const q = this.S.settings.quality; return q === 'auto' ? `自动（${QUALITY[this.qualityKey()].name}）` : QUALITY[q].name; }
  applyQuality(initial) {
    const qk = this.qualityKey(), Q = QUALITY[qk];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(Math.min(dpr * Q.pr, qk === 'high' ? 2 : 1.25));
    this.env.setShadowQuality(Q.shadow);
    this.water.setQuality(qk);
    this.veg.setQuality(qk);
    this.pipeline.setMSAA(Q.msaa);
    if (!initial) this.onResize();
  }
  setupInput() {
    const prevent = new Set([' ', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    addEventListener('keydown', e => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (prevent.has(e.key)) e.preventDefault();
      if (e.repeat && k !== ' ') { this.keys[k] = true; return; }
      this.keys[k] = true;
      this.audio.start();
      this.onKey(k, e);
    });
    addEventListener('keyup', e => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys[k] = false;
      if (k === 'f' && this.mode === 'play' && this.fishing.state === 'charge') this.fishing.release();
    });
    addEventListener('blur', () => { this.keys = {}; this.mouseDown = false; });
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', e => { if (e.button === 0) this.mouseDown = true; this.audio.start(); });
    addEventListener('pointerup', e => { if (e.button === 0) this.mouseDown = false; });
    this.rig.onPress = () => {
      if (this.mode !== 'play' || this.ui.modal) return;
      if (this.fishing.state === 'bite' || this.fishing.state === 'wait') { this.fishing.press(); this.rig.dragLeft = false; return; }
      if (this.slot().id === 'rod' && this.fishing.state === 'idle') { this.tryStartFishing(); }
      this.rig.dragLeft = !this.fishing.active;
    };
    this.rig.onRelease = () => {
      if (this.fishing.state === 'charge') this.fishing.release();
      setTimeout(() => { this.rig.dragLeft = true; }, 0);
    };
    this.rig.onClick = () => {
      if (this.mode !== 'play' || this.ui.modal) return;
      if (this.slot().id === 'rod') return;
      this.useTool();
    };
    dom.addEventListener('wheel', e => {
      if (e.altKey && this.mode === 'play') { e.preventDefault(); this.setTool((this.S.tool + (e.deltaY > 0 ? 1 : SLOTS.length - 1)) % SLOTS.length); }
    }, { passive: false });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play') this.save(); });
    addEventListener('beforeunload', () => { if (this.mode === 'play' || this.mode === 'sleep') this.save(); });
  }
  onKey(k, e) {
    const ui = this.ui;
    if (k === 'Escape') {
      // Esc first just releases the mouse in first person (the browser does that itself, too)
      if (this.rig.locked) { this.rig.exitLock(); return; }
      if (performance.now() - this.rig.lockReleasedAt < 500) return;
      if (ui.modal) { this.sfx('close'); ui.close(); return; }
      if (this.mode === 'play' && this.fishing.active && this.fishing.state !== 'caught') { this.fishing.cancel(); return; }
      if (this.mode === 'play') { this.sfx('open'); ui.open('settings'); }
      return;
    }
    if (this.mode !== 'play') return;
    if (ui.modal) {
      if ((k === 'Tab' && ui.modal === 'bag') || (k === 'l' && ui.modal === 'log') || (k === 'h' && ui.modal === 'help')) { this.sfx('close'); ui.close(); }
      return;
    }
    if (this.seq) return;
    if (k >= '1' && k <= '9') { this.setTool(+k - 1); return; }
    if (k === 'Tab') { this.sfx('open'); ui.open('bag'); return; }
    if (k === 'l') { this.sfx('open'); ui.open('log'); return; }
    if (k === 'h') { this.sfx('open'); ui.open('help'); return; }
    if (k === 'm') { ui.mapWrap.style.display = ui.mapWrap.style.display === 'none' ? '' : 'none'; return; }
    if (k === 'v') { this.toggleView(true); return; }
    if (k === 'e') { this.interact(); return; }
    if (k === 'f') {
      if (this.fishing.active) { this.fishing.press(); return; }
      if (this.slot().id === 'rod') { this.tryStartFishing(); return; }
      this.useTool(); return;
    }
    void e;
  }
  sfx(name, vol) { this.audio.play(name, { vol: vol ?? 0.8 }); }
  toastOnce(key, text, kind = 'bad', cool = 1.2) {
    const now = this.realT;
    if (this.toastCool[key] && now - this.toastCool[key] < cool) return;
    this.toastCool[key] = now;
    this.ui.toast(text, kind);
  }

  // ------------------------------------------------------------------ tools & farming
  slot() { return SLOTS[this.S.tool] || SLOTS[0]; }
  selectSlot(i) { this.setTool(i); }
  setTool(i, silent) {
    if (this.fishing && this.fishing.active && this.fishing.state !== 'caught') this.fishing.cancel();
    this.S.tool = clamp(i, 0, SLOTS.length - 1);
    const s = this.slot();
    this.player.setTool(s.type === 'seed' ? 'seeds' : s.id);
    if (s.type === 'seed' && this.vm) this.vm.setSeed(s.id, CROPS[s.id].icon);
    if (!silent) {
      this.sfx('select', 0.6);
      let name = s.name;
      if (s.type === 'seed') name += `（${this.S.seeds[s.id] || 0}）`;
      if (s.id === 'can') name += `（${Math.round(this.S.water)}/${this.S.waterMax}）`;
      this.ui.flashToolName(name);
    }
    this.ui && this.ui.renderHotbar();
  }
  targetTile() {
    if (this.fpAimOn()) { const a = this.fpAim(); return { i: Math.floor(a.x), j: Math.floor(a.z) }; }
    const p = this.player, f = p.forward(new THREE.Vector3());
    return { i: Math.floor(p.pos.x + f.x * 0.95), j: Math.floor(p.pos.z + f.z * 0.95) };
  }
  // ---- first person aiming: where the crosshair meets the ground / water (cached per frame)
  fpAimOn() { return this.mode === 'play' && this.rig.fp && this.rig.fpK > 0.5; }
  fpAim() {
    const a = this._aim || (this._aim = { x: 0, y: 0, z: 0, hit: false, water: false, hd: 0, f: -1 });
    if (a.f === this.frameNo) return a;
    a.f = this.frameNo;
    const cam = this.camera, o = cam.position, T = this.T, p = this.player.pos;
    const d = _dir.set(0, 0, -1).applyQuaternion(cam.quaternion);
    a.hit = false; a.water = false;
    for (let s = 0.3; s <= 7; s += s < 3 ? 0.05 : 0.12) {
      const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s;
      const g = T.heightAt(x, z), lv = T.waterLevelAt(x, z), w = lv > -40 && lv > g + 0.01;
      if (y <= (w ? lv : g)) { a.hit = true; a.water = w; a.x = x; a.y = w ? lv : g; a.z = z; break; }
    }
    a.hd = a.hit ? Math.hypot(a.x - p.x, a.z - p.z) : 1e9;
    if (!a.hit || a.hd > REACH) {
      // out of reach: the work spot stops at arm's length along the view direction
      const l = Math.hypot(d.x, d.z) || 1;
      a.x = p.x + d.x / l * REACH; a.z = p.z + d.z / l * REACH; a.y = T.heightAt(a.x, a.z);
    }
    return a;
  }
  waterSourceAhead() {
    const p = this.player, f = p.forward(new THREE.Vector3()), T = this.T;
    if (p.waterDepth > 0.08) return 'water';
    if (this.fpAimOn()) { const a = this.fpAim(); if (a.hit && a.water && a.hd < 4.2) return 'water'; }
    for (const d of [0.5, 1.0, 1.5, 2.0]) {
      const w = T.waterAt(p.pos.x + f.x * d, p.pos.z + f.z * d);
      if (w && w.depth > 0.06) return 'water';
    }
    if (Math.hypot(p.pos.x - BARREL.x, p.pos.z - (BARREL.z + 0.4)) < 1.6) return 'barrel';
    return null;
  }
  nearInteract() {
    const p = this.player.pos;
    let best = null, bd = 1e9;
    for (const it of this.structures.interact) {
      const d = Math.hypot(p.x - it.x, p.z - it.z);
      if (d < it.r && d < bd) { bd = d; best = it; }
    }
    return best;
  }
  ripeAt(i, j) { const t = this.farm.get(i, j); return this.farm.ripe(t) ? t : null; }
  harvest(i, j) {
    const p = this.player;
    p.startAction('harvest', 0.7, 0.45, () => {
      const r = this.farm.harvest(i, j);
      if (!r) return;
      const S = this.S;
      S.items[r.type] = (S.items[r.type] || 0) + r.n;
      S.cropLog[r.type] = (S.cropLog[r.type] || 0) + r.n;
      S.stats.harvested++;
      this.fx.sparkle(new THREE.Vector3(i + 0.5, r.pos.y + 0.3, j + 0.5), 10, '#fff1a8');
      this.fx.leaves(new THREE.Vector3(i + 0.5, r.pos.y, j + 0.5), 5);
      this.sfx('harvest');
      this.ui.toast(`收获 ${CROPS[r.type].icon} ${CROPS[r.type].name} × ${r.n}`, 'good');
      if (!S.flags) S.flags = {};
      if (!S.flags.binTip) { S.flags.binTip = 1; setTimeout(() => this.ui.toast('把收获放进小屋门前的 📦 出货箱就能换钱', ''), 1800); }
    });
  }
  useTool() {
    const p = this.player, S = this.S;
    if (p.busy() || this.fishing.active || this.seq) return;
    const { i, j } = this.targetTile();
    if (this.ripeAt(i, j)) { this.harvest(i, j); return; }
    const s = this.slot();
    const tile = this.farm.get(i, j);
    if (s.id === 'hoe') {
      const c = this.farm.canTill(i, j);
      if (!c.ok) {
        if (tile && tile.crop && !this.farm.ripe(tile)) { this.toastOnce('hoe', `这里种着${CROPS[tile.crop.type].name}，还没成熟哦`); return; }
        this.toastOnce('hoe', c.reason); this.sfx('error', 0.5); return;
      }
      p.startAction('hoe', 0.62, 0.56, () => {
        const r = this.farm.till(i, j);
        if (r && r.ok) {
          const y = this.T.heightAt(i + 0.5, j + 0.5);
          this.fx.dirt(new THREE.Vector3(i + 0.5, y, j + 0.5), 16);
          this.sfx('hoe'); S.stats.tilled++;
          if (S.weather === 'rain') this.farm.water(i, j);
        }
      });
    } else if (s.id === 'can') {
      const src = this.waterSourceAhead();
      if (src && (S.water < S.waterMax || !tile)) {
        if (S.water >= S.waterMax) { this.toastOnce('full', '水壶已经是满的了', ''); return; }
        p.startAction('refill', 1.0, 0.5, () => {
          S.water = S.waterMax; this.sfx('refill');
          const f = p.forward(new THREE.Vector3());
          const x = p.pos.x + f.x * 0.9, z = p.pos.z + f.z * 0.9;
          if (src === 'water') { this.water.addRipple(x, z, 0.8); this.fx.splash(new THREE.Vector3(x, this.T.waterLevelAt(x, z), z), 8, 0.6); }
          this.ui.toast('水壶装满啦 💧', 'good'); this.ui.renderHotbar();
        });
        return;
      }
      if (S.water <= 0) { this.toastOnce('empty', '水壶空了，去池塘、小河或水桶装水吧'); this.sfx('error', 0.5); return; }
      if (!tile) { this.toastOnce('nowater', '这里没有需要浇水的田', ''); return; }
      if (tile.wet) { this.toastOnce('wet', '这块地已经浇过水了', ''); return; }
      this.pourAt = { x: i + 0.5, z: j + 0.5 };
      p.startAction('water', 0.95, 0.35, () => {
        this.farm.water(i, j); S.water = Math.max(0, S.water - 1); this.ui.renderHotbar();
        if (!S.flags) S.flags = {};
      });
      this.sfx('pour', 0.8);
    } else if (s.type === 'seed') {
      const k = s.id, n = S.seeds[k] || 0;
      if (!tile) { this.toastOnce('till', '先用锄头开垦土地，再来播种吧'); return; }
      if (tile.crop) { this.toastOnce('crop', `这里已经种了${CROPS[tile.crop.type].name}`); return; }
      if (n <= 0) { this.toastOnce('seed', `没有${CROPS[k].name}种子了，去种子铺买一些吧`); this.sfx('error', 0.5); return; }
      p.startAction('plant', 0.7, 0.45, () => {
        if (!this.farm.plant(i, j, k)) return;
        S.seeds[k]--; this.ui.renderHotbar();
        this.fx.dirt(new THREE.Vector3(i + 0.5, tile.y + 0.05, j + 0.5), 5);
        this.sfx('plant');
        if (!tile.wet) this.toastOnce('waterTip', '记得用水壶浇水，作物才会长大哦', '', 20);
      });
    }
  }
  tryStartFishing() {
    if (this.player.busy() || this.seq) return;
    if (!this.fishing.waterAhead()) { this.toastOnce('fish', '面向水面才能钓鱼哦'); return; }
    this.fishing.press();
    this.rig.dragLeft = false;
  }
  interact() {
    const p = this.player;
    if (p.busy() || this.seq) return;
    if (this.fishing.active) { this.fishing.press(); return; }
    const { i, j } = this.targetTile();
    if (this.ripeAt(i, j)) { this.harvest(i, j); return; }
    // nearby ripe crop (adjacent) for convenience
    for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = Math.floor(p.pos.x) + di, jj = Math.floor(p.pos.z) + dj;
      if (this.ripeAt(ii, jj) && Math.hypot(ii + 0.5 - p.pos.x, jj + 0.5 - p.pos.z) < 1.25) { this.harvest(ii, jj); return; }
    }
    const it = this.nearInteract();
    if (it) {
      if (it.id === 'bed') this.askSleep();
      else if (it.id === 'shop') { this.sfx('open'); this.ui.open('shop'); }
      else if (it.id === 'bin') { this.sfx('open'); this.ui.open('bin'); }
      else if (it.id === 'sign') { this.sfx('open'); this.ui.open('sign'); }
      else if (it.id === 'barrel') { if (this.slot().id !== 'can') this.setTool(1); this.useTool(); }
      return;
    }
    if (this.waterSourceAhead() === 'water') { if (this.slot().id !== 'can') this.setTool(1); this.useTool(); return; }
  }
  // ------------------------------------------------------------------ economy
  buySeed(k, n) {
    const S = this.S, cost = CROPS[k].seed * n;
    if (S.coins < cost) { this.ui.toast('金币不够啦', 'bad'); this.sfx('error'); return; }
    S.coins -= cost; S.seeds[k] = (S.seeds[k] || 0) + n;
    this.sfx('coin'); this.ui.toast(`买到 ${CROPS[k].icon} ${CROPS[k].name}种子 × ${n}`, 'good');
    this.ui.render(); this.ui.renderHotbar();
  }
  buyUpgrade(id) {
    const S = this.S, u = UPGRADES[id];
    if (S.coins < u.price) { this.ui.toast('金币不够啦', 'bad'); this.sfx('error'); return; }
    S.coins -= u.price;
    if (id === 'can') { S.canLevel = 2; S.waterMax = 60; S.water = 60; }
    if (id === 'rod') S.rodLevel = 2;
    this.sfx('catch'); this.ui.toast(`获得了 ${u.name}！`, 'good');
    this.ui.render(); this.ui.renderHotbar(); this.save();
  }
  priceOf(k) { return CROPS[k] ? CROPS[k].sell : FISH[k] ? FISH[k].price : 0; }
  sellItem(k, n) {
    const S = this.S; n = Math.min(n, S.items[k] || 0); if (n <= 0) return;
    const g = this.priceOf(k) * n;
    S.items[k] -= n; if (S.items[k] <= 0) delete S.items[k];
    S.coins += g; S.stats.earned += g; S.dayEarned = (S.dayEarned || 0) + g;
    this.sfx('coin'); this.ui.toast(`卖出获得 ${g} 金`, 'good');
    this.ui.render();
  }
  sellAll() {
    const S = this.S; let g = 0;
    for (const k of Object.keys(S.items)) { g += this.priceOf(k) * S.items[k]; }
    if (!g) return;
    S.items = {}; S.coins += g; S.stats.earned += g; S.dayEarned = (S.dayEarned || 0) + g;
    this.sfx('coin'); this.ui.toast(`全部卖出，获得 ${g} 金！`, 'good');
    this.ui.render(); this.save();
  }
  setSetting(k, v) {
    const s = this.S.settings; s[k] = v;
    if (k === 'music' || k === 'sfx') this.audio.setVolumes({ music: s.music, sfx: s.sfx });
    if (k === 'quality') { this.autoChecked = false; this.applyQuality(false); }
    if (k === 'sens') this.rig.sens = v;
    if (k === 'view') this.setView(v);
    this.ui.updateHUD(this.env);
    this.save();
  }
  cycleSpeed() { const s = this.S.settings; s.speed = s.speed === 1 ? 2 : s.speed === 2 ? 4 : 1; this.ui.updateHUD(this.env); }
  onModal(open) {
    this.rig.enabled = !open;
    if (open) { this.keys = {}; this.mouseDown = false; this.fishing.holding = false; this.rig.exitLock(); }
  }
  // ------------------------------------------------------------------ first / third person
  setView(v, fromWheel) {
    const fp = v === 'first', S = this.S;
    S.settings.view = fp ? 'first' : 'third';
    if (this.rig.fp !== fp) {
      this.rig.setFP(fp, fromWheel);
      if (this.mode === 'play') this.sfx('select', 0.5);
      if (fp && this.mode === 'play') {
        if (!S.flags) S.flags = {};
        if (!S.flags.fpTip) { S.flags.fpTip = 1; this.ui.toast('第一人称：点击画面锁定鼠标，移动鼠标环顾；Esc 释放鼠标，按 V 或滚轮切回', '', '👁️'); }
      }
    }
    this.ui.renderViewState && this.ui.renderViewState();
    this.save();
  }
  toggleView(fromKey) {
    this.setView(this.rig.fp ? 'third' : 'first');
    // a key press counts as a user gesture, so the mouse can be captured right away
    if (fromKey && this.rig.fp && this.mode === 'play' && !this.ui.modal && this.rig.canLock()) this.rig.requestLock();
  }
  // ------------------------------------------------------------------ fishing events
  onFishEvent(type, d) {
    const S = this.S;
    if (type === 'toast') this.ui.toast(d, '');
    else if (type === 'catch') {
      S.items[d.key] = (S.items[d.key] || 0) + 1;
      const L = S.fishLog[d.key];
      const isNew = !L, isRecord = L && d.len > L.max;
      S.fishLog[d.key] = { n: (L ? L.n : 0) + 1, max: Math.max(L ? L.max : 0, d.len) };
      S.stats.fishCaught++;
      this.ui.showCatch(d, isNew, isRecord);
      this.save();
    }
  }
  // ------------------------------------------------------------------ day cycle
  askSleep() {
    const h = (this.S.minutes / 60);
    const text = h < 18 && h >= 6 ? '天还亮着呢，确定现在就睡觉吗？<br><span style="font-size:13px;opacity:.7">作物会在夜里继续生长</span>' : '今天辛苦啦，回小屋睡觉吧？<br><span style="font-size:13px;opacity:.7">作物会在夜里继续生长</span>';
    this.ui.confirm(text, '睡觉 💤', () => this.startSleep(false), '再玩一会儿');
  }
  rollWeather() { const r = Math.random(); return r < 0.55 ? 'sunny' : r < 0.8 ? 'cloudy' : 'rain'; }
  startSleep(passOut) {
    if (this.seq) return;
    this.fishing.cancel();
    this.seq = { t: 0, passOut, phase: 0 };
    this.sfx('sleep');
    if (passOut) this.ui.toast('你太累了，迷迷糊糊地走回了小屋……', 'bad');
  }
  newDay() {
    const S = this.S;
    const target = 30 * 60; // next 6:00
    const skip = Math.max(0, target - S.minutes);
    this.farm.grow(skip);
    const earned = S.dayEarned || 0;
    S.day++; S.minutes = 6 * 60;
    S.weather = S.tomorrow || this.rollWeather();
    S.tomorrow = this.rollWeather();
    S.dayEarned = 0; S.stats.daysPlayed = S.day;
    this.farm.newDay(S.weather === 'rain');
    this.U.uWet.value = S.weather === 'rain' ? 1 : this.U.uWet.value * 0.4;
    this.player.place(SPAWN.x, SPAWN.z, 0);
    this.rig.yaw = 0.35; this.rig.pitch = 0.38; this.rig.fpPitch = 0.12; this.rig.inited = false;
    this.env.snapWeather(S.weather);
    const ripe = [...this.farm.tiles.values()].filter(t => this.farm.ripe(t)).length;
    this.save();
    return { earned, ripe };
  }
  updateSeq(rdt) {
    const q = this.seq; q.t += rdt;
    const cu = this.pipeline.compMat.uniforms;
    if (q.phase === 0) { cu.uFade.value = smoothstep(0, 1.2, q.t); if (q.t > 1.3) { q.phase = 1; q.t = 0; q.info = this.newDay(); const S = this.S; this.ui.fadeText(`第 ${S.day} 天`, `${WEATHER_NAME[S.weather]}${q.info.earned ? `<br>昨天的收入：${q.info.earned} 金` : ''}${q.info.ripe ? `<br>菜园里有 ${q.info.ripe} 株作物成熟了` : ''}`); } }
    else if (q.phase === 1) { cu.uFade.value = 1; if (q.t > 2.4) { q.phase = 2; q.t = 0; this.ui.fadeTextHide(); this.sfx('morning'); } }
    else { cu.uFade.value = 1 - smoothstep(0, 1.4, q.t); if (q.t > 1.5) { cu.uFade.value = 0; this.seq = null; } }
  }
  // ------------------------------------------------------------------ title / start
  titleCamera(t) {
    const a = 0.6 + t * 0.035, tgt = new THREE.Vector3(4, HOME_H + 1.5, -9);
    const d = 27, pitch = 0.36;
    this.camera.position.set(tgt.x + Math.sin(a) * Math.cos(pitch) * d, tgt.y + Math.sin(pitch) * d, tgt.z + Math.cos(a) * Math.cos(pitch) * d);
    const gh = this.T.heightAt(this.camera.position.x, this.camera.position.z);
    if (this.camera.position.y < gh + 2) this.camera.position.y = gh + 2;
    this.camera.lookAt(tgt);
  }
  startPlay(fresh) {
    this.audio.start();
    this.ui.close();
    this.ui.hideTitle();
    this.mode = 'play';
    this.rig.inited = false;
    this.S.started = true;
    if (fresh) {
      setTimeout(() => this.ui.toast('欢迎来到青溪小筑！🌿', 'good'), 600);
      setTimeout(() => this.ui.toast('东边菜园里有成熟的蔬菜，走过去按 E 收获吧', ''), 3800);
      setTimeout(() => this.ui.toast('按 H 可以随时查看玩法说明', ''), 8000);
    } else setTimeout(() => this.ui.toast(`欢迎回来！今天是第 ${this.S.day} 天`, 'good'), 500);
    this.save();
  }
  continueGame() { this.startPlay(false); }
  newGame() {
    if (!this.saved && !this.S.started) { this.startPlay(true); return; }
    clearSave();
    try { sessionStorage.setItem('qingxi-autostart', 'new'); } catch (e) { /* ignore */ }
    this.noSave = true;
    location.reload();
  }
  resetSave() { this.newGame(); }
  toTitle() { this.save(); this.mode = 'title'; this.saved = true; this.fishing.cancel(); this.rig.exitLock(); this.rig.resetFov(); this.ui.showTitle(true); }
  save() {
    if (this.noSave) return;
    const S = this.S, p = this.player;
    S.tiles = this.farm.serialize();
    S.player = { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(3) };
    saveState(S);
  }
  // ------------------------------------------------------------------ per-frame
  onStep(surface, run) {
    const p = this.player;
    this.audio.play('step', { surface, vol: run ? 1 : 0.75 });
    if (surface === 'water') { this.water.addRipple(p.pos.x, p.pos.z, 0.55); this.fx.splash(new THREE.Vector3(p.pos.x, p.waterLevel, p.pos.z), 4, 0.5); }
    else if (run && (surface === 'path' || surface === 'grass')) this.fx.dust(p.pos, surface === 'path' ? 1 : 0.6);
  }
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    const rdt = Math.min(0.1, Math.max(0, (now - this.last) / 1000)); this.last = now;
    this.frame(rdt);
  }
  frame(rdt) {
    const S = this.S, p = this.player, ui = this.ui;
    this.realT += rdt; this.frameNo++;
    const t = this.realT;
    this.U.uTime.value = t;
    const paused = !!ui.modal && this.mode === 'play';
    // ---- time ----
    let dMin = 0;
    if (this.mode === 'play' && !paused && !this.seq) {
      dMin = rdt * MINUTES_PER_SEC * S.settings.speed;
      S.minutes += dMin;
      this.farm.grow(dMin);
      if (S.minutes >= 26 * 60) this.startSleep(true);
    }
    if (this.seq) this.updateSeq(rdt);
    const hour = (S.minutes / 60) % 24;
    // ---- wind ----
    const wv = this.U.uWind.value; const gust = 0.5 + 0.5 * Math.sin(t * 0.13) * Math.sin(t * 0.071 + 1);
    const wmag = (S.weather === 'rain' ? 1.0 : S.weather === 'cloudy' ? 0.75 : 0.5) * (0.6 + 0.6 * gust);
    wv.set(Math.cos(0.6) * wmag, Math.sin(0.6) * wmag);
    // ---- player ----
    const k = this.keys;
    const locked = this.mode !== 'play' || paused || !!this.seq || this.fishing.locked;
    if (this.mode === 'play' && this.fishing.state === 'wait' && (k.w || k.a || k.s || k.d || k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight)) this.fishing.retrieve();
    const input = {
      fwd: k.w || k.ArrowUp, back: k.s || k.ArrowDown, left: k.a || k.ArrowLeft, right: k.d || k.ArrowRight,
      run: k.Shift, jump: k[' '] && this.fishing.state === 'idle', locked,
      // first person: the body turns with the view (but stays put while a line is out)
      face: this.mode === 'play' && this.rig.fp && !this.fishing.active ? this.rig.yaw + Math.PI : null,
    };
    p.update(this.mode === 'play' && !paused ? rdt : (this.mode === 'title' ? rdt : 0), input, this.rig.yaw, t);
    // wading ripples
    if (p.waterDepth > 0.05) {
      this.wadeT -= rdt;
      if (this.wadeT < 0) { this.wadeT = p.speed > 0.5 ? 0.35 : 1.4; this.water.addRipple(p.pos.x, p.pos.z, p.speed > 0.5 ? 0.4 : 0.15); }
    }
    // ---- camera ----
    const U = this.U;
    if (this.mode === 'title') { this.titleCamera(t); U.uFocus.value.set(4, HOME_H + 1.5, -9); U.uOccR.value = 6.5; U.uOccK.value = 1.02; U.uNearF.value.set(1.4, 2.8); }
    else {
      const a = p.action, u = p.actionT;
      const crouch = (a === 'plant' || a === 'harvest') ? smoothstep(0, 0.35, u) * (1 - smoothstep(0.7, 1, u))
        : a === 'refill' ? 0.75 * smoothstep(0, 0.3, u) * (1 - smoothstep(0.7, 1, u)) : 0;
      this.rig.update(rdt, p.pos, { rotL: k.q, rotR: k.r }, { speed: p.speed, run: !!k.Shift, walkPhase: p.walkPhase, grounded: p.grounded, crouch, landed: this.landed });
      const fpk = this.rig.fpK > 0.5;
      U.uFocus.value.copy(p.pos); U.uFocus.value.y += 1.0; U.uOccR.value = 2.3; U.uOccK.value = fpk ? 0 : 1.0;
      U.uNearF.value.set(fpk ? 0.25 : 1.4, fpk ? 0.6 : 2.8);
    }
    this.landed = false;
    // first-person hands replace the body once the camera is (nearly) at the eyes
    const fpVis = this.mode === 'play' && this.rig.fpK > 0.85;
    if (fpVis !== this.fpVis) {
      this.fpVis = fpVis;
      p.setFirstPerson(fpVis, this.vm);
      this.vm.root.visible = fpVis;
      if (fpVis) this.vm.drop();
    }
    if (fpVis) {
      const F = this.fishing;
      this.vm.update(rdt, t, {
        tool: p.tool, action: p.action, u: p.actionT, speed: p.speed, run: !!k.Shift, walkPhase: p.walkPhase, grounded: p.grounded, vy: p.vy,
        reelK: p.reelK || 0, rodBend: p.rodBend || 0, charge: F.state === 'charge' ? F.power : 0, yawVel: this.rig.yawVel, pitchVel: this.rig.pitchVel,
      });
    }
    // pour particles while watering
    if (p.action === 'water' && p.actionT > 0.28 && p.actionT < 0.85) {
      const sp = p.spoutWorld(_v);
      if (fpVis && this.pourAt) {
        // aim the stream from the hand-held can at the tile being watered
        const tx = this.pourAt.x, tz = this.pourAt.z, ty = this.T.heightAt(tx, tz), ft = 0.42;
        _v2.set((tx - sp.x) / ft, (ty - sp.y + 4.9 * ft * ft) / ft, (tz - sp.z) / ft).multiplyScalar(1 / 1.85);
        this.fx.pour(sp, _v2, rdt);
      } else {
        const f = p.forward(_v2);
        this.fx.pour(sp, _v2.set(f.x * 0.55, -0.35, f.z * 0.55), rdt);
      }
    }
    // ---- fishing ----
    this.fishing.holding = this.mouseDown || !!k[' '] || !!k.f;
    if (!paused) this.fishing.update(rdt, t);
    // rain keeps soil wet
    if (S.weather === 'rain') { this.rainWetT -= rdt; if (this.rainWetT < 0) { this.rainWetT = 2; this.farm.setAllWet(); } }
    // ---- world updates ----
    this.env.update(rdt, hour, S.weather, p.pos, t);
    const uw = this.U.uWet;
    uw.value = Math.max(this.env.wx.rain, uw.value - rdt * (S.weather === 'rain' ? 0 : 0.0035 * S.settings.speed));
    this.structures.update(rdt, t, this.env.nightK);
    this.veg.update(this.camera, this.U.uFocus.value);
    const hand = p.root.position.clone(); hand.y += 1.2;
    this.farm.update(rdt, hand);
    this.ripeT -= rdt;
    if (this.ripeT < 0) {
      this.ripeT = 1;
      this.ripeTiles = [];
      for (const tl of this.farm.tiles.values()) if (this.farm.ripe(tl) && Math.hypot(tl.i - p.pos.x, tl.j - p.pos.z) < 30) this.ripeTiles.push(tl);
    }
    this.fx.update(rdt, t, { camPos: this.camera.position, player: p, env: this.env, structures: this.structures, weather: S.weather, nightK: this.env.nightK, dayK: this.env.dayK, wind: wv, ripeTiles: this.ripeTiles });
    // ---- audio ----
    const ri = this.T.riverInfo(p.pos.x, p.pos.z);
    this.audio.update(rdt, {
      rain: this.env.wx.rain, dayK: this.env.dayK, nightK: this.env.nightK,
      riverDist: Math.max(0, ri.edge), riverFast: this.T.riverSpeed(ri.s) > 1.3,
      cascadeDist: Math.hypot(p.pos.x - this.T.cascade.x, p.pos.z - this.T.cascade.z),
      pondDist: Math.max(0, Math.hypot(p.pos.x - POND.x, p.pos.z - POND.z) - POND.r),
      forest: this.T.sampleGrid(this.T.forest, p.pos.x, p.pos.z) > 0.35, elev: p.pos.y > 8,
    });
    // ---- UI ----
    if (this.mode === 'play') this.updatePlayUI(paused);
    ui.updateHUD(this.env);
    this.mapT -= rdt;
    if (this.mapT < 0 && this.mode === 'play') { this.mapT = 0.1; ui.drawMinimap(p.pos.x, p.pos.z, p.yaw, this.rig.yaw); }
    // ---- autosave ----
    if (this.mode === 'play') { this.saveT += rdt; if (this.saveT > 30) { this.saveT = 0; this.save(); } }
    // ---- render ----
    this.pipeline.render(this.env.exposure, t);
    this.autoQuality(rdt);
  }
  autoQuality(rdt) {
    if (this.S.settings.quality !== 'auto' || this.autoChecked || this.mode !== 'play') return;
    this.fpsAcc.push(rdt);
    if (this.fpsAcc.length > 150) {
      const arr = this.fpsAcc.slice(30); const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      this.autoChecked = true; this.fpsAcc = [];
      const cur = this.autoQ || 'medium';
      if (avg > 1 / 32 && cur !== 'low') { this.autoQ = cur === 'high' ? 'medium' : 'low'; this.applyQuality(false); this.autoChecked = cur === 'high' ? false : true; }
      else if (avg < 1 / 57 && cur === 'medium' && (window.devicePixelRatio || 1) <= 1.5) { this.autoQ = 'high'; this.applyQuality(false); }
    }
  }
  updatePlayUI(paused) {
    const ui = this.ui, p = this.player, F = this.fishing, S = this.S;
    // fishing widgets anchored at the player's head (first person: beside the crosshair / above the float)
    let anchor;
    if (this.fpVis) {
      anchor = { x: innerWidth * 0.5 + 40, y: innerHeight * 0.5 + 40 };
      if (F.state === 'bite') {
        const b = _v.copy(F.bobPos); b.y += 0.45; b.project(this.camera);
        if (b.z < 1 && Math.abs(b.x) < 0.92 && Math.abs(b.y) < 0.92) anchor = { x: (b.x * 0.5 + 0.5) * innerWidth, y: (-b.y * 0.5 + 0.5) * innerHeight };
      }
    } else {
      const head = _v.copy(p.pos); head.y += 2.1;
      head.project(this.camera);
      anchor = { x: (head.x * 0.5 + 0.5) * innerWidth, y: (-head.y * 0.5 + 0.5) * innerHeight };
    }
    ui.updateFishing(F, anchor);
    ui.setFPState(this.fpVis && !paused && !this.seq, this.rig.locked, this.rig.dragLook);
    // target highlight & prompt
    let prompt = null, hl = false, ok = true;
    const s = this.slot();
    const { i, j } = this.targetTile();
    const tile = this.farm.get(i, j);
    const M = `<kbd>🖱</kbd>`;
    if (paused || this.seq) prompt = null;
    else if (F.active) {
      if (F.state === 'charge') prompt = '松开鼠标 抛竿';
      else if (F.state === 'wait') prompt = `等待鱼儿咬钩……　${M} 收竿`;
      else if (F.state === 'bite') prompt = '<b style="color:#d9604a">咬钩了！快点击！</b>';
      else if (F.state === 'reel') prompt = '按住 鼠标左键 / 空格 让绿条罩住鱼';
    } else if (!p.busy()) {
      const ripe = this.ripeAt(i, j);
      const it = this.nearInteract();
      if (ripe) { prompt = `<kbd>E</kbd> 收获 ${CROPS[ripe.crop.type].icon} ${CROPS[ripe.crop.type].name}`; hl = true; }
      else if (it) prompt = `<kbd>E</kbd> ${it.label}`;
      else if (s.id === 'hoe') {
        const c = this.farm.canTill(i, j); ok = c.ok;
        const wt = this.T.waterAt(i + 0.5, j + 0.5); hl = !(wt && wt.depth > 0.02);
        if (c.ok) prompt = `${M} 开垦`;
        else if (tile) { hl = true; ok = true; prompt = tile.crop ? `${CROPS[tile.crop.type].icon} ${CROPS[tile.crop.type].name} · ${tile.crop.stage >= 4 ? '已成熟' : `生长中 ${Math.floor(tile.crop.g * 100)}%`}${tile.wet ? ' · 💧' : ' · 需要浇水'}` : null; }
      } else if (s.id === 'can') {
        const src = this.waterSourceAhead();
        if (src && S.water < S.waterMax) prompt = `${M} 装水（${Math.round(S.water)}/${S.waterMax}）`;
        else if (tile) { hl = true; ok = !tile.wet && S.water > 0; prompt = tile.wet ? '已经浇过水了 💧' : S.water > 0 ? `${M} 浇水（剩 ${Math.round(S.water)}）` : '水壶空了，去水边装水'; }
      } else if (s.type === 'seed') {
        if (tile) { hl = true; ok = !tile.crop && (S.seeds[s.id] || 0) > 0; prompt = tile.crop ? `${CROPS[tile.crop.type].icon} ${CROPS[tile.crop.type].name} · 生长中 ${Math.floor(tile.crop.g * 100)}%${tile.wet ? ' · 💧' : ' · 需要浇水'}` : ok ? `${M} 播种 ${CROPS[s.id].icon} ${CROPS[s.id].name}` : `没有${CROPS[s.id].name}种子了`; }
      } else if (s.id === 'rod') {
        if (F.waterAhead()) prompt = `按住 ${M} 蓄力，松开抛竿`;
      }
    }
    this.farm.setHighlight(i, j, ok, hl && !F.active && !paused && this.mode === 'play');
    ui.setPrompt(prompt);
  }
}

const game = new Game();
game.boot().catch(err => {
  console.error(err);
  loading.error('加载时出了点问题：' + (err && err.message ? err.message : err));
});
