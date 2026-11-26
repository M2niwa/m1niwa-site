'use strict';
/* =========================================================================
   aircraft.js — 五款机型：外形建模、涂装、剖视舱室与岗位布局
   每个 build() 返回实例 I：root、引擎、可行走区域、岗位坐标、剖视参数等
   舱内构件一律按机身剖面求位置（贴壁/内缩），不会穿出蒙皮
   ========================================================================= */
const AIRCRAFT = (() => {
  const T = THREE, V3 = T.Vector3, M = P.M, v3 = (x, y, z) => new V3(x, y, z);
  const ds = m => { const c = m.clone(); c.side = T.DoubleSide; return c; };

  function inst() {
    return { root: new T.Group(), spinners: [], engines: [], zones: { in: [], out: [] }, st: {}, homes: {}, icePts: [], firePts: [], lamps: [], navLights: [], exhausts: [], exhGlow: [], spawn: [], keys: null, cut: null, tail: null };
  }
  function finish(I) {
    I.root.traverse(m => { if (m.isMesh && !m.userData.noShadow) { m.castShadow = !m.userData.noCast; m.receiveShadow = true; } });
    I.meshes0 = 0; I.root.traverse(m => { if (m.isMesh) I.meshes0++; });
    P.bakeStatic(I.root, [...I.spinners.flatMap(s => [s.spin, s.disc]), I.yoke, I.pumpLever]);          // 会动的：螺旋桨、驾驶盘、油泵手柄；其余全部合并
    I.outY = (x, z) => {
      let y = P.topY(I.keys, x, z);
      for (const r of I.zones.out) if (r.y !== undefined && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) y = Math.max(y, typeof r.y === 'function' ? r.y(x, z) : r.y);
      return y;
    };
    return I;
  }

  /* ------------------------------ 开窗定义 ------------------------------ */
  /* 两侧舷窗：以高度换算放样参数 v，窗洞随机身曲面走 */
  const sideW = (K, xs, y, w, h, round) => xs.flatMap(x => [1, -1].map(s => {
    const a = P.vOf(K, x, y - h / 2, s), b = P.vOf(K, x, y + h / 2, s);
    return { x0: x - w / 2, x1: x + w / 2, v0: Math.min(a, b), v1: Math.max(a, b), round, pt: round && ((t, r) => [x + Math.cos(t) * w / 2 * r, P.vOf(K, x, y + Math.sin(t) * h / 2 * r, s)]) };
  }));
  /* 机背开口（敞开式座舱），hz 为开口半宽 */
  const topW = (K, x0, x1, hz) => {
    const xm = (x0 + x1) / 2, vT = (x, z) => { const s = P.secAt(K, x); return 0.5 - Math.sign(z) * Math.asin(Math.pow(Math.min(0.985, Math.abs(z) / s.w), s.nt / 2)) / (2 * Math.PI); };
    return { x0, x1, v0: vT(xm, hz), v1: vT(xm, -hz), round: true, open: true, pt: (t, r) => { const x = xm + Math.cos(t) * (x1 - x0) / 2 * r; return [x, vT(x, Math.sin(t) * hz * r)]; } };
  };
  /* 座舱风挡：左、顶、右三块 */
  const canopy = (x0, x1) => [{ x0, x1, v0: 0.305, v1: 0.42 }, { x0, x1, v0: 0.445, v1: 0.555 }, { x0, x1, v0: 0.58, v1: 0.695 }];
  const winPath = (c, q, xa, xb, W, H) => {
    const X = (q.x0 - xa) / (xb - xa) * W, X1 = (q.x1 - xa) / (xb - xa) * W, Y = (1 - q.v1) * H, Y1 = (1 - q.v0) * H;
    c.beginPath();
    if (q.pt) { for (let i = 0; i <= 40; i++) { const p = q.pt(i / 40 * 6.28318, 1), px = (p[0] - xa) / (xb - xa) * W, py = (1 - p[1]) * H; if (i) c.lineTo(px, py); else c.moveTo(px, py); } c.closePath(); }
    else if (q.round) c.ellipse((X + X1) / 2, (Y + Y1) / 2, (X1 - X) / 2, (Y1 - Y) / 2, 0, 0, 7);
    else if (c.roundRect) c.roundRect(X, Y, X1 - X, Y1 - Y, 7); else c.rect(X, Y, X1 - X, Y1 - Y);
  };

  /* ------------------------------ 贴图 ------------------------------ */
  function weather(c, W, H, o = {}) {
    const a = o.amt ?? 1, rg = (x, y, r, col, al) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${col},${al})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r); };
    for (let i = 0; i < 70; i++) rg(U.rand(W), U.rand(H), U.rand(60, 230), Math.random() < 0.55 ? '0,0,0' : '255,244,224', 0.075 * a);
    for (let i = 0; i < 280 * a; i++) {                       // 污痕：机身上顺重力往下淌，机翼上顺气流往后拉
      const x = U.rand(W), y = U.rand(H), l = U.rand(24, 150), sg = y > H / 2 ? 1 : -1, g = c.createLinearGradient(0, y, 0, y + l * sg);
      g.addColorStop(0, `rgba(12,9,6,${U.rand(0.05, 0.13) * a})`); g.addColorStop(1, 'rgba(12,9,6,0)'); c.fillStyle = g; c.fillRect(x, Math.min(y, y + l * sg), U.rand(1.5, 6), l);
    }
    if (o.wing) for (let i = 0; i < 520 * a; i++) { c.fillStyle = `rgba(232,222,204,${U.rand(0.15, 0.45)})`; c.fillRect(U.rand(W), H / 2 + U.rand(-16, 16) * Math.random(), U.rand(1, 5), U.rand(1, 3)); }   // 前缘掉漆
    else {
      for (const [y0, y1] of [[H, H * 0.9], [0, H * 0.1]]) { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, `rgba(14,10,8,${0.34 * a})`); g.addColorStop(1, 'rgba(14,10,8,0)'); c.fillStyle = g; c.fillRect(0, Math.min(y0, y1), W, H * 0.1); }   // 机腹积垢
      for (let i = 0; i < 260 * a; i++) { c.fillStyle = `rgba(232,222,204,${U.rand(0.12, 0.4)})`; c.fillRect(W * (1 - Math.random() * Math.random() * 0.25), U.rand(H), U.rand(1, 5), U.rand(1, 3)); }   // 机头掉漆
    }
    for (const [u, v, len, wd] of (o.soot || [])) for (const yy of [(1 - v) * H, v * H]) {                     // 排气熏痕
      c.save(); c.translate(u * W, yy); c.scale(len * W / 100, wd / 100);
      const g = c.createRadialGradient(0, 0, 0, -30, 0, 100); g.addColorStop(0, 'rgba(10,8,7,.62)'); g.addColorStop(1, 'rgba(10,8,7,0)'); c.fillStyle = g; c.fillRect(-130, -100, 160, 200); c.restore();
    }
  }
  function fuseTex(base, len, circ, draw, w) {
    const k = len / (2 * circ);
    return P.tex(2048, 1024, (c, W, H) => {
      c.fillStyle = base; c.fillRect(0, 0, W, H);
      draw(c, W, H, {
        stripe(v, th, col) { c.fillStyle = col; c.fillRect(0, (1 - v) * H - th / 2, W, th); c.fillRect(0, v * H - th / 2, W, th); },
        below(v, col) { c.fillStyle = col; c.fillRect(0, (1 - v) * H, W, v * H); c.fillRect(0, 0, W, v * H); },
        band(u0, u1, col) { c.fillStyle = col; c.fillRect(u0 * W, 0, (u1 - u0) * W, H); },
        text(str, u, v, size, col, font) {
          c.fillStyle = col; c.font = `${font || '900'} ${size}px "Arial Black", Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.save(); c.translate(u * W, (1 - v) * H); c.scale(1, k); c.fillText(str, 0, 0); c.restore();
          c.save(); c.translate(u * W, v * H); c.rotate(Math.PI); c.scale(1, k); c.fillText(str, 0, 0); c.restore();
        },
        panel(u, v, w, h, col) { c.fillStyle = col; for (const yy of [(1 - v) * H, v * H]) { c.beginPath(); if (c.roundRect) c.roundRect(u * W - w / 2, yy - h / 2, w, h, 12); else c.rect(u * W - w / 2, yy - h / 2, w, h); c.fill(); } },
        rivets(step, col) { c.fillStyle = col; for (let x = step / 2; x < W; x += step) { c.fillRect(x, 0, 2, H); for (let y = 6; y < H; y += 14) c.fillRect(x + 6, y, 3, 3); } for (let y = 40; y < H; y += 128) c.fillRect(0, y, W, 2); },
        seams(us, col) { c.fillStyle = col || 'rgba(0,0,0,.22)'; for (const u of us) c.fillRect(u * W, 0, 3, H); },
        door(u0, u1, v0, v1, col) {           // 舱门缝与把手（两侧各画一扇）
          c.strokeStyle = col || 'rgba(0,0,0,.5)'; c.lineWidth = 4;
          for (const [a, b] of [[1 - v1, 1 - v0], [v0, v1]]) { c.beginPath(); if (c.roundRect) c.roundRect(u0 * W, a * H, (u1 - u0) * W, (b - a) * H, 14); else c.rect(u0 * W, a * H, (u1 - u0) * W, (b - a) * H); c.stroke(); }
          c.fillStyle = '#c9a14e'; c.fillRect(u1 * W - 26, (1 - (v0 + v1) / 2) * H - 4, 18, 8); c.fillRect(u1 * W - 26, (v0 + v1) / 2 * H - 4, 18, 8);
        },
      });
      weather(c, W, H, { soot: w && w.soot });
      if (w) for (const q of w.wins) {      // 窗洞四周的压条/座舱围框底色
        winPath(c, q, w.xa, w.xb, W, H); c.strokeStyle = q.open ? '#2e1c12' : (w.frame || 'rgba(0,0,0,.5)'); c.lineWidth = q.open ? 26 : 13; c.stroke();
      }
    });
  }
  /* 蒙皮开孔用的透明度贴图：白=蒙皮，黑=窗洞 */
  function holeTex(wins, xa, xb) {
    const t = P.tex(2048, 1024, (c, W, H) => { c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.fillStyle = '#000'; for (const q of wins) { winPath(c, q, xa, xb, W, H); c.fill(); } });
    t.colorSpace = T.NoColorSpace; return t;
  }
  function wingTex(base, o = {}) {
    return P.tex(1024, 512, (c, W, H) => {
      c.fillStyle = base; c.fillRect(0, 0, W, H);
      if (o.grain) for (let i = 0; i < 500; i++) { c.fillStyle = `rgba(${U.pick(['70,40,10', '255,220,150'])},${U.rand(0.03, 0.09)})`; c.fillRect(U.rand(W), U.rand(H), U.rand(60, 260), U.rand(1, 3)); }
      const n = o.ribs ?? 30;
      for (let i = 0; i < n; i++) { const x = (i + 0.5) / n * W; c.fillStyle = 'rgba(0,0,0,.13)'; c.fillRect(x, 0, 2, H); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(x + 3, 0, 7, H); }
      if (o.rivets) { c.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 20; y < H; y += 60) c.fillRect(0, y, W, 2); }
      c.fillStyle = 'rgba(0,0,0,.4)';
      [[0.04, 0.34], [0.66, 0.96]].forEach(([a, b]) => { c.fillRect(a * W, H * 0.91, (b - a) * W, 2); c.fillRect(a * W, H * 0.91, 2, H * 0.09); c.fillRect(b * W, H * 0.91, 2, H * 0.09); });
      if (o.caps) {                           // 加油口盖与翼根防滑走道
        for (const u of [0.4, 0.6]) { c.fillStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.ellipse(u * W, H * 0.66, 7, 9, 0, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(u * W, H * 0.66, 4, 5, 0, 0, 7); c.fill(); }
        c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(W * 0.452, H * 0.58, W * 0.012, H * 0.32); c.fillRect(W * 0.536, H * 0.58, W * 0.012, H * 0.32);
      }
      if (o.text) {
        c.fillStyle = o.color; c.font = `900 ${o.size || 120}px "Arial Black", Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(o.text, W * (o.u ?? 0.78), H * 0.74); if (o.both) c.fillText(o.both === true ? o.text : o.both, W * (1 - (o.u ?? 0.78)), H * 0.74);
      }
      if (o.draw) o.draw(c, W, H);
      weather(c, W, H, { wing: true });
    });
  }
  /* 斑马纹：沿画布竖向延伸的波浪黑条，粗细起伏、偶尔相连；上下左右都能无缝平铺 */
  const ZW = '#efe8d8', ZK = '#17140f';
  function zebra(c, W, H, n, wob = 1) {
    c.fillStyle = ZK; const step = W / n, seg = 56, TAU = 6.28318;
    for (let i = -1; i <= n; i++) {
      const j = (i + n) % n, p1 = j * 2.399, p2 = j * 4.127 + 1, wk = 0.8 + 0.5 * (Math.sin(j * 12.9898) * 0.5 + 0.5), x0 = (i + 0.5) * step;
      const cx = t => x0 + step * wob * (0.15 * Math.sin(t * TAU * 2 + p1) + 0.08 * Math.sin(t * TAU * 5 + p2));
      const hw = t => step * 0.25 * wk * (0.8 + 0.3 * Math.sin(t * TAU * 3 + p1 * 2));
      c.beginPath();
      for (let k = 0; k <= seg; k++) { const t = k / seg; c.lineTo(cx(t) - hw(t), t * H); }
      for (let k = seg; k >= 0; k--) { const t = k / seg; c.lineTo(cx(t) + hw(t), t * H); }
      c.closePath(); c.fill();
    }
  }
  const _zt = {};
  /* 小部件用的斑马纹材质：rx/ry 为平铺次数，rot 为真时条纹转 90° */
  function zebraMat(rx, ry, rot, wob = 1) {
    const base = _zt[wob] || (_zt[wob] = P.tex(512, 512, (c, W, H) => { c.fillStyle = ZW; c.fillRect(0, 0, W, H); zebra(c, W, H, 8, wob); }, [1, 1]));
    const t = base.clone(); t.repeat.set(rx, ry); t.center.set(0.5, 0.5); t.rotation = rot ? Math.PI / 2 : 0; t.needsUpdate = true;
    return P.std(0xffffff, 0.55, 0, { map: t, side: T.DoubleSide });
  }
  let _floor = null;
  const floorMat = () => _floor || (_floor = P.photo(P.detail(P.std(0xffffff, 0.8, 0, {
    map: P.tex(512, 256, (c, W, H) => {
      for (let i = 0; i < 8; i++) { c.fillStyle = `hsl(${28 + U.rand(-4, 4)},${38 + U.rand(-6, 6)}%,${30 + U.rand(-5, 5)}%)`; c.fillRect(0, i * H / 8, W, H / 8); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, i * H / 8, W, 2); }
      for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(20,10,0,${U.rand(0.03, 0.1)})`; c.fillRect(U.rand(W), U.rand(H), U.rand(20, 120), 1); }
      c.fillStyle = 'rgba(0,0,0,.5)'; for (let i = 0; i < 8; i++) for (let x = 40; x < W; x += 128) c.fillRect(x + (i % 2) * 64, i * H / 8 + 12, 3, 3);
    }, [1, 1]),
  }), 'planks', 1, 1, 1), 'floor', 0.5, 1.5, { s: 1.6 }));         // 写实画风：真实的旧木地板（一张贴图 8 条木板，长宽 2:1）
  /* 舱壁内饰贴图：层板 / 蒙布+钢管桁架 / 铆接铝板 */
  const _wall = {};
  function wallTex(kind, color, rx, ry = 6, ph) {
    const key = kind + color + (ph ? 'P' : '');
    const base = _wall[key] || (_wall[key] = P.tex(512, 512, (c, W, H) => {
      c.fillStyle = '#' + new T.Color(color).getHexString(); c.fillRect(0, 0, W, H);
      if (ph) {                                  // 写实画风：把照片（木纹 / 布纹的倍率图）乘进底色里，代替下面随手画的杂纹
        const im = ph.c.image, n = kind === 'fabric' ? 3 : 1; c.globalCompositeOperation = 'multiply';
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c.drawImage(im, i * W / n, j * H / n, W / n, H / n);
        c.globalCompositeOperation = 'source-over';
      }
      if (kind === 'metal') {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.fillStyle = `rgba(${U.pick(['255,255,255', '0,0,0'])},${U.rand(0.02, 0.08)})`; c.fillRect(i * 128, j * 128, 128, 128); }
        c.fillStyle = 'rgba(0,0,0,.3)'; for (let i = 0; i < 4; i++) { c.fillRect(i * 128, 0, 2, H); c.fillRect(0, i * 128, W, 2); }
        c.fillStyle = 'rgba(255,255,255,.32)'; for (let i = 0; i < 4; i++) for (let q = 8; q < 512; q += 16) { c.fillRect(i * 128 + 6, q, 2, 2); c.fillRect(q, i * 128 + 6, 2, 2); }
      } else if (kind === 'fabric') {
        for (let i = 0; i < (ph ? 0 : 2600); i++) { c.fillStyle = `rgba(${U.pick(['255,250,235', '60,50,30'])},${U.rand(0.03, 0.08)})`; c.fillRect(U.rand(W), U.rand(H), U.rand(2, 10), 1); }
        c.strokeStyle = 'rgba(64,68,76,.8)'; c.lineWidth = 8; c.lineCap = 'round'; c.beginPath();       // 焊接钢管桁架
        for (const y of [6, 262]) { c.moveTo(0, y); c.lineTo(W, y); }
        c.moveTo(0, 6); c.lineTo(256, 262); c.lineTo(512, 6); c.moveTo(256, 6); c.lineTo(256, 262); c.moveTo(4, 6); c.lineTo(4, 262); c.stroke();
        c.strokeStyle = 'rgba(40,30,20,.35)'; c.lineWidth = 2; c.setLineDash([3, 5]); c.beginPath(); c.moveTo(0, 390); c.lineTo(W, 390); c.stroke();
      } else {
        for (let i = 0; i < (ph ? 0 : 900); i++) { c.fillStyle = `rgba(${U.pick(['255,225,170', '50,25,5'])},${U.rand(0.03, 0.1)})`; c.fillRect(U.rand(W), U.rand(H), U.rand(30, 170), 1 + U.rand(2)); }
        c.fillStyle = 'rgba(0,0,0,.32)'; c.fillRect(0, 0, 3, H); c.fillRect(256, 0, 3, H); c.fillRect(0, 0, W, 3); c.fillRect(0, 256, W, 2);
        c.fillStyle = 'rgba(255,220,160,.35)'; for (let y = 12; y < H; y += 24) { c.fillRect(8, y, 3, 3); c.fillRect(264, y, 3, 3); }
      }
    }, [1, 1]));
    const t = base.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return t;
  }

  /* 写实画风下的舱壁：层板、蒙布把真实照片的纹理叠进原来的贴图（板缝、钉子、钢管桁架照旧画在上面，法线也用原来的）；
     金属舱壁整套换成带铆钉的钢板照片（颜色、法线、粗糙度对得上） */
  function wallPhoto(mat, kind, color, rx, ry, px, py) {
    if (kind === 'metal') return P.photo(mat, 'plates', px, py, { tint: color, s: 1.8 });
    return P.photo(mat, kind === 'fabric' ? 'fabric' : 'wood', rx, ry, { n: false, mk: ph => wallTex(kind, color, rx, ry, ph) });
  }

  /* ------------------------------ 通用部件 ------------------------------ */
  function fuselage(I, K, o) {
    I.keys = K; I.innerColor = o.inner; I.wallKind = o.wall || 'ply';
    const R = I.root, wins = o.wins || [];
    const g = P.loft(K, { x0: o.xa, x1: o.xb, rings: o.rings || 72, seg: 48 });
    const innerM = P.std(0xffffff, 0.9, 0, { side: T.BackSide, map: wallTex(I.wallKind, o.inner, Math.max(2, Math.round((o.xb - o.xa) / 1.3))) });
    const circ = P.arcLen(K, (o.x0 + o.x1) / 2, 0, 1) * 1.05, len = o.xb - o.xa, DK = { ply: ['ply', 1.6, 0.3], fabric: ['cloth', 0.5, 0.8], metal: ['metal', 1.2, 0.85] }, rp = (l, t) => Math.max(1, Math.round(l / t));
    const sk = o.skin || DK[I.wallKind], wk = DK[I.wallKind];
    P.detail(o.paint, sk[0], rp(len, sk[1]), rp(circ, sk[1]), sk[2]); P.detail(innerM, wk[0], rp(len, wk[1]), rp(circ, wk[1]), wk[2] * 0.8);
    wallPhoto(innerM, I.wallKind, o.inner, Math.max(2, Math.round((o.xb - o.xa) / 1.3)), 6, rp(len, 1.7), rp(circ, 1.7));
    if (wins.length) { const am = holeTex(wins, o.xa, o.xb); for (const m of [o.paint, innerM]) { m.alphaMap = am; m.alphaTest = 0.5; } }   // 真实开孔：阳光可以照进舱内
    R.add(new T.Mesh(g, P.clip(o.paint)));
    const inner = new T.Mesh(g, P.clip(innerM)); inner.userData.noCast = true; R.add(inner);
    // 玻璃嵌在窗洞里，窗框内外各凸出一圈；敞开式座舱则是一圈皮革围框
    const glass = [], frames = [], coam = [], fx = 0.035;
    for (const q of wins) {
      const xm = (q.x0 + q.x1) / 2, fv = fx * (q.v1 - q.v0) / Math.max(0.05, P.arcLen(K, xm, q.v0, q.v1));
      if (!q.open) glass.push(P.patch((a, b) => P.surfPt(K, U.lerp(q.x0, q.x1, a), U.lerp(q.v0, q.v1, b), 0), 3, 5));
      if (q.round) (q.open ? coam : frames).push(...P.ringPartsF(K, q.pt, q.open ? 0.92 : 0.9, q.open ? 1.18 : 1.26, q.open ? -0.045 : -0.014, 0.016));
      else {
        const e = 0.15, B = (x0, x1, v0, v1) => frames.push(...P.boxParts(K, x0, x1, v0, v1, -0.013, 0.016, 2, 3));
        B(q.x0 - fx, q.x1 + fx, q.v1 - fv * e, q.v1 + fv); B(q.x0 - fx, q.x1 + fx, q.v0 - fv, q.v0 + fv * e); B(q.x0 - fx, q.x0 + fx * e, q.v0, q.v1); B(q.x1 - fx * e, q.x1 + fx, q.v0, q.v1);
      }
    }
    const add = (parts, mat) => { if (!parts.length) return; const m = new T.Mesh(P.merge(parts), mat); m.userData.noShadow = true; R.add(m); };
    add(glass, M.glass); add(frames, P.clip(ds(o.winFrame || M.frame))); add(coam, P.clip(ds(M.leather)));
    // 隔框、桁条、前后舱壁
    const bm = P.clipHi(P.std(0xffffff, 0.9, 0, { side: T.DoubleSide, map: wallTex(I.wallKind, o.inner, 0.8, 0.8) }));
    wallPhoto(bm, I.wallKind, o.inner, 0.8, 0.8, 1, 1);
    R.add(P.bulkhead(K, o.x0, bm), P.bulkhead(K, o.x1, bm));
    const fm = P.clipHi((o.frame || M.frame).clone());
    (o.formers || []).forEach(x => R.add(P.former(K, x, 0.024, fm)));
    for (const a of [-0.4, 0.1, 0.6, 2.54, 3.04, 3.54]) R.add(P.stringer(K, o.x0, o.x1, a, 0.015, fm));
    // 地板：边缘跟着机身在地板高度处的宽度收放，不再是一块外露的方板
    const fp = [], fuv = [], fi = [], N = 28;
    for (let i = 0; i <= N; i++) {
      const x = U.lerp(o.x0, o.x1, i / N), hw = Math.max(0.05, P.halfW(K, x, 0) - 0.012), u = (x - o.x0) / 1.7;
      fp.push(x, 0, -hw, x, 0, hw); fuv.push(u, 0.5 - hw / 2.6, u, 0.5 + hw / 2.6);
      if (i < N) { const a = i * 2; fi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const fg = new T.BufferGeometry(); fg.setAttribute('position', new T.Float32BufferAttribute(fp, 3)); fg.setAttribute('uv', new T.Float32BufferAttribute(fuv, 2)); fg.setIndex(fi); fg.computeVertexNormals();
    const floor = new T.Mesh(fg, floorMat()); floor.userData.noCast = true; R.add(floor);
  }
  function addWing(I, o, mat, x, y, opt = {}) {
    mat.side = T.DoubleSide; if (opt.det) P.detail(mat, ...opt.det);
    const m = new T.Mesh(P.wing(o), opt.clip === false ? mat : P.clip(mat)); m.position.set(x, y, 0); I.root.add(m);
    if (opt.wire) {
      const w = P.wingWire(o, opt.wire[0], opt.wire[1], opt.wire[2], M.frame); w.position.set(x, y, 0); I.root.add(w);
      const g = new T.Mesh(m.geometry, P.ghost(opt.ghost || 0xffffff, opt.zg ?? 4.5)); g.position.set(x, y, 0); g.userData.noShadow = true; g.renderOrder = 5; I.root.add(g);
    }
    return m;
  }
  /* 排气口：管口套一圈唇边，里面盖一片熏黑的圆片，看上去就是空心的管子；这片圆片夜里随转速烧得发红（每台发动机共用一个材质）。
     reg 为真时登记出口：飞行中从这里冒出淡淡的排气、夜里喷火舌。一排短管只登记一次，row 是这一排的另一头 */
  function exhaust(I, eng, p, d, r, reg = true, row) {
    const dir = v3(...d).normalize(), pos = v3(...p), q = new T.Quaternion().setFromUnitVectors(v3(0, 0, 1), dir);
    const gm = I.exhGlow[eng] || (I.exhGlow[eng] = new T.MeshBasicMaterial({ color: 0x050505 })); gm.userData.dyn = true;
    const hole = P.mesh(new T.CircleGeometry(r * 0.8, 12), gm); hole.position.copy(pos).addScaledVector(dir, 0.004); hole.quaternion.copy(q); hole.userData.noShadow = true;
    const lip = P.mesh(new T.TorusGeometry(r * 0.95, r * 0.2, 5, 14), M.rust); lip.position.copy(pos); lip.quaternion.copy(q);
    I.root.add(hole, lip);
    if (reg) I.exhausts.push({ eng, pos: pos.clone().addScaledVector(dir, 0.04), dir, row: row ? v3(...row).addScaledVector(dir, 0.04) : null });
  }
  function engine(I, x, y, z, o, access) {
    const e = P.radial(o); e.group.position.set(x, y, z); I.root.add(e.group);
    if (!o.pipe) exhaust(I, I.engines.length, [x + e.exh[0], y + e.exh[1], z + e.exh[2]], [-0.98, 0.2, 0], o.r * 0.06);       // 没有另接长排气管的：出口就是集气环的尾管
    I.spinners.push({ spin: e.spin, disc: e.disc, blades: e.blades, idx: I.engines.length, dir: 1 });
    I.engines.push({ pos: v3(x - 0.15, y + o.r * 1.0, z), out: access });
    return e;
  }
  function navLight(I, x, y, z, col) {
    const m = P.mesh(new T.SphereGeometry(0.075, 10, 8), new T.MeshBasicMaterial({ color: new T.Color(...col) }), x, y, z);
    m.userData.noShadow = true; m.userData.base = col; m.material.userData.dyn = true; I.root.add(m); I.navLights.push(m);
  }
  const NAV = { red: [7, 0.35, 0.25], green: [0.25, 6, 1], white: [5, 5, 4.2] };
  function strutSet(I, list, r, mat) { for (const [a, b] of list) I.root.add(P.strut(v3(...a), v3(...b), r, mat || M.steel)); }
  function mirror(list) { return list.concat(list.map(([a, b]) => [[a[0], a[1], -a[2]], [b[0], b[1], -b[2]]])); }
  function gearWheel(I, x, y, z, r) { const w = P.wheel(r); w.position.set(x, y, z); I.root.add(w); return w; }
  /* 外部小件：张线、天线桅杆、空速管、舵面铰链缝 */
  const wires = (I, list, r = 0.009) => strutSet(I, list, r, M.steel);
  function antenna(I, x, h, to) {
    const y = P.topY(I.keys, x, 0), top = [x - 0.1, y + h, 0];
    I.root.add(P.strut(v3(x, y - 0.06, 0), v3(...top), 0.024, M.woodLight, 0.014));
    wires(I, [[top, to], [top, [x + 0.45, P.topY(I.keys, x + 0.45, 0.1) - 0.02, 0.1]]], 0.007);
  }
  function pitot(I, x, y, z) { strutSet(I, [[[x - 0.1, y, z], [x + 0.55, y - 0.02, z]], [[x + 0.3, y - 0.01, z], [x + 0.3, y - 0.12, z]]], 0.013, M.alu); }
  function hingeV(I, x, y0, y1, th, z = 0) { I.root.add(P.mesh(new T.BoxGeometry(0.022, y1 - y0, th), M.black, x, (y0 + y1) / 2, z)); }
  function hingeH(I, x, y, len, th) { I.root.add(P.mesh(new T.BoxGeometry(0.022, th, len), M.black, x, y, 0)); }

  /* ------------------------------ 舱内布置 ------------------------------
     远侧舱壁放仪表/导航/电气/梯子，近侧放工具架、油泵、贴壁油箱。
     所有设备的 z 都由 fit() 按该处机身宽度求出：靠壁面留 3.5cm，不会顶穿蒙皮。 */
  function outfit(I, L) {
    const R = I.root, K = I.keys, wh = L.walk, FAR = -1, NEAR = 1;
    I.walk = wh;
    const hwMin = (x, y0, y1, xl = 0) => { let h = 1e9; for (const xx of [x - xl / 2, x, x + xl / 2]) for (let i = 0; i <= 4; i++) h = Math.min(h, P.halfW(K, xx, U.lerp(y0, y1, i / 4))); return h; };
    const fit = (x, y0, y1, back, side, xl) => side * Math.max(0.05, hwMin(x, y0, y1, xl) - back - 0.035);
    const put = (o, x, y, z, ry) => { o.position.set(x, y, z); if (ry) o.rotation.y = ry; R.add(o); return o; };
    const top = x => { const s = P.secAt(K, x); return s.y + s.ht; };
    // 驾驶席：座椅、驾驶盘、脚蹬、仪表板
    const seat = put(P.St.seat(L.rise || 0), L.helm.x, 0, L.helm.z); I.yoke = seat.userData.yoke; I.sitY = seat.userData.sitY;
    if (L.seat2) put(P.St.seat(L.rise || 0), L.seat2.x, 0, L.seat2.z);
    const py = (L.panelY || 0.76) + (L.rise || 0) * 0.5, pw = Math.min(L.panelW || 1.3, 2 * (hwMin(L.panelX, py - 0.25, py + 0.34) - 0.08));
    put(P.St.panel(pw, 0.5), L.panelX, py, 0, -Math.PI / 2);
    I.st.helm = { x: L.helm.x, z: L.helm.z };
    // 远侧：油门台、导航桌、保险丝盒、舱口梯
    put(P.St.quadrant(), L.eng, 0, fit(L.eng, 0, 0.62, 0.15, FAR, 0.4)); I.st.eng = { x: L.eng, z: -wh + 0.1 };
    put(P.St.navTable(), L.nav, 0, fit(L.nav, 0.2, 0.86, 0.15, FAR, 0.74)); I.st.nav = { x: L.nav, z: -wh + 0.1 };
    const fpn = P.St.fusePanel(); put(fpn.g, L.fuse, 0, fit(L.fuse, 0.5, 1.06, 0.05, FAR, 0.44)); I.fuseBulb = fpn.bulbMat; I.st.fuse = { x: L.fuse, z: -wh + 0.1 };
    const lz = fit(L.ladder, 0, 0.9, 0.03, FAR, 0.36); let lh = 0.9;
    while (lh < 1.7 && P.halfW(K, L.ladder, lh + 0.05) > Math.abs(lz) + 0.05) lh += 0.05;
    put(P.St.ladder(lh), L.ladder, 0, lz);
    I.hatchIn = { x: L.ladder, z: -wh + 0.12 }; I.hatchOut = L.hatchOut;
    // 贴壁油箱：沿舱壁曲面成形（那个年代的远程机都是把油箱塞满机舱），带箍带、油量管、加油口与铜油管
    const tk = L.tank, s = tk.side, tt = tk.t || 0.2, tx0 = tk.x - tk.len / 2, tx1 = tk.x + tk.len / 2, ty0 = 0.06, ty1 = tk.h || 0.8;
    const cm = m => s > 0 ? P.clip(ds(m)) : ds(m);          // 近侧的高设备跟着剖视面一起切开，不挡视线
    R.add(P.wallBox(K, tx0, tx1, ty0, ty1, s, 0.035, 0.035 + tt, cm(M.alu)));
    for (const f of [0.2, 0.8]) { const xs = U.lerp(tx0, tx1, f); R.add(P.wallBox(K, xs - 0.025, xs + 0.025, ty0 - 0.02, ty1 + 0.02, s, 0.028, 0.044 + tt, cm(M.dark))); }
    R.add(P.wallBox(K, tx1 - 0.15, tx1 - 0.11, ty0 + 0.12, ty1 - 0.12, s, 0.03 + tt, 0.046 + tt, cm(P.std(0xffc060, 0.2, 0, { emissive: 0xc07010, emissiveIntensity: 0.9 }))));
    const cp = P.surfPt(K, tk.x, P.vOf(K, tk.x, ty1, s), 0.035 + tt / 2); put(P.mesh(new T.CylinderGeometry(0.05, 0.05, 0.05, 10), cm(M.brass)), cp.x, cp.y + 0.02, cp.z);
    R.add(P.wallPipe(K, tx1 - 0.02, L.panelX - 0.3, 0.12, s, 0.05, 0.016, cm(M.copper)));
    I.st.tank = { x: tk.x, z: s * (wh - 0.1) };
    // 近侧：手摇泵、工具架、备件箱
    const pm = P.St.pump(); put(pm.g, L.pump, 0, fit(L.pump, 0, 0.26, 0.12, NEAR)); I.pumpLever = pm.lever; I.st.pump = { x: L.pump, z: wh - 0.1 };
    for (const [type, x] of Object.entries(L.items)) {
      const z = fit(x, 0, 0.46, 0.14, NEAR, 0.44); put(P.St.shelf(0.44), x, 0, z);
      I.homes[type] = { x, z: wh - 0.08, hx: x, hy: 0.5, hz: z };
    }
    const sz = fit(L.spares, 0, 0.7, 0.14, NEAR, 0.44);
    put(P.St.shelf(0.44), L.spares, 0, sz); put(P.St.crate(0.34), L.spares, 0.44, sz);
    for (let i = 0; i < 3; i++) { const f = P.item('fuse'); f.scale.setScalar(0.8); put(f, L.spares - 0.09 + i * 0.09, 0.71, sz, Math.PI / 2); }
    I.st.spares = { x: L.spares, z: wh - 0.08 };
    // 舱灯与沿壁走线的电缆管
    const ly = x => Math.min(L.lampY || 1.08, top(x) - 0.3);
    for (const x of L.lamps) {
      const y = ly(x), z = fit(x, y - 0.09, y + 0.09, 0.075, FAR), lp = P.St.lamp(); put(lp.g, x, y, z);
      const pl = new T.PointLight(0xffc27e, 0, 10, 1.8); pl.position.set(x, y - 0.05, z + 0.38); R.add(pl);
      I.lamps.push({ light: pl, mat: lp.bulbMat });
    }
    R.add(P.wallPipe(K, L.ladder + 0.25, L.panelX - 0.12, x => ly(x) + 0.12, FAR, 0.03, 0.013, M.black));
    // 其余陈设：[种类, x, 侧, 挂高, 指定 z]
    const EX = {
      radio: [P.St.radio, 0.14, [0.3, 0.86], 0], ring: [P.St.lifeRing, 0.06, 0.23, 1], axe: [P.St.axe, 0.04, 0.26, 1], aid: [P.St.firstAid, 0.045, 0.1, 1], rope: [P.St.rope, 0.06, 0.13, 1],
      coat: [P.St.coat, 0.07, 0.3, 1], clock: [P.St.clock, 0.025, 0.08, 1], raft: [P.St.raft, 0.14, [0, 0.3], 0], sack: [P.St.sack, 0.17, [0, 0.4], 0], oil: [P.St.oilCans, 0.15, [0, 0.26], 0], crate: [() => P.St.crate(0.36), 0.14, [0, 0.27], 0],
    };
    for (const [kind, x, side, y = 0, zAbs] of (L.extras || [])) {
      const [mk, back, hr, wall] = EX[kind], y0 = wall ? y - hr - (kind === 'coat' ? 0.28 : 0) : hr[0], y1 = wall ? y + hr : hr[1];
      put(mk(), x, wall ? y : 0, zAbs ?? fit(x, y0, y1, back, side, 0.3), side > 0 ? Math.PI : 0);
    }
    // 驾驶舱隔框：带门洞的半截舱壁
    if (L.part) {
      const x = L.part, sh = new T.Shape(P.outline(K, x, 48, 0.02).map(p => new T.Vector2(p[0], p[1]))), dw = wh + 0.13, dh = Math.min(1.42, top(x) - 0.22);
      const hole = new T.Path(); hole.moveTo(-dw, 0.0); hole.lineTo(dw, 0.0); hole.lineTo(dw, dh); hole.lineTo(-dw, dh); hole.closePath(); sh.holes.push(hole);
      const pg = new T.ShapeGeometry(sh); pg.rotateY(-Math.PI / 2); pg.translate(x, 0, 0);
      R.add(new T.Mesh(pg, P.clipHi(P.std(0xffffff, 0.9, 0, { side: T.DoubleSide, map: wallTex(I.wallKind, I.innerColor, 0.8, 0.8) }))));
      const trim = P.clipHi(M.woodDark.clone());
      for (const z of [-dw, dw]) R.add(P.mesh(new T.BoxGeometry(0.07, dh, 0.06), trim, x, dh / 2, z));
      R.add(P.mesh(new T.BoxGeometry(0.07, 0.06, dw * 2 + 0.06), trim, x, dh, 0));
    }
    I.firePts = L.fire; I.spawn = L.spawn;
  }

  /* ====================== 1. Lockheed Vega 5B ====================== */
  function vega() {
    const I = inst(), R = I.root, RED = '#b3151d', GOLD = '#e2b84e';
    const K = [{ x: 3.55, y: 0.6, w: 0.78, ht: 0.78 }, { x: 2.6, y: 0.6, w: 0.97, ht: 0.95 }, { x: 1.2, y: 0.6, w: 1.05, ht: 1.0 }, { x: -0.5, y: 0.6, w: 1.03, ht: 0.98 },
      { x: -2.2, y: 0.62, w: 0.86, ht: 0.83, hb: 0.8 }, { x: -3.6, y: 0.68, w: 0.54, ht: 0.56, hb: 0.5 }, { x: -4.8, y: 0.76, w: 0.17, ht: 0.26, hb: 0.2 }, { x: -5.25, y: 0.8, w: 0.03, ht: 0.07, hb: 0.05 }];
    const WN = [...sideW(K, [1.5, 0.7, -0.1, -0.9, -1.7], 0.96, 0.5, 0.32), ...canopy(2.6, 3.14)];
    const ft = fuseTex(RED, 8.8, 6.2, (c, W, H, d) => { d.stripe(0.305, 30, GOLD); d.stripe(0.335, 8, GOLD); d.stripe(0.2, 6, GOLD); d.text('NR7952', 0.34, 0.25, 96, GOLD); d.door(0.452, 0.54, 0.1, 0.4, 'rgba(60,0,0,.6)'); d.seams([0.93, 0.74], 'rgba(60,0,0,.3)'); }, { wins: WN, xa: -5.25, xb: 3.55, frame: '#5e0a0f', soot: [[0.885, 0.07, 0.24, 44]] });
    fuselage(I, K, { xa: -5.25, xb: 3.55, paint: P.lacquer(0xffffff, { map: ft }), inner: 0xa9814f, wall: 'ply', wins: WN, winFrame: M.alu, x0: -2.3, x1: 2.5, formers: [-1.5, -0.7, 0.1, 0.9, 1.7] });
    engine(I, 3.8, 0.6, 0, { r: 0.72, cyl: 9, cowl: 'naca', cowlMat: P.lacquer(RED), propR: 1.45, propMat: M.alu, pipe: true }, { x: 3.3, z: 0 });
    const wo = { span: 13, root: 2.6, tip: 1.5, t: 0.16, cam: 0.03, tipR: 0.14, taperAt: 0.35 };
    addWing(I, wo, P.lacquer(0xffffff, { map: wingTex(RED, { ribs: 0, caps: true, text: 'NR7952', color: GOLD, size: 132, u: 0.77, draw(c, W, H) { c.fillStyle = GOLD; c.fillRect(0, H * 0.535, W, 8); } }) }), 2.3, 1.76, { wire: [-1.15, 6.25, 10], ghost: 0xd8404a, zg: 4.3, det: ['ply', 8, 4, 0.3] });
    strutSet(I, [[[3.3, -0.02, 0.45], [2.55, -0.3, 0.52]]], 0.05, M.rust);          // 排气管（1932 年途中开裂喷火的就是它）
    exhaust(I, 0, [2.55, -0.3, 0.52], [-0.75, -0.28, 0.07], 0.05);
    pitot(I, 2.05, 1.72, -4.5); hingeV(I, -5.0, 0.72, 2.16, 0.085); hingeH(I, -4.76, 0.88, 3.3, 0.085);
    // 起落架与整流罩
    const pantK = [{ x: -0.85, y: 0.02, w: 0.02, ht: 0.04 }, { x: -0.3, y: 0.06, w: 0.2, ht: 0.38, hb: 0.3 }, { x: 0.15, y: 0.1, w: 0.25, ht: 0.46, hb: 0.36 }, { x: 0.52, y: 0.06, w: 0.15, ht: 0.26, hb: 0.22 }, { x: 0.68, y: 0.02, w: 0.02, ht: 0.04 }];
    for (const s of [-1, 1]) {
      gearWheel(I, 2.3, -1.22, s * 1.55, 0.45);
      const pant = new T.Mesh(P.loft(pantK, { rings: 20, seg: 18 }), P.lacquer(RED)); pant.position.set(2.3, -1.22, s * 1.55); R.add(pant);
    }
    strutSet(I, mirror([[[2.65, 0.0, 0.8], [2.35, -1.05, 1.5]], [[1.6, 0.0, 0.8], [2.25, -1.05, 1.5]], [[2.2, -0.36, 0.45], [2.3, -1.12, 1.45]]]), 0.05, P.std(0xb3151d, 0.4));
    strutSet(I, [[[-4.55, 0.55, 0], [-4.95, 0.12, 0]]], 0.035);
    // 尾翼
    const tm = P.lacquer(RED);
    R.add(P.plate([[-3.55, 1.0], [-4.2, 1.85], [-4.75, 2.25], [-5.25, 2.18], [-5.5, 1.6], [-5.4, 0.85], [-5.15, 0.66], [-4.3, 0.82]], 0.07, tm));
    const st = new T.Mesh(P.wing({ span: 4.5, root: 1.45, tip: 0.9, t: 0.075, cam: 0, tipR: 0.3, taperAt: 0.5 }), tm); st.material.side = T.DoubleSide; st.position.set(-3.85, 0.88, 0); R.add(st);
    navLight(I, 1.45, 1.8, -6.45, NAV.red); navLight(I, 1.45, 1.8, 6.45, NAV.green); navLight(I, -5.5, 1.5, 0, NAV.white);
    I.zones.in = [{ x0: -2.05, x1: 2.1, z0: -0.55, z1: 0.55 }];
    I.zones.out = [{ x0: -0.05, x1: 2.1, z0: -6, z1: 6, y: 2.04 }, { x0: -4.7, x1: 0.1, z0: -0.3, z1: 0.3 }, { x0: 2.0, x1: 3.45, z0: -0.3, z1: 0.3 }];
    I.cut = { x0: -2.3, x1: 2.5, z0: -1.2, z1: 30, y: 0.66, s: 0.5 };
    I.tail = { x: -4.5, z: 0 };
    I.icePts = [{ x: 1.85, z: -3.0 }, { x: 1.85, z: 4.5 }, { x: 1.75, z: -5.0 }, { x: 1.8, z: 5.7 }, { x: 3.2, z: 0 }, { x: 0.4, z: 4.9 }];
    outfit(I, { walk: 0.55, helm: { x: 1.6, z: 0 }, panelX: 2.45, panelW: 1.25, eng: 0.8, nav: -0.12, fuse: -0.98, ladder: -1.75, hatchOut: { x: -0.7, z: 0 },
      tank: { x: -1.5, side: 1, len: 0.8, t: 0.18, h: 0.78 }, pump: -0.85, items: { wrench: 0.95, mallet: 0.38, ext: -0.2 }, spares: 1.52, lamps: [0.35, -1.38],
      extras: [['aid', 1.36, -1, 0.92], ['clock', 0.43, -1, 0.74], ['rope', -1.38, -1, 0.6], ['sack', -2.13, 1, 0, 0.1]],
      fire: [{ x: -0.55, z: 0.1 }, { x: 0.55, z: -0.15 }, { x: -1.35, z: -0.1 }, { x: 1.1, z: 0.2 }], spawn: [{ x: 1.6, z: 0 }, { x: -0.3, z: 0.1 }] });
    return finish(I);
  }

  /* ====================== 2. Bréguet 19 TF Super Bidon ====================== */
  function breguet() {
    const I = inst(), R = I.root, RED = '#c0181c';
    const K = [{ x: 5.85, y: 0.62, w: 0.2, ht: 0.2 }, { x: 5.2, y: 0.6, w: 0.6, ht: 0.6, hb: 0.64, n: 2.4 }, { x: 3.6, y: 0.58, w: 0.9, ht: 0.85, hb: 0.9, n: 2.6 }, { x: 1.5, y: 0.58, w: 1.0, ht: 0.95, hb: 0.98, n: 2.8 },
      { x: -1.0, y: 0.6, w: 0.98, ht: 0.92, hb: 0.95, n: 2.8 }, { x: -3.0, y: 0.66, w: 0.76, ht: 0.72, n: 2.5 }, { x: -5.0, y: 0.76, w: 0.36, ht: 0.45, hb: 0.4, n: 2.2 }, { x: -6.0, y: 0.82, w: 0.05, ht: 0.26, hb: 0.2 }];
    const WN = [...sideW(K, [0.55, -1.35], 1.0, 0.42, 0.26), topW(K, 1.5, 2.2, 0.42), topW(K, -0.95, -0.25, 0.42)];
    const ft = fuseTex(RED, 11.85, 6.0, (c, W, H, d) => {
      d.stripe(0.33, 10, '#f3ead6'); d.text('?', 0.52, 0.245, 300, '#f6f1e4'); d.text('COSTES — BELLONTE', 0.28, 0.2, 44, '#f3ead6', '700');
      d.band(0.76, 1, '#a9adb3'); c.fillStyle = 'rgba(0,0,0,.3)'; for (let i = 0; i < 22; i++) { const u = 0.78 + i * 0.008; c.fillRect(u * W, H * 0.66, 5, H * 0.1); c.fillRect(u * W, H * 0.24, 5, H * 0.1); }
      d.seams([0.62, 0.42, 0.24], 'rgba(60,0,0,.3)');
    }, { wins: WN, xa: -6, xb: 5.85, frame: '#6e0c10', soot: [[0.8, 0.3, 0.2, 50]] });
    fuselage(I, K, { xa: -6, xb: 5.85, paint: P.lacquer(0xffffff, { map: ft, metalness: 0.15 }), inner: 0x8f958f, wall: 'metal', wins: WN, x0: -2.5, x1: 2.7, formers: [-1.7, -0.9, -0.1, 0.7, 1.5, 2.1], rings: 84 });
    // 机头：桨帽、木质螺旋桨、两排排气管、机腹散热器
    const pr = P.propeller(1.5, 2, M.woodDark, P.lacquer(RED)); pr.group.position.set(5.95, 0.62, 0); R.add(pr.group);
    I.spinners.push({ spin: pr.spin, disc: pr.disc, blades: pr.blades, idx: 0, dir: 1 });
    I.engines.push({ pos: v3(4.5, 1.5, 0), out: { x: 4.2, z: 0 } });
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
      const x = 3.5 + i * 0.28, z = s * (P.halfW(K, x, 1.0) + 0.02);
      R.add(P.strut(v3(x, 1.0, z), v3(x - 0.14, 1.06, z + s * 0.15), 0.04, M.rust));
      const tip = [x - 0.14, 1.06, z + s * 0.15], zN = s * (P.halfW(K, 4.9, 1.0) + 0.02);
      exhaust(I, 0, tip, [-0.14, 0.06, s * 0.15], 0.04, i === 0, [4.76, 1.06, zN + s * 0.15]);
    }
    R.add(P.mesh(new T.BoxGeometry(0.9, 0.34, 0.7), M.dark, 4.1, -0.36, 0)); R.add(P.mesh(new T.BoxGeometry(0.92, 0.26, 0.6), M.copper, 4.1, -0.36, 0));
    for (let i = 0; i < 6; i++) R.add(P.mesh(new T.BoxGeometry(0.02, 0.028, 0.6), M.dark, 4.565, -0.47 + i * 0.045, 0));                       // 散热器百叶
    const cowlM = P.std(0xa9adb3, 0.42, 0.7);
    for (const s of [-1, 1]) { const b = P.mesh(new T.CapsuleGeometry(0.13, 1.3, 6, 14), cowlM, 4.25, P.topY(K, 4.25, s * 0.3) - 0.06, s * 0.3); b.rotation.z = Math.PI / 2 - 0.17; R.add(b); }   // 气缸排鼓包
    R.add(P.mesh(new T.BoxGeometry(0.34, 0.1, 0.18), cowlM, 5.0, P.topY(K, 5.0, 0) + 0.02, 0)); R.add(P.mesh(new T.BoxGeometry(0.02, 0.07, 0.14), M.black, 5.175, P.topY(K, 5.0, 0) + 0.025, 0));   // 化油器进气斗
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) { const x = 3.3 + i * 0.36; R.add(P.mesh(new T.BoxGeometry(0.06, 0.03, 0.03), M.steel, x, 0.35, s * (P.halfW(K, x, 0.35) + 0.005))); }   // 发动机罩搭扣
    const uo = { span: 18, root: 2.7, tip: 2.3, t: 0.12, cam: 0.035, tipR: 0.14 }, lo = { span: 11.6, root: 2.0, tip: 1.6, t: 0.12, cam: 0.03, tipR: 0.16 };
    const wm = P.std(0xffffff, 0.6, 0, { map: wingTex(RED, { ribs: 44, caps: true, text: 'F-AJNP', color: '#f3ead6', size: 120, u: 0.77 }) });
    addWing(I, uo, wm, 3.1, 2.85, { wire: [-1.2, 8.7, 13], ghost: 0xd8404a, zg: 6.6, det: ['rib', 44, 8, 1] });
    addWing(I, lo, P.std(0xffffff, 0.6, 0, { map: wingTex(RED, { ribs: 30 }) }), 2.45, -0.06, { clip: false, det: ['rib', 30, 6, 1] });
    // 单支宽翼间支柱（Bréguet 19 的招牌）与翼中支架
    for (const s of [-1, 1]) {
      const a = v3(1.55, 0.12, s * 4.3), b = v3(2.0, 2.82, s * 4.65), d = new V3().subVectors(b, a), len = d.length();
      const m = new T.Mesh(new T.BoxGeometry(0.55, len, 0.07), P.std(0xc0181c, 0.5)); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(v3(0, 1, 0), d.normalize()); R.add(m);
    }
    strutSet(I, mirror([[[2.7, 1.42, 0.5], [2.75, 2.8, 0.75]], [[1.25, 1.44, 0.5], [1.5, 2.8, 0.75]], [[2.7, 1.42, 0.5], [1.5, 2.8, 0.75]]]), 0.04);
    for (const s of [-1, 1]) gearWheel(I, 2.75, -1.5, s * 1.35, 0.5);
    strutSet(I, mirror([[[3.3, -0.2, 0.6], [2.8, -1.4, 1.2]], [[2.0, -0.22, 0.6], [2.7, -1.4, 1.2]]]), 0.055, P.std(0xc0181c, 0.5));
    strutSet(I, [[[2.75, -1.5, -1.3], [2.75, -1.5, 1.3]], [[-5.3, 0.5, 0], [-5.65, 0.1, 0]]], 0.04);
    // 尾翼：红色垂尾 + 法国三色方向舵
    R.add(P.plate([[-4.3, 1.05], [-4.9, 1.9], [-5.3, 2.2], [-5.5, 1.1], [-4.9, 0.95]], 0.07, P.lacquer(RED)));
    [['#1f3f8f', -5.5], ['#f3f0e6', -5.82], ['#c0181c', -6.14]].forEach(([c, x], i) => {
      R.add(P.plate([[x, 0.62 + i * 0.06], [x, 2.22 - i * 0.12], [x - 0.3, 2.2 - i * 0.2 - (i === 2 ? 0.2 : 0)], [x - 0.32, 0.64 + i * 0.08 + (i === 2 ? 0.15 : 0)]], 0.06, P.std(c, 0.55)));
    });
    const st = new T.Mesh(P.wing({ span: 4.6, root: 1.4, tip: 1.0, t: 0.07, cam: 0, tipR: 0.3, taperAt: 0.5 }), P.std(0xc0181c, 0.55)); st.material.side = T.DoubleSide; st.position.set(-4.5, 0.98, 0); R.add(st);
    for (const x of [2.34, -0.14]) { const ws = P.mesh(new T.BoxGeometry(0.03, 0.36, 0.8), M.glass, x, P.topY(K, x, 0) + 0.13, 0); ws.rotation.z = -0.5; ws.userData.noShadow = true; R.add(ws); }   // 前后座舱各一块风挡
    wires(I, mirror([[[2.4, 0.16, 1.0], [2.5, 2.8, 4.6]], [[1.2, 0.16, 1.0], [1.5, 2.8, 4.6]], [[2.6, 2.78, 0.8], [2.1, 0.14, 4.3]], [[1.5, 2.78, 0.8], [1.1, 0.14, 4.3]]]));   // 翼间张线
    wires(I, [[[1.5, 2.9, 0], [-5.25, 2.2, 0]]], 0.007); hingeH(I, -5.2, 0.98, 3.4, 0.08); pitot(I, 2.95, 2.84, -6.5);
    navLight(I, 2.0, 2.9, -8.95, NAV.red); navLight(I, 2.0, 2.9, 8.95, NAV.green); navLight(I, -6.2, 1.5, 0, NAV.white);
    I.zones.in = [{ x0: -2.25, x1: 2.4, z0: -0.55, z1: 0.55 }];
    I.zones.out = [{ x0: -5.6, x1: 5.2, z0: -0.3, z1: 0.3 }, { x0: 0.55, x1: 2.25, z0: -5.3, z1: 5.3, y: 0.15 }];
    I.cut = { x0: -2.5, x1: 2.7, z0: -1.2, z1: 30, y: 0.62, s: 0.5 };
    I.tail = { x: -5.2, z: 0 };
    I.icePts = [{ x: 2.0, z: -2.6 }, { x: 2.0, z: 2.8 }, { x: 1.9, z: -4.5 }, { x: 1.9, z: 4.7 }, { x: 5.0, z: 0 }, { x: 1.0, z: 3.8 }];
    outfit(I, { walk: 0.55, rise: 0.3, helm: { x: 1.85, z: 0 }, panelX: 2.64, panelW: 1.2, eng: 1.12, nav: -0.5, fuse: 0.38, ladder: -1.9, hatchOut: { x: -3.0, z: 0 },
      tank: { x: -1.6, side: 1, len: 0.85, t: 0.2, h: 0.8 }, pump: -0.72, items: { wrench: 1.05, mallet: 0.5, ext: -0.05 }, spares: 1.62, lamps: [0.75, -1.25],
      extras: [['aid', 1.62, -1, 0.92], ['rope', -1.25, -1, 0.6], ['oil', -1.42, -1], ['sack', -2.32, 1, 0, 0.12]],
      fire: [{ x: -0.5, z: 0.1 }, { x: 0.6, z: -0.1 }, { x: -1.3, z: 0 }, { x: 1.2, z: 0.15 }], spawn: [{ x: 1.85, z: 0 }, { x: -0.4, z: 0.1 }] });
    return finish(I);
  }

  /* ====================== 3. Fokker F.VIIb-3m ====================== */
  function fokker() {
    const I = inst(), R = I.root, BLUE = '#1d4f9e';
    const K = [{ x: 5.5, y: 0.62, w: 0.5, ht: 0.5, n: 2.2 }, { x: 4.5, y: 0.64, w: 0.95, ht: 0.86, hb: 0.84, n: 3 }, { x: 3.3, y: 0.74, w: 1.15, ht: 1.08, n: 4 }, { x: 0, y: 0.74, w: 1.18, ht: 1.1, n: 4.5 },
      { x: -3.4, y: 0.76, w: 1.06, ht: 1.0, n: 4 }, { x: -5.6, y: 0.88, w: 0.58, ht: 0.76, hb: 0.7, n: 3 }, { x: -7.3, y: 1.0, w: 0.09, ht: 0.5, hb: 0.45, n: 2.4 }];
    const WN = [...sideW(K, [2.75, 1.85, 0.95, 0.05, -0.85, -1.75, -2.65], 1.12, 0.62, 0.48), ...canopy(3.58, 4.3)];
    const ft = fuseTex(BLUE, 12.8, 8.2, (c, W, H, d) => {
      d.text('SOUTHERN CROSS', 0.56, 0.205, 92, '#f4f1e8');
      c.fillStyle = 'rgba(0,0,0,.12)'; for (let x = 0; x < W; x += 96) c.fillRect(x, 0, 3, H);
      d.band(0.9, 1, '#b9bdc2'); d.door(0.333, 0.393, 0.07, 0.43, 'rgba(0,10,40,.6)');
    }, { wins: WN, xa: -7.3, xb: 5.5, frame: '#12305f' });
    fuselage(I, K, { xa: -7.3, xb: 5.5, paint: P.std(0xffffff, 0.62, 0, { map: ft }), inner: 0xb9ab8a, wall: 'fabric', wins: WN, winFrame: M.woodDark, x0: -3.5, x1: 3.5, formers: [-2.6, -1.7, -0.8, 0.1, 1.0, 1.9, 2.8], rings: 84 });
    const eo = { r: 0.56, cyl: 9, propR: 1.28, propMat: M.alu, pipe: true };
    engine(I, 5.78, 0.62, 0, eo, { x: 5.0, z: 0 });
    // 厚实的层板悬臂机翼
    const wo = { span: 20, root: 3.7, tip: 2.1, t: 0.19, cam: 0.035, tipR: 0.1, taperAt: 0.25 };
    addWing(I, wo, P.std(0xffffff, 0.46, 0.3, { map: wingTex('#c9cdd2', { ribs: 0, caps: true, text: 'VH-USU', color: '#14161a', size: 88, u: 0.77 }) }), 3.3, 2.1, { wire: [-1.3, 9.65, 13], ghost: 0xd0d6dc, zg: 5.2, det: ['ply', 12, 4, 0.2] });   // 层板机翼刷银色涂料
    // 翼下两台发动机短舱 + 起落架
    const nacK = [{ x: 0.25, y: 0, w: 0.42, ht: 0.42 }, { x: -0.5, y: 0, w: 0.4, ht: 0.4 }, { x: -1.3, y: 0.02, w: 0.22, ht: 0.22 }, { x: -1.9, y: 0.04, w: 0.03, ht: 0.03 }];
    for (const s of [-1, 1]) {
      engine(I, 3.85, 0.95, s * 3.7, Object.assign({ phase: 0.2 }, eo), { x: 2.95, z: s * 3.7 });
      const n = new T.Mesh(P.loft(nacK, { rings: 22, seg: 20 }), P.std(0xb9bdc2, 0.4, 0.8)); n.position.set(3.55, 0.95, s * 3.7); R.add(n);
      gearWheel(I, 3.0, -1.3, s * 3.62, 0.5);
    }
    strutSet(I, mirror([[[3.5, 1.3, 3.7], [2.9, 1.95, 3.7]], [[2.5, 1.2, 3.7], [1.6, 1.95, 3.7]], [[3.1, 0.85, 3.4], [2.7, 0.3, 1.12]], [[3.2, 0.6, 3.7], [3.0, -1.2, 3.62]], [[2.8, -0.2, 1.0], [3.0, -1.22, 3.5]], [[1.4, -0.2, 1.0], [2.95, -1.22, 3.5]]]), 0.05);
    antenna(I, -3.9, 0.6, [-6.9, 2.76, 0]); pitot(I, 3.0, 2.02, -6.0); hingeV(I, -7.15, 0.62, 2.62, 0.095); hingeH(I, -6.72, 1.25, 4.4, 0.08);
    [[5.3, 0.18, 0.32, 0], [3.4, 0.55, 4.0, 2], [3.4, 0.55, -3.4, 1]].forEach(([x, y, z, k]) => { strutSet(I, [[[x, y, z], [x - 0.9, y - 0.12, z + 0.04]]], 0.045, M.rust); exhaust(I, k, [x - 0.9, y - 0.12, z + 0.04], [-0.9, -0.12, 0.04], 0.045); });   // 三台发动机的排气管
    const tm = P.std(0x1d4f9e, 0.6);
    R.add(P.plate([[-5.6, 1.5], [-6.2, 2.3], [-6.9, 2.75], [-7.6, 2.55], [-7.95, 1.8], [-7.8, 0.75], [-7.3, 0.55], [-6.6, 1.4]], 0.08, tm));
    const stb = new T.Mesh(P.wing({ span: 5.8, root: 1.8, tip: 1.2, t: 0.07, cam: 0, tipR: 0.3, taperAt: 0.5 }), P.std(0x1d4f9e, 0.6)); stb.material.side = T.DoubleSide; stb.position.set(-5.6, 1.25, 0); R.add(stb);
    strutSet(I, mirror([[[-6.2, 0.55, 0.2], [-6.4, 1.22, 1.9]]]).concat([[[-6.7, 0.5, 0], [-7.05, 0.05, 0]]]), 0.03);
    navLight(I, 2.2, 2.2, -9.95, NAV.red); navLight(I, 2.2, 2.2, 9.95, NAV.green); navLight(I, -7.95, 1.9, 0, NAV.white);
    I.zones.in = [{ x0: -3.2, x1: 3.15, z0: -0.82, z1: 0.82 }];
    I.zones.out = [{ x0: 0.0, x1: 3.1, z0: -8.6, z1: 6.6, y: (x, z) => 2.58 - 0.03 * Math.abs(z) }, { x0: -6.9, x1: 0.1, z0: -0.32, z1: 0.32 }, { x0: 3.0, x1: 5.2, z0: -0.3, z1: 0.3 }];
    I.cut = { x0: -3.5, x1: 3.5, z0: -1.35, z1: 30, y: 0.72, s: 0.45 };
    I.tail = { x: -6.6, z: 0 };
    I.icePts = [{ x: 2.8, z: -2.0 }, { x: 2.8, z: 5.2 }, { x: 2.7, z: -5.6 }, { x: 2.75, z: 2.2 }, { x: 4.9, z: 0 }, { x: 0.6, z: 5.6 }, { x: 0.6, z: -4.0 }];
    outfit(I, { walk: 0.82, part: 2.28, helm: { x: 2.7, z: -0.38 }, seat2: { x: 2.7, z: 0.4 }, panelX: 3.44, panelW: 1.9, eng: 1.8, nav: 0.5, fuse: -0.9, ladder: -2.85, hatchOut: { x: -1.0, z: 0 },
      tank: { x: -2.5, side: 1, len: 1.1, t: 0.24, h: 0.85 }, pump: -1.5, items: { wrench: 1.0, mallet: 0.35, ext: -0.3 }, spares: 1.7, lamps: [1.15, -1.9], lampY: 1.1,
      extras: [['radio', -0.2, -1], ['aid', -1.5, -1, 0.96], ['oil', -1.5, -1], ['ring', -2.38, -1, 1.0], ['crate', -2.36, -1], ['raft', -0.9, 1], ['coat', 2.02, -1, 1.2]],
      fire: [{ x: -0.6, z: 0.2 }, { x: 0.9, z: -0.3 }, { x: -1.8, z: -0.2 }, { x: 1.9, z: 0.3 }, { x: -2.6, z: 0.1 }], spawn: [{ x: 2.7, z: -0.38 }, { x: 0.3, z: 0.25 }] });
    return finish(I);
  }

  /* ====================== 4. Dornier Do J Wal ====================== */
  function wal() {
    const I = inst(), R = I.root;
    const K = [{ x: 7.5, y: 0.62, w: 0.05, ht: 0.42, hb: 0.3 }, { x: 6.3, y: 0.46, w: 0.72, ht: 0.6, hb: 0.72, nt: 4, nb: 2.2 }, { x: 4.4, y: 0.4, w: 1.2, ht: 0.7, hb: 0.92, nt: 5, nb: 3 }, { x: 0, y: 0.4, w: 1.32, ht: 0.74, hb: 1.0, nt: 5, nb: 3.5 },
      { x: -3.6, y: 0.44, w: 1.2, ht: 0.7, hb: 0.9, nt: 5, nb: 3 }, { x: -6, y: 0.66, w: 0.78, ht: 0.5, hb: 0.56, nt: 4, nb: 2.5 }, { x: -8.7, y: 0.95, w: 0.18, ht: 0.32, hb: 0.28, nt: 3, nb: 2 }];
    const WN = [...sideW(K, [2.4, 1.0, -0.4, -1.8], 0.68, 0.36, 0.36, true), topW(K, 2.92, 3.78, 0.82)];
    const ft = fuseTex('#c4c9cf', 16.2, 7.4, (c, W, H, d) => { d.rivets(64, 'rgba(0,0,0,.16)'); d.below(0.135, '#1d2026'); d.text('D-1422', 0.3, 0.215, 92, '#14161a'); }, { wins: WN, xa: -8.7, xb: 7.5, frame: 'rgba(0,0,0,.55)' });
    const alu = () => P.std(0xffffff, 0.36, 0.82, { map: ft });
    fuselage(I, K, { xa: -8.7, xb: 7.5, paint: alu(), inner: 0x9aa39a, wall: 'metal', wins: WN, winFrame: M.brass, x0: -3.7, x1: 4.25, formers: [-2.8, -1.9, -1.0, -0.1, 0.8, 1.7, 2.6, 3.4], rings: 96 });
    const metal = (ribs, o) => P.std(0xffffff, 0.36, 0.82, { map: wingTex('#c4c9cf', Object.assign({ ribs, rivets: true }, o)) });
    // 浮筒短翼（Stummel）
    addWing(I, { span: 7.8, root: 3.6, tip: 2.5, t: 0.2, cam: 0, tipR: 0.25, taperAt: 0.5, dih: 0.05 }, metal(14), 1.9, -0.14, { clip: false, det: ['metal', 7, 4, 0.85, 0.25] });
    // 伞式机翼 + 翼上纵列双发短舱
    const wo = { span: 20, root: 3.9, tip: 3.9, t: 0.13, cam: 0.035, tipR: 0.16 };
    addWing(I, wo, metal(40, { caps: true, text: 'D-1422', color: '#14161a', size: 130, u: 0.78, both: true }), 2.05, 3.2, { wire: [-1.45, 9.6, 13], ghost: 0xd0d6dc, zg: 7.2, det: ['metal', 20, 4, 0.85, 0.25] });
    const NK = [{ x: 2.9, y: 4.08, w: 0.42, ht: 0.5, n: 2.6 }, { x: 2.0, y: 4.08, w: 0.55, ht: 0.6, n: 2.6 }, { x: 0, y: 4.08, w: 0.58, ht: 0.62, n: 2.6 }, { x: -2.0, y: 4.08, w: 0.52, ht: 0.58, n: 2.6 }, { x: -2.9, y: 4.08, w: 0.38, ht: 0.46, n: 2.6 }];
    R.add(new T.Mesh(P.loft(NK, { rings: 40, seg: 24, caps: false }), P.detail(P.std(0xc4c9cf, 0.36, 0.82), 'metal', 5, 3, 0.85)));
    const radM = P.std(0xffffff, 0.55, 0.5, { side: T.DoubleSide, map: P.tex(64, 64, (c) => { c.fillStyle = '#15120f'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#6a5a44'; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) c.fillRect(x * 8 + (y % 2) * 4 + 1, y * 8 + 1, 5, 5); }, [7, 7]) });
    R.add(P.bulkhead(NK, 2.9, radM, 0), P.bulkhead(NK, -2.9, radM, 0));                                                                         // 前后散热器蜂窝面
    const nacM = P.std(0xc4c9cf, 0.36, 0.82), NK2 = NK.map(k => Object.assign({}, k, { w: k.w + 0.012, ht: k.ht + 0.012 }));
    for (const x of [2.45, 0.32, -0.32, -2.45]) R.add(new T.Mesh(P.loft(NK2, { x0: x - 0.03, x1: x + 0.03, rings: 1, seg: 24, caps: false }), nacM));     // 整流罩箍带（盖板的接缝）
    for (const s of [-1, 1]) {
      const cone = P.mesh(new T.ConeGeometry(0.2, 0.3, 16), M.alu, s * 2.98, 4.08, 0); cone.rotation.z = -s * Math.PI / 2; R.add(cone);                    // 桨轴整流锥
      const rim = P.mesh(new T.TorusGeometry(0.47, 0.03, 6, 28), M.alu, s * 2.9, 4.08, 0); rim.rotation.y = Math.PI / 2; rim.scale.set(1, 1.12, 1); R.add(rim);
      for (let i = 0; i < 7; i++) for (const x0 of [0.5, -2.0]) {                                                                              // 检修百叶：黑色开口 + 一片向后掀起的叶片
        const x = x0 + i * 0.2, z = s * (P.halfW(NK, x, 4.08) + 0.004), th = 0.6;
        R.add(P.mesh(new T.BoxGeometry(0.05, 0.26, 0.02), M.black, x - 0.012, 4.08, z));
        const vane = P.mesh(new T.BoxGeometry(0.085, 0.29, 0.012), nacM, x + 0.03 - Math.cos(th) * 0.0425, 4.08, z + s * (Math.sin(th) * 0.0425 + 0.004)); vane.rotation.y = s * th; R.add(vane);
      }
    }
    for (const [x, dir] of [[3.08, 1], [-3.08, -1]]) {
      const pr = P.propeller(1.5, 4, M.woodDark); pr.group.position.set(x, 4.08, 0); R.add(pr.group);
      I.spinners.push({ spin: pr.spin, disc: pr.disc, blades: pr.blades, idx: I.engines.length, dir });
      I.engines.push({ pos: v3(x * 0.75, 4.75, 0), out: { x: dir * 1.55, z: 0 } });
    }
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) [[2.3, 0], [-1.2, 1]].forEach(([x0, k]) => {                                          // 每台发动机两排各六根排气短管
      const x = x0 - i * 0.22; R.add(P.strut(v3(x, 4.55, s * 0.36), v3(x - 0.1, 4.78, s * 0.5), 0.035, M.rust));
      exhaust(I, k, [x - 0.1, 4.78, s * 0.5], [-0.1, 0.23, s * 0.14], 0.035, i === 0, [x0 - 1.2, 4.78, s * 0.5]);
    });
    // 支柱：翼中吊架、外侧 N 形撑杆、两架检修梯
    strutSet(I, mirror([[[1.5, 1.1, 0.95], [1.5, 3.12, 1.05]], [[-1.3, 1.1, 0.95], [-1.3, 3.12, 1.05]], [[1.5, 1.1, 0.95], [-1.3, 3.12, 1.05]],
      [[1.0, 0.1, 3.3], [1.3, 3.12, 4.7]], [[-0.9, 0.1, 3.3], [-0.9, 3.12, 4.7]], [[1.0, 0.1, 3.3], [-0.9, 3.12, 4.7]]]), 0.06, M.alu);
    for (const x of [1.55, -1.55]) { for (const z of [-0.2, 0.2]) R.add(P.strut(v3(x, 1.1, z), v3(x, 3.1, z), 0.025, M.steel)); for (let y = 1.35; y < 3.0; y += 0.3) R.add(P.strut(v3(x, y, -0.2), v3(x, y, 0.2), 0.02, M.steel)); R.add(P.mesh(new T.BoxGeometry(0.5, 0.04, 0.6), M.wood, x, 1.96, 0)); }
    // 尾翼
    R.add(P.plate([[-6.6, 1.1], [-7.2, 2.6], [-7.9, 3.5], [-8.7, 3.6], [-9.2, 2.9], [-9.1, 1.3], [-8.6, 0.9], [-7.6, 1.15]], 0.09, P.std(0xc4c9cf, 0.36, 0.82)));
    for (let i = 0; i < 3; i++) R.add(P.mesh(new T.BoxGeometry(0.75, 0.2, 0.1), P.std(['#111111', '#f0f0ea', '#b3202a'][i], 0.5), -8.5, 3.15 - i * 0.2, 0));
    const stb = new T.Mesh(P.wing({ span: 5.8, root: 1.9, tip: 1.5, t: 0.07, cam: 0, tipR: 0.25, taperAt: 0.5 }), metal(16)); stb.position.set(-6.9, 2.3, 0); R.add(stb);
    strutSet(I, mirror([[[-7.3, 1.05, 0.2], [-7.6, 2.28, 2.0]]]), 0.035);
    const ws = P.mesh(new T.BoxGeometry(0.03, 0.4, 1.7), M.glass, 4.1, 1.32, 0); ws.rotation.z = -0.4; ws.userData.noShadow = true; R.add(ws);
    wires(I, mirror([[[0.3, 1.05, 1.28], [0.4, 3.14, 4.6]], [[0.0, 0.14, 3.3], [0.1, 3.14, 1.1]]]));
    const dk = P.std(0x1d2026, 0.6);
    for (const s of [-1, 1]) { R.add(P.wallPipe(K, -4.6, 6.4, -0.12, s, -0.014, 0.03, dk)); R.add(P.mesh(new T.CylinderGeometry(0.05, 0.06, 0.16, 10), M.steel, 5.9, P.topY(K, 5.9, 0.22) + 0.05, s * 0.22)); }   // 船身护舷条与系缆桩
    const coil = P.St.rope(); coil.rotation.x = -Math.PI / 2; coil.position.set(5.2, P.topY(K, 5.2, 0.3) + 0.04, -0.3); R.add(coil);
    hingeV(I, -8.5, 1.0, 3.55, 0.11); hingeH(I, -8.0, 2.3, 4.4, 0.08);
    navLight(I, 0.6, 3.3, -9.95, NAV.red); navLight(I, 0.6, 3.3, 9.95, NAV.green); navLight(I, -9.2, 2.4, 0, NAV.white);
    I.zones.in = [{ x0: -3.45, x1: 3.95, z0: -0.95, z1: 0.95 }];
    I.zones.out = [{ x0: -8.0, x1: 6.7, z0: -0.7, z1: 0.7 }, { x0: -1.3, x1: 1.7, z0: -3.4, z1: 3.4, y: 0.27 }, { x0: 1.3, x1: 1.8, z0: -0.3, z1: 0.3, y: 1.98 }, { x0: -1.8, x1: -1.3, z0: -0.3, z1: 0.3, y: 1.98 }];
    I.cut = { x0: -3.7, x1: 4.25, z0: -1.5, z1: 30, y: 0.78, s: 0.3 };
    I.tail = { x: -7.6, z: 0 };
    I.icePts = [{ x: 1.2, z: -2.5 }, { x: 1.2, z: 2.6 }, { x: -0.5, z: -2.9 }, { x: -0.4, z: 3.0 }, { x: 5.8, z: 0 }, { x: -5.4, z: 0 }];
    outfit(I, { walk: 0.95, rise: 0.14, part: 2.8, helm: { x: 3.3, z: -0.42 }, seat2: { x: 3.3, z: 0.42 }, panelX: 4.18, panelW: 2.1, panelY: 0.7, eng: 2.3, nav: 1.0, fuse: -0.4, ladder: -3.1, hatchOut: { x: -4.5, z: 0 },
      tank: { x: -1.75, side: -1, len: 1.15, t: 0.26, h: 0.9 }, pump: -0.8, items: { wrench: 1.8, mallet: 1.0, ext: 0.15 }, spares: 2.6, lamps: [1.65, -1.0], lampY: 0.98, ladderH: 1.3,
      extras: [['radio', 0.15, -1], ['aid', -2.72, -1, 0.8], ['oil', -2.72, -1], ['ring', 3.74, -1, 0.62], ['crate', -1.9, 1], ['crate', -2.6, 1], ['raft', -3.2, 1]],
      fire: [{ x: -0.5, z: 0.2 }, { x: 1.2, z: -0.3 }, { x: -2.0, z: 0.3 }, { x: 2.4, z: 0.3 }, { x: -3.0, z: -0.1 }], spawn: [{ x: 3.3, z: -0.42 }, { x: 0.5, z: 0.3 }] });
    return finish(I);
  }

  /* ====================== 5. Sikorsky S-38 ====================== */
  function s38() {
    const I = inst(), R = I.root;
    const K = [{ x: 4.7, y: 0.95, w: 0.06, ht: 0.3, hb: 0.4 }, { x: 3.7, y: 0.62, w: 0.78, ht: 0.8, hb: 0.85, nt: 3, nb: 2.2 }, { x: 2.1, y: 0.58, w: 1.17, ht: 1.14, hb: 1.05, nt: 3.5, nb: 3 }, { x: 0, y: 0.58, w: 1.22, ht: 1.2, hb: 1.1, nt: 4, nb: 3 },
      { x: -2.2, y: 0.62, w: 1.1, ht: 1.1, hb: 1.0, nt: 3.5, nb: 3 }, { x: -3.6, y: 0.92, w: 0.58, ht: 0.66, hb: 0.5, nt: 2.6, nb: 2 }, { x: -4.6, y: 1.25, w: 0.07, ht: 0.22, hb: 0.14 }];
    const WN = [...sideW(K, [1.9, 1.0, 0.1, -0.8, -1.7], 1.08, 0.5, 0.4), ...canopy(2.97, 3.6)];
    const ft = fuseTex(ZW, 9.3, 7.6, (c, W, H, d) => { zebra(c, W, H, 40); d.panel(0.835, 0.2, 360, 52, ZW); d.text("OSA'S ARK", 0.835, 0.2, 46, ZK); d.panel(0.2, 0.3, 230, 46, ZW); d.text('NC-29V', 0.2, 0.3, 40, ZK); d.seams([0.2, 0.84], 'rgba(0,0,0,.18)'); }, { wins: WN, xa: -4.6, xb: 4.7, frame: '#2a241c' });
    fuselage(I, K, { xa: -4.6, xb: 4.7, paint: P.lacquer(0xffffff, { map: ft }), inner: 0x7a4a2c, wall: 'ply', wins: WN, winFrame: M.brass, x0: -2.6, x1: 2.9, formers: [-1.8, -0.9, 0, 0.9, 1.8] });
    const uo = { span: 19, root: 3.0, tip: 2.2, t: 0.13, cam: 0.035, tipR: 0.12, taperAt: 0.3 }, lo = { span: 10.4, root: 1.9, tip: 1.5, t: 0.13, cam: 0.02, tipR: 0.14 };
    addWing(I, uo, P.std(0xffffff, 0.55, 0, { map: wingTex(ZW, { ribs: 46, draw: (c, W, H) => zebra(c, W, H, 60) }) }), 2.0, 3.55, { wire: [-1.4, 9.15, 13], ghost: 0xf0ece0, zg: 7.6, det: ['rib', 46, 8, 1] });
    addWing(I, lo, P.std(0xffffff, 0.55, 0, { map: wingTex(ZW, { ribs: 26, draw: (c, W, H) => zebra(c, W, H, 34) }) }), 1.15, 1.5, { wire: [-1.3, 5.0, 7], ghost: 0xf0ece0, zg: 3.5, det: ['rib', 26, 6, 1] });
    // 翼间吊挂的两台黄蜂星型发动机
    const nacK = [{ x: 0.2, y: 0, w: 0.4, ht: 0.4 }, { x: -0.6, y: 0, w: 0.36, ht: 0.36 }, { x: -1.5, y: 0.03, w: 0.04, ht: 0.04 }];
    for (const s of [-1, 1]) {
      engine(I, 2.35, 2.6, s * 1.85, { r: 0.5, cyl: 9, cowl: 'ring', cowlMat: P.lacquer(ZK), propR: 1.22, propMat: M.alu }, { x: 0.85, z: s * 1.85 });
      const n = new T.Mesh(P.loft(nacK, { rings: 18, seg: 18 }), P.std(0xc4c9cf, 0.4, 0.8)); n.position.set(2.1, 2.6, s * 1.85); R.add(n);
      // 尾撑
      R.add(P.strut(v3(-0.8, 3.5, s * 1.5), v3(-8.5, 3.05, s * 1.5), 0.14, zebraMat(4, 1, true, 0.3), 0.08));
      R.add(P.plate([[-7.5, 2.75], [-7.9, 3.9], [-8.5, 4.35], [-9.1, 4.1], [-9.25, 3.2], [-9.0, 2.45], [-8.3, 2.5]].map(p => p), 0.07, zebraMat(0.55, 0.55, true)).translateZ(s * 1.5));
      // 翼下浮筒
      const fl = new T.Mesh(P.loft([{ x: 0.9, y: 0, w: 0.03, ht: 0.05 }, { x: 0.45, y: 0, w: 0.2, ht: 0.2, n: 3 }, { x: -0.3, y: 0, w: 0.22, ht: 0.22, n: 3 }, { x: -0.9, y: 0.05, w: 0.03, ht: 0.05 }], { rings: 16, seg: 14 }), zebraMat(1, 1)); fl.position.set(0.5, 0.55, s * 4.4); R.add(fl);
      const w = gearWheel(I, 0.95, 0.36, s * 1.44, 0.42); w.rotation.x = s * 0.5;
    }
    strutSet(I, mirror([[[2.0, 2.95, 1.85], [1.7, 3.5, 1.85]], [[1.2, 2.85, 1.85], [0.6, 3.5, 1.85]], [[1.9, 2.25, 1.85], [1.0, 1.62, 1.85]], [[1.2, 2.3, 1.85], [0.0, 1.62, 1.85]], [[2.0, 2.4, 1.6], [1.6, 1.7, 0.9]],
      [[1.0, 1.62, 3.6], [1.6, 3.5, 3.95]], [[-0.4, 1.62, 3.6], [-0.4, 3.5, 3.95]], [[1.0, 1.62, 3.6], [-0.4, 3.5, 3.95]],
      [[0.8, 0.72, 4.4], [0.9, 1.45, 4.4]], [[0.1, 0.72, 4.4], [0.0, 1.45, 4.4]],
      [[-3.4, 1.3, 0.35], [-5.4, 3.2, 1.5]], [[-0.5, 1.55, 1.5], [-3.4, 3.33, 1.5]], [[-3.4, 1.3, 0.35], [-3.4, 3.33, 1.5]], [[1.0, 0.75, 1.3], [1.0, 1.45, 1.6]]]), 0.045);
    const stb = new T.Mesh(P.wing({ span: 4.9, root: 1.5, tip: 1.3, t: 0.07, cam: 0, tipR: 0.2, taperAt: 0.5 }), P.std(0xffffff, 0.55, 0, { map: wingTex(ZW, { ribs: 14, draw: (c, W, H) => zebra(c, W, H, 16) }) })); stb.material.side = T.DoubleSide; stb.position.set(-7.7, 3.05, 0); R.add(stb);
    wires(I, mirror([[[1.0, 1.66, 1.25], [1.5, 3.5, 3.9]], [[1.0, 1.66, 3.6], [1.3, 3.5, 1.9]]]).concat([[[-1.5, 3.44, 1.5], [-5.0, 3.24, -1.5]], [[-1.5, 3.44, -1.5], [-5.0, 3.24, 1.5]], [[-5.0, 3.24, 1.5], [-8.3, 3.06, -1.5]], [[-5.0, 3.24, -1.5], [-8.3, 3.06, 1.5]]]));   // 翼间与尾撑张线
    for (const s of [-1, 1]) { R.add(P.wallPipe(K, -2.3, 3.6, -0.08, s, -0.014, 0.028, M.brass)); hingeV(I, -8.8, 2.5, 4.3, 0.09, s * 1.5); }
    hingeH(I, -8.7, 3.05, 4.4, 0.08);
    navLight(I, 1.2, 3.6, -9.45, NAV.red); navLight(I, 1.2, 3.6, 9.45, NAV.green); navLight(I, -9.25, 3.3, 1.5, NAV.white);
    I.zones.in = [{ x0: -2.3, x1: 2.6, z0: -0.85, z1: 0.85 }];
    I.zones.out = [{ x0: -3.3, x1: 3.5, z0: -0.6, z1: 0.6 }, { x0: -0.55, x1: 1.05, z0: -5.0, z1: 5.0, y: 1.64 }];
    I.cut = { x0: -2.6, x1: 2.9, z0: -1.4, z1: 30, y: 0.75, s: 0.45 };
    I.tail = { x: -3.1, z: 0 };
    I.icePts = [{ x: 0.9, z: -3.3 }, { x: 0.9, z: 3.4 }, { x: 0.8, z: -4.6 }, { x: 0.8, z: 4.7 }, { x: 3.1, z: 0 }, { x: -0.3, z: 2.8 }];
    outfit(I, { walk: 0.85, part: 1.74, helm: { x: 2.15, z: -0.4 }, seat2: { x: 2.15, z: 0.4 }, panelX: 2.84, panelW: 1.9, eng: 1.38, nav: 0.3, fuse: -0.8, ladder: -1.95, hatchOut: { x: -3.0, z: 0 },
      tank: { x: -1.65, side: 1, len: 0.9, t: 0.24, h: 0.85 }, pump: -0.72, items: { wrench: 1.3, mallet: 0.7, ext: 0.1 }, spares: 1.9, lamps: [0.9, -1.35], lampY: 1.12,
      extras: [['radio', -1.4, -1], ['ring', -0.33, -1, 1.02], ['aid', 0.92, -1, 0.8], ['coat', 1.56, -1, 1.25], ['sack', -2.12, -1, 0, -0.25]],
      fire: [{ x: -0.5, z: 0.2 }, { x: 0.8, z: -0.3 }, { x: -1.5, z: -0.2 }, { x: 1.6, z: 0.3 }], spawn: [{ x: 2.15, z: -0.4 }, { x: 0.2, z: 0.3 }] });
    return finish(I);
  }

  /* ------------------------------ 机型名录 ------------------------------ */
  return [
    { id: 'vega', name: '洛克希德 维加 5B', en: 'Lockheed Vega 5B', year: '1932 · NR7952「小红巴士」', build: vega, snd: { smp: 'engA', rate: 1.1 }, speed: 1.14, fuelRes: 45, burn: 1.0, tough: 1.0, camDist: 10.4, camX: -0.3, gearH: 1.67, seaplane: false,
      blurb: '1932 年 5 月 20 日，Amelia Earhart 驾驶这架红色维加从纽芬兰 Harbour Grace 独自起飞，14 小时 56 分后降落在北爱尔兰的牧场。途中高度表失灵、机翼结冰、排气歧管开裂喷火——她都一个人扛了下来。',
      stats: { 航速: 5, 燃油: 2, 机体: 3, 舱室: 1, 引擎: 1 }, perk: '<b>木质硬壳流线机身</b>：全场最快，但只有一台发动机，舱室狭小，备用油最少。', rec: '单人推荐' },
    { id: 'breguet', name: '宝玑 19「问号」', en: 'Bréguet 19 TF Super Bidon', year: '1930 · Point d\'Interrogation', build: breguet, snd: { smp: 'engB', rate: 1.2 }, speed: 1.0, fuelRes: 110, burn: 1.0, tough: 1.1, camDist: 12.2, camX: 0.1, gearH: 2.0, seaplane: false,
      blurb: '机身上画着巨大问号的红色双翼机。1930 年 9 月，Costes 与 Bellonte 驾驶它完成史上第一次巴黎直飞纽约，逆风飞行 37 小时。「Bidon」意为油桶——机身几乎就是一只会飞的油箱。',
      stats: { 航速: 3, 燃油: 5, 机体: 2, 舱室: 2, 引擎: 1 }, perk: '<b>超级油桶</b>：备用燃油最多，容错充裕；下翼可以走出去很远，但机体较脆。', rec: '单人 / 双人' },
    { id: 'fokker', name: '福克 F.VIIb-3m「南十字星」', en: 'Fokker F.VIIb-3m', year: '1930 · VH-USU Southern Cross', build: fokker, snd: { smp: 'engA', rate: 0.93 }, speed: 0.9, fuelRes: 110, burn: 1.25, tough: 0.8, camDist: 13.8, camX: -0.4, gearH: 1.8, seaplane: false,
      blurb: '蓝机身、银机翼的「南十字星」号。1928 年 Kingsford Smith 驾驶它首次飞越太平洋；1930 年 6 月又从爱尔兰 Portmarnock 海滩起飞，逆风 31 个半小时飞抵纽芬兰 Harbour Grace——正是两年后 Earhart 出发的那座机场。Earhart 1928 年以乘客身份首次越洋时坐的「友谊号」也是这个型号。',
      stats: { 航速: 2, 燃油: 4, 机体: 4, 舱室: 4, 引擎: 3 }, perk: '<b>三发冗余</b>：坏一台照样能飞；但翼下两台发动机需要爬到机翼上检修，油耗也高。', rec: '双人推荐' },
    { id: 'wal', name: '道尼尔 Do J「鲸」', en: 'Dornier Do J Wal', year: '1930 · D-1422 von Gronau', build: wal, snd: { smp: 'engB', rate: 0.96 }, speed: 0.84, fuelRes: 110, burn: 1.15, tough: 0.7, camDist: 16.0, camX: -0.2, gearH: 0.28, seaplane: true,
      blurb: '全金属飞行艇，船身两侧伸出标志性的浮筒短翼，两台发动机一拉一推纵列在伞式机翼上方。1926 年「Plus Ultra」号飞越南大西洋，1930 年 von Gronau 驾驶它经冰岛、格陵兰飞抵纽约。',
      stats: { 航速: 1, 燃油: 4, 机体: 5, 舱室: 5, 引擎: 2 }, perk: '<b>船身</b>：第一次触海不会坠毁，而是擦着浪尖弹起（损失机体）。舱室最宽敞，速度最慢。', rec: '双人推荐' },
    { id: 's38', name: '西科斯基 S-38「奥萨方舟」', en: 'Sikorsky S-38', year: "1933 · NC-29V Osa's Ark", build: s38, snd: { smp: 'engA', rate: 1.02 }, speed: 0.94, fuelRes: 80, burn: 1.1, tough: 0.85, camDist: 13.4, camX: -1.0, gearH: 0.22, seaplane: true,
      blurb: '双尾撑、高低翼、船身加收放机轮——被戏称为「一堆编队飞行的飞机零件」。这一架是探险家 Martin 与 Osa Johnson 夫妇的「奥萨方舟」：通体刷成斑马纹，1933 至 1934 年在非洲上空飞了近十万公里拍摄野生动物。没人驾驶 S-38 直飞过北大西洋——也许今晚是第一次。',
      stats: { 航速: 3, 燃油: 3, 机体: 4, 舱室: 3, 引擎: 2 }, perk: '<b>水陆两栖</b>：同样拥有一次触海弹起的机会。发动机就挂在下翼上方，检修路程最短。', rec: '双人 / 单人' },
  ];
})();
