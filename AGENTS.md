# Tali: מדריך לעבודה עם AI

שם האפליקציה הוא **Tali**. הסמל: `build/icon.ico` (חלון וקיצור דרך), `build/icon.png` (512), `src/logo.png` (בתוך הממשק). המקור היה תמונה מהמשתמש; הרקע הלבן סביב הריבוע הוסר והפך לשקוף, ונשארו שוליים של כ־8% מכל צד (כמו באייקונים של Windows), אחרת הפינות המעוגלות נראות חתוכות.
ההגדרות נשמרות בתיקייה `%APPDATA%\my-notes` (השם הקודם), בכוונה, כדי ששינוי השם לא יאבד אותן. ראו `app.setPath('userData', ...)` בראש `main.js`.

אפליקציית הערות אישית על `Electron`, שעובדת מול תיקייה רגילה של קבצי `.md`.
המטרה: להיות אובסידיאן עם עורך עשיר כמו וורד, שאפשר לשנות לגמרי באמצעות AI.

## הרצה

הפרויקט ב־`D:\PROJECTS\Tali`, עם Git. התלויות ב־`node_modules` שבתוכו, כמו בכל פרויקט רגיל.

**Git ו־GitHub:** הקוד מגובה במאגר פרטי, https://github.com/ofeketz99-sketch/Tali (ענף `main`).
- אחרי כל שינוי שעובד: `git add -A`, `git commit -m "..."`, `git push`.
- כתובת המייל בשמירות היא הכתובת האנונימית של GitHub (`...@users.noreply.github.com`, מוגדרת ב־`git config` של המאגר). אין לשים כתובת מייל אמיתית: GitHub חוסם העלאה שחושפת מייל פרטי.
- Git מותקן ב־`C:\Program Files\Git`. אם `git` לא מוכר בטרמינל, להשתמש בנתיב המלא `C:\Program Files\Git\cmd\git.exe`.
(עד 11.11.2026 הוא היה ב־Google Drive, ושם npm לא הצליח לכתוב `node_modules`. לכן עבר לכאן.)

- **הרצה רגילה:** `C:\Users\ofeke\.tali\Tali\Tali.exe`, או קיצור הדרך "Tali" בשולחן העבודה.
  זה עותק של `electron.exe` בשם Tali, עם הסמל ופרטי התוכנה (נקבעו עם `rcedit`). בתוכו, ב־`resources\app`, יש משגר קטן (המקור: `launcher/`) שמריץ את `main.js` ישירות מ־`D:\PROJECTS\Tali`, ובונה מחדש לבד אם קובץ ב־`src` חדש יותר מ־`dist/renderer.js`. לכן שינויים בקוד נכנסים בפתיחה הבאה, בלי לארוז מחדש.
  שינוי ב־`launcher/`: להעתיק את הקבצים שוב ל־`C:\Users\ofeke\.tali\Tali\resources\app`. עדכון גרסת Electron: להעתיק מחדש את `node_modules\electron\dist`, לשנות את שם `electron.exe` ל־`Tali.exe`, למחוק `resources\default_app.asar`, ולהריץ `node_modules\rcedit\bin\rcedit-x64.exe` שוב (סמל ושם).
- **בנייה:** `npm run build`. **הרצה עם בנייה:** `npm start` או `start.cmd`. **פיתוח:** `npm run watch`, ורענון החלון עם Ctrl+R.

התקנה במחשב חדש: `npm install`. אם `node_modules\electron\dist\electron.exe` חסר אחרי ההתקנה (קורה עם Node 26), פורסים ידנית את ה־zip של Electron מתיקיית ה־Cache שלו לתוך `node_modules\electron\dist` וכותבים `electron.exe` לקובץ `node_modules\electron\path.txt`.

