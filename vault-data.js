// ניתוח הערה בודדת לאינדקס של הכספת: תגיות, משימות וקישורים.
// משותף ל־main.js (בונה את האינדקס) ולממשק (סימון תגיות בעורך). פונקציות טהורות, עם בדיקות.
const { extractLinks, getFrontmatterLinks, setFrontmatterLinks } = require('./links');

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;

// מחליף ברווחים (באותו אורך, כדי שהמיקומים יישארו נכונים) את מה שאינו טקסט רגיל:
// המאפיינים בראש הקובץ, גושי קוד, קוד בשורה, הערות HTML ו־%%הערות%%.
function maskNonText(text) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  let out = text.replace(FM_RE, blank);
  out = out.replace(/^(\s*)(```|~~~)[^\n]*\n[\s\S]*?^\s*\2[^\n]*$/gm, blank);
  out = out.replace(/<!--[\s\S]*?-->/g, blank);
  out = out.replace(/%%[\s\S]*?%%/g, blank);
  out = out.replace(/`[^`\n]+`/g, blank);
  return out;
}

// #תג כמו באובסידיאן: אחרי תחילת שורה או רווח, אותיות/ספרות/_/-//, ולפחות תו אחד שאינו ספרה.
// "# כותרת" (עם רווח) אינו תג, וגם לא #123 או #ffffff בתוך כתובת.
const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;

function tagsFromFrontmatter(text) {
  const m = FM_RE.exec(text || '');
  if (!m) return [];
  const lines = m[1].split(/\r?\n/);
  const i = lines.findIndex((l) => /^tags\s*:/.test(l));
  if (i < 0) return [];
  const inline = lines[i].replace(/^tags\s*:\s*/, '').trim();
  const out = [];
  if (inline) {
    out.push(...inline.replace(/^\[|\]$/g, '').split(/[,\s]+/));
  } else {
    for (let k = i + 1; k < lines.length && /^\s+-\s*/.test(lines[k]); k++) out.push(lines[k].replace(/^\s+-\s*/, ''));
  }
  return out.map((t) => t.replace(/^["']|["']$/g, '').replace(/^#/, '').trim()).filter(Boolean);
}

// [{ tag, index }] בגוף ההערה (המיקום של ה־#), ועוד התגיות מהמאפיינים (index: -1)
function extractTags(text) {
  const masked = maskNonText(text || '');
  const out = [];
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(masked))) {
    const tag = m[2].replace(/[/\-]+$/, '');
    if (tag) out.push({ tag, index: m.index + m[1].length });
  }
  for (const tag of tagsFromFrontmatter(text)) out.push({ tag, index: -1 });
  return out;
}

// הסעיף של המשימות להמשך: כותרת בשם הזה (בכל רמה), עד הכותרת הבאה באותה רמה או גבוהה ממנה.
// תיבות סימון בתוכו הן "משימות להמשך" (followUp). כל השאר הן תיבות סימון רגילות של המסמך.
const FOLLOW_UP = 'משימות להמשך';

// משימות: "- [ ] טקסט" / "- [x] טקסט" (גם * ו־+, וגם ממוספרות "1. [ ]"), מחוץ לגושי קוד.
function extractTasks(text) {
  const masked = maskNonText(text || '');
  const lines = masked.split('\n').map((l) => l.replace(/\r$/, ''));
  const orig = (text || '').split('\n');
  const out = [];
  let section = 0; // רמת הכותרת של סעיף המשימות להמשך, או 0 מחוץ לו
  lines.forEach((line, i) => {
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const level = h[1].length;
      if (h[2].trim() === FOLLOW_UP) section = level;
      else if (section && level <= section) section = 0;
      return;
    }
    const m = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s?(.*)$/.exec(line);
    if (m) out.push({ line: i, done: m[2] !== ' ', text: (orig[i] || '').replace(/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s?/, '').replace(/\r$/, '').trim(), depth: m[1].length, followUp: section > 0 });
  });
  return out;
}

// כל המטרות של קישורים בהערה (גוף + מאפייני links:), בלי כפילויות
function extractTargets(text) {
  const masked = maskNonText(text || '');
  const body = extractLinks(masked).map((l) => l.target);
  return [...new Set([...body, ...getFrontmatterLinks(text || '')])];
}

// "פתק קישור": הערה בלי תוכן משלה, רק רשימת קישורים ("- [[א]]") שמחברת רעיונית בין הערות.
// מותר: מאפיינים, כותרות, הערות HTML/%%...%% ושורות ריקות. צריך לפחות קישור אחד (בגוף או ב־links: במאפיינים).
const HUB_LINE_RE = /^\s*(?:[-*+]|\d+[.)])\s+\[\[[^[\]\n]+\]\]\s*$/;
function isLinkHub(text) {
  const src = text || '';
  const body = src.replace(FM_RE, '').replace(/<!--[\s\S]*?-->/g, '').replace(/%%[\s\S]*?%%/g, '');
  let links = 0;
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || /^#{1,6}\s/.test(line)) continue;
    if (!HUB_LINE_RE.test(line)) return false;
    links++;
  }
  return links > 0 || getFrontmatterLinks(src).length > 0;
}

