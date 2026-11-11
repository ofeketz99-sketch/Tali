// Separates the white ribbon of build/icon.png from its blue rounded square.
// The square's own blue is estimated per pixel by normalized convolution (a blur of the
// clearly-blue pixels, divided by the blur of their mask, which a premultiplied canvas blur
// does for free). Each pixel is then "unmatted": the minimal alpha that explains it as
// foreground over that blue. Over the same blue the result reproduces the icon, so the
// square can vanish while the ribbon keeps its soft shading.
export function extractEmblem(img) {
  const N = img.naturalWidth;
  const c = new OffscreenCanvas(N, N), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, N, N).data;
  const inner = (x, y) => Math.min(x, y, N - 1 - x, N - 1 - y) > N * .1;
  const mask = new ImageData(N, N), m = mask.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    if (!inner(x, y) || d[i + 3] < 240 || d[i + 2] - d[i] < 62) continue;
    m[i] = d[i]; m[i + 1] = d[i + 1]; m[i + 2] = d[i + 2]; m[i + 3] = 255;
  }
  const mc = new OffscreenCanvas(N, N); mc.getContext('2d').putImageData(mask, 0, 0);
  const blurred = r => { const b = new OffscreenCanvas(N, N), bg = b.getContext('2d', { willReadFrequently: true }); bg.filter = `blur(${r}px)`; bg.drawImage(mc, 0, 0); return bg.getImageData(0, 0, N, N).data; };
  const fine = blurred(10), mid = blurred(24), coarse = blurred(60);
  const bgAt = i => { for (const s of [fine, mid, coarse]) if (s[i + 3] > 40) return [s[i] / 255, s[i + 1] / 255, s[i + 2] / 255]; return [coarse[i] / 255, coarse[i + 1] / 255, coarse[i + 2] / 255]; };
  const out = g.createImageData(N, N), o = out.data;
  // Fade the matte out inside the rounded square so its border and corners can never leak.
  const margin = (x, y) => {
    const h = N * .4, r = N * .16, qx = Math.abs(x - N / 2) - (h - r), qy = Math.abs(y - N / 2) - (h - r);
    const sdf = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    return Math.min(1, Math.max(0, -sdf / (N * .03)));
  };
  let sum = [0, 0, 0], cnt = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4, bg = bgAt(i);
    if (m[i + 3]) { sum = sum.map((v, ch) => v + d[i + ch]); cnt++; }
    const px = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255];
    let a = 0;
    for (let ch = 0; ch < 3; ch++) {
      const b = Math.min(.999, Math.max(.001, bg[ch]));
      a = Math.max(a, px[ch] > b ? (px[ch] - b) / (1 - b) : (b - px[ch]) / b);
    }
    // Soft knee: kill gradient residue / compression noise in the flat blue (amplified otherwise).
    const knee = Math.min(1, Math.max(0, (a - .05) / .1)); a = a * knee * knee * (3 - 2 * knee) * margin(x, y);
    if (a <= 0) continue;
    for (let ch = 0; ch < 3; ch++) o[i + ch] = Math.round(255 * Math.min(1, Math.max(0, bg[ch] + (px[ch] - bg[ch]) / a)));
    o[i + 3] = Math.round(255 * a);
  }
  const outCanvas = new OffscreenCanvas(N, N);
  outCanvas.getContext('2d').putImageData(out, 0, 0);
  return { canvas: outCanvas, center: sum.map(v => Math.round(v / cnt)) };
}
