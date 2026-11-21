import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCanvas, serializeCanvas, bestSides, nearestSide, edgeGeometry, drawingNode, scaleDrawing, vaultRelative, colorValue, isDrawing, boundsOf, eraseDrawing,
} from '../src/canvas-doc.js';

test('the eraser removes only the pen stroke it touches, and a shape when it touches its outline', () => {
  const pen = drawingNode({ kind: 'pen', points: [[[0, 0], [100, 0]], [[0, 50], [100, 50]]], width: 3 });
  const left = eraseDrawing(pen, { x: 50, y: 1 }, 4);
  assert.equal(left.id, pen.id);
  assert.equal(left.taliDrawing.strokes.length, 1);
  assert.equal(eraseDrawing(pen, { x: 50, y: 25 }, 4), null); // between the strokes
  assert.equal(eraseDrawing(left, { x: 50, y: 50 }, 4), 'remove'); // last stroke
  const rect = drawingNode({ kind: 'rect', points: [[0, 0], [100, 60]], width: 3 });
  assert.equal(eraseDrawing(rect, { x: 50, y: 30 }, 4), null); // inside, away from the outline
  assert.equal(eraseDrawing(rect, { x: 50, y: 0 }, 4), 'remove');
  const text = { id: 't', type: 'text', text: 'x', x: 0, y: 0, width: 100, height: 100 };
  assert.equal(eraseDrawing(text, { x: 10, y: 10 }, 4), null); // cards are never erased
});

test('an Obsidian canvas is read and written back without losing unknown fields', () => {
  const src = JSON.stringify({
    nodes: [
      { id: 'a', type: 'text', text: 'שלום', x: 0, y: 0, width: 250, height: 60, color: '4', styleAttributes: { shape: 'pill' } },
      { id: 'g', type: 'group', label: 'קבוצה', x: -20, y: -20, width: 600, height: 300 },
      { id: 'b', type: 'file', file: 'attachments/img.png', x: 300, y: 0, width: 200, height: 100 },
    ],
    edges: [{ id: 'e', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left', label: 'כי' }, { id: 'x', fromNode: 'a', toNode: 'missing' }],
    metadata: { version: '1.0' },
  });
  const { doc, error } = parseCanvas(src);
  assert.equal(error, null);
  assert.equal(doc.edges.length, 1); // the edge to a missing node is dropped
  assert.deepEqual(doc.nodes[0].styleAttributes, { shape: 'pill' });
  const back = JSON.parse(serializeCanvas(doc));
  assert.deepEqual(back.metadata, { version: '1.0' });
  assert.equal(back.nodes[0].type, 'group'); // groups are written first, so they are drawn behind
  assert.equal(back.edges[0].label, 'כי');
  assert.match(serializeCanvas(doc), /\n\t"nodes"/); // tabs, like Obsidian
});

test('an empty or broken file opens as an empty canvas', () => {
  assert.deepEqual(parseCanvas('').doc, { nodes: [], edges: [] });
  const bad = parseCanvas('{ not json');
  assert.ok(bad.error);
  assert.deepEqual(bad.doc.nodes, []);
  const dup = parseCanvas(JSON.stringify({ nodes: [{ id: 'a', type: 'text', x: 0, y: 0 }, { id: 'a', type: 'weird', x: 5, y: 5 }] })).doc;
  assert.notEqual(dup.nodes[0].id, dup.nodes[1].id);
  assert.equal(dup.nodes[1].type, 'text');
  assert.equal(dup.nodes[0].width, 250);
});

test('edges leave from the sides that face each other', () => {
  const a = { x: 0, y: 0, width: 100, height: 50 };
  assert.deepEqual(bestSides(a, { x: 300, y: 0, width: 100, height: 50 }), ['right', 'left']);
  assert.deepEqual(bestSides(a, { x: 0, y: 300, width: 100, height: 50 }), ['bottom', 'top']);
  assert.deepEqual(bestSides(a, { x: -300, y: 10, width: 100, height: 50 }), ['left', 'right']);
  assert.equal(nearestSide(a, { x: 50, y: -10 }), 'top');
  const doc = { nodes: [{ id: 'a', ...a }, { id: 'b', x: 300, y: 0, width: 100, height: 50 }], edges: [] };
  const g = edgeGeometry(doc, { fromNode: 'a', toNode: 'b' });
  assert.deepEqual(g.from, { x: 100, y: 25 });
  assert.deepEqual(g.to, { x: 300, y: 25 });
  assert.match(g.d, /^M 100 25 C /);
  assert.equal(edgeGeometry(doc, { fromNode: 'a', toNode: 'zz' }), null);
});

test('a drawing is stored as a group node that Obsidian keeps, with points relative to its box', () => {
  const n = drawingNode({ kind: 'line', points: [[100, 100], [200, 150]], color: '#ff0000', width: 4 });
  assert.equal(n.type, 'group');
  assert.ok(isDrawing(n));
  assert.equal(n.x, 100 - 4);
  assert.deepEqual(n.taliDrawing.points[0], [4, 4]);
  const pen = drawingNode({ kind: 'pen', points: [[[0, 0], [10, 10]], [[20, 0], [30, 5]]] });
  assert.equal(pen.taliDrawing.strokes.length, 2);
  const big = scaleDrawing(n, n.width * 2, n.height);
  assert.deepEqual(big.taliDrawing.points[1], [n.taliDrawing.points[1][0] * 2, n.taliDrawing.points[1][1]]);
  assert.equal(isDrawing({ type: 'group', label: 'x' }), false);
});

test('helpers: vault paths, colors, bounds', () => {
  assert.equal(vaultRelative('C:\\Vault', 'C:\\Vault\\attachments\\a.png'), 'attachments/a.png');
  assert.equal(vaultRelative('C:/Vault/', 'D:/other/a.png'), 'D:/other/a.png');
  assert.equal(colorValue('1'), '#e5484d');
  assert.equal(colorValue('#123456'), '#123456');
  assert.equal(colorValue('nope'), null);
  assert.deepEqual(boundsOf([{ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: -5, width: 5, height: 5 }]), { x: 0, y: -5, width: 25, height: 15 });
  assert.equal(boundsOf([]), null);
});
