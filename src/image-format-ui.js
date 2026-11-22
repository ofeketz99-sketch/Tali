// 11.6: "עיצוב תמונה" כמו בוורד, משותף לתמונה בתוך הטקסט (embed.js) ולתמונה חופשית על הדף (page-overlay.js):
// - renderPicture: מציג תמונה לפי העיצוב (חיתוך, סיבוב, היפוך, גובה חופשי, מסגרת/צל/פינות). בלי עיצוב התמונה
//   מוצגת כמו תמיד (img רגיל), כדי לא לשנות שום דבר בתמונות קיימות.
// - pictureToolbar: סרגל הכפתורים (פריסה, גודל, חיתוך, סיבוב והיפוך, סגנון, טקסט חלופי, איפוס) ותפריטים.
// - openCropDialog: חלון חיתוך עם מלבן וידיות, ויחסים קבועים (חופשי, מקורי, 1:1, 4:3, 16:9).
// התפריטים והחלונות יושבים ב־document.body (לא בתוך העורך), ו־.pic-menu מסומן כחלק מהעבודה על התמונה,
// כך ששכבת הדף לא סוגרת את סשן השרטוט כשלוחצים בהם.
import { icon } from './icons.js';
import { cleanFormat, needsFrame, boxSize, naturalBox, frameStyles, rotateFormat, visibleRatio, cleanCrop } from './image-format.js';

// ===== ציור התמונה =====
// box: האלמנט שהוא "התמונה" על הדף. img: התמונה. natural: { w, h } אחרי טעינה (או null).
// fill: התיבה כבר בגודל קבוע (תמונה חופשית), ולכן לא נותנים לה רוחב; אחרת הרוחב לפי format.width.
export function renderPicture(box, img, format, natural, { fill = false, aspect: fillAspect = null } = {}) {
  const f = cleanFormat(format);
  box.classList.add('pic-box');
  for (const s of ['border', 'shadow', 'round']) box.classList.toggle('pic-' + s, f.styles.includes(s));
  const framed = needsFrame(f) && natural && natural.w > 0 && natural.h > 0;
  box.classList.toggle('pic-framed', !!framed);
  // לייצוא ל־Word (export-docx.js): שם החיתוך, הסיבוב וההיפוך "נאפים" לתמונה אחת (bakePicture)
  if (framed) box.dataset.picFormat = JSON.stringify(f); else delete box.dataset.picFormat;
  let inner = box.querySelector(':scope > .pic-crop');
  if (!framed) {
    if (inner) { box.prepend(img); inner.remove(); }
    else if (img.parentNode !== box) box.prepend(img);
    img.removeAttribute('style');
    box.style.aspectRatio = '';
    box.style.width = fill ? '' : (f.width ? f.width + 'px' : '');
    if (!fill && f.width) img.style.width = '100%';
    return f;
  }
  if (!inner) {
    inner = document.createElement('span');
    inner.className = 'pic-crop';
    box.prepend(inner);
  }
  if (img.parentNode !== inner) inner.append(img);
  let aspect;
  if (fill) {
    const r = box.getBoundingClientRect();
    aspect = fillAspect || (r.width > 0 && r.height > 0 ? r.width / r.height : visibleRatio(natural, f));
    box.style.width = '';
    box.style.aspectRatio = '';
  } else {
    const size = boxSize(natural, f);
    aspect = size.w / size.h;
    box.style.width = size.w + 'px';
    box.style.aspectRatio = `${size.w} / ${size.h}`;
  }
  const s = frameStyles(f, aspect);
  Object.assign(inner.style, s.inner);
  img.removeAttribute('style');
  Object.assign(img.style, s.img, { objectFit: 'fill' });
  return f;
}

// התמונה כפי שהיא נראית (חיתוך, סיבוב, היפוך) כ־canvas בגודל הטבעי של החלק הגלוי. el: תמונה שכבר נטענה.
// לייצוא (Word, ותמונה חופשית ב־PDF), שבו אין CSS. מחזיר null כשאין מה לשנות או כשהדפדפן חוסם (canvas "מלוכלך").
export function bakePicture(el, format) {
  const f = cleanFormat(format);
  const natural = { w: el.naturalWidth, h: el.naturalHeight };
  if (!natural.w || !natural.h || !(f.crop || f.rotate || f.flipH || f.flipV)) return null;
  const [t, r, b, l] = (f.crop || [0, 0, 0, 0]).map((n) => n / 100);
  const sw = natural.w * (1 - l - r), sh = natural.h * (1 - t - b);
  const out = naturalBox(natural, f);
  const c = document.createElement('canvas');
  c.width = out.w; c.height = out.h;
  const ctx = c.getContext('2d');
  ctx.translate(out.w / 2, out.h / 2);
  ctx.scale(f.flipH ? -1 : 1, f.flipV ? -1 : 1);
  ctx.rotate((f.rotate * Math.PI) / 180);
  ctx.drawImage(el, natural.w * l, natural.h * t, sw, sh, -sw / 2, -sh / 2, sw, sh);
  try { c.toDataURL('image/png', 0); } catch { return null; }
  return c;
}

