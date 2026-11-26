// 极简服务器：node server.js  →  http://localhost:8765
//   · 静态文件
//   · 局域网联机：/ws 上的 WebSocket 中转（一个房间：一名主机 + 一名队友，原样转发双方的消息），/lan 返回本机的局域网地址
// 不依赖任何第三方库
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const root = __dirname, port = process.env.PORT || 8765;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
// 本机的局域网地址：家用路由器常见的 192.168.x 排最前，其次 10.x、172.16–31.x；其余的（虚拟网卡、代理软件的地址）排最后
const rank = a => a.startsWith('192.168.') ? 0 : a.startsWith('10.') ? 1 : /^172.(1[6-9]|2d|3[01])./.test(a) ? 2 : 3;
const lanAddrs = () => Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address).sort((a, b) => rank(a) - rank(b));

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/lan') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify({ port: +port, addrs: lanAddrs() })); }
  if (p === '/') p = '/index.html';
  const f = path.join(root, path.normalize(p));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(d);
  });
});

/* ------------------------------ 联机中转 ------------------------------ */
const MAX_MSG = 256 * 1024;                       // 单条消息上限
const room = { host: null, guest: null };
function send(c, data, op = 1) {
  if (!c || c.sock.destroyed) return;
  const p = Buffer.isBuffer(data) ? data : Buffer.from(data), n = p.length;
  let h;
  if (n < 126) h = Buffer.from([0x80 | op, n]);
  else if (n < 65536) h = Buffer.from([0x80 | op, 126, n >> 8, n & 255]);
  else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  c.sock.write(Buffer.concat([h, p]));
}
const tell = (c, o) => send(c, JSON.stringify(o));
function onMsg(c, msg) {
  if (!c.role) {                                   // 第一条消息：报到，说明自己要当主机还是队友
    let o = null; try { o = JSON.parse(msg); } catch (e) { /* 不是 JSON */ }
    const want = o && o.t === 'hello' && (o.role === 'host' || o.role === 'guest') ? o.role : null;
    if (!want) return c.sock.destroy();
    if (room[want]) return tell(c, { t: 'role', ok: false, why: want === 'host' ? 'host' : 'full' });
    c.role = want; room[want] = c;
    const other = room[want === 'host' ? 'guest' : 'host'];
    tell(c, { t: 'role', ok: true, role: want, peer: !!other });
    if (other) tell(other, { t: 'peer', on: true });
    console.log('[联机] ' + (want === 'host' ? '主机' : '队友') + '已连接  ' + c.sock.remoteAddress);
    return;
  }
  const other = room[c.role === 'host' ? 'guest' : 'host'];
  if (!other) return;
  if (other.sock.writableLength > 1 << 20 && msg.startsWith('{"t":"s"')) return;      // 对方网络跟不上：丢掉状态快照（下一帧还有），别的消息照发
  send(other, msg);
}
function drop(c) {
  if (c.gone) return; c.gone = true;
  if (c.role && room[c.role] === c) {
    room[c.role] = null;
    tell(room[c.role === 'host' ? 'guest' : 'host'], { t: 'peer', on: false });
    console.log('[联机] ' + (c.role === 'host' ? '主机' : '队友') + '已断开');
  }
}
function parse(c) {
  for (;;) {
    const b = c.buf; if (b.length < 2) return;
    const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80; let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; const big = b.readBigUInt64BE(2); if (big > BigInt(MAX_MSG)) return c.sock.destroy(); len = Number(big); off = 10; }
    if (!masked || len > MAX_MSG) return c.sock.destroy();            // 浏览器发来的帧必须带掩码
    if (b.length < off + 4 + len) return;
    const mask = b.subarray(off, off + 4), data = Buffer.from(b.subarray(off + 4, off + 4 + len));
    for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
    c.buf = b.subarray(off + 4 + len);
    if (op === 8) { c.sock.end(); return; }                            // 关闭
    if (op === 9) { send(c, data, 10); continue; }                     // ping → pong
    if (op === 10) continue;
    if (op > 2) return c.sock.destroy();
    c.frag.push(data); c.fragLen += len;
    if (c.fragLen > MAX_MSG) return c.sock.destroy();
    if (fin) { const msg = Buffer.concat(c.frag).toString('utf8'); c.frag = []; c.fragLen = 0; onMsg(c, msg); }
  }
}
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (req.url.split('?')[0] !== '/ws' || !key) return sock.destroy();
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  const c = { sock, role: null, buf: Buffer.alloc(0), frag: [], fragLen: 0, gone: false };
  sock.on('data', d => { c.buf = c.buf.length ? Buffer.concat([c.buf, d]) : d; try { parse(c); } catch (e) { sock.destroy(); } });
  sock.on('close', () => drop(c)); sock.on('error', () => drop(c));
});

server.listen(port, () => {
  console.log('Transatlantic running at http://localhost:' + port);
  const a = lanAddrs(); if (a.length) console.log('局域网联机：队友在同一网络里打开  ' + a.map(x => 'http://' + x + ':' + port).join('  或  '));
});
