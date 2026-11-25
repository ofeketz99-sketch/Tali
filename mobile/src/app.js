// TALI Mobile: אפליקציית Companion לטלפון. ראו mobile/README.md.
// משתמשת באותו מנוע מסמכים כמו הדסקטופ (createEditor, שכבת השרטוט, שמירה נאמנה לאובסידיאן),
// כדי שמסמך שנפתח ונשמר בטלפון יישאר זהה בתוכן שהטלפון לא נוגע בו.
import { createEditor } from '../../src/editor.js';
import { createPageOverlay } from '../../src/page-overlay.js';
import { createEditActions } from '../../src/edit-actions.js';
import { icon, lucide } from '../../src/icons.js';
import { deriveVars, PRESETS } from '../../src/theme-core.js';
import { resolveLink } from '../../links.js';
import { withCreated, extractTags } from '../../vault-data.js';
import { vault, meta, localForSync, isNotePath, hashData } from './store.js';
import { importPlan, SKIP_REASON, decodeText, docxToMarkdown, freePath } from './import-file.js';
import { runSync } from './sync-core.js';
import { connectedRemote, remoteLabel, setRemote, memoryRemote } from './remotes.js';
import { driveRemote, listFolders } from './drive.js';
import { createDriveAuth } from './drive-auth.js';
import {
  MOBILE_PREFS_KEY, DEFAULT_MOBILE_PREFS, LEADING,
  normalizeMobilePrefs, colorsForMobilePrefs, mobileThemeLabel,
} from './preferences.js';

const $ = (id) => document.getElementById(id);
const state = {
  files: [],          // כל הרשומות החיות
  folder: '',         // התיקייה שמוצגת ברשימה
  current: null,      // הנתיב של המסמך הפתוח
  dirty: false,
  query: '',
  lastOpen: null,
};
const blobUrls = new Map(); // נתיב קובץ מצורף -> כתובת blob:

// ===== מראה ותצוגה: נשמרים מקומית ומוחלים מיד =====
function readMobilePrefs() {
  try { return normalizeMobilePrefs(JSON.parse(localStorage.getItem(MOBILE_PREFS_KEY) || 'null')); }
  catch { return { ...DEFAULT_MOBILE_PREFS }; }
}
let mobilePrefs = readMobilePrefs();
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function paintTheme() {
  const { vars, dark } = deriveVars(colorsForMobilePrefs(mobilePrefs, darkQuery.matches));
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.setProperty('--m-editor-size', `${mobilePrefs.fontSize}px`);
  root.style.setProperty('--m-editor-leading', LEADING[mobilePrefs.leading]);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
  document.body.dataset.density = mobilePrefs.density;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--panel-bg']);
}
function saveMobilePrefs(next) {
  mobilePrefs = normalizeMobilePrefs({ ...mobilePrefs, ...next });
  try { localStorage.setItem(MOBILE_PREFS_KEY, JSON.stringify(mobilePrefs)); } catch { /* ההעדפה נשארת עד הרענון */ }
  paintTheme();
  renderAppearanceControls();
}
paintTheme();
darkQuery.addEventListener('change', () => { if (mobilePrefs.theme === 'system') paintTheme(); });

// ===== עזרים =====
const baseName = (p) => p.split('/').pop();
const noteName = (p) => baseName(p).replace(/\.md$/i, '');
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const notes = () => state.files.filter((f) => isNotePath(f.path));
const notePaths = () => notes().map((f) => f.path);
const resolve = (target) => {
  const t = String(target || '').split('#')[0].split('|')[0].trim();
  if (!t) return null;
  const files = state.files.map((f) => f.path);
  const withExt = /\.[a-z0-9]+$/i.test(t) ? t : t + '.md';
  return resolveLink(withExt, files, '') || resolveLink(t, files, '');
};
// שאלה בגיליון תחתון. עם value: שדה שם, ומחזיר את הטקסט (או null). בלי: אישור, ומחזיר true/false.
// prompt/confirm של הדפדפן חוסמים, נראים זרים, ובחלק מהמעטפות (Capacitor, תצוגה מקדימה) לא קיימים.
// info: הסבר בלבד, עם כפתור אחד (בלי "ביטול").
function ask({ title, value, ok = 'אישור', danger = false, info = false }) {
  const dlg = $('mAsk'), input = $('mAskInput'), okBtn = $('mAskOk');
  const withInput = value !== undefined;
  $('mAskTitle').textContent = title;
  $('mAskCancel').hidden = info;
  okBtn.textContent = ok;
  okBtn.classList.toggle('danger', danger);
  input.hidden = !withInput;
  input.value = withInput ? value : '';
  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      if (dlg.open) dlg.close();
      resolve(result);
    };
    // Esc / "חזרה". לא 'close': אירוע close של שאלה קודמת מגיע באיחור ומבטל את השאלה החדשה.
    dlg.oncancel = (e) => { e.preventDefault(); finish(withInput ? null : false); };
    okBtn.onclick = (e) => {
      e.preventDefault();
      if (!withInput) return finish(true);
      const text = input.value.trim();
      finish(text || null);
    };
    $('mAskCancel').onclick = () => finish(withInput ? null : false);
    dlg.onclick = (e) => { if (e.target === dlg) finish(withInput ? null : false); };
    dlg.showModal();
    if (withInput) { input.focus(); input.select(); }
  });
}

