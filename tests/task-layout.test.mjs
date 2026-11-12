import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let source = readFileSync(new URL('../src/task-layout.js', import.meta.url), 'utf8');
source = source.replace("import { Fragment } from '@tiptap/pm/model';", 'const Fragment = {};');
const { completedLast } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('completed items move after open items while both groups stay stable', () => {
  const items = [{ id: 1, done: true }, { id: 2, done: false }, { id: 3, done: true }, { id: 4, done: false }];
  assert.deepEqual(completedLast(items, (item) => item.done).map((item) => item.id), [2, 4, 1, 3]);
});

