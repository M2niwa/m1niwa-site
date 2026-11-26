// 舆图：手绘墨线的寺院平面，房间状态着色，楼层切换，拖拽平移与缩放
import { ROOMS, DOORS, STAIRS, FLOORS, PLAYER, OBJECTIVE, ITEM_DEFS as D } from './data.js';
import { ICONS, icon } from './icons.js';

const U = 40; // 1 格 = 40 单位
const MAP_W = 23 * U, MAP_H = 19 * U;
const STYLE = {
  items: { fill: 'rgba(178,58,44,.48)', stroke: '#d06a52', text: '尚有遗物', color: '#d65a44' },
  clear: { fill: 'rgba(70,104,118,.46)', stroke: '#86a9b4', text: '已搜尽', color: '#86a9b4' },
  unseen: { fill: 'url(#hatch)', stroke: 'rgba(217,196,150,.32)', text: '未踏足', color: '#a39780', dash: '6 5' },
  safe: { fill: 'rgba(201,164,90,.26)', stroke: '#c9a45a', text: '净室 · 可歇息', color: '#e7c983' },
  sealed: { fill: 'rgba(70,50,96,.55)', stroke: '#9a82cf', text: '封印', color: '#9a82cf' },
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function glyph(name, x, y, size, color) {
  return `<svg x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" viewBox="0 0 512 512" pointer-events="none"><path fill="${color}" d="${ICONS[name]}"/></svg>`;
}

export class MapUI {
  constructor(game) {
    this.g = game;
    this.svg = document.getElementById('map-svg');
    this.frame = document.getElementById('map-frame');
    this.side = document.getElementById('map-side');
    this.floorsEl = document.getElementById('floors');
    this.locEl = document.getElementById('map-loc');
    document.getElementById('objective').textContent = `当前目标：${OBJECTIVE}`;
    this.floor = PLAYER.floor;
    this.sel = PLAYER.room;
    this.vp = { x: 0, y: 0, k: 1 };
    this.fitted = false;
    this._bind();
    new ResizeObserver(() => { if (this.frame.clientWidth) { if (!this.fitted) this.fit(); this.apply(); } }).observe(this.frame);
  }

  fit() {
    const W = this.frame.clientWidth, H = this.frame.clientHeight;
    if (!W || !H) return;
    const k = Math.min(W / (MAP_W + 40), H / (MAP_H + 40));
    this.vp = { k, x: (W - MAP_W * k) / 2, y: (H - MAP_H * k) / 2 };
    this.fitted = true;
  }

  apply() {
    const g = this.svg.querySelector('#vp');
    this.svg.setAttribute('viewBox', `0 0 ${this.frame.clientWidth} ${this.frame.clientHeight}`);
    if (g) g.setAttribute('transform', `translate(${this.vp.x.toFixed(1)} ${this.vp.y.toFixed(1)}) scale(${this.vp.k.toFixed(4)})`);
  }

  zoom(f, cx, cy) {
    const W = this.frame.clientWidth, H = this.frame.clientHeight;
    if (cx === undefined) { cx = W / 2; cy = H / 2; }
    const k = Math.max(0.35, Math.min(3, this.vp.k * f));
    const r = k / this.vp.k;
    this.vp.x = cx - (cx - this.vp.x) * r;
    this.vp.y = cy - (cy - this.vp.y) * r;
    this.vp.k = k;
    this.apply();
  }

  centerOnPlayer() {
    this.setFloor(PLAYER.floor);
    this.sel = PLAYER.room;
    const W = this.frame.clientWidth, H = this.frame.clientHeight;
    this.vp.k = Math.max(this.vp.k, 1.1);
    this.vp.x = W / 2 - PLAYER.at[0] * U * this.vp.k;
    this.vp.y = H / 2 - PLAYER.at[1] * U * this.vp.k;
    this.render();
  }

  setFloor(f) {
    this.floor = f;
    if (!ROOMS.some((r) => r.id === this.sel && r.floor === f)) {
      this.sel = f === PLAYER.floor ? PLAYER.room : null;
    }
    this.render();
  }

  stepFloor(d) {
    const i = FLOORS.findIndex((f) => f.id === this.floor);
    const n = FLOORS[Math.max(0, Math.min(FLOORS.length - 1, i + d))];
    if (n.id !== this.floor) this.setFloor(n.id);
  }

  _bind() {
    let drag = null;
    this.frame.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: this.vp.x, y: this.vp.y, moved: false };
      this.frame.setPointerCapture(e.pointerId);
    });
    this.frame.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) { this.vp.x = drag.x + dx; this.vp.y = drag.y + dy; this.apply(); }
    });
    this.frame.addEventListener('pointerup', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      if (moved) return;
      const hit = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.closest && el.closest('.room-g'));
      const room = hit && hit.closest('.room-g');
      if (room) { this.sel = room.dataset.id; this.render(); }
    });
    this.frame.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.frame.getBoundingClientRect();
      this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    document.getElementById('zoom-in').addEventListener('click', () => this.zoom(1.25));
    document.getElementById('zoom-out').addEventListener('click', () => this.zoom(0.8));
    document.getElementById('zoom-me').addEventListener('click', () => this.centerOnPlayer());
  }

  _floorsHTML() {
    this.floorsEl.innerHTML = FLOORS.map((f) => `<button class="floor-btn" data-f="${f.id}" aria-pressed="${f.id === this.floor}" title="${f.name}">${f.short}</button>`).join('');
    this.floorsEl.querySelectorAll('.floor-btn').forEach((b) => b.addEventListener('click', () => this.setFloor(b.dataset.f)));
  }

  render() {
    if (!this.fitted) this.fit();
    this._floorsHTML();
    const fl = FLOORS.find((f) => f.id === this.floor);
    this.locEl.textContent = `青冥寺 · ${fl.name}`;
    const rooms = ROOMS.filter((r) => r.floor === this.floor);
    const revealed = this.g.revealed;
    let out = `<defs>
      <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="4" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <pattern id="hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="9" height="9" fill="rgba(24,19,14,.7)"/><line x1="0" y1="0" x2="0" y2="9" stroke="rgba(217,196,150,.16)" stroke-width="2"/>
      </pattern>
      <pattern id="paper-grid" width="${U}" height="${U}" patternUnits="userSpaceOnUse">
        <path d="M ${U} 0 L 0 0 0 ${U}" fill="none" stroke="rgba(217,196,150,.045)" stroke-width="1"/>
      </pattern>
      <radialGradient id="me-glow"><stop offset="0" stop-color="rgba(231,201,131,.55)"/><stop offset="1" stop-color="rgba(231,201,131,0)"/></radialGradient>
    </defs><g id="vp">`;
    out += `<rect x="-${U * 4}" y="-${U * 4}" width="${MAP_W + U * 8}" height="${MAP_H + U * 8}" fill="url(#paper-grid)"/>`;
    out += `<text x="${MAP_W - U * 0.6}" y="${U * 1.4}" font-size="56" fill="rgba(217,196,150,.10)" text-anchor="end" font-family="Ma Shan Zheng, KaiTi, serif">${fl.name}</text>`;

    for (const r of rooms) {
      const [x, y, w, h] = r.rect;
      const st = STYLE[r.state];
      const sel = r.id === this.sel;
      const here = r.id === PLAYER.room;
      out += `<g class="room-g" data-id="${r.id}">
        <rect x="${x * U}" y="${y * U}" width="${w * U}" height="${h * U}" fill="${st.fill}" stroke="${sel ? '#f2e3bd' : st.stroke}"
          stroke-width="${sel ? 3.2 : 1.8}" ${st.dash ? `stroke-dasharray="${st.dash}"` : ''} filter="url(#rough)"/>`;
      const cx = (x + w / 2) * U, cy = (y + h / 2) * U;
      const vertical = w <= 3 && h > w * 1.5;
      const label = esc(r.name.replace(' · ', '·'));
      const fs = Math.min(17, Math.max(12, w * 3.6));
      if (vertical) out += `<text x="${cx}" y="${cy}" font-size="${fs}" fill="${here ? '#f2e3bd' : 'rgba(232,222,200,.86)'}" text-anchor="middle" dominant-baseline="middle" style="writing-mode:vertical-rl" letter-spacing="3">${label}</text>`;
      else out += `<text x="${cx}" y="${cy - (r.state === 'safe' ? 10 : 0)}" font-size="${fs}" fill="${here ? '#f2e3bd' : 'rgba(232,222,200,.86)'}" text-anchor="middle" dominant-baseline="middle" font-weight="${here ? 700 : 400}">${label}</text>`;
      if (r.state === 'safe') out += glyph('incense', cx, cy + 16, 22, '#e7c983');
      if (r.state === 'sealed') out += glyph('wax-seal', cx, cy + 22, 22, '#b9a3e6');
      if (r.boss) out += `<text x="${cx}" y="${cy + 26}" font-size="22" fill="rgba(214,90,68,.55)" text-anchor="middle" font-family="Ma Shan Zheng, serif">凶</text>`;
      out += '</g>';
      if (revealed && r.loot && r.loot.length && r.state === 'items') {
        r.loot.forEach((id, i) => {
          const lx = (x + w - 0.55 - i * 0.6) * U, ly = (y + 0.55) * U;
          out += `<g pointer-events="none"><rect x="${lx - 6}" y="${ly - 6}" width="12" height="12" transform="rotate(45 ${lx} ${ly})" fill="#e7c983" stroke="#2a1f14" stroke-width="1.5"/></g>`;
        });
      }
    }
    for (const d of DOORS.filter((d) => d.floor === this.floor)) {
      const [x1, y1, x2, y2] = d.at.map((v) => v * U);
      out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1c1611" stroke-width="7" stroke-linecap="butt"/>`;
      const horiz = y1 === y2;
      const tick = (px, py) => horiz ? `<line x1="${px}" y1="${py - 5}" x2="${px}" y2="${py + 5}" stroke="rgba(217,196,150,.55)" stroke-width="1.5"/>` : `<line x1="${px - 5}" y1="${py}" x2="${px + 5}" y2="${py}" stroke="rgba(217,196,150,.55)" stroke-width="1.5"/>`;
      out += tick(x1, y1) + tick(x2, y2);
      if (d.lock) {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const col = d.lock === 'seal' ? '#b9a3e6' : '#d65a44';
        out += `<circle cx="${mx}" cy="${my}" r="11" fill="#1c1611" stroke="${col}" stroke-width="1.4"/>`;
        out += glyph(d.lock === 'seal' ? 'wax-seal' : 'padlock', mx, my, 14, col);
      }
    }
    for (const s of STAIRS.filter((s) => s.floor === this.floor)) {
      const [sx, sy] = s.at.map((v) => v * U);
      out += `<g pointer-events="none"><circle cx="${sx}" cy="${sy}" r="13" fill="rgba(28,22,17,.85)" stroke="rgba(217,196,150,.6)"/>${glyph('stairs', sx, sy, 16, '#e8dec8')}</g>`;
    }
    if (this.floor === PLAYER.floor) {
      const [px, py] = PLAYER.at.map((v) => v * U);
      const deg = PLAYER.dir * 180 / Math.PI + 90;
      out += `<g pointer-events="none"><circle cx="${px}" cy="${py}" r="26" fill="url(#me-glow)"><animate attributeName="r" values="18;30;18" dur="2.4s" repeatCount="indefinite"/></circle>
        <path d="M 0 -13 L 9 10 L 0 5 L -9 10 Z" transform="translate(${px} ${py}) rotate(${deg})" fill="#e7c983" stroke="#2a1f14" stroke-width="1.5"/></g>`;
    }
    out += '</g>';
    this.svg.innerHTML = out;
    this.apply();
    this.renderSide();
  }

  renderSide() {
    const r = ROOMS.find((x) => x.id === this.sel);
    if (!r) { this.side.innerHTML = '<p class="empty-note">点选一处殿阁，查看详情。</p>'; return; }
    const st = STYLE[r.state];
    const fl = FLOORS.find((f) => f.id === r.floor);
    const [x, y, w, h] = r.rect;
    const onEdge = (d) => {
      const [x1, y1, x2, y2] = d.at;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      return d.floor === r.floor && mx >= x && mx <= x + w && my >= y && my <= y + h && (mx === x || mx === x + w || my === y || my === y + h);
    };
    const locks = DOORS.filter((d) => d.lock && onEdge(d));
    const stairs = STAIRS.filter((s) => s.floor === r.floor && s.at[0] > x && s.at[0] < x + w && s.at[1] > y && s.at[1] < y + h);
    let loot = '';
    if (r.state === 'items') {
      if (this.g.revealed) {
        loot = `<h4 class="h-label" style="margin-top:16px">遗物</h4><div class="loot">${(r.loot || []).map((id) => {
          const src = this.g.thumbs.get(id);
          return `<div class="loot-row">${src ? `<img src="${src}" alt="">` : icon('magnifying-glass')}<span>${esc(D[id].name)}</span></div>`;
        }).join('') || '<span class="empty-note">尚未细看</span>'}</div>`;
      } else {
        loot = `<div class="lockline">${icon('compass')}<span>此处尚有遗物，启用寻踪罗盘可知其详。</span></div>`;
      }
    }
    if (r.need) {
      const have = r.need.map((id) => `<div class="loot-row">${this.g.thumbs.get(id) ? `<img src="${this.g.thumbs.get(id)}" alt="">` : icon('skeleton-key')}<span>${esc(D[id].name)}</span><span style="margin-left:auto;color:${this.g.has(id) ? 'var(--ok)' : 'var(--mute)'}">${this.g.has(id) ? '已得' : '未得'}</span></div>`).join('');
      loot += `<h4 class="h-label" style="margin-top:16px">开启所需</h4><div class="loot">${have}</div>`;
    }
    this.side.innerHTML = `
      <div class="h-label">${esc(fl.name)}${r.id === PLAYER.room ? ' · 行者在此' : ''}</div>
      <h3 class="room-title">${esc(r.name)}</h3>
      <span class="chip" style="color:${st.color}">${st.text}</span>
      <p class="desc" style="color:#cdbfa4;line-height:1.85;margin:14px 0 6px">${esc(r.desc)}</p>
      ${locks.map((d) => `<div class="lockline">${icon(d.lock === 'seal' ? 'wax-seal' : 'padlock')}<span>${esc(d.note || '门已上锁')}</span></div>`).join('')}
      ${stairs.map((s) => `<div class="lockline" style="color:var(--text)">${icon('stairs')}<span>${esc(s.label)}</span></div>`).join('')}
      ${loot}`;
  }
}
