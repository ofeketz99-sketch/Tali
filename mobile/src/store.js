// TALI Mobile: הכספת המקומית בטלפון (IndexedDB). עובד בלי אינטרנט; הסנכרון (sync-core.js) משווה מולה.
// רשומה: { path, data, hash, baseHash, baseRev, deleted, mtime }  (baseHash/baseRev: ראו sync-core.js)
//   data: מחרוזת למסמך (.md/.canvas), Blob לקובץ מצורף (תמונה וכו')
//   deleted: מחיקה שעוד לא סונכרנה (tombstone). רשומה כזו לא מוצגת ברשימות.
import { hashText } from './sync-core.js';

const DB = 'tali-mobile';
const FILES = 'files';
const META = 'meta';

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(FILES)) d.createObjectStore(FILES, { keyPath: 'path' });
        if (!d.objectStoreNames.contains(META)) d.createObjectStore(META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export const isNotePath = (p) => /\.md$/i.test(p);
export const isTextPath = (p) => /\.(md|canvas|json|txt)$/i.test(p);

export async function hashData(data) {
  if (typeof data === 'string') return hashText(data);
  if (data == null) return null;
  const buf = new Uint8Array(data instanceof Blob ? await data.arrayBuffer() : data);
  // גיבוב של הבייטים: מחרוזת latin1 בחתיכות, כדי לא לחרוג מגבול הארגומנטים
  let s = '';
  for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
  return hashText(s);
}

export const vault = {
  async list({ includeDeleted = true } = {}) {
    const all = await tx(FILES, 'readonly', (s) => req(s.getAll()));
    return includeDeleted ? all : all.filter((f) => !f.deleted);
  },
  get: (path) => tx(FILES, 'readonly', (s) => req(s.get(path))),
  put: (record) => tx(FILES, 'readwrite', (s) => req(s.put({ mtime: Date.now(), ...record }))),
  remove: (path) => tx(FILES, 'readwrite', (s) => req(s.delete(path))),

  // כתיבה מהממשק: מעדכנת גיבוב וזמן, ושומרת את baseHash (מה שהיה בסנכרון האחרון)
  async write(path, data) {
    const old = await this.get(path);
    const hash = await hashData(data);
    if (old && !old.deleted && old.hash === hash) return old;
    const rec = { path, data, hash, baseHash: old?.baseHash ?? null, baseRev: old?.baseRev ?? null, deleted: false, mtime: Date.now() };
    await this.put(rec);
    return rec;
  },
  // מחיקה מהממשק: אם הקובץ כבר סונכרן, נשארת מצבה עד הסנכרון הבא (כדי למחוק גם במקור)
  async trash(path) {
    const old = await this.get(path);
    if (!old) return;
    if (old.baseRev == null) await this.remove(path);
    else await this.put({ ...old, data: null, hash: null, deleted: true, mtime: Date.now() });
  },
  async rename(from, to) {
    const old = await this.get(from);
    if (!old || old.deleted) return;
    await this.write(to, old.data);
    await this.trash(from);
  },
  // ניתוק מהמקור: מה שכבר שם ולא השתנה מוסר מהטלפון (הוא בענן), מה שלא נשלח נשאר ונחשב "חדש".
  // כך חיבור למקור אחר (או לאותו מקור שוב) לא מעלה כפילויות של כל הכספת, ולא מאבד עבודה.
  async forgetRemote() {
    let removed = 0, kept = 0;
    for (const f of await this.list()) {
      const clean = f.baseRev != null && !f.deleted && f.hash === f.baseHash;
      if (f.deleted || clean) { await this.remove(f.path); removed++; }
      else { await this.put({ ...f, baseHash: null, baseRev: null }); kept++; }
    }
    return { removed, kept };
  },
  // כמה שינויים מחכים לסנכרון
  async pending() {
    return (await this.list()).filter((f) => f.deleted || f.baseRev == null || f.hash !== f.baseHash).length;
  },
};

export const meta = {
  get: (key) => tx(META, 'readonly', (s) => req(s.get(key))),
  set: (key, value) => tx(META, 'readwrite', (s) => req(s.put(value, key))),
};

// מתאם לממשק של runSync (sync-core.js)
export const localForSync = {
  list: () => vault.list(),
  get: (p) => vault.get(p),
  put: (r) => vault.put(r),
  remove: (p) => vault.remove(p),
};
