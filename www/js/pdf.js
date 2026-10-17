// inkwell-build:r8
// pdf.js loader (bundled locally; works offline).
let pdfjsP = null;
const base = new URL('../vendor/pdfjs/', import.meta.url).href;

export function loadPdfjs() {
  pdfjsP ||= import('../vendor/pdfjs/pdf.min.js').then((m) => {
    m.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
    return m;
  });
  return pdfjsP;
}

export async function openPdf(buffer, askPassword) {
  const m = await loadPdfjs();
  const task = m.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: base + 'standard_fonts/',
    wasmUrl: base + 'wasm/',
    iccUrl: base + 'iccs/',
  });
  task.onPassword = async (update, reason) => {
    const pw = askPassword ? await askPassword(reason) : null;
    if (pw == null) task.destroy(); else update(pw);
  };
  return task.promise;
}

export function closePdf(pdf) {
  try {
    if (!pdf) return;
    if (pdf.loadingTask && pdf.loadingTask.destroy) pdf.loadingTask.destroy();
    else if (pdf.destroy) pdf.destroy();
  } catch { /* ignore */ }
}
