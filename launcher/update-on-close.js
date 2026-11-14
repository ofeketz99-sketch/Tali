// עדכון בסגירה: רץ כתהליך רקע נפרד (Tali.exe עם ELECTRON_RUN_AS_NODE=1, detached) אחרי שהחלון נסגר.
// אותו עדכון בטוח כמו בפתיחה (updater.js), כך שהפתיחה הבאה כבר מוכנה ומהירה. אם עדכון אחר רץ
// (נעילה), לא עושים כלום. כישלון רק נכתב ליומן: אין חלון, ואין מה לעצור.
const { log, runUpdate, takeLock, releaseLock } = require('./updater');

if (!takeLock()) {
  log('עדכון בסגירה דולג: עדכון אחר כבר רץ.');
} else {
  try {
    log('עדכון בסגירה התחיל.');
    runUpdate();
    log('עדכון בסגירה הסתיים.');
  } catch (err) {
    log('עדכון בסגירה נכשל: ' + String(err.stderr || err.message).replace(/\s+/g, ' ').slice(0, 800));
  } finally {
    releaseLock();
  }
}
