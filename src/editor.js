// העורך העשיר (TipTap). שומר ומטעין Markdown, ויודע לעבור לתצוגה גולמית.
// כל מה שקשור לשמירה נאמנה של תחביר אובסידיאן נמצא ב־obsidian-md.js.
import { Editor } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { HighlightInk } from './highlight-ink.js';
import TextAlign from '@tiptap/extension-text-align';
import TableRow from '@tiptap/extension-table-row';
import { WordTable, WordTableCell, WordTableHeader, attachTableBar } from './table.js';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { WikiLink } from './wikilink.js';
import { splitLinksLines, mergeLinksLines } from '../links.js';
import { Embed, LocalImage } from './embed.js';
import { splitOverlay, joinOverlay } from './overlay-data.js';
import { MathPreview } from './math.js';
import { Tags } from './tags.js';
import { DirectionBulletList, DirectionOrderedList, DirectionTaskList, HeadingDirection } from './list-direction.js';
import { CompletedDivider, sortCompletedTaskLists } from './task-layout.js';
import { ListBackspace } from './list-keys.js';
import { fitRaw, richAnchor, showRichAnchorInRaw, rawAnchor, rawAnchorToBlock, showBlockInRich } from './view-anchor.js';
import { BlockHandle } from './block-handle.js';
import { TaliBoxKeys } from './text-box.js';
import { attachPropsEditor } from './props-editor.js';
import {
  ObsidianMarkdown, FaithfulText, FaithfulHardBreak, FaithfulHorizontalRule, FaithfulHeading, FaithfulLink,
  RawHtmlBlock, RawHtmlInline,
  splitFrontmatter, joinFrontmatter,
} from './obsidian-md.js';

