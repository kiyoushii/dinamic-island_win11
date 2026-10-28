const {
  app, BrowserWindow, ipcMain, screen, globalShortcut, clipboard, shell,
  nativeImage, desktopCapturer, Notification, Tray, Menu, net, dialog,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, exec } = require('child_process');

const IS_WIN = process.platform === 'win32';
const DEMO = process.env.ISLAND_DEMO === '1' || !IS_WIN;
const WIN_W = 860;
const WIN_H = 640;

if (!app.requestSingleInstanceLock()) app.quit();

// ---------- хранилище ----------
const storeFile = () => path.join(app.getPath('userData'), 'island.json');
const defaults = {
  settings: {
    vpnApp: '', vpnConf: '', recAudio: true, yandexToken: '',
    city: 'Москва', lat: 55.7558, lon: 37.6173,
    hotkey: 'Alt+Space', mascot: true, dnd: false, autostart: false,
    aiEngine: 'claude', claudeOpen: 'desktop',
    aiUrl: 'http://localhost:11434/v1', aiKey: '', aiModel: 'llama3.2',
    lyrics: true,
  },
  clips: [],          // {id, text, t, pinned}
  notes: { folders: ['Заметка', 'Работа', 'Покупки'], items: {} },
  reminders: [],      // {id, text, at}
  apps: [],           // закреплённые программы: путь к .exe/.lnk
};
let store;
function loadStore() {
  try { store = { ...defaults, ...JSON.parse(fs.readFileSync(storeFile(), 'utf8')) }; }
  catch { store = JSON.parse(JSON.stringify(defaults)); }
  store.settings = { ...defaults.settings, ...store.settings };
}
let saveTimer;
function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(storeFile(), JSON.stringify(store, null, 1), () => {}), 300);
}

// ---------- окно ----------
let win;
function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    width: WIN_W, height: WIN_H,
    x: Math.round(workArea.x + (workArea.width - WIN_W) / 2), y: workArea.y, // точное место — place()
    frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { place(); win.showInactive(); });
  win.webContents.on('did-finish-load', place);
  win.on('blur', () => send('blur'));
  // Alt+F4 не должен убивать остров — закрываем окно только при выходе из программы
  win.on('close', (e) => { if (!quitting) e.preventDefault(); });
}
let quitting = false;
app.on('before-quit', () => { quitting = true; clearInterval(cursorTimer); });
const alive = () => win && !win.isDestroyed();
const send = (ch, data) => { if (alive()) win.webContents.send(ch, data); };

function toast(n) {
  // n: {icon, title, text}
  if (store.settings.dnd && !n.force) return;
  send('toast', n);
}

ipcMain.on('mouse', (_e, over) => {
  if (!alive()) return;
  win.setIgnoreMouseEvents(!over, { forward: true });
});
ipcMain.on('focus', () => { if (alive()) win.focus(); });
ipcMain.on('blur', () => { if (alive()) win.blur(); });

ipcMain.handle('store:get', () => store);
// поля, которыми владеет только главный процесс (у интерфейса может быть устаревшая копия)
const MAIN_OWNED = ['pos', 'yandexToken', 'hotkey'];
ipcMain.handle('store:set', (_e, key, value) => {
  if (key === 'settings') for (const k of MAIN_OWNED) value[k] = store.settings[k];
  store[key] = value; saveStore();
  if (key === 'settings') applySettings();
  return true;
});

function applySettings() {
  registerHotkey();
  if (IS_WIN) app.setLoginItemSettings({ openAtLogin: !!store.settings.autostart });
  cursorLoop();
}

