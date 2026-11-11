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

test('one drawing session is saved as a group while legacy strokes stay independent', async () => {
  const source = readFileSync(new URL('../src/overlay-data.js', import.meta.url));
  const { groupedSelection } = await import('data:text/javascript;base64,' + source.toString('base64'));
  const withGroup = [
    { id: 'one', kind: 'pen', x: 10, y: 10, points: [[0, 0], [20, 20]], color: '#4b80bd', weight: 2, group: 'session-01' },
    { id: 'two', kind: 'arrow', x: 70, y: 20, dx: 40, dy: 10, color: '#4b80bd', weight: 2, group: 'session-01' },
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
