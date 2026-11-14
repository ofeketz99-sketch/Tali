// נטען ב־<head> לפני ה־CSS: מחיל את הצבעים של הערכה האחרונה כבר בציור הראשון,
// כדי שלא יהבהב הממשק הבהיר לפני שההגדרות נטענות. theme.js כותב את המטמון ומעדכן אחר כך.
// Windows: שורת כותרת משלנו (ראו #titlebar). נקבע כאן, לפני הציור הראשון, כדי שהממשק לא יקפוץ.
try { if (window.api && window.api.customTitleBar) document.documentElement.dataset.titlebar = "1"; } catch (e) { /* בלי גשר */ }
(function () {
  try {
    var c = JSON.parse(localStorage.getItem('tali:theme-cache'));
    if (!c || !c.vars) return;
    var root = document.documentElement;
    for (var k in c.vars) root.style.setProperty(k, c.vars[k]);
    root.dataset.theme = c.dark ? 'dark' : 'light';
    root.style.colorScheme = c.dark ? 'dark' : 'light';
  } catch (e) { /* בלי מטמון: ברירות המחדל של styles.css */ }
})();
