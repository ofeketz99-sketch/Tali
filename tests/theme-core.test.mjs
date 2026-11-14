import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/theme-core.js', import.meta.url));
const T = await import('data:text/javascript;base64,' + source.toString('base64'));
const at = (h, m = 0, day = 15) => new Date(2026, 2, day, h, m, 0, 0);
const sched = { day: '07:00', night: '19:00' };

test('fixed modes and Windows mode', () => {
  assert.equal(T.activeProfile({ mode: 'day', now: at(23) }), 'day');
  assert.equal(T.activeProfile({ mode: 'night', now: at(12) }), 'night');
  assert.equal(T.activeProfile({ mode: 'system', systemDark: true, now: at(12) }), 'night');
  assert.equal(T.activeProfile({ mode: 'system', systemDark: false, now: at(23) }), 'day');
});

test('schedule: boundaries are inclusive of the start minute', () => {
  const p = (h, m) => T.activeProfile({ mode: 'schedule', schedule: sched, now: at(h, m) });
  assert.equal(p(6, 59), 'night');
  assert.equal(p(7, 0), 'day');
  assert.equal(p(18, 59), 'day');
  assert.equal(p(19, 0), 'night');
  assert.equal(p(0, 30), 'night');
});

test('schedule crossing midnight (day starts in the evening)', () => {
  const s = { day: '22:00', night: '06:30' };
  const p = (h, m) => T.activeProfile({ mode: 'schedule', schedule: s, now: at(h, m) });
  assert.equal(p(23, 0), 'day');
  assert.equal(p(2, 0), 'day');
  assert.equal(p(6, 30), 'night');
  assert.equal(p(12, 0), 'night');
  assert.equal(p(22, 0), 'day');
});

test('identical or invalid times are rejected and fall back to day', () => {
  assert.equal(T.validSchedule({ day: '08:00', night: '08:00' }), false);
  assert.equal(T.validSchedule({ day: '25:00', night: '08:00' }), false);
  assert.equal(T.validSchedule({ day: '7:05', night: '19:00' }), true);
  assert.equal(T.activeProfile({ mode: 'schedule', schedule: { day: '08:00', night: '08:00' }, now: at(23) }), 'day');
  assert.equal(T.nextSwitch({ mode: 'schedule', schedule: { day: '08:00', night: '08:00' }, now: at(1) }), null);
});

test('next switch: same day, next day, and nothing outside schedule mode', () => {
  assert.deepEqual(T.nextSwitch({ mode: 'schedule', schedule: sched, now: at(12) }), at(19));
  assert.deepEqual(T.nextSwitch({ mode: 'schedule', schedule: sched, now: at(20) }), at(7, 0, 16));
  assert.deepEqual(T.nextSwitch({ mode: 'schedule', schedule: sched, now: at(7, 0) }), at(19));
  assert.equal(T.nextSwitch({ mode: 'day', schedule: sched, now: at(12) }), null);
});

test('next switch is computed in local wall-clock time across a DST change', () => {
  // whatever the machine's zone, the result is 07:00 local on the next day
  const now = new Date(2026, 2, 27, 20, 0);
  const next = T.nextSwitch({ mode: 'schedule', schedule: sched, now });
  assert.equal(next.getHours(), 7);
  assert.equal(next.getMinutes(), 0);
  assert.equal(next.getDate(), 28);
});

test('migration keeps the old accent and paper, maps the old theme, and keeps other prefs', () => {
  const old = { version: 2, theme: 'system', paper: 'cream', accent: '#4a8fd8', fontSize: 19 };
  const p = T.migratePrefs(old);
  assert.equal(p.themeMode, 'system');
  assert.equal(p.themes.day.accent, '#4a8fd8');
  assert.equal(p.themes.day.page, '#fffbf1');
  assert.equal(p.themes.night.accent, '#4a8fd8');
  assert.equal(p.fontSize, 19);
  assert.deepEqual(p.schedule, { day: '07:00', night: '19:00' });
  assert.equal(T.migratePrefs({ theme: 'dark' }).themeMode, 'night');
  assert.equal(T.migratePrefs(null).themeMode, 'day');
});

