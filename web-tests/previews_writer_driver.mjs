// Makes a folder's rauntruth-previews.tiff with the page's writer (web/previews_writer.js) under Node: the images
// in IMAGES (its TIFFs, the only images given one) each read by the reader Data Management reads them with, the ones the OLD previews file already covers with the
// same SHA-256 kept from it as they were, written to OUT. With TIFFS, each image's preview is also written there as
// the TIFF Data Management hands a study's Python (NAME.preview.tif). Prints {kept, made} names as JSON.
//   node web-tests/previews_writer_driver.mjs IMAGES OUT [OLD|-] [TIFFS]
import fs from "node:fs";
import "./cdn_from_node_modules.mjs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { makePreview, buildPreviews } = await import(path.join(repo, "web", "previews_writer.js"));
const { readPreviews } = await import(path.join(repo, "web", "previews.js"));
const { previewTiff } = await import(path.join(repo, "web", "data_mode.js"));
const { readImage } = await import(path.join(repo, "web", "image_open.js"));
const { isTiff } = await import(path.join(repo, "web", "accepts.js"));
const [images, out, oldArg, tiffs] = process.argv.slice(2), old = oldArg === "-" ? null : oldArg;
const pv = old ? readPreviews(new Uint8Array(fs.readFileSync(old)).buffer) : null;
const kept = [], made = [];
for (const name of fs.readdirSync(images).sort()) {
  if (!isTiff(name) || name.startsWith("rauntruth-previews")) continue;
  const bytes = new Uint8Array(fs.readFileSync(path.join(images, name))), sha256 = createHash("sha256").update(bytes).digest("hex");
  const e = pv?.entry(name, sha256);
  if (e) { kept.push({ entry: e, pages: await pv.pages(e) }); continue; }
  const src = await readImage(bytes), spacing = src.ij?.spacing ? +src.ij.spacing : null;
  made.push({ name, sha256, ...(await makePreview(src, spacing)) });
}
const bytes = await buildPreviews(kept, made);
fs.writeFileSync(out, bytes);
if (tiffs) {
  const pv = readPreviews(bytes.buffer);
  for (const e of pv.index.images) fs.writeFileSync(path.join(tiffs, e.name.replace(/\.[^.]*$/, "") + ".preview.tif"), new Uint8Array(previewTiff(e, await pv.pages(e))));
}
console.log(JSON.stringify({ kept: kept.map((k) => k.entry.name), made: made.map((m) => m.name) }));
