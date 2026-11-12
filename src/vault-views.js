// תצוגות על כל הכספת, מתוך האינדקס של main.js (vault-index):
// גרף קישורים, הערות רפאים, תגיות ומשימות. כל אחת היא חלון (dialog) שנבנה בפתיחה ונמחק בסגירה.
import { icon } from './icons.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function makeDialog(title, className, iconName) {
  const dlg = document.createElement('dialog');
  dlg.className = 'vault-dialog ' + className;
  dlg.setAttribute('dir', 'rtl');
  const head = document.createElement('div');
  head.className = 'vd-head';
  head.innerHTML = `<span class="vd-icon">${icon(iconName, 18)}</span><h2></h2><span class="vd-tools"></span>`;
  head.querySelector('h2').textContent = title;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-btn';
  close.setAttribute('aria-label', 'סגירה');
  close.innerHTML = icon('close', 18);
  close.addEventListener('click', () => dlg.close());
  head.append(close);
  const body = document.createElement('div');
  body.className = 'vd-body';
  dlg.append(head, body);
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  return { dlg, body, tools: head.querySelector('.vd-tools') };
}

function toggle(label, checked, onChange) {
  const l = document.createElement('label');
  l.className = 'vd-toggle';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.addEventListener('change', () => onChange(box.checked));
  const s = document.createElement('span');
  s.textContent = label;
  l.append(box, s);
  return l;
}

const plural = (n, one, many) => (n === 1 ? one : `${n} ${many}`);

// ===================== גרף קישורים =====================
// ברירות המחדל מרווחות יותר מהערכים הקבועים שהיו עד 3.9 (דחייה 900, אורך 80, משיכה 0.012)
const GRAPH_FORCES = { repel: 2200, distance: 120, spring: 0.03, gravity: 0.006, size: 1 };
const FORCE_SLIDERS = [
  { key: 'repel', label: 'דחייה בין נקודות', min: 200, max: 8000, step: 100 },
  { key: 'distance', label: 'אורך קישור', min: 30, max: 320, step: 5 },
  { key: 'spring', label: 'כוח קישור', min: 0.004, max: 0.12, step: 0.002 },
  { key: 'gravity', label: 'משיכה למרכז', min: 0, max: 0.05, step: 0.001 },
  { key: 'size', label: 'גודל נקודות', min: 0.5, max: 2.5, step: 0.1 },
];

// החלק המלא של הסליידר (מימין, כי החלון מימין לשמאל)
const fillRange = (input) => input.style.setProperty('--p', `${((input.value - input.min) / (input.max - input.min)) * 100}%`);

