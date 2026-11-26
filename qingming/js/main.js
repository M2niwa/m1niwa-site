// 《青冥劫》行者菜单 —— 入口
import { Stage } from './stage.js';
import { BagUI } from './bag.js';
import { MapUI } from './map.js';
import { HeroUI } from './hero.js';
import { FilesUI } from './files.js';
import { Pulse } from './pulse.js';
import { ITEM_DEFS as D, START_BAG, HERO, BAG_OPEN_ROWS } from './data.js';
import { icon } from './icons.js';

const VIEWS = ['hero', 'bag', 'map', 'files'];
const GLYPH = { hero: '行', bag: '囊', map: '图', files: '卷' };
const PROMPTS = {
  hero: [['拖拽', '转身'], ['Space', '出刀'], ['Q', 'E', '切换页签']],
  bag: [['↑↓←→', '选择'], ['Enter', '使用'], ['C', '合成'], ['R', '旋转'], ['F', '快捷'], ['Z', 'X', '分类'], ['Esc', '取消']],
  map: [['拖拽', '平移'], ['滚轮', '缩放'], ['PgUp', 'PgDn', '楼层'], ['Space', '定位']],
  files: [['↑', '↓', '翻阅'], ['Q', 'E', '切换页签']],
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);

let uidSeq = 1;
const game = {
  bag: START_BAG.map((b) => ({
    uid: uidSeq++, count: 1, r: 0, ...b,
    charges: b.charges ?? (D[b.def].charges ? D[b.def].charges[0] : undefined),
  })),
  openRows: BAG_OPEN_ROWS,
  quick: [null, null, null, null],
  hero: JSON.parse(JSON.stringify(HERO)),
  thumbs: new Map(),
  revealed: false,
  view: 'bag',
  nextUid: () => uidSeq++,
  has(id) { return this.bag.some((i) => i.def === id); },
  heal(f) { const h = this.hero; h.hp = Math.min(h.hpMax, Math.round(h.hp + h.hpMax * f)); },
  cure() { this.hero.poison = false; this.hero.cured = true; },
  reveal() { this.revealed = true; },
};
const uidOf = (def) => (game.bag.find((i) => i.def === def) || {}).uid ?? null;
game.quick = [uidOf('huichunhu'), uidOf('fulu'), uidOf('duanbi'), null];

// ---------- 提示、横幅、确认 ----------
let toastTimer = 0;
game.toast = (msg) => {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
};
let bannerEl = null, bannerCancel = null;
game.banner = (text, onCancel) => {
  bannerEl?.remove(); bannerEl = null; bannerCancel = null;
  if (!text) return;
  bannerEl = document.createElement('div');
  bannerEl.className = 'banner';
  bannerEl.innerHTML = `<span>${esc(text)}</span><button class="btn" type="button">取消 <span class="kbd">Esc</span></button>`;
  bannerCancel = onCancel;
  bannerEl.querySelector('button').addEventListener('click', () => onCancel && onCancel());
  $('layer').append(bannerEl);
};
let modal = null;
function closeModal() { modal?.el.remove(); modal = null; }
game.confirm = (title, text, okLabel, onOk) => {
  closeModal();
  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3><p>${esc(text)}</p>
    <div class="actions"><button class="btn" data-k="no">再想想</button><button class="btn primary" data-k="ok">${esc(okLabel)}</button></div></div>`;
  el.addEventListener('click', (e) => {
    const k = e.target.closest('[data-k]')?.dataset.k;
    if (e.target === el || k === 'no') closeModal();
    if (k === 'ok') { closeModal(); onOk(); }
  });
  $('layer').append(el);
  modal = { el, onOk };
  el.querySelector('[data-k="ok"]').focus();
};

async function showCredits() {
  closeModal();
  const el = document.createElement('div');
  el.className = 'modal';
  let list = [];
  try { list = await (await fetch('assets/credits.json')).json(); } catch (e) { list = []; }
  const row = (c) => `<div><b>${esc(c.name)}</b> — ${esc(c.authors)} · ${esc(c.license)} · <a href="${esc(c.source)}" target="_blank" rel="noopener">来源</a></div>`;
  const models = list.filter((c) => c.license.startsWith('CC0'));
  const icons = list.filter((c) => c.license.startsWith('CC BY'));
  const iconAuthors = [...new Set(icons.map((c) => c.authors))].join('、');
  el.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-label="素材与许可"><h3>素材与许可</h3>
    <p>本原型的设定、文案与界面均为原创；以下开源素材按各自许可使用。</p>
    <h4 class="h-label">三维模型（CC0 公有领域）</h4><div class="credit-list">${models.map(row).join('')}</div>
    <h4 class="h-label">图标（CC BY 3.0）</h4><div class="credit-list"><div>game-icons.net 图标 ${icons.length} 枚，作者：${esc(iconAuthors)}。<a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a></div></div>
    <h4 class="h-label">字体与引擎</h4><div class="credit-list">
      <div><b>Noto Serif SC、Ma Shan Zheng、Liu Jian Mao Cao</b> — Google Fonts · SIL Open Font License 1.1</div>
      <div><b>three.js r160</b> — MIT License</div></div>
    <div class="actions"><button class="btn primary" data-k="no">合上</button></div></div>`;
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-k]')) closeModal(); });
  $('layer').append(el);
  modal = { el };
}

