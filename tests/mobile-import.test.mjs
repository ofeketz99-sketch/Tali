import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { importPlan, decodeText, docxToMarkdown, docxXmlToMarkdown, freePath } from '../mobile/src/import-file.js';

// ZIP מינימלי (deflate) כמו ש־Word כותב
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

const P = (text, extra = '') => `<w:p>${extra ? `<w:pPr>${extra}</w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

test('import plan: every phone file becomes something the vault shows', () => {
  assert.deepEqual(importPlan('טיול צנרת.md'), { kind: 'text', path: 'טיול צנרת.md' });
  assert.deepEqual(importPlan('טיול צנרת.markdown'), { kind: 'text', path: 'טיול צנרת.md' });
  assert.deepEqual(importPlan('טיול צנרת.txt'), { kind: 'text', path: 'טיול צנרת.md' });
  assert.deepEqual(importPlan('עבודה/טיול צנרת.docx'), { kind: 'docx', path: 'עבודה/טיול צנרת.md' });
  assert.deepEqual(importPlan('לוח.canvas'), { kind: 'text', path: 'לוח.canvas' });
  assert.deepEqual(importPlan('IMG_1.JPG'), { kind: 'image', path: 'IMG_1.JPG' });
  assert.deepEqual(importPlan('הודעה', 'text/plain'), { kind: 'text', path: 'הודעה.md' });
  assert.equal(importPlan('דוח.pdf').skip, 'pdf');
  assert.equal(importPlan('ישן.doc').skip, 'doc');
  assert.equal(importPlan('.obsidian/app.json').skip, 'hidden');
  assert.equal(importPlan('archive.zip').skip, 'type');
});

test('text decoding: UTF-8 with BOM, and old Windows Hebrew', () => {
  assert.equal(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from('שלום')])), 'שלום');
  // "שלום" ב־windows-1255
  assert.equal(decodeText(new Uint8Array([0xf9, 0xec, 0xe5, 0xed])), 'שלום');
});

test('docx becomes Markdown: headings, bold, lists, tables', async () => {
  const xml = `<?xml version="1.0"?><w:document><w:body>
    ${P('טיול צנרת', '<w:pStyle w:val="Title"/>')}
    ${P('מסלול', '<w:pStyle w:val="Heading1"/>')}
    <w:p><w:r><w:t>קטע </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>חשוב</w:t></w:r><w:r><w:t> &amp; עוד</w:t></w:r></w:p>
    ${P('צינור א', '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')}
    ${P('ברז', '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>')}
    <w:p/>
    <w:tbl><w:tr><w:tc>${P('נקודה')}</w:tc><w:tc>${P('לחץ')}</w:tc></w:tr><w:tr><w:tc>${P('1')}</w:tc><w:tc>${P('3|4')}</w:tc></w:tr></w:tbl>
  </w:body></w:document>`;
  const expected = '# טיול צנרת\n\n## מסלול\n\nקטע **חשוב** & עוד\n\n- צינור א\n  - ברז\n\n| נקודה | לחץ |\n| --- | --- |\n| 1 | 3\\|4 |\n';
  assert.equal(docxXmlToMarkdown(xml), expected);
  assert.equal(await docxToMarkdown(zip({ '[Content_Types].xml': '<x/>', 'word/document.xml': xml })), expected);
});

test('import never overwrites an existing document', () => {
  const taken = new Set(['טיול צנרת.md', 'טיול צנרת 1.md']);
  assert.equal(freePath('טיול צנרת.md', taken), 'טיול צנרת 2.md');
  assert.equal(freePath('חדש.md', taken), 'חדש.md');
});
