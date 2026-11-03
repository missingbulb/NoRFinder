// What Edit Image does to an image (req/shell/data/edit), without the page: the image as it will be saved, drawn
// from the page's 8-bit planes (its crop, its parts pulled apart, the slices and channels kept, the imperfections
// blank), where a point lands between the image and that drawing, the slices worth keeping, and the imperfections
// as a mask of the image's pixels.
"use strict";

// the gap drawn between the parts of a split, as a share of the image's longer side
const GAP_SHARE = 0.06;
// a slice holds signal when its 99th percentile stands above its median by this share of the best slice's
const SIGNAL_SHARE = 0.25;
// the pixels sampled from each plane when measuring a slice's signal
const SAMPLES = 4096;

// An edit: {crop: {x0, y0, x1, y1}, xs, ys (the cuts, xs[0] = x0 to xs[cols] = x1, in the image's pixels), left (a Set
// of "row,col" parts left out), z: [first, last] slice kept (from 0), channels (a Set of the places kept), mask (a
// Uint8Array of W × H, 1 where an imperfection is, or null)}; the whole image, kept as it is, at first
export function whole(W, H, Z, C) {
  return { crop: { x0: 0, y0: 0, x1: W, y1: H }, xs: [0, W], ys: [0, H], left: new Set(), z: [0, Z - 1], channels: new Set(Array.from({ length: C }, (_, c) => c)), mask: null };
}

// the gap between parts, in pixels of the drawing
export const gapOf = (W, H) => Math.max(4, Math.round(GAP_SHARE * Math.max(W, H)));

// Where the image's points land in the drawing, and back: the crop moved to the top left, each part shifted by
// the gaps before it. toView(x, y) -> [x', y']; toImage(x', y') -> [x, y], a point in a gap going to the part's edge;
// partAt(x', y') -> "row,col" or null in a gap
export function layout(e, W, H) {
  const g = e.xs.length > 2 || e.ys.length > 2 ? gapOf(W, H) : 0;
  const axis = (cuts) => {
    const at = (v) => { let k = 0; while (k < cuts.length - 2 && v >= cuts[k + 1]) k++; return k; };
    return {
      to: (v) => v - cuts[0] + g * at(v),
      back: (v) => {
        for (let k = 0; k < cuts.length - 1; k++) {
          const a = cuts[k] - cuts[0] + g * k, b = cuts[k + 1] - cuts[0] + g * k;
          if (v < b || k === cuts.length - 2) return { v: Math.max(cuts[k], Math.min(cuts[k + 1], v - g * k + cuts[0])), part: v >= a && v < b ? k : null };
          if (v < b + g) return { v: cuts[k + 1], part: null };
        }
      },
      size: cuts[cuts.length - 1] - cuts[0] + g * (cuts.length - 2),
    };
  };
  const X = axis(e.xs), Y = axis(e.ys);
  return {
    W: X.size, H: Y.size, gap: g,
    toView: (x, y) => [X.to(x), Y.to(y)],
    toImage: (x, y) => [X.back(x).v, Y.back(y).v],
    partAt: (x, y) => { const c = X.back(x).part, r = Y.back(y).part; return c == null || r == null ? null : `${r + 1},${c + 1}`; },
  };
}

