// תמונות וקבצים מוטמעים: ![[תמונה.png]] בסגנון אובסידיאן, ו־![תיאור](נתיב) רגיל.
// בקובץ נשמר בדיוק מה שנכתב; רק התצוגה ממירה את הנתיב לקובץ אמיתי בדיסק.
// 11.6: לכל תמונה סרגל "עיצוב תמונה" כמו בוורד (image-format-ui.js): פריסה מול הטקסט, גודל מדויק,
// חיתוך, סיבוב והיפוך, סגנון, טקסט חלופי ואיפוס. איך זה נשמר: image-format.js.
import { Node } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { icon } from './icons.js';
import { renderNoteHtml } from './note-render.js';
import { isMiddleClick, linkOpenOptions } from './link-open.js';
import { parseEmbedTarget, formatEmbedTarget, cleanFormat, layoutFromWrapAttr, wrapAttrFromLayout, parseCropAttr, LAYOUTS } from './image-format.js';
import { renderPicture, pictureToolbar } from './image-format-ui.js';

// ידית בפינת התמונה: גרירה משנה את הרוחב בתצוגה, ובשחרור נשמר הרוחב החדש (onCommit(רוחב, רוחב בהתחלה)).
// בעברית התמונה מיושרת לימין, ולכן הידית בפינה השמאלית התחתונה וגרירה שמאלה מגדילה.
// box: התיבה של התמונה (11.6: .pic-box, שבתוכה התמונה, אולי חתוכה או מסובבת).
function addResizeHandle(dom, box, onCommit) {
  const handle = document.createElement('span');
  handle.className = 'embed-resize';
  handle.dataset.tip = 'גרירה לשינוי הגודל';
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startW = box.getBoundingClientRect().width;
    const rtl = getComputedStyle(dom).direction === 'rtl';
    const max = (dom.closest('.ProseMirror')?.clientWidth || 1400) - 8;
    let width = startW;
    try { handle.setPointerCapture(event.pointerId); } catch { /* המעקב על החלון מספיק */ }
    dom.classList.add('resizing');
    const move = (e) => {
      const dx = (e.clientX - startX) * (rtl ? -1 : 1);
      width = Math.max(60, Math.min(max, startW + dx));
      box.style.width = Math.round(width) + 'px';
    };
    // מעקב על החלון כולו (בשלב הלכידה), כדי שהגרירה תמשיך גם כשהעכבר יוצא מהידית
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      dom.classList.remove('resizing');
      if (Math.abs(width - startW) >= 2) onCommit(width, startW);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  });
  dom.append(handle);
}

// 11.6: פריסה מול הטקסט כמחלקות על התמונה (styles.css): ציפה, או שורה משלה (מימין, במרכז, משמאל)
function applyLayout(dom, layout) {
  for (const l of LAYOUTS) if (l !== 'inline') dom.classList.toggle(l, l === layout);
}
// גודל חדש בגרירה: כשהגובה מפורש (היחס לא נעול) הוא משתנה באותו יחס
const resized = (f, width, startW) => cleanFormat({ ...f, width, height: f.height ? f.height * width / Math.max(1, startW) : null });

// הכפתורים של כל תמונה. info: { box, img, natural(), getPos, editor, get, set, getAlt?, setAlt?, onFree?, path? }
function imageTools(tools, dom, info, options) {
  const pos = () => (typeof info.getPos === 'function' ? info.getPos() : null);
  const extra = [];
  if (info.path && isDrawing(info.path)) extra.push({
    icon: 'editDrawing', label: 'עריכת הציור',
    run: () => options.onEditDrawing(info.path, { rect: info.box.getBoundingClientRect(), pos: pos(), target: info.target?.() }),
  });
  return pictureToolbar(tools, dom, {
    get: info.get, set: info.set, natural: info.natural,
    shown: () => { const r = info.box.getBoundingClientRect(); return { w: r.width, h: r.height }; },
    layout: 'text',
    onFree: info.onFree,
    getAlt: info.getAlt, setAlt: info.setAlt,
    src: () => info.img.currentSrc || info.img.src,
    extra,
  });
}


