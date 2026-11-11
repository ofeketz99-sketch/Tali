// תצוגה לקריאה בלבד של הערה אחרת: תצוגה מקדימה בריחוף על קישור, והטמעת ![[הערה]].
// HTML מהקובץ לא מורץ (html: false). קישורי [[...]], תמונות ![[...]] ונוסחאות $...$ מוצגים בעצמנו.
import MarkdownIt from 'markdown-it';
import { renderMath } from './math.js';
import { splitOverlay } from './overlay-data.js';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const FM_RE = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;

let resolveImpl = () => null;
let fileUrlImpl = (p) => p;

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
md.inline.ruler.before('link', 'tali_wiki', (state, silent) => {
  const src = state.src, start = state.pos;
  const embed = src.startsWith('![[', start);
  if (!embed && !src.startsWith('[[', start)) return false;
  const open = start + (embed ? 3 : 2);
  const end = src.indexOf(']]', open);
  if (end < 0) return false;
  const inner = src.slice(open, end);
  if (!inner.trim() || /[\[\]\n]/.test(inner)) return false;
  if (!silent) state.push('tali_wiki', '', 0).meta = { inner, embed };
  state.pos = end + 2;
  return true;
});
md.inline.ruler.before('escape', 'tali_math', (state, silent) => {
  const src = state.src, pos = state.pos;
  if (src[pos] !== '$') return false;
  const display = src[pos + 1] === '$';
  let end = -1;
  if (display) { const c = src.indexOf('$$', pos + 2); if (c > pos + 2) end = c; }
  else if (src[pos + 1] && !/\s/.test(src[pos + 1])) {
    for (let i = pos + 1; i < src.length && src[i] !== '\n'; i++) {
      if (src[i] === '\\') { i++; continue; }
      if (src[i] === '$') { if (!/\s/.test(src[i - 1]) && !/\d/.test(src[i + 1] || '')) end = i; break; }
    }
  }
  if (end < 0) return false;
  if (!silent) state.push('tali_math', '', 0).meta = { tex: src.slice(pos + (display ? 2 : 1), end), display };
  state.pos = end + (display ? 2 : 1);
  return true;
});
md.renderer.rules.tali_wiki = (tokens, i) => {
  const { inner, embed } = tokens[i].meta;
  const [target, ...rest] = inner.split('|');
  const esc = md.utils.escapeHtml;
  const path = resolveImpl(target);
  if (embed && path && IMAGE_EXT.test(path)) {
    const w = /^\d+$/.test(rest[0] || '') ? ` style="width:${Math.min(Number(rest[0]), 600)}px"` : '';
    return `<img src="${esc(fileUrlImpl(path))}" alt="${esc(target)}"${w}>`;
  }
  const label = !embed && rest.length ? rest.join('|') : target.split('/').pop();
  return `<span class="np-link${path ? '' : ' unresolved'}" data-target="${esc(target)}">${esc(label)}</span>`;
};
md.renderer.rules.tali_math = (tokens, i) => {
  const { tex, display } = tokens[i].meta;
  return renderMath(tex, display) || md.utils.escapeHtml(tex);
};
// $$ על כמה שורות
md.block.ruler.before('paragraph', 'tali_math_block', (state, startLine, endLine, silent) => {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  if (!state.src.startsWith('$$', start)) return false;
  let line = startLine, close = -1;
  const firstRest = state.src.slice(start + 2, state.eMarks[startLine]);
  if (firstRest.includes('$$')) { close = startLine; }
  else for (line = startLine + 1; line < endLine; line++) {
    const s = state.bMarks[line] + state.tShift[line];
    if (state.src.slice(s, state.eMarks[line]).includes('$$')) { close = line; break; }
  }
  if (close < 0) return false;
  if (silent) return true;
  const text = state.getLines(startLine, close + 1, 0, false).trim();
  state.push('tali_math_block', '', 0).content = text.replace(/^\$\$/, '').replace(/\$\$$/, '');
  state.line = close + 1;
  return true;
});
md.renderer.rules.tali_math_block = (tokens, i) => renderMath(tokens[i].content, true) || `<pre>${md.utils.escapeHtml(tokens[i].content)}</pre>`;

// את החלק שאחרי כותרת מסוימת, עד הכותרת הבאה מאותה רמה או גבוהה יותר (![[הערה#כותרת]])
export function sectionOf(markdown, heading) {
  if (!heading) return markdown;
  const want = heading.trim().toLowerCase();
  const lines = markdown.split(/\r?\n/);
  let start = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i]);
    if (!m) continue;
    if (start < 0) { if (m[2].trim().toLowerCase() === want) { start = i; level = m[1].length; } }
    else if (m[1].length <= level) return lines.slice(start, i).join('\n');
  }
  return start < 0 ? null : lines.slice(start).join('\n');
}

// markdown: התוכן המלא של ההערה. limit: מספר תווים מקסימלי (לתצוגה מקדימה).
export function renderNoteHtml(markdown, { resolve, fileUrl, heading, limit } = {}) {
  resolveImpl = resolve || (() => null);
  fileUrlImpl = fileUrl || ((p) => p);
  let text = splitOverlay(markdown || '').markdown.replace(FM_RE, '').replace(/%%[\s\S]*?%%/g, '');
  if (heading) {
    const part = sectionOf(text, heading);
    if (part == null) return `<p class="np-empty">הכותרת "${md.utils.escapeHtml(heading)}" לא נמצאה</p>`;
    text = part;
  }
  let cut = false;
  if (limit && text.length > limit) {
    const at = text.lastIndexOf('\n', limit);
    text = text.slice(0, at > limit * 0.5 ? at : limit);
    cut = true;
  }
  if (!text.trim()) return '<p class="np-empty">המסמך ריק</p>';
  // "- [ ] משימה" מוצגת עם תיבה, כמו בעורך
  const html = md.render(text).replace(/<li>(<p>)?\[([ xX])\]\s?/g, (_m, p, mark) =>
    `<li class="np-task">${p || ''}${mark === ' ' ? '☐' : '☑'} `);
  return html + (cut ? '<p class="np-more">…</p>' : '');
}
