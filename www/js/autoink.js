// inkwell-build:r8
// Smart ink: cleans up what the pen and the highlighter drew.
//   - pen strokes are smoothed (hand shake and screen-sampling noise removed)
//   - a stroke that was meant to be a straight line becomes a straight line (and snaps to horizontal / vertical)
//   - a highlighter stroke over text becomes a neat highlight of exactly the words it went over
// Points are flat arrays [x, y, pressure, x, y, pressure, ...] in page-width fractions (like all ink).

const r5 = (v) => Math.round(v * 1e5) / 1e5;
const hyp = Math.hypot;

export function pathLength(p) {
  let L = 0;
  for (let i = 3; i < p.length; i += 3) L += hyp(p[i] - p[i - 3], p[i + 1] - p[i - 2]);
  return L;
}

// Points spaced `step` apart along the path (first and last point are kept exactly).
export function resample(p, step) {
  const n = p.length / 3;
  if (n < 2) return p.slice();
  const out = [p[0], p[1], p[2]];
  let need = step;
  for (let i = 1; i < n; i++) {
    const x0 = p[(i - 1) * 3], y0 = p[(i - 1) * 3 + 1], q0 = p[(i - 1) * 3 + 2];
    const x1 = p[i * 3], y1 = p[i * 3 + 1], q1 = p[i * 3 + 2];
    const seg = hyp(x1 - x0, y1 - y0);
    if (!seg) continue;
    let pos = 0;
    while (seg - pos >= need) {
      pos += need;
      const f = pos / seg;
      out.push(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, q0 + (q1 - q0) * f);
      need = step;
    }
    need -= seg - pos;
  }
  const m = out.length / 3, lx = p[(n - 1) * 3], ly = p[(n - 1) * 3 + 1], lq = p[(n - 1) * 3 + 2];
  if (hyp(out[(m - 1) * 3] - lx, out[(m - 1) * 3 + 1] - ly) > step * 0.35) out.push(lx, ly, lq);
  else { out[(m - 1) * 3] = lx; out[(m - 1) * 3 + 1] = ly; out[(m - 1) * 3 + 2] = lq; }
  return out;
}

// Binomial low-pass filter; the two end points stay where they are.
function lowpass(p, passes) {
  const n = p.length / 3;
  if (n < 5) return p;
  let a = p.slice();
  const K = [1, 4, 6, 4, 1];
  for (let pass = 0; pass < passes; pass++) {
    const b = a.slice();
    for (let i = 1; i < n - 1; i++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) s += K[k + 2] * a[Math.min(n - 1, Math.max(0, i + k)) * 3 + c];
        b[i * 3 + c] = s / 16;
      }
    }
    a = b;
  }
  return a;
}

// Ramer-Douglas-Peucker: drops points that lie on the curve within `eps`.
function simplify(p, eps) {
  const n = p.length / 3;
  if (n < 3) return p;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const ax = p[s * 3], ay = p[s * 3 + 1], dx = p[e * 3] - ax, dy = p[e * 3 + 1] - ay, l = hyp(dx, dy) || 1e-9;
    let md = 0, mi = -1;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((p[i * 3] - ax) * dy - (p[i * 3 + 1] - ay) * dx) / l;
      if (d > md) { md = d; mi = i; }
    }
    if (mi >= 0 && md > eps) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  return out;
}

const round3 = (p) => p.map((v, i) => (i % 3 === 2 ? Math.round(v * 1000) / 1000 : r5(v)));

// A calm version of a hand-drawn path.
export function smoothPoints(p) {
  if (p.length / 3 < 6) return p;
  const len = pathLength(p);
  if (len < 0.012) return p;
  return round3(simplify(lowpass(resample(p, 0.002), 3), 0.0004));
}

// A much calmer copy of the path, only used to decide whether a stroke was meant to be a straight line.
export function blurred(p) {
  if (p.length / 3 < 5) return p;
  return lowpass(resample(p, 0.003), 8);
}

// How close is the path to a straight line? Returns the straight version, or null.
//   tol: how far from the chord (as a fraction of its length) the path may wander.
export function straighten(p, tol = 0.05, minLen = 0.045, snapDeg = 5) {
  const n = p.length / 3;
  if (n < 3) return null;
  const x1 = p[0], y1 = p[1], x2 = p[(n - 1) * 3], y2 = p[(n - 1) * 3 + 1];
  const dx = x2 - x1, dy = y2 - y1, L = hyp(dx, dy);
  if (L < minLen) return null;
  let P = 0, D = 0, my = 0, mx = 0, pr = 0;
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1];
    if (i) P += hyp(x - p[(i - 1) * 3], y - p[(i - 1) * 3 + 1]);
    D = Math.max(D, Math.abs((x - x1) * dy - (y - y1) * dx) / L);
    mx += x; my += y; pr += p[i * 3 + 2];
  }
  if (D > Math.max(0.0035, tol * L) || P > L * (1 + tol * 2.4)) return null;
  mx /= n; my /= n; pr /= n;
  let a = [x1, y1], b = [x2, y2];
  const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
  if (ang <= snapDeg || ang >= 180 - snapDeg) { a = [x1, my]; b = [x2, my]; }
  else if (Math.abs(ang - 90) <= snapDeg) { a = [mx, y1]; b = [mx, y2]; }
  return [r5(a[0]), r5(a[1]), Math.round(pr * 1000) / 1000, r5(b[0]), r5(b[1]), Math.round(pr * 1000) / 1000];
}

