// An endless ink landscape of the mountains around Almaty, drawn one tile at a time.
//
// After {Shan, Shui}* by Lingdong Huang: https://github.com/LingDong-/shan-shui-inf
// The brush stroke, blob and texture techniques below are adapted from it, under its license:
//
//   MIT License
//
//   Copyright (c) 2018 Lingdong Huang
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.
//
// World units: x runs forever, y runs from 0 (sky) to H (foreground). Each tile is TW wide.
// Runs as a worker: post {k, s (device px per unit), dark, id} and get back {k, id, bitmap}.

const H = 600;
const TW = 800;
const CH = 400; // planning chunk
const REACH = 1100; // widest item half width plus a chunk
const SEED = 4979; // Talgar peak, in metres

// ---------------------------------------------------------------------------------------
// Randomness: a seeded PRNG per item, and smooth value noise seeded once.

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(...v) {
  let h = 2166136261;
  for (const x of v) {
    h ^= Math.round(x * 997) | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PERM = new Uint8Array(512);
const VAL = new Float32Array(256);
(function seedNoise() {
  const r = mulberry32(SEED);
  for (let i = 0; i < 256; i++) {
    PERM[i] = i;
    VAL[i] = r();
  }
  for (let i = 255; i > 0; i--) {
    const j = (r() * (i + 1)) | 0;
    [PERM[i], PERM[j]] = [PERM[j], PERM[i]];
  }
  for (let i = 0; i < 256; i++) PERM[i + 256] = PERM[i];
})();
const lat = (x, y, z) => VAL[PERM[PERM[PERM[x & 255] + (y & 255)] + (z & 255)]];
const smooth = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = smooth(x - xi), v = smooth(y - yi), w = smooth(z - zi);
  return mix(
    mix(mix(lat(xi, yi, zi), lat(xi + 1, yi, zi), u), mix(lat(xi, yi + 1, zi), lat(xi + 1, yi + 1, zi), u), v),
    mix(mix(lat(xi, yi, zi + 1), lat(xi + 1, yi, zi + 1), u), mix(lat(xi, yi + 1, zi + 1), lat(xi + 1, yi + 1, zi + 1), u), v),
    w
  );
}
function vnoise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = smooth(x - xi), v = smooth(y - yi);
  return mix(mix(lat(xi, yi, 0), lat(xi + 1, yi, 0), u), mix(lat(xi, yi + 1, 0), lat(xi + 1, yi + 1, 0), u), v);
}
// Four octaves, roughly 0 to 1 around 0.5
function noise(x, y = 0, z = 0) {
  let r = 0, a = 0.5, f = 1;
  for (let o = 0; o < 4; o++) {
    r += a * (z === 0 ? vnoise2(x * f, y * f) : vnoise(x * f, y * f, z * f));
    a *= 0.5;
    f *= 2;
  }
  return r / 0.9375;
}

let R = Math.random; // reseeded for every item so tiles agree on shared items
const rand = (a, b) => a + (b - a) * R();
const pick = (arr) => arr[Math.floor(R() * arr.length)];

// ---------------------------------------------------------------------------------------
// Ink

let g; // 2D context of the tile being drawn
let REC; // the item being drawn: its marks, recorded as paths around its own x, IX
let IX = 0;
let INK = "60,60,60";
let PAPER = "#ffffff";
let LEAF = 1; // trees are dark masses on paper; drawn in light ink on dark paper, they are toned down
const ink = (a) => `rgba(${INK},${a.toFixed(3)})`;

function poly(pts, fill, line, width) {
  if (pts.length < 2) return;
  const path = new Path2D();
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i][0] - IX;
    if (i) path.lineTo(x, pts[i][1]);
    else path.moveTo(x, pts[i][1]);
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  path.closePath();
  const w = line && width ? width : 0;
  REC.push({ path, fill, line: w ? line : null, width: w, lo: lo - w, hi: hi + w });
}

// Ink a recorded item into the tile spanning x0 to x1
function replay(marks, ix, x0, x1, scale) {
  g.setTransform(scale, 0, 0, scale, (ix - x0) * scale, 0);
  for (const m of marks) {
    if (m.hi + ix < x0 || m.lo + ix > x1) continue;
    if (m.fill) {
      g.fillStyle = m.fill;
      g.fill(m.path);
    }
    if (m.line) {
      g.strokeStyle = m.line;
      g.lineWidth = m.width;
      g.stroke(m.path);
    }
  }
}

// Points along a polyline, `reso` per segment
function div(pts, reso) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < reso; j++) {
      const p = j / reso;
      out.push([mix(pts[i][0], pts[i + 1][0], p), mix(pts[i][1], pts[i + 1][1], p)]);
    }
  }
  if (pts.length) out.push(pts[pts.length - 1]);
  return out;
}

// A brush stroke: a ribbon around the path whose width follows `fun` and wavers with noise
function stroke(pts, o = {}) {
  const wid = o.wid ?? 2;
  const col = o.col ?? ink(0.8);
  const noi = o.noi ?? 0.5;
  const fun = o.fun ?? ((x) => Math.sin(x * Math.PI));
  if (pts.length < 3) return;
  const n0 = R() * 10;
  const a = [], b = [];
  for (let i = 1; i < pts.length - 1; i++) {
    let w = wid * fun(i / pts.length);
    w = w * (1 - noi) + w * noi * noise(i * 0.5, n0);
    const a1 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    const a2 = Math.atan2(pts[i][1] - pts[i + 1][1], pts[i][0] - pts[i + 1][0]);
    let ang = (a1 + a2) / 2;
    if (ang < a2) ang += Math.PI;
    a.push([pts[i][0] + w * Math.cos(ang), pts[i][1] + w * Math.sin(ang)]);
    b.push([pts[i][0] - w * Math.cos(ang), pts[i][1] - w * Math.sin(ang)]);
  }
  poly([pts[0], ...a, pts[pts.length - 1], ...b.reverse()], col, col, 1);
}

