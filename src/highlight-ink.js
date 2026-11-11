// טקסט קריא על מרקר: טקסט בהיר על מרקר בהיר הופך לכהה, וטקסט כהה על מרקר כהה הופך לבהיר.
// קישוט תצוגה בלבד (Decoration): הקובץ לא משתנה. טקסט שהמשתמש צבע בעצמו (צבע טקסט) נשאר בצבע שלו.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { luminance, normalizeHex } from './theme-core.js';

const key = new PluginKey('highlightInk');
const DARK_INK = '#1f2328';
const LIGHT_INK = '#f5f6f8';
// מרקר בלי צבע (==טקסט== או <mark>) נראה צהוב, כמו בברירת המחדל של הדפדפן
const DEFAULT_MARK = '#fff3a3';

// צבע הטקסט שקריא על המרקר: לפי הנקודה שבה שחור ולבן נותנים ניגודיות שווה (בהירות ≈ 0.18)
export function inkFor(markColor) {
  const hex = normalizeHex(markColor || DEFAULT_MARK);
  if (!hex) return null;
  return luminance(hex) > 0.18 ? DARK_INK : LIGHT_INK;
}

function build(doc) {
  const decos = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const hl = node.marks.find((m) => m.type.name === 'highlight');
    if (!hl) return;
    if (node.marks.some((m) => m.type.name === 'textStyle' && m.attrs.color)) return; // צבע שנבחר במפורש
    const ink = inkFor(hl.attrs.color);
    if (ink) decos.push(Decoration.inline(pos, pos + node.nodeSize, { style: `color: ${ink}` }));
  });
  return DecorationSet.create(doc, decos);
}

export const HighlightInk = Extension.create({
  name: 'highlightInk',
  addProseMirrorPlugins() {
    return [new Plugin({
      key,
      state: {
        init: (_, { doc }) => build(doc),
        apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
      },
      props: { decorations: (state) => key.getState(state) },
    })];
  },
});
