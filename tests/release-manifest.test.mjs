import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildManifest } = require('../tools/release-manifest.js');

test('release manifest exposes stable latest URL and versioned EXE assets', () => {
  const manifest = buildManifest(
    { name: 'tali', productName: 'Tali', version: '6.2.0' },
    ['builder-debug.yml', 'Tali-6.2.0-portable.exe', 'Tali-Setup-6.2.0.exe', 'latest.yml', 'win-unpacked'],
  );
  assert.equal(manifest.latestManifestUrl, 'https://github.com/ofeketz99-sketch/Tali/releases/latest/download/latest.json');
  assert.equal(manifest.installer, 'Tali-Setup-6.2.0.exe');
  assert.equal(manifest.portable, 'Tali-6.2.0-portable.exe');
  assert.deepEqual(manifest.assets.map((asset) => asset.name), [
    'Tali-6.2.0-portable.exe', 'Tali-Setup-6.2.0.exe', 'latest.yml',
  ]);
});

test('release manifest refuses an incomplete Windows build', () => {
  assert.throws(() => buildManifest({ name: 'tali', version: '6.2.0' }, ['Tali-Setup-6.2.0.exe']),
    /installer and portable EXE/);
});