// The drawing: im the page's image {W, H, Z, planes} (C flattened planes, then for a stack every slice of every
// channel, channel by channel); gives {W, H, Z, planes} in the same layout, the parts left out at a third of
// their brightness, a dropped channel and every imperfection 0, and the flattened planes the brightest of the
// slices kept
export function derive(im, e) {
  const { W, H } = im, Z = im.Z || 1, n = W * H, C = Math.floor(im.planes.length / (n * (Z > 1 ? 1 + Z : 1)));
  const L = layout(e, W, H), [z0, z1] = Z > 1 ? e.z : [0, 0], Zk = z1 - z0 + 1, m = L.W * L.H;
  const out = new Uint8Array(m * C * (Z > 1 ? 1 + Zk : 1));
  const rows = e.ys.length - 1, cols = e.xs.length - 1;
  // each drawing row's source row, and each column's, -1 in a gap; a part left out dimmed
  const srcX = new Int32Array(L.W).fill(-1), srcY = new Int32Array(L.H).fill(-1), dim = new Uint8Array(m);
  for (let c = 0; c < cols; c++) for (let x = e.xs[c]; x < e.xs[c + 1]; x++) srcX[L.toView(x, 0)[0]] = x;
  for (let r = 0; r < rows; r++) for (let y = e.ys[r]; y < e.ys[r + 1]; y++) srcY[L.toView(0, y)[1]] = y;
  for (const key of e.left) {
    const [r, c] = key.split(",").map(Number), [ax, ay] = L.toView(e.xs[c - 1], e.ys[r - 1]), w = e.xs[c] - e.xs[c - 1], h = e.ys[r] - e.ys[r - 1];
    for (let y = ay; y < ay + h; y++) dim.fill(1, y * L.W + ax, y * L.W + ax + w);
  }
  const copy = (src, at) => {
    for (let y = 0; y < L.H; y++) {
      const sy = srcY[y];
      if (sy < 0) continue;
      for (let x = 0, o = at + y * L.W; x < L.W; x++, o++) {
        const sx = srcX[x];
        if (sx < 0 || (e.mask && e.mask[sy * W + sx])) continue;
        const v = src[sy * W + sx];
        out[o] = dim[o - at] ? (v / 3) | 0 : v;
      }
    }
  };
  for (let c = 0; c < C; c++) {
    if (!e.channels.has(c)) continue;
    if (Z === 1) { copy(im.planes.subarray(c * n, (c + 1) * n), c * m); continue; }
    const top = new Uint8Array(m);
    for (let z = z0; z <= z1; z++) {
      const at = C * m + (c * Zk + z - z0) * m, slice = im.planes.subarray(C * n + (c * Z + z) * n, C * n + (c * Z + z + 1) * n);
      copy(slice, at);
      for (let i = 0; i < m; i++) if (out[at + i] > top[i]) top[i] = out[at + i];
    }
    out.set(top, c * m);
  }
  return { W: L.W, H: L.H, Z: Zk, planes: out };
}

// Each slice's signal, the mean over the channels of its 99th percentile less its median, and the slices
// suggested: from the first to the last whose signal is at least SIGNAL_SHARE of the best one's. im as derive
// takes it; gives {signal: [per slice], suggested: [first, last]}
export function suggestSlices(im) {
  const { W, H } = im, Z = im.Z || 1, n = W * H, C = Math.floor(im.planes.length / (n * (Z > 1 ? 1 + Z : 1)));
  const step = Math.max(1, Math.floor(n / SAMPLES)), signal = [];
  for (let z = 0; z < Z; z++) {
    let s = 0;
    for (let c = 0; c < C; c++) {
      const at = Z > 1 ? C * n + (c * Z + z) * n : c * n, hist = new Uint32Array(256);
      let k = 0;
      for (let i = 0; i < n; i += step, k++) hist[im.planes[at + i]]++;
      const rank = (q) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > q * (k - 1)) return v; } return 255; };
      s += rank(0.99) - rank(0.5);
    }
    signal.push(s / C);
  }
  const best = Math.max(...signal);
  if (!(best > 0)) return { signal, suggested: [0, Z - 1] };
  const on = signal.map((s) => s >= SIGNAL_SHARE * best);
  return { signal, suggested: [on.indexOf(true), on.lastIndexOf(true)] };
}

// the polygons ([[x, y], ...] in the image's pixels) filled into a mask of W × H, a pixel in when its centre is
export function maskOf(polygons, W, H) {
  if (!polygons.length) return null;
  const mask = new Uint8Array(W * H);
  for (const poly of polygons) {
    for (let y = 0; y < H; y++) {
      const cy = y + 0.5, xs = [];
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xa, ya] = poly[j], [xb, yb] = poly[i];
        if ((ya <= cy) !== (yb <= cy)) xs.push(xa + ((cy - ya) / (yb - ya)) * (xb - xa));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(0, Math.ceil(xs[k] - 0.5)), to = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
        if (to >= from) mask.fill(1, y * W + from, y * W + to + 1);
      }
    }
  }
  return mask;
}

// the share of the crop an imperfection mask covers, 0 to 1
export function maskShare(mask, crop, W) {
  if (!mask) return 0;
  let k = 0;
  for (let y = crop.y0; y < crop.y1; y++) for (let x = crop.x0; x < crop.x1; x++) k += mask[y * W + x];
  return k / Math.max(1, (crop.x1 - crop.x0) * (crop.y1 - crop.y0));
}

// an image's name without its extension: the name of the folder its edits are saved in (req/shell/data/edit-save)
export const stemOf = (name) => name.replace(/\.[^.]*$/, "");
// of a folder's listing ([{name, folder}]), whether an entry is an image its edits replace: one with a folder of
// its name beside it
export function replacedBy(entries) {
  const folders = new Set(entries.filter((f) => f.folder).map((f) => f.name));
  return (f) => !f.folder && folders.has(stemOf(f.name));
}
