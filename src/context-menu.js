// תפריט הלחיצה הימנית על הדף ועל שדות טקסט.
// • בעורך: העתקה/הדבקה, עיצוב (B I U S, כותרת, רשימה, ציטוט, קוד) והוספה (טבלה, נוסחה, תמונה, קישור,
//   קו מפריד, תיבת טקסט, ציור). כל הפעולות מ־edit-actions.js, אותן פעולות של הסרגל העליון.
// • בשדה טקסט (חיפוש, מאפיינים, תצוגת Markdown וכו'): גזירה, העתקה, הדבקה ובחירת הכול.
// • בכל מקום אחר לא מתערבים: לעץ המסמכים יש תפריט משלו (renderer.js).
// התפריט לא לוקח פוקוס: העורך שומר את הבחירה, והמקלדת נתפסת בשלב הלכידה כל עוד התפריט פתוח.
import { TextSelection } from '@tiptap/pm/state';
import { icon } from './icons.js';
import { moveBlock } from './list-keys.js';
import { findTaliBox, deleteTaliBox, unwrapTaliBox } from './text-box.js';

const SUB_OPEN_DELAY = 110;
const SUB_CLOSE_DELAY = 260;

let current = null; // { root, close }

export function closeContextMenu() { current?.close(); }
// תפריט משותף לכל האפליקציה (עץ, כרטיסיות, מסך הבית), באותו מראה ובאותה התנהגות מקלדת
export function openContextMenu(x, y, items, opts) { openMenu(x, y, items, opts); }
export const isContextMenuOpen = () => !!current;

