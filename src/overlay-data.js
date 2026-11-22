// Floating annotation metadata lives in one trailing HTML comment, invisible in Obsidian.
// An unrecognized or invalid comment is NEVER removed (to avoid losing user data).
const TRAILER = /(?:\r?\n){2}<!-- TALI-OVERLAY:v1:([^\r\n]*?) -->[ \t]*(?:\r?\n)?$/;
const TYPES = new Set(['pen', 'line', 'arrow', 'rect', 'ellipse', 'drawing', 'textbox', 'comment', 'image']);
const SHAPES = new Set(['pen', 'line', 'arrow', 'rect', 'ellipse', 'drawing']);
// 11.6: a merged drawing ('drawing') is ONE entity whose parts are ordinary shapes, in coordinates
// relative to the drawing's own x, y. It is selected, moved, resized, coloured and deleted as one thing,
// and can be opened to edit its parts (page-overlay.js). Parts never carry ids or groups of their own.
const PART_KINDS = new Set(['pen', 'line', 'arrow', 'rect', 'ellipse']);
const MAX_PARTS = 200, MAX_PART_POINTS = 6000;
const IMAGE_STYLES = ['border', 'shadow', 'round'];
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
// 11.6: crop of a free image, [top, right, bottom, left] in percent (same rules as image-format.js)
const cleanImageCrop = (c) => {
  if (!Array.isArray(c) || c.length !== 4 || !c.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const v = c.map((n) => Math.max(0, Math.min(90, Math.round(n * 10) / 10)));
  if (v[0] + v[2] > 95 || v[1] + v[3] > 95 || v.every((n) => n === 0)) return null;
  return v;
};

// 11.8: "צמוד לטקסט": anchor = { t: תחילת הטקסט של הגוש (עד 80 תווים), n: מספר ההופעה, dy: פיקסלים מראש הגוש }.
// fixed: true = מיקום קבוע בדף. לא להערת שוליים (מעוגנת לציטוט) ולא לחלקים של שרטוט ממוזג.
function anchorFields(object) {
  if (object.kind === 'comment') return {};
  if (object.fixed === true) return { fixed: true };
  const a = object.anchor;
  if (!a || typeof a !== 'object' || !finite(a.dy)) return {};
  const n = Number.isInteger(a.n) && a.n >= 0 && a.n < 100000 ? a.n : 0;
  return { anchor: { t: String(a.t || '').replace(/[\r\n]/g, ' ').slice(0, 80), n, dy: Math.round(a.dy * 10) / 10 } };
}

export function cleanOverlayObjects(input, { parts = false } = {}) {
  if (!Array.isArray(input)) return [];
  const result = [];
  let partPoints = 0;
  for (const object of input.slice(0, parts ? MAX_PARTS : 400)) {
    if (!object || !(parts ? PART_KINDS : TYPES).has(object.kind)) continue;
    const before = result.length;
    cleanOne(object);
    if (!parts && result.length > before) Object.assign(result[result.length - 1], anchorFields(object));
  }
  return result;

  function cleanOne(object) {
    const base = {
      ...(parts ? {} : { id: String(object.id || '').slice(0, 80) || String(result.length + 1) }),
      kind: object.kind,
      x: bounded(object.x, parts ? 0 : 50, -10000, 100000),
      y: bounded(object.y, parts ? 0 : 50, -10000, 100000),
      color: /^#[0-9a-f]{6}$/i.test(object.color || '') ? object.color : '#4b80bd',
      weight: bounded(object.weight, 2.4, 1, 20),
      // 8.3: any drawn shape (not only pens) can belong to a group: "merge into one" in the drawing toolbar
      ...(!parts && SHAPES.has(object.kind) && /^[a-z0-9_-]{1,80}$/i.test(object.group || '') ? { group: object.group } : {}),
      // 6.9: a dashed outline for lines and shapes, and a light fill for rectangles and ellipses (optional fields)
      ...(object.dash === true && ['line', 'arrow', 'rect', 'ellipse'].includes(object.kind) ? { dash: true } : {}),
      ...(object.fill === 'tint' && ['rect', 'ellipse'].includes(object.kind) ? { fill: 'tint' } : {}),
    };
    if (object.kind === 'image') {
      const src = cleanSrc(object.src);
      if (!src) return;
      const crop = cleanImageCrop(object.crop);
      result.push({
        id: base.id, kind: 'image', x: base.x, y: base.y,
        width: bounded(object.width, 300, 30, 2000),
        height: bounded(object.height, 200, 20, 3000),
        src, ref: object.ref === 'md' ? 'md' : 'embed',
        ...(object.alt ? { alt: String(object.alt).replace(/[\r\n]/g, ' ').slice(0, 300) } : {}),
        // 11.6: picture format (image-format.js)
        ...([90, 180, 270].includes(object.rotate) ? { rotate: object.rotate } : {}),
        ...(object.flipH === true ? { flipH: true } : {}),
        ...(object.flipV === true ? { flipV: true } : {}),
        ...(crop ? { crop } : {}),
        ...(Array.isArray(object.styles) && object.styles.some((s) => IMAGE_STYLES.includes(s))
          ? { styles: IMAGE_STYLES.filter((s) => object.styles.includes(s)) } : {}),
      });
    } else if (object.kind === 'drawing') {
      const children = cleanOverlayObjects(object.parts, { parts: true });
      if (children.length) result.push({ ...base, parts: children });
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
      let remaining = parts ? Math.min(2500, MAX_PART_POINTS - partPoints) : 2500;
      if (remaining < 2) return;
      let pen = null;
      if (Array.isArray(object.strokes)) {
        const strokes = [];
        for (const inputStroke of object.strokes.slice(0, 200)) {
          const stroke = cleanPoints(inputStroke, remaining);
          if (stroke.length > 1) { strokes.push(stroke); remaining -= stroke.length; }
          if (remaining < 2) break;
        }
        if (strokes.length) pen = { ...base, strokes };
      } else {
        const points = cleanPoints(object.points, remaining);
        if (points.length > 1) pen = { ...base, points };
      }
      if (pen) {
        result.push(pen);
        if (parts) partPoints += (pen.strokes || [pen.points]).reduce((n, s) => n + s.length, 0);
      }
    } else {
      result.push({
        ...base,
        dx: bounded(object.dx, 0, -100000, 100000),
        dy: bounded(object.dy, 0, -100000, 100000),
      });
    }
  }
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

const strokesOf = (o) => o.strokes || (o.points ? [o.points] : []);
const r1 = (n) => Math.round(n * 10) / 10;
// A shape (or every part of a drawing) as stand-alone shapes in page coordinates, without ids or groups.
function flatParts(o) {
  if (o.kind === 'drawing') return (o.parts || []).map((p) => ({ ...p, x: r1(o.x + p.x), y: r1(o.y + p.y) }));
  const { id, group, ...rest } = o;
  return [rest];
}

// 8.3 → 11.6: several selected shapes become ONE entity. Pens with the same colour and weight are joined into
// a single pen (their strokes, moved to one origin) while they fit the pen limits; anything else becomes a
// merged drawing ('drawing') whose parts are the shapes. Drawings that are merged again are flattened into
// the new one. The new entity takes the place (and drawing order) of the top-most chosen shape, and keeps the
// id of the first one. Returns a new list.
export function mergeShapes(items, ids, newGroup) {
  void newGroup; // 8.3 API: merging used to share a group id; groups are still read for older notes
  const chosen = items.filter((o) => ids.includes(o.id) && SHAPES.has(o.kind));
  if (chosen.length < 2) return items;
  const parts = chosen.flatMap(flatParts);
  const first = chosen[0];
  let merged = null;
  const pens = parts.filter((p) => p.kind === 'pen');
  const samePens = pens.length === parts.length && pens.every((p) => p.color === pens[0].color && p.weight === pens[0].weight);
  if (samePens) {
    const total = pens.reduce((n, p) => n + strokesOf(p).reduce((m, s) => m + s.length, 0), 0);
    const count = pens.reduce((n, p) => n + strokesOf(p).length, 0);
    if (total <= 2500 && count <= 200) {
      const base = pens[0];
      merged = { id: first.id, kind: 'pen', x: base.x, y: base.y, color: base.color, weight: base.weight, strokes: [] };
      for (const p of pens) {
        const ox = p.x - base.x, oy = p.y - base.y;
        for (const s of strokesOf(p)) merged.strokes.push(s.map(([x, y]) => [r1(x + ox), r1(y + oy)]));
      }
    }
  }
  if (!merged) {
    const x = Math.round(Math.min(...parts.map((p) => p.x))), y = Math.round(Math.min(...parts.map((p) => p.y)));
    merged = {
      id: first.id, kind: 'drawing', x, y, color: first.color, weight: first.weight,
      parts: parts.slice(0, MAX_PARTS).map((p) => ({ ...p, x: r1(p.x - x), y: r1(p.y - y) })),
    };
  }
  const gone = new Set(chosen.map((o) => o.id));
  const last = items.lastIndexOf(chosen[chosen.length - 1]);
  const out = [];
  items.forEach((o, i) => {
    if (!gone.has(o.id)) out.push(o);
    if (i === last) out.push(merged);
  });
  return out;
}

// 11.6: a merged drawing back into separate shapes (in place, in the same drawing order). makeId() gives
// each part a new id. Returns { items, ids } (ids of the new shapes); a non-drawing is left as it is.
export function splitDrawing(items, id, makeId) {
  const at = items.findIndex((o) => o.id === id && o.kind === 'drawing');
  if (at < 0) return { items, ids: [] };
  const shapes = flatParts(items[at]).map((p) => ({ id: makeId(), ...p }));
  return { items: [...items.slice(0, at), ...shapes, ...items.slice(at + 1)], ids: shapes.map((s) => s.id) };
}
