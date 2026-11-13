// Freehand strokes for the page overlay and the drawing window.
// The source points stay raw (only lightly simplified when a stroke ends), so smoothing never
// accumulates across saves. What is drawn is a filled outline built by perfect-freehand (MIT,
// the same algorithm Excalidraw uses): streamline evens out hand jitter, and the width eases with
// the drawing speed, like a real pen.
import { getStroke } from 'perfect-freehand';

const finitePoint = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

// Light 3-point average. Kept for older callers; the outline below does the real smoothing.
export function smoothStrokePoints(points) {
  if (!Array.isArray(points)) return [];
  const valid = points.filter(finitePoint);
  if (valid.length < 3) return valid.map((p) => [p[0], p[1]]);
  return valid.map((p, i) => {
    if (i === 0 || i === valid.length - 1) return [p[0], p[1]];
    const a = valid[i - 1], b = valid[i + 1];
    return [a[0] * .2 + p[0] * .6 + b[0] * .2, a[1] * .2 + p[1] * .6 + b[1] * .2];
  });
}

// Ramer–Douglas–Peucker: drops points that lie within `epsilon` px of the line between their
// neighbours. Runs once when a stroke ends: removes the noise of the mouse and keeps the file small.
export function simplifyStroke(points, epsilon = 0.6) {
  const valid = Array.isArray(points) ? points.filter(finitePoint).map((p) => [p[0], p[1]]) : [];
  if (valid.length < 3) return valid;
  const keep = new Uint8Array(valid.length);
  keep[0] = keep[valid.length - 1] = 1;
  const stack = [[0, valid.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = valid[first], [bx, by] = valid[last];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let worst = -1, far = 0;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = valid[i];
      const d = len ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / len : Math.hypot(px - ax, py - ay);
      if (d > far) { far = d; worst = i; }
    }
    if (worst > 0 && far > epsilon) { keep[worst] = 1; stack.push([first, worst], [worst, last]); }
  }
  const round = (n) => Math.round(n * 10) / 10;
  return valid.filter((_, i) => keep[i]).map((p) => [round(p[0]), round(p[1])]);
}

// The pen options, tuned to look like Excalidraw at the same nominal width.
// thinning 0: an even width (a highlighter).
export function freehandOptions(weight, { last = true, thinning = 0.55 } = {}) {
  return {
    size: Math.max(1.5, weight * 1.9),
    thinning,
    smoothing: 0.6,
    streamline: 0.45,
    easing: (t) => Math.sin((t * Math.PI) / 2),
    simulatePressure: true,
    last,
  };
}

// The filled outline polygon of a stroke (an array of [x, y]).
export function freehandOutline(points, weight, opts) {
  const valid = Array.isArray(points) ? points.filter(finitePoint) : [];
  if (!valid.length) return [];
  return getStroke(valid.map((p) => [p[0], p[1]]), freehandOptions(weight, opts));
}

const f = (n) => Math.round(n * 100) / 100;
const avg = (a, b) => (a + b) / 2;

// SVG path ("d") of a filled freehand stroke. A single click becomes a round dot.
export function freehandSvgPath(points, weight, opts) {
  const outline = freehandOutline(points, weight, opts);
  if (outline.length < 4) {
    const p = (points || []).find(finitePoint);
    if (!p) return '';
    const r = f(Math.max(0.8, weight * 0.75));
    return `M${f(p[0] - r)} ${f(p[1])} a${r} ${r} 0 1 0 ${f(2 * r)} 0 a${r} ${r} 0 1 0 ${f(-2 * r)} 0Z`;
  }
  // Quadratic curves through the midpoints: no corners on the outline itself.
  let [a, b] = outline;
  const c = outline[2];
  let d = `M${f(a[0])} ${f(a[1])} Q${f(b[0])} ${f(b[1])} ${f(avg(b[0], c[0]))} ${f(avg(b[1], c[1]))} T`;
  for (let i = 2; i < outline.length - 1; i++) {
    a = outline[i]; b = outline[i + 1];
    d += `${f(avg(a[0], b[0]))} ${f(avg(a[1], b[1]))} `;
  }
  return d + 'Z';
}

// Draws the same filled outline on a canvas (the drawing window, paint.js).
export function fillFreehand(ctx, points, weight, opts) {
  const outline = freehandOutline(points, weight, opts);
  ctx.beginPath();
  if (outline.length < 4) {
    const p = (points || []).find(finitePoint);
    if (!p) return;
    ctx.arc(p[0], p[1], Math.max(0.8, weight * 0.75), 0, Math.PI * 2);
  } else {
    ctx.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length - 1; i++) {
      ctx.quadraticCurveTo(outline[i][0], outline[i][1], avg(outline[i][0], outline[i + 1][0]), avg(outline[i][1], outline[i + 1][1]));
    }
    ctx.closePath();
  }
  ctx.fill();
}

// Old centreline path (Catmull-Rom). Still used for the invisible hit area of a pen stroke.
export function smoothSvgStroke(points) {
  const p = smoothStrokePoints(points);
  if (!p.length) return '';
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  if (p.length === 1) return d + ' l0.1 0';
  if (p.length === 2) return d + ` L${f(p[1][0])} ${f(p[1][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const before = p[Math.max(i - 1, 0)], current = p[i],
      next = p[i + 1], after = p[Math.min(i + 2, p.length - 1)];
    const c1 = [current[0] + (next[0] - before[0]) / 6, current[1] + (next[1] - before[1]) / 6];
    const c2 = [next[0] - (after[0] - current[0]) / 6, next[1] - (after[1] - current[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(next[0])} ${f(next[1])}`;
  }
  return d;
}
