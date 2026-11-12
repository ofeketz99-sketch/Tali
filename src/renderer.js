// נקודת הכניסה של הממשק: מחברת בין העורך, הסרגל והקבצים.
import { createEditor } from './editor.js';
import { buildToolbar } from './toolbar.js';
import { renderTree, renderSearchResults } from './sidebar.js';
import { createContextPanel, countWords } from './context-panel.js';
import { setupContextMenus, closeContextMenu } from './context-menu.js';
import { FLAG_LIST, flagName } from './flags.js';
import { getFlag, setFlag, getCreatedDate } from '../vault-data.js';
import { resolveLink, extractLinks, getFrontmatterLinks, setFrontmatterLinks } from '../links.js';
import { openLinkPicker } from './linkpicker.js';
import { showLinkHubOffer } from './linkhub.js';
import { fileUrl, bumpImage } from './embed.js';
import { openPaint } from './paint.js';
import { createPageOverlay } from './page-overlay.js';
import { icon } from './icons.js';
import { setupHoverPreview } from './hover-preview.js';
import { openGraph, openGhosts, openTags, openTasks } from './vault-views.js';
import { exportHtml, EXPORT_CSS } from './export.js';

// אייקונים בכפתורים שב־index.html: <span data-icon="plus">
for (const el of document.querySelectorAll('[data-icon]')) el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon, 18));

// Common dialog behavior: Escape or a click on the backdrop closes the top modal.
// A cancelable "cancel" event lets the paint dialog guard unsaved artwork.
function requestDialogDismiss(dialog) {
  const request = new Event('cancel', { cancelable: true });
  if (dialog.dispatchEvent(request)) dialog.close();
}
function topDialog() {
  return [...document.querySelectorAll('dialog[open]')].at(-1) || null;
}
document.addEventListener('keydown', (event) => {
  const dialog = topDialog();
  if (!dialog || event.key !== 'Escape') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  requestDialogDismiss(dialog);
}, true);
document.addEventListener('pointerdown', (event) => {
  const dialog = topDialog();
  if (!dialog || event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom) {
    event.preventDefault();
    requestDialogDismiss(dialog);
  }
}, true);

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
// מצב השמירה בשורת המצב: נקודה וטקסט קצר
const SAVE_TEXT = { dirty: 'שומר…', saved: 'נשמר', error: 'לא נשמר' };
function setSaveState(s) {
  const d = document.getElementById('saveDot');
  if (d) d.dataset.state = s || '';
  const t = document.getElementById('saveText');
  if (t) { t.textContent = SAVE_TEXT[s] || ''; t.dataset.state = s || ''; }
}
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
  flags: new Map(), // נתיב → צבע הדגל (flags.js)
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
const noteChanged = () => {
  state.dirty = true;
  setSaveState('dirty');
  scheduleWordCount();
  docPanel?.scheduleRefresh();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 600);
};
const editorApi = createEditor({
  element: $('editor'),
  rawElement: $('raw'),
  propsElement: $('props'),
  onChange: noteChanged,
  links: {
    getNotes: () => allNotes().filter((n) => n.path !== state.currentPath),
    resolve: resolveTarget,
    onOpen: openLink,
    onLinked: offerLinkHub,
    onEditDrawing: editDrawing,
    localSrc,
    read: (p) => window.api.read(p),
    onTag: (tag) => showTags(tag),
  },
  onImageFiles: saveDroppedImages,
});
const hoverPreview = setupHoverPreview({
  resolve: resolveTarget, read: (p) => window.api.read(p), fileUrl, onOpen: openLink, isNote,
});
const pageOverlay = createPageOverlay({ page: $('page'), onChange: noteChanged });
editorApi.setOverlayController(pageOverlay);
const useOverlay = (tool) => {
  if (!state.currentPath) { setStatus('קודם פותחים מסמך'); return; }
  if (editorApi.isRaw()) { setStatus('עבור לתצוגה המעוצבת כדי לשרטט על הדף'); return; }
  pageOverlay.setEnabled(true);
  if (tool === 'textbox') pageOverlay.setMode('textbox');
  else pageOverlay.openDrawing();
  setStatus('בחר כלי ושרטט על הדף. Esc מסיים את הקבוצה.');
};
const toolbarApi = buildToolbar($('toolbar'), editorApi, {
  onImage: importImages,
  onDraw: newDrawing,
  onOverlayDraw: useOverlay,
  onTaskSection: insertTaskSection,
  onFocusMode: () => toggleFocusMode(),
});

// ===== תפריט הלחיצה הימנית על הדף ובשדות טקסט (context-menu.js). הפעולות: אותן של הסרגל (edit-actions.js) =====
setupContextMenus({
  editorApi,
  edit: toolbarApi.edit,
  isNoteOpen: () => !!state.currentPath,
  clipboard: (cmd) => window.api.editCommand(cmd),
  flag: { list: FLAG_LIST, get: () => state.flags.get(state.currentPath) || null, set: (c) => setNoteFlag(state.currentPath, c) },
});

// ===== מצב מיקוד: רק הדף. הסרגלים, שורת המצב ולוח ההקשר מוסתרים. F11 או הכפתור בפינה יוצאים =====
const focusExit = document.createElement('button');
focusExit.type = 'button';
focusExit.id = 'focusExit';
focusExit.hidden = true;
focusExit.innerHTML = `${icon('focusExit', 16)}<span>יציאה ממצב מיקוד</span>`;
focusExit.dataset.tip = 'יציאה ממצב מיקוד (F11)';
focusExit.addEventListener('click', () => toggleFocusMode(false));
document.body.append(focusExit);
function toggleFocusMode(on = !document.body.dataset.focus) {
  if (on && !state.currentPath) return;
  if (on) document.body.dataset.focus = '1'; else delete document.body.dataset.focus;
  focusExit.hidden = !on;
  if (on) editorApi.editor.commands.focus();
}

