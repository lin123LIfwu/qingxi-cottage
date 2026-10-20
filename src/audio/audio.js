// Procedural WebAudio: ambience, sound effects and generative pentatonic music
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

export class AudioSys {
  constructor() {
    this.ctx = null; this.started = false;
    this.vol = { music: 0.45, sfx: 0.75, amb: 0.7 };
    this.amb = {}; this.lastStep = 0;
    this.birdT = 1; this.cricketT = 1; this.frogT = 3;
    this.mood = 'day';
  }
  start() {
    if (this.started) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try { ctx = new AC(); } catch (e) { return; }
    this.ctx = ctx; this.started = true;
    const master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ctx.destination);
    this.master = master;
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.vol.sfx; this.sfxBus.connect(master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.vol.music; this.musicBus.connect(master);
    this.ambBus = ctx.createGain(); this.ambBus.gain.value = this.vol.amb; this.ambBus.connect(master);
    // reverb
    this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(2.8, 2.2);
    this.verbOut = ctx.createGain(); this.verbOut.gain.value = 0.5;
    this.verb.connect(this.verbOut); this.verbOut.connect(master);
    this.musicVerb = ctx.createGain(); this.musicVerb.gain.value = 0.55; this.musicVerb.connect(this.verb);
    this.sfxVerb = ctx.createGain(); this.sfxVerb.gain.value = 0.18; this.sfxVerb.connect(this.verb);
    this.musicBus.connect(this.musicVerb);
    // noise buffers
    this.noise = this.makeNoise(4, false); this.brown = this.makeNoise(4, true);
    this.initAmbience();
    this.initMusic();
    if (ctx.state === 'suspended') ctx.resume();
  }
  setVolumes(v) {
    Object.assign(this.vol, v);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music, t, 0.1);
    this.ambBus.gain.setTargetAtTime(this.vol.amb * (0.4 + 0.6 * Math.min(1, this.vol.sfx * 1.4)), t, 0.1);
  }
  impulse(sec, decay) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < 200 ? i / 200 : 1);
    }
    return b;
  }
  makeNoise(sec, brown) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    // crossfade loop seam
    const f = 2000; for (let i = 0; i < f; i++) { const k = i / f; d[n - f + i] = d[n - f + i] * (1 - k) + d[i] * k; }
    return b;
  }
  loopNoise(buf, filters, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    src.loopStart = Math.random(); src.loopEnd = buf.duration;
    let node = src;
    for (const f of filters) { const bq = ctx.createBiquadFilter(); bq.type = f[0]; bq.frequency.value = f[1]; bq.Q.value = f[2] ?? 0.7; node.connect(bq); node = bq; }
    const g = ctx.createGain(); g.gain.value = gain; node.connect(g); g.connect(this.ambBus);
    src.start(ctx.currentTime + Math.random() * 0.1, Math.random() * buf.duration);
    return { src, g, filt: node };
  }
  initAmbience() {
    const A = this.amb;
    A.wind = this.loopNoise(this.noise, [['bandpass', 420, 0.5], ['lowpass', 1200]], 0.0);
    A.river = this.loopNoise(this.brown, [['lowpass', 1400], ['highpass', 120]], 0.0);
    A.riverHi = this.loopNoise(this.noise, [['bandpass', 2600, 0.8]], 0.0);
    A.cascade = this.loopNoise(this.noise, [['lowpass', 2400], ['highpass', 180]], 0.0);
    A.rain = this.loopNoise(this.noise, [['highpass', 900], ['lowpass', 7000]], 0.0);
    A.rainLow = this.loopNoise(this.brown, [['lowpass', 500]], 0.0);
    this.gust = 0.5; this.gustT = 0;
  }
  // ----------------------------------------------------------- sfx primitives
  env(g, t, a, peak, d, sustain = 0) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  }
  tone(type, f0, f1, t, dur, peak, o = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + (o.sweep ?? dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    this.env(g, t, o.a ?? 0.005, peak, dur);
    let node = osc;
    if (o.filter) { const bq = ctx.createBiquadFilter(); bq.type = o.filter[0]; bq.frequency.value = o.filter[1]; bq.Q.value = o.filter[2] ?? 1; node.connect(bq); node = bq; }
    node.connect(g);
    const out = o.bus || this.sfxBus;
    g.connect(out);
    if (o.pan !== undefined && ctx.createStereoPanner) { g.disconnect(); const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(out); if (o.verb) p.connect(o.verb); }
    else if (o.verb) g.connect(o.verb);
    osc.start(t); osc.stop(t + (o.a ?? 0.005) + dur + 0.05);
    return osc;
  }
  burst(t, dur, peak, filters, o = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = o.brown ? this.brown : this.noise;
    if (o.rate) src.playbackRate.value = o.rate;
    let node = src;
    for (const f of filters) {
      const bq = ctx.createBiquadFilter(); bq.type = f[0]; bq.Q.value = f[2] ?? 0.8;
      bq.frequency.setValueAtTime(f[1], t);
      if (f[3]) bq.frequency.exponentialRampToValueAtTime(f[3], t + dur);
      node.connect(bq); node = bq;
    }
    const g = ctx.createGain(); this.env(g, t, o.a ?? 0.004, peak, dur);
    node.connect(g);
    const out = o.bus || this.sfxBus;
    if (o.pan !== undefined && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(out); }
    else g.connect(out);
    if (o.verb) g.connect(o.verb);
    src.start(t, Math.random() * 3); src.stop(t + dur + 0.1);
  }
  play(name, o = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.005, v = o.vol ?? 1, R = Math.random;
    switch (name) {
      case 'step': {
        const s = o.surface || 'grass';
        if (s === 'grass') this.burst(t, 0.07, 0.07 * v, [['lowpass', 1500 + R() * 600], ['highpass', 250]]);
        else if (s === 'path') { this.burst(t, 0.06, 0.09 * v, [['bandpass', 2200 + R() * 800, 1.2]]); this.burst(t + 0.02, 0.04, 0.05 * v, [['bandpass', 3800, 2]]); }
        else if (s === 'wood') { this.tone('sine', 150 + R() * 30, 90, t, 0.09, 0.16 * v); this.burst(t, 0.03, 0.05 * v, [['bandpass', 1800, 1.5]]); }
        else if (s === 'water') { this.burst(t, 0.18, 0.12 * v, [['bandpass', 900 + R() * 400, 1.0, 400]]); this.burst(t + 0.03, 0.1, 0.05 * v, [['highpass', 2500]]); }
        break;
      }
      case 'hoe': this.tone('sine', 110, 55, t, 0.18, 0.4 * v); this.burst(t, 0.22, 0.22 * v, [['lowpass', 1100, 0.7, 300]], { brown: false }); this.burst(t + 0.05, 0.25, 0.08 * v, [['bandpass', 2400, 1]]); break;
      case 'pour': for (let i = 0; i < 6; i++) this.burst(t + i * 0.1, 0.16, 0.06 * v, [['bandpass', 2000 + R() * 1500, 2.5]]); this.burst(t, 0.75, 0.05 * v, [['bandpass', 1300, 0.8]], { a: 0.08 }); break;
      case 'refill': for (let i = 0; i < 8; i++) this.tone('sine', 300 + R() * 500, 700 + R() * 600, t + i * 0.08 + R() * 0.04, 0.06, 0.06 * v); this.burst(t, 0.7, 0.08 * v, [['lowpass', 900]], { a: 0.05 }); break;
      case 'plant': this.tone('sine', 520, 260, t, 0.12, 0.18 * v); this.burst(t, 0.15, 0.07 * v, [['lowpass', 1600]]); break;
      case 'harvest': this.tone('sine', 300, 900, t, 0.12, 0.22 * v, { sweep: 0.08 }); this.tone('triangle', midi(84), 0, t + 0.08, 0.35, 0.08 * v, { verb: this.sfxVerb }); this.tone('triangle', midi(88), 0, t + 0.14, 0.4, 0.07 * v, { verb: this.sfxVerb }); break;
      case 'splash': this.burst(t, 0.45, 0.25 * v, [['highpass', 500], ['lowpass', 5000, 0.7, 1500]]); this.burst(t, 0.2, 0.15 * v, [['bandpass', 800, 1]]); break;
      case 'plop': this.tone('sine', 900, 280, t, 0.12, 0.28 * v, { sweep: 0.1 }); this.burst(t + 0.02, 0.25, 0.08 * v, [['bandpass', 1500, 1.2]]); break;
      case 'nibble': this.tone('sine', 700, 380, t, 0.06, 0.12 * v); break;
      case 'bite': this.tone('sine', 800, 240, t, 0.14, 0.3 * v); this.burst(t, 0.2, 0.12 * v, [['bandpass', 1200, 1]]); this.tone('triangle', midi(88), 0, t + 0.05, 0.25, 0.14 * v); this.tone('triangle', midi(93), 0, t + 0.12, 0.3, 0.12 * v); break;
      case 'hook': this.burst(t, 0.2, 0.18 * v, [['bandpass', 3000, 1.2, 700]]); this.tone('triangle', 220, 440, t, 0.15, 0.15 * v); break;
      case 'tick': this.burst(t, 0.018, 0.08 * v, [['bandpass', 3200, 3]]); break;
      case 'reel': for (let i = 0; i < 6; i++) this.burst(t + i * 0.05, 0.018, 0.07 * v, [['bandpass', 3000, 3]]); break;
      case 'swish': this.burst(t, 0.3, 0.16 * v, [['bandpass', 3500, 1.5, 700]]); break;
      case 'thud': this.tone('sine', 120, 60, t, 0.15, 0.3 * v); break;
      case 'catch': {
        const seq = [72, 76, 79, 84, 88];
        seq.forEach((n, i) => { this.tone('triangle', midi(n), 0, t + i * 0.085, 0.5, 0.11 * v, { verb: this.sfxVerb }); this.tone('sine', midi(n + 12), 0, t + i * 0.085, 0.3, 0.04 * v); });
        this.tone('triangle', midi(91), 0, t + 0.5, 0.9, 0.08 * v, { verb: this.sfxVerb });
        break;
      }
      case 'lose': this.tone('triangle', midi(67), midi(60), t, 0.4, 0.12 * v, { sweep: 0.35 }); this.tone('triangle', midi(64), 0, t + 0.2, 0.4, 0.08 * v); break;
      case 'coin': this.tone('square', midi(83), 0, t, 0.08, 0.05 * v, { filter: ['lowpass', 4000] }); this.tone('square', midi(88), 0, t + 0.07, 0.3, 0.05 * v, { filter: ['lowpass', 4000] }); this.tone('sine', midi(100), 0, t + 0.07, 0.25, 0.03 * v); break;
      case 'click': this.tone('sine', 1200, 900, t, 0.04, 0.08 * v); break;
      case 'open': this.tone('triangle', midi(79), 0, t, 0.12, 0.08 * v); this.tone('triangle', midi(84), 0, t + 0.05, 0.18, 0.07 * v); break;
      case 'close': this.tone('triangle', midi(84), 0, t, 0.12, 0.07 * v); this.tone('triangle', midi(79), 0, t + 0.05, 0.16, 0.06 * v); break;
      case 'error': this.tone('square', 180, 0, t, 0.08, 0.05 * v, { filter: ['lowpass', 900] }); this.tone('square', 150, 0, t + 0.1, 0.1, 0.05 * v, { filter: ['lowpass', 900] }); break;
      case 'jump': this.tone('sine', 280, 520, t, 0.12, 0.08 * v); break;
      case 'land': this.tone('sine', 130, 70, t, 0.1, 0.15 * v); this.burst(t, 0.06, 0.05 * v, [['lowpass', 1200]]); break;
      case 'select': this.tone('triangle', midi(86), 0, t, 0.08, 0.05 * v); break;
      case 'sleep': [84, 79, 76, 72].forEach((n, i) => this.tone('triangle', midi(n), 0, t + i * 0.22, 0.9, 0.09 * v, { verb: this.sfxVerb })); break;
      case 'morning': [72, 76, 79, 83, 84].forEach((n, i) => this.tone('triangle', midi(n), 0, t + i * 0.13, 0.9, 0.08 * v, { verb: this.sfxVerb })); break;
      case 'ripe': this.tone('sine', midi(96), 0, t, 0.25, 0.03 * v); break;
      case 'door': this.tone('sine', 180, 140, t, 0.2, 0.12 * v); this.burst(t, 0.25, 0.04 * v, [['bandpass', 600, 2]]); break;
      default: break;
    }
  }
  // ----------------------------------------------------------- critters
  bird(t, pan) {
    const kind = Math.floor(Math.random() * 3);
    const base = 2400 + Math.random() * 1800;
    const n = kind === 0 ? 3 + Math.floor(Math.random() * 4) : kind === 1 ? 2 : 6 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const st = t + i * (kind === 2 ? 0.05 : 0.13 + Math.random() * 0.05);
      const f0 = base * (kind === 1 ? (i ? 0.8 : 1.1) : 1 + Math.random() * 0.15), f1 = f0 * (kind === 2 ? 1.05 : 0.7 + Math.random() * 0.5);
      this.tone('sine', f0, f1, st, kind === 2 ? 0.04 : 0.09, 0.025, { pan, bus: this.ambBus, verb: this.sfxVerb, a: 0.01 });
    }
  }
  cricket(t, pan) {
    const f = 4200 + Math.random() * 600;
    for (let c = 0; c < 2; c++) for (let i = 0; i < 3; i++) this.tone('sine', f, 0, t + c * 0.32 + i * 0.045, 0.03, 0.012, { pan, bus: this.ambBus, a: 0.004 });
  }
  frog(t, pan) {
    const f = 180 + Math.random() * 120;
    for (let i = 0; i < 2; i++) this.tone('sawtooth', f, f * 0.8, t + i * 0.12, 0.09, 0.03, { pan, bus: this.ambBus, filter: ['bandpass', 700, 3], a: 0.01 });
  }
  // ----------------------------------------------------------- ambience mix
  update(dt, o) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const A = this.amb, t = this.ctx.currentTime;
    const set = (n, v, tc = 0.3) => n.g.gain.setTargetAtTime(v, t, tc);
    this.gustT -= dt;
    if (this.gustT < 0) { this.gustT = 2 + Math.random() * 4; this.gust = 0.3 + Math.random() * 0.8; }
    const rain = o.rain || 0;
    const inK = o.indoor || 0;   // 0 outside, 1 inside the house (roof muffles the outdoors)
    const out = 1 - 0.6 * inK;
    set(A.wind, (0.02 + 0.035 * this.gust + rain * 0.03) * (o.elev ? 1.3 : 1) * out, 1.5);
    A.wind.filt.frequency.setTargetAtTime(500 + this.gust * 500, t, 1.5);
    const rv = 1 / (1 + Math.pow(Math.max(0, o.riverDist - 1) / 6, 1.6));
    set(A.river, 0.32 * rv * out, 0.4); set(A.riverHi, 0.018 * rv * (o.riverFast ? 2.5 : 1) * out, 0.4);
    const cv = 1 / (1 + Math.pow(Math.max(0, o.cascadeDist - 3) / 10, 1.8));
    set(A.cascade, 0.22 * cv * out, 0.5);
    set(A.rain, 0.09 * rain * (1 - 0.78 * inK), 1); set(A.rainLow, 0.12 * rain * (1 - 0.78 * inK), 1);
    // critters
    const pan = () => Math.random() * 1.6 - 0.8;
    if (o.dayK > 0.4 && rain < 0.3 && inK < 0.5) {
      this.birdT -= dt;
      if (this.birdT < 0) { this.birdT = 1.2 + Math.random() * 4.5 / (o.forest ? 1.8 : 1); this.bird(t + 0.05, pan()); }
    }
    if (o.nightK > 0.4 && rain < 0.5 && inK < 0.5) {
      this.cricketT -= dt;
      if (this.cricketT < 0) { this.cricketT = 0.4 + Math.random() * 1.2; this.cricket(t + 0.05, pan()); }
      if (o.pondDist < 25) {
        this.frogT -= dt;
        if (this.frogT < 0) { this.frogT = 1.5 + Math.random() * 4; this.frog(t + 0.05, pan()); }
      }
    }
    this.mood = o.nightK > 0.5 ? 'night' : (rain > 0.5 ? 'rain' : 'day');
  }
  // ----------------------------------------------------------- music
  initMusic() {
    this.beat = 0; this.nextT = this.ctx.currentTime + 1.0;
    this.chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62], [60, 64, 67], [52, 55, 60], [53, 57, 62], [55, 60, 62]];
    this.scale = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
    this.mel = 4; this.bar = 0; this.phrase = 0; this.rest = 0;
    this.timer = setInterval(() => this.schedule(), 90);
  }
  piano(n, t, dur, vel) {
    const f = midi(n);
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.008); g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(9000, f * 6), t); lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 1.5), t + dur);
    for (const [type, mul, gn] of [['triangle', 1, 1], ['sine', 2, 0.3], ['sine', 1.002, 0.5]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul;
      const og = ctx.createGain(); og.gain.value = gn;
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.05);
    }
    lp.connect(g); g.connect(this.musicBus);
  }
  pad(notes, t, dur, vel) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.5;
    for (const n of notes) for (const d of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n - 12); o.detune.value = d;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.1);
    }
    lp.connect(g); g.connect(this.musicBus);
  }
  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const night = this.mood === 'night', rainy = this.mood === 'rain';
    const bpm = night ? 58 : rainy ? 64 : 76;
    const step = 60 / bpm / 2; // eighth notes
    while (this.nextT < this.ctx.currentTime + 0.35) {
      const t = this.nextT, b = this.beat % 8;
      const ch = this.chords[this.bar % this.chords.length];
      if (b === 0) {
        this.pad(ch, t, step * 8.4, night ? 0.012 : 0.016);
        this.piano(ch[0] - 12, t, 2.6, night ? 0.05 : 0.07);
        this.bar++;
        if (this.bar % 8 === 0) { this.phrase++; this.rest = Math.random() < 0.35 ? 4 : 0; }
      }
      if (this.rest > 0) { if (b === 7) this.rest--; }
      else {
        // arpeggio on chord
        if (!night && (b === 2 || b === 4 || b === 6)) this.piano(ch[(b / 2) % 3] + (b === 4 ? 12 : 0), t, 1.4, 0.03);
        if (night && b === 4) this.piano(ch[1] + 12, t, 2.0, 0.025);
        // melody
        const p = night ? 0.28 : 0.42;
        if (Math.random() < p && b !== 7) {
          const mv = [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
          this.mel = Math.max(0, Math.min(this.scale.length - 1, this.mel + mv));
          let n = this.scale[this.mel];
          if (b === 0 && !ch.some(c => (c - n) % 12 === 0)) { const near = ch.map(c => c + 12).sort((a, b2) => Math.abs(a - n) - Math.abs(b2 - n))[0]; n = near; }
          this.piano(n + (night ? 12 : 0), t, night ? 2.2 : 1.6, night ? 0.045 : 0.06);
        }
      }
      this.beat++; this.nextT += step;
    }
  }
}
