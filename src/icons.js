// סט אייקונים אחיד (SVG בקו, 24×24, בצבע הטקסט). שימוש: icon('table') מחזיר מחרוזת SVG.
const PATHS = {
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  bullets: '<path d="M10 6h10M10 12h10M10 18h10"/><circle cx="5" cy="6" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="5" cy="18" r="1.2" fill="currentColor"/>',
  numbers: '<path d="M11 6h9M11 12h9M11 18h9"/><path d="M4 4.5 5.5 4v4"/><path d="M4 11.2c.3-.7 2.6-.9 2.6.4 0 1-2.6 1.6-2.6 2.9h2.7"/><path d="M4 16.4c.5-.6 2.5-.7 2.5.6 0 .7-.8.8-1.3.8.6 0 1.5.1 1.5.9 0 1.3-2.2 1.3-2.7.6"/>',
  tasks: '<rect x="3.5" y="4" width="6" height="6" rx="1.5"/><path d="m5 7 1.2 1.2L8.3 6"/><rect x="3.5" y="14" width="6" height="6" rx="1.5"/><path d="M13 7h8M13 17h8"/>',
  quote: '<path d="M4 17c2-1 3-3 3-5V7H4v5h3"/><path d="M13 17c2-1 3-3 3-5V7h-3v5h3"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>',
  alignRight: '<path d="M21 6H3M21 12H9M21 18H6"/>',
  alignCenter: '<path d="M21 6H3M17 12H7M19 18H5"/>',
  alignLeft: '<path d="M3 6h18M3 12h12M3 18h15"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M10 4v16"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  draw: '<path d="M15.5 4.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/><path d="m13.5 6.5 3 3"/>',
  rule: '<path d="M3 12h18"/><path d="M3 7h2M8 7h2M13 7h2M18 7h3M3 17h2M8 17h2M13 17h2M18 17h3" opacity=".45"/>',
  highlight: '<path d="m14 4 6 6-8 8H6v-6z"/><path d="M3 21h9"/>',
  markdown: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M6 15V9l2.5 3L11 9v6"/><path d="M16 9v6m-2.2-2.2L16 15l2.2-2.2"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/>',
  folderPlus: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/><path d="M12 10v6M9 13h6"/>',
  vault: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/><path d="m10 14 2-2 2 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  insert: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
  check: '<path d="m5 12 5 5 9-9"/>',
};

export function icon(name, size = 18) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}
