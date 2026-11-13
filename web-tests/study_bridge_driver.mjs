// Drives web/bridge.js in Pyodide under Node with the fixture study's own Python, which the bridge knows
// nothing of: a PNG's own bytes held by the study's Session, and one call on it, must come back as the study answered
// them (the page reads and shows the image itself). Exits 1 on a wrong
// answer, 2 when it cannot run. Run by tests/test_study_runs.py.
//   node web-tests/study_bridge_driver.mjs IMAGE.png
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
if (!opened.some((m) => m.type === "progress" && m.text === study.progress.open)) problems.push("no progress from the study's own text while opening");
if (!opened.some((m) => m.type === "held") || opened.some((m) => m.type === "opened")) problems.push(`open: ${JSON.stringify(opened.map((m) => m.type))}`);
const r = ask({ type: "call", action: "count", args: { algorithm: "above", threshold: 128 }, echo: 7 }).find((m) => m.type === "result");
// two squares above 128: 10 x 10 and 15 x 20
if (!r || r.action !== "count" || r.echo !== 7 || r.meta.count !== 400 || r.bytes.length !== 80 * 60 || r.bytes.reduce((a, b) => a + b, 0) !== 400)
  problems.push(`count: ${JSON.stringify(r && { action: r.action, echo: r.echo, meta: r.meta })}`);
console.log(`held, counted ${r?.meta.count}`);
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);
