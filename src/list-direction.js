// Explicit list direction is saved as HTML because Markdown has no syntax for it.
// Lists without an explicit direction keep the normal clean Markdown serializer.
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import TaskList from '@tiptap/extension-task-list';
import { Fragment } from '@tiptap/pm/model';
import { getHTMLFromFragment } from '@tiptap/core';

const directionAttribute = {
  dir: {
    default: null,
    parseHTML: (element) => ['rtl', 'ltr'].includes(element.getAttribute('dir')) ? element.getAttribute('dir') : null,
    renderHTML: ({ dir }) => ['rtl', 'ltr'].includes(dir) ? { dir, 'data-tali-list-dir': dir } : {},
  },
};

function serializeHtml(state, node) {
  const html = getHTMLFromFragment(Fragment.from(node), node.type.schema).replace(/>\s+</g, '><');
  state.write(html);
  state.closeBlock(node);
}

const attrs = (parent) => ({ ...(parent?.() || {}), ...directionAttribute });

export const DirectionBulletList = BulletList.extend({
  addAttributes() { return attrs(this.parent); },
  addStorage() {
    return { markdown: { serialize(state, node) {
      if (node.attrs.dir) return serializeHtml(state, node);
      return state.renderList(node, '  ', () => (this.editor.storage.markdown.options.bulletListMarker || '-') + ' ');
    }, parse: {} } };
  },
});

export const DirectionOrderedList = OrderedList.extend({
  addAttributes() { return attrs(this.parent); },
  addStorage() {
    return { markdown: { serialize(state, node, parent, index) {
      if (node.attrs.dir) return serializeHtml(state, node);
      const start = node.attrs.start || 1;
      const maxWidth = String(start + node.childCount - 1).length;
      const space = state.repeat(' ', maxWidth + 2);
      let adjacent = 0;
      while (index - adjacent > 0 && parent.child(index - adjacent - 1).type.name === node.type.name) adjacent++;
      const separator = adjacent % 2 ? ') ' : '. ';
      state.renderList(node, space, (i) => {
        const number = String(start + i);
        return state.repeat(' ', maxWidth - number.length) + number + separator;
      });
    }, parse: {} } };
  },
});

export const DirectionTaskList = TaskList.extend({
  addAttributes() { return attrs(this.parent); },
  addStorage() {
    return { markdown: { serialize(state, node) {
      if (node.attrs.dir) return serializeHtml(state, node);
      return state.renderList(node, '  ', () => (this.editor.storage.markdown.options.bulletListMarker || '-') + ' ');
    }, parse: {} } };
  },
});

export const LIST_TYPES = ['bulletList', 'orderedList', 'taskList'];

