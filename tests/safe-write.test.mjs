import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { writeWithBackup, recoverInterruptedSave, backupPath, SAME_SAVE_MS } = require('../safe-write.js');

async function tempNote(text) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tali-safe-write-'));
  const file = path.join(dir, 'מסמך.md');
  if (text != null) await fs.writeFile(file, text, 'utf8');
  return { dir, file };
}

test('writeWithBackup writes the content and leaves no backup', async () => {
  const { dir, file } = await tempNote('ישן');
  await writeWithBackup(file, 'חדש\r\nשורה');
  assert.equal(await fs.readFile(file, 'utf8'), 'חדש\r\nשורה');
  assert.deepEqual(await fs.readdir(dir), ['מסמך.md']);
});

test('writeWithBackup keeps the file creation time (no replace by rename)', async () => {
  const { file } = await tempNote('ישן');
  const before = (await fs.stat(file)).birthtimeMs;
  await new Promise((r) => setTimeout(r, 30));
  await writeWithBackup(file, 'חדש');
  assert.equal((await fs.stat(file)).birthtimeMs, before);
});

test('recoverInterruptedSave restores a save that was cut off', async () => {
  const { file } = await tempNote('חצי מסמ');
  await fs.writeFile(backupPath(file), 'מסמך מלא', 'utf8');
  assert.equal(await recoverInterruptedSave(file), true);
  assert.equal(await fs.readFile(file, 'utf8'), 'מסמך מלא');
  await assert.rejects(fs.stat(backupPath(file)));
});

test('recoverInterruptedSave removes a leftover backup that matches the file', async () => {
  const { file } = await tempNote('אותו טקסט');
  await fs.writeFile(backupPath(file), 'אותו טקסט', 'utf8');
  assert.equal(await recoverInterruptedSave(file), false);
  await assert.rejects(fs.stat(backupPath(file)));
});

test('recoverInterruptedSave does not overwrite a later outside edit', async () => {
  const { file } = await tempNote('נערך באובסידיאן');
  await fs.writeFile(backupPath(file), 'שמירה ישנה', 'utf8');
  const old = new Date(Date.now() - SAME_SAVE_MS * 3);
  await fs.utimes(backupPath(file), old, old);
  assert.equal(await recoverInterruptedSave(file), false);
  assert.equal(await fs.readFile(file, 'utf8'), 'נערך באובסידיאן');
  assert.equal(await fs.readFile(backupPath(file), 'utf8'), 'שמירה ישנה');
});

test('recoverInterruptedSave does nothing without a backup', async () => {
  const { file } = await tempNote('רגיל');
  assert.equal(await recoverInterruptedSave(file), false);
  assert.equal(await fs.readFile(file, 'utf8'), 'רגיל');
});