// ---------- 组件 ----------
const stage = new Stage($('stage'));
game.stage = stage;
const bag = new BagUI(game);
const map = new MapUI(game);
const hero = new HeroUI(game);
const files = new FilesUI(game);
const bagPulse = new Pulse($('pulse-bag'));
let heroPulse = null;

game.rebindPulse = () => {
  const el = $('pulse-hero');
  heroPulse = el ? new Pulse(el) : null;
  heroPulse?.set(game.hero.hp / game.hero.hpMax, game.hero.poison);
};
game.refresh = () => {
  const h = game.hero;
  bagPulse.set(h.hp / h.hpMax, h.poison);
  if (game.view === 'hero') { hero.render(); game.rebindPulse(); }
  if (game.view === 'map') map.render();
};
game.refreshTabs = () => {
  document.querySelectorAll('.tab').forEach((t) => {
    const v = t.dataset.view;
    t.setAttribute('aria-selected', String(v === game.view));
    t.tabIndex = v === game.view ? 0 : -1;
    const dot = v === 'files' && files.unread();
    t.querySelector('.dot')?.remove();
    if (dot) t.insertAdjacentHTML('beforeend', '<i class="dot" aria-label="有未读"></i>');
  });
};

stage.bindAnchor('item', $('anchor-item'));
stage.bindAnchor('hero', $('anchor-hero'), { onTap: () => stage.heroStrike() });

function renderPrompts() {
  $('prompts').innerHTML = PROMPTS[game.view].map((p) => {
    const keys = p.slice(0, -1).map((k) => `<kbd>${esc(k)}</kbd>`).join('');
    return `<span>${keys}${esc(p[p.length - 1])}</span>`;
  }).join('');
}

