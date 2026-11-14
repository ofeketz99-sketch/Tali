// מעבר בין התצוגה המעוצבת לתצוגת Markdown בלי לאבד את המקום: מוצאים את הגוש שבראש החלון
// (ואיזה חלק ממנו כבר גלול מעלה), מחשבים איפה הוא מתחיל בטקסט, וגוללים כך שאותו מקום נשאר בראש החלון.
// עד 7.2 תיבת הטקסט הייתה תיבת גלילה נפרדת בגובה 900px, והמיקוד בה הקפיץ את הסמן לסוף המסמך.

const clamp01 = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const skipSpace = (text, at) => { while (at < text.length && /\s/.test(text[at])) at++; return at; };

// תיבת הטקסט גדלה לגובה התוכן, כך שגוללים את הדף (כמו בתצוגה המעוצבת) ולא את התיבה
export function fitRaw(textarea, scroller) {
  const keep = scroller?.scrollTop;
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
  if (scroller && scroller.scrollTop !== keep) scroller.scrollTop = keep;
}

// מראה (div בלתי נראה באותו עיצוב ורוחב) שמודד את הגובה שבו מתחיל תו מסוים בתיבת הטקסט
function textMirror(textarea) {
  const cs = getComputedStyle(textarea);
  const div = document.createElement('div');
  for (const p of ['boxSizing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'tabSize',
    'direction', 'unicodeBidi', 'textAlign', 'whiteSpace', 'overflowWrap', 'wordBreak']) div.style[p] = cs[p];
  Object.assign(div.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-99999px', width: textarea.offsetWidth + 'px', height: 'auto' });
  document.body.appendChild(div);
  const text = textarea.value;
  return {
    yOf(offset) {
      div.textContent = text.slice(0, offset);
      const mark = document.createElement('span');
      mark.textContent = '​';
      div.appendChild(mark);
      return mark.offsetTop;
    },
    // התו הראשון בשורה שמתחילה בגובה y או מעליו
    offsetAt(y) {
      const starts = [0];
      for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (this.yOf(starts[mid]) <= y) lo = mid; else hi = mid - 1;
      }
      return starts[lo];
    },
    remove: () => div.remove(),
  };
}

// היכן בקובץ מתחיל כל גוש עליון במסמך (head: מה שבא לפני הגוף, כמו המאפיינים)
function blockOffsets(editor, head, text) {
  const { doc } = editor.state;
  const serialize = (fragment) => editor.storage.markdown.serializer.serialize(fragment);
  const starts = [];
  doc.forEach((node, pos) => starts.push(pos));
  const cache = new Map();
  const at = (i) => {
    if (i >= starts.length) return text.length;
    if (!cache.has(i)) cache.set(i, i === 0 ? skipSpace(text, head) : skipSpace(text, Math.min(text.length, head + serialize(doc.content.cut(0, starts[i])).length)));
    return cache.get(i);
  };
  return { count: starts.length, starts, at };
}

const topOf = (scroller) => scroller.getBoundingClientRect().top;
const scrollBy = (scroller, dy) => { if (Math.abs(dy) >= 1) scroller.scrollTo({ top: scroller.scrollTop + dy, behavior: 'instant' }); };

// לפני המעבר מהתצוגה המעוצבת: הגוש בראש החלון וכמה ממנו כבר גלול
export function richAnchor(editor, scroller) {
  if (!scroller || scroller.scrollTop <= 1) return null;
  const top = topOf(scroller);
  let found = null;
  editor.state.doc.forEach((node, pos, index) => {
    if (found) return;
    const dom = editor.view.nodeDOM(pos);
    if (!dom?.getBoundingClientRect) return;
    const r = dom.getBoundingClientRect();
    // הגוש הראשון עוד מתחת לראש החלון: רק הכותרת גלולה, והיא זהה בשתי התצוגות
    if (r.bottom > top) found = index === 0 && r.top >= top ? { keep: scroller.scrollTop } : { index, frac: clamp01((top - r.top) / r.height) };
  });
  return found;
}

// אחרי שתיבת הטקסט מוצגת: גוללים לאותו מקום בטקסט. מחזיר את התו שבו כדאי לשים את הסמן.
export function showRichAnchorInRaw(anchor, editor, textarea, scroller, head) {
  if (!anchor || anchor.keep != null) { scroller?.scrollTo({ top: anchor?.keep ?? 0, behavior: 'instant' }); return 0; }
  const offsets = blockOffsets(editor, head, textarea.value);
  const start = offsets.at(anchor.index), end = offsets.at(anchor.index + 1);
  const mirror = textMirror(textarea);
  const y0 = mirror.yOf(start), y1 = end > start ? mirror.yOf(end) : y0;
  mirror.remove();
  const y = textarea.getBoundingClientRect().top + y0 + anchor.frac * (y1 - y0);
  scrollBy(scroller, y - topOf(scroller));
  return start;
}

// לפני המעבר מתצוגת Markdown: התו בראש החלון והגובה המדויק בתוך הטקסט
export function rawAnchor(textarea, scroller) {
  if (!scroller || scroller.scrollTop <= 1) return null;
  const y = topOf(scroller) - textarea.getBoundingClientRect().top;
  if (y <= 0) return { keep: scroller.scrollTop };
  const mirror = textMirror(textarea);
  return { y, mirror };
}

// אחרי שהטקסט נטען לעורך (תיבת הטקסט עדיין מוצגת): איזה גוש עליון היה בראש החלון
export function rawAnchorToBlock(anchor, editor, textarea, head) {
  if (!anchor || anchor.keep != null) return anchor;
  const { mirror, y } = anchor;
  try {
    const offsets = blockOffsets(editor, head, textarea.value);
    if (!offsets.count) return null;
    const offset = mirror.offsetAt(y);
    let lo = 0, hi = offsets.count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets.at(mid) <= offset) lo = mid; else hi = mid - 1;
    }
    const y0 = mirror.yOf(offsets.at(lo)), y1 = mirror.yOf(offsets.at(lo + 1));
    return { index: lo, pos: offsets.starts[lo], frac: y1 > y0 ? clamp01((y - y0) / (y1 - y0)) : 0 };
  } finally {
    mirror.remove();
  }
}

// אחרי שהתצוגה המעוצבת מוצגת: גוללים כך שאותו גוש (ואותו חלק בו) בראש החלון
export function showBlockInRich(block, editor, scroller) {
  if (!scroller) return;
  if (!block || block.keep != null) { scroller.scrollTo({ top: block?.keep ?? 0, behavior: 'instant' }); return; }
  const dom = editor.view.nodeDOM(block.pos);
  if (!dom?.getBoundingClientRect) return;
  const r = dom.getBoundingClientRect();
  scrollBy(scroller, r.top + block.frac * r.height - topOf(scroller));
}
