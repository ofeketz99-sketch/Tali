// Offline renderer for the Tali splash. Usage (from the repo root):
//   node_modules\electron\dist\electron.exe tools/splash-render/main.js -- emblem
//   node_modules\electron\dist\electron.exe tools/splash-render/main.js -- preview <outDir> <samples> <t1,t2,...>
//   node_modules\electron\dist\electron.exe tools/splash-render/main.js -- video <out.webm> <samples>
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.whenReady().then(async () => {
  const args = process.argv.slice(process.argv.indexOf('--') + 1);
  const win = new BrowserWindow({
    show: false, width: 1920, height: 1080, useContentSize: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false },
  });
  ipcMain.on('log', (_e, msg) => process.stdout.write(msg + '\n'));
  win.webContents.on('console-message', (_e, level, msg, line, src) => { if (level >= 2) process.stdout.write(`[console] ${msg} ${src}:${line}\n`); });
  ipcMain.once('done', (_e, code) => setTimeout(() => app.exit(code), 200));
  await win.loadFile(path.join(__dirname, 'render.html'), { query: { args: JSON.stringify(args), root: path.resolve(__dirname, '../..') } });
});
