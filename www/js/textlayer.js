// Selectable text. Every page can have a list of "word boxes" (the page's text with its position).
// The app does its own word-level selection on top of those boxes (tap a word, drag, move the handles) and turns the
// selected words into copied text or highlight / underline / strikethrough marks.
//
// A word is [text, x, y, w, h, line, flags]  - x, y, w, h are fractions of the page WIDTH (like ink strokes),
// line is the line number within the page, flags: 1 = right-to-left word, 2 = glued to the previous word (no space).

const FONT = "Roboto, 'Noto Sans Arabic', system-ui, sans-serif";
const RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const r5 = (v) => Math.round(v * 1e5) / 1e5;

let mctx = null;
const mcache = new Map();
// Width of `text` when drawn at 100px in the page font (cached).
function measure(text) {
  let v = mcache.get(text);
  if (v !== undefined) return v;
  mctx ||= document.createElement('canvas').getContext('2d');
  mctx.font = `100px ${FONT}`;
  v = mctx.measureText(text).width;
  if (mcache.size > 20000) mcache.clear();
  mcache.set(text, v);
  return v;
}

// Works out line numbers and "glued" flags for words that are in reading order.
// raw item: { s, x, y, w, h, ws } where ws = whitespace came before this word in the source text.
function finish(raw) {
  const words = [];
  let line = -1, prev = null;
  for (const r of raw) {
    const rtl = RTL_RE.test(r.s) ? 1 : 0;
    let glue = 0;
    if (prev) {
      const cy = r.y + r.h / 2, pcy = prev.y + prev.h / 2;
      const same = Math.abs(cy - pcy) < 0.45 * Math.max(r.h, prev.h);
      if (!same) line++;
      else if (!r.ws) {
        const gap = rtl ? prev.x - (r.x + r.w) : r.x - (prev.x + prev.w);
        if (gap < 0.3 * r.h && gap > -0.5 * r.h) glue = 1;
      }
    } else line = 0;
    words.push([r.s, r5(r.x), r5(r.y), r5(r.w), r5(r.h), line, rtl | (glue ? 2 : 0)]);
    prev = r;
  }
  return words;
}

/* ------------------------------------------------------------ words from a laid-out DOM page (Word / PowerPoint) */
export function extractDomWords(node, w, h) {
  const host = document.createElement('div');
  host.style.cssText = `all:initial;position:fixed;left:-30000px;top:0;display:block;width:${w}px;height:${h}px;overflow:hidden`;
  host.appendChild(node);
  document.body.appendChild(host);
  const raw = [];
  try {
    const base = host.getBoundingClientRect();
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let prevEndsWs = true;
    const push = (s, r, ws) => {
      if (r.width < 0.5 || r.height < 0.5) return;
      const x = r.left - base.left, y = r.top - base.top;
      if (x > w || y > h || x + r.width < 0 || y + r.height < 0) return;
      raw.push({ s, x: x / w, y: y / w, w: r.width / w, h: r.height / w, ws });
    };
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const txt = n.nodeValue;
      if (!txt || !/\S/.test(txt)) { if (txt) prevEndsWs = true; continue; }
      const re = /\S+/g;
      let m;
      while ((m = re.exec(txt))) {
        const ws = m.index > 0 ? /\s/.test(txt[m.index - 1]) : prevEndsWs;
        range.setStart(n, m.index);
        range.setEnd(n, m.index + m[0].length);
        const rects = range.getClientRects();
        if (rects.length === 1) push(m[0], rects[0], ws);
        else if (rects.length > 1) {
          // a long word broken over several lines: split it per line, character by character
          let seg = null;
          for (let i = 0; i < m[0].length; i++) {
            range.setStart(n, m.index + i);
            range.setEnd(n, m.index + i + 1);
            const cr = range.getBoundingClientRect();
            if (!cr.width) continue;
            if (!seg || Math.abs(cr.top - seg.top) > 0.5 * seg.height) {
              if (seg) push(seg.s, seg, seg.ws);
              seg = { s: m[0][i], left: cr.left, top: cr.top, width: cr.width, height: cr.height, ws: seg ? true : ws };
            } else { seg.s += m[0][i]; seg.width = cr.right - seg.left; }
          }
          if (seg) push(seg.s, seg, seg.ws);
        }
      }
      prevEndsWs = /\s$/.test(txt);
    }
  } finally {
    host.removeChild(node);
    host.remove();
  }
  return finish(raw);
}

/* ------------------------------------------------------------ words from a PDF page (pdf.js text content) */
const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];

