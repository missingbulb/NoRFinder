// Opening an image for the viewers, the same way in every study and with no Python (req/shell/image/open): a TIFF
// read by split.js's reader, a HEIC (a phone's photo) by libheif, any other image as the browser decodes it. Each channel is shown under the name the file
// gives it and in the colour the file displays it in; its contrast is set once over the whole stack, between its 0.5%
// quantile and its upper one (the study's view.upper, else 99.8%), its black point then lifted where the black-point
// method says (BLACK_POINT), or left as stored where the study's view.stretch is false; a stack comes flattened (each pixel the brightest of every slice) and slice by slice.
// What it gives: {W, H, Z, um, umY, spacing, info, channels: [{name?, colour?}], raw: [per channel, per slice, the
// file's own samples], images: one buffer, the viewers' whole image: planes, the channels' 8-bit flattened planes
// one after another, then volume, every slice of every channel, channel by channel, 8-bit, for a stack (Z > 1);
// planes and volume (null for a flat image) are views into it}.
import { readTiff, fromPlanes } from "./split.js";

const LOWER = 0.005, UPPER = 0.998;
// a robust standard deviation in median absolute deviations, for normal noise, and how many of them a
// background-measured black point stands above the background's median
const SIGMA_PER_MAD = 1.4826, ABOVE = 2.5;
// the share of the flattened image a flattened window leaves black and the share it leaves under full colour
const FLAT_DARK = 0.01, FLAT_LIGHT = 0.987;
// the channels shown at most: each is a plane of the image's size in the page's memory
export const MOST = 8;
const RGB = [{ name: "Red", colour: "#ff0000" }, { name: "Green", colour: "#00ff00" }, { name: "Blue", colour: "#0000ff" }];
const MICRONS = ["micron", "um", "µm"];

// libheif's WebAssembly build, fetched the first time a HEIC is opened
const LIBHEIF = "https://cdn.jsdelivr.net/npm/libheif-js@1.19.8/libheif-wasm/libheif-bundle.mjs";
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);
const isHeif = (b) => b.length >= 12 && String.fromCharCode(...b.subarray(4, 8)) === "ftyp" && HEIF_BRANDS.has(String.fromCharCode(...b.subarray(8, 12)));
let libheif = null;

const isTiff = (b) => b.length >= 4 && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 42) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 42) ||
  (b[0] === 0x49 && b[1] === 0x49 && b[2] === 43) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 43));

// the image in bytes (an ArrayBuffer or Uint8Array) as the viewers show it; view: the study's study.json view
export async function openImage(bytes, view = {}) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (isTiff(b)) return openTiff(b, view);
  if (isHeif(b)) return openHeif(b, view);
  const { W, H, rgba } = await browserPixels(b);
  return fromPixels(W, H, rgba, view, greyFile(b));
}

async function openHeif(b, view) {
  const { W, H, rgba } = await heifPixels(b);
  return fromPixels(W, H, rgba, view, false);
}
// a HEIC's primary image, turned as the file says it was held, as RGBA
async function heifPixels(b) {
  libheif ||= import(LIBHEIF).then((m) => m.default());
  const [im] = new (await libheif).HeifDecoder().decode(b);
  if (!im) throw new Error("This HEIC file holds no image.");
  const W = im.get_width(), H = im.get_height();
  const rgba = await new Promise((ok, no) => im.display({ data: new Uint8ClampedArray(W * H * 4), width: W, height: H },
    (d) => (d ? ok(d.data) : no(new Error("This HEIC file could not be decoded.")))));
  im.free?.();
  return { W, H, rgba };
}
// any other image as the browser decodes it, RGBA
async function browserPixels(b) {
  const bitmap = await createImageBitmap(new Blob([b])), W = bitmap.width, H = bitmap.height;
  const cv = new OffscreenCanvas(W, H), ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const rgba = ctx.getImageData(0, 0, W, H).data;
  bitmap.close?.();
  return { W, H, rgba };
}

// the image in bytes as split.js's reader gives it, read by the decoder the viewers use for it: a TIFF's own
// planes, a photo's red, green and blue
export async function readImage(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (isTiff(b)) return readTiff(b);
  const { W, H, rgba } = await browserPixels(b), n = W * H, planes = [0, 1, 2].map(() => new Uint8Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) planes[j][i] = rgba[4 * i + j];
  return fromPlanes(W, H, planes);
}