**זהירות מתוך Claude:** אפליקציית Claude לשולחן העבודה מפנה את `%LOCALAPPDATA%` ו־`%APPDATA%` לתיקייה פרטית שלה. קבצים שנכתבים לשם מתוך סשן של Claude לא קיימים מבחינת המשתמש. לכן Tali.exe ב־`C:\Users\ofeke\.tali` ולא ב־AppData.

## מבנה הפרויקט

| קובץ | תפקיד |
| --- | --- |
| `main.js` | תהליך ראשי. כל הגישה לדיסק (קריאה, כתיבה, חיפוש, מחיקה לסל) |
| `preload.js` | גשר בין הממשק ל־`main.js`. כל פעולה חדשה בדיסק מוסיפים גם כאן |
| `src/index.html` | מבנה הדף |
| `src/styles.css` | כל העיצוב. צבעים וגופנים במשתנים בראש הקובץ |
| `src/editor.js` | העורך (`TipTap`), טעינה ושמירה כ־Markdown, מעבר לתצוגה גולמית |
| `src/toolbar.js` | סרגל הכלים העליון, בקבוצות: ביטול · סגנון פסקה · B I U S · צבעים · רשימות · יישור · הוספה · Markdown |
| `src/icons.js` | כל האייקונים מ־Lucide (חבילת `lucide`, רישיון ISC). אין להשתמש באימוג'י או בסימני טקסט בממשק |
| `src/sidebar.js` | עץ הקבצים ותוצאות חיפוש |
| `src/renderer.js` | חיווט כללי: מצב האפליקציה, דיאלוגים, תפריט ימני, שמירה אוטומטית, היסטוריית ניווט |
| `src/wikilink.js` | קישורי `[[הערה]]` בעורך: הצומת, קריאה ושמירה כ־Markdown, השלמה אוטומטית |
| `src/obsidian-md.js` | שמירה נאמנה של תחביר אובסידיאן: בריחה, ירידות שורה, HTML, נוסחאות, callouts, מאפיינים |
| `src/embed.js` | תמונות: `![[תמונה.png]]` ו־`![תיאור](נתיב)` |
| `src/settings.js` | חלון ההגדרות, שמירתן והחלתן כמשתני CSS |
| `src/palette.js` | חלון החיפוש המהיר (מעבר להערה ולוח פקודות) והתאמה גמישה (`fuzzy`) |
| `src/linkhub.js` | הצעת "פתק קישור" אחרי שמקשרים בין שתי הערות |
| `src/linkpicker.js` | בורר פתקים לקישור: חיפוש + בחירה מרובה |
| `src/table.js` | טבלאות: בחירת גודל, סרגל צף, צבע תאים, ושמירה כ־Markdown או HTML |
| `src/paint.js` | מיני צייר. הציור נשמר כ־PNG בתיקיית התמונות |
| `links.js` | זיהוי ופענוח של `[[קישורים]]`. משותף ל־`main.js` ולממשק |
| `launcher/` | המשגר של Tali.exe (מועתק ל־`C:\Users\ofeke\.tali\Tali\resources\app`) |
| `start.cmd` | בנייה והפעלה מהתיקייה (לפיתוח) |

### פתק קישור

- אחרי שנוצר קישור להערה קיימת (מההשלמה האוטומטית או בהקלדת `[[שם]]`), אותה חלונית מציעה "הוספת פתק קישור". Tab פותח שדה שם, כל מקש אחר ממשיך לכתוב ומעלים את ההצעה.
- פתק קישור הוא הערה רגילה שמכילה רק רשימת קישורים: `- [[הערה א]]` ו־`- [[הערה ב]]`. אם הוא כבר קיים, מתווספים רק הקישורים שחסרים.
- ההערות עצמן לא משתנות. הקשר נראה בהן ברשימת הקישורים החוזרים.

### תפריט ימני, שכפול וקישור לפתקים אחרים

