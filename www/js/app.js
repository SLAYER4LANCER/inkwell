import { t, setLang, getLang, applyLang } from './i18n.js';
import { icon } from './icons.js';
import * as DB from './db.js';
import { COLORS, drawStroke, drawLivePiece, hitStroke, drawTemplate } from './ink.js';
import { drawBg } from './pagebg.js';
import { openPdf, closePdf } from './pdf.js';
import { exportPdf, exportPageImage, saveBlob, flattenPage } from './export.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ------------------------------------------------------------------ settings */
const DEFAULTS = {
  fingerDraw: true,
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

async function renderLibrary() {
  const q = $('#q').value.trim().toLowerCase();
  const all = (await DB.allDocs()).sort((a, b) => b.updated - a.updated);
  const list = q ? all.filter((d) => d.title.toLowerCase().includes(q)) : all;
  thumbUrls.forEach((u) => URL.revokeObjectURL(u));
  thumbUrls = [];
  const grid = $('#grid');
  grid.innerHTML = '';
  $('#empty').hidden = all.length > 0;
  $('#gridHead').hidden = all.length === 0;
  if (all.length && !list.length) {
    grid.innerHTML = `<p style="color:var(--muted);grid-column:1/-1">${t('noResults')}</p>`;
    return;
  }
  const locale = getLang() === 'ar' ? 'ar-IQ' : undefined;
  for (const d of list) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="thumb"></div><span class="badge k-${d.kind}"></span><button class="kebab">${icon('more', 18)}</button><div class="meta"><div class="name"></div><div class="sub"></div></div>`;
    $('.badge', card).textContent = t(KIND_LABEL[d.kind] || 'kindBlank');
    $('.name', card).textContent = d.title;
    const n = d.pages.length;
    $('.sub', card).textContent = (n === 1 ? t('page1') : t('pages', { n })) + ' · ' + new Date(d.updated).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    DB.getBlob(d.id + ':thumb').then((b) => {
      if (!b) { $('.thumb', card).innerHTML = icon('file', 36); return; }
      const u = URL.createObjectURL(b);
      thumbUrls.push(u);
      $('.thumb', card).innerHTML = `<img alt="" src="${u}">`;
    });
    card.onclick = (e) => { if (e.target.closest('.kebab')) { docMenu(d); } else openFromLibrary(d.id); };
    grid.appendChild(card);
  }
}

function openFromLibrary(id) { E.pushed = true; location.hash = '#/doc/' + id; }

function docMenu(d) {
  sheet((el, close) => {
    el.innerHTML = `<h3></h3><div class="menu" style="box-shadow:none;border:0;padding:0;min-width:0"></div>`;
    $('h3', el).textContent = d.title;
    const m = $('.menu', el);
    const items = [
      ['edit', t('rename'), async () => {
        const v = await askText(t('rename'), d.title, { ok: t('save') });
        if (v && v.trim()) { d.title = v.trim().slice(0, 120); await DB.putDoc(d); renderLibrary(); }
      }],
      ['download', t('exportPdf'), () => exportFromLibrary(d)],
      ['trash', t('del'), async () => {
        if (await confirmBox(t('deleteTitle'), t('deleteText'))) { await DB.deleteDoc(d.id); renderLibrary(); }
      }, 'danger'],
    ];
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
          pages.push({ t: 'pdf', n, w: vp.width, h: vp.height, u: 1, strokes: [], texts: [] });
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
      if (!res.length) throw new Error('empty');
      for (let i = 0; i < res.length; i++) {
        const key = `${id}:p:${i}`;
        await DB.putBlob(key, res[i].blob);
        pages.push({ t: 'img', key, w: res[i].w, h: res[i].h, u: 0.75, strokes: [], texts: [] });
      }
      const bm = await createImageBitmap(res[0].blob);
      const c = document.createElement('canvas');
      c.width = bm.width; c.height = bm.height;
      c.getContext('2d').drawImage(bm, 0, 0);
      if (bm.close) bm.close();
      thumb = await thumbFromCanvas(c);
    }
    const doc = { id, title, kind: ext, created: Date.now(), updated: Date.now(), pages };
    await DB.putBlob(id + ':thumb', thumb);
    await DB.putDoc(doc);
    busyDone();
    return id;
  } catch (e) {
    console.error(e);
    try { await DB.deleteDoc(id); } catch { /* ignore */ }
    busyDone();
    if (!aborted) toast(t('errFailed') + ' (' + name + ')');
    return null;
  }
}

async function handleFiles(files) {
  const list = [...files];
  let last = null;
  for (const f of list) last = (await importFile(f)) || last;
  if (last) {
    if (list.length === 1) openFromLibrary(last);
    else { toast(t('imported')); renderLibrary(); }
  }
}

async function newBlankNotebook(tpl) {
  const id = DB.uid();
  const doc = {
    id, title: `${t('note')} ${new Date().toLocaleDateString(getLang() === 'ar' ? 'ar-IQ' : undefined)}`,
    kind: 'blank', created: Date.now(), updated: Date.now(),
    pages: [{ t: 'blank', tpl, w: 595, h: 842, u: 1, strokes: [], texts: [] }],
  };
  const c = document.createElement('canvas');
  c.width = 360; c.height = 509;
  drawTemplate(c.getContext('2d'), tpl, 360, 509);
  await DB.putBlob(id + ':thumb', await thumbFromCanvas(c));
  await DB.putDoc(doc);
  openFromLibrary(id);
}

function templateSheet(onPick) {
  sheet((el, close) => {
    el.innerHTML = `<h3>${t('template')}</h3><div class="tpl-grid"></div>`;
    for (const tpl of ['blank', 'lined', 'grid', 'dots']) {
      const b = document.createElement('button');
      b.innerHTML = `<canvas width="150" height="200"></canvas><span>${t(tpl)}</span>`;
      drawTemplate($('canvas', b).getContext('2d'), tpl, 150, 200);
      b.onclick = () => { close(); onPick(tpl); };
      $('.tpl-grid', el).appendChild(b);
    }
  });
}

/* ------------------------------------------------------------------ editor state */
const E = {
  doc: null, pdf: null, zoom: 1, baseW: 600, pageEls: [], tops: [], hist: [], fut: [],
  drawing: null, tap: null, io: null, rq: Promise.resolve(), dirty: false, saveT: null,
  thumbDirty: false, pushed: false, lastPenT: 0, mpan: null,
};
const sc = () => $('#scroller');
const idxOf = (pg) => E.doc.pages.indexOf(pg);
const pageEl = (pg) => E.pageEls[idxOf(pg)];

function markDirty(pg) {
  E.dirty = true;
  if (pg && E.doc && pg === E.doc.pages[0]) E.thumbDirty = true;
  clearTimeout(E.saveT);
  E.saveT = setTimeout(saveNow, 700);
}
async function saveNow() {
  clearTimeout(E.saveT);
  if (!E.doc || !E.dirty) return;
  E.dirty = false;
  E.doc.updated = Date.now();
  try { await DB.putDoc(E.doc); } catch (e) { console.warn(e); toast('Could not save'); }
}

function computeBase() { E.baseW = Math.max(240, Math.min(sc().clientWidth - 16, 980)); }

async function openDoc(id) {
  const doc = await DB.getDoc(id);
  if (!doc) { location.replace('#'); return; }
  let pdf = null;
  if (doc.pages.some((p) => p.t === 'pdf')) {
    try { busy(t('importing'), null); pdf = await withPdf(doc); busyDone(); }
    catch (e) { busyDone(); console.error(e); toast(t('errFailed')); location.replace('#'); return; }
  }
  E.doc = doc; E.pdf = pdf; E.zoom = 1; E.hist = []; E.fut = []; E.dirty = false; E.thumbDirty = false;
  $('#lib').hidden = true;
  $('#ed').hidden = false;
  $('#edTitle').textContent = doc.title;
  computeBase();
  buildPages();
  setTool(S.tool);
  updateUndo();
  if (doc.lastPage) scrollToPage(Math.min(doc.lastPage, doc.pages.length - 1));
}

async function leaveEditor() {
  if (!E.doc) return;
  hidePop(); hideEdMenu();
  const doc = E.doc, pdf = E.pdf;
  doc.lastPage = curPage();
  E.dirty = true;
  await saveNow();
  if (E.thumbDirty) {
    try {
      const c = await flattenPage(doc.pages[0], pdf, 360);
      await DB.putBlob(doc.id + ':thumb', await thumbFromCanvas(c));
    } catch (e) { console.warn(e); }
  }
  if (E.io) E.io.disconnect();
  $('#pages').innerHTML = '';
  E.pageEls = []; E.doc = null; E.pdf = null;
  closePdf(pdf);
}

/* ------------------------------------------------------------------ pages */
function buildPages() {
  const host = $('#pages');
  host.innerHTML = '';
  E.pageEls = [];
  if (E.io) E.io.disconnect();
  E.io = new IntersectionObserver(onIntersect, { root: sc(), rootMargin: '900px 0px' });
  E.doc.pages.forEach((pg, i) => {
    const pe = document.createElement('div');
    pe.className = 'page';
    pe._pg = pg;
    pe.innerHTML = '<canvas class="bg"></canvas><canvas class="hl"></canvas><canvas class="pen"></canvas><div class="tl"></div><span class="pnum"></span>';
    $('.pnum', pe).textContent = i + 1;
    for (const tx of pg.texts) $('.tl', pe).appendChild(makeTextBox(pg, tx));
    host.appendChild(pe);
    E.pageEls.push(pe);
    E.io.observe(pe);
  });
  layoutPages();
}

function layoutPages() {
  const w = E.baseW * E.zoom;
  for (const pe of E.pageEls) {
    const pg = pe._pg;
    const h = (w * pg.h) / pg.w;
    pe.style.width = w + 'px';
    pe.style.height = h + 'px';
    pe.style.setProperty('--pw', w + 'px');
    pe._cw = w; pe._ch = h;
  }
  E.tops = E.pageEls.map((pe) => pe.offsetTop);
  updatePageInd();
}

function onIntersect(entries) {
  for (const en of entries) {
    const pe = en.target;
    pe._vis = en.isIntersecting;
    if (en.isIntersecting) queueRender(pe); else releasePage(pe);
  }
}
function queueRender(pe) { E.rq = E.rq.then(() => renderPage(pe)).catch((e) => console.warn(e)); }
function refreshVisible() { for (const pe of E.pageEls) if (pe._vis) queueRender(pe); }
let refreshT;
const scheduleRefresh = () => { clearTimeout(refreshT); refreshT = setTimeout(refreshVisible, 140); };

function pixelRatioFor(cw, ch) {
  let q = Math.min(window.devicePixelRatio || 1, 2.5);
  const maxPx = 14e6;
  if (cw * ch * q * q > maxPx) q = Math.sqrt(maxPx / (cw * ch));
  return Math.max(q, 0.5);
}

async function renderPage(pe) {
  if (!pe._vis || !pe.isConnected || !E.doc) return;
  const pg = pe._pg;
  const q = pixelRatioFor(pe._cw, pe._ch);
  const pxW = Math.round(pe._cw * q), pxH = Math.round(pe._ch * q);
  const [bg, hl, pen] = $$('canvas', pe);
  if (hl.width !== pxW || hl.height !== pxH) { hl.width = pen.width = pxW; hl.height = pen.height = pxH; }
  redrawInk(pe);
  if (pe._bgW === pxW) return;
  if (pe._task && pe._task.cancel) pe._task.cancel();
  const stamp = (pe._stamp = (pe._stamp || 0) + 1);
  try {
    const ok = await drawBg(bg, pg, E.pdf, pxW, { onTask: (tk) => { pe._task = tk; }, isStale: () => pe._stamp !== stamp || !pe._vis });
    if (ok) pe._bgW = pxW;
  } catch (e) { if (!e || e.name !== 'RenderingCancelledException') console.warn(e); }
}
function releasePage(pe) {
  for (const c of $$('canvas', pe)) { c.width = 1; c.height = 1; }
  pe._bgW = 0; pe._stamp = (pe._stamp || 0) + 1;
  if (pe._task && pe._task.cancel) pe._task.cancel();
}

function redrawInk(pe, preview) {
  const pg = pe._pg;
  const [, hl, pen] = $$('canvas', pe);
  if (pen.width <= 1) return;
  const hx = hl.getContext('2d'), px = pen.getContext('2d');
  hx.clearRect(0, 0, hl.width, hl.height);
  px.clearRect(0, 0, pen.width, pen.height);
  for (const s of pg.strokes) drawStroke(s.tool === 'hl' ? hx : px, s, pen.width);
  if (preview) drawStroke(preview.tool === 'hl' ? hx : px, preview, pen.width);
}

function curPage() {
  const el = sc();
  const mid = el.scrollTop + el.clientHeight * 0.4;
  let lo = 0, hi = E.tops.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (E.tops[m] <= mid) lo = m; else hi = m - 1; }
  return Math.max(0, lo);
}
function updatePageInd() { if (E.doc) $('#pageInd').textContent = `${curPage() + 1} / ${E.doc.pages.length}`; }
function scrollToPage(i) { sc().scrollTop = (E.tops[i] || 0) - 10; updatePageInd(); }
let scrollRaf = 0;
sc().addEventListener('scroll', () => { if (!scrollRaf) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; updatePageInd(); }); }, { passive: true });

/* ------------------------------------------------------------------ zoom / pan */
function setZoom(z, fx, fy) {
  const el = sc();
  z = clamp(z, 0.5, 5);
  if (Math.abs(z - E.zoom) < 1e-4) return;
  const old = E.zoom;
  const cx = (el.scrollLeft + fx) / old, cy = (el.scrollTop + fy) / old;
  E.zoom = z;
  layoutPages();
  el.scrollLeft = cx * z - fx;
  el.scrollTop = cy * z - fy;
  scheduleRefresh();
}
const zoomBy = (f, cx, cy) => {
  const r = sc().getBoundingClientRect();
  setZoom(E.zoom * f, (cx ?? r.left + r.width / 2) - r.left, (cy ?? r.top + r.height / 2) - r.top);
};
sc().addEventListener('wheel', (e) => {
  if (e.ctrlKey) { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY); }
}, { passive: false });

let G = null; // active touch gesture
let momentum = 0;
function stopMomentum() { cancelAnimationFrame(momentum); momentum = 0; }
function startMomentum(vx, vy) {
  let last = performance.now();
  const step = (now) => {
    const dt = now - last; last = now;
    const f = Math.pow(0.94, dt / 16);
    vx *= f; vy *= f;
    sc().scrollLeft -= vx * dt; sc().scrollTop -= vy * dt;
    if (Math.abs(vx) > 0.02 || Math.abs(vy) > 0.02) momentum = requestAnimationFrame(step);
  };
  momentum = requestAnimationFrame(step);
}
const touchMid = (e) => {
  const a = e.touches[0], b = e.touches[1];
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1 };
};
sc().addEventListener('touchstart', (e) => {
  if (!E.doc) return;
  stopMomentum();
  if (e.touches.length >= 2) {
    cancelDrawing();
    const el = sc(), r = el.getBoundingClientRect(), m = touchMid(e);
    G = { mode: 'pinch', d0: m.d, z0: E.zoom, cx: (el.scrollLeft + m.x - r.left) / E.zoom, cy: (el.scrollTop + m.y - r.top) / E.zoom, raf: 0, latest: null };
    e.preventDefault();
    return;
  }
  if (E.drawing || performance.now() - E.lastPenT < 1500) return;
  if (e.target.closest('.tbox')) return;
  const t0 = e.touches[0];
  G = { mode: 'pan', x: t0.clientX, y: t0.clientY, sl: sc().scrollLeft, st: sc().scrollTop, vx: 0, vy: 0, lt: performance.now(), lx: t0.clientX, ly: t0.clientY };
}, { passive: false });
sc().addEventListener('touchmove', (e) => {
  if (!G) return;
  e.preventDefault();
  const el = sc();
  if (G.mode === 'pinch' && e.touches.length >= 2) {
    const r = el.getBoundingClientRect(), m = touchMid(e);
    G.latest = { m, r };
    if (!G.raf) G.raf = requestAnimationFrame(() => {
      G.raf = 0;
      if (!G || !G.latest) return;
      const { m: mm, r: rr } = G.latest;
      const z = clamp(G.z0 * (mm.d / G.d0), 0.5, 5);
      E.zoom = z;
      layoutPages();
      el.scrollLeft = G.cx * z - (mm.x - rr.left);
      el.scrollTop = G.cy * z - (mm.y - rr.top);
    });
  } else if (G.mode === 'pan' && e.touches.length === 1) {
    const t0 = e.touches[0], now = performance.now();
    el.scrollLeft = G.sl - (t0.clientX - G.x);
    el.scrollTop = G.st - (t0.clientY - G.y);
    const dt = Math.max(1, now - G.lt);
    G.vx = 0.7 * G.vx + 0.3 * ((t0.clientX - G.lx) / dt);
    G.vy = 0.7 * G.vy + 0.3 * ((t0.clientY - G.ly) / dt);
    G.lt = now; G.lx = t0.clientX; G.ly = t0.clientY;
  }
}, { passive: false });
function endTouch(e) {
  if (!G) return;
  if (G.mode === 'pinch') { if (e.touches.length < 2) { cancelAnimationFrame(G.raf); G = null; scheduleRefresh(); } return; }
  if (e.touches.length === 0) {
    const g = G; G = null;
    if (performance.now() - g.lt < 80 && (Math.abs(g.vx) > 0.15 || Math.abs(g.vy) > 0.15)) startMomentum(g.vx, g.vy);
  }
}
sc().addEventListener('touchend', endTouch, { passive: true });
sc().addEventListener('touchcancel', endTouch, { passive: true });

/* ------------------------------------------------------------------ history */
function pushHist(h) {
  E.hist.push(h);
  if (E.hist.length > 300) E.hist.shift();
  E.fut = [];
  updateUndo();
}
function undo() { const h = E.hist.pop(); if (!h) return; h.undo(); E.fut.push(h); updateUndo(); }
function redo() { const h = E.fut.pop(); if (!h) return; h.redo(); E.hist.push(h); updateUndo(); }
function updateUndo() { $('#btnUndo').disabled = !E.hist.length; $('#btnRedo').disabled = !E.fut.length; }

/* ------------------------------------------------------------------ drawing */
const toPage = (pe, e) => {
  const r = pe.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width, e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5];
};

function cancelDrawing() {
  const d = E.drawing;
  if (!d) return;
  E.drawing = null;
  if (d.tool === 'eraser') { finishErase(d); return; }
  redrawInk(d.pe);
}

function finishErase(d) {
  if (!d.removed.length) return;
  const { pg, removed } = d;
  const pe = pageEl(pg);
  pushHist({
    undo() { for (const [i, s] of [...removed].sort((a, b) => a[0] - b[0])) pg.strokes.splice(Math.min(i, pg.strokes.length), 0, s); if (pe) redrawInk(pe); markDirty(pg); },
    redo() { for (const [, s] of removed) { const k = pg.strokes.indexOf(s); if (k >= 0) pg.strokes.splice(k, 1); } if (pe) redrawInk(pe); markDirty(pg); },
  });
  markDirty(pg);
}

function commitStroke(pg, s) {
  pg.strokes.push(s);
  const pe = pageEl(pg);
  pushHist({
    undo() { const k = pg.strokes.indexOf(s); if (k >= 0) pg.strokes.splice(k, 1); if (pe) redrawInk(pe); markDirty(pg); },
    redo() { if (!pg.strokes.includes(s)) pg.strokes.push(s); if (pe) redrawInk(pe); markDirty(pg); },
  });
  markDirty(pg);
}

function eraseAt(d, pt) {
  const pg = d.pg, r = S.size.eraser / 2;
  let hit = false;
  for (let i = pg.strokes.length - 1; i >= 0; i--) {
    if (hitStroke(pg.strokes[i], pt[0], pt[1], r)) { d.removed.push([i, pg.strokes[i]]); pg.strokes.splice(i, 1); hit = true; }
  }
  if (hit) redrawInk(d.pe);
}

const sc_ = sc();
sc_.addEventListener('pointerdown', (e) => {
  if (!E.doc) return;
  hidePop(); hideEdMenu();
  if (e.pointerType === 'pen') E.lastPenT = performance.now();
  if (e.target.closest('.tbox')) return;
  const tool = S.tool;
  const pe = e.target.closest('.page');
  if (!pe) {
    if (e.pointerType === 'mouse' && tool === 'hand') startMousePan(e);
    return;
  }
  if (tool === 'hand') { if (e.pointerType === 'mouse') startMousePan(e); return; }
  if (e.pointerType === 'touch') {
    if (!S.fingerDraw || performance.now() - E.lastPenT < 1500) return;
  }
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (tool === 'text') { E.tap = { pe, x: e.clientX, y: e.clientY, t: performance.now() }; return; }
  e.preventDefault();
  const pg = pe._pg, pt = toPage(pe, e);
  try { pe.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  const d = { pid: e.pointerId, pe, pg, tool, removed: [] };
  if (tool === 'pen' || tool === 'hl') {
    d.stroke = { tool, c: S.color[tool], w: S.size[tool], p: [pt[0], pt[1], pt[2]] };
    const [, hl, pen] = $$('canvas', pe);
    d.ctx = (tool === 'hl' ? hl : pen).getContext('2d');
    d.W = pen.width;
    drawStroke(d.ctx, d.stroke, d.W);
  } else if (tool === 'eraser') {
    eraseAt(d, pt);
  } else if (tool === 'shape') {
    d.stroke = { tool: S.shape, c: S.color.shape, w: S.size.shape, a: [pt[0], pt[1]], b: [pt[0], pt[1]] };
  }
  E.drawing = d;
});

sc_.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'pen') E.lastPenT = performance.now();
  if (E.mpan) { sc_.scrollLeft = E.mpan.sl - (e.clientX - E.mpan.x); sc_.scrollTop = E.mpan.st - (e.clientY - E.mpan.y); return; }
  if (E.tap) { if (Math.hypot(e.clientX - E.tap.x, e.clientY - E.tap.y) > 12) E.tap = null; }
  const d = E.drawing;
  if (!d || e.pointerId !== d.pid) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of (evs.length ? evs : [e])) {
    const pt = toPage(d.pe, ev);
    if (d.tool === 'pen' || d.tool === 'hl') {
      const p = d.stroke.p, n = p.length;
      if (Math.hypot(pt[0] - p[n - 3], pt[1] - p[n - 2]) < 0.0007) continue;
      p.push(pt[0], pt[1], pt[2]);
      drawLivePiece(d.ctx, d.stroke, d.W);
    } else if (d.tool === 'eraser') eraseAt(d, pt);
    else if (d.tool === 'shape') { d.stroke.b = [pt[0], pt[1]]; redrawInk(d.pe, d.stroke); }
  }
}, { passive: true });

function endPointer(e) {
  if (E.mpan) { E.mpan = null; return; }
  if (E.tap && e.type === 'pointerup') {
    const tp = E.tap; E.tap = null;
    if (performance.now() - tp.t < 600 && Math.hypot(e.clientX - tp.x, e.clientY - tp.y) < 12) {
      const pt = toPage(tp.pe, e);
      addText(tp.pe, pt[0], pt[1]);
    }
    return;
  }
  E.tap = null;
  const d = E.drawing;
  if (!d || e.pointerId !== d.pid) return;
  E.drawing = null;
  if (e.type === 'pointercancel') { if (d.tool === 'eraser') finishErase(d); else redrawInk(d.pe); return; }
  if (d.tool === 'pen' || d.tool === 'hl') { commitStroke(d.pg, d.stroke); redrawInk(d.pe); }
  else if (d.tool === 'eraser') finishErase(d);
  else if (d.tool === 'shape') {
    const s = d.stroke;
    if (Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 0.006) commitStroke(d.pg, s);
    redrawInk(d.pe);
  }
}
sc_.addEventListener('pointerup', endPointer);
sc_.addEventListener('pointercancel', endPointer);
function startMousePan(e) {
  E.mpan = { x: e.clientX, y: e.clientY, sl: sc_.scrollLeft, st: sc_.scrollTop };
  try { sc_.setPointerCapture(e.pointerId); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ text boxes */
function placeText(d, tx, pg) {
  d.style.left = tx.x * 100 + '%';
  d.style.top = (tx.y / (pg.h / pg.w)) * 100 + '%';
  d.style.width = tx.w * 100 + '%';
  d.style.fontSize = `calc(var(--pw) * ${tx.s})`;
  d.style.color = tx.c;
}

function insertText(pg, tx) {
  if (!pg.texts.includes(tx)) pg.texts.push(tx);
  const pe = pageEl(pg);
  if (!pe || $(`.tbox[data-id="${tx.id}"]`, pe)) return;
  $('.tl', pe).appendChild(makeTextBox(pg, tx));
}
function deleteText(pg, tx) {
  const k = pg.texts.indexOf(tx);
  if (k >= 0) pg.texts.splice(k, 1);
  const pe = pageEl(pg);
  const node = pe && $(`.tbox[data-id="${tx.id}"]`, pe);
  if (node) node.remove();
}

function makeTextBox(pg, tx) {
  const d = document.createElement('div');
  d.className = 'tbox';
  d.dataset.id = tx.id;
  d.innerHTML = `<div class="tgrip">${icon('hand', 14)}</div><div class="tedit" contenteditable="true" dir="auto" spellcheck="false" role="textbox"></div><div class="tdel">${icon('close', 14)}</div><div class="trs"></div>`;
  const ed = $('.tedit', d);
  ed.textContent = tx.text;
  placeText(d, tx, pg);
  let before = tx.text;
  ed.addEventListener('focus', () => { before = tx.text; });
  ed.addEventListener('input', () => { tx.text = ed.innerText.replace(/​/g, '').replace(/\n$/, ''); markDirty(pg); });
  ed.addEventListener('blur', () => {
    const after = tx.text;
    const had = before.trim().length > 0;
    if (!after.trim()) {
      deleteText(pg, tx); markDirty(pg);
      if (had) pushHist({ undo() { tx.text = before; insertText(pg, tx); markDirty(pg); }, redo() { deleteText(pg, tx); markDirty(pg); } });
    } else if (!had) {
      const a = after;
      pushHist({ undo() { deleteText(pg, tx); markDirty(pg); }, redo() { tx.text = a; insertText(pg, tx); markDirty(pg); } });
    } else if (before !== after) {
      const b = before, a = after;
      const apply = (v) => { tx.text = v; const n = pageEl(pg) && $(`.tbox[data-id="${tx.id}"] .tedit`, pageEl(pg)); if (n) n.textContent = v; markDirty(pg); };
      pushHist({ undo() { apply(b); }, redo() { apply(a); } });
    }
    before = tx.text;
  });
  $('.tdel', d).addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const saved = { ...tx };
    deleteText(pg, tx); markDirty(pg);
    pushHist({ undo() { Object.assign(tx, saved); insertText(pg, tx); markDirty(pg); }, redo() { deleteText(pg, tx); markDirty(pg); } });
  });
  const drag = (handle, onMove, onDone) => {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const pe = pageEl(pg), r = pe.getBoundingClientRect();
      const start = { x: e.clientX, y: e.clientY, tx: { ...tx } };
      handle.setPointerCapture(e.pointerId);
      const mv = (ev) => { onMove(start, (ev.clientX - start.x) / r.width, (ev.clientY - start.y) / r.width, r); placeText(d, tx, pg); };
      const up = () => {
        handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
        onDone(start); markDirty(pg);
      };
      handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    });
  };
  const hist = (start) => {
    const from = { x: start.tx.x, y: start.tx.y, w: start.tx.w }, to = { x: tx.x, y: tx.y, w: tx.w };
    if (from.x === to.x && from.y === to.y && from.w === to.w) return;
    const set = (v) => { Object.assign(tx, v); const n = pageEl(pg) && $(`.tbox[data-id="${tx.id}"]`, pageEl(pg)); if (n) placeText(n, tx, pg); markDirty(pg); };
    pushHist({ undo() { set(from); }, redo() { set(to); } });
  };
  drag($('.tgrip', d), (s, dx, dy) => {
    const ratio = pg.h / pg.w;
    tx.x = clamp(s.tx.x + dx, 0, 1 - 0.05); tx.y = clamp(s.tx.y + dy, 0, ratio - 0.03);
  }, hist);
  drag($('.trs', d), (s, dx) => { tx.w = clamp(s.tx.w + dx, 0.1, 1 - tx.x); }, hist);
  return d;
}

function addText(pe, x, y) {
  const pg = pe._pg, ratio = pg.h / pg.w;
  const tx = { id: DB.uid(), x: clamp(x, 0, 0.88), y: clamp(y, 0, ratio - 0.04), w: 0.4, text: '', c: S.color.text, s: S.size.text };
  tx.w = Math.min(0.4, 0.98 - tx.x);
  pg.texts.push(tx);
  const node = makeTextBox(pg, tx);
  $('.tl', pe).appendChild(node);
  const ed = $('.tedit', node);
  ed.focus();
}

/* ------------------------------------------------------------------ toolbar & popover */
const SIZE_RANGE = {
  pen: [0.0012, 0.012], hl: [0.012, 0.05], eraser: [0.01, 0.07], shape: [0.0012, 0.012], text: [0.014, 0.07],
};

function setTool(tool) {
  S.tool = tool; saveSettings();
  $$('#tools [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
  const ed = $('#ed');
  ed.className = ed.className.replace(/\bmode-\S+/g, '').trim() + ' view mode-' + tool;
  updateColorDot();
  hidePop();
}
function updateColorDot() {
  const c = S.color[S.tool] || S.color.pen;
  $('#colorDot i').style.background = S.tool === 'eraser' ? '#e5e7eb' : c;
}
function hidePop() { $('#pop').hidden = true; }
function hideEdMenu() { $('#edMenu').hidden = true; }

function showPop() {
  const tool = S.tool;
  if (tool === 'hand') return;
  const pop = $('#pop');
  pop.innerHTML = '';
  if (tool === 'shape') {
    const row = document.createElement('div');
    row.className = 'shape-row';
    for (const sh of ['line', 'arrow', 'rect', 'oval']) {
      const b = document.createElement('button');
      b.className = S.shape === sh ? 'on' : '';
      b.title = t(sh);
      b.innerHTML = icon(sh);
      b.onclick = () => { S.shape = sh; saveSettings(); showPop(); };
      row.appendChild(b);
    }
    pop.appendChild(row);
  }
  if (tool !== 'eraser') {
    const sw = document.createElement('div');
    sw.className = 'swatches';
    const cur = (S.color[tool] || '').toLowerCase();
    for (const c of COLORS) {
      const b = document.createElement('button');
      b.className = 'sw' + (cur === c ? ' on' : '');
      b.style.background = c;
      b.setAttribute('aria-label', c);
      b.onclick = () => { S.color[tool] = c; saveSettings(); updateColorDot(); showPop(); };
      sw.appendChild(b);
    }
    const cu = document.createElement('div');
    cu.className = 'sw custom';
    cu.innerHTML = '<input type="color">';
    $('input', cu).value = /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#000000';
    $('input', cu).oninput = (ev) => { S.color[tool] = ev.target.value; saveSettings(); updateColorDot(); };
    sw.appendChild(cu);
    pop.appendChild(sw);
  }
  const [lo, hi] = SIZE_RANGE[tool] || SIZE_RANGE.pen;
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<label>${t('size')}</label><input type="range" min="${lo}" max="${hi}" step="${(hi - lo) / 40}"><div class="prev"></div>`;
  const rng = $('input', row), prev = $('.prev', row);
  rng.value = S.size[tool];
  const paint = () => {
    const px = clamp(S.size[tool] * 400, 2, 28);
    prev.style.color = S.color[tool] || '#111827';
    prev.innerHTML = tool === 'text' ? `<span style="font-size:${clamp(S.size[tool] * 520, 12, 30)}px;font-weight:600">Aa</span>` : `<i style="width:${px}px;height:${px}px"></i>`;
    if (tool === 'eraser') prev.style.color = '#9ca3af';
  };
  rng.oninput = () => { S.size[tool] = +rng.value; saveSettings(); paint(); };
  paint();
  pop.appendChild(row);
  pop.hidden = false;
}

$('#tools').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  hideEdMenu();
  if (b.id === 'colorDot') { if ($('#pop').hidden) { if (S.tool === 'hand') setTool('pen'); showPop(); } else hidePop(); return; }
  const tool = b.dataset.tool;
  if (S.tool === tool) { if ($('#pop').hidden) showPop(); else hidePop(); } else setTool(tool);
});

