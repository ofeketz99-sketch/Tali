// נקודת הכניסה של הממשק: מחברת בין העורך, הסרגל והקבצים.
import { createEditor } from './editor.js';
import { buildToolbar } from './toolbar.js';
import { renderTree, renderSearchResults, filterTree, countFiles } from './sidebar.js';
import { createContextPanel, countWords } from './context-panel.js';
import { setupContextMenus, closeContextMenu, openContextMenu } from './context-menu.js';
import { FLAG_LIST, flagName } from './flags.js';
import { getFlag, setFlag, getCreatedDate, fillTemplate, headerToProps, isFollowUpHeading } from '../vault-data.js';
import { resolveLink, extractLinks, getFrontmatterLinks, setFrontmatterLinks } from '../links.js';
import { openLinkPicker } from './linkpicker.js';
import { openLinkHubName } from './linkhub.js';
import { createRelatedRow } from './related.js';
import { fileUrl, bumpImage, returnImageToText, isDrawing } from './embed.js';
import { writePngText, readPngText } from './png-meta.js';
import { imageFilesFrom, lonelyImageSrc, fileFromDataUrl } from './paste-images.js';
import { convertToPlainMarkdown, svgToPng } from './plain-md.js';
import { normalizeToolbar } from './toolbar-layout.js';
import { usesCompactToolbar } from './editor-behavior.js';
import { openPaint } from './paint.js';
import { createPageOverlay } from './page-overlay.js';
import { icon, lucide } from './icons.js';
import { setupHoverPreview } from './hover-preview.js';
import { openGraph, openGhosts, openTags, openTasks, openRecent } from './vault-views.js';
import { exportHtml, collectFloats, EXPORT_CSS } from './export.js';
import { configureMathInput } from './math.js';
import { buildDocx } from './export-docx.js';
import { openHeaderConvert } from './header-convert.js';
import { createTabs } from './tabs.js';
import { createHome } from './home.js';
import { createMeta } from './vault-meta.js';
import { openIconPicker } from './icon-picker.js';
import { openBackgroundPicker } from './folder-background.js';
import { renderNoteHtml } from './note-render.js';
import { createCanvasView } from './canvas-view.js';
import { ARCHIVE_DIR, isArchived, isArchiveRoot, archiveDirFor, restoreDirFor, withoutArchived } from './archive.js';

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
      // סוגריים עם אנגלית בסוף משפט בעברית ("(Ctrl+Shift+L)") מקבלים כיוון ימין לשמאל ומתהפכים.
      // עוטפים אותם בבידוד שמאל לימין (LRI…PDI), כך שהם מוצגים כיחידה אחת בצורה הנכונה.
      tip.textContent = el.dataset.tip.replace(/\([^()]*[A-Za-z0-9][^()]*\)/g, (m) => (/[֐-׿]/.test(m) ? m : `⁦${m}⁩`));
      tip.dir = 'rtl';
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
// 9.7: בזמן הקלדה (dirty) רק הנקודה מסמנת שינוי; "שומר…" מופיע רק כשכתיבה לדיסק מתארכת
const SAVE_TEXT = { saving: 'שומר…', saved: 'נשמר', error: 'לא נשמר' };
function setSaveState(s) {
  const d = document.getElementById('saveDot');
  if (d) d.dataset.state = s || '';
  const t = document.getElementById('saveText');
  if (t) { t.textContent = SAVE_TEXT[s] || ''; t.dataset.state = s || ''; }
}
import { loadPrefs, getPrefs, openSettings, setHotkeyCatalog, onPrefsChange, setPref } from './settings.js';
import { commandHotkey, matchesHotkey } from './hotkeys.js';
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
  canvas: false, // 10.4: המסמך הפתוח הוא קנבס (canvasView), לא העורך
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
// 10.4: מסמך גרפי. נפתח דרך openNote, אבל בתצוגה משלו (canvas-view.js) ולא בעורך
const isCanvas = (p) => /\.canvas$/i.test(p || '');

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
    onEditDrawing: editDrawing,
    localSrc,
    onFreeImage: (info) => freeImage(info),
    read: (p) => window.api.read(p),
    onTag: (tag) => showTags(tag),
  },
  onImageFiles: saveDroppedImages,
  shouldSortCompleted: () => getPrefs().completedTasksAtBottom,
  smartSymbols: () => getPrefs().smartSymbols !== false,
  onRawChange: () => renderRelated(),
});
onPrefsChange(() => editorApi.refreshPreferences());
// 10.3: מקלדת אנגלית בחלונית הנוסחה (math.js)
configureMathInput({ englishKeys: () => getPrefs().mathEnglishKeys !== false });
// 8.2: סדר והסתרה של קבוצות בסרגל הכלים (הגדרות ← סרגל הכלים)
const applyToolbarLayout = () => toolbarApi.applyLayout(normalizeToolbar(getPrefs()));
onPrefsChange(applyToolbarLayout);
const hoverPreview = setupHoverPreview({
  resolve: resolveTarget, read: (p) => window.api.read(p), fileUrl, onOpen: openLink, isNote,
});
// 10.6: אחורה/קדימה עברו מסרגל העיצוב לסרגל הכרטיסיות, ליד כפתור הבית (ניווט, כמו בדפדפן)
const navGroup = document.createElement('div');
navGroup.className = 'tab-nav';
// כרטיסיות ופיצול (src/tabs.js)
const tabs = createTabs({
  navEl: navGroup,
  $, store, noteName: (p) => noteName(p),
  getRoot: () => state.root,
  getCurrent: () => state.currentPath,
  openNote: (p, opts) => openNote(p, opts),
  flushSave: () => flushSave(),
  // 10.9: סגירת הכרטיסייה האחרונה היא יציאה מהמסמך: קודם שם למסמך שעוד אין לו
  showEmpty: async () => { const left = await nameOnLeave(null); showEmpty(); await afterLeave(left); },
  // 11.5: סגירת כרטיסייה של מסמך "ללא שם" שאינו פתוח עכשיו: אותה שאלה (שם, להשאיר, מחיקה) כמו ביציאה ממנו
  beforeClose: async (p) => {
    const left = await nameOnLeave(undefined, p);
    if (left?.removed) await refreshTree();
    return left?.renamed || p;
  },
  renderPreview: async (el, p) => {
    if (isCanvas(p)) { await renderCanvasPreview(el, p); return; }
    try { el.innerHTML = renderNoteHtml(await window.api.read(p), { resolve: resolveTarget, fileUrl }); }
    catch { el.textContent = 'המסמך לא נמצא'; }
  },
  onContext: (p, x, y) => showTabMenu(p, x, y),
  onHome: () => goHome(),
  onNewNote: () => newNote(),
  onNewCanvas: () => newCanvas(), // 11.0: מכחול ליד הפלוס
  fileIcon: (p) => fileIconHtml(p),
  flagOf: (p) => state.flags.get(p) || null, // 8.2: דגל גם בכרטיסייה
  backgroundOf: (p) => meta.backgroundOf(p),
});
// אין מסמך פתוח: מסך הבית (או, לפני שנבחרה תיקייה, כפתור הבחירה)
function showEmpty() {
  leaveCanvas();
  state.currentPath = null;
  state.dirty = false;
  pageOverlay.setEnabled(false);
  $('page').hidden = true;
  setHome(true);
  docPanel?.layout();
  toggleFocusMode(false);
  setSaveState('');
  $('wordCount').textContent = '';
  updateDocTitle();
  tabs.cleared();
  drawTree();
}

// ===== מסך הבית (src/home.js) =====
const home = createHome({
  el: $('home'), store,
  api: {
    getRoot: () => state.root,
    sep: () => (state.root.includes('\\') ? '\\' : '/'),
    vaultIndex: async () => withoutArchived(await window.api.vaultIndex()), // בלי הארכיון
    read: (p) => window.api.read(p),
    write: (p, t) => window.api.write(p, t, null),
    createNote: (dir, name, content) => window.api.createNote(dir, name, content),
    openNote: (p, opts) => openNote(p, opts),
    // 8.5: מסמכים נעוצים למסך הבית (vault-meta.js)
    pins: () => meta.pins(),
    setPinned: (p, on) => meta.setPinned(p, on),
    movePin: (p, dir) => meta.movePin(p, dir),
    exists: (p) => allNotes().some((n) => n.path === p),
    fileIcon: (p) => fileIconHtml(p),
    noteName: (p) => noteName(p),
    folderOf: (p) => { const d = dirname(p); return d === state.root ? '' : d.slice(state.root.length + 1).replace(/\\/g, ' › '); },
    openTask: (p, t) => openTask(p, t),
    toggleTask: (p, t, v) => toggleTask(p, t, v),
    createGhost: (name) => openLink(name),
    showTasks: (k) => showTasks(k),
    showGhosts: () => showGhosts(),
    appVersion: () => window.api.appVersion(),
    patchNotes: () => window.api.patchNotes(),
    openPatchNotes: () => openPatchNotes(),
    onChanged: () => refreshTree(),
  },
});
// on: בלי מסמך פתוח. לפני שנבחרה תיקייה מוצג רק כפתור הבחירה (#empty)
function setHome(on) {
  // 11.5: בלי מסמך פתוח כפתורי העריכה בסרגל כבויים (styles.css: body[data-nodoc]). עד עכשיו הם נלחצו בלי
  // תוצאה, ו־Markdown נדלק בשקט, כך שהמסמך הבא נפתח כטקסט גולמי
  document.body.toggleAttribute('data-nodoc', on);
  const show = on && !!state.root;
  $('home').hidden = !show;
  document.querySelector('.home-bg').hidden = !show;
  $('empty').hidden = !on || !!state.root;
  $('pageWrap').classList.toggle('home-mode', show);
  if (show) home.render();
}
function setFolderLoading(on) {
  const loading = $('folderLoading');
  loading.hidden = !on;
  $('pageWrap').classList.toggle('folder-is-loading', on);
  if (on) {
    $('empty').hidden = true;
    $('home').hidden = true;
    $('page').hidden = true;
    document.querySelector('.home-bg').hidden = false;
  } else if (!state.root) {
    $('empty').hidden = false;
    document.querySelector('.home-bg').hidden = true;
  }
}
async function pickRoot() {
  setFolderLoading(true);
  try {
    const picked = await window.api.pickFolder();
    if (picked) await enterRoot(picked);
  } finally { setFolderLoading(false); }
}
// חזרה למסך הבית מתוך מסמך: הכרטיסיות נשארות, הפיצול נסגר
async function goHome({ history = true } = {}) {
  if (!state.root) return;
  const left = await nameOnLeave(null);
  await flushSave();
  rememberPosition();
  if (history) pushHistory(HOME);
  if (tabs.split) tabs.unsplit();
  showEmpty();
  updateNavButtons();
  await afterLeave(left);
}
// 8.3: תצוגה מיידית של תמונה מודבקת, עוד לפני שנשמרה לקובץ: src בשכבה ← כתובת blob: של התוכן שבזיכרון
const previewUrls = new Map();
// 7.8: תמונה חופשית. ![[...]] נפתרת כמו בעורך; ![](נתיב) יחסית להערה ואז לתיקייה הראשית
function overlayImageUrls(o) {
  if (o.ref === 'md') return localSrc(o.src);
  const p = resolveTarget(o.src);
  // 8.3: תמונה שהודבקה עכשיו: קודם מהזיכרון (מיידי, גם לפני שהקובץ נשמר), ואז מהקובץ
  const pre = previewUrls.get(o.src);
  return [pre, p && fileUrl(p)].filter(Boolean);
}
// 11.8: "צמוד לטקסט" בשכבת הדף: הגושים העליונים של המסמך (פסקה, כותרת, רשימה...) כעוגנים.
// key: תחילת הטקסט של הגוש ומספר ההופעה שלו, כדי למצוא אותו שוב אחרי פתיחה מחדש.
const blockKey = (node) => (node.textContent || node.type.name).replace(/\s+/g, ' ').trim().slice(0, 80);
const topBlocks = () => {
  const out = [];
  editorApi.editor.state.doc.forEach((node, pos) => out.push({ node, pos }));
  return out;
};
const blockTop = (pos) => {
  const el = editorApi.editor.view.nodeDOM(pos);
  return el && el.nodeType === 1 ? el.getBoundingClientRect().top : null;
};
const overlayAnchors = {
  blockAt(y) {
    let best = null;
    for (const b of topBlocks()) {
      const top = blockTop(b.pos);
      if (top == null) continue;
      if (best && top > y) break;
      best = { pos: b.pos, top };
    }
    return best;
  },
  topOf(pos) {
    const { doc } = editorApi.editor.state;
    if (pos < 0 || pos >= doc.content.size || doc.resolve(pos).depth !== 0 || !doc.nodeAt(pos)) return null;
    return blockTop(pos);
  },
  keyOf(pos) {
    const blocks = topBlocks();
    const i = blocks.findIndex((b) => b.pos === pos);
    if (i < 0) return null;
    const t = blockKey(blocks[i].node);
    return { t, n: blocks.slice(0, i).filter((b) => blockKey(b.node) === t).length };
  },
  find(t, n) {
    let seen = 0;
    for (const b of topBlocks()) if (blockKey(b.node) === t && seen++ === n) return b.pos;
    return null;
  },
};
const pageOverlay = createPageOverlay({
  page: $('page'), onChange: noteChanged,
  anchors: overlayAnchors,
  // 7.8: תמונה חופשית. ![[...]] נפתרת כמו בעורך; ![](נתיב) יחסית להערה ואז לתיקייה הראשית
  resolveImage: (o) => overlayImageUrls(o),
  // 8.3: לחיצה על הטקסט בכלי הבחירה מחזירה לכתיבה בדיוק בנקודה שנלחצה
  onTextClick: (x, y) => {
    const view = editorApi.editor.view;
    const hit = view.posAtCoords({ left: x, top: y });
    const chain = editorApi.editor.chain().focus(undefined, { scrollIntoView: false });
    if (hit) chain.setTextSelection(hit.pos);
    chain.run();
  },
  // 11.6: המרת שרטוטים לתמונה, ועריכה של ציור שמור (השרטוט המקורי שבתוך ה־PNG חוזר לדף)
  onConvertToImage: async (data) => {
    try {
      const { target } = await saveDrawingPng(await svgToPng(data), data.vector);
      setStatus('השרטוט נשמר כתמונה. "עריכת הציור" בסרגל של התמונה מחזיר אותו לשרטוט שאפשר לערוך.');
      return { ref: 'embed', src: target };
    } catch (err) { showToast('ההמרה לתמונה נכשלה: ' + (err.message || err)); return null; }
  },
  isDrawingImage: (o) => { const p = o.ref === 'embed' && resolveTarget(o.src); return !!p && isDrawing(p); },
  onEditImage: async (o) => {
    const p = o.ref === 'embed' && resolveTarget(o.src);
    if (!p) return;
    const vector = await readVector(p);
    if (!vector) { editDrawing(p); return; }
    pageOverlay.removeItem(o.id);
    pageOverlay.addVector(vector, { x: o.x, y: o.y, w: o.width, h: o.height });
    setStatus('הציור חזר להיות שרטוט על הדף, ואפשר לערוך אותו. "המרה לתמונה" שומרת אותו שוב כתמונה.');
  },
  onReturnImage: (o) => {
    const r = $('page').getBoundingClientRect();
    return returnImageToText(editorApi.editor, o, r.left + pageOverlay.toScreen(o.x) + 4, r.top + pageOverlay.toScreen(o.y) + 4);
  },
});
// 8.0: המרה ל־Markdown רגיל (plain-md.js): כל מה שמיוחד ל־Tali הופך לתוכן שאובסידיאן מציג
async function convertNoteToPlainMd() {
  if (!state.currentPath) { setStatus('קודם פותחים מסמך'); return; }
  if (editorApi.isRaw()) { setStatus('ההמרה עובדת בתצוגה המעוצבת'); return; }
  const ok = await ask('המרה ל־Markdown רגיל: תמונות חופשיות, תיבות טקסט צפות, הערות שוליים ושרטוטים יהפכו לתוכן רגיל בתוך המסמך, שגם אובסידיאן מציג (שרטוטים: תמונת PNG אחת). מסגרות סביב טקסט יהפכו לציטוט רגיל. אחרי ההמרה הם כבר לא יזוזו חופשי.', '', { confirmOnly: true, okText: 'המרה' });
  if (!ok) return;
  try {
    pageOverlay.setEnabled(true);
    const counts = await convertToPlainMarkdown({
      editor: editorApi.editor, overlay: pageOverlay, page: $('page'),
      saveDrawing: async (bytes, vector) => (await saveDrawingPng(bytes, vector)).target,
    });
    noteChanged();
    const parts = [counts.images && `${counts.images} תמונות`, counts.notes && `${counts.notes} תיבות והערות`, counts.drawings && 'השרטוטים כתמונה'].filter(Boolean);
    showToast(parts.length ? 'הומר ל־Markdown רגיל: ' + parts.join(', ') + '.' : 'המסמך כבר Markdown רגיל (מסגרות וציפת תמונות, אם היו, הומרו).');
  } catch (err) {
    showToast('ההמרה נכשלה: ' + (err.message || err));
  }
}
// "חופשי" על תמונה בטקסט: התמונה יוצאת מהטקסט ועוברת לשכבת הדף, באותו מקום ובאותו גודל
function freeImage({ ref, src, alt, rect, pos, format }) {
  if (editorApi.isRaw()) return;
  const r = $('page').getBoundingClientRect();
  const x = rect.left - r.left, y = rect.top - r.top;
  editorApi.editor.commands.command(({ tr, dispatch }) => {
    const node = tr.doc.nodeAt(pos);
    if (!node) return false;
    if (dispatch) dispatch(tr.delete(pos, pos + node.nodeSize));
    return true;
  });
  pageOverlay.setEnabled(true);
  const L = pageOverlay.toLayer; // 8.4: מהמסך לקואורדינטות השכבה
  // 11.6: העיצוב (סיבוב, היפוך, חיתוך, סגנון) עובר עם התמונה; הפריסה מול הטקסט כבר לא רלוונטית
  const f = format || {};
  pageOverlay.addImage({ ref, src, alt, x: L(x), y: L(y), width: L(rect.width), height: L(rect.height),
    rotate: f.rotate, flipH: f.flipH, flipV: f.flipV, crop: f.crop, styles: f.styles });
  setStatus('התמונה זזה חופשית: גוררים אותה לכל מקום בדף. "החזרה לטקסט" מחזירה אותה. באובסידיאן היא לא תוצג על הדף.');
}
editorApi.setOverlayController(pageOverlay);
// 11.8: כל עריכה במסמך מזיזה את העוגנים יחד עם הגושים (Enter מעל שרטוט מוריד אותו)
editorApi.editor.on('transaction', ({ transaction }) => { if (transaction.docChanged) pageOverlay.mapAnchors(transaction.mapping); });
const useOverlay = (tool) => {
  if (!state.currentPath) { setStatus('קודם פותחים מסמך'); return; }
  if (editorApi.isRaw()) { setStatus('עבור לתצוגה המעוצבת כדי לשרטט על הדף'); return; }
  pageOverlay.setEnabled(true);
  pageOverlay.openDrawing();
  setStatus('שרטוט על הדף: הכלים בסרגל למטה. "סיום" או Esc חוזרים לכתיבה.');
};
// 11.2: "הערת שוליים": הלחיצה הבאה בדף או בשוליים קובעת את מקומה. טקסט מסומן נקשר אליה כציטוט,
// ואפשר גם לקשר אחר כך (הכפתור בכותרת ההערה).
const addMarginComment = (quote) => {
  if (!state.currentPath || state.canvas || editorApi.isRaw()) { setStatus('פותחים מסמך בתצוגה המעוצבת כדי להוסיף הערה'); return; }
  pageOverlay.setEnabled(true);
  const linked = !!quote?.trim();
  const onDone = (created) => setStatus(created
    ? (linked ? 'ההערה נוספה ומקושרת לטקסט המסומן. גרירה בכותרת מזיזה אותה' : 'ההערה נוספה. הכפתור בכותרת שלה מקשר אותה לטקסט בדף')
    : 'הוספת ההערה בוטלה');
  if (pageOverlay.startPlacement({ quote, onDone })) {
    setStatus(quote?.trim() ? 'לחצו במקום שבו תופיע ההערה (היא תקושר לטקסט המסומן) · Esc ביטול' : 'לחצו במקום שבו תופיע ההערה · Esc ביטול');
  }
};
const toolbarApi = buildToolbar($('toolbar'), editorApi, {
  onImage: importImages,
  onDraw: newDrawing,
  onOverlayDraw: useOverlay,
  onMarginComment: addMarginComment,
  onPlainMarkdown: () => convertNoteToPlainMd(),
  onTaskSection: insertTaskSection,
  onFocusMode: () => toggleFocusMode(),
  onSleep: () => enterSleep(),
  onExport: (format) => exportNote(format),
});
applyToolbarLayout();
const applyWindowState = (windowState) => toolbarApi.setCompact(usesCompactToolbar(windowState));
window.api.onWindowState(applyWindowState);
window.api.windowState().then(applyWindowState).catch(() => toolbarApi.setCompact(false));