// גרירת תמונה למקום אחר בדף (7.7). התמונה היא צומת inline בתוך הטקסט, ולכן "מקום אחר" הוא מיקום בטקסט:
// בין מילים, בתחילת פסקה או בין פסקאות (שם נוצרת פסקה חדשה בשבילה). קו מהבהב מראה איפה היא תנחת.
// כך הקובץ נשאר Markdown רגיל (![[...]] / ![](...)), שאובסידיאן קורא, וציפה עם עטיפת טקסט ממשיכה לעבוד.
// גרירה רק אחרי 5px; לחיצה בלי תזוזה בוחרת את התמונה כמו קודם. Esc מבטל. Ctrl+Z מחזיר.
function addMoveDrag(dom, img, editor, getPos) {
  img.style.cursor = 'grab';
  img.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !editor.isEditable) return;
    event.preventDefault();
    event.stopPropagation();
    const view = editor.view;
    const startX = event.clientX, startY = event.clientY;
    let dragging = false, target = null;
    const caret = document.createElement('div');
    caret.className = 'embed-drop-caret';
    const place = (e) => {
      const hit = view.posAtCoords({ left: e.clientX, top: e.clientY });
      const from = getPos();
      if (!hit || typeof from !== 'number') { target = null; caret.hidden = true; return; }
      target = hit.pos;
      if (target === from || target === from + 1) { target = null; caret.hidden = true; return; }
      const c = view.coordsAtPos(target);
      caret.hidden = false;
      caret.style.left = Math.round(c.left - 1) + 'px';
      caret.style.top = Math.round(c.top) + 'px';
      caret.style.height = Math.max(18, Math.round(c.bottom - c.top)) + 'px';
    };
    const move = (e) => {
      if (!dragging) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 5) return;
        dragging = true;
        dom.classList.add('moving');
        document.body.classList.add('embed-dragging');
        document.body.append(caret);
      }
      e.preventDefault();
      place(e);
    };
    const finish = (commit) => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('keydown', key, true);
      caret.remove();
      dom.classList.remove('moving');
      document.body.classList.remove('embed-dragging');
      const from = getPos();
      if (typeof from !== 'number') return;
      if (!dragging) { // לחיצה רגילה: בחירת התמונה
        try { editor.commands.setNodeSelection(from); } catch { /* בלי בחירה */ }
        view.focus();
        return;
      }
      if (!commit || target == null) return;
      moveNodeTo(editor, from, target);
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('keydown', key, true);
  });
}

// מעביר את הצומת שב־from (inline, גודל 1) למיקום to במסמך, בפעולה אחת (Ctrl+Z אחד מחזיר).
// מיקום שאינו בתוך טקסט (בין פסקאות, בתחילת רשימה) מקבל פסקה חדשה שמכילה רק את התמונה.
export function moveNodeTo(editor, from, to) {
  editor.commands.command(({ tr, state, dispatch }) => {
    const node = state.doc.nodeAt(from);
    if (!node) return false;
    try {
      tr.delete(from, from + node.nodeSize);
      insertInline(tr, state.schema, tr.mapping.map(to), node);
    } catch { return false; } // מיקום שאי אפשר לשים בו תמונה (למשל בין תאי טבלה): התמונה נשארת במקומה
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  });
}

// צומת inline במיקום: בתוך טקסט כמו שהוא, ובין גושים בפסקה חדשה משלו
function insertInline(tr, schema, at, node) {
  if (tr.doc.resolve(at).parent.inlineContent) tr.insert(at, node);
  else tr.insert(at, schema.nodes.paragraph.create(null, node));
}

