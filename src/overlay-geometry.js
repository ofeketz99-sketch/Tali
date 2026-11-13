// Geometry of page-overlay objects (page-overlay.js): creating a shape from two points,
// bounding boxes, and resizing with handles. Pure functions, with tests.
// Objects: { kind, x, y, dx, dy } for line/arrow/rect/ellipse, { kind: 'pen', x, y, strokes } for pens.

// Shape from the anchor point and the current point.
// shift: 45° steps for lines, a square / circle for boxes. alt: boxes grow from the centre (like Excalidraw).
export function dragShape(kind, start, p, { shift = false, alt = false } = {}) {
  let vx = p.x - start.x, vy = p.y - start.y;
  if (kind === 'line' || kind === 'arrow') {
    if (shift) {
      const angle = Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) * (Math.PI / 4);
      const length = Math.hypot(vx, vy);
      vx = Math.cos(angle) * length; vy = Math.sin(angle) * length;
    }
    return { x: Math.round(start.x), y: Math.round(start.y), dx: Math.round(vx), dy: Math.round(vy) };
  }
  if (shift) {
    const size = Math.max(Math.abs(vx), Math.abs(vy));
    vx = Math.sign(vx || 1) * size; vy = Math.sign(vy || 1) * size;
  }
  const box = alt
    ? { x: start.x - vx, y: start.y - vy, dx: 2 * vx, dy: 2 * vy }
    : { x: start.x, y: start.y, dx: vx, dy: vy };
  return normalizeBox(box);
}

// Rectangles and ellipses are kept with a positive size, so the handles are always in the same corners.
export function normalizeBox(o) {
  let { x, y, dx, dy } = o;
  if (dx < 0) { x += dx; dx = -dx; }
  if (dy < 0) { y += dy; dy = -dy; }
  return { x: Math.round(x), y: Math.round(y), dx: Math.round(dx), dy: Math.round(dy) };
}

const penStrokes = (o) => o.strokes || (o.points ? [o.points] : []);

// Bounding box on the page: { x, y, w, h }. Pens are padded by half the stroke width.
export function bboxOf(o) {
  if (o.kind === 'pen') {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const stroke of penStrokes(o)) for (const [px, py] of stroke) {
      x1 = Math.min(x1, px); y1 = Math.min(y1, py); x2 = Math.max(x2, px); y2 = Math.max(y2, py);
    }
    if (x1 === Infinity) return { x: o.x, y: o.y, w: 0, h: 0 };
    const pad = (o.weight ?? 2) / 2;
    return { x: o.x + x1 - pad, y: o.y + y1 - pad, w: x2 - x1 + 2 * pad, h: y2 - y1 + 2 * pad };
  }
  const xa = o.x, xb = o.x + (o.dx || 0), ya = o.y, yb = o.y + (o.dy || 0);
  return { x: Math.min(xa, xb), y: Math.min(ya, yb), w: Math.abs(xb - xa), h: Math.abs(yb - ya) };
}

export function bboxOfMany(objects) {
  const boxes = objects.map(bboxOf);
  if (!boxes.length) return null;
  const x1 = Math.min(...boxes.map((b) => b.x)), y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w)), y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// A corner handle dragged by (mx, my): the opposite corner stays put.
// keepRatio (Shift): the box keeps its proportions. The box can flip past the opposite corner.
export function resizeBox(box, handle, mx, my, { keepRatio = false, min = 4 } = {}) {
  const left = handle.includes('w'), top = handle.includes('n');
  const fixedX = left ? box.x + box.w : box.x, fixedY = top ? box.y + box.h : box.y;
  let mxp = (left ? box.x : box.x + box.w) + mx, myp = (top ? box.y : box.y + box.h) + my;
  let w = mxp - fixedX, h = myp - fixedY;
  if (keepRatio && box.w > 0 && box.h > 0) {
    const scale = Math.max(Math.abs(w) / box.w, Math.abs(h) / box.h);
    w = Math.sign(w || (left ? -1 : 1)) * box.w * scale;
    h = Math.sign(h || (top ? -1 : 1)) * box.h * scale;
  }
  if (Math.abs(w) < min) w = Math.sign(w || (left ? -1 : 1)) * min;
  if (Math.abs(h) < min) h = Math.sign(h || (top ? -1 : 1)) * min;
  return { x: Math.min(fixedX, fixedX + w), y: Math.min(fixedY, fixedY + h), w: Math.abs(w), h: Math.abs(h),
    flipX: (w < 0) !== left, flipY: (h < 0) !== top };
}

// Maps an object from one box to another (scale + move). `orig` is the object before the drag,
// so repeated moves never accumulate rounding. Returns a new object.
export function fitToBox(orig, from, to, { flipX = false, flipY = false } = {}) {
  const sx = from.w ? to.w / from.w : 1, sy = from.h ? to.h / from.h : 1;
  const mapX = (px) => (flipX ? to.x + to.w - (px - from.x) * sx : to.x + (px - from.x) * sx);
  const mapY = (py) => (flipY ? to.y + to.h - (py - from.y) * sy : to.y + (py - from.y) * sy);
  const r1 = (n) => Math.round(n * 10) / 10;
  if (orig.kind === 'pen') {
    const x = Math.round(mapX(orig.x)), y = Math.round(mapY(orig.y));
    const strokes = penStrokes(orig).map((stroke) => stroke.map(([px, py]) => [r1(mapX(orig.x + px) - x), r1(mapY(orig.y + py) - y)]));
    const out = { ...orig, x, y, strokes };
    delete out.points;
    return out;
  }
  const ax = mapX(orig.x), ay = mapY(orig.y), bx = mapX(orig.x + orig.dx), by = mapY(orig.y + orig.dy);
  const out = { ...orig, x: Math.round(ax), y: Math.round(ay), dx: Math.round(bx - ax), dy: Math.round(by - ay) };
  return orig.kind === 'rect' || orig.kind === 'ellipse' ? { ...out, ...normalizeBox(out) } : out;
}

// Moves one end of a line or arrow. end: 'start' | 'end'.
export function moveLineEnd(orig, end, mx, my, { shift = false } = {}) {
  const ax = orig.x, ay = orig.y, bx = orig.x + orig.dx, by = orig.y + orig.dy;
  if (end === 'end') {
    const s = dragShape(orig.kind, { x: ax, y: ay }, { x: bx + mx, y: by + my }, { shift });
    return { ...orig, ...s };
  }
  const s = dragShape(orig.kind, { x: bx, y: by }, { x: ax + mx, y: ay + my }, { shift });
  return { ...orig, x: s.x + s.dx, y: s.y + s.dy, dx: -s.dx, dy: -s.dy };
}
