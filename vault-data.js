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

// משימות: "- [ ] טקסט" / "- [x] טקסט" (גם * ו־+, וגם ממוספרות "1. [ ]"), מחוץ לגושי קוד.
function extractTasks(text) {
  const masked = maskNonText(text || '');
  const lines = masked.split('\n').map((l) => l.replace(/\r$/, ''));
  const orig = (text || '').split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const m = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s?(.*)$/.exec(line);
    if (m) out.push({ line: i, done: m[2] !== ' ', text: (orig[i] || '').replace(/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s?/, '').replace(/\r$/, '').trim(), depth: m[1].length });
  });
  return out;
}

// כל המטרות של קישורים בהערה (גוף + מאפייני links:), בלי כפילויות
function extractTargets(text) {
  const masked = maskNonText(text || '');
  const body = extractLinks(masked).map((l) => l.target);
  return [...new Set([...body, ...getFrontmatterLinks(text || '')])];
}

module.exports = { maskNonText, extractTags, extractTasks, extractTargets, tagsFromFrontmatter };
