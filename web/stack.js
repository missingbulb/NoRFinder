// What a TIFF holds, read from its first IFD and the ImageJ header in its description, and a small 3D picture of
// a stack: its planes, sampled down, turned a little and drawn brightest-first along each line of sight.
"use strict";

// {W, H, bits, spp, little, offset, compression, um, images, channels, slices, frames, spacing} from the start of
// a TIFF (an ArrayBuffer, the whole file or its first bytes); the ImageJ fields are null when it has no ImageJ
// header; null when it is not a TIFF
export function shape(buf) {
  const v = new DataView(buf), len = buf.byteLength;
  if (len < 8) return null;
  const little = v.getUint16(0) === 0x4949;
  if ((!little && v.getUint16(0) !== 0x4d4d) || v.getUint16(2, little) !== 42) return null;
  const ifd = v.getUint32(4, little);
  if (ifd + 2 > len) return null;
  const tags = {};
  for (let i = 0, n = v.getUint16(ifd, little); i < n; i++) {
    const e = ifd + 2 + 12 * i;
    if (e + 12 > len) break;
    const tag = v.getUint16(e, little), type = v.getUint16(e + 2, little), count = v.getUint32(e + 4, little);
    if (type === 2) {
      const at = count <= 4 ? e + 8 : v.getUint32(e + 8, little);
      if (at + count <= len) tags[tag] = new TextDecoder("latin1").decode(new Uint8Array(buf, at, count));
    } else if (type === 5) {
      const at = v.getUint32(e + 8, little);
      if (at + 8 <= len) tags[tag] = v.getUint32(at, little) / (v.getUint32(at + 4, little) || 1);
    } else {
      const one = type === 3 ? 2 : 4, at = count * one <= 4 ? e + 8 : v.getUint32(e + 8, little);
      if (at + one <= len) tags[tag] = one === 2 ? v.getUint16(at, little) : v.getUint32(at, little);
    }
  }
  const ij = typeof tags[270] === "string" && tags[270].startsWith("ImageJ=") ? tags[270] : "";
  const field = (k) => { const m = ij.match(new RegExp(`^${k}=([\\d.]+)$`, "m")); return m ? +m[1] : null; };
  return {
    W: tags[256], H: tags[257], bits: tags[258] || 1, spp: tags[277] || 1, little, offset: tags[273], compression: tags[259] || 1,
    um: tags[282] ? 1 / tags[282] : null,
    images: ij ? field("images") || 1 : null, channels: field("channels"), slices: field("slices"), frames: field("frames"), spacing: field("spacing"),
  };
}

// a JPEG data URL of the stack, at most SIDE pixels a side; null when its planes are not stored as ImageJ stores
// them, uncompressed one after another
export function stackPicture(buf, s, SIDE = 96) {
  const C = s.channels || 1, Z = s.slices || 1, by = s.bits / 8;
  if (Z < 2 || s.compression !== 1 || s.spp !== 1 || ![1, 2].includes(by) || !s.offset) return null;
  const plane = s.W * s.H * by;
  if (s.offset + C * Z * plane > buf.byteLength) return null;
  const v = new DataView(buf, s.offset);
  const px = by === 1 ? (o) => v.getUint8(o) : (o) => v.getUint16(o, s.little);
  // each plane sampled down to n × m, keeping each block's brightest pixel so thin bright structures stay
  const step = Math.ceil(Math.max(s.W, s.H) / SIDE), n = Math.ceil(s.W / step), m = Math.ceil(s.H / step);
  const vol = Array.from({ length: C }, () => new Float32Array(Z * n * m));
  for (let c = 0; c < C; c++) for (let z = 0; z < Z; z++) {
    const at = (z * C + c) * plane, out = vol[c], base = z * n * m;
    for (let y = 0; y < s.H; y++) for (let x = 0, row = at + y * s.W * by, j = base + ((y / step) | 0) * n; x < s.W; x++) {
      const q = px(row + x * by), k = j + ((x / step) | 0);
      if (q > out[k]) out[k] = q;
    }
  }
  // depth in sampled pixels: the slice spacing over the pixel size when the file gives both, else one pixel a slice
  const zs = s.spacing && s.um ? s.spacing / s.um : 1;
  return drawVolume({ vol, Z, n, m, depth: (Z * zs) / step }, TURN, SIDE).toDataURL("image/jpeg", 0.85);
}

// the turn a still picture of a stack is drawn at, in radians about the vertical axis
export const TURN = (30 * Math.PI) / 180;

