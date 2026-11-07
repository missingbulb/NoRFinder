// Opens each image a job names with web/image_open.js, under Node, as the page opens it: prints one JSON line per job
// with what it says of the image, and writes its flattened planes and its slices to the job's out paths.
//   node web-tests/image_open_driver.mjs JOBS.json     JOBS: [{file, view, planes, volume}]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { openImage } = await import(pathToFileURL(path.join(here, "..", "web", "image_open.js")).href);
for (const job of JSON.parse(fs.readFileSync(process.argv[2], "utf8"))) {
  try {
    const im = await openImage(fs.readFileSync(job.file), job.view || {});
    fs.writeFileSync(job.planes, im.planes);
    if (im.volume) fs.writeFileSync(job.volume, im.volume);
    const { W, H, Z, um, umY, spacing, info, channels } = im;
    console.log(JSON.stringify({ W, H, Z, um, umY, spacing, info, channels, volume: !!im.volume }));
  } catch (e) { console.log(JSON.stringify({ error: String(e.message || e) })); }
}
