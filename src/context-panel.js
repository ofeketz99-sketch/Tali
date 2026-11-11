// לוח ההקשר: פס אייקונים צר בצד השמאלי של הדף, ולוח שנפתח ממנו עם מידע על המסמך הפתוח.
// לשוניות: קישורים (מהטקסט ומהמאפיינים), קישורים חוזרים, ראשי פרקים, משימות המסמך, מידע.
// סגור: רק הפס, בלי שורה מעל הדף. פתוח: עמודה לצד הדף. בחלון צר הלוח נפתח מעל הדף ולא מזיז אותו.
// תצוגה בלבד: הלוח לא כותב לקובץ, חוץ מסימון משימה (דרך העורך, כמו לחיצה על התיבה) והסרת קישור מהמאפיינים.
import { extractTargets, extractTags, extractTasks } from '../vault-data.js';
import { getFrontmatterLinks } from '../links.js';

const TABS = [
  { id: 'links', icon: 'link', title: 'קישורים', tip: 'קישורים מהמסמך' },
  { id: 'back', icon: 'backlinks', title: 'קישורים חוזרים', tip: 'מסמכים שמקשרים לכאן' },
  { id: 'outline', icon: 'outline', title: 'ראשי פרקים', tip: 'ראשי פרקים' },
  { id: 'tasks', icon: 'tasks', title: 'משימות במסמך', tip: 'משימות במסמך' },
  { id: 'info', icon: 'info', title: 'מידע', tip: 'מידע על המסמך' },
];
const PANEL_W = 280; // רוחב הלוח הפתוח, כמו ב־CSS (--dc-panel-w)
const RAIL_W = 46;   // רוחב הפס (--dc-rail-w)
const MIN_PAGE = 600; // רוחב הדף המינימלי לצד לוח פתוח

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const baseName = (t) => t.split('#')[0].split('|')[0].replace(/\\/g, '/').split('/').pop().replace(/\.md$/i, '');

