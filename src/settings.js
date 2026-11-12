// הגדרות: מראה, טקסט, הערות וקבצים.
// נשמרות ב־settings.json של האפליקציה (דרך main.js), ומוחלות כמשתני CSS על <html>.
// כדי להוסיף הגדרה: ערך ב־DEFAULTS, החלה ב־applyPrefs, ושורה ב־buildDialog.
import { icon } from './icons.js';
import { updateTheme } from './theme.js';
import { buildThemeSection } from './theme-editor.js';
import { DEFAULT_THEMES, DEFAULT_SCHEDULE, migratePrefs } from './theme-core.js';
import { commandHotkey, eventToHotkey } from './hotkeys.js';

export const DEFAULTS = {
  version: 4,
  // ערכות צבעים (theme-core.js). עד 3.7 היו כאן theme / paper / accent, ו־migratePrefs ממיר אותם.
  themeMode: 'day',        // day | night | system (לפי Windows) | schedule (לפי שעות)
  themes: { day: { ...DEFAULT_THEMES.day }, night: { ...DEFAULT_THEMES.night } },
  schedule: { ...DEFAULT_SCHEDULE },
  fontDoc: 'Calibri',
  fontHeading: 'Rubik',    // גופן הכותרות. 'same' = כמו הטקסט
  textDir: 'rtl',          // rtl (ימין לשמאל) | auto (כל פסקה לפי השפה שלה) | ltr
  justify: false,          // יישור לשני הצדדים
  fontSize: 17,
  lineHeight: 1.75,
  pageWidth: 'normal',     // narrow | normal | wide | full
  pageLook: true,          // דף "מודפס" עם צל, או טקסט ישר על הרקע
  showBacklinks: true,
  newNoteLocation: 'selected', // selected (התיקייה שנבחרה בעץ) | inbox (מסמכים חדשים) | root
  attachMode: 'folder',    // folder (תיקייה קבועה) | beside (ליד ההערה)
  attachFolder: 'attachments',
  hotkeys: {},             // command id -> shortcut; empty string disables a shortcut
  completedTasksAtBottom: false,
};

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
  // ערכות הצבעים (3.8): הצבע המודגש וגוון הנייר שנבחרו קודם עוברים לערכת היום, והמצב בהיר/כהה/Windows נשמר
  const migrated = migratePrefs(saved || {});
  prefs = { ...DEFAULTS, ...migrated, version: DEFAULTS.version };
  applyPrefs();
  if (saved && !saved.themes) window.api.setPrefs(prefs);
}

function setPref(key, value, { animate = false } = {}) {
  prefs = { ...prefs, [key]: value };
  applyPrefs({ animate });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.api.setPrefs(prefs), 300);
}

