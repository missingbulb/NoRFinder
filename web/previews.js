// A Drive folder's rauntruth-previews.tiff (requirement 1.42): its index, the first page's description, and its
// pages, each deflate-compressed with the horizontal predictor; a flat image's preview is a colour picture of
// its page, a stack's a mini-volume drawn by drawVolume.
"use strict";
import { drawVolume, TURN } from "./stack.js";

export const PREVIEWS = "rauntruth-previews.tiff";

// {index, entry(name, sha), picture(entry), volume(entry)} from the file's bytes; null when they are not one
export function readPreviews(buf) {
  const v = new DataView(buf), little = v.getUint16(0) === 0x4949;
  if ((!little && v.getUint16(0) !== 0x4d4d) || v.getUint16(2, little) !== 42) return null;
  const size = { 1: 1, 2: 1, 3: 2, 4: 4, 16: 8 };
  const values = (e) => {
    const type = v.getUint16(e + 2, little), count = v.getUint32(e + 4, little), one = size[type] || 4;
    const at = count * one <= 4 ? e + 8 : v.getUint32(e + 8, little);
    if (type === 2) return new TextDecoder().decode(new Uint8Array(buf, at, Math.max(0, count - 1)));
    return Array.from({ length: count }, (_, i) => (one === 1 ? v.getUint8(at + i) : one === 2 ? v.getUint16(at + 2 * i, little) : v.getUint32(at + 4 * i, little)));
  };
  const pages = [];
  for (let ifd = v.getUint32(4, little); ifd; ) {
    const t = {}, n = v.getUint16(ifd, little);
    for (let i = 0; i < n; i++) { const e = ifd + 2 + 12 * i; t[v.getUint16(e, little)] = values(e); }
    pages.push(t);
    ifd = v.getUint32(ifd + 2 + 12 * n, little);
  }
  let index;
  try { index = JSON.parse(pages[0]?.[270]); } catch { return null; }
  if (!index || !Array.isArray(index.images)) return null;

  // a page's pixels, samples interleaved
  const pixels = async (p) => {
    const t = pages[p], W = t[256][0], H = t[257][0], spp = (t[277] || [1])[0];
    const parts = t[273].map((o, i) => new Uint8Array(buf, o, t[279][i]));
    const strips = await Promise.all(parts.map((s) => ([8, 32946].includes(t[259]?.[0])
      ? new Response(new Blob([s]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer().then((b) => new Uint8Array(b))
      : s)));
    const out = new Uint8Array(W * H * spp);
    let at = 0;
    for (const s of strips) { out.set(s.subarray(0, out.length - at), at); at += s.length; }
    if ((t[317] || [1])[0] === 2) for (let y = 0; y < H; y++) for (let i = y * W * spp + spp; i < (y + 1) * W * spp; i++) out[i] = (out[i] + out[i - spp]) & 255;
    return { W, H, spp, data: out };
  };
  return {
    index,
    // the image's entry when the file was made from the bytes Drive has for it now
    entry: (name, sha) => index.images.find((e) => e.name === name && sha && e.sha256 === sha) || null,
    // a data URL of a flat image's picture, or of a stack's still
    async picture(e) {
      if (e.kind === "stack") return drawVolume(await this.volume(e), TURN).toDataURL("image/jpeg", 0.85);
      const { W, H, spp, data } = await pixels(e.page), cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const g = cv.getContext("2d"), im = g.createImageData(W, H);
      for (let i = 0; i < W * H; i++) { for (let j = 0; j < 3; j++) im.data[4 * i + j] = data[i * spp + (spp === 3 ? j : 0)]; im.data[4 * i + 3] = 255; }
      g.putImageData(im, 0, 0);
      return cv.toDataURL("image/jpeg", 0.85);
    },
    // a stack's mini-volume, as drawVolume takes it: its depth one pixel a slice
    async volume(e) {
      const [Z, C] = e.volume, planes = await Promise.all(Array.from({ length: e.pages }, (_, i) => pixels(e.page + i)));
      const { W, H } = planes[0], vol = Array.from({ length: C }, () => new Float32Array(Z * W * H));
      planes.forEach((p, i) => vol[i % C].set(p.data, Math.floor(i / C) * W * H));
      return { vol, Z, n: W, m: H, depth: Z, colours: e.colours };
    },
  };
}
