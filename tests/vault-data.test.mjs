import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { extractTags, extractTasks, extractTargets } = require('../vault-data.js');

test('tags: Hebrew and English, nested, not headings, numbers, code or links', () => {
  const md = [
    '---', 'tags: [פרויקט, "ideas"]', '---',
    '# כותרת',
    'טקסט עם #לימודים וגם #math/algebra וגם #2024 וגם (#a1).',
    '`#notatag` ו־[[הערה#כותרת]] ו־https://x.com/#anchor',
    '```', '#incode', '```',
    '%% #hidden %%',
  ].join('\n');
  assert.deepEqual(extractTags(md).map((t) => t.tag), ['לימודים', 'math/algebra', 'a1', 'פרויקט', 'ideas']);
});

test('tag positions point at the # in the original text', () => {
  const md = 'abc #tag def';
  const [t] = extractTags(md);
  assert.equal(md.slice(t.index, t.index + 4), '#tag');
});

test('frontmatter tags as a YAML list', () => {
  const md = '---\ntags:\n  - one\n  - "#two"\ntitle: x\n---\nbody';
  assert.deepEqual(extractTags(md).map((t) => t.tag), ['one', 'two']);
});

test('tasks: open and done, nested and numbered, not in code', () => {
  const md = ['- [ ] לקנות חלב', '  - [x] done sub', '1. [ ] numbered', '* [X] star', '```', '- [ ] code', '```', '- not a task'].join('\n');
  const tasks = extractTasks(md);
  assert.deepEqual(tasks.map((t) => [t.text, t.done]), [['לקנות חלב', false], ['done sub', true], ['numbered', false], ['star', true]]);
  assert.equal(tasks[1].depth, 2);
  assert.equal(tasks[0].line, 0);
});

test('tasks keep CRLF-free text', () => {
  assert.equal(extractTasks('- [ ] a\r\n- [x] b\r\n')[0].text, 'a');
});

test('link targets from body and frontmatter, without duplicates or code', () => {
  const md = '---\nlinks:\n  - "[[A]]"\n---\nsee [[A]] and [[B|alias]] `[[C]]`';
  assert.deepEqual(extractTargets(md), ['A', 'B']);
});