// items: [{ label, icon, keys, run, disabled, active, sub: items | (el) => void }, 'sep', { row: [items] }]
function openMenu(x, y, items, { onClose } = {}) {
  closeContextMenu();
  const menus = []; // [{ el, items, index, parentItem }]
  let subTimer = null;

  const root = document.createElement('div');
  root.className = 'cm-layer';
  document.body.append(root);

  function build(list, level) {
    const m = document.createElement('div');
    m.className = 'cm-menu';
    m.setAttribute('role', 'menu');
    m.addEventListener('mousedown', (e) => e.preventDefault()); // לא לגנוב את הפוקוס מהעורך
    const entries = [];
    for (const it of list) {
      if (it === 'sep') { m.append(Object.assign(document.createElement('div'), { className: 'cm-sep' })); continue; }
      if (it.row) {
        const r = document.createElement('div');
        r.className = 'cm-row';
        for (const b of it.row) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'cm-chip' + (b.active?.() ? ' on' : '');
          btn.innerHTML = icon(b.icon, 16);
          btn.dataset.tip = b.label;
          btn.setAttribute('aria-label', b.label);
          btn.addEventListener('click', () => activate(b));
          r.append(btn);
          entries.push({ it: b, el: btn });
        }
        m.append(r);
        continue;
      }
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'cm-item' + (it.sub ? ' has-sub' : '') + (it.active?.() ? ' on' : '') + (it.danger ? ' danger' : '');
      el.setAttribute('role', 'menuitem');
      el.disabled = !!it.disabled;
      el.innerHTML = `${it.dot !== undefined ? `<span class="flag-dot cm-dot"${it.dot ? ` data-flag="${it.dot}"` : ''}></span>` : icon(it.icon || 'plus', 16)}<span class="cm-label"></span>${it.keys ? `<kbd>${it.keys}</kbd>` : ''}${it.sub ? icon('chevronLeft', 14) : ''}`;
      el.querySelector('.cm-label').textContent = it.label;
      const entry = { it, el };
      el.addEventListener('mouseenter', () => {
        setIndex(level, entries.indexOf(entry));
        clearTimeout(subTimer);
        if (it.sub) subTimer = setTimeout(() => openSub(level, entry), SUB_OPEN_DELAY);
        else subTimer = setTimeout(() => closeFrom(level + 1), SUB_CLOSE_DELAY);
      });
      el.addEventListener('click', () => (it.sub ? openSub(level, entry, true) : activate(it)));
      m.append(el);
      entries.push(entry);
    }
    m.addEventListener('mouseenter', () => { if (level > 0) clearTimeout(subTimer); });
    root.append(m);
    menus[level] = { el: m, entries, index: -1 };
    return m;
  }

  function place(m, ax, ay, { side } = {}) {
    const W = innerWidth, H = innerHeight, w = m.offsetWidth, h = m.offsetHeight, pad = 8;
    let left, top;
    if (side) { // תפריט משנה ליד פריט: קודם שמאלה (RTL), ואם אין מקום ימינה
      left = side.left - w + 2;
      if (left < pad) left = Math.min(side.right - 2, W - w - pad);
      top = Math.min(side.top - 5, H - h - pad);
    } else { // ליד העכבר: הפינה הימנית העליונה של התפריט בנקודת הלחיצה, ואם אין מקום הופכים כיוון
      left = ax - w - 2;
      if (left < pad) left = Math.min(ax + 2, W - w - pad);
      top = ay + 2;
      if (top + h > H - pad) top = Math.max(pad, ay - h - 2);
    }
    m.style.left = Math.max(pad, left) + 'px';
    m.style.top = Math.max(pad, top) + 'px';
  }

  function closeFrom(level) {
    while (menus.length > level) menus.pop().el.remove();
  }
  function openSub(level, entry, focusFirst = false) {
    clearTimeout(subTimer);
    if (menus[level + 1]?.parent === entry) { if (focusFirst) setIndex(level + 1, firstEnabled(level + 1)); return; }
    closeFrom(level + 1);
    for (const e of menus[level].entries) e.el.classList.toggle('sub-open', e === entry);
    if (typeof entry.it.sub === 'function') {
      // תוכן מיוחד (למשל בורר הטבלה): מקבל מיכל ריק
      const m = document.createElement('div');
      m.className = 'cm-menu cm-custom';
      m.addEventListener('mousedown', (e) => e.preventDefault());
      m.addEventListener('mouseenter', () => clearTimeout(subTimer));
      root.append(m);
      entry.it.sub(m, () => close());
      menus[level + 1] = { el: m, entries: [], index: -1, parent: entry };
      place(m, 0, 0, { side: entry.el.getBoundingClientRect() });
      return;
    }
    const m = build(entry.it.sub, level + 1);
    menus[level + 1].parent = entry;
    place(m, 0, 0, { side: entry.el.getBoundingClientRect() });
    if (focusFirst) setIndex(level + 1, firstEnabled(level + 1));
  }
  const firstEnabled = (level) => menus[level].entries.findIndex((e) => !e.el.disabled);
  function setIndex(level, i) {
    const menu = menus[level];
    if (!menu) return;
    menu.index = i;
    menu.entries.forEach((e, k) => e.el.classList.toggle('kb', k === i));
  }
  function activate(it) {
    if (it.disabled) return;
    close();
    it.run?.();
  }

  // ----- מקלדת: חצים, Enter, Escape. בתפריט מימין לשמאל, חץ שמאלה פותח תפריט משנה -----
  function onKey(e) {
    const level = menus.length - 1;
    const menu = menus[level];
    const move = (d) => {
      const n = menu.entries.length;
      if (!n) return;
      let i = menu.index;
      for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!menu.entries[i].el.disabled) break; }
      setIndex(level, i);
    };
    if (e.key === 'Escape') { if (level > 0) closeFrom(level); else close(); }
    else if (e.key === 'ArrowDown') move(1);
    else if (e.key === 'ArrowUp') move(-1);
    else if (e.key === 'ArrowLeft' || e.key === 'Enter' || e.key === ' ') {
      const entry = menu.entries[menu.index];
      if (entry?.it.sub) openSub(level, entry, true);
      else if (entry && e.key !== 'ArrowLeft') activate(entry.it);
    } else if (e.key === 'ArrowRight') { if (level > 0) closeFrom(level); }
    else if (e.key === 'Tab') { /* נשארים בתפריט */ }
    else { close(); return; } // מקש אחר: סוגרים ונותנים לו לעבור לעורך
    e.preventDefault();
    e.stopPropagation();
  }
  function onDown(e) { if (!root.contains(e.target)) close(); }
  function close() {
    if (current?.root !== root) return;
    current = null;
    clearTimeout(subTimer);
    root.remove();
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('blur', close);
    window.removeEventListener('resize', close);
    document.removeEventListener('scroll', close, true);
    onClose?.();
  }

  const m = build(items, 0);
  place(m, x, y);
  m.classList.add('cm-in');
  current = { root, close };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('blur', close);
  window.addEventListener('resize', close);
  document.addEventListener('scroll', close, true);
}

