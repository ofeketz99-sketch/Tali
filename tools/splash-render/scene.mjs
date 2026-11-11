// Tali splash: offline 3D render of the book sequence.
//
// Every output frame is the average of N sub-frames. Each sub-frame jitters
//   - time inside a 180° shutter        -> true motion blur
//   - the key light over a disk         -> soft area-light shadows
//   - one shadowed "sky" direction      -> ambient occlusion / contact shadows
//   - the lens over an aperture         -> real depth of field
//   - the sub-pixel projection          -> anti-aliasing
// The accumulation is linear HDR; the composite pass tone-maps, runs the book-to-logo
// flood in sRGB (so it lands exactly on the CSS colour), dithers and encodes.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Muxer, ArrayBufferTarget } from '../../node_modules/webm-muxer/build/webm-muxer.mjs';
import { pageCanvas, bumpCanvas, edgeCanvas } from './pages.mjs';
const fs = require('fs'), path = require('path');

// ---------- Brand + timing (the runtime in src/splash.js uses the same numbers) ----------
export const FINAL_BG = '#aac7f2';      // full-screen identity blue; also --splash-bg
export const EMBLEM_FRACTION = 0.56;     // emblem image size / frame height in the final frame
const W = 1920, H = 1080, FPS = 60;
// PRE: an opening settle on the macro page (rack focus + slight drift) before anything turns.
// The runtime fades the video in over it, starting on the first decoded frame.
const PRE = 0.9;
const DURATION = 4.3 + PRE;              // the video; the native logo hold + fade follows
const FOV = 30;

// ---------- small math helpers ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const lin = (t, a, b) => clamp((t - a) / (b - a));
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const smoother = t => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
const easeOut = (t, p = 3) => 1 - Math.pow(1 - clamp(t), p);
const sRGBToLin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };

// ---------- book dimensions (world units; the open book is ~2 units wide) ----------
const T = 0.042;         // board thickness
const PH = 1.0;          // page height (z)
const PL = 1.0;          // leaf length, spine to fore-edge (arc length)
const BLOCK = 0.1;       // page block height per half
const LAMBDA = 0.095;    // gutter curl length
const NS = 90, NZ = 26;  // leaf tessellation
const NT = 9;            // leaves that turn
const DELTA = 0.0016;    // spacing between stacked leaves
const COVER_R = 0.12;    // board corner radius (outer)
const COVER_ALBEDO = '#9ec1f2';
const CROP = 0.12;       // the printed emblem uses the central 76% of the icon image
const BOARD_PAD = 0.032; // board overhang beyond the pages

// Rest profile of the top leaf of a half (right side; the left side is its mirror).
// c = 0: open book with a deep curved gutter; c = 1: flattened for closing.
function restProfile(c) {
  const yTop = T + BLOCK, yRoot = T + 0.006 + c * (BLOCK - 0.006);
  const ds = PL / NS;
  const yAt = s => yRoot + (yTop - yRoot) * (1 - Math.exp(-s / LAMBDA)) + (1 - c) * 0.011 * Math.sin(Math.PI * s / PL)
    - (s > PL - 0.07 ? 0.005 * ((s - (PL - 0.07)) / 0.07) ** 2 : 0);
  const a = new Float64Array(NS + 1), x = new Float64Array(NS + 1), y = new Float64Array(NS + 1);
  for (let k = 0; k <= NS; k++) {
    const s = k * ds, e = 1e-4;
    a[k] = Math.asin(clamp((yAt(s + e) - yAt(Math.max(0, s - e))) / (s > e ? 2 * e : e + s), -0.95, 0.95));
  }
  y[0] = yRoot;
  for (let k = 0; k < NS; k++) {
    const am = (a[k] + a[k + 1]) / 2;
    x[k + 1] = x[k] + Math.cos(am) * ds; y[k + 1] = y[k] + Math.sin(am) * ds;
  }
  return { a, x, y, yRoot, xEnd: x[NS] };
}

