// TALI Mobile: מתאם Google Drive לממשק של runSync (sync-core.js), בלי ספריות ובלי שרת משלנו.
//   { name, list() -> [{path, rev}], read(path) -> data, write(path, data) -> rev, remove(path) }
// הנתיבים יחסיים לתיקיית הכספת שנבחרה ב־Drive, עם '/'. rev = md5Checksum של Drive.
// fetch ו־getToken מוזרקים, כך שהבדיקות (tests/mobile-drive.test.mjs) רצות מול Drive מדומה.
//
// כללים:
// - list() מחזיר רשימה שלמה או נכשל. רשימה חלקית הייתה גורמת לסנכרון "למחוק" בטלפון קבצים שלא נקראו.
// - remove() מעביר לסל של Drive (trashed), לא מוחק לצמיתות. כמו "לסל המחזור" בדסקטופ.
// - תיקיות וקבצים שמתחילים בנקודה (.obsidian, .trash, .tali.json, .x.tali-saving) לא מסונכרנים.
// - מסמכי Google (Docs/Sheets) לא מסונכרנים: אין להם תוכן קובץ.
// - טקסט נקרא כבייטים ומפוענח ב־UTF-8 בלי להסיר BOM, כדי שהעלאה חוזרת לא תשנה את הקובץ.

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const FILE_FIELDS = 'id,name,mimeType,md5Checksum,size,modifiedTime';
const ALL_DRIVES = 'supportsAllDrives=true&includeItemsFromAllDrives=true';

export const TEXT_RE = /\.(md|canvas)$/i;
export const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
export const MAX_ATTACHMENT = 10 * 1024 * 1024;

// האם קובץ מהמקור נכנס לטלפון: מסמכים תמיד, תמונות עד 10MB, כל השאר (PDF, וידאו...) נשאר במחשב.
export function shouldSync(path, size = 0) {
  if (path.split('/').some((s) => s.startsWith('.'))) return false;
  if (TEXT_RE.test(path)) return true;
  return IMAGE_RE.test(path) && Number(size || 0) <= MAX_ATTACHMENT;
}

export function mimeOf(path) {
  const ext = (path.match(/\.([^./]+)$/) || [])[1]?.toLowerCase();
  return { md: 'text/markdown', canvas: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp' }[ext] || 'application/octet-stream';
}

const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const baseOf = (p) => p.slice(p.lastIndexOf('/') + 1);
const join = (dir, name) => (dir ? `${dir}/${name}` : name);

export class DriveError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

// בקשה עם הרשאה, ניסיון חוזר אחד אחרי 401 (טוקן שפג) ועד 3 אחרי 429/5xx
function client({ getToken, fetch: f = globalThis.fetch.bind(globalThis), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  return async function call(url, opts = {}) {
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      const token = await getToken({ refresh: refreshed });
      const res = await f(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } });
      if (res.status === 401 && !refreshed) { refreshed = true; continue; }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(500 * 2 ** attempt); continue; }
      if (!res.ok) {
        let message = `Drive ${res.status}`;
        try { message = (await res.json())?.error?.message || message; } catch { /* בלי גוף */ }
        throw new DriveError(message, res.status, res.status === 401 ? 'AUTH' : undefined);
      }
      return res;
    }
  };
}

