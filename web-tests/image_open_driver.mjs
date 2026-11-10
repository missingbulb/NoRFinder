// Opens each image a job names with web/image_open.js, under Node, as the page opens it: prints one JSON line per job
// with what it says of the image, and writes its flattened planes and its slices to the job's out paths. A job with
// rgba beside its file is an image the browser decoded, its W × H RGBA pixels (Node has no decoder of its own).
//   node web-tests/image_open_driver.mjs JOBS.json     JOBS: [{file, rgba?, W?, H?, view, order?, planes, volume}]
// order: a study's module whose order(im) puts the channels in the study's own order. The decoders the page takes from
// jsDelivr are taken from web-tests/node_modules, where the full CI set installs them at the same versions.
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
register("data:text/javascript," + encodeURIComponent(`
const CDN = "https://cdn.jsdelivr.net/npm/", HERE = ${JSON.stringify(pathToFileURL(path.join(here, "node_modules")).href + "/")};
export async function resolve(spec, ctx, next) {
  return spec.startsWith(CDN) ? { url: HERE + spec.slice(CDN.length).replace(/@[^/]+/, ""), shortCircuit: true } : next(spec, ctx);
}`));
const { openImage, fromPixels, greyFile, inOrder } = await import(pathToFileURL(path.join(here, "..", "web", "image_open.js")).href);
for (const job of JSON.parse(fs.readFileSync(process.argv[2], "utf8"))) {
  try {
    const rule = job.order && (await import(pathToFileURL(path.resolve(job.order)).href)).order;
    const im = inOrder(job.rgba ? fromPixels(job.W, job.H, new Uint8Array(fs.readFileSync(job.rgba)), job.view || {}, greyFile(fs.readFileSync(job.file)))
      : await openImage(fs.readFileSync(job.file), job.view || {}), rule);
    fs.writeFileSync(job.planes, im.planes);
    if (im.volume) fs.writeFileSync(job.volume, im.volume);
    const { W, H, Z, um, umY, spacing, info, channels } = im;
    console.log(JSON.stringify({ W, H, Z, um, umY, spacing, info, channels, volume: !!im.volume }));
  } catch (e) { console.log(JSON.stringify({ error: String(e.message || e) })); }
}
