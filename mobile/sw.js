// TALI Mobile: עבודה בלי אינטרנט. קבצי האפליקציה נשמרים במטמון; המסמכים עצמם ב־IndexedDB (store.js).
// הגרסה מתעדכנת בכל בנייה (tools/build-mobile.js), וכך מטמון ישן מוחלף.
const VERSION = '__BUILD__';
const CACHE = 'tali-mobile-' + VERSION;
const FILES = __FILES__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('tali-mobile-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// קודם מהמטמון (מהיר ועובד בלי רשת); בקשות מחוץ לאפליקציה עוברות כרגיל
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
