// 行者：气血/气力/法力、属性、脉象、披挂与法门
import { ITEM_DEFS as D } from './data.js';
import { icon } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CN = '〇一二三四五六七八九';
const cn = (n) => (n < 10 ? CN[n] : (n < 20 ? '' : CN[(n / 10) | 0]) + '十' + (n % 10 ? CN[n % 10] : ''));
const SLOT_NAME ={ main: '兵刃', off: '副手', tool: '法器' };
const SLOT_ICON = { main: 'katana', off: 'crossed-swords', tool: 'old-lantern' };

export class HeroUI {
  constructor(game) {
    this.g = game;
    this.left = document.getElementById('hero-left');
    this.right = document.getElementById('hero-right');
    this.skill = 0;
  }

  stats() {
    const h = this.g.hero;
    const eq = (slot) => this.g.bag.find((it) => it.equipped && D[it.def].slot === slot);
    const main = eq('main'), off = eq('off');
    const val = (it, k) => { const s = it && D[it.def].stats.find((x) => x[0] === k); return s ? parseInt(s[1], 10) : 0; };
    const atkMain = val(main, '攻'), atkOff = Math.round(val(off, '攻') * 0.5);
    const crit = h.base.crit + (main ? parseInt((D[main.def].stats.find((x) => x[0] === '会心') || [0, '0'])[1], 10) || 0 : 0);
    return {
      atk: h.base.atk + atkMain + atkOff, atkGear: atkMain + atkOff,
      def: h.base.def, crit, resist: h.base.resist + (h.cured ? 10 : 0),
    };
  }

  render() {
    const h = this.g.hero;
    const s = this.stats();
    const bar = (label, v, max, c) => `<div class="bar"><div class="bl"><span>${label}</span><b>${v} / ${max}</b></div><div class="track"><div class="fill" style="width:${(v / max * 100).toFixed(1)}%;--c:${c}"></div></div></div>`;
    const hpColor = h.hp / h.hpMax > 0.6 ? 'linear-gradient(90deg,#5f857f,#7ea5a0)' : h.hp / h.hpMax > 0.3 ? 'linear-gradient(90deg,#9a6326,#d4913f)' : 'linear-gradient(90deg,#8a2a1f,#d65a44)';
    this.left.innerHTML = `
      <div class="hero-name"><h2>${esc(h.name)}</h2><div class="sub">${esc(h.title)} · 道行${cn(h.level)}</div></div>
      <div class="bars">
        ${bar('气血', h.hp, h.hpMax, hpColor)}
        ${bar('气力', h.sp, h.spMax, 'linear-gradient(90deg,#8a7a50,#c9b27a)')}
        ${bar('法力', h.mp, h.mpMax, 'linear-gradient(90deg,#4f5f86,#7d8fc0)')}
      </div>
      <h4 class="h-label">根骨</h4>
      <div class="attrs">
        <div class="attr">${icon('fist')}<div><span>攻击</span><b>${s.atk}${s.atkGear ? `<span class="delta">+${s.atkGear}</span>` : ''}</b></div></div>
        <div class="attr">${icon('cloak')}<div><span>护体</span><b>${s.def}</b></div></div>
        <div class="attr">${icon('drop')}<div><span>会心</span><b>${s.crit}%</b></div></div>
        <div class="attr">${icon('virus')}<div><span>抗蛊</span><b>${s.resist}</b></div></div>
      </div>
      <div class="pulse" id="pulse-hero"><span class="plabel">脉象</span><canvas></canvas><div class="pstate"></div></div>`;

    const slots = ['main', 'off', 'tool'].map((slot) => {
      const it = this.g.bag.find((x) => x.equipped && D[x.def].slot === slot);
      const src = it && this.g.thumbs.get(it.def);
      if (!it) return `<div class="gear-row empty"><div class="gear-slot"><em>${SLOT_NAME[slot]}</em>${icon(SLOT_ICON[slot])}</div><div><b>空</b><small>可在行囊中装备</small></div></div>`;
      const d = D[it.def];
      return `<div class="gear-row"><div class="gear-slot"><em>${SLOT_NAME[slot]}</em>${src ? `<img src="${src}" alt="">` : icon(SLOT_ICON[slot])}</div><div><b>${esc(d.name)}</b><small>${esc(d.stats.map((x) => x.join(' ')).join(' · '))}</small></div></div>`;
    }).join('');
    const wear = h.wear.map((w) => `<div class="gear-row"><div class="gear-slot"><em>${w.slot}</em>${icon(w.icon)}</div><div><b>${esc(w.name)}</b><small>${esc(w.note)}</small></div></div>`).join('');
    const sk = h.skills[this.skill];
    this.right.innerHTML = `
      <h4 class="h-label">披挂</h4>
      <div class="gear">${slots}${wear}</div>
      <h4 class="h-label" style="margin-top:22px">法门</h4>
      <div class="skills">${h.skills.map((k, i) => `<button class="skill" data-i="${i}" aria-pressed="${i === this.skill}" aria-label="${esc(k.name)}">${icon(k.icon)}<span class="lv">${k.lv}</span></button>`).join('')}</div>
      <div class="skill-info"><h4>${esc(sk.name)}</h4><div class="sk-meta">消耗 ${esc(sk.cost)} · 调息 ${esc(sk.cd)}</div><p>${esc(sk.desc)}</p></div>`;
    this.right.querySelectorAll('.skill').forEach((b) => b.addEventListener('click', () => { this.skill = +b.dataset.i; this.render(); this.g.rebindPulse(); }));
  }
}