// ===== תפריטים וחלוניות קטנות =====
let openMenuState = null;
export function closeMenus() { openMenuState?.close(); }
// מחזיר את האלמנט שנפתח. owner: האלמנט שמקבל .menu-open בזמן שהתפריט פתוח (כדי שהסרגל לא ייעלם בריחוף).
function popup(anchor, owner, build) {
  closeMenus();
  const box = document.createElement('div');
  box.className = 'pic-menu';
  box.dir = 'rtl';
  box.setAttribute('role', 'menu');
  build(box);
  document.body.append(box);
  const r = anchor.getBoundingClientRect();
  const w = box.offsetWidth, h = box.offsetHeight;
  let top = r.bottom + 6;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w));
  box.style.top = Math.round(top) + 'px';
  box.style.left = Math.round(left) + 'px';
  owner?.classList.add('menu-open');
  const outside = (e) => { if (!box.contains(e.target) && !anchor.contains(e.target)) close(); };
  const key = (e) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
  const close = () => {
    if (openMenuState?.box !== box) return;
    openMenuState = null;
    box.remove();
    owner?.classList.remove('menu-open');
    window.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('blur', close);
  };
  openMenuState = { box, close };
  setTimeout(() => {
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', close);
  });
  box.querySelector('input, button')?.focus({ preventScroll: true });
  return box;
}
// items: [{ label, icon, checked, run, keepOpen }] או 'sep'
function menu(anchor, owner, items) {
  return popup(anchor, owner, (box) => {
    for (const item of items) {
      if (item === 'sep') { box.append(Object.assign(document.createElement('hr'), { className: 'pic-sep' })); continue; }
      if (!item) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pic-item' + (item.checked ? ' on' : '');
      b.setAttribute('role', item.checked != null ? 'menuitemcheckbox' : 'menuitem');
      if (item.checked != null) b.setAttribute('aria-checked', item.checked ? 'true' : 'false');
      b.innerHTML = `${icon(item.icon || 'check', 16)}<span></span>${item.checked ? icon('check', 14) : ''}`;
      b.querySelector('span').textContent = item.label;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', (e) => { e.stopPropagation(); if (!item.keepOpen) closeMenus(); item.run(); });
      box.append(b);
    }
  });
}

