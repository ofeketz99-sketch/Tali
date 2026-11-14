// ארכיון: מסמכים ששומרים, אבל לא צריכים בשליפה מהירה. זו תיקייה רגילה בשם "ארכיון" בראש הכספת,
// ולכן היא עוברת עם הכספת ונראית גם באובסידיאן. מסמך שעובר לארכיון שומר בתוכה את נתיב התיקיות שלו
// (תיקייה/מסמך ← ארכיון/תיקייה/מסמך), כך ש"החזרה מהארכיון" מחזירה אותו בדיוק למקום. ההעברה עצמה היא
// העברה רגילה (move ב־main.js), והקישורים אליו מתעדכנים.
// מה שבארכיון לא מופיע במעבר המהיר (Ctrl+O), באחרונים, במשימות, במסך הבית ובקפיצה בין תיקיות,
// אבל הקישורים אליו עובדים, החיפוש בתוכן מוצא אותו, והוא בעץ (בסוף, מכווץ).
// כל הנתיבים כאן יחסיים לכספת, עם "/" (כמו rel באינדקס).

export const ARCHIVE_DIR = 'ארכיון';

const parts = (rel) => String(rel || '').replace(/\\/g, '/').split('/').filter(Boolean);

// הנתיב (מסמך או תיקייה) הוא הארכיון עצמו או בתוכו
export const isArchived = (rel) => parts(rel)[0] === ARCHIVE_DIR;
// התיקייה של הארכיון עצמה (שאותה לא מעבירים לארכיון)
export const isArchiveRoot = (rel) => { const p = parts(rel); return p.length === 1 && p[0] === ARCHIVE_DIR; };

// התיקייה שאליה מעבירים כדי לשלוח לארכיון: ארכיון + התיקיות שמעל הפריט
export function archiveDirFor(rel) {
  const p = parts(rel);
  if (!p.length || isArchived(rel)) return null;
  return [ARCHIVE_DIR, ...p.slice(0, -1)];
}
// התיקייה שאליה מחזירים מהארכיון: התיקיות שמעל הפריט, בלי "ארכיון" ([] = ראש הכספת)
export function restoreDirFor(rel) {
  const p = parts(rel);
  if (p.length < 2 || p[0] !== ARCHIVE_DIR) return null;
  return p.slice(1, -1);
}

// אינדקס הכספת בלי מה שבארכיון, לתצוגות של שליפה מהירה (מסך הבית, משימות, אחרונים)
export function withoutArchived(index) {
  if (!index?.notes) return index;
  return { ...index, notes: index.notes.filter((n) => !isArchived(n.rel)) };
}
