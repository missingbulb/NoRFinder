// Runs web/peek.js's thumbnail outside a browser on each FILE, reading it piece by piece as the page
// reads Drive, and writes the thumbnail's RGBA bytes to FILE.thumb.
// node tests/peek_thumb_driver.mjs ROWS FILE...   prints one JSON line per file
import fs from "node:fs";
const [rows, ...files] = process.argv.slice(2);
const window = {};
new Function("window", fs.readFileSync(new URL("../web/peek.js", import.meta.url), "utf8"))(window);
for (const file of files) {
  const all = fs.readFileSync(file);
  let read = 0;
  const t = await window.NorPeek.thumb(async (s, e) => {
    const b = all.subarray(s, e + 1); read += b.length; return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
  }, +rows);
  if (t) fs.writeFileSync(file + ".thumb", Buffer.from(t.data.buffer));
  console.log(JSON.stringify({ file, size: t && [t.W, t.H], read, total: all.length }));
}
