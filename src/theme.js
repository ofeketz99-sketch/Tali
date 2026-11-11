// ערכות צבעים בממשק: החלת הצבעים על <html>, מעבר רך בין ערכות, ותזמון המעבר האוטומטי.
// הלוגיקה הטהורה (גזירת צבעים, בחירת ערכה, שעת המעבר הבאה) ב־theme-core.js.
// רק משתני CSS משתנים: העורך לא נבנה מחדש, הסמן והמסמך לא זזים, והשמירה לא מושפעת.
import { deriveVars, activeProfile, nextSwitch } from './theme-core.js';

const CACHE_KEY = 'tali:theme-cache'; // נקרא ב־theme-boot.js לפני הציור הראשון
const MAX_WAIT = 15 * 60 * 1000;     // גם בלי תזמון קרוב, בדיקה כל רבע שעה (שינוי שעון ידני, אזור זמן)
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let prefs = null;
let preview = null;     // טיוטה מחלון ההגדרות: { day, night } או null
let shown = null;       // 'day' | 'night' שמוצגת עכשיו
let shownKey = '';      // הצבעים שמוצגים, כדי לא להחיל שוב את אותו הדבר
let timer = null;
const listeners = [];

export const profileNow = (p = prefs) => activeProfile({
  mode: p?.themeMode, schedule: p?.schedule, systemDark: darkQuery.matches, now: new Date(),
});
export const shownProfile = () => shown;
export function onThemeChange(fn) { listeners.push(fn); }

function paint(colors, { animate, cache }) {
  const key = JSON.stringify(colors);
  if (key === shownKey) return;
  shownKey = key;
  const { vars, dark } = deriveVars(colors);
  const root = document.documentElement;
  if (animate && !reducedMotion.matches) {
    root.classList.add('theme-anim');
    clearTimeout(paint.t);
    paint.t = setTimeout(() => root.classList.remove('theme-anim'), 260);
  }
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
  if (cache) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ vars, dark })); } catch { /* לא קריטי */ } }
}

function apply({ animate = false } = {}) {
  if (!prefs) return;
  const profile = profileNow();
  const changed = shown !== null && profile !== shown;
  shown = profile;
  const colors = (preview && preview[profile]) || prefs.themes[profile];
  paint(colors, { animate: animate || changed, cache: !preview });
  schedule();
  if (changed) for (const fn of listeners) fn(profile);
}

function schedule() {
  clearTimeout(timer);
  if (!prefs || prefs.themeMode !== 'schedule') return;
  const now = new Date();
  const next = nextSwitch({ mode: prefs.themeMode, schedule: prefs.schedule, now });
  const wait = next ? Math.min(next - now + 400, MAX_WAIT) : MAX_WAIT;
  timer = setTimeout(() => apply({ animate: true }), Math.max(1000, wait));
}

// נקרא מ־settings.js בכל שינוי בהגדרות. animate: מעבר רך (למשל כשהמשתמש בוחר יום/לילה)
export function updateTheme(nextPrefs, { animate = false } = {}) {
  prefs = nextPrefs;
  apply({ animate });
}

// תצוגה מקדימה על הממשק עצמו בזמן עריכה בהגדרות. null מחזיר את הצבעים השמורים.
export function setThemePreview(draft) {
  preview = draft;
  apply();
}

// בדיקה מחדש: שינוי ב־Windows, חזרה לחלון, התעוררות משינה
darkQuery.addEventListener('change', () => apply({ animate: true }));
document.addEventListener('visibilitychange', () => { if (!document.hidden) apply({ animate: true }); });
window.addEventListener('focus', () => apply({ animate: true }));
window.api?.onSystemWake?.(() => apply({ animate: true }));
