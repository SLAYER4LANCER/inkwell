// DOCX -> paginated page images.
// Reads the OOXML directly (JSZip), builds inline-styled HTML blocks, paginates them
// into A4/Letter-sized pages and rasterizes each page.
import { rasterize, esc } from './rasterize.js';
import { extractDomWords } from './textlayer.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const parseXml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const kids = (el, n) => (el ? [...el.children].filter((c) => c.localName === n) : []);
const kid = (el, n) => (el ? [...el.children].find((c) => c.localName === n) || null : null);
const wa = (el, n) => {
  if (!el) return null;
  const v = el.getAttributeNS(W, n);
  return v !== null && v !== '' ? v : el.getAttribute('w:' + n);
};
const onoff = (el) => {
  if (!el) return undefined;
  const v = wa(el, 'val');
  return !(v === '0' || v === 'false' || v === 'off');
};
const num = (v, d = undefined) => (v === null || v === undefined || v === '' || isNaN(+v) ? d : +v);

const HL = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000',
  darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000',
  darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff',
};

function readRPr(rPr) {
  const o = {};
  if (!rPr) return o;
  let v;
  if ((v = kid(rPr, 'b'))) o.b = onoff(v);
  if ((v = kid(rPr, 'i'))) o.i = onoff(v);
  if ((v = kid(rPr, 'u'))) o.u = wa(v, 'val') !== 'none';
  if ((v = kid(rPr, 'strike') || kid(rPr, 'dstrike'))) o.strike = onoff(v);
  if ((v = kid(rPr, 'caps'))) o.caps = onoff(v);
  if ((v = kid(rPr, 'smallCaps'))) o.smallCaps = onoff(v);
  if ((v = kid(rPr, 'color'))) {
    const c = wa(v, 'val');
    if (c && c !== 'auto') o.color = '#' + c;
  }
  if ((v = kid(rPr, 'sz'))) o.sz = num(wa(v, 'val'));
  if ((v = kid(rPr, 'szCs'))) o.szCs = num(wa(v, 'val'));
  if ((v = kid(rPr, 'rFonts'))) {
    const f = wa(v, 'ascii') || wa(v, 'hAnsi');
    const th = wa(v, 'asciiTheme');
    o.font = f || (th ? (th.startsWith('major') ? 'Calibri Light' : 'Calibri') : undefined);
    o.fontCs = wa(v, 'cs') || undefined;
  }
  if ((v = kid(rPr, 'highlight'))) {
    const h = wa(v, 'val');
    if (h && h !== 'none') o.hl = HL[h] || h;
  }
  if ((v = kid(rPr, 'shd'))) {
    const f = wa(v, 'fill');
    if (f && f !== 'auto') o.hl = '#' + f;
  }
  if ((v = kid(rPr, 'vertAlign'))) o.va = wa(v, 'val');
  if ((v = kid(rPr, 'rtl'))) o.rtl = onoff(v);
  if ((v = kid(rPr, 'rStyle'))) o.rStyle = wa(v, 'val');
  return o;
}