/* ------------------------------------------------------------------ editor header & menu */
$('#btnUndo').onclick = undo;
$('#btnRedo').onclick = redo;
$('#zIn').onclick = () => zoomBy(1.3);
$('#zOut').onclick = () => zoomBy(1 / 1.3);
$('#zFit').onclick = () => { setZoom(1, sc().clientWidth / 2, 0); sc().scrollLeft = 0; };
$('#edBack').onclick = () => { if (E.pushed) history.back(); else location.replace('#'); };
$('#edTitle').onclick = async () => {
  if (!E.doc) return;
  const v = await askText(t('rename'), E.doc.title, { ok: t('save') });
  if (v && v.trim()) { E.doc.title = v.trim().slice(0, 120); $('#edTitle').textContent = E.doc.title; E.dirty = true; saveNow(); }
};
window.addEventListener('keydown', (e) => {
  if (!E.doc || !(e.ctrlKey || e.metaKey) || e.target.closest?.('.tedit, input')) return;
  if (e.key === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(); }
  if (e.key === 'y') { e.preventDefault(); redo(); }
});

$('#btnMore').onclick = (e) => {
  e.stopPropagation();
  const m = $('#edMenu');
  if (!m.hidden) { m.hidden = true; return; }
  hidePop();
  m.innerHTML = '';
  const items = [
    ['pages', t('pageList'), pageListSheet],
    ['pageAdd', t('addPage'), () => templateSheet(insertPage)],
    ['pageDel', t('deletePage'), deleteCurrentPage],
    null,
    ['download', t('exportPdf'), exportCurrentPdf],
    ['image', t('exportImage'), exportCurrentImage],
    null,
    ['sliders', t('settings'), settingsSheet],
  ];
  for (const it of items) {
    if (!it) { m.appendChild(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.innerHTML = `${icon(it[0])}<span></span>`;
    $('span', b).textContent = it[1];
    b.onclick = () => { m.hidden = true; it[2](); };
    m.appendChild(b);
  }
  m.hidden = false;
};
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#edMenu, #btnMore')) hideEdMenu();
  if (!e.target.closest('#pop, #tools')) hidePop();
  if (!e.target.closest('#fabMenu, #fab')) $('#fabMenu').hidden = true;
}, true);

