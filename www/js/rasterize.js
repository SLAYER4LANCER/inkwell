// Turns a DOM node (fully inline-styled, images as data: URIs) into an image blob
// using an SVG <foreignObject>. Used for Word pages and PowerPoint slides so they
// become annotatable page images.
export async function rasterize(node, w, h, scale = 2, type = 'image/jpeg', quality = 0.9) {
  const xml = new XMLSerializer().serializeToString(node);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<foreignObject x="0" y="0" width="${w}" height="${h}">${xml}</foreignObject></svg>`;
  // A data: URL (not a blob: URL) keeps the canvas untainted so it can be exported.
  const bytes = new TextEncoder().encode(svg);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const url = 'data:image/svg+xml;base64,' + btoa(bin);
  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('Could not render page'));
      img.src = url;
    });
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, type, quality));
    c.width = c.height = 1;
    if (!blob) throw new Error('Could not encode page');
    return blob;
  } finally {
    /* nothing to revoke for data: URLs */
  }
}

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
