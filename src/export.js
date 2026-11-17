// ייצוא ההערה הפתוחה ל־PDF או ל־Word. התוכן נלקח מהתצוגה המעוצבת של העורך (כך נשמרים עיצוב,
// טבלאות, תמונות ונוסחאות), בלי פקדי העריכה. main.js מטמיע את התמונות ושומר את הקובץ.
const REMOVE = '.embed-tools, .embed-resize, .table-bar, .math-src, .en-open, .ProseMirror-separator, .ProseMirror-trailingBreak, .lk-remove, [data-tip-only]';

// floats: מ־collectFloats (שכבת הדף). כל אחד נכנס לפני הגוש העליון שלידו.
export function exportHtml(proseMirrorElement, floats = []) {
  const root = proseMirrorElement.cloneNode(true);
  // העוגן נקבע לפי המסמך החי (שם יש מיקומים), והגושים העליונים באותו סדר גם בעותק
  const tops = [...root.children];
  for (const f of floats) {
    const marker = document.createElement('div');
    marker.className = 'tali-float tali-float-' + f.info.kind;
    marker.setAttribute('data-tali-float', JSON.stringify(f.info));
    marker.style.cssText = `position:relative;height:0;margin:0;overflow:visible`;
    // ב־PDF רוחב הטקסט שונה מהעורך: מיקום ורוחב באחוזים מרוחב הטקסט
    const pct = (v) => `${(100 * v / (f.info.textWidth || 1)).toFixed(2)}%`;
    if (f.src) {
      const img = document.createElement('img');
      img.setAttribute('src', f.src);
      img.style.cssText = `position:absolute;left:${pct(f.info.dx)};top:${f.info.dy}px;width:${pct(f.info.w)};height:auto;max-width:none`;
      marker.append(img);
    } else if (f.info.kind === 'textbox') {
      const box = document.createElement('div');
      box.dir = 'auto';
      box.textContent = f.info.text;
      box.style.cssText = `position:absolute;left:${pct(f.info.dx)};top:${f.info.dy}px;width:${pct(f.info.w)};min-height:${f.info.h}px;white-space:pre-wrap;border:1px solid #c9d3de;border-radius:6px;padding:4px 6px;box-sizing:border-box;background:#fff`;
      marker.append(box);
    }
    const anchor = tops[f.index];
    if (anchor) anchor.before(marker); else root.append(marker);
  }
  for (const el of root.querySelectorAll(REMOVE)) el.remove();
  // נוסחאות: MathML (Chromium ו־Word מציגים אותו בלי הגופנים של KaTeX)
  for (const k of root.querySelectorAll('.katex')) {
    const math = k.querySelector('math');
    if (math) k.replaceWith(math.cloneNode(true)); else k.remove();
  }
  for (const k of root.querySelectorAll('.katex-display')) k.classList.add('math-display');
  // תיבות סימון: סימן טקסט, כדי שיודפסו ויופיעו גם ב־Word
  for (const li of root.querySelectorAll('ul[data-type="taskList"] > li')) {
    const done = li.getAttribute('data-checked') === 'true';
    li.querySelector(':scope > label')?.replaceWith(Object.assign(document.createElement('span'), { className: 'task-box', textContent: done ? '☑' : '☐' }));
    li.classList.add('task-item');
    if (done) li.classList.add('done');
  }
  // הערה מוטמעת: בעורך היא span בתוך פסקה. בקובץ המיוצא היא בלוק עצמאי, אחרת הדפדפן שובר אותה.
  for (const e of root.querySelectorAll('.embed-note')) {
    const box = document.createElement('div');
    box.className = 'embed-note';
    const head = document.createElement('div');
    head.className = 'en-head';
    head.textContent = e.querySelector('.en-name')?.textContent || '';
    const body = document.createElement('div');
    body.className = 'en-body';
    body.append(...(e.querySelector('.en-body')?.childNodes || []));
    box.append(head, body);
    const p = e.parentElement;
    if (p?.tagName === 'P') {
      e.remove();
      p.after(box);
      if (!p.textContent.trim() && !p.querySelector('img')) p.remove();
    } else e.replaceWith(box);
  }
  for (const el of root.querySelectorAll('[contenteditable], [draggable], [data-placeholder]')) {
    el.removeAttribute('contenteditable'); el.removeAttribute('draggable'); el.removeAttribute('data-placeholder');
  }
  for (const img of root.querySelectorAll('img')) img.removeAttribute('title');
  return root.innerHTML;
}

