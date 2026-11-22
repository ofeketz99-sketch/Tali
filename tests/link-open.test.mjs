import test from 'node:test';
import assert from 'node:assert/strict';
import { isMiddleClick, linkOpenOptions } from '../src/link-open.js';

test('note links open in a new tab with MB3, Ctrl or Command', () => {
  assert.equal(isMiddleClick({ button: 1 }), true);
  assert.deepEqual(linkOpenOptions({ button: 0 }), { newTab: false });
  assert.deepEqual(linkOpenOptions({ button: 1 }), { newTab: true });
  assert.deepEqual(linkOpenOptions({ button: 0, ctrlKey: true }), { newTab: true });
  assert.deepEqual(linkOpenOptions({ button: 0, metaKey: true }), { newTab: true });
});
