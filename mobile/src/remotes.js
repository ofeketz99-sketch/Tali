// TALI Mobile: "המקור" שמסנכרנים מולו. כל מתאם מממש את הממשק של runSync (sync-core.js):
//   { name, list() -> [{path, rev}], read(path) -> data, write(path, data) -> rev, remove(path) }
// עוד לא נבחר מקור קבוע (ראו "החלטות פתוחות" ב־mobile/README.md). עד אז אין מתאם מחובר,
// והאפליקציה עובדת מקומית בלבד, עם ייבוא קבצים ושיתוף מסמך.
let active = null;

export function setRemote(adapter) { active = adapter || null; }
export async function connectedRemote() { return active; }
export async function remoteLabel() { return active?.name || null; }

// מתאם בזיכרון: לבדיקות בדפדפן ולהדגמה של הסנכרון וההתנגשויות (לא נשמר בין הפעלות)
export function memoryRemote(initial = {}, name = 'מקור לבדיקה') {
  const files = new Map(Object.entries(initial));
  let n = 0;
  const revs = new Map([...files.keys()].map((p) => [p, `r${++n}`]));
  return {
    name, files,
    list: async () => [...files.keys()].map((path) => ({ path, rev: revs.get(path) })),
    read: async (p) => files.get(p),
    write: async (p, d) => { files.set(p, d); revs.set(p, `r${++n}`); return revs.get(p); },
    remove: async (p) => { files.delete(p); revs.delete(p); },
    // "המחשב ערך": משנה קובץ במקור, כאילו מבחוץ
    touch(p, d) { files.set(p, d); revs.set(p, `r${++n}`); },
  };
}
