// עדכון גרסת הפיתוח, משותף לפתיחה (index.js) ולסגירה (update-on-close.js):
// fast-forward בטוח של ענף הפיתוח, סנכרון תלויות כש־package-lock.json השתנה, ובניית הממשק.
// בלי electron (app/dialog), כדי שירוץ גם כתהליך רקע אחרי שהחלון נסגר.
// נעילה (update.lock ליד היומן): רק עדכון אחד בכל רגע. פתיחה מיד אחרי סגירה מחכה לעדכון של הסגירה
// במקום להתחרות בו על Git ועל dist/.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { normalizeUpdateBranch, planUpdate, lockIsFresh } = require('./update-core');

const readText = (file) => {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
};
const CANDIDATES = [
  process.env.TALI_PROJECT,
  readText(path.join(__dirname, 'project.txt')),
  'D:\\Projects\\Tali\\Tali - App',
  'D:\\PROJECTS\\Tali',
].filter(Boolean);
const PROJECT = CANDIDATES.find((candidate) => fs.existsSync(path.join(candidate, 'main.js'))) || CANDIDATES[0];
const DEPS = PROJECT ? path.join(PROJECT, 'node_modules') : '';
const UPDATE_BRANCH = normalizeUpdateBranch(
  process.env.TALI_UPDATE_BRANCH || readText(path.join(__dirname, 'branch.txt')),
  'desktop-dev',
);
const STATE_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Tali');
const LOG_FILE = path.join(STATE_DIR, 'launcher-update.log');
const LOCK_FILE = path.join(STATE_DIR, 'update.lock');
const LOCK_MAX_AGE = 10 * 60 * 1000; // נעילה ישנה מזה (תהליך שנפל) לא נחשבת

function log(message) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch { /* יומן העדכון לעולם לא מונע פתיחה */ }
}

function command(file, args, options = {}) {
  return execFileSync(file, args, {
    cwd: PROJECT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout || 120000,
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...options.env },
  }).trim();
}

function findGit() {
  const candidates = [
    process.env.TALI_GIT,
    'git',
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { command(candidate, ['--version'], { timeout: 10000 }); return candidate; } catch { /* הבא */ }
  }
  return '';
}

function updateProject() {
  if (process.env.TALI_AUTO_UPDATE === '0') {
    log('העדכון האוטומטי כבוי דרך TALI_AUTO_UPDATE=0.');
    return { updated: false };
  }
  const git = findGit();
  let isRepository = false;
  let currentBranch = '';
  let dirty = false;
  if (git) {
    try {
      isRepository = command(git, ['rev-parse', '--is-inside-work-tree'], { timeout: 10000 }) === 'true';
      if (isRepository) {
        currentBranch = command(git, ['branch', '--show-current'], { timeout: 10000 });
        dirty = Boolean(command(git, ['status', '--porcelain', '--untracked-files=normal'], { timeout: 15000 }));
      }
    } catch (err) { log('בדיקת Git נכשלה: ' + String(err.message).slice(0, 500)); }
  }

  const plan = planUpdate({
    enabled: process.env.TALI_AUTO_UPDATE !== '0',
    gitAvailable: Boolean(git),
    isRepository,
    dirty,
    currentBranch,
    targetBranch: UPDATE_BRANCH,
  });
  if (plan.action !== 'update') {
    log('העדכון דולג: ' + plan.reason);
    return { updated: false };
  }

  try {
    command(git, ['fetch', '--quiet', 'origin', UPDATE_BRANCH], {
      timeout: 20000,
      env: { GIT_TERMINAL_PROMPT: '0' },
    });
    const local = command(git, ['rev-parse', 'HEAD'], { timeout: 10000 });
    const remote = command(git, ['rev-parse', `origin/${UPDATE_BRANCH}`], { timeout: 10000 });
    if (local === remote) {
      log(`ענף ${UPDATE_BRANCH} כבר מעודכן (${local.slice(0, 8)}).`);
      return { updated: false, head: local };
    }
    try { command(git, ['merge-base', '--is-ancestor', local, remote], { timeout: 10000 }); }
    catch {
      log(`העדכון דולג: הענף המקומי ${UPDATE_BRANCH} התפצל מהענף המרוחק.`);
      return { updated: false, head: local };
    }
    command(git, ['merge', '--ff-only', '--quiet', `origin/${UPDATE_BRANCH}`], { timeout: 60000 });
    log(`עודכן ${local.slice(0, 8)} -> ${remote.slice(0, 8)} מענף ${UPDATE_BRANCH}.`);
    return { updated: true, head: remote };
  } catch (err) {
    // בלי רשת או בלי הרשאת GitHub ממשיכים עם העותק האחרון שעבד.
    log('בדיקת העדכון נכשלה; ממשיכים מקומית: ' + String(err.stderr || err.message).replace(/\s+/g, ' ').slice(0, 800));
    return { updated: false };
  }
}