// A dab of the brush: leaf, needle cluster, sheep
function blob(x, y, o = {}) {
  const len = o.len ?? 20;
  const wid = o.wid ?? 5;
  const ang = o.ang ?? 0;
  const col = o.col ?? ink(0.8);
  const noi = o.noi ?? 0.5;
  const fun = o.fun ?? ((t) => (t <= 1 ? Math.pow(Math.sin(t * Math.PI), 0.5) : -Math.pow(Math.sin((t + 1) * Math.PI), 0.5)));
  const reso = 18;
  const n0 = R() * 10;
  const ns = [];
  for (let i = 0; i <= reso; i++) ns.push(noise(i * 0.05, n0));
  // loop the noise so the outline closes
  const d = ns[reso] - ns[0];
  let lo = 1, hi = 0;
  for (let i = 0; i <= reso; i++) {
    ns[i] += (d * (reso - i)) / reso;
    lo = Math.min(lo, ns[i]);
    hi = Math.max(hi, ns[i]);
  }
  const pts = [];
  for (let i = 0; i <= reso; i++) {
    const p = (i / reso) * 2;
    const xo = len / 2 - Math.abs(p - 1) * len;
    const yo = (fun(p) * wid) / 2;
    const a = Math.atan2(yo, xo);
    const l = Math.hypot(xo, yo) * ((hi > lo ? (ns[i] - lo) / (hi - lo) : 0.5) * noi + (1 - noi));
    pts.push([x + Math.cos(a + ang) * l, y + Math.sin(a + ang) * l]);
  }
  if (o.ret) return pts;
  poly(pts, col);
}

// Texture strokes laid along a stack of contour lines, like the mountains of shan shui.
// `keep(x, y)` decides which points may carry ink.
function texture(layers, o = {}) {
  const tex = o.tex ?? 200;
  const wid = o.wid ?? 1.5;
  const len = o.len ?? 0.2;
  const col = o.col ?? (() => ink(R() * 0.3));
  const noi = o.noi ?? ((x) => 30 / x);
  const dis = o.dis ?? (() => (R() > 0.5 ? R() / 3 : 2 / 3 + R() / 3));
  const keep = o.keep ?? (() => true);
  const rows = layers.length, cols = layers[0].length;
  for (let i = 0; i < tex; i++) {
    const mid = (dis() * cols) | 0;
    const hl = Math.floor(R() * cols * len);
    const s = Math.max(0, mid - hl), e = Math.min(cols, mid + hl);
    const layer = (i / tex) * (rows - 1);
    const lf = Math.floor(layer), lc = Math.ceil(layer), p = layer - lf;
    const pts = [];
    for (let j = s; j < e; j++) {
      const x = layers[lf][j][0] * p + layers[lc][j][0] * (1 - p);
      const y = layers[lf][j][1] * p + layers[lc][j][1] * (1 - p);
      if (!keep(x, y)) {
        if (pts.length > 2) break;
        pts.length = 0;
        continue;
      }
      const n = noi(layer + 1);
      pts.push([x + n * (noise(x, j * 0.5) - 0.5), y + n * (noise(y, j * 0.5) - 0.5)]);
    }
    if (pts.length > 2) stroke(pts, { col: col(i / tex, pts[pts.length >> 1]), wid });
  }
}

// Midpoint displacement: n + 1 values in about -1..1, ends at 0
function fractal(n, rough) {
  const f = new Float32Array(n + 1);
  let amp = 1;
  for (let step = n; step > 1; step >>= 1, amp *= rough) {
    for (let a = 0; a < n; a += step) {
      const m = a + step / 2;
      f[m] = (f[a] + f[a + step]) / 2 + (R() * 2 - 1) * amp;
    }
  }
  let mx = 1e-6;
  for (let i = 0; i <= n; i++) mx = Math.max(mx, Math.abs(f[i]));
  for (let i = 0; i <= n; i++) f[i] /= mx;
  return f;
}

// Height of a polyline outline at x (outline sorted by x)
function heightAt(P, x) {
  if (x <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) {
    if (x <= P[i][0]) {
      const t = (x - P[i - 1][0]) / (P[i][0] - P[i - 1][0] || 1);
      return mix(P[i - 1][1], P[i][1], t);
    }
  }
  return P[P.length - 1][1];
}

// ---------------------------------------------------------------------------------------
// Trees

// Tian Shan spruce: tall and narrow, drooping tiers overlapping into a serrated cone
function spruce(x, y, hei, a = 0.6) {
  a *= LEAF;
  const w = hei * 0.16;
  stroke([[x, y + 1], [x, y - hei * 0.5], [x, y - hei]], {
    wid: Math.max(0.5, hei * 0.016),
    col: ink(a * 0.9),
    noi: 0.3,
    fun: (t) => 1 - t * 0.8,
  });
  const tiers = Math.max(5, Math.round(hei / 2.6));
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const ty = y - hei * (0.08 + 0.9 * t);
    const tw = w * Math.pow(1 - t, 0.8) * rand(0.8, 1.15) + hei * 0.02;
    for (const side of [-1, 1]) {
      blob(x + side * tw * 0.42, ty + tw * 0.14, {
        len: tw * 1.1,
        wid: Math.max(1.2, hei * 0.075),
        ang: side > 0 ? 0.36 : Math.PI - 0.36,
        col: ink(a * rand(0.7, 1)),
        noi: 0.6,
      });
    }
  }
}

