// נוסחאות LaTeX בתצוגה בלבד (KaTeX). הקובץ לא משתנה: $...$ נשאר טקסט, ו־$$...$$ גוש גולמי.
// נוסחה בשורה מוצגת מעובדת כשהסמן מחוץ לה, וכטקסט המקורי כשהסמן בתוכה (כמו באובסידיאן).
import katex from 'katex';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const cache = new Map();
export function renderMath(tex, displayMode) {
  const key = (displayMode ? 'D' : 'I') + tex;
  if (!cache.has(key)) {
    try {
      cache.set(key, katex.renderToString(tex, { displayMode, throwOnError: false, output: 'htmlAndMathml', strict: 'ignore' }));
    } catch { cache.set(key, null); }
    if (cache.size > 500) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}

// $...$ באותם כללים כמו ב־obsidian-md.js: לא מתחיל ולא נגמר ברווח, ואחריו לא ספרה ($5 הוא מחיר).
export function findInlineMath(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] !== '$') continue;
    if (text[i + 1] === '$') { // $$ בתוך שורה
      const close = text.indexOf('$$', i + 2);
      if (close > i + 2) { out.push({ from: i, to: close + 2, tex: text.slice(i + 2, close), display: true }); i = close + 1; }
      continue;
    }
    if (!text[i + 1] || /\s/.test(text[i + 1])) continue;
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === '\\') { j++; continue; }
      if (text[j] === '$') {
        if (!/\s/.test(text[j - 1]) && !/\d/.test(text[j + 1] || '')) { out.push({ from: i, to: j + 1, tex: text.slice(i + 1, j), display: false }); i = j; }
        break;
      }
    }
  }
  return out;
}

// מקור הנוסחה חייב להישאר יחידת LTR גם בתוך פסקה עברית. בלי מעטפת כזו
// אלגוריתם ה־bidi מסדר מחדש $, חזקות וסימנים בזמן העריכה, אף שהטקסט השמור תקין.
export function mathSourceAttrs(editing, display = false) {
  return {
    class: ['math-src', editing && 'math-src-editing', display && 'math-src-display'].filter(Boolean).join(' '),
    dir: 'ltr',
    spellcheck: 'false',
    autocapitalize: 'off',
    translate: 'no',
    'data-math-source': editing ? 'editing' : 'hidden',
  };
}

const key = new PluginKey('taliMath');
function build(doc, selection) {
  const decos = [];
  doc.descendants((node, pos, parent) => {
    if (parent?.type.spec.code) return false;
    if (!node.isText || !node.text.includes('$')) return;
    if (node.marks.some((m) => m.type.spec.code)) return;
    for (const m of findInlineMath(node.text)) {
      const from = pos + m.from, to = pos + m.to;
      const editing = selection.from <= to && selection.to >= from;
      // גם כשהמקור גלוי עוטפים אותו ב־span מבודד. כך סדר התווים והסמן נשארים LTR.
      if (editing) {
        decos.push(Decoration.inline(from, to, mathSourceAttrs(true, m.display)));
        continue;
      }
      const html = renderMath(m.tex, m.display);
      if (!html) continue;
      decos.push(Decoration.inline(from, to, mathSourceAttrs(false, m.display)));
      decos.push(Decoration.widget(from, () => {
        const span = document.createElement('span');
        span.className = 'math-inline' + (m.display ? ' math-display-inline' : '');
        span.innerHTML = html;
        span.dataset.tip = 'לחיצה לעריכת הנוסחה';
        return span;
      }, { side: -1, key: `${from}:${m.tex}`, ignoreSelection: true }));
    }
  });
  return DecorationSet.create(doc, decos);
}

export const MathPreview = Extension.create({
  name: 'mathPreview',
  addProseMirrorPlugins() {
    return [new Plugin({
      key,
      state: {
        init: (_, state) => build(state.doc, state.selection),
        apply: (tr, old, _o, state) => (tr.docChanged || tr.selectionSet ? build(state.doc, state.selection) : old),
      },
      props: {
        decorations: (state) => key.getState(state),
        // לחיצה על נוסחה מעובדת מכניסה את הסמן לתוכה, ואז מוצג המקור לעריכה
        handleDOMEvents: {
          mousedown(view, event) {
            const el = event.target.closest?.('.math-inline');
            if (!el) return false;
            const pos = view.posAtDOM(el, 0);
            event.preventDefault();
            view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.near(view.state.doc.resolve(Math.min(pos + 1, view.state.doc.content.size)))));
            view.focus();
            return true;
          },
        },
      },
    })];
  },
});
