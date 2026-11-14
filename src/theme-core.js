// ערכות צבעים: לוגיקה טהורה בלי DOM (נבדקת ב־tests/theme-core.test.mjs).
// לכל ערכה שישה צבעי יסוד שהמשתמש בוחר. כל שאר הגוונים בממשק נגזרים מהם (deriveVars),
// לפי בהירות הערכה בפועל (לא לפי השם "יום"/"לילה"), כך שגם ערכה כהה שנבחרה ליום תיראה נכון.
// בלי import: הבדיקות טוענות את הקובץ כמו שהוא.

export const BASE_KEYS = ['bg', 'page', 'panel', 'text', 'accent', 'border'];
export const BASE_LABELS = {
  bg: 'רקע האפליקציה', page: 'רקע הדף', panel: 'סרגלים ולוחות', text: 'טקסט', accent: 'צבע מודגש', border: 'מסגרות וקווים',
};

// צבעים מפורטים הם דריסות רשות מעל לצבעים שנגזרים מששת צבעי היסוד.
// השמות הן סמנטיות (תיבה צפה, פריט נבחר...) ולא תלויות במסך מסוים.
export const DETAIL_GROUPS = [
  { title: 'משטחים ומסגרות', keys: ['sidebar', 'input', 'floating', 'floatingBorder', 'toolbar'] },
  { title: 'מצבים ובחירה', keys: ['hover', 'selected', 'selectedText', 'accentLine', 'onAccent'] },
  { title: 'טקסט ותוכן', keys: ['muted', 'faint', 'folder', 'document', 'link', 'headingLine'] },
  { title: 'קוד והתראות', keys: ['code', 'codeBlock', 'codeText', 'danger', 'dangerText'] },
];
export const DETAIL_KEYS = DETAIL_GROUPS.flatMap((group) => group.keys);
export const DETAIL_LABELS = {
  sidebar: 'רקע עץ המסמכים', input: 'רקע שדות וכפתורים', floating: 'רקע תיבות צפות',
  floatingBorder: 'מסגרת תיבות צפות', toolbar: 'רקע כותרות וסרגלים', hover: 'רקע בריחוף',
  selected: 'רקע פריט נבחר', selectedText: 'טקסט פריט נבחר', accentLine: 'קווי הדגשה',
  onAccent: 'טקסט על צבע מודגש', muted: 'טקסט משני', faint: 'טקסט חלש', folder: 'שמות תיקיות',
  document: 'שמות מסמכים', link: 'קישורים ותגיות', headingLine: 'קווים ליד כותרות',
  code: 'רקע קוד בתוך שורה', codeBlock: 'רקע בלוק קוד', codeText: 'טקסט בלוק קוד',
  danger: 'רקע שגיאה או מחיקה', dangerText: 'טקסט שגיאה או מחיקה',
};
export const DETAIL_VARS = {
  sidebar: '--sidebar-bg', input: '--input-bg', floating: '--floating-bg', floatingBorder: '--floating-border',
  toolbar: '--toolbar-bg', hover: '--accent-hover', selected: '--accent-soft', selectedText: '--accent-strong',
  accentLine: '--accent-line', onAccent: '--on-accent', muted: '--muted', faint: '--faint', folder: '--folder-ink',
  document: '--document-ink', link: '--link', headingLine: '--h2-rule', code: '--code-bg', codeBlock: '--pre-bg',
  codeText: '--pre-text', danger: '--danger', dangerText: '--danger-ink',
};

// ערכות מוכנות. הראשונה בכל סוג היא ברירת המחדל (הצבעים שהיו עד 3.7).
export const PRESETS = [
  { id: 'warm', name: 'לבן חמים', kind: 'day', colors: { bg: '#f1eee8', page: '#fffdf9', panel: '#fcfbf8', text: '#2a2d33', accent: '#6cb8e6', border: '#e5e0d6' } },
  { id: 'cool', name: 'לבן קריר', kind: 'day', colors: { bg: '#ebf0f4', page: '#fbfdfe', panel: '#f9fbfc', text: '#26303a', accent: '#4a8fd8', border: '#dce3e9' } },
  { id: 'cream', name: 'שמנת', kind: 'day', colors: { bg: '#f1eadb', page: '#fffbf1', panel: '#fcf8ef', text: '#33302a', accent: '#d0895a', border: '#e7dcc6' } },
  { id: 'pure', name: 'לבן נקי', kind: 'day', colors: { bg: '#eceef1', page: '#ffffff', panel: '#ffffff', text: '#24272c', accent: '#5cc4a4', border: '#dcdfe4' } },
  { id: 'night', name: 'לילה', kind: 'night', colors: { bg: '#1b1d21', page: '#26292f', panel: '#23262b', text: '#e4e5e8', accent: '#6cb8e6', border: '#383c44' } },
  { id: 'ember', name: 'לילה חם', kind: 'night', colors: { bg: '#1d1a17', page: '#28241f', panel: '#24201c', text: '#ece5da', accent: '#e0a36f', border: '#3e3730' } },
  { id: 'midnight', name: 'חצות כחול', kind: 'night', colors: { bg: '#141922', page: '#1b2230', panel: '#18202b', text: '#e2e8f0', accent: '#7cb7ff', border: '#2d394b' } },
  { id: 'graphite', name: 'גרפיט', kind: 'night', colors: { bg: '#18181a', page: '#202023', panel: '#1c1c1f', text: '#e6e6e8', accent: '#a596e2', border: '#333338' } },
];
export const DEFAULT_THEMES = {
  day: { ...PRESETS.find((p) => p.id === 'warm').colors },
  night: { ...PRESETS.find((p) => p.id === 'night').colors },
};
export const DEFAULT_SCHEDULE = { day: '07:00', night: '19:00' };
export const MODES = ['day', 'night', 'system', 'schedule'];