export function openGraph({ index, current, onOpen, store }) {
  const { dlg, body, tools } = makeDialog('גרף הקישורים', 'graph-dialog', 'graph');
  let local = store.get('tali:graph-local', false) && !!current;
  let ghosts = store.get('tali:graph-ghosts', false);
  const canvas = document.createElement('canvas');
  canvas.className = 'graph-canvas';
  const hint = document.createElement('div');
  hint.className = 'graph-hint';
  hint.textContent = 'גלגלת: זום · גרירה: הזזה · לחיצה על נקודה: פתיחה';
  body.append(canvas, hint);
  if (current) tools.append(toggle('רק סביב המסמך הפתוח', local, (v) => { local = v; store.set('tali:graph-local', v); build(); }));
  tools.append(toggle('מסמכי רפאים', ghosts, (v) => { ghosts = v; store.set('tali:graph-ghosts', v); build(); }));

  // כוחות הסימולציה: סליידרים בלוח צף מעל הגרף. נשמרים ב־tali:graph-forces
  const saved = store.get('tali:graph-forces', {}) || {};
  const forces = { ...GRAPH_FORCES };
  for (const s of FORCE_SLIDERS) {
    const v = Number(saved[s.key]);
    if (Number.isFinite(v)) forces[s.key] = Math.min(s.max, Math.max(s.min, v));
  }
  const panel = document.createElement('div');
  panel.className = 'graph-forces';
  const panelBtn = document.createElement('button');
  panelBtn.type = 'button';
  panelBtn.className = 'icon-btn graph-forces-btn';
  panelBtn.dataset.tip = 'כוחות ותצוגה';
  panelBtn.innerHTML = icon('settings', 17);
  const panelBody = document.createElement('div');
  panelBody.className = 'graph-forces-body';
  panelBody.hidden = !store.get('tali:graph-forces-open', false);
  panelBtn.setAttribute('aria-expanded', String(!panelBody.hidden));
  panelBtn.addEventListener('click', () => {
    panelBody.hidden = !panelBody.hidden;
    panelBtn.setAttribute('aria-expanded', String(!panelBody.hidden));
    store.set('tali:graph-forces-open', !panelBody.hidden);
  });
  const sliders = new Map();
  for (const s of FORCE_SLIDERS) {
    const row = document.createElement('label');
    row.className = 'gf-row';
    const name = document.createElement('span');
    name.textContent = s.label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = s.min; input.max = s.max; input.step = s.step;
    input.value = forces[s.key];
    fillRange(input);
    input.addEventListener('input', () => {
      fillRange(input);
      forces[s.key] = Number(input.value);
      store.set('tali:graph-forces', forces);
      if (s.key === 'size') draw(); else reheat();
    });
    sliders.set(s.key, input);
    row.append(name, input);
    panelBody.append(row);
  }
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'gf-reset';
  reset.textContent = 'ברירת מחדל';
  reset.addEventListener('click', () => {
    Object.assign(forces, GRAPH_FORCES);
    for (const [k, input] of sliders) { input.value = forces[k]; fillRange(input); }
    store.set('tali:graph-forces', forces);
    reheat();
  });
  // צבע לפי תיקייה: בלי / אוטומטי / רמה 1–3. "אוטומטי" בוחר את הרמה הראשונה שבה הכספת מתחלקת באמת
  // (לפחות 3 קבוצות, והגדולה פחות מ־60%), כי אצל המשתמש כמעט הכול בתוך "ישן".
  let colorMode = store.get('tali:graph-color', 'auto');
  if (!['none', 'auto', 1, 2, 3].includes(colorMode)) colorMode = 'auto';
  const colorRow = document.createElement('div');
  colorRow.className = 'gf-row';
  colorRow.innerHTML = '<span>צבע לפי תיקייה</span><div class="vd-seg gf-seg"></div>';
  const seg = colorRow.querySelector('.gf-seg');
  for (const [val, label] of [['none', 'בלי'], ['auto', 'אוטומטי'], [1, 'רמה 1'], [2, '2'], [3, '3']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.classList.toggle('on', val === colorMode);
    b.addEventListener('click', () => {
      colorMode = val;
      store.set('tali:graph-color', val);
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      isolate = null;
      applyGroups();
      draw();
    });
    seg.append(b);
  }
  panelBody.append(colorRow, reset);
  panel.append(panelBtn, panelBody);

  const legend = document.createElement('div');
  legend.className = 'graph-legend';
  legend.innerHTML = '<span><i class="gl-dot"></i>מסמך</span><span><i class="gl-tri"></i>פתק קישור</span><span><i class="gl-ghost"></i>מסמך רפאים</span>';
  // מקרא הקבוצות (תיקיות): לחיצה מבודדת קבוצה, לחיצה נוספת מחזירה הכול
  const groupLegend = document.createElement('div');
  groupLegend.className = 'graph-groups';
  body.append(panel, legend, groupLegend);

  // חיפוש בגרף: טקסט מדגיש לפי שם, #תגית מסננת לפי תגית. Enter מתמקד בתוצאות.
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'graph-search';
  search.placeholder = 'חיפוש בגרף… (#תגית)';
  tools.prepend(search);
  let query = '';
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); draw(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); focusOn([...matching()]); } });

  const colors = {
    node: css('--accent'), current: css('--accent-strong'), ghost: css('--muted'),
    edge: css('--border'), edgeHi: css('--accent'), text: css('--text'), bg: css('--page-bg'),
    groups: Array.from({ length: 8 }, (_, i) => css(`--graph-${i + 1}`)), other: css('--faint'),
  };
  let isolate = null; // מפתח הקבוצה המבודדת

  const groupKey = (n, level) => {
    const dirs = n.rel.split('/').slice(0, -1);
    return dirs.slice(0, level).join('/');
  };
  function chooseLevel() {
    for (let level = 1; level <= 3; level++) {
      const count = new Map();
      for (const n of nodes) if (!n.ghost) count.set(groupKey(n, level), (count.get(groupKey(n, level)) || 0) + 1);
      const real = nodes.filter((n) => !n.ghost).length || 1;
      if (count.size >= 3 && Math.max(...count.values()) / real < 0.6) return level;
    }
    return 3;
  }
  // לכל נקודה: group (מפתח) ו־color. שמונה הקבוצות הגדולות מקבלות צבע, השאר אפור.
  function applyGroups() {
    groupLegend.innerHTML = '';
    for (const n of nodes) { n.group = null; n.color = null; }
    if (colorMode === 'none') return;
    const level = colorMode === 'auto' ? chooseLevel() : colorMode;
    const count = new Map();
    for (const n of nodes) if (!n.ghost) { n.group = groupKey(n, level); count.set(n.group, (count.get(n.group) || 0) + 1); }
    const top = [...count.entries()].sort((a, b) => b[1] - a[1]);
    const colorOf = new Map(top.slice(0, 8).map(([k], i) => [k, colors.groups[i]]));
    for (const n of nodes) if (n.group !== null) n.color = colorOf.get(n.group) || colors.other;
    for (const [k, c] of top.slice(0, 8)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gg-item' + (isolate === k ? ' on' : '');
      b.innerHTML = '<i></i><span></span><small></small>';
      b.querySelector('i').style.background = colorOf.get(k);
      b.querySelector('span').textContent = k ? k.split('/').pop() : 'התיקייה הראשית';
      b.querySelector('small').textContent = c;
      b.dataset.tip = (k || 'התיקייה הראשית').split('/').join(' › ');
      b.addEventListener('click', () => { isolate = isolate === k ? null : k; applyGroups(); draw(); });
      groupLegend.append(b);
    }
    if (top.length > 8) {
      const more = document.createElement('div');
      more.className = 'gg-more';
      more.textContent = `ועוד ${top.length - 8} באפור`;
      groupLegend.append(more);
    }
  }
  // הנקודות שעוברות את החיפוש ואת הבידוד; null = אין סינון
  function matching() {
    if (!query && isolate === null) return null;
    const tag = query.startsWith('#') ? query.slice(1) : null;
    return new Set(nodes.filter((n) => {
      if (isolate !== null && n.group !== isolate) return false;
      if (!query) return true;
      if (tag !== null) return !n.ghost && (n.tags || []).some((t) => t.toLowerCase().startsWith(tag));
      return n.label.toLowerCase().includes(query);
    }));
  }
  function focusOn(list) {
    if (!list.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of list) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); }
    const w = canvas.clientWidth - 160, h = canvas.clientHeight - 160;
    view.k = Math.max(0.25, Math.min(2.4, w / Math.max(1, maxX - minX), h / Math.max(1, maxY - minY)));
    view.x = -(minX + maxX) / 2 * view.k;
    view.y = -(minY + maxY) / 2 * view.k;
    userMoved = true;
    draw();
  }
  let nodes = [], edges = [], byId = new Map();
  const view = { x: 0, y: 0, k: 1 };
  let alpha = 1, frame = 0, hover = null, drag = null;

  function build() {
    const all = new Map();
    for (const n of index.notes) all.set(n.path, { id: n.path, label: n.name, rel: n.rel || n.name, tags: n.tags, ghost: false, hub: !!n.hub, links: n.links, missing: n.missing });
    const edgeList = [];
    for (const n of index.notes) {
      for (const to of n.links) if (all.has(to)) edgeList.push([n.path, to]);
      if (ghosts) for (const g of n.missing) {
        const id = 'ghost:' + g.toLowerCase();
        if (!all.has(id)) all.set(id, { id, label: g.split('/').pop(), ghost: true, target: g });
        edgeList.push([n.path, id]);
      }
    }
    let keep = null;
    if (local && current && all.has(current)) {
      keep = new Set([current]);
      for (let depth = 0; depth < 2; depth++) {
        for (const [a, b] of edgeList) { if (keep.has(a)) keep.add(b); else if (keep.has(b)) keep.add(a); }
      }
    }
    const prev = byId;
    nodes = [...all.values()].filter((n) => !keep || keep.has(n.id)).map((n, i) => {
      const old = prev.get(n.id);
      const a = i * 2.39996, r = 30 * Math.sqrt(i + 1);
      return { ...n, x: old?.x ?? Math.cos(a) * r, y: old?.y ?? Math.sin(a) * r, vx: 0, vy: 0, deg: 0 };
    });
    byId = new Map(nodes.map((n) => [n.id, n]));
    edges = edgeList.filter(([a, b]) => byId.has(a) && byId.has(b) && a !== b).map(([a, b]) => [byId.get(a), byId.get(b)]);
    for (const [a, b] of edges) { a.deg++; b.deg++; }
    applyGroups();
    alpha = 1;
    kick();
  }

  function step() {
    const { repel: k, distance: rest, spring, gravity } = forces;
    const far = Math.max(250000, (rest * 6) ** 2);
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
        if (d2 > far) continue;
        const f = k / d2;
        const d = Math.sqrt(d2);
        a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f;
      }
    }
    for (const [a, b] of edges) {
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const f = (d - rest) * spring;
      a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f;
    }
    for (const n of nodes) {
      n.vx -= n.x * gravity; n.vy -= n.y * gravity;
      if (n === drag?.node) { n.vx = n.vy = 0; continue; }
      n.x += Math.max(-30, Math.min(30, n.vx * alpha)); n.y += Math.max(-30, Math.min(30, n.vy * alpha));
      n.vx *= 0.55; n.vy *= 0.55;
    }
    alpha = Math.max(0, alpha * 0.985 - 0.0005);
  }

  const radius = (n) => (n.ghost ? 4 : 4.5 + Math.sqrt(n.deg) * 1.9) * forces.size;
  // משולש שווה צלעות שקודקודו למעלה, באותו שטח בערך כמו עיגול ברדיוס r
  function triangle(g, x, y, r) {
    const R = r * 1.35;
    g.beginPath();
    g.moveTo(x, y - R);
    g.lineTo(x + R * 0.866, y + R * 0.5);
    g.lineTo(x - R * 0.866, y + R * 0.5);
    g.closePath();
  }
  function draw() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.translate(w / 2 + view.x, h / 2 + view.y);
    g.scale(view.k, view.k);
    const near = hover ? new Set([hover, ...edges.filter(([a, b]) => a === hover || b === hover).flat()]) : null;
    const match = matching();
    g.lineWidth = 1 / view.k;
    for (const [a, b] of edges) {
      const hi = near && (a === hover || b === hover);
      const out = match && !(match.has(a) && match.has(b));
      g.strokeStyle = hi ? colors.edgeHi : colors.edge;
      g.globalAlpha = hi ? 0.9 : out ? 0.06 : near ? 0.25 : 0.7;
      if (b.ghost) g.setLineDash([4 / view.k, 3 / view.k]); else g.setLineDash([]);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    g.setLineDash([]);
    const showAll = nodes.length < 70 || view.k > 1.15;
    g.font = `${12 / view.k}px Rubik, sans-serif`;
    g.textAlign = 'center';
    for (const n of nodes) {
      const r = radius(n);
      const dim = match && !match.has(n) && n !== hover;
      g.globalAlpha = dim ? 0.1 : near && !near.has(n) ? 0.25 : 1;
      if (n.hub) triangle(g, n.x, n.y, r);
      else { g.beginPath(); g.arc(n.x, n.y, r, 0, Math.PI * 2); }
      if (n.ghost) { g.fillStyle = colors.bg; g.fill(); g.strokeStyle = colors.ghost; g.setLineDash([2.5 / view.k, 2 / view.k]); g.lineWidth = 1.4 / view.k; g.stroke(); g.setLineDash([]); }
      else { g.fillStyle = n.id === current ? colors.current : n.color || colors.node; g.fill(); }
      if (n.id === current) { g.strokeStyle = colors.current; g.lineWidth = 2 / view.k; if (n.hub) triangle(g, n.x, n.y, r + 4 / view.k); else { g.beginPath(); g.arc(n.x, n.y, r + 3.5 / view.k, 0, Math.PI * 2); } g.stroke(); }
      if ((showAll && !dim) || n === hover || n.id === current || (near && near.has(n)) || (match && query && match.has(n) && match.size < 60)) {
        g.fillStyle = n.ghost ? colors.ghost : colors.text;
        g.fillText(n.label, n.x, n.y + r + 13 / view.k);
      }
    }
    g.globalAlpha = 1;
  }

  // מתאים את הזום כך שכל הגרף נראה, עד שהמשתמש מזיז או מזמזם בעצמו
  let userMoved = false;
  function fit() {
    if (userMoved || !nodes.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); }
    const w = canvas.clientWidth - 120, h = canvas.clientHeight - 120;
    const k = Math.max(0.25, Math.min(2.4, w / Math.max(1, maxX - minX), h / Math.max(1, maxY - minY)));
    view.k += (k - view.k) * 0.15;
    view.x += (-(minX + maxX) / 2 * view.k - view.x) * 0.15;
    view.y += (-(minY + maxY) / 2 * view.k - view.y) * 0.15;
  }
  function loop() {
    if (!dlg.isConnected) return;
    if (alpha > 0.002 || drag) step();
    fit();
    draw();
    frame = alpha > 0.002 || drag ? requestAnimationFrame(loop) : 0;
  }
  function kick() { if (!frame) frame = requestAnimationFrame(loop); }
  // שינוי כוח: מחממים את הסימולציה מחדש, ואם המשתמש לא הזיז, הזום ימשיך להתאים את עצמו
  function reheat() { alpha = Math.max(alpha, 0.6); kick(); }

  const toWorld = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - r.width / 2 - view.x) / view.k, y: (e.clientY - r.top - r.height / 2 - view.y) / view.k };
  };
  const pick = (e) => {
    const p = toWorld(e);
    let best = null, bd = Infinity;
    for (const n of nodes) { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < radius(n) + 6 / view.k && d < bd) { best = n; bd = d; } }
    return best;
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const node = pick(e);
    drag = { node, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
    userMoved = true;
    if (node) alpha = Math.max(alpha, 0.3);
    kick();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
      if (drag.node) { const p = toWorld(e); drag.node.x = p.x; drag.node.y = p.y; }
      else { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; }
      kick();
      return;
    }
    const h = pick(e);
    if (h !== hover) { hover = h; canvas.style.cursor = h ? 'pointer' : 'grab'; draw(); }
  });
  canvas.addEventListener('pointerup', () => {
    const d = drag; drag = null;
    if (d?.node && !d.moved) { dlg.close(); onOpen(d.node.ghost ? { create: d.node.target } : { path: d.node.id }); }
    kick();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    userMoved = true;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
    const k = Math.max(0.2, Math.min(4, view.k * Math.exp(-e.deltaY * 0.0015)));
    view.x = mx - (mx - view.x) * (k / view.k); view.y = my - (my - view.y) * (k / view.k); view.k = k;
    draw();
  }, { passive: false });
  new ResizeObserver(() => draw()).observe(canvas);
  dlg.addEventListener('close', () => { cancelAnimationFrame(frame); frame = 0; });
  build();
}

