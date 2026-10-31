// Runs a study's Python under Pyodide, off the page's thread: the study its address names (worker.js?study=<id>),
// with the packages, module folders and entry module its study.json names, and then any other the page swaps
// in (study {id}) in the same Python.
// Messages out while a study loads: progress {text}, ready {info}, error {text}; the rest are the bridge's.
// A module worker: its imports are fetched with CORS, so the service worker can cache them.
import { bridge } from "./bridge.js";

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

const say = (text) => post({ type: "progress", text });
let py, manifest, current;
const first = new URL(self.location.href).searchParams.get("study");
// Python itself starts once, while the first study's packages download
const python = import(PYODIDE + "pyodide.mjs").then(({ loadPyodide }) => loadPyodide({ indexURL: PYODIDE }));
python.catch(() => {}); // reported where it is awaited
const unpacked = new Set(); // the wheels already in Python's site-packages, by URL

// A study into the running Python: the packages it names that are not there yet, then its entry module, with
// the modules the study before it imported from its own folders forgotten, so a name two studies share
// imports the new one's.
async function loadStudy(id) {
  const t0 = performance.now();
  if (!/^[\w-]+$/.test(id || "")) throw new Error(`no study "${id}"`);
  const studyBase = new URL(`../studies/${id}/`, self.location.href).href;
  const m = await (await fetch(studyBase + "study.json")).json();
  current = id; manifest = m; answer = null;
  say(py ? "Downloading packages…" : "Downloading Python…");
  // Only the packages the study imports are unpacked, and each native module loads the first time
  // Python imports it: loadPackage would load every module of every package and of its dependencies
  // up front, about 100 MB more memory. A package missing here fails loudly as an ImportError.
  // They download while Python itself downloads and starts.
  stage = "Downloading Python and packages"; expected = Infinity; heads = 0; sized = true; got = 0; total = 0;
  const wheels = (async () => {
    const [lock, vendored] = await Promise.all([fetch(PYODIDE + "pyodide-lock.json"), fetch("vendor/wheels.json")].map(async (r) => (await r).json()));
    // the build vendors every study's wheels; this study's are the ones its study.json pins, by name and version
    const wheel = (pin) => pin.replace("==", "-").replace(/-/g, "_").toLowerCase();
    const own = vendored.filter((w) => m.python.wheels.some((pin) => w.toLowerCase().replace(/-/g, "_").startsWith(wheel(pin) + "_")));
    const list = m.python.packages
      .map((n) => ({ url: PYODIDE + lock.packages[n].file_name, sha256: lock.packages[n].sha256 }))
      .concat(own.map((w) => ({ url: new URL("vendor/" + w, self.location.href).href })))
      .filter((w) => !unpacked.has(w.url));
    expected = list.length;
    return Promise.all(list.map(async (w) => ({ url: w.url, buf: await fetchWheel(w) })));
  })();
  wheels.catch(() => {}); // a failed download is reported where it is awaited, after Python starts
  py = await python;
  stage = "Downloading packages";
  const bufs = await wheels;
  if (bufs.length) say(m.progress?.install || "Installing Python's packages…");
  working(() => {
    const site = py.runPython("import sysconfig; sysconfig.get_path('purelib')");
    for (const { url, buf } of bufs) { py.unpackArchive(buf, "wheel", { extractDir: site }); unpacked.add(url); }
  });
  say(m.progress?.load || "Loading the study…");
  // the study's Python modules are read straight from the repo's layout as they are imported: a new module
  // in one of its folders ships with no list to update
  py.globals.set("bases", py.toPy(m.python.paths.map((b) => new URL(b, studyBase).href)));
  py.globals.set("entry", m.python.entry);
  working(() => py.runPython(`
import sys, os, gc, importlib, importlib.util
from js import XMLHttpRequest

if 'RepoModules' not in globals():
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
                    from_repo.add(name)
                    return importlib.util.spec_from_file_location(name, f)
            return None

    from_repo = set()
    sys.meta_path.append(RepoModules())
for name in from_repo:
    sys.modules.pop(name, None)
    os.remove('/py/' + name + '.py')
from_repo.clear()
globals().pop('S', None)
gc.collect()
import json
study = importlib.import_module(entry)
`));
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

// every message names the study it is from, so the page can drop a late answer for a study that left;
// every answer says how large Python's memory has grown, which never shrinks and is most of the tab's, and
// what Python's files take: the file system, Python's own library and the packages installed, is in memory.
// Each also says, for the status bar, how long Python has spent working (busy: {ms, since}, since set while it
// works) and what this thread downloaded that the service worker did not answer, which its timings give as 0.
let files = 0, downloaded = 0;
const busy = { ms: 0, since: null };
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) downloaded += e.transferSize || 0; }).observe({ type: "resource", buffered: true }); } catch { /* no timings */ }
const post = (m, transfer) => postMessage({ ...m, study: current, busy, net: downloaded, ...(py && { heap: py._module.HEAPU8.byteLength, files }) }, transfer);
// Python's work holds this thread, so the page hears when it starts and when it ends
function working(fn) {
  busy.since = Date.now(); post({ type: "busy" });
  try { return fn(); } finally { busy.ms += Date.now() - busy.since; busy.since = null; post({ type: "busy" }); }
}
let answer;
async function handle(m) {
  if (m.type === "study") return loadStudy(m.id);
  answer ||= bridge(py, post, manifest.progress);
  working(() => answer(m));
}

// a message waits for the one before it: the first study loads before anything is asked of it
let queue = loadStudy(first);
onmessage = (e) => {
  queue = queue.catch(() => {}).then(() => handle(e.data));
  queue.catch((err) => post({ type: "error", text: String(err.message || err) }));
};
queue.catch((err) => post({ type: "error", text: String(err.message || err) }));
