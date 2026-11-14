import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeUpdateBranch, planUpdate, lockIsFresh } = require('../launcher/update-core.js');

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
