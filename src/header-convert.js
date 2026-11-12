// המרת הכותרת הידנית בראש ההערות (קישורים / ביבליוגרפיה / תיוגים / תאריך / ----) למאפיינים, בכל הכספת.
// קודם תצוגה מקדימה: אילו מסמכים יומרו (עם "לפני" ו"אחרי") ואילו לא ולמה. רק אחרי אישור כותבים.
// הלוגיקה עצמה: headerToProps ב־vault-data.js (עם בדיקות).
import { headerToProps } from '../vault-data.js';
import { icon } from './icons.js';

// notes: [{ path, rel }]; skipDir: תיקייה שלא נוגעים בה (התבניות); onDone(changedPaths)
export async function openHeaderConvert({ notes, skipDir, read, mtime, write, onDone }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'vault-dialog hc-dialog';
  dlg.setAttribute('dir', 'rtl');
  dlg.innerHTML = `<div class="vd-head"><span class="vd-icon">${icon('outline', 18)}</span><h2>כותרות ← מאפיינים</h2><span class="vd-tools"></span></div>
    <div class="vd-body"><p class="vd-intro">סורק את המסמכים…</p></div>`;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-btn';
  close.setAttribute('aria-label', 'סגירה');
  close.innerHTML = icon('close', 18);
  close.addEventListener('click', () => dlg.close());
  dlg.querySelector('.vd-head').append(close);
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  const body = dlg.querySelector('.vd-body');
  const intro = body.querySelector('.vd-intro');

  // סריקה: קריאה בלבד
  const items = [], skipped = [];
  for (const n of notes) {
    if (skipDir && (n.path.startsWith(skipDir + '\\') || n.path.startsWith(skipDir + '/'))) continue;
    let text;
    try { text = await read(n.path); } catch { continue; }
    const r = headerToProps(text);
    if (r.skip) { if (!r.skip.startsWith('אין')) skipped.push({ ...n, reason: r.skip }); continue; }
    items.push({ ...n, before: text, after: r.text, removed: r.removed, on: true });
    if (!dlg.isConnected) return;
  }
  if (!dlg.isConnected) return;

  if (!items.length) {
    intro.textContent = skipped.length ? 'אין מסמכים שאפשר להמיר בבטחה.' : 'אין מסמכים עם כותרת להמרה.';
  } else {
    intro.textContent = `${items.length} מסמכים עם כותרת בראש הדף. הכותרת תעבור למאפיינים (links, source, tags, created), והטקסט של המסמך לא משתנה. לחיצה על מסמך מציגה לפני ואחרי.`;
  }
  const wrap = document.createElement('div');
  wrap.className = 'hc-wrap';
  const list = document.createElement('div');
  list.className = 'hc-list';
  const preview = document.createElement('div');
  preview.className = 'hc-preview';
  wrap.append(list, preview);
  body.append(wrap);

  const folder = (rel) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')).split('/').join(' › ') : '');
  const name = (rel) => rel.split('/').pop();
  function show(it) {
    list.querySelectorAll('.hc-row').forEach((r) => r.classList.toggle('sel', r._it === it));
    preview.innerHTML = '<h4>לפני</h4><pre class="hc-before"></pre><h4>אחרי</h4><pre class="hc-after"></pre>';
    preview.querySelector('.hc-before').textContent = it.removed;
    const fm = /^---\r?\n[\s\S]*?\r?\n---/.exec(it.after);
    preview.querySelector('.hc-after').textContent = fm ? fm[0] : '(הכותרת יורדת, בלי מאפיינים: היא הייתה ריקה)';
  }
  items.forEach((it, i) => {
    const row = document.createElement('label');
    row.className = 'hc-row';
    row._it = it;
    row.style.setProperty('--i', Math.min(i, 14));
    row.innerHTML = '<input type="checkbox" checked><span class="hc-name"></span><small></small>';
    row.querySelector('.hc-name').textContent = name(it.rel);
    row.querySelector('small').textContent = folder(it.rel);
    const box = row.querySelector('input');
    box.addEventListener('change', () => { it.on = box.checked; updateBtn(); });
    row.addEventListener('mouseenter', () => show(it));
    row.addEventListener('focusin', () => show(it));
    list.append(row);
  });
  if (skipped.length) {
    const s = document.createElement('details');
    s.className = 'hc-skipped';
    s.innerHTML = `<summary>${skipped.length} מסמכים לא יומרו</summary>`;
    for (const k of skipped) {
      const d = document.createElement('div');
      d.textContent = `${name(k.rel)}: ${k.reason}`;
      s.append(d);
    }
    body.append(s);
  }
  if (items[0]) show(items[0]);

  const foot = document.createElement('div');
  foot.className = 'hc-foot';
  const all = document.createElement('button');
  all.type = 'button';
  all.textContent = 'בחירת הכול / ניקוי';
  all.addEventListener('click', () => {
    const on = !items.every((it) => it.on);
    items.forEach((it) => { it.on = on; });
    list.querySelectorAll('input').forEach((b) => { b.checked = on; });
    updateBtn();
  });
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'primary';
  foot.append(all, go);
  if (items.length) dlg.append(foot);
  function updateBtn() {
    const n = items.filter((it) => it.on).length;
    go.textContent = n ? `המרה של ${n} מסמכים` : 'לא נבחרו מסמכים';
    go.disabled = !n;
  }
  updateBtn();

  go.addEventListener('click', async () => {
    go.disabled = true; all.disabled = true;
    const chosen = items.filter((it) => it.on);
    const changed = [], failed = [];
    for (const [i, it] of chosen.entries()) {
      go.textContent = `ממיר… ${i + 1}/${chosen.length}`;
      try {
        // רק אם הקובץ לא השתנה מאז הסריקה
        if ((await read(it.path)) !== it.before) throw new Error('המסמך השתנה מאז הסריקה');
        await write(it.path, it.after, await mtime(it.path));
        changed.push(it.path);
      } catch (err) { failed.push(`${name(it.rel)}: ${err.message}`); }
    }
    intro.textContent = `הומרו ${changed.length} מסמכים.` + (failed.length ? ` ${failed.length} לא הומרו: ${failed.slice(0, 3).join(' · ')}` : '');
    wrap.remove();
    foot.remove();
    onDone?.(changed);
  });
}
