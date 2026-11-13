// Opens each image a job names with web/image_open.js, under Node, as the page opens it: prints one JSON line per job
// with what it says of the image, and writes its flattened planes and its slices to the job's out paths. A job with
// rgba beside its file is an image the browser decoded, its W × H RGBA pixels (Node has no decoder of its own),
// whose details are read from the file's own bytes as the page reads them.
//   node web-tests/image_open_driver.mjs JOBS.json     JOBS: [{file, rgba?, W?, H?, view, order?, planes, volume}]
// order: a study's module whose order(im) puts the channels in the study's own order.
import fs from "node:fs";
import "./cdn_from_node_modules.mjs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { openImage, fromPixels, greyFile, inOrder, withDetails } = await import(pathToFileURL(path.join(here, "..", "web", "image_open.js")).href);
for (const job of JSON.parse(fs.readFileSync(process.argv[2], "utf8"))) {
  try {
    const rule = job.order && (await import(pathToFileURL(path.resolve(job.order)).href)).order;
    const bytes = new Uint8Array(fs.readFileSync(job.file)), view = job.view || {};
    const im = inOrder(job.rgba ? withDetails(bytes, fromPixels(job.W, job.H, new Uint8Array(fs.readFileSync(job.rgba)), view, greyFile(bytes)), view)
      : await openImage(bytes, view), rule);
    fs.writeFileSync(job.planes, im.planes);
    if (im.volume) fs.writeFileSync(job.volume, im.volume);
    const { W, H, Z, um, umY, spacing, info, more, channels } = im;
    console.log(JSON.stringify({ W, H, Z, um, umY, spacing, info, more, channels, volume: !!im.volume }));
  } catch (e) { console.log(JSON.stringify({ error: String(e.message || e) })); }
}