// Pyramidal poplar, planted in rows along roads and canals: a dense narrow spindle
function poplar(x, y, hei, a = 0.5) {
  a *= LEAF;
  stroke([[x, y + 1], [x, y - hei * 0.3]], { wid: Math.max(0.35, hei * 0.01), col: ink(a), noi: 0.2, fun: () => 1 });
  blob(x, y - hei * 0.56, {
    len: hei * 0.86,
    wid: hei * 0.12,
    ang: -Math.PI / 2,
    col: ink(a * 0.55),
    noi: 0.4,
  });
  const n = Math.max(10, Math.round(hei / 1.4));
  for (let i = 0; i < n; i++) {
    const t = R();
    const cw = hei * 0.07 * Math.pow(Math.sin((0.08 + 0.92 * t) * Math.PI), 0.7) + 0.4;
    blob(x + rand(-0.6, 0.6) * cw, y - hei * (0.14 + 0.84 * t), {
      len: hei * rand(0.08, 0.15),
      wid: cw * rand(0.7, 1.1),
      ang: -Math.PI / 2 + rand(-0.25, 0.25),
      col: ink(a * rand(0.35, 0.75)),
      noi: 0.6,
    });
  }
}

// Wild apple, the tree Almaty is named after: a low round crown
function apple(x, y, size, a = 0.45) {
  a *= LEAF;
  stroke([[x, y + 1], [x + rand(-1, 1), y - size * 0.45], [x + rand(-2, 2), y - size * 0.7]], {
    wid: Math.max(0.6, size * 0.05),
    col: ink(a),
    noi: 0.4,
    fun: (t) => 1 - t * 0.5,
  });
  const n = 7 + ((size / 4) | 0);
  for (let i = 0; i < n; i++) {
    const ang = R() * Math.PI * 2;
    const r = Math.sqrt(R()) * size * 0.5;
    blob(x + Math.cos(ang) * r, y - size * 0.75 + Math.sin(ang) * r * 0.6, {
      len: size * rand(0.25, 0.4),
      wid: size * rand(0.12, 0.22),
      ang: rand(-0.6, 0.6),
      col: ink(a * rand(0.5, 1)),
    });
  }
}

// A distant spruce in a forest belt: a dark narrow spire
function firSpire(x, y, hei, a = 0.55) {
  a *= LEAF;
  const w = hei * 0.18 * rand(0.8, 1.2);
  const top = x + rand(-0.06, 0.06) * hei;
  poly([
    [top, y - hei],
    [x + w * 0.45, y - hei * 0.55],
    [x + w * 0.8, y - hei * 0.3],
    [x + w, y - hei * 0.04],
    [x - w, y - hei * 0.04],
    [x - w * 0.8, y - hei * 0.3],
    [x - w * 0.45, y - hei * 0.55],
  ], ink(a));
}

// ---------------------------------------------------------------------------------------
// Land

// Smooth a polyline's heights, keeping its ends
const soften = (S) => S.map((q, i) => (i === 0 || i === S.length - 1 ? q : [q[0], (S[i - 1][1] + 2 * q[1] + S[i + 1][1]) / 4]));

