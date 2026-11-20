// שמירה נאמנה של Markdown בסגנון אובסידיאן.
// העורך הופך את הקובץ למסמך ואז כותב אותו מחדש. הקובץ הזה דואג שמה שלא נערך ייכתב חזרה כמו שהיה:
// ירידות שורה, תחביר שהעורך לא מכיר (הערות שוליים, נוסחאות, callouts, HTML), ובלי תווי בריחה מיותרים.
import { Extension, Node, getHTMLFromFragment } from '@tiptap/core';
import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Heading from '@tiptap/extension-heading';
import Paragraph from '@tiptap/extension-paragraph';
import Link from '@tiptap/extension-link';
import { Fragment } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { defaultMarkdownSerializer } from 'prosemirror-markdown';
import { renderMath } from './math.js';

// תגיות HTML שהעורך יודע לייצג (ומייצר בעצמו בשמירה של צבע, יישור וקו תחתון).
// כל תגית אחרת נשמרת כמו שהיא, כקטע HTML גולמי.
const KNOWN_BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'mark', 'u', 's', 'strong', 'em', 'br',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'colgroup', 'col', 'blockquote', 'pre', 'code', 'hr', 'label', 'input']);
// input: תיבת הסימון שתוסף רשימת המשימות של markdown-it מייצר
const KNOWN_INLINE_TAGS = new Set(['span', 'mark', 'u', 'br', 'input']);
const tagNames = (html) => [...html.matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map((m) => m[1].toLowerCase());

// ===== markdown-it: כללים שמוסיפים פעם אחת =====
function setupMarkdownIt(md) {
  if (md.__obsidian) return;
  md.__obsidian = true;
  const esc = md.utils.escapeHtml;

  // הגדרות קישור בסגנון [x]: url בולעות הערות שוליים ([^1]: ...). באובסידיאן כמעט לא משתמשים בהן.
  md.block.ruler.disable('reference');

  // כתובת של קישור או תמונה נשארת כמו שנכתבה. ברירת המחדל של markdown-it מקודדת אותה,
  // ואז קישור לוויקיפדיה בעברית נשמר כ־%D7%9C%D7%99... (נמצא בבדיקת השמירה מול הכספת, 4.4)
  md.normalizeLink = (url) => url;

  // קטעים שנשארים טקסט מילולי, כדי ש־* או _ בתוכם לא יהפכו לעיצוב:
  // $נוסחה$, $$נוסחה$$, %%הערה נסתרת%%, ו־[]() ריק מתבנית
  md.inline.ruler.before('emphasis', 'obsidian_literal', (state, silent) => {
    const src = state.src;
    const pos = state.pos;
    let end = -1;
    if (src.startsWith('$$', pos)) {
      const close = src.indexOf('$$', pos + 2);
      if (close > pos + 2) end = close + 2;
    } else if (src[pos] === '$' && src[pos + 1] && !/\s/.test(src[pos + 1])) {
      // כמו באובסידיאן: לא נגמר ברווח, ולא מיד אחריו ספרה (כדי ש־$5 ו־$10 לא ייחשבו נוסחה)
      for (let i = pos + 1; i < src.length && src[i] !== '\n'; i++) {
        if (src[i] === '\\') { i++; continue; }
        if (src[i] === '$') {
          if (!/\s/.test(src[i - 1]) && !/\d/.test(src[i + 1] || '')) end = i + 1;
          break;
        }
      }
    } else if (src.startsWith('%%', pos)) {
      const close = src.indexOf('%%', pos + 2);
      if (close >= 0) end = close + 2;
    } else if (src[pos] === '[') {
      // [טקסט]() עם כתובת ריקה (מתבנית "ביבליוגרפיה") נשאר טקסט כמו שהוא
      const m = /^\[[^\[\]\n]*\]\(\)/.exec(src.slice(pos, pos + 300));
      if (m) end = pos + m[0].length;
    }
    if (end < 0) return false;
    // 9.9: נוסחה ($...$ או $$...$$ בשורה) הופכת לצומת mathInline. content הוא המקור המלא, כדי
    // ש־isPlainInline ידע שאפשר לכתוב אותו חזרה כמו שהוא.
    if (!silent && src[pos] === '$') {
      const display = src.startsWith('$$', pos);
      const tex = src.slice(pos + (display ? 2 : 1), end - (display ? 2 : 1));
      const t = state.push('math_inline', '', 0);
      t.content = src.slice(pos, end);
      t.meta = { tex, display };
    } else if (!silent) state.push('text', '', 0).content = src.slice(pos, end);
    state.pos = end;
    return true;
  });

  // גוש נוסחה על כמה שורות: $$ ... $$. נשמר מילה במילה.
  md.block.ruler.before('paragraph', 'math_block', (state, startLine, endLine, silent) => {
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;
    const first = state.src.slice(state.bMarks[startLine] + state.tShift[startLine], state.eMarks[startLine]).trim();
    if (!first.startsWith('$$')) return false;
    if (first.length > 2 && first.slice(2).includes('$$')) return false; // שורה אחת: מטופל כטקסט בשורה
    let line = startLine;
    for (;;) {
      line++;
      if (line >= endLine || state.sCount[line] < state.blkIndent) return false;
      const text = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
      if (text.includes('$$')) break;
    }
    if (silent) return true;
    const token = state.push('math_block', '', 0);
    token.block = true;
    token.content = state.getLines(startLine, line + 1, state.blkIndent, false).replace(/\n$/, '');
    token.map = [startLine, line + 1];
    state.line = line + 1;
    return true;
  }, { alt: ['paragraph', 'blockquote', 'list'] });
  md.renderer.rules.math_inline = (tokens, i) =>
    `<span data-math="" data-tex="${esc(tokens[i].meta.tex)}"${tokens[i].meta.display ? ' data-display="1"' : ''}></span>`;
  md.renderer.rules.math_block = (tokens, i) =>
    `<div data-raw-block="${esc(tokens[i].content)}" data-kind="math"></div>`;

  // זוכרים איך נכתבו קו מפריד (---- או ***) וכותרת עם קו תחתון (טקסט ואז ===), כדי לכתוב אותם חזרה אותו דבר
  md.core.ruler.push('obsidian_markup', (state) => {
    const lines = state.src.split('\n');
    for (const t of state.tokens) {
      if (t.type === 'hr') t.attrSet('data-markup', lines[t.map[0]].trim());
      if (t.type === 'heading_open' && (t.markup === '=' || t.markup === '-')) {
        t.attrSet('data-setext', lines[t.map[1] - 1].trim());
      }
    }
  });

  // HTML שהעורך לא מכיר נשמר כגוש גולמי במקום להימחק
  const defaultBlock = md.renderer.rules.html_block || ((t, i) => t[i].content);
  // הערות HTML (<!-- -->, למשל של תוסף החזרה המרווחת) תמיד נשמרות
  md.renderer.rules.html_block = (tokens, i, ...rest) => {
    const html = tokens[i].content;
    if (/\bdata-tali-image\s*=\s*["']?1\b/.test(html)) return defaultBlock(tokens, i, ...rest);
    // רשימת משימות עם כיוון נשמרת כ־HTML של TipTap, ובו <div> סביב התוכן של כל פריט.
    // בלי החריג הזה הרשימה של Tali עצמה נטענת כגוש נעול שאי אפשר לערוך.
    const taskListHtml = /^\s*<ul\b[^>]*\bdata-type=["']taskList["']/.test(html);
    const known = (t) => KNOWN_BLOCK_TAGS.has(t) || (taskListHtml && t === 'div');
    if (!html.includes('<!--') && tagNames(html).every(known)) return defaultBlock(tokens, i, ...rest);
    return `<div data-raw-html="${esc(html.replace(/\n+$/, ''))}"></div>`;
  };
  const defaultInline = md.renderer.rules.html_inline || ((t, i) => t[i].content);
  md.renderer.rules.html_inline = (tokens, i, ...rest) => {
    const html = tokens[i].content;
    if (/\bdata-tali-image\s*=\s*["']?1\b/.test(html)) return defaultInline(tokens, i, ...rest);
    if (!html.includes('<!--') && tagNames(html).every((t) => KNOWN_INLINE_TAGS.has(t))) return defaultInline(tokens, i, ...rest);
    return `<span data-raw-inline="${esc(html)}"></span>`;
  };
}

// האם אפשר לכתוב את הטקסט כמו שהוא, בלי תווי בריחה, והוא ייקרא חזרה כטקסט רגיל?
function isPlainInline(md, text) {
  const tokens = md.parseInline(text, {})[0]?.children || [];
  return tokens.every((t) => t.type === 'text' || t.type === 'math_inline') && tokens.map((t) => t.content).join('') === text;
}
// בתחילת שורה, דברים שייקראו כמבנה (כותרת, רשימה, ציטוט...) ולכן חייבים בריחה
const BLOCK_START = /^(#{1,6}(\s|$)|[-+*](\s|$)|\d{1,9}[.)](\s|$)|>|`{3}|~{3}|[=-]{3,}\s*$|\s{4}|\|)/;

// ===== טקסט: בריחה רק כשבאמת צריך =====
export const FaithfulText = Text.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state, node, parent) {
          const text = node.text;
          // כתובת שהפכה לקישור אוטומטית נכתבת כמו שהיא
          if (node.marks.some((m) => m.type.name === 'link' && m.attrs.href === text)) { state.text(text, false); return; }
          const md = this.editor.storage.markdown.parser.md;
          const atLineStart = state.atBlank() || state.out.endsWith('\n' + (state.delim || ''));
          // * או _ בקצה, צמוד לטקסט מעוצב, עלול להתחבר לסימני העיצוב שלידו
          const risky = parent.childCount > 1 && /^[*_~`=]|[*_~`=]$/.test(text);
          if (!risky && isPlainInline(md, text) && !(atLineStart && BLOCK_START.test(text))) {
            state.text(text, false);
          } else {
            // ברירת המחדל של tiptap-markdown
            state.text(text.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
          }
        },
        parse: {},
      },
    };
  },
});

// ===== ירידת שורה בודדת נשמרת כירידת שורה (כמו באובסידיאן), לא כ־\ =====
export const FaithfulHardBreak = HardBreak.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state, node, parent, index) {
          for (let i = index + 1; i < parent.childCount; i++) {
            if (parent.child(i).type !== node.type) {
              if (state.inTable) { state.write('<br>'); return; }
              state.write('\n');
              // מוסיפים כבר עכשיו את הסימון של השורה (> בציטוט, הזחה ברשימה).
              // אחרת tiptap-markdown מחשב לא נכון את מיקום ** בתחילת השורה הבאה ומכפיל אותם.
              state.out += state.delim || '';
              return;
            }
          }
          // ירידות שורה בסוף פסקה: אין להן ייצוג ב־Markdown, ולכן לא נכתבות
        },
        parse: {},
      },
    };
  },
});

