// בורר פתקים לקישור: חיפוש + בחירה מרובה.
// openLinkPicker({ title, notes: [{ name, rel, path }], selected: [path], onSave: (paths) => {} })
// מקלדת: חצים לתנועה, רווח לסימון, Enter לשמירה, Esc לביטול. סימון נשמר גם כשהחיפוש מסתיר פריט.
import { fuzzy } from './palette.js';
import { icon } from './icons.js';

let dlg = null;

function build() {
  const d = document.createElement('dialog');
  d.id = 'linkPicker';
  d.innerHTML = `
    <div class="lp-head"><span class="lp-icon">${icon('link', 18)}</span><h2></h2></div>
    <div class="lp-search">${icon('search', 16)}<input type="text" placeholder="חיפוש פתק…" autocomplete="off" spellcheck="false"></div>
    <div class="lp-list" role="listbox" aria-multiselectable="true"></div>
    <div class="lp-foot">
      <span class="lp-count"></span>
      <div class="lp-actions"><button type="button" data-act="cancel">ביטול</button><button type="button" class="primary" data-act="save">שמירה</button></div>
    </div>`;
  document.body.append(d);
  d.addEventListener('mousedown', (e) => { if (e.target === d) d.close(); });
  return d;
}

export function openLinkPicker({ title, notes, selected = [], onSave }) {
  if (!dlg) dlg = build();
  const input = dlg.querySelector('input');
  const list = dlg.querySelector('.lp-list');
  const count = dlg.querySelector('.lp-count');
  dlg.querySelector('h2').textContent = title;
  const chosen = new Set(selected);
  const initial = new Set(selected);
  let rows = [];
  let index = 0;

  const folder = (n) => (n.rel.includes('/') ? n.rel.slice(0, n.rel.lastIndexOf('/')).split('/').join(' › ') : '');
  const items = () => {
    const q = input.value.trim();
    if (!q) {
      // בלי חיפוש: המסומנים קודם, ואחריהם הכל לפי א"ב
      return [...notes].sort((a, b) => (chosen.has(b.path) - chosen.has(a.path)) || a.name.localeCompare(b.name, 'he', { numeric: true })).map((n) => ({ n, marks: [] }));
    }
    const out = [];
    for (const n of notes) {
      const m = fuzzy(q, n.name) || (fuzzy(q, n.rel) && { score: 0, marks: [] });
      if (m) out.push({ n, marks: m.marks, score: m.score });
    }
    return out.sort((a, b) => b.score - a.score);
  };

  const updateCount = () => {
    const added = [...chosen].filter((p) => !initial.has(p)).length;
    const removed = [...initial].filter((p) => !chosen.has(p)).length;
    count.textContent = `${chosen.size} מסומנים` + (added || removed ? ` · ${added ? `+${added}` : ''}${added && removed ? ' ' : ''}${removed ? `−${removed}` : ''}` : '');
  };

  const draw = () => {
    rows = items();
    if (index >= rows.length) index = Math.max(0, rows.length - 1);
    list.innerHTML = '';
    if (!rows.length) {
      list.innerHTML = '<div class="lp-empty">לא נמצאו פתקים</div>';
      updateCount();
      return;
    }
    rows.slice(0, 200).forEach(({ n, marks }, i) => {
      const row = document.createElement('div');
      row.className = 'lp-item' + (chosen.has(n.path) ? ' on' : '') + (i === index ? ' focus' : '');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', chosen.has(n.path));
      row.style.setProperty('--i', Math.min(i, 10));
      const box = document.createElement('span');
      box.className = 'lp-box';
      box.innerHTML = icon('check', 13);
      const text = document.createElement('span');
      text.className = 'lp-text';
      const name = document.createElement('span');
      name.className = 'lp-name';
      const set = new Set(marks);
      [...n.name].forEach((ch, k) => {
        if (set.has(k)) { const b = document.createElement('mark'); b.textContent = ch; name.append(b); } else name.append(ch);
      });
      text.append(name);
      if (folder(n)) { const s = document.createElement('small'); s.textContent = folder(n); text.append(s); }
      row.append(box, text);
      row.addEventListener('mousedown', (e) => { e.preventDefault(); index = i; toggle(n.path); });
      list.append(row);
    });
    updateCount();
  };
  const toggle = (p) => { chosen.has(p) ? chosen.delete(p) : chosen.add(p); draw(); };
  const moveFocus = () => {
    [...list.children].forEach((r, i) => r.classList.toggle('focus', i === index));
    list.children[index]?.scrollIntoView({ block: 'nearest' });
  };

  input.value = '';
  input.oninput = () => { index = 0; draw(); };
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); index = Math.min(index + 1, rows.length - 1); moveFocus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); index = Math.max(index - 1, 0); moveFocus(); }
    else if (e.key === ' ' && !input.value.trim()) { e.preventDefault(); if (rows[index]) toggle(rows[index].n.path); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      // Enter על פריט כשמחפשים: מסמן אותו. Ctrl+Enter או Enter בלי חיפוש: שמירה.
      if (input.value.trim() && !e.ctrlKey && rows[index]) { toggle(rows[index].n.path); input.select(); }
      else save();
    }
  };
  const save = () => { dlg.close(); onSave([...chosen]); };
  dlg.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'cancel') dlg.close();
    if (act === 'save') save();
  };
  draw();
  dlg.showModal();
  input.focus();
}
