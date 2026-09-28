// Runs the repo's Python finders (detection/interactive.py) under Pyodide, off the page's thread.
// Messages in: open {name, bytes}, detect {finder, overrides}, refilter {spec, seq}.
// Messages out: progress {text}, ready, opened {H, W, images}, detected {meta, seg}, filtered {fails, seq}, error {text}.
// A module worker: its imports are fetched with CORS, so the service worker can cache them.
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

const say = (text) => postMessage({ type: "progress", text });
let py;

async function boot() {
  const t0 = performance.now();
  say("Loading Python…");
  const { loadPyodide } = await import(PYODIDE + "pyodide.mjs");
  py = await loadPyodide({ indexURL: PYODIDE });
  say("Loading numpy, scipy, scikit-image…");
  await py.loadPackage(["numpy", "scipy", "scikit-image", "pillow", "micropip"]);
  const wheels = await (await fetch("vendor/wheels.json")).json();
  await py.pyimport("micropip").install(wheels.map((w) => new URL("vendor/" + w, self.location.href).href));
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
  postMessage({ type: "ready", finders, secs: (performance.now() - t0) / 1000 });
}

const booted = boot().catch((e) => postMessage({ type: "error", text: String(e) }));

async function handle(m) {
  await booted;
  const t0 = performance.now();
  if (m.type === "open") {
    say("Reading the image and building the blue mask…");
    const path = "/tmp/" + m.name.replace(/[^\w.\-]/g, "_");
    py.FS.writeFile(path, new Uint8Array(m.bytes));
    py.globals.set("path", path);
    py.runPython("S = interactive.Session(path); H, W = S.caspr.shape; um = S.um");
    const images = py.runPython("S.images()").toJs();
    postMessage({ type: "opened", H: py.globals.get("H"), W: py.globals.get("W"), um: py.globals.get("um"),
                  images, secs: (performance.now() - t0) / 1000 }, [images.buffer]);
  } else if (m.type === "detect") {
    say("Finding candidates (the slow part)…");
    py.globals.set("finder", m.finder);
    py.globals.set("overrides", JSON.stringify(m.overrides || {}));
    py.runPython("meta, seg = S.detect(finder, json.loads(overrides))");
    const meta = JSON.parse(py.globals.get("meta"));
    const seg = py.globals.get("seg").toJs();
    postMessage({ type: "detected", meta, seg, secs: (performance.now() - t0) / 1000 }, [seg.buffer]);
  } else if (m.type === "refilter") {
    py.globals.set("spec", JSON.stringify(m.spec));
    const fails = JSON.parse(py.runPython("json.dumps(S.refilter(json.loads(spec)))"));
    postMessage({ type: "filtered", fails, seq: m.seq, ms: performance.now() - t0 });
  }
}

let queue = Promise.resolve();
onmessage = (e) => {
  queue = queue.then(() => handle(e.data)).catch((err) => postMessage({ type: "error", text: String(err.message || err) }));
};