// ---------- leaf geometry (CPU-deformed every sub-frame) ----------
function makeLeafGeometry() {
  const geo = new THREE.BufferGeometry();
  const n = (NS + 1) * (NZ + 1);
  const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
  const uvF = new Float32Array(n * 2), uvB = new Float32Array(n * 2);
  for (let j = 0; j <= NZ; j++) for (let k = 0; k <= NS; k++) {
    const i = j * (NS + 1) + k;
    uvF[i * 2] = k / NS; uvF[i * 2 + 1] = 1 - j / NZ;
    uvB[i * 2] = 1 - k / NS; uvB[i * 2 + 1] = 1 - j / NZ;
  }
  const idx = [];
  for (let j = 0; j < NZ; j++) for (let k = 0; k < NS; k++) {
    const a = j * (NS + 1) + k, b = a + 1, c = a + NS + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  geo.setIndex(idx);
  geo.setAttribute('position', pos);
  geo.setAttribute('uv', new THREE.BufferAttribute(uvF, 2));
  const back = new THREE.BufferGeometry();
  back.setIndex(idx); back.setAttribute('position', pos); back.setAttribute('uv', new THREE.BufferAttribute(uvB, 2));
  return { front: geo, back };
}

// Leaf shape for turn progress p (0 = lying right, 1 = lying left).
// Each strip along z blends from the right rest angle a(s) to the mirrored left angle
// pi - a(s) with a lag that grows toward the fore-edge, so the spine side leads, the
// free edge trails and the sheet bends; the lag also differs between top and bottom
// corners so the leaf twists slightly like real paper.
function shapeLeaf(leaf, prof, p, offR, offL, lagBase, twist) {
  const pos = leaf.geo.front.attributes.position;
  const arr = pos.array, ds = PL / NS;
  for (let j = 0; j <= NZ; j++) {
    const zn = j / NZ - 0.5, z = zn * PH;
    const D = lagBase + twist * zn;
    let x = 0, y = prof.yRoot, prev = null;
    for (let k = 0; k <= NS; k++) {
      const u = k / NS;
      const w = smooth(p * (1 + D) - D * Math.pow(u, 1.35));
      const ang = mix(prof.a[k], Math.PI - prof.a[k], w);
      if (k > 0) { const am = (ang + prev) / 2; x += Math.cos(am) * ds; y += Math.sin(am) * ds; }
      prev = ang;
      const off = mix(offR, offL, w);
      const i = (j * (NS + 1) + k) * 3;
      arr[i] = x; arr[i + 1] = y + off; arr[i + 2] = z;
    }
  }
  pos.needsUpdate = true;
  leaf.geo.front.computeVertexNormals();
  leaf.geo.back.attributes.normal = leaf.geo.front.attributes.normal;
  leaf.geo.front.computeBoundingSphere(); leaf.geo.back.boundingSphere = leaf.geo.front.boundingSphere;
}

// ---------- page block (curved top following the rest profile, page-edge walls) ----------
function buildBlock(geo, prof, side) {
  const xEnd = prof.xEnd, r = 0.045, zh = PH / 2;
  const outline = [];
  const push = (x, z) => outline.push([x, z]);
  for (let x = 0.002; x < xEnd - r; x += 0.01) push(x, -zh);
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i / 10 * Math.PI / 2; push(xEnd - r + Math.cos(a) * r, -zh + r + Math.sin(a) * r); }
  for (let z = -zh + r + 0.04; z < zh - r; z += 0.04) push(xEnd, z);
  for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI / 2; push(xEnd - r + Math.cos(a) * r, zh - r + Math.sin(a) * r); }
  for (let x = xEnd - r - 0.01; x > 0.002; x -= 0.01) push(x, zh);
  push(0.002, zh);
  for (let z = zh - 0.04; z > -zh; z -= 0.04) push(0.002, z);
  const topY = x => {
    if (x <= prof.x[0]) return prof.y[0] - 0.0025;
    let k = 1; while (k < NS && prof.x[k] < x) k++;
    const t = (x - prof.x[k - 1]) / (prof.x[k] - prof.x[k - 1]);
    return mix(prof.y[k - 1], prof.y[k], t) - 0.0025;
  };
  const verts = [], uvs = [], idx = [];
  // Top (hidden by the leaf; concave profile keeps linear triangles below it).
  const tri = THREE.ShapeUtils.triangulateShape(outline.map(([x, z]) => new THREE.Vector2(x, z)), []);
  outline.forEach(([x, z]) => { verts.push(x, topY(x), z); uvs.push(0.5, 0.98); });
  tri.forEach(t => idx.push(t[0], t[2], t[1]));
  // Walls.
  let run = 0;
  for (let i = 0; i < outline.length; i++) {
    const [x0, z0] = outline[i], [x1, z1] = outline[(i + 1) % outline.length];
    const len = Math.hypot(x1 - x0, z1 - z0), b = verts.length / 3;
    verts.push(x0, T, z0, x1, T, z1, x1, topY(x1), z1, x0, topY(x0), z0);
    uvs.push(run, 0, run + len, 0, run + len, 1, run, 1);
    run += len;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const v = new Float32Array(verts);
  if (side < 0) for (let i = 0; i < v.length; i += 3) v[i] = -v[i];
  if (side < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
}

function boardGeometry(width, side) {
  // Rounded board: outer corners soft, spine-side corners nearly square, bevelled edges.
  // Shape is drawn in (x, z); the shape is symmetric in z so the -z flip of rotateX is harmless.
  const hz = PH / 2 + BOARD_PAD, R = COVER_R, r = 0.02, s = new THREE.Shape(), X = v => v * side;
  s.moveTo(X(r), -hz);
  s.lineTo(X(width - R), -hz); s.quadraticCurveTo(X(width), -hz, X(width), -hz + R);
  s.lineTo(X(width), hz - R); s.quadraticCurveTo(X(width), hz, X(width - R), hz);
  s.lineTo(X(r), hz); s.quadraticCurveTo(0, hz, 0, hz - r);
  s.lineTo(0, -hz + r); s.quadraticCurveTo(0, -hz, X(r), -hz);
  const bev = 0.011;
  const g = new THREE.ExtrudeGeometry(s, { depth: T - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * .9, bevelSegments: 6, curveSegments: 28 });
  g.rotateX(-Math.PI / 2);         // extrusion -> +y
  g.translate(0, bev, 0);
  g.computeVertexNormals();
  return g;
}

// Spine: a half-tube whose diameter runs from the left board's spine edge to the
// right board's spine edge, so it opens flat and rounds out as the book closes.
function buildSpine(geo, A, B) {
  const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy), r = len / 2;
  const hz = PH / 2 + BOARD_PAD - 0.01, K = 28, verts = [], idx = [];
  if (r < 0.004) { geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)); geo.setIndex([0, 1, 2]); return false; }
  const dh = { x: dx / len, y: dy / len }, n = { x: dh.y, y: -dh.x }, C = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const ri = Math.max(0.0, r - T * 0.9);
  const ring = rad => Array.from({ length: K + 1 }, (_, k) => { const th = k / K * Math.PI; return [C.x - rad * Math.cos(th) * dh.x + rad * Math.sin(th) * n.x, C.y - rad * Math.cos(th) * dh.y + rad * Math.sin(th) * n.y]; });
  const out = ring(r), inn = ring(ri);
  const add = (p, z) => { verts.push(p[0], p[1], z); return verts.length / 3 - 1; };
  for (let k = 0; k < K; k++) {
    const a = add(out[k], -hz), b = add(out[k + 1], -hz), c = add(out[k + 1], hz), d = add(out[k], hz);
    idx.push(a, b, c, a, c, d);
    const e = add(inn[k], -hz), f = add(inn[k + 1], -hz), g2 = add(inn[k + 1], hz), h = add(inn[k], hz);
    idx.push(e, g2, f, e, h, g2);
    for (const z of [-hz, hz]) { const p = add(out[k], z), q = add(out[k + 1], z), s = add(inn[k + 1], z), t = add(inn[k], z); if (z < 0) idx.push(p, s, q, p, t, s); else idx.push(p, q, s, p, s, t); }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
  return true;
}

