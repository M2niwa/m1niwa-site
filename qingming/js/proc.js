// 程序化生成的小物件：符箓、黄表纸、腰囊、药包，以及舞台用的贴图
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function speckle(ctx, w, h, n, colors, rand) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    ctx.globalAlpha = 0.05 + rand() * 0.12;
    const r = 0.6 + rand() * 2.2;
    ctx.beginPath(); ctx.arc(rand() * w, rand() * h, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let paperTexCache = null;
function paperTexture() {
  if (paperTexCache) return paperTexCache;
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#cfa842'; x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 256, 900, ['#8a6a1c', '#f0d27a', '#6b4e12'], rng(7));
  paperTexCache = tex(c);
  return paperTexCache;
}

export function talismanTexture() {
  const [c, x] = canvas(256, 800);
  const rand = rng(42);
  const g = x.createLinearGradient(0, 0, 0, 800);
  g.addColorStop(0, '#d8b44c'); g.addColorStop(1, '#c49a35');
  x.fillStyle = g; x.fillRect(0, 0, 256, 800);
  speckle(x, 256, 800, 1600, ['#8a6a1c', '#f3dc8c', '#5a400e'], rand);
  x.strokeStyle = '#a3261b'; x.lineWidth = 5; x.strokeRect(12, 12, 232, 776);
  x.lineWidth = 2; x.strokeRect(22, 22, 212, 756);
  x.fillStyle = '#a8281c';
  x.font = '64px "Ma Shan Zheng", "KaiTi", serif';
  x.textAlign = 'center';
  x.fillText('敕', 128, 110); x.fillText('令', 128, 180);
  // 符胆：一笔连绵的折线与圆
  x.strokeStyle = '#a8281c'; x.lineCap = 'round'; x.lineJoin = 'round';
  x.lineWidth = 9;
  x.beginPath(); x.moveTo(70, 230);
  for (let i = 0; i < 9; i++) x.lineTo(i % 2 ? 190 : 70, 250 + i * 34);
  x.stroke();
  x.lineWidth = 6;
  x.beginPath(); x.arc(128, 600, 38, 0.3, Math.PI * 2 - 0.3); x.stroke();
  x.beginPath(); x.moveTo(128, 640); x.lineTo(128, 740); x.stroke();
  x.beginPath(); x.moveTo(80, 700); x.quadraticCurveTo(128, 660, 176, 700); x.stroke();
  x.font = '58px "Ma Shan Zheng", "KaiTi", serif';
  x.fillText('镇', 128, 610);
  return tex(c);
}

export function makeTalisman() {
  const geo = new THREE.PlaneGeometry(0.42, 1.3, 1, 24);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setZ(i, Math.sin(y * 3.2) * 0.05 + y * y * 0.04);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: talismanTexture(), side: THREE.DoubleSide, roughness: 0.92 });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  const g = new THREE.Group(); g.add(m);
  return g;
}

export function makePaperStack() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: 0.95 });
  const rand = rng(11);
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.012, 0.9), mat);
    s.position.y = i * 0.016;
    s.rotation.y = (rand() - 0.5) * 0.12;
    s.position.x = (rand() - 0.5) * 0.03;
    s.castShadow = s.receiveShadow = true;
    g.add(s);
  }
  const string = new THREE.MeshStandardMaterial({ color: 0x8c1f17, roughness: 0.7 });
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.13, 0.025), string);
  band.position.y = 0.05; g.add(band);
  return g;
}

export function makePouch() {
  const pts = [
    [0, 0], [0.22, 0.01], [0.38, 0.07], [0.48, 0.2], [0.5, 0.36], [0.45, 0.52], [0.33, 0.66],
    [0.2, 0.76], [0.15, 0.82], [0.17, 0.88], [0.24, 0.96], [0.27, 1.02],
  ].map(([a, b]) => new THREE.Vector2(a, b));
  const geo = new THREE.LatheGeometry(pts, 40);
  const pos = geo.attributes.position;
  const rand = rng(5);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const a = Math.atan2(z, x);
    const k = 1 + Math.sin(a * 7 + y * 9) * 0.03 * Math.min(1, y * 2);
    pos.setX(i, x * k); pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#5b4632'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 4) { x.fillStyle = i % 8 ? 'rgba(0,0,0,.08)' : 'rgba(255,240,210,.05)'; x.fillRect(0, i, 256, 2); }
  speckle(x, 256, 256, 600, ['#2a1e12', '#8a7050'], rand);
  const mat = new THREE.MeshStandardMaterial({ map: tex(c), roughness: 1 });
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = true;
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 32), new THREE.MeshStandardMaterial({ color: 0x8c1f17, roughness: 0.6 }));
  cord.rotation.x = Math.PI / 2; cord.position.y = 0.82;
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 6), cord.material);
  tail.position.set(0.17, 0.66, 0.03); tail.rotation.z = 0.25;
  const g = new THREE.Group(); g.add(body, cord, tail);
  return g;
}

