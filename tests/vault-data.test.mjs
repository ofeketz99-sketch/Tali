import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { extractTags, extractTasks, extractTargets, getFlag, setFlag } = require('../vault-data.js');

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

test('follow-up tasks: only inside the "משימות להמשך" section, including its subsections', () => {
  const t = extractTasks('- [ ] a\n## משימות להמשך\n- [ ] b\n  - [x] c\n### פירוט\n- [ ] d\n## אחר\n- [ ] e\n```\n- [ ] code\n```\n');
  assert.deepEqual(t.map((x) => [x.text, x.followUp]), [['a', false], ['b', true], ['c', true], ['d', true], ['e', false]]);
  assert.equal(extractTasks('# משימות להמשך\n- [ ] x\n## תת\n- [ ] y\n# הבא\n- [ ] z').filter((x) => x.followUp).length, 2);
});

test('flags: read, set, replace and remove without touching other properties', () => {
  assert.equal(getFlag('---\ntitle: x\nflag: "Red"\n---\nb'), 'red');
  assert.equal(getFlag('---\nflag: pink\n---\nb'), null);
  assert.equal(setFlag('body', 'blue'), '---\nflag: blue\n---\nbody');
  assert.equal(setFlag('---\ntitle: x\n---\nbody', 'red'), '---\ntitle: x\nflag: red\n---\nbody');
  assert.equal(setFlag('---\ntitle: x\nflag: red\n---\nbody', 'green'), '---\ntitle: x\nflag: green\n---\nbody');
  assert.equal(setFlag('---\nflag: red\n---\nbody', null), 'body');
  assert.equal(setFlag('---\r\ntitle: x\r\nflag: red\r\n---\r\nb', null), '---\r\ntitle: x\r\n---\r\nb');
  assert.equal(setFlag('plain', null), 'plain');
});

test('link hub: only a list of [[links]] (headings, frontmatter and comments allowed)', () => {
  const { isLinkHub } = require('../vault-data.js');
  assert.equal(isLinkHub('- [[א]]\n- [[ב|כינוי]]\n'), true);
  assert.equal(isLinkHub('---\ntags: x\n---\n# נושא\n\n* [[א]]\r\n1. [[ב]]\n<!-- TALI-OVERLAY:v1:x -->\n'), true);
  assert.equal(isLinkHub('---\nlinks:\n  - "[[א]]"\n---\n'), true);
  assert.equal(isLinkHub('- [[א]] ועוד טקסט\n'), false);
  assert.equal(isLinkHub('- [[א]]\nפסקה\n'), false);
  assert.equal(isLinkHub(''), false);
  assert.equal(isLinkHub('# רק כותרת\n'), false);
});