- תפריט ימני בעץ (`showContextMenu` ב־`renderer.js`): רוחב אחיד, אייקון לכל פעולה, קו דהוי בין פעולות, ונפתח לכיוון פנים החלון כדי לא להיחתך. הערה: שינוי שם, שכפול, קישור לפתקים אחרים, מחיקה. תיקייה: הערה חדשה בתיקייה, שינוי שם, מחיקה.
- שכפול: `שם (עותק).md` באותה תיקייה (`duplicate` ב־`main.js`), ונפתח מיד.
- "קישור לפתקים אחרים" פותח בורר עם חיפוש ובחירה מרובה. הקישורים נשמרים במאפייני ההערה, בפורמט שאובסידיאן מזהה:
  ```
  ---
  links:
    - "[[הערה א]]"
  ---
  ```
  לכן הם מופיעים גם בקישורים החוזרים של ההערות המקושרות, ושינוי שם מעדכן אותם. העזרים ב־`links.js` (`getFrontmatterLinks`, `setFrontmatterLinks`) שומרים את שאר המאפיינים כמו שהם.
- לוח "קישורים" לצד הדף (`#linksPanel`): מצומצם כברירת מחדל, נפתח בלחיצה (נזכר ב־`localStorage`). פתוח, הדף זז הצידה כדי שהלוח לא יסתיר אותו. בלוח: פתיחת הערה, הסרת קישור (✕), והוספה.
- תיבת המאפיינים לא מציגה את שורות `links:` (הן בלוח), ומחזירה אותן לאותו מקום בשמירה (`splitLinksLines`/`mergeLinksLines`).
- שורה ריקה בסוף הקובץ נשמרת גם אחרי עריכה.

### טבלאות

- כפתור "טבלה" פותח בחירת גודל בריחוף. כשהסמן בטבלה מופיע מעליה סרגל: שורות, עמודות, מחיקה, מיזוג/פיצול, שורת כותרת, צבע תא, מחיקת טבלה. Tab עובר לתא הבא, ובתא האחרון מוסיף שורה.
- טבלה פשוטה נשמרת כטבלת Markdown. טבלה עם צבע, מיזוג או רוחב עמודות שהשתנה נשמרת כ־HTML (`isPlain` ב־`table.js`), כי ל־Markdown אין דרך לשמור אותם. באובסידיאן היא תוצג אבל תהיה פחות נוחה לעריכה שם.

### ציור

- כפתור "ציור": עט, מרקר, קו, חץ, מלבן, עיגול, מחק, צבעים, עוביים, ביטול/חזרה, הגדלת הדף, רקע שקוף.
- נשמר כ־`Drawing <תאריך ושעה>.png` בתיקיית התמונות, ונכנס להערה כ־`![[Drawing ...png|900]]` (הרוחב שבו צויר).
- לחיצה כפולה על ציור (קובץ שמתחיל ב־`Drawing`) פותחת אותו לעריכה ושומרת מעליו (`write-image` ב־`main.js`). תמונות אחרות לא נערכות, כדי לא לדרוס תמונה מקורית.

### מקלדת ופקודות

- כל הפקודות מוגדרות במקום אחד: `COMMANDS` ב־`renderer.js`. פקודה עם `keys` מקבלת קיצור, וכולן מופיעות בלוח הפקודות (Ctrl+P).
- קיצורים מזוהים לפי המקש הפיזי (`e.code`), כדי שיעבדו גם כשהמקלדת בעברית. אין להשתמש ב־`e.key` לקיצורים.
- הקיצורים נתפסים בשלב הלכידה, לפני העורך. לכן Ctrl+E מחליף תצוגה ולא מסמן קוד. אין לקחת קיצורי עריכה (Ctrl+B/I/U/Z).
- בזמן דיאלוג פתוח (שם, אישור, הגדרות) הקיצורים כבויים.
- הערות אחרונות ותיקיות מכווצות נשמרות ב־`localStorage`, לכל תיקיית עבודה בנפרד.

