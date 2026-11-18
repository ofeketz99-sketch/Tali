// הגדרות: מראה, טקסט, הערות וקבצים.
// נשמרות ב־settings.json של האפליקציה (דרך main.js), ומוחלות כמשתני CSS על <html>.
// כדי להוסיף הגדרה: ערך ב־DEFAULTS, החלה ב־applyPrefs, ושורה ב־buildDialog.
import { icon } from './icons.js';
import { updateTheme } from './theme.js';
import { buildThemeSection } from './theme-editor.js';
import { DEFAULT_THEMES, DEFAULT_SCHEDULE, migratePrefs } from './theme-core.js';
import { commandHotkey, eventToHotkey } from './hotkeys.js';
import { normalizeToolbar, toolbarLayoutValue } from './toolbar-layout.js';
import { createToolbarEditor } from './toolbar-editor.js';

export const DEFAULTS = {
  version: 5,
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
  docTitleSize: 26,        // כותרת המסמך שמעל הדף; יכולה להיות גדולה גם מ־H1
  docTitleStyle: 'clean',  // clean | strong | underline | label
  showBacklinks: true,
  newNoteLocation: 'root',  // root | folder (תיקיית מסמכים חדשים) | selected (התיקייה שנבחרה בעץ). 11.0: ברירת המחדל root
  newNoteFolder: 'מסמכים חדשים', // נתיב יחסי לתיקיית העבודה; נוצר בעת הצורך
  attachMode: 'folder',    // folder (תיקייה קבועה) | beside (ליד ההערה)
  attachFolder: 'attachments',
  hotkeys: {},             // command id -> shortcut; empty string disables a shortcut
  completedTasksAtBottom: false,
  smartSymbols: true, // 8.8: -> לחץ, != ל־≠ וכו' בזמן ההקלדה
  mathEnglishKeys: true, // 10.3: בחלונית הנוסחה המקלדת כותבת באנגלית גם כשהיא בעברית
  // 8.0: הקו שמפריד בין משימות פתוחות לשבוצעו (task-layout.js, CompletedDivider)
  doneDividerStyle: 'solid',  // solid | dashed | dotted | double | none
  doneDividerColor: 'muted',  // accent | muted | text (muted = הקו העדין שהיה עד 8.0)
  doneDividerWidth: 1,        // 1–4 פיקסלים
  // 8.2: סרגל הכלים (toolbar-layout.js). ריק = סדר ברירת המחדל, הכול מוצג
  toolbarOrder: [],
  toolbarHidden: [],
  toolbarShown: [], // 8.3: קבוצות רשות (מוסתרות כברירת מחדל) שהמשתמש בחר להציג
  toolbarLayout: null, // 10.4: { sections: [{ items }], known } כשהמשתמש ערך כפתורים בודדים; null = לפי שלושת הקודמים
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
  // 11.0 (לבקשת המשתמש): מסמך חדש לא נכנס יותר לתיקייה שנלחצה בעץ, אלא לתיקייה הראשית. ההגדרה הישנה
  // (selected) הייתה ברירת המחדל עד 10.9, ולכן היא מומרת פעם אחת; אפשר לבחור בה שוב בהגדרות.
  if (saved && (saved.version || 0) < 5 && (saved.newNoteLocation ?? 'selected') === 'selected') saved.newNoteLocation = 'root';
  const migrated = migratePrefs(saved || {});
  prefs = { ...DEFAULTS, ...migrated, version: DEFAULTS.version };
  // 6.3 (main) קרא לתיקיית המסמכים החדשים 'inbox'; מ־6.4 זו האפשרות 'folder' עם תיקייה שניתן לבחור
  if (prefs.newNoteLocation === 'inbox') prefs.newNoteLocation = 'folder';
  applyPrefs();
  if (saved && !saved.themes) window.api.setPrefs(prefs);
}

