import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCommunities, seededOffset } from '../src/graph-model.js';

test('link communities separate two dense groups joined by one bridge', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const links = [['a', 'b'], ['b', 'c'], ['c', 'a'], ['d', 'e'], ['e', 'f'], ['f', 'd'], ['c', 'd']];
  const groups = detectCommunities(ids, links);
  assert.equal(groups.get('a'), groups.get('b'));
  assert.equal(groups.get('d'), groups.get('e'));
  assert.notEqual(groups.get('a'), groups.get('d'));
});

test('seeded offsets are stable and differ between documents', () => {
  assert.deepEqual(seededOffset('one'), seededOffset('one'));
  assert.notDeepEqual(seededOffset('one'), seededOffset('two'));
});
