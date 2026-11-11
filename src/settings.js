// הגדרות: מראה, טקסט, הערות וקבצים.
// נשמרות ב־settings.json של האפליקציה (דרך main.js), ומוחלות כמשתני CSS על <html>.
// כדי להוסיף הגדרה: ערך ב־DEFAULTS, החלה ב־applyPrefs, ושורה ב־buildDialog.
import { icon } from './icons.js';

export const DEFAULTS = {
  version: 2,
  theme: 'light',          // light | dark | system
  paper: 'warm',           // גוון הלבן: warm | cool | cream | pure
  accent: '#6cb8e6',       // תכלת
  fontDoc: 'Calibri',
  fontHeading: 'Rubik',    // גופן הכותרות. 'same' = כמו הטקסט
  textDir: 'rtl',          // rtl (ימין לשמאל) | auto (כל פסקה לפי השפה שלה) | ltr
  justify: false,          // יישור לשני הצדדים
  fontSize: 17,
  lineHeight: 1.75,
  pageWidth: 'normal',     // narrow | normal | wide | full
  pageLook: true,          // דף "מודפס" עם צל, או טקסט ישר על הרקע
  showBacklinks: true,
  newNoteLocation: 'selected', // selected (התיקייה שנבחרה בעץ) | root
  attachMode: 'folder',    // folder (תיקייה קבועה) | beside (ליד ההערה)
  attachFolder: 'attachments',
};

const ACCENTS = [
  ['#6cb8e6', 'תכלת'], ['#4a8fd8', 'כחול'], ['#5cc4a4', 'מנטה'],
  ['#a596e2', 'לבנדר'], ['#ee9f7c', 'אפרסק'], ['#e98fb4', 'ורוד'],
];
const PAPERS = [
  ['warm', 'לבן חמים', '#fffdf9'], ['cool', 'לבן קריר', '#fbfdfe'],
  ['cream', 'שמנת', '#fffbf1'], ['pure', 'לבן נקי', '#ffffff'],
];
// משמש כרוחב העמודה של הדף (grid), ולכן "מלא" הוא מספר גדול ולא none
const WIDTHS = { narrow: '680px', normal: '820px', wide: '1000px', full: '10000px' };
// גופנים שכדאי להציע. מוצגים רק אלה שמותקנים במחשב.
const FONT_CANDIDATES = [
  'Calibri', 'Segoe UI', 'Arial', 'Tahoma', 'David', 'Miriam', 'Narkisim', 'Gisha', 'FrankRuehl',
  'Levenim MT', 'Aharoni', 'Times New Roman', 'Georgia', 'Rubik', 'Heebo', 'Assistant', 'Alef',
  'Frank Ruhl Libre', 'David Libre', 'Noto Sans Hebrew', 'Noto Serif Hebrew', 'Varela Round', 'Open Sans',
];

let prefs = { ...DEFAULTS };
let saveTimer = null;
const listeners = [];

export const getPrefs = () => prefs;
export function onPrefsChange(fn) { listeners.push(fn); }

export async function loadPrefs() {
  const saved = await window.api.getPrefs().catch(() => null);
  // הגדרות מגרסה קודמת: גופן ברירת המחדל הישן (Segoe UI) מוחלף ב־Calibri
  if (saved && !saved.version) {
    if (saved.fontDoc === 'Segoe UI') saved.fontDoc = DEFAULTS.fontDoc;
    saved.version = DEFAULTS.version;
  }
  prefs = { ...DEFAULTS, ...(saved || {}) };
  applyPrefs();
}

function setPref(key, value) {
  prefs = { ...prefs, [key]: value };
  applyPrefs();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.api.setPrefs(prefs), 300);
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
darkQuery.addEventListener('change', () => { if (prefs.theme === 'system') applyPrefs(); });

