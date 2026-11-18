// עץ הקבצים והחיפוש בסרגל הצד.
import { icon as svg, lucide } from './icons.js';

// opening: התיקייה שנפתחה עכשיו. הפריטים שלה נכנסים באנימציה, אחד אחרי השני.
// onMove(path, destDir): גרירת הערה או תיקייה אל תיקייה (או אל שטח ריק בעץ = התיקייה הראשית, root).
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// יש בתיקייה (או בתת־תיקייה) לפחות מסמך אחד. העץ מכיל רק .md, ולכן תיקיית תמונות נראית ריקה.
const notesCache = new WeakMap();
function hasNotes(n) {
  if (n.type === 'file') return true;
  if (!notesCache.has(n)) notesCache.set(n, n.children.some(hasNotes));
  return notesCache.get(n);
}
// highlight: מחרוזת לסימון בתוך השמות (סינון העץ לפי שם)
export function renderTree(container, tree, { activePath, collapsed, opening, onOpen, onToggleDir, onContext, onSelectDir, onDelete, onMove, root, flagOf, highlight, iconOf, backgroundOf, onReorder, onStep }) {
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
  // מה שהגרירה צריכה (העץ נבנה מחדש הרבה, גם באמצע גרירה כשתיקייה נפתחת לבד)
  container._tree = { onMove, onReorder, onToggleDir, collapsed, root };
  if (drag?.container === container) drag.refresh();

  function buildLevel(list) {
    const frag = document.createDocumentFragment();
    // תיקייה בלי מסמכים בכלל (תמונות וקבצים מצורפים): דהויה ובסוף הרמה
    // תיקייה בלי מסמכים: בסוף הרמה, אלא אם המשתמש סידר את הרמה הזו ידנית (list.custom, מ־vault-meta)
    const sorted = list.custom ? [...list] : [...list.filter((n) => n.type !== 'dir' || hasNotes(n)), ...list.filter((n) => n.type === 'dir' && !hasNotes(n))];
    const nodes = [...sorted.filter((n) => !n.archive), ...sorted.filter((n) => n.archive)]; // הארכיון תמיד אחרון
    nodes.forEach((n, i) => {
      const row = document.createElement('div');
      row.className = 'node ' + n.type + (n.path === activePath ? ' active' : '') + (n.type === 'dir' && !hasNotes(n) ? ' no-notes' : '');
      if (n.archive) { row.classList.add('archive'); row.dataset.tip = 'ארכיון: לא מופיע במעבר המהיר, באחרונים ובמשימות'; }
      row.style.setProperty('--i', i);
      row.tabIndex = 0;
      row.dataset.path = n.path;
      const background = backgroundOf?.(n.path);
      if (background) {
        row.classList.add('folder-tinted');
        row.style.setProperty('--folder-tint', `var(--graph-${background.color})`);
        row.style.setProperty('--folder-alpha', `${background.opacity}%`);
      }
      row.addEventListener('keydown', (event) => {
        if (event.target !== row) return;
        // Alt+↑/↓ על שורה ממוקדת: הזזה למעלה/למטה בתוך התיקייה (סדר ידני)
        if (event.altKey && !event.ctrlKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && onStep) {
          event.preventDefault();
          event.stopPropagation();
          onStep(n.path, event.key === 'ArrowUp' ? -1 : 1);
          return;
        }
        if (event.key !== 'Delete') return;
        event.preventDefault();
        event.stopPropagation();
        onDelete?.(n);
      });
      // 11.1: גרירה בעכבר משלנו (startTreeDrag), לא HTML5 drag
      if (onMove) row.addEventListener('pointerdown', (e) => startTreeDrag(e, row, n, container));
      if (drag && drag.src === n.path) row.classList.add('dragging');
      if (landed && landed.path === n.path) row.classList.add('landed');
      const icon = document.createElement('span');
      icon.className = 'icon';
      const label = document.createElement('span');
      label.className = 'label';
      const text = n.type === 'file' ? n.name.replace(/\.(md|canvas)$/i, '') : n.name;
      const at = highlight ? text.toLowerCase().indexOf(highlight.toLowerCase()) : -1;
      if (at < 0) label.textContent = text;
      else {
        const mark = document.createElement('mark');
        mark.textContent = text.slice(at, at + highlight.length);
        label.append(text.slice(0, at), mark, text.slice(at + highlight.length));
      }
      row.append(icon, label);
      // סמל שהמשתמש בחר (vault-meta): במסמך במקום סמל הקובץ, בתיקייה בין החץ לשם
      // תיקיית הארכיון (archive, מ־archiveLast ב־renderer.js): סמל ארכיון אם לא נבחר סמל אחר
      const custom = iconOf?.(n.path) || (n.archive ? { name: 'Archive' } : null);
      const customSvg = custom ? lucide(custom.name, n.type === 'dir' ? 15 : 15) : '';
      const paint = (el) => { if (custom?.color) el.style.color = `var(--flag-${custom.color})`; };

      if (n.type === 'dir') {
        const isCollapsed = collapsed.has(n.path);
        row.classList.toggle('collapsed', isCollapsed);
        // החץ מסתובב באנימציה (ב־CSS) בין פתוח לסגור
        icon.innerHTML = svg('chevron', 14);
        if (customSvg) {
          const ci = document.createElement('span');
          ci.className = 'cust-icon';
          ci.innerHTML = customSvg;
          paint(ci);
          label.before(ci);
        }
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
        icon.innerHTML = customSvg || svg(/\.canvas$/i.test(n.name) ? 'canvas' : 'file', 15); // 10.4: מסמך גרפי
        if (customSvg) { icon.classList.add('cust-icon'); paint(icon); }
        // דגל (flags.js): נקודה בצבע אחרי השם
        const flag = flagOf?.(n.path);
        if (flag) { const dot = document.createElement('span'); dot.className = 'flag-dot'; dot.dataset.flag = flag; row.append(dot); }
        // Ctrl+לחיצה או לחיצה באמצע: בכרטיסייה חדשה
        row.addEventListener('click', (e) => onOpen(n.path, { newTab: e.ctrlKey || e.metaKey }));
        row.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); onOpen(n.path, { newTab: true }); } });
        frag.appendChild(row);
      }
      row.addEventListener('contextmenu', (e) => { e.preventDefault(); onContext(n, e.clientX, e.clientY); });
    });
    return frag;
  }
}