/* ------------------------------------------------------------ highlighter -> words */
// Which words did a highlighter stroke (path p, width w) go over? Returns runs of word indices [[a, b], ...] in
// reading order, or null when the stroke is not really a highlight of text (it should then stay a free stroke).
export function wordsUnderStroke(p, w, words) {
  if (!words || !words.length || p.length < 6) return null;
  const pts = resample(lowpass(resample(p, 0.002), 2), 0.002);
  const n = pts.length / 3;
  if (n < 3) return null;
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, pts[i * 3]); x1 = Math.max(x1, pts[i * 3]);
    y0 = Math.min(y0, pts[i * 3 + 1]); y1 = Math.max(y1, pts[i * 3 + 1]);
  }
  if (hyp(x1 - x0, y1 - y0) < 0.012) return null;
  const half = w / 2, pad = 0.004;
  const cand = [];
  for (let i = 0; i < words.length; i++) {
    const [, wx, wy, ww, wh] = words[i];
    if (wx + ww < x0 - pad || wx > x1 + pad || wy + wh < y0 - half - pad || wy > y1 + half + pad) continue;
    cand.push(i);
  }
  if (!cand.length) return null;

  // every point of the stroke belongs to at most one word: the one it is centred on (vertically) and sits inside of (horizontally)
  const cov = new Map(); // word index -> { lo, hi, k }
  const lineCount = new Map();
  for (let i = 0; i < n; i++) {
    const px = pts[i * 3], py = pts[i * 3 + 1];
    let best = -1, bd = Infinity;
    for (const j of cand) {
      const [, wx, wy, ww, wh] = words[j];
      if (px < wx - 0.0015 || px > wx + ww + 0.0015) continue;
      const ov = Math.min(py + half, wy + wh) - Math.max(py - half, wy);
      if (ov < 0.3 * Math.min(wh, w)) continue;
      const d = Math.abs(py - (wy + wh / 2)) / wh;
      if (d < bd) { bd = d; best = j; }
    }
    if (best < 0) continue;
    let c = cov.get(best);
    if (!c) cov.set(best, (c = { lo: px, hi: px, k: 0 }));
    c.lo = Math.min(c.lo, px); c.hi = Math.max(c.hi, px); c.k++;
    const ln = words[best][5];
    lineCount.set(ln, (lineCount.get(ln) || 0) + 1);
  }
  if (!cov.size) return null;

  // a stroke that stays on one line of text highlights only that line, even if it wobbled towards the next one
  let avgH = 0;
  for (const j of cov.keys()) avgH += words[j][4];
  avgH /= cov.size;
  if (y1 - y0 < 0.8 * avgH && lineCount.size > 1) {
    let bl = -1, bc = -1;
    for (const [ln, c] of lineCount) if (c > bc) { bc = c; bl = ln; }
    for (const j of [...cov.keys()]) if (words[j][5] !== bl) cov.delete(j);
  }

  // words that are covered enough, then every word between the first and last one on the same line
  const inc = new Set();
  for (const [j, c] of cov) {
    const ww = words[j][3];
    if (ww < 0.012 || (c.hi - c.lo) / ww >= 0.35) inc.add(j);
  }
  if (!inc.size) return null;
  const byLine = new Map();
  for (const j of inc) {
    const ln = words[j][5], e = byLine.get(ln);
    if (!e) byLine.set(ln, [j, j]); else { e[0] = Math.min(e[0], j); e[1] = Math.max(e[1], j); }
  }
  for (const [ln, [a, b]] of byLine) for (let j = a; j <= b; j++) if (words[j][5] === ln) inc.add(j);

  // most of the stroke has to be on the text, otherwise it was a free highlight and stays one
  const bands = [];
  for (const [ln, [a, b]] of byLine) {
    let bx0 = 9, bx1 = -9, by0 = 9, by1 = -9;
    for (let j = a; j <= b; j++) {
      if (words[j][5] !== ln) continue;
      const [, wx, wy, ww, wh] = words[j];
      bx0 = Math.min(bx0, wx); bx1 = Math.max(bx1, wx + ww); by0 = Math.min(by0, wy); by1 = Math.max(by1, wy + wh);
    }
    bands.push([bx0 - 0.012, bx1 + 0.012, by0 - half, by1 + half]);
  }
  let on = 0;
  for (let i = 0; i < n; i++) {
    const px = pts[i * 3], py = pts[i * 3 + 1];
    if (bands.some((b) => px >= b[0] && px <= b[1] && py >= b[2] && py <= b[3])) on++;
  }
  if (on / n < 0.6) return null;

  const idx = [...inc].sort((a, b) => a - b);
  const runs = [];
  for (const j of idx) {
    const last = runs[runs.length - 1];
    if (last && j === last[1] + 1) last[1] = j; else runs.push([j, j]);
  }
  return runs;
}
