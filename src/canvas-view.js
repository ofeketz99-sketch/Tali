// 10.4: עריכת מסמך גרפי (קנבס, .canvas). הנתונים והגאומטריה ב־canvas-doc.js; כאן התצוגה והעריכה.
// משטח אינסופי: גלגלת גוללת, Ctrl+גלגלת מגדילה, גרירה ברקע בוחרת במלבן, רווח+גרירה או כפתור אמצעי מזיזים.
// כרטיס טקסט (Markdown), תמונה, קישור למסמך, וציור (עט, קו, חץ, מלבן, עיגול). קווים בין צמתים נמשכים
// מהנקודות שבצדי הצומת. כל שינוי קורא ל־onChange, והשמירה עצמה ב־renderer.js (getText).
import { icon } from './icons.js';
import {
  parseCanvas, serializeCanvas, newId, isDrawing, colorValue, PRESET_COLORS, SIDES,
  sidePoint, nearestSide, bestSides, edgeGeometry, edgePath, boundsOf, drawingNode, scaleDrawing, vaultRelative,
} from './canvas-doc.js';
import { freehandSvgPath, simplifyStroke } from './stroke-smoothing.js';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const SVGNS = 'http://www.w3.org/2000/svg';
const TOOLS = [
  ['select', 'pointer', 'בחירה והזזה (V)', 'KeyV'],
  ['hand', 'move', 'הזזת המשטח (H, או רווח+גרירה)', 'KeyH'],
  ['text', 'textBox', 'כרטיס טקסט (T, או לחיצה כפולה ברקע)', 'KeyT'],
  ['pen', 'pen', 'עט (P)', 'KeyP'],
  ['line', 'line', 'קו (L)', 'KeyL'],
  ['arrow', 'arrow', 'חץ (A)', 'KeyA'],
  ['rect', 'rect', 'מלבן (R)', 'KeyR'],
  ['ellipse', 'ellipse', 'עיגול (O)', 'KeyO'],
];
const MIN_ZOOM = 0.1, MAX_ZOOM = 4;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const svg = (tag, attrs = {}) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

