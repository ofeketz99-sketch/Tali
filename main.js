// תהליך ראשי של Electron: חלון, וכל הגישה לקבצים במחשב.
// כל פעולה על קבצים עוברת כאן ונבדקת שהיא בתוך התיקייה שנבחרה.
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, powerMonitor, net } = require('electron');
// Windows: own title bar in the page (#titlebar), native window buttons on top of it (titleBarOverlay)
const CUSTOM_TITLE_BAR = process.platform === 'win32';
const TITLE_BAR_H = 32;
const nativeFs = require('fs');
const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { resolveLink, replaceLinks } = require('./links');
const { withCreated } = require('./vault-data');
const { resolveNewNoteFolderPath, relativeNewNoteFolderPath } = require('./new-note-folder');
const { createVaultIndex } = require('./vault-index');
const { writeWithBackup, recoverInterruptedSave } = require('./safe-write');
const os = require('os');

// שם האפליקציה: Tali. ההגדרות נשארות בתיקייה המקורית (my-notes), כדי ששינוי השם לא ימחק אותן.
// בבדיקות מעבירים --user-data-dir, ואז לא נוגעים בתיקייה האמיתית.
app.setName('Tali');
// גרסת הפיתוח נקראת TALI-DEV (מ־7.5): משגר הפיתוח הוא TALI-DEV.exe (tools/make-exe.js), ולפי שם הקובץ
// החלון ושורת הכותרת מציגים TALI-DEV. בלי שינוי במשגר, ובלי לגעת בהגדרות (userData נשאר my-notes).
const APP_TITLE = /^tali-dev\.exe$/i.test(path.basename(process.execPath)) ? 'TALI-DEV' : 'Tali';
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', path.join(app.getPath('appData'), 'my-notes'));
if (process.platform === 'win32') app.setAppUserModelId('app.tali.notes'); // אייקון ושם נכונים בשורת המשימות

let root = null;
const vaultIndex = createVaultIndex({ getRoot: () => root });
let vaultWatcher = null;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

// Windows תומך בצפייה רקורסיבית. כך שינוי מאובסידיאן או מסנכרון מבטל מיד
// את המטמון; אם הכונן לא תומך ב־watch, ה־TTL הקצר באינדקס הוא רשת הביטחון.
function watchRoot() {
  vaultWatcher?.close();
  vaultWatcher = null;
  if (!root) return;
  try {
    const watchedRoot = root;
    const watcher = nativeFs.watch(watchedRoot, { recursive: true }, (_event, filename) => {
      const rel = String(filename || '');
      if (rel && rel.split(/[\\/]/).some((part) => part.startsWith('.'))) return;
      vaultIndex.invalidate(rel ? path.join(watchedRoot, rel) : null);
    });
    vaultWatcher = watcher;
    watcher.on('error', () => {
      watcher.close();
      if (vaultWatcher === watcher) vaultWatcher = null;
    });
  } catch { /* כונן רשת/ספק ענן בלי fs.watch רקורסיבי: המטמון פג אחרי כמה שניות */ }
}

// ה־CHANGELOG נמצא במאגר פרטי. מושכים אותו דרך Git של התהליך הראשי (בלי token בממשק).
// git fetch לא נוגע בקבצי העבודה או בענף המקומי; אם אין חיבור נופלים לעותק המקומי.
let patchNotesCache = null;
let lastExport = null;
async function gitCommand(args) {
  const candidates = process.platform === 'win32'
    ? ['git', 'C:\\Program Files\\Git\\cmd\\git.exe']
    : ['git'];
  let lastError;
  for (const binary of candidates) {
    try {
      return await execFileAsync(binary, args, {
        cwd: __dirname, timeout: 8000, maxBuffer: 192 * 1024,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
      });
    } catch (err) {
      lastError = err;
      if (err.code !== 'ENOENT') break;
    }
  }
  throw lastError;
}
// הגרסה הראשונה ב־CHANGELOG ("## 6.9 — ..."), כמערך מספרים
const topVersion = (text) => (/^##\s+(\d+(?:\.\d+)*)/m.exec(String(text || '')) || [, '0'])[1].split('.').map(Number);
const compareVersions = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
  return 0;
};
// גרסת האפליקציה מה־package.json שלה. app.getVersion() במשגר הפיתוח מחזיר את גרסת המשגר (0.2.0).
let appVersion = null;
async function getAppVersion() {
  if (appVersion) return appVersion;
  try { appVersion = JSON.parse(await fs.readFile(path.join(__dirname, 'package.json'), 'utf8')).version || app.getVersion(); }
  catch { appVersion = app.getVersion(); }
  return appVersion;
}
async function getPatchNotes() {
  const now = Date.now();
  if (patchNotesCache && now - patchNotesCache.time < (patchNotesCache.data.source === 'github' ? 300000 : 30000)) {
    return patchNotesCache.data;
  }
  // מ־6.9: הגרסה החדשה מבין שתיהן. בערוץ הפיתוח (desktop-dev) הקוד שרץ חדש מ־main, ולכן ה־CHANGELOG
  // המקומי הוא הנכון; בגרסה מותקנת main יכול להיות חדש יותר (גרסה שעוד לא הותקנה).
  const local = await fs.readFile(path.join(__dirname, 'CHANGELOG.md'), 'utf8').catch(() => '');
  let data = { content: local, source: 'local' };
  try {
    await gitCommand(['fetch', '--quiet', '--no-tags', 'origin', 'main']);
    const { stdout } = await gitCommand(['show', 'FETCH_HEAD:CHANGELOG.md']);
    if (stdout.trim() && compareVersions(topVersion(stdout), topVersion(local)) > 0) data = { content: stdout, source: 'github' };
  } catch { /* בלי רשת או בלי Git: העותק המקומי */ }
  patchNotesCache = { time: now, data };
  return data;
}

