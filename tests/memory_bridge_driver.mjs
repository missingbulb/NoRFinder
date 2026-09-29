// Drives web/bridge.js in Pyodide under Node, with the Python session replaced by a stand-in whose
// answers carry a few megabytes each, and checks that opening, finding and filtering over and over
// leaves Python holding nothing more and no uploaded file behind. Prints what it measured; exits 1
// on growth. Run by tests/test_memory.py.
//   node tests/memory_bridge_driver.mjs
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// pyodide at the version the page loads, installed here or beside the browser tools
let entry;
for (const base of [here, path.join(here, "..", "detection", "browser")]) {
  try { entry = require.resolve("pyodide/pyodide.mjs", { paths: [base] }); break; } catch {}
}
if (!entry) { console.error("no pyodide: npm i --prefix detection/browser pyodide@314.0.7"); process.exit(2); }
const { loadPyodide } = await import(pathToFileURL(entry).href);
const { bridge } = await import(pathToFileURL(path.join(here, "..", "web", "bridge.js")).href);

const STAND_IN = `
import json
N = 1000
class Channel:
    shape = (N, N)
class Session:
    def __init__(self, path):
        with open(path, 'rb') as f:
            self.size = len(f.read())
        self.caspr, self.um = Channel(), 0.17
    def images(self):
        return bytes(4 * N * N)
    def detect(self, finder, overrides):
        return json.dumps({'finder': finder, 'cands': []}), bytes(2 * N * N)
    def refilter(self, spec):
        return []
    def alone(self, spec):
        return {'counts': {}, 'only': {}}
`;

const py = await loadPyodide();
py.FS.mkdirTree("/py");
py.FS.writeFile("/py/interactive.py", STAND_IN);
py.runPython("import sys; sys.path.insert(0, '/py'); import interactive, json");

let out = [];
const answer = bridge(py, (m) => out.push(m));
const ask = (m) => { out = []; answer(m); return out.find((o) => o.type !== "progress"); };
let opened = 0;
function round() {
  ask({ type: "open", name: `image ${++opened}.tif`, bytes: new ArrayBuffer(1 << 20) });
  ask({ type: "detect", finder: "tl", overrides: {} });
  ask({ type: "refilter", seq: opened, spec: { values: {}, off: [] } });
  return ask({ type: "memory" });
}

const WARM = 2, ROUNDS = 5, MB = 1024 * 1024;
for (let k = 0; k < WARM; k++) round();
const base = ask({ type: "memory" });
let m;
for (let k = 0; k < ROUNDS; k++) m = round();
const files = py.FS.readdir("/tmp").filter((f) => f !== "." && f !== "..");
console.log(`python ${(base.used / MB).toFixed(2)} -> ${(m.used / MB).toFixed(2)} MB, objects ${base.objects} -> ${m.objects}, files left in /tmp: ${files.length}`);
const problems = [];
// each round hands out 6 MB: keeping even one round's answers would show as megabytes
if (m.used - base.used > 64 * 1024) problems.push(`Python holds ${((m.used - base.used) / MB).toFixed(2)} MB more after ${ROUNDS} rounds`);
if (m.objects - base.objects > 50) problems.push(`Python holds ${m.objects - base.objects} more objects after ${ROUNDS} rounds`);
if (files.length) problems.push(`uploaded files left behind: ${files.join(", ")}`);
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);
