// Where the page's memory goes under Pyodide, stage by stage: the runtime, the packages' files,
// each import, the slide, one finder's detect. Runs in Node (the same V8 and WebAssembly runtime
// as the page's worker) so every part can be read directly rather than inferred from Chromium.
//   cd detection/browser && npm i --prefix . pyodide@314.0.7 && node --expose-gc mem_breakdown.mjs [FINDER] [--lazy]
// Needs the reference slide in data/raw and the vendored wheels (python3 web/build.py).
//
// Default: the packages are installed the way web/worker.js does today, with loadPackage, which
// also loads every native module in each package (and in each dependency) up front.
// --lazy: the same wheel files are only unpacked (pyodide.unpackArchive), only the packages the
// finders import, and a native module is loaded when Python first imports it.
//
// Columns, in MB:
//   rss      the process's resident memory
//   wasm     WebAssembly linear memory: Python objects, numpy arrays, C libraries' data
//   files    the in-memory filesystem, where the packages' files are unpacked
//   wasmmeta V8's per-module bookkeeping for loaded native modules (trusted large-object space)
//   jsheap   the rest of V8's JavaScript heap
//   other    rss minus the above: compiled machine code of the native modules, Node itself
import { loadPyodide } from "pyodide";
import { fileURLToPath } from "node:url";
import v8 from "node:v8";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = process.env.NOR_REPO || path.resolve(here, "..", "..");
const argv = process.argv.slice(2);
const lazy = argv.includes("--lazy");
const finder = argv.find((a) => !a.startsWith("--")) || "tl";
const tif = path.join(repo, "data", "raw", "Left Up- Edited", "Slide5_4AP_NoR.sld - Slice1_up_left2.tif");
const MB = 2 ** 20;
const COLS = ["rss", "wasm", "files", "wasmmeta", "jsheap", "other"];
let py, prev;

function filesBytes(dir = "/") {
  let n = 0;
  for (const e of py.FS.readdir(dir)) {
    if (e === "." || e === "..") continue;
    const p = (dir === "/" ? "" : dir) + "/" + e;
    if (["/repo", "/dev", "/proc", "/sys"].includes(p)) continue;
    const st = py.FS.lstat(p);
    if (py.FS.isDir(st.mode)) n += filesBytes(p);
    else if (py.FS.isFile(st.mode)) n += st.size;
  }
  return n;
}

function sample(label) {
  globalThis.gc?.();
  const m = process.memoryUsage();
  const meta = v8.getHeapSpaceStatistics().find((s) => s.space_name === "trusted_large_object_space")?.space_used_size || 0;
  const r = { rss: m.rss, wasm: py ? py._module.HEAPU8.length : 0, files: py ? filesBytes() : 0, wasmmeta: meta, jsheap: m.heapUsed - meta };
  r.other = r.rss - r.wasm - r.files - r.wasmmeta - r.jsheap;
  const d = prev ? r.rss - prev.rss : 0;
  console.log([label.padEnd(30), ...COLS.map((k) => (r[k] / MB).toFixed(0).padStart(8)), ((d >= 0 ? "+" : "") + (d / MB).toFixed(0)).padStart(6)].join(" "));
  prev = r;
}

console.log(`${lazy ? "lazy" : "eager (as the page does today)"}, finder ${finder}`);
console.log(["stage".padEnd(30), ...COLS.map((s) => s.padStart(8)), "Δrss".padStart(6)].join(" "));
sample("node, nothing loaded");
py = await loadPyodide();
sample("pyodide runtime + stdlib");
const vendored = JSON.parse(fs.readFileSync(path.join(repo, "web", "vendor", "wheels.json"))).map((w) => path.join(repo, "web", "vendor", w));
if (lazy) {
  // loadPackage fetches the wheels into Pyodide's package directory; read them from there
  const lock = py._api.lockfile_packages;
  const dir = path.dirname(fileURLToPath(import.meta.resolve("pyodide")));
  for (const name of ["numpy", "scipy", "scikit-image", "lazy-loader", "packaging", "pillow"]) {
    const f = path.join(dir, lock[name].file_name);
    if (!fs.existsSync(f)) throw new Error(`${f} missing: run once without --lazy to download it`);
    py.unpackArchive(new Uint8Array(fs.readFileSync(f)), "wheel");
    sample(`unpack ${name}`);
  }
  for (const f of vendored) py.unpackArchive(new Uint8Array(fs.readFileSync(f)), "wheel");
  sample("unpack tifffile");
} else {
  for (const name of ["numpy", "scipy", "scikit-image", "pillow", "micropip"]) {
    await py.loadPackage([name], { messageCallback: () => {} });
    sample(`loadPackage ${name}${name === "scikit-image" ? " + deps" : ""}`);
  }
  py.FS.mkdirTree("/v"); for (const f of vendored) py.FS.writeFile("/v/" + path.basename(f), fs.readFileSync(f));
  await py.pyimport("micropip").install(vendored.map((f) => "emfs:/v/" + path.basename(f)));
  sample("micropip tifffile");
}

const run = (code, label) => {
  try { py.runPython(code); } catch (e) { console.error(String(e.message).slice(-800)); process.exit(1); }
  sample(label);
};
run("import numpy", "import numpy");
run("from scipy import ndimage", "import scipy.ndimage");
run("from skimage.segmentation import watershed; from skimage.morphology import reconstruction, h_maxima; "
  + "from skimage.measure import perimeter; from skimage.filters import threshold_otsu", "import skimage (used parts)");
run("from PIL import Image, ImageDraw", "import PIL");
run("import tifffile", "import tifffile");
py.FS.mkdirTree("/repo");
py.FS.mount(py.FS.filesystems.NODEFS, { root: repo }, "/repo");
run("import sys, os; sys.path[:0] = ['/repo/detection', '/repo/src']; os.environ['NORFINDER_SRC'] = '/repo/src'; import interactive", "import the finders");
py.FS.writeFile("/tmp/slide.tif", fs.readFileSync(tif));
run("S = interactive.Session('/tmp/slide.tif'); _img = S.images(); del _img", "open slide + images()");
run(`meta, seg = S.detect('${finder}', {})`, `detect ${finder}`);
run("_f = S.refilter({'values': {}, 'off': []})", "first refilter");

const libs = Object.keys(py._module.LDSO.loadedLibsByName).filter((k) => k.endsWith(".so"));
const by = {};
for (const l of libs) {
  const top = (l.match(/(?:site-packages|home\/pyodide)\/([^/]+)/) || [, "other"])[1];
  const b = by[top] || (by[top] = { n: 0, bytes: 0 }); b.n++;
  try { b.bytes += py.FS.stat(l).size; } catch {}
}
console.log(`\nnative modules loaded: ${libs.length} (`
  + Object.entries(by).sort((a, b) => b[1].bytes - a[1].bytes).map(([k, v]) => `${k} ${v.n}, ${(v.bytes / MB).toFixed(1)} MB`).join("; ") + ")");
console.log("output signature:", py.runPython("import hashlib, json; hashlib.sha256((meta + json.dumps(_f)).encode() + bytes(seg)).hexdigest()[:16]"));
