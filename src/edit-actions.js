// פעולות עיצוב והוספה, משותפות לסרגל הכלים, לתפריט "הוספה" ולתפריט הלחיצה הימנית (context-menu.js).
// כל פעולה עוברת דרך הפקודות של TipTap/ProseMirror, ולכן היא חלק מהיסטוריית הביטול ונשמרת כמו כל עריכה.
// פעולה חדשה: מוסיפים כאן, ומשתמשים בה מכל המקומות. לא כותבים מימוש מקביל בתפריט אחר.
import { TextSelection } from '@tiptap/pm/state';
import { openTableGrid } from './table.js';

export function createEditActions(editor, hooks = {}) {
  const chain = () => editor.chain().focus();
  const selectedText = () => {
    const { from, to, empty } = editor.state.selection;
    return empty ? '' : editor.state.doc.textBetween(from, to, ' ');
  };

  const a = {
    // ----- עיצוב -----
    heading: (level) => chain().setHeading({ level }).run(),
    paragraph: () => chain().setParagraph().run(),
    bold: () => chain().toggleBold().run(),
    italic: () => chain().toggleItalic().run(),
    underline: () => chain().toggleUnderline().run(),
    strike: () => chain().toggleStrike().run(),
    bulletList: () => chain().toggleBulletList().run(),
    orderedList: () => chain().toggleOrderedList().run(),
    taskList: () => chain().toggleTaskList().run(),
    quote: () => chain().toggleBlockquote().run(),
    codeBlock: () => chain().toggleCodeBlock().run(),

    // ----- הוספה -----
    table: (rows = 3, cols = 3) => chain().insertTable({ rows, cols, withHeaderRow: true }).run(),
    // בורר הגודל הקיים (table.js), ליד anchor
    pickTable: (anchor) => openTableGrid(anchor, (rows, cols) => a.table(rows, cols)),
    rule: () => chain().setHorizontalRule().run(),
    // תיבה בזרימת הטקסט: callout עם הסימון [!TALI-BOX] (ראו AGENTS.md)
    textBox: () => chain().insertContent({ type: 'blockquote', content: [
      { type: 'paragraph', content: [{ type: 'text', text: '[!TALI-BOX]' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'טקסט בתוך התיבה' }] },
    ] }).run(),
    floatingBox: () => hooks.onOverlayDraw?.('textbox'),
    pageDrawing: () => hooks.onOverlayDraw?.(),
    drawing: () => hooks.onDraw?.(),
    image: () => hooks.onImage?.(),
    taskSection: () => hooks.onTaskSection?.(),

    // נוסחה בשורה: $...$ כטקסט (כמו נוסחה שנכתבה ביד), והתוכן מסומן כדי להקליד מיד.
    // אם יש טקסט מסומן, הוא הופך לנוסחה.
    mathInline() {
      const { from, to } = editor.state.selection;
      const tex = selectedText().trim() || 'x';
      const { state, view } = editor;
      let tr = state.tr.replaceWith(from, to, state.schema.text(`$${tex}$`));
      tr = tr.setSelection(TextSelection.create(tr.doc, from + 1, from + 1 + tex.length));
      view.dispatch(tr.scrollIntoView());
      view.focus();
    },
    // נוסחה בשורה נפרדת: פסקה שכל התוכן שלה $$...$$. מוצגת כנוסחה מרכזית ונערכת במקום,
    // ובקובץ היא שורה של $$...$$, כמו באובסידיאן.
    mathBlock() {
      const tex = selectedText().trim() || 'x';
      const { state, view } = editor;
      const text = state.schema.text(`$$${tex}$$`);
      let tr = state.tr;
      let start;
      const $sel = state.selection.$from;
      if ($sel.parent.type.name === 'paragraph' && $sel.parent.content.size === 0) {
        start = $sel.pos; // פסקה ריקה: הנוסחה נכנסת אליה
        tr = tr.insert(start, text);
      } else {
        if (!state.selection.empty) tr = tr.deleteSelection();
        const $p = tr.selection.$from;
        const after = $p.after();
        tr = tr.insert(after, state.schema.nodes.paragraph.create(null, text));
        start = after + 1;
      }
      tr = tr.setSelection(TextSelection.create(tr.doc, start + 2, start + 2 + tex.length));
      view.dispatch(tr.scrollIntoView());
      view.focus();
    },
    // קישור למסמך: עם טקסט מסומן, הוא הופך ל־[[קישור]]. בלי, נכנס [[ וההשלמה האוטומטית נפתחת.
    link() {
      const text = selectedText().trim();
      const type = editor.schema.nodes.wikiLink;
      if (text && type && !text.includes('\n')) {
        const { from, to } = editor.state.selection;
        editor.view.dispatch(editor.state.tr.replaceWith(from, to, type.create({ target: text })).scrollIntoView());
        editor.view.focus();
        return;
      }
      chain().insertContent({ type: 'text', text: '[[' }).run();
    },
  };
  return a;
}
