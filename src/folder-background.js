// רקע תיקייה: בנק של שמונה צבעים שמגיע ממשתני הערכה (צבעי הגרף), ולכן נשאר קריא
// וקוהרנטי גם ביום וגם בלילה. המסמכים יורשים את הרקע דרך vault-meta.js.
import { icon } from './icons.js';

const COLORS = [
  [1, 'כחול'], [2, 'כתום'], [3, 'ירוק'], [4, 'ורוד'],
  [5, 'סגול'], [6, 'זהב'], [7, 'טורקיז'], [8, 'אדום'],
];

export function openFolderBackgroundPicker({ title, current, onPick }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'vault-dialog folder-background-picker';
  dlg.dir = 'rtl';
  dlg.innerHTML = `<div class="vd-head"><span class="vd-icon">${icon('palette', 18)}</span><h2></h2><button type="button" class="icon-btn" aria-label="סגירה">${icon('close', 18)}</button></div><div class="vd-body"><p class="vd-intro">הצבע חל על התיקייה, על תתי־התיקיות ועל המסמכים שבה. תיקייה פנימית יכולה לקבל צבע משלה.</p><div class="fb-colors" role="radiogroup" aria-label="צבע רקע"></div><label class="fb-opacity"><span>שקיפות הרקע</span><input type="range" min="0" max="60" step="1"><output></output></label><div class="fb-preview"><span>${icon('folder', 16)}</span><strong></strong><small>מסמך בתוך התיקייה</small></div><div class="fb-actions"><button type="button" class="fb-remove">ללא רקע</button><span></span><button type="button" class="primary fb-save">שמירה</button></div></div>`;
  dlg.querySelector('h2').textContent = title;
  dlg.querySelector('.fb-preview strong').textContent = title.replace(/^רקע ל/, '').replace(/[״"]/g, '');
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.querySelector('.vd-head .icon-btn').addEventListener('click', () => dlg.close());

  let color = current?.color || 1;
  let opacity = current?.opacity ?? 18;
  const colors = dlg.querySelector('.fb-colors');
  const range = dlg.querySelector('input[type="range"]');
  const output = dlg.querySelector('output');
  const preview = dlg.querySelector('.fb-preview');

  function refresh() {
    colors.querySelectorAll('button').forEach((button) => button.classList.toggle('on', Number(button.dataset.color) === color));
    range.value = String(opacity);
    output.textContent = `${opacity}%`;
    preview.style.setProperty('--folder-tint', `var(--graph-${color})`);
    preview.style.setProperty('--folder-alpha', `${opacity}%`);
  }
  for (const [id, name] of COLORS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fb-color';
    button.dataset.color = id;
    button.dataset.tip = name;
    button.setAttribute('aria-label', name);
    button.style.setProperty('--c', `var(--graph-${id})`);
    button.addEventListener('click', () => { color = id; refresh(); });
    colors.append(button);
  }
  range.addEventListener('input', () => { opacity = Number(range.value); refresh(); });
  dlg.querySelector('.fb-remove').addEventListener('click', () => { dlg.close(); onPick(null); });
  dlg.querySelector('.fb-save').addEventListener('click', () => { dlg.close(); onPick({ color, opacity }); });
  refresh();
  dlg.showModal();
}