function lockHash() {
  const lock = path.join(PROJECT, 'package-lock.json');
  return fs.existsSync(lock) ? crypto.createHash('sha256').update(fs.readFileSync(lock)).digest('hex') : '';
}

function dependenciesReady() {
  return fs.existsSync(path.join(DEPS, '@tiptap', 'core', 'package.json'))
    && fs.existsSync(path.join(DEPS, '@esbuild', 'win32-x64', 'esbuild.exe'));
}

function findNodeAndNpmCli() {
  let node = process.env.TALI_NODE || '';
  if (!node) {
    try { node = command('where.exe', ['node'], { timeout: 10000 }).split(/\r?\n/)[0]; } catch { /* הודעה ברורה בהמשך */ }
  }
  if (!node) node = 'C:\\Program Files\\nodejs\\node.exe';
  const npmCandidates = [
    process.env.TALI_NPM_CLI,
    path.join(path.dirname(node), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
  ].filter(Boolean);
  try { command(node, ['--version'], { timeout: 10000 }); } catch { return null; }
  const npmCli = npmCandidates.find((candidate) => fs.existsSync(candidate));
  return npmCli ? { node, npmCli } : null;
}

function syncDependencies() {
  const wanted = lockHash();
  const stamp = path.join(DEPS, '.tali-package-lock.sha256');
  const installed = readText(stamp);
  if (dependenciesReady() && (!installed || installed === wanted)) {
    if (!installed && wanted) fs.writeFileSync(stamp, wanted, 'utf8');
    return;
  }
  log('package-lock.json השתנה; מריץ npm ci.');
  // מריצים את npm-cli.js דרך node.exe. כך אין תלות בכללי הציטוט של npm.cmd ב־Windows.
  const tools = findNodeAndNpmCli();
  if (!tools) throw new Error('לא נמצאו Node ו־npm. יש להתקין Node.js במחשב הפיתוח ולהפעיל שוב.');
  command(tools.node, [tools.npmCli, 'ci', '--no-audit', '--no-fund'], { timeout: 600000 });
  if (!dependenciesReady()) throw new Error('התקנת התלויות הסתיימה, אבל חסרים esbuild או TipTap.');
  if (wanted) fs.writeFileSync(stamp, wanted, 'utf8');
  log('התלויות סונכרנו בהצלחה.');
}

function newestIn(target) {
  if (!fs.existsSync(target)) return 0;
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = 0;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    newest = Math.max(newest, newestIn(path.join(target, entry.name)));
  }
  return newest;
}

function buildIfNeeded(force = false) {
  const out = path.join(PROJECT, 'dist', 'renderer.js');
  const built = fs.existsSync(out) ? fs.statSync(out).mtimeMs : 0;
  const sourceTime = Math.max(
    newestIn(path.join(PROJECT, 'src')),
    newestIn(path.join(PROJECT, 'links.js')),
    newestIn(path.join(PROJECT, 'vault-data.js')),
  );
  if (!force && sourceTime <= built) return;
  const esbuild = path.join(DEPS, '@esbuild', 'win32-x64', 'esbuild.exe');
  command(esbuild, ['src/renderer.js', '--bundle', '--outfile=dist/renderer.js', '--sourcemap', '--log-level=error'], {
    timeout: 120000,
    env: { NODE_PATH: DEPS },
  });
  log('הממשק נבנה בהצלחה.');
}

// ----- נעילה -----
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function lockStat() {
  try { return fs.statSync(LOCK_FILE); } catch { return null; }
}
// מחכה (עד maxWait) שעדכון אחר, למשל של הסגירה, יסתיים. מחזיר true אם הנעילה פנויה.
function waitForLock(maxWait = 120000) {
  const until = Date.now() + maxWait;
  let logged = false;
  while (lockIsFresh(lockStat(), Date.now(), LOCK_MAX_AGE)) {
    if (!logged) { log('מחכה לעדכון שרץ ברקע (מהסגירה הקודמת).'); logged = true; }
    if (Date.now() > until) return false;
    sleep(500);
  }
  return true;
}
function takeLock() {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    if (lockIsFresh(lockStat(), Date.now(), LOCK_MAX_AGE)) return false;
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
    return true;
  } catch { return false; }
}
function releaseLock() {
  try { if (readText(LOCK_FILE) === String(process.pid)) fs.unlinkSync(LOCK_FILE); } catch { /* לא קריטי */ }
}

// כל השלבים: עדכון, תלויות, בנייה. זורק אם התלויות או הבנייה נכשלו (קוד חלקי לא נפתח).
function runUpdate() {
  const update = updateProject();
  syncDependencies();
  buildIfNeeded(update.updated);
  return update;
}

module.exports = { PROJECT, LOG_FILE, log, runUpdate, waitForLock, takeLock, releaseLock };
