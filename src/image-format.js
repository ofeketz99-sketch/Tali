// 11.6: עיצוב תמונה כמו ב"עיצוב תמונה" של וורד: פריסה מול הטקסט, גודל מדויק (עם או בלי נעילת יחס),
// חיתוך, סיבוב והיפוך, וסגנון (מסגרת, צל, פינות מעוגלות). פונקציות טהורות, בלי DOM ובלי import (עם בדיקות).
//
// איך זה נשמר (אובסידיאן מתעלם ממה שהוא לא מכיר, והתמונה המקורית לא משתנה):
// - ![[name.png|300|center|rot-90|flip-h|crop-10-0-5-0|border]]: הגודל בשדה הראשון אחרי השם (300, או 300x200
//   כשהיחס לא נעול, כמו באובסידיאן), ואחריו מילים שרק Tali מכירה. מילה לא מוכרת נשמרת כמו שהיא.
// - <img ... data-tali-image="1" width height data-tali-wrap data-tali-rotate data-tali-flip data-tali-crop data-tali-style>
//   לתמונת ![](נתיב). ראו LocalImage ב־embed.js.
// - תמונה חופשית על הדף (overlay-data.js): rotate, flipH, flipV, crop: [t, r, b, l], styles: [...].
//
// חיתוך: אחוזים מכל צד של התמונה המקורית (לפני הסיבוב), [עליון, ימין, תחתון, שמאל].

export const LAYOUTS = ['inline', 'wrap-left', 'wrap-right', 'center', 'break-left', 'break-right'];
export const STYLES = ['border', 'shadow', 'round'];
const ROTATIONS = [0, 90, 180, 270];

export const emptyFormat = () => ({ width: null, height: null, layout: 'inline', rotate: 0, flipH: false, flipV: false, crop: null, styles: [] });

const clampSize = (n) => Math.max(20, Math.min(4000, Math.round(n)));
const r1 = (n) => Math.round(n * 10) / 10;

// חיתוך תקין: ארבעה מספרים 0..90, ובכל ציר נשאר לפחות 5% מהתמונה. אחרת null (בלי חיתוך).
export function cleanCrop(crop) {
  if (!Array.isArray(crop) || crop.length !== 4) return null;
  const c = crop.map((n) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(90, r1(n))) : NaN));
  if (c.some(Number.isNaN)) return null;
  if (c[0] + c[2] > 95 || c[1] + c[3] > 95) return null;
  return c.every((n) => n === 0) ? null : c;
}
export const normalizeRotation = (deg) => {
  const d = ((Math.round((Number(deg) || 0) / 90) * 90) % 360 + 360) % 360;
  return ROTATIONS.includes(d) ? d : 0;
};

export function cleanFormat(input = {}) {
  const f = emptyFormat();
  if (Number.isFinite(input.width) && input.width > 0) f.width = clampSize(input.width);
  if (f.width && Number.isFinite(input.height) && input.height > 0) f.height = clampSize(input.height);
  if (LAYOUTS.includes(input.layout)) f.layout = input.layout;
  f.rotate = normalizeRotation(input.rotate);
  f.flipH = !!input.flipH;
  f.flipV = !!input.flipV;
  f.crop = cleanCrop(input.crop);
  f.styles = STYLES.filter((s) => Array.isArray(input.styles) && input.styles.includes(s));
  return f;
}

// האם צריך מסגרת (חיתוך, סיבוב, היפוך או גובה שלא לפי היחס). בלי: התמונה מוצגת כמו תמיד.
export const needsFrame = (f) => !!(f.crop || f.rotate || f.flipH || f.flipV || f.height);
// האם יש בכלל עיצוב (אחרת: Markdown רגיל ![](...) / ![[name]])
export const isPlain = (f) => !f.width && f.layout === 'inline' && !needsFrame(f) && !f.styles.length;

const SIZE = /^(\d{1,4})(?:x(\d{1,4}))?$/;
const CROP = /^crop-(\d{1,2}(?:\.\d)?)-(\d{1,2}(?:\.\d)?)-(\d{1,2}(?:\.\d)?)-(\d{1,2}(?:\.\d)?)$/;

// ![[...]]: name, format, extra (שדות שלא מוכרים, למשל תיאור בסגנון אובסידיאן; נשמרים)
export function parseEmbedTarget(target) {
  const [name, ...parts] = String(target || '').split('|');
  const f = emptyFormat();
  const extra = [];
  let sized = false;
  for (const raw of parts) {
    const t = raw.trim();
    const size = SIZE.exec(t);
    const crop = CROP.exec(t);
    if (size && !sized) {
      sized = true;
      f.width = clampSize(Number(size[1]));
      if (size[2]) f.height = clampSize(Number(size[2]));
    } else if (LAYOUTS.includes(t) && t !== 'inline') f.layout = t;
    else if (/^rot-(90|180|270)$/.test(t)) f.rotate = Number(t.slice(4));
    else if (t === 'flip-h') f.flipH = true;
    else if (t === 'flip-v') f.flipV = true;
    else if (crop) f.crop = cleanCrop(crop.slice(1).map(Number));
    else if (STYLES.includes(t)) { if (!f.styles.includes(t)) f.styles.push(t); }
    else extra.push(raw);
  }
  return { name, format: cleanFormat(f), extra };
}

