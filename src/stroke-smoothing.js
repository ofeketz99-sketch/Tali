// Smooth both SVG page annotations and raster-canvas pen strokes.
// Keep source control points intact for editing and save only their raw coordinates.
export function smoothStrokePoints(points) {
  if (!Array.isArray(points)) return [];
  const valid = points.filter(p => Array.isArray(p) && p.length === 2 &&
    Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (valid.length < 3) return valid.map(p => [...p]);
  return valid.map((p, i) => {
    if (i === 0 || i === valid.length - 1) return [...p];
    const a = valid[i - 1], b = valid[i + 1];
    return [a[0] * .2 + p[0] * .6 + b[0] * .2,
      a[1] * .2 + p[1] * .6 + b[1] * .2];
  });
}

export function smoothSvgStroke(points) {
  const p = smoothStrokePoints(points);
  if (!p.length) return '';
  const f = n => Math.round(n * 100) / 100;
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  if (p.length === 1) return d + ' l0.1 0';
  if (p.length === 2) return d + ` L${f(p[1][0])} ${f(p[1][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const before = p[Math.max(i - 1, 0)], current = p[i],
      next = p[i + 1], after = p[Math.min(i + 2, p.length - 1)];
    const c1 = [current[0] + (next[0] - before[0]) / 6,
      current[1] + (next[1] - before[1]) / 6];
    const c2 = [next[0] - (after[0] - current[0]) / 6,
      next[1] - (after[1] - current[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(next[0])} ${f(next[1])}`;
  }
  return d;
}
