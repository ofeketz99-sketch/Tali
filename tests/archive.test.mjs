import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHIVE_DIR, isArchived, isArchiveRoot, archiveDirFor, restoreDirFor, withoutArchived } from '../src/archive.js';

test('archived paths are the archive folder and anything inside it', () => {
  assert.equal(isArchived(`${ARCHIVE_DIR}/מסמך`), true);
  assert.equal(isArchived(`${ARCHIVE_DIR}\\תיקייה\\מסמך`), true);
  assert.equal(isArchived(ARCHIVE_DIR), true);
  assert.equal(isArchived(`${ARCHIVE_DIR}ים/מסמך`), false); // only the exact folder name
  assert.equal(isArchived(`לימודים/${ARCHIVE_DIR}/מסמך`), false); // only at the vault root
  assert.equal(isArchiveRoot(ARCHIVE_DIR), true);
  assert.equal(isArchiveRoot(`${ARCHIVE_DIR}/x`), false);
});

test('archiving keeps the folder path, and restoring returns to it', () => {
  assert.deepEqual(archiveDirFor('לימודים/גנטיקה/שיעור 1'), [ARCHIVE_DIR, 'לימודים', 'גנטיקה']);
  assert.deepEqual(archiveDirFor('מסמך'), [ARCHIVE_DIR]);
  assert.equal(archiveDirFor(`${ARCHIVE_DIR}/מסמך`), null); // already archived
  assert.deepEqual(restoreDirFor(`${ARCHIVE_DIR}/לימודים/גנטיקה/שיעור 1`), ['לימודים', 'גנטיקה']);
  assert.deepEqual(restoreDirFor(`${ARCHIVE_DIR}/מסמך`), []); // back to the vault root
  assert.equal(restoreDirFor('לימודים/מסמך'), null);
  assert.equal(restoreDirFor(ARCHIVE_DIR), null);
});

test('quick-access views drop archived notes from the index', () => {
  const index = { notes: [{ rel: 'a' }, { rel: `${ARCHIVE_DIR}/b` }, { rel: 'c/d' }], other: 1 };
  assert.deepEqual(withoutArchived(index), { notes: [{ rel: 'a' }, { rel: 'c/d' }], other: 1 });
});
