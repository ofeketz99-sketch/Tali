// קישורי [[הערה]] בעורך: צומת קישור, קריאה ושמירה כ־Markdown, והשלמה אוטומטית אחרי [[.
import { Node, InputRule } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { isMiddleClick, linkOpenOptions } from './link-open.js';

// ===== markdown-it: הופך [[...]] לתגית שהעורך מזהה =====
function wikilinkMarkdownIt(md) {
  if (md.inline.ruler.__rules__.some((r) => r.name === 'wikilink')) return;
  md.inline.ruler.before('link', 'wikilink', (state, silent) => {
    const src = state.src;
    const start = state.pos;
    if (src.charCodeAt(start) !== 0x5b || src.charCodeAt(start + 1) !== 0x5b) return false;
    const end = src.indexOf(']]', start + 2);
    if (end < 0) return false;
    const inner = src.slice(start + 2, end);
    if (!inner.trim() || /[\[\]\n]/.test(inner)) return false;
    if (!silent) {
      const bar = inner.indexOf('|');
      const tok = state.push('wikilink', '', 0);
      // בלי trim: רווח בסוף השם נשמר כמו שנכתב (הפענוח מתעלם ממנו)
      tok.meta = {
        target: bar < 0 ? inner : inner.slice(0, bar),
        alias: bar < 0 ? null : inner.slice(bar + 1),
      };
    }
    state.pos = end + 2;
    return true;
  });
  const esc = md.utils.escapeHtml;
  md.renderer.rules.wikilink = (tokens, i) => {
    const { target, alias } = tokens[i].meta;
    const aliasAttr = alias != null ? ` data-alias="${esc(alias)}"` : '';
    return `<span data-wikilink="${esc(target)}"${aliasAttr}>${esc(alias || target)}</span>`;
  };
}

// ===== צומת הקישור =====
export const WikiLink = Node.create({
  name: 'wikiLink',
  priority: 1000, // כדי ש־Enter בהשלמה האוטומטית יגיע אלינו לפני פיצול הפסקה
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      getNotes: () => [],        // [{ name, path, rel }]
      resolve: () => null,       // target -> path | null
      onOpen: () => {},          // (target) => void
      onLinked: () => {},        // (target, coords) => void — אחרי שנוצר קישור חדש (להצעת פתק קישור)
    };
  },

  addAttributes() {
    return {
      target: { default: '', parseHTML: (el) => el.getAttribute('data-wikilink') },
      alias: { default: null, parseHTML: (el) => el.getAttribute('data-alias') },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }];
  },

  renderHTML({ node }) {
    const { target, alias } = node.attrs;
    const attrs = { 'data-wikilink': target, class: 'wikilink tali-link', title: target, dir: 'auto' };
    if (alias != null) attrs['data-alias'] = alias;
    return ['span', attrs, alias || target];
  },

  renderText({ node }) {
    const { target, alias } = node.attrs;
    return `[[${target}${alias != null ? '|' + alias : ''}]]`;
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          const { target, alias } = node.attrs;
          state.write(`[[${target}${alias != null ? '|' + alias : ''}]]`);
        },
        parse: {
          setup(markdownit) { wikilinkMarkdownIt(markdownit); },
        },
      },
    };
  },

  // הקלדה מלאה של [[שם]] הופכת לקישור
  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\[\]\n]+)\]\]$/,
        handler: ({ state, range, match }) => {
          const inner = match[1];
          const bar = inner.indexOf('|');
          const target = (bar < 0 ? inner : inner.slice(0, bar)).trim();
          if (!target) return null;
          const alias = bar < 0 ? null : inner.slice(bar + 1);
          state.tr.replaceWith(range.from, range.to, this.type.create({ target, alias }));
          const view = this.editor.view;
          setTimeout(() => this.options.onLinked(target, view.coordsAtPos(view.state.selection.from)), 0);
        },
      }),
    ];
  },

  // מצב "לא קיים" מתעדכן בכל ציור, כי רשימת ההערות משתנה
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.className = 'wikilink tali-link';
      dom.dir = 'auto';
      dom.setAttribute('data-wikilink', node.attrs.target);
      dom.textContent = node.attrs.alias || node.attrs.target;
      dom.title = node.attrs.target;
      const mark = () => dom.classList.toggle('unresolved', !this.options.resolve(node.attrs.target));
      mark();
      dom.addEventListener('mousedown', (e) => { if (e.button === 0) e.preventDefault(); });
      dom.addEventListener('click', (e) => {
        e.preventDefault();
        // Ctrl+לחיצה: בכרטיסייה חדשה
        this.options.onOpen(node.attrs.target, linkOpenOptions(e));
      });
      // 8.2: לחיצה אמצעית (כפתור הגלגלת) על קישור: בכרטיסייה חדשה
      dom.addEventListener('auxclick', (e) => {
        if (!isMiddleClick(e)) return;
        e.preventDefault();
        this.options.onOpen(node.attrs.target, linkOpenOptions(e));
      });
      return { dom, update: (n) => n.type === node.type && n.attrs.target === node.attrs.target && n.attrs.alias === node.attrs.alias && (mark(), true) };
    };
  },

  addProseMirrorPlugins() {
    return [suggestPlugin(this)];
  },
});

// ===== השלמה אוטומטית =====
const suggestKey = new PluginKey('wikilinkSuggest');

