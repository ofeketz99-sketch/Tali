// נוסחאות LaTeX (KaTeX). מ־9.9 נוסחה בתוך שורה היא אובייקט אטומי בעורך (mathInline), ולא טקסט:
// - בקובץ היא נשארת $...$ (או $$...$$ בתוך שורה), כמו באובסידיאן. הקריאה והכתיבה ב־obsidian-md.js.
// - הקלדת $ פותחת חלונית עם תיבת LTR לכתיבת המקור, עם תצוגה מקדימה. כך אין יותר ערבוב כיוונים
//   של מקור LaTeX בתוך פסקה בעברית.
// - לחיצה על נוסחה פותחת את החלונית לעריכה (עם מחיקה); גרירה מזיזה אותה; Backspace/Delete מוחקים.
// - טקסט $...$ שנכנס בדרך אחרת (הדבקה, הקלדה ידנית אחרי $ רגיל) הופך לאובייקט אוטומטית.
import katex from 'katex';
import { Node, Extension } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { icon } from './icons.js';
import { buildSymbolPicker } from './symbols.js';

const cache = new Map();
export function renderMath(tex, displayMode) {
  const key = (displayMode ? 'D' : 'I') + tex;
  if (!cache.has(key)) {
    try {
      cache.set(key, katex.renderToString(tex, { displayMode, throwOnError: false, output: 'htmlAndMathml', strict: 'ignore' }));
    } catch { cache.set(key, null); }
    if (cache.size > 500) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}

// $...$ באותם כללים כמו ב־obsidian-md.js: לא מתחיל ולא נגמר ברווח, ואחריו לא ספרה ($5 הוא מחיר).
export function findInlineMath(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] !== '$') continue;
    if (text[i + 1] === '$') { // $$ בתוך שורה
      const close = text.indexOf('$$', i + 2);
      if (close > i + 2) { out.push({ from: i, to: close + 2, tex: text.slice(i + 2, close), display: true }); i = close + 1; }
      continue;
    }
    if (!text[i + 1] || /\s/.test(text[i + 1])) continue;
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === '\\') { j++; continue; }
      if (text[j] === '$') {
        if (!/\s/.test(text[j - 1]) && !/\d/.test(text[j + 1] || '')) { out.push({ from: i, to: j + 1, tex: text.slice(i + 1, j), display: false }); i = j; }
        break;
      }
    }
  }
  return out;
}

// המקור כפי שייכתב לקובץ. נוסחה בשורה לא יכולה להתחיל או להיגמר ברווח (אחרת היא לא תיקרא חזרה כנוסחה).
export function mathSource(tex, display) {
  const t = String(tex || '').trim();
  return display ? `$$${t}$$` : `$${t}$`;
}
// האם הנוסחה תיקרא חזרה מהקובץ כנוסחה אחת בדיוק (למשל לא $ בודד בלי \ בתוכה)
export function isValidInlineTex(tex, display) {
  const t = String(tex || '').trim();
  if (!t) return false;
  const src = mathSource(t, display);
  const found = findInlineMath(src);
  return found.length === 1 && found[0].from === 0 && found[0].to === src.length;
}

// האם הקלדת $ בנקודה הזו פותחת נוסחה חדשה: לא אחרי \, ולא כשכבר יש $ פתוח לפני הסמן
// (מי שמקליד את הנוסחה ביד, כמו באובסידיאן, סוגר אותה בעצמו).
export function dollarOpensEditor(textBefore) {
  if (textBefore.endsWith('\\')) return false;
  const open = (textBefore.match(/(^|[^\\])\$/g) || []).length;
  return open % 2 === 0;
}

// גוש $$ על כמה שורות (rawHtmlBlock): המקור בלי הסימנים, ובנייה חזרה באותה צורה
export function blockTex(html) {
  return String(html || '').replace(/^\s*\$\$/, '').replace(/\$\$\s*$/, '').replace(/^\n|\n$/g, '');
}
export function blockSource(tex, previous = '$$\n\n$$') {
  const multiline = /^\s*\$\$\s*\n/.test(previous) || String(tex).includes('\n');
  return multiline ? `$$\n${String(tex).trim()}\n$$` : `$$${String(tex).trim()}$$`;
}

