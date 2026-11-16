import test from 'node:test';
import assert from 'node:assert/strict';
import { isFormulaOnlyText, shouldResetCenteredOnBackspace, usesCompactToolbar } from '../src/editor-behavior.js';

test('only a whole-line LaTeX expression gets a fresh typing line', () => {
  assert.equal(isFormulaOnlyText('$x^2$'), true);
  assert.equal(isFormulaOnlyText('  $$\\int_0^1 x dx$$  '), true);
  assert.equal(isFormulaOnlyText('מחיר $5'), false);
  assert.equal(isFormulaOnlyText('לפני $x$ אחרי'), false);
  assert.equal(isFormulaOnlyText(''), false);
});

test('Backspace resets only an empty centered text block', () => {
  assert.equal(shouldResetCenteredOnBackspace({ empty: true, offset: 0, type: 'paragraph', textAlign: 'center' }), true);
  assert.equal(shouldResetCenteredOnBackspace({ empty: true, offset: 0, type: 'heading', textAlign: 'center' }), true);
  assert.equal(shouldResetCenteredOnBackspace({ empty: false, offset: 0, type: 'paragraph', textAlign: 'center' }), false);
  assert.equal(shouldResetCenteredOnBackspace({ empty: true, offset: 1, type: 'paragraph', textAlign: 'center' }), false);
  assert.equal(shouldResetCenteredOnBackspace({ empty: true, offset: 0, type: 'paragraph', textAlign: 'right' }), false);
});

test('the toolbar is compact only in a normal window', () => {
  assert.equal(usesCompactToolbar({ maximized: false, fullScreen: false }), true);
  assert.equal(usesCompactToolbar({ maximized: true, fullScreen: false }), false);
  assert.equal(usesCompactToolbar({ maximized: false, fullScreen: true }), false);
});
