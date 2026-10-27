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
    vpnApp: '', vpnConf: '', recAudio: true,
    city: 'Москва', lat: 55.7558, lon: 37.6173,
    hotkey: 'Alt+Space', mascot: true, dnd: false, autostart: false,
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
    x: Math.round(workArea.x + (workArea.width - WIN_W) / 2), y: workArea.y,
    frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  win.on('blur', () => send('blur'));
}
const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };

function toast(n) {
  // n: {icon, title, text}
  if (store.settings.dnd && !n.force) return;
  send('toast', n);
}

ipcMain.on('mouse', (_e, over) => {
  if (!win) return;
  win.setIgnoreMouseEvents(!over, { forward: true });
});
ipcMain.on('focus', () => { win.focus(); });
ipcMain.on('blur', () => { win.blur(); });

ipcMain.handle('store:get', () => store);
ipcMain.handle('store:set', (_e, key, value) => {
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
  const partial = /\.(crdownload|part|partial|download|opdownload|tmp)$/i;
  const track = new Map(); // name -> {size, t}
  setInterval(() => {
    let files;
    try { files = fs.readdirSync(dir); } catch { return; }
    const now = Date.now();
    const seen = new Set();
    for (const f of files) {
      if (!partial.test(f)) continue;
      let st; try { st = fs.statSync(path.join(dir, f)); } catch { continue; }
      seen.add(f);
      const prev = track.get(f);
      const speed = prev ? (st.size - prev.size) / ((now - prev.t) / 1000) : 0;
      track.set(f, { size: st.size, t: now, speed });
    }
    for (const [f] of track) {
      if (!seen.has(f)) {
        track.delete(f);
        const name = f.replace(partial, '').replace(/^Unconfirmed \d+$/, 'Файл');
        toast({ icon: 'download', title: 'Загружено', text: name, file: path.join(dir, name) });
      }
    }
    const list = [...track].map(([f, v]) => ({ name: f.replace(partial, ''), size: v.size, speed: v.speed }));
    send('downloads', list);
  }, 1000);
}

// ---------- горячая клавиша ----------
let currentHotkey;
function registerHotkey() {
  if (currentHotkey) globalShortcut.unregister(currentHotkey);
  currentHotkey = store.settings.hotkey || 'Alt+Space';
  let ok = false;
  try {
    ok = globalShortcut.register(currentHotkey, () => {
      win.setIgnoreMouseEvents(false);
      win.focus();
      send('launcher');
    });
  } catch {}
  if (!ok) setTimeout(() => toast({ icon: 'info', title: `Не удалось занять ${currentHotkey}`, text: 'Её использует другая программа — смени клавишу в настройках острова', force: true }), 3000);
}

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
async function iconFor(p) {
  if (iconCache.has(p)) return iconCache.get(p);
  let url = null;
  try { url = (await app.getFileIcon(p, { size: 'normal' })).toDataURL(); } catch {}
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

// ---------- курсор для маскота ----------
let cursorTimer;
function cursorLoop() {
  clearInterval(cursorTimer);
  if (!store.settings.mascot) return;
  cursorTimer = setInterval(() => {
    if (!win) return;
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
    { label: 'Поиск (' + (store.settings.hotkey || 'Alt+Space') + ')', click: () => { win.setIgnoreMouseEvents(false); win.focus(); send('launcher'); } },
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
  screen.on('display-metrics-changed', () => {
    const { workArea } = screen.getPrimaryDisplay();
    win.setBounds({ x: Math.round(workArea.x + (workArea.width - WIN_W) / 2), y: workArea.y, width: WIN_W, height: WIN_H });
  });
});
app.on('second-instance', () => send('expand'));
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (ps) ps.kill(); });
app.on('window-all-closed', (e) => e.preventDefault());
