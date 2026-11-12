import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeUpdateBranch, planUpdate } = require('../launcher/update-core.js');

test('normalizes the development update branch safely', () => {
  assert.equal(normalizeUpdateBranch(' dev '), 'dev');
  assert.equal(normalizeUpdateBranch('feat/home-loading'), 'feat/home-loading');
  assert.equal(normalizeUpdateBranch('../main'), 'dev');
  assert.equal(normalizeUpdateBranch('bad branch'), 'dev');
});

test('updates only a clean checkout on the configured branch', () => {
  assert.deepEqual(planUpdate({ gitAvailable: true, isRepository: true, dirty: false, currentBranch: 'dev', targetBranch: 'dev' }), { action: 'update', reason: '' });
  assert.equal(planUpdate({ gitAvailable: true, isRepository: true, dirty: true, currentBranch: 'dev', targetBranch: 'dev' }).action, 'skip');
  assert.equal(planUpdate({ gitAvailable: true, isRepository: true, dirty: false, currentBranch: 'main', targetBranch: 'dev' }).action, 'skip');
});

test('skips safely without Git or a repository', () => {
  assert.match(planUpdate({ gitAvailable: false, isRepository: false }).reason, /Git/);
  assert.match(planUpdate({ gitAvailable: true, isRepository: false }).reason, /אינה מאגר/);
});