// ---------- צבעים ----------
export function normalizeHex(value) {
  let s = String(value || '').trim().toLowerCase();
  if (!s.startsWith('#')) s = '#' + s;
  if (/^#[0-9a-f]{3}$/.test(s)) s = '#' + [...s.slice(1)].map((c) => c + c).join('');
  return /^#[0-9a-f]{6}$/.test(s) ? s : null;
}
const toRgb = (hex) => { const h = normalizeHex(hex) || '#000000'; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const toHex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
// t=0: a, t=1: b (ב־sRGB, כמו color-mix)
export function mix(a, b, t) { const x = toRgb(a); const y = toRgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); }

// WCAG 2.x
export function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
export const isDarkColor = (hex) => luminance(hex) < 0.2;

// הצבע הקרוב ביותר ל־fg שמגיע לניגודיות target מול bg (מזיז לכיוון שחור או לבן, מה שמתאים לרקע)
export function readableAgainst(fg, bg, target = 4.5) {
  if (contrast(fg, bg) >= target) return normalizeHex(fg);
  const toward = isDarkColor(bg) ? '#ffffff' : '#000000';
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = mix(fg, toward, t);
    if (contrast(c, bg) >= target) return c;
  }
  return toward;
}

// ---------- גזירת כל משתני הממשק מששת צבעי היסוד ----------
export function completeTheme(colors, fallback = DEFAULT_THEMES.day) {
  const out = {};
  for (const k of BASE_KEYS) out[k] = normalizeHex(colors?.[k]) || fallback[k];
  for (const k of DETAIL_KEYS) {
    const value = normalizeHex(colors?.[k]);
    if (value) out[k] = value;
  }
  return out;
}

