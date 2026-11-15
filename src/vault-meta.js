// נתונים של Tali על הכספת (.tali.json בראש הכספת, דרך meta-read/meta-write ב־main.js):
//   icons: סמל Lucide (וצבע) לכל תיקייה או מסמך, לפי נתיב יחסי עם "/" (מסמכים עם ".md")
//   order: סדר ידני בתוך תיקייה: { "<תיקייה יחסית, '' לראשית>": ["שם", "שם.md", ...] }
//   pins: (8.5) מסמכים שננעצו למסך הבית, לפי הסדר: ["תיקייה/שם.md", ...]
//   backgrounds: (9.0) רקע לכל תיקייה: { color: 1–8, opacity: 0–60 }. מסמכים יורשים מהתיקייה הקרובה.
// שינוי שם, העברה ומחיקה מעדכנים את המפתחות (remap / drop), כדי שהסמל והסדר יעברו עם הפריט.
export function createMeta({ api, getRoot }) {
  let data = { icons: {}, order: {}, pins: [], backgrounds: {} };
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
    data = {
      ...d,
      icons: d.icons || {},
      order: d.order || {},
      pins: Array.isArray(d.pins) ? d.pins.filter((x) => typeof x === 'string') : [],
      backgrounds: d.backgrounds && typeof d.backgrounds === 'object' ? d.backgrounds : {},
    };
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

  // ----- רקע תיקייה, עובר גם למסמכים ולתתי־תיקיות -----
  function backgroundOf(path) {
    let r = rel(path);
    if (!r) return null;
    if (/\.md$/i.test(r)) r = parentRel(r);
    while (r) {
      const value = data.backgrounds[r];
      if (value && Number(value.color) >= 1 && Number(value.color) <= 8) {
        return { color: Number(value.color), opacity: Math.max(0, Math.min(60, Number(value.opacity) || 0)) };
      }
      r = parentRel(r);
    }
    return null;
  }
  function ownBackground(abs) {
    const value = data.backgrounds[rel(abs)];
    return value ? { color: Number(value.color), opacity: Math.max(0, Math.min(60, Number(value.opacity) || 0)) } : null;
  }
  function setBackground(abs, value) {
    const r = rel(abs);
    if (!r) return;
    if (value && Number(value.color) >= 1 && Number(value.color) <= 8) {
      data.backgrounds[r] = { color: Number(value.color), opacity: Math.max(0, Math.min(60, Number(value.opacity) || 0)) };
    } else delete data.backgrounds[r];
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

  // ----- 8.5: נעיצה למסך הבית -----
  const abs = (r) => {
    const sep = getRoot().includes('\\') ? '\\' : '/';
    return getRoot() + sep + r.split('/').join(sep);
  };
  const isPinned = (p) => data.pins.includes(rel(p));
  const pins = () => data.pins.map(abs);
  function setPinned(p, on) {
    const r = rel(p);
    if (!r) return;
    data.pins = data.pins.filter((x) => x !== r);
    if (on) data.pins.push(r);
    save();
  }
  function movePin(p, dir) {
    const r = rel(p), i = data.pins.indexOf(r), j = i + dir;
    if (i < 0 || j < 0 || j >= data.pins.length) return;
    [data.pins[i], data.pins[j]] = [data.pins[j], data.pins[i]];
    save();
  }

  // ----- שינוי שם / העברה / מחיקה -----
  function remap(fromAbs, toAbs) {
    const from = rel(fromAbs), to = rel(toAbs);
    if (!from || from === to) return;
    const icons = {};
    for (const [k, v] of Object.entries(data.icons)) icons[under(k, from) ? to + k.slice(from.length) : k] = v;
    data.icons = icons;
    const backgrounds = {};
    for (const [k, v] of Object.entries(data.backgrounds)) backgrounds[under(k, from) ? to + k.slice(from.length) : k] = v;
    data.backgrounds = backgrounds;
    const order = {};
    for (const [k, v] of Object.entries(data.order)) order[k && under(k, from) ? to + k.slice(from.length) : k] = v;
    // השם ברשימה של התיקייה: אותה תיקייה (שינוי שם) מחליף במקום; תיקייה אחרת (העברה) יוצא מהישנה
    const pf = parentRel(from), pt = parentRel(to), bf = baseName(from), bt = baseName(to);
    if (order[pf]) order[pf] = pf === pt ? order[pf].map((n) => (n === bf ? bt : n)) : order[pf].filter((n) => n !== bf);
    data.order = order;
    data.pins = data.pins.map((k) => (under(k, from) ? to + k.slice(from.length) : k));
    save();
  }
  function drop(abs) {
    const r = rel(abs);
    if (!r) return;
    for (const k of Object.keys(data.icons)) if (under(k, r)) delete data.icons[k];
    for (const k of Object.keys(data.backgrounds)) if (under(k, r)) delete data.backgrounds[k];
    for (const k of Object.keys(data.order)) if (k && under(k, r)) delete data.order[k];
    const p = parentRel(r);
    if (data.order[p]) data.order[p] = data.order[p].filter((n) => n !== baseName(r));
    data.pins = data.pins.filter((k) => !under(k, r));
    save();
  }

  return { load, iconOf, setIcon, backgroundOf, ownBackground, setBackground, sortTree, placeIn, remap, drop, rel, isPinned, pins, setPinned, movePin };
}
