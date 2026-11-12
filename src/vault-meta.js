// נתונים של Tali על הכספת (.tali.json בראש הכספת, דרך meta-read/meta-write ב־main.js):
//   icons: סמל Lucide (וצבע) לכל תיקייה או מסמך, לפי נתיב יחסי עם "/" (מסמכים עם ".md")
//   order: סדר ידני בתוך תיקייה: { "<תיקייה יחסית, '' לראשית>": ["שם", "שם.md", ...] }
// שינוי שם, העברה ומחיקה מעדכנים את המפתחות (remap / drop), כדי שהסמל והסדר יעברו עם הפריט.
export function createMeta({ api, getRoot }) {
  let data = { icons: {}, order: {} };
  let timer = null;

  const rel = (abs) => {
    const root = getRoot();
    if (!root || !abs) return '';
    return abs === root ? '' : abs.slice(root.length + 1).replace(/\\/g, '/');
  };
  const parentRel = (r) => (r.includes('/') ? r.slice(0, r.lastIndexOf('/')) : '');
  const baseName = (r) => r.slice(r.lastIndexOf('/') + 1);
  const under = (k, r) => k === r || k.startsWith(r + '/');

  async function load() {
    const d = await api.metaRead().catch(() => ({}));
    data = { icons: d.icons || {}, order: d.order || {}, ...d };
  }
  function save() {
    clearTimeout(timer);
    timer = setTimeout(() => api.metaWrite(data).catch(() => {}), 250);
  }

  // ----- סמלים -----
  const iconOf = (abs) => data.icons[rel(abs)] || null;
  function setIcon(abs, value) {
    const r = rel(abs);
    if (value?.name) data.icons[r] = value.color ? { name: value.name, color: value.color } : { name: value.name };
    else delete data.icons[r];
    save();
  }

  // ----- סדר ידני -----
  // מסדר עותק של העץ: בכל תיקייה עם סדר שמור, הפריטים שברשימה קודם (לפי הרשימה), והשאר אחריהם כרגיל.
  function sortTree(nodes, dirRel = '') {
    const names = data.order[dirRel];
    let out = nodes;
    if (names?.length) {
      const pos = new Map(names.map((n, i) => [n, i]));
      out = nodes.map((n, i) => ({ n, i })).sort((a, b) => {
        const pa = pos.has(a.n.name) ? pos.get(a.n.name) : Infinity, pb = pos.has(b.n.name) ? pos.get(b.n.name) : Infinity;
        return pa !== pb ? pa - pb : a.i - b.i;
      }).map((x) => x.n);
      out.custom = true;
    }
    return Object.assign(out.map((n) => (n.type === 'dir' ? { ...n, children: sortTree(n.children, dirRel ? `${dirRel}/${n.name}` : n.name) } : n)), { custom: !!out.custom });
  }
  // מזיז פריט לפני/אחרי פריט אחר באותה תיקייה. siblings: השמות בסדר שמוצג עכשיו
  function placeIn(dirAbs, siblings, name, targetName, where) {
    const list = siblings.filter((n) => n !== name);
    const at = list.indexOf(targetName);
    list.splice(at < 0 ? list.length : where === 'after' ? at + 1 : at, 0, name);
    data.order[rel(dirAbs)] = list;
    save();
  }

  // ----- שינוי שם / העברה / מחיקה -----
  function remap(fromAbs, toAbs) {
    const from = rel(fromAbs), to = rel(toAbs);
    if (!from || from === to) return;
    const icons = {};
    for (const [k, v] of Object.entries(data.icons)) icons[under(k, from) ? to + k.slice(from.length) : k] = v;
    data.icons = icons;
    const order = {};
    for (const [k, v] of Object.entries(data.order)) order[k && under(k, from) ? to + k.slice(from.length) : k] = v;
    // השם ברשימה של התיקייה: אותה תיקייה (שינוי שם) מחליף במקום; תיקייה אחרת (העברה) יוצא מהישנה
    const pf = parentRel(from), pt = parentRel(to), bf = baseName(from), bt = baseName(to);
    if (order[pf]) order[pf] = pf === pt ? order[pf].map((n) => (n === bf ? bt : n)) : order[pf].filter((n) => n !== bf);
    data.order = order;
    save();
  }
  function drop(abs) {
    const r = rel(abs);
    if (!r) return;
    for (const k of Object.keys(data.icons)) if (under(k, r)) delete data.icons[k];
    for (const k of Object.keys(data.order)) if (k && under(k, r)) delete data.order[k];
    const p = parentRel(r);
    if (data.order[p]) data.order[p] = data.order[p].filter((n) => n !== baseName(r));
    save();
  }

  return { load, iconOf, setIcon, sortTree, placeIn, remap, drop, rel };
}
