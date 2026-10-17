import { t, setLang, getLang, applyLang } from './i18n.js';
import { icon } from './icons.js';
import * as DB from './db.js';
import { initOpenWith } from './openwith.js';
import { COLORS, drawStroke, drawLivePiece, hitStroke, drawTemplate, drawMarks } from './ink.js';
import { smoothPoints, straighten, blurred, wordsUnderStroke } from './autoink.js';
import { pdfWords, nearestWord, rangeInfo, handlePoints, marksTouching, hitMark } from './textlayer.js';
import { drawBg } from './pagebg.js';
import { openPdf, closePdf } from './pdf.js';
import { exportPdf, exportPageImage, saveBlob, flattenPage } from './export.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ------------------------------------------------------------------ settings */
const DEFAULTS = {
  fingerDraw: true,
  autoFix: true,
  tool: 'pen',
  shape: 'rect',
  color: { pen: '#111827', hl: '#facc15', shape: '#dc2626', text: '#111827' },
  size: { pen: 0.0032, hl: 0.022, eraser: 0.025, shape: 0.0032, text: 0.026 },
};
const S = (() => {
  try {
    const j = JSON.parse(localStorage.getItem('ink.settings') || '{}');
    return { ...DEFAULTS, ...j, color: { ...DEFAULTS.color, ...j.color }, size: { ...DEFAULTS.size, ...j.size } };
  } catch { return structuredClone(DEFAULTS); }
})();
const saveSettings = () => { try { localStorage.setItem('ink.settings', JSON.stringify(S)); } catch { /* ignore */ } };

/* ------------------------------------------------------------------ ui helpers */
let toastT;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 3200);
}
function busy(text, frac) {
  $('#busy').hidden = false;
  $('#busyText').textContent = text;
  $('#busyBar').style.width = (frac == null ? 0 : Math.round(frac * 100)) + '%';
}
const busyDone = () => { $('#busy').hidden = true; };

function sheet(build) {
  const back = $('#sheet');
  back.hidden = false;
  back.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'sheet';
  back.appendChild(el);
  const close = () => { back.hidden = true; back.innerHTML = ''; };
  back.onclick = (e) => { if (e.target === back) close(); };
  build(el, close);
  return close;
}
function askText(title, value = '', { password = false, ok = t('ok') } = {}) {
  return new Promise((resolve) => {
    sheet((el, close) => {
      el.innerHTML = `<h3></h3><input class="field" ${password ? 'type="password"' : 'type="text"'} autocomplete="off"><div class="actions"><button class="btn" data-x="c"></button><button class="btn primary" data-x="o"></button></div>`;
      $('h3', el).textContent = title;
      const inp = $('input', el);
      inp.value = value;
      $('[data-x=c]', el).textContent = t('cancel');
      $('[data-x=o]', el).textContent = ok;
      let done = false;
      const fin = (v) => { if (done) return; done = true; close(); resolve(v); };
      $('[data-x=c]', el).onclick = () => fin(null);
      $('[data-x=o]', el).onclick = () => fin(inp.value);
      inp.onkeydown = (e) => { if (e.key === 'Enter') fin(inp.value); };
      $('#sheet').onclick = (e) => { if (e.target.id === 'sheet') fin(null); };
      setTimeout(() => { inp.focus(); inp.select(); }, 60);
    });
  });
}
function confirmBox(title, text, okLabel = t('del')) {
  return new Promise((resolve) => {
    sheet((el, close) => {
      el.innerHTML = `<h3></h3><p></p><div class="actions"><button class="btn" data-x="c"></button><button class="btn danger" data-x="o"></button></div>`;
      $('h3', el).textContent = title;
      $('p', el).textContent = text;
      $('[data-x=c]', el).textContent = t('cancel');
      $('[data-x=o]', el).textContent = okLabel;
      let done = false;
      const fin = (v) => { if (done) return; done = true; close(); resolve(v); };
      $('[data-x=c]', el).onclick = () => fin(false);
      $('[data-x=o]', el).onclick = () => fin(true);
      $('#sheet').onclick = (e) => { if (e.target.id === 'sheet') fin(false); };
    });
  });
}
const askPassword = () => askText(t('enterPassword'), '', { password: true });
// Passwords for protected PDFs are remembered only in memory for this session (never stored).
const pwCache = new Map();
function passwordFor(id, onCancel) {
  let first = true;
  return async () => {
    if (first && pwCache.has(id)) { first = false; return pwCache.get(id); }
    first = false;
    const p = await askPassword();
    if (p == null) { if (onCancel) onCancel(); } else pwCache.set(id, p);
    return p;
  };
}
const safeName = (s) => (s || 'Notebook').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
const fillIcons = (root = document) => $$('[data-icon]', root).forEach((n) => { n.innerHTML = icon(n.dataset.icon, +n.dataset.size || 22); });

