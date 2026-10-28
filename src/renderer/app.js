/* global island, Tools, icon, weatherInfo, weatherIcon */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 6e4);
  if (m < 1) return 'только что'; if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60); if (h < 24) return `${h} ч назад`;
  return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

const el = $('#island');
let store;
let state = 'pill';
let tab = 'home';
let pinned = false;
let over = false;

// ================= размеры и состояния =================
function pillWidth() {
  let w = 210;
  if (media) w += 64;
  if (store?.settings.mascot) w += 30;
  if (timer.running) w += 56;
  if (agents.length) w += 84;
  if (el.classList.contains('recording')) w = Math.max(w, 330);
  return w;
}
function sizeFor(s) {
  switch (s) {
    case 'pill': return [pillWidth(), 36];
    case 'toast': return [toastWide ? 560 : 500, 66];
    case 'player': return [lyrics.lines.length && store.settings.lyrics ? 760 : 480, 152];
    case 'panel': return [800, 430];
    case 'launcher': return [620, 54 + Math.min(launcher.items.length, 8) * 46 + (launcher.items.length ? 12 : 0)];
  }
  return [300, 36];
}
function setState(s) {
  state = s;
  el.className = `s-${s}` + (recorder.mr ? ' recording' : '');
  el.classList.toggle('has-media', !!media);
  el.classList.toggle('playing', !!media?.playing);
  el.classList.toggle('mascot-on', !!store?.settings.mascot);
  el.classList.toggle('wavy', !!media?.playing && (s === 'pill' || s === 'player'));
  const [w, h] = sizeFor(s);
  el.style.width = w + 'px';
  el.style.height = h + 'px';
}
const refresh = () => setState(state);

function openPanel(t) {
  if (t) tab = t;
  clearTimeout(playerTimer);
  setState('panel');
  renderTabs();
  showPage(tab);
}
function collapse() {
  if (pinned && state === 'panel') return;
  if (state === 'launcher' || state === 'panel') island.blur();
  if (lyricsPinned && media) return setState('player');
  if (nextToast()) return;
  if (downloads.length) return showDownload();
  setState('pill');
}
function keepOpen() {
  const a = document.activeElement;
  return document.hasFocus() && a && el.contains(a) && (a.matches('input, textarea') || a.isContentEditable);
}

let hoverTimer, leaveTimer;
el.addEventListener('mouseenter', () => {
  over = true; island.mouse(true);
  clearTimeout(leaveTimer);
  if (state === 'pill' && !recorder.mr) hoverTimer = setTimeout(() => openPanel(), 140);
  if (state === 'toast') hoverTimer = setTimeout(() => { clearTimeout(toastTimer); currentToast = null; openPanel(); }, 700);
  if (state === 'player') clearTimeout(playerTimer);
});
el.addEventListener('mouseleave', () => {
  over = false; island.mouse(false);
  clearTimeout(hoverTimer);
  if (state === 'panel' && !pinned && !keepOpen()) leaveTimer = setTimeout(collapse, 420);
  if (state === 'player' && !lyricsPinned) playerTimer = setTimeout(collapse, 1500);
});
island.on('blur', () => {
  if (state === 'launcher') collapse();
  else if (state === 'panel' && !over && !pinned) collapse();
});
island.on('expand', () => { island.mouse(true); openPanel(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (state === 'panel' || state === 'launcher')) { pinned = false; collapse(); }
});

// ================= часы =================
function tick() {
  const now = new Date();
  $('#pill-time').textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  $('#mp-time').textContent = $('#pill-time').textContent;
  timerTick();
}
setInterval(tick, 1000);

// ================= музыка =================
let media = null, volume = 0.5, muted = false, lastKey = null, lyricsPinned = false, playerTimer;
const lyrics = { key: null, lines: [], source: '' };

island.on('media', (st) => {
  volume = st.volume; muted = st.muted;
  const prev = media;
  media = st.media && st.media.title ? st.media : null;
  const key = media ? media.key || media.title : null;
  if (key !== lastKey) {
    const first = lastKey === null && !prev;
    lastKey = key;
    if (media) {
      setArt(media.thumb);
      loadLyrics(media);
      if (!first && state === 'pill') { setState('player'); playerTimer = setTimeout(() => { if (!over && !lyricsPinned) collapse(); }, 6000); }
    } else if (state === 'player') collapse();
  } else if (media?.thumb && media.thumb !== prev?.thumb) setArt(media.thumb);
  if (!!prev?.playing !== !!media?.playing || !!prev !== !!media) refresh();
  renderMedia();
});