// ===== 11.1: גרירה בעץ =====
// עד 11.0 זו הייתה גרירת HTML5: תמונת רפאים של הדפדפן, אזור "לתוך תיקייה" של כמה פיקסלים באמצע השורה,
// בלי פתיחה של תיקייה סגורה ובלי גלילה, ולא היה ברור לאן המסמך ייפול. עכשיו:
// - תווית עם השם עוקבת אחרי העכבר, ומתחתיה לאן הוא ייכנס ("אל: תיקייה" / "סידור מחדש").
// - תיקיית היעד מוארת כולה (השורה והתוכן שלה), גם כשמצביעים על מסמך שבתוכה.
// - שורת תיקייה: כמעט כולה "לתוך"; רק פס דק בקצה העליון/התחתון הוא "לפני/אחרי" (סדר ידני).
// - תיקייה סגורה נפתחת לבד אחרי חצי שנייה מעליה. ליד הקצה העץ נגלל. שטח ריק = התיקייה הראשית. Esc מבטל.
// - אחרי השחרור השורה מהבהבת במקום החדש (landed).
let drag = null;
let landed = null;
const dirOf = (p) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')));
const baseOf = (p) => p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1);
const shown = (p, root) => (p === root ? 'התיקייה הראשית' : baseOf(p));
const inside = (p, dir) => p === dir || p.startsWith(dir + '/') || p.startsWith(dir + '\\');

// התווית משמאל לעכבר (העץ מימין לשמאל: כך היא לא מסתירה את השמות), ונשארת בתוך החלון
function ghostAt(ghost, x, y) {
  const w = ghost.offsetWidth;
  return `translate(${Math.max(4, x - w - 14)}px, ${Math.min(y + 8, window.innerHeight - ghost.offsetHeight - 4)}px)`;
}

