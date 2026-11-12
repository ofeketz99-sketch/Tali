// תהליך ראשי של Electron: חלון, וכל הגישה לקבצים במחשב.
// כל פעולה על קבצים עוברת כאן ונבדקת שהיא בתוך התיקייה שנבחרה.
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, powerMonitor } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { resolveLink, extractLinks, replaceLinks } = require('./links');
const { extractTags, extractTasks, extractTargets, getFlag, isLinkHub, withCreated, getCreatedDate } = require('./vault-data');
const os = require('os');

// שם האפליקציה: Tali. ההגדרות נשארות בתיקייה המקורית (my-notes), כדי ששינוי השם לא ימחק אותן.
// בבדיקות מעבירים --user-data-dir, ואז לא נוגעים בתיקייה האמיתית.
app.setName('Tali');
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', path.join(app.getPath('appData'), 'my-notes'));
if (process.platform === 'win32') app.setAppUserModelId('app.tali.notes'); // אייקון ושם נכונים בשורת המשימות

let root = null;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

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
async function getPatchNotes() {
  const now = Date.now();
  if (patchNotesCache && now - patchNotesCache.time < (patchNotesCache.data.source === 'github' ? 300000 : 30000)) {
    return patchNotesCache.data;
  }
  let data;
  try {
    await gitCommand(['fetch', '--quiet', '--no-tags', 'origin', 'main']);
    const { stdout } = await gitCommand(['show', 'FETCH_HEAD:CHANGELOG.md']);
    if (!stdout.trim()) throw new Error('Empty changelog');
    data = { content: stdout, source: 'github' };
  } catch {
    data = { content: await fs.readFile(path.join(__dirname, 'CHANGELOG.md'), 'utf8'), source: 'local' };
  }
  patchNotesCache = { time: now, data };
  return data;
}

async function loadSettings() {
  try { return JSON.parse(await fs.readFile(settingsFile(), 'utf8')); } catch { return {}; }
}
async function saveSettings(s) {
  await fs.writeFile(settingsFile(), JSON.stringify(s));
}

function safe(p) {
  const full = path.resolve(p);
  if (!root || !(full === root || full.startsWith(root + path.sep))) {
    throw new Error('הנתיב נמצא מחוץ לתיקיית העבודה');
  }
  return full;
}

async function readTree(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push({ name: e.name, path: full, type: 'dir', children: await readTree(full) });
    } else if (e.name.toLowerCase().endsWith('.md')) {
      out.push({ name: e.name, path: full, type: 'file' });
    }
  }
  out.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name, 'he') : a.type === 'dir' ? -1 : 1);
  return out;
}

async function walkFiles(dir, acc = [], wantMd = true) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
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

// ===== אינדקס הכספת: קישורים, תגיות ומשימות לכל הערה =====
// הניתוח של כל קובץ נשמר בזיכרון לפי זמן השינוי שלו, כך שקריאה חוזרת זולה.
const parseCache = new Map(); // path -> { mtime, targets, tags, tasks }
async function vaultIndex() {
  if (!root) return { notes: [] };
  const files = await walkFiles(root);
  const attachments = await walkFiles(root, [], false);
  const resolve = makeResolver(files.concat(attachments));
  const notes = [];
  for (const file of files) {
    let st;
    try { st = await fs.stat(file); } catch { continue; }
    let parsed = parseCache.get(file);
    if (!parsed || parsed.mtime !== st.mtimeMs) {
      const text = await fs.readFile(file, 'utf8');
      parsed = { mtime: st.mtimeMs, targets: extractTargets(text), tags: [...new Set(extractTags(text).map((t) => t.tag))], tasks: extractTasks(text), flag: getFlag(text), hub: isLinkHub(text), created: getCreatedDate(text) };
      parseCache.set(file, parsed);
    }
    const links = [], missing = [];
    for (const t of parsed.targets) {
      const p = resolve(t);
      if (p) { if (/\.md$/i.test(p) && p !== file) links.push(p); }
      else if (!/\.[a-z0-9]{2,5}$/i.test(t) || /\.md$/i.test(t)) missing.push(t.split('#')[0].trim());
    }
    notes.push({
      path: file,
      name: path.basename(file).replace(/\.md$/i, ''),
      rel: path.relative(root, file).replace(/\\/g, '/').replace(/\.md$/i, ''),
      links: [...new Set(links)], missing: [...new Set(missing.filter(Boolean))],
      tags: parsed.tags, tasks: parsed.tasks, flag: parsed.flag, hub: parsed.hub,
      // תאריכים לחלון "מסמכים אחרונים": נערך (זמן השינוי), ונוצר (מתוך ההערה, ואם אין: המוקדם מבין יצירה ושינוי של הקובץ)
      mtime: st.mtimeMs, created: parsed.created ? new Date(parsed.created + 'T00:00').getTime() : Math.min(st.birthtimeMs || st.mtimeMs, st.mtimeMs),
    });
  }
  return { notes };
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
  const s = await loadSettings();
  s.lastRoot = root;
  await saveSettings(s);
  return { root, tree: await readTree(root) };
}

