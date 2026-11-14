// Free-positioned page annotations. SVG vectors and movable text boxes are stored in
// the Markdown trailer managed by overlay-data.js. Never draw over the user's actual text.
//
// Drawing session (6.9, modelled on Excalidraw and tldraw):
// - Tools: select, pen, line, arrow, rectangle, ellipse, text box, eraser. Letters V P L A R O T E.
// - Every shape tool takes either a drag, or two clicks (anchor, then the end / the opposite corner,
//   with a live preview between them). Shift: 45° / square / circle. Alt: a box grows from its centre.
//   Esc cancels a shape that is waiting for its second click.
// - After a shape the tool returns to "select" with the shape selected, so it can be edited at once:
//   corner handles resize (Shift keeps the ratio), the ends of a line or arrow move on their own.
// - The pen keeps raw points; when a stroke ends they are simplified (RDP) and drawn as a
//   perfect-freehand outline (stroke-smoothing.js). While drawing only the active stroke is redrawn.
// - "Finish" (or Esc, or a click outside the page) ends the session and returns to writing.
import { icon } from './icons.js';
import { cleanOverlayObjects, groupedSelection } from './overlay-data.js';
import { freehandSvgPath, smoothSvgStroke, simplifyStroke } from './stroke-smoothing.js';
import { dragShape, bboxOf, bboxOfMany, resizeBox, fitToBox, moveLineEnd } from './overlay-geometry.js';

const NS = 'http://www.w3.org/2000/svg';
const shapeKinds = ['pen', 'line', 'arrow', 'rect', 'ellipse'];
const drawTools = ['pen', 'line', 'arrow', 'rect', 'ellipse', 'textbox', 'eraser'];
// [tool, label, icon, key (e.code)]
const tools = [
  ['select', 'בחירה ועריכה', 'pointer', 'KeyV', 'V'],
  ['pen', 'עט', 'pen', 'KeyP', 'P'],
  ['line', 'קו', 'line', 'KeyL', 'L'],
  ['arrow', 'חץ', 'arrow', 'KeyA', 'A'],
  ['rect', 'מלבן', 'rect', 'KeyR', 'R'],
  ['ellipse', 'אליפסה', 'ellipse', 'KeyO', 'O'],
  ['textbox', 'תיבת טקסט', 'textBox', 'KeyT', 'T'],
  ['eraser', 'מחק', 'eraser', 'KeyE', 'E'],
];
const HINTS = {
  select: 'לחיצה על שרטוט בוחרת אותו · גרירה מזיזה · הידיות משנות גודל · Ctrl+D שכפול',
  pen: 'ציור חופשי. הקו מוחלק כשמרימים את העט',
  line: 'לחיצה ועוד לחיצה, או גרירה · Shift: זווית של 45°',
  arrow: 'לחיצה ועוד לחיצה, או גרירה · Shift: זווית של 45°',
  rect: 'לחיצה ועוד לחיצה, או גרירה · Shift: ריבוע · Alt: מהמרכז',
  ellipse: 'לחיצה ועוד לחיצה, או גרירה · Shift: עיגול · Alt: מהמרכז',
  textbox: 'לחיצה במקום שבו התיבה תופיע',
  eraser: 'גרירה על קו מוחקת אותו',
  pending: 'לחיצה נוספת קובעת את הסוף · Esc ביטול',
};
// עט אחד מחזיק עד 2500 נקודות ו־200 משיכות (overlay-data.js). לפני הגבול ממשיכים בישות חדשה
// באותה קבוצה, כך שהציור לא נעצר באמצע ועדיין נבחר ונגרר כיחידה אחת.
const PEN_POINTS = 2400, PEN_STROKES = 190;
const QUICK_COLORS = ['#2a2d33', '#4b80bd', '#d0453f', '#3f9b5a', '#e0a526'];
const WEIGHTS = [[1.5, 'דק'], [3, 'בינוני'], [6, 'עבה']];
const CLICK_SLOP = 5; // פחות מזה בין לחיצה לשחרור: "לחיצה" ולא גרירה, והצורה מחכה ללחיצה השנייה

// מרחק מנקודה לקטע
const segmentDistance = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
// האם הנקודה (x, y) קרובה לקו שעובר דרך הנקודות pts
const nearPolyline = (pts, x, y, reach) => pts.length === 1
  ? Math.hypot(x - pts[0][0], y - pts[0][1]) <= reach
  : pts.some((pt, i) => i > 0 && segmentDistance(x, y, pts[i - 1][0], pts[i - 1][1], pt[0], pt[1]) <= reach);
const makeId = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
const groupId = () => makeId().replace(/[^a-z0-9_-]/gi, '');
const limit = (number, min, max) => Math.max(min, Math.min(max, number));
const r1 = (n) => Math.round(n * 10) / 10;
const svgEl = (name, attrs = {}) => {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
};
const strokesOf = (object) => object.strokes || (object.points ? [object.points] : []);

