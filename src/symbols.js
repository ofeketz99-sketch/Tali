// סמלים (10.1): רשימה אחת לפי נושאים, ושתי דרכים להכניס אותה.
// - בחלונית הנוסחה (math.js): נכנסת פקודת ה־LaTeX (`tex`).
// - בטקסט רגיל (openSymbolPicker): נכנס התו עצמו (`ch`), כמו כל אות, וכך הוא נשמר בקובץ.
// לכל סמל: { tex?, ch?, show?, name }. בלי ch: רק בנוסחה (שבר, שורש עם ארגומנט). בלי tex: רק בטקסט.
// show: מה מוצג בכפתור בנוסחה, כשהפקודה צריכה ארגומנט לדוגמה. | בתוך tex הוא מקום הסמן אחרי ההוספה.
// name: מילות חיפוש, באנגלית ובעברית.
import { renderMath } from './math.js';

const S = (ch, tex, name, show) => ({ ch, tex, name, show });

export const SYMBOL_GROUPS = [
  { id: 'arrows', title: 'חצים', items: [
    S('→', '\\rightarrow', 'right arrow to ימינה חץ'), S('⇒', '\\Rightarrow', 'implies double right גורר חץ כפול'),
    S('⟶', '\\longrightarrow', 'long right arrow חץ ארוך'), S('←', '\\leftarrow', 'left arrow שמאלה חץ'),
    S('⇐', '\\Leftarrow', 'double left arrow'), S('↔', '\\leftrightarrow', 'left right arrow דו כיווני'),
    S('⇔', '\\Leftrightarrow', 'iff equivalent אם ורק אם'), S('⇌', '\\rightleftharpoons', 'equilibrium שיווי משקל'),
    S(undefined, '\\xrightarrow{|}', 'arrow with label חץ עם כיתוב', '\\xrightarrow{\\Delta}'),
    S('↑', '\\uparrow', 'up arrow gas גז למעלה'), S('↓', '\\downarrow', 'down arrow precipitate שקיעה למטה'),
    S('↦', '\\mapsto', 'maps to'), S('↗', '\\nearrow', 'increase עולה'), S('↘', '\\searrow', 'decrease יורד'),
  ] },
  { id: 'logic', title: 'לוגיקה ופילוסופיה', items: [
    S('¬', '\\neg', 'not negation שלילה לא'), S('∧', '\\land', 'and conjunction וגם'), S('∨', '\\lor', 'or disjunction או'),
    S('→', '\\rightarrow', 'implies conditional גרירה אם אז'), S('↔', '\\leftrightarrow', 'biconditional iff'),
    S('⊕', '\\oplus', 'xor exclusive or'), S('∀', '\\forall', 'for all universal לכל כמת'),
    S('∃', '\\exists', 'exists there is קיים כמת'), S('∄', '\\nexists', 'not exists לא קיים'),
    S('⊢', '\\vdash', 'proves turnstile יכיח'), S('⊨', '\\models', 'entails models נובע'),
    S('⊤', '\\top', 'true tautology אמת'), S('⊥', '\\bot', 'false contradiction שקר סתירה'),
    S('□', '\\Box', 'necessarily necessity box הכרחי'), S('◇', '\\Diamond', 'possibly possibility diamond אפשרי'),
    S('∴', '\\therefore', 'therefore לכן'), S('∵', '\\because', 'because כי'),
    S('≡', '\\equiv', 'equivalent identical שקול זהה'), S('⊃', '\\supset', 'horseshoe implies'),
    S('↯', undefined, 'contradiction lightning סתירה'), // ל־KaTeX אין \lightning: רק בטקסט
  ] },
  { id: 'sets', title: 'קבוצות', items: [
    S('∈', '\\in', 'element of in שייך'), S('∉', '\\notin', 'not in לא שייך'), S('∋', '\\ni', 'contains'),
    S('⊂', '\\subset', 'subset תת קבוצה'), S('⊆', '\\subseteq', 'subset equal מוכלת'),
    S('⊄', '\\not\\subset', 'not subset'), S('⊃', '\\supset', 'superset'), S('⊇', '\\supseteq', 'superset equal'),
    S('∪', '\\cup', 'union איחוד'), S('∩', '\\cap', 'intersection חיתוך'), S('∖', '\\setminus', 'set minus difference הפרש'),
    S('∅', '\\emptyset', 'empty set ריקה'), S('℘', '\\wp', 'power set חזקה'),
    S('ℕ', '\\mathbb{N}', 'natural numbers טבעיים'), S('ℤ', '\\mathbb{Z}', 'integers שלמים'),
    S('ℚ', '\\mathbb{Q}', 'rationals רציונליים'), S('ℝ', '\\mathbb{R}', 'reals ממשיים'),
    S('ℂ', '\\mathbb{C}', 'complex מרוכבים'), S('ℵ', '\\aleph', 'aleph אלף'),
  ] },
  { id: 'relations', title: 'יחסים ופעולות', items: [
    S('≠', '\\ne', 'not equal שונה'), S('≤', '\\le', 'less equal קטן שווה'), S('≥', '\\ge', 'greater equal גדול שווה'),
    S('≈', '\\approx', 'approximately בערך'), S('≅', '\\cong', 'congruent חופף'), S('∼', '\\sim', 'similar tilde דומה'),
    S('∝', '\\propto', 'proportional פרופורציוני'), S('±', '\\pm', 'plus minus פלוס מינוס'), S('∓', '\\mp', 'minus plus'),
    S('·', '\\cdot', 'dot times כפול נקודה'), S('×', '\\times', 'times cross כפול'), S('÷', '\\div', 'divide חילוק'),
    S('∞', '\\infty', 'infinity אינסוף'), S('°', '^{\\circ}', 'degree מעלות', 'x^{\\circ}'),
    S('′', "'", 'prime derivative נגזרת'), S('″', "''", 'double prime'), S('‰', undefined, 'per mille פרומיל'),
    S('√', '\\sqrt{|}', 'square root שורש', '\\sqrt{x}'), S('∂', '\\partial', 'partial חלקית'), S('∇', '\\nabla', 'nabla gradient'),
    S('∑', '\\sum', 'sum סכום'), S('∏', '\\prod', 'product מכפלה'), S('∫', '\\int', 'integral אינטגרל'), S('∮', '\\oint', 'contour integral'),
  ] },
  { id: 'greek', title: 'אותיות יווניות', items: [
    ...[['α', 'alpha'], ['β', 'beta'], ['γ', 'gamma'], ['δ', 'delta'], ['ε', 'epsilon'], ['ζ', 'zeta'], ['η', 'eta'], ['θ', 'theta'],
      ['ι', 'iota'], ['κ', 'kappa'], ['λ', 'lambda'], ['μ', 'mu'], ['ν', 'nu'], ['ξ', 'xi'], ['π', 'pi'], ['ρ', 'rho'],
      ['σ', 'sigma'], ['τ', 'tau'], ['υ', 'upsilon'], ['φ', 'phi'], ['χ', 'chi'], ['ψ', 'psi'], ['ω', 'omega']]
      .map(([ch, n]) => S(ch, '\\' + n, n + ' greek יוונית')),
    ...[['Γ', 'Gamma'], ['Δ', 'Delta'], ['Θ', 'Theta'], ['Λ', 'Lambda'], ['Ξ', 'Xi'], ['Π', 'Pi'], ['Σ', 'Sigma'],
      ['Υ', 'Upsilon'], ['Φ', 'Phi'], ['Ψ', 'Psi'], ['Ω', 'Omega']]
      .map(([ch, n]) => S(ch, '\\' + n, n + ' capital greek יוונית גדולה')),
  ] },
  { id: 'scripts', title: 'חזקות ואינדקסים', items: [
    ...'⁰¹²³⁴⁵⁶⁷⁸⁹'.split('').map((ch, i) => S(ch, `^{${i}}`, `superscript ${i} חזקה`, `x^{${i}}`)),
    S('⁺', '^{+}', 'superscript plus charge מטען חיובי', 'x^{+}'), S('⁻', '^{-}', 'superscript minus charge מטען שלילי', 'x^{-}'),
    S('ⁿ', '^{n}', 'superscript n', 'x^{n}'),
    ...'₀₁₂₃₄₅₆₇₈₉'.split('').map((ch, i) => S(ch, `_{${i}}`, `subscript ${i} אינדקס`, `x_{${i}}`)),
  ] },
  { id: 'chem', title: 'כימיה', items: [
    S('⇌', '\\rightleftharpoons', 'equilibrium שיווי משקל'), S('⟶', '\\longrightarrow', 'yields reaction תגובה'),
    S(undefined, '\\xrightarrow{\\Delta}', 'heat חימום'), S(undefined, '\\xrightarrow{|}', 'catalyst זרז', '\\xrightarrow{cat}'),
    S('↑', '\\uparrow', 'gas גז'), S('↓', '\\downarrow', 'precipitate משקע'), S('Δ', '\\Delta', 'heat delta change שינוי'),
    S('°', '^{\\circ}', 'degree standard', 'H^{\\circ}'), S('(aq)', '_{(aq)}', 'aqueous מימי', 'X_{(aq)}'),
    S('(s)', '_{(s)}', 'solid מוצק', 'X_{(s)}'), S('(l)', '_{(l)}', 'liquid נוזל', 'X_{(l)}'), S('(g)', '_{(g)}', 'gas גז', 'X_{(g)}'),
  ] },
  { id: 'structures', title: 'מבנים', items: [
    S(undefined, '\\frac{|}{}', 'fraction שבר', '\\frac{a}{b}'), S(undefined, '^{|}', 'power superscript חזקה', 'x^{n}'),
    S(undefined, '_{|}', 'subscript index אינדקס', 'x_{i}'), S(undefined, '\\sqrt[|]{}', 'nth root שורש', '\\sqrt[n]{x}'),
    S(undefined, '\\sum_{|}^{}', 'sum limits סכום', '\\sum_{i}^{n}'), S(undefined, '\\int_{|}^{}', 'integral limits אינטגרל', '\\int_{a}^{b}'),
    S(undefined, '\\lim_{|}', 'limit גבול', '\\lim_{x\\to 0}'), S(undefined, '\\vec{|}', 'vector וקטור', '\\vec{v}'),
    S(undefined, '\\overline{|}', 'overline bar', '\\overline{x}'), S(undefined, '\\hat{|}', 'hat', '\\hat{x}'),
    S(undefined, '\\binom{|}{}', 'binomial בינום', '\\binom{n}{k}'), S(undefined, '\\text{|}', 'text טקסט', '\\text{abc}'),
  ] },
];

