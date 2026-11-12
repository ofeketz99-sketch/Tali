# Download TALI

אתר הורדה מינימליסטי סטטי, במסך אחד, בשפת העיצוב הבהירה של TALI. הוא כולל רק סמל, שם האפליקציה וכפתור הורדה בולט. אין ניווט, פירוט יכולות, אזורי שיווק או גלילה.

## עבודה ופיתוח

- כל הקבצים של האתר נמצאים ב-`website/`, והלוגו המקורי ב-`website/assets/logo.png`.
- אין צורך ב-JavaScript, בהתקנת תלויות או בבניית Electron כדי לצפות באתר.
- פתחו `website/index.html` בדפדפן, או הריצו `python -m http.server 8080 --directory website` משורש המאגר.
- מפתחים ב-`DEV`, וממזגים ל-`main` רק לאחר סקירה ואישור. Netlify מוגדר לפרסם את תיקיית `website`.

## הפצה

כרגע כפתור ההורדה מעוצב אך **מושבת בכוונה**, עם הודעה תמציתית: "ההורדה עדיין לא זמינה". אין להציג קישור שבור או להפנות לחבילת התקנה פרטית.

קיים Release של TALI ב-GitHub, אבל המאגר פרטי, ולכן קישור לנכס שלו אינו מתאים להורדה ציבורית בידי חברים ללא הרשאות. כשיהיה קובץ התקנה בכתובת ציבורית אמיתית, החליפו את `button.download-button` ב-`website/index.html` בקישור `a.download-button` עם `href` מאומת, והסירו את הודעת אי-הזמינות. אין צורך במנגנון הורדה מורכב.

## Netlify

הקובץ `netlify.toml` מבטל בנייה עבור `DEV`, פריסות ענפים ותצוגות מקדימות באמצעות `ignore = "exit 0"`. ברמת ממשק Netlify יש לוודא:

1. Production branch = `main`.
2. ב-Project configuration → Developer settings → Continuous deployment → Branches and deploy contexts: `Branch deploys = None` ו-`Deploy previews = Disabled`.

זה מונע פריסות פיתוח מיותרות; הגדרת `ignore` בלבד יכולה עדיין לגרור בדיקה קצרה של Netlify, ואין להניח אפס חיוב בלי בדיקת חשבון. 
