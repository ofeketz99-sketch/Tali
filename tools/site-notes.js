// מעדכן את אתר ההורדות מתוך CHANGELOG.md: גרסה אחרונה ושלוש הגרסאות האחרונות ב"מה חדש".
// הרצה: npm run site:notes (אחרי עדכון CHANGELOG.md), ואז commit של website/index.html.
// בלי תלויות, ובלי JavaScript באתר עצמו.
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const COUNT = 3          // כמה גרסאות מוצגות
const PER_VERSION = 4    // כמה נקודות לכל גרסה
const MAX_REST = 150     // אורך מקסימלי לגוף של נקודה, אחרי הכותרת המודגשת (משפט ראשון בלבד)
const SKIP = /^\*\*(נבדק|רקע|ארגון|ערוץ פיתוח|פרסום מהדפדפן|אתר ההורדות|איכות קוד|פישוט|Release לאתר)/   // נקודות פנימיות של פיתוח, לא מוצגות באתר

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function inline(md) {
  return esc(md)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function shorten(rest) {
  // משפט ראשון בלבד; אם הוא ארוך, חותכים בגבול מילה. אין להשאיר ` פתוח באמצע.
  let out = rest
  const stop = rest.search(/[.;]\s/)
  if (stop > 0 && stop <= MAX_REST) out = rest.slice(0, stop + 1)
  if (out.length > MAX_REST) {
    out = out.slice(0, MAX_REST)
    out = out.slice(0, out.lastIndexOf(' ')).replace(/[,.:;\s]+$/, '') + '…'
  }
  if ((out.match(/`/g) || []).length % 2) out = out.replace(/`[^`]*$/, '').trimEnd() + '…'
  return out.replace(/;$/, '.')
}

function bullet(raw) {
  const m = raw.match(/^(\*\*[^*]+\*\*)(.*)$/s)
  return m ? inline(m[1]) + inline(shorten(m[2])) : inline(shorten(raw))
}

function parse(changelog) {
  const out = []
  for (const block of changelog.split(/^## /m).slice(1)) {
    const lines = block.split(/\r?\n/)
    const head = lines[0].match(/^(\d+(?:\.\d+)*)\s+—\s+(.*?)\s*\((\d{4})-(\d{2})-(\d{2})\)\s*$/)
    if (!head) continue
    const items = lines.slice(1)
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2).trim())
      .filter((l) => !SKIP.test(l))
      .slice(0, PER_VERSION)
    out.push({ version: head[1], name: head[2], date: `${head[5]}.${head[4]}.${head[3]}`, iso: `${head[3]}-${head[4]}-${head[5]}`, items })
  }
  return out
}

function render(versions) {
  return versions.slice(0, COUNT).map((v) => `      <article class="note">
        <header>
          <span class="ver">${esc(v.version)}</span>
          <h3>${inline(v.name)}</h3>
          <time datetime="${v.iso}">${v.date}</time>
        </header>
        <ul>
${v.items.map((i) => `          <li>${bullet(i)}</li>`).join('\n')}
        </ul>
      </article>`).join('\n')
}

function main() {
  const versions = parse(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'))
  if (!versions.length) throw new Error('לא נמצאו גרסאות ב־CHANGELOG.md')
  const file = path.join(ROOT, 'website', 'index.html')
  let html = fs.readFileSync(file, 'utf8')
  const notes = /<!-- NOTES:START -->[\s\S]*?<!-- NOTES:END -->/
  const ver = /<!-- VERSION:START -->[\s\S]*?<!-- VERSION:END -->/
  if (!notes.test(html) || !ver.test(html)) throw new Error('חסרים סימוני NOTES / VERSION ב־website/index.html')
  html = html
    .replace(notes, () => `<!-- NOTES:START -->\n${render(versions)}\n      <!-- NOTES:END -->`)
    .replace(ver, () => `<!-- VERSION:START -->${esc(versions[0].version)}<!-- VERSION:END -->`)
  fs.writeFileSync(file, html)
  console.log(`website/index.html עודכן: גרסה ${versions[0].version}, ${Math.min(COUNT, versions.length)} גרסאות ב"מה חדש"`)
}

if (require.main === module) main()
module.exports = { parse, render }