// links: { getNotes, resolve, onOpen, localSrc } — ראו wikilink.js ו־embed.js
// propsElement: textarea של המאפיינים (frontmatter)
// onImageFiles: (files) => void — תמונות שהודבקו או נגררו לעורך
export function createEditor({ element, rawElement, propsElement, onChange, links, onImageFiles, shouldSortCompleted = () => false }) {
  let raw = false;
  let loading = false;
  let frontmatter = null;
  let overlayController = null;
  let overlayObjects = [];
  let overlayPageWidth = 0;
  const imagesOf = (list) => [...(list || [])].filter((f) => f.type.startsWith('image/'));

  const editor = new Editor({
    element,
    editorProps: {
      handlePaste(view, event) {
        const files = imagesOf(event.clipboardData?.files);
        if (!files.length) return false;
        onImageFiles(files, null); // 8.2: תמונה חופשית במרכז האזור הגלוי של הדף
        return true;
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const files = imagesOf(event.dataTransfer?.files);
        if (!files.length) return false;
        // 8.2: תמונה חופשית בנקודה שבה שוחררה
        onImageFiles(files, { x: event.clientX, y: event.clientY });
        return true;
      },
    },
    extensions: [
      StarterKit.configure({ text: false, hardBreak: false, horizontalRule: false, heading: false,
        bulletList: false, orderedList: false }),
      FaithfulText,
      FaithfulHardBreak,
      FaithfulHorizontalRule,
      FaithfulHeading,
      HeadingDirection,
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
      DirectionBulletList,
      DirectionOrderedList,
      DirectionTaskList,
      TaskItem.configure({ nested: true }),
      CompletedDivider.configure({ isOn: () => shouldSortCompleted() }),
      ListBackspace,
      TaliBoxKeys,
      BlockHandle,
      FaithfulLink,
      LocalImage.configure({ localSrc: links.localSrc, onFree: links.onFreeImage || null }),
      Embed.configure({ resolve: links.resolve, onOpen: links.onOpen, onEditDrawing: links.onEditDrawing, read: links.read, onFree: links.onFreeImage || null }),
      Placeholder.configure({ placeholder: 'התחל לכתוב… ([[ לקישור למסמך אחר)' }),
      WikiLink.configure(links),
      MathPreview,
      Tags.configure({ onClick: (tag) => links.onTag?.(tag) }),
      // html: true שומר עיצוב שאין לו תחביר Markdown (צבע, יישור) כ־HTML בתוך הקובץ.
      // breaks: true כמו באובסידיאן: ירידת שורה בודדת היא ירידת שורה.
      Markdown.configure({ html: true, tightLists: true, linkify: true, breaks: true }),
    ],
    onUpdate: ({ editor }) => {
      if (loading) return;
      onChange();
      requestAnimationFrame(() => {
        if (shouldSortCompleted()) sortCompletedTaskLists(editor, { animate: true });
      });
    },
  });

  // תצוגת Markdown: התיבה בגובה התוכן, והדף (pageWrap) הוא שנגלל, כמו בתצוגה המעוצבת
  const scroller = element.closest('#pageWrap');
  rawElement.addEventListener('input', () => { if (raw) fitRaw(rawElement, scroller); if (!loading) onChange(); });
  window.addEventListener('resize', () => { if (raw) fitRaw(rawElement, scroller); });
  attachTableBar(editor, scroller || window);

  // מאפיינים: מוצגים בתיבה מעל הדף רק כשיש כאלה בקובץ.
  // השורות של links: לא מוצגות כאן (הן בלוח "קישורים"), ונשמרות בצד במקומן המקורי.
  // גם created: לא מוצג (הוא התאריך מעל הדף), ונשמר במקומו. כך מסמך חדש לא נפתח עם תיבת מאפיינים.
  let linkLines = { block: [], at: -1 };
  let createdLine = { block: [], at: -1 };
  const propsForm = attachPropsEditor(propsElement);
  const splitCreated = (fm) => {
    const lines = fm === '' ? [] : fm.split(/\r?\n/);
    const at = lines.findIndex((l) => /^created\s*:/.test(l));
    if (at < 0) return { rest: fm, block: [], at: -1 };
    const block = lines.splice(at, 1);
    return { rest: lines.join('\n'), block, at };
  };
  const showProps = () => {
    const parts = splitLinksLines(frontmatter ?? '');
    linkLines = { block: parts.block, at: parts.at };
    const c = splitCreated(parts.rest);
    createdLine = { block: c.block, at: c.at };
    propsElement.value = c.rest;
    propsElement.hidden = frontmatter == null || raw || !c.rest.trim();
    propsElement.dataset.blocked = raw ? '1' : '0';
    propsElement.style.height = 'auto';
    propsElement.style.height = propsElement.scrollHeight + 2 + 'px';
    propsForm.render();
  };
  propsElement.addEventListener('input', () => {
    frontmatter = mergeLinksLines(mergeLinksLines(propsElement.value, createdLine.block, createdLine.at), linkLines.block, linkLines.at);
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
    return joinOverlay(body, overlayController ? overlayController.getItems() : overlayObjects,
      { pageWidth: overlayController?.getPageWidth?.() || overlayPageWidth });
  };
  const loadRich = (md) => {
    const partsWithOverlay = splitOverlay(md);
    overlayObjects = partsWithOverlay.objects;
    overlayPageWidth = partsWithOverlay.pageWidth || 0; // 8.4: לפי איזה רוחב דף נשמרו המיקומים
    overlayController?.setItems(overlayObjects, { pageWidth: overlayPageWidth });
    endsWithNewline = /\n$/.test(partsWithOverlay.markdown);
    const parts = splitFrontmatter(partsWithOverlay.markdown);
    frontmatter = parts.frontmatter;
    editor.commands.setContent(parts.body, false);
    // היסטוריה נקייה לכל מסמך: בלי זה Ctrl+Z מיד אחרי פתיחה החזיר את התוכן של המסמך הקודם
    // לתוך המסמך הנוכחי, והשמירה האוטומטית כתבה אותו לקובץ הלא נכון.
    const { doc, plugins } = editor.state;
    editor.view.updateState(EditorState.create({ doc, plugins }));
    propsForm.reset();
    showProps();
  };

  return {
    editor,
    setOverlayController(controller) {
      overlayController = controller;
      controller.setItems(overlayObjects, { pageWidth: overlayPageWidth });
      controller.setEnabled(!raw);
    },
    refreshPreferences() {
      // ההגדרה השתנתה: ממיינים (אם הופעלה), ותמיד מבקשים ציור מחדש של קו ההפרדה
      if (!(shouldSortCompleted() && sortCompletedTaskLists(editor))) editor.view.dispatch(editor.state.tr.setMeta('taliRedecorate', true));
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
      if (raw) fitRaw(rawElement, scroller);
      loading = false;
      overlayController?.setEnabled(!raw);
    },
    // מסמן מחדש קישורים להערות שלא קיימות (אחרי יצירה, מחיקה או שינוי שם)
    refreshLinks() {
      for (const el of element.querySelectorAll('.wikilink')) {
        el.classList.toggle('unresolved', !links.resolve(el.getAttribute('data-wikilink')));
      }
    },
    // המעבר שומר על המקום בחלון: אותו גוש בראש החלון בשתי התצוגות (view-anchor.js)
    toggleRaw() {
      const head = () => joinFrontmatter(frontmatter, '').length;
      let block = null, richTop = null;
      loading = true;
      if (raw) {
        const anchor = rawAnchor(rawElement, scroller);
        loadRich(rawElement.value);
        block = rawAnchorToBlock(anchor, editor, rawElement, head());
      } else {
        richTop = richAnchor(editor, scroller);
        rawElement.value = richMarkdown();
      }
      loading = false;
      raw = !raw;
      overlayController?.setEnabled(!raw);
      element.hidden = raw;
      rawElement.hidden = !raw;
      showProps();
      if (raw) {
        fitRaw(rawElement, scroller);
        const at = showRichAnchorInRaw(richTop, editor, rawElement, scroller, head());
        rawElement.setSelectionRange(at, at);
        rawElement.focus({ preventScroll: true });
      } else {
        showBlockInRich(block, editor, scroller);
        editor.commands.focus(block?.pos != null ? block.pos + 1 : 'start', { scrollIntoView: false });
      }
      return raw;
    },
  };
}
