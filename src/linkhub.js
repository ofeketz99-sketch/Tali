// "פתק קישור" לפי בקשה (מ־10.7): חלונית קטנה לבחירת שם לפתק נושא (קיים או חדש) שמקשר כמה מסמכים.
// עד 10.6 החלונית קפצה לבד אחרי כל קישור להערה קיימת ותפסה את Tab; היום פותחים אותה רק מלוח הקישורים
// או מלוח הפקודות ("פתק קישור…").
//
// openLinkHubName({ coords, title, notes, onApply, onClose })
//   coords: { bottom, right } המקום שמתחתיו החלונית נפתחת
//   notes: [{ name, path, rel }] לבחירת פתק קישור קיים
//   onApply({ path } | { name }): פתק קיים או חדש
import { fuzzy } from './palette.js';

let box = null;
let cleanup = null;

export function closeLinkHubOffer() {
  if (cleanup) cleanup();
  cleanup = null;
  if (box) box.hidden = true;
}

export function openLinkHubName({ coords, title, notes, onApply, onClose = () => {} }) {
  closeLinkHubOffer();
  if (!box) {
    box = document.createElement('div');
    box.className = 'wikilink-suggest link-offer expanded';
    document.body.append(box);
  }
  box.innerHTML = '';
  box.hidden = false;

  const place = () => {
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    box.style.top = Math.max(8, Math.min(coords.bottom + 4, window.innerHeight - h - 8)) + 'px';
    box.style.left = Math.max(8, Math.min(coords.right - w, window.innerWidth - w - 8)) + 'px';
  };

  const head = document.createElement('div');
  head.className = 'offer-head';
  head.textContent = title;
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'שם הנושא, למשל: רשימות';
  const list = document.createElement('div');
  box.append(head, input, list);

  const onDown = (e) => { if (!box.contains(e.target)) { closeLinkHubOffer(); onClose(); } };
  window.addEventListener('mousedown', onDown, true);
  cleanup = () => window.removeEventListener('mousedown', onDown, true);

  let items = [];
  let index = 0;
  const draw = () => {
    const q = input.value.trim();
    items = [];
    if (q) {
      const scored = [];
      for (const n of notes) {
        const m = fuzzy(q, n.name);
        if (m) scored.push({ score: m.score, label: n.name, hint: n.rel.includes('/') ? n.rel.slice(0, n.rel.lastIndexOf('/')) : '', pick: { path: n.path } });
      }
      scored.sort((a, b) => b.score - a.score);
      items = scored.slice(0, 5);
      if (!notes.some((n) => n.name.toLowerCase() === q.toLowerCase())) {
        items.push({ label: `יצירת פתק קישור: ${q}`, isNew: true, pick: { name: q } });
      }
    }
    if (index >= items.length) index = 0;
    list.innerHTML = '';
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'item' + (i === index ? ' selected' : '') + (it.isNew ? ' new' : '');
      const s = document.createElement('span');
      s.textContent = it.label;
      row.append(s);
      if (it.hint) { const h = document.createElement('small'); h.textContent = it.hint; row.append(h); }
      row.addEventListener('mousedown', (e) => { e.preventDefault(); apply(i); });
      list.append(row);
    });
    place();
  };
  const apply = (i) => {
    const it = items[i];
    if (!it) return;
    closeLinkHubOffer();
    onApply(it.pick);
  };
  input.addEventListener('input', () => { index = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); index = (index + 1) % Math.max(1, items.length); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); index = (index - 1 + items.length) % Math.max(1, items.length); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); apply(index); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLinkHubOffer(); onClose(); }
  });
  draw();
  input.focus();
}