async function loadSettings() {
  try { return JSON.parse(await fs.readFile(settingsFile(), 'utf8')); } catch { return {}; }
}
async function saveSettings(s) {
  await fs.writeFile(settingsFile(), JSON.stringify(s));
}

// ב־Windows שמות קבצים אינם תלויי רישיות: "d:\notes" ו־"D:\Notes" הם אותה תיקייה (9.7)
const pathKey = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
function safe(p) {
  const full = path.resolve(p);
  const inside = root && (pathKey(full) === pathKey(root) || pathKey(full).startsWith(pathKey(root + path.sep)));
  if (!inside) {
    throw new Error('הנתיב נמצא מחוץ לתיקיית העבודה');
  }
  return full;
}

// תיקיית ברירת המחדל למסמכים חדשים נשמרת כנתיב יחסי לכספת, כדי שהיא תמשיך לעבוד
// גם אם הכספת הועברה למחשב או לכונן אחר.
async function prepareNewNoteFolder(relative = 'מסמכים חדשים') {
  const dir = resolveNewNoteFolderPath(root, relative);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.access(dir, fs.constants.R_OK | fs.constants.W_OK);
  } catch (err) {
    throw new Error(`לא ניתן להשתמש בתיקיית המסמכים החדשים: ${err.message}`);
  }
  return dir;
}

async function prepareAttachmentFolder(relative = 'attachments') {
  const dir = resolveNewNoteFolderPath(root, relative);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.access(dir, fs.constants.R_OK | fs.constants.W_OK);
  } catch (err) {
    throw new Error(`לא ניתן להשתמש בתיקיית הקבצים המצורפים: ${err.message}`);
  }
  return dir;
}

async function readTree(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const parts = await Promise.all(entries.map(async (e) => {
    if (e.name.startsWith('.')) return { node: null, attachments: [] };
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const child = await readTree(full);
      return { node: { name: e.name, path: full, type: 'dir', children: child.tree }, attachments: child.attachments };
    }
    if (e.name.toLowerCase().endsWith('.md')) return { node: { name: e.name, path: full, type: 'file' }, attachments: [] };
    // 10.4: מסמך גרפי (JSON Canvas, כמו באובסידיאן). בעץ, וגם ברשימת הקבצים כדי ש־[[שם.canvas]] יימצא
    if (e.name.toLowerCase().endsWith('.canvas')) return { node: { name: e.name, path: full, type: 'file', kind: 'canvas' }, attachments: [full] };
    return { node: null, attachments: [full] };
  }));
  const out = parts.map((part) => part.node).filter(Boolean);
  out.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name, 'he') : a.type === 'dir' ? -1 : 1);
  return { tree: out, attachments: parts.flatMap((part) => part.attachments) };
}

async function walkFiles(dir, acc = [], wantMd = true) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return acc; } // תיקייה שאין גישה אליה: מדלגים
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walkFiles(full, acc, wantMd);
    else if (e.name.toLowerCase().endsWith('.md') === wantMd) acc.push(full);
  }
  return acc;
}

const mtimeOf = async (p) => (await fs.stat(p)).mtimeMs;

