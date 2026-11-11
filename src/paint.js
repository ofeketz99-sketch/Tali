// מיני צייר: חלון ציור שנשמר כתמונת PNG רגילה בתיקיית התמונות, ונכנס להערה כ־![[Drawing ...png]].
// לחיצה כפולה על ציור בהערה פותחת אותו שוב לעריכה (ושומרת מעליו).
//
// openPaint({ image?: url, onSave: (bytes: Uint8Array, width: number) => Promise })

import { icon } from './icons.js';

// [כלי, אייקון, הסבר]
const TOOLS = [
  ['pen', 'pen', 'עט'], ['marker', 'highlight', 'מרקר (שקוף למחצה)'], ['line', 'line', 'קו (Shift: ישר)'],
  ['arrow', 'arrow', 'חץ'], ['rect', 'rect', 'מלבן (Shift: ריבוע)'], ['ellipse', 'ellipse', 'עיגול (Shift: מעגל)'], ['eraser', 'eraser', 'מחק'],
];
const COLORS = ['#1f2328', '#e5484d', '#f2994a', '#f2c94c', '#3fb27f', '#4a9ee0', '#8e6fd8', '#ffffff'];
const SIZES = [[2, 'דק'], [5, 'בינוני'], [12, 'עבה']];

let dlg = null;

export function openPaint({ image = null, quick = false, onSave }) {
  if (!dlg) dlg = build();
  dlg.start(image, onSave, quick);
}