// ===================== הערות רפאים =====================
// קישורים להערות שלא קיימות עדיין: מכמה הערות מקשרים אליהן, ומאילו.
export function openGhosts({ index, onOpenNote, onCreate }) {
  const { body } = makeDialog('מסמכי רפאים', 'ghosts-dialog', 'ghost');
  const map = new Map();
  for (const n of index.notes) for (const g of n.missing) {
    const key = g.toLowerCase();
    if (!map.has(key)) map.set(key, { name: g, sources: [] });
    map.get(key).sources.push(n);
  }
  const list = [...map.values()].sort((a, b) => b.sources.length - a.sources.length || a.name.localeCompare(b.name, 'he'));
  const intro = document.createElement('p');
  intro.className = 'vd-intro';
  intro.textContent = list.length
    ? `${plural(list.length, 'מסמך אחד', 'מסמכים')} שמקשרים אליהם אבל עדיין לא נוצרו. לחיצה על "יצירה" יוצרת אותם.`
    : 'אין מסמכי רפאים: כל הקישורים מובילים למסמכים קיימים.';
  body.append(intro);
  list.forEach((g, i) => {
    const row = document.createElement('details');
    row.className = 'vd-row ghost-row';
    row.style.setProperty('--i', Math.min(i, 14));
    const sum = document.createElement('summary');
    sum.innerHTML = `<span class="vd-name"></span><span class="vd-count"></span><button type="button" class="vd-action">${icon('filePlus', 14)}<span>יצירה</span></button>`;
    sum.querySelector('.vd-name').textContent = g.name;
    sum.querySelector('.vd-count').textContent = `מקושרת מ־${plural(g.sources.length, 'מסמך אחד', 'מסמכים')}`;
    sum.querySelector('.vd-action').addEventListener('click', (e) => { e.preventDefault(); body.closest('dialog').close(); onCreate(g.name); });
    row.append(sum);
    const ul = document.createElement('ul');
    for (const s of g.sources) {
      const li = document.createElement('li');
      li.className = 'vd-link';
      li.innerHTML = `${icon('file', 14)}<span></span>`;
      li.querySelector('span').textContent = s.rel.split('/').join(' › ');
      li.addEventListener('click', () => { body.closest('dialog').close(); onOpenNote(s.path); });
      ul.append(li);
    }
    row.append(ul);
    body.append(row);
  });
}