// mode 'tex': מה שיש לו פקודת LaTeX. mode 'text': מה שיש לו תו.
export const usable = (s, mode) => (mode === 'tex' ? !!s.tex : !!s.ch);
export function searchSymbols(query, mode) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const seen = new Set();
  const out = [];
  for (const g of SYMBOL_GROUPS) {
    for (const s of g.items) {
      if (!usable(s, mode)) continue;
      const k = mode === 'tex' ? s.tex : s.ch;
      if (seen.has(k)) continue;
      const hay = `${s.name} ${s.tex || ''} ${s.ch || ''}`.toLowerCase();
      if (q.split(/\s+/).every((w) => hay.includes(w))) { seen.add(k); out.push(s); }
    }
  }
  return out;
}

// תו שמשתקף בפסקה מימין לשמאל (⊂ נראה ⊃, ≤ נראה ≥, ∃ הפוך). בהקשר עברי עוטפים אותו בסימני LRM
// בלתי נראים, כדי שיוצג בדיוק כמו בכפתור שנלחץ.
export function textForContext(ch, rtl) {
  return rtl && /\p{Bidi_M}/u.test(ch) ? `‎${ch}‎` : ch;
}

// ===== הרכיב: חיפוש, לשוניות ורשת =====
const RECENT_KEY = 'tali:recent-symbols';
const TAB_KEY = 'tali:symbol-tab';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* בלי אחסון */ } };

