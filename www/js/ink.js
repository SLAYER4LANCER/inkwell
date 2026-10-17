// Drawing primitives. Stroke coordinates are normalised to the page WIDTH
// (x in 0..1, y in 0..height/width) so notes stay put at every zoom level.

export const COLORS = ['#111827', '#dc2626', '#ea580c', '#eab308', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#ffffff'];

function smoothPath(ctx, p, W, from = 0) {
  const n = p.length / 3;
  ctx.moveTo(p[from * 3] * W, p[from * 3 + 1] * W);
  if (n - from < 3) {
    for (let i = from + 1; i < n; i++) ctx.lineTo(p[i * 3] * W, p[i * 3 + 1] * W);
    return;
  }
  let mx = p[from * 3] * W, my = p[from * 3 + 1] * W;
  for (let i = from + 1; i < n - 1; i++) {
    const x = p[i * 3] * W, y = p[i * 3 + 1] * W;
    const nx = (x + p[(i + 1) * 3] * W) / 2, ny = (y + p[(i + 1) * 3 + 1] * W) / 2;
    ctx.quadraticCurveTo(x, y, nx, ny);
    mx = nx; my = ny;
  }
  ctx.lineTo(p[(n - 1) * 3] * W, p[(n - 1) * 3 + 1] * W);
}

export function drawStroke(ctx, s, W) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  const base = Math.max(0.6, s.w * W);
  if (s.tool === 'pen') {
    const p = s.p, n = p.length / 3;
    if (n === 1) {
      ctx.beginPath();
      ctx.arc(p[0] * W, p[1] * W, Math.max(0.6, (base * (0.5 + p[2])) / 2), 0, Math.PI * 2);
      ctx.fill();
    } else if (n === 2) {
      ctx.lineWidth = base * (0.5 + (p[2] + p[5]) / 2);
      ctx.beginPath(); ctx.moveTo(p[0] * W, p[1] * W); ctx.lineTo(p[3] * W, p[4] * W); ctx.stroke();
    } else {
      let mx = p[0] * W, my = p[1] * W;
      for (let i = 1; i < n; i++) {
        const x = p[i * 3] * W, y = p[i * 3 + 1] * W;
        const last = i === n - 1;
        const nx = last ? x : (x + p[(i + 1) * 3] * W) / 2, ny = last ? y : (y + p[(i + 1) * 3 + 1] * W) / 2;
        ctx.lineWidth = base * (0.5 + p[i * 3 + 2]);
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.quadraticCurveTo(x, y, nx, ny); ctx.stroke();
        mx = nx; my = ny;
      }
    }
  } else if (s.tool === 'hl') {
    ctx.lineWidth = base;
    const n = s.p.length / 3;
    if (n === 1) { ctx.beginPath(); ctx.arc(s.p[0] * W, s.p[1] * W, base / 2, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); smoothPath(ctx, s.p, W); ctx.stroke(); }
  } else {
    ctx.lineWidth = base;
    const [x1, y1] = [s.a[0] * W, s.a[1] * W], [x2, y2] = [s.b[0] * W, s.b[1] * W];
    ctx.beginPath();
    if (s.tool === 'line' || s.tool === 'arrow') {
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      if (s.tool === 'arrow') {
        const ang = Math.atan2(y2 - y1, x2 - x1), hl = Math.max(base * 4, 0.018 * W);
        ctx.moveTo(x2 - hl * Math.cos(ang - 0.45), y2 - hl * Math.sin(ang - 0.45));
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2 - hl * Math.cos(ang + 0.45), y2 - hl * Math.sin(ang + 0.45));
      }
    } else if (s.tool === 'rect') ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    else if (s.tool === 'oval') ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Text marks (highlight / underline / strikethrough) made from selected text. Quads are [x, y, w, h] in page-width
// fractions. Highlights go to `hctx` (the multiply layer), lines to `pctx`; either may be null.
export function drawMarks(hctx, pctx, marks, W) {
  for (const m of marks || []) {
    for (const [x, y, w, h] of m.q) {
      if (m.k === 'hl') {
        if (!hctx) continue;
        hctx.fillStyle = m.c;
        hctx.fillRect(x * W, (y + h * 0.04) * W, w * W, h * W * 0.94);
      } else {
        if (!pctx) continue;
        pctx.fillStyle = m.c;
        const th = Math.max(1, h * W * 0.075);
        const cy = (m.k === 'ul' ? y + h * 0.86 : y + h * 0.56) * W;
        pctx.fillRect(x * W, cy - th / 2, w * W, th);
      }
    }
  }
}

// Draw only the newest piece of a pen/highlighter stroke while the finger is moving.
export function drawLivePiece(ctx, s, W) {
  const p = s.p, n = p.length / 3;
  if (n < 2) { drawStroke(ctx, s, W); return; }
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.c;
  const base = Math.max(0.6, s.w * W);
  const i = n - 1;
  const x = p[i * 3] * W, y = p[i * 3 + 1] * W;
  const px = p[(i - 1) * 3] * W, py = p[(i - 1) * 3 + 1] * W;
  ctx.lineWidth = s.tool === 'pen' ? base * (0.5 + p[i * 3 + 2]) : base;
  ctx.beginPath();
  if (i >= 2) {
    const ppx = p[(i - 2) * 3] * W, ppy = p[(i - 2) * 3 + 1] * W;
    ctx.moveTo((ppx + px) / 2, (ppy + py) / 2);
    ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
  } else { ctx.moveTo(px, py); ctx.lineTo((px + x) / 2, (py + y) / 2); }
  ctx.stroke();
  ctx.restore();
}

function dSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function hitStroke(s, x, y, r) {
  const pad = r + s.w / 2;
  if (s.tool === 'pen' || s.tool === 'hl') {
    const p = s.p, n = p.length / 3;
    if (n === 1) return Math.hypot(x - p[0], y - p[1]) <= pad;
    for (let i = 1; i < n; i++) if (dSeg(x, y, p[(i - 1) * 3], p[(i - 1) * 3 + 1], p[i * 3], p[i * 3 + 1]) <= pad) return true;
    return false;
  }
  const [x1, y1] = s.a, [x2, y2] = s.b;
  if (s.tool === 'line' || s.tool === 'arrow') return dSeg(x, y, x1, y1, x2, y2) <= pad;
  if (s.tool === 'rect') {
    return [[x1, y1, x2, y1], [x2, y1, x2, y2], [x2, y2, x1, y2], [x1, y2, x1, y1]].some(([a, b, c, d]) => dSeg(x, y, a, b, c, d) <= pad);
  }
  if (s.tool === 'oval') {
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
    let prev = null;
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2, px = cx + rx * Math.cos(a), py = cy + ry * Math.sin(a);
      if (prev && dSeg(x, y, prev[0], prev[1], px, py) <= pad) return true;
      prev = [px, py];
    }
  }
  return false;
}

