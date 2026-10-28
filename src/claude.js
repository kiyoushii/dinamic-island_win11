// Чат острова через Claude: ответ прямо на острове (Claude Code `claude -p`, по подписке)
// или новый чат в Claude Desktop / браузере с уже вписанным вопросом.
const { ipcMain, app, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');

const IS_WIN = process.platform === 'win32';
// отдельная папка: события хуков из неё остров не показывает как «агент работает»
const chatDir = () => path.join(app.getPath('userData'), 'claude-chat');

const SYSTEM = 'Ты — ассистент внутри Island, динамического острова для Windows. Отвечай кратко и по делу, на языке пользователя. Если просят итог — дай его по пунктам. Инструментов у тебя нет: отвечай текстом.';

function where(cmd) {
  return new Promise((res) => execFile(IS_WIN ? 'where' : 'which', [cmd], { windowsHide: true }, (err, out) => {
    res(err ? [] : String(out).split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  }));
}

// Как запустить claude без оболочки (вопрос пользователя не должен попадать в командную строку):
// claude.exe — напрямую; npm-версия (claude.cmd) — через node + cli.js.
let cached;
async function findClaude() {
  if (cached !== undefined) return cached;
  const home = os.homedir();
  const exe = [path.join(home, '.local', 'bin', IS_WIN ? 'claude.exe' : 'claude')].find((p) => fs.existsSync(p));
  if (exe) return (cached = { cmd: exe, pre: [] });
  const found = await where('claude');
  const direct = found.find((p) => (IS_WIN ? /\.exe$/i.test(p) : true));
  if (direct) return (cached = { cmd: direct, pre: [] });
  const shim = found.find((p) => /\.cmd$/i.test(p));
  if (shim) {
    const cli = path.join(path.dirname(shim), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    const node = (await where('node'))[0];
    if (fs.existsSync(cli) && node) return (cached = { cmd: node, pre: [cli] });
  }
  return (cached = null);
}

module.exports = function setup() {
  let running = null;

  ipcMain.handle('claude:status', async () => {
    cached = undefined; // пользователь мог только что установить Claude Code
    const c = await findClaude();
    let desktop = false;
    try { desktop = !!app.getApplicationNameForProtocol('claude://'); } catch {}
    return { cli: !!c, desktop };
  });

  ipcMain.handle('claude:ask', async (_e, { prompt, resume }) => {
    const c = await findClaude();
    if (!c) return { ok: false, error: 'Не нашёл Claude Code (команду claude). Поставь его или открой вопрос в Claude.' };
    fs.mkdirSync(chatDir(), { recursive: true });
    const args = [...c.pre, '-p', 'Ответь на сообщение пользователя ниже.', '--output-format', 'json', '--tools', '', '--append-system-prompt', SYSTEM];
    if (resume && /^[\w-]{8,80}$/.test(resume)) args.push('--resume', resume);
    return new Promise((resolve) => {
      const p = spawn(c.cmd, args, { cwd: chatDir(), windowsHide: true, env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'island' } });
      running = p;
      let out = '', err = '';
      const timer = setTimeout(() => { err += '\nClaude не ответил за 3 минуты'; p.kill(); }, 180000);
      p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');
      p.stdout.on('data', (d) => { out += d; });
      p.stderr.on('data', (d) => { err += d; });
      p.on('error', (e) => { clearTimeout(timer); running = null; resolve({ ok: false, error: e.message }); });
      p.on('close', (code) => {
        clearTimeout(timer); running = null;
        const line = out.trim().split(/\r?\n/).reverse().find((l) => l.startsWith('{'));
        let j = null; try { j = JSON.parse(line); } catch {}
        if (j && !j.is_error && j.result) return resolve({ ok: true, text: j.result, session: j.session_id });
        const why = (j?.result || err || `код выхода ${code}`).replace(/\s+/g, ' ').trim().slice(0, 400);
        resolve({ ok: false, error: why, session: j?.session_id });
      });
      p.stdin.end(prompt);
    });
  });

  ipcMain.on('claude:cancel', () => { if (running) running.kill(); });

  // Новый чат в Claude с вопросом. ?q= официально не задокументирован, поэтому вопрос ещё и в буфере.
  ipcMain.handle('claude:open', async (_e, { q, target }) => {
    clipboard.writeText(q || '');
    let desktop = false;
    try { desktop = !!app.getApplicationNameForProtocol('claude://'); } catch {}
    const useDesktop = target !== 'browser' && desktop;
    const url = `${useDesktop ? 'claude://claude.ai' : 'https://claude.ai'}/new?q=${encodeURIComponent(q || '')}`;
    await shell.openExternal(url);
    return { desktop: useDesktop };
  });
};
module.exports.chatDir = chatDir;
