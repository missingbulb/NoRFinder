// Drives web/bridge.js in Pyodide under Node with the vascular study's own Python and only the packages its
// study.json names (web/python_files.js, as the worker picks them): Python is ready with the extraction lab's
// algorithms, opens a stack, and Execute's call draws a vessel model from it with each algorithm asked for.
// Exits 1 on a wrong answer, 2 when it cannot run (no pyodide, or Pyodide's packages cannot be downloaded).
//   node studies/vascular/tests/extract_bridge_driver.mjs STACK.tif TIFFFILE_DIR ALGORITHM...
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "..", "..", "..");
const require = createRequire(path.join(repo, "web-tests", "driver.mjs"));
let entry;
try { entry = require.resolve("pyodide/pyodide.mjs"); } catch { console.error("no pyodide: npm i --prefix web-tests pyodide@314.0.7"); process.exit(2); }
const { loadPyodide } = await import(pathToFileURL(entry).href);
const { bridge } = await import(pathToFileURL(path.join(repo, "web", "bridge.js")).href);
const { PYODIDE, packagesOf } = await import(pathToFileURL(path.join(repo, "web", "python_files.js")).href);
const [stack, tifffile, ...algorithms] = process.argv.slice(2);
const studyDir = path.join(repo, "studies", "vascular"), study = JSON.parse(fs.readFileSync(path.join(studyDir, "study.json"), "utf8"));

const py = await loadPyodide();
const lock = JSON.parse(fs.readFileSync(path.join(path.dirname(entry), "pyodide-lock.json"), "utf8"));
const site = py.runPython("import sysconfig; sysconfig.get_path('purelib')");
// the study's packages and nothing they might pull in: a module missing from the list fails here as on the page
for (const w of packagesOf({ ...study.python, wheels: [] }, lock, [], PYODIDE)) {
  let buf;
  try { const r = await fetch(w.url); if (!r.ok) throw new Error(`HTTP ${r.status}`); buf = new Uint8Array(await r.arrayBuffer()); }
  catch (e) { console.error(`cannot download ${w.url}: ${e.message}`); process.exit(2); }
  py.unpackArchive(buf, "wheel", { extractDir: site });
}
await py.loadPackage([]);
// the vendored wheel the build fetches, here the pure-Python package of the machine running the test
for (const f of fs.readdirSync(tifffile)) if (f.endsWith(".py")) { py.FS.mkdirTree(site + "/tifffile"); py.FS.writeFile(`${site}/tifffile/${f}`, new Uint8Array(fs.readFileSync(path.join(tifffile, f)))); }
py.FS.mkdirTree("/py");
for (const d of study.python.paths) for (const f of fs.readdirSync(path.join(studyDir, d))) if (f.endsWith(".py")) py.FS.writeFile("/py/" + f, new Uint8Array(fs.readFileSync(path.join(studyDir, d, f))));
py.runPython(`import sys, json, importlib; sys.path.insert(0, '/py'); study = importlib.import_module('${study.python.entry}')`);

const problems = [];
const info = JSON.parse(py.runPython("study.ready()"));
const keys = (info.algorithms || []).map((a) => a.key);
if (keys.length < 2 || new Set(keys).size !== keys.length || !info.algorithms.every((a) => a.title && a.icon && a.about && a.name)) problems.push(`ready: ${JSON.stringify(keys)}`);
let out = [];
const answer = bridge(py, (m) => out.push(m), study.progress);
const ask = (m) => { out = []; answer(m); return out; };
const bytes = fs.readFileSync(stack);
const o = ask({ type: "open", name: "stack.tif", bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) }).find((m) => m.type === "opened");
if (!o || !(o.meta.Z > 1)) problems.push(`opened: ${JSON.stringify(o?.meta)}`);
for (const a of algorithms.length ? algorithms : [keys[0]]) {
  const t = Date.now();
  const r = ask({ type: "call", action: "extract", args: { algorithm: a, source: "stack.tif", z_step: 2 } }).find((m) => m.type === "result");
  const m = r?.meta, name = info.algorithms.find((x) => x.key === a)?.name;
  console.log(`${a}: ${m?.algorithm}, ${m?.nodes?.length} nodes, ${m?.edges?.length} edges, ${(Date.now() - t) / 1000} s`);
  if (!m || m.format !== "vessel-model/2" || m.algorithm !== name || !(m.edges.length > 0) || m.source !== "stack.tif" || m.z_step_um !== 2 || !m.score)
    problems.push(`extract ${a}: ${JSON.stringify(m && { format: m.format, algorithm: m.algorithm, edges: m.edges?.length, source: m.source, z: m.z_step_um })}`);
}
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);