function build() {
  const d = document.createElement('dialog');
  d.id = 'paint';
  d.innerHTML = `
    <div class="pt-bar">
      <div class="pt-group pt-tools"></div><span class="sep"></span>
      <div class="pt-group pt-colors"></div><span class="sep"></span>
      <div class="pt-group pt-sizes"></div><span class="sep"></span>
      <div class="pt-group">
        <button type="button" data-act="undo" data-tip="ביטול (Ctrl+Z)">${icon('undo', 17)}</button>
        <button type="button" data-act="redo" data-tip="חזרה (Ctrl+Y)">${icon('redo', 17)}</button>
        <button type="button" data-act="clear" data-tip="ניקוי הכל">${icon('trash', 17)}</button>
        <button type="button" data-act="taller" data-tip="הגדלת הדף למטה">${icon('taller', 17)}<span>עוד מקום</span></button>
        <label class="pt-check"><input type="checkbox" data-act="transparent"> רקע שקוף</label>
      </div>
      <div class="pt-end">
        <button type="button" data-act="cancel">ביטול</button>
        <button type="button" data-act="save" class="primary">הוספה להערה</button>
      </div>
    </div>
    <div class="pt-stage"><div class="pt-paper"><canvas class="pt-main"></canvas><canvas class="pt-over"></canvas></div></div>`;
  document.body.append(d);

  const paper = d.querySelector('.pt-paper');
  const main = d.querySelector('.pt-main');
  const over = d.querySelector('.pt-over');
  const mctx = main.getContext('2d');
  const octx = over.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  let W = 900, H = 520;
  let tool = 'pen', color = COLORS[0], size = SIZES[1][0];
  let undo = [], redo = [];
  let saveFn = null;
  let transparent = false;
  let dirty = false;

  // ===== סרגל =====
  const tools = d.querySelector('.pt-tools');
  for (const [id, ic, title] of TOOLS) {
    const b = document.createElement('button');
    b.type = 'button'; b.innerHTML = icon(ic, 18); b.dataset.tip = title; b.setAttribute('aria-label', title); b.dataset.tool = id;
    b.addEventListener('click', () => { tool = id; mark(); });
    tools.append(b);
  }
  const colors = d.querySelector('.pt-colors');
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pt-swatch'; b.style.background = c; b.dataset.color = c; b.title = c;
    b.addEventListener('click', () => { color = c; if (tool === 'eraser') tool = 'pen'; mark(); });
    colors.append(b);
  }
  const custom = document.createElement('input');
  custom.type = 'color'; custom.title = 'צבע אחר';
  custom.addEventListener('input', () => { color = custom.value; if (tool === 'eraser') tool = 'pen'; mark(); });
  colors.append(custom);
  const sizes = d.querySelector('.pt-sizes');
  for (const [s, title] of SIZES) {
    const b = document.createElement('button');
    b.type = 'button'; b.title = title; b.dataset.size = s;
    const dot = document.createElement('span');
    dot.className = 'pt-dot'; dot.style.width = dot.style.height = Math.max(4, s * 1.4) + 'px';
    b.append(dot);
    b.addEventListener('click', () => { size = s; mark(); });
    sizes.append(b);
  }
  function mark() {
    for (const b of tools.children) b.classList.toggle('on', b.dataset.tool === tool);
    for (const b of colors.querySelectorAll('.pt-swatch')) b.classList.toggle('on', b.dataset.color === color);
    for (const b of sizes.children) b.classList.toggle('on', +b.dataset.size === size);
    paper.dataset.tool = tool;
  }

  // ===== גודל הדף =====
  function resize(w, h, keep = true) {
    const snap = keep && main.width ? mctx.getImageData(0, 0, main.width, main.height) : null;
    W = w; H = h;
    for (const c of [main, over]) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      c.style.width = W + 'px'; c.style.height = H + 'px';
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (snap) mctx.putImageData(snap, 0, 0);
  }

  // ===== ביטול וחזרה =====
  const snapshot = () => mctx.getImageData(0, 0, main.width, main.height);
  function pushUndo() { undo.push({ img: snapshot(), w: W, h: H }); if (undo.length > 40) undo.shift(); redo = []; dirty = true; }
  function restore(s) { if (s.w !== W || s.h !== H) resize(s.w, s.h, false); mctx.putImageData(s.img, 0, 0); }
  function doUndo() { const s = undo.pop(); if (!s) return; redo.push({ img: snapshot(), w: W, h: H }); restore(s); }
  function doRedo() { const s = redo.pop(); if (!s) return; undo.push({ img: snapshot(), w: W, h: H }); restore(s); }

  // ===== ציור =====
  let drawing = null; // { points, start }
  const pos = (e) => { const r = over.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 }; };
  const style = (ctx, alpha = 1) => {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = tool === 'marker' ? size * 3 : size;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'source-over';
  };
  // קו חלק דרך נקודות האמצע
  function strokePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 1) ctx.lineTo(pts[0].x + 0.1, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    if (pts.length > 1) ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  }
  function shape(ctx, a, b, shift) {
    let { x: x1, y: y1 } = a, { x: x2, y: y2 } = b;
    if (shift && (tool === 'rect' || tool === 'ellipse')) {
      const s = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      x2 = x1 + Math.sign(x2 - x1 || 1) * s; y2 = y1 + Math.sign(y2 - y1 || 1) * s;
    }
    if (shift && (tool === 'line' || tool === 'arrow')) {
      const ang = Math.round(Math.atan2(y2 - y1, x2 - x1) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(x2 - x1, y2 - y1);
      x2 = x1 + Math.cos(ang) * len; y2 = y1 + Math.sin(ang) * len;
    }
    ctx.beginPath();
    if (tool === 'rect') ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    else if (tool === 'ellipse') ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
    else {
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      if (tool === 'arrow') {
        const ang = Math.atan2(y2 - y1, x2 - x1), head = 10 + size * 2;
        ctx.moveTo(x2, y2); ctx.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45));
        ctx.moveTo(x2, y2); ctx.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45));
      }
    }
    ctx.stroke();
  }

  over.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    over.setPointerCapture(e.pointerId);
    pushUndo();
    const p = pos(e);
    drawing = { points: [p], start: p };
    if (tool === 'eraser') erase(p, p);
    else move(e);
  });
  function erase(a, b) {
    mctx.save();
    mctx.globalCompositeOperation = 'destination-out';
    mctx.lineWidth = size * 4; mctx.lineCap = 'round';
    mctx.beginPath(); mctx.moveTo(a.x, a.y); mctx.lineTo(b.x, b.y); mctx.stroke();
    mctx.restore();
  }
  function move(e) {
    if (!drawing) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const p = pos(ev);
      if (tool === 'eraser') erase(drawing.points[drawing.points.length - 1], p);
      drawing.points.push(p);
    }
    octx.clearRect(0, 0, W, H);
    if (tool === 'pen' || tool === 'marker') { style(octx, tool === 'marker' ? 0.35 : 1); strokePath(octx, drawing.points); }
    else if (tool !== 'eraser') { style(octx); shape(octx, drawing.start, drawing.points[drawing.points.length - 1], e.shiftKey); }
  }
  over.addEventListener('pointermove', move);
  const finish = (e) => {
    if (!drawing) return;
    octx.clearRect(0, 0, W, H);
    if (tool === 'pen' || tool === 'marker') { style(mctx, tool === 'marker' ? 0.35 : 1); strokePath(mctx, drawing.points); }
    else if (tool !== 'eraser') { style(mctx); shape(mctx, drawing.start, drawing.points[drawing.points.length - 1], e.shiftKey); }
    mctx.globalAlpha = 1;
    drawing = null;
  };
  over.addEventListener('pointerup', finish);
  over.addEventListener('pointercancel', finish);

  // ===== פעולות =====
  d.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'undo') doUndo();
    else if (act === 'redo') doRedo();
    else if (act === 'clear') { pushUndo(); mctx.clearRect(0, 0, W, H); }
    else if (act === 'taller') { pushUndo(); resize(W, H + 250); }
    else if (act === 'transparent') { transparent = e.target.checked; paper.classList.toggle('transparent', transparent); }
    else if (act === 'cancel') tryClose();
    else if (act === 'save') await save();
  });
  d.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); doRedo(); }
  });
  // Escape: לא לאבד ציור בטעות
  d.addEventListener('cancel', (e) => { e.preventDefault(); tryClose(); });
  function tryClose() {
    if (dirty && !confirm('לסגור בלי לשמור את הציור?')) return;
    d.close();
  }

  async function save() {
    const out = document.createElement('canvas');
    out.width = main.width; out.height = main.height;
    const c = out.getContext('2d');
    if (!transparent) { c.fillStyle = '#ffffff'; c.fillRect(0, 0, out.width, out.height); }
    c.drawImage(main, 0, 0);
    const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const btn = d.querySelector('[data-act="save"]');
    btn.disabled = true;
    try { await saveFn(bytes, W); d.close(); }
    finally { btn.disabled = false; }
  }

  async function start(image, onSave, quick = false) {
    saveFn = onSave;
    undo = []; redo = []; dirty = false;
    tool = 'pen'; color = COLORS[0]; size = SIZES[1][0];
    transparent = !!quick;
    d.querySelector('[data-act="transparent"]').checked = transparent;
    paper.classList.toggle('transparent', transparent);
    d.querySelector('[data-act="save"]').textContent = image ? 'שמירה' : 'הוספה להערה';
    resize(quick ? 480 : 900, quick ? 180 : 520, false);
    mctx.clearRect(0, 0, W, H);
    if (image) {
      const img = new Image();
      img.src = image;
      await img.decode().catch(() => {});
      if (img.naturalWidth) {
        resize(Math.round(img.naturalWidth / dpr), Math.round(img.naturalHeight / dpr), false);
        mctx.drawImage(img, 0, 0, W, H);
      }
    }
    mark();
    d.showModal();
  }

  return { start };
}
