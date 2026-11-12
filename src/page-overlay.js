// Free-positioned page annotations. SVG vectors and movable text boxes are stored in
// the Markdown trailer managed by overlay-data.js. Never draw over the user's actual text.
import { icon } from './icons.js';
import { cleanOverlayObjects, groupedSelection } from './overlay-data.js';
import { smoothSvgStroke } from './stroke-smoothing.js';

const NS = 'http://www.w3.org/2000/svg';
const shapeKinds = ['pen', 'line', 'arrow', 'rect', 'ellipse'];
const tools = [
  ['pen', 'עט', 'draw'],
  ['line', 'קו', 'rule'],
  ['arrow', 'חץ', 'arrow'],
  ['rect', 'מלבן', 'rectangle'],
  ['ellipse', 'עיגול', 'ellipse'],
  ['textbox', 'תיבת טקסט', 'textBox'],
  ['eraser', 'מחק: גרירה על קו מוחקת אותו', 'eraser'],
];
// עט אחד מחזיק עד 2500 נקודות ו־200 משיכות (overlay-data.js). לפני הגבול ממשיכים בישות חדשה
// באותה קבוצה, כך שהציור לא נעצר באמצע ועדיין נבחר ונגרר כיחידה אחת.
const PEN_POINTS = 2400, PEN_STROKES = 190;
const QUICK_COLORS = ['#2a2d33', '#4b80bd', '#d0453f', '#3f9b5a', '#e0a526'];
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
const limit = (number, min, max) => Math.max(min, Math.min(max, number));
const svgEl = (name, attrs = {}) => {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
};

