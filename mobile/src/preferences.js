import { DEFAULT_THEMES, PRESETS, normalizeHex } from '../../src/theme-core.js';

export const MOBILE_PREFS_KEY = 'tali:mobile-prefs-v1';
export const LEADING = { compact: 1.48, comfortable: 1.65, airy: 1.82 };
export const DEFAULT_MOBILE_PREFS = Object.freeze({
  theme: 'system',
  accent: null,
  density: 'comfortable',
  fontSize: 17,
  leading: 'comfortable',
});

const themeIds = new Set(PRESETS.map((preset) => preset.id));

export function normalizeMobilePrefs(value) {
  const saved = value && typeof value === 'object' ? value : {};
  const theme = saved.theme === 'system' || themeIds.has(saved.theme) ? saved.theme : DEFAULT_MOBILE_PREFS.theme;
  const density = ['comfortable', 'compact'].includes(saved.density) ? saved.density : DEFAULT_MOBILE_PREFS.density;
  const leading = Object.hasOwn(LEADING, saved.leading) ? saved.leading : DEFAULT_MOBILE_PREFS.leading;
  const number = Number(saved.fontSize);
  const fontSize = Number.isFinite(number) ? Math.max(15, Math.min(22, Math.round(number))) : DEFAULT_MOBILE_PREFS.fontSize;
  return { theme, accent: normalizeHex(saved.accent), density, fontSize, leading };
}

export function colorsForMobilePrefs(value, systemDark = false) {
  const prefs = normalizeMobilePrefs(value);
  const preset = prefs.theme === 'system' ? null : PRESETS.find((item) => item.id === prefs.theme);
  const colors = preset?.colors || (systemDark ? DEFAULT_THEMES.night : DEFAULT_THEMES.day);
  return { ...colors, ...(prefs.accent ? { accent: prefs.accent } : {}) };
}

export function mobileThemeLabel(value) {
  const prefs = normalizeMobilePrefs(value);
  if (prefs.theme === 'system') return 'לפי הטלפון';
  return PRESETS.find((item) => item.id === prefs.theme)?.name || 'לפי הטלפון';
}

