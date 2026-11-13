// Drives web/bridge.js in Pyodide under Node with the Bookshelf Reader's own Python and only the packages its
// study.json names (web/python_files.js, as the worker picks them): Python is ready, opens a photo, and Find books
// answers with a list of books.
// Exits 1 on a wrong answer, 2 when it cannot run (no pyodide, or Pyodide's packages cannot be downloaded).
//   node studies/shelves/tests/find_bridge_driver.mjs PHOTO
import { execFileSync } from "node:child_process";
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
const [photo] = process.argv.slice(2);
const studyDir = path.join(repo, "studies", "shelves"), study = JSON.parse(fs.readFileSync(path.join(studyDir, "study.json"), "utf8"));

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
py.FS.mkdirTree("/py");
for (const d of study.python.paths) for (const f of fs.readdirSync(path.join(studyDir, d))) if (f.endsWith(".py")) py.FS.writeFile("/py/" + f, new Uint8Array(fs.readFileSync(path.join(studyDir, d, f))));
py.runPython(`import sys, json, importlib; sys.path.insert(0, '/py'); study = importlib.import_module('${study.python.entry}')`);

const problems = [];
JSON.parse(py.runPython("study.ready()"));
let out = [];
const answer = bridge(py, (m) => out.push(m), study.progress);
const ask = (m) => { out = []; try { answer(m); } catch (e) { problems.push(`${m.type}: ${String(e.message || e).split("\n")[0]}`); } return out; };
const bytes = fs.readFileSync(photo), name = path.basename(photo);
if (!ask({ type: "open", name, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) }).some((m) => m.type === "held")) problems.push(`${name} is not held`);
else {
  // every version the page offers, each found without the text finder's map, as with the text finder out of reach
  for (const algorithm of JSON.parse(execFileSync("python3", [study.generated[study.algorithms]], { cwd: studyDir, encoding: "utf8" })).algorithms.map((a) => a.key)) {
    const r = ask({ type: "call", action: "find", args: { algorithm } }).find((m) => m.type === "result");
    if (!Array.isArray(r?.meta?.books)) problems.push(`find ${algorithm}: ${JSON.stringify(r?.meta)}`);
    else console.log(`${name}, ${algorithm}: ${r.meta.books.length} books`);
  }
}
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);
