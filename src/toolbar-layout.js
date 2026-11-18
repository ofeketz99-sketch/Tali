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

// ===== 10.4: כל כפתור בנפרד =====
// הסרגל הוא רשימת קבוצות, וכל קבוצה היא רשימת כפתורים. המשתמש יכול לפרק קבוצה, להוציא ממנה כפתורים,
// להעביר כפתור לקבוצה אחרת או לקבוצה משלו, ולהוסיף כפתורים שלא מוצגים. נשמר ב־prefs.toolbarLayout:
// { sections: [{ items: [id, ...] }], known: [id, ...] }. known: הכפתורים שהיו קיימים כשנשמר, כדי שכפתור
// חדש בגרסה הבאה יופיע ליד אחיו (אם הקבוצה שלו לא קבוצת רשות) ולא ייעלם.
// [מזהה, הקבוצה המקורית, שם בהגדרות, סמל]
export const TOOLBAR_ITEMS = [
  ['undo', 'history', 'ביטול', 'undo'], ['redo', 'history', 'חזרה', 'redo'],
  ['style', 'style', 'סגנון פסקה (טקסט רגיל / כותרת)', 'paragraph'],
  ['h1', 'headings', 'כותרת 1', 'h1'], ['h2', 'headings', 'כותרת 2', 'h2'], ['h3', 'headings', 'כותרת 3', 'h3'],
  ['bold', 'marks', 'מודגש', 'bold'], ['italic', 'marks', 'נטוי', 'italic'], ['underline', 'marks', 'קו תחתון', 'underline'], ['strike', 'marks', 'קו חוצה', 'strike'],
  ['code', 'code', 'קוד בשורה', 'code'], ['codeBlock', 'code', 'בלוק קוד', 'codeBlock'], ['clearFormat', 'code', 'ניקוי עיצוב', 'clearFormat'],
  ['textColor', 'colors', 'צבע טקסט', 'textColor'], ['highlight', 'colors', 'מרקר', 'highlight'],
  ['bullets', 'lists', 'רשימת תבליטים', 'bullets'], ['numbers', 'lists', 'רשימה ממוספרת', 'numbers'], ['tasks', 'lists', 'רשימת משימות', 'tasks'],
  ['listRtl', 'lists', 'כיוון רשימה: ימין לשמאל', 'alignRight'], ['listLtr', 'lists', 'כיוון רשימה: שמאל לימין', 'alignLeft'], ['quote', 'lists', 'ציטוט', 'quote'],
  ['alignRight', 'align', 'יישור לימין', 'alignRight'], ['alignCenter', 'align', 'מרכוז', 'alignCenter'], ['alignLeft', 'align', 'יישור לשמאל', 'alignLeft'],
  ['insertMenu', 'insert', 'תפריט "הוספה"', 'insert'],
  ['table', 'quickInsert', 'טבלה', 'table'], ['image', 'quickInsert', 'תמונה מקובץ', 'image'], ['link', 'quickInsert', 'קישור למסמך', 'link'],
  ['math', 'quickInsert', 'נוסחה', 'math'], ['symbol', 'quickInsert', 'סמל מיוחד', 'symbol'], ['taskSection', 'quickInsert', 'משימות להמשך', 'taskSection'], ['rule', 'quickInsert', 'קו מפריד', 'rule'],
  ['pageDraw', 'draw', 'שרטוט על הדף', 'pen'], ['floatBox', 'draw', 'תיבת טקסט חופשית', 'textBox'],
  ['drawing', 'drawExtra', 'ציור (נשמר כתמונה)', 'draw'], ['comment', 'drawExtra', 'הערת שוליים', 'comment'],
  ['exportPdf', 'export', 'ייצוא ל־PDF', 'exportPdf'], ['exportWord', 'export', 'ייצוא ל־Word', 'exportWord'],
  ['focus', 'view', 'מצב מיקוד', 'focus'], ['sleep', 'view', 'מצב שינה', 'sleep'], ['raw', 'view', 'תצוגת Markdown', 'markdown'],
];
export const ITEM_IDS = TOOLBAR_ITEMS.map(([id]) => id);
const itemInfo = (id) => TOOLBAR_ITEMS.find(([x]) => x === id);
export const itemGroup = (id) => itemInfo(id)?.[1] || null;
export const itemLabel = (id) => itemInfo(id)?.[2] || id;
export const itemIcon = (id) => itemInfo(id)?.[3] || 'more';
export const groupItems = (group) => TOOLBAR_ITEMS.filter(([, g]) => g === group).map(([id]) => id);

