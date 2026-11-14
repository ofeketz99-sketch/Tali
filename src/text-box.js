// מסגרת בתוך הטקסט ("תיבה בתוך הפסקה" עד 7.9): ציטוט שהשורה הראשונה שלו היא [!TALI-BOX] (מוסתרת בתצוגה).
// 8.0: אפשר למחוק אותה. עד 8.0 Backspace בתחילת התיבה התמזג לתוך השורה המוסתרת, והתיבה נשארה לתמיד.
// - Backspace בתחילת התיבה, או Backspace/Delete כשהיא ריקה: תיבה ריקה נמחקת; תיבה עם טקסט מאבדת את המסגרת והטקסט נשאר.
// - בתפריט הלחיצה הימנית: "מחיקת המסגרת והטקסט" ו"הסרת המסגרת (הטקסט נשאר)".
import { Extension } from '@tiptap/core';

export const TALI_BOX_MARK = '[!TALI-BOX]';
const isMarker = (node) => node?.type.name === 'paragraph' && node.textContent.trim().toUpperCase().startsWith(TALI_BOX_MARK);
export const isTaliBox = (node) => node?.type.name === 'blockquote' && isMarker(node.firstChild);

// המסגרת שמכילה את הסמן: { pos, node } או null
export function findTaliBox(state) {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (isTaliBox(node)) return { pos: $from.before(d), node, depth: d };
  }
  return null;
}

// הטקסט שבתוך המסגרת, בלי הסימון. גם כשהסימון והטקסט באותה פסקה (ציטוט שנכתב באובסידיאן:
// "> [!TALI-BOX]" ומיד "> טקסט" נקראים כפסקה אחת עם ירידת שורה), ולכן לפי הטקסט ולא לפי הפסקאות.
const boxText = (node) => node.textContent.trim().slice(TALI_BOX_MARK.length).trim();

// כמה תוכן להוריד מתחילת הפסקה הראשונה: הסימון, וירידת השורה שאחריו אם יש
function markerCut(first) {
  let cut = 0, seen = 0;
  for (let i = 0; i < first.childCount; i++) {
    const child = first.child(i);
    if (seen < TALI_BOX_MARK.length) {
      if (!child.isText) break;
      const lead = child.text.length - child.text.trimStart().length;
      const take = Math.min(child.text.length, lead + TALI_BOX_MARK.length - seen);
      seen += take - lead;
      cut += take;
      if (take < child.text.length) {
        // שארית של אותו טקסט (רווחים אחרי הסימון)
        const rest = child.text.slice(take);
        cut += rest.length - rest.trimStart().length;
        return cut;
      }
      continue;
    }
    if (child.type.name === 'hardBreak') cut += child.nodeSize;
    break;
  }
  return cut;
}
// הפסקאות של המסגרת בלי הסימון (פסקת סימון שאין בה כלום נוספת מושמטת)
export function contentWithoutMarker(node) {
  const out = [];
  node.forEach((child, _offset, index) => {
    if (index > 0) { out.push(child); return; }
    const cut = markerCut(child);
    if (cut < child.content.size) out.push(child.cut(cut));
  });
  return out;
}

export function deleteTaliBox(editor) {
  const box = findTaliBox(editor.state);
  if (!box) return false;
  return editor.commands.command(({ tr, state, dispatch }) => {
    const para = state.schema.nodes.paragraph.create();
    tr.replaceWith(box.pos, box.pos + box.node.nodeSize, para);
    if (dispatch) {
      tr.setSelection(state.selection.constructor.near(tr.doc.resolve(box.pos + 1)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  });
}

export function unwrapTaliBox(editor) {
  const box = findTaliBox(editor.state);
  if (!box) return false;
  return editor.commands.command(({ tr, state, dispatch }) => {
    const children = contentWithoutMarker(box.node);
    if (!children.length) children.push(state.schema.nodes.paragraph.create());
    tr.replaceWith(box.pos, box.pos + box.node.nodeSize, children);
    if (dispatch) {
      tr.setSelection(state.selection.constructor.near(tr.doc.resolve(box.pos + 1)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  });
}

export const TaliBoxKeys = Extension.create({
  name: 'taliBoxKeys',
  priority: 1000, // לפני Backspace של הרשימות ושל ProseMirror
  addKeyboardShortcuts() {
    const handle = (forward) => () => {
      const { state } = this.editor;
      if (!state.selection.empty) return false;
      const box = findTaliBox(state);
      if (!box) return false;
      if (!boxText(box.node)) return deleteTaliBox(this.editor);
      if (forward) return false;
      // Backspace בתחילת הטקסט הגלוי הראשון: הסרת המסגרת, הטקסט נשאר.
      // שני מקרים: הטקסט בפסקה שאחרי הסימון, או באותה פסקה מיד אחרי הסימון וירידת השורה.
      const { $from } = state.selection;
      const first = box.node.firstChild;
      const cut = markerCut(first);
      const visibleStart = cut < first.content.size
        ? box.pos + 2 + cut
        : box.pos + 1 + first.nodeSize + 1;
      if ($from.pos <= visibleStart) return unwrapTaliBox(this.editor); // גם מתוך הסימון המוסתר
      return false;
    };
    return { Backspace: handle(false), Delete: handle(true) };
  },
});