export function setPref(key, value, { animate = false } = {}) {
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
  root.style.setProperty('--doc-title-size', Math.max(20, Math.min(64, Number(prefs.docTitleSize) || 26)) + 'px');
  root.dataset.docTitleStyle = ['clean', 'strong', 'underline', 'label'].includes(prefs.docTitleStyle) ? prefs.docTitleStyle : 'clean';
  if (prefs.pageLook) delete root.dataset.page; else root.dataset.page = 'flat';
  root.dataset.textdir = prefs.textDir;
  if (prefs.justify) root.dataset.justify = 'on'; else delete root.dataset.justify;
  // 8.7: אותו עיצוב משמש גם לקו --- במסמך וגם לקו של משימות שבוצעו.
  // הצבעים הם משתני ערכה, ולכן מתאימים גם למצב כהה.
  const dividerColors = { accent: 'var(--accent)', muted: 'var(--accent-line)', text: 'var(--muted)' };
  const style = ['solid', 'dashed', 'dotted', 'double', 'none'].includes(prefs.doneDividerStyle) ? prefs.doneDividerStyle : 'solid';
  const width = Math.max(1, Math.min(4, Number(prefs.doneDividerWidth) || 1));
  root.style.setProperty('--done-divider-style', style);
  root.style.setProperty('--done-divider-color', dividerColors[prefs.doneDividerColor] || dividerColors.accent);
  root.style.setProperty('--done-divider-width', (style === 'double' ? Math.max(3, width) : width) + 'px');
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
  dialog.el.focus(); // 10.6: המיקוד על החלון עצמו, ולא טבעת מיקוד על ✕ בכל פתיחה
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { // 8.1: null לא מפיל את חלון ההגדרות
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
// 10.6: כל עמוד בהגדרות מתחיל בכותרת ובשורת הסבר, וההגדרות מקובצות בכרטיסים עם כותרת
function pageHead(title, desc) {
  return el('header', { class: 'set-page-head' }, el('h3', {}, title), desc ? el('p', {}, desc) : '');
}
function card(title, ...kids) {
  return el('div', { class: 'set-card' }, title ? el('h4', { class: 'set-card-title' }, title) : '', ...kids);
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

  const folderInput = el('input', { type: 'text', placeholder: 'attachments', 'aria-label': 'תיקיית קבצים מצורפים', on: {
    change: () => { setPref('attachFolder', folderInput.value.trim() || DEFAULTS.attachFolder); refresh(); },
  } });
  const attachFolderStatus = el('small', { class: 'set-folder-status', 'aria-live': 'polite' });
  const attachFolderPick = el('button', { type: 'button' }, 'בחירה…');
  const attachFolderOpen = el('button', { type: 'button' }, 'פתיחה');
  attachFolderPick.addEventListener('click', async () => {
    attachFolderPick.disabled = true;
    attachFolderStatus.textContent = '';
    attachFolderStatus.classList.remove('error');
    try {
      const picked = await window.api.pickAttachmentFolder();
      if (picked == null) return;
      setPref('attachFolder', picked || '.');
      attachFolderStatus.textContent = 'המיקום החדש נשמר. קבצים חדשים יישמרו כאן.';
      refresh();
    } catch (err) {
      attachFolderStatus.textContent = err.message || 'לא ניתן לבחור את התיקייה.';
      attachFolderStatus.classList.add('error');
    } finally { attachFolderPick.disabled = prefs.attachMode !== 'folder'; }
  });
  attachFolderOpen.addEventListener('click', async () => {
    attachFolderOpen.disabled = true;
    attachFolderStatus.textContent = '';
    attachFolderStatus.classList.remove('error');
    try {
      const dir = await window.api.prepareAttachmentFolder(prefs.attachFolder);
      await window.api.openPath(dir);
    } catch (err) {
      attachFolderStatus.textContent = err.message || 'לא ניתן לפתוח את התיקייה.';
      attachFolderStatus.classList.add('error');
    } finally { attachFolderOpen.disabled = prefs.attachMode !== 'folder'; }
  });
  const attachFolderControl = el('div', { class: 'set-folder-control' },
    el('div', { class: 'set-folder-line' }, folderInput, attachFolderPick, attachFolderOpen), attachFolderStatus);
  bind(() => {
    const enabled = prefs.attachMode === 'folder';
    folderInput.value = prefs.attachFolder;
    folderInput.disabled = !enabled;
    attachFolderPick.disabled = !enabled;
    attachFolderOpen.disabled = !enabled;
    if (!enabled) attachFolderStatus.textContent = '';
    attachFolderStatus.classList.remove('error');
  });
  const noteFolderInput = el('input', { type: 'text', readonly: '', 'aria-label': 'תיקיית מסמכים חדשים' });
  const noteFolderStatus = el('small', { class: 'set-folder-status', 'aria-live': 'polite' });
  const noteFolderPick = el('button', { type: 'button' }, 'בחירה…');
  noteFolderPick.addEventListener('click', async () => {
    noteFolderPick.disabled = true;
    noteFolderStatus.textContent = '';
    try {
      const picked = await window.api.pickNewNoteFolder();
      if (picked == null) return;
      setPref('newNoteFolder', picked);
      noteFolderStatus.textContent = 'התיקייה נבחרה ונבדקה.';
      refresh();
    } catch (err) {
      noteFolderStatus.textContent = err.message || 'לא ניתן לבחור את התיקייה.';
      noteFolderStatus.classList.add('error');
    } finally {
      noteFolderPick.disabled = prefs.newNoteLocation !== 'folder';
    }
  });
  const noteFolderControl = el('div', { class: 'set-folder-control' },
    el('div', { class: 'set-folder-line' }, noteFolderInput, noteFolderPick), noteFolderStatus);
  bind(() => {
    const enabled = prefs.newNoteLocation === 'folder';
    noteFolderInput.value = prefs.newNoteFolder || 'התיקייה הראשית';
    noteFolderInput.disabled = !enabled;
    noteFolderPick.disabled = !enabled;
    if (!enabled) noteFolderStatus.textContent = '';
    noteFolderStatus.classList.remove('error');
  });

  const appearance = el('section', { class: 'set-page', 'data-page': 'appearance' },
    pageHead('מראה וערכות', 'ערכת יום וערכת לילה נפרדות. שינוי צבע מוצג מיד, ונשמר רק ב"החלה".'),
    ...themes.nodes);
  const writing = el('section', { class: 'set-page', 'data-page': 'writing', hidden: '' },
    pageHead('כתיבה ודף', 'איך הטקסט והדף נראים בכל המסמכים.'),
    card('טקסט',
      row('גופן', null, fontSelect),
      row('גופן כותרות', null, headingSelect),
      row('גודל', null, range('fontSize', 13, 24, 1, (v) => v + 'px')),
      row('מרווח שורות', null, range('lineHeight', 1.3, 2.2, 0.05, (v) => Number(v).toFixed(2))),
      row('כיוון הטקסט', 'אוטומטי: כל פסקה לפי השפה שבה היא מתחילה', seg('textDir', [['rtl', 'ימין לשמאל'], ['auto', 'אוטומטי'], ['ltr', 'שמאל לימין']])),
      row('יישור לשני הצדדים', 'כמו בעיתון: השורות נמתחות עד הקצה', check('justify')),
      el('div', { class: 'preview' },
        el('div', { style: 'font-family:var(--font-heading);font-weight:700;font-size:1.3em;margin-bottom:4px' }, 'כותרת לדוגמה'),
        'כך ייראה הטקסט במסמכים. The quick brown fox jumps over the lazy dog.')),
    card('דף',
      row('רוחב הדף', null, seg('pageWidth', [['narrow', 'צר'], ['normal', 'רגיל'], ['wide', 'רחב'], ['full', 'מלא']])),
      row('מראה דף', 'דף עם צל, כמו במסמך Word', check('pageLook'))),
    card('שם המסמך מעל הדף',
      row('גודל', 'אפשר להגדיל גם מעבר לכותרת H1', range('docTitleSize', 20, 64, 1, (v) => v + 'px')),
      row('סגנון', null, seg('docTitleStyle', [['clean', 'נקי'], ['strong', 'מודגש'], ['underline', 'קו צבע'], ['label', 'תווית']])),
      el('div', { class: 'preview preview-title' }, el('div', { class: 'doc-title-preview' }, 'שם המסמך לדוגמה'))),
    card('הקלדה',
      row('סימנים חכמים', 'בזמן ההקלדה: ‎-> ‎<- ‎=> ‎!= ‎>= ‎<= ‎+-‎ הופכים לחץ ולסימן המתאים. Backspace מיד אחרי מחזיר', check('smartSymbols')),
      row('אנגלית בחלונית הנוסחה', 'בתיבת ה־LaTeX כל מקש כותב את התו שלו במקלדת אנגלית, גם כשהמקלדת בעברית. שפת המקלדת עצמה לא משתנה', check('mathEnglishKeys'))),
    card('משימות וקו מפריד',
      row('משימות שבוצעו בסוף הרשימה', 'תיבה שסומנה עוברת, עם תנועה וקו מפריד, לסוף הרשימה שלה', check('completedTasksAtBottom')),
      row('סגנון הקו', 'לקו --- במסמך ולקו שבין משימות פתוחות למשימות שבוצעו', seg('doneDividerStyle', [['solid', 'רציף'], ['dashed', 'מקווקו'], ['dotted', 'נקודות'], ['double', 'כפול'], ['none', 'בלי']])),
      row('צבע הקו', null, seg('doneDividerColor', [['accent', 'צבע הערכה'], ['muted', 'עדין'], ['text', 'אפור כהה']])),
      row('עובי הקו', null, range('doneDividerWidth', 1, 4, 1, (v) => v + 'px')),
      el('div', { class: 'preview done-divider-preview' }, el('div', {}, 'משימה פתוחה'), el('div', { class: 'ddp-line' }), el('div', { style: 'opacity:.6' }, 'משימה שבוצעה'))),
  );
  const files = el('section', { class: 'set-page', 'data-page': 'files', hidden: '' },
    pageHead('מסמכים וקבצים', 'איפה נשמרים מסמכים חדשים ותמונות. כל הנתיבים בתוך תיקיית המסמכים.'),
    card('מסמכים חדשים',
      row('מסמך חדש נוצר', 'גם מסמך גרפי. "מסמך חדש בתיקייה" בלחיצה ימנית על תיקייה נכנס תמיד לאותה תיקייה', select('newNoteLocation', [
        ['root', 'בתיקייה הראשית'],
        ['folder', 'בתיקיית מסמכים חדשים'],
        ['selected', 'בתיקייה שנלחצה לאחרונה בעץ'],
      ], { onChange: refresh })),
      row('תיקיית מסמכים חדשים', 'נוצרת אוטומטית אם חסרה', noteFolderControl)),
    card('תמונות וקבצים מצורפים',
      row('תמונות מיובאות נשמרות', null, select('attachMode', [['folder', 'בתיקייה קבועה'], ['beside', 'ליד המסמך']], { onChange: refresh })),
      row('תיקיית הקבצים המצורפים', 'נתיב בתוך הכספת. נוצרת אוטומטית אם חסרה', attachFolderControl)),
  );

  const shortcutList = card(null);
  const shortcuts = el('section', { class: 'set-page set-shortcuts', 'data-page': 'shortcuts', hidden: '' },
    pageHead('קיצורי מקלדת', 'לחיצה על קיצור ואז הקלדת קיצור חדש. Backspace מבטל קיצור, והחץ המעוגל מחזיר לברירת המחדל.'),
    shortcutList);
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
    shortcutList.append(row(command.title, null, control));
  }

  // 10.8: עורך הסרגל בגרירה עם תנועה (toolbar-editor.js). כל שינוי מוחל מיד (renderer.js → toolbarApi.applyLayout)
  const toolbarEditor = createToolbarEditor({ icon, getSections: () => normalizeToolbar(prefs), save: (sections) => setPref('toolbarLayout', toolbarLayoutValue(sections)) });
  const drawToolbarList = bind(toolbarEditor.draw);
  const toolbarReset = el('button', { type: 'button', class: 'set-link-btn', on: { click: () => {
    setPref('toolbarOrder', []); setPref('toolbarHidden', []); setPref('toolbarShown', []); setPref('toolbarLayout', null); toolbarEditor.redraw();
  } } }, 'החזרה לברירת המחדל');
  const toolbarPage = el('section', { class: 'set-page', 'data-page': 'toolbar', hidden: '' },
    pageHead('סרגל הכלים', 'הכול בגרירה. כפתור: לתוך קבוצה, או בין שתי קבוצות כדי לפתוח קבוצה חדשה. קבוצה (בידית ⋮⋮): לקצה של קבוצה אחרת כדי להזיז, או לאמצע שלה כדי לאחד.'),
    card(null, el('div', { class: 'set-card-head' }, el('h4', { class: 'set-card-title' }, 'כך ייראה הסרגל'), toolbarReset), toolbarEditor.preview),
    card('הקבוצות בסרגל, מימין לשמאל', toolbarEditor.list),
    card('כפתורים שלא בסרגל', el('p', { class: 'set-note' }, 'גוררים לסרגל, או לוחצים כדי להוסיף בסוף. גרירה לכאן מוציאה כפתור מהסרגל.'), toolbarEditor.pool));

  const pages = [appearance, writing, files, toolbarPage, shortcuts];
  const nav = el('nav', { class: 'set-nav', 'aria-label': 'נושאי הגדרות' });
  const navItems = [
    ['appearance', 'מראה וערכות', 'palette'], ['writing', 'כתיבה ודף', 'edit'],
    ['files', 'מסמכים וקבצים', 'folder'], ['toolbar', 'סרגל הכלים', 'more'], ['shortcuts', 'קיצורי מקלדת', 'keyboard'],
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
  const reset = el('button', { type: 'button', class: 'set-link-btn set-reset-all', on: { click: () => {
    prefs = { ...DEFAULTS, themes: { day: { ...DEFAULT_THEMES.day }, night: { ...DEFAULT_THEMES.night } }, schedule: { ...DEFAULT_SCHEDULE } };
    setPref('version', DEFAULTS.version, { animate: true });
    themes.open();
    refresh();
  } } }, 'איפוס כל ההגדרות');
  // 10.6: בלי שורה תחתונה. האיפוס הכללי בתחתית הניווט, והסגירה ב־✕ שבראש החלון (כפתור "סגירה" שני הוסר)
  nav.append(el('span', { class: 'set-nav-spacer' }), reset);
  const body = el('div', { class: 'set-body' }, nav, el('div', { class: 'set-pages' }, ...pages));
  showPage(activePage);
  // סגירה עם צבעים שלא הוחלו: שואלים בתוך החלון (בלי חלון של Windows)
  const pending = el('div', { class: 'set-pending', hidden: '' },
    el('span', {}, 'יש שינויים בצבעים שעוד לא הוחלו.'),
    el('button', { type: 'button', class: 'primary', on: { click: () => { themes.commit(); pending.hidden = true; dlg.close(); } } }, 'החלה וסגירה'),
    el('button', { type: 'button', on: { click: () => { themes.discard(); pending.hidden = true; dlg.close(); } } }, 'ביטול השינויים'));
  const tryClose = () => {
    if (themes.isDirty()) { pending.hidden = false; pending.querySelector('button').focus(); return; }
    dlg.close();
  };
  const closeBtn = el('button', { type: 'button', class: 'icon-btn', 'data-tip': 'סגירה', 'aria-label': 'סגירה', on: { click: tryClose } });
  closeBtn.innerHTML = icon('close', 18);
  const dlg = el('dialog', { id: 'settings', tabindex: '-1' },
    el('div', { class: 'set-head' }, el('h2', {}, 'הגדרות'), closeBtn),
    body,
    pending,
  );
  document.body.append(dlg);
  // Escape ולחיצה בחוץ (המאזין הכללי ב־renderer.js) שולחים cancel: אם יש טיוטה, לא סוגרים ושואלים
  dlg.addEventListener('cancel', (e) => { if (themes.isDirty()) { e.preventDefault(); tryClose(); } });
  dlg.addEventListener('close', () => { pending.hidden = true; });

  function refresh() { for (const fn of refreshers) fn(); themes.refresh(); }
  function open() { pending.hidden = true; themes.open(); refresh(); }
  return { el: dlg, refresh, open };
}