// 7.8: מחזיר תמונה חופשית (משכבת הדף) לתוך הטקסט, במקום הקרוב לנקודה (x, y) על המסך.
// ref 'embed': ![[src|רוחב]]; ref 'md': ![alt](src) עם הרוחב. מחזיר false אם לא הצליח (התמונה נשארת חופשית).
// 11.6: גם העיצוב (סיבוב, היפוך, חיתוך, סגנון) עובר עם התמונה.
export function returnImageToText(editor, { ref, src, alt, width, rotate, flipH, flipV, crop, styles }, x, y) {
  const { schema } = editor.state;
  const w = Math.max(60, Math.min(1400, Math.round(width || 300)));
  const format = cleanFormat({ width: w, rotate, flipH, flipV, crop, styles });
  const node = ref === 'md'
    ? schema.nodes.image?.create({ src, alt: alt || '', ...imageAttrsFromFormat(format) })
    : schema.nodes.embed?.create({ target: formatEmbedTarget(src, format) });
  if (!node) return false;
  const hit = editor.view.posAtCoords({ left: x, top: y });
  const at = hit ? hit.pos : editor.state.doc.content.size;
  let ok = false;
  editor.commands.command(({ tr, dispatch }) => {
    try { insertInline(tr, schema, at, node); } catch {
      try { insertInline(tr, schema, tr.doc.content.size, node); } catch { return false; }
    }
    if (dispatch) dispatch(tr);
    ok = true;
    return true;
  });
  return ok;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

// נתיב בדיסק -> כתובת file:// שהדפדפן מבין (כולל # ורווחים בשם).
// תמונה שנשמרה מחדש (ציור שנערך) מקבלת מספר גרסה, כדי שהדפדפן לא יציג את הישנה מהזיכרון.
const versions = new Map();
export function fileUrl(p) {
  const parts = p.replace(/\\/g, '/').split('/');
  const url = 'file:///' + parts.map((s, i) => (i === 0 && /^[a-z]:$/i.test(s) ? s : encodeURIComponent(s))).join('/');
  return versions.has(p) ? `${url}?v=${versions.get(p)}` : url;
}
// אחרי שמירה מחדש של תמונה: מרעננים את כל המופעים שלה בדף
export function bumpImage(p) {
  const before = fileUrl(p).split('?')[0];
  versions.set(p, Date.now());
  for (const img of document.querySelectorAll('img')) {
    if (img.src.split('?')[0] === before) img.src = fileUrl(p);
  }
}
export const isDrawing = (name) => /^Drawing\b/i.test(name.split(/[\\/]/).pop());

function setupEmbedMarkdownIt(md) {
  if (md.inline.ruler.__rules__.some((r) => r.name === 'embed')) return;
  md.inline.ruler.before('link', 'embed', (state, silent) => {
    const src = state.src;
    const start = state.pos;
    if (!src.startsWith('![[', start)) return false;
    const end = src.indexOf(']]', start + 3);
    if (end < 0) return false;
    const inner = src.slice(start + 3, end);
    if (!inner.trim() || /[\[\]\n]/.test(inner)) return false;
    if (!silent) state.push('embed', '', 0).meta = { target: inner };
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.embed = (tokens, i) => `<span data-embed="${md.utils.escapeHtml(tokens[i].meta.target)}"></span>`;
}

// ![[...]]: אם זו תמונה היא מוצגת, אחרת מוצג שבב שאפשר ללחוץ עליו
export const Embed = Node.create({
  name: 'embed',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      resolve: () => null,  // target -> נתיב בדיסק או null
      onOpen: () => {},     // (target) => void
      read: null,           // (path) => Promise<string> — תוכן הערה מוטמעת
      onEditDrawing: () => {}, // (path) => void — לחיצה כפולה על ציור
      onFree: null,            // 7.8: ({ ref, src, width, rect, pos }) => void — "חופשי": מעביר לשכבת הדף
    };
  },

  addAttributes() {
    return { target: { default: '', parseHTML: (el) => el.getAttribute('data-embed') } };
  },
  parseHTML() { return [{ tag: 'span[data-embed]' }]; },
  renderHTML({ node }) { return ['span', { 'data-embed': node.attrs.target }]; },
  renderText({ node }) { return `![[${node.attrs.target}]]`; },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) { state.write(`![[${node.attrs.target}]]`); },
        parse: { setup(md) { setupEmbedMarkdownIt(md); } },
      },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      // ![[image.png|300|wrap-left]]: width stays compatible with Obsidian (also 300x200).
      // The layout and the other picture-format words are Tali-specific (image-format.js).
      let current = node;
      const dom = document.createElement('span');
      dom.className = 'embed';
      const initial = { name: current.attrs.target.split('|')[0] };
      const path = this.options.resolve(initial.name);
      if (path && IMAGE_EXT.test(path)) {
        dom.classList.add('embed-image');
        dom.contentEditable = 'false';
        const box = document.createElement('span');
        const img = document.createElement('img');
        img.src = fileUrl(path);
        img.alt = initial.name;
        img.draggable = false;
        box.append(img);
        let natural = null;
        const tools = document.createElement('span');
        tools.className = 'embed-tools';
        const setTarget = (target) => {
          const pos = typeof getPos === 'function' ? getPos() : null;
          if (typeof pos === 'number' && target !== current.attrs.target) editor.commands.command(({ tr, dispatch }) => {
            if (dispatch) dispatch(tr.setNodeMarkup(pos, undefined, { ...current.attrs, target }));
            return true;
          });
        };
        const parsed = () => parseEmbedTarget(current.attrs.target);
        const setFormat = (format) => { const { name, extra } = parsed(); setTarget(formatEmbedTarget(name, format, extra)); };
        const toolbar = imageTools(tools, dom, {
          box, img, getPos, path,
          natural: () => natural,
          get: () => parsed().format,
          set: setFormat,
          target: () => current.attrs.target,
          onFree: this.options.onFree && (() => {
            const pos = typeof getPos === 'function' ? getPos() : null;
            if (typeof pos !== 'number') return;
            const rect = box.getBoundingClientRect();
            const f = parsed().format;
            this.options.onFree({ ref: 'embed', src: parsed().name, width: rect.width, rect, pos, format: f });
          }),
        }, this.options);
        dom.append(box, tools);
        addResizeHandle(dom, box, (w, startW) => setFormat(resized(parsed().format, w, startW)));
        addMoveDrag(dom, img, editor, getPos);
        const render = () => {
          const { format } = parsed();
          renderPicture(box, img, format, natural);
          applyLayout(dom, format.layout);
          dom.classList.toggle('drawing', isDrawing(path));
          toolbar.refresh();
        };
        img.addEventListener('load', () => { natural = { w: img.naturalWidth, h: img.naturalHeight }; render(); });
        render();
        if (isDrawing(path)) {
          dom.title = 'לחיצה כפולה לעריכת הציור';
          img.addEventListener('dblclick', (event) => {
            event.preventDefault();
            const pos = typeof getPos === 'function' ? getPos() : null;
            this.options.onEditDrawing(path, { rect: box.getBoundingClientRect(), pos, target: current.attrs.target });
          });
        }
        return { dom, update: (updated) => {
          if (updated.type.name !== 'embed' || updated.attrs.target.split('|')[0] !== initial.name) return false;
          current = updated; render(); return true;
        }, stopEvent: (event) => !!event.target.closest?.('.embed-tools, .embed-resize'), ignoreMutation: () => true };
      }
      // ![[הערה]] או ![[הערה#כותרת]]: התוכן של ההערה האחרת, לקריאה בלבד. בקובץ נשאר ![[...]].
      if (path && /\.md$/i.test(path) && this.options.read) {
        const heading = initial.name.includes('#') ? initial.name.slice(initial.name.indexOf('#') + 1) : '';
        const shown = initial.name.split('#')[0].split('/').pop() + (heading ? ' › ' + heading : '');
        dom.classList.add('embed-note');
        dom.contentEditable = 'false';
        dom.dataset.target = initial.name;
        const head = document.createElement('span');
        head.className = 'en-head';
        head.innerHTML = `${icon('file', 15)}<span class="en-name"></span><span class="en-open">פתיחה</span>`;
        head.querySelector('.en-name').textContent = shown;
        const body = document.createElement('span');
        body.className = 'en-body';
        body.textContent = 'טוען…';
        dom.append(head, body);
        this.options.read(path).then((text) => {
          body.innerHTML = renderNoteHtml(text, { resolve: this.options.resolve, fileUrl, heading, limit: 6000 });
        }).catch(() => { body.textContent = 'לא ניתן לקרוא את המסמך'; });
        dom.addEventListener('mousedown', (event) => { if (event.button === 0) event.preventDefault(); });
        dom.addEventListener('click', (event) => {
          const link = event.target.closest('.np-link');
          const opts = linkOpenOptions(event);
          if (link) this.options.onOpen(link.dataset.target, opts);
          else if (event.target.closest('.en-head')) this.options.onOpen(initial.name, opts);
        });
        dom.addEventListener('auxclick', (event) => {
          if (!isMiddleClick(event)) return;
          const link = event.target.closest('.np-link');
          const target = link?.dataset.target || (event.target.closest('.en-head') ? initial.name : null);
          if (target) { event.preventDefault(); this.options.onOpen(target, linkOpenOptions(event)); }
        });
        return { dom, stopEvent: () => true, ignoreMutation: () => true };
      }
      dom.classList.add('embed-chip');
      if (!path) dom.classList.add('unresolved');
      dom.innerHTML = `${icon(path ? 'paperclip' : 'warning', 14)}<span></span>`;
      dom.querySelector('span').textContent = initial.name;
      dom.title = path ? 'לחיצה לפתיחה' : 'הקובץ לא נמצא';
      dom.addEventListener('mousedown', (event) => { if (event.button === 0) event.preventDefault(); });
      dom.addEventListener('click', (event) => this.options.onOpen(initial.name, linkOpenOptions(event)));
      dom.addEventListener('auxclick', (event) => {
        if (isMiddleClick(event)) { event.preventDefault(); this.options.onOpen(initial.name, linkOpenOptions(event)); }
      });
      return { dom };
    };
  }
});

