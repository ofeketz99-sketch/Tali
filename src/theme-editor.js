// עורך ערכות הצבעים בחלון ההגדרות: מצב (יום/לילה/Windows/שעות), שעות המעבר,
// ועריכה של ערכת היום וערכת הלילה בנפרד, עם ערכות מוכנות, בורר צבע, HEX, אזהרות ניגודיות ותצוגה מקדימה.
// העריכה היא טיוטה: היא מוצגת מיד (בתצוגה המקדימה, ועל הממשק אם זו הערכה הפעילה),
// ונשמרת רק ב"החלה". "ביטול" או סגירת החלון בלי החלה מחזירים את הצבעים השמורים.
import { icon } from './icons.js';
import { setThemePreview, profileNow } from './theme.js';
import {
  BASE_KEYS, BASE_LABELS, PRESETS, DEFAULT_THEMES, contrastIssues, deriveVars, normalizeHex,
  validSchedule, parseHM, formatHM, nextSwitch,
} from './theme-core.js';

const ACCENTS = [
  ['#6cb8e6', 'תכלת'], ['#4a8fd8', 'כחול'], ['#5cc4a4', 'מנטה'],
  ['#a596e2', 'לבנדר'], ['#ee9f7c', 'אפרסק'], ['#e98fb4', 'ורוד'],
];
const PROFILE_NAME = { day: 'ערכת היום', night: 'ערכת הלילה' };
const clone = (t) => ({ day: { ...t.day }, night: { ...t.night } });

