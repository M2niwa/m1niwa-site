'use strict';
/* =========================================================================
   scenery.js — 场景点缀：机场细节、送行人群与船队、邮轮、座头鲸、候鸟、伴飞海鸟、渔船、冰山
   · 造型依据照片参考（文件末尾列出）；为了看得清，比例向可读性倾斜，但不超过实物的两倍
   · 会动的小东西（挥手、扑翼、旗帜、随浪起伏）全在顶点着色器里做：一群人 / 一群鸟只占一次绘制调用
   ========================================================================= */
const SCN = (() => {
  const T = THREE, V3 = T.Vector3, C = T.Color, M4 = T.Matrix4, st = GFX.st, rnd = U.rand, pick = U.pick;
  const uT = { value: 0 };
  let onEvent = () => {};

  /* ------------------------------ 顶点动画材质 ------------------------------
     aSway.xyz：摆动向量（乘 sin）；aSway.w：1 = 扑几下滑翔一阵（海鸟）
     aPS：相位、角速度、原地蹦跳的高度；aHv：随浪起伏的幅度与相位 */
  function hook(m) {
    m.onBeforeCompile = sh => {
      sh.uniforms.uT = uT;
      sh.vertexShader = 'attribute vec4 aSway; attribute vec3 aPS; attribute vec2 aHv; uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { float sw = sin(uT * aPS.y + aPS.x);
          float gl = mix(1., smoothstep(.3, .62, .5 + .5 * sin(uT * .55 + aPS.x * 2.7)), aSway.w);
          transformed += aSway.xyz * sw * gl;
          transformed.y += aPS.z * abs(sin(uT * aPS.y * .5 + aPS.x)) + aHv.x * sin(uT * 1.15 + aHv.y); }`);
    };
    m.userData.dyn = true; return m;
  }
  const bodyMat = (o) => hook(new T.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.85, metalness: 0, side: T.DoubleSide }, o)));
  const glowMat = () => hook(new T.MeshBasicMaterial({ vertexColors: true }));

  /* ------------------------------ 批量几何构建器 ------------------------------ */
  const gable = (() => {                       // 单位人字屋顶：长 x∈[-.5,.5]，宽 z∈[-.5,.5]，高 y∈[0,1]
    const g = new T.CylinderGeometry(0.5, 0.5, 1, 3); g.rotateZ(Math.PI / 2); g.rotateX(-Math.PI / 2); g.translate(0, 0.25, 0); g.scale(1, 1 / 0.75, 1 / 0.866); return g;
  })();
  const GEO = {
    box: new T.BoxGeometry(1, 1, 1), cyl: new T.CylinderGeometry(0.5, 0.5, 1, 10), frus: new T.CylinderGeometry(0.33, 0.5, 1, 8), cone: new T.CylinderGeometry(0, 0.5, 1, 8),
    sph: new T.SphereGeometry(0.5, 8, 6), rock: new T.DodecahedronGeometry(0.5, 0), gable,
  };
  const _m = new M4(), _q = new T.Quaternion(), _e = new T.Euler(), _s = new V3(), _p = new V3(), _v = new V3(), _n = new V3(), _c = new C(), _n3 = new T.Matrix3(), _l3 = new T.Matrix3(), _f = new M4();
  const loc = (x, y, z, sx, sy, sz, o) => new M4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(o && o.rx || 0, o && o.ry || 0, o && o.rz || 0, 'YZX')), _s.set(sx, sy, sz));
  class Batch {
    constructor() { this.pos = []; this.nor = []; this.col = []; this.sw = []; this.ps = []; this.hv = []; this.idx = []; this.nv = 0; this.M = new M4(); this.stack = []; this.heave = [0, 0]; }
    push(x, y, z, ry = 0, s = 1) { this.stack.push(this.M.clone()); this.M.multiply(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(s, s, s))); return this; }
    pop() { this.M = this.stack.pop(); return this; }
    /* 父坐标系里的一个顶点（位置、法线、颜色、动画） */
    vtx(px, py, pz, nx, ny, nz, c, anim, lx, ly, lz) {
      let sx = 0, sy = 0, sz = 0, ph = 0, spd = 0, bob = 0, gl = 0;
      if (anim) {
        ph = anim.ph || 0; spd = anim.spd || 0; bob = anim.bob || 0; gl = anim.glide ? 1 : 0;
        if (anim.sway) { const r = anim.sway(px, py, pz, lx, ly, lz); if (r) { _n.set(r[0], r[1], r[2]).applyMatrix3(_l3); sx = _n.x; sy = _n.y; sz = _n.z; if (r.length > 3) ph += r[3]; } }
      }
      _v.set(px, py, pz).applyMatrix4(this.M); this.pos.push(_v.x, _v.y, _v.z);
      _n.set(nx, ny, nz).applyMatrix3(_l3).normalize(); this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(c.r, c.g, c.b); this.sw.push(sx, sy, sz, gl); this.ps.push(ph, spd, bob * this.scl); this.hv.push(this.heave[0], this.heave[1]);
      return this.nv++;
    }
    begin() { _l3.setFromMatrix4(this.M); this.scl = Math.cbrt(Math.abs(this.M.determinant())); }
    /* 现成几何体：lm 为部件在父坐标系里的矩阵；col 可以是颜色，也可以是 (局部坐标, 父坐标) → 颜色 的函数 */
    add(geom, lm, col, anim) {
      this.begin();
      const P0 = geom.attributes.position, N0 = geom.attributes.normal, base = this.nv, cf = typeof col === 'function' ? col : null, ln = new T.Matrix3().getNormalMatrix(lm), a = new V3(), b = new V3();
      if (!cf) _c.set(col);
      for (let i = 0; i < P0.count; i++) {
        a.fromBufferAttribute(P0, i); const lx = a.x, ly = a.y, lz = a.z; a.applyMatrix4(lm);
        b.fromBufferAttribute(N0, i).applyMatrix3(ln).normalize();
        if (cf) _c.set(cf(lx, ly, lz, a.x, a.y, a.z));
        this.vtx(a.x, a.y, a.z, b.x, b.y, b.z, _c, anim, lx, ly, lz);
      }
      if (geom.index) { const ix = geom.index.array; for (let i = 0; i < ix.length; i++) this.idx.push(ix[i] + base); } else for (let i = 0; i < P0.count; i++) this.idx.push(base + i);
      return this;
    }
    box(x, y, z, w, h, d, col, o) { return this.add(GEO.box, loc(x, y, z, w, h, d, o), col, o && o.anim); }
    cyl(x, y, z, r, h, col, o) { return this.add(o && o.g || GEO.cyl, loc(x, y, z, r * 2 * (o && o.ex || 1), h, r * 2 * (o && o.ez || 1), o), col, o && o.anim); }
    sph(x, y, z, r, col, o) { return this.add(GEO.sph, loc(x, y, z, r * 2 * (o && o.ex || 1), r * 2 * (o && o.ey || 1), r * 2 * (o && o.ez || 1), o), col, o && o.anim); }
    /* 平面多边形（帆、旗、翅膀）：pts 为父坐标系里的点，扇形三角化 */
    poly(pts, col, anim) {
      this.begin();
      const a = new V3(...pts[0]), n = new V3().subVectors(new V3(...pts[1]), a).cross(new V3().subVectors(new V3(...pts[2]), a)).normalize(), base = this.nv;
      const cf = typeof col === 'function' ? col : null; if (!cf) _c.set(col);
      for (const p of pts) { if (cf) _c.set(cf(p[0], p[1], p[2])); this.vtx(p[0], p[1], p[2], n.x, n.y, n.z, _c, anim, p[0], p[1], p[2]); }
      for (let i = 1; i < pts.length - 1; i++) this.idx.push(base, base + i, base + i + 1);
      return this;
    }
    /* 飘动的旗：旗杆在 (x,y,z)，旗面朝 dir 方向展开，沿长度分段起伏 */
    flag(x, y, z, len, hgt, cols, o = {}) {
      const n = 5, ry = o.ry || 0, cx = Math.cos(ry), sz = Math.sin(ry), ph0 = rnd(6.28);
      const P = (u, v) => [x + cx * len * u, y - hgt * v, z - sz * len * u];
      const an = { ph: ph0, spd: o.spd || 7, sway: (px, py, pz) => { const u = Math.hypot(px - x, pz - z) / len; return [sz * 0.28 * hgt * u, 0.06 * hgt * u, cx * 0.28 * hgt * u, -u * 4.2]; } };
      for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
        const u0 = i / n, u1 = (i + 1) / n, v0 = j / 2, v1 = (j + 1) / 2;
        const col = typeof cols === 'function' ? cols((u0 + u1) / 2, (v0 + v1) / 2) : Array.isArray(cols) ? cols[Math.min(cols.length - 1, Math.floor(u0 * cols.length))] : cols;
        this.poly([P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], col, an);
      }
      return this;
    }
    mesh(mat) {
      const g = new T.BufferGeometry(), F = (a, n) => new T.Float32BufferAttribute(a, n);
      g.setAttribute('position', F(this.pos, 3)); g.setAttribute('normal', F(this.nor, 3)); g.setAttribute('color', F(this.col, 3));
      g.setAttribute('aSway', F(this.sw, 4)); g.setAttribute('aPS', F(this.ps, 3)); g.setAttribute('aHv', F(this.hv, 2)); g.setIndex(this.idx);
      const m = new T.Mesh(g, mat); m.userData.noShadow = true; return m;
    }
  }

  /* ------------------------------ 贴图 ------------------------------ */
  let _blob = null, _smoke = null, _wake = null, _ring = null;
  const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };
  const blobTex = () => _blob || (_blob = canvasTex(128, 128, (g) => {
    for (let i = 0; i < 26; i++) { const a = rnd(6.28), r = Math.pow(Math.random(), 0.7) * 34, x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r, R = rnd(12, 26), gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - R, y - R, 2 * R, 2 * R); }
  }));
  const smokeTex = () => _smoke || (_smoke = (() => { const t = canvasTex(512, 128, (g, W, H) => {     // 沿 u 方向飘散的烟：起点浓，越往后越淡越散
    for (let i = 0; i < 260; i++) { const u = Math.random(), x = u * W, y = H / 2 + rnd(-1, 1) * H * (0.1 + 0.3 * u), R = rnd(10, 22) * (0.6 + u), gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, `rgba(255,255,255,${0.2 * (1 - u * 0.75)})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - R, y - R, 2 * R, 2 * R); }
    const f = g.createLinearGradient(0, 0, W, 0); f.addColorStop(0, 'rgba(0,0,0,1)'); f.addColorStop(0.04, 'rgba(0,0,0,0)'); f.addColorStop(0.7, 'rgba(0,0,0,0)'); f.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = f; g.fillRect(0, 0, W, H);
  }); return t; })());
  const wakeTex = () => _wake || (_wake = canvasTex(256, 128, (g, W, H) => {                             // 尾迹：u=0 船尾，往后扩散变淡
    for (let i = 0; i < 500; i++) { const u = Math.random(), x = u * W, sp = 0.12 + 0.36 * u, y = H / 2 + rnd(-1, 1) * H * sp; g.fillStyle = `rgba(255,255,255,${rnd(0.1, 0.5) * (1 - u) * (1 - 0.5 * Math.abs(y - H / 2) / (H * sp))})`; g.fillRect(x, y, rnd(3, 14), rnd(1, 3)); }
  }));
  const ringTex = () => _ring || (_ring = canvasTex(128, 128, (g) => {                                    // 落水后的白沫圈
    for (let i = 0; i < 420; i++) { const a = rnd(6.28), r = 22 + Math.pow(Math.random(), 0.6) * 38, x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r; g.fillStyle = `rgba(255,255,255,${rnd(0.15, 0.6) * (1 - Math.abs(r - 44) / 40)})`; g.beginPath(); g.arc(x, y, rnd(1, 4), 0, 7); g.fill(); }
  }));

  /* ============================== 人、车、船、鸟 ============================== */
  /* 照片里 1930 年前后的送行人群：男人深色西装、鸭舌帽 / 礼帽 / 硬草帽，男孩白衬衫，女人连衣裙配钟形帽 */
  const SUIT = ['#23262d', '#2f3138', '#3a3530', '#4a4038', '#1f2a3a', '#55504a', '#3b3f33'], DRESS = ['#8a3040', '#2f5a6a', '#c8b89a', '#3a4a7a', '#8a6a8a', '#d8d0c0', '#5a7a5a', '#b9523a'], SKIN = ['#f0c8a4', '#e6b790', '#f4d2b4'];
  function person(b, x, y, z, ry, o = {}) {
    const kind = o.kind || pick(['man', 'man', 'man', 'woman', 'woman', 'boy']), k = (kind === 'boy' ? 0.72 : kind === 'woman' ? 0.94 : 1) * (o.s || 1.25);
    const wave = o.wave ?? (Math.random() < 0.72 ? (Math.random() < 0.3 ? 2 : 1) : 0), A = { ph: rnd(6.28), spd: rnd(6, 9.5), bob: o.sit ? 0 : kind === 'boy' ? rnd(0.08, 0.2) : (Math.random() < 0.15 ? 0.06 : 0) };
    const suit = kind === 'woman' ? pick(DRESS) : kind === 'boy' ? pick(['#e8e4da', '#cfd6dc', '#a89878']) : (o.suit || pick(SUIT)), skin = pick(SKIN), an = { anim: A };
    b.push(x, y, z, ry, k);
    if (!o.sit) {
      if (kind === 'woman') { b.cyl(0, 0.72, 0, 0.3, 0.7, suit, { g: GEO.frus, anim: A }); for (const s of [-1, 1]) b.box(s * 0.07, 0.2, 0, 0.08, 0.4, 0.09, '#cdb9a0', an); }
      else for (const s of [-1, 1]) b.box(s * 0.1, 0.42, 0, 0.15, 0.84, 0.17, kind === 'boy' ? '#3a3a40' : _c.set(suit).multiplyScalar(0.8).getStyle(), an);
    }
    b.box(0, 1.14, 0, kind === 'woman' ? 0.38 : 0.44, 0.62, 0.25, suit, an);
    if (kind === 'man') b.box(0, 1.3, 0.128, 0.1, 0.26, 0.012, '#e8e4da', an);
    b.sph(0, 1.6, 0, 0.13, skin, an);
    const hat = o.hat || (kind === 'man' ? pick(['cap', 'cap', 'fedora', 'boater', 'none']) : kind === 'woman' ? pick(['cloche', 'cloche', 'hair']) : pick(['cap', 'hair', 'hair']));
    if (hat === 'cap') { b.cyl(0, 1.715, 0.01, 0.15, 0.06, '#6a5f4a', an); b.box(0, 1.695, 0.14, 0.2, 0.022, 0.1, '#5a5040', an); }
    else if (hat === 'fedora') { const c = pick(['#2a2622', '#5a5046', '#3a3a40']); b.cyl(0, 1.775, 0, 0.125, 0.13, c, { g: GEO.frus, anim: A }); b.cyl(0, 1.71, 0, 0.21, 0.02, c, an); }
    else if (hat === 'boater') { b.cyl(0, 1.75, 0, 0.125, 0.09, '#e2cf9a', an); b.cyl(0, 1.71, 0, 0.21, 0.02, '#e2cf9a', an); b.cyl(0, 1.725, 0, 0.128, 0.03, '#2a2622', an); }
    else if (hat === 'cloche') { b.sph(0, 1.65, -0.01, 0.15, _c.set(suit).multiplyScalar(0.6).getStyle(), { ey: 0.85, anim: A }); }
    else if (hat === 'hair') b.sph(0, 1.64, -0.03, 0.14, pick(['#3a2a1c', '#6a4a2a', '#1c1814', '#b08a50']), { ey: 0.8, anim: A });
    const item = o.item ?? (wave ? pick(['hat', 'hanky', 'none', 'none']) : 'none');
    for (const s of [-1, 1]) {
      const up = wave === 2 || (wave === 1 && s === (A.ph > 3.14 ? 1 : -1));
      if (!up) { b.box(s * 0.27, 1.12, 0, 0.11, 0.6, 0.12, suit, an); continue; }
      const sw = { ph: A.ph, spd: A.spd, bob: A.bob, sway: (px, py) => { const w = U.clamp((py - 1.4) / 0.6, 0, 1.25); return [0.24 * w * w, 0, 0]; } };
      b.add(GEO.box, new M4().makeTranslation(s * 0.25, 1.4, 0).multiply(_m.makeRotationZ(-s * 0.3)).multiply(new M4().makeTranslation(0, 0.31, 0)).multiply(new M4().makeScale(0.1, 0.62, 0.11)), suit, sw);
      const hx = s * (0.25 + 0.19), hy = 2.02;
      b.sph(hx, hy, 0, 0.055, skin, { anim: sw });
      if (item === 'hat') b.cyl(hx, hy + 0.08, 0, 0.17, 0.05, '#4a4038', { rz: s * 0.4, anim: sw });
      else if (item === 'hanky') b.box(hx, hy + 0.12, 0, 0.2, 0.2, 0.012, '#f4f0e8', { anim: sw });
    }
    return b.pop();
  }
  /* 福特 A 型那样的方盒子轿车：双色车身、黑色挡泥板与车顶、奶油色辐条轮 */
  function car(b, x, y, z, ry, o = {}) {
    const s = o.s || 1.25, body = o.body || pick(['#b89a72', '#2f4a3a', '#6a2a2a', '#2a2a2e', '#3a4a66', '#8a8f96']), K = '#141416';
    b.push(x, y, z, ry, s);
    b.box(0, 0.42, 0, 3.5, 0.12, 1.25, K);                                            // 车架与踏板
    b.box(1.05, 0.82, 0, 1.15, 0.5, 0.82, body); b.box(1.68, 0.84, 0, 0.1, 0.62, 0.74, '#b8bcc0');        // 发动机罩、散热器罩
    if (o.truck) { b.box(-0.15, 1.12, 0, 0.95, 1.1, 1.3, body); b.box(-0.15, 1.72, 0, 1.05, 0.08, 1.38, K); b.box(-1.55, 0.72, 0, 1.9, 0.14, 1.45, '#6a5a44'); for (const sz of [-1, 1]) b.box(-1.55, 0.95, sz * 0.7, 1.9, 0.34, 0.06, '#6a5a44'); }
    else { b.box(-0.45, 1.05, 0, 1.75, 0.98, 1.3, body); b.box(-0.45, 1.58, 0, 1.85, 0.09, 1.38, K); b.box(-0.4, 1.22, 0, 1.5, 0.42, 1.32, '#1c242c'); b.box(-0.45, 1.2, 0, 0.1, 0.5, 1.33, body); b.cyl(-1.5, 0.92, 0, 0.36, 0.16, K, { rz: Math.PI / 2 }); }
    for (const sx of [1.15, -1.15]) for (const sz of [-1, 1]) {
      b.cyl(sx, 0.38, sz * 0.66, 0.38, 0.16, K, { rx: Math.PI / 2 }); b.cyl(sx, 0.38, sz * 0.7, 0.24, 0.14, '#d8cfb0', { rx: Math.PI / 2 });
      b.box(sx, 0.8, sz * 0.68, 0.95, 0.07, 0.3, K, { rz: sx > 0 ? -0.12 : 0.1 });                 // 挡泥板
    }
    for (const sz of [-1, 1]) b.sph(1.72, 0.98, sz * 0.5, 0.11, '#efe6c4');
    return b.pop();
  }
  /* 北方鲣鸟 / 银鸥 / 加拿大雁。按实物尺寸（米）建模，外面再乘放大倍数 */
  const BIRD = {
    gannet: { len: 0.95, half: 0.88, body: '#f2f1ec', head: '#e9cf8c', bill: '#8fa0aa', inner: '#f2f1ec', tip: '#17181b', tail: '#f2f1ec', amp: 0.34, neck: 0 },
    gull: { len: 0.6, half: 0.7, body: '#f2f1ec', head: '#f2f1ec', bill: '#e6b83a', inner: '#9aa3ad', tip: '#1c1d20', tail: '#f2f1ec', amp: 0.36, neck: 0 },
    goose: { len: 0.95, half: 0.82, body: '#6f6253', head: '#17181b', bill: '#17181b', inner: '#544a3e', tip: '#3a342c', tail: '#17181b', amp: 0.46, neck: 0.3 },
  };
  function bird(b, x, y, z, ry, kind, s, A) {
    const k = BIRD[kind], L = k.len, H = k.half;
    b.push(x, y, z, ry, s);
    b.sph(0, 0, 0, 0.5, (lx, ly) => ly < -0.12 && kind === 'goose' ? '#b9ad98' : k.body, { ex: L * 0.62, ey: 0.2 * L / 0.6, ez: 0.19 * L / 0.6 });
    const hx = L * 0.36 + k.neck;
    if (k.neck) b.box(L * 0.3 + k.neck / 2, 0.035, 0, k.neck + 0.1, 0.06, 0.06, k.head, { rz: 0.1 });
    b.sph(hx, 0.035 + k.neck * 0.1, 0, 0.075 * L / 0.9, k.head); if (kind === 'goose') b.box(hx - 0.01, 0.03, 0, 0.05, 0.05, 0.1, '#e8e4d8');
    b.add(GEO.cone, loc(hx + 0.11 * L, 0.03 + k.neck * 0.1, 0, 0.045, 0.16 * L, 0.045, { rz: -Math.PI / 2 }), k.bill);
    b.poly([[-L * 0.3, 0.01, -0.07], [-L * 0.3, 0.01, 0.07], [-L * 0.58, 0.01, 0.025], [-L * 0.58, 0.01, -0.025]], k.tail);
    for (const sg of [-1, 1]) {                    // 翅膀：内段、外段、翼尖三块，越往外摆得越厉害
      const W = (px, py, pz) => { const w = U.clamp((Math.abs(pz) - 0.07) / (H - 0.07), 0, 1); return [0, k.amp * H * (w + 0.4 * w * w), 0]; }, an = Object.assign({ sway: W }, A);
      const P = (cx, cy, f) => [cx, cy, sg * (0.07 + (H - 0.07) * f)];
      b.poly([P(0.14, 0.02, 0), P(0.15, 0.07, 0.42), P(-0.09, 0.06, 0.42), P(-0.14, 0.02, 0)], k.inner, an);
      b.poly([P(0.15, 0.07, 0.42), P(0.07, 0.055, 0.68), P(-0.1, 0.045, 0.68), P(-0.09, 0.06, 0.42)], kind === 'goose' ? k.tip : k.inner, an);
      b.poly([P(0.07, 0.055, 0.68), P(-0.1, 0.02, 1), P(-0.1, 0.045, 0.68)], k.tip, an);
    }
    return b.pop();
  }
  /* 船：船壳用机身同款放样；heave 让整条船（连同船上的人）一起随浪起伏 */
  function hull(b, keys, col, o = {}) { b.add(P.loft(keys, { rings: o.rings || 14, seg: o.seg || 12 }), new M4(), col); }
  function dory(b, x, z, ry, o = {}) {                         // 大浅滩平底小渔船：赭黄船身，两个人，一个划桨一个挥手
    const s = o.s || 1.6; b.heave = [0.35, rnd(6.28)]; b.push(x, 0, z, ry, s);
    const c = o.col || pick(['#c9a24a', '#c9a24a', '#e8e0cc', '#4a7a6a']);
    hull(b, [{ x: 3, y: 0.42, w: 0.06, ht: 0.3, hb: 0.3 }, { x: 1.6, y: 0.22, w: 0.6, ht: 0.34, hb: 0.42, n: 3 }, { x: 0, y: 0.16, w: 0.78, ht: 0.36, hb: 0.42, n: 3 }, { x: -1.9, y: 0.22, w: 0.62, ht: 0.34, hb: 0.38, n: 3 }, { x: -3, y: 0.42, w: 0.3, ht: 0.28, hb: 0.26 }],
      (lx, ly) => ly > 0.47 ? '#4e3a26' : ly > 0.36 ? '#2f5a44' : c);
    person(b, -0.9, 0.05, 0, Math.PI / 2 + rnd(-0.3, 0.3), { s: 1 / s * 1.45, sit: true, wave: 0, kind: 'man', hat: 'cap' });
    for (const sg of [-1, 1]) b.box(-0.5, 0.62, sg * 1.25, 0.07, 0.05, 2.3, '#b08a52', { rx: sg * 0.16, anim: { ph: b.heave[1], spd: 2.4, sway: (px, py, pz) => [0.5 * Math.abs(pz) / 2.3, 0.1 * Math.abs(pz) / 2.3, 0] } });
    person(b, 1.0, 0.1, 0, o.face ?? rnd(6.28), { s: 1 / s * 1.45, wave: 2, kind: pick(['man', 'man', 'boy']) });
    b.pop(); b.heave = [0, 0];
  }
  function schooner(b, x, z, ry, o = {}) {                     // 纽芬兰双桅纵帆渔船：前后两面斜桁帆 + 两面三角帆
    const s = o.s || 1, sail = o.sail || '#e9dfc6', hc = o.hull || pick(['#1c1e22', '#243a30', '#2a2c40']);
    b.heave = [0.45, rnd(6.28)]; b.push(x, 0, z, ry, s);
    hull(b, [{ x: 13, y: 2.0, w: 0.12, ht: 1.0, hb: 0.6 }, { x: 9, y: 1.2, w: 1.9, ht: 1.2, hb: 1.7, n: 2.6 }, { x: 0, y: 0.9, w: 2.9, ht: 1.2, hb: 1.9, n: 2.8 }, { x: -9, y: 1.1, w: 2.4, ht: 1.2, hb: 1.6, n: 2.6 }, { x: -13, y: 1.7, w: 1.2, ht: 0.9, hb: 0.8 }],
      (lx, ly) => ly > 1.95 ? '#b99a62' : ly > 1.6 ? '#e8e2d0' : ly < 0.25 ? '#7a2a22' : hc, { rings: 20, seg: 14 });
    b.box(-6.5, 2.6, 0, 3.4, 1.0, 2.6, '#d8d0bc'); b.box(-6.5, 3.15, 0, 3.7, 0.12, 2.9, '#3a3028'); b.box(2, 2.4, 0, 2, 0.6, 1.8, '#8a7250');
    b.cyl(4.5, 11.5, 0, 0.17, 19.5, '#8a6a42'); b.cyl(-3.5, 13, 0, 0.19, 22.5, '#8a6a42'); b.cyl(15.6, 2.7, 0, 0.13, 6.4, '#8a6a42', { rz: Math.PI / 2 - 0.1 });
    const sw = amp => ({ ph: rnd(6.28), spd: 2.2, sway: (px, py) => [0, 0, amp * Math.sin((py - 3) * 0.2)] });
    b.push(0, 0, 0, 0.16, 1);
    b.poly([[4.2, 3.4, 0.2], [-2.4, 3.6, 0.9], [-1.6, 15.5, 0.6], [4.2, 13.6, 0.2]], sail, sw(0.35)); b.box(1, 3.4, 0.55, 6.8, 0.18, 0.18, '#8a6a42', { ry: -0.1 });
    b.poly([[-3.8, 3.4, 0.2], [-12.6, 3.8, 1.2], [-10.4, 18.6, 0.8], [-3.8, 15.6, 0.2]], sail, sw(0.4)); b.box(-8.2, 3.5, 0.7, 9, 0.2, 0.2, '#8a6a42', { ry: -0.11 });
    b.poly([[18.6, 3.0, 0], [5.4, 3.2, 0.5], [4.6, 15.2, 0.1]], sail, sw(0.3)); b.poly([[12.4, 2.6, 0], [5.2, 3.0, 0.7], [4.6, 11.2, 0.15]], sail, sw(0.25));
    b.pop();
    b.cyl(-3.5, 25, 0, 0.05, 1.6, '#8a6a42'); b.flag(-3.5, 25.7, 0, 2.6, 1.3, o.flag || ['#c22a2a', '#c22a2a', '#e8e4da'], { ry: Math.PI });
    for (let i = 0; i < (o.crew ?? 5); i++) person(b, rnd(-11, 9), 1.95, rnd(-1.3, 1.3), o.face ?? rnd(6.28), { s: 1.45 / s, wave: i < 3 ? 2 : 1, kind: pick(['man', 'man', 'boy']) });
    b.pop(); b.heave = [0, 0];
  }
  function tug(b, x, z, ry, o = {}) {                          // 港口小汽船：黑船壳、白驾驶室、红箍黑烟囱
    const s = o.s || 1; b.heave = [0.4, rnd(6.28)]; b.push(x, 0, z, ry, s);
    hull(b, [{ x: 8, y: 1.5, w: 0.1, ht: 0.9, hb: 0.6 }, { x: 5, y: 0.9, w: 1.7, ht: 1.0, hb: 1.4, n: 2.6 }, { x: 0, y: 0.8, w: 2.3, ht: 1.0, hb: 1.5, n: 3 }, { x: -6, y: 0.9, w: 2.1, ht: 0.9, hb: 1.3, n: 3 }, { x: -8, y: 1.3, w: 1.3, ht: 0.7, hb: 0.7 }], (lx, ly) => ly > 1.7 ? '#8a7250' : ly < 0.2 ? '#7a2a22' : '#1a1c20', { rings: 16 });
    b.box(1.5, 2.6, 0, 4.4, 1.8, 2.6, '#ece6d6'); b.box(1.5, 3.56, 0, 4.8, 0.12, 3.0, '#3a3028'); b.box(2.6, 2.9, 0, 1.7, 0.5, 2.64, '#1c242c');
    b.cyl(-0.6, 5.2, 0, 0.55, 3.4, '#17181b'); b.cyl(-0.6, 5.9, 0, 0.57, 0.5, '#c8452a'); b.cyl(4.6, 5.6, 0, 0.08, 4.2, '#8a6a42');
    b.flag(-7.6, 3.6, 0, 2.2, 1.2, ['#c22a2a', '#c22a2a', '#2a3a7a'], { ry: Math.PI }); b.cyl(-7.6, 2.9, 0, 0.05, 2, '#8a6a42');
    for (let i = 0; i < 4; i++) person(b, rnd(-6, -2), 1.7, rnd(-1.2, 1.2), o.face ?? rnd(6.28), { s: 1.45 / s, wave: 2 });
    b.pop(); b.heave = [0, 0];
  }

  /* 平贴在地面上的一批矩形面片（车辙、碎石补丁）：list = [x, z, 宽, 深, 颜色]。贴图坐标取世界坐标，
     所以写实画风下铺上照片贴图后，纹理的疏密和底下的跑道一致；卡通画风下就是一块块纯色 */
  function flatQuads(list, y, photo, tile) {
    const pos = [], nor = [], uv = [], col = [], idx = [];
    list.forEach(([x, z, w, d, c], i) => {
      _c.set(c); const o = i * 4, yy = y + i * 0.0004;                  // 逐片抬高一点点，互相重叠时不闪烁
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const px = x + sx * w / 2, pz = z + sz * d / 2; pos.push(px, yy, pz); nor.push(0, 1, 0); uv.push(px / tile, pz / tile); col.push(_c.r, _c.g, _c.b); }
      idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }); m.userData.dyn = true; P.photo(m, photo, 1, 1, { s: 1 });
    const mesh = new T.Mesh(g, m); mesh.receiveShadow = true; return mesh;
  }

  /* ============================== 陆地布景（由 GFX.makeLand 调用） ============================== */
  /* o: { kind:'nf'|'ie', seaplane, hAt(x,z)→{y,m}, zOff, seaY }
     纽芬兰 Harbour Grace 的照片：光秃多石的山坡上一条碎石跑道，人群三五成群围在飞机旁；山下是白色护墙板的尖顶木屋和港湾 */
  function dressLand(grp, o) {
    const b = new Batch(), L = new Batch(), H = (x, z) => o.hAt(x, z).y, ok = (x, z) => o.hAt(x, z).m > 0.93;
    const lamp = (x, y, z, r = 0.3, c = [5, 2.6, 0.8]) => L.add(GEO.sph, loc(x, y, z, r, r, r), _c.setRGB(...c));
    const rocks = (n, x0, x1, z0, z1, s0 = 0.6, s1 = 2.2) => { for (let i = 0; i < n; i++) { const x = rnd(x0, x1), z = rnd(z0, z1); if (!ok(x, z)) continue; const s = rnd(s0, s1); b.add(GEO.rock, loc(x, H(x, z) + s * 0.2, z, s * rnd(0.8, 1.5), s * rnd(0.5, 0.9), s * rnd(0.8, 1.4), { ry: rnd(3), rz: rnd(-0.3, 0.3) }), pick(['#6e6a62', '#7d776c', '#5c5a54', '#8a8478'])); } };
    const house = (x, z, ry, w, d, h, wall, roof, lit = true) => {          // 护墙板木屋：墙、人字顶、烟囱、亮灯的窗
      if (!ok(x, z)) return; const y = H(x, z);
      b.push(x, y, z, ry, 1); b.box(0, h / 2, 0, w, h, d, wall); b.add(GEO.gable, loc(0, h, 0, w * 1.06, h * 0.62, d * 1.12), roof); b.box(w * 0.28, h * 1.45, 0, 0.9, h * 0.5, 0.9, '#6a4a3a');
      b.box(0, h * 0.36, d / 2 + 0.03, w * 0.16, h * 0.7, 0.08, '#3a2a20');
      for (const sx of [-0.3, 0.3]) { b.box(sx * w, h * 0.58, d / 2 + 0.03, w * 0.15, h * 0.3, 0.06, '#2a2a30'); if (lit && Math.random() < 0.7) { L.M.copy(b.M); L.add(GEO.box, loc(sx * w, h * 0.58, d / 2 + 0.07, w * 0.12, h * 0.25, 0.04), _c.setRGB(3.2, 2.0, 0.8)); L.M.identity(); } }
      b.pop();
    };
    const flagpole = (x, z, h, cols) => { const y = H(x, z); b.cyl(x, y + h / 2, z, 0.09, h, '#e8e4da'); b.flag(x, y + h - 0.1, z, h * 0.34, h * 0.2, cols, { ry: Math.PI }); };
    const ENSIGN = (u, v) => u < 0.42 && v < 0.5 ? '#27408b' : '#c22a2a';      // 红船旗：红底、左上角米字
    const zO = o.zOff || 0;

    if (o.kind === 'nf' && !o.seaplane) {
      /* ---- 碎石跑道：两道车辙、路肩的石块、木桩拉绳的围栏 ---- */
      const ruts = [[80, -2.2, 760, 1.0, '#6a5e4c'], [80, 2.2, 760, 1.0, '#6a5e4c']];
      for (let i = 0; i < 90; i++) ruts.push([rnd(-300, 450), rnd(-7, 7), rnd(2, 7), rnd(0.6, 2), pick(['#857a66', '#6f6452', '#8c8272'])]);
      grp.add(flatQuads(ruts, 0.105, 'gravel', 6));
      rocks(70, -320, 470, -70, -9.5); rocks(40, -320, 470, 9.5, 46); rocks(30, -330, -305, -8, 8, 0.4, 1);
      for (let x = -236; x <= 150; x += 6) { b.cyl(x, 0.55, -10.4, 0.07, 1.1, '#7a6248'); }
      b.box(-43, 0.95, -10.4, 386, 0.035, 0.035, '#c9b890');
      for (let x = -260; x < 440; x += 36) for (const z of [-9, 9]) { b.cyl(x, 0.25, z, 0.22, 0.5, '#2e2e30'); lamp(x, 0.72, z, 0.42); }     // 跑道边的火盆
      /* ---- 起飞线旁：机库棚、帐篷、油桶、加油卡车、梯子 ---- */
      const hx = -238, hz = -30, hy = H(hx, hz);
      b.push(hx, hy, hz, 0, 1); b.box(0, 3.2, 0, 22, 6.4, 15, '#8d7c64'); b.add(GEO.gable, loc(0, 6.4, 0, 23.5, 3.6, 16.4), '#3c3a3c'); b.box(0, 2.9, 7.55, 13, 5.6, 0.12, '#5a4c3c'); b.box(0, 7.3, 7.6, 7.5, 1.1, 0.1, '#e8e2d0'); b.pop();
      L.add(GEO.box, loc(hx, hy + 5.9, hz + 7.75, 1.2, 0.5, 0.2), _c.setRGB(4, 2.8, 1.2));
      b.add(GEO.cone, loc(-212, H(-212, -27) + 1.9, -27, 5.4, 3.8, 5.4), '#d9cfb4'); b.cyl(-212, H(-212, -27) + 4, -27, 0.05, 1.2, '#7a6248');                      // 钟形帐篷
      for (let i = 0; i < 14; i++) { const x = -203 + (i % 5) * 1.25 + rnd(-0.1, 0.1), z = -15.5 - Math.floor(i / 5) * 1.25; b.cyl(x, 0.75, z, 0.5, 1.4, pick(['#a03a2a', '#a03a2a', '#3a5a4a', '#8a8f96'])); b.cyl(x, 0.75, z, 0.52, 0.1, '#2a2a2c'); }
      car(b, -193, 0, -15.5, 0.2, { truck: true, body: '#3f5a46', s: 1.6 }); for (let i = 0; i < 4; i++) b.cyl(-195.9 + (i % 2) * 1.5, 1.95, -16 + Math.floor(i / 2) * 1.3, 0.55, 1.5, '#a03a2a');
      b.box(-186, 1.6, -12.6, 0.1, 3.4, 0.1, '#b08a52', { rz: 0.22 }); b.box(-185.2, 1.6, -12.6, 0.1, 3.4, 0.1, '#b08a52', { rz: 0.22 }); for (let i = 0; i < 5; i++) b.box(-185.9 + i * 0.16, 0.5 + i * 0.6, -12.6, 0.8, 0.07, 0.07, '#b08a52');
      for (let i = 0; i < 7; i++) b.box(rnd(-226, -206), 0.45, rnd(-21, -13), rnd(0.8, 1.5), 0.9, rnd(0.8, 1.3), pick(['#8a7250', '#6a5a44', '#9a8460']), { ry: rnd(1) });
      /* 新闻片摄影师：三脚架上的摇把摄影机 */
      b.push(-172, 0, -12.6, 0, 1.5); for (const a of [0, 2.1, 4.2]) b.box(Math.cos(a) * 0.22, 0.6, Math.sin(a) * 0.22, 0.04, 1.25, 0.04, '#7a6248', { rz: Math.cos(a) * 0.3, rx: -Math.sin(a) * 0.3 }); b.box(0, 1.32, 0, 0.22, 0.26, 0.4, '#1c1c1e'); b.cyl(0, 1.34, 0.26, 0.07, 0.14, '#3a3a40', { rx: Math.PI / 2 }); b.cyl(0, 1.56, -0.02, 0.13, 0.05, '#2a2a2c', { rx: Math.PI / 2 }); b.pop();
      person(b, -172.7, 0, -13.4, 0.5, { kind: 'man', wave: 0, hat: 'cap' });
      /* 风向袋、旗杆（纽芬兰自治领用的红船旗） */
      b.cyl(-150, 5, -24, 0.1, 10, '#ddd8cc'); for (let i = 0; i < 5; i++) b.cyl(-150 - 0.6 - i * 0.75, 9.6 - i * 0.07, -24, 0.52 - i * 0.07, 0.75, i % 2 ? '#f0ece0' : '#e0562a', { rz: Math.PI / 2 - 0.09, anim: { ph: i * 0.7, spd: 5, sway: () => [0, 0.05 * i, 0.09 * i] } });
      flagpole(-176, -26, 11, ENSIGN);
      /* ---- 送行的人群：靠近起飞线最密，沿围栏往前渐疏；前排是孩子 ---- */
      for (let i = 0; i < 118; i++) {
        const u = Math.pow(Math.random(), 1.7), x = -228 + u * 370, row = Math.floor(rnd(0, 3.99)), z = -11.3 - row * 1.25 - rnd(0, 0.5);
        if (x > -207 && x < -184 && row > 1) continue;
        person(b, x + rnd(-0.4, 0.4), 0, z, rnd(-0.35, 0.35) + U.clamp((-170 - x) * 0.004, -0.5, 0.5), row === 0 ? { kind: pick(['boy', 'boy', 'woman', 'man']) } : {});
      }
      for (let i = 0; i < 9; i++) person(b, rnd(-205, -186), 0, rnd(-9.6, -8.4), rnd(-0.8, 0.8), { kind: 'man', hat: 'cap', suit: pick(['#3b3f33', '#5a5040', '#2f3a4a']), wave: i < 6 ? 2 : 1 });   // 围栏里边的地勤
      for (const x of [-160, -120, -60, 10, 90]) { b.cyl(x, 1.3, -10.9, 0.04, 2.6, '#7a6248'); b.flag(x, 2.55, -10.9, 1.3, 0.8, ENSIGN, { ry: Math.PI }); }
      /* ---- 停成一排的汽车、一辆马车、土路与电线杆 ---- */
      for (let i = 0; i < 11; i++) { const x = -222 + i * 13 + rnd(-2, 2); if (Math.abs(x + 150) < 6) continue; car(b, x, H(x, -27), -27 + rnd(-1, 1), Math.PI / 2 + rnd(-0.25, 0.25), i % 5 === 3 ? { truck: true } : {}); }
      b.push(-96, H(-96, -27), -27, 0.3, 1.5); b.box(0, 0.85, 0, 2.4, 0.5, 1.2, '#7a5a3a'); for (const sx of [-0.8, 0.8]) for (const sz of [-1, 1]) b.cyl(sx, 0.55, sz * 0.68, 0.55, 0.08, '#4a3826', { rx: Math.PI / 2 });
      b.sph(2.5, 1.0, 0, 0.5, '#5a3a24', { ex: 1.8, ey: 0.85, ez: 0.6 }); b.box(3.3, 1.5, 0, 0.3, 0.8, 0.26, '#5a3a24', { rz: -0.6 }); b.sph(3.65, 1.85, 0, 0.2, '#5a3a24', { ex: 1.6 }); for (const sx of [1.9, 3.0]) for (const sz of [-1, 1]) b.box(sx, 0.4, sz * 0.2, 0.12, 0.85, 0.12, '#4a2e1c'); b.pop();
      for (let x = -330; x < 330; x += 34) { const z = -44 + Math.sin(x * 0.02) * 4, y = H(x, z); if (!ok(x, z)) continue; b.cyl(x, y + 3.6, z, 0.12, 7.2, '#5a4a38'); b.box(x, y + 6.6, z, 0.1, 0.1, 2.2, '#5a4a38'); }
      /* ---- 山下的 Harbour Grace：教堂、白色护墙板木屋 ---- */
      const cx = -30, cz = -118, cy = H(cx, cz);
      if (ok(cx, cz)) { b.push(cx, cy, cz, 0.2, 1); b.box(0, 5, 0, 22, 10, 11, '#ece8dc'); b.add(GEO.gable, loc(0, 10, 0, 23, 6.5, 12.4), '#3c3a3c'); b.box(13.5, 9, 0, 5.5, 18, 5.5, '#ece8dc'); b.add(GEO.cone, loc(13.5, 24.5, 0, 6.6, 13, 6.6, { ry: Math.PI / 4 }), '#3c3a3c');
        for (const sx of [-6, -1, 4]) { b.box(sx, 5.2, 5.56, 1.5, 4.6, 0.1, '#2a2a30'); L.M.copy(b.M); L.add(GEO.box, loc(sx, 5.2, 5.6, 1.1, 4, 0.05), _c.setRGB(3, 1.9, 0.9)); L.M.identity(); } b.pop(); }
      for (let i = 0; i < 30; i++) { const x = rnd(-330, 300), z = rnd(-250, -62), s = rnd(0.9, 1.4); house(x, z, rnd(-0.4, 0.4), 8.5 * s, 6.5 * s, 5.2 * s, pick(['#ece8dc', '#ece8dc', '#d8d0c0', '#b0483c', '#c9b27a', '#5a7890', '#e0d8b8']), pick(['#3a3a40', '#6a3028', '#2e3438'])); }
      /* ---- 海岸：灯塔、码头、出海相送的船 ---- */
      let lx = 430; while (lx < 640 && o.hAt(lx + 14, -86).m > 0.6) lx += 6;
      const ly = H(lx, -86); b.cyl(lx, ly + 7.5, -86, 2.6, 15, (px, py) => Math.abs(py) < 0.14 ? '#c22a2a' : '#f0ece0', { g: GEO.frus }); b.cyl(lx, ly + 15.8, -86, 2.3, 1.4, '#1c1e22'); b.add(GEO.cone, loc(lx, ly + 17.4, -86, 4.6, 1.8, 4.6), '#c22a2a'); lamp(lx, ly + 15.9, -86, 2.4, [9, 7, 3]);
      house(lx - 9, -90, 0.3, 8, 6, 4.6, '#ece8dc', '#6a3028');
      const sy = o.seaY;
      b.M.makeTranslation(0, sy, 0);
      schooner(b, 760, -96, Math.PI + 0.25, { face: 0 }); tug(b, 725, -46, Math.PI * 0.9, { face: 0, s: 1.1 });
      for (let i = 0; i < 8; i++) dory(b, 700 + i * 30 + rnd(-8, 8), -28 - rnd(0, 80), rnd(6.28), { face: 0 });
      b.M.identity();
    }
    if (o.kind === 'nf' && o.seaplane) {
      /* ---- 水上飞机：岸在远侧，送行的是一支船队，排在起飞水道的远侧 ---- */
      const water = (x, z) => o.hAt(x, z).y < -3.2;
      b.M.makeTranslation(0, o.seaY, 0);
      /* 起飞水道与岸之间的水面有宽有窄：逐个位置量出水面纵深，窄处放小渔船，宽处才放帆船和汽船 */
      const span = x => { let d = 0; for (let w = 12; w <= 120; w += 4) { if (!water(x, 270 - w) || !water(x + 7, 270 - w) || !water(x - 7, 270 - w)) break; d = w; } return d; };
      const shoreZ = [];
      for (let k = 0; k < 18; k++) {
        const x = -215 + k * 30 + rnd(-9, 9), D = span(x); shoreZ.push([x, D]); if (D < 20) continue;
        const f = [0.3, 0.62, 0.9][k % 3], z = 270 - (14 + f * (D - 22));
        if (D > 62 && k % 5 === 2) schooner(b, x, 270 - (D - 22), Math.PI + rnd(-0.3, 0.3), { face: 0, sail: k % 10 === 2 ? '#e9dfc6' : '#a25a34' });
        else if (D > 46 && k % 5 === 4) tug(b, x, 270 - (D - 16), rnd(-0.4, 0.4), { face: 0, s: 1.15 });
        else dory(b, x, z, rnd(-0.6, 0.6) + (k % 2 ? Math.PI : 0), { face: 0 });
        if (D > 40) dory(b, x + rnd(8, 16), 270 - rnd(13, 20), rnd(6.28), { face: 0 });
      }
      b.M.identity();
      /* 岸上：栈桥上的人群、鱼棚、灯塔、小镇 */
      for (let x = -230; x < 330; x += 3.2) { let z = 262; while (z > 120 && !(o.hAt(x, z).y > 0.25 && o.hAt(x, z).m > 0.6)) z -= 1.5; if (z > 120 && Math.random() < 0.62) person(b, x + rnd(-1, 1), o.hAt(x, z - 1.5).y, z - 1.5 - rnd(0, 2.5), rnd(-0.4, 0.4), { s: 1.5 }); }
      const pz = 85; for (let i = 0; i < 20; i++) person(b, -20 + rnd(-33, 33), 0.9, pz + rnd(-1.8, 1.8), rnd(-0.4, 0.4), { s: 1.8 });
      for (let x = -52; x <= 12; x += 8) for (const z of [pz - 2.4, pz + 2.4]) b.cyl(x, -1.5, z, 0.3, 5, '#4a3826');
      for (const x of [-50, 10]) { b.cyl(x, 2.6, pz, 0.05, 3.4, '#7a6248'); b.flag(x, 4.2, pz, 1.8, 1.1, ENSIGN, { ry: Math.PI }); }
      for (let i = 0; i < 26; i++) { const x = rnd(-330, 300), z = rnd(-150, 60) + zO * 0, s = rnd(0.9, 1.4); house(x, z, rnd(-0.4, 0.4), 8.5 * s, 6.5 * s, 5.2 * s, pick(['#ece8dc', '#ece8dc', '#d8d0c0', '#b0483c', '#c9b27a', '#5a7890']), pick(['#3a3a40', '#6a3028', '#2e3438'])); }
      for (let i = 0; i < 6; i++) { const x = -90 + i * 24, z = 62 + rnd(-6, 6); if (ok(x, z)) { b.push(x, H(x, z), z, rnd(-0.2, 0.2), 1); b.box(0, 2.2, 0, 11, 4.4, 7, pick(['#8a2f2a', '#8d7c64', '#a8a08c'])); b.add(GEO.gable, loc(0, 4.4, 0, 11.6, 2.6, 7.8), '#3c3a3c'); b.pop(); } }
      rocks(60, -340, 340, 40, 130, 0.8, 3);
      let lx = 120; const lz = 96; if (ok(lx, lz)) { const ly = H(lx, lz); b.cyl(lx, ly + 7.5, lz, 2.6, 15, (px, py) => Math.abs(py) < 0.14 ? '#c22a2a' : '#f0ece0', { g: GEO.frus }); b.cyl(lx, ly + 15.8, lz, 2.3, 1.4, '#1c1e22'); b.add(GEO.cone, loc(lx, ly + 17.4, lz, 4.6, 1.8, 4.6), '#c22a2a'); lamp(lx, ly + 15.9, lz, 2.4, [9, 7, 3]); }
    }
    if (o.kind === 'ie') {
      /* ---- 爱尔兰：Earhart 落在 Derry 郊外 Gallagher 家的牧场。照片里是穿长大衣、戴鸭舌帽的乡民围着飞机 ---- */
      const far = o.seaplane ? zO : 0;
      const cow = (x, z) => { if (!ok(x, z)) return; const c = pick(['#f4f0e8', '#2a2420', '#8a5a38']), p = pick(['#2a2420', '#f4f0e8', c]); b.push(x, H(x, z), z, rnd(6.28), 1.6);
        b.sph(0, 1.0, 0, 0.5, (lx, ly, lz) => Math.sin(lx * 9 + 1) * Math.cos(lz * 7) > 0.2 ? p : c, { ex: 1.9, ey: 0.95, ez: 0.8 }); b.box(1.05, 0.95, 0, 0.5, 0.4, 0.34, c, { rz: -0.5 }); b.box(1.32, 0.72, 0, 0.42, 0.3, 0.3, c); b.box(1.5, 0.66, 0, 0.14, 0.2, 0.26, '#d8a8a0');
        for (const sx of [-0.6, 0.6]) for (const sz of [-1, 1]) b.box(sx, 0.35, sz * 0.22, 0.14, 0.75, 0.14, c); b.box(-0.98, 0.85, 0, 0.06, 0.6, 0.06, c, { anim: { ph: rnd(6), spd: 3, sway: (px, py) => [0, 0, (1.15 - py) * 0.3] } }); b.pop(); };
      if (!o.seaplane) {
        for (let i = 0; i < 26; i++) cow(rnd(-260, 80), rnd(-64, -13));
        for (let i = 0; i < 13; i++) person(b, -66 + rnd(-16, 22), 0, rnd(-17, -10), rnd(-0.3, 0.9), { kind: pick(['man', 'man', 'boy', 'woman']), hat: 'cap', suit: pick(['#3a3530', '#4a4038', '#55504a', '#2f3138']), wave: i < 9 ? 2 : 1, s: 1.6 });
        const hx = -78, hz = -40; if (ok(hx, hz)) { const y = H(hx, hz); b.push(hx, y, hz, 0.15, 1); b.box(0, 2.2, 0, 15, 4.4, 6.5, '#f0ece0'); b.add(GEO.gable, loc(0, 4.4, 0, 15.8, 3.2, 7.6), '#b79a52'); for (const sx of [-5.5, 5.5]) b.box(sx, 7, 0, 1.1, 1.6, 1.1, '#e0dccf'); b.box(-1, 1.7, 3.3, 1.5, 3.2, 0.1, '#2f5a3a'); for (const sx of [-5, 3.5]) { b.box(sx, 2.5, 3.3, 1.4, 1.4, 0.1, '#2a2a30'); } b.pop(); }
        for (let i = 0; i < 9; i++) { const x = rnd(-170, 10), z = rnd(-58, -26); if (ok(x, z)) { b.add(GEO.frus, loc(x, H(x, z) + 1.6, z, 4.4, 3.2, 4.4), '#c9a94e'); b.add(GEO.cone, loc(x, H(x, z) + 3.9, z, 3.2, 1.6, 3.2), '#b8963e'); } }
        b.push(-30, H(-30, -22), -22, 0.6, 1.5); b.box(0, 0.85, 0, 2.4, 0.5, 1.2, '#7a5a3a'); for (const sx of [-0.8, 0.8]) for (const sz of [-1, 1]) b.cyl(sx, 0.55, sz * 0.68, 0.55, 0.08, '#4a3826', { rx: Math.PI / 2 }); b.pop();
      } else {
        b.M.makeTranslation(0, o.seaY, 0);
        for (let i = 0; i < 6; i++) { const x = -150 + i * 32 + rnd(-8, 8), z = 270 - rnd(24, 60); if (o.hAt(x, z).y < -3.2) dory(b, x, z, rnd(6.28), { face: 0 }); }
        b.M.identity();
      }
    }
    if (b.nv) grp.add(b.mesh(bodyMat()));
    if (L.nv) { const lm = L.mesh(glowMat()); lm.userData.glow = true; grp.add(lm); }
  }

  /* ============================== 途中景物 ============================== */
  const pieces = [];
  const nightK = () => 1 - U.clamp(GFX.env.keyI * (GFX.env.isSun ? 1 : 0) / 2.5, 0, 1);
  const depth = () => Math.max(4, -st.surfaceY);
  const foamCol = c => c.copy(GFX.env.hs).multiplyScalar(GFX.env.hI * 0.8).add(_c.copy(GFX.env.key).multiplyScalar(GFX.env.keyI * 0.12));
  /* 这个位置在画面里看得见吗？（画面中央被飞机自己挡着，左下角是仪表）海面上的景物只在看得见的地方"表演"并放慢经过 */
  const _pv = new V3();
  function seen(x, y, z) { _pv.set(x, y, z).project(GFX.camera); return _pv.z < 1 && Math.abs(_pv.x) < 0.96 && _pv.y < 0.94 && _pv.y > -0.94 && !(_pv.x > -0.8 && _pv.x < 0.64 && _pv.y < 0.38) && !(_pv.x < -0.3 && _pv.y < -0.4); }
  /* 远景带：海面上的东西要放多远，才会落在画面里"飞机上方、海平线下方"那一条不被机身遮挡的地方（俯角约 th 度）。
     飞得越低，它们就离得越近、看得越清楚 */
  const farZ = (th, zmin, zmax) => -U.clamp((depth() + 6) / Math.tan(th * Math.PI / 180), zmin, zmax);
  let wideK = 1;                                        // 开场页面的镜头可以随意环绕，出入场的位置要放得更远
  const farX = z => (0.82 * Math.abs(z) + 70) * wideK;           // 该距离上画面的半宽
  function piece(o) { const p = Object.assign({ g: new T.Group(), t: 0, s0: st.scroll, par: 1, vx: 0, sea: true, y: 0, xMin: -520, life: 1e9 }, o); GFX.scene.add(p.g); pieces.push(p); return p; }

  /* ---- 四烟囱邮轮（参考 1935 年的 Aquitania 与全速航行的 Mauretania）：黑船壳、白上层建筑、红底黑顶烟囱、拖着长长的煤烟 ---- */
  function liner(o = {}) {
    const b = new Batch(), L = new Batch(), SC = 1.35, z = o.z ?? farZ(9.5, 190, 760);
    const K = [{ x: 65, y: 5.4, w: 0.2, ht: 4.6, hb: 4.4 }, { x: 52, y: 4.2, w: 4.4, ht: 4.4, hb: 5.0, n: 2.4 }, { x: 30, y: 3.4, w: 7.2, ht: 4.4, hb: 5.2, n: 3.4 }, { x: -20, y: 3.2, w: 7.6, ht: 4.4, hb: 5.2, n: 4 }, { x: -50, y: 3.4, w: 6.4, ht: 4.3, hb: 4.6, n: 3.2 }, { x: -63, y: 4.2, w: 3.4, ht: 3.8, hb: 2.6, n: 2.4 }, { x: -66, y: 5.0, w: 1.2, ht: 3.2, hb: 1.2 }];
    b.add(P.loft(K, { rings: 48, seg: 18 }), new M4(), (lx, ly) => ly < 0.9 ? '#8a2a22' : ly > 7.1 ? '#f2efe6' : '#16171a');
    const W = '#f2efe6', tiers = [[-40, 37, 7.7, 10.6, 6.9], [-34, 31, 10.6, 13.2, 6.1], [-27, 23, 13.2, 15.4, 4.6]];
    for (const [x0, x1, y0, y1, hw] of tiers) {
      b.box((x0 + x1) / 2, (y0 + y1) / 2, 0, x1 - x0, y1 - y0, hw * 2, W); b.box((x0 + x1) / 2, y1 + 0.06, 0, x1 - x0 + 1.4, 0.14, hw * 2 + 0.8, '#b99a62');
      for (const sz of [-1, 1]) { b.box((x0 + x1) / 2, (y0 + y1) / 2 + 0.2, sz * (hw + 0.02), x1 - x0 - 3, 0.8, 0.06, '#27303a'); for (let x = x0 + 2.2; x < x1 - 2; x += 1.7) L.add(GEO.box, loc(x, (y0 + y1) / 2 + 0.2, sz * (hw + 0.06), 0.8, 0.55, 0.05), _c.setRGB(3.4, 2.4, 1.1)); }
    }
    b.box(27.5, 15.2, 0, 7, 4, 12.6, W); b.box(27.5, 17.3, 0, 8, 0.2, 14.4, '#b99a62'); b.box(31.05, 15.9, 0, 0.1, 1.1, 12, '#27303a');
    for (const sz of [-1, 1]) for (const y of [4.6, 6.0]) for (let x = -56; x < 54; x += 2.3) L.add(GEO.box, loc(x, y, sz * (P.halfW(K, x, y) + 0.05), 0.5, 0.42, 0.06), _c.setRGB(3.2, 2.2, 1.0));
    for (const fx of [17, 5, -7, -19]) {               // 四根烟囱略向后倾
      b.push(fx, 15.4, 0, 0, 1); const r = { rz: 0.1, ex: 1.25 };
      b.cyl(-0.45, 4.6, 0, 2.2, 9.2, '#c8452a', r); b.cyl(-1.05, 10.4, 0, 2.2, 2.6, '#141416', r); for (const y of [3, 6]) b.cyl(-0.3 - y * 0.1, y, 0, 2.24, 0.3, '#141416', r); b.pop();
    }
    b.cyl(39, 19, 0, 0.26, 27, '#b08a52', { rz: 0.07 }); b.cyl(-41, 18, 0, 0.26, 25, '#b08a52', { rz: 0.07 }); b.cyl(38.6, 22, 0, 0.8, 1.1, W);
    for (const sz of [-1, 1]) for (let i = 0; i < 9; i++) { const x = -24 + i * 5.6; b.box(x, 16.5, sz * 5.6, 4.2, 1.0, 1.4, W); b.box(x, 17.05, sz * 5.6, 4.3, 0.14, 1.5, '#7a5a3a'); }
    /* 挂满旗：船头—前桅—后桅—船尾 */
    const str = [[64, 9.5], [38.2, 32], [-41.8, 30], [-65, 9]];
    for (let s = 0; s < 3; s++) { const [xa, ya] = str[s], [xb, yb] = str[s + 1], n = Math.round(Math.hypot(xb - xa, yb - ya) / 3); for (let i = 1; i < n; i++) { const u = i / n; b.flag(U.lerp(xa, xb, u), U.lerp(ya, yb, u) - Math.sin(u * Math.PI) * 1.5, 0, 1.8, 1.25, pick(['#c22a2a', '#e8c93a', '#27408b', '#f0ece0', '#1c1e22']), { ry: Math.PI, spd: 9 }); } }
    b.cyl(-64.5, 10.2, 0, 0.07, 4.2, '#b08a52'); b.flag(-64.5, 12.2, 0, 4.4, 2.3, (u, v) => u < 0.42 && v < 0.5 ? '#27408b' : '#c22a2a', { ry: Math.PI });
    /* 甲板栏杆边挥手的乘客（朝向飞机这一侧） */
    for (let i = 0; i < 46; i++) { const k = i % 3, t = tiers[k], up = tiers[k + 1], x = up ? rnd(up[0] + 1, up[1] - 1) : rnd(t[0] + 2, t[1] - 2), z = up ? rnd(up[4] + 0.3, t[4] - 0.15) : rnd(1.5, 4); person(b, x, t[3] + 0.14, z, rnd(-0.4, 0.4), { s: 1.25, wave: Math.random() < 0.8 ? 2 : 1 }); }
    for (let i = 0; i < 10; i++) person(b, rnd(42, 60), 8.9, rnd(1.5, 3.6), rnd(-0.4, 0.4), { s: 1.25, wave: 2 });
    const g = new T.Group(), body = b.mesh(bodyMat()), glow = L.mesh(glowMat());
    g.add(body, glow); g.scale.setScalar(SC);                 // 实船 275 米；这里约 175 个单位，比飞机的比例小，但足够看清四根烟囱
    /* 煤烟：两片交叉的长条，贴图沿长度方向滚动 */
    const sg = new T.BufferGeometry(), sp = [], su = [], si = [], N = 14;
    for (let k = 0; k < 2; k++) for (let i = 0; i <= N; i++) { const u = i / N, x = 14 - u * 150, y = 28 + u * 15 + Math.sin(u * 5) * 2, w = 5 + u * 20; for (const s of [-1, 1]) { sp.push(x, y + (k ? s * w * 0.6 : 0), k ? 0 : s * w); su.push(u, s * 0.5 + 0.5); } }
    for (let k = 0; k < 2; k++) for (let i = 0; i < N; i++) { const a = k * (N + 1) * 2 + i * 2; si.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    sg.setAttribute('position', new T.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new T.Float32BufferAttribute(su, 2)); sg.setIndex(si);
    const smoke = new T.Mesh(sg, new T.MeshBasicMaterial({ map: smokeTex(), transparent: true, depthWrite: false, side: T.DoubleSide, opacity: 0.85 })); smoke.renderOrder = 6; g.add(smoke);
    /* 尾迹与船首浪 */
    const wg = new T.BufferGeometry(); wg.setAttribute('position', new T.Float32BufferAttribute([72, 0, -3, 72, 0, 3, -250, 0, -42, -250, 0, 42], 3)); wg.setAttribute('uv', new T.Float32BufferAttribute([0, 0.38, 0, 0.62, 1, 0, 1, 1], 2)); wg.setIndex([0, 2, 1, 1, 2, 3]);
    const wake = new T.Mesh(wg, new T.MeshBasicMaterial({ map: wakeTex(), transparent: true, depthWrite: false, opacity: 0.8 })); wake.position.y = 1.5; wake.renderOrder = 2; g.add(wake);
    /* 汽笛的白色蒸汽 */
    const steam = new T.Sprite(new T.SpriteMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0 })); steam.position.set(15, 30, 0); g.add(steam);
    return piece({ type: 'liner', g, z, x0: o.x0 ?? farX(z) + 120, par: 0.85, xMin: -farX(z) - 170, body, glow, smoke, wake, steam, horn: -1, honked: false,
      update(dt, p) {
        const n = nightK(); glow.material.color.setScalar(0.12 + 0.88 * U.smooth(0.25, 0.8, n)); glow.visible = n > 0.05;
        smoke.material.color.copy(GFX.env.fog).multiplyScalar(0.35).addScalar(0.035);
        foamCol(wake.material.color); g.rotation.x = Math.sin(p.t * 0.5) * 0.012;
        if (!p.honked && p.x < (o.hornX ?? farX(z) * 0.3)) { p.honked = true; p.horn = 0; onEvent('horn', p); }
        if (p.horn >= 0) { p.horn += dt; const k = p.horn % 2.1, on = p.horn < 6.3 && k < 1.5; steam.material.opacity = U.damp(steam.material.opacity, on ? 0.95 : 0, on ? 9 : 2.2, dt); const s = 5 + 9 * Math.min(1, k / 1.5); steam.scale.set(s * 1.3, s, 1); steam.position.set(15 - k * 3, 31 + k * 3.2, 0); steam.material.color.copy(GFX.env.hs).multiplyScalar(GFX.env.hI * 0.9).addScalar(0.25); if (p.horn > 9) p.horn = -1; }
      } });
  }

  /* ---- 座头鲸（参考跃身击浪的照片）：深灰背、白色带沟纹的喉腹、体长三分之一的白色长胸鳍；跃出约三分之二身长，侧身砸回水面 ---- */
  let _wet = null;
  function whaleMesh() {
    const b = new Batch();
    const K = [{ x: 14, y: 0, w: 0.5, ht: 0.5, hb: 0.6 }, { x: 12, y: -0.2, w: 1.9, ht: 1.2, hb: 1.9 }, { x: 8, y: -0.4, w: 2.9, ht: 1.9, hb: 3.0 }, { x: 3, y: -0.3, w: 3.2, ht: 2.3, hb: 3.1 }, { x: -3, y: 0, w: 2.6, ht: 2.2, hb: 2.2 }, { x: -8, y: 0.2, w: 1.3, ht: 1.4, hb: 1.1 }, { x: -11.5, y: 0.3, w: 0.45, ht: 0.7, hb: 0.5 }, { x: -13, y: 0.3, w: 0.2, ht: 0.3, hb: 0.3 }];
    b.add(P.loft(K, { rings: 30, seg: 20 }), new M4(), (lx, ly, lz) => {
      const s = P.secAt(K, lx), v = (ly - s.y) / s.hb;
      if (v < -0.28 && lx > -5) return lx > 1 && Math.abs(Math.sin(lz * 3.6)) < 0.2 ? '#8f9698' : '#eceae2';
      return v < -0.1 && lx > -5 ? '#6c7478' : '#2b3138';
    });
    for (const sg of [-1, 1]) {                                  // 长胸鳍：白色，前缘有瘤突
      b.push(7.2, -1.9, sg * 2.6, -sg * 1.99, 1);
      b.poly([[0, 0, 0.6], [1.8, -0.15, 1.0], [9.2, -1.7, 0.35], [8.6, -1.8, -0.45], [0.4, 0, -1.1]], '#edebe3');
      b.pop();
      b.poly([[-11.6, 0.35, 0], [-13.4, 0.5, sg * 2.2], [-15.6, 0.55, sg * 4.8], [-14.6, 0.4, sg * 1.2], [-14.0, 0.35, 0]], '#262c33');   // 尾叶
    }
    b.add(GEO.cone, loc(-4.2, 2.45, 0, 2.6, 1.1, 0.5, { rz: 0.35 }), '#262c33');
    for (let i = 0; i < 7; i++) b.sph(13 - i * 0.55, 0.45 + i * 0.1, (i % 2 ? 1 : -1) * 0.45, 0.16, '#3b424a');
    _wet = _wet || new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, side: T.DoubleSide });
    return b.mesh(_wet);
  }
  function whales(o = {}) {
    const g = new T.Group(), z = o.z ?? farZ(7.5, 150, 900), fx = GFX.makeFX(g, 5), pod = [];
    for (let i = 0; i < 4; i++) {
      const h = new T.Group(), m = whaleMesh(); h.rotation.order = 'YZX'; h.scale.setScalar(1.14); h.add(m); g.add(h);       // 大个体 16 米，两倍即 32 个单位
      const ring = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: ringTex(), transparent: true, depthWrite: false, opacity: 0 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 1.3; ring.renderOrder = 2; g.add(ring);
      pod.push({ h, ring, ox: i * 46 - 70 + rnd(-8, 8), oz: rnd(-30, 30), yaw: rnd(-0.5, 0.5) + (o.yaw || 0), next: 1.5 + i * 2.8, u: -1, ph: rnd(6.28), ringT: 9, splashed: false });
    }
    return piece({ type: 'whales', g, z, x0: o.x0 ?? farX(z) + 40, par: 0.8, xMin: -farX(z) - 110, fx, pod,
      dispose() { fx.dispose(); },
      update(dt, p) {
        for (const w of pod) {
          w.next -= dt; const h = w.h;
          if (w.u < 0 && w.next <= 0) { if (seen(p.x + w.ox, p.g.position.y + 8, p.z + w.oz)) { w.u = 0; w.splashed = false; onEvent('breach', p); } else w.next = 0.4; }
          if (w.u >= 0) {                              // 跃身击浪
            w.u += dt / 3.5; const u = w.u;
            const pitch = u < 0.45 ? U.lerp(1.2, 0.95, u / 0.45) : 0.95 - 1.15 * U.smooth(0.45, 0.85, u), roll = 1.8 * U.smooth(0.22, 0.8, u);
            const yc = -13.5 + 21.5 * Math.pow(Math.max(0, Math.sin(Math.PI * U.clamp(u / 0.92, 0, 1))), 0.85) - (u > 0.92 ? (u - 0.92) * 60 : 0);
            h.position.set(w.ox + Math.cos(w.yaw) * u * 7, yc, w.oz - Math.sin(w.yaw) * u * 7); h.rotation.set(roll, w.yaw, pitch);
            if (u < 0.5 && Math.random() < dt * 90) fx.emit('splash', h.position.x + rnd(-2.5, 2.5), 0.5, h.position.z + rnd(-2.5, 2.5), 2, [0, -2.5, 0]);
            if (u > 0.3 && u < 0.6 && Math.random() < dt * 50) fx.emit('drip', h.position.x + rnd(-6, 8), yc + rnd(0, 7), h.position.z + rnd(-2, 2), 1);
            if (!w.splashed && u > 0.71) { w.splashed = true; w.ringT = 0; w.ring.position.set(h.position.x + 3, 1.3, h.position.z); for (let i = 0; i < 150; i++) fx.emit('splash', h.position.x + rnd(-9, 11), 0.5, h.position.z + rnd(-5, 5), 1, [rnd(-3, 3), rnd(0, 4.5), rnd(-3, 3)]); onEvent('splash', p); }
            if (u >= 1) { w.u = -1; w.next = rnd(5, 9); }
          } else {                                       // 平时在水面换气：露出脊背，喷一股水雾
            const s = Math.sin(p.t * 0.55 + w.ph), up = Math.max(0, s);
            h.position.set(w.ox + p.t * 0.6, -3.4 + 2.5 * up, w.oz); h.rotation.set(0, w.yaw, 0.1 * Math.cos(p.t * 0.55 + w.ph));
            if (s > 0.9 && !w.blown) { w.blown = true; for (let i = 0; i < 16; i++) fx.emit('blow', h.position.x + Math.cos(w.yaw) * 8, 1.2, h.position.z - Math.sin(w.yaw) * 8, 1); } else if (s < 0) w.blown = false;
          }
          w.ringT += dt; const r = w.ring, k = w.ringT / 6; r.visible = k < 1; if (r.visible) { r.scale.setScalar(14 + 44 * Math.sqrt(k)); r.material.opacity = 0.85 * (1 - k) * Math.min(1, w.ringT * 3); foamCol(r.material.color); }
        }
      } });
  }

  /* ---- 迁徙的雁群（参考加拿大雁的人字雁阵照片：长短不一、略有起伏的两列）。为了从侧面也看得出人字，队形朝镜头略微竖起 ---- */
  function geese(o = {}) {
    const b = new Batch(), s = 2;
    const skein = (ox, oy, oz, n1, n2) => {
      for (let arm = 0; arm < 2; arm++) for (let i = arm ? 1 : 0; i < (arm ? n2 : n1); i++) {
        const j = i + rnd(-0.15, 0.15), wob = Math.sin(i * 0.5) * 1.2;
        bird(b, ox - j * 3.7, oy + (arm ? -1 : 1) * j * 1.25 + wob * 0.4, oz + (arm ? 1 : -1) * j * 1.9 + rnd(-0.5, 0.5), rnd(-0.06, 0.06), 'goose', s, { ph: rnd(6.28), spd: rnd(10.5, 12.5) });
      }
    };
    skein(0, 0, 0, 24, 15); skein(-62, 9, -24, 13, 9); skein(-30, -8, 18, 7, 9);
    const g = new T.Group(); g.add(b.mesh(bodyMat()));
    return piece({ type: 'geese', g, sea: false, y: o.y ?? 7, z: o.z ?? -64, x0: o.x0 ?? 250 * wideK, par: 0.62, xMin: -330 * wideK,
      update(dt, p) { p.g.position.y += Math.sin(p.t * 0.5) * 1.6; p.g.position.z += Math.sin(p.t * 0.31) * 3; } });
  }

  /* ---- 伴飞的海鸟：北方鲣鸟（参考照片：雪白的雪茄形身体、淡黄的头、黑色翼尖的细长翅膀），在飞机远侧结伴滑翔 ---- */
  function escort(o = {}) {
    const kind = o.kind || 'gannet', n = o.n || 7, g = new T.Group(), mat = bodyMat(), flock = [];
    for (let i = 0; i < n; i++) {
      const b = new Batch(); bird(b, 0, 0, 0, 0, kind, 2, { ph: rnd(6.28), spd: kind === 'gull' ? rnd(8, 10) : rnd(6.5, 8), glide: true });
      const m = b.mesh(mat); m.rotation.order = 'YZX'; g.add(m);
      flock.push({ m, hx: rnd(-9, 13), hy: rnd(1.5, 8.5), hz: -rnd(5, 26), ph: rnd(6.28), f: rnd(0.25, 0.5), a: rnd(1, 2.6), delay: i * 0.7 + rnd(0, 0.5) });
    }
    return piece({ type: 'escort', g, sea: false, par: 0, x0: 0, z: 0, y: 0, life: o.life || 34,
      update(dt, p) {
        for (const q of flock) {
          const t = p.t - q.delay, inn = U.smooth(0, 5, t), out = U.smooth(p.life - 7, p.life - 1, p.t + q.delay * 0.5);
          const wx = Math.sin(t * q.f + q.ph) * q.a * 2, wy = Math.sin(t * q.f * 1.3 + q.ph * 2) * q.a * 0.6, wz = Math.cos(t * q.f * 0.8 + q.ph) * q.a;
          const x = q.hx + wx - (1 - inn) * 90 - out * out * 150, y = q.hy + wy + (1 - inn) * 14 + out * 22, z = q.hz + wz - (1 - inn) * 30 - out * 60;
          const idt = 1 / Math.max(dt, 1e-3), vz = (z - (q.pz ?? z)) * idt, vy = (y - (q.py ?? y)) * idt;
          q.m.rotation.set(U.clamp(-vz * 0.3, -0.7, 0.7), out * 0.6, U.clamp(vy * 0.07, -0.4, 0.4));
          q.m.position.set(x, y, z); q.pz = z; q.py = y; q.m.visible = t > 0;
        }
      } });
  }
  /* 起飞时在岸边盘旋的海鸥 */
  function gulls(o = {}) {
    const g = new T.Group(), mat = bodyMat(), flock = [];
    for (let i = 0; i < 9; i++) { const b = new Batch(); bird(b, 0, 0, 0, 0, 'gull', 2, { ph: rnd(6.28), spd: rnd(8, 10), glide: true }); const m = b.mesh(mat); m.rotation.order = 'YZX'; g.add(m); flock.push({ m, r: rnd(12, 40), w: rnd(0.25, 0.5) * (i % 2 ? 1 : -1), ph: rnd(6.28), y: rnd(8, 30), cx: rnd(-30, 30), cz: rnd(-25, 20) }); }
    return piece({ type: 'gulls', g, sea: true, y: 0, z: o.z ?? -70, x0: o.x0 ?? 260 * wideK, par: 1, xMin: -420 * wideK,
      update(dt, p) { for (const q of flock) { const a = p.t * q.w + q.ph; q.m.position.set(q.cx + Math.cos(a) * q.r, q.y + Math.sin(a * 1.7) * 2.5, q.cz + Math.sin(a) * q.r); q.m.rotation.set(-Math.sign(q.w) * 0.45, -a - Math.sign(q.w) * Math.PI / 2, 0); } } });
  }

  /* ---- 大浅滩上的渔船队：两条双桅纵帆船带着一群平底小渔船，渔民朝天上挥手 ---- */
  function fleet(o = {}) {
    const b = new Batch(), d = depth(), z = o.z ?? -U.clamp(d * 1.3 + 50, 70, 190);
    schooner(b, 40, -34, Math.PI + 0.2, { face: 0, sail: o.sail }); schooner(b, -70, 14, Math.PI - 0.15, { face: 0, sail: o.sail, s: 0.9 });
    for (let i = 0; i < 8; i++) dory(b, -130 + i * 36 + rnd(-10, 10), rnd(-40, 42), rnd(6.28), { face: 0 });
    const g = new T.Group(); g.add(b.mesh(bodyMat()));
    return piece({ type: 'fleet', g, z, x0: o.x0 ?? 330 * wideK, linger: [0.32, 1.1], xMin: -380 * wideK });
  }

  /* ---- 冰山：五月的纽芬兰外海正是冰山季 ---- */
  function bergs(o = {}) {
    const b = new Batch(), z = o.z ?? farZ(7, 260, 900);
    const h3 = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };
    for (let k = 0; k < 3; k++) {
      const geo = new T.IcosahedronGeometry(1, 2), p = geo.attributes.position, sd = k * 7.3;
      for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i); const q = _v.clone().multiplyScalar(1.7).addScalar(sd), r = 0.62 + 0.75 * (0.6 * h3(Math.round(q.x * 1.2), Math.round(q.y * 1.2), Math.round(q.z * 1.2)) + 0.4 * h3(Math.round(q.x * 3), Math.round(q.y * 3), Math.round(q.z * 3))); _v.multiplyScalar(r); _v.y = Math.max(_v.y * (0.75 + 0.6 * h3(Math.round(q.x), 1, Math.round(q.z))), -0.12); p.setXYZ(i, _v.x, _v.y, _v.z); }
      geo.computeVertexNormals();
      const s = [1, 0.55, 0.36][k] * rnd(44, 60);
      b.add(geo, loc([0, 150, -120][k] + rnd(-20, 20), 0, [0, -70, 60][k], s * rnd(1, 1.5), s * rnd(0.55, 0.9), s * rnd(0.8, 1.1), { ry: rnd(6.28) }), (lx, ly) => ly < 0.02 ? '#7fd0dc' : ly < 0.16 ? '#c4e6ee' : '#f4f8fb');
    }
    const bm = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, flatShading: true, emissive: 0x1a3040, emissiveIntensity: 0.5 }); bm.userData.dyn = true;
    const g = new T.Group(); g.add(b.mesh(bm));
    return piece({ type: 'bergs', g, z, x0: o.x0 ?? farX(z) + 230, par: 1, xMin: -farX(z) - 280 });
  }

  /* ---- 海豚群（参考真海豚跃出水面的照片：深灰的背、前半身一块米黄的沙漏斑、灰色的后胁、白肚皮、镰刀形背鳍、细长的喙）。
        远看就是照片里那样：一长串此起彼伏的深色弧线，拖着白色水花。整群用实例化渲染，只占一次绘制调用 ---- */
  let _dolGeo = null;
  function dolphinGeo() {
    if (_dolGeo) return _dolGeo;
    const b = new Batch(), K = [{ x: 3, y: 0, w: 0.05, ht: 0.06 }, { x: 2.5, y: 0.02, w: 0.15, ht: 0.14 }, { x: 2.15, y: 0.1, w: 0.4, ht: 0.42, hb: 0.36 }, { x: 1, y: 0.1, w: 0.6, ht: 0.62, hb: 0.6 }, { x: -0.6, y: 0.08, w: 0.5, ht: 0.52, hb: 0.5 }, { x: -2, y: 0.02, w: 0.18, ht: 0.24, hb: 0.2 }, { x: -2.75, y: 0, w: 0.05, ht: 0.1 }];
    b.add(P.loft(K, { rings: 18, seg: 12 }), new M4(), (lx, ly) => { const s = P.secAt(K, lx), v = (ly - s.y) / (ly > s.y ? s.ht : s.hb); return v > 0.2 ? '#33404e' : v < -0.45 ? '#eef0ee' : lx > 0.1 ? '#cdb884' : '#9aa5ad'; });
    b.poly([[0.35, 0.66, 0], [-0.25, 1.42, 0], [-0.7, 0.6, 0]], '#33404e');
    for (const sg of [-1, 1]) { b.poly([[1.5, -0.25, sg * 0.45], [0.75, -0.75, sg * 1.0], [0.95, -0.3, sg * 0.5]], '#33404e'); b.poly([[-2.6, 0, 0], [-3.2, 0.04, sg * 0.85], [-2.95, 0, 0]], '#33404e'); }
    return (_dolGeo = b.mesh(new T.MeshBasicMaterial()).geometry);
  }
  function dolphins(o = {}) {
    const N = o.n || 24, g = new T.Group(), z = o.z ?? farZ(9.5, 110, 640), fx = GFX.makeFX(g, 1.9);
    _wet = _wet || new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, side: T.DoubleSide });
    const im = new T.InstancedMesh(dolphinGeo(), _wet, N); im.frustumCulled = false; g.add(im);
    const pod = Array.from({ length: N }, (_, i) => ({ x: (i / N - 0.5) * 210 + rnd(-7, 7), z: rnd(-36, 36), ph: Math.random(), T: rnd(1.9, 2.7), yaw: rnd(-0.2, 0.2), s: rnd(0.85, 1.12), air: false }));
    const m = new M4(), q = new T.Quaternion(), e = new T.Euler(0, 0, 0, 'YZX'), sc = new V3(), pos = new V3();
    return piece({ type: 'dolphins', g, z, x0: o.x0 ?? farX(z) + 120, par: 0.72, xMin: -farX(z) - 170, fx, dispose() { fx.dispose(); },
      update(dt, p) {
        for (let i = 0; i < N; i++) {
          const d = pod[i], u = (p.t / d.T + d.ph) % 1, air = u < 0.42, a = u / 0.42;             // 每个周期前四成腾空划一道弧，其余时间潜在水下
          pos.set(d.x + (air ? (a - 0.5) * 7.5 * d.s : 0), air ? Math.sin(Math.PI * a) * 3.4 * d.s - 0.4 : -3, d.z);
          im.setMatrixAt(i, m.compose(pos, q.setFromEuler(e.set(0, d.yaw, air ? Math.cos(Math.PI * a) * 0.95 : 0)), sc.setScalar(air ? d.s : 0.001)));
          if (air !== d.air) { d.air = air; fx.emit('splash', d.x + (air ? -3.5 : 3.5) * d.s, 0.3, d.z, 5, [air ? 1.5 : -1, -3.2, 0]); }
        }
        im.instanceMatrix.needsUpdate = true;
      } });
  }

  const MAKE = { liner, whales, dolphins, geese, escort, gulls, fleet, bergs };
  function spawn(type, o) { return MAKE[type] ? MAKE[type](o || {}) : null; }
  function remove(p) { GFX.scene.remove(p.g); if (p.dispose) p.dispose(); p.g.traverse(q => { if (q.geometry) q.geometry.dispose(); if (q.material && q.material.userData.dyn) q.material.dispose(); }); pieces.splice(pieces.indexOf(p), 1); }
  function clear() { pieces.slice().forEach(remove); sched = {}; amb.warm = false; amb.t = 0; }

  /* 开场页面（标题、机库）没有航程进度可依：随机地、更密地出景物，同时最多十一组。
     这里的镜头不像飞行时那样被机身挡住中间，所以放得比飞行中近，看得更清楚；多数在镜头默认朝向的那一侧（-z），少数在另一侧，转动镜头时也有东西看。
     [种类, 权重, 同时最多几组, 参数] —— 参数里的 z 是到飞机的水平距离范围 */
  const amb = { t: 0, warm: false };
  const AMB = [
    ['liner', 2.2, 1, { z: [380, 760] }], ['whales', 3, 2, { z: [100, 300] }], ['dolphins', 4, 3, { z: [95, 280] }], ['fleet', 2, 1, { z: [150, 300] }], ['bergs', 1.2, 1, { z: [500, 900] }],
    ['geese', 3.5, 3, { z: [40, 130], y: [-8, 10] }], ['escort', 2.6, 2, {}], ['gulls', 1.6, 1, { z: [100, 240] }],
  ];
  function ambSpawn(warm) {
    const ok = AMB.filter(a => pieces.filter(p => p.type === a[0]).length < a[2]); if (!ok.length) return;
    let r = Math.random() * ok.reduce((s, a) => s + a[1], 0), a = ok[0]; for (const q of ok) { r -= q[1]; if (r <= 0) { a = q; break; } }
    const o = {}, side = Math.random() < 0.78 ? -1 : 1;
    if (a[3].z) o.z = side * rnd(a[3].z[0], a[3].z[1]); if (a[3].y) o.y = rnd(a[3].y[0], a[3].y[1]);
    if (a[0] === 'escort') Object.assign(o, { kind: Math.random() < 0.6 ? 'gannet' : 'gull', n: 4 + Math.floor(rnd(0, 5)), life: rnd(26, 40) });
    if (a[0] === 'dolphins') o.n = 14 + Math.floor(rnd(0, 12));
    if (a[0] === 'fleet' && Math.random() < 0.5) o.sail = '#a25a34';
    wideK = 1.6; const p = spawn(a[0], o); wideK = 1;
    if (p && warm && p.par) p.x = U.lerp(p.x0, p.xMin, rnd(0.45, 0.85));         // 刚进页面时的那几组已经走进画面（默认镜头看的是飞机左后方的海面），不用干等
  }
  function ambient(dt) {
    if (-st.surfaceY < 20) return;                                               // 还没有高度（第一帧）
    if (!amb.warm) { amb.warm = true; for (let i = 0; i < 7; i++) ambSpawn(true); amb.t = rnd(1.5, 3); return; }
    amb.t -= dt; if (amb.t > 0 || pieces.length >= 11) return;
    amb.t = rnd(2, 4.5); ambSpawn(false);
  }

  /* 航程上的出场顺序：[进度, 种类, 参数]。风暴里什么都不出 */
  const PLAN = [
    [0.012, 'gulls'], [0.03, 'escort', { kind: 'gull', n: 5, life: 24 }], [0.058, 'fleet'], [0.076, 'dolphins'], [0.09, 'bergs'], [0.12, 'geese'], [0.158, 'whales'], [0.192, 'liner'], [0.3, 'escort', { n: 5, life: 26 }],
    [0.8, 'liner', { hornX: 60 }], [0.862, 'whales'], [0.884, 'dolphins'], [0.902, 'geese', { y: 8 }], [0.928, 'fleet', { sail: '#a25a34' }], [0.95, 'escort', { n: 8, life: 44 }], [0.962, 'dolphins', { n: 16 }],
  ];
  let sched = {};
  function director(p) { PLAN.forEach((e, i) => { if (!sched[i] && p >= e[0]) { sched[i] = 1; if (p < e[0] + 0.02 && st.storm < 0.25) spawn(e[1], e[2]); } }); }
  function update(dt) {
    uT.value = st.time;
    for (const p of pieces.slice()) {
      p.t += dt; const ds = st.scroll - (p.sp ?? st.scroll), sy = p.sea ? st.surfaceY - st.seaDrop + p.y : p.y; p.sp = st.scroll;
      if (p.x === undefined) p.x = p.x0;
      if (p.linger) p.parE = U.damp(p.parE ?? p.linger[0], seen(p.x, sy + 6, p.z) ? p.linger[0] : p.linger[1], 2.5, dt);
      p.x += p.vx * dt - ds * (p.linger ? p.parE : p.par);
      p.g.position.set(p.x, sy, p.z);
      if (p.update) p.update(dt, p);
      if (p.x < p.xMin || p.t > p.life) remove(p);
    }
  }
  /* 陆地上的灯火：入夜渐亮 */
  function glow(grp) { const n = nightK(); grp.traverse(m => { if (m.userData.glow) m.material.color.setScalar(0.25 + 0.75 * U.smooth(0.1, 0.7, n)); }); }

  return { dressLand, spawn, update, clear, director, ambient, glow, pieces, set onEvent(f) { onEvent = f; }, Batch };
})();

