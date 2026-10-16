// Flattening pages (background + ink + text) and exporting them as PDF / PNG.
import { drawBg } from './pagebg.js';
import { drawStroke, drawTextBoxes } from './ink.js';

export async function flattenPage(pg, pdf, pxW) {
  const c = document.createElement('canvas');
  await drawBg(c, pg, pdf, pxW);
  const x = c.getContext('2d');
  const hl = pg.strokes.filter((s) => s.tool === 'hl');
  const rest = pg.strokes.filter((s) => s.tool !== 'hl');
  x.save();
  x.globalCompositeOperation = 'multiply';
  x.globalAlpha = 0.6;
  for (const s of hl) drawStroke(x, s, c.width);
  x.restore();
  for (const s of rest) drawStroke(x, s, c.width);
  drawTextBoxes(x, pg.texts, c.width, c.height);
  return c;
}

const toBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));

let pdfLibP = null;
function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  pdfLibP ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/pdf-lib.min.js', import.meta.url).href;
    s.onload = () => res(window.PDFLib);
    s.onerror = () => rej(new Error('Could not load PDF library'));
    document.head.appendChild(s);
  });
  return pdfLibP;
}

export async function exportPdf(doc, pdf, onProgress = () => {}) {
  const { PDFDocument } = await loadPdfLib();
  const out = await PDFDocument.create();
  for (let i = 0; i < doc.pages.length; i++) {
    const pg = doc.pages[i];
    const u = pg.u || 1;
    const wPt = pg.w * u, hPt = pg.h * u;
    const pxW = Math.round(Math.min(2000, Math.max(1200, wPt * 2.4)));
    const c = await flattenPage(pg, pdf, pxW);
    const blob = await toBlob(c, 'image/jpeg', 0.9);
    c.width = c.height = 1;
    const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const page = out.addPage([wPt, hPt]);
    page.drawImage(img, { x: 0, y: 0, width: wPt, height: hPt });
    onProgress((i + 1) / doc.pages.length);
    await new Promise((r) => setTimeout(r));
  }
  out.setTitle(doc.title || 'Notebook');
  out.setProducer('Inkwell');
  const bytes = await out.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

export async function exportPageImage(pg, pdf) {
  const pxW = Math.round(Math.min(2400, Math.max(1400, pg.w * (pg.u || 1) * 2.6)));
  const c = await flattenPage(pg, pdf, pxW);
  const blob = await toBlob(c, 'image/png');
  c.width = c.height = 1;
  return blob;
}

const blobToBase64 = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

// Saves/shares a file. In the Android app this opens the share sheet (Drive, Files, WhatsApp...),
// in a normal browser it downloads the file.
export async function saveBlob(name, blob) {
  const cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
    const Filesystem = cap.registerPlugin('Filesystem');
    const Share = cap.registerPlugin('Share');
    const data = await blobToBase64(blob);
    const safe = name.replace(/[\\/:*?"<>|]+/g, '_');
    const r = await Filesystem.writeFile({ path: safe, data, directory: 'CACHE' });
    await Share.share({ title: safe, url: r.uri, dialogTitle: safe });
    return 'shared';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return 'saved';
}