// ===== תפריט הלחיצה הימנית על הדף ובשדות טקסט (context-menu.js). הפעולות: אותן של הסרגל (edit-actions.js) =====
setupContextMenus({
  editorApi,
  edit: toolbarApi.edit,
  completedAtBottom: { get: () => !!getPrefs().completedTasksAtBottom, toggle: () => toggleCompletedAtBottom() },
  isNoteOpen: () => !!state.currentPath,
  clipboard: (cmd) => window.api.editCommand(cmd),
  link: { open: (target, mode) => {
    if (mode === 'side') { const found = resolveTarget(target); if (found && isNote(found)) return tabs.splitWith(found); }
    return openLink(target, mode === 'tab' ? { newTab: true } : {});
  },
  // 11.2: המסמך המקושר: איפה הוא שמור (הצגה בעץ) והעברה לתיקייה, בלי לפתוח ולחפש אותו
  locate: (target) => {
    const found = resolveTarget(target);
    if (!found || !isNote(found)) return null;
    const rel = relOf(dirname(found));
    const merge = found !== state.currentPath && isNote(found) && isNote(state.currentPath || '')
      ? () => mergeNotes(found, state.currentPath) : null;
    return { where: rel ? rel.split('/').join(' › ') : 'התיקייה הראשית', reveal: () => revealPath(found), move: () => moveToFolder(found), merge };
  } },
  other: (e) => otherContextItems(e),
});

// ===== מצב מיקוד: רק הדף. הסרגלים, שורת המצב ולוח ההקשר מוסתרים. הכפתור בפינה יוצא (מ־8.0 F11 הוא מסך מלא) =====
const focusExit = document.createElement('button');
focusExit.type = 'button';
focusExit.id = 'focusExit';
focusExit.hidden = true;
focusExit.innerHTML = `${icon('focusExit', 16)}<span>יציאה ממצב מיקוד</span>`;
focusExit.dataset.tip = 'יציאה ממצב מיקוד';
focusExit.addEventListener('click', () => toggleFocusMode(false));
document.body.append(focusExit);
function toggleFocusMode(on = !document.body.dataset.focus) {
  if (on && !state.currentPath) return;
  if (on) document.body.dataset.focus = '1'; else delete document.body.dataset.focus;
  focusExit.hidden = !on;
  if (on) editorApi.editor.commands.focus();
}

// ===== משימות שבוצעו בסוף הרשימה (הגדרה, גם מלוח הפקודות ומהתפריט על משימה) =====
function toggleCompletedAtBottom() {
  const on = !getPrefs().completedTasksAtBottom;
  setPref('completedTasksAtBottom', on);
  showToast(on ? 'משימות שמסמנים עוברות לסוף הרשימה, מתחת לקו מפריד.' : 'משימות שמסמנים נשארות במקומן.');
}