// ===== קישור רגיל [טקסט](כתובת) =====
// כתובת חשופה (https://...) נשארת חשופה ולא הופכת ל־<https://...>. כל כתובת מותרת (גם data:),
// כי אלה הקבצים של המשתמש; פתיחה בלחיצה מותרת רק לאינטרנט (main.js).
export const FaithfulLink = Link.extend({
  addOptions() {
    return { ...this.parent?.(), openOnClick: true, autolink: true, linkOnPaste: true, isAllowedUri: () => true };
  },
  addStorage() {
    const isBare = (mark, parent, index) => {
      const child = parent.child(index);
      return child.isText && child.text === mark.attrs.href && /^https?:\/\/\S+$/i.test(mark.attrs.href);
    };
    const href = (h) => {
      const opens = (h.match(/\(/g) || []).length;
      const closes = (h.match(/\)/g) || []).length;
      return opens === closes && !/\s/.test(h) ? h : h.replace(/[()]/g, '\\$&').replace(/ /g, '%20');
    };
    return {
      markdown: {
        serialize: {
          open(state, mark, parent, index) {
            state.bareLink = isBare(mark, parent, index);
            return state.bareLink ? '' : '[';
          },
          close(state, mark) {
            const bare = state.bareLink;
            state.bareLink = false;
            if (bare) return '';
            const title = mark.attrs.title ? ` "${mark.attrs.title.replace(/"/g, '\\"')}"` : '';
            return `](${href(mark.attrs.href || '')}${title})`;
          },
          mixable: true,
        },
        parse: {},
      },
    };
  },
});