// ===== סמלים בחלונית: הרשימה והרכיב ב־symbols.js (10.1) =====

// חיצים שמוקלדים בתיבה הופכים לחץ של LaTeX: => הוא ⇒, -> הוא →. הארוך קודם (<=> לפני =>).
// אין <- בכוונה: הוא היה נתפס באמצע ההקלדה של <->.
const ARROW_SHORTCUTS = [['<=>', '\\Leftrightarrow '], ['<->', '\\leftrightarrow '], ['=>', '\\Rightarrow '], ['->', '\\rightarrow ']];
export function arrowShortcut(before) {
  for (const [typed, tex] of ARROW_SHORTCUTS) {
    if (before.endsWith(typed) && !before.endsWith('\\' + typed)) return { length: typed.length, tex };
  }
  return null;
}

// הכנסת סמל לתיבה במקום הסמן, דרך execCommand כדי ש־Ctrl+Z יבטל אותה
function insertAtCaret(input, raw, replaceBefore = 0) {
  let text = raw;
  let caret = text.indexOf('|');
  if (caret >= 0) text = text.slice(0, caret) + text.slice(caret + 1);
  else {
    // פקודה בלי ארגומנט (\alpha): רווח אחריה, אחרת \alphax הוא פקודה אחרת
    if (/^\\[a-zA-Z]+$/.test(text)) text += ' ';
    caret = text.length;
  }
  const start = input.selectionStart - replaceBefore;
  input.focus();
  input.setSelectionRange(start, input.selectionEnd);
  if (!document.execCommand('insertText', false, text)) input.setRangeText(text, start, input.selectionEnd, 'end');
  input.setSelectionRange(start + caret, start + caret);
}

let symbolsOpen = false;
try { symbolsOpen = localStorage.getItem('tali:math-symbols') === '1'; } catch { /* בלי אחסון */ }

// ===== החלונית =====
// ===== מקלדת אנגלית בחלונית הנוסחה (10.3) =====
// דף אינטרנט לא יכול להחליף את שפת המקלדת של Windows. במקום זה, כשפריסה לא לטינית פעילה (עברית),
// כל מקש בתיבה מתורגם לפי המקש הפיזי (e.code) למה שהוא נותן במקלדת אנגלית (US). השפה של Windows
// לא משתנה בכלל, ולכן ביציאה מהחלונית חוזרים בדיוק למה שהיה. כבוי בהגדרות: mathEnglishKeys = false.
const US_KEYS = {
  Backquote: ['`', '~'], Digit1: ['1', '!'], Digit2: ['2', '@'], Digit3: ['3', '#'], Digit4: ['4', '$'], Digit5: ['5', '%'],
  Digit6: ['6', '^'], Digit7: ['7', '&'], Digit8: ['8', '*'], Digit9: ['9', '('], Digit0: ['0', ')'], Minus: ['-', '_'],
  Equal: ['=', '+'], BracketLeft: ['[', '{'], BracketRight: [']', '}'], Backslash: ['\\', '|'], Semicolon: [';', ':'],
  Quote: ["'", '"'], Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?'], IntlBackslash: ['\\', '|'],
};
// התו במקלדת אנגלית למקש פיזי, או null למקש שאינו תו (חצים, Enter, F1...)
export function usKeyFor(code, shift, caps = false) {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return (shift !== caps) ? letter[1] : letter[1].toLowerCase();
  const pair = US_KEYS[code];
  return pair ? pair[shift ? 1 : 0] : null;
}
// פריסה לא לטינית: לפי האות שהמקש נתן. אות לטינית מבטלת, אות עברית (או ערבית, רוסית...) מפעילה.
// סימני פיסוק לא משנים את ההחלטה, ולכן הם עוקבים אחרי האות האחרונה (או אחרי מפת המקלדת של הדפדפן).
const NON_LATIN_LETTER = /[Ͱ-ϿЀ-ӿ֐-׿؀-ۿ]/;
let nonLatinLayout = false;
let forceEnglish = () => true;
export function configureMathInput({ englishKeys } = {}) { if (englishKeys) forceEnglish = englishKeys; }
function senseLayout() {
  // Keyboard Map API של Chromium: האות שהמקש A נותן עכשיו בפריסה הפעילה
  try {
    navigator.keyboard?.getLayoutMap?.().then((m) => {
      const a = m.get('KeyA');
      if (a) nonLatinLayout = !/^[a-z]$/i.test(a);
    }).catch(() => {});
  } catch { /* לא נתמך: לפי האותיות שמוקלדות */ }
}
// מחזיר את התו האנגלי להכניס במקום, או null להשאיר את ההקלדה הרגילה
export function englishKeyFor(e, layoutIsNonLatin) {
  if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return null;
  if (typeof e.key !== 'string' || e.key.length !== 1) return null;
  const us = usKeyFor(e.code, e.shiftKey, e.getModifierState?.('CapsLock') ?? false);
  if (!us || us === e.key) return null;
  if (NON_LATIN_LETTER.test(e.key) || layoutIsNonLatin) return us;
  return null;
}

