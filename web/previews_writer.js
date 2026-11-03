// Making a folder's rauntruth-previews.tiff in the browser (req/shell/data/update-previews), page for page as
// dev/tools/previews/make_previews.py makes it (req/shell/drive/previews): a flat image one RGB page, its channels stretched and added in
// their colours; a stack a mini-volume, one 8-bit page per slice and channel. Pages are deflate-compressed with
// the horizontal predictor, the index the first page's description.
"use strict";

// the largest side of a flat image's page, of a stack's, and a stack's most slices
export const FLAT = 256, VOL = 96, SLICES = 24;
const DEFAULT_COLOURS = { 1: [[1, 1, 1]], 2: [[0, 1, 0], [1, 0, 1]], 3: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };

// a plane's pixels as numbers, from readTiff's little-endian bytes
function numbers(bytes, bps, sampleFormat) {
  const b = bytes.byteOffset % bps ? bytes.slice() : bytes, n = b.byteLength / bps;
  if (bps === 1) return b;
  if (bps === 2) return new Uint16Array(b.buffer, b.byteOffset, n);
  if (bps === 4) return sampleFormat === 3 ? new Float32Array(b.buffer, b.byteOffset, n) : new Uint32Array(b.buffer, b.byteOffset, n);
  return sampleFormat === 3 ? new Float64Array(b.buffer, b.byteOffset, n) : Float64Array.from(new BigUint64Array(b.buffer, b.byteOffset, n), Number);
}

// a plane at most `side` pixels a side, each pixel the mean of the source area it covers
export function shrink(a, W, H, side) {
  const k = side / Math.max(W, H);
  if (k >= 1) return { a: Float32Array.from(a), W, H };
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  // each output column's [first source column, weights over it]
  const spans = (n, m) => Array.from({ length: m }, (_, i) => {
    const x0 = (i * n) / m, x1 = ((i + 1) * n) / m, first = Math.floor(x0), ws = [];
    for (let x = first; x < Math.min(n, Math.ceil(x1)); x++) ws.push(Math.min(x + 1, x1) - Math.max(x, x0));
    return [first, ws, x1 - x0];
  });
  const sx = spans(W, w), sy = spans(H, h), rows = new Float64Array(w * H), out = new Float32Array(w * h);
  for (let y = 0; y < H; y++) for (let i = 0; i < w; i++) {
    const [f, ws, total] = sx[i];
    let s = 0; for (let j = 0; j < ws.length; j++) s += a[y * W + f + j] * ws[j];
    rows[y * w + i] = s / total;
  }
  for (let o = 0; o < h; o++) {
    const [f, ws, total] = sy[o];
    for (let i = 0; i < w; i++) { let s = 0; for (let j = 0; j < ws.length; j++) s += rows[(f + j) * w + i] * ws[j]; out[o * w + i] = s / total; }
  }
  return { a: out, W: w, H: h };
}

// numpy's percentile, linear between the closest ranks
function percentile(sorted, q) {
  const at = (q / 100) * (sorted.length - 1), lo = Math.floor(at), hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}
// 8-bit, its median black and its 99.8th percentile white, as the page draws stacks
export function stretch(a) {
  const s = Float64Array.from(a).sort(), lo = percentile(s, 50), hi = percentile(s, 99.8), k = 255 / Math.max(hi - lo, 1e-9);
  return Uint8Array.from(a, (v) => Math.max(0, Math.min(255, (v - lo) * k)));
}

// each channel's colour as the file displays it: the top of its ImageJ LUT, else the defaults by count
function colours(src) {
  const luts = src.meta?.luts || [];
  if (luts.length >= src.C) return luts.slice(0, src.C).map((l) => [l[255], l[511], l[767]].map((v) => +(v > 0)));
  const cols = DEFAULT_COLOURS[src.C] || DEFAULT_COLOURS[3];
  return Array.from({ length: src.C }, (_, c) => cols[c % cols.length]);
}

