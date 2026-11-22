// TALI Mobile: התחברות ל־Google Drive בלי שרת ובלי ספרייה חיצונית.
// OAuth 2.0 בזרימת token (response_type=token): Google מחזיר access token ישירות לדף oauth.html שלנו,
// בלי client secret (אסור לשים secret באפליקציה בדפדפן). הטוקן תקף כשעה; אחר כך לחיצה על "סנכרון"
// פותחת שוב את חלון Google, שבדרך כלל נסגר מיד בלי לשאול (ההרשאה כבר ניתנה).
//
// הדרך: חלון קופץ ל־Google, שחוזר ל־oauth.html. Google שובר את window.opener (COOP), ולכן התשובה
// עוברת ב־localStorage (משותף לכל החלונות של אותו מקור) והאפליקציה מחכה לה. אם החלון הקופץ נחסם:
// מעבר של הדף כולו ל־Google וחזרה (sessionStorage מסמן שזו חזרה כזו, ו־start ב־app.js אוסף את הטוקן).
import { DRIVE_SCOPE } from './drive.js';

export const RESULT_KEY = 'tali:oauth-result';
const STATE_KEY = 'tali:oauth-state';
export const REDIRECT_FLAG = 'tali:oauth-redirect';
export const CONSUME_FLAG = 'tali:oauth-consume';

export class AuthNeeded extends Error {
  constructor(message = 'צריך להתחבר שוב ל־Google Drive') { super(message); this.code = 'AUTH'; }
}

export function authUrl({ clientId, redirectUri, state, consent = false }) {
  const p = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'token', scope: DRIVE_SCOPE,
    include_granted_scopes: 'true', state,
  });
  if (consent) p.set('prompt', 'consent select_account');
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

// התשובה של Google בכתובת (#access_token=...&expires_in=3599&state=...), או שגיאה (#error=access_denied)
export function parseAuthHash(raw, now = Date.now()) {
  const p = new URLSearchParams(String(raw || '').replace(/^[#?]/, ''));
  const state = p.get('state');
  if (p.get('error')) return { error: p.get('error'), state };
  const accessToken = p.get('access_token');
  if (!accessToken) return null;
  const seconds = Number(p.get('expires_in')) || 3600;
  // דקה של מרווח, כדי לא לשלוח בקשה עם טוקן שפג באמצע
  return { accessToken, expiresAt: now + Math.max(60, seconds - 60) * 1000, state, scope: p.get('scope') || '' };
}

const randomState = () => {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

export function createDriveAuth({ meta, redirectUri = new URL('oauth.html', location.href).href.split('#')[0] }) {
  let token = null;       // { accessToken, expiresAt }
  let clientId = null;

  const valid = () => !!token && token.expiresAt > Date.now();

  async function accept(raw) {
    const parsed = parseAuthHash(raw);
    const expected = localStorage.getItem(STATE_KEY);
    localStorage.removeItem(STATE_KEY);
    if (!parsed || !expected || parsed.state !== expected) throw new Error('תשובה לא צפויה מ־Google. נסו שוב');
    if (parsed.error) throw new Error(parsed.error === 'access_denied' ? 'ההרשאה לא ניתנה' : `Google: ${parsed.error}`);
    if (!parsed.scope.split(' ').includes(DRIVE_SCOPE)) throw new Error('בלי הרשאה ל־Drive אי אפשר לסנכרן');
    token = { accessToken: parsed.accessToken, expiresAt: parsed.expiresAt };
    await meta.set('driveToken', token);
    return token;
  }

  return {
    redirectUri,
    get clientId() { return clientId; },
    async load() {
      clientId = (await meta.get('driveClientId')) || null;
      token = (await meta.get('driveToken')) || null;
    },
    async setClientId(id) { clientId = id; await meta.set('driveClientId', id); },
    hasValidToken: valid,

    // לממשק של drive.js. refresh: הבקשה הקודמת נדחתה (401), אז הטוקן הזה כבר לא טוב.
    getToken: async ({ refresh = false } = {}) => {
      if (refresh) { token = null; await meta.set('driveToken', null); }
      if (valid()) return token.accessToken;
      throw new AuthNeeded();
    },

    // חייב להיקרא מתוך לחיצה (אחרת הדפדפן חוסם את החלון הקופץ): window.open הוא הדבר הראשון כאן.
    signIn({ consent = false } = {}) {
      if (!clientId) return Promise.reject(new Error('חסר Client ID של Google'));
      const state = randomState();
      localStorage.setItem(STATE_KEY, state);
      localStorage.removeItem(RESULT_KEY);
      const url = authUrl({ clientId, redirectUri, state, consent });
      const popup = window.open(url, 'tali-oauth', 'popup,width=500,height=680');
      if (!popup) {
        sessionStorage.setItem(REDIRECT_FLAG, '1');
        location.assign(url);
        return new Promise(() => {}); // הדף עוזב; ההמשך ב־consumeRedirect אחרי החזרה
      }
      return new Promise((resolve, reject) => {
        const started = Date.now();
        const timer = setInterval(async () => {
          const raw = localStorage.getItem(RESULT_KEY);
          if (raw) {
            clearInterval(timer);
            localStorage.removeItem(RESULT_KEY);
            try { resolve(await accept(raw)); } catch (e) { reject(e); }
          } else if (Date.now() - started > 3 * 60 * 1000) {
            clearInterval(timer);
            reject(new Error('ההתחברות לא הסתיימה'));
          }
        }, 300);
      });
    },

    // אחרי חזרה מ־Google בדף כולו (כשהחלון הקופץ נחסם). מחזיר true אם נאסף טוקן.
    async consumeRedirect() {
      if (sessionStorage.getItem(CONSUME_FLAG) !== '1') return false;
      sessionStorage.removeItem(CONSUME_FLAG);
      const raw = localStorage.getItem(RESULT_KEY);
      if (!raw) return false;
      localStorage.removeItem(RESULT_KEY);
      await accept(raw);
      return true;
    },

    async signOut() {
      const old = token?.accessToken;
      token = null;
      await meta.set('driveToken', null);
      // ביטול ההרשאה אצל Google (לא חובה; אם נכשל, הטוקן פג לבד תוך שעה)
      if (old) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(old)}`, { method: 'POST' }).catch(() => {});
    },

    // לבדיקות בדפדפן בלבד (window.taliMobile): טוקן בלי Google
    async setTestToken(t) { token = { accessToken: t, expiresAt: Date.now() + 3600e3 }; await meta.set('driveToken', token); },
  };
}