// ---------- музыка и громкость (PowerShell мост) ----------
let ps, psBuf = '', lastThumb = { key: '', thumb: null };
function startMediaBridge() {
  if (DEMO) return startDemoMedia();
  const script = path.join(__dirname, 'win', 'media.ps1').replace('app.asar', 'app.asar.unpacked');
  ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true });
  ps.stdout.setEncoding('utf8');
  ps.stdout.on('data', (chunk) => {
    psBuf += chunk;
    let i;
    while ((i = psBuf.indexOf('\n')) >= 0) {
      const line = psBuf.slice(0, i).trim(); psBuf = psBuf.slice(i + 1);
      if (!line.startsWith('{')) continue;
      try {
        const st = JSON.parse(line);
        if (st.media) {
          if (st.media.thumb) lastThumb = { key: st.media.key, thumb: st.media.thumb };
          st.media.thumb = lastThumb.key === st.media.key ? lastThumb.thumb : null;
        }
        send('media', st);
      } catch {}
    }
  });
  ps.on('exit', () => setTimeout(startMediaBridge, 3000));
}
function mediaCmd(cmd) {
  if (DEMO) return demoCmd(cmd);
  if (ps && ps.stdin.writable) ps.stdin.write(cmd + '\n');
}
ipcMain.on('media', (_e, cmd) => mediaCmd(cmd));

// демо-режим (не Windows): чтобы было видно, как всё работает
let demo = { title: 'Wake Up', artist: 'Josh Woodward', album: 'Here Today', playing: true, position: 40, duration: 230, volume: 0.6, muted: false };
function startDemoMedia() {
  setInterval(() => {
    if (demo.playing) demo.position = (demo.position + 0.5) % demo.duration;
    send('media', {
      volume: demo.volume, muted: demo.muted,
      media: { ...demo, key: demo.title, updated: Date.now(), thumb: null, app: 'Demo' },
    });
  }, 500);
}
function demoCmd(cmd) {
  const [c, a] = cmd.split(' ');
  if (c === 'toggle') demo.playing = !demo.playing;
  if (c === 'seek') demo.position = +a;
  if (c === 'vol') demo.volume = +a;
  if (c === 'mute') demo.muted = !demo.muted;
  if (c === 'next' || c === 'prev') demo.position = 0;
}

// ---------- буфер обмена ----------
let lastClip = '';
function clipboardLoop() {
  lastClip = clipboard.readText();
  setInterval(() => {
    const t = clipboard.readText();
    if (!t || t === lastClip) return;
    lastClip = t;
    if (t.length > 20000) return;
    const existing = store.clips.find((c) => c.text === t);
    store.clips = store.clips.filter((c) => c.text !== t);
    store.clips.unshift({ id: Date.now(), text: t, t: Date.now(), pinned: existing?.pinned || false });
    const pinned = store.clips.filter((c) => c.pinned);
    store.clips = [...pinned, ...store.clips.filter((c) => !c.pinned)].slice(0, 300);
    saveStore();
    send('clips', store.clips);
    if (!suppressCopyToast) toast({ icon: 'clip', title: 'Скопировано', text: t.replace(/\s+/g, ' ').slice(0, 90) });
    suppressCopyToast = false;
  }, 700);
}
let suppressCopyToast = false;
ipcMain.on('copy', (_e, text) => { suppressCopyToast = true; lastClip = text; clipboard.writeText(text); });
ipcMain.on('paste', (_e, text) => {
  suppressCopyToast = true; lastClip = text;
  clipboard.writeText(text);
  win.blur();
  setTimeout(() => mediaCmd('paste'), 180);
});

// ---------- загрузки ----------
function downloadsLoop() {
  const dir = app.getPath('downloads');
  const partial = /\.(crdownload|part|partial|opdownload)$/i;
  const track = new Map(); // имя -> { size, t, changedAt, active }
  setInterval(() => {
    let files;
    try { files = fs.readdirSync(dir); } catch { return; }
    const now = Date.now();
    const seen = new Set();
    for (const f of files) {
      if (!partial.test(f)) continue;
      let st; try { st = fs.statSync(path.join(dir, f)); } catch { continue; }
      if (!st.isFile()) continue;
      seen.add(f);
      const prev = track.get(f);
      if (!prev) { track.set(f, { size: st.size, t: now, changedAt: 0, speed: 0, active: false }); continue; }
      const grew = st.size !== prev.size;
      const speed = grew ? (st.size - prev.size) / ((now - prev.t) / 1000) : 0;
      track.set(f, { size: st.size, t: now, speed, changedAt: grew ? now : prev.changedAt, active: prev.active || grew });
    }
    for (const [f, v] of track) {
      if (seen.has(f)) continue;
      track.delete(f);
      // файл пропал: если он рос и рядом появился готовый — значит загрузка завершилась
      const name = f.replace(partial, '');
      if (v.active && fs.existsSync(path.join(dir, name))) {
        toast({ icon: 'download', title: 'Загружено', text: name, file: path.join(dir, name) });
      }
    }
    // показываем только то, что действительно качается (размер менялся за последние 15 с);
    // брошенные недокачанные файлы и чужие временные файлы не трогаем
    const list = [...track].filter(([, v]) => v.active && now - v.changedAt < 15000)
      .map(([f, v]) => ({ name: f.replace(partial, ''), size: v.size, speed: v.speed }));
    send('downloads', list);
  }, 1000);
}