// Where each channel's black and white points sit, as [black, white] steps of its 256 between the 0.5% and upper
// quantiles that a method measures on the channel's histograms there, the whole stack's (h) and its flattened
// image's (flat); [0, 255] leaves them at the quantiles. The method is a preference, the first set of the image's,
// the user's, the study's (view.blackPoint) and its format's; the shell has the last two.
const BLACK_POINT = {
  quantile: () => [0, 255],
  triangle: (h) => [triangle(h), 255],
  background: (h) => [background(h), 255],
  // the window that leaves the flattened image's darkest FLAT_DARK black and its brightest 1 - FLAT_LIGHT full colour
  flattened: (h, flat) => [stepAt(flat, FLAT_DARK), stepAt(flat, FLAT_LIGHT)],
};
// the step of a 256-step histogram at quantile q, the lower of the two ranks it falls between
function stepAt(h, q) {
  const k = Math.floor(q * (h.reduce((a, v) => a + v, 0) - 1));
  let seen = 0;
  for (let b = 0; b < 256; b++) { seen += h[b]; if (seen > k) return b; }
  return 255;
}

// Zack's triangle: the step farthest below the line from the histogram's peak to its brightest filled step, where
// the background's fall meets the signal's tail; none for a peak in the bright half, a light background
function triangle(h) {
  let p = 0, e = 255;
  for (let b = 1; b < 256; b++) if (h[b] > h[p]) p = b;
  while (e > p && !h[e]) e--;
  if (p > 127 || e <= p) return 0;
  let t = p, most = -Infinity;
  for (let b = p; b <= e; b++) { const d = h[p] * (e - b) - h[b] * (e - p); if (d > most) { most = d; t = b; } }
  return t;
}
// the background's median step and ABOVE robust standard deviations over it
function background(h) {
  const m = stepAt(h, 0.5), d = new Float64Array(256);
  for (let b = 0; b < 256; b++) d[Math.abs(b - m)] += h[b];
  return Math.min(254, m + ABOVE * SIGMA_PER_MAD * stepAt(d, 0.5));
}
// a format's own black-point method: a fluorescence TIFF's background is most of its pixels, a photo's is not
const FORMAT_BLACK = { tiff: "triangle", photo: "quantile" };

// whether a PNG or a JPEG says it is grey (true) or in colour (false); null for a file that does not say
export function greyFile(b) {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b.length > 25) return b[25] === 0 || b[25] === 4;
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let at = 2; at + 9 < b.length && b[at] === 0xff;) {
      const kind = b[at + 1], len = (b[at + 2] << 8) | b[at + 3];
      if (kind >= 0xc0 && kind <= 0xcf && kind !== 0xc4 && kind !== 0xc8 && kind !== 0xcc) return b[at + 9] === 1;
      at += 2 + len;
    }
  }
  return null;
}

// an image the browser decoded, RGBA: one grey channel where the file says it is grey, or, where it does not say,
// when red, green and blue agree everywhere; else the three
export function fromPixels(W, H, rgba, view = {}, said = null) {
  const n = W * H, ch = [0, 1, 2].map((k) => { const p = new Uint8Array(n); for (let i = 0; i < n; i++) p[i] = rgba[4 * i + k]; return p; });
  let grey = said ?? true;
  if (said === null) for (let i = 0; i < n && grey; i++) grey = ch[0][i] === ch[1][i] && ch[1][i] === ch[2][i];
  const chans = grey ? [ch[0]] : ch, names = grey ? [{ name: "Grey", colour: "#ffffff" }] : RGB;
  const info = [["Field", `${W} × ${H} px`], ["Depth", grey ? "8-bit grey" : "8-bit RGB"]];
  return shown(W, H, 1, chans.map((p) => [p]), names, view, "photo", { um: null, umY: null, spacing: null, info });
}

