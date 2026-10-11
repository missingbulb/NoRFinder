// Drives web/bridge.js in Pyodide under Node with the fixture study's own Python, which the bridge knows
// nothing of: opening a PNG and one call must come back as the study answered them. Exits 1 on a wrong
// answer, 2 when it cannot run. Run by tests/test_study_runs.py.
//   node tests/study_bridge_driver.mjs IMAGE.png
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.join(here, "..");
const require = createRequire(import.meta.url);
let entry;
try { entry = require.resolve("pyodide/pyodide.mjs", { paths: [here] }); } catch {
  console.error("no pyodide: npm i --prefix tests pyodide@314.0.7"); process.exit(2);
}
const { loadPyodide } = await import(pathToFileURL(entry).href);
const { bridge } = await import(pathToFileURL(path.join(repo, "web", "bridge.js")).href);
const study = JSON.parse(fs.readFileSync(path.join(repo, "studies", "fixture", "study.json"), "utf8"));

const py = await loadPyodide();
await py.loadPackage(study.python.packages);
py.FS.mkdirTree("/py");
py.FS.writeFile("/py/fixture.py", fs.readFileSync(path.join(repo, "studies", "fixture", study.python.paths[0], study.python.entry + ".py"), "utf8"));
py.runPython(`import sys, json, importlib; sys.path.insert(0, '/py'); study = importlib.import_module('${study.python.entry}')`);

let out = [];
const answer = bridge(py, (m) => out.push(m), study.progress);
const ask = (m) => { out = []; answer(m); return out; };
const problems = [];
const png = fs.readFileSync(process.argv[2]);
const opened = ask({ type: "open", name: "squares.png", bytes: png.buffer.slice(png.byteOffset, png.byteOffset + png.length) });
const o = opened.find((m) => m.type === "opened");
if (!opened.some((m) => m.type === "progress" && m.text === study.progress.open)) problems.push("no progress from the study's own text while opening");
if (!o || o.meta.W !== 80 || o.meta.H !== 60 || o.images.length !== 80 * 60) problems.push(`opened: ${JSON.stringify(o && { meta: o.meta, n: o.images.length })}`);
const r = ask({ type: "call", action: "count", args: { threshold: 128 }, echo: 7 }).find((m) => m.type === "result");
// two squares above 128: 10 x 10 and 15 x 20
if (!r || r.action !== "count" || r.echo !== 7 || r.meta.count !== 400 || r.bytes.length !== 80 * 60 || r.bytes.reduce((a, b) => a + b, 0) !== 400)
  problems.push(`count: ${JSON.stringify(r && { action: r.action, echo: r.echo, meta: r.meta })}`);
console.log(`opened ${o?.meta.W}x${o?.meta.H}, counted ${r?.meta.count}`);
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);
