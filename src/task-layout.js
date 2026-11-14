import { Fragment } from '@tiptap/pm/model';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export function completedLast(items, isDone = (item) => !!item?.attrs?.checked) {
  const open = [], done = [];
  for (const item of items) (isDone(item) ? done : open).push(item);
  return [...open, ...done];
}

// The DOM element of every direct item of each task list, keyed by the (immutable) ProseMirror node.
// The sorted list reuses the same node objects, so the key survives the reorder.
function itemElements(editor, lists) {
  const out = new Map();
  for (const { node, pos } of lists) {
    let offset = pos + 1;
    node.forEach((item) => {
      const dom = editor.view.nodeDOM(offset);
      if (dom?.getBoundingClientRect) out.set(item, dom);
      offset += item.nodeSize;
    });
  }
  return out;
}
const taskLists = (doc) => {
  const lists = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'taskList') lists.push({ node, pos });
    return true;
  });
  return lists;
};

// Reorders only siblings inside each task list. Nested lists stay inside their task item.
// animate: every item that moved glides from its old place to the new one (FLIP: measure before
// and after, then animate the difference with transform only). Off with prefers-reduced-motion.
// A position inside one of the list's items, after the items were reordered: it stays at the same
// offset inside the same item. replaceWith alone mapped the cursor to the edge of the whole list, so
// Enter on a completed task (the new open task moves up to the open ones) left the cursor behind on a
// completed line, and typing went there instead of into the new task.
export function followItem(position, listPos, before, after) {
  let start = listPos + 1;
  for (const item of before) {
    const end = start + item.nodeSize;
    if (position > start && position < end) {
      let next = listPos + 1;
      for (const other of after) {
        if (other === item) return next + (position - start);
        next += other.nodeSize;
      }
    }
    start = end;
  }
  return position;
}

export function sortCompletedTaskLists(editor, { animate = false } = {}) {
  const lists = taskLists(editor.state.doc);
  let transaction = editor.state.tr;
  let changed = false;
  const moved = [];
  const { selection } = editor.state;
  const text = selection instanceof TextSelection;
  let anchor = selection.anchor, head = selection.head;
  // From the innermost list outwards. Every list keeps its size, so positions never shift, and each
  // list is read from the transaction: an outer list keeps the order its nested lists just got.
  for (const { pos } of [...lists].sort((a, b) => b.pos - a.pos)) {
    const node = transaction.doc.nodeAt(pos);
    const before = [...node.content.content];
    const after = completedLast(before);
    if (after.every((item, index) => item === before[index])) continue;
    moved.push({ node, pos });
    transaction = transaction.replaceWith(pos, pos + node.nodeSize,
      node.type.create(node.attrs, Fragment.fromArray(after), node.marks));
    anchor = followItem(anchor, pos, before, after);
    head = followItem(head, pos, before, after);
    changed = true;
  }
  if (!changed) return false;
  if (text) {
    transaction.setSelection(TextSelection.create(transaction.doc, anchor, head));
    if (editor.view.hasFocus()) transaction.scrollIntoView();
  }
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const first = animate && !still ? new Map([...itemElements(editor, moved)].map(([n, el]) => [n, el.getBoundingClientRect().top])) : null;
  editor.view.dispatch(transaction.setMeta('taliTaskSort', true));
  if (!first) return true;
  const now = itemElements(editor, taskLists(editor.state.doc));
  for (const [node, top] of first) {
    const el = now.get(node);
    if (!el) continue;
    const dy = top - el.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) continue;
    const done = !!node.attrs?.checked;
    el.animate(
      [{ transform: `translateY(${dy}px)`, opacity: done ? 0.55 : 1 }, { transform: 'translateY(0)', opacity: 1 }],
      { duration: done ? 420 : 340, easing: 'cubic-bezier(.2, .8, .25, 1)' },
    );
  }
  return true;
}

// The divider above the first completed task (after at least one open one), as a ProseMirror node
// decoration. Until 7.1 a class was added to the DOM from outside: it looked for li[data-type="taskItem"]
// (TipTap draws a plain <li data-checked>), and ProseMirror would redraw the item without it anyway,
// so the divider never appeared. isOn(): only while "completed tasks at the bottom" is on.
export function completedDividers(doc) {
  const out = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'taskList') return true;
    let offset = pos + 1, seenOpen = false, marked = false;
    node.forEach((item) => {
      const done = !!item.attrs?.checked;
      if (done && seenOpen && !marked) { out.push({ from: offset, to: offset + item.nodeSize }); marked = true; }
      if (!done) seenOpen = true;
      offset += item.nodeSize;
    });
    return true;
  });
  return out;
}
const dividerKey = new PluginKey('taliCompletedDivider');
export const CompletedDivider = Extension.create({
  name: 'completedDivider',
  addOptions() { return { isOn: () => false }; },
  addProseMirrorPlugins() {
    const isOn = this.options.isOn;
    return [new Plugin({
      key: dividerKey,
      props: {
        decorations: (state) => (isOn()
          ? DecorationSet.create(state.doc, completedDividers(state.doc).map((d) => Decoration.node(d.from, d.to, { class: 'tali-completed-first' })))
          : null),
      },
    })];
  },
});