// ===== מצב שינה: רק הסמל על הרקע הכחול של הפתיח. לחיצה או מקש כלשהו מעירים =====
// שומר לפני ההירדמות. תזוזת עכבר לא מעירה (כדי שאפשר יהיה להשאיר את החלון פתוח על המסך).
let sleepEl = null;
let sleepAt = 0;
function enterSleep() {
  if (sleepEl) return;
  // חלון dialog פתוח נמצא מעל כל שכבה; מחכים פריים (לוח הפקודות נסגר לפני שהפקודה רצה) ולא נרדמים מעליו
  if (document.querySelector('dialog[open]')) { requestAnimationFrame(() => { if (!document.querySelector('dialog[open]')) enterSleep(); }); return; }
  Promise.resolve().then(flushSave).catch(() => {});
  sleepEl = document.createElement('div');
  sleepEl.className = 'tali-sleep';
  sleepEl.setAttribute('role', 'button');
  sleepEl.setAttribute('aria-label', 'מצב שינה: לחיצה או מקש כלשהו להתעוררות');
  sleepEl.tabIndex = 0;
  const img = document.createElement('img');
  img.className = 'tali-sleep__emblem';
  img.src = 'splash-emblem.png';
  img.alt = '';
  img.draggable = false;
  const hint = document.createElement('div');
  hint.className = 'tali-sleep__hint';
  hint.textContent = 'לחיצה או מקש כלשהו להמשך';
  sleepEl.append(img, hint);
  document.body.append(sleepEl);
  document.activeElement?.blur?.();
  sleepEl.focus({ preventScroll: true });
  sleepAt = performance.now();
}
function wakeUp() {
  if (!sleepEl) return;
  const el = sleepEl;
  sleepEl = null;
  el.classList.add('waking');
  const done = () => el.remove();
  el.addEventListener('animationend', done, { once: true });
  setTimeout(done, 600);
  if (state.currentPath && !editorApi.isRaw()) editorApi.editor.commands.focus();
}
// בשלב הלכידה, לפני קיצורי האפליקציה והעורך: בזמן שינה שום מקש לא מגיע לממשק
for (const type of ['keydown', 'pointerdown', 'wheel']) {
  window.addEventListener(type, (e) => {
    if (!sleepEl) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (performance.now() - sleepAt < 350) return; // המקש שהרדים (למשל הקיצור עצמו) לא מעיר מיד
    if (type === 'wheel') return;
    wakeUp();
  }, { capture: true, passive: false });
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
function restorePosition(p, preferredCursor = null) {
  const wrap = $('pageWrap');
  const saved = docPositions.get(p);
  const jump = (top) => { wrap.style.scrollBehavior = 'auto'; wrap.scrollTop = top; wrap.style.scrollBehavior = ''; };
  if (preferredCursor != null && !editorApi.isRaw()) {
    editorApi.editor.commands.setTextSelection(preferredCursor);
    requestAnimationFrame(() => jump(wrap.scrollHeight));
    return;
  }
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
// 11.5: בחלון צר (עד 900px) הסרגל מתקפל לבד לפס אייקונים, בלי לשנות את ההעדפה השמורה. הכפתור פותח אותו
// זמנית; ביציאה מהמצב הצר חוזרים להעדפה. עד עכשיו בחלון של 760px הסרגל תפס כ־40% והדף נמחץ.
const narrowWindow = matchMedia('(max-width: 900px)');
let narrowOpen = false;
function setSidebarMode(next) {
  if (narrowWindow.matches) narrowOpen = next === 'expanded';
  else { sidebarMode = next; store.set('tali:sidebar-mode', next); }
  applySidebarMode();
}
narrowWindow.addEventListener('change', () => { narrowOpen = false; applySidebarMode(); });
function applySidebarMode() {
  const next = narrowWindow.matches && !narrowOpen ? 'compact' : narrowWindow.matches ? 'expanded' : sidebarMode;
  document.body.dataset.sidebarMode = next;
  const min = $('btnSidebarMin');
  min.innerHTML = icon(next === 'compact' ? 'panelExpand' : 'panelCollapse', 18);
  min.dataset.tip = next === 'compact' ? 'הרחבת הסרגל הימני' : 'צמצום הסרגל הימני';
  min.setAttribute('aria-label', min.dataset.tip);
  min.setAttribute('aria-expanded', next === 'expanded' ? 'true' : 'false');
}
$('btnSidebarMin').addEventListener('click', () => setSidebarMode(document.body.dataset.sidebarMode === 'compact' ? 'expanded' : 'compact'));

// רוחב הסרגל בגרירת הקצה (200–520px), נשמר ב־tali:sidebar-width. לחיצה כפולה: חזרה ל־280.
{
  const SIDEBAR_DEFAULT = 280;
  const clampW = (w) => Math.round(Math.min(520, Math.max(200, w)));
  const setW = (w) => document.documentElement.style.setProperty('--sidebar-w', clampW(w) + 'px');
  setW(Number(store.get('tali:sidebar-width', SIDEBAR_DEFAULT)) || SIDEBAR_DEFAULT);
  const handle = $('sidebarResize');
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const rect = $('sidebar').getBoundingClientRect();
    const onRight = rect.left > window.innerWidth / 2; // מימין לשמאל הסרגל בצד ימין
    document.body.classList.add('sidebar-resizing');
    const move = (ev) => setW(onRight ? rect.right - ev.clientX : ev.clientX - rect.left);
    const up = () => {
      document.body.classList.remove('sidebar-resizing');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      store.set('tali:sidebar-width', parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'), 10));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  handle.addEventListener('dblclick', () => { setW(SIDEBAR_DEFAULT); store.set('tali:sidebar-width', SIDEBAR_DEFAULT); });
}
applySidebarMode();

// ===== ציורים =====
// 11.6: ציור כ־PNG בתיקיית התמונות. vector: השרטוט המקורי, נשמר בתוך הקובץ (png-meta.js) לעריכה בהמשך.
const VECTOR_KEY = 'tali-vector';
async function saveDrawingPng(bytes, vector) {
  let out = bytes;
  if (vector) { try { out = writePngText(bytes, VECTOR_KEY, JSON.stringify(vector)); } catch { /* בלי השרטוט המקורי */ } }
  const p = await window.api.saveAttachment(attachmentDir(), `Drawing ${drawingStamp()}.png`, out);
  if (!state.attachments.includes(p)) state.attachments.push(p);
  return { path: p, target: linkTextFor(p) };
}
async function readVector(p) {
  if (!/\.png$/i.test(p || '')) return null;
  try {
    const text = readPngText(await window.api.readImage(p), VECTOR_KEY);
    const v = text && JSON.parse(text);
    return v && v.v === 1 && Array.isArray(v.items) && v.w > 0 && v.h > 0 ? v : null;
  } catch { return null; }
}
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
// 11.6: ציור שנשמר מהשרטוט על הדף ("המרה לתמונה", "המרה ל־Markdown רגיל") מחזיק בתוכו את השרטוט המקורי.
// בתמונה בתוך הטקסט (info: rect, pos, target) הוא חוזר לדף כשרטוט שאפשר לערוך, במקום ובגודל של התמונה.
// ציור בלי שרטוט מקורי (מחלון הציור) נפתח בחלון הציור, כמו קודם.
async function editDrawing(p, info = null) {
  if (info && typeof info.pos === 'number' && info.rect && !editorApi.isRaw()) {
    const vector = await readVector(p);
    const node = vector && editorApi.editor.state.doc.nodeAt(info.pos);
    if (node && node.type.name === 'embed' && node.attrs.target === info.target) {
      editorApi.editor.commands.command(({ tr, dispatch }) => { if (dispatch) dispatch(tr.delete(info.pos, info.pos + node.nodeSize)); return true; });
      pageOverlay.setEnabled(true);
      const r = $('page').getBoundingClientRect();
      const L = pageOverlay.toLayer;
      pageOverlay.addVector(vector, { x: L(info.rect.left - r.left), y: L(info.rect.top - r.top), w: L(info.rect.width), h: L(info.rect.height) });
      setStatus('הציור חזר להיות שרטוט על הדף, ואפשר לערוך אותו. "המרה לתמונה" שומרת אותו שוב כתמונה.');
      return;
    }
  }
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
const noteName = (p) => p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1).replace(/\.(md|canvas)$/i, '');

// 10.7: פתק קישור רק לפי בקשה (לוח הקישורים / לוח הפקודות). עד 10.6 הצעה קפצה אחרי כל קישור.
// קודם בוחרים אילו מסמכים לאסוף (המסמך הפתוח והקשורים שלו מסומנים מראש), ואז שם לפתק.
function makeLinkHub(anchor) {
  const from = state.currentPath;
  if (!from || !isNote(from)) return;
  const files = allNotes().map((n) => n.path);
  const related = getFrontmatterLinks(editorApi.getMarkdown()).map((t) => resolveLink(t, files, state.root)).filter(Boolean);
  openLinkPicker({
    title: 'פתק קישור: אילו מסמכים לאסוף?',
    notes: allNotes(),
    selected: [from, ...related.filter((p) => p !== from)],
    onSave: (paths) => {
      if (paths.length < 2) { showToast('צריך לפחות שני מסמכים לפתק קישור.'); return; }
      const r = anchor?.getBoundingClientRect?.() || { bottom: window.innerHeight / 3, right: window.innerWidth / 2 + 140 };
      openLinkHubName({
        coords: { bottom: r.bottom, right: r.right },
        title: `שם לפתק שמקשר ${paths.length} מסמכים`,
        notes: allNotes().filter((n) => !paths.includes(n.path)),
        onApply: (pick) => applyLinkHub(pick, paths),
      });
    },
  });
}

// יוצר את פתק הקישור (או משתמש בקיים) ומוסיף לו קישורים למסמכים, בלי כפילויות
async function applyLinkHub(pick, paths) {
  try {
    await flushSave();
    let hub = pick.path;
    if (!hub) {
      try { hub = await window.api.createNote(await noteTargetDir(), pick.name); }
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
    showToast(paths.length === 2
      ? `פתק הקישור ״${noteName(hub)}״ מקשר עכשיו את ״${noteName(paths[0])}״ ו״${noteName(paths[1])}״.`
      : `פתק הקישור ״${noteName(hub)}״ מקשר עכשיו ${paths.length} מסמכים.`,
    'פתיחה', () => openNote(hub));
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

// 8.2: תמונה שהודבקה או נגררה נכנסת קודם כתמונה חופשית על הדף (אפשר להחזיר לטקסט ב"החזרה לטקסט"),
// במקום שבו המשתמש מסתכל: בגרירה בנקודת השחרור, בהדבקה במרכז החלק הגלוי של הדף. עד 480px רוחב.
const naturalSize = (url) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve({ w: img.naturalWidth || 300, h: img.naturalHeight || 200 });
  img.onerror = () => resolve({ w: 300, h: 200 });
  img.src = url;
});
// המקור של תמונה בשכבה לפי הנתיב שלה: השם בלבד אם הוא חד־משמעי בכספת, אחרת הנתיב היחסי
function embedSrcFor(p) {
  const name = p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1);
  return resolveTarget(name) === p ? name : p.slice(state.root.length + 1).replace(/\\/g, '/');
}
// הנקודה על הדף (בקואורדינטות הדף) שבה תונח תמונה: בגרירה נקודת השחרור, בהדבקה מרכז החלק הגלוי של הדף.
// מחושב ברגע ההדבקה (לפני כל המתנה), כדי שגלילה בזמן השמירה לא תזיז את היעד.
function viewAnchor(where) {
  const page = $('page').getBoundingClientRect();
  const wrap = $('pageWrap').getBoundingClientRect();
  const cx = where ? where.x : (Math.max(page.left, wrap.left) + Math.min(page.right, wrap.right)) / 2;
  const cy = where ? where.y : (Math.max(page.top, wrap.top) + Math.min(page.bottom, wrap.bottom)) / 2;
  // 8.4: בקואורדינטות השכבה (שמוקטנת או מוגדלת לפי רוחב הדף)
  return { x: pageOverlay.toLayer(cx - page.left), y: pageOverlay.toLayer(cy - page.top), pageWidth: pageOverlay.getPageWidth() };
}

async function importImages() {
  if (!state.currentPath) { setStatus('קודם פותחים מסמך, ואז מוסיפים לו תמונה'); return; }
  if (editorApi.isRaw()) { setStatus('ייבוא תמונות עובד בתצוגה המעוצבת'); return; }
  try { await insertImages(await window.api.importImages(attachmentDir())); }
  catch (err) { setStatus('שגיאה בייבוא: ' + err.message); }
}

// 8.2: תמונה שהודבקה או נגררה נכנסת כתמונה חופשית על הדף (אפשר להחזיר לטקסט ב"החזרה לטקסט").
// 8.3: מופיעה מיד (מהזיכרון), ורק אחר כך נשמרת לקובץ. עד 8.2 השמירה וסריקת כל הכספת (attachments)
// קדמו להצגה, ובכספת גדולה עברו כמה שניות בלי שום סימן. now: נקודת היעד שחושבה ברגע ההדבקה.
async function saveDroppedImages(files, where = null, anchor = null) {
  if (!state.currentPath || !files.length) return;
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
  // תמונה מהלוח מגיעה בשם כללי (image.png), אז נותנים לה שם עם תאריך כמו באובסידיאן
  const nameOf = (f, i) => {
    const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    return f.name && !/^image\.\w+$/i.test(f.name) ? f.name : `Pasted image ${stamp}${i ? '-' + i : ''}.${ext}`;
  };
  if (editorApi.isRaw()) {
    // תצוגת Markdown: כמו קודם, בטקסט
    try {
      const paths = [];
      for (const [i, f] of files.entries()) paths.push(await window.api.saveAttachment(attachmentDir(), nameOf(f, i), new Uint8Array(await f.arrayBuffer())));
      await insertImages(paths);
    } catch (err) { setStatus('שגיאה בשמירת התמונה: ' + err.message); }
    return;
  }
  const at = anchor || viewAnchor(where);
  const notePath = state.currentPath;
  pageOverlay.setEnabled(true);
  setStatus(files.length === 1 ? 'מוסיף את התמונה…' : `מוסיף ${files.length} תמונות…`);
  let placed = 0;
  for (const [i, f] of files.entries()) {
    const name = nameOf(f, i);
    const dir = attachmentDir();
    const sep = dir.includes('\\') ? '\\' : '/';
    const blob = URL.createObjectURL(f);
    const nat = await naturalSize(blob);
    const width = Math.round(Math.min(nat.w, 480, at.pageWidth * 0.7));
    const height = Math.round(width * nat.h / Math.max(1, nat.w));
    // המקור הזמני: השם שהקובץ אמור לקבל. אם השם תפוס, השמירה תחזיר שם אחר והמקור יתעדכן.
    const guess = embedSrcFor(dir + sep + name);
    previewUrls.set(guess, blob);
    const id = pageOverlay.addImage({ ref: 'embed', src: guess, width, height,
      x: at.x - width / 2 + i * 24, y: at.y - height / 2 + i * 24 });
    try {
      const p = await window.api.saveAttachment(dir, name, new Uint8Array(await f.arrayBuffer()));
      if (!state.attachments.includes(p)) state.attachments.push(p);
      const src = embedSrcFor(p);
      previewUrls.set(src, blob);
      // המסמך התחלף בזמן השמירה: הקובץ נשמר, אבל לא נוגעים בשכבה של מסמך אחר
      if (src !== guess && state.currentPath === notePath && id) pageOverlay.updateImage(id, { src });
      placed++;
    } catch (err) {
      if (id && state.currentPath === notePath) pageOverlay.removeItem(id);
      setStatus('שגיאה בשמירת התמונה: ' + err.message);
      return;
    }
  }
  setStatus(placed === 1
    ? 'התמונה נוספה כתמונה חופשית: גוררים אותה למקום, הידיות משנות גודל. "החזרה לטקסט" מכניסה אותה לטקסט.'
    : `נוספו ${placed} תמונות חופשיות`);
}

// 8.3: הדבקה של תמונה מכל מקור (paste-images.js). מחזיר true אם ההדבקה טופלה כתמונה.
// ההחלטה סינכרונית (כדי לעצור את ההדבקה הרגילה), וההורדה או הקריאה מהלוח ממשיכות ברקע.
function pasteImage(data) {
  if (!state.currentPath || !data) return false;
  const files = imageFilesFrom(data);
  const anchor = editorApi.isRaw() ? null : viewAnchor(null);
  if (files.length) { saveDroppedImages(files, null, anchor); return true; }
  const src = lonelyImageSrc(data.getData('text/html'));
  if (src) {
    setStatus('מוסיף את התמונה…');
    (async () => {
      let file = null;
      if (/^data:/i.test(src)) file = fileFromDataUrl(src);
      else {
        const got = await window.api.fetchImage(src);
        if (got) file = new File([got.bytes], 'image.' + (got.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg'), { type: got.type });
      }
      if (file) saveDroppedImages([file], null, anchor);
      else setStatus('לא הצלחתי להוריד את התמונה שהודבקה. אפשר לשמור אותה למחשב ולגרור לכאן.');
    })();
    return true;
  }
  // בלוח אין טקסט בכלל: אולי תמונה שהדפדפן לא חושף (מתוכנות מסוימות ב־Windows). שואלים את main.js.
  const types = [...(data.types || [])];
  if (!types.some((t) => t.startsWith('text/'))) {
    (async () => {
      const bytes = await window.api.clipboardImage();
      if (bytes) saveDroppedImages([new File([bytes], 'image.png', { type: 'image/png' })], null, anchor);
    })();
    return true;
  }
  return false;
}
// כל הדבקה עוברת כאן קודם (capture), חוץ משדות טקסט רגילים. בזמן סשן שרטוט: תמונה, או השרטוטים שהועתקו
// (Ctrl+C בסשן), ואף פעם לא טקסט לתוך המסמך שמתחת. מחוץ לסשן: תמונה, או ההדבקה הרגילה של העורך.
document.addEventListener('paste', (event) => {
  if (state.canvas) return; // 10.4: הקנבס מטפל בהדבקה בעצמו (canvas-view.js)
  const t = event.target;
  if (t?.closest?.('textarea, input') && !t.closest('.ProseMirror')) return;
  if (pageOverlay.inSession()) {
    event.preventDefault(); event.stopPropagation();
    if (!pasteImage(event.clipboardData)) pageOverlay.pasteClip();
    return;
  }
  if (pasteImage(event.clipboardData)) { event.preventDefault(); event.stopPropagation(); }
}, true);

// 11.5: הודעה (ייצוא, שגיאה, "הועבר לסל"…) חוזרת אחרי 6 שניות לשורת המצב הרגילה: הנתיב של המסמך הפתוח, או
// התיקייה. עד עכשיו "הייצוא הושלם" נשאר שם גם אחרי מעבר בין מסמכים.
let statusTimer = null;
function baseStatus() {
  if (state.currentPath) return prettyPath(state.currentPath);
  return state.root ? 'תיקיית המסמכים: ' + $('vaultName').textContent : '';
}
function setStatus(text) {
  $('status').textContent = text;
  clearTimeout(statusTimer);
  if (text && text !== baseStatus()) statusTimer = setTimeout(() => { if ($('status').textContent === text) $('status').textContent = baseStatus(); }, 6000);
}

// שם המסמך הפתוח, מעל הדף. לחיצה: שינוי שם (כמו F2)
// ולידו (#docMeta): התיקייה (לחיצה מראה בעץ) ותאריך היצירה.
// התאריך: מתוך ההערה (getCreatedDate), ואם אין, המוקדם מבין זמן היצירה והשינוי של הקובץ,
// כי העתקה או סנכרון מאפסים את זמן היצירה (ואז הוא אחרי זמן השינוי).
// 10.6: השם מוצג במלואו (גולש לכמה שורות), והמידע בשורה קטנה מעליו. הגובה של השם נמדד,
// כדי ש־#pageWrap ישאיר בדיוק את המקום שהכותרת צריכה (styles.css: --title-h)
const measureTitle = () => {
  const h = $('docTitle').offsetHeight; // 0 כשהדף מוסתר (מסך הבית, קנבס): ברירת המחדל של ה־CSS
  if (h) $('pageWrap').style.setProperty('--title-h', h + 'px'); else $('pageWrap').style.removeProperty('--title-h');
};
new ResizeObserver(measureTitle).observe($('docTitle'));
// 11.2: ליד התיקייה: העברת המסמך לתיקייה אחרת (moveToFolder), בלי לחפש אותו בעץ
$('dmMove').addEventListener('click', () => moveToFolder());
// 11.5: מסמך שנפתח בכותרת H1 זהה לשם הקובץ: השם שמעל הדף מוצג קטן, כדי שאותו שם לא יופיע פעמיים בגדול.
// התוכן לא משתנה, והשורה עדיין לחיצה לשינוי שם. נבדק בכל שינוי (הכותרת יכולה להשתנות תוך כדי כתיבה).
function markDupTitle() {
  const p = state.currentPath;
  const first = !state.canvas && !editorApi.isRaw() ? editorApi.editor.state.doc.firstChild : null;
  const dup = !!(p && first?.type.name === 'heading' && first.attrs.level === 1 && first.textContent.trim() === noteName(p).trim());
  $('docTitle').classList.toggle('dup-h1', dup);
}
editorApi.editor.on('update', () => requestAnimationFrame(markDupTitle));
$('cvDocName').addEventListener('click', () => { if (state.currentPath) renameNode(currentNode()); });
function updateDocTitle() {
  const p = state.currentPath;
  const title = $('docTitle');
  // בזמן עריכת השם לא דורסים את מה שהמשתמש מקליד (טעינה מחדש מהדיסק וכו')
  if (!titleEditing) title.querySelector('.dt-text').textContent = p ? noteName(p) : '';
  title.hidden = !p;
  // 10.9: מסמך חדש שעוד אין לו שם: השם דהוי, והשאלה תגיע ביציאה ממנו
  const untitled = isUntitled(p);
  title.classList.toggle('untitled', untitled);
  markDupTitle();
  // 11.5: גם השם שבפינת הקנבס
  const cvName = $('cvDocName');
  cvName.hidden = !(p && state.canvas);
  if (!cvName.hidden) { cvName.textContent = noteName(p); cvName.classList.toggle('untitled', untitled); }
  if (!titleEditing) title.dataset.tip = untitled ? 'השם ייקבע ביציאה מהמסמך. לחיצה: לתת שם עכשיו (F2)' : 'לחיצה: שינוי שם (F2)';
  measureTitle();
  const meta = $('docMeta');
  meta.hidden = !p;
  if (!p) return;
  const rel = dirname(p).slice(state.root.length + 1);
  // פירורי לחם: כל תיקייה לחיצה ופותחת אותה בעץ. נתיב ארוך: הראשונה, "…" (לחיצה מרחיבה) והאחרונה
  const parts = rel ? rel.split(/[\\/]/) : [];
  const crumbs = meta.querySelector('.dm-folder > span');
  crumbs.innerHTML = '';
  const sep = () => { const s = document.createElement('i'); s.className = 'dm-sep'; s.textContent = '›'; return s; };
  const crumb = (label, dir, tip) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.tip = tip;
    b.addEventListener('click', () => revealDir(dir));
    return b;
  };
  const dirAt = (i) => [state.root, ...parts.slice(0, i + 1)].join(state.root.includes('\\') ? '\\' : '/');
  const renderCrumbs = (full) => {
    crumbs.innerHTML = '';
    if (!parts.length) { crumbs.append(crumb('התיקייה הראשית', state.root, 'הצגה בעץ')); return; }
    parts.forEach((name, i) => {
      if (!full && parts.length > 2 && i > 0 && i < parts.length - 1) {
        if (i === 1) {
          const more = document.createElement('button');
          more.type = 'button';
          more.textContent = '…';
          more.dataset.tip = parts.slice(1, -1).join(' › ');
          more.addEventListener('click', () => renderCrumbs(true));
          crumbs.append(sep(), more);
        }
        return;
      }
      if (i) crumbs.append(sep());
      crumbs.append(crumb(name, dirAt(i), 'הצגה בעץ'));
    });
  };
  renderCrumbs(false);
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
// 11.5 (לבקשת המשתמש): שינוי השם במקום, על שורת הכותרת עצמה, בלי חלון. לחיצה בכל מקום בשורה
// (גם בחלק הריק שליד השם) הופכת את השם לשדה הקלדה: על השם עצמו הסמן נכנס בנקודת הלחיצה, בחלק הריק
// לסוף השם, וב"ללא שם" כל השם מסומן כדי שההקלדה תחליף אותו. Enter או יציאה מהשדה שומרים
// (renameNode עם השם החדש), Esc מבטל. שם ריק או זהה: חוזר לשם הקיים. גם F2 על המסמך הפתוח מגיע לכאן.
var titleEditing = false;
function startTitleEdit({ caretAtEnd = true } = {}) {
  const title = $('docTitle');
  const text = title.querySelector('.dt-text');
  if (!state.currentPath || state.canvas || title.hidden || titleEditing) return;
  titleEditing = true;
  title.classList.add('editing');
  delete title.dataset.tip;
  try { text.contentEditable = 'plaintext-only'; } catch { text.contentEditable = 'true'; }
  text.focus();
  const sel = getSelection();
  if (isUntitled(state.currentPath)) sel.selectAllChildren(text);
  else if (caretAtEnd) { sel.selectAllChildren(text); sel.collapseToEnd(); }
}
async function endTitleEdit(save) {
  if (!titleEditing) return;
  const text = $('docTitle').querySelector('.dt-text');
  const name = text.textContent.replace(/\s+/g, ' ').trim();
  const node = currentNode();
  titleEditing = false;
  text.contentEditable = 'false';
  text.removeAttribute('contenteditable');
  $('docTitle').classList.remove('editing');
  const current = node && noteName(node.path);
  if (save && node && name && name !== current) {
    text.textContent = name;
    await renameNode(node, name);
  }
  updateDocTitle(); // שם שנכשל (תו אסור, שם תפוס): חוזר לשם שבדיסק, וההודעה בשורת המצב
}
{
  const title = $('docTitle');
  const text = title.querySelector('.dt-text');
  // mousedown ולא click: על השם הדפדפן ממקם את הסמן בנקודת הלחיצה רק אם השדה כבר ניתן לעריכה
  title.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !state.currentPath) return;
    const onText = text.contains(e.target);
    // כבר בעריכה: לחיצה בחלק הריק לא מוציאה מהשדה (blur היה שומר וסוגר), רק מעבירה את הסמן לסוף
    if (titleEditing) {
      if (!onText) { e.preventDefault(); const sel = getSelection(); sel.selectAllChildren(text); sel.collapseToEnd(); }
      return;
    }
    if (!onText) e.preventDefault(); // חלק ריק בשורה: הסמן לסוף השם (startTitleEdit)
    startTitleEdit({ caretAtEnd: !onText });
  });
  text.addEventListener('keydown', (e) => {
    if (!titleEditing) return;
    if (e.key === 'Enter') { e.preventDefault(); endTitleEdit(true).then(() => editorApi.editor.commands.focus()); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTitleEdit(false).then(() => editorApi.editor.commands.focus()); }
    else if (e.key === 'Tab') { e.preventDefault(); endTitleEdit(true).then(() => editorApi.editor.commands.focus('start')); }
  });
  text.addEventListener('blur', () => { endTitleEdit(true); });
  // הדבקה: טקסט רגיל בשורה אחת
  text.addEventListener('paste', (e) => {
    if (!titleEditing) return;
    e.preventDefault();
    e.stopPropagation();
    document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' '));
  });
}

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
const prettyPath = (p) => p.slice(state.root.length + 1).replace(/\.(md|canvas)$/i, '').split(/[\\/]/).join(' › ');

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
  const isCanvasDoc = state.canvas;
  const content = isCanvasDoc ? canvasDoc().getText() : editorApi.getMarkdown();
  state.dirty = false;
  const slow = setTimeout(() => { if (!state.dirty) setSaveState('saving'); }, 300);
  const hadError = $('saveText')?.dataset.state === 'error';
  try {
    state.mtime = await window.api.write(p, content, state.mtime);
    state.diskText = content;
    if (!state.dirty) setSaveState('saved');
    // אחרי שמירה שהצליחה: הודעת השגיאה מפנה מקום לנתיב, וההודעה בפינה נסגרת
    if (hadError && state.currentPath === p) { setStatus(prettyPath(p)); if ($('toast')) $('toast').hidden = true; }
    if (!isCanvasDoc) {
      refreshLinksPanel(); // ייתכן שהמאפיינים (links:) נערכו ידנית
      noteFlagChanged(p, getFlag(content));
    }
  } catch (err) {
    if (/CONFLICT/.test(err.message)) return saveDespiteOutsideChange(p, content);
    saveFailed(err);
  } finally {
    clearTimeout(slow);
  }
}

