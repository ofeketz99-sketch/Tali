import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createVaultIndex } = require('../vault-index.js');

test('vault index coalesces scans, reuses parsed notes and serves backlinks from memory', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tali-vault-index-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'nested'));
  await fs.mkdir(path.join(root, '.hidden'));
  const a = path.join(root, 'A.md');
  const b = path.join(root, 'nested', 'B.md');
  const image = path.join(root, 'nested', 'photo.png');
  await fs.writeFile(a, '# A\n[[B]]\n[[photo.png]]\n#tag\n');
  await fs.writeFile(b, 'first [[A]]\nsecond [[A]]\n- [ ] task\n');
  await fs.writeFile(image, Buffer.from([1, 2, 3]));
  await fs.writeFile(path.join(root, '.hidden', 'ignored.md'), '[[A]]');

  const counts = { readdir: 0, stat: 0, readFile: 0 };
  const measuredFs = {
    readdir: async (...args) => { counts.readdir++; return fs.readdir(...args); },
    stat: async (...args) => { counts.stat++; return fs.stat(...args); },
    readFile: async (...args) => { counts.readFile++; return fs.readFile(...args); },
  };
  const indexer = createVaultIndex({ getRoot: () => root, fs: measuredFs, cacheMs: 60000, concurrency: 2 });

  const [first, simultaneous] = await Promise.all([indexer.index(), indexer.index()]);
  assert.strictEqual(first, simultaneous);
  assert.equal(first.notes.length, 2);
  assert.equal(counts.readFile, 2, 'each note is parsed only once during simultaneous requests');
  assert.deepEqual(first.notes.find((note) => note.path === a).links, [b]);
  assert.deepEqual(first.notes.find((note) => note.path === a).missing, []);

  const readsBeforeBacklinks = counts.readFile;
  assert.deepEqual(await indexer.backlinks(a), [{
    path: b,
    name: 'B',
    snippet: 'first [[A]]',
    count: 2,
  }]);
  assert.equal(counts.readFile, readsBeforeBacklinks, 'backlinks reuse the parsed index instead of reading the vault');
  assert.deepEqual(await indexer.attachments(), [image]);

  await fs.writeFile(b, 'changed [[A]]\n');
  indexer.invalidate(b);
  await indexer.index();
  assert.equal(counts.readFile, 3, 'only the invalidated note is parsed again');
  assert.equal((await indexer.backlinks(a))[0].count, 1);
});