// resolveImage(object) -> list of URLs to try for a free image (7.8); onReturnImage(object) puts it back into the text.
export function createPageOverlay({ page, onChange, resolveImage, onReturnImage }) {
  let objects = [], mode = null, session = false, enabled = false, selected = null, drawing = null;
  let color = '#4b80bd', weight = 3, dash = false, fill = false;
  const lastToolKey = 'tali:last-page-drawing-tool';
  let lastTool = 'pen';
  try {
    const saved = localStorage.getItem(lastToolKey);
    if (shapeKinds.includes(saved)) lastTool = saved;
  } catch { /* Storage can be disabled. */ }
  let sessionPen = null; // Consecutive freehand strokes are stored in one entity.
  const root = document.createElement('div');
  root.className = 'tali-page-overlay';
  root.hidden = true;
  const svg = svgEl('svg', { 'aria-label': 'שרטוטים על הדף' });
  const defs = svgEl('defs');
  const shapes = svgEl('g');
  const handles = svgEl('g', { class: 'tali-overlay-handles' });
  svg.append(defs, shapes, handles);
  const boxes = document.createElement('div');
  boxes.className = 'tali-overlay-boxes';
  root.append(svg, boxes);
  page.append(root);

  const toolbar = document.createElement('div');
  toolbar.className = 'tali-overlay-toolbar';
  toolbar.hidden = true;
  toolbar.dir = 'rtl';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'כלי שרטוט ותיבות טקסט');
  toolbar.tabIndex = -1;
  const hint = document.createElement('div');
  hint.className = 'tali-overlay-hint';
  hint.setAttribute('aria-live', 'polite');
  toolbar.append(hint);
  document.body.append(toolbar);

  // ===== ביטול וחזרה לשרטוטים (Ctrl+Z / Ctrl+Y) =====
  // תמונת מצב לפני כל שינוי. הקלדה בתיבת טקסט והזזה בחצים מתאחדות לצעד אחד כל עוד הן ברצף.
  let undoStack = [], redoStack = [], snapshot = '[]', typingUntil = 0;
  let undoButton = null, redoButton = null;
  function updateHistoryButtons() {
    if (undoButton) undoButton.disabled = !undoStack.length;
    if (redoButton) redoButton.disabled = !redoStack.length;
  }
  const resetHistory = () => { undoStack = []; redoStack = []; snapshot = JSON.stringify(objects); updateHistoryButtons(); };
  const notify = ({ typing = false } = {}) => {
    if (!enabled) return;
    const now = JSON.stringify(objects);
    if (now !== snapshot) {
      const merge = typing && Date.now() < typingUntil;
      if (!merge) { undoStack.push(snapshot); if (undoStack.length > 200) undoStack.shift(); }
      redoStack = [];
      snapshot = now;
      typingUntil = typing ? Date.now() + 1200 : 0;
    }
    updateHistoryButtons();
    onChange();
  };
  function restore(from, to) {
    if (!from.length) return false;
    to.push(snapshot);
    snapshot = from.pop();
    objects = JSON.parse(snapshot);
    sessionPen = null; drawing = null; typingUntil = 0;
    if (selected && !objects.some((item) => item.id === selected)) selected = null;
    render(); updateHistoryButtons(); onChange();
    return true;
  }
  const undo = () => restore(undoStack, redoStack);
  const redo = () => restore(redoStack, undoStack);

  const selectedObjects = () => groupedSelection(objects, selected);
  const selectedShapes = () => selectedObjects().filter((o) => shapeKinds.includes(o.kind));

  // ===== הסרגל =====
  const group = (cls = '') => {
    const g = document.createElement('div');
    g.className = 'tali-overlay-group ' + cls;
    toolbar.append(g);
    return g;
  };
  const addButton = (parent, { label, iconName, html, tool, action, cls = '' }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tali-overlay-tool ' + cls;
    button.dataset.tip = label;
    button.setAttribute('aria-label', label.replace(/\s*\(.*\)$/, ''));
    button.innerHTML = html || icon(iconName, 18);
    if (tool) button.dataset.tool = tool;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', action);
    parent.append(button);
    return button;
  };

  // סיום: כפתור ברור, ולא X קטן
  const doneGroup = group('tali-overlay-done-group');
  addButton(doneGroup, { label: 'סיום וחזרה לכתיבה (Esc)', html: `${icon('check', 16)}<span>סיום</span>`, cls: 'tali-overlay-done', action: () => endSession() });

  const toolGroup = group();
  for (const [kind, name, ic, , letter] of tools) {
    addButton(toolGroup, { label: `${name} (${letter})`, iconName: ic, tool: kind, action: () => setMode(kind) });
  }

  // מאפייני קו: צבע, עובי, קו מקווקו, מילוי. חלים על הבחירה ועל מה שמציירים מעכשיו.
  const styleGroup = group('tali-overlay-style');
  const swatches = document.createElement('span');
  swatches.className = 'tali-overlay-swatches';
  for (const c of QUICK_COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tali-overlay-swatch';
    b.dataset.color = c;
    b.style.setProperty('--swatch', c);
    b.setAttribute('aria-label', 'צבע ' + c);
    b.addEventListener('mousedown', (event) => event.preventDefault());
    b.addEventListener('click', () => applyStyle({ color: c }));
    swatches.append(b);
  }
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.value = color;
  picker.dataset.tip = 'צבע אחר';
  picker.setAttribute('aria-label', 'צבע אחר');
  picker.addEventListener('input', () => applyStyle({ color: picker.value }));
  swatches.append(picker);
  styleGroup.append(swatches);
  const weightGroup = document.createElement('span');
  weightGroup.className = 'tali-overlay-weights';
  for (const [w, name] of WEIGHTS) {
    const b = addButton(weightGroup, {
      label: 'עובי ' + name, html: `<span class="tali-overlay-weight-line" style="--w:${w}px"></span>`,
      action: () => applyStyle({ weight: w }),
    });
    b.dataset.weight = String(w);
  }
  styleGroup.append(weightGroup);
  const dashButton = addButton(styleGroup, { label: 'קו מקווקו', iconName: 'dashed', action: () => applyStyle({ dash: !dash }) });
  const fillButton = addButton(styleGroup, { label: 'מילוי בהיר (מלבן ואליפסה)', iconName: 'fill', action: () => applyStyle({ fill: !fill }) });

  const editGroup = group();
  const duplicateButton = addButton(editGroup, { label: 'שכפול (Ctrl+D)', iconName: 'copy', action: () => duplicateSelection() });
  const deleteButton = addButton(editGroup, { label: 'מחיקה (Delete)', iconName: 'trash', action: () => deleteSelection() });

  const historyGroup = group();
  undoButton = addButton(historyGroup, { label: 'ביטול (Ctrl+Z)', iconName: 'undo', action: undo });
  redoButton = addButton(historyGroup, { label: 'חזרה (Ctrl+Y)', iconName: 'redo', action: redo });
  updateHistoryButtons();

  // 7.7: הדף מתארך לבד בשביל הציור, בלי Enter. גובה מינימלי = התחתית של הטקסט או של השרטוט הנמוך ביותר
  // (או של המשיכה שמציירים עכשיו), ועוד רווח ריק: 600px בזמן ציור, 200px אחרי. רק min-height של התצוגה:
  // הקובץ לא משתנה, והשרטוטים נשמרים בפיקסלים כמו קודם. בלי שרטוטים ובלי ציור: ה־CSS הרגיל (1050px).
  const BASE_PAGE_HEIGHT = 1050;
  let liveBottom = 0;
  function fitPage() {
    let bottom = liveBottom;
    for (const o of objects) {
      try {
        const b = o.kind === 'textbox' || o.kind === 'comment' || o.kind === 'image' ? { y: o.y || 0, h: o.height || 0 } : bboxOf(o);
        bottom = Math.max(bottom, b.y + b.h);
      } catch { /* ישות לא מוכרת */ }
    }
    if (enabled && session) {
      const last = page.querySelector('.ProseMirror')?.lastElementChild;
      if (last) bottom = Math.max(bottom, last.getBoundingClientRect().bottom - page.getBoundingClientRect().top);
    }
    const wanted = Math.ceil(bottom + (enabled && session ? 600 : 200));
    const next = enabled && wanted > BASE_PAGE_HEIGHT && (session || objects.length) ? wanted + 'px' : '';
    if (page.style.minHeight !== next) page.style.minHeight = next;
  }
  // מצב הסרגל לפי הכלי והבחירה: מה שלא רלוונטי מוסתר, כדי שהסרגל יהיה קצר
  function updateToolbar() {
    // 7.7: ידית הגרירה של השורות (⋮⋮, block-handle.js) מוסתרת בזמן ציור, כדי שלא תפריע
    document.body.classList.toggle('page-drawing-session', enabled && session);
    if (!drawing) liveBottom = 0;
    fitPage();
    toolbar.hidden = !enabled || !session;
    root.classList.toggle('drawing', drawTools.includes(mode));
    root.dataset.mode = mode || '';
    toolbar.querySelectorAll('button[data-tool]').forEach((b) => {
      const on = b.dataset.tool === (mode || 'select');
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const sel = selectedObjects();
    const kinds = new Set(mode === 'select' || !mode ? sel.map((o) => o.kind) : [mode]);
    const has = (...k) => k.some((x) => kinds.has(x));
    styleGroup.hidden = mode === 'eraser' || (!drawTools.includes(mode) && !sel.length);
    weightGroup.hidden = !has('pen', 'line', 'arrow', 'rect', 'ellipse');
    dashButton.hidden = !has('line', 'arrow', 'rect', 'ellipse');
    fillButton.hidden = !has('rect', 'ellipse');
    swatches.querySelectorAll('.tali-overlay-swatch').forEach((b) => b.classList.toggle('on', b.dataset.color === color));
    weightGroup.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.weight) === weight));
    dashButton.classList.toggle('on', dash);
    fillButton.classList.toggle('on', fill);
    editGroup.hidden = !sel.length;
    hint.textContent = drawing?.phase === 'click' ? HINTS.pending : HINTS[mode || 'select'] || '';
  }

  function applyStyle(change) {
    if ('color' in change) { color = change.color; picker.value = color; }
    if ('weight' in change) weight = change.weight;
    if ('dash' in change) dash = change.dash;
    if ('fill' in change) fill = change.fill;
    const members = selectedObjects();
    let changed = false;
    for (const object of members) {
      if ('color' in change) { object.color = color; changed = true; }
      if ('weight' in change && shapeKinds.includes(object.kind)) { object.weight = weight; changed = true; }
      if ('dash' in change && ['line', 'arrow', 'rect', 'ellipse'].includes(object.kind)) {
        if (dash) object.dash = true; else delete object.dash;
        changed = true;
      }
      if ('fill' in change && ['rect', 'ellipse'].includes(object.kind)) {
        if (fill) object.fill = 'tint'; else delete object.fill;
        changed = true;
      }
    }
    if (changed) { sessionPen = null; drawShapes(); drawBoxes(); notify(); }
    updateToolbar();
  }
  // בחירת שרטוט מציגה את המאפיינים שלו בסרגל (וכך גם הם ברירת המחדל להמשך, כמו באקסקלידרו)
  function adoptStyle(object) {
    if (!object) return;
    color = object.color || color; picker.value = color;
    if (shapeKinds.includes(object.kind)) weight = object.weight || weight;
    if (['line', 'arrow', 'rect', 'ellipse'].includes(object.kind)) dash = !!object.dash;
    if (['rect', 'ellipse'].includes(object.kind)) fill = object.fill === 'tint';
  }

  function select(id) {
    selected = id;
    if (id) adoptStyle(objects.find((o) => o.id === id));
    drawShapes(); markBoxes(); updateToolbar();
  }
  function deleteSelection() {
    if (!selected) return;
    const ids = new Set(selectedObjects().map((item) => item.id));
    objects = objects.filter((item) => !ids.has(item.id));
    selected = null; sessionPen = null;
    render(); notify();
  }
  function duplicateSelection() {
    const members = selectedObjects();
    if (!members.length) return;
    const g = members.some((m) => m.group) ? groupId() : null;
    const copies = members.map((m) => {
      const copy = JSON.parse(JSON.stringify(m));
      copy.id = makeId(); copy.x += 16; copy.y += 16;
      if (g) copy.group = g; else delete copy.group;
      return copy;
    });
    objects.push(...copies);
    sessionPen = null;
    selected = copies[0].id;
    render(); notify();
  }
  function nudge(dx, dy) {
    const members = selectedObjects();
    if (!members.length) return;
    for (const m of members) {
      m.x += dx; m.y += dy;
      if (m.kind === 'textbox') {
        m.x = limit(m.x, 0, Math.max(0, page.clientWidth - m.width));
        m.y = limit(m.y, 0, Math.max(0, page.clientHeight - m.height));
      }
    }
    drawShapes(); drawBoxes(); notify({ typing: true });
  }

  function setMode(next) {
    if (!enabled) return;
    if (drawing?.phase === 'click') cancelPending();
    if (next !== 'pen' || mode !== 'pen') sessionPen = null;
    if (shapeKinds.includes(next)) {
      lastTool = next;
      try { localStorage.setItem(lastToolKey, next); } catch { /* Nonessential preference. */ }
    }
    session = true;
    mode = next || 'select';
    if (mode !== 'select') selected = null;
    drawShapes(); markBoxes(); updateToolbar();
    // הפוקוס עובר לסרגל (אחרי שהוא גלוי): אותיות הקיצור והחצים לא נכתבים לתוך המסמך בזמן ציור
    if (!toolbar.contains(document.activeElement) && !boxes.contains(document.activeElement)) toolbar.focus({ preventScroll: true });
  }
  function endSession() {
    if (drawing?.phase === 'click') cancelPending();
    drawing = null; sessionPen = null;
    mode = null; session = false; selected = null;
    drawShapes(); markBoxes(); updateToolbar();
  }
  function openDrawing() {
    if (!enabled) return;
    sessionPen = null;
    setMode(lastTool);
  }
  const point = (event) => {
    const bounds = page.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  function quoteRect(quote) {
    const editor = page.querySelector('.ProseMirror');
    if (!editor || !quote) return null;
    const nodes = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let text = '', node;
    while ((node = walker.nextNode())) { nodes.push({ node, start: text.length, end: text.length + node.data.length }); text += node.data; }
    const at = text.indexOf(quote);
    if (at < 0) return null;
    const first = nodes.find((part) => part.end > at);
    const last = nodes.find((part) => part.end >= at + quote.length);
    if (!first || !last) return null;
    const range = document.createRange();
    range.setStart(first.node, at - first.start);
    range.setEnd(last.node, Math.min(last.node.data.length, at + quote.length - last.start));
    return range.getBoundingClientRect();
  }

  function addComment(quote) {
    const clean = String(quote || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
    if (!enabled || !clean) return false;
    const width = 230, height = 130;
    const rect = quoteRect(clean);
    const bounds = page.getBoundingClientRect();
    const count = objects.filter((item) => item.kind === 'comment').length;
    const side = count % 2 ? 'end' : 'start';
    const object = {
      id: makeId(), kind: 'comment', quote: clean, text: '', side,
      x: side === 'start' ? -width - 24 : page.clientWidth + 24,
      y: Math.max(18, Math.round((rect ? rect.top - bounds.top : 70 + count * 42))),
      width, height, color, weight,
    };
    objects.push(object);
    session = true; mode = 'select';
    render(); select(object.id); notify();
    requestAnimationFrame(() => boxes.querySelector(`[data-id="${object.id}"] textarea`)?.focus());
    return true;
  }

  // 8.0: הערת שוליים בלי ציטוט, בנקודה שנלחצה בשוליים (לחיצה כפולה או תפריט). הצד לפי מקום הלחיצה.
  function addNote(clientX, clientY) {
    if (!enabled) return false;
    const width = 230, height = 130;
    const bounds = page.getBoundingClientRect();
    const side = clientX < bounds.left + bounds.width / 2 ? 'start' : 'end';
    const object = {
      id: makeId(), kind: 'comment', quote: '', text: '', side,
      x: side === 'start' ? -width - 24 : page.clientWidth + 24,
      y: Math.max(0, Math.round(clientY - bounds.top - 14)),
      width, height, color, weight,
    };
    objects.push(object);
    session = true; mode = 'select';
    render(); select(object.id); notify();
    requestAnimationFrame(() => boxes.querySelector(`[data-id="${object.id}"] textarea`)?.focus());
    return true;
  }

  // ===== ציור הצורות =====
  const arrowHead = (object) => {
    const angle = Math.atan2(object.dy, object.dx);
    const size = 9 + object.weight * 1.6;
    const p = (a) => `${r1(object.dx + Math.cos(angle + a) * size)} ${r1(object.dy + Math.sin(angle + a) * size)}`;
    return ` M${p(2.65)} L${object.dx} ${object.dy} L${p(-2.65)}`;
  };
  function shapeElement(object) {
    const g = svgEl('g', { transform: 'translate(' + object.x + ' ' + object.y + ')' });
    g.classList.add('tali-overlay-shape');
    g.dataset.id = object.id;
    let geometry, hitD = null;
    if (object.kind === 'pen') {
      // כל משיכה היא צורה ממולאת (perfect-freehand). המשיכה הפעילה מצוירת בלי "סוף" עד שמרימים את העט.
      geometry = svgEl('g');
      for (const stroke of strokesOf(object)) {
        const live = drawing?.stroke === stroke;
        const path = svgEl('path', { d: freehandSvgPath(stroke, object.weight, { last: !live }), fill: object.color });
        if (live) drawing.path = path;
        geometry.append(path);
      }
      hitD = strokesOf(object).map(smoothSvgStroke).filter(Boolean).join(' ');
    } else if (object.kind === 'rect') {
      geometry = svgEl('rect', {
        x: Math.min(0, object.dx), y: Math.min(0, object.dy),
        width: Math.max(1, Math.abs(object.dx)), height: Math.max(1, Math.abs(object.dy)), rx: '3',
      });
    } else if (object.kind === 'ellipse') {
      geometry = svgEl('ellipse', {
        cx: object.dx / 2, cy: object.dy / 2,
        rx: Math.max(.5, Math.abs(object.dx) / 2), ry: Math.max(.5, Math.abs(object.dy) / 2),
      });
    } else {
      geometry = svgEl('path', { d: 'M0 0 L' + object.dx + ' ' + object.dy + (object.kind === 'arrow' ? arrowHead(object) : '') });
    }
    geometry.classList.add('tali-overlay-stroke');
    if (object.kind !== 'pen') {
      const filled = object.fill === 'tint';
      geometry.setAttribute('fill', filled ? object.color : 'none');
      if (filled) geometry.setAttribute('fill-opacity', '.16');
      geometry.setAttribute('stroke', object.color);
      geometry.setAttribute('stroke-width', object.weight);
      geometry.setAttribute('stroke-linecap', 'round');
      geometry.setAttribute('stroke-linejoin', 'round');
      if (object.dash) geometry.setAttribute('stroke-dasharray', `${r1(object.weight * 3 + 2)} ${r1(object.weight * 2.4 + 3)}`);
    }
    g.append(geometry);
    // אזור לחיצה רחב ושקוף: קל לתפוס קו דק. צורה ממולאת נתפסת גם מבפנים.
    const hit = hitD != null ? svgEl('path', { d: hitD }) : geometry.cloneNode();
    hit.removeAttribute('class');
    hit.removeAttribute('stroke-dasharray');
    hit.classList.add('tali-overlay-hit');
    hit.setAttribute('fill', object.fill === 'tint' ? 'transparent' : 'none');
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', Math.max(14, object.weight + 10));
    hit.setAttribute('stroke-linecap', 'round');
    hit.setAttribute('pointer-events', object.fill === 'tint' ? 'all' : 'stroke');
    g.append(hit);
    hit.addEventListener('pointerdown', (event) => {
      if (!enabled || (mode && mode !== 'select') || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (!session) { session = true; mode = 'select'; }
      select(object.id);
      toolbar.focus({ preventScroll: true });
      moveDrag(object, event);
    });
    return g;
  }
  function drawHandles() {
    handles.replaceChildren();
    if (!selected || drawing || (mode && mode !== 'select')) return;
    const members = selectedShapes();
    if (!members.length) return;
    const handle = (name, x, y, round) => {
      const h = round
        ? svgEl('circle', { cx: r1(x), cy: r1(y), r: 5.5 })
        : svgEl('rect', { x: r1(x - 4.5), y: r1(y - 4.5), width: 9, height: 9, rx: 2 });
      h.classList.add('tali-overlay-handle');
      h.dataset.handle = name;
      if (!round) h.dataset.cursor = name === 'nw' || name === 'se' ? 'nwse' : 'nesw';
      h.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        handleDrag(name, event);
      });
      handles.append(h);
    };
    const only = members.length === 1 ? members[0] : null;
    if (only && (only.kind === 'line' || only.kind === 'arrow')) {
      handle('start', only.x, only.y, true);
      handle('end', only.x + only.dx, only.y + only.dy, true);
      return;
    }
    const b = bboxOfMany(members);
    const pad = 5;
    const frame = svgEl('rect', { x: r1(b.x - pad), y: r1(b.y - pad), width: r1(b.w + 2 * pad), height: r1(b.h + 2 * pad), rx: 3 });
    frame.classList.add('tali-overlay-frame');
    handles.append(frame);
    handle('nw', b.x - pad, b.y - pad);
    handle('ne', b.x + b.w + pad, b.y - pad);
    handle('sw', b.x - pad, b.y + b.h + pad);
    handle('se', b.x + b.w + pad, b.y + b.h + pad);
  }
  function drawShapes() {
    const bounds = page.getBoundingClientRect();
    const connectors = objects.filter((object) => object.kind === 'comment').map((object) => {
      const rect = quoteRect(object.quote);
      if (!rect) return null;
      const anchorX = object.side === 'start' ? rect.left - bounds.left : rect.right - bounds.left;
      const anchorY = rect.top - bounds.top + rect.height / 2;
      const noteX = object.side === 'start' ? object.x + object.width : object.x;
      const noteY = object.y + 31;
      const path = svgEl('path', { d: `M${anchorX} ${anchorY} C${(anchorX + noteX) / 2} ${anchorY}, ${(anchorX + noteX) / 2} ${noteY}, ${noteX} ${noteY}` });
      path.classList.add('tali-comment-connector');
      path.setAttribute('stroke', object.color);
      return path;
    }).filter(Boolean);
    shapes.replaceChildren(...connectors, ...objects.filter((object) => shapeKinds.includes(object.kind)).map(shapeElement));
    drawHandles();
  }
  // עדכון של צורה אחת בלבד (בזמן ציור וגרירה): בלי לבנות מחדש את כל השכבה
  function updateShape(object) {
    const old = shapes.querySelector(`.tali-overlay-shape[data-id="${CSS.escape(object.id)}"]`);
    const next = shapeElement(object);
    if (old) old.replaceWith(next); else shapes.append(next);
  }
  let frame = 0;
  const pendingShapes = new Set();
  function scheduleUpdate(...list) {
    list.forEach((o) => pendingShapes.add(o));
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const o of pendingShapes) {
        if (drawing?.object === o && drawing.path && drawing.stroke) {
          drawing.path.setAttribute('d', freehandSvgPath(drawing.stroke, o.weight, { last: false }));
        } else updateShape(o);
      }
      pendingShapes.clear();
      drawHandles();
    });
  }

  function markBoxes() {
    for (const element of boxes.children) {
      element.classList.toggle('selected', element.dataset.id === selected);
    }
  }
  function placeBox(object, element) {
    element.style.left = object.x + 'px';
    element.style.top = object.y + 'px';
    element.style.width = object.width + 'px';
    element.style.height = object.height + 'px';
  }
  // הזזה: שרטוט (או קבוצת עט) בגרירה. הצורה זזה ב־transform בלבד, בלי ציור מחדש.
  function moveDrag(object, event) {
    const members = groupedSelection(objects, object.id);
    const origins = members.map((item) => ({ item, x: item.x, y: item.y }));
    const start = { x: event.clientX, y: event.clientY };
    const move = (e) => {
      if (e.pointerId !== event.pointerId) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      for (const p of origins) {
        p.item.x = Math.round(p.x + dx); p.item.y = Math.round(p.y + dy);
        shapes.querySelector(`.tali-overlay-shape[data-id="${CSS.escape(p.item.id)}"]`)
          ?.setAttribute('transform', 'translate(' + p.item.x + ' ' + p.item.y + ')');
      }
      drawHandles();
    };
    const stop = (e) => {
      if (e.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      if (origins.some((p) => p.item.x !== p.x || p.item.y !== p.y)) { sessionPen = null; notify(); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }
  // ידיות: פינות משנות גודל (Shift שומר על היחס), קצוות של קו או חץ זזים לבד
  function handleDrag(name, event) {
    const members = selectedShapes();
    if (!members.length) return;
    const origs = members.map((o) => JSON.parse(JSON.stringify(o)));
    const from = bboxOfMany(origs);
    const start = { x: event.clientX, y: event.clientY };
    let moved = false;
    const move = (e) => {
      if (e.pointerId !== event.pointerId) return;
      const mx = e.clientX - start.x, my = e.clientY - start.y;
      moved = moved || Math.abs(mx) + Math.abs(my) > 0;
      if (name === 'start' || name === 'end') {
        Object.assign(members[0], moveLineEnd(origs[0], name, mx, my, { shift: e.shiftKey }));
      } else {
        const box = resizeBox(from, name, mx, my, { keepRatio: e.shiftKey });
        members.forEach((m, i) => {
          const next = fitToBox(origs[i], from, box, box);
          if (next.strokes) delete m.points;
          Object.assign(m, next);
        });
      }
      scheduleUpdate(...members);
    };
    const stop = (e) => {
      if (e.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      if (moved) { sessionPen = null; drawShapes(); notify(); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }
  // תיבות טקסט והערות שוליים: גרירת הכותרת ושינוי גודל בפינה
  function boxDrag(object, event, operation, element) {
    const start = { x: event.clientX, y: event.clientY, left: object.x, top: object.y, width: object.width, height: object.height };
    const move = (e) => {
      if (e.pointerId !== event.pointerId) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (operation === 'resize' && object.kind === 'image') {
        // תמונה חופשית: רק הרוחב נגרר, והגובה לפי היחס המקורי (בלי עיוות)
        object.width = Math.round(limit(start.width + dx, 30, Math.max(30, page.clientWidth - object.x)));
        object.height = Math.max(20, Math.round(object.width * start.height / Math.max(1, start.width)));
      } else if (operation === 'resize') {
        const maxWidth = object.kind === 'textbox' ? Math.max(110, page.clientWidth - object.x) : 900;
        const maxHeight = Math.max(60, page.clientHeight - object.y);
        object.width = limit(start.width + dx, 110, maxWidth);
        object.height = limit(start.height + dy, 60, Math.min(600, maxHeight));
      } else {
        let nextX = Math.round(start.left + dx), nextY = Math.round(start.top + dy);
        if (object.kind === 'textbox' || object.kind === 'image') {
          nextX = limit(nextX, 0, Math.max(0, page.clientWidth - object.width));
          nextY = limit(nextY, 0, Math.max(0, page.clientHeight - object.height));
        } else {
          nextX = limit(nextX, -object.width - 280, page.clientWidth + 280);
          nextY = limit(nextY, 0, Math.max(0, page.clientHeight - object.height));
          object.side = nextX + object.width / 2 < page.clientWidth / 2 ? 'start' : 'end';
        }
        object.x = nextX; object.y = nextY;
        if (object.kind === 'comment') drawShapes();
      }
      placeBox(object, element);
    };
    const stop = (e) => {
      if (e.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      if (object.x !== start.left || object.y !== start.top || object.width !== start.width || object.height !== start.height) notify();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }
  function drawBoxes() {
    boxes.replaceChildren();
    for (const object of objects.filter((item) => item.kind === 'image')) boxes.append(freeImageElement(object));
    for (const object of objects.filter((item) => item.kind === 'textbox' || item.kind === 'comment')) {
      if (object.kind === 'textbox') {
        object.width = Math.min(object.width, Math.max(110, page.clientWidth));
        object.height = Math.min(object.height, Math.max(60, page.clientHeight));
        object.x = limit(object.x, 0, Math.max(0, page.clientWidth - object.width));
        object.y = limit(object.y, 0, Math.max(0, page.clientHeight - object.height));
      }
      const element = document.createElement('div');
      element.className = 'tali-overlay-box' + (object.kind === 'comment' ? ' tali-margin-comment' : ' tali-text-box');
      element.dataset.id = object.id;
      element.style.setProperty('--box-color', object.color);
      placeBox(object, element);
      const head = document.createElement('div');
      head.tabIndex = 0;
      if (object.kind === 'comment') {
        head.className = 'tali-overlay-grip';
        head.innerHTML = icon('move', 15) + '<span></span>';
        head.querySelector('span').textContent = object.quote
          ? `„${object.quote.slice(0, 64)}${object.quote.length > 64 ? '…' : ''}“`
          : 'הערה'; // 8.0: הערת שוליים בלי ציטוט
      } else {
        // 7.7: בלי פס כותרת. ידית הזזה קטנה מעל התיבה, רק בריחוף או כשהיא נבחרה
        head.className = 'tali-overlay-grip tali-box-move';
        head.innerHTML = icon('grip', 14);
      }
      head.dataset.tip = 'גרירה מזיזה את התיבה';
      head.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        if (!session) { session = true; mode = 'select'; }
        select(object.id);
        head.focus({ preventScroll: true });
        boxDrag(object, event, 'move', element);
      });
      const field = document.createElement('textarea');
      field.className = 'tali-overlay-text';
      // 7.7: תיבה ריקה עם dir="auto" נקבעת משמאל לימין (אין טקסט לזהות ממנו), ולכן הייתה מיושרת שמאלה.
      // ריקה: לפי כיוון הדף (ימין לשמאל כברירת מחדל). עם טקסט: אוטומטי, לפי השפה.
      const pageDir = () => getComputedStyle(page).direction === 'ltr' ? 'ltr' : 'rtl';
      const setDir = () => { field.dir = field.value.trim() ? 'auto' : pageDir(); };
      field.spellcheck = true;
      field.placeholder = object.kind === 'comment' ? 'הערה לציטוט…' : 'כתוב כאן…';
      field.value = object.text;
      setDir();
      field.addEventListener('focus', () => { if (selected !== object.id) select(object.id); });
      field.addEventListener('input', () => {
        setDir();
        object.text = field.value.slice(0, 20000); notify({ typing: true });
      });
      const resize = document.createElement('span');
      resize.className = 'tali-overlay-resize';
      resize.dataset.tip = 'שינוי גודל התיבה';
      resize.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        select(object.id); boxDrag(object, event, 'resize', element);
      });
      element.append(head, field, resize);
      boxes.append(element);
    }
    markBoxes();
  }
  // 7.8: תמונה חופשית על הדף, כמו תיבת טקסט: גרירה של התמונה עצמה מזיזה, ידית עגולה בפינה משנה גודל
  // (שומר יחס), "החזרה לטקסט" מחזירה אותה לטקסט, Delete מוחק אותה מהדף (הקובץ עצמו נשאר בכספת).
  // נשמרת בשכבה (TALI-OVERLAY בסוף הקובץ), ולכן באובסידיאן היא לא מוצגת על הדף.
  function freeImageElement(object) {
    const element = document.createElement('div');
    element.className = 'tali-overlay-box tali-free-image';
    element.dataset.id = object.id;
    placeBox(object, element);
    const img = document.createElement('img');
    img.draggable = false;
    img.alt = object.alt || '';
    const urls = (resolveImage && resolveImage(object)) || [];
    let attempt = 0;
    img.src = urls[0] || '';
    img.addEventListener('error', () => {
      if (++attempt < urls.length) img.src = urls[attempt];
      else element.classList.add('broken');
    });
    img.dataset.tip = 'גרירה מזיזה את התמונה';
    img.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (!session) { session = true; mode = 'select'; }
      select(object.id);
      boxDrag(object, event, 'move', element);
    });
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'tali-image-back';
    back.innerHTML = icon('undo', 13) + '<span>החזרה לטקסט</span>';
    back.addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); });
    back.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!onReturnImage || onReturnImage(object) === false) return;
      objects = objects.filter((item) => item !== object);
      if (selected === object.id) selected = null;
      render(); notify();
    });
    const resize = document.createElement('span');
    resize.className = 'tali-overlay-resize';
    resize.dataset.tip = 'שינוי גודל התמונה';
    resize.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      if (!session) { session = true; mode = 'select'; }
      select(object.id); boxDrag(object, event, 'resize', element);
    });
    element.append(img, back, resize);
    return element;
  }
  // 8.0: כל השרטוטים (עט, קו, חץ, מלבן, אליפסה) כ־SVG עצמאי, להמרה לתמונה רגילה (המרה ל־Markdown רגיל).
  // x, y: הפינה בקואורדינטות הדף; w, h: הגודל בפיקסלים של הדף. null כשאין שרטוטים.
  function exportShapes() {
    const list = objects.filter((o) => shapeKinds.includes(o.kind));
    if (!list.length) return null;
    const b = bboxOfMany(list);
    const pad = 12;
    const x = Math.floor(b.x - pad), y = Math.floor(b.y - pad);
    const w = Math.ceil(b.w + 2 * pad), h = Math.ceil(b.h + 2 * pad);
    const svg = svgEl('svg', { xmlns: NS, width: w, height: h, viewBox: `${x} ${y} ${w} ${h}` });
    for (const object of list) {
      const g = shapeElement(object);
      g.querySelectorAll('.tali-overlay-hit').forEach((e) => e.remove());
      svg.append(g);
    }
    return { svg: new XMLSerializer().serializeToString(svg), x, y, w, h };
  }
  function addImage(input) {
    const [object] = cleanOverlayObjects([{ ...input, kind: 'image', id: makeId() }]);
    if (!object) return null;
    object.x = Math.round(limit(object.x, 0, Math.max(0, page.clientWidth - object.width)));
    object.y = Math.round(Math.max(0, object.y));
    objects.push(object);
    session = true; mode = 'select';
    render();
    select(object.id);
    notify();
    return object.id;
  }
  function render() { drawShapes(); drawBoxes(); updateToolbar(); }

  const penPoints = (object) => object.strokes.reduce((sum, item) => sum + item.length, 0);
  // המחק: כל משיכה של עט נמחקת לבד; קו, חץ, מלבן ועיגול נמחקים כשנוגעים בקו שלהם
  function hitsShape(object, x, y, reach) {
    if (object.kind === 'line' || object.kind === 'arrow') return nearPolyline([[0, 0], [object.dx, object.dy]], x, y, reach);
    if (object.kind === 'rect') return nearPolyline([[0, 0], [object.dx, 0], [object.dx, object.dy], [0, object.dy], [0, 0]], x, y, reach);
    if (object.kind === 'ellipse') {
      const rx = Math.abs(object.dx) / 2 || 1, ry = Math.abs(object.dy) / 2 || 1;
      const nx = (x - object.dx / 2) / rx, ny = (y - object.dy / 2) / ry;
      return Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry) <= reach;
    }
    return false;
  }
  function eraseAt(p) {
    let changed = false;
    for (const object of [...objects]) {
      if (!shapeKinds.includes(object.kind)) continue;
      const x = p.x - object.x, y = p.y - object.y, reach = 8 + object.weight / 2;
      if (object.kind === 'pen') {
        const strokes = strokesOf(object);
        const keep = strokes.filter((stroke) => !nearPolyline(stroke, x, y, reach));
        if (keep.length === strokes.length) continue;
        changed = true;
        object.strokes = keep;
        delete object.points;
        if (!keep.length) objects = objects.filter((item) => item !== object);
      } else if (hitsShape(object, x, y, reach)) {
        changed = true;
        objects = objects.filter((item) => item !== object);
      }
    }
    if (changed) { drawing.erased = true; sessionPen = null; drawShapes(); }
  }

  // ===== ציור: לחיצה, גרירה, ולחיצה שנייה =====
  function cancelPending() {
    if (drawing?.phase !== 'click') return;
    objects = objects.filter((o) => o !== drawing.object);
    drawing = null;
    drawShapes(); updateToolbar();
  }
  function beginDrawing(event) {
    if (!enabled || !drawTools.includes(mode) || event.button !== 0) return;
    event.preventDefault();
    const p = point(event);
    // צורה שמחכה ללחיצה השנייה: הלחיצה הזו קובעת את הסוף
    if (drawing?.phase === 'click') {
      Object.assign(drawing.object, dragShape(drawing.object.kind, drawing.start, p, { shift: event.shiftKey, alt: event.altKey }));
      finishShape();
      return true;
    }
    if (mode === 'textbox') {
      const object = { id: makeId(), kind: 'textbox', x: Math.round(p.x), y: Math.round(p.y),
        width: 235, height: 110, text: '', color, weight };
      objects.push(object);
      mode = 'select';
      render();
      select(object.id);
      boxes.lastElementChild?.querySelector('textarea')?.focus();
      notify();
      return true;
    }
    if (mode === 'eraser') {
      drawing = { pointerId: event.pointerId, eraser: true, erased: false };
      if (event.currentTarget === svg) svg.setPointerCapture(event.pointerId);
      eraseAt(p);
      return true;
    }
    let object, stroke;
    if (mode === 'pen') {
      object = sessionPen && objects.includes(sessionPen) ? sessionPen : null;
      const full = object && (object.strokes.length >= PEN_STROKES || penPoints(object) >= PEN_POINTS);
      if (!object || full || object.color !== color || object.weight !== weight) {
        // ישות חדשה באותה קבוצה: כשהעט מלא, או כשהצבע או העובי השתנו באמצע
        let g;
        if (object) g = object.group || (object.group = groupId());
        object = { id: makeId(), kind: 'pen', x: Math.round(p.x), y: Math.round(p.y), color, weight, strokes: [], ...(g ? { group: g } : {}) };
        objects.push(object);
        sessionPen = object;
      }
      stroke = [[r1(p.x - object.x), r1(p.y - object.y)]];
      object.strokes.push(stroke);
    } else {
      object = { id: makeId(), kind: mode, ...dragShape(mode, p, p), color, weight,
        ...(dash && mode !== 'pen' ? { dash: true } : {}), ...(fill && (mode === 'rect' || mode === 'ellipse') ? { fill: 'tint' } : {}) };
      objects.push(object);
    }
    drawing = { pointerId: event.pointerId, pointerType: event.pointerType, object, stroke, start: p, phase: 'press',
      downX: event.clientX, downY: event.clientY };
    if (event.currentTarget === svg) svg.setPointerCapture(event.pointerId);
    updateShape(object);
    return true;
  }
  svg.addEventListener('pointerdown', beginDrawing);
  window.addEventListener('pointermove', (event) => {
    if (!drawing) return;
    // בהמתנה ללחיצה השנייה העכבר כבר לא לחוץ, ולכן מקבלים כל תזוזה של אותו סוג מצביע
    if (drawing.phase === 'click' ? event.pointerType !== drawing.pointerType : drawing.pointerId !== event.pointerId) return;
    if (drawing.eraser) { eraseAt(point(event)); return; }
    const object = drawing.object;
    if (object.kind === 'pen') {
      const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
      for (const ev of events.length ? events : [event]) {
        const p = point(ev);
        const x = r1(p.x - object.x), y = r1(p.y - object.y);
        const prev = drawing.stroke[drawing.stroke.length - 1];
        if ((x - prev[0]) ** 2 + (y - prev[1]) ** 2 >= 1 && penPoints(object) < 2500) drawing.stroke.push([x, y]);
      }
    } else {
      Object.assign(object, dragShape(object.kind, drawing.start, point(event), { shift: event.shiftKey, alt: event.altKey }));
    }
    // ציור קרוב לתחתית: הדף מתארך כבר בזמן המשיכה (fitPage)
    const y = point(event).y;
    if (y > liveBottom) { liveBottom = y; if (y + 300 > page.offsetHeight) fitPage(); }
    scheduleUpdate(object);
  });
  function finishShape() {
    const object = drawing.object;
    if (Math.abs(object.dx) < 4 && Math.abs(object.dy) < 4) {
      // שתי לחיצות באותו מקום: צורה בגודל ברירת מחדל, ואפשר לשנות אותה מיד בידיות
      Object.assign(object, dragShape(object.kind, drawing.start, {
        x: drawing.start.x + 90, y: drawing.start.y + (object.kind === 'line' || object.kind === 'arrow' ? 0 : 56),
      }));
    }
    drawing = null;
    session = true;
    mode = 'select';
    selected = object.id;
    drawShapes(); markBoxes(); updateToolbar();
    notify();
    toolbar.focus({ preventScroll: true });
  }
  const finish = (event) => {
    if (!drawing || drawing.pointerId !== event.pointerId || drawing.phase === 'click') return;
    if (drawing.eraser) {
      const erased = drawing.erased;
      drawing = null;
      if (erased) notify();
      return;
    }
    const object = drawing.object;
    if (object.kind === 'pen') {
      const p = point(event);
      const stroke = drawing.stroke;
      const end = [r1(p.x - object.x), r1(p.y - object.y)];
      const prev = stroke[stroke.length - 1];
      if (Math.hypot(end[0] - prev[0], end[1] - prev[1]) >= 1 && penPoints(object) < 2500) stroke.push(end);
      // עיבוד אחרי המשיכה: הסרת רעד העכבר. הקו המוצג נבנה מחדש עם "סוף" עגול.
      const simple = simplifyStroke(stroke, 0.8);
      stroke.splice(0, stroke.length, ...(simple.length ? simple : [stroke[0]]));
      if (stroke.length === 1) stroke.push([stroke[0][0] + 0.5, stroke[0][1] + 0.5]);
      drawing = null;
      updateShape(object);
      notify();
      return;
    }
    const moved = Math.hypot(event.clientX - drawing.downX, event.clientY - drawing.downY);
    if (drawing.phase === 'press' && !(moved >= CLICK_SLOP)) {
      // לחיצה בלי גרירה: הצורה ממשיכה אחרי העכבר עד הלחיצה הבאה
      drawing.phase = 'click';
      if (svg.hasPointerCapture?.(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      updateToolbar();
      return;
    }
    finishShape();
  };
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', (event) => {
    if (drawing?.phase === 'click') return;
    finish(event);
  });

  // Clicking outside the drawing canvas and its tools exits the active session.
  // Clicks on the page itself are reserved for drawing (with a drawing tool) or for selecting objects.
  window.addEventListener('pointerdown', (event) => {
    if (!enabled || !session) return;
    if (toolbar.contains(event.target) || document.querySelector('dialog[open]')) return;
    if (page.contains(event.target)) {
      // כלי הבחירה: לחיצה על הטקסט (ולא על שרטוט, ידית או תיבה) חוזרת לכתיבה
      if (mode === 'select' && !event.target.closest?.('.tali-overlay-shape, .tali-overlay-handles, .tali-overlay-box')) endSession();
      return;
    }
    // Starting in the surrounding workspace is valid: coordinates may begin outside the paper,
    // and the stroke can enter it naturally instead of the tool being cancelled.
    if (drawTools.includes(mode) && page.closest('#pageWrap')?.contains(event.target)) {
      event.stopPropagation();
      beginDrawing(event);
      return;
    }
    endSession();
  }, true);

  window.addEventListener('keydown', (event) => {
    if (!enabled || !session) return;
    // בתיבת טקסט על הדף ובשדות של הסרגל המקלדת שייכת לשדה. העורך עצמו לא נחשב: בזמן סשן ציור
    // הוא רק "מחזיק" פוקוס ישן, ומקש שיגיע אליו ימחק או יכתוב טקסט מתחת לשרטוט.
    const inText = event.target.closest?.('textarea, input:not([type="color"])');
    const ctrl = event.ctrlKey || event.metaKey;
    const stop = () => { event.preventDefault(); event.stopPropagation(); };
    if (event.key === 'Escape') {
      if (drawing?.phase === 'click') cancelPending();
      else endSession();
      stop();
      return;
    }
    if (inText || document.querySelector('dialog[open]')) return;
    if (ctrl && !event.altKey) {
      // לפי מיקום המקש (code), כך שזה עובד גם במקלדת עברית
      const isUndo = event.code === 'KeyZ' && !event.shiftKey;
      const isRedo = event.code === 'KeyY' || (event.code === 'KeyZ' && event.shiftKey);
      if (isUndo || isRedo) { (isUndo ? undo : redo)(); stop(); return; }
      if (event.code === 'KeyD') { duplicateSelection(); stop(); return; }
      // עריכה בעורך שמתחת (גזירה, הדבקה, עיצוב) לא קורית בזמן ציור
      if (['KeyX', 'KeyV', 'KeyB', 'KeyI', 'KeyU', 'KeyA'].includes(event.code)) stop();
      return;
    }
    if (event.altKey) return;
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected) { deleteSelection(); stop(); return; }
    if (event.key === 'Enter' && !selected) { endSession(); stop(); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[event.key] && selected) {
      const step = event.shiftKey ? 10 : 1;
      nudge(arrows[event.key][0] * step, arrows[event.key][1] * step); stop(); return;
    }
    const tool = tools.find((t) => t[3] === event.code);
    if (tool && !event.shiftKey) { setMode(tool[0]); stop(); return; }
    // בזמן ציור אין להקליד או למחוק במסמך שמתחת
    if (event.key.length === 1 || ['Backspace', 'Delete', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) stop();
  }, true);

  return {
    getItems: () => cleanOverlayObjects(objects),
    setItems: (items) => {
      objects = cleanOverlayObjects(items);
      selected = null; mode = null; session = false; drawing = null; sessionPen = null; render();
      resetHistory();
    },
    setEnabled: (value) => {
      enabled = !!value;
      root.hidden = !enabled;
      if (!enabled) { mode = null; session = false; selected = null; drawing = null; sessionPen = null; }
      render();
    },
    setMode: (next) => setMode(next),
    addImage,
    addNote,
    exportShapes,
    openDrawing,
    addComment,
  };
}
