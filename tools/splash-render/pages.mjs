// Page artwork: abstract blue "notes" (strokes, bullets, charts) on warm off-white paper.
// No readable text. Drawn once at high resolution; each sheet has its own layout.
const INK = '#7fa8ea', INK_SOFT = '#b4cdf4', INK_DEEP = '#6f9be3';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function paper(g, S, seed) {
  // Warm off-white with very low-contrast fibre so close-ups read as paper, not a flat fill.
  g.fillStyle = '#fbfaf7'; g.fillRect(0, 0, S, S);
  const r = rng(seed * 77 + 5);
  const grad = g.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, 'rgba(255,255,255,0.5)'); grad.addColorStop(1, 'rgba(232,236,246,0.35)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const x = r() * S, y = r() * S, l = 4 + r() * 18, a = r() * Math.PI;
    g.strokeStyle = r() < .5 ? 'rgba(170,180,205,0.06)' : 'rgba(255,255,255,0.22)';
    g.lineWidth = .7 + r();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}

const layouts = {
  // Close-up hero page: heading swoosh, bullets, bars, a soft wave.
  hero(d, r) {
    d.swoosh(.1, .13, .72, -.02);
    for (let i = 0; i < 3; i++) { d.dot(.13, .28 + i * .1, .022); d.line(.2, .28 + i * .1, .5 + r() * .2); }
    d.line(.2, .58, .38);
    d.bars(.58, .86, [.14, .2, .29, .37], .055);
    d.wave(.08, .86, .48, .07);
  },
  donut(d, r) {
    d.donut(.7, .2, .1);
    for (let i = 0; i < 4; i++) d.line(.1, .4 + i * .075, .45 + r() * .35);
    d.lineChart(.12, .86, .76, [.1, .16, .13, .24, .3]);
  },
  list(d, r) {
    d.line(.1, .12, .5, 2.2);
    for (let i = 0; i < 6; i++) { d.dot(.12, .25 + i * .085, .018); d.line(.18, .25 + i * .085, .3 + r() * .4); }
    d.area(.1, .9, .78, .16, r);
  },
  bars(d, r) {
    d.bars(.55, .42, [.1, .16, .22, .31], .06);
    for (let i = 0; i < 3; i++) d.line(.1, .56 + i * .08, .55 + r() * .25);
    d.line(.1, .82, .4);
  },
  diagram(d, r) {
    d.node(.25, .22); d.node(.6, .2); d.node(.45, .45);
    d.link(.25, .22, .45, .45); d.link(.6, .2, .45, .45);
    for (let i = 0; i < 4; i++) d.line(.1, .63 + i * .075, .4 + r() * .4);
  },
  chart(d, r) {
    d.line(.1, .12, .42, 2);
    d.lineChart(.12, .48, .76, [.1, .2, .14, .27, .22, .33]);
    for (let i = 0; i < 4; i++) { d.dot(.12, .62 + i * .075, .016); d.line(.18, .62 + i * .075, .35 + r() * .4); }
  },
};
export const LAYOUTS = Object.keys(layouts);

