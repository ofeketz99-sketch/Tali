// תמונות וקבצים מוטמעים: ![[תמונה.png]] בסגנון אובסידיאן, ו־![תיאור](נתיב) רגיל.
// בקובץ נשמר בדיוק מה שנכתב; רק התצוגה ממירה את הנתיב לקובץ אמיתי בדיסק.
import { Node } from '@tiptap/core';
import Image from '@tiptap/extension-image';

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
      onEditDrawing: () => {}, // (path) => void — לחיצה כפולה על ציור
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
        const width = /^\\d+$/.test(parts[1] || '') ? Number(parts[1]) : null;
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
          const target = [name, String(Math.max(60, Math.min(1400, Math.round(width)))), ...(wrap === 'none' ? [] : [wrap])].join('|');
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
        dom.append(img, tools);
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
        }, stopEvent: (event) => !!event.target.closest?.('.embed-tools') };
      }
      dom.classList.add('embed-chip');
      if (!path) dom.classList.add('unresolved');
      dom.textContent = (path ? '📎 ' : '⚠ ') + initial.name;
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
    return { ...this.parent?.(), inline: true, localSrc: () => [] };
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
            width: Math.max(60, Math.min(1400, Math.round(width))), wrap }));
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
      dom.append(img, tools);
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
        stopEvent: (event) => !!event.target.closest?.('.embed-tools'),
      };
    };
  },
});