// 9.7: שמירה שנכשלה (כונן מנותק, קובץ נעול) מוצגת בהודעה עם ניסיון חוזר, ולא רק בשורת המצב
function saveFailed(err) {
  state.dirty = true;
  setSaveState('error');
  const reason = String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  setStatus('שגיאת שמירה: ' + reason);
  showToast('המסמך לא נשמר: ' + reason, 'ניסיון חוזר', () => { state.dirty = true; flushSave(); });
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
    saveFailed(err);
  }
}

async function reloadFromDisk() {
  const p = state.currentPath;
  const md = await window.api.read(p);
  state.mtime = await window.api.mtime(p);
  state.diskText = md;
  state.dirty = false;
  if (state.canvas) { canvasDoc().load(md, p); return; }
  editorApi.setMarkdown(md);
  refreshLinksPanel();
  updateWordCount(); // 11.3: עד עכשיו הספירה נשארה של הגרסה הקודמת (מיזוג, שינוי מבחוץ)
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
// extraText (11.4): כפתור שלישי, למשל "מחיקה" בחלון השם ביציאה. לחיצה עליו מחזירה ASK_EXTRA
const ASK_EXTRA = Symbol('ask-extra');
function ask(label, defaultValue = '', { confirmOnly = false, okText = 'אישור', cancelText = 'ביטול', extraText = null } = {}) {
  const dlg = $('dlg');
  $('dlgLabel').textContent = label;
  dlg.querySelector('button[value="ok"]').textContent = okText;
  dlg.querySelector('button[value="cancel"]').textContent = cancelText;
  const extra = $('dlgExtra');
  extra.hidden = !extraText;
  extra.textContent = extraText || '';
  const input = $('dlgInput');
  input.hidden = confirmOnly;
  input.value = defaultValue;
  // Enter בשדה = אישור. בלי זה הטופס שולח את הכפתור הראשון, שהוא "ביטול".
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); dlg.close('ok'); }
  };
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => {
      if (dlg.returnValue === 'extra' && extraText) { resolve(ASK_EXTRA); return; }
      resolve(dlg.returnValue === 'ok' ? (confirmOnly ? true : input.value.trim()) : null);
    }, { once: true });
    dlg.returnValue = '';
    dlg.showModal();
    if (!confirmOnly) input.select();
    else dlg.querySelector('button[value="ok"]').focus();
  });
}

// ===== עץ הקבצים =====
// ===== סמלים וסדר ידני בעץ (src/vault-meta.js, נשמר ב־.tali.json בכספת) =====
const meta = createMeta({ api: window.api, getRoot: () => state.root });
const sepOf = () => (state.root?.includes('\\') ? '\\' : '/');
const baseOf = (p) => p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1);
// השמות בתיקייה, בסדר שמוצג בעץ (אחרי הסדר הידני)
function siblingNames(dir) {
  const find = (nodes) => {
    if (dir === state.root) return nodes;
    for (const n of nodes) if (n.type === 'dir') { if (n.path === dir) return n.children; const f = find(n.children); if (f) return f; }
    return null;
  };
  return (find(meta.sortTree(state.tree)) || []).map((n) => n.name);
}
// גרירה לפני/אחרי פריט אחר. מתיקייה אחרת: קודם מעבירים (עם עדכון הקישורים), ואז ממקמים
async function reorderNode(src, target, where) {
  const dir = dirname(target);
  let path = src;
  if (dirname(src) !== dir) {
    await moveNode(src, dir);
    path = dir + sepOf() + baseOf(src);
    // ההעברה נכשלה (למשל שם תפוס): לא ממקמים
    if (![...allDirs(), ...allNotes().map((n) => n.path)].includes(path)) return;
  }
  meta.placeIn(dir, siblingNames(dir), baseOf(path), baseOf(target), where);
  drawTree();
}
// Alt+↑/↓ או מהתפריט: מקום אחד למעלה או למטה בתוך התיקייה
function stepItem(p, dir) {
  const parent = dirname(p);
  const names = siblingNames(parent);
  const i = names.indexOf(baseOf(p));
  const j = i + dir;
  if (i < 0 || j < 0 || j >= names.length) return;
  meta.placeIn(parent, names, names[i], names[j], dir < 0 ? 'before' : 'after');
  drawTree();
  [...$('tree').querySelectorAll('.node')].find((r) => r.dataset.path === p)?.focus();
}
// סמל לתיקייה או למסמך
function pickIcon(node) {
  const name = node.name.replace(/\.md$/i, '');
  openIconPicker({
    title: `סמל ל״${name}״`, current: meta.iconOf(node.path), store,
    onPick: (v) => { meta.setIcon(node.path, v); drawTree(); tabs.refresh?.(); },
  });
}
function pickBackground(node) {
  const document = node.type === 'file';
  const name = node.name.replace(/\.md$/i, '');
  openBackgroundPicker({
    title: `צבע ל${document ? 'מסמך' : 'תיקייה'} ״${name}״`,
    name,
    kind: document ? 'document' : 'folder',
    current: meta.ownBackground(node.path),
    onPick: (value) => {
      meta.setBackground(node.path, value);
      drawTree();
      tabs.refresh();
      setStatus(value ? `הצבע של ״${name}״ עודכן` : `הצבע של ״${name}״ הוסר`);
    },
  });
}
// סמל של מסמך לכרטיסייה (או סמל הקובץ הרגיל)
const fileIconHtml = (p, size = 14) => {
  const c = meta.iconOf(p);
  if (!c) return icon(isCanvas(p) ? 'canvas' : 'file', size);
  const svg = lucide(c.name, size);
  return c.color ? svg.replace('<svg ', `<svg style="color: var(--flag-${c.color})" `) : svg;
};

function drawTree() {
  // בזמן חיפוש העץ מוצג מסונן (drawSearch), גם כשמשהו אחר מבקש לצייר אותו מחדש
  const q = $('search').value.trim();
  if (q) { clearTimeout(searchTimer); drawSearch(q); return; }
  const focusedPath = document.activeElement?.closest?.('#tree .node')?.dataset.path;
  renderTree($('tree'), archiveLast(meta.sortTree(state.tree)), {
    iconOf: (p) => meta.iconOf(p),
    backgroundOf: (p) => meta.backgroundOf(p),
    onReorder: reorderNode,
    onStep: stepItem,
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
  state.attachments = r.attachments || [];
  notesCache = null;
  drawTree();
  refreshFlags();
  editorApi.refreshLinks();
  refreshBacklinks();
  refreshLinksPanel();
  refreshTemplates();
}
// יש תבניות? בלי: "מסמך חדש מתבנית" לא מופיע בתפריטים הימניים. מתעדכן עם העץ.
let hasTemplates = false;
function refreshTemplates() {
  window.api.templates().then((c) => { hasTemplates = !!c?.list?.length; }, () => { hasTemplates = false; });
}
const templateItem = (dir) => (hasTemplates
  ? [{ label: 'מסמך חדש מתבנית', icon: 'template', run: () => newNoteFromTemplate({ dir }) }]
  : []);

// 11.0: dir = תיקייה שנבחרה במפורש (לחיצה ימנית על תיקייה ← "מסמך חדש בתיקייה"), תמיד גוברת על ההגדרה.
// בלי dir: לפי ההגדרה "מסמך חדש נוצר" (ברירת המחדל מ־11.0: התיקייה הראשית; עד 10.9 התיקייה שנבחרה בעץ).
async function noteTargetDir(dir) {
  if (dir) return dir;
  const prefs = getPrefs();
  if (prefs.newNoteLocation === 'root') return state.root;
  if (prefs.newNoteLocation === 'folder') return window.api.prepareNewNoteFolder(prefs.newNoteFolder);
  return state.selectedDir || (state.currentPath ? dirname(state.currentPath) : state.root);
}
function folderTargetDir() { return state.selectedDir || (state.currentPath ? dirname(state.currentPath) : state.root); }

// כל מסמך חדש נפתח בכרטיסייה משלו. אם הוא כבר פתוח, מנהל הכרטיסיות ממקד את הכרטיסייה הקיימת.
// 10.9: לפני מעבר למסמך אחר, מסמך חדש שעוד אין לו שם מקבל שם (nameOnLeave)
async function openNote(p, opts = {}) {
  const left = await nameOnLeave(p);
  await openNoteHere(p, opts);
  await afterLeave(left);
}
async function openNoteHere(p, { history = true, newTab = false } = {}) {
  await flushSave();
  rememberPosition();
  if (isCanvas(p)) return openCanvas(p, { history, newTab });
  leaveCanvas();
  const md = await window.api.read(p);
  const mtime = await window.api.mtime(p);
  if (history) pushHistory(p);
  state.currentPath = p;
  state.mtime = mtime;
  state.diskText = md;
  state.dirty = false;
  state.recent = [p, ...state.recent.filter((x) => x !== p)].slice(0, 30);
  store.set('recent:' + state.root, state.recent);
  // מתי כל מסמך נפתח (לחלון "מסמכים אחרונים"), עד 300 מסמכים
  const openedAt = store.get('openedAt:' + state.root, {}) || {};
  openedAt[p] = Date.now();
  store.set('openedAt:' + state.root, Object.fromEntries(Object.entries(openedAt).sort((a, b) => b[1] - a[1]).slice(0, 300)));
  editorApi.setMarkdown(md);
  const formulaCursor = editorApi.ensureTypingLineAfterFormula();
  pageOverlay.setEnabled(!editorApi.isRaw());
  setHome(false);
  $('page').hidden = false;
  restorePosition(p, formulaCursor);
  setSaveState('saved');
  // כניסה רכה של הדף בכל פתיחת הערה
  const pg = $('page');
  pg.classList.remove('enter');
  void pg.offsetWidth;
  pg.classList.add('enter');
  setStatus(prettyPath(p));
  updateDocTitle();
  updateWordCount();
  // 8.2 (לבקשת המשתמש, כמו בדפדפן): לחיצה רגילה מחליפה את הכרטיסייה הנוכחית. כרטיסייה חדשה רק בבקשה:
  // לחיצה אמצעית או Ctrl+לחיצה בעץ ובקישורים, או "פתיחה בכרטיסייה חדשה" בתפריט. מסמך שכבר פתוח רק מקבל מיקוד.
  // (6.4–8.1: כל פתיחה יצרה כרטיסייה חדשה.)
  tabs.opened(p, { newTab });
  drawTree();
  refreshBacklinks();
  refreshLinksPanel();
  updateNavButtons();
}

// ===== 10.4: מסמך גרפי (קנבס) =====
// קובץ .canvas נפתח ב־#canvasView (canvas-view.js) במקום הדף. אותה כרטיסייה, היסטוריה ושמירה כמו מסמך:
// state.currentPath הוא הקנבס, state.canvas מסמן אותו, ו־saveNow לוקח את הטקסט מ־canvasDoc().getText().
// הסרגל העליון, לוח ההקשר ושכבת השרטוט של הדף מוסתרים (body[data-doc="canvas"] ב־styles.css).
const canvasApi = (extra = {}) => ({
  root: () => state.root,
  resolveFile: (rel) => {
    const r = String(rel || '');
    if (!state.root || /^[a-z]:[\\/]/i.test(r)) return r;
    const sep = state.root.includes('\\') ? '\\' : '/';
    return state.root + sep + r.replace(/[\\/]/g, sep);
  },
  fileUrl,
  readFile: (p) => window.api.read(p),
  renderMarkdown: (md, { limit } = {}) => renderNoteHtml(md, { resolve: resolveTarget, fileUrl, limit }),
  openFile: (p) => (isNote(p) || isCanvas(p) ? openNote(p) : window.api.openPath(p).catch((err) => setStatus(err.message))),
  openLink: (target) => openLink(target),
  openUrl: (url) => window.open(url, '_blank'),
  ask: (label, value) => ask(label, value),
  pickNote: () => new Promise((resolve) => pickNote('מסמך להצגה בקנבס…', resolve)),
  importImages: async () => {
    try {
      const paths = await window.api.importImages(attachmentDir());
      for (const p of paths || []) if (!state.attachments.includes(p)) state.attachments.push(p);
      return paths || [];
    } catch (err) { setStatus('שגיאה בייבוא התמונה: ' + err.message); return []; }
  },
  saveImages: async (files) => {
    const out = [];
    const d = new Date();
    const two = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
    for (const [i, f] of files.entries()) {
      const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
      const name = f.name && !/^image\.\w+$/i.test(f.name) ? f.name : `Pasted image ${stamp}${i ? '-' + i : ''}.${ext}`;
      try {
        const p = await window.api.saveAttachment(attachmentDir(), name, new Uint8Array(await f.arrayBuffer()));
        if (!state.attachments.includes(p)) state.attachments.push(p);
        out.push(p);
      } catch (err) { setStatus('שגיאה בשמירת התמונה: ' + err.message); }
    }
    return out;
  },
  ...extra,
});
let canvasView = null;
function canvasDoc() {
  if (!canvasView) canvasView = createCanvasView({ host: $('canvasView'), api: canvasApi({ onChange: () => {
    if (!state.canvas) return;
    state.dirty = true;
    setSaveState('dirty');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 600);
  } }) });
  return canvasView;
}
// חזרה מהקנבס לעורך (או למסך הבית)
function leaveCanvas() {
  if (!state.canvas) return;
  state.canvas = false;
  delete document.body.dataset.doc;
  $('canvasView').hidden = true;
  $('cvDocName').hidden = true;
}
async function openCanvas(p, { history = true, newTab = false } = {}) {
  let text;
  try { text = await window.api.read(p); } catch (err) { setStatus('לא ניתן לפתוח: ' + err.message); return; }
  const mtime = await window.api.mtime(p);
  if (history) pushHistory(p);
  state.currentPath = p;
  state.mtime = mtime;
  state.diskText = text;
  state.dirty = false;
  state.canvas = true;
  state.recent = [p, ...state.recent.filter((x) => x !== p)].slice(0, 30);
  store.set('recent:' + state.root, state.recent);
  const openedAt = store.get('openedAt:' + state.root, {}) || {};
  openedAt[p] = Date.now();
  store.set('openedAt:' + state.root, Object.fromEntries(Object.entries(openedAt).sort((a, b) => b[1] - a[1]).slice(0, 300)));
  pageOverlay.setEnabled(false);
  toggleFocusMode(false);
  setHome(false);
  $('page').hidden = true;
  document.body.dataset.doc = 'canvas';
  $('canvasView').hidden = false;
  const { error } = canvasDoc().load(text, p);
  setSaveState('saved');
  setStatus(error ? 'הקובץ לא נקרא כקנבס תקין; נפתח קנבס ריק, והקובץ לא ישתנה עד שתערכו בו' : prettyPath(p));
  $('wordCount').textContent = '';
  updateDocTitle();
  tabs.opened(p, { newTab });
  drawTree();
  updateNavButtons();
  canvasDoc().focus();
}
// תצוגה של קנבס בחלונית השנייה בפיצול: אותה תצוגה, לקריאה בלבד
async function renderCanvasPreview(el, p) {
  el.classList.remove('ProseMirror');
  el.classList.add('pv-canvas');
  let text = '';
  try { text = await window.api.read(p); } catch { el.textContent = 'המסמך לא נמצא'; return; }
  const host = document.createElement('div');
  el.replaceChildren(host);
  const v = createCanvasView({ host, api: canvasApi(), readOnly: true });
  v.load(text, p);
  requestAnimationFrame(() => v.zoomToFit());
}
// 11.0: כמו מסמך רגיל, נפתח מיד בשם "ללא שם" והשם נקבע ביציאה ממנו (nameOnLeave)
async function newCanvas({ dir: chosen } = {}) {
  if (!state.root) return;
  try {
    const dir = await noteTargetDir(chosen);
    const file = await createUntitled((name) => window.api.createCanvas(dir, name));
    if (!file) return;
    await refreshTree();
    await openNote(file);
  } catch (err) { setStatus(err.message); }
}

// ===== קישורים =====
// לחיצה על [[קישור]]: פותחת את ההערה, או יוצרת אותה אם עדיין לא קיימת.
// קישור לקובץ שאינו הערה (תמונה, PDF) נפתח בתוכנה של המחשב.
async function openLink(target, opts = {}) {
  const found = resolveTarget(target);
  if (found && (isNote(found) || isCanvas(found))) return openNote(found, opts);
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

// ===== אחורה / קדימה: בין מסמכים ומסך הבית, כמו בדפדפן =====
// HOME מסמן את מסך הבית בהיסטוריה (state.currentPath הוא null כשהוא מוצג).
const HOME = '\u0000home';
const here = () => state.currentPath || HOME;
function pushHistory(next) {
  if (here() === next) return;
  if (state.back[state.back.length - 1] !== here()) state.back.push(here());
  if (state.back.length > 100) state.back.shift();
  state.forward = [];
}
async function goHistory(dir) {
  const from = dir < 0 ? state.back : state.forward;
  const to = dir < 0 ? state.forward : state.back;
  const p = from.pop();
  if (!p) return;
  to.push(here());
  try {
    if (p === HOME) await goHome({ history: false });
    else await openNote(p, { history: false });
  } catch { setStatus('המסמך כבר לא קיים'); }
  updateNavButtons();
}
const navButton = (ic, tip, dir) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn tab-navbtn';
  b.innerHTML = icon(ic, 16);
  b.dataset.tip = tip;
  b.setAttribute('aria-label', tip);
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', () => goHistory(dir));
  navGroup.append(b);
  return b;
};
// בממשק מימין לשמאל "אחורה" מצביע ימינה
const navBack = navButton('arrowRight', 'אחורה (Alt+←)', -1);
const navForward = navButton('arrowLeft', 'קדימה (Alt+→)', 1);
function updateNavButtons() {
  navBack.disabled = !state.back.length;
  navForward.disabled = !state.forward.length;
}
updateNavButtons();

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
  state.attachments = r.attachments || [];
  notesCache = null;
  refreshTemplates();
  state.currentPath = null;
  state.dirty = false;
  pageOverlay.setEnabled(false);
  state.selectedDir = null;
  state.back = [];
  state.forward = [];
  updateNavButtons();
  state.recent = store.get('recent:' + r.root, []);
  const savedCollapsed = store.get('collapsed:' + r.root, null);
  state.collapsed = new Set(savedCollapsed || []);
  // ברירת המחדל בכספת חדשה היא ארכיון סגור. אחרי שהמשתמש פתח/סגר אותו,
  // הרשימה השמורה נשארת הסמכות ולא נכפה עליו מצב בכל הפעלה.
  if (savedCollapsed == null) {
    const archive = r.tree.find((node) => node.type === 'dir' && isArchiveRoot(node.name));
    if (archive) state.collapsed.add(archive.path);
  }
  await meta.load(); // סמלים וסדר ידני (.tali.json)
  $('page').hidden = true;
  setHome(true); docPanel?.layout(); toggleFocusMode(false);
  $('btnPickBig').hidden = true;
  setSaveState('');
  $('wordCount').textContent = '';
  setStatus('תיקיית המסמכים: ' + $('vaultName').textContent);
  drawTree();
  refreshFlags();
  // הכרטיסיות (והפיצול) מהפעם הקודמת בכספת הזו
  const known = new Set(allNotes().map((n) => n.path));
  // מסך הבית בהפעלה: הכרטיסיות מהפעם הקודמת חוזרות לסרגל, אבל לא נפתחות
  await tabs.restore((p) => known.has(p), { open: false });
  setFolderLoading(false);
}