export function drawTemplate(ctx, tpl, w, h) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  const gap = w * 0.045;
  ctx.lineWidth = Math.max(1, w / 900);
  if (tpl === 'lined') {
    ctx.strokeStyle = '#c7d2e0';
    for (let y = gap * 2.2; y < h - gap * 0.5; y += gap) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.strokeStyle = '#f2b8b8';
    ctx.beginPath(); ctx.moveTo(w * 0.1, 0); ctx.lineTo(w * 0.1, h); ctx.stroke();
  } else if (tpl === 'grid') {
    ctx.strokeStyle = '#dbe3ee';
    for (let x = gap; x < w; x += gap) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = gap; y < h; y += gap) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  } else if (tpl === 'dots') {
    ctx.fillStyle = '#9aa7b8';
    const r = Math.max(1.1, w / 600);
    for (let x = gap; x < w; x += gap) for (let y = gap; y < h; y += gap) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  }
}

const RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
export function drawTextBoxes(ctx, texts, W, ratioH) {
  for (const tx of texts) {
    if (!tx.text || !tx.text.trim()) continue;
    const fs = tx.s * W;
    ctx.save();
    ctx.fillStyle = tx.c;
    ctx.font = `${fs}px 'Roboto','Noto Sans Arabic',system-ui,sans-serif`;
    ctx.textBaseline = 'top';
    const rtl = RTL_RE.test(tx.text);
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = rtl ? 'right' : 'left';
    const maxW = tx.w * W, x0 = tx.x * W + (rtl ? maxW : 0);
    let y = tx.y * W;
    for (const para of tx.text.split('\n')) {
      let line = '';
      for (const word of para.split(/(\s+)/)) {
        const test = line + word;
        if (line && ctx.measureText(test).width > maxW) { ctx.fillText(line.trimEnd(), x0, y); y += fs * 1.25; line = word.trimStart(); }
        else line = test;
      }
      ctx.fillText(line, x0, y);
      y += fs * 1.25;
    }
    ctx.restore();
  }
}