// ![תיאור](נתיב): הנתיב נשמר כמו שהוא, ומוצג יחסית לתיקיית ההערה (ואם לא נמצא, לתיקייה הראשית)
// Normal Markdown images remain ordinary ![alt](path) until explicitly formatted.
// After formatting, they are saved as a standard HTML <img> tag with Tali-specific data
// attributes. This is valid Markdown HTML, not a file URL or renamed attachment.
// 11.6: wrap holds the raw data-tali-wrap value (none, left, right, center, break-left, break-right);
// height, rotate, flip ('h', 'v', 'hv'), crop ('t,r,b,l' in %) and imgStyle ('border shadow round').
export function formatFromImageAttrs(a) {
  return cleanFormat({
    width: a.width, height: a.height, layout: layoutFromWrapAttr(a.wrap), rotate: a.rotate,
    flipH: /h/.test(a.flip || ''), flipV: /v/.test(a.flip || ''), crop: parseCropAttr(a.crop),
    styles: String(a.imgStyle || '').split(/\s+/),
  });
}
export function imageAttrsFromFormat(f) {
  return {
    width: f.width || null, height: f.height || null,
    wrap: wrapAttrFromLayout(f.layout) || 'none',
    rotate: f.rotate || null,
    flip: (f.flipH ? 'h' : '') + (f.flipV ? 'v' : '') || null,
    crop: f.crop ? f.crop.join(',') : null,
    imgStyle: f.styles.length ? f.styles.join(' ') : null,
  };
}
const intAttr = (name) => ({
  default: null,
  parseHTML: (el) => {
    const n = Number.parseInt(el.getAttribute(name) || '', 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  },
});
const textAttr = (name, ok) => ({
  default: null,
  parseHTML: (el) => { const v = el.getAttribute(name); return v && ok(v) ? v : null; },
});
export const LocalImage = Image.extend({
  addOptions() {
    return { ...this.parent?.(), inline: true, localSrc: () => [], onFree: null };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { ...intAttr('width'), renderHTML: (a) => a.width ? { width: String(a.width) } : {} },
      height: { ...intAttr('height'), renderHTML: (a) => a.height ? { height: String(a.height) } : {} },
      wrap: {
        default: 'none',
        parseHTML: (el) => wrapAttrFromLayout(layoutFromWrapAttr(el.getAttribute('data-tali-wrap'))) || 'none',
        renderHTML: (a) => a.wrap && a.wrap !== 'none' ? { 'data-tali-wrap': a.wrap } : {},
      },
      rotate: {
        default: null,
        parseHTML: (el) => { const n = Number(el.getAttribute('data-tali-rotate')); return [90, 180, 270].includes(n) ? n : null; },
        renderHTML: (a) => a.rotate ? { 'data-tali-rotate': String(a.rotate) } : {},
      },
      flip: { ...textAttr('data-tali-flip', (v) => /^(h|v|hv)$/.test(v)), renderHTML: (a) => a.flip ? { 'data-tali-flip': a.flip } : {} },
      crop: { ...textAttr('data-tali-crop', (v) => !!parseCropAttr(v)), renderHTML: (a) => a.crop ? { 'data-tali-crop': a.crop } : {} },
      imgStyle: { ...textAttr('data-tali-style', (v) => /^[a-z ]{1,40}$/.test(v)), renderHTML: (a) => a.imgStyle ? { 'data-tali-style': a.imgStyle } : {} },
    };
  },
  addStorage() {
    const escapeAttr = (value) => String(value || '').replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return {
      markdown: {
        serialize(state, node) {
          const a = node.attrs;
          const styled = a.width || a.height || (a.wrap && a.wrap !== 'none') || a.rotate || a.flip || a.crop || a.imgStyle;
          if (styled) {
            const attrs = ' src="' + escapeAttr(a.src) + '" alt="' + escapeAttr(a.alt) +
              '"' + (a.title ? ' title="' + escapeAttr(a.title) + '"' : '') +
              (a.width ? ' width="' + Math.max(20, Math.round(a.width)) + '"' : '') +
              (a.width && a.height ? ' height="' + Math.max(20, Math.round(a.height)) + '"' : '') +
              ' data-tali-image="1"' +
              (a.wrap && a.wrap !== 'none' ? ' data-tali-wrap="' + a.wrap + '"' : '') +
              (a.rotate ? ' data-tali-rotate="' + a.rotate + '"' : '') +
              (a.flip ? ' data-tali-flip="' + a.flip + '"' : '') +
              (a.crop ? ' data-tali-crop="' + escapeAttr(a.crop) + '"' : '') +
              (a.imgStyle ? ' data-tali-style="' + escapeAttr(a.imgStyle) + '"' : '');
            state.write('<img' + attrs + '>');
          } else {
            const alt = String(a.alt || '').replace(/([\\\[\]])/g, '\\$1');
            const src = String(a.src || '').replace(/([()])/g, '\\$1').replace(/ /g, '%20');
            const title = a.title ? ' "' + String(a.title).replace(/"/g, '\\"') + '"' : '';
            state.write('![' + alt + '](' + src + title + ')');
          }
        },
        parse: {},
      },
    };
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node;
      const source = node.attrs.src;
      const dom = document.createElement('span');
      dom.className = 'embed embed-image native-image';
      dom.contentEditable = 'false';
      const box = document.createElement('span');
      const img = document.createElement('img');
      img.draggable = false;
      box.append(img);
      let natural = null;
      const candidates = this.options.localSrc(source || '');
      let i = 0;
      img.src = candidates[0] || '';
      img.addEventListener('error', () => {
        if (++i < candidates.length) img.src = candidates[i];
        else img.classList.add('broken');
      });
      const tools = document.createElement('span');
      tools.className = 'embed-tools';
      const setAttrs = (change) => {
        const at = typeof getPos === 'function' ? getPos() : null;
        if (typeof at !== 'number') return;
        editor.commands.command(({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setNodeMarkup(at, undefined, { ...current.attrs, ...change }));
          return true;
        });
      };
      const get = () => formatFromImageAttrs(current.attrs);
      const set = (f) => setAttrs(imageAttrsFromFormat(cleanFormat(f)));
      const onFree = this.options.onFree;
      const toolbar = imageTools(tools, dom, {
        box, img, getPos, natural: () => natural, get, set,
        getAlt: () => current.attrs.alt || '', setAlt: (alt) => setAttrs({ alt }),
        onFree: onFree && (() => {
          const pos = typeof getPos === 'function' ? getPos() : null;
          if (typeof pos !== 'number') return;
          const rect = box.getBoundingClientRect();
          onFree({ ref: 'md', src: current.attrs.src, alt: current.attrs.alt || '', width: rect.width, rect, pos, format: get() });
        }),
      }, this.options);
      dom.append(box, tools);
      addResizeHandle(dom, box, (w, startW) => set(resized(get(), w, startW)));
      addMoveDrag(dom, img, editor, getPos);
      const render = () => {
        const a = current.attrs;
        img.alt = a.alt || '';
        img.title = a.title || '';
        const f = get();
        renderPicture(box, img, f, natural);
        applyLayout(dom, f.layout);
        toolbar.refresh();
      };
      img.addEventListener('load', () => { natural = { w: img.naturalWidth, h: img.naturalHeight }; render(); });
      render();
      return {
        dom,
        update(updated) {
          if (updated.type.name !== current.type.name || updated.attrs.src !== source) return false;
          current = updated; render(); return true;
        },
        stopEvent: (event) => !!event.target.closest?.('.embed-tools, .embed-resize'),
        ignoreMutation: () => true,
      };
    };
  },
});