// ===== קו מפריד: נשמר בצורה שבה נכתב =====
export const FaithfulHorizontalRule = HorizontalRule.extend({
  addAttributes() {
    return { markup: { default: null, parseHTML: (el) => el.getAttribute('data-markup'), renderHTML: () => ({}) } };
  },
  addStorage() {
    return {
      markdown: {
        serialize(state, node) { state.write(node.attrs.markup || '---'); state.closeBlock(node); },
        parse: {},
      },
    };
  },
});

// ל־Markdown אין תחביר ליישור. כשיש יישור מפורש שומרים את הגוש כ־HTML מלא;
// כך style="text-align:…" והעיצוב שבתוך השורה נטענים שוב אחרי סגירה ופתיחה.
function serializeAlignedBlock(state, node) {
  if (!node.attrs.textAlign) return false;
  state.write(getHTMLFromFragment(Fragment.from(node), node.type.schema));
  state.closeBlock(node);
  return true;
}

export const FaithfulParagraph = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state, node, parent, index) {
          if (!serializeAlignedBlock(state, node)) defaultMarkdownSerializer.nodes.paragraph(state, node, parent, index);
        },
        parse: {},
      },
    };
  },
});

// ===== כותרת: אם נכתבה עם קו תחתון (=== או ---) נשמרת כך =====
export const FaithfulHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      setext: { default: null, parseHTML: (el) => el.getAttribute('data-setext'), renderHTML: () => ({}) },
    };
  },
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          if (serializeAlignedBlock(state, node)) return;
          const u = node.attrs.setext;
          const fits = u && ((node.attrs.level === 1 && u[0] === '=') || (node.attrs.level === 2 && u[0] === '-'));
          if (fits) {
            state.renderInline(node);
            state.ensureNewLine();
            state.write(u);
          } else {
            state.write('#'.repeat(node.attrs.level) + ' ');
            state.renderInline(node);
          }
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

