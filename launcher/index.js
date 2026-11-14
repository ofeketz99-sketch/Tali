// המשגר של Tali.exe לפיתוח. נמצא בעותק של Electron מחוץ למאגר ומריץ את הקוד
// ישירות מתיקיית הפרויקט. בפתיחה: מעדכן בבטחה את ענף הפיתוח, מסנכרן תלויות כש־package-lock.json
// השתנה, ובונה את הממשק אם המקור חדש מהתוצר (updater.js). בסגירה: מפעיל את אותו עדכון כתהליך רקע
// (update-on-close.js), כך שהפתיחה הבאה כבר מעודכנת. אף פעם לא צריך להתקין גרסה מחדש.
const { app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { PROJECT, LOG_FILE, log, runUpdate, waitForLock, takeLock, releaseLock } = require('./updater');

function stopWithError(message) {
  log('שגיאת הפעלה: ' + message.replace(/\s+/g, ' ').slice(0, 1000));
  app.whenReady().then(() => {
    dialog.showErrorBox('Tali', message);
    app.quit();
  });
}

// בסגירה: תהליך נפרד ומנותק, כדי שהחלון ייסגר מיד. Tali.exe עצמו רץ כ־Node (ELECTRON_RUN_AS_NODE).
let closeUpdateStarted = false;
function updateOnClose() {
  if (closeUpdateStarted || process.env.TALI_AUTO_UPDATE === '0') return;
  closeUpdateStarted = true;
  try {
    const child = spawn(process.execPath, [path.join(__dirname, 'update-on-close.js')], {
      detached: true, stdio: 'ignore', windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    child.unref();
  } catch (err) { log('לא הצלחנו להפעיל עדכון בסגירה: ' + String(err.message).slice(0, 300)); }
}

if (!PROJECT || !fs.existsSync(path.join(PROJECT, 'main.js'))) {
  stopWithError(`לא מוצאים את הקבצים של Tali.\n\nהנתיב שנבדק: ${PROJECT || '(לא הוגדר)'}\n\nאפשר לבנות שוב את משגר הפיתוח או להגדיר TALI_PROJECT.`);
} else {
  // פתיחה ראשונה בלבד: עותק שני של Tali רק מביא את הראשון לחזית (main.js), ואין סיבה לעדכן בשבילו
  const primary = app.requestSingleInstanceLock();
  if (primary) app.releaseSingleInstanceLock(); // main.js מבקש אותה בעצמו
  try {
    if (primary) {
      waitForLock();
      const mine = takeLock();
      try { runUpdate(); } finally { if (mine) releaseLock(); }
      app.on('will-quit', updateOnClose);
    }
    require(path.join(PROJECT, 'main.js'));
  } catch (err) {
    stopWithError('הכנת גרסת הפיתוח נכשלה, ולכן Tali לא נפתחה עם קוד חלקי.\n\n' + String(err.stderr || err.message).slice(0, 1200) + `\n\nיומן: ${LOG_FILE}`);
  }
}
