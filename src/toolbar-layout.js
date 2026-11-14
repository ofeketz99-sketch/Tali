// 8.2: סדר הקבוצות בסרגל הכלים העליון ואילו מהן מוצגות (הגדרות ← "סרגל הכלים").
// פונקציות טהורות (עם בדיקות): toolbar.js מסדר לפיהן, settings.js עורך אותן.
// נשמר ב־prefs.toolbarOrder (רשימת מזהים) וב־prefs.toolbarHidden (מזהים מוסתרים).
// 8.3: קבוצות רשות (optional) מוסתרות כברירת מחדל, ומוצגות רק כשהמשתמש סימן אותן (prefs.toolbarShown).
// כך מי שלא נגע בהגדרות רואה את אותו סרגל כמו קודם.

export const TOOLBAR_GROUPS = [
  ['history', 'ביטול וחזרה'],
  ['style', 'סגנון פסקה'],
  ['headings', 'כותרות 1, 2, 3 בלחיצה אחת', true],
  ['marks', 'מודגש, נטוי, קו תחתון, קו חוצה'],
  ['code', 'קוד בשורה, בלוק קוד וניקוי עיצוב', true],
  ['colors', 'צבע טקסט ומרקר'],
  ['lists', 'רשימות, כיוון וציטוט'],
  ['align', 'יישור'],
  ['insert', 'תפריט "הוספה"'],
  ['quickInsert', 'הוספה מהירה: טבלה, תמונה, קישור, נוסחה, קו מפריד', true],
  ['draw', 'שרטוט ותיבת טקסט על הדף'],
  ['drawExtra', 'ציור כתמונה והערת שוליים', true],
  ['export', 'ייצוא ל־PDF ול־Word', true],
  ['view', 'מצב מיקוד, שינה ו־Markdown'],
];
export const TOOLBAR_IDS = TOOLBAR_GROUPS.map(([id]) => id);
export const OPTIONAL_IDS = TOOLBAR_GROUPS.filter((g) => g[2]).map(([id]) => id);
export const toolbarLabel = (id) => (TOOLBAR_GROUPS.find(([g]) => g === id) || [])[1] || id;
export const isOptionalGroup = (id) => OPTIONAL_IDS.includes(id);

// סדר תקין: מזהים מוכרים בלבד, בלי כפילויות, וכל קבוצה שחסרה (למשל קבוצה חדשה בגרסה הבאה) נכנסת
// במקום שלה בסדר ברירת המחדל, אחרי הקבוצה שקודמת לה שם. ההסתרות: רק מזהים מוכרים.
// קבוצת רשות מוסתרת, אלא אם היא ב־shown (ואז היא מוצגת גם אם היא במקרה גם ב־hidden).
export function normalizeToolbarLayout(order, hidden, shown) {
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
  const on = new Set((Array.isArray(shown) ? shown : []).filter((id) => OPTIONAL_IDS.includes(id)));
  const hide = [...new Set((Array.isArray(hidden) ? hidden : [])
    .filter((id) => TOOLBAR_IDS.includes(id) && !OPTIONAL_IDS.includes(id)))];
  for (const id of OPTIONAL_IDS) if (!on.has(id)) hide.push(id);
  return { order: out, hidden: hide, shown: OPTIONAL_IDS.filter((id) => on.has(id)) };
}

// סימון/ביטול של קבוצה בהגדרות. מחזיר את שני הערכים לשמירה: toolbarHidden ו־toolbarShown.
export function setToolbarGroupVisible(hidden, shown, id, visible) {
  const h = (Array.isArray(hidden) ? hidden : []).filter((x) => x !== id);
  const s = (Array.isArray(shown) ? shown : []).filter((x) => x !== id);
  if (isOptionalGroup(id)) { if (visible) s.push(id); }
  else if (!visible) h.push(id);
  return { hidden: h, shown: s };
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
