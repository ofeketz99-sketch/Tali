// 8.2: סדר הקבוצות בסרגל הכלים העליון ואילו מהן מוצגות (הגדרות ← "סרגל הכלים").
// פונקציות טהורות (עם בדיקות): toolbar.js מסדר לפיהן, settings.js עורך אותן.
// נשמר ב־prefs.toolbarOrder (רשימת מזהים) וב־prefs.toolbarHidden (מזהים מוסתרים).

export const TOOLBAR_GROUPS = [
  ['history', 'ביטול וחזרה'],
  ['style', 'סגנון פסקה'],
  ['marks', 'מודגש, נטוי, קו תחתון, קו חוצה'],
  ['colors', 'צבע טקסט ומרקר'],
  ['lists', 'רשימות, כיוון וציטוט'],
  ['align', 'יישור'],
  ['insert', 'תפריט "הוספה"'],
  ['draw', 'שרטוט ותיבת טקסט על הדף'],
  ['view', 'מצב מיקוד, שינה ו־Markdown'],
];
export const TOOLBAR_IDS = TOOLBAR_GROUPS.map(([id]) => id);
export const toolbarLabel = (id) => (TOOLBAR_GROUPS.find(([g]) => g === id) || [])[1] || id;

// סדר תקין: מזהים מוכרים בלבד, בלי כפילויות, וכל קבוצה שחסרה (למשל קבוצה חדשה בגרסה הבאה) נכנסת
// במקום שלה בסדר ברירת המחדל, אחרי הקבוצה שקודמת לה שם. ההסתרות: רק מזהים מוכרים.
export function normalizeToolbarLayout(order, hidden) {
  const seen = new Set();
  const out = [];
  for (const id of Array.isArray(order) ? order : []) {
    if (TOOLBAR_IDS.includes(id) && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  TOOLBAR_IDS.forEach((id, i) => {
    if (seen.has(id)) return;
    const prev = TOOLBAR_IDS.slice(0, i).reverse().find((p) => out.includes(p));
    out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, id);
    seen.add(id);
  });
  const hide = [...new Set((Array.isArray(hidden) ? hidden : []).filter((id) => TOOLBAR_IDS.includes(id)))];
  return { order: out, hidden: hide };
}

// הזזת קבוצה מקום אחד (delta -1 למעלה / +1 למטה ברשימה). מחזיר סדר חדש.
export function moveToolbarGroup(order, id, delta) {
  const list = [...order];
  const i = list.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return list;
}