// ===== שינוי שם ומחיקה (מהתפריט הימני, מהמקלדת או מלוח הפקודות) =====
const currentNode = () => state.currentPath && { path: state.currentPath, name: state.currentPath.slice(Math.max(state.currentPath.lastIndexOf('/'), state.currentPath.lastIndexOf('\\')) + 1) };

async function renameNode(node, preset) {
  if (!node) return;
  // 11.5: המסמך הפתוח (לא קנבס): עריכה במקום, על שורת הכותרת
  if (preset == null && node.path === state.currentPath && !state.canvas && !$('docTitle').hidden) { startTitleEdit(); return; }
  const current = node.name.replace(/\.md$/i, '');
  const name = preset ?? await ask('שם חדש:', current);
  if (!name || name === current) return;
  try {
    await flushSave();
    const { to, changed } = await window.api.rename(node.path, name);
    // גם מסמכים בתוך תיקייה ששמה השתנה מקבלים את הנתיב החדש (עד 5.2 המסמך הפתוח נסגר)
    const swap = (p) => (p === node.path ? to : p.startsWith(node.path + '\\') || p.startsWith(node.path + '/') ? to + p.slice(node.path.length) : p);
    state.back = state.back.map(swap);
    state.forward = state.forward.map(swap);
    state.recent = state.recent.map(swap);
    if (state.currentPath) state.currentPath = swap(state.currentPath);
    tabs.remap(swap);
    meta.remap(node.path, to);
    remapUntitled(swap, true);
    // אם הקישורים עודכנו גם בהערה הפתוחה, טוענים אותה מחדש מהדיסק
    if (state.currentPath && changed.includes(state.currentPath)) {
      await reloadFromDisk();
    }
    await refreshTree();
    if (!state.currentPath) showEmpty();
    else { setStatus(prettyPath(state.currentPath)); updateDocTitle(); }
    const others = changed.filter((p) => p !== to).length;
    if (others) setStatus(`הקישורים עודכנו ב־${others} מסמכים`);
    return to;
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
    const gone = (p) => p === node.path || p.startsWith(node.path + '\\') || p.startsWith(node.path + '/');
    meta.drop(node.path);
    remapUntitled((x) => (gone(x) ? null : x));
    if (state.currentPath && gone(state.currentPath)) { state.currentPath = null; state.dirty = false; }
    await refreshTree();
    // הכרטיסיות של מה שנמחק נסגרות. אם המסמך הפעיל נמחק, נפתחת כרטיסייה אחרת או המסך הריק
    await tabs.drop(gone);
    if (!state.currentPath && !$('page').hidden) showEmpty();
  } catch (err) { setStatus(err.message); }
}