// תאריך היצירה כפי שכתוב בהערה עצמה, כי זמן היצירה של הקובץ מתאפס בכל העתקה או סנכרון.
// 1) מאפיין created / date / תאריך (YYYY-MM-DD, או DD-MM-YY[YY]).
// 2) שורה שכולה תאריך, בתחילת ההערה (8 השורות הראשונות של הגוף): "06-04-25" = 6 באפריל 2025.
//    הפורמט יום־חודש־שנה: בכספת של המשתמש היום לפעמים גדול מ־12 והחודש אף פעם לא.
// מחזיר "YYYY-MM-DD", או null.
function parseDate(s) {
  const v = String(s || '').trim().replace(/^["']|["']$/g, '');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(v);
  let y, mo, d;
  if (m) [, y, mo, d] = m.map(Number);
  else if ((m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})$/.exec(v))) {
    [, d, mo, y] = m.map(Number);
    if (y < 100) y += 2000;
  } else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null; // 31-02 וכו'
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function getCreatedDate(text) {
  const src = text || '';
  const fm = FM_RE.exec(src);
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const m = /^(created|date|תאריך)\s*:\s*(.+)$/i.exec(line);
      if (m && parseDate(m[2])) return parseDate(m[2]);
    }
  }
  const lines = src.replace(FM_RE, '').split('\n').slice(0, 8);
  for (const line of lines) {
    const m = DATE_LINE.exec(line.replace(/\r$/, ''));
    const d = m && parseDate(m[1]);
    if (d) return d;
  }
  return null;
}
// שורה שכולה תאריך (אולי כפריט רשימה, אולי עם שעה): "06-04-25", "- 2025-03-28", "2025-03-27 19:47",
// וגם תאריך ושעה צמודים בטעות ("11-07-2612:39"). קבוצות: 1 תאריך, 2–3 שעה.
const DATE_LINE = /^\s*(?:[-*+]\s+)?(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[-./]\d{1,2}[-./](?:\d{4}|\d{2}))(?:\s*T?\s*(\d{1,2}):(\d{2}))?\s*$/;

// ----- דגלים: "flag: red" במאפיינים, כך שהדגל עובר עם הקובץ (שינוי שם, העברה, סנכרון) -----
const FLAGS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];

