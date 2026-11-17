import test from 'node:test';
import assert from 'node:assert/strict';
import { findInlineMath, mathSource, isValidInlineTex, dollarOpensEditor, blockTex, blockSource, arrowShortcut, MATH_SYMBOLS } from '../src/math.js';

test('typed arrows become LaTeX arrows, longest first', () => {
  assert.deepEqual(arrowShortcut('NH_4^+ + OH^- =>'), { length: 2, tex: '\\Rightarrow ' });
  assert.deepEqual(arrowShortcut('a ->'), { length: 2, tex: '\\rightarrow ' });
  assert.deepEqual(arrowShortcut('a <=>'), { length: 3, tex: '\\Leftrightarrow ' });
  assert.deepEqual(arrowShortcut('a <->'), { length: 3, tex: '\\leftrightarrow ' });
  assert.equal(arrowShortcut('a >'), null);
  assert.equal(arrowShortcut('a >='), null);
});

test('every symbol in the menu is a real LaTeX command with at most one caret mark', () => {
  for (const [, items] of MATH_SYMBOLS) {
    for (const [insert] of items) {
      assert.ok(insert.split('|').length <= 2, insert);
      assert.ok(!/[\r\n\t]/.test(insert), JSON.stringify(insert));
    }
  }
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
