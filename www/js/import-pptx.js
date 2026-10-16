// PPTX -> slide images. Parses the presentation XML (theme, master, layout, slide),
// builds an inline-styled DOM for each slide and rasterizes it.
import { rasterize, esc } from './rasterize.js';
import { loadJSZip } from './import-docx.js';

const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const parseXml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const kids = (el, n) => (el ? [...el.children].filter((c) => c.localName === n) : []);
const kid = (el, n) => (el ? [...el.children].find((c) => c.localName === n) || null : null);
const nattr = (el, n, d) => {
  if (!el) return d;
  const v = el.getAttribute(n);
  return v === null || v === '' || isNaN(+v) ? d : +v;
};
const EMU = 9525;
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' };

function dirname(p) { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }
function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (dirname(base) + '/' + target).split('/');
  const out = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); }
  return out.join('/');
}

// ---------- colour helpers ----------
const PRST = { black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', blue: '0000ff', yellow: 'ffff00', gray: '808080', grey: '808080', orange: 'ffa500', purple: '800080', cyan: '00ffff', magenta: 'ff00ff' };
function hex2rgb(h) { return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function rgb2hex(r, g, b) { return [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hsl2rgb(h, s, l) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
}

class Ctx {
  constructor(theme, clrMap) { this.theme = theme; this.clrMap = clrMap; }
  scheme(name, ph) {
    if (name === 'phClr') return ph || '000000';
    const m = this.clrMap[name] || name;
    return this.theme.colors[m] || this.theme.colors[name] || '000000';
  }
  // Returns {hex, a} or null
  color(holder, ph) {
    if (!holder) return null;
    const c = [...holder.children].find((x) => ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'].includes(x.localName));
    if (!c) return null;
    let hex;
    switch (c.localName) {
      case 'srgbClr': hex = c.getAttribute('val') || '000000'; break;
      case 'schemeClr': hex = this.scheme(c.getAttribute('val'), ph); break;
      case 'sysClr': hex = c.getAttribute('lastClr') || (c.getAttribute('val') === 'window' ? 'ffffff' : '000000'); break;
      case 'prstClr': hex = PRST[c.getAttribute('val')] || '000000'; break;
      case 'scrgbClr': hex = rgb2hex(nattr(c, 'r', 0) / 1000, nattr(c, 'g', 0) / 1000, nattr(c, 'b', 0) / 1000); break;
      default: hex = '000000';
    }
    let [r, g, b] = hex2rgb(hex.padStart(6, '0'));
    let a = 1;
    for (const m of c.children) {
      const v = nattr(m, 'val', 0) / 100000;
      switch (m.localName) {
        case 'lumMod': case 'lumOff': case 'satMod': case 'sat': case 'lum': {
          let [h, s, l] = rgb2hsl(r, g, b);
          if (m.localName === 'lumMod') l *= v;
          else if (m.localName === 'lumOff') l += v;
          else if (m.localName === 'satMod') s *= v;
          else if (m.localName === 'sat') s = v;
          else l = v;
          [r, g, b] = hsl2rgb(h, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, l)));
          break;
        }
        case 'tint': r = r * v + 255 * (1 - v); g = g * v + 255 * (1 - v); b = b * v + 255 * (1 - v); break;
        case 'shade': r *= v; g *= v; b *= v; break;
        case 'alpha': a = v; break;
        default: break;
      }
    }
    return { hex: rgb2hex(r, g, b), a };
  }
  css(holder, ph) {
    const c = this.color(holder, ph);
    if (!c) return null;
    if (c.a >= 0.999) return '#' + c.hex;
    const [r, g, b] = hex2rgb(c.hex);
    return `rgba(${r},${g},${b},${c.a})`;
  }
}

// ---------- shape geometry presets (viewBox 0 0 100 100) ----------
const star = (n, inner) => {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? 50 : 50 * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return 'M' + pts.join('L') + 'Z';
};
const PATHS = {
  triangle: 'M50,0L100,100L0,100Z', rtTriangle: 'M0,0L0,100L100,100Z', diamond: 'M50,0L100,50L50,100L0,50Z', flowChartDecision: 'M50,0L100,50L50,100L0,50Z',
  parallelogram: 'M25,0L100,0L75,100L0,100Z', trapezoid: 'M20,0L80,0L100,100L0,100Z', hexagon: 'M25,0L75,0L100,50L75,100L25,100L0,50Z',
  pentagon: 'M50,0L100,38L81,100L19,100L0,38Z', homePlate: 'M0,0L75,0L100,50L75,100L0,100Z', chevron: 'M0,0L70,0L100,50L70,100L0,100L30,50Z',
  rightArrow: 'M0,30L60,30L60,5L100,50L60,95L60,70L0,70Z', leftArrow: 'M100,30L40,30L40,5L0,50L40,95L40,70L100,70Z',
  upArrow: 'M30,100L30,40L5,40L50,0L95,40L70,40L70,100Z', downArrow: 'M30,0L30,60L5,60L50,100L95,60L70,60L70,0Z',
  star5: star(5, 0.4), star4: star(4, 0.4), star6: star(6, 0.5), star8: star(8, 0.6),
  plus: 'M35,0L65,0L65,35L100,35L100,65L65,65L65,100L35,100L35,65L0,65L0,35L35,35Z',
  mathMultiply: 'M20,5L50,35L80,5L95,20L65,50L95,80L80,95L50,65L20,95L5,80L35,50L5,20Z',
};

function geomOf(spPr) {
  const g = kid(spPr, 'prstGeom');
  if (!g) return { prst: kid(spPr, 'custGeom') ? 'rect' : 'rect', adj: {} };
  const adj = {};
  for (const gd of kids(kid(g, 'avLst'), 'gd')) {
    const m = /val\s+(-?\d+)/.exec(gd.getAttribute('fmla') || '');
    if (m) adj[gd.getAttribute('name')] = +m[1];
  }
  return { prst: g.getAttribute('prst') || 'rect', adj };
}

// ---------- main import ----------
export async function importPptx(arrayBuffer, onProgress = () => {}) {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const read = async (p) => { const f = zip.file(p); return f ? parseXml(await f.async('string')) : null; };
  const readRels = async (partPath) => {
    const rp = dirname(partPath) + '/_rels/' + partPath.split('/').pop() + '.rels';
    const doc = await read(rp);
    const out = {};
    if (doc) for (const r of [...doc.documentElement.children]) out[r.getAttribute('Id')] = { target: r.getAttribute('Target'), type: r.getAttribute('Type'), mode: r.getAttribute('TargetMode'), abs: r.getAttribute('TargetMode') === 'External' ? null : resolvePath(partPath, r.getAttribute('Target')) };
    return out;
  };

  const presDoc = await read('ppt/presentation.xml');
  if (!presDoc) throw new Error('Not a valid .pptx file');
  const pres = presDoc.documentElement;
  const sz = kid(pres, 'sldSz');
  const slideW = nattr(sz, 'cx', 9144000), slideH = nattr(sz, 'cy', 6858000);
  const PW = Math.round(slideW / EMU), PH = Math.round(slideH / EMU);
  const presRels = await readRels('ppt/presentation.xml');
  const slidePaths = kids(kid(pres, 'sldIdLst'), 'sldId')
    .map((s) => presRels[s.getAttributeNS(R_NS, 'id') || s.getAttribute('r:id')]?.abs)
    .filter(Boolean);
  const presDefault = kid(pres, 'defaultTextStyle');

  const cache = { theme: {}, master: {}, layout: {} };
  async function loadTheme(path) {
    if (cache.theme[path]) return cache.theme[path];
    const d = await read(path);
    const colors = {}, fonts = { major: 'Calibri', minor: 'Calibri' };
    if (d) {
      const cs = d.getElementsByTagNameNS('*', 'clrScheme')[0];
      if (cs) for (const c of [...cs.children]) {
        const v = kid(c, 'srgbClr') || kid(c, 'sysClr');
        if (v) colors[c.localName] = v.getAttribute('val') && v.localName === 'srgbClr' ? v.getAttribute('val') : v.getAttribute('lastClr') || '000000';
      }
      const fs = d.getElementsByTagNameNS('*', 'fontScheme')[0];
      if (fs) {
        fonts.major = kid(kid(fs, 'majorFont'), 'latin')?.getAttribute('typeface') || fonts.major;
        fonts.minor = kid(kid(fs, 'minorFont'), 'latin')?.getAttribute('typeface') || fonts.minor;
      }
    }
    return (cache.theme[path] = { colors, fonts });
  }
  async function loadMaster(path) {
    if (cache.master[path]) return cache.master[path];
    const doc = await read(path);
    const rels = await readRels(path);
    const themeRel = Object.values(rels).find((r) => r.type.endsWith('/theme'));
    const theme = themeRel ? await loadTheme(themeRel.abs) : { colors: {}, fonts: { major: 'Calibri', minor: 'Calibri' } };
    const root = doc.documentElement;
    const cm = {};
    const cmEl = kid(root, 'clrMap');
    if (cmEl) for (const a of cmEl.attributes) cm[a.name] = a.value;
    const m = { path, root, rels, theme, clrMap: Object.keys(cm).length ? cm : { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' } };
    m.ctx = new Ctx(theme, m.clrMap);
    m.tx = kid(root, 'txStyles');
    return (cache.master[path] = m);
  }
  async function loadLayout(path) {
    if (cache.layout[path]) return cache.layout[path];
    const doc = await read(path);
    const rels = await readRels(path);
    const mRel = Object.values(rels).find((r) => r.type.endsWith('/slideMaster'));
    const l = { path, root: doc.documentElement, rels, master: await loadMaster(mRel.abs) };
    return (cache.layout[path] = l);
  }

  const mediaCache = {};
  async function imageUri(abs) {
    if (!abs) return null;
    if (mediaCache[abs] !== undefined) return mediaCache[abs];
    const f = zip.file(abs);
    const ext = abs.split('.').pop().toLowerCase();
    if (!f || !MIME[ext]) return (mediaCache[abs] = null);
    return (mediaCache[abs] = `data:${MIME[ext]};base64,${await f.async('base64')}`);
  }

  // ------------- slide rendering -------------
  async function renderSlide(slidePath, index) {
    const slideDoc = await read(slidePath);
    const sRels = await readRels(slidePath);
    const layRel = Object.values(sRels).find((r) => r.type.endsWith('/slideLayout'));
    const layout = layRel ? await loadLayout(layRel.abs) : null;
    const master = layout ? layout.master : await loadMaster(Object.keys(cache.master)[0] || 'ppt/slideMasters/slideMaster1.xml');
    const ctx = master.ctx;
    const sRoot = slideDoc.documentElement;

    const root = document.createElement('div');
    root.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    root.style.cssText = `position:relative;width:${PW}px;height:${PH}px;overflow:hidden;background:#fff;font-family:'${master.theme.fonts.minor}','Carlito','Roboto','Noto Sans Arabic',sans-serif;color:#000`;

    // background: slide -> layout -> master
    const bgOf = async (rootEl, rels) => {
      const bg = kid(kid(rootEl, 'cSld'), 'bg');
      if (!bg) return null;
      const bgPr = kid(bg, 'bgPr');
      if (bgPr) return await fillAsync(bgPr, ctx, rels, null);
      const ref = kid(bg, 'bgRef');
      if (ref) return ctx.css(ref);
      return null;
    };
    const bg = (await bgOf(sRoot, sRels)) || (layout && (await bgOf(layout.root, layout.rels))) || (await bgOf(master.root, master.rels));
    if (bg) root.style.background = bg;

    const slideNo = index + 1;
    const showMaster = sRoot.getAttribute('showMasterSp') !== '0';
    const layoutShowMaster = !layout || layout.root.getAttribute('showMasterSp') !== '0';

    const T0 = { sx: 1, sy: 1, tx: 0, ty: 0 };
    // master + layout decorative shapes (non-placeholders)
    if (showMaster && layoutShowMaster) await renderTree(kid(kid(master.root, 'cSld'), 'spTree'), root, T0, { ctx, rels: master.rels, part: master.path, slideNo, skipPh: true, master, layout: null });
    if (showMaster && layout) await renderTree(kid(kid(layout.root, 'cSld'), 'spTree'), root, T0, { ctx, rels: layout.rels, part: layout.path, slideNo, skipPh: true, master, layout: null });
    await renderTree(kid(kid(sRoot, 'cSld'), 'spTree'), root, T0, { ctx, rels: sRels, part: slidePath, slideNo, skipPh: false, master, layout });
    return root;
  }

  // ----- fills -----
  function fillCss(spPr, ctx, rels, ph) {
    if (!spPr) return null;
    if (kid(spPr, 'noFill')) return 'transparent';
    const sf = kid(spPr, 'solidFill');
    if (sf) return ctx.css(sf, ph);
    const gf = kid(spPr, 'gradFill');
    if (gf) {
      const stops = kids(kid(gf, 'gsLst'), 'gs').map((g) => `${ctx.css(g, ph) || '#888'} ${nattr(g, 'pos', 0) / 1000}%`);
      if (!stops.length) return null;
      const lin = kid(gf, 'lin');
      const ang = lin ? nattr(lin, 'ang', 0) / 60000 + 90 : 180;
      return kid(gf, 'path') ? `radial-gradient(circle,${stops.join(',')})` : `linear-gradient(${ang}deg,${stops.join(',')})`;
    }
    return null;
  }
  async function fillAsync(spPr, ctx, rels, ph) {
    const f = fillCss(spPr, ctx, rels, ph);
    if (f) return f;
    const bf = kid(spPr, 'blipFill');
    if (bf) {
      const blip = kid(bf, 'blip');
      const rid = blip && (blip.getAttributeNS(R_NS, 'embed') || blip.getAttribute('r:embed'));
      const uri = rid && rels[rid] ? await imageUri(rels[rid].abs) : null;
      if (uri) return `url(${uri}) center/100% 100% no-repeat`;
    }
    return null;
  }

  function mapRect(xf, T) {
    const off = kid(xf, 'off'), ext = kid(xf, 'ext');
    const x = nattr(off, 'x', 0), y = nattr(off, 'y', 0), w = nattr(ext, 'cx', 0), h = nattr(ext, 'cy', 0);
    return { x: (T.sx * x + T.tx) / EMU, y: (T.sy * y + T.ty) / EMU, w: (T.sx * w) / EMU, h: (T.sy * h) / EMU };
  }

  // find placeholder in layout / master
  function findPh(treeRoot, ph) {
    const tree = kid(kid(treeRoot, 'cSld'), 'spTree');
    if (!tree || !ph) return null;
    const type = ph.getAttribute('type'), idx = ph.getAttribute('idx');
    const sps = kids(tree, 'sp');
    const phOf = (sp) => kid(kid(kid(sp, 'nvSpPr'), 'nvPr'), 'ph');
    let hit = null;
    if (idx !== null) hit = sps.find((sp) => phOf(sp)?.getAttribute('idx') === idx && (phOf(sp).getAttribute('type') || 'obj') === (type || 'obj'));
    if (!hit && idx !== null) hit = sps.find((sp) => phOf(sp)?.getAttribute('idx') === idx);
    if (!hit && type) {
      const alias = type === 'ctrTitle' ? ['ctrTitle', 'title'] : type === 'subTitle' ? ['subTitle', 'body'] : [type];
      for (const t of alias) { hit = sps.find((sp) => phOf(sp)?.getAttribute('type') === t); if (hit) break; }
    }
    if (!hit && !type) hit = sps.find((sp) => ['body', 'obj'].includes(phOf(sp)?.getAttribute('type') || 'obj'));
    return hit;
  }

  async function renderTree(tree, parent, T, o) {
    if (!tree) return;
    for (const node of [...tree.children]) {
      try {
        switch (node.localName) {
          case 'sp': await renderSp(node, parent, T, o); break;
          case 'pic': await renderPic(node, parent, T, o); break;
          case 'cxnSp': await renderSp(node, parent, T, o, true); break;
          case 'grpSp': {
            const gp = kid(node, 'grpSpPr');
            const xf = kid(gp, 'xfrm');
            let T2 = T;
            if (xf) {
              const off = kid(xf, 'off'), ext = kid(xf, 'ext'), co = kid(xf, 'chOff'), ce = kid(xf, 'chExt');
              const cw = nattr(ce, 'cx', 1) || 1, ch = nattr(ce, 'cy', 1) || 1;
              const sx = nattr(ext, 'cx', cw) / cw, sy = nattr(ext, 'cy', ch) / ch;
              T2 = {
                sx: T.sx * sx, sy: T.sy * sy,
                tx: T.sx * (nattr(off, 'x', 0) - nattr(co, 'x', 0) * sx) + T.tx,
                ty: T.sy * (nattr(off, 'y', 0) - nattr(co, 'y', 0) * sy) + T.ty,
              };
            }
            await renderTree(node, parent, T2, o);
            break;
          }
          case 'graphicFrame': await renderFrame(node, parent, T, o); break;
          default: break;
        }
      } catch (e) {
        console.warn('shape skipped', e);
      }
    }
  }

  function posStyle(r, xf) {
    let s = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;box-sizing:border-box;`;
    const rot = nattr(xf, 'rot', 0) / 60000;
    const tr = [];
    if (rot) tr.push(`rotate(${rot}deg)`);
    if (xf && xf.getAttribute('flipH') === '1') tr.push('scaleX(-1)');
    if (xf && xf.getAttribute('flipV') === '1') tr.push('scaleY(-1)');
    if (tr.length) s += `transform:${tr.join(' ')};`;
    return s;
  }

  async function renderSp(sp, parent, T, o, isCxn = false) {
    const nvPr = kid(kid(sp, isCxn ? 'nvCxnSpPr' : 'nvSpPr'), 'nvPr');
    const ph = kid(nvPr, 'ph');
    if (ph && o.skipPh) return;
    const spPr = kid(sp, 'spPr');
    const txBody = kid(sp, 'txBody');
    const style = kid(sp, 'style');
    let xf = kid(spPr, 'xfrm');
    let layPh = null, masPh = null;
    if (ph && o.layout) layPh = findPh(o.layout.root, ph);
    if (ph && o.master) masPh = findPh(o.master.root, ph);
    if (!xf && ph) {
      xf = kid(kid(layPh, 'spPr'), 'xfrm') || kid(kid(masPh, 'spPr'), 'xfrm');
    }
    if (!xf) return;
    const r = mapRect(xf, T);
    const { ctx } = o;
    const phClr = null;
    if (isCxn || ['line', 'straightConnector1'].includes(geomOf(spPr).prst)) { r.w = Math.max(r.w, 0.5); r.h = Math.max(r.h, 0.5); }

    // fill + line
    let fill = await fillAsync(spPr, ctx, o.rels, phClr);
    let ln = kid(spPr, 'ln');
    if (ph && !fill && !kid(spPr, 'noFill')) {
      fill = (await fillAsync(kid(layPh, 'spPr'), ctx, o.layout?.rels || o.rels, null)) || (await fillAsync(kid(masPh, 'spPr'), ctx, o.master?.rels || o.rels, null));
    }
    let fillRefClr = null, lnRefClr = null, fontRefClr = null;
    if (style) {
      const fr = kid(style, 'fillRef'), lr = kid(style, 'lnRef'), fo = kid(style, 'fontRef');
      if (fr && nattr(fr, 'idx', 0) > 0) fillRefClr = ctx.css(fr);
      if (lr && nattr(lr, 'idx', 0) > 0) lnRefClr = ctx.css(lr);
      if (fo) fontRefClr = ctx.css(fo);
    }
    if (!fill && fillRefClr && !kid(spPr, 'noFill') && !isCxn) fill = fillRefClr;
    let stroke = null, strokeW = 0, dash = null;
    if (ln && !kid(ln, 'noFill')) {
      const lc = kid(ln, 'solidFill') ? ctx.css(kid(ln, 'solidFill')) : lnRefClr;
      if (lc) { stroke = lc; strokeW = Math.max(0.75, nattr(ln, 'w', 12700) / EMU); }
      const pd = kid(ln, 'prstDash')?.getAttribute('val');
      if (pd && pd !== 'solid') dash = pd.includes('dot') || pd === 'sysDot' ? '1.5,3' : '6,4';
    } else if (!ln && lnRefClr) { stroke = lnRefClr; strokeW = 1.33; }
    if (isCxn && !stroke) { stroke = lnRefClr || '#000'; strokeW = strokeW || 1.33; }

    const { prst, adj } = geomOf(spPr);
    const div = document.createElement('div');
    let css = posStyle(r, xf);
    const hasText = txBody && txBody.getElementsByTagNameNS('*', 't').length > 0;
    const border = stroke && ['rect', 'roundRect', 'ellipse', 'flowChartProcess', 'snip1Rect', 'round2SameRect', 'flowChartTerminator'].includes(prst) ? `${strokeW}px ${dash ? 'dashed' : 'solid'} ${stroke}` : null;
    if (!['line', 'straightConnector1', 'bentConnector3', 'curvedConnector3', 'rect', 'roundRect', 'ellipse', 'flowChartProcess', 'flowChartTerminator'].includes(prst) && (PATHS[prst] !== undefined)) {
      // svg shape
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible"><path d="${PATHS[prst]}" fill="${fill && !fill.includes('gradient') ? fill : 'none'}" stroke="${stroke || 'none'}" stroke-width="${strokeW}" ${dash ? `stroke-dasharray="${dash}"` : ''} vector-effect="non-scaling-stroke"/></svg>`;
      div.innerHTML = svg;
      if (fill && fill.includes('gradient')) css += `background:${fill};`;
    } else if (['line', 'straightConnector1', 'bentConnector3', 'curvedConnector3'].includes(prst) || isCxn) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible"><line x1="0" y1="0" x2="100" y2="100" stroke="${stroke || '#000'}" stroke-width="${strokeW || 1.33}" ${dash ? `stroke-dasharray="${dash}"` : ''} vector-effect="non-scaling-stroke"/></svg>`;
      div.innerHTML = svg;
      if (r.w < 1) css = css.replace(/width:[^;]+;/, 'width:0px;');
    } else {
      if (fill) css += `background:${fill};`;
      if (border) css += `border:${border};`;
      if (prst === 'roundRect') css += `border-radius:${(Math.min(r.w, r.h) * (adj.adj ?? 16667)) / 100000}px;`;
      else if (prst === 'ellipse') css += 'border-radius:50%;';
      else if (prst === 'flowChartTerminator') css += 'border-radius:999px;';
    }
    div.style.cssText = css;
    if (div.firstChild && div.firstChild.nodeName === 'svg') { /* keep */ }

    if (txBody && hasText) {
      const t = await renderText(txBody, { ...o, ph, layPh, masPh, fontRefClr: ph ? null : fontRefClr });
      div.appendChild(t);
    }
    if (ph && !hasText && !fill && !stroke) return;
    parent.appendChild(div);
  }

  async function renderPic(pic, parent, T, o) {
    const spPr = kid(pic, 'spPr');
    const xf = kid(spPr, 'xfrm');
    if (!xf) return;
    const r = mapRect(xf, T);
    const bf = kid(pic, 'blipFill');
    const blip = kid(bf, 'blip');
    const rid = blip && (blip.getAttributeNS(R_NS, 'embed') || blip.getAttribute('r:embed'));
    const uri = rid && o.rels[rid] ? await imageUri(o.rels[rid].abs) : null;
    const box = document.createElement('div');
    box.style.cssText = posStyle(r, xf) + 'overflow:hidden;';
    if (!uri) { box.style.background = '#e5e7eb'; parent.appendChild(box); return; }
    const sr = kid(bf, 'srcRect');
    const l = nattr(sr, 'l', 0) / 100000, t = nattr(sr, 't', 0) / 100000, rr = nattr(sr, 'r', 0) / 100000, b = nattr(sr, 'b', 0) / 100000;
    const wFrac = 1 - l - rr || 1, hFrac = 1 - t - b || 1;
    const img = document.createElement('img');
    img.setAttribute('src', uri);
    img.style.cssText = `position:absolute;width:${100 / wFrac}%;height:${100 / hFrac}%;left:${(-l / wFrac) * 100}%;top:${(-t / hFrac) * 100}%;`;
    box.appendChild(img);
    const ln = kid(spPr, 'ln');
    if (ln && kid(ln, 'solidFill')) box.style.border = `${Math.max(1, nattr(ln, 'w', 9525) / EMU)}px solid ${o.ctx.css(kid(ln, 'solidFill'))}`;
    parent.appendChild(box);
  }

  async function renderFrame(gf, parent, T, o) {
    const xf = kid(gf, 'xfrm');
    if (!xf) return;
    const r = mapRect(xf, T);
    const gd = kid(kid(gf, 'graphic'), 'graphicData');
    const tbl = kid(gd, 'tbl');
    if (!tbl) {
      const box = document.createElement('div');
      box.style.cssText = posStyle(r, xf) + 'background:#f3f4f6;border:1px dashed #9ca3af;display:flex;align-items:center;justify-content:center;color:#6b7280;font:16px sans-serif';
      box.textContent = /chart/i.test(gd?.getAttribute('uri') || '') ? 'Chart' : 'Object';
      parent.appendChild(box);
      return;
    }
    const ctx = o.ctx;
    const tblPr = kid(tbl, 'tblPr');
    const styleId = kid(tblPr, 'tableStyleId')?.textContent || '';
    const noGrid = /2D5ABB26/i.test(styleId);
    const gridBlack = /5940675A/i.test(styleId);
    const firstRow = tblPr?.getAttribute('firstRow') === '1', bandRow = tblPr?.getAttribute('bandRow') === '1';
    const accent = ctx.scheme('accent1');
    const mix = (hex, k) => { const [a, b, c] = hex2rgb(hex); return '#' + rgb2hex(a * (1 - k) + 255 * k, b * (1 - k) + 255 * k, c * (1 - k) + 255 * k); };
    const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => nattr(g, 'w', 914400) / EMU);
    const rowEls = kids(tbl, 'tr');
    const wrap = document.createElement('div');
    wrap.style.cssText = posStyle(r, xf);
    let html = `<table style="border-collapse:collapse;table-layout:fixed;width:${cols.reduce((a, b) => a + b, 0)}px"><colgroup>${cols.map((c) => `<col style="width:${c}px"/>`).join('')}</colgroup>`;
    const holder = document.createElement('div');
    for (let ri = 0; ri < rowEls.length; ri++) {
      const tr = rowEls[ri];
      html += `<tr style="height:${nattr(tr, 'h', 370840) / EMU}px">`;
      for (const tc of kids(tr, 'tc')) {
        if (tc.getAttribute('hMerge') === '1' || tc.getAttribute('vMerge') === '1') continue;
        const tcPr = kid(tc, 'tcPr');
        let bgc = fillCss(tcPr, ctx, o.rels, null);
        const header = firstRow && ri === 0;
        if (!bgc && !noGrid && !gridBlack) bgc = header ? '#' + accent : bandRow ? mix(accent, (ri % 2 === 1) ? 0.8 : 0.9) : mix(accent, 0.9);
        const bcol = noGrid ? 'transparent' : gridBlack ? '#000' : '#fff';
        const bw = noGrid ? 0 : 1;
        const textColor = header && !gridBlack && !noGrid ? '#ffffff' : null;
        const body = kid(tc, 'txBody');
        let inner = '';
        if (body) {
          const el = await renderText(body, { ...o, ph: null, layPh: null, masPh: null, isTable: true, forceColor: textColor, forceBold: header && !gridBlack && !noGrid });
          el.style.position = 'static'; el.style.height = 'auto';
          inner = new XMLSerializer().serializeToString(el);
        }
        html += `<td colspan="${nattr(tc, 'gridSpan', 1)}" rowspan="${nattr(tc, 'rowSpan', 1)}" style="vertical-align:${tcPr?.getAttribute('anchor') === 'ctr' ? 'middle' : tcPr?.getAttribute('anchor') === 'b' ? 'bottom' : 'top'};padding:${nattr(tcPr, 'marT', 45720) / EMU}px ${nattr(tcPr, 'marR', 91440) / EMU}px ${nattr(tcPr, 'marB', 45720) / EMU}px ${nattr(tcPr, 'marL', 91440) / EMU}px;border:${bw}px solid ${bcol};${bgc ? `background:${bgc};` : ''}overflow:hidden">${inner}</td>`;
      }
      html += '</tr>';
    }
    html += '</table>';
    holder.innerHTML = html;
    wrap.appendChild(holder.firstChild);
    parent.appendChild(wrap);
  }

  // ----- text -----
  function readLvl(node, ctx) {
    const o = {};
    if (!node) return o;
    if (node.getAttribute('marL') !== null) o.marL = nattr(node, 'marL', 0) / EMU;
    if (node.getAttribute('indent') !== null) o.indent = nattr(node, 'indent', 0) / EMU;
    if (node.getAttribute('algn')) o.algn = node.getAttribute('algn');
    if (node.getAttribute('rtl') === '1') o.rtl = true;
    const sp = (n) => { const e = kid(node, n); if (!e) return undefined; const p = kid(e, 'spcPct'), q = kid(e, 'spcPts'); return p ? { pct: nattr(p, 'val', 100000) / 100000 } : q ? { pts: nattr(q, 'val', 0) / 100 } : undefined; };
    const ls = sp('lnSpc'), sb = sp('spcBef'), sa = sp('spcAft');
    if (ls) o.lnSpc = ls; if (sb) o.spcBef = sb; if (sa) o.spcAft = sa;
    if (kid(node, 'buNone')) o.bu = { none: true };
    else if (kid(node, 'buChar')) o.bu = { char: kid(node, 'buChar').getAttribute('char') };
    else if (kid(node, 'buAutoNum')) o.bu = { auto: kid(node, 'buAutoNum').getAttribute('type'), start: nattr(kid(node, 'buAutoNum'), 'startAt', 1) };
    const bc = kid(node, 'buClr'); if (bc) o.buClr = ctx.css(bc);
    const d = kid(node, 'defRPr') || (node.localName === 'rPr' ? node : null);
    o.r = readR(d, ctx);
    return o;
  }
  function readR(d, ctx) {
    const r = {};
    if (!d) return r;
    if (d.getAttribute('sz')) r.sz = nattr(d, 'sz', 1800);
    if (d.getAttribute('b') !== null) r.b = d.getAttribute('b') === '1';
    if (d.getAttribute('i') !== null) r.i = d.getAttribute('i') === '1';
    if (d.getAttribute('u')) r.u = d.getAttribute('u') !== 'none';
    if (d.getAttribute('strike')) r.strike = d.getAttribute('strike') !== 'noStrike';
    if (d.getAttribute('baseline')) r.baseline = nattr(d, 'baseline', 0);
    if (d.getAttribute('cap') === 'all') r.caps = true;
    const sf = kid(d, 'solidFill'); if (sf) r.color = ctx.css(sf);
    const lat = kid(d, 'latin')?.getAttribute('typeface'); if (lat) r.font = lat;
    const cs = kid(d, 'cs')?.getAttribute('typeface'); if (cs) r.fontCs = cs;
    const hl = kid(d, 'highlight'); if (hl) r.hl = ctx.css(hl);
    return r;
  }
  const mergeP = (...list) => {
    const out = { r: {} };
    for (const o of list) {
      if (!o) continue;
      for (const k of Object.keys(o)) {
        if (o[k] === undefined) continue;
        if (k === 'r') out.r = { ...out.r, ...Object.fromEntries(Object.entries(o.r).filter(([, v]) => v !== undefined)) };
        else out[k] = o[k];
      }
    }
    return out;
  };

  async function renderText(txBody, o) {
    const { ctx } = o;
    const fontMajor = o.master.theme.fonts.major, fontMinor = o.master.theme.fonts.minor;
    const themeFont = (f) => (f === '+mj-lt' ? fontMajor : f === '+mn-lt' ? fontMinor : f === '+mj-ea' || f === '+mn-ea' || f === '+mj-cs' || f === '+mn-cs' ? null : f);
    const phType = o.ph ? o.ph.getAttribute('type') || 'obj' : null;
    const styleKind = !o.ph ? 'otherStyle' : ['title', 'ctrTitle'].includes(phType) ? 'titleStyle' : ['sldNum', 'dt', 'ftr'].includes(phType) ? 'otherStyle' : 'bodyStyle';
    const lstOf = (el) => kid(kid(el, 'txBody'), 'lstStyle');
    const chain = [
      kid(txBody, 'lstStyle'),
      o.layPh ? lstOf(o.layPh) : null,
      o.masPh ? lstOf(o.masPh) : null,
      o.master.tx ? kid(o.master.tx, styleKind) : null,
      presDefault,
    ].filter(Boolean);
    const lvlProps = (lvl) => {
      const n = `lvl${lvl + 1}pPr`;
      const arr = chain.map((c) => readLvl(kid(c, n), ctx)).reverse();
      return mergeP(...arr);
    };
    // body props
    const bodyPrs = [kid(txBody, 'bodyPr'), o.layPh ? kid(kid(o.layPh, 'txBody'), 'bodyPr') : null, o.masPh ? kid(kid(o.masPh, 'txBody'), 'bodyPr') : null].filter(Boolean);
    const bp = (a, d) => { for (const b of bodyPrs) if (b.getAttribute(a) !== null) return b.getAttribute(a); return d; };
    const lIns = +bp('lIns', 91440) / EMU, tIns = +bp('tIns', 45720) / EMU, rIns = +bp('rIns', 91440) / EMU, bIns = +bp('bIns', 45720) / EMU;
    const anchor = bp('anchor', 't');
    const wrap = bp('wrap', 'square') !== 'none';
    const vert = bp('vert', 'horz');
    const na = bodyPrs.map((b) => kid(b, 'normAutofit')).find(Boolean);
    const fontScale = na ? nattr(na, 'fontScale', 100000) / 100000 : 1;
    const lnRed = na ? nattr(na, 'lnSpcReduction', 0) / 100000 : 0;

    const box = document.createElement('div');
    let css = `position:absolute;left:0;top:0;width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:${anchor === 'ctr' ? 'center' : anchor === 'b' ? 'flex-end' : 'flex-start'};padding:${tIns}px ${rIns}px ${bIns}px ${lIns}px;`;
    if (!wrap) css += 'white-space:nowrap;';
    if (vert === 'vert' || vert === 'vert270') css += 'writing-mode:vertical-rl;' + (vert === 'vert270' ? 'transform:rotate(180deg);' : '');
    if (o.isTable) css = 'box-sizing:border-box;';
    box.style.cssText = css;

    const autoCounters = {};
    let html = '';
    for (const p of kids(txBody, 'p')) {
      const pPr = kid(p, 'pPr');
      const lvl = nattr(pPr, 'lvl', 0);
      const props = mergeP(lvlProps(lvl), readLvl(pPr, ctx));
      const runs = [...p.children].filter((c) => ['r', 'br', 'fld'].includes(c.localName));
      const endR = readR(kid(p, 'endParaRPr'), ctx);
      const sizeOf = (r) => ((r.sz ?? props.r.sz ?? endR.sz ?? 1800) / 100) * (4 / 3) * fontScale;
      const baseSize = sizeOf({});
      const rtl = !!props.rtl;
      const pcss = [`margin:0`, `direction:${rtl ? 'rtl' : 'ltr'}`, 'overflow-wrap:break-word'];
      const algn = props.algn || (rtl ? 'r' : 'l');
      pcss.push(`text-align:${{ l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify' }[algn] || 'left'}`);
      const marL = props.marL ?? 0, ind = props.indent ?? 0;
      const hasBu = props.bu && !props.bu.none && (props.bu.char || props.bu.auto);
      pcss.push(rtl ? `padding-right:${marL}px` : `padding-left:${marL}px`);
      pcss.push(`text-indent:${ind}px`);
      const lnPct = props.lnSpc?.pct ? props.lnSpc.pct - lnRed : 1;
      pcss.push(props.lnSpc?.pts ? `line-height:${props.lnSpc.pts * (4 / 3)}px` : `line-height:${(lnPct * 1.2).toFixed(3)}`);
      const sp = (s) => (!s ? 0 : s.pts !== undefined ? s.pts * (4 / 3) : s.pct * baseSize * 1.2);
      pcss.push(`padding-top:${sp(props.spcBef)}px`, `padding-bottom:${sp(props.spcAft)}px`);
      let inner = '';
      let any = false;
      for (const rn of runs) {
        if (rn.localName === 'br') { inner += '<br/>'; any = true; continue; }
        const rp = readR(kid(rn, 'rPr'), ctx);
        const eff = { ...props.r, ...Object.fromEntries(Object.entries(rp).filter(([, v]) => v !== undefined)) };
        let text = kid(rn, 't')?.textContent ?? '';
        if (rn.localName === 'fld' && (rn.getAttribute('type') || '').startsWith('slidenum')) text = String(o.slideNo);
        if (!text) continue;
        any = true;
        const color = rp.color || o.forceColor || (o.fontRefClr && !rp.color ? o.fontRefClr : null) || props.r.color || '#000';
        const fam = [themeFont(eff.font), eff.fontCs].filter(Boolean).map((f) => `'${f.replace(/'/g, '')}'`);
        fam.push("'Carlito'", "'Roboto'", "'Noto Sans Arabic'", 'sans-serif');
        const decos = [eff.u ? 'underline' : '', eff.strike ? 'line-through' : ''].filter(Boolean).join(' ');
        let rc = `font-size:${sizeOf(eff)}px;color:${color};font-family:${fam.join(',')};`;
        if (eff.b || o.forceBold) rc += 'font-weight:700;';
        if (eff.i) rc += 'font-style:italic;';
        if (decos) rc += `text-decoration:${decos};`;
        if (eff.caps) rc += 'text-transform:uppercase;';
        if (eff.hl) rc += `background:${eff.hl};`;
        if (eff.baseline > 0) rc += 'vertical-align:super;font-size:0.7em;'; else if (eff.baseline < 0) rc += 'vertical-align:sub;font-size:0.7em;';
        inner += `<span style="${rc}">${esc(text)}</span>`;
      }
      if (!any) inner = `<span style="font-size:${sizeOf({})}px">&#8203;</span>`;
      if (hasBu && any) {
        let glyph = '';
        if (props.bu.char) glyph = props.bu.char;
        else {
          const k = lvl;
          autoCounters[k] = (autoCounters[k] ?? props.bu.start - 1) + 1;
          for (const j of Object.keys(autoCounters)) if (+j > k) delete autoCounters[j];
          const n = autoCounters[k];
          const t = props.bu.auto;
          glyph = /alphaLc/.test(t) ? String.fromCharCode(96 + ((n - 1) % 26) + 1) : /alphaUc/.test(t) ? String.fromCharCode(64 + ((n - 1) % 26) + 1) : String(n);
          glyph += /ParenBoth/.test(t) ? ')' : /ParenR/.test(t) ? ')' : '.';
        }
        const code = glyph.charCodeAt(0);
        if (code >= 0xf000) glyph = '•';
        if (glyph === '§') glyph = '▪';
        const w = Math.max(-ind, 14);
        const bc = props.buClr || props.r.color || '#000';
        inner = `<span style="display:inline-block;width:${w}px;text-indent:0;color:${bc};font-size:${baseSize}px">${esc(glyph)}</span>` + inner;
      } else if (!hasBu) { for (const j of Object.keys(autoCounters)) delete autoCounters[j]; }
      html += `<div style="${pcss.join(';')}">${inner}</div>`;
    }
    box.innerHTML = html;
    return box;
  }

  // ------------- run over all slides -------------
  const out = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const node = await renderSlide(slidePaths[i], i);
    const blob = await rasterize(node, PW, PH, Math.min(2, 2000 / PW + 0.5), 'image/jpeg', 0.9);
    out.push({ blob, w: PW, h: PH });
    onProgress((i + 1) / slidePaths.length);
    await new Promise((r) => setTimeout(r));
  }
  return out;
}