function pageListSheet() {
  sheet((el, close) => {
    el.innerHTML = `<h3>${t('pageList')}</h3><div class="page-grid"></div>`;
    const cur = curPage();
    E.doc.pages.forEach((_, i) => {
      const b = document.createElement('button');
      b.textContent = i + 1;
      if (i === cur) b.className = 'on';
      b.onclick = () => { close(); scrollToPage(i); };
      $('.page-grid', el).appendChild(b);
    });
  });
}
function rebuildAndGo(i) { E.hist = []; E.fut = []; updateUndo(); buildPages(); scrollToPage(i); markDirty(E.doc.pages[0]); }
function insertPage(tpl) {
  const idx = curPage(), ref = E.doc.pages[idx];
  const pg = { t: 'blank', tpl, w: ref.w, h: ref.h, u: ref.u || 1, strokes: [], texts: [] };
  E.doc.pages.splice(idx + 1, 0, pg);
  rebuildAndGo(idx + 1);
}
async function deleteCurrentPage() {
  if (E.doc.pages.length < 2) { toast(t('onlyPage')); return; }
  if (!(await confirmBox(t('deletePageTitle'), t('deletePageText')))) return;
  const idx = curPage();
  E.doc.pages.splice(idx, 1);
  rebuildAndGo(Math.min(idx, E.doc.pages.length - 1));
}
async function exportCurrentPdf() {
  await saveNow();
  try {
    busy(t('exporting'), 0);
    const blob = await exportPdf(E.doc, E.pdf, (f) => busy(t('exporting'), f));
    const r = await saveBlob(safeName(E.doc.title) + '.pdf', blob);
    busyDone(); toast(r === 'shared' ? t('shared') : t('saved'));
  } catch (e) { console.error(e); busyDone(); toast(t('errExport')); }
}
async function exportCurrentImage() {
  try {
    busy(t('exporting'), null);
    const i = curPage();
    const blob = await exportPageImage(E.doc.pages[i], E.pdf);
    const r = await saveBlob(`${safeName(E.doc.title)}-${i + 1}.png`, blob);
    busyDone(); toast(r === 'shared' ? t('shared') : t('saved'));
  } catch (e) { console.error(e); busyDone(); toast(t('errExport')); }
}

