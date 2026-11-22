// תצוגה מקדימה של הערה בריחוף על קישור [[...]] (בעורך, בהטמעות ובתצוגות מקדימות עצמן).
// ריחוף של כחצי שנייה פותח חלונית קטנה עם תחילת ההערה. לחיצה עליה פותחת את ההערה.
import { renderNoteHtml } from './note-render.js';
import { icon } from './icons.js';
import { isMiddleClick, linkOpenOptions } from './link-open.js';

const SELECTOR = '.ProseMirror .wikilink, .np-link, .embed-note .en-head';

export function setupHoverPreview({ resolve, read, fileUrl, onOpen, isNote }) {
  const pop = document.createElement('div');
  pop.className = 'note-preview';
  pop.hidden = true;
  pop.setAttribute('role', 'tooltip');
  document.body.append(pop);

  let showTimer = null, hideTimer = null, anchor = null, token = 0;
  const cache = new Map(); // path -> { at, text }

  const hide = () => { clearTimeout(showTimer); pop.hidden = true; pop.classList.remove('show'); anchor = null; };
  const scheduleHide = () => { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 260); };

  async function show(el) {
    const target = el.getAttribute('data-wikilink') || el.dataset.target || el.closest('.embed-note')?.dataset.target;
    if (!target) return;
    const [name, heading] = target.split('|')[0].split('#');
    const path = resolve(name);
    if (!path || !isNote(path)) return;
    const my = ++token;
    let entry = cache.get(path);
    if (!entry || Date.now() - entry.at > 8000) {
      try { entry = { at: Date.now(), text: await read(path) }; cache.set(path, entry); } catch { return; }
    }
    if (my !== token || anchor !== el) return;
    pop.innerHTML = '';
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'np-head';
    head.innerHTML = `${icon('file', 15)}<span></span>${icon('chevron', 13)}`;
    head.querySelector('span').textContent = name.split('/').pop() + (heading ? ' › ' + heading : '');
    head.dataset.tip = 'פתיחת המסמך';
    head.addEventListener('click', (e) => { hide(); onOpen(name, linkOpenOptions(e)); });
    head.addEventListener('auxclick', (e) => { if (isMiddleClick(e)) { e.preventDefault(); hide(); onOpen(name, linkOpenOptions(e)); } });
    const body = document.createElement('div');
    body.className = 'np-body';
    body.innerHTML = renderNoteHtml(entry.text, { resolve, fileUrl, heading, limit: 1800 });
    pop.append(head, body);
    pop.hidden = false;
    // מתחת לקישור, ואם אין מקום אז מעליו. לא יוצא מהחלון.
    const r = el.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let top = r.bottom + 8;
    if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 8);
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
    requestAnimationFrame(() => pop.classList.add('show'));
  }

  document.addEventListener('mouseover', (e) => {
    if (e.target.closest?.('.note-preview')) { clearTimeout(hideTimer); return; }
    const el = e.target.closest?.(SELECTOR);
    if (!el) { if (anchor) scheduleHide(); return; }
    if (el === anchor) { clearTimeout(hideTimer); return; }
    clearTimeout(showTimer); clearTimeout(hideTimer);
    if (anchor && !pop.hidden) hide();
    anchor = el;
    showTimer = setTimeout(() => show(el), 480);
  });
  pop.addEventListener('mouseleave', scheduleHide);
  pop.addEventListener('click', (e) => {
    const link = e.target.closest('.np-link');
    if (link) { hide(); onOpen(link.dataset.target, linkOpenOptions(e)); }
  });
  pop.addEventListener('auxclick', (e) => {
    const link = e.target.closest('.np-link');
    if (link && isMiddleClick(e)) { e.preventDefault(); hide(); onOpen(link.dataset.target, linkOpenOptions(e)); }
  });
  document.addEventListener('mousedown', (e) => { if (!e.target.closest?.('.note-preview')) hide(); }, true);
  document.addEventListener('keydown', hide, true);
  addEventListener('blur', hide);
  return { hide, invalidate: () => cache.clear() };
}
