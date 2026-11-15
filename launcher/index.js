// המשגר של Tali.exe לפיתוח. נמצא בעותק של Electron מחוץ למאגר ומריץ את הקוד
// ישירות מתיקיית הפרויקט. בפתיחה: מעדכן בבטחה את ענף הפיתוח, מסנכרן תלויות כש־package-lock.json
// השתנה, ובונה את הממשק אם המקור חדש מהתוצר (updater.js). בסגירה: מפעיל את אותו עדכון כתהליך רקע
// (update-on-close.js), כך שהפתיחה הבאה כבר מעודכנת. אף פעם לא צריך להתקין גרסה מחדש.
// 8.9: הסמל מצויר בתהליך הזה לפני שהעדכון מתחיל. העדכון עצמו רץ כתהליך Node נפרד,
// כדי ש־Git/npm/esbuild הסינכרוניים לא יחסמו את הציור ולא ישאירו את המשתמש בלי חיווי.
const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { PROJECT, LOG_FILE, log } = require('./updater');

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

// 8.9: חלון הסמל שייך לתהליך המשגר שכבר הופעל, ולכן אין את זמן האתחול של Electron נוסף.
// מתחילים את העדכון רק אחרי ready-to-show והצגת החלון; גיבוי קצר מונע תקיעה אם ציור הדף נכשל.
let launchSplash = null;
function startSplash(continueLaunch) {
  const page = path.join(PROJECT, 'src', 'launch-splash.html');
  let continued = false;
  const next = () => {
    if (continued) return;
    continued = true;
    continueLaunch();
  };
  if (!fs.existsSync(page)) { next(); return; }
  try {
    launchSplash = new BrowserWindow({
      width: 200, height: 200, center: true, frame: false, transparent: true, resizable: false,
      movable: false, minimizable: false, maximizable: false, skipTaskbar: true, focusable: false,
      show: false, hasShadow: false, backgroundColor: '#00000000', title: 'TALI-DEV',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    launchSplash.once('ready-to-show', () => {
      if (launchSplash && !launchSplash.isDestroyed()) launchSplash.showInactive();
      log('סמל ההפעלה הוצג.');
      // נותנים ל־Windows לצייר את החלון לפני שתהליך העדכון מתחיל להתחרות על דיסק ומעבד.
      setTimeout(next, 50);
    });
    launchSplash.webContents.once('did-fail-load', next);
    launchSplash.on('closed', () => { launchSplash = null; });
    launchSplash.loadFile(page).catch(next);
    process.env.TALI_LAUNCH_SPLASH = '1'; // main.js לא מציג סמל שני
    setTimeout(next, 1500);
  } catch (err) {
    launchSplash = null;
    log('הסמל של ההפעלה לא הוצג: ' + String(err.message).slice(0, 300));
    next();
  }
}
function stopSplash() {
  if (launchSplash && !launchSplash.isDestroyed()) launchSplash.destroy();
  launchSplash = null;
}

// העדכון משתמש באותו קוד סינכרוני ואותן נעילות כמו קודם, אבל כתהליך Node נפרד. כך חלון הסמל
// נשאר חי ומצויר. שגיאת תלויות/בנייה עדיין עוצרת את הפתיחה ומוצגת למשתמש, כמו לפני 8.9.
function runOpeningUpdate(done) {
  let finished = false;
  const finish = (err) => {
    if (finished) return;
    finished = true;
    done(err);
  };
  const child = spawn(process.execPath, [path.join(__dirname, 'update-on-open.js')], {
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
  child.once('error', finish);
  child.once('exit', (code, signal) => {
    if (code === 0) finish();
    else finish(new Error(stderr.trim() || `תהליך העדכון הסתיים בקוד ${code ?? signal ?? 'לא ידוע'}.`));
  });
}

if (!PROJECT || !fs.existsSync(path.join(PROJECT, 'main.js'))) {
  stopWithError(`לא מוצאים את הקבצים של Tali.\n\nהנתיב שנבדק: ${PROJECT || '(לא הוגדר)'}\n\nאפשר לבנות שוב את משגר הפיתוח או להגדיר TALI_PROJECT.`);
} else {
  // פתיחה ראשונה בלבד: עותק שני של Tali רק מביא את הראשון לחזית (main.js), ואין סיבה לעדכן בשבילו
  const primary = app.requestSingleInstanceLock();
  if (primary) app.releaseSingleInstanceLock(); // main.js מבקש אותה בעצמו
  const loadApp = () => {
    try { require(path.join(PROJECT, 'main.js')); }
    catch (err) {
      stopSplash();
      stopWithError('הכנת גרסת הפיתוח נכשלה, ולכן Tali לא נפתחה עם קוד חלקי.\n\n' + String(err.stderr || err.message).slice(0, 1200) + `\n\nיומן: ${LOG_FILE}`);
    }
  };
  if (!primary) loadApp();
  else app.whenReady().then(() => {
    app.on('will-quit', stopSplash);
    setTimeout(stopSplash, 180000);
    startSplash(() => runOpeningUpdate((err) => {
      if (err) {
        stopSplash();
        stopWithError('הכנת גרסת הפיתוח נכשלה, ולכן Tali לא נפתחה עם קוד חלקי.\n\n' + String(err.message).slice(0, 1200) + `\n\nיומן: ${LOG_FILE}`);
        return;
      }
      // נרשם רק עכשיו: חלון הסמל כבר קיים, והחלון הבא שייווצר הוא החלון הראשי.
      app.on('browser-window-created', (_e, win) => {
        if (win !== launchSplash) win.once('show', stopSplash);
      });
      app.on('will-quit', updateOnClose);
      loadApp();
    }));
  }).catch((err) => {
    stopSplash();
    stopWithError('Tali לא הצליחה להתחיל.\n\n' + String(err.message).slice(0, 1200));
  });
}
