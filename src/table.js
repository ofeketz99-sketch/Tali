// טבלאות "כמו בוורד": בחירת גודל בריחוף, סרגל צף מעל הטבלה, צבע רקע לתאים, מיזוג ושינוי רוחב עמודות.
//
// שמירה: טבלה פשוטה נשמרת כטבלת Markdown רגילה (נפתחת ונערכת יפה גם באובסידיאן).
// טבלה עם עיצוב שאין לו Markdown (צבע תא, תאים ממוזגים, רוחב עמודות, שורת כותרת לא ראשונה)
// נשמרת כ־HTML בתוך הקובץ, כדי שהעיצוב לא ילך לאיבוד.
import { getHTMLFromFragment } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { icon } from './icons.js';

// צבע רקע לתא, נשמר כ־style
const bgAttr = {
  backgroundColor: {
    default: null,
    parseHTML: (el) => el.style.backgroundColor || el.getAttribute('data-bg') || null,
    renderHTML: (a) => (a.backgroundColor ? { style: `background-color: ${a.backgroundColor}` } : {}),
  },
};
export const WordTableCell = TableCell.extend({ addAttributes() { return { ...this.parent?.(), ...bgAttr }; } });
export const WordTableHeader = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...bgAttr }; } });

// האם אפשר לשמור את הטבלה כ־Markdown בלי לאבד כלום
function isPlain(table) {
  let ok = true;
  table.forEach((row, _o, r) => {
    row.forEach((cell) => {
      const a = cell.attrs;
      if (a.colspan > 1 || a.rowspan > 1 || a.backgroundColor || (a.colwidth && a.colwidth.some(Boolean))) ok = false;
      if ((cell.type.name === 'tableHeader') !== (r === 0)) ok = false;
      if (cell.childCount > 1 || (cell.firstChild && cell.firstChild.type.name !== 'paragraph')) ok = false;
    });
  });
  return ok;
}

export const WordTable = Table.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          if (!isPlain(node)) {
            state.write(getHTMLFromFragment(Fragment.from(node), node.type.schema));
            state.closeBlock(node);
            return;
          }
          state.inTable = true;
          node.forEach((row, _o, i) => {
            state.write('| ');
            row.forEach((cell, _p, j) => {
              if (j) state.write(' | ');
              const p = cell.firstChild;
              if (p && p.textContent.trim()) state.renderInline(p);
            });
            state.write(' |');
            state.ensureNewLine();
            if (i === 0) {
              state.write('| ' + Array.from({ length: row.childCount }, () => '---').join(' | ') + ' |');
              state.ensureNewLine();
            }
          });
          state.closeBlock(node);
          state.inTable = false;
        },
        parse: {},
      },
    };
  },
});

