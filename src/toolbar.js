// סרגל הכלים העליון. מחולק לקבוצות:
// ביטול/חזרה · סגנון פסקה · B I U S · צבעים · רשימות וציטוט · יישור · הוספה (טבלה, תמונה, ציור...) · Markdown
// כפתור חדש: מוסיפים אותו לקבוצה המתאימה ב־buildToolbar. tip הוא ההסבר שמופיע בריחוף.
import { openTableGrid } from './table.js';
import { icon } from './icons.js';

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
export function closeMenu() { openMenuEl?.remove(); openMenuEl = null; }
function openMenu(anchor, fill) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'tb-menu';
  fill(m);
  document.body.append(m);
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

  const group = (cls = '') => { const g = document.createElement('div'); g.className = 'tb-group ' + cls; container.append(g); return g; };
  const button = (parent, { html, tip, run, active, cls }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tb-btn ' + (cls || '');
    b.innerHTML = html;
    b.dataset.tip = tip;
    b.setAttribute('aria-label', tip);
    b.addEventListener('mousedown', (e) => e.preventDefault()); // לא לאבד את הסמן בעורך
    b.addEventListener('click', () => run(b));
    parent.append(b);
    if (active) refreshers.push(() => b.classList.toggle('is-active', active()));
    return b;
  };

  // ===== ביטול וחזרה =====
  const g1 = group();
  const undo = button(g1, { html: icon('undo'), tip: 'ביטול (Ctrl+Z)', run: () => chain().undo().run() });
  const redo = button(g1, { html: icon('redo'), tip: 'חזרה (Ctrl+Y)', run: () => chain().redo().run() });
  refreshers.push(() => { undo.disabled = !editor.can().undo(); redo.disabled = !editor.can().redo(); });

  // ===== סגנון פסקה =====
  const g2 = group();
  const styleOf = () => (editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'paragraph');
  const applyStyle = (s) => (s === 'paragraph' ? chain().setParagraph().run() : chain().setHeading({ level: +s[1] }).run());
  const styleBtn = button(g2, {
    html: '', tip: 'סגנון פסקה', cls: 'tb-select',
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

  // ===== עיצוב תווים =====
  const g3 = group();
  button(g3, { html: '<b>B</b>', tip: 'מודגש (Ctrl+B)', run: () => chain().toggleBold().run(), active: () => editor.isActive('bold') });
  button(g3, { html: '<i style="font-family:Georgia,serif">I</i>', tip: 'נטוי (Ctrl+I)', run: () => chain().toggleItalic().run(), active: () => editor.isActive('italic') });
  button(g3, { html: '<u>U</u>', tip: 'קו תחתון (Ctrl+U)', run: () => chain().toggleUnderline().run(), active: () => editor.isActive('underline') });
  button(g3, { html: '<s>S</s>', tip: 'קו חוצה', run: () => chain().toggleStrike().run(), active: () => editor.isActive('strike') });

  // ===== צבעים =====
  const g4 = group();
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
    html: '<span class="tb-a">A<span class="tb-bar"></span></span>', tip: 'צבע טקסט',
    run: (b) => swatchMenu(b, TEXT_COLORS, (c) => (c ? chain().setColor(c).run() : chain().unsetColor().run()), () => editor.getAttributes('textStyle').color),
  });
  const hlBtn = button(g4, {
    html: `<span class="tb-a">${icon('highlight', 17)}<span class="tb-bar"></span></span>`, tip: 'צבע הדגשה (מרקר)',
    run: (b) => swatchMenu(b, HIGHLIGHTS, (c) => (c ? chain().setHighlight({ color: c }).run() : chain().unsetHighlight().run()), () => editor.getAttributes('highlight').color),
  });
  refreshers.push(() => {
    colorBtn.querySelector('.tb-bar').style.background = editor.getAttributes('textStyle').color || 'var(--text)';
    hlBtn.querySelector('.tb-bar').style.background = editor.getAttributes('highlight').color || '#fff3a3';
  });

  // ===== רשימות וציטוט =====
  const g5 = group();
  button(g5, { html: icon('bullets'), tip: 'רשימת תבליטים', run: () => chain().toggleBulletList().run(), active: () => editor.isActive('bulletList') });
  button(g5, { html: icon('numbers'), tip: 'רשימה ממוספרת', run: () => chain().toggleOrderedList().run(), active: () => editor.isActive('orderedList') });
  button(g5, { html: icon('tasks'), tip: 'רשימת משימות', run: () => chain().toggleTaskList().run(), active: () => editor.isActive('taskList') });
  button(g5, { html: icon('quote'), tip: 'ציטוט', run: () => chain().toggleBlockquote().run(), active: () => editor.isActive('blockquote') });

  // ===== יישור =====
  const g6 = group();
  button(g6, { html: icon('alignRight'), tip: 'יישור לימין', run: () => chain().setTextAlign('right').run(), active: () => editor.isActive({ textAlign: 'right' }) });
  button(g6, { html: icon('alignCenter'), tip: 'מרכוז', run: () => chain().setTextAlign('center').run(), active: () => editor.isActive({ textAlign: 'center' }) });
  button(g6, { html: icon('alignLeft'), tip: 'יישור לשמאל', run: () => chain().setTextAlign('left').run(), active: () => editor.isActive({ textAlign: 'left' }) });

  // ===== הוספה =====
  const g7 = group();
  const insertBtn = button(g7, {
    html: `${icon('insert')}<span>הוספה</span>${icon('chevron', 14)}`, tip: 'הוספת טבלה, תמונה, ציור ועוד', cls: 'tb-select',
    run: (b) => openMenu(b, (m) => {
      const items = [
        ['table', 'טבלה', 'בחירת גודל בריחוף', () => openTableGrid(insertBtn, (rows, cols) => chain().insertTable({ rows, cols, withHeaderRow: true }).run())],
        ['image', 'תמונה', 'מהמחשב. אפשר גם להדביק או לגרור', () => actions.onImage?.()],
        ['draw', 'ציור', 'לחיצה כפולה על ציור עורכת אותו', () => actions.onDraw?.()],
        ['draw', 'שרטוט מהיר', 'חץ, קו, צורה או שרטוט חופשי עם רקע שקוף', () => actions.onQuickDraw?.()],
        ['code', 'בלוק קוד', '', () => chain().toggleCodeBlock().run()],
        ['rule', 'קו מפריד', '', () => chain().setHorizontalRule().run()],
      ];
      for (const [ic, name, hint, run] of items) {
        const it = document.createElement('button');
        it.type = 'button';
        it.className = 'tb-menu-item with-icon';
        it.innerHTML = `${icon(ic)}<span><span>${name}</span>${hint ? `<small>${hint}</small>` : ''}</span>`;
        it.addEventListener('mousedown', (e) => e.preventDefault());
        it.addEventListener('click', () => { closeMenu(); run(); });
        m.append(it);
      }
    }),
  });

  // ===== תצוגת Markdown =====
  const g8 = group('tb-end');
  const rawBtn = button(g8, {
    html: icon('markdown', 20), tip: 'תצוגת Markdown: הטקסט הגולמי של ההערה (Ctrl+E)',
    run: () => rawBtn.classList.toggle('is-active', editorApi.toggleRaw()),
  });
  rawBtn.id = 'btnRaw';

  const refresh = () => { for (const fn of refreshers) fn(); };
  editor.on('transaction', refresh);
  editor.on('selectionUpdate', refresh);
  refresh();
}