export function buildThemeSection({ el, row, getPrefs, setPref }) {
  let draft = clone(getPrefs().themes);
  let target = profileNow();
  const refreshers = [];
  const bind = (fn) => { refreshers.push(fn); return fn; };
  const isDirty = () => JSON.stringify(draft) !== JSON.stringify(getPrefs().themes);

  // ----- מצב הפעלה -----
  const modeBox = el('div', { class: 'seg' });
  for (const [value, text] of [['day', 'יום'], ['night', 'לילה'], ['system', 'לפי Windows'], ['schedule', 'לפי שעות']]) {
    const b = el('button', { type: 'button', on: { click: () => { setPref('themeMode', value, { animate: true }); target = profileNow(); refresh(); } } }, text);
    modeBox.append(b);
    bind(() => b.classList.toggle('on', getPrefs().themeMode === value));
  }
  const nowLine = el('small', { class: 'theme-now' });
  bind(() => {
    const p = getPrefs();
    const active = profileNow();
    let text = `פעילה עכשיו: ${PROFILE_NAME[active]}`;
    if (p.themeMode === 'schedule') {
      const next = nextSwitch({ mode: 'schedule', schedule: p.schedule, now: new Date() });
      if (next) text += ` · מתחלפת ב־${formatHM(next.getHours() * 60 + next.getMinutes())}`;
    }
    nowLine.textContent = text;
  });
  const modeRow = row('ערכה פעילה', null, el('div', { class: 'theme-mode' }, modeBox, nowLine));

  // ----- שעות -----
  const timeInput = (key) => {
    const i = el('input', { type: 'text', class: 'time-input', maxlength: '5', inputmode: 'numeric', placeholder: key === 'day' ? '07:00' : '19:00', 'aria-label': key === 'day' ? 'שעת ערכת היום' : 'שעת ערכת הלילה' });
    i.addEventListener('change', () => commitTimes());
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitTimes(); } });
    bind(() => { if (document.activeElement !== i) i.value = getPrefs().schedule[key]; });
    return i;
  };
  const dayTime = timeInput('day');
  const nightTime = timeInput('night');
  const timeError = el('small', { class: 'theme-error', role: 'alert' });
  function commitTimes() {
    const norm = (v) => { const m = parseHM(v); return m == null ? null : formatHM(m); };
    const s = { day: norm(dayTime.value), night: norm(nightTime.value) };
    if (!s.day || !s.night) { timeError.textContent = 'שעה בפורמט 24 שעות, למשל 07:00 או 19:30.'; return; }
    if (!validSchedule(s)) { timeError.textContent = 'שתי השעות זהות. בחר שעות שונות ליום וללילה.'; return; }
    timeError.textContent = '';
    setPref('schedule', s, { animate: true });
    refresh();
  }
  const scheduleRow = row('שעות המעבר', 'לפי השעון של המחשב, בפורמט 24 שעות',
    el('div', { class: 'theme-times' },
      el('label', {}, el('span', {}, 'יום מ־'), dayTime),
      el('label', {}, el('span', {}, 'לילה מ־'), nightTime),
      timeError));
  bind(() => { scheduleRow.hidden = getPrefs().themeMode !== 'schedule'; });

  // ----- איזו ערכה עורכים -----
  const targetBox = el('div', { class: 'seg theme-target' });
  for (const t of ['day', 'night']) {
    const b = el('button', { type: 'button', on: { click: () => { target = t; refresh(); } } });
    targetBox.append(b);
    bind(() => {
      b.classList.toggle('on', target === t);
      b.textContent = `עריכת ${PROFILE_NAME[t]}`;
      if (profileNow() === t) b.append(el('span', { class: 'theme-live' }, 'פעילה'));
    });
  }

  // ----- ערכות מוכנות -----
  const presetBox = el('div', { class: 'theme-presets' });
  for (const p of PRESETS) {
    const chip = el('button', { type: 'button', class: 'theme-preset', 'data-tip': `${p.name}: להחיל על ${'הערכה שבעריכה'}` },
      el('span', { class: 'tp-dots' },
        el('i', { style: `background:${p.colors.bg}` }), el('i', { style: `background:${p.colors.page}` }), el('i', { style: `background:${p.colors.accent}` })),
      el('span', {}, p.name));
    chip.addEventListener('click', () => { draft[target] = { ...p.colors }; changed(); });
    presetBox.append(chip);
    bind(() => chip.classList.toggle('on', JSON.stringify(draft[target]) === JSON.stringify(p.colors)));
  }

  // ----- צבעי היסוד -----
  const colorRows = el('div', { class: 'theme-colors' });
  for (const key of BASE_KEYS) {
    const picker = el('input', { type: 'color', class: 'theme-swatch', 'aria-label': BASE_LABELS[key] });
    const hex = el('input', { type: 'text', class: 'theme-hex', maxlength: '7', spellcheck: 'false', 'aria-label': `${BASE_LABELS[key]} (HEX)` });
    picker.addEventListener('input', () => { draft[target][key] = picker.value; changed({ skip: hex }); });
    hex.addEventListener('input', () => {
      const v = normalizeHex(hex.value);
      hex.classList.toggle('bad', !v);
      if (v) { draft[target][key] = v; changed({ skip: hex }); }
    });
    hex.addEventListener('blur', () => { hex.value = draft[target][key]; hex.classList.remove('bad'); });
    bind(() => {
      picker.value = draft[target][key];
      if (document.activeElement !== hex) hex.value = draft[target][key];
    });
    const line = el('div', { class: 'theme-color' }, el('span', { class: 'theme-color-name' }, BASE_LABELS[key]), picker, hex);
    if (key === 'accent') {
      const quick = el('div', { class: 'swatches theme-accents' });
      for (const [color, name] of ACCENTS) {
        const b = el('button', { type: 'button', class: 'swatch', 'data-tip': name, 'aria-label': name, style: `background:${color}` });
        b.addEventListener('click', () => { draft[target].accent = color; changed(); });
        quick.append(b);
        bind(() => b.classList.toggle('on', draft[target].accent === color));
      }
      line.append(quick);
    }
    colorRows.append(line);
  }

  // ----- אזהרות ניגודיות: מציעות תיקון, לא מתקנות לבד -----
  const warnBox = el('div', { class: 'theme-warnings', 'aria-live': 'polite' });
  bind(() => {
    warnBox.innerHTML = '';
    for (const issue of contrastIssues(draft[target])) {
      const fix = el('button', { type: 'button', class: 'theme-fix' },
        el('i', { style: `background:${issue.suggestion}` }), `שימוש ב־${issue.suggestion}`);
      fix.addEventListener('click', () => { draft[target][issue.key] = issue.suggestion; changed(); });
      const w = el('div', { class: 'theme-warning' });
      w.innerHTML = icon('warning', 15);
      w.append(el('span', {}, `${issue.what}: ניגודיות ${issue.ratio}:1, מומלץ לפחות ${issue.min}:1.`), fix);
      warnBox.append(w);
    }
  });

  // ----- תצוגה מקדימה: מיני־ממשק עם משתני הטיוטה -----
  const preview = el('div', { class: 'theme-preview', 'aria-hidden': 'true' },
    el('div', { class: 'tp-side' },
      el('div', { class: 'tp-logo' }),
      el('div', { class: 'tp-node on' }, 'מסמך פתוח'),
      el('div', { class: 'tp-node' }, 'מסמך אחר'),
      el('div', { class: 'tp-node' }, 'תיקייה')),
    el('div', { class: 'tp-main' },
      el('div', { class: 'tp-bar' }, el('span', { class: 'tp-btn on' }, 'B'), el('span', { class: 'tp-btn' }, 'I'), el('span', { class: 'tp-btn' }, 'U')),
      el('div', { class: 'tp-page' },
        el('div', { class: 'tp-h' }, 'כותרת לדוגמה'),
        el('div', { class: 'tp-p' }, 'טקסט רגיל עם ', el('span', { class: 'tp-link' }, 'קישור למסמך'), ' ו', el('span', { class: 'tp-muted' }, 'טקסט משני'), '.'),
        el('div', { class: 'tp-row' }, el('span', { class: 'tp-primary' }, 'כפתור'), el('span', { class: 'tp-input' }, 'שדה טקסט')))));
  bind(() => {
    const { vars } = deriveVars(draft[target]);
    for (const [k, v] of Object.entries(vars)) preview.style.setProperty(k, v);
  });

  // ----- פעולות -----
  const resetBtn = el('button', { type: 'button' });
  resetBtn.addEventListener('click', () => { draft[target] = { ...DEFAULT_THEMES[target] }; changed(); });
  bind(() => { resetBtn.textContent = `איפוס ${PROFILE_NAME[target]}`; });
  const cancelBtn = el('button', { type: 'button' }, 'ביטול השינויים');
  cancelBtn.addEventListener('click', () => discard());
  const applyBtn = el('button', { type: 'button', class: 'primary' }, 'החלה');
  applyBtn.addEventListener('click', () => commit());
  const dirtyNote = el('small', { class: 'theme-dirty' }, 'שינויים שעוד לא הוחלו');
  bind(() => {
    const dirty = isDirty();
    cancelBtn.disabled = !dirty;
    applyBtn.disabled = !dirty;
    dirtyNote.hidden = !dirty;
  });

  const editor = el('div', { class: 'theme-editor' },
    targetBox, presetBox,
    el('div', { class: 'theme-grid' }, colorRows, preview),
    warnBox,
    el('div', { class: 'theme-actions' }, resetBtn, el('span', { class: 'theme-spacer' }), dirtyNote, cancelBtn, applyBtn));

  function changed({ skip } = {}) {
    // הממשק עצמו מציג את הטיוטה רק אם עורכים את הערכה הפעילה; התצוגה המקדימה תמיד
    setThemePreview(isDirty() ? clone(draft) : null);
    for (const fn of refreshers) fn();
    if (skip) skip.focus?.();
  }
  function commit() {
    setPref('themes', clone(draft));
    setThemePreview(null);
    refresh();
  }
  function discard() {
    draft = clone(getPrefs().themes);
    setThemePreview(null);
    refresh();
  }
  function open() { draft = clone(getPrefs().themes); target = profileNow(); setThemePreview(null); refresh(); }
  function refresh() { for (const fn of refreshers) fn(); }

  return { nodes: [modeRow, scheduleRow, editor], refresh, open, isDirty, commit, discard };
}