// הסדר קבוע: שם | גודל | שדות לא מוכרים | פריסה | סיבוב | היפוך | חיתוך | סגנון
export function formatEmbedTarget(name, format, extra = []) {
  const f = cleanFormat(format);
  const parts = [name];
  if (f.width) parts.push(f.height ? `${f.width}x${f.height}` : String(f.width));
  parts.push(...extra);
  if (f.layout !== 'inline') parts.push(f.layout);
  if (f.rotate) parts.push('rot-' + f.rotate);
  if (f.flipH) parts.push('flip-h');
  if (f.flipV) parts.push('flip-v');
  if (f.crop) parts.push('crop-' + f.crop.join('-'));
  parts.push(...f.styles);
  return parts.join('|');
}
// המרה ל־Markdown רגיל (plain-md.js): בלי פריסה, כל השאר נשאר
export const withoutLayout = (target) => {
  const { name, format, extra } = parseEmbedTarget(target);
  return formatEmbedTarget(name, { ...format, layout: 'inline' }, extra);
};

// <img>: ערכי data-tali-wrap הישנים (left/right) הם wrap-left / wrap-right
const WRAP_ATTR = { left: 'wrap-left', right: 'wrap-right', center: 'center', 'break-left': 'break-left', 'break-right': 'break-right' };
export function layoutFromWrapAttr(v) { return WRAP_ATTR[v] || 'inline'; }
export function wrapAttrFromLayout(layout) {
  if (layout === 'wrap-left') return 'left';
  if (layout === 'wrap-right') return 'right';
  return LAYOUTS.includes(layout) && layout !== 'inline' ? layout : null;
}
export function parseCropAttr(v) {
  const parts = String(v || '').split(',').map((s) => Number(s.trim()));
  return parts.length === 4 ? cleanCrop(parts) : null;
}

// גודל התיבה על הדף: רוחב, וגובה לפי היחס של החלק הגלוי אחרי חיתוך וסיבוב. natural: { w, h } של הקובץ.
export function visibleRatio(natural, f) {
  const [t, r, b, l] = (f.crop || [0, 0, 0, 0]).map((n) => n / 100);
  const vw = Math.max(1, natural.w * (1 - l - r)), vh = Math.max(1, natural.h * (1 - t - b));
  return f.rotate === 90 || f.rotate === 270 ? vh / vw : vw / vh; // רוחב חלקי גובה, כפי שמוצג
}
// הגודל "המקורי" (100%) של החלק הגלוי: אחרי חיתוך וסיבוב, בלי הגדלה
export function naturalBox(natural, f) {
  const [t, r, b, l] = (f.crop || [0, 0, 0, 0]).map((n) => n / 100);
  const vw = Math.max(1, Math.round(natural.w * (1 - l - r))), vh = Math.max(1, Math.round(natural.h * (1 - t - b)));
  return f.rotate === 90 || f.rotate === 270 ? { w: vh, h: vw } : { w: vw, h: vh };
}
export function boxSize(natural, f, fallbackWidth) {
  const ratio = visibleRatio(natural, f);
  const w = f.width || fallbackWidth || naturalBox(natural, f).w;
  return { w, h: f.height || Math.max(1, Math.round(w / ratio)) };
}

// איך מציירים: תיבה (box) בגודל הרצוי, ובתוכה "חלון" (inner) של החלק החתוך, מסובב ומהופך סביב המרכז,
// ובתוכו התמונה המלאה, מוזזת כך שרק החלק החתוך נראה. הכול באחוזים מהתיבה, כך שהתיבה יכולה להתכווץ
// (max-width: 100%) והתוכן נשאר נכון. aspect = רוחב/גובה של התיבה.
export function frameStyles(f, aspect) {
  const [t, r, b, l] = (f.crop || [0, 0, 0, 0]).map((n) => n / 100);
  const side = f.rotate === 90 || f.rotate === 270;
  // רוחב וגובה החלון באחוזים מהתיבה: בסיבוב של 90° הם מתחלפים
  const iw = side ? 100 / aspect : 100, ih = side ? 100 * aspect : 100;
  const pct = (n) => r1(n * 1000) / 1000 + '%';
  const transforms = [];
  if (f.flipH || f.flipV) transforms.push(`scale(${f.flipH ? -1 : 1}, ${f.flipV ? -1 : 1})`);
  if (f.rotate) transforms.push(`rotate(${f.rotate}deg)`);
  return {
    inner: {
      position: 'absolute', overflow: 'hidden',
      width: pct(iw), height: pct(ih), left: pct((100 - iw) / 2), top: pct((100 - ih) / 2),
      transform: transforms.join(' '),
    },
    img: {
      position: 'absolute', maxWidth: 'none', maxHeight: 'none',
      width: pct(100 / (1 - l - r)), height: pct(100 / (1 - t - b)),
      left: pct((-l / (1 - l - r)) * 100), top: pct((-t / (1 - t - b)) * 100),
    },
  };
}

// סיבוב ב־90° (dir: 1 ימינה, -1 שמאלה). רוחב וגובה מפורשים מתחלפים, כדי שהתמונה לא תתעוות.
export function rotateFormat(f, dir) {
  const next = { ...f, rotate: normalizeRotation(f.rotate + 90 * dir) };
  if (f.width && f.height) { next.width = f.height; next.height = f.width; }
  return cleanFormat(next);
}