function suggestPlugin(ext) {
  const box = document.createElement('div');
  box.className = 'wikilink-suggest';
  box.hidden = true;
  document.body.appendChild(box);

  let active = null;      // { from, to, query }
  let items = [];
  let index = 0;
  let dismissedAt = null; // מיקום ה־[[ שנסגר ב־Escape

  function findMatch(view) {
    const { selection } = view.state;
    if (!selection.empty) return null;
    const $from = selection.$from;
    if (!$from.parent.isTextblock || $from.parent.type.spec.code) return null;
    const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 120), $from.parentOffset, null, '￼');
    const m = before.match(/\[\[([^\[\]|#\n￼]*)$/);
    if (!m) return null;
    return { from: $from.pos - m[0].length, to: $from.pos, query: m[1] };
  }

  function rank(query) {
    const q = query.trim().toLowerCase();
    const notes = ext.options.getNotes();
    const scored = [];
    for (const n of notes) {
      const name = n.name.toLowerCase();
      const rel = n.rel.toLowerCase();
      let score = -1;
      if (!q) score = 1;
      else if (name === q) score = 0;
      else if (name.startsWith(q)) score = 1;
      else if (name.includes(q)) score = 2;
      else if (rel.includes(q)) score = 3;
      if (score >= 0) scored.push([score, n]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name, 'he', { numeric: true }));
    const list = scored.slice(0, 8).map(([, n]) => ({ ...n, isNew: false }));
    if (q && !list.some((n) => n.name.toLowerCase() === q)) {
      list.push({ name: query.trim(), rel: '', isNew: true });
    }
    // שם שמופיע פעמיים בתיקיות שונות מקבל נתיב מלא
    const counts = {};
    for (const n of notes) counts[n.name.toLowerCase()] = (counts[n.name.toLowerCase()] || 0) + 1;
    for (const n of list) n.insert = !n.isNew && counts[n.name.toLowerCase()] > 1 ? n.rel : n.name;
    return list;
  }

  function draw(view) {
    box.innerHTML = '';
    if (!items.length) { box.hidden = true; return; }
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'item' + (i === index ? ' selected' : '');
      const name = document.createElement('span');
      name.textContent = it.isNew ? `צור קישור: ${it.name}` : it.name;
      row.appendChild(name);
      if (!it.isNew && it.rel.includes('/')) {
        const small = document.createElement('small');
        small.textContent = it.rel.slice(0, it.rel.lastIndexOf('/'));
        row.appendChild(small);
      }
      row.addEventListener('mousedown', (e) => { e.preventDefault(); choose(view, i); });
      box.appendChild(row);
    });
    const c = view.coordsAtPos(active.from);
    box.hidden = false;
    const w = box.offsetWidth;
    // 11.5: אין מקום מתחת לסמן (קרוב לתחתית החלון): נפתח מעליו. עד עכשיו הרשימה נחתכה בקצה החלון
    const h = box.offsetHeight;
    const below = window.innerHeight - c.bottom - 8;
    box.style.top = (below < h + 4 && c.top - 8 > below ? Math.max(8, c.top - h - 4) : c.bottom + 4) + 'px';
    box.style.left = Math.max(8, Math.min(c.right - w, window.innerWidth - w - 8)) + 'px';
    box.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }

  function close() {
    active = null;
    items = [];
    box.hidden = true;
  }

  function choose(view, i) {
    const it = items[i];
    if (!it || !active) return;
    const { state } = view;
    let to = active.to;
    // אם כבר הוקלד ]] אחרי הסמן, מחליפים גם אותו
    if (state.doc.textBetween(to, Math.min(to + 2, state.doc.content.size), null, '￼') === ']]') to += 2;
    const node = ext.type.create({ target: it.insert });
    const tr = state.tr.replaceWith(active.from, to, node);
    const coords = view.coordsAtPos(active.from);
    view.dispatch(tr.scrollIntoView());
    close();
    view.focus();
    // אותה חלונית קטנה ממשיכה להצעה להוסיף פתק קישור
    ext.options.onLinked(it.insert, coords);
  }

  return new Plugin({
    key: suggestKey,
    // 8.8: ProseMirror הורס ובונה מחדש את תצוגות התוספים בכל הגדרה מחדש של העורך (setOptions,
    // החלת הגדרות). destroy מוציא את החלונית מהדף, ולכן מחזירים אותה כאן. עד 8.7 היא לא חזרה,
    // וההשלמה של [[ פשוט לא הופיעה אחרי הטעינה הראשונה.
    view: () => {
      if (!box.isConnected) document.body.appendChild(box);
      return {
      update(view) {
        const m = findMatch(view);
        if (!m || m.from === dismissedAt) {
          if (!m) dismissedAt = null;
          close();
          return;
        }
        if (!active || active.query !== m.query || active.from !== m.from) index = 0;
        active = m;
        items = rank(m.query);
        draw(view);
      },
      destroy() { close(); box.remove(); },
      };
    },
    props: {
      handleKeyDown(view, e) {
        if (!active || !items.length) return false;
        if (e.key === 'ArrowDown') { index = (index + 1) % items.length; draw(view); return true; }
        if (e.key === 'ArrowUp') { index = (index - 1 + items.length) % items.length; draw(view); return true; }
        if (e.key === 'Enter' || e.key === 'Tab') { choose(view, index); return true; }
        if (e.key === 'Escape') {
          // 11.5: Esc מיד אחרי "[[" (בלי טקסט): מבטל את הקישור כולו. עד עכשיו "[[" יתום נשאר בטקסט ובקובץ
          if (!active.query.trim() && view.state.doc.textBetween(active.from, active.to) === '[[') {
            const { from, to } = active;
            close();
            view.dispatch(view.state.tr.delete(from, to));
            return true;
          }
          dismissedAt = active.from; close(); return true;
        }
        return false;
      },
      handleDOMEvents: {
        blur: () => { setTimeout(close, 100); return false; },
      },
    },
  });
}
