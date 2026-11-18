// 10.8: עורך סרגל הכלים בהגדרות, הכול בגרירה (לבקשת המשתמש: "קשה לשלוט במיקום, והאיחוד לא טוב").
// עד 10.7 הייתה גרירת HTML5 (רוח רפאים של הדפדפן, בלי תנועה) וכפתורי חצים/איחוד/פירוק בריחוף.
//
// - כפתור: גוררים אותו (הוא מתרומם ונע עם העכבר), והשאר זזים הצידה בתנועה רכה כדי לפנות לו מקום.
//   לתוך קבוצה: במקום שבו הוא יעמוד. בין שתי קבוצות: נפתחת "קבוצה חדשה". לרשימה שלמטה: יוצא מהסרגל.
// - קבוצה: גוררים בידית ⋮⋮. לקצה העליון/התחתון של קבוצה אחרת: הזזה. לאמצע שלה: איחוד (היא מוארת וכתוב "איחוד").
// - פירוק והוצאת קבוצה: כפתורים קטנים בכרטיס. ✕ על כפתור מוציא אותו, ולחיצה על כפתור שלמטה מוסיפה אותו לסוף.
// - "כך ייראה הסרגל": שורת תצוגה מקדימה שמתעדכנת כבר בזמן הגרירה.
// התנועה: FLIP (מדידה לפני ואחרי שינוי ה־DOM, ואנימציית transform מההפרש), לפי מפתח יציב לכל כפתור וקבוצה,
// כך שגם אחרי שמירה ובנייה מחדש כל כפתור "עף" למקומו החדש (גם לרשימה שלמטה וממנה).
// פונקציות הסדר עצמן טהורות ב־toolbar-layout.js (עם בדיקות). כאן רק הממשק.
import { itemLabel, itemIcon, unusedItems, removeItem, moveItem, splitSection, removeSection, moveSectionTo, mergeSectionInto } from './toolbar-layout.js';

const EASE = 'cubic-bezier(.22, 1, .36, 1.12)';
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// ----- FLIP -----
function snapshot(roots) {
  const m = new Map();
  for (const root of roots) root.querySelectorAll('[data-flip]').forEach((n) => {
    const r = n.getBoundingClientRect();
    if (r.width || r.height) m.set(n.dataset.flip, r); // מוסתר (כפתור בפס "קבוצה חדשה"): ייכנס כחדש
  });
  return m;
}
function play(roots, before, { skip = null, duration = 240 } = {}) {
  if (!before || reduced()) return;
  const nodes = roots.flatMap((r) => [...r.querySelectorAll('[data-flip]')]);
  nodes.forEach((n) => n.getAnimations().forEach((a) => { if (a.id === 'flip') a.cancel(); }));
  const delta = new Map();
  for (const n of nodes) {
    const a = before.get(n.dataset.flip);
    const b = n.getBoundingClientRect();
    delta.set(n, a ? { x: a.left - b.left, y: a.top - b.top, isNew: false } : { x: 0, y: 0, isNew: true });
  }
  for (const n of nodes) {
    if (n === skip) continue;
    const d = delta.get(n);
    if (d.isNew) {
      n.animate([{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE }).id = 'flip';
      continue;
    }
    // כפתור בתוך קבוצה שזזה בעצמה: רק ההפרש שלו מהקבוצה, אחרת הוא זז פעמיים
    const parent = n.parentElement?.closest('[data-flip]');
    const pd = parent && delta.get(parent);
    const x = d.x - (pd && !pd.isNew ? pd.x : 0);
    const y = d.y - (pd && !pd.isNew ? pd.y : 0);
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue;
    n.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'none' }], { duration, easing: EASE }).id = 'flip';
  }
}

