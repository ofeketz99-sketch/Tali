import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

// The module imports TipTap / ProseMirror, so it is bundled (like the app) before loading it here.
const bundle = esbuild.buildSync({
  entryPoints: [fileURLToPath(new URL('../src/task-layout.js', import.meta.url))],
  bundle: true, format: 'esm', write: false, logLevel: 'silent',
});
const { completedLast, completedDividers, followItem } =
  await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64'));

test('completed items move after open items while both groups stay stable', () => {
  const items = [{ id: 1, done: true }, { id: 2, done: false }, { id: 3, done: true }, { id: 4, done: false }];
  assert.deepEqual(completedLast(items, (item) => item.done).map((item) => item.id), [2, 4, 1, 3]);
});

// A minimal stand-in for a ProseMirror doc: taskList nodes with items of a given size.
const item = (checked, nodeSize = 4) => ({ attrs: { checked }, nodeSize });
const docOf = (lists) => ({
  descendants(fn) {
    let pos = 0;
    for (const list of lists) {
      fn({ type: { name: 'taskList' }, forEach: (cb) => list.forEach(cb) }, pos);
      pos += 2 + list.reduce((s, i) => s + i.nodeSize, 0);
    }
  },
});

test('divider sits on the first completed item that follows an open one', () => {
  assert.deepEqual(completedDividers(docOf([[item(false), item(false), item(true), item(true)]])), [{ from: 9, to: 13 }]);
  // all done, or none done: no divider
  assert.deepEqual(completedDividers(docOf([[item(true), item(true)]])), []);
  assert.deepEqual(completedDividers(docOf([[item(false)]])), []);
  // one per list
  assert.equal(completedDividers(docOf([[item(false), item(true)], [item(false), item(true)]])).length, 2);
});

test('the cursor follows its item when the list is reordered', () => {
  // List at 10: items start at 11. Sizes 4, 4, 6. The open item (c) moves to the top.
  const a = item(true), b = item(true), c = item(false, 6);
  const before = [a, b, c], after = [c, a, b];
  assert.equal(followItem(19 + 2, 10, before, after), 11 + 2); // inside c: same offset, now first
  assert.equal(followItem(11 + 1, 10, before, after), 17 + 1); // inside a: shifted down by c's size
  assert.equal(followItem(5, 10, before, after), 5); // outside the list: unchanged
});
