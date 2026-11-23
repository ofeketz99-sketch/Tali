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

// Wiki links are single inline nodes. A retrospective link therefore accepts only
// actual, single-line text (not a selection that crosses blocks or contains an atom).
export function wikiTargetFromSelection(value) {
  const target = String(value ?? '');
  return target && !/[\[\]\r\n\uFFFC]/.test(target) ? target : null;
}
