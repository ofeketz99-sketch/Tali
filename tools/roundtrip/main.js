// בדיקת שמירה נאמנה מול כספת: npm run roundtrip -- <תיקיית הכספת> [תיקיית פלט]
// בונה את page.js, טוען כל הערה לעורך ומשווה. לא כותב לכספת.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFileSync } = require('child_process');
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(process.argv.indexOf('--') + 1);
const vault = path.resolve(args[0] || '.');
const out = path.resolve(args[1] || path.join(root, 'tools', 'roundtrip', 'out'));

app.whenReady().then(async () => {
  execFileSync(path.join(root, 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe'),
    ['tools/roundtrip/page.js', '--bundle', '--outfile=tools/roundtrip/out/page.bundle.js', '--log-level=error'], { cwd: root });
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  ipcMain.on('log', (_e, msg) => process.stdout.write(msg + '\n'));
  ipcMain.once('done', (_e, code) => setTimeout(() => app.exit(code), 100));
  await win.loadFile(path.join(__dirname, 'page.html'), { query: { vault, out } });
});