function setView(v, { fromHash = false } = {}) {
  if (!VIEWS.includes(v)) v = 'bag';
  if (game.view === 'bag' && v !== 'bag') bag.cancelCombine();
  if (game.view !== v) window.scrollTo(0, 0);
  game.view = v;
  document.querySelectorAll('.view').forEach((s) => s.classList.toggle('on', s.id === `view-${v}`));
  $('glyph').textContent = GLYPH[v];
  stage.setView(v);
  game.refreshTabs();
  renderPrompts();
  if (v === 'bag') { bag.render(); bag.renderDetail(); }
  if (v === 'hero') { hero.render(); game.rebindPulse(); }
  if (v === 'map') map.render();
  if (v === 'files') files.render();
  if (!fromHash && location.hash !== `#${v}`) {
    try { history.replaceState(null, '', `#${v}`); } catch (e) { /* 忽略 */ }
  }
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
window.addEventListener('hashchange', () => setView(location.hash.slice(1), { fromHash: true }));
$('btn-credits').addEventListener('click', showCredits);
$('incense-ic').innerHTML = icon('lotus');

// ---------- 键盘 ----------
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (modal) {
    if (k === 'Escape') { closeModal(); e.preventDefault(); }
    if (k === 'Enter' && modal.onOk) { const fn = modal.onOk; closeModal(); fn(); e.preventDefault(); }
    return;
  }
  const lower = k.length === 1 ? k.toLowerCase() : k;
  if (lower === 'q' || lower === 'e') {
    const i = VIEWS.indexOf(game.view);
    setView(VIEWS[(i + (lower === 'q' ? -1 : 1) + VIEWS.length) % VIEWS.length]);
    e.preventDefault(); return;
  }
  if (game.view === 'bag') {
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (dir) { bag.moveCursor(...dir); e.preventDefault(); return; }
    if (k === 'Enter') { bag.act('use'); e.preventDefault(); }
    if (lower === 'c') { if (bag.combineFrom) bag.cancelCombine(); else bag.act('mix'); }
    if (lower === 'r') bag.rotateSelected();
    if (lower === 'f') bag.act('quick');
    if (lower === 'z') bag.cycleCat(-1);
    if (lower === 'x') bag.cycleCat(1);
    if (k === 'Delete' || k === 'Backspace') bag.act('drop');
    if (k === 'Escape') bag.cancelCombine();
  } else if (game.view === 'map') {
    if (k === 'PageUp') { map.stepFloor(-1); e.preventDefault(); }
    if (k === 'PageDown') { map.stepFloor(1); e.preventDefault(); }
    if (k === '+' || k === '=') map.zoom(1.2);
    if (k === '-') map.zoom(1 / 1.2);
    if (k === ' ') { map.centerOnPlayer(); e.preventDefault(); }
  } else if (game.view === 'files') {
    if (k === 'ArrowUp' || k === 'ArrowLeft') { files.step(-1); e.preventDefault(); }
    if (k === 'ArrowDown' || k === 'ArrowRight') { files.step(1); e.preventDefault(); }
  } else if (game.view === 'hero') {
    if (k === ' ' || k === 'Enter') { stage.heroStrike(); e.preventDefault(); }
  }
});

// ---------- 缩略图 ----------
let redrawQueued = false;
function queueRedraw() {
  if (redrawQueued) return;
  redrawQueued = true;
  requestAnimationFrame(() => {
    redrawQueued = false;
    if (game.view === 'bag') { if (!bag.drag) bag.render(); }
    if (game.view === 'hero') { hero.render(); game.rebindPulse(); }
    if (game.view === 'map') map.renderSide();
  });
}

async function makeThumbs() {
  const first = [...new Set(game.bag.map((i) => i.def))];
  const rest = Object.keys(D).filter((id) => !first.includes(id));
  const all = [...first, ...rest];
  let done = 0;
  const label = $('loading');
  label.textContent = `焚香候灯…… 0/${all.length}`;
  await Promise.all(all.map((id) => stage.thumbnail(D[id], D[id].w, D[id].h)
    .then((url) => { game.thumbs.set(id, url); queueRedraw(); })
    .catch((err) => console.warn('缩略图失败', id, err))
    .finally(() => { done++; label.textContent = `焚香候灯…… ${done}/${all.length}`; })));
  label.style.opacity = '0';
  setTimeout(() => label.remove(), 800);
}

// ---------- 启动 ----------
let lastT = performance.now();
function loop(now = performance.now()) {
  requestAnimationFrame(loop);
  try { stage.frame(); } catch (err) { console.error(err); }
  const dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000));
  lastT = now;
  if (game.view === 'bag') bagPulse.tick(dt);
  if (game.view === 'hero' && heroPulse) heroPulse.tick(dt);
}

bagPulse.set(game.hero.hp / game.hero.hpMax, game.hero.poison);
setView(location.hash.slice(1) || 'bag', { fromHash: true });
bag.select(uidOf('yinhundeng'));
requestAnimationFrame(loop);
makeThumbs();
stage.heroReady.catch((err) => { console.warn(err); $('hero-caption').textContent = '行者模型未能载入'; });
