import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/png-meta.js', import.meta.url));
const { writePngText, readPngText, isPng } = await import('data:text/javascript;base64,' + source.toString('base64'));
const png = new Uint8Array(readFileSync(new URL('../build/icon.png', import.meta.url)));

test('text written into a PNG is read back, and the picture data is unchanged', () => {
  const value = JSON.stringify({ v: 1, items: [{ kind: 'pen', color: '#123456' }], note: 'שלום' });
  const out = writePngText(png, 'tali-vector', value);
  assert.ok(isPng(out));
  assert.equal(readPngText(out, 'tali-vector'), value);
  assert.equal(readPngText(png, 'tali-vector'), null);
  // writing again replaces the old value instead of adding a second one
  const again = writePngText(out, 'tali-vector', 'x');
  assert.equal(readPngText(again, 'tali-vector'), 'x');
  assert.equal(again.length, png.length + 12 + 'tali-vector'.length + 2);
  // the original chunks come first, unchanged
  assert.deepEqual(out.subarray(0, png.length - 12), png.subarray(0, png.length - 12));
});

test('not a PNG', () => {
  assert.equal(readPngText(new Uint8Array([1, 2, 3]), 'k'), null);
  assert.throws(() => writePngText(new Uint8Array([1, 2, 3]), 'k', 'v'));
});
