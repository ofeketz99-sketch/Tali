// 8.3: תמונות מהלוח (Ctrl+V) ומגרירה. מוצאים את התמונה בכל צורה שהיא מגיעה:
// 1. קובץ (צילום מסך, "העתקת תמונה" ברוב התוכנות): clipboardData.files / items.
// 2. HTML שכל התוכן שלו תמונה אחת (העתקה מדפדפן או מוורד): <img src="data:..."> או <img src="https://...">.
//    עד 8.2 המקרה הזה לא זוהה: ProseMirror הדביק את ה־HTML בתחילת המסמך (שם היה הסמן), עם קישור לאינטרנט
//    שנטען לאט או בכלל לא (ה־CSP חוסם כתובות חיצוניות לתמונות).
// פונקציות שלא נוגעות בדיסק; הורדה מהרשת עוברת דרך main.js (fetchImage).

const isImageFile = (f) => !!f && typeof f.type === 'string' && f.type.startsWith('image/');

// קבצי תמונה שבלוח, בלי כפילויות (אותה תמונה מופיעה לפעמים גם ב־files וגם ב־items)
export function imageFilesFrom(data) {
  if (!data) return [];
  const files = [...(data.files || [])].filter(isImageFile);
  if (files.length) return files;
  const out = [];
  for (const item of data.items || []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (isImageFile(f)) out.push(f);
    }
  }
  return out;
}

// כתובת התמונה כשה־HTML שבלוח הוא תמונה אחת ובלי טקסט נוסף. אחרת null (הדבקה רגילה של טקסט).
export function lonelyImageSrc(html) {
  if (!html || typeof html !== 'string') return null;
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  if (imgs.length !== 1) return null;
  const text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(style|script|head|title)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .trim();
  if (text) return null;
  const m = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(imgs[0]);
  const src = (m && (m[1] ?? m[2] ?? m[3]) || '').replace(/&amp;/g, '&').trim();
  return /^(data:image\/|https?:\/\/)/i.test(src) ? src : null;
}

// data:image/...;base64,... -> File
export function fileFromDataUrl(src, name = 'image') {
  const m = /^data:(image\/[a-z0-9.+-]+)(;base64)?,(.*)$/is.exec(src || '');
  if (!m) return null;
  let bytes;
  if (m[2]) {
    const bin = atob(m[3].replace(/\s+/g, ''));
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else bytes = new TextEncoder().encode(decodeURIComponent(m[3]));
  const ext = (m[1].split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  return new File([bytes], `${name}.${ext}`, { type: m[1].toLowerCase() });
}