// ---------- the timeline ----------
// Leaves: thumbed quickly, then slowing to a stop before the cover closes.
const TURN_START = [0.40, 0.57, 0.72, 0.86, 0.99, 1.13, 1.30, 1.52, 1.82];
const TURN_DUR = [0.64, 0.6, 0.56, 0.55, 0.56, 0.58, 0.63, 0.72, 0.86];
const turnP = (t, i) => { const u = lin(t, TURN_START[i], TURN_START[i] + TURN_DUR[i]); return 0.5 - 0.5 * Math.cos(Math.PI * Math.pow(u, 0.82)); };
const closeFlat = t => smoother(lin(t, 2.72, 3.25));
const closeAngle = t => smoother(lin(t, 2.80, 3.45));
const thickness = t => mix(1, 0.12, smoother(lin(t, 3.45, 3.95)));
const flood = t => smoother(lin(t, 3.6, 4.12));

function cameraAt(t, decalCenter, finalDist) {
  // Macro on the hero leaf -> continuous pull-back revealing the book -> follow the
  // closing cover -> straight overhead so the cover becomes the logo plane.
  const pull = smooth(lin(t, 0.25, 2.8));
  const pullE = pull;
  const macroT = new THREE.Vector3(0.48, T + BLOCK + 0.01, -0.12);
  const bookT = new THREE.Vector3(0.0, 0.06, 0.04);
  const target = macroT.clone().lerp(bookT, smoother(lin(t, 0.35, 2.6)));
  let dist = Math.exp(mix(Math.log(0.95), Math.log(2.95), pullE));
  let el = mix(60, 46, smoother(lin(t, 0.3, 2.7)));
  let az = mix(9, 0, smoother(lin(t, 0.3, 2.6)));
  let roll = mix(-3, 0, smoother(lin(t, 0.2, 2.4)));
  const follow = smoother(lin(t, 2.85, 3.75));
  target.lerp(decalCenter, follow);
  dist = Math.exp(mix(Math.log(dist), Math.log(finalDist), smoother(lin(t, 2.95, 3.95))));
  el = mix(el, 90, smoother(lin(t, 3.05, 3.95)));
  const aperture = mix(0.0035, 0.0012, smoother(lin(t, 0.3, 2.4))) * (1 - smoother(lin(t, 3.0, 3.8)));
  return { target, dist, el, az, roll, aperture };
}

