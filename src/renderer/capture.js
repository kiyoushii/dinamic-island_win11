/* global island, jsQR */
const mode = new URLSearchParams(location.search).get('mode') || 'region';
const c = document.getElementById('c');
const ctx = c.getContext('2d');
const hint = document.getElementById('hint');
const loupe = document.getElementById('loupe');
const lctx = document.getElementById('lc').getContext('2d');
const hexEl = document.getElementById('hex');
const sizeEl = document.getElementById('size');
const img = new Image();
let scale = 1, sel = null, start = null;

hint.textContent = {
  region: 'Выдели область · Esc — отмена',
  qr: 'Выдели QR-код (или нажми Enter — искать на всём экране) · Esc — отмена',
  color: 'Кликни по пикселю, чтобы взять цвет · Esc — отмена',
}[mode];

island.on('cap:image', (url) => {
  img.onload = () => {
    c.width = img.width; c.height = img.height;
    scale = img.width / window.innerWidth;
    draw();
  };
  img.src = url;
});

function draw() {
  ctx.drawImage(img, 0, 0);
  if (mode === 'color') return;
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  if (!sel) { ctx.fillRect(0, 0, c.width, c.height); return; }
  const { x, y, w, h } = norm(sel);
  ctx.fillRect(0, 0, c.width, y);
  ctx.fillRect(0, y + h, c.width, c.height - y - h);
  ctx.fillRect(0, y, x, h);
  ctx.fillRect(x + w, y, c.width - x - w, h);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * scale; ctx.setLineDash([6 * scale, 4 * scale]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}
const norm = (s) => ({ x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) });
const toImg = (e) => ({ x: Math.round(e.clientX * scale), y: Math.round(e.clientY * scale) });

function pixel(x, y) {
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2]];
}
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

addEventListener('mousemove', (e) => {
  const p = toImg(e);
  if (mode === 'color') {
    loupe.style.display = hexEl.style.display = 'block';
    loupe.style.left = e.clientX + 20 + 'px'; loupe.style.top = e.clientY + 20 + 'px';
    hexEl.style.left = e.clientX + 30 + 'px'; hexEl.style.top = e.clientY + 146 + 'px';
    lctx.imageSmoothingEnabled = false;
    lctx.clearRect(0, 0, 120, 120);
    lctx.drawImage(img, p.x - 7, p.y - 7, 15, 15, 0, 0, 120, 120);
    lctx.strokeStyle = '#fff'; lctx.strokeRect(56, 56, 8, 8);
    hexEl.textContent = hex(pixel(p.x, p.y));
    return;
  }
  if (!start) return;
  sel = { x1: start.x, y1: start.y, x2: p.x, y2: p.y };
  const n = norm(sel);
  sizeEl.style.display = 'block';
  sizeEl.style.left = e.clientX + 12 + 'px'; sizeEl.style.top = e.clientY + 12 + 'px';
  sizeEl.textContent = `${n.w} × ${n.h}`;
  draw();
});
addEventListener('mousedown', (e) => {
  if (e.button !== 0) return island.capDone(null);
  const p = toImg(e);
  if (mode === 'color') {
    const rgb = pixel(p.x, p.y);
    return island.capDone({ type: 'color', hex: hex(rgb), rgb: `rgb(${rgb.join(', ')})` });
  }
  start = p;
});
addEventListener('mouseup', () => {
  if (!start || !sel) return;
  const n = norm(sel);
  start = null;
  if (n.w < 4 || n.h < 4) { sel = null; draw(); return; }
  finish(n);
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') island.capDone(null);
  if (e.key === 'Enter' && mode === 'qr') finish({ x: 0, y: 0, w: c.width, h: c.height });
});

function finish({ x, y, w, h }) {
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  out.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
  if (mode === 'qr') {
    const data = out.getContext('2d').getImageData(0, 0, w, h);
    const code = jsQR(data.data, w, h, { inversionAttempts: 'attemptBoth' });
    return island.capDone({ type: 'qr', text: code ? code.data : null });
  }
  island.capDone({ type: 'region', data: out.toDataURL('image/png') });
}
