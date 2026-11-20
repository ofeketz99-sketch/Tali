// 11.3: מיזוג מסמך לתוך מסמך אחר. פונקציות טהורות (עם בדיקות); הקריאה, הכתיבה וההעברה לסל ב־main.js.
// התוכן של המסמך הממוזג נכנס בסוף היעד תחת "## <שם>", והקישורים אליו מכל הכספת הופכים ל־[[יעד#שם]]
// (או [[יעד#כותרת]] כשהקישור כבר הצביע לכותרת), כך שהם ממשיכים להוביל לאותו תוכן.
const { getFrontmatterLinks, setFrontmatterLinks } = require('./links');

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;
// אותו סיום כמו ב־src/overlay-data.js (שכבת הדף בסוף הקובץ)
const OVERLAY_RE = /(?:\r?\n){2}<!-- TALI-OVERLAY:v1:([^\r\n]*?) -->[ \t]*(?:\r?\n)?$/;
// אותו תחביר כמו LINK_RE ב־links.js, כולל ![[...]] (ה־! נשאר מחוץ להתאמה)
const LINK_RE = /\[\[([^\[\]|#\n]+)(#[^\[\]|\n]*)?(?:\|([^\[\]\n]*))?\]\]/g;
// מאפיינים שלא צריך לדווח עליהם כשהם לא עוברים: links מתמזג, created שייך למסמך הישן
const QUIET_KEYS = new Set(['links', 'created']);

function splitNote(text) {
  let rest = String(text || '');
  const fm = FM_RE.exec(rest);
  const frontmatter = fm ? fm[1] : null;
  if (fm) rest = rest.slice(fm[0].length);
  const ov = OVERLAY_RE.exec(rest);
  const overlay = ov ? ov[0] : '';
  if (ov) rest = rest.slice(0, ov.index);
  return { frontmatter, body: rest, overlay };
}

// שמות המפתחות במאפיינים (רק שורות בלי הזחה)
function propKeys(frontmatter) {
  if (frontmatter == null) return [];
  return frontmatter.split(/\r?\n/).map((l) => /^([^\s#:][^:]*):/.exec(l)?.[1].trim()).filter(Boolean);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// כותרות המסמך הממוזג יורדות רמה אחת (## ← ###), כדי שיהיו תחת "## <שם>". לא בתוך בלוק קוד, ו־###### נשאר.
function demoteHeadings(body) {
  let fence = null;
  return body.split(/(\r?\n)/).map((line) => {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return line;
    }
    if (fence) return line;
    return line.replace(/^(\s{0,3})(#{1,5})(?=[ \t]|$)/, '$1#$2');
  }).join('');
}

// destText, srcText: התוכן המלא של שני הקבצים. srcName: שם המסמך הממוזג (בלי .md).
// מחזיר { text, droppedProps, hadOverlay }. המאפיינים והשכבה של היעד נשמרים; links של שניהם מתאחדים.
// isSelf(target): קישור "קשורים" שמוביל לאחד משני המסמכים (אחרי המיזוג הוא קישור של המסמך לעצמו) לא נשאר.
function mergeNoteText(destText, srcText, srcName, isSelf = () => false) {
  const eol = /\r\n/.test(destText) ? '\r\n' : '\n';
  const d = splitNote(destText);
  const s = splitNote(srcText);
  // כותרת ראשית זהה לשם המסמך הממוזג מיותרת: היא הופכת לכותרת הסעיף
  let srcBody = s.body.replace(/^\s+/, '');
  srcBody = srcBody.replace(new RegExp(`^#[ \\t]+${escapeRe(srcName)}[ \\t]*#*[ \\t]*(\\r?\\n|$)`), '');
  srcBody = demoteHeadings(srcBody.replace(/^\s+/, '').replace(/\s+$/, '')).replace(/\r?\n/g, eol);
  const section = `## ${srcName}` + (srcBody ? eol + eol + srcBody : '');
  const destBody = d.body.replace(/\s+$/, '');
  const body = (destBody ? destBody + eol + eol : '') + section;
  let text = (d.frontmatter != null ? `---${eol}${d.frontmatter}${eol}---${eol}` : '') + body;
  // קישורי "קשורים" של המסמך הממוזג עוברים ליעד (בלי כפילויות ובלי קישור של היעד לעצמו)
  const allDest = getFrontmatterLinks(destText);
  const destLinks = allDest.filter((t) => !isSelf(t));
  const extra = getFrontmatterLinks(srcText).filter((t) => !isSelf(t) && !destLinks.some((x) => x.toLowerCase() === t.toLowerCase()));
  if (extra.length || destLinks.length !== allDest.length) text = setFrontmatterLinks(text, [...destLinks, ...extra]);
  text += d.overlay || eol;
  return {
    text,
    droppedProps: propKeys(s.frontmatter).filter((k) => !QUIET_KEYS.has(k)),
    hadOverlay: !!s.overlay,
  };
}

// קישורים למסמך הממוזג (isSource(target) מחליט, לפי הפענוח שלפני המיזוג) ← לסעיף שלו ביעד.
// [[ישן]] ← [[יעד#ישן]], [[ישן#כותרת]] ← [[יעד#כותרת]], הכינוי נשמר, וכך גם ![[...]].
function retargetMerged(text, isSource, destTarget, srcName) {
  return String(text).replace(LINK_RE, (whole, target, heading, alias) => {
    if (!isSource(target.trim())) return whole;
    const h = heading && heading.length > 1 ? heading : `#${srcName}`;
    return `[[${destTarget}${h}${alias != null ? '|' + alias : ''}]]`;
  });
}

module.exports = { splitNote, mergeNoteText, retargetMerged, propKeys, demoteHeadings };