// ===================== תגיות =====================
export function openTags({ index, onOpenNote, initial }) {
  const { body } = makeDialog('תגיות', 'tags-dialog', 'tag');
  const map = new Map();
  for (const n of index.notes) for (const t of n.tags) {
    const key = t.toLowerCase();
    if (!map.has(key)) map.set(key, { tag: t, notes: [] });
    map.get(key).notes.push(n);
  }
  const tags = [...map.values()].sort((a, b) => b.notes.length - a.notes.length || a.tag.localeCompare(b.tag, 'he'));
  const wrap = document.createElement('div');
  wrap.className = 'tags-layout';
  const side = document.createElement('div');
  side.className = 'tags-list';
  const filter = document.createElement('input');
  filter.className = 'vd-filter';
  filter.placeholder = 'סינון תגיות…';
  const listBox = document.createElement('div');
  side.append(filter, listBox);
  const main = document.createElement('div');
  main.className = 'tags-notes';
  wrap.append(side, main);
  body.append(wrap);
  let selected = initial ? map.get(initial.toLowerCase()) || null : tags[0] || null;

  function drawList() {
    listBox.innerHTML = '';
    const q = filter.value.trim().toLowerCase().replace(/^#/, '');
    if (!tags.length) { listBox.textContent = 'אין עדיין תגיות. כותבים #תג בתוך מסמך.'; return; }
    for (const t of tags.filter((x) => !q || x.tag.toLowerCase().includes(q))) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tag-chip' + (t === selected ? ' on' : '');
      b.innerHTML = '<span class="tc-name"></span><span class="tc-count"></span>';
      b.querySelector('.tc-name').textContent = '#' + t.tag;
      b.querySelector('.tc-count').textContent = t.notes.length;
      b.addEventListener('click', () => { selected = t; drawList(); drawNotes(); });
      listBox.append(b);
    }
  }
  function drawNotes() {
    main.innerHTML = '';
    if (!selected) return;
    const h = document.createElement('h3');
    h.textContent = `#${selected.tag} · ${plural(selected.notes.length, 'מסמך אחד', 'מסמכים')}`;
    main.append(h);
    selected.notes.forEach((n, i) => {
      const row = document.createElement('div');
      row.className = 'vd-link';
      row.style.setProperty('--i', Math.min(i, 14));
      row.innerHTML = `${icon('file', 15)}<span></span>`;
      row.querySelector('span').textContent = n.rel.split('/').join(' › ');
      row.addEventListener('click', () => { body.closest('dialog').close(); onOpenNote(n.path); });
      main.append(row);
    });
  }
  filter.addEventListener('input', drawList);
  drawList(); drawNotes();
  if (!initial) filter.focus();
}

