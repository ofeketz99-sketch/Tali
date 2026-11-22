// סרגל הכלים העליון. מחולק לקבוצות:
// ביטול/חזרה · סגנון פסקה · B I U S · צבעים · רשימות וציטוט · יישור · הוספה (טבלה, תמונה, ציור...) · Markdown
// 8.3: ועוד קבוצות רשות שמוסתרות עד שמסמנים אותן בהגדרות (toolbar-layout.js): כותרות, קוד, הוספה מהירה, ציור, ייצוא
// כפתור חדש: מוסיפים אותו לקבוצה המתאימה ב־buildToolbar. tip הוא ההסבר שמופיע בריחוף.
import { icon } from './icons.js';
import { createEditActions } from './edit-actions.js';
import { itemGroup, normalizeToolbar } from './toolbar-layout.js';

const TEXT_COLORS = [
  [null, 'ברירת מחדל'], ['#d64545', 'אדום'], ['#e07b2a', 'כתום'], ['#b8860b', 'חרדל'], ['#2f9e6a', 'ירוק'],
  ['#2b7fc4', 'כחול'], ['#7a5bd0', 'סגול'], ['#d0558f', 'ורוד'], ['#7b7f87', 'אפור'],
];
const HIGHLIGHTS = [
  [null, 'ללא'], ['#fff3a3', 'צהוב'], ['#ffd8b0', 'כתום'], ['#c9f0d6', 'ירוק'], ['#cde9fb', 'תכלת'],
  ['#e5dcfb', 'סגול'], ['#fbd3e4', 'ורוד'], ['#e7e7e7', 'אפור'],
];
const STYLES = [
  ['paragraph', 'טקסט רגיל', '1em'], ['h1', 'כותרת 1', '1.5em'], ['h2', 'כותרת 2', '1.3em'], ['h3', 'כותרת 3', '1.12em'],
];

// ===== תפריט קופץ קטן מתחת לכפתור =====
let openMenuEl = null;
let openMenuOnClose = null;
let fallbackAnchor = null; // כפתור "עוד": עוגן לתפריט של כפתור שחזר לקבוצה מוסתרת
export function closeMenu() {
  const fn = openMenuOnClose;
  openMenuOnClose = null;
  fn?.();
  openMenuEl?.remove();
  openMenuEl = null;
}
function openMenu(anchor, fill, onClose) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'tb-menu';
  // 11.5: תפריט שנפתח מהסרגל הצף (צבע וכו') לא מסתיר אותו; כל תפריט אחר כן (styles.css)
  if (anchor.closest?.('.tb-bubble')) m.classList.add('from-bubble');
  fill(m);
  document.body.append(m);
  openMenuOnClose = onClose || null;
  if (!anchor.getClientRects().length && fallbackAnchor) anchor = fallbackAnchor;
  const r = anchor.getBoundingClientRect();
  m.style.top = r.bottom + 6 + 'px';
  m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, window.innerWidth - m.offsetWidth - 8)) + 'px';
  openMenuEl = m;
  const onDown = (e) => { if (!m.contains(e.target) && !anchor.contains(e.target)) done(); };
  const onKey = (e) => { if (e.key === 'Escape') done(); };
  function done() { closeMenu(); window.removeEventListener('mousedown', onDown, true); window.removeEventListener('keydown', onKey, true); }
  window.addEventListener('mousedown', onDown, true);
  window.addEventListener('keydown', onKey, true);
  return { menu: m, close: done };
}

