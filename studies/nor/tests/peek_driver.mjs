// Runs web/peek.js outside a browser on each FILE: paints it pushed whole and pushed in CHUNK-byte pieces,
// all channels switched on, and writes both paintings' RGBA bytes back to back to FILE.peek.
// node tests/peek_driver.mjs CHUNK FILE...   prints one JSON line per file
import fs from "node:fs";
const [chunk, ...files] = process.argv.slice(2);
const window = {};
new Function("window", fs.readFileSync(new URL("../web/peek.js", import.meta.url), "utf8"))(window);
const canvas = () => {
  const c = { getContext: () => ({
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (im) => { c.img = im; },
  }) };
  return c;
};
for (const file of files) {
  const all = fs.readFileSync(file), buf = all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
  const paint = (step) => {
    const c = canvas(); let size = null, ok = true, sizedAt = null;
    const push = window.NorPeek.painter(c, () => [true, true, true], (W, H) => (size = [W, H]));
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
  console.log(JSON.stringify({ file, size: whole.size, ok: whole.ok, piecesOk: pieces.ok, sizedAt: pieces.sizedAt }));
}
