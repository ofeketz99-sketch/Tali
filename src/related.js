// "קשורים" (מ־10.7): שורת צ'יפים בראש הדף, מתחת לשם המסמך, עם הקישורים שבמאפיינים (links:).
// זה המקום היחיד שבו מוסיפים ומסירים קישור "צדדי" (שלא כתוב בטקסט): + פותח שדה עם השלמה,
// Enter מוסיף, ✕ מסיר, לחיצה על צ'יפ פותחת. השורה מוסתרת כשאין קישורים כאלה ולא מוסיפים עכשיו,
// כדי שמסמך חדש יישאר נקי. עד 10.6 אותם קישורים נוספו בבורר מודאלי, ושורות links: היו מוסתרות לגמרי.
// השמירה דרך העורך (setLinks → updateFrontmatter), ולכן הסמן וההיסטוריה של הטקסט לא משתנים.
//
// createRelatedRow({ host, icon, getNotes, resolve, getLinks, setLinks, linkTextFor, open, isActive })
//   getNotes() → [{ name, path, rel }] בלי המסמך הפתוח
//   resolve(target) → נתיב או null
//   getLinks() → [target] (הטקסט שבתוך [[ ]])
//   setLinks([target])
//   linkTextFor(path) → הטקסט לקישור
//   open(target, { newTab })
//   isActive() → האם להציג בכלל (יש מסמך פתוח, לא תצוגת Markdown)
import { fuzzy } from './palette.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const shortName = (t) => t.split('#')[0].split('|')[0].replace(/\\/g, '/').split('/').pop().replace(/\.md$/i, '');

export function createRelatedRow({ host, icon, getNotes, resolve, getLinks, setLinks, linkTextFor, open, isActive }) {
  host.innerHTML = '';
  const label = el('span', 'rel-label');
  label.innerHTML = icon('link', 14);
  label.append(el('span', null, 'קשורים'));
  const chips = el('div', 'rel-chips');
  const addBtn = el('button', 'rel-add');
  addBtn.type = 'button';
  addBtn.innerHTML = icon('plus', 14);
  addBtn.dataset.tip = 'קישור למסמך קשור (Ctrl+Shift+K)';
  addBtn.setAttribute('aria-label', 'הוספת מסמך קשור');
  const field = el('div', 'rel-field');
  const input = el('input');
  input.type = 'text';
  input.placeholder = 'מסמך קשור…';
  input.spellcheck = false;
  input.autocomplete = 'off';
  const list = el('div', 'wikilink-suggest rel-suggest');
  list.hidden = true;
  field.append(input);
  field.hidden = true;
  chips.append(field);
  host.append(label, chips);
  document.body.append(list);

  let adding = false;
  let items = [];
  let index = 0;

  function render() {
    const active = isActive();
    const targets = active ? getLinks() : [];
    host.hidden = !active || (!targets.length && !adding);
    if (!active && adding) stopAdd();
    [...chips.querySelectorAll('.rel-chip')].forEach((c) => c.remove());
    targets.forEach((t) => {
      const path = resolve(t);
      const chip = el('span', 'rel-chip' + (path ? '' : ' missing'));
      const name = el('button', 'rel-name', shortName(t));
      name.type = 'button';
      name.dataset.tip = path ? 'פתיחה (Ctrl+לחיצה: בכרטיסייה חדשה)' : 'עוד לא נוצר. לחיצה יוצרת אותו';
      name.addEventListener('click', (e) => open(t, { newTab: e.ctrlKey || e.metaKey }));
      name.addEventListener('auxclick', (e) => { if (e.button === 1) open(t, { newTab: true }); });
      const x = el('button', 'rel-x');
      x.type = 'button';
      x.innerHTML = icon('close', 12);
      x.dataset.tip = 'הסרה מהקשורים';
      x.setAttribute('aria-label', 'הסרה');
      x.addEventListener('click', () => setLinks(getLinks().filter((y) => y !== t)));
      chip.append(name, x);
      chips.insertBefore(chip, field);
    });
    if (addBtn.parentNode !== chips) chips.append(addBtn);
    addBtn.hidden = adding;
  }

  function candidates() {
    const q = input.value.trim();
    const have = new Set(getLinks().map((t) => resolve(t)).filter(Boolean));
    const notes = getNotes().filter((n) => !have.has(n.path));
    let out;
    if (!q) out = notes.slice(0, 0);
    else {
      out = notes.map((n) => ({ n, m: fuzzy(q, n.name) || (fuzzy(q, n.rel) && { score: -1, marks: [] }) }))
        .filter((x) => x.m).sort((a, b) => b.m.score - a.m.score).slice(0, 7)
        .map(({ n }) => ({ label: n.name, hint: n.rel.includes('/') ? n.rel.slice(0, n.rel.lastIndexOf('/')) : '', path: n.path }));
      if (!getNotes().some((n) => n.name.toLowerCase() === q.toLowerCase())) out.push({ label: `מסמך חדש: ${q}`, isNew: true, text: q });
    }
    return out;
  }

  function drawList() {
    items = candidates();
    if (index >= items.length) index = 0;
    list.innerHTML = '';
    list.hidden = !items.length;
    if (!items.length) return;
    items.forEach((it, i) => {
      const r = el('div', 'item' + (i === index ? ' selected' : '') + (it.isNew ? ' new' : ''));
      r.append(el('span', null, it.label));
      if (it.hint) r.append(el('small', null, it.hint));
      r.addEventListener('mousedown', (e) => { e.preventDefault(); index = i; choose(); });
      list.append(r);
    });
    const rect = input.getBoundingClientRect();
    list.style.top = rect.bottom + 4 + 'px';
    const w = list.offsetWidth;
    list.style.left = Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8)) + 'px';
  }

  function choose() {
    const it = items[index];
    if (!it) return;
    const text = it.path ? linkTextFor(it.path) : it.text;
    const now = getLinks();
    if (!now.includes(text)) setLinks([...now, text]);
    input.value = '';
    drawList();
    input.focus();
  }

  function startAdd() {
    if (!isActive()) return;
    adding = true;
    field.hidden = false;
    render();
    input.value = '';
    drawList();
    input.focus();
  }
  function stopAdd() {
    adding = false;
    field.hidden = true;
    list.hidden = true;
    input.value = '';
    render();
  }

  addBtn.addEventListener('click', startAdd);
  input.addEventListener('input', () => { index = 0; drawList(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) { index = (index + 1) % items.length; drawList(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { index = (index - 1 + items.length) % items.length; drawList(); } }
    else if (e.key === 'Enter') { e.preventDefault(); choose(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopAdd(); }
    else if (e.key === 'Backspace' && !input.value) {
      // שדה ריק: Backspace מסיר את האחרון, כמו בשדות תגיות
      const now = getLinks();
      if (now.length) { e.preventDefault(); setLinks(now.slice(0, -1)); }
    }
  });
  // יציאה מהשדה (לחיצה בחוץ, Tab) סוגרת את מצב ההוספה
  input.addEventListener('blur', () => setTimeout(() => { if (adding && document.activeElement !== input) stopAdd(); }, 120));

  host.hidden = true;
  return { render, startAdd, isAdding: () => adding };
}
