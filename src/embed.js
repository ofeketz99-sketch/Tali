// תמונות וקבצים מוטמעים: ![[תמונה.png]] בסגנון אובסידיאן, ו־![תיאור](נתיב) רגיל.
// בקובץ נשמר בדיוק מה שנכתב; רק התצוגה ממירה את הנתיב לקובץ אמיתי בדיסק.
import { Node } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { icon } from './icons.js';
import { renderNoteHtml } from './note-render.js';

// ידית בפינת התמונה: גרירה משנה את הרוחב בתצוגה, ובשחרור נשמר הרוחב החדש (onCommit).
// בעברית התמונה מיושרת לימין, ולכן הידית בפינה השמאלית התחתונה וגרירה שמאלה מגדילה.
function addResizeHandle(dom, img, onCommit) {
  const handle = document.createElement('span');
  handle.className = 'embed-resize';
  handle.dataset.tip = 'גרירה לשינוי הגודל';
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startW = img.getBoundingClientRect().width;
    const rtl = getComputedStyle(dom).direction === 'rtl';
    const max = (dom.closest('.ProseMirror')?.clientWidth || 1400) - 8;
    let width = startW;
    try { handle.setPointerCapture(event.pointerId); } catch { /* המעקב על החלון מספיק */ }
    dom.classList.add('resizing');
    const move = (e) => {
      const dx = (e.clientX - startX) * (rtl ? -1 : 1);
      width = Math.max(60, Math.min(max, startW + dx));
      img.style.width = Math.round(width) + 'px';
    };
    // מעקב על החלון כולו (בשלב הלכידה), כדי שהגרירה תמשיך גם כשהעכבר יוצא מהידית
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      dom.classList.remove('resizing');
      if (Math.abs(width - startW) >= 2) onCommit(width);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  });
  dom.append(handle);
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
export function returnImageToText(editor, { ref, src, alt, width }, x, y) {
  const { schema } = editor.state;
  const w = Math.max(60, Math.min(1400, Math.round(width || 300)));
  const node = ref === 'md'
    ? schema.nodes.image?.create({ src, alt: alt || '', width: w })
    : schema.nodes.embed?.create({ target: `${src}|${w}` });
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
      // ![[image.png|300|wrap-left]]: width stays compatible with Obsidian.
      // The optional wrapping flag is Tali-specific and safely remains plain Markdown.
      let current = node;
      const parse = () => {
        const parts = current.attrs.target.split('|');
        const width = /^\d+$/.test(parts[1] || '') ? Number(parts[1]) : null;
        const wrap = ['wrap-left', 'wrap-right'].includes(parts[2]) ? parts[2] : 'none';
        return { name: parts[0], width, wrap };
      };
      const dom = document.createElement('span');
      dom.className = 'embed';
      const initial = parse();
      const path = this.options.resolve(initial.name);
      if (path && IMAGE_EXT.test(path)) {
        dom.classList.add('embed-image');
        dom.contentEditable = 'false';
        const img = document.createElement('img');
        img.src = fileUrl(path);
        img.alt = initial.name;
        img.draggable = false;
        const tools = document.createElement('span');
        tools.className = 'embed-tools';
        const change = (width, wrap) => {
          const { name } = parse();
          const target = width == null ? name : [name, String(Math.max(60, Math.min(1400, Math.round(width)))), ...(wrap === 'none' ? [] : [wrap])].join('|');
          const pos = typeof getPos === 'function' ? getPos() : null;
          if (typeof pos === 'number') editor.commands.command(({ tr, dispatch }) => {
            if (dispatch) dispatch(tr.setNodeMarkup(pos, undefined, { ...current.attrs, target }));
            return true;
          });
        };
        const control = (label, hint, onClick) => {
          const b = document.createElement('button');
          b.type = 'button'; b.textContent = label; b.title = hint;
          b.addEventListener('mousedown', (event) => { event.preventDefault(); event.stopPropagation(); });
          b.addEventListener('click', (event) => { event.stopPropagation(); onClick(); });
          tools.append(b);
          return b;
        };
        control('−', 'הקטנת תמונה', () => { const a = parse(); change((a.width || img.offsetWidth || 300) - 40, a.wrap); });
        control('+', 'הגדלת תמונה', () => { const a = parse(); change((a.width || img.offsetWidth || 300) + 40, a.wrap); });
        control('רגיל', 'טקסט לפני התמונה ואחריה', () => { const a = parse(); change(a.width || img.offsetWidth || 300, 'none'); });
        control('↤', 'טקסט עוטף מצד ימין', () => { const a = parse(); change(a.width || img.offsetWidth || 300, 'wrap-left'); });
        control('↦', 'טקסט עוטף מצד שמאל', () => { const a = parse(); change(a.width || img.offsetWidth || 300, 'wrap-right'); });
        control('איפוס', 'גודל טבעי והסרת ציפת טקסט', () => change(null, 'none'));
        if (this.options.onFree) control('חופשי', 'הזזה חופשית על הדף, כמו תיבת טקסט', () => {
          const pos = typeof getPos === 'function' ? getPos() : null;
          if (typeof pos !== 'number') return;
          const rect = img.getBoundingClientRect();
          this.options.onFree({ ref: 'embed', src: parse().name, width: rect.width, rect, pos });
        });
        dom.append(img, tools);
        addResizeHandle(dom, img, (w) => change(w, parse().wrap));
        addMoveDrag(dom, img, editor, getPos);
        const render = () => {
          const a = parse();
          img.style.width = a.width ? a.width + 'px' : '';
          dom.classList.toggle('wrap-left', a.wrap === 'wrap-left');
          dom.classList.toggle('wrap-right', a.wrap === 'wrap-right');
          dom.classList.toggle('drawing', isDrawing(path));
          for (const b of tools.children) b.classList.remove('chosen');
          tools.children[a.wrap === 'none' ? 2 : a.wrap === 'wrap-left' ? 3 : 4]?.classList.add('chosen');
        };
        render();
        if (isDrawing(path)) {
          dom.title = 'לחיצה כפולה לעריכת הציור';
          img.addEventListener('dblclick', (event) => { event.preventDefault(); this.options.onEditDrawing(path); });
        }
        return { dom, update: (updated) => {
          if (updated.type.name !== 'embed' || updated.attrs.target.split('|')[0] !== initial.name) return false;
          current = updated; render(); return true;
        }, stopEvent: (event) => !!event.target.closest?.('.embed-tools, .embed-resize') };
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
          if (link) this.options.onOpen(link.dataset.target);
          else if (event.target.closest('.en-head')) this.options.onOpen(initial.name);
        });
        return { dom, stopEvent: () => true, ignoreMutation: () => true };
      }
      dom.classList.add('embed-chip');
      if (!path) dom.classList.add('unresolved');
      dom.innerHTML = `${icon(path ? 'paperclip' : 'warning', 14)}<span></span>`;
      dom.querySelector('span').textContent = initial.name;
      dom.title = path ? 'לחיצה לפתיחה' : 'הקובץ לא נמצא';
      dom.addEventListener('mousedown', (event) => { if (event.button === 0) event.preventDefault(); });
      dom.addEventListener('click', () => this.options.onOpen(initial.name));
      return { dom };
    };
  }
});

