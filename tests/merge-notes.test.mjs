import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { mergeNoteText, retargetMerged, splitNote } = require('../merge-notes.js');

test('appends the merged note under a heading named after it, dropping a duplicate H1', () => {
  const dest = '# חדש\n\nטקסט חדש.\n';
  const src = '# ישן\n\nרעיון ישן.\n\n- פריט\n';
  const { text, droppedProps, hadOverlay } = mergeNoteText(dest, src, 'ישן');
  assert.equal(text, '# חדש\n\nטקסט חדש.\n\n## ישן\n\nרעיון ישן.\n\n- פריט\n');
  assert.deepEqual(droppedProps, []);
  assert.equal(hadOverlay, false);
});

test('keeps the destination frontmatter and overlay, and reports what the source loses', () => {
  const overlay = '\n\n<!-- TALI-OVERLAY:v1:%7B%7D -->\n';
  const dest = '---\nflag: red\n---\nגוף' + overlay;
  const src = '---\ntags: [a]\ncreated: 2024-01-01\n---\nתוכן ישן\n\n<!-- TALI-OVERLAY:v1:%7Bx%7D -->\n';
  const { text, droppedProps, hadOverlay } = mergeNoteText(dest, src, 'ישן');
  assert.equal(text, '---\nflag: red\n---\nגוף\n\n## ישן\n\nתוכן ישן' + overlay);
  assert.deepEqual(droppedProps, ['tags']);
  assert.equal(hadOverlay, true);
  assert.equal(splitNote(text).overlay, overlay);
});

test('merges related links without duplicates or self links', () => {
  const dest = '---\nlinks:\n  - "[[א]]"\n  - "[[ישן]]"\n---\nגוף\n';
  const src = '---\nlinks:\n  - "[[א]]"\n  - "[[ב]]"\n  - "[[חדש]]"\n---\nתוכן\n';
  const isSelf = (t) => t === 'ישן' || t === 'חדש';
  const { text } = mergeNoteText(dest, src, 'ישן', isSelf);
  assert.equal(text, '---\nlinks:\n  - "[[א]]"\n  - "[[ב]]"\n---\nגוף\n\n## ישן\n\nתוכן\n');
});

test('keeps CRLF line endings of the destination', () => {
  const { text } = mergeNoteText('א\r\nב\r\n', 'ג\nד\n', 'ישן');
  assert.equal(text, 'א\r\nב\r\n\r\n## ישן\r\n\r\nג\r\nד\r\n');
});

test('an empty source still leaves a heading, an empty destination does not start with blank lines', () => {
  assert.equal(mergeNoteText('', 'תוכן', 'ישן').text, '## ישן\n\nתוכן\n');
  assert.equal(mergeNoteText('גוף\n', '', 'ישן').text, 'גוף\n\n## ישן\n');
});

test('merged headings move one level down, except inside code blocks', () => {
  const src = '# ישן\n\n## פרק\n\n```\n## לא כותרת\n```\n\n###### עמוק\n';
  assert.equal(mergeNoteText('גוף\n', src, 'ישן').text,
    'גוף\n\n## ישן\n\n### פרק\n\n```\n## לא כותרת\n```\n\n###### עמוק\n');
});

test('retargets links, headings, aliases and embeds to the merged section', () => {
  const isSource = (t) => t === 'ישן' || t === 'תיקייה/ישן';
  const text = 'ראו [[ישן]], [[ישן#פרק|כאן]], ![[תיקייה/ישן]] ו־[[אחר]].';
  assert.equal(retargetMerged(text, isSource, 'חדש', 'ישן'),
    'ראו [[חדש#ישן]], [[חדש#פרק|כאן]], ![[חדש#ישן]] ו־[[אחר]].');
});
