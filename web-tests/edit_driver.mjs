// Runs Edit Image's own functions (web/edit.js, and web/split.js as Save… calls it) under Node on the jobs in
// JOBS.json and prints one JSON result per job:
//   {op: "derive", planes: file of the page's 8-bit planes, W, H, Z, edit, out} -> writes the drawing's planes to out, {W, H, Z}
//   {op: "suggest", planes, W, H, Z} -> {signal, suggested}
//   {op: "mask", polygons, W, H, out} -> writes the mask to out, {share of the whole}
//   {op: "save", src: a TIFF, edit, polygons, pattern, out} -> writes each file into out, [{name, record}]
// An edit as JSON: {crop, xs, ys, left: ["r,c"], z, channels: [kept]}.
//   node web-tests/edit_driver.mjs JOBS.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { derive, suggestSlices, maskOf, maskShare } = await import(path.join(repo, "web", "edit.js"));
const { readTiff, gridParts, splitImage } = await import(path.join(repo, "web", "split.js"));
const edit = (j, W, H) => ({ ...j.edit, left: new Set(j.edit.left || []), channels: new Set(j.edit.channels), mask: j.polygons ? maskOf(j.polygons, W, H) : null });
const out = [];
for (const j of JSON.parse(fs.readFileSync(process.argv[2], "utf8"))) {
  if (j.op === "derive" || j.op === "suggest") {
    const im = { W: j.W, H: j.H, Z: j.Z, planes: new Uint8Array(fs.readFileSync(j.planes)) };
    if (j.op === "suggest") { out.push(suggestSlices(im)); continue; }
    const d = derive(im, edit(j, j.W, j.H));
    fs.writeFileSync(j.out, d.planes);
    out.push({ W: d.W, H: d.H, Z: d.Z });
  } else if (j.op === "mask") {
    const m = maskOf(j.polygons, j.W, j.H);
    fs.writeFileSync(j.out, m);
    out.push({ share: maskShare(m, { x0: 0, y0: 0, x1: j.W, y1: j.H }, j.W) });
  } else if (j.op === "save") {
    const src = readTiff(new Uint8Array(fs.readFileSync(j.src))), e = edit(j, src.W, src.H);
    const files = await splitImage(src, { xs: e.xs, ys: e.ys, parts: gridParts(e.xs, e.ys, e.left), channels: [...e.channels], slices: e.z,
      pattern: j.pattern, source: { name: path.basename(j.src), sha256: "ab".repeat(32) }, removed: j.polygons || [], mask: e.mask });
    fs.mkdirSync(j.out, { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(j.out, f.name), f.bytes);
    out.push(files.map(({ name, record }) => ({ name, record })));
  }
}
console.log(JSON.stringify(out));