// ![תיאור](נתיב): הנתיב נשמר כמו שהוא, ומוצג יחסית לתיקיית ההערה (ואם לא נמצא, לתיקייה הראשית)
// Normal Markdown images remain ordinary ![alt](path) until explicitly resized/wrapped.
// After styling, they are saved as a standard HTML <img> tag with Tali-specific data
// attributes. This is valid Markdown HTML, not a file URL or renamed attachment.
export const LocalImage = Image.extend({
  addOptions() {
    return { ...this.parent?.(), inline: true, localSrc: () => [], onFree: null };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const n = Number.parseInt(el.getAttribute('width') || '', 10);
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        renderHTML: (a) => a.width ? { width: String(a.width) } : {},
      },
      wrap: {
        default: 'none',
        parseHTML: (el) => ['left', 'right'].includes(el.getAttribute('data-tali-wrap')) ? el.getAttribute('data-tali-wrap') : 'none',
        renderHTML: (a) => a.wrap !== 'none' ? { 'data-tali-wrap': a.wrap } : {},
      },
    };
  },
  addStorage() {
    const escapeAttr = (value) => String(value || '').replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return {
      markdown: {
        serialize(state, node) {
          const a = node.attrs;
          if (a.width || (a.wrap && a.wrap !== 'none')) {
            const attrs = ' src="' + escapeAttr(a.src) + '" alt="' + escapeAttr(a.alt) +
              '"' + (a.title ? ' title="' + escapeAttr(a.title) + '"' : '') +
              (a.width ? ' width="' + Math.max(60, Math.round(a.width)) + '"' : '') +
              ' data-tali-image="1"' +
              (a.wrap && a.wrap !== 'none' ? ' data-tali-wrap="' + a.wrap + '"' : '');
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
      const img = document.createElement('img');
      img.draggable = false;
      const candidates = this.options.localSrc(source || '');
      let i = 0;
      img.src = candidates[0] || '';
      img.addEventListener('error', () => {
        if (++i < candidates.length) img.src = candidates[i];
        else img.classList.add('broken');
      });
      const tools = document.createElement('span');
      tools.className = 'embed-tools';
      function change(width, wrap) {
        const at = typeof getPos === 'function' ? getPos() : null;
        if (typeof at !== 'number') return;
        editor.commands.command(({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setNodeMarkup(at, undefined, { ...current.attrs,
            width: width == null ? null : Math.max(60, Math.min(1400, Math.round(width))), wrap }));
          return true;
        });
      }
      function button(label, hint, action) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = label; b.title = hint;
        b.addEventListener('mousedown', (event) => { event.preventDefault(); event.stopPropagation(); });
        b.addEventListener('click', (event) => { event.stopPropagation(); action(); });
        tools.append(b);
      }
      button('−', 'הקטנה', () => change((current.attrs.width || img.offsetWidth || 300) - 40, current.attrs.wrap || 'none'));
      button('+', 'הגדלה', () => change((current.attrs.width || img.offsetWidth || 300) + 40, current.attrs.wrap || 'none'));
      button('רגיל', 'ללא ציפת טקסט', () => change(current.attrs.width || img.offsetWidth || 300, 'none'));
      button('↤', 'טקסט עוטף מצד ימין', () => change(current.attrs.width || img.offsetWidth || 300, 'left'));
      button('↦', 'טקסט עוטף מצד שמאל', () => change(current.attrs.width || img.offsetWidth || 300, 'right'));
      button('איפוס', 'החזרת גודל טבעי ותחביר Markdown רגיל', () => change(null, 'none'));
      const onFree = this.options.onFree;
      if (onFree) button('חופשי', 'הזזה חופשית על הדף, כמו תיבת טקסט', () => {
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (typeof pos !== 'number') return;
        const rect = img.getBoundingClientRect();
        onFree({ ref: 'md', src: current.attrs.src, alt: current.attrs.alt || '', width: rect.width, rect, pos });
      });
      dom.append(img, tools);
      addResizeHandle(dom, img, (w) => change(w, current.attrs.wrap || 'none'));
      addMoveDrag(dom, img, editor, getPos);
      const render = () => {
        const a = current.attrs;
        img.alt = a.alt || '';
        img.title = a.title || '';
        img.style.width = a.width ? a.width + 'px' : '';
        dom.classList.toggle('wrap-left', a.wrap === 'left');
        dom.classList.toggle('wrap-right', a.wrap === 'right');
        for (const control of tools.children) control.classList.remove('chosen');
        tools.children[a.wrap === 'left' ? 3 : a.wrap === 'right' ? 4 : 2]?.classList.add('chosen');
      };
      render();
      return {
        dom,
        update(updated) {
          if (updated.type.name !== current.type.name || updated.attrs.src !== source) return false;
          current = updated; render(); return true;
        },
        stopEvent: (event) => !!event.target.closest?.('.embed-tools, .embed-resize'),
      };
    };
  },
});
