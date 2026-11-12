// מסך הבית: מוצג כשאין מסמך פתוח (גם בהפעלה). רקע דינמי עדין, וכרטיסים:
//   followUp  משימות להמשך מכל המסמכים (הפונקציה של Ctrl+Shift+T)
//   ghosts    מסמכי רפאים: קישורים חסרים ומסמכים עם כותרת בלבד
//   board     לוח משימות כלליות: הערה רגילה בכספת (ברירת מחדל "משימות.md" בראש הכספת), עם "- [ ] משימה"
// "התאמה" מאפשר לשנות סדר (גרירה או חצים) ולהסתיר כרטיסים. נשמר ב־tali:home.
import { icon } from './icons.js';
import { extractTasks } from '../vault-data.js';

const CARDS = {
  followUp: { title: 'משימות להמשך', icon: 'taskSection' },
  ghosts: { title: 'מסמכי רפאים', icon: 'ghost' },
  board: { title: 'לוח משימות', icon: 'board' },
};
const DEFAULT_LAYOUT = { order: ['followUp', 'ghosts', 'board'], hidden: [] };
const BOARD_NAME = 'משימות';
const LIMIT = 8;

// api: { getRoot, sep, vaultIndex, openNote, openTask, toggleTask, createGhost, showTasks, showGhosts, read, write, createNote, exists, onChanged }
export function createHome({ el, store, api }) {
  let editing = false;
  const layout = () => {
    const s = store.get('tali:home', null) || {};
    const order = (s.order || []).filter((k) => CARDS[k]);
    for (const k of DEFAULT_LAYOUT.order) if (!order.includes(k)) order.push(k);
    return { order, hidden: (s.hidden || []).filter((k) => CARDS[k]) };
  };
  const saveLayout = (l) => store.set('tali:home', l);
  const boardPath = () => api.getRoot() + api.sep() + BOARD_NAME + '.md';

  // refresh: false (שינוי סדר, הסתרה, מצב התאמה): מציירים מהנתונים שכבר נטענו, בלי לקרוא שוב את כל הכספת
  let token = 0, cache = null;
  async function render({ refresh = true } = {}) {
    const my = ++token;
    if (refresh || !cache) {
      const index = await api.vaultIndex().catch(() => ({ notes: [] }));
      let board = null;
      try { board = await api.read(boardPath()); } catch { /* עוד לא נוצר */ }
      if (my !== token) return;
      cache = { index, board };
    }
    const { index, board } = cache;
    const { order, hidden } = layout();
    el.innerHTML = '';
    el.classList.toggle('editing', editing);

    const head = document.createElement('div');
    head.className = 'home-head';
    const now = new Date();
    const h = now.getHours();
    const hello = h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
    head.innerHTML = `<div><h1 class="home-hello"></h1><p class="home-date"></p></div>`;
    head.querySelector('.home-hello').textContent = hello;
    head.querySelector('.home-date').textContent = now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
    const custom = document.createElement('button');
    custom.type = 'button';
    custom.className = 'home-custom' + (editing ? ' on' : '');
    custom.innerHTML = `${icon(editing ? 'check' : 'settings', 15)}<span>${editing ? 'סיום' : 'התאמה'}</span>`;
    custom.dataset.tip = editing ? 'סיום ההתאמה' : 'סדר הכרטיסים והסתרה';
    custom.addEventListener('click', () => { editing = !editing; render({ refresh: false }); });
    head.append(custom);
    el.append(head);

    const grid = document.createElement('div');
    grid.className = 'home-grid';
    el.append(grid);
    const shown = order.filter((k) => editing || !hidden.includes(k));
    if (!shown.length) {
      const p = document.createElement('p');
      p.className = 'home-empty';
      p.textContent = 'כל הכרטיסים מוסתרים. "התאמה" מחזירה אותם.';
      grid.append(p);
    }
    shown.forEach((k, i) => grid.append(card(k, i, shown.length, hidden.includes(k), index, board)));
  }

  function card(key, i, count, isHidden, index, board) {
    const c = document.createElement('section');
    c.className = 'home-card' + (isHidden ? ' is-hidden' : '');
    c.dataset.key = key;
    c.style.setProperty('--i', i);
    const head = document.createElement('header');
    head.innerHTML = `<span class="hc-ic">${icon(CARDS[key].icon, 16)}</span><h2></h2><span class="hc-count"></span>`;
    head.querySelector('h2').textContent = CARDS[key].title;
    c.append(head);
    if (editing) {
      // התאמה: חצים להזזה, עין להסתרה, וגרירה
      const tools = document.createElement('span');
      tools.className = 'hc-tools';
      const btn = (ic, tip, fn, disabled) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'icon-btn'; b.dataset.tip = tip; b.innerHTML = icon(ic, 15); b.disabled = !!disabled;
        b.addEventListener('click', fn);
        tools.append(b);
      };
      btn('chevronUp', 'הזזה קדימה', () => move(key, -1), i === 0);
      btn('chevronDown', 'הזזה אחורה', () => move(key, 1), i === count - 1);
      btn(isHidden ? 'eyeOff' : 'eye', isHidden ? 'הצגה' : 'הסתרה', () => toggleHidden(key));
      head.append(tools);
      c.draggable = true;
      c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-tali-home', key); c.classList.add('dragging'); });
      c.addEventListener('dragend', () => c.classList.remove('dragging'));
      c.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('application/x-tali-home')) { e.preventDefault(); c.classList.add('drop'); } });
      c.addEventListener('dragleave', () => c.classList.remove('drop'));
      c.addEventListener('drop', (e) => {
        c.classList.remove('drop');
        const src = e.dataTransfer.getData('application/x-tali-home');
        if (!src || src === key) return;
        e.preventDefault();
        const l = layout();
        l.order.splice(l.order.indexOf(src), 1);
        l.order.splice(l.order.indexOf(key), 0, src);
        saveLayout(l); render({ refresh: false });
      });
    }
    const body = document.createElement('div');
    body.className = 'hc-body';
    c.append(body);
    if (key === 'followUp') followUps(body, head, index);
    else if (key === 'ghosts') ghosts(body, head, index);
    else boardCard(body, head, board);
    return c;
  }
  function move(key, dir) {
    const l = layout();
    const i = l.order.indexOf(key);
    const j = i + dir;
    if (j < 0 || j >= l.order.length) return;
    [l.order[i], l.order[j]] = [l.order[j], l.order[i]];
    saveLayout(l); render({ refresh: false });
  }
  function toggleHidden(key) {
    const l = layout();
    l.hidden = l.hidden.includes(key) ? l.hidden.filter((k) => k !== key) : [...l.hidden, key];
    saveLayout(l); render({ refresh: false });
  }

  const empty = (body, text) => { const p = document.createElement('p'); p.className = 'hc-empty'; p.textContent = text; body.append(p); };
  const more = (body, text, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'hc-more'; b.textContent = text; b.addEventListener('click', fn); body.append(b); };
  function taskRow(body, text, sub, done, onToggle, onOpen) {
    const row = document.createElement('div');
    row.className = 'hc-task' + (done ? ' done' : '');
    row.innerHTML = '<input type="checkbox"><span class="hc-text"></span><small></small>';
    const box = row.querySelector('input');
    box.checked = done;
    box.addEventListener('click', (e) => e.stopPropagation());
    box.addEventListener('change', () => onToggle(box.checked));
    row.querySelector('.hc-text').textContent = text || '(ללא טקסט)';
    row.querySelector('small').textContent = sub || '';
    if (onOpen) row.addEventListener('click', onOpen);
    body.append(row);
  }

  function followUps(body, head, index) {
    const open = [];
    for (const n of index.notes) for (const t of n.tasks || []) if (t.followUp && !t.done && t.text.trim()) open.push({ n, t });
    open.sort((a, b) => (b.n.mtime || 0) - (a.n.mtime || 0));
    head.querySelector('.hc-count').textContent = open.length || '';
    if (!open.length) return empty(body, 'אין משימות להמשך פתוחות.');
    for (const { n, t } of open.slice(0, LIMIT)) {
      taskRow(body, t.text, n.name, false, async (v) => { try { await api.toggleTask(n.path, t, v); } finally { render(); } }, () => api.openTask(n.path, t));
    }
    if (open.length > LIMIT) more(body, `כל המשימות להמשך (${open.length})`, () => api.showTasks('followUp'));
  }

  function ghosts(body, head, index) {
    const map = new Map();
    for (const n of index.notes) for (const g of n.missing || []) {
      const k = g.toLowerCase();
      if (!map.has(k)) map.set(k, { name: g, count: 0 });
      map.get(k).count++;
    }
    const missing = [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'he'));
    const titles = index.notes.filter((n) => n.titleOnly).sort((a, b) => a.rel.localeCompare(b.rel, 'he'));
    head.querySelector('.hc-count').textContent = missing.length + titles.length || '';
    if (!missing.length && !titles.length) return empty(body, 'אין קישורים חסרים או מסמכים ללא תוכן.');

    if (missing.length) {
      const label = document.createElement('div');
      label.className = 'hc-subtitle';
      label.textContent = `קישורים חסרים · ${missing.length}`;
      body.append(label);
      for (const g of missing.slice(0, LIMIT)) {
        const row = document.createElement('div');
        row.className = 'hc-ghost';
        row.innerHTML = `<span class="hc-text"></span><small></small><button type="button" class="hc-create" data-tip="יצירת המסמך">${icon('filePlus', 14)}</button>`;
        row.querySelector('.hc-text').textContent = g.name;
        row.querySelector('small').textContent = g.count > 1 ? `${g.count} קישורים` : 'קישור אחד';
        row.querySelector('.hc-create').addEventListener('click', () => api.createGhost(g.name));
        body.append(row);
      }
    }
    if (titles.length) {
      const label = document.createElement('div');
      label.className = 'hc-subtitle';
      label.textContent = `מסמכי כותרת · ${titles.length}`;
      body.append(label);
      for (const n of titles.slice(0, Math.max(0, LIMIT - Math.min(missing.length, LIMIT)))) {
        const row = document.createElement('div');
        row.className = 'hc-ghost hc-title-only';
        row.innerHTML = `<span class="hc-text"></span><small>ללא תוכן</small>`;
        row.querySelector('.hc-text').textContent = n.rel.split('/').join(' › ');
        row.addEventListener('click', () => api.openNote(n.path));
        body.append(row);
      }
    }
    if (missing.length + titles.length > LIMIT) more(body, `כל מסמכי הרפאים (${missing.length + titles.length})`, () => api.showGhosts());
  }

  // לוח משימות: הערה רגילה. הוספה כותבת "- [ ] משימה" בסוף, סימון משנה רק את התיבה בשורה
  function boardCard(body, head, text) {
    const tasks = text == null ? [] : extractTasks(text);
    const openTasks = tasks.filter((t) => !t.done);
    head.querySelector('.hc-count').textContent = openTasks.length || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'hc-add';
    input.placeholder = 'משימה חדשה… (Enter)';
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || !input.value.trim()) return;
      e.preventDefault();
      const line = `- [ ] ${input.value.trim()}`;
      input.disabled = true;
      try {
        const p = boardPath();
        let cur = null;
        try { cur = await api.read(p); } catch { /* חדש */ }
        if (cur == null) await api.createNote(api.getRoot(), BOARD_NAME, `${line}\n`);
        else await api.write(p, cur.replace(/\s*$/, '\n') + line + '\n');
        api.onChanged?.(p);
      } finally { await render(); el.querySelector('.hc-add')?.focus(); }
    });
    body.append(input);
    if (!tasks.length) return empty(body, text == null ? 'הלוח נשמר כמסמך "משימות" בראש הכספת, ונוצר עם המשימה הראשונה.' : 'אין משימות בלוח.');
    const done = tasks.filter((t) => t.done);
    for (const t of [...openTasks, ...done.slice(-3)]) {
      taskRow(body, t.text, '', t.done, async (v) => { try { await api.toggleTask(boardPath(), t, v); } finally { render(); } }, null);
    }
    more(body, 'פתיחת הלוח כמסמך', () => api.openNote(boardPath()));
  }

  return { render, isEditing: () => editing };
}