// ---------- scene construction ----------
function canvasTexture(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function buildScene(renderer, emblemCanvas) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;

  const table = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#bad2f5', roughness: 0.95 }));
  table.rotation.x = -Math.PI / 2; table.receiveShadow = true; scene.add(table);

  const book = new THREE.Group(); scene.add(book);
  const left = new THREE.Group(); book.add(left);
  const rightPivot = new THREE.Group(); book.add(rightPivot);
  const right = new THREE.Group(); rightPivot.add(right);

  const coverMat = new THREE.MeshPhysicalMaterial({ color: COVER_ALBEDO, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.45, sheen: 0.4, sheenRoughness: 0.6, sheenColor: '#e6efff' });
  const edgeTex = canvasTexture(edgeCanvas()); edgeTex.wrapS = THREE.RepeatWrapping;
  const blockMat = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.9, color: '#ffffff', side: THREE.DoubleSide });
  const prof0 = restProfile(0);
  const boardW = prof0.xEnd + BOARD_PAD;
  const mk = (geo, mat, parent) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  mk(boardGeometry(boardW, -1), coverMat, left);
  mk(boardGeometry(boardW, 1), coverMat, right);
  const blockL = mk(new THREE.BufferGeometry(), blockMat, left);
  const blockR = mk(new THREE.BufferGeometry(), blockMat, right);
  const spine = mk(new THREE.BufferGeometry(), coverMat, book);

  // Leaves. Right-hand fronts in order of appearance, backs as they land on the left.
  const bump = canvasTexture(bumpCanvas(1024, 3), false); bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  const leafMat = (canvas, side) => new THREE.MeshStandardMaterial({ map: canvasTexture(canvas), alphaTest: 0.5, side, roughness: 0.88, bumpMap: bump, bumpScale: 0.35 });
  const fronts = ['hero', 'donut', 'list', 'chart', 'diagram', 'bars', 'list', 'donut', 'chart'];
  const backs = ['chart', 'bars', 'diagram', 'list', 'donut', 'chart', 'diagram', 'bars', 'list'];
  const leaves = [];
  const addLeaf = (front, back, seed, parent, big) => {
    const geo = makeLeafGeometry();
    const leaf = { geo, seed };
    leaf.front = mk(geo.front, leafMat(pageCanvas(big ? 2048 : 1024, front, seed, false), THREE.FrontSide), parent);
    leaf.back = mk(geo.back, leafMat(pageCanvas(1024, back, seed + 50, true), THREE.BackSide), parent);
    return leaf;
  };
  for (let i = 0; i < NT; i++) leaves.push(Object.assign(addLeaf(fronts[i], backs[i], i + 1, book, i === 0), { r: rng(i * 31 + 7) }));
  leaves.forEach(l => { l.lag = 0.3 + l.r() * 0.16; l.twist = (l.r() - 0.4) * 0.28; });
  const staticR = addLeaf('bars', 'list', 40, right, false);
  const staticL = addLeaf('list', 'diagram', 41, left, false);
  // Static leaves on the left lie as a turned leaf (p = 1).

  // Emblem printed on the outside of the right board (faces up once the book is closed).
  // The print is opaque: the emblem composited over the cover's own albedo, on the same
  // material, so the print's edges are invisible and only the ribbon reads.
  const decalSize = boardW / 0.8;                 // the icon's rounded square spans 80% of the image
  const N = emblemCanvas.width, c0 = Math.round(N * CROP), cw = N - 2 * c0;
  const print = new OffscreenCanvas(cw, cw), pg = print.getContext('2d');
  pg.fillStyle = COVER_ALBEDO; pg.fillRect(0, 0, cw, cw); pg.drawImage(emblemCanvas, c0, c0, cw, cw, 0, 0, cw, cw);
  const printTex = canvasTexture(print);
  const decalGeo = new THREE.PlaneGeometry(decalSize * (1 - 2 * CROP), decalSize * (1 - 2 * CROP)); decalGeo.rotateX(Math.PI / 2); decalGeo.rotateY(Math.PI);
  const decalMat = coverMat.clone(); decalMat.color.set('#ffffff'); decalMat.map = printTex;
  Object.assign(decalMat, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const decal = new THREE.Mesh(decalGeo, decalMat);
  decal.position.set(boardW / 2, -0.0006, 0); decal.receiveShadow = true;
  right.add(decal);
  const emblemTex = null;

  // Lights: shadowed key (jittered over an area) + shadowed sky sample.
  const shadowSetup = l => {
    l.castShadow = true; l.shadow.mapSize.set(4096, 4096);
    Object.assign(l.shadow.camera, { left: -1.9, right: 1.9, top: 1.9, bottom: -1.9, near: 0.5, far: 14 });
    l.shadow.bias = -0.0002; l.shadow.normalBias = 0.0025; l.shadow.radius = 1.5;
    scene.add(l); scene.add(l.target);
  };
  const key = new THREE.DirectionalLight('#fff8ef', 2.5); shadowSetup(key);
  const sky = new THREE.DirectionalLight('#e2ebfc', 1.9); shadowSetup(sky);

  const state = { book, left, right, rightPivot, blockL, blockR, spine, leaves, staticR, staticL, decal, decalSize, boardW, key, sky, emblemTex, table };
  return { scene, state };
}

