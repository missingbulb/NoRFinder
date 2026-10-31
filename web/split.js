// Splitting an image into parts, so each part can be annotated on its own: the TIFF read whole (an ImageJ
// hyperstack, an OME-TIFF in one file, or plain pages; uncompressed, LZW, Deflate or PackBits, in strips or
// tiles), cut along a grid, each part written as an ImageJ TIFF with the channels and slices chosen. A part keeps
// the image's scale, its channels' colours, names and display ranges, and records in its Info where it lay in the
// image it came from (SPLIT_KEY), which is what joins the parts' ground truth back into the whole image's.
"use strict";

// the line of a part's ImageJ Info that holds its record, "rauntruth.split={…}", and the record's version
export const SPLIT_KEY = "rauntruth.split", SPLIT_VERSION = 1;
// the suffix a part's file name takes at first: _r1c2 for the first row's second part
export const DEFAULT_PATTERN = "_r{row}c{col}";

// ---------- reading ----------
const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
// a tag's values: a string for ASCII, [numerator, denominator] pairs for a rational, a Uint8Array for bytes, else numbers
function value(v, type, count, at, little) {
  const bytes = new Uint8Array(v.buffer, v.byteOffset + at, count * SIZE[type]);
  if (type === 2) return new TextDecoder("latin1").decode(bytes).replace(/\0+$/, "");
  if (type === 1 || type === 7) return bytes;
  const out = [];
  for (let i = 0; i < count; i++) {
    const o = at + i * SIZE[type];
    out.push(type === 3 ? v.getUint16(o, little) : type === 4 ? v.getUint32(o, little) : type === 8 ? v.getInt16(o, little)
      : type === 9 ? v.getInt32(o, little) : type === 6 ? v.getInt8(o) : type === 11 ? v.getFloat32(o, little) : type === 12 ? v.getFloat64(o, little)
        : type === 5 ? [v.getUint32(o, little), v.getUint32(o + 4, little)] : [v.getInt32(o, little), v.getInt32(o + 4, little)]);
  }
  return out;
}

// every IFD of a classic TIFF: [{tag: value}]
function ifds(buf) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, buf.byteLength);
  const mark = v.getUint16(0), little = mark === 0x4949;
  if (!little && mark !== 0x4d4d) throw new Error("not a TIFF file");
  const magic = v.getUint16(2, little);
  if (magic === 43) throw new Error("BigTIFF files cannot be split here yet");
  if (magic !== 42) throw new Error("not a TIFF file");
  const out = [], seen = new Set();
  for (let at = v.getUint32(4, little); at && !seen.has(at) && at + 2 <= v.byteLength; at = v.getUint32(at + 2 + 12 * v.getUint16(at, little), little)) {
    seen.add(at);
    const tags = {};
    for (let i = 0, n = v.getUint16(at, little); i < n; i++) {
      const e = at + 2 + 12 * i, tag = v.getUint16(e, little), type = v.getUint16(e + 2, little), count = v.getUint32(e + 4, little);
      if (!SIZE[type]) continue;
      const where = count * SIZE[type] <= 4 ? e + 8 : v.getUint32(e + 8, little);
      if (where + count * SIZE[type] <= v.byteLength) tags[tag] = value(v, type, count, where, little);
    }
    out.push(tags);
  }
  return { v, little, pages: out };
}

// LZW as TIFF writes it: codes most significant bit first, the code width growing one code early
function lzw(src, size) {
  const out = new Uint8Array(size), prefix = new Int32Array(4096), suffix = new Uint8Array(4096), first = new Uint8Array(4096), len = new Int32Array(4096);
  for (let i = 0; i < 256; i++) { prefix[i] = -1; suffix[i] = first[i] = i; len[i] = 1; }
  let next = 258, width = 9, old = -1, bit = 0, op = 0;
  const read = () => {
    const b = bit >> 3;
    if (b >= src.length) return 257;
    const w = (src[b] << 16) | ((src[b + 1] || 0) << 8) | (src[b + 2] || 0);
    bit += width;
    return (w >> (24 - ((bit - width) & 7) - width)) & ((1 << width) - 1);
  };
  const emit = (code) => {
    let i = op + len[code] - 1;
    for (let c = code; c >= 0; c = prefix[c], i--) if (i < size) out[i] = suffix[c];
    op += len[code];
  };
  const add = (p, c) => { if (next < 4096) { prefix[next] = p; suffix[next] = c; first[next] = first[p]; len[next] = len[p] + 1; next++; } };
  while (op < size) {
    const code = read();
    if (code === 257) break;
    if (code === 256) { next = 258; width = 9; old = -1; continue; }
    if (old < 0) { if (code >= 256) break; emit(code); old = code; continue; }
    if (code < next) { emit(code); add(old, first[code]); }
    else if (code === next) { add(old, first[old]); emit(code); }
    else break;
    old = code;
    if (next >= (1 << width) - 1 && width < 12) width++;
  }
  return out;
}