function mediaPos() {
  if (!media) return 0;
  let p = media.position || 0;
  if (media.playing && media.updated) p += (Date.now() - media.updated) / 1000;
  return media.duration ? Math.min(p, media.duration) : p;
}
function setArt(b64) {
  const url = b64 ? `url(data:image/png;base64,${b64})` : '';
  for (const id of ['#pill-art', '#mp-art', '#pc-art']) $(id).style.backgroundImage = url;
  $('#pc-art').innerHTML = b64 ? '' : icon('wave', 34);
  $('#mp-art').innerHTML = b64 ? '' : icon('wave', 22);
  if (b64) accentFrom(`data:image/png;base64,${b64}`);
  else document.documentElement.style.setProperty('--music', '#e8b067');
}
function accentFrom(src) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = c.height = 12;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 12, 12);
    const d = x.getImageData(0, 0, 12, 12).data;
    let best = [232, 176, 103], bs = -1;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const s = (mx - mn) * (mx > 60 ? 1 : 0.2);
      if (s > bs) { bs = s; best = [r, g, b]; }
    }
    // осветляем, чтобы читалось на чёрном
    const k = 200 / Math.max(...best, 1);
    best = best.map((v) => Math.min(255, Math.round(v * Math.max(1, k))));
    document.documentElement.style.setProperty('--music', `rgb(${best.join(',')})`);
  };
  img.src = src;
}
function renderMedia() {
  const pos = mediaPos(), dur = media?.duration || 0;
  const pct = dur ? (pos / dur) * 100 + '%' : '0%';
  const playIc = icon(media?.playing ? 'pause' : 'play', 18);
  if (media) {
    $('#mp-title').textContent = media.title; $('#mp-artist').textContent = media.artist || ''; $('#mp-album').textContent = media.album || '';
    $('#pc-title').textContent = media.title; $('#pc-artist').textContent = media.artist || '';
    $('#pc-app').textContent = appName(media.app);
  } else {
    $('#pc-title').textContent = 'Ничего не играет'; $('#pc-artist').textContent = 'Включи музыку в любом плеере'; $('#pc-app').textContent = 'МУЗЫКА';
  }
  for (const p of ['mp', 'pc']) {
    $(`#${p}-progress div`).style.width = pct;
    $(`#${p}-pos`).textContent = fmtTime(pos);
    $(`#${p}-left`).textContent = '-' + fmtTime(dur - pos);
    if ($(`#${p}-play`).dataset.ic !== playIc) { $(`#${p}-play`).innerHTML = playIc; $(`#${p}-play`).dataset.ic = playIc; }
  }
  if (!volDragging) {
    $('#vol').value = Math.round(volume * 100);
    $('#vol').style.setProperty('--p', Math.round(volume * 100) + '%');
    $('#vol-val').textContent = muted ? '—' : Math.round(volume * 100);
  }
  $('#vol-btn').innerHTML = icon(muted || volume === 0 ? 'mute' : 'volume');
  renderLyrics(pos);
}
setInterval(() => { if (media?.playing) renderMedia(); }, 250);
function appName(id = '') {
  const s = id.toLowerCase();
  if (s.includes('spotify')) return 'SPOTIFY'; if (s.includes('yandex')) return 'ЯНДЕКС МУЗЫКА';
  if (s.includes('chrome')) return 'CHROME'; if (s.includes('msedge')) return 'EDGE'; if (s.includes('firefox')) return 'FIREFOX';
  if (s.includes('zune') || s.includes('media')) return 'МЕДИАПЛЕЕР';
  return 'МУЗЫКА';
}
document.addEventListener('click', (e) => {
  const m = e.target.closest('[data-media]'); if (m) island.media(m.dataset.media);
  const a = e.target.closest('[data-act="lyrics-toggle"]');
  if (a) { lyricsPinned = !lyricsPinned; if (lyricsPinned) setState('player'); else collapse(); }
});
for (const id of ['#mp-progress', '#pc-progress']) {
  $(id).addEventListener('click', (e) => {
    if (!media?.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    island.media(`seek ${(((e.clientX - r.left) / r.width) * media.duration).toFixed(1)}`);
  });
}
$('.mp-top').addEventListener('click', () => { lyricsPinned = false; openPanel('home'); });
let volDragging = false;
$('#vol').addEventListener('input', (e) => {
  volDragging = true;
  const v = +e.target.value;
  e.target.style.setProperty('--p', v + '%'); $('#vol-val').textContent = v;
  island.media(`vol ${(v / 100).toFixed(2)}`);
});
$('#vol').addEventListener('change', () => { volDragging = false; });
$('#vol-btn').addEventListener('click', () => island.media('mute'));

// ---- слова песни (LRCLIB, бесплатно) ----
async function loadLyrics(m) {
  const key = m.key || m.title;
  lyrics.key = key; lyrics.lines = []; renderLyrics(0);
  if (!store.settings.lyrics) return;
  const qs = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  try {
    let r = await island.http({ url: `https://lrclib.net/api/get?${qs({ artist_name: m.artist, track_name: m.title, album_name: m.album, duration: m.duration ? Math.round(m.duration) : '' })}` });
    let data = r.ok ? r.json : null;
    if (!data?.syncedLyrics) {
      r = await island.http({ url: `https://lrclib.net/api/search?${qs({ track_name: m.title, artist_name: m.artist })}` });
      data = Array.isArray(r.json) ? r.json.find((x) => x.syncedLyrics) : null;
    }
    if (lyrics.key !== key || !data?.syncedLyrics) return;
    lyrics.lines = data.syncedLyrics.split('\n').map((l) => {
      const mm = /^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/.exec(l.trim());
      return mm ? { t: +mm[1] * 60 + +mm[2], text: mm[3] } : null;
    }).filter((l) => l && l.text);
    lyrics.source = 'LRCLIB';
    refresh();
  } catch { /* нет сети — без слов */ }
}
let lastLyricIdx = -2;
function renderLyrics(pos) {
  const box = $('#mp-lyrics');
  if (!lyrics.lines.length) { if (lastLyricIdx !== -1) { box.innerHTML = ''; lastLyricIdx = -1; } return; }
  let i = lyrics.lines.findIndex((l) => l.t > pos + 0.25) - 1;
  if (i < -1) i = lyrics.lines.length - 1;
  if (i === lastLyricIdx) return;
  lastLyricIdx = i;
  const L = (k) => esc(lyrics.lines[k]?.text || '');
  box.innerHTML = `<p>${i > 0 ? L(i - 1) : ''}</p><p class="cur">${i >= 0 ? L(i) : '♪'}</p><p>${L(i + 1)}</p><span class="src">${lyrics.source}</span>`;
}

// ---- волна ----
let wavePhase = 0, waveAmp = 0;
function drawWave() {
  requestAnimationFrame(drawWave);
  if (!el.classList.contains('wavy')) return;
  const w = el.offsetWidth, h = 12;
  wavePhase += 0.05;
  const target = media?.playing ? 3 + Math.sin(wavePhase * 0.7) * 1.2 + Math.random() * 0.6 : 0;
  waveAmp += (target - waveAmp) * 0.08;
  const waves = Math.max(4, Math.round(w / 42));
  let d = `M0 0 L0 ${h / 2}`;
  for (let x = 0; x <= w; x += 4) {
    const y = h / 2 + Math.sin((x / w) * waves * Math.PI * 2 + wavePhase) * waveAmp * Math.min(1, x / 30, (w - x) / 30);
    d += ` L${x} ${y.toFixed(2)}`;
  }
  const line = d.replace(`M0 0 L0 ${h / 2}`, `M0 ${h / 2}`);
  $('#wave').setAttribute('viewBox', `0 0 ${w} 16`);
  $('#wave-fill').setAttribute('d', d + ` L${w} 0 Z`);
  $('#wave-line').setAttribute('d', line);
}
requestAnimationFrame(drawWave);

// ================= маскот =================
const CAT = `<svg viewBox="0 0 24 22" width="24" height="22">
  <path d="M3.2 9.5 3.6 1.6l5.2 4.1q3.2-.9 6.4 0l5.2-4.1.4 7.9q.9 10.9-8.8 11.1Q2.3 20.4 3.2 9.5z" fill="#f2f2f2"/>
  <path d="M5 4.2 5.3 7.5 7.4 6z M19 4.2 18.7 7.5 16.6 6z" fill="#f4b6c2"/>
  <g class="eye"><g class="eye-open"><ellipse cx="8.6" cy="12.2" rx="1.55" ry="2.05" fill="#111"/><ellipse cx="15.4" cy="12.2" rx="1.55" ry="2.05" fill="#111"/><circle cx="9.1" cy="11.5" r=".5" fill="#fff"/><circle cx="15.9" cy="11.5" r=".5" fill="#fff"/></g></g>
  <g class="eye-shut" stroke="#111" stroke-width="1.3" stroke-linecap="round" fill="none"><path d="M7.2 12.4q1.4 1 2.8 0M14 12.4q1.4 1 2.8 0"/></g>
  <path d="M11.2 15.2h1.6l-.8.9z" fill="#f08aa0"/>
</svg>`;
$('#mascot').innerHTML = CAT;
island.on('cursor', (p) => {
  if (!store?.settings.mascot) return;
  const r = $('#mascot').getBoundingClientRect();
  if (!r.width) return;
  const dx = p.x - (r.left + r.width / 2), dy = p.y - (r.top + r.height / 2);
  const len = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, len / 120) * 1.3;
  $('#mascot .eye').style.transform = `translate(${(dx / len) * k}px, ${(dy / len) * k * 0.8}px)`;
});
function mascot(mode) {
  const m = $('#mascot');
  if (mode === 'jump') { m.classList.remove('jump'); void m.offsetWidth; m.classList.add('jump'); }
  else m.classList.toggle('think', mode === 'think');
}

// ================= погода =================
let weather = null;
async function loadWeather() {
  const { lat, lon } = store.settings;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day'
    + '&hourly=temperature_2m,weather_code,precipitation_probability&minutely_15=precipitation'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=7&wind_speed_unit=ms';
  try {
    const r = await island.http({ url });
    if (!r.ok) return;
    weather = r.json;
    renderWeather();
    rainCheck();
  } catch {}
}
let lastRainWarn = 0;
function rainCheck() {
  const m = weather?.minutely_15; if (!m) return;
  if ((weather.current.precipitation || 0) > 0 || Date.now() - lastRainWarn < 3 * 36e5) return;
  const now = Date.now();
  let sum = 0, firstIdx = -1;
  m.time.forEach((t, i) => {
    const ts = new Date(t).getTime();
    if (ts > now && ts <= now + 60 * 6e4) { sum += m.precipitation[i] || 0; if (firstIdx < 0 && m.precipitation[i] > 0.1) firstIdx = i; }
  });
  if (firstIdx < 0) return;
  lastRainWarn = now;
  const mins = Math.max(5, Math.round((new Date(m.time[firstIdx]).getTime() - now) / 6e4 / 5) * 5);
  showToast({ icon: 'umbrella', title: `Через ${mins} минут дождь`, text: `До ${sum.toFixed(1).replace('.', ',')} мм в ближайший час — возьми зонт` });
}
function renderWeather() {
  if (!weather) return;
  const c = weather.current;
  const wi = weatherInfo(c.weather_code, c.is_day);
  const t = Math.round(c.temperature_2m);
  $('#pill-weather').innerHTML = `${weatherIcon(wi.kind, 16)}${t}°`;
  $('#mp-weather').innerHTML = `${weatherIcon(wi.kind, 14)}${t}°`;
  const d = weather.daily, hr = weather.hourly;
  const nowH = new Date(c.time).getTime();
  const hi = hr.time.findIndex((x) => new Date(x).getTime() >= nowH);
  const hours = [];
  for (let i = Math.max(0, hi); i < hi + 16 && i < hr.time.length; i += 2) {
    const hw = weatherInfo(hr.weather_code[i], 1);
    hours.push(`<div><span>${i === hi ? 'Сейчас' : new Date(hr.time[i]).getHours() + ':00'}</span>${weatherIcon(hw.kind, 20)}<b>${Math.round(hr.temperature_2m[i])}°</b></div>`);
  }
  const tMin = Math.min(...d.temperature_2m_min), tMax = Math.max(...d.temperature_2m_max), span = tMax - tMin || 1;
  const days = d.time.map((day, i) => {
    const dw = weatherInfo(d.weather_code[i], 1);
    const name = i === 0 ? 'Сегодня' : new Date(day).toLocaleDateString('ru-RU', { weekday: 'short' }).replace(/^./, (x) => x.toUpperCase());
    const lo = d.temperature_2m_min[i], hiT = d.temperature_2m_max[i];
    return `<div class="w-day"><span>${name}</span>${weatherIcon(dw.kind, 18)}<span class="lo">${Math.round(lo)}°</span>
      <div class="bar"><div style="left:${((lo - tMin) / span) * 100}%;right:${100 - ((hiT - tMin) / span) * 100}%"></div></div>
      <span>${Math.round(hiT)}°</span><span class="pr">${d.precipitation_sum[i] > 0.2 ? d.precipitation_sum[i].toFixed(1).replace('.', ',') + ' мм' : ''}</span></div>`;
  }).join('');
  const cls = !c.is_day ? 'night' : ['rain', 'storm', 'snow', 'cloud'].includes(wi.kind) ? 'rain' : '';
  $('#weather').innerHTML = `
    <div class="w-now ${cls}">
      <div class="w-city">${icon('location', 13)}${esc(store.settings.city)}<span class="spacer"></span><button class="ibtn" id="w-refresh" style="width:22px;height:22px">${icon('refresh', 13)}</button></div>
      <div class="w-temp">${weatherIcon(wi.kind, 40)}${t}°</div>
      <div class="w-desc">${wi.label}</div>
      <div class="w-sub">Ощущается как ${Math.round(c.apparent_temperature)}° · ${Math.round(d.temperature_2m_min[0])}°…${Math.round(d.temperature_2m_max[0])}°</div>
      <div class="w-stats"><div>${icon('wind', 12)}${c.wind_speed_10m.toFixed(0)} м/с</div><div>${icon('drop', 12)}${c.relative_humidity_2m}%</div><div>${icon('umbrella', 12)}${c.precipitation} мм</div></div>
    </div>
    <div class="w-right"><div class="w-hours">${hours.join('')}</div><div class="w-days">${days}</div><div class="w-foot">Данные: Open-Meteo</div></div>`;
  $('#w-refresh').onclick = loadWeather;
}

