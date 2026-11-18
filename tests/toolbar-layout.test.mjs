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

// ===== 10.4: כפתורים בודדים =====
const tb = await import('data:text/javascript;base64,' + source.toString('base64'));
const ids = (sections) => sections.map((s) => s.items);

test('without a saved layout the toolbar follows the old group settings', () => {
  const plain = tb.normalizeToolbar({});
  assert.deepEqual(ids(plain)[0], ['undo', 'redo']);
  assert.ok(!plain.flat().some((s) => s.items.includes('exportPdf'))); // optional group stays hidden
  const old = tb.normalizeToolbar({ toolbarOrder: ['view', 'history'], toolbarHidden: ['align'], toolbarShown: ['export'] });
  assert.deepEqual(ids(old)[0], ['focus', 'sleep', 'raw']);
  assert.ok(!old.some((s) => s.items.includes('alignLeft')));
  assert.ok(old.some((s) => s.items.includes('exportWord')));
  // every item belongs to a known group
  for (const id of tb.ITEM_IDS) assert.ok(TOOLBAR_IDS.includes(tb.itemGroup(id)), id);
});

test('a saved layout drops unknown and duplicate buttons, and new buttons join their siblings', () => {
  const known = tb.ITEM_IDS.filter((id) => id !== 'italic');
  const s = tb.normalizeToolbar({ toolbarLayout: { sections: [{ items: ['bold', 'bogus', 'bold'] }, { items: [] }, { items: ['raw'] }], known } });
  assert.deepEqual(ids(s), [['bold', 'italic'], ['raw']]);
  // a button the user removed (it was known) does not come back
  const t = tb.normalizeToolbar({ toolbarLayout: { sections: [{ items: ['raw'] }], known: tb.ITEM_IDS } });
  assert.deepEqual(ids(t), [['raw']]);
});

test('buttons move between groups, into a new group, and out of the toolbar', () => {
  const start = [{ items: ['undo', 'redo'] }, { items: ['bold', 'italic'] }];
  assert.deepEqual(ids(tb.moveItem(start, 'undo', 1, 1)), [['redo'], ['bold', 'undo', 'italic']]);
  assert.deepEqual(ids(tb.moveItem(start, 'bold', 0, 0, { asNew: true })), [['bold'], ['undo', 'redo'], ['italic']]);
  // the only button of a group: the empty group disappears
  assert.deepEqual(ids(tb.moveItem([{ items: ['a1'] }, { items: ['bold'] }].map((x) => x), 'bold', 0, 9)).length, 1);
  // same group, moving forward counts positions before the move
  assert.deepEqual(ids(tb.moveItem([{ items: ['undo', 'redo', 'bold'] }], 'undo', 0, 2)), [['redo', 'undo', 'bold']]);
  // a button that was not in the toolbar is added
  assert.deepEqual(ids(tb.moveItem(start, 'raw', 2, 0, { asNew: true })), [['undo', 'redo'], ['bold', 'italic'], ['raw']]);
  assert.deepEqual(ids(tb.removeItem(start, 'undo')), [['redo'], ['bold', 'italic']]);
  assert.ok(tb.unusedItems(start).includes('raw'));
  assert.ok(!tb.unusedItems(start).includes('bold'));
});

test('groups split, merge, move and are removed', () => {
  const start = [{ items: ['undo', 'redo'] }, { items: ['bold'] }];
  assert.deepEqual(ids(tb.splitSection(start, 0)), [['undo'], ['redo'], ['bold']]);
  assert.deepEqual(ids(tb.mergeWithNext(start, 0)), [['undo', 'redo', 'bold']]);
  assert.deepEqual(ids(tb.mergeWithNext(start, 1)), ids(start));
  assert.deepEqual(ids(tb.moveSection(start, 1, -1)), [['bold'], ['undo', 'redo']]);
  assert.deepEqual(ids(tb.removeSection(start, 0)), [['bold']]);
  const saved = tb.toolbarLayoutValue([{ items: ['bold'] }, { items: [] }]);
  assert.deepEqual(saved.sections, [{ items: ['bold'] }]);
  assert.deepEqual(saved.known, tb.ITEM_IDS);
});

test('groups are dragged to a new place or onto another group (10.8)', () => {
  const start = [{ items: ['undo'] }, { items: ['bold'] }, { items: ['raw'] }];
  assert.deepEqual(ids(tb.moveSectionTo(start, 0, 2)), [['bold'], ['raw'], ['undo']]);
  assert.deepEqual(ids(tb.moveSectionTo(start, 2, 0)), [['raw'], ['undo'], ['bold']]);
  assert.deepEqual(ids(tb.moveSectionTo(start, 1, 1)), ids(start));
  assert.deepEqual(ids(tb.mergeSectionInto(start, 0, 2)), [['bold'], ['raw', 'undo']]);
  assert.deepEqual(ids(tb.mergeSectionInto(start, 2, 0)), [['undo', 'raw'], ['bold']]);
  assert.deepEqual(ids(tb.mergeSectionInto(start, 1, 1)), ids(start));
});
