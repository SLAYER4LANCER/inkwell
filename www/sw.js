// Offline cache for the web (PWA) version. The Android app ships these files inside the APK.
const CACHE = 'inkwell-v1';
const CORE = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'js/app.js', 'js/db.js', 'js/i18n.js', 'js/icons.js', 'js/ink.js', 'js/pdf.js', 'js/pagebg.js', 'js/export.js', 'js/rasterize.js', 'js/import-docx.js', 'js/import-pptx.js', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