export function applyPrefs() {
  const root = document.documentElement;
  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && darkQuery.matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  if (prefs.paper === 'warm') delete root.dataset.paper; else root.dataset.paper = prefs.paper;
  root.style.setProperty('--accent', prefs.accent);
  root.style.setProperty('--font-doc', `"${prefs.fontDoc}", "Segoe UI", Arial, sans-serif`);
  root.style.setProperty('--font-heading', prefs.fontHeading === 'same'
    ? 'var(--font-doc)' : `"${prefs.fontHeading}", "Segoe UI", Arial, sans-serif`);
  root.style.setProperty('--doc-size', prefs.fontSize + 'px');
  root.style.setProperty('--doc-line', String(prefs.lineHeight));
  root.style.setProperty('--page-width', WIDTHS[prefs.pageWidth] || WIDTHS.normal);
  if (prefs.pageLook) delete root.dataset.page; else root.dataset.page = 'flat';
  root.dataset.textdir = prefs.textDir;
  if (prefs.justify) root.dataset.justify = 'on'; else delete root.dataset.justify;
  for (const fn of listeners) fn(prefs);
}

// האם גופן מותקן: משווים רוחב טקסט מול גופן גיבוי
function fontInstalled(name) {
  const ctx = document.createElement('canvas').getContext('2d');
  const sample = 'אבגדהוזחטwmWlli 123';
  return ['monospace', 'serif'].some((fallback) => {
    ctx.font = `20px ${fallback}`;
    const base = ctx.measureText(sample).width;
    ctx.font = `20px "${name}", ${fallback}`;
    return ctx.measureText(sample).width !== base;
  });
}

// ===== חלון ההגדרות =====
let dialog = null;

export function openSettings() {
  if (!dialog) dialog = buildDialog();
  dialog.refresh();
  dialog.el.showModal();
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === 'style') e.style.cssText = v;
    else if (v != null) e.setAttribute(k, v);
  }
  for (const k of kids) e.append(k);
  return e;
}

function row(title, hint, control) {
  const label = el('label', {}, title);
  if (hint) label.append(el('small', {}, hint));
  return el('div', { class: 'row' }, label, control);
}

