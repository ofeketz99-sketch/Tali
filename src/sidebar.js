// עץ הקבצים והחיפוש בסרגל הצד.
import { icon as svg } from './icons.js';

// opening: התיקייה שנפתחה עכשיו. הפריטים שלה נכנסים באנימציה, אחד אחרי השני.
export function renderTree(container, tree, { activePath, collapsed, opening, onOpen, onToggleDir, onContext, onSelectDir }) {
  container.innerHTML = '';
  container.appendChild(buildLevel(tree));

  function buildLevel(nodes) {
    const frag = document.createDocumentFragment();
    nodes.forEach((n, i) => {
      const row = document.createElement('div');
      row.className = 'node ' + n.type + (n.path === activePath ? ' active' : '');
      row.style.setProperty('--i', i);
      const icon = document.createElement('span');
      icon.className = 'icon';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = n.type === 'file' ? n.name.replace(/\.md$/i, '') : n.name;
      row.append(icon, label);

      if (n.type === 'dir') {
        const isCollapsed = collapsed.has(n.path);
        row.classList.toggle('collapsed', isCollapsed);
        // החץ מסתובב באנימציה (ב־CSS) בין פתוח לסגור
        icon.innerHTML = svg('chevron', 14);
        row.addEventListener('click', () => { onSelectDir(n.path); onToggleDir(n.path); });
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
  head.textContent = list.length ? `קישורים חוזרים (${list.length})` : 'אין הערות שמקשרות לכאן';
  container.appendChild(head);
  list.forEach((b, i) => container.appendChild(hitRow({
    title: b.count > 1 ? `${b.name} (${b.count})` : b.name, snippet: b.snippet, index: i, onClick: () => onOpen(b.path),
  })));
}

export function renderSearchResults(container, results, onOpen) {
  container.innerHTML = '';
  if (!results.length) {
    container.textContent = 'לא נמצאו תוצאות.';
    return;
  }
  results.forEach((r, i) => container.appendChild(hitRow({ title: r.name, snippet: r.snippet, index: i, onClick: () => onOpen(r.path) })));
}
