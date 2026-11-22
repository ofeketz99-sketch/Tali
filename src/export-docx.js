// ייצוא ל־Word כקובץ .docx אמיתי (ספריית docx). הקלט: ה־HTML של exportHtml אחרי שהתמונות הוטמעו
// כ־data URI (inline-images ב־main.js). כל פסקה מקבלת כיוון לפי האות החזקה הראשונה שלה, כך שעברית
// נשארת מימין לשמאל ב־Word, ואנגלית בתוכה לא מתהפכת.
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun,
  ExternalHyperlink, AlignmentType, BorderStyle, ShadingType, LevelFormat, CheckBox, Textbox,
  CommentRangeStart, CommentRangeEnd, CommentReference, TextWrappingType, TextWrappingSide,
  HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom,
  Math as OMath, MathRun, MathFraction, MathSuperScript, MathSubScript, MathSubSuperScript, MathRadical,
  MathSum, MathIntegral, MathLimitLower, MathLimitUpper,
} from 'docx';

const HEADINGS = { H1: HeadingLevel.HEADING_1, H2: HeadingLevel.HEADING_2, H3: HeadingLevel.HEADING_3, H4: HeadingLevel.HEADING_4, H5: HeadingLevel.HEADING_5, H6: HeadingLevel.HEADING_6 };
const MAX_IMAGE_WIDTH = 600; // פיקסלים: רוחב הטקסט בעמוד A4 עם שוליים רגילים
const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const STRONG_CHAR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ֐-ࣿיִ-﷿ﹰ-﻿]/;

// כיוון לפי האות החזקה הראשונה (כמו dir="auto"). בלי אותיות: ברירת המחדל של המסמך
function isRtl(text, fallback) {
  const m = STRONG_CHAR.exec(text || '');
  return m ? RTL_CHAR.test(m[0]) : fallback;
}
const hex = (css) => {
  if (!css) return null;
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css.trim());
  if (m) return m[1].length === 3 ? m[1].split('').map((c) => c + c).join('').toUpperCase() : m[1].toUpperCase();
  m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)/i.exec(css);
  if (m && (m[4] === undefined || Number(m[4]) > 0)) return [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  return null;
};

