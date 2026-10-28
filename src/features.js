// Агенты в терминале, VPN, запись экрана и Bluetooth.
const { ipcMain, shell, screen, desktopCapturer, session, app, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn, exec, execFile } = require('child_process');

const IS_WIN = process.platform === 'win32';
const AGENT_PORT = 47821;
const HOOK_URL = `http://127.0.0.1:${AGENT_PORT}/agent/claude`;
const HOOK_CMD = `curl -s -m 2 -X POST -H "Content-Type: application/json" --data-binary @- ${HOOK_URL} || exit 0`;

function ps(script, args = [], timeoutMs = 30000) {
  return new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...(script.endsWith('.ps1') ? ['-File', script, ...args] : ['-Command', script])], { windowsHide: true });
    let out = '', err = '';
    const timer = setTimeout(() => { err += `\nPowerShell не ответил за ${timeoutMs / 1000} с`; p.kill(); }, timeoutMs);
    p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', () => { clearTimeout(timer); resolve(Object.assign(new String(out.trim()), { err: err.trim() })); });
    p.on('error', (e) => { clearTimeout(timer); resolve(Object.assign(new String(''), { err: e.message })); });
  });
}
const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const winScript = (name) => path.join(__dirname, 'win', name).replace('app.asar', 'app.asar.unpacked');

