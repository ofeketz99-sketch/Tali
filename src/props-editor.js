// עורך מאפיינים (frontmatter) כטופס: שם, ערך, או רשימה. מחליף את תיבת הטקסט במקרה הרגיל.
// עובד רק על YAML פשוט: "מפתח: ערך" ורשימות "  - פריט". כל דבר אחר (הערות, מבנים מקוננים, טקסט רב־שורות)
// נשאר בתיבת הטקסט המקורית, כדי לא לשבור אותו. ערך שלא נערך נכתב חזרה בדיוק כמו שהיה.
import { icon } from './icons.js';

const KEY_RE = /^([^\s:#\-][^:]*?)\s*:(?:\s(.*))?$/;

export function parseSimpleYaml(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = KEY_RE.exec(line);
    if (!m || /^\s/.test(line)) return null;
    const value = (m[2] ?? '').trim();
    if (value === '' || value == null) {
      const items = [];
      while (i + 1 < lines.length && /^\s*-\s/.test(lines[i + 1])) items.push(lines[++i].replace(/^\s*-\s*/, ''));
      if (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) return null; // מבנה מקונן
      entries.push(items.length ? { key: m[1], list: items } : { key: m[1], raw: '' });
    } else {
      if (/^[|>]/.test(value)) return null; // טקסט רב־שורות
      entries.push({ key: m[1], raw: value });
    }
  }
  return entries;
}

export const unquote = (raw) => {
  const s = String(raw ?? '').trim();
  if (/^".*"$/.test(s)) return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  if (/^'.*'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
  return s;
};
export const quote = (v) => {
  const s = String(v);
  if (s === '') return '';
  // מרכאות רק כשבלעדיהן YAML יקרא את הערך אחרת (תו מיוחד בהתחלה, ": " או " #" באמצע, רווח בסוף)
  if (/^[\s\-?:,\[\]{}#&*!|>'"%@`]|: | #|\s$/.test(s)) {
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return s;
};

export function serializeYaml(entries) {
  const out = [];
  for (const e of entries) {
    if (!e.key.trim()) continue;
    if (e.list) {
      out.push(`${e.key}:`);
      for (const item of e.list) out.push(`  - ${item}`);
    } else out.push(e.raw === '' ? `${e.key}:` : `${e.key}: ${e.raw}`);
  }
  return out.join('\n');
}

// textarea: תיבת המאפיינים המקורית. הטופס כותב אליה ומשגר input, כך שכל לוגיקת השמירה הקיימת עובדת.
export function attachPropsEditor(textarea) {
  const box = document.createElement('div');
  box.className = 'props-form';
  box.hidden = true;
  textarea.before(box);
  let rawMode = false;
  let forceShow = false;

  const commit = (entries) => {
    textarea.value = serializeYaml(entries);
    textarea.dispatchEvent(new Event('input'));
  };

  function render() {
    const text = textarea.value;
    const entries = parseSimpleYaml(text);
    const hasProps = !!text.trim() || forceShow;
    // אין הערה פתוחה / במצב Markdown: התיבה המקורית מוסתרת וכך גם הטופס
    if (textarea.dataset.blocked === '1' || !hasProps) { box.hidden = true; textarea.classList.remove('props-raw-visible'); return; }
    if (!entries || rawMode) {
      box.hidden = !entries; // YAML מורכב: רק תיבת הטקסט
      textarea.hidden = false;
      textarea.classList.add('props-raw-visible');
      if (entries) drawHeader(entries, true);
      return;
    }
    textarea.hidden = true;
    textarea.classList.remove('props-raw-visible');
    box.hidden = false;
    drawHeader(entries, false);
    entries.forEach((e, i) => box.append(row(entries, e, i)));
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'pf-add';
    add.innerHTML = `${icon('plus', 14)}<span>מאפיין</span>`;
    add.addEventListener('click', () => {
      entries.push({ key: '', raw: '' });
      commitDraft(entries);
      box.querySelector('.pf-row:last-of-type .pf-key')?.focus();
    });
    box.append(add);
  }

  // שורה חדשה בלי שם עדיין: מציגים אותה בלי לשמור (מפתח ריק לא נכתב לקובץ)
  let draft = null;
  function commitDraft(entries) { draft = entries; renderDraft(); }
  function renderDraft() {
    const entries = draft; draft = null;
    box.innerHTML = '';
    drawHeader(entries, false);
    entries.forEach((e, i) => box.append(row(entries, e, i)));
  }

  function drawHeader(entries, raw) {
    box.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'pf-head';
    head.innerHTML = `<span>מאפיינים</span>`;
    const mode = document.createElement('button');
    mode.type = 'button';
    mode.className = 'pf-mode';
    mode.textContent = raw ? 'טופס' : 'YAML';
    mode.dataset.tip = raw ? 'חזרה לעריכה בטופס' : 'עריכה כטקסט YAML';
    mode.addEventListener('click', () => { rawMode = !rawMode; render(); if (rawMode) textarea.focus(); });
    head.append(mode);
    box.append(head);
  }

  function row(entries, e, i) {
    const r = document.createElement('div');
    r.className = 'pf-row';
    const key = document.createElement('input');
    key.className = 'pf-key';
    key.value = e.key;
    key.placeholder = 'שם';
    key.setAttribute('aria-label', 'שם המאפיין');
    const val = document.createElement('input');
    val.className = 'pf-val';
    val.placeholder = e.list ? 'פריטים, מופרדים בפסיקים' : 'ערך';
    val.value = e.list ? e.list.map(unquote).join(', ') : unquote(e.raw);
    if (e.list) r.classList.add('is-list');
    val.setAttribute('aria-label', 'ערך המאפיין');
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'pf-del';
    del.innerHTML = icon('close', 13);
    del.setAttribute('aria-label', 'מחיקת המאפיין');
    del.dataset.tip = 'מחיקת המאפיין';
    const original = { ...e, list: e.list && [...e.list] };
    key.addEventListener('change', () => { e.key = key.value.replace(/:/g, '').trim(); commit(entries); });
    val.addEventListener('change', () => {
      if (e.list) {
        const items = val.value.split(',').map((s) => s.trim()).filter(Boolean);
        const before = original.list.map(unquote);
        e.list = items.map((it, k) => (before[k] === it ? original.list[k] : quote(it)));
      } else {
        e.raw = val.value.trim() === unquote(original.raw) ? original.raw : quote(val.value.trim());
      }
      commit(entries);
    });
    del.addEventListener('click', () => { entries.splice(i, 1); commit(entries); });
    for (const input of [key, val]) input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); } });
    r.append(key, val, del);
    return r;
  }

  textarea.addEventListener('blur', () => { if (!rawMode) render(); });
  return {
    render,
    // "הוספת מאפיינים" כשאין עדיין: מציג טופס עם שורה ריקה
    addFirst() { forceShow = true; rawMode = false; render(); box.querySelector('.pf-add')?.click(); },
    reset() { forceShow = false; },
  };
}
