// לוח ההקשר: פס אייקונים צר בצד השמאלי של הדף, ולוח שנפתח ממנו עם מידע על המסמך הפתוח.
// לשוניות: קישורים (החוצה, מהטקסט ומהמאפיינים, ומתחת לקו: פנימה), ראשי פרקים, תיבות סימון, משימות להמשך, מידע.
// תיבות סימון ומשימות להמשך הן שני ריכוזים נפרדים: משימה להמשך היא תיבת סימון בסעיף "משימות להמשך"
// של המסמך (FOLLOW_UP ב־vault-data.js), וכל השאר הן תיבות סימון רגילות.
// סגור: רק הפס. פתוח: עמודה לצד הדף. בחלון צר הלוח נפתח מעל הדף. בחלון רחב (dc-roomy) הלוח נפתח לבד
// בלשונית האחרונה, והדף נשאר במרכז; אם המשתמש סגר אותו שם, הוא נשאר סגור.
// תצוגה בלבד: הלוח לא כותב לקובץ, חוץ מסימון משימה ו(10.7) הסרת קישור, שניהם דרך העורך,
// ו"קישור" של אזכור, שכותב [[קישור]] במסמך האחר (linkMention ב־renderer.js, עם בדיקת זמן שינוי).
import { extractTargets, extractTags, extractTasks, FOLLOW_UP, isFollowUpHeading } from '../vault-data.js';
import { FLAG_LIST } from './flags.js';
import { getFrontmatterLinks } from '../links.js';

