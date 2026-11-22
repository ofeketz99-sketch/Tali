// 10.4: מסמך גרפי (קנבס). קובץ .canvas בפורמט JSON Canvas (https://jsoncanvas.org), אותו פורמט של Canvas באובסידיאן:
// { nodes: [...], edges: [...] }. פונקציות טהורות (עם בדיקות); התצוגה והעריכה ב־canvas-view.js.
//  - צומת text: כרטיס טקסט (Markdown). file: תמונה או מסמך מהכספת (נתיב יחסי עם /). link: כתובת. group: מסגרת.
//  - קו (edge): fromNode/fromSide → toNode/toSide, עם חץ בסוף כברירת מחדל (toEnd).
//  - ציור של Tali (עט, קו, חץ, מלבן, עיגול) אינו חלק מהפורמט: נשמר כצומת group בלי כותרת עם השדה taliDrawing,
//    כדי שאובסידיאן ישמור אותו (שדות לא מוכרים בצומת נשמרים) ויציג במקומו מסגרת ריקה.
//  - שדות שאנחנו לא מכירים, בצמתים, בקווים ובראש הקובץ, נשמרים כמו שהם.

export const SIDES = ['top', 'right', 'bottom', 'left'];
// צבעי הפורמט: "1".."6" (אדום, כתום, צהוב, ירוק, תכלת, סגול) או #rrggbb
export const PRESET_COLORS = { 1: '#e5484d', 2: '#f08c3a', 3: '#e2b714', 4: '#3fa35f', 5: '#3aa0c9', 6: '#8a63d2' };
export const colorValue = (c) => (c == null || c === '' ? null : PRESET_COLORS[c] || (/^#[0-9a-f]{3,8}$/i.test(c) ? c : null));
const DRAW_KINDS = new Set(['pen', 'line', 'arrow', 'rect', 'ellipse']);

const num = (v, d = 0) => (Number.isFinite(+v) ? Math.round(+v * 100) / 100 : d);

export function newId() {
  const a = new Uint8Array(8);
  (globalThis.crypto || { getRandomValues: (x) => x.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// קריאה סלחנית: קובץ ריק או פגום נותן קנבס ריק (ו־error), צמתים בלי מזהה מקבלים מזהה, קווים לצמתים שלא קיימים נזרקים.
export function parseCanvas(text) {
  let raw = {};
  let error = null;
  if (String(text || '').trim()) {
    try { raw = JSON.parse(text); } catch (e) { error = e.message; raw = {}; }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : []).filter((n) => n && typeof n === 'object').map((n) => ({
    ...n,
    id: typeof n.id === 'string' && n.id ? n.id : newId(),
    type: ['text', 'file', 'link', 'group'].includes(n.type) ? n.type : 'text',
    x: num(n.x), y: num(n.y), width: Math.max(1, num(n.width, 250)), height: Math.max(1, num(n.height, 60)),
  }));
  const ids = new Set();
  for (const n of nodes) { while (ids.has(n.id)) n.id = newId(); ids.add(n.id); }
  const edges = (Array.isArray(raw.edges) ? raw.edges : [])
    .filter((e) => e && ids.has(e.fromNode) && ids.has(e.toNode))
    .map((e) => ({ ...e, id: typeof e.id === 'string' && e.id ? e.id : newId() }));
  const { nodes: _n, edges: _e, ...rest } = raw;
  return { doc: { ...rest, nodes, edges }, error };
}

// כתיבה: כמו באובסידיאן, טאבים להזחה. צמתים מסוג group קודם (מצוירים מאחור).
export function serializeCanvas(doc) {
  const nodes = [...doc.nodes].sort((a, b) => (a.type === 'group') === (b.type === 'group') ? 0 : a.type === 'group' ? -1 : 1);
  return JSON.stringify({ ...doc, nodes, edges: doc.edges }, null, '\t');
}

export const isDrawing = (n) => !!(n?.type === 'group' && n.taliDrawing && DRAW_KINDS.has(n.taliDrawing.kind));

// ===== גאומטריה של קווים =====
export function sidePoint(n, side) {
  const cx = n.x + n.width / 2, cy = n.y + n.height / 2;
  if (side === 'top') return { x: cx, y: n.y };
  if (side === 'bottom') return { x: cx, y: n.y + n.height };
  if (side === 'left') return { x: n.x, y: cy };
  return { x: n.x + n.width, y: cy };
}
const NORMAL = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };
// הצד של from שפונה הכי טוב אל to (ולהפך): לפי הכיוון בין המרכזים
export function bestSides(a, b) {
  const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2, by = b.y + b.height / 2;
  const dx = bx - ax, dy = by - ay;
  if (Math.abs(dx) * (a.height + b.height) >= Math.abs(dy) * (a.width + b.width)) {
    return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  }
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}
// הצד הקרוב לנקודה (לחיבור קו שנגרר אל צומת)
export function nearestSide(n, p) {
  let best = 'top', d = Infinity;
  for (const s of SIDES) {
    const q = sidePoint(n, s);
    const dist = Math.hypot(q.x - p.x, q.y - p.y);
    if (dist < d) { d = dist; best = s; }
  }
  return best;
}
// עקומה כמו באובסידיאן: נקודות בקרה לאורך הכיוון היוצא מכל צד
export function edgePath(from, fromSide, to, toSide) {
  const len = Math.max(40, Math.min(160, Math.hypot(to.x - from.x, to.y - from.y) / 2));
  const [fx, fy] = NORMAL[fromSide] || [0, 0];
  const [tx, ty] = NORMAL[toSide] || [0, 0];
  const c1 = { x: from.x + fx * len, y: from.y + fy * len };
  const c2 = { x: to.x + tx * len, y: to.y + ty * len };
  return { d: `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`, c1, c2 };
}
// נקודה על העקומה (t בין 0 ל־1), למיקום התווית
export function bezierPoint(p0, c1, c2, p3, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
  };
}
export function edgeGeometry(doc, edge) {
  const a = doc.nodes.find((n) => n.id === edge.fromNode);
  const b = doc.nodes.find((n) => n.id === edge.toNode);
  if (!a || !b) return null;
  const [sa, sb] = bestSides(a, b);
  const fromSide = SIDES.includes(edge.fromSide) ? edge.fromSide : sa;
  const toSide = SIDES.includes(edge.toSide) ? edge.toSide : sb;
  const from = sidePoint(a, fromSide), to = sidePoint(b, toSide);
  const { d, c1, c2 } = edgePath(from, fromSide, to, toSide);
  return { d, from, to, fromSide, toSide, mid: bezierPoint(from, c1, c2, to, 0.5), c2 };
}

// מסגרת של כמה צמתים (לזום "הכול בחלון")
export function boundsOf(nodes) {
  if (!nodes.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of nodes) { x1 = Math.min(x1, n.x); y1 = Math.min(y1, n.y); x2 = Math.max(x2, n.x + n.width); y2 = Math.max(y2, n.y + n.height); }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

// ציור חופשי ← צומת: המסגרת סביב הנקודות (בתוספת חצי עובי), והנקודות יחסית לפינה שלה
export function drawingNode({ kind, points, color, width = 3, dash = false, fill = false, fillColor, fillOpacity }) {
  const pts = kind === 'pen' ? points.flat() : points;
  const pad = width / 2 + 2;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  let x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
  let w = Math.max(...xs) + pad - x, h = Math.max(...ys) + pad - y;
  if (kind === 'rect' || kind === 'ellipse') { w = Math.max(w, 8); h = Math.max(h, 8); }
  const rel = (p) => [num(p[0] - x), num(p[1] - y)];
  const canFill = fill && ['pen', 'rect', 'ellipse'].includes(kind);
  const d = { kind, color: color || null, width, ...(dash ? { dash: true } : {}),
    ...(canFill ? {
      fill: 'tint',
      ...(colorValue(fillColor) ? { fillColor: colorValue(fillColor) } : {}),
      ...(Number.isFinite(fillOpacity) ? { fillOpacity: Math.max(0, Math.min(1, num(fillOpacity))) } : {}),
    } : {}) };
  if (kind === 'pen') d.strokes = points.map((s) => s.map(rel));
  else d.points = points.map(rel);
  return { id: newId(), type: 'group', label: '', x: num(x), y: num(y), width: num(w), height: num(h), taliDrawing: d };
}
// שינוי גודל של ציור: הנקודות נמתחות לפי היחס
export function scaleDrawing(node, width, height) {
  const d = node.taliDrawing;
  const sx = width / node.width, sy = height / node.height;
  const s = (p) => [num(p[0] * sx), num(p[1] * sy)];
  return { ...node, width: num(width), height: num(height), taliDrawing: { ...d, ...(d.strokes ? { strokes: d.strokes.map((st) => st.map(s)) } : {}), ...(d.points ? { points: d.points.map(s) } : {}) } };
}

// 11.4: מחק בקנבס. p: נקודה בקואורדינטות הקנבס, r: רדיוס המחק.
// עט: משיכה שהמחק נוגע בה נמחקת כולה (כמו המחק בשכבת השרטוט). צורה (קו, חץ, מלבן, עיגול): נגיעה בקו המתאר מוחקת אותה.
// מחזיר null (לא נגע), 'remove' (למחוק את הצומת), או צומת חדש עם המשיכות שנשארו (אותו id).
const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const polyDist = (p, pts, closed = false) => {
  if (pts.length === 1) return Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]);
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(p, pts[i - 1], pts[i]));
  if (closed && pts.length > 2) d = Math.min(d, segDist(p, pts[pts.length - 1], pts[0]));
  return d;
};
export function eraseDrawing(node, p, r) {
  if (!isDrawing(node)) return null;
  const d = node.taliDrawing;
  const w = d.width || 3;
  const reach = r + w / 2;
  // מחוץ למסגרת של הצומת (עם המרווח): לא נוגע
  if (p.x < node.x - reach || p.y < node.y - reach || p.x > node.x + node.width + reach || p.y > node.y + node.height + reach) return null;
  const q = [p.x - node.x, p.y - node.y];
  if (d.kind === 'pen') {
    const strokes = d.strokes || [];
    const keep = strokes.filter((st) => polyDist(q, st) > reach);
    if (keep.length === strokes.length) return null;
    if (!keep.length) return 'remove';
    const n = drawingNode({ kind: 'pen', points: keep.map((st) => st.map(([x, y]) => [x + node.x, y + node.y])), color: d.color, width: w, dash: d.dash, fill: d.fill === 'tint' });
    return { ...node, x: n.x, y: n.y, width: n.width, height: n.height, taliDrawing: { ...d, strokes: n.taliDrawing.strokes } };
  }
  let dist;
  if (d.kind === 'line' || d.kind === 'arrow') dist = polyDist(q, d.points || [[0, 0], [node.width, node.height]]);
  else if (d.kind === 'rect') {
    const h = w / 2;
    dist = polyDist(q, [[h, h], [node.width - h, h], [node.width - h, node.height - h], [h, node.height - h]], true);
  } else {
    const cx = node.width / 2, cy = node.height / 2, rx = Math.max(0, cx - w / 2), ry = Math.max(0, cy - w / 2);
    const pts = Array.from({ length: 48 }, (_, i) => [cx + rx * Math.cos((i / 48) * Math.PI * 2), cy + ry * Math.sin((i / 48) * Math.PI * 2)]);
    dist = polyDist(q, pts, true);
  }
  return dist <= reach ? 'remove' : null;
}

// נתיב יחסי בכספת (עם /), כמו שאובסידיאן שומר ב־file
export function vaultRelative(root, p) {
  const a = String(root).replace(/\\/g, '/').replace(/\/$/, '');
  const b = String(p).replace(/\\/g, '/');
  return b.toLowerCase().startsWith(a.toLowerCase() + '/') ? b.slice(a.length + 1) : b;
}
