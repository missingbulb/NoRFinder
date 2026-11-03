// Drives web/bridge.js in Pyodide under Node with the Image Viewer's own Python, its packages and its tifffile
// wheel, set up as web/worker.js sets Python up, and opens each compressed TIFF beside its uncompressed twin:
// both must open, to the same image. Exits 1 on a difference or a failure to open, 2 when it cannot run.
// Run by test_compressed_tiff.py.
//   node web-tests/compressed_tiff_driver.mjs WHEEL_DIR NAME.tif:TWIN.tif ...
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.join(here, "..");
const require = createRequire(import.meta.url);
let entry;
try { entry = require.resolve("pyodide/pyodide.mjs", { paths: [here] }); } catch {
  console.error("no pyodide: npm i --prefix web-tests pyodide@314.0.7"); process.exit(2);
}
const { loadPyodide } = await import(pathToFileURL(entry).href);
const { bridge } = await import(pathToFileURL(path.join(repo, "web", "bridge.js")).href);
// what the worker does to a Python once the study's wheels are in, where the page has it
const codecs = await import(pathToFileURL(path.join(repo, "web", "tiff_codecs.js")).href).catch(() => null);
const [wheels, ...pairs] = process.argv.slice(2);
const study = JSON.parse(fs.readFileSync(path.join(repo, "studies", "viewer", "study.json"), "utf8"));

const py = await loadPyodide();
await py.loadPackage(study.python.packages);
const site = py.runPython("import sysconfig; sysconfig.get_path('purelib')");
for (const w of fs.readdirSync(wheels).filter((f) => f.endsWith(".whl"))) py.unpackArchive(new Uint8Array(fs.readFileSync(path.join(wheels, w))), "wheel", { extractDir: site });
codecs?.tiffCodecs(py);
py.FS.mkdirTree("/py");
py.FS.writeFile("/py/viewer.py", fs.readFileSync(path.join(repo, "studies", "viewer", study.python.paths[0], study.python.entry + ".py"), "utf8"));
py.runPython(`import sys, json, importlib; sys.path.insert(0, '/py'); study = importlib.import_module('${study.python.entry}')`);

let out = [];
const answer = bridge(py, (m) => out.push(m), study.progress);
const open = (file) => {
  out = [];
  const b = fs.readFileSync(file);
  try { answer({ type: "open", name: path.basename(file), bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }); }
  catch (e) { return { error: String(e.message).trim().split("\n").pop() }; }
  return out.find((m) => m.type === "opened") || { error: "no answer" };
};
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const problems = [];
for (const pair of pairs) {
  const [file, twin] = pair.split(":"), got = open(file), want = open(twin);
  const name = path.basename(file);
  if (got.error || !got.images) problems.push(`${name} did not open: ${got.error}`);
  else if (!want.images) problems.push(`its twin ${path.basename(twin)} did not open: ${want.error}`);
  else if (got.meta.W !== want.meta.W || got.meta.H !== want.meta.H || !same(got.images, want.images)) problems.push(`${name} opened to a different image than its twin`);
  else console.log(`${name}: ${got.meta.W} x ${got.meta.H}, as its twin`);
}
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);