const yAxis = T + BLOCK + (NT + 1) * DELTA * 0.5 + DELTA * 0.5;

function poseScene(st, t) {
  const c = closeFlat(t), prof = restProfile(c);
  buildBlock(st.blockL.geometry, prof, -1);
  buildBlock(st.blockR.geometry, prof, 1);
  shapeLeaf(st.staticR, prof, 0, 0, 0, 0.7, 0);
  shapeLeaf(st.staticL, prof, 1, 0, 0, 0.7, 0);
  st.leaves.forEach((leaf, i) => {
    const p = turnP(t, i);
    shapeLeaf(leaf, prof, p, (NT - i) * DELTA, (i + 1) * DELTA, leaf.lag, leaf.twist);
  });
  // Close: the right half (board + block + its top leaf) swings over the spine.
  const phi = Math.PI * closeAngle(t);
  st.rightPivot.position.set(0, yAxis, 0);
  st.right.position.set(0, -yAxis, 0);
  st.rightPivot.rotation.z = phi;
  const A = new THREE.Vector2(0, 0.0), B = new THREE.Vector2(yAxis * Math.sin(phi), yAxis * (1 - Math.cos(phi)));
  st.spine.visible = buildSpine(st.spine.geometry, A, B);
  st.book.scale.y = thickness(t);
  st.book.updateMatrixWorld(true);
}