| קיצור | פעולה |
| --- | --- |
| Ctrl+O | מעבר מהיר להערה (האחרונות קודם, חיפוש גמיש, יצירה אם אין) |
| Ctrl+P | לוח פקודות |
| Ctrl+N / Ctrl+Shift+N | הערה / תיקייה חדשה |
| Ctrl+Shift+F | חיפוש בכל ההערות |
| Ctrl+E | תצוגה מעוצבת או Markdown |
| F2 | שינוי שם ההערה |
| Ctrl+S | שמירה |
| Alt+חצים | אחורה וקדימה |
| Ctrl+, | הגדרות |

- האפליקציה רצה בעותק אחד: הפעלה נוספת מביאה לחזית את החלון הפתוח (`requestSingleInstanceLock` ב־`main.js`).

### עיצוב והגדרות

- כל הצבעים ב־`styles.css` הם משתנים בראש הקובץ. אין לכתוב צבע קבוע (כמו `#fff`) בשום מקום אחר, אחרת הוא ישבר במצב כהה ובשינוי צבעים.
- ברירת המחדל: לבן פסטלי חמים, צבע מודגש תכלת (`#6cb8e6`), גופן Calibri, ימין לשמאל.
- משטחים בגוון המודגש: `--accent-tint` (סרגל עליון, ראש הסרגל הצדדי, שורת מצב, קישורים חוזרים), `--accent-line` (קווי מסגרת), ו־`--accent` מלא עם `--on-accent` לכפתור הראשי ולכפתור פעיל.
- גופן הממשק והכותרות: Rubik (מעוגל, עם עברית). הקבצים ב־`src/fonts` (רישיון OFL, `Rubik-OFL-LICENSE.txt`), כך שלא צריך אינטרנט. גופן הכותרות בהערות הוא הגדרה (`fontHeading`, או "כמו הטקסט").
- תנועה "ג'לי": `--spring` (עובר מעט את היעד וחוזר). כפתורים מתרוממים בריחוף, נמעכים בלחיצה, וכל לחיצה מפעילה את אנימציית `jelly` (מאזין אחד ב־`renderer.js`). חלונות ותפריטים נכנסים ב־`pop-spring`, הדף ב־`rise-spring`, פריטים ברשימות נכנסים אחד אחרי השני לפי `--i`.
- קטע "ליטוש" בסוף `styles.css` דורס בכוונה הגדרות קודמות (כותרות, מסגרות, תנועה). שינוי עיצובי חדש: עדיף שם.
- תנועה: מעברים של 0.12–0.3 שניות עם `--ease`. חלונות ותפריטים נכנסים באנימציית `pop`/`dialog-in`, הדף ב־`page-in`. מי שביקש ב־Windows פחות אנימציות מקבל בלי (`prefers-reduced-motion`).
- הסבר בריחוף: כל אלמנט עם `data-tip` מקבל אותו אוטומטית (ב־`renderer.js`). לא להשתמש ב־`title` לכפתורים.
- כפתור חדש בסרגל העליון: לקבוצה המתאימה ב־`buildToolbar`, עם אייקון מ־`icons.js` ו־`tip`. אם הסרגל כבר לא נכנס בשורה אחת, להוסיף לתפריט "הוספה" במקום כפתור. גוונים נגזרים (`--accent-soft`, `--accent-strong`) מחושבים מ־`--accent` עם `color-mix`, כך שכל צבע שנבחר עובד.
- ההגדרות נשמרות במפתח `prefs` בקובץ `settings.json` של האפליקציה (לא בתיקיית ההערות).
- הגדרה חדשה: ערך ב־`DEFAULTS`, החלה ב־`applyPrefs`, ושורה ב־`buildDialog` (כולם ב־`settings.js`).

### תמונות

- כפתור "תמונה" בסרגל, הדבקה (Ctrl+V) וגרירה לתוך ההערה. בכל המקרים התמונה מועתקת לתיקיית העבודה ונכנס `![[שם]]`.
- המיקום לפי ההגדרות: תיקייה קבועה (ברירת מחדל `attachments`) או ליד ההערה. שם תפוס מקבל מספר (`תמונה 1.png`).
- תמונה מהלוח נקראת `Pasted image <תאריך ושעה>.png`, כמו באובסידיאן.

