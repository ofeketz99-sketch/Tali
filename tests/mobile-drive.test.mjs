import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { driveRemote, listFolders, shouldSync, FOLDER_MIME } from '../mobile/src/drive.js';
import { runSync, hashText } from '../mobile/src/sync-core.js';

// Drive מדומה: מספיק מה־API v3 כדי להריץ את המתאם (רשימה עם עמודים, הורדה, העלאה media/multipart, תיקייה, סל)
function fakeDrive({ pageSize = 1000 } = {}) {
  const files = new Map(); // id -> { id, name, mimeType, parents, bytes, trashed, modifiedTime }
  let n = 0, clock = 0;
  const log = [];
  const md5 = (b) => createHash('md5').update(b).digest('hex');
  const add = (name, parent, content, mimeType) => {
    const id = `f${++n}`;
    const bytes = content == null ? null : Buffer.from(content);
    files.set(id, { id, name, parents: [parent], mimeType: mimeType || (bytes ? 'text/markdown' : FOLDER_MIME), bytes, trashed: false, modifiedTime: String(++clock).padStart(6, '0') });
    return id;
  };
  const meta = (f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime,
    ...(f.bytes ? { md5Checksum: md5(f.bytes), size: String(f.bytes.length) } : {}) });
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0) });
  let failNext = 0;
  const fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const method = opts.method || 'GET';
    log.push(`${method} ${u.pathname}`);
    if (opts.headers?.Authorization !== `Bearer ${api.token}`) return json({ error: { message: 'bad token' } }, 401);
    if (failNext > 0) { failNext--; return json({ error: { message: 'busy' } }, 503); }
    const idMatch = u.pathname.match(/\/files\/([^/]+)$/);
    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q');
      const parent = q.match(/'([^']+)' in parents/)[1];
      const onlyFolders = q.includes(`mimeType='${FOLDER_MIME}'`);
      const all = [...files.values()].filter((f) => f.parents.includes(parent) && !f.trashed && (!onlyFolders || f.mimeType === FOLDER_MIME));
      const start = Number(u.searchParams.get('pageToken') || 0);
      const page = all.slice(start, start + pageSize);
      return json({ files: page.map(meta), ...(start + pageSize < all.length ? { nextPageToken: String(start + pageSize) } : {}) });
    }
    if (u.pathname === '/drive/v3/files' && method === 'POST') {
      const body = JSON.parse(opts.body);
      return json({ id: add(body.name, body.parents[0], null, body.mimeType) });
    }
    if (idMatch && u.pathname.startsWith('/drive/v3/') && method === 'GET') {
      const f = files.get(idMatch[1]);
      const buf = f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.length);
      return { ok: true, status: 200, arrayBuffer: async () => buf };
    }
    if (idMatch && u.pathname.startsWith('/drive/v3/') && method === 'PATCH') {
      Object.assign(files.get(idMatch[1]), JSON.parse(opts.body));
      return json({ id: idMatch[1] });
    }
    if (u.pathname.startsWith('/upload/drive/v3/files')) {
      const raw = Buffer.from(await opts.body.arrayBuffer());
      if (method === 'PATCH') {
        const f = files.get(idMatch[1]);
        f.bytes = raw; f.modifiedTime = String(++clock).padStart(6, '0');
        return json(meta(f));
      }
      const boundary = opts.headers['Content-Type'].split('boundary=')[1];
      const text = raw.toString('latin1');
      const parts = text.split(`--${boundary}`);
      const metaJson = JSON.parse(Buffer.from(parts[1].split('\r\n\r\n')[1], 'latin1').toString('utf8'));
      const content = parts[2].slice(parts[2].indexOf('\r\n\r\n') + 4, -2);
      const id = add(metaJson.name, metaJson.parents[0], Buffer.from(content, 'latin1'), opts.headers['Content-Type'] && 'text/markdown');
      return json(meta(files.get(id)));
    }
    throw new Error('unexpected ' + method + ' ' + url);
  };
  const api = {
    token: 't1', files, log, fetch, add,
    failNext(k) { failNext = k; },
    byPath(root, path) {
      let parent = root;
      const segs = path.split('/');
      for (let i = 0; i < segs.length; i++) {
        const f = [...files.values()].find((x) => x.parents.includes(parent) && x.name === segs[i] && !x.trashed);
        if (!f) return null;
        if (i === segs.length - 1) return f;
        parent = f.id;
      }
    },
  };
  return api;
}