// ===================== משימות =====================
// כל תיבות הסימון בכספת, לפי מסמך: כמה פתוחות בכל מסמך וכמה בסך הכול. סימון כאן נשמר בקובץ.
// שני ריכוזים נפרדים: משימות להמשך (תיבות בסעיף "משימות להמשך" של כל מסמך) ותיבות סימון (כל השאר)
export function openTasks({ index, onOpenTask, onToggle, store, kind: initialKind }) {
  const { body, tools } = makeDialog('משימות להמשך', 'tasks-dialog', 'taskSection');
  let kind = initialKind || store.get('tali:tasks-kind', 'followUp');
  if (!['followUp', 'checks'].includes(kind)) kind = 'followUp';
  const titleEl = body.closest('dialog').querySelector('h2, .vd-title');
  const kinds = document.createElement('div');
  kinds.className = 'vd-seg';
  for (const [id, name] of [['followUp', 'משימות להמשך'], ['checks', 'תיבות סימון']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.dataset.kind = id;
    b.addEventListener('click', () => { kind = id; store.set('tali:tasks-kind', id); draw(); });
    kinds.append(b);
  }
  tools.prepend(kinds);
  let showDone = store.get('tali:tasks-show-done', false);
  tools.append(toggle('כולל מה שסומן', showDone, (v) => { showDone = v; store.set('tali:tasks-show-done', v); draw(); }));
  let data = index;
  const tasksOf = (n) => n.tasks.filter((t) => (kind === 'followUp' ? t.followUp : !t.followUp));

  function draw() {
    body.innerHTML = '';
    for (const b of kinds.children) b.classList.toggle('on', b.dataset.kind === kind);
    if (titleEl) titleEl.textContent = kind === 'followUp' ? 'משימות להמשך' : 'תיבות סימון';
    const withTasks = data.notes.map((n) => ({ ...n, tasks: tasksOf(n) })).filter((n) => n.tasks.length);
    const total = withTasks.reduce((s, n) => s + n.tasks.length, 0);
    const open = withTasks.reduce((s, n) => s + n.tasks.filter((t) => !t.done).length, 0);
    const summary = document.createElement('div');
    summary.className = 'tasks-summary';
    summary.innerHTML = '<div class="ts-numbers"><b></b><span></span></div><div class="ts-bar"><i></i></div>';
    summary.querySelector('b').textContent = kind === 'followUp' ? `${open} פתוחות` : `${total - open} מסומנות`;
    summary.querySelector('span').textContent = `מתוך ${total} ${kind === 'followUp' ? 'משימות' : 'תיבות'} ב־${plural(withTasks.length, 'מסמך אחד', 'מסמכים')}`;
    summary.querySelector('i').style.width = total ? `${Math.round((total - open) / total * 100)}%` : '0';
    body.append(summary);
    if (!total) {
      const p = document.createElement('p');
      p.className = 'vd-intro';
      p.textContent = kind === 'followUp'
        ? 'אין עדיין משימות להמשך. הן נכתבות בסעיף "משימות להמשך" של מסמך: מלוח ההקשר (משימות להמשך), או "הוספה ← משימות להמשך".'
        : 'אין תיבות סימון מחוץ לסעיפי "משימות להמשך". "- [ ] טקסט" בכל מסמך תופיע כאן.';
      body.append(p);
      return;
    }
    const sorted = withTasks.sort((a, b) => b.tasks.filter((t) => !t.done).length - a.tasks.filter((t) => !t.done).length || a.name.localeCompare(b.name, 'he'));
    sorted.forEach((n, i) => {
      const openHere = n.tasks.filter((t) => !t.done).length;
      if (!showDone && !openHere) return;
      const sec = document.createElement('section');
      sec.className = 'task-note';
      sec.style.setProperty('--i', Math.min(i, 14));
      const head = document.createElement('div');
      head.className = 'tn-head';
      head.innerHTML = `${icon('file', 15)}<span class="tn-name"></span><span class="tn-count"></span><span class="tn-bar"><i></i></span>`;
      head.querySelector('.tn-name').textContent = n.rel.split('/').join(' › ');
      head.querySelector('.tn-count').textContent = kind === 'followUp' ? `${openHere} פתוחות מתוך ${n.tasks.length}` : `${n.tasks.length - openHere} מסומנות מתוך ${n.tasks.length}`;
      head.querySelector('i').style.width = `${Math.round((n.tasks.length - openHere) / n.tasks.length * 100)}%`;
      head.addEventListener('click', () => { body.closest('dialog').close(); onOpenTask(n.path, null); });
      sec.append(head);
      for (const t of n.tasks) {
        if (!showDone && t.done) continue;
        const row = document.createElement('div');
        row.className = 'task-row' + (t.done ? ' done' : '');
        row.style.paddingInlineStart = 8 + Math.min(t.depth, 8) * 7 + 'px';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = t.done;
        box.setAttribute('aria-label', 'סימון המשימה');
        box.addEventListener('change', async () => {
          box.disabled = true;
          try { data = await onToggle(n.path, t, box.checked); draw(); }
          catch { box.checked = !box.checked; box.disabled = false; }
        });
        const text = document.createElement('span');
        text.className = 'task-text';
        text.textContent = t.text || '(ריקה)';
        text.addEventListener('click', () => { body.closest('dialog').close(); onOpenTask(n.path, t); });
        row.append(box, text);
        sec.append(row);
      }
      body.append(sec);
    });
  }
  draw();
}

// ===================== מסמכים אחרונים =====================
// לפי סדר כרונולוגי, מהחדש לישן, בקבוצות: היום, אתמול, השבוע, החודש, ואחר כך לפי חודש.
// שלושה סדרים: נפתחו (opened: [{ path, at }] מהממשק), נערכו (mtime מהאינדקס), נוצרו (created מהאינדקס).
// מקלדת: חצים בין השורות, Enter פותח, הקלדה מסננת לפי שם.
const KINDS = [['opened', 'נפתחו'], ['edited', 'נערכו'], ['created', 'נוצרו']];
function dayGroup(ms, now = new Date()) {
  if (!ms) return 'קודם לכן';
  const d = new Date(ms);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ms >= start) return 'היום';
  if (ms >= start - 864e5) return 'אתמול';
  if (ms >= start - 6 * 864e5) return 'השבוע';
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'החודש';
  return d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
}
function when(ms, group) {
  if (!ms) return '';
  const d = new Date(ms);
  if (group === 'היום' || group === 'אתמול') return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

export function openRecent({ index, opened, onOpen, store, current }) {
  const { dlg, body, tools } = makeDialog('מסמכים אחרונים', 'recent-dialog', 'history');
  let kind = store.get('tali:recent-kind', 'edited');
  if (!KINDS.some(([k]) => k === kind)) kind = 'edited';
  const seg = document.createElement('div');
  seg.className = 'vd-seg';
  for (const [id, label] of KINDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.classList.toggle('on', id === kind);
    b.addEventListener('click', () => { kind = id; store.set('tali:recent-kind', id); seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); sel = 0; draw(); filter.focus(); });
    seg.append(b);
  }
  tools.append(seg);
  const filter = document.createElement('input');
  filter.type = 'search';
  filter.className = 'vd-filter';
  filter.placeholder = 'סינון לפי שם… (↑↓ בחירה · Enter פתיחה)';
  const list = document.createElement('div');
  list.className = 'recent-list';
  body.append(filter, list);

  const byPath = new Map(index.notes.map((n) => [n.path, n]));
  const folder = (n) => (n.rel.includes('/') ? n.rel.slice(0, n.rel.lastIndexOf('/')).split('/').join(' › ') : '');
  let rows = [], sel = 0;
  function items() {
    let out;
    if (kind === 'opened') out = opened.filter((o) => byPath.has(o.path)).map((o) => ({ n: byPath.get(o.path), t: o.at || 0 }));
    else out = index.notes.map((n) => ({ n, t: kind === 'edited' ? n.mtime : n.created })).sort((a, b) => (b.t || 0) - (a.t || 0));
    const q = filter.value.trim().toLowerCase();
    if (q) out = out.filter(({ n }) => n.name.toLowerCase().includes(q) || n.rel.toLowerCase().includes(q));
    return out.slice(0, 300);
  }
  function draw() {
    list.innerHTML = '';
    rows = [];
    const all = items();
    if (!all.length) {
      const e = document.createElement('p');
      e.className = 'vd-intro';
      e.textContent = kind === 'opened' ? 'עוד לא נפתחו מסמכים בכספת הזו.' : 'אין מסמכים.';
      list.append(e);
      return;
    }
    let group = null;
    all.forEach(({ n, t }, i) => {
      const g = dayGroup(t);
      if (g !== group) {
        group = g;
        const h = document.createElement('h4');
        h.className = 'recent-group';
        h.textContent = g;
        list.append(h);
      }
      const row = document.createElement('div');
      row.className = 'vd-link recent-row' + (n.path === current ? ' current' : '');
      row.style.setProperty('--i', Math.min(i, 14));
      row.innerHTML = `<span class="ic">${icon('file', 15)}</span><span class="rr-name"></span><small class="rr-folder"></small><small class="rr-when"></small>`;
      row.querySelector('.rr-name').textContent = n.name;
      row.querySelector('.rr-folder').textContent = folder(n);
      row.querySelector('.rr-when').textContent = when(t, g);
      row.addEventListener('click', (e) => { dlg.close(); onOpen(n.path, { newTab: e.ctrlKey || e.metaKey }); });
      row.addEventListener('mousemove', () => { if (sel !== rows.indexOf(row)) { sel = rows.indexOf(row); mark(); } });
      rows.push(row);
      list.append(row);
    });
    if (sel >= rows.length) sel = rows.length - 1;
    mark();
  }
  function mark() {
    rows.forEach((r, i) => r.classList.toggle('sel', i === sel));
    rows[sel]?.scrollIntoView({ block: 'nearest' });
  }
  filter.addEventListener('input', () => { sel = 0; draw(); });
  filter.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(rows.length - 1, sel + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    else if (e.key === 'Enter' && rows[sel]) { e.preventDefault(); rows[sel].dispatchEvent(new MouseEvent('click', { ctrlKey: e.ctrlKey })); }
  });
  // "נפתחו": המסמך הפתוח הוא הראשון, ולכן הבחירה מתחילה מהבא אחריו (כמו Alt+Tab)
  draw();
  if (kind === 'opened' && rows.length > 1 && opened[0]?.path === current) { sel = 1; mark(); }
  filter.focus();
}
