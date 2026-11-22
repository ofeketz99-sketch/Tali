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

test('mixed shapes become ONE merged drawing (11.6); text boxes are never merged', () => {
  const items = [pen('a', 0, 0), { id: 'r', kind: 'rect', x: 5, y: 5, dx: 20, dy: 10, color: '#000000', weight: 2 },
    { id: 't', kind: 'textbox', x: 0, y: 0, width: 200, height: 80, text: '' }];
  const out = mergeShapes(items, ['a', 'r', 't'], 'g2');
  assert.equal(out.length, 2);
  const d = out.find((o) => o.id === 'a');
  assert.equal(d.kind, 'drawing');
  assert.deepEqual(d.parts.map((p) => [p.kind, p.x, p.y]), [['pen', 0, 0], ['rect', 5, 5]]);
  assert.ok(d.parts.every((p) => !p.id && !p.group));
  assert.ok(out.some((o) => o.id === 't'));
  // it survives saving, and legacy groups (8.3) are still read; text boxes never get a group
  const clean = cleanOverlayObjects([...out, { id: 'q', kind: 'line', x: 0, y: 0, dx: 4, dy: 4, group: 'g9' },
    { id: 't2', kind: 'textbox', x: 0, y: 0, width: 200, height: 80, text: '', group: 'g9' }]);
  assert.equal(clean.find((o) => o.id === 'a').parts.length, 2);
  assert.equal(clean.find((o) => o.id === 'q').group, 'g9');
  assert.deepEqual(groupedSelection(clean, 'q').map((o) => o.id), ['q']);
  assert.ok(clean.filter((o) => o.kind === 'textbox').every((o) => !o.group));
});

test('pens in different colours become a merged drawing, not a joined pen', () => {
  const out = mergeShapes([pen('a', 0, 0, '#111111'), pen('b', 0, 0, '#222222')], ['a', 'b'], 'g3');
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'drawing');
  assert.deepEqual(out[0].parts.map((p) => p.color), ['#111111', '#222222']);
});

test('merging a drawing again flattens it, keeps page positions and the drawing order', () => {
  const line = { id: 'l', kind: 'line', x: 100, y: 50, dx: 10, dy: 0, color: '#000000', weight: 2 };
  const first = mergeShapes([pen('a', 10, 10, '#111111'), line, pen('z', 0, 0)], ['a', 'l'], 'x');
  assert.deepEqual(first.map((o) => o.id), ['a', 'z']);
  const more = mergeShapes([...first, { id: 'e', kind: 'ellipse', x: 0, y: 0, dx: 5, dy: 5, color: '#000000', weight: 2 }], ['a', 'e'], 'y');
  const d = more.find((o) => o.kind === 'drawing');
  assert.deepEqual(d.parts.map((p) => [p.kind, d.x + p.x, d.y + p.y]), [['pen', 10, 10], ['line', 100, 50], ['ellipse', 0, 0]]);
  assert.deepEqual(more.map((o) => o.id), ['z', 'a']);
});

test('splitDrawing puts the parts back as separate shapes in place', async () => {
  const src = readFileSync(new URL('../src/overlay-data.js', import.meta.url));
  const { splitDrawing } = await import('data:text/javascript;base64,' + src.toString('base64'));
  const line = { id: 'l', kind: 'line', x: 100, y: 50, dx: 10, dy: 0, color: '#000000', weight: 2 };
  const merged = mergeShapes([pen('a', 10, 10, '#111111'), line], ['a', 'l'], 'x');
  let n = 0;
  const { items, ids } = splitDrawing(merged, 'a', () => 'n' + ++n);
  assert.deepEqual(ids, ['n1', 'n2']);
  assert.deepEqual(items.map((o) => [o.id, o.kind, o.x, o.y]), [['n1', 'pen', 10, 10], ['n2', 'line', 100, 50]]);
  assert.equal(splitDrawing(items, 'n1', () => 'q').ids.length, 0);
});

test('free image format fields survive cleaning; bad ones are dropped', () => {
  const [img] = cleanOverlayObjects([{ id: 'i', kind: 'image', src: 'a.png', x: 0, y: 0, width: 100, height: 50,
    rotate: 90, flipH: true, flipV: 'yes', crop: [10, 0, 5, 0], styles: ['shadow', 'glow'] }]);
  assert.equal(img.rotate, 90);
  assert.equal(img.flipH, true);
  assert.equal(img.flipV, undefined);
  assert.deepEqual(img.crop, [10, 0, 5, 0]);
  assert.deepEqual(img.styles, ['shadow']);
  const [bad] = cleanOverlayObjects([{ id: 'i', kind: 'image', src: 'a.png', rotate: 45, crop: [60, 0, 60, 0] }]);
  assert.equal(bad.rotate, undefined);
  assert.equal(bad.crop, undefined);
});

test('one selected shape is left as it is', () => {
  const items = [pen('a', 0, 0)];
  assert.equal(mergeShapes(items, ['a'], 'g'), items);
});

test('the page width the drawings refer to survives saving (8.4), and bad values are dropped', async () => {
  const src = readFileSync(new URL('../src/overlay-data.js', import.meta.url));
  const { joinOverlay, splitOverlay } = await import('data:text/javascript;base64,' + src.toString('base64'));
  const items = [{ id: 'r', kind: 'rect', x: 5, y: 5, dx: 20, dy: 10, color: '#000000', weight: 2 }];
  const out = joinOverlay('Text\n', items, { pageWidth: 820 });
  assert.equal(splitOverlay(out).pageWidth, 820);
  assert.equal(splitOverlay(out).markdown, 'Text\n');
  assert.equal(splitOverlay(joinOverlay('Text\n', items, { pageWidth: 'x' })).pageWidth, undefined);
  assert.equal(splitOverlay(joinOverlay('Text\n', items, { pageWidth: 50 })).pageWidth, undefined);
  assert.equal(joinOverlay('Text\n', [], { pageWidth: 820 }), 'Text\n');
});
