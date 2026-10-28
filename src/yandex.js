// Слова песен из Яндекс Музыки (по токену пользователя): вход, поиск трека, синхронный текст.
const { ipcMain, BrowserWindow, net } = require('electron');
const crypto = require('crypto');

const API = 'https://api.music.yandex.net';
const CLIENT_ID = '23cabbbdc6cd418abb4b39c32c41195d'; // клиент Яндекс Музыки
const SIGN_KEY = 'p93jhgh689SBReK6ghtw62'; // ключ подписи запроса текста

const norm = (s = '') => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

module.exports = function setup({ store, saveStore }) {
  const token = () => store().settings.yandexToken || '';
  const headers = () => ({
    Authorization: `OAuth ${token()}`,
    'X-Yandex-Music-Client': 'YandexMusicAndroid/24023621',
    'Accept-Language': 'ru',
  });
  async function api(path) {
    const r = await net.fetch(API + path, { headers: headers() });
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error('auth'), { code: 'auth' });
    if (r.status === 451) throw Object.assign(new Error('Яндекс Музыка недоступна из этой страны'), { code: 'geo' });
    if (!r.ok) throw new Error(`Яндекс ответил ${r.status}`);
    return r.json();
  }

  ipcMain.handle('yandex:login', () => new Promise((resolve) => {
    const w = new BrowserWindow({
      width: 480, height: 720, title: 'Вход в Яндекс', autoHideMenuBar: true,
      webPreferences: { partition: 'persist:yandex', contextIsolation: true },
    });
    let finished = false;
    const done = (tok) => {
      if (finished) return;
      finished = true;
      if (tok) { store().settings.yandexToken = tok; saveStore(); }
      resolve(!!tok);
      if (!w.isDestroyed()) w.close();
    };
    const check = (_e, url) => {
      const m = /[#&?]access_token=([^&]+)/.exec(url || '');
      if (m) done(decodeURIComponent(m[1]));
    };
    for (const ev of ['will-redirect', 'will-navigate', 'did-navigate', 'did-navigate-in-page', 'did-redirect-navigation']) w.webContents.on(ev, check);
    w.on('closed', () => done(null));
    w.loadURL(`https://oauth.yandex.ru/authorize?response_type=token&client_id=${CLIENT_ID}`);
  }));

  // ---- обложка трека из интернета (когда плеер не отдал её в Windows) ----
  async function imageData(url) {
    const r = await net.fetch(url);
    if (!r.ok) return null;
    const type = r.headers.get('content-type') || 'image/jpeg';
    if (!type.startsWith('image/')) return null;
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
  }
  const similar = (a, b) => { a = norm(a); b = norm(b); return !!a && !!b && (a === b || a.includes(b) || b.includes(a)); };
  ipcMain.handle('cover:find', async (_e, { title, artist }) => {
    const q = encodeURIComponent(`${artist || ''} ${title || ''}`.trim());
    const tries = [];
    if (token()) {
      tries.push(async () => {
        const s = await api(`/search?text=${q}&type=track&page=0`);
        const t = (s.result?.tracks?.results || []).find((x) => similar(x.title, title) && (!artist || (x.artists || []).some((a) => similar(a.name, artist))));
        const uri = t?.coverUri || t?.albums?.[0]?.coverUri;
        return uri ? `https://${uri.replace('%%', '400x400')}` : null;
      });
    }
    tries.push(async () => {
      const r = await (await net.fetch(`https://api.deezer.com/search?q=${q}&limit=5`)).json();
      const t = (r.data || []).find((x) => similar(x.title, title) && (!artist || similar(x.artist?.name, artist)));
      return t?.album?.cover_xl || t?.album?.cover_big || null;
    });
    tries.push(async () => {
      const r = await (await net.fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=5`)).json();
      const t = (r.results || []).find((x) => similar(x.trackName, title) && (!artist || similar(x.artistName, artist)));
      return t?.artworkUrl100 ? t.artworkUrl100.replace('100x100bb', '600x600bb') : null;
    });
    for (const f of tries) {
      try { const url = await f(); if (url) { const data = await imageData(url); if (data) return data; } } catch {}
    }
    return null;
  });

  ipcMain.handle('yandex:logout', () => { store().settings.yandexToken = ''; saveStore(); return true; });

  ipcMain.handle('lyrics:yandex', async (_e, { title, artist, duration }) => {
    if (!token()) return null;
    try {
      const q = encodeURIComponent(`${artist || ''} ${title || ''}`.trim());
      const s = await api(`/search?text=${q}&type=track&page=0&nocorrect=false`);
      const list = s.result?.tracks?.results || [];
      const nt = norm(title), na = norm(artist);
      let best = null, bestScore = 0;
      for (const t of list.slice(0, 10)) {
        const tt = norm(t.title);
        let sc = tt === nt ? 4 : (tt.includes(nt) || nt.includes(tt)) && tt ? 2 : 0;
        if (!sc) continue; // название должно совпадать хоть как-то
        if (na && (t.artists || []).some((a) => { const n = norm(a.name); return n && (na.includes(n) || n.includes(na)); })) sc += 3;
        if (duration && t.durationMs && Math.abs(t.durationMs / 1000 - duration) < 6) sc += 2;
        if (sc > bestScore) { best = t; bestScore = sc; }
      }
      if (!best || bestScore < 4) return { found: false };
      for (const format of ['LRC', 'TEXT']) {
        const ts = Math.floor(Date.now() / 1000);
        const sign = crypto.createHmac('sha256', SIGN_KEY).update(`${best.id}${ts}`).digest('base64');
        let r;
        try { r = await api(`/tracks/${best.id}/lyrics?format=${format}&timeStamp=${ts}&sign=${encodeURIComponent(sign)}`); } catch (e) { if (e.code) throw e; continue; }
        const url = r.result?.downloadUrl;
        if (!url) continue;
        const text = await (await net.fetch(url)).text();
        if (text.trim()) return { found: true, format, text, provider: r.result?.major?.prettyName || '' };
      }
      return { found: false };
    } catch (e) {
      return { found: false, error: e.code === 'auth' ? 'Токен Яндекса устарел — войди заново в настройках' : e.message };
    }
  });
};
