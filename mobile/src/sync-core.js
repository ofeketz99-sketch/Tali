// TALI Mobile: לוגיקת הסנכרון, פונקציות טהורות (עם בדיקות ב־tests/mobile-sync.test.mjs).
// עיקרון: אף פעם לא דורסים שינוי. לכל קובץ זוכרים מה היה ברגע הסנכרון האחרון:
//   baseHash: הגיבוב של התוכן בטלפון באותו רגע   -> האם הטלפון שינה מאז
//   baseRev:  מזהה הגרסה במקור (המחשב/הענן)      -> האם המקור שינה מאז
// כך יודעים מי שינה: הטלפון, המקור, או שניהם (ואז נשמרים שניהם).
//
// רשומה מקומית: { path, hash, baseHash, baseRev, deleted? }   (baseRev = null: עוד לא סונכרן)
// רשומה מרוחקת: { path, rev }   rev: כל מזהה גרסה של המקור (md5 של Drive, sha של Git, גיבוב וכו')
// פעולות: upload, download, deleteLocal, deleteRemote, merge (שניהם השתנו), mark, forget

// גיבוב מהיר ויציב למחרוזת (cyrb53). לא קריפטוגרפי: רק לזיהוי שינוי.
export function hashText(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const pad = (n) => String(n).padStart(2, '0');

// שם לעותק בהתנגשות, באותה רוח כמו בדסקטופ ("שם (גרסה מבחוץ HH-MM).md"):
// "שם (גרסה מהטלפון HH-MM).md". אם השם תפוס: מספר בסוף.
export function conflictName(path, date = new Date(), taken = () => false, label = 'גרסה מהטלפון') {
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
  const file = path.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  const base = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : '';
  const stamp = `${pad(date.getHours())}-${pad(date.getMinutes())}`;
  let name = `${dir}${base} (${label} ${stamp})${ext}`;
  for (let i = 2; taken(name); i++) name = `${dir}${base} (${label} ${stamp} ${i})${ext}`;
  return name;
}

// מה צריך לעשות לכל קובץ. הסדר לפי הנתיב, כדי שהתוצאה תהיה צפויה.
export function planSync(localList, remoteList) {
  const local = new Map(localList.map((f) => [f.path, f]));
  const remote = new Map(remoteList.map((f) => [f.path, f]));
  const paths = [...new Set([...local.keys(), ...remote.keys()])].sort();
  const plan = [];
  for (const path of paths) {
    const l = local.get(path);
    const r = remote.get(path);
    const synced = l && l.baseRev != null;
    const lAlive = l && !l.deleted;
    const lChanged = l && (l.deleted || l.hash !== l.baseHash);
    if (!r) {
      if (!l) continue;
      if (!synced) { plan.push({ op: lAlive ? 'upload' : 'forget', path }); continue; }
      // היה במקור ונמחק שם. נערך בטלפון מאז? מעלים מחדש, לא מוחקים עבודה.
      plan.push({ op: lAlive && lChanged ? 'upload' : 'deleteLocal', path });
      continue;
    }
    if (!l) { plan.push({ op: 'download', path, rev: r.rev }); continue; }
    const rChanged = !synced || r.rev !== l.baseRev;
    if (!lAlive) {
      // נמחק בטלפון. המקור לא השתנה מאז: מוחקים גם שם. השתנה: מורידים מחדש (לא מאבדים עריכה מהמחשב).
      plan.push(rChanged ? { op: 'download', path, rev: r.rev } : { op: 'deleteRemote', path });
      continue;
    }
    if (!rChanged) { if (lChanged) plan.push({ op: 'upload', path }); continue; }
    if (synced && !lChanged) { plan.push({ op: 'download', path, rev: r.rev }); continue; }
    // שניהם השתנו, או שאין סנכרון קודם: runSync משווה תוכן, ורק אם שונה שומר עותק
    plan.push({ op: 'merge', path, rev: r.rev });
  }
  return plan;
}

// ביצוע התוכנית. local ו־remote הם ממשקים, כך שאפשר לבדוק בלי IndexedDB ובלי רשת:
// local:  { list(), get(path), put(record), remove(path) }   record = { path, data, hash, baseHash, baseRev, deleted }
// remote: { list() -> [{path, rev}], read(path) -> data, write(path, data) -> rev, remove(path) }
// data: מחרוזת (מסמך) או Blob/ArrayBuffer (קובץ מצורף). hashOf(data) -> גיבוב, אותו חישוב כמו בכספת המקומית.
export async function runSync(local, remote, { hashOf = (d) => hashText(String(d)), now = () => new Date() } = {}) {
  const localList = await local.list();
  const remoteList = await remote.list();
  const plan = planSync(localList, remoteList);
  const taken = new Set([...localList.map((f) => f.path), ...remoteList.map((f) => f.path)]);
  const result = { uploaded: 0, downloaded: 0, deleted: 0, conflicts: [], errors: [] };
  const fresh = async (path, data, rev) => {
    const hash = await hashOf(data);
    await local.put({ path, data, hash, baseHash: hash, baseRev: rev, deleted: false });
  };
  for (const step of plan) {
    try {
      const rec = await local.get(step.path);
      if (step.op === 'upload') {
        const rev = await remote.write(step.path, rec.data);
        await local.put({ ...rec, baseHash: rec.hash, baseRev: rev });
        result.uploaded++;
      } else if (step.op === 'download') {
        await fresh(step.path, await remote.read(step.path), step.rev);
        result.downloaded++;
      } else if (step.op === 'deleteLocal' || step.op === 'forget') {
        await local.remove(step.path);
        if (step.op === 'deleteLocal') result.deleted++;
      } else if (step.op === 'deleteRemote') {
        await remote.remove(step.path);
        await local.remove(step.path);
        result.deleted++;
      } else if (step.op === 'merge') {
        const data = await remote.read(step.path);
        if ((await hashOf(data)) === rec.hash) { await local.put({ ...rec, baseHash: rec.hash, baseRev: step.rev }); continue; }
        // באמת שונים: הגרסה מהמקור נשארת בשם המקורי, ומה שנכתב בטלפון נשמר לידה כקובץ נפרד. שניהם בשני הצדדים.
        const copy = conflictName(step.path, now(), (n) => taken.has(n));
        taken.add(copy);
        const copyRev = await remote.write(copy, rec.data);
        await local.put({ path: copy, data: rec.data, hash: rec.hash, baseHash: rec.hash, baseRev: copyRev, deleted: false });
        await fresh(step.path, data, step.rev);
        result.conflicts.push({ path: step.path, copy });
      }
    } catch (error) {
      result.errors.push({ path: step.path, op: step.op, message: String(error?.message || error) });
    }
  }
  return result;
}
