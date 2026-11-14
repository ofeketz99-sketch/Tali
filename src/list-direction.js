// Explicit list direction is saved as HTML because Markdown has no syntax for it.
// Lists without an explicit direction keep the normal clean Markdown serializer.
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import TaskList from '@tiptap/extension-task-list';
import { Fragment } from '@tiptap/pm/model';
import { getHTMLFromFragment, Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

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

// 6.2 could save a direction-aware mixed list as one HTML <ul>, leaving task
// markers as literal "[x]" text. Split such legacy HTML into adjacent regular
// and task lists before ProseMirror reads it, so existing notes repair themselves.
function upgradeLegacyDirectionTasks(element) {
  for (const list of [...element.querySelectorAll('ul[dir], ul[data-tali-list-dir]')]) {
    if (list.getAttribute('data-type') === 'taskList') continue;
    const items = [...list.children].filter((child) => child.tagName === 'LI');
    const info = items.map((item) => {
      const walker = item.ownerDocument.createTreeWalker(item, 4); // NodeFilter.SHOW_TEXT
      const text = walker.nextNode();
      const match = text?.data.match(/^\s*\[([ xX])\]\s+/);
      return { item, text, checked: match ? match[1].toLowerCase() === 'x' : null, task: !!match };
    });
    if (!info.some((entry) => entry.task)) continue;
    const fragment = list.ownerDocument.createDocumentFragment();
    let group = null, groupIsTask = null;
    for (const entry of info) {
      if (!group || groupIsTask !== entry.task) {
        group = list.cloneNode(false);
        groupIsTask = entry.task;
        if (groupIsTask) group.setAttribute('data-type', 'taskList');
        else group.removeAttribute('data-type');
        fragment.append(group);
      }
      if (entry.task) {
        entry.item.setAttribute('data-type', 'taskItem');
        entry.item.setAttribute('data-checked', String(entry.checked));
        entry.text.data = entry.text.data.replace(/^\s*\[[ xX]\]\s+/, '');
      }
      group.append(entry.item);
    }
    list.replaceWith(fragment);
  }
}

export const DirectionBulletList = BulletList.extend({
  addAttributes() { return attrs(this.parent); },
  addStorage() {
    return { markdown: { serialize(state, node) {
      if (node.attrs.dir) return serializeHtml(state, node);
      return state.renderList(node, '  ', () => (this.editor.storage.markdown.options.bulletListMarker || '-') + ' ');
    }, parse: { updateDOM: upgradeLegacyDirectionTasks } } };
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
    } } };
  },
});

export const DirectionTaskList = TaskList.extend({
  addAttributes() { return attrs(this.parent); },
  addStorage() {
    return { markdown: { serialize(state, node) {
      if (node.attrs.dir) return serializeHtml(state, node);
      return state.renderList(node, '  ', () => (this.editor.storage.markdown.options.bulletListMarker || '-') + ' ');
    } } };
  },
});

export const LIST_TYPES = ['bulletList', 'orderedList', 'taskList'];


// H2 במצב "אוטומטי" (data-textdir="auto"): dir="auto" על הכותרת, כקישוט תצוגה בלבד. כך הכיוון של
// הכותרת עצמה (ולא רק של הטקסט, כמו ב־unicode-bidi: plaintext) נקבע לפי השפה שלה, והקו שאחרי הטקסט
// (h2::after ב־styles.css, logical properties) נמתח לצד הנכון גם בכותרת באנגלית. הקובץ לא משתנה.
// במצבי rtl/ltr אין קישוט, ולכן גם הייצוא (שמעתיק את ה־DOM) לא משתנה.
const headingDirKey = new PluginKey('taliHeadingDir');
export const HeadingDirection = Extension.create({
  name: 'headingDirection',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: headingDirKey,
      props: {
        decorations: (state) => {
          if (document.documentElement.dataset.textdir !== 'auto') return null;
          const out = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'heading' && node.attrs.level === 2) out.push(Decoration.node(pos, pos + node.nodeSize, { dir: 'auto' }));
            return node.isBlock && !node.isTextblock;
          });
          return DecorationSet.create(state.doc, out);
        },
      },
    })];
  },
});
