import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('direction-aware lists keep tiptap-markdown default parsers', () => {
  const source = readFileSync(new URL('../src/list-direction.js', import.meta.url), 'utf8');
  assert.equal(source.includes('parse: {}'), false,
    'an empty custom parser replaces task-list parsing and renders [x] as plain bullet text');
  assert.match(source, /DirectionTaskList[\s\S]*?serialize\(state, node\)/);
  assert.match(source, /upgradeLegacyDirectionTasks/);
});
