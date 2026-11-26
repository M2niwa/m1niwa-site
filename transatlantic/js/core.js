'use strict';
/* =========================================================================
   core.js — 工具函数 / 输入（键盘 + 手柄 + 触屏）/ 程序化音频
   ========================================================================= */
const U = {
  clamp: (v, a, b) => v < a ? a : v > b ? b : v,
  lerp: (a, b, t) => a + (b - a) * t,
  smooth(a, b, x) { x = U.clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); },
  rand: (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a),
  pick: a => a[Math.floor(Math.random() * a.length)],
  damp: (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt)),
  fmt: n => Math.round(n).toLocaleString('en-US'),
  $: id => document.getElementById(id),
};

/* ------------------------------- 输入 ---------------------------------- */
const Input = (() => {
  const keys = {}, hit = {};
  let pads = [], prev = {};
  const lastDev = ['kb0', 'kb1'];
  const BLOCK = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Slash'];
  addEventListener('keydown', e => {
    if (!keys[e.code]) hit[e.code] = true;
    keys[e.code] = true;
    if (BLOCK.includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function readPad(gp) {
    let mx = gp.axes[0] || 0, my = gp.axes[1] || 0;
    const m = Math.hypot(mx, my);
    if (m < 0.28) { mx = 0; my = 0; } else if (m > 1) { mx /= m; my /= m; }
    const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    if (b(14)) mx = -1; if (b(15)) mx = 1; if (b(12)) my = -1; if (b(13)) my = 1;
    let rx = gp.axes[2] || 0, ry = gp.axes[3] || 0; if (Math.hypot(rx, ry) < 0.2) { rx = 0; ry = 0; }
    const tv = i => (gp.buttons[i] && gp.buttons[i].value) || 0;
    const s = { mx, my, rx, ry, zoom: tv(7) - tv(6), a: b(0), b: b(1), x: b(2), y: b(3), start: b(9), sel: b(8), l: mx < -0.5, r: mx > 0.5, u: my < -0.5, d: my > 0.5, gp };
    const p = prev[gp.index];
    for (const k of ['a', 'b', 'x', 'y', 'start', 'sel', 'l', 'r', 'u', 'd']) s[k + 'P'] = s[k] && !(p && p[k]);
    prev[gp.index] = s;
    return s;
  }
  /* 触屏：左半屏按下的地方就地出现摇杆，右下角三个按钮（互动 / 拾取 / 冲刺）。
     主指针是手指的设备（手机、平板）一开始就启用；带触摸屏的电脑要等第一次真的用手指碰屏幕才启用 */
  const tc = { on: false, mx: 0, my: 0, act: false, id: null }, thit = {};
  function touchOn() {
    if (tc.on) return; tc.on = true; document.body.classList.add('touch'); lastDev[0] = 'touch';
    addEventListener('contextmenu', e => e.preventDefault());                 // 长按不要弹出系统菜单
  }
  function initTouch() {
    const zone = U.$('tZone'), base = U.$('tBase'), knob = U.$('tKnob'); if (!zone) return;
    const R = 46;                                                               // 摇杆推到头的距离（CSS 像素）
    let ox = 0, oy = 0;
    const rest = () => { tc.id = null; tc.mx = tc.my = 0; base.classList.remove('live'); base.style.left = base.style.top = ''; knob.style.transform = ''; };
    zone.addEventListener('pointerdown', e => {
      if (tc.id !== null) return; tc.id = e.pointerId; ox = e.clientX; oy = e.clientY;
      const r = zone.getBoundingClientRect(); base.classList.add('live'); base.style.left = (ox - r.left) + 'px'; base.style.top = (oy - r.top) + 'px';
      try { zone.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件没有指针可捕获 */ }
      e.preventDefault();
    });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== tc.id) return;
      let dx = (e.clientX - ox) / R, dy = (e.clientY - oy) / R; const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      knob.style.transform = `translate(${(dx * R).toFixed(1)}px,${(dy * R).toFixed(1)}px)`;
      if (m < 0.22) { tc.mx = tc.my = 0; } else { tc.mx = dx; tc.my = dy; }
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(ev, e => { if (e.pointerId === tc.id) rest(); });
    const btn = (id, key, hold) => {
      const el = U.$(id); if (!el) return;
      el.addEventListener('pointerdown', e => { thit[key] = true; if (hold) tc.act = true; el.classList.add('down'); try { el.setPointerCapture(e.pointerId); } catch (_) { /* */ } e.preventDefault(); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => { if (hold) tc.act = false; el.classList.remove('down'); });
    };
    btn('tAct', 'act', true); btn('tAlt', 'alt'); btn('tDash', 'dash');
    addEventListener('blur', () => { rest(); tc.act = false; });
    addEventListener('pointerdown', e => { if (e.pointerType === 'touch') touchOn(); }, true);
    if (matchMedia('(pointer: coarse)').matches) touchOn();
  }
  if (U.$('tZone')) initTouch(); else addEventListener('DOMContentLoaded', initTouch);          // 脚本在页面末尾，触屏层已经在了：立刻初始化，游戏启动时就知道是不是触屏设备
  const tch = () => ({ mx: tc.mx, my: tc.my, act: tc.act, actP: !!thit.act, altP: !!thit.alt, dashP: !!thit.dash, dev: 'touch' });

  function update() {
    pads = [];
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of list) if (gp && gp.connected && gp.buttons.length >= 4) pads.push(readPad(gp));
  }
  function endFrame() { for (const k in hit) delete hit[k]; for (const k in thit) delete thit[k]; }

  function kb(set) {
    const k = keys, h = hit;
    if (set === 0) return {
      mx: (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), my: (k.KeyS ? 1 : 0) - (k.KeyW ? 1 : 0),
      act: !!(k.KeyE || k.Space), actP: !!(h.KeyE || h.Space), altP: !!(h.KeyQ || h.KeyF), dashP: !!h.ShiftLeft, dev: 'kb0',
    };
    return {
      mx: (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0), my: (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0),
      act: !!(k.Enter || k.NumpadEnter || k.Period), actP: !!(h.Enter || h.NumpadEnter || h.Period),
      altP: !!(h.Slash || h.Comma), dashP: !!(h.ShiftRight || h.Numpad0), dev: 'kb1',
    };
  }
  const padAct = p => ({ mx: p.mx, my: p.my, act: p.a, actP: p.aP, altP: p.xP || p.yP, dashP: p.bP, dev: 'pad', gp: p.gp });

  /* 设备分配：单人 = 全部设备；双人 = P1: WASD + 触屏(+手柄1)  P2: 方向键(+手柄2；只有一个手柄时归 P2) */
  function sources(i, mode) {
    const n = pads.length, t = tc.on ? [tch()] : [];
    if (mode === 1) return [kb(0), kb(1), ...t, ...pads.map(padAct)];
    if (i === 0) return n >= 2 ? [kb(0), ...t, padAct(pads[0])] : [kb(0), ...t];
    return n >= 2 ? [kb(1), padAct(pads[1])] : n === 1 ? [kb(1), padAct(pads[0])] : [kb(1)];
  }
  function player(i, mode) {
    const out = { mx: 0, my: 0, act: false, actP: false, altP: false, dashP: false, gp: null };
    for (const s of sources(i, mode)) {
      const used = s.mx || s.my || s.act || s.altP || s.dashP;
      if (used) { lastDev[i] = s.dev; if (s.gp) out.gp = s.gp; }
      if (Math.abs(s.mx) > Math.abs(out.mx)) out.mx = s.mx;
      if (Math.abs(s.my) > Math.abs(out.my)) out.my = s.my;
      out.act = out.act || s.act; out.actP = out.actP || s.actP; out.altP = out.altP || s.altP; out.dashP = out.dashP || s.dashP;
    }
    const m = Math.hypot(out.mx, out.my);
    if (m > 1) { out.mx /= m; out.my /= m; }
    return out;
  }
  function glyph(i, mode) {
    const d = lastDev[i];
    if (d === 'pad') return { act: '<kbd class="pad">A</kbd>', alt: '<kbd class="pad">X</kbd>', dash: '<kbd class="pad">B</kbd>' };
    if (d === 'touch') return { act: '<kbd class="tch">互动</kbd>', alt: '<kbd class="tch">拾取</kbd>', dash: '<kbd class="tch">冲刺</kbd>' };
    if (d === 'kb1' && mode === 2) return { act: '<kbd>Enter</kbd>', alt: '<kbd>/</kbd>', dash: '<kbd>右Shift</kbd>' };
    if (d === 'kb1') return { act: '<kbd>Enter</kbd>', alt: '<kbd>/</kbd>', dash: '<kbd>Shift</kbd>' };
    return { act: '<kbd>E</kbd>', alt: '<kbd>Q</kbd>', dash: '<kbd>Shift</kbd>' };
  }
  function menu() {
    const h = hit, o = {
      l: !!(h.ArrowLeft || h.KeyA), r: !!(h.ArrowRight || h.KeyD), u: !!(h.ArrowUp || h.KeyW), d: !!(h.ArrowDown || h.KeyS),
      ok: !!(h.Enter || h.NumpadEnter || h.Space || h.KeyE), back: !!(h.Escape || h.Backspace), start: !!h.Escape, tab: !!h.Tab, style: !!h.KeyV,
    };
    for (const p of pads) {
      o.l = o.l || p.lP; o.r = o.r || p.rP; o.u = o.u || p.uP; o.d = o.d || p.dP;
      o.ok = o.ok || p.aP; o.back = o.back || p.bP; o.start = o.start || p.startP; o.tab = o.tab || p.yP || p.xP; o.style = o.style || p.selP;
    }
    return o;
  }
  function rumble(gp, strong = 0.6, weak = 0.4, ms = 200) {
    const list = gp ? [gp] : pads.map(p => p.gp);
    for (const g of list) {
      try { if (g && g.vibrationActuator && g.vibrationActuator.playEffect) g.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { /* 不支持震动 */ }
    }
  }
  /* 观赏镜头：手柄右摇杆旋转、扳机缩放；键盘 Z / C 旋转 */
  function look() {
    const o = { x: (keys.KeyC ? 1 : 0) - (keys.KeyZ ? 1 : 0), y: 0, zoom: 0 };
    for (const p of pads) { o.x += p.rx; o.y -= p.ry; o.zoom += p.zoom; }
    return o;
  }
  return { update, endFrame, player, glyph, menu, look, rumble, padCount: () => pads.length, keys, get touch() { return tc.on; }, lastDev };
})();

/* ------------------------------- 音频 ---------------------------------- */
const Sfx = (() => {
  let ctx = null, master, noiseBuf, eng = null, windG, rainG, fireG, sprayG, musicG, musicT = 0, chordI = 0;
  const S = { power: 0, rough: 0, wind: 0.2, rain: 0, fire: 0, spray: 0, mood: 0 };

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5;
    master = ctx.createGain(); master.gain.value = 0.85;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // 引擎：两路锯齿 + 次谐波，经螺旋桨频率调幅
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const am = ctx.createGain(); am.gain.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 19;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.3;
    lfo.connect(lfoG); lfoG.connect(am.gain); lfo.start();
    const oscs = [[58, 'sawtooth', 0.5], [87.4, 'sawtooth', 0.32], [29, 'square', 0.3], [116.6, 'triangle', 0.2]].map(([f, t, v]) => {
      const o = ctx.createOscillator(); o.type = t; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = v; o.connect(og); og.connect(lp); o.start();
      return { o, f };
    });
    lp.connect(am); am.connect(g); g.connect(master);
    eng = { g, lp, lfo, lfoG, oscs };

    windG = loopNoise('bandpass', 520, 0.6);
    rainG = loopNoise('highpass', 2600, 0.7);
    fireG = loopNoise('bandpass', 900, 2.5);
    sprayG = loopNoise('highpass', 4200, 1);
    musicG = ctx.createGain(); musicG.gain.value = 0.0; musicG.connect(master);
    loadSamples();
  }

  /* 采样：风、雨、雷用真实录音（audio/ 目录，来源与许可见 audio/CREDITS.md）。
     加载或解码失败（例如直接双击 index.html，浏览器不允许读本地文件）就继续用上面的合成音。 */
  const SMP = { rainL: 'rain_light', rainH: 'rain_heavy', windB: 'wind_base', windH: 'wind_howl', th1: 'thunder_1', th2: 'thunder_2', th3: 'thunder_3', engA: 'engine_a', engB: 'engine_b' };
  const smp = {}, loops = {}, loopBufs = {};
  function loadSamples() {
    for (const [k, f] of Object.entries(SMP)) {
      fetch('audio/' + f + '.mp3').then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(b => ctx.decodeAudioData(b))
        .then(buf => { smp[k] = buf; if (k[0] === 'e') { loopBufs[k] = makeLoop(buf, 0.8); if (engProf.smp === k) buildEngine(); } else if (k[0] !== 't') loops[k] = loopSrc(makeLoop(buf)).g; }).catch(() => { /* 保持合成音 */ });
    }
  }
  /* 把任意一段录音做成无缝循环：掐掉首尾的编码填充，再把结尾等功率交叉淡化进开头 */
  function makeLoop(buf, xf = 1.5) {
    const sr = buf.sampleRate, skip = Math.round(sr * 0.06), N = buf.length - skip * 2, X = Math.min(Math.round(sr * xf), N >> 2), L = N - X;
    const out = ctx.createBuffer(buf.numberOfChannels, L, sr);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const a = buf.getChannelData(c), o = out.getChannelData(c);
      for (let i = 0; i < L; i++) o[i] = a[skip + i];
      for (let i = 0; i < X; i++) { const t = i / X * Math.PI / 2; o[i] = a[skip + i] * Math.sin(t) + a[skip + L + i] * Math.cos(t); }
    }
    return out;
  }
  function loopSrc(buf) {
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(master); src.start(0, Math.random() * buf.duration);
    return { src, g };
  }
  /* 引擎：每台发动机一路录音循环，转速 = 播放速率。多发机型各路略微错开音高，听得出"嗡——嗡——"的拍频。
     smp：engA 星型发动机（维加、福克、S-38）/ engB 低沉的 V12（宝玑、鲸式）；rate：该机型的基准音高 */
  let engProf = { smp: 'engA', rate: 1, n: 1 }, engV = null;
  const DET = [1, 1.031, 0.972, 1.013];
  function setEngine(prof, n) { engProf = Object.assign({ smp: 'engA', rate: 1 }, prof, { n: n || 1 }); buildEngine(); }
  function buildEngine() {
    if (!ctx) return;
    if (engV) { engV.forEach(v => { v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.12); v.src.stop(ctx.currentTime + 0.7); }); engV = null; }
    const buf = loopBufs[engProf.smp]; if (!buf) return;
    engV = Array.from({ length: engProf.n }, (_, i) => Object.assign(loopSrc(buf), { det: DET[i % DET.length] }));
  }
  function shot(buf, peak, when = 0, rate = 1) {
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = peak; src.connect(g); g.connect(master); src.start(ctx.currentTime + when);
  }
  function loopNoise(type, freq, q) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    return g;
  }
  const set = (param, v, tc = 0.1) => param.setTargetAtTime(v, ctx.currentTime, tc);

  const CHORDS = [
    [[110, 164.8, 220, 261.6, 329.6], [87.3, 130.8, 174.6, 220, 349.2], [130.8, 196, 261.6, 329.6, 392], [98, 146.8, 196, 246.9, 293.7]],   // 宁静：Am F C G
    [[110, 164.8, 207.7, 261.6, 311.1], [103.8, 155.6, 207.7, 246.9, 311.1], [98, 146.8, 174.6, 233.1, 293.7], [92.5, 138.6, 185, 220, 277.2]], // 风暴：不安的小调
  ];
  function pad() {
    const ch = CHORDS[S.mood > 0.5 ? 1 : 0][chordI++ % 4], t = ctx.currentTime;
    ch.forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i < 2 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = U.rand(-7, 7);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16 / (1 + i * 0.35), t + 2.6); g.gain.linearRampToValueAtTime(0, t + 8.5);
      o.connect(g); g.connect(musicG); o.start(t); o.stop(t + 9);
    });
  }
  function update(dt) {
    if (!ctx) return;
    const p = S.power, r = S.rough;
    const now = performance.now(), wob = r > 0 ? (Math.sin(now * 0.013) * Math.sin(now * 0.0071) > 0.25 ? 0.45 : 1) : 1;
    if (engV) {                                  // 录音引擎：逐台按转速调音量与音高；怠速不稳的那台断断续续、音高发飘
      set(eng.g.gain, 0, 0.08);
      const k = 0.5 / Math.sqrt(engV.length);
      engV.forEach((v, i) => {
        const rev = S.engs ? (S.engs[i] ?? 0) : p, rg = !!(S.engRough && S.engRough[i]);
        const stut = rg ? (Math.sin(now * 0.013 + i * 2.1) * Math.sin(now * 0.0071 + i) > 0.2 ? 0.4 : 1) : 1;
        set(v.g.gain, rev > 0.02 ? k * (0.3 + 0.7 * rev) * stut : 0, 0.1);
        set(v.src.playbackRate, engProf.rate * v.det * (0.62 + 0.38 * rev) * (rg ? 0.92 + 0.05 * Math.sin(now * 0.02 + i) : 1), 0.25);
      });
    } else set(eng.g.gain, (0.02 + 0.2 * p) * wob * (p > 0.02 ? 1 : 0), 0.08);
    const fs = 0.62 + 0.38 * p - r * 0.12;
    eng.oscs.forEach(o => set(o.o.frequency, o.f * fs, 0.3));
    set(eng.lfo.frequency, 9 + 11 * p - r * 4, 0.3);
    set(eng.lfoG.gain, 0.25 + r * 0.35, 0.3);
    const sm = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
    // 风：平稳的气流声随风速变大；出舱或进入风暴时再叠一层呼啸
    if (loops.windB) { set(windG.gain, 0, 0.4); set(loops.windB.gain, Math.min(0.95, S.wind * 0.5), 0.4); } else set(windG.gain, S.wind * 0.22, 0.4);
    if (loops.windH) set(loops.windH.gain, sm(0.8, 1.9, S.wind) * 0.42, 0.5);
    // 雨：先是细雨，风暴过半后换成砸在蒙皮上的大雨
    if (loops.rainL && loops.rainH) { set(rainG.gain, 0, 0.6); set(loops.rainL.gain, Math.min(1, S.rain * 2) * (1 - 0.45 * sm(0.5, 1, S.rain)) * 0.5, 0.6); set(loops.rainH.gain, sm(0.4, 1, S.rain) * 0.62, 0.6); }
    else set(rainG.gain, S.rain * 0.16, 0.6);
    set(fireG.gain, S.fire * 0.25 * (0.6 + Math.random() * 0.8), 0.05);
    set(sprayG.gain, S.spray * 0.2, 0.04);
    musicT -= dt;
    if (musicT <= 0) { musicT = 6.2; pad(); }
  }
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function tone(f, type, a, peak, d, when = 0, slide = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + a + d);
    env(g, t, a, peak, d); o.connect(g); g.connect(master); o.start(t); o.stop(t + a + d + 0.05);
  }
  function burst(type, f0, f1, peak, d, q = 1, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when, src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + d);
    const g = ctx.createGain(); env(g, t, 0.01, peak, d);
    src.connect(f); f.connect(g); g.connect(master); src.start(t, Math.random()); src.stop(t + d + 0.1);
  }
  const play = {
    ui() { tone(660, 'triangle', 0.005, 0.12, 0.08); },
    ok() { tone(520, 'triangle', 0.005, 0.14, 0.12); tone(780, 'triangle', 0.005, 0.14, 0.2, 0.09); },
    hitOK() { tone(880, 'sine', 0.004, 0.18, 0.1); tone(1320, 'sine', 0.004, 0.1, 0.12, 0.05); },
    miss() { tone(140, 'sawtooth', 0.005, 0.16, 0.18, 0, -50); },
    done() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 'triangle', 0.005, 0.15, 0.25, i * 0.07)); },
    clank() { [820, 1310, 2140].forEach(f => tone(f * U.rand(0.92, 1.08), 'square', 0.002, 0.07, 0.07)); burst('highpass', 3000, 1500, 0.12, 0.05); },
    alarm() { tone(880, 'square', 0.005, 0.08, 0.12); tone(880, 'square', 0.005, 0.08, 0.12, 0.2); },
    thunder(delay = 0) {
      if (!ctx) return;
      const near = delay < 0.15, k = near ? 'th2' : U.pick(['th1', 'th1', 'th2', 'th3', 'th3']);       // 没有延迟 = 雷直接劈在飞机上，用最爆裂的那一声
      if (smp[k]) return shot(smp[k], near ? 1 : k === 'th3' ? 0.9 : U.rand(0.5, 0.8), delay, U.rand(0.86, 1.08));
      burst('lowpass', 1100, 60, 0.9, 3.2, 0.7, delay); burst('lowpass', 300, 40, 0.6, 4, 0.5, delay + 0.15);
    },
    whoosh() { burst('bandpass', 300, 1800, 0.25, 0.35, 1.2); },
    horn() {                                     // 邮轮汽笛：三声长鸣（合成的低音和弦，带一点起音的滑音）
      if (!ctx) return;
      for (let k = 0; k < 3; k++) {
        const t = ctx.currentTime + k * 2.1, g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.7;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3, t + 0.18); g.gain.setValueAtTime(0.3, t + 1.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
        [[87.3, 'sawtooth', 1], [87.9, 'sawtooth', 0.7], [110, 'sawtooth', 0.6], [174.6, 'square', 0.18], [43.6, 'sine', 0.8]].forEach(([f, ty, v]) => {
          const o = ctx.createOscillator(), og = ctx.createGain(); o.type = ty; o.frequency.setValueAtTime(f * 0.965, t); o.frequency.linearRampToValueAtTime(f, t + 0.28); og.gain.value = v * 0.5; o.connect(og); og.connect(lp); o.start(t); o.stop(t + 2.1);
        });
        lp.connect(g); g.connect(master);
      }
    },
    pick() { tone(420, 'triangle', 0.004, 0.1, 0.06); tone(640, 'triangle', 0.004, 0.08, 0.06, 0.04); },
    drop() { tone(300, 'triangle', 0.004, 0.1, 0.08, 0, -120); },
    ice() { burst('highpass', 5000, 2500, 0.22, 0.12, 2); tone(1900 * U.rand(0.9, 1.2), 'sine', 0.002, 0.08, 0.1); },
    sputter() { burst('lowpass', 260, 90, 0.5, 0.22, 1); },
    fire() { burst('bandpass', 500, 1600, 0.5, 0.6, 0.8); },
    splash() { burst('lowpass', 2400, 200, 0.9, 1.6, 0.6); },
    crash() { burst('lowpass', 900, 50, 1, 2.2, 0.5); tone(70, 'sawtooth', 0.01, 0.4, 1.2, 0, -40); },
    hatch() { tone(180, 'square', 0.004, 0.08, 0.08); burst('bandpass', 700, 300, 0.2, 0.15, 3); },
    pump() { burst('bandpass', 420, 180, 0.18, 0.16, 4); },
    fanfare() { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 'triangle', 0.01, 0.16, 0.7, i * 0.13)); },
  };
  function music(on) { if (ctx) set(musicG.gain, on ? 0.5 : 0, 1.5); }
  return { init, update, S, play, music, setEngine, get engine() { return Object.assign({ voices: engV ? engV.map(v => [+v.g.gain.value.toFixed(3), +v.src.playbackRate.value.toFixed(3)]) : null }, engProf); }, get samples() { return Object.keys(smp); }, get loops() { return Object.fromEntries(Object.entries(loops).map(([k, g]) => [k, +g.gain.value.toFixed(3)])); } };
})();
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => Sfx.init(), { passive: true }));
