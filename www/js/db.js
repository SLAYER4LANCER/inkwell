// Tiny IndexedDB wrapper: "docs" holds notebook records, "blobs" holds files/images/thumbnails.
const DB_NAME = 'inkwell';
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbp;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    const rq = fn(s);
    if (rq) rq.onsuccess = () => { out = rq.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const putDoc = (d) => run('docs', 'readwrite', (s) => s.put(d));
export const getDoc = (id) => run('docs', 'readonly', (s) => s.get(id));
export const allDocs = () => run('docs', 'readonly', (s) => s.getAll());
export const putBlob = (k, b) => run('blobs', 'readwrite', (s) => s.put(b, k));
export const getBlob = (k) => run('blobs', 'readonly', (s) => s.get(k));
export const delBlob = (k) => run('blobs', 'readwrite', (s) => s.delete(k));

export async function deleteDoc(id) {
  await run('docs', 'readwrite', (s) => s.delete(id));
  await run('blobs', 'readwrite', (s) => s.delete(IDBKeyRange.bound(id + ':', id + ':￿')));
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
