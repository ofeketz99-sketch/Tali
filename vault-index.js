// אינדקס הכספת: סריקה אחת, ניתוח בקצב מוגבל ומטמון קצר שמתבטל בכל שינוי.
// המודול נפרד מה־IPC כדי שאפשר יהיה לבדוק אותו בלי להפעיל Electron.
const defaultFs = require('fs/promises');
const defaultPath = require('path');
const { resolveLink: defaultResolveLink, extractLinks: defaultExtractLinks } = require('./links');
const {
  extractTags: defaultExtractTags,
  extractTasks: defaultExtractTasks,
  extractTargets: defaultExtractTargets,
  getFlag: defaultGetFlag,
  isLinkHub: defaultIsLinkHub,
  getCreatedDate: defaultGetCreatedDate,
} = require('./vault-data');

async function mapLimit(values, limit, mapper) {
  const out = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      out[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), values.length) }, worker));
  return out;
}

// מחזיר את שני הסוגים באותה סריקה. תיקיות נקראות במקביל, אך התוצאה נשמרת
// בסדר של readdir כדי לא לשנות הכרעה היסטורית בין קישורים בעלי שם זהה.
async function scanVault(fs, path, dir) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return { notes: [], attachments: [] }; }
  const parts = await Promise.all(entries.map(async (entry) => {
    if (entry.name.startsWith('.')) return { notes: [], attachments: [] };
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return scanVault(fs, path, full);
    return entry.name.toLowerCase().endsWith('.md')
      ? { notes: [full], attachments: [] }
      : { notes: [], attachments: [full] };
  }));
  return {
    notes: parts.flatMap((part) => part.notes),
    attachments: parts.flatMap((part) => part.attachments),
  };
}

function backlinkRefs(text, extractLinks) {
  return extractLinks(text).map((link) => {
    const lineStart = text.lastIndexOf('\n', link.index) + 1;
    const lineEnd = text.indexOf('\n', link.index);
    const line = text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd).trim();
    return { target: link.target, snippet: line.length > 160 ? line.slice(0, 160) + '…' : line };
  });
}

function memoResolver(resolveLink, files, root) {
  const cache = new Map();
  return (target) => {
    const key = String(target).toLowerCase();
    if (!cache.has(key)) cache.set(key, resolveLink(target, files, root));
    return cache.get(key);
  };
}

function createVaultIndex({
  getRoot,
  fs = defaultFs,
  path = defaultPath,
  resolveLink = defaultResolveLink,
  extractLinks = defaultExtractLinks,
  extractTags = defaultExtractTags,
  extractTasks = defaultExtractTasks,
  extractTargets = defaultExtractTargets,
  getFlag = defaultGetFlag,
  isLinkHub = defaultIsLinkHub,
  getCreatedDate = defaultGetCreatedDate,
  concurrency = 8,
  cacheMs = 5000,
  now = Date.now,
} = {}) {
  if (typeof getRoot !== 'function') throw new TypeError('getRoot is required');
  const parseCache = new Map(); // path -> { mtime, ...parsed }
  let revision = 0;
  let cached = null; // { root, revision, time, snapshot }
  let pending = null; // { root, revision, promise }

  function invalidate(file) {
    revision++;
    cached = null;
    if (file) parseCache.delete(path.resolve(file));
  }

  async function build(root) {
    const scanned = await scanVault(fs, path, root);
    const allFiles = scanned.notes.concat(scanned.attachments);
    const records = (await mapLimit(scanned.notes, concurrency, async (file) => {
      let stat;
      try { stat = await fs.stat(file); } catch { return null; }
      let parsed = parseCache.get(file);
      if (!parsed || parsed.mtime !== stat.mtimeMs) {
        let text;
        try { text = await fs.readFile(file, 'utf8'); } catch { return null; }
        parsed = {
          mtime: stat.mtimeMs,
          targets: extractTargets(text),
          tags: [...new Set(extractTags(text).map((tag) => tag.tag))],
          tasks: extractTasks(text),
          flag: getFlag(text),
          hub: isLinkHub(text),
          created: getCreatedDate(text),
          backlinkRefs: backlinkRefs(text, extractLinks),
        };
        parseCache.set(file, parsed);
      }
      return { file, stat, parsed };
    })).filter(Boolean);

    // קבצים שנמחקו לא נשארים בזיכרון לאורך חיי האפליקציה.
    const live = new Set(scanned.notes);
    for (const file of parseCache.keys()) if (!live.has(file)) parseCache.delete(file);

    const resolve = memoResolver(resolveLink, allFiles, root);
    const notes = records.map(({ file, stat, parsed }) => {
      const links = [];
      const missing = [];
      for (const target of parsed.targets) {
        const resolved = resolve(target);
        if (resolved) {
          if (/\.md$/i.test(resolved) && resolved !== file) links.push(resolved);
        } else if (!/\.[a-z0-9]{2,5}$/i.test(target) || /\.md$/i.test(target)) {
          missing.push(target.split('#')[0].trim());
        }
      }
      return {
        path: file,
        name: path.basename(file).replace(/\.md$/i, ''),
        rel: path.relative(root, file).replace(/\\/g, '/').replace(/\.md$/i, ''),
        links: [...new Set(links)],
        missing: [...new Set(missing.filter(Boolean))],
        tags: parsed.tags,
        tasks: parsed.tasks,
        flag: parsed.flag,
        hub: parsed.hub,
        mtime: stat.mtimeMs,
        created: parsed.created
          ? new Date(parsed.created + 'T00:00').getTime()
          : Math.min(stat.birthtimeMs || stat.mtimeMs, stat.mtimeMs),
      };
    });
    return { index: { notes }, attachments: scanned.attachments, records };
  }

  async function snapshot() {
    const root = getRoot();
    if (!root) return { index: { notes: [] }, attachments: [], records: [] };
    const time = now();
    if (cached && cached.root === root && cached.revision === revision && time - cached.time < cacheMs) {
      return cached.snapshot;
    }
    if (pending && pending.root === root && pending.revision === revision) return pending.promise;

    const startedAt = revision;
    const promise = build(root).then((value) => {
      if (revision === startedAt && getRoot() === root) {
        cached = { root, revision: startedAt, time: now(), snapshot: value };
      }
      return value;
    }).finally(() => {
      if (pending?.promise === promise) pending = null;
    });
    pending = { root, revision: startedAt, promise };
    return promise;
  }

  async function index() { return (await snapshot()).index; }
  async function attachments() {
    const root = getRoot();
    if (!root) return [];
    const time = now();
    if (cached && cached.root === root && cached.revision === revision && time - cached.time < cacheMs) {
      return cached.snapshot.attachments;
    }
    if (pending && pending.root === root && pending.revision === revision) {
      return (await pending.promise).attachments;
    }
    return (await scanVault(fs, path, root)).attachments;
  }
  async function backlinks(target) {
    const root = getRoot();
    if (!root) return [];
    const safeTarget = path.resolve(target);
    const data = await snapshot();
    const files = data.records.map((record) => record.file);
    const resolve = memoResolver(resolveLink, files, root);
    const out = [];
    for (const { file, parsed } of data.records) {
      if (file === safeTarget) continue;
      const hits = parsed.backlinkRefs.filter((link) => resolve(link.target) === safeTarget);
      if (!hits.length) continue;
      out.push({
        path: file,
        name: path.basename(file).replace(/\.md$/i, ''),
        snippet: hits[0].snippet,
        count: hits.length,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, 'he', { numeric: true }));
    return out;
  }

  return { index, attachments, backlinks, invalidate };
}

module.exports = { createVaultIndex, scanVault, mapLimit };
