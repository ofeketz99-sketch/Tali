// תגיות #תג בעורך: קישוט תצוגה בלבד (הטקסט בקובץ לא משתנה). לחיצה פותחת את חלון התגיות.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { extractTags } from '../vault-data.js';

const key = new PluginKey('taliTags');
function build(doc) {
  const decos = [];
  doc.descendants((node, pos, parent) => {
    if (parent?.type.spec.code) return false;
    if (!node.isText || !node.text.includes('#')) return;
    if (node.marks.some((m) => m.type.spec.code || m.type.name === 'link')) return;
    for (const t of extractTags(node.text)) {
      if (t.index < 0) continue;
      decos.push(Decoration.inline(pos + t.index, pos + t.index + 1 + t.tag.length, { class: 'tag', 'data-tag': t.tag }));
    }
  });
  return DecorationSet.create(doc, decos);
}

export const Tags = Extension.create({
  name: 'taliTags',
  addOptions() { return { onClick: () => {} }; },
  addProseMirrorPlugins() {
    const onClick = this.options.onClick;
    return [new Plugin({
      key,
      state: {
        init: (_, state) => build(state.doc),
        apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
      },
      props: {
        decorations: (state) => key.getState(state),
        handleClick(view, _pos, event) {
          const el = event.target.closest?.('.tag');
          if (!el || !view.state.selection.empty) return false;
          onClick(el.dataset.tag);
          return true;
        },
      },
    })];
  },
});
