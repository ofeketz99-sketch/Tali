import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/overlay-data.js', import.meta.url));
const { splitOverlay, joinOverlay } =
  await import('data:text/javascript;base64,' + source.toString('base64'));

const objects = [
  { id: 'arrow-1', kind: 'arrow', x: 75, y: 180, dx: 90, dy: 30, color: '#4b80bd', weight: 2.5 },
  { id: 'box-1', kind: 'textbox', x: 15, y: 230, width: 250, height: 120,
    text: 'עברית and English\nשורה שנייה', color: '#4b80bd', weight: 2.5 },
];

test('ordinary Markdown is left untouched when there are no annotations', () => {
  const input = '---\nfoo: bar\n---\n# כותרת\n\n$$x+y$$\n';
  assert.equal(joinOverlay(input, []), input);
  assert.deepEqual(splitOverlay(input), { markdown: input, objects: [] });
});

test('annotations round-trip without changing note content, including trailing blank lines', () => {
  const notes = ['Text', 'Text\n', 'Text\n\n', 'Text\r\n', 'Text\r\n\r\n',
    '---\r\nfoo: bar\r\n---\r\nשלום English\r\n\r\n'];
  for (const input of notes) {
    const output = joinOverlay(input, objects);
    const parsed = splitOverlay(output);
    assert.equal(parsed.markdown, input);
    assert.deepEqual(parsed.objects, objects);
    assert.equal(joinOverlay(parsed.markdown, parsed.objects), output);
  }
});

test('invalid or unfamiliar metadata is never stripped from a note', () => {
  const input = '# Title\n\n<!-- TALI-OVERLAY:v1:%oops -->\n';
  assert.equal(splitOverlay(input).markdown, input);
});

test('only known annotation kinds and finite coordinates survive sanitization', () => {
  const content = joinOverlay('Text\n', [
    { id: 'injected', kind: 'script', x: 0, y: 0 },
    { ...objects[0], x: Infinity },
    ...objects,
  ]);
  const parsed = splitOverlay(content);
  assert.equal(parsed.markdown, 'Text\n');
  assert.equal(parsed.objects.length, 3);
  assert.equal(parsed.objects[0].x, 50);
});

test('only freehand strokes from one drawing session are grouped', async () => {
  const source = readFileSync(new URL('../src/overlay-data.js', import.meta.url));
  const { groupedSelection } = await import('data:text/javascript;base64,' + source.toString('base64'));
  const withGroup = [
    { id: 'one', kind: 'pen', x: 10, y: 10, points: [[0, 0], [20, 20]], color: '#4b80bd', weight: 2, group: 'session-01' },
    { id: 'two', kind: 'pen', x: 70, y: 20, points: [[0, 0], [40, 10]], color: '#4b80bd', weight: 2, group: 'session-01' },
    { id: 'three', kind: 'line', x: 10, y: 60, dx: 50, dy: 0, color: '#4b80bd', weight: 2 },
    { id: 'box', kind: 'textbox', x: 10, y: 90, width: 200, height: 100, text: 'hello', group: 'session-01' },
  ];
  const restored = splitOverlay(joinOverlay('Note', withGroup)).objects;
  assert.deepEqual(groupedSelection(restored, 'one').map(o => o.id), ['one', 'two']);
  assert.deepEqual(groupedSelection(restored, 'two').map(o => o.id), ['one', 'two']);
  assert.deepEqual(groupedSelection(restored, 'three').map(o => o.id), ['three']);
  assert.deepEqual(groupedSelection(restored, 'box').map(o => o.id), ['box']);
  assert.equal(restored[3].group, undefined);
});

test('margin comments preserve their quote but never join drawing groups', async () => {
  const source = readFileSync(new URL('../src/overlay-data.js', import.meta.url));
  const { groupedSelection } = await import('data:text/javascript;base64,' + source.toString('base64'));
  const comment = { id: 'c1', kind: 'comment', x: -260, y: 100, width: 220, height: 130,
    text: 'בדיקה', quote: 'ציטוט מן המסמך', side: 'start', color: '#4b80bd', weight: 2, group: 'session-01' };
  const restored = splitOverlay(joinOverlay('Note', [comment])).objects[0];
  assert.equal(restored.quote, comment.quote);
  assert.equal(restored.group, undefined);
  assert.deepEqual(groupedSelection([restored], 'c1'), [restored]);
});

test('dash and fill survive a round trip only where they make sense', () => {
  const items = [
    { id: 'r', kind: 'rect', x: 0, y: 0, dx: 40, dy: 20, color: '#4b80bd', weight: 2, dash: true, fill: 'tint' },
    { id: 'l', kind: 'line', x: 0, y: 0, dx: 40, dy: 0, color: '#4b80bd', weight: 2, dash: true, fill: 'tint' },
    { id: 'p', kind: 'pen', x: 0, y: 0, strokes: [[[0, 0], [1.5, 2.5]]], color: '#4b80bd', weight: 2, dash: true },
    { id: 'e', kind: 'ellipse', x: 0, y: 0, dx: 10, dy: 10, color: '#4b80bd', weight: 2, dash: 'yes', fill: 'red' },
  ];
  const [rect, line, pen, ellipse] = splitOverlay(joinOverlay('Note', items)).objects;
  assert.equal(rect.dash, true); assert.equal(rect.fill, 'tint');
  assert.equal(line.dash, true); assert.equal(line.fill, undefined);
  assert.equal(pen.dash, undefined);
  assert.deepEqual(pen.strokes, [[[0, 0], [1.5, 2.5]]]);
  assert.equal(ellipse.dash, undefined); assert.equal(ellipse.fill, undefined);
});

test('one freehand entity preserves several separate strokes', () => {
  const pen = { id: 'pen-1', kind: 'pen', x: 20, y: 30,
    strokes: [[[0, 0], [10, 8], [20, 4]], [[35, 12], [44, 18]]],
    color: '#4b80bd', weight: 2.5 };
  const restored = splitOverlay(joinOverlay('Note', [pen])).objects;
  assert.deepEqual(restored, [pen]);
});