### שמירה נאמנה לאובסידיאן

העורך הופך את הקובץ למסמך וכותב אותו מחדש בשמירה. לכן כל תחביר שהעורך לא מכיר חייב להישמר בצד ולהיכתב חזרה כמו שהיה:

| תחביר | איך נשמר |
| --- | --- |
| ירידת שורה בודדת | `breaks: true`, ונכתבת חזרה כירידת שורה (`FaithfulHardBreak`) |
| מאפיינים `---` בראש הקובץ | לא נכנסים לעורך. מוצגים בתיבה `#props` ומוחזרים לראש הקובץ |
| `$נוסחה$`, `%%הערה%%`, `[טקסט]()` | טקסט מילולי (כלל `obsidian_literal`) |
| `$$` על כמה שורות | גוש גולמי (`rawHtmlBlock` עם `kind: math`) |
| HTML לא מוכר, `<!-- -->` | גוש או תגית גולמיים (`rawHtmlBlock`, `rawHtmlInline`) |
| `[^1]` הערות שוליים | כלל ה־`reference` של markdown-it כבוי, ולכן נשארות טקסט |
| `> [!NOTE]` | ציטוט רגיל בקובץ. העיצוב הוא קישוט תצוגה בלבד |
| `----`, כותרת עם `===` מתחת | הצורה המקורית נשמרת כמאפיין של הצומת |
| `* _ [ ] #` בטקסט | בריחה רק אם בלעדיה הטקסט ייקרא אחרת (`isPlainInline`) |

בבדיקה על כספת אמיתית של 370 הערות, 367 נשארו זהות בתצוגה אחרי טעינה ושמירה. ההבדלים שנשארו: שורה ריקה בין שני גושי `$$` צמודים, ורשימה בתוך פריט רשימה (`- - טקסט`).

כל שינוי בעורך או בתוספים שלו צריך להיבדק מחדש מול כספת אמיתית: לפתוח כל הערה, לקחת את ה־Markdown דרך כפתור Markdown, ולהשוות לקובץ.

### שמירה ושינויים מבחוץ