function drawer(g, S) {
  const P = v => v * S;
  const stroke = (w, color = INK, alpha = .85) => { g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = P(w); g.lineCap = 'round'; g.lineJoin = 'round'; };
  return {
    line(x, y, len, w = 1.6) { stroke(.012 * w / 1.6 * 1.6); g.beginPath(); g.moveTo(P(x), P(y)); g.lineTo(P(x + len), P(y)); g.stroke(); },
    swoosh(x, y, len, bend) { stroke(.016, INK_DEEP, .8); g.beginPath(); g.moveTo(P(x), P(y + .02)); g.quadraticCurveTo(P(x + len * .5), P(y + bend - .03), P(x + len), P(y)); g.stroke(); },
    dot(x, y, rad) { g.globalAlpha = .85; g.fillStyle = INK; g.beginPath(); g.arc(P(x), P(y), P(rad), 0, Math.PI * 2); g.fill(); },
    bars(x, base, hs, w) {
      g.globalAlpha = .9;
      hs.forEach((h, i) => { g.fillStyle = i % 2 ? INK : INK_DEEP; g.beginPath(); g.roundRect(P(x + i * w * 1.45), P(base - h), P(w), P(h), P(w * .25)); g.fill(); });
    },
    wave(x, y, len, amp) {
      g.globalAlpha = .55; g.fillStyle = INK_SOFT; g.beginPath(); g.moveTo(P(x), P(y));
      for (let i = 0; i <= 40; i++) { const t = i / 40; g.lineTo(P(x + t * len), P(y - amp * (.5 + .5 * Math.sin(t * 5.2 + .8)))); }
      g.lineTo(P(x + len), P(y)); g.closePath(); g.fill();
      stroke(.008, INK, .7); g.beginPath();
      for (let i = 0; i <= 40; i++) { const t = i / 40; g.lineTo(P(x + t * len), P(y - amp * (.5 + .5 * Math.sin(t * 5.2 + .8)))); }
      g.stroke();
    },
    area(x, y, len, amp, r) {
      const k = [r(), r(), r(), r()].map(v => .3 + v * .7);
      const f = t => y - amp * (k[0] * .4 + .3 * Math.sin(t * 6 * k[1] + k[2] * 3) * k[3] + .25 * t);
      g.globalAlpha = .45; g.fillStyle = INK_SOFT; g.beginPath(); g.moveTo(P(x), P(y));
      for (let i = 0; i <= 50; i++) g.lineTo(P(x + i / 50 * len), P(f(i / 50)));
      g.lineTo(P(x + len), P(y)); g.closePath(); g.fill();
      stroke(.008, INK, .75); g.beginPath(); for (let i = 0; i <= 50; i++) g.lineTo(P(x + i / 50 * len), P(f(i / 50))); g.stroke();
    },
    donut(x, y, rad) {
      stroke(.045, INK_SOFT, .9); g.beginPath(); g.arc(P(x), P(y), P(rad), 0, Math.PI * 2); g.stroke();
      stroke(.045, INK_DEEP, .9); g.lineCap = 'butt'; g.beginPath(); g.arc(P(x), P(y), P(rad), -Math.PI / 2, Math.PI * .65); g.stroke();
    },
    lineChart(x, base, len, ys) {
      const pts = ys.map((v, i) => [x + i / (ys.length - 1) * len, base - v]);
      stroke(.011, INK, .85); g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(P(a), P(b)) : g.moveTo(P(a), P(b))); g.stroke();
      pts.forEach(([a, b]) => { g.globalAlpha = .95; g.fillStyle = INK_DEEP; g.beginPath(); g.arc(P(a), P(b), P(.018), 0, Math.PI * 2); g.fill(); });
    },
    node(x, y) { g.globalAlpha = .8; g.fillStyle = INK_SOFT; g.beginPath(); g.roundRect(P(x - .09), P(y - .05), P(.18), P(.1), P(.03)); g.fill(); stroke(.007, INK, .8); g.stroke(); },
    link(x1, y1, x2, y2) { stroke(.008, INK, .7); g.beginPath(); g.moveTo(P(x1), P(y1 + .05)); g.bezierCurveTo(P(x1), P((y1 + y2) / 2), P(x2), P((y1 + y2) / 2), P(x2), P(y2 - .05)); g.stroke(); },
  };
}

// Returns a canvas with the page art. `mirror` draws it for the back of a leaf, so the
// spine side ends up on the right when the leaf lies on the left half of the book.
// The fore-edge corners are rounded through alpha (used with alphaTest).
export function pageCanvas(S, layout, seed, mirror) {
  const c = new OffscreenCanvas(S, S), g = c.getContext('2d');
  g.save();
  if (mirror) { g.translate(S, 0); g.scale(-1, 1); }
  const rad = S * .045;
  g.beginPath(); g.roundRect(0, 0, S, S, [0, rad, rad, 0]); g.clip();
  paper(g, S, seed);
  g.save(); g.filter = `blur(${S / 1400}px)`;
  layouts[layout](drawer(g, S), rng(seed));
  g.restore();
  g.restore();
  return c;
}

// Height field for the bump map: raised ink, fibres, faint tooth.
export function bumpCanvas(S, seed) {
  const c = new OffscreenCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  const r = rng(seed);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() < .5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    g.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 3);
  }
  return c;
}

// Fore-edge / page-block texture: many fine sheets.
export function edgeCanvas() {
  const W = 64, H = 1024, c = new OffscreenCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#f7f6f2'; g.fillRect(0, 0, W, H);
  const r = rng(9);
  for (let y = 0; y < H; y += 3 + r() * 3) { g.fillStyle = `rgba(150,165,195,${.1 + r() * .14})`; g.fillRect(0, y, W, .8 + r() * .6); }
  return c;
}
