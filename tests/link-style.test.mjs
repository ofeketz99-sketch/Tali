import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const wiki = readFileSync(new URL('../src/wikilink.js', import.meta.url), 'utf8');
const markdown = readFileSync(new URL('../src/obsidian-md.js', import.meta.url), 'utf8');

test('Markdown and Wiki links share the editor-only premium link class and automatic direction', () => {
  assert.match(markdown, /class: 'tali-link', dir: 'auto'/);
  assert.match(wiki, /class: 'wikilink tali-link'.*dir: 'auto'/);
  assert.match(wiki, /dom\.className = 'wikilink tali-link';\s*dom\.dir = 'auto'/);
});

test('premium links keep icons, wrapping, selection and motion accessibility', () => {
  assert.match(css, /\.ProseMirror \.tali-link \{/);
  assert.match(css, /display: inline;/);
  assert.match(css, /overflow-wrap: anywhere;/);
  assert.match(css, /box-decoration-break: clone;/);
  assert.match(css, /text-decoration: none !important;/);
  assert.match(css, /\.ProseMirror \.tali-link::before \{[\s\S]*mask-image: url/);
  assert.match(css, /font-size: 1\.03em;/);
  assert.match(css, /inset-block-start: -1px;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('wiki links do not trigger a duplicate native title tooltip', () => {
  assert.doesNotMatch(wiki, /class: 'wikilink tali-link', title:/);
  assert.doesNotMatch(wiki, /dom\.title\s*=/);
});