- שומרים רק כשהיה שינוי אמיתי (`state.dirty`). פתיחה ודפדוף לא כותבים לדיסק.
- `write` ב־`main.js` מקבל את זמן השינוי מרגע הקריאה. אם הזמן זז מאז, השמירה נכשלת ב־`CONFLICT`, והממשק משווה את **התוכן** שבדיסק ל־`state.diskText`:
  - התוכן זהה: רק Google Drive עדכן את הזמן בסנכרון. שומרים כרגיל, בלי שום הודעה.
  - התוכן שונה (נערך באובסידיאן וכו'): שומרים את מה שנכתב באפליקציה, והגרסה מבחוץ נשמרת כהערה נפרדת לידה, `שם (גרסה מבחוץ HH-MM).md`, עם הודעה קטנה בפינה.
- אין לשאול את המשתמש באמצע כתיבה. חלון שאלה על "איזו גרסה" בלבל אותו והופיע בגלל Drive בלי שינוי אמיתי.
- בחזרה לחלון, הערה פתוחה בלי שינויים נטענת מחדש רק אם התוכן שלה באמת השתנה.

### קישורים בין הערות

- התחביר כמו באובסידיאן: `[[שם]]`, `[[תיקייה/שם]]`, `[[שם#כותרת]]`, `[[שם|כינוי]]`. בקובץ נשמר בדיוק כך.
- פענוח שם להערה: התאמה לנתיב היחסי, ואם אין, ההערה בעלת הנתיב הקצר ביותר שמסתיים בשם (`resolveLink` ב־`links.js`).
- לחיצה על קישור להערה שלא קיימת יוצרת אותה. קישור כזה מוצג באפור עם קו מקווקו.
- שינוי שם של הערה מעדכן את כל הקישורים אליה בשאר ההערות (`updateLinksAfterRename` ב־`main.js`).
- קישורים חוזרים מוצגים מתחת לדף, ומחושבים מחדש בכל פתיחת הערה.
- Alt+חץ שמאלה/ימינה, או כפתורי העכבר, חוזרים אחורה וקדימה בין הערות.

`dist/` נוצר על ידי `esbuild` ואין לערוך אותו ידנית.

## כללים חשובים לשינויים

- הקבצים נשמרים כ־Markdown רגיל כדי שיהיו נקיים וניתנים לפתיחה באובסידיאן. עיצוב שאין לו תחביר Markdown (צבע, יישור) נשמר כ־HTML בתוך הקובץ.
- כיוון הטקסט הוא הגדרה (`textDir`): ברירת המחדל ימין לשמאל לכל המסמך, ואפשר לבחור "אוטומטי" (כל פסקה לפי השפה שלה, `unicode-bidi: plaintext`) או שמאל לימין. הכללים ב־`styles.css` תחת `data-textdir`.
- אין לתת לממשק גישה ישירה לדיסק. כל פעולה עוברת דרך `preload.js` ו־`main.js`, וה־`safe()` ב־`main.js` מוודא שהנתיב בתוך תיקיית העבודה.
- אחרי שינוי ב־`src/` צריך לבנות מחדש (`start.cmd` עושה זאת).
- אסור לשמור הערה שלא נערכה, ואסור לדרוס קובץ שהשתנה בדיסק בלי לשאול.

## רעיונות להמשך

- תצוגת גרף של הקישורים בין ההערות
- תצוגה מקדימה של הערה במעבר עכבר על קישור
- הטמעת תוכן של הערה אחרת עם `![[הערה]]` (היום מוצג רק כשבב)
- תצוגת נוסחאות `LaTeX` בעזרת `KaTeX` (היום נשמרות נכון אבל מוצגות כטקסט)
- תגיות `#תג` לחיצות, ורשימת תגיות
- עורך מאפיינים נוח במקום תיבת הטקסט
- העברת הערות בין תיקיות בגרירה
- ייצוא למסמך Word או PDF
- תבניות להערות סיכום מהלימודים (תאריך, קורס, נושא)
- כרטיסיות לימוד שנוצרות מכותרות בהערה
- שינוי גודל תמונה בגרירה (נשמר כ־`![[שם|300]]`)


## Versioning and change documentation (effective 2026-11-11)

- Baseline release is 1.1. Each small delivered update increments the tenths digit by one: 1.2, 1.3, etc.; after 1.9 use 2.0. The package version uses the corresponding semantic form (1.9.0 for release 1.9).
- Every change to app behavior, appearance, persistence or file format requires a CHANGELOG.md entry. Update AGENTS.md when adding/changing an editor extension, architecture, serialization rule, or workflow.
- State precisely what is delivered vs. partially supported or pending. Do not mark features as complete without testing on the Electron desktop build.
- Check syntax/build before committing changes when a local Node environment is available. Test Markdown round-trips on representative notes, including Hebrew/English, code, math, images and tables. Keep the existing originals and avoid unintended rewrites.
- The GitHub connector can edit the Git repository, not the user's running D:\\PROJECTS\\Tali or installed Tali.exe; a pull/restart/build is required locally.

### Image and drawing conventions
- Embeds `![[image.png|300]]` support width in pixels. Tali optionally adds a wrapping flag `![[image.png|300|wrap-left]]` / `wrap-right` while retaining the filename and first width field.
- The first width field is Obsidian-compatible. The third wrapping field is Tali-specific and may not produce the same wrapping in other Markdown editors.
- Ordinary and quick drawings are still PNG attachments (regular 900×520, quick 480×180 transparent); these live inline in the Markdown text. **New:** the separate page overlay supports editable vector strokes positioned anywhere on the page without creating a PNG attachment.
- Both Obsidian embeds `![[...]]` and ordinary Markdown `![alt](url)` images have size and wrapping controls; each offers reset. Styled ordinary images are serialized as HTML `<img ... data-tali-image="1" data-tali-wrap="left|right">` and plain, unstyled images remain Markdown. ObsidianMarkdown has a narrowly targeted exception to interpret these styled tags as image nodes.

### Editable text boxes
- `Insert > תיבת טקסט` inserts a Markdown callout with a `[!TALI-BOX]` marker and editable inner paragraph. The callout decoration styles this as a box.
- The in-flow text box is a blockquote, distinct from the new draggable **floating text box** saved by page-overlay.js. Keep both; preserve the marker in Markdown serialization and avoid changing ordinary blockquotes.


### Page overlay (v1.8+)
- `src/page-overlay.js`: SVG pen, arrow, line, rectangle and ellipse, plus text boxes moved by dragging their header and resized via a grip. Tool buttons are under Insert and in a temporary floating toolbar. Escape exits drawing mode; shapes can be selected, dragged, recolored and deleted.
- `src/overlay-data.js`: pure `splitOverlay` / `joinOverlay` plus whitelisting and bounding. Annotation geometry is stored in exactly one trailing HTML comment, `<!-- TALI-OVERLAY:v1:<URL-encoded JSON> -->`, within the same note. The body text and its LF/CRLF/trailing blank lines must be byte-for-byte preserved by these helpers. URL encoding is **not encryption**.
- `editor.js` must extract the marker before invoking the TipTap Markdown parser and append it on rich serialization. In raw Markdown view the comment is visible and editable. An invalid/unrecognized marker must remain untouched. Changing notes must reload the correct annotation list. Disable the overlay when there is no open note or when raw Markdown mode is active.
- Shape coordinates are pixel offsets relative to the note page, **not anchored to a particular word or ProseMirror position**. Text reflow, font changes and page-width changes can require manual repositioning; do not describe it as semantic anchoring.
- Annotations do not replace PNG drawings, in-flow callouts or Obsidian embeds.
- Use SVG paths, no emoji-only interface icons. Existing icon identifiers are in `src/icons.js`.
- Use `npm test` for pure metadata persistence checks. Always build with `npm run build` and test editing, raw/rich switching, image-style roundtrips and page-overlay interactions in Electron on a copy of a representative Markdown vault before deeming a release stable.

### Local integration candidate (2026-11-11)
- Icons use Lucide; preserve identifiers used by page-overlay.js as well as local toolbar icons.
- The links panel lives inside #pageWrap. Both refresh and click handlers toggle links-open on #pageWrap; do not reintroduce #main-based panel positioning.
- Release 2.0 is an integration candidate pending Electron UI and representative-vault round-trip checks.

### Startup splash (2.2)
- `src/splash.js` owns the standalone 3000 ms lifecycle; `src/splash-art.js` draws curved, textured paper meshes on Canvas with a deterministic timeline. `src/splash.css` styles the overlay. Scripts load before the renderer without awaiting the intro. Keep the original `src/logo.png` unmodified; palette tokens live in `styles.css`.
- Paper/ink textures are seeded and created once. Draw the book into an offscreen surface before compositing its dissolve, avoiding opacity buildup between layers. Cancel the animation frame on every exit path. Cap pixel density at 2 and keep responsive fitting inside the scene.
- Show once per window session (`sessionStorage`, including reloads); skip completely for reduced motion. Skip button/Escape, image failure, visibility changes and a 3100 ms watchdog remove the overlay and restore inert/focus state. Never gate application initialization on animation completion.
- `src/splash-preview.html` replays the same implementation without opening a vault. Its preview-only animation handles support visual sampling. Validate desktop, narrow portrait/landscape, skip, reduced motion, missing assets and Electron reload behavior when changing the intro.
