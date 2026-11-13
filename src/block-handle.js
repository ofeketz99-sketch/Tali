// ידית גרירה ליד כל שורה, פריט רשימה או גוש (כמו בנושן): מופיעה בשוליים כשהעכבר מעל השורה.
// גרירה מזיזה את הגוש למקום אחר בדף; לחיצה מסמנת אותו (ואז אפשר Delete, העתקה או Alt+↑/↓).
import { Extension } from '@tiptap/core';
import { Plugin, NodeSelection } from '@tiptap/pm/state';
import { icon } from './icons.js';

const ITEM_TYPES = ['taskItem', 'listItem'];

// הגוש שמתחת לנקודה: פריט הרשימה הפנימי ביותר, ואם אין, הגוש העליון במסמך
function blockAt(view, x, y) {
  const found = view.posAtCoords({ left: x, top: y });
  if (!found) return null;
  const $pos = view.state.doc.resolve(found.inside >= 0 ? found.inside : found.pos);
  for (let d = $pos.depth; d > 0; d--) {
    if (ITEM_TYPES.includes($pos.node(d).type.name)) return { pos: $pos.before(d), node: $pos.node(d) };
  }
  if ($pos.depth >= 1) return { pos: $pos.before(1), node: $pos.node(1) };
  const node = view.state.doc.nodeAt(found.inside >= 0 ? found.inside : found.pos);
  return node && !node.isText ? { pos: found.inside >= 0 ? found.inside : found.pos, node } : null;
}

export const BlockHandle = Extension.create({
  name: 'blockHandle',
  addProseMirrorPlugins() {
    let handle = null, current = null, hideTimer = null;
    const hide = () => { if (handle) handle.classList.remove('show'); current = null; };
    return [new Plugin({
      view(view) {
        handle = document.createElement('div');
        handle.className = 'block-handle';
        handle.draggable = true;
        handle.innerHTML = icon('grip', 16);
        handle.dataset.tip = 'גרירה להזזה · לחיצה לסימון';
        handle.setAttribute('aria-hidden', 'true');
        document.body.append(handle);

        const place = (block) => {
          const dom = view.nodeDOM(block.pos);
          if (!(dom instanceof HTMLElement)) { hide(); return; }
          const rect = dom.getBoundingClientRect();
          const pageRect = view.dom.getBoundingClientRect();
          const rtl = getComputedStyle(dom).direction !== 'ltr';
          // בשוליים, בצד שבו מתחילה השורה. בפריט רשימה: ליד תיבת הסימון או התבליט
          const left = rtl ? Math.min(rect.right + 6, pageRect.right + 18) : Math.max(rect.left - 24, pageRect.left - 36);
          const line = parseFloat(getComputedStyle(dom).lineHeight) || 24;
          handle.style.left = left + 'px';
          handle.style.top = rect.top + Math.min(rect.height, line) / 2 - 9 + 'px';
          handle.classList.add('show');
          current = block;
        };
        const onMove = (event) => {
          if (!view.editable || event.buttons) return;
          clearTimeout(hideTimer);
          const rect = view.dom.getBoundingClientRect();
          // גם בשוליים, מעט מחוץ לטקסט, כדי שאפשר יהיה להגיע לידית עצמה
          const x = Math.max(rect.left + 4, Math.min(rect.right - 4, event.clientX));
          const block = blockAt(view, x, event.clientY);
          if (block) place(block); else hide();
        };
        const area = view.dom.closest('#page') || view.dom.parentElement;
        area.addEventListener('mousemove', onMove);
        area.addEventListener('mouseleave', (event) => {
          if (event.relatedTarget === handle) return;
          hideTimer = setTimeout(hide, 250);
        });
        handle.addEventListener('mouseenter', () => clearTimeout(hideTimer));
        handle.addEventListener('mouseleave', () => { hideTimer = setTimeout(hide, 250); });
        const scroller = view.dom.closest('#pageWrap') || window;
        scroller.addEventListener('scroll', hide, { passive: true });

        handle.addEventListener('mousedown', (event) => event.stopPropagation());
        handle.addEventListener('click', () => {
          if (!current) return;
          view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, current.pos)));
          view.focus();
        });
        handle.addEventListener('dragstart', (event) => {
          if (!current) { event.preventDefault(); return; }
          const selection = NodeSelection.create(view.state.doc, current.pos);
          view.dispatch(view.state.tr.setSelection(selection));
          const slice = selection.content();
          // כמו גרירה רגילה של ProseMirror: התוכן זז (move) ולא מועתק
          view.dragging = { slice, move: true };
          const dom = view.nodeDOM(current.pos);
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', current.node.textContent);
          if (dom instanceof HTMLElement) event.dataTransfer.setDragImage(dom, dom.offsetWidth - 10, 10);
          handle.classList.add('dragging');
        });
        handle.addEventListener('dragend', () => { handle.classList.remove('dragging'); hide(); });
        return {
          update() { if (current && current.pos >= view.state.doc.content.size) hide(); },
          destroy() { handle.remove(); area.removeEventListener('mousemove', onMove); },
        };
      },
      props: {
        handleKeyDown() { hide(); return false; },
      },
    })];
  },
});