// תמונה מ־data URI: PNG/JPEG/GIF/BMP כמו שהן, כל השאר (WebP, SVG, AVIF) עוברות ל־PNG דרך canvas
// fetchImage(url) -> { bytes, type }: תמונה מהאינטרנט (![](https://...)), דרך main.js. עד 9.8 היא נשמטה.
async function imageData(img, fetchImage) {
  let src = img.getAttribute('src') || '';
  if (/^https?:/i.test(src) && fetchImage) {
    try {
      const got = await fetchImage(src);
      if (got?.bytes) {
        let bin = '';
        const bytes = new Uint8Array(got.bytes);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        src = `data:${got.type || 'image/png'};base64,${btoa(bin)}`;
      }
    } catch { /* בלי רשת: ממקום שמור */ }
  }
  if (!src.startsWith('data:')) return null;
  const el = new Image();
  el.src = src;
  try { await el.decode(); } catch { return null; }
  const mime = /^data:image\/([a-z+]+)/i.exec(src)?.[1]?.toLowerCase();
  const type = { png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', bmp: 'bmp' }[mime];
  let data;
  if (type) data = Uint8Array.from(atob(src.slice(src.indexOf(',') + 1)), (c) => c.charCodeAt(0));
  else {
    const c = document.createElement('canvas');
    c.width = el.naturalWidth || 300; c.height = el.naturalHeight || 150;
    c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
    data = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/png'))).arrayBuffer());
  }
  let w = Number(img.getAttribute('width')) || parseFloat(img.style.width) || el.naturalWidth || 300;
  const ratio = (el.naturalHeight || 150) / (el.naturalWidth || 300);
  w = Math.min(w, MAX_IMAGE_WIDTH);
  return { type: type || 'png', data, transformation: { width: Math.round(w), height: Math.round(w * ratio) } };
}

// ===== נוסחאות: MathML של KaTeX ← נוסחה אמיתית של Word (OMML) =====
// (9.9) עד 9.8 הנוסחה יצאה כטקסט בגופן Cambria Math. עכשיו היא אובייקט נוסחה שאפשר לערוך ב־Word:
// שברים, חזקות ואינדקסים, שורשים, סכום ואינטגרל עם גבולות. מה שאין לו מקבילה (מטריצה, למשל) יוצא כרצף.
const NARY = { '∑': 'sum', '∫': 'int' };
const naryOp = (el) => {
  if (!el || el.nodeType !== 1) return null;
  const t = el.localName;
  if (t === 'mo') return NARY[el.textContent.trim()] ? el : null;
  if (['munderover', 'msubsup', 'munder', 'mover', 'msub', 'msup'].includes(t)) return naryOp(el.children[0]);
  return null;
};
function omml(node) {
  if (node.nodeType === 3) { const t = node.textContent.replace(/\s+/g, ' '); return t.trim() ? [new MathRun(t)] : []; }
  if (node.nodeType !== 1) return [];
  const t = node.localName;
  const kids = [...node.children];
  const c = (i) => (kids[i] ? omml(kids[i]) : []);
  switch (t) {
    case 'annotation': case 'annotation-xml': case 'mphantom': return [];
    case 'semantics': return c(0);
    case 'mi': case 'mn': case 'mo': case 'ms': {
      const text = node.textContent;
      if (!text.trim()) return [];
      // שם פונקציה (sin, log) או טקסט: לא נטוי
      if (t === 'mi' && text.length > 1) return [new MathRun({ text, style: 'plain' })];
      return [new MathRun(text)];
    }
    case 'mtext': return node.textContent.trim() ? [new MathRun({ text: node.textContent, normalText: true })] : [];
    case 'mspace': return [];
    case 'mfrac': return [new MathFraction({ numerator: c(0), denominator: c(1) })];
    case 'msqrt': return [new MathRadical({ children: seq(kids) })];
    case 'mroot': return [new MathRadical({ children: c(0), degree: c(1) })];
    case 'msup': return [new MathSuperScript({ children: c(0), superScript: c(1) })];
    case 'msub': return [new MathSubScript({ children: c(0), subScript: c(1) })];
    case 'msubsup': return [new MathSubSuperScript({ children: c(0), subScript: c(1), superScript: c(2) })];
    case 'munder': return [new MathLimitLower({ children: c(0), limit: c(1) })];
    case 'mover': return [new MathLimitUpper({ children: c(0), limit: c(1) })];
    case 'munderover': return [new MathLimitLower({ children: [new MathLimitUpper({ children: c(0), limit: c(2) })], limit: c(1) })];
    case 'mtable': // מטריצה / יישור: שורה אחרי שורה, תאים ברווח
      return kids.flatMap((row, i) => [...(i ? [new MathRun(' ; ')] : []), ...[...row.children].flatMap((cell, j) => [...(j ? [new MathRun('  ')] : []), ...seq([...cell.children])])]);
    default: return seq(kids.length ? kids : [...node.childNodes]);
  }
}
// רצף של אחים: סכום/אינטגרל לוקח את האיבר שאחריו כגוף שלו, כמו ב־Word
function seq(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    const op = naryOp(el);
    if (op) {
      const kind = NARY[op.textContent.trim()];
      const k = [...el.children];
      const t = el.localName;
      const sub = ['munderover', 'msubsup', 'munder', 'msub'].includes(t) ? omml(k[1]) : undefined;
      const sup = ['munderover', 'msubsup'].includes(t) ? omml(k[2]) : ['mover', 'msup'].includes(t) ? omml(k[1]) : undefined;
      const body = i + 1 < list.length ? omml(list[++i]) : [];
      const limits = t === 'msubsup' || t === 'msub' || t === 'msup' ? 'side' : 'aboveBelow';
      const Cls = kind === 'sum' ? MathSum : MathIntegral;
      out.push(new Cls({ children: body, subScript: sub, superScript: sup, ...(kind === 'int' || limits === 'side' ? { limits } : {}) }));
      continue;
    }
    out.push(...omml(el));
  }
  return out;
}
export function mathToWord(mathEl) {
  const sem = mathEl.querySelector('semantics');
  const children = sem ? omml(sem) : seq([...mathEl.children]);
  return new OMath({ children });
}