function toast(text, ms = 2600) {
  const el = $('mToast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, ms);
}
const fmtTime = (ms) => {
  const d = new Date(ms);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
};
function setIcon(el, name, size = 20) { el.innerHTML = icon(name, size); }

async function loadFiles() {
  state.files = await vault.list({ includeDeleted: false });
  state.lastOpen = await meta.get('lastOpen');
  for (const f of state.files) {
    if (f.data instanceof Blob && !blobUrls.has(f.path)) blobUrls.set(f.path, URL.createObjectURL(f.data));
  }
  await updateSyncBadge();
}

// ===== תמונות: העורך של הדסקטופ מצייר file:///נתיב; בטלפון מחליפים בכתובת blob מהכספת המקומית =====
const fileUrlPath = (src) => { try { return decodeURIComponent(src.replace(/^file:\/\/\//, '').split('?')[0]); } catch { return null; } };
function fixImages(root) {
  for (const img of root.querySelectorAll('img[src^="file:"]')) {
    const url = blobUrls.get(fileUrlPath(img.src));
    if (url) img.src = url;
  }
}
const localSrc = (src) => {
  if (/^(https?:|data:|blob:)/i.test(src)) return [src];
  let rel = src;
  try { rel = decodeURI(src); } catch { /* כמו שהוא */ }
  rel = rel.replace(/^\.?\//, '');
  const dir = state.current ? dirOf(state.current) : '';
  return [dir ? `${dir}/${rel}` : rel, rel].map((p) => blobUrls.get(p)).filter(Boolean);
};

// ===== רשימת המסמכים =====
function folderChildren(folder) {
  const prefix = folder ? folder + '/' : '';
  const dirs = new Set();
  const docs = [];
  for (const f of notes()) {
    if (!f.path.startsWith(prefix)) continue;
    const rest = f.path.slice(prefix.length);
    if (rest.includes('/')) dirs.add(rest.split('/')[0]);
    else docs.push(f);
  }
  return { dirs: [...dirs].sort((a, b) => a.localeCompare(b, 'he')), docs: docs.sort((a, b) => b.mtime - a.mtime) };
}

function row({ iconName, title, sub, onClick, cls = '' }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'm-row ' + cls;
  b.innerHTML = `<span class="m-row-icon">${icon(iconName, 20)}</span><span class="m-row-text"><span class="m-row-title"></span><span class="m-row-sub"></span></span>`;
  b.querySelector('.m-row-title').textContent = title;
  b.querySelector('.m-row-sub').textContent = sub || '';
  b.addEventListener('click', onClick);
  return b;
}

function snippet(text, q) {
  const body = String(text || '').replace(/^---[\s\S]*?\n---\n?/, '').replace(/<!-- TALI-OVERLAY[\s\S]*?-->/, '');
  if (!q) return body.replace(/[#>*_`[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);
  const i = body.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return '';
  return '…' + body.slice(Math.max(0, i - 30), i + 60).replace(/\s+/g, ' ') + '…';
}

function renderList() {
  const list = $('mList');
  list.innerHTML = '';
  const q = state.query.trim();
  $('mCrumb').hidden = !!q || !state.folder;
  $('mCrumbText').textContent = state.folder || '';
  if (q) {
    const lower = q.toLowerCase();
    const byName = notes().filter((f) => noteName(f.path).toLowerCase().includes(lower));
    const byText = notes().filter((f) => !byName.includes(f) && typeof f.data === 'string' && f.data.toLowerCase().includes(lower));
    for (const f of [...byName, ...byText]) {
      list.append(row({ iconName: 'file', title: noteName(f.path), sub: byName.includes(f) ? dirOf(f.path) || 'התיקייה הראשית' : snippet(f.data, q), onClick: () => openNote(f.path) }));
    }
    if (!list.children.length) list.append(empty('לא נמצאו מסמכים'));
    return;
  }
  const { dirs, docs } = folderChildren(state.folder);
  const promoted = new Set();
  // במסך הראשי: המסמך האחרון והמסמכים האחרונים לפני המבנה המלא.
  if (!state.folder && state.lastOpen && notes().some((f) => f.path === state.lastOpen)) {
    const last = notes().find((f) => f.path === state.lastOpen);
    const head = document.createElement('div');
    head.className = 'm-section';
    head.textContent = 'נפתח לאחרונה';
    list.append(head);
    list.append(row({
      iconName: 'history', title: noteName(last.path),
      sub: `${fmtTime(last.mtime)} · ${snippet(last.data) || 'המסמך האחרון שפתחתם'}`,
      cls: 'is-continue', onClick: () => openNote(last.path),
    }));
    promoted.add(last.path);
  }
  // בתיקייה הראשית: האחרונים שנערכו קודם (גישה מהירה, זה עיקר השימוש בטלפון)
  if (!state.folder && notes().length > 3) {
    const head = document.createElement('div');
    head.className = 'm-section';
    head.textContent = 'אחרונים';
    list.append(head);
    for (const f of [...notes()].sort((a, b) => b.mtime - a.mtime).filter((f) => f.path !== state.lastOpen).slice(0, 4)) {
      list.append(row({ iconName: 'history', title: noteName(f.path), sub: `${fmtTime(f.mtime)} · ${dirOf(f.path) || 'התיקייה הראשית'}`, onClick: () => openNote(f.path) }));
      promoted.add(f.path);
    }
    if (dirs.length || docs.some((f) => !promoted.has(f.path))) {
      const all = document.createElement('div');
      all.className = 'm-section';
      all.textContent = 'מסמכים נוספים';
      list.append(all);
    }
  }
  for (const d of dirs) {
    const path = state.folder ? `${state.folder}/${d}` : d;
    const count = notes().filter((f) => f.path.startsWith(path + '/')).length;
    list.append(row({ iconName: 'folder', title: d, sub: `${count} מסמכים`, cls: 'is-folder', onClick: () => { state.folder = path; renderList(); } }));
  }
  for (const f of docs) {
    if (!state.folder && promoted.has(f.path)) continue;
    list.append(row({ iconName: 'file', title: noteName(f.path), sub: `${fmtTime(f.mtime)} · ${snippet(f.data)}`, onClick: () => openNote(f.path) }));
  }
  if (!list.children.length) list.append(empty(notes().length ? 'התיקייה ריקה' : 'אין עדיין מסמכים.'));
}
function empty(text) {
  const p = document.createElement('p');
  p.className = 'm-empty';
  p.textContent = text;
  return p;
}

// ===== עורך =====
let saveTimer = null;
const noteChanged = () => {
  if (!state.current) return;
  state.dirty = true;
  $('mSaveDot').dataset.state = 'dirty';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 700);
};
async function saveNow() {
  clearTimeout(saveTimer);
  if (!state.current || !state.dirty) return;
  const path = state.current;
  state.dirty = false;
  try {
    await vault.write(path, editorApi.getMarkdown());
    $('mSaveDot').dataset.state = 'saved';
    await loadFiles();
    scheduleAutoSync();
  } catch (error) {
    state.dirty = true;
    $('mSaveDot').dataset.state = 'error';
    toast('השמירה בטלפון נכשלה: ' + (error?.message || error));
  }
}

const editorApi = createEditor({
  element: $('editor'),
  rawElement: $('raw'),
  propsElement: $('props'),
  onChange: noteChanged,
  links: {
    getNotes: () => notePaths().filter((p) => p !== state.current).map((path) => ({ path, name: noteName(path) })),
    resolve,
    onOpen: (target) => openLink(target),
    onLinked: () => {},
    onEditDrawing: () => toast('עריכת ציור שמור: במחשב'),
    localSrc,
    read: async (p) => (await vault.get(p))?.data || '',
    onTag: (tag) => { closeNote(); $('mSearch').value = '#' + tag; state.query = '#' + tag; renderList(); },
  },
  onImageFiles: (files) => addImages(files),
});
const actions = createEditActions(editorApi.editor, {});

// כפתור השרטוט: השכבה (page-overlay.js) מסיימת את הסשן בלחיצה מחוץ לדף כבר ב־pointerdown (window, capture),
// ולכן המצב נקרא במאזין שנרשם לפניה, על אותו window
let drawWasOn = false;
window.addEventListener('pointerdown', (e) => {
  if (e.target.closest?.('.m-tool[data-tool="draw"]')) drawWasOn = overlay.inSession();
}, true);
const overlay = createPageOverlay({
  page: $('page'),
  onChange: noteChanged,
  resolveImage: (o) => {
    const p = o.ref === 'embed' ? resolve(o.src) : o.src;
    return localSrc(p || o.src);
  },
  onTextClick: () => setDrawing(false),
  onReturnImage: () => false,
});
editorApi.setOverlayController(overlay);

// נוסחאות: בטלפון לקריאה בלבד (האפיון). לחיצה על נוסחה לא פותחת את חלונית העריכה של הדסקטופ.
$('editor').addEventListener('click', (e) => {
  if (e.target.closest('.math-inline, .katex, [data-type="math"], .raw-html-block')) { e.stopPropagation(); e.preventDefault(); toast('נוסחה: עריכה במחשב'); }
}, true);
$('editor').addEventListener('mousedown', (e) => {
  if (e.target.closest('.math-inline, .katex')) { e.stopPropagation(); e.preventDefault(); }
}, true);

new MutationObserver(() => fixImages($('page'))).observe($('page'), { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });

async function openNote(path) {
  await saveNow();
  const rec = await vault.get(path);
  if (!rec || rec.deleted) { toast('המסמך לא נמצא'); return; }
  state.current = path;
  state.dirty = false;
  setDrawing(false);
  $('mTitle').textContent = noteName(path);
  $('mSaveDot').dataset.state = 'saved';
  document.body.dataset.view = 'note';
  editorApi.setMarkdown(typeof rec.data === 'string' ? rec.data : '');
  overlay.setEnabled(true);
  $('pageWrap').scrollTop = 0;
  history.pushState({ note: path }, '', '#' + encodeURIComponent(path));
  await meta.set('lastOpen', path);
}
async function openLink(target) {
  const p = resolve(target);
  if (p && isNotePath(p)) { openNote(p); return; }
  if (p) { toast('קובץ מצורף: פתיחה במחשב'); return; }
  const name = String(target).split('#')[0].split('|')[0].trim();
  if (name && await ask({ title: `ליצור את המסמך "${name}"?`, ok: 'יצירה' })) await createNote(name);
}
async function closeNote({ fromHistory = false } = {}) {
  await saveNow();
  setDrawing(false);
  overlay.setEnabled(false);
  state.current = null;
  document.body.dataset.view = 'list';
  $('mTitle').textContent = 'Tali';
  editorApi.editor.commands.blur();
  if (!fromHistory && location.hash) history.back();
  renderList();
}
window.addEventListener('popstate', () => { if (state.current) closeNote({ fromHistory: true }); });

async function createNote(name) {
  const clean = String(name || '').replace(/[\\/:*?"<>|#^[\]]/g, '').trim();
  if (!clean) return;
  let path = (state.folder ? state.folder + '/' : '') + clean + '.md';
  for (let i = 1; state.files.some((f) => f.path === path); i++) path = (state.folder ? state.folder + '/' : '') + `${clean} ${i}.md`;
  await vault.write(path, withCreated(''));
  await loadFiles();
  await openNote(path);
  editorApi.editor.commands.focus('end');
}

async function createQuickNote() {
  const now = new Date();
  const date = new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit' }).format(now);
  const time = `${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`;
  const stamp = `${date} · ${time}`;
  await createNote(`פתק ${stamp}`);
  editorApi.editor.commands.focus('end');
}

// ===== סרגל עריכה בתחתית (מעל המקלדת) =====
const headingCycle = () => {
  const ed = editorApi.editor;
  const level = [1, 2, 3].find((l) => ed.isActive('heading', { level: l }));
  if (!level) actions.heading(2); else if (level === 2) actions.heading(3); else if (level === 3) actions.paragraph(); else actions.heading(2);
};
const TOOLS = [
  ['undo', 'ביטול', () => editorApi.editor.chain().focus().undo().run()],
  ['redo', 'חזרה', () => editorApi.editor.chain().focus().redo().run()],
  ['bold', 'מודגש', () => actions.bold(), 'bold'],
  ['italic', 'נטוי', () => actions.italic(), 'italic'],
  ['underline', 'קו תחתון', () => actions.underline(), 'underline'],
  ['paragraph', 'כותרת', headingCycle, 'heading'],
  ['bullets', 'רשימה', () => actions.bulletList(), 'bulletList'],
  ['tasks', 'משימות', () => actions.taskList(), 'taskList'],
  ['highlight', 'מרקר', () => editorApi.editor.chain().focus().toggleHighlight({ color: '#fff3a3' }).run(), 'highlight'],
  ['table', 'טבלה', () => actions.table(3, 2)],
  ['draw', 'שרטוט', () => setDrawing(!drawWasOn)],
];
const toolButtons = [];
for (const [name, label, run, active] of TOOLS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'm-tool';
  b.setAttribute('aria-label', label);
  setIcon(b, name, 20);
  // לא לוקח את הפוקוס מהעורך, אחרת המקלדת נסגרת בכל לחיצה
  b.dataset.tool = name;
  b.addEventListener('pointerdown', (e) => e.preventDefault());
  b.addEventListener('click', () => { run(); refreshTools(); });
  $('mTools').append(b);
  toolButtons.push([b, active, name]);
}
function refreshTools() {
  const ed = editorApi.editor;
  for (const [b, active, name] of toolButtons) {
    const on = name === 'draw' ? overlay.inSession() : active ? ed.isActive(active) : false;
    b.classList.toggle('on', on);
  }
}
editorApi.editor.on('selectionUpdate', refreshTools);
editorApi.editor.on('transaction', refreshTools);

// ===== שרטוט במגע: שכבת הדף של הדסקטופ (אותו פורמט בקובץ), עם כלים גדולים לאצבע =====
function setDrawing(on) {
  if (on) { editorApi.editor.commands.blur(); overlay.setMode('pen'); }
  else if (overlay.inSession()) document.querySelector('.tali-overlay-done')?.click(); // endSession של השכבה
  syncDrawing();
}
// השכבה יכולה לסיים את הסשן בעצמה (כפתור "סיום", Esc): המצב בטלפון נגזר ממנה
function syncDrawing() {
  document.body.classList.toggle('m-drawing', overlay.inSession());
  refreshTools();
}
const overlayRoot = $('page').querySelector('.tali-page-overlay');
if (overlayRoot) new MutationObserver(syncDrawing).observe(overlayRoot, { attributes: true, attributeFilter: ['class', 'data-mode'] });

// ===== תמונות: נשמרות בכספת המקומית ונכנסות כ־![[שם]] =====
async function addImages(files) {
  for (const file of files) {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const path = `attachments/Pasted image ${stamp}.${ext}`;
    await vault.write(path, file);
    blobUrls.set(path, URL.createObjectURL(file));
    editorApi.editor.chain().focus().insertContent(`![[${baseName(path)}]]`).run();
  }
  await loadFiles();
}

// ===== ייבוא וייצוא (עד שיחובר סנכרון) =====
async function importFiles(list) {
  const taken = new Set(state.files.map((f) => f.path));
  const done = [], skipped = [];
  for (const file of list) {
    const rel = (file.webkitRelativePath || file.name).split('/');
    if (file.webkitRelativePath) rel.shift(); // שם התיקייה שנבחרה עצמה
    const plan = importPlan(rel.join('/'), file.type);
    if (plan.skip) { if (plan.skip !== 'hidden') skipped.push(`${file.name}: ${SKIP_REASON[plan.skip]}`); continue; }
    try {
      let data;
      if (plan.kind === 'text') data = decodeText(await file.arrayBuffer());
      else if (plan.kind === 'docx') data = await docxToMarkdown(await file.arrayBuffer());
      else data = file;
      if (typeof data === 'string' && isNotePath(plan.path)) data = data.replace(/\r\n?/g, '\n');
      const path = freePath(plan.path, taken);
      taken.add(path);
      await vault.write(path, data);
      done.push(path);
    } catch (error) {
      console.warn('import failed', file.name, error);
      skipped.push(`${file.name}: לא הצלחתי לקרוא את הקובץ`);
    }
  }
  await loadFiles();
  renderList();
  if (done.length) scheduleAutoSync();
  const opened = done.filter(isNotePath);
  if (skipped.length) {
    await ask({ info: true, ok: 'הבנתי', title: (done.length ? (done.length === 1 ? 'יובא קובץ אחד. לא יובא: ' : `יובאו ${done.length} קבצים. לא יובאו: `) : 'לא יובא: ') + skipped.join(' · ') });
  } else if (!done.length) toast('לא נבחר קובץ');
  else toast(done.length === 1 ? `יובא: ${noteName(done[0])}` : `יובאו ${done.length} קבצים`);
  if (opened.length === 1) openNote(opened[0]);
}
async function exportCurrent() {
  if (!state.current) return;
  await saveNow();
  const text = editorApi.getMarkdown();
  const file = new File([text], baseName(state.current), { type: 'text/markdown' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: noteName(state.current) }); return; } catch { /* בוטל */ } }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
}

const blobAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error || new Error('לא ניתן לקרוא את הקובץ'));
  reader.readAsDataURL(blob);
});
function dataUrlAsBlob(value) {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(value);
  if (!match) throw new Error('קובץ מצורף לא תקין בגיבוי');
  const bytes = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
  const array = Uint8Array.from(bytes, (char) => char.charCodeAt(0));
  return new Blob([array], { type: match[1] || 'application/octet-stream' });
}

async function shareOrDownload(file, title) {
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return true; } catch (error) {
      if (error?.name === 'AbortError') return false;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}

async function exportBackup() {
  $('mSheet').close();
  await saveNow();
  const files = [];
  for (const record of state.files) {
    if (typeof record.data === 'string') files.push({ path: record.path, kind: 'text', data: record.data });
    else if (record.data instanceof Blob) files.push({ path: record.path, kind: 'blob', type: record.data.type, data: await blobAsDataUrl(record.data) });
  }
  const backup = { format: 'tali-mobile-backup', version: 1, createdAt: new Date().toISOString(), files };
  const day = new Date().toISOString().slice(0, 10);
  const file = new File([JSON.stringify(backup)], `Tali-backup-${day}.json`, { type: 'application/json' });
  if (await shareOrDownload(file, 'גיבוי Tali')) toast(`יוצא גיבוי עם ${files.length} קבצים`);
}

async function importBackup(file) {
  $('mSheet').close();
  let backup;
  try { backup = JSON.parse(await file.text()); } catch { toast('קובץ הגיבוי אינו JSON תקין'); return; }
  if (backup?.format !== 'tali-mobile-backup' || backup.version !== 1 || !Array.isArray(backup.files)) {
    toast('זה לא קובץ גיבוי של Tali');
    return;
  }
  if (!await ask({ title: `לשחזר ${backup.files.length} קבצים? קבצים בעלי אותו שם יעודכנו.`, ok: 'שחזור' })) return;
  let count = 0;
  for (const item of backup.files) {
    const path = String(item?.path || '').replace(/^\/+/, '');
    if (!path || path.split('/').some((part) => !part || part === '..' || part.startsWith('.'))) continue;
    if (item.kind === 'text' && typeof item.data === 'string') await vault.write(path, item.data);
    else if (item.kind === 'blob' && typeof item.data === 'string' && item.data.startsWith('data:')) {
      await vault.write(path, dataUrlAsBlob(item.data));
    } else continue;
    count++;
  }
  await loadFiles();
  renderList();
  scheduleAutoSync();
  toast(`שוחזרו ${count} קבצים`);
}

// ===== סנכרון =====
async function updateSyncBadge() {
  const n = await vault.pending();
  const badge = $('mSyncCount');
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.hidden = n === 0;
}
let syncing = false;
async function syncNow({ quiet = false } = {}) {
  const remote = await connectedRemote();
  if (!remote) { if (!quiet) openSheet(); return; }
  if (!navigator.onLine) { if (!quiet) toast('אין חיבור. השינויים שמורים בטלפון ויסונכרנו כשיחזור החיבור'); return; }
  if (syncing) return;
  syncing = true;
  $('mSync').classList.add('spin');
  try {
    await saveNow();
    const r = await runSync(localForSync, remote, { hashOf: hashData });
    await meta.set('lastSync', Date.now());
    await loadFiles();
    if (state.current) {
      const rec = await vault.get(state.current);
      if (!rec) closeNote(); // נמחק במקור
      else if (!state.dirty && rec.data !== editorApi.getMarkdown()) editorApi.setMarkdown(rec.data);
    } else renderList();
    const parts = [];
    if (r.uploaded) parts.push(`${r.uploaded} נשלחו`);
    if (r.downloaded) parts.push(`${r.downloaded} התקבלו`);
    if (r.conflicts.length) parts.push(`${r.conflicts.length} נשמרו כעותק (נערכו בשני המקומות)`);
    if (r.errors.length) parts.push(`${r.errors.length} נכשלו`);
    if (!quiet || parts.length) toast(parts.length ? 'סנכרון: ' + parts.join(', ') : 'הכול מסונכרן');
    delete $('mSync').dataset.auth;
  } catch (error) {
    if (error?.code === 'AUTH') {
      // הטוקן של Google פג (כשעה). ברקע לא פותחים חלון; הכפתור מסומן, ולחיצה עליו מתחברת שוב.
      $('mSync').dataset.auth = 'needed';
      if (!quiet) toast('צריך להתחבר שוב ל־Google Drive');
    } else if (!quiet) toast('הסנכרון נכשל: ' + (error?.message || error));
  } finally {
    syncing = false;
    $('mSync').classList.remove('spin');
  }
}
let autoSyncTimer = null;
function scheduleAutoSync() { clearTimeout(autoSyncTimer); autoSyncTimer = setTimeout(() => syncNow({ quiet: true }), 8000); }
window.addEventListener('online', () => syncNow({ quiet: true }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveNow();
  else syncNow({ quiet: true });
});

// ===== Google Drive (drive.js, drive-auth.js) =====
const driveAuth = createDriveAuth({ meta });
let driveFetch; // לבדיקות בדפדפן: Drive מדומה (window.taliMobile.useDriveFetch)

async function attachDrive() {
  const d = await meta.get('drive');
  setRemote(d ? driveRemote({ folderId: d.folderId, folderName: d.folderName, getToken: driveAuth.getToken, fetch: driveFetch }) : null);
  return d;
}

// בורר תיקייה: מתחילים ב"האחסון שלי" ונכנסים פנימה. אי אפשר לבחור את כל ה־Drive.
function pickFolder() {
  const dlg = $('mPicker');
  const trail = [{ id: 'root', name: 'האחסון שלי' }];
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => { if (done) return; done = true; if (dlg.open) dlg.close(); resolve(value); };
    const draw = async () => {
      const cur = trail.at(-1);
      $('mPickerPath').textContent = trail.map((t) => t.name).join(' / ');
      $('mPickerUp').hidden = trail.length === 1;
      const choose = $('mPickerChoose');
      choose.disabled = trail.length === 1;
      choose.textContent = trail.length === 1 ? 'בחרו תיקייה' : `בחירת "${cur.name}"`;
      const list = $('mPickerList');
      list.innerHTML = '<p class="m-muted">טוען…</p>';
      try {
        const folders = await listFolders({ getToken: driveAuth.getToken, fetch: driveFetch, parentId: cur.id });
        if (trail.at(-1) !== cur) return; // המשתמש כבר עבר תיקייה
        list.innerHTML = '';
        if (!folders.length) list.innerHTML = '<p class="m-muted">אין כאן תיקיות</p>';
        for (const f of folders) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'm-sheet-item';
          b.innerHTML = icon('folder', 18);
          b.append(f.name);
          b.addEventListener('click', () => { trail.push(f); draw(); });
          list.append(b);
        }
      } catch (error) {
        list.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'm-muted';
        p.textContent = 'לא ניתן לטעון: ' + (error?.message || error);
        list.append(p);
      }
    };
    $('mPickerUp').onclick = () => { trail.pop(); draw(); };
    $('mPickerChoose').onclick = () => finish(trail.at(-1));
    $('mPickerCancel').onclick = () => finish(null);
    dlg.onclick = (e) => { if (e.target === dlg) finish(null); };
    // Esc / כפתור "חזרה" של הטלפון. לא 'close': אירוע close של סגירה קודמת מגיע באיחור וסוגר את הפתיחה החדשה.
    dlg.oncancel = (e) => { e.preventDefault(); finish(null); };
    dlg.showModal();
    draw();
  });
}

async function chooseDriveFolder() {
  const folder = await pickFolder();
  if (!folder) return;
  await meta.set('drive', { folderId: folder.id, folderName: folder.name });
  await attachDrive();
  toast(`מחובר ל־"${folder.name}". מסנכרן…`);
  syncNow();
}

async function connectDrive() {
  $('mSheet').close();
  if (!driveAuth.clientId) {
    const id = await ask({ title: 'Client ID של Google (פעם אחת; איך יוצרים: mobile/README.md)', value: '', ok: 'המשך' });
    if (!id) return;
    if (!/\.apps\.googleusercontent\.com$/.test(id)) { toast('זה לא נראה כמו Client ID (מסתיים ב־apps.googleusercontent.com)'); return; }
    await driveAuth.setClientId(id);
  }
  try {
    await driveAuth.signIn({ consent: true });
  } catch (error) {
    toast(error?.message || String(error));
    return;
  }
  await chooseDriveFolder();
}

async function disconnectDrive() {
  $('mSheet').close();
  const d = await meta.get('drive');
  if (!d) return;
  await saveNow();
  if (!await ask({ title: `לנתק מ־"${d.folderName}"? מה שכבר נמצא ב־Drive יוסר מהטלפון (הוא נשאר ב־Drive); מה שעוד לא נשלח יישאר בטלפון.`, ok: 'ניתוק', danger: true })) return;
  await meta.set('drive', null);
  await meta.set('lastSync', null);
  await attachDrive();
  await driveAuth.signOut();
  const { kept } = await vault.forgetRemote();
  if (state.current && !(await vault.get(state.current))) await closeNote();
  await loadFiles();
  renderList();
  delete $('mSync').dataset.auth;
  toast(kept ? `נותק. ${kept} מסמכים שלא נשלחו נשארו בטלפון` : 'נותק מ־Google Drive');
}

// לחיצה על "סנכרון": אם הטוקן פג, קודם התחברות (מתוך הלחיצה, אחרת החלון הקופץ נחסם)
async function syncClicked() {
  const remote = await connectedRemote();
  if (remote?.kind === 'drive' && !driveAuth.hasValidToken()) {
    try { await driveAuth.signIn(); } catch (error) { toast(error?.message || String(error)); return; }
  }
  syncNow();
}

// ===== עיצוב ותצוגה =====
function buildThemePresets() {
  const host = $('mThemePresets');
  if (host.children.length) return;
  const options = [{ id: 'system', name: 'לפי הטלפון', system: true }, ...PRESETS];
  for (const preset of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'm-theme-preset';
    button.dataset.theme = preset.id;
    const swatch = document.createElement('span');
    swatch.className = 'm-theme-swatch';
    if (preset.system) swatch.style.background = 'linear-gradient(135deg, #fffdf9 0 50%, #26292f 50%)';
    else {
      swatch.style.background = preset.colors.page;
      swatch.style.setProperty('--swatch-accent', preset.colors.accent);
    }
    const label = document.createElement('span');
    label.textContent = preset.name;
    button.append(swatch, label);
    button.addEventListener('click', () => saveMobilePrefs({ theme: preset.id, accent: null }));
    host.append(button);
  }
}

function renderAppearanceControls() {
  buildThemePresets();
  for (const button of document.querySelectorAll('.m-theme-preset')) button.classList.toggle('on', button.dataset.theme === mobilePrefs.theme);
  for (const button of document.querySelectorAll('[data-density]')) button.classList.toggle('on', button.dataset.density === mobilePrefs.density);
  for (const button of document.querySelectorAll('[data-leading]')) button.classList.toggle('on', button.dataset.leading === mobilePrefs.leading);
  const colors = colorsForMobilePrefs(mobilePrefs, darkQuery.matches);
  $('mAccent').value = mobilePrefs.accent || colors.accent;
  $('mFontSize').value = String(mobilePrefs.fontSize);
  $('mFontSizeValue').textContent = `${mobilePrefs.fontSize}px`;
  $('mAppearanceSummary').textContent = `${mobileThemeLabel(mobilePrefs)} · ${mobilePrefs.density === 'compact' ? 'רשימה' : 'כרטיסים'} · ${mobilePrefs.fontSize}px`;
}

function openAppearance() {
  $('mSheet').close();
  renderAppearanceControls();
  $('mAppearance').showModal();
}

function closeAppearance({ returnToControl = false } = {}) {
  if ($('mAppearance').open) $('mAppearance').close();
  if (returnToControl) openSheet('control');
}

// ===== תפריטים (לוגו: הגדרות וקבצים; שלוש נקודות: המסמך) =====
async function openSheet(mode = 'control') {
  const documentMode = mode === 'document';
  const remoteName = await remoteLabel();
  const last = await meta.get('lastSync');
  $('mSheetSync').textContent = remoteName
    ? `מחובר: ${remoteName}${last ? ` · סנכרון אחרון ${fmtTime(last)}` : ''}`
    : 'הסנכרון עוד לא מחובר. בינתיים כל מה שנכתב נשמר בטלפון בלבד; אפשר לייבא קבצים מהמחשב ולשתף מסמך.';
  $('mDriveConnect').hidden = !!remoteName;
  $('mDriveDisconnect').hidden = !remoteName;
  $('mSheetNote').hidden = !documentMode || !state.current;
  $('mSheetControl').hidden = documentMode;
  $('mSheetApp').hidden = isInstalled();
  $('mSheetTitle').textContent = documentMode ? 'פעולות במסמך' : 'הגדרות וקבצים';
  $('mSheetSubtitle').textContent = documentMode ? noteName(state.current || '') : 'תצוגה, סנכרון, ייבוא וייצוא';
  renderAppearanceControls();
  $('mSheet').showModal();
}

// ===== התקנה כאפליקציה (מסך הבית, מסך מלא, בלי שורת הכתובת) =====
// אנדרואיד (Chrome, Edge, Samsung): הדפדפן שולח beforeinstallprompt, ושומרים אותו לכפתור "התקנה".
// אייפון: אין אירוע כזה, ולכן הסבר: שיתוף ← "הוספה למסך הבית". אחרי ההתקנה הפס והפריט בתפריט נעלמים.
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const INSTALL_DISMISSED = 'tali:install-dismissed';
let installPrompt = null;
function installDismissed() { try { return localStorage.getItem(INSTALL_DISMISSED) === '1'; } catch { return false; } }
function renderInstall() {
  const offer = !isInstalled() && (installPrompt || isIOS);
  $('mInstall').hidden = !offer || installDismissed();
  $('mInstallHint').textContent = installPrompt ? 'נפתחת ממסך הבית, במסך מלא, בלי דפדפן' : 'שיתוף ← "הוספה למסך הבית"';
  $('mInstallBtn').textContent = installPrompt ? 'התקנה' : 'איך?';
}
async function install() {
  $('mSheet').close();
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null; // אפשר להציג אותו רק פעם אחת
    prompt.prompt();
    await prompt.userChoice.catch(() => null);
    renderInstall();
    return;
  }
  await ask({
    info: true, ok: 'הבנתי',
    title: isIOS
      ? 'באייפון: לוחצים על כפתור השיתוף של הדפדפן (ריבוע עם חץ למעלה), ובוחרים "הוספה למסך הבית". מאז Tali נפתחת ממסך הבית כמו כל אפליקציה.'
      : 'בתפריט של הדפדפן (שלוש הנקודות) בוחרים "התקנת אפליקציה" או "הוספה למסך הבית". מאז Tali נפתחת ממסך הבית כמו כל אפליקציה.',
  });
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; renderInstall(); });
window.addEventListener('appinstalled', () => { installPrompt = null; renderInstall(); toast('Tali הותקנה. מעכשיו פותחים אותה ממסך הבית'); });
matchMedia('(display-mode: standalone)').addEventListener?.('change', renderInstall);
$('mSheet').addEventListener('click', (e) => { if (e.target === $('mSheet')) $('mSheet').close(); });