// onPick(symbol, event). מחזיר { el, search }.
export function buildSymbolPicker({ mode, onPick }) {
  const el = document.createElement('div');
  el.className = 'sym-picker sym-' + mode;
  el.innerHTML = `<input class="sym-search" type="text" dir="auto" spellcheck="false" placeholder="חיפוש סמל (and, ∀, שורש, alpha…)"><div class="sym-tabs" role="tablist"></div><div class="sym-grid-wrap"></div>`;
  const search = el.querySelector('.sym-search');
  const tabsEl = el.querySelector('.sym-tabs');
  const wrap = el.querySelector('.sym-grid-wrap');
  const key = (s) => (mode === 'tex' ? s.tex : s.ch);
  const recent = () => load(RECENT_KEY, {})[mode] || [];
  const groups = () => {
    const list = SYMBOL_GROUPS.map((g) => ({ ...g, items: g.items.filter((s) => usable(s, mode)) })).filter((g) => g.items.length);
    const all = SYMBOL_GROUPS.flatMap((g) => g.items);
    const rec = recent().map((k) => all.find((s) => usable(s, mode) && key(s) === k)).filter(Boolean);
    return rec.length ? [{ id: 'recent', title: 'אחרונים', items: rec }, ...list] : list;
  };
  let tab = load(TAB_KEY, {})[mode] || 'arrows';

  const cell = (s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sym-cell';
    b.dir = 'ltr';
    if (mode === 'tex') b.innerHTML = renderMath((s.show || s.tex).replace('|', ''), false) || s.tex;
    else b.textContent = s.ch;
    b.dataset.tip = `${s.name.split(/\s+(?=[֐-׿])/)[0]} · ${mode === 'tex' ? s.tex.replace('|', '') : s.ch}`;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      const r = load(RECENT_KEY, {});
      r[mode] = [key(s), ...(r[mode] || []).filter((k) => k !== key(s))].slice(0, 16);
      save(RECENT_KEY, r);
      onPick(s, e);
    });
    return b;
  };
  const grid = (items) => {
    const g = document.createElement('div');
    g.className = 'sym-grid';
    for (const s of items) g.append(cell(s));
    return g;
  };
  function render() {
    const q = search.value.trim();
    wrap.replaceChildren();
    tabsEl.hidden = !!q;
    if (q) {
      const found = searchSymbols(q, mode);
      if (found.length) wrap.append(grid(found));
      else wrap.append(Object.assign(document.createElement('div'), { className: 'sym-empty', textContent: 'לא נמצא סמל' }));
      return;
    }
    const gs = groups();
    if (!gs.some((g) => g.id === tab)) tab = gs[0].id;
    tabsEl.replaceChildren(...gs.map((g) => {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'sym-tab' + (g.id === tab ? ' on' : '');
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(g.id === tab));
      t.textContent = g.title;
      t.addEventListener('mousedown', (e) => e.preventDefault());
      t.addEventListener('click', () => {
        tab = g.id;
        const st = load(TAB_KEY, {}); st[mode] = tab; save(TAB_KEY, st);
        render();
      });
      return t;
    }));
    wrap.append(grid(gs.find((g) => g.id === tab).items));
  }
  search.addEventListener('input', render);
  search.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); wrap.querySelector('.sym-cell')?.click(); }
  });
  render();
  return { el, search, render };
}

