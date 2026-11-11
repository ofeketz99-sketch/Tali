// גשר בטוח בין הממשק לבין תהליך ה־main. כל פונקציה כאן מקבילה לפעולה ב־main.js.
const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  init: call('init'),
  pickFolder: call('pick-folder'),
  tree: call('tree'),
  read: call('read'),
  write: call('write'),
  createNote: call('create-note'),
  createFolder: call('create-folder'),
  rename: call('rename'),
  remove: call('delete'),
  search: call('search'),
  backlinks: call('backlinks'),
  mtime: call('mtime'),
  attachments: call('attachments'),
  openPath: call('open-path'),
  getPrefs: call('get-prefs'),
  setPrefs: call('set-prefs'),
  importImages: call('import-images'),
  saveAttachment: call('save-attachment'),
  reveal: call('reveal'),
  duplicate: call('duplicate'),
  copyTable: call('copy-table'),
  saveConflictCopy: call('save-conflict-copy'),
  writeImage: call('write-image'),
});
