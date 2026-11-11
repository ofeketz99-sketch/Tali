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

module.exports = { resolveLink, extractLinks, replaceLinks, relKey };