// ===== בחירת סמל לטקסט רגיל: חלונית ליד הסמן =====
let open = null;
export function closeSymbolPicker() {
  if (!open) return;
  const o = open;
  open = null;
  o.el.remove();
  document.removeEventListener('pointerdown', o.outside, true);
  document.removeEventListener('keydown', o.esc, true);
  o.view.focus();
}

// isRtlAt(view, pos): האם הפסקה בנקודה הזו מימין לשמאל (לבחירת עטיפת LRM)
export function openSymbolPicker(view, { isRtlAt = () => false } = {}) {
  closeSymbolPicker();
  const { from } = view.state.selection;
  const c = view.coordsAtPos(from);
  const el = document.createElement('div');
  el.className = 'sym-pop';
  el.dir = 'rtl';
  const head = document.createElement('div');
  head.className = 'sym-pop-head';
  head.innerHTML = '<span>סמל מיוחד</span><span class="sym-pop-hint">Shift+לחיצה: עוד סמל בלי לסגור</span>';
  const picker = buildSymbolPicker({
    mode: 'text',
    onPick: (s, e) => {
      const st = view.state;
      const { from: a, to: b } = st.selection;
      const text = textForContext(s.ch, isRtlAt(view, a));
      view.dispatch(st.tr.insertText(text, a, b).scrollIntoView());
      if (!e.shiftKey) closeSymbolPicker();
    },
  });
  el.append(head, picker.el);
  document.body.append(el);
  const w = el.offsetWidth, h = el.offsetHeight;
  let top = c.bottom + 8;
  if (top + h > window.innerHeight - 8) top = Math.max(8, c.top - h - 8);
  el.style.top = Math.round(top) + 'px';
  el.style.left = Math.round(Math.max(8, Math.min(c.left - w / 2, window.innerWidth - w - 8))) + 'px';
  const o = {
    el, view,
    outside: (e) => { if (!el.contains(e.target)) closeSymbolPicker(); },
    esc: (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSymbolPicker(); } },
  };
  open = o;
  setTimeout(() => { if (open === o) document.addEventListener('pointerdown', o.outside, true); }, 0);
  document.addEventListener('keydown', o.esc, true);
  // גם בפריים הבא: העורך מחזיר לעצמו פוקוס באיחור אחרי פקודת focus שקדמה לפתיחה
  picker.search.focus();
  requestAnimationFrame(() => { if (open === o) picker.search.focus(); });
}