// ---------- חיבור לאפליקציה ----------
// link: { open(target, mode) } – mode: 'tab' | 'side'. other(e): תפריט לשאר האזורים, מחזיר items או null.
// completedAtBottom: { get(), toggle() } — ההגדרה "משימות שבוצעו בסוף הרשימה", גם מתוך תפריט הרשימה
export function setupContextMenus({ editorApi, edit, isNoteOpen, clipboard, link, other, completedAtBottom }) {
  const editor = editorApi.editor;
  const sel = () => editor.state.selection;
  const has = (name, attrs) => editor.isActive(name, attrs);
  const inCode = () => has('codeBlock');

  // קישור [[...]] שנלחץ: פתיחה, בכרטיסייה חדשה, לצד, והעתקה
  function linkItems(target) {
    return [
      { label: 'פתיחת הקישור', icon: 'link', run: () => link.open(target) },
      { label: 'פתיחה בכרטיסייה חדשה', icon: 'filePlus', keys: 'Ctrl+לחיצה', run: () => link.open(target, 'tab') },
      { label: 'פתיחה לצד', icon: 'splitView', run: () => link.open(target, 'side') },
      { label: 'העתקת הקישור', icon: 'copy', run: () => navigator.clipboard?.writeText(`[[${target}]]`) },
      ...locateItems(target),
      'sep',
    ];
  }
  // 11.2: איפה המסמך המקושר שמור (לחיצה: מראה אותו בעץ), והעברה שלו לתיקייה אחרת בלי לפתוח אותו
  function locateItems(target) {
    const found = link.locate?.(target);
    if (!found) return [];
    return [
      'sep',
      { label: `שמור ב: ${found.where}`, icon: 'folder', run: found.reveal },
      { label: 'העברת המסמך המקושר לתיקייה…', icon: 'moveToFolder', run: found.move },
      ...(found.merge ? [{ label: 'מיזוג המסמך המקושר לתוך המסמך הזה…', icon: 'mergeNotes', run: found.merge }] : []),
    ];
  }
  // בתוך טבלה: פעולות השורות והעמודות, כמו בסרגל הטבלה
  function tableItems() {
    const can = editor.can();
    const run = (cmd) => () => editor.chain().focus()[cmd]().run();
    return [
      { label: 'טבלה', icon: 'table', sub: [
        { label: 'הוספת שורה מעל', icon: 'rowBefore', run: run('addRowBefore') },
        { label: 'הוספת שורה מתחת', icon: 'rowAfter', run: run('addRowAfter') },
        { label: 'הוספת עמודה מימין', icon: 'colBefore', run: run('addColumnBefore') },
        { label: 'הוספת עמודה משמאל', icon: 'colAfter', run: run('addColumnAfter') },
        'sep',
        { label: 'מחיקת השורה', icon: 'deleteRow', disabled: !can.deleteRow(), run: run('deleteRow') },
        { label: 'מחיקת העמודה', icon: 'deleteCol', disabled: !can.deleteColumn(), run: run('deleteColumn') },
        { label: 'מחיקת הטבלה', icon: 'trash', run: run('deleteTable') },
      ] },
      'sep',
    ];
  }

  function taskAtSelection() {
    const $from = editor.state.selection.$from;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === 'taskItem') return { node, pos: $from.before(d) };
    }
    return null;
  }
  function editorItems(target) {
    const empty = sel().empty;
    const wiki = link && target?.closest?.('[data-wikilink]')?.getAttribute('data-wikilink');
    // 8.0: לחיצה בתוך מסגרת בתוך הטקסט: מחיקה או הסרת המסגרת, בראש התפריט
    const box = findTaliBox(editor.state);
    const boxItems = box ? [
      { label: 'הסרת המסגרת (הטקסט נשאר)', icon: 'textBox', run: () => unwrapTaliBox(editor) },
      { label: 'מחיקת המסגרת והטקסט שבה', icon: 'trash', danger: true, run: () => deleteTaliBox(editor) },
      'sep',
    ] : [];
    // 11.5: לחיצה על משימה: סימון כבוצעה או ביטול, בראש התפריט
    const task = taskAtSelection();
    const taskItems = task ? [
      { label: task.node.attrs.checked ? 'ביטול הסימון "בוצע"' : 'סימון כבוצעה', icon: 'check',
        run: () => editor.view.dispatch(editor.state.tr.setNodeMarkup(task.pos, null, { ...task.node.attrs, checked: !task.node.attrs.checked })) },
      'sep',
    ] : [];
    return [
      ...(wiki ? linkItems(wiki) : []),
      ...(has('table') ? tableItems() : []),
      ...taskItems,
      ...boxItems,
      { label: 'גזירה', icon: 'cut', keys: 'Ctrl+X', disabled: empty, run: () => clipboard('cut') },
      { label: 'העתקה', icon: 'copy', keys: 'Ctrl+C', disabled: empty, run: () => clipboard('copy') },
      { label: 'הדבקה', icon: 'paste', keys: 'Ctrl+V', run: () => clipboard('paste') },
      'sep',
      { row: [
        { label: 'מודגש (Ctrl+B)', icon: 'bold', run: edit.bold, active: () => has('bold') },
        { label: 'נטוי (Ctrl+I)', icon: 'italic', run: edit.italic, active: () => has('italic') },
        { label: 'קו תחתון (Ctrl+U)', icon: 'underline', run: edit.underline, active: () => has('underline') },
        { label: 'קו חוצה', icon: 'strike', run: edit.strike, active: () => has('strike') },
      ] },
      { label: 'כותרת', icon: 'header', disabled: inCode(), sub: [
        { label: 'כותרת 1', icon: 'h1', run: () => edit.heading(1), active: () => has('heading', { level: 1 }) },
        { label: 'כותרת 2', icon: 'h2', run: () => edit.heading(2), active: () => has('heading', { level: 2 }) },
        { label: 'כותרת 3', icon: 'h3', run: () => edit.heading(3), active: () => has('heading', { level: 3 }) },
        { label: 'כותרת 4', icon: 'h4', run: () => edit.heading(4), active: () => has('heading', { level: 4 }) },
        { label: 'כותרת 5', icon: 'h5', run: () => edit.heading(5), active: () => has('heading', { level: 5 }) },
        { label: 'כותרת 6', icon: 'h6', run: () => edit.heading(6), active: () => has('heading', { level: 6 }) },
        { label: 'טקסט רגיל', icon: 'paragraph', run: edit.paragraph, active: () => has('paragraph') },
      ] },
      { label: 'רשימה', icon: 'bullets', disabled: inCode(), sub: [
        { label: 'רשימת תבליטים', icon: 'bullets', run: edit.bulletList, active: () => has('bulletList') },
        { label: 'רשימה ממוספרת', icon: 'numbers', run: edit.orderedList, active: () => has('orderedList') },
        { label: 'רשימת משימות', icon: 'tasks', run: edit.taskList, active: () => has('taskList') },
        { label: 'כיוון ימין לשמאל', icon: 'alignRight', run: () => edit.listDirection('rtl') },
        { label: 'כיוון שמאל לימין', icon: 'alignLeft', run: () => edit.listDirection('ltr') },
        ...(completedAtBottom ? [{ label: 'משימות שבוצעו לסוף הרשימה', icon: 'taskSection', run: completedAtBottom.toggle, active: completedAtBottom.get }] : []),
      ] },
      { label: 'הזזת השורה', icon: 'grip', sub: [
        { label: 'למעלה', icon: 'chevronUp', keys: 'Alt+↑', run: () => moveBlock(editor, -1) },
        { label: 'למטה', icon: 'chevronDown', keys: 'Alt+↓', run: () => moveBlock(editor, 1) },
      ] },
      'sep',
      // 8.0: שתי קבוצות ברורות. "בתוך הטקסט": זז עם הטקסט ונשמר כ־Markdown (נראה גם באובסידיאן).
      // "חופשי על הדף": שכבה של Tali מעל הדף, זז לכל מקום (לא מוצג באובסידיאן).
      { label: 'הוספה בתוך הטקסט', icon: 'plus', sub: [
      { label: 'טבלה', icon: 'table', disabled: inCode() || has('table'), sub: (box, done) => {
        // אותו בורר גודל כמו בסרגל (table.js), בתוך תפריט המשנה
        box.classList.add('cm-table');
        const grid = document.createElement('div');
        grid.className = 'cm-table-cells';
        const label = document.createElement('div');
        label.className = 'cm-table-label';
        let rows = 3, cols = 3;
        const paint = () => { label.textContent = `${rows} שורות × ${cols} עמודות`; for (const c of grid.children) c.classList.toggle('on', +c.dataset.r < rows && +c.dataset.c < cols); };
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
          const cell = document.createElement('div');
          cell.dataset.r = r; cell.dataset.c = c;
          cell.addEventListener('mouseenter', () => { rows = r + 1; cols = c + 1; paint(); });
          cell.addEventListener('click', () => { done(); edit.table(rows, cols); });
          grid.append(cell);
        }
        box.append(grid, label);
        paint();
      } },
      { label: 'נוסחה', icon: 'math', disabled: inCode(), sub: [
        { label: 'נוסחה בשורה  $…$', icon: 'math', run: edit.mathInline },
        { label: 'נוסחה בשורה נפרדת  $$…$$', icon: 'mathBlock', run: edit.mathBlock },
      ] },
      { label: 'סמל מיוחד (α ∀ →)', icon: 'symbol', disabled: inCode(), run: edit.symbol },
      { label: 'תמונה', icon: 'image', run: edit.image },
      { label: 'קישור למסמך', icon: 'link', disabled: inCode(), run: edit.link },
      { label: 'ציור (נשמר כתמונה)', icon: 'draw', run: edit.drawing },
      { label: 'מסגרת סביב טקסט', icon: 'rect', disabled: inCode(), run: edit.textBox },
      { label: 'ציטוט', icon: 'quote', disabled: inCode(), run: edit.quote, active: () => has('blockquote') },
      { label: 'בלוק קוד', icon: 'code', run: edit.codeBlock, active: () => has('codeBlock') },
      { label: 'קו מפריד', icon: 'rule', run: edit.rule },
      ] },
      { label: 'חופשי על הדף', icon: 'pen', sub: [
        { label: 'תיבת טקסט שזזה חופשי', icon: 'textBox', run: edit.floatingBox },
        { label: empty ? 'הערת שוליים' : 'הערת שוליים על הטקסט המסומן', icon: 'comment', run: edit.marginComment },
        { label: 'שרטוט על הדף', icon: 'pen', run: edit.pageDrawing },
        'sep',
        { label: 'המרה ל־Markdown רגיל', icon: 'file', run: edit.plainMarkdown },
      ] },
    ];
  }

  function fieldItems(field) {
    const ro = field.readOnly || field.disabled;
    const hasSel = field.selectionStart !== field.selectionEnd;
    return [
      { label: 'גזירה', icon: 'cut', keys: 'Ctrl+X', disabled: ro || !hasSel, run: () => clipboard('cut') },
      { label: 'העתקה', icon: 'copy', keys: 'Ctrl+C', disabled: !hasSel, run: () => clipboard('copy') },
      { label: 'הדבקה', icon: 'paste', keys: 'Ctrl+V', disabled: ro, run: () => clipboard('paste') },
      'sep',
      { label: 'בחירת הכול', icon: 'selectAll', keys: 'Ctrl+A', run: () => { field.focus(); field.select(); } },
    ];
  }

  document.addEventListener('contextmenu', (e) => {
    const t = e.target;
    const field = t.closest?.('input, textarea');
    if (field && !/^(checkbox|radio|range|color|button|submit|file)$/i.test(field.type)) {
      e.preventDefault();
      field.focus();
      openMenu(e.clientX, e.clientY, fieldItems(field));
      return;
    }
    // כל שטח הדף, כולל השוליים שלו (לא תיבת המאפיינים, ולא שכבת השרטוט כשהיא בעריכה)
    const page = document.getElementById('page');
    if (!isNoteOpen() || editorApi.isRaw() || !page?.contains(t) || t.closest('.props-form, .tali-overlay-toolbar')) {
      const items = other?.(e);
      if (items?.length) { e.preventDefault(); openMenu(e.clientX, e.clientY, items); }
      return;
    }
    if (t.closest('.embed-tools, .table-bar')) return;
    e.preventDefault();
    // לחיצה מחוץ לבחירה: הסמן עובר למקום הלחיצה. בתוך הבחירה: הבחירה נשמרת והפעולה חלה עליה.
    const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
    const { from, to } = sel();
    // 11.5: TextSelection.near: מקום הלחיצה יכול להיות בקצה של פריט משימה (לא בתוך טקסט), ואז setTextSelection הזהיר בקונסול
    if (pos && (pos.pos < from || pos.pos > to || from === to)) {
      const { state } = editor.view;
      editor.view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(Math.min(pos.pos, state.doc.content.size)))));
    }
    // (בשוליים posAtCoords מחזיר את המקום הקרוב ביותר בטקסט)
    editor.commands.focus(undefined, { scrollIntoView: false });
    openMenu(e.clientX, e.clientY, editorItems(t));
  });
}
