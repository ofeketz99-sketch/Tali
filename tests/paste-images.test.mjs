import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/paste-images.js', import.meta.url));
const { lonelyImageSrc, fileFromDataUrl, imageFilesFrom } =
  await import('data:text/javascript;base64,' + source.toString('base64'));

test('HTML that is only one image gives its address', () => {
  assert.equal(lonelyImageSrc('<html><body><!--StartFragment--><img src="https://example.com/a.png?x=1&amp;y=2" alt=""><!--EndFragment--></body></html>'),
    'https://example.com/a.png?x=1&y=2');
  assert.equal(lonelyImageSrc("<img src='data:image/png;base64,AAAA'>"), 'data:image/png;base64,AAAA');
  assert.equal(lonelyImageSrc('<meta charset="utf-8"><img src=https://e.com/b.jpg>&nbsp;'), 'https://e.com/b.jpg');
});

test('HTML with text, several images or a local path is a normal paste', () => {
  assert.equal(lonelyImageSrc('<p>שלום <img src="https://e.com/a.png"></p>'), null);
  assert.equal(lonelyImageSrc('<img src="https://e.com/a.png"><img src="https://e.com/b.png">'), null);
  assert.equal(lonelyImageSrc('<img src="file:///C:/a.png">'), null);
  assert.equal(lonelyImageSrc(''), null);
  assert.equal(lonelyImageSrc(undefined), null);
});

test('a data: address becomes an image file', async () => {
  const file = fileFromDataUrl('data:image/png;base64,iVBORw0KGgo=');
  assert.equal(file.type, 'image/png');
  assert.equal(file.name, 'image.png');
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(fileFromDataUrl('data:text/plain,hi'), null);
});

test('image files come from files, or from items when files is empty', () => {
  const png = new File([new Uint8Array([1])], 'image.png', { type: 'image/png' });
  const txt = new File([new Uint8Array([1])], 'a.txt', { type: 'text/plain' });
  assert.deepEqual(imageFilesFrom({ files: [txt, png], items: [] }), [png]);
  assert.deepEqual(imageFilesFrom({ files: [], items: [{ kind: 'file', type: 'image/png', getAsFile: () => png }, { kind: 'string', type: 'text/html' }] }), [png]);
  assert.deepEqual(imageFilesFrom(null), []);
});
