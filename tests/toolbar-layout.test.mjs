import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/toolbar-layout.js', import.meta.url));
const { TOOLBAR_IDS, OPTIONAL_IDS, normalizeToolbarLayout, moveToolbarGroup, setToolbarGroupVisible } =
  await import('data:text/javascript;base64,' + source.toString('base64'));

test('empty prefs give the default order; only the optional groups are hidden', () => {
  const { order, hidden, shown } = normalizeToolbarLayout(undefined, undefined, undefined);
  assert.deepEqual(order, TOOLBAR_IDS);
  assert.deepEqual(hidden, OPTIONAL_IDS);
  assert.deepEqual(shown, []);
  assert.ok(OPTIONAL_IDS.length >= 4);
  // the groups that existed in 8.2 stay visible for users who never opened the settings
  for (const id of ['history', 'style', 'marks', 'colors', 'lists', 'align', 'insert', 'draw', 'view']) assert.ok(!hidden.includes(id), id);
});

test('unknown and duplicate ids are dropped, missing groups return at their default neighbour', () => {
  const { order, hidden } = normalizeToolbarLayout(['view', 'marks', 'bogus', 'marks', 'history'], ['bogus', 'align', 'align']);
  assert.deepEqual(hidden.filter((id) => !OPTIONAL_IDS.includes(id)), ['align']);
  assert.equal(order.length, TOOLBAR_IDS.length);
  assert.deepEqual(order.slice(0, 2), ['view', 'marks']);
  assert.equal(order[order.indexOf('history') + 1], 'style');
  assert.equal(order[order.indexOf('insert') + 1], 'quickInsert');
});

test('optional groups show only when chosen; regular groups hide only when unchecked', () => {
  let prefs = { hidden: [], shown: [] };
  prefs = setToolbarGroupVisible(prefs.hidden, prefs.shown, 'export', true);
  assert.deepEqual(prefs, { hidden: [], shown: ['export'] });
  assert.ok(!normalizeToolbarLayout([], prefs.hidden, prefs.shown).hidden.includes('export'));
  prefs = setToolbarGroupVisible(prefs.hidden, prefs.shown, 'align', false);
  assert.deepEqual(prefs, { hidden: ['align'], shown: ['export'] });
  prefs = setToolbarGroupVisible(prefs.hidden, prefs.shown, 'export', false);
  assert.ok(normalizeToolbarLayout([], prefs.hidden, prefs.shown).hidden.includes('export'));
  prefs = setToolbarGroupVisible(prefs.hidden, prefs.shown, 'align', true);
  assert.deepEqual(prefs, { hidden: [], shown: [] });
});

test('moving a group swaps it with its neighbour and stops at the ends', () => {
  const order = ['a', 'b', 'c'];
  assert.deepEqual(moveToolbarGroup(order, 'b', -1), ['b', 'a', 'c']);
  assert.deepEqual(moveToolbarGroup(order, 'c', 1), order);
  assert.deepEqual(moveToolbarGroup(order, 'x', 1), order);
});