// ===== גוש גולמי: HTML שהעורך לא מכיר (למשל <center>), או נוסחה $$ על כמה שורות =====
// נשמר בדיוק כמו שהיה. עריכה שלו: במצב Markdown.
export const RawHtmlBlock = Node.create({
  name: 'rawHtmlBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      html: { default: '', parseHTML: (el) => el.getAttribute('data-raw-html') ?? el.getAttribute('data-raw-block') },
      kind: { default: 'html', parseHTML: (el) => el.getAttribute('data-kind') || 'html' },
    };
  },
  parseHTML() { return [{ tag: 'div[data-raw-html]' }, { tag: 'div[data-raw-block]' }]; },
  renderHTML({ node }) {
    return node.attrs.kind === 'html'
      ? ['div', { 'data-raw-html': node.attrs.html }]
      : ['div', { 'data-raw-block': node.attrs.html, 'data-kind': node.attrs.kind }];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.title = 'לעריכה: מצב Markdown';
      if (node.attrs.kind === 'math') {
        // $$...$$: מוצג מעובד (KaTeX). המקור נשמר כמו שהוא; לחיצה פותחת את חלונית הנוסחה (math.js).
        dom.title = '';
        dom.dataset.tip = 'לחיצה לעריכה';
        dom.className = 'math-block';
        const tex = node.attrs.html.replace(/^\s*\$\$/, '').replace(/\$\$\s*$/, '');
        const html = renderMath(tex, true);
        if (html) { dom.classList.add('rendered'); dom.innerHTML = html; dom.dataset.source = node.attrs.html; }
        else dom.textContent = node.attrs.html;
      } else {
        dom.className = 'raw-html';
        dom.innerHTML = node.attrs.html; // קבצים של המשתמש; סקריפטים חסומים ב־CSP
      }
      return { dom };
    };
  },
  addStorage() {
    return {
      markdown: {
        // text ולא write, כדי שבתוך ציטוט או רשימה כל שורה תקבל את הסימון שלה (> או הזחה)
        serialize(state, node) { state.text(node.attrs.html, false); state.closeBlock(node); },
        parse: {},
      },
    };
  },
});

// ===== תגית HTML בתוך שורה (למשל <i> או <sup>) =====
export const RawHtmlInline = Node.create({
  name: 'rawHtmlInline',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { html: { default: '', parseHTML: (el) => el.getAttribute('data-raw-inline') } };
  },
  parseHTML() { return [{ tag: 'span[data-raw-inline]' }]; },
  renderHTML({ node }) { return ['span', { 'data-raw-inline': node.attrs.html, class: 'raw-inline' }, node.attrs.html]; },
  renderText({ node }) { return node.attrs.html; },
  addStorage() {
    return {
      markdown: {
        serialize(state, node) { state.write(node.attrs.html); },
        parse: {},
      },
    };
  },
});

