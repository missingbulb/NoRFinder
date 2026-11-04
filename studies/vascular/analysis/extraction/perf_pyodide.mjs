// The page's side of a performance pass (perf.py is the pure-Python side): one extraction version run in Pyodide, the
// page's runtime, the way the page runs it (py/vascular.py: open the stack, then Execute), in a process of its own, so
// the WebAssembly heap it reports is that run's own; the heap only grows, so its size after Execute is the run's peak.
// STUDY is a checkout of studies/vascular, so a pass can run the code before it and after it on the same stack.
//   npm i --prefix DIR pyodide@314.0.7 && NODE_PATH=DIR/node_modules node perf_pyodide.mjs STUDY STACK.tif VERSION
// Prints one JSON line: seconds to open and to Execute, the heap (MB) after boot, after opening and after Execute,
// and the model's signature as perf.py takes it.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const [study, stack, version] = process.argv.slice(2);
const require = createRequire(path.join(process.cwd(), "x.js"));
const { loadPyodide } = await import(pathToFileURL(require.resolve("pyodide/pyodide.mjs")).href);
const manifest = JSON.parse(fs.readFileSync(path.join(study, "study.json"), "utf8"));
const py = await loadPyodide();
await py.loadPackage(manifest.python.packages, { messageCallback: () => {} });
await py.loadPackage("micropip", { messageCallback: () => {} });
await py.pyimport("micropip").install(manifest.python.wheels);
const heap = () => Math.round(py._module.HEAPU8.length / 2 ** 20);
py.FS.mkdirTree("/study"); py.FS.mount(py.FS.filesystems.NODEFS, { root: path.resolve(study) }, "/study");
py.FS.mkdirTree("/stack"); py.FS.mount(py.FS.filesystems.NODEFS, { root: path.dirname(path.resolve(stack)) }, "/stack");
py.runPython(`import sys; sys.path[:0] = ['/study/' + d.rstrip('/') for d in ${JSON.stringify(manifest.python.paths)}]`);
py.runPython(`import ${manifest.python.entry} as study, time, json, hashlib`);
const booted = heap();
const opened = JSON.parse(py.runPython(`
t = time.perf_counter(); s = study.Session('/stack/${path.basename(stack)}'); s.opened(); json.dumps(time.perf_counter() - t)`));
const afterOpen = heap();
const out = JSON.parse(py.runPython(`
t = time.perf_counter(); m = json.loads(s.extract('${version}', '${path.basename(stack)}', 1.0)[0]); dt = time.perf_counter() - t
m.get('score', {}).pop('seconds', None)
json.dumps({'seconds': dt, 'edges': len(m['edges']), 'signature': hashlib.sha256(json.dumps(m, sort_keys=True, separators=(',', ':')).encode()).hexdigest()[:16]})`));
console.log(JSON.stringify({ version, stack: path.basename(stack, ".tif"), open_s: +opened.toFixed(2), extract_s: +out.seconds.toFixed(2),
  heap_boot_mb: booted, heap_open_mb: afterOpen, heap_peak_mb: heap(), edges: out.edges, signature: out.signature }));