// כספת מקומית בזיכרון, כמו store.js
function memLocal() {
  const m = new Map();
  return { m, list: async () => [...m.values()], get: async (p) => m.get(p), put: async (r) => { m.set(r.path, r); }, remove: async (p) => { m.delete(p); } };
}

const setup = () => {
  const drive = fakeDrive({ pageSize: 2 });
  const root = drive.add('כספת', 'root', null);
  drive.add('תיקייה אחרת', 'root', null);
  drive.add('שלום.md', root, '﻿# שלום\r\nעם BOM ו־CRLF\r\n');
  const sub = drive.add('פרויקטים', root, null);
  drive.add('תוכנית.md', sub, 'תוכנית');
  drive.add('תמונה.png', sub, Buffer.from([137, 80, 78, 71, 0, 255]), 'image/png');
  drive.add('מסמך.pdf', sub, 'x', 'application/pdf');
  drive.add('Google Doc', sub, null, 'application/vnd.google-apps.document');
  const obs = drive.add('.obsidian', root, null);
  drive.add('app.json', obs, '{}');
  drive.add('.tali.json', root, '{}');
  let refreshes = 0, held = 't1';
  // the phone holds its own token; refresh fetches whatever the server accepts now
  const getToken = async ({ refresh } = {}) => { if (refresh) { refreshes++; held = drive.token; } return held; };
  const remote = driveRemote({ folderId: root, folderName: 'כספת', getToken, fetch: drive.fetch, sleep: async () => {} });
  return { drive, root, remote, refreshes: () => refreshes };
};

test('shouldSync: notes always, images up to 10MB, no dot folders or other files', () => {
  assert.equal(shouldSync('a/b.md'), true);
  assert.equal(shouldSync('x.canvas'), true);
  assert.equal(shouldSync('img/a.PNG', 1000), true);
  assert.equal(shouldSync('img/a.png', 20 * 1024 * 1024), false);
  assert.equal(shouldSync('doc.pdf', 10), false);
  assert.equal(shouldSync('.obsidian/app.json'), false);
  assert.equal(shouldSync('a/.b.md.tali-saving'), false);
});

test('drive list: recursive, paged, skips dot folders, Google Docs and unsupported files', async () => {
  const { remote } = setup();
  const list = await remote.list();
  assert.deepEqual(list.map((f) => f.path).sort(), ['פרויקטים/תוכנית.md', 'פרויקטים/תמונה.png', 'שלום.md']);
  assert.ok(list.every((f) => /^[0-9a-f]{32}$/.test(f.rev)));
});

test('drive read keeps BOM and CRLF; images come back as bytes', async () => {
  const { remote } = setup();
  await remote.list();
  assert.equal(await remote.read('שלום.md'), '﻿# שלום\r\nעם BOM ו־CRLF\r\n');
  const img = await remote.read('פרויקטים/תמונה.png');
  assert.deepEqual([...new Uint8Array(await img.arrayBuffer())], [137, 80, 78, 71, 0, 255]);
});