/* 照片参考（Wikimedia Commons）
   · 机场与人群：File:Rear_view_of_the_"Southern_Cross"_airplane_at_Harbour_Grace.jpg、File:Amelia_Earhart_and_group.jpg、
     File:Amelia_Earhart_at_Derry.jpg、File:Lockheed_Vega_5B_of_Amelia_Earhart_c1932.jpg、File:Harbour_grace1_550.jpg、File:Ford_A_Tudor_Sedan,_1930.jpg
   · 邮轮：File:Aquitania_near_Southampton,_1935.jpg、File:Mauretania_-_Full_speed_ahead_(5609324995).jpg
   · 渔船：File:FMIB_34011_Newfoundland_Fishing-Schooners.jpeg
   · 座头鲸：File:001_Humpback_whale_breaching_in_Ballena_Marine_National_Park_Photo_by_Giles_Laurent.jpg、File:026b_Humpback_whale_jump_and_splash_Photo_by_Giles_Laurent.jpg
   · 鲣鸟 / 海鸥 / 雁阵：File:Northern_gannet_(Morus_bassanus)_in_flight_Strangford.jpg、File:Northern_gannet_in_flight,_Lummenfelsen,_Heligoland,_Germany.jpg、
     File:Seagull_flying_(4).jpg、File:Canada_Geese_(Branta_canadensis)_in_Flight_-_Saskatoon_01.jpg
   · 冰山：File:Iceberg_of_Salvage,_NL.jpg
   · 海豚：File:Leap_For_It_(27359678360)_(cropped).jpg、File:Pod_of_common_dolphins_leaping_above_water_-_DPLA_-_66e901d0b5b377ff605032699858408a.jpg */
