// Чистые функции без DOM: превращения текста и разбор строки поиска.
(function (root) {
  // ---------- раскладка ----------
  const EN = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./~QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?@#$^&";
  const RU = 'ёйцукенгшщзхъфывапролджэячсмитьбю.ЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,"№;:?';
  function fixLayout(s) {
    const lat = (s.match(/[a-z]/gi) || []).length;
    const cyr = (s.match(/[а-яё]/gi) || []).length;
    const [from, to] = lat >= cyr ? [EN, RU] : [RU, EN];
    return [...s].map((ch) => { const i = from.indexOf(ch); return i >= 0 ? to[i] : ch; }).join('');
  }

  // ---------- транслит ----------
  const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  const TR_BACK = [['sch', 'щ'], ['yo', 'ё'], ['zh', 'ж'], ['ts', 'ц'], ['ch', 'ч'], ['sh', 'ш'], ['yu', 'ю'], ['ya', 'я'],
    ['a', 'а'], ['b', 'б'], ['v', 'в'], ['g', 'г'], ['d', 'д'], ['e', 'е'], ['z', 'з'], ['i', 'и'], ['y', 'й'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['f', 'ф'], ['h', 'х'], ['c', 'к'], ['w', 'в'], ['x', 'кс'], ['q', 'к'], ['j', 'дж']];
  const keepCase = (src, out) => (src === src.toUpperCase() && src !== src.toLowerCase()
    ? (src.length > 1 || out.length === 1 ? out.toUpperCase() : out[0].toUpperCase() + out.slice(1)) : out);
  function translit(s) {
    if (/[а-яё]/i.test(s)) {
      return [...s].map((ch) => { const lo = ch.toLowerCase(); return lo in TR ? keepCase(ch, TR[lo]) : ch; }).join('');
    }
    let out = '';
    for (let i = 0; i < s.length;) {
      const hit = TR_BACK.find(([l]) => s.substr(i, l.length).toLowerCase() === l);
      if (hit) { out += keepCase(s.substr(i, hit[0].length), hit[1]); i += hit[0].length; }
      else out += s[i++];
    }
    return out;
  }

  const b64enc = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  const b64dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0)));

  const textTools = [
    { id: 'layout', name: 'Раскладка', fn: fixLayout },
    { id: 'upper', name: 'ВЕРХНИЙ', fn: (s) => s.toUpperCase() },
    { id: 'lower', name: 'нижний', fn: (s) => s.toLowerCase() },
    { id: 'title', name: 'Каждое Слово', fn: (s) => s.toLowerCase().replace(/(^|[\s\-«"(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) },
    { id: 'sentence', name: 'Предложение', fn: (s) => s.toLowerCase().replace(/(^\s*|[.!?…]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) },
    { id: 'translit', name: 'Транслит', fn: translit },
    { id: 'nobreaks', name: 'Убрать переносы', fn: (s) => s.replace(/\s*\r?\n\s*/g, ' ').trim() },
    { id: 'spaces', name: 'Лишние пробелы', fn: (s) => s.replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').trim() },
    { id: 'jsonpretty', name: 'JSON красиво', fn: (s) => JSON.stringify(JSON.parse(s), null, 2) },
    { id: 'jsonstr', name: 'JSON в строку', fn: (s) => { try { return JSON.stringify(JSON.parse(s)); } catch { return JSON.stringify(s); } } },
    { id: 'b64enc', name: '→ Base64', fn: b64enc },
    { id: 'b64dec', name: 'Base64 →', fn: b64dec },
    { id: 'urlenc', name: '→ URL', fn: encodeURIComponent },
    { id: 'urldec', name: 'URL →', fn: decodeURIComponent },
    { id: 'clean', name: 'Чистый текст', fn: (s) => s.replace(/[\u200b-\u200f\u2028-\u202f\ufeff]/g, '').replace(/[“”«»„]/g, '"').replace(/[‘’]/g, "'").replace(/\u00a0/g, ' ') },
  ];
  function textStats(s) {
    const words = (s.match(/\S+/g) || []).length;
    return `${s.length} симв · ${s.replace(/\s/g, '').length} без пробелов · ${words} слов · ${s ? s.split('\n').length : 0} стр`;
  }

  // ---------- калькулятор (без eval) ----------
  function calc(expr) {
    const src = expr.replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
    if (!/^[\d.+\-*/^%()]+$/.test(src) || !/\d/.test(src) || !/[+\-*/^%(]/.test(src.replace(/^-/, ''))) return null;
    let i = 0;
    const peek = () => src[i];
    const num = () => {
      const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw 0;
      i += m[0].length; return parseFloat(m[0]);
    };
    const atom = () => {
      if (peek() === '-') { i++; return -atom(); }
      if (peek() === '+') { i++; return atom(); }
      if (peek() === '(') { i++; const v = add(); if (src[i++] !== ')') throw 0; return v; }
      let v = num();
      if (peek() === '%') { i++; v /= 100; }
      return v;
    };
    const pow = () => { const b = atom(); if (peek() === '^') { i++; return Math.pow(b, pow()); } return b; };
    const mul = () => {
      let v = pow();
      while (peek() === '*' || peek() === '/') { const op = src[i++]; const r = pow(); v = op === '*' ? v * r : v / r; }
      return v;
    };
    const add = () => {
      let v = mul();
      while (peek() === '+' || peek() === '-') { const op = src[i++]; const r = mul(); v = op === '+' ? v + r : v - r; }
      return v;
    };
    try {
      const v = add();
      if (i !== src.length || !isFinite(v)) return null;
      return +v.toPrecision(12);
    } catch { return null; }
  }

  // ---------- единицы ----------
  const UNITS = {
    // длина, метры
    mm: ['len', 0.001, 'мм', 'миллиметр'], cm: ['len', 0.01, 'см', 'сантиметр'], m: ['len', 1, 'м', 'метр'], km: ['len', 1000, 'км', 'километр'],
    in: ['len', 0.0254, 'дюйм', 'inch', 'inches', '"'], ft: ['len', 0.3048, 'фут', 'feet', 'foot'], yd: ['len', 0.9144, 'ярд', 'yard'], mi: ['len', 1609.344, 'миль', 'миля', 'мили', 'миль', 'милях', 'mile', 'miles'],
    // масса, кг
    g: ['mass', 0.001, 'г', 'гр', 'грамм'], kg: ['mass', 1, 'кг', 'килограмм'], t: ['mass', 1000, 'т', 'тонна', 'тонн'], lb: ['mass', 0.45359237, 'фунт', 'lbs', 'pound'], oz: ['mass', 0.0283495, 'унция', 'унций', 'ounce'],
    // объём, литры
    ml: ['vol', 0.001, 'мл'], l: ['vol', 1, 'л', 'литр', 'литров'], gal: ['vol', 3.78541, 'галлон', 'gallon'],
    // скорость, м/с
    'km/h': ['speed', 1 / 3.6, 'км/ч', 'kmh', 'kph'], mph: ['speed', 0.44704, 'миль/ч'], 'm/s': ['speed', 1, 'м/с'],
    // данные, байты
    kb: ['data', 1024, 'кб'], mb: ['data', 1024 ** 2, 'мб'], gb: ['data', 1024 ** 3, 'гб'], tb: ['data', 1024 ** 4, 'тб'],
    // температура
    c: ['temp', 0, '°c', 'с', '°с', 'цельсий', 'цельсия'], f: ['temp', 0, '°f', 'фаренгейт', 'фаренгейта'], k: ['temp', 0, 'кельвин', 'кельвина'],
  };
  const CUR = {
    USD: ['$', 'usd', 'доллар', 'доллара', 'долларов', 'долларах', 'доллары', 'dollar', 'dollars', 'бакс', 'баксов'],
    EUR: ['€', 'eur', 'евро', 'euro'],
    RUB: ['₽', 'rub', 'руб', 'рубль', 'рубля', 'рублей', 'рублях', 'рубли', 'р'],
    GBP: ['£', 'gbp', 'фунт стерлингов', 'фунтов стерлингов'],
    CNY: ['¥', 'cny', 'юань', 'юаня', 'юаней', 'юанях', 'yuan'],
    KZT: ['₸', 'kzt', 'тенге'], UAH: ['₴', 'uah', 'гривна', 'гривны', 'гривен', 'гривнах'], BYN: ['byn', 'бел. руб'],
    TRY: ['₺', 'try', 'лира', 'лиры', 'лир'], JPY: ['jpy', 'иена', 'иены', 'иен'], AED: ['aed', 'дирхам', 'дирхамов'],
  };
  function findUnit(word) {
    const w = word.toLowerCase().replace(/\.$/, '');
    for (const [k, v] of Object.entries(UNITS)) if (k === w || v.slice(2).some((a) => a === w)) return k;
    for (const [k, v] of Object.entries(UNITS)) if (v.slice(3).some((a) => a.length > 3 && w.startsWith(a.slice(0, -1)))) return k;
    return null;
  }
  function findCur(word) {
    const w = word.toLowerCase();
    for (const [k, v] of Object.entries(CUR)) if (k.toLowerCase() === w || v.includes(w)) return k;
    for (const [k, v] of Object.entries(CUR)) if (v.some((a) => a.length > 4 && w.startsWith(a.slice(0, -2)))) return k;
    return null;
  }
  function convertUnits(q) {
    const m = /^([\d.,\s]+?)\s*([^\d\s][^\s]*(?:\s[^\s]+)?)\s+(?:в|во|in|to|->|=)\s+(.+)$/i.exec(q.trim());
    if (!m) return null;
    const n = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
    if (isNaN(n)) return null;
    const from = m[2].trim(), to = m[3].trim();
    const cf = findCur(from), ct = findCur(to);
    if (cf && ct) return { type: 'currency', amount: n, from: cf, to: ct };
    const uf = findUnit(from), ut = findUnit(to);
    if (!uf || !ut || UNITS[uf][0] !== UNITS[ut][0]) return null;
    let v;
    if (UNITS[uf][0] === 'temp') {
      const toC = { c: (x) => x, f: (x) => (x - 32) * 5 / 9, k: (x) => x - 273.15 }[uf](n);
      v = { c: (x) => x, f: (x) => x * 9 / 5 + 32, k: (x) => x + 273.15 }[ut](toC);
    } else v = n * UNITS[uf][1] / UNITS[ut][1];
    return { type: 'unit', value: +v.toPrecision(6), text: `${fmtNum(n)} ${UNITS[uf][2]} = ${fmtNum(+v.toPrecision(6))} ${UNITS[ut][2]}` };
  }
  const fmtNum = (n) => n.toLocaleString('ru-RU', { maximumFractionDigits: 4 });

  // ---------- время в обычной фразе ----------
  const UNIT_MS = { с: 1e3, сек: 1e3, секунд: 1e3, секунды: 1e3, секунду: 1e3, s: 1e3, м: 6e4, мин: 6e4, минут: 6e4, минуты: 6e4, минуту: 6e4, min: 6e4, ч: 36e5, час: 36e5, часа: 36e5, часов: 36e5, h: 36e5 };
  function parseTimer(q) {
    const m = /^(?:таймер|timer|засеки)\s+(?:на\s+)?(\d+(?:[.,]\d+)?)\s*([a-zа-я]*)/i.exec(q.trim());
    if (!m) return null;
    const ms = parseFloat(m[1].replace(',', '.')) * (UNIT_MS[m[2].toLowerCase()] || 6e4);
    return { ms, label: `${m[1]} ${m[2] || 'мин'}` };
  }
  function parseReminder(q, now = new Date()) {
    const m = /^(?:напомни(?:ть)?|remind(?: me)?)\s+(?:мне\s+)?(.+)$/i.exec(q.trim());
    if (!m) return null;
    let text = m[1], at = null;
    const rel = /\s*через\s+(\d+)?\s*(секунд[уы]?|сек|минут[уы]?|мин|час(?:а|ов)?|ч)(?=[\s.,!?]|$)/iu.exec(text);
    if (rel) {
      at = new Date(now.getTime() + (parseInt(rel[1] || '1', 10)) * (UNIT_MS[rel[2].toLowerCase()] || 6e4));
      text = text.replace(rel[0], ' ');
    } else {
      let day = 0;
      if (/(?<![\p{L}])послезавтра(?![\p{L}])/iu.test(text)) { day = 2; text = text.replace(/\s*послезавтра/i, ' '); }
      else if (/(?<![\p{L}])завтра(?![\p{L}])/iu.test(text)) { day = 1; text = text.replace(/\s*(?<![\p{L}])завтра(?![\p{L}])/iu, ' '); }
      else text = text.replace(/\s*сегодня/i, ' ');
      const t = /\s*в\s+(\d{1,2})(?:[:.](\d{2}))?\s*(утра|вечера|дня|ночи)?(?:\s*час(?:а|ов)?)?/i.exec(text);
      if (t) {
        let h = +t[1]; const min = +(t[2] || 0);
        if (/вечера|дня/i.test(t[3] || '') && h < 12) h += 12;
        at = new Date(now); at.setDate(at.getDate() + day); at.setHours(h, min, 0, 0);
        if (!day && at <= now) at.setDate(at.getDate() + 1);
        text = text.replace(t[0], ' ');
      } else if (day) {
        at = new Date(now); at.setDate(at.getDate() + day); at.setHours(9, 0, 0, 0);
      }
    }
    if (!at) return null;
    return { text: text.replace(/\s+/g, ' ').trim() || 'Напоминание', at: at.getTime() };
  }
  function fmtWhen(ts, now = new Date()) {
    const d = new Date(ts);
    const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 864e5);
    return (days === 0 ? 'сегодня' : days === 1 ? 'завтра' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })) + ' в ' + hm;
  }

  const api = { fixLayout, translit, textTools, textStats, calc, convertUnits, parseTimer, parseReminder, fmtWhen, fmtNum };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Tools = api;
})(typeof window !== 'undefined' ? window : globalThis);
