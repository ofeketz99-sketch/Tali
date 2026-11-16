// שמירה עמידה לקריסה (9.7).
// כתיבה ישירה על הקובץ עלולה להשאיר מסמך קטוע אם התהליך נופל או הכונן מתנתק באמצע.
// לא מחליפים את הקובץ ב־rename: ב־Windows זה מאפס את זמן היצירה שלו, ש־Tali מציג כ"נוצר".
// במקום זה: קודם עותק מלא ומסונכרן לדיסק בקובץ נסתר ליד המסמך, אחר כך כתיבה במקום, ואז מחיקת העותק.
// אם הכתיבה נקטעה, העותק נשאר, ו־recoverInterruptedSave משחזר ממנו בקריאה הבאה.
const fs = require('fs/promises');
const path = require('path');

// גוש זמן שבו העותק והמסמך שייכים לאותה שמירה. עריכה מבחוץ אחרי זה לא נדרסת.
const SAME_SAVE_MS = 10_000;

// ".שם.md.tali-saving": מתחיל בנקודה, ולכן העץ והאינדקס מדלגים עליו
const backupPath = (file) => path.join(path.dirname(file), `.${path.basename(file)}.tali-saving`);

async function writeDurable(file, content) {
  const handle = await fs.open(file, 'w');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeWithBackup(file, content) {
  const backup = backupPath(file);
  await writeDurable(backup, content);
  await fs.writeFile(file, content, 'utf8');
  await fs.unlink(backup).catch(() => {});
}

// מחזיר true אם המסמך שוחזר מעותק של שמירה שנקטעה
async function recoverInterruptedSave(file) {
  const backup = backupPath(file);
  const saved = await fs.stat(backup).catch(() => null);
  if (!saved) return false;
  const current = await fs.stat(file).catch(() => null);
  // המסמך נערך מבחוץ הרבה אחרי השמירה שנקטעה: לא דורסים, ומשאירים את העותק כמו שהוא
  if (current && current.mtimeMs - saved.mtimeMs > SAME_SAVE_MS) return false;
  const content = await fs.readFile(backup, 'utf8');
  const onDisk = current ? await fs.readFile(file, 'utf8').catch(() => null) : null;
  if (onDisk !== content) await fs.writeFile(file, content, 'utf8');
  await fs.unlink(backup).catch(() => {});
  return onDisk !== content;
}

module.exports = { writeWithBackup, recoverInterruptedSave, backupPath, SAME_SAVE_MS };
