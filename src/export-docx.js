// ייצוא ל־Word כקובץ .docx אמיתי (ספריית docx). הקלט: ה־HTML של exportHtml אחרי שהתמונות הוטמעו
// כ־data URI (inline-images ב־main.js). כל פסקה מקבלת כיוון לפי האות החזקה הראשונה שלה, כך שעברית
// נשארת מימין לשמאל ב־Word, ואנגלית בתוכה לא מתהפכת.
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun,
  ExternalHyperlink, AlignmentType, BorderStyle, ShadingType, LevelFormat,
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
async function imageData(img) {
  const src = img.getAttribute('src') || '';
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

// נוסחה (MathML מ־KaTeX) כטקסט: חזקה ואינדקס כ־superscript/subscript, שבר כ־(א)/(ב), שורש כ־√(…).
// בלי המקור ב־TeX (annotation). זה לא אובייקט נוסחה של Word, אבל נקרא נכון.
function mathRuns(node, fmt0) {
  const { rtlPara, ...f } = fmt0; // נוסחה תמיד משמאל לימין
  const out = [];
  const walk = (n, fmt) => {
    if (n.nodeType === Node.TEXT_NODE) { if (n.textContent.trim()) out.push(new TextRun({ text: n.textContent.trim(), ...fmt })); return; }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const t = n.tagName.toLowerCase();
    const kids = [...n.children];
    if (t === 'annotation' || t === 'annotation-xml') return;
    if (t === 'mi' && n.textContent.length === 1) { out.push(new TextRun({ text: n.textContent, ...fmt, italics: true })); return; }
    if ((t === 'msup' || t === 'msub') && kids.length >= 2) {
      walk(kids[0], fmt);
      walk(kids[1], { ...fmt, [t === 'msup' ? 'superScript' : 'subScript']: true });
      return;
    }
    if (t === 'msubsup' && kids.length >= 3) { walk(kids[0], fmt); walk(kids[1], { ...fmt, subScript: true }); walk(kids[2], { ...fmt, superScript: true }); return; }
    if (t === 'mfrac' && kids.length >= 2) {
      out.push(new TextRun({ text: '(', ...fmt })); walk(kids[0], fmt); out.push(new TextRun({ text: ')/(', ...fmt })); walk(kids[1], fmt); out.push(new TextRun({ text: ')', ...fmt }));
      return;
    }
    if (t === 'msqrt') { out.push(new TextRun({ text: '√(', ...fmt })); kids.forEach((k) => walk(k, fmt)); out.push(new TextRun({ text: ')', ...fmt })); return; }
    for (const c of n.childNodes) walk(c, fmt);
  };
  walk(node, f);
  return out;
}

export async function buildDocx({ title, html, rtlDefault = true }) {
  const root = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  // התמונות קודם (אסינכרוני), כדי שהמעבר על המסמך יהיה סינכרוני
  const images = new Map();
  for (const img of root.querySelectorAll('img')) images.set(img, await imageData(img));

  let listInstance = 0;

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
      const im = images.get(node);
      if (im) out.push(new ImageRun(im));
      return out;
    }
    // MathML שומר על שם תגית באותיות קטנות (math), בניגוד לתגיות HTML
    if (node.localName === 'math') { out.push(...mathRuns(node, { ...f, font: 'Cambria Math' })); return out; }
    if (tag === 'STRONG' || tag === 'B') f.bold = true;
    if (tag === 'EM' || tag === 'I') f.italics = true;
    if (tag === 'U') f.underline = {};
    if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') f.strike = true;
    if (tag === 'SUB') f.subScript = true;
    if (tag === 'SUP') f.superScript = true;
    if (tag === 'CODE') { f.font = 'Consolas'; f.shading = { type: ShadingType.CLEAR, color: 'auto', fill: 'F0F0F0' }; }
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
    const runs = opts.prefix ? [new TextRun({ text: opts.prefix, rightToLeft: rtl })] : [];
    for (const c of node.childNodes) inline(c, { ...opts.fmt, rtlPara: rtl }, runs);
    const ta = (node.style?.textAlign || node.getAttribute?.('align') || '').toLowerCase();
    const alignment = ta === 'center' ? AlignmentType.CENTER : ta === 'justify' ? AlignmentType.BOTH
      : ta === 'right' ? (rtl ? AlignmentType.START : AlignmentType.END)
      : ta === 'left' ? (rtl ? AlignmentType.END : AlignmentType.START) : undefined;
    return new Paragraph({ children: runs, bidirectional: rtl, alignment, ...opts.para });
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
      if (tag === 'P') { out.push(para(node, { para: ctx.para, prefix: ctx.prefix, fmt: ctx.fmt })); ctx = { ...ctx, prefix: undefined }; }
      else if (HEADINGS[tag]) out.push(para(node, { para: { ...ctx.para, heading: HEADINGS[tag] } }));
      else if (tag === 'UL' || tag === 'OL') out.push(...list(node, ctx, 0));
      else if (tag === 'BLOCKQUOTE') {
        // פס בצד שבו הטקסט מתחיל: מימין בעברית, משמאל באנגלית
        const side = isRtl(node.textContent, rtlDefault) ? 'right' : 'left';
        out.push(...blocks(node, { ...ctx, para: { ...ctx.para, indent: { start: 360 }, border: { [side]: { style: BorderStyle.SINGLE, size: 12, color: 'B0B8C4', space: 8 } } }, fmt: { ...ctx.fmt, color: '555555' } }));
      } else if (tag === 'PRE') {
        for (const line of node.textContent.replace(/\n$/, '').split('\n')) {
          out.push(new Paragraph({ bidirectional: false, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F4F4F4' }, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 19 })] }));
        }
      } else if (tag === 'TABLE') out.push(table(node), new Paragraph({}));
      else if (tag === 'HR') out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 1 } } }));
      else if (tag === 'DIV' && node.classList.contains('embed-note')) {
        const head = node.querySelector('.en-head');
        if (head) out.push(para(head, { fmt: { bold: true, color: '2F6FB0' } }));
        const body = node.querySelector('.en-body');
        if (body) out.push(...blocks(body, { ...ctx, para: { ...ctx.para, indent: { start: 360 } } }));
      } else if (tag === 'DIV' && (node.classList.contains('math-display') || node.querySelector(':scope > math'))) {
        const m = node.querySelector('math');
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: false, children: m ? mathRuns(m, { font: 'Cambria Math' }) : [new TextRun({ text: node.textContent.trim(), font: 'Cambria Math' })] }));
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
          const kids = blocks(cell, { fmt: cell.tagName === 'TH' ? { bold: true } : {} });
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
    title: String(title),
    styles: { default: { document: { run: { font: 'Calibri', size: 22, sizeComplexScript: 22 }, paragraph: { spacing: { after: 120, line: 300 } } } } },
    numbering: { config: [{ reference: 'tali-bullets', levels: levels(LevelFormat.BULLET) }, { reference: 'tali-numbers', levels: levels(LevelFormat.DECIMAL) }] },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 } } }, children: body }],
  });
  return new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer());
}
