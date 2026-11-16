// מקשים שהופכים עריכה של רשימות ושורות לנוחה, כמו בוורד ובגוגל דוקס:
// • Backspace בתחילת פריט רשימה: התבליט או תיבת הסימון יורדים. בפסקה נוספת בתוך פריט: היא יוצאת מהרשימה.
// • Backspace בתחילת שורה שמיד אחרי רשימה: השורה מתחברת לסוף הפריט האחרון, ושני חלקי הרשימה
//   מתאחדים. קודם השורה הפכה שוב לפריט, ו־Backspace נוסף הוציא אותה, בלולאה בלי סוף.
// • Alt+↑ / Alt+↓: הזזת השורה, הפריט או הגוש שבו הסמן, למעלה או למטה.
import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { canJoin } from '@tiptap/pm/transform';
import { shouldResetCenteredOnBackspace } from './editor-behavior.js';

const ITEM_TYPES = ['taskItem', 'listItem'];
const LIST_TYPES = ['taskList', 'bulletList', 'orderedList'];

// הפסקה הנוספת היא שהפכה את הרשימה ל"רופפת" (שורה ריקה בין הפריטים בקובץ).
// אחרי שיצאה, ואם בכל פריט נשארה פסקה אחת, הרשימה חוזרת להיות צפופה כמו שנכתבה.
function tightenListBefore(editor) {
  const { state } = editor;
  const $p = state.selection.$from;
  if ($p.depth < 1) return;
  const start = $p.before();
  const list = state.doc.resolve(start).nodeBefore;
  if (!list || list.attrs.tight !== false) return;
  let single = true;
  list.forEach((child) => { if (child.childCount > 1) single = false; });
  if (!single) return;
  editor.view.dispatch(state.tr.setNodeMarkup(start - list.nodeSize, null, { ...list.attrs, tight: true }));
}

// פסקה נוספת בתוך פריט: יוצאת מהרשימה
function liftExtraParagraph(editor, $from) {
  if ($from.depth < 2) return false;
  const item = $from.node(-1);
  if (!ITEM_TYPES.includes(item.type.name)) return false;
  // שורה ראשונה בפריט: מסירים את התבליט או תיבת הסימון (בפריט מקונן: רמה אחת החוצה), כמו בגוגל דוקס.
  // ברירת המחדל הכניסה את השורה בסתר לתוך הפריט שמעליה.
  if ($from.index(-1) === 0) return editor.commands.liftListItem(item.type.name);
  const at = $from.before();
  const attrs = item.type.name === 'taskItem' ? { checked: false } : null;
  // שני צעדים נפרדים: בתוך chain אחד liftListItem לא מוצא את הפריט החדש.
  // ההיסטוריה מאחדת אותם, כך ש־Ctrl+Z מבטל את שניהם יחד.
  editor.view.dispatch(editor.state.tr.split(at, 1, [{ type: item.type, attrs }]));
  editor.commands.liftListItem(item.type.name);
  tightenListBefore(editor);
  return true;
}

// שורה שמיד אחרי רשימה: מתחברת לסוף הפריט האחרון, והרשימה שאחריה (אם יש) מתאחדת איתה
function joinIntoListAbove(editor, $from) {
  const depth = $from.depth;
  if (depth < 1) return false;
  const container = $from.node(depth - 1);
  const index = $from.index(depth - 1);
  if (index === 0) return false;
  const prev = container.child(index - 1);
  if (!LIST_TYPES.includes(prev.type.name)) return false;
  const paragraph = $from.parent;
  const paraStart = $from.before(depth);
  const listStart = paraStart - prev.nodeSize;
  let end = null;
  prev.descendants((node, pos) => { if (node.isTextblock) end = listStart + 1 + pos + 1 + node.content.size; });
  if (end == null) return false;
  const tr = editor.state.tr;
  tr.delete(paraStart, paraStart + paragraph.nodeSize);
  if (paragraph.content.size) tr.insert(end, paragraph.content);
  tr.setSelection(TextSelection.create(tr.doc, end));
  // אם השורה הפרידה בין שני חלקים של אותה רשימה, הם חוזרים להיות רשימה אחת
  const list = tr.doc.nodeAt(listStart);
  const after = listStart + list.nodeSize;
  const next = tr.doc.nodeAt(after);
  if (next && next.type === list.type && canJoin(tr.doc, after)) tr.join(after);
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

// Alt+↑/↓: בתוך רשימה זז הפריט, ובכל מקום אחר זז הגוש כולו (פסקה, כותרת, טבלה, רשימה)
export function moveBlock(editor, dir) {
  const { state } = editor;
  const { $from } = state.selection;
  let depth = 0;
  for (let d = $from.depth; d > 0; d--) {
    if (ITEM_TYPES.includes($from.node(d).type.name)) { depth = d; break; }
  }
  if (!depth) depth = Math.min(1, $from.depth);
  if (!depth) return false;
  const parent = $from.node(depth - 1);
  const index = $from.index(depth - 1);
  const target = index + dir;
  if (target < 0 || target >= parent.childCount) return true; // כבר בקצה: לא עושים כלום, וגם לא מזיזים את הסמן
  const node = $from.node(depth);
  const start = $from.before(depth);
  const other = parent.child(target);
  const { from, to } = state.selection;
  const tr = state.tr;
  let newStart;
  if (dir < 0) {
    newStart = start - other.nodeSize;
    tr.delete(start, start + node.nodeSize);
    tr.insert(newStart, node);
  } else {
    const otherEnd = start + node.nodeSize + other.nodeSize;
    tr.insert(otherEnd, node);
    tr.delete(start, start + node.nodeSize);
    newStart = otherEnd - node.nodeSize;
  }
  const clamp = (p) => Math.max(newStart + 1, Math.min(newStart + node.nodeSize - 1, p));
  tr.setSelection(TextSelection.create(tr.doc, clamp(newStart + from - start), clamp(newStart + to - start)));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export const ListBackspace = Extension.create({
  name: 'listBackspace',
  priority: 1000, // לפני Backspace של הליבה ושל הרשימות
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        if (!selection.empty) return false;
        const $from = selection.$from;
        if ($from.parentOffset !== 0 || !$from.parent.isTextblock) return false;
        // כמו Word: Enter אחרי שורה ממורכזת יוצר שורה ריקה ממורכזת; Backspace ראשון
        // מחזיר אותה ליישור ימין, ורק Backspace נוסף מחבר אותה לשורה הקודמת.
        if (shouldResetCenteredOnBackspace({
          empty: !$from.parent.content.size,
          offset: $from.parentOffset,
          type: $from.parent.type.name,
          textAlign: $from.parent.attrs.textAlign,
        })) return editor.commands.setTextAlign('right');
        return liftExtraParagraph(editor, $from) || joinIntoListAbove(editor, $from);
      },
      'Alt-ArrowUp': ({ editor }) => moveBlock(editor, -1),
      'Alt-ArrowDown': ({ editor }) => moveBlock(editor, 1),
    };
  },
});
