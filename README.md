# Tali

אפליקציית הערות אישית לשולחן העבודה (Electron), שעובדת מול תיקייה רגילה של קבצי Markdown.
המטרה: אובסידיאן עם עורך עשיר כמו וורד, שהקבצים שלו נשארים נקיים ונפתחים גם באובסידיאן.

- עורך עשיר (TipTap) עם שמירה נאמנה לתחביר אובסידיאן: קישורי `[[הערה]]`, קישורים חוזרים, מאפיינים, callouts.
- טבלאות, תמונות עם גודל וציפה, ציור, שרטוט, תיבות טקסט והערות מקושרות מעל הדף.
- חיפוש מהיר, לוח פקודות וקיצורים ניתנים לעריכה שעובדים גם במקלדת עברית.
- שליטה נפרדת ב־RTL/LTR של רשימות תבליטים, מספור ומשימות.
- ימין לשמאל כברירת מחדל, ומצב כהה.

## התקנה

את הגרסה האחרונה מורידים מ־[Releases](https://github.com/ofeketz99-sketch/Tali/releases): `Tali-Setup-<גרסה>.exe` (מתקין) או `Tali-<גרסה>-portable.exe` (בלי התקנה). הקבצים לא חתומים, ולכן Windows יזהיר בהפעלה הראשונה ("מידע נוסף" ← "הפעל בכל זאת"). במחשב שבו Smart App Control פעיל הם נחסמים לגמרי; שם משתמשים ב־TALI-DEV (למטה).

## TALI-DEV: ערוץ פיתוח שמתעדכן בפתיחה

זהו מסלול נפרד מהגרסה המותקנת, ושמו **TALI-DEV**. מתקינים אותו פעם אחת בכל מחשב, ואחר כך `TALI-DEV.exe` מעדכן את הקוד מענף `desktop-dev` בכל פתיחה וסגירה, בלי להוריד EXE חדש אף פעם:

```powershell
git clone --branch desktop-dev https://github.com/ofeketz99-sketch/Tali.git
cd Tali
npm install
npm run make-exe
```

מפעילים את קיצור הדרך **TALI-DEV** שנוצר בשולחן העבודה (הוא מפעיל את `TALI-DEV.exe` בתיקייה `TALI-DEV` ליד המאגר). המשגר מבצע `fetch` ועדכון fast-forward בלבד, מסנכרן תלויות כשה־lockfile השתנה ובונה את הממשק. הוא לעולם לא דורס עבודה מקומית: כשיש קבצים שלא נשמרו ב־Git, ענף אחר או היסטוריה שהתפצלה, העדכון מדולג והעותק המקומי נפתח. שגיאות רשת גם אינן חוסמות את הגרסה שכבר קיימת. יומן העדכון נמצא ב־`%LOCALAPPDATA%\Tali\launcher-update.log`.

**Smart App Control של Windows:** מ־7.5 `TALI-DEV.exe` הוא עותק לא־משונה של Electron (רק השם שונה), ולכן Windows מאפשר להפעיל אותו גם כש־Smart App Control פעיל. `Tali.exe` הישן (עד 7.4) נחסם, כי הסמל נצרב לתוכו. ההסבר המלא: `AGENTS.md`, "Smart App Control".

אפשר לכבות עדכון זמנית עם `TALI_AUTO_UPDATE=0`, לבחור ענף אחר עם `TALI_UPDATE_BRANCH`, או להצביע למאגר אחר עם `TALI_PROJECT`.

## הרצה מהקוד

```
npm install
npm start
```

| פקודה | מה עושה |
| --- | --- |
| `npm run build` | בונה את `dist/renderer.js` |
| `npm start` | בנייה והפעלה |
| `npm run dist` | בונה מתקין וקובץ נייד ל־Windows ב־`release/` (electron-builder). פרסום גרסה: `AGENTS.md` |
| `npm run release:manifest` | יוצר `release/latest.json` עבור אתר הורדות, אחרי בניית שני קבצי ה־EXE |
| `npm run make-exe` | בונה את TALI-DEV: `TALI-DEV.exe` שמתעדכן מענף `desktop-dev` (Windows בלבד) בתיקייה `TALI-DEV` ליד המאגר, וקיצור דרך בשולחן העבודה |
| `npm run watch` | בנייה מתמשכת בזמן פיתוח (רענון חלון עם Ctrl+R) |
| `npm test` | בדיקות יחידה |
| `npm run check` | בדיקת תחביר, בנייה ובדיקות. להריץ לפני כל commit |
| `npm run splash:emblem` | בנייה מחדש של הסמל בפתיח מ־`build/icon.png` |

## מסמכים

- [`AGENTS.md`](AGENTS.md): איך הפרויקט בנוי, הכללים לשינויים, ואיך עובדים עליו עם AI.
- [`CHANGELOG.md`](CHANGELOG.md): מה השתנה בכל גרסה.
- [`ROADMAP.md`](ROADMAP.md): רעיונות להמשך, פערים ידועים ומה עוד לא נבדק.
- [`CODE_AUDIT.md`](CODE_AUDIT.md): סקירת מבנה, ליקויים ותכנית פישוט מדורגת.
