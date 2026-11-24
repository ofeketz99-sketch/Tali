import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MOBILE_PREFS, normalizeMobilePrefs, colorsForMobilePrefs, mobileThemeLabel,
} from '../mobile/src/preferences.js';

test('mobile preferences normalize unknown and out-of-range values', () => {
  assert.deepEqual(normalizeMobilePrefs({ theme: 'unknown', density: 'tiny', fontSize: 100, leading: 'wide', accent: 'nope' }), {
    ...DEFAULT_MOBILE_PREFS,
    fontSize: 22,
  });
  assert.equal(normalizeMobilePrefs({ fontSize: 10 }).fontSize, 15);
});

test('mobile theme follows the phone or an explicit preset', () => {
  const light = colorsForMobilePrefs({ theme: 'system' }, false);
  const dark = colorsForMobilePrefs({ theme: 'system' }, true);
  assert.notEqual(light.page, dark.page);
  assert.equal(mobileThemeLabel({ theme: 'system' }), 'לפי הטלפון');

  const cream = colorsForMobilePrefs({ theme: 'cream', accent: '#123456' }, true);
  assert.equal(cream.page, '#fffbf1');
  assert.equal(cream.accent, '#123456');
  assert.equal(mobileThemeLabel({ theme: 'cream' }), 'שמנת');
});

