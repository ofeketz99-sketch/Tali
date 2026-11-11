// לוגיקה משותפת לקישורי [[הערה]]: זיהוי בטקסט ופענוח לקובץ.
// משמש גם את main.js (קישורים חוזרים, שינוי שם) וגם את הממשק (לחיצה על קישור).
// כמו באובסידיאן: [[שם]] או [[תיקייה/שם]], ואפשר להוסיף #כותרת ו־|כינוי.

// [[target#heading|alias]]
const LINK_RE = /\[\[([^\[\]|#\n]+)(#[^\[\]|\n]*)?(?:\|([^\[\]\n]*))?\]\]/g;

function toSlash(p) { return String(p).replace(/\\/g, '/'); }

// נתיב יחסי לתיקיית העבודה, בלי .md ובאותיות קטנות, לצורך השוואה
function relKey(file, root) {
  let rel = toSlash(file);
  const r = toSlash(root).replace(/\/$/, '');
  if (rel.toLowerCase().startsWith(r.toLowerCase() + '/')) rel = rel.slice(r.length + 1);
  return rel.replace(/\.md$/i, '').toLowerCase();
}

function normTarget(target) {
  return toSlash(target).split('#')[0].trim().replace(/^\/+/, '').replace(/\.md$/i, '').toLowerCase();
}

// מחזיר את הנתיב המלא של הקובץ שהקישור מצביע עליו, או null אם אין כזה
function resolveLink(target, files, root) {
  const t = normTarget(target);
  if (!t) return null;
  let best = null;
  let bestLen = Infinity;
  for (const f of files) {
    const k = relKey(f, root);
    if (k === t) return f; // התאמה מדויקת לנתיב
    if (k.endsWith('/' + t) && k.length < bestLen) { best = f; bestLen = k.length; }
  }
  return best;
}

// כל הקישורים בטקסט: [{ target, heading, alias, index, length }]
function extractLinks(text) {
  const out = [];
  LINK_RE.lastIndex = 0;
  let m;
  while ((m = LINK_RE.exec(text))) {
    out.push({ target: m[1].trim(), heading: m[2] || '', alias: m[3], index: m.index, length: m[0].length });
  }
  return out;
}

// מחליף כל קישור שהפונקציה מחזירה עבורו שם חדש. מחזיר את הטקסט החדש.
function replaceLinks(text, mapTarget) {
  return text.replace(LINK_RE, (whole, target, heading, alias) => {
    const next = mapTarget(target.trim());
    if (next == null) return whole;
    return `[[${next}${heading || ''}${alias != null ? '|' + alias : ''}]]`;
  });
}

// ===== קישורים במאפייני ההערה (frontmatter) =====
// "קישור לפתקים אחרים" נשמר בראש ההערה, כמו מאפיין של אובסידיאן:
//   ---
//   links:
//     - "[[הערה א]]"
//     - "[[הערה ב]]"
//   ---
// כך אובסידיאן מזהה אותם כקישורים, והם מופיעים בקישורים החוזרים של ההערות המקושרות.
const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;

// השורות של המפתח links: בתוך המאפיינים (השורה עצמה והשורות המוזחות שאחריה)
function linksBlock(lines) {
  const start = lines.findIndex((l) => /^links\s*:/.test(l));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && (/^\s/.test(lines[end]) || lines[end] === '')) end++;
  while (end > start + 1 && lines[end - 1] === '') end--; // שורה ריקה בסוף לא שייכת לרשימה
  return { start, end };
}

function getFrontmatterLinks(text) {
  const m = FM_RE.exec(text || '');
  if (!m) return [];
  const lines = m[1].split(/\r?\n/);
  const b = linksBlock(lines);
  return b ? extractLinks(lines.slice(b.start, b.end).join('\n')).map((l) => l.target) : [];
}

// targets: הטקסט שבתוך [[ ]] לכל קישור. רשימה ריקה מוחקת את המפתח (ואת המאפיינים אם לא נשאר בהם כלום).
function setFrontmatterLinks(text, targets) {
  const block = targets.length ? ['links:', ...targets.map((t) => `  - "[[${t}]]"`)] : [];
  const m = FM_RE.exec(text || '');
  if (!m) return block.length ? `---\n${block.join('\n')}\n---\n${text || ''}` : text;
  const lines = m[1].split(/\r?\n/);
  const b = linksBlock(lines);
  if (b) lines.splice(b.start, b.end - b.start, ...block);
  else lines.push(...block);
  const body = text.slice(m[0].length);
  if (lines.every((l) => !l.trim())) return body;
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

// לתיבת המאפיינים בעורך: מפרידים את שורות links: (הן מוצגות בלוח הקישורים) ומחזירים אותן בדיוק לאותו מקום
function splitLinksLines(fm) {
  const lines = fm.split(/\r?\n/);
  const b = linksBlock(lines);
  if (!b) return { rest: fm, block: [], at: -1 };
  const block = lines.splice(b.start, b.end - b.start);
  return { rest: lines.join('\n'), block, at: b.start };
}
function mergeLinksLines(rest, block, at) {
  if (!block.length) return rest;
  const lines = rest === '' ? [] : rest.split(/\r?\n/);
  lines.splice(Math.min(Math.max(at, 0), lines.length), 0, ...block);
  return lines.join('\n');
}

module.exports = { resolveLink, extractLinks, replaceLinks, relKey, getFrontmatterLinks, setFrontmatterLinks, splitLinksLines, mergeLinksLines };
