import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeta } from '../src/vault-meta.js';

const root = 'C:\\Vault';
const join = (...parts) => [root, ...parts].join('\\');

function metaWith(backgrounds = {}) {
  const writes = [];
  const meta = createMeta({
    api: {
      metaRead: async () => ({ backgrounds }),
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

test('folder backgrounds follow rename and disappear on delete', async () => {
  const { meta } = metaWith({ Projects: { color: 2, opacity: 18 } });
  await meta.load();
  meta.remap(join('Projects'), join('Work'));
  assert.equal(meta.backgroundOf(join('Projects', 'plan.md')), null);
  assert.deepEqual(meta.backgroundOf(join('Work', 'plan.md')), { color: 2, opacity: 18 });
  meta.drop(join('Work'));
  assert.equal(meta.backgroundOf(join('Work', 'plan.md')), null);
});
