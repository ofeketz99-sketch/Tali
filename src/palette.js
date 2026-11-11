// חלון חיפוש מהיר שמשמש גם למעבר בין הערות (Ctrl+O) וגם ללוח הפקודות (Ctrl+P).
// openPalette({ placeholder, items(query) => [{ title, hint, keys, run, marks }], emptyText })

// התאמה גמישה: קודם רצף רציף בשם, ואם אין, אותיות לפי הסדר עם דילוגים ("כמאו" -> "כימיה אורגנית").
// מחזיר { score, marks } כשגבוה יותר = טוב יותר, או null אם אין התאמה.
export function fuzzy(query, text) {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, marks: [] };
  const t = text.toLowerCase();
  const at = t.indexOf(q);
  if (at >= 0) {
    const marks = [];
    for (let i = 0; i < q.length; i++) marks.push(at + i);
    // התחלה של השם או של מילה עדיפה
    const wordStart = at === 0 || /[\s\-_/.]/.test(t[at - 1]);
    return { score: 1000 - at * 2 - t.length * 0.1 + (at === 0 ? 300 : 0) + (wordStart ? 100 : 0), marks };
  }
  const marks = [];
  let gaps = 0;
  let last = -1;
  for (const ch of q) {
    if (ch === ' ') continue;
    const i = t.indexOf(ch, last + 1);
    if (i < 0) return null;
    if (last >= 0) gaps += i - last - 1;
    marks.push(i);
    last = i;
  }
  return { score: 500 - gaps * 5 - t.length * 0.1, marks };
}

let dlg = null;

function build() {
  const d = document.createElement('dialog');
  d.id = 'palette';
  d.innerHTML = '<input type="text" autocomplete="off" spellcheck="false"><div class="pal-list" role="listbox"></div><div class="pal-foot"></div>';
  document.body.append(d);
  // לחיצה מחוץ לחלון סוגרת אותו
  d.addEventListener('mousedown', (e) => { if (e.target === d) d.close(); });
  return d;
}

function renderTitle(text, marks = []) {
  const frag = document.createDocumentFragment();
  const set = new Set(marks);
  let buf = '';
  let inMark = false;
  const flush = () => {
    if (!buf) return;
    if (inMark) { const m = document.createElement('mark'); m.textContent = buf; frag.append(m); }
    else frag.append(buf);
    buf = '';
  };
  [...text].forEach((ch, i) => {
    const on = set.has(i);
    if (on !== inMark) { flush(); inMark = on; }
    buf += ch;
  });
  flush();
  return frag;
}

export function isPaletteOpen() { return !!dlg?.open; }
export function closePalette() { if (dlg?.open) dlg.close(); }

export function openPalette({ placeholder, items, emptyText = 'אין תוצאות', footer = '' }) {
  if (!dlg) dlg = build();
  if (dlg.open) dlg.close();
  const input = dlg.querySelector('input');
  const list = dlg.querySelector('.pal-list');
  dlg.querySelector('.pal-foot').textContent = footer;
  input.placeholder = placeholder;
  input.value = '';
  let current = [];
  let index = 0;

  const draw = () => {
    current = items(input.value).slice(0, 50);
    if (index >= current.length) index = Math.max(0, current.length - 1);
    list.innerHTML = '';
    if (!current.length) {
      const e = document.createElement('div');
      e.className = 'pal-empty';
      e.textContent = emptyText;
      list.append(e);
      return;
    }
    current.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'pal-item' + (i === index ? ' selected' : '') + (it.className ? ' ' + it.className : '');
      row.setAttribute('role', 'option');
      const main = document.createElement('div');
      main.className = 'pal-main';
      const title = document.createElement('span');
      title.className = 'pal-title';
      title.append(renderTitle(it.title, it.marks));
      main.append(title);
      if (it.hint) {
        const hint = document.createElement('small');
        hint.textContent = it.hint;
        main.append(hint);
      }
      row.append(main);
      if (it.keys) {
        const k = document.createElement('kbd');
        k.textContent = it.keys;
        row.append(k);
      }
      row.addEventListener('mousemove', () => { if (index !== i) { index = i; mark(); } });
      row.addEventListener('mousedown', (e) => { e.preventDefault(); choose(i); });
      list.append(row);
    });
  };
  const mark = () => {
    [...list.children].forEach((r, i) => r.classList.toggle('selected', i === index));
    list.children[index]?.scrollIntoView({ block: 'nearest' });
  };
  const choose = (i) => {
    const it = current[i];
    if (!it) return;
    dlg.close();
    it.run();
  };

  input.oninput = () => { index = 0; draw(); };
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); index = (index + 1) % Math.max(1, current.length); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); index = (index - 1 + current.length) % Math.max(1, current.length); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(index); }
  };
  draw();
  dlg.showModal();
  input.focus();
}