// ---------- горячая клавиша ----------
let currentHotkey = null;
function onHotkey() {
  if (!alive()) return;
  win.setIgnoreMouseEvents(false);
  win.focus();
  send('launcher');
}
function tryRegister(acc) { try { return globalShortcut.register(acc, onHotkey); } catch { return false; } }
// регистрируем только если сочетание поменялось — раньше это происходило при каждом сохранении настроек
function registerHotkey() {
  const want = store.settings.hotkey || 'Alt+Space';
  if (want === currentHotkey && globalShortcut.isRegistered(want)) return true;
  if (currentHotkey) globalShortcut.unregister(currentHotkey);
  currentHotkey = null;
  if (tryRegister(want)) { currentHotkey = want; return true; }
  setTimeout(() => toast({ icon: 'info', title: `Не удалось занять ${want}`, text: 'Сочетание занято другой программой — запиши другое в настройках острова', force: true }), 3000);
  return false;
}
ipcMain.handle('hotkey:set', (_e, acc) => {
  const prev = currentHotkey;
  if (prev) globalShortcut.unregister(prev);
  if (typeof acc === 'string' && tryRegister(acc)) {
    currentHotkey = acc; store.settings.hotkey = acc; saveStore();
    return { ok: true, hotkey: acc };
  }
  currentHotkey = prev && tryRegister(prev) ? prev : null; // новое занято — возвращаем старое
  return { ok: false, hotkey: currentHotkey };
});
// пока пользователь записывает новое сочетание, старое не должно открывать поиск
ipcMain.on('hotkey:pause', (_e, paused) => {
  if (!currentHotkey) return;
  if (paused) globalShortcut.unregister(currentHotkey);
  else if (!globalShortcut.isRegistered(currentHotkey)) tryRegister(currentHotkey);
});