// {meta, pages: [{W, H, spp, data}]} of one image, src as readTiff (or fromPlanes) gives it
export async function makePreview(src, spacing = null) {
  const { W, H, C, Z } = src, cols = colours(src);
  const plane = async (c, z) => numbers(await src.plane(c, z, 0), src.bps, src.sampleFormat);
  if (Z === 1) {
    const planes = [];
    for (let c = 0; c < C; c++) planes.push(shrink(await plane(c, 0), W, H, FLAT));
    const { W: w, H: h } = planes[0], rgb = new Float32Array(w * h * 3);
    planes.forEach((p, c) => {
      const s = stretch(p.a), col = cols[c % cols.length];
      for (let i = 0; i < w * h; i++) for (let j = 0; j < 3; j++) rgb[i * 3 + j] += s[i] * col[j];
    });
    return { meta: { kind: "flat", channels: C, colours: cols }, pages: [{ W: w, H: h, spp: 3, data: Uint8Array.from(rgb, (v) => Math.min(255, v)) }] };
  }
  // slices grouped evenly into at most SLICES (the first groups one larger), each group's brightest kept
  const n = Math.min(Z, SLICES), groups = [];
  for (let g = 0, z = 0; g < n; g++) { const size = Math.floor(Z / n) + (g < Z % n ? 1 : 0); groups.push([z, z + size]); z += size; }
  const vol = []; // [c][g] shrunk planes
  for (let c = 0; c < C; c++) {
    vol.push([]);
    for (const [z0, z1] of groups) {
      const top = Float64Array.from(await plane(c, z0));
      for (let z = z0 + 1; z < z1; z++) { const p = await plane(c, z); for (let i = 0; i < top.length; i++) if (p[i] > top[i]) top[i] = p[i]; }
      vol[c].push(shrink(top, W, H, VOL));
    }
  }
  const { W: w, H: h } = vol[0][0], pages = [];
  const stretched = vol.map((gs) => {
    const all = new Float32Array(n * w * h);
    gs.forEach((p, g) => all.set(p.a, g * w * h));
    return stretch(all);
  });
  for (let g = 0; g < n; g++) for (let c = 0; c < C; c++) pages.push({ W: w, H: h, spp: 1, data: stretched[c].subarray(g * w * h, (g + 1) * w * h) });
  const meta = { kind: "stack", channels: C, slices: Z, colours: cols, volume: [n, C, h, w] };
  if (spacing) meta.spacing = spacing;
  return { meta, pages };
}

// zlib-compressed bytes
async function deflate(bytes) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
}

// the file's bytes: index {version, images}, pages [{W, H, spp, data}] in the index's order
export async function writePreviews(index, pages) {
  const desc = new TextEncoder().encode(JSON.stringify(index) + "\0");
  const strips = await Promise.all(pages.map(({ W, H, spp, data }) => {
    const d = Uint8Array.from(data);
    for (let y = 0; y < H; y++) for (let i = (y + 1) * W * spp - 1; i >= y * W * spp + spp; i--) d[i] = (d[i] - d[i - spp]) & 255;
    return deflate(d);
  }));
  // [tag, type, values]: 3 SHORT, 4 LONG, 2 ASCII (bytes)
  const tags = (p, k, at) => [[256, 4, [p.W]], [257, 4, [p.H]], [258, 3, Array(p.spp).fill(8)], [259, 3, [8]], [262, 3, [p.spp === 3 ? 2 : 1]],
    ...(k === 0 ? [[270, 2, desc]] : []), [273, 4, [at]], [277, 3, [p.spp]], [278, 4, [p.H]], [279, 4, [strips[k].length]], [284, 3, [1]], [317, 3, [2]]];
  const size = (type, v) => (type === 2 ? v.length : v.length * (type === 3 ? 2 : 4));
  let total = 8;
  const at = strips.map((s) => { const a = total; total += s.length + (s.length & 1); return a; });
  const ifdAt = pages.map((p, k) => {
    const a = total, e = tags(p, k, at[k]);
    total += 2 + 12 * e.length + 4 + e.reduce((n, [, t, v]) => n + (size(t, v) > 4 ? (size(t, v) + 1) & ~1 : 0), 0);
    return a;
  });
  const out = new Uint8Array(total), v = new DataView(out.buffer);
  out[0] = out[1] = 0x49; v.setUint16(2, 42, true); v.setUint32(4, ifdAt[0] || 0, true);
  strips.forEach((s, k) => out.set(s, at[k]));
  pages.forEach((p, k) => {
    const e = tags(p, k, at[k]), start = ifdAt[k];
    let extra = start + 2 + 12 * e.length + 4;
    v.setUint16(start, e.length, true);
    e.forEach(([tag, type, vals], j) => {
      const o = start + 2 + 12 * j, n = size(type, vals), where = n > 4 ? extra : o + 8;
      v.setUint16(o, tag, true); v.setUint16(o + 2, type, true); v.setUint32(o + 4, vals.length, true);
      if (n > 4) { v.setUint32(o + 8, extra, true); extra += (n + 1) & ~1; }
      if (type === 2) out.set(vals, where);
      else vals.forEach((x, i) => (type === 3 ? v.setUint16(where + 2 * i, x, true) : v.setUint32(where + 4 * i, x, true)));
    });
    v.setUint32(start + 2 + 12 * e.length, k + 1 < pages.length ? ifdAt[k + 1] : 0, true);
  });
  return out;
}

// The new file's bytes from the previews still valid in the old one (kept: [{entry, pages}], read with
// readPreviews' pages) and the ones just made (made: [{name, sha256, meta, pages}]), sorted by name as the
// tool sorts them
export async function buildPreviews(kept, made) {
  const all = [...kept.map(({ entry, pages }) => {
    const { name, sha256, page, pages: n, ...meta } = entry;
    return { name, sha256, meta, pages };
  }), ...made].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const index = { version: 1, images: [] }, pages = [];
  for (const im of all) {
    index.images.push({ name: im.name, sha256: im.sha256, page: pages.length, pages: im.pages.length, ...im.meta });
    pages.push(...im.pages);
  }
  return writePreviews(index, pages);
}
