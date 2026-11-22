// 8.8: סימנים חכמים בהקלדה: -> הופך לחץ, != ל־≠ וכו'. Backspace מיד אחרי ההמרה מחזיר את מה שהוקלד
// (undoInputRule של TipTap). לא בבלוק קוד ולא בקוד בתוך השורה (InputRule של TipTap מדלג עליהם),
// ולא בתוך נוסחה $…$ שעוד לא נסגרה. כבוי בהגדרות: smartSymbols = false.
//
// כיוון (11.5, לבקשת המשתמש): החץ מצביע לצד של המקשים שהוקלדו, גם בעברית: -> תמיד →, <- תמיד ←.
// עד 11.4 בהקשר עברי -> הפך ל־← (כי "->" בעברית מוצג משוקף כ־"<-"). אבל ההמרה קורית מיד עם ה־>,
// כך שהמשתמש אף פעם לא ראה את הצורה המשוקפת, רק לחץ "->" וקיבל חץ לצד השני.
// neutralIsRtl נשאר בשביל תפריט הסמלים (edit-actions.js).
import { Extension, InputRule } from '@tiptap/core';

const STRONG_RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const STRONG_LTR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

// הכיוון של תו ניטרלי (כמו >) במקום `at` בפסקה: לפי האות החזקה האחרונה לפניו, ואם אין, כיוון הפסקה
export function neutralIsRtl(view, $from, at) {
  const text = $from.parent.textBetween(0, Math.max(0, at), null, ' ');
  for (let i = text.length - 1; i >= 0; i--) {
    if (STRONG_RTL.test(text[i])) return true;
    if (STRONG_LTR.test(text[i])) return false;
  }
  try {
    const dom = view.nodeDOM($from.before());
    if (dom instanceof HTMLElement) {
      const cs = getComputedStyle(dom);
      if (cs.unicodeBidi === 'plaintext') {
        const all = $from.parent.textContent;
        for (const ch of all) { if (STRONG_RTL.test(ch)) return true; if (STRONG_LTR.test(ch)) return false; }
      }
      return cs.direction === 'rtl';
    }
  } catch { /* בלי DOM: לפי המסמך */ }
  return document.documentElement.dir === 'rtl' || getComputedStyle(document.body).direction === 'rtl';
}

// [מה שמוקלד, בהקשר משמאל לימין, בהקשר מימין לשמאל]
export const SYMBOLS = [
  ['->', '→', '→'],
  ['<-', '←', '←'],
  ['=>', '⇒', '⇒'],
  ['!=', '≠', '≠'],
  ['>=', '≥', '≤'],
  ['<=', '≤', '≥'],
  ['+-', '±', '±'],
];
// ≥ ו־≤ משתקפים בעצמם בעברית (כמו > ו־<), ולכן אצלם אין צורך להפוך: הם כבר נראים כמו שהוקלדו.
for (const s of SYMBOLS) if (s[0] === '>=' || s[0] === '<=') s[2] = s[1];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const SmartSymbols = Extension.create({
  name: 'smartSymbols',
  addOptions() { return { isOn: () => true }; },
  addInputRules() {
    const ext = this;
    return SYMBOLS.map(([typed, ltr, rtl]) => new InputRule({
      find: new RegExp(escape(typed) + '$'),
      handler: ({ state, range }) => {
        if (!ext.options.isOn()) return null;
        const $from = state.doc.resolve(range.from);
        const before = $from.parent.textBetween(0, $from.parentOffset, null, '￼');
        // בתוך נוסחה $…$ פתוחה (מספר אי־זוגי של $ לא מוסלמים לפני הסמן): משאירים
        if (((before.match(/(^|[^\\])\$/g) || []).length) % 2 === 1) return null;
        const view = ext.editor.view;
        const symbol = neutralIsRtl(view, $from, $from.parentOffset) ? rtl : ltr;
        state.tr.insertText(symbol, range.from, range.to);
      },
    }));
  },
});