export async function pdfWords(page, pgW) {
  const tc = await page.getTextContent();
  const vp = page.getViewport({ scale: 1 });
  const raw = [];
  let prevEndsWs = true;
  for (const it of tc.items) {
    const str = it.str;
    if (!str) continue;
    if (!/\S/.test(str)) { prevEndsWs = true; continue; }
    const m = mul(vp.transform, it.transform);
    const fs = Math.hypot(m[2], m[3]) || it.height || 10;
    if (Math.abs(m[1]) > 0.2 * Math.abs(m[0]) || !(fs > 0)) { prevEndsWs = true; continue; } // rotated text: not supported
    const width = (it.width || 0) > 0 ? it.width : measure(str) / 100 * fs;
    const total = measure(str) || 1;
    const rtlItem = it.dir === 'rtl';
    const top = m[5] - 0.92 * fs, hh = 1.15 * fs;
    const re = /\S+/g;
    let mm;
    while ((mm = re.exec(str))) {
      const pre = measure(str.slice(0, mm.index)) / total;
      const wl = measure(mm[0]) / total;
      const x = rtlItem ? m[4] + width * (1 - pre - wl) : m[4] + width * pre;
      const ws = mm.index > 0 ? /\s/.test(str[mm.index - 1]) : prevEndsWs;
      raw.push({ s: mm[0], x: x / pgW, y: top / pgW, w: (width * wl) / pgW, h: hh / pgW, ws });
    }
    prevEndsWs = /\s$/.test(str) || !!it.hasEOL;
  }
  return finish(raw);
}

/* ------------------------------------------------------------ hit testing */
// Index of the word nearest to the point (x, y) (page-width fractions) and how far away it is, in word heights.
// With `tol` set, null is returned when nothing is closer than that.
export function nearestWord(words, x, y, tol = Infinity) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < words.length; i++) {
    const [, wx, wy, ww, wh] = words[i];
    const dx = x < wx ? wx - x : x > wx + ww ? x - wx - ww : 0;
    const dy = Math.max(0, Math.abs(y - (wy + wh / 2)) - 0.3 * wh);
    const d = Math.hypot(dx, dy) / wh;
    if (d < bd) { bd = d; best = i; }
  }
  return best >= 0 && bd <= tol ? { i: best, d: bd } : null;
}

/* ------------------------------------------------------------ selection -> text + marks */
// Text and highlight quads for the words a..b (inclusive) of one page.
export function rangeInfo(words, a, b) {
  if (a > b) [a, b] = [b, a];
  let text = '', prevLine = -1;
  const quads = [];
  let cur = null;
  for (let i = a; i <= b && i < words.length; i++) {
    const [s, x, y, w, h, line, fl] = words[i];
    if (prevLine === -1) text = s;
    else if (line !== prevLine) text += '\n' + s;
    else text += (fl & 2 ? '' : ' ') + s;
    prevLine = line;
    if (cur && cur.line === line) {
      const x1 = Math.max(cur.x + cur.w, x + w), y1 = Math.max(cur.y + cur.h, y + h);
      cur.x = Math.min(cur.x, x); cur.y = Math.min(cur.y, y);
      cur.w = x1 - cur.x; cur.h = y1 - cur.y;
    } else {
      if (cur) quads.push(cur);
      cur = { line, x, y, w, h };
    }
  }
  if (cur) quads.push(cur);
  return { text, quads: quads.map((q) => [r5(q.x), r5(q.y), r5(q.w), r5(q.h)]) };
}

// Where the two selection handles sit: the leading edge of the first word and the trailing edge of the last one.
export function handlePoints(words, a, b) {
  if (a > b) [a, b] = [b, a];
  const f = words[a], l = words[b];
  if (!f || !l) return null;
  return {
    start: [(f[6] & 1) ? f[1] + f[3] : f[1], f[2] + f[4]],
    end: [(l[6] & 1) ? l[1] : l[1] + l[3], l[2] + l[4]],
  };
}

const overlaps = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
// Marks of a page that touch any of the given quads.
export function marksTouching(marks, quads) {
  return (marks || []).filter((m) => m.q.some((q) => quads.some((s) => overlaps(q, s))));
}

// Is the point (x, y) (page-width fractions) inside one of the mark's quads?
export function hitMark(m, x, y) {
  for (const [qx, qy, qw, qh] of m.q) {
    if (x >= qx - 0.002 && x <= qx + qw + 0.002 && y >= qy - 0.002 && y <= qy + qh + 0.002) return true;
  }
  return false;
}
