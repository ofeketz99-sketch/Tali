// Floating annotation metadata lives in one trailing HTML comment, invisible in Obsidian.
// An unrecognized or invalid comment is NEVER removed (to avoid losing user data).
const TRAILER = /(?:\r?\n){2}<!-- TALI-OVERLAY:v1:([^\r\n]*?) -->[ \t]*(?:\r?\n)?$/;
const TYPES = new Set(['pen', 'line', 'arrow', 'rect', 'ellipse', 'textbox']);
const finite = (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100000;
const bounded = (v, def, min, max) => finite(v) ? Math.min(max, Math.max(min, v)) : def;

export function cleanOverlayObjects(input) {
  if (!Array.isArray(input)) return [];
  const result = [];
  for (const object of input.slice(0, 400)) {
    if (!object || !TYPES.has(object.kind)) continue;
    const base = {
      id: String(object.id || '').slice(0, 80) || String(result.length + 1),
      kind: object.kind,
      x: bounded(object.x, 50, -10000, 100000),
      y: bounded(object.y, 50, -10000, 100000),
      color: /^#[0-9a-f]{6}$/i.test(object.color || '') ? object.color : '#4b80bd',
      weight: bounded(object.weight, 2.4, 1, 20),
    };
    if (object.kind === 'textbox') {
      result.push({
        ...base, width: bounded(object.width, 230, 110, 900),
        height: bounded(object.height, 100, 60, 600),
        text: String(object.text || '').slice(0, 20000),
      });
    } else if (object.kind === 'pen') {
      const points = Array.isArray(object.points) ? object.points.slice(0, 2500)
        .filter((p) => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]))
        .map((p) => [p[0], p[1]]) : [];
      if (points.length > 1) result.push({ ...base, points });
    } else {
      result.push({
        ...base,
        dx: bounded(object.dx, 0, -100000, 100000),
        dy: bounded(object.dy, 0, -100000, 100000),
      });
    }
  }
  return result;
}

export function splitOverlay(markdown) {
  const source = String(markdown || '');
  const match = TRAILER.exec(source);
  if (!match) return { markdown: source, objects: [] };
  try {
    const decoded = JSON.parse(decodeURIComponent(match[1]));
    if (!decoded || decoded.version !== 1 || !Array.isArray(decoded.objects)) {
      return { markdown: source, objects: [] };
    }
    // Remove only the two delimiters that were added when saving; preserve all original newlines.
    return {
      markdown: source.slice(0, match.index),
      objects: cleanOverlayObjects(decoded.objects),
    };
  } catch {
    return { markdown: source, objects: [] };
  }
}

export function joinOverlay(markdown, objects) {
  const base = String(markdown || '');
  const safe = cleanOverlayObjects(objects);
  if (!safe.length) return base;
  const packed = encodeURIComponent(JSON.stringify({ version: 1, objects: safe }));
  const eol = base.includes('\r\n') ? '\r\n' : '\n';
  return base + eol + eol + '<!-- TALI-OVERLAY:v1:' + packed + ' -->' + eol;
}
