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

module.exports = { normalizeUpdateBranch, planUpdate };
