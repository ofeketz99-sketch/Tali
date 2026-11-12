// Generates a small, stable contract for a download site to consume after GitHub Actions builds Windows assets.
// The site can fetch latest.json instead of hard-coding versioned EXE names.
const fs = require('fs');
const path = require('path');

const REPOSITORY = 'ofeketz99-sketch/Tali';

function buildManifest(pkg, fileNames, repository = REPOSITORY) {
  const names = fileNames.filter((name) => /\.(exe|blockmap)$/i.test(name) || /^latest.*\.ya?ml$/i.test(name)).sort();
  const pick = (pattern) => names.find((name) => pattern.test(name)) || null;
  const installer = pick(/^Tali-Setup-.*\.exe$/i);
  const portable = pick(/^Tali-(?!Setup).*portable\.exe$/i);
  if (!installer || !portable) throw new Error('Both the installer and portable EXE must exist before generating latest.json');
  // Tali releases use v6.2 while package.json uses semver 6.2.0.
  const tag = 'v' + pkg.version.replace(/\.0$/, '');
  const releases = `https://github.com/${repository}/releases`;
  const base = `${releases}/download/${tag}`;
  return {
    schema: 1,
    product: pkg.productName || pkg.name,
    version: pkg.version,
    tag,
    releasePage: `${releases}/tag/${tag}`,
    latestManifestUrl: `${releases}/latest/download/latest.json`,
    installer,
    portable,
    assets: names.map((name) => ({ name, url: `${base}/${encodeURIComponent(name)}` })),
  };
}

function writeReleaseManifest(outputArg = 'release') {
  const output = path.resolve(outputArg);
  const pkg = require(path.join(process.cwd(), 'package.json'));
  const manifest = buildManifest(pkg, fs.readdirSync(output));
  fs.writeFileSync(path.join(output, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`release/latest.json: ${manifest.version}, ${manifest.assets.length} assets`);
  return manifest;
}

if (require.main === module) writeReleaseManifest(process.argv[2]);

module.exports = { buildManifest, writeReleaseManifest };

