// ייבוא קבצים מהטלפון (25.11.2026): כל קובץ שנבחר הופך למה שהכספת יודעת להציג.
// .md / .markdown / .txt → מסמך (.md), .canvas → קנבס, תמונה → קובץ מצורף, Word (.docx) → מסמך Markdown.
// קובץ אחר (PDF וכו') לא נכנס, ומוחזרת סיבה. פונקציות טהורות, עם בדיקות (tests/mobile-import.test.mjs).

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic)$/i;

const stripExt = (name) => name.replace(/\.[^./]+$/, '');

// לאן נכנס קובץ, ואיך לקרוא אותו. rel = הנתיב היחסי (עם / ), בלי שם התיקייה שנבחרה.
export function importPlan(rel, type = '') {
  const path = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const name = path.split('/').pop() || '';
  if (!name || path.split('/').some((s) => s.startsWith('.'))) return { skip: 'hidden' };
  const dir = path.slice(0, path.length - name.length);
  if (/\.(md|markdown)$/i.test(name)) return { kind: 'text', path: dir + stripExt(name) + '.md' };
  if (/\.canvas$/i.test(name)) return { kind: 'text', path };
  if (/\.txt$/i.test(name)) return { kind: 'text', path: dir + stripExt(name) + '.md' };
  if (/\.docx$/i.test(name)) return { kind: 'docx', path: dir + stripExt(name) + '.md' };
  if (IMAGE_RE.test(name) || /^image\//.test(type)) return { kind: 'image', path };
  if (/\.doc$/i.test(name)) return { skip: 'doc' };
  if (/\.pdf$/i.test(name)) return { skip: 'pdf' };
  // בלי סיומת, אבל הטלפון אומר שזה טקסט (קורה בקבצים שהגיעו מוואטסאפ/מייל)
  if (!/\.[^.]+$/.test(name) && /^text\//.test(type)) return { kind: 'text', path: dir + name + '.md' };
  return { skip: 'type' };
}

export const SKIP_REASON = {
  doc: 'קובץ Word ישן (.doc): צריך לשמור אותו כ־.docx',
  pdf: 'PDF לא נפתח בטלפון',
  type: 'סוג קובץ שלא נתמך',
};

// UTF-8, ואם הקובץ לא תקין ב־UTF-8: עברית של Windows (קבצי txt ישנים)
export function decodeText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(u8); }
  catch {
    try { text = new TextDecoder('windows-1255').decode(u8); } catch { text = new TextDecoder('utf-8').decode(u8); }
  }
  return text.replace(/^﻿/, '');
}

// ===== Word (.docx): ZIP עם word/document.xml =====
async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZipEntry(buffer, wanted) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
    if (name === wanted) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = u8.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error('zip method ' + method);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[e] ?? m;
});

// טקסט של פסקה: <w:t>, טאב, ירידת שורה. מודגש/נטוי לפי ה־run.
function paragraphText(xml) {
  let out = '';
  for (const run of xml.match(/<w:r[ >][\s\S]*?<\/w:r>/g) || []) {
    const props = (run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
    const on = (tag) => new RegExp(`<w:${tag}(?:\\s+w:val="(?:1|true|on)")?\\s*/>`).test(props);
    let text = '';
    for (const m of run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
      if (m[1] !== undefined) text += unxml(m[1]);
      else text += m[0] === '<w:tab/>' ? '\t' : '\n';
    }
    if (!text) continue;
    const bold = on('b'), italic = on('i');
    if ((bold || italic) && text.trim()) {
      const mark = bold && italic ? '***' : bold ? '**' : '*';
      const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
      text = lead + mark + text.trim() + mark + trail;
    }
    out += text;
  }
  return out.replace(/\*\*\*\*/g, ''); // שני runs מודגשים צמודים
}

function paragraphMd(xml) {
  const text = paragraphText(xml).replace(/[ \t]+$/g, '');
  const style = (xml.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '';
  const level = (style.match(/^(?:Heading|heading|כותרת)\s*([1-6])$/) || style.match(/^([1-6])$/) || [])[1];
  if (!text.trim()) return '';
  if (/^Title$/i.test(style)) return '# ' + text.trim();
  if (level) return '#'.repeat(Math.min(4, Number(level) + 1)) + ' ' + text.trim();
  if (/<w:numPr>/.test(xml) || /^List/i.test(style)) {
    const ilvl = Number((xml.match(/<w:ilvl w:val="(\d+)"/) || [])[1] || 0);
    return '  '.repeat(ilvl) + '- ' + text.trim();
  }
  return text;
}

function tableMd(xml) {
  const rows = (xml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map((tr) =>
    (tr.match(/<w:tc>[\s\S]*?<\/w:tc>|<w:tc [\s\S]*?<\/w:tc>/g) || []).map((tc) =>
      (tc.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) || []).map(paragraphText).filter((s) => s.trim()).join(' ')
        .replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()));
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length), 1);
  const line = (r) => '| ' + Array.from({ length: width }, (_, i) => r[i] || ' ').join(' | ') + ' |';
  return [line(rows[0]), '| ' + Array(width).fill('---').join(' | ') + ' |', ...rows.slice(1).map(line)].join('\n');
}

// document.xml → Markdown. פסקאות, כותרות (H1 של Word ← ##, כי הכותרת היא שם המסמך), רשימות, טבלאות.
export function docxXmlToMarkdown(xml) {
  const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [, xml])[1];
  const blocks = [];
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g;
  let prevList = false;
  for (const m of body.matchAll(re)) {
    const isTable = m[0].startsWith('<w:tbl>');
    const md = isTable ? tableMd(m[0]) : paragraphMd(m[0]);
    if (!md) { prevList = false; continue; }
    const isList = !isTable && /^\s*- /.test(md);
    if (isList && prevList) blocks[blocks.length - 1] += '\n' + md;
    else blocks.push(md);
    prevList = isList;
  }
  return blocks.join('\n\n') + '\n';
}

export async function docxToMarkdown(buffer) {
  const xml = await readZipEntry(buffer, 'word/document.xml');
  if (!xml) throw new Error('no word/document.xml');
  return docxXmlToMarkdown(new TextDecoder().decode(xml));
}

// שם פנוי: "שם.md" ← "שם 1.md" (לא דורסים מסמך קיים בייבוא)
export function freePath(path, taken) {
  if (!taken.has(path)) return path;
  const m = path.match(/^(.*?)(\.[^./]+)?$/);
  for (let i = 1; ; i++) { const p = `${m[1]} ${i}${m[2] || ''}`; if (!taken.has(p)) return p; }
}
