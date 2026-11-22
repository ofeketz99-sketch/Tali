// TALI Mobile: הדף ש־Google מחזיר אליו אחרי ההתחברות (ראו src/drive-auth.js).
// מעביר את התשובה לאפליקציה דרך localStorage, מוחק אותה מהכתובת ומההיסטוריה, ונסגר (או חוזר לאפליקציה).
(function () {
  var data = location.hash.slice(1) || location.search.slice(1);
  try { localStorage.setItem('tali:oauth-result', data); } catch (e) { /* אין אחסון */ }
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* */ }
  var redirect = false;
  try {
    redirect = sessionStorage.getItem('tali:oauth-redirect') === '1';
    sessionStorage.removeItem('tali:oauth-redirect');
    if (redirect) sessionStorage.setItem('tali:oauth-consume', '1');
  } catch (e) { /* */ }
  if (redirect) { location.replace('./'); return; }
  // חלון קופץ: האפליקציה שפתחה אותו קוראת את התשובה ב־localStorage
  window.close();
  // דפדפן שלא סוגר (Google ניתק את הקשר לחלון שפתח): חזרה לאפליקציה בחלון הזה
  setTimeout(function () { location.replace('./'); }, 600);
})();
