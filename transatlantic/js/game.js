'use strict';
/* =========================================================================
   game.js — 流程、飞行模型、事件导演、机组与岗位交互、HUD、镜头
   ========================================================================= */
const Game = (() => {
  const T = THREE, V3 = T.Vector3, $ = U.$, st = GFX.st;
  const TOTAL = 3260, BASE_T = 450, KPS = TOTAL / BASE_T, FREEZE = 1300, MELT = 800;
  const S = { screen: 'boot', mode: 1, ac: 0, pause: false, sel: 0, busy: false, lan: false, net: null };     // lan：机库里选了「局域网联机」；net：已连上时是 'host' / 'guest'
  const Q = new URLSearchParams(location.search);
  let I = null, def = null, fx = null, F = null, land = null, last = 0;
  const dbg = { cam: null };
  /* 画风：0 = 写实材质（细节贴图 + 接缝阴影），1 = 卡通描边 */
  const STYLE = ['写实材质', '卡通描边'];
  function setStyle(v, quiet) {
    S.style = v; P.setDetail(v === 0);
    try { localStorage.setItem('ta_style', v); } catch (e) { /* 隐私模式下不保存 */ }
    $('btnStyle').innerHTML = `画风 · <b>${STYLE[v]}</b> <kbd>V</kbd>`;
    if (!quiet) { Sfx.play.ui(); if (S.screen === 'flight') toast('画风：' + STYLE[v], false, 1800); }
  }
  const ORB0 = { yaw: 0.95, pitch: 0.2, dist: 1 }, orb = Object.assign({ idle: 9, drag: false, px: 0, py: 0 }, ORB0);   // 机库观赏镜头
  const tmp = new V3(), camPos = new V3(0, 6, 16), camLook = new V3(), curLook = new V3(0, 1, 0);
  const PCOL = ['#ffc94a', '#5ad0ff'];
  const CREW = [
    { jacket: 0x7a4a26, pants: 0xb9a67a, scarf: 0xf6f1e4, cap: 0x4f3018, skin: 0xf0c8a4, hair: 0xb5783c, ring: 0xffc94a },
    { jacket: 0x35506e, pants: 0x3a3a42, scarf: 0xc8322c, cap: 0x2c2420, skin: 0xd9a67e, ring: 0x5ad0ff, collar: 0x8a8f96 },
  ];
  const ENGN = { vega: [''], breguet: [''], fokker: ['·机头', '·左翼', '·右翼'], wal: ['·前', '·后'], s38: ['·左', '·右'] };
  const ITEM_NAME = { wrench: '扳手', mallet: '除冰木槌', ext: '灭火器', fuse: '保险丝' };

  /* ------------------------------ 局域网联机 ------------------------------
     主机（机长，一号机组）照常运行全部模拟，每秒把飞行状态发给队友约 30 次；队友（二号机组）只上传自己的按键，
     用收到的状态在本地摆放机组、道具、故障并渲染，镜头、界面、音效都在各自的电脑上。
     模拟过程中一次性的东西（提示、音效、粒子、闪电、手柄震动）由主机当作"事件"转发，队友照着播一遍。
     服务器（server.js）只做中转：一个房间，一名主机 + 一名队友。 */
  const RGP = { remote: true };                     // 队友的"手柄"占位：给他的震动要转发过去，而不是震主机的手柄
  const Net = { ws: null, want: null, peer: false, sim: false, ev: [], snap: null, fresh: false, fid: 0, acc: 0, msg: '', addrs: null, tried: false,
    rin: { mx: 0, my: 0, act: false, actP: false, altP: false, dashP: false, at: 0 }, out: { aP: 0, lP: 0, dP: 0, sig: '', last: 0 } };
  let uid = 0;                                      // 道具、互动点的编号（联机时两边靠它对上号）
  const me = () => S.net === 'guest' ? 1 : 0;       // 这台电脑上的玩家是几号机组
  const glyphOf = i => S.net ? Input.glyph(0, 1) : Input.glyph(i, S.mode);      // 联机时每人都用自己电脑上的全部按键
  const r3 = v => Math.round(v * 1000) / 1000;
  const kUp = () => Input.lastDev[0] === 'touch' ? '<em style="color:#f0a030;font-style:normal">上推摇杆</em>' : '<kbd>↑</kbd>';      // 提示里的「按 ↑」，触屏上换个说法
  function netSend(o) { if (Net.ws && Net.ws.readyState === 1) Net.ws.send(JSON.stringify(o)); }
  function netEv(e) { if (Net.peer) Net.ev.push(e); }
  function netClose() {
    const ws = Net.ws; Net.ws = null; if (ws) { try { ws.close(); } catch (e) { /* 已经断了 */ } }
    S.net = null; Net.peer = false; Net.want = null; Net.sim = false; Net.ev.length = 0; Net.snap = null;
  }
  function netOpen(role) {
    netClose();
    if (location.protocol === 'file:') { Net.msg = '联机需要先运行 <b>node server.js</b>，再用它给出的 http 地址打开游戏'; return netUI(); }
    Net.want = role; Net.msg = '正在连接…'; netUI();
    let ws; try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); } catch (e) { Net.msg = '连接失败'; Net.want = null; return netUI(); }
    Net.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', role }));
    ws.onmessage = e => { if (Net.ws !== ws) return; let o; try { o = JSON.parse(e.data); } catch (_) { return; } netMsg(o); };
    ws.onclose = () => { if (Net.ws === ws) netLost(); };
  }
  function netLost() {                               // 连接意外断开
    const was = S.net; Net.ws = null; S.net = null; Net.peer = false; Net.want = null; Net.sim = false;
    Net.msg = was ? '连接断开了' : '连不上服务器'; netUI();
    if (was) toast('联机连接断开了', true, 5000);
    if (was === 'guest' && (S.screen === 'flight' || S.screen === 'result')) { fade(true); setTimeout(toHangar, 450); }
  }
  /* 主机把队友带到自己当前所在的地方：机库里对齐机型，飞行中直接加入这一趟 */
  function netSync() {
    if (S.net !== 'host' || !Net.peer) return;
    if (S.screen === 'flight' && F) netSend({ t: 'start', ac: S.ac, fid: Net.fid, mid: true }); else netSend({ t: 'lobby', ac: S.ac });
  }
  function netMsg(o) {
    if (o.t === 'role') {
      if (!o.ok) { Net.msg = o.why === 'host' ? '已经有人开了房 —— 点「加入」当队友' : '房间里已经有一名队友了'; const ws = Net.ws; Net.ws = null; Net.want = null; try { ws.close(); } catch (e) { /* */ } return netUI(); }
      S.net = o.role; Net.peer = !!o.peer; Net.msg = ''; S.mode = 2; S.lan = true; refreshCard();
      if (S.net === 'host') { fetch('/lan').then(r => r.json()).then(j => { Net.addrs = j; netUI(); }).catch(() => { }); netSync(); }
      return netUI();
    }
    if (o.t === 'peer') {
      Net.peer = !!o.on; Object.assign(Net.rin, { mx: 0, my: 0, act: false, actP: false, altP: false, dashP: false });
      if (S.net === 'host') { toast(o.on ? '队友加入了机组' : '队友离开了', !o.on, 4000); if (o.on) netSync(); }
      else if (!o.on) { toast('机长离开了 —— 这一趟联机结束', true, 5000); if (S.screen === 'flight' || S.screen === 'result') { fade(true); setTimeout(toHangar, 450); } }
      return netUI();
    }
    if (S.net === 'host') {
      if (o.t === 'i' && Array.isArray(o.m)) { const r = Net.rin, m = o.m; r.mx = U.clamp(+m[0] || 0, -1, 1); r.my = U.clamp(+m[1] || 0, -1, 1); r.act = !!m[2]; r.actP = r.actP || !!m[3]; r.altP = r.altP || !!m[4]; r.dashP = r.dashP || !!m[5]; r.at = performance.now(); }
      return;
    }
    if (S.net !== 'guest') return;
    if (o.t === 'lobby') {
      const go = () => { if (S.net !== 'guest') return; if (S.busy) return setTimeout(go, 120); if (S.screen !== 'hangar') { fade(true); setTimeout(() => { S.ac = o.ac; toHangar(); }, 450); } else if (o.ac !== S.ac) setAc(o.ac, true); };
      go();
    } else if (o.t === 'start') {
      const go = () => { if (S.net !== 'guest') return; if (S.busy) return setTimeout(go, 120); S.ac = o.ac; Net.fid = o.fid; Net.snap = null; startFlight(true); };
      go();
    } else if (o.t === 's') { if (F && o.fid === F.fid) { Net.snap = o; Net.fresh = true; } }
    else if (o.t === 'e') { if (F && o.fid === F.fid) for (const e of o.ev) netPlay(e); }
    else if (o.t === 'res') { if (F && o.fid === F.fid && S.screen === 'flight') { if (Net.snap) applySnap(Net.snap, true); result(!!o.win); } }
    else if (o.t === 'pz') { if (F) F.hostPaused = !!o.on; toast(o.on ? '机长暂停了游戏' : '继续飞行', false, o.on ? 600000 : 1500); }
  }
  /* 队友这边照着主机发来的事件播一遍 */
  function netPlay(e) {
    const k = e[0];
    if (k === 't') toast(e[1], e[2], e[3]);
    else if (k === 's') { if (Sfx.play[e[1]]) Sfx.play[e[1]](...e.slice(2)); }
    else if (k === 'f') fx.emit(...e.slice(1));
    else if (k === 'lt') GFX.lightning(e[1]);
    else if (k === 'r') Input.rumble(null, e[1], e[2], e[3]);
  }
  /* 主机：队友的按键。按下的"那一下"攒着，等这一帧的模拟来取；太久没有消息（对方切到后台）就当他松手了 */
  function netRemoteInput() {
    const r = Net.rin, live = Net.peer && performance.now() - r.at < 700;
    const o = { mx: live ? r.mx : 0, my: live ? r.my : 0, act: live && r.act, actP: live && r.actP, altP: live && r.altP, dashP: live && r.dashP, gp: RGP };
    r.actP = r.altP = r.dashP = false; return o;
  }
  /* 队友：把自己的按键发给主机。有变化、有按下的那一下时立刻发，否则每 0.1 秒发一次保活 */
  function netSendInput() {
    const i = Input.player(0, 1), q = Net.out, now = performance.now(), sig = r3(i.mx) + ',' + r3(i.my) + ',' + (i.act ? 1 : 0);
    q.aP = q.aP || i.actP ? 1 : 0; q.lP = q.lP || i.altP ? 1 : 0; q.dP = q.dP || i.dashP ? 1 : 0;
    if (q.aP || q.lP || q.dP || sig !== q.sig || now - q.last > 100) { netSend({ t: 'i', m: [r3(i.mx), r3(i.my), i.act ? 1 : 0, q.aP, q.lP, q.dP] }); q.aP = q.lP = q.dP = 0; q.sig = sig; q.last = now; }
    return i;
  }
  /* 主机：每帧先把攒下的事件发出去，再按每秒约 30 次的节奏发一份完整的飞行状态 */
  function netBroadcast(dt) {
    if (!Net.peer) { Net.ev.length = 0; return; }
    if (Net.ev.length) { netSend({ t: 'e', fid: F.fid, ev: Net.ev }); Net.ev = []; }
    Net.acc += dt; if (Net.acc < 1 / 31) return; Net.acc = 0;
    const tg = F.players.map(p => p.target).filter(Boolean);
    netSend({
      t: 's', fid: F.fid,
      f: [r3(F.t), F.phase, r3(F.thr), r3(F.dist), r3(F.alt), r3(F.vs), r3(F.power), r3(F.spd), r3(F.fuelM), r3(F.fuelR), r3(F.hull), r3(F.err), r3(F.est), r3(F.unc), F.elec ? 1 : 0, F.tailJam ? 1 : 0, F.leak ? 1 : 0,
        r3(F.pitch), r3(F.roll), r3(F.cutY), F.fixed, r3(F.deadT), r3(F.outT), F.cause || '', land ? r3(F.landX - (st.scroll - F.landS0)) : -9999, F.sinkWarn ? 1 : 0, F.sinkCrit ? 1 : 0, F.lowPower ? 1 : 0, r3(I.pumpLever ? I.pumpLever.rotation.z : 0)],
      e: F.eng.map(e => e.state),
      st: [st.tod, st.storm, st.rain, st.overcast, st.wisps, st.deck, st.speed, st.seaDrop, st.shake].map(r3),
      p: F.players.map(p => [r3(p.x), r3(p.y), r3(p.z), r3(p.face), p.zone === 'out' ? 1 : 0, p.seated ? 1 : 0, p.pose, r3(p.moving), p.item ? p.item.id : -1, p.climb ? 1 : 0, p.spray ? 1 : 0, p.target ? p.target.nid : -1, r3(p.inp.mx || 0), r3(p.inp.my || 0), r3(p.wind || 0)]),
      it: F.items.map(it => [it.id, it.type, it.zone === 'out' ? 1 : 0, r3(it.x), r3(it.z), it.holder ? it.holder.i : -1, ...it.mesh.position.toArray().map(r3), r3(it.mesh.rotation.x), r3(it.mesh.rotation.y), r3(it.mesh.rotation.z)]),
      in: F.inter.filter(it => it.prob || it.ice || tg.includes(it)).map(it => [it.nid, it.zone === 'out' ? 1 : 0, r3(it.x), r3(it.z), it.kind, it.label, it.h, it.need || '', it.n || 0, it.arcW || 0, r3(it.arc0), r3(it.phase), r3(it.progress), it.hits, it.cont ? 1 : 0, it.ice ? 1 : 0, it.prob ? it.prob.badge : '', it.prob && it.prob.crit ? 1 : 0, it.r || 0]),
      pr: F.probs.map(q => [q.badge, q.title, q.hint, q.crit ? 1 : 0, q.type]),
      fi: F.fires.map(f => [r3(f.x), r3(f.z), r3(f.hp)]),
      ic: F.ices.map(i => [I.icePts.indexOf(i.pt), r3(i.hp)]),
    });
  }
  /* 队友：把一份状态套到本地的飞行上。连续变化的量（高度、姿态、位置）只记目标值，由 guestTick 逐帧平滑过去 */
  function applySnap(s, hard) {
    const f = s.f, g = F.g || (F.g = {});
    if (hard || Math.abs(F.t - f[0]) > 0.3) F.t = f[0]; else F.t += (f[0] - F.t) * 0.25;
    if (f[1] !== F.phase) guestPhase(f[1], hard);
    F.phase = f[1]; F.dist = f[3]; F.vs = f[5]; F.spd = f[7]; F.fuelM = f[8]; F.fuelR = f[9]; F.hull = f[10]; F.err = f[11]; F.est = f[12]; F.unc = f[13];
    F.elec = !!f[14]; F.tailJam = !!f[15]; F.leak = !!f[16]; F.fixed = f[20]; F.deadT = f[21]; F.outT = f[22]; F.cause = f[23] || undefined; F.sinkWarn = !!f[25]; F.sinkCrit = !!f[26]; F.lowPower = !!f[27];
    Object.assign(g, { thr: f[2], alt: f[4], power: f[6], pitch: f[17], roll: f[18], cutY: f[19], lx: f[24] });
    if (hard) { F.thr = g.thr; F.alt = g.alt; F.power = g.power; F.pitch = g.pitch; F.roll = g.roll; F.cutY = g.cutY; F.landX = g.lx; F.landS0 = st.scroll; }
    if (I.pumpLever) I.pumpLever.rotation.z = f[28];
    s.e.forEach((v, k) => { if (F.eng[k]) F.eng[k].state = v; });
    const q = s.st; Object.assign(st, { tod: q[0], storm: q[1], rain: q[2], overcast: q[3], wisps: q[4], deck: q[5], speed: q[6], seaDrop: q[7], shake: q[8] });
    // 道具
    for (const a of s.it) {
      let it = F.items.find(x => x.id === a[0]);
      if (!it) { it = { id: a[0], type: a[1], mesh: P.item(a[1]), holder: null, hi: -2 }; F.items.push(it); }
      it.zone = a[2] ? 'out' : 'in'; it.x = a[3]; it.z = a[4];
      if (a[5] !== it.hi) {                                        // 换了手 / 放下了
        it.hi = a[5]; if (it.holder) it.holder.item = null;
        it.holder = a[5] >= 0 ? F.players[a[5]] : null;
        if (it.holder) { it.holder.item = it; it.holder.c.hold.add(it.mesh); it.mesh.position.set(0, 0, 0); it.mesh.rotation.set(0, 0, it.type === 'ext' || it.type === 'fuse' ? 0 : 0.9); } else I.root.add(it.mesh);
      }
      if (!it.holder) { it.mesh.position.set(a[6], a[7], a[8]); it.mesh.rotation.set(a[9], a[10], a[11]); }
    }
    for (const it of F.items.slice()) if (!s.it.some(a => a[0] === it.id)) { if (it.holder) it.holder.item = null; if (it.mesh.parent) it.mesh.parent.remove(it.mesh); F.items.splice(F.items.indexOf(it), 1); }
    // 互动点（只有带故障 / 积冰的，和正被谁对准的）、故障、火、冰
    F.inter = s.in.map(a => ({ nid: a[0], zone: a[1] ? 'out' : 'in', x: a[2], z: a[3], kind: a[4], label: a[5], h: a[6], need: a[7] || undefined, n: a[8], arcW: a[9], arc0: a[10], phase: a[11], progress: a[12], hits: a[13], cont: !!a[14], ice: a[15] ? true : undefined, prob: a[16] ? { badge: a[16], crit: !!a[17] } : undefined, r: a[18] || undefined }));
    F.probs = s.pr.map(a => ({ badge: a[0], title: a[1], hint: a[2], crit: !!a[3], type: a[4] }));
    F.fires = s.fi.map(a => ({ x: a[0], z: a[1], hp: a[2] }));
    for (const a of s.ic) { const pt = I.icePts[a[0]]; if (!pt) continue; let ice = F.ices.find(i => i.pt === pt); if (!ice) { ice = { pt, x: pt.x, z: pt.z, hp: a[1], mesh: iceMesh(pt) }; F.ices.push(ice); } ice.hp = a[1]; }
    for (const ice of F.ices.slice()) if (!s.ic.some(a => I.icePts[a[0]] === ice.pt)) { I.root.remove(ice.mesh); F.ices.splice(F.ices.indexOf(ice), 1); }
    // 机组
    s.p.forEach((a, k) => {
      const p = F.players[k]; if (!p) return; const zone = a[4] ? 'out' : 'in';
      if (hard || zone !== p.zone && !a[9]) { p.x = a[0]; p.y = a[1]; p.z = a[2]; p.face = a[3]; }
      p.tx = a[0]; p.ty = a[1]; p.tz = a[2]; p.tf = a[3]; p.zone = zone; p.seated = !!a[5]; p.pose = a[6]; p.moving = a[7]; p.climb = a[9] ? p.climb || {} : null; p.spray = !!a[10];
      p.target = a[11] >= 0 ? F.inter.find(it => it.nid === a[11]) || null : null; p.inp = { mx: a[12], my: a[13] }; p.wind = a[14];
    });
  }
  /* 队友：阶段切换时主机那边顺带做的界面动作（片头结束、换成爱尔兰的陆地……），这里照做一遍 */
  function guestPhase(ph, now) {
    if (ph !== 'intro') { show('takeoff', false); if (ph !== 'outro') $('bars').classList.remove('on'); }
    if (ph === 'outro') {
      const swap = () => {
        if (!F || S.net !== 'guest') return;
        if (land) GFX.scene.remove(land); land = GFX.makeLand('ie', def.seaplane); land.visible = false; F.landOn = false; F.landX = 0; F.landS0 = st.scroll;
        $('bars').classList.add('on'); show('hud', false); fade(false);
        caption('次日清晨 · 北爱尔兰 Derry 郊外<small>一片牧场，几头受惊的奶牛</small>', 7000);
      };
      if (now) swap(); else { fade(true); setTimeout(swap, 800); }
    }
  }
  /* 队友的每一帧：上传按键 → 套用最新的状态 → 平滑 → 界面 */
  function guestTick(dt) {
    netSendInput();
    if (!F.gReady) { if (!Net.snap || Net.snap.fid !== F.fid) return; applySnap(Net.snap, true); Net.fresh = false; F.gReady = true; }
    else if (Net.fresh) { Net.fresh = false; applySnap(Net.snap); }
    if (!F.hostPaused) F.t += dt;
    const g = F.g, k = 1 - Math.exp(-18 * dt), kp = 1 - Math.exp(-24 * dt);
    F.thr += (g.thr - F.thr) * k; F.alt += (g.alt - F.alt) * k; F.power += (g.power - F.power) * k; F.pitch += (g.pitch - F.pitch) * k; F.roll += (g.roll - F.roll) * k; F.cutY += (g.cutY - F.cutY) * k;
    { const on = g.lx > -9000; if (land) land.visible = on;          // 主机那边陆地已经飞过、或还没换好：这边先藏起来（不删，等主机给出位置再显示）
      if (on) F.landX = F.landOn ? F.landX + (g.lx - F.landX) * k : g.lx; F.landOn = on; F.landS0 = st.scroll; }
    for (const p of F.players) {
      p.x += (p.tx - p.x) * kp; p.y += (p.ty - p.y) * kp; p.z += (p.tz - p.z) * kp;
      let d = p.tf - p.face; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283; p.face += d * kp;
      p.c.g.position.set(p.x, p.y, p.z); p.c.g.rotation.y = -p.face; p.c.ring.visible = true;
      P.animCrew(p.c, { pose: p.pose, moving: p.moving, wind: p.wind || 0, carry: !!p.item, steer: p.seated ? p.inp.mx : 0, pull: p.seated ? -p.inp.my : 0 }, dt);
    }
    for (const i of F.ices) i.mesh.scale.setScalar(U.damp(i.mesh.scale.x, 0.35 + i.hp * 0.9, 5, dt));
    if (F.phase === 'intro') takeoffUI();
    if (F.phase === 'fly') { SCN.director(F.dist / TOTAL); Sfx.S.rain = st.storm; Sfx.S.mood = st.storm > 0.3 || F.probs.some(q => q.crit) ? 1 : 0; }
    if (F.phase === 'fly' || F.phase === 'intro') hud(dt);
  }
  /* 机库里的联机面板 */
  function netUI() {
    show('netBox', S.lan);
    $('netHost').classList.toggle('on', S.net === 'host' || Net.want === 'host'); $('netJoin').classList.toggle('on', S.net === 'guest' || Net.want === 'guest');
    let h = Net.msg || '一人点「开房」当机长，另一人在同一网络的电脑或手机上打开本游戏，点「加入」。<br><small>键盘 / 手柄：↑ 开房 · ↓ 加入 · Tab / Y 切换编制</small>';
    if (S.net === 'host') {
      const a = Net.addrs && Net.addrs.addrs.length ? Net.addrs.addrs.slice(0, 2).map(x => `<b>http://${x}:${Net.addrs.port}/?join=1</b>`).join(' 或 ') : '<b>http://本机的局域网地址:' + (location.port || 80) + '/?join=1</b>';
      h = Net.peer ? '<em>队友已加入</em> —— 选好座机就可以起飞。' : '房间已开。请队友在同一网络的浏览器里打开：<br>' + a + '<br>没等到队友也可以先起飞，他随时能加入。';
    } else if (S.net === 'guest') h = Net.peer ? '<em>已加入机长的机组</em> —— 座机由机长选，等他起飞。你是二号机组（蓝圈）。' : '已连上，但还没有人开房 —— 等机长点「开房」。';
    const el = $('netInfo'); if (el._h !== h) { el.innerHTML = h; el._h = h; }
    /* 静态托管（如个人站）没有 WebSocket 中转：连过且没连上时，给出可解释的原因 */
    const offline = !S.net && !!Net.msg && /连不上|连接失败|连接断开/.test(Net.msg);
    $('netNote').classList.toggle('hidden', !offline);
    $('btnStart').classList.toggle('wait', S.net === 'guest'); fitCard();
  }

  /* ------------------------------ 界面小工具 ------------------------------ */
  const show = (id, on = true) => $(id).classList.toggle('hidden', !on);
  function fade(on) { $('fade').style.opacity = on ? 1 : 0; }
  function caption(html, ms = 4200) { const c = $('caption'); c.innerHTML = html; c.classList.add('on'); clearTimeout(caption.t); caption.t = setTimeout(() => c.classList.remove('on'), ms); }
  function toast(html, warn = false, ms = 3800) { if (Net.sim) netEv(['t', html, warn, ms]); const t = $('toast'); t.innerHTML = html; t.className = 'on' + (warn ? ' warn' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = ''; }, ms); }
  const Lb = {
    els: [], n: 0,
    begin() { this.n = 0; },
    put(html, x, y, z) {
      let e = this.els[this.n];
      if (!e) { e = document.createElement('div'); e.className = 'lbl'; $('labels').appendChild(e); this.els.push(e); }
      this.n++;
      tmp.set(x, y, z).applyMatrix4(I.root.matrixWorld).project(GFX.camera);
      if (tmp.z > 1) { e.style.display = 'none'; return; }
      e.style.display = '';
      e.style.transform = `translate(${((tmp.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px,${((-tmp.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px) translate(-50%,-100%)`;
      if (e._h !== html) { e.innerHTML = html; e._h = html; }
    },
    end() { for (let i = this.n; i < this.els.length; i++) this.els[i].style.display = 'none'; },
  };

  /* ------------------------------ 机型装载 ------------------------------ */
  function loadAircraft(i) {
    if (I) { GFX.scene.remove(I.root); fx.dispose(); I.root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    P.resetGhosts(); def = AIRCRAFT[i]; I = def.build(); I.def = def;
    Sfx.setEngine(def.snd, I.engines.length);
    I.handLight2 = new T.PointLight(0xffdcaa, 0, 5.5, 1.8); I.root.add(I.handLight2);
    I.fireLight = new T.PointLight(0xff7a2a, 0, 8, 1.6); I.root.add(I.fireLight);
    I.handLight = new T.PointLight(0xffdcaa, 0, 5.5, 1.8); I.root.add(I.handLight);
    I.spinners.forEach(s => { s.w = 40; });
    // 机库/片头里坐在驾驶席上操纵飞机的飞行员（飞行中由玩家角色接替）
    I.demo = P.crew(CREW[0]); I.demo.ring.visible = false; I.demo.g.position.set(I.st.helm.x, I.sitY, I.st.helm.z); I.root.add(I.demo.g);
    GFX.scene.add(I.root); fx = GFX.makeFX(I.root);
    { const e0 = fx.emit; fx.emit = function (...a) { e0.apply(fx, a); if (Net.sim) netEv(['f', ...a]); }; }        // 联机：模拟过程中喷出的粒子（火花、泡沫、碎冰）转发给队友
    P.setCut(null);
  }

  /* ------------------------------- 机库界面 ------------------------------- */
  function refreshCard() {
    const d = AIRCRAFT[S.ac];
    $('acName').textContent = d.name; $('acEn').textContent = d.en; $('acYear').textContent = d.year; $('acBlurb').textContent = d.blurb;
    $('acStats').innerHTML = Object.entries(d.stats).map(([k, v]) => `<div class="stat"><span>${k}</span><i><b style="width:${k === '引擎' ? v / 3 * 100 : v * 20}%"></b></i></div>`).join('');
    $('acPerk').innerHTML = d.perk; $('acRec').textContent = d.rec;
    fitCard();
    $('acDots').innerHTML = AIRCRAFT.map((_, i) => `<i class="${i === S.ac ? 'on' : ''}"></i>`).join('');
    document.querySelectorAll('.mode').forEach(b => b.classList.toggle('on', +b.dataset.mode === (S.lan ? 3 : S.mode)));
    $('ctrlHelp').innerHTML = Input.touch && (S.lan || S.mode === 1) ? '<b>触屏</b>左半屏拖动 = 摇杆移动 · 右下角：互动 / 拾取 / 冲刺 · 左上角 Ⅱ 暂停' : S.lan || S.mode === 1
      ? '<b>键盘</b><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动 · <kbd>E</kbd> 互动 · <kbd>Q</kbd> 拾取/放下 · <kbd>Shift</kbd> 冲刺<br><b>手柄</b>左摇杆 移动 · <kbd class="pad">A</kbd> 互动 · <kbd class="pad">X</kbd> 拾取/放下 · <kbd class="pad">B</kbd> 冲刺 · <kbd>Start</kbd> 暂停'
      : '<b>一号</b><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · <kbd>E</kbd> 互动 · <kbd>Q</kbd> 拾取 · <kbd>Shift</kbd> 冲刺<br><b>二号</b><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> · <kbd>Enter</kbd> 互动 · <kbd>/</kbd> 拾取 · <kbd>右Shift</kbd> 冲刺<br><b>手柄</b>两只手柄各控一人；只有一只时归二号机组';
  }
  const compact = () => innerHeight <= 520;                   // 手机横屏这类矮屏幕：界面换成紧凑布局（见 index.html 里同条件的样式）
  function fitCard() {
    const c = document.querySelector('.card'); c.style.transform = ''; c.style.zoom = ''; c.style.marginBottom = '';
    if (compact()) { const k = Math.min(1, (innerHeight - 22) / (c.offsetHeight || 460)); c.style.zoom = k < 1 ? k.toFixed(3) : ''; return; }
    const k = Math.min(1, (innerHeight - 175) / (c.offsetHeight || 640)); c.style.transform = k < 1 ? `scale(${k.toFixed(3)})` : ''; c.style.marginBottom = k < 1 ? `${-(1 - k) * c.offsetHeight}px` : '';
  }
  addEventListener('resize', () => { if (S.screen === 'hangar') { refreshCard(); } });
  function setAc(i, fromNet) {
    if (S.net === 'guest' && fromNet !== true) return;          // 联机时座机由机长选
    if (S.busy) return; S.busy = true; Sfx.play.ui();
    fade(true);
    setTimeout(() => { S.ac = (i + AIRCRAFT.length) % AIRCRAFT.length; loadAircraft(S.ac); refreshCard(); fade(false); S.busy = false; netSync(); }, 380);
  }
  function setMode(m) {
    if (m === 3) S.lan = true; else { if (S.net || Net.ws) netClose(); S.lan = false; Net.msg = ''; S.mode = m; }
    Sfx.play.ui(); refreshCard(); netUI();
  }
  function toHangar() {
    cleanupFlight(); S.screen = 'hangar'; S.pause = false;
    ['title', 'hud', 'pause', 'result', 'takeoff'].forEach(id => show(id, false)); show('hangar');
    $('bars').classList.remove('on');
    loadAircraft(S.ac); refreshCard(); Sfx.music(true);
    Object.assign(st, { tod: 0.06, storm: 0, rain: 0, overcast: 0, wisps: 0.15, deck: 0.9, frost: 0, danger: 0, speed: 1, tilt: 0.55, shake: 0, seaDrop: 0 });
    fade(false);
    if (!Net.tried && (Q.get('join') || Q.get('net'))) { Net.tried = true; S.lan = true; refreshCard(); netOpen(Q.get('net') === 'host' ? 'host' : 'guest'); }    // 用队友链接（?join=1）打开：进机库就自动加入
    netUI(); netSync();
  }

  /* ------------------------------- 开始飞行 ------------------------------- */
  function cleanupFlight() {
    if (land) { GFX.scene.remove(land); land.traverse(o => { if (o.geometry) o.geometry.dispose(); }); land = null; }
    if (F) { F = null; }
    SCN.clear();
    Object.assign(Sfx.S, { rough: 0, rain: 0, fire: 0, spray: 0 });
  }
  function startFlight(fromNet) {
    if (S.net === 'guest' && fromNet !== true) return;          // 联机时由机长决定起飞
    if (S.busy) return; S.busy = true; Sfx.init(); Sfx.play.ok(); fade(true);
    if (S.net === 'host') { Net.fid++; netSend({ t: 'start', ac: S.ac, fid: Net.fid }); }
    setTimeout(() => {
      cleanupFlight(); loadAircraft(S.ac);
      GFX.camera.clearViewOffset();
      ['title', 'hangar', 'pause', 'result'].forEach(id => show(id, false)); show('hud'); $('alerts').innerHTML = ''; alertSig = '';
      S.screen = 'flight'; S.pause = false; newFlight(); fade(false); S.busy = false;
      $('bars').classList.add('on');
      caption('纽芬兰 · Harbour Grace<small>1932 年 5 月 20 日 · 傍晚 7 时 12 分</small>', 5000);
    }, 750);
  }
  function newFlight() {
    F = {
      t: 0, phase: 'intro', thr: 0, dist: 0, alt: 0, vs: 0, power: 1, spd: 0, fuelM: 100, fuelR: def.fuelRes, hull: 100, err: 0, est: 0, unc: 0, driftV: 0,
      eng: I.engines.map(() => ({ state: 'ok', t: 0 })), elec: true, tailJam: false, leak: false, probs: [], fires: [], ices: [], inter: [], items: [], players: [],
      evT: 14, iceT: 4, ltT: 4, fireT: 0, bounced: false, pitch: 0, roll: 0, pilot: { c: 0, s: 0, on: false }, cutY: 9, fixed: 0, flags: {}, deadT: 0, outT: 0, hudT: 0, lastP: 0, sinkT: 0, sinkWarn: false, sinkBeep: 0, lowPower: false,
    };
    F.fid = Net.fid; uid = 0;
    const skip = S.net === 'guest' ? 0 : +Q.get('p') || 0;
    for (let i = 0; i < S.mode; i++) {
      const c = P.crew(CREW[i]), sp = I.spawn[i];
      I.root.add(c.g);
      F.players.push({ i, c, zone: 'in', x: sp.x, z: sp.z, y: 0, face: 0, item: null, seated: i === 0, stun: 0, climb: null, dashT: 0, dashCD: 0, target: null, working: false, spray: false, pose: 'idle', moving: 0, inp: {}, workT: 0 });
    }
    const s = I.st;
    if (S.net !== 'guest') {                  // 队友这边不建道具和互动点：都以主机发来的状态为准
    for (const type of ['wrench', 'mallet', 'ext']) addItem(type, I.homes[type]);
    addInter({ id: 'helm', zone: 'in', x: s.helm.x, z: s.helm.z, r: 0.7, kind: 'seat', label: '坐上驾驶座', h: 1.25, vis: p => !F.players.some(o => o.seated) });
    addInter({ id: 'nav', zone: 'in', x: s.nav.x, z: s.nav.z, kind: 'timing', n: 3, arcW: 92, label: '六分仪定位', h: 1.3, done() { F.est = F.err; F.unc = 0; toast(`定位完成：航向偏差 <em style="color:#f0a030;font-style:normal">${Math.abs(F.err) < 2 ? '几乎为零' : Math.abs(F.err).toFixed(0) + '° 偏' + (F.err > 0 ? '南' : '北')}</em>，回驾驶座修正`); } });
    addInter({ id: 'pump', zone: 'in', x: s.pump.x, z: s.pump.z, kind: 'hold', cont: true, label: '摇泵输油', h: 1.2, vis: () => F.fuelR > 0.1 && F.fuelM < 90,
      tick(p, dt) { const a = Math.min(13 * dt, F.fuelR, 100 - F.fuelM); F.fuelR -= a; F.fuelM += a; I.pumpLever.rotation.z = Math.sin(F.t * 9) * 0.5; if (Math.random() < dt * 4) Sfx.play.pump(); } });
    addInter({ id: 'hatchIn', zone: 'in', x: I.hatchIn.x, z: I.hatchIn.z, kind: 'press', label: '爬出机舱', h: 1.5, done(p) { climb(p, 'out', I.hatchOut); } });
    addInter({ id: 'hatchOut', zone: 'out', x: I.hatchOut.x, z: I.hatchOut.z, kind: 'press', label: '回到舱内', h: 1.2, done(p) { climb(p, 'in', I.hatchIn); } });
    addInter({ id: 'spares', zone: 'in', x: s.spares.x, z: s.spares.z, kind: 'press', label: '取备用保险丝', h: 1.1, r: 0.6, vis: p => !p.item && !F.elec, done(p) { take(p, addItem('fuse', null, p)); } });
    }
    land = GFX.makeLand('nf', def.seaplane); F.landX = 180; F.landS0 = st.scroll;
    Object.assign(st, { tod: 0.02, storm: 0, rain: 0, overcast: 0, wisps: 0, deck: 0.85, frost: 0, danger: 0, speed: 0, tilt: 1, shake: 0, seaDrop: def.seaplane ? 0 : 3.2 });
    $('rtStorm').style.left = '42%';
    if (Q.get('scn')) F.scnDbg = Q.get('scn').split(',');          // 调试：?scn=liner,whales 直接放出景物（等高度就绪后的第一帧再放）
    if (skip) { F.phase = 'fly'; F.dist = TOTAL * skip; F.alt = 1900; F.t = 20; F.cutY = I.cut.y; F.players[0].seated = !Q.get('free'); F.landX = -9999; $('bars').classList.remove('on'); }
    updHint();
  }
  function addInter(o) { o.nid = ++uid; o.progress = 0; o.hits = 0; o.arc0 = U.rand(360); o.phase = U.rand(360); F.inter.push(o); return o; }
  function addItem(type, home, holder) {
    const it = { id: ++uid, type, mesh: P.item(type), zone: 'in', x: 0, z: 0, holder: null, home };
    if (home) { it.x = home.x; it.z = home.z; it.mesh.position.set(home.hx, home.hy, home.hz); it.mesh.rotation.y = 0.3; if (type === 'ext') it.mesh.position.y -= 0.02; I.root.add(it.mesh); }
    else if (holder) { it.x = holder.x; it.z = holder.z; }
    F.items.push(it); return it;
  }

  /* ------------------------------ 行走与区域 ------------------------------ */
  const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  const inZone = (zone, x, z) => I.zones[zone].some(r => inRect(r, x, z));
  function groundY(zone, x, z, fallback = 0) { if (zone === 'in') return 0; const y = I.outY(x, z); return y > -1e8 ? y : fallback; }
  function tryMove(p, dx, dz) {
    if (inZone(p.zone, p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; }
    else if (inZone(p.zone, p.x + dx, p.z)) p.x += dx;
    else if (inZone(p.zone, p.x, p.z + dz)) p.z += dz;
  }
  function climb(p, to, pos) {
    p.climb = { t: 0, to, fx: p.x, fz: p.z, fy: p.y, tx: pos.x, tz: pos.z, ty: groundY(to, pos.x, pos.z, 1.5) };
    p.target = null; Sfx.play.hatch();
  }

  /* ------------------------------ 道具拾放 ------------------------------ */
  function nearestItem(p, r = 0.85) {
    let best = null, bd = r;
    for (const it of F.items) { if (it.holder || it.zone !== p.zone) continue; const d = Math.hypot(it.x - p.x, it.z - p.z); if (d < bd) { bd = d; best = it; } }
    return best;
  }
  function take(p, it) {
    it.holder = p; p.item = it; p.c.hold.add(it.mesh); it.mesh.position.set(0, 0, 0);
    it.mesh.rotation.set(0, 0, it.type === 'ext' ? 0 : it.type === 'fuse' ? 0 : 0.9);
    Sfx.play.pick();
  }
  function drop(p) {
    const it = p.item; if (!it) return;
    p.item = null; it.holder = null; it.zone = p.zone; I.root.add(it.mesh);
    const h = it.home;
    if (h && p.zone === 'in' && Math.hypot(p.x - h.x, p.z - h.z) < 0.75) { it.x = h.x; it.z = h.z; it.mesh.position.set(h.hx, h.hy, h.hz); it.mesh.rotation.set(0, 0.3, 0); }
    else {
      let x = p.x + Math.cos(p.face) * 0.32, z = p.z + Math.sin(p.face) * 0.32;
      if (!inZone(p.zone, x, z)) { x = p.x; z = p.z; }
      it.x = x; it.z = z; it.mesh.position.set(x, groundY(p.zone, x, z, p.y) + 0.07, z); it.mesh.rotation.set(it.type === 'ext' ? Math.PI / 2 : 0, U.rand(6), 0);
    }
    Sfx.play.drop();
  }
  function removeItem(it) { if (it.holder) it.holder.item = null; if (it.mesh.parent) it.mesh.parent.remove(it.mesh); F.items.splice(F.items.indexOf(it), 1); }

  /* ------------------------------- 故障事件 ------------------------------- */
  function addProb(type, o) {
    const pr = Object.assign({ type, t: 0 }, o);
    F.probs.push(pr);
    if (pr.inter) { pr.inter.prob = pr; addInter(pr.inter); }
    if (!o.quiet) { Sfx.play.alarm(); Input.rumble(null, 0.5, 0.5, 220); }
    return pr;
  }
  function resolve(pr, silent) {
    const i = F.probs.indexOf(pr); if (i < 0) return;
    F.probs.splice(i, 1);
    if (pr.inter) F.inter.splice(F.inter.indexOf(pr.inter), 1);
    if (pr.onFix) pr.onFix();
    if (!silent) { F.fixed++; Sfx.play.done(); }
  }
  const en = k => (ENGN[def.id] || [''])[k] || '';
  const EV = {
    rough(k) {
      const e = F.eng[k], s = I.st.eng; e.state = 'rough'; e.t = 0; Sfx.play.sputter();
      return addProb('rough', { k, title: '引擎怠速' + en(k), hint: '到<em>油门台</em>重新调校混合比', badge: '引', crit: I.engines.length === 1,
        inter: { zone: 'in', x: s.x, z: s.z, kind: 'timing', n: 3, arcW: 94, label: '调校混合比', h: 1.2 }, onFix() { if (e.state === 'rough') e.state = 'ok'; } });
    },
    fail(k) {
      const e = F.eng[k], a = I.engines[k].out; e.state = 'fail'; Sfx.play.fire(); st.shake = Math.max(st.shake, 0.25);
      const old = F.probs.find(q => q.type === 'rough' && q.k === k); if (old) resolve(old, true);
      return addProb('fail', { k, title: '引擎起火停车' + en(k), hint: '带<em>扳手</em>爬出机舱抢修', badge: '引', crit: true,
        inter: { zone: 'out', x: a.x, z: a.z, kind: 'hold', dur: 3.5, need: 'wrench', label: '抢修引擎', h: 1.35, r: 0.8 }, onFix() { e.state = 'ok'; } });
    },
    tail() {
      F.tailJam = true;
      return addProb('tail', { title: '尾翼卡死', hint: '带<em>扳手</em>爬到机尾松开舵面', badge: '尾', crit: true,
        inter: { zone: 'out', x: I.tail.x, z: I.tail.z, kind: 'timing', n: 3, arcW: 86, need: 'wrench', label: '撬开舵面钢索', h: 1.3, r: 0.8 }, onFix() { F.tailJam = false; } });
    },
    leak() {
      F.leak = true; const s = I.st.tank;
      return addProb('leak', { title: '燃油泄漏', hint: '带<em>扳手</em>拧紧油箱管路', badge: '油', crit: false,
        inter: { zone: 'in', x: s.x, z: s.z, kind: 'hold', dur: 2.7, need: 'wrench', label: '拧紧油管', h: 1.1 }, onFix() { F.leak = false; } });
    },
    fire() {
      F.elec = false; Sfx.play.fire(); st.shake = Math.max(st.shake, 0.3);
      spawnFire(U.pick(I.firePts)); F.fireT = 7;
      return addProb('fire', { title: '电路起火', hint: '拿<em>灭火器</em>，按住互动键喷射', badge: '火', crit: true });
    },
    fuse() {
      const s = I.st.fuse;
      return addProb('fuse', { title: '保险丝熔断 · 全机断电', hint: '从<em>备件箱</em>取保险丝换上', badge: '电', crit: false, quiet: true,
        inter: { zone: 'in', x: s.x, z: s.z, kind: 'hold', dur: 1.5, need: 'fuse', label: '更换保险丝', h: 1.45, consume: true }, onFix() { F.elec = true; } });
    },
    wind() {
      F.err += (Math.random() < 0.5 ? -1 : 1) * U.rand(11, 18); F.unc += 16; Sfx.play.whoosh();
      toast('风向突变 —— 航向不明，需要到导航台<em style="color:#f0a030;font-style:normal">重新定位</em>', true);
    },
  };
  function spawnFire(pt) {
    if (F.fires.some(f => f.pt === pt)) return;
    F.fires.push({ pt, x: pt.x, z: pt.z, hp: 0.45 });
  }
  function iceMesh(pt) {
    const y = groundY('out', pt.x, pt.z, 1), g = new T.Group();
    for (let i = 0; i < 7; i++) { const m = P.mesh(new T.IcosahedronGeometry(U.rand(0.1, 0.24), 0), P.M.ice, U.rand(-0.35, 0.35), U.rand(0, 0.12), U.rand(-0.4, 0.4)); m.rotation.set(U.rand(3), U.rand(3), U.rand(3)); m.scale.y = U.rand(0.5, 1.3); m.castShadow = true; g.add(m); }
    P.bakeStatic(g);
    g.position.set(pt.x, y, pt.z); g.scale.setScalar(0.01); I.root.add(g);
    return g;
  }
  function spawnIce() {
    const free = I.icePts.filter(pt => !F.ices.some(i => i.pt === pt)); if (!free.length) return;
    const pt = U.pick(free), g = iceMesh(pt);
    const ice = { pt, x: pt.x, z: pt.z, hp: 0.3, mesh: g };
    ice.inter = addInter({ zone: 'out', x: pt.x, z: pt.z, kind: 'mash', n: 4, need: 'mallet', label: '敲碎积冰', h: 1.25, r: 0.85, ice, done() { removeIce(ice, true); } });
    F.ices.push(ice);
    if (!F.flags.ice) { F.flags.ice = 1; toast(`机翼结冰！降到 <em style="color:#a8dcff;font-style:normal">${MELT} 米</em>以下融冰，或带<em style="color:#a8dcff;font-style:normal">木槌</em>出舱敲掉`, true, 6000); Sfx.play.alarm(); }
  }
  function removeIce(ice, byHand) {
    const i = F.ices.indexOf(ice); if (i < 0) return;
    F.ices.splice(i, 1); F.inter.splice(F.inter.indexOf(ice.inter), 1); I.root.remove(ice.mesh);
    if (byHand) { F.fixed++; fx.emit('ice', ice.x, ice.mesh.position.y + 0.2, ice.z, 26); }
  }

  /* 事件导演：按进度、天气与人数调度故障 */
  function director(dt) {
    const p = F.dist / TOTAL, solo = S.mode === 1;
    if (!F.flags.tut1 && p > 0.045) { F.flags.tut1 = 1; EV.rough(0); toast('引擎转速不稳！离开驾驶座，到<em style="color:#f0a030;font-style:normal">油门台</em>调校', true, 5500); F.evT = solo ? 26 : 18; return; }
    if (!F.flags.tut2 && p > 0.13) { F.flags.tut2 = 1; EV.wind(); F.evT = Math.max(F.evT, 12); return; }
    // 发动机怠速久拖不修会恶化
    for (const pr of F.probs) if (pr.type === 'rough') { F.eng[pr.k].t += dt; if (F.eng[pr.k].t > 95) { EV.fail(pr.k); toast('引擎彻底罢工了！' + en(pr.k), true); break; } }
    // 火势蔓延
    if (F.fires.length) { F.fireT -= dt; if (F.fireT <= 0 && F.fires.length < (solo ? 3 : 4)) { F.fireT = solo ? 12 : 9; const src = U.pick(F.fires); const c = I.firePts.filter(q => !F.fires.some(f => f.pt === q)).sort((a, b) => Math.hypot(a.x - src.x, a.z - src.z) - Math.hypot(b.x - src.x, b.z - src.z))[0]; if (c) spawnFire(c); } }
    // 结冰
    if (st.storm > 0.45 && F.alt > FREEZE) { F.iceT -= dt; if (F.iceT <= 0) { F.iceT = solo ? U.rand(10, 14) : U.rand(6.5, 9); if (F.ices.length < (solo ? 3 : 4)) spawnIce(); } }
    // 闪电
    if (st.storm > 0.3) {
      F.ltT -= dt;
      if (F.ltT <= 0) { F.ltT = U.rand(2.5, 8) / st.storm; const pw = U.rand(0.5, 1); GFX.lightning(pw); Sfx.play.thunder(U.rand(0.2, 1.2)); st.shake = Math.max(st.shake, 0.12 * pw); Input.rumble(null, 0.3 * pw, 0.6 * pw, 300); }
    }
    F.evT -= dt; if (F.evT > 0) return;
    const major = F.probs.length + (F.ices.length > 2 ? 1 : 0);
    if (major >= (solo ? 2 : 3)) { F.evT = 5; return; }
    F.evT = (solo ? U.rand(29, 39) : U.rand(16, 22)) * (1.12 - 0.3 * p);
    const okEng = F.eng.map((e, k) => e.state === 'ok' ? k : -1).filter(k => k >= 0), single = F.eng.length === 1;
    const w = [];
    if (okEng.length) { w.push(['rough', 3]); if (p > 0.18 && !(single && F.alt < 900)) w.push(['fail', single ? 1.0 : 1.6]); }
    if (p > 0.15 && !F.tailJam) w.push(['tail', 1.4]);
    if (p > 0.1 && !F.leak) w.push(['leak', 1.5]);
    if (p > 0.22 && F.elec && !F.fires.length) w.push(['fire', 1.2 + st.storm * 1.6]);
    w.push(['wind', F.unc > 20 ? 0.6 : 1.8]);
    let r = Math.random() * w.reduce((a, x) => a + x[1], 0), pick = w[0][0];
    for (const x of w) { r -= x[1]; if (r <= 0) { pick = x[0]; break; } }
    if (pick === 'rough' || pick === 'fail') EV[pick](U.pick(okEng));
    else if (pick === 'fire' && st.storm > 0.3) { GFX.lightning(1); Sfx.play.thunder(0); st.shake = 0.5; F.hull -= 3 * def.tough; EV.fire(); toast('遭到雷击 —— 电路起火！', true); }
    else EV[pick]();
  }

  /* ------------------------------- 机组更新 ------------------------------- */
  function findTarget(p) {
    let best = null, bd = 1e9;
    for (const it of F.inter) {
      if (it.zone !== p.zone || (it.vis && !it.vis(p))) continue;
      let d = Math.hypot(it.x - p.x, it.z - p.z); if (d > (it.r || 0.75)) continue;
      if (it.prob || it.ice) d -= 0.5;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  const canUse = (p, it) => !it.need || (p.item && p.item.type === it.need);
  const needle = it => (F.t * 265 + it.phase) % 360;
  function complete(it, p) {
    it.progress = 0; it.hits = 0;
    if (it.consume && p.item) removeItem(p.item);
    if (it.done) it.done(p);
    if (it.prob) resolve(it.prob);
    else Sfx.play.done();
    Input.rumble(p.inp.gp, 0.5, 0.8, 180);
    if (it.kind !== 'press') fx.emit('spark', it.x, groundY(it.zone, it.x, it.z, p.y) + 0.8, it.z, 14);
  }
  function interact(p, inp, dt) {
    const it = p.target; if (!it) return false;
    if (!canUse(p, it)) return false;
    switch (it.kind) {
      case 'press': if (inp.actP) complete(it, p); break;
      case 'seat': if (inp.actP) { p.seated = true; p.x = it.x; p.z = it.z; Sfx.play.pick(); updHint(); } break;
      case 'hold':
        if (inp.act) {
          p.working = true; if (it.tick) it.tick(p, dt);
          if (!it.cont) { it.progress += dt / it.dur; if (Math.random() < dt * 5) { Sfx.play.clank(); fx.emit('spark', it.x, p.y + 0.75, it.z, 3); } if (it.progress >= 1) complete(it, p); }
        } break;
      case 'mash':
        if (inp.actP) { it.progress += 1 / it.n; p.workT = 0.22; Sfx.play.ice(); fx.emit('ice', it.x, p.y + 0.3, it.z, 8); Input.rumble(inp.gp, 0.3, 0.6, 80); if (it.progress >= 0.999) complete(it, p); }
        break;
      case 'timing':
        p.focus = true;
        if (inp.actP) {
          const d = ((needle(it) - it.arc0) % 360 + 360) % 360;
          if (d < it.arcW) { it.hits++; it.arc0 = (it.arc0 + U.rand(100, 250)) % 360; Sfx.play.hitOK(); p.workT = 0.3; fx.emit('spark', it.x, p.y + 0.8, it.z, 5); if (it.hits >= it.n) complete(it, p); }
          else { it.hits = Math.max(0, it.hits - 1); p.stun = 0.3; Sfx.play.miss(); Input.rumble(inp.gp, 0.7, 0.2, 120); }
        } break;
    }
    return true;
  }
  function updPlayer(p, dt) {
    const inp = p.inp = S.net === 'host' ? (p.i === 0 ? Input.player(0, 1) : netRemoteInput()) : Input.player(p.i, S.mode);      // 联机：一号用本机的全部按键，二号用队友发来的
    p.working = false; p.spray = false; p.focus = false; p.moving = 0; p.pose = 'idle';
    let wind = 0;
    const live = F.phase === 'fly' || F.phase === 'intro';
    if (!live) { if (p.seated) p.pose = 'sit'; }
    else if (p.stun > 0) { p.stun -= dt; p.pose = 'stun'; }
    else if (p.climb) {
      const c = p.climb; c.t += dt / 0.7; const u = Math.min(1, c.t), e = U.smooth(0, 1, u);
      p.x = U.lerp(c.fx, c.tx, e); p.z = U.lerp(c.fz, c.tz, e); p.y = U.lerp(c.fy, c.ty, e) + Math.sin(Math.PI * u) * 0.35; p.pose = 'climb';
      if (u >= 1) { p.zone = c.to; p.climb = null; }
    } else if (p.seated) {
      const h = I.st.helm; p.x = h.x; p.z = h.z; p.face = 0; p.pose = 'sit';
      F.pilot.on = true; F.pilot.c = -inp.my; F.pilot.s = inp.mx; F.pilot.act = inp.act;
      if (F.phase === 'fly' && (inp.actP || inp.altP || inp.dashP)) { p.seated = false; p.x -= 0.5; if (!inZone('in', p.x, p.z)) p.x = h.x; Sfx.play.drop(); updHint(); }
    } else {
      let sp = p.zone === 'out' ? 2.15 : 3.2;
      p.dashCD -= dt;
      if (inp.dashP && p.dashCD <= 0 && (inp.mx || inp.my)) { p.dashT = 0.17; p.dashCD = 0.75; Sfx.play.whoosh(); }
      if (p.dashT > 0) { p.dashT -= dt; sp *= 2.7; }
      let vx = inp.mx * sp, vz = inp.my * sp;
      p.moving = Math.min(1, Math.hypot(inp.mx, inp.my));
      if (p.zone === 'out') { wind = 0.5 + st.storm * 0.5; if (F.phase === 'fly') vx -= (0.75 + st.storm * 1.2) * (p.target && p.target.zone === 'out' ? 0.25 : 1); }
      tryMove(p, vx * dt, vz * dt);
      if (p.moving > 0.1) { const a = Math.atan2(inp.my, inp.mx); let d = a - p.face; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283; p.face += d * Math.min(1, dt * 16); p.pose = 'walk'; }
      for (const o of F.players) if (o !== p && o.zone === p.zone && !o.seated && !o.climb) { const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz); if (d < 0.42 && d > 0.001) tryMove(p, dx / d * (0.42 - d) * 0.5, dz / d * (0.42 - d) * 0.5); }
      p.y = U.damp(p.y, groundY(p.zone, p.x, p.z, p.y), 14, dt);
      // 互动
      p.target = findTarget(p);
      const ext = p.item && p.item.type === 'ext';
      let used = false;
      if (ext && inp.act && (F.fires.length || !p.target || !canUse(p, p.target) || p.target.kind === 'seat')) {
        p.spray = true; used = true; p.pose = 'spray';
        const cx = Math.cos(p.face), cz = Math.sin(p.face);
        fx.emit('foam', p.x + cx * 0.45, p.y + 0.6, p.z + cz * 0.45, 3, [cx * 5.5, -0.4, cz * 5.5]);
        for (const f of F.fires.slice()) {
          const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz);
          if (p.zone === 'in' && d < 2.0 && (d < 0.5 || (dx * cx + dz * cz) / d > 0.6)) { f.hp -= dt * 0.42; if (f.hp <= 0) { F.fires.splice(F.fires.indexOf(f), 1); Sfx.play.ok(); fx.emit('smoke', f.x, 0.3, f.z, 14); } }
        }
      } else if (p.target) used = interact(p, inp, dt);
      if (inp.actP && !used) {
        const it = !p.item && nearestItem(p);
        if (it) take(p, it); else if (p.target) Sfx.play.miss();
      }
      if (inp.altP) {
        if (p.item) {               // 站在这件工具自己的架子旁：只放回去，不顺手换成隔壁架子上的（否则永远放不下手里的东西）
          const h = p.item.home, nearHome = h && p.zone === 'in' && Math.hypot(p.x - h.x, p.z - h.z) < 0.75, o = nearHome ? null : nearestItem(p, 0.38);
          drop(p); if (o) take(p, o);
        } else { const o = nearestItem(p); if (o) take(p, o); }
      }
      if (p.working || p.workT > 0) { p.pose = 'work'; const t = p.target; if (t) { const a = Math.atan2(t.z - p.z, t.x - p.x); let d = a - p.face; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283; p.face += d * Math.min(1, dt * 12); } }
      p.workT -= dt;
      // 火焰灼伤
      if (p.zone === 'in') for (const f of F.fires) { const dx = p.x - f.x, dz = p.z - f.z, d = Math.hypot(dx, dz); if (d < 0.42 * f.hp + 0.12 && !p.spray) { p.stun = 0.45; tryMove(p, (dx / (d || 1)) * 0.5, (dz / (d || 1)) * 0.5); Sfx.play.miss(); Input.rumble(inp.gp, 0.8, 0.3, 200); } }
    }
    if (p.seated) p.y = I.sitY;
    p.c.g.position.set(p.x, p.y, p.z); p.c.g.rotation.y = -p.face;
    p.c.ring.visible = S.mode === 2; p.wind = wind;
    P.animCrew(p.c, { pose: p.pose, moving: p.moving, wind, carry: !!p.item, steer: p.seated ? inp.mx : 0, pull: p.seated ? -inp.my : 0 }, dt);
  }

  /* -------------------------------- 飞行模型 ------------------------------- */
  function weather() {
    const p = F.dist / TOTAL;
    const storm = U.smooth(0.40, 0.47, p) * (1 - U.smooth(0.63, 0.7, p));
    st.storm = storm; st.rain = storm; st.overcast = storm * 0.95 + U.smooth(0.3, 0.4, p) * (1 - U.smooth(0.7, 0.8, p)) * 0.25;
    st.wisps = Math.max(storm * 0.95, U.smooth(0.12, 0.16, p) * (1 - U.smooth(0.2, 0.26, p)) * 0.5, 0.08);
    st.deck = 0.9 - 0.25 * U.smooth(0.8, 1, p);
    st.tod = 0.03 + p * 0.94;
    Sfx.S.rain = storm; Sfx.S.mood = storm > 0.3 || F.probs.some(q => q.crit) ? 1 : 0;
  }
  function updFlight(dt) {
    const p = F.pilot, n = F.eng.length;
    let pw = 0, burnF = 0;
    for (const e of F.eng) { pw += e.state === 'ok' ? 1 : e.state === 'rough' ? 0.5 : n === 1 ? 0.22 : 0; burnF += e.state === 'ok' ? 1 : e.state === 'rough' ? 0.8 : 0.1; }
    pw /= n; if (F.fuelM <= 0) pw = 0;
    F.power = U.damp(F.power, pw, 1.3, dt);
    let iceLoad = 0; for (const i of F.ices) iceLoad += i.hp;
    const margin = F.power - 0.52 - iceLoad * 0.06, turb = st.storm * 0.9 + 0.1;
    const c = F.tailJam ? 0 : p.on ? p.c : 0;
    let vsT = p.on ? (c > 0 ? c * 48 * U.clamp(margin * 2.6, 0, 1) : c * 70) : -3 - turb * 6;
    if (margin < 0) vsT += margin * 95;
    vsT -= iceLoad * 4;
    if (F.tailJam) vsT -= 6;
    vsT -= st.storm * 11 * Math.max(0, Math.sin(F.t * 0.7) * Math.sin(F.t * 0.23 + 1)) * (p.on ? 0.45 : 1);
    if (F.alt > 3300) vsT = Math.min(vsT, (3500 - F.alt) * 0.25);
    F.vs = U.damp(F.vs, vsT, 1.1, dt); F.alt += F.vs * dt;
    // 持续下降警告：连续下沉 4 秒就报警（驾驶员自己压杆俯冲不算），越接近海面响得越急
    F.lowPower = margin < 0;
    // 快速下沉任何高度都报；缓慢下沉（比如离座后的自然掉高）只在 1500 米以下才报，免得一离座就响个不停
    F.sinkT = F.vs < -2.5 && (F.vs < -8 || F.alt < 1500) && !(p.on && p.c < -0.3) ? F.sinkT + dt : Math.max(0, F.sinkT - dt * 2.5);
    if (F.sinkT > 4) {
      const tti = F.alt / Math.max(1, -F.vs);
      if (!F.sinkWarn) { F.sinkWarn = true; F.sinkBeep = 0; toast(F.lowPower ? '飞机在持续下降 —— 动力不足，光拉杆没用，先排除引擎或结冰故障！' : `飞机在持续下降！回驾驶座${Input.lastDev[0] === 'touch' ? '' : '按 '}${kUp()} 拉起 —— <em style="color:#f0a030;font-style:normal">高度就是生命</em>`, true, 5000); }
      F.sinkBeep -= dt; if (F.sinkBeep <= 0) { F.sinkBeep = tti < 20 ? 1.1 : tti < 45 ? 2 : 3.5; Sfx.play.alarm(); Input.rumble(null, 0.25, 0.35, 120); }
      F.sinkCrit = tti < 30;
    } else if (F.sinkT < 0.5) { F.sinkWarn = false; F.sinkCrit = false; }
    // 航向
    F.driftV += (Math.random() - 0.5) * dt * 1.1; F.driftV = U.clamp(F.driftV * (1 - dt * 0.05), -0.45 - st.storm * 0.8, 0.45 + st.storm * 0.8);
    const d = F.driftV * (F.tailJam ? 2.2 : 1) * (p.on ? 1 : 1.35);
    const steer = (p.on ? p.s : 0) * (F.tailJam ? 0.12 : 1) * 9 * dt;
    F.err = U.clamp(F.err + d * dt + steer, -60, 60); F.est = U.clamp(F.est + steer, -60, 60); F.unc = Math.min(40, F.unc + Math.abs(d) * dt * 0.9 + 0.05 * dt);
    const course = U.clamp(1 - Math.pow(Math.abs(F.err) / 42, 1.6), 0.2, 1);
    F.spd = (0.3 + 0.7 * F.power) * (1 - 0.22 * Math.min(1, iceLoad / 3)) * course;
    F.dist += KPS * def.speed * F.spd * dt;
    // 燃油
    F.fuelM = Math.max(0, F.fuelM - 0.26 * def.burn * burnF / n * dt - (F.leak ? 1.6 * dt : 0));
    // 冰：低空融化，高空增长
    for (const i of F.ices.slice()) {
      if (F.alt < MELT) { i.hp -= dt * 0.14; if (i.hp <= 0) removeIce(i, false); } else if (st.storm > 0.3 && F.alt > FREEZE) i.hp = Math.min(1, i.hp + dt * 0.06);
      i.mesh.scale.setScalar(U.damp(i.mesh.scale.x, 0.35 + i.hp * 0.9, 5, dt));
    }
    // 火
    for (const f of F.fires) { f.hp = Math.min(1, f.hp + dt * 0.035); F.hull -= f.hp * 0.95 * def.tough * dt; }
    if (!F.fires.length && !F.elec && !F.probs.some(q => q.type === 'fuse')) { const pr = F.probs.find(q => q.type === 'fire'); if (pr) resolve(pr); EV.fuse(); toast('明火已灭 —— 但保险丝烧断了，全机断电'); }
    // 姿态
    F.pitch = U.damp(F.pitch, U.clamp(F.vs / 260, -0.22, 0.16) + Math.sin(F.t * 0.9) * 0.012 * (1 + turb * 3), 3, dt);
    F.roll = U.damp(F.roll, (p.on ? p.s : 0) * 0.2 + U.clamp(d * 0.12, -0.12, 0.12) + Math.sin(F.t * 0.63) * 0.015 * (1 + turb * 4), 2.5, dt);
    st.speed = 0.35 + 0.65 * F.power;
    st.shake = Math.max(st.shake * Math.exp(-dt * 3), turb * 0.035 + (F.alt < 250 ? 0.03 : 0));
    // 结局判定
    if (F.alt <= 0) {
      if (def.seaplane && !F.bounced) { F.bounced = true; F.alt = 40; F.vs = 55; F.hull -= 34 * def.tough; st.shake = 0.9; Sfx.play.splash(); fx.emit('spray', 0, -1, 0, 80); toast('船身擦过浪尖，弹了起来！别再有第二次了', true, 5000); Input.rumble(null, 1, 1, 500); }
      else return die('sea');
    }
    if (F.hull <= 0) return die('hull');
    if (F.dist >= TOTAL) return arrive();
    p.on = false;
  }

  /* ------------------------------ 起飞 / 抵达 / 坠毁 ------------------------------ */
  function takeoffUI() {
    const g = glyphOf(0), tk = $('takeoff'), guest = S.net === 'guest'; show('takeoff', F.t > 3);
    const bar = `<span style="color:#c9a45c">${'▮'.repeat(Math.round(F.thr * 10))}${'▯'.repeat(10 - Math.round(F.thr * 10))}</span>`;
    const html = F.thr < 0.86 ? (guest ? '机长正在推油门 ' + bar : `按住 ${g.act} 推满油门 ${bar}`) : guest ? '速度够了 —— 等机长拉杆离地！' : Input.lastDev[0] === 'touch' ? '速度够了 —— 上推摇杆，拉杆离地！' : '速度够了 —— <kbd>↑</kbd> / 摇杆向上，拉杆离地！';
    if (tk._h !== html) { tk.innerHTML = html; tk._h = html; }
  }
  function updIntro(dt) {
    const p = F.pilot;
    F.cutY = U.damp(F.cutY, F.t > 2.2 ? I.cut.y : 9, 2.2, dt);
    F.thr = U.clamp(F.thr + (p.act ? dt / 3.4 : -dt / 7), 0, 1);
    st.speed = F.thr * F.thr * 0.2 + F.thr * 0.8;
    const local = st.scroll - F.landS0 - 180;
    takeoffUI();
    if (F.thr > 0.86 && (p.c > 0.3 || local > 330)) { F.vs = U.damp(F.vs, 34, 2, dt); F.alt += F.vs * dt; }
    F.pitch = U.damp(F.pitch, F.alt > 0.5 ? 0.13 : 0, 2.5, dt);
    if (F.thr > 0.05 && F.alt < 4 && Math.random() < dt * 40 * F.thr) fx.emit(def.seaplane ? 'spray' : 'dust', U.rand(-1, 2), -def.gearH + 0.2, U.rand(-1.6, 1.6), 1);
    if (F.alt > 70) {
      F.phase = 'fly'; show('takeoff', false); $('bars').classList.remove('on'); F.evT = 18;
      toast(`离地！继续${Input.lastDev[0] === 'touch' ? '' : '按 '}${kUp()} 爬升 —— <em style="color:#f0a030;font-style:normal">高度就是时间，高度就是生命</em>`, false, 6500);
      setTimeout(() => { if (F && F.phase === 'fly') toast(`按 ${glyphOf(0).act} 可离开驾驶座；无人驾驶时飞机会缓缓下沉、偏航`, false, 6000); }, 9000);
    }
    p.on = false; p.act = false;
  }
  function arrive() {
    F.phase = 'outro'; F.outT = -0.8; fade(true); Sfx.play.fanfare(); show('takeoff', false);
    setTimeout(() => {
      if (!F) return;
      F.probs.slice().forEach(q => resolve(q, true)); F.fires.length = 0; F.ices.slice().forEach(i => removeIce(i, false)); F.elec = true; F.tailJam = F.leak = false; F.eng.forEach(e => { e.state = 'ok'; });
      if (land) GFX.scene.remove(land);
      land = GFX.makeLand('ie', def.seaplane);
      Object.assign(st, { tod: 1, storm: 0, rain: 0, overcast: 0, wisps: 0.05, deck: 0.35, frost: 0, danger: 0, shake: 0 });
      F.alt = 240; F.vs = 0; F.outT = 0; F.err = F.est = 0;
      for (const p of F.players) { if (p.item) drop(p); p.zone = 'in'; p.climb = null; p.stun = 0; if (p.i === 0) p.seated = true; else { p.x = I.spawn[1].x; p.z = I.spawn[1].z; p.y = 0; } }
      $('bars').classList.add('on'); show('hud', false); fade(false);
      caption('次日清晨 · 北爱尔兰 Derry 郊外<small>一片牧场，几头受惊的奶牛</small>', 7000);
    }, 800);
  }
  function updOutro(dt) {
    if (F.outT < 0) return;
    F.outT += dt; const Tt = 14, u = Math.min(1, F.outT / Tt), e = 1 - Math.pow(1 - u, 1.6);
    const x = 520 - 480 * e; st.speed = Math.max(0, (F.landX - x) / Math.max(dt, 1e-3) / GFX.WORLD_SPEED); F.landX = x; F.landS0 = st.scroll;
    const a = 240 * Math.pow(Math.max(0, 1 - u / 0.74), 1.5);
    if (F.alt > 0 && a <= 0) { Sfx.play.clank(); st.shake = 0.35; Input.rumble(null, 0.8, 0.6, 350); }
    F.alt = a; F.power = U.damp(F.power, u > 0.74 ? 0.15 : 0.6, 2, dt);
    F.pitch = U.damp(F.pitch, a > 2 ? -0.03 + 0.1 * U.smooth(0.5, 0.74, u) : 0, 3, dt); F.roll = U.damp(F.roll, 0, 3, dt);
    if (a <= 0 && u < 0.98 && Math.random() < dt * 30) fx.emit(def.seaplane ? 'spray' : 'dust', U.rand(-1, 2), -def.gearH + 0.2, U.rand(-1.6, 1.6), 1);
    if (F.outT > Tt + 1.2 && S.screen === 'flight') result(true);
  }
  function die(cause) {
    F.phase = 'dead'; F.cause = cause; F.deadT = 0; st.shake = 1; show('takeoff', false);
    Sfx.play.crash(); if (cause === 'sea') Sfx.play.splash(); Input.rumble(null, 1, 1, 800);
    for (let i = 0; i < 6; i++) fx.emit(cause === 'sea' ? 'spray' : 'flame', U.rand(-3, 3), U.rand(-1, 1), U.rand(-2, 2), 20);
  }
  function updDead(dt) {
    F.deadT += dt; st.speed = U.damp(st.speed, 0, 1.5, dt); st.shake *= Math.exp(-dt * 2);
    if (F.cause === 'hull') { F.alt = Math.max(0, F.alt - dt * 500); F.pitch = U.damp(F.pitch, -0.6, 1.5, dt); F.roll += dt * 0.5; if (Math.random() < dt * 60) fx.emit('flame', U.rand(-3, 3), U.rand(0, 1.5), U.rand(-1, 1), 2); if (Math.random() < dt * 40) fx.emit('trail', U.rand(-3, 3), 1, U.rand(-1, 1), 1); }
    else { F.pitch = U.damp(F.pitch, -0.35, 2, dt); F.roll = U.damp(F.roll, 0.3, 1, dt); if (Math.random() < dt * 50) fx.emit('spray', U.rand(-4, 4), -0.5, U.rand(-3, 3), 2); }
    F.power = U.damp(F.power, 0, 3, dt);
    if (F.deadT > 2.6 && S.screen === 'flight') result(false);
  }
  function result(win) {
    if (S.net === 'host') netSend({ t: 'res', fid: F.fid, win });
    $('rAgain').style.display = S.net === 'guest' ? 'none' : ''; $('rHangar').textContent = S.net === 'guest' ? '离开联机' : '返回机库';
    S.screen = 'result'; S.sel = S.net === 'guest' ? 1 : 0; show('hud', false); show('result'); $('bars').classList.remove('on');
    const par = BASE_T / def.speed, hrs = 14.93 * F.t / par, hh = Math.floor(hrs), mm = Math.floor((hrs - hh) * 60);
    const rows = [];
    if (win) {
      const stars = F.hull >= 70 && F.t <= par * 1.18 ? 3 : F.hull >= 40 ? 2 : 1;
      $('resTitle').textContent = '抵达爱尔兰'; $('resSub').textContent = 'LANDFALL · DERRY';
      $('resStars').innerHTML = '★'.repeat(stars) + `<i>${'★'.repeat(3 - stars)}</i>`;
      rows.push(['飞行时间', `${hh} 小时 ${mm} 分`], ['机体完好', Math.max(0, Math.round(F.hull)) + '%'], ['剩余燃油', Math.round(F.fuelM + F.fuelR) + ' 加仑'], ['排除故障', F.fixed + ' 次'], ['座机', def.en]);
      $('resQuote').innerHTML = '一个农夫跑过来，问：「你是从很远的地方飞来的吗？」<br>「从美国。」';
    } else {
      $('resTitle').textContent = F.cause === 'sea' ? '坠入大西洋' : '空中解体'; $('resSub').textContent = 'LOST AT SEA';
      $('resStars').innerHTML = '';
      rows.push(['已飞航程', `${U.fmt(F.dist)} / ${U.fmt(TOTAL)} 公里`], ['完成度', Math.round(F.dist / TOTAL * 100) + '%'], ['排除故障', F.fixed + ' 次'], ['座机', def.en]);
      $('resQuote').innerHTML = '「最难的是下定决心去做，剩下的不过是坚持。」<br>—— Amelia Earhart';
    }
    $('resStats').innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
    selBtns(['rAgain', 'rHangar']);
  }

  /* ---------------------------------- HUD ---------------------------------- */
  let alertSig = '';
  function updHint() {
    if (!F) return;
    const rows = F.players.filter(p => !S.net || p.i === me()).map(p => {
      const g = glyphOf(p.i), tag = S.mode === 2 ? `<span class="ptag" style="background:${PCOL[p.i]}">P${p.i + 1}</span> ` : '';
      return p.seated ? `${tag}<kbd>↑</kbd><kbd>↓</kbd> 爬升/俯冲 · <kbd>←</kbd><kbd>→</kbd> 修正航向 · ${g.act} 离座`
        : `${tag}${g.act} 互动 · ${g.alt} 拾取/放下 · ${g.dash} 冲刺`;
    });
    const h = rows.join('<br>'), el = $('hint'); if (el._h !== h) { el.innerHTML = h; el._h = h; }
  }
  function hud(dt) {
    const p = U.clamp(F.dist / TOTAL, 0, 1);
    $('rtFill').style.width = (p * 100) + '%'; $('rtPlane').style.left = (p * 100) + '%';
    $('altN').style.transform = `rotate(${-135 + U.clamp(F.alt / 3600, 0, 1) * 270}deg)`;
    $('crsN').style.left = (50 + U.clamp(F.est, -45, 45) / 45 * 50) + '%';
    const b = $('crsBand'); b.style.left = U.clamp(50 + (F.est - F.unc) / 45 * 50, 0, 100) + '%'; b.style.width = U.clamp(F.unc * 2 / 45 * 50, 0, 100) + '%';
    $('hud').classList.toggle('blackout', !F.elec);
    F.hudT -= dt; if (F.hudT > 0) return; F.hudT = 0.12; updHint();
    const par = BASE_T / def.speed, hrs = 14.93 * F.t / par, kmh = Math.round(218 * def.speed / 1.14 * 1.14 * F.spd + 0);
    $('rtInfo').textContent = `航程 ${U.fmt(F.dist)} / ${U.fmt(TOTAL)} km  ·  已飞 ${String(Math.floor(hrs)).padStart(2, '0')}:${String(Math.floor(hrs % 1 * 60)).padStart(2, '0')}  ·  地速 ${F.phase === 'fly' ? kmh : 0} km/h`;
    $('altV').textContent = F.elec ? U.fmt(Math.max(0, F.alt)) : '- - -';
    $('vsI').textContent = F.vs > 4 ? '▲' : F.vs < -4 ? '▼' : '–'; $('vsI').style.color = F.vs < -4 ? '#ff6a5a' : F.vs > 4 ? '#58b368' : '';
    $('crsTxt').textContent = F.unc > 18 ? '航向不明' : Math.abs(F.est) < 3 ? '航向正确' : `偏${F.est > 0 ? '南' : '北'} ${Math.abs(F.est).toFixed(0)}°`;
    $('crsTxt').style.color = F.unc > 18 ? '#f0a030' : Math.abs(F.est) < 3 ? '#58b368' : '#f3e6c8';
    $('fuelM').style.width = F.fuelM + '%'; $('fuelMT').textContent = Math.round(F.fuelM); $('fmRow').classList.toggle('low', F.fuelM < 22);
    $('fuelR').style.width = (F.fuelR / def.fuelRes * 100) + '%'; $('fuelRT').textContent = Math.round(F.fuelR);
    $('hullB').style.width = Math.max(0, F.hull) + '%'; $('hullT').textContent = Math.max(0, Math.round(F.hull)) + '%'; $('hullRow').classList.toggle('low', F.hull < 30);
    let ice = 0; for (const i of F.ices) ice += i.hp;
    show('iceRow', F.ices.length > 0); $('iceB').style.width = Math.min(100, ice / 4 * 100) + '%'; $('iceT').textContent = '×' + F.ices.length;
    $('engRow').innerHTML = '引擎 ' + F.eng.map(e => `<span class="eng ${e.state === 'ok' ? (F.fuelM <= 0 ? 'fail' : '') : e.state}"></span>`).join('');
    // 警报列表
    const al = F.probs.map(q => [q.badge, q.title, q.hint, q.crit]);
    if (F.ices.length) al.push(['冰', `机翼结冰 ×${F.ices.length}`, `带<em>木槌</em>出舱敲冰，或降到 ${MELT} 米以下`, F.ices.length >= 3]);
    if (F.unc > 18) al.push(['航', '航向不明', '到<em>导航台</em>用六分仪定位', false]);
    else if (Math.abs(F.est) > 12) al.push(['航', '偏离航线', '回<em>驾驶座</em>修正航向', false]);
    if (F.fuelM < 22 && F.fuelR > 0.5) al.push(['油', '主油箱见底', '到<em>手摇泵</em>从备用油箱输油', F.fuelM < 8]);
    if (F.fuelM <= 0 && F.fuelR <= 0.5) al.push(['油', '燃油耗尽', '只能滑翔了……', true]);
    if (F.sinkWarn && F.phase === 'fly') al.push(['降', '持续下降', F.lowPower ? '动力不足 · 先修<em>引擎</em>或除<em>冰</em>' : '回<em>驾驶座</em>按 ↑ 拉起', !!F.sinkCrit]);
    if (F.alt < 420 && F.phase === 'fly') al.push(['高', '高度过低！', '回<em>驾驶座</em>拉起', true]);
    $('altDial').classList.toggle('sink', F.sinkWarn && F.phase === 'fly');
    const sig = JSON.stringify(al);
    if (sig !== alertSig) { alertSig = sig; $('alerts').innerHTML = al.map(a => `<div class="alert ${a[3] ? 'crit' : ''}"><div class="ic">${a[0]}</div><div><b>${a[1]}</b><small>${a[2]}</small></div></div>`).join(''); }
    st.danger = U.damp(st.danger, (F.alt < 420 && F.phase === 'fly') || F.hull < 25 ? 1 : 0, 6, 0.12);
    st.frost = U.damp(st.frost, Math.min(1, ice / 3.2), 2, 0.12);
    // 里程提示
    for (const [th, key, txt] of [[0.2, 'm1', '夜幕降临，海面只剩月光'], [0.385, 'm2', `前方雷暴区 —— 在雨云中飞得高于 ${FREEZE} 米会结冰`], [0.7, 'm3', '风暴被甩在身后'], [0.83, 'm4', '东方既白'], [0.94, 'm5', '爱尔兰海岸在望！']])
      if (p > th && F.lastP <= th && !F.flags[key]) { F.flags[key] = 1; toast(txt, key === 'm2', 5000); }
    F.lastP = p;
  }
  function ringHTML(it) {
    if (it.kind === 'timing') return `<div class="ring" style="background:conic-gradient(from ${it.arc0.toFixed(0)}deg,#58b368 0 ${it.arcW}deg,#2a3350 0)"><div class="ndl" style="transform:rotate(${needle(it).toFixed(0)}deg)"></div><div class="cnt">${it.hits}/${it.n}</div></div>`;
    if (it.cont) return '';
    return `<div class="ring" style="background:conic-gradient(#f0a030 ${(it.progress * 360).toFixed(0)}deg,#2a3350 0)"><div class="cnt">${Math.round(it.progress * 100)}</div></div>`;
  }
  function labels() {
    Lb.begin();
    if (F && S.screen === 'flight' && (F.phase === 'fly' || F.phase === 'intro')) {
      const targeted = new Set(F.players.map(p => p.target).filter(Boolean));
      for (const it of F.inter) {
        if (!(it.prob || it.ice) || targeted.has(it)) continue;
        const cls = it.ice ? 'ice' : it.prob.crit ? 'crit' : '';
        Lb.put(`<div class="badge ${cls}"><span>${it.ice ? '冰' : it.prob.badge}</span></div>`, it.x, groundY(it.zone, it.x, it.z, 1) + it.h + 0.15, it.z);
      }
      F.fires.forEach((f, i) => { if (i === 0 || f.hp > 0.6) Lb.put('<div class="badge crit"><span>火</span></div>', f.x, 1.35, f.z); });
      for (const p of F.players) {
        const g = glyphOf(p.i), mine = !S.net || p.i === me(), it = p.target, tag = S.mode === 2 ? `<span class="ptag" style="background:${PCOL[p.i]}">P${p.i + 1}</span> ` : '';
        if (mine && it && !p.seated && !p.climb) {
          const ok = canUse(p, it), act = it.kind === 'hold' ? '按住 ' + g.act : it.kind === 'mash' ? '连按 ' + g.act : it.kind === 'timing' ? '指针进绿区时按 ' + g.act : g.act;
          const html = (ok && (it.kind !== 'press' && it.kind !== 'seat') ? ringHTML(it) : '') + `<div class="prompt ${ok ? '' : 'no'}">${tag}${ok ? act + ' ' + it.label : it.label + ' · 需要<em>' + ITEM_NAME[it.need] + '</em>'}</div>`;
          Lb.put(html, it.x, groundY(it.zone, it.x, it.z, p.y) + it.h + 0.2, it.z);
        } else if (mine && !p.seated && !p.climb) {
          const ni = !p.item && nearestItem(p);
          if (ni) Lb.put(`<div class="prompt">${tag}${g.act} 拿起${ITEM_NAME[ni.type]}</div>`, ni.mesh.position.x, ni.mesh.position.y + 0.55, ni.mesh.position.z);
          else if (S.mode === 2) Lb.put(tag, p.x, p.y + 1.35, p.z);
        } else if (S.mode === 2) Lb.put(tag, p.x, p.y + 1.35, p.z);
      }
    }
    Lb.end();
  }

  /* ------------------------------- 飞机表现 ------------------------------- */
  function visual(dt) {
    const inFlight = S.screen === 'flight' || S.screen === 'result';
    const t = st.time;
    if (inFlight && F) {
      st.surfaceY = -(def.gearH + Math.max(0, F.alt) * GFX.K_ALT);
      if (!def.seaplane) st.seaDrop = U.damp(st.seaDrop, land ? 3.2 : 0.3, 0.4, dt);
      I.root.rotation.set(F.roll, 0, F.pitch);
      I.root.position.y = F.phase === 'dead' ? -Math.min(F.deadT, 3) * (F.cause === 'sea' ? 0.9 : 0) : Math.sin(t * 1.3) * 0.05 * (F.alt > 5 ? 1 : 0);
      if (land) { land.position.set(F.landX - (st.scroll - F.landS0), st.surfaceY, def.seaplane ? -270 : 0); if (land.position.x < -1700 && S.net !== 'guest') { GFX.scene.remove(land); land = null; } }
      P.setCut(F.cutY < 8.5 ? Object.assign({}, I.cut, { y: F.cutY }) : null);
    } else {
      st.surfaceY = -1750 * GFX.K_ALT;
      I.root.rotation.set(Math.sin(t * 0.5) * 0.06 - 0.04, 0, Math.sin(t * 0.37) * 0.03 + 0.02);
      I.root.position.y = Math.sin(t * 0.8) * 0.15;
    }
    // 驾驶员与驾驶盘联动
    const demoOn = !(inFlight && F); let steer = 0, pull = 0;
    I.demo.g.visible = demoOn;
    if (demoOn) { steer = Math.sin(t * 0.5) * 0.55; pull = Math.sin(t * 0.37) * 0.3; P.animCrew(I.demo, { pose: 'sit', moving: 0, steer, pull }, dt); }
    else { const sp = F.players.find(p => p.seated); if (sp && sp.inp && (F.phase === 'fly' || F.phase === 'intro')) { steer = sp.inp.mx || 0; pull = -(sp.inp.my || 0); } }
    I.yoke.rotation.x = U.damp(I.yoke.rotation.x, steer * 0.7, 9, dt); I.yoke.position.x = U.damp(I.yoke.position.x, 0.3 - pull * 0.04, 9, dt);
    // 螺旋桨与引擎特效
    I.spinners.forEach(s => {
      let target = 40;
      if (inFlight && F) {
        const e = F.eng[s.idx];
        target = F.phase === 'intro' ? 14 + 26 * F.thr : F.fuelM <= 0 ? 2 : e.state === 'ok' ? (F.phase === 'dead' ? 4 : F.phase === 'outro' ? 8 + 30 * F.power : 40) : e.state === 'rough' ? 15 + Math.sin(t * 9) * 6 : 2.5;
      }
      s.w = U.damp(s.w, target, 2.5, dt); s.spin.rotation.x += s.w * dt * s.dir;
      s.disc.material.opacity = U.clamp((s.w - 14) / 18, 0, 1) * 0.5; s.disc.visible = s.w > 14;
      s.blades.forEach(b => { b.visible = s.w < 30; });
    });
    if (inFlight && F && F.phase !== 'intro') {
      let rough = 0;
      F.eng.forEach((e, k) => {
        const pos = I.engines[k].pos;
        if (e.state === 'rough') { rough = 1; if (Math.random() < dt * 9) fx.emit('trail', pos.x - 0.4, pos.y, pos.z, 1); if (Math.random() < dt * 1.2) Sfx.play.sputter(); }
        else if (e.state === 'fail') { rough = 0.6; if (Math.random() < dt * 34) fx.emit('flame', pos.x - 0.2, pos.y + 0.1, pos.z, 1); if (Math.random() < dt * 22) fx.emit('trail', pos.x - 0.8, pos.y + 0.2, pos.z, 1); }
      });
      Sfx.S.rough = rough;
      if (F.leak && Math.random() < dt * 30) fx.emit('fuel', I.st.tank.x + U.rand(-0.2, 0.2), 0.3, I.st.tank.z * 1.15, 1, [0, 1.5, -Math.sign(I.st.tank.z) * 1.5]);
      // 火焰
      let fhp = 0, fxm = 0, fzm = 0;
      for (const f of F.fires) { fhp += f.hp; fxm += f.x * f.hp; fzm += f.z * f.hp; if (Math.random() < dt * 46 * f.hp) fx.emit('fire', f.x + U.rand(-0.22, 0.22) * f.hp, 0.12, f.z + U.rand(-0.22, 0.22) * f.hp, 1); if (Math.random() < dt * 10 * f.hp) fx.emit('smoke', f.x, 0.7, f.z, 1); if (Math.random() < dt * 3) fx.emit('spark', f.x, 0.3, f.z, 2); }
      I.fireLight.intensity = fhp > 0 ? (9 + fhp * 14) * (0.75 + Math.random() * 0.5) : 0;
      if (fhp > 0) I.fireLight.position.set(fxm / fhp, 0.7, fzm / fhp);
      Sfx.S.fire = Math.min(1, fhp); Sfx.S.spray = F.players.some(p => p.spray) ? 1 : 0;
    }
    // 灯光：夜间更亮，断电熄灭
    const night = 1 - U.clamp(GFX.env.keyI * (GFX.env.isSun ? 1 : 0) / 2.5, 0, 1);
    const on = !F || F.elec ? 1 : 0, flick = F && !F.elec ? 0 : 1 + Math.sin(t * 31) * 0.015;
    I.lamps.forEach(l => { l.light.intensity = U.damp(l.light.intensity, on * (9 + 14 * night) * flick, 8, dt); l.mat.color.setRGB(4 * on + 0.05, 2.8 * on + 0.04, 1.4 * on + 0.03); });
    if (I.fuseBulb) { if (on) I.fuseBulb.color.setRGB(0.3, 3, 0.6); else I.fuseBulb.color.setRGB(Math.sin(t * 9) > 0 ? 5 : 0.4, 0.1, 0.05); }
    [I.handLight, I.handLight2].forEach((hl, i) => {
      const pl = F && F.players[i];
      hl.intensity = U.damp(hl.intensity, pl && (!F.elec || pl.zone === 'out' || pl.climb) ? 3 + 7 * night : 0, 5, dt);
      if (pl) hl.position.set(pl.x + 0.25, pl.y + 1.1, pl.z + 0.45);
    });
    I.navLights.forEach((m, i) => { const b = m.userData.base, k = (i === 2 ? (Math.sin(t * 5) > 0.7 ? 1 : 0.1) : 1) * (0.25 + 0.75 * night) * on; m.material.color.setRGB(b[0] * k, b[1] * k, b[2] * k); });
    Sfx.S.power = inFlight && F ? (F.phase === 'intro' ? 0.25 + 0.75 * F.thr : F.power) : 0.6;
    // 逐台发动机的转速与状态，给录音引擎用
    Sfx.S.engs = inFlight && F ? F.eng.map(e => F.fuelM <= 0 ? 0 : F.phase === 'intro' ? 0.25 + 0.75 * F.thr : F.phase === 'dead' ? 0.1 : e.state === 'fail' ? 0 : (e.state === 'rough' ? 0.55 : 1) * (F.phase === 'outro' ? 0.25 + 0.75 * F.power : 1)) : null;
    Sfx.S.engRough = inFlight && F && F.phase !== 'intro' ? F.eng.map(e => e.state === 'rough') : null;
    /* 排气：运转中的发动机从排气口拖出一缕淡蓝的烟，被气流带向后方（地面上没有速度时往上飘）；怠速不稳的那台冒黑烟、偶尔回火。
       夜里看得见管口的火舌，管口本身也烧得发红 */
    if (fx && I.exhausts.length) {
      const air = inFlight && F ? U.clamp(F.phase === 'intro' ? F.thr * 1.2 - 0.2 : st.speed + 0.3, 0, 1) : 1, nOut = I.engines.map(() => 0);
      for (const ex of I.exhausts) nOut[ex.eng]++;
      for (const ex of I.exhausts) {
        const rev = Sfx.S.engs ? Sfx.S.engs[ex.eng] ?? 0 : 0.8, rg = !!(Sfx.S.engRough && Sfx.S.engRough[ex.eng]); if (rev < 0.03) continue;
        const k = 1 / nOut[ex.eng], u = Math.random(), d = ex.dir, q = ex.row ? tmp.lerpVectors(ex.pos, ex.row, u) : ex.pos, w = (0.4 + 0.8 * rev) * (2 - air);            // 出口方向的初速很快就被气流压平
        const v = [d.x * w - (1 + 8 * air), d.y * w + (1 - air) * 0.5, d.z * w];
        if (Math.random() < dt * (rg ? 30 : 56) * k * (0.45 + 0.55 * rev)) fx.emit(rg ? 'exhR' : 'exh', q.x, q.y, q.z, 1, v);
        if (night > 0.3 && Math.random() < dt * 70 * k * night * rev) fx.emit('exhF', q.x, q.y, q.z, 1, [d.x * 2.6 - 2.5 * air, d.y * 2.6, d.z * 2.6]);
        if (rg && Math.random() < dt * 1.6 * k) { fx.emit('exhF', q.x, q.y, q.z, 7, [d.x * 4 - 3 * air, d.y * 4, d.z * 4]); fx.emit('spark', q.x, q.y, q.z, 2, [-4 * air, 0, 0]); }
      }
      I.exhGlow.forEach((m, k) => { const rev = Sfx.S.engs ? Sfx.S.engs[k] ?? 0 : 0.8, g = night * rev * (0.8 + 0.2 * Math.sin(t * 31 + k * 2)); m.color.setRGB(0.012 + 2.2 * g, 0.011 + 0.6 * g, 0.01 + 0.1 * g); });
    }
    Sfx.S.wind = inFlight && F ? 0.25 + 0.5 * st.speed + (F.players.some(p => p.zone === 'out') ? 0.9 : 0) + st.storm * 0.7 : 0.35;
  }

  /* ---------------------------------- 镜头 ---------------------------------- */
  function camera(dt) {
    const cam = GFX.camera, D = def.camDist * Math.max(1, 1.62 / cam.aspect), cx = def.camX;
    let k = 4;
    if (S.screen === 'flight' || S.screen === 'result') {
      let fxm = cx, fzm = 0; if (F.players.length) { fxm = 0; for (const p of F.players) { fxm += p.x; fzm += p.z; } fxm /= F.players.length; fzm /= F.players.length; }
      const Dz = D * 0.9, cy = 0.6 + Dz * 0.415, lx = cx + (fxm - cx) * 0.22;
      camPos.set(lx + 1.3, cy, Dz + fzm * 0.22); camLook.set(lx, cy - Dz * 0.3, fzm * 0.3);
      if (F.phase === 'intro') {
        const u = U.smooth(1.2, 5.0, F.t);
        tmp.set(cx + D * 0.72, -def.gearH + 1.5 + D * 0.04, D * 0.86); camPos.lerpVectors(tmp, camPos, u);
        tmp.set(cx - 0.5, 1.0, 0); camLook.lerpVectors(tmp, camLook, u); k = F.t < 0.3 ? 100 : 3;
      } else if (F.phase === 'outro') {
        const a = 0.75 + F.outT * 0.035; camPos.set(cx + Math.cos(a) * D * 1.15, 1.2 + D * 0.16 - Math.min(F.outT, 10) * 0.06 * D * 0.1, Math.sin(a) * D * 1.15); camLook.set(cx, 0.9, 0); k = F.outT < 0.2 ? 100 : 2.5;
      } else if (F.phase === 'dead') { camPos.y += F.deadT * 1.2; camPos.z += F.deadT * 1.5; }
      cam.fov = 48;
    } else if (S.screen === 'hangar') {          // 机库：自由环绕观赏
      const lk = Input.look();
      if (lk.x || lk.y || lk.zoom) { orb.yaw += lk.x * dt * 2.2; orb.pitch = U.clamp(orb.pitch + lk.y * dt * 1.4, -0.3, 1.25); orb.dist = U.clamp(orb.dist * (1 - lk.zoom * dt * 0.9), 0.55, 1.9); orb.idle = 0; }
      orb.idle += dt; if (!orb.drag && orb.idle > 3.5) orb.yaw += dt * 0.14 * Math.min(1, (orb.idle - 3.5) / 1.5);   // 闲置后缓慢自转
      const R = D * 1.3 * orb.dist, cp = Math.cos(orb.pitch);
      camPos.set(cx + Math.cos(orb.yaw) * cp * R, 1.0 + Math.sin(orb.pitch) * R, Math.sin(orb.yaw) * cp * R); camLook.set(cx, 1.0, 0);
      cam.fov = 40; cam.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.15, 0, innerWidth, innerHeight);
      k = orb.idle < 1 ? 12 : 3;
    } else {
      const a = 0.95 + 0.5 * Math.sin(st.time * 0.13), R = D * 1.22;
      camPos.set(cx + Math.cos(a) * R, 1.6 + D * 0.14 + Math.sin(st.time * 0.21) * D * 0.06, Math.sin(a) * R); camLook.set(cx, 1.0, 0);
      cam.fov = 40; cam.setViewOffset(innerWidth, innerHeight, S.screen === 'hangar' ? -innerWidth * 0.15 : 0, S.screen === 'hangar' ? 0 : innerHeight * 0.12, innerWidth, innerHeight);
      k = 2.5;
    }
    if (dbg.cam) { camPos.set(...dbg.cam.p); camLook.set(...dbg.cam.l); cam.fov = dbg.cam.fov || 40; cam.clearViewOffset(); k = 1e3; }   // 调试：固定机位
    const f = 1 - Math.exp(-k * Math.max(dt, 0.016));
    cam.position.lerp(camPos, f); curLook.lerp(camLook, f);
    cam.lookAt(curLook); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }

  /* ---------------------------------- 菜单 ---------------------------------- */
  function selBtns(ids) { ids.forEach((id, i) => $(id).classList.toggle('sel', i === S.sel)); }
  function pauseToggle(on) { S.pause = on; S.sel = 0; if (S.net === 'host') netSend({ t: 'pz', on }); $('pRestart').style.display = S.net === 'guest' ? 'none' : ''; $('pHangar').textContent = S.net === 'guest' ? '离开联机' : '返回机库'; show('pause', on); selBtns(['pResume', 'pRestart', 'pHangar']); Sfx.play.ui(); }
  function menus(m) {
    if (m.style) setStyle(1 - S.style);
    if (S.busy) return;
    if (S.screen === 'title') { if (m.ok || m.start) { Sfx.init(); Sfx.play.ok(); fade(true); S.busy = true; setTimeout(() => { S.busy = false; toHangar(); }, 450); } }
    else if (S.screen === 'hangar') {
      if (m.l) setAc(S.ac - 1); else if (m.r) setAc(S.ac + 1);
      if (m.tab) setMode(S.lan ? 1 : S.mode === 1 ? 2 : 3);                       // 单人 → 双人 → 局域网联机 → 单人
      else if (S.lan) { if (m.u) $('netHost').click(); else if (m.d) $('netJoin').click(); }
      else if (m.u || m.d) setMode(S.mode === 1 ? 2 : 1);
      if (m.ok) startFlight();
      $('padInfo').textContent = Input.padCount() ? `已连接手柄 × ${Input.padCount()}` : '未检测到手柄（按任意手柄按键以激活）';
    } else if (S.screen === 'flight') {
      if (S.pause) {
        const ids = ['pResume', 'pRestart', 'pHangar'];
        if (m.u) { S.sel = (S.sel + 2) % 3; selBtns(ids); Sfx.play.ui(); } if (m.d) { S.sel = (S.sel + 1) % 3; selBtns(ids); Sfx.play.ui(); }
        if (m.start || m.back) pauseToggle(false); else if (m.ok) $(ids[S.sel]).click();
      } else if (m.start && F && (F.phase === 'fly' || F.phase === 'intro')) pauseToggle(true);
    } else if (S.screen === 'result') {
      const ids = ['rAgain', 'rHangar'];
      if (m.l || m.r) { S.sel = 1 - S.sel; selBtns(ids); Sfx.play.ui(); }
      if (m.ok) $(ids[S.sel]).click();
    }
  }
  function bindUI() {
    $('title').addEventListener('click', () => {
      if (S.screen !== 'title' || S.busy) return;
      if (Input.touch) { try { const r = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (r && r.then) r.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { })).catch(() => { }); } catch (e) { /* 不支持全屏（比如 iPhone）就算了 */ } }
      Sfx.init(); toHangar();
    });
    $('acPrev').onclick = () => setAc(S.ac - 1); $('acNext').onclick = () => setAc(S.ac + 1); $('btnStyle').onclick = () => setStyle(1 - S.style);
    // 机库观赏：拖动旋转、滚轮缩放、双击复位
    const pick = document.querySelector('.pick'), onBtn = e => e.target.closest && e.target.closest('button');
    pick.addEventListener('pointerdown', e => { if (onBtn(e)) return; orb.drag = true; orb.px = e.clientX; orb.py = e.clientY; orb.idle = 0; pick.classList.add('grab'); try { pick.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件没有指针可捕获 */ } });
    pick.addEventListener('pointermove', e => { if (!orb.drag) return; orb.yaw += (e.clientX - orb.px) * 0.006; orb.pitch = U.clamp(orb.pitch + (e.clientY - orb.py) * 0.004, -0.3, 1.25); orb.px = e.clientX; orb.py = e.clientY; orb.idle = 0; });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => pick.addEventListener(ev, () => { orb.drag = false; pick.classList.remove('grab'); }));
    pick.addEventListener('wheel', e => { orb.dist = U.clamp(orb.dist * Math.exp(e.deltaY * 0.0012), 0.55, 1.9); orb.idle = 0; e.preventDefault(); }, { passive: false });
    pick.addEventListener('dblclick', e => { if (!onBtn(e)) { Object.assign(orb, ORB0); orb.idle = 0; } });
    document.querySelectorAll('.mode').forEach(b => { b.onclick = () => setMode(+b.dataset.mode); });
    $('btnStart').onclick = startFlight;
    const leave = () => { if (S.net === 'guest') { netClose(); Net.msg = '已离开联机'; } fade(true); setTimeout(toHangar, 450); };          // 队友点「返回机库」= 离开联机；机长点则带着队友一起回机库
    $('pResume').onclick = () => pauseToggle(false); $('pRestart').onclick = () => { show('pause', false); startFlight(); }; $('pHangar').onclick = leave;
    $('rAgain').onclick = startFlight; $('rHangar').onclick = leave;
    $('tPause').onclick = () => { if (S.screen === 'flight' && F && (F.phase === 'fly' || F.phase === 'intro') && !S.pause) pauseToggle(true); };
    $('netHost').onclick = () => { Sfx.init(); Sfx.play.ui(); if (S.net === 'host') { netClose(); Net.msg = ''; netUI(); } else netOpen('host'); };
    $('netJoin').onclick = () => { Sfx.init(); Sfx.play.ui(); if (S.net === 'guest') { netClose(); Net.msg = ''; netUI(); } else netOpen('guest'); };
    document.querySelectorAll('button').forEach(b => b.addEventListener('keydown', e => e.preventDefault()));
  }

  /* --------------------------------- 主循环 --------------------------------- */
  function tick(now) {
    requestAnimationFrame(tick);
    if (last) GFX.adapt(now - last);                      // 帧率跟不上就自动降渲染分辨率
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    frame(dt, true);
  }
  function frame(dt, draw) {
    Input.update();
    menus(Input.menu());
    const paused = S.pause && S.screen === 'flight' && S.net !== 'guest';          // 队友打开菜单不会让时间停下
    if (paused) dt = 0;
    if (F && S.screen === 'flight' && S.net === 'guest') guestTick(dt);
    else if (F && S.screen === 'flight' && !paused) {
      Net.sim = S.net === 'host';                 // 从这里到 hud 之前是"模拟"：其间的提示、音效、粒子都会转发给队友
      F.t += dt;
      for (const p of F.players) updPlayer(p, dt);
      if (F.phase === 'intro') updIntro(dt);
      else if (F.phase === 'fly') { weather(); director(dt); SCN.director(F.dist / TOTAL); updFlight(dt); }
      else if (F.phase === 'outro') updOutro(dt);
      else if (F.phase === 'dead') updDead(dt);
      Net.sim = false;
      if (F.phase === 'fly' || F.phase === 'intro') hud(dt);
      if (S.net === 'host') netBroadcast(dt);
    } else if (F && S.screen === 'result') { st.speed = U.damp(st.speed, 0, 2, dt); for (const p of F.players) P.animCrew(p.c, { pose: p.seated ? 'sit' : 'idle', moving: 0 }, dt); }
    { const k = 1 - Math.exp(-9 * Math.max(dt, 0.016)); st.ink += ((S.style ? 1 : 0) - st.ink) * k; st.ao += ((S.style ? 0 : 1) - st.ao) * k; st.sat += ((S.style ? 1.16 : 1.03) - st.sat) * k; }
    visual(dt); camera(dt);
    if (F && F.scnDbg && F.phase === 'fly' && st.surfaceY < -8) { F.scnDbg.forEach(k => SCN.spawn(k)); F.scnDbg = null; }
    if (S.screen === 'title' || S.screen === 'hangar') SCN.ambient(dt);             // 开场页面：随机出景物
    SCN.update(dt); if (land) SCN.glow(land);
    I.root.updateMatrixWorld(true); P.updateCut(I.root.matrixWorld);
    if (draw) labels();
    Sfx.update(dt || 0.016);
    GFX.frame(dt, !draw);
    Input.endFrame();
  }
  /* 调试：手动推进 n 帧（面板隐藏、rAF 被限速时用） */
  function step(n = 60, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt, i === n - 1); }
  /* 途中景物的事件：邮轮鸣笛等 */
  SCN.onEvent = ev => { if (ev === 'horn') { Sfx.play.horn(); if (F && F.phase === 'fly') toast('一艘四烟囱邮轮拉响汽笛，向你致意', false, 6000); } };
  function boot() {
    if (!window.THREE) { $('err').textContent = '无法加载 three.js（需要联网访问 CDN）。'; fade(false); return; }
    GFX.init($('c')); bindUI();
    // 联机：模拟过程中触发的音效、闪电、震动，顺手记成事件转发给队友
    for (const k of Object.keys(Sfx.play)) { const f0 = Sfx.play[k]; Sfx.play[k] = (...a) => { f0.apply(Sfx.play, a); if (Net.sim) netEv(['s', k, ...a]); }; }
    { const l0 = GFX.lightning; GFX.lightning = pw => { l0(pw); if (Net.sim) netEv(['lt', pw]); }; }
    { const r0 = Input.rumble; Input.rumble = (gp, a, b, ms) => { if (gp === RGP) { netEv(['r', a, b, ms]); return; } r0(gp, a, b, ms); if (Net.sim && !gp) netEv(['r', a, b, ms]); }; }
    let sv = 0; try { sv = +localStorage.getItem('ta_style') === 1 ? 1 : 0; } catch (e) { /* 读不到就用默认 */ }
    if (Q.get('style')) sv = Q.get('style') === '1' ? 1 : 0;
    setStyle(sv, true); st.ink = sv; st.ao = 1 - sv;
    if (Q.get('shot')) { document.body.style.transform = `scale(${+Q.get('shot') || 0.78125})`; document.body.style.transformOrigin = '0 0'; }   // 调试：缩放整页以便截图
    S.ac = U.clamp(+(Q.get('ac') || 0), 0, AIRCRAFT.length - 1); S.mode = Q.get('mode') === '2' ? 2 : 1;
    loadAircraft(S.ac);
    Object.assign(st, { tod: 0.06, wisps: 0.15, deck: 0.9, tilt: 0.55 });
    GFX.camera.position.set(8, 5, 16);
    S.screen = 'title'; show('title'); refreshCard();
    if (Input.touch) document.querySelector('#title .press').textContent = '点击屏幕进入机库';
    setTimeout(() => fade(false), 250);
    if (Q.get('auto')) setTimeout(() => { S.busy = false; startFlight(); }, 400);
    else if (Q.get('hangar')) setTimeout(toHangar, 300);
    requestAnimationFrame(tick);
  }
  boot();
  return { S, get F() { return F; }, get I() { return I; }, EV, st, spawnIce, toHangar, startFlight, step, dbg, orb, Net };
})();
