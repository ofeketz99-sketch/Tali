import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

test('TALI-DEV keeps the shortcut identity so Windows groups its taskbar icon', () => {
  assert.match(source, /const IS_DEV_EXE = \/\^tali-dev\\\.exe\$\/i\.test\(path\.basename\(process\.execPath\)\)/);
  assert.match(source, /process\.platform === 'win32' && !IS_DEV_EXE/);
  assert.match(source, /app\.setAppUserModelId\('app\.tali\.notes'\)/);
});
