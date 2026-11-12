const path = require('path');

function resolveNewNoteFolderPath(root, relative = 'מסמכים חדשים') {
  if (!root) throw new Error('לא נבחרה תיקיית מסמכים');
  const base = path.resolve(root);
  const value = String(relative ?? '').trim();
  if (value && path.isAbsolute(value)) throw new Error('יש לבחור תיקייה מתוך תיקיית המסמכים של Tali');
  const parts = value.split(/[\\/]+/).filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) throw new Error('תיקיית המסמכים החדשים אינה תקינה');
  const full = path.resolve(base, ...parts);
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error('יש לבחור תיקייה מתוך תיקיית המסמכים של Tali');
  }
  return full;
}

function relativeNewNoteFolderPath(root, selected) {
  const base = path.resolve(root);
  const full = path.resolve(selected);
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error('יש לבחור תיקייה מתוך תיקיית המסמכים של Tali');
  }
  return path.relative(base, full).split(path.sep).join('/');
}

module.exports = { resolveNewNoteFolderPath, relativeNewNoteFolderPath };