function readPPr(pPr) {
  const o = {};
  if (!pPr) return o;
  let v;
  if ((v = kid(pPr, 'jc'))) o.jc = wa(v, 'val');
  if ((v = kid(pPr, 'bidi'))) o.bidi = onoff(v);
  if ((v = kid(pPr, 'pageBreakBefore'))) o.pageBreakBefore = onoff(v);
  if ((v = kid(pPr, 'ind'))) {
    o.ind = {
      left: num(wa(v, 'left') ?? wa(v, 'start')),
      right: num(wa(v, 'right') ?? wa(v, 'end')),
      firstLine: num(wa(v, 'firstLine')),
      hanging: num(wa(v, 'hanging')),
    };
  }
  if ((v = kid(pPr, 'spacing'))) {
    o.spacing = {
      before: num(wa(v, 'before')),
      after: num(wa(v, 'after')),
      line: num(wa(v, 'line')),
      lineRule: wa(v, 'lineRule') || 'auto',
    };
  }
  if ((v = kid(pPr, 'numPr'))) {
    o.numPr = { ilvl: num(wa(kid(v, 'ilvl'), 'val'), 0), numId: wa(kid(v, 'numId'), 'val') };
  }
  if ((v = kid(pPr, 'shd'))) {
    const f = wa(v, 'fill');
    if (f && f !== 'auto') o.shd = '#' + f;
  }
  if ((v = kid(pPr, 'pBdr'))) {
    const b = kid(v, 'bottom');
    if (b && wa(b, 'val') !== 'nil' && wa(b, 'val') !== 'none') {
      o.borderBottom = { color: wa(b, 'color') && wa(b, 'color') !== 'auto' ? '#' + wa(b, 'color') : '#000', sz: num(wa(b, 'sz'), 4) };
    }
  }
  if ((v = kid(pPr, 'contextualSpacing'))) o.ctxSp = onoff(v);
  if ((v = kid(pPr, 'pStyle'))) o.pStyle = wa(v, 'val');
  if ((v = kid(pPr, 'rPr'))) o.markR = readRPr(v);
  return o;
}

const merge = (...objs) => {
  const out = {};
  for (const o of objs) {
    if (!o) continue;
    for (const k of Object.keys(o)) {
      if (o[k] === undefined) continue;
      if ((k === 'ind' || k === 'spacing') && out[k]) out[k] = { ...out[k], ...Object.fromEntries(Object.entries(o[k]).filter(([, x]) => x !== undefined)) };
      else out[k] = o[k];
    }
  }
  return out;
};

function readBorders(el) {
  // returns {on:boolean,color,sz}
  const b = kid(el, 'tblBorders') || kid(el, 'tcBorders');
  if (!b) return null;
  const edges = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV', 'start', 'end']
    .map((n) => kid(b, n)).filter(Boolean);
  const real = edges.filter((e) => !['nil', 'none'].includes(wa(e, 'val')));
  if (!real.length) return { on: false };
  const c = wa(real[0], 'color');
  return { on: true, color: c && c !== 'auto' ? '#' + c : '#000000', sz: num(wa(real[0], 'sz'), 4) };
}

async function loadStyles(zip) {
  const f = zip.file('word/styles.xml');
  const styles = {};
  let defaults = { r: {}, p: {} };
  if (!f) return { styles, defaults };
  const doc = parseXml(await f.async('string'));
  const root = doc.documentElement;
  const dd = kid(root, 'docDefaults');
  if (dd) {
    defaults = {
      r: readRPr(kid(kid(dd, 'rPrDefault'), 'rPr')),
      p: readPPr(kid(kid(dd, 'pPrDefault'), 'pPr')),
    };
  }
  for (const s of kids(root, 'style')) {
    const id = wa(s, 'styleId');
    styles[id] = {
      type: wa(s, 'type'),
      based: wa(kid(s, 'basedOn'), 'val'),
      p: readPPr(kid(s, 'pPr')),
      r: readRPr(kid(s, 'rPr')),
      borders: readBorders(kid(s, 'tblPr')),
      def: wa(s, 'default') === '1',
    };
  }
  return { styles, defaults };
}

function resolveStyle(styles, id, guard = 0) {
  if (!id || !styles[id] || guard > 12) return { p: {}, r: {}, borders: null };
  const s = styles[id];
  const base = s.based ? resolveStyle(styles, s.based, guard + 1) : { p: {}, r: {}, borders: null };
  return { p: merge(base.p, s.p), r: merge(base.r, s.r), borders: s.borders || base.borders };
}

