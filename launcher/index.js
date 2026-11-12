// המשגר של Tali.exe (נמצא ב־D:\Projects\Tali\Tali\resources\app). הפרויקט: D:\Projects\Tali\Tali - App.
// מריץ את הקוד ישירות מתיקיית הפרויקט, כך שכל שינוי בקוד נכנס בלי לארוז מחדש.
// אם קובץ ב־src חדש יותר מ־dist/renderer.js, בונה קודם (esbuild), כמו start.cmd.
// עדכון של הקובץ הזה: להעתיק אותו שוב ל־resources\app (ראו "הרצה" ב־AGENTS.md).
const { app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// סדר החיפוש: משתנה סביבה TALI_PROJECT, אחר כך project.txt שליד המשגר (נכתב ב־npm run make-exe),
// ואחריהם הנתיב הנוכחי של המשתמש (מ־12.11.2026) והנתיב הישן.
const readProjectFile = () => {
  try { return fs.readFileSync(path.join(__dirname, 'project.txt'), 'utf8').trim(); } catch { return ''; }
};
const CANDIDATES = [process.env.TALI_PROJECT, readProjectFile(), 'D:\\Projects\\Tali\\Tali - App', 'D:\\PROJECTS\\Tali'].filter(Boolean);
const PROJECT = CANDIDATES.find((p) => fs.existsSync(path.join(p, 'main.js'))) || CANDIDATES[0];
const DEPS = path.join(PROJECT, 'node_modules');

if (!fs.existsSync(path.join(PROJECT, 'main.js'))) {
  app.whenReady().then(() => {
    dialog.showErrorBox('Tali', `לא מוצאים את הקבצים של Tali בתיקייה:\n${PROJECT}\n\nאולי הכונן D לא מחובר, או שהתיקייה הועברה.`);
    app.quit();
  });
} else {
  buildIfNeeded();
  require(path.join(PROJECT, 'main.js'));
}

function newestIn(dir) {
  let t = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newestIn(p) : fs.statSync(p).mtimeMs);
  }
  return t;
}

function buildIfNeeded() {
  try {
    const out = path.join(PROJECT, 'dist', 'renderer.js');
    const built = fs.existsSync(out) ? fs.statSync(out).mtimeMs : 0;
    if (newestIn(path.join(PROJECT, 'src')) <= built && fs.statSync(path.join(PROJECT, 'links.js')).mtimeMs <= built) return;
    execFileSync(path.join(DEPS, '@esbuild', 'win32-x64', 'esbuild.exe'),
      ['src/renderer.js', '--bundle', '--outfile=dist/renderer.js', '--sourcemap', '--log-level=error'],
      { cwd: PROJECT, env: { ...process.env, NODE_PATH: DEPS }, windowsHide: true, timeout: 60000 });
  } catch (err) {
    // ממשיכים עם הגרסה הבנויה האחרונה, ומספרים למה
    app.whenReady().then(() => dialog.showErrorBox('Tali', 'עדכון הקוד נכשל, נפתחת הגרסה הקודמת.\n\n' + String(err.stderr || err.message).slice(0, 800)));
  }
}
