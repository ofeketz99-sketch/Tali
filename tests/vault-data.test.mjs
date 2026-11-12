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

test('title-only: empty documents, frontmatter and a single markdown heading', () => {
  const { isTitleOnly } = require('../vault-data.js');
  assert.equal(isTitleOnly(''), true);
  assert.equal(isTitleOnly('   \r\n\n'), true);
  assert.equal(isTitleOnly('---\ncreated: 2026-11-12T09:05\ntags: [draft]\n---\n'), true);
  assert.equal(isTitleOnly('---\ncreated: 2026-11-12\n---\n# רעיון\n'), true);
  assert.equal(isTitleOnly('<!-- comment -->\n%% hidden %%\n## כותרת'), true);
  assert.equal(isTitleOnly('# רעיון\n\nפסקה'), false);
  assert.equal(isTitleOnly('# רעיון\n## כותרת נוספת'), false);
  assert.equal(isTitleOnly('שורת טקסט רגילה'), false);
  assert.equal(isTitleOnly('- [ ] משימה'), false);
  assert.equal(isTitleOnly('---\nlinks:\n  - "[[קשור]]"\n---\n'), false);
  assert.equal(isTitleOnly('# [[קישור]]'), false);
  assert.equal(isTitleOnly('# [מקור](https://example.com)'), false);
  assert.equal(isTitleOnly('<!-- TALI-OVERLAY:v1:encoded-data -->'), false);
});

test('created date: frontmatter first, then a date line near the top (day-month-year)', () => {
  const { getCreatedDate } = require('../vault-data.js');
  assert.equal(getCreatedDate(' - קישורים: [[ביוכימיה]]\n- ביבליוגרפיה: x\n06-04-25\n ----\nטקסט'), '2025-04-06');
  assert.equal(getCreatedDate('a\r\n21-09-2025\r\n'), '2025-09-21');
  assert.equal(getCreatedDate('---\ncreated: 2024-01-31T10:00\n---\n06-04-25\n'), '2024-01-31');
  assert.equal(getCreatedDate('---\nתאריך: 15.3.24\n---\n'), '2024-03-15');
  assert.equal(getCreatedDate('31-02-25\n'), null);
  assert.equal(getCreatedDate('בתאריך 06-04-25 קרה משהו\n'), null);
  assert.equal(getCreatedDate('1\n2\n3\n4\n5\n6\n7\n8\n06-04-25\n'), null);
  assert.equal(getCreatedDate(''), null);
});

test('templates: Obsidian variables and moment-style formats', () => {
  const { fillTemplate, formatDate } = require('../vault-data.js');
  const now = new Date(2025, 3, 6, 9, 5, 7);
  assert.equal(formatDate(now, 'DD-MM-YY'), '06-04-25');
  assert.equal(formatDate(now, 'D.M.YYYY [בשעה] HH:mm:ss'), '6.4.2025 בשעה 09:05:07');
  const t = '- קישורים: [[\n- תיוגים: \n{{date}}\n# {{title}} {{ time }} {{date:YYYY}}\n{{other}}';
  assert.equal(fillTemplate(t, { title: 'ליפידים', now, dateFormat: 'DD-MM-YY', timeFormat: 'HH:mm' }),
    '- קישורים: [[\n- תיוגים: \n06-04-25\n# ליפידים 09:05 2025\n{{other}}');
});

test('header to properties: the user\'s header becomes links/source/tags/created', () => {
  const { headerToProps } = require('../vault-data.js');
  const md = ' - קישורים: [[ביוכימיה]], [[כימיה|כימ]]\n- ביבליוגרפיה: [ויקיפדיה](https://he.wikipedia.org/wiki/ליפיד)\n- תיוגים: #כימיה #ביו\n06-04-25\n ----\n\n**מונח מטריה** לכלל.\n';
  const r = headerToProps(md);
  assert.equal(r.text, '---\nlinks:\n  - "[[ביוכימיה]]"\n  - "[[כימיה]]"\nsource: "[ויקיפדיה](https://he.wikipedia.org/wiki/ליפיד)"\ntags:\n  - כימיה\n  - ביו\ncreated: 2025-04-06\n---\n**מונח מטריה** לכלל.\n');
});