test('day and night profiles are independent and incomplete ones are filled', () => {
  const p = T.migratePrefs({ themes: { day: { accent: '#ff0000', floating: '#112233' }, night: { page: 'zzz' } }, themeMode: 'night' });
  assert.equal(p.themes.day.accent, '#ff0000');
  assert.equal(p.themes.day.floating, '#112233');
  assert.equal(p.themes.day.page, T.DEFAULT_THEMES.day.page);
  assert.equal(p.themes.night.page, T.DEFAULT_THEMES.night.page);
  assert.equal(p.themeMode, 'night');
});

test('semantic detail colours are optional overrides and invalid values are dropped', () => {
  const automatic = T.deriveVars(T.DEFAULT_THEMES.day).vars;
  const custom = T.completeTheme({ ...T.DEFAULT_THEMES.day, floating: '#123456', folder: 'abc', input: 'nope' });
  assert.equal(custom.floating, '#123456');
  assert.equal(custom.folder, '#aabbcc');
  assert.equal(Object.hasOwn(custom, 'input'), false);
  const vars = T.deriveVars(custom).vars;
  assert.equal(vars['--floating-bg'], '#123456');
  assert.equal(vars['--folder-ink'], '#aabbcc');
  assert.equal(vars['--input-bg'], automatic['--input-bg']);
  for (const key of T.DETAIL_KEYS) assert.match(T.DETAIL_VARS[key], /^--/, key);
  const issues = T.contrastIssues({ ...T.DEFAULT_THEMES.day, floating: '#123456', folder: '#ffffff', sidebar: '#ffffff' });
  assert.ok(issues.some((issue) => issue.key === 'folder'));
});

test('contrast: WCAG ratio, readable suggestions, and warnings never change the input', () => {
  assert.equal(Math.round(T.contrast('#000000', '#ffffff')), 21);
  const colors = { ...T.DEFAULT_THEMES.day, text: '#d8d8d8' };
  const issues = T.contrastIssues(colors);
  assert.ok(issues.some((i) => i.key === 'text' && i.against === 'page'));
  const fix = issues.find((i) => i.key === 'text').suggestion;
  assert.ok(T.contrast(fix, colors.page) >= 4.5);
  assert.equal(colors.text, '#d8d8d8');
  assert.deepEqual(T.contrastIssues(T.DEFAULT_THEMES.day), []);
  assert.deepEqual(T.contrastIssues(T.DEFAULT_THEMES.night), []);
});

test('derived tokens follow the real lightness and keep secondary text readable', () => {
  for (const preset of T.PRESETS) {
    const { vars, dark } = T.deriveVars(preset.colors);
    assert.equal(dark, preset.kind === 'night', preset.id);
    assert.ok(T.contrast(vars['--muted'], preset.colors.page) >= 4.5, preset.id + ' muted');
    assert.ok(T.contrast(vars['--accent-ink'], preset.colors.page) >= 4.5, preset.id + ' accent ink');
    assert.ok(T.contrast(vars['--on-accent'], preset.colors.accent) >= 3, preset.id + ' on accent');
    assert.ok(T.contrast(vars['--btn-new-ink'], vars['--btn-new-3']) >= 4.5, preset.id + ' new button');
  }
  // a dark "day" theme is treated as dark
  assert.equal(T.deriveVars(T.DEFAULT_THEMES.night).dark, true);
});

test('hex input is normalized', () => {
  assert.equal(T.normalizeHex('ABC'), '#aabbcc');
  assert.equal(T.normalizeHex('#12ab34'), '#12ab34');
  assert.equal(T.normalizeHex('nope'), null);
});
