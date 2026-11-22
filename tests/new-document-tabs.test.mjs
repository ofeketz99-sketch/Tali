import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');

function functionBody(name, nextMarker) {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(nextMarker, start);
  assert.notEqual(start, -1, `${name} should exist`);
  assert.notEqual(end, -1, `${name} should have a stable boundary`);
  return source.slice(start, end);
}

test('a new canvas opens in a new tab instead of replacing the current note', () => {
  const body = functionBody('newCanvas', '// ===== קישורים =====');
  assert.match(body, /openNote\(file, \{ newTab: true \}\)/);
});

test('new notes and template notes also keep the current tab', () => {
  const note = functionBody('newNote', '// "ללא שם"');
  const template = functionBody('newNoteFromTemplate', '// הוספת תבנית');
  assert.match(note, /openNote\(file, \{ newTab: true \}\)/);
  assert.match(template, /openNote\(file, \{ newTab: true \}\)/);
});