export function makePacket(color = 0x6f8f5a) {
  const g = new THREE.Group();
  const [c, x] = canvas(256, 256);
  const col = new THREE.Color(color);
  x.fillStyle = '#86683c'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},.35)`; x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 256, 700, ['#3a2a14', '#efd9a8'], rng(3));
  x.strokeStyle = 'rgba(60,40,20,.35)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(0, 0); x.lineTo(256, 256); x.moveTo(256, 0); x.lineTo(0, 256); x.stroke();
  const mat = new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.75 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.2, 0.56), mat);
  box.castShadow = box.receiveShadow = true;
  const twine = new THREE.MeshStandardMaterial({ color: 0x9c8a62, roughness: 0.9 });
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.215, 0.03), twine);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.215, 0.58), twine);
  const [lc, lx] = canvas(128, 160);
  lx.fillStyle = '#b8321f'; lx.fillRect(0, 0, 128, 160);
  lx.fillStyle = '#f2dcc0'; lx.font = '84px "Ma Shan Zheng", "KaiTi", serif'; lx.textAlign = 'center';
  lx.fillText('药', 64, 112);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), new THREE.MeshStandardMaterial({ map: tex(lc), roughness: 0.8 }));
  label.rotation.x = -Math.PI / 2; label.position.set(0.2, 0.102, 0.08);
  g.add(box, b1, b2, label);
  return g;
}

export function makeProc(kind, color) {
  if (kind === 'talisman') return makeTalisman();
  if (kind === 'paper') return makePaperStack();
  if (kind === 'pouch') return makePouch();
  if (kind === 'packet') return makePacket(color);
  return new THREE.Group();
}

// 舞台贴图 ---------------------------------------------------------------
export function glowTexture(inner = 'rgba(255,196,130,.55)') {
  const [c, x] = canvas(256, 256);
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner); g.addColorStop(0.45, 'rgba(160,110,60,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return tex(c);
}

// 一笔圆相：用许多段弧叠出飞白
export function ensoTexture() {
  const [c, x] = canvas(1024, 1024);
  const rand = rng(23);
  x.translate(512, 512);
  for (let k = 0; k < 160; k++) {
    const r = 380 + (rand() - 0.5) * 46;
    const a0 = 0.35 + rand() * 0.2;
    const a1 = a0 + Math.PI * 1.72 + rand() * 0.25;
    x.strokeStyle = `rgba(230,214,176,${0.02 + rand() * 0.05})`;
    x.lineWidth = 2 + rand() * 9;
    x.beginPath(); x.arc((rand() - 0.5) * 8, (rand() - 0.5) * 8, r, a0, a1); x.stroke();
  }
  return tex(c);
}

// 一记斜扫的浓墨，边缘带飞白，夹几点金屑
export function inkStrokeTexture() {
  const [c, x] = canvas(1024, 1024);
  const rand = rng(77);
  x.translate(512, 560);
  x.rotate(-0.42);
  for (let k = 0; k < 220; k++) {
    const off = (rand() - 0.5) * 300;
    const len = 380 + rand() * 260;
    const w = 2 + rand() * 14;
    x.strokeStyle = `rgba(8,6,5,${0.04 + rand() * 0.12})`;
    x.lineWidth = w;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(-len, off + (rand() - 0.5) * 30);
    x.bezierCurveTo(-len * 0.3, off - 60 * rand(), len * 0.3, off + 60 * rand(), len * (0.7 + rand() * 0.3), off * 0.6);
    x.stroke();
  }
  for (let k = 0; k < 70; k++) {
    x.fillStyle = `rgba(214,170,90,${0.15 + rand() * 0.4})`;
    x.beginPath(); x.arc((rand() - 0.5) * 760, (rand() - 0.5) * 260, 0.8 + rand() * 2.2, 0, Math.PI * 2); x.fill();
  }
  return tex(c);
}

export function smokeTexture() {
  const [c, x] = canvas(256, 256);
  const rand = rng(99);
  for (let i = 0; i < 40; i++) {
    const px = 128 + (rand() - 0.5) * 110, py = 128 + (rand() - 0.5) * 70, r = 30 + rand() * 60;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  }
  return tex(c);
}