export function deriveVars(colors) {
  const c = completeTheme(colors);
  const dark = isDarkColor(c.page);
  const ink = dark ? '#ffffff' : '#000000';
  const v = {
    '--bg': c.bg,
    '--page-bg': c.page,
    '--panel-bg': c.panel,
    '--sidebar-bg': mix(c.panel, c.bg, dark ? 0.25 : 0.35),
    '--input-bg': dark ? mix(c.page, c.text, 0.04) : mix(c.page, '#ffffff', 0.85),
    '--border': c.border,
    '--text': c.text,
    // טקסט משני: באמצע הדרך בין הטקסט לדף (כמו שהיה ידני בשתי הערכות), אבל לא פחות מ־4.5:1 / 3:1
    '--muted': readableAgainst(mix(c.text, c.page, 0.38), c.page, 4.5),
    '--faint': readableAgainst(mix(c.text, c.page, 0.6), c.page, 2.2),
    '--code-bg': mix(c.page, c.text, 0.055),
    '--pre-bg': dark ? mix(c.bg, '#000000', 0.25) : '#2b303b',
    '--pre-text': dark ? mix(c.text, '#ffffff', 0.1) : '#e8ebf2',
    '--accent': c.accent,
    // טקסט על מילוי בצבע המודגש: כהה או בהיר, לפי מה שקריא יותר
    '--on-accent': contrast(mix(c.accent, '#0b1a24', 0.78), c.accent) >= contrast('#ffffff', c.accent) ? mix(c.accent, '#0b1a24', 0.78) : '#ffffff',
    // קישורים וטקסט מודגש: הצבע המודגש, מוכהה/מובהר עד שהוא קריא על הדף
    '--accent-ink': readableAgainst(c.accent, c.page, 4.5),
    '--shadow': dark
      ? '0 1px 3px rgba(0, 0, 0, .4), 0 8px 24px rgba(0, 0, 0, .25)'
      : '0 1px 3px rgba(60, 50, 30, .08), 0 8px 24px rgba(60, 50, 30, .05)',
    // כפתור "מסמך חדש" (3.3): אותו עיצוב, בגוונים של הצבע המודגש
    '--btn-new-1': mix(c.accent, '#ffffff', 0.45),
    '--btn-new-2': mix(c.accent, '#a8bccb', 0.18),
    '--btn-new-3': mix(c.accent, '#3d6f8f', 0.15),
    '--btn-new-edge': mix(c.accent, '#3d6f8f', 0.3),
    '--btn-new-wave-1': mix(c.accent, '#ffffff', 0.75),
    '--btn-new-wave-2': mix(c.accent, '#ffffff', 0.86),
    '--btn-new-tile-ink': mix(c.accent, '#0e2433', 0.55),
    '--focus-ring': dark ? mix(c.accent, '#ffffff', 0.25) : mix(c.accent, '#0e2433', 0.5),
  };
  const accentSoft = mix(c.accent, c.page, dark ? 0.78 : 0.84);
  const accentHover = mix(c.accent, c.page, dark ? 0.88 : 0.91);
  const accentStrong = readableAgainst(mix(c.accent, c.text, dark ? 0.25 : 0.38), c.page, 4.5);
  const accentLine = mix(c.accent, c.border, dark ? 0.6 : 0.65);
  const danger = dark ? '#4a2428' : '#f9e3e3';
  const dangerText = readableAgainst(dark ? '#ff9b9b' : '#b23b3b', c.page, 4.5);
  Object.assign(v, {
    '--sidebar-bg': c.sidebar || v['--sidebar-bg'],
    '--input-bg': c.input || v['--input-bg'],
    '--floating-bg': c.floating || c.panel,
    '--floating-border': c.floatingBorder || c.border,
    '--toolbar-bg': c.toolbar || mix(c.accent, c.panel, dark ? 0.93 : 0.94),
    '--accent-hover': c.hover || accentHover,
    '--accent-soft': c.selected || accentSoft,
    '--accent-strong': c.selectedText || accentStrong,
    '--accent-tint': c.toolbar || mix(c.accent, c.panel, dark ? 0.93 : 0.94),
    '--accent-line': c.accentLine || accentLine,
    '--on-accent': c.onAccent || v['--on-accent'],
    '--muted': c.muted || v['--muted'],
    '--faint': c.faint || v['--faint'],
    '--link': c.link || v['--accent-ink'],
    '--accent-ink': c.link || v['--accent-ink'],
    '--h2-rule': c.headingLine || mix(c.border, c.text, dark ? 0.18 : 0.08),
    '--code-bg': c.code || v['--code-bg'],
    '--pre-bg': c.codeBlock || v['--pre-bg'],
    '--pre-text': c.codeText || v['--pre-text'],
    '--danger': c.danger || danger,
    '--danger-ink': c.dangerText || dangerText,
  });
  const itemInk = mix(c.text, v['--muted'], 0.15);
  v['--folder-ink'] = c.folder || itemInk;
  v['--document-ink'] = c.document || itemInk;
  // כותרת הכפתור צריכה להיות קריאה על החלק הכהה ביותר שלו
  const darkInk = mix(c.accent, '#0e2433', 0.75);
  v['--btn-new-ink'] = contrast(darkInk, v['--btn-new-3']) >= 4.5 ? darkInk : readableAgainst(darkInk, v['--btn-new-3'], 4.5);
  return { vars: v, dark, ink };
}

