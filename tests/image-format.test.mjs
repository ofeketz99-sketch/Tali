import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/image-format.js', import.meta.url));
const F = await import('data:text/javascript;base64,' + source.toString('base64'));

test('old embed targets keep their meaning (width, wrap)', () => {
  const { name, format, extra } = F.parseEmbedTarget('a.png|300|wrap-left');
  assert.equal(name, 'a.png');
  assert.equal(format.width, 300);
  assert.equal(format.layout, 'wrap-left');
  assert.deepEqual(extra, []);
  assert.equal(F.formatEmbedTarget(name, format, extra), 'a.png|300|wrap-left');
  assert.equal(F.formatEmbedTarget('a.png', F.emptyFormat()), 'a.png');
});

test('all the new fields round-trip, in a fixed order, and unknown fields are kept', () => {
  const t = 'pics/a b.png|320x200|shadow|crop-10-0-5.5-0|rot-90|my note|flip-v|center';
  const { name, format, extra } = F.parseEmbedTarget(t);
  assert.equal(name, 'pics/a b.png');
  assert.deepEqual([format.width, format.height, format.layout, format.rotate, format.flipV, format.flipH], [320, 200, 'center', 90, true, false]);
  assert.deepEqual(format.crop, [10, 0, 5.5, 0]);
  assert.deepEqual(format.styles, ['shadow']);
  assert.deepEqual(extra, ['my note']);
  assert.equal(F.formatEmbedTarget(name, format, extra), 'pics/a b.png|320x200|my note|center|rot-90|flip-v|crop-10-0-5.5-0|shadow');
});

test('bad values are cleaned', () => {
  assert.equal(F.cleanCrop([50, 0, 50, 0]), null);
  assert.equal(F.cleanCrop([0, 0, 0, 0]), null);
  assert.equal(F.normalizeRotation(-90), 270);
  assert.equal(F.normalizeRotation(450), 90);
  assert.equal(F.cleanFormat({ height: 100 }).height, null); // a height needs a width
  assert.equal(F.isPlain(F.parseEmbedTarget('a.png').format), true);
  assert.equal(F.needsFrame(F.parseEmbedTarget('a.png|300').format), false);
  assert.equal(F.needsFrame(F.parseEmbedTarget('a.png|300|flip-h').format), true);
});

test('rotating swaps an explicit width and height', () => {
  const f = F.rotateFormat(F.cleanFormat({ width: 300, height: 100, rotate: 270 }), 1);
  assert.deepEqual([f.rotate, f.width, f.height], [0, 100, 300]);
});

test('visible ratio and box size follow the crop and the rotation', () => {
  const nat = { w: 400, h: 200 };
  assert.equal(F.visibleRatio(nat, F.emptyFormat()), 2);
  assert.equal(F.visibleRatio(nat, F.cleanFormat({ rotate: 90 })), 0.5);
  assert.equal(F.visibleRatio(nat, F.cleanFormat({ crop: [0, 25, 0, 25] })), 1);
  assert.deepEqual(F.boxSize(nat, F.cleanFormat({ width: 100, rotate: 90 })), { w: 100, h: 200 });
  assert.deepEqual(F.boxSize(nat, F.cleanFormat({ width: 100, height: 30 })), { w: 100, h: 30 });
  // 100%: the visible part at its own size
  assert.deepEqual(F.boxSize(nat, F.cleanFormat({ crop: [0, 25, 0, 25] })), { w: 200, h: 200 });
  assert.deepEqual(F.naturalBox(nat, F.cleanFormat({ rotate: 90, crop: [50, 0, 0, 0] })), { w: 100, h: 400 });
});

test('frame styles: the crop window and the image offsets', () => {
  const s = F.frameStyles(F.cleanFormat({ crop: [0, 0, 50, 50], flipH: true }), 1);
  assert.equal(s.inner.width, '100%');
  assert.equal(s.img.width, '200%');
  assert.equal(s.img.height, '200%');
  assert.equal(s.img.left, '-100%');
  assert.equal(s.inner.transform, 'scale(-1, 1)');
  const r = F.frameStyles(F.cleanFormat({ rotate: 90 }), 2);
  assert.equal(r.inner.width, '50%');
  assert.equal(r.inner.height, '200%');
  assert.equal(r.inner.left, '25%');
  assert.equal(r.inner.top, '-50%');
  assert.equal(r.inner.transform, 'rotate(90deg)');
});

test('wrap attributes of <img> map to layouts and back', () => {
  assert.equal(F.layoutFromWrapAttr('left'), 'wrap-left');
  assert.equal(F.layoutFromWrapAttr('center'), 'center');
  assert.equal(F.layoutFromWrapAttr(null), 'inline');
  assert.equal(F.wrapAttrFromLayout('wrap-right'), 'right');
  assert.equal(F.wrapAttrFromLayout('break-left'), 'break-left');
  assert.equal(F.wrapAttrFromLayout('inline'), null);
  assert.deepEqual(F.parseCropAttr('10, 0, 5, 0'), [10, 0, 5, 0]);
  assert.equal(F.withoutLayout('a.png|300|wrap-left|rot-90'), 'a.png|300|rot-90');
});