export function countWords(text) {
  return (String(text || '').match(/[\p{L}\p{N}][\p{L}\p{N}'"׳״־-]*/gu) || []).length;
}

// api: getPath, getMarkdown, isRaw, getEditor, resolve(target) → נתיב או null, openLink(target), openNote(path),
// backlinks(path) → Promise<[{path, name, count, snippet}]>, pickLinks(), removeFrontLink(target), showTag(tag),
// addTaskSection(), getMtime(), prettyPath(path)
export function createContextPanel({ root, wrap, icon, store, api }) {
  let tab = store.get('tali:ctx-tab', null);
  if (tab === null && store.get('linksPanelOpen', false)) tab = 'links'; // מצב הלוח הישן (עד 3.4)
  if (tab && !TABS.some((t) => t.id === tab)) tab = null;
  let backList = [];
  let backToken = 0;
  let refreshTimer = null;

  // ----- מבנה -----
  root.innerHTML = '';
  const panel = el('section', 'dc-panel');
  panel.setAttribute('role', 'region');
  const head = el('div', 'dc-head');
  const title = el('h3', 'dc-title');
  const close = el('button', 'dc-close');
  close.type = 'button';
  close.innerHTML = icon('close', 15);
  close.dataset.tip = 'סגירת הלוח';
  close.setAttribute('aria-label', 'סגירת הלוח');
  close.addEventListener('click', () => setTab(null));
  head.append(title, close);
  const body = el('div', 'dc-body');
  panel.append(head, body);

  const rail = el('nav', 'dc-rail');
  rail.setAttribute('aria-label', 'לוח ההקשר');
  const buttons = {};
  for (const t of TABS) {
    const b = el('button', 'dc-btn');
    b.type = 'button';
    b.dataset.tab = t.id;
    b.dataset.tip = t.tip;
    b.setAttribute('aria-label', t.tip);
    b.innerHTML = `${icon(t.icon, 18)}<span class="dc-badge" hidden></span>`;
    b.addEventListener('click', () => setTab(tab === t.id ? null : t.id));
    rail.append(b);
    buttons[t.id] = b;
  }
  root.append(panel, rail);

  // ----- פתיחה וסגירה -----
  function setTab(next) {
    const opening = !tab && next;
    tab = next;
    store.set('tali:ctx-tab', next);
    layout();
    for (const t of TABS) {
      buttons[t.id].classList.toggle('on', t.id === tab);
      buttons[t.id].setAttribute('aria-pressed', t.id === tab ? 'true' : 'false');
    }
    if (tab) {
      title.textContent = TABS.find((t) => t.id === tab).title;
      if (opening) { panel.classList.remove('enter'); void panel.offsetWidth; panel.classList.add('enter'); }
      renderBody();
    }
  }
  function layout() {
    const has = !!api.getPath();
    root.hidden = !has;
    panel.hidden = !tab;
    wrap.classList.toggle('dc-open', has && !!tab);
  }

  // פתוח, הדף מצטמצם כדי לפנות מקום ללוח. רק אם הוא היה יורד מתחת ל־MIN_PAGE, הלוח נפתח מעליו (dc-narrow).
  const ro = new ResizeObserver(() => {
    const avail = wrap.clientWidth - 32; // הריווח של pageWrap
    wrap.classList.toggle('dc-narrow', avail < MIN_PAGE + PANEL_W + RAIL_W + 10 + 40);
  });
  ro.observe(wrap);

  // ----- נתונים -----
  function headings() {
    const ed = api.getEditor();
    const out = [];
    if (!ed || api.isRaw()) {
      api.getMarkdown().split('\n').forEach((line, i) => {
        const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
        if (m) out.push({ level: m[1].length, text: m[2], line: i });
      });
      return out;
    }
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') { out.push({ level: node.attrs.level, text: node.textContent, pos }); return false; }
      return true;
    });
    return out;
  }
  function tasks() {
    const ed = api.getEditor();
    if (!ed || api.isRaw()) return extractTasks(api.getMarkdown()).map((t) => ({ text: t.text, done: t.done, depth: t.depth }));
    const out = [];
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'taskItem') {
        // הטקסט של הפריט עצמו, בלי רשימות מקוננות בתוכו
        const first = node.firstChild;
        out.push({ text: first ? first.textContent : node.textContent, done: !!node.attrs.checked, pos });
      }
      return true;
    });
    return out;
  }
  function linkTargets(md) {
    const front = new Set(getFrontmatterLinks(md));
    return extractTargets(md).map((t) => ({ target: t, front: front.has(t), path: api.resolve(t.split('#')[0].split('|')[0]) }));
  }

  // ----- מונים על הפס -----
  function badge(id, n, muted) {
    const s = buttons[id].querySelector('.dc-badge');
    s.hidden = !n;
    s.textContent = n > 99 ? '99+' : String(n);
    s.classList.toggle('muted', !!muted);
  }
  function updateBadges(md) {
    badge('links', linkTargets(md).length);
    badge('back', backList.length);
    const ts = tasks();
    const open = ts.filter((t) => !t.done).length;
    badge('tasks', open || 0);
  }

  // ----- תוכן הלוח -----
  function empty(text) { body.append(el('div', 'dc-empty', text)); }
  function row({ iconName, name, sub, cls = '', onClick, extra, i = 0 }) {
    const r = el('div', 'dc-row ' + cls);
    r.style.setProperty('--i', Math.min(i, 12));
    r.tabIndex = 0;
    r.innerHTML = iconName ? icon(iconName, 15) : '';
    const txt = el('div', 'dc-text');
    txt.append(el('span', 'dc-name', name));
    if (sub) txt.append(el('small', 'dc-sub', sub));
    r.append(txt);
    if (extra) r.append(extra);
    if (onClick) {
      r.addEventListener('click', (e) => { if (!e.target.closest('.dc-x')) onClick(); });
      r.addEventListener('keydown', (e) => { if (e.key === 'Enter') onClick(); });
    }
    return r;
  }

  function renderLinks(md) {
    const list = linkTargets(md);
    if (!list.length) empty('אין במסמך קישורים למסמכים אחרים. כותבים [[ כדי לקשר.');
    list.forEach((l, i) => {
      const name = baseName(l.target);
      const heading = l.target.includes('#') ? l.target.split('#')[1].split('|')[0] : '';
      let extra = null;
      if (l.front) {
        extra = el('button', 'dc-x');
        extra.type = 'button';
        extra.innerHTML = icon('close', 13);
        extra.dataset.tip = 'הסרת הקישור מהמאפיינים';
        extra.setAttribute('aria-label', 'הסרת הקישור');
        extra.addEventListener('click', () => api.removeFrontLink(l.target));
      }
      body.append(row({
        iconName: l.path ? 'file' : 'ghost', name, i,
        sub: [heading && '# ' + heading, !l.path && 'עוד לא נוצר', l.front && 'במאפיינים'].filter(Boolean).join(' · '),
        cls: l.path ? '' : 'missing', extra, onClick: () => api.openLink(l.target),
      }));
    });
    const add = el('button', 'dc-add');
    add.type = 'button';
    add.innerHTML = `${icon('plus', 15)}<span>קישור למסמכים…</span>`;
    add.addEventListener('click', () => api.pickLinks());
    body.append(add);
  }

  function renderBack() {
    if (!backList.length) { empty('אין מסמכים שמקשרים לכאן.'); return; }
    backList.forEach((b, i) => body.append(row({
      iconName: 'file', i, name: b.count > 1 ? `${b.name} (${b.count})` : b.name, sub: b.snippet, cls: 'back',
      onClick: () => api.openNote(b.path),
    })));
  }

  function renderOutline() {
    const hs = headings();
    if (!hs.length) { empty('אין כותרות במסמך.'); return; }
    if (api.isRaw()) body.append(el('div', 'dc-note', 'קפיצה לכותרת עובדת בתצוגה המעוצבת.'));
    const min = Math.min(...hs.map((h) => h.level));
    hs.forEach((h, i) => {
      const r = row({
        name: h.text || '(כותרת ריקה)', i, cls: 'outline' + (h.level === min ? ' top' : ''),
        onClick: h.pos == null ? null : () => jumpTo(h.pos),
      });
      r.style.setProperty('--lvl', Math.min(h.level - min, 4));
      r.dataset.pos = h.pos ?? '';
      body.append(r);
    });
    markCurrentHeading();
  }
  function jumpTo(pos) {
    const ed = api.getEditor();
    if (!ed) return;
    const dom = ed.view.nodeDOM(pos);
    ed.chain().focus().setTextSelection(pos + 1).run();
    if (dom && dom.scrollIntoView) dom.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  // מדגיש בראשי הפרקים את הסעיף שבראש המסך
  function markCurrentHeading() {
    if (tab !== 'outline') return;
    const ed = api.getEditor();
    const rows = [...body.querySelectorAll('.dc-row.outline')];
    if (!ed || !rows.length || api.isRaw()) return;
    const top = wrap.getBoundingClientRect().top + 80;
    let current = null;
    for (const r of rows) {
      const dom = r.dataset.pos !== '' ? ed.view.nodeDOM(Number(r.dataset.pos)) : null;
      if (dom && dom.getBoundingClientRect && dom.getBoundingClientRect().top <= top) current = r;
    }
    rows.forEach((r) => r.classList.toggle('current', r === (current || rows[0])));
  }
  let scrollRaf = 0;
  wrap.addEventListener('scroll', () => {
    if (tab !== 'outline' || scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; markCurrentHeading(); });
  }, { passive: true });

  function renderTasks() {
    const ts = tasks();
    if (!ts.length) {
      empty('אין משימות במסמך.');
    } else {
      const open = ts.filter((t) => !t.done).length;
      const sum = el('div', 'dc-sum');
      sum.append(el('span', '', open ? `${open === 1 ? 'פתוחה אחת' : open + ' פתוחות'} מתוך ${ts.length}` : (ts.length === 1 ? 'המשימה הושלמה' : `כל ${ts.length} המשימות הושלמו`)));
      const bar = el('div', 'dc-progress');
      const fill = el('span');
      fill.style.width = `${Math.round(((ts.length - open) / ts.length) * 100)}%`;
      bar.append(fill);
      sum.append(bar);
      body.append(sum);
      if (api.isRaw()) body.append(el('div', 'dc-note', 'סימון משימות עובד בתצוגה המעוצבת.'));
      ts.forEach((t, i) => {
        const box = el('button', 'dc-check' + (t.done ? ' on' : ''));
        box.type = 'button';
        box.innerHTML = icon('check', 12);
        box.setAttribute('aria-label', t.done ? 'סימון כפתוחה' : 'סימון כבוצעה');
        const r = row({ name: t.text || '(משימה ריקה)', i, cls: 'task' + (t.done ? ' done' : ''), onClick: t.pos == null ? null : () => jumpTo(t.pos) });
        r.style.setProperty('--depth', t.depth ? Math.min(Math.floor(t.depth / 2), 4) : 0);
        r.prepend(box);
        if (t.pos != null) box.addEventListener('click', (e) => { e.stopPropagation(); toggleTask(t.pos); });
        else box.disabled = true;
        body.append(r);
      });
    }
    const add = el('button', 'dc-add');
    add.type = 'button';
    add.innerHTML = `${icon('plus', 15)}<span>משימות להמשך</span>`;
    add.dataset.tip = 'מוסיף בסוף המסמך סעיף "משימות להמשך"';
    add.addEventListener('click', () => api.addTaskSection());
    body.append(add);
  }
  function toggleTask(pos) {
    const ed = api.getEditor();
    if (!ed) return;
    const node = ed.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'taskItem') return;
    ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked }));
  }

  function renderInfo(md) {
    const text = api.isRaw() ? md : (document.querySelector('#editor .ProseMirror')?.innerText || '');
    const words = countWords(text);
    const chars = text.replace(/\s/g, '').length;
    const minutes = Math.max(1, Math.round(words / 200));
    const grid = el('dl', 'dc-stats');
    const stat = (k, v) => { grid.append(el('dt', '', k), el('dd', '', v)); };
    stat('מילים', words.toLocaleString('he-IL'));
    stat('תווים', chars.toLocaleString('he-IL'));
    stat('זמן קריאה', words ? `כ־${minutes} דק׳` : '—');
    stat('כותרות', String(headings().length));
    stat('קישורים', String(linkTargets(md).length));
    const mt = api.getMtime();
    if (mt) stat('שונה לאחרונה', new Date(mt).toLocaleString('he-IL', { dateStyle: 'medium', timeStyle: 'short' }));
    body.append(grid);
    const tags = extractTags(md);
    if (tags.length) {
      body.append(el('div', 'dc-label', 'תגיות'));
      const chips = el('div', 'dc-tags');
      for (const t of tags) {
        const c = el('button', 'dc-tag', '#' + t);
        c.type = 'button';
        c.addEventListener('click', () => api.showTag(t));
        chips.append(c);
      }
      body.append(chips);
    }
    body.append(el('div', 'dc-label', 'מיקום'));
    body.append(el('div', 'dc-path', api.prettyPath(api.getPath())));
  }

  function renderBody(quiet = false) {
    if (!tab || !api.getPath()) return;
    const scroll = body.scrollTop;
    body.innerHTML = '';
    const md = api.getMarkdown();
    if (tab === 'links') renderLinks(md);
    else if (tab === 'back') renderBack();
    else if (tab === 'outline') renderOutline();
    else if (tab === 'tasks') renderTasks();
    else if (tab === 'info') renderInfo(md);
    body.scrollTop = scroll;
    body.classList.toggle('quiet', quiet); // בעדכון אחרי עריכה: בלי אנימציית כניסה
  }

  // ----- עדכון -----
  function refresh() {
    layout();
    if (!api.getPath()) return;
    const md = api.getMarkdown();
    updateBadges(md);
    setTab(tab);
  }
  // אחרי עריכה: עדכון שקט (בלי אנימציה), חצי שנייה אחרי שמפסיקים להקליד
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      if (api.getPath()) { updateBadges(api.getMarkdown()); renderBody(true); }
    }, 500);
  }
  async function refreshBacklinks() {
    const p = api.getPath();
    if (!p) { backList = []; return; }
    const token = ++backToken;
    const list = await api.backlinks(p).catch(() => []);
    if (token !== backToken || p !== api.getPath()) return;
    backList = list;
    badge('back', backList.length);
    if (tab === 'back') renderBody();
  }

  setTab(tab);
  return { refresh, scheduleRefresh, refreshBacklinks, open: (id) => setTab(id), layout };
}