function settingsSheet() {
  sheet((el, close) => {
    el.innerHTML = `
      <h3>${t('settings')}</h3>
      <div class="set-row"><div>${t('language')}</div><div class="seg"><button data-l="en">English</button><button data-l="ar">العربية</button></div></div>
      <div class="set-row"><div>${t('fingerDraw')}<small>${t('fingerDrawHint')}</small></div><button class="switch ${S.fingerDraw ? 'on' : ''}" id="swFinger" aria-label="${t('fingerDraw')}"></button></div>
      <ul class="tips"><li>${t('help1')}</li><li>${t('help2')}</li><li>${t('help3')}</li></ul>
      <div class="actions"><button class="btn primary" data-x="d">${t('done')}</button></div>`;
    $$('.seg button', el).forEach((b) => {
      b.classList.toggle('on', b.dataset.l === getLang());
      b.onclick = () => { setLang(b.dataset.l); close(); onLangChange(); settingsSheet(); };
    });
    $('#swFinger', el).onclick = (e) => { S.fingerDraw = !S.fingerDraw; saveSettings(); e.currentTarget.classList.toggle('on', S.fingerDraw); };
    $('[data-x=d]', el).onclick = close;
  });
}
function onLangChange() {
  applyLang();
  if (!$('#lib').hidden) renderLibrary();
  if (E.doc) { $('#edTitle').textContent = E.doc.title; updatePageInd(); }
}