// a TIFF read whole, its first time point
export async function openTiff(b, view = {}) {
  const t = readTiff(b), tags = t.tags, ij = t.ij || {};
  const unit = String(ij.unit || "").toLowerCase(), microns = MICRONS.includes(unit);
  const side = (r) => (microns && r && r[0] ? r[1] / r[0] : null);
  const um = side(t.xres), umY = side(t.yres);
  const rgb = tags[277]?.[0] >= 3;
  const n = rgb ? Math.min(3, t.C) : Math.min(t.C, MOST);
  const luts = t.meta.luts || [];
  const said = rgb ? RGB.slice(0, n) : Array.from({ length: n }, (_, k) => {
    const c = luts[k] ? lutColour(luts[k]) : null, name = t.names[k];
    return { ...(name ? { name } : {}), ...(c ? { colour: c } : {}) };
  });
  const raw = [];
  for (let c = 0; c < n; c++) {
    const slices = [];
    for (let z = 0; z < t.Z; z++) slices.push(samples(await t.plane(c, z, 0), t.bps, t.sampleFormat));
    raw.push(slices);
  }
  const text = (k) => (typeof tags[k] === "string" ? tags[k].trim() : "");
  const x = um, y = umY, W = t.W, H = t.H, info = [];
  info.push(["Field", x && y ? `${(W * x).toFixed(1)} × ${(H * y).toFixed(1)} µm (${W} × ${H} px)` : `${W} × ${H} px`]);
  if (x && y) info.push(["Pixel", x === y ? `${x.toFixed(4)} µm` : `${x.toFixed(4)} × ${y.toFixed(4)} µm`]);
  info.push(["Depth", `${t.bps * 8}-bit`]);
  const series = new Set((t.meta.labels || []).filter((l) => l.includes(" - ")).map((l) => l.split(" - ").slice(1).join(" - ")));
  if (series.size === 1) info.push(["Series", [...series][0]]);
  const scope = [text(271), text(272)].filter(Boolean).join(" ");
  if (scope) info.push(["Microscope", scope]);
  if (text(306)) info.push(["Date", text(306)]);
  if (t.Z > 1) info.push(["Slices", String(t.Z)]);
  info.push(["Channels", n === t.C || rgb ? String(t.C) : `${t.C}, the first ${n} shown`]);
  const saved = text(305) || (ij.ImageJ ? `ImageJ ${ij.ImageJ}` : "");
  if (saved) info.push(["Saved by", saved]);
  const spacing = microns && ij.spacing ? Number(ij.spacing) : null;
  return shown(W, H, t.Z, raw, said, view, rgb ? "photo" : "tiff", { um, umY, spacing, info });
}

// a plane's little-endian bytes as numbers
function samples(bytes, bps, format) {
  const buf = bytes.byteOffset % bps ? bytes.slice().buffer : bytes.buffer, at = bytes.byteOffset % bps ? 0 : bytes.byteOffset, n = bytes.length / bps;
  if (format === 3) return bps === 8 ? new Float64Array(buf, at, n) : new Float32Array(buf, at, n);
  if (format === 2) return bps === 1 ? new Int8Array(buf, at, n) : bps === 2 ? new Int16Array(buf, at, n) : new Int32Array(buf, at, n);
  return bps === 1 ? new Uint8Array(buf, at, n) : bps === 2 ? new Uint16Array(buf, at, n) : new Uint32Array(buf, at, n);
}

// the colour an ImageJ LUT (256 reds, greens, blues) lights at its top, as #rrggbb at full brightness; null for a dark one
export function lutColour(lut) {
  const top = [lut[255], lut[511], lut[767]], most = Math.max(...top);
  if (!(most > 0)) return null;
  return "#" + top.map((v) => Math.round((v / most) * 255).toString(16).padStart(2, "0")).join("");
}

