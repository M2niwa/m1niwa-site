// 行囊：格子背包、拖拽、旋转、合成、快捷位
import { ITEM_DEFS as D, RARITY, CATEGORIES, RECIPES, BAG_COLS as COLS, BAG_ROWS as ROWS } from './data.js';
import { icon } from './icons.js';

const QUICK_DIR = ['↑', '←', '→', '↓'];
const CAT_ICON = { weapon: 'crossed-swords', med: 'herbs-bundle', tool: 'paper-lantern', key: 'skeleton-key', mat: 'mortar' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function findRecipe(a, b) {
  return RECIPES.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
}

export class BagUI {
  constructor(game) {
    this.g = game;
    this.grid = document.getElementById('grid');
    this.capEl = document.getElementById('cap');
    this.catsEl = document.getElementById('cats');
    this.detail = document.getElementById('detail');
    this.quickEl = document.getElementById('quick');
    this.cat = 'all';
    this.sel = null;
    this.cursor = [0, 0];
    this.combineFrom = null;
    this.drag = null;
    this._renderCats();
    this._bindGrid();
    document.getElementById('btn-sort').addEventListener('click', () => this.sort());
  }

  // ---------- 基础几何 ----------
  dims(it) { const d = D[it.def]; return it.r ? [d.h, d.w] : [d.w, d.h]; }
  get items() { return this.g.bag; }
  byUid(uid) { return this.items.find((i) => i.uid === uid); }
  itemAt(cx, cy, skip) {
    return this.items.find((it) => {
      if (it.uid === skip) return false;
      const [w, h] = this.dims(it);
      return cx >= it.x && cx < it.x + w && cy >= it.y && cy < it.y + h;
    });
  }
  fits(x, y, w, h, skip) {
    if (x < 0 || y < 0 || x + w > COLS || y + h > this.g.openRows) return false;
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) if (this.itemAt(i, j, skip)) return false;
    return true;
  }
  freeSpot(def, skip) {
    const d = D[def];
    for (const r of [0, 1]) {
      const [w, h] = r ? [d.h, d.w] : [d.w, d.h];
      for (let y = 0; y < this.g.openRows; y++) for (let x = 0; x < COLS; x++) if (this.fits(x, y, w, h, skip)) return { x, y, r };
      if (d.w === d.h) break;
    }
    return null;
  }
  used() { return this.items.reduce((n, it) => n + D[it.def].w * D[it.def].h, 0); }

  // ---------- 渲染 ----------
  _renderCats() {
    this.catsEl.innerHTML = '<span class="kbd" aria-hidden="true">Z</span>' + CATEGORIES.map((c) =>
      `<button class="cat" data-cat="${c.id}" aria-pressed="${c.id === this.cat}" title="${c.name}" aria-label="${c.name}">${icon(c.icon)}</button>`).join('') + '<span class="kbd" aria-hidden="true">X</span>';
    this.catsEl.querySelectorAll('.cat').forEach((b) => b.addEventListener('click', () => {
      this.cat = b.dataset.cat; this._renderCats(); this.render();
      this.g.toast(`筛选：${CATEGORIES.find((c) => c.id === this.cat).name}`);
    }));
  }

  cycleCat(step) {
    const i = CATEGORIES.findIndex((c) => c.id === this.cat);
    this.cat = CATEGORIES[(i + step + CATEGORIES.length) % CATEGORIES.length].id;
    this._renderCats(); this.render();
  }

  _thumbHTML(it, ghost) {
    const d = D[it.def];
    const src = this.g.thumbs.get(it.def);
    if (!src) return `<svg class="thumb-ic" viewBox="0 0 512 512" aria-hidden="true">${icon(CAT_ICON[d.cat]).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`;
    if (it.r) return `<img src="${src}" alt="" style="width:calc(var(--cell)*${d.w} - 12px);height:calc(var(--cell)*${d.h} - 12px);object-fit:contain">`;
    return `<img src="${src}" alt="">`;
  }

  _itemHTML(it) {
    const d = D[it.def];
    const [w, h] = this.dims(it);
    const q = this.g.quick.indexOf(it.uid);
    const cls = ['it'];
    if (it.r) cls.push('rot');
    if (this.sel === it.uid) cls.push('sel');
    if (this.cat !== 'all' && d.cat !== this.cat) cls.push('dim');
    const src = this.combineFrom && this.byUid(this.combineFrom);
    if (src && it.uid !== src.uid) cls.push(findRecipe(src.def, it.def) ? 'can-combine' : 'dim');
    const cnt = d.stack > 1 ? it.count : (d.charges ? `${it.charges}/${d.charges[1]}` : '');
    return `<div class="${cls.join(' ')}" data-uid="${it.uid}" role="button" tabindex="-1" aria-label="${esc(d.name)}"
      style="left:calc(var(--cell)*${it.x});top:calc(var(--cell)*${it.y});width:calc(var(--cell)*${w});height:calc(var(--cell)*${h});--rar:${RARITY[d.rarity].color}">
      <div class="frame"></div>${this._thumbHTML(it)}
      ${cnt !== '' ? `<span class="cnt">${cnt}</span>` : ''}
      ${it.equipped ? '<span class="eq">装</span>' : ''}
      ${q >= 0 ? `<span class="qk">${QUICK_DIR[q]}</span>` : ''}
    </div>`;
  }

  render() {
    const open = this.g.openRows;
    let cells = '';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const cur = this.cursor[0] === x && this.cursor[1] === y;
      cells += `<div class="cell${y >= open ? ' locked' : ''}${cur ? ' cursor' : ''}" data-x="${x}" data-y="${y}"></div>`;
    }
    const note = open < ROWS ? '<div class="locked-note">寻得腰囊可解此行</div>' : '';
    this.grid.innerHTML = cells + note + this.items.map((it) => this._itemHTML(it)).join('');
    this.capEl.textContent = `${this.used()} / ${COLS * open} 格`;
    this.renderQuick();
  }

  renderQuick() {
    this.quickEl.innerHTML = [0, 1, 2, 3].map((q) => {
      const it = this.byUid(this.g.quick[q]);
      const src = it && this.g.thumbs.get(it.def);
      const inner = it ? (src ? `<img src="${src}" alt="${esc(D[it.def].name)}">` : icon(CAT_ICON[D[it.def].cat])) : '';
      return `<button class="qs" data-q="${q}" aria-label="快捷${QUICK_DIR[q]}${it ? '：' + esc(D[it.def].name) : '（空）'}"><span class="qk-key">${QUICK_DIR[q]}</span>${inner}</button>`;
    }).join('') + '<div class="qcenter">快捷</div>';
    this.quickEl.querySelectorAll('.qs').forEach((b) => b.addEventListener('click', () => this.quickClick(+b.dataset.q)));
  }

  renderDetail() {
    const it = this.byUid(this.sel);
    if (!it) {
      this.detail.innerHTML = '<p class="empty-note">选一件物什，看个仔细。</p>';
      return;
    }
    const d = D[it.def];
    const rar = RARITY[d.rarity];
    const held = d.stack > 1 ? `${it.count} / ${d.stack}` : (d.charges ? `余 ${it.charges} / ${d.charges[1]}` : '1');
    const stats = d.stats.map(([k, v]) => {
      if (it.def === 'huichunhu' && k === '余量') v = `${it.charges}/${d.charges[1]}`;
      return `<div class="stat"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
    }).join('');
    const useLabel = { equip: it.equipped ? '卸下' : '装备', drink: '饮用', heal: '服用', cure: '服用', expand: '系上', reveal: '启用', none: '使用' }[d.use];
    const canMix = RECIPES.some((r) => r.a === it.def || r.b === it.def);
    const inQuick = this.g.quick.includes(it.uid);
    this.detail.innerHTML = `
      <div class="rar" style="color:${rar.color}">${rar.name}</div>
      <h3>${esc(d.name)}</h3>
      <div class="tagline">${esc(d.tag)}</div>
      <hr class="rule">
      <div class="kv"><span>持有</span><b>${held}</b></div>
      <div class="kv"><span>占格</span><b>${d.w} × ${d.h}</b></div>
      <p class="desc">${esc(d.desc)}</p>
      <div class="stats">${stats}</div>
      <div class="actions">
        <button class="btn primary" data-act="use">${useLabel}</button>
        <button class="btn" data-act="mix" ${canMix ? '' : 'disabled'}>合成</button>
        <button class="btn" data-act="quick">${inQuick ? '移出快捷' : '设为快捷'}</button>
        <button class="btn danger" data-act="drop" ${d.cat === 'key' ? 'disabled title="要物不可舍弃"' : ''}>舍弃</button>
      </div>`;
    this.detail.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.act)));
  }

  select(uid, { show = true } = {}) {
    this.sel = uid;
    const it = this.byUid(uid);
    if (it) this.cursor = [it.x, it.y];
    this.render();
    this.renderDetail();
    if (it && show) this.g.stage.showItem(it.def, D[it.def]);
    if (!it) this.g.stage.clearItem();
  }

  // ---------- 拖拽 ----------
  _cellSize() { return this.grid.getBoundingClientRect().width / COLS; }

  _bindGrid() {
    this.grid.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const el = e.target.closest('.it');
      if (!el) {
        const cell = e.target.closest('.cell');
        if (cell) { this.cursor = [+cell.dataset.x, +cell.dataset.y]; const it = this.itemAt(...this.cursor); if (it) this.pick(it); else this.render(); }
        return;
      }
      const it = this.byUid(+el.dataset.uid);
      const rect = this.grid.getBoundingClientRect();
      const cs = rect.width / COLS;
      this.drag = {
        it, el, id: e.pointerId, sx: e.clientX, sy: e.clientY, started: false,
        gx: Math.floor((e.clientX - rect.left) / cs) - it.x, gy: Math.floor((e.clientY - rect.top) / cs) - it.y,
        r: it.r,
      };
      this.grid.setPointerCapture(e.pointerId);
    });
    this.grid.addEventListener('pointermove', (e) => {
      const dg = this.drag;
      if (!dg || e.pointerId !== dg.id) return;
      if (!dg.started) {
        if (Math.abs(e.clientX - dg.sx) + Math.abs(e.clientY - dg.sy) < 6) return;
        if (this.combineFrom) return;
        this._startDrag();
      }
      this._moveDrag(e.clientX, e.clientY);
    });
    const up = (e) => {
      const dg = this.drag;
      if (!dg || e.pointerId !== dg.id) return;
      this.drag = null;
      if (!dg.started) { this.pick(dg.it); return; }
      this._endDrag(dg);
    };
    this.grid.addEventListener('pointerup', up);
    this.grid.addEventListener('pointercancel', (e) => { if (this.drag && this.drag.started) { this.drag.cancel = true; this._endDrag(this.drag); } this.drag = null; });
    this.grid.addEventListener('contextmenu', (e) => { if (this.drag && this.drag.started) { e.preventDefault(); this.rotateDrag(); } });
    this.grid.addEventListener('wheel', (e) => { if (this.drag && this.drag.started) { e.preventDefault(); this.rotateDrag(); } }, { passive: false });
  }

  pick(it) {
    if (this.combineFrom) { this.finishCombine(it); return; }
    this.select(it.uid);
  }

  _startDrag() {
    const dg = this.drag;
    dg.started = true;
    this.select(dg.it.uid);
    dg.el = this.grid.querySelector(`.it[data-uid="${dg.it.uid}"]`);
    dg.el.classList.add('dragging');
    dg.ghost = document.createElement('div');
    dg.ghost.className = 'ghost';
    dg.place = document.createElement('div');
    dg.place.className = 'place';
    this.grid.append(dg.ghost, dg.place);
    this._ghostHTML();
  }

  _ghostHTML() {
    const dg = this.drag;
    const tmp = { ...dg.it, r: dg.r };
    const [w, h] = this.dims(tmp);
    dg.w = w; dg.h = h;
    dg.gx = Math.min(dg.gx, w - 1); dg.gy = Math.min(dg.gy, h - 1);
    dg.ghost.innerHTML = this._itemHTML(tmp).replace(/style="left:[^;]*;top:[^;]*;/, 'style="left:0;top:0;');
    dg.ghost.style.width = `calc(var(--cell)*${w})`;
    dg.ghost.style.height = `calc(var(--cell)*${h})`;
    if (dg.lx !== undefined) this._moveDrag(dg.lx, dg.ly);
  }

  rotateDrag() {
    const dg = this.drag;
    if (!dg || !dg.started) return;
    const d = D[dg.it.def];
    if (d.w === d.h) return;
    dg.r = dg.r ? 0 : 1;
    [dg.gx, dg.gy] = [dg.gy, dg.gx];
    this._ghostHTML();
  }

  _moveDrag(cx, cy) {
    const dg = this.drag;
    dg.lx = cx; dg.ly = cy;
    const rect = this.grid.getBoundingClientRect();
    const cs = rect.width / COLS;
    const px = cx - rect.left, py = cy - rect.top;
    dg.ghost.style.left = `${px - (dg.gx + 0.5) * cs}px`;
    dg.ghost.style.top = `${py - (dg.gy + 0.5) * cs}px`;
    const tx = Math.floor(px / cs) - dg.gx, ty = Math.floor(py / cs) - dg.gy;
    const hover = this.itemAt(Math.floor(px / cs), Math.floor(py / cs), dg.it.uid);
    dg.target = null;
    dg.tx = tx; dg.ty = ty;
    if (hover && findRecipe(dg.it.def, hover.def)) {
      const [hw, hh] = this.dims(hover);
      dg.target = hover;
      Object.assign(dg.place.style, { left: `${hover.x * cs}px`, top: `${hover.y * cs}px`, width: `${hw * cs}px`, height: `${hh * cs}px` });
      dg.place.className = 'place mix';
      dg.ok = false;
      return;
    }
    dg.ok = this.fits(tx, ty, dg.w, dg.h, dg.it.uid);
    const x0 = Math.max(0, Math.min(COLS - dg.w, tx)), y0 = Math.max(0, Math.min(ROWS - dg.h, ty));
    Object.assign(dg.place.style, { left: `${x0 * cs}px`, top: `${y0 * cs}px`, width: `${dg.w * cs}px`, height: `${dg.h * cs}px` });
    dg.place.className = `place ${dg.ok ? 'ok' : 'bad'}`;
  }

  _endDrag(dg) {
    dg.ghost?.remove(); dg.place?.remove();
    if (!dg.cancel && dg.target) { this.combine(dg.it, dg.target); return; }
    if (!dg.cancel && dg.ok) {
      dg.it.x = dg.tx; dg.it.y = dg.ty; dg.it.r = dg.r;
      this.cursor = [dg.it.x, dg.it.y];
    } else if (!dg.cancel) {
      this.g.toast('放不下。');
    }
    this.render();
  }

  // ---------- 键盘 ----------
  moveCursor(dx, dy) {
    let [x, y] = this.cursor;
    const cur = this.itemAt(x, y);
    // 跳出当前物件
    for (let n = 0; n < 8; n++) {
      x = (x + dx + COLS) % COLS;
      y = (y + dy + this.g.openRows) % this.g.openRows;
      if (!cur || this.itemAt(x, y) !== cur) break;
    }
    this.cursor = [x, y];
    const it = this.itemAt(x, y);
    if (it) this.select(it.uid); else this.render();
  }

  rotateSelected() {
    if (this.drag && this.drag.started) { this.rotateDrag(); return; }
    const it = this.byUid(this.sel);
    if (!it) return;
    const d = D[it.def];
    if (d.w === d.h) { this.g.toast('方方正正，转了也一样。'); return; }
    const r = it.r ? 0 : 1;
    const [w, h] = r ? [d.h, d.w] : [d.w, d.h];
    if (this.fits(it.x, it.y, w, h, it.uid)) { it.r = r; this.render(); }
    else this.g.toast('此处转不开，可先挪个地方。');
  }

  // ---------- 动作 ----------
  act(a) {
    const it = this.byUid(this.sel);
    if (!it) return;
    if (a === 'use') this.use(it);
    if (a === 'mix') this.startCombine(it);
    if (a === 'quick') this.toggleQuick(it);
    if (a === 'drop') this.askDrop(it);
  }

  use(it) {
    const d = D[it.def];
    const g = this.g;
    switch (d.use) {
      case 'equip': {
        if (it.equipped) { it.equipped = false; g.toast(`卸下${d.name}。`); }
        else {
          this.items.forEach((o) => { if (o !== it && D[o.def].slot === d.slot) o.equipped = false; });
          it.equipped = true; g.toast(`${d.name}已在手。`);
        }
        break;
      }
      case 'drink': {
        if (it.charges <= 0) { g.toast('壶已见底，须在净室焚香续满。'); return; }
        if (g.hero.hp >= g.hero.hpMax) { g.toast('气血充盈，无需饮用。'); return; }
        it.charges -= 1; g.heal(0.4);
        g.toast(`饮下一口药汤，气血回复。（余 ${it.charges}）`);
        break;
      }
      case 'heal': {
        if (g.hero.hp >= g.hero.hpMax) { g.toast('气血充盈，无需服用。'); return; }
        g.heal(d.heal); this.remove(it); g.toast(`服下${d.name}。`);
        break;
      }
      case 'cure': {
        if (!g.hero.poison) { g.toast('脉中无蛊，留着备用吧。'); return; }
        g.cure(); this.remove(it); g.toast('一股苦凉直入心脉，蛊毒退了。');
        break;
      }
      case 'expand': {
        g.openRows = ROWS; this.remove(it); g.toast('系上腰囊，行囊多出一行。');
        break;
      }
      case 'reveal': {
        g.reveal(); g.toast('罗盘指针乱转一阵后定住……舆图上已标出遗物所在。');
        break;
      }
      default: g.toast(d.hint || '此处用不上。');
    }
    this.render(); this.renderDetail(); g.refresh();
  }

  remove(it) {
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
    this.g.quick = this.g.quick.map((u) => (u === it.uid ? null : u));
    if (this.sel === it.uid) { this.sel = null; this.g.stage.clearItem(); }
  }

  addItem(def, n) {
    const d = D[def];
    for (const it of this.items) {
      if (n <= 0) break;
      if (it.def === def && d.stack > 1 && it.count < d.stack) {
        const k = Math.min(n, d.stack - it.count); it.count += k; n -= k;
      }
    }
    const made = [];
    while (n > 0) {
      const spot = this.freeSpot(def);
      if (!spot) break;
      const k = Math.min(n, d.stack);
      const it = { uid: this.g.nextUid(), def, ...spot, count: k };
      this.items.push(it); made.push(it); n -= k;
    }
    return { left: n, made };
  }

  startCombine(it) {
    this.combineFrom = it.uid;
    this.g.banner(`合成：选择与「${D[it.def].name}」相配之物`, () => this.cancelCombine());
    this.render();
  }

  cancelCombine() {
    if (!this.combineFrom) return;
    this.combineFrom = null;
    this.g.banner(null);
    this.render();
  }

  finishCombine(target) {
    const src = this.byUid(this.combineFrom);
    this.combineFrom = null;
    this.g.banner(null);
    if (!src || target.uid === src.uid) { this.render(); return; }
    this.combine(src, target);
  }

  combine(a, b) {
    const rec = findRecipe(a.def, b.def);
    if (!rec) { this.g.toast('二者无法相合。'); this.render(); return; }
    let result;
    if (rec.partial) {
      const snapshot = this.items.map((i) => ({ ...i }));
      const quickSnap = [...this.g.quick];
      const selSnap = this.sel;
      for (const it of [a, b]) { it.count -= 1; if (it.count <= 0) this.remove(it); }
      const { left, made } = this.addItem(rec.out, rec.n);
      if (left > 0) {
        this.g.bag = snapshot; this.g.quick = quickSnap; this.sel = selSnap;
        this.g.toast('行囊已满，无处安放新物。'); this.render(); return;
      }
      result = made[0] || this.items.find((i) => i.def === rec.out);
    } else {
      const spot = { x: b.x, y: b.y };
      this.remove(a); this.remove(b);
      result = { uid: this.g.nextUid(), def: rec.out, x: spot.x, y: spot.y, r: 0, count: 1 };
      this.items.push(result);
    }
    this.g.toast(rec.text);
    if (result) this.select(result.uid);
    else this.render();
  }

  toggleQuick(it) {
    const q = this.g.quick.indexOf(it.uid);
    if (q >= 0) { this.g.quick[q] = null; this.g.toast('已移出快捷。'); }
    else {
      let slot = this.g.quick.indexOf(null);
      if (slot < 0) slot = 3;
      this.g.quick[slot] = it.uid;
      this.g.toast(`已设为快捷「${QUICK_DIR[slot]}」。`);
    }
    this.render(); this.renderDetail();
  }

  quickClick(q) {
    const it = this.byUid(this.sel);
    const cur = this.byUid(this.g.quick[q]);
    if (it && it.uid !== this.g.quick[q]) {
      this.g.quick = this.g.quick.map((u) => (u === it.uid ? null : u));
      this.g.quick[q] = it.uid;
      this.g.toast(`「${D[it.def].name}」设为快捷「${QUICK_DIR[q]}」。`);
      this.render(); this.renderDetail();
    } else if (cur) this.select(cur.uid);
  }

  askDrop(it) {
    const d = D[it.def];
    if (d.cat === 'key') { this.g.toast('要物不可舍弃。'); return; }
    this.g.confirm(`舍弃「${d.name}」？`, '舍弃之物不可寻回。', '舍弃', () => {
      if (it.equipped) it.equipped = false;
      this.remove(it); this.select(null); this.g.toast(`舍弃了${d.name}。`); this.g.refresh();
    });
  }

  sort() {
    const before = this.items.map((i) => ({ x: i.x, y: i.y, r: i.r }));
    const order = [...this.items].sort((p, q) => {
      const a = D[p.def], b = D[q.def];
      return (b.w * b.h) - (a.w * a.h) || Math.max(b.w, b.h) - Math.max(a.w, a.h) || CATEGORIES.findIndex((c) => c.id === a.cat) - CATEGORIES.findIndex((c) => c.id === b.cat);
    });
    order.forEach((it) => { it.x = -99; it.y = -99; });
    for (const it of order) {
      const spot = this.freeSpot(it.def, it.uid);
      if (!spot) {
        this.items.forEach((o, i) => Object.assign(o, before[i]));
        this.g.toast('收拾不开，维持原样。'); this.render(); return;
      }
      Object.assign(it, spot);
    }
    this.g.toast('行囊已整理。');
    this.render();
  }
}
