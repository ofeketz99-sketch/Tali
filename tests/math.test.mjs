import test from 'node:test';
import assert from 'node:assert/strict';
import { findInlineMath, mathSourceAttrs } from '../src/math.js';

test('finds LaTeX source without changing its logical order', () => {
  const [formula] = findInlineMath('עברית $10^{-1}=0.1$ המשך');
  assert.deepEqual(formula, { from: 6, to: 19, tex: '10^{-1}=0.1', display: false });
});

test('editing source is isolated as LTR code', () => {
  assert.deepEqual(mathSourceAttrs(true), {
    class: 'math-src math-src-editing',
    dir: 'ltr',
    spellcheck: 'false',
    autocapitalize: 'off',
    translate: 'no',
    'data-math-source': 'editing',
  });
  assert.equal(mathSourceAttrs(true, true).class, 'math-src math-src-editing math-src-display');
});

test('inactive source stays hidden but keeps its bidi boundary', () => {
  const attrs = mathSourceAttrs(false);
  assert.equal(attrs.class, 'math-src');
  assert.equal(attrs.dir, 'ltr');
  assert.equal(attrs['data-math-source'], 'hidden');
});