function placeCamera(camera, cam, lensDx, lensDy, jx, jy) {
  const el = THREE.MathUtils.degToRad(cam.el), az = THREE.MathUtils.degToRad(cam.az), roll = THREE.MathUtils.degToRad(cam.roll || 0);
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const up = new THREE.Vector3(-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el));
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  // Roll the up vector around the view axis (instead of rotating afterwards).
  up.applyAxisAngle(dir, roll); right.applyAxisAngle(dir, roll);
  // Thin lens: the eye moves on the aperture disk, the focus plane stays on the target.
  camera.position.copy(cam.target).addScaledVector(dir, cam.dist).addScaledVector(right, lensDx).addScaledVector(up, lensDy);
  camera.up.copy(up);
  camera.lookAt(cam.target);
  camera.setViewOffset(W, H, jx, jy, W, H);
  camera.updateMatrixWorld(true);
}

// 4-point homography (unit square uv -> pixel), returned inverted for the shader.
function homographyInv(px) {
  const src = [[0, 0], [1, 0], [1, 1], [0, 1]], A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i], [x, y] = px[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  for (let c = 0; c < 8; c++) { // Gaussian elimination
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const h = b.map((v, i) => v / A[i][i]);
  const M = new THREE.Matrix3().set(h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1);
  return M.invert();
}

const COMPOSITE_FS = /* glsl */`
precision highp float;
uniform sampler2D tAccum; uniform sampler2D tEmblem;
uniform float crop, invN, exposure, fadeIn, floodR, floodF, emblemOn, vignette, frame;
uniform vec3 flatColor; uniform mat3 hInv; uniform vec2 res; uniform vec4 coverBox; // half-size uv, radius uv
varying vec2 vUv;
vec3 neutral(vec3 color) { // Khronos PBR Neutral
  const float startCompression = 0.8 - 0.04, desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1. - startCompression;
  float newPeak = 1. - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1. - 1. / (desaturation * (peak - newPeak) + 1.);
  return mix(color, vec3(newPeak), g);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + frame * 0.618) * 43758.5453); }
void main() {
  vec2 px = vec2(vUv.x, 1. - vUv.y) * res;
  vec3 hdr = texture2D(tAccum, vUv).rgb * invN * exposure;
  vec3 col = toSRGB(clamp(neutral(hdr), 0., 1.));
  vec2 c = vUv - 0.5; c.x *= res.x / res.y;
  col *= 1. - vignette * smoothstep(0.35, 1.25, length(c));
  // Flat identity layer: brand blue + the emblem mapped exactly onto the cover's decal.
  vec3 h = hInv * vec3(px, 1.); vec2 uv = crop + (h.xy / h.z) * (1. - 2. * crop);
  vec3 flatCol = flatColor;
  float m = 0.;
  if (emblemOn > 0.5 && h.z > 0.) {
    if (all(greaterThanEqual(uv, vec2(0.))) && all(lessThanEqual(uv, vec2(1.)))) {
      vec4 e = texture2D(tEmblem, uv);
      flatCol = flatCol * (1. - e.a) + e.rgb;
    }
    vec2 q = abs(uv - 0.5) - coverBox.xy + coverBox.z;
    float sdf = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - coverBox.z;
    m = 1. - smoothstep(-floodF, floodF, sdf - floodR);
  }
  col = mix(col, flatCol, m);
  col = mix(flatColor, col, fadeIn);
  col += (hash(px) + hash(px + 17.3) - 1.) / 255.;
  gl_FragColor = vec4(col, 1.);
}`;

export async function run(args, { emblem, ROOT }) {
  const mode = args[0];
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; document.body.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.autoClear = false;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  console.log('GPU: ' + renderer.getContext().getParameter(renderer.getContext().getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL));

  const { scene, state: st } = buildScene(renderer, emblem.canvas);
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.08, 40);
  const rtScene = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const rtAccum = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType });
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
  const addMat = new THREE.ShaderMaterial({ uniforms: { t: { value: rtScene.texture } }, vertexShader: VS, fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }', blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, depthTest: false, depthWrite: false, transparent: true });
  // The composite blends in sRGB, so it needs the emblem's raw (non-decoded) values.
  const rawEmblem = new THREE.CanvasTexture(emblem.canvas); rawEmblem.colorSpace = THREE.NoColorSpace; rawEmblem.premultiplyAlpha = true;
  const fc = new THREE.Color(FINAL_BG);
  const compMat = new THREE.ShaderMaterial({
    uniforms: {
      tAccum: { value: rtAccum.texture }, tEmblem: { value: rawEmblem }, crop: { value: CROP }, invN: { value: 1 }, exposure: { value: 1 },
      fadeIn: { value: 1 }, floodR: { value: -1 }, floodF: { value: .1 }, emblemOn: { value: 0 }, vignette: { value: .07 }, frame: { value: 0 },
      flatColor: { value: new THREE.Vector3(fc.r, fc.g, fc.b) }, hInv: { value: new THREE.Matrix3() }, res: { value: new THREE.Vector2(W, H) },
      coverBox: { value: new THREE.Vector4() },
    }, vertexShader: VS, fragmentShader: COMPOSITE_FS, depthTest: false, depthWrite: false,
  });
  // THREE.Color(FINAL_BG) converts to linear; the composite works in sRGB.
  compMat.uniforms.flatColor.value.set(...[1, 3, 5].map(i => parseInt(FINAL_BG.slice(i, i + 2), 16) / 255));
  const quad = new THREE.Mesh(quadGeo, addMat);
  const quadScene = new THREE.Scene(); quadScene.add(quad);

  // Cover box in decal uv: board footprint relative to the decal square.
  const hzB = PH / 2 + BOARD_PAD;
  compMat.uniforms.coverBox.value.set(0.5 * st.boardW / st.decalSize, hzB / st.decalSize, COVER_R / st.decalSize, 0);
  const finalDist = st.decalSize / (EMBLEM_FRACTION * 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));

  const decalCenter = () => st.decal.getWorldPosition(new THREE.Vector3());
  const keyBase = new THREE.Vector3(-0.62, 1.0, 0.72).normalize();

  async function renderFrame(vt, N) {
    const t = vt - PRE; // scene time; everything before 0 holds the opening pose
    const settle = 1 - smoother(lin(vt, 0, PRE + 0.5));
    renderer.setRenderTarget(rtAccum); renderer.setClearColor(0x000000, 0); renderer.clear();
    const shutter = 0.5 / FPS;
    for (let k = 0; k < N; k++) {
      const kt = (k * 7) % N, kl = (k * 13) % N, ks = (k * 11) % N;
      const tk = t + ((kt + 0.5) / N - 0.5) * shutter;
      poseScene(st, tk);
      const cam = cameraAt(tk, decalCenter(), finalDist);
      cam.aperture += 0.04 * settle * settle; cam.az += 4 * settle; cam.dist *= 1 + 0.06 * settle;
      // lens sample (golden-angle disk)
      const lr = Math.sqrt((kl + 0.5) / N) * cam.aperture, la = kl * 2.39996;
      placeCamera(camera, cam, Math.cos(la) * lr, Math.sin(la) * lr, halton(k + 1, 2) - 0.5, halton(k + 1, 3) - 0.5);
      // key light: area jitter
      const kr = Math.sqrt((ks + 0.5) / N) * 0.33, ka = ks * 2.39996 + 1.1;
      const kd = keyBase.clone().add(new THREE.Vector3(Math.cos(ka) * kr, 0, Math.sin(ka) * kr)).normalize();
      const centre = cam.target.clone(); centre.y = 0;
      st.key.position.copy(centre).addScaledVector(kd, 6); st.key.target.position.copy(centre);
      // sky: cosine-weighted hemisphere sample (Fibonacci), clipped at the horizon
      const u = (k + 0.5) / N, th = Math.min(Math.asin(Math.sqrt(u)), THREE.MathUtils.degToRad(76)), ph = k * 2.39996 + 0.4;
      const sd = new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
      st.sky.position.copy(centre).addScaledVector(sd, 6); st.sky.target.position.copy(centre);
      st.key.target.updateMatrixWorld(); st.sky.target.updateMatrixWorld();
      renderer.setRenderTarget(rtScene); renderer.setClearColor(0xc4d8f6, 1); renderer.clear();
      renderer.render(scene, camera);
      quad.material = addMat; renderer.setRenderTarget(rtAccum); renderer.render(quadScene, quadCam);
    }
    // Composite at the frame's central time.
    poseScene(st, t);
    const cam = cameraAt(t, decalCenter(), finalDist);
    placeCamera(camera, cam, 0, 0, 0, 0);
    const U = compMat.uniforms;
    U.invN.value = 1 / N; U.frame.value = Math.round(vt * FPS);
    U.exposure.value = 1.0;
    U.fadeIn.value = 1; // the fade-in happens in the runtime, synced to the first decoded frame
    const f = flood(t);
    U.emblemOn.value = t > 3.2 ? 1 : 0;
    U.floodR.value = mix(-0.55, 1.6, f); U.floodF.value = mix(0.06, 0.45, f);
    U.vignette.value = 0.07 * (1 - f);
    if (U.emblemOn.value) {
      const pos = st.decal.geometry.attributes.position, uv = st.decal.geometry.attributes.uv, corners = [];
      const want = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (const [wu, wv] of want) for (let i = 0; i < 4; i++) if (Math.abs(uv.getX(i) - wu) < 1e-6 && Math.abs(uv.getY(i) - wv) < 1e-6) {
        const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(st.decal.matrixWorld).project(camera);
        corners.push([(p.x * 0.5 + 0.5) * W, (1 - (p.y * 0.5 + 0.5)) * H]);
      }
      U.hInv.value.copy(homographyInv(corners));
    }
    quad.material = compMat; renderer.setRenderTarget(null); renderer.clear(); renderer.render(quadScene, quadCam);
  }

  const toPng = (file, scale = 1) => new Promise(res => {
    let src = canvas;
    if (scale !== 1) { src = document.createElement('canvas'); src.width = W * scale; src.height = H * scale; const g = src.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(canvas, 0, 0, src.width, src.height); }
    src.toBlob(async b => { fs.writeFileSync(file, Buffer.from(await b.arrayBuffer())); res(); }, 'image/png');
  });

  if (mode === 'preview') {
    const [, outDir, samples, times, scale] = args;
    fs.mkdirSync(outDir, { recursive: true });
    for (const ts of times.split(',')) {
      const t0 = performance.now();
      await renderFrame(+ts, +samples);
      renderer.getContext().finish();
      await toPng(path.join(outDir, `f_${(+ts).toFixed(2)}.png`), scale ? +scale : 0.5);
      console.log(`t=${ts} ${(performance.now() - t0).toFixed(0)}ms`);
    }
  } else if (mode === 'video') {
    const [, outFile, samples, checkDir] = args;
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'V_VP9', width: W, height: H, frameRate: FPS }, firstTimestampBehavior: 'offset' });
    let encErr = null;
    const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { encErr = e; } });
    const cfg = { codec: 'vp09.00.41.08', width: W, height: H, bitrate: 16e6, bitrateMode: 'variable', framerate: FPS, latencyMode: 'quality' };
    console.log('VP9 support: ' + JSON.stringify((await VideoEncoder.isConfigSupported(cfg)).supported));
    encoder.configure(cfg);
    const frames = Math.round(DURATION * FPS), t0 = performance.now();
    if (checkDir) fs.mkdirSync(checkDir, { recursive: true });
    for (let i = 0; i < frames; i++) {
      const t = i / FPS;
      await renderFrame(t, +samples);
      const vf = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      encoder.encode(vf, { keyFrame: i % 60 === 0 }); vf.close();
      while (encoder.encodeQueueSize > 3) await new Promise(r => setTimeout(r, 1));
      if (checkDir && i % 15 === 0) await toPng(path.join(checkDir, `v_${t.toFixed(2)}.png`), 0.5);
      if (i % 30 === 0) console.log(`frame ${i}/${frames} ${((performance.now() - t0) / 1000).toFixed(1)}s`);
      if (encErr) throw encErr;
    }
    await encoder.flush(); muxer.finalize();
    fs.writeFileSync(outFile, Buffer.from(muxer.target.buffer));
    console.log(`wrote ${outFile} ${(muxer.target.buffer.byteLength / 1e6).toFixed(2)} MB, ${frames} frames ${W}x${H}@${FPS}`);
  }
}
