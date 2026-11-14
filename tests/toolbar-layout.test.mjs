import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/toolbar-layout.js', import.meta.url));
const { TOOLBAR_IDS, normalizeToolbarLayout, moveToolbarGroup } =
  await import('data:text/javascript;base64,' + source.toString('base64'));

test('empty prefs give the default order with nothing hidden', () => {
  assert.deepEqual(normalizeToolbarLayout(undefined, undefined), { order: TOOLBAR_IDS, hidden: [] });
});

test('unknown and duplicate ids are dropped, missing groups return at their default neighbour', () => {
  const { order, hidden } = normalizeToolbarLayout(['view', 'marks', 'bogus', 'marks', 'history'], ['bogus', 'align', 'align']);
  assert.deepEqual(hidden, ['align']);
  assert.equal(order.length, TOOLBAR_IDS.length);
  assert.deepEqual(order.slice(0, 2), ['view', 'marks']);
  // 'style' comes right after 'history' (its default predecessor), 'draw' right after 'insert'
  assert.equal(order[order.indexOf('history') + 1], 'style');
  assert.equal(order[order.indexOf('insert') + 1], 'draw');
});

test('moving a group swaps it with its neighbour and stops at the ends', () => {
  const order = ['a', 'b', 'c'];
  assert.deepEqual(moveToolbarGroup(order, 'b', -1), ['b', 'a', 'c']);
  assert.deepEqual(moveToolbarGroup(order, 'c', 1), order);
  assert.deepEqual(moveToolbarGroup(order, 'x', 1), order);
});