function buildDialog() {
  const refreshers = [];
  const bind = (fn) => { refreshers.push(fn); return fn; };

  // כפתורי בחירה צמודים
  const seg = (key, options) => {
    const box = el('div', { class: 'seg' });
    for (const [value, text] of options) {
      const b = el('button', { type: 'button', on: { click: () => { setPref(key, value); refresh(); } } }, text);
      box.append(b);
      bind(() => b.classList.toggle('on', prefs[key] === value));
    }
    return box;
  };
  const check = (key) => {
    const c = el('input', { type: 'checkbox', on: { change: () => setPref(key, c.checked) } });
    bind(() => { c.checked = !!prefs[key]; });
    return c;
  };
  const select = (key, options, { onChange } = {}) => {
    const s = el('select', { on: { change: () => { setPref(key, s.value); onChange?.(); } } });
    for (const [value, text, font] of options) s.append(el('option', { value, style: font ? `font-family:"${font}"` : null }, text));
    bind(() => { s.value = prefs[key]; });
    return s;
  };
  const range = (key, min, max, step, fmt) => {
    const out = el('span', { style: 'min-width:3.2em;display:inline-block;text-align:center' });
    const r = el('input', { type: 'range', min, max, step, on: { input: () => { setPref(key, Number(r.value)); out.textContent = fmt(r.value); } } });
    bind(() => { r.value = prefs[key]; out.textContent = fmt(prefs[key]); });
    return el('span', { style: 'display:flex;align-items:center;gap:6px' }, r, out);
  };

  // צבע מודגש: דוגמיות + בחירה חופשית
  const accentBox = el('div', { class: 'swatches' });
  for (const [color, name] of ACCENTS) {
    const b = el('button', { type: 'button', class: 'swatch', title: name, style: `background:${color}`, on: { click: () => { setPref('accent', color); refresh(); } } });
    accentBox.append(b);
    bind(() => b.classList.toggle('on', prefs.accent.toLowerCase() === color));
  }
  const custom = el('input', { type: 'color', title: 'צבע אחר', on: { input: () => { setPref('accent', custom.value); refresh(); } } });
  accentBox.append(custom);
  bind(() => { custom.value = prefs.accent; });

  // גוון הרקע
  const paperBox = el('div', { class: 'swatches' });
  for (const [value, name, color] of PAPERS) {
    const b = el('button', { type: 'button', class: 'swatch', title: name, style: `background:${color}`, on: { click: () => { setPref('paper', value); refresh(); } } });
    paperBox.append(b);
    bind(() => b.classList.toggle('on', prefs.paper === value));
  }
  const paperRow = row('גוון הרקע', 'במצב בהיר', paperBox);
  bind(() => { paperRow.hidden = document.documentElement.dataset.theme === 'dark'; });

  // גופנים מותקנים בלבד, והגופן הנוכחי גם אם הוא לא ברשימה
  // Rubik מגיע עם האפליקציה (תיקיית fonts), ולכן תמיד ברשימה
  const fonts = ['Rubik', ...FONT_CANDIDATES.filter(fontInstalled)];
  if (!fonts.includes(prefs.fontDoc)) fonts.unshift(prefs.fontDoc);
  const fontSelect = select('fontDoc', fonts.map((f) => [f, f, f]));
  const headingSelect = select('fontHeading', [['same', 'כמו הטקסט'], ...fonts.map((f) => [f, f, f])]);

  const folderInput = el('input', { type: 'text', placeholder: 'attachments', on: { change: () => setPref('attachFolder', folderInput.value.trim() || DEFAULTS.attachFolder) } });
  bind(() => { folderInput.value = prefs.attachFolder; folderInput.disabled = prefs.attachMode !== 'folder'; });

  const body = el('div', { class: 'set-body' },
    el('h3', {}, 'מראה'),
    row('ערכת צבעים', null, seg('theme', [['light', 'בהיר'], ['dark', 'כהה'], ['system', 'לפי Windows']])),
    paperRow,
    row('צבע מודגש', 'כפתורים, קישורים וסימונים', accentBox),

    el('h3', {}, 'טקסט'),
    row('כיוון הטקסט', 'אוטומטי: כל פסקה לפי השפה שבה היא מתחילה', seg('textDir', [['rtl', 'ימין לשמאל'], ['auto', 'אוטומטי'], ['ltr', 'שמאל לימין']])),
    row('יישור לשני הצדדים', 'כמו בעיתון: השורות נמתחות עד הקצה', check('justify')),
    row('גופן', null, fontSelect),
    row('גופן כותרות', null, headingSelect),
    row('גודל', null, range('fontSize', 13, 24, 1, (v) => v + 'px')),
    row('מרווח שורות', null, range('lineHeight', 1.3, 2.2, 0.05, (v) => Number(v).toFixed(2))),
    row('רוחב הדף', null, seg('pageWidth', [['narrow', 'צר'], ['normal', 'רגיל'], ['wide', 'רחב'], ['full', 'מלא']])),
    row('מראה דף', 'דף עם צל, כמו במסמך Word', check('pageLook')),
    el('div', { class: 'preview' },
      el('div', { style: 'font-family:var(--font-heading);font-weight:700;font-size:1.3em;margin-bottom:4px' }, 'כותרת לדוגמה'),
      'כך ייראה הטקסט במסמכים. The quick brown fox jumps over the lazy dog.'),

    el('h3', {}, 'מסמכים וקבצים'),
    row('מסמך חדש נוצר', null, select('newNoteLocation', [['selected', 'בתיקייה שנבחרה בעץ'], ['root', 'בתיקייה הראשית']])),
    row('תמונות מיובאות נשמרות', null, select('attachMode', [['folder', 'בתיקייה קבועה'], ['beside', 'ליד המסמך']], { onChange: refresh })),
    row('שם התיקייה לתמונות', 'בתוך התיקייה הראשית', folderInput),
  );

  const reset = el('button', { type: 'button', on: { click: () => { prefs = { ...DEFAULTS }; setPref('accent', DEFAULTS.accent); refresh(); } } }, 'איפוס לברירת המחדל');
  const close = el('button', { type: 'button', class: 'primary', on: { click: () => dlg.close() } }, 'סגירה');
  const closeBtn = el('button', { type: 'button', class: 'icon-btn', 'data-tip': 'סגירה', 'aria-label': 'סגירה', on: { click: () => dlg.close() } });
  closeBtn.innerHTML = icon('close', 18);
  const dlg = el('dialog', { id: 'settings' },
    el('div', { class: 'set-head' }, el('h2', {}, 'הגדרות'), closeBtn),
    body,
    el('div', { class: 'set-foot' }, reset, close),
  );
  document.body.append(dlg);

  function refresh() { for (const fn of refreshers) fn(); }
  return { el: dlg, refresh };
}
