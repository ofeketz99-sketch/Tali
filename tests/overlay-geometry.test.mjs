import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/overlay-geometry.js', import.meta.url));
const { dragShape, normalizeBox, bboxOf, bboxOfMany, resizeBox, fitToBox, moveLineEnd } =
  await import('data:text/javascript;base64,' + source.toString('base64'));

test('dragShape: lines keep direction, shift snaps to 45 degrees', () => {
  assert.deepEqual(dragShape('line', { x: 10, y: 10 }, { x: 40, y: 0 }), { x: 10, y: 10, dx: 30, dy: -10 });
  const snapped = dragShape('arrow', { x: 0, y: 0 }, { x: 50, y: 6 }, { shift: true });
  assert.equal(snapped.dy, 0);
  assert.equal(snapped.dx, 50);
});

test('dragShape: boxes are normalized, shift makes a square, alt grows from the centre', () => {
  assert.deepEqual(dragShape('rect', { x: 50, y: 50 }, { x: 20, y: 10 }), { x: 20, y: 10, dx: 30, dy: 40 });
  assert.deepEqual(dragShape('ellipse', { x: 0, y: 0 }, { x: 30, y: 10 }, { shift: true }), { x: 0, y: 0, dx: 30, dy: 30 });
  assert.deepEqual(dragShape('rect', { x: 100, y: 100 }, { x: 110, y: 120 }, { alt: true }), { x: 90, y: 80, dx: 20, dy: 40 });
  assert.deepEqual(normalizeBox({ x: 10, y: 10, dx: -5, dy: 5 }), { x: 5, y: 10, dx: 5, dy: 5 });
});

test('bounding boxes of shapes, lines and pens', () => {
  assert.deepEqual(bboxOf({ kind: 'line', x: 10, y: 20, dx: -10, dy: 5 }), { x: 0, y: 20, w: 10, h: 5 });
  assert.deepEqual(bboxOf({ kind: 'pen', x: 100, y: 100, weight: 2, strokes: [[[0, 0], [10, 5]], [[-5, 2]]] }),
    { x: 94, y: 99, w: 17, h: 7 });
  assert.deepEqual(bboxOf({ kind: 'pen', x: 5, y: 5, points: [[0, 0], [4, 4]], weight: 0 }), { x: 5, y: 5, w: 4, h: 4 });
  assert.deepEqual(bboxOfMany([{ kind: 'rect', x: 0, y: 0, dx: 10, dy: 10 }, { kind: 'rect', x: 20, y: 5, dx: 5, dy: 20 }]),
    { x: 0, y: 0, w: 25, h: 25 });
  assert.equal(bboxOfMany([]), null);
});

test('resizeBox: opposite corner is fixed, shift keeps the ratio, a box can flip', () => {
  const box = { x: 0, y: 0, w: 100, h: 50 };
  const se = resizeBox(box, 'se', 20, 10);
  assert.deepEqual([se.x, se.y, se.w, se.h], [0, 0, 120, 60]);
  const nw = resizeBox(box, 'nw', 10, 10);
  assert.deepEqual([nw.x, nw.y, nw.w, nw.h], [10, 10, 90, 40]);
  const ratio = resizeBox(box, 'se', 100, 0, { keepRatio: true });
  assert.deepEqual([ratio.w, ratio.h], [200, 100]);
  const flipped = resizeBox(box, 'se', -150, 0);
  assert.equal(flipped.flipX, true);
  assert.deepEqual([flipped.x, flipped.w], [-50, 50]);
});

test('fitToBox scales pens and shapes from the original, without drift', () => {
  const pen = { id: 'p', kind: 'pen', x: 10, y: 10, weight: 0, strokes: [[[0, 0], [10, 10]]] };
  const from = bboxOf(pen);
  const big = fitToBox(pen, from, { x: 10, y: 10, w: 20, h: 20 });
  assert.deepEqual(big.strokes, [[[0, 0], [20, 20]]]);
  assert.deepEqual(bboxOf(big), { x: 10, y: 10, w: 20, h: 20 });
  const moved = fitToBox(pen, from, { x: 50, y: 60, w: 10, h: 10 });
  assert.deepEqual([moved.x, moved.y], [50, 60]);
  const rect = fitToBox({ kind: 'rect', x: 0, y: 0, dx: 10, dy: 10 }, { x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 30, h: 5 });
  assert.deepEqual([rect.x, rect.y, rect.dx, rect.dy], [0, 0, 30, 5]);
  const mirrored = fitToBox({ kind: 'line', x: 0, y: 0, dx: 10, dy: 0 }, { x: 0, y: 0, w: 10, h: 0 }, { x: 0, y: 0, w: 10, h: 0 }, { flipX: true });
  assert.deepEqual([mirrored.x, mirrored.dx], [10, -10]);
});

test('moveLineEnd moves one end only', () => {
  const line = { kind: 'arrow', x: 0, y: 0, dx: 10, dy: 0 };
  assert.deepEqual(moveLineEnd(line, 'end', 5, 5), { kind: 'arrow', x: 0, y: 0, dx: 15, dy: 5 });
  const start = moveLineEnd(line, 'start', -5, 0);
  assert.deepEqual([start.x, start.y, start.x + start.dx, start.y + start.dy], [-5, 0, 10, 0]);
});