// ===== מיקום בכל מסמך: גלילה וסמן, כדי שחזרה למסמך תמשיך מאותו מקום =====
let docPositions = new Map();
const positionsKey = () => 'tali:pos:' + state.root;
function loadPositions() { docPositions = new Map(store.get(positionsKey(), [])); }
function rememberPosition() {
  if (!state.currentPath || !state.root) return;
  const cursor = editorApi.isRaw() ? null : editorApi.editor.state.selection.from;
  docPositions.delete(state.currentPath);
  docPositions.set(state.currentPath, { s: Math.round($('pageWrap').scrollTop), c: cursor });
  while (docPositions.size > 300) docPositions.delete(docPositions.keys().next().value);
  store.set(positionsKey(), [...docPositions]);
}
function restorePosition(p) {
  const wrap = $('pageWrap');
  const saved = docPositions.get(p);
  const jump = (top) => { wrap.style.scrollBehavior = 'auto'; wrap.scrollTop = top; wrap.style.scrollBehavior = ''; };
  if (!saved) { jump(0); return; }
  if (saved.c != null && !editorApi.isRaw()) {
    const size = editorApi.editor.state.doc.content.size;
    try { editorApi.editor.commands.setTextSelection(Math.max(1, Math.min(saved.c, size - 1))); } catch { /* מסמך שהשתנה מבחוץ */ }
  }
  // תמונות והטמעות נטענות אחרי הפתיחה ומגדילות את הדף, ולכן מנסים שוב, כל עוד המשתמש לא גלל בעצמו
  jump(saved.s);
  let tries = 0;
  const again = () => {
    if (state.currentPath !== p || Math.abs(wrap.scrollTop - saved.s) < 2 || ++tries > 6) return;
    jump(saved.s);
    setTimeout(again, 120);
  };
  requestAnimationFrame(again);
}
let positionTimer = null;
$('pageWrap').addEventListener('scroll', () => { clearTimeout(positionTimer); positionTimer = setTimeout(rememberPosition, 400); }, { passive: true });

// ===== לחיצה מחוץ לחלון משני סוגרת אותו =====
// (תפריטים, תצוגה מקדימה, הצעת פתק קישור, חלונות dialog ותפריט ימני סוגרים את עצמם. כאן: לוח ההקשר והודעות)
document.addEventListener('pointerdown', (e) => {
  const t = e.target;
  const toast = $('toast');
  if (toast && !toast.hidden && !toast.contains(t)) toast.hidden = true;
  docPanel?.outsideClick(t);
}, true);

// ===== צד ימין: פתוח או פס אייקונים =====
// מצב "מוסתר" ישן (עד 3.0) חוזר כפס אייקונים, כדי שהסרגל לא ייעלם בלי דרך להחזיר אותו.
let sidebarMode = store.get('tali:sidebar-mode', 'expanded');
if (sidebarMode === 'hidden') sidebarMode = 'compact';
if (!['expanded', 'compact'].includes(sidebarMode)) sidebarMode = 'expanded';
function setSidebarMode(next) {
  sidebarMode = next;
  store.set('tali:sidebar-mode', next);
  document.body.dataset.sidebarMode = next;
  const min = $('btnSidebarMin');
  min.innerHTML = icon(next === 'compact' ? 'panelExpand' : 'panelCollapse', 18);
  min.dataset.tip = next === 'compact' ? 'הרחבת הסרגל הימני' : 'צמצום הסרגל הימני';
  min.setAttribute('aria-label', min.dataset.tip);
  min.setAttribute('aria-expanded', next === 'expanded' ? 'true' : 'false');
}
$('btnSidebarMin').addEventListener('click', () => setSidebarMode(sidebarMode === 'compact' ? 'expanded' : 'compact'));
setSidebarMode(sidebarMode);