export function applyPrefs({ animate = false } = {}) {
  const root = document.documentElement;
  updateTheme(prefs, { animate }); // צבעים: theme.js
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
let hotkeyCatalog = [];

export function setHotkeyCatalog(commands) {
  hotkeyCatalog = (commands || []).filter((command) => command.id && command.keys && !command.hidden)
    .map(({ id, title, keys }) => ({ id, title, keys }));
  if (dialog) { dialog.el.remove(); dialog = null; }
}

export function openSettings() {
  if (!dialog) dialog = buildDialog();
  dialog.open();
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

  // ערכות צבעים (theme-editor.js)
  const themes = buildThemeSection({ el, row, getPrefs: () => prefs, setPref });

  // גופנים מותקנים בלבד, והגופן הנוכחי גם אם הוא לא ברשימה
  // Rubik מגיע עם האפליקציה (תיקיית fonts), ולכן תמיד ברשימה
  const fonts = ['Rubik', ...FONT_CANDIDATES.filter(fontInstalled)];
  if (!fonts.includes(prefs.fontDoc)) fonts.unshift(prefs.fontDoc);
  const fontSelect = select('fontDoc', fonts.map((f) => [f, f, f]));
  const headingSelect = select('fontHeading', [['same', 'כמו הטקסט'], ...fonts.map((f) => [f, f, f])]);

  const folderInput = el('input', { type: 'text', placeholder: 'attachments', on: { change: () => setPref('attachFolder', folderInput.value.trim() || DEFAULTS.attachFolder) } });
  bind(() => { folderInput.value = prefs.attachFolder; folderInput.disabled = prefs.attachMode !== 'folder'; });

  const appearance = el('section', { class: 'set-page', 'data-page': 'appearance' }, ...themes.nodes);
  const writing = el('section', { class: 'set-page', 'data-page': 'writing', hidden: '' },
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
    row('משימות שבוצעו בסוף הרשימה', 'בעת סימון תיבת משימה היא עוברת, עם תנועה וקו מפריד, לסוף הרשימה שלה', check('completedTasksAtBottom')),
  );
  const files = el('section', { class: 'set-page', 'data-page': 'files', hidden: '' },
    row('מסמך חדש נוצר', null, select('newNoteLocation', [
      ['selected', 'בתיקייה שנבחרה בעץ'],
      ['inbox', 'בתיקיית „מסמכים חדשים”'],
      ['root', 'בתיקייה הראשית'],
    ])),
    row('תמונות מיובאות נשמרות', null, select('attachMode', [['folder', 'בתיקייה קבועה'], ['beside', 'ליד המסמך']], { onChange: refresh })),
    row('שם התיקייה לתמונות', 'בתוך התיקייה הראשית', folderInput),
  );

  const shortcutNotice = el('p', { class: 'set-note' }, 'לחיצה על קיצור מאפשרת להקליד קיצור חדש. Backspace מבטל קיצור; הכפתור הקטן מחזיר לברירת המחדל.');
  const shortcuts = el('section', { class: 'set-page set-shortcuts', 'data-page': 'shortcuts', hidden: '' }, shortcutNotice);
  for (const command of hotkeyCatalog) {
    const capture = el('button', { type: 'button', class: 'hotkey-capture' });
    const resetKey = el('button', { type: 'button', class: 'icon-btn hotkey-reset', 'aria-label': 'החזרה לברירת המחדל' });
    resetKey.innerHTML = icon('undo', 15);
    const control = el('span', { class: 'hotkey-control' }, capture, resetKey);
    const refreshKey = () => {
      capture.textContent = commandHotkey(command, prefs) || 'ללא קיצור';
      capture.classList.toggle('is-empty', !commandHotkey(command, prefs));
      resetKey.disabled = !Object.prototype.hasOwnProperty.call(prefs.hotkeys || {}, command.id);
    };
    bind(refreshKey);
    capture.addEventListener('click', () => { capture.dataset.capturing = '1'; capture.textContent = 'לחץ על הקיצור…'; capture.focus(); });
    capture.addEventListener('blur', () => { delete capture.dataset.capturing; refreshKey(); });
    capture.addEventListener('keydown', (event) => {
      if (!capture.dataset.capturing) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape') { capture.blur(); return; }
      const next = ['Backspace', 'Delete'].includes(event.key) ? '' : eventToHotkey(event);
      if (next == null) { capture.textContent = 'נדרש Ctrl, Alt או מקש F'; return; }
      const conflict = next && hotkeyCatalog.find((other) => other.id !== command.id && commandHotkey(other, prefs) === next);
      if (conflict) { capture.textContent = `כבר בשימוש: ${conflict.title}`; return; }
      setPref('hotkeys', { ...(prefs.hotkeys || {}), [command.id]: next });
      delete capture.dataset.capturing;
      refresh();
    });
    resetKey.addEventListener('click', () => {
      const next = { ...(prefs.hotkeys || {}) };
      delete next[command.id];
      setPref('hotkeys', next); refresh();
    });
    shortcuts.append(row(command.title, null, control));
  }

  const pages = [appearance, writing, files, shortcuts];
  const nav = el('nav', { class: 'set-nav', 'aria-label': 'נושאי הגדרות' });
  const navItems = [
    ['appearance', 'מראה וערכות', 'palette'], ['writing', 'כתיבה ודף', 'edit'],
    ['files', 'מסמכים וקבצים', 'folder'], ['shortcuts', 'קיצורי מקלדת', 'keyboard'],
  ];
  let activePage = 'appearance';
  const showPage = (name) => {
    activePage = name;
    for (const page of pages) page.hidden = page.dataset.page !== name;
    for (const button of nav.children) {
      const on = button.dataset.page === name;
      button.classList.toggle('on', on); button.setAttribute('aria-current', on ? 'page' : 'false');
    }
  };
  for (const [name, title, iconName] of navItems) {
    const button = el('button', { type: 'button', 'data-page': name, on: { click: () => showPage(name) } });
    button.innerHTML = icon(iconName, 17) + `<span>${title}</span>`;
    nav.append(button);
  }
  const body = el('div', { class: 'set-body' }, nav, el('div', { class: 'set-pages' }, ...pages));
  showPage(activePage);

  const reset = el('button', { type: 'button', on: { click: () => {
    prefs = { ...DEFAULTS, themes: { day: { ...DEFAULT_THEMES.day }, night: { ...DEFAULT_THEMES.night } }, schedule: { ...DEFAULT_SCHEDULE } };
    setPref('version', DEFAULTS.version, { animate: true });
    themes.open();
    refresh();
  } } }, 'איפוס לברירת המחדל');
  // סגירה עם צבעים שלא הוחלו: שואלים בתוך החלון (בלי חלון של Windows)
  const pending = el('div', { class: 'set-pending', hidden: '' },
    el('span', {}, 'יש שינויים בצבעים שעוד לא הוחלו.'),
    el('button', { type: 'button', class: 'primary', on: { click: () => { themes.commit(); pending.hidden = true; dlg.close(); } } }, 'החלה וסגירה'),
    el('button', { type: 'button', on: { click: () => { themes.discard(); pending.hidden = true; dlg.close(); } } }, 'ביטול השינויים'));
  const tryClose = () => {
    if (themes.isDirty()) { pending.hidden = false; pending.querySelector('button').focus(); return; }
    dlg.close();
  };
  const close = el('button', { type: 'button', class: 'primary', on: { click: tryClose } }, 'סגירה');
  const closeBtn = el('button', { type: 'button', class: 'icon-btn', 'data-tip': 'סגירה', 'aria-label': 'סגירה', on: { click: tryClose } });
  closeBtn.innerHTML = icon('close', 18);
  const dlg = el('dialog', { id: 'settings' },
    el('div', { class: 'set-head' }, el('h2', {}, 'הגדרות'), closeBtn),
    body,
    pending,
    el('div', { class: 'set-foot' }, reset, close),
  );
  document.body.append(dlg);
  // Escape ולחיצה בחוץ (המאזין הכללי ב־renderer.js) שולחים cancel: אם יש טיוטה, לא סוגרים ושואלים
  dlg.addEventListener('cancel', (e) => { if (themes.isDirty()) { e.preventDefault(); tryClose(); } });
  dlg.addEventListener('close', () => { pending.hidden = true; });

  function refresh() { for (const fn of refreshers) fn(); themes.refresh(); }
  function open() { pending.hidden = true; themes.open(); refresh(); }
  return { el: dlg, refresh, open };
}