export function createCanvasView({ host, api, readOnly = false }) {
  let doc = { nodes: [], edges: [] };
  let path = null;
  let view = { x: 0, y: 0, z: 1 };
  let tool = 'select';
  let color = null; // צבע לציור חדש ולצמתים חדשים: null = ברירת המחדל, או "1".."6"
  let selected = new Set(); // מזהי צמתים וקווים
  let editing = null; // מזהה הכרטיס שבעריכה
  let editBase = null; // הקנבס לפני העריכה: כל ההקלדה בכרטיס היא צעד ביטול אחד
  let penNode = null; // ציור העט הנוכחי: משיכות רצופות נכנסות אליו עד שמחליפים כלי
  let history = [], future = [];
  let saved = '';
  let spaceDown = false;

  host.classList.add('cv');
  host.tabIndex = readOnly ? -1 : 0;
  host.innerHTML = '';
  const viewport = el('div', 'cv-viewport');
  const world = el('div', 'cv-world');
  const groupLayer = el('div', 'cv-layer cv-groups');
  const edgeSvg = svg('svg', { class: 'cv-edges', width: '1', height: '1' });
  const defs = svg('defs');
  edgeSvg.append(defs);
  const edgeLayer = svg('g');
  edgeSvg.append(edgeLayer);
  const nodeLayer = el('div', 'cv-layer cv-nodes');
  const draft = svg('svg', { class: 'cv-draft', width: '1', height: '1' });
  const marquee = el('div', 'cv-marquee');
  marquee.hidden = true;
  world.append(groupLayer, edgeSvg, nodeLayer, draft);
  viewport.append(world, marquee);
  host.append(viewport);

  // ===== סרגל הכלים של הקנבס =====
  const toolBtns = {};
  let swatchBtns = [];
  const bar = el('div', 'cv-bar');
  const zoomLabel = el('button', 'cv-zoom-label');
  if (!readOnly) {
    const btn = (iconName, tip, run, cls = '') => {
      const b = el('button', 'cv-btn ' + cls, icon(iconName, 17));
      b.type = 'button';
      b.dataset.tip = tip;
      b.setAttribute('aria-label', tip);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => { run(b); host.focus({ preventScroll: true }); });
      return b;
    };
    const sep = () => el('span', 'cv-sep');
    for (const [id, ic, tip] of TOOLS) bar.append(toolBtns[id] = btn(ic, tip, () => setTool(id)));
    bar.append(sep(),
      btn('image', 'תמונה מקובץ', () => addImagesFromFiles()),
      btn('link', 'מסמך מהכספת (כרטיס שמציג אותו)', () => addNoteCard()),
      sep());
    const swatches = el('span', 'cv-swatches');
    for (const c of [null, '1', '2', '3', '4', '5', '6']) {
      const s = el('button', 'cv-swatch' + (c ? '' : ' none'));
      s.type = 'button';
      s.dataset.tip = c ? 'צבע' : 'צבע ברירת מחדל';
      if (c) s.style.background = PRESET_COLORS[c];
      s.addEventListener('mousedown', (e) => e.preventDefault());
      s.addEventListener('click', () => { setColor(c); host.focus({ preventScroll: true }); });
      s.dataset.color = c || '';
      swatches.append(s);
      swatchBtns.push(s);
    }
    bar.append(swatches, sep(),
      btn('trash', 'מחיקת הנבחר (Delete)', () => deleteSelection()),
      sep(),
      btn('undo', 'ביטול (Ctrl+Z)', () => undo()),
      btn('redo', 'חזרה (Ctrl+Y)', () => redo()),
      sep(),
      btn('rule', 'הקטנה (Ctrl+-)', () => zoomBy(1 / 1.2)),
      zoomLabel,
      btn('plus', 'הגדלה (Ctrl+=)', () => zoomBy(1.2)),
      btn('locate', 'הכול בחלון (Shift+1)', () => zoomToFit()));
    zoomLabel.type = 'button';
    zoomLabel.dataset.tip = '100%';
    zoomLabel.addEventListener('click', () => { const r = viewport.getBoundingClientRect(); zoomAt(1, r.width / 2, r.height / 2); });
    host.append(bar);
    const hint = el('div', 'cv-hint');
    hint.textContent = 'לחיצה כפולה ברקע: כרטיס טקסט · גרירה מהנקודה שבצד כרטיס: קו לכרטיס אחר · Ctrl+גלגלת: זום';
    host.append(hint);
  }

  // ===== מצב =====
  const nodeById = (id) => doc.nodes.find((n) => n.id === id);
  const edgeById = (id) => doc.edges.find((e) => e.id === id);
  const abs = (rel) => api.resolveFile(rel);
  const changed = () => {
    const text = serializeCanvas(doc);
    if (text === saved) return;
    history.push(saved);
    if (history.length > 200) history.shift();
    future = [];
    saved = text;
    api.onChange?.();
  };
  function restore(text) {
    doc = parseCanvas(text).doc;
    saved = text;
    selected = new Set([...selected].filter((id) => nodeById(id) || edgeById(id)));
    penNode = null;
    render();
    api.onChange?.();
  }
  function undo() { if (!history.length) return; future.push(saved); restore(history.pop()); }
  function redo() { if (!future.length) return; history.push(saved); restore(future.pop()); }

  function setTool(t) {
    if (readOnly) return;
    tool = t;
    penNode = null;
    for (const [id, b] of Object.entries(toolBtns)) b.classList.toggle('on', id === t);
    host.dataset.tool = t;
  }
  function setColor(c) {
    color = c;
    for (const s of swatchBtns) s.classList.toggle('on', (s.dataset.color || null) === c);
    // הצבע חל גם על מה שנבחר
    let any = false;
    for (const id of selected) {
      const n = nodeById(id);
      if (n && isDrawing(n)) { n.taliDrawing = { ...n.taliDrawing, color: colorValue(c) }; any = true; }
      else if (n) { if (c) n.color = c; else delete n.color; any = true; }
      const e = edgeById(id);
      if (e) { if (c) e.color = c; else delete e.color; any = true; }
    }
    if (any) { render(); changed(); }
  }

  // ===== תצוגה =====
  const applyView = () => {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    host.style.setProperty('--cv-z', view.z);
    zoomLabel.textContent = Math.round(view.z * 100) + '%';
    // 10.6: שתי רשתות נקודות (styles.css, .cv-viewport): הגדולה (תכלת) כל 44, הקטנה כל 11, ביחידות הקנבס
    const major = 44 * view.z, minor = 11 * view.z;
    viewport.style.backgroundSize = `${major}px ${major}px, ${minor}px ${minor}px`;
    viewport.style.backgroundPosition = `${view.x}px ${view.y}px`;
  };
  const saveView = () => { if (path && !readOnly) { try { localStorage.setItem('tali:canvas-view:' + path, JSON.stringify(view)); } catch {} } };
  let viewTimer = null;
  const viewChanged = () => { applyView(); clearTimeout(viewTimer); viewTimer = setTimeout(saveView, 400); };
  function zoomAt(z, sx, sy) {
    const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    const wx = (sx - view.x) / view.z, wy = (sy - view.y) / view.z;
    view = { x: sx - wx * nz, y: sy - wy * nz, z: nz };
    viewChanged();
  }
  function zoomBy(f) { const r = viewport.getBoundingClientRect(); zoomAt(view.z * f, r.width / 2, r.height / 2); }
  function zoomToFit() {
    const b = boundsOf(doc.nodes);
    const r = viewport.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (!b) { view = { x: r.width / 2, y: r.height / 2, z: 1 }; viewChanged(); return; }
    const pad = 60;
    const z = Math.max(MIN_ZOOM, Math.min(1, (r.width - pad * 2) / b.width, (r.height - pad * 2 - (readOnly ? 0 : 50)) / b.height));
    view = { z, x: (r.width - b.width * z) / 2 - b.x * z, y: (r.height - b.height * z) / 2 - b.y * z + (readOnly ? 0 : 20) };
    viewChanged();
  }
  const toWorld = (e) => {
    const r = viewport.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.z, y: (e.clientY - r.top - view.y) / view.z };
  };
  const viewCenter = () => {
    const r = viewport.getBoundingClientRect();
    return { x: (r.width / 2 - view.x) / view.z, y: (r.height / 2 - view.y) / view.z };
  };

  // ===== ציור הצמתים =====
  const nodeEls = new Map();
  function drawingSvg(n) {
    const d = n.taliDrawing;
    const s = svg('svg', { class: 'cv-drawing-svg', viewBox: `0 0 ${n.width} ${n.height}`, width: n.width, height: n.height, preserveAspectRatio: 'none' });
    const stroke = d.color || 'currentColor';
    const w = d.width || 3;
    const dash = d.dash ? `${w * 3} ${w * 2}` : null;
    if (d.kind === 'pen') {
      for (const st of d.strokes || []) s.append(svg('path', { d: freehandSvgPath(st, w), fill: stroke }));
    } else if (d.kind === 'line' || d.kind === 'arrow') {
      const [a, b] = d.points || [[0, 0], [n.width, n.height]];
      s.append(svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke, 'stroke-width': w, 'stroke-linecap': 'round', ...(dash ? { 'stroke-dasharray': dash } : {}) }));
      if (d.kind === 'arrow') {
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const L = Math.max(10, w * 4);
        const p1 = [b[0] - L * Math.cos(ang - 0.45), b[1] - L * Math.sin(ang - 0.45)];
        const p2 = [b[0] - L * Math.cos(ang + 0.45), b[1] - L * Math.sin(ang + 0.45)];
        s.append(svg('path', { d: `M${p1[0]} ${p1[1]} L${b[0]} ${b[1]} L${p2[0]} ${p2[1]}`, stroke, 'stroke-width': w, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      }
    } else {
      const h = w / 2;
      const attrs = { stroke, 'stroke-width': w, fill: 'none', ...(dash ? { 'stroke-dasharray': dash } : {}) };
      s.append(d.kind === 'rect'
        ? svg('rect', { x: h, y: h, width: Math.max(0, n.width - w), height: Math.max(0, n.height - w), rx: 4, ...attrs })
        : svg('ellipse', { cx: n.width / 2, cy: n.height / 2, rx: Math.max(0, n.width / 2 - h), ry: Math.max(0, n.height / 2 - h), ...attrs }));
    }
    return s;
  }
  function fillNode(box, n) {
    box.className = 'cv-node cv-' + (isDrawing(n) ? 'drawing' : n.type);
    const c = colorValue(n.color);
    if (c) box.style.setProperty('--cv-color', c); else box.style.removeProperty('--cv-color');
    box.classList.toggle('colored', !!c);
    box.replaceChildren();
    if (isDrawing(n)) { box.append(drawingSvg(n)); return; }
    if (n.type === 'group') {
      const label = el('div', 'cv-group-label');
      label.textContent = n.label || '';
      box.append(label);
      return;
    }
    const content = el('div', 'cv-content');
    box.append(content);
    if (n.type === 'text') {
      content.classList.add('np-body');
      content.dir = 'auto';
      content.innerHTML = api.renderMarkdown(n.text || '') || '';
      if (!(n.text || '').trim()) content.innerHTML = '<p class="cv-placeholder">כרטיס ריק. לחיצה כפולה לכתיבה</p>';
    } else if (n.type === 'file') {
      const p = abs(n.file || '');
      if (IMAGE_EXT.test(n.file || '')) {
        const img = el('img');
        img.src = api.fileUrl(p);
        img.alt = n.file;
        img.draggable = false;
        content.classList.add('cv-image');
        content.append(img);
      } else {
        const name = String(n.file || '').split('/').pop();
        const head = el('div', 'cv-file-head', icon(/\.md$/i.test(name) ? 'file' : 'fileBlank', 15));
        head.append(Object.assign(el('span'), { textContent: name.replace(/\.md$/i, '') }));
        const body = el('div', 'cv-file-body np-body');
        body.dir = 'auto';
        content.append(head, body);
        if (/\.md$/i.test(name)) {
          api.readFile(p).then((md) => { body.innerHTML = api.renderMarkdown(md, { limit: 1500 }); })
            .catch(() => { body.innerHTML = '<p class="cv-placeholder">המסמך לא נמצא</p>'; });
        }
      }
    } else if (n.type === 'link') {
      const a = el('div', 'cv-file-head', icon('link', 15));
      a.append(Object.assign(el('span'), { textContent: n.url || '' }));
      content.append(a);
    }
  }
  function placeNode(box, n) {
    box.style.left = n.x + 'px';
    box.style.top = n.y + 'px';
    box.style.width = n.width + 'px';
    box.style.height = n.height + 'px';
    box.classList.toggle('selected', selected.has(n.id));
  }
  function decorate(box, n) {
    if (readOnly) return;
    box.dataset.id = n.id;
    const handle = el('div', 'cv-resize');
    handle.dataset.role = 'resize';
    box.append(handle);
    if (!isDrawing(n)) {
      for (const s of SIDES) {
        const port = el('div', 'cv-port cv-port-' + s);
        port.dataset.role = 'port';
        port.dataset.side = s;
        box.append(port);
      }
    }
  }
  function render() {
    const keep = new Set(doc.nodes.map((n) => n.id));
    for (const [id, box] of nodeEls) if (!keep.has(id)) { box.remove(); nodeEls.delete(id); }
    for (const n of doc.nodes) {
      let box = nodeEls.get(n.id);
      if (!box) { box = el('div'); nodeEls.set(n.id, box); }
      if (editing === n.id && box.querySelector('textarea')) { placeNode(box, n); continue; }
      fillNode(box, n);
      decorate(box, n);
      placeNode(box, n);
      (n.type === 'group' && !isDrawing(n) ? groupLayer : nodeLayer).append(box);
    }
    renderEdges();
    host.classList.toggle('has-selection', selected.size > 0);
  }
  function renderPositions(ids) {
    for (const id of ids) { const n = nodeById(id); const box = nodeEls.get(id); if (n && box) placeNode(box, n); }
    renderEdges();
  }
  function renderEdges() {
    edgeLayer.replaceChildren();
    defs.replaceChildren();
    const markerFor = (c) => {
      const id = 'cv-arrow-' + (c || 'default').replace('#', '');
      if (!defs.querySelector('#' + id)) {
        const m = svg('marker', { id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '5', markerHeight: '5', orient: 'auto-start-reverse', markerUnits: 'strokeWidth' });
        m.append(svg('path', { d: 'M0 0 L10 5 L0 10 z', fill: c || 'var(--cv-edge)' }));
        defs.append(m);
      }
      return `url(#${id})`;
    };
    for (const e of doc.edges) {
      const g = edgeGeometry(doc, e);
      if (!g) continue;
      const c = colorValue(e.color);
      const grp = svg('g', { class: 'cv-edge' + (selected.has(e.id) ? ' selected' : ''), 'data-id': e.id });
      const line = svg('path', { d: g.d, class: 'cv-edge-line', ...(c ? { stroke: c } : {}) });
      if ((e.toEnd || 'arrow') === 'arrow') line.setAttribute('marker-end', markerFor(c));
      if (e.fromEnd === 'arrow') line.setAttribute('marker-start', markerFor(c));
      const hit = svg('path', { d: g.d, class: 'cv-edge-hit', 'data-role': 'edge', 'data-id': e.id });
      grp.append(line, hit);
      if (e.label) {
        const t = svg('text', { x: g.mid.x, y: g.mid.y, class: 'cv-edge-label', 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'data-role': 'edge', 'data-id': e.id });
        t.textContent = e.label;
        grp.append(t);
      }
      edgeLayer.append(grp);
    }
  }

  // ===== עריכת טקסט בכרטיס =====
  function editText(id) {
    const n = nodeById(id);
    if (!n || n.type !== 'text' || readOnly) return;
    finishEditing();
    editing = id;
    editBase = saved;
    const box = nodeEls.get(id);
    box.querySelector('.cv-content')?.remove();
    const ta = el('textarea', 'cv-editor');
    ta.dir = 'auto';
    ta.value = n.text || '';
    ta.spellcheck = true;
    box.prepend(ta);
    box.classList.add('editing');
    const grow = () => {
      if (ta.scrollHeight > ta.clientHeight + 1) { n.height = Math.ceil(ta.scrollHeight + 2); placeNode(box, n); renderEdges(); }
    };
    // שמירה אוטומטית גם בזמן ההקלדה (בלי לסגור את התיבה): getText קורא את הטקסט מהתיבה
    ta.addEventListener('input', () => { grow(); n.text = ta.value; api.onChange?.(); });
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); finishEditing(); host.focus({ preventScroll: true }); }
    });
    ta.addEventListener('blur', () => setTimeout(() => { if (editing === id) finishEditing(); }, 0));
    ta.addEventListener('pointerdown', (e) => e.stopPropagation());
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    grow();
  }
  function finishEditing() {
    if (!editing) return;
    const id = editing;
    editing = null;
    const n = nodeById(id);
    const box = nodeEls.get(id);
    const ta = box?.querySelector('textarea');
    if (n && ta) n.text = ta.value;
    box?.classList.remove('editing');
    if (n) { fillNode(box, n); decorate(box, n); placeNode(box, n); }
    const text = serializeCanvas(doc);
    const base = editBase ?? saved;
    editBase = null;
    if (text !== base) { history.push(base); future = []; }
    if (text !== saved) { saved = text; api.onChange?.(); }
  }
  // הטקסט העדכני, גם באמצע עריכה של כרטיס (בלי לסגור אותה)
  function currentText() {
    if (editing) {
      const n = nodeById(editing);
      const ta = nodeEls.get(editing)?.querySelector('textarea');
      if (n && ta) n.text = ta.value;
      saved = serializeCanvas(doc);
    }
    return saved;
  }

  // ===== הוספה =====
  function addTextCard(at, { edit = true } = {}) {
    const n = { id: newId(), type: 'text', text: '', x: Math.round(at.x - 130), y: Math.round(at.y - 30), width: 260, height: 80, ...(color ? { color } : {}) };
    doc.nodes.push(n);
    selected = new Set([n.id]);
    render();
    changed();
    if (edit) editText(n.id);
    return n;
  }
  const imageSize = (url) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 400, h: img.naturalHeight || 300 });
    img.onerror = () => resolve({ w: 400, h: 300 });
    img.src = url;
  });
  async function addImages(paths, at = viewCenter()) {
    const added = [];
    let x = at.x, y = at.y;
    for (const p of paths) {
      const { w, h } = await imageSize(api.fileUrl(p));
      const k = Math.min(1, 400 / w, 400 / h);
      const n = { id: newId(), type: 'file', file: vaultRelative(api.root(), p), x: Math.round(x - (w * k) / 2), y: Math.round(y - (h * k) / 2), width: Math.round(w * k), height: Math.round(h * k) };
      doc.nodes.push(n);
      added.push(n.id);
      x += 30; y += 30;
    }
    if (!added.length) return;
    selected = new Set(added);
    render();
    changed();
  }
  async function addImagesFromFiles() { const paths = await api.importImages(); if (paths?.length) await addImages(paths); }
  async function addNoteCard() {
    const p = await api.pickNote();
    if (!p) return;
    const at = viewCenter();
    const n = { id: newId(), type: 'file', file: vaultRelative(api.root(), p), x: Math.round(at.x - 200), y: Math.round(at.y - 150), width: 400, height: 300 };
    doc.nodes.push(n);
    selected = new Set([n.id]);
    render();
    changed();
  }
  function deleteSelection() {
    if (!selected.size) return;
    doc.nodes = doc.nodes.filter((n) => !selected.has(n.id));
    const alive = new Set(doc.nodes.map((n) => n.id));
    doc.edges = doc.edges.filter((e) => !selected.has(e.id) && alive.has(e.fromNode) && alive.has(e.toNode));
    selected.clear();
    penNode = null;
    render();
    changed();
  }
  function duplicateSelection() {
    const map = new Map();
    for (const n of doc.nodes.filter((x) => selected.has(x.id))) {
      const copy = JSON.parse(JSON.stringify(n));
      copy.id = newId();
      copy.x += 30; copy.y += 30;
      map.set(n.id, copy.id);
      doc.nodes.push(copy);
    }
    for (const e of doc.edges.filter((x) => map.has(x.fromNode) && map.has(x.toNode))) {
      doc.edges.push({ ...JSON.parse(JSON.stringify(e)), id: newId(), fromNode: map.get(e.fromNode), toNode: map.get(e.toNode) });
    }
    if (!map.size) return;
    selected = new Set(map.values());
    render();
    changed();
  }

  // ===== עכבר =====
  const hitNode = (target) => target.closest?.('.cv-node');
  let gesture = null;
  viewport.addEventListener('pointerdown', (e) => {
    if (readOnly) return;
    if (e.target.closest('.cv-editor')) return;
    host.focus({ preventScroll: true });
    const p = toWorld(e);
    // הזזת המשטח: כפתור אמצעי, רווח, או כלי היד
    if (e.button === 1 || spaceDown || tool === 'hand') {
      e.preventDefault();
      gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      viewport.setPointerCapture(e.pointerId);
      host.classList.add('panning');
      return;
    }
    if (e.button !== 0) return;
    if (editing) finishEditing();
    if (['pen', 'line', 'arrow', 'rect', 'ellipse'].includes(tool)) {
      e.preventDefault();
      gesture = { kind: 'draw', start: p, points: [[p.x, p.y]], shift: e.shiftKey };
      viewport.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === 'text') {
      e.preventDefault();
      addTextCard(p);
      setTool('select');
      return;
    }
    const role = e.target.dataset?.role;
    const box = hitNode(e.target);
    if (role === 'port' && box) {
      e.preventDefault();
      gesture = { kind: 'connect', from: box.dataset.id, side: e.target.dataset.side, p };
      viewport.setPointerCapture(e.pointerId);
      return;
    }
    if (role === 'resize' && box) {
      e.preventDefault();
      const n = nodeById(box.dataset.id);
      gesture = { kind: 'resize', id: n.id, start: p, w: n.width, h: n.height, orig: JSON.parse(JSON.stringify(n)) };
      viewport.setPointerCapture(e.pointerId);
      return;
    }
    if (role === 'edge') {
      const id = e.target.dataset.id;
      if (e.shiftKey) selected.has(id) ? selected.delete(id) : selected.add(id);
      else selected = new Set([id]);
      render();
      return;
    }
    if (box) {
      const id = box.dataset.id;
      if (e.shiftKey || e.ctrlKey) { if (selected.has(id)) selected.delete(id); else selected.add(id); render(); return; }
      if (!selected.has(id)) { selected = new Set([id]); render(); }
      // קבוצה (מסגרת) גוררת גם את מה שבתוכה
      const moving = new Set(selected);
      for (const sid of selected) {
        const g = nodeById(sid);
        if (g?.type === 'group' && !isDrawing(g)) {
          for (const n of doc.nodes) if (n.id !== g.id && n.x >= g.x && n.y >= g.y && n.x + n.width <= g.x + g.width && n.y + n.height <= g.y + g.height) moving.add(n.id);
        }
      }
      const origin = new Map([...moving].map((mid) => nodeById(mid)).filter(Boolean).map((n) => [n.id, { x: n.x, y: n.y }]));
      gesture = { kind: 'move', start: p, origin, moved: false };
      viewport.setPointerCapture(e.pointerId);
      return;
    }
    // רקע: בחירה במלבן
    if (!e.shiftKey) selected.clear();
    gesture = { kind: 'marquee', start: p, sx: e.clientX, sy: e.clientY, base: new Set(selected) };
    viewport.setPointerCapture(e.pointerId);
    render();
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!gesture) return;
    const p = toWorld(e);
    if (gesture.kind === 'pan') {
      view = { ...view, x: gesture.vx + e.clientX - gesture.sx, y: gesture.vy + e.clientY - gesture.sy };
      viewChanged();
    } else if (gesture.kind === 'move') {
      const dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
      if (!gesture.moved && Math.hypot(dx, dy) * view.z < 3) return;
      gesture.moved = true;
      for (const [id, o] of gesture.origin) { const n = nodeById(id); n.x = Math.round(o.x + dx); n.y = Math.round(o.y + dy); }
      renderPositions(gesture.origin.keys());
    } else if (gesture.kind === 'resize') {
      const n = nodeById(gesture.id);
      let w = Math.max(30, gesture.w + p.x - gesture.start.x);
      let h = Math.max(20, gesture.h + p.y - gesture.start.y);
      // תמונה וציור: לפי היחס (Shift: חופשי)
      if ((n.type === 'file' && IMAGE_EXT.test(n.file || '')) !== e.shiftKey || (isDrawing(n) && !e.shiftKey && n.taliDrawing.kind === 'pen')) {
        const k = Math.max(w / gesture.w, h / gesture.h);
        w = gesture.w * k; h = gesture.h * k;
      }
      if (isDrawing(n)) Object.assign(n, scaleDrawing(gesture.orig, Math.round(w), Math.round(h)));
      else { n.width = Math.round(w); n.height = Math.round(h); }
      const box = nodeEls.get(n.id);
      if (isDrawing(n)) { fillNode(box, n); decorate(box, n); }
      placeNode(box, n);
      renderEdges();
    } else if (gesture.kind === 'connect') {
      const from = nodeById(gesture.from);
      const a = sidePoint(from, gesture.side);
      const target = hitNode(document.elementFromPoint(e.clientX, e.clientY));
      const to = target && target.dataset.id !== gesture.from ? nodeById(target.dataset.id) : null;
      const toSide = to ? dropSide(from, to, p) : null;
      const b = to ? sidePoint(to, toSide) : p;
      draft.replaceChildren(svg('path', { d: edgePath(a, gesture.side, b, toSide || opposite(gesture.side)).d, class: 'cv-edge-draft' }));
      for (const box of nodeEls.values()) box.classList.toggle('drop', !!to && box.dataset.id === to.id);
    } else if (gesture.kind === 'draw') {
      if (tool === 'pen') gesture.points.push([p.x, p.y]);
      else gesture.points = [[gesture.start.x, gesture.start.y], constrain(gesture.start, p, e.shiftKey)];
      drawDraft();
    } else if (gesture.kind === 'marquee') {
      const r = viewport.getBoundingClientRect();
      const x1 = Math.min(gesture.sx, e.clientX), y1 = Math.min(gesture.sy, e.clientY);
      Object.assign(marquee.style, { left: x1 - r.left + 'px', top: y1 - r.top + 'px', width: Math.abs(e.clientX - gesture.sx) + 'px', height: Math.abs(e.clientY - gesture.sy) + 'px' });
      marquee.hidden = false;
      const a = gesture.start;
      const box = { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), x2: Math.max(a.x, p.x), y2: Math.max(a.y, p.y) };
      selected = new Set(gesture.base);
      for (const n of doc.nodes) if (n.x < box.x2 && n.x + n.width > box.x && n.y < box.y2 && n.y + n.height > box.y) selected.add(n.id);
      for (const [id, nb] of nodeEls) nb.classList.toggle('selected', selected.has(id));
    }
  });
  // שחרור על כרטיס: קרוב לשפה, הצד הקרוב; באמצע הכרטיס, הצד שפונה אל הכרטיס שממנו יצא הקו
  function dropSide(from, to, p) {
    const inner = Math.abs(p.x - (to.x + to.width / 2)) < to.width * 0.3 && Math.abs(p.y - (to.y + to.height / 2)) < to.height * 0.3;
    return inner ? bestSides(from, to)[1] : nearestSide(to, p);
  }
  const opposite = (s) => ({ top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[s]);
  function constrain(a, p, shift) {
    if (!shift) return [p.x, p.y];
    if (tool === 'rect' || tool === 'ellipse') {
      const d = Math.max(Math.abs(p.x - a.x), Math.abs(p.y - a.y));
      return [a.x + Math.sign(p.x - a.x || 1) * d, a.y + Math.sign(p.y - a.y || 1) * d];
    }
    const ang = Math.round(Math.atan2(p.y - a.y, p.x - a.x) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(p.x - a.x, p.y - a.y);
    return [a.x + Math.cos(ang) * len, a.y + Math.sin(ang) * len];
  }
  const strokeColor = () => colorValue(color) || 'currentColor';
  function drawDraft() {
    const g = gesture;
    const c = strokeColor();
    if (tool === 'pen') draft.replaceChildren(svg('path', { d: freehandSvgPath(g.points, 3, { last: false }), fill: c }));
    else {
      const [a, b] = g.points.length > 1 ? g.points : [g.points[0], g.points[0]];
      const attrs = { stroke: c, 'stroke-width': 3, fill: 'none' };
      if (tool === 'line' || tool === 'arrow') draft.replaceChildren(svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], ...attrs, 'stroke-linecap': 'round' }));
      else if (tool === 'rect') draft.replaceChildren(svg('rect', { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]), rx: 4, ...attrs }));
      else draft.replaceChildren(svg('ellipse', { cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, rx: Math.abs(b[0] - a[0]) / 2, ry: Math.abs(b[1] - a[1]) / 2, ...attrs }));
    }
  }
  viewport.addEventListener('pointerup', (e) => endGesture(e));
  viewport.addEventListener('pointercancel', (e) => endGesture(e, true));
  function endGesture(e, cancel = false) {
    const g = gesture;
    gesture = null;
    if (!g) return;
    host.classList.remove('panning');
    marquee.hidden = true;
    draft.replaceChildren();
    for (const box of nodeEls.values()) box.classList.remove('drop');
    if (cancel) { render(); return; }
    const p = toWorld(e);
    if (g.kind === 'move' && g.moved) changed();
    else if (g.kind === 'resize') changed();
    else if (g.kind === 'marquee') render();
    else if (g.kind === 'connect') {
      const target = hitNode(document.elementFromPoint(e.clientX, e.clientY));
      const to = target && target.dataset.id !== g.from ? nodeById(target.dataset.id) : null;
      if (to) {
        const edge = { id: newId(), fromNode: g.from, fromSide: g.side, toNode: to.id, toSide: dropSide(nodeById(g.from), to, p), ...(color ? { color } : {}) };
        doc.edges.push(edge);
        selected = new Set([edge.id]);
        render();
        changed();
      } else if (Math.hypot(p.x - g.p.x, p.y - g.p.y) * view.z > 30) {
        // שחרור ברקע: כרטיס חדש שמחובר לקו, כמו באובסידיאן
        const from = nodeById(g.from);
        const n = addTextCard(p, { edit: false });
        const toSide = nearestSide(n, sidePoint(from, g.side));
        doc.edges.push({ id: newId(), fromNode: from.id, fromSide: g.side, toNode: n.id, toSide, ...(color ? { color } : {}) });
        render();
        changed();
        editText(n.id);
      }
    } else if (g.kind === 'draw') finishDrawing(g);
  }
  function finishDrawing(g) {
    const kind = tool;
    if (kind === 'pen') {
      const pts = simplifyStroke(g.points, 0.8 / view.z);
      if (!pts.length) return;
      const prev = penNode && nodeById(penNode);
      let strokes = [pts];
      if (prev) strokes = [...(prev.taliDrawing.strokes || []).map((s) => s.map(([x, y]) => [x + prev.x, y + prev.y])), pts];
      const n = drawingNode({ kind: 'pen', points: strokes, color: colorValue(color), width: 3 });
      if (prev) { n.id = prev.id; Object.assign(prev, n); } else { doc.nodes.push(n); penNode = n.id; }
      render();
      changed();
      return;
    }
    if (g.points.length < 2) return;
    const [a, b] = g.points;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) * view.z < 4) return;
    const n = drawingNode({ kind, points: [a, b], color: colorValue(color), width: 3 });
    doc.nodes.push(n);
    selected = new Set([n.id]);
    setTool('select');
    render();
    changed();
  }

  viewport.addEventListener('dblclick', (e) => {
    if (readOnly) return;
    const box = hitNode(e.target);
    if (e.target.closest('.cv-editor')) return;
    if (e.target.dataset?.role === 'edge') {
      const edge = edgeById(e.target.dataset.id);
      if (!edge) return;
      api.ask('תווית לקו (ריק: בלי תווית):', edge.label || '').then((v) => {
        if (v == null) return;
        if (v.trim()) edge.label = v.trim(); else delete edge.label;
        render();
        changed();
      });
      return;
    }
    if (!box) { if (tool === 'select') addTextCard(toWorld(e)); return; }
    const n = nodeById(box.dataset.id);
    if (!n) return;
    if (n.type === 'text') editText(n.id);
    else if (n.type === 'file') api.openFile(abs(n.file));
    else if (n.type === 'link' && n.url) api.openUrl(n.url);
    else if (n.type === 'group' && !isDrawing(n)) {
      api.ask('כותרת למסגרת:', n.label || '').then((v) => { if (v == null) return; n.label = v; render(); changed(); });
    }
  });
  // קישור [[...]] בתוך כרטיס: Ctrl+לחיצה פותחת (לחיצה רגילה בוחרת את הכרטיס)
  viewport.addEventListener('click', (e) => {
    const link = e.target.closest?.('.np-link');
    if (link && (e.ctrlKey || readOnly)) api.openLink(link.dataset.target);
  });

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(view.z * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    else { view = { ...view, x: view.x - (e.shiftKey ? e.deltaY : e.deltaX), y: view.y - (e.shiftKey ? 0 : e.deltaY) }; viewChanged(); }
  }, { passive: false });

  // ===== מקלדת =====
  host.addEventListener('keydown', (e) => {
    if (readOnly || editing || e.target.closest?.('textarea, input')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.code === 'Space') { spaceDown = true; host.classList.add('pan-ready'); e.preventDefault(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
    if (e.key === 'Escape') { selected.clear(); penNode = null; if (tool !== 'select') setTool('select'); render(); return; }
    if (e.key === 'Enter' && selected.size === 1) { const n = nodeById([...selected][0]); if (n?.type === 'text') { e.preventDefault(); editText(n.id); } return; }
    if (ctrl && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (ctrl && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
    if (ctrl && e.code === 'KeyA') { e.preventDefault(); selected = new Set(doc.nodes.map((n) => n.id)); render(); return; }
    if (ctrl && e.code === 'KeyD') { e.preventDefault(); duplicateSelection(); return; }
    if (ctrl && (e.code === 'Equal' || e.code === 'NumpadAdd')) { e.preventDefault(); zoomBy(1.2); return; }
    if (ctrl && (e.code === 'Minus' || e.code === 'NumpadSubtract')) { e.preventDefault(); zoomBy(1 / 1.2); return; }
    if (e.shiftKey && e.code === 'Digit1') { e.preventDefault(); zoomToFit(); return; }
    if (e.key.startsWith('Arrow') && selected.size) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      for (const id of selected) { const n = nodeById(id); if (n) { n.x += dx; n.y += dy; } }
      renderPositions(selected);
      changed();
      return;
    }
    if (!ctrl && !e.altKey) {
      const t = TOOLS.find((x) => x[3] === e.code);
      if (t) { e.preventDefault(); setTool(t[0]); }
    }
  });
  host.addEventListener('keyup', (e) => { if (e.code === 'Space') { spaceDown = false; host.classList.remove('pan-ready'); } });
  host.addEventListener('blur', () => { spaceDown = false; host.classList.remove('pan-ready'); });

  // הדבקה: תמונה ← צומת תמונה, טקסט ← כרטיס
  host.addEventListener('paste', async (e) => {
    if (readOnly || editing || e.target.closest?.('textarea, input')) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    e.preventDefault();
    if (files.length) { await addImages(await api.saveImages(files)); return; }
    const text = e.clipboardData?.getData('text/plain');
    if (text?.trim()) { const n = addTextCard(viewCenter(), { edit: false }); n.text = text; render(); changed(); }
  });
  // גרירת קבצי תמונה מהמחשב
  viewport.addEventListener('dragover', (e) => { if (!readOnly && [...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  viewport.addEventListener('drop', async (e) => {
    if (readOnly) return;
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    await addImages(await api.saveImages(files), toWorld(e));
  });

  const ro = new ResizeObserver(() => { if (pendingFit) { pendingFit = false; zoomToFit(); } });
  ro.observe(viewport);
  let pendingFit = false;

  // ===== API =====
  function load(text, p) {
    finishEditing();
    path = p;
    const parsed = parseCanvas(text);
    doc = parsed.doc;
    saved = serializeCanvas(doc);
    history = []; future = [];
    selected.clear();
    penNode = null;
    editing = null;
    for (const box of nodeEls.values()) box.remove();
    nodeEls.clear();
    setTool('select');
    setColor(null);
    render();
    let stored = null;
    try { stored = !readOnly && JSON.parse(localStorage.getItem('tali:canvas-view:' + p) || 'null'); } catch {}
    if (stored && Number.isFinite(stored.z)) { view = stored; applyView(); }
    else {
      const r = viewport.getBoundingClientRect();
      if (r.width) zoomToFit(); else pendingFit = true;
    }
    return parsed;
  }
  return {
    load,
    // הטקסט לשמירה. אם הקובץ לא השתנה מאז הטעינה, אותו טקסט בדיוק (לא כותבים שינויי עיצוב בלבד)
    getText: () => currentText(),
    isDirtyFrom: (text) => serializeCanvas(parseCanvas(text).doc) !== saved,
    focus: () => host.focus({ preventScroll: true }),
    zoomToFit,
    setTool,
    get path() { return path; },
    destroy: () => { ro.disconnect(); host.replaceChildren(); },
  };
}
