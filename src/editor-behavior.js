// החלטות קטנות של העורך שנשמרות כפונקציות טהורות כדי שאפשר לבדוק אותן בלי לפתוח חלון Electron.

// נוסחה שתופסת את כל השורה: $...$ או $$...$$. סימני דולר בודדים בתוך משפט אינם נחשבים.
export function isFormulaOnlyText(text) {
  const value = String(text || '').trim();
  if (value.startsWith('$$') && value.endsWith('$$') && value.length > 4) return true;
  return value.startsWith('$') && value.endsWith('$') && !value.startsWith('$$') && value.length > 2;
}

export function shouldResetCenteredOnBackspace({ empty, offset, type, textAlign }) {
  return !!empty && offset === 0 && ['paragraph', 'heading'].includes(type) && textAlign === 'center';
}

// מסך מלא ומסך מוגדל מקבלים את הסרגל המלא. חלון רגיל מקבל סרגל מצומצם עם תפריט "עוד".
export function usesCompactToolbar({ maximized = false, fullScreen = false } = {}) {
  return !maximized && !fullScreen;
}