// ---------- поиск программ и файлов ----------
let appIndex = [];
function walk(dir, exts, depth, out) {
  if (depth < 0) return;
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!e.name.startsWith('.') && e.name !== 'node_modules') walk(p, exts, depth - 1, out); }
    else if (!exts || exts.test(e.name)) out.push(p);
    if (out.length > 5000) return;
  }
}
function buildAppIndex() {
  const out = [];
  if (IS_WIN) {
    const dirs = [
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'),
      path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs'),
      app.getPath('desktop'),
    ];
    for (const d of dirs) walk(d, /\.(lnk|url|exe)$/i, 4, out);
  }
  const seen = new Set();
  appIndex = out.filter((p) => !/uninstall|удален|readme|help/i.test(p)).map((p) => ({
    name: path.basename(p).replace(/\.(lnk|url|exe)$/i, ''), path: p,
  })).filter((a) => !seen.has(a.name.toLowerCase()) && seen.add(a.name.toLowerCase()));
}
let fileIndex = [], fileIndexTime = 0;
function buildFileIndex() {
  const out = [];
  for (const d of ['desktop', 'documents', 'downloads', 'pictures', 'music', 'videos']) {
    try { walk(app.getPath(d), null, 3, out); } catch {}
  }
  fileIndex = out.map((p) => ({ name: path.basename(p), path: p }));
  fileIndexTime = Date.now();
}
const iconCache = new Map();
const expandEnv = (s = '') => s.replace(/%([^%]+)%/g, (m, k) => process.env[k] ?? m);
// у ярлыков (.lnk/.url) Windows отдаёт общий значок «листок со стрелкой» — берём значок того, на что ярлык указывает
function iconSource(p) {
  try {
    if (IS_WIN && /\.lnk$/i.test(p)) {
      const l = shell.readShortcutLink(p);
      const icon = expandEnv(l.icon), target = expandEnv(l.target);
      if (icon && fs.existsSync(icon)) return icon;
      if (target && fs.existsSync(target)) return target;
    }
    if (/\.url$/i.test(p)) {
      const m = /^IconFile=(.+)$/im.exec(fs.readFileSync(p, 'utf8'));
      const icon = m && expandEnv(m[1].trim());
      if (icon && fs.existsSync(icon)) return icon;
    }
  } catch {}
  return p;
}
async function iconFor(p) {
  if (iconCache.has(p)) return iconCache.get(p);
  let url = null;
  const src = iconSource(p);
  try {
    if (/\.ico$/i.test(src)) {
      const img = nativeImage.createFromPath(src);
      if (!img.isEmpty()) url = img.resize({ width: 32, height: 32 }).toDataURL();
    }
    if (!url) url = (await app.getFileIcon(src, { size: 'large' })).toDataURL();
  } catch {}
  if (!url && src !== p) { try { url = (await app.getFileIcon(p, { size: 'large' })).toDataURL(); } catch {} }
  iconCache.set(p, url);
  return url;
}
ipcMain.handle('search', async (_e, q) => {
  q = q.trim().toLowerCase();
  if (!q) return [];
  if (Date.now() - fileIndexTime > 5 * 60e3) buildFileIndex();
  const score = (name) => {
    const n = name.toLowerCase();
    if (n.startsWith(q)) return 3;
    if (n.split(/[\s._-]+/).some((w) => w.startsWith(q))) return 2;
    if (n.includes(q)) return 1;
    return 0;
  };
  const apps = appIndex.map((a) => ({ ...a, s: score(a.name), kind: 'app' })).filter((a) => a.s).sort((a, b) => b.s - a.s).slice(0, 5);
  const files = fileIndex.map((a) => ({ ...a, s: score(a.name), kind: 'file' })).filter((a) => a.s).sort((a, b) => b.s - a.s).slice(0, 5);
  const res = [...apps, ...files];
  await Promise.all(res.map(async (r) => { r.icon = await iconFor(r.path); }));
  return res;
});
ipcMain.on('open', (_e, p) => {
  if (/^https?:\/\//.test(p)) shell.openExternal(p);
  else shell.openPath(p);
});
ipcMain.on('reveal', (_e, p) => shell.showItemInFolder(p));
ipcMain.on('run', (_e, cmd) => {
  if (IS_WIN) spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', cmd], { detached: true, windowsHide: true });
  else toast({ icon: 'info', title: 'Только в Windows', text: cmd });
});
ipcMain.handle('pick-file', async (_e, kind) => {
  const filters = kind === 'conf'
    ? [{ name: 'Конфиг AmneziaWG / WireGuard', extensions: ['conf', 'vpn'] }]
    : [{ name: 'Программы', extensions: ['exe', 'lnk', 'url', 'bat'] }, { name: 'Все файлы', extensions: ['*'] }];
  const r = await dialog.showOpenDialog(win, { filters, properties: ['openFile'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('pick-app', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Выбери программу или ярлык', defaultPath: IS_WIN ? path.join(process.env.ProgramData || '', 'Microsoft\\Windows\\Start Menu\\Programs') : undefined,
    filters: [{ name: 'Программы', extensions: ['exe', 'lnk', 'url', 'bat'] }, { name: 'Все файлы', extensions: ['*'] }],
    properties: ['openFile'],
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('icon', (_e, p) => iconFor(p));

// перетаскивание файла с полки обратно в проводник
ipcMain.on('drag-out', async (e, p) => {
  let icon = nativeImage.createEmpty();
  try { icon = await app.getFileIcon(p); } catch {}
  e.sender.startDrag({ file: p, icon });
});

// ---------- сеть (без CORS) ----------
ipcMain.handle('http', async (_e, { url, method = 'GET', headers = {}, body }) => {
  const res = await net.fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, json: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, text }; }
});

// ---------- скриншоты, пипетка, QR ----------
let capWin;
async function grabScreen() {
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  win.hide();
  await new Promise((r) => setTimeout(r, 180));
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  win.showInactive();
  const src = sources.find((s) => s.display_id === String(d.id)) || sources[0];
  return { display: d, image: src.thumbnail };
}
function savePng(img) {
  const dir = path.join(app.getPath('pictures'), 'Island');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `Скриншот ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.png`);
  fs.writeFileSync(file, img.toPNG());
  return file;
}
function screenshotToast(img, file) {
  const s = img.getSize();
  toast({ icon: 'shot', title: 'Скриншот готов', text: `В буфере и в папке · ${s.width}×${s.height}`, file, thumb: img.resize({ width: 160 }).toDataURL(), force: true });
}
ipcMain.on('capture', async (_e, mode) => {
  // mode: full | region | color | qr
  const { display, image } = await grabScreen();
  if (mode === 'full') {
    suppressCopyToast = true;
    clipboard.writeImage(image);
    return screenshotToast(image, savePng(image));
  }
  capWin = new BrowserWindow({
    x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height,
    frame: false, transparent: false, fullscreen: true, alwaysOnTop: true, skipTaskbar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  capWin.setAlwaysOnTop(true, 'screen-saver');
  capWin.loadFile(path.join(__dirname, 'renderer', 'capture.html'), { query: { mode } });
  capWin.webContents.once('did-finish-load', () => {
    capWin.webContents.send('cap:image', image.toDataURL());
    capWin.show(); capWin.focus();
  });
});
ipcMain.on('cap:done', (_e, res) => {
  if (capWin) { capWin.close(); capWin = null; }
  if (!res) return;
  if (res.type === 'region') {
    const img = nativeImage.createFromDataURL(res.data);
    suppressCopyToast = true;
    clipboard.writeImage(img);
    screenshotToast(img, savePng(img));
  } else if (res.type === 'color') {
    suppressCopyToast = true; lastClip = res.hex;
    clipboard.writeText(res.hex);
    toast({ icon: 'color', title: `Цвет ${res.hex}`, text: `${res.rgb} · уже в буфере`, color: res.hex, force: true });
  } else if (res.type === 'qr') {
    if (res.text) {
      suppressCopyToast = true; lastClip = res.text;
      clipboard.writeText(res.text);
      toast({ icon: 'qr', title: 'QR-код прочитан · в буфере', text: res.text, link: /^https?:\/\//.test(res.text) ? res.text : null, force: true });
    } else toast({ icon: 'qr', title: 'QR-код не найден', text: 'Попробуй выделить его точнее', force: true });
  }
});

// ---------- система ----------
const sysCmds = {
  lock: 'rundll32.exe user32.dll,LockWorkStation',
  sleep: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
  restart: 'shutdown /r /t 0',
  shutdown: 'shutdown /s /t 0',
};
ipcMain.on('system', (_e, what) => {
  if (!IS_WIN) return toast({ icon: 'info', title: 'Только в Windows', text: what });
  if (sysCmds[what]) exec(sysCmds[what]);
});
const themeKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
ipcMain.handle('theme:get', () => new Promise((res) => {
  if (!IS_WIN) return res('dark');
  exec(`reg query ${themeKey} /v AppsUseLightTheme`, (err, out) => res(/0x0/.test(out || '') ? 'dark' : 'light'));
}));
ipcMain.handle('theme:set', (_e, mode) => new Promise((res) => {
  if (!IS_WIN) return res(true);
  const v = mode === 'dark' ? 0 : 1;
  exec(`reg add ${themeKey} /v AppsUseLightTheme /t REG_DWORD /d ${v} /f && reg add ${themeKey} /v SystemUsesLightTheme /t REG_DWORD /d ${v} /f`, () => res(true));
}));

// ---------- напоминания ----------
ipcMain.on('remind', (_e, r) => {
  store.reminders.push({ id: Date.now(), ...r });
  saveStore();
  send('reminders', store.reminders);
});
function remindersLoop() {
  setInterval(() => {
    const now = Date.now();
    const due = store.reminders.filter((r) => r.at <= now);
    if (!due.length) return;
    store.reminders = store.reminders.filter((r) => r.at > now);
    saveStore();
    send('reminders', store.reminders);
    for (const r of due) {
      toast({ icon: 'bell', title: 'Напоминание', text: r.text, force: true, sticky: true });
      if (Notification.isSupported()) new Notification({ title: 'Island · напоминание', body: r.text }).show();
    }
  }, 5000);
}
ipcMain.on('notify', (_e, n) => {
  toast({ ...n, force: true });
  if (n.system && Notification.isSupported()) new Notification({ title: n.title, body: n.text || '' }).show();
});

// ---------- положение острова: верх/низ экрана, любая точка по горизонтали ----------
// settings.pos = { edge: 'top'|'bottom', cx: доля ширины рабочей области (null — по центру), display: id }
function placeOn() {
  const pos = store.settings.pos || {};
  const d = screen.getAllDisplays().find((x) => x.id === pos.display) || screen.getPrimaryDisplay();
  return { pos, wa: d.workArea };
}
function place() {
  if (!alive()) return;
  const { pos, wa } = placeOn();
  const cx = wa.x + (pos.cx == null ? 0.5 : pos.cx) * wa.width; // центр острова на экране
  const x = Math.round(Math.min(Math.max(cx - WIN_W / 2, wa.x), wa.x + wa.width - WIN_W));
  const edge = pos.edge === 'bottom' ? 'bottom' : 'top';
  const y = edge === 'top' ? wa.y : wa.y + wa.height - WIN_H;
  win.setBounds({ x, y, width: WIN_W, height: WIN_H });
  send('place', { edge, offset: Math.round(cx - x) });
}
let dragTimer = null;
ipcMain.on('drag-start', (_e, grabDx) => {
  clearInterval(dragTimer);
  dragTimer = setInterval(() => {
    if (!alive()) return clearInterval(dragTimer);
    const p = screen.getCursorScreenPoint();
    const d = screen.getDisplayNearestPoint(p);
    const wa = d.workArea;
    let cx = (p.x - grabDx - wa.x) / wa.width;
    cx = Math.min(Math.max(cx, 0), 1);
    if (Math.abs(cx - 0.5) * wa.width < 40) cx = null; // магнит к центру
    store.settings.pos = { edge: p.y > wa.y + wa.height / 2 ? 'bottom' : 'top', cx, display: d.id };
    place();
  }, 16);
});
ipcMain.on('drag-end', () => { clearInterval(dragTimer); dragTimer = null; saveStore(); });
ipcMain.on('place-set', (_e, what) => {
  const pos = { ...(store.settings.pos || {}) };
  if (what === 'center') pos.cx = null; else pos.edge = what === 'bottom' ? 'bottom' : 'top';
  store.settings.pos = pos; saveStore(); place();
});

// ---------- курсор для маскота ----------
let cursorTimer;
function cursorLoop() {
  clearInterval(cursorTimer);
  if (!store.settings.mascot) return;
  cursorTimer = setInterval(() => {
    if (!alive()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    send('cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 50);
}

// ---------- трей ----------
let tray;
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'renderer', 'icon.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16 }));
  tray.setToolTip('Island');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть остров', click: () => send('expand') },
    { label: 'Поиск (' + (store.settings.hotkey || 'Alt+Space') + ')', click: () => { if (!alive()) return; win.setIgnoreMouseEvents(false); win.focus(); send('launcher'); } },
    { label: 'Не беспокоить', type: 'checkbox', checked: store.settings.dnd, click: (m) => { store.settings.dnd = m.checked; saveStore(); send('store', store); } },
    { type: 'separator' },
    { label: 'Перезапустить', click: () => { app.relaunch(); app.exit(0); } },
    { label: 'Выход', click: () => app.quit() },
  ]));
}

app.whenReady().then(() => {
  loadStore();
  createWindow();
  createTray();
  startMediaBridge();
  clipboardLoop();
  downloadsLoop();
  remindersLoop();
  applySettings();
  setTimeout(() => { buildAppIndex(); buildFileIndex(); }, 1500);
  require('./features')({ send, toast, store: () => store, saveStore, getWin: () => win, appIndex: () => appIndex });
  require('./yandex')({ store: () => store, saveStore });
  require('./claude')();
  screen.on('display-metrics-changed', place);
  screen.on('display-removed', place);
});
app.on('second-instance', () => send('expand'));
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (ps) ps.kill(); });
app.on('window-all-closed', (e) => e.preventDefault());
