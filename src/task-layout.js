import { Fragment } from '@tiptap/pm/model';

export function completedLast(items, isDone = (item) => !!item?.attrs?.checked) {
  const open = [], done = [];
  for (const item of items) (isDone(item) ? done : open).push(item);
  return [...open, ...done];
}

// Reorders only siblings inside each task list. Nested lists stay inside their task item.
export function sortCompletedTaskLists(editor) {
  const lists = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'taskList') lists.push({ node, pos });
    return true;
  });
  let transaction = editor.state.tr;
  let changed = false;
  for (const { node, pos } of lists.sort((a, b) => b.pos - a.pos)) {
    const before = [...node.content.content];
    const after = completedLast(before);
    if (after.every((item, index) => item === before[index])) continue;
    transaction = transaction.replaceWith(pos, pos + node.nodeSize,
      node.type.create(node.attrs, Fragment.fromArray(after), node.marks));
    changed = true;
  }
  if (changed) editor.view.dispatch(transaction.setMeta('taliTaskSort', true));
  return changed;
}

export function markCompletedBoundaries(root) {
  for (const list of root?.querySelectorAll?.('ul[data-type="taskList"]') || []) {
    const direct = [...list.children].filter((item) => item.matches('li[data-type="taskItem"]'));
    for (const item of direct) item.classList.remove('tali-completed-first');
    const firstDone = direct.findIndex((item) => item.getAttribute('data-checked') === 'true');
    if (firstDone > 0) direct[firstDone].classList.add('tali-completed-first');
  }
}