// a canvas, at most SIDE pixels a side, of a volume: per channel, Z planes of n × m (vol[c], plane-major), its
// depth in the planes' pixels, and optionally each channel's colour as [r, g, b] of 0 or 1. Turned by `turn` about the vertical axis and tilted a little, each channel drawn
// brightest-first along each line of sight in its own colour, with the volume's edges faint. A thin volume is
// drawn at least a quarter as deep as it is wide, so its depth still shows; the canvas is the same size at every
// turn.
export function drawVolume({ vol, Z, n, m, depth, colours }, turn, SIDE = 96) {
  const C = vol.length, D = Math.max(2, Math.round(Math.max(depth, n / 4)));
  const b = (20 * Math.PI) / 180, ca = Math.cos(turn), sa = Math.sin(turn), cb = Math.cos(b), sb = Math.sin(b);
  const at = (x, y, d) => { const x1 = x * ca + d * sa, z1 = -x * sa + d * ca; return [x1, y * cb - z1 * sb]; };
  // bounds that hold at every turn: the footprint's diagonal across, and the tilt's reach down
  const R = Math.hypot(n, D) / 2, W = 2 * R, H = m * cb + 2 * R * sb, x0 = -R, y0 = -(m / 2) * cb - R * sb;
  const k = SIDE / Math.max(W, H), OW = Math.max(1, Math.ceil(W * k)), OH = Math.max(1, Math.ceil(H * k));
  const COLOURS = colours || (C === 1 ? [[1, 1, 1]] : C === 2 ? [[0, 1, 0], [1, 0, 1]] : [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 1, 1], [1, 0, 1], [1, 1, 0]]);
  const img = new Float32Array(OW * OH * 3);
  for (let c = 0; c < C; c++) {
    const src = vol[c], sorted = Float32Array.from(src).sort();
    const lo = sorted[Math.floor(0.5 * (sorted.length - 1))], hi = Math.max(lo + 1, sorted[Math.floor(0.998 * (sorted.length - 1))]);
    const flat = new Float32Array(OW * OH), col = COLOURS[c % COLOURS.length];
    for (let d = 0; d < D; d++) {
      const z = Math.min(Z - 1, Math.floor((d * Z) / D)), base = z * n * m;
      for (let y = 0; y < m; y++) for (let x = 0; x < n; x++) {
        const q = (src[base + y * n + x] - lo) / (hi - lo);
        if (q <= 0) continue;
        const [px1, py1] = at(x - n / 2, y - m / 2, d - D / 2), i = Math.min(OH - 1, ((py1 - y0) * k) | 0) * OW + Math.min(OW - 1, ((px1 - x0) * k) | 0);
        if (q > flat[i]) flat[i] = q;
      }
    }
    for (let i = 0; i < flat.length; i++) for (let j = 0; j < 3; j++) img[3 * i + j] += Math.min(1, flat[i]) * col[j];
  }
  const cv = document.createElement("canvas"); cv.width = OW; cv.height = OH;
  const g = cv.getContext("2d"), data = g.createImageData(OW, OH);
  for (let i = 0; i < OW * OH; i++) { for (let j = 0; j < 3; j++) data.data[4 * i + j] = Math.min(255, 255 * img[3 * i + j]); data.data[4 * i + 3] = 255; }
  g.putImageData(data, 0, 0);
  g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1; g.beginPath();
  const p = (x, y, d) => { const [u, w] = at(x - n / 2, y - m / 2, d - D / 2); return [(u - x0) * k, (w - y0) * k]; };
  for (const [e1, e2] of [[[0, 0, 0], [n, 0, 0]], [[0, m, 0], [n, m, 0]], [[0, 0, D], [n, 0, D]], [[0, m, D], [n, m, D]], [[0, 0, 0], [0, m, 0]], [[n, 0, 0], [n, m, 0]],
    [[0, 0, D], [0, m, D]], [[n, 0, D], [n, m, D]], [[0, 0, 0], [0, 0, D]], [[n, 0, 0], [n, 0, D]], [[0, m, 0], [0, m, D]], [[n, m, 0], [n, m, D]]]) {
    g.moveTo(...p(...e1)); g.lineTo(...p(...e2));
  }
  g.stroke();
  return cv;
}

// what a row in the Drive dialog says the file holds: "3D · 8 slices", "3D · 30 slices · 2 channels",
// "2D · 3 channels", or "" when it cannot tell
export function holds(s) {
  if (!s || s.images == null) return "";
  const c = s.channels || (s.spp > 1 ? s.spp : 1), channels = `${c} channel${c === 1 ? "" : "s"}`;
  if ((s.slices || 1) > 1) return `3D · ${s.slices} slices` + (c > 1 ? ` · ${channels}` : "");
  return `2D · ${channels}`;
}
