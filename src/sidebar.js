// עץ הקבצים והחיפוש בסרגל הצד.
import { icon as svg } from './icons.js';

// opening: התיקייה שנפתחה עכשיו. הפריטים שלה נכנסים באנימציה, אחד אחרי השני.
// onMove(path, destDir): גרירת הערה או תיקייה אל תיקייה (או אל שטח ריק בעץ = התיקייה הראשית, root).
const DRAG_TYPE = 'application/x-tali-path';
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// יש בתיקייה (או בתת־תיקייה) לפחות מסמך אחד. העץ מכיל רק .md, ולכן תיקיית תמונות נראית ריקה.
const notesCache = new WeakMap();
function hasNotes(n) {
  if (n.type === 'file') return true;
  if (!notesCache.has(n)) notesCache.set(n, n.children.some(hasNotes));
  return notesCache.get(n);
}
// highlight: מחרוזת לסימון בתוך השמות (סינון העץ לפי שם)
export function renderTree(container, tree, { activePath, collapsed, opening, onOpen, onToggleDir, onContext, onSelectDir, onDelete, onMove, root, flagOf, highlight }) {
  container.innerHTML = '';
  container.appendChild(buildLevel(tree));
  // פתיחה: התיקייה שנפתחה עכשיו גדלה מגובה 0 לגובה המלא (והפריטים נכנסים אחד אחרי השני, ב־CSS)
  const opened = container.querySelector('.children.opening');
  if (opened && !reduceMotion()) {
    const h = opened.scrollHeight;
    opened.style.overflow = 'hidden';
    opened.animate([{ height: '0px' }, { height: h + 'px' }], { duration: Math.min(300, 140 + h / 5), easing: 'cubic-bezier(.2, .8, .3, 1)' })
      .onfinish = () => { opened.style.overflow = ''; };
  }
  if (onMove && !container.dataset.dropReady) {
    // שטח ריק בעץ: העברה לתיקייה הראשית. מוגדר פעם אחת (העץ נבנה מחדש הרבה).
    container.dataset.dropReady = '1';
    container.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE) || e.target.closest('.node')) return;
      e.preventDefault(); container.classList.add('drop-root');
    });
    container.addEventListener('dragleave', (e) => { if (e.target === container) container.classList.remove('drop-root'); });
    container.addEventListener('drop', (e) => {
      container.classList.remove('drop-root');
      const src = e.dataTransfer.getData(DRAG_TYPE);
      if (!src || e.target.closest('.node')) return;
      e.preventDefault();
      container._onMove?.(src, container._root);
    });
  }
  container._onMove = onMove;
  container._root = root;
  const clearMarks = () => container.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));

  function buildLevel(list) {
    const frag = document.createDocumentFragment();
    // תיקייה בלי מסמכים בכלל (תמונות וקבצים מצורפים): דהויה ובסוף הרמה
    const nodes = [...list.filter((n) => n.type !== 'dir' || hasNotes(n)), ...list.filter((n) => n.type === 'dir' && !hasNotes(n))];
    nodes.forEach((n, i) => {
      const row = document.createElement('div');
      row.className = 'node ' + n.type + (n.path === activePath ? ' active' : '') + (n.type === 'dir' && !hasNotes(n) ? ' no-notes' : '');
      row.style.setProperty('--i', i);
      row.tabIndex = 0;
      row.dataset.path = n.path;
      row.addEventListener('keydown', (event) => {
        if (event.key !== 'Delete' || event.target !== row) return;
        event.preventDefault();
        event.stopPropagation();
        onDelete?.(n);
      });
      if (onMove) {
        row.draggable = true;
        row.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData(DRAG_TYPE, n.path);
          e.dataTransfer.effectAllowed = 'move';
          row.classList.add('dragging');
        });
        row.addEventListener('dragend', () => { row.classList.remove('dragging'); clearMarks(); container.classList.remove('drop-root'); });
        if (n.type === 'dir') {
          row.addEventListener('dragover', (e) => {
            if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (!row.classList.contains('drop-target')) { clearMarks(); row.classList.add('drop-target'); }
          });
          row.addEventListener('dragleave', (e) => { if (!row.contains(e.relatedTarget)) row.classList.remove('drop-target'); });
          row.addEventListener('drop', (e) => {
            e.preventDefault();
            clearMarks();
            const src = e.dataTransfer.getData(DRAG_TYPE);
            if (src && src !== n.path) onMove(src, n.path);
          });
        }
      }
      const icon = document.createElement('span');
      icon.className = 'icon';
      const label = document.createElement('span');
      label.className = 'label';
      const text = n.type === 'file' ? n.name.replace(/\.md$/i, '') : n.name;
      const at = highlight ? text.toLowerCase().indexOf(highlight.toLowerCase()) : -1;
      if (at < 0) label.textContent = text;
      else {
        const mark = document.createElement('mark');
        mark.textContent = text.slice(at, at + highlight.length);
        label.append(text.slice(0, at), mark, text.slice(at + highlight.length));
      }
      row.append(icon, label);

      if (n.type === 'dir') {
        const isCollapsed = collapsed.has(n.path);
        row.classList.toggle('collapsed', isCollapsed);
        // החץ מסתובב באנימציה (ב־CSS) בין פתוח לסגור
        icon.innerHTML = svg('chevron', 14);
        row.addEventListener('click', () => {
          onSelectDir(n.path);
          // סגירה: התוכן מתכווץ לגובה 0, ורק אז העץ נבנה מחדש
          const kids = row.nextElementSibling;
          if (!isCollapsed && kids?.classList.contains('children') && !reduceMotion()) {
            row.classList.add('collapsed');
            const h = kids.offsetHeight;
            const anim = kids.animate([{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: Math.min(260, 120 + h / 6), easing: 'cubic-bezier(.4, 0, .2, 1)' });
            kids.style.overflow = 'hidden';
            anim.onfinish = () => onToggleDir(n.path);
          } else onToggleDir(n.path);
        });
        frag.appendChild(row);
        if (!isCollapsed) {
          const kids = document.createElement('div');
          kids.className = 'children' + (n.path === opening ? ' opening' : '');
          kids.style.setProperty('--i', i);
          kids.appendChild(buildLevel(n.children));
          frag.appendChild(kids);
        }
      } else {
        icon.innerHTML = svg('file', 15);
        // דגל (flags.js): נקודה בצבע אחרי השם
        const flag = flagOf?.(n.path);
        if (flag) { const dot = document.createElement('span'); dot.className = 'flag-dot'; dot.dataset.flag = flag; row.append(dot); }
        row.addEventListener('click', () => onOpen(n.path));
        frag.appendChild(row);
      }
      row.addEventListener('contextmenu', (e) => { e.preventDefault(); onContext(n, e.clientX, e.clientY); });
    });
    return frag;
  }
}

