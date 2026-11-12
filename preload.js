// גשר בטוח בין הממשק לבין תהליך ה־main. כל פונקציה כאן מקבילה לפעולה ב־main.js.
const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  // המחשב התעורר משינה או נפתחה נעילה (לבדיקה מחדש של ערכת הצבעים לפי שעה)
  onSystemWake: (fn) => ipcRenderer.on('system-wake', () => fn()),
  onCloseTab: (fn) => ipcRenderer.on('close-tab', () => fn()),
  init: call('init'),
  patchNotes: call('patch-notes'),
  editCommand: call('edit-command'),
  pickFolder: call('pick-folder'),
  pickNewNoteFolder: call('pick-new-note-folder'),
  prepareNewNoteFolder: call('prepare-new-note-folder'),
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
  fileTimes: call('file-times'),
  templates: call('templates'),
  metaRead: call('meta-read'),
  metaWrite: call('meta-write'),
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
  vaultIndex: call('vault-index'),
  move: call('move'),
  exportNote: call('export-note'),
  inlineImages: call('inline-images'),
  openExternalFile: call('open-export'),
});

