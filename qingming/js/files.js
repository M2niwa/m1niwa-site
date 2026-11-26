// 卷宗：手札、告示、异闻，竖排阅读
import { DOCS } from './data.js';
import { icon } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KIND_ICON = { 手札: 'quill-ink', 告示: 'stone-tablet', 异闻: 'tied-scroll' };

export class FilesUI {
  constructor(game) {
    this.g = game;
    this.list = document.getElementById('files-list');
    this.doc = document.getElementById('doc');
    this.read = new Set(DOCS.filter((d) => !d.isNew).map((d) => d.id));
    this.cur = DOCS[0].id;
  }

  unread() { return DOCS.some((d) => !this.read.has(d.id)); }

  open(id) {
    this.cur = id;
    this.read.add(id);
    this.render();
    this.g.refreshTabs();
  }

  step(d) {
    const i = DOCS.findIndex((x) => x.id === this.cur);
    this.open(DOCS[(i + d + DOCS.length) % DOCS.length].id);
  }

  render() {
    const kinds = [...new Set(DOCS.map((d) => d.kind))];
    this.list.innerHTML = kinds.map((k) => `<div class="file-group"><h3>${k}</h3>${DOCS.filter((d) => d.kind === k).map((d) => `
      <button class="file-item" data-id="${d.id}" aria-current="${d.id === this.cur}">
        ${icon(KIND_ICON[d.kind])}<span class="ft"><b>${esc(d.title)}</b><small>得于 ${esc(d.from)}</small></span>${this.read.has(d.id) ? '' : '<i class="new" aria-label="未读"></i>'}
      </button>`).join('')}</div>`).join('');
    this.list.querySelectorAll('.file-item').forEach((b) => b.addEventListener('click', () => this.open(b.dataset.id)));
    const d = DOCS.find((x) => x.id === this.cur);
    this.doc.innerHTML = `<div class="doc-inner"><h2>${esc(d.title)}</h2>${d.body.map((p) => `<p>${esc(p)}</p>`).join('')}<p class="from">得于${esc(d.from)}</p></div><span class="stamp">${esc(d.seal)}</span>`;
    this.doc.scrollLeft = this.doc.scrollWidth;
  }
}
