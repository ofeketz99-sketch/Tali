// בדיקת שמירה נאמנה: כל הערה נטענת לעורך האמיתי ונכתבת חזרה ל־Markdown (כמו פתיחה ושמירה),
// והתוצאה מושווית לקובץ. קורא בלבד מהכספת; הדוח נכתב לתיקיית הפלט.
import { createEditor } from '../../src/editor.js';

const fs = window.require('fs');
const path = window.require('path');
const { ipcRenderer } = window.require('electron');
const params = new URLSearchParams(location.search);
const vault = params.get('vault');
const out = params.get('out');
const log = (m) => ipcRenderer.send('log', m);

function walk(dir, list = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, list);
    else if (/\.md$/i.test(e.name)) list.push(p);
  }
  return list;
}

const el = (tag) => { const x = document.createElement(tag); document.body.append(x); return x; };
const api = createEditor({
  element: el('div'), rawElement: el('textarea'), propsElement: el('textarea'),
  onChange() {}, onImageFiles() {},
  links: { getNotes: () => [], resolve: () => null, onOpen() {}, onLinked() {}, onEditDrawing() {}, localSrc: () => '', read: async () => '' },
});

// השוואת תוכן: בלי רווחים, סימני רשימה, בריחות וקידוד URL. הבדל כאן הוא אובדן או שינוי של תוכן.
function content(s) {
  const t = s.replace(/\r\n/g, '\n').replace(/\]\(([^)\s]+)\)/g, (m, u) => { try { return '](' + decodeURI(u) + ')'; } catch { return m; } });
  return t.replace(/\\(?=\S)/g, '').replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '').replace(/^\s*>\s?/gm, '>').replace(/\s+/g, '');
}
// השוואה רכה: סוף שורה (CRLF/LF) ורווחים בסוף שורה לא נחשבים הבדל שנראה בתצוגה
const soft = (s) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n').replace(/\n+$/, '');
function firstDiff(a, b) {
  const A = a.replace(/\r\n/g, '\n').split('\n'), B = b.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if (A[i] !== B[i]) return { line: i + 1, before: A.slice(Math.max(0, i - 1), i + 2), after: B.slice(Math.max(0, i - 1), i + 2) };
  }
  return null;
}

(async () => {
  const files = walk(vault);
  const report = { vault, total: files.length, exact: 0, soft: 0, formatOnly: 0, different: [] };
  for (const f of files) {
    const md = fs.readFileSync(f, 'utf8');
    let back;
    try { api.setMarkdown(md); back = api.getMarkdown(); }
    catch (err) { report.different.push({ file: path.relative(vault, f), error: String(err) }); continue; }
    if (back === md) report.exact++;
    else if (soft(back) === soft(md)) report.soft++;
    else {
      const contentChanged = content(back) !== content(md);
      const entry = { file: path.relative(vault, f), contentChanged, ...firstDiff(md, back) };
      // השורות שהתוכן שלהן לא נמצא בצד השני (אחרי אותו נרמול)
      if (contentChanged) {
        const set = (s) => new Set(s.replace(/\r\n/g, '\n').split('\n').map(content).filter(Boolean));
        const A = set(md), B = set(back);
        entry.onlyBefore = md.replace(/\r\n/g, '\n').split('\n').filter((l) => content(l) && !B.has(content(l)));
        entry.onlyAfter = back.split('\n').filter((l) => content(l) && !A.has(content(l)));
      }
      report.different.push(entry);
    }
  }
  fs.mkdirSync(out, { recursive: true });

  report.formatOnly = report.different.filter((d) => !d.contentChanged && !d.error).length;
  const changed = report.different.filter((d) => d.contentChanged || d.error);
  fs.writeFileSync(path.join(out, 'roundtrip-report.json'), JSON.stringify(report, null, 2));
  log(`content changed in ${changed.length}: ${changed.map((d) => d.file).join(' | ')}`);
  log(`${report.total} notes: ${report.exact} identical, ${report.soft} differ only in line endings/trailing spaces, ${report.formatOnly} differ only in Markdown formatting, ${changed.length} with content changes`);
  log(`report: ${path.join(out, 'roundtrip-report.json')}`);
  ipcRenderer.send('done', 0);
})().catch((err) => { log(String(err.stack || err)); ipcRenderer.send('done', 1); });
