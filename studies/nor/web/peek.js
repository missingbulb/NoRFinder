// Paints the lab's images (uncompressed three-channel ImageJ TIFFs) while their bytes arrive, so the image
// shows before it has finished downloading and before Python has read it; Python's own drawing replaces it
// once the image is open. While the channels arrive the image builds in grey from those already in; once
// every byte is in, its colours wipe down over that grey (fade up from black when it came in at once), each channel in the colour of the role Python gives it (naive_nor.load): Caspr is the channel
// ImageJ displays green, DAPI the other with the larger blobs, Nav the rest. No pixel ever shows a hue its
// final colour lacks: each is grey, black or a darker shade of that colour. Anything else is left alone: push() then returns false.
"use strict";
window.NorPeek = (() => {
  const TAGS = { 256: "W", 257: "H", 258: "bits", 259: "comp", 270: "desc", 273: "offsets", 277: "spp", 50838: "ijCounts", 50839: "ijData" };
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 7: 1, 16: 8 };
  const NAV = 0, CASPR = 1, DAPI = 2;
  const JUDGE = 1 / 3; // the share of rows of both other channels compared to tell DAPI from Nav
  const GREY = 0.8; // the grey's brightness against the colours it blooms into
  const BLOOM_MS = 450;

  // the first page's tags, undefined while more bytes are needed, null when the file is not one to paint.
  // ImageJ writes its channels' pixels back to back after the first page and the other pages' tags at the
  // end of the file, so the first page tells where every channel is.
  function layout(dv, got) {
    if (got < 8) return undefined;
    const le = dv.getUint16(0) === 0x4949, u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
    if (u16(2) !== 42) return null;
    const off = u32(4);
    if (off + 2 > got) return undefined;
    const n = u16(off);
    if (off + 2 + 12 * n > got) return undefined;
    const t = {};
    for (let e = 0; e < n; e++) {
      const at = off + 2 + 12 * e, name = TAGS[u16(at)];
      if (!name) continue;
      const type = u16(at + 2), count = u32(at + 4), size = SIZE[type] || 1;
      const where = count * size <= 4 ? at + 8 : u32(at + 8);
      if (where + count * size > got) return undefined;
      const read = (k) => (type === 3 ? u16(where + 2 * k) : type === 4 ? u32(where + 4 * k) : dv.getUint8(where + k));
      t[name] = name === "ijData" ? { where, le } : Array.from({ length: count }, (_, k) => read(k));
    }
    const W = t.W?.[0], H = t.H?.[0], bits = t.bits?.[0];
    const desc = t.desc ? String.fromCharCode(...t.desc) : "";
    if (!/^ImageJ=/.test(desc) || !/\bimages=3\b/.test(desc) || !W || !H || !t.offsets || ![8, 16].includes(bits)) return null;
    if ((t.comp?.[0] ?? 1) !== 1 || (t.spp?.[0] ?? 1) !== 1) return null;
    const caspr = greenPage(dv, t);
    if (caspr == null) return null;
    const bpp = bits / 8;
    return { le, W, H, bpp, starts: [0, 1, 2].map((k) => t.offsets[0] + k * W * H * bpp), caspr };
  }

  // the channel ImageJ displays green: its LUT ends brightest in green
  function greenPage(dv, t) {
    if (!t.ijCounts || !t.ijData) return null;
    const at = t.ijData.where, tag = (o) => String.fromCharCode(...[0, 1, 2, 3].map((k) => dv.getUint8(o + k)));
    if (tag(at) !== "IJIJ" && tag(at) !== "JIJI") return null;
    const le = tag(at) === "JIJI", sizes = t.ijCounts, tops = [];
    let pos = at + sizes[0], block = 1;
    for (let h = 4; h + 8 <= sizes[0]; h += 8) {
      const type = tag(at + h), count = dv.getUint32(at + h + 4, le);
      for (let c = 0; c < count; c++, block++) {
        if (type === "tuls" || type === "luts") tops.push([0, 1, 2].map((k) => dv.getUint8(pos + 256 * k + 255)));
        pos += sizes[block];
      }
    }
    const green = tops.map((v) => v.indexOf(Math.max(...v)) === 1);
    return tops.length === 3 && green.filter(Boolean).length === 1 ? green.indexOf(true) : null;
  }

  // naive_nor.blob_area over the first rows of a channel: the mean size of the pieces its brightest 3% make
  // after a sigma-2 blur, large for nuclei
  function blobArea(v, W, H) {
    const R = 6, k = Array.from({ length: 2 * R + 1 }, (_, i) => Math.exp(-((i - R) ** 2) / 8));
    const s = k.reduce((a, b) => a + b), mirror = (i, n) => (i < 0 ? -i - 1 : i >= n ? 2 * n - i - 1 : i);
    const a = new Float32Array(W * H), b = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let t = 0; for (let i = -R; i <= R; i++) t += k[i + R] * v[y * W + mirror(x + i, W)]; a[y * W + x] = t / s;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let t = 0; for (let i = -R; i <= R; i++) t += k[i + R] * a[mirror(y + i, H) * W + x]; b[y * W + x] = t / s;
    }
    const sorted = Float32Array.from(b).sort(), q = 0.97 * (sorted.length - 1), lo = Math.floor(q);
    const thr = sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (q - lo);
    const seen = new Uint8Array(W * H), stack = [];
    let on = 0, pieces = 0;
    for (let p = 0; p < W * H; p++) {
      if (b[p] <= thr || seen[p]) continue;
      pieces++; seen[p] = 1; stack.push(p);
      while (stack.length) {
        const c = stack.pop(), x = c % W; on++;
        for (const d of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, c - W, c + W])
          if (d >= 0 && d < W * H && !seen[d] && b[d] > thr) { seen[d] = 1; stack.push(d); }
      }
    }
    return on / Math.max(pieces, 1);
  }

  // brightness as Python draws it (naive_nor.to8): a channel's 0.5% and 99.8% quantiles, from a sample
  function stretch(sample) {
    sample.sort((a, b) => a - b);
    const at = (q) => { const p = q * (sample.length - 1), i = Math.floor(p); return sample[i] + ((sample[Math.min(i + 1, sample.length - 1)] - sample[i]) * (p - i)); };
    const lo = at(0.005), hi = at(0.998);
    return { lo, k: 255 / Math.max(1, hi - lo) };
  }

  // a painter for one download into canvas: push(buffer, got) with the bytes so far at the start of buffer;
  // shown() says which of red (Nav), green (Caspr) and blue (DAPI) are switched on; onSize(W, H) runs
  // once the image's size is known. push.stop() ends a bloom still running, for when Python's drawing
  // takes the canvas.
  function painter(canvas, shown, onSize) {
    let L, img, ctx, dv, done = false, grey = false, bloom = 0;
    const rows = [0, 0, 0], planes = [], scale = [], role = [];
    const frame = globalThis.requestAnimationFrame, cancel = globalThis.cancelAnimationFrame;
    const now = () => globalThis.performance?.now() ?? Date.now();
    // the pixel at i in grey from the channels in at row y, or in its colours once all are
    function pixel(i, y, out) {
      const on = shown();
      if (!done) {
        let v = 0;
        for (let k = 0; k < 3; k++) if (y < rows[k] && (role[k] !== CASPR || on[1])) v = Math.max(v, planes[k][i]);
        out[0] = out[1] = out[2] = v * GREY;
        return;
      }
      out[0] = out[1] = out[2] = 0;
      for (let k = 0; k < 3; k++) if (on[role[k]]) out[role[k]] = planes[k][i];
    }
    // rows y0 to y1, each pixel at fade times its brightness
    function compose(y0, y1, fade = 1) {
      const d = img.data, W = L.W, px = [0, 0, 0];
      for (let y = y0; y < y1; y++) for (let x = 0, i = y * W, j = 4 * i; x < W; x++, i++, j += 4) {
        pixel(i, y, px);
        d[j] = px[0] * fade; d[j + 1] = px[1] * fade; d[j + 2] = px[2] * fade;
      }
      ctx.putImageData(img, 0, 0, 0, y0, W, y1 - y0);
      if (!done && y1 > y0) grey = true;
    }
    // every byte in: the colours take the whole image over BLOOM_MS, wiping down over the grey shown, or fading
    // up from black where none was; at once where there is no screen to animate on
    function finish() {
      done = true;
      const { W, H, bpp } = L, n = W * H, step = Math.max(1, Math.floor(n / 400000));
      for (let k = 0; k < 3; k++) {
        const sample = [];
        for (let i = 0; i < n; i += step) sample.push(px(L.starts[k] + i * bpp));
        const { lo, k: s } = stretch(sample), p = planes[k], o = L.starts[k];
        for (let i = 0; i < n; i++) p[i] = Math.max(0, Math.min(255, (px(o + i * bpp) - lo) * s));
      }
      if (!frame) return compose(0, H);
      const t0 = now();
      let wiped = 0;
      const step1 = () => {
        const t = Math.min(1, (now() - t0) / BLOOM_MS), e = t * t * (3 - 2 * t);
        if (!grey) compose(0, H, e);
        else { const y = Math.round(e * H); compose(wiped, y); wiped = y; }
        bloom = t < 1 ? frame(step1) : 0;
      };
      step1();
    }
    const px = (o) => (L.bpp === 2 ? dv.getUint16(o, L.le) : dv.getUint8(o));
    const raw = (k, n) => { const out = new Float32Array(L.W * n); for (let i = 0; i < out.length; i++) out[i] = px(L.starts[k] + i * L.bpp); return out; };
    function judge() {
      const others = [0, 1, 2].filter((k) => k !== L.caspr), n = Math.ceil(L.H * JUDGE);
      const [a, b] = others.map((k) => blobArea(raw(k, n), L.W, n));
      role[others[0]] = a >= b ? DAPI : NAV; role[others[1]] = a >= b ? NAV : DAPI;
    }
    function push(buf, got) {
      if (L === null) return false;
      if (done) return true;
      dv = new DataView(buf);
      if (!L) {
        L = layout(dv, got);
        if (L === undefined) return true;
        if (!L) return false;
        role[L.caspr] = CASPR;
        canvas.width = L.W; canvas.height = L.H; ctx = canvas.getContext("2d");
        img = ctx.createImageData(L.W, L.H);
        for (let j = 3; j < img.data.length; j += 4) img.data[j] = 255;
        ctx.putImageData(img, 0, 0);
        for (let k = 0; k < 3; k++) planes.push(new Uint8Array(L.W * L.H));
        onSize(L.W, L.H);
      }
      const { W, H, bpp } = L;
      let y0 = H, y1 = 0;
      for (let k = 0; k < 3; k++) {
        const y = Math.max(0, Math.min(H, Math.floor((got - L.starts[k]) / (W * bpp))));
        if (y <= rows[k]) continue;
        // the grey's brightness, judged from the first rows however many more have arrived
        if (!scale[k]) {
          const n = Math.min(H, 64);
          if (y < n) continue;
          const sample = [];
          for (let r = 0; r < n; r += 2) for (let x = 0; x < W; x += 3) sample.push(px(L.starts[k] + (r * W + x) * bpp));
          scale[k] = stretch(sample);
        }
        const p = planes[k], { lo, k: s } = scale[k], o = L.starts[k];
        for (let i = rows[k] * W; i < y * W; i++) p[i] = Math.max(0, Math.min(255, (px(o + i * bpp) - lo) * s));
        y0 = Math.min(y0, rows[k]); y1 = Math.max(y1, y); rows[k] = y;
      }
      if (rows.every((r) => r === H)) { judge(); finish(); return true; }
      if (y1 > y0) compose(y0, y1);
      return true;
    }
    push.stop = () => { if (bloom) cancel(bloom); bloom = 0; };
    push.redraw = () => { if (L) { push.stop(); compose(0, L.H); } };
    return push;
  }

  return { painter, blobArea };
})();
