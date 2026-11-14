// 8.5: הסמל במרכז המסך בזמן שהמשגר מעדכן ובונה (updater.js), לפני שהקוד של Tali בכלל נטען.
// רץ כתהליך נפרד (אותו TALI-DEV.exe, עם TALI_SPLASH_PAGE), כי העדכון בתהליך הראשי סינכרוני וחוסם
// אותו: חלון בתהליך הראשי לא היה מצויר. התהליך הראשי סוגר אותו כשהחלון של Tali מופיע (index.js);
// והוא נסגר לבד אם התהליך הראשי נעלם, או אחרי 3 דקות.
// תיקיית נתונים זמנית משלו: לא נוגע בהגדרות (my-notes) ולא בנעילת העותק היחיד של Tali.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const page = process.env.TALI_SPLASH_PAGE;
const parent = Number(process.env.TALI_SPLASH_PARENT) || 0;
app.setPath('userData', path.join(app.getPath('temp'), 'tali-launch-splash'));

const parentAlive = () => {
  if (!parent) return true;
  try { process.kill(parent, 0); return true; } catch { return false; }
};

if (!page || !fs.existsSync(page)) app.quit();
else {
  app.whenReady().then(() => {
    const win = new BrowserWindow({
      width: 200, height: 200, center: true, frame: false, transparent: true, resizable: false,
      movable: false, minimizable: false, maximizable: false, skipTaskbar: true, focusable: false,
      show: false, hasShadow: false, backgroundColor: '#00000000', title: 'TALI-DEV',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    win.once('ready-to-show', () => win.showInactive());
    win.loadFile(page);
    setInterval(() => { if (!parentAlive()) app.quit(); }, 1000);
    setTimeout(() => app.quit(), 180000);
  });
  app.on('window-all-closed', () => app.quit());
}
