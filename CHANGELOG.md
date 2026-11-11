# 2.3 — Softer book and slower pacing (2026-11-11)

- Extended the intro to 4.65 seconds: camera/page motion takes 25% longer and the fully revealed logo holds for approximately one additional second before the fade.
- Rounded the paper and cover silhouettes, added layered page/cover thickness and softer depth shadows, and lightened the cover to pastel blue.
- Verified desktop/mobile frames, completion, skipping, reduced motion, asset failures, Electron reload behavior, build and existing tests.

# 2.2 — Illustrated splash refinement (2026-11-11)

- Reworked the opening around the supplied close-up reference: fine paper grain, irregular hand-drawn ink, a closer opening camera and a continuous eased pullback.
- Replaced rigid CSS leaves with curved, shaded paper meshes. Page turns overlap, the cover closes with the page block, and the complete illustration dissolves into the unchanged original logo.
- Preserves the three-second duration and existing session, skip and reduced-motion handling. Checked sampled desktop/mobile/landscape frames, missing assets, reduced motion, Electron startup/reload and existing tests.

# 2.1 — Startup animation (2026-11-11)

- Added a three-second book intro: close-up schematic handwriting, right-to-left page turns, closing blue cover with the unchanged original logo, then a logo dissolve into the application.
- Uses local CSS 3D and Web Animations with no new dependencies. Application initialization runs concurrently; once per session, with skip/Escape, reduced-motion bypass, asset-error recovery and an independent timeout.
- Includes `src/splash-preview.html` for repeat viewing. Verified desktop/mobile viewport frames, completion, skip, reduced motion, Electron startup and no replay on reload. Existing editor/vault validation limitations from 2.0 remain unchanged.

# 2.0 — Local integration candidate (2026-11-11)

- Integrates the 13 preserved local edits with upstream 15a5c54: Lucide icons and aligned grid layout alongside image controls, table copying/deletion and page annotations.
- Preserves local icons while adding the overlay icon identifiers; keeps updated embed NodeViews and table command availability checks.
- Updates both link-panel toggle paths to the local grid container.
- Synchronizes package and lockfile versions. Desktop interaction and full Markdown vault round-trip validation are pending; this is not a stable desktop release.

# Tali — Patch Notes

גרסאות האפליקציה מתקדמות בצעדים של 0.1 לכל עדכון קטן, החל מקו הבסיס 1.1. מספר הגרסה ב-package.json משתמש גם בספרת תיקון שלישית (למשל 1.9.0). כל שינוי עתידי מחייב רישום כאן ותיעוד הנחיות רלוונטיות ב-AGENTS.md.

## 1.9 — 2026-11-11
- תמונות Markdown רגילות בפורמט `![תיאור](נתיב)` מקבלות בקרות הגדלה, הקטנה וציפת טקסט לצד ההטמעה.
- תמונה שלא שונתה נשארת קישור Markdown רגיל. כפתור איפוס מחזיר תמונה מעוצבת לגודל הטבעי ול-Markdown הרגיל. אחרי שינוי גודל או ציפה נשמר תג `<img>` תקני עם `data-tali-image` ו-`data-tali-wrap`, כדי לשמר עיצוב שאינו קיים בתחביר Markdown בסיסי.
- הוכנסה הכרה ממוקדת בתגיות תמונה מעוצבות, בלי לשנות את הטיפול בקטעי HTML אחרים.
- **טעון אימות ב-Electron:** סבב מלא של טעינה, שינוי גודל, שמירה ופתיחה מחודשת, כולל שילוב עברית ואנגלית.

