export const MOTIFS = ['dice', 'tournament', 'cards', 'suits', 'space', 'spotlight', 'mystery'];
export const THEMES = ['classic', 'monopoly', 'challengers', 'coup', 'poker', 'among-us', 'mafia', 'clue'];
export const PALETTE_KEYS = ['background', 'surface', 'text', 'muted', 'accent', 'accentText', 'secondary'];

export function contrastRatio(first, second) {
  const luminance = hex => {
    const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(first), luminance(second)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

export function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function textValue(value, label, min = 1, max = 60) {
  if (typeof value !== 'string') fail(400, `${label} is required.`);
  const clean = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if ([...clean].length < min || [...clean].length > max || /[\p{Cc}\p{Cf}]/u.test(clean)) {
    fail(400, `${label} must be ${min}–${max} characters, without hidden control characters.`);
  }
  return clean;
}

export function nameKey(value) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

export function booleanValue(value, label) {
  if (typeof value !== 'boolean') fail(400, `${label} must be true or false.`);
  return value;
}

export function requestKey(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(value)) fail(400, 'A valid request ID is required.');
  return value;
}

export function credentials(body) {
  const username = textValue(body.username, 'Username', 2, 40);
  if (typeof body.password !== 'string' || Buffer.byteLength(body.password, 'utf8') < 10 || Buffer.byteLength(body.password, 'utf8') > 72) {
    fail(400, 'Password must be 10–72 bytes (at least 10 plain letters or numbers).');
  }
  return { username, usernameKey: nameKey(username), password: body.password };
}

export function validateGame(data, existing = {}) {
  const merged = { ...existing, ...data };
  const id = merged.id ?? crypto.randomUUID();
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(id)) fail(400, 'Game ID must contain lowercase letters, numbers, or dashes.');
  const name = textValue(merged.name, 'Game name', 1, 60);
  const tagline = textValue(merged.tagline ?? 'Your table. Your rules.', 'Tagline', 1, 120);
  if (!THEMES.includes(merged.themeKey)) fail(400, 'Choose a supported theme.');
  if (!MOTIFS.includes(merged.motif)) fail(400, 'Choose a supported motif.');
  if (!merged.palette || typeof merged.palette !== 'object') fail(400, 'A complete color palette is required.');
  const palette = {};
  for (const key of PALETTE_KEYS) {
    if (typeof merged.palette[key] !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(merged.palette[key])) fail(400, `${key} must be a six-digit hex color.`);
    palette[key] = merged.palette[key];
  }
  const colorNames = { background: 'background', surface: 'card', text: 'text', muted: 'secondary text', accent: 'accent', accentText: 'button text' };
  for (const [foreground, background] of [['text', 'background'], ['text', 'surface'], ['muted', 'background'], ['muted', 'surface'], ['accentText', 'accent']]) {
    if (contrastRatio(palette[foreground], palette[background]) < 4.5) {
      fail(400, `The ${colorNames[foreground]} and ${colorNames[background]} colors are too similar. Increase their contrast so everyone can read the screen.`);
    }
  }
  return { id, name, tagline, themeKey: merged.themeKey, motif: merged.motif, palette, archived: merged.archived === undefined ? false : booleanValue(merged.archived, 'Archived') };
}

export function similarity(a, b) {
  const normalize = value => nameKey(value).normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  a = [...normalize(a)];
  b = [...normalize(b)];
  if (!a.length || !b.length) return 0;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return Math.round((1 - row[b.length] / Math.max(a.length, b.length)) * 100) / 100;
}