// ===== בחירת גודל טבלה בריחוף, כמו בוורד =====
let grid = null;
export function openTableGrid(anchor, onPick) {
  if (!grid) {
    grid = document.createElement('div');
    grid.className = 'table-grid';
    document.body.append(grid);
  }
  const MAX_R = 8, MAX_C = 8;
  grid.innerHTML = '';
  const label = document.createElement('div');
  label.className = 'tg-label';
  const cells = document.createElement('div');
  cells.className = 'tg-cells';
  cells.style.gridTemplateColumns = `repeat(${MAX_C}, 20px)`;
  let rows = 3, cols = 3;
  const paint = () => {
    label.textContent = `${rows} שורות × ${cols} עמודות`;
    for (const c of cells.children) c.classList.toggle('on', +c.dataset.r < rows && +c.dataset.c < cols);
  };
  for (let r = 0; r < MAX_R; r++) {
    for (let c = 0; c < MAX_C; c++) {
      const cell = document.createElement('div');
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.addEventListener('mouseenter', () => { rows = r + 1; cols = c + 1; paint(); });
      cell.addEventListener('mousedown', (e) => { e.preventDefault(); close(); onPick(rows, cols); });
      cells.append(cell);
    }
  }
  const hint = document.createElement('div');
  hint.className = 'tg-hint';
  hint.textContent = 'שורה ראשונה היא כותרת · Tab עובר לתא הבא';
  grid.append(label, cells, hint);
  paint();
  const b = anchor.getBoundingClientRect();
  grid.hidden = false;
  grid.style.top = b.bottom + 6 + 'px';
  grid.style.left = Math.max(8, Math.min(b.right - grid.offsetWidth, window.innerWidth - grid.offsetWidth - 8)) + 'px';
  const onDown = (e) => { if (!grid.contains(e.target) && e.target !== anchor) close(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    grid.hidden = true;
    window.removeEventListener('mousedown', onDown, true);
    window.removeEventListener('keydown', onKey, true);
  }
  window.addEventListener('mousedown', onDown, true);
  window.addEventListener('keydown', onKey, true);
}

// ===== סרגל צף מעל הטבלה שבה נמצא הסמן =====
const CELL_COLORS = [
  [null, 'ללא'], ['#fde2e2', 'ורוד'], ['#fdebd3', 'כתום'], ['#fff6c7', 'צהוב'],
  ['#ddf3e4', 'ירוק'], ['#d9eefa', 'תכלת'], ['#e7e1f8', 'סגול'], ['#ececec', 'אפור'],
];

export function attachTableBar(editor, scroller) {
  const bar = document.createElement('div');
  bar.className = 'table-bar';
  bar.hidden = true;
  document.body.append(bar);

  const btn = (label, title, run, extra = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = label;
    b.dataset.tip = title;
    b.setAttribute('aria-label', title);
    if (extra) b.className = extra;
    b.addEventListener('mousedown', (e) => e.preventDefault()); // לא לאבד את הסמן בטבלה
    b.addEventListener('click', () => { run(); update(); });
    bar.append(b);
    return b;
  };
  const sep = () => { const s = document.createElement('span'); s.className = 'sep'; bar.append(s); };
  const chain = () => editor.chain().focus();

  const lbl = (ic, text) => `${icon(ic, 15)}${text ? `<span>${text}</span>` : ''}`;
  btn(lbl('rowBefore'), 'הוספת שורה מעל', () => chain().addRowBefore().run());
  btn(lbl('rowAfter'), 'הוספת שורה מתחת', () => chain().addRowAfter().run());
  // הטבלה מימין לשמאל: "לפני" בסדר העמודות הוא מימין
  btn(lbl('colBefore'), 'הוספת עמודה מימין', () => chain().addColumnBefore().run());
  btn(lbl('colAfter'), 'הוספת עמודה משמאל', () => chain().addColumnAfter().run());
  sep();
  const deleteRowBtn = btn(lbl('deleteRow', 'שורה'), 'מחיקת השורה הנוכחית', () => chain().deleteRow().run());
  const deleteColBtn = btn(lbl('deleteCol', 'עמודה'), 'מחיקת העמודה הנוכחית', () => chain().deleteColumn().run());
  sep();
  btn(lbl('copy', 'העתקת טבלה'), 'העתקת הטבלה השלמה, כולל תוכן ועיצוב, ללוח', async () => {
    const table = tableElement();
    if (!table) return;
    const rows = [...table.rows].map((row) => [...row.cells].map((cell) => cell.innerText.replace(/\s*\n\s*/g, ' ').trim()).join('\t')).join('\n');
    try { await window.api.copyTable(table.outerHTML, rows); }
    catch (err) { console.error('Failed to copy table', err); }
  });
  sep();
  const merge = btn(lbl('merge', 'מיזוג'), 'מיזוג התאים המסומנים, או פיצול תא ממוזג', () => chain().mergeOrSplit().run());
  btn(lbl('header', 'כותרת'), 'שורת כותרת מודגשת (הפעלה/כיבוי)', () => chain().toggleHeaderRow().run());
  const colorBtn = btn(lbl('palette', 'צבע'), 'צבע רקע לתאים המסומנים', () => toggleColors());
  sep();
  btn(lbl('trash'), 'מחיקת הטבלה כולה', () => chain().deleteTable().run(), 'danger');

  const colors = document.createElement('div');
  colors.className = 'tb-colors';
  colors.hidden = true;
  for (const [c, name] of CELL_COLORS) {
    const s = document.createElement('button');
    s.type = 'button';
    s.className = 'tb-swatch' + (c ? '' : ' none');
    s.title = name;
    if (c) s.style.background = c;
    s.addEventListener('mousedown', (e) => e.preventDefault());
    s.addEventListener('click', () => { chain().setCellAttribute('backgroundColor', c).run(); colors.hidden = true; });
    colors.append(s);
  }
  bar.append(colors);
  function toggleColors() { colors.hidden = !colors.hidden; }

  function tableElement() {
    const { from } = editor.state.selection;
    const at = editor.view.domAtPos(from);
    const node = at.node.nodeType === 1 ? at.node : at.node.parentElement;
    return node?.closest('table');
  }

  function update() {
    // רק כשעובדים בטבלה: הסמן בתוכה והעורך בפוקוס (לא סתם כי ההערה נפתחה עם סמן בטבלה)
    const table = editor.isFocused && editor.isActive('table') ? tableElement() : null;
    if (!table) { bar.hidden = true; colors.hidden = true; return; }
    merge.innerHTML = editor.can().splitCell() ? lbl('split', 'פיצול') : lbl('merge', 'מיזוג');
    deleteRowBtn.disabled = !editor.can().deleteRow();
    deleteColBtn.disabled = !editor.can().deleteColumn();
    colorBtn.disabled = !editor.can().setCellAttribute('backgroundColor', null);
    bar.hidden = false;
    const r = table.getBoundingClientRect();
    const top = Math.max(r.top - bar.offsetHeight - 6, 60);
    bar.style.top = top + 'px';
    bar.style.left = Math.max(8, Math.min(r.right - bar.offsetWidth, window.innerWidth - bar.offsetWidth - 8)) + 'px';
  }
  editor.on('selectionUpdate', update);
  editor.on('focus', update);
  editor.on('transaction', update);
  editor.on('blur', () => setTimeout(() => { if (!bar.contains(document.activeElement)) { bar.hidden = true; colors.hidden = true; } }, 150));
  scroller.addEventListener('scroll', () => { if (!bar.hidden) update(); });
  window.addEventListener('resize', () => { if (!bar.hidden) update(); });
}