let pop = null;
export function closeMathEditor(commit = false) {
  if (!pop) return;
  const p = pop;
  pop = null;
  if (commit) p.save(); else p.cancel?.();
  p.el.remove();
  document.removeEventListener('pointerdown', p.outside, true);
  window.removeEventListener('resize', p.place);
}
export const isMathEditorOpen = () => !!pop;

// rect: איפה להציג (מתחת). tex, display: ערכים התחלתיים. isNew: הוספה (אחרת עריכה, עם מחיקה).
// allowDisplay: להציג את "בשורה נפרדת". onSave({tex, display}), onDelete(), onCancel(), onLiteral()
export function openMathEditor({ rect, tex = '', display = false, isNew = true, allowDisplay = true, onSave, onDelete, onCancel, onLiteral }) {
  closeMathEditor(false);
  const el = document.createElement('div');
  el.className = 'math-pop';
  el.dir = 'rtl';
  el.innerHTML = `
    <div class="mp-head"><span>${isNew ? 'נוסחה חדשה' : 'עריכת נוסחה'}</span><span class="mp-tag" dir="ltr">LaTeX</span></div>
    <textarea class="mp-input" dir="ltr" spellcheck="false" autocapitalize="off" autocomplete="off" rows="2" placeholder="x^2 + y^2 = r^2"></textarea>
    <div class="mp-symbols" hidden></div>
    <div class="mp-preview" dir="ltr"></div>
    <div class="mp-row">
      <label class="mp-display"><input type="checkbox"> בשורה נפרדת</label>
      <button type="button" class="mp-sym-toggle" aria-expanded="false">${icon('math', 15)}<span>סמלים</span>${icon('chevronDown', 13)}</button>
      <span class="mp-hint"><kbd>Enter</kbd> ל${isNew ? 'הוספה' : 'שמירה'} · <kbd>Shift+Enter</kbd> לשורה חדשה · <kbd>Esc</kbd> לביטול${isNew ? ' · <kbd>$</kbd> בתיבה ריקה: סימן $ רגיל' : ''}</span>
    </div>
    <div class="mp-actions">
      <button type="button" class="mp-ok">${isNew ? 'הוספה' : 'שמירה'}</button>
      ${isNew ? '' : '<button type="button" class="mp-del">מחיקה</button>'}
      <button type="button" class="mp-cancel">ביטול</button>
    </div>`;
  const input = el.querySelector('.mp-input');
  const preview = el.querySelector('.mp-preview');
  const check = el.querySelector('.mp-display input');
  const ok = el.querySelector('.mp-ok');
  const symPanel = el.querySelector('.mp-symbols');
  const symToggle = el.querySelector('.mp-sym-toggle');
  // 10.1: אותו רכיב סמלים כמו בטקסט רגיל (symbols.js), במצב LaTeX: לשוניות לפי נושא וחיפוש
  const picker = buildSymbolPicker({ mode: 'tex', onPick: (s) => { insertAtCaret(input, s.tex); refresh(); } });
  symPanel.append(picker.el);
  const setSymbols = (open) => {
    symbolsOpen = open;
    symPanel.hidden = !open;
    symToggle.classList.toggle('on', open);
    symToggle.setAttribute('aria-expanded', String(open));
    try { localStorage.setItem('tali:math-symbols', open ? '1' : '0'); } catch { /* בלי אחסון */ }
  };
  symToggle.addEventListener('mousedown', (e) => e.preventDefault());
  symToggle.addEventListener('click', () => { setSymbols(!symbolsOpen); pop?.place(); });
  input.value = tex;
  check.checked = !!display;
  if (!allowDisplay) el.querySelector('.mp-display').hidden = true;

  const fit = () => { input.style.height = 'auto'; input.style.height = Math.min(220, input.scrollHeight + 2) + 'px'; };
  const refresh = () => {
    const t = input.value.trim();
    const html = t ? renderMath(t, check.checked || !allowDisplay) : '';
    preview.innerHTML = html || '';
    preview.classList.toggle('empty', !t);
    if (!t) preview.textContent = 'התצוגה המקדימה תופיע כאן';
    const valid = !t || !allowDisplay || isValidInlineTex(t, check.checked);
    ok.disabled = !t || !valid;
    el.classList.toggle('invalid', !valid);
    fit();
  };
  const p = {
    el,
    save: () => {
      const t = input.value.trim();
      if (t && (!allowDisplay || isValidInlineTex(t, check.checked))) onSave?.({ tex: t, display: check.checked });
      else onCancel?.();
    },
    cancel: onCancel,
    outside: (e) => { if (!el.contains(e.target)) closeMathEditor(false); },
    place: () => {
      const w = el.offsetWidth, h = el.offsetHeight;
      let top = rect.bottom + 8;
      if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 8);
      const mid = (rect.left + rect.right) / 2;
      el.style.top = Math.round(top) + 'px';
      el.style.left = Math.round(Math.max(8, Math.min(mid - w / 2, window.innerWidth - w - 8))) + 'px';
    },
  };
  pop = p;
  input.addEventListener('input', (e) => {
    // => ו־-> הופכים לחץ אמיתי (אחרי ההקלדה של >)
    if (e.inputType === 'insertText' && e.data === '>' && input.selectionStart === input.selectionEnd) {
      const hit = arrowShortcut(input.value.slice(0, input.selectionStart));
      if (hit) { insertAtCaret(input, hit.tex.trimEnd() + ' ', hit.length); refresh(); return; }
    }
    // $ כשהתיבה ריקה: המשתמש רצה סימן $ רגיל (מחיר, למשל). לפי input ולא keydown, כדי שיעבוד בכל פריסת מקלדת.
    if (isNew && onLiteral && input.value === '$') {
      p.cancel = null;
      closeMathEditor(false);
      onLiteral();
      return;
    }
    refresh();
  });
  check.addEventListener('change', refresh);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    // 10.3: מקלדת עברית פעילה: התו האנגלי של אותו מקש פיזי
    if (forceEnglish()) {
      if (typeof e.key === 'string' && e.key.length === 1) {
        if (NON_LATIN_LETTER.test(e.key)) nonLatinLayout = true;
        else if (/^[a-z]$/i.test(e.key) && /^Key[A-Z]$/.test(e.code)) nonLatinLayout = false;
      }
      const en = englishKeyFor(e, nonLatinLayout);
      if (en) {
        e.preventDefault();
        // הכנסה מילולית (insertAtCaret מתייחס ל־| כמקום הסמן). execCommand: כדי ש־Ctrl+Z ואירוע input יעבדו כרגיל
        if (!document.execCommand('insertText', false, en)) input.setRangeText(en, input.selectionStart, input.selectionEnd, 'end');
        return;
      }
    }
    if (e.key === 'Escape') { e.preventDefault(); closeMathEditor(false); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!ok.disabled) closeMathEditor(true); }
  });
  ok.addEventListener('click', () => closeMathEditor(true));
  el.querySelector('.mp-cancel').addEventListener('click', () => closeMathEditor(false));
  el.querySelector('.mp-del')?.addEventListener('click', () => { p.cancel = null; closeMathEditor(false); onDelete?.(); });
  document.body.append(el);
  setSymbols(symbolsOpen);
  refresh();
  p.place();
  window.addEventListener('resize', p.place);
  // אחרי ה־pointerdown שפתח את החלונית
  setTimeout(() => { if (pop === p) document.addEventListener('pointerdown', p.outside, true); }, 0);
  if (forceEnglish()) senseLayout();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  return el;
}

