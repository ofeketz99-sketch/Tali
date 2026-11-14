import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/overlay-data.js', import.meta.url));
const { mergeShapes, groupedSelection, cleanOverlayObjects } =
  await import('data:text/javascript;base64,' + source.toString('base64'));

const pen = (id, x, y, color = '#4b80bd', weight = 3) => ({ id, kind: 'pen', x, y, color, weight, strokes: [[[0, 0], [10, 5]]] });

test('pens with the same colour and weight become one pen with all the strokes in place', () => {
  const items = [pen('a', 100, 100), pen('b', 150, 120), { id: 't', kind: 'textbox', x: 0, y: 0, width: 200, height: 80, text: '' }];
  const out = mergeShapes(items, ['a', 'b'], 'g1');
  assert.equal(out.length, 2);
  const joined = out.find((o) => o.id === 'a');
  assert.equal(joined.group, undefined);
  assert.deepEqual(joined.strokes, [[[0, 0], [10, 5]], [[50, 20], [60, 25]]]);
  assert.ok(out.some((o) => o.id === 't'));
});

test('mixed shapes share one group and are selected together; text boxes are never grouped', () => {
  const items = [pen('a', 0, 0), { id: 'r', kind: 'rect', x: 5, y: 5, dx: 20, dy: 10, color: '#000000', weight: 2 },
    { id: 't', kind: 'textbox', x: 0, y: 0, width: 200, height: 80, text: '' }];
  const out = mergeShapes(items, ['a', 'r', 't'], 'g2');
  assert.equal(out.find((o) => o.id === 'a').group, 'g2');
  assert.equal(out.find((o) => o.id === 'r').group, 'g2');
  assert.equal(out.find((o) => o.id === 't').group, undefined);
  assert.deepEqual(groupedSelection(out, 'r').map((o) => o.id), ['a', 'r']);
  // the group survives saving (cleanOverlayObjects) for every drawn shape, and never for text boxes
  const clean = cleanOverlayObjects([...out, { ...out[2], group: 'g2' }]);
  assert.equal(clean.find((o) => o.id === 'r').group, 'g2');
  assert.ok(clean.filter((o) => o.kind === 'textbox').every((o) => !o.group));
});

test('pens in different colours are grouped, not joined', () => {
  const out = mergeShapes([pen('a', 0, 0, '#111111'), pen('b', 0, 0, '#222222')], ['a', 'b'], 'g3');
  assert.equal(out.length, 2);
  assert.ok(out.every((o) => o.group === 'g3'));
});

test('one selected shape is left as it is', () => {
  const items = [pen('a', 0, 0)];
  assert.equal(mergeShapes(items, ['a'], 'g'), items);
});