async function listChildren(call, parentId, extraQuery = '') {
  const out = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${parentId}' in parents and trashed=false${extraQuery}`);
    const url = `${API}/files?q=${q}&pageSize=1000&fields=${encodeURIComponent(`nextPageToken,files(${FILE_FIELDS})`)}&${ALL_DRIVES}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const body = await (await call(url)).json();
    out.push(...(body.files || []));
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return out;
}

// תיקיות בתוך תיקייה, לבורר התיקייה בהתחברות. parentId 'root' = "האחסון שלי".
export async function listFolders({ getToken, fetch, parentId = 'root' }) {
  const call = client({ getToken, fetch });
  const files = await listChildren(call, parentId, ` and mimeType='${FOLDER_MIME}'`);
  return files.filter((f) => !f.name.startsWith('.')).map((f) => ({ id: f.id, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he', { numeric: true }));
}

export function driveRemote({ folderId, folderName = 'Google Drive', getToken, fetch, sleep, concurrency = 4 }) {
  const call = client({ getToken, fetch, sleep });
  const index = new Map();               // path -> { id, rev, modifiedTime }
  const folders = new Map([['', folderId]]); // path -> id
  let listed = false;

  const fileId = (path) => {
    const hit = index.get(path);
    if (!hit) throw new DriveError(`לא נמצא ב־Drive: ${path}`, 404);
    return hit.id;
  };

  async function ensureFolder(dir) {
    if (folders.has(dir)) return folders.get(dir);
    const parent = await ensureFolder(dirOf(dir));
    const res = await call(`${API}/files?fields=id&${ALL_DRIVES}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: baseOf(dir), mimeType: FOLDER_MIME, parents: [parent] }),
    });
    const { id } = await res.json();
    folders.set(dir, id);
    return id;
  }

  return {
    name: `Google Drive · ${folderName}`,
    kind: 'drive',
    folderId,

    async list() {
      index.clear();
      for (const k of [...folders.keys()]) if (k) folders.delete(k);
      const queue = [['', folderId]];
      // כמה תיקיות במקביל. שגיאה אחת מפילה את הכול (לא מחזירים רשימה חלקית).
      while (queue.length) {
        const batch = queue.splice(0, concurrency);
        const results = await Promise.all(batch.map(([dir, id]) => listChildren(call, id).then((files) => [dir, files])));
        for (const [dir, files] of results) {
          for (const f of files) {
            if (!f.name || f.name.startsWith('.') || f.name.includes('/')) continue;
            const path = join(dir, f.name);
            if (f.mimeType === FOLDER_MIME) { folders.set(path, f.id); queue.push([path, f.id]); continue; }
            if (f.mimeType?.startsWith('application/vnd.google-apps.')) continue;
            if (!shouldSync(path, f.size)) continue;
            const prev = index.get(path);
            // שני קבצים באותו שם באותה תיקייה (Drive מרשה): החדש מביניהם
            if (prev && String(prev.modifiedTime) >= String(f.modifiedTime)) continue;
            index.set(path, { id: f.id, rev: f.md5Checksum || f.modifiedTime, modifiedTime: f.modifiedTime });
          }
        }
      }
      listed = true;
      return [...index].map(([path, { rev }]) => ({ path, rev }));
    },

    async read(path) {
      const res = await call(`${API}/files/${fileId(path)}?alt=media&${ALL_DRIVES}`);
      if (TEXT_RE.test(path)) return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer());
      const buf = await res.arrayBuffer();
      return new Blob([buf], { type: mimeOf(path) });
    },

    async write(path, data) {
      if (!listed) await this.list();
      const type = mimeOf(path);
      const body = typeof data === 'string' ? new Blob([data], { type }) : data;
      const existing = index.get(path);
      let res;
      if (existing) {
        res = await call(`${UPLOAD}/files/${existing.id}?uploadType=media&fields=${FILE_FIELDS}&${ALL_DRIVES}`, {
          method: 'PATCH', headers: { 'Content-Type': type }, body,
        });
      } else {
        const parent = await ensureFolder(dirOf(path));
        const boundary = 'tali' + Math.random().toString(36).slice(2);
        const metaPart = JSON.stringify({ name: baseOf(path), parents: [parent] });
        const multipart = new Blob([
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n`,
          `--${boundary}\r\nContent-Type: ${type}\r\n\r\n`, body, `\r\n--${boundary}--`,
        ]);
        res = await call(`${UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}&${ALL_DRIVES}`, {
          method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart,
        });
      }
      const f = await res.json();
      const rev = f.md5Checksum || f.modifiedTime;
      index.set(path, { id: f.id, rev, modifiedTime: f.modifiedTime });
      return rev;
    },

    async remove(path) {
      const id = index.get(path)?.id;
      if (!id) return; // כבר לא שם
      await call(`${API}/files/${id}?fields=id&${ALL_DRIVES}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
      });
      index.delete(path);
    },
  };
}
