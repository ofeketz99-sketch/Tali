// בונה את גרסת הפיתוח TALI-DEV מהמאגר, במחשב Windows כלשהו. הרצה: npm run make-exe [תיקיית יעד]
// התוצאה: תיקייה עם TALI-DEV.exe (עותק של electron.exe), משגר ב־resources\app (המקור: launcher/),
// וקיצור דרך "TALI-DEV" בשולחן העבודה עם הסמל של Tali. המשגר מריץ את הקוד ישירות מתיקיית המאגר הזו
// (נרשמת ב־project.txt), ומעדכן אותו מענף desktop-dev בכל פתיחה וסגירה.
// ברירת המחדל לתיקיית היעד: TALI-DEV, ליד תיקיית המאגר (מחוץ ל־Git).
//
// Smart App Control (מ־7.5): אסור לשנות את תוכן ה־exe. עד 7.4 הסקריפט קבע סמל ופרטי תוכנה עם rcedit,
// וזה הפך את electron.exe לקובץ חדש שאין לו מוניטין אצל Microsoft, ו־Smart App Control של Windows 11
// חסם אותו. electron.exe המקורי (גם בשם אחר) מוכר ומותר. לכן ה־exe נשאר כמו שהוא, והסמל והשם
// מגיעים מקיצור הדרך ומהחלון עצמו (main.js). פירוט: AGENTS.md, "Smart App Control".
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const EXE = 'TALI-DEV.exe';
const SHORTCUT = 'TALI-DEV';
const root = path.resolve(__dirname, '..');
const target = path.resolve(process.argv[2] || path.join(root, '..', 'TALI-DEV'));
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');

function fail(msg) { console.error('שגיאה: ' + msg); process.exit(1); }

if (process.platform !== 'win32') fail('הסקריפט בונה גרסה של Windows, ולכן צריך להריץ אותו ב־Windows.');
if (!fs.existsSync(path.join(electronDist, 'electron.exe'))) fail('חסר ' + path.join(electronDist, 'electron.exe') + '. להריץ npm install (ראו AGENTS.md אם הקובץ עדיין חסר).');
if (target === root || root.startsWith(target + path.sep)) fail('תיקיית היעד לא יכולה להיות המאגר או תיקייה שמכילה אותו.');
if (fs.existsSync(target) && !fs.existsSync(path.join(target, EXE)) && !fs.existsSync(path.join(target, 'Tali.exe'))) {
  if (fs.readdirSync(target).length) fail('תיקיית היעד קיימת ואינה ריקה ואינה תיקיית TALI-DEV קודמת: ' + target);
}

console.log('בונה ב־' + target);
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(electronDist, target, { recursive: true });
fs.renameSync(path.join(target, 'electron.exe'), path.join(target, EXE)); // שינוי שם בלבד: התוכן זהה למקור
fs.rmSync(path.join(target, 'resources', 'default_app.asar'), { force: true });

const app = path.join(target, 'resources', 'app');
fs.mkdirSync(app, { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'launcher'))) {
  fs.copyFileSync(path.join(root, 'launcher', f), path.join(app, f));
}
fs.writeFileSync(path.join(app, 'project.txt'), root, 'utf8');

// הסמל לקיצור הדרך נשמר ליד ה־exe, כדי שלא יתלה בקובץ בתוך המאגר
const icon = path.join(target, 'TALI-DEV.ico');
fs.copyFileSync(path.join(root, 'build', 'icon.ico'), icon);

// קיצור דרך בשולחן העבודה (נתיב שולחן העבודה האמיתי, גם כשהוא ב־OneDrive)
const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' }).trim();
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
let shortcut = '';
try {
  const desktop = ps("[Environment]::GetFolderPath('Desktop')");
  shortcut = path.join(desktop, SHORTCUT + '.lnk');
  ps([
    '$s = (New-Object -ComObject WScript.Shell).CreateShortcut(' + q(shortcut) + ')',
    '$s.TargetPath = ' + q(path.join(target, EXE)),
    '$s.WorkingDirectory = ' + q(target),
    '$s.IconLocation = ' + q(icon + ',0'),
    "$s.Description = 'TALI-DEV: Tali development build, updates from GitHub on every open'", // באנגלית: עברית בשורת הפקודה של PowerShell משתבשת
    '$s.Save()',
  ].join('; '));
} catch (err) {
  shortcut = '';
  console.warn('לא הצלחנו ליצור קיצור דרך בשולחן העבודה: ' + String(err.message).split('\n')[0]);
}

console.log('\nנוצר: ' + path.join(target, EXE));
if (shortcut) console.log('קיצור דרך: ' + shortcut);
console.log('הקובץ מריץ את הקוד מ־' + root + ', ולכן התיקייה הזו חייבת להישאר במקומה.');