// ================= уведомления =================
const toastQ = [];
let toastTimer, toastWide = false, currentToast = null;
const TOAST_IC = { clip: 'clip', download: 'download', shot: 'shot', color: 'color', qr: 'qr', bell: 'bell', timer: 'timer', info: 'info', umbrella: 'umbrella', sparkle: 'sparkle', eraser: 'eraser', location: 'location', agent: 'agent', check: 'check', record: 'record', shield: 'shield' };
function showToast(n) {
  if (store.settings.dnd && !n.force) return;
  if (state === 'panel' || state === 'launcher') {
    if (n.icon === 'clip') return; // буфер и так виден в панели
    toastQ.push(n); return;
  }
  toastQ.push(n);
  if (!currentToast) nextToast();
}
function nextToast() {
  const n = toastQ.shift();
  currentToast = n || null;
  if (!n) return false;
  mascot('jump');
  toastWide = !!n.thumb || !!n.link || !!n.file;
  const ic = n.color ? `<div class="t-ic" style="background:${n.color}"></div>` : `<div class="t-ic">${icon(TOAST_IC[n.icon] || 'info', 18)}</div>`;
  $('#toast').innerHTML = `${n.thumb ? `<img class="t-thumb" src="${n.thumb}">` : ic}
    <div class="t-body"><b>${esc(n.title)}${n.app ? `<small>${esc(n.app)}</small>` : ''}</b><span>${esc(n.text || '')}</span></div>
    ${n.link ? `<button class="t-act" data-open="${esc(n.link)}" title="Открыть">${icon('open')}</button>` : ''}
    ${n.file ? `<button class="t-act" data-reveal="${esc(n.file)}" title="Показать в папке">${icon('folder')}</button>` : ''}
    ${n.sticky ? `<button class="t-act" data-close>${icon('x')}</button>` : ''}`;
  setState('toast');
  el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 500);
  clearTimeout(toastTimer);
  if (!n.sticky) toastTimer = setTimeout(endToast, n.duration || 3600);
  return true;
}
function endToast() {
  currentToast = null;
  if (state === 'toast') collapse();
}
$('#toast').addEventListener('click', (e) => {
  const o = e.target.closest('[data-open]'), r = e.target.closest('[data-reveal]');
  if (o) island.open(o.dataset.open);
  if (r) island.reveal(r.dataset.reveal);
  clearTimeout(toastTimer); endToast();
});
island.on('toast', showToast);

// ---- загрузки ----
let downloads = [];
island.on('downloads', (list) => {
  const had = downloads.length;
  downloads = list;
  if (list.length && (state === 'pill' || (state === 'toast' && !currentToast))) showDownload();
  else if (!list.length && had && state === 'toast' && !currentToast) collapse();
});
function showDownload() {
  const d = downloads[0];
  toastWide = false;
  const mb = (b) => (b / 1048576).toFixed(b > 1e8 ? 0 : 1).replace('.', ',');
  $('#toast').innerHTML = `<div class="t-ic">${icon('download', 18)}</div>
    <div class="t-body"><b class="ellipsis">${esc(d.name)}</b><span>${mb(d.size)} МБ · ${mb(Math.max(0, d.speed))} МБ/с${downloads.length > 1 ? ` · ещё ${downloads.length - 1}` : ''}</span><div class="dl-bar"><div></div></div></div>`;
  setState('toast');
}

// ================= вкладки =================
const TABS = [
  ['home', 'home', 'Главная'], ['clip', 'clip', 'Буфер'], ['shelf', 'inbox', 'Полка'], ['text', 'text', 'Текст'],
  ['chat', 'chat', 'Чат'], ['notes', 'note', 'Заметки'], ['weather', 'weather', 'Погода'], ['control', 'sliders', 'Управление'],
];
function renderTabs() {
  $('#tabs').innerHTML = TABS.map(([id, ic, name]) => `<button class="tab ${tab === id ? 'active' : ''}" data-tab="${id}" title="${name}">${icon(ic)}<span>${name}</span></button>`).join('')
    + `<span class="spacer"></span>
    <button class="tab ${store.settings.dnd ? 'on' : ''}" data-tool="dnd" title="Не беспокоить">${icon(store.settings.dnd ? 'moon' : 'bell')}</button>
    <button class="tab ${pinned ? 'on' : ''}" data-tool="pin" title="Закрепить открытым">${icon('pin')}</button>
    <button class="tab ${tab === 'settings' ? 'active' : ''}" data-tab="settings" title="Настройки">${icon('gear')}<span>Настройки</span></button>`;
}
$('#tabs').addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; renderTabs(); showPage(tab); }
  const tool = e.target.closest('[data-tool]');
  if (tool?.dataset.tool === 'pin') { pinned = !pinned; renderTabs(); }
  if (tool?.dataset.tool === 'dnd') { saveSetting('dnd', !store.settings.dnd); renderTabs(); }
});
function showPage(id) {
  $$('.page').forEach((p) => p.classList.toggle('active', p.dataset.page === id));
  ({ clip: renderClips, shelf: renderShelf, text: openText, chat: renderChat, notes: renderNotes, control: () => { renderControl(); loadBt(); island.vpnStatus().then((v) => { vpn = { ...vpn, ...v }; renderControl(); }); }, settings: renderSettings, weather: renderWeather, home: renderDock })[id]?.();
  if (id === 'clip') setTimeout(() => $('#clip-q').focus(), 50);
}

