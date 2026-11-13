// Floating annotation metadata lives in one trailing HTML comment, invisible in Obsidian.
// An unrecognized or invalid comment is NEVER removed (to avoid losing user data).
const TRAILER = /(?:\r?\n){2}<!-- TALI-OVERLAY:v1:([^\r\n]*?) -->[ \t]*(?:\r?\n)?$/;
const TYPES = new Set(['pen', 'line', 'arrow', 'rect', 'ellipse', 'textbox', 'comment']);
const finite = (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100000;
const bounded = (v, def, min, max) => finite(v) ? Math.min(max, Math.max(min, v)) : def;
const cleanPoints = (input, max) => Array.isArray(input) ? input.slice(0, max)
  .filter((p) => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]))
  .map((p) => [p[0], p[1]]) : [];

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
      ...(object.kind === 'pen' && /^[a-z0-9_-]{1,80}$/i.test(object.group || '') ? { group: object.group } : {}),
      // 6.9: a dashed outline for lines and shapes, and a light fill for rectangles and ellipses (optional fields)
      ...(object.dash === true && ['line', 'arrow', 'rect', 'ellipse'].includes(object.kind) ? { dash: true } : {}),
      ...(object.fill === 'tint' && ['rect', 'ellipse'].includes(object.kind) ? { fill: 'tint' } : {}),
    };
    if (object.kind === 'textbox' || object.kind === 'comment') {
      result.push({
        ...base, width: bounded(object.width, 230, 110, 900),
        height: bounded(object.height, 100, 60, 600),
        text: String(object.text || '').slice(0, 20000),
        ...(object.kind === 'comment' ? {
          quote: String(object.quote || '').trim().slice(0, 1000),
          side: object.side === 'start' ? 'start' : 'end',
        } : {}),
      });
    } else if (object.kind === 'pen') {
      // Since 6.3 one pen entity can hold several separate pointer strokes. Older
      // notes with one `points` array (and optional group id) remain compatible.
      if (Array.isArray(object.strokes)) {
        let remaining = 2500;
        const strokes = [];
        for (const inputStroke of object.strokes.slice(0, 200)) {
          const stroke = cleanPoints(inputStroke, remaining);
          if (stroke.length > 1) { strokes.push(stroke); remaining -= stroke.length; }
          if (remaining < 2) break;
        }
        if (strokes.length) result.push({ ...base, strokes });
      } else {
        const points = cleanPoints(object.points, 2500);
        if (points.length > 1) result.push({ ...base, points });
      }
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

// Selection is session-aware: legacy ungrouped strokes remain independently editable.
// Text boxes are intentionally never grouped with strokes.
export function groupedSelection(items, selectedId) {
  if (!Array.isArray(items)) return [];
  const chosen = items.find(item => item.id === selectedId);
  if (!chosen) return [];
  if (!chosen.group || chosen.kind !== 'pen') return [chosen];
  return items.filter(item => item.kind === 'pen' && item.group === chosen.group);
}