// ===== הסרגל =====
// opts:
//   get(): העיצוב הנוכחי. set(format): שמירה. natural(): { w, h } או null. shown(): { w, h } הגודל על המסך.
//   layout: 'text' (בתוך הטקסט, עם כל אפשרויות הפריסה) או 'free' (תמונה חופשית: רק "בשורה עם הטקסט").
//   onFree(): "לפני הטקסט" (מיקום חופשי). onInline(): בחזרה לטקסט (לתמונה חופשית).
//   getAlt/setAlt: טקסט חלופי. src(): כתובת התמונה (לחלון החיתוך). extra: [{ icon, label, run, show }]
//   size(): לתמונה חופשית { w, h } בפועל; setSize(w, h) במקום width/height בעיצוב.
export function pictureToolbar(tools, owner, opts) {
  tools.classList.add('pic-tools');
  const button = (name, tip, run) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pic-tool';
    b.innerHTML = icon(name, 16);
    b.dataset.tip = tip;
    b.setAttribute('aria-label', tip);
    b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => { e.stopPropagation(); run(b); });
    tools.append(b);
    return b;
  };
  const sep = () => tools.append(Object.assign(document.createElement('span'), { className: 'pic-tools-sep' }));
  const f = () => cleanFormat(opts.get());
  const set = (change) => opts.set(cleanFormat({ ...f(), ...change }));

  const layoutButton = button('picLayout', 'פריסה מול הטקסט', (b) => {
    const cur = f().layout;
    const L = (layout, label, ic) => ({ label, icon: ic, checked: cur === layout && opts.layout === 'text', run: () => set({ layout }) });
    menu(b, owner, opts.layout === 'text' ? [
      L('inline', 'בשורה עם הטקסט', 'picLayout'),
      'sep',
      L('wrap-right', 'מימין, הטקסט עוטף משמאל', 'alignRight'),
      L('wrap-left', 'משמאל, הטקסט עוטף מימין', 'alignLeft'),
      'sep',
      L('break-right', 'מעל ומתחת לטקסט, בימין', 'alignRight'),
      L('center', 'מעל ומתחת לטקסט, במרכז', 'alignCenter'),
      L('break-left', 'מעל ומתחת לטקסט, בשמאל', 'alignLeft'),
      'sep',
      opts.onFree && { label: 'לפני הטקסט (מיקום חופשי על הדף)', icon: 'move', checked: false, run: () => opts.onFree() },
    ] : [
      { label: 'בשורה עם הטקסט (החזרה לטקסט)', icon: 'picLayout', checked: false, run: () => opts.onInline?.() },
      { label: 'לפני הטקסט (מיקום חופשי)', icon: 'move', checked: true, run: () => {} },
    ]);
  });
  void layoutButton;
  button('picSize', 'גודל מדויק', (b) => sizePanel(b, owner, opts));
  sep();
  button('crop', 'חיתוך', async () => {
    const natural = opts.natural();
    if (!natural) return;
    const crop = await openCropDialog({ src: opts.src(), natural, crop: f().crop });
    if (crop === undefined) return;
    opts.setCrop ? opts.setCrop(crop) : set({ crop, height: null });
  });
  button('rotateCw', 'סיבוב והיפוך', (b) => menu(b, owner, [
    { label: 'סיבוב 90° ימינה', icon: 'rotateCw', run: () => (opts.rotate ? opts.rotate(1) : opts.set(rotateFormat(f(), 1))) },
    { label: 'סיבוב 90° שמאלה', icon: 'rotateCcw', run: () => (opts.rotate ? opts.rotate(-1) : opts.set(rotateFormat(f(), -1))) },
    'sep',
    { label: 'היפוך אופקי', icon: 'flipH', checked: f().flipH, run: () => set({ flipH: !f().flipH }) },
    { label: 'היפוך אנכי', icon: 'flipV', checked: f().flipV, run: () => set({ flipV: !f().flipV }) },
  ]));
  button('picStyle', 'סגנון: מסגרת, צל, פינות', (b) => {
    const has = (s) => f().styles.includes(s);
    const toggle = (s) => set({ styles: has(s) ? f().styles.filter((x) => x !== s) : [...f().styles, s] });
    menu(b, owner, [
      { label: 'מסגרת דקה', icon: 'picStyle', checked: has('border'), run: () => toggle('border') },
      { label: 'צל', icon: 'rect', checked: has('shadow'), run: () => toggle('shadow') },
      { label: 'פינות מעוגלות', icon: 'ellipse', checked: has('round'), run: () => toggle('round') },
      'sep',
      { label: 'בלי סגנון', icon: 'close', run: () => set({ styles: [] }) },
    ]);
  });
  if (opts.setAlt) button('altText', 'טקסט חלופי (תיאור התמונה)', (b) => altPanel(b, owner, opts));
  sep();
  for (const x of opts.extra || []) {
    const b = button(x.icon, x.label, () => x.run());
    if (x.show) b.hidden = !x.show();
    x.button = b;
  }
  button('clearFormat', 'איפוס: גודל מקורי, בלי חיתוך, סיבוב וסגנון', () => (opts.reset ? opts.reset() : opts.set(cleanFormat({}))));
  return { refresh: () => { for (const x of opts.extra || []) if (x.show && x.button) x.button.hidden = !x.show(); } };
}

