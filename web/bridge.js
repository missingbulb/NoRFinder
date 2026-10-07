// The page's requests, answered by the Python session (detection/interactive.py) inside a Pyodide
// runtime that has already imported interactive and json. The worker runs it; the tests drive it
// outside a browser.
// Messages in: open {name, bytes}, detect {finder, overrides}, refilter {spec, seq}, memory.
// Messages out: progress {text}, opened {H, W, um, info, images}, detected {meta, seg}, filtered {fails, alone, seq},
// memory {used, heap, objects}.
export function bridge(py, post) {
  const say = (text) => post({ type: "progress", text });
  return function answer(m) {
    const t0 = performance.now();
    if (m.type === "open") {
      say("Reading the image and building the blue mask…");
      const path = "/tmp/" + m.name.replace(/[^\w.\-]/g, "_");
      py.FS.writeFile(path, new Uint8Array(m.bytes));
      py.globals.set("path", path);
      // the file is read once; kept, every image opened would stay in the worker's memory
      try { py.runPython("S = interactive.Session(path); H, W = S.caspr.shape; um = S.um; info = json.dumps(S.info)"); } finally { py.FS.unlink(path); }
      // a handle to a Python object keeps it alive until it is destroyed, whatever JavaScript collects
      const im = py.runPython("S.images()"), images = im.toJs(); im.destroy();
      post({ type: "opened", H: py.globals.get("H"), W: py.globals.get("W"), um: py.globals.get("um"), info: JSON.parse(py.globals.get("info")),
                images, secs: (performance.now() - t0) / 1000 }, [images.buffer]);
    } else if (m.type === "detect") {
      say("Finding candidates (the slow part)…");
      py.globals.set("finder", m.finder);
      py.globals.set("overrides", JSON.stringify(m.overrides || {}));
      const r = py.runPython("S.detect(finder, json.loads(overrides))"), s = r.get(1);
      const meta = JSON.parse(r.get(0)), seg = s.toJs(); s.destroy(); r.destroy();
      post({ type: "detected", meta, seg, secs: (performance.now() - t0) / 1000 }, [seg.buffer]);
    } else if (m.type === "refilter") {
      py.globals.set("spec", JSON.stringify(m.spec));
      const { fails, alone } = JSON.parse(py.runPython("sp = json.loads(spec); json.dumps(dict(fails=S.refilter(sp), alone=S.alone(sp)))"));
      post({ type: "filtered", fails, alone, seq: m.seq, ms: performance.now() - t0 });
    } else if (m.type === "memory") {
      // what Python holds after a collection: bytes in use by malloc, and live objects the collector
      // tracks; heap is the WebAssembly memory, which only ever grows to the high-water mark
      if (!py.globals.has("memory_use")) py.runPython(`
import ctypes, gc
class MallInfo(ctypes.Structure):
    _fields_ = [(n, ctypes.c_size_t) for n in 'arena ordblks smblks hblks hblkhd usmblks fsmblks uordblks fordblks keepcost'.split()]
libc = ctypes.CDLL(None); libc.mallinfo.restype = MallInfo
def memory_use():
    gc.collect()
    return json.dumps([libc.mallinfo().uordblks, len(gc.get_objects())])
`);
      const [used, objects] = JSON.parse(py.runPython("memory_use()"));
      post({ type: "memory", used, objects, heap: py._module.HEAPU8.byteLength });
    }
  };
}