/* ------------------------------------------------------------------ library wiring */
$('#btnSettings').onclick = settingsSheet;
$('#q').addEventListener('input', () => renderLibrary());
$('#fab').onclick = () => { $('#fabMenu').hidden = !$('#fabMenu').hidden; };
$('#fabMenu').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $('#fabMenu').hidden = true;
  const act = b.dataset.act;
  if (act === 'blank') { templateSheet(newBlankNotebook); return; }
  const f = $('#file');
  f.accept = ACCEPT[act];
  f.click();
});
$('#file').addEventListener('change', (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) handleFiles(files);
});
$('#lib').addEventListener('dragover', (e) => e.preventDefault());
$('#lib').addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

/* ------------------------------------------------------------------ routing & lifecycle */
async function route() {
  const m = /^#\/doc\/(.+)$/.exec(location.hash);
  if (m) {
    if (E.doc && E.doc.id === m[1]) return;
    await leaveEditor();
    await openDoc(m[1]);
  } else {
    await leaveEditor();
    $('#ed').hidden = true;
    $('#lib').hidden = false;
    E.pushed = false;
    renderLibrary();
  }
}
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (document.hidden) { E.dirty = E.dirty || false; saveNow(); } });
window.addEventListener('pagehide', () => { saveNow(); });
let rz;
window.addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => { if (!E.doc) return; computeBase(); layoutPages(); refreshVisible(); }, 150);
});

fillIcons();
applyLang();
route();
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__ink = { E, S, DB }; // handy for debugging/tests