function registerIpc() {
  ipcMain.handle('vault-index', vaultIndex);

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
    const changed = new Set();
    if (isFile) {
      for (const f of await updateLinksAfterRename(from, to, before)) changed.add(f);
    } else {
      // תיקייה: מעדכנים קישורים לכל הערה שבתוכה, אחת אחרי השנייה
      let list = before;
      for (const oldFile of before.filter((f) => f.startsWith(from + path.sep))) {
        const newFile = to + oldFile.slice(from.length);
        for (const f of await updateLinksAfterRename(oldFile, newFile, list)) changed.add(f);
        list = list.map((f) => (f === oldFile ? newFile : f));
      }
    }
    return { to, changed: [...changed] };
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

  ipcMain.handle('tree', async () => ({ root, tree: await readTree(root) }));

  ipcMain.handle('read', async (_e, p) => fs.readFile(safe(p), 'utf8'));

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
    await fs.writeFile(file, content, 'utf8');
    return mtimeOf(file);
  });

  // הערה שנערכה גם בחוץ וגם כאן: הגרסה מבחוץ נשמרת כעותק לידה, "שם (גרסה מבחוץ 14-32).md"
  ipcMain.handle('save-conflict-copy', async (_e, p, content) => {
    const file = safe(p);
    const d = new Date();
    const two = (n) => String(n).padStart(2, '0');
    const base = path.basename(file).replace(/\.md$/i, '');
    const dest = await uniquePath(path.dirname(file), `${base} (גרסה מבחוץ ${two(d.getHours())}-${two(d.getMinutes())}).md`);
    await fs.writeFile(dest, content, 'utf8');
    return dest;
  });

  // קבצים שאינם הערות (תמונות, PDF): לתצוגת ![[...]] ולקישורים אליהם
  ipcMain.handle('attachments', async () => (root ? walkFiles(root, [], false) : []));

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
    return out;
  });

  // תמונה מודבקת או נגררת: התוכן מגיע מהממשק ונכתב לתיקייה
  ipcMain.handle('save-attachment', async (_e, destDir, name, bytes) => {
    const dir = safe(destDir);
    await fs.mkdir(dir, { recursive: true });
    const dest = await uniquePath(dir, name);
    await fs.writeFile(dest, Buffer.from(bytes));
    return dest;
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
    try { await fs.access(file); throw new Error('כבר קיים קובץ בשם הזה'); }
    catch (err) { if (err.message === 'כבר קיים קובץ בשם הזה') throw err; }
    // כל מסמך חדש (רגיל, מתבנית, מקישור רפאים, פתק קישור) מקבל created מוסתר: התאריך מעל הדף נשאר נכון גם אחרי העתקה
    await fs.writeFile(file, withCreated(String(content || '')), 'utf8');
    return file;
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
    if (isFile && !clean.toLowerCase().endsWith('.md')) clean += '.md';
    const to = safe(path.join(path.dirname(from), clean));
    if (to.toLowerCase() !== from.toLowerCase()) {
      try { await fs.access(to); throw new Error('כבר קיים קובץ או תיקייה בשם הזה'); }
      catch (err) { if (err.code !== 'ENOENT') throw err; }
    }
    const before = isFile ? await walkFiles(root) : null;
    await fs.rename(from, to);
    const changed = isFile ? await updateLinksAfterRename(from, to, before) : [];
    return { to, changed };
  });

  // הערות שמקשרות להערה הזו, עם השורה שבה מופיע הקישור
  ipcMain.handle('backlinks', async (_e, p) => {
    const target = safe(p);
    const files = await walkFiles(root);
    const resolve = makeResolver(files);
    const out = [];
    for (const file of files) {
      if (file === target) continue;
      const text = await fs.readFile(file, 'utf8');
      const hits = extractLinks(text).filter((l) => resolve(l.target) === target);
      if (!hits.length) continue;
      const i = hits[0].index;
      const lineStart = text.lastIndexOf('\n', i) + 1;
      const lineEnd = text.indexOf('\n', i);
      const line = text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd).trim();
      out.push({
        path: file,
        name: path.basename(file).replace(/\.md$/i, ''),
        snippet: line.length > 160 ? line.slice(0, 160) + '…' : line,
        count: hits.length,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, 'he'));
    return out;
  });

  ipcMain.handle('delete', async (_e, p) => {
    await shell.trashItem(safe(p)); // מעביר לסל המחזור, לא מוחק לצמיתות
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Tali',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    backgroundColor: '#aac7f2', // the intro's background (src/splash.js)
    show: false, // shown on its first painted frame, which is already the intro: no white window
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
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
  registerIpc();
  createWindow();
  // התעוררות משינה, פתיחת נעילה או שינוי שעון: הממשק בודק מחדש איזו ערכת צבעים צריכה לפעול
  const wake = () => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('system-wake'); };
  powerMonitor.on('resume', wake);
  powerMonitor.on('unlock-screen', wake);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
