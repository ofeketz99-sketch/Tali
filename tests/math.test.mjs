import test from 'node:test';
import assert from 'node:assert/strict';
import { findInlineMath, mathSource, isValidInlineTex, dollarOpensEditor, blockTex, blockSource, arrowShortcut, usKeyFor, englishKeyFor } from '../src/math.js';

test('physical keys map to the US layout', () => {
  assert.equal(usKeyFor('KeyA', false), 'a');
  assert.equal(usKeyFor('KeyA', true), 'A');
  assert.equal(usKeyFor('KeyA', false, true), 'A'); // caps lock
  assert.equal(usKeyFor('Digit9', true), '(');
  assert.equal(usKeyFor('Backslash', false), '\\');
  assert.equal(usKeyFor('Slash', false), '/');
  assert.equal(usKeyFor('ArrowLeft', false), null);
});

test('Hebrew keystrokes in the formula box become the English character of the same key', () => {
  const ev = (key, code, extra = {}) => ({ key, code, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...extra });
  assert.equal(englishKeyFor(ev('ש', 'KeyA'), false), 'a'); // a Hebrew letter alone proves the layout
  assert.equal(englishKeyFor(ev('.', 'Slash'), true), '/'); // Hebrew layout: the / key types "."
  assert.equal(englishKeyFor(ev('ת', 'Comma'), true), ',');
  assert.equal(englishKeyFor(ev(')', 'Digit9', { shiftKey: true }), true), '('); // RTL-mirrored parenthesis
  assert.equal(englishKeyFor(ev('a', 'KeyA'), false), null); // English keyboard: untouched
  assert.equal(englishKeyFor(ev('.', 'Slash'), false), null); // punctuation on an English keyboard: untouched
  assert.equal(englishKeyFor(ev('ש', 'KeyA', { ctrlKey: true }), true), null); // shortcuts pass through
  assert.equal(englishKeyFor(ev('Enter', 'Enter'), true), null);
});
import { SYMBOL_GROUPS, searchSymbols, textForContext, usable } from '../src/symbols.js';

test('symbol search finds by English, Hebrew, LaTeX or the character itself', () => {
  assert.equal(searchSymbols('forall', 'text')[0].ch, '∀');
  assert.equal(searchSymbols('לכל', 'text')[0].ch, '∀');
  assert.equal(searchSymbols('\\subseteq', 'tex')[0].tex, '\\subseteq');
  assert.equal(searchSymbols('⊂', 'text')[0].ch, '⊂');
  // structures have no plain character, so text mode never offers them
  assert.equal(searchSymbols('fraction', 'text').length, 0);
  assert.equal(searchSymbols('fraction', 'tex')[0].tex, '\\frac{|}{}');
});

test('mirrored symbols get invisible LTR marks only inside right-to-left text', () => {
  assert.equal(textForContext('⊂', true), '‎⊂‎');
  assert.equal(textForContext('⊂', false), '⊂');
  assert.equal(textForContext('α', true), 'α');
  assert.equal(textForContext('→', true), '→');
});

test('every LaTeX command in the symbol menu really renders in KaTeX', async () => {
  const katex = (await import('katex')).default;
  const bad = [];
  for (const g of SYMBOL_GROUPS) {
    for (const s of g.items) {
      if (!s.tex) continue;
      const tex = (s.show || s.tex.replace('|', 'x'));
      try { katex.renderToString(tex, { throwOnError: true, strict: 'ignore' }); } catch (e) { bad.push(`${g.id}: ${tex} (${e.message.split('\n')[0]})`); }
    }
  }
  assert.deepEqual(bad, []);
});

test('every symbol has a usable form and LaTeX commands are clean', () => {
  for (const g of SYMBOL_GROUPS) {
    assert.ok(g.items.length, g.id);
    for (const s of g.items) {
      assert.ok(usable(s, 'tex') || usable(s, 'text'), s.name);
      if (s.tex) {
        assert.ok(s.tex.split('|').length <= 2, s.tex);
        assert.ok(!/[\r\n\t]/.test(s.tex), JSON.stringify(s.tex));
      }
    }
  }
});

test('typed arrows become LaTeX arrows, longest first', () => {
  assert.deepEqual(arrowShortcut('NH_4^+ + OH^- =>'), { length: 2, tex: '\\Rightarrow ' });
  assert.deepEqual(arrowShortcut('a ->'), { length: 2, tex: '\\rightarrow ' });
  assert.deepEqual(arrowShortcut('a <=>'), { length: 3, tex: '\\Leftrightarrow ' });
  assert.deepEqual(arrowShortcut('a <->'), { length: 3, tex: '\\leftrightarrow ' });
  assert.equal(arrowShortcut('a >'), null);
  assert.equal(arrowShortcut('a >='), null);
});


test('finds LaTeX source without changing its logical order', () => {
  const [formula] = findInlineMath('עברית $10^{-1}=0.1$ המשך');
  assert.deepEqual(formula, { from: 6, to: 19, tex: '10^{-1}=0.1', display: false });
});

test('prices are not formulas', () => {
  assert.deepEqual(findInlineMath('עולה $5 ועוד $10'), []);
  assert.deepEqual(findInlineMath('$ x$'), []);
});

test('formula source is written back as $...$ or $$...$$', () => {
  assert.equal(mathSource(' x^2 ', false), '$x^2$');
  assert.equal(mathSource('\\frac{a}{b}', true), '$$\\frac{a}{b}$$');
});

test('only sources that read back as a single formula are accepted', () => {
  assert.equal(isValidInlineTex('x^2', false), true);
  assert.equal(isValidInlineTex('a$b', false), false); // a bare $ would split it
  assert.equal(isValidInlineTex('a\\$b', false), true);
  assert.equal(isValidInlineTex('', false), false);
  assert.equal(isValidInlineTex('x$5', true), true); // inside $$ a single $ is fine
});

test('typing $ opens the editor unless a formula is already open before the cursor', () => {
  assert.equal(dollarOpensEditor('שלום '), true);
  assert.equal(dollarOpensEditor('price \\'), false);
  assert.equal(dollarOpensEditor('manual $x^2'), false);
  assert.equal(dollarOpensEditor('a $x$ and '), true);
});

test('block formulas keep their single- or multi-line shape', () => {
  assert.equal(blockTex('$$\nx^2\n$$'), 'x^2');
  assert.equal(blockTex('$$x^2$$'), 'x^2');
  assert.equal(blockSource('y', '$$\nx\n$$'), '$$\ny\n$$');
  assert.equal(blockSource('y', '$$x$$'), '$$y$$');
  assert.equal(blockSource('a\\\\\nb', '$$x$$'), '$$\na\\\\\nb\n$$');
});