async function loadNumbering(zip) {
  const f = zip.file('word/numbering.xml');
  const abs = {};
  const nums = {};
  if (!f) return { abs, nums };
  const root = parseXml(await f.async('string')).documentElement;
  for (const a of kids(root, 'abstractNum')) {
    const id = wa(a, 'abstractNumId');
    const lvls = {};
    for (const l of kids(a, 'lvl')) {
      const il = num(wa(l, 'ilvl'), 0);
      lvls[il] = {
        fmt: wa(kid(l, 'numFmt'), 'val') || 'decimal',
        text: wa(kid(l, 'lvlText'), 'val') ?? '',
        start: num(wa(kid(l, 'start'), 'val'), 1),
        pPr: readPPr(kid(l, 'pPr')),
        rPr: readRPr(kid(l, 'rPr')),
      };
    }
    abs[id] = lvls;
  }
  for (const n of kids(root, 'num')) {
    const id = wa(n, 'numId');
    const ov = {};
    for (const o of kids(n, 'lvlOverride')) {
      const so = kid(o, 'startOverride');
      if (so) ov[num(wa(o, 'ilvl'), 0)] = num(wa(so, 'val'), 1);
    }
    nums[id] = { abs: wa(kid(n, 'abstractNumId'), 'val'), ov };
  }
  return { abs, nums };
}

