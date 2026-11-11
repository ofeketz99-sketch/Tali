// נקודת הכניסה של הממשק: מחברת בין העורך, הסרגל והקבצים.
import { createEditor } from './editor.js';
import { buildToolbar } from './toolbar.js';
import { renderTree, renderSearchResults, renderBacklinks } from './sidebar.js';
import { resolveLink, extractLinks } from '../links.js';
import { showLinkHubOffer } from './linkhub.js';
import { fileUrl, bumpImage } from './embed.js';
import { openPaint } from './paint.js';
import { icon } from './icons.js';

// אייקונים בכפתורים שב־index.html: <span data-icon="plus">
for (const el of document.querySelectorAll('[data-icon]')) el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon, 18));

// ===== הסבר בריחוף (tooltip) לכל אלמנט עם data-tip =====
{
  const tip = document.createElement('div');
  tip.id = 'tip';
  tip.hidden = true;
  document.body.append(tip);
  let timer = null;
  let target = null;
  const hide = () => { clearTimeout(timer); tip.hidden = true; tip.classList.remove('show'); target = null; };
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el === target) return;
    hide();
    if (!el) return;
    target = el;
    timer = setTimeout(() => {
      tip.textContent = el.dataset.tip;
      tip.hidden = false;
      const r = el.getBoundingClientRect();
      const w = tip.offsetWidth;
      tip.style.top = r.bottom + 8 + 'px';
      tip.style.left = Math.max(6, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 6)) + 'px';
      requestAnimationFrame(() => tip.classList.add('show'));
    }, 380);
  });
  document.addEventListener('mousedown', hide, true);
  document.addEventListener('keydown', hide, true);
}

// ===== "ג'לי": כל לחיצה על כפתור נמעכת וקופצת =====
document.addEventListener('click', (e) => {
  const el = e.target.closest?.('button:not(:disabled), .pal-item, .hit');
  if (!el || el.closest('.ProseMirror')) return;
  el.classList.remove('jelly');
  void el.offsetWidth; // מאפס את האנימציה כדי שתרוץ שוב גם בלחיצה חוזרת
  el.classList.add('jelly');
}, true);
document.addEventListener('animationend', (e) => { if (e.animationName === 'jelly') e.target.classList?.remove('jelly'); });

// ===== מחוון שמירה בשורת המצב: נקודה שמהבהבת כשיש שינויים, ונהיית ✓ כשנשמר =====
function setSaveState(s) { const d = $('saveDot'); if (d) d.dataset.state = s; }
import { loadPrefs, getPrefs, openSettings } from './settings.js';
import { openPalette, closePalette, isPaletteOpen, fuzzy } from './palette.js';

// אחסון קטן בדפדפן של האפליקציה: הערות אחרונות ותיקיות מכווצות, לכל תיקיית עבודה בנפרד
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* לא קריטי */ } },
};

const $ = (id) => document.getElementById(id);
const dirname = (p) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')));

const state = {
  root: null,
  tree: [],
  currentPath: null,
  selectedDir: null,
  collapsed: new Set(),
  opening: null, // תיקייה שנפתחה עכשיו (לאנימציה)
  back: [],     // היסטוריית ניווט אחורה
  forward: [],  // וקדימה
  attachments: [], // קבצים שאינם הערות (תמונות, PDF)
  mtime: null,  // זמן השינוי של ההערה הפתוחה כשנקראה, כדי לזהות שינוי מבחוץ
  diskText: null, // התוכן שבדיסק לפי מה שהאפליקציה יודעת (נקרא או נשמר אחרון)
  dirty: false, // יש שינויים שעוד לא נשמרו
  recent: [],   // הערות שנפתחו לאחרונה, החדשה ראשונה (למעבר המהיר)
};

// ===== רשימת כל ההערות (לקישורים) =====
let notesCache = null;
function allNotes() {
  if (notesCache) return notesCache;
  const out = [];
  const walk = (nodes, prefix) => {
    for (const n of nodes) {
      if (n.type === 'dir') walk(n.children, prefix + n.name + '/');
      else {
        const name = n.name.replace(/\.md$/i, '');
        out.push({ name, path: n.path, rel: prefix + name });
      }
    }
  };
  walk(state.tree, '');
  return (notesCache = out);
}
// הערות וגם קבצים מצורפים, כך ש־[[תמונה.png]] ו־![[מסמך.pdf]] מוצאים את הקובץ
const resolveTarget = (target) =>
  resolveLink(target, allNotes().map((n) => n.path).concat(state.attachments), state.root || '');