// Snowy peak of the Tian Shan: white snowfields and rock ribs above, textured rock and
// a spruce belt below, its foot lost in haze. `a` fades farther rows.
function peak(it) {
  const { x, y, w, h } = it;
  const a = it.a ?? 1;
  const n = 128;
  const f = fractal(n, 0.56);
  const c = rand(-0.18, 0.18); // summit off centre
  const P = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const t = u < 0.5 + c ? (u - 0.5 - c) / (0.5 + c) : (u - 0.5 - c) / (0.5 - c);
    const env = Math.pow(1 - Math.pow(Math.abs(t), 1.1), 1.35);
    const hh = h * (env * 0.84 + 0.22 * Math.pow(env, 0.6) * f[i]);
    P.push([x + (u - 0.5) * w, y - Math.max(0, hh)]);
  }
  // The snowline wanders with the terrain, and snow runs further down the gullies
  const n1 = R() * 50;
  const snowAt = (px) => y - h * (0.46 + 0.16 * noise(px * 0.011, n1) - 0.2 * Math.pow(noise(px * 0.06, n1 + 7), 3));
  const haze = (py) => Math.min(1, Math.max(0, (y - py) / (h * 0.28))); // ink thins toward the foot

  poly([...P, [x + w / 2, H + 10], [x - w / 2, H + 10]], PAPER);

  // Rock below the snow: strokes along shrinking contours that smooth out inward,
  // densest on the flanks and darker on the shadowed right
  const L = 12;
  const layers = [];
  let S = P;
  for (let j = 0; j < L; j++) {
    const p = 1 - (j / L) * 0.92;
    layers.push(S.map(([px, py]) => [x + (px - x) * p, y + (py - y) * p]));
    S = soften(soften(S));
  }
  const rock = (px, py) => py > snowAt(px) + 6 * (noise(px * 0.2, py * 0.2) - 0.5) || noise(px * 0.035, py * 0.035, n1) > 0.66;
  const sx0 = P[P.reduce((b, q, i) => (q[1] < P[b][1] ? i : b), 0)][0];
  texture(layers, {
    tex: Math.round(w * 1.1),
    wid: 1.2,
    len: 0.09,
    col: (_, m) => ink(R() * 0.32 * haze(m[1]) * a * (0.75 + 0.35 * Math.tanh((m[0] - sx0) / (w * 0.08)))),
    noi: (l) => 22 / l,
    keep: rock,
  });

  // Ribs falling from the summits, a shaded facet and dry brush on their right
  const sums = [];
  for (let i = 4; i < n - 4; i++) {
    const hy = y - P[i][1];
    if (hy > h * 0.5 && P[i][1] <= P[i - 1][1] && P[i][1] <= P[i + 1][1] && P[i][1] <= P[i - 3][1] && P[i][1] <= P[i + 3][1]) {
      if (!sums.length || i - sums[sums.length - 1] > 8) sums.push(i);
    }
  }
  let top0 = 0;
  for (let i = 1; i < n; i++) if (P[i][1] < P[top0][1]) top0 = i;
  for (const si of sums.slice(0, 4)) {
    const [sx, sy] = P[si];
    // the main summit sheds one rib or two, one each way; the others fall away from it
    const main = Math.abs(si - top0) < 6;
    const ribs = main ? 1 + ((R() * 2) | 0) : 1;
    const s0 = main ? pick([-1, 1]) : Math.sign(si - top0);
    for (let r = 0; r < ribs; r++) {
      const side = r ? -s0 : s0;
      let ang = Math.PI / 2 - side * rand(0.35, 0.8);
      const len = (y - sy) * rand(0.4, 0.7);
      const steps = 12;
      const pts = [[sx, sy + 1]];
      for (let k = 1; k <= steps; k++) {
        ang += rand(-0.16, 0.16);
        const [lx, ly] = pts[pts.length - 1];
        const nx = lx + Math.cos(ang) * (len / steps);
        pts.push([nx, Math.max(ly + Math.sin(ang) * (len / steps), heightAt(P, nx) + 2)]);
      }
      const rib = div(pts, 2);
      const facet = rib.map(([bx, by], k) => [bx + (5 + 9 * Math.sin((k / rib.length) * Math.PI)) * rand(0.8, 1.2), by + 3]);
      poly([...rib, ...facet.reverse()], ink(rand(0.04, 0.08) * a));
      stroke(rib, { wid: rand(1, 1.8), col: ink(rand(0.45, 0.65) * a), noi: 0.7, fun: (t) => Math.pow(Math.sin(t * Math.PI), 0.5) * (1 - t * 0.5) });
      for (let k = 2; k < rib.length - 1; k++) {
        if (R() < 0.75) {
          const [bx, by] = rib[k];
          const da = ang + rand(0.15, 0.6);
          const bl = rand(5, 14) * (1 - (k / rib.length) * 0.5);
          const q = [[bx, by], [bx + Math.cos(da) * bl * 0.5 + 1, by + Math.sin(da) * bl * 0.5], [bx + Math.cos(da) * bl + 2, by + Math.sin(da) * bl]];
          stroke(div(q, 2), { wid: rand(0.6, 1.3), col: ink(rand(0.14, 0.32) * a), noi: 0.8 });
        }
      }
    }
  }

  // The spruce belt: dark stands with ragged tops, thinning into the haze below
  const trees = [];
  const top = (px) => y - h * (0.28 + 0.14 * noise(px * 0.01, n1 + 3));
  for (let tx = x - w * 0.46; tx < x + w * 0.46; tx += rand(0.8, 1.8)) {
    const v = noise(tx * 0.018, n1 + 9);
    if (v < 0.44) continue;
    const t0 = Math.max(top(tx) + (1 - v) * 30, heightAt(P, tx) + 6);
    if (t0 > y - 8) continue;
    const k = (2 + (v - 0.44) * 20) | 0;
    for (let j = 0; j < k; j++) trees.push([tx + rand(-1.5, 1.5), mix(t0, y, Math.pow(R(), 2) * 0.6)]);
  }
  trees.sort((p, q) => p[1] - q[1]);
  for (const [tx, ty] of trees) firSpire(tx, ty, rand(7, 12) * (0.8 + 0.4 * (1 - haze(ty))), rand(0.55, 0.8) * Math.max(0.2, haze(ty)) * a);

  // Silhouette last, so snow edges stay crisp
  stroke(P, { wid: 2.2, col: ink(0.55 * a), noi: 1 });
}

// Far snowy range: faces fluted by couloirs under a fine crest, a faint haze low down
function range(it) {
  const { x, y, w, h } = it;
  const n = 128;
  const f = fractal(n, 0.6);
  const P = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const env = Math.pow(Math.sin(u * Math.PI), 0.7);
    P.push([x + (u - 0.5) * w, y - Math.max(0, h * env * (0.72 + 0.34 * f[i]))]);
  }
  poly([...P, [x + w / 2, H + 10], [x - w / 2, H + 10]], PAPER);
  const n1 = R() * 50;
  // haze: a few pale passes over the lower half
  for (let pass = 0; pass < 4; pass++) {
    const top = [], bot = [];
    for (const [px, py] of P) {
      const d = y - py;
      top.push([px, py + d * (0.35 + 0.3 * noise(px * 0.015, n1 + pass * 1.7))]);
      bot.push([px, Math.min(y, py + d * (0.75 + 0.4 * noise(px * 0.012, n1 + pass * 2.3)))]);
    }
    poly([...top, ...bot.reverse()], ink(0.012));
  }
  // couloirs: strokes down the fall line, each leaning away from the nearest summit
  for (let i = 0; i < w * 0.35; i++) {
    const gx = x + rand(-0.46, 0.46) * w;
    const sy = heightAt(P, gx);
    const d = y - sy;
    if (d < h * 0.2 || noise(gx * 0.05, n1 + 4) < 0.35) continue;
    const slope = (heightAt(P, gx + 24) - heightAt(P, gx - 24)) / 48;
    const len = d * rand(0.1, 0.4);
    const lean = Math.max(-0.3, Math.min(0.3, slope));
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      pts.push([gx + lean * len * t + (noise(gx, t * 3) - 0.5) * 2, sy + 2 + len * t]);
    }
    stroke(pts, { wid: rand(0.5, 1), col: ink(rand(0.05, 0.15)), noi: 0.6, fun: (t) => Math.sin(t * Math.PI) * (1 - t * 0.6) });
  }
  stroke(P, { wid: 1.2, col: ink(0.26), noi: 1 });
}

