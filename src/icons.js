// סט האייקונים: Lucide (https://lucide.dev, רישיון ISC). שימוש: icon('table') מחזיר מחרוזת SVG.
// אין להשתמש באימוג'י או בסימני טקסט (↶ ✕ 🗑 וכו') בממשק. אייקון חדש: מייבאים מ־lucide ומוסיפים ל־ICONS.
import {
  Undo2, Redo2, List, ListOrdered, ListTodo, TextQuote, Code, AlignRight, AlignCenter, AlignLeft,
  Table, Image, PenLine, Minus, Highlighter, FileCode, ChevronDown, File, FileText, Folder, FolderPlus,
  FolderOpen, Plus, SlidersHorizontal, Search, SquarePlus, Check, Pencil, Copy, Link, Trash2, X, FilePlus,
  Palette, TableCellsMerge, TableCellsSplit, BetweenHorizontalStart, BetweenHorizontalEnd,
  BetweenVerticalStart, BetweenVerticalEnd, Heading, Pen, Slash, MoveUpRight, Square, Circle, Eraser,
  ArrowRight, ArrowLeft, GripVertical, Move, TextCursorInput, RectangleHorizontal, ArrowDownToLine, Paperclip, TriangleAlert, Rows3, Columns3, Baseline, Bold, Italic, Underline, Strikethrough,
  PanelRightClose, PanelRightOpen, Waypoints, Ghost, Hash, FileDown, FileType, ListChecks, ListTree, Info, Reply, Ellipsis, Focus, Minimize2,
  Archive, ArchiveRestore, Sigma, SquareSigma, CalendarDays, LayoutTemplate, Columns2, ChevronsDownUp, LocateFixed, History, ClipboardList, ChevronUp, Eye, EyeOff, House, Shapes, Heading1, Heading2, Heading3, Pilcrow, Scissors, ClipboardPaste, TextSelect, ChevronLeft, ChevronRight, Flag, Keyboard, MessageSquareText, Braces, Moon, MousePointer2, SquareDashed, PaintBucket,
  Group, Ungroup, RemoveFormatting, SquareCode, BringToFront, SendToBack, Pin, PinOff,
} from 'lucide';

const ICONS = {
  // סרגל עליון
  undo: Undo2, redo: Redo2, bullets: List, numbers: ListOrdered, tasks: ListTodo, quote: TextQuote,
  code: Code, alignRight: AlignRight, alignCenter: AlignCenter, alignLeft: AlignLeft, table: Table,
  image: Image, draw: PenLine, rule: Minus, highlight: Highlighter, textColor: Baseline, markdown: FileCode,
  insert: SquarePlus, chevron: ChevronDown, bold: Bold, italic: Italic, underline: Underline, strike: Strikethrough,
  // קבצים וסרגל צד
  file: FileText, fileBlank: File, folder: Folder, folderPlus: FolderPlus, vault: FolderOpen, plus: Plus,
  settings: SlidersHorizontal, search: Search, filePlus: FilePlus, keyboard: Keyboard,
  panelCollapse: PanelRightClose, panelExpand: PanelRightOpen,
  // פעולות
  check: Check, edit: Pencil, copy: Copy, link: Link, trash: Trash2, close: X, palette: Palette, comment: MessageSquareText,
  paperclip: Paperclip, warning: TriangleAlert,
  // תצוגות כספת וייצוא
  graph: Waypoints, ghost: Ghost, tag: Hash, exportPdf: FileDown, exportWord: FileType, taskSection: ListChecks,
  // לוח ההקשר
  outline: ListTree, info: Info, props: Braces, sleep: Moon, backlinks: Reply, calendar: CalendarDays, template: LayoutTemplate, splitView: Columns2, collapseAll: ChevronsDownUp, locate: LocateFixed, history: History, board: ClipboardList, chevronUp: ChevronUp, chevronDown: ChevronDown, eye: Eye, eyeOff: EyeOff, home: House, iconPick: Shapes,
  // סרגל: עוד, מצב מיקוד
  more: Ellipsis, focus: Focus, focusExit: Minimize2,
  // תפריט הלחיצה הימנית ונוסחאות
  math: Sigma, mathBlock: SquareSigma, h1: Heading1, h2: Heading2, h3: Heading3, paragraph: Pilcrow,
  cut: Scissors, paste: ClipboardPaste, selectAll: TextSelect, chevronLeft: ChevronLeft, chevronRight: ChevronRight, flag: Flag, arrowRight: ArrowRight, arrowLeft: ArrowLeft, grip: GripVertical,
  // טבלה
  rowBefore: BetweenHorizontalStart, rowAfter: BetweenHorizontalEnd,
  colBefore: BetweenVerticalStart, colAfter: BetweenVerticalEnd,
  deleteRow: Rows3, deleteCol: Columns3, merge: TableCellsMerge, split: TableCellsSplit, header: Heading,
  // ציור
  rectangle: RectangleHorizontal, textBox: TextCursorInput, move: Move, pen: Pen, line: Slash, arrow: MoveUpRight, rect: Square, ellipse: Circle, eraser: Eraser, taller: ArrowDownToLine,
  pointer: MousePointer2, dashed: SquareDashed, fill: PaintBucket,
  // 8.3: מיזוג ופירוק של שרטוטים, סדר ציור, וקבוצות הרשות בסרגל
  group: Group, ungroup: Ungroup, toFront: BringToFront, toBack: SendToBack,
  clearFormat: RemoveFormatting, codeBlock: SquareCode,
  pin: Pin, pinOff: PinOff, // 8.5: נעיצת כרטיסייה ומסמך למסך הבית
  archive: Archive, archiveRestore: ArchiveRestore,
};

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const toSvg = (node) => node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}/>`).join('');
const cache = {};

export function icon(name, size = 18) {
  const inner = cache[name] ??= toSvg(ICONS[name] || []);
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

// ===== כל הסט של Lucide: סמלים שהמשתמש בוחר לתיקיות ולמסמכים (כמו Iconize באובסידיאן) =====
// השם נשמר כמו בספרייה (PascalCase, למשל "BookOpen"). כ־1,950 סמלים, כ־750KB בבנייה.
import { icons as ALL_ICONS } from 'lucide';
const anyCache = {};
export const hasLucide = (name) => !!ALL_ICONS[name];
export function lucide(name, size = 16) {
  const node = ALL_ICONS[name];
  if (!node) return '';
  const inner = anyCache[name] ??= toSvg(node);
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
// לחיפוש בבורר: השם במילים קטנות ("book open")
let names = null;
export function lucideNames() {
  return names ??= Object.keys(ALL_ICONS).map((n) => ({ name: n, words: n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').toLowerCase() }));
}
