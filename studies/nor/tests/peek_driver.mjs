// Runs web/peek.js outside a browser on each FILE: paints it pushed whole and pushed in CHUNK-byte pieces,
// all channels switched on, and writes both paintings' RGBA bytes back to back to FILE.peek. With FRAMES,
// it paints each file twice more on a stand-in animation clock, pushed whole and pushed in CHUNK-byte pieces,
// and writes every frame it showed to FILE.frames, every FRAMES-th pixel's RGB, frame after frame.
// node tests/peek_driver.mjs CHUNK [--frames FRAMES] FILE...   prints one JSON line per file
import fs from "node:fs";
let [chunk, ...files] = process.argv.slice(2), every = 0;
if (files[0] === "--frames") { every = +files[1]; files = files.slice(2); }
const load = () => {
  const window = {};
  new Function("window", fs.readFileSync(new URL("../web/peek.js", import.meta.url), "utf8"))(window);
  return window.NorPeek;
};
const NorPeek = load();
const canvas = (seen) => {
  const c = { getContext: () => ({
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (im) => { c.img = im; seen?.(); },
  }) };
  return c;
};
for (const file of files) {
  const all = fs.readFileSync(file), buf = all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
  const paint = (step, Peek = NorPeek, seen) => {
    const c = canvas(seen && (() => seen(c.img))); let size = null, ok = true, sizedAt = null;
    const push = Peek.painter(c, () => [true, true, true], (W, H) => (size = [W, H]));
    const grow = new ArrayBuffer(buf.byteLength);
    for (let got = 0; got < buf.byteLength && ok; ) {
      const n = Math.min(step, buf.byteLength - got);
      new Uint8Array(grow, got).set(new Uint8Array(buf, got, n)); got += n;
      ok = push(grow, got);
      if (size && sizedAt == null) sizedAt = got;
    }
    return { size, ok, sizedAt, data: c.img && c.img.data };
  };
  const whole = paint(buf.byteLength), pieces = paint(+chunk);
  if (whole.data) fs.writeFileSync(file + ".peek", Buffer.concat([Buffer.from(whole.data.buffer), Buffer.from(pieces.data.buffer)]));
  let frames = 0;
  if (every && whole.data) {
    let clock = 0, queued = null;
    globalThis.performance = { now: () => clock };
    globalThis.requestAnimationFrame = (f) => { queued = f; return 1; };
    globalThis.cancelAnimationFrame = () => { queued = null; };
    const Peek = load(), out = fs.openSync(file + ".frames", "w");
    const seen = (im) => {
      const d = im.data, n = Math.ceil(d.length / 4 / every), rgb = Buffer.alloc(3 * n);
      for (let p = 0, o = 0; p < d.length / 4; p += every, o += 3) { rgb[o] = d[4 * p]; rgb[o + 1] = d[4 * p + 1]; rgb[o + 2] = d[4 * p + 2]; }
      fs.writeSync(out, rgb); frames++;
    };
    for (const step of [buf.byteLength, +chunk]) {
      paint(step, Peek, seen);
      while (queued) { clock += 16; const f = queued; queued = null; f(); }
    }
    fs.closeSync(out);
    delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
  }
  console.log(JSON.stringify({ file, size: whole.size, ok: whole.ok, piecesOk: pieces.ok, sizedAt: pieces.sizedAt, frames }));
}