// Rolling foothills (adyr): hatched flanks, spruce stands on the shaded side, wild apples
// on the sunny side, grass along the crest
function hill(it) {
  const { x, y, w, h } = it;
  const n = 64;
  const n0 = it.s % 1000;
  const P = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const t = u * 2 - 1;
    const env = Math.pow(1 - t * t, 0.75);
    P.push([x + (t * w) / 2, y - h * env * (0.35 + 0.75 * Math.pow(noise(u * 3.2, n0), 1.4))]);
  }
  poly([...P, [x + w / 2, H + 10], [x - w / 2, H + 10]], PAPER);
  const L = 8;
  const layers = [];
  let S = P;
  for (let j = 0; j < L; j++) {
    const p = 1 - (j / L) * 0.9;
    layers.push(S.map(([px, py]) => [x + (px - x) * p, y + (py - y) * p]));
    S = soften(soften(S));
  }
  const top0 = P.reduce((b, q, i) => (q[1] < P[b][1] ? i : b), 0);
  const sx = P[top0][0];
  const shade = (px) => 0.7 + 0.4 * Math.tanh((px - sx) / (w * 0.1));
  const haze = (py) => Math.min(1, Math.max(0.15, (y - py) / (h * 0.45)));
  texture(layers, {
    tex: Math.round(w * 0.55),
    wid: 1.1,
    len: 0.1,
    col: (_, m) => ink(R() * 0.26 * shade(m[0]) * haze(m[1])),
    noi: (l) => 14 / l,
  });
  // tufts of grass here and there along the crest
  for (let i = 1; i < n; i++) {
    if (noise(i * 0.4, n0 + 2) < 0.6 || R() < 0.5) continue;
    const [gx, gy] = P[i];
    for (let k = 0; k < 3; k++) {
      const gl = rand(1.5, 3.5);
      const bx = gx + rand(-2, 2);
      stroke([[bx, gy + 1], [bx + rand(-0.6, 0.6), gy - gl * 0.5], [bx + rand(-1.4, 1.4), gy - gl]], { wid: 0.4, col: ink(rand(0.15, 0.35)), noi: 0 });
    }
  }
  // stands of spruce in the folds of the shaded side, apples on the sunny side
  const trees = [];
  for (let i = 3; i < n - 3; i++) {
    const v = noise(i * 0.18, n0 * 0.1, 4);
    const [px, py] = layers[(1 + R() * 4) | 0][i];
    if (px > sx && v > 0.55) {
      const k = (2 + (v - 0.55) * 18) | 0;
      for (let j = 0; j < k; j++) trees.push([px + rand(-4, 4), py + rand(0, 10), "spruce"]);
    } else if (px < sx && v < 0.36 && R() < 0.35) {
      trees.push([px, py + rand(2, 8), "apple"]);
    }
  }
  trees.sort((p, q) => p[1] - q[1]);
  for (const [tx, ty, kind] of trees) {
    if (kind === "spruce") spruce(tx, ty, rand(12, 22), rand(0.45, 0.7) * haze(ty - 10));
    else apple(tx, ty, rand(9, 14), rand(0.3, 0.45) * haze(ty - 10));
  }
  stroke(P, { wid: 1.8, col: ink(0.45), noi: 1 });
}

// A line of steppe ground
function ground(it) {
  const { x, y, w } = it;
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    pts.push([x + (u - 0.5) * w, y + Math.sin(u * Math.PI * 2 + it.s) * 1.5]);
  }
  stroke(pts, { wid: rand(0.8, 1.6), col: ink(rand(0.12, 0.3)), noi: 0.8 });
  for (let i = 0; i < w * 0.04; i++) {
    const gx = x + rand(-0.5, 0.5) * w;
    const gl = rand(2, 6);
    stroke([[gx, y], [gx + rand(-1, 1), y - gl * 0.5], [gx + rand(-2, 2), y - gl]], { wid: 0.5, col: ink(rand(0.15, 0.4)), noi: 0 });
  }
}

// Still water of a mountain lake
function lake(it) {
  const { x, y, w } = it;
  let yk = 0;
  for (let i = 0; i < 9; i++) {
    yk += rand(1.5, 4);
    const lk = (w / 2) * (1 - i / 11) * rand(0.6, 1);
    const xk = rand(-0.08, 0.08) * w;
    const pts = [];
    for (let j = -lk; j < lk; j += 5) pts.push([x + xk + j, y + yk + Math.sin(j * 0.2) * 1.2 * noise(j * 0.1, i)]);
    stroke(pts, { wid: 0.9, col: ink(rand(0.15, 0.4)), noi: 0.5 });
  }
}

// ---------------------------------------------------------------------------------------
// Life on the steppe

// A quadratic curve through a, with b pulling it, to c
function quad(a, b, c, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([
      (1 - t) * (1 - t) * a[0] + 2 * t * (1 - t) * b[0] + t * t * c[0],
      (1 - t) * (1 - t) * a[1] + 2 * t * (1 - t) * b[1] + t * t * c[1],
    ]);
  }
  return out;
}