function shown(W, H, Z, raw, said, view, format, rest) {
  const n = W * H, C = raw.length, keep = view.stretch === false;
  const upper = view.upper ?? UPPER, black = BLACK_POINT[view.blackPoint ?? FORMAT_BLACK[format]];
  // a flat image's one slice is its flattened plane, so it is drawn there and nothing else is held
  const images = new Uint8Array(C * n * (Z > 1 ? 1 + Z : 1)), planes = images.subarray(0, C * n);
  const volume = Z > 1 ? images.subarray(C * n) : planes;
  raw.forEach((slices, c) => {
    const eight = keep && slices[0] instanceof Uint8Array;
    let lo = 0, hi = 255;
    if (!eight) {
      [lo, hi] = quantiles(slices, [LOWER, upper]);
      if (!(hi > lo)) [lo, hi] = extremes(slices);
      if (hi > lo) {
        // the stack's histogram and, in the plane drawn over below, its flattened image's
        const h = new Float64Array(256), hf = new Float64Array(256), span = hi - lo, top = planes.subarray(c * n, (c + 1) * n);
        for (const s of slices) for (let i = 0; i < n; i++) {
          const v = (s[i] - lo) / span, e = Math.trunc((v < 0 ? 0 : v > 1 ? 1 : v) * 255);
          h[e]++; if (e > top[i]) top[i] = e;
        }
        for (let i = 0; i < n; i++) hf[top[i]]++;
        top.fill(0);
        const [b, w] = black(h, hf);
        if ((b || w < 255) && w > b) [lo, hi] = [lo + (b * (hi - lo)) / 255, lo + (w * (hi - lo)) / 255];
      }
    }
    const flat = planes.subarray(c * n, (c + 1) * n);
    slices.forEach((s, z) => {
      const out = volume.subarray((c * Z + z) * n, (c * Z + z + 1) * n);
      if (eight) out.set(s);
      else if (hi > lo) {
        const span = hi - lo;
        for (let i = 0; i < n; i++) { const v = (s[i] - lo) / span; out[i] = Math.trunc((v < 0 ? 0 : v > 1 ? 1 : v) * 255); }
      }
      if (Z > 1) for (let i = 0; i < n; i++) if (out[i] > flat[i]) flat[i] = out[i];
    });
  });
  return { W, H, Z, channels: said, raw, images, planes, volume: Z > 1 ? volume : null, ...rest };
}

function extremes(slices) {
  let lo = Infinity, hi = -Infinity;
  for (const s of slices) for (let i = 0; i < s.length; i++) { const v = s[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
}

// numpy's quantile (its linear method, to the last bit) of every sample of every slice, at each of qs
export function quantiles(slices, qs) {
  const count = slices.reduce((a, s) => a + s.length, 0), at = order(slices, count);
  return qs.map((q) => {
    const v = (count - 1) * q, prev = Math.floor(v), gamma = v - prev;
    const a = at(Math.min(Math.max(prev, 0), count - 1)), b = at(Math.min(Math.max(prev + 1, 0), count - 1));
    const d = b - a;
    return gamma >= 0.5 ? b - d * (1 - gamma) : a + d * gamma;
  });
}

// the k-th smallest sample (from 0): by counting for 8- and 16-bit samples, else by sorting
function order(slices, count) {
  const s0 = slices[0], small = s0 instanceof Uint8Array || s0 instanceof Int8Array || s0 instanceof Uint16Array || s0 instanceof Int16Array;
  if (small) {
    const off = s0 instanceof Int8Array ? 128 : s0 instanceof Int16Array ? 32768 : 0;
    const hist = new Float64Array(s0 instanceof Uint8Array || s0 instanceof Int8Array ? 256 : 65536);
    for (const s of slices) for (let i = 0; i < s.length; i++) hist[s[i] + off]++;
    return (k) => { let seen = 0; for (let v = 0; v < hist.length; v++) { seen += hist[v]; if (seen > k) return v - off; } return hist.length - 1 - off; };
  }
  const all = new Float64Array(count);
  let at = 0;
  for (const s of slices) { all.set(s, at); at += s.length; }
  all.sort();
  return (k) => all[k];
}

// the image's channels in a study's own order, where its rule (order(im) -> the file's channel for each of the study's
// channels) says which holds what (req/shell/image/open); the ones it leaves out after them, as the file has them
export function inOrder(im, rule) {
  const C = im.channels.length, want = rule?.(im) || [];
  const order = [...want.filter((k) => k >= 0 && k < C), ...Array.from({ length: C }, (_, k) => k).filter((k) => !want.includes(k))];
  if (order.every((k, i) => k === i)) return im;
  const n = im.W * im.H, per = n * im.Z, images = new Uint8Array(im.images.length), planes = images.subarray(0, im.planes.length);
  const volume = im.volume && images.subarray(im.planes.length);
  order.forEach((k, i) => {
    planes.set(im.planes.subarray(k * n, (k + 1) * n), i * n);
    volume?.set(im.volume.subarray(k * per, (k + 1) * per), i * per);
  });
  return { ...im, channels: order.map((k) => im.channels[k]), raw: order.map((k) => im.raw[k]), images, planes, volume };
}