// ===== שכבת הדף: תמונות חופשיות, שרטוטים, תיבות טקסט והערות (9.9) =====
// exportHtml מכניס לפני הגוש שלידו כל אחד מהם <div data-tali-float="{...}">, עם dx/dy בפיקסלים מתחילת הגוש
// ומהקצה השמאלי של אזור הטקסט. ב־Word: אובייקט צף שמעוגן לפסקה, והטקסט עוטף אותו.
const WORD_TEXT_PX = 602; // רוחב הטקסט ב־A4 עם שוליים של אינץ', ב־96dpi
const EMU = 9525;

// נוסחה של Word, ואם ההמרה נכשלה: המקור ב־TeX כטקסט, כדי שלא יאבד מידע
function mathOrText(m) {
  try { return mathToWord(m); } catch {
    const tex = m.querySelector('annotation')?.textContent || m.textContent;
    return new TextRun({ text: tex, font: 'Cambria Math' });
  }
}

export async function buildDocx({ title, html, rtlDefault = true, fetchImage = null }) {
  const root = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  // התמונות קודם (אסינכרוני), כדי שהמעבר על המסמך יהיה סינכרוני
  // 11.5: המפתח הוא מספר ב־data-tali-img ולא האלמנט עצמו: פריט ברשימה וטקסט חופשי עוברים cloneNode,
  // ועד עכשיו תמונה בתוך רשימה לא נמצאה ויצאה כ"[תמונה: …]"
  const images = new Map();
  let imgN = 0;
  for (const img of root.querySelectorAll('img')) { img.dataset.taliImg = String(++imgN); images.set(img.dataset.taliImg, await imageData(img, fetchImage)); }

  let listInstance = 0;

  // ----- שכבת הדף -----
  let pending = []; // אובייקטים צפים שמחכים לפסקה הבאה, שאליה הם יעוגנו
  const comments = [];
  const floatRuns = () => {
    const list = pending;
    pending = [];
    const runs = [], wrap = [];
    for (const { info, el } of list) {
      const k = Math.min(1, WORD_TEXT_PX / (info.textWidth || WORD_TEXT_PX));
      const position = {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, offset: Math.round(info.dx * k * EMU) },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: Math.round(info.dy * k * EMU) },
      };
      if (info.kind === 'image') {
        const im = images.get(el.querySelector('img')?.dataset.taliImg);
        if (!im) continue;
        const w = Math.max(8, Math.round(info.w * k)), h = Math.max(8, Math.round(info.h * k));
        runs.push(new ImageRun({ ...im, transformation: { width: w, height: h },
          floating: { ...position, allowOverlap: true, wrap: { type: TextWrappingType.SQUARE, side: TextWrappingSide.BOTH_SIDES }, margins: { left: 114300, right: 114300 } } }));
      } else if (info.kind === 'textbox') {
        const lines = String(info.text || '').split(/\r?\n/);
        const rtl = isRtl(info.text, rtlDefault);
        runs.push(new Textbox({
          style: { width: `${Math.round(info.w * k * 0.75)}pt`, height: `${Math.round(info.h * k * 0.75)}pt`, position: 'absolute',
            left: `${Math.round(info.dx * k * 0.75)}pt`, top: `${Math.round(info.dy * k * 0.75)}pt`,
            positionHorizontalRelative: 'margin', positionVerticalRelative: 'text', wrapStyle: 'square' },
          children: lines.map((line) => new Paragraph({ bidirectional: rtl, children: [new TextRun({ text: line, rightToLeft: RTL_CHAR.test(line) })] })),
        }));
      } else if (info.kind === 'comment') {
        const id = comments.length;
        const body = [info.quote ? `«${info.quote}»` : '', info.text || ''].filter(Boolean);
        comments.push({ id, author: 'Tali', initials: 'T', date: new Date(),
          children: body.map((line) => new Paragraph({ bidirectional: isRtl(line, rtlDefault), children: [new TextRun({ text: line, rightToLeft: RTL_CHAR.test(line) })] })) });
        wrap.push(id);
      }
    }
    return { runs, wrap };
  };
  // הערה בשוליים: Word צריך טווח בפסקה. עוטפים את כל הפסקה שהיא לידה.
  const withFloats = (children) => {
    if (!pending.length) return children;
    const { runs, wrap } = floatRuns();
    let out = [...runs, ...children];
    for (const id of wrap) out = [new CommentRangeStart(id), ...out, new CommentRangeEnd(id), new TextRun({ children: [new CommentReference(id)] })];
    return out;
  };

  // ----- טקסט בתוך פסקה -----
  function inline(node, fmt, out) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.replace(/\s+/g, ' ');
      // חלוקה לקטעים לפי כיוון: אותיות עבריות ימין לשמאל, לטיניות שמאל לימין, וכל השאר (פיסוק, רווחים,
      // ספרות) שמאל לימין רק בין שני קטעים לטיניים, ואחרת לפי הפסקה. בלי זה Word מצמיד נקודה לאנגלית שאחריה.
      const { rtlPara, ...run } = fmt;
      if (!text) return out;
      const parts = text.match(new RegExp(`${RTL_CHAR.source}+|[A-Za-z\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF]+|[^A-Za-z\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF\\u0590-\\u08FF\\uFB1D-\\uFDFF\\uFE70-\\uFEFF]+`, 'g')) || [text];
      const kind = parts.map((p) => (RTL_CHAR.test(p) ? 'r' : STRONG_CHAR.test(p) ? 'l' : 'n'));
      const dir = kind.map((k, i) => (k !== 'n' ? k === 'r'
        : (kind[i - 1] === 'l' && kind[i + 1] === 'l') ? false : (i === 0 || i === kind.length - 1) && !rtlPara ? false : !!rtlPara));
      let buf = '', cur = null;
      parts.forEach((p, i) => {
        if (cur !== null && dir[i] !== cur) { out.push(new TextRun({ text: buf, ...run, rightToLeft: cur })); buf = ''; }
        buf += p; cur = dir[i];
      });
      if (buf) out.push(new TextRun({ text: buf, ...run, rightToLeft: cur }));
      return out;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return out;
    const tag = node.tagName;
    const f = { ...fmt };
    if (tag === 'BR') { out.push(new TextRun({ break: 1 })); return out; }
    if (tag === 'IMG') {
      const im = images.get(node.dataset?.taliImg);
      if (im) out.push(new ImageRun(im));
      else {
        // תמונה שלא נמצאה (קובץ חסר, בלי רשת): לפחות השם שלה, כדי שלא תיעלם בשקט
        const src = node.getAttribute('src') || '';
        let name = node.getAttribute('alt') || (src.startsWith('data:') ? '' : src.split(/[\\/]/).pop().split('?')[0]);
        try { name = decodeURIComponent(name); } catch { /* נשאר כמו שהוא */ }
        if (name) out.push(new TextRun({ text: `[תמונה: ${name}]`, color: '888888', italics: true }));
      }
      return out;
    }
    // MathML שומר על שם תגית באותיות קטנות (math), בניגוד לתגיות HTML
    if (node.localName === 'math') { out.push(mathOrText(node)); return out; }
    if (tag === 'STRONG' || tag === 'B') f.bold = true;
    if (tag === 'EM' || tag === 'I') f.italics = true;
    if (tag === 'U') f.underline = {};
    if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') f.strike = true;
    if (tag === 'SUB') f.subScript = true;
    if (tag === 'SUP') f.superScript = true;
    if (tag === 'CODE') { f.font = { ascii: 'Consolas', hAnsi: 'Consolas', cs: 'Segoe UI' }; f.shading = { type: ShadingType.CLEAR, color: 'auto', fill: 'F0F0F0' }; }
    if (tag === 'MARK') f.shading = { type: ShadingType.CLEAR, color: 'auto', fill: hex(node.style.backgroundColor) || hex(node.getAttribute('data-color')) || 'FFF59D' };
    const color = hex(node.style.color);
    if (color) f.color = color;
    const bg = tag !== 'MARK' && hex(node.style.backgroundColor);
    if (bg) f.shading = { type: ShadingType.CLEAR, color: 'auto', fill: bg };
    if (node.classList.contains('wikilink')) f.color = f.color || '2F6FB0';
    if (tag === 'A') {
      const href = node.getAttribute('href') || '';
      if (/^(https?:|mailto:)/i.test(href)) {
        const kids = [];
        for (const c of node.childNodes) inline(c, { ...f, style: 'Hyperlink' }, kids);
        out.push(new ExternalHyperlink({ link: href, children: kids }));
        return out;
      }
    }
    for (const c of node.childNodes) inline(c, f, out);
    return out;
  }

  // ----- פסקאות -----
  function para(node, opts = {}) {
    const rtl = isRtl(node.textContent, rtlDefault);
    // תיבת סימון של משימה: תיבה אמיתית של Word (אפשר לסמן בלחיצה), ואחריה רווח
    const box = opts.prefix && /^[☐☑]/.test(opts.prefix);
    const runs = box ? [new CheckBox({ checked: opts.prefix.startsWith('☑') }), new TextRun({ text: ' ', rightToLeft: rtl })]
      : opts.prefix ? [new TextRun({ text: opts.prefix, rightToLeft: rtl })] : [];
    for (const c of node.childNodes) inline(c, { ...opts.fmt, rtlPara: rtl }, runs);
    const ta = (node.style?.textAlign || node.getAttribute?.('align') || '').toLowerCase();
    const alignment = ta === 'center' ? AlignmentType.CENTER : ta === 'justify' ? AlignmentType.BOTH
      : ta === 'right' ? (rtl ? AlignmentType.START : AlignmentType.END)
      : ta === 'left' ? (rtl ? AlignmentType.END : AlignmentType.START) : undefined;
    // יישור מפורש של הפסקה גובר; אחרת ברירת המחדל של ההקשר (בתא טבלה: מרכז, 10.2)
    return new Paragraph({ ...opts.para, children: withFloats(runs), bidirectional: rtl, alignment: alignment ?? opts.para?.alignment });
  }

  function blocks(container, ctx = {}) {
    const out = [];
    let loose = []; // טקסט חופשי בין בלוקים (למשל בתוך li בלי p)
    const flush = () => {
      if (!loose.length) return;
      const span = document.createElement('span');
      span.append(...loose.map((n) => n.cloneNode(true)));
      if (span.textContent.trim() || span.querySelector('img')) out.push(para(span, { para: ctx.para, prefix: ctx.prefix, fmt: ctx.fmt }));
      ctx = { ...ctx, prefix: undefined };
      loose = [];
    };
    for (const node of container.childNodes) {
      const tag = node.nodeType === Node.ELEMENT_NODE ? node.tagName : null;
      const isBlock = tag && /^(P|H[1-6]|UL|OL|BLOCKQUOTE|PRE|TABLE|HR|DIV|FIGURE|SECTION|LI)$/.test(tag);
      if (!isBlock) { loose.push(node); continue; }
      flush();
      if (tag === 'DIV' && node.hasAttribute('data-tali-float')) {
        try { pending.push({ info: JSON.parse(node.getAttribute('data-tali-float')), el: node }); } catch { /* פגום: מדלגים */ }
        continue;
      }
      if (tag === 'P') { out.push(para(node, { para: ctx.para, prefix: ctx.prefix, fmt: ctx.fmt })); ctx = { ...ctx, prefix: undefined }; }
      else if (HEADINGS[tag]) out.push(para(node, { para: { ...ctx.para, heading: HEADINGS[tag] } }));
      else if (tag === 'UL' || tag === 'OL') out.push(...list(node, ctx, 0));
      else if (tag === 'BLOCKQUOTE') {
        // פס בצד שבו הטקסט מתחיל: מימין בעברית, משמאל באנגלית
        const side = isRtl(node.textContent, rtlDefault) ? 'right' : 'left';
        // 11.5: callout (אחרי exportHtml: בלי [!note], עם כותרת מודגשת) מקבל רקע בהיר וטקסט רגיל, כמו בעורך
        const callout = node.classList?.contains('callout');
        const shading = callout && !node.classList.contains('callout-tali-box') ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F3F7FB' } } : {};
        out.push(...blocks(node, { ...ctx, para: { ...ctx.para, ...shading, indent: { start: 360 }, border: { [side]: { style: BorderStyle.SINGLE, size: callout ? 18 : 12, color: callout ? '7AA7D6' : 'B0B8C4', space: 8 } } }, fmt: callout ? ctx.fmt : { ...ctx.fmt, color: '555555' } }));
      } else if (tag === 'PRE') {
        for (const line of node.textContent.replace(/\n$/, '').split('\n')) {
          out.push(new Paragraph({ bidirectional: false, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F4F4F4' }, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: line || ' ', font: { ascii: 'Consolas', hAnsi: 'Consolas', cs: 'Segoe UI' }, size: 19 })] }));
        }
      } else if (tag === 'TABLE') out.push(table(node), new Paragraph({}));
      else if (tag === 'HR') out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 1 } } }));
      else if (tag === 'DIV' && node.classList.contains('embed-note')) {
        const head = node.querySelector('.en-head');
        if (head) out.push(para(head, { fmt: { bold: true, color: '2F6FB0' } }));
        const body = node.querySelector('.en-body');
        if (body) out.push(...blocks(body, { ...ctx, para: { ...ctx.para, indent: { start: 360 } } }));
      } else if (tag === 'DIV' && (node.classList.contains('math-display') || node.classList.contains('math-block') || node.querySelector(':scope > math'))) {
        const m = node.querySelector('math');
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: false, children: withFloats(m ? [mathOrText(m)] : [new TextRun({ text: node.textContent.trim(), font: 'Cambria Math' })]) }));
      } else out.push(...blocks(node, ctx));
    }
    flush();
    return out;
  }

  // רשימות: תבליטים, מספור (כל רשימה ממוספרת מתחילה מ־1) ותיבות סימון (☐/☑ כבר בטקסט)
  function list(ul, ctx, level) {
    const out = [];
    const numbered = ul.tagName === 'OL';
    const task = ul.getAttribute('data-type') === 'taskList';
    const instance = numbered ? ++listInstance : 0;
    for (const li of ul.children) {
      if (li.tagName !== 'LI') continue;
      const numbering = task ? undefined : numbered ? { reference: 'tali-numbers', level, instance } : { reference: 'tali-bullets', level };
      const itemPara = { ...ctx.para, numbering, indent: task ? { start: 360 * (level + 1) } : ctx.para?.indent };
      // תוכן הפריט מול רשימות מקוננות (שנכנסות ברמה הבאה)
      const head = document.createElement('div');
      const nested = [];
      const walk = (parent) => {
        for (const c of parent.childNodes) {
          if (c.nodeType === Node.ELEMENT_NODE && (c.tagName === 'UL' || c.tagName === 'OL')) nested.push(c);
          else if (c.nodeType === Node.ELEMENT_NODE && c.tagName === 'DIV' && c.querySelector(':scope > ul, :scope > ol')) walk(c);
          else head.append(c.cloneNode(true));
        }
      };
      walk(li);
      // תיבת סימון: ☐/☑ נכנס לתחילת הפסקה הראשונה, לא כפסקה נפרדת
      let prefix;
      const box = head.querySelector(':scope > .task-box');
      if (box) { prefix = box.textContent + ' '; box.remove(); }
      const done = li.classList.contains('done');
      out.push(...blocks(head, { ...ctx, para: itemPara, prefix, fmt: done ? { ...ctx.fmt, color: '777777' } : ctx.fmt }));
      for (const n of nested) out.push(...list(n, ctx, Math.min(level + 1, 8)));
    }
    return out;
  }

  function table(t) {
    const rows = [...t.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr')];
    const rtl = isRtl(t.textContent, rtlDefault);
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      visuallyRightToLeft: rtl,
      rows: rows.map((tr) => new TableRow({
        tableHeader: !!tr.querySelector('th') && tr === rows[0],
        children: [...tr.children].filter((c) => c.tagName === 'TD' || c.tagName === 'TH').map((cell) => {
          const fill = hex(cell.style.backgroundColor) || (cell.tagName === 'TH' ? 'EEF2F6' : null);
          // 11.5: יישור עמודה מ־Markdown (data-align) עובר לפסקאות שבתא, ו־para() ממיר אותו לפי הכיוון של כל פסקה.
          // יישור מפורש של פסקה גובר; בלי יישור: מרכז (10.2)
          const al = cell.getAttribute('data-align');
          if (al) for (const cp of cell.querySelectorAll(':scope > p')) if (!cp.style.textAlign) cp.style.textAlign = al;
          const kids = blocks(cell, { fmt: cell.tagName === 'TH' ? { bold: true } : {}, para: { alignment: AlignmentType.CENTER } });
          return new TableCell({
            children: kids.length ? kids : [new Paragraph({})],
            columnSpan: Number(cell.getAttribute('colspan')) || undefined,
            rowSpan: Number(cell.getAttribute('rowspan')) || undefined,
            shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
          });
        }),
      })),
    });
  }

  const body = blocks(root);
  if (pending.length) body.push(new Paragraph({ children: withFloats([]) })); // אובייקט צף אחרי הגוש האחרון
  // כותרת מהשם, אלא אם המסמך כבר פותח בכותרת זהה (כמו בייצוא ל־PDF)
  const first = root.querySelector(':scope > h1');
  if (!(first && first === root.firstElementChild && first.textContent.trim() === String(title).trim())) {
    body.unshift(new Paragraph({ heading: HeadingLevel.TITLE, bidirectional: isRtl(title, rtlDefault), children: [new TextRun({ text: String(title), rightToLeft: RTL_CHAR.test(title) })] }));
  }

  const levels = (fmt) => Array.from({ length: 9 }, (_, level) => ({
    level, format: fmt, alignment: AlignmentType.START,
    text: fmt === LevelFormat.BULLET ? ['•', '◦', '▪'][level % 3] : `%${level + 1}.`,
    style: { paragraph: { indent: { start: 720 * (level + 1), hanging: 360 } } },
  }));
  const doc = new Document({
    creator: 'Tali',
    comments: comments.length ? { children: comments } : undefined,
    title: String(title),
    styles: { default: { document: { run: { font: 'Calibri', size: 22, sizeComplexScript: 22 }, paragraph: { spacing: { after: 120, line: 300 } } } } },
    numbering: { config: [{ reference: 'tali-bullets', levels: levels(LevelFormat.BULLET) }, { reference: 'tali-numbers', levels: levels(LevelFormat.DECIMAL) }] },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 } } }, children: body }],
  });
  return new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer());
}