function packbits(src, size) {
  const out = new Uint8Array(size);
  for (let i = 0, o = 0; i < src.length && o < size;) {
    const n = (src[i++] << 24) >> 24;
    if (n >= 0) { out.set(src.subarray(i, i + n + 1).subarray(0, size - o), o); o += n + 1; i += n + 1; }
    else if (n !== -128) { out.fill(src[i++], o, Math.min(size, o + 1 - n)); o += 1 - n; }
  }
  return out;
}

async function inflate(src) {
  const s = new Blob([src]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// a chunk (a strip or a tile) of a page, decompressed and its horizontal predictor undone: rows of `across`
// pixels of `spc` samples each
async function chunk(page, raw, size, across, spc, bps, little) {
  const c = page.compression;
  let b = c === 1 ? raw : c === 5 ? lzw(raw, size) : c === 8 || c === 32946 ? await inflate(raw) : c === 32773 ? packbits(raw, size) : null;
  if (!b) throw new Error(`this TIFF's compression (${c}) cannot be read here`);
  if (page.predictor === 2) {
    b = b === raw ? raw.slice() : b;
    const row = across * spc, rows = Math.floor(b.length / (row * bps)), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (let y = 0; y < rows; y++) for (let i = spc; i < row; i++) {
      const o = (y * row + i) * bps, p = o - spc * bps;
      if (bps === 1) b[o] = (b[o] + b[p]) & 255;
      else if (bps === 2) dv.setUint16(o, (dv.getUint16(o, little) + dv.getUint16(p, little)) & 0xffff, little);
      else dv.setUint32(o, (dv.getUint32(o, little) + dv.getUint32(p, little)) >>> 0, little);
    }
  } else if (page.predictor && page.predictor !== 1) throw new Error(`this TIFF's predictor (${page.predictor}) cannot be read here`);
  return b;
}

// a page's samples, one little-endian plane of W × H per sample
async function decodePage(buf, page, little) {
  const { W, H, spp, bps } = page, planes = Array.from({ length: spp }, () => new Uint8Array(W * H * bps));
  const tiled = !!page.tileW, cw = tiled ? page.tileW : W, chh = tiled ? page.tileH : Math.min(page.rps, H);
  const across = Math.ceil(W / cw), down = Math.ceil(H / chh), separate = page.planar === 2 && spp > 1, spc = separate ? 1 : spp;
  for (let s0 = 0; s0 < (separate ? spp : 1); s0++) for (let ty = 0; ty < down; ty++) for (let tx = 0; tx < across; tx++) {
    const k = s0 * across * down + ty * across + tx, at = page.offsets[k], n = page.counts[k];
    if (at === undefined || at + n > buf.byteLength) throw new Error("this TIFF is cut short");
    const rows = tiled ? chh : Math.min(chh, H - ty * chh);
    const b = await chunk(page, new Uint8Array(buf.buffer || buf, (buf.byteOffset || 0) + at, n), cw * rows * spc * bps, cw, spc, bps, little);
    const x0 = tx * cw, y0 = ty * chh, w = Math.min(cw, W - x0), h = Math.min(rows, H - y0);
    for (let s = 0; s < spc; s++) {
      const p = planes[s0 + s];
      for (let y = 0; y < h; y++) {
        const dst = ((y0 + y) * W + x0) * bps, src = (y * cw * spc) * bps;
        if (spc === 1 && (little || bps === 1)) { p.set(b.subarray(src, src + w * bps), dst); continue; }
        for (let x = 0; x < w; x++) {
          const si = src + (x * spc + s) * bps, di = dst + x * bps;
          for (let q = 0; q < bps; q++) p[di + q] = b[si + (little ? q : bps - 1 - q)];
        }
      }
    }
  }
  return planes;
}

// ImageJ's own metadata, tags 50838 and 50839: its Info, each plane's label, the display ranges, the LUTs and its
// properties
const IJ = { info: 0x696e666f, labels: 0x6c61626c, ranges: 0x72616e67, luts: 0x6c757473, props: 0x70726f70 };
function readIJ(counts, data, little) {
  const out = {};
  if (!counts || !data || data.length < 4) return out;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength), utf16 = new TextDecoder(little ? "utf-16le" : "utf-16be");
  let at = counts[0], k = 1;
  for (let h = 4; h + 8 <= counts[0]; h += 8) {
    const type = v.getUint32(h, little), n = v.getUint32(h + 4, little), items = [];
    for (let i = 0; i < n; i++, k++) { items.push(data.subarray(at, at + counts[k])); at += counts[k]; }
    const key = Object.keys(IJ).find((name) => IJ[name] === type);
    if (key === "info") out.info = utf16.decode(items[0]);
    else if (key === "labels") out.labels = items.map((b) => utf16.decode(b));
    else if (key === "props") out.props = items.map((b) => utf16.decode(b));
    else if (key === "luts") out.luts = items.map((b) => b.slice());
    else if (key === "ranges") out.ranges = items.flatMap((b) => Array.from({ length: b.length / 8 }, (_, i) => new DataView(b.buffer, b.byteOffset).getFloat64(i * 8, little)));
  }
  return out;
}

const keyed = (text) => Object.fromEntries(text.split("\n").map((l) => l.match(/^([^=]+)=(.*)$/)).filter(Boolean).map((m) => [m[1].trim(), m[2].trim()]));

// What a TIFF holds and how to read any one plane of it: {W, H, bps, sampleFormat, C, Z, T, names, xres, yres,
// resUnit, ij (the ImageJ header's fields), meta (ImageJ's metadata), record (the split record it carries, if it
// is a part itself), plane(c, z, t) -> its pixels, little-endian}
export function readTiff(input) {
  const buf = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  const { v, little, pages: raw } = ifds(buf);
  const page = (t) => {
    const bits = [].concat(t[258] || [1]);
    return { W: t[256]?.[0], H: t[257]?.[0], spp: t[277]?.[0] || 1, bits: bits[0], bps: bits[0] / 8, compression: t[259]?.[0] || 1, predictor: t[317]?.[0] || 1,
      planar: t[284]?.[0] || 1, rps: t[278]?.[0] || t[257]?.[0], tileW: t[322]?.[0], tileH: t[323]?.[0],
      offsets: t[324] || t[273] || [], counts: t[325] || t[279] || [], sampleFormat: t[339]?.[0] || 1, sub: t[254]?.[0] || 0 };
  };
  const t0 = raw[0], p0 = page(t0);
  if (![1, 2, 4, 8].includes(p0.bps)) throw new Error(`${p0.bits}-bit images cannot be split here`);
  // the full-size planes: reduced-resolution copies and thumbnails are left out
  let pages = raw.map(page).filter((p) => !(p.sub & 1) && p.W === p0.W && p.H === p0.H);
  const desc = typeof t0[270] === "string" ? t0[270] : "", ij = desc.startsWith("ImageJ=") ? keyed(desc) : null;
  const meta = readIJ(t0[50838], t0[50839], little);
  let C = p0.spp, Z = pages.length, T = 1, index = (c, z, t) => [t * Z + z, c], names = [];
  if (ij && p0.spp === 1) {
    const n = +ij.images || 1;
    C = +ij.channels || 1; T = +ij.frames || 1; Z = +ij.slices || Math.max(1, Math.floor(n / (C * T)));
    if (C * Z * T !== n) { Z = n; C = 1; T = 1; }
    // ImageJ writes a stack's planes one after another and may keep only the first page's IFD
    if (pages.length < n && p0.compression === 1 && p0.offsets.length === 1) {
      const step = p0.W * p0.H * p0.bps;
      pages = Array.from({ length: n }, (_, i) => ({ ...p0, offsets: [p0.offsets[0] + i * step], counts: [step] }));
    }
    index = (c, z, t) => [(t * Z + z) * C + c, 0];
    names = (meta.labels || []).slice(0, C).map((l) => (/^c:\d+\/\d+\b/.test(l.trim()) ? null : l.trim() || null));
  } else if (desc.includes("<OME") && p0.spp === 1) {
    const px = desc.match(/<Pixels\b[^>]*>/)?.[0] || "", at = (k) => +(px.match(new RegExp(`\\b${k}="(\\d+)"`))?.[1] || 1);
    const order = px.match(/\bDimensionOrder="(\w+)"/)?.[1] || "XYCZT";
    C = at("SizeC"); Z = at("SizeZ"); T = at("SizeT");
    if (C * Z * T > pages.length) throw new Error("this OME-TIFF keeps its planes in other files; open the file that holds them all");
    const size = { C, Z, T }, axes = order.slice(2).split("");
    index = (c, z, t) => { const at = { C: c, Z: z, T: t }; let i = 0, m = 1; for (const a of axes) { i += at[a] * m; m *= size[a]; } return [i, 0]; };
    names = [...desc.matchAll(/<Channel\b[^>]*>/g)].map((m) => m[0].match(/\bName="([^"]*)"/)?.[1] || null).slice(0, C);
  }
  if (C * Z * T > pages.length * (p0.spp === 1 ? 1 : p0.spp)) throw new Error("this TIFF has fewer planes than its header says");
  const recLine = (meta.info || "").split("\n").find((l) => l.startsWith(SPLIT_KEY + "="));
  let record = null;
  try { record = recLine ? JSON.parse(recLine.slice(SPLIT_KEY.length + 1)) : null; } catch { record = null; }
  let cache = { at: -1, planes: null };
  return {
    W: p0.W, H: p0.H, bps: p0.bps, sampleFormat: p0.sampleFormat, C, Z, T, names, ij, meta, record,
    xres: t0[282]?.[0] || null, yres: t0[283]?.[0] || null, resUnit: t0[296]?.[0] || null,
    async plane(c, z, t) {
      const [i, s] = index(c, z, t);
      if (cache.at !== i) cache = { at: i, planes: await decodePage(buf, pages[i], little) };
      return cache.planes[s];
    },
  };
}

// An image already in memory as 8-bit planes (a PNG the browser decoded), in the shape readTiff gives
export function fromPlanes(W, H, planes) {
  return { W, H, bps: 1, sampleFormat: 1, C: planes.length, Z: 1, T: 1, names: [], ij: null, meta: {}, record: null,
    xres: null, yres: null, resUnit: null, plane: async (c) => planes[c] };
}

// ---------- the grid ----------
// n parts of a side of `size` pixels, as the n + 1 places they are cut at, from 0 to size
export const evenCuts = (size, n) => Array.from({ length: n + 1 }, (_, i) => Math.round((size * i) / n));

// the parts a grid cuts, row by row: {row, col (from 1), n (from 1, counted over every part of the grid), x, y, w, h,
// left (true for a part left out)}; left: a Set of "row,col"
export function gridParts(xs, ys, left = new Set()) {
  const out = [];
  for (let r = 0; r < ys.length - 1; r++) for (let c = 0; c < xs.length - 1; c++) {
    out.push({ row: r + 1, col: c + 1, n: r * (xs.length - 1) + c + 1, x: xs[c], y: ys[r], w: xs[c + 1] - xs[c], h: ys[r + 1] - ys[r], left: left.has(`${r + 1},${c + 1}`) });
  }
  return out;
}

// a part's file name: the image's name without its extension, the pattern with its fields filled, ".tif".
// The fields: {name} {row} {col} {n} {x} {y} {rows} {cols}; anything else stays as written.
export function partName(pattern, name, p, rows, cols) {
  const fields = { name: name.replace(/\.[^.]+$/, ""), row: p.row, col: p.col, n: p.n, x: p.x, y: p.y, rows, cols };
  const suffix = pattern.replace(/\{(\w+)\}/g, (m, k) => (k in fields ? String(fields[k]) : m));
  return (pattern.includes("{name}") ? suffix : fields.name + suffix).replace(/[\\/:*?"<>|]/g, "_") + ".tif";
}

// why a pattern would not give every part its own name, or "" when it does
export function patternProblem(pattern, names) {
  if (!pattern.trim()) return "Give the file names a pattern.";
  return new Set(names).size < names.length ? "Two parts would get the same name: use {row} and {col}, {n}, or {x} and {y}." : "";
}

// ---------- writing ----------
const ascii = (s) => { const b = new Uint8Array(s.length + 1); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
function utf16le(s) { const b = new Uint8Array(s.length * 2), v = new DataView(b.buffer); for (let i = 0; i < s.length; i++) v.setUint16(i * 2, s.charCodeAt(i), true); return b; }

// ImageJ's metadata as tags 50838 (the byte count of each entry) and 50839 (the entries), little-endian
function writeIJ({ info, labels, ranges, luts, props }) {
  const head = [], body = [];
  const put = (type, items) => { if (!items?.length) return; head.push([type, items.length]); body.push(...items); };
  put(IJ.info, info ? [utf16le(info)] : null);
  put(IJ.labels, labels?.some((l) => l) ? labels.map((l) => utf16le(l || "")) : null);
  put(IJ.ranges, ranges?.length ? [new Uint8Array(new Float64Array(ranges).buffer)] : null);
  put(IJ.luts, luts?.length ? luts : null);
  put(IJ.props, props?.length ? props.map(utf16le) : null);
  if (!body.length) return null;
  const header = new Uint8Array(4 + head.length * 8), hv = new DataView(header.buffer);
  hv.setUint32(0, 0x494a494a, true);
  head.forEach(([type, n], i) => { hv.setUint32(4 + i * 8, type, true); hv.setUint32(8 + i * 8, n, true); });
  const all = [header, ...body], data = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let at = 0; for (const b of all) { data.set(b, at); at += b.length; }
  return { counts: all.map((b) => b.length), data };
}

// A classic little-endian TIFF of planes of w × h, uncompressed, one strip a page, laid out as ImageJ reads it:
// the planes one after another, then the IFDs
export function writeTiff({ w, h, bps, sampleFormat = 1, planes, xres, yres, resUnit, description, software, ijmeta }) {
  const plane = w * h * bps, dataEnd = 8 + plane * planes.length;
  const ij = ijmeta && writeIJ(ijmeta);
  // each IFD's entries: [tag, type, values (numbers, or a Uint8Array for bytes and ASCII)]
  const entries = (i) => {
    const e = [[254, 4, [0]], [256, 4, [w]], [257, 4, [h]], [258, 3, [bps * 8]], [259, 3, [1]], [262, 3, [1]]];
    if (i === 0 && description) e.push([270, 2, ascii(description)]);
    e.push([273, 4, [8 + i * plane]], [277, 3, [1]], [278, 4, [h]], [279, 4, [plane]]);
    if (xres) e.push([282, 5, [xres]]);
    if (yres) e.push([283, 5, [yres]]);
    if (resUnit) e.push([296, 3, [resUnit]]);
    if (i === 0 && software) e.push([305, 2, ascii(software)]);
    if (sampleFormat !== 1) e.push([339, 3, [sampleFormat]]);
    if (i === 0 && ij) e.push([50838, 4, ij.counts], [50839, 1, ij.data]);
    return e;
  };
  const outside = (type, vals) => (vals instanceof Uint8Array ? vals.length : vals.length * SIZE[type]);
  const sizes = planes.map((_, i) => { const e = entries(i); return 2 + 12 * e.length + 4 + e.reduce((a, [, t, x]) => a + (outside(t, x) > 4 ? (outside(t, x) + 1) & ~1 : 0), 0); });
  const total = dataEnd + (dataEnd & 1) + sizes.reduce((a, b) => a + b, 0);
  if (total > 2 ** 32 - 1) throw new Error("a part would be larger than 4 GB: split it into more parts, or keep fewer channels or slices");
  const out = new Uint8Array(total), v = new DataView(out.buffer);
  out[0] = out[1] = 0x49; v.setUint16(2, 42, true);
  planes.forEach((p, i) => out.set(p, 8 + i * plane));
  let at = dataEnd + (dataEnd & 1);
  v.setUint32(4, at, true);
  planes.forEach((_, i) => {
    const e = entries(i), start = at;
    let extra = start + 2 + 12 * e.length + 4;
    v.setUint16(start, e.length, true);
    e.forEach(([tag, type, vals], k) => {
      const o = start + 2 + 12 * k, n = vals.length;
      v.setUint16(o, tag, true); v.setUint16(o + 2, type, true); v.setUint32(o + 4, n, true);
      const size = outside(type, vals), where = size > 4 ? extra : o + 8;
      if (size > 4) { v.setUint32(o + 8, extra, true); extra += (size + 1) & ~1; }
      if (vals instanceof Uint8Array) out.set(vals, where);
      else vals.forEach((x, j) => {
        if (type === 3) v.setUint16(where + j * 2, x, true);
        else if (type === 4) v.setUint32(where + j * 4, x, true);
        else if (type === 5) { v.setUint32(where + j * 8, x[0], true); v.setUint32(where + j * 8 + 4, x[1], true); }
      });
    });
    at = extra;
    v.setUint32(start + 2 + 12 * e.length, i + 1 < planes.length ? at : 0, true);
  });
  return out;
}

// a LUT of 3 × 256 bytes from black to the colour #rrggbb, as ImageJ keeps one
function lutOf(colour) {
  const lut = new Uint8Array(768), rgb = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
  for (let k = 0; k < 3; k++) for (let i = 0; i < 256; i++) lut[k * 256 + i] = Math.round((rgb[k] * i) / 255);
  return lut;
}

// ImageJ's header for a part: its shape, and what it keeps of the image's (its unit, slice spacing, timing)
const KEEP = ["unit", "cf", "c0", "c1", "vunit", "spacing", "finterval", "fps", "loop", "xunit", "yunit", "zunit", "tunit"];
function description(src, C, Z, T, x0, y0, z0, ranges) {
  const ij = src.ij || {}, lines = [`ImageJ=${ij.ImageJ || "1.54f"}`, `images=${C * Z * T}`];
  if (C > 1) lines.push(`channels=${C}`);
  if (Z > 1) lines.push(`slices=${Z}`);
  if (T > 1) lines.push(`frames=${T}`);
  if (C > 1 || (Z > 1 && T > 1)) lines.push("hyperstack=true");
  if (C > 1) lines.push(`mode=${ij.mode || "composite"}`);
  for (const k of KEEP) if (k in ij) lines.push(`${k}=${ij[k]}`);
  // ImageJ moves the origin as it crops, so a point keeps its calibrated place
  if (ij.xorigin) lines.push(`xorigin=${+ij.xorigin - x0}`);
  if (ij.yorigin) lines.push(`yorigin=${+ij.yorigin - y0}`);
  if (ij.zorigin) lines.push(`zorigin=${+ij.zorigin - z0}`);
  if (C === 1 && ranges) lines.push(`min=${ranges[0]}`, `max=${ranges[1]}`);
  else if (C === 1 && "min" in ij && "max" in ij) lines.push(`min=${ij.min}`, `max=${ij.max}`);
  return lines.join("\n") + "\n";
}

// The parts, each an ImageJ TIFF: src from readTiff or fromPlanes; parts from gridParts (those left out are
// skipped); channels, the image's channels to keep, by place; slices, [first, last] of the slices to keep (from
// 0, both kept); look, each channel's [{name, colour}] as the page shows it, for a channel the file neither names
// nor colours; source, {name, sha256, ...where it came from}. progress(done, of) after each plane read, awaited.
// Gives [{name, bytes, record}], record what the part's Info says of where it came from.
export async function splitImage(src, { xs, ys, parts, channels, slices, look = [], pattern = DEFAULT_PATTERN, source, progress }) {
  const keep = parts.filter((p) => !p.left), [z0, z1] = slices || [0, src.Z - 1], Z = z1 - z0 + 1, C = channels.length, T = src.T;
  if (!keep.length) throw new Error("every part is left out");
  if (!C) throw new Error("keep at least one channel");
  if (z0 < 0 || z1 >= src.Z || Z < 1) throw new Error(`the slices kept must be between 1 and ${src.Z}`);
  const rows = ys.length - 1, cols = xs.length - 1, bps = src.bps, meta = src.meta || {};
  const out = keep.map((p) => ({ p, planes: [] }));
  let done = 0;
  for (let t = 0; t < T; t++) for (let z = z0; z <= z1; z++) for (const c of channels) {
    const plane = await src.plane(c, z, t);
    for (const o of out) {
      const { x, y, w, h } = o.p, part = new Uint8Array(w * h * bps);
      for (let r = 0; r < h; r++) part.set(plane.subarray(((y + r) * src.W + x) * bps, ((y + r) * src.W + x + w) * bps), r * w * bps);
      o.planes.push(part);
    }
    await progress?.(++done, T * Z * C);
  }
  // what the image says of each plane and channel, carried over for the ones kept
  const planeIndex = (c, z, t) => (t * src.Z + z) * src.C + c;
  const labels = [];
  for (let t = 0; t < T; t++) for (let z = z0; z <= z1; z++) for (const c of channels) {
    const own = meta.labels?.length === src.C * src.Z * src.T ? meta.labels[planeIndex(c, z, t)] : null;
    labels.push(own || src.names[c] || look[c]?.name || "");
  }
  const ranges = meta.ranges?.length >= 2 * src.C ? channels.flatMap((c) => [meta.ranges[2 * c], meta.ranges[2 * c + 1]]) : null;
  const luts = channels.map((c) => meta.luts?.[c] || (look[c]?.colour ? lutOf(look[c].colour) : null));
  const otherInfo = (meta.info || "").split("\n").filter((l) => !l.startsWith(SPLIT_KEY + "=")).join("\n").trim();
  const shape = { width: src.W, height: src.H, channels: src.C, slices: src.Z, frames: src.T };
  // a part of a part: where it lies in the image the first split began from
  const parent = src.record;
  return out.map(({ p, planes }) => {
    const record = {
      version: SPLIT_VERSION,
      source: { ...source, ...shape },
      grid: { rows, cols, xs, ys },
      part: { row: p.row, col: p.col, n: p.n, x: p.x, y: p.y, width: p.w, height: p.h },
      channels, slices: [z0, z1],
      ...(parent && { root: { ...(parent.root || parent.source), x: (parent.root || parent.part).x + p.x, y: (parent.root || parent.part).y + p.y } }),
    };
    const info = (otherInfo ? otherInfo + "\n" : "") + `${SPLIT_KEY}=${JSON.stringify(record)}`;
    const bytes = writeTiff({
      w: p.w, h: p.h, bps, sampleFormat: src.sampleFormat, planes,
      xres: src.xres, yres: src.yres, resUnit: src.resUnit,
      description: description(src, C, Z, T, p.x, p.y, z0, C === 1 ? ranges : null),
      software: "rauntruth.com",
      ijmeta: { info, labels, ranges: C > 1 ? ranges : null, luts: luts.every(Boolean) ? luts : null, props: meta.props },
    });
    return { name: partName(pattern, source.name, p, rows, cols), bytes, record };
  });
}

// ---------- the download ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

// a ZIP of files [{name, bytes}], stored as they are: TIFF planes barely compress, and storing keeps it quick
export function zip(files) {
  const enc = new TextEncoder(), local = [], central = [];
  let at = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.bytes), size = f.bytes.length;
    if (at + 30 + name.length + size > 2 ** 32 - 1) throw new Error("the parts come to more than 4 GB: download fewer at a time");
    const h = new Uint8Array(30 + name.length), v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true);
    v.setUint32(14, crc, true); v.setUint32(18, size, true); v.setUint32(22, size, true); v.setUint16(26, name.length, true);
    h.set(name, 30);
    const c = new Uint8Array(46 + name.length), cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, size, true); cv.setUint32(24, size, true); cv.setUint16(28, name.length, true);
    cv.setUint32(42, at, true); c.set(name, 46);
    local.push(h, f.bytes); central.push(c);
    at += h.length + size;
  }
  const dir = central.reduce((a, b) => a + b.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, dir, true); ev.setUint32(16, at, true);
  return new Blob([...local, ...central, end], { type: "application/zip" });
}