export function buildToolbar(container, editorApi, actions = {}) {
  const { editor } = editorApi;
  const refreshers = [];
  const chain = () => editor.chain().focus();
  // אותן פעולות משמשות גם את תפריט הלחיצה הימנית (context-menu.js)
  const ed = createEditActions(editor, actions);

  // 8.2: לכל קבוצה מזהה (toolbar-layout.js), כדי שאפשר יהיה לסדר ולהסתיר אותה מההגדרות
  // 10.4: כל כפתור נבנה פעם אחת עם מזהה (TOOLBAR_ITEMS ב־toolbar-layout.js) ונשמר ב־items.
  // הקבוצות שבסרגל נבנות מההגדרות (applyLayout), וכפתור שלא בסרגל מחכה ב־spare (לא בדף).
  const items = {};
  const spare = document.createElement('div');
  const group = () => spare;
  const button = (parent, { html, tip, run, active, cls, id }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tb-btn ' + (cls || '');
    b.innerHTML = html;
    b.dataset.tip = tip;
    b.setAttribute('aria-label', tip);
    b.addEventListener('mousedown', (e) => e.preventDefault()); // לא לאבד את הסמן בעורך
    b.addEventListener('click', () => run(b));
    parent.append(b);
    if (id) { items[id] = b; b.dataset.item = id; }
    if (active) refreshers.push(() => b.classList.toggle('is-active', active()));
    return b;
  };

  // ===== ביטול וחזרה =====
  const g1 = group('', 'history');
  const undo = button(g1, { id: 'undo', html: icon('undo'), tip: 'ביטול (Ctrl+Z)', run: () => chain().undo().run() });
  const redo = button(g1, { id: 'redo', html: icon('redo'), tip: 'חזרה (Ctrl+Y)', run: () => chain().redo().run() });
  refreshers.push(() => { undo.disabled = !editor.can().undo(); redo.disabled = !editor.can().redo(); });

  // ===== סגנון פסקה =====
  const g2 = group('', 'style');
  const styleOf = () => (editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'paragraph');
  const applyStyle = (s) => (s === 'paragraph' ? chain().setParagraph().run() : chain().setHeading({ level: +s[1] }).run());
  const styleBtn = button(g2, {
    id: 'style', html: '', tip: 'סגנון פסקה', cls: 'tb-select',
    run: (b) => openMenu(b, (m) => {
      for (const [id, name, size] of STYLES) {
        const it = document.createElement('button');
        it.type = 'button';
        it.className = 'tb-menu-item' + (styleOf() === id ? ' on' : '');
        it.innerHTML = `<span style="font-size:${size};font-weight:${id === 'paragraph' ? 400 : 700}">${name}</span>`;
        it.addEventListener('mousedown', (e) => e.preventDefault());
        it.addEventListener('click', () => { applyStyle(id); closeMenu(); });
        m.append(it);
      }
    }),
  });
  refreshers.push(() => { styleBtn.innerHTML = `<span>${STYLES.find((s) => s[0] === styleOf())[1]}</span>${icon('chevron', 14)}`; });

  // ===== 8.3 (רשות): כותרות בלחיצה אחת =====
  const gHead = group('', 'headings');
  for (const level of [1, 2, 3]) {
    button(gHead, { id: 'h' + level, html: icon('h' + level), tip: `כותרת ${level}`, run: () => chain().toggleHeading({ level }).run(), active: () => editor.isActive('heading', { level }) });
  }

  // ===== עיצוב תווים =====
  const g3 = group('', 'marks');
  button(g3, { id: 'bold', html: icon('bold'), tip: 'מודגש (Ctrl+B)', run: () => chain().toggleBold().run(), active: () => editor.isActive('bold') });
  button(g3, { id: 'italic', html: icon('italic'), tip: 'נטוי (Ctrl+I)', run: () => chain().toggleItalic().run(), active: () => editor.isActive('italic') });
  button(g3, { id: 'underline', html: icon('underline'), tip: 'קו תחתון (Ctrl+U)', run: () => chain().toggleUnderline().run(), active: () => editor.isActive('underline') });
  button(g3, { id: 'strike', html: icon('strike'), tip: 'קו חוצה', run: () => chain().toggleStrike().run(), active: () => editor.isActive('strike') });

  // ===== 8.3 (רשות): קוד וניקוי עיצוב =====
  const gCode = group('', 'code');
  button(gCode, { id: 'code', html: icon('code'), tip: 'קוד בשורה', run: () => chain().toggleCode().run(), active: () => editor.isActive('code') });
  button(gCode, { id: 'codeBlock', html: icon('codeBlock'), tip: 'בלוק קוד', run: () => ed.codeBlock(), active: () => editor.isActive('codeBlock') });
  button(gCode, { id: 'clearFormat', html: icon('clearFormat'), tip: 'ניקוי עיצוב מהטקסט המסומן', run: () => chain().unsetAllMarks().run() });

  // ===== צבעים =====
  const g4 = group('', 'colors');
  const swatchMenu = (b, list, apply, current) => openMenu(b, (m) => {
    const grid = document.createElement('div');
    grid.className = 'tb-swatches';
    for (const [c, name] of list) {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = 'tb-swatch' + (c ? '' : ' none') + ((current() || null) === c ? ' on' : '');
      s.title = name;
      if (c) s.style.background = c;
      s.addEventListener('mousedown', (e) => e.preventDefault());
      s.addEventListener('click', () => { apply(c); closeMenu(); });
      grid.append(s);
    }
    const custom = document.createElement('label');
    custom.className = 'tb-custom';
    custom.innerHTML = '<input type="color"> צבע אחר…';
    custom.querySelector('input').addEventListener('change', (e) => { apply(e.target.value); closeMenu(); });
    m.append(grid, custom);
  });
  const colorBtn = button(g4, {
    id: 'textColor', html: `<span class="tb-a">${icon('textColor', 17)}<span class="tb-bar"></span></span>`, tip: 'צבע טקסט',
    run: (b) => swatchMenu(b, TEXT_COLORS, (c) => (c ? chain().setColor(c).run() : chain().unsetColor().run()), () => editor.getAttributes('textStyle').color),
  });
  const hlBtn = button(g4, {
    id: 'highlight', html: `<span class="tb-a">${icon('highlight', 17)}<span class="tb-bar"></span></span>`, tip: 'צבע הדגשה (מרקר)',
    run: (b) => swatchMenu(b, HIGHLIGHTS, (c) => (c ? chain().setHighlight({ color: c }).run() : chain().unsetHighlight().run()), () => editor.getAttributes('highlight').color),
  });
  refreshers.push(() => {
    colorBtn.querySelector('.tb-bar').style.background = editor.getAttributes('textStyle').color || 'var(--text)';
    hlBtn.querySelector('.tb-bar').style.background = editor.getAttributes('highlight').color || '#fff3a3';
  });

  // ===== רשימות וציטוט =====
  const g5 = group('', 'lists');
  button(g5, { id: 'bullets', html: icon('bullets'), tip: 'רשימת תבליטים', run: () => chain().toggleBulletList().run(), active: () => editor.isActive('bulletList') });
  button(g5, { id: 'numbers', html: icon('numbers'), tip: 'רשימה ממוספרת', run: () => chain().toggleOrderedList().run(), active: () => editor.isActive('orderedList') });
  button(g5, { id: 'tasks', html: icon('tasks'), tip: 'רשימת משימות', run: () => chain().toggleTaskList().run(), active: () => editor.isActive('taskList') });
  const activeList = () => ['bulletList', 'orderedList', 'taskList'].find((name) => editor.isActive(name));
  const rtlList = button(g5, { id: 'listRtl', html: icon('alignRight'), tip: 'כיוון הרשימה: ימין לשמאל', run: () => ed.listDirection('rtl'), active: () => !!activeList() && editor.getAttributes(activeList()).dir === 'rtl' });
  const ltrList = button(g5, { id: 'listLtr', html: icon('alignLeft'), tip: 'כיוון הרשימה: שמאל לימין', run: () => ed.listDirection('ltr'), active: () => !!activeList() && editor.getAttributes(activeList()).dir === 'ltr' });
  refreshers.push(() => { rtlList.disabled = ltrList.disabled = !activeList(); });
  button(g5, { id: 'quote', html: icon('quote'), tip: 'ציטוט', run: () => chain().toggleBlockquote().run(), active: () => editor.isActive('blockquote') });

  // ===== יישור =====
  const g6 = group('', 'align');
  button(g6, { id: 'alignRight', html: icon('alignRight'), tip: 'יישור לימין', run: () => chain().setTextAlign('right').run(), active: () => editor.isActive({ textAlign: 'right' }) });
  button(g6, { id: 'alignCenter', html: icon('alignCenter'), tip: 'מרכוז', run: () => chain().setTextAlign('center').run(), active: () => editor.isActive({ textAlign: 'center' }) });
  button(g6, { id: 'alignLeft', html: icon('alignLeft'), tip: 'יישור לשמאל', run: () => chain().setTextAlign('left').run(), active: () => editor.isActive({ textAlign: 'left' }) });

  // ===== הוספה =====
  const g7 = group('', 'insert');
  const insertBtn = button(g7, {
    id: 'insertMenu', html: `${icon('insert')}<span>הוספה</span>${icon('chevron', 14)}`, tip: 'הוספת טבלה, תמונה, ציור ועוד', cls: 'tb-select',
    run: (b) => openMenu(b, (m) => {
      const items = [
        ['table', 'טבלה', () => ed.pickTable(insertBtn)],
        ['image', 'תמונה', ed.image],
        ['math', 'נוסחה בשורה', ed.mathInline],
        ['mathBlock', 'נוסחה בשורה נפרדת', ed.mathBlock],
        ['symbol', 'סמל מיוחד (α ∀ →)', ed.symbol],
        ['link', 'קישור למסמך', ed.link],
        ['draw', 'ציור (נשמר כתמונה)', ed.drawing],
        ['rect', 'מסגרת סביב טקסט', ed.textBox],
        ['code', 'בלוק קוד', ed.codeBlock],
        ['rule', 'קו מפריד', ed.rule],
        ['taskSection', 'משימות להמשך', ed.taskSection],
        // 11.2: כמו בתפריט הימני: קודם מה שנכנס לטקסט, ואחרי קו מה שזז חופשי על הדף
        'חופשי על הדף',
        ['comment', 'הערת שוליים', ed.marginComment],
        ['textBox', 'תיבת טקסט שזזה חופשי', ed.floatingBox],
        ['pen', 'שרטוט חופשי על הדף', ed.pageDrawing],
      ];
      for (const item of items) {
        if (typeof item === 'string') {
          m.append(Object.assign(document.createElement('div'), { className: 'tb-menu-heading', textContent: item }));
          continue;
        }
        const [ic, name, run] = item;
        const it = document.createElement('button');
        it.type = 'button';
        it.className = 'tb-menu-item with-icon';
        it.innerHTML = `${icon(ic)}<span>${name}</span>`;
        it.addEventListener('mousedown', (e) => e.preventDefault());
        it.addEventListener('click', () => { closeMenu(); run(); });
        m.append(it);
      }
    }),
  });

  // ===== 8.2: שרטוט על הדף ותיבת טקסט חופשית, תמיד בסרגל (לא רק בתוך "הוספה") =====
  const gDraw = group('', 'draw');
  button(gDraw, { id: 'pageDraw', html: icon('pen'), tip: 'שרטוט על הדף: עט, קווים וצורות שזזים חופשי', run: () => ed.pageDrawing() });
  button(gDraw, { id: 'floatBox', html: icon('textBox'), tip: 'תיבת טקסט שזזה חופשי על הדף', run: () => ed.floatingBox() });

  // ===== 8.3 (רשות): הוספה מהירה, בלי לפתוח את "הוספה" =====
  const gQuick = group('', 'quickInsert');
  const tableBtn = button(gQuick, { id: 'table', html: icon('table'), tip: 'טבלה', run: () => ed.pickTable(tableBtn) });
  button(gQuick, { id: 'image', html: icon('image'), tip: 'תמונה מקובץ', run: () => ed.image() });
  button(gQuick, { id: 'link', html: icon('link'), tip: 'קישור למסמך', run: () => ed.link() });
  button(gQuick, { id: 'math', html: icon('math'), tip: 'נוסחה', run: () => ed.mathInline() });
  button(gQuick, { id: 'symbol', html: icon('symbol'), tip: 'סמל מיוחד בטקסט (α ∀ → ⊂)', run: () => ed.symbol() });
  button(gQuick, { id: 'taskSection', html: icon('taskSection'), tip: 'משימות להמשך', run: () => ed.taskSection() });
  button(gQuick, { id: 'rule', html: icon('rule'), tip: 'קו מפריד', run: () => ed.rule() });

  // ===== 8.3 (רשות): ציור שנשמר כתמונה והערת שוליים =====
  const gDrawExtra = group('', 'drawExtra');
  button(gDrawExtra, { id: 'drawing', html: icon('draw'), tip: 'ציור (נשמר כתמונה)', run: () => ed.drawing() });
  button(gDrawExtra, { id: 'comment', html: icon('comment'), tip: 'הערת שוליים: הלחיצה הבאה בדף קובעת את מקומה. טקסט מסומן נקשר אליה', run: () => ed.marginComment() });

  // ===== 8.3 (רשות): ייצוא =====
  const gExport = group('', 'export');
  button(gExport, { id: 'exportPdf', html: icon('exportPdf'), tip: 'ייצוא ל־PDF', run: () => actions.onExport?.('pdf') });
  button(gExport, { id: 'exportWord', html: icon('exportWord'), tip: 'ייצוא ל־Word', run: () => actions.onExport?.('docx') });

  // ===== עוד: קבוצות שלא נכנסות בשורה אחת עוברות לתפריט =====
  const gMore = document.createElement('div');
  gMore.className = 'tb-group tb-more';
  const moreBtn = button(gMore, { html: icon('more', 19), tip: 'עוד כלים', run: () => openMore() });
  gMore.hidden = true; // מופיע רק כש־fit מסתיר קבוצה
  fallbackAnchor = moreBtn;

  // ===== מצב מיקוד ותצוגת Markdown =====
  const g8 = group('tb-end', 'view');
  button(g8, { id: 'focus', html: icon('focus', 19), tip: 'מצב מיקוד: רק הדף', run: () => actions.onFocusMode?.() });
  button(g8, { id: 'sleep', html: icon('sleep', 19), tip: 'מצב שינה: רק הסמל, עד לחיצה או מקש (Ctrl+Alt+L)', run: () => actions.onSleep?.() });
  const rawBtn = button(g8, {
    id: 'raw', html: icon('markdown', 20), tip: 'תצוגת Markdown: הטקסט הגולמי של המסמך (Ctrl+E)',
    run: () => rawBtn.classList.toggle('is-active', editorApi.toggleRaw()),
  });
  rawBtn.id = 'btnRaw';

  // ----- 10.4: קבוצות לפי ההגדרות (toolbar-layout.js), והתאמה לרוחב -----
  // כשאין מקום, קבוצות עוברות לתפריט "עוד" לפי סדר קבוע של הקבוצה המקורית של הכפתורים שבהן
  // (קבוצה מעורבת: לפי הכפתור הכי חשוב בה). קבוצה עם כלי תצוגה (מיקוד, שינה, Markdown) אף פעם לא עוברת.
  // בחלון קטן (compact) הקבוצות עד "שרטוט" עוברות ל"עוד" תמיד. הקבוצה האחרונה נדחקת לקצה (tb-end).
  const RANK = { export: 0, drawExtra: 1, quickInsert: 2, code: 3, headings: 4, align: 5, colors: 6, lists: 7, history: 8, draw: 9, marks: 10, style: 11, insert: 12, view: 99 };
  const COMPACT_RANK = 9;
  let sectionEls = [];
  let hiddenGroups = [];
  let compactWindow = false;
  const rankOf = (g) => Math.max(...g._items.map((id) => RANK[itemGroup(id)] ?? 5));
  const collapsible = () => sectionEls
    .map((g, i) => ({ g, i, r: rankOf(g) }))
    .filter((x) => x.r < 99)
    .sort((a, b) => a.r - b.r || b.i - a.i)
    .map((x) => x.g);
  const putBack = () => {
    for (const g of sectionEls) { container.append(g); g.hidden = hiddenGroups.includes(g); }
    container.append(gMore);
  };
  function applyLayout(sections) {
    closeMenu();
    for (const g of sectionEls) g.remove();
    for (const b of Object.values(items)) spare.append(b);
    const list = (Array.isArray(sections) ? sections : normalizeToolbar({}))
      .map((sec) => sec.items.filter((id) => items[id])).filter((ids) => ids.length);
    sectionEls = list.map((ids, i) => {
      const g = document.createElement('div');
      g.className = 'tb-group' + (i === list.length - 1 && list.length > 1 ? ' tb-end' : '');
      g._items = ids;
      for (const id of ids) g.append(items[id]);
      return g;
    });
    hiddenGroups = [];
    fit();
  }
  function setCompact(on) {
    compactWindow = !!on;
    container.dataset.compact = compactWindow ? '1' : '0';
    fit();
  }
  function fit() {
    if (openMenuEl && openMenuEl.classList.contains('tb-more-menu')) closeMenu();
    hiddenGroups = [];
    putBack();
    gMore.hidden = true;
    const order = collapsible();
    if (compactWindow) {
      for (const g of order.filter((x) => rankOf(x) <= COMPACT_RANK)) {
        g.hidden = true;
        hiddenGroups.push(g);
        gMore.hidden = false;
      }
    }
    const over = () => container.scrollWidth > container.clientWidth + 1;
    for (const g of order) {
      if (!over()) break;
      if (hiddenGroups.includes(g)) continue;
      g.hidden = true;
      hiddenGroups.push(g);
      gMore.hidden = false;
    }
  }
  function openMore() {
    if (!hiddenGroups.length) return;
    openMenu(moreBtn, (m) => {
      m.classList.add('tb-more-menu');
      // בתפריט: באותו סדר כמו בסרגל
      for (const g of sectionEls.filter((x) => hiddenGroups.includes(x))) { g.hidden = false; m.append(g); }
    }, putBack);
  }
  applyLayout(normalizeToolbar({}));
  new ResizeObserver(() => fit()).observe(container);
  window.addEventListener('resize', () => requestAnimationFrame(fit));

  // ----- סרגל צף ליד טקסט מסומן -----
  const bubble = document.createElement('div');
  bubble.className = 'tb-bubble';
  bubble.hidden = true;
  bubble.setAttribute('role', 'toolbar');
  bubble.setAttribute('aria-label', 'עיצוב הטקסט המסומן');
  document.body.append(bubble);
  const bb = (opts) => button(bubble, opts);
  bb({ html: icon('bold', 17), tip: 'מודגש (Ctrl+B)', run: () => chain().toggleBold().run(), active: () => editor.isActive('bold') });
  bb({ html: icon('italic', 17), tip: 'נטוי (Ctrl+I)', run: () => chain().toggleItalic().run(), active: () => editor.isActive('italic') });
  bb({ html: icon('underline', 17), tip: 'קו תחתון (Ctrl+U)', run: () => chain().toggleUnderline().run(), active: () => editor.isActive('underline') });
  bb({ html: icon('strike', 17), tip: 'קו חוצה', run: () => chain().toggleStrike().run(), active: () => editor.isActive('strike') });
  bubble.append(Object.assign(document.createElement('span'), { className: 'tb-bubble-sep' }));
  bb({
    html: icon('textColor', 17), tip: 'צבע טקסט',
    run: (b) => swatchMenu(b, TEXT_COLORS, (c) => (c ? chain().setColor(c).run() : chain().unsetColor().run()), () => editor.getAttributes('textStyle').color),
  });
  bb({
    html: icon('highlight', 17), tip: 'צבע הדגשה (מרקר)', active: () => editor.isActive('highlight'),
    run: (b) => swatchMenu(b, HIGHLIGHTS, (c) => (c ? chain().setHighlight({ color: c }).run() : chain().unsetHighlight().run()), () => editor.getAttributes('highlight').color),
  });
  bb({ html: icon('code', 17), tip: 'קוד בשורה', run: () => chain().toggleCode().run(), active: () => editor.isActive('code') });
  // 11.2: הדרך הקצרה להערה על ציטוט: מסמנים, לוחצים כאן, ולוחצים בשוליים במקום שבו ההערה תופיע
  bubble.append(Object.assign(document.createElement('span'), { className: 'tb-bubble-sep' }));
  bb({ html: icon('comment', 17), tip: 'הערת שוליים על הטקסט המסומן: הלחיצה הבאה קובעת את מקומה', run: () => { bubble.hidden = true; ed.marginComment(); } });

  let selecting = false; // בזמן גרירת בחירה עם העכבר: מחכים לשחרור
  editor.view.dom.addEventListener('mousedown', () => { selecting = true; bubble.hidden = true; });
  window.addEventListener('mouseup', () => { if (selecting) { selecting = false; setTimeout(placeBubble, 0); } });
  function bubbleWanted() {
    const sel = editor.state.selection;
    if (selecting || sel.empty || editorApi.isRaw() || !editor.isFocused) return false;
    if (sel.node || sel.$anchorCell) return false; // תמונה או בחירת תאים בטבלה
    if (editor.isActive('codeBlock')) return false;
    return editor.state.doc.textBetween(sel.from, sel.to, ' ').trim().length > 0;
  }
  function placeBubble() {
    if (!bubbleWanted()) { bubble.hidden = true; return; }
    const { from, to } = editor.state.selection;
    const a = editor.view.coordsAtPos(from);
    const z = editor.view.coordsAtPos(to);
    const wasHidden = bubble.hidden;
    bubble.hidden = false;
    const w = bubble.offsetWidth;
    const h = bubble.offsetHeight;
    const top = Math.min(a.top, z.top);
    const bottom = Math.max(a.bottom, z.bottom);
    const minTop = container.getBoundingClientRect().bottom + 6;
    let y = top - h - 8;
    if (y < minTop) y = bottom + 8;
    const mid = a.top === z.top ? (a.left + z.right) / 2 : (a.left + z.left) / 2;
    bubble.style.top = Math.round(y) + 'px';
    bubble.style.left = Math.round(Math.max(8, Math.min(mid - w / 2, window.innerWidth - w - 8))) + 'px';
    if (wasHidden) { bubble.classList.remove('show'); void bubble.offsetWidth; bubble.classList.add('show'); }
  }
  editor.on('selectionUpdate', () => setTimeout(placeBubble, 0));
  editor.on('blur', () => setTimeout(() => { if (!editor.isFocused && !openMenuEl) bubble.hidden = true; }, 120));
  window.addEventListener('resize', () => { if (!bubble.hidden) placeBubble(); });
  document.addEventListener('scroll', () => { if (!bubble.hidden) placeBubble(); }, true);

  const refresh = () => { for (const fn of refreshers) fn(); };
  editor.on('transaction', refresh);
  editor.on('selectionUpdate', refresh);
  refresh();
  requestAnimationFrame(fit);
  return { hideBubble: () => { bubble.hidden = true; }, fit, edit: ed, closeMenu, applyLayout, setCompact };
}
