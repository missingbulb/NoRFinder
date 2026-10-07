// Runs the repo's Python finders (detection/interactive.py) under Pyodide, off the page's thread.
// Messages out while it boots: progress {text}, ready {finders, about}, error {text}; the rest are the bridge's.
// A module worker: its imports are fetched with CORS, so the service worker can cache them.
import { bridge } from "./bridge.js";

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

const say = (text) => postMessage({ type: "progress", text });
let py;

async function boot() {
  const t0 = performance.now();
  say("Downloading Python…");
  // Only the packages the finders import are unpacked, and each native module loads the first time
  // Python imports it: loadPackage would load every module of every package and of its dependencies
  // up front, about 100 MB more memory. A package missing here fails loudly as an ImportError.
  // They download while Python itself downloads and starts.
  const wheels = (async () => {
    const [lock, vendored] = await Promise.all([fetch(PYODIDE + "pyodide-lock.json"), fetch("vendor/wheels.json")].map(async (r) => (await r).json()));
    const list = ["numpy", "scipy", "scikit-image", "lazy-loader", "packaging", "pillow"]
      .map((n) => ({ url: PYODIDE + lock.packages[n].file_name, sha256: lock.packages[n].sha256 }))
      .concat(vendored.map((w) => ({ url: new URL("vendor/" + w, self.location.href).href })));
    expected = list.length;
    return Promise.all(list.map(fetchWheel));
  })();
  wheels.catch(() => {}); // a failed download is reported where it is awaited, after Python starts
  const { loadPyodide } = await import(PYODIDE + "pyodide.mjs");
  py = await loadPyodide({ indexURL: PYODIDE });
  stage = "Downloading packages";
  const bufs = await wheels;
  say("Installing numpy, scipy, scikit-image…");
  const site = py.runPython("import sysconfig; sysconfig.get_path('purelib')");
  for (const buf of bufs) py.unpackArchive(buf, "wheel", { extractDir: site });
  say("Loading the finders…");
  // Python modules are read straight from the repo's layout as they are imported: a new finder
  // file in detection/ ships with no list to update.
  py.globals.set("bases", py.toPy(["../detection/", "../src/"].map((b) => new URL(b, self.location.href).href)));
  py.runPython(`
import sys, os, importlib.util
from js import XMLHttpRequest

class RepoModules:
    """Imports a top-level module the runtime lacks from the site, the way it sits in the repo."""
    def find_spec(self, name, path=None, target=None):
        if path is not None or '.' in name:
            return None
        for base in bases:
            req = XMLHttpRequest.new(); req.open('GET', base + name + '.py', False); req.send()
            if req.status == 200:
                os.makedirs('/py', exist_ok=True); f = '/py/' + name + '.py'
                open(f, 'w').write(req.responseText)
                return importlib.util.spec_from_file_location(name, f)
        return None

sys.meta_path.append(RepoModules())
os.environ['NORFINDER_SRC'] = '/py'
import interactive, json
`);
  const finders = JSON.parse(py.runPython("json.dumps(interactive.FINDERS)"));
  const about = JSON.parse(py.runPython("json.dumps({f: interactive.describe(f) for f in interactive.FINDERS})"));
  post({ type: "ready", finders, about, secs: (performance.now() - t0) / 1000 });
}

// the packages' download, counted for the status bar while Python starts
let stage = "Downloading Python and packages", expected = Infinity, heads = 0, sized = true, got = 0, total = 0, shown = 0;
const mb = (n) => (n / 1048576).toFixed(0);
function counted(n, size) {
  got += n; if (size !== undefined) { heads++; total += size || 0; sized &&= !!size; }
  const all = heads === expected && sized && got >= total;
  if (!n || (performance.now() - shown < 250 && !all)) return;
  shown = performance.now();
  say(`${stage}… ${mb(got)}${heads === expected && sized ? " of " + mb(total) : ""} MB`);
}

async function fetchWheel({ url, sha256 }) {
  const r = await fetch(url, { priority: "low" }); // Python itself downloads first: it starts while these finish
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  counted(0, Number(r.headers.get("content-length")));
  const parts = [], reader = r.body.getReader();
  for (let c; !(c = await reader.read()).done;) { parts.push(c.value); counted(c.value.length); }
  const buf = await new Blob(parts).arrayBuffer();
  if (sha256) {
    const got = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (got !== sha256) throw new Error(`${url}: checksum mismatch`);
  }
  return buf;
}

const booted = boot().catch((e) => postMessage({ type: "error", text: String(e) }));

// every answer says how large Python's memory has grown: it never shrinks, and it is most of the tab's
const post = (m, transfer) => postMessage({ ...m, heap: py._module.HEAPU8.byteLength }, transfer);
let answer;
async function handle(m) {
  await booted;
  answer ||= bridge(py, post);
  answer(m);
}

let queue = Promise.resolve();
onmessage = (e) => {
  queue = queue.then(() => handle(e.data)).catch((err) => postMessage({ type: "error", text: String(err.message || err) }));
};
