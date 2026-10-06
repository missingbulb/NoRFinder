// Paints the lab's images (uncompressed three-channel ImageJ TIFFs) while their bytes arrive, so the image
// shows before it has finished downloading and before Python has read it; Python's own drawing replaces it
// once the image is open. Channels get the roles Python gives them (naive_nor.load): Caspr is the channel
// ImageJ displays green, DAPI the other with the larger blobs, Nav the rest. Until both of the others are in
// far enough to tell them apart they show grey. Anything else is left alone: push() then returns false.
"use strict";
window.NorPeek = (() => {
  const TAGS = { 256: "W", 257: "H", 258: "bits", 259: "comp", 270: "desc", 273: "offsets", 277: "spp", 50838: "ijCounts", 50839: "ijData" };
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 7: 1, 16: 8 };
  const NAV = 0, CASPR = 1, DAPI = 2;
  const JUDGE = 1 / 3; // the share of rows of both other channels compared to tell DAPI from Nav

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

  // a painter for one download into canvas: push(buffer, got) with the bytes so far at the start of buffer;
  // shown() says which of red (Nav), green (Caspr) and blue (DAPI) are switched on; onSize(W, H) runs
  // once the image's size is known
  function painter(canvas, shown, onSize) {
    let L, img, ctx, dv;
    const rows = [0, 0, 0], planes = [], scale = [], role = [];
    function compose(y0, y1) {
      const on = shown(), d = img.data, W = L.W;
      for (let y = y0; y < y1; y++) for (let x = 0, i = y * W, j = 4 * i; x < W; x++, i++, j += 4) {
        let r = 0, g = 0, b = 0;
        for (let k = 0; k < 3; k++) {
          if (y >= rows[k]) continue;
          const v = planes[k][i];
          if (role[k] == null) { const w = v * 0.8; r = Math.max(r, w); g = Math.max(g, w); b = Math.max(b, w); }
          else if (role[k] === NAV && on[0]) r = v;
          else if (role[k] === CASPR && on[1]) g = v;
          else if (role[k] === DAPI && on[2]) b = v;
        }
        d[j] = r; d[j + 1] = g; d[j + 2] = b;
      }
      ctx.putImageData(img, 0, 0, 0, y0, W, y1 - y0);
    }
    const px = (o) => (L.bpp === 2 ? dv.getUint16(o, L.le) : dv.getUint8(o));
    const raw = (k, n) => { const out = new Float32Array(L.W * n); for (let i = 0; i < out.length; i++) out[i] = px(L.starts[k] + i * L.bpp); return out; };
    function judge() {
      const others = [0, 1, 2].filter((k) => k !== L.caspr), n = Math.ceil(L.H * JUDGE);
      if (others.some((k) => rows[k] < n)) return false;
      const [a, b] = others.map((k) => blobArea(raw(k, n), L.W, n));
      role[others[0]] = a >= b ? DAPI : NAV; role[others[1]] = a >= b ? NAV : DAPI;
      return true;
    }
    function push(buf, got) {
      if (L === null) return false;
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
        // brightness as Python draws it (naive_nor.to8), judged from the first rows however many more have arrived
        if (!scale[k]) {
          const n = Math.min(H, 64);
          if (y < n) continue;
          const sample = [];
          for (let r = 0; r < n; r += 2) for (let x = 0; x < W; x += 3) sample.push(px(L.starts[k] + (r * W + x) * bpp));
          sample.sort((a, b) => a - b);
          const lo = sample[Math.floor(sample.length * 0.005)], hi = sample[Math.floor(sample.length * 0.998)];
          scale[k] = { lo, k: 255 / Math.max(1, hi - lo) };
        }
        const p = planes[k], { lo, k: s } = scale[k], o = L.starts[k];
        for (let i = rows[k] * W; i < y * W; i++) p[i] = Math.max(0, Math.min(255, (px(o + i * bpp) - lo) * s));
        y0 = Math.min(y0, rows[k]); y1 = Math.max(y1, y); rows[k] = y;
      }
      if (role.filter((r) => r != null).length < 3 && judge()) { y0 = 0; y1 = H; }
      if (y1 > y0) compose(y0, y1);
      return true;
    }
    push.redraw = () => L && compose(0, L.H);
    return push;
  }

  // a small painting of the whole image from a few of its rows, without downloading the rest:
  // read(start, end) resolves to those bytes (end inclusive); resolves to {W, H, data} (RGBA, H = rows,
  // channels in the colours of their roles, all on), or null for a file not one to paint
  async function thumb(read, rows) {
    let L;
    for (let n = 8192; ; n *= 4) {
      const head = await read(0, n - 1);
      L = layout(new DataView(head), head.byteLength);
      if (L !== undefined || head.byteLength < n || n >= 1 << 20) break;
    }
    if (!L) return null;
    const H = Math.min(rows, L.H), W = Math.max(1, Math.round((H * L.W) / L.H));
    const line = L.W * L.bpp, raw = [0, 1, 2].map(() => new Float32Array(H * L.W)), jobs = [];
    for (let k = 0; k < 3; k++) for (let j = 0; j < H; j++) jobs.push([k, j]);
    const take = async ([k, j]) => {
      const y = Math.floor(((j + 0.5) * L.H) / H), o = L.starts[k] + y * line;
      const dv = new DataView(await read(o, o + line - 1)), v = raw[k];
      for (let i = 0, at = j * L.W; i < L.W; i++) v[at + i] = L.bpp === 2 ? dv.getUint16(2 * i, L.le) : dv.getUint8(i);
    };
    for (let at = 0; at < jobs.length; ) await Promise.all(jobs.slice(at, (at += THUMB_READS)).map(take));
    const role = [];
    role[L.caspr] = CASPR;
    const others = [0, 1, 2].filter((k) => k !== L.caspr), [a, b] = others.map((k) => floor(raw[k]));
    role[others[0]] = a <= b ? DAPI : NAV; role[others[1]] = a <= b ? NAV : DAPI;
    // brightness as the painter draws it, then each thumbnail pixel the mean of the pixels it covers
    const cover = new Float32Array(W), sums = [];
    for (let x = 0; x < L.W; x++) cover[Math.min(W - 1, Math.floor((x * W) / L.W))] ++;
    for (let k = 0; k < 3; k++) {
      const v = raw[k], s = Float32Array.from(v).sort(), lo = s[Math.floor(s.length * 0.005)];
      const f = 255 / Math.max(1, s[Math.floor(s.length * 0.998)] - lo), sum = new Float32Array(W * H);
      for (let i = 0; i < v.length; i++) {
        const x = i % L.W, j = Math.floor(i / L.W);
        sum[j * W + Math.min(W - 1, Math.floor((x * W) / L.W))] += Math.max(0, Math.min(255, (v[i] - lo) * f));
      }
      for (let i = 0; i < sum.length; i++) sum[i] /= cover[i % W];
      sums[role[k] === NAV ? 0 : role[k] === CASPR ? 1 : 2] = sum;
    }
    // averaging dims the sparse bright marks, so the thumbnail is brightened again, alike in every colour
    const top = Math.max(...sums.map((u) => Float32Array.from(u).sort()[Math.floor(0.995 * (u.length - 1))]));
    const g = Math.min(THUMB_GAIN, 255 / Math.max(1, top)), data = new Uint8ClampedArray(W * H * 4);
    for (let c = 0; c < 3; c++) for (let i = 0; i < W * H; i++) data[4 * i + c] = sums[c][i] * g;
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    return { W, H, data };
  }
  const THUMB_READS = 16; // reads asked for at once
  const THUMB_GAIN = 2;
  // where a channel's median sits between its 1st and 99th percentiles. A few rows are too few for
  // blobArea; DAPI's nuclei leave most of the field near black while Nav glows all over, so DAPI's sits
  // lower (by half again or more on every lab image). Assumption: fails on a field mostly filled by nuclei.
  function floor(p) {
    const s = Float32Array.from(p).sort(), q = (f) => s[Math.floor(f * (s.length - 1))];
    return (q(0.5) - q(0.01)) / Math.max(1e-9, q(0.99) - q(0.01));
  }

  return { painter, blobArea, thumb };
})();
