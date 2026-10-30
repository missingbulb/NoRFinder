// Runs a study's Python under Pyodide, off the page's thread: the study its address names (worker.js?study=<id>),
// with the packages, module folders and entry module its study.json names.
// Messages out while it boots: progress {text}, ready {info}, error {text}; the rest are the bridge's.
// A module worker: its imports are fetched with CORS, so the service worker can cache them.
import { bridge } from "./bridge.js";

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

const say = (text) => postMessage({ type: "progress", text });
let py, manifest;
const id = new URL(self.location.href).searchParams.get("study");
const studyBase = new URL(`../studies/${id}/`, self.location.href).href;

async function boot() {
  const t0 = performance.now();
  if (!/^[\w-]+$/.test(id || "")) throw new Error(`no study "${id}"`);
  manifest = await (await fetch(studyBase + "study.json")).json();
  say("Downloading Python…");
  // Only the packages the study imports are unpacked, and each native module loads the first time
  // Python imports it: loadPackage would load every module of every package and of its dependencies
  // up front, about 100 MB more memory. A package missing here fails loudly as an ImportError.
  // They download while Python itself downloads and starts.
  const wheels = (async () => {
    const [lock, vendored] = await Promise.all([fetch(PYODIDE + "pyodide-lock.json"), fetch("vendor/wheels.json")].map(async (r) => (await r).json()));
    // the build vendors every study's wheels; this study's are the ones its study.json pins, by name and version
    const wheel = (pin) => pin.replace("==", "-").replace(/-/g, "_").toLowerCase();
    const own = vendored.filter((w) => manifest.python.wheels.some((pin) => w.toLowerCase().replace(/-/g, "_").startsWith(wheel(pin) + "_")));
    const list = manifest.python.packages
      .map((n) => ({ url: PYODIDE + lock.packages[n].file_name, sha256: lock.packages[n].sha256 }))
      .concat(own.map((w) => ({ url: new URL("vendor/" + w, self.location.href).href })));
    expected = list.length;
    return Promise.all(list.map(fetchWheel));
  })();
  wheels.catch(() => {}); // a failed download is reported where it is awaited, after Python starts
  const { loadPyodide } = await import(PYODIDE + "pyodide.mjs");
  py = await loadPyodide({ indexURL: PYODIDE });
  stage = "Downloading packages";
  const bufs = await wheels;
  say(manifest.progress?.install || "Installing Python's packages…");
  const site = py.runPython("import sysconfig; sysconfig.get_path('purelib')");
  for (const buf of bufs) py.unpackArchive(buf, "wheel", { extractDir: site });
  say(manifest.progress?.load || "Loading the study…");
  // the study's Python modules are read straight from the repo's layout as they are imported: a new module
  // in one of its folders ships with no list to update
  py.globals.set("bases", py.toPy(manifest.python.paths.map((b) => new URL(b, studyBase).href)));
  py.globals.set("entry", manifest.python.entry);
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
import json
study = importlib.import_module(entry)
`);
  files = py.runPython("sum(os.path.getsize(os.path.join(d, f)) for top in ('/lib', '/py') for d, _, fs in os.walk(top) for f in fs)");
  post({ type: "ready", info: JSON.parse(py.runPython("study.ready()")), secs: (performance.now() - t0) / 1000 });
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

// every answer says how large Python's memory has grown, which never shrinks and is most of the tab's, and
// what Python's files take: the file system, Python's own library and the packages installed, is in memory
let files = 0;
const post = (m, transfer) => postMessage({ ...m, heap: py._module.HEAPU8.byteLength, files }, transfer);
let answer;
async function handle(m) {
  await booted;
  answer ||= bridge(py, post, manifest.progress);
  answer(m);
}

let queue = Promise.resolve();
onmessage = (e) => {
  queue = queue.then(() => handle(e.data)).catch((err) => postMessage({ type: "error", text: String(err.message || err) }));
};