/* ------------------------------------------------------------------ library */
let thumbUrls = [];
const KIND_LABEL = { pdf: 'kindPdf', docx: 'kindDocx', pptx: 'kindPptx', blank: 'kindBlank' };
// L = library state: the folder being viewed and, in "select" mode, the notebooks picked.
const L = { folder: null, folders: [], selecting: false, picked: new Set() };
const folderHash = (id) => (id ? '#/f/' + id : '#');
const folderById = (id) => L.folders.find((f) => f.id === id);
const byName = (a, b) => a.name.localeCompare(b.name);
function folderPath(id) {
  const path = [], seen = new Set();
  let f = folderById(id);
  while (f && !seen.has(f.id)) { seen.add(f.id); path.unshift(f); f = f.parent ? folderById(f.parent) : null; }
  return path;
}
function descendantIds(id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of L.folders) if (f.parent && out.has(f.parent) && !out.has(f.id)) { out.add(f.id); grew = true; }
  }
  return out;
}

async function renderLibrary() {
  const q = $('#q').value.trim().toLowerCase();
  const [docsAll, folders] = await Promise.all([DB.allDocs(), DB.allFolders()]);
  L.folders = folders;
  if (L.folder && !folderById(L.folder)) { L.folder = null; if (location.hash.startsWith('#/f/')) location.replace('#'); }
  const cur = L.folder;
  const docs = (q ? docsAll.filter((d) => d.title.toLowerCase().includes(q)) : docsAll.filter((d) => (d.folder || null) === cur))
    .sort((a, b) => b.updated - a.updated);
  const subs = (q ? folders.filter((f) => f.name.toLowerCase().includes(q)) : folders.filter((f) => (f.parent || null) === cur)).sort(byName);
  thumbUrls.forEach((u) => URL.revokeObjectURL(u));
  thumbUrls = [];

  // breadcrumb
  const crumbs = $('#crumbs');
  crumbs.hidden = !cur || !!q;
  if (!crumbs.hidden) {
    crumbs.innerHTML = '';
    const parts = [{ id: null, name: t('rootLib') }, ...folderPath(cur)];
    parts.forEach((p, i) => {
      if (i) crumbs.insertAdjacentHTML('beforeend', `<span class="sepc">${icon('chev', 14)}</span>`);
      const b = document.createElement('button');
      b.textContent = p.name;
      if (i === parts.length - 1) b.className = 'cur';
      b.onclick = () => { if (p.id !== cur) location.hash = folderHash(p.id); };
      crumbs.appendChild(b);
    });
  }

  $('#empty').hidden = docsAll.length + folders.length > 0;
  $('#folderEmpty').hidden = !(cur && !q && !docs.length && !subs.length);
  $('#folderHead').hidden = !subs.length;
  $('#gridHead').hidden = !docs.length;
  $('#gridHead').textContent = !q && !cur ? t('recent') : t('notebooks');

  // folders
  const fgrid = $('#fgrid');
  fgrid.innerHTML = '';
  for (const f of subs) {
    const n = docsAll.filter((d) => (d.folder || null) === f.id).length + folders.filter((x) => (x.parent || null) === f.id).length;
    const el = document.createElement('div');
    el.className = 'fcard';
    el.innerHTML = `<span class="fic">${icon('folder', 28)}</span><div class="fmeta"><div class="name"></div><div class="sub"></div></div><button class="kebab2" aria-label="${t('more')}">${icon('more', 18)}</button>`;
    $('.name', el).textContent = f.name;
    $('.sub', el).textContent = n === 0 ? t('item0') : n === 1 ? t('item1') : t('items', { n });
    el.onclick = (e) => {
      if (L.selecting) return;
      if (e.target.closest('.kebab2')) folderMenu(f); else location.hash = folderHash(f.id);
    };
    fgrid.appendChild(el);
  }

  // notebooks
  const grid = $('#grid');
  grid.innerHTML = '';
  if (q && !docs.length && !subs.length) {
    grid.innerHTML = `<p style="color:var(--muted);grid-column:1/-1">${t('noResults')}</p>`;
    return;
  }
  const locale = getLang() === 'ar' ? 'ar-IQ' : undefined;
  for (const d of docs) {
    const card = document.createElement('div');
    card.className = 'card' + (L.picked.has(d.id) ? ' picked' : '');
    card.dataset.id = d.id;
    card.innerHTML = `<div class="thumb"></div><span class="badge k-${d.kind}"></span><button class="kebab">${icon('more', 18)}</button><span class="chk">${icon('checkSel', 24)}</span><div class="meta"><div class="name"></div><div class="sub"></div></div>`;
    $('.badge', card).textContent = t(KIND_LABEL[d.kind] || 'kindBlank');
    $('.name', card).textContent = d.title;
    const n = d.pages.length;
    let sub = (n === 1 ? t('page1') : t('pages', { n })) + ' · ' + new Date(d.updated).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    if (q && d.folder && folderById(d.folder)) sub += ' · ' + folderById(d.folder).name;
    $('.sub', card).textContent = sub;
    DB.getBlob(d.id + ':thumb').then((b) => {
      if (!b) { $('.thumb', card).innerHTML = icon('file', 36); return; }
      const u = URL.createObjectURL(b);
      thumbUrls.push(u);
      $('.thumb', card).innerHTML = `<img alt="" src="${u}">`;
    });
    // long-press selects (so several notebooks can be moved into a folder at once)
    let lp = null;
    const stopLp = () => { clearTimeout(lp); lp = null; };
    card.addEventListener('pointerdown', (e) => {
      if (L.selecting || e.target.closest('.kebab')) return;
      stopLp();
      lp = setTimeout(() => { lp = null; card._long = true; navigator.vibrate && navigator.vibrate(15); enterSelect(d.id); }, 480);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) card.addEventListener(ev, stopLp);
    card.addEventListener('contextmenu', (e) => e.preventDefault());
    card.onclick = (e) => {
      if (card._long) { card._long = false; return; }
      if (L.selecting) { togglePick(d.id); return; }
      if (e.target.closest('.kebab')) docMenu(d); else openFromLibrary(d.id);
    };
    grid.appendChild(card);
  }
  updateSelUI();
}

function openFromLibrary(id) { E.pushed = true; location.hash = '#/doc/' + id; }

/* --- select mode: pick several notebooks, then move or delete them */
function enterSelect(id) {
  L.selecting = true;
  L.picked = new Set(id ? [id] : []);
  $('#lib').classList.add('selecting');
  $('#fab').hidden = true;
  updateSelUI();
}
function exitSelect() {
  if (!L.selecting && !L.picked.size) return;
  L.selecting = false;
  L.picked = new Set();
  $('#lib').classList.remove('selecting');
  $('#fab').hidden = false;
  updateSelUI();
}
function togglePick(id) {
  if (L.picked.has(id)) L.picked.delete(id); else L.picked.add(id);
  updateSelUI();
}
function updateSelUI() {
  $$('#grid .card').forEach((c) => c.classList.toggle('picked', L.picked.has(c.dataset.id)));
  $('#selCount').textContent = t('nSelected', { n: L.picked.size });
  $('#selMove').disabled = $('#selDel').disabled = !L.picked.size;
}
$('#selCancel').onclick = exitSelect;
$('#selAll').onclick = () => {
  const ids = $$('#grid .card').map((c) => c.dataset.id);
  if (ids.every((i) => L.picked.has(i))) L.picked.clear(); else ids.forEach((i) => L.picked.add(i));
  updateSelUI();
};
$('#selMove').onclick = () => {
  const ids = [...L.picked];
  folderPicker({ title: t('moveTo'), current: L.folder, onPick: async (fid) => { await moveDocs(ids, fid); exitSelect(); renderLibrary(); toast(t('moved')); } });
};
$('#selDel').onclick = async () => {
  const ids = [...L.picked];
  if (!ids.length || !(await confirmBox(t('deleteTitle'), t('deleteText')))) return;
  for (const id of ids) await DB.deleteDoc(id);
  exitSelect();
  renderLibrary();
};

async function moveDocs(ids, folderId) {
  for (const id of ids) {
    const d = await DB.getDoc(id);
    if (!d) continue;
    d.folder = folderId || null; // moving does not change the "last edited" time
    await DB.putDoc(d);
  }
}

/* --- folders */
async function newFolder() {
  const v = await askText(t('folderName'), '', { ok: t('save') });
  if (!v || !v.trim()) return null;
  const f = { id: DB.uid(), name: v.trim().slice(0, 80), parent: L.folder || null, created: Date.now() };
  await DB.putFolder(f);
  renderLibrary();
  return f;
}

// Shows the folders as an indented list and calls onPick(folderIdOrNull) when one is chosen.
function folderPicker({ title, exclude = new Set(), current = null, onPick }) {
  sheet((el, close) => {
    el.innerHTML = `<h3></h3><div class="fp-list"></div><div class="actions"><button class="btn" data-x="n"></button><button class="btn" data-x="c"></button></div>`;
    $('h3', el).textContent = title;
    $('[data-x=n]', el).innerHTML = `${icon('folderPlus', 18)}<span> ${t('newFolder')}</span>`;
    $('[data-x=c]', el).textContent = t('cancel');
    $('[data-x=c]', el).onclick = close;
    const list = $('.fp-list', el);
    const row = (id, name, depth) => {
      const b = document.createElement('button');
      b.className = 'fp-row' + (id === current ? ' cur' : '');
      b.style.paddingInlineStart = 12 + depth * 18 + 'px';
      b.innerHTML = `${icon(id ? 'folder' : 'notebook', 20)}<span></span>${id === current ? icon('check', 18) : ''}`;
      $('span', b).textContent = name;
      if (exclude.has(id)) b.disabled = true;
      b.onclick = () => { close(); onPick(id); };
      list.appendChild(b);
    };
    row(null, t('rootLib'), 0);
    const walk = (parent, depth) => {
      for (const f of L.folders.filter((x) => (x.parent || null) === parent).sort(byName)) { row(f.id, f.name, depth); walk(f.id, depth + 1); }
    };
    walk(null, 1);
    $('[data-x=n]', el).onclick = async () => {
      close();
      const v = await askText(t('folderName'), '', { ok: t('save') });
      if (v && v.trim()) {
        await DB.putFolder({ id: DB.uid(), name: v.trim().slice(0, 80), parent: null, created: Date.now() });
        L.folders = await DB.allFolders();
      }
      folderPicker({ title, exclude, current, onPick });
    };
  });
}

function menuSheet(title, items) {
  sheet((el, close) => {
    el.innerHTML = `<h3></h3><div class="menu" style="box-shadow:none;border:0;padding:0;min-width:0"></div>`;
    $('h3', el).textContent = title;
    const m = $('.menu', el);
    for (const [ic, label, fn, cls] of items) {
      const b = document.createElement('button');
      if (cls) b.className = cls;
      b.innerHTML = `${icon(ic)}<span></span>`;
      $('span', b).textContent = label;
      b.onclick = () => { close(); fn(); };
      m.appendChild(b);
    }
  });
}

function folderMenu(f) {
  menuSheet(f.name, [
    ['edit', t('rename'), async () => {
      const v = await askText(t('rename'), f.name, { ok: t('save') });
      if (v && v.trim()) { f.name = v.trim().slice(0, 80); await DB.putFolder(f); renderLibrary(); }
    }],
    ['move', t('moveTo'), () => {
      folderPicker({
        title: t('moveTo'), exclude: descendantIds(f.id), current: f.parent || null,
        onPick: async (pid) => { f.parent = pid || null; await DB.putFolder(f); renderLibrary(); toast(t('moved')); },
      });
    }],
    ['trash', t('del'), async () => {
      if (!(await confirmBox(t('delFolderTitle'), t('delFolderText')))) return;
      // nothing inside is deleted: contents move up to the parent folder
      const parent = f.parent || null;
      for (const d of await DB.allDocs()) if ((d.folder || null) === f.id) { d.folder = parent; await DB.putDoc(d); }
      for (const x of await DB.allFolders()) if ((x.parent || null) === f.id) { x.parent = parent; await DB.putFolder(x); }
      await DB.delFolder(f.id);
      renderLibrary();
    }, 'danger'],
  ]);
}

function docMenu(d) {
  menuSheet(d.title, [
    ['edit', t('rename'), async () => {
      const v = await askText(t('rename'), d.title, { ok: t('save') });
      if (v && v.trim()) { d.title = v.trim().slice(0, 120); await DB.putDoc(d); renderLibrary(); }
    }],
    ['move', t('moveTo'), () => {
      folderPicker({ title: t('moveTo'), current: d.folder || null, onPick: async (fid) => { await moveDocs([d.id], fid); renderLibrary(); toast(t('moved')); } });
    }],
    ['download', t('exportPdf'), () => exportFromLibrary(d)],
    ['trash', t('del'), async () => {
      if (await confirmBox(t('deleteTitle'), t('deleteText'))) { await DB.deleteDoc(d.id); renderLibrary(); }
    }, 'danger'],
  ]);
}

async function withPdf(doc) {
  if (!doc.pages.some((p) => p.t === 'pdf')) return null;
  const blob = await DB.getBlob(doc.id + ':pdf');
  return openPdf(await blob.arrayBuffer(), passwordFor(doc.id));
}

async function exportFromLibrary(d) {
  let pdf = null;
  try {
    busy(t('exporting'), 0);
    pdf = await withPdf(d);
    const blob = await exportPdf(d, pdf, (f) => busy(t('exporting'), f));
    const r = await saveBlob(safeName(d.title) + '.pdf', blob);
    busyDone();
    toast(r === 'shared' ? t('shared') : t('saved'));
  } catch (e) { console.error(e); busyDone(); toast(t('errExport')); } finally { closePdf(pdf); }
}

/* ------------------------------------------------------------------ importing */
const ACCEPT = {
  pdf: '.pdf,application/pdf',
  docx: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

async function thumbFromCanvas(c) {
  const w = 360, h = Math.round((c.height / c.width) * w);
  const t2 = document.createElement('canvas');
  t2.width = w; t2.height = h;
  const x = t2.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  x.drawImage(c, 0, 0, w, h);
  const blob = await new Promise((r) => t2.toBlob(r, 'image/jpeg', 0.82));
  t2.width = t2.height = 1;
  return blob;
}

async function importFile(file) {
  const name = file.name || 'file';
  let ext = (name.split('.').pop() || '').toLowerCase();
  if (!['pdf', 'docx', 'pptx'].includes(ext)) {
    if (file.type === 'application/pdf') ext = 'pdf';
    else if (/wordprocessingml/.test(file.type)) ext = 'docx';
    else if (/presentationml/.test(file.type)) ext = 'pptx';
  }
  if (ext === 'doc' || ext === 'ppt') { toast(t('errLegacy')); return null; }
  if (!['pdf', 'docx', 'pptx'].includes(ext)) { toast(t('errType')); return null; }
  const title = name.replace(/\.[^.]+$/, '') || t('untitled');
  const id = DB.uid();
  busy(t('importing'), 0);
  let aborted = false;
  try {
    const buf = await file.arrayBuffer();
    const pages = [];
    let thumb;
    if (ext === 'pdf') {
      const pdf = await openPdf(buf.slice(0), passwordFor(id, () => { aborted = true; }));
      try {
        for (let n = 1; n <= pdf.numPages; n++) {
          const pg = await pdf.getPage(n);
          const vp = pg.getViewport({ scale: 1 });
          pages.push({ t: 'pdf', n, w: vp.width, h: vp.height, u: 1, strokes: [], texts: [], marks: [] });
          if (n % 8 === 0) { busy(t('preparing'), n / pdf.numPages); await new Promise((r) => setTimeout(r)); }
        }
        await DB.putBlob(id + ':pdf', new Blob([buf], { type: 'application/pdf' }));
        const c = document.createElement('canvas');
        await drawBg(c, pages[0], pdf, 360);
        thumb = await thumbFromCanvas(c);
      } finally { closePdf(pdf); }
    } else {
      const mod = ext === 'docx' ? await import('./import-docx.js') : await import('./import-pptx.js');
      const res = await (ext === 'docx' ? mod.importDocx : mod.importPptx)(buf, (f) => busy(t('preparing'), f));
      if (!re
