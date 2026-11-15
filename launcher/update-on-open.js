// עדכון בפתיחה כתהליך Node נפרד: שומר את תהליך Electron פנוי לציור סמל ההפעלה.
// בניגוד לעדכון בסגירה, כישלון כאן מוחזר למשגר ועוצר פתיחה עם קוד חלקי.
const { log, runUpdate, waitForLock, takeLock, releaseLock } = require('./updater');

try {
  if (!waitForLock()) throw new Error('עדכון קודם עדיין רץ ולא הסתיים בזמן.');
  const mine = takeLock();
  if (!mine) throw new Error('לא הצלחנו לקבל את נעילת העדכון.');
  try {
    log('עדכון בפתיחה התחיל.');
    runUpdate();
    log('עדכון בפתיחה הסתיים.');
  } finally {
    releaseLock();
  }
} catch (err) {
  const message = String(err.stderr || err.message || err).replace(/\s+/g, ' ').slice(0, 1200);
  log('עדכון בפתיחה נכשל: ' + message);
  process.stderr.write(message);
  process.exitCode = 1;
}
