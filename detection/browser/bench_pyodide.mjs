// Runs detection/bench.py under Pyodide (the page's runtime) for one finder per process, so the
// WebAssembly heap it reports is that finder's own peak (wasm memory only grows, never shrinks).
//   cd detection/browser && npm i --prefix . pyodide@314.0.7 && node bench_pyodide.mjs tl
// Needs the reference slide in data/raw (python3 src/fetch_data.py -m '*up_left2*').
import { loadPyodide } from "pyodide";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repo = process.env.NOR_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const finder = process.argv[2] || "tl";
const reps = process.argv[3] || "2";
const t0 = Date.now();
const py = await loadPyodide();
await py.loadPackage(["numpy", "scipy", "scikit-image", "pillow", "micropip"], { messageCallback: () => {} });
await py.pyimport("micropip").install("tifffile==2026.3.3");
const boot = (Date.now() - t0) / 1000;
const heap = () => py._module.HEAPU8.length / 2 ** 20;
const before = heap();
py.FS.mkdirTree("/repo");
py.FS.mount(py.FS.filesystems.NODEFS, { root: repo }, "/repo");
py.globals.set("finder", finder);
py.globals.set("reps", reps);
await py.runPythonAsync(`
import sys, os
os.chdir('/repo/detection'); sys.path.insert(0, '/repo/detection')
sys.argv = ['bench.py', finder, '--reps', reps]
exec(open('bench.py').read(), {'__name__': '__main__', '__file__': '/repo/detection/bench.py'})
`);
console.log(`${finder}: boot+packages ${boot.toFixed(1)} s, wasm heap ${before.toFixed(0)} MB after boot -> ${heap().toFixed(0)} MB peak`);
