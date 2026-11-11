// העורך העשיר (TipTap). שומר ומטעין Markdown, ויודע לעבור לתצוגה גולמית.
// כל מה שקשור לשמירה נאמנה של תחביר אובסידיאן נמצא ב־obsidian-md.js.
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
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
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      WordTable.configure({ resizable: true, lastColumnResizable: false }),
      TableRow,
      WordTableHeader,
      WordTableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      FaithfulLink,
      LocalImage.configure({ localSrc: links.localSrc }),
      Embed.configure({ resolve: links.resolve, onOpen: links.onOpen, onEditDrawing: links.onEditDrawing }),
      Placeholder.configure({ placeholder: 'התחל לכתוב… ([[ לקישור להערה אחרת)' }),
      WikiLink.configure(links),
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
  const showProps = () => {
    const parts = splitLinksLines(frontmatter ?? '');
    linkLines = { block: parts.block, at: parts.at };
    propsElement.value = parts.rest;
    propsElement.hidden = frontmatter == null || raw || !parts.rest.trim();
    propsElement.style.height = 'auto';
    propsElement.style.height = propsElement.scrollHeight + 2 + 'px';
  };
  propsElement.addEventListener('input', () => {
    frontmatter = mergeLinksLines(propsElement.value, linkLines.block, linkLines.at);
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
    getMarkdown: () => (raw ? rawElement.value : richMarkdown()),
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