function startTreeDrag(e, row, n, container) {
  if (e.button !== 0 || drag || e.target.closest('input, button')) return;
  const sx = e.clientX, sy = e.clientY;
  let started = false;
  const begin = () => {
    started = true;
    const ghost = document.createElement('div');
    ghost.className = 'tree-ghost';
    const head = document.createElement('div');
    head.className = 'tg-head';
    head.innerHTML = row.querySelector('.cust-icon')?.innerHTML || row.querySelector('.icon')?.innerHTML || '';
    const name = document.createElement('span');
    name.textContent = row.querySelector('.label')?.textContent || baseOf(n.path);
    head.append(name);
    const where = document.createElement('div');
    where.className = 'tg-where';
    ghost.append(head, where);
    document.body.append(ghost);
    document.documentElement.classList.add('tree-dragging');
    drag = { src: n.path, isDir: n.type === 'dir', container, ghost, where, target: null, hoverDir: null, hoverTimer: 0, x: sx, y: sy,
      scrollTimer: setInterval(() => autoScroll(), 30),
      refresh: () => { mark(); } };
    container.querySelector(`.node[data-path="${CSS.escape(n.path)}"]`)?.classList.add('dragging');
    ghost.style.transform = ghostAt(ghost, sx, sy);
    ghost.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
  };
  const move = (ev) => {
    if (!started) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      begin();
    }
    drag.x = ev.clientX; drag.y = ev.clientY;
    drag.ghost.style.transform = ghostAt(drag.ghost, ev.clientX, ev.clientY);
    drag.target = targetAt(ev.clientX, ev.clientY);
    springOpen();
    mark();
  };
  const finish = (ok) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key, true);
    if (!started) return;
    // הלחיצה שמסיימת גרירה לא פותחת את המסמך
    window.addEventListener('click', swallow, true);
    setTimeout(() => window.removeEventListener('click', swallow, true), 0);
    const d = drag;
    drag = null;
    clearInterval(d.scrollTimer);
    clearTimeout(d.hoverTimer);
    document.documentElement.classList.remove('tree-dragging');
    clearMarks(d.container);
    d.container.querySelectorAll('.dragging').forEach((x) => x.classList.remove('dragging'));
    const t = ok ? d.target : null;
    d.ghost.animate([{ opacity: 1 }, { opacity: 0, transform: d.ghost.style.transform + ' scale(.85)' }], { duration: 140, easing: 'ease-in' }).onfinish = () => d.ghost.remove();
    if (!t || t.invalid) return;
    const opts = d.container._tree;
    const sep = d.src.includes('\\') ? '\\' : '/';
    if (t.zone === 'into') {
      if (dirOf(d.src) === t.dir) return;
      landed = { path: t.dir + sep + baseOf(d.src) };
      opts.onMove(d.src, t.dir);
    } else {
      landed = { path: dirOf(d.src) === dirOf(t.path) ? d.src : dirOf(t.path) + sep + baseOf(d.src) };
      opts.onReorder(d.src, t.path, t.zone);
    }
    setTimeout(() => { landed = null; }, 1500);
  };
  const swallow = (c) => { c.stopPropagation(); c.preventDefault(); };
  const up = () => finish(true);
  const cancel = () => finish(false);
  const key = (ev) => { if (ev.key === 'Escape' && started) { ev.preventDefault(); ev.stopImmediatePropagation(); finish(false); } };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key, true);
}

