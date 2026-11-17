import test from 'node:test';
import assert from 'node:assert/strict';
import { planSync, runSync, conflictName, hashText } from '../mobile/src/sync-core.js';

const ops = (plan) => plan.map((s) => `${s.op}:${s.path}`);

test('planSync: every combination of who changed what', () => {
  const plan = planSync([
    { path: 'new-on-phone.md', hash: 'a', baseHash: null, baseRev: null },
    { path: 'same.md', hash: 'x', baseHash: 'x', baseRev: 'X' },
    { path: 'phone-edit.md', hash: 'b2', baseHash: 'b1', baseRev: 'B1' },
    { path: 'pc-edit.md', hash: 'c1', baseHash: 'c1', baseRev: 'C1' },
    { path: 'both.md', hash: 'd2', baseHash: 'd1', baseRev: 'D1' },
    { path: 'gone-on-pc.md', hash: 'e', baseHash: 'e', baseRev: 'E' },
    { path: 'gone-on-pc-but-edited.md', hash: 'f2', baseHash: 'f1', baseRev: 'F' },
    { path: 'deleted-on-phone.md', hash: null, baseHash: 'g', baseRev: 'G', deleted: true },
    { path: 'deleted-on-phone-edited-on-pc.md', hash: null, baseHash: 'h1', baseRev: 'H1', deleted: true },
    { path: 'on-both-never-synced.md', hash: 'i', baseHash: null, baseRev: null },
    { path: 'deleted-before-first-sync.md', hash: null, baseHash: null, baseRev: null, deleted: true },
  ], [
    { path: 'same.md', rev: 'X' },
    { path: 'phone-edit.md', rev: 'B1' },
    { path: 'pc-edit.md', rev: 'C2' },
    { path: 'both.md', rev: 'D3' },
    { path: 'deleted-on-phone.md', rev: 'G' },
    { path: 'deleted-on-phone-edited-on-pc.md', rev: 'H2' },
    { path: 'new-on-pc.md', rev: 'J' },
    { path: 'on-both-never-synced.md', rev: 'I' },
  ]);
  assert.deepEqual(ops(plan).sort(), [
    'deleteLocal:gone-on-pc.md',
    'deleteRemote:deleted-on-phone.md',
    'download:deleted-on-phone-edited-on-pc.md',
    'download:new-on-pc.md',
    'download:pc-edit.md',
    'forget:deleted-before-first-sync.md',
    'merge:both.md',
    'merge:on-both-never-synced.md',
    'upload:gone-on-pc-but-edited.md',
    'upload:new-on-phone.md',
    'upload:phone-edit.md',
  ]);
});

test('conflictName keeps the folder and extension and avoids taken names', () => {
  const d = new Date(2026, 10, 17, 9, 5);
  assert.equal(conflictName('a/b/note.md', d), 'a/b/note (גרסה מהטלפון 09-05).md');
  const taken = new Set(['note (גרסה מהטלפון 09-05).md']);
  assert.equal(conflictName('note.md', d, (n) => taken.has(n)), 'note (גרסה מהטלפון 09-05 2).md');
});

function memory(files) {
  const map = new Map(files.map((f) => [f.path, { ...f }]));
  return {
    map,
    list: async () => [...map.values()],
    get: async (p) => map.get(p),
    put: async (r) => { map.set(r.path, { ...r }); },
    remove: async (p) => { map.delete(p); },
  };
}
function remoteOf(obj) {
  const map = new Map(Object.entries(obj));
  return {
    map,
    list: async () => [...map].map(([path, data]) => ({ path, rev: 'r' + hashText(data) })),
    read: async (p) => map.get(p),
    write: async (p, d) => { map.set(p, d); return 'r' + hashText(d); },
    remove: async (p) => { map.delete(p); },
  };
}

test('runSync: a conflict never loses either version', async () => {
  const local = memory([{ path: 'n.md', data: 'phone', hash: hashText('phone'), baseHash: hashText('v1'), baseRev: 'r' + hashText('v1') }]);
  const remote = remoteOf({ 'n.md': 'desktop' });
  const r = await runSync(local, remote, { now: () => new Date(2026, 0, 1, 12, 30) });
  assert.equal(r.conflicts.length, 1);
  assert.equal(remote.map.get('n.md'), 'desktop');
  assert.equal(remote.map.get('n (גרסה מהטלפון 12-30).md'), 'phone');
  assert.equal(local.map.get('n.md').data, 'desktop');
  assert.equal(local.map.get('n (גרסה מהטלפון 12-30).md').data, 'phone');
  // סנכרון שני לא עושה כלום
  const again = await runSync(local, remote);
  assert.deepEqual([again.uploaded, again.downloaded, again.deleted, again.conflicts.length], [0, 0, 0, 0]);
});

test('runSync: upload, download and deletions converge', async () => {
  const local = memory([
    { path: 'mine.md', data: 'm', hash: hashText('m'), baseHash: null, baseRev: null },
    { path: 'old.md', data: null, hash: null, baseHash: hashText('o'), baseRev: 'r' + hashText('o'), deleted: true },
    { path: 'same.md', data: 's', hash: hashText('s'), baseHash: null, baseRev: null },
  ]);
  const remote = remoteOf({ 'theirs.md': 't', 'old.md': 'o', 'same.md': 's' });
  const r = await runSync(local, remote);
  assert.deepEqual([r.uploaded, r.downloaded, r.deleted], [1, 1, 1]);
  assert.deepEqual([...remote.map.keys()].sort(), ['mine.md', 'same.md', 'theirs.md']);
  assert.deepEqual([...local.map.keys()].sort(), ['mine.md', 'same.md', 'theirs.md']);
  assert.equal(r.conflicts.length, 0); // same content on both sides before the first sync is not a conflict
  assert.equal(local.map.get('mine.md').baseHash, hashText('m'));
});
