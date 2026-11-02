// Makes a folder's rauntruth-previews.tiff with the page's writer (web/previews_writer.js) under Node: the images
// in IMAGES (TIFFs) each read with web/split.js's reader, the ones the OLD previews file already covers with the
// same SHA-256 kept from it as they were, written to OUT. Prints {kept, made} names as JSON.
//   node web-tests/previews_writer_driver.mjs IMAGES OUT [OLD]
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { readTiff } = await import(path.join(repo, "web", "split.js"));
const { makePreview, buildPreviews } = await import(path.join(repo, "web", "previews_writer.js"));
const { readPreviews } = await import(path.join(repo, "web", "previews.js"));
const [images, out, old] = process.argv.slice(2);
const pv = old ? readPreviews(new Uint8Array(fs.readFileSync(old)).buffer) : null;
const kept = [], made = [];
for (const name of fs.readdirSync(images).sort()) {
  if (!/\.tiff?$/i.test(name) || name.startsWith("rauntruth-previews")) continue;
  const bytes = new Uint8Array(fs.readFileSync(path.join(images, name))), sha256 = createHash("sha256").update(bytes).digest("hex");
  const e = pv?.entry(name, sha256);
  if (e) { kept.push({ entry: e, pages: await pv.pages(e) }); continue; }
  const src = readTiff(bytes), spacing = src.ij?.spacing ? +src.ij.spacing : null;
  made.push({ name, sha256, ...(await makePreview(src, spacing)) });
}
fs.writeFileSync(out, await buildPreviews(kept, made));
console.log(JSON.stringify({ kept: kept.map((k) => k.entry.name), made: made.map((m) => m.name) }));
