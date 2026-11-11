const fs = require('fs'), path = require('path'), { ipcRenderer } = require('electron');
import { extractEmblem } from './emblem.mjs';
console.log = (...a) => ipcRenderer.send('log', a.join(' '));
const q = new URLSearchParams(location.search);
const args = JSON.parse(q.get('args')), ROOT = q.get('root');
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const savePng = async (canvas, file) => { const b = await canvas.convertToBlob({ type: 'image/png' }); fs.writeFileSync(file, Buffer.from(await b.arrayBuffer())); };
try {
  const icon = await loadImg('../../build/icon.png');
  const emblem = extractEmblem(icon);
  console.log('icon blue mean: rgb(' + emblem.center.join(',') + ')');
  if (args[0] === 'emblem') {
    await savePng(emblem.canvas, path.join(ROOT, 'src', 'splash-emblem.png'));
    // Optional check image: the emblem over the intro blue, and its alpha (x8).
    if (args[1]) {
    const v = new OffscreenCanvas(1024, 512), g = v.getContext('2d');
    g.fillStyle = '#aac7f2'; g.fillRect(0, 0, 1024, 512); g.drawImage(emblem.canvas, 0, 0, 512, 512); const z = new OffscreenCanvas(512, 512), zg = z.getContext('2d'); zg.fillStyle = '#fff'; const id = emblem.canvas.getContext('2d').getImageData(0, 0, 512, 512); for (let i = 0; i < id.data.length; i += 4) { const a = id.data[i + 3]; id.data[i] = id.data[i + 1] = id.data[i + 2] = Math.min(255, a * 8); id.data[i + 3] = 255; } zg.putImageData(id, 0, 0); g.drawImage(z, 512, 0);
    await savePng(v, args[1]);
    }
  } else {
    const { run } = await import('./scene.mjs');
    await run(args, { emblem, ROOT, savePng });
  }
  ipcRenderer.send('done', 0);
} catch (e) { console.log('ERROR ' + (e.stack || e)); ipcRenderer.send('done', 1); }