// גודל מדויק: רוחב, גובה, נעילת יחס, אחוזים מהגודל המקורי, וגודל מקורי
function sizePanel(anchor, owner, opts) {
  const natural = opts.natural();
  const f = cleanFormat(opts.get());
  const shown = opts.size ? opts.size() : opts.shown();
  let locked = opts.size ? true : !f.height;
  let w = Math.round(shown.w), h = Math.round(shown.h);
  const ratio = w / Math.max(1, h);
  const nat = natural ? { w: naturalBox(natural, f).w, r: visibleRatio(natural, f) } : null;
  popup(anchor, owner, (box) => {
    box.classList.add('pic-panel');
    box.innerHTML = `
      <div class="pic-title">גודל התמונה</div>
      <div class="pic-size-row">
        <label>רוחב<input type="number" min="20" max="4000" class="pic-w"></label>
        <button type="button" class="pic-lock"></button>
        <label>גובה<input type="number" min="20" max="4000" class="pic-h"></label>
      </div>
      <div class="pic-scale"></div>
      <div class="pic-actions"><button type="button" class="pic-natural">גודל מקורי</button><button type="button" class="primary pic-ok">אישור</button></div>`;
    const wi = box.querySelector('.pic-w'), hi = box.querySelector('.pic-h'), lock = box.querySelector('.pic-lock');
    const paint = () => {
      wi.value = String(w); hi.value = String(h);
      lock.innerHTML = icon(locked ? 'lock' : 'lockOpen', 15);
      lock.dataset.tip = locked ? 'היחס נעול (לחיצה: שינוי חופשי של הגובה)' : 'היחס פתוח (לחיצה: נעילה)';
      lock.classList.toggle('on', locked);
    };
    if (opts.size) { lock.disabled = true; lock.dataset.tip = 'בתמונה חופשית היחס תמיד נשמר'; }
    else lock.addEventListener('click', () => { locked = !locked; if (locked) h = Math.round(w / ratio); paint(); });
    wi.addEventListener('input', () => { w = Math.max(1, Number(wi.value) || w); if (locked) { h = Math.round(w / ratio); hi.value = String(h); } });
    hi.addEventListener('input', () => { h = Math.max(1, Number(hi.value) || h); if (locked) { w = Math.round(h * ratio); wi.value = String(w); } });
    const scale = box.querySelector('.pic-scale');
    if (nat) for (const pct of [25, 50, 75, 100]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = pct + '%';
      b.dataset.tip = `${pct}% מהגודל המקורי`;
      b.addEventListener('click', () => { w = Math.round(nat.w * pct / 100); h = Math.round(w / (locked ? ratio : nat.r)); paint(); });
      scale.append(b);
    }
    const apply = () => {
      closeMenus();
      if (opts.setSize) opts.setSize(w, h);
      else opts.set(cleanFormat({ ...f, width: w, height: locked ? null : h }));
    };
    box.querySelector('.pic-ok').addEventListener('click', apply);
    box.querySelector('.pic-natural').addEventListener('click', () => {
      closeMenus();
      if (opts.setSize && nat) opts.setSize(nat.w, Math.round(nat.w / nat.r));
      else opts.set(cleanFormat({ ...f, width: null, height: null }));
    });
    for (const input of [wi, hi]) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    paint();
    setTimeout(() => wi.select());
  });
}

function altPanel(anchor, owner, opts) {
  popup(anchor, owner, (box) => {
    box.classList.add('pic-panel');
    box.innerHTML = `<div class="pic-title">טקסט חלופי</div>
      <div class="pic-hint">תיאור קצר של התמונה, לקוראי מסך ולמקרה שהתמונה לא נטענת</div>
      <input type="text" class="pic-alt" dir="auto" maxlength="300">
      <div class="pic-actions"><button type="button" class="primary pic-ok">אישור</button></div>`;
    const input = box.querySelector('.pic-alt');
    input.value = opts.getAlt() || '';
    const apply = () => { closeMenus(); opts.setAlt(input.value.trim()); };
    box.querySelector('.pic-ok').addEventListener('click', apply);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    setTimeout(() => input.select());
  });
}

