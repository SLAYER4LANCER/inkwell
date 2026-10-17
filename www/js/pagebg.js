// inkwell-build:r8
// Paints a page background (PDF page, imported Word/PowerPoint image, or blank template).
import { getBlob } from './db.js';
import { drawTemplate } from './ink.js';

export async function drawBg(canvas, pg, pdf, pxW, hooks = {}) {
  const pxH = Math.round((pxW * pg.h) / pg.w);
  const tmp = document.createElement('canvas');
  tmp.width = pxW; tmp.height = pxH;
  const x = tmp.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, pxW, pxH);
  if (pg.t === 'pdf') {
    const page = await pdf.getPage(pg.n);
    const vp = page.getViewport({ scale: pxW / pg.w });
    const task = page.render({ canvasContext: x, canvas: tmp, viewport: vp });
    if (hooks.onTask) hooks.onTask(task);
    await task.promise;
  } else if (pg.t === 'img') {
    const blob = await getBlob(pg.key);
    if (blob) {
      const bm = await createImageBitmap(blob);
      x.drawImage(bm, 0, 0, pxW, pxH);
      if (bm.close) bm.close();
    }
  } else {
    drawTemplate(x, pg.tpl, pxW, pxH);
  }
  if (hooks.isStale && hooks.isStale()) { tmp.width = tmp.height = 1; return false; }
  canvas.width = pxW;
  canvas.height = pxH;
  canvas.getContext('2d').drawImage(tmp, 0, 0);
  tmp.width = tmp.height = 1;
  return true;
}
