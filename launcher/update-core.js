const BRANCH_RE = /^(?![./])(?!.*(?:\.\.|\/\/|@\{|\\))[A-Za-z0-9._/-]+$/;

function normalizeUpdateBranch(value, fallback = 'desktop-dev') {
  const branch = String(value || '').trim();
  return branch && BRANCH_RE.test(branch) && !branch.endsWith('/') && !branch.endsWith('.') ? branch : fallback;
}

function planUpdate({ enabled = true, gitAvailable, isRepository, dirty, currentBranch, targetBranch }) {
  if (!enabled) return { action: 'skip', reason: 'העדכון האוטומטי כבוי' };
  if (!gitAvailable) return { action: 'skip', reason: 'Git אינו מותקן או אינו זמין' };
  if (!isRepository) return { action: 'skip', reason: 'תיקיית הפרויקט אינה מאגר Git' };
  if (dirty) return { action: 'skip', reason: 'יש שינויים מקומיים שלא נשמרו ב־Git' };
  if (!currentBranch) return { action: 'skip', reason: 'המאגר נמצא ב־detached HEAD' };
  if (currentBranch !== targetBranch) {
    return { action: 'skip', reason: `הענף הפעיל הוא ${currentBranch}, וערוץ העדכון הוא ${targetBranch}` };
  }
  return { action: 'update', reason: '' };
}

// נעילת העדכון (updater.js) תופסת רק אם היא קיימת וצעירה מ־maxAge: נעילה של תהליך שנפל לא חוסמת לנצח
function lockIsFresh(stat, now, maxAge) {
  return Boolean(stat) && now - stat.mtimeMs < maxAge;
}

// גיבוב של package-lock.json רק לפי מה שמשפיע על החבילות המותקנות: בלי שדה ה־version של האפליקציה
// (בראש הקובץ וב־packages[""]), שמשתנה בכל Release. כך העלאת גרסה לא מריצה npm ci.
// קובץ שאינו JSON תקין: גיבוב של הבייטים כמו שהם (עדיף npm ci מיותר מאשר לדלג על שינוי אמיתי).
function lockfileDependencyHash(content) {
  const text = Buffer.isBuffer(content) ? content.toString('utf8') : String(content ?? '');
  if (!text) return '';
  let normalized = text;
  try {
    const lock = JSON.parse(text.replace(/^﻿/, ''));
    if (lock && typeof lock === 'object' && !Array.isArray(lock)) {
      delete lock.version;
      const root = lock.packages && lock.packages[''];
      if (root && typeof root === 'object') delete root.version;
      normalized = 'lock-v1:' + JSON.stringify(lock);
    }
  } catch { /* לא JSON: הבייטים עצמם */ }
  return require('crypto').createHash('sha256').update(normalized).digest('hex');
}

module.exports = { normalizeUpdateBranch, planUpdate, lockIsFresh, lockfileDependencyHash };