export const EXPORT_CSS = `
@page { size: A4; margin: 2cm; }
body { font-family: Calibri, "Segoe UI", Arial, sans-serif; font-size: 12pt; line-height: 1.6; color: #1f2328; direction: rtl; unicode-bidi: plaintext; }
.doc-title { font-size: 22pt; margin: 0 0 14pt; padding-bottom: 6pt; border-bottom: 2px solid #c9dbf0; }
h1 { font-size: 18pt; } h2 { font-size: 15pt; } h3 { font-size: 13pt; }
h1, h2, h3, h4 { color: #1d3d5c; margin: 16pt 0 6pt; page-break-after: avoid; }
p { margin: 0 0 8pt; }
img { max-width: 100%; height: auto; }
.embed-image, .embed { display: inline-block; max-width: 100%; }
.wrap-left { float: left; margin: 0 0 8pt 12pt; } .wrap-right { float: right; margin: 0 12pt 8pt 0; }
table { border-collapse: collapse; margin: 8pt 0; width: 100%; page-break-inside: avoid; }
td, th { border: 1px solid #b8c4d0; padding: 4pt 7pt; vertical-align: top; }
th { background: #eef3f8; }
blockquote { margin: 8pt 0; padding: 4pt 12pt; border-inline-start: 3px solid #9fbfe6; background: #f5f8fc; color: #3a4a5a; }
code { font-family: Consolas, monospace; background: #f1f3f5; padding: 0 3pt; border-radius: 3pt; }
pre { font-family: Consolas, monospace; background: #f1f3f5; padding: 8pt; border-radius: 4pt; direction: ltr; white-space: pre-wrap; }
ul[data-type="taskList"] { list-style: none; padding-inline-start: 4pt; }
li.task-item { display: flex; gap: 6pt; align-items: baseline; } li.task-item > div { flex: 1; } li.task-item p { margin: 0 0 3pt; }
li.done > div > p { color: #6b7785; text-decoration: line-through; }
.task-box { font-size: 13pt; line-height: 1; flex: none; }
.wikilink, .tag { color: #2d6bb0; }
.embed-note { display: block; border: 1px solid #d5dfea; border-radius: 6pt; padding: 6pt 10pt; margin: 8pt 0; }
.en-head { display: block; font-weight: 600; color: #1d3d5c; margin-bottom: 4pt; }
.math-display { display: block; text-align: center; margin: 8pt 0; }
math[display="block"] { display: block math; margin: 8pt auto; text-align: center; }
math { direction: ltr; }
hr { border: none; border-top: 1px solid #c8d2dc; margin: 12pt 0; }
.ic, svg.ic { display: none; }
`;

// ===== שכבת הדף (9.9): תמונות חופשיות (גם תמונות שהודבקו), שרטוטים, תיבות טקסט והערות שוליים =====
// items: pageOverlay.getItems(). toScreen: קואורדינטות השכבה ← פיקסלים מפינת #page.
// resolveImage(item) -> כתובות לנסות. shapes: pageOverlay.exportShapes() (SVG של כל השרטוטים יחד).
// מחזיר [{ index, info: { kind, dx, dy, w, h, text?, quote?, textWidth }, src? }]: index הוא הגוש העליון
// בעורך שלידו האובייקט, ו־dx/dy המרחק מתחילת הגוש ומהקצה השמאלי של אזור הטקסט.
export async function collectFloats({ proseMirrorElement: pm, pageElement, items = [], toScreen = (v) => v, resolveImage = () => [], shapes = null }) {
  const pmRect = pm.getBoundingClientRect();
  const pageRect = pageElement.getBoundingClientRect();
  const tops = [...pm.children].map((el) => el.getBoundingClientRect().top);
  const anchorOf = (top) => {
    let index = 0;
    for (let i = 0; i < tops.length; i++) if (tops[i] <= top + 1) index = i;
    return { index, dy: top - (tops[index] ?? pmRect.top) };
  };
  const out = [];
  const place = (x, y, w, h) => {
    const left = pageRect.left + toScreen(x), top = pageRect.top + toScreen(y);
    const a = anchorOf(top);
    return { index: a.index, info: { dx: Math.round(left - pmRect.left), dy: Math.round(a.dy), w: Math.round(toScreen(w)), h: Math.round(toScreen(h)), textWidth: Math.round(pmRect.width) } };
  };
  for (const o of items) {
    if (o.kind === 'image') {
      const src = await firstLoadable(resolveImage(o) || []);
      if (!src) continue;
      const f = place(o.x, o.y, o.width, o.height);
      f.info.kind = 'image';
      f.src = src;
      out.push(f);
    } else if (o.kind === 'textbox' && String(o.text || '').trim()) {
      const f = place(o.x, o.y, o.width, o.height);
      Object.assign(f.info, { kind: 'textbox', text: o.text });
      out.push(f);
    } else if (o.kind === 'comment' && (String(o.text || '').trim() || o.quote)) {
      const f = place(o.x, o.y, o.width || 0, o.height || 0);
      Object.assign(f.info, { kind: 'comment', text: o.text || '', quote: o.quote || '' });
      out.push(f);
    }
  }
  if (shapes?.svg) {
    const src = await svgToPng(shapes.svg, shapes.w, shapes.h);
    if (src) {
      const f = place(shapes.x, shapes.y, shapes.w, shapes.h);
      f.info.kind = 'image';
      f.src = src;
      out.push(f);
    }
  }
  return out;
}

// הכתובת הראשונה שנטענת. blob: (תמונה שהודבקה עכשיו ועוד לא נשמרה) עוברת ל־data:, כי main.js מטמיע רק file:
async function firstLoadable(urls) {
  for (const url of urls) {
    if (!url) continue;
    try {
      if (url.startsWith('blob:') || url.startsWith('data:')) {
        if (url.startsWith('data:')) return url;
        const blob = await (await fetch(url)).blob();
        return await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
      }
      const img = new Image();
      img.src = url;
      await img.decode();
      return url;
    } catch { /* הבאה ברשימה */ }
  }
  return null;
}

async function svgToPng(svg, w, h) {
  try {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement('canvas');
    const k = 2; // חד גם בהגדלה ב־Word
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } catch { return null; }
}