// ===== חלון החיתוך =====
// מחזיר Promise: מערך [t, r, b, l] באחוזים, null (בלי חיתוך), או undefined (ביטול).
// החיתוך נקבע על התמונה המקורית (לפני סיבוב), כמו בוורד. Escape (המאזין המשותף) = ביטול.
export function openCropDialog({ src, natural, crop }) {
  const d = document.createElement('dialog');
  d.className = 'pic-crop-dialog';
  d.dir = 'rtl';
  const maxW = Math.min(760, window.innerWidth - 120), maxH = Math.min(520, window.innerHeight - 220);
  const k = Math.min(maxW / natural.w, maxH / natural.h, 1.5);
  const W = Math.round(natural.w * k), H = Math.round(natural.h * k);
  d.innerHTML = `
    <div class="pic-crop-head"><b>חיתוך תמונה</b><span class="pic-ratios"></span></div>
    <div class="pic-crop-stage" style="width:${W}px;height:${H}px">
      <img alt="" draggable="false">
      <div class="pic-crop-rect"></div>
    </div>
    <div class="pic-crop-foot"><span class="pic-crop-size"></span>
      <span class="pic-crop-buttons"><button type="button" class="pic-crop-reset">ללא חיתוך</button>
      <button type="button" class="pic-crop-cancel">ביטול</button><button type="button" class="primary pic-crop-ok">חיתוך</button></span></div>`;
  d.querySelector('img').src = src;
  const rectEl = d.querySelector('.pic-crop-rect');
  for (const dir of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
    const h = document.createElement('span');
    h.className = 'pic-crop-handle';
    h.dataset.dir = dir;
    rectEl.append(h);
  }
  const c0 = cleanCrop(crop) || [0, 0, 0, 0];
  // המלבן בפיקסלים של החלון
  let r = { x: c0[3] / 100 * W, y: c0[0] / 100 * H, w: W * (1 - (c0[1] + c0[3]) / 100), h: H * (1 - (c0[0] + c0[2]) / 100) };
  let fixed = 0; // יחס רוחב/גובה קבוע, 0 = חופשי
  const paint = () => {
    Object.assign(rectEl.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    d.querySelector('.pic-crop-size').textContent = `${Math.round(r.w / k)} × ${Math.round(r.h / k)}`;
  };
  const clampRect = () => {
    r.w = Math.max(12, Math.min(W, r.w)); r.h = Math.max(12, Math.min(H, r.h));
    r.x = Math.max(0, Math.min(W - r.w, r.x)); r.y = Math.max(0, Math.min(H - r.h, r.y));
  };
  const ratios = d.querySelector('.pic-ratios');
  const RATIOS = [['חופשי', 0], ['מקורי', natural.w / natural.h], ['1:1', 1], ['4:3', 4 / 3], ['16:9', 16 / 9], ['3:4', 3 / 4]];
  for (const [label, value] of RATIOS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (!value) b.classList.add('on');
    b.addEventListener('click', () => {
      fixed = value;
      ratios.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      if (fixed) {
        // המלבן הגדול ביותר ביחס הזה סביב המרכז של הנוכחי
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        let w = Math.min(W, r.w), h = w / fixed;
        if (h > H) { h = H; w = h * fixed; }
        r = { x: cx - w / 2, y: cy - h / 2, w, h };
        clampRect(); paint();
      }
    });
    ratios.append(b);
  }
  rectEl.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const dir = event.target.dataset.dir || 'move';
    const start = { x: event.clientX, y: event.clientY, r: { ...r } };
    const move = (e) => {
      const dx = e.clientX - start.x, dy = e.clientY - start.y, s = start.r;
      if (dir === 'move') { r = { ...s, x: s.x + dx, y: s.y + dy }; clampRect(); paint(); return; }
      let x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
      if (dir.includes('w')) x1 = Math.max(0, Math.min(x2 - 12, x1 + dx));
      if (dir.includes('e')) x2 = Math.min(W, Math.max(x1 + 12, x2 + dx));
      if (dir.includes('n')) y1 = Math.max(0, Math.min(y2 - 12, y1 + dy));
      if (dir.includes('s')) y2 = Math.min(H, Math.max(y1 + 12, y2 + dy));
      if (fixed) {
        // היחס נשמר: הצד שזז קובע, והשני לפי היחס (בתוך התמונה)
        const horizontal = dir === 'e' || dir === 'w' || ((dir.length === 2) && Math.abs(dx) >= Math.abs(dy));
        let w = x2 - x1, h = y2 - y1;
        if (horizontal) h = w / fixed; else w = h * fixed;
        if (dir.includes('n')) y1 = y2 - h; else y2 = y1 + h;
        if (dir.includes('w')) x1 = x2 - w; else x2 = x1 + w;
        if (x1 < 0 || y1 < 0 || x2 > W || y2 > H) return;
      }
      r = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      paint();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
  document.body.append(d);
  paint();
  return new Promise((resolve) => {
    // הכפתורים מסיימים ישירות; אירוע close (שבדיקה הראתה שלא תמיד מגיע אחרי גרירה) רק ל־Escape ולחיצה בחוץ
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      if (d.open) d.close();
      d.remove();
      resolve(result);
    };
    d.addEventListener('close', () => finish(undefined), { once: true });
    d.querySelector('.pic-crop-cancel').addEventListener('click', () => finish(undefined));
    d.querySelector('.pic-crop-reset').addEventListener('click', () => finish(null));
    d.querySelector('.pic-crop-ok').addEventListener('click', () => {
      const pct = (n) => Math.round(n * 1000) / 10;
      finish(cleanCrop([pct(r.y / H), pct((W - r.x - r.w) / W), pct((H - r.y - r.h) / H), pct(r.x / W)]));
    });
    d.showModal();
    d.querySelector('.pic-crop-ok').focus();
  });
}