// מיקום להצגת החלונית: מתחת לנוסחה, או מתחת לסמן
function rectAt(view, pos) {
  const dom = view.nodeDOM(pos);
  if (dom instanceof HTMLElement) return dom.getBoundingClientRect();
  const c = view.coordsAtPos(pos);
  return { left: c.left, right: c.right, top: c.top, bottom: c.bottom };
}
const back = (view) => setTimeout(() => view.focus(), 0);

// עריכת נוסחה קיימת בשורה (pos: המיקום של הצומת)
export function editInlineMath(view, pos) {
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'mathInline') return false;
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
  openMathEditor({
    rect: rectAt(view, pos), tex: node.attrs.tex, display: node.attrs.display, isNew: false,
    onSave: ({ tex, display }) => {
      const cur = view.state.doc.nodeAt(pos);
      if (cur?.type.name === 'mathInline') view.dispatch(view.state.tr.setNodeMarkup(pos, null, { ...cur.attrs, tex, display }));
      back(view);
    },
    onDelete: () => {
      const cur = view.state.doc.nodeAt(pos);
      if (cur?.type.name === 'mathInline') view.dispatch(view.state.tr.delete(pos, pos + cur.nodeSize));
      back(view);
    },
    onCancel: () => back(view),
  });
  return true;
}