// שם פנוי בתיקייה: "תמונה.png", ואם תפוס "תמונה 1.png", "תמונה 2.png"...
async function uniquePath(dir, name) {
  const clean = name.replace(/[\\/:*?"<>|]/g, '').trim() || 'image.png';
  const ext = path.extname(clean);
  const base = clean.slice(0, clean.length - ext.length);
  for (let i = 0; ; i++) {
    const candidate = safe(path.join(dir, i ? `${base} ${i}${ext}` : clean));
    try { await fs.access(candidate); } catch { return candidate; }
  }
}

// פענוח קישורים עם זיכרון, כדי לא לחפש שוב את אותו שם בכל קובץ
function makeResolver(files) {
  const cache = new Map();
  return (target) => {
    const key = target.toLowerCase();
    if (!cache.has(key)) cache.set(key, resolveLink(target, files, root));
    return cache.get(key);
  };
}

// 11.1: אחרי העברה של מסמכים (pairs: [נתיב ישן, נתיב חדש]), כבר אחרי ה־rename בדיסק. אותה תוצאה כמו
// updateLinksAfterRename לכל זוג לפי הסדר, אבל כל קובץ נקרא פעם אחת (8 במקביל), ההחלפות נעשות בזיכרון,
// ורק מה שהשתנה נכתב. before: רשימת המסמכים לפני ההעברה. מחזיר את הנתיבים (החדשים) של מה שנכתב.
async function relinkMoved(pairs, before) {
  if (!pairs.length) return [];
  const where = new Map(pairs); // ישן -> חדש, למסמכים שזזו בעצמם
  const files = before.map((f) => ({ path: where.get(f) || f, text: null, dirty: false }));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(8, files.length) }, async () => {
    while (next < files.length) {
      const f = files[next++];
      try { f.text = await fs.readFile(f.path, 'utf8'); } catch { f.text = null; }
    }
  }));
  let list = before;
  for (const [oldFile, newFile] of pairs) {
    const after = list.map((f) => (f === oldFile ? newFile : f));
    const resolveBefore = makeResolver(list);
    const newBase = path.basename(newFile).replace(/\.md$/i, '');
    const newRel = path.relative(root, newFile).replace(/\\/g, '/').replace(/\.md$/i, '');
    const shortOk = resolveLink(newBase, after, root) === newFile;
    for (const f of files) {
      if (f.text == null || !f.text.includes('[[')) continue;
      const replaced = replaceLinks(f.text, (target) => {
        if (resolveBefore(target) !== oldFile) return null;
        return target.includes('/') || !shortOk ? newRel : newBase;
      });
      if (replaced !== f.text) { f.text = replaced; f.dirty = true; }
    }
    list = after;
  }
  const out = files.filter((f) => f.dirty);
  await Promise.all(out.map((f) => fs.writeFile(f.path, f.text, 'utf8')));
  return out.map((f) => f.path);
}

// אחרי שינוי שם של הערה: מעדכן את כל הקישורים אליה בשאר ההערות.
// מחזיר את רשימת הקבצים ששונו.
async function updateLinksAfterRename(from, to, before) {
  const after = before.map((f) => (f === from ? to : f));
  const resolveBefore = makeResolver(before);
  const newBase = path.basename(to).replace(/\.md$/i, '');
  const newRel = path.relative(root, to).replace(/\\/g, '/').replace(/\.md$/i, '');
  // שם קצר אם הוא חד־משמעי, אחרת נתיב מלא מהתיקייה הראשית
  const shortOk = resolveLink(newBase, after, root) === to;
  const changed = [];
  for (const file of after) {
    const text = await fs.readFile(file, 'utf8');
    const next = replaceLinks(text, (target) => {
      if (resolveBefore(target) !== from) return null;
      return target.includes('/') || !shortOk ? newRel : newBase;
    });
    if (next !== text) {
      await fs.writeFile(file, next, 'utf8');
      changed.push(file);
    }
  }
  return changed;
}