export function createPageOverlay({ page, onChange }) {
  let objects = [], mode = null, enabled = false, selected = null, drawing = null;
  let color = '#4b80bd', weight = 2.5;
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
  const marker = svgEl('marker', {
    id: 'tali-overlay-arrow', viewBox: '0 0 10 10',
    refX: '9', refY: '5', markerWidth: '5', markerHeight: '5',
    orient: 'auto-start-reverse', markerUnits: 'strokeWidth',
  });
  marker.append(svgEl('path', { d: 'M 1 1 L 9 5 L 1 9', fill: 'none', stroke: 'context-stroke',
    'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  defs.append(marker);
  const shapes = svgEl('g');
  svg.append(defs, shapes);
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
  document.body.append(toolbar);

  // ===== ביטול וחזרה לשרטוטים (Ctrl+Z / Ctrl+Y) =====
  // תמונת מצב לפני כל שינוי. הקלדה בתיבת טקסט מתאחדת לצעד אחד כל עוד מקלידים ברצף.
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
  const updateToolbar = () => {
    toolbar.hidden = !enabled || (!mode && !selected);
    root.classList.toggle('drawing', !!mode);
    root.dataset.mode = mode || '';
    toolbar.querySelectorAll('button[data-tool]').forEach((b) => {
      b.classList.toggle('on', b.dataset.tool === mode);
      b.setAttribute('aria-pressed', b.dataset.tool === mode ? 'true' : 'false');
    });
    const deleteButton = toolbar.querySelector('[data-action="remove"]');
    if (deleteButton) deleteButton.disabled = !selected;
  };
  const select = (id) => { selected = id; drawShapes(); markBoxes(); updateToolbar(); };
  const selectedObjects = () => groupedSelection(objects, selected);
  function deleteSelection() {
    if (!selected) return;
    const ids = new Set(selectedObjects().map((item) => item.id));
    objects = objects.filter((item) => !ids.has(item.id));
    selected = null;
    render(); notify();
  }

  const addButton = (tool, label, iconName, action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tali-overlay-tool';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = icon(iconName, 18);
    if (tool) button.dataset.tool = tool;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', action);
    toolbar.append(button);
    return button;
  };
  undoButton = addButton(null, 'ביטול (Ctrl+Z)', 'undo', undo);
  redoButton = addButton(null, 'חזרה (Ctrl+Y)', 'redo', redo);
  updateHistoryButtons();
  const historySeparator = document.createElement('span');
  historySeparator.className = 'tali-overlay-separator';
  toolbar.append(historySeparator);
  for (const [kind, name, ic] of tools) {
    addButton(kind, name, ic, () => setMode(mode === kind ? null : kind));
  }
  const separator = document.createElement('span');
  separator.className = 'tali-overlay-separator';
  toolbar.append(separator);
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.value = color;
  picker.title = 'צבע שרטוט';
  picker.setAttribute('aria-label', 'צבע שרטוט');
  picker.addEventListener('input', () => {
    color = picker.value;
    const members = selectedObjects();
    if (members.length) {
      for (const object of members) object.color = color;
      drawShapes(); notify();
    }
  });
  // צבעים מהירים: לחיצה אחת במקום חלון בחירת צבע
  const swatches = document.createElement('span');
  swatches.className = 'tali-overlay-swatches';
  const paintSwatches = () => swatches.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.color === color));
  for (const c of QUICK_COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tali-overlay-swatch';
    b.dataset.color = c;
    b.style.setProperty('--swatch', c);
    b.setAttribute('aria-label', 'צבע ' + c);
    b.addEventListener('mousedown', (event) => event.preventDefault());
    b.addEventListener('click', () => { picker.value = c; picker.dispatchEvent(new Event('input')); });
    swatches.append(b);
  }
  toolbar.append(swatches, picker);
  picker.addEventListener('input', paintSwatches);
  paintSwatches();
  const thickness = document.createElement('input');
  thickness.type = 'range';
  thickness.min = '1'; thickness.max = '10'; thickness.step = '.5'; thickness.value = String(weight);
  thickness.className = 'tali-overlay-weight';
  thickness.title = 'עובי הקו';
  thickness.setAttribute('aria-label', 'עובי הקו');
  thickness.addEventListener('input', () => {
    weight = Number(thickness.value);
    const members = selectedObjects();
    if (members.length) {
      for (const object of members) object.weight = weight;
      drawShapes(); notify();
    }
  });
  toolbar.append(thickness);
  const deleteButton = addButton(null, 'מחיקת שרטוט או קבוצה מסומנת (Del)', 'trash', deleteSelection);
  deleteButton.dataset.action = 'remove';
  addButton(null, 'סיום שרטוט וחזרה לכתיבה (Esc)', 'close', () => {
    setMode(null); select(null);
  });
  const hint = document.createElement('span');
  hint.className = 'tali-overlay-hint';
  hint.textContent = 'Shift: קו ישר וצורה שווה · Ctrl+Z ביטול · Esc סיום';
  toolbar.append(hint);

  function setMode(next) {
    if (!enabled) return;
    if (next === 'pen') {
      if (mode !== 'pen') sessionPen = null;
      lastTool = next;
      try { localStorage.setItem(lastToolKey, next); } catch { /* Nonessential preference. */ }
    } else {
      sessionPen = null;
      if (shapeKinds.includes(next)) {
        lastTool = next;
        try { localStorage.setItem(lastToolKey, next); } catch { /* Nonessential preference. */ }
      }
    }
    mode = next;
    selected = null;
    drawShapes();
    markBoxes();
    updateToolbar();
  }
  function openDrawing() {
    if (!enabled) return;
    // Explicitly reopening starts a fresh freehand entity.
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
    render(); select(object.id); notify();
    requestAnimationFrame(() => boxes.querySelector(`[data-id="${object.id}"] textarea`)?.focus());
    return true;
  }

  const pathOf = (object) => {
    if (object.kind === 'pen') {
      const strokes = object.strokes || (object.points ? [object.points] : []);
      return strokes.map(smoothSvgStroke).filter(Boolean).join(' ');
    }
    const shaft = 'M0 0 L' + object.dx + ' ' + object.dy;
    if (object.kind !== 'arrow') return shaft;
    const angle = Math.atan2(object.dy, object.dx);
    const size = 13;
    const round = (n) => Math.round(n * 10) / 10;
    const x1 = round(object.dx + Math.cos(angle + 2.62) * size);
    const y1 = round(object.dy + Math.sin(angle + 2.62) * size);
    const x2 = round(object.dx + Math.cos(angle - 2.62) * size);
    const y2 = round(object.dy + Math.sin(angle - 2.62) * size);
    return shaft + ' M' + x1 + ' ' + y1 + ' L' + object.dx + ' ' + object.dy +
      ' L' + x2 + ' ' + y2;
  };
  function shapeElement(object) {
    const group = svgEl('g', { transform: 'translate(' + object.x + ' ' + object.y + ')' });
    group.classList.add('tali-overlay-shape');
    if (selectedObjects().some((item) => item.id === object.id)) group.classList.add('selected');
    group.dataset.id = object.id;
    let geometry;
    if (object.kind === 'rect') {
      geometry = svgEl('rect', {
        x: Math.min(0, object.dx), y: Math.min(0, object.dy),
        width: Math.max(1, Math.abs(object.dx)), height: Math.max(1, Math.abs(object.dy)),
        rx: '2.5',
      });
    } else if (object.kind === 'ellipse') {
      geometry = svgEl('ellipse', {
        cx: object.dx / 2, cy: object.dy / 2,
        rx: Math.max(.5, Math.abs(object.dx) / 2),
        ry: Math.max(.5, Math.abs(object.dy) / 2),
      });
    } else {
      geometry = svgEl('path', { d: pathOf(object) });
    }
    geometry.classList.add('tali-overlay-stroke');
    geometry.setAttribute('fill', 'none');
    geometry.setAttribute('stroke', object.color);
    geometry.setAttribute('stroke-width', object.weight);
    geometry.setAttribute('stroke-linecap', 'round');
    geometry.setAttribute('stroke-linejoin', 'round');
    geometry.setAttribute('vector-effect', 'non-scaling-stroke');
    group.append(geometry);
    const hit = geometry.cloneNode();
    hit.classList.remove('tali-overlay-stroke');
    hit.classList.add('tali-overlay-hit');
    hit.removeAttribute('marker-end');
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', Math.max(14, object.weight + 10));
    hit.setAttribute('pointer-events', 'stroke');
    group.append(hit);
    hit.addEventListener('pointerdown', (event) => {
      if (!enabled || mode || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      select(object.id);
      toolbar.focus({ preventScroll: true });
      drag(object, event, 'move', shapes.querySelector('.tali-overlay-shape.selected'));
    });
    return group;
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
  function drag(object, event, operation, element) {
    const start = { x: event.clientX, y: event.clientY,
      left: object.x, top: object.y, width: object.width, height: object.height };
    const members = operation === 'move' && object.kind !== 'textbox'
      ? groupedSelection(objects, object.id) : [object];
    const origins = members.map((item) => ({ item, x: item.x, y: item.y }));
    const move = (e) => {
      if (e.pointerId !== event.pointerId) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (operation === 'resize') {
        const maxWidth = object.kind === 'textbox' ? Math.max(110, page.clientWidth - object.x) : 900;
        const maxHeight = Math.max(60, page.clientHeight - object.y);
        object.width = limit(start.width + dx, 110, maxWidth);
        object.height = limit(start.height + dy, 60, Math.min(600, maxHeight));
        placeBox(object, element);
      } else {
        for (const p of origins) {
          let nextX = Math.round(p.x + dx), nextY = Math.round(p.y + dy);
          if (p.item.kind === 'textbox') {
            nextX = limit(nextX, 0, Math.max(0, page.clientWidth - p.item.width));
            nextY = limit(nextY, 0, Math.max(0, page.clientHeight - p.item.height));
          } else if (p.item.kind === 'comment') {
            nextX = limit(nextX, -p.item.width - 280, page.clientWidth + 280);
            nextY = limit(nextY, 0, Math.max(0, page.clientHeight - p.item.height));
            p.item.side = nextX + p.item.width / 2 < page.clientWidth / 2 ? 'start' : 'end';
          }
          p.item.x = nextX; p.item.y = nextY;
          if (p.item.kind === 'textbox' || p.item.kind === 'comment') placeBox(p.item, element);
          else {
            const drawn = Array.from(shapes.children).find((child) => child.dataset.id === p.item.id);
            drawn?.setAttribute('transform', 'translate(' + p.item.x + ' ' + p.item.y + ')');
          }
        }
        if (object.kind === 'comment') drawShapes();
      }
    };
    const stop = (e) => {
      if (e.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      if (origins.some((p) => p.item.x !== p.x || p.item.y !== p.y) ||
          object.width !== start.width || object.height !== start.height) notify();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }
  function drawBoxes() {
    boxes.replaceChildren();
    for (const object of objects.filter((item) => item.kind === 'textbox' || item.kind === 'comment')) {
      if (object.kind === 'textbox') {
        object.width = Math.min(object.width, Math.max(110, page.clientWidth));
        object.height = Math.min(object.height, Math.max(60, page.clientHeight));
        object.x = limit(object.x, 0, Math.max(0, page.clientWidth - object.width));
        object.y = limit(object.y, 0, Math.max(0, page.clientHeight - object.height));
      }
      const element = document.createElement('div');
      element.className = 'tali-overlay-box' + (object.kind === 'comment' ? ' tali-margin-comment' : '');
      element.dataset.id = object.id;
      placeBox(object, element);
      const head = document.createElement('div');
      head.className = 'tali-overlay-grip';
      head.tabIndex = 0;
      head.innerHTML = icon('move', 15) + '<span></span>';
      head.querySelector('span').textContent = object.kind === 'comment' ? `„${object.quote.slice(0, 64)}${object.quote.length > 64 ? '…' : ''}“` : 'תיבת טקסט';
      head.title = 'גרור כדי להזיז את התיבה';
      head.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        select(object.id);
        head.focus({ preventScroll: true });
        drag(object, event, 'move', element);
      });
      const field = document.createElement('textarea');
      field.className = 'tali-overlay-text';
      field.dir = 'auto';
      field.spellcheck = true;
      field.placeholder = object.kind === 'comment' ? 'הערה לציטוט…' : 'כתוב כאן…';
      field.value = object.text;
      field.addEventListener('focus', () => select(object.id));
      field.addEventListener('input', () => {
        object.text = field.value.slice(0, 20000); notify({ typing: true });
      });
      const resize = document.createElement('span');
      resize.className = 'tali-overlay-resize';
      resize.title = 'שינוי גודל התיבה';
      resize.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        select(object.id); drag(object, event, 'resize', element);
      });
      element.append(head, field, resize);
      boxes.append(element);
    }
    markBoxes();
  }
  function render() { drawShapes(); drawBoxes(); updateToolbar(); }

  const penPoints = (object) => object.strokes.reduce((sum, item) => sum + item.length, 0);
  // Shift: קו או חץ בזוויות של 45°, ריבוע ועיגול מושלמים
  function constrain(kind, x, y) {
    if (kind === 'rect' || kind === 'ellipse') {
      const size = Math.max(Math.abs(x), Math.abs(y));
      return [Math.sign(x || 1) * size, Math.sign(y || 1) * size];
    }
    const angle = Math.round(Math.atan2(y, x) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(x, y);
    return [Math.round(Math.cos(angle) * length), Math.round(Math.sin(angle) * length)];
  }
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
        const strokes = object.strokes || (object.points ? [object.points] : []);
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

  function beginDrawing(event) {
    if (!enabled || !mode || event.button !== 0) return;
    event.preventDefault();
    const p = point(event);
    if (mode === 'textbox') {
      const object = { id: makeId(), kind: 'textbox', x: Math.round(p.x), y: Math.round(p.y),
        width: 235, height: 110, text: '', color, weight };
      objects.push(object);
      render();
      setMode(null);
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
        let group;
        if (object) group = object.group || (object.group = makeId().replace(/[^a-z0-9_-]/gi, ''));
        object = { id: makeId(), kind: 'pen', x: Math.round(p.x), y: Math.round(p.y), color, weight, strokes: [], ...(group ? { group } : {}) };
        objects.push(object);
        sessionPen = object;
      }
      stroke = [[Math.round(p.x - object.x), Math.round(p.y - object.y)]];
      object.strokes.push(stroke);
    } else {
      object = { id: makeId(), kind: mode, x: Math.round(p.x), y: Math.round(p.y), color, weight, dx: 0, dy: 0 };
      objects.push(object);
    }
    drawing = { pointerId: event.pointerId, object, stroke, start: p };
    if (event.currentTarget === svg) svg.setPointerCapture(event.pointerId);
    drawShapes();
    return true;
  }
  svg.addEventListener('pointerdown', beginDrawing);
  window.addEventListener('pointermove', (event) => {
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    if (drawing.eraser) { eraseAt(point(event)); return; }
    const events = drawing.object.kind === 'pen' && event.getCoalescedEvents
      ? event.getCoalescedEvents() : [event];
    for (const ev of events.length ? events : [event]) {
      const p = point(ev);
      if (drawing.object.kind === 'pen') {
        const x = Math.round(p.x - drawing.object.x), y = Math.round(p.y - drawing.object.y);
        const points = drawing.stroke;
        const prev = points[points.length - 1];
        if ((x - prev[0]) ** 2 + (y - prev[1]) ** 2 >= 4 && penPoints(drawing.object) < 2500) points.push([x, y]);
      } else {
        let x = Math.round(p.x - drawing.start.x), y = Math.round(p.y - drawing.start.y);
        if (event.shiftKey) [x, y] = constrain(drawing.object.kind, x, y);
        drawing.object.dx = x;
        drawing.object.dy = y;
      }
    }
    drawShapes();
  });
  const finish = (event) => {
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    if (drawing.eraser) {
      const erased = drawing.erased;
      drawing = null;
      if (erased) notify();
      return;
    }
    const object = drawing.object;
    if (object.kind === 'pen') {
      const p = point(event);
      const end = [Math.round(p.x - object.x), Math.round(p.y - object.y)];
      const points = drawing.stroke;
      const prev = points[points.length - 1];
      if (Math.hypot(end[0] - prev[0], end[1] - prev[1]) >= 1 && penPoints(object) < 2500) points.push(end);
      if (points.length === 1) points.push([points[0][0] + 1, points[0][1] + 1]);
    } else if (Math.abs(object.dx) + Math.abs(object.dy) < 4) {
      object.dx = 45; object.dy = object.kind === 'line' ? 0 : 30;
    }
    drawing = null;
    drawShapes();
    notify();
    if (object.kind !== 'pen') { setMode(null); select(object.id); toolbar.focus({ preventScroll: true }); }
  };
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);

  // Clicking outside the drawing canvas and its tools exits the active session.
  // Clicks on the page itself are reserved for adding strokes or selecting objects.
  window.addEventListener('pointerdown', (event) => {
    if (!enabled || (!mode && !selected)) return;
    if (page.contains(event.target) || toolbar.contains(event.target) || document.querySelector('dialog[open]')) return;
    // Starting in the surrounding workspace is valid: coordinates may begin outside the paper,
    // and the stroke can enter it naturally instead of the tool being cancelled.
    if (mode && page.closest('#pageWrap')?.contains(event.target)) {
      event.stopPropagation();
      beginDrawing(event);
      return;
    }
    setMode(null);
    select(null);
  }, true);

  window.addEventListener('keydown', (event) => {
    if (!enabled) return;
    // בזמן ציור הפוקוס נשאר בעורך, אבל Ctrl+Z שייך לשרטוט. רק תיבת טקסט על הדף שומרת אותו לעצמה.
    const inText = event.target.closest?.('textarea, input') || (!mode && event.target.closest?.('[contenteditable="true"]'));
    if ((mode || selected) && !inText && (event.ctrlKey || event.metaKey) && !event.altKey) {
      // לפי מיקום המקש (code), כך שזה עובד גם במקלדת עברית
      const isUndo = event.code === 'KeyZ' && !event.shiftKey;
      const isRedo = event.code === 'KeyY' || (event.code === 'KeyZ' && event.shiftKey);
      if (isUndo || isRedo) {
        (isUndo ? undo : redo)();
        event.preventDefault(); event.stopPropagation();
        return;
      }
    }
    if (event.key === 'Escape' && (mode || selected)) {
      setMode(null); select(null); event.preventDefault(); event.stopPropagation();
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected &&
      !event.target.closest?.('textarea, input, [contenteditable="true"]') &&
      !document.querySelector('dialog[open]') && !mode) {
      deleteSelection();
      event.preventDefault(); event.stopPropagation();
    }
  }, true);

  return {
    getItems: () => cleanOverlayObjects(objects),
    setItems: (items) => {
      objects = cleanOverlayObjects(items);
      selected = null; mode = null; drawing = null; sessionPen = null; render();
      resetHistory();
    },
    setEnabled: (value) => {
      enabled = !!value;
      root.hidden = !enabled;
      if (!enabled) { mode = null; selected = null; drawing = null; sessionPen = null; }
      render();
    },
    setMode: (next) => setMode(next),
    openDrawing,
    addComment,
  };
}
