// פעולות עיצוב והוספה, משותפות לסרגל הכלים, לתפריט "הוספה" ולתפריט הלחיצה הימנית (context-menu.js).
// כל פעולה עוברת דרך הפקודות של TipTap/ProseMirror, ולכן היא חלק מהיסטוריית הביטול ונשמרת כמו כל עריכה.
// פעולה חדשה: מוסיפים כאן, ומשתמשים בה מכל המקומות. לא כותבים מימוש מקביל בתפריט אחר.
import { openTableGrid } from './table.js';
import { FOLLOW_UP, isFollowUpHeading } from '../vault-data.js';
import { LIST_TYPES } from './list-direction.js';
import { insertMath } from './math.js';
import { openSymbolPicker } from './symbols.js';
import { neutralIsRtl } from './smart-symbols.js';

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
    listDirection: (dir) => {
      const type = LIST_TYPES.find((name) => editor.isActive(name));
      if (!type) return false;
      const current = editor.getAttributes(type).dir || null;
      return chain().updateAttributes(type, { dir: current === dir ? null : dir }).run();
    },
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
    marginComment: () => hooks.onMarginComment?.(selectedText()),
    plainMarkdown: () => hooks.onPlainMarkdown?.(),
    pageDrawing: () => hooks.onOverlayDraw?.(),
    drawing: () => hooks.onDraw?.(),
    image: () => hooks.onImage?.(),
    taskSection: () => hooks.onTaskSection?.(),

    // משימה להמשך: נכנסת לסוף הסעיף "משימות להמשך" (עד הכותרת הבאה באותה רמה), או לסעיף חדש בסוף המסמך.
    // לא מזיז את הסמן ולא לוקח פוקוס, כדי שאפשר יהיה להוסיף כמה ברצף מלוח ההקשר.
    addFollowUp(text) {
      const { state, view } = editor;
      const { schema, doc } = state;
      const item = schema.nodes.taskItem.create({ checked: false }, schema.nodes.paragraph.create(null, text ? schema.text(text) : null));
      let head = null, end = null, lastList = null;
      doc.forEach((node, offset) => {
        if (head == null) {
          if (node.type.name === 'heading' && isFollowUpHeading(node.textContent)) head = { offset, level: node.attrs.level };
        } else if (end == null) {
          if (node.type.name === 'heading' && node.attrs.level <= head.level) end = offset;
          else if (node.type.name === 'taskList') lastList = { offset, node };
        }
      });
      let tr = state.tr;
      if (head == null) {
        tr = tr.insert(doc.content.size, [
          schema.nodes.heading.create({ level: 2 }, schema.text(FOLLOW_UP)),
          schema.nodes.taskList.create(null, item),
        ]);
      } else if (lastList) {
        tr = tr.insert(lastList.offset + lastList.node.nodeSize - 1, item);
      } else {
        tr = tr.insert(end ?? doc.content.size, schema.nodes.taskList.create(null, item));
      }
      view.dispatch(tr);
    },

    // נוסחה (9.9): חלונית עם תיבת LTR לכתיבת המקור (math.js). טקסט מסומן נכנס אליה כמקור.
    mathInline() { insertMath(editor.view); },
    // נוסחה בשורה נפרדת: בפסקה ריקה גוש $$ אמיתי, ואחרת נוסחה מרכזית בתוך השורה ($$...$$)
    mathBlock() { insertMath(editor.view, { preferBlock: true }); },
    // סמל מיוחד בטקסט רגיל (10.1): התו עצמו (α ∀ ⊂), לא LaTeX. בפסקה עברית תו שמשתקף נעטף ב־LRM.
    symbol() {
      openSymbolPicker(editor.view, { isRtlAt: (view, pos) => { const $p = view.state.doc.resolve(pos); return neutralIsRtl(view, $p, $p.parentOffset); } });
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
