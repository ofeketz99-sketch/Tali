// "פתק קישור": אחרי שמקשרים בין שתי הערות, אותה חלונית קטנה מציעה להוסיף פתק נושא
// (למשל "רשימות") שמקשר את שתיהן. הפתק עצמו ריק, מלבד הקישורים.
//
// showLinkHubOffer({ coords, from, to, notes, onApply, onClose })
//   from, to: שמות שתי ההערות (להצגה)
//   notes: [{ name, path, rel }] לבחירת פתק קישור קיים
//   onApply({ path } | { name }): פתק קיים או חדש
import { fuzzy } from './palette.js';
import { icon } from './icons.js';

let box = null;
let cleanup = null;

export function closeLinkHubOffer() {
  if (cleanup) cleanup();
  cleanup = null;
  if (box) box.hidden = true;
}

export function showLinkHubOffer({ coords, from, to, notes, onApply, refocus }) {
  closeLinkHubOffer();
  if (!box) {
    box = document.createElement('div');
    box.className = 'wikilink-suggest link-offer';
    document.body.append(box);
  }
  box.innerHTML = '';
  box.hidden = false;

  const place = () => {
    const w = box.offsetWidth;
    box.style.top = coords.bottom + 4 + 'px';
    box.style.left = Math.max(8, Math.min(coords.right - w, window.innerWidth - w - 8)) + 'px';
  };

  // ===== שלב 1: הצעה קטנה. הכתיבה בעורך ממשיכה כרגיל =====
  const head = document.createElement('div');
  head.className = 'offer-head';
  head.innerHTML = `${icon('link', 13)}<span></span>`;
  head.querySelector('span').textContent = `${from} · ${to}`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'offer-btn';
  btn.innerHTML = `${icon('plus', 15)}<span>הוספת פתק קישור</span><kbd>Tab</kbd>`;
  btn.addEventListener('mousedown', (e) => { e.preventDefault(); expand(); });
  box.append(head, btn);
  place();

  // Tab פותח, Escape סוגר, כל מקש אחר ממשיך לכתוב ומעלים את ההצעה
  const onKey = (e) => {
    if (box.classList.contains('expanded')) return;
    if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); expand(); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); }
    if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) closeLinkHubOffer();
  };
  const onDown = (e) => { if (!box.contains(e.target)) closeLinkHubOffer(); };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('mousedown', onDown, true);
  const timer = setTimeout(() => { if (!box.classList.contains('expanded')) closeLinkHubOffer(); }, 12000);
  cleanup = () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('mousedown', onDown, true);
    clearTimeout(timer);
    box.classList.remove('expanded');
  };

  // ===== שלב 2: בחירת שם (פתק קיים או חדש) =====
  function expand() {
    box.classList.add('expanded');
    box.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'offer-head';
    title.textContent = `פתק קישור ל״${from}״ ול״${to}״`;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'שם הנושא, למשל: רשימות';
    const list = document.createElement('div');
    box.append(title, input, list);

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
      else if (e.key === 'Escape') { e.preventDefault(); closeLinkHubOffer(); refocus(); }
    });
    draw();
    input.focus();
  }
}