// ================= главная: действия и программы =================
const ACTIONS = [
  ['region', 'Область', () => island.capture('region')],
  ['screen', 'Весь экран', () => island.capture('full')],
  ['qr', 'QR-код', () => island.capture('qr')],
  ['color', 'Пипетка', () => island.capture('color')],
  ['eraser', 'Чистый текст', cleanClipboard],
  ['record', 'Запись экрана', () => setTimeout(startRecording, 350)],
  ['shield', 'VPN', () => toggleVpn(!vpn.on)],
  ['command', 'Команда', () => openLauncher()],
];
$('#actions').innerHTML = ACTIONS.map(([ic, name], i) => `<button class="tile" data-a="${i}">${icon(ic, 20)}<span>${name}</span></button>`).join('');
$('#actions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  collapseForCapture();
  ACTIONS[+b.dataset.a][2]();
});
function collapseForCapture() { pinned = false; setState('pill'); island.blur(); }
async function cleanClipboard() {
  const t = store.clips[0]?.text; if (!t) return;
  const clean = Tools.textTools.find((x) => x.id === 'clean').fn(t).replace(/[ \t]+/g, ' ').trim();
  island.copy(clean);
  showToast({ icon: 'eraser', title: 'Чистый текст в буфере', text: 'Без форматирования, лишних пробелов и «ёлочек»', force: true });
}
async function renderDock() {
  const apps = store.apps || [];
  const icons = await Promise.all(apps.map((p) => island.icon(p)));
  $('#dock').innerHTML = apps.map((p, i) => `<button class="app" data-open="${esc(p)}" title="${esc(p.split(/[\\/]/).pop().replace(/\.(lnk|exe|url)$/i, ''))}">
      ${icons[i] ? `<img src="${icons[i]}">` : icon('file')}<span class="rm" data-rm="${i}">${icon('x', 10)}</span></button>`).join('')
    + `<button class="app add" id="dock-add" title="Добавить: перетащи сюда программу или ярлык">${icon('plus')}</button>${apps.length ? '' : '<span class="hint">Перетащи сюда ярлыки любимых программ</span>'}`;
}
$('#dock').addEventListener('click', async (e) => {
  const rm = e.target.closest('[data-rm]');
  if (rm) { e.stopPropagation(); store.apps.splice(+rm.dataset.rm, 1); save('apps'); return renderDock(); }
  const a = e.target.closest('[data-open]'); if (a) { island.open(a.dataset.open); collapse(); }
  if (e.target.closest('#dock-add')) {
    const p = await island.pickApp();
    if (p && !store.apps.includes(p)) { store.apps.push(p); save('apps'); renderDock(); }
  }
});

// ================= буфер обмена =================
island.on('clips', (c) => { store.clips = c; if (tab === 'clip' && state === 'panel') renderClips(); });
$('#clip-q').addEventListener('input', renderClips);
function renderClips() {
  const q = $('#clip-q').value.trim().toLowerCase();
  const list = store.clips.filter((c) => !q || c.text.toLowerCase().includes(q)).slice(0, 80);
  $('#clip-count').textContent = `${store.clips.length} записей`;
  $('#clip-list').innerHTML = list.length ? list.map((c) => {
    const isLink = /^https?:\/\/\S+$/.test(c.text.trim());
    return `<div class="row" data-id="${c.id}">
      <div class="ri">${icon(isLink ? 'globe' : 'text', 15)}</div>
      <div class="rb"><b>${esc(c.text.replace(/\s+/g, ' ').slice(0, 140))}</b><span>${ago(c.t)}${c.text.length > 140 ? ` · ${c.text.length} симв` : ''}</span></div>
      ${c.pinned ? `<span class="pinned">${icon('pin', 14)}</span>` : ''}
      <div class="ra"><button class="ibtn" data-c="pin" title="Закрепить">${icon('pin', 15)}</button><button class="ibtn" data-c="copy" title="Копировать">${icon('copy', 15)}</button><button class="ibtn" data-c="del" title="Удалить">${icon('x', 15)}</button></div>
    </div>`;
  }).join('') : `<div class="empty">${q ? 'Ничего не нашлось' : 'Скопируй что-нибудь — оно появится здесь'}</div>`;
}
$('#clip-list').addEventListener('click', (e) => {
  const row = e.target.closest('.row'); if (!row) return;
  const c = store.clips.find((x) => x.id === +row.dataset.id); if (!c) return;
  const act = e.target.closest('[data-c]')?.dataset.c;
  if (act === 'pin') { c.pinned = !c.pinned; store.clips.sort((a, b) => (b.pinned - a.pinned) || (b.t - a.t)); save('clips'); return renderClips(); }
  if (act === 'del') { store.clips = store.clips.filter((x) => x !== c); save('clips'); return renderClips(); }
  if (act === 'copy') { island.copy(c.text); return; }
  pinned = false; setState('pill');
  island.paste(c.text);
});
$('#clip-clear').addEventListener('click', () => { store.clips = store.clips.filter((c) => c.pinned); save('clips'); renderClips(); });

// ================= полка файлов =================
function renderShelf() {
  store.shelf ||= [];
  $('#shelf-count').textContent = store.shelf.length ? `${store.shelf.length} файл(ов)` : '';
  if (!store.shelf.length) { $('#shelf').innerHTML = `<div class="empty">${icon('inbox', 30)}<br>Перетащи сюда файлы</div>`; return; }
  $('#shelf').innerHTML = store.shelf.map((f, i) => `<div class="shelf-item" draggable="true" data-i="${i}" title="${esc(f.path)}">
    <img data-icon="${esc(f.path)}"><span>${esc(f.name)}</span><button class="ibtn rm" data-rm="${i}">${icon('x', 12)}</button></div>`).join('');
  $$('#shelf img[data-icon]').forEach(async (img) => { img.src = (await island.icon(img.dataset.icon)) || ''; });
}
$('#shelf').addEventListener('click', (e) => {
  const rm = e.target.closest('[data-rm]');
  if (rm) { store.shelf.splice(+rm.dataset.rm, 1); save('shelf'); return renderShelf(); }
  const it = e.target.closest('[data-i]'); if (it) island.open(store.shelf[+it.dataset.i].path);
});
$('#shelf').addEventListener('dragstart', (e) => {
  const it = e.target.closest('[data-i]'); if (!it) return;
  e.preventDefault();
  island.dragOut(store.shelf[+it.dataset.i].path);
});
// перетаскивание файлов на остров
let dragDepth = 0;
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());
el.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer.types.includes('Files')) return;
  dragDepth++;
  if (state !== 'panel') openPanel(tab === 'chat' ? 'chat' : 'shelf');
  if (tab === 'shelf') $('#shelf').classList.add('over');
});
el.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#shelf').classList.remove('over'); } });
el.addEventListener('drop', async (e) => {
  e.preventDefault(); dragDepth = 0; $('#shelf').classList.remove('over');
  const files = [...e.dataTransfer.files];
  if (!files.length) return;
  if (tab === 'chat') return attachToChat(files[0]);
  if (e.target.closest('#dock')) {
    for (const f of files) { const p = island.filePath(f); if (p && !store.apps.includes(p)) store.apps.push(p); }
    save('apps'); return renderDock();
  }
  store.shelf ||= [];
  for (const f of files) {
    const p = island.filePath(f);
    if (p && !store.shelf.some((x) => x.path === p)) store.shelf.push({ path: p, name: f.name });
  }
  save('shelf');
  if (tab !== 'shelf') openPanel('shelf'); else renderShelf();
});

// ================= текст =================
const ttInput = $('#tt-input');
$('#tt-tools').innerHTML = Tools.textTools.map((t, i) => `<button data-t="${i}">${t.name}</button>`).join('');
function openText() {
  if (!ttInput.value && store.clips[0]) ttInput.value = store.clips[0].text;
  ttStats();
}
const ttStats = () => { $('#tt-stats').textContent = Tools.textStats(ttInput.value); };
ttInput.addEventListener('input', ttStats);
$('#tt-tools').addEventListener('click', (e) => {
  const b = e.target.closest('[data-t]'); if (!b) return;
  const tool = Tools.textTools[+b.dataset.t];
  const st = $('#tt-status');
  try {
    ttInput.value = tool.fn(ttInput.value);
    island.copy(ttInput.value);
    st.className = 'tt-status show'; st.textContent = `✓ ${tool.name} — готово, уже в буфере`;
  } catch (err) {
    st.className = 'tt-status show err'; st.textContent = `Не получилось: ${err.message}`;
  }
  ttStats();
  clearTimeout(st._t); st._t = setTimeout(() => st.classList.remove('show'), 2500);
});
$('#tt-copy').addEventListener('click', () => island.copy(ttInput.value));
$('#tt-clear').addEventListener('click', () => { ttInput.value = ''; ttStats(); ttInput.focus(); });