## 1.8 — 2026-11-11
- נוסף מצב **שרטוט ישירות על הדף**: עט חופשי, חץ, קו, מלבן ועיגול. השרטוטים ניתנים לבחירה, גרירה ומחיקה; Escape מחזיר לכתיבה.
- נוספה **תיבת טקסט צפה** עם אפשרות להזזה, שינוי גודל ועריכת טקסט חופשית. התיבה הישנה שנמצאת בזרימת הפסקה נשארה זמינה בשם "תיבה בתוך הפסקה".
- אובייקטים מרחפים נשמרים בתוך אותו קובץ Markdown, בהערת HTML מקודדת ב-URL (קידוד בלבד, לא הצפנה) שמופיעה בסוף הקובץ. הערה זו אינה משנה את הטקסט הרגיל ומוסתרת בתצוגת Markdown של Obsidian.
- ההטמעה מנהלת בנפרד את מצבי תצוגת Markdown והעריכה העשירה, כך שבמצב גולמי לא מציגים את השכבה המרחפת.
- נוספו בדיקות סדרתיות של שמירה/טעינה חוזרת לשכבה, שימור סיומות שורה LF ו-CRLF, עברית, והימנעות ממחיקת מידע פגום.
- **מגבלה:** מיקומי האובייקטים יחסיים לדף בפיקסלים. שינויי עימוד, רוחב עמוד או הוספת טקסט מעל השרטוט עשויים לדרוש מיקום מחדש. טרם בוצע אימות אינטראקטיבי בתוך Electron.

## 1.7 — 2026-11-11
- נוסף פריט **תיבת טקסט** לתפריט ההוספה: מסגרת מעוצבת וניתנת לעריכה כחלק מזרימת הטקסט. נשמרת כ-callout מבוסס Markdown, ולא כעצם מרחף חופשי.
- ההוספה והעיצוב דורשים בדיקת הרצה ב-Electron ובדיקת שמירה/טעינה מחדש.

## 1.6 — 2026-11-11
- לתמונות ושרטוטים המוטמעים באמצעות `![[...]]`: בקרת הגדלה והקטנה וכפתורים לציפת טקסט משמאל או מימין.
- הרוחב נשמר בפורמט Obsidian `![[name.png|300]]`; ציפה נשמרת בדגל שלישי, `wrap-left` או `wrap-right`, ש-Tali מפרשת בעצמה.
- מגבלה: עדיין אין בקרה מקבילה לתמונות Markdown רגילות `![alt](path)`; בדיקת אינטראקציה ושמירה מקומית טרם הושלמה.

## 1.5 — 2026-11-11
- פריט חדש **שרטוט מהיר**: משטח ראשוני קטן (480×180) עם רקע שקוף ועט, קו, חץ, מלבן ועיגול.
- השרטוט נשמר כקובץ PNG ומוטמע בהערה. זה אינו מצב של ציור ישירות מעל פסקאות קיימות או גרירת חץ בין משפטים.

## 1.4 — 2026-11-11
- נוסף כפתור **העתקת טבלה** לסרגל הצף. הוא מעתיק HTML ואת תוכן התאים בטקסט מופרד בטאבים דרך לוח המערכת.
- מחיקת שורה ועמודה כבר הייתה בקוד; הכפתורים נשארו והוספו תנאי זמינות. הסרגל הותאם לפריסה בכמה שורות במקומות צרים, כדי לא להסתיר פעולות או פלטת צבעים.
- עדיין נדרש לבדוק ידנית שלחצני המחיקה נגישים בכל רוחב חלון ושההעתקה שומרת על העיצוב ביעד.

## 1.3 — 2026-11-11
- חלונית הקישורים עוברת בין מצב סגור ופתוח ללא בניית תוכן מחדש בכל לחיצה.
- נוספו אנימציות עדינות של רוחב, גובה ושקיפות במקום הופעה והיעלמות מיידיות.

## 1.2 — 2026-11-11
- פתיחת פתק הוחלפה בתנועת כניסה קטנה של 3px עם שינוי שקיפות עדין.
- אנימציית Jelly הוקטנה משמעותית, יחד עם דחיסת הכפתורים וה-overshoot הכללי.
- נשמרת ההגדרה `prefers-reduced-motion` להימנעות מאנימציות.

## 1.1 — נקודת מוצא
- גרסת הבסיס כפי שהוגדרה לפני סבב השינויים הזה.

## טרם הושלם
- עיגון שרטוטים ותיבות טקסט למיקום סמנטי בפסקה, כדי שלא יזוזו כאשר תוכן המסמך או רוחבו משתנים.
- בדיקות ממשק אוטומטיות של גרירת שרטוט, הזזת תיבה וציפת תמונות, מעבר לבדיקות שמירת הנתונים שכבר נוספו.
- בדיקות בנייה, הרצה ושמירת Markdown מול כספת הערות אמיתית; לא הורצו משום שאין לסשן גישה לתיקיית העבודה המקומית ב-Windows.
