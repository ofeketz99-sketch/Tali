import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeta } from '../src/vault-meta.js';

const root = 'C:\\Vault';
const join = (...parts) => [root, ...parts].join('\\');

function metaWith(backgrounds = {}, extra = {}) {
  const writes = [];
  const meta = createMeta({
    api: {
      metaRead: async () => ({ backgrounds, ...extra }),
      metaWrite: async (value) => { writes.push(value); },
    },
    getRoot: () => root,
  });
  return { meta, writes };
}

test('folder backgrounds are inherited by nested folders and notes', async () => {
  const { meta } = metaWith({ Projects: { color: 3, opacity: 24 } });
  await meta.load();
  assert.deepEqual(meta.backgroundOf(join('Projects')), { color: 3, opacity: 24 });
  assert.deepEqual(meta.backgroundOf(join('Projects', 'Alpha', 'plan.md')), { color: 3, opacity: 24 });
  assert.equal(meta.backgroundOf(join('Other', 'note.md')), null);
});

test('a nested folder overrides its parent background', async () => {
  const { meta } = metaWith({
    Projects: { color: 3, opacity: 24 },
    'Projects/Alpha': { color: 5, opacity: 40 },
  });
  await meta.load();
  assert.deepEqual(meta.backgroundOf(join('Projects', 'Alpha', 'plan.md')), { color: 5, opacity: 40 });
  assert.deepEqual(meta.backgroundOf(join('Projects', 'Beta', 'plan.md')), { color: 3, opacity: 24 });
});

test('a document can override its folder colour or have one of its own', async () => {
  const { meta } = metaWith({
    Projects: { color: 3, opacity: 24 },
    'Projects/Alpha/plan.md': { color: 7, opacity: 12 },
    'Loose.md': { color: 4, opacity: 30 },
  });
  await meta.load();
  assert.deepEqual(meta.backgroundOf(join('Projects', 'Alpha', 'plan.md')), { color: 7, opacity: 12 });
  assert.deepEqual(meta.ownBackground(join('Projects', 'Alpha', 'plan.md')), { color: 7, opacity: 12 });
  assert.deepEqual(meta.backgroundOf(join('Projects', 'Alpha', 'other.md')), { color: 3, opacity: 24 });
  assert.deepEqual(meta.backgroundOf(join('Loose.md')), { color: 4, opacity: 30 });
  meta.remap(join('Projects', 'Alpha', 'plan.md'), join('Projects', 'Alpha', 'renamed.md'));
  assert.equal(meta.ownBackground(join('Projects', 'Alpha', 'plan.md')), null);
  assert.deepEqual(meta.ownBackground(join('Projects', 'Alpha', 'renamed.md')), { color: 7, opacity: 12 });
  meta.drop(join('Projects', 'Alpha', 'renamed.md'));
  assert.equal(meta.ownBackground(join('Projects', 'Alpha', 'renamed.md')), null);
});

test('folder backgrounds follow rename and disappear on delete', async () => {
  const { meta } = metaWith({ Projects: { color: 2, opacity: 18 } });
  await meta.load();
  meta.remap(join('Projects'), join('Work'));
  assert.equal(meta.backgroundOf(join('Projects', 'plan.md')), null);
  assert.deepEqual(meta.backgroundOf(join('Work', 'plan.md')), { color: 2, opacity: 18 });
  meta.drop(join('Work'));
  assert.equal(meta.backgroundOf(join('Work', 'plan.md')), null);
});

test('graph positions follow rename and disappear on delete', async () => {
  const { meta } = metaWith({}, { graphLayout: { version: 1, nodes: {
    'Projects/plan.md': { x: 12.34, y: -8.76 },
    'Projects/other.md': { x: 40, y: 20 },
  } } });
  await meta.load();
  assert.deepEqual(meta.graphPositions().get(join('Projects', 'plan.md')), { x: 12.3, y: -8.8 });
  meta.remap(join('Projects'), join('Work'));
  assert.equal(meta.graphPositions().has(join('Projects', 'plan.md')), false);
  assert.deepEqual(meta.graphPositions().get(join('Work', 'plan.md')), { x: 12.3, y: -8.8 });
  meta.drop(join('Work', 'plan.md'));
  assert.equal(meta.graphPositions().has(join('Work', 'plan.md')), false);
  assert.equal(meta.graphPositions().has(join('Work', 'other.md')), true);
});
