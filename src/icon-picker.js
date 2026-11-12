// בורר סמלים מ־Lucide לתיקייה או למסמך (כמו Iconize באובסידיאן): חיפוש לפי שם באנגלית,
// סמלים שנבחרו לאחרונה למעלה, צבע (מצבעי הדגלים), ו"בלי סמל".
// onPick({ name, color }) או onPick(null) להסרה.
import { icon, lucide, lucideNames } from './icons.js';
import { FLAG_LIST as FLAG_COLORS } from './flags.js';

const MAX = 240;

export function openIconPicker({ title, current, store, onPick }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'vault-dialog icon-picker';
  dlg.setAttribute('dir', 'rtl');
  dlg.innerHTML = `<div class="vd-head"><span class="vd-icon">${icon('iconPick', 18)}</span><h2></h2><span class="vd-tools"></span></div><div class="vd-body"></div>`;
  dlg.querySelector('h2').textContent = title;
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'icon-btn'; close.setAttribute('aria-label', 'סגירה'); close.innerHTML = icon('close', 18);
  close.addEventListener('click', () => dlg.close());
  dlg.querySelector('.vd-head').append(close);
  const body = dlg.querySelector('.vd-body');
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());

  let color = current?.color || '';
  const recent = (store.get('tali:recent-icons', []) || []).filter(Boolean);

  const top = document.createElement('div');
  top.className = 'ip-top';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'vd-filter';
  search.placeholder = 'חיפוש סמל באנגלית (book, folder, star…)';
  const colors = document.createElement('div');
  colors.className = 'ip-colors';
  const swatch = (id, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ip-color' + (id === color ? ' on' : '');
    b.dataset.tip = label;
    b.setAttribute('aria-label', label);
    if (id) b.style.setProperty('--c', `var(--flag-${id})`); else b.classList.add('none');
    b.addEventListener('click', () => { color = id; colors.querySelectorAll('.ip-color').forEach((x) => x.classList.toggle('on', x === b)); grid.style.color = id ? `var(--flag-${id})` : ''; });
    colors.append(b);
  };
  swatch('', 'בלי צבע');
  for (const f of FLAG_COLORS) swatch(f.id, f.name);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'ip-remove';
  remove.textContent = 'בלי סמל';
  remove.disabled = !current;
  remove.addEventListener('click', () => { dlg.close(); onPick(null); });
  top.append(search, colors, remove);
  const grid = document.createElement('div');
  grid.className = 'ip-grid';
  if (color) grid.style.color = `var(--flag-${color})`;
  const note = document.createElement('p');
  note.className = 'ip-note';
  body.append(top, grid, note);

  function pick(name) {
    store.set('tali:recent-icons', [name, ...recent.filter((n) => n !== name)].slice(0, 16));
    dlg.close();
    onPick({ name, color });
  }
  function draw() {
    const q = search.value.trim().toLowerCase();
    const all = lucideNames();
    let list;
    if (!q) list = [...recent.map((n) => all.find((x) => x.name === n)).filter(Boolean), ...all.filter((x) => !recent.includes(x.name))];
    else {
      const words = q.split(/\s+/);
      list = all.filter((x) => words.every((w) => x.words.includes(w)))
        .sort((a, b) => (a.words.startsWith(q) ? 0 : 1) - (b.words.startsWith(q) ? 0 : 1) || a.words.length - b.words.length);
    }
    grid.innerHTML = '';
    for (const x of list.slice(0, MAX)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ip-icon' + (x.name === current?.name ? ' on' : '');
      b.dataset.tip = x.words;
      b.innerHTML = lucide(x.name, 22);
      b.addEventListener('click', () => pick(x.name));
      grid.append(b);
    }
    note.textContent = !list.length ? 'לא נמצא סמל. נסו מילה אחרת באנגלית.' : list.length > MAX ? `מוצגים ${MAX} מתוך ${list.length}. אפשר לצמצם בחיפוש.` : '';
  }
  search.addEventListener('input', draw);
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); grid.querySelector('.ip-icon')?.click(); } });
  draw();
  dlg.showModal();
  search.focus();
}