export function createToolbarEditor({ icon, getSections, save }) {
  const preview = el('div', 'set-tb-preview');
  preview.setAttribute('aria-label', 'כך ייראה הסרגל');
  const list = el('div', 'set-tb-list');
  const pool = el('div', 'set-tb-pool');
  const roots = [list, pool];
  let drag = null;

  const commit = (sections) => { const before = snapshot(roots); save(sections); draw(); play(roots, before); };

  // ----- תצוגה מקדימה -----
  function drawPreview(sections) {
    preview.replaceChildren(...sections.map((s) => {
      const g = el('span', 'set-tb-pv-group');
      for (const id of s.items) {
        const b = el('span', 'set-tb-pv-btn');
        b.innerHTML = icon(itemIcon(id), 15);
        b.dataset.tip = itemLabel(id);
        g.append(b);
      }
      return g;
    }));
    if (!sections.length) preview.append(el('span', 'set-note', 'הסרגל ריק'));
  }

  // ----- בנייה -----
  function chip(id, { inPool = false } = {}) {
    const c = el('span', 'set-tb-chip');
    c.dataset.item = id;
    c.dataset.flip = 'i:' + id;
    c.innerHTML = icon(itemIcon(id), 15);
    c.append(el('span', 'set-tb-chip-name', itemLabel(id)));
    if (inPool) {
      c.tabIndex = 0;
      c.setAttribute('role', 'button');
      c.dataset.tip = 'גרירה למקום בסרגל, או לחיצה להוספה בסוף';
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addToEnd(id); } });
    } else {
      const x = el('button', 'set-tb-chip-x');
      x.type = 'button';
      x.innerHTML = icon('close', 12);
      x.dataset.tip = 'הוצאה מהסרגל';
      x.setAttribute('aria-label', `הוצאה מהסרגל: ${itemLabel(id)}`);
      x.addEventListener('click', () => commit(removeItem(getSections(), id)));
      c.append(x);
    }
    c.addEventListener('pointerdown', (e) => press(e, () => startChip(c, id)));
    return c;
  }
  const addToEnd = (id) => {
    const sections = getSections();
    commit(moveItem(sections, id, sections.length, 0, { asNew: true }));
  };

  function gap() {
    const g = el('div', 'set-tb-gap');
    g.setAttribute('aria-hidden', 'true');
    return g;
  }

  function card(sec, i, count) {
    const c = el('div', 'set-tb-card');
    c.dataset.flip = 'c:' + sec.items[0];
    c.dataset.sec = String(i);
    const grip = el('button', 'set-tb-grip');
    grip.type = 'button';
    grip.innerHTML = icon('grip', 16);
    grip.dataset.tip = 'גרירה: הזזת הקבוצה, או שחרור על קבוצה אחרת לאיחוד';
    grip.setAttribute('aria-label', `קבוצה ${i + 1}: גרירה להזזה או לאיחוד. חצים למעלה ולמטה מזיזים`);
    grip.addEventListener('pointerdown', (e) => press(e, () => startGroup(c, i)));
    grip.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      if (!d || i + d < 0 || i + d >= count) return;
      e.preventDefault();
      commit(moveSectionTo(getSections(), i, i + d));
      list.querySelector(`[data-flip="c:${sec.items[0]}"] .set-tb-grip`)?.focus();
    });
    const items = el('div', 'set-tb-items');
    items.append(...sec.items.map((id) => chip(id)));
    const tools = el('span', 'set-tb-tools');
    const tool = (name, label, run) => {
      const b = el('button', 'icon-btn');
      b.type = 'button';
      b.innerHTML = icon(name, 15);
      b.dataset.tip = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', run);
      tools.append(b);
    };
    if (sec.items.length > 1) tool('ungroup', 'פירוק: כל כפתור בקבוצה משלו', () => commit(splitSection(getSections(), i)));
    tool('trash', 'הוצאת כל הקבוצה מהסרגל', () => commit(removeSection(getSections(), i)));
    c.append(grip, items, tools);
    return c;
  }

  function draw() {
    if (drag) return;
    const sections = getSections();
    const nodes = [gap()];
    sections.forEach((s, i) => nodes.push(card(s, i, sections.length), gap()));
    list.replaceChildren(...nodes);
    const unused = unusedItems(sections);
    pool.replaceChildren(...(unused.length ? unused.map((id) => chip(id, { inPool: true })) : [el('span', 'set-note set-tb-pool-empty', 'כל הכפתורים כבר בסרגל. גוררים לכאן כפתור כדי להוציא אותו.')]));
    drawPreview(sections);
  }

  // ----- גרירה -----
  // לחיצה: עד 5px זו לחיצה רגילה (כפתור מהרשימה שלמטה נוסף לסוף), ומעבר לזה מתחילה גרירה
  function press(e, begin) {
    if (e.button !== 0 || drag || e.target.closest('.set-tb-chip-x')) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const target = e.currentTarget;
    let started = false;
    const move = (ev) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        started = true;
        drag = begin();
        drag.grab(sx, sy);
      }
      drag.move(ev.clientX, ev.clientY);
    };
    const end = (ev, cancel) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      if (started && drag) (cancel ? drag.cancel() : drag.drop(ev.clientX, ev.clientY));
      else if (!started && !cancel && target.closest('.set-tb-pool') && target.dataset.item) addToEnd(target.dataset.item);
    };
    const up = (ev) => end(ev, false);
    const onCancel = (ev) => end(ev, true);
    // Esc בזמן גרירה מבטל אותה (ולא סוגר את חלון ההגדרות)
    const onKey = (ev) => { if (ev.key === 'Escape' && started) { ev.preventDefault(); ev.stopImmediatePropagation(); end(ev, true); } };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
  }

  // הכפיל שנע עם העכבר. בתוך חלון ההגדרות (שכבה עליונה), ונמדד כדי ש־fixed יעבוד גם אם ל־dialog יש transform
  function makeGhost(source) {
    const r = source.getBoundingClientRect();
    const ghost = source.cloneNode(true);
    ghost.removeAttribute('data-flip');
    ghost.querySelectorAll('[data-flip]').forEach((n) => n.removeAttribute('data-flip'));
    ghost.classList.add('set-tb-ghost');
    ghost.style.width = r.width + 'px';
    ghost.style.height = r.height + 'px';
    (source.closest('dialog') || document.body).append(ghost);
    const o = ghost.getBoundingClientRect();
    return { ghost, rect: r, off: { x: o.left, y: o.top } };
  }

  // גלילה אוטומטית ליד הקצה, במיכל שבאמת נגלל (בהגדרות: .set-pages)
  function scrollerOf(node) {
    for (let n = node.parentElement; n; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    }
    return null;
  }
  function autoScroll(y) {
    const scroller = y != null && scrollerOf(list);
    if (!scroller) return;
    const r = scroller.getBoundingClientRect();
    if (y < r.top + 40) scroller.scrollTop -= Math.ceil((r.top + 40 - y) / 4);
    else if (y > r.bottom - 40) scroller.scrollTop += Math.ceil((y - (r.bottom - 40)) / 4);
  }

  function baseDrag(source, { tilt = 1.5 } = {}) {
    const { ghost, rect, off } = makeGhost(source);
    let gx = 0, gy = 0, px = 0, py = null, sc = 1.04;
    const place = (x, y) => {
      px = x; py = y;
      ghost.style.transform = `translate(${x - gx - off.x}px, ${y - gy - off.y}px) rotate(${tilt}deg) scale(${sc})`;
    };
    document.documentElement.classList.add('set-tb-grabbing');
    // הכפיל לא יגרום לחלון עצמו להיגלל (overflow: hidden עדיין נגלל מקוד ומגלישה)
    const box = ghost.parentElement;
    const keepOverflow = box.style.overflow;
    if (box.tagName === 'DIALOG') box.style.overflow = 'clip';
    const scrollTimer = setInterval(() => autoScroll(py), 30);
    return {
      ghost,
      grab(sx, sy) { gx = sx - rect.left; gy = sy - rect.top; place(sx, sy); ghost.animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: 120 }); },
      place,
      // מעל יעד לאיחוד: הכפיל מתכווץ ונעשה שקוף למחצה, כדי שהיעד המואר ייראה
      shrinkTo(on) { sc = on ? 0.9 : 1.04; ghost.classList.toggle('merging', on); if (py != null) place(px, py); },
      // הכפיל עף למקום שבו הפריט נוחת, ואז נעלם
      land(toRect, { shrink = false } = {}) {
        clearInterval(scrollTimer);
        document.documentElement.classList.remove('set-tb-grabbing');
        box.style.overflow = keepOverflow;
        const from = ghost.style.transform;
        const to = toRect
          ? `translate(${toRect.left - off.x + (shrink ? (toRect.width - rect.width) / 2 : 0)}px, ${toRect.top - off.y + (shrink ? (toRect.height - rect.height) / 2 : 0)}px) rotate(0deg) scale(${shrink ? 0.4 : 1})`
          : from;
        const done = () => ghost.remove();
        if (reduced()) { done(); return Promise.resolve(); }
        const a = ghost.animate([{ transform: from, opacity: 1 }, { transform: to, opacity: shrink || !toRect ? 0 : 1 }], { duration: 190, easing: EASE, fill: 'forwards' });
        return a.finished.then(done, done);
      },
    };
  }

  // הסרגל כפי שהוא עכשיו ב־DOM (בזמן גרירה): קבוצות, ו"קבוצה חדשה" בפס שבו מונח הכפתור. מה שברשימה שלמטה לא נכלל.
  function readDom() {
    const out = [];
    for (const n of list.children) {
      if (n.classList.contains('set-tb-card')) out.push({ items: [...n.querySelectorAll('.set-tb-items .set-tb-chip')].map((c) => c.dataset.item) });
      else if (n.classList.contains('set-tb-gap')) {
        const c = n.querySelector('.set-tb-chip');
        if (c) out.push({ items: [c.dataset.item] });
      }
    }
    return out.filter((s) => s.items.length);
  }

  // המקום בתוך קבוצה לפי העכבר, גם כשהכפתורים עוברים שורה: לפני הכפתור הראשון שהעכבר "לפניו"
  function insertBefore(items, x, y) {
    const rtl = getComputedStyle(items).direction === 'rtl';
    for (const c of items.querySelectorAll('.set-tb-chip:not(.is-placeholder)')) {
      const r = c.getBoundingClientRect();
      if (y < r.top) return c;
      if (y <= r.bottom) {
        const mid = (r.left + r.right) / 2;
        if (rtl ? x > mid : x < mid) return c;
      }
    }
    return null;
  }

  function startChip(c, id) {
    const base = baseDrag(c);
    c.classList.add('is-placeholder');
    list.classList.add('is-dragging');
    let lock = 0;
    const moveTo = (parent, before) => {
      if (c.parentElement === parent && (before ? c.nextElementSibling === before : !c.nextElementSibling || c.nextElementSibling === before)) return;
      if (before === c) return;
      const snap = snapshot(roots);
      parent.insertBefore(c, before);
      list.querySelectorAll('.set-tb-gap.open').forEach((g) => { if (!g.contains(c)) g.classList.remove('open'); });
      if (parent.classList.contains('set-tb-gap')) parent.classList.add('open');
      pool.classList.toggle('drop', parent === pool);
      play(roots, snap, { skip: c, duration: 200 });
      drawPreview(readDom());
      lock = performance.now() + 70;
    };
    return {
      grab: base.grab,
      move(x, y) {
        base.place(x, y);
        if (performance.now() < lock) return;
        const hit = document.elementFromPoint(x, y);
        if (!hit) return;
        const g = hit.closest('.set-tb-gap');
        if (g && list.contains(g)) { if (!g.contains(c)) moveTo(g, null); return; }
        const cardEl = hit.closest('.set-tb-card');
        if (cardEl && list.contains(cardEl)) {
          // הקצה העליון/התחתון של קבוצה נחשב לפס שלידה, כדי שיהיה קל לפגוע ב"קבוצה חדשה"
          const r = cardEl.getBoundingClientRect();
          const edge = Math.min(8, r.height / 5);
          const side = y - r.top < edge ? cardEl.previousElementSibling : r.bottom - y < edge ? cardEl.nextElementSibling : null;
          if (side?.classList.contains('set-tb-gap')) { if (!side.contains(c)) moveTo(side, null); return; }
          const items = cardEl.querySelector('.set-tb-items');
          moveTo(items, insertBefore(items, x, y));
          return;
        }
        if (hit.closest('.set-tb-pool') === pool && c.parentElement !== pool) moveTo(pool, null);
      },
      drop() {
        const sections = readDom();
        const inGap = c.parentElement?.classList.contains('set-tb-gap');
        const target = (inGap ? c.parentElement : c).getBoundingClientRect();
        list.classList.remove('is-dragging');
        pool.classList.remove('drop');
        base.land(target, { shrink: inGap }).then(() => {
          drag = null;
          c.classList.remove('is-placeholder');
          commit(sections);
        });
      },
      cancel() {
        list.classList.remove('is-dragging');
        pool.classList.remove('drop');
        base.land(null);
        drag = null;
        const before = snapshot(roots);
        draw();
        play(roots, before);
      },
    };
  }

  function startGroup(cardEl, from) {
    const base = baseDrag(cardEl, { tilt: 0.6 });
    cardEl.classList.add('is-placeholder');
    list.classList.add('is-moving-group');
    let merge = null;
    let lock = 0;
    const cards = () => [...list.querySelectorAll('.set-tb-card')];
    const setMerge = (target) => {
      if (merge === target) return;
      merge?.classList.remove('merge-target');
      merge = target;
      merge?.classList.add('merge-target');
      base.shrinkTo(!!merge);
      const sections = getSections();
      drawPreview(merge ? mergeSectionInto(sections, from, Number(merge.dataset.sec)) : orderNow(sections));
    };
    // הסדר לפי מקום הכרטיס המסומן ב־DOM
    const orderNow = (sections) => moveSectionTo(sections, from, cards().indexOf(cardEl));
    const moveBefore = (before) => {
      const next = before || list.lastElementChild;
      if (cardEl.nextElementSibling === before || (before == null && cardEl.nextElementSibling === list.lastElementChild)) return;
      const snap = snapshot(roots);
      list.insertBefore(cardEl, before || next);
      play(roots, snap, { skip: cardEl, duration: 220 });
      drawPreview(orderNow(getSections()));
      lock = performance.now() + 90;
    };
    return {
      grab: base.grab,
      move(x, y) {
        base.place(x, y);
        if (performance.now() < lock) return;
        const others = cards().filter((n) => n !== cardEl);
        const over = others.find((n) => { const r = n.getBoundingClientRect(); return y >= r.top && y <= r.bottom && x >= r.left - 20 && x <= r.right + 20; });
        if (over) {
          const r = over.getBoundingClientRect();
          const t = (y - r.top) / r.height;
          if (t > 0.28 && t < 0.72) { setMerge(over); return; }
          setMerge(null);
          moveBefore(t <= 0.28 ? over : over.nextElementSibling);
          return;
        }
        setMerge(null);
        // מעל הראשונה או מתחת לאחרונה
        if (!others.length) return;
        const first = others[0].getBoundingClientRect();
        const last = others.at(-1).getBoundingClientRect();
        if (y < first.top) moveBefore(others[0]);
        else if (y > last.bottom) moveBefore(null);
      },
      drop() {
        list.classList.remove('is-moving-group');
        const sections = getSections();
        if (merge) {
          const into = Number(merge.dataset.sec);
          const target = merge;
          target.classList.remove('merge-target');
          base.land(target.getBoundingClientRect(), { shrink: true }).then(() => {
            drag = null;
            commit(mergeSectionInto(sections, from, into));
            const landed = list.querySelectorAll('.set-tb-card')[into > from ? into - 1 : into];
            if (landed && !reduced()) landed.animate([{ boxShadow: '0 0 0 3px var(--accent)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 500, easing: 'ease-out' });
          });
          return;
        }
        const next = orderNow(sections);
        base.land(cardEl.getBoundingClientRect()).then(() => {
          drag = null;
          cardEl.classList.remove('is-placeholder');
          commit(next);
        });
      },
      cancel() {
        list.classList.remove('is-moving-group');
        merge?.classList.remove('merge-target');
        base.land(null);
        drag = null;
        const before = snapshot(roots);
        draw();
        play(roots, before);
      },
    };
  }

  const redraw = () => { const before = snapshot(roots); draw(); play(roots, before); };
  return { preview, list, pool, draw, redraw };
}