// עריכת גוש $$ על כמה שורות (rawHtmlBlock עם kind=math)
export function editBlockMath(view, pos) {
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'rawHtmlBlock' || node.attrs.kind !== 'math') return false;
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
  openMathEditor({
    rect: rectAt(view, pos), tex: blockTex(node.attrs.html), display: true, isNew: false, allowDisplay: false,
    onSave: ({ tex }) => {
      const cur = view.state.doc.nodeAt(pos);
      if (cur) view.dispatch(view.state.tr.setNodeMarkup(pos, null, { ...cur.attrs, html: blockSource(tex, cur.attrs.html) }));
      back(view);
    },
    onDelete: () => {
      const cur = view.state.doc.nodeAt(pos);
      if (cur) view.dispatch(view.state.tr.delete(pos, pos + cur.nodeSize));
      back(view);
    },
    onCancel: () => back(view),
  });
  return true;
}

// הוספת נוסחה חדשה בסמן (מ־$, מהסרגל או מהתפריט). preferBlock: "נוסחה בשורה נפרדת"
export function insertMath(view, { preferBlock = false, literalDollar = false } = {}) {
  const { state } = view;
  const { from, to, empty } = state.selection;
  const initial = empty ? '' : state.doc.textBetween(from, to, ' ').trim();
  const type = state.schema.nodes.mathInline;
  if (!type) return false;
  openMathEditor({
    rect: rectAt(view, from), tex: initial, display: preferBlock, isNew: true,
    onSave: ({ tex, display }) => {
      let tr = view.state.tr;
      const $from = tr.doc.resolve(from);
      const block = view.state.schema.nodes.rawHtmlBlock;
      // בשורה נפרדת בפסקה ריקה: גוש $$ אמיתי, כמו באובסידיאן
      if (display && block && $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0 && from === to) {
        const node = block.create({ html: blockSource(tex), kind: 'math' });
        tr = tr.replaceWith($from.before(), $from.after(), node);
        const after = $from.before() + node.nodeSize;
        if (after >= tr.doc.content.size) tr = tr.insert(after, view.state.schema.nodes.paragraph.create());
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(after + 1, tr.doc.content.size))));
      } else {
        const node = type.create({ tex, display });
        tr = tr.replaceWith(from, to, node);
        tr = tr.setSelection(TextSelection.create(tr.doc, from + node.nodeSize));
      }
      view.dispatch(tr.scrollIntoView());
      back(view);
    },
    onLiteral: literalDollar ? () => { view.dispatch(view.state.tr.insertText('$', from, to)); back(view); } : null,
    onCancel: () => back(view),
  });
  return true;
}

