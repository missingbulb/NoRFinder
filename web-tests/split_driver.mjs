// Runs the split (web/split.js) under Node on the jobs in JOBS.json, each {src, out, grid: n | {xs, ys}, left:
// ["row,col"], channels, slices, pattern, look, source}, writing every part into the job's out folder and the
// ZIP of them all as parts.zip there, and prints per job [{name, record}] as JSON, or {error} when the split
// refuses. Exits 2 when it cannot run.
//   node web-tests/split_driver.mjs JOBS.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { readTiff, splitImage, gridParts, evenCuts, zip } = await import(path.join(repo, "web", "split.js"));
const jobs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const results = [];
for (const j of jobs) {
  try {
    const src = readTiff(new Uint8Array(fs.readFileSync(j.src)));
    const xs = j.grid.xs || evenCuts(src.W, j.grid), ys = j.grid.ys || evenCuts(src.H, j.grid);
    const parts = gridParts(xs, ys, new Set(j.left || []));
    const files = await splitImage(src, { xs, ys, parts, channels: j.channels ?? [...Array(src.C).keys()], slices: j.slices, look: j.look, pattern: j.pattern, source: j.source });
    fs.mkdirSync(j.out, { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(j.out, f.name), f.bytes);
    fs.writeFileSync(path.join(j.out, "parts.zip"), new Uint8Array(await zip(files).arrayBuffer()));
    results.push({ shape: { W: src.W, H: src.H, C: src.C, Z: src.Z, T: src.T }, files: files.map(({ name, record }) => ({ name, record })) });
  } catch (e) {
    results.push({ error: String(e.message || e) });
  }
}
console.log(JSON.stringify(results));