test('drive write: update in place, create in nested new folders, remove goes to trash', async () => {
  const { drive, root, remote } = setup();
  await remote.list();
  const rev1 = await remote.write('שלום.md', 'חדש');
  assert.equal(drive.byPath(root, 'שלום.md').bytes.toString(), 'חדש');
  assert.match(rev1, /^[0-9a-f]{32}$/);
  await remote.write('חדש/עמוק/מסמך.md', 'תוכן בעברית');
  assert.equal(drive.byPath(root, 'חדש/עמוק/מסמך.md').bytes.toString(), 'תוכן בעברית');
  const foldersMade = drive.log.filter((l) => l === 'POST /drive/v3/files').length;
  await remote.write('חדש/עמוק/שני.md', 'ב');
  assert.equal(drive.log.filter((l) => l === 'POST /drive/v3/files').length, foldersMade, 'folders are reused');
  await remote.remove('פרויקטים/תוכנית.md');
  assert.equal(drive.byPath(root, 'פרויקטים/תוכנית.md'), null);
  assert.ok([...drive.files.values()].some((f) => f.name === 'תוכנית.md' && f.trashed), 'trashed, not deleted');
});

test('drive: expired token is refreshed once; 5xx is retried', async () => {
  const { drive, remote, refreshes } = setup();
  drive.token = 't2'; // the server rotated: t1 is now rejected
  await remote.list();
  assert.equal(refreshes(), 1);
  drive.failNext(2);
  assert.equal((await remote.list()).length, 3);
});

test('drive: a failing folder fails the whole list (never a partial list)', async () => {
  const { drive, remote } = setup();
  drive.failNext(99);
  await assert.rejects(remote.list(), /busy/);
});

test('runSync against Drive: first sync, phone edit, PC edit, conflict copy, delete on phone', async () => {
  const { drive, root, remote } = setup();
  const local = memLocal();
  const hashOf = async (d) => (typeof d === 'string' ? hashText(d) : hashText(Buffer.from(await d.arrayBuffer()).toString('latin1')));
  let r = await runSync(local, remote, { hashOf });
  assert.equal(r.downloaded, 3);
  assert.equal(local.m.get('שלום.md').data, '﻿# שלום\r\nעם BOM ו־CRLF\r\n');

  // second sync: nothing to do
  r = await runSync(local, remote, { hashOf });
  assert.deepEqual([r.uploaded, r.downloaded, r.deleted, r.conflicts.length], [0, 0, 0, 0]);

  // edited on the phone
  const rec = local.m.get('שלום.md');
  local.m.set('שלום.md', { ...rec, data: 'מהטלפון', hash: hashText('מהטלפון') });
  r = await runSync(local, remote, { hashOf });
  assert.equal(r.uploaded, 1);
  assert.equal(drive.byPath(root, 'שלום.md').bytes.toString(), 'מהטלפון');

  // edited on both sides: the PC version keeps the name, the phone version is saved next to it
  const pc = drive.byPath(root, 'פרויקטים/תוכנית.md');
  pc.bytes = Buffer.from('מהמחשב'); pc.modifiedTime = '999999';
  const t = local.m.get('פרויקטים/תוכנית.md');
  local.m.set(t.path, { ...t, data: 'גם מהטלפון', hash: hashText('גם מהטלפון') });
  r = await runSync(local, remote, { hashOf, now: () => new Date(2026, 10, 22, 9, 5) });
  assert.equal(r.conflicts.length, 1);
  assert.equal(local.m.get('פרויקטים/תוכנית.md').data, 'מהמחשב');
  assert.equal(drive.byPath(root, 'פרויקטים/תוכנית (גרסה מהטלפון 09-05).md').bytes.toString(), 'גם מהטלפון');

  // deleted on the phone -> trashed in Drive
  const s = local.m.get('שלום.md');
  local.m.set('שלום.md', { ...s, data: null, hash: null, deleted: true });
  r = await runSync(local, remote, { hashOf });
  assert.equal(r.deleted, 1);
  assert.equal(drive.byPath(root, 'שלום.md'), null);
  assert.equal(r.errors.length, 0);
});

test('listFolders: only folders, sorted by Hebrew name', async () => {
  const { drive } = setup();
  const folders = await listFolders({ getToken: async () => 't1', fetch: drive.fetch });
  assert.deepEqual(folders.map((f) => f.name), ['כספת', 'תיקייה אחרת']);
});
