// תהליך ראשי של Electron: חלון, וכל הגישה לקבצים במחשב.
// כל פעולה על קבצים עוברת כאן ונבדקת שהיא בתוך התיקייה שנבחרה.
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { resolveLink, extractLinks, replaceLinks } = require('./links');

// שם האפליקציה: Tali. ההגדרות נשארות בתיקייה המקורית (my-notes), כדי ששינוי השם לא ימחק אותן.
// בבדיקות מעבירים --user-data-dir, ואז לא נוגעים בתיקייה האמיתית.
app.setName('Tali');
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', path.join(app.getPath('appData'), 'my-notes'));
if (process.platform === 'win32') app.setAppUserModelId('app.tali.notes'); // אייקון ושם נכונים בשורת המשימות

let root = null;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

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

async function setRoot(dir) {
  root = path.resolve(dir);
  const s = await loadSettings();
  s.lastRoot = root;
  await saveSettings(s);
  return { root, tree: await readTree(root) };
}

function registerIpc() {
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

  ipcMain.handle('create-note', async (_e, dir, name) => {
    const clean = name.replace(/[\\/:*?"<>|]/g, '').trim() || 'ללא שם';
    const file = safe(path.join(dir, clean.toLowerCase().endsWith('.md') ? clean : clean + '.md'));
    try { await fs.access(file); throw new Error('כבר קיים קובץ בשם הזה'); }
    catch (err) { if (err.message === 'כבר קיים קובץ בשם הזה') throw err; }
    await fs.writeFile(file, '', 'utf8');
    return file;
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
    backgroundColor: '#f1eee8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  // קישורים לאינטרנט נפתחים בדפדפן, לא בתוך האפליקציה
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); }
  });
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
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
