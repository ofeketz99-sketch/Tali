// Backspace בתחילת פסקה שנמצאת בתוך פריט רשימה, אבל אינה השורה הראשונה שלו
// (למשל "וזהו" שנכנס בטעות מתחת למשימה האחרונה): הפסקה יוצאת מהרשימה ונהיית פסקה רגילה.
// ברירת המחדל של ProseMirror הייתה מדביקה אותה לסוף השורה שמעליה ("גיאומטריהוזהו").
import { Extension } from '@tiptap/core';

const ITEM_TYPES = ['taskItem', 'listItem'];

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

export const ListBackspace = Extension.create({
  name: 'listBackspace',
  priority: 1000, // לפני Backspace של הליבה ושל הרשימות
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        if (!selection.empty) return false;
        const $from = selection.$from;
        if ($from.parentOffset !== 0 || $from.depth < 2) return false;
        const item = $from.node(-1);
        if (!ITEM_TYPES.includes(item.type.name)) return false;
        if ($from.index(-1) === 0) return false; // שורה ראשונה בפריט: ההתנהגות הרגילה
        const at = $from.before();
        const attrs = item.type.name === 'taskItem' ? { checked: false } : null;
        // שני צעדים נפרדים: בתוך chain אחד liftListItem לא מוצא את הפריט החדש.
        // ההיסטוריה מאחדת אותם, כך ש־Ctrl+Z מבטל את שניהם יחד.
        editor.view.dispatch(editor.state.tr.split(at, 1, [{ type: item.type, attrs }]));
        editor.commands.liftListItem(item.type.name);
        tightenListBefore(editor);
        return true;
      },
    };
  },
});
