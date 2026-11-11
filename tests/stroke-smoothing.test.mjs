import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/stroke-smoothing.js', import.meta.url));
const { smoothStrokePoints, smoothSvgStroke } =
  await import('data:text/javascript;base64,' + src.toString('base64'));

test('freehand smoothing retains endpoints but damps jagged intermediate points', () => {
  const raw = [[0, 0], [10, 9], [20, -9], [30, 0]];
  const smooth = smoothStrokePoints(raw);
  assert.deepEqual(smooth[0], raw[0]);
  assert.deepEqual(smooth.at(-1), raw.at(-1));
  assert.ok(Math.abs(smooth[1][1]) < Math.abs(raw[1][1]));
  assert.ok(Math.abs(smooth[2][1]) < Math.abs(raw[2][1]));
  assert.deepEqual(raw, [[0, 0], [10, 9], [20, -9], [30, 0]]);
});

test('SVG smoothing emits cubic Bezier curves without invalid coordinates', () => {
  const d = smoothSvgStroke([[0, 0], [12, 8], [24, 0], [36, 10]]);
  assert.ok(d.startsWith('M0 0 C'));
  assert.ok(d.includes(' C'));
  assert.ok(!d.includes('NaN'));
  assert.ok(!d.includes('undefined'));
});

test('short strokes and malformed input fall back safely', () => {
  assert.equal(smoothSvgStroke([]), '');
  assert.equal(smoothSvgStroke([[0, 0], [4, 5]]), 'M0 0 L4 5');
  assert.equal(smoothSvgStroke([[0, 0]]), 'M0 0 l0.1 0');
  assert.deepEqual(smoothStrokePoints([[0, 0], [Infinity, 2], [4, 5]]), [[0, 0], [4, 5]]);
});