// Kazakh yurt: a low lattice wall under a shallow felt cone, the shanyrak crown on top
function yurt(x, y, s, phase) {
  const W = 34 * s, wall = 8.4 * s, rise = 8.6 * s, crown = 3.6 * s, eave = 1.3 * s;
  const l = x - W / 2, r = x + W / 2;
  const sag = 1.3 * s;
  const ty = y - wall - rise;
  const left = quad([l - eave, y - wall + 0.8 * s], [x - W * 0.3, y - wall - rise * 0.62], [x - crown, ty]);
  const right = quad([x + crown, ty], [x + W * 0.3, y - wall - rise * 0.62], [r + eave, y - wall + 0.8 * s]);
  const roof = [...left, ...right];
  const base = [];
  for (let i = 20; i >= 0; i--) base.push([l + (i / 20) * W, y + Math.sin((i / 20) * Math.PI) * sag]);
  poly([...roof, [r, y - wall + 0.8 * s], ...base, [l, y - wall + 0.8 * s]], PAPER);
  // lattice wall (kerege)
  const clip = (p) => [Math.min(r, Math.max(l, p[0])), p[1]];
  for (let k = -W; k < W; k += 3 * s) {
    for (const d of [1, -1]) {
      const p0 = clip([l + k, y]), p1 = clip([l + k + d * wall, y - wall]);
      if (Math.abs(p0[0] - p1[0]) > 1) poly([p0, p1], null, ink(0.14), 0.45);
    }
  }
  // felt band at the top of the wall, seams on the roof
  stroke(div([[l, y - wall + 1.6 * s], [r, y - wall + 1.6 * s]], 6), { wid: 0.35 * s, col: ink(0.4), noi: 0.3, fun: () => 1 });
  for (let i = 1; i < 7; i++) {
    const px = l - eave + (i / 7) * (W + 2 * eave);
    const top = [x + (px - x) * 0.13, ty + 0.4];
    stroke([[px, heightAt(roof, px) + 0.6], [(px + top[0]) / 2, (heightAt(roof, px) + top[1]) / 2 + 0.3], top], { wid: 0.22, col: ink(0.2), noi: 0, fun: () => 1 });
  }
  // wooden door
  const dx = x + rand(-0.12, 0.12) * W;
  const dw = 2.4 * s, dh = wall * 0.86;
  poly([[dx - dw, y + sag * 0.9], [dx - dw, y - dh], [dx + dw, y - dh], [dx + dw, y + sag * 0.9]], ink(0.42), ink(0.6), 0.5);
  // outline
  stroke(roof, { wid: 0.75 * s, col: ink(0.72), noi: 0.5 });
  stroke(div([[l, y - wall + 0.8 * s], [l, y]], 3), { wid: 0.45 * s, col: ink(0.6), noi: 0.3, fun: () => 1 });
  stroke(div([[r, y - wall + 0.8 * s], [r, y]], 3), { wid: 0.45 * s, col: ink(0.6), noi: 0.3, fun: () => 1 });
  stroke(base, { wid: 0.4 * s, col: ink(0.45), noi: 0.5 });
  // shanyrak and smoke
  stroke(quad([x - crown, ty + 0.3], [x, ty - 1.6 * s], [x + crown, ty + 0.3], 6), { wid: 0.5 * s, col: ink(0.75), noi: 0.2, fun: () => 1 });
  if (R() < 0.7) {
    const sm = [];
    for (let i = 0; i < 10; i++) sm.push([x + Math.sin(i * 0.7 + phase) * 1.8 * s + i * 1.1 * s, ty - 1.5 * s - i * 1.9 * s]);
    stroke(sm, { wid: 0.9 * s, col: ink(0.1), noi: 0.8, fun: (t) => Math.sin(t * Math.PI) * (1 - t * 0.6) });
  }
}

// Horse in profile, dir 1 faces right. pose "graze" or "stand"; a rider wears a white kalpak
function horse(x, y, s, dir, pose, rider) {
  const X = (v) => x + dir * v * s;
  const Y = (v) => y - v * s;
  const P = (pts) => pts.map(([u, v]) => [X(u), Y(v)]);
  const a = rand(0.62, 0.82);
  const thin = { wid: 0.3 * s, col: ink(a), noi: 0.2, fun: () => 1 };
  // legs, far pair lighter
  for (const [lx, lo, k] of [[-4.6, 0.6, 0.75], [4.4, 0.5, 0.75], [-5.6, -0.4, 1], [3.4, 0.9, 1]]) {
    stroke(P([[lx, 7.6], [lx + lo * 0.5, 3.8], [lx + lo, 0.2]]), { ...thin, col: ink(a * k) });
  }
  // body: back, rump, belly, chest
  poly(P([[-6.4, 10.2], [-4.6, 11.4], [-1.2, 11], [2.4, 11.2], [4.6, 11.8], [6.4, 10.4], [6.2, 8.4], [4.4, 7.4], [-1, 7.2], [-4.8, 7.6], [-6.6, 8.6]]), ink(a));
  if (pose === "graze") {
    poly(P([[4.2, 11.6], [6.4, 10.8], [8.6, 6.2], [9.8, 2.2], [8.9, 1.6], [7.8, 3.2], [6.4, 6.6], [5.2, 8.4]]), ink(a));
    stroke(P([[4.4, 11.8], [6.6, 10.6], [8.2, 7.6]]), { wid: 0.4 * s, col: ink(a), noi: 0.8 });
  } else {
    poly(P([[4.2, 11.6], [5.8, 14.8], [6.6, 15.8], [7, 16.4], [7.4, 15.6], [9.6, 14.2], [10, 13.2], [8, 13.2], [6.6, 12.4], [5.4, 8.6]]), ink(a));
    stroke(P([[4.2, 11.9], [5.6, 14.6], [6.6, 15.8]]), { wid: 0.4 * s, col: ink(a), noi: 0.8 });
  }
  stroke(P([[-6.2, 10.6], [-7.6, 8.6], [-7.9, 5.2]]), { wid: 0.55 * s, col: ink(a * 0.9), noi: 0.8 });
  if (rider) {
    poly(P([[-1.4, 11.2], [1.2, 11.2], [0.9, 16.2], [-1, 16.2]]), ink(a));
    stroke(P([[0, 11.2], [0.8, 9.4], [0.6, 7.8]]), { ...thin, wid: 0.45 * s });
    stroke(P([[0.6, 15.6], [2.6, 13.6], [3.6, 12.8]]), thin);
    stroke(P([[3.6, 12.8], [6.6, 13.6], [9.4, 13.4]]), { ...thin, wid: 0.15 * s, col: ink(a * 0.7) });
    blob(X(0), Y(17.3), { len: 1.9 * s, wid: 1.7 * s, ang: Math.PI / 2, col: ink(a), noi: 0.2 });
    // white kalpak: tall felt cap with an upturned dark brim
    poly(P([[-1.2, 18.1], [1.2, 18.1], [0.3, 21.6]]), PAPER, ink(a), 0.4 * s);
    poly(P([[-1.4, 17.7], [1.4, 17.7], [1.3, 18.4], [-1.3, 18.4]]), ink(a));
  }
}