// ===== הכללים של markdown-it + עיצוב callouts =====
const CALLOUT = /^\[!([\w-]+)\][+-]?/;
export const ObsidianMarkdown = Extension.create({
  name: 'obsidianMarkdown',
  // רשימת משימות "צפופה" (בלי שורה ריקה בין פריטים) נשארת צפופה, כמו רשימה רגילה
  addGlobalAttributes() {
    return [{
      types: ['taskList'],
      attributes: {
        tight: {
          default: true,
          parseHTML: (el) => el.getAttribute('data-tight') === 'true' || !el.querySelector('p'),
          renderHTML: (a) => (a.tight ? { 'data-tight': 'true' } : {}),
        },
      },
    }];
  },
  addStorage() {
    return {
      markdown: {
        parse: {
          setup(md) { setupMarkdownIt(md); },
          // פריט ריק "- [ ]" בסוף רשימת משימות לא מזוהה כמשימה, ואז הרשימה נשברת לשתיים
          updateDOM(element) {
            for (const li of element.querySelectorAll('ul.contains-task-list > li:not(.task-list-item)')) {
              const m = /^\[( |x|X)\]$/.exec(li.textContent.trim());
              if (!m) continue;
              li.className = 'task-list-item';
              li.innerHTML = `<input class="task-list-item-checkbox" type="checkbox"${m[1] === ' ' ? '' : ' checked'}>`;
            }
            // 11.2: רשימה מעורבת ("- פריט" ואחריו "- [ ] משימה") נפתחה כמשימה ריקה מיותרת, רשימה רגילה ומשימות.
            // מפצלים לרצפים: פריטים רגילים ← רשימה רגילה, משימות ← רשימת משימות, באותו סדר.
            for (const ul of element.querySelectorAll('ul.contains-task-list')) {
              const items = [...ul.children];
              if (items.every((li) => li.classList.contains('task-list-item'))) continue;
              const runs = [];
              for (const li of items) {
                const task = li.classList.contains('task-list-item');
                if (!runs.length || runs[runs.length - 1].task !== task) runs.push({ task, items: [] });
                runs[runs.length - 1].items.push(li);
              }
              for (const run of runs) {
                const part = element.ownerDocument.createElement('ul');
                // data-tight וכו' עוברים לכל חלק, אחרת רשימה צפופה נשמרת עם שורות ריקות בין הפריטים
                for (const attr of ul.attributes) if (attr.name !== 'class') part.setAttribute(attr.name, attr.value);
                if (run.task) part.className = 'contains-task-list';
                part.append(...run.items);
                ul.before(part);
              }
              ul.remove();
            }
          },
        },
      },
    };
  },
  // ציטוט שמתחיל ב־[!NOTE] מוצג כ־callout. בקובץ הוא נשאר ציטוט רגיל, בדיוק כמו באובסידיאן.
  addProseMirrorPlugins() {
    const build = (doc) => {
      const decos = [];
      doc.descendants((node, pos) => {
        if (node.type.name !== 'blockquote') return true;
        const para = node.firstChild;
        const m = para?.textContent.match(CALLOUT);
        if (!m) return true;
        decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'callout', 'data-callout': m[1].toLowerCase() }));
        // הסימון [!TIP] קטן ואפור, והכותרת (עד ירידת השורה הראשונה) מודגשת
        const start = pos + 2; // תחילת הטקסט בפסקה הראשונה
        decos.push(Decoration.inline(start, start + m[0].length, { class: 'callout-marker' }));
        let titleEnd = start + para.content.size;
        para.forEach((child, offset) => {
          if (child.type.name === 'hardBreak' && start + offset < titleEnd) titleEnd = start + offset;
        });
        if (titleEnd > start + m[0].length) decos.push(Decoration.inline(start + m[0].length, titleEnd, { class: 'callout-title' }));
        return true;
      });
      return DecorationSet.create(doc, decos);
    };
    return [new Plugin({
      state: {
        init: (_, { doc }) => build(doc),
        apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
      },
      props: { decorations(state) { return this.getState(state); } },
    })];
  },
});

// ===== מאפיינים (frontmatter) =====
// הגוש --- בראש הקובץ לא נכנס לעורך בכלל. הוא נשמר בצד ומוחזר לראש הקובץ בשמירה.
export function splitFrontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(md || '');
  if (!m) return { frontmatter: null, body: md || '' };
  return { frontmatter: m[1], body: md.slice(m[0].length) };
}
export function joinFrontmatter(frontmatter, body) {
  if (frontmatter == null) return body;
  return `---\n${frontmatter}\n---\n${body}`;
}
