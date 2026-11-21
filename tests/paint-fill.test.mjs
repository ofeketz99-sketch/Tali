import test from 'node:test';
import assert from 'node:assert/strict';
import { floodFill } from '../src/paint.js';

// 11.4: דלי מילוי בחלון הציור
const square = () => {
  const w = 10, h = 10, data = new Uint8ClampedArray(w * h * 4);
  for (let i = 2; i <= 7; i++) for (const [x, y] of [[i, 2], [i, 7], [2, i], [7, i]]) data[(y * w + x) * 4 + 3] = 255;
  return { width: w, height: h, data };
};
const at = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

test('the fill bucket fills a closed area and stops at its outline', () => {
  const img = square();
  assert.equal(floodFill(img, 4, 4, [255, 0, 0, 255]), true);
  assert.deepEqual(at(img, 4, 4), [255, 0, 0, 255]);
  assert.deepEqual(at(img, 2, 4), [0, 0, 0, 255]); // the outline stays
  assert.deepEqual(at(img, 0, 0), [0, 0, 0, 0]); // outside stays empty
});

test('filling an area with its own colour, or outside the image, does nothing', () => {
  const img = square();
  floodFill(img, 4, 4, [255, 0, 0, 255]);
  assert.equal(floodFill(img, 4, 4, [255, 0, 0, 255]), false);
  assert.equal(floodFill(img, -1, 4, [0, 0, 255, 255]), false);
});