function sheep(x, y, s) {
  const body = blob(x, y - 2.2 * s, { len: 5.6 * s, wid: 3.6 * s, noi: 0.4, ret: true });
  poly(body, PAPER, ink(0.5), 0.45);
  blob(x + 3 * s, y - 2.8 * s, { len: 1.9 * s, wid: 1.4 * s, ang: 0.4, col: ink(0.65), noi: 0.2 });
  for (const lx of [-1.6, 1.4]) stroke([[x + lx * s, y - 0.8 * s], [x + lx * s, y + 0.4 * s], [x + lx * s, y + 0.8 * s]], { wid: 0.2 * s, col: ink(0.55), noi: 0, fun: () => 1 });
}

// Golden eagle, soaring
function eagle(x, y, s) {
  const dip = rand(0.2, 0.5);
  for (const side of [-1, 1]) {
    const w = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      w.push([x + side * t * 16 * s, y - Math.sin(t * Math.PI) * 3 * s + t * t * dip * 6 * s]);
    }
    stroke(w, { wid: 1.4 * s, col: ink(0.6), noi: 0.4, fun: (t) => Math.pow(Math.sin(t * Math.PI), 0.4) * (1 - t * 0.3) });
    for (let k = 0; k < 3; k++) {
      const tx = x + side * (14 + k * 1.2) * s;
      const ty = y + (dip * 5 - 1 + k) * s;
      stroke([[tx, ty], [tx + side * 2.4 * s, ty + 0.6 * s], [tx + side * 3.6 * s, ty + 1.4 * s]], { wid: 0.4 * s, col: ink(0.5), noi: 0 });
    }
  }
  blob(x, y + 0.6 * s, { len: 6 * s, wid: 2.2 * s, ang: Math.PI / 2, col: ink(0.65) });
  stroke([[x - 1.6 * s, y + 3.6 * s], [x, y + 5.6 * s], [x + 1.6 * s, y + 3.6 * s]], { wid: 0.8 * s, col: ink(0.55), noi: 0.3 });
}

// ---------------------------------------------------------------------------------------
// Planning: a deterministic list of things per chunk of the world

// The plain under everything in front of the mountains, continuous across tiles
const LAND = 486;
function land(it) {
  const pts = [];
  for (let x = Math.floor((it.x0 - 20) / 10) * 10; x <= it.x1 + 20; x += 10) pts.push([x, LAND + 6 * noise(x * 0.004, 77)]);
  poly([...pts, [it.x1 + 20, H + 10], [it.x0 - 20, H + 10]], PAPER);
}

const DRAW = {
  land,
  range,
  peak,
  hill,
  ground,
  lake,
  camp(it) {
    const n = it.n;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([it.x + (i - (n - 1) / 2) * rand(34, 46) * it.sca + rand(-6, 6), it.y + rand(-4, 4)]);
    pts.sort((p, q) => p[1] - q[1]);
    for (const [px, py] of pts) yurt(px, py, it.sca * rand(0.85, 1.1), it.s % 7);
    if (R() < 0.8) horse(it.x + rand(-1, 1) * n * 26 * it.sca, it.y + rand(4, 10), it.sca * 0.9, pick([-1, 1]), "stand", false);
  },
  herd(it) {
    const pts = [];
    for (let i = 0; i < it.n; i++) pts.push([it.x + rand(-1, 1) * it.n * 9, it.y + rand(-5, 5)]);
    pts.sort((p, q) => p[1] - q[1]);
    for (const [px, py] of pts) horse(px, py, it.sca * (0.85 + (py - it.y + 5) / 40), pick([-1, 1]), R() < 0.65 ? "graze" : "stand", false);
    if (it.rider) horse(it.x + rand(-1, 1) * it.n * 10, it.y + 8, it.sca * 1.05, pick([-1, 1]), "stand", true);
  },
  flock(it) {
    const pts = [];
    for (let i = 0; i < it.n; i++) pts.push([it.x + rand(-1, 1) * it.n * 2.6, it.y + rand(-4, 4)]);
    pts.sort((p, q) => p[1] - q[1]);
    for (const [px, py] of pts) sheep(px, py, it.sca * rand(1.1, 1.4));
    horse(it.x + it.n * 3 + 10, it.y + 6, it.sca * 1.5, -1, "stand", true);
  },
  poplars(it) {
    for (let i = 0; i < it.n; i++) poplar(it.x + (i - it.n / 2) * it.gap + rand(-3, 3), it.y + i * it.slope, it.hei * rand(0.85, 1.1), rand(0.4, 0.6));
  },
  orchard(it) {
    const pts = [];
    for (let i = 0; i < it.n; i++) pts.push([it.x + rand(-1, 1) * it.n * 8, it.y + rand(-5, 5)]);
    pts.sort((p, q) => p[1] - q[1]);
    for (const [px, py] of pts) apple(px, py, rand(10, 16), rand(0.3, 0.5));
  },
  eagle(it) {
    eagle(it.x, it.y, it.sca);
  },
};