function hitRow({ title, snippet, index, onClick }) {
  const hit = document.createElement('div');
  hit.className = 'hit';
  hit.style.setProperty('--i', Math.min(index, 12)); // נכנסים אחד אחרי השני
  const t = document.createElement('div');
  t.textContent = title;
  const s = document.createElement('small');
  s.textContent = snippet;
  hit.append(t, s);
  hit.addEventListener('click', onClick);
  return hit;
}

// רשימת ההערות שמקשרות להערה הפתוחה (מוצגת מתחת לדף)
export function renderBacklinks(container, list, onOpen) {
  container.innerHTML = '';
  const head = document.createElement('h4');
  head.textContent = list.length ? `קישורים חוזרים (${list.length})` : 'אין מסמכים שמקשרים לכאן';
  container.appendChild(head);
  list.forEach((b, i) => container.appendChild(hitRow({
    title: b.count > 1 ? `${b.name} (${b.count})` : b.name, snippet: b.snippet, index: i, onClick: () => onOpen(b.path),
  })));
}

// סינון העץ לפי שם: מסמך שהשם שלו מכיל את q, עם התיקיות שמעליו. תיקייה שהשם שלה מתאים נשארת עם כל התוכן.
export function filterTree(nodes, q) {
  const needle = q.toLowerCase();
  const out = [];
  for (const n of nodes) {
    const name = (n.type === 'file' ? n.name.replace(/\.md$/i, '') : n.name).toLowerCase();
    if (name.includes(needle)) out.push(n);
    else if (n.type === 'dir') {
      const kids = filterTree(n.children, q);
      if (kids.length) out.push({ ...n, children: kids });
    }
  }
  return out;
}
export const countFiles = (nodes) => nodes.reduce((s, n) => s + (n.type === 'file' ? 1 : countFiles(n.children)), 0);

export function renderSearchResults(container, results, onOpen) {
  container.innerHTML = '';
  if (!results.length) {
    container.textContent = 'לא נמצאו תוצאות.';
    return;
  }
  results.forEach((r, i) => container.appendChild(hitRow({ title: r.name, snippet: r.snippet, index: i, onClick: () => onOpen(r.path) })));
}
