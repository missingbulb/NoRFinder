// Runs the unchanged Python finders under Pyodide (Python compiled to WebAssembly, the same
// runtime a browser would use) and prints the nor_lab.py cmp lines, to compare with native.
//   cd detection/browser && npm i pyodide && node pyodide_check.mjs [SPEC ...]
// Needs detection/.cache/ built once natively (python3 nor_lab.py cmp tl); see README.md here.
import { loadPyodide } from "pyodide";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const specs = process.argv.slice(2).length ? process.argv.slice(2) : ["tl", "rf"];
const t0 = Date.now();
const py = await loadPyodide();
const t1 = Date.now();
await py.loadPackage(["numpy", "scipy", "scikit-image", "pillow"]);
const t2 = Date.now();
py.FS.mkdirTree("/repo");
py.FS.mount(py.FS.filesystems.NODEFS, { root: repo }, "/repo");
console.log(`boot ${(t1 - t0) / 1000}s, packages ${(t2 - t1) / 1000}s`);
py.globals.set("specs", py.toPy(specs));
await py.runPythonAsync(`
import sys, os, time
os.chdir('/repo/detection'); sys.argv = ['nor_lab.py', 'cmp', *specs]
t = time.time()
exec(open('nor_lab.py').read(), {'__name__': '__main__', '__file__': '/repo/detection/nor_lab.py'})
print('python wall', round(time.time() - t, 1), 's')
`);
