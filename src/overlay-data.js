// Floating annotation metadata lives in one trailing HTML comment, invisible in Obsidian.
// An unrecognized or invalid comment is NEVER removed (to avoid losing user data).
const TRAILER = /(?:\r?\n){2}<!-- TALI-OVERLAY:v1:([^\r\n]*?) -->[ \t]*(?:\r?\n)?$/;
const TYPES = new Set(['pen', 'line', 'arrow', 'rect', 'ellipse', 'textbox', 'comment', 'image']);
const SHAPES = new Set(['pen', 'line', 'arrow', 'rect', 'ellipse']);
// 7.8: free image. ref 'embed' = src is the ![[...]] target (name or path in the vault); ref 'md' = src is the ![](...) path.
const cleanSrc = (v) => {
  const s = String(v || '').trim();
  return s && s.length <= 1000 && !/[\r\n<>]/.test(s) ? s : '';
};
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
      // 8.3: any drawn shape (not only pens) can belong to a group: "merge into one" in the drawing toolbar
      ...(SHAPES.has(object.kind) && /^[a-z0-9_-]{1,80}$/i.test(object.group || '') ? { group: object.group } : {}),
      // 6.9: a dashed outline for lines and shapes, and a light fill for rectangles and ellipses (optional fields)
      ...(object.dash === true && ['line', 'arrow', 'rect', 'ellipse'].includes(object.kind) ? { dash: true } : {}),
      ...(object.fill === 'tint' && ['rect', 'ellipse'].includes(object.kind) ? { fill: 'tint' } : {}),
    };
    if (object.kind === 'image') {
      const src = cleanSrc(object.src);
      if (!src) continue;
      result.push({
        id: base.id, kind: 'image', x: base.x, y: base.y,
        width: bounded(object.width, 300, 30, 2000),
        height: bounded(object.height, 200, 20, 3000),
        src, ref: object.ref === 'md' ? 'md' : 'embed',
        ...(object.alt ? { alt: String(object.alt).replace(/[\r\n]/g, ' ').slice(0, 300) } : {}),
      });
    } else if (object.kind === 'textbox' || object.kind === 'comment') {
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
    // 8.4: pageWidth = the page width the coordinates refer to (the layer scales with the page).
    const pageWidth = cleanPageWidth(decoded.pageWidth);
    return {
      markdown: source.slice(0, match.index),
      objects: cleanOverlayObjects(decoded.objects),
      ...(pageWidth ? { pageWidth } : {}),
    };
  } catch {
    return { markdown: source, objects: [] };
  }
}

const cleanPageWidth = (v) => (finite(v) && v >= 200 && v <= 4000 ? Math.round(v) : 0);

export function joinOverlay(markdown, objects, { pageWidth } = {}) {
  const base = String(markdown || '');
  const safe = cleanOverlayObjects(objects);
  if (!safe.length) return base;
  const width = cleanPageWidth(pageWidth);
  const packed = encodeURIComponent(JSON.stringify({ version: 1, ...(width ? { pageWidth: width } : {}), objects: safe }));
  const eol = base.includes('\r\n') ? '\r\n' : '\n';
  return base + eol + eol + '<!-- TALI-OVERLAY:v1:' + packed + ' -->' + eol;
}

// Selection is session-aware: legacy ungrouped strokes remain independently editable.
// Text boxes are intentionally never grouped with strokes. Since 8.3 every drawn shape can be grouped.
export function groupedSelection(items, selectedId) {
  if (!Array.isArray(items)) return [];
  const chosen = items.find(item => item.id === selectedId);
  if (!chosen) return [];
  if (!chosen.group || !SHAPES.has(chosen.kind)) return [chosen];
  return items.filter(item => SHAPES.has(item.kind) && item.group === chosen.group);
}

// 8.3: several selected shapes become one entity. Pens with the same colour and weight are joined into
// a single pen (their strokes, moved to one origin) while they fit the pen limits; everything else
// shares one group id, so it is selected, moved, resized and deleted together. Returns a new list.
export function mergeShapes(items, ids, newGroup) {
  const chosen = items.filter((o) => ids.includes(o.id) && SHAPES.has(o.kind));
  if (chosen.length < 2) return items;
  const pens = chosen.filter((o) => o.kind === 'pen');
  let keep = items;
  let joined = null;
  const same = pens.length > 1 && pens.every((p) => p.color === pens[0].color && p.weight === pens[0].weight);
  const strokesOf = (o) => o.strokes || (o.points ? [o.points] : []);
  if (same) {
    const total = pens.reduce((n, p) => n + strokesOf(p).reduce((m, s) => m + s.length, 0), 0);
    const count = pens.reduce((n, p) => n + strokesOf(p).length, 0);
    if (total <= 2500 && count <= 200) {
      const base = pens[0];
      joined = { ...base, strokes: [] };
      delete joined.points;
      for (const p of pens) {
        const ox = p.x - base.x, oy = p.y - base.y;
        for (const s of strokesOf(p)) joined.strokes.push(s.map(([x, y]) => [Math.round((x + ox) * 10) / 10, Math.round((y + oy) * 10) / 10]));
      }
      const gone = new Set(pens.slice(1).map((p) => p.id));
      keep = items.filter((o) => !gone.has(o.id)).map((o) => (o.id === base.id ? joined : o));
    }
  }
  const members = keep.filter((o) => ids.includes(o.id) && SHAPES.has(o.kind));
  if (members.length < 2) {
    // only one entity is left (all were pens that joined): it no longer needs a group
    return keep.map((o) => (members[0] && o.id === members[0].id ? (({ group, ...rest }) => rest)(o) : o));
  }
  return keep.map((o) => (members.includes(o) ? { ...o, group: newGroup } : o));
}
