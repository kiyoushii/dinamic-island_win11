// Линейные иконки 24×24 (stroke = currentColor)
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
  clip: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4.5V3h6v1.5"/><path d="M9 10h6M9 14h6M9 18h3"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
  text: '<path d="M5 6V4h14v2"/><path d="M12 4v16M9 20h6"/>',
  chat: '<path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3 21l1.4-5.4A8.5 8.5 0 1 1 21 12z"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M18.4 2.6a2 2 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  weather: '<circle cx="9" cy="8" r="3"/><path d="M9 2v1M3 8H2M4.5 3.5l.7.7M13.5 3.5l-.7.7"/><path d="M8 20h9a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.5A3.3 3.3 0 0 0 8 20z"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  wave: '<path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/>',
  pin: '<path d="M9 3h6l-1 6 4 4H6l4-4z"/><path d="M12 13v8"/>',
  settings: '<path d="M4 7h10M4 17h4M18 7h2M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/>',
  next: '<path d="M5 5v14l10-7z" fill="currentColor" stroke="none"/><path d="M18 5v14" stroke-width="2.4"/>',
  prev: '<path d="M19 5v14L9 12z" fill="currentColor" stroke="none"/><path d="M6 5v14" stroke-width="2.4"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  lyrics: '<rect x="3" y="4" width="18" height="15" rx="3"/><path d="M8 10.5h.01M8 13.5h.01"/><path d="M11 10.5h5M11 13.5h3"/>',
  region: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" stroke-dasharray="2 2"/><path d="m12 11 7 3-3 1-1 3z"/>',
  screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  ocr: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 9h8M8 12h8M8 15h5"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18v2"/>',
  color: '<path d="m14 7 3 3"/><path d="M5 19l1-4 9.5-9.5a2.1 2.1 0 0 1 3 3L9 18z"/><path d="M4 20h.01"/>',
  eraser: '<path d="m7 21-4-4a1.5 1.5 0 0 1 0-2L14 4a1.5 1.5 0 0 1 2 0l5 5a1.5 1.5 0 0 1 0 2l-10 10z"/><path d="M7 21h13M9 10l7 7"/>',
  record: '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  command: '<path d="M8 4a3 3 0 1 0 0 6h8a3 3 0 1 0 0-6 3 3 0 0 0-3 3v10a3 3 0 1 0 3-3H8a3 3 0 1 0 3 3V7a3 3 0 0 0-3-3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v3M8 18h.01M12 18h.01"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2h5"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  shot: '<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  power: '<path d="M12 3v9"/><path d="M6.4 6.4a8 8 0 1 0 11.2 0"/>',
  dnd: '<circle cx="12" cy="12" r="9"/><path d="M7.5 12h9"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  attach: '<path d="m20 11.5-8.2 8.2a5.3 5.3 0 0 1-7.5-7.5l8.6-8.6a3.5 3.5 0 0 1 5 5l-8.6 8.6a1.8 1.8 0 0 1-2.5-2.5l7.9-7.9"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7"/>',
  umbrella: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v7a2 2 0 0 0 4 0"/>',
  location: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.8-4M4 4v4h4M4 13a8 8 0 0 0 14.8 4M20 20v-4h-4"/>',
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
  italic: '<path d="M10 5h8M6 19h8M14 5l-4 14"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  checklist: '<path d="m4 7 2 2 3-3M4 16l2 2 3-3M12 8h8M12 17h8"/>',
  strike: '<path d="M4 12h16M16 6.5A4 3 0 0 0 12 5c-2.5 0-4 1.3-4 3s1.5 2.5 4 3M8 17.5A4 3 0 0 0 12 19c2.5 0 4-1.3 4-3"/>',
  highlight: '<path d="m9 11-5 5v4h4l5-5M14 6l4 4M12 8l5-5 4 4-5 5z"/>',
  agent: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3M12 15h5"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z"/><path d="m9 12 2 2 4-4"/>',
  bluetooth: '<path d="m7 7 10 10-5 4V3l5 4L7 17"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="6.5" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.5"/>',
  mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',
  speaker: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><circle cx="12" cy="14.5" r="3.5"/><path d="M12 7h.01"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  gamepad: '<path d="M6.5 8h11a4 4 0 0 1 4 4.5l-.6 4a2.5 2.5 0 0 1-4.4 1.2L15 16H9l-1.5 1.7a2.5 2.5 0 0 1-4.4-1.2l-.6-4A4 4 0 0 1 6.5 8z"/><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01"/>',
};
function icon(name, size = 18, extra = '') {
  return `<svg class="ic ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

// Погода: коды WMO из open-meteo → иконка + подпись
function weatherInfo(code, isDay = 1) {
  const map = {
    0: ['sun', 'Ясно'], 1: ['sun', 'Преимущественно ясно'], 2: ['weather', 'Переменная облачность'], 3: ['cloud', 'Пасмурно'],
    45: ['cloud', 'Туман'], 48: ['cloud', 'Изморозь'],
    51: ['rain', 'Морось'], 53: ['rain', 'Морось'], 55: ['rain', 'Сильная морось'],
    61: ['rain', 'Небольшой дождь'], 63: ['rain', 'Дождь'], 65: ['rain', 'Ливень'],
    66: ['rain', 'Ледяной дождь'], 67: ['rain', 'Ледяной дождь'],
    71: ['snow', 'Небольшой снег'], 73: ['snow', 'Снег'], 75: ['snow', 'Сильный снег'], 77: ['snow', 'Снежные зёрна'],
    80: ['rain', 'Ливень'], 81: ['rain', 'Ливень'], 82: ['rain', 'Сильный ливень'],
    85: ['snow', 'Снегопад'], 86: ['snow', 'Сильный снегопад'],
    95: ['storm', 'Гроза'], 96: ['storm', 'Гроза с градом'], 99: ['storm', 'Гроза с градом'],
  };
  const [kind, label] = map[code] || ['weather', '—'];
  return { kind: kind === 'sun' && !isDay ? 'moon' : kind, label };
}
// Цветные значки погоды (как в видео: жёлтое солнце, серые облака)
function weatherIcon(kind, size = 18) {
  const sun = '<circle cx="12" cy="12" r="4.2" fill="#FFC531"/><g stroke="#FFC531" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></g>';
  const cloud = (y = 0, c = '#C9CED8') => `<path transform="translate(0 ${y})" d="M7.5 19h9.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7.5 19z" fill="${c}"/>`;
  const parts = {
    sun,
    moon: '<path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z" fill="#E8E3C8"/>',
    weather: '<g transform="translate(-3 -3) scale(.8)">' + sun + '</g>' + cloud(1),
    cloud: cloud(-1),
    rain: cloud(-3) + '<g stroke="#6CB4FF" stroke-width="1.8" stroke-linecap="round"><path d="M8.5 19l-1 2.5M12.5 19l-1 2.5M16.5 19l-1 2.5"/></g>',
    snow: cloud(-3) + '<g fill="#fff"><circle cx="8" cy="20" r="1.1"/><circle cx="12" cy="21.5" r="1.1"/><circle cx="16" cy="20" r="1.1"/></g>',
    storm: cloud(-3, '#9AA0AA') + '<path d="M12.5 16.5 10 20.5h3l-1.5 3" stroke="#FFC531" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">${parts[kind] || parts.weather}</svg>`;
}
