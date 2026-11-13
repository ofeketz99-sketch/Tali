import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

// The module imports perfect-freehand, so it is bundled (like the app) before loading it here.
const bundle = esbuild.buildSync({
  entryPoints: [fileURLToPath(new URL('../src/stroke-smoothing.js', import.meta.url))],
  bundle: true, format: 'esm', write: false, logLevel: 'silent',
});
const { smoothStrokePoints, smoothSvgStroke, simplifyStroke, freehandSvgPath, freehandOutline } =
  await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64'));

test('freehand smoothing retains endpoints but damps jagged intermediate points', () => {
  const raw = [[0, 0], [10, 9], [20, -9], [30, 0]];
  const smooth = smoothStrokePoints(raw);
  assert.deepEqual(smooth[0], raw[0]);
  assert.deepEqual(smooth.at(-1), raw.at(-1));
  assert.ok(Math.abs(smooth[1][1]) < Math.abs(raw[1][1]));
  assert.ok(Math.abs(smooth[2][1]) < Math.abs(raw[2][1]));
  assert.deepEqual(raw, [[0, 0], [10, 9], [20, -9], [30, 0]]);
});

test('SVG centreline emits cubic Bezier curves without invalid coordinates', () => {
  const d = smoothSvgStroke([[0, 0], [12, 8], [24, 0], [36, 10]]);
  assert.ok(d.startsWith('M0 0 C'));
  assert.ok(!d.includes('NaN'));
  assert.ok(!d.includes('undefined'));
});

test('short strokes and malformed input fall back safely', () => {
  assert.equal(smoothSvgStroke([]), '');
  assert.equal(smoothSvgStroke([[0, 0], [4, 5]]), 'M0 0 L4 5');
  assert.equal(smoothSvgStroke([[0, 0]]), 'M0 0 l0.1 0');
  assert.deepEqual(smoothStrokePoints([[0, 0], [Infinity, 2], [4, 5]]), [[0, 0], [4, 5]]);
});

test('simplify drops jitter on a straight line but keeps real corners', () => {
  const line = Array.from({ length: 50 }, (_, i) => [i * 2, (i % 2) * 0.3]);
  const simple = simplifyStroke(line, 0.6);
  assert.equal(simple.length, 2);
  assert.deepEqual(simple[0], [0, 0]);
  const corner = [[0, 0], [10, 0], [20, 0], [20, 10], [20, 20]];
  assert.deepEqual(simplifyStroke(corner), [[0, 0], [20, 0], [20, 20]]);
  assert.deepEqual(simplifyStroke([[0, 0], [NaN, 1], [3, 3]]), [[0, 0], [3, 3]]);
});

test('freehand outline is a closed, finite filled path; a click is a dot', () => {
  const pts = Array.from({ length: 30 }, (_, i) => [i * 4, Math.sin(i / 3) * 12]);
  const outline = freehandOutline(pts, 2.5);
  assert.ok(outline.length > 10);
  const d = freehandSvgPath(pts, 2.5);
  assert.ok(d.startsWith('M') && d.endsWith('Z'));
  assert.ok(!/NaN|undefined|Infinity/.test(d));
  const dot = freehandSvgPath([[5, 5]], 3);
  assert.ok(dot.startsWith('M') && dot.endsWith('Z') && !/NaN/.test(dot));
  assert.equal(freehandSvgPath([], 3), '');
});