// ===== הצומת =====
export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      tex: { default: '', parseHTML: (el) => el.getAttribute('data-tex') || '' },
      display: { default: false, parseHTML: (el) => el.getAttribute('data-display') === '1' },
    };
  },
  parseHTML() { return [{ tag: 'span[data-math]' }]; },
  // בהעתקה: גם המקור כטקסט, כך שהדבקה לאפליקציה אחרת נותנת $...$
  renderHTML({ node }) {
    return ['span', { 'data-math': '', 'data-tex': node.attrs.tex, 'data-display': node.attrs.display ? '1' : null }, mathSource(node.attrs.tex, node.attrs.display)];
  },
  renderText({ node }) { return mathSource(node.attrs.tex, node.attrs.display); },
  addNodeView() {
    return ({ node: initial }) => {
      const dom = document.createElement('span');
      let current = null;
      const draw = (node) => {
        current = node;
        dom.className = 'math-inline' + (node.attrs.display ? ' math-display-inline' : '');
        dom.dir = 'ltr';
        const html = renderMath(node.attrs.tex, node.attrs.display);
        if (html) dom.innerHTML = html; else dom.textContent = mathSource(node.attrs.tex, node.attrs.display);
        dom.dataset.tip = 'לחיצה לעריכה · גרירה להזזה';
      };
      draw(initial);
      return {
        dom,
        update: (node) => {
          if (node.type.name !== 'mathInline') return false;
          if (node.attrs.tex !== current.attrs.tex || node.attrs.display !== current.attrs.display) draw(node);
          return true;
        },
        ignoreMutation: () => true,
      };
    };
  },
  addStorage() {
    return {
      markdown: {
        serialize(state, node) { state.write(mathSource(node.attrs.tex, node.attrs.display)); },
        parse: {},
      },
    };
  },
});

// טקסט $...$ שלם במסמך (הדבקה, או מי שהקליד $ רגיל וסגר ביד) הופך לצומת.
// לא בקוד, ולא כשהסמן בתוך הנוסחה עצמה (באמצע הקלדה).
function convertTextFormulas(state) {
  const type = state.schema.nodes.mathInline;
  if (!type) return null;
  const found = [];
  const { from: selFrom, to: selTo } = state.selection;
  state.doc.descendants((node, pos, parent) => {
    if (node.type.spec.code) return false;
    if (!node.isText || !node.text.includes('$')) return;
    if (parent?.type.spec.code || node.marks.some((m) => m.type.spec.code)) return;
    for (const m of findInlineMath(node.text)) {
      const from = pos + m.from, to = pos + m.to;
      if ((selFrom > from && selFrom < to) || (selTo > from && selTo < to)) continue;
      if (!m.tex.trim()) continue;
      found.push({ from, to, tex: m.tex, display: m.display, marks: node.marks });
    }
  });
  if (!found.length) return null;
  const tr = state.tr;
  for (const f of found.reverse()) tr.replaceWith(f.from, f.to, type.create({ tex: f.tex, display: f.display }, null, f.marks));
  return tr;
}

const key = new PluginKey('taliMath');
export const MathEditing = Extension.create({
  name: 'mathEditing',
  addKeyboardShortcuts() {
    return {
      // Enter על נוסחה מסומנת: עריכה
      Enter: ({ editor }) => {
        const sel = editor.state.selection;
        if (!(sel instanceof NodeSelection)) return false;
        if (sel.node.type.name === 'mathInline') return editInlineMath(editor.view, sel.from);
        if (sel.node.type.name === 'rawHtmlBlock' && sel.node.attrs.kind === 'math') return editBlockMath(editor.view, sel.from);
        return false;
      },
    };
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      key,
      appendTransaction(trs, _old, state) {
        if (!trs.some((tr) => tr.docChanged) || trs.some((tr) => tr.getMeta(key))) return null;
        const tr = convertTextFormulas(state);
        return tr ? tr.setMeta(key, true) : null;
      },
      props: {
        handleTextInput(view, from, to, text) {
          if (text !== '$' || view.composing) return false;
          const $from = view.state.doc.resolve(from);
          if ($from.parent.type.spec.code) return false;
          if ((view.state.storedMarks || $from.marks()).some((m) => m.type.spec.code)) return false;
          const before = $from.parent.textBetween(0, $from.parentOffset, null, '');
          if (!dollarOpensEditor(before)) return false;
          return insertMath(view, { literalDollar: true });
        },
        handleClickOn(view, _pos, node, nodePos, event, direct) {
          if (!direct || event.button !== 0) return false;
          if (node.type.name === 'mathInline') return editInlineMath(view, nodePos);
          if (node.type.name === 'rawHtmlBlock' && node.attrs.kind === 'math') return editBlockMath(view, nodePos);
          return false;
        },
      },
    })];
  },
});
