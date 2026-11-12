import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { resolveNewNoteFolderPath, relativeNewNoteFolderPath } = require('../new-note-folder.js');
const root = path.resolve('C:/vault');

test('resolves the default and nested folders inside the vault', () => {
  assert.equal(resolveNewNoteFolderPath(root), path.join(root, 'מסמכים חדשים'));
  assert.equal(resolveNewNoteFolderPath(root, 'טיוטות/לבדיקה'), path.join(root, 'טיוטות', 'לבדיקה'));
  assert.equal(resolveNewNoteFolderPath(root, ''), root);
});

test('rejects absolute paths and parent traversal', () => {
  assert.throws(() => resolveNewNoteFolderPath(root, path.resolve('C:/outside')), /מתוך תיקיית המסמכים/);
  assert.throws(() => resolveNewNoteFolderPath(root, '../outside'), /אינה תקינה/);
});

test('stores selected folders as portable vault-relative paths', () => {
  assert.equal(relativeNewNoteFolderPath(root, path.join(root, 'מסמכים חדשים')), 'מסמכים חדשים');
  assert.equal(relativeNewNoteFolderPath(root, root), '');
  assert.throws(() => relativeNewNoteFolderPath(root, path.resolve(root, '..', 'outside')), /מתוך תיקיית המסמכים/);
});