// בדיקות קריאות. מחזיר אזהרות עם הצעה, בלי לשנות שום צבע לבד.
export function contrastIssues(colors) {
  const c = completeTheme(colors);
  const checks = [
    { fg: 'text', bg: 'page', min: 4.5, what: 'הטקסט על הדף' },
    { fg: 'text', bg: 'panel', min: 4.5, what: 'הטקסט בסרגלים' },
    { fg: 'text', bg: 'bg', min: 4.5, what: 'הטקסט על רקע האפליקציה' },
    // הצבע המודגש משמש כמילוי (עם טקסט שנבחר אוטומטית) וקישורים מקבלים גוון קריא שלו (--accent-ink),
    // ולכן מתריעים רק כשהוא כמעט נבלע בדף
    { fg: 'accent', bg: 'page', min: 1.6, what: 'הצבע המודגש כמעט לא נראה על הדף' },
  ];
  const issues = [];
  for (const k of checks) {
    const ratio = contrast(c[k.fg], c[k.bg]);
    if (ratio < k.min) {
      issues.push({ key: k.fg, against: k.bg, ratio: Math.round(ratio * 100) / 100, min: k.min, what: k.what, suggestion: readableAgainst(c[k.fg], c[k.bg], k.min) });
    }
  }
  const vars = deriveVars(c).vars;
  const detailed = [
    { key: 'muted', fg: '--muted', bg: '--page-bg', watch: ['muted'], what: 'הטקסט המשני על הדף' },
    { key: 'folder', fg: '--folder-ink', bg: '--sidebar-bg', watch: ['folder', 'sidebar'], what: 'שמות התיקיות בעץ' },
    { key: 'document', fg: '--document-ink', bg: '--sidebar-bg', watch: ['document', 'sidebar'], what: 'שמות המסמכים בעץ' },
    { key: 'link', fg: '--link', bg: '--page-bg', watch: ['link'], what: 'קישורים על הדף' },
    { key: 'selectedText', fg: '--accent-strong', bg: '--accent-soft', watch: ['selectedText', 'selected'], what: 'טקסט של פריט נבחר' },
    { key: 'onAccent', fg: '--on-accent', bg: '--accent', watch: ['onAccent'], what: 'טקסט על הצבע המודגש' },
    { key: 'codeText', fg: '--pre-text', bg: '--pre-bg', watch: ['codeText', 'codeBlock'], what: 'טקסט בבלוק קוד' },
    { key: 'dangerText', fg: '--danger-ink', bg: '--danger', watch: ['dangerText', 'danger'], what: 'טקסט התראה' },
  ];
  for (const check of detailed) {
    if (!check.watch.some((key) => Object.prototype.hasOwnProperty.call(c, key))) continue;
    const ratio = contrast(vars[check.fg], vars[check.bg]);
    if (ratio < 4.5) issues.push({ key: check.key, against: check.bg, ratio: Math.round(ratio * 100) / 100, min: 4.5, what: check.what, suggestion: readableAgainst(vars[check.fg], vars[check.bg], 4.5) });
  }
  return issues;
}

// ---------- בחירת הערכה לפי מצב ושעה ----------
export function parseHM(s) {
  const m = /^\s*([01]?\d|2[0-3]):([0-5]\d)\s*$/.exec(String(s || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export function formatHM(min) { return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; }
export function validSchedule(schedule) {
  const d = parseHM(schedule?.day);
  const n = parseHM(schedule?.night);
  return d != null && n != null && d !== n;
}

// 'day' | 'night'. בשעות: יום מ־day ועד night, גם כשהטווח חוצה חצות.
export function activeProfile({ mode, schedule, systemDark, now }) {
  if (mode === 'night') return 'night';
  if (mode === 'system') return systemDark ? 'night' : 'day';
  if (mode !== 'schedule') return 'day';
  if (!validSchedule(schedule)) return 'day';
  const d = parseHM(schedule.day);
  const n = parseHM(schedule.night);
  const t = now.getHours() * 60 + now.getMinutes();
  return d < n ? (t >= d && t < n ? 'day' : 'night') : (t >= d || t < n ? 'day' : 'night');
}

// הרגע הבא שבו הערכה מתחלפת (בשעון המקומי, כולל מעבר שעון קיץ/חורף), או null אם אין תזמון
export function nextSwitch({ mode, schedule, now }) {
  if (mode !== 'schedule' || !validSchedule(schedule)) return null;
  let best = null;
  for (const key of ['day', 'night']) {
    const m = parseHM(schedule[key]);
    for (let add = 0; add <= 2; add++) {
      const c = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add, Math.floor(m / 60), m % 60, 0, 0);
      if (c > now && (!best || c < best)) { best = c; break; }
    }
  }
  return best;
}

// ---------- מעבר מההגדרות הישנות (עד 3.7: theme, paper, accent) ----------
const OLD_PAPER = { warm: 'warm', cool: 'cool', cream: 'cream', pure: 'pure' };
export function migratePrefs(saved) {
  const p = { ...(saved || {}) };
  if (!p.themes) {
    const paper = PRESETS.find((x) => x.id === OLD_PAPER[p.paper]) || PRESETS[0];
    const accent = normalizeHex(p.accent);
    p.themes = {
      day: { ...paper.colors, ...(accent ? { accent } : {}) },
      // עד עכשיו הצבע המודגש היה משותף לשני המצבים, ולכן גם הלילה מקבל אותו
      night: { ...DEFAULT_THEMES.night, ...(accent ? { accent } : {}) },
    };
  } else {
    p.themes = { day: completeTheme(p.themes.day, DEFAULT_THEMES.day), night: completeTheme(p.themes.night, DEFAULT_THEMES.night) };
  }
  if (!MODES.includes(p.themeMode)) {
    p.themeMode = p.theme === 'dark' ? 'night' : p.theme === 'system' ? 'system' : 'day';
  }
  if (!validSchedule(p.schedule)) p.schedule = { ...DEFAULT_SCHEDULE };
  return p;
}
