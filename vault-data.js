// ניתוח הערה בודדת לאינדקס של הכספת: תגיות, משימות וקישורים.
// משותף ל־main.js (בונה את האינדקס) ולממשק (סימון תגיות בעורך). פונקציות טהורות, עם בדיקות.
const { extractLinks, getFrontmatterLinks } = require('./links');

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

module.exports = { maskNonText, extractTags, extractTasks, extractTargets, tagsFromFrontmatter, FOLLOW_UP, FLAGS, getFlag, setFlag };
