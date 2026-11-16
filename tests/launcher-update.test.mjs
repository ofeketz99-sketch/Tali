import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  normalizeUpdateBranch,
  planUpdate,
  lockIsFresh,
  isRetryableGitObjectWriteError,
} = require('../launcher/update-core.js');

test('normalizes the development update branch safely', () => {
  assert.equal(normalizeUpdateBranch(' desktop-dev '), 'desktop-dev');
  assert.equal(normalizeUpdateBranch('feat/home-loading'), 'feat/home-loading');
  assert.equal(normalizeUpdateBranch('../main', 'desktop-dev'), 'desktop-dev');
  assert.equal(normalizeUpdateBranch('bad branch', 'desktop-dev'), 'desktop-dev');
});

test('updates only a clean checkout on the configured branch', () => {
  assert.deepEqual(planUpdate({ gitAvailable: true, isRepository: true, dirty: false, currentBranch: 'desktop-dev', targetBranch: 'desktop-dev' }), { action: 'update', reason: '' });
  assert.equal(planUpdate({ gitAvailable: true, isRepository: true, dirty: true, currentBranch: 'desktop-dev', targetBranch: 'desktop-dev' }).action, 'skip');
  assert.equal(planUpdate({ gitAvailable: true, isRepository: true, dirty: false, currentBranch: 'main', targetBranch: 'desktop-dev' }).action, 'skip');
});

test('skips safely without Git or a repository', () => {
  assert.match(planUpdate({ gitAvailable: false, isRepository: false }).reason, /Git/);
  assert.match(planUpdate({ gitAvailable: true, isRepository: false }).reason, /אינה מאגר/);
});

test('an update lock only blocks while it is recent', () => {
  const now = 1_000_000;
  assert.equal(lockIsFresh(null, now, 600000), false);
  assert.equal(lockIsFresh({ mtimeMs: now - 5000 }, now, 600000), true);
  assert.equal(lockIsFresh({ mtimeMs: now - 700000 }, now, 600000), false); // a crashed updater does not block forever
});

test('retries only transient writes to the Git object store', () => {
  assert.equal(isRetryableGitObjectWriteError({
    stderr: 'error: unable to write file .git/objects/0f/09151c: Permission denied',
  }), true);
  assert.equal(isRetryableGitObjectWriteError(new Error('EPERM: operation not permitted, open D:\\repo\\.git\\objects\\aa\\bb')), true);
  assert.equal(isRetryableGitObjectWriteError(new Error('Permission denied (publickey).')), false);
  assert.equal(isRetryableGitObjectWriteError(new Error('Could not resolve host: github.com')), false);
});

test('the lockfile hash ignores the app version but not dependency changes', () => {
  const { lockfileDependencyHash } = require('../launcher/update-core.js');
  const lock = (version, tiptap = '^2.11.0', resolved = '2.11.5') => JSON.stringify({
    name: 'tali', version, lockfileVersion: 3, requires: true,
    packages: {
      '': { name: 'tali', version, dependencies: { '@tiptap/core': tiptap } },
      'node_modules/@tiptap/core': { version: resolved, resolved: `https://registry.npmjs.org/@tiptap/core/-/core-${resolved}.tgz` },
    },
  }, null, 2) + '\n';
  const base = lockfileDependencyHash(lock('7.7.0'));
  assert.match(base, /^[0-9a-f]{64}$/);
  assert.equal(lockfileDependencyHash(lock('7.8.0')), base); // release bump only
  assert.equal(lockfileDependencyHash(Buffer.from(lock('7.8.0'))), base); // a Buffer, as read from disk
  assert.equal(lockfileDependencyHash('﻿' + lock('7.8.0')), base); // BOM
  assert.notEqual(lockfileDependencyHash(lock('7.7.0', '^2.12.0')), base); // a changed range
  assert.notEqual(lockfileDependencyHash(lock('7.7.0', '^2.11.0', '2.11.6')), base); // a changed resolved package
  assert.equal(lockfileDependencyHash(''), '');
  assert.match(lockfileDependencyHash('not json'), /^[0-9a-f]{64}$/); // falls back to hashing the bytes
  assert.notEqual(lockfileDependencyHash('not json'), lockfileDependencyHash('not json!'));
});

test('the real package-lock.json hashes the same with a different app version', async () => {
  const { lockfileDependencyHash } = require('../launcher/update-core.js');
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8');
  const bumped = text.replace(/("version":\s*")[^"]+(")/, '$199.9.0$2').replace(/(""\s*:\s*\{[^{}]*?"version":\s*")[^"]+(")/, '$199.9.0$2');
  assert.notEqual(bumped, text);
  assert.equal(lockfileDependencyHash(bumped), lockfileDependencyHash(text));
});
