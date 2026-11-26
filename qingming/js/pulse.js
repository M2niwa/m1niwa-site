// 脉象：以毛笔描出的心搏线。气血越低，脉越急越弱；中蛊则泛紫。
const STATES = {
  ping: { char: '平', text: '脉象平和', color: '#7ea5a0', bpm: 62, amp: 1 },
  xian: { char: '弦', text: '脉弦而数 · 小心', color: '#d4913f', bpm: 96, amp: 0.8 },
  wei: { char: '危', text: '脉微欲绝 · 危急', color: '#d65a44', bpm: 132, amp: 0.5 },
};
const VIOLET = '#9a82cf';

export function pulseState(ratio) {
  if (ratio > 0.6) return 'ping';
  if (ratio > 0.3) return 'xian';
  return 'wei';
}

// 一次心搏的波形，φ ∈ [0,1)
function beat(phi) {
  const g = (c, w, a) => a * Math.exp(-((phi - c) ** 2) / (2 * w * w));
  return g(0.14, 0.03, 0.12) - g(0.3, 0.012, 0.18) + g(0.335, 0.014, 1) - g(0.37, 0.014, 0.32) + g(0.6, 0.05, 0.22);
}

export class Pulse {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.info = root.querySelector('.pstate');
    this.x = 0; this.phase = 0; this.last = null;
    this.key = null; this.poison = false;
    this.w = 0; this.h = 0;
  }

  set(ratio, poison) {
    const key = pulseState(ratio);
    if (key === this.key && poison === this.poison) return;
    this.key = key; this.poison = poison;
    const s = STATES[key];
    const color = poison ? VIOLET : s.color;
    this.info.innerHTML = `<span class="pchar" style="color:${color}">${s.char}</span><span class="ptext">${s.text}</span>${poison ? '<span class="pgu">蛊毒入脉</span>' : ''}`;
  }

  _fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return false;
    if (w !== this.w || h !== this.h) {
      this.w = w; this.h = h;
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.x = 0; this.last = null;
      this._grid();
    }
    return true;
  }

  _grid() {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
  }

  tick(dt) {
    if (!this.key || !this._fit()) return;
    const s = STATES[this.key];
    const c = this.ctx, W = this.w, H = this.h;
    const color = this.poison ? VIOLET : s.color;
    const speed = W / 2.6; // 每 2.6 秒扫过一屏
    const steps = Math.max(1, Math.ceil(dt * speed / 2));
    const mid = H * 0.6;
    c.shadowBlur = 0;
    // 余迹渐隐
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = `rgba(0,0,0,${Math.min(0.5, dt * 0.9)})`;
    c.fillRect(0, 0, W, H);
    c.restore();
    for (let i = 0; i < steps; i++) {
      const ddt = dt / steps;
      this.phase += ddt * s.bpm / 60 * (this.key === 'wei' ? 0.9 + Math.random() * 0.25 : 1);
      if (this.phase >= 1) this.phase -= 1;
      this.x += ddt * speed;
      if (this.x > W) { this.x = 0; this.last = null; }
      let v = beat(this.phase) * s.amp;
      if (this.poison) v += (Math.random() - 0.5) * 0.05 + Math.sin(this.phase * 40) * 0.015;
      const y = mid - v * H * 0.55;
      // 扫描头前方清出空隙
      c.save(); c.globalCompositeOperation = 'destination-out';
      c.fillRect(this.x + 2, 0, 14, H);
      c.restore();
      if (this.last) {
        const slope = Math.abs(y - this.last[1]);
        c.strokeStyle = color;
        c.lineCap = 'round';
        c.lineWidth = 1.2 + Math.min(2.6, slope * 0.35);
        c.shadowColor = color; c.shadowBlur = 8;
        c.beginPath(); c.moveTo(this.last[0], this.last[1]); c.lineTo(this.x, y); c.stroke();
      }
      this.last = [this.x, y];
    }
    // 扫描头的亮点
    c.save();
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,240,210,.9)';
    c.beginPath(); c.arc(this.last[0], this.last[1], 1.6, 0, Math.PI * 2); c.fill();
    c.restore();
  }
}
