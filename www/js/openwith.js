// "Open with" support for the Android app. When the user taps a PDF / Word / PowerPoint file in Telegram, Files, WhatsApp...
// and picks Inkwell, Android starts the app with a content:// (or file://) address of that file. The Capacitor App plugin
// reports it (getLaunchUrl when the app was closed, appUrlOpen when it is already running) and we read the file's bytes.

const isNative = () => {
  const c = window.Capacitor;
  return !!(c && c.isNativePlatform && c.isNativePlatform());
};

// "…/Telegram%20Documents/path100.docx" -> "path100.docx" (null when the address has no file name, e.g. Downloads "msf:1234")
export function nameFromUrl(url) {
  let p = url.split('#')[0].split('?')[0];
  try { p = decodeURIComponent(p); } catch { /* keep as is */ }
  const m = /([^/\\:]+\.(?:pdf|docx|pptx|doc|ppt))$/i.exec(p);
  return m ? m[1] : null;
}

// Works out the file type from the bytes themselves when the address gives no usable name.
export async function sniffExt(buf) {
  const u = new Uint8Array(buf.slice(0, 8));
  if (u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46) return 'pdf'; // %PDF
  if (u[0] === 0x50 && u[1] === 0x4b) { // PK = zip container: Word and PowerPoint files
    const { loadJSZip } = await import('./import-docx.js');
    const Z = await loadJSZip();
    const z = await Z.loadAsync(buf);
    if (z.file('word/document.xml')) return 'docx';
    if (z.file('ppt/presentation.xml')) return 'pptx';
  }
  return null;
}

export async function readUrl(url) {
  const cap = window.Capacitor;
  try {
    // Capacitor serves content:// and file:// addresses to the page under a local address
    const r = await fetch(cap.convertFileSrc(url));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.arrayBuffer();
  } catch (e) {
    console.warn('fetch failed, trying the Filesystem plugin', e);
    const res = await cap.registerPlugin('Filesystem').readFile({ path: url });
    const r = await fetch(`data:application/octet-stream;base64,${res.data}`);
    return r.arrayBuffer();
  }
}

// onFile(File | null) is called with the opened file, or null when it could not be read.
export async function initOpenWith(onFile) {
  if (!isNative()) return;
  const App = window.Capacitor.registerPlugin('App');
  let last = { url: '', t: 0 };
  const handle = async (url, cold) => {
    if (!url || !/^(content|file):/i.test(url)) return;
    const now = Date.now();
    // the same launch address can be reported twice (start-up + event); a real second opening comes later
    if (url === last.url && now - last.t < (cold ? 60000 : 2500)) return;
    last = { url, t: now };
    try {
      const buf = await readUrl(url);
      let name = nameFromUrl(url);
      if (!name) {
        const ext = await sniffExt(buf);
        name = ext ? `Document.${ext}` : 'Document';
      }
      await onFile(new File([buf], name));
    } catch (e) {
      console.warn('open-with', e);
      await onFile(null);
    }
  };
  App.addListener('appUrlOpen', (d) => handle(d && d.url, false));
  try {
    const l = await App.getLaunchUrl();
    if (l && l.url) handle(l.url, true);
  } catch { /* no launch address */ }
}
