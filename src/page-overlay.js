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
];
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
  let sessionId = null; // All vector strokes from one activation share a persistent ID.
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

  const notify = () => { if (enabled) onChange(); };
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
  toolbar.append(picker);
  const deleteButton = addButton(null, 'מחיקת שרטוט או קבוצה מסומנת (Del)', 'trash', deleteSelection);
  deleteButton.dataset.action = 'remove';
  addButton(null, 'סיום שרטוט וחזרה לכתיבה (Esc)', 'close', () => {
    setMode(null); select(null);
  });
  const hint = document.createElement('span');
  hint.className = 'tali-overlay-hint';
  hint.textContent = 'גרירה לציור · Esc לסיום';
  toolbar.append(hint);

  function setMode(next) {
    if (!enabled) return;
    if (!next || next === 'textbox') sessionId = null;
    else if (shapeKinds.includes(next)) {
      if (!sessionId) sessionId = makeId();
      lastTool = next;
      try { localStorage.setItem(lastToolKey, next); } catch { /* Nonessential preference. */ }
    }
    mode = next;
    selected = null;
    drawShapes();
    markBoxes();
    updateToolbar();
  }
  function openDrawing() {
    if (!enabled) return;
    // Explicitly reopening starts a fresh group. Switching tools inside the bar does not.
    sessionId = null;
    setMode(lastTool);
  }
  const point = (event) => {
    const bounds = page.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const pathOf = (object) => {
    if (object.kind === 'pen') return smoothSvgStroke(object.points);
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
    shapes.replaceChildren(...objects.filter((object) => shapeKinds.includes(object.kind)).map(shapeElement));
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
        object.width = limit(start.width + dx, 110, 900);
        object.height = limit(start.height + dy, 60, 600);
        placeBox(object, element);
      } else {
        for (const p of origins) {
          p.item.x = Math.round(p.x + dx);
          p.item.y = Math.round(p.y + dy);
          if (p.item.kind === 'textbox') placeBox(p.item, element);
          else {
            const drawn = Array.from(shapes.children).find((child) => child.dataset.id === p.item.id);
            drawn?.setAttribute('transform', 'translate(' + p.item.x + ' ' + p.item.y + ')');
          }
        }
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
    for (const object of objects.filter((item) => item.kind === 'textbox')) {
      const element = document.createElement('div');
      element.className = 'tali-overlay-box';
      element.dataset.id = object.id;
      placeBox(object, element);
      const head = document.createElement('div');
      head.className = 'tali-overlay-grip';
      head.tabIndex = 0;
      head.innerHTML = icon('move', 15) + '<span>תיבת טקסט</span>';
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
      field.placeholder = 'כתוב כאן…';
      field.value = object.text;
      field.addEventListener('focus', () => select(object.id));
      field.addEventListener('input', () => {
        object.text = field.value.slice(0, 20000); notify();
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

  svg.addEventListener('pointerdown', (event) => {
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
      return;
    }
    const object = { id: makeId(), kind: mode, x: Math.round(p.x), y: Math.round(p.y),
      color, weight, group: sessionId };
    if (mode === 'pen') object.points = [[0, 0], [0, 0]];
    else { object.dx = 0; object.dy = 0; }
    objects.push(object);
    drawing = { pointerId: event.pointerId, object, start: p };
    svg.setPointerCapture(event.pointerId);
    drawShapes();
  });
  svg.addEventListener('pointermove', (event) => {
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    const events = drawing.object.kind === 'pen' && event.getCoalescedEvents
      ? event.getCoalescedEvents() : [event];
    for (const ev of events.length ? events : [event]) {
      const p = point(ev);
      const x = Math.round(p.x - drawing.start.x);
      const y = Math.round(p.y - drawing.start.y);
      if (drawing.object.kind === 'pen') {
        const points = drawing.object.points;
        const prev = points[points.length - 1];
        if ((x - prev[0]) ** 2 + (y - prev[1]) ** 2 >= 4 && points.length < 2500) points.push([x, y]);
      } else {
        drawing.object.dx = x;
        drawing.object.dy = y;
      }
    }
    drawShapes();
  });
  const finish = (event) => {
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    const object = drawing.object;
    if (object.kind === 'pen') {
      const p = point(event);
      const end = [Math.round(p.x - drawing.start.x), Math.round(p.y - drawing.start.y)];
      const prev = object.points[object.points.length - 1];
      if (Math.hypot(end[0] - prev[0], end[1] - prev[1]) >= 1 && object.points.length < 2500) object.points.push(end);
      if (object.points.length < 3) object.points.push([object.points[1][0] + 1, object.points[1][1] + 1]);
    } else if (Math.abs(object.dx) + Math.abs(object.dy) < 4) {
      object.dx = 45; object.dy = object.kind === 'line' ? 0 : 30;
    }
    drawing = null;
    drawShapes();
    notify();
  };
  svg.addEventListener('pointerup', finish);
  svg.addEventListener('pointercancel', finish);

  // Clicking outside the drawing canvas and its tools exits the active session.
  // Clicks on the page itself are reserved for adding strokes or selecting objects.
  window.addEventListener('pointerdown', (event) => {
    if (!enabled || (!mode && !selected)) return;
    if (page.contains(event.target) || toolbar.contains(event.target) || document.querySelector('dialog[open]')) return;
    setMode(null);
    select(null);
  }, true);

  window.addEventListener('keydown', (event) => {
    if (!enabled) return;
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
      selected = null; mode = null; drawing = null; sessionId = null; render();
    },
    setEnabled: (value) => {
      enabled = !!value;
      root.hidden = !enabled;
      if (!enabled) { mode = null; selected = null; drawing = null; sessionId = null; }
      render();
    },
    setMode: (next) => setMode(next),
    openDrawing,
  };
}