function getFlag(text) {
  const m = FM_RE.exec(text || '');
  if (!m) return null;
  const line = m[1].split(/\r?\n/).find((l) => /^flag\s*:/.test(l));
  if (!line) return null;
  const v = line.replace(/^flag\s*:\s*/, '').trim().replace(/^["']|["']$/g, '').toLowerCase();
  return FLAGS.includes(v) ? v : null;
}

// ----- תאריך יצירה אוטומטי למסמך חדש -----
// created: YYYY-MM-DDTHH:mm (שעון מקומי) במאפיינים, כי זמן היצירה של הקובץ מתאפס בהעתקה ובסנכרון.
// אם כבר יש created (למשל מתבנית), לא נוגעים.
function withCreated(text, now = new Date()) {
  const src = text || '';
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}:${p(now.getMinutes())}`;
  const eol = /\r\n/.test(src) ? '\r\n' : '\n';
  const m = FM_RE.exec(src);
  if (!m) return `---${eol}created: ${stamp}${eol}---${eol}${src}`;
  if (m[1].split(/\r?\n/).some((l) => /^created\s*:/.test(l))) return src;
  return `---${eol}created: ${stamp}${eol}${m[1]}${eol}---${m[2] || eol}${src.slice(m[0].length)}`;
}

// ----- כותרת ידנית ← מאפיינים -----
// הכותרת שהמשתמש כותב בראש ההערות (מהתבנית "פתקים רעיוניים"):
//   - קישורים: [[א]], [[ב]]
//   - ביבליוגרפיה: [ויקיפדיה](https://...)
//   - תיוגים: #כימיה
//   06-04-25          (ואולי "- 12:39")
//   ----
// הופכת למאפיינים links / source / tags / created. בזהירות: ממירים רק אם כל שורה עד הקו המפריד מוכרת.
// אחרת מחזירים { skip: סיבה } והקובץ לא משתנה.
const HEADER_FIELD = /^\s*(?:[-*+]\s+)*(קישורים|ביבליוגרפיה|תיוגים)\s*:\s*(.*?)\s*$/;
const HEADER_TIME = /^\s*(?:[-*+]\s+)?(\d{1,2}):(\d{2})\s*$/;
const HEADER_RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const yamlString = (s) => (/^[\p{L}\p{N} _.,()'-]+$/u.test(s) && !/^[\d.-]+$/.test(s) ? s : JSON.stringify(s));

function headerToProps(text) {
  const src = text || '';
  const eol = /\r\n/.test(src) ? '\r\n' : '\n';
  const fm = FM_RE.exec(src);
  const head = fm ? src.slice(0, fm[0].length) : '';
  const lines = src.slice(head.length).split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length || !HEADER_FIELD.test(lines[i])) return { skip: 'אין כותרת בראש המסמך' };
  const links = [], tags = [];
  let source = '', date = null, time = null, end = -1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    let m;
    if (HEADER_RULE.test(line)) { end = i + 1; break; }
    if ((m = HEADER_FIELD.exec(line))) {
      const v = m[2];
      if (m[1] === 'קישורים') for (const l of extractLinks(v)) { if (l.target && !links.includes(l.target)) links.push(l.target); }
      else if (m[1] === 'ביבליוגרפיה') { if (v && !/^\[\]\(\)$/.test(v)) source = source ? `${source}, ${v}` : v; }
      else for (const t of v.split(/[\s,]+/)) { const tag = t.replace(/^#/, ''); if (tag && !tags.includes(tag)) tags.push(tag); }
    } else if ((m = DATE_LINE.exec(line)) && parseDate(m[1])) {
      if (!date) { date = parseDate(m[1]); if (m[2] && !time) time = `${m[2].padStart(2, '0')}:${m[3]}`; }
    }
    else if ((m = HEADER_TIME.exec(line)) && !time) time = `${m[1].padStart(2, '0')}:${m[2]}`;
    else {
      // שורה לא מוכרת. אם אחריה (קרוב) יש קו מפריד, היא חלק מהכותרת ואי אפשר להמיר בבטחה.
      if (lines.slice(i + 1, i + 8).some((l) => HEADER_RULE.test(l))) return { skip: `שורה לא מוכרת בכותרת: "${line.trim().slice(0, 40)}"` };
      end = i;
      break;
    }
  }
  if (end < 0) end = lines.length;

  // מיזוג עם המאפיינים הקיימים: קישורים מצטרפים, ושדה שכבר קיים לא נדרס
  let fmText = head;
  const existing = fm ? fm[1].split(/\r?\n/) : [];
  const has = (key) => existing.some((l) => new RegExp(`^${key}\\s*:`).test(l));
  const extra = [];
  if (source && !has('source')) extra.push(`source: ${yamlString(source)}`);
  if (tags.length && !has('tags')) extra.push('tags:', ...tags.map((t) => `  - ${yamlString(t)}`));
  if (date && !has('created')) extra.push(`created: ${date}${time ? `T${time}` : ''}`);
  if (links.length) {
    const merged = [...new Set([...getFrontmatterLinks(fmText), ...links])];
    fmText = setFrontmatterLinks(fmText || '', merged);
  }
  if (extra.length) {
    const m2 = FM_RE.exec(fmText);
    fmText = m2 ? `---\n${m2[1]}\n${extra.join('\n')}\n---\n` : `---\n${extra.join('\n')}\n---\n`;
  }
  fmText = fmText.replace(/\r?\n/g, eol);
  let rest = lines.slice(end);
  while (rest.length && !rest[0].trim()) rest.shift();
  return {
    text: fmText + rest.join(eol),
    props: { links, source, tags, created: date ? `${date}${time ? `T${time}` : ''}` : null },
    removed: lines.slice(0, end).join(eol).trim(),
  };
}

// ----- תבניות, כמו בתוסף Templates של אובסידיאן -----
// formatDate: חלק מהפורמט של moment.js (מה שאובסידיאן משתמש בו): YYYY YY MM M DD D HH H mm ss, ו־[טקסט] מילולי.
function formatDate(d, fmt) {
  const p = (n) => String(n).padStart(2, '0');
  const map = { YYYY: d.getFullYear(), YY: p(d.getFullYear() % 100), MM: p(d.getMonth() + 1), M: d.getMonth() + 1, DD: p(d.getDate()), D: d.getDate(), HH: p(d.getHours()), H: d.getHours(), mm: p(d.getMinutes()), ss: p(d.getSeconds()) };
  return String(fmt).replace(/\[([^\]]*)\]|YYYY|YY|MM|M|DD|D|HH|H|mm|ss/g, (t, lit) => (lit !== undefined ? lit : String(map[t])));
}
// {{title}}, {{date}}, {{time}}, {{date:FORMAT}}, {{time:FORMAT}}. ברירות המחדל של הפורמט מ־.obsidian/templates.json
function fillTemplate(text, { title = '', now = new Date(), dateFormat = 'YYYY-MM-DD', timeFormat = 'HH:mm' } = {}) {
  return String(text || '').replace(/\{\{\s*(title|date|time)\s*(?::([^}]*))?\}\}/gi, (_m, key, fmt) => {
    const k = key.toLowerCase();
    if (k === 'title') return title;
    return formatDate(now, fmt?.trim() || (k === 'date' ? dateFormat : timeFormat));
  });
}

// color: אחד מ־FLAGS, או null להסרה. שאר המאפיינים נשארים כמו שהם. אם הדגל היה המאפיין היחיד, גם --- יורדות.
function setFlag(text, color) {
  const src = text || '';
  const eol = /\r\n/.test(src) ? '\r\n' : '\n';
  const m = FM_RE.exec(src);
  if (!m) return color ? `---${eol}flag: ${color}${eol}---${eol}${src}` : src;
  const lines = m[1].split(/\r?\n/);
  const i = lines.findIndex((l) => /^flag\s*:/.test(l));
  if (color) { if (i >= 0) lines[i] = `flag: ${color}`; else lines.push(`flag: ${color}`); }
  else if (i >= 0) lines.splice(i, 1);
  else return src;
  const rest = src.slice(m[0].length);
  if (!lines.some((l) => l.trim())) return rest;
  return `---${eol}${lines.join(eol)}${eol}---${m[2] || eol}${rest}`;
}

module.exports = { maskNonText, extractTags, extractTasks, extractTargets, tagsFromFrontmatter, FOLLOW_UP, FLAGS, getFlag, setFlag, isLinkHub, getCreatedDate, formatDate, fillTemplate, headerToProps, withCreated };