test('header to properties: variants, merging, CRLF and refusals', () => {
  const { headerToProps } = require('../vault-data.js');
  // ריק: "[[", "[]()" ותיוגים ריקים לא יוצרים מאפיינים, רק הכותרת יורדת
  assert.equal(headerToProps('- קישורים: [[\n- ביבליוגרפיה: []()\n- תיוגים: \n12-11-26\n----\ntext').text, '---\ncreated: 2026-11-12\n---\ntext');
  // תאריך ושעה כפריטי רשימה, --- כמפריד, CRLF נשמר
  assert.equal(headerToProps('- קישורים: [[א]]\r\n- 11-07-26\r\n- 12:39\r\n--- \r\nskin').text, '---\r\nlinks:\r\n  - "[[א]]"\r\ncreated: 2026-07-11T12:39\r\n---\r\nskin');
  // בלי קו מפריד: הכותרת נגמרת בשורה הראשונה שאינה שלה
  assert.equal(headerToProps(' - קישורים:[[א]]\nגוף').text, '---\nlinks:\n  - "[[א]]"\n---\nגוף');
  // מאפיינים קיימים: קישורים מתמזגים, created קיים לא נדרס
  assert.equal(headerToProps('---\ncreated: 2024-01-01\nlinks:\n  - "[[ב]]"\n---\n- קישורים: [[א]], [[ב]]\n06-04-25\n----\nx').text,
    '---\ncreated: 2024-01-01\nlinks:\n  - "[[ב]]"\n  - "[[א]]"\n---\nx');
  // שורה לא מוכרת לפני הקו המפריד (מחבר:, {{date}}): לא ממירים
  assert.ok(headerToProps('קישורים: [[א]]\nמחבר: מישהו\n---\n').skip);
  assert.ok(headerToProps('- קישורים: [[\n- תיוגים: \n{{date}}\n----\n').skip);
  assert.ok(headerToProps('# כותרת\n- קישורים: [[א]]\n').skip);
});

test('dates: ISO lines, with time, and date+time glued together', () => {
  const { getCreatedDate, headerToProps } = require('../vault-data.js');
  assert.equal(getCreatedDate('- קישורים: [[א]]\n2025-03-27 19:47\n---\n'), '2025-03-27');
  assert.equal(getCreatedDate('- 2025-03-30\n'), '2025-03-30');
  assert.equal(headerToProps('- קישורים: [[א]]\n- 11-07-2612:39\n---\nx').text, '---\nlinks:\n  - "[[א]]"\ncreated: 2026-07-11T12:39\n---\nx');
  assert.equal(headerToProps('- קישורים: [[א]]\n2025-03-27 19:47\n---\nx').text, '---\nlinks:\n  - "[[א]]"\ncreated: 2025-03-27T19:47\n---\nx');
});

test('new notes get a hidden created date, without touching an existing one', () => {
  const { withCreated, getCreatedDate } = require('../vault-data.js');
  const now = new Date(2026, 10, 12, 9, 5);
  assert.equal(withCreated('', now), '---\ncreated: 2026-11-12T09:05\n---\n');
  assert.equal(getCreatedDate(withCreated('', now)), '2026-11-12');
  assert.equal(withCreated('---\ntags: x\n---\nbody', now), '---\ncreated: 2026-11-12T09:05\ntags: x\n---\nbody');
  assert.equal(withCreated('---\r\ncreated: 2020-01-01\r\n---\r\n', now), '---\r\ncreated: 2020-01-01\r\n---\r\n');
  assert.equal(withCreated('- [[א]]\n', now), '---\ncreated: 2026-11-12T09:05\n---\n- [[א]]\n');
});

test('follow-up section also under the "### #משימות_המשך" heading from the user\'s template', () => {
  const { extractTasks, isFollowUpHeading } = require('../vault-data.js');
  assert.ok(isFollowUpHeading('#משימות_המשך'));
  assert.ok(isFollowUpHeading('משימות להמשך'));
  assert.ok(!isFollowUpHeading('משימות'));
  const t = extractTasks('- [ ] רגילה\n---\n### #משימות_המשך \n- [ ] להמשך\n## אחר\n- [ ] רגילה 2\n');
  assert.deepEqual(t.map((x) => [x.text, x.followUp]), [['רגילה', false], ['להמשך', true], ['רגילה 2', false]]);
});
