// בונה Tali.exe מהמאגר, במחשב Windows כלשהו. הרצה: npm run make-exe [תיקיית יעד]
// מבצע את השלבים הידניים מ־AGENTS.md ("הרצה"): עותק של electron.exe בשם Tali.exe, משגר ב־resources\app,
// וסמל ופרטי תוכנה עם rcedit. המשגר מריץ את הקוד ישירות מתיקיית המאגר הזו (נרשמת ב־project.txt).
// ברירת המחדל לתיקיית היעד: Tali-exe, ליד תיקיית המאגר (מחוץ ל־Git).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const target = path.resolve(process.argv[2] || path.join(root, '..', 'Tali-exe'));
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
const rcedit = path.join(root, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');

function fail(msg) { console.error('שגיאה: ' + msg); process.exit(1); }

if (process.platform !== 'win32') fail('הסקריפט בונה קובץ של Windows ומריץ את rcedit, ולכן צריך להריץ אותו ב־Windows.');
if (!fs.existsSync(path.join(electronDist, 'electron.exe'))) fail('חסר ' + path.join(electronDist, 'electron.exe') + '. להריץ npm install (ראו AGENTS.md אם הקובץ עדיין חסר).');
if (!fs.existsSync(rcedit)) fail('חסר rcedit. להריץ npm install.');
if (target === root || root.startsWith(target + path.sep)) fail('תיקיית היעד לא יכולה להיות המאגר או תיקייה שמכילה אותו.');
if (fs.existsSync(target) && !fs.existsSync(path.join(target, 'Tali.exe'))) {
  if (fs.readdirSync(target).length) fail('תיקיית היעד קיימת ואינה ריקה ואינה תיקיית Tali קודמת: ' + target);
}

console.log('בונה ב־' + target);
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(electronDist, target, { recursive: true });
fs.renameSync(path.join(target, 'electron.exe'), path.join(target, 'Tali.exe'));
fs.rmSync(path.join(target, 'resources', 'default_app.asar'), { force: true });

const app = path.join(target, 'resources', 'app');
fs.mkdirSync(app, { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'launcher'))) {
  fs.copyFileSync(path.join(root, 'launcher', f), path.join(app, f));
}
fs.writeFileSync(path.join(app, 'project.txt'), root, 'utf8');

const version = require(path.join(root, 'package.json')).version;
execFileSync(rcedit, [
  path.join(target, 'Tali.exe'),
  '--set-icon', path.join(root, 'build', 'icon.ico'),
  '--set-version-string', 'ProductName', 'Tali',
  '--set-version-string', 'FileDescription', 'Tali',
  '--set-version-string', 'InternalName', 'Tali',
  '--set-version-string', 'OriginalFilename', 'Tali.exe',
  '--set-file-version', version,
  '--set-product-version', version,
], { stdio: 'inherit' });

console.log('\nנוצר: ' + path.join(target, 'Tali.exe'));
console.log('הקובץ מריץ את הקוד מ־' + root + ', ולכן התיקייה הזו חייבת להישאר במקומה.');