// ===== 11.3: מיזוג מסמך לתוך מסמך אחר (merge-notes.js, merge-notes ב־main.js) =====
// התוכן של src נכנס בסוף dest תחת "## <שם>", כל הקישורים אליו בכספת מובילים לסעיף הזה, ו־src עובר לסל המחזור.
// בסוף נפתח dest, גלול לסעיף החדש.
async function mergeNotes(src, dest) {
  if (!src || !dest || src === dest) return;
  if (!isNote(src) || !isNote(dest)) { setStatus('אפשר למזג רק מסמכים רגילים, לא מסמך גרפי'); return; }
  const from = noteName(src), into = noteName(dest);
  const ok = await ask(`למזג את "${from}" לתוך "${into}"? התוכן שלו ייכנס בסוף "${into}" תחת הכותרת "${from}", הקישורים אליו מכל המסמכים יובילו לשם, והמסמך "${from}" יעבור לסל המחזור.`, '', { confirmOnly: true, okText: 'מיזוג' });
  if (!ok) return;
  try {
    await flushSave();
    const r = await window.api.mergeNotes(src, dest);
    const keep = (p) => p !== src;
    state.back = state.back.filter(keep);
    state.forward = state.forward.filter(keep);
    state.recent = state.recent.filter(keep);
    store.set('recent:' + state.root, state.recent);
    meta.drop(src);
    remapUntitled((x) => (x === src ? null : x));
    if (state.currentPath === src) { state.currentPath = null; state.dirty = false; }
    await refreshTree();
    await tabs.drop((p) => p === src);
    if (state.currentPath === dest) await reloadFromDisk(); else await openNote(dest);
    // הסעיף החדש: גלילה אליו, כדי שיהיה ברור מה נכנס ואיפה
    requestAnimationFrame(() => {
      const h = [...document.querySelectorAll('#page .ProseMirror h2')].reverse().find((el) => el.textContent.trim() === r.section);
      h?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    const others = r.changed.filter((p) => p !== dest).length;
    const notes = [];
    if (others) notes.push(others === 1 ? 'הקישורים עודכנו במסמך אחד נוסף' : `הקישורים עודכנו ב־${others} מסמכים נוספים`);
    if (r.droppedProps.length) notes.push(`${r.droppedProps.length === 1 ? 'המאפיין' : 'המאפיינים'} ${r.droppedProps.join(', ')} של "${from}" לא עבר${r.droppedProps.length === 1 ? '' : 'ו'}`);
    if (r.hadOverlay) notes.push(`שרטוטים והערות שוליים של "${from}" לא עברו`);
    setStatus(`"${from}" מוזג לתוך "${into}"` + (notes.length ? ' · ' + notes.join(' · ') : '') + ' · המקור בסל המחזור');
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
    tabs.remap(swap);
    meta.remap(src, to);
    remapUntitled(swap);
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

// ===== ארכיון (src/archive.js) =====
// מסמך או תיקייה עוברים ל"ארכיון/<אותן תיקיות>" בהעברה רגילה (הקישורים מתעדכנים), וחוזרים משם למקום.
const relOf = (p) => (state.root && p.startsWith(state.root) ? p.slice(state.root.length + 1).replace(/\\/g, '/') : '');
const archivedPath = (p) => isArchived(relOf(p));
// מה שמוצע בשליפה מהירה (Ctrl+O, בחירת מסמך): בלי הארכיון. הקישורים משתמשים ב־allNotes, עם הארכיון.
const quickNotes = () => allNotes().filter((n) => !isArchived(n.rel));
// בעץ: תיקיית הארכיון בסוף הרמה העליונה, ומסומנת (class archive ב־sidebar.js)
function archiveLast(nodes) {
  const i = nodes.findIndex((n) => n.type === 'dir' && isArchiveRoot(relOf(n.path)));
  if (i < 0) return nodes;
  const out = [...nodes];
  const [box] = out.splice(i, 1);
  out.push({ ...box, archive: true });
  return Object.assign(out, { custom: nodes.custom });
}
async function archiveNode(node) {
  const parts = archiveDirFor(relOf(node.path));
  if (!parts) return;
  try {
    const dest = await window.api.ensureFolder(parts);
    // הארכיון מכווץ, כדי שלא יתפוס מקום בעץ (moveNode פותח את תיקיית היעד)
    const box = state.root + (state.root.includes('\\') ? '\\' : '/') + ARCHIVE_DIR;
    await moveNode(node.path, dest);
    for (const d of allDirs()) if (d === box || d.startsWith(box + '\\') || d.startsWith(box + '/')) state.collapsed.add(d);
    saveCollapsed();
    drawTree();
    setStatus(`"${node.name.replace(/\.md$/i, '')}" עבר לארכיון`);
  } catch (err) { setStatus(err.message); }
}
async function restoreNode(node) {
  const parts = restoreDirFor(relOf(node.path));
  if (!parts) return;
  try {
    const dest = parts.length ? await window.api.ensureFolder(parts) : state.root;
    await moveNode(node.path, dest);
    // תיקיות שנשארו ריקות בארכיון (ארכיון/לימודים/גנטיקה) יורדות; הארכיון עצמו נשאר
    await window.api.pruneEmptyFolders([ARCHIVE_DIR, ...parts]);
    await refreshTree();
    setStatus(`"${node.name.replace(/\.md$/i, '')}" הוחזר מהארכיון`);
  } catch (err) { setStatus(err.message); }
}
// פריט התפריט: העברה לארכיון, או החזרה ממנו (לא על תיקיית הארכיון עצמה)
function archiveItem(node) {
  const rel = relOf(node.path);
  if (!rel || isArchiveRoot(rel)) return [];
  return isArchived(rel)
    ? [{ label: 'החזרה מהארכיון', icon: 'archiveRestore', run: () => restoreNode(node) }]
    : [{ label: 'העברה לארכיון', icon: 'archive', run: () => archiveNode(node) }];
}

// ===== תצוגות על כל הכספת: גרף, תגיות, משימות, הערות רפאים =====
const vaultIndex = async () => { await flushSave(); return window.api.vaultIndex(); };
// לשליפה מהירה (משימות, אחרונים, מסך הבית): בלי מה שבארכיון. הגרף והתגיות מציגים את כל הכספת.
const quickIndex = async () => withoutArchived(await vaultIndex());
async function showGraph() {
  if (!state.root) return;
  openGraph({
    index: await vaultIndex(), current: state.currentPath, root: state.root, store, meta,
    onOpen: (t) => (t.path ? openNote(t.path) : openLink(t.create)),
  });
}
async function showTags(initial) {
  if (!state.root) return;
  openTags({ index: await vaultIndex(), initial, onOpenNote: (p) => openNote(p) });
}
// מסמכים אחרונים: נפתחו (לפי openedAt, ובסדר של state.recent למה שאין לו זמן), נערכו, נוצרו
async function showRecent() {
  if (!state.root) return;
  const at = store.get('openedAt:' + state.root, {}) || {};
  const paths = [...new Set([...Object.keys(at).sort((a, b) => at[b] - at[a]), ...state.recent])];
  openRecent({
    index: await quickIndex(), store, current: state.currentPath,
    opened: paths.filter((p) => !archivedPath(p)).map((p) => ({ path: p, at: at[p] || 0 })),
    onOpen: (p, o) => openNote(p, o),
  });
}
async function showGhosts() {
  if (!state.root) return;
  openGhosts({ index: await vaultIndex(), onOpenNote: (p) => openNote(p), onCreate: (name) => openLink(name) });
}
// kind: 'followUp' (משימות להמשך) או 'checks' (תיבות סימון). בלי: מה שנבחר בפעם הקודמת
async function showTasks(kind) {
  if (!state.root) return;
  openTasks({ index: await quickIndex(), store, kind, onOpenTask: openTask, onToggle: toggleTask });
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
  tabs.refresh();
}
function noteFlagChanged(p, color) {
  if ((state.flags.get(p) || null) === (color || null)) return;
  if (color) state.flags.set(p, color); else state.flags.delete(p);
  drawTree();
  renderFlagged();
  tabs.refresh();
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
    .sort((a, b) => order.indexOf(a[1]) - order.indexOf(b[1]) || noteName(a[0]).localeCompare(noteName(b[0]), 'he', { numeric: true }));
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
    if (node.type.name === 'heading' && isFollowUpHeading(node.textContent)) headingEnd = offset + node.nodeSize;
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
    // 9.9: גם שכבת הדף: תמונות חופשיות (כך נכנסות תמונות שהודבקו), שרטוטים, תיבות טקסט והערות
    const pm = $('editor').querySelector('.ProseMirror');
    const floats = await collectFloats({
      proseMirrorElement: pm, pageElement: $('page'), items: pageOverlay.getItems(), toScreen: pageOverlay.toScreen,
      resolveImage: overlayImageUrls, shapes: pageOverlay.exportShapes(),
    });
    const html = exportHtml(pm, floats);
    let out;
    if (format === 'docx') {
      // הקובץ נבנה כאן (צריך DOM), אחרי שהתמונות הוטמעו ב־main
      const withImages = await window.api.inlineImages(html);
      const bytes = await buildDocx({ title: noteName(state.currentPath), html: withImages, rtlDefault: getPrefs().textDir !== 'ltr', fetchImage: (u) => window.api.fetchImage(u) });
      out = await window.api.exportNote('docx', noteName(state.currentPath), bytes);
    } else out = await window.api.exportNote(format, noteName(state.currentPath), html, EXPORT_CSS);
    if (!out) { setStatus('הייצוא בוטל'); return; }
    showToast(`נשמר: ${out}`, 'פתיחה', () => window.api.openExternalFile(out));
    setStatus('הייצוא הושלם');
  } catch (err) { setStatus('שגיאה בייצוא: ' + err.message); }
}

// ===== תפריט ימני של העץ, הכרטיסיות, מסך הבית ושאר האזורים =====
// כולם משתמשים בתפריט של context-menu.js: אותו מראה, תפריטי משנה ומקלדת כמו בדף.
function fileItems(node) {
  const flag = state.flags.get(node.path) || null;
  // 10.4: בקנבס אין מאפיינים, דגל, ייצוא או כותרת: הפעולות האלה כותבות Markdown לתוך הקובץ
  const canvasFile = isCanvas(node.path);
  const items = [
    { label: 'פתיחה בכרטיסייה חדשה', icon: 'filePlus', keys: 'Ctrl+לחיצה', run: () => openNote(node.path, { newTab: true }) },
    { label: 'פתיחה לצד', icon: 'splitView', run: () => tabs.splitWith(node.path) },
    // 8.5: נעיצה למסך הבית (כרטיס "מסמכים נעוצים")
    meta.isPinned(node.path)
      ? { label: 'ביטול הנעיצה ממסך הבית', icon: 'pinOff', run: () => { meta.setPinned(node.path, false); if (!state.currentPath) home.render({ refresh: false }); } }
      : { label: 'נעיצה למסך הבית', icon: 'pin', run: () => { meta.setPinned(node.path, true); setStatus('המסמך ננעץ למסך הבית'); if (!state.currentPath) home.render({ refresh: false }); } },
    'sep',
    { label: 'שינוי שם', icon: 'edit', keys: 'F2', run: () => renameNode(node) },
    { label: 'העברה לתיקייה…', icon: 'moveToFolder', run: () => moveToFolder(node.path) },
    { label: 'מיזוג לתוך מסמך אחר…', icon: 'mergeNotes', run: () => pickNote(`מיזוג "${noteName(node.path)}" לתוך…`, (dest) => mergeNotes(node.path, dest)) },
    { label: 'שכפול', icon: 'copy', run: () => duplicateNode(node) },
    { label: meta.ownBackground(node.path) ? 'שינוי צבע המסמך…' : 'צבע למסמך…', icon: 'palette', run: () => pickBackground(node) },
    { label: 'מסמך קשור…', icon: 'link', run: () => pickLinksFor(node.path) },
    { label: 'דגל', icon: 'flag', sub: [
      ...FLAG_LIST.map((fl) => ({ label: fl.name, dot: fl.id, active: () => flag === fl.id, run: () => setNoteFlag(node.path, fl.id) })),
      { label: 'ללא דגל', dot: null, disabled: !flag, run: () => setNoteFlag(node.path, null) },
    ] },
    { label: 'ייצוא', icon: 'exportPdf', sub: [
      { label: 'ייצוא ל־PDF', icon: 'exportPdf', run: () => exportNote('pdf', node) },
      { label: 'ייצוא ל־Word', icon: 'exportWord', run: () => exportNote('docx', node) },
    ] },
    { label: 'העברת הכותרת למאפיינים', icon: 'outline', run: () => convertHeader(node.path) },
    ...archiveItem(node),
  ];
  const notForCanvas = new Set(['קישור לפתקים אחרים…', 'דגל', 'ייצוא', 'העברת הכותרת למאפיינים']);
  return canvasFile ? items.filter((it) => it === 'sep' || !notForCanvas.has(it.label)) : items;
}
function showContextMenu(node, x, y, before = []) {
  const items = [...before];
  if (node.type === 'file') items.push(...fileItems(node));
  else items.push(
    { label: 'מסמך חדש בתיקייה', icon: 'filePlus', run: () => newNote(undefined, { dir: node.path }) },
    ...templateItem(node.path),
    { label: 'מסמך גרפי חדש (קנבס)', icon: 'canvas', run: () => newCanvas({ dir: node.path }) },
    'sep',
    { label: 'שינוי שם', icon: 'edit', keys: 'F2', run: () => renameNode(node) },
    { label: meta.ownBackground(node.path) ? 'שינוי צבע התיקייה…' : 'צבע לתיקייה…', icon: 'palette', run: () => pickBackground(node) },
    ...archiveItem(node),
  );
  // לשניהם: סמל, והזזה בתוך התיקייה (סדר ידני)
  items.push(
    { label: meta.iconOf(node.path) ? 'שינוי הסמל…' : 'סמל…', icon: 'iconPick', run: () => pickIcon(node) },
    { label: 'הזזה למעלה', icon: 'chevronUp', keys: 'Alt+↑', run: () => stepItem(node.path, -1) },
    { label: 'הזזה למטה', icon: 'chevronDown', keys: 'Alt+↓', run: () => stepItem(node.path, 1) },
    'sep',
    { label: 'מחיקה (לסל המחזור)', icon: 'trash', danger: true, run: () => deleteNode(node) },
  );
  openContextMenu(x, y, items);
}
// כרטיסייה: סגירה וסגירת האחרות, ואחריהן הפעולות של המסמך
function showTabMenu(p, x, y) {
  const name = p.split(/[\\/]/).pop();
  showContextMenu({ type: 'file', path: p, name }, x, y, [
    // 8.5: כרטיסייה נעוצה: בתחילת הסרגל, קומפקטית, בלי כפתור סגירה, ולחיצה על מסמך אחר לא מחליפה אותה
    tabs.isPinned(p)
      ? { label: 'ביטול נעיצת הכרטיסייה', icon: 'pinOff', run: () => tabs.setPinned(p, false) }
      : { label: 'נעיצת הכרטיסייה', icon: 'pin', run: () => tabs.setPinned(p, true) },
    { label: 'סגירת הכרטיסייה', icon: 'close', keys: 'Ctrl+W', run: () => tabs.close(p) },
    { label: 'סגירת הכרטיסיות האחרות', icon: 'close', disabled: tabs.list.length < 2, run: () => tabs.closeOthers(p) },
    'sep',
  ]);
}
// שטח ריק בעץ ומסך הבית: הפעולות הכלליות של הכספת
function vaultItems() {
  return [
    { label: 'מסמך חדש', icon: 'filePlus', keys: 'Ctrl+N', run: () => newNote(undefined, { dir: state.root }) },
    ...templateItem(null),
    { label: 'מסמך גרפי חדש (קנבס)', icon: 'canvas', run: () => newCanvas({ dir: state.root }) },
    { label: 'תיקייה חדשה', icon: 'folderPlus', run: () => { state.selectedDir = null; newFolder(); } },
    'sep',
    { label: 'כיווץ כל התיקיות', icon: 'collapseAll', run: collapseAll },
    { label: 'רענון העץ', icon: 'history', run: () => refreshTree() },
  ];
}
// 8.0: השוליים שמחוץ לדף (בתוך #pageWrap, לא בדף, לא בלוח ההקשר ולא בתיבה קיימת)
const inPageMargin = (t) => !!(state.currentPath && !state.canvas && !editorApi.isRaw() && t.closest?.('#pageWrap')
  && !t.closest('#page, #canvasView, #docCtx, .tali-overlay-box, .tali-overlay-toolbar, #home'));
const addMarginNote = (x, y) => { pageOverlay.setEnabled(true); pageOverlay.addNote(x, y); };
$('pageWrap').addEventListener('dblclick', (e) => {
  if (e.button !== 0 || !inPageMargin(e.target)) return;
  e.preventDefault();
  addMarginNote(e.clientX, e.clientY);
});

function otherContextItems(e) {
  const t = e.target;
  if (!state.root) return null;
  if (inPageMargin(t)) return [
    { label: 'הערת שוליים כאן', icon: 'comment', run: () => addMarginNote(e.clientX, e.clientY) },
    { label: 'שרטוט על הדף', icon: 'pen', run: () => useOverlay() },
    'sep',
    { label: 'המרה ל־Markdown רגיל', icon: 'file', run: () => convertNoteToPlainMd() },
  ];
  if (t.closest('#tree') && !t.closest('.node')) return vaultItems();
  if (t.closest('#home')) return [
    { label: 'מסמך חדש', icon: 'filePlus', keys: 'Ctrl+N', run: () => newNote(undefined, { dir: state.root }) },
    { label: 'מעבר מהיר למסמך', icon: 'search', keys: 'Ctrl+O', run: () => openSwitcher() },
    { label: 'מצב שינה', icon: 'sleep', keys: 'Ctrl+Alt+L', run: () => enterSleep() },
    'sep',
    { label: 'החלפת תיקייה…', icon: 'folder', run: pickRoot },
  ];
  if (t.closest('#tabBar') && !t.closest('.tab')) return [
    { label: 'מסמך חדש', icon: 'filePlus', keys: 'Ctrl+N', run: () => newNote() },
    { label: 'מסמך גרפי חדש (קנבס)', icon: 'canvas', run: () => newCanvas() },
    { label: 'מסך הבית', icon: 'home', keys: 'Alt+Home', run: () => goHome() },
  ];
  return null;
}

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

// ===== מסמכים קשורים (10.7): שורת "קשורים" בראש הדף, נשמרת במאפייני המסמך (links:) =====
// עד 10.6: בורר מודאלי עם בחירה מרובה ושמירה, ושורות links: לא נראו בדף בכלל.
const relatedLinks = () => {
  const fm = editorApi.getFrontmatter();
  return fm == null ? [] : getFrontmatterLinks(`---\n${fm}\n---\n`);
};
function setRelated(targets) {
  // דרך העורך: בלי טעינה מחדש, הסמן וההיסטוריה של הטקסט נשמרים, והשמירה כמו כל עריכה
  editorApi.updateFrontmatter((text) => setFrontmatterLinks(text, targets));
  renderRelated();
  refreshLinksPanel();
}
// eslint-disable-next-line prefer-const
var relatedRow = createRelatedRow({
  host: $('related'), icon,
  getNotes: () => allNotes().filter((n) => n.path !== state.currentPath),
  resolve: (t) => resolveTarget(t),
  getLinks: relatedLinks,
  setLinks: setRelated,
  linkTextFor,
  open: (t, opts) => openLink(t, opts),
  isActive: () => !!state.currentPath && !state.canvas && !editorApi.isRaw(),
});
function renderRelated() { relatedRow?.render(); }

// "מסמך קשור…" מהעץ, מהלוח או מלוח הפקודות: פותחים את המסמך (אם צריך) ואת השדה בשורת "קשורים"
async function pickLinksFor(target) {
  try {
    if (!target || !isNote(target)) return;
    if (target !== state.currentPath) await openNote(target);
    if (state.currentPath !== target) return;
    if (editorApi.isRaw()) { setStatus('מסמכים קשורים נערכים בתצוגה המעוצבת'); return; }
    relatedRow.startAdd();
  } catch (err) { setStatus(err.message); }
}

// ===== אזכורים בלי קישור (10.7): מסמכים שכתוב בהם שם המסמך הפתוח, בלי [[קישור]] אליו =====
async function findMentions(p) {
  const name = noteName(p);
  if (name.trim().length < 2) return [];
  const linking = new Set((await window.api.backlinks(p).catch(() => [])).map((b) => b.path));
  const results = await window.api.search(name).catch(() => []);
  const out = [];
  for (const r of results) {
    if (r.path === p || linking.has(r.path) || !isNote(r.path) || !r.snippet) continue;
    if (!r.snippet.toLowerCase().includes(name.toLowerCase())) continue;
    out.push({ path: r.path, name: r.name, snippet: r.snippet.trim() });
    if (out.length >= 15) break;
  }
  return out;
}

// הופך את האזכור הראשון של השם במסמך האחר ל־[[קישור]]. לא בתוך מאפיינים, קוד או קישור קיים.
async function linkMention(other) {
  const p = state.currentPath;
  if (!p) return;
  const name = noteName(p);
  try {
    if (other === state.currentPath) return;
    const text = await window.api.read(other);
    const mtime = await window.api.mtime(other);
    const fm = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/.exec(text);
    const start = fm ? fm[0].length : 0;
    const lower = text.toLowerCase();
    const want = name.toLowerCase();
    // אזורים שלא נוגעים בהם: קוד, [[קישורים]], ![[הטמעות]], [טקסט](כתובת)
    const blocked = [];
    for (const re of [/```[\s\S]*?```/g, /`[^`\n]*`/g, /!?\[\[[^\]\n]*\]\]/g, /\[[^\]\n]*\]\([^)\n]*\)/g]) {
      let m;
      while ((m = re.exec(text))) blocked.push([m.index, m.index + m[0].length]);
    }
    const isWordChar = (ch) => !!ch && /[\p{L}\p{N}_]/u.test(ch);
    // אות שימוש אחת בעברית לפני השם ("ושינה", "בשינה") עדיין נחשבת אזכור; הקישור עוטף רק את השם
    const startsWord = (i) => !isWordChar(text[i - 1]) || ('ובהלמשכ'.includes(text[i - 1]) && !isWordChar(text[i - 2]));
    let at = lower.indexOf(want, start);
    while (at >= 0) {
      const end = at + want.length;
      const free = !blocked.some(([a, b]) => at < b && end > a);
      if (free && startsWord(at) && !isWordChar(text[end])) break;
      at = lower.indexOf(want, at + 1);
    }
    if (at < 0) { showToast(`לא נמצא אזכור פשוט של ״${name}״ ב״${noteName(other)}״.`); return; }
    const found = text.slice(at, at + want.length);
    const target = linkTextFor(p);
    const link = found === target ? `[[${target}]]` : `[[${target}|${found}]]`;
    await window.api.write(other, text.slice(0, at) + link + text.slice(at + want.length), mtime);
    refreshBacklinks();
    showToast(`״${noteName(other)}״ מקשר עכשיו לכאן.`, 'פתיחה', () => openNote(other));
  } catch (err) { setStatus('שגיאה בקישור האזכור: ' + err.message); }
}

// ===== לוח ההקשר (src/context-panel.js): קישורים, קישורים חוזרים, ראשי פרקים, משימות, מידע =====
// eslint-disable-next-line prefer-const
var docPanel = createContextPanel({
  root: $('docCtx'), wrap: $('pageWrap'), icon, store, propsHost: $('propsHost'),
  api: {
    addProperties: () => editorApi.addProperties(),
    getPath: () => state.currentPath,
    getMarkdown: () => editorApi.getMarkdown(),
    isRaw: () => editorApi.isRaw(),
    getEditor: () => editorApi.editor,
    resolve: (t) => resolveTarget(t),
    openLink: (t) => openLink(t),
    openNote: (p) => openNote(p),
    backlinks: (p) => window.api.backlinks(p),
    pickLinks: () => pickLinksFor(state.currentPath),
    removeFrontLink: (t) => setRelated(relatedLinks().filter((x) => x !== t)),
    unlinkText: (t) => {
      const n = editorApi.unlinkTarget(t);
      if (!n) return;
      const msg = n > 1 ? `${n} קישורים ל״${t}״ הפכו לטקסט רגיל.` : `הקישור ל״${t}״ הפך לטקסט רגיל.`;
      if (editorApi.isRaw()) showToast(msg);
      else showToast(msg, 'ביטול', () => editorApi.editor.commands.undo());
    },
    makeLinkHub: (anchor) => makeLinkHub(anchor),
    findMentions: (p) => findMentions(p),
    linkMention: (p) => linkMention(p),
    showTag: (t) => showTags(t),
    addTaskSection: () => insertTaskSection(),
    addFollowUp: (t) => toolbarApi.edit.addFollowUp(t),
    getFlag: () => state.flags.get(state.currentPath) || null,
    setFlag: (c) => setNoteFlag(state.currentPath, c),
    getMtime: () => state.mtime,
    prettyPath: (p) => prettyPath(p),
  },
});
function refreshLinksPanel() { docPanel.refresh(); renderRelated(); }

// ===== כפתורים =====
$('btnPick').addEventListener('click', pickRoot);
$('btnPickBig').addEventListener('click', pickRoot);
$('btnSettings').addEventListener('click', openSettings);

// 10.9 (לבקשת המשתמש): מסמך חדש נפתח מיד בשם "ללא שם", והשם נקבע ביציאה ממנו (nameOnLeave).
// עם שם שכבר נבחר (קישור רפאים, Ctrl+O עם שם) לא שואלים. עד 10.8 חלון השם קפץ לפני שהמסמך נפתח.
async function newNote(presetName, { dir: chosen } = {}) {
  if (!state.root) return;
  try {
    const dir = await noteTargetDir(chosen);
    let file = null;
    if (presetName) file = await window.api.createNote(dir, presetName);
    else {
      file = await createUntitled((name) => window.api.createNote(dir, name));
      if (!file) return;
    }
    await refreshTree();
    await openNote(file);
    editorApi.editor.commands.focus();
  } catch (err) { setStatus(err.message); }
}

// "ללא שם", "ללא שם 2"… (השם הפנוי הראשון), ונרשם כמסמך שעוד אין לו שם
async function createUntitled(create) {
  for (let i = 1; i < 200; i++) {
    try {
      const file = await create(i === 1 ? UNTITLED : `${UNTITLED} ${i}`);
      setUntitled(file, true);
      return file;
    } catch (err) { if (!/קיים/.test(err.message)) throw err; }
  }
  return null;
}

// ----- 10.9: שם ביציאה מהמסמך (מ־11.0 גם למסמך גרפי) -----
// הרשימה נשמרת לכל כספת (untitled:<תיקייה>), כך שגם אחרי סגירת האפליקציה השאלה תגיע ביציאה הבאה.
// שינוי שם ידני (F2, לחיצה על השם, העץ) מוריד את המסמך מהרשימה: המשתמש כבר קבע שם.
// (פונקציות ולא const: updateDocTitle נקרא כבר באתחול, לפני השורות האלה)
var UNTITLED = 'ללא שם';
function untitledKey() { return 'untitled:' + state.root; }
function untitledList() { return (state.root && store.get(untitledKey(), [])) || []; }
function setUntitled(p, on) {
  const list = untitledList().filter((x) => x !== p);
  if (on) list.push(p);
  store.set(untitledKey(), list.slice(-50));
  if (p === state.currentPath) updateDocTitle();
}
function isUntitled(p) { return !!p && untitledList().includes(p); }
// map: נתיב ← נתיב חדש, או null כשנמחק. clear (שינוי שם): המשתמש קבע שם, ולכן יורד מהרשימה
function remapUntitled(map, clear = false) {
  const list = untitledList();
  if (!list.length) return;
  store.set(untitledKey(), list.map((p) => { const to = map(p); return clear && to !== p ? null : to; }).filter(Boolean));
}
// הצעה לשם: הכותרת הראשונה, או השורה הראשונה בטקסט, בלי סימני Markdown ותווים שאסורים בשם קובץ
function suggestName(body) {
  const lines = body.split(/\r?\n/).map((l) => l.replace(/\\([\\`*_{}[\]()#+\-.!|~<>$%=])/g, '$1').trim())
    .filter((l) => l && !/^(<!--|---|\*\*\*|___|```|\$\$)/.test(l));
  const line = lines.find((l) => /^#{1,6}\s/.test(l)) || lines[0] || '';
  return line.replace(/^#{1,6}\s+/, '').replace(/^[-*+>]\s+/, '').replace(/^\d+[.)]\s+/, '').replace(/^\[[ xX]\]\s+/, '')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/<[^>]+>/g, '')
    .replace(/[*_~`=#[\]]/g, '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim();
}
let naming = false;
// יציאה מהמסמך הפתוח (מעבר למסמך אחר, מסך הבית, סגירת כרטיסייה): אם עוד אין לו שם, שואלים עכשיו,
// עם הצעה מהשורה הראשונה. "להשאיר" שומר את "ללא שם" ולא שואל שוב. מסמך ריק לגמרי עובר לסל המחזור בשקט,
// כדי שלא יצטברו "ללא שם" ריקים. מחזיר { removed } לניקוי הכרטיסייה אחרי המעבר (afterLeave).
// 11.5: p = מסמך אחר (כרטיסייה ברקע שנסגרת); ברירת המחדל: המסמך הפתוח. מחזיר גם { renamed: נתיב חדש }
async function nameOnLeave(next, p = state.currentPath) {
  if (!p || p === next || naming || !isUntitled(p)) return null;
  naming = true;
  try {
    // עריכה פתוחה (כרטיס בקנבס, שדה) נסגרת ונשמרת לפני שבודקים אם המסמך ריק ולפני חלון השם
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    await new Promise((r) => setTimeout(r, 0));
    await flushSave();
    const text = await window.api.read(p).catch(() => null);
    if (text == null) return null;
    const canvas = isCanvas(p);
    const body = canvas ? canvasText(text) : text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '').trim();
    const blank = canvas ? canvasEmpty(text) : !body;
    // מסמך ריק, או "מחיקה" בחלון השם (11.4): עובר לסל המחזור והכרטיסייה נסגרת (afterLeave)
    const removeUntitled = async () => {
      try { await window.api.remove(p); } catch (err) { setStatus(err.message); return false; }
      setUntitled(p, false);
      meta.drop(p);
      const keep = (x) => x !== p;
      state.back = state.back.filter(keep);
      state.forward = state.forward.filter(keep);
      state.recent = state.recent.filter(keep);
      return true;
    };
    if (blank) {
      if (!(await removeUntitled())) return null;
      setStatus(canvas ? 'מסמך גרפי ריק בלי שם הועבר לסל המחזור' : 'מסמך ריק בלי שם הועבר לסל המחזור');
      return { removed: p };
    }
    const name = await ask(canvas ? 'איך לקרוא למסמך הגרפי?' : 'איך לקרוא למסמך?', suggestName(body) || noteName(p), { okText: 'שמירה', cancelText: `להשאיר "${noteName(p)}"`, extraText: 'מחיקה' });
    if (name === ASK_EXTRA) {
      if (!(await removeUntitled())) return null;
      setStatus(canvas ? 'המסמך הגרפי הועבר לסל המחזור' : 'המסמך הועבר לסל המחזור');
      return { removed: p };
    }
    // רק אחרי תשובה (גם "להשאיר"): אם האפליקציה נסגרה באמצע, השאלה תחזור ביציאה הבאה
    setUntitled(p, false);
    const clean = (name || '').trim();
    if (clean && clean !== noteName(p)) {
      const to = await renameNode({ path: p, name: noteName(p) + (canvas ? '.canvas' : '.md') }, clean);
      if (to) return { renamed: to };
    }
    return null;
  } finally { naming = false; }
}
// קנבס: ריק = בלי צמתים וקווים; ההצעה לשם מהכרטיס הראשון שיש בו טקסט (או שם קבוצה)
function canvasData(text) { try { return JSON.parse(text) || {}; } catch { return null; } }
function canvasEmpty(text) {
  const d = canvasData(text);
  return !!d && !(d.nodes || []).length && !(d.edges || []).length;
}
function canvasText(text) {
  const d = canvasData(text);
  const n = (d?.nodes || []).find((x) => (x.type === 'text' && String(x.text || '').trim()) || (x.type === 'group' && x.label));
  return n ? String(n.text || n.label) : '';
}
async function afterLeave(left) {
  if (!left?.removed) return;
  await tabs.drop((x) => x === left.removed);
  await refreshTree();
}

// ===== תבניות (התיקייה והפורמטים מ־.obsidian/templates.json, ראו 'templates' ב־main.js) =====
// בוחרים תבנית בלוח החיפוש המהיר. מחזיר { text, conf } או null.
async function pickTemplate(placeholder) {
  const conf = await window.api.templates();
  if (!conf.list.length) {
    setStatus(conf.folder ? 'אין תבניות בתיקיית התבניות' : 'לא נמצאה תיקיית תבניות (Templates, או ההגדרה של אובסידיאן)');
    return null;
  }
  const chosen = await new Promise((resolve) => {
    let picked = false;
    openPalette({
      placeholder,
      footer: '↑↓ בחירה · Enter בחירה · Esc ביטול',
      emptyText: 'אין תבנית כזו',
      items: (query) => conf.list
        .map((t) => ({ t, m: fuzzy(query, t.name) }))
        .filter((x) => x.m)
        .sort((a, b) => (query.trim() ? b.m.score - a.m.score : 0))
        .map(({ t, m }) => ({ title: t.name, marks: m.marks, run: () => { picked = true; resolve(t); } })),
      onClose: () => { if (!picked) resolve(null); },
    });
  });
  if (!chosen) return null;
  return { text: await window.api.read(chosen.path), conf };
}
async function newNoteFromTemplate({ dir } = {}) {
  if (!state.root) return;
  const tpl = await pickTemplate('תבנית למסמך החדש…');
  if (!tpl) return;
  // 11.5: כמו מסמך חדש רגיל: נפתח מיד כ"ללא שם", והשם נקבע ביציאה (nameOnLeave). רק תבנית שמשתמשת בשם
  // ({{title}}) צריכה אותו מראש, ולכן רק אז שואלים. עד עכשיו חלון השם קפץ תמיד לפני הפתיחה.
  const needsName = /\{\{\s*title\s*\}\}/i.test(tpl.text);
  const name = needsName ? await ask('שם המסמך:') : null;
  if (needsName && !name) return;
  try {
    const target = await noteTargetDir(dir);
    const fill = (title) => fillTemplate(tpl.text, { title, dateFormat: tpl.conf.dateFormat, timeFormat: tpl.conf.timeFormat });
    const file = needsName ? await window.api.createNote(target, name, fill(name))
      : await createUntitled((n) => window.api.createNote(target, n, fill(n)));
    if (!file) return;
    await refreshTree();
    await openNote(file);
    editorApi.editor.commands.focus('end');
  } catch (err) { setStatus(err.message); }
}
// הוספת תבנית במקום הסמן במסמך הפתוח (כמו "Insert template" באובסידיאן)
async function insertTemplate() {
  if (!state.currentPath) return;
  if (editorApi.isRaw()) { setStatus('הוספת תבנית עובדת בתצוגה המעוצבת'); return; }
  const tpl = await pickTemplate('תבנית להוספה במקום הסמן…');
  if (!tpl) return;
  const text = fillTemplate(tpl.text, { title: noteName(state.currentPath), dateFormat: tpl.conf.dateFormat, timeFormat: tpl.conf.timeFormat });
  // כשבחור גוש שלם (למשל קו מפריד בסוף המסמך), מוסיפים אחריו ולא במקומו
  const sel = editorApi.editor.state.selection;
  const chain = editorApi.editor.chain().focus();
  (sel.node ? chain.insertContentAt(sel.to, text) : chain.insertContent(text)).run();
}

// ===== כותרת ידנית ← מאפיינים (headerToProps ב־vault-data.js) =====
async function convertHeader(p = state.currentPath) {
  if (!p) return;
  try {
    await flushSave();
    const text = await window.api.read(p);
    const r = headerToProps(text);
    if (r.skip) { setStatus(r.skip === 'אין כותרת בראש המסמך' ? 'אין במסמך כותרת להמרה' : `לא הומר: ${r.skip}`); return; }
    const before = p === state.currentPath ? state.mtime : await window.api.mtime(p);
    const after = await window.api.write(p, r.text, before);
    if (p === state.currentPath) { state.mtime = after; await reloadFromDisk(); updateDocTitle(); }
    setStatus('הכותרת הועברה למאפיינים');
  } catch (err) { setStatus(err.message === 'CONFLICT' ? 'המסמך השתנה בחוץ. פתחו אותו מחדש ונסו שוב' : 'שגיאה: ' + err.message); }
}
async function convertAllHeaders() {
  if (!state.root) return;
  await flushSave();
  const tpl = await window.api.templates().catch(() => ({}));
  openHeaderConvert({
    notes: allNotes().map((n) => ({ path: n.path, rel: n.rel })),
    skipDir: tpl.folder || null,
    read: (p) => window.api.read(p),
    mtime: (p) => window.api.mtime(p),
    write: (p, t, m) => window.api.write(p, t, m),
    onDone: async (changed) => {
      if (state.currentPath && changed.includes(state.currentPath)) { state.mtime = await window.api.mtime(state.currentPath); await reloadFromDisk(); updateDocTitle(); }
      await refreshTree();
      setStatus(`הכותרות הועברו למאפיינים ב־${changed.length} מסמכים`);
    },
  });
}

async function newFolder() {
  if (!state.root) return;
  const name = await ask('שם התיקייה:');
  if (!name) return;
  try {
    await window.api.createFolder(folderTargetDir(), name);
    await refreshTree();
  } catch (err) { setStatus(err.message); }
}

$('btnNote').addEventListener('click', () => newNote());
$('btnFolder').addEventListener('click', newFolder);
$('btnGraph').addEventListener('click', showGraph);
$('btnTags').addEventListener('click', () => showTags());
$('btnRecent').addEventListener('click', showRecent);
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
      // התאריך ביחידה נפרדת משמאל לימין שלא נשברת, אחרת בכותרת בעברית הוא מתהפך
      const dated = /^(.*?)\s*\((\d{4}-\d{2}-\d{2})\)\s*$/.exec(section[1]);
      title.textContent = dated ? dated[1] + ' ' : section[1];
      if (dated) {
        const date = document.createElement('span');
        date.className = 'hc-version-date';
        date.dir = 'ltr';
        date.textContent = dated[2];
        title.append(date);
      }
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
// מיד: העץ מסונן לפי שם (עם התיקיות, פתוחות). אחרי הפסקה בהקלדה: התאמות בתוך התוכן, מתחת.
let searchTimer = null;
let searchSeq = 0;
function drawSearch(q) {
  const tree = $('tree');
  tree.innerHTML = '';
  const names = filterTree(state.tree, q);
  const nameHead = document.createElement('h4');
  nameHead.className = 'search-sec';
  nameHead.textContent = names.length ? `בשם (${countFiles(names)})` : 'אין מסמך בשם הזה';
  const nameBox = document.createElement('div');
  const textHead = document.createElement('h4');
  textHead.className = 'search-sec';
  textHead.textContent = 'בתוך המסמכים…';
  const textBox = document.createElement('div');
  tree.append(nameHead, nameBox, textHead, textBox);
  if (names.length) {
    renderTree(nameBox, names, {
      activePath: state.currentPath, collapsed: new Set(), highlight: q,
      onOpen: async (p, o) => { $('search').value = ''; await openNote(p, o); },
      onSelectDir: () => {}, onToggleDir: () => {}, onContext: showContextMenu, onDelete: deleteNode,
      root: state.root, flagOf: (p) => state.flags.get(p) || null, iconOf: (p) => meta.iconOf(p), backgroundOf: (p) => meta.backgroundOf(p),
    });
  }
  const seq = ++searchSeq;
  searchTimer = setTimeout(async () => {
    const inNames = new Set();
    const walk = (ns) => ns.forEach((n) => (n.type === 'file' ? inNames.add(n.path) : walk(n.children)));
    walk(names);
    const results = (await window.api.search(q)).filter((r) => !inNames.has(r.path));
    if (seq !== searchSeq || !textBox.isConnected) return;
    textHead.textContent = results.length ? `בתוך המסמכים (${results.length})` : 'אין התאמות נוספות בתוך המסמכים';
    if (results.length) renderSearchResults(textBox, results, async (p) => { $('search').value = ''; await openNote(p); });
  }, 250);
}
$('search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (!q) { searchSeq++; drawTree(); return; }
  drawSearch(q);
});

// ===== עץ: הצגה, כיווץ ופתיחה =====
function saveCollapsed() { store.set('collapsed:' + state.root, [...state.collapsed]); }
function allDirs(nodes = state.tree, out = []) {
  for (const n of nodes) if (n.type === 'dir') { out.push(n.path); allDirs(n.children, out); }
  return out;
}
function revealInTree() { if (state.currentPath) revealPath(state.currentPath); }
// 11.2: כל מסמך (גם לא הפתוח, למשל מסמך מקושר): פותח את התיקיות שמעליו, גולל אליו ומבליט אותו לרגע
function revealPath(p) {
  if (!p) return;
  if ($('search').value) { $('search').value = ''; }
  if (document.body.dataset.sidebarMode === 'compact') setSidebarMode('expanded');
  for (const d of allDirs()) if (p.startsWith(d + '\\') || p.startsWith(d + '/')) state.collapsed.delete(d);
  saveCollapsed();
  drawTree();
  const row = [...$('tree').querySelectorAll('.node.file')].find((n) => n.dataset.path === p);
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
}
// מיקוד: כל התיקיות נסגרות חוץ מאלה שמובילות למסמך הפתוח, והעץ גולל אליו ומבליט אותו
function focusTree() {
  if (!state.currentPath) { collapseAll(); return; }
  if ($('search').value) $('search').value = '';
  const p = state.currentPath;
  state.collapsed = new Set(allDirs().filter((d) => !(p.startsWith(d + '\\') || p.startsWith(d + '/'))));
  saveCollapsed();
  drawTree();
  const row = document.querySelector('#tree .node.active');
  if (row) { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); }
}
$('btnTreeFocus').addEventListener('click', focusTree);
$('btnTreeCollapse').addEventListener('click', () => { collapseAll(); $('tree').scrollTo({ top: 0, behavior: 'smooth' }); });
// פותח תיקייה בעץ (וכל מה שמעליה), גולל אליה ומבליט אותה לרגע. התיקייה הראשית: גלילה לראש העץ.
function revealDir(dir) {
  if ($('search').value) $('search').value = '';
  if (document.body.dataset.sidebarMode === 'compact') setSidebarMode('expanded');
  for (const d of allDirs()) if (dir === d || dir.startsWith(d + '\\') || dir.startsWith(d + '/')) state.collapsed.delete(d);
  saveCollapsed();
  drawTree();
  if (dir === state.root) { $('tree').scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const row = [...$('tree').querySelectorAll('.node.dir')].find((n) => n.dataset.path === dir);
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
}
// ===== ניווט מהיר במקלדת =====
// Ctrl+↑/↓: המסמך הקודם/הבא מבין מה שגלוי עכשיו בעץ (תיקיות סגורות לא נכנסות; בחיפוש: התוצאות לפי שם)
function stepNote(dir) {
  const rows = [...$('tree').querySelectorAll('.node.file')];
  if (!rows.length) return;
  const i = rows.findIndex((r) => r.dataset.path === state.currentPath);
  const target = i < 0 ? (dir > 0 ? rows[0] : rows[rows.length - 1]) : rows[i + dir];
  if (!target) return;
  openNote(target.dataset.path).then(() => {
    [...$('tree').querySelectorAll('.node.file')].find((r) => r.dataset.path === target.dataset.path)?.scrollIntoView({ block: 'nearest' });
  });
}
// Ctrl+Shift+↑/↓: התיקייה הקודמת/הבאה (לפי סדר העץ, גם סגורות) שיש בה מסמכים, פותחת אותה ואת המסמך הראשון בה
function stepFolder(dir) {
  const folders = [];
  const direct = (nodes) => nodes.find((n) => n.type === 'file');
  if (direct(state.tree)) folders.push({ path: state.root, first: direct(state.tree).path });
  const walk = (nodes) => { for (const n of nodes) if (n.type === 'dir' && !archivedPath(n.path)) { const f = direct(n.children); if (f) folders.push({ path: n.path, first: f.path }); walk(n.children); } };
  walk(state.tree);
  if (!folders.length) return;
  const cur = state.currentPath ? dirname(state.currentPath) : state.selectedDir || null;
  const i = folders.findIndex((f) => f.path === cur);
  const target = i < 0 ? (dir > 0 ? folders[0] : folders[folders.length - 1]) : folders[i + dir];
  if (!target) return;
  if ($('search').value) $('search').value = '';
  for (const d of allDirs()) if (target.path === d || target.path.startsWith(d + '\\') || target.path.startsWith(d + '/')) state.collapsed.delete(d);
  saveCollapsed();
  state.selectedDir = target.path;
  openNote(target.first).then(() => {
    const row = [...$('tree').querySelectorAll('.node.dir')].find((n) => n.dataset.path === target.path);
    if (row) { row.scrollIntoView({ block: 'nearest' }); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); }
    else $('tree').scrollTo({ top: 0 });
  });
}

// 11.2: העברת מסמך לתיקייה בלי לחפש אותו בעץ: רשימת כל התיקיות עם חיפוש, ותיקייה חדשה בשם שהוקלד.
// נפתח מהפירורים שמעל הדף, מהתפריט של קישור [[...]] (בשביל המסמך המקושר), מהעץ ומלוח הפקודות.
function moveToFolder(path = state.currentPath) {
  if (!path || !state.root) return;
  const here = dirname(path);
  const label = (d) => (d === state.root ? 'התיקייה הראשית' : relOf(d).split('/').join(' › '));
  const dirs = [state.root, ...allDirs().filter((d) => !isArchived(relOf(d)))];
  openPalette({
    placeholder: `העברת "${noteName(path)}" אל…`,
    footer: '↑↓ בחירה · Enter העברה · Esc ביטול',
    emptyText: 'אין תיקייה כזו',
    items: (query) => {
      const q = query.trim();
      const list = [];
      for (const d of dirs) {
        const m = q ? fuzzy(q, label(d)) : { score: 0, marks: [] };
        if (!m) continue;
        const current = d === here;
        list.push({ score: m.score - (current ? 1000 : 0), title: label(d), marks: m.marks,
          hint: current ? 'המיקום הנוכחי' : '', run: () => { if (!current) moveNode(path, d); } });
      }
      if (q) list.sort((a, b) => b.score - a.score);
      else list.sort((a, b) => (a.hint ? -1 : b.hint ? 1 : 0)); // המיקום הנוכחי ראשון, כדי שיהיה ברור איפה המסמך עכשיו
      const clean = q.replace(/[\\/:*?"<>|]/g, '').trim();
      if (clean && !dirs.some((d) => d !== state.root && label(d).split(' › ').pop().toLowerCase() === clean.toLowerCase())) {
        list.push({ title: `תיקייה חדשה בתיקייה הראשית: ${clean}`, className: 'pal-create', run: async () => {
          try {
            await window.api.createFolder(state.root, clean);
            await moveNode(path, state.root + (state.root.includes('\\') ? '\\' : '/') + clean);
          } catch (err) { setStatus(err.message); }
        } });
      }
      return list;
    },
  });
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
      const notes = quickNotes(); // בלי הארכיון
      const recentRank = new Map(state.recent.map((p, i) => [p, i]));
      const folder = (n) => (n.rel.includes('/') ? n.rel.slice(0, n.rel.lastIndexOf('/')).split('/').join(' › ') : '');
      const q = query.trim();
      let list;
      if (!q) {
        // בלי חיפוש: האחרונות שנפתחו, ואחריהן כל השאר לפי א"ב
        list = notes
          .filter((n) => n.path !== state.currentPath)
          .sort((a, b) => (recentRank.get(a.path) ?? 1e6) - (recentRank.get(b.path) ?? 1e6) || a.name.localeCompare(b.name, 'he', { numeric: true }))
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
        // גם מסמך בארכיון תופס את השם: לא מציעים ליצור כפול שלו
        if (!allNotes().some((n) => n.name.toLowerCase() === q.toLowerCase())) {
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
// בחירת מסמך בחלון החיפוש המהיר (למשל: איזה מסמך לפתוח לצד)
function pickNote(placeholder, cb) {
  openPalette({
    placeholder,
    footer: '↑↓ בחירה · Enter בחירה · Esc ביטול',
    emptyText: 'אין מסמכים',
    items: (query) => quickNotes()
      .filter((n) => n.path !== state.currentPath)
      .map((n) => ({ n, m: fuzzy(query, n.name) }))
      .filter((x) => x.m)
      .sort((a, b) => (query.trim() ? b.m.score - a.m.score : 0))
      .slice(0, 50)
      .map(({ n, m }) => ({ title: n.name, marks: m.marks, hint: n.rel.includes('/') ? n.rel.slice(0, n.rel.lastIndexOf('/')).split('/').join(' › ') : '', run: () => cb(n.path) })),
  });
}

// nav: קיצורי ניווט. לא פועלים בתוך שדה קלט (חיפוש וכו'), כדי ש־Ctrl+חצים ימשיכו לעבוד שם כרגיל
const COMMANDS = [
  { title: 'הכרטיסייה הבאה', keys: 'Ctrl+Alt+←', run: () => tabs.step(1), needs: 'note' },
  { title: 'הכרטיסייה הקודמת', keys: 'Ctrl+Alt+→', run: () => tabs.step(-1), needs: 'note' },
  { title: 'הכרטיסייה הבאה ', keys: 'Ctrl+Tab', run: () => tabs.step(1), needs: 'note', hidden: true },
  { title: 'הכרטיסייה הקודמת ', keys: 'Ctrl+Shift+Tab', run: () => tabs.step(-1), needs: 'note', hidden: true },
  { title: 'סגירת הכרטיסייה', keys: 'Ctrl+W', run: () => state.currentPath && tabs.close(state.currentPath), needs: 'note' },
  { title: 'שני מסמכים זה לצד זה / ביטול', keys: 'Ctrl+\\', run: () => tabs.toggleSplit((cb) => pickNote('מסמך לפתוח לצד…', cb)), needs: 'note' },
  { title: 'פתיחת מסמך לצד…', run: () => pickNote('מסמך לפתוח לצד…', (p) => tabs.splitWith(p)), needs: 'note' },
  { title: 'המסמך הבא בעץ', keys: 'Ctrl+↓', run: () => stepNote(1), needs: 'root', nav: true },
  { title: 'המסמך הקודם בעץ', keys: 'Ctrl+↑', run: () => stepNote(-1), needs: 'root', nav: true },
  { title: 'התיקייה הבאה', keys: 'Ctrl+Shift+↓', run: () => stepFolder(1), needs: 'root', nav: true },
  { title: 'התיקייה הקודמת', keys: 'Ctrl+Shift+↑', run: () => stepFolder(-1), needs: 'root', nav: true },
  { title: 'מעבר מהיר למסמך', keys: 'Ctrl+O', run: openSwitcher, needs: 'root' },
  { title: 'לוח פקודות', keys: 'Ctrl+P', run: openCommands },
  { title: 'מסמך חדש', keys: 'Ctrl+N', run: () => newNote(), needs: 'root' },
  { title: 'מסמך חדש מתבנית…', run: newNoteFromTemplate, needs: 'root' },
  { title: 'מסמך גרפי חדש (קנבס: כרטיסים, תמונות, ציור וקווים)', run: newCanvas, needs: 'root' },
  { title: 'הוספת תבנית במקום הסמן…', run: insertTemplate, needs: 'note' },
  { title: 'העברת הכותרת למאפיינים', run: () => convertHeader(), needs: 'note' },
  { title: 'העברת המסמך לארכיון', run: () => { if (!archivedPath(state.currentPath)) archiveNode(currentNode()); }, needs: 'note' },
  { title: 'החזרת המסמך מהארכיון', run: () => { if (archivedPath(state.currentPath)) restoreNode(currentNode()); }, needs: 'note' },
  { title: 'העברת הכותרות למאפיינים בכל המסמכים…', run: convertAllHeaders, needs: 'root' },
  { title: 'תיקייה חדשה', keys: 'Ctrl+Shift+N', run: newFolder, needs: 'root' },
  { title: 'חיפוש בכל המסמכים', keys: 'Ctrl+Shift+F', run: () => { $('search').focus(); $('search').select(); }, needs: 'root' },
  { title: 'שמירה', keys: 'Ctrl+S', run: flushSave, needs: 'note' },
  { title: 'מעבר בין תצוגה מעוצבת ל־Markdown', keys: 'Ctrl+E', run: () => rawButton()?.click(), needs: 'note' },
  { title: 'שינוי שם המסמך', keys: 'F2', run: () => renameNode(currentNode()), needs: 'note' },
  { title: 'מחיקת המסמך (לסל המחזור)', run: () => deleteNode(currentNode()), needs: 'note' },
  { title: 'מסמך קשור… (בשורת "קשורים")', keys: 'Ctrl+Shift+K', run: () => pickLinksFor(state.currentPath), needs: 'note' },
  { title: 'קישור למסמך בתוך הטקסט', keys: 'Ctrl+K', run: () => { if (!editorApi.isRaw()) toolbarApi.edit.link(); }, needs: 'note' },
  { title: 'פתק קישור… (פתק שמקשר כמה מסמכים)', run: () => makeLinkHub(null), needs: 'note' },
  { title: 'שכפול המסמך', run: () => duplicateNode(currentNode()), needs: 'note' },
  { title: 'ייבוא תמונה', run: importImages, needs: 'note' },
  { title: 'ציור חדש', run: newDrawing, needs: 'note' },
  { title: 'אחורה למסמך הקודם', keys: 'Alt+←', run: () => goHistory(-1) },
  { title: 'קדימה', keys: 'Alt+→', run: () => goHistory(1) },
  { title: 'הצגת המסמך בעץ הקבצים', run: revealInTree, needs: 'note' },
  { title: 'העברת המסמך לתיקייה…', keys: 'Ctrl+Shift+M', run: () => moveToFolder(), needs: 'note' },
  { title: 'מיזוג מסמך אחר לתוך המסמך הזה…', run: () => pickNote('איזה מסמך למזג לתוך המסמך הזה?', (src) => mergeNotes(src, state.currentPath)), needs: 'note' },
  { title: 'כיווץ כל התיקיות', run: collapseAll, needs: 'root' },
  { title: 'מיקוד העץ על המסמך הפתוח', keys: 'Ctrl+Shift+L', run: focusTree, needs: 'root' },
  { title: 'פתיחת כל התיקיות', run: expandAll, needs: 'root' },
  { title: 'הצגת המסמך בסייר הקבצים של Windows', run: () => window.api.reveal(state.currentPath), needs: 'note' },
  { title: 'הגדרות', keys: 'Ctrl+,', run: openSettings },
  { title: 'מה חדש (Patch Notes)', run: openPatchNotes },
  { title: 'גרף הקישורים', keys: 'Ctrl+G', run: showGraph, needs: 'root' },
  { title: 'מסמכים אחרונים', keys: 'Ctrl+Shift+H', run: showRecent, needs: 'root' },
  { title: 'מסך הבית', keys: 'Alt+Home', run: goHome, needs: 'root' },
  { title: 'תגיות', run: () => showTags(), needs: 'root' },
  { title: 'משימות להמשך בכל המסמכים', keys: 'Ctrl+Shift+T', run: () => showTasks('followUp'), needs: 'root' },
  { title: 'תיבות סימון בכל המסמכים', run: () => showTasks('checks'), needs: 'root' },
  { title: 'הצגת המסומנים בסרגל הימני (או הסתרה)', run: () => toggleFlagged(), needs: 'root' },
  ...FLAG_LIST.map((fl) => ({ title: `דגל ${fl.name} למסמך`, run: () => setNoteFlag(state.currentPath, fl.id), needs: 'note' })),
  { title: 'הסרת הדגל מהמסמך', run: () => setNoteFlag(state.currentPath, null), needs: 'note' },
  { title: 'מסמכי רפאים (קישורים למסמכים שלא נוצרו)', run: showGhosts, needs: 'root' },
  { title: 'משימות להמשך בסוף המסמך', run: insertTaskSection, needs: 'note' },
  // 8.0: F11 = מסך מלא אמיתי של Windows (לבקשת המשתמש). מצב מיקוד: הכפתור בסרגל, לוח הפקודות, או קיצור שמגדירים
  { title: 'מסך מלא', keys: 'F11', run: () => window.api.toggleFullScreen() },
  { id: 'focusMode', title: 'מצב מיקוד (רק הדף)', run: () => toggleFocusMode(), needs: 'note' },
  { title: 'המרה ל־Markdown רגיל (בלי תוספות של Tali, בשביל אובסידיאן)', run: () => convertNoteToPlainMd(), needs: 'note' },
  { title: 'מצב שינה (רק הסמל)', keys: 'Ctrl+Alt+L', run: () => enterSleep() },
  { title: 'משימות שבוצעו בסוף הרשימה: הפעלה או כיבוי', run: () => toggleCompletedAtBottom() },
  { title: 'לוח ההקשר: קישורים (החוצה ופנימה)', run: () => docPanel.open('links'), needs: 'note' },
  { title: 'לוח ההקשר: ראשי פרקים', run: () => docPanel.open('outline'), needs: 'note' },
  { title: 'לוח ההקשר: תיבות סימון במסמך', run: () => docPanel.open('checks'), needs: 'note' },
  { title: 'לוח ההקשר: משימות להמשך במסמך', run: () => docPanel.open('followups'), needs: 'note' },
  { title: 'לוח ההקשר: מידע על המסמך', run: () => docPanel.open('info'), needs: 'note' },
  { title: 'לוח ההקשר: מאפיינים (YAML)', run: () => docPanel.open('props'), needs: 'note' },
  { title: 'סגירת לוח ההקשר', run: () => docPanel.open(null), needs: 'note' },
  { title: 'הוספת מאפיינים', run: () => { docPanel.open('props'); editorApi.addProperties(); }, needs: 'note' },
  { title: 'הוספת סמל מיוחד (α ∀ → ⊂)', run: () => toolbarApi.edit.symbol(), needs: 'note' },
  { title: 'ייצוא ל־PDF', run: () => exportNote('pdf'), needs: 'note' },
  { title: 'ייצוא ל־Word', run: () => exportNote('docx'), needs: 'note' },
  { title: 'החלפת תיקיית עבודה', run: pickRoot },
];
// The default shortcut itself is a stable id for the existing command set. Custom values live in prefs.hotkeys.
for (const command of COMMANDS) if (command.keys && !command.id) command.id = 'shortcut:' + command.keys;
// 10.4: פקודות מסמך שמתאימות גם לקנבס
const CANVAS_OK = new Set(['הכרטיסייה הבאה', 'הכרטיסייה הקודמת', 'סגירת הכרטיסייה', 'שני מסמכים זה לצד זה / ביטול', 'פתיחת מסמך לצד…', 'שמירה', 'שינוי שם המסמך', 'מחיקת המסמך (לסל המחזור)', 'שכפול המסמך', 'העברת המסמך לארכיון', 'החזרת המסמך מהארכיון', 'הצגת המסמך בעץ הקבצים', 'העברת המסמך לתיקייה…']);
for (const command of COMMANDS) if (CANVAS_OK.has(command.title.trim())) command.canvas = true;
setHotkeyCatalog(COMMANDS);
// 10.4: פקודות של מסמך (needs: 'note') פועלות בקנבס רק אם סומנו canvas: true (שינוי שם, מחיקה וכו')
const available = (c) => !c.needs || (c.needs === 'root' ? !!state.root : !!state.currentPath && (!state.canvas || !!c.canvas));

function openCommands() {
  openPalette({
    placeholder: 'הקלד פקודה…',
    footer: '↑↓ בחירה · Enter הפעלה · Esc סגירה',
    items: (query) => {
      const list = [];
      for (const c of COMMANDS) {
        if (!available(c) || c.run === openCommands || c.hidden) continue;
        const m = fuzzy(query, c.title);
        if (m) list.push({ score: m.score, title: c.title, marks: m.marks, keys: commandHotkey(c, getPrefs()), run: c.run });
      }
      return query.trim() ? list.sort((a, b) => b.score - a.score) : list;
    },
  });
}

// שלב הלכידה: הקיצורים של האפליקציה קודמים לעורך (למשל Ctrl+E)
window.addEventListener('keydown', (e) => {
  // בזמן דיאלוג (שם, אישור, הגדרות) הקיצורים כבויים
  if (topDialog() && !isPaletteOpen()) return;
  for (const c of COMMANDS) {
    const hotkey = commandHotkey(c, getPrefs());
    if (!hotkey || !matchesHotkey(e, hotkey)) continue;
    // ניווט ב־Ctrl+חצים: לא בתוך שדה קלט קטן (חיפוש, שם, מאפיינים), שם החצים מזיזים את הסמן
    if (c.nav && (e.target instanceof HTMLInputElement || titleEditing)) return;
    // בתוך חלון החיפוש המהיר עובדים רק המעברים בינו לבין לוח הפקודות
    if (isPaletteOpen() && c.run !== openSwitcher && c.run !== openCommands) return;
    e.preventDefault();
    e.stopPropagation();
    closePalette();
    if (available(c)) c.run();
    return;
  }
}, true);
// Ctrl+W מגיע מ־main.js (שם הוא נחסם, כי Electron סוגר בו את החלון). בזמן דיאלוג: לא עושים כלום
window.api.onCloseTab(() => { if (!topDialog() && state.currentPath) tabs.close(state.currentPath); });
// כפתורי אחורה/קדימה בעכבר
window.addEventListener('mouseup', (e) => {
  if (e.button === 3) goHistory(-1);
  if (e.button === 4) goHistory(1);
});
window.addEventListener('beforeunload', () => { rememberPosition(); if (state.dirty) flushSave(); });

// ===== התחלה =====
(async () => {
  await loadPrefs();
  setFolderLoading(true);
  try {
    const r = await window.api.init();
    if (r) await enterRoot(r);
  } finally { setFolderLoading(false); }
})();