// ===== חיווט =====
setIcon($('mBack'), 'chevronRight', 22);
$('mSyncIcon').innerHTML = lucide('RefreshCw', 20);
setIcon($('mMenu'), 'more', 22);
setIcon($('mLogoChevron'), 'chevronDown', 12);
setIcon($('mCaptureIcon'), 'plus', 19);
setIcon($('mAppearanceChevron'), 'chevronLeft', 18);
setIcon($('mAppearanceBack'), 'chevronRight', 22);
setIcon($('mCrumbUp'), 'chevronRight', 18);
setIcon($('mSearchIcon'), 'search', 18);
for (const el of document.querySelectorAll('[data-icon]')) setIcon(el, el.dataset.icon, 18);

$('mBack').addEventListener('click', () => closeNote());
$('mLogo').addEventListener('click', () => openSheet('control'));
$('mSync').addEventListener('click', syncClicked);
$('mDriveIcon').innerHTML = lucide('Cloud', 18);
setIcon($('mPickerUp'), 'chevronRight', 18);
$('mDriveConnect').addEventListener('click', connectDrive);
$('mDriveDisconnect').addEventListener('click', disconnectDrive);
$('mMenu').addEventListener('click', () => openSheet('document'));
$('mCapture').addEventListener('click', createQuickNote);
$('mCrumbUp').addEventListener('click', () => { state.folder = dirOf(state.folder); renderList(); });
$('mSearch').addEventListener('input', (e) => { state.query = e.target.value; renderList(); });
$('mImportFiles').addEventListener('change', (e) => { $('mSheet').close(); importFiles([...e.target.files]); e.target.value = ''; });
$('mImportDir').addEventListener('change', (e) => { $('mSheet').close(); importFiles([...e.target.files]); e.target.value = ''; });
$('mExportAll').addEventListener('click', exportBackup);
$('mImportBackup').addEventListener('change', (e) => { const [file] = e.target.files; e.target.value = ''; if (file) importBackup(file); });
$('mExport').addEventListener('click', () => { $('mSheet').close(); exportCurrent(); });
$('mRaw').addEventListener('click', () => { $('mSheet').close(); editorApi.toggleRaw(); });
$('mRename').addEventListener('click', async () => {
  $('mSheet').close();
  if (!state.current) return;
  const name = await ask({ title: 'שם חדש', value: noteName(state.current), ok: 'שמירה' });
  if (!name || name === noteName(state.current)) return;
  await saveNow();
  const to = (dirOf(state.current) ? dirOf(state.current) + '/' : '') + name.replace(/[\\/:*?"<>|]/g, '') + '.md';
  if (state.files.some((f) => f.path === to)) { toast('כבר יש מסמך בשם הזה'); return; }
  await vault.rename(state.current, to);
  await loadFiles();
  state.current = to;
  $('mTitle').textContent = noteName(to);
});
$('mDelete').addEventListener('click', async () => {
  $('mSheet').close();
  if (!state.current || !await ask({ title: `למחוק את "${noteName(state.current)}"?`, ok: 'מחיקה', danger: true })) return;
  const path = state.current;
  state.dirty = false;
  await vault.trash(path);
  await loadFiles();
  closeNote();
  scheduleAutoSync();
});
$('mSheetClose').addEventListener('click', () => $('mSheet').close());
$('mAppearanceOpen').addEventListener('click', openAppearance);
$('mAppearanceBack').addEventListener('click', () => closeAppearance({ returnToControl: true }));
$('mAppearanceDone').addEventListener('click', () => closeAppearance());
$('mAppearanceReset').addEventListener('click', () => saveMobilePrefs({ ...DEFAULT_MOBILE_PREFS }));
$('mAppearance').addEventListener('click', (e) => { if (e.target === $('mAppearance')) closeAppearance(); });
for (const button of document.querySelectorAll('[data-density]')) button.addEventListener('click', () => saveMobilePrefs({ density: button.dataset.density }));
for (const button of document.querySelectorAll('[data-leading]')) button.addEventListener('click', () => saveMobilePrefs({ leading: button.dataset.leading }));
$('mFontSize').addEventListener('input', (e) => saveMobilePrefs({ fontSize: Number(e.target.value) }));
$('mAccent').addEventListener('input', (e) => saveMobilePrefs({ accent: e.target.value }));
$('mInstallIcon').innerHTML = lucide('Smartphone', 22);
$('mInstallItemIcon').innerHTML = lucide('Download', 18);
$('mInstallClose').innerHTML = lucide('X', 18);
$('mInstallBtn').addEventListener('click', install);
$('mInstallItem').addEventListener('click', install);
$('mInstallClose').addEventListener('click', () => {
  try { localStorage.setItem(INSTALL_DISMISSED, '1'); } catch { /* פס שנסגר יחזור בפתיחה הבאה */ }
  $('mInstall').hidden = true;
  toast('אפשר להתקין גם מהתפריט (שלוש הנקודות)');
});
renderInstall();
renderAppearanceControls();
$('mTitle').addEventListener('click', () => { if (state.current) $('mRename').click(); });

// מקלדת וירטואלית: הסרגל נצמד מעליה (visualViewport)
const vv = window.visualViewport;
if (vv) {
  const place = () => {
    const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', covered + 'px');
  };
  vv.addEventListener('resize', place);
  vv.addEventListener('scroll', place);
}

// מצב שרטוט: כלי השכבה (page-overlay.js) מקבלים גדלים לאצבע ב־mobile.css
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.inSession()) setDrawing(false); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* בלי עבודה לא מקוונת */ });
}

(async function start() {
  document.body.dataset.view = 'list';
  await loadFiles();
  renderList();
  const fromHash = location.hash ? decodeURIComponent(location.hash.slice(1)) : null;
  if (fromHash && state.files.some((f) => f.path === fromHash)) { history.replaceState(null, '', location.pathname); openNote(fromHash); }
  await driveAuth.load();
  const drive = await attachDrive();
  // חזרה מ־Google בדף כולו (החלון הקופץ נחסם): אוספים את הטוקן, ובחיבור ראשון בוחרים תיקייה
  try {
    if (await driveAuth.consumeRedirect()) { if (!drive) { await chooseDriveFolder(); return; } }
  } catch (error) { toast(error?.message || String(error)); }
  syncNow({ quiet: true });
})();

// לבדיקות ולניפוי (בדפדפן): window.taliMobile
window.taliMobile = {
  state, vault, meta, openNote, closeNote, editorApi, overlay, syncNow, setRemote, memoryRemote, extractTags, driveAuth,
  async useDriveFetch(f) { driveFetch = f; await attachDrive(); }, chooseDriveFolder,
};