module.exports = function setup({ send, toast, store, saveStore, getWin, appIndex }) {
  // ================= агенты =================
  const agents = new Map();
  const pushAgents = () => send('agents', [...agents.values()]);

  function lastAssistant(file) {
    try {
      if (typeof file !== 'string' || !file.endsWith('.jsonl')) return '';
      const full = path.resolve(file);
      if (!full.startsWith(path.join(os.homedir(), '.claude'))) return '';
      const size = fs.statSync(full).size;
      const len = Math.min(size, 256 * 1024);
      const fd = fs.openSync(full, 'r');
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      fs.closeSync(fd);
      const lines = buf.toString('utf8').split('\n').reverse();
      for (const l of lines) {
        let o; try { o = JSON.parse(l); } catch { continue; }
        if (o.type !== 'assistant' || !Array.isArray(o.message?.content)) continue;
        const text = o.message.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ').trim();
        if (text) return text.replace(/\s+/g, ' ').replace(/[*`#]/g, '');
      }
    } catch {}
    return '';
  }

  function handleAgent(kind, d) {
    const ev = d.hook_event_name;
    const event = { UserPromptSubmit: 'start', PostToolUse: 'start', Notification: 'ask', Stop: 'done', SessionEnd: 'end' }[ev] || d.event;
    if (!event) return;
    const id = String(d.session_id || d.id || kind);
    const name = kind === 'claude' ? 'Claude Code' : String(d.name || kind).slice(0, 40);
    const project = d.cwd ? path.basename(d.cwd) : (d.project || '');
    const cur = agents.get(id);
    if (event === 'start') {
      if (ev === 'PostToolUse' && cur?.state !== 'ask') return;
      agents.set(id, { id, name, project, state: 'working', text: d.prompt ? String(d.prompt).slice(0, 140) : cur?.text || '', t: Date.now() });
    } else if (event === 'ask') {
      const msg = String(d.message || d.text || 'Нужно твоё решение');
      if (/waiting for your input/i.test(msg) && (!cur || cur.state !== 'working')) return; // просто простаивает
      agents.set(id, { id, name, project, state: 'ask', text: msg, t: Date.now() });
      toast({ icon: 'agent', title: `${name} ждёт ответа`, text: msg, app: project, force: true, sticky: true });
      if (!(getWin() && !getWin().isDestroyed() && getWin().isFocused()) && Notification.isSupported()) new Notification({ title: `${name} ждёт ответа`, body: msg }).show();
    } else if (event === 'done') {
      const summary = String(d.text || d.last_assistant_message || lastAssistant(d.transcript_path) || 'Задача выполнена').slice(0, 200);
      agents.delete(id);
      toast({ icon: 'check', title: `${name} закончил`, text: summary, app: project, force: true, duration: 7000 });
    } else if (event === 'end') {
      agents.delete(id);
    }
    pushAgents();
  }

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || !req.url.startsWith('/agent')) { res.writeHead(404); return res.end(); }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      res.writeHead(200); res.end('ok');
      try { handleAgent(req.url.split('/')[2] || 'agent', body ? JSON.parse(body) : {}); } catch {}
    });
  });
  server.on('error', () => {});
  server.listen(AGENT_PORT, '127.0.0.1');
  setInterval(() => { // зависшие сессии убираем через 3 часа
    for (const [id, a] of agents) if (Date.now() - a.t > 3 * 36e5) agents.delete(id);
    pushAgents();
  }, 10 * 6e4);

  const claudeSettings = path.join(os.homedir(), '.claude', 'settings.json');
  const HOOK_EVENTS = ['UserPromptSubmit', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'];
  ipcMain.handle('agents:status', () => {
    try {
      const s = JSON.parse(fs.readFileSync(claudeSettings, 'utf8'));
      return { installed: HOOK_EVENTS.every((e) => JSON.stringify(s.hooks?.[e] || []).includes(HOOK_URL)), port: AGENT_PORT };
    } catch { return { installed: false, port: AGENT_PORT }; }
  });
  ipcMain.handle('agents:install', (_e, remove = false) => {
    let s = {};
    if (fs.existsSync(claudeSettings)) {
      const raw = fs.readFileSync(claudeSettings, 'utf8');
      try { s = raw.trim() ? JSON.parse(raw) : {}; } catch { return { ok: false, error: 'Не получилось прочитать ~/.claude/settings.json — проверь, что там корректный JSON' }; }
      fs.writeFileSync(claudeSettings + '.island-backup', raw);
    } else fs.mkdirSync(path.dirname(claudeSettings), { recursive: true });
    s.hooks ||= {};
    for (const e of HOOK_EVENTS) {
      const list = (s.hooks[e] || []).filter((g) => !JSON.stringify(g).includes(HOOK_URL));
      if (!remove) list.push({ hooks: [{ type: 'command', command: HOOK_CMD }] });
      if (list.length) s.hooks[e] = list; else delete s.hooks[e];
    }
    if (!Object.keys(s.hooks).length) delete s.hooks;
    fs.writeFileSync(claudeSettings, JSON.stringify(s, null, 2));
    return { ok: true };
  });

  // ================= VPN =================
  let vpnState = { on: false, via: '' };
  function findVpnApp() {
    if (store().settings.vpnApp) return store().settings.vpnApp;
    const a = appIndex().find((x) => /^(happ|amnezia ?vpn)/i.test(x.name));
    return a?.path || '';
  }
  async function vpnStatus() {
    if (!IS_WIN) return { on: false, via: '', app: '' };
    const out = await ps("Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object Name,InterfaceDescription | ConvertTo-Json -Compress");
    let adapters = [];
    try { adapters = [].concat(JSON.parse(out || '[]')); } catch {}
    const tun = adapters.find((a) => /wintun|wireguard|amnezia|tap-windows|\btun\b|happ|xray|sing-?box|outline|vpn/i.test(`${a.Name} ${a.InterfaceDescription}`));
    const proxy = await new Promise((res) => exec('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"', (err, o) => {
      o = o || '';
      res(/ProxyEnable\s+REG_DWORD\s+0x1/.test(o) && /ProxyServer\s+REG_SZ\s+.*(127\.0\.0\.1|localhost)/i.test(o));
    }));
    return { on: !!tun || proxy, via: tun ? tun.Name : proxy ? 'системный прокси' : '', app: findVpnApp() };
  }
  async function refreshVpn() {
    const st = await vpnStatus();
    if (st.on !== vpnState.on || st.via !== vpnState.via) { vpnState = st; send('vpn', st); }
    return st;
  }
  if (IS_WIN) setInterval(refreshVpn, 15000);
  ipcMain.handle('vpn:status', refreshVpn);
  ipcMain.handle('vpn:set', async (_e, on) => {
    if (!IS_WIN) return { ok: false, error: 'Только в Windows' };
    const s = store().settings;
    if (s.vpnConf) {
      // туннель AmneziaWG / WireGuard как служба (нужны права администратора — Windows спросит)
      const pf = process.env.ProgramFiles || 'C:\\Program Files';
      const exe = [path.join(pf, 'AmneziaWG', 'amneziawg.exe'), path.join(pf, 'WireGuard', 'wireguard.exe')].find((p) => fs.existsSync(p));
      if (!exe) return { ok: false, error: 'Не найден amneziawg.exe или wireguard.exe в Program Files' };
      const name = path.basename(s.vpnConf).replace(/\.(conf|vpn)$/i, '');
      const args = on ? ['/installtunnelservice', s.vpnConf] : ['/uninstalltunnelservice', name];
      await ps(`Start-Process -FilePath ${psQuote(exe)} -ArgumentList ${args.map((a) => psQuote(`"${a}"`)).join(',')} -Verb RunAs -WindowStyle Hidden -Wait`, [], 180000);
    } else {
      const appPath = findVpnApp();
      if (!appPath) return { ok: false, error: 'Не нашёл Happ или AmneziaVPN — укажи программу в настройках' };
      if (on) {
        await shell.openPath(appPath);
      } else {
        let target = appPath;
        if (/\.lnk$/i.test(appPath)) { try { target = shell.readShortcutLink(appPath).target || appPath; } catch {} }
        const exeName = path.basename(target);
        await new Promise((r) => execFile('taskkill', ['/IM', exeName, '/F', '/T'], { windowsHide: true }, () => r()));
        // если приложение работало как системный прокси — возвращаем интернет без прокси
        const st = await vpnStatus();
        if (st.via === 'системный прокси') {
          await new Promise((r) => exec('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f', () => r()));
        }
      }
    }
    await new Promise((r) => setTimeout(r, on ? 4000 : 1500));
    return { ok: true, ...(await refreshVpn()) };
  });

  // ================= запись экрана =================
  let rec = null;
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    const src = sources.find((s) => s.display_id === String(d.id)) || sources[0];
    cb(IS_WIN && store().settings.recAudio ? { video: src, audio: 'loopback' } : { video: src });
  });
  ipcMain.handle('rec:start', (_e, ext) => {
    const dir = path.join(app.getPath('videos'), 'Island');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `Запись ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${ext === 'mp4' ? 'mp4' : 'webm'}`);
    rec = { file, stream: fs.createWriteStream(file), t: Date.now() };
    { const w = getWin(); if (w && !w.isDestroyed()) w.setContentProtection(true); } // сам остров в запись не попадает
    return file;
  });
  ipcMain.on('rec:chunk', (_e, buf) => { if (rec) rec.stream.write(Buffer.from(buf)); });
  ipcMain.on('rec:stop', () => {
    if (!rec) return;
    const r = rec; rec = null;
    { const w = getWin(); if (w && !w.isDestroyed()) w.setContentProtection(false); }
    r.stream.end(() => {
      const sec = Math.round((Date.now() - r.t) / 1000);
      const mb = (fs.statSync(r.file).size / 1048576).toFixed(1).replace('.', ',');
      toast({ icon: 'record', title: 'Запись сохранена', text: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} · ${mb} МБ · Видео/Island`, file: r.file, force: true, duration: 6000 });
    });
  });

  // ================= Bluetooth =================
  ipcMain.handle('bt:list', async () => {
    if (!IS_WIN) {
      return { radio: 'On', devices: [{ name: 'Наушники Air', connected: true, battery: 80 }, { name: 'Колонка Mini', connected: false }, { name: 'Мышь', connected: true, battery: 64 }] };
    }
    const out = await ps(winScript('bt.ps1'));
    // берём только нашу строку: PowerShell может напечатать что-то ещё (предупреждения, прогресс)
    const line = String(out).split(/\r?\n/).reverse().find((l) => l.startsWith('ISLAND_JSON '));
    try {
      const r = JSON.parse(line.slice('ISLAND_JSON '.length));
      r.devices = [].concat(r.devices || []);
      r.errors = [].concat(r.errors || []);
      return r;
    } catch {
      const why = (out.err || String(out) || 'пустой ответ').replace(/\s+/g, ' ').slice(0, 300);
      return { radio: null, devices: [], errors: [`Скрипт Bluetooth не ответил: ${why}`] };
    }
  });
  ipcMain.handle('bt:radio', async (_e, on) => {
    if (!IS_WIN) return true;
    await ps(winScript('bt.ps1'), ['-Radio', on ? 'On' : 'Off']);
    return true;
  });
};