// ===== ייצוא: PDF דרך מנוע ההדפסה של Chromium, ו־Word כ־HTML שוורד פותח (תמונות מוטמעות בקובץ) =====
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif' };
async function inlineImages(html) {
  const out = [];
  let last = 0;
  const re = /src="file:\/\/\/([^"?]+)(?:\?[^"]*)?"/g;
  let mm;
  while ((mm = re.exec(html))) {
    out.push(html.slice(last, mm.index));
    let replacement = mm[0];
    try {
      const file = safe(decodeURIComponent(mm[1]).replace(/\//g, path.sep));
      const type = MIME[path.extname(file).slice(1).toLowerCase()];
      if (type) replacement = `src="data:${type};base64,${(await fs.readFile(file)).toString('base64')}"`;
    } catch { /* תמונה מחוץ לכספת או חסרה: נשארת כמו שהיא */ }
    out.push(replacement);
    last = mm.index + mm[0].length;
  }
  out.push(html.slice(last));
  return out.join('');
}
function exportDocument(title, body, css, forWord) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const head = forWord
    ? '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
    : '<!doctype html><html>';
  // כותרת מהשם רק אם ההערה לא פותחת כבר בכותרת זהה
  const first = /^\s*<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(body);
  const same = first && first[1].replace(/<[^>]+>/g, '').trim() === String(title).trim();
  const titleHtml = same ? '' : `<h1 class="doc-title">${esc(title)}</h1>`;
  return `${head}<head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body dir="rtl">${titleHtml}${body}</body></html>`;
}

async function setRoot(dir) {
  root = path.resolve(dir);
  vaultIndex.invalidate();
  watchRoot();
  const s = await loadSettings();
  s.lastRoot = root;
  await saveSettings(s);
  const snapshot = await readTree(root);
  return { root, ...snapshot };
}

function registerIpc() {
  ipcMain.handle('vault-index', () => vaultIndex.index());

  // העברת הערה או תיקייה לתיקייה אחרת (גרירה בעץ). הקישורים אל ההערות שעברו מתעדכנים.
  ipcMain.handle('move', async (_e, p, destDir) => {
    const from = safe(p);
    const dir = safe(destDir);
    if ((await fs.stat(dir)).isFile()) throw new Error('היעד אינו תיקייה');
    if (dir === from || dir.startsWith(from + path.sep)) throw new Error('אי אפשר להעביר תיקייה לתוך עצמה');
    const to = safe(path.join(dir, path.basename(from)));
    if (to === from) return { to, changed: [] };
    try { await fs.access(to); throw new Error('ביעד כבר יש קובץ או תיקייה בשם הזה'); }
    catch (err) { if (err.code !== 'ENOENT') throw err; }
    const isFile = (await fs.stat(from)).isFile();
    const before = await walkFiles(root);
    await fs.rename(from, to);
    // 11.1: כל מסמך נקרא פעם אחת ונכתב לכל היותר פעם אחת (relinkMoved). עד 11.0 כל העברה קראה את כל
    // הכספת אחד אחרי השני, והעברת תיקייה קראה את כל הכספת מחדש לכל מסמך שבתוכה, ולכן הגרירה לקחה זמן רב.
    const pairs = isFile
      ? [[from, to]]
      : before.filter((f) => f.startsWith(from + path.sep)).map((f) => [f, to + f.slice(from.length)]);
    const changed = await relinkMoved(pairs, before);
    vaultIndex.invalidate();
    return { to, changed };
  });

  // ייצוא ההערה הפתוחה. html: התוכן כפי שהוא מוצג בעורך (אחרי ניקוי בממשק).
  // התמונות מהכספת כ־data URI (לייצוא ל־docx, שנבנה בממשק)
  ipcMain.handle('inline-images', async (_e, html) => inlineImages(String(html)));
  // format: pdf | docx (html הוא אז הקובץ המוכן, Uint8Array) | doc (HTML ש־Word פותח, הצורה הישנה)
  ipcMain.handle('export-note', async (e, format, title, html, css) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const ext = format === 'pdf' ? 'pdf' : format === 'docx' ? 'docx' : 'doc';
    const r = await dialog.showSaveDialog(win, {
      title: format === 'pdf' ? 'ייצוא ל־PDF' : 'ייצוא ל־Word',
      defaultPath: path.join(app.getPath('documents'), `${String(title).replace(/[\\/:*?"<>|]/g, '') || 'מסמך'}.${ext}`),
      filters: [format === 'pdf' ? { name: 'PDF', extensions: ['pdf'] } : { name: 'Word', extensions: [ext] }],
    });
    if (r.canceled || !r.filePath) return null;
    if (format === 'docx') {
      if (!(html instanceof Uint8Array)) throw new Error('קובץ Word לא תקין');
      await fs.writeFile(r.filePath, Buffer.from(html));
      lastExport = r.filePath;
      return r.filePath;
    }
    const body = await inlineImages(String(html));
    if (format === 'pdf') {
      const tmp = path.join(os.tmpdir(), `tali-export-${Date.now()}.html`);
      await fs.writeFile(tmp, exportDocument(title, body, css, false), 'utf8');
      const pdfWin = new BrowserWindow({ show: false, webPreferences: { javascript: false, offscreen: false } });
      try {
        await pdfWin.loadFile(tmp);
        const pdf = await pdfWin.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'default' } });
        await fs.writeFile(r.filePath, pdf);
      } finally { pdfWin.destroy(); fs.unlink(tmp).catch(() => {}); }
    } else {
      await fs.writeFile(r.filePath, '﻿' + exportDocument(title, body, css, true), 'utf8'); // BOM: Word reads UTF-8
    }
    lastExport = r.filePath;
    return r.filePath;
  });
  // פתיחת הקובץ שיוצא עכשיו (מחוץ לתיקיית העבודה, ולכן רק הקובץ האחרון שיוצא)
  ipcMain.handle('open-export', async (_e, p) => {
    if (!lastExport || p !== lastExport) throw new Error('אפשר לפתוח רק את הקובץ שיוצא עכשיו');
    const err = await shell.openPath(p);
    if (err) throw new Error(err);
    return true;
  });

  ipcMain.handle('patch-notes', getPatchNotes);
  ipcMain.handle('app-version', getAppVersion);
  // סינכרוני: theme-boot.js קובע את שם החלון לפני הציור הראשון (Tali או TALI-DEV)
  ipcMain.on('app-title', (e) => { e.returnValue = APP_TITLE; });
  // צבע כפתורי החלון (מזעור, הגדלה, סגירה) לפי הערכה: רקע ופס כמו #titlebar
  // 8.0: F11 מעביר את החלון למסך מלא ובחזרה
  ipcMain.handle('toggle-fullscreen', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return false;
    win.setFullScreen(!win.isFullScreen());
    return win.isFullScreen();
  });
  ipcMain.handle('window-state', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return { maximized: !!win?.isMaximized(), fullScreen: !!win?.isFullScreen() };
  });
  ipcMain.on('title-bar-colors', (e, { color, symbolColor } = {}) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const hex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
    if (!CUSTOM_TITLE_BAR || !win || !hex(color) || !hex(symbolColor)) return;
    try { win.setTitleBarOverlay({ color, symbolColor, height: TITLE_BAR_H }); } catch { /* חלון בלי overlay */ }
  });
  // שמירת טבלה מלאה ללוח בפורמט HTML ובפורמט טקסט לתאימות עם Word, Excel ועורכי פתקים.
  ipcMain.handle('copy-table', (_e, html, text) => {
    clipboard.write({ html: String(html || ''), text: String(text || '') });
    return true;
  });
  ipcMain.handle('init', async () => {
    const s = await loadSettings();
    if (s.lastRoot) {
      try { await fs.access(s.lastRoot); return await setRoot(s.lastRoot); } catch { /* נבחר מחדש */ }
    }
    return null;
  });

  ipcMain.handle('pick-folder', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    return await setRoot(r.filePaths[0]);
  });

  ipcMain.handle('pick-new-note-folder', async (e) => {
    if (!root) throw new Error('קודם בוחרים תיקיית מסמכים');
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
      title: 'בחירת תיקיית מסמכים חדשים',
      defaultPath: root,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    let selected;
    try { selected = safe(r.filePaths[0]); }
    catch { throw new Error('יש לבחור תיקייה מתוך תיקיית המסמכים של Tali'); }
    try { await fs.access(selected, fs.constants.R_OK | fs.constants.W_OK); }
    catch (err) { throw new Error(`לא ניתן להשתמש בתיקייה שנבחרה: ${err.message}`); }
    return relativeNewNoteFolderPath(root, selected);
  });
  ipcMain.handle('prepare-new-note-folder', async (_e, relative) => prepareNewNoteFolder(relative));
  ipcMain.handle('pick-attachment-folder', async (e) => {
    if (!root) throw new Error('קודם בוחרים תיקיית מסמכים');
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
      title: 'בחירת תיקיית קבצים מצורפים',
      defaultPath: root,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    let selected;
    try { selected = safe(r.filePaths[0]); }
    catch { throw new Error('יש לבחור תיקייה מתוך תיקיית המסמכים של Tali'); }
    try { await fs.access(selected, fs.constants.R_OK | fs.constants.W_OK); }
    catch (err) { throw new Error(`לא ניתן להשתמש בתיקייה שנבחרה: ${err.message}`); }
    return relativeNewNoteFolderPath(root, selected);
  });
  ipcMain.handle('prepare-attachment-folder', async (_e, relative) => prepareAttachmentFolder(relative));

  ipcMain.handle('tree', async () => ({ root, ...await readTree(root) }));

  ipcMain.handle('read', async (_e, p) => {
    const file = safe(p);
    // שמירה קודמת נקטעה (קריסה, ניתוק כונן): משחזרים מהעותק שנשמר לפניה
    if (await recoverInterruptedSave(file).catch(() => false)) vaultIndex.invalidate(file);
    return fs.readFile(file, 'utf8');
  });

  ipcMain.handle('mtime', async (_e, p) => mtimeOf(safe(p)));
  // זמן היצירה והשינוי של הקובץ (לשורת המידע מעל הדף, כשאין תאריך בתוך ההערה)
  ipcMain.handle('file-times', async (_e, p) => { const st = await fs.stat(safe(p)); return { birth: st.birthtimeMs, mtime: st.mtimeMs }; });

  // expectedMtime: מתי הקובץ נקרא. אם מאז הוא השתנה מבחוץ (אובסידיאן, סנכרון Drive),
  // לא דורסים אותו אלא מחזירים שגיאת CONFLICT, והממשק שואל מה לעשות.
  ipcMain.handle('write', async (_e, p, content, expectedMtime) => {
    const file = safe(p);
    if (expectedMtime != null) {
      const now = await mtimeOf(file).catch(() => null);
      if (now != null && Math.abs(now - expectedMtime) > 1) throw new Error('CONFLICT');
    }
    await writeWithBackup(file, content);
    const mtime = await mtimeOf(file);
    vaultIndex.invalidate(file);
    return mtime;
  });

  // הערה שנערכה גם בחוץ וגם כאן: הגרסה מבחוץ נשמרת כעותק לידה, "שם (גרסה מבחוץ 14-32).md"
  ipcMain.handle('save-conflict-copy', async (_e, p, content) => {
    const file = safe(p);
    const d = new Date();
    const two = (n) => String(n).padStart(2, '0');
    const base = path.basename(file).replace(/\.md$/i, '');
    const dest = await uniquePath(path.dirname(file), `${base} (גרסה מבחוץ ${two(d.getHours())}-${two(d.getMinutes())}).md`);
    await fs.writeFile(dest, content, 'utf8');
    vaultIndex.invalidate();
    return dest;
  });

  // קבצים שאינם הערות (תמונות, PDF): לתצוגת ![[...]] ולקישורים אליהם
  ipcMain.handle('attachments', async () => (root ? vaultIndex.attachments() : []));

  // הגדרות התצוגה (גופן, צבעים וכו'), נשמרות לצד התיקייה האחרונה
  // גזירה/העתקה/הדבקה מתפריט הלחיצה הימנית: אותה פקודה כמו Ctrl+X/C/V, על הרכיב שבפוקוס
  ipcMain.handle('edit-command', (e, cmd) => { if (['cut', 'copy', 'paste', 'selectAll'].includes(cmd)) e.sender[cmd](); });
  ipcMain.handle('get-prefs', async () => (await loadSettings()).prefs || null);
  ipcMain.handle('set-prefs', async (_e, prefs) => {
    if (!prefs || typeof prefs !== 'object') return false;
    const s = await loadSettings();
    s.prefs = JSON.parse(JSON.stringify(prefs));
    await saveSettings(s);
    return true;
  });

  // ייבוא תמונות: בחירה בחלון קבצים והעתקה לתיקייה שבתוך תיקיית העבודה
  ipcMain.handle('import-images', async (e, destDir) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
      title: 'ייבוא תמונות',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'תמונות', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'] }],
    });
    if (r.canceled) return [];
    const dir = safe(destDir);
    await fs.mkdir(dir, { recursive: true });
    const out = [];
    for (const src of r.filePaths) {
      const dest = await uniquePath(dir, path.basename(src));
      await fs.copyFile(src, dest);
      out.push(dest);
    }
    if (out.length) vaultIndex.invalidate();
    return out;
  });

  // תמונה מודבקת או נגררת: התוכן מגיע מהממשק ונכתב לתיקייה
  ipcMain.handle('save-attachment', async (_e, destDir, name, bytes) => {
    const dir = safe(destDir);
    await fs.mkdir(dir, { recursive: true });
    const dest = await uniquePath(dir, name);
    await fs.writeFile(dest, Buffer.from(bytes));
    vaultIndex.invalidate();
    return dest;
  });

  // 8.3: תמונה שהודבקה כקישור (HTML מדפדפן): ההורדה כאן, כי ה־CSP של הממשק חוסם כתובות חיצוניות.
  // רק http/https, רק תוכן מסוג תמונה, עד 25MB, עם הגבלת זמן. מחזיר { type, bytes } או null.
  ipcMain.handle('fetch-image', async (_e, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url) || url.length > 4000) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await net.fetch(url, { signal: ctrl.signal });
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!res.ok || !type.startsWith('image/')) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 25 * 1024 * 1024) return null;
      return { type, bytes: new Uint8Array(buf) };
    } catch { return null; } finally { clearTimeout(timer); }
  });
  // 8.3: תמונה שבלוח של Windows כשהדפדפן לא חושף אותה כקובץ (מתוכנות מסוימות). PNG, או null.
  ipcMain.handle('clipboard-image', () => {
    const img = clipboard.readImage();
    return img.isEmpty() ? null : new Uint8Array(img.toPNG());
  });

  // שמירה מחדש של תמונה קיימת (ציור שנערך). רק קבצי תמונה, ורק בתוך תיקיית העבודה.
  ipcMain.handle('write-image', async (_e, p, bytes) => {
    const file = safe(p);
    if (!/\.(png|jpe?g|webp)$/i.test(file)) throw new Error('זה לא קובץ תמונה');
    await fs.writeFile(file, Buffer.from(bytes));
    return true;
  });

  // שכפול הערה: "שם (עותק).md" באותה תיקייה, ואם תפוס "שם (עותק) 1.md"
  ipcMain.handle('duplicate', async (_e, p) => {
    const src = safe(p);
    const ext = path.extname(src);
    const dest = await uniquePath(path.dirname(src), `${path.basename(src, ext)} (עותק)${ext}`);
    await fs.copyFile(src, dest);
    vaultIndex.invalidate();
    return dest;
  });

  // הצגת קובץ בסייר הקבצים של Windows
  ipcMain.handle('reveal', async (_e, p) => { shell.showItemInFolder(safe(p)); return true; });

  // פתיחת קובץ בתוכנה שמוגדרת לו במחשב
  ipcMain.handle('open-path', async (_e, p) => {
    const err = await shell.openPath(safe(p));
    if (err) throw new Error(err);
    return true;
  });

  // content: תוכן התחלתי (מתבנית). בלי: קובץ ריק
  ipcMain.handle('create-note', async (_e, dir, name, content = '') => {
    const clean = name.replace(/[\\/:*?"<>|]/g, '').trim() || 'ללא שם';
    const file = safe(path.join(dir, clean.toLowerCase().endsWith('.md') ? clean : clean + '.md'));
    // The configurable "new documents" inbox may not exist yet. Creating a
    // note is the single write boundary, so it also owns creation of its parent.
    await fs.mkdir(path.dirname(file), { recursive: true });
    try { await fs.access(file); throw new Error('כבר קיים קובץ בשם הזה'); }
    catch (err) { if (err.message === 'כבר קיים קובץ בשם הזה') throw err; }
    // כל מסמך חדש (רגיל, מתבנית, מקישור רפאים, פתק קישור) מקבל created מוסתר: התאריך מעל הדף נשאר נכון גם אחרי העתקה
    await fs.writeFile(file, withCreated(String(content || '')), 'utf8');
    vaultIndex.invalidate();
    return file;
  });

  // 10.4: מסמך גרפי חדש (.canvas): קנבס ריק בפורמט JSON Canvas
  ipcMain.handle('create-canvas', async (_e, dir, name) => {
    const clean = name.replace(/[\\/:*?"<>|]/g, '').trim().replace(/\.canvas$/i, '') || 'ללא שם';
    const file = safe(path.join(dir, clean + '.canvas'));
    await fs.mkdir(path.dirname(file), { recursive: true });
    try { await fs.access(file); throw new Error('כבר קיים קובץ בשם הזה'); }
    catch (err) { if (err.message === 'כבר קיים קובץ בשם הזה') throw err; }
    await fs.writeFile(file, '{\n\t"nodes": [],\n\t"edges": []\n}', 'utf8');
    vaultIndex.invalidate();
    return file;
  });

  // נתונים של Tali על הכספת, בקובץ נסתר בראש הכספת (.tali.json), כדי שיעברו איתה בסנכרון:
  // icons: סמלים; order: סדר ידני; pins: נעיצות; backgrounds: רקעי תיקיות עם צבע ושקיפות.
  ipcMain.handle('meta-read', async () => {
    if (!root) return {};
    try { return JSON.parse(await fs.readFile(path.join(root, '.tali.json'), 'utf8')) || {}; } catch { return {}; }
  });
  ipcMain.handle('meta-write', async (_e, data) => {
    if (!root) return false;
    await fs.writeFile(path.join(root, '.tali.json'), JSON.stringify(data ?? {}, null, 2) + '\n', 'utf8');
    return true;
  });

  // תבניות: התיקייה והפורמטים מההגדרות של אובסידיאן (.obsidian/templates.json), כדי ששתי התוכנות ישתמשו באותן.
  // בלי הגדרה: תיקייה בשם Templates בראש הכספת, אם יש.
  ipcMain.handle('templates', async () => {
    if (!root) return { list: [] };
    let conf = {};
    try { conf = JSON.parse(await fs.readFile(path.join(root, '.obsidian', 'templates.json'), 'utf8')); } catch { /* אין הגדרה */ }
    const rel = String(conf.folder || 'Templates').replace(/^[\\/]+|[\\/]+$/g, '');
    let dir;
    try { dir = safe(path.join(root, rel)); if (!(await fs.stat(dir)).isDirectory()) throw 0; } catch { return { folder: null, list: [] }; }
    const files = await walkFiles(dir);
    return {
      folder: dir, dateFormat: conf.dateFormat || 'YYYY-MM-DD', timeFormat: conf.timeFormat || 'HH:mm',
      list: files.map((f) => ({ path: f, name: path.basename(f).replace(/\.md$/i, '') })).sort((a, b) => a.name.localeCompare(b.name, 'he', { numeric: true })),
    };
  });

  // ארכיון (src/archive.js): יוצר את שרשרת התיקיות אם חסרה ומחזיר את הנתיב המלא. parts יחסיים לכספת.
  const validParts = (parts) => Array.isArray(parts) && parts.every((p) => typeof p === 'string' && p && !/[\\/:*?"<>|]/.test(p) && p !== '..' && p !== '.');
  ipcMain.handle('ensure-folder', async (_e, parts) => {
    if (!root || !validParts(parts)) throw new Error('נתיב לא תקין');
    const dir = safe(path.join(root, ...parts));
    await fs.mkdir(dir, { recursive: true });
    return dir;
  });
  // אחרי החזרה מהארכיון: מסיר תיקיות שהתרוקנו, מהעמוקה ועד (לא כולל) parts[0] (תיקיית הארכיון).
  // rmdir בלבד, שנכשל בתיקייה שיש בה משהו, ולכן אף קובץ לא נמחק.
  ipcMain.handle('prune-empty-folders', async (_e, parts) => {
    if (!root || !validParts(parts)) return;
    for (let n = parts.length; n > 1; n--) {
      try { await fs.rmdir(safe(path.join(root, ...parts.slice(0, n)))); } catch { return; }
    }
  });

  ipcMain.handle('create-folder', async (_e, dir, name) => {
    const clean = name.replace(/[\\/:*?"<>|]/g, '').trim();
    if (!clean) throw new Error('שם ריק');
    await fs.mkdir(safe(path.join(dir, clean)));
    return true;
  });

  ipcMain.handle('rename', async (_e, p, newName) => {
    const from = safe(p);
    const isFile = (await fs.stat(from)).isFile();
    let clean = newName.replace(/[\\/:*?"<>|]/g, '').trim();
    if (!clean) throw new Error('שם ריק');
    // 10.4: קנבס נשאר קנבס
    const ext = isFile && from.toLowerCase().endsWith('.canvas') ? '.canvas' : '.md';
    if (isFile && !clean.toLowerCase().endsWith(ext)) clean += ext;
    const to = safe(path.join(path.dirname(from), clean));
    if (to.toLowerCase() !== from.toLowerCase()) {
      try { await fs.access(to); throw new Error('כבר קיים קובץ או תיקייה בשם הזה'); }
      catch (err) { if (err.code !== 'ENOENT') throw err; }
    }
    const before = isFile ? await walkFiles(root) : null;
    await fs.rename(from, to);
    const changed = isFile ? await updateLinksAfterRename(from, to, before) : [];
    vaultIndex.invalidate();
    return { to, changed };
  });

  // הערות שמקשרות להערה הזו. משתמש באותו ניתוח שכבר נבנה לאינדקס,
  // ולכן מעבר בין מסמכים לא קורא מחדש את כל הכספת.
  ipcMain.handle('backlinks', async (_e, p) => vaultIndex.backlinks(safe(p)));

  ipcMain.handle('delete', async (_e, p) => {
    await shell.trashItem(safe(p)); // מעביר לסל המחזור, לא מוחק לצמיתות
    vaultIndex.invalidate();
    return true;
  });

  ipcMain.handle('search', async (_e, query) => {
    const q = String(query || '').toLowerCase().trim();
    if (!q || !root) return [];
    const results = [];
    for (const file of await walkFiles(root)) {
      const name = path.basename(file, '.md');
      const text = await fs.readFile(file, 'utf8');
      const idx = text.toLowerCase().indexOf(q);
      if (idx >= 0 || name.toLowerCase().includes(q)) {
        const start = Math.max(0, idx - 30);
        results.push({
          path: file,
          name,
          snippet: idx >= 0 ? text.slice(start, idx + 70).replace(/\s+/g, ' ') : '',
        });
      }
      if (results.length >= 50) break;
    }
    return results;
  });
}

// 8.5: הסמל במרכז המסך מרגע שהאפליקציה מוכנה ועד שהחלון הראשי מופיע, כחיווי שההפעלה עבדה.
// חלון קטן, שקוף, בלי מסגרת ובלי כפתור בשורת המשימות. במשגר הפיתוח (TALI-DEV) המשגר כבר מציג
// את אותו סמל עוד לפני העדכון (launcher/splash.js) ומסמן TALI_LAUNCH_SPLASH, ואז לא מציגים שני סמלים.
let launchSplash = null;
function showLaunchSplash() {
  if (process.env.TALI_LAUNCH_SPLASH === '1' || launchSplash) return;
  try {
    launchSplash = new BrowserWindow({
      width: 200, height: 200, center: true, frame: false, transparent: true, resizable: false,
      movable: false, minimizable: false, maximizable: false, skipTaskbar: true, focusable: false,
      show: false, hasShadow: false, backgroundColor: '#00000000', title: APP_TITLE,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    launchSplash.once('ready-to-show', () => { if (launchSplash && !launchSplash.isDestroyed()) launchSplash.showInactive(); });
    launchSplash.on('closed', () => { launchSplash = null; });
    launchSplash.loadFile(path.join(__dirname, 'src', 'launch-splash.html'));
    setTimeout(closeLaunchSplash, 20000); // אף פעם לא נשאר תקוע
  } catch { launchSplash = null; }
}
function closeLaunchSplash() {
  if (launchSplash && !launchSplash.isDestroyed()) launchSplash.destroy();
  launchSplash = null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: APP_TITLE,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    backgroundColor: '#aac7f2', // the intro's background (src/splash.js)
    show: false, // shown on its first painted frame, which is already the intro: no white window
    // Windows: the native title bar (dark/white by system theme) is replaced by #titlebar in the page,
    // and only the min/max/close buttons stay native. Their colors follow the theme (title-bar-colors).
    ...(CUSTOM_TITLE_BAR ? { titleBarStyle: 'hidden', titleBarOverlay: { color: '#aac7f2', symbolColor: '#1f2328', height: TITLE_BAR_H } } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 9.7: הממשק רץ בארגז חול של Chromium. preload.js משתמש רק ב־contextBridge וב־ipcRenderer
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  const sendWindowState = () => {
    if (!win.isDestroyed()) win.webContents.send('window-state', {
      maximized: win.isMaximized(), fullScreen: win.isFullScreen(),
    });
  };
  for (const event of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(event, sendWindowState);
  win.webContents.on('did-finish-load', sendWindowState);
  // Ctrl+W: בתפריט המובנה (המוסתר) של Electron זה סוגר את החלון. אצלנו: סגירת הכרטיסייה
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.control || input.meta) && !input.shift && !input.alt && input.code === 'KeyW') {
      e.preventDefault();
      win.webContents.send('close-tab');
    }
  });
  // קישורים לאינטרנט נפתחים בדפדפן, לא בתוך האפליקציה
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); }
  });
  win.once('ready-to-show', () => win.show());
  win.once('show', closeLaunchSplash); // 8.5: החלון הופיע: הסמל של ההפעלה נעלם
  setTimeout(() => { if (!win.isDestroyed() && !win.isVisible()) win.show(); }, 3000); // never stay hidden
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

// עותק אחד בלבד: הפעלה נוספת (קיצור הדרך או start.cmd) מביאה לחזית את החלון הפתוח,
// כדי ששני חלונות לא יערכו את אותן הערות במקביל
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  showLaunchSplash();
  registerIpc();
  createWindow();
  // התעוררות משינה, פתיחת נעילה או שינוי שעון: הממשק בודק מחדש איזו ערכת צבעים צריכה לפעול
  const wake = () => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('system-wake'); };
  powerMonitor.on('resume', wake);
  powerMonitor.on('unlock-screen', wake);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => { vaultWatcher?.close(); vaultWatcher = null; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

