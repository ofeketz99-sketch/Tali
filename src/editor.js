// העורך העשיר (TipTap). שומר ומטעין Markdown, ויודע לעבור לתצוגה גולמית.
// כל מה שקשור לשמירה נאמנה של תחביר אובסידיאן נמצא ב־obsidian-md.js.
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { HighlightInk } from './highlight-ink.js';
import TextAlign from '@tiptap/extension-text-align';
import TableRow from '@tiptap/extension-table-row';
import { WordTable, WordTableCell, WordTableHeader, attachTableBar } from './table.js';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { WikiLink } from './wikilink.js';
import { splitLinksLines, mergeLinksLines } from '../links.js';
import { Embed, LocalImage } from './embed.js';
import { splitOverlay, joinOverlay } from './overlay-data.js';
import { MathPreview } from './math.js';
import { Tags } from './tags.js';
import { attachPropsEditor } from './props-editor.js';
import {
  ObsidianMarkdown, FaithfulText, FaithfulHardBreak, FaithfulHorizontalRule, FaithfulHeading, FaithfulLink,
  RawHtmlBlock, RawHtmlInline,
  splitFrontmatter, joinFrontmatter,
} from './obsidian-md.js';

// links: { getNotes, resolve, onOpen, localSrc } — ראו wikilink.js ו־embed.js
// propsElement: textarea של המאפיינים (frontmatter)
// onImageFiles: (files) => void — תמונות שהודבקו או נגררו לעורך
export function createEditor({ element, rawElement, propsElement, onChange, links, onImageFiles }) {
  let raw = false;
  let loading = false;
  let frontmatter = null;
  let overlayController = null;
  let overlayObjects = [];
  const imagesOf = (list) => [...(list || [])].filter((f) => f.type.startsWith('image/'));

  const editor = new Editor({
    element,
    editorProps: {
      handlePaste(view, event) {
        const files = imagesOf(event.clipboardData?.files);
        if (!files.length) return false;
        onImageFiles(files);
        return true;
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const files = imagesOf(event.dataTransfer?.files);
        if (!files.length) return false;
        // הסמן עובר למקום שבו שוחררה התמונה
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (at) editor.commands.setTextSelection(at.pos);
        onImageFiles(files);
        return true;
      },
    },
    extensions: [
      StarterKit.configure({ text: false, hardBreak: false, horizontalRule: false, heading: false }),
      FaithfulText,
      FaithfulHardBreak,
      FaithfulHorizontalRule,
      FaithfulHeading,
      ObsidianMarkdown,
      RawHtmlBlock,
      RawHtmlInline,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      HighlightInk, // טקסט קריא על מרקר (תצוגה בלבד)
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      WordTable.configure({ resizable: true, lastColumnResizable: false }),
      TableRow,
      WordTableHeader,
      WordTableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      FaithfulLink,
      LocalImage.configure({ localSrc: links.localSrc }),
      Embed.configure({ resolve: links.resolve, onOpen: links.onOpen, onEditDrawing: links.onEditDrawing, read: links.read }),
      Placeholder.configure({ placeholder: 'התחל לכתוב… ([[ לקישור למסמך אחר)' }),
      WikiLink.configure(links),
      MathPreview,
      Tags.configure({ onClick: (tag) => links.onTag?.(tag) }),
      // html: true שומר עיצוב שאין לו תחביר Markdown (צבע, יישור) כ־HTML בתוך הקובץ.
      // breaks: true כמו באובסידיאן: ירידת שורה בודדת היא ירידת שורה.
      Markdown.configure({ html: true, tightLists: true, linkify: true, breaks: true }),
    ],
    onUpdate: () => { if (!loading) onChange(); },
  });

  rawElement.addEventListener('input', () => { if (!loading) onChange(); });
  attachTableBar(editor, element.closest('#pageWrap') || window);

  // מאפיינים: מוצגים בתיבה מעל הדף רק כשיש כאלה בקובץ.
  // השורות של links: לא מוצגות כאן (הן בלוח "קישורים"), ונשמרות בצד במקומן המקורי.
  let linkLines = { block: [], at: -1 };
  const propsForm = attachPropsEditor(propsElement);
  const showProps = () => {
    const parts = splitLinksLines(frontmatter ?? '');
    linkLines = { block: parts.block, at: parts.at };
    propsElement.value = parts.rest;
    propsElement.hidden = frontmatter == null || raw || !parts.rest.trim();
    propsElement.dataset.blocked = raw ? '1' : '0';
    propsElement.style.height = 'auto';
    propsElement.style.height = propsElement.scrollHeight + 2 + 'px';
    propsForm.render();
  };
  propsElement.addEventListener('input', () => {
    frontmatter = mergeLinksLines(propsElement.value, linkLines.block, linkLines.at);
    // כל המאפיינים נמחקו: גם השורות --- יורדות, במקום להשאיר בלוק ריק בראש הקובץ
    if (!frontmatter.trim()) frontmatter = null;
    propsElement.style.height = 'auto';
    propsElement.style.height = propsElement.scrollHeight + 2 + 'px';
    if (!loading) onChange();
  });

  // שורה ריקה בסוף הקובץ (כמו שאובסידיאן ועורכים אחרים שומרים) נשמרת גם אחרי עריכה
  let endsWithNewline = false;
  const richMarkdown = () => {
    const out = joinFrontmatter(frontmatter, editor.storage.markdown.getMarkdown());
    const body = endsWithNewline && out && !out.endsWith('\n') ? out + '\n' : out;
    return joinOverlay(body, overlayController ? overlayController.getItems() : overlayObjects);
  };
  const loadRich = (md) => {
    const partsWithOverlay = splitOverlay(md);
    overlayObjects = partsWithOverlay.objects;
    overlayController?.setItems(overlayObjects);
    endsWithNewline = /\n$/.test(partsWithOverlay.markdown);
    const parts = splitFrontmatter(partsWithOverlay.markdown);
    frontmatter = parts.frontmatter;
    editor.commands.setContent(parts.body, false);
    propsForm.reset();
    showProps();
  };

  return {
    editor,
    setOverlayController(controller) {
      overlayController = controller;
      controller.setItems(overlayObjects);
      controller.setEnabled(!raw);
    },
    isRaw: () => raw,
    // "הוספת מאפיינים" בהערה שאין בה: טופס עם שורה ריקה
    addProperties() { if (!raw) propsForm.addFirst(); },
    getMarkdown: () => (raw ? rawElement.value : richMarkdown()),
    // שינוי של המאפיינים בלבד (למשל דגל) בלי לטעון מחדש את גוף המסמך: הסמן וההיסטוריה נשמרים.
    // fn מקבל ומחזיר את הקובץ כולו; כאן מוחל רק החלק של המאפיינים.
    updateFrontmatter(fn) {
      if (raw) {
        rawElement.value = fn(rawElement.value);
        rawElement.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      const next = splitFrontmatter(fn(joinFrontmatter(frontmatter, '')));
      frontmatter = next.frontmatter;
      showProps();
      if (!loading) onChange();
    },
    setMarkdown(md) {
      loading = true;
      loadRich(md || '');
      rawElement.value = md || '';
      loading = false;
      overlayController?.setEnabled(!raw);
    },
    // מסמן מחדש קישורים להערות שלא קיימות (אחרי יצירה, מחיקה או שינוי שם)
    refreshLinks() {
      for (const el of element.querySelectorAll('.wikilink')) {
        el.classList.toggle('unresolved', !links.resolve(el.getAttribute('data-wikilink')));
      }
    },
    toggleRaw() {
      loading = true;
      if (raw) loadRich(rawElement.value);
      else rawElement.value = richMarkdown();
      loading = false;
      raw = !raw;
      overlayController?.setEnabled(!raw);
      element.hidden = raw;
      rawElement.hidden = !raw;
      showProps();
      if (raw) rawElement.focus();
      else editor.commands.focus();
      return raw;
    },
  };
}
