// בנייה של TALI Mobile (PWA) לתיקייה mobile/www (מחוץ ל־Git): npm run mobile:build
// הקוד המשותף (העורך, שכבת השרטוט, השמירה הנאמנה) נלקח מ־src/ כמו שהוא, בלי עותק.
// --out <תיקייה>: יעד אחר. Netlify בונה כך ל־website/app (ראו netlify.toml), כלומר <האתר>/app.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const src = path.join(root, 'mobile');
const outArg = process.argv.indexOf('--out');
const out = outArg > 0 && process.argv[outArg + 1] ? path.resolve(root, process.argv[outArg + 1]) : path.join(src, 'www');
// הגנה: לא למחוק בטעות תיקייה מחוץ למאגר או את website עצמה
if (!out.startsWith(root + path.sep) || out === path.join(root, 'website') || out === root) throw new Error(`יעד לא תקין: ${out}`);
const watch = process.argv.includes('--watch');

async function main() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const options = {
    entryPoints: { app: path.join(src, 'src/app.js'), 'app-css': path.join(src, 'src/mobile.css') },
    bundle: true, minify: !watch, sourcemap: true, outdir: out, target: ['chrome100', 'safari15'],
    loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.png': 'file' },
    assetNames: 'assets/[name]-[hash]', logLevel: 'warning',
  };
  if (watch) { const ctx = await esbuild.context(options); await ctx.watch(); }
  else await esbuild.build(options);
  fs.renameSync(path.join(out, 'app-css.css'), path.join(out, 'app.css'));
  if (fs.existsSync(path.join(out, 'app-css.css.map'))) fs.renameSync(path.join(out, 'app-css.css.map'), path.join(out, 'app.css.map'));
  for (const f of ['index.html', 'oauth.html', 'oauth.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png']) fs.copyFileSync(path.join(src, f), path.join(out, f));
  // רשימת הקבצים למטמון של ה־service worker, וגרסה חדשה בכל בנייה
  const files = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (!/\.map$/.test(e.name)) files.push('./' + path.relative(out, p).split(path.sep).join('/'));
  } };
  walk(out);
  files.push('./');
  const version = require(path.join(root, 'package.json')).version + '-' + Date.now().toString(36);
  const sw = fs.readFileSync(path.join(src, 'sw.js'), 'utf8').replace('__BUILD__', version).replace('__FILES__', JSON.stringify(files));
  fs.writeFileSync(path.join(out, 'sw.js'), sw);
  console.log(`TALI Mobile: ${files.length} קבצים ב־${path.relative(root, out).split(path.sep).join('/')} (${version})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