// לאן ייפול לפי הנקודה: { zone: into|before|after, dir: תיקיית היעד, path: השורה, invalid }
function targetAt(x, y) {
  const { container } = drag;
  const opts = container._tree;
  const el = document.elementFromPoint(x, y);
  if (!el || !container.contains(el)) return null;
  const row = el.closest('.node');
  let t;
  if (!row) t = { zone: 'into', dir: opts.root, path: opts.root }; // שטח ריק: התיקייה הראשית
  else {
    const p = row.dataset.path;
    const isDir = row.classList.contains('dir');
    const r = row.getBoundingClientRect();
    const f = (y - r.top) / r.height;
    if (isDir) {
      const edge = opts.onReorder ? 0.2 : 0;
      if (f < edge) t = { zone: 'before', dir: dirOf(p), path: p };
      else if (f > 1 - edge && opts.collapsed.has(p)) t = { zone: 'after', dir: dirOf(p), path: p };
      else t = { zone: 'into', dir: p, path: p };
    } else if (opts.onReorder) t = { zone: f < 0.5 ? 'before' : 'after', dir: dirOf(p), path: p };
    else t = { zone: 'into', dir: dirOf(p), path: p };
  }
  // תיקייה לתוך עצמה, או מסמך על עצמו
  if (t.path === drag.src || (drag.isDir && inside(t.dir, drag.src))) t.invalid = true;
  return t;
}

function clearMarks(container) {
  container.querySelectorAll('.drop-target, .drop-before, .drop-after, .drop-dest, .spring').forEach((el) => el.classList.remove('drop-target', 'drop-before', 'drop-after', 'drop-dest', 'spring'));
  container.classList.remove('drop-root');
}

function mark() {
  if (!drag) return;
  const { container, target: t, where } = drag;
  clearMarks(container);
  container.querySelector(`.node[data-path="${CSS.escape(drag.src)}"]`)?.classList.add('dragging');
  drag.ghost.classList.toggle('invalid', !!t?.invalid);
  if (!t) { where.textContent = ''; return; }
  if (t.invalid) { where.textContent = 'אי אפשר להעביר לכאן'; return; }
  const root = container._tree.root;
  const same = dirOf(drag.src) === t.dir;
  where.textContent = t.zone === 'into'
    ? (same ? 'כבר כאן' : `אל: ${shown(t.dir, root)}`)
    : (same ? 'סידור מחדש' : `אל: ${shown(t.dir, root)}`);
  const rowOf = (p) => container.querySelector(`.node[data-path="${CSS.escape(p)}"]`);
  if (t.zone !== 'into') rowOf(t.path)?.classList.add(t.zone === 'before' ? 'drop-before' : 'drop-after');
  // תיקיית היעד מוארת: השורה שלה והתוכן הפתוח שלה (או כל העץ, לתיקייה הראשית)
  if (t.dir === root) { if (!same || t.zone === 'into') container.classList.add('drop-root'); }
  else {
    const dirRow = rowOf(t.dir);
    dirRow?.classList.add(t.zone === 'into' ? 'drop-target' : 'drop-dest');
    const kids = dirRow?.nextElementSibling;
    if (kids?.classList.contains('children')) kids.classList.add('drop-dest');
  }
}

// תיקייה סגורה נפתחת לבד אחרי חצי שנייה של ריחוף מעליה ("לתוך")
function springOpen() {
  const t = drag.target;
  const dir = t && !t.invalid && t.zone === 'into' && t.path === t.dir && drag.container._tree.collapsed.has(t.dir) ? t.dir : null;
  if (dir === drag.hoverDir) return;
  clearTimeout(drag.hoverTimer);
  drag.hoverDir = dir;
  if (!dir) return;
  drag.container.querySelector(`.node[data-path="${CSS.escape(dir)}"]`)?.classList.add('spring');
  drag.hoverTimer = setTimeout(() => {
    if (!drag || drag.hoverDir !== dir) return;
    drag.container._tree.onToggleDir(dir);
    drag.target = targetAt(drag.x, drag.y);
    mark();
  }, 550);
}

function autoScroll() {
  if (!drag) return;
  let box = drag.container;
  while (box && box !== document.body && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
  if (!box || box === document.body) return;
  const r = box.getBoundingClientRect();
  const y = drag.y;
  let dy = 0;
  if (y < r.top + 36) dy = -Math.ceil((r.top + 36 - y) / 3);
  else if (y > r.bottom - 36) dy = Math.ceil((y - (r.bottom - 36)) / 3);
  if (!dy) return;
  box.scrollTop += dy;
  drag.target = targetAt(drag.x, drag.y);
  mark();
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
    const name = (n.type === 'file' ? n.name.replace(/\.(md|canvas)$/i, '') : n.name).toLowerCase();
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
