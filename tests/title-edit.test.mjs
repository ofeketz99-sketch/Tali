import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');

test('the temporary untitled name disappears when inline title editing starts', () => {
  const start = source.indexOf('function startTitleEdit');
  const end = source.indexOf('async function endTitleEdit', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const body = source.slice(start, end);
  assert.match(body, /const untitled = isUntitled\(state\.currentPath\)/);
  assert.match(body, /if \(untitled\) text\.textContent = ''/);
  assert.doesNotMatch(body, /selectAllChildren\(text\)[\s\S]*?isUntitled/);
});

test('leaving an empty inline title restores the existing file name', () => {
  const start = source.indexOf('async function endTitleEdit');
  const end = source.indexOf("{\n  const title = $('docTitle')", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const body = source.slice(start, end);
  assert.match(body, /if \(save && node && name && name !== current\)/);
  assert.match(body, /updateDocTitle\(\)/);
});