const TABS = [
  // 8.8: קישורים החוצה ופנימה באותו לוח, עם קו הפרדה (עד 8.7: שתי לשוניות, 'links' ו־'back')
  { id: 'links', icon: 'link', title: 'קישורים', tip: 'קישורים: החוצה ופנימה' },
  { id: 'outline', icon: 'outline', title: 'ראשי פרקים', tip: 'ראשי פרקים' },
  { id: 'checks', icon: 'tasks', title: 'תיבות סימון', tip: 'תיבות סימון במסמך' },
  { id: 'followups', icon: 'taskSection', title: 'משימות להמשך', tip: 'משימות להמשך' },
  { id: 'props', icon: 'props', title: 'מאפיינים', tip: 'מאפיינים (YAML)' },
  { id: 'info', icon: 'info', title: 'מידע', tip: 'מידע על המסמך' },
];
// מספר המאפיינים הגלויים בטופס (בלי links: ו־created:, שהעורך מוציא מהתיבה)
const countProps = (yaml) => (String(yaml || '').match(/^[^\s#-][^:\n]*:/gm) || []).length;
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
// backlinks(path) → Promise<[{path, name, count, snippet}]>, pickLinks(), removeFrontLink(target), unlinkText(target),
// makeLinkHub(anchor), findMentions(path) → Promise<[{path, name, snippet}]>, linkMention(path), showTag(tag),
// addFollowUp(text), getMtime(), prettyPath(path), getFlag(), setFlag(color|null), addProperties()
// propsHost: המיכל של טופס המאפיינים (props-editor.js). הלוח מעביר אותו ללשונית "מאפיינים" (אותו אלמנט,
// עם המאזינים שלו), כך שהעורך ממשיך לכתוב ולקרוא ממנו כרגיל גם כשהלשונית סגורה.
export function createContextPanel({ root, wrap, icon, store, api, propsHost = null }) {
  const propsArea = propsHost?.querySelector('textarea');
  if (propsHost) { propsHost.remove(); propsHost.hidden = false; }
  const valid = (t) => (t === 'tasks' ? 'checks' : t === 'back' ? 'links' : TABS.some((x) => x.id === t) ? t : null); // 'tasks' עד 3.8, 'back' עד 8.7
  let chosen = valid(store.get('tali:ctx-tab', null)); // מה שהמשתמש פתח
  if (chosen === null && store.get('linksPanelOpen', false)) chosen = 'links'; // מצב הלוח הישן (עד 3.4)
  let lastTab = valid(store.get('tali:ctx-last-tab', null)) || chosen || 'outline';
  let roomyClosed = store.get('tali:ctx-roomy-closed', false);
  let roomy = false;
  let tab = null; // הלשונית שמוצגת בפועל
  const shownTab = () => chosen || (roomy && !roomyClosed ? lastTab : null);
  let backList = [];
  let mentions = { path: null, list: null };
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
  // user: בחירה של המשתמש (לחיצה, פקודה). בלי: רק חישוב מחדש (למשל כשהחלון התרחב)
  function setTab(next, { user = true } = {}) {
    if (user) {
      if (next) { chosen = next; lastTab = next; roomyClosed = false; store.set('tali:ctx-last-tab', next); }
      else { chosen = null; if (roomy) roomyClosed = true; }
      store.set('tali:ctx-tab', chosen);
      store.set('tali:ctx-roomy-closed', roomyClosed);
    }
    const opening = !tab && shownTab();
    tab = shownTab();
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
  // כשיש מקום ללוח משני צדי הדף (dc-roomy), הלוח פתוח והדף לא זז ממרכזו.
  const ro = new ResizeObserver(() => {
    const avail = wrap.clientWidth - 32; // הריווח של pageWrap
    const pw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-width')) || 820;
    wrap.classList.toggle('dc-narrow', avail < MIN_PAGE + PANEL_W + RAIL_W + 10 + 40);
    const nowRoomy = pw < 5000 && avail >= pw + 2 * (PANEL_W + RAIL_W + 10) + 40;
    wrap.classList.toggle('dc-roomy', nowRoomy);
    if (nowRoomy !== roomy) { roomy = nowRoomy; setTab(null, { user: false }); }
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
    if (!ed || api.isRaw()) return extractTasks(api.getMarkdown()).map((t) => ({ text: t.text, done: t.done, depth: t.depth, followUp: t.followUp }));
    const out = [];
    let section = 0; // כמו ב־extractTasks: מהכותרת "משימות להמשך" עד כותרת באותה רמה או גבוהה ממנה
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        const level = node.attrs.level;
        if (isFollowUpHeading(node.textContent)) section = level;
        else if (section && level <= section) section = 0;
        return false;
      }
      if (node.type.name === 'taskItem') {
        // הטקסט של הפריט עצמו, בלי רשימות מקוננות בתוכו
        const first = node.firstChild;
        out.push({ text: first ? first.textContent : node.textContent, done: !!node.attrs.checked, pos, followUp: section > 0 });
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
    badge('links', linkTargets(md).length + backList.length);
    const ts = tasks();
    badge('checks', ts.filter((t) => !t.followUp && !t.done).length, true);
    badge('followups', ts.filter((t) => t.followUp && !t.done).length);
    badge('props', api.isRaw() ? 0 : countProps(propsArea?.value), true);
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
      r.addEventListener('click', (e) => { if (!e.target.closest('.dc-x, .dc-link-mention')) onClick(); });
      r.addEventListener('keydown', (e) => { if (e.key === 'Enter') onClick(); });
    }
    return r;
  }

  // כותרת קטנה לחלק בתוך הלוח (החוצה / פנימה), עם מונה
  function section(iconName, text, n, divider) {
    const h = el('div', 'dc-section' + (divider ? ' divider' : ''));
    h.innerHTML = icon(iconName, 14);
    h.append(el('span', null, text), el('span', 'dc-section-n', String(n)));
    body.append(h);
  }

  function renderLinks(md) {
    const list = linkTargets(md);
    section('link', 'החוצה', list.length, false);
    if (!list.length) empty('אין במסמך קישורים למסמכים אחרים. כותבים [[ כדי לקשר.');
    list.forEach((l, i) => {
      const name = baseName(l.target);
      const heading = l.target.includes('#') ? l.target.split('#')[1].split('|')[0] : '';
      // 10.7: לכל קישור יש ✕. קשור (מהמאפיינים): יוצא מהקשורים. בטקסט: הקישור הופך לטקסט רגיל.
      const extra = el('button', 'dc-x');
      extra.type = 'button';
      extra.innerHTML = icon('close', 13);
      extra.dataset.tip = l.front ? 'הסרה מהקשורים' : 'ביטול הקישור (הטקסט נשאר)';
      extra.setAttribute('aria-label', 'הסרת הקישור');
      extra.addEventListener('click', () => (l.front ? api.removeFrontLink(l.target) : api.unlinkText(l.target)));
      body.append(row({
        iconName: l.path ? 'file' : 'ghost', name, i,
        sub: [heading && '# ' + heading, !l.path && 'עוד לא נוצר', l.front && 'קשור'].filter(Boolean).join(' · '),
        cls: l.path ? '' : 'missing', extra, onClick: () => api.openLink(l.target),
      }));
    });
    const actions = el('div', 'dc-actions');
    const add = el('button', 'dc-add');
    add.type = 'button';
    add.innerHTML = `${icon('plus', 15)}<span>מסמך קשור…</span>`;
    add.dataset.tip = 'מוסיף לשורת "קשורים" בראש הדף (Ctrl+Shift+K)';
    add.addEventListener('click', () => api.pickLinks());
    const hub = el('button', 'dc-add');
    hub.type = 'button';
    hub.innerHTML = `${icon('link', 15)}<span>פתק קישור…</span>`;
    hub.dataset.tip = 'פתק חדש שמקשר כמה מסמכים בנושא אחד';
    hub.addEventListener('click', () => api.makeLinkHub(hub));
    actions.append(add, hub);
    body.append(actions);
  }

  function renderBack() {
    section('backlinks', 'פנימה', backList.length, true);
    if (!backList.length) empty('אין מסמכים שמקשרים לכאן.');
    backList.forEach((b, i) => body.append(row({
      iconName: 'file', i, name: b.count > 1 ? `${b.name} (${b.count})` : b.name, sub: b.snippet, cls: 'back',
      onClick: () => api.openNote(b.path),
    })));
    renderMentions();
  }

  // 10.7: "מוזכר בלי קישור": מסמכים שכתוב בהם שם המסמך הזה. "קישור" הופך את האזכור הראשון ל־[[קישור]].
  // נטען פעם אחת לכל מסמך (חיפוש בכל הכספת), ומתרענן אחרי קישור.
  function renderMentions() {
    const p = api.getPath();
    if (!api.findMentions || !p) return;
    if (mentions.path !== p) loadMentions(p);
    if (mentions.list === null) { body.append(mentionsSearching()); return; } // 10.9: עוד מחפש
    if (!mentions.list.length) return;
    section('search', 'מוזכר בלי קישור', mentions.list.length, true);
    mentions.list.forEach((m, i) => {
      const btn = el('button', 'dc-link-mention', 'קישור');
      btn.type = 'button';
      btn.dataset.tip = 'הופך את האזכור הראשון שם ל־[[קישור]] לכאן';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await api.linkMention(m.path);
        mentions.path = null; // לטעון מחדש
        refreshBacklinks();
      });
      body.append(row({ iconName: 'file', i, name: m.name, sub: m.snippet, cls: 'back mention', extra: btn, onClick: () => api.openNote(m.path) }));
    });
  }
  // 10.9: חיווי חיפוש בסגנון Lucide (קווים של 2px, קצוות מעוגלים): זכוכית מגדלת שעוברת על שורות של דף,
  // והשורות מתבהרות אחת אחרי השנייה. מופיע רק אחרי רגע (CSS), כדי שחיפוש מהיר לא יהבהב. בלי תנועה: נייח.
  function mentionsSearching() {
    const box = el('div', 'dc-searching');
    box.setAttribute('role', 'status');
    box.innerHTML = `<svg class="dc-search-anim" viewBox="0 0 48 32" width="48" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect class="dc-sa-page" x="3" y="3" width="26" height="26" rx="3"/>
      <path class="dc-sa-line l1" d="M9 11h14"/><path class="dc-sa-line l2" d="M9 16h10"/><path class="dc-sa-line l3" d="M9 21h12"/>
      <g class="dc-sa-lens"><circle cx="34" cy="14" r="6"/><path d="m38.5 18.5 4.5 4.5"/></g>
    </svg><span>מחפש אזכורים בלי קישור…</span>`;
    return box;
  }
  async function loadMentions(p) {
    mentions = { path: p, list: null };
    const list = await api.findMentions(p).catch(() => []);
    if (mentions.path !== p) return;
    mentions.list = list;
    if (tab === 'links' && api.getPath() === p) renderBody(true);
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

  function renderTasks(followUp) {
    const ts = tasks().filter((t) => !!t.followUp === followUp);
    if (!ts.length) {
      empty(followUp
        ? 'אין משימות להמשך במסמך. משימה שכותבים למטה נכנסת לסעיף "משימות להמשך" בסוף המסמך.'
        : 'אין תיבות סימון במסמך (מחוץ לסעיף "משימות להמשך").');
    } else {
      const open = ts.filter((t) => !t.done).length;
      const sum = el('div', 'dc-sum');
      sum.append(el('span', '', followUp
        ? (open ? `${open === 1 ? 'פתוחה אחת' : open + ' פתוחות'} מתוך ${ts.length}` : (ts.length === 1 ? 'המשימה הושלמה' : `כל ${ts.length} המשימות הושלמו`))
        : `${ts.length - open} מסומנות מתוך ${ts.length}`));
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
    if (!followUp) return;
    // משימה חדשה להמשך: נכנסת לסוף הסעיף (או לסעיף חדש בסוף המסמך), והשדה נשאר פתוח להוספה נוספת
    const add = el('input', 'dc-new-task');
    add.type = 'text';
    add.placeholder = 'משימה חדשה להמשך…';
    add.setAttribute('aria-label', 'משימה חדשה להמשך');
    add.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !add.value.trim()) return;
      e.preventDefault();
      const text = add.value.trim();
      add.value = '';
      api.addFollowUp(text);
      renderBody(true);
    });
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
    stat('קישורים החוצה', String(linkTargets(md).length));
    stat('קישורים פנימה', String(backList.length));
    const mt = api.getMtime();
    if (mt) stat('שונה לאחרונה', new Date(mt).toLocaleString('he-IL', { dateStyle: 'medium', timeStyle: 'short' }));
    body.append(grid);
    // 11.5: extractTags מחזירה { tag, index }; עד עכשיו הוצג "#[object Object]", ותגית חוזרת הופיעה כמה פעמים
    const tags = [...new Set(extractTags(md).map((t) => t.tag))];
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
    // דגל: נשמר במאפיינים (flag:), ומופיע בעץ וברשימת המסומנים
    body.append(el('div', 'dc-label', 'דגל'));
    const flags = el('div', 'dc-flags');
    const current = api.getFlag();
    for (const f of [{ id: null, name: 'ללא דגל' }, ...FLAG_LIST]) {
      const b = el('button', 'dc-flag' + (f.id === current ? ' on' : '') + (f.id ? '' : ' none'));
      b.type = 'button';
      if (f.id) b.dataset.flag = f.id;
      b.dataset.tip = f.name;
      b.setAttribute('aria-label', f.name);
      b.addEventListener('click', () => { api.setFlag(f.id); setTimeout(() => renderBody(true), 50); });
      flags.append(b);
    }
    body.append(flags);
    body.append(el('div', 'dc-label', 'מיקום'));
    body.append(el('div', 'dc-path', api.prettyPath(api.getPath())));
  }

  // מאפיינים: הטופס עצמו עובר לכאן. אין מאפיינים: הסבר וכפתור הוספה. בתצוגת Markdown הם בראש הקובץ.
  function renderProps() {
    if (!propsHost) { empty('אין טופס מאפיינים.'); return; }
    if (api.isRaw()) { empty('בתצוגת Markdown המאפיינים נערכים בראש הקובץ, בין השורות ---.'); return; }
    body.append(propsHost);
    updatePropsEmpty();
  }
  function updatePropsEmpty() {
    body.querySelector('.dc-props-empty')?.remove();
    const formShown = propsHost.querySelector('.props-form:not([hidden])') || (propsArea && !propsArea.hidden);
    if (formShown) return;
    const box = el('div', 'dc-props-empty');
    box.append(el('div', 'dc-empty', 'אין מאפיינים למסמך. מאפיינים נשמרים בראש הקובץ (YAML), כמו באובסידיאן.'));
    const add = el('button', 'dc-add');
    add.type = 'button';
    add.innerHTML = `${icon('plus', 15)}<span>הוספת מאפיין</span>`;
    add.addEventListener('click', () => { box.remove(); api.addProperties(); });
    box.append(add);
    body.append(box);
  }

  function renderBody(quiet = false) {
    if (!tab || !api.getPath()) return;
    // הטופס כבר בלוח: לא בונים מחדש, כדי לא לאבד פוקוס בזמן הקלדה בשדה של מאפיין
    if (tab === 'props' && propsHost && !api.isRaw() && propsHost.parentNode === body) { updatePropsEmpty(); return; }
    const scroll = body.scrollTop;
    // שדה המשימה החדשה: אם מקלידים בו, הפוקוס והטקסט נשמרים גם כשהלוח מתעדכן אחרי עריכה
    const typing = document.activeElement?.classList.contains('dc-new-task') ? document.activeElement.value : null;
    body.innerHTML = '';
    const md = api.getMarkdown();
    if (tab === 'links') { renderLinks(md); renderBack(); }
    else if (tab === 'outline') renderOutline();
    else if (tab === 'checks') renderTasks(false);
    else if (tab === 'followups') renderTasks(true);
    else if (tab === 'props') renderProps();
    else if (tab === 'info') renderInfo(md);
    body.scrollTop = scroll;
    if (typing !== null) { const i = body.querySelector('.dc-new-task'); if (i) { i.value = typing; i.focus(); } }
    body.classList.toggle('quiet', quiet); // בעדכון אחרי עריכה: בלי אנימציית כניסה
  }

  // ----- עדכון -----
  function refresh() {
    layout();
    if (!api.getPath()) return;
    const md = api.getMarkdown();
    updateBadges(md);
    setTab(null, { user: false });
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
    if (mentions.path === p && mentions.list) {
      // מסמך שכבר מקשר לכאן כבר לא "מוזכר בלי קישור"
      const linking = new Set(list.map((b) => b.path));
      mentions.list = mentions.list.filter((m) => !linking.has(m.path));
    }
    badge('links', linkTargets(api.getMarkdown()).length + backList.length);
    if (tab === 'links' || tab === 'info') renderBody(true);
  }

  // לחיצה מחוץ ללוח: כשהוא מעל הדף (חלון צר) כל לחיצה בחוץ סוגרת. כשהוא לצד הדף, רק לחיצה על הרקע הריק.
  function outsideClick(target) {
    if (!tab || root.contains(target)) return;
    if (target.closest?.('.tb-menu, dialog, #tip')) return;
    // בחלון רחב הלוח הוא חלק מהפריסה: לחיצה על הרקע לא סוגרת אותו
    if (wrap.classList.contains('dc-narrow') || (target === wrap && !roomy)) setTab(null);
  }

  setTab(null, { user: false });
  return { refresh, scheduleRefresh, refreshBacklinks, open: (id) => setTab(id), layout, outsideClick, rerender: () => renderBody(true) };
}
