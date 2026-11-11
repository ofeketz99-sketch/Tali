// ייצוא ההערה הפתוחה ל־PDF או ל־Word. התוכן נלקח מהתצוגה המעוצבת של העורך (כך נשמרים עיצוב,
// טבלאות, תמונות ונוסחאות), בלי פקדי העריכה. main.js מטמיע את התמונות ושומר את הקובץ.
const REMOVE = '.embed-tools, .embed-resize, .table-bar, .math-src, .en-open, .ProseMirror-separator, .ProseMirror-trailingBreak, .lk-remove, [data-tip-only]';

export function exportHtml(proseMirrorElement) {
  const root = proseMirrorElement.cloneNode(true);
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
