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
    return ({ node }) => {
      // ![[שם|300]] או ![[שם|300x200]]: רוחב בפיקסלים, כמו באובסידיאן
      const [name, size] = node.attrs.target.split('|');
      const path = this.options.resolve(name);
      const dom = document.createElement('span');
      dom.className = 'embed';
      if (path && IMAGE_EXT.test(path)) {
        const img = document.createElement('img');
        img.src = fileUrl(path);
        img.alt = name;
        img.draggable = false;
        const w = /^(\d+)/.exec(size || '');
        if (w) img.style.width = w[1] + 'px';
        dom.appendChild(img);
        if (isDrawing(path)) {
          dom.classList.add('drawing');
          dom.title = 'לחיצה כפולה לעריכת הציור';
          dom.addEventListener('dblclick', (e) => { e.preventDefault(); this.options.onEditDrawing(path); });
        }
      } else {
        dom.classList.add('embed-chip');
        if (!path) dom.classList.add('unresolved');
        dom.textContent = (path ? '📎 ' : '⚠ ') + name;
        dom.title = path ? 'לחיצה לפתיחה' : 'הקובץ לא נמצא';
        dom.addEventListener('mousedown', (e) => { if (e.button === 0) e.preventDefault(); });
        dom.addEventListener('click', () => this.options.onOpen(name));
      }
      return { dom };
    };
  },
});

// ![תיאור](נתיב): הנתיב נשמר כמו שהוא, ומוצג יחסית לתיקיית ההערה (ואם לא נמצא, לתיקייה הראשית)
export const LocalImage = Image.extend({
  addOptions() {
    return { ...this.parent?.(), inline: true, localSrc: () => [] };
  },
  addNodeView() {
    return ({ node }) => {
      const img = document.createElement('img');
      img.alt = node.attrs.alt || '';
      if (node.attrs.title) img.title = node.attrs.title;
      const candidates = this.options.localSrc(node.attrs.src || '');
      let i = 0;
      img.src = candidates[0] || '';
      img.addEventListener('error', () => { if (++i < candidates.length) img.src = candidates[i]; else img.classList.add('broken'); });
      return { dom: img };
    };
  },
});
