import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/hotkeys.js', import.meta.url));
const { eventToHotkey, matchesHotkey, commandHotkey } =
  await import('data:text/javascript;base64,' + source.toString('base64'));

test('captures shortcuts by physical code and rejects ordinary typing', () => {
  assert.equal(eventToHotkey({ code: 'KeyK', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false }), 'Ctrl+Shift+K');
  assert.equal(eventToHotkey({ code: 'ArrowLeft', ctrlKey: false, metaKey: false, shiftKey: false, altKey: true }), 'Alt+←');
  assert.equal(eventToHotkey({ code: 'KeyK', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }), null);
  assert.equal(eventToHotkey({ code: 'F11', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }), 'F11');
});

test('matches shortcut modifiers exactly', () => {
  const event = { code: 'KeyP', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
  assert.equal(matchesHotkey(event, 'Ctrl+P'), true);
  assert.equal(matchesHotkey({ ...event, shiftKey: true }, 'Ctrl+P'), false);
});

test('custom shortcuts override defaults and an empty string disables one', () => {
  const command = { id: 'palette', keys: 'Ctrl+P' };
  assert.equal(commandHotkey(command, {}), 'Ctrl+P');
  assert.equal(commandHotkey(command, { hotkeys: { palette: 'Ctrl+K' } }), 'Ctrl+K');
  assert.equal(commandHotkey(command, { hotkeys: { palette: '' } }), '');
});
