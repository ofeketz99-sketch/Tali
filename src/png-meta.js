// 11.6: מידע נוסף בתוך קובץ PNG (קטע tEXt), בלי לשנות את התמונה עצמה. משמש לשמירת השרטוט המקורי
// (וקטורים) בתוך ה־PNG ש"המרה לתמונה" יוצרת, כדי שאפשר יהיה להחזיר אותו לשרטוט שאפשר לערוך.
// כל תוכנה אחרת (אובסידיאן, דפדפן, צייר) מתעלמת מהקטע. פונקציות טהורות, בלי import (עם בדיקות).

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
let table = null;
function crc32(bytes) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const ascii = (s) => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff);
export const isPng = (bytes) => bytes && bytes.length > 8 && SIGNATURE.every((b, i) => bytes[i] === b);

function chunks(bytes) {
  const out = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (at + 12 + length > bytes.length) break;
    out.push({ at, length, type, data: bytes.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
    if (type === 'IEND') break;
  }
  return out;
}

// value: טקסט כלשהו (נשמר בקידוד URL, כך שהקטע נשאר ASCII תקני)
export function writePngText(bytes, key, value) {
  if (!isPng(bytes)) throw new Error('not a PNG');
  const list = chunks(bytes);
  const iend = list.find((c) => c.type === 'IEND');
  if (!iend) throw new Error('broken PNG');
  const data = ascii(key + '\0' + encodeURIComponent(String(value)));
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(ascii('tEXt'), 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  // קטע קודם עם אותו מפתח מוסר, והחדש נכנס לפני IEND
  const parts = [bytes.subarray(0, 8)];
  for (const c of list) {
    if (c.type === 'IEND') break;
    if (c.type === 'tEXt' && textKey(c.data) === key) continue;
    parts.push(bytes.subarray(c.at, c.at + 12 + c.length));
  }
  parts.push(chunk, bytes.subarray(iend.at, iend.at + 12 + iend.length));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
const textKey = (data) => {
  const zero = data.indexOf(0);
  return zero < 0 ? '' : String.fromCharCode(...data.subarray(0, zero));
};
export function readPngText(bytes, key) {
  if (!isPng(bytes)) return null;
  for (const c of chunks(bytes)) {
    if (c.type !== 'tEXt' || textKey(c.data) !== key) continue;
    let s = '';
    for (const b of c.data.subarray(key.length + 1)) s += String.fromCharCode(b);
    try { return decodeURIComponent(s); } catch { return null; }
  }
  return null;
}