const isNote = (p) => /\.md$/i.test(p);

// נתיב של תמונה ב־![](נתיב): יחסית להערה, ואם לא נמצא, יחסית לתיקייה הראשית
function localSrc(src) {
  if (/^(https?:|data:|file:)/i.test(src)) return [src];
  let rel = src;
  try { rel = decodeURI(src); } catch { /* נשאר כמו שהוא */ }
  rel = rel.replace(/^\.?[\\/]/, '');
  const sep = state.root && state.root.includes('\\') ? '\\' : '/';
  const join = (dir) => dir + sep + rel.replace(/[\\/]/g, sep);
  const out = [];
  if (state.currentPath) out.push(fileUrl(join(dirname(state.currentPath))));
  if (state.root) out.push(fileUrl(join(state.root)));
  return out;
}

// ===== עורך וסרגל כלים =====
let saveTimer = null;
const editorApi = createEditor({
  element: $('editor'),
  rawElement: $('raw'),
  propsElement: $('props'),
  onChange: () => {
    state.dirty = true;
    setSaveState('dirty');
    setStatus('נערך…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 600);
  },
  links: {
    getNotes: () => allNotes().filter((n) => n.path !== state.currentPath),
    resolve: resolveTarget,
    onOpen: openLink,
    onLinked: offerLinkHub,
    onEditDrawing: editDrawing,
    localSrc,
  },
  onImageFiles: saveDroppedImages,
});
buildToolbar($('toolbar'), editorApi, { onImage: importImages, onDraw: newDrawing });

// ===== ציורים =====
function drawingStamp() {
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}.${two(d.getMinutes())}.${two(d.getSeconds())}`;
}
function newDrawing() {
  if (!state.currentPath) { setStatus('קודם פותחים הערה, ואז מוסיפים לה ציור'); return; }
  if (editorApi.isRaw()) { setStatus('ציור עובד בתצוגה המעוצבת'); return; }
  const at = editorApi.editor.state.selection.from;
  openPaint({
    onSave: async (bytes, width) => {
      const p = await window.api.saveAttachment(attachmentDir(), `Drawing ${drawingStamp()}.png`, bytes);
      state.attachments = await window.api.attachments();
      const target = linkTextFor(p).replace(/\.png$/i, '') + '.png';
      // מוצג ברוחב שבו צויר, גם במסכים עם הגדלה
      editorApi.editor.chain().focus().setTextSelection(at).insertContent({ type: 'embed', attrs: { target: `${target}|${width}` } }).run();
      setStatus('הציור נוסף');
    },
  });
}
function editDrawing(p) {
  openPaint({
    image: fileUrl(p),
    onSave: async (bytes) => {
      await window.api.writeImage(p, bytes);
      bumpImage(p);
      setStatus('הציור נשמר');
    },
  });
}

// ===== פתק קישור =====
// השם שנכתב בתוך [[ ]] לקובץ: השם הקצר אם הוא חד־משמעי, אחרת הנתיב מהתיקייה הראשית
function linkTextFor(p) {
  const name = p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1).replace(/\.md$/i, '');
  if (resolveTarget(name) === p) return name;
  return p.slice(state.root.length + 1).replace(/\\/g, '/').replace(/\.md$/i, '');
}
const noteName = (p) => p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1).replace(/\.md$/i, '');

// אחרי שנוצר קישור מההערה הפתוחה להערה קיימת אחרת: מציעים פתק קישור לשתיהן
function offerLinkHub(target, coords) {
  const from = state.currentPath;
  const to = resolveTarget(target);
  if (!from || !to || to === from || !isNote(to)) return;
  showLinkHubOffer({
    coords,
    from: noteName(from),
    to: noteName(to),
    notes: allNotes().filter((n) => n.path !== from && n.path !== to),
    onApply: (pick) => applyLinkHub(pick, [from, to]),
    refocus: () => editorApi.editor.commands.focus(),
  });
}

// יוצר את פתק הקישור (או משתמש בקיים) ומוסיף לו קישורים לשתי ההערות, בלי כפילויות
async function applyLinkHub(pick, paths) {
  try {
    await flushSave();
    let hub = pick.path;
    if (!hub) {
      try { hub = await window.api.createNote(targetDir(), pick.name); }
      catch { hub = resolveTarget(pick.name); } // כבר קיים בשם הזה
      if (!hub) throw new Error('לא הצלחתי ליצור את הפתק');
      await refreshTree();
    }
    const text = await window.api.read(hub);
    const files = allNotes().map((n) => n.path);
    const linked = new Set(extractLinks(text).map((l) => resolveLink(l.target, files, state.root)));
    const add = paths.filter((p) => !linked.has(p)).map((p) => `- [[${linkTextFor(p)}]]`);
    if (add.length) {
      const next = text.trim() ? text.replace(/\s*$/, '\n') + add.join('\n') + '\n' : add.join('\n') + '\n';
      await window.api.write(hub, next, null);
    }
    refreshBacklinks();
    showToast(`פתק הקישור ״${noteName(hub)}״ מקשר עכשיו את ״${noteName(paths[0])}״ ו״${noteName(paths[1])}״.`,
      'פתיחה', () => openNote(hub));
    editorApi.editor.commands.focus();
  } catch (err) { setStatus('שגיאה ביצירת פתק הקישור: ' + err.message); }
}

// ===== תמונות =====
// לאן נשמרות תמונות: תיקייה קבועה בתוך התיקייה הראשית, או ליד ההערה (לפי ההגדרות)
function attachmentDir() {
  const prefs = getPrefs();
  if (prefs.attachMode === 'beside' && state.currentPath) return dirname(state.currentPath);
  const sep = state.root.includes('\\') ? '\\' : '/';
  const name = (prefs.attachFolder || 'attachments')
    .replace(/[:*?"<>|]/g, '').split(/[\\/]+/).filter((s) => s && s !== '..' && s !== '.').join(sep);
  return name ? state.root + sep + name : state.root;
}

// מכניס ![[שם]] לכל תמונה. אם יש עוד קובץ באותו שם, נכתב הנתיב המלא כדי שהקישור יהיה חד־משמעי.
async function insertImages(paths) {
  if (!paths.length) return;
  state.attachments = await window.api.attachments();
  const nodes = paths.map((p) => {
    const name = p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1);
    const rel = p.slice(state.root.length + 1).replace(/\\/g, '/');
    return { type: 'embed', attrs: { target: resolveTarget(name) === p ? name : rel } };
  });
  editorApi.editor.chain().focus().insertContent(nodes).run();
  setStatus(paths.length === 1 ? 'התמונה נוספה' : `נוספו ${paths.length} תמונות`);
}

async function importImages() {
  if (!state.currentPath) { setStatus('קודם פותחים הערה, ואז מוסיפים לה תמונה'); return; }
  if (editorApi.isRaw()) { setStatus('ייבוא תמונות עובד בתצוגה המעוצבת'); return; }
  try { await insertImages(await window.api.importImages(attachmentDir())); }
  catch (err) { setStatus('שגיאה בייבוא: ' + err.message); }
}

async function saveDroppedImages(files) {
  if (!state.currentPath) return;
  try {
    const d = new Date();
    const two = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
    const paths = [];
    for (const [i, f] of files.entries()) {
      const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
      // תמונה מהלוח מגיעה בשם כללי (image.png), אז נותנים לה שם עם תאריך כמו באובסידיאן
      const name = f.name && !/^image\.\w+$/i.test(f.name) ? f.name : `Pasted image ${stamp}${i ? '-' + i : ''}.${ext}`;
      paths.push(await window.api.saveAttachment(attachmentDir(), name, new Uint8Array(await f.arrayBuffer())));
    }
    await insertImages(paths);
  } catch (err) { setStatus('שגיאה בשמירת התמונה: ' + err.message); }
}

function setStatus(text) { $('status').textContent = text; }
// נתיב יחסי להצגה: "תיקייה › הערה", בלי .md (שבעברית קפץ לתחילת השורה)
const prettyPath = (p) => p.slice(state.root.length + 1).replace(/\.md$/i, '').split(/[\\/]/).join(' › ');

// שומר רק אם באמת היה שינוי. שמירות לא רצות במקביל, כדי שזמן השינוי יישאר עקבי.
let saving = Promise.resolve();
function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  saving = saving.then(saveNow, saveNow);
  return saving;
}
async function saveNow() {
  if (!state.currentPath || !state.dirty) return;
  const p = state.currentPath;
  const content = editorApi.getMarkdown();
  state.dirty = false;
  try {
    state.mtime = await window.api.write(p, content, state.mtime);
    state.diskText = content;
    setStatus('נשמר');
    if (!state.dirty) setSaveState('saved');
  } catch (err) {
    if (/CONFLICT/.test(err.message)) return saveDespiteOutsideChange(p, content);
    state.dirty = true;
    setSaveState('error');
    setStatus('שגיאת שמירה: ' + err.message);
  }
}

// זמן השינוי של הקובץ זז מאז שנקרא. בודקים אם התוכן באמת השתנה:
// Google Drive מעדכן את הזמן בסנכרון גם בלי לשנות דבר, וזה לא שינוי אמיתי.
// אם התוכן באמת שונה (למשל נערך באובסידיאן), לא שואלים: שומרים את מה שכתבת כאן,
// והגרסה האחרת נשמרת כהערה נפרדת לידה, כך ששום דבר לא הולך לאיבוד.
async function saveDespiteOutsideChange(p, content) {
  try {
    const disk = await window.api.read(p);
    if (disk !== state.diskText && disk !== content) {
      const copy = await window.api.saveConflictCopy(p, disk);
      showToast('ההערה נערכה גם מחוץ לאפליקציה. השינויים שלך נשמרו, והגרסה האחרת נשמרה כהערה נפרדת.',
        'פתיחת הגרסה האחרת', () => openNote(copy));
      refreshTree();
    }
    state.mtime = await window.api.write(p, content, null);
    state.diskText = content;
    setStatus('נשמר');
    if (!state.dirty) setSaveState('saved');
  } catch (err) {
    state.dirty = true;
    setSaveState('error');
    setStatus('שגיאת שמירה: ' + err.message);
  }
}

async function reloadFromDisk() {
  const p = state.currentPath;
  const md = await window.api.read(p);
  state.mtime = await window.api.mtime(p);
  state.diskText = md;
  state.dirty = false;
  editorApi.setMarkdown(md);
}

// חזרה לחלון: אם ההערה הפתוחה השתנתה בחוץ ואין כאן שינויים, טוענים אותה מחדש בשקט.
// אם רק זמן השינוי זז (סנכרון Drive) לא טוענים, כדי לא להזיז את הסמן.
window.addEventListener('focus', async () => {
  if (!state.currentPath || state.dirty || saveTimer) return;
  const p = state.currentPath;
  const now = await window.api.mtime(p).catch(() => null);
  if (now == null || state.mtime == null || Math.abs(now - state.mtime) <= 1) return;
  const disk = await window.api.read(p).catch(() => null);
  if (disk == null || state.currentPath !== p || state.dirty) return;
  if (disk === state.diskText) { state.mtime = now; return; }
  await reloadFromDisk();
  setStatus('ההערה עודכנה מהדיסק');
});

// הודעה קטנה בפינה, שלא עוצרת את העבודה
let toastTimer = null;
function showToast(text, actionText, action) {
  let t = $('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.append(t);
  }
  t.innerHTML = '';
  const msg = document.createElement('span');
  msg.textContent = text;
  t.append(msg);
  if (actionText) {
    const b = document.createElement('button');
    b.textContent = actionText;
    b.addEventListener('click', () => { t.hidden = true; action(); });
    t.append(b);
  }
  const x = document.createElement('button');
  x.textContent = '✕';
  x.title = 'סגירה';
  x.className = 'toast-close';
  x.addEventListener('click', () => { t.hidden = true; });
  t.append(x);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 20000);
}

// ===== דיאלוג קטן לשם / אישור =====
function ask(label, defaultValue = '', { confirmOnly = false, okText = 'אישור', cancelText = 'ביטול' } = {}) {
  const dlg = $('dlg');
  $('dlgLabel').textContent = label;
  dlg.querySelector('button[value="ok"]').textContent = okText;
  dlg.querySelector('button[value="cancel"]').textContent = cancelText;
  const input = $('dlgInput');
  input.hidden = confirmOnly;
  input.value = defaultValue;
  // Enter בשדה = אישור. בלי זה הטופס שולח את הכפתור הראשון, שהוא "ביטול".
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); dlg.close('ok'); }
  };
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'ok' ? (confirmOnly ? true : input.value.trim()) : null);
    }, { once: true });
    dlg.returnValue = '';
    dlg.showModal();
    if (!confirmOnly) input.select();
    else dlg.querySelector('button[value="ok"]').focus();
  });
}

// ===== עץ הקבצים =====
function drawTree() {
  renderTree($('tree'), state.tree, {
    activePath: state.currentPath,
    collapsed: state.collapsed,
    onOpen: openNote,
    onSelectDir: (p) => { state.selectedDir = p; },
    opening: state.opening,
    onToggleDir: (p) => {
      state.collapsed.has(p) ? state.collapsed.delete(p) : state.collapsed.add(p);
      saveCollapsed();
      state.opening = state.collapsed.has(p) ? null : p; // רק פתיחה מקבלת אנימציה
      drawTree();
      state.opening = null;
    },
    onContext: showContextMenu,
  });
}

async function refreshTree() {
  const r = await window.api.tree();
  state.tree = r.tree;
  state.attachments = await window.api.attachments();
  notesCache = null;
  drawTree();
  editorApi.refreshLinks();
  refreshBacklinks();
}

function targetDir() {
  if (getPrefs().newNoteLocation === 'root') return state.root;
  return state.selectedDir || (state.currentPath ? dirname(state.currentPath) : state.root);
}

async function openNote(p, { history = true } = {}) {
  await flushSave();
  const md = await window.api.read(p);
  const mtime = await window.api.mtime(p);
  if (history && state.currentPath && state.currentPath !== p) {
    state.back.push(state.currentPath);
    state.forward = [];
  }
  state.currentPath = p;
  state.mtime = mtime;
  state.diskText = md;
  state.dirty = false;
  state.recent = [p, ...state.recent.filter((x) => x !== p)].slice(0, 30);
  store.set('recent:' + state.root, state.recent);
  editorApi.setMarkdown(md);
  $('empty').hidden = true;
  $('page').hidden = false;
  $('pageWrap').scrollTop = 0;
  setSaveState('saved');
  // כניסה רכה של הדף בכל פתיחת הערה
  const pg = $('page');
  pg.classList.remove('enter');
  void pg.offsetWidth;
  pg.classList.add('enter');
  setStatus(prettyPath(p));
  drawTree();
  refreshBacklinks();
}

// ===== קישורים =====
// לחיצה על [[קישור]]: פותחת את ההערה, או יוצרת אותה אם עדיין לא קיימת.
// קישור לקובץ שאינו הערה (תמונה, PDF) נפתח בתוכנה של המחשב.
async function openLink(target) {
  const found = resolveTarget(target);
  if (found && isNote(found)) return openNote(found);
  if (found) {
    try { await window.api.openPath(found); } catch (err) { setStatus(err.message); }
    return;
  }
  const parts = target.split('#')[0].replace(/\\/g, '/').split('/').map((s) => s.trim()).filter(Boolean);
  const name = parts.pop();
  if (!name) return;
  // שם עם סיומת שאינה .md (למשל תמונה.png) הוא קובץ חסר, לא הערה חדשה
  if (/\.[a-z0-9]{2,5}$/i.test(name) && !/\.md$/i.test(name)) {
    setStatus(`הקובץ "${name}" לא נמצא בתיקייה`);
    return;
  }
  // אם הקישור כולל תיקייה קיימת, ההערה נוצרת בה. אחרת בתיקייה הראשית.
  let dir = state.root;
  const sep = state.root.includes('\\') ? '\\' : '/';
  if (parts.length) {
    const candidate = state.root + sep + parts.join(sep);
    const exists = (nodes) => nodes.some((n) => n.type === 'dir' && (n.path === candidate || exists(n.children)));
    if (exists(state.tree)) dir = candidate;
  }
  try {
    const file = await window.api.createNote(dir, name);
    await refreshTree();
    await openNote(file);
    setStatus(`נוצרה הערה חדשה: ${name}`);
  } catch (err) { setStatus(err.message); }
}

let backlinksToken = 0;
async function refreshBacklinks() {
  const box = $('backlinks');
  if (!state.currentPath) { box.hidden = true; return; }
  const token = ++backlinksToken;
  const list = await window.api.backlinks(state.currentPath).catch(() => []);
  if (token !== backlinksToken) return; // בינתיים נפתחה הערה אחרת
  box.hidden = false;
  renderBacklinks(box, list, (p) => openNote(p));
}

async function goHistory(dir) {
  const from = dir < 0 ? state.back : state.forward;
  const to = dir < 0 ? state.forward : state.back;
  const p = from.pop();
  if (!p) return;
  if (state.currentPath) to.push(state.currentPath);
  try { await openNote(p, { history: false }); }
  catch { setStatus('ההערה כבר לא קיימת'); }
}

async function enterRoot(r) {
  if (!r) return;
  await flushSave();
  state.root = r.root;
  state.tree = r.tree;
  $('vaultName').textContent = r.root.split(/[\\/]/).filter(Boolean).pop() || r.root;
  $('vaultName').title = r.root;
  state.attachments = await window.api.attachments();
  notesCache = null;
  state.currentPath = null;
  state.dirty = false;
  state.selectedDir = null;
  state.back = [];
  state.forward = [];
  state.recent = store.get('recent:' + r.root, []);
  state.collapsed = new Set(store.get('collapsed:' + r.root, []));
  $('page').hidden = true;
  $('empty').hidden = false;
  $('empty').querySelector('p').textContent = 'בחר הערה מהרשימה, או צור הערה חדשה.';
  $('btnPickBig').hidden = true;
  $('btnNewBig').hidden = false;
  setStatus('תיקיית ההערות: ' + $('vaultName').textContent);
  drawTree();
}

// ===== שינוי שם ומחיקה (מהתפריט הימני, מהמקלדת או מלוח הפקודות) =====
const currentNode = () => state.currentPath && { path: state.currentPath, name: state.currentPath.slice(Math.max(state.currentPath.lastIndexOf('/'), state.currentPath.lastIndexOf('\\')) + 1) };

async function renameNode(node) {
  if (!node) return;
  const current = node.name.replace(/\.md$/i, '');
  const name = await ask('שם חדש:', current);
  if (!name || name === current) return;
  try {
    await flushSave();
    const { to, changed } = await window.api.rename(node.path, name);
    const swap = (p) => (p === node.path ? to : p);
    state.back = state.back.map(swap);
    state.forward = state.forward.map(swap);
    state.recent = state.recent.map(swap);
    if (state.currentPath === node.path) state.currentPath = to;
    else if (state.currentPath && state.currentPath.startsWith(node.path)) state.currentPath = null;
    // אם הקישורים עודכנו גם בהערה הפתוחה, טוענים אותה מחדש מהדיסק
    if (state.currentPath && changed.includes(state.currentPath)) {
      await reloadFromDisk();
    }
    await refreshTree();
    if (!state.currentPath) { $('page').hidden = true; $('empty').hidden = false; }
    else setStatus(prettyPath(state.currentPath));
    const others = changed.filter((p) => p !== to).length;
    if (others) setStatus(`הקישורים עודכנו ב־${others} הערות`);
  } catch (err) { setStatus(err.message); }
}

async function deleteNode(node) {
  if (!node) return;
  const ok = await ask(`למחוק את "${node.name.replace(/\.md$/i, '')}"? (עובר לסל המחזור)`, '', { confirmOnly: true, okText: 'מחיקה' });
  if (!ok) return;
  try {
    await window.api.remove(node.path);
    const keep = (p) => !p.startsWith(node.path);
    state.back = state.back.filter(keep);
    state.forward = state.forward.filter(keep);
    state.recent = state.recent.filter(keep);
    if (state.currentPath && state.currentPath.startsWith(node.path)) {
      state.currentPath = null;
      state.dirty = false;
      $('page').hidden = true;
      $('empty').hidden = false;
    }
    await refreshTree();
  } catch (err) { setStatus(err.message); }
}

// ===== תפריט ימני =====
function showContextMenu(node, x, y) {
  const menu = $('ctx');
  menu.innerHTML = '';
  const add = (text, fn) => {
    const item = document.createElement('div');
    item.textContent = text;
    item.addEventListener('click', () => { hideMenu(); fn(); });
    menu.appendChild(item);
  };
  add('שינוי שם (F2)', () => renameNode(node));
  add('מחיקה (לסל המחזור)', () => deleteNode(node));
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.hidden = false;
}
function hideMenu() { $('ctx').hidden = true; }
document.addEventListener('click', hideMenu);

// ===== כפתורים =====
$('btnPick').addEventListener('click', async () => enterRoot(await window.api.pickFolder()));
$('btnPickBig').addEventListener('click', async () => enterRoot(await window.api.pickFolder()));
$('btnSettings').addEventListener('click', openSettings);

async function newNote(presetName) {
  if (!state.root) return;
  const name = presetName || await ask('שם ההערה:');
  if (!name) return;
  try {
    const file = await window.api.createNote(targetDir(), name);
    await refreshTree();
    await openNote(file);
    editorApi.editor.commands.focus();
  } catch (err) { setStatus(err.message); }
}

async function newFolder() {
  if (!state.root) return;
  const name = await ask('שם התיקייה:');
  if (!name) return;
  try {
    await window.api.createFolder(targetDir(), name);
    await refreshTree();
  } catch (err) { setStatus(err.message); }
}

$('btnNote').addEventListener('click', () => newNote());
$('btnNewBig').addEventListener('click', () => newNote());
$('btnFolder').addEventListener('click', newFolder);

// ===== חיפוש =====
let searchTimer = null;
$('search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (!q) { drawTree(); return; }
  searchTimer = setTimeout(async () => {
    const results = await window.api.search(q);
    renderSearchResults($('tree'), results, async (p) => {
      $('search').value = '';
      await openNote(p);
    });
  }, 250);
});

// ===== עץ: הצגה, כיווץ ופתיחה =====
function saveCollapsed() { store.set('collapsed:' + state.root, [...state.collapsed]); }
function allDirs(nodes = state.tree, out = []) {
  for (const n of nodes) if (n.type === 'dir') { out.push(n.path); allDirs(n.children, out); }
  return out;
}
function revealInTree() {
  if (!state.currentPath) return;
  if ($('search').value) { $('search').value = ''; }
  for (const d of allDirs()) if (state.currentPath.startsWith(d + '\\') || state.currentPath.startsWith(d + '/')) state.collapsed.delete(d);
  saveCollapsed();
  drawTree();
  document.querySelector('#tree .node.active')?.scrollIntoView({ block: 'center' });
}
function collapseAll() { state.collapsed = new Set(allDirs()); saveCollapsed(); drawTree(); }
function expandAll() { state.collapsed.clear(); saveCollapsed(); drawTree(); }

// ===== מעבר מהיר להערה (Ctrl+O) =====
function openSwitcher() {
  if (!state.root) return;
  openPalette({
    placeholder: 'הקלד שם של הערה…',
    footer: '↑↓ בחירה · Enter פתיחה · Esc סגירה',
    emptyText: 'אין הערות',
    items: (query) => {
      const notes = allNotes();
      const recentRank = new Map(state.recent.map((p, i) => [p, i]));
      const folder = (n) => (n.rel.includes('/') ? n.rel.slice(0, n.rel.lastIndexOf('/')).split('/').join(' › ') : '');
      const q = query.trim();
      let list;
      if (!q) {
        // בלי חיפוש: האחרונות שנפתחו, ואחריהן כל השאר לפי א"ב
        list = notes
          .filter((n) => n.path !== state.currentPath)
          .sort((a, b) => (recentRank.get(a.path) ?? 1e6) - (recentRank.get(b.path) ?? 1e6) || a.name.localeCompare(b.name, 'he'))
          .map((n) => ({ title: n.name, hint: folder(n), run: () => openNote(n.path) }));
      } else {
        list = [];
        for (const n of notes) {
          const byName = fuzzy(q, n.name);
          const byPath = byName ? null : fuzzy(q, n.rel);
          const m = byName || (byPath && { score: byPath.score - 200, marks: [] });
          if (!m) continue;
          const bonus = recentRank.has(n.path) ? 60 - recentRank.get(n.path) : 0;
          list.push({ score: m.score + bonus, title: n.name, marks: m.marks, hint: folder(n), run: () => openNote(n.path) });
        }
        list.sort((a, b) => b.score - a.score);
        if (!notes.some((n) => n.name.toLowerCase() === q.toLowerCase())) {
          list.push({ title: `יצירת הערה חדשה: ${q}`, className: 'pal-create', run: () => newNote(q) });
        }
      }
      return list;
    },
  });
}

// ===== פקודות וקיצורי מקלדת =====
// keys: מה שמוצג. הזיהוי לפי המקש הפיזי (e.code), כך שזה עובד גם כשהמקלדת בעברית.
const rawButton = () => $('btnRaw');
const COMMANDS = [
  { title: 'מעבר מהיר להערה', keys: 'Ctrl+O', run: openSwitcher, needs: 'root' },
  { title: 'לוח פקודות', keys: 'Ctrl+P', run: openCommands },
  { title: 'הערה חדשה', keys: 'Ctrl+N', run: () => newNote(), needs: 'root' },
  { title: 'תיקייה חדשה', keys: 'Ctrl+Shift+N', run: newFolder, needs: 'root' },
  { title: 'חיפוש בכל ההערות', keys: 'Ctrl+Shift+F', run: () => { $('search').focus(); $('search').select(); }, needs: 'root' },
  { title: 'שמירה', keys: 'Ctrl+S', run: flushSave, needs: 'note' },
  { title: 'מעבר בין תצוגה מעוצבת ל־Markdown', keys: 'Ctrl+E', run: () => rawButton()?.click(), needs: 'note' },
  { title: 'שינוי שם ההערה', keys: 'F2', run: () => renameNode(currentNode()), needs: 'note' },
  { title: 'מחיקת ההערה (לסל המחזור)', run: () => deleteNode(currentNode()), needs: 'note' },
  { title: 'ייבוא תמונה', run: importImages, needs: 'note' },
  { title: 'ציור חדש', run: newDrawing, needs: 'note' },
  { title: 'אחורה להערה הקודמת', keys: 'Alt+←', run: () => goHistory(-1) },
  { title: 'קדימה', keys: 'Alt+→', run: () => goHistory(1) },
  { title: 'הצגת ההערה בעץ הקבצים', run: revealInTree, needs: 'note' },
  { title: 'כיווץ כל התיקיות', run: collapseAll, needs: 'root' },
  { title: 'פתיחת כל התיקיות', run: expandAll, needs: 'root' },
  { title: 'הצגת ההערה בסייר הקבצים של Windows', run: () => window.api.reveal(state.currentPath), needs: 'note' },
  { title: 'הגדרות', keys: 'Ctrl+,', run: openSettings },
  { title: 'החלפת תיקיית עבודה', run: async () => enterRoot(await window.api.pickFolder()) },
];
const available = (c) => !c.needs || (c.needs === 'root' ? !!state.root : !!state.currentPath);

function openCommands() {
  openPalette({
    placeholder: 'הקלד פקודה…',
    footer: '↑↓ בחירה · Enter הפעלה · Esc סגירה',
    items: (query) => {
      const list = [];
      for (const c of COMMANDS) {
        if (!available(c) || c.run === openCommands) continue;
        const m = fuzzy(query, c.title);
        if (m) list.push({ score: m.score, title: c.title, marks: m.marks, keys: c.keys, run: c.run });
      }
      return query.trim() ? list.sort((a, b) => b.score - a.score) : list;
    },
  });
}

// "Ctrl+Shift+N" -> בדיקה מול אירוע מקלדת
const CODE_OF = { ',': 'Comma', '←': 'ArrowLeft', '→': 'ArrowRight' };
function matchesKeys(e, keys) {
  const parts = keys.split('+');
  const key = parts.pop();
  const code = CODE_OF[key] || (/^[A-Z]$/.test(key) ? 'Key' + key : /^\d$/.test(key) ? 'Digit' + key : key);
  return e.code === code
    && (e.ctrlKey || e.metaKey) === parts.includes('Ctrl')
    && e.shiftKey === parts.includes('Shift')
    && e.altKey === parts.includes('Alt');
}

// שלב הלכידה: הקיצורים של האפליקציה קודמים לעורך (למשל Ctrl+E)
window.addEventListener('keydown', (e) => {
  // בזמן דיאלוג (שם, אישור, הגדרות) הקיצורים כבויים
  if ($('dlg').open || document.getElementById('settings')?.open || document.getElementById('paint')?.open) return;
  for (const c of COMMANDS) {
    if (!c.keys || !matchesKeys(e, c.keys)) continue;
    // בתוך חלון החיפוש המהיר עובדים רק המעברים בינו לבין לוח הפקודות
    if (isPaletteOpen() && c.run !== openSwitcher && c.run !== openCommands) return;
    e.preventDefault();
    e.stopPropagation();
    closePalette();
    if (available(c)) c.run();
    return;
  }
}, true);
// כפתורי אחורה/קדימה בעכבר
window.addEventListener('mouseup', (e) => {
  if (e.button === 3) goHistory(-1);
  if (e.button === 4) goHistory(1);
});
window.addEventListener('beforeunload', () => { if (state.dirty) flushSave(); });

// ===== התחלה =====
(async () => {
  await loadPrefs();
  const r = await window.api.init();
  if (r) await enterRoot(r);
})();
