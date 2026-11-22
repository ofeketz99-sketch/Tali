// כרטיסיות ופיצול (tiling): מסמכים פתוחים במקביל, ושני מסמכים זה לצד זה.
//
// מודל: רשימת כרטיסיות (נתיבים), ועד שתי חלוניות (panes). בחלונית הפעילה נמצא העורך האמיתי (#pageWrap).
// בחלונית השנייה מוצגת תצוגה של המסמך (renderPreview), ולחיצה עליה הופכת אותה לפעילה: העורך עובר
// אליה פיזית (אותו אלמנט DOM) והמסמך שהיה פעיל מוצג בתצוגה במקומו. כך יש עורך אחד בלבד, כמו תמיד,
// וכל שאר האפליקציה (שמירה, לוח ההקשר, שכבת השרטוט) לא צריכה לדעת על החלוניות.
//
// renderer.js קורא ל־opened() מתוך openNote, ול־remap/drop בשינוי שם, העברה ומחיקה.
import { icon } from './icons.js';

export function createTabs({ navEl, $, store, getRoot, getCurrent, openNote, flushSave, showEmpty, renderPreview, noteName, onContext, onHome, onNewNote, onNewCanvas, fileIcon, flagOf, backgroundOf, beforeClose }) {
  const bar = $('tabBar');
  const panesEl = $('panes');
  const pane0 = $('pane0');
  let list = [];           // נתיבי הכרטיסיות, לפי הסדר
  let panes = [];          // הנתיב בכל חלונית (אחת או שתיים)
  let activePane = 0;
  let ratio = 0.5;         // רוחב החלונית הראשונה בפיצול
  let pane1 = null;        // האלמנט של החלונית השנייה (רק בפיצול)
  let restoring = false;
  // 8.5: כרטיסיות נעוצות (כמו בדפדפן): תמיד בתחילת הסרגל, קומפקטיות, בלי כפתור סגירה,
  // ולחיצה רגילה על מסמך אחר כשהן פעילות פותחת כרטיסייה חדשה במקום להחליף אותן.
  let pinned = new Set();
  const isPinned = (p) => pinned.has(p);
  const pinnedFirst = () => { list = [...list.filter(isPinned), ...list.filter((p) => !isPinned(p))]; };

  const key = () => 'tabs:' + getRoot();
  const save = () => { if (!restoring && getRoot()) store.set(key(), { list, panes, activePane, ratio, pinned: [...pinned] }); };
  const paneEl = (i) => (i === 0 ? pane0 : pane1);
  const other = () => 1 - activePane;

  // ----- נקרא מ־openNote אחרי שמסמך נטען לחלונית הפעילה -----
  // ברירת המחדל היא כרטיסייה חדשה ליד הנוכחית; מסמך שכבר פתוח רק מקבל מיקוד.
  function opened(p, { newTab = true } = {}) {
    const prev = panes[activePane];
    if (!list.includes(p)) {
      const at = list.indexOf(prev);
      const shownElsewhere = panes.length > 1 && panes[other()] === prev;
      if (newTab || at < 0 || shownElsewhere || isPinned(prev)) {
        // כרטיסייה חדשה ליד הנוכחית, אבל אף פעם לא בתוך קבוצת הנעוצות
        const pinCount = list.filter(isPinned).length;
        list.splice(Math.max(at < 0 ? list.length : at + 1, pinCount), 0, p);
      } else list[at] = p;
    }
    panes[activePane] = p;
    if (panes.length > 1 && panes[other()] === p) unsplit(); // אותו מסמך בשתי החלוניות: אין טעם בפיצול
    render();
    save();
  }

  // ----- סרגל הכרטיסיות -----
  function render() {
    // גם במסך הבית נשאר סרגל קטן: הפלוס נראה ומתנהג כמו כרטיסייה חדשה בדפדפן.
    bar.hidden = !getRoot();
    bar.innerHTML = '';
    // מסך הבית: כפתור בתחילת הסרגל, מודגש כשאין מסמך פתוח
    const homeBtn = document.createElement('button');
    homeBtn.type = 'button';
    homeBtn.className = 'icon-btn tab-home' + (panes.length ? '' : ' on');
    homeBtn.dataset.tip = 'מסך הבית (Alt+Home)';
    homeBtn.setAttribute('aria-label', 'מסך הבית');
    homeBtn.innerHTML = icon('home', 16);
    homeBtn.addEventListener('click', () => onHome?.());
    bar.append(homeBtn);
    if (navEl) bar.append(navEl); // אחורה/קדימה (renderer.js), אותו אלמנט בכל ציור
    const strip = document.createElement('div');
    strip.className = 'tab-strip';
    list.forEach((p) => {
      const t = document.createElement('div');
      const isActive = p === panes[activePane];
      const isOther = panes.length > 1 && p === panes[other()];
      const pin = isPinned(p);
      t.className = 'tab' + (isActive ? ' active' : '') + (isOther ? ' side' : '') + (pin ? ' pinned' : '');
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(isActive));
      t.dataset.tip = p.slice(getRoot().length + 1).replace(/\.(md|canvas)$/i, '').split(/[\\/]/).join(' › ');
      const flag = flagOf?.(p);
      const background = backgroundOf?.(p);
      if (background) {
        t.classList.add('folder-tinted');
        t.style.setProperty('--folder-tint', `var(--graph-${background.color})`);
      }
      t.innerHTML = `${pin ? `<span class="tab-pin" aria-label="נעוצה">${icon('pin', 12)}</span>` : ''}${background ? '<span class="tab-color-hint" aria-hidden="true"></span>' : ''}${fileIcon?.(p) || icon('file', 14)}<span class="tab-name"></span>${flag ? `<span class="flag-dot tab-flag" data-flag="${flag}"></span>` : ''}${pin ? '' : `<button type="button" class="tab-close" aria-label="סגירת הכרטיסייה">${icon('close', 13)}</button>`}`;
      t.querySelector('.tab-name').textContent = noteName(p);
      // לחיצה אמצעית לא סוגרת כרטיסייה נעוצה (כמו בדפדפן); סוגרים מהתפריט או ב־Ctrl+W
      t.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); if (!pin) close(p); } });
      t.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close')) { close(p); return; }
        show(p);
      });
      t.addEventListener('contextmenu', (e) => { e.preventDefault(); onContext?.(p, e.clientX, e.clientY); });
      // גרירה לשינוי הסדר
      t.draggable = true;
      t.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-tali-tab', p); e.dataTransfer.effectAllowed = 'move'; t.classList.add('dragging'); });
      t.addEventListener('dragend', () => t.classList.remove('dragging'));
      t.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('application/x-tali-tab')) { e.preventDefault(); t.classList.add('drop'); } });
      t.addEventListener('dragleave', () => t.classList.remove('drop'));
      t.addEventListener('drop', (e) => {
        t.classList.remove('drop');
        const src = e.dataTransfer.getData('application/x-tali-tab');
        if (!src || src === p) return;
        e.preventDefault();
        list.splice(list.indexOf(src), 1);
        list.splice(list.indexOf(p), 0, src);
        pinnedFirst(); // נעוצות נשארות בהתחלה גם אחרי גרירה
        render(); save();
      });
      strip.append(t);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'tab tab-add';
    add.dataset.tip = 'מסמך חדש (Ctrl+N)';
    add.setAttribute('aria-label', 'מסמך חדש');
    add.innerHTML = `${icon('plus', 15)}<span>מסמך חדש</span>`;
    add.addEventListener('click', () => onNewNote?.());
    // 11.0: כפתורי ההוספה מחוץ לפס הנגלל, כדי שלא ייעלמו כשיש הרבה כרטיסיות
    const adds = document.createElement('div');
    adds.className = 'tab-adds';
    adds.append(add);
    // 11.0: מסמך גרפי חדש, מכחול ליד הפלוס
    if (onNewCanvas) {
      const addCanvas = document.createElement('button');
      addCanvas.type = 'button';
      addCanvas.className = 'tab tab-add tab-add-canvas';
      addCanvas.dataset.tip = 'מסמך גרפי חדש (קנבס)';
      addCanvas.setAttribute('aria-label', 'מסמך גרפי חדש');
      addCanvas.innerHTML = `${icon('draw', 15)}<span>מסמך גרפי</span>`;
      addCanvas.addEventListener('click', () => onNewCanvas());
      adds.append(addCanvas);
    }
    const splitBtn = document.createElement('button');
    splitBtn.type = 'button';
    splitBtn.className = 'icon-btn tab-split' + (panes.length > 1 ? ' on' : '');
    splitBtn.dataset.tip = panes.length > 1 ? 'ביטול הפיצול (Ctrl+\\)' : 'שני מסמכים זה לצד זה (Ctrl+\\)';
    splitBtn.setAttribute('aria-pressed', String(panes.length > 1));
    splitBtn.innerHTML = icon('splitView', 16);
    splitBtn.addEventListener('click', () => toggleSplit());
    bar.append(strip, adds, splitBtn);
    bar.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // הצגת כרטיסייה: אם היא בחלונית השנייה, החלונית הזו נעשית פעילה. אחרת נטענת לחלונית הפעילה.
  async function show(p) {
    if (panes.length > 1 && panes[other()] === p) return activatePane(other());
    if (p !== getCurrent()) await openNote(p);
  }

  async function close(p) {
    if (!list.includes(p)) return;
    await flushSave();
    // 11.5: כרטיסייה שאינה המסמך הפתוח (למשל "ללא שם" ברקע): beforeClose יכול לשאול על שם ולשנות אותו,
    // ואז מחזיר את הנתיב החדש (remap כבר עדכן את הרשימה)
    if (beforeClose && p !== getCurrent()) p = (await beforeClose(p)) || p;
    const i = list.indexOf(p);
    if (i < 0) { render(); save(); return; }
    list.splice(i, 1);
    pinned.delete(p);
    if (panes.length > 1 && panes[other()] === p) { unsplit(); render(); save(); return; }
    if (p === panes[activePane]) {
      if (panes.length > 1) {
        // החלונית הפעילה נסגרת: החלונית השנייה תופסת את כל המקום
        const keep = panes[other()];
        unsplit();
        panes = [keep];
        activePane = 0;
        await openNote(keep, { history: false });
      } else {
        const next = list[Math.min(i, list.length - 1)];
        if (next) await openNote(next, { history: false });
        else { panes = []; showEmpty(); }
      }
    }
    render(); save();
  }

  // סגירת כל הכרטיסיות חוץ מ־p (מהתפריט של כרטיסייה). p נשאר פתוח ופעיל. 8.5: הנעוצות נשארות.
  async function closeOthers(p) {
    if (!list.includes(p)) return;
    await flushSave();
    if (panes.length > 1) unsplit();
    list = list.filter((x) => x === p || isPinned(x));
    panes = [p];
    activePane = 0;
    if (getCurrent() !== p) await openNote(p, { history: false });
    render(); save();
  }

  function setPinned(p, on) {
    if (!list.includes(p)) return;
    if (on) pinned.add(p); else pinned.delete(p);
    // נעיצה: לסוף קבוצת הנעוצות. ביטול: הראשונה אחרי הנעוצות. (p כבר לא ברשימה כשסופרים)
    list.splice(list.indexOf(p), 1);
    list.splice(list.filter(isPinned).length, 0, p);
    render(); save();
  }

  // Ctrl+חץ: הכרטיסייה הבאה/הקודמת, במעגל
  function step(dir) {
    if (list.length < 2) return;
    const cur = list.indexOf(panes[activePane]);
    show(list[(cur + dir + list.length) % list.length]);
  }

  // ----- פיצול -----
  function ensurePane1() {
    if (pane1) return pane1;
    pane1 = document.createElement('div');
    pane1.className = 'pane';
    pane1.id = 'pane1';
    const handle = document.createElement('div');
    handle.className = 'pane-resize';
    handle.setAttribute('role', 'separator');
    handle.dataset.tip = 'גרירה: רוחב החלוניות · לחיצה כפולה: חצי חצי';
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const r = panesEl.getBoundingClientRect();
      const rtl = getComputedStyle(panesEl).direction === 'rtl';
      document.body.classList.add('pane-resizing');
      const move = (ev) => { ratio = Math.min(0.8, Math.max(0.2, rtl ? (r.right - ev.clientX) / r.width : (ev.clientX - r.left) / r.width)); layout(); };
      const up = () => { document.body.classList.remove('pane-resizing'); handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); save(); };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
    handle.addEventListener('dblclick', () => { ratio = 0.5; layout(); save(); });
    panesEl.append(handle, pane1);
    return pane1;
  }
  function layout() {
    panesEl.classList.toggle('split', panes.length > 1);
    pane0.style.flexBasis = panes.length > 1 ? `${ratio * 100}%` : '';
    if (pane1) pane1.style.flexBasis = `${(1 - ratio) * 100}%`;
    [pane0, pane1].forEach((el, i) => el?.classList.toggle('active', panes.length > 1 && i === activePane));
  }

  // תצוגה של מסמך בחלונית שאינה פעילה. לחיצה בתוכה מעבירה אליה את העורך.
  async function fillPreview(i) {
    const el = paneEl(i);
    let pv = el.querySelector('.pane-preview');
    if (!pv) {
      pv = document.createElement('div');
      pv.className = 'pane-preview';
      pv.innerHTML = `<div class="pv-page"><div class="pv-head"><h1 class="pv-title"></h1><button type="button" class="icon-btn pv-close" data-tip="סגירת החלונית">${icon('close', 15)}</button></div><div class="pv-body ProseMirror"></div></div>`;
      pv.addEventListener('mousedown', (e) => {
        if (e.target.closest('.pv-close')) return;
        activatePane(i);
      });
      // סגירת החלונית בלבד: המסמך נשאר בכרטיסיות
      pv.querySelector('.pv-close').addEventListener('click', () => { unsplit(); render(); save(); });
      el.append(pv);
    }
    pv.querySelector('.pv-title').textContent = noteName(panes[i]);
    await renderPreview(pv.querySelector('.pv-body'), panes[i]);
  }

  async function activatePane(i) {
    if (i === activePane || panes.length < 2) return;
    await flushSave();
    const from = activePane;
    const target = panes[i];
    const wrap = $('pageWrap');
    // העורך עובר לחלונית שנלחצה, והתצוגה של המסמך הקודם תופסת את מקומו
    paneEl(i).querySelector('.pane-preview')?.remove();
    paneEl(i).append(wrap);
    activePane = i;
    layout();
    await fillPreview(from);
    await openNote(target, { history: false });
    render(); save();
  }

  // p: המסמך לחלונית השנייה. בלי: הכרטיסייה הקודמת (או הבאה), ואם אין, הוא נבחר בחלון החיפוש המהיר (pick).
  async function splitWith(p, pick) {
    const cur = panes[activePane] || getCurrent();
    if (!cur) { if (p) await openNote(p); return; }
    if (!p) {
      const i = list.indexOf(cur);
      p = list[i - 1] || list[i + 1];
      if (!p) { pick?.((chosen) => splitWith(chosen)); return; }
    }
    if (p === cur) return;
    if (!list.includes(p)) list.splice(list.indexOf(cur) + 1, 0, p);
    await flushSave();
    if (panes.length > 1) {
      // כבר מפוצל: המסמך נפתח בחלונית השנייה, והיא נעשית פעילה
      panes[other()] = p;
      await activatePane(other());
      return;
    }
    // החלונית החדשה נעשית פעילה עם המסמך החדש, והנוכחי עובר לתצוגה בחלונית הראשונה
    ensurePane1();
    panes = [cur, p];
    activePane = 0;
    layout();
    await activatePane(1);
  }

  function unsplit() {
    if (!pane1) { panes = panes.slice(0, 1); return; }
    const keep = panes[activePane];
    const wrap = $('pageWrap');
    if (wrap.parentElement !== pane0) { pane0.querySelector('.pane-preview')?.remove(); pane0.append(wrap); }
    pane1.previousElementSibling?.classList.contains('pane-resize') && pane1.previousElementSibling.remove();
    pane1.remove();
    pane1 = null;
    panes = keep ? [keep] : [];
    activePane = 0;
    layout();
  }
  function toggleSplit(pick) {
    if (panes.length > 1) { unsplit(); render(); save(); }
    else splitWith(null, pick);
  }

  // ----- שינוי שם, העברה ומחיקה -----
  function remap(fn) {
    list = [...new Set(list.map(fn))];
    pinned = new Set([...pinned].map(fn));
    panes = panes.map(fn);
    render(); save();
    if (panes.length > 1) fillPreview(other());
  }
  async function drop(pred) {
    list = list.filter((p) => !pred(p));
    pinned = new Set([...pinned].filter((p) => !pred(p)));
    if (panes.length > 1 && pred(panes[other()])) unsplit();
    if (panes[activePane] && pred(panes[activePane])) {
      panes = [];
      const next = list[0];
      if (next) await openNote(next, { history: false });
      else showEmpty();
    }
    render(); save();
  }
  // מסמך פעיל נסגר מבחוץ (למשל אין מסמך פתוח)
  function cleared() { panes = []; render(); }

  // ----- שחזור בכניסה לכספת -----
  // open: false (מ־5.7, מסך הבית בהפעלה): רק רשימת הכרטיסיות חוזרת, בלי לפתוח מסמך
  async function restore(exists, { open = true } = {}) {
    restoring = true;
    if (pane1) unsplit();
    const s = store.get(key(), null) || {};
    list = (s.list || []).filter(exists);
    pinned = new Set((s.pinned || []).filter((p) => list.includes(p)));
    pinnedFirst();
    panes = [];
    activePane = 0;
    ratio = Number(s.ratio) || 0.5;
    if (!open) { restoring = false; render(); return; }
    const want = (s.panes || []).filter(exists);
    const act = want.length > 1 ? Math.min(Math.max(0, s.activePane || 0), 1) : 0;
    const first = want[act] || list[0];
    try {
      if (first) await openNote(first, { history: false });
      if (want.length > 1 && want[0] !== want[1]) {
        // כל מסמך חוזר לצד שבו היה, והעורך לצד שהיה פעיל
        ensurePane1();
        panes = [want[0], want[1]];
        activePane = act;
        if (act === 1) pane1.append($('pageWrap'));
        layout();
        await fillPreview(1 - act);
      }
    } finally {
      restoring = false;
      render();
      save();
    }
  }
  // החלונית שאינה פעילה מתעדכנת אחרי שמירה של אותו מסמך (למשל נערך בחלון אחר)
  function refreshSide() { if (panes.length > 1) fillPreview(other()); }

  return {
    opened, close, closeOthers, step, isPinned, setPinned, show, splitWith, toggleSplit, unsplit, remap, drop, cleared, restore, refreshSide, refresh: render,
    get list() { return list; }, get split() { return panes.length > 1; },
    activePath: () => panes[activePane],
  };
}

