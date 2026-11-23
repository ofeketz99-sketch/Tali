import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const preview = readFileSync(new URL('../src/hover-preview.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('link preview keeps the requested opening delay and closes promptly', () => {
  assert.match(preview, /const SHOW_DELAY = 480;/);
  assert.match(preview, /const HIDE_DELAY = 70;/);
  assert.match(preview, /const FADE_OUT_MS = 120;/);
});

test('link preview uses reading-view markup and animates in both directions', () => {
  assert.match(preview, /body\.className = 'np-body ProseMirror';/);
  assert.match(preview, /pop\.classList\.remove\('show'\)/);
  assert.match(preview, /requestAnimationFrame\(\(\) => requestAnimationFrame/);
  assert.match(css, /\.note-preview\.show \{ opacity: 1; transform: none; pointer-events: auto; \}/);
  assert.match(css, /\.np-body\.ProseMirror \{[^}]*min-height: 0;/);
});