// ===== ציורים =====
function drawingStamp() {
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}.${two(d.getMinutes())}.${two(d.getSeconds())}`;
}
function newDrawing() {
  if (!state.currentPath) { setStatus('קודם פותחים מסמך, ואז מוסיפים לו ציור'); return; }
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
  if (!state.currentPath) { setStatus('קודם פותחים מסמך, ואז מוסיפים לו תמונה'); return; }
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

// שם המסמך הפתוח, מעל הדף. לחיצה: שינוי שם (כמו F2)
// ולידו (#docMeta): התיקייה (לחיצה מראה בעץ) ותאריך היצירה.
// התאריך: מתוך ההערה (getCreatedDate), ואם אין, המוקדם מבין זמן היצירה והשינוי של הקובץ,
// כי העתקה או סנכרון מאפסים את זמן היצירה (ואז הוא אחרי זמן השינוי).
function updateDocTitle() {
  const p = state.currentPath;
  $('docTitle').textContent = p ? noteName(p) : '';
  const meta = $('docMeta');
  meta.hidden = !p;
  if (!p) return;
  const rel = dirname(p).slice(state.root.length + 1);
  const folder = meta.querySelector('.dm-folder');
  // נתיב ארוך: התיקייה הראשונה והאחרונה (הקרובה למסמך, החשובה), והנתיב המלא בריחוף
  const parts = rel ? rel.split(/[\\/]/) : [];
  folder.querySelector('span').textContent = !parts.length ? 'התיקייה הראשית'
    : parts.length > 2 ? `${parts[0]} › … › ${parts[parts.length - 1]}` : parts.join(' › ');
  folder.dataset.tip = parts.length > 2 ? `${parts.join(' › ')} · הצגה בעץ` : 'הצגה בעץ';
  const date = meta.querySelector('.dm-date');
  const fromNote = getCreatedDate(state.diskText || '');
  const show = (ms, tip) => {
    if (state.currentPath !== p) return;
    date.querySelector('span').textContent = new Date(ms).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
    date.dataset.tip = tip;
    date.hidden = false;
  };
  if (fromNote) {
    const [y, m, d] = fromNote.split('-').map(Number);
    show(new Date(y, m - 1, d).getTime(), 'נוצר (לפי התאריך שבמסמך)');
  } else {
    date.hidden = true;
    window.api.fileTimes(p).then((t) => show(Math.min(t.birth || t.mtime, t.mtime), 'נוצר (לפי הקובץ)')).catch(() => {});
  }
}
$('docTitle').addEventListener('click', () => { if (state.currentPath) renameNode(currentNode()); });
$('docMeta').querySelector('.dm-folder').addEventListener('click', () => revealInTree());

// ספירת מילים בשורת המצב (בתצוגה המעוצבת: הטקסט המוצג, ב־Markdown: הטקסט הגולמי)
function updateWordCount() {
  const out = $('wordCount');
  if (!state.currentPath) { out.textContent = ''; return; }
  const text = editorApi.isRaw() ? $('raw').value : (document.querySelector('#editor .ProseMirror')?.innerText || '');
  const n = countWords(text);
  out.textContent = n === 1 ? 'מילה אחת' : `${n.toLocaleString('he-IL')} מילים`;
}
let wordTimer = null;
function scheduleWordCount() { clearTimeout(wordTimer); wordTimer = setTimeout(updateWordCount, 400); }

// פס גלילה שמופיע רק בזמן גלילה או בריחוף על הפס עצמו
const scrollTimers = new WeakMap();
document.addEventListener('scroll', (e) => {
  const el = e.target === document ? document.documentElement : e.target;
  if (!(el instanceof Element)) return;
  el.classList.add('is-scrolling');
  clearTimeout(scrollTimers.get(el));
  scrollTimers.set(el, setTimeout(() => el.classList.remove('is-scrolling'), 900));
}, true);
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
    if (!state.dirty) setSaveState('saved');
    refreshLinksPanel(); // ייתכן שהמאפיינים (links:) נערכו ידנית
    noteFlagChanged(p, getFlag(content));
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
      showToast('המסמך נערך גם מחוץ לאפליקציה. השינויים שלך נשמרו, והגרסה האחרת נשמרה כמסמך נפרד.',
        'פתיחת הגרסה האחרת', () => openNote(copy));
      refreshTree();
    }
    state.mtime = await window.api.write(p, content, null);
    state.diskText = content;
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
  refreshLinksPanel();
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
  setStatus('המסמך עודכן מהדיסק');
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
  x.innerHTML = icon('close', 15);
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
  const focusedPath = document.activeElement?.closest?.('#tree .node')?.dataset.path;
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
    onDelete: deleteNode,
    onMove: moveNode,
    root: state.root,
    flagOf: (p) => state.flags.get(p) || null,
  });
  if (focusedPath) {
    const row = [...$('tree').querySelectorAll('.node')].find(n => n.dataset.path === focusedPath);
    row?.focus({ preventScroll: true });
  }
}

async function refreshTree() {
  const r = await window.api.tree();
  state.tree = r.tree;
  state.attachments = await window.api.attachments();
  notesCache = null;
  drawTree();
  refreshFlags();
  editorApi.refreshLinks();
  refreshBacklinks();
  refreshLinksPanel();
}

function targetDir() {
  if (getPrefs().newNoteLocation === 'root') return state.root;
  return state.selectedDir || (state.currentPath ? dirname(state.currentPath) : state.root);
}

async function openNote(p, { history = true } = {}) {
  await flushSave();
  rememberPosition();
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
  pageOverlay.setEnabled(!editorApi.isRaw());
  $('empty').hidden = true;
  $('page').hidden = false;
  restorePosition(p);
  setSaveState('saved');
  // כניסה רכה של הדף בכל פתיחת הערה
  const pg = $('page');
  pg.classList.remove('enter');
  void pg.offsetWidth;
  pg.classList.add('enter');
  setStatus(prettyPath(p));
  updateDocTitle();
  updateWordCount();
  drawTree();
  refreshBacklinks();
  refreshLinksPanel();
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
    setStatus(`נוצר מסמך חדש: ${name}`);
  } catch (err) { setStatus(err.message); }
}

let backlinksToken = 0;
function refreshBacklinks() { docPanel?.refreshBacklinks(); }

async function goHistory(dir) {
  const from = dir < 0 ? state.back : state.forward;
  const to = dir < 0 ? state.forward : state.back;
  const p = from.pop();
  if (!p) return;
  if (state.currentPath) to.push(state.currentPath);
  try { await openNote(p, { history: false }); }
  catch { setStatus('המסמך כבר לא קיים'); }
}

async function enterRoot(r) {
  if (!r) return;
  await flushSave();
  rememberPosition();
  toggleFocusMode(false);
  state.root = r.root;
  loadPositions();
  state.tree = r.tree;
  $('vaultName').textContent = r.root.split(/[\\/]/).filter(Boolean).pop() || r.root;
  $('vaultName').title = r.root;
  state.attachments = await window.api.attachments();
  notesCache = null;
  state.currentPath = null;
  state.dirty = false;
  pageOverlay.setEnabled(false);
  state.selectedDir = null;
  state.back = [];
  state.forward = [];
  state.recent = store.get('recent:' + r.root, []);
  state.collapsed = new Set(store.get('collapsed:' + r.root, []));
  $('page').hidden = true;
  $('empty').hidden = false; docPanel?.layout(); toggleFocusMode(false);
  $('btnPickBig').hidden = true;
  setSaveState('');
  $('wordCount').textContent = '';
  setStatus('תיקיית המסמכים: ' + $('vaultName').textContent);
  drawTree();
  refreshFlags();
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
    if (!state.currentPath) { pageOverlay.setEnabled(false); $('page').hidden = true; $('empty').hidden = false; docPanel?.layout(); toggleFocusMode(false); }
    else { setStatus(prettyPath(state.currentPath)); updateDocTitle(); }
    const others = changed.filter((p) => p !== to).length;
    if (others) setStatus(`הקישורים עודכנו ב־${others} מסמכים`);
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
      pageOverlay.setEnabled(false);
      $('page').hidden = true;
      $('empty').hidden = false; docPanel?.layout(); toggleFocusMode(false);
    }
    await refreshTree();
  } catch (err) { setStatus(err.message); }
}

// ===== העברה בגרירה לתיקייה אחרת =====
async function moveNode(src, destDir) {
  const sepIdx = Math.max(src.lastIndexOf('/'), src.lastIndexOf('\\'));
  if (src.slice(0, sepIdx) === destDir) return; // כבר שם
  try {
    await flushSave();
    const { to, changed } = await window.api.move(src, destDir);
    const swap = (p) => (p === src ? to : p.startsWith(src + '\\') || p.startsWith(src + '/') ? to + p.slice(src.length) : p);
    state.back = state.back.map(swap);
    state.forward = state.forward.map(swap);
    state.recent = state.recent.map(swap);
    store.set('recent:' + state.root, state.recent);
    if (state.currentPath) {
      state.currentPath = swap(state.currentPath);
      if (changed.includes(state.currentPath)) await reloadFromDisk();
      else state.mtime = await window.api.mtime(state.currentPath);
      updateDocTitle();
    }
    state.collapsed.delete(destDir);
    saveCollapsed();
    await refreshTree();
    const others = changed.filter((p) => p !== state.currentPath).length;
    setStatus(`הועבר אל ${destDir === state.root ? 'התיקייה הראשית' : prettyPath(destDir)}` + (others ? ` · הקישורים עודכנו ב־${others} מסמכים` : ''));
  } catch (err) { setStatus(err.message); }
}

// ===== תצוגות על כל הכספת: גרף, תגיות, משימות, הערות רפאים =====
const vaultIndex = async () => { await flushSave(); return window.api.vaultIndex(); };
async function showGraph() {
  if (!state.root) return;
  openGraph({
    index: await vaultIndex(), current: state.currentPath, store,
    onOpen: (t) => (t.path ? openNote(t.path) : openLink(t.create)),
  });
}
async function showTags(initial) {
  if (!state.root) return;
  openTags({ index: await vaultIndex(), initial, onOpenNote: (p) => openNote(p) });
}
async function showGhosts() {
  if (!state.root) return;
  openGhosts({ index: await vaultIndex(), onOpenNote: (p) => openNote(p), onCreate: (name) => openLink(name) });
}
// kind: 'followUp' (משימות להמשך) או 'checks' (תיבות סימון). בלי: מה שנבחר בפעם הקודמת
async function showTasks(kind) {
  if (!state.root) return;
  openTasks({ index: await vaultIndex(), store, kind, onOpenTask: openTask, onToggle: toggleTask });
}

// ===== דגלים (flags.js): נשמרים במאפייני המסמך, ומוצגים בעץ וברשימת המסומנים =====
let flagsToken = 0;
async function refreshFlags() {
  if (!state.root) return;
  const token = ++flagsToken;
  const idx = await window.api.vaultIndex().catch(() => null);
  if (!idx || token !== flagsToken) return;
  state.flags = new Map(idx.notes.filter((n) => n.flag).map((n) => [n.path, n.flag]));
  drawTree();
  renderFlagged();
}
function noteFlagChanged(p, color) {
  if ((state.flags.get(p) || null) === (color || null)) return;
  if (color) state.flags.set(p, color); else state.flags.delete(p);
  drawTree();
  renderFlagged();
  if (p === state.currentPath) docPanel?.rerender();
}
// במסמך הפתוח: דרך העורך (נשמר כמו כל עריכה, בלי לטעון מחדש). במסמך אחר: ישירות בקובץ.
async function setNoteFlag(p, color) {
  if (!p) return;
  try {
    if (p === state.currentPath) {
      editorApi.updateFrontmatter((text) => setFlag(text, color));
    } else {
      const text = await window.api.read(p);
      const next = setFlag(text, color);
      if (next !== text) await window.api.write(p, next, null);
    }
    noteFlagChanged(p, color);
    setStatus(color ? `סומן בדגל ${flagName(color)}: ${noteName(p)}` : `הדגל הוסר: ${noteName(p)}`);
  } catch (err) { setStatus('שגיאה בשמירת הדגל: ' + err.message); }
}
// רשימת המסומנים בסרגל הימני (מוצגת או מוסתרת בכפתור הדגל שמתחת לחיפוש)
let showFlagged = store.get('tali:show-flagged', false);
let flaggedFilter = store.get('tali:flagged-filter', null);
function renderFlagged() {
  const box = $('flagged');
  $('btnFlagged').classList.toggle('on', showFlagged);
  $('btnFlagged').setAttribute('aria-pressed', showFlagged ? 'true' : 'false');
  box.hidden = !showFlagged || !state.root;
  if (box.hidden) return;
  box.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'fl-head';
  head.innerHTML = `${icon('flag', 14)}<span>מסומנים</span>`;
  const chips = document.createElement('div');
  chips.className = 'fl-filter';
  const counts = {};
  for (const c of state.flags.values()) counts[c] = (counts[c] || 0) + 1;
  for (const fl of FLAG_LIST) {
    if (!counts[fl.id]) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fl-chip' + (flaggedFilter === fl.id ? ' on' : '');
    b.dataset.flag = fl.id;
    b.dataset.tip = `${fl.name} (${counts[fl.id]})`;
    b.setAttribute('aria-label', b.dataset.tip);
    b.addEventListener('click', () => { flaggedFilter = flaggedFilter === fl.id ? null : fl.id; store.set('tali:flagged-filter', flaggedFilter); renderFlagged(); });
    chips.append(b);
  }
  head.append(chips);
  box.append(head);
  const order = FLAG_LIST.map((x) => x.id);
  const list = [...state.flags.entries()]
    .filter(([, c]) => !flaggedFilter || c === flaggedFilter)
    .sort((a, b) => order.indexOf(a[1]) - order.indexOf(b[1]) || noteName(a[0]).localeCompare(noteName(b[0]), 'he'));
  if (!list.length) {
    const e = document.createElement('div');
    e.className = 'fl-empty';
    e.textContent = state.flags.size ? 'אין מסמכים בצבע הזה.' : 'אין מסמכים מסומנים. לחיצה ימנית על מסמך ← דגל.';
    box.append(e);
    return;
  }
  for (const [p, c] of list) {
    const row = document.createElement('div');
    row.className = 'fl-row' + (p === state.currentPath ? ' active' : '');
    row.tabIndex = 0;
    row.innerHTML = `<span class="flag-dot" data-flag="${c}"></span><span class="fl-name"></span>`;
    row.querySelector('.fl-name').textContent = noteName(p);
    row.dataset.tip = prettyPath(p);
    row.addEventListener('click', () => openNote(p));
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter') openNote(p); });
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); showContextMenu({ type: 'file', path: p, name: noteName(p) + '.md' }, e.clientX, e.clientY); });
    box.append(row);
  }
}
function toggleFlagged(on = !showFlagged) { showFlagged = on; store.set('tali:show-flagged', on); renderFlagged(); }
// פתיחת מסמך במשימה מסוימת: הסמן עובר לטקסט שלה
async function openTask(p, task) {
  await openNote(p);
  if (!task?.text) return;
  const ed = editorApi.editor;
  let found = null;
  ed.state.doc.descendants((node, pos) => {
    if (found != null || !node.isText) return;
    const i = node.text.indexOf(task.text);
    if (i >= 0) found = pos + i;
  });
  if (found != null) ed.chain().focus().setTextSelection(found).scrollIntoView().run();
}
// סימון משימה מחלון המשימות: משנים רק את [ ] / [x] בשורה הזו, ורק אם השורה עדיין אותה משימה
async function toggleTask(p, task, done) {
  if (p === state.currentPath) await flushSave();
  const text = await window.api.read(p);
  const lines = text.split('\n');
  const line = lines[task.line] ?? '';
  const re = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/;
  if (!re.test(line) || !line.includes(task.text)) throw new Error('המשימה השתנתה בינתיים');
  lines[task.line] = line.replace(re, `$1${done ? 'x' : ' '}$3`);
  await window.api.write(p, lines.join('\n'), null);
  if (p === state.currentPath) await reloadFromDisk();
  return window.api.vaultIndex();
}
// "משימות להמשך": כותרת ורשימת תיבות סימון בסוף המסמך. אם כבר יש כזו, הסמן עובר אליה.
const TASK_SECTION = 'משימות להמשך';
function insertTaskSection() {
  if (!state.currentPath) { setStatus('קודם פותחים מסמך'); return; }
  if (editorApi.isRaw()) { setStatus('עובד בתצוגה המעוצבת'); return; }
  const ed = editorApi.editor;
  let headingEnd = null;
  ed.state.doc.forEach((node, offset) => {
    if (node.type.name === 'heading' && node.textContent.trim() === TASK_SECTION) headingEnd = offset + node.nodeSize;
  });
  if (headingEnd != null) {
    const after = ed.state.doc.nodeAt(headingEnd);
    if (after?.type.name === 'taskList') {
      const end = headingEnd + after.nodeSize - 2;
      ed.chain().focus().setTextSelection(end).scrollIntoView().run();
      return;
    }
  }
  const end = ed.state.doc.content.size;
  ed.chain().focus().insertContentAt(end, [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: TASK_SECTION }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] },
  ]).run();
  ed.chain().focus().setTextSelection(ed.state.doc.content.size - 3).scrollIntoView().run();
}

// ===== ייצוא ל־PDF / Word =====
async function exportNote(format, node = currentNode()) {
  if (!node) return;
  try {
    if (node.path !== state.currentPath) await openNote(node.path);
    if (editorApi.isRaw()) editorApi.toggleRaw();
    await flushSave();
    setStatus(format === 'pdf' ? 'מייצא ל־PDF…' : 'מייצא ל־Word…');
    const html = exportHtml($('editor').querySelector('.ProseMirror'));
    const out = await window.api.exportNote(format, noteName(state.currentPath), html, EXPORT_CSS);
    if (!out) { setStatus('הייצוא בוטל'); return; }
    showToast(`נשמר: ${out}`, 'פתיחה', () => window.api.openExternalFile(out));
    setStatus('הייצוא הושלם');
  } catch (err) { setStatus('שגיאה בייצוא: ' + err.message); }
}

// ===== תפריט ימני =====
// רוחב אחיד, אייקון לכל פעולה, קו דהוי בין פעולות. נפתח לכיוון פנים החלון ולא נחתך.
function showContextMenu(node, x, y) {
  const menu = $('ctx');
  menu.innerHTML = '';
  const add = (ic, text, fn, { keys, danger } = {}) => {
    const item = document.createElement('div');
    item.className = 'ctx-item' + (danger ? ' danger' : '');
    item.setAttribute('role', 'menuitem');
    item.innerHTML = `${icon(ic, 16)}<span class="ctx-label"></span>${keys ? `<kbd>${keys}</kbd>` : ''}`;
    item.querySelector('.ctx-label').textContent = text;
    item.addEventListener('click', () => { hideMenu(); fn(); });
    menu.appendChild(item);
  };
  const isFile = node.type === 'file';
  if (isFile) {
    add('edit', 'שינוי שם', () => renameNode(node), { keys: 'F2' });
    add('copy', 'שכפול', () => duplicateNode(node));
    add('link', 'קישור לפתקים אחרים…', () => pickLinksFor(node.path));
    add('exportPdf', 'ייצוא ל־PDF', () => exportNote('pdf', node));
    add('exportWord', 'ייצוא ל־Word', () => exportNote('doc', node));
    // דגל: שורת צבעים (וללא)
    const current = state.flags.get(node.path) || null;
    const flags = document.createElement('div');
    flags.className = 'ctx-flags';
    flags.innerHTML = `${icon('flag', 16)}<span class="ctx-label">דגל</span>`;
    for (const fl of [{ id: null, name: 'ללא דגל' }, ...FLAG_LIST]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ctx-flag' + (fl.id === current ? ' on' : '') + (fl.id ? '' : ' none');
      if (fl.id) b.dataset.flag = fl.id;
      b.dataset.tip = fl.name;
      b.setAttribute('aria-label', fl.name);
      b.addEventListener('click', (e) => { e.stopPropagation(); hideMenu(); setNoteFlag(node.path, fl.id); });
      flags.append(b);
    }
    menu.appendChild(flags);
  } else {
    add('filePlus', 'מסמך חדש בתיקייה', () => { state.selectedDir = node.path; newNote(); });
    add('edit', 'שינוי שם', () => renameNode(node), { keys: 'F2' });
  }
  add('trash', 'מחיקה (לסל המחזור)', () => deleteNode(node), { danger: true });

  menu.hidden = false;
  // מצמידים את הפינה לסמן, לכיוון פנים החלון (הסרגל בצד ימין, אז ברירת המחדל נפתחת שמאלה)
  const w = menu.offsetWidth, h = menu.offsetHeight;
  let left = x - w;
  if (left < 8) left = Math.min(x, window.innerWidth - w - 8);
  let top = y;
  if (top + h > window.innerHeight - 8) top = Math.max(8, y - h);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}
function hideMenu() { $('ctx').hidden = true; }
document.addEventListener('click', hideMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideMenu(); });
window.addEventListener('blur', hideMenu);
$('tree').addEventListener('scroll', hideMenu);

// ===== שכפול =====
async function duplicateNode(node) {
  try {
    if (node.path === state.currentPath) await flushSave();
    const copy = await window.api.duplicate(node.path);
    await refreshTree();
    await openNote(copy);
    setStatus(`נוצר עותק: ${noteName(copy)}`);
  } catch (err) { setStatus('שגיאה בשכפול: ' + err.message); }
}

// ===== קישור לפתקים אחרים: בורר עם בחירה מרובה, נשמר במאפייני ההערה (links:) =====
async function pickLinksFor(target) {
  try {
    if (target === state.currentPath) await flushSave();
    const text = target === state.currentPath ? editorApi.getMarkdown() : await window.api.read(target);
    const files = allNotes().map((n) => n.path);
    const current = getFrontmatterLinks(text).map((t) => resolveLink(t, files, state.root)).filter(Boolean);
    openLinkPicker({
      title: `קישור ״${noteName(target)}״ לפתקים אחרים`,
      notes: allNotes().filter((n) => n.path !== target),
      selected: current,
      onSave: (paths) => applyNoteLinks(target, paths),
    });
  } catch (err) { setStatus(err.message); }
}

async function applyNoteLinks(target, paths) {
  try {
    if (target === state.currentPath) await flushSave();
    const text = await window.api.read(target);
    const files = allNotes().map((n) => n.path);
    // שומרים את הסדר הקיים, ומוסיפים חדשים בסוף. קישורים לפתקים שלא קיימים נשארים כמו שהם.
    const existing = getFrontmatterLinks(text);
    const keep = existing.filter((t) => { const p = resolveLink(t, files, state.root); return !p || paths.includes(p); });
    const keptPaths = new Set(keep.map((t) => resolveLink(t, files, state.root)).filter(Boolean));
    const targets = [...keep, ...paths.filter((p) => !keptPaths.has(p)).map(linkTextFor)];
    const next = setFrontmatterLinks(text, targets);
    if (next !== text) await window.api.write(target, next, null);
    if (target === state.currentPath) await reloadFromDisk();
    refreshLinksPanel();
    refreshBacklinks();
    showToast(paths.length ? `״${noteName(target)}״ מקושר עכשיו ל־${paths.length} פתקים.` : `הקישורים של ״${noteName(target)}״ הוסרו.`);
  } catch (err) { setStatus('שגיאה בשמירת הקישורים: ' + err.message); }
}

// ===== לוח ההקשר (src/context-panel.js): קישורים, קישורים חוזרים, ראשי פרקים, משימות, מידע =====
// eslint-disable-next-line prefer-const
var docPanel = createContextPanel({
  root: $('docCtx'), wrap: $('pageWrap'), icon, store,
  api: {
    getPath: () => state.currentPath,
    getMarkdown: () => editorApi.getMarkdown(),
    isRaw: () => editorApi.isRaw(),
    getEditor: () => editorApi.editor,
    resolve: (t) => resolveTarget(t),
    openLink: (t) => openLink(t),
    openNote: (p) => openNote(p),
    backlinks: (p) => window.api.backlinks(p),
    pickLinks: () => pickLinksFor(state.currentPath),
    removeFrontLink: (t) => {
      const files = allNotes().map((n) => n.path);
      const remaining = getFrontmatterLinks(editorApi.getMarkdown()).filter((x) => x !== t)
        .map((x) => resolveLink(x, files, state.root)).filter(Boolean);
      applyNoteLinks(state.currentPath, remaining);
    },
    showTag: (t) => showTags(t),
    addTaskSection: () => insertTaskSection(),
    addFollowUp: (t) => toolbarApi.edit.addFollowUp(t),
    getFlag: () => state.flags.get(state.currentPath) || null,
    setFlag: (c) => setNoteFlag(state.currentPath, c),
    getMtime: () => state.mtime,
    prettyPath: (p) => prettyPath(p),
  },
});
function refreshLinksPanel() { docPanel.refresh(); }

// ===== כפתורים =====
$('btnPick').addEventListener('click', async () => enterRoot(await window.api.pickFolder()));
$('btnPickBig').addEventListener('click', async () => enterRoot(await window.api.pickFolder()));
$('btnSettings').addEventListener('click', openSettings);

async function newNote(presetName) {
  if (!state.root) return;
  const name = presetName || await ask('שם המסמך:');
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
$('btnFolder').addEventListener('click', newFolder);
$('btnGraph').addEventListener('click', showGraph);
$('btnTags').addEventListener('click', () => showTags());
$('btnTasks').addEventListener('click', () => showTasks());
$('btnGhosts').addEventListener('click', showGhosts);
$('btnFlagged').addEventListener('click', () => toggleFlagged());

// הצגת Patch Notes מה־CHANGELOG המתוחזק בגיטהאב. תוכן ה־Markdown מוצג כטקסט בטוח.
function appendPatchText(target, value) {
  for (const part of value.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)) {
    if (!part) continue;
    if (part.startsWith('`') && part.endsWith('`')) {
      const code = document.createElement('code');
      code.textContent = part.slice(1, -1);
      target.append(code);
    } else if (part.startsWith('**') && part.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      target.append(strong);
    } else {
      target.append(document.createTextNode(part));
    }
  }
}
function renderPatchNotes(markdown) {
  const box = $('patchNotesContent');
  box.replaceChildren();
  let group = null;
  let list = null;
  for (const originalLine of markdown.split(/\r?\n/)) {
    const line = originalLine.trim();
    const section = /^##\s+(.+)$/.exec(line);
    if (section) {
      if (/^טרם הושלם/.test(section[1])) break;
      group = document.createElement('section');
      group.className = 'patch-note-release';
      const title = document.createElement('h3');
      title.textContent = section[1];
      group.append(title);
      box.append(group);
      list = null;
    } else if (group && /^-\s+/.test(line)) {
      if (!list) { list = document.createElement('ul'); group.append(list); }
      const item = document.createElement('li');
      appendPatchText(item, line.replace(/^-\s+/, ''));
      list.append(item);
    } else if (group && line && !line.startsWith('#')) {
      const paragraph = document.createElement('p');
      appendPatchText(paragraph, line);
      group.append(paragraph);
      list = null;
    }
  }
  if (!box.children.length) box.textContent = 'עדיין אין הערות גרסה להצגה.';
}
async function openPatchNotes() {
  const dialog = $('patchNotesDialog');
  if (dialog.open) return;
  $('patchNotesContent').textContent = 'טוען עדכונים…';
  $('patchNotesSource').textContent = '';
  dialog.showModal();
  try {
    const data = await window.api.patchNotes();
    if (!dialog.open) return;
    renderPatchNotes(data.content || '');
    $('patchNotesSource').textContent = data.source === 'github'
      ? 'העדכונים נמשכו מ־GitHub'
      : 'מוצג עותק מקומי — לא ניתן כרגע לעדכן מ־GitHub';
  } catch {
    if (dialog.open) $('patchNotesContent').textContent = 'לא ניתן לטעון את עדכוני הגרסה כעת.';
  }
}
$('btnClosePatchNotes').addEventListener('click', () => $('patchNotesDialog').close());

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
    placeholder: 'הקלד שם של מסמך…',
    footer: '↑↓ בחירה · Enter פתיחה · Esc סגירה',
    emptyText: 'אין מסמכים',
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
          list.push({ title: `יצירת מסמך חדש: ${q}`, className: 'pal-create', run: () => newNote(q) });
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
  { title: 'מעבר מהיר למסמך', keys: 'Ctrl+O', run: openSwitcher, needs: 'root' },
  { title: 'לוח פקודות', keys: 'Ctrl+P', run: openCommands },
  { title: 'מסמך חדש', keys: 'Ctrl+N', run: () => newNote(), needs: 'root' },
  { title: 'תיקייה חדשה', keys: 'Ctrl+Shift+N', run: newFolder, needs: 'root' },
  { title: 'חיפוש בכל המסמכים', keys: 'Ctrl+Shift+F', run: () => { $('search').focus(); $('search').select(); }, needs: 'root' },
  { title: 'שמירה', keys: 'Ctrl+S', run: flushSave, needs: 'note' },
  { title: 'מעבר בין תצוגה מעוצבת ל־Markdown', keys: 'Ctrl+E', run: () => rawButton()?.click(), needs: 'note' },
  { title: 'שינוי שם המסמך', keys: 'F2', run: () => renameNode(currentNode()), needs: 'note' },
  { title: 'מחיקת המסמך (לסל המחזור)', run: () => deleteNode(currentNode()), needs: 'note' },
  { title: 'קישור לפתקים אחרים…', run: () => pickLinksFor(state.currentPath), needs: 'note' },
  { title: 'שכפול המסמך', run: () => duplicateNode(currentNode()), needs: 'note' },
  { title: 'ייבוא תמונה', run: importImages, needs: 'note' },
  { title: 'ציור חדש', run: newDrawing, needs: 'note' },
  { title: 'אחורה למסמך הקודם', keys: 'Alt+←', run: () => goHistory(-1) },
  { title: 'קדימה', keys: 'Alt+→', run: () => goHistory(1) },
  { title: 'הצגת המסמך בעץ הקבצים', run: revealInTree, needs: 'note' },
  { title: 'כיווץ כל התיקיות', run: collapseAll, needs: 'root' },
  { title: 'פתיחת כל התיקיות', run: expandAll, needs: 'root' },
  { title: 'הצגת המסמך בסייר הקבצים של Windows', run: () => window.api.reveal(state.currentPath), needs: 'note' },
  { title: 'הגדרות', keys: 'Ctrl+,', run: openSettings },
  { title: 'מה חדש (Patch Notes)', run: openPatchNotes },
  { title: 'גרף הקישורים', keys: 'Ctrl+G', run: showGraph, needs: 'root' },
  { title: 'תגיות', run: () => showTags(), needs: 'root' },
  { title: 'משימות להמשך בכל המסמכים', keys: 'Ctrl+Shift+T', run: () => showTasks('followUp'), needs: 'root' },
  { title: 'תיבות סימון בכל המסמכים', run: () => showTasks('checks'), needs: 'root' },
  { title: 'הצגת המסומנים בסרגל הימני (או הסתרה)', run: () => toggleFlagged(), needs: 'root' },
  ...FLAG_LIST.map((fl) => ({ title: `דגל ${fl.name} למסמך`, run: () => setNoteFlag(state.currentPath, fl.id), needs: 'note' })),
  { title: 'הסרת הדגל מהמסמך', run: () => setNoteFlag(state.currentPath, null), needs: 'note' },
  { title: 'מסמכי רפאים (קישורים למסמכים שלא נוצרו)', run: showGhosts, needs: 'root' },
  { title: 'משימות להמשך בסוף המסמך', run: insertTaskSection, needs: 'note' },
  { title: 'מצב מיקוד (רק הדף)', keys: 'F11', run: () => toggleFocusMode(), needs: 'note' },
  { title: 'לוח ההקשר: קישורים החוצה', run: () => docPanel.open('links'), needs: 'note' },
  { title: 'לוח ההקשר: קישורים פנימה', run: () => docPanel.open('back'), needs: 'note' },
  { title: 'לוח ההקשר: ראשי פרקים', run: () => docPanel.open('outline'), needs: 'note' },
  { title: 'לוח ההקשר: תיבות סימון במסמך', run: () => docPanel.open('checks'), needs: 'note' },
  { title: 'לוח ההקשר: משימות להמשך במסמך', run: () => docPanel.open('followups'), needs: 'note' },
  { title: 'לוח ההקשר: מידע על המסמך', run: () => docPanel.open('info'), needs: 'note' },
  { title: 'סגירת לוח ההקשר', run: () => docPanel.open(null), needs: 'note' },
  { title: 'הוספת מאפיינים', run: () => editorApi.addProperties(), needs: 'note' },
  { title: 'ייצוא ל־PDF', run: () => exportNote('pdf'), needs: 'note' },
  { title: 'ייצוא ל־Word', run: () => exportNote('doc'), needs: 'note' },
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
  if (topDialog() && !isPaletteOpen()) return;
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
window.addEventListener('beforeunload', () => { rememberPosition(); if (state.dirty) flushSave(); });

// ===== התחלה =====
(async () => {
  await loadPrefs();
  const r = await window.api.init();
  if (r) await enterRoot(r);
})();