// ================= чат с ИИ =================
const chat = { msgs: [], busy: false, file: null };
const SUGGEST = ['Объясни простыми словами, как работает VPN', 'Помоги написать вежливое письмо о переносе встречи', 'Придумай пять идей, чем заняться в выходные'];
function renderChat() {
  const log = $('#chat-log');
  if (!chat.msgs.length) {
    log.innerHTML = `<div class="chat-empty">${icon('sparkle', 26)}<b>Спроси что угодно</b><span class="dim">Модель: ${esc(store.settings.aiModel)} · Enter — отправить</span>
      ${SUGGEST.map((s) => `<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
  } else {
    log.innerHTML = chat.msgs.map((m) => m.file
      ? `<div class="msg user file">${icon('file', 16)}${esc(m.file)}</div>`
      : m.role === 'user' ? `<div class="msg user">${esc(m.content)}</div>`
        : `<div class="msg ai ${m.err ? 'err' : ''}">${icon('sparkle', 16)}<div>${fmtAi(m.content)}</div></div>`).join('')
      + (chat.busy ? `<div class="msg ai">${icon('sparkle', 16)}<span class="dim">Думаю…</span></div>` : '');
    log.scrollTop = log.scrollHeight;
  }
  $('#chat-file').textContent = chat.file ? chat.file.name : '';
  $('#chat-send').disabled = chat.busy;
}
const fmtAi = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^[-*] /gm, '• ').replace(/`([^`]+)`/g, '<code>$1</code>');
$('#chat-log').addEventListener('click', (e) => { const s = e.target.closest('[data-s]'); if (s) sendChat(s.dataset.s); });
$('#chat-send').addEventListener('click', () => sendChat($('#chat-q').value));
$('#chat-q').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat($('#chat-q').value); } });
$('#chat-attach').addEventListener('click', () => $('#chat-file-input').click());
$('#chat-file-input').addEventListener('change', (e) => { if (e.target.files[0]) attachToChat(e.target.files[0]); e.target.value = ''; });
async function attachToChat(f) {
  if (f.size > 400000) return showToast({ icon: 'info', title: 'Файл слишком большой', text: 'Можно приложить текстовый файл до 400 КБ', force: true });
  chat.file = { name: f.name, text: await f.text() };
  renderChat();
}
async function sendChat(q) {
  q = (q || '').trim();
  if (!q || chat.busy) return;
  $('#chat-q').value = '';
  if (chat.file) {
    chat.msgs.push({ role: 'user', file: chat.file.name, content: `Файл «${chat.file.name}»:\n\n${chat.file.text.slice(0, 60000)}` });
    chat.file = null;
  }
  chat.msgs.push({ role: 'user', content: q });
  chat.busy = true; mascot('think'); renderChat();
  const s = store.settings;
  try {
    const r = await island.http({
      url: s.aiUrl.replace(/\/+$/, '') + '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(s.aiKey ? { Authorization: `Bearer ${s.aiKey}` } : {}) },
      body: {
        model: s.aiModel,
        messages: [{ role: 'system', content: 'Ты — помощник внутри Island, динамического острова для Windows. Отвечай кратко и по делу, на языке пользователя. Если просят итог — дай его по пунктам.' },
          ...chat.msgs.filter((m) => !m.err).map(({ role, content }) => ({ role, content }))],
      },
    });
    const text = r.json?.choices?.[0]?.message?.content;
    if (!text) throw new Error(r.json?.error?.message || r.text || `Ошибка ${r.status}`);
    chat.msgs.push({ role: 'assistant', content: text.trim() });
  } catch (err) {
    chat.msgs.push({ role: 'assistant', err: true, content: `Не удалось получить ответ: ${err.message}\nПроверь адрес и модель во вкладке «Настройки» (бесплатно: Ollama на этом компьютере или ключ Groq / OpenRouter).` });
  }
  chat.busy = false; mascot(); renderChat();
  if (state !== 'panel') showToast({ icon: 'sparkle', title: 'Ответ готов', text: chat.msgs.at(-1).content.slice(0, 90) });
}

// ================= заметки =================
let folder = 0;
function renderNotes() {
  const n = store.notes;
  $('#folders').innerHTML = n.folders.map((f, i) => `<button class="${i === folder ? 'on' : ''}" data-f="${i}">${esc(f)}</button>`).join('') + `<button data-f="new" title="Новая папка">${icon('plus', 13)}</button>`;
  $('#note').innerHTML = n.items[n.folders[folder]] || '';
  renderReminders();
  renderTimer();
}
$('#folders').addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]'); if (!b) return;
  if (b.dataset.f === 'new') {
    const name = `Папка ${store.notes.folders.length + 1}`;
    store.notes.folders.push(name); folder = store.notes.folders.length - 1; save('notes');
  } else folder = +b.dataset.f;
  renderNotes();
});
$('#folders').addEventListener('dblclick', (e) => {
  const b = e.target.closest('[data-f]'); if (!b || b.dataset.f === 'new') return;
  b.contentEditable = 'true'; b.focus();
  b.onblur = () => {
    const old = store.notes.folders[+b.dataset.f], name = b.textContent.trim() || old;
    store.notes.items[name] = store.notes.items[old]; if (name !== old) delete store.notes.items[old];
    store.notes.folders[+b.dataset.f] = name; save('notes'); renderNotes();
  };
});
let noteSave;
$('#note').addEventListener('input', () => {
  clearTimeout(noteSave);
  noteSave = setTimeout(() => { store.notes.items[store.notes.folders[folder]] = $('#note').innerHTML; save('notes'); }, 400);
});
$('#note').addEventListener('change', (e) => {
  if (e.target.type === 'checkbox') {
    e.target.toggleAttribute('checked', e.target.checked);
    e.target.closest('.todo')?.classList.toggle('done', e.target.checked);
    $('#note').dispatchEvent(new Event('input'));
  }
});
const NOTE_TOOLS = [
  ['bold', () => document.execCommand('bold')], ['italic', () => document.execCommand('italic')],
  ['strike', () => document.execCommand('strikeThrough')], ['highlight', () => document.execCommand('hiliteColor', false, 'rgba(255,159,10,.35)')],
  ['list', () => document.execCommand('insertUnorderedList')],
  ['checklist', () => document.execCommand('insertHTML', false, '<div class="todo"><input type="checkbox"><span>&#8203;</span></div>')],
];
$('#note-tools').innerHTML = NOTE_TOOLS.map(([ic], i) => `<button class="ibtn" data-n="${i}">${icon(ic, 15)}</button>`).join('')
  + `<span class="spacer"></span><button class="ibtn" id="note-copy" title="Копировать текст заметки">${icon('copy', 15)}</button>`;
$('#note-tools').addEventListener('mousedown', (e) => e.preventDefault());
$('#note-tools').addEventListener('click', (e) => {
  const b = e.target.closest('[data-n]');
  if (b) { $('#note').focus(); NOTE_TOOLS[+b.dataset.n][1](); $('#note').dispatchEvent(new Event('input')); }
  if (e.target.closest('#note-copy')) island.copy($('#note').innerText);
});

// ---- таймер ----
const timer = { total: 300, left: 300, endAt: 0, running: false };
$('#presets').innerHTML = [5, 10, 15, 25, 45].map((m) => `<button data-m="${m}">${m}</button>`).join('');
$('#presets').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) setTimer(+b.dataset.m * 60); });
function setTimer(sec, start = false) {
  timer.total = timer.left = sec; timer.running = false;
  if (start) startTimer();
  renderTimer(); refresh();
}
function startTimer() { timer.running = true; timer.endAt = Date.now() + timer.left * 1000; renderTimer(); refresh(); }
$('#timer-start').addEventListener('click', () => {
  if (timer.running) { timer.running = false; timer.left = Math.ceil((timer.endAt - Date.now()) / 1000); renderTimer(); refresh(); }
  else { if (timer.left <= 0) timer.left = timer.total; startTimer(); }
});
$('#timer-reset').addEventListener('click', () => setTimer(timer.total));
function timerTick() {
  if (!timer.running) return;
  timer.left = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
  renderTimer();
  if (timer.left <= 0) {
    timer.running = false; refresh(); beep();
    island.notify({ icon: 'timer', title: 'Таймер завершён', text: `${fmtTime(timer.total)} прошло`, sticky: true, system: true });
  }
}
function renderTimer() {
  $('#ring-time').textContent = fmtTime(timer.left);
  $('#ring-fg').style.strokeDashoffset = 276.5 * (1 - timer.left / timer.total);
  $('#timer-start').textContent = timer.running ? 'Пауза' : 'Старт';
  $('#pill-timer').textContent = timer.running ? fmtTime(timer.left) : '';
}
function beep() {
  try {
    const a = new AudioContext();
    [0, 0.25, 0.5].forEach((t) => {
      const o = a.createOscillator(), g = a.createGain();
      o.frequency.value = 880; g.gain.setValueAtTime(0.2, a.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + t + 0.2);
      o.connect(g).connect(a.destination); o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.22);
    });
  } catch {}
}

// ---- напоминания ----
island.on('reminders', (r) => { store.reminders = r; renderReminders(); });
function renderReminders() {
  const list = [...store.reminders].sort((a, b) => a.at - b.at);
  $('#rem-list').innerHTML = list.length ? list.map((r) => `<div class="r">${icon('bell', 13)}<span>${esc(r.text)}</span><small>${Tools.fmtWhen(r.at)}</small><button class="ibtn" data-del="${r.id}" style="width:20px;height:20px">${icon('x', 11)}</button></div>`).join('')
    : '<div class="empty">Напиши обычной фразой: «позвонить маме завтра в 9», «через 20 минут выключить плиту»</div>';
}
$('#rem-list').addEventListener('click', (e) => {
  const d = e.target.closest('[data-del]'); if (!d) return;
  store.reminders = store.reminders.filter((r) => r.id !== +d.dataset.del); save('reminders'); renderReminders();
});
$('#rem-q').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const v = e.target.value.trim(); if (!v) return;
  const r = Tools.parseReminder(/^напомни/i.test(v) ? v : 'напомни ' + v);
  if (!r) return showToast({ icon: 'info', title: 'Не понял, когда напомнить', text: 'Например: «завтра в 9», «в 18:30», «через 10 минут»', force: true });
  island.remind(r); e.target.value = '';
  showToast({ icon: 'bell', title: 'Напомню ' + Tools.fmtWhen(r.at), text: r.text, force: true });
});

// ================= управление =================
let vpn = { on: false, via: '', busy: false };
let bt = { radio: null, devices: [], loading: false };
island.on('vpn', (v) => { vpn = { ...vpn, ...v }; if (tab === 'control' && state === 'panel') renderControl(); });
function btIcon(name) {
  const n = name.toLowerCase();
  if (/bud|pod|head|наушн|ear|wh-|wf-|jbl tune|freebuds|airdots/.test(n)) return 'headphones';
  if (/mouse|мыш|mx /.test(n)) return 'mouse';
  if (/key|клав/.test(n)) return 'keyboard';
  if (/speaker|колонк|boom|flip|charge|станци|alice|алис/.test(n)) return 'speaker';
  if (/phone|iphone|galaxy|redmi|pixel|телефон/.test(n)) return 'phone';
  if (/pad|controller|геймпад|xbox|dualsense/.test(n)) return 'gamepad';
  return 'bluetooth';
}
async function loadBt() {
  bt.loading = true; renderControl();
  bt = { radio: null, devices: [], errors: [], ...(await island.btList()), loading: false };
  if (tab === 'control' && state === 'panel') renderControl();
}
async function renderControl() {
  const theme = await island.getTheme();
  const s = store.settings;
  const tiles = [['lock', 'lock', 'Блокировка'], ['sleep', 'moon', 'Сон'], ['restart', 'restart', 'Перезагрузка'], ['shutdown', 'power', 'Выключение']];
  const btOn = bt.radio !== 'Off' && bt.radio !== 'Disabled';
  const devs = bt.devices.slice().sort((a, b) => b.connected - a.connected);
  const btList = bt.loading && !devs.length ? '<div class="empty">Ищу устройства…</div>'
    : !btOn ? '<div class="empty">Bluetooth выключен</div>'
      : devs.length ? devs.map((d) => `<div class="bt-dev ${d.connected ? 'on' : ''}">
          <div class="bt-ic">${icon(btIcon(d.name), 16)}</div>
          <div class="rb"><b>${esc(d.name)}</b><span>${d.connected ? 'Подключено' : 'Не подключено'}${d.battery != null ? ` · ${d.battery}%` : ''}</span></div>
          <button class="chip ${d.connected ? '' : 'accent'}" data-bt-open>${d.connected ? 'Отключить' : 'Подключить'}</button></div>`).join('')
        : `<div class="empty">${bt.service && bt.service !== 'Running' ? 'Служба Bluetooth не запущена' : 'Нет сопряжённых устройств'}${(bt.errors || []).length ? `<div class="bt-err">${esc(bt.errors.join(' · '))}</div>` : ''}</div>`;
  const toggles = [
    ['vpn', vpn.on, 'VPN', vpn.busy ? 'Переключаю…' : vpn.on ? `Включён · ${vpn.via}` : (s.vpnConf ? 'Туннель AmneziaWG' : vpn.app ? vpn.app.split(/[\\/]/).pop().replace(/\.(lnk|exe)$/i, '') : 'Happ / Amnezia — укажи в настройках')],
    ['theme', theme === 'dark', 'Тёмная тема', 'Windows и приложения'],
    ['dnd', s.dnd, 'Не беспокоить', 'Только таймеры и агенты'],
  ];
  $('#control').innerHTML = `
    <div class="card bt-card">
      <div class="bt-head"><span class="label">${icon('bluetooth', 13)}Устройства Bluetooth</span><span class="spacer"></span>
        <button class="ibtn" data-bt-refresh title="Обновить">${icon('refresh', 14)}</button>
        <button class="ibtn" data-bt-open title="Параметры Bluetooth">${icon('gear', 14)}</button>
        <button class="switch ${btOn ? 'on' : ''}" data-bt-radio></button></div>
      <div class="bt-list">${btList}</div>
    </div>
    <div class="ctiles">${tiles.map(([id, ic, name]) => `<button class="ctile" data-sys="${id}">${icon(ic, 20)}<span>${name}</span></button>`).join('')}</div>
    <div class="ctoggles">${toggles.map(([id, on, name, sub]) => `<div class="toggle-row ${id === 'vpn' && on ? 'vpn-on' : ''}"><div class="tb"><b>${id === 'vpn' ? icon('shield', 14) : ''}${name}</b><span class="ellipsis">${esc(sub)}</span></div><button class="switch ${on ? 'on' : ''}" data-tg="${id}" ${id === 'vpn' && vpn.busy ? 'disabled' : ''}></button></div>`).join('')}</div>`;
}
$('#control').addEventListener('click', async (e) => {
  if (e.target.closest('[data-bt-open]')) { island.open('ms-settings:bluetooth'); return; }
  if (e.target.closest('[data-bt-refresh]')) return loadBt();
  if (e.target.closest('[data-bt-radio]')) {
    const on = bt.radio === 'Off';
    bt.radio = on ? 'On' : 'Off'; renderControl();
    await island.btRadio(on);
    return setTimeout(loadBt, 1500);
  }
  const t = e.target.closest('[data-sys]');
  if (t) {
    const what = t.dataset.sys;
    if (what === 'lock' || t.classList.contains('confirm')) { island.system(what); t.classList.remove('confirm'); return; }
    t.classList.add('confirm'); t.querySelector('span').textContent = 'Нажми ещё раз';
    setTimeout(() => renderControl(), 3000);
    return;
  }
  const g = e.target.closest('[data-tg]'); if (!g || g.disabled) return;
  const on = !g.classList.contains('on');
  g.classList.toggle('on', on);
  if (g.dataset.tg === 'theme') await island.setTheme(on ? 'dark' : 'light');
  else if (g.dataset.tg === 'vpn') toggleVpn(on);
  else saveSetting(g.dataset.tg, on);
});
async function toggleVpn(on) {
  vpn.busy = true; renderControl();
  const r = await island.vpnSet(on);
  vpn = { ...vpn, ...r, busy: false };
  if (!r.ok) showToast({ icon: 'shield', title: 'VPN не переключился', text: r.error, force: true });
  else showToast({ icon: 'shield', title: r.on ? 'VPN включён' : 'VPN выключен', text: r.on ? r.via : 'Интернет напрямую', force: true });
  if (tab === 'control' && state === 'panel') renderControl();
}

// ================= агенты =================
let agents = [];
island.on('agents', (list) => {
  const wasBusy = agents.some((a) => a.state === 'working');
  agents = list;
  const busy = agents.some((a) => a.state === 'working');
  if (busy !== wasBusy && !chat.busy) mascot(busy ? 'think' : '');
  if (currentToast?.icon === 'agent' && !agents.some((a) => a.state === 'ask')) { clearTimeout(toastTimer); endToast(); }
  renderAgents();
});
function renderAgents() {
  const a = agents.find((x) => x.state === 'ask') || agents[0];
  const elA = $('#pill-agent');
  if (!a) { elA.innerHTML = ''; elA.className = 'pill-agent'; refresh(); return; }
  elA.className = `pill-agent ${a.state}`;
  elA.title = `${a.name}${a.project ? ' · ' + a.project : ''}\n${a.text || ''}`;
  elA.innerHTML = `<i></i>${a.state === 'ask' ? 'ждёт' : 'работает'}${agents.length > 1 ? ` ×${agents.length}` : ''}`;
  refresh();
}

// ================= запись экрана =================
const recorder = { mr: null, t0: 0, timer: null, ext: '' };
async function startRecording() {
  if (recorder.mr) return;
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60, max: 60 } }, audio: !!store.settings.recAudio && navigator.userAgent.includes('Windows') });
    const hasAudio = stream.getAudioTracks().length > 0;
    const mime = (hasAudio
      ? ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/webm;codecs=vp9,opus', 'video/webm']
      : ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']).find((m) => MediaRecorder.isTypeSupported(m));
    const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16e6 });
    recorder.ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    await island.recStart(recorder.ext);
    let chain = Promise.resolve();
    mr.ondataavailable = (e) => { if (e.data.size) chain = chain.then(async () => island.recChunk(await e.data.arrayBuffer())); };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      chain.then(() => island.recStop());
      clearInterval(recorder.timer); recorder.mr = null;
      el.classList.remove('recording'); refresh();
    };
    stream.getVideoTracks()[0].onended = () => mr.state !== 'inactive' && mr.stop();
    mr.start(1000);
    recorder.mr = mr; recorder.t0 = Date.now();
    $('#rec-fmt').textContent = recorder.ext.toUpperCase();
    recorder.timer = setInterval(() => { $('#rec-time').textContent = fmtTime((Date.now() - recorder.t0) / 1000); }, 500);
    $('#rec-time').textContent = '0:00';
    el.classList.add('recording'); refresh();
  } catch (err) {
    showToast({ icon: 'record', title: 'Запись не началась', text: err.message, force: true });
  }
}
function stopRecording() { if (recorder.mr && recorder.mr.state !== 'inactive') recorder.mr.stop(); }
$('#rec-stop').addEventListener('click', (e) => { e.stopPropagation(); stopRecording(); });

// ================= настройки =================
async function renderSettings() {
  const s = store.settings;
  const ag = await island.agentsStatus();
  const f = (key, label, ph = '', type = 'text', wide = false) => `<div class="field ${wide ? 'wide' : ''}"><label>${label}</label><input data-set="${key}" type="${type}" value="${esc(s[key])}" placeholder="${esc(ph)}"></div>`;
  const sw = (key, label) => `<div class="field row2"><div><label>${label}</label></div><button class="switch ${s[key] ? 'on' : ''}" data-tgs="${key}"></button></div>`;
  const pick = (key, label, ph, kind) => `<div class="field"><label>${label}</label><div class="pick"><input data-set="${key}" value="${esc(s[key])}" placeholder="${esc(ph)}"><button class="chip" data-pick="${key}" data-kind="${kind}">Выбрать</button></div></div>`;
  $('#settings').innerHTML = `
    ${f('city', 'Город для погоды (Enter — найти)', 'Москва')}
    ${f('hotkey', 'Горячая клавиша поиска', 'Alt+Space')}
    ${sw('autostart', 'Запускать вместе с Windows')}
    ${sw('mascot', 'Котик на острове')}
    ${sw('lyrics', 'Слова песен в мини-плеере')}
    ${sw('recAudio', 'Записывать звук системы в видео')}
    <div class="field wide row2"><div><label>Агенты в терминале · Claude Code</label><div class="sub">${ag.installed ? '✓ Подключено — остров покажет, когда агент работает, ждёт ответа и закончил' : 'Остров добавит хуки в ~/.claude/settings.json (копия сохранится рядом)'}</div></div>
      <button class="chip ${ag.installed ? '' : 'accent'}" data-agents="${ag.installed ? 'remove' : 'install'}">${ag.installed ? 'Отключить' : 'Подключить'}</button></div>
    ${pick('vpnApp', 'VPN: программа (Happ / AmneziaVPN)', 'найдётся сама', 'app')}
    ${pick('vpnConf', 'VPN: конфиг AmneziaWG (необязательно)', 'файл .conf', 'conf')}
    ${f('aiUrl', 'ИИ: адрес (OpenAI-совместимый)', 'http://localhost:11434/v1', 'text', true)}
    ${f('aiModel', 'ИИ: модель', 'llama3.2')}
    ${f('aiKey', 'ИИ: ключ (если нужен)', 'не нужен для Ollama', 'password')}
    <div class="note2"><b>VPN.</b> С программой Happ / AmneziaVPN остров запускает и закрывает её. Включи в ней «подключаться при запуске», тогда переключатель включает VPN сразу. С конфигом AmneziaWG остров поднимает туннель сам, без приложения, а Windows один раз спросит права администратора.<br>
    <b>Другие агенты</b> (Codex, Aider, свои скрипты) могут писать на <code>http://127.0.0.1:${ag.port}/agent/имя</code> JSON вида <code>{"event":"start|ask|done","text":"…"}</code>.<br>
    <b>ИИ бесплатно:</b> Ollama на этом компе (<code>ollama pull llama3.2</code>), ключ Groq (https://api.groq.com/openai/v1, llama-3.3-70b-versatile) или OpenRouter (модели :free).<br>
    Скриншоты лежат в «Изображения/Island», записи экрана — в «Видео/Island».</div>`;
}
$('#settings').addEventListener('change', (e) => {
  const i = e.target.closest('[data-set]'); if (!i || i.dataset.set === 'city') return;
  saveSetting(i.dataset.set, i.value.trim());
});
$('#settings').addEventListener('keydown', async (e) => {
  const i = e.target.closest('[data-set="city"]'); if (!i || e.key !== 'Enter') return;
  const r = await island.http({ url: `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(i.value.trim())}&count=1&language=ru` });
  const g = r.json?.results?.[0];
  if (!g) return showToast({ icon: 'info', title: 'Город не найден', text: i.value, force: true });
  Object.assign(store.settings, { city: g.name, lat: g.latitude, lon: g.longitude });
  save('settings'); i.value = g.name; loadWeather();
  showToast({ icon: 'location', title: 'Погода: ' + g.name, text: [g.admin1, g.country].filter(Boolean).join(', '), force: true });
});
$('#settings').addEventListener('click', async (e) => {
  const g = e.target.closest('[data-tgs]');
  if (g) { const on = !g.classList.contains('on'); g.classList.toggle('on', on); saveSetting(g.dataset.tgs, on); }
  const p = e.target.closest('[data-pick]');
  if (p) {
    const file = await island.pickFile(p.dataset.kind);
    if (file) { saveSetting(p.dataset.pick, file); renderSettings(); }
  }
  const a = e.target.closest('[data-agents]');
  if (a) {
    const r = await island.agentsInstall(a.dataset.agents === 'remove');
    if (!r.ok) showToast({ icon: 'agent', title: 'Не получилось', text: r.error, force: true });
    else showToast({ icon: 'agent', title: a.dataset.agents === 'remove' ? 'Агенты отключены' : 'Claude Code подключён', text: a.dataset.agents === 'remove' ? 'Хуки убраны из настроек' : 'Перезапусти Claude Code — дальше остров всё покажет', force: true });
    renderSettings();
  }
});

function save(key) { island.setStore(key, store[key]); }
function saveSetting(k, v) {
  store.settings[k] = v; save('settings');
  if (k === 'lyrics' && v && media) loadLyrics(media);
  if (k === 'hotkey') $('#lkbd').textContent = v;
  refresh();
}
island.on('store', (s) => { store = s; refresh(); });

// ================= строка поиска (Alt+Space) =================
const launcher = { items: [], sel: 0, seq: 0 };
const lq = $('#lq');
const L_ACTIONS = [
  { icon: 'region', title: 'Скриншот области', keys: 'скриншот область скрин screenshot', run: () => island.capture('region') },
  { icon: 'screen', title: 'Скриншот экрана', keys: 'скриншот экран весь скрин screenshot', run: () => island.capture('full') },
  { icon: 'record', title: 'Запись экрана', keys: 'запись экрана видео record', run: () => startRecording() },
  { icon: 'shield', title: 'Включить / выключить VPN', keys: 'vpn впн happ amnezia', run: () => toggleVpn(!vpn.on) },
  { icon: 'bluetooth', title: 'Bluetooth-устройства', keys: 'bluetooth блютуз наушники', run: () => openPanel('control'), stay: true },
  { icon: 'color', title: 'Пипетка', keys: 'пипетка цвет color picker', run: () => island.capture('color') },
  { icon: 'qr', title: 'QR-код с экрана', keys: 'qr код кьюар', run: () => island.capture('qr') },
  { icon: 'note', title: 'Заметки и таймер', keys: 'заметки заметка таймер notes', run: () => openPanel('notes'), stay: true },
  { icon: 'weather', title: 'Погода', keys: 'погода weather', run: () => openPanel('weather'), stay: true },
  { icon: 'clip', title: 'История буфера', keys: 'буфер история clipboard', run: () => openPanel('clip'), stay: true },
  { icon: 'text', title: 'Превращения текста', keys: 'текст транслит раскладка регистр base64 json', run: () => openPanel('text'), stay: true },
  { icon: 'lock', title: 'Заблокировать компьютер', keys: 'блокировка заблокировать lock', run: () => island.system('lock') },
];
island.on('launcher', openLauncher);
function openLauncher() {
  pinned = false;
  setState('launcher');
  island.focus();
  lq.value = ''; updateLauncher();
  setTimeout(() => lq.focus(), 30);
}
let rates = null, ratesAt = 0;
async function getRates() {
  if (rates && Date.now() - ratesAt < 6 * 36e5) return rates;
  const r = await island.http({ url: 'https://open.er-api.com/v6/latest/USD' });
  if (r.json?.rates) { rates = r.json.rates; ratesAt = Date.now(); }
  return rates;
}
lq.addEventListener('input', updateLauncher);
async function updateLauncher() {
  const q = lq.value.trim();
  const seq = ++launcher.seq;
  const items = [];
  if (!q) {
    items.push(...L_ACTIONS.filter((a) => ['Скриншот области', 'Скриншот экрана', 'Запись экрана', 'QR-код с экрана'].includes(a.title)));
  } else {
    if (q.startsWith('>')) {
      const cmd = q.slice(1).trim();
      items.push({ icon: 'command', title: `Выполнить: ${cmd || '…'}`, sub: 'Откроется командная строка', run: () => cmd && island.run(cmd) });
    }
    const rem = Tools.parseReminder(q);
    if (rem) items.push({ icon: 'bell', title: `Напомнить: «${rem.text}»`, sub: Tools.fmtWhen(rem.at), hint: 'Enter — добавить', run: () => { island.remind(rem); island.notify({ icon: 'bell', title: 'Напомню ' + Tools.fmtWhen(rem.at), text: rem.text }); } });
    const tm = Tools.parseTimer(q);
    if (tm) items.push({ icon: 'timer', title: `Таймер на ${tm.label}`, sub: 'Отсчёт будет виден на острове', run: () => setTimer(Math.round(tm.ms / 1000), true) });
    const c = Tools.calc(q);
    if (c !== null) items.push({ icon: 'calc', title: `= ${Tools.fmtNum(c)}`, sub: 'Enter — скопировать результат', run: () => island.copy(String(c)) });
    const conv = Tools.convertUnits(q);
    if (conv?.type === 'unit') items.push({ icon: 'calc', title: conv.text, sub: 'Enter — скопировать', run: () => island.copy(String(conv.value)) });
    if (conv?.type === 'currency') items.push({ icon: 'calc', title: 'Считаю курс…', sub: `${conv.from} → ${conv.to}`, id: 'cur', run: () => {} });
    const ql = q.toLowerCase();
    items.push(...L_ACTIONS.filter((a) => a.keys.split(' ').some((k) => k.startsWith(ql)) || a.title.toLowerCase().includes(ql)));
    items.push({ icon: 'sparkle', title: `Спросить ИИ: «${q}»`, hint: 'нейросеть', run: () => { openPanel('chat'); sendChat(q); }, stay: true });
    items.push({ icon: 'globe', title: `Искать в браузере: «${q}»`, hint: 'Яндекс', run: () => island.open('https://ya.ru/search/?text=' + encodeURIComponent(q)) });
    if (conv?.type === 'currency') {
      getRates().then((r) => {
        if (seq !== launcher.seq || !r) return;
        const v = conv.amount / r[conv.from] * r[conv.to];
        const it = launcher.items.find((x) => x.id === 'cur'); if (!it) return;
        it.title = `${Tools.fmtNum(conv.amount)} ${conv.from} = ${Tools.fmtNum(+v.toFixed(2))} ${conv.to}`;
        it.sub = 'Курс open.er-api.com · Enter — скопировать';
        it.run = () => island.copy(v.toFixed(2));
        renderLauncher();
      }).catch(() => {});
    }
  }
  launcher.items = items; launcher.sel = 0; renderLauncher();
  if (q && !q.startsWith('>')) {
    const found = await island.search(q);
    if (seq !== launcher.seq) return;
    const extra = found.map((f) => ({
      img: f.icon, icon: f.kind === 'app' ? 'command' : 'file', title: f.name,
      sub: f.kind === 'app' ? 'Программа' : f.path, hint: f.kind === 'app' ? 'открыть' : 'файл', run: () => island.open(f.path),
    }));
    // программы и файлы — сразу после «умных» ответов
    const smart = launcher.items.filter((x) => ['bell', 'timer', 'calc', 'command'].includes(x.icon) && !x.img);
    const rest = launcher.items.filter((x) => !smart.includes(x));
    launcher.items = [...smart, ...extra, ...rest];
    renderLauncher();
  }
}
function renderLauncher() {
  $('#lres').innerHTML = launcher.items.map((it, i) => `<div class="row ${i === launcher.sel ? 'sel' : ''}" data-i="${i}">
    <div class="ri">${it.img ? `<img src="${it.img}">` : icon(it.icon, 15)}</div>
    <div class="rb"><b>${esc(it.title)}</b>${it.sub ? `<span>${esc(it.sub)}</span>` : ''}</div>
    ${it.hint ? `<span class="rt">${esc(it.hint)}</span>` : ''}${i === launcher.sel ? '<span class="rt"><kbd>↵</kbd></span>' : ''}</div>`).join('');
  if (state === 'launcher') refresh();
  $('#lres .sel')?.scrollIntoView({ block: 'nearest' });
}
function runItem(it) {
  if (!it) return;
  if (!it.stay) { setState('pill'); island.blur(); }
  setTimeout(() => it.run(), it.stay ? 0 : 120);
}
lq.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { launcher.sel = Math.min(launcher.items.length - 1, launcher.sel + 1); renderLauncher(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { launcher.sel = Math.max(0, launcher.sel - 1); renderLauncher(); e.preventDefault(); }
  if (e.key === 'Enter') runItem(launcher.items[launcher.sel]);
});
$('#lres').addEventListener('click', (e) => { const r = e.target.closest('[data-i]'); if (r) runItem(launcher.items[+r.dataset.i]); });

// ================= старт =================
(async function init() {
  store = await island.getStore();
  store.shelf ||= [];
  for (const b of $$('[data-media="prev"]')) b.innerHTML = icon('prev', 18);
  for (const b of $$('[data-media="next"]')) b.innerHTML = icon('next', 18);
  for (const b of $$('.ibtn[data-act="lyrics-toggle"]')) b.innerHTML = icon('lyrics', 18);
  for (const s of $$('.si')) s.innerHTML = icon('search', 16);
  $('#clip-clear').innerHTML = icon('trash', 15);
  $('#tt-copy').innerHTML = icon('copy', 15); $('#tt-clear').innerHTML = icon('trash', 15);
  $('#chat-attach').innerHTML = icon('attach', 16); $('#chat-send').innerHTML = icon('send', 16);
  $('.lic').innerHTML = icon('bell', 12);
  $('#lkbd').textContent = store.settings.hotkey;
  setArt(null);
  tick(); renderMedia(); renderTimer();
  setState('pill');
  loadWeather(); setInterval(loadWeather, 15 * 6e4);
})();