async function loadRels(zip) {
  const f = zip.file('word/_rels/document.xml.rels');
  const rels = {};
  if (!f) return rels;
  const root = parseXml(await f.async('string')).documentElement;
  for (const r of [...root.children]) rels[r.getAttribute('Id')] = { target: r.getAttribute('Target'), type: r.getAttribute('Type'), mode: r.getAttribute('TargetMode') };
  return rels;
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' };

function toRoman(n, upper) {
  const map = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let s = '';
  for (const [v, r] of map) while (n >= v) { s += r; n -= v; }
  return upper ? s.toUpperCase() : s;
}
function toAlpha(n, upper) {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
  return upper ? s.toUpperCase() : s;
}
function fmtNum(n, fmt) {
  switch (fmt) {
    case 'lowerLetter': return toAlpha(n, false);
    case 'upperLetter': return toAlpha(n, true);
    case 'lowerRoman': return toRoman(n, false);
    case 'upperRoman': return toRoman(n, true);
    case 'decimalZero': return (n < 10 ? '0' : '') + n;
    case 'arabicAlpha': return 'أبجدهوزحطيكلمنسعفصقرشتثخذضظغ'[(n - 1) % 28];
    default: return String(n);
  }
}

const tw = (v) => (v === undefined ? 0 : v / 15); // twips -> px @96dpi

function fontStack(name, cs) {
  const list = [];
  const push = (n) => { if (n && !list.includes(n)) list.push(n); };
  push(name);
  push(cs);
  const n = (name || '').toLowerCase();
  const generic = /times|cambria|georgia|garamond|palatino|book antiqua|serif|simplified arabic|traditional arabic/.test(n) && !/sans/.test(n)
    ? 'serif'
    : /courier|consolas|mono/.test(n) ? 'monospace' : 'sans-serif';
  const quoted = list.map((x) => `'${x.replace(/'/g, '')}'`);
  if (generic === 'sans-serif') quoted.push("'Carlito'", "'Roboto'", "'Noto Sans Arabic'");
  quoted.push(generic);
  return quoted.join(',');
}

export async function importDocx(arrayBuffer, onProgress = () => {}) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Not a valid .docx file');
  const [{ styles, defaults }, numbering, rels] = await Promise.all([loadStyles(zip), loadNumbering(zip), loadRels(zip)]);
  const docXml = parseXml(await docFile.async('string'));
  const body = kid(docXml.documentElement, 'body');

  // Page geometry
  let pageW = 794, pageH = 1123, mT = 96, mB = 96, mL = 96, mR = 96;
  const sect = kids(body, 'sectPr').pop() || body.getElementsByTagNameNS(W, 'sectPr')[0];
  if (sect) {
    const sz = kid(sect, 'pgSz');
    if (sz) {
      let w = num(wa(sz, 'w')), h = num(wa(sz, 'h'));
      if (w && h) {
        if (wa(sz, 'orient') === 'landscape' && w < h) [w, h] = [h, w];
        pageW = Math.round(tw(w)); pageH = Math.round(tw(h));
      }
    }
    const mg = kid(sect, 'pgMar');
    if (mg) {
      mT = tw(num(wa(mg, 'top'), 1440)); mB = tw(num(wa(mg, 'bottom'), 1440));
      mL = tw(num(wa(mg, 'left'), 1440)); mR = tw(num(wa(mg, 'right'), 1440));
    }
  }
  const contentW = Math.max(200, pageW - mL - mR);
  const contentH = Math.max(200, pageH - mT - mB);

  const defR = defaults.r;
  const baseSz = defR.sz || 22;
  const counters = {};
  const imgCache = {};
  let breakBefore = false;

  async function imageData(rid) {
    const rel = rels[rid];
    if (!rel || rel.mode === 'External') return null;
    if (imgCache[rid] !== undefined) return imgCache[rid];
    let path = rel.target.replace(/^\//, '');
    if (!path.startsWith('word/')) path = 'word/' + path;
    path = path.replace(/word\/\.\.\//, '');
    const f = zip.file(path);
    const ext = path.split('.').pop().toLowerCase();
    if (!f || !MIME[ext]) return (imgCache[rid] = null);
    const b64 = await f.async('base64');
    return (imgCache[rid] = `data:${MIME[ext]};base64,${b64}`);
  }

  function runCss(r) {
    const sizeHalf = r.rtl && r.szCs ? r.szCs : r.sz || baseSz;
    const css = [`font-size:${(sizeHalf / 2) * (4 / 3)}px`];
    css.push(`font-family:${fontStack(r.font, r.fontCs)}`);
    if (r.b) css.push('font-weight:700');
    if (r.i) css.push('font-style:italic');
    const dec = [];
    if (r.u) dec.push('underline');
    if (r.strike) dec.push('line-through');
    if (dec.length) css.push(`text-decoration:${dec.join(' ')}`);
    if (r.color) css.push(`color:${r.color}`);
    if (r.hl) css.push(`background:${r.hl}`);
    if (r.caps) css.push('text-transform:uppercase');
    if (r.smallCaps) css.push('font-variant:small-caps');
    if (r.va === 'superscript') css.push('vertical-align:super;font-size:0.7em');
    if (r.va === 'subscript') css.push('vertical-align:sub;font-size:0.7em');
    return css.join(';');
  }

  async function renderRuns(container, pEl, paraBase, link) {
    let html = '';
    for (const node of [...pEl.children]) {
      const ln = node.localName;
      if (ln === 'r') html += await renderRun(node, paraBase, link);
      else if (ln === 'hyperlink') {
        const rid = node.getAttributeNS(R, 'id') || node.getAttribute('r:id');
        const href = rid && rels[rid] ? rels[rid].target : null;
        html += await renderRuns(null, node, paraBase, href || true);
      } else if (['ins', 'smartTag', 'sdt', 'sdtContent', 'fldSimple'].includes(ln)) {
        html += await renderRuns(null, ln === 'sdt' ? kid(node, 'sdtContent') || node : node, paraBase, link);
      }
    }
    return html;
  }

  async function renderRun(rEl, paraBase, link) {
    const direct = readRPr(kid(rEl, 'rPr'));
    const cs = direct.rStyle ? resolveStyle(styles, direct.rStyle).r : {};
    const eff = merge(paraBase, cs, direct);
    if (link) { eff.u = eff.u ?? true; eff.color = eff.color || '#0563c1'; }
    const style = runCss(eff);
    let inner = '';
    for (const c of [...rEl.children]) {
      switch (c.localName) {
        case 't': inner += esc(c.textContent); break;
        case 'tab': inner += '<span style="display:inline-block;width:36px"></span>'; break;
        case 'br':
          if (wa(c, 'type') === 'page') inner += '<span data-pagebreak="1"></span>';
          else inner += '<br/>';
          break;
        case 'cr': inner += '<br/>'; break;
        case 'noBreakHyphen': inner += '‑'; break;
        case 'sym': { const ch = parseInt(wa(c, 'char') || '0', 16); if (ch) inner += esc(String.fromCharCode(ch >= 0xf000 ? 0x2022 : ch)); break; }
        case 'drawing': inner += await renderDrawing(c); break;
        case 'pict': inner += await renderPict(c); break;
        default: break;
      }
    }
    if (!inner) return '';
    return `<span style="${style}">${inner}</span>`;
  }

  async function renderDrawing(dr) {
    const blip = dr.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0];
    if (!blip) return '';
    const rid = blip.getAttributeNS(R, 'embed') || blip.getAttribute('r:embed');
    const data = rid ? await imageData(rid) : null;
    const ext = dr.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'extent')[0];
    let w = ext ? +ext.getAttribute('cx') / 9525 : 0;
    let h = ext ? +ext.getAttribute('cy') / 9525 : 0;
    if (!data) return w && h ? `<span style="display:inline-block;width:${w}px;height:${h}px;background:#eee"></span>` : '';
    const mw = contentW;
    if (w > mw) { h = (h * mw) / w; w = mw; }
    return `<img src="${data}" style="display:inline-block;vertical-align:bottom;width:${w || 'auto'}px;height:${h || 'auto'}px;max-width:100%"/>`;
  }

  async function renderPict(p) {
    const im = p.getElementsByTagName('v:imagedata')[0];
    if (!im) return '';
    const rid = im.getAttributeNS(R, 'id') || im.getAttribute('r:id');
    const data = rid ? await imageData(rid) : null;
    return data ? `<img src="${data}" style="max-width:100%"/>` : '';
  }

  function listLabel(numPr) {
    const n = numbering.nums[numPr.numId];
    if (!n) return null;
    const lv = numbering.abs[n.abs]?.[numPr.ilvl];
    if (!lv) return null;
    const cnt = (counters[numPr.numId] ||= []);
    for (let i = cnt.length; i <= numPr.ilvl; i++) cnt[i] = undefined;
    const lvStart = (i) => n.ov[i] ?? numbering.abs[n.abs]?.[i]?.start ?? 1;
    cnt[numPr.ilvl] = cnt[numPr.ilvl] === undefined ? lvStart(numPr.ilvl) : cnt[numPr.ilvl] + 1;
    for (let i = numPr.ilvl + 1; i < cnt.length; i++) cnt[i] = undefined;
    if (lv.fmt === 'none') return { text: '', lv };
    if (lv.fmt === 'bullet') {
      let ch = lv.text || '•';
      const code = ch.charCodeAt(0);
      if (code >= 0xf000 || ch.length === 0) ch = '•';
      if (/^[o]$/i.test(ch) && lv.rPr.font && /courier/i.test(lv.rPr.font)) ch = '◦';
      return { text: ch, lv };
    }
    const text = lv.text.replace(/%(\d)/g, (_, d) => {
      const i = +d - 1;
      const f = numbering.abs[n.abs]?.[i]?.fmt || 'decimal';
      const val = cnt[i] === undefined ? lvStart(i) : cnt[i];
      return fmtNum(val, f);
    });
    return { text, lv };
  }

  async function renderParagraph(pEl) {
    const direct = readPPr(kid(pEl, 'pPr'));
    const st = resolveStyle(styles, direct.pStyle || Object.keys(styles).find((k) => styles[k].type === 'paragraph' && styles[k].def));
    let pp = merge(defaults.p, st.p, direct);
    if (direct.pStyle === undefined) pp = merge(defaults.p, st.p, direct);
    const label = pp.numPr && pp.numPr.numId && pp.numPr.numId !== '0' ? listLabel(pp.numPr) : null;
    if (label) {
      const lind = label.lv.pPr.ind;
      if (lind) pp.ind = merge({ ind: st.p.ind }, { ind: lind }, { ind: direct.ind }).ind;
    }
    const baseR = merge(defR, st.r);
    const bidi = !!pp.bidi;
    const ind = pp.ind || {};
    const sp = pp.spacing || {};
    const css = ['margin:0', 'box-sizing:border-box', 'overflow-wrap:break-word', 'word-wrap:break-word'];
    if (bidi) css.push('direction:rtl');
    const before = tw(sp.before ?? 0), after = tw(sp.after ?? 0);
    css.push(`padding-top:${before}px`, `padding-bottom:${after}px`);
    let leftPx = tw(ind.left ?? 0), rightPx = tw(ind.right ?? 0);
    const first = ind.hanging !== undefined ? -tw(ind.hanging) : tw(ind.firstLine ?? 0);
    css.push(bidi ? `padding-right:${leftPx}px` : `padding-left:${leftPx}px`);
    css.push(bidi ? `padding-left:${rightPx}px` : `padding-right:${rightPx}px`);
    css.push(`text-indent:${first}px`);
    // Word treats left/right as start/end in right-to-left paragraphs.
    const jc = pp.jc;
    let al = 'left';
    if (jc === 'center') al = 'center';
    else if (jc === 'both' || jc === 'distribute') al = 'justify';
    else if (bidi) al = jc === 'right' || jc === 'end' ? 'left' : 'right';
    else al = jc === 'right' || jc === 'end' ? 'right' : 'left';
    css.push(`text-align:${al}`);
    const rule = sp.lineRule;
    if (sp.line) {
      if (rule === 'auto') css.push(`line-height:${(sp.line / 240) * 1.2}`);
      else css.push(`line-height:${tw(sp.line)}px`);
    } else css.push('line-height:1.2');
    if (pp.shd) css.push(`background:${pp.shd}`);
    if (pp.borderBottom) css.push(`border-bottom:${Math.max(1, pp.borderBottom.sz / 8)}px solid ${pp.borderBottom.color}`);
    css.push(`font-size:${(baseR.sz || baseSz) / 2 * (4 / 3)}px`, `font-family:${fontStack(baseR.font, baseR.fontCs)}`, 'color:#000');

    let inner = await renderRuns(null, pEl, baseR, null);
    if (label && label.text !== undefined) {
      const lr = merge(baseR, label.lv.rPr);
      const hang = Math.max(18, -first || 18);
      const lab = `<span style="${runCss({ ...lr, u: false })};display:inline-block;min-width:${hang}px;text-indent:0">${esc(label.text)}</span>`;
      inner = lab + inner;
    }
    const hasBreak = inner.includes('data-pagebreak');
    if (!inner.replace(/<span[^>]*><\/span>/g, '').replace(/<[^>]*>/g, '').trim() && !inner.includes('<img')) {
      inner += `<span style="font-size:${(baseR.sz || baseSz) / 2 * (4 / 3)}px">&#8203;</span>`;
    }
    const pageBreakBefore = !!pp.pageBreakBefore || breakBefore;
    breakBefore = false;
    return { kind: 'p', html: `<div style="${css.join(';')}">${inner}</div>`, pageBreakBefore, pageBreakAfter: hasBreak, ctxStyle: pp.ctxSp ? (direct.pStyle || '_default') : null };
  }

  async function renderTable(tbl) {
    const tblPr = kid(tbl, 'tblPr');
    const styleId = wa(kid(tblPr, 'tblStyle'), 'val');
    const sBorders = resolveStyle(styles, styleId).borders;
    const direct = readBorders(tblPr);
    const bd = direct || sBorders || { on: false };
    const grid = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => tw(num(wa(g, 'w'), 2000)));
    const totalGrid = grid.reduce((a, b) => a + b, 0) || contentW;
    const scale = totalGrid > contentW ? contentW / totalGrid : 1;
    const cols = grid.map((g) => g * scale);
    const rows = kids(tbl, 'tr');
    // vMerge pass
    const cellGrid = rows.map((tr) => {
      let gi = 0;
      return kids(tr, 'tc').map((tc) => {
        const pr = kid(tc, 'tcPr');
        const span = num(wa(kid(pr, 'gridSpan'), 'val'), 1);
        const vm = kid(pr, 'vMerge');
        const cell = { tc, pr, span, gi, vm: vm ? wa(vm, 'val') || 'continue' : null, rowspan: 1 };
        gi += span;
        return cell;
      });
    });
    cellGrid.forEach((row, ri) => row.forEach((c) => {
      if (c.vm === 'restart') {
        for (let r2 = ri + 1; r2 < cellGrid.length; r2++) {
          const nx = cellGrid[r2].find((x) => x.gi === c.gi);
          if (nx && nx.vm === 'continue') { c.rowspan++; nx.skip = true; } else break;
        }
      }
    }));
    const b = bd.on ? `${Math.max(1, bd.sz / 8)}px solid ${bd.color}` : 'none';
    const hasSpan = cellGrid.some((r) => r.some((c) => c.rowspan > 1));
    const rowHtml = [];
    for (let ri = 0; ri < rows.length; ri++) {
      let tds = '';
      for (const c of cellGrid[ri]) {
        if (c.skip) continue;
        const w = cols.slice(c.gi, c.gi + c.span).reduce((a, x) => a + x, 0);
        const fill = kid(c.pr, 'shd') ? wa(kid(c.pr, 'shd'), 'fill') : null;
        const cb = readBorders(c.pr);
        const border = cb ? (cb.on ? `${Math.max(1, cb.sz / 8)}px solid ${cb.color}` : 'none') : b;
        let content = '';
        for (const ch of [...c.tc.children]) {
          if (ch.localName === 'p') content += (await renderParagraph(ch)).html;
          else if (ch.localName === 'tbl') content += (await renderTable(ch)).html;
        }
        if (!content) content = '<div style="height:1px"></div>';
        tds += `<td colspan="${c.span}" rowspan="${c.rowspan}" style="width:${w}px;vertical-align:top;padding:2px 6px;border:${border};${fill && fill !== 'auto' ? `background:#${fill};` : ''}overflow:hidden">${content}</td>`;
      }
      rowHtml.push(`<tr>${tds}</tr>`);
    }
    const colgroup = `<colgroup>${cols.map((c) => `<col style="width:${c}px"/>`).join('')}</colgroup>`;
    const mk = (rs) => `<table style="border-collapse:collapse;table-layout:fixed;width:${cols.reduce((a, c) => a + c, 0)}px;margin:0">${colgroup}${rs.join('')}</table>`;
    return { kind: 'tbl', html: mk(rowHtml), rowHtml, mk, splittable: !hasSpan };
  }

  // 1) Convert body into blocks
  const blocks = [];
  const children = [...body.children].filter((c) => c.localName === 'p' || c.localName === 'tbl');
  let i = 0;
  for (const el of children) {
    if (el.localName === 'p') {
      const b = await renderParagraph(el);
      const prev = blocks[blocks.length - 1];
      if (b.ctxStyle && prev && prev.ctxStyle === b.ctxStyle) {
        // Word ignores spacing between paragraphs of the same style when "contextual spacing" is on
        prev.html = prev.html.replace(/padding-bottom:[^;]+;/, 'padding-bottom:0px;');
        b.html = b.html.replace(/padding-top:[^;]+;/, 'padding-top:0px;');
      }
      blocks.push(b);
    } else blocks.push(await renderTable(el));
    if (++i % 25 === 0) { onProgress(0.25 * (i / children.length)); await new Promise((r) => setTimeout(r)); }
  }

  // 2) Measure
  const meas = document.createElement('div');
  meas.style.cssText = `position:absolute;left:-99999px;top:0;width:${contentW}px;visibility:hidden`;
  document.body.appendChild(meas);
  const wraps = blocks.map((b) => {
    const d = document.createElement('div');
    d.innerHTML = b.html;
    meas.appendChild(d);
    return d;
  });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // make sure images are decoded
  await Promise.all([...meas.querySelectorAll('img')].map((im) => (im.decode ? im.decode().catch(() => {}) : null)));
  blocks.forEach((b, k) => {
    b.h = wraps[k].getBoundingClientRect().height;
    if (b.kind === 'tbl') b.rowH = [...wraps[k].querySelectorAll('tr')].map((tr) => tr.getBoundingClientRect().height);
  });
  meas.remove();

  // 3) Paginate
  const pages = [[]];
  let used = 0;
  const newPage = () => { pages.push([]); used = 0; };
  for (const b of blocks) {
    if (b.kind === 'p' && b.pageBreakBefore && (pages[pages.length - 1].length)) newPage();
    if (used + b.h <= contentH || (!pages[pages.length - 1].length)) {
      if (b.kind === 'tbl' && b.h > contentH && b.splittable) {
        // split table by rows
        let chunk = [], ch = 0;
        for (let r = 0; r < b.rowHtml.length; r++) {
          if (ch + b.rowH[r] > contentH - used && chunk.length) {
            pages[pages.length - 1].push(b.mk(chunk));
            newPage(); chunk = []; ch = 0;
          }
          chunk.push(b.rowHtml[r]); ch += b.rowH[r];
        }
        if (chunk.length) { pages[pages.length - 1].push(b.mk(chunk)); used += ch; }
      } else {
        pages[pages.length - 1].push(b.html);
        used += b.h;
      }
    } else if (b.kind === 'tbl' && b.splittable && b.h > contentH - used && b.rowHtml.length > 1) {
      let chunk = [], ch = 0;
      for (let r = 0; r < b.rowHtml.length; r++) {
        if (used + ch + b.rowH[r] > contentH && (chunk.length || pages[pages.length - 1].length)) {
          if (chunk.length) pages[pages.length - 1].push(b.mk(chunk));
          newPage(); chunk = []; ch = 0;
        }
        chunk.push(b.rowHtml[r]); ch += b.rowH[r];
      }
      if (chunk.length) { pages[pages.length - 1].push(b.mk(chunk)); used += ch; }
    } else {
      newPage();
      pages[pages.length - 1].push(b.html);
      used += b.h;
    }
    if (b.kind === 'p' && b.pageBreakAfter) newPage();
  }
  const finalPages = pages.filter((p, idx) => p.length || idx === 0);

  // 4) Rasterize
  const out = [];
  for (let k = 0; k < finalPages.length; k++) {
    const div = document.createElement('div');
    div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    div.style.cssText = `position:relative;width:${pageW}px;height:${pageH}px;background:#fff;overflow:hidden;color:#000`;
    const content = document.createElement('div');
    content.style.cssText = `position:absolute;left:${mL}px;top:${mT}px;width:${contentW}px;height:${contentH}px;overflow:visible`;
    content.innerHTML = finalPages[k].join('');
    div.appendChild(content);
    // images must be in DOM-less serialization -> they are data URIs, fine
    let words = [];
    try { words = extractDomWords(div, pageW, pageH); } catch (e) { console.warn('text extraction failed', e); }
    const blob = await rasterize(div, pageW, pageH, 2, 'image/jpeg', 0.9);
    out.push({ blob, w: pageW, h: pageH, words });
    onProgress(0.25 + 0.75 * ((k + 1) / finalPages.length));
    await new Promise((r) => setTimeout(r));
  }
  return out;
}

let jszipP = null;
export function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  jszipP ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/jszip.min.js', import.meta.url).href;
    s.onload = () => res(window.JSZip);
    s.onerror = () => rej(new Error('Could not load zip library'));
    document.head.appendChild(s);
  });
  return jszipP;
}
