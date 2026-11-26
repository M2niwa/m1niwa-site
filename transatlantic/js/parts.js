'use strict';
/* =========================================================================
   parts.js — 程序化建模零件库：剖视裁切、机身放样、翼型机翼、发动机、机组、舱内设备
   坐标：+x 机头，+y 上，+z 右舷（朝向镜头）。原点 = 客舱地板中心。
   ========================================================================= */
const P = (() => {
  const T = THREE, V3 = T.Vector3;

  /* ---------------- 剖视：五个裁切面围成的“被掀开”的盒形区域 ---------------- */
  const planes = [0, 1, 2, 3, 4].map(() => new T.Plane(new V3(0, 1, 0), 1e6));
  const local = [0, 1, 2, 3, 4].map(() => new T.Plane(new V3(0, 1, 0), 1e6));
  function setCut(c) {
    if (!c) { local.forEach(p => p.set(new V3(0, 1, 0), 1e6)); hi4.set(new V3(0, 1, 0), 1e6); cutOn = false; return; }
    local[0].set(new V3(-1, 0, 0), c.x0); local[1].set(new V3(1, 0, 0), -c.x1);
    local[2].set(new V3(0, 0, -1), c.z0); local[3].set(new V3(0, 0, 1), -c.z1);
    const n = new V3(0, -1, -c.s), l = n.length(); local[4].set(n.divideScalar(l), c.y / l); hi4.set(n, (c.y + (c.hi ?? 0.5)) / l); cutOn = true;
  }
  /* 第二组裁切面：比主切面高出一截，用于隔框/桁条/舱壁，让骨架只露出一小段 */
  const planesHi = [0, 1, 2, 3, 4].map(() => new T.Plane(new V3(0, 1, 0), 1e6)), hi4 = new T.Plane(new V3(0, 1, 0), 1e6);
  /* 近侧机翼的“幽灵蒙皮”：只在剖视开启时、舱壁以外显示 */
  let ghosts = [], cutOn = false; const gTmp = new T.Plane();
  function ghost(color, zg) {
    const pl = new T.Plane(new V3(0, 0, 1), -1e6); ghosts.push({ pl, zg });
    return new T.MeshStandardMaterial({ color, roughness: 0.5, transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide, clippingPlanes: [pl], polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  }
  function resetGhosts() { ghosts = []; }
  function updateCut(m) {
    for (const g of ghosts) g.pl.copy(gTmp.set(gTmp.normal.set(0, 0, 1), cutOn ? -g.zg : -1e6)).applyMatrix4(m);
    for (let i = 0; i < 5; i++) { planes[i].copy(local[i]).applyMatrix4(m); planesHi[i].copy(i < 4 ? local[i] : hi4).applyMatrix4(m); }
  }
  function clip(mat) { mat.clippingPlanes = planes; mat.clipIntersection = true; mat.clipShadows = true; return mat; }
  function clipHi(mat) { mat.clippingPlanes = planesHi; mat.clipIntersection = true; mat.clipShadows = true; return mat; }

  /* -------------------------------- 材质 -------------------------------- */
  const std = (color, rough = 0.7, metal = 0, ex) => new T.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, ex));
  const lacquer = (color, ex) => new T.MeshPhysicalMaterial(Object.assign({ color, roughness: 0.4, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.34 }, ex));
  const M = {
    steel: std(0x8c9096, 0.42, 0.85), dark: std(0x1b1c20, 0.55, 0.5), black: std(0x0c0c0e, 0.8), rubber: std(0x131313, 0.92),
    alu: std(0xcfd4da, 0.34, 0.92), brass: std(0xc9a14e, 0.32, 0.92), copper: std(0xb06a3a, 0.4, 0.9), wood: std(0x8a5a32, 0.72), woodLight: std(0xb98a52, 0.7),
    woodDark: std(0x4f3018, 0.75), leather: std(0x5a3520, 0.62), canvas: std(0xb9ab8a, 0.92), rust: std(0x4a342a, 0.7, 0.55), cream: std(0xe9dcc0, 0.8),
    red: std(0xb3202a, 0.5), ice: std(0xdff2ff, 0.18, 0, { emissive: 0x4a7aa0, emissiveIntensity: 0.35 }),
    glass: clip(new T.MeshPhysicalMaterial({ color: 0x9cc3d8, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.26, envMapIntensity: 1.8, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })),
    frame: std(0x9aa0a8, 0.5, 0.7),
  };
  const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); return o; };
  function tex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }

  /* ---------------- 程序化细节贴图：由高度场求法线，另配粗糙度贴图（512²，可平铺，按需生成并缓存） ---------------- */
  const DN = 512, detCache = {}, detMats = new Set(); let detOn = true;
  const hsh = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  function tn(x, y, px, py) {            // 可平铺的值噪声：x,y ∈ [0,1)，px/py 为两个方向的格数
    x *= px; y *= py; const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const w = (a, b) => hsh(((a % px) + px) % px + px * 3.1, ((b % py) + py) % py + py * 7.3);
    return U.lerp(U.lerp(w(ix, iy), w(ix + 1, iy), sx), U.lerp(w(ix, iy + 1), w(ix + 1, iy + 1), sx), sy);
  }
  const TAU = Math.PI * 2, fr = v => v - Math.floor(v);
  /* 各种表面的高度场 h 与粗糙度系数 r（写入 o[0], o[1]）；最后一项是法线强度 */
  const DET = {
    rib: [(x, y, o) => {                 // 蒙布机翼：翼肋处绷起、肋间微陷，肋上有包带和缝线，表面是布纹。一个平铺单元 = 一个肋距（肋在 x=0.5）
      const d = Math.abs(x - 0.5) * 2, wv = (Math.abs(Math.sin(Math.PI * x * 40)) + Math.abs(Math.sin(Math.PI * y * 40))) * 0.5 - 0.64;
      let h = 0.5 * Math.pow(1 - d, 1.7) + 0.009 * wv + 0.05 * tn(x, y, 4, 4);
      if (d < 0.09) h += 0.1 * Math.cos(d / 0.09 * Math.PI / 2);
      if (d < 0.035 && Math.abs(fr(y * 14) - 0.5) < 0.16) h += 0.09;
      o[0] = h; o[1] = 0.84 + 0.05 * wv + 0.1 * tn(x, y, 6, 6);
    }, 9],
    cloth: [(x, y, o) => {               // 蒙布机身：布纹 + 轻微起伏 + 顺着机身的桁条印
      const wv = (Math.abs(Math.sin(Math.PI * x * 48)) + Math.abs(Math.sin(Math.PI * y * 48))) * 0.5 - 0.64, dy = Math.abs(fr(y * 4) - 0.5);
      o[0] = 0.008 * wv + 0.22 * tn(x, y, 5, 5) + 0.16 * Math.exp(-dy * dy * 900); o[1] = 0.86 + 0.05 * wv + 0.08 * tn(x, y, 7, 7);
    }, 7],
    ply: [(x, y, o) => {                 // 层板：顺纹木纹、板缝、轻微翘曲
      const g = tn(x, y, 3, 64), e = Math.min(x, 1 - x);
      o[0] = 0.13 * g + 0.05 * tn(x, y, 8, 128) + 0.12 * tn(x, y, 2, 2) - (e < 0.006 ? 0.45 * (1 - e / 0.006) : 0); o[1] = 0.66 + 0.3 * g;
    }, 8],
    metal: [(x, y, o) => {               // 铆接铝板：每块板轻微鼓凹（油罐效应）、板缝、沿缝铆钉、拉丝划痕
      const px = fr(x * 2), py = fr(y * 2), id = Math.floor(x * 2) + Math.floor(y * 2) * 2, dx = Math.min(px, 1 - px) / 2, dyv = Math.min(py, 1 - py) / 2, e = Math.min(dx, dyv);
      let h = (hsh(id, 3.7) - 0.5) * 0.36 * Math.sin(Math.PI * px) * Math.sin(Math.PI * py) + 0.03 * tn(x, y, 4, 200);
      if (e < 0.006) h -= 0.35 * (1 - e / 0.006);
      const rv = (a, t) => { const q = Math.hypot(a - 0.022, (fr(t * 32) - 0.5) / 32) / 0.0075; return q < 1 ? 0.3 * (1 - q * q) : 0; };
      h += Math.max(rv(dx, y), rv(dyv, x));
      o[0] = h; o[1] = 0.58 + 0.26 * tn(x, y, 4, 160) + 0.14 * hsh(id, 9.1);
    }, 11],
    paint: [(x, y, o) => { o[0] = 0.06 * tn(x, y, 48, 48) + 0.04 * tn(x, y, 96, 96) + 0.1 * tn(x, y, 3, 3); o[1] = 0.72 + 0.26 * tn(x, y, 5, 5); }, 5],
    leather: [(x, y, o) => { const n = tn(x, y, 40, 40); o[0] = 0.28 * Math.abs(n - 0.5) * 2 + 0.1 * tn(x, y, 90, 90); o[1] = 0.7 + 0.28 * n; }, 9],
    planks: [(x, y, o) => {              // 地板：八条木板、板缝、对接缝、木纹
      const k = Math.floor(y * 8), py = fr(y * 8), g = tn(x, fr(y + k * 0.37), 3, 96);
      o[0] = 0.14 * g - (py < 0.04 ? 0.6 : 0) - (Math.abs(x - hsh(k, 1.3)) < 0.004 ? 0.5 : 0); o[1] = 0.78 + 0.2 * g;
    }, 11],
  };
  function detTex(kind) {
    if (detCache[kind]) return detCache[kind];
    const [f, k] = DET[kind], N = DN, Hh = new Float32Array(N * N), Rr = new Float32Array(N * N), o = [0, 0];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { f(x / N, y / N, o); Hh[y * N + x] = o[0]; Rr[y * N + x] = o[1]; }
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
    const cn = mk(), cr = mk(), gn = cn.getContext('2d'), gr = cr.getContext('2d'), dn = gn.createImageData(N, N), dr = gr.createImageData(N, N), M1 = N - 1;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, nx = (Hh[y * N + ((x - 1) & M1)] - Hh[y * N + ((x + 1) & M1)]) * k, ny = (Hh[((y + 1) & M1) * N + x] - Hh[((y - 1) & M1) * N + x]) * k, il = 1 / Math.hypot(nx, ny, 1);
      dn.data[i * 4] = (nx * il * 0.5 + 0.5) * 255; dn.data[i * 4 + 1] = (ny * il * 0.5 + 0.5) * 255; dn.data[i * 4 + 2] = (il * 0.5 + 0.5) * 255; dn.data[i * 4 + 3] = 255;
      const rv = U.clamp(Rr[i], 0, 1) * 255; dr.data[i * 4] = dr.data[i * 4 + 1] = dr.data[i * 4 + 2] = rv; dr.data[i * 4 + 3] = 255;
    }
    gn.putImageData(dn, 0, 0); gr.putImageData(dr, 0, 0);
    const tx = c => { const t = new T.CanvasTexture(c); t.colorSpace = T.NoColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; return t; };
    return (detCache[kind] = { n: tx(cn), r: tx(cr) });
  }
  /* 给材质挂上细节贴图。rx/ry 为平铺次数，s 为法线强度，ox 为横向偏移 */
  function detail(mat, kind, rx = 1, ry = 1, s = 1, ox = 0) {
    const d = detTex(kind), n = d.n.clone(), r = d.r.clone();
    for (const t of [n, r]) { t.repeat.set(rx, ry); t.offset.x = ox; t.needsUpdate = true; }
    mat.normalMap = n; mat.roughnessMap = r; mat.roughness = Math.min(1, mat.roughness * 1.22); mat.userData.ns = s;
    mat.normalScale.set(detOn ? s : 0, detOn ? s : 0); detMats.add(mat); mat.needsUpdate = true;
    return mat;
  }
  function setDetail(on) { detOn = on; for (const m of detMats) { const s = on ? m.userData.ns : 0; m.normalScale.set(s, s); } for (const [m, i] of phMats) applyPhoto(m, i); phSubs.forEach(f => f()); }

  /* ---------------- 真实贴图（ambientCG，CC0；来源与许可见 tex/CREDITS.md） ----------------
     照片贴图都预处理成了"倍率图"：颜色 ÷ 平均色 × k，粗糙度 ÷ 平均值 × 0.75。所以底色和粗糙度仍由这里的材质参数决定
     （用的时候乘回 1/k、1/0.75），照片只带来真实的纹理变化。
     只在"写实材质"画风下启用；卡通描边、直接双击打开（file://）、或图片没加载到时，一律退回程序化贴图。?notex=1 可强制关闭 */
  const PHK = { grass: 0.45, gravel: 0.45, rock: 0.45, floor: 1, wood: 0.7, leather: 0.8, plates: 0.8, fabric: 0.8 }, PHR = 0.75;
  const PH = {}, phMats = new Map(), phSubs = [];
  function loadPhotos() {
    if (typeof location === 'undefined' || location.protocol === 'file:' || /[?&]notex=1/.test(location.search)) return;
    const L = new T.TextureLoader();
    const one = (url, srgb) => new Promise((ok, bad) => L.load(url, t => { t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; ok(t); }, undefined, bad));
    const ready = k => { for (const [m, i] of phMats) if (i.name === k) applyPhoto(m, i); phSubs.forEach(f => f(k)); };
    for (const k in PHK) Promise.all([one('tex/' + k + '_c.jpg', true), one('tex/' + k + '_n.jpg'), one('tex/' + k + '_r.jpg')]).then(([c, n, r]) => { PH[k] = { c, n, r, k: PHK[k] }; ready(k); }).catch(() => { /* 保持程序化贴图 */ });
    one('tex/water_n.jpg').then(n => { PH.water = { n }; ready('water'); }).catch(() => { });
  }
  /* 给材质登记一套照片贴图。rx/ry 为平铺次数。o.c / o.n / o.r = false：这一项不换，保留原来的；o.s：法线强度；
     o.tint：写实画风下的底色（原来底色画在贴图里的材质用）；o.mk(ph)：自己生成颜色贴图（把照片叠进程序化贴图里） */
  function photo(mat, name, rx = 1, ry = 1, o = {}) {
    trackPhoto(mat, { name, rx, ry, o, t: null, proc: { map: mat.map, normalMap: mat.normalMap, roughnessMap: mat.roughnessMap, color: mat.color.clone(), roughness: mat.roughness, ns: mat.userData.ns || 0 } });
    return mat;
  }
  function trackPhoto(mat, info) {
    phMats.set(mat, info); applyPhoto(mat, info);
    mat.clone = function () { const c = Object.getPrototypeOf(this).clone.call(this); trackPhoto(c, info); return c; };      // 克隆出来的材质（双面、另一组裁切面）跟着一起切换
  }
  function applyPhoto(mat, info) {
    const p = PH[info.name], on = detOn && !!p, o = info.o, q = info.proc;
    if (on && !info.t) {
      info.t = {};
      for (const ch of ['c', 'n', 'r']) {
        if (o[ch] === false) continue;
        const t = ch === 'c' && o.mk ? o.mk(p) : p[ch].clone();
        if (!(ch === 'c' && o.mk)) { t.repeat.set(info.rx, info.ry); t.needsUpdate = true; }
        info.t[ch] = t;
      }
    }
    const t = on ? info.t : {}, had = [mat.map, mat.normalMap, mat.roughnessMap].map(Boolean).join();
    mat.map = t.c || q.map; mat.normalMap = t.n || q.normalMap; mat.roughnessMap = t.r || q.roughnessMap;
    if (on && o.tint != null) mat.color.set(o.tint); else mat.color.copy(q.color);
    if (t.c) mat.color.multiplyScalar(1 / p.k);
    mat.roughness = t.r ? (q.roughnessMap ? q.roughness / 1.22 : q.roughness) / PHR : q.roughness;
    const s = detOn ? (t.n ? o.s ?? 1 : q.ns) : 0; mat.normalScale.set(s, s);
    if (had !== [mat.map, mat.normalMap, mat.roughnessMap].map(Boolean).join()) mat.needsUpdate = true;
  }
  detail(M.leather, 'leather', 2, 2, 0.8); detail(M.wood, 'ply', 1, 1, 0.5); detail(M.woodLight, 'ply', 1, 1, 0.5); detail(M.canvas, 'cloth', 3, 3, 0.6);
  photo(M.leather, 'leather', 2, 2, { s: 0.9 }); photo(M.wood, 'wood', 1, 1, { s: 0.8 }); photo(M.woodLight, 'wood', 1, 1, { s: 0.8 }); photo(M.woodDark, 'wood', 1, 1, { s: 0.8 }); photo(M.canvas, 'fabric', 3, 3, { s: 0.7 });
  loadPhotos();

  /* ----------------------------- 机身放样 ----------------------------- */
  const prepCache = new WeakMap();
  function prep(keys) {
    let k = prepCache.get(keys);
    if (!k) {
      k = keys.map(s => ({ x: s.x, y: s.y, w: s.w, ht: s.ht, hb: s.hb ?? s.ht, nt: s.nt ?? s.n ?? 2, nb: s.nb ?? s.n ?? 2 })).sort((a, b) => a.x - b.x);
      prepCache.set(keys, k);
    }
    return k;
  }
  const cr = (p0, p1, p2, p3, u) => 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
  const SK = ['y', 'w', 'ht', 'hb', 'nt', 'nb'];
  function secAt(keys, x) {
    const k = prep(keys), n = k.length;
    x = U.clamp(x, k[0].x, k[n - 1].x);
    let i = 0; while (i < n - 2 && x > k[i + 1].x) i++;
    const a = k[i], b = k[i + 1], u = (x - a.x) / (b.x - a.x || 1), p = k[Math.max(i - 1, 0)], q = k[Math.min(i + 2, n - 1)], o = { x };
    for (const f of SK) o[f] = U.lerp(U.lerp(a[f], b[f], u), cr(p[f], a[f], b[f], q[f], u), 0.75);
    o.w = Math.max(o.w, 0.004); o.ht = Math.max(o.ht, 0.004); o.hb = Math.max(o.hb, 0.004); o.nt = Math.max(o.nt, 1.2); o.nb = Math.max(o.nb, 1.2);
    return o;
  }
  function secPt(s, a, inset = 0) {
    const c = Math.cos(a), sn = Math.sin(a), n = sn >= 0 ? s.nt : s.nb, h = Math.max((sn >= 0 ? s.ht : s.hb) - inset, 0.002), w = Math.max(s.w - inset, 0.002);
    return [Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * w, s.y + Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n) * h];
  }
  function halfW(keys, x, y) {
    const s = secAt(keys, x), dy = y - s.y, h = dy >= 0 ? s.ht : s.hb, n = dy >= 0 ? s.nt : s.nb, t = Math.abs(dy) / h;
    return t >= 1 ? 0 : s.w * Math.pow(1 - Math.pow(t, n), 1 / n);
  }
  function topY(keys, x, z) {
    const k = prep(keys); if (x < k[0].x || x > k[k.length - 1].x) return -1e9;
    const s = secAt(keys, x), t = Math.abs(z) / s.w;
    return t >= 1 ? -1e9 : s.y + s.ht * Math.pow(1 - Math.pow(t, s.nt), 1 / s.nt);
  }
  function loft(keys, o = {}) {
    const k = prep(keys), x0 = o.x0 ?? k[0].x, x1 = o.x1 ?? k[k.length - 1].x, R = o.rings || 60, S = o.seg || 36, v0 = o.v0 ?? 0, v1 = o.v1 ?? 1;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= R; j++) {
      const x = U.lerp(x0, x1, j / R), s = secAt(keys, x);
      for (let i = 0; i <= S; i++) {
        const v = U.lerp(v0, v1, i / S), p = secPt(s, -Math.PI / 2 + v * 2 * Math.PI, o.inset || 0);
        pos.push(x, p[1], p[0]); uv.push(j / R, v);
      }
    }
    for (let j = 0; j < R; j++) for (let i = 0; i < S; i++) { const a = j * (S + 1) + i, b = a + S + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    if (v0 === 0 && v1 === 1 && o.caps !== false) for (const front of [false, true]) {          // 端盖：截面足够大的一端用扇形封住
      const j = front ? R : 0, x = front ? x1 : x0, s = secAt(keys, x); if (Math.min(s.w, s.ht, s.hb) < 0.03) continue;
      const base = pos.length / 3;
      for (let i = 0; i <= S; i++) { const q = (j * (S + 1) + i) * 3; pos.push(pos[q], pos[q + 1], pos[q + 2]); uv.push(j / R, i / S); }
      pos.push(x, s.y + (s.ht - s.hb) / 2, 0); uv.push(j / R, 0.5);
      const c = base + S + 1;
      for (let i = 0; i < S; i++) { if (front) idx.push(c, base + i + 1, base + i); else idx.push(c, base + i, base + i + 1); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    if (v0 === 0 && v1 === 1) {               // 缝合接缝法线
      const nr = g.attributes.normal;
      for (let j = 0; j <= R; j++) {
        const a = j * (S + 1), b = a + S, x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b), l = Math.hypot(x, y, z) || 1;
        nr.setXYZ(a, x / l, y / l, z / l); nr.setXYZ(b, x / l, y / l, z / l);
      }
    }
    return g;
  }
  function outline(keys, x, n = 40, inset = 0) { const s = secAt(keys, x), a = []; for (let i = 0; i < n; i++) a.push(secPt(s, i / n * Math.PI * 2, inset)); return a; }
  function bulkhead(keys, x, mat, inset = 0.01) {
    const g = new T.ShapeGeometry(new T.Shape(outline(keys, x, 48, inset).map(p => new T.Vector2(p[0], p[1]))));
    g.rotateY(-Math.PI / 2); g.translate(x, 0, 0);
    return new T.Mesh(g, mat);
  }
  function former(keys, x, r, mat, inset = 0.03) {
    const c = new T.CatmullRomCurve3(outline(keys, x, 36, inset).map(p => new V3(x, p[1], p[0])), true);
    return new T.Mesh(new T.TubeGeometry(c, 72, r, 5, true), mat);
  }
  function stringer(keys, x0, x1, ang, r, mat, inset = 0.03) {
    const pts = []; for (let i = 0; i <= 14; i++) { const x = U.lerp(x0, x1, i / 14), p = secPt(secAt(keys, x), ang, inset); pts.push(new V3(x, p[1], p[0])); }
    return new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 28, r, 4, false), mat);
  }

  /* ---------------- 贴合机身曲面的构件：按 (x, v, 内缩量) 取点，保证不穿出蒙皮 ---------------- */
  function vOf(keys, x, y, side) {
    const s = secAt(keys, x), dy = y - s.y, h = dy >= 0 ? s.ht : s.hb, n = dy >= 0 ? s.nt : s.nb;
    const v = 0.25 + Math.asin(Math.sign(dy) * Math.pow(U.clamp(Math.abs(dy) / h, 0, 1), n / 2)) / (2 * Math.PI);
    return side > 0 ? v : 1 - v;
  }
  function surfPt(keys, x, v, inset = 0) { const p = secPt(secAt(keys, x), -Math.PI / 2 + v * 2 * Math.PI, inset); return new V3(x, p[1], p[0]); }
  function arcLen(keys, x, v0, v1) { let l = 0, p = surfPt(keys, x, v0); for (let i = 1; i <= 8; i++) { const q = surfPt(keys, x, U.lerp(v0, v1, i / 8)); l += p.distanceTo(q); p = q; } return l; }
  function patch(f, na, nb) {
    const pos = [], idx = [];
    for (let i = 0; i <= na; i++) for (let j = 0; j <= nb; j++) { const p = f(i / na, j / nb); pos.push(p.x, p.y, p.z); }
    for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) { const a = i * (nb + 1) + j, b = a + nb + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    return { pos, idx };
  }
  function merge(parts) {
    const pos = [], idx = []; let off = 0;
    for (const p of parts) { for (const v of p.pos) pos.push(v); for (const i of p.idx) idx.push(i + off); off += p.pos.length / 3; }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  /* 沿舱壁的“盒子”：x0..x1 × v0..v1 × 内缩 i0..i1 */
  function boxParts(keys, x0, x1, v0, v1, i0, i1, nx = 4, nv = 5) {
    const L = U.lerp, S = (x, v, i) => surfPt(keys, x, v, i);
    return [patch((a, b) => S(L(x0, x1, a), L(v0, v1, b), i0), nx, nv), patch((a, b) => S(L(x0, x1, a), L(v0, v1, b), i1), nx, nv),
      patch((a, b) => S(x0, L(v0, v1, b), L(i0, i1, a)), 1, nv), patch((a, b) => S(x1, L(v0, v1, b), L(i0, i1, a)), 1, nv),
      patch((a, b) => S(L(x0, x1, a), v0, L(i0, i1, b)), nx, 1), patch((a, b) => S(L(x0, x1, a), v1, L(i0, i1, b)), nx, 1)];
  }
  /* 椭圆环（圆舷窗窗框 / 敞开式座舱的围框） */
  function ringParts(keys, xc, vc, rx, rv, r0, r1, i0, i1) {
    const L = U.lerp, S = (t, r, i) => surfPt(keys, xc + Math.cos(t * 6.28318) * rx * r, vc + Math.sin(t * 6.28318) * rv * r, i);
    return [patch((a, b) => S(a, L(r0, r1, b), i0), 30, 1), patch((a, b) => S(a, L(r0, r1, b), i1), 30, 1), patch((a, b) => S(a, r0, L(i0, i1, b)), 30, 1), patch((a, b) => S(a, r1, L(i0, i1, b)), 30, 1)];
  }
  /* 同上，但形状由 f(角度, 半径系数) → [x, v] 给出（按真实尺寸取形） */
  function ringPartsF(keys, f, r0, r1, i0, i1) {
    const L = U.lerp, S = (t, r, i) => { const q = f(t * 6.28318, r); return surfPt(keys, q[0], q[1], i); };
    return [patch((a, b) => S(a, L(r0, r1, b), i0), 32, 1), patch((a, b) => S(a, L(r0, r1, b), i1), 32, 1), patch((a, b) => S(a, r0, L(i0, i1, b)), 32, 1), patch((a, b) => S(a, r1, L(i0, i1, b)), 32, 1)];
  }
  function wallBox(keys, x0, x1, y0, y1, side, i0, i1, mat) {
    const xm = (x0 + x1) / 2, a = vOf(keys, xm, y0, side), b = vOf(keys, xm, y1, side);
    return new T.Mesh(merge(boxParts(keys, x0, x1, Math.min(a, b), Math.max(a, b), i0, i1)), mat);
  }
  /* 沿舱壁走线的管路；inset 为负则贴在蒙皮外侧 */
  function wallPipe(keys, x0, x1, y, side, inset, r, mat) {
    const pts = [], n = Math.max(6, Math.round(Math.abs(x1 - x0) * 5));
    for (let i = 0; i <= n; i++) { const x = U.lerp(x0, x1, i / n), yy = typeof y === 'function' ? y(x) : y; pts.push(new V3(x, yy, side * Math.max(0.02, halfW(keys, x, yy) - inset))); }
    return new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), n * 2, r, 6, false), mat);
  }

  /* -------------------------------- 机翼 -------------------------------- */
  function airfoil(n, t, cam) {
    const up = [], lo = [];
    for (let i = 0; i <= n; i++) {
      const c = 0.5 * (1 - Math.cos(i / n * Math.PI));
      const yt = 5 * t * (0.2969 * Math.sqrt(c) - 0.126 * c - 0.3516 * c * c + 0.2843 * c ** 3 - 0.1036 * c ** 4), yc = cam * (1 - (2 * c - 1) ** 2);
      up.push([c, yc + yt]); lo.push([c, yc - yt]);
    }
    return up.reverse().concat(lo);      // 上表面 后缘→前缘，下表面 前缘→后缘
  }
  function wingSec(o, s) {
    const a = Math.abs(s), tr = 1 - (o.tipR ?? 0.12);
    const e = a > tr ? Math.sqrt(Math.max(0, 1 - ((a - tr) / (1 - tr)) ** 2)) : 1;
    const nom = U.lerp(o.root, o.tip ?? o.root, a), chord = Math.max(nom * e, nom * 0.03), z = s * o.span / 2;
    return { z, chord, xle: -(o.sweep || 0) * Math.abs(z) - (o.root - nom) * (o.taperAt ?? 0.3) - (nom - chord) * 0.45, y: Math.abs(z) * Math.tan(o.dih || 0) + (nom - chord) * 0 };
  }
  function wing(o) {
    const prof = airfoil(o.n || 12, o.t || 0.14, o.cam ?? 0.03), np = prof.length, S = o.segs || 30, pos = [], uv = [], idx = [];
    for (let j = 0; j <= S; j++) {
      const s = Math.sin(Math.PI / 2 * (-1 + 2 * j / S)), w = wingSec(o, s);
      for (let k = 0; k < np; k++) { pos.push(w.xle - prof[k][0] * w.chord, w.y + prof[k][1] * w.chord, w.z); uv.push((s + 1) / 2, k / (np - 1)); }
    }
    for (let j = 0; j < S; j++) for (let k = 0; k < np - 1; k++) { const a = j * np + k, b = a + np; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  /* 剖视区域内露出的翼肋与翼梁骨架 */
  function wingWire(o, z0, z1, n, mat) {
    const grp = new T.Group(), half = o.span / 2;
    const prof = airfoil(12, (o.t || 0.14) * 0.68, o.cam ?? 0.03).filter(p => p[0] > 0.035 && p[0] < 0.84);   // 收进蒙皮、去掉尖锐的前后缘
    for (let i = 0; i < n; i++) {
      const z = U.lerp(z0, z1, i / (n - 1)), w = wingSec(o, z / half);
      const c = new T.CatmullRomCurve3(prof.map(p => new V3(w.xle - p[0] * w.chord, w.y + p[1] * w.chord, z)), true, 'catmullrom', 0.2);
      grp.add(new T.Mesh(new T.TubeGeometry(c, 44, 0.011, 4, true), mat));
    }
    for (const f of [0.22, 0.62]) {
      const a = wingSec(o, z0 / half), b = wingSec(o, z1 / half);
      grp.add(strut(new V3(a.xle - f * a.chord, a.y + 0.03 * a.chord, z0), new V3(b.xle - f * b.chord, b.y + 0.03 * b.chord, z1), 0.024, mat));
    }
    return grp;
  }
  /* 由侧视轮廓挤出的薄板（垂尾、方向舵等） */
  function plate(points, thick, mat) {
    const curve = new T.CatmullRomCurve3(points.map(p => new V3(p[0], p[1], 0)), true, 'catmullrom', 0.4);
    const g = new T.ExtrudeGeometry(new T.Shape(curve.getPoints(70).map(p => new T.Vector2(p.x, p.y))), { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.45, bevelSize: thick * 0.5, bevelSegments: 2 });
    g.translate(0, 0, -thick / 2);
    return new T.Mesh(g, mat);
  }
  function strut(a, b, r, mat, r2) {
    const d = new V3().subVectors(b, a), len = d.length();
    const m = new T.Mesh(new T.CylinderGeometry(r2 ?? r, r, len, 8), mat);
    m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize());
    return m;
  }
  function wheel(r) {
    const g = new T.Group();
    g.add(mesh(new T.TorusGeometry(r * 0.7, r * 0.3, 12, 28), M.rubber));
    const hub = mesh(new T.CylinderGeometry(r * 0.46, r * 0.46, r * 0.34, 20), M.alu); hub.rotation.x = Math.PI / 2; g.add(hub);
    const cap = mesh(new T.SphereGeometry(r * 0.16, 10, 8), M.steel, 0, 0, r * 0.17); g.add(cap); g.add(mesh(new T.SphereGeometry(r * 0.16, 10, 8), M.steel, 0, 0, -r * 0.17));
    return g;
  }

  /* ------------------------------- 发动机 ------------------------------- */
  /* 把一组静态网格按材质合并成少数几个网格（细节再多也只占几次绘制调用） */
  function bake(group) {
    group.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(group.matrixWorld).invert(), m4 = new T.Matrix4(), buckets = new Map();
    group.traverse(o => {
      if (!o.isMesh) return;
      const ge = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      if (!ge.attributes.normal) ge.computeVertexNormals();
      ge.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
      let b = buckets.get(o.material); if (!b) buckets.set(o.material, b = { pos: [], nor: [], n: 0 });
      b.pos.push(ge.attributes.position.array); b.nor.push(ge.attributes.normal.array); b.n += ge.attributes.position.array.length;
    });
    const out = new T.Group();
    for (const [mat, b] of buckets) {
      const pos = new Float32Array(b.n), nor = new Float32Array(b.n); let off = 0;
      b.pos.forEach((a, i) => { pos.set(a, off); nor.set(b.nor[i], off); off += a.length; });
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3));
      out.add(new T.Mesh(g, mat));
    }
    return out;
  }
  /* 整机静态合并：把不会动的网格按（去重后的）材质并成一个网格，绘制调用和阴影绘制都从几百次降到几十次。
     skip 里的节点及其子树（螺旋桨、驾驶盘、油泵手柄……）保持原样；透明材质不并，以免打乱半透明排序；
     运行时会改颜色的材质（灯泡、航行灯）标了 userData.dyn，不参与去重。 */
  const planeIds = new WeakMap(); let planeN = 0;
  function matKey(m) {
    if (m.userData.dyn) return m.uuid;
    const t = x => x ? [x.source.uuid, x.repeat.x, x.repeat.y, x.offset.x, x.offset.y, x.rotation, x.wrapS, x.wrapT].join(',') : '';
    let cp = '';
    if (m.clippingPlanes) { if (!planeIds.has(m.clippingPlanes)) planeIds.set(m.clippingPlanes, ++planeN); cp = planeIds.get(m.clippingPlanes); }
    return [m.type, m.color ? m.color.getHex() : '', m.roughness, m.metalness, m.side, m.opacity, m.alphaTest, m.vertexColors, m.emissive ? m.emissive.getHex() : '', m.emissiveIntensity,
      m.clearcoat, m.clearcoatRoughness, m.envMapIntensity, m.polygonOffset, m.polygonOffsetFactor, m.flatShading, m.depthWrite, m.clipIntersection, cp, m.userData.ns,
      t(m.map), t(m.alphaMap), t(m.normalMap), t(m.roughnessMap), t(m.emissiveMap)].join('|');
  }
  const noMerge = typeof location !== 'undefined' && /[?&]nomerge=1/.test(location.search);
  function bakeStatic(root, skip = []) {
    if (noMerge) return root;
    root.updateMatrixWorld(true);
    const skipSet = new Set(skip.filter(Boolean)), inv = new T.Matrix4().copy(root.matrixWorld).invert(), m4 = new T.Matrix4(), n3 = new T.Matrix3(), v = new V3();
    const canon = new Map(), buckets = new Map();
    (function walk(o) {
      if (skipSet.has(o)) return;
      if (o.isMesh && !Array.isArray(o.material) && !o.material.transparent && !o.children.length) {
        const mk = matKey(o.material); if (!canon.has(mk)) canon.set(mk, o.material);
        const key = mk + '#' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '#' + o.renderOrder;
        let b = buckets.get(key); if (!b) buckets.set(key, b = { mat: canon.get(mk), cast: o.castShadow, recv: o.receiveShadow, ro: o.renderOrder, list: [] });
        b.list.push(o);
      }
      for (const c of o.children) walk(c);
    })(root);
    for (const b of buckets.values()) {
      if (b.list.length < 2) continue;
      let nv = 0, ni = 0, hasUv = false; const hasCol = !!b.mat.vertexColors;
      for (const o of b.list) { const g = o.geometry; if (!g.attributes.normal) g.computeVertexNormals(); nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; if (g.attributes.uv) hasUv = true; }
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = hasUv ? new Float32Array(nv * 2) : null, col = hasCol ? new Float32Array(nv * 3).fill(1) : null, idx = new Uint32Array(ni);
      let vo = 0, io = 0;
      for (const o of b.list) {
        const g = o.geometry, P0 = g.attributes.position, N0 = g.attributes.normal, U0 = g.attributes.uv, C0 = g.attributes.color, n = P0.count;
        m4.multiplyMatrices(inv, o.matrixWorld); n3.getNormalMatrix(m4); const f1 = m4.determinant() < 0 ? 2 : 1, f2 = 3 - f1;      // 镜像变换要翻转绕序
        for (let i = 0; i < n; i++) {
          const k = (vo + i) * 3;
          v.fromBufferAttribute(P0, i).applyMatrix4(m4); pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
          v.fromBufferAttribute(N0, i).applyMatrix3(n3).normalize(); nor[k] = v.x; nor[k + 1] = v.y; nor[k + 2] = v.z;
          if (uv && U0) { uv[(vo + i) * 2] = U0.getX(i); uv[(vo + i) * 2 + 1] = U0.getY(i); }
          if (col && C0) { col[k] = C0.getX(i); col[k + 1] = C0.getY(i); col[k + 2] = C0.getZ(i); }
        }
        if (g.index) { const a = g.index.array, m = a.length - a.length % 3; for (let i = 0; i < m; i += 3) { idx[io + i] = a[i] + vo; idx[io + i + 1] = a[i + f1] + vo; idx[io + i + 2] = a[i + f2] + vo; } io += m; }
        else { const m = n - n % 3; for (let i = 0; i < m; i += 3) { idx[io + i] = vo + i; idx[io + i + 1] = vo + i + f1; idx[io + i + 2] = vo + i + f2; } io += m; }
        vo += n; o.parent.remove(o);
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3));
      if (uv) g.setAttribute('uv', new T.BufferAttribute(uv, 2)); if (col) g.setAttribute('color', new T.BufferAttribute(col, 3));
      g.setIndex(new T.BufferAttribute(io === ni ? idx : idx.subarray(0, io), 1));
      const m = new T.Mesh(g, b.mat); m.castShadow = b.cast; m.receiveShadow = b.recv; m.renderOrder = b.ro; root.add(m);
    }
    (function prune(o) { for (const c of [...o.children]) { if (skipSet.has(c)) continue; prune(c); if (c.type === 'Group' && !c.children.length) o.remove(c); } })(root);   // 清掉合并后剩下的空组
    return root;
  }
  let discTex = null;
  /* 螺旋桨：扭转桨叶（黄色桨尖）、桨根套箍、桨毂盘与一圈螺栓、桨帽或桨毂螺帽 */
  function propeller(R, blades, mat, spinner) {
    const g = new T.Group(), spin = new T.Group(); g.add(spin);
    const hub = new T.Group(), X = Math.PI / 2;
    const hb = mesh(new T.CylinderGeometry(R * 0.075, R * 0.08, R * 0.17, 16), M.steel); hb.rotation.z = -X; hub.add(hb);
    const plate = mesh(new T.CylinderGeometry(R * 0.105, R * 0.105, R * 0.022, 20), M.alu, R * 0.09, 0, 0); plate.rotation.z = -X; hub.add(plate);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28318, b = mesh(new T.CylinderGeometry(R * 0.011, R * 0.011, R * 0.03, 6), M.steel, R * 0.105, Math.cos(a) * R * 0.08, Math.sin(a) * R * 0.08); b.rotation.z = -X; hub.add(b); }
    if (spinner) {
      const sp = mesh(new T.ConeGeometry(R * 0.115, R * 0.32, 22), spinner, R * 0.24, 0, 0); sp.rotation.z = -X; hub.add(sp);
      const bp = mesh(new T.CylinderGeometry(R * 0.118, R * 0.125, R * 0.03, 22), M.alu, R * 0.075, 0, 0); bp.rotation.z = -X; hub.add(bp);
    } else { const nut = mesh(new T.SphereGeometry(R * 0.05, 12, 10), M.brass, R * 0.11, 0, 0); nut.scale.x = 1.5; hub.add(nut); }
    for (let i = 0; i < blades; i++) { const pv = new T.Group(); pv.rotation.x = i / blades * 6.28318; pv.add(mesh(new T.CylinderGeometry(R * 0.04, R * 0.05, R * 0.11, 10), M.steel, 0, R * 0.105, 0)); hub.add(pv); }
    spin.add(bake(hub));
    const bg = new T.CylinderGeometry(0.03 * R, 0.05 * R, 0.94 * R, 10, 10), p = bg.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / (0.94 * R) + 0.5, wide = 0.55 + 2.0 * Math.max(0, Math.sin(Math.PI * U.clamp(t * 1.08, 0, 1))) ** 0.9, tw = (1 - t) * 0.9 - 0.25;
      const x = p.getX(i) * 0.32, z = p.getZ(i) * wide;
      p.setX(i, x * Math.cos(tw) - z * Math.sin(tw)); p.setZ(i, x * Math.sin(tw) + z * Math.cos(tw));
      col.set(t > 0.88 ? [1.0, 0.72, 0.1] : [1, 1, 1], i * 3);                       // 桨尖警示黄
    }
    bg.setAttribute('color', new T.BufferAttribute(col, 3)); bg.translate(0, 0.5 * R, 0); bg.computeVertexNormals();
    const bm = mat.clone(); bm.vertexColors = true;
    const bl = [];
    for (let i = 0; i < blades; i++) { const b = mesh(bg, bm); b.rotation.x = i / blades * Math.PI * 2; spin.add(b); bl.push(b); }
    if (!discTex) discTex = tex(256, 256, (c) => {
      const gr = c.createRadialGradient(128, 128, 10, 128, 128, 128);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.25, 'rgba(255,255,255,.10)'); gr.addColorStop(0.8, 'rgba(255,255,255,.22)'); gr.addColorStop(0.9, 'rgba(255,205,90,.6)'); gr.addColorStop(0.97, 'rgba(255,200,80,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
      c.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 40; i++) { c.strokeStyle = `rgba(0,0,0,${Math.random() * 0.25})`; c.lineWidth = Math.random() * 5; c.beginPath(); c.arc(128, 128, 20 + Math.random() * 105, 0, 7); c.stroke(); }
    });
    const disc = mesh(new T.CircleGeometry(R, 40), new T.MeshBasicMaterial({ map: discTex, transparent: true, opacity: 0.5, depthWrite: false, side: T.DoubleSide, color: 0xcfc8b8, fog: true }));
    disc.rotation.y = Math.PI / 2; disc.userData.noShadow = true; g.add(disc);
    return { group: g, spin, disc, blades: bl };
  }
  /* 星型发动机。
     曲轴箱（附件段/主箱/前减速器壳+螺栓）、每缸：散热片缸筒、带横向散热片的缸头、两只摇臂罩、两根推杆、
     火花塞+点火线（接到前部点火线束环）、后部进气管、通向集气环的排气短管、缸间导风板；
     后面是防火墙隔板与发动机架环——正对发动机看过去不会再看穿到天空。可选 NACA 整流罩或汤恩德环。 */
  function radial(o) {
    const r = o.r, n = o.cyl || 9, eg = new T.Group(), TAU = Math.PI * 2, X = Math.PI / 2;
    const headM = std(0x6e7176, 0.5, 0.75), finM = std(0xa2a6ac, 0.45, 0.85), plateM = std(0x16171a, 0.75, 0.35, { side: T.DoubleSide });
    const ax = (m, x = 0) => { m.rotation.z = -X; m.position.x = x; return m; };                       // 圆柱轴线转到 +x
    eg.add(ax(mesh(new T.CylinderGeometry(r * 0.37, r * 0.4, r * 0.4, 26), M.dark)));
    eg.add(ax(mesh(new T.CylinderGeometry(r * 0.4, r * 0.3, r * 0.26, 26), M.dark), -r * 0.33));
    const ng = new T.LatheGeometry([[0.37, 0.2], [0.355, 0.27], [0.27, 0.37], [0.17, 0.44], [0.12, 0.52], [0.105, 0.68]].map(p => new T.Vector2(p[0] * r, p[1] * r)), 26); ng.rotateZ(-X);
    eg.add(mesh(ng, M.alu));
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; eg.add(mesh(new T.SphereGeometry(r * 0.022, 6, 5), M.steel, r * 0.25, Math.cos(a) * r * 0.345, Math.sin(a) * r * 0.345)); }
    const ign = mesh(new T.TorusGeometry(r * 0.45, r * 0.017, 6, 36), M.black, r * 0.19, 0, 0); ign.rotation.y = X; eg.add(ign);                     // 点火线束环
    for (const s of [-1, 1]) { eg.add(mesh(new T.BoxGeometry(r * 0.15, r * 0.13, r * 0.13), M.dark, -r * 0.5, r * 0.16, s * r * 0.15)); eg.add(mesh(new T.SphereGeometry(r * 0.05, 8, 6), M.brass, -r * 0.5, r * 0.25, s * r * 0.15)); }   // 两只磁电机
    eg.add(mesh(new T.BoxGeometry(r * 0.2, r * 0.17, r * 0.22), M.alu, -r * 0.42, -r * 0.38, 0)); eg.add(ax(mesh(new T.CylinderGeometry(r * 0.07, r * 0.09, r * 0.12, 10), M.dark), -r * 0.56)); eg.children[eg.children.length - 1].position.y = -r * 0.4;   // 化油器与进气口
    eg.add(mesh(new T.BoxGeometry(r * 0.2, r * 0.09, r * 0.13), M.dark, r * 0.04, -r * 0.44, 0));                                                    // 油底壳
    const h0 = r * 0.36, h1 = r * 0.84, nf = 9, bp = [];
    for (let i = 0; i <= nf * 2; i++) bp.push(new T.Vector2((i % 2 ? 0.15 : 0.108) * r, U.lerp(h0, h1, i / (nf * 2))));
    const barrel = new T.LatheGeometry(bp, 14), headG = new T.BoxGeometry(0.25 * r, 0.1 * r, 0.3 * r), finG = new T.BoxGeometry(0.29 * r, 0.011 * r, 0.34 * r),
      rockG = new T.CapsuleGeometry(0.03 * r, 0.1 * r, 3, 8), plugG = new T.CylinderGeometry(0.017 * r, 0.017 * r, 0.07 * r, 6), baffG = new T.BoxGeometry(0.014 * r, 0.44 * r, 0.2 * r);
    for (let k = 0; k < n; k++) {
      const pv = new T.Group(); pv.rotation.x = k / n * TAU + (o.phase || 0); eg.add(pv);
      pv.add(mesh(barrel, M.steel)); pv.add(mesh(headG, headM, 0, h1 + 0.05 * r, 0));
      for (let f = 0; f < 4; f++) pv.add(mesh(finG, finM, 0, h1 + (0.012 + f * 0.027) * r, 0));
      for (const s of [-1, 1]) { const rk = mesh(rockG, M.alu, s * 0.075 * r, h1 + 0.115 * r, 0); rk.rotation.x = X; pv.add(rk); }
      for (const s of [-1, 1]) pv.add(strut(new V3(0.2 * r, 0.33 * r, s * 0.05 * r), new V3(0.085 * r, h1 + 0.1 * r, s * 0.09 * r), 0.014 * r, M.alu));          // 推杆
      const pl = mesh(plugG, M.cream, 0.15 * r, h1 + 0.05 * r, 0); pl.rotation.z = -X; pv.add(pl);
      pv.add(strut(new V3(0.19 * r, 0.45 * r, 0), new V3(0.17 * r, h1 + 0.05 * r, 0), 0.008 * r, M.black));                                            // 点火线
      pv.add(strut(new V3(-0.3 * r, 0.33 * r, -0.05 * r), new V3(-0.13 * r, h1 + 0.02 * r, -0.08 * r), 0.034 * r, M.alu));                              // 进气管
      pv.add(strut(new V3(-0.12 * r, h1 + 0.03 * r, 0.09 * r), new V3(-0.3 * r, 0.67 * r, 0.03 * r), 0.036 * r, M.rust));                                // 排气短管
      const bq = new T.Group(); bq.rotation.x = Math.PI / n; bq.add(mesh(baffG, M.dark, -0.07 * r, 0.6 * r, 0)); pv.add(bq);                           // 缸间导风板
    }
    const ex = mesh(new T.TorusGeometry(r * 0.67, r * 0.052, 8, 36), M.rust, -r * 0.3, 0, 0); ex.rotation.y = X; eg.add(ex);
    const tail = mesh(new T.CylinderGeometry(r * 0.06, r * 0.05, r * 0.7, 8), M.rust, -r * 0.62, -r * 0.63, r * 0.22); tail.rotation.z = X - 0.2; eg.add(tail);
    const plate = mesh(new T.CircleGeometry((o.cowl === 'naca' ? 1.12 : 0.76) * r, 40), plateM, -r * 0.47, 0, 0); plate.rotation.y = X; eg.add(plate);   // 防火墙隔板
    const ring = mesh(new T.TorusGeometry(r * 0.5, r * 0.028, 6, 30), M.steel, -r * 0.55, 0, 0); ring.rotation.y = X; eg.add(ring);                       // 发动机架环
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; eg.add(strut(new V3(-r * 0.55, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5), new V3(-r * 0.3, Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36), r * 0.02, M.steel)); }
    if (o.cowl) {
      const lp = o.cowl === 'naca'
        ? [[1.13, -0.95], [1.16, -0.4], [1.16, 0.1], [1.12, 0.36], [1.02, 0.52], [0.9, 0.58], [0.8, 0.54], [0.8, 0.4]]
        : [[1.14, -0.22], [1.17, 0.05], [1.14, 0.22], [1.07, 0.32], [1.01, 0.28], [1.04, 0.1], [1.05, -0.2]];
      const lg = new T.LatheGeometry(lp.map(p => new T.Vector2(p[0] * r, p[1] * r)), 48); lg.rotateZ(-X);
      const cm = o.cowlMat || lacquer(0x777777); cm.side = T.DoubleSide; eg.add(mesh(lg, cm));
      const naca = o.cowl === 'naca', len = naca ? 1.2 : 0.4, xm = naca ? -0.32 : 0, rr = naca ? 1.165 : 1.175;
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.78, sm = mesh(new T.BoxGeometry(len * r, 0.008 * r, 0.016 * r), M.black, xm * r, Math.cos(a) * rr * r, Math.sin(a) * rr * r); sm.rotation.x = a; eg.add(sm); }   // 整流罩分缝
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; eg.add(mesh(new T.SphereGeometry(0.014 * r, 6, 5), M.alu, (naca ? 0.2 : 0.12) * r, Math.cos(a) * (rr - 0.003) * r, Math.sin(a) * (rr - 0.003) * r)); }   // 快卸锁扣
    }
    const g = new T.Group(); g.add(bake(eg));
    const pr = propeller(o.propR || r * 2, o.blades || 2, o.propMat || M.alu, o.spinner);
    pr.group.position.x = r * 0.74; g.add(pr.group);
    return { group: g, spin: pr.spin, disc: pr.disc, blades: pr.blades, exh: [-0.963 * r, -0.56 * r, 0.22 * r] };          // exh：集气环尾管的出口（相对发动机中心）
  }

  /* -------------------------------- 机组 -------------------------------- */
  function crew(o) {
    const g = new T.Group(), body = new T.Group(); g.add(body);
    const mJ = std(o.jacket, 0.72), mP = std(o.pants, 0.82), mS = std(o.skin, 0.6), mC = std(o.cap, 0.58), mSc = std(o.scarf, 0.75, 0, { side: T.DoubleSide }), mB = std(0x2a1c14, 0.6), mG = std(0x6a4a2e, 0.6);
    detail(mJ, 'leather', 2, 2, 0.7); detail(mC, 'leather', 2, 2, 0.7); detail(mP, 'cloth', 3, 3, 0.6);
    photo(mJ, 'leather', 2, 2, { s: 0.8 }); photo(mC, 'leather', 2, 2, { s: 0.8 }); photo(mP, 'fabric', 3, 3, { s: 0.6 });
    const torso = mesh(new T.CapsuleGeometry(0.165, 0.2, 6, 16), mJ, 0, 0.5, 0); torso.scale.set(0.92, 1, 1.05); body.add(torso);
    body.add(mesh(new T.CylinderGeometry(0.168, 0.168, 0.045, 16), mB, 0, 0.385, 0));
    const collar = mesh(new T.TorusGeometry(0.11, 0.05, 8, 16), std(o.collar ?? 0xe8dcc0, 0.9), 0, 0.69, 0); collar.rotation.x = Math.PI / 2; body.add(collar);
    const head = new T.Group(); head.position.y = 0.86; body.add(head);
    head.add(mesh(new T.SphereGeometry(0.2, 22, 16), mS));
    const cap = mesh(new T.SphereGeometry(0.214, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), mC); cap.rotation.z = 0.32; head.add(cap);
    for (const s of [-1, 1]) {
      head.add(mesh(new T.SphereGeometry(0.03, 8, 8), M.black, 0.178, 0.0, s * 0.075));
      const flap = mesh(new T.BoxGeometry(0.11, 0.17, 0.035), mC, -0.01, -0.07, s * 0.2); head.add(flap);
      const lens = mesh(new T.CylinderGeometry(0.058, 0.058, 0.04, 14), M.brass, 0.125, 0.15, s * 0.075); lens.rotation.z = Math.PI / 2 - 0.5; head.add(lens);
      const gl = mesh(new T.CylinderGeometry(0.045, 0.045, 0.045, 14), std(0x9fd0e8, 0.1, 0.3), 0.13, 0.153, s * 0.075); gl.rotation.z = Math.PI / 2 - 0.5; head.add(gl);
    }
    if (o.hair) for (let i = 0; i < 5; i++) head.add(mesh(new T.SphereGeometry(0.05, 8, 6), std(o.hair, 0.8), 0.15 - Math.abs(i - 2) * 0.02, 0.06, (i - 2) * 0.062));
    head.add(mesh(new T.SphereGeometry(0.028, 8, 6), std(0xd88a7a, 0.6), 0.196, -0.06, 0));
    const neck = mesh(new T.TorusGeometry(0.125, 0.055, 8, 16), mSc, 0, 0.705, 0); neck.rotation.x = Math.PI / 2; body.add(neck);
    const tail = []; let par = new T.Group(); par.position.set(-0.13, 0.7, 0.06); body.add(par);
    for (let i = 0; i < 4; i++) { const s = new T.Group(); s.add(mesh(new T.BoxGeometry(0.13, 0.016, 0.1 - i * 0.012), mSc, -0.065, 0, 0)); par.add(s); if (i) s.position.x = -0.125; tail.push(s); par = s; }
    const limb = (z, y, len, r, m, hand) => {
      const pv = new T.Group(); pv.position.set(0, y, z);
      pv.add(mesh(new T.CapsuleGeometry(r, len, 4, 10), m, 0, -len / 2 - r * 0.4, 0));
      pv.add(hand); body.add(pv); return pv;
    };
    const armL = limb(-0.215, 0.635, 0.17, 0.056, mJ, mesh(new T.SphereGeometry(0.064, 10, 8), mG, 0, -0.29, 0));
    const armR = limb(0.215, 0.635, 0.17, 0.056, mJ, mesh(new T.SphereGeometry(0.064, 10, 8), mG, 0, -0.29, 0));
    const boot = () => { const b = mesh(new T.BoxGeometry(0.19, 0.1, 0.125), mB, 0.035, -0.3, 0); return b; };
    const legL = limb(-0.092, 0.35, 0.13, 0.072, mP, boot()), legR = limb(0.092, 0.35, 0.13, 0.072, mP, boot());
    const hold = new T.Group(); hold.position.set(0.3, 0.52, 0.1); body.add(hold);
    const ring = mesh(new T.RingGeometry(0.27, 0.34, 28), new T.MeshBasicMaterial({ color: o.ring, transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide }), 0, 0.02, 0);
    ring.rotation.x = -Math.PI / 2; ring.userData.noShadow = true; g.add(ring);
    g.traverse(m => { if (m.isMesh && !m.userData.noShadow) { m.castShadow = true; m.receiveShadow = true; } });
    head.traverse(m => { if (m.isMesh && m.material !== mS && m.material !== mC) m.castShadow = false; });      // 眼睛、护目镜、刘海这些小件的影子根本看不见
    tail.forEach(s => { s.children[0].castShadow = false; }); collar.castShadow = false;
    bakeStatic(head);                                                                                          // 头部是一个刚体：按材质并成几个网格
    return { g, body, head, armL, armR, legL, legR, tail, hold, ring, t: Math.random() * 9 };
  }
  /* a: { pose, moving(0..1), wind(0..1) } */
  function animCrew(c, a, dt) {
    c.t += dt * (a.pose === 'walk' ? 11 * (0.5 + a.moving) : 6);
    const t = c.t, s = Math.sin(t), k = U.clamp(dt * 14, 0, 1), set = (o, z, x = 0) => { o.rotation.z = U.lerp(o.rotation.z, z, k); o.rotation.x = U.lerp(o.rotation.x, x, k); };
    let by = 0, bz = 0, hx = 0, hy = 0, bx = 0;
    switch (a.pose) {
      case 'walk': set(c.legL, s * 0.75); set(c.legR, -s * 0.75); set(c.armL, -s * 0.6); set(c.armR, a.carry ? 1.0 : s * 0.6); by = Math.abs(Math.cos(t)) * 0.035; bz = -0.1; break;
      case 'work': set(c.legL, 0.15); set(c.legR, -0.15); set(c.armL, 1.25 + Math.sin(t * 2.6) * 0.3); set(c.armR, 1.35 + Math.cos(t * 2.6) * 0.45); bz = -0.16; by = Math.sin(t * 2.6) * 0.012; break;
      case 'reach': set(c.legL, 0); set(c.legR, 0); set(c.armL, 2.5 + Math.sin(t * 2.4) * 0.2); set(c.armR, 2.6 + Math.cos(t * 2.4) * 0.3); hx = 0.35; break;
      case 'spray': set(c.legL, 0.25); set(c.legR, -0.25); set(c.armL, 1.3); set(c.armR, 1.45); bz = 0.08; break;
      case 'sit': {           // 双手握驾驶盘，随操纵量打盘、推拉，偶尔左右张望
        const sv = a.steer || 0, pv = a.pull || 0;
        set(c.legL, 1.12 + pv * 0.06 + sv * 0.08); set(c.legR, 1.12 + pv * 0.06 - sv * 0.08);
        set(c.armL, 1.29 + pv * 0.14 + sv * 0.22, -0.31); set(c.armR, 1.29 + pv * 0.14 - sv * 0.22, 0.31);
        by = -0.12; bx = sv * 0.1; hx = -pv * 0.08; hy = Math.sin(t * 0.19) * Math.max(0, Math.sin(t * 0.047)) * 0.6 - sv * 0.25; break;
      }
      case 'stun': set(c.legL, 0.3); set(c.legR, -0.3); set(c.armL, -0.6, -1.2); set(c.armR, -0.6, 1.2); bz = 0.3 * Math.sin(t * 3); break;
      case 'climb': set(c.legL, s * 0.9); set(c.legR, -s * 0.9); set(c.armL, 2.6 - s * 0.4); set(c.armR, 2.6 + s * 0.4); break;
      default: set(c.legL, 0); set(c.legR, 0); set(c.armL, 0.06 * Math.sin(t * 0.4), -0.12); set(c.armR, a.carry ? 1.0 : -0.06 * Math.sin(t * 0.4), 0.12); by = Math.sin(t * 0.35) * 0.008;
    }
    c.body.position.y = U.lerp(c.body.position.y, by, k); c.body.rotation.z = U.lerp(c.body.rotation.z, bz - (a.wind || 0) * 0.22, k);
    c.head.rotation.z = U.lerp(c.head.rotation.z, hx, k); c.head.rotation.y = U.lerp(c.head.rotation.y, hy, k * 0.5); c.body.rotation.x = U.lerp(c.body.rotation.x, bx, k);
    const w = a.wind || 0, fl = 0.3 + w * 0.5, sp = 5 + w * 11;
    c.tail.forEach((sg, i) => { sg.rotation.z = (i === 0 ? U.lerp(-0.9, 0.05, Math.min(1, w + a.moving * 0.6)) : 0) + Math.sin(t * sp / 6 - i * 0.9) * fl * (0.4 + i * 0.25); sg.rotation.y = Math.sin(t * sp / 7 - i) * fl * 0.5; });
  }

  /* ------------------------------ 手持道具 ------------------------------ */
  function item(type) {
    const g = new T.Group();
    if (type === 'wrench') {
      const m = std(0xd8dde4, 0.3, 0.95, { emissive: 0x334455, emissiveIntensity: 0.35 });
      g.add(mesh(new T.BoxGeometry(0.34, 0.03, 0.055), m)); const j = mesh(new T.TorusGeometry(0.06, 0.024, 6, 14, Math.PI * 1.5), m, 0.2, 0, 0); j.rotation.x = Math.PI / 2; j.rotation.z = Math.PI * 0.25; g.add(j);
      const j2 = mesh(new T.TorusGeometry(0.045, 0.02, 6, 14), m, -0.19, 0, 0); j2.rotation.x = Math.PI / 2; g.add(j2);
    } else if (type === 'mallet') {
      const h = mesh(new T.CylinderGeometry(0.02, 0.024, 0.36, 8), M.woodLight); h.rotation.z = Math.PI / 2; g.add(h);
      const hd = mesh(new T.CylinderGeometry(0.075, 0.075, 0.2, 14), std(0xd9b36a, 0.6), 0.17, 0, 0); hd.rotation.x = Math.PI / 2; g.add(hd);
      for (const z of [-0.07, 0.07]) { const b = mesh(new T.CylinderGeometry(0.078, 0.078, 0.025, 14), M.brass, 0.17, 0, z); b.rotation.x = Math.PI / 2; g.add(b); }
    } else if (type === 'ext') {
      g.add(mesh(new T.CylinderGeometry(0.085, 0.085, 0.3, 16), std(0xc81e1e, 0.35, 0.2, { emissive: 0x400808, emissiveIntensity: 0.5 }), 0, 0.02, 0));
      g.add(mesh(new T.SphereGeometry(0.085, 16, 8, 0, 7, 0, 1.6), std(0xc81e1e, 0.35, 0.2), 0, 0.17, 0)); g.add(mesh(new T.CylinderGeometry(0.03, 0.04, 0.07, 10), M.brass, 0, 0.26, 0));
      const hz = mesh(new T.ConeGeometry(0.05, 0.16, 12, 1, true), M.black, 0.11, 0.2, 0); hz.rotation.z = Math.PI / 2; g.add(hz);
      g.add(mesh(new T.CylinderGeometry(0.087, 0.087, 0.05, 16), M.cream, 0, 0.05, 0));
    } else if (type === 'fuse') {
      const gl = mesh(new T.CylinderGeometry(0.04, 0.04, 0.16, 12), std(0xffe2a0, 0.15, 0, { emissive: 0xffb040, emissiveIntensity: 1.6 })); gl.rotation.z = Math.PI / 2; g.add(gl);
      for (const x of [-0.09, 0.09]) { const c = mesh(new T.CylinderGeometry(0.045, 0.045, 0.045, 12), M.brass, x, 0, 0); c.rotation.z = Math.PI / 2; g.add(c); }
    }
    g.scale.setScalar(1.25);
    g.traverse(m => { if (m.isMesh) m.castShadow = true; });
    return bakeStatic(g);
  }

  /* ------------------------------ 舱内设备 ------------------------------ */
  let panelTex = null, mapTex = null;
  function gaugeTex() {
    return panelTex || (panelTex = tex(512, 256, (c, W, H) => {
      c.fillStyle = '#15171c'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#3a3d45'; c.lineWidth = 3; c.strokeRect(6, 6, W - 12, H - 12);
      const dial = (x, y, r, a) => {
        c.fillStyle = '#0a0b0d'; c.beginPath(); c.arc(x, y, r + 5, 0, 7); c.fill();
        c.fillStyle = '#e8dfc6'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
        c.strokeStyle = '#1a1a1a'; c.lineWidth = 2;
        for (let i = 0; i < 12; i++) { const t = i / 12 * 6.283; c.beginPath(); c.moveTo(x + Math.cos(t) * r * 0.78, y + Math.sin(t) * r * 0.78); c.lineTo(x + Math.cos(t) * r * 0.95, y + Math.sin(t) * r * 0.95); c.stroke(); }
        c.strokeStyle = '#b3202a'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8); c.stroke();
        c.fillStyle = '#222'; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill();
      };
      dial(70, 80, 44, -2.2); dial(180, 80, 44, -0.6); dial(290, 80, 44, 1.9); dial(400, 80, 44, -1.2);
      dial(110, 190, 34, 0.5); dial(210, 190, 34, 2.7); dial(310, 190, 34, -2.8); dial(410, 190, 34, 1.1);
      c.fillStyle = '#c9a45c'; for (let i = 0; i < 5; i++) c.fillRect(455 + (i % 2) * 22, 30 + i * 40, 12, 22);
    }));
  }
  function chartTex() {
    return mapTex || (mapTex = tex(256, 128, (c, W, H) => {
      c.fillStyle = '#e6d6ac'; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(90,70,40,.35)'; c.lineWidth = 1; for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, H); c.stroke(); c.beginPath(); c.moveTo(0, i * 21); c.lineTo(W, i * 21); c.stroke(); }
      c.fillStyle = '#9a8a5a'; c.beginPath(); c.moveTo(0, 20); c.bezierCurveTo(30, 30, 46, 60, 28, 84); c.lineTo(14, 128); c.lineTo(0, 128); c.fill();
      c.beginPath(); c.moveTo(256, 30); c.bezierCurveTo(226, 36, 220, 60, 232, 76); c.bezierCurveTo(222, 96, 240, 110, 256, 112); c.fill();
      c.strokeStyle = '#b3202a'; c.lineWidth = 2.5; c.setLineDash([7, 5]); c.beginPath(); c.moveTo(30, 70); c.quadraticCurveTo(128, 20, 228, 62); c.stroke();
      c.setLineDash([]); c.fillStyle = '#b3202a'; c.beginPath(); c.arc(30, 70, 4, 0, 7); c.arc(228, 62, 4, 0, 7); c.fill();
    }));
  }
  const St = {
    seat(rise = 0) {    // 朝 +x：皮座椅、驾驶盘、脚蹬。userData.yoke 可随操纵转动，userData.sitY 为乘员落座高度
      const g = new T.Group(), y0 = 0.34 + rise;
      g.add(mesh(new T.BoxGeometry(0.38, 0.09, 0.4), M.leather, 0, y0, 0));
      const back = mesh(new T.BoxGeometry(0.08, 0.5, 0.4), M.leather, -0.2, y0 + 0.27, 0); back.rotation.z = 0.1; g.add(back);
      g.add(mesh(new T.BoxGeometry(0.3, y0 - 0.05, 0.3), M.dark, -0.02, (y0 - 0.05) / 2, 0));
      for (const z of [-0.215, 0.215]) g.add(mesh(new T.BoxGeometry(0.3, 0.03, 0.035), M.woodDark, 0, y0 + 0.2, z), mesh(new T.BoxGeometry(0.03, 0.2, 0.03), M.steel, 0.12, y0 + 0.1, z));
      const col = mesh(new T.CylinderGeometry(0.02, 0.026, y0 + 0.3, 8), M.steel, 0.37, (y0 + 0.3) / 2 - 0.02, 0); col.rotation.z = 0.14; g.add(col);
      const yoke = new T.Group(); yoke.position.set(0.3, y0 + 0.3, 0);
      const rim = mesh(new T.TorusGeometry(0.13, 0.02, 8, 22, Math.PI * 1.5), M.woodDark); rim.rotation.y = Math.PI / 2; rim.rotation.x = Math.PI * 0.75; yoke.add(rim);
      yoke.add(mesh(new T.BoxGeometry(0.02, 0.026, 0.25), M.steel)); const hub = mesh(new T.CylinderGeometry(0.035, 0.035, 0.04, 10), M.brass); hub.rotation.z = Math.PI / 2; yoke.add(hub);
      g.add(yoke);
      for (const z of [-0.1, 0.1]) { const p = mesh(new T.BoxGeometry(0.03, 0.13, 0.09), M.steel, 0.44, Math.max(0.1, y0 - 0.14), z); p.rotation.z = -0.5; g.add(p); }
      g.add(mesh(new T.TorusGeometry(0.07, 0.012, 6, 16), M.brass, 0.02, y0 + 0.02, 0.24));
      g.userData.yoke = yoke; g.userData.sitY = y0 - 0.155;
      return g;
    },
    panel(w, h) {       // 正面朝 +z：带立体表圈、遮光罩、磁罗盘与拨动开关的仪表板
      const g = new T.Group(), t = gaugeTex(), pw = w * 0.96, ph = h * 0.94;
      g.add(mesh(new T.BoxGeometry(w, h, 0.05), M.dark));
      g.add(mesh(new T.PlaneGeometry(pw, ph), new T.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xfff0c0, emissiveIntensity: 0.55, roughness: 0.5 }), 0, 0, 0.027));
      for (const [px, py, pr] of [[70, 80, 44], [180, 80, 44], [290, 80, 44], [400, 80, 44], [110, 190, 34], [210, 190, 34], [310, 190, 34], [410, 190, 34]])
        g.add(mesh(new T.TorusGeometry(pr / 512 * pw + 0.006, 0.008, 6, 20), M.brass, (px / 512 - 0.5) * pw, (0.5 - py / 256) * ph, 0.032));
      const hood = mesh(new T.BoxGeometry(w * 1.02, 0.03, 0.16), M.leather, 0, h / 2 + 0.01, 0.07); hood.rotation.x = 0.12; g.add(hood);
      g.add(mesh(new T.SphereGeometry(0.05, 12, 10), std(0x111111, 0.2, 0.3), 0, h / 2 + 0.07, 0.06)); g.add(mesh(new T.CylinderGeometry(0.035, 0.045, 0.03, 10), M.brass, 0, h / 2 + 0.035, 0.06));
      for (let i = 0; i < 5; i++) { const sw = mesh(new T.CylinderGeometry(0.008, 0.008, 0.05, 5), M.alu, pw * (0.4 + (i % 2) * 0.045), ph * (0.36 - i * 0.16), 0.045); sw.rotation.x = Math.PI / 2 - 0.5 + (i % 3) * 0.5; g.add(sw); }
      return g;
    },
    quadrant() {        // 油门台：靠远侧舱壁，正面朝 +z
      const g = new T.Group();
      g.add(mesh(new T.BoxGeometry(0.4, 0.5, 0.2), M.dark, 0, 0.25, 0));
      const top = mesh(new T.BoxGeometry(0.4, 0.05, 0.26), M.brass, 0, 0.52, 0.02); top.rotation.x = 0.35; g.add(top);
      [0xc81e1e, 0x2a5aa8, 0x1a1a1a].forEach((col, i) => {
        const l = new T.Group(); l.position.set(-0.12 + i * 0.12, 0.52, 0.02); l.rotation.x = 0.2 + i * 0.25;
        l.add(mesh(new T.CylinderGeometry(0.012, 0.012, 0.24, 6), M.steel, 0, 0.12, 0)); l.add(mesh(new T.SphereGeometry(0.038, 10, 8), std(col, 0.4), 0, 0.25, 0)); g.add(l);
      });
      const d = mesh(new T.CylinderGeometry(0.07, 0.07, 0.02, 16), std(0xe8dfc6, 0.4, 0, { emissive: 0xffe0a0, emissiveIntensity: 0.4 }), 0, 0.3, 0.105); d.rotation.x = Math.PI / 2; g.add(d);
      return g;
    },
    navTable() {
      const g = new T.Group();
      g.add(mesh(new T.BoxGeometry(0.74, 0.04, 0.34), M.wood, 0, 0.52, 0.04));
      for (const x of [-0.32, 0.32]) { const b = mesh(new T.BoxGeometry(0.03, 0.34, 0.03), M.steel, x, 0.37, 0.1); b.rotation.x = -0.6; g.add(b); }
      const ch = mesh(new T.PlaneGeometry(0.62, 0.28), new T.MeshStandardMaterial({ map: chartTex(), roughness: 0.9 }), 0, 0.543, 0.05); ch.rotation.x = -Math.PI / 2; g.add(ch);
      const arc = mesh(new T.TorusGeometry(0.09, 0.012, 6, 16, 1.4), M.brass, 0.24, 0.6, 0.02); arc.rotation.z = -2.3; g.add(arc);
      g.add(mesh(new T.CylinderGeometry(0.014, 0.014, 0.16, 6), M.brass, 0.25, 0.63, 0.02));
      g.add(mesh(new T.CylinderGeometry(0.012, 0.03, 0.2, 8), M.brass, -0.28, 0.64, -0.06));
      const shade = mesh(new T.ConeGeometry(0.075, 0.08, 12, 1, true), std(0x2a6a4a, 0.5, 0.3, { side: T.DoubleSide }), -0.28, 0.76, -0.06); g.add(shade);
      g.add(mesh(new T.SphereGeometry(0.028, 8, 8), new T.MeshBasicMaterial({ color: new T.Color(3.5, 2.6, 1.3) }), -0.28, 0.73, -0.06));
      const kit = St.deskKit(); kit.position.set(0.08, 0.542, -0.04); g.add(kit);
      return g;
    },
    fusePanel() {
      const g = new T.Group();
      g.add(mesh(new T.BoxGeometry(0.44, 0.52, 0.09), std(0x2a2420, 0.5, 0.2), 0, 0.78, 0));
      g.add(mesh(new T.BoxGeometry(0.4, 0.48, 0.02), M.brass, 0, 0.78, 0.04));
      g.add(mesh(new T.BoxGeometry(0.36, 0.44, 0.02), std(0x18181a, 0.6), 0, 0.78, 0.048));
      for (let i = 0; i < 4; i++) { const f = mesh(new T.CylinderGeometry(0.022, 0.022, 0.12, 8), std(0xe8d8a0, 0.2, 0, { emissive: 0xffb040, emissiveIntensity: 0.5 }), -0.12 + i * 0.08, 0.7, 0.07); g.add(f); }
      const sw = mesh(new T.BoxGeometry(0.03, 0.16, 0.03), M.copper, 0.1, 0.9, 0.08); sw.rotation.z = 0.5; g.add(sw);
      const bulbMat = new T.MeshBasicMaterial({ color: new T.Color(0.3, 3, 0.6) }); bulbMat.userData.dyn = true;
      g.add(mesh(new T.SphereGeometry(0.035, 10, 8), bulbMat, -0.1, 0.93, 0.07));
      return { g, bulbMat };
    },
    ladder(h) {         // 竖直贴壁的木梯（不再斜靠出蒙皮）
      const g = new T.Group();
      for (const x of [-0.17, 0.17]) g.add(mesh(new T.CylinderGeometry(0.02, 0.02, h, 6), M.woodLight, x, h / 2, 0));
      for (let y = 0.2; y < h - 0.04; y += 0.25) { const r = mesh(new T.CylinderGeometry(0.016, 0.016, 0.34, 6), M.woodLight, 0, y, 0); r.rotation.z = Math.PI / 2; g.add(r); }
      return g;
    },
    pump() {
      const g = new T.Group();
      g.add(mesh(new T.CylinderGeometry(0.09, 0.11, 0.2, 12), M.brass, 0, 0.1, 0)); g.add(mesh(new T.CylinderGeometry(0.03, 0.03, 0.3, 8), M.copper, 0.12, 0.08, 0));
      const lever = new T.Group(); lever.position.set(0, 0.2, 0);
      lever.add(mesh(new T.CylinderGeometry(0.018, 0.018, 0.62, 6), M.steel, 0, 0.31, 0)); lever.add(mesh(new T.SphereGeometry(0.05, 10, 8), M.red, 0, 0.64, 0)); g.add(lever);
      return { g, lever };
    },
    shelf(w) {
      const g = new T.Group();
      g.add(mesh(new T.BoxGeometry(w, 0.035, 0.26), M.wood, 0, 0.42, 0));
      for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) for (const z of [-0.1, 0.1]) g.add(mesh(new T.BoxGeometry(0.03, 0.42, 0.03), M.woodDark, x, 0.21, z));
      g.add(mesh(new T.BoxGeometry(w, 0.03, 0.03), M.woodDark, 0, 0.15, 0.1));
      return g;
    },
    crate(s) { const g = new T.Group(); g.add(mesh(new T.BoxGeometry(s, s * 0.7, s * 0.7), M.woodLight, 0, s * 0.35, 0)); g.add(mesh(new T.BoxGeometry(s * 1.02, s * 0.08, s * 0.72), M.woodDark, 0, s * 0.6, 0)); g.add(mesh(new T.BoxGeometry(s * 1.02, s * 0.08, s * 0.72), M.woodDark, 0, s * 0.12, 0)); return g; },
    lamp() {
      const g = new T.Group(), bulbMat = new T.MeshBasicMaterial({ color: new T.Color(4, 2.8, 1.4) }); bulbMat.userData.dyn = true;
      g.add(mesh(new T.CylinderGeometry(0.05, 0.065, 0.05, 10), M.brass, 0, 0.07, 0)); g.add(mesh(new T.SphereGeometry(0.05, 10, 8), bulbMat));
      for (let i = 0; i < 4; i++) { const a = i / 4 * 6.283; g.add(mesh(new T.CylinderGeometry(0.005, 0.005, 0.13, 4), M.brass, Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06)); }
      g.add(mesh(new T.CylinderGeometry(0.03, 0.03, 0.015, 8), M.brass, 0, -0.065, 0));
      return { g, bulbMat };
    },
    radio() {           // 无线电台：小搁板上的收发报机、电键与耳机。正面朝 +z，靠壁面在 z=-0.13
      const g = new T.Group();
      g.add(mesh(new T.BoxGeometry(0.5, 0.03, 0.24), M.wood, 0, 0.5, 0));
      for (const x of [-0.2, 0.2]) { const b = mesh(new T.BoxGeometry(0.025, 0.26, 0.025), M.steel, x, 0.4, 0.02); b.rotation.x = -0.55; g.add(b); }
      g.add(mesh(new T.BoxGeometry(0.34, 0.24, 0.18), std(0x23201c, 0.5, 0.2), -0.06, 0.635, -0.02));
      g.add(mesh(new T.BoxGeometry(0.3, 0.2, 0.01), M.brass, -0.06, 0.635, 0.072));
      const dial = mesh(new T.CylinderGeometry(0.05, 0.05, 0.012, 16), new T.MeshBasicMaterial({ color: new T.Color(2.6, 1.7, 0.7) }), -0.12, 0.66, 0.08); dial.rotation.x = Math.PI / 2; g.add(dial);
      for (const [x, y] of [[0.0, 0.69], [0.0, 0.6], [-0.12, 0.575]]) { const kn = mesh(new T.CylinderGeometry(0.02, 0.02, 0.03, 10), M.black, x, y, 0.09); kn.rotation.x = Math.PI / 2; g.add(kn); }
      g.add(mesh(new T.BoxGeometry(0.1, 0.02, 0.06), M.black, 0.17, 0.525, 0.04)); g.add(mesh(new T.BoxGeometry(0.09, 0.012, 0.016), M.brass, 0.17, 0.545, 0.04)); g.add(mesh(new T.SphereGeometry(0.016, 8, 6), M.black, 0.21, 0.56, 0.04));
      g.add(mesh(new T.TorusGeometry(0.06, 0.01, 6, 14, Math.PI), M.black, 0.19, 0.7, -0.06));
      for (const x of [0.13, 0.25]) { const c = mesh(new T.CylinderGeometry(0.03, 0.03, 0.025, 10), M.leather, x, 0.7, -0.06); c.rotation.z = Math.PI / 2; g.add(c); }
      return g;
    },
    lifeRing() {        // 贴壁，正面朝 +z
      const g = new T.Group(); g.add(mesh(new T.TorusGeometry(0.17, 0.05, 10, 26), std(0xf2ede0, 0.7)));
      for (let i = 0; i < 4; i++) { const b = mesh(new T.TorusGeometry(0.17, 0.053, 8, 6, 0.42), M.red); b.rotation.z = i * Math.PI / 2 + 0.58; g.add(b); }
      return g;
    },
    axe() {
      const g = new T.Group(), h = mesh(new T.CylinderGeometry(0.014, 0.018, 0.5, 6), M.woodLight); h.rotation.z = 0.9; g.add(h);
      const hd = mesh(new T.BoxGeometry(0.14, 0.1, 0.03), M.red, 0.19, 0.16, 0); hd.rotation.z = 0.9; g.add(hd);
      g.add(mesh(new T.BoxGeometry(0.05, 0.03, 0.03), M.steel, -0.1, -0.08, -0.015), mesh(new T.BoxGeometry(0.05, 0.03, 0.03), M.steel, 0.1, 0.08, -0.015));
      return g;
    },
    firstAid() {
      const g = new T.Group(); g.add(mesh(new T.BoxGeometry(0.24, 0.18, 0.08), std(0xf0ece2, 0.6)));
      g.add(mesh(new T.BoxGeometry(0.1, 0.03, 0.01), M.red, 0, 0, 0.042), mesh(new T.BoxGeometry(0.03, 0.1, 0.01), M.red, 0, 0, 0.042)); g.add(mesh(new T.BoxGeometry(0.06, 0.015, 0.02), M.brass, 0, 0.098, 0));
      return g;
    },
    rope() { const g = new T.Group(); for (let i = 0; i < 4; i++) { const r = mesh(new T.TorusGeometry(0.1 + (i % 2) * 0.012, 0.022, 6, 18), M.canvas, 0, 0, i * 0.022 - 0.03); r.rotation.z = i; g.add(r); } g.add(mesh(new T.CylinderGeometry(0.012, 0.012, 0.08, 6), M.brass, 0, 0.11, 0)); return g; },
    coat() {
      const g = new T.Group(), c = mesh(new T.CylinderGeometry(0.07, 0.15, 0.5, 10), M.leather, 0, -0.27, 0); c.scale.z = 0.4; g.add(c);
      for (const s of [-1, 1]) { const a = mesh(new T.CylinderGeometry(0.035, 0.045, 0.4, 8), M.leather, s * 0.15, -0.26, 0); a.rotation.z = s * 0.16; a.scale.z = 0.6; g.add(a); }
      g.add(mesh(new T.SphereGeometry(0.02, 8, 6), M.brass, 0, 0.0, -0.01)); g.add(mesh(new T.TorusGeometry(0.06, 0.02, 6, 12, Math.PI), std(0xe8dcc0, 0.9), 0, -0.04, 0.01));
      return g;
    },
    clock() { const g = new T.Group(), r = mesh(new T.CylinderGeometry(0.075, 0.075, 0.035, 18), M.brass); r.rotation.x = Math.PI / 2; g.add(r); const f = mesh(new T.CylinderGeometry(0.06, 0.06, 0.04, 18), std(0xf0e8d0, 0.4, 0, { emissive: 0xffe0a0, emissiveIntensity: 0.35 })); f.rotation.x = Math.PI / 2; g.add(f); g.add(mesh(new T.BoxGeometry(0.008, 0.05, 0.005), M.black, 0, 0.02, 0.022), mesh(new T.BoxGeometry(0.035, 0.008, 0.005), M.black, 0.015, 0, 0.022)); return g; },
    raft() {            // 捆好的救生筏
      const g = new T.Group(), b = mesh(new T.CapsuleGeometry(0.13, 0.3, 6, 12), std(0xe0a81e, 0.8), 0, 0.14, 0); b.rotation.z = Math.PI / 2; g.add(b);
      for (const x of [-0.11, 0.11]) { const s = mesh(new T.TorusGeometry(0.135, 0.012, 6, 16), M.dark, x, 0.14, 0); s.rotation.y = Math.PI / 2; g.add(s); }
      return g;
    },
    sack() {
      const g = new T.Group(), b = mesh(new T.SphereGeometry(0.16, 12, 10), M.canvas, 0, 0.15, 0); b.scale.set(1, 1.05, 0.85); g.add(b);
      g.add(mesh(new T.CylinderGeometry(0.035, 0.06, 0.08, 8), M.canvas, 0, 0.33, 0)); const tie = mesh(new T.TorusGeometry(0.04, 0.008, 5, 10), M.woodDark, 0, 0.31, 0); tie.rotation.x = Math.PI / 2; g.add(tie);
      return g;
    },
    oilCans() {
      const g = new T.Group();
      for (const [x, z, c] of [[-0.07, 0, 0x2a5a3a], [0.07, 0.02, 0xb3202a], [0, -0.09, 0x2a5a3a]]) { g.add(mesh(new T.CylinderGeometry(0.055, 0.055, 0.2, 12), std(c, 0.45, 0.3), x, 0.1, z)); g.add(mesh(new T.CylinderGeometry(0.014, 0.03, 0.05, 8), M.alu, x, 0.225, z)); }
      return g;
    },
    deskKit() {         // 导航桌上的航行日志、铅笔、番茄汁罐头与保温壶
      const g = new T.Group();
      const bk = mesh(new T.BoxGeometry(0.15, 0.022, 0.11), std(0x3a2a20, 0.7), 0.02, 0.011, 0.08); bk.rotation.y = 0.25; g.add(bk);
      const pg = mesh(new T.BoxGeometry(0.14, 0.006, 0.1), std(0xeee6d0, 0.9), 0.02, 0.025, 0.08); pg.rotation.y = 0.25; g.add(pg);
      const pc = mesh(new T.CylinderGeometry(0.005, 0.005, 0.12, 5), std(0xd8a020, 0.6), 0.03, 0.033, 0.08); pc.rotation.z = Math.PI / 2; pc.rotation.y = 0.9; g.add(pc);
      g.add(mesh(new T.CylinderGeometry(0.03, 0.03, 0.075, 12), std(0xb82a20, 0.4, 0.4), -0.14, 0.038, 0.1)); g.add(mesh(new T.CylinderGeometry(0.031, 0.031, 0.02, 12), M.cream, -0.14, 0.04, 0.1));
      g.add(mesh(new T.CylinderGeometry(0.036, 0.036, 0.17, 12), std(0x3a6a8a, 0.4, 0.4), -0.2, 0.085, -0.02)); g.add(mesh(new T.CylinderGeometry(0.028, 0.036, 0.04, 12), M.alu, -0.2, 0.19, -0.02));
      return g;
    },
    thermos() { const g = new T.Group(); g.add(mesh(new T.CylinderGeometry(0.05, 0.05, 0.22, 12), std(0x3a6a8a, 0.4, 0.4), 0, 0.11, 0)); g.add(mesh(new T.CylinderGeometry(0.04, 0.05, 0.05, 12), M.alu, 0, 0.245, 0)); return g; },
  };

  return { setCut, updateCut, clip, clipHi, ghost, resetGhosts, planes, std, lacquer, M, mesh, tex, detail, setDetail, photo, onPhoto: f => phSubs.push(f), get photos() { return PH; }, get detOn() { return detOn; }, secAt, secPt, halfW, topY, loft, outline, bulkhead, former, stringer, wing, wingSec, wingWire, plate, strut, wheel, bake, bakeStatic, propeller, radial, crew, animCrew, item, St, vOf, surfPt, arcLen, patch, merge, boxParts, ringParts, ringPartsF, wallBox, wallPipe };
})();