const plans = new Map();
function plan(c) {
  if (plans.has(c)) return plans.get(c);
  const r = mulberry32(hash(SEED, c, 1));
  const x0 = c * CH;
  const out = [];
  const add = (o) => out.push({ ...o, s: hash(SEED, c, out.length + 7) });
  // far snowy ranges, overlapping into one long horizon
  add({ k: "range", x: x0 + r() * CH, y: 296 + r() * 22, w: 900 + r() * 700, h: 110 + r() * 90, half: 820 });
  // main peaks where the noise peaks, plus a second, farther row
  for (let x = x0; x < x0 + CH; x += 10) {
    const f = (t) => noise(t * 0.0021, 11.3);
    if (f(x) >= f(x - 10) && f(x) > f(x + 10) && f(x) > 0.45) {
      const p = Math.min(1, (f(x) - 0.45) / 0.22);
      const w = 420 + 360 * p + r() * 160;
      add({ k: "peak", x: x + (r() - 0.5) * 80, y: 372 + r() * 38, w, h: 160 + 170 * p + r() * 40, half: w / 2 });
    }
    const f2 = (t) => noise(t * 0.0032, 47.1);
    if (f2(x) >= f2(x - 10) && f2(x) > f2(x + 10) && f2(x) > 0.5) {
      const w = 300 + r() * 220;
      add({ k: "peak", x, y: 338 + r() * 20, w, h: 130 + r() * 90, a: 0.62, half: w / 2 });
    }
  }
  // foothills
  const hills = 1 + ((r() * 2.2) | 0);
  for (let i = 0; i < hills; i++) {
    const w = 260 + r() * 360;
    add({ k: "hill", x: x0 + r() * CH, y: 452 + r() * 50, w, h: 44 + r() * 70, half: w / 2 });
  }
  // steppe
  for (let i = 0; i < 4; i++) add({ k: "ground", x: x0 + r() * CH, y: 512 + r() * 84, w: 90 + r() * 300, half: 200 });
  if (r() < 0.16) add({ k: "lake", x: x0 + r() * CH, y: 500 + r() * 14, w: 160 + r() * 200, half: 200 });
  if (r() < 0.3) add({ k: "camp", x: x0 + r() * CH, y: 548 + r() * 34, n: 1 + ((r() * 3.4) | 0), sca: 0.9 + r() * 0.35, half: 160 });
  if (r() < 0.28) add({ k: "herd", x: x0 + r() * CH, y: 552 + r() * 36, n: 3 + ((r() * 6) | 0), sca: 0.95 + r() * 0.3, rider: r() < 0.5, half: 120 });
  if (r() < 0.16) add({ k: "flock", x: x0 + r() * CH, y: 556 + r() * 30, n: 8 + ((r() * 14) | 0), sca: 1, half: 120 });
  if (r() < 0.24) add({ k: "poplars", x: x0 + r() * CH, y: 528 + r() * 40, n: 4 + ((r() * 8) | 0), gap: 12 + r() * 8, slope: r() * 2 - 1, hei: 46 + r() * 30, half: 160 });
  if (r() < 0.22) add({ k: "orchard", x: x0 + r() * CH, y: 520 + r() * 50, n: 3 + ((r() * 5) | 0), half: 90 });
  if (r() < 0.14) add({ k: "eagle", x: x0 + r() * CH, y: 70 + r() * 120, sca: 0.8 + r() * 0.5, half: 40 });
  plans.set(c, out);
  return out;
}

const inked = new Map(); // recorded marks by theme and item, while the item is near

function drawTile(ctx, k, scale, dark) {
  g = ctx;
  INK = dark ? "214,214,214" : "48,48,48";
  PAPER = dark ? "#181818" : "#ffffff";
  LEAF = dark ? 0.6 : 1;
  const x0 = k * TW, x1 = x0 + TW;
  const lo = Math.floor((x0 - REACH) / CH), hi = Math.floor((x1 + REACH) / CH);
  for (const c of plans.keys()) if (c < lo - 8 || c > hi + 8) plans.delete(c);
  const items = [];
  for (let c = lo; c <= hi; c++) {
    for (const it of plan(c)) if (it.x + it.half + 24 > x0 && it.x - it.half - 24 < x1) items.push(it);
  }
  items.push({ k: "land", y: LAND, x: x0, x0, x1, s: hash(SEED, k, 3) });
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  ctx.lineJoin = "round";
  const theme = dark ? "d" : "l";
  for (const it of items) {
    const key = it.k === "land" ? null : theme + it.s;
    let marks = key && inked.get(key)?.marks;
    if (!marks) {
      R = mulberry32(it.s);
      IX = it.x;
      REC = marks = [];
      DRAW[it.k](it);
      if (key) inked.set(key, { marks, lo: it.x - it.half, hi: it.x + it.half });
    }
    replay(marks, it.x, x0, x1, scale);
  }
  // forget items out of reach of the next tiles either way
  for (const [key, e] of inked) if (e.hi < x0 - TW || e.lo > x1 + 2 * TW) inked.delete(key);
}

if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
  // Paint one tile per task, skipping requests that a newer size or theme has replaced
  const queue = [];
  let latest = 0;
  let timer = 0;
  const next = () => {
    timer = 0;
    const job = queue.shift();
    if (job && job.id >= latest) {
      const { k, s, dark, id } = job;
      const canvas = new OffscreenCanvas(Math.round(TW * s), Math.round(H * s));
      drawTile(canvas.getContext("2d"), k, s, dark);
      const bitmap = canvas.transferToImageBitmap();
      self.postMessage({ k, id, bitmap }, [bitmap]);
    }
    if (queue.length) timer = setTimeout(next);
  };
  self.onmessage = ({ data }) => {
    latest = Math.max(latest, data.id);
    queue.push(data);
    timer ||= setTimeout(next);
  };
} else {
  self.Ink = { drawTile, H, TW };
}
