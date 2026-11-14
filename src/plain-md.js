// 8.0: "המרה ל־Markdown רגיל". כל מה שמיוחד ל־Tali הופך לתוכן רגיל בתוך המסמך, כך שאובסידיאן (וכל עורך) מציג אותו:
// - תמונה חופשית ← תמונה רגילה בשורה משלה, בגובה שבו היא הייתה (![[...|רוחב]] / ![](...)).
// - תיבת טקסט צפה ← פסקה "תיבת טקסט: …"; הערת שוליים ← "הערה: …" (עם הציטוט, אם יש).
// - שרטוטים על הדף ← תמונת PNG אחת (Drawing <תאריך>.png) במקום שבו הם היו.
// - מסגרת סביב טקסט ([!TALI-BOX]) ← ציטוט רגיל; ציפת תמונה (wrap-left/right) ← תמונה רגילה.
// הסדר: מלמטה למעלה, כדי שכל הוספה לא תזיז את המקומות של אלה שמעליה.
import { isTaliBox, contentWithoutMarker } from './text-box.js';

// הטקסט של תיבה או הערה כפסקאות: הקידומת בשורה הראשונה, שורות ריקות מדולגות
export function noteParagraphs(object) {
  const text = String(object.text || '').trim();
  const prefix = object.kind === 'textbox' ? 'תיבת טקסט: '
    : object.quote ? `הערה על „${object.quote}“: ` : 'הערה: ';
  const lines = text ? text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
  if (!lines.length) return object.kind === 'comment' && object.quote ? [prefix.replace(/: $/, '')] : [];
  return [prefix + lines[0], ...lines.slice(1)];
}

// SVG -> בייטים של PNG, בצפיפות כפולה (חדות במסכים עם הגדלה)
export async function svgToPng({ svg, w, h }, scale = 2) {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

// מיקום של גוש חדש לפי גובה בדף: אחרי הגוש העליון שבגובה הזה (או לפני הראשון, אם מעליו)
function blockPosAt(editor, page, y) {
  const { doc } = editor.state;
  const r = page.getBoundingClientRect();
  const first = editor.view.dom.firstElementChild?.getBoundingClientRect();
  if (!first || r.top + y < first.top) return 0;
  const hit = editor.view.posAtCoords({ left: r.left + r.width / 2, top: r.top + y });
  if (!hit) return doc.content.size;
  const $pos = doc.resolve(hit.inside >= 0 ? hit.inside : hit.pos);
  return $pos.depth >= 1 ? $pos.after(1) : Math.min(doc.content.size, hit.pos);
}

function insertBlocks(editor, page, y, nodes) {
  if (!nodes.length) return;
  const at = blockPosAt(editor, page, y);
  editor.commands.command(({ tr, dispatch }) => {
    tr.insert(at, nodes);
    if (dispatch) dispatch(tr);
    return true;
  });
}

// בתוך הטקסט: מסגרות ← ציטוט רגיל, ציפת תמונה ← בלי ציפה. טרנזקציה אחת.
function plainInText(editor) {
  editor.commands.command(({ tr, state, dispatch }) => {
    const markers = [];
    state.doc.descendants((node, pos) => {
      if (isTaliBox(node)) markers.push({ pos, node });
      if (node.type.name === 'embed') {
        const parts = node.attrs.target.split('|');
        if (parts.length > 2) tr.setNodeMarkup(pos, undefined, { ...node.attrs, target: parts.slice(0, 2).join('|') });
      }
      if (node.type.name === 'image' && node.attrs.wrap && node.attrs.wrap !== 'none') {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, wrap: 'none' });
      }
    });
    // מסגרת ← ציטוט רגיל עם אותו טקסט (בלי הסימון); מסגרת ריקה ← פסקה ריקה. מהסוף להתחלה, כדי שהמיקומים לא יזוזו
    for (const m of markers.reverse()) {
      const content = contentWithoutMarker(m.node);
      tr.replaceWith(m.pos, m.pos + m.node.nodeSize, content.length
        ? m.node.type.create(m.node.attrs, content)
        : state.schema.nodes.paragraph.create());
    }
    if (dispatch) dispatch(tr);
    return true;
  });
}

// overlay: getItems/exportShapes/setItems. saveDrawing(bytes) -> יעד ל־![[...]] של קובץ ה־PNG שנשמר.
export async function convertToPlainMarkdown({ editor, overlay, page, saveDrawing }) {
  const { schema } = editor.state;
  const items = overlay.getItems();
  const shapes = overlay.exportShapes();
  const entries = [];
  if (shapes) {
    const target = await saveDrawing(await svgToPng(shapes));
    entries.push({ y: shapes.y, kind: 'drawing', target, width: shapes.w });
  }
  for (const o of items) {
    if (o.kind === 'image') entries.push({ y: o.y, kind: 'image', o });
    else if (o.kind === 'textbox' || o.kind === 'comment') entries.push({ y: o.y, kind: 'note', o });
  }
  entries.sort((a, b) => b.y - a.y);
  // 8.4: y בקואורדינטות השכבה; הגובה על המסך לפי קנה המידה של הדף
  for (const e of entries) e.y = overlay.toScreen ? overlay.toScreen(e.y) : e.y;
  const r = () => page.getBoundingClientRect();
  const counts = { images: 0, notes: 0, drawings: 0 };
  for (const e of entries) {
    if (e.kind === 'image') {
      const w = Math.max(60, Math.min(1400, Math.round(e.o.width || 300)));
      const node = e.o.ref === 'md'
        ? schema.nodes.image?.create({ src: e.o.src, alt: e.o.alt || '', width: w })
        : schema.nodes.embed?.create({ target: `${e.o.src}|${w}` });
      if (node) { insertBlocks(editor, page, e.y, [schema.nodes.paragraph.create(null, node)]); counts.images++; }
    } else if (e.kind === 'note') {
      const nodes = noteParagraphs(e.o).map((line) => schema.nodes.paragraph.create(null, schema.text(line)));
      if (nodes.length) { insertBlocks(editor, page, e.y, nodes); counts.notes++; }
    } else {
      const w = Math.max(60, Math.min(1400, Math.round(e.width)));
      insertBlocks(editor, page, e.y, [schema.nodes.paragraph.create(null, schema.nodes.embed.create({ target: `${e.target}|${w}` }))]);
      counts.drawings++;
    }
  }
  plainInText(editor);
  overlay.setItems([]);
  return counts;
}