const copy = (sections) => sections.map((s) => ({ items: [...s.items] }));
const compact = (sections) => sections.filter((s) => s.items.length);

// הסרגל לפי ההגדרות הישנות (8.2–10.3: קבוצות שלמות בלבד), או ברירת המחדל
export function sectionsFromGroups(order, hidden, shown) {
  const v1 = normalizeToolbarLayout(order, hidden, shown);
  return v1.order.filter((g) => !v1.hidden.includes(g)).map((g) => ({ items: groupItems(g) }));
}

// סרגל תקין מכל ערך שמור: מזהים מוכרים בלבד, כל כפתור פעם אחת, בלי קבוצות ריקות.
// בלי toolbarLayout שמור: הסרגל מההגדרות הישנות, כך שמי שסידר קבוצות ב־8.2 רואה אותו סרגל.
export function normalizeToolbar(prefs = {}) {
  const saved = prefs?.toolbarLayout;
  if (!saved || !Array.isArray(saved.sections)) return sectionsFromGroups(prefs?.toolbarOrder, prefs?.toolbarHidden, prefs?.toolbarShown);
  const seen = new Set();
  const sections = saved.sections.map((s) => ({
    items: (Array.isArray(s?.items) ? s.items : []).filter((id) => {
      if (!ITEM_IDS.includes(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  }));
  const known = new Set(Array.isArray(saved.known) ? saved.known : ITEM_IDS);
  for (const id of ITEM_IDS) {
    if (seen.has(id) || known.has(id) || isOptionalGroup(itemGroup(id))) continue;
    const home = sections.find((s) => s.items.some((x) => itemGroup(x) === itemGroup(id)));
    if (home) home.items.push(id); else sections.push({ items: [id] });
    seen.add(id);
  }
  return compact(sections);
}

// מה ששומרים בהגדרות אחרי עריכה
export const toolbarLayoutValue = (sections) => ({ sections: compact(copy(sections)), known: [...ITEM_IDS] });
// הכפתורים שלא בסרגל (לרשימת "להוספה" בהגדרות), בסדר ברירת המחדל
export function unusedItems(sections) {
  const used = new Set(sections.flatMap((s) => s.items));
  return ITEM_IDS.filter((id) => !used.has(id));
}
// העברת כפתור למקום index בקבוצה section, או לקבוצה חדשה במקום section כש־asNew
// (section === sections.length: קבוצה חדשה בסוף). כפתור שלא היה בסרגל פשוט נכנס.
export function moveItem(sections, id, section, index = Infinity, { asNew = false } = {}) {
  const list = sections.map((s) => ({ items: s.items.filter((x) => x !== id) }));
  if (asNew || !list[section]) list.splice(Math.max(0, Math.min(section, list.length)), 0, { items: [id] });
  else {
    const items = list[section].items;
    // אותה קבוצה: המקום נמדד לפני ההוצאה
    const was = sections[section]?.items.indexOf(id) ?? -1;
    let at = Math.max(0, Math.min(index, items.length));
    if (was >= 0 && was < index) at = Math.max(0, Math.min(index - 1, items.length));
    items.splice(at, 0, id);
  }
  return compact(list);
}
export const removeItem = (sections, id) => compact(sections.map((s) => ({ items: s.items.filter((x) => x !== id) })));
// פירוק קבוצה: כל כפתור בקבוצה משלו, באותו מקום
export const splitSection = (sections, i) => sections.flatMap((s, j) => (j === i ? s.items.map((id) => ({ items: [id] })) : [{ items: [...s.items] }]));
// איחוד קבוצה עם הקבוצה שאחריה
export function mergeWithNext(sections, i) {
  const out = copy(sections);
  if (i < 0 || i >= out.length - 1) return out;
  out[i].items.push(...out[i + 1].items);
  out.splice(i + 1, 1);
  return out;
}
export function moveSection(sections, i, delta) {
  const out = copy(sections);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
export const removeSection = (sections, i) => copy(sections).filter((_, j) => j !== i);
// 10.8 (גרירת קבוצה שלמה): העברת קבוצה from למקום to ברשימה שאחרי ההוצאה שלה
export function moveSectionTo(sections, from, to) {
  const out = copy(sections);
  if (from < 0 || from >= out.length) return out;
  const [sec] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, sec);
  return out;
}
// 10.8: קבוצה from שנגררה ושוחררה על קבוצה into: הכפתורים שלה נכנסים לסוף into
export function mergeSectionInto(sections, from, into) {
  const out = copy(sections);
  if (from === into || !out[from] || !out[into]) return out;
  out[into].items.push(...out[from].items);
  out.splice(from, 1);
  return out;
}
