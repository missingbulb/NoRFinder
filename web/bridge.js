// The page's requests, answered by the study's Python (its study.json entry, imported as `study`) inside a
// Pyodide runtime that has already imported it and json. The worker runs it; the tests drive it outside a
// browser. It knows none of the study's actions: it opens a file with study.Session and forwards every call.
// Messages in: open {name, bytes}, call {action, args, echo}, close (the image open is let go), memory.
// Messages out: progress {text}, opened {meta, images}, result {action, meta, bytes, echo},
// memory {used, heap, objects}.
// progress: the status line for each step while it runs, {open, <action>: text}, from study.json.
export function bridge(py, post, progress = {}) {
  const say = (text) => text && post({ type: "progress", text });
  // a (JSON text, bytes or None) pair from Python, its handle destroyed: a handle to a Python object keeps
  // it alive until it is destroyed, whatever JavaScript collects
  const pair = (r) => {
    const meta = JSON.parse(r.get(0)), b = r.get(1);
    let bytes = null;
    if (b != null) { bytes = b.toJs(); b.destroy(); }
    r.destroy();
    return { meta, bytes };
  };
  return function answer(m) {
    const t0 = performance.now();
    if (m.type === "open") {
      say(progress.open || "Reading the image…");
      const path = "/tmp/" + m.name.replace(/[^\w.\-]/g, "_");
      py.FS.writeFile(path, new Uint8Array(m.bytes));
      py.globals.set("path", path);
      // the file is read once; kept, every image opened would stay in the worker's memory
      let r;
      try { r = py.runPython("S = study.Session(path); S.opened()"); } finally { py.FS.unlink(path); }
      const { meta, bytes } = pair(r);
      post({ type: "opened", meta, images: bytes, secs: (performance.now() - t0) / 1000 }, [bytes.buffer]);
    } else if (m.type === "call") {
      say(progress[m.action]);
      py.globals.set("action", m.action);
      py.globals.set("args", JSON.stringify(m.args ?? {}));
      const { meta, bytes } = pair(py.runPython("S.call(action, json.loads(args))"));
      post({ type: "result", action: m.action, meta, bytes, echo: m.echo, secs: (performance.now() - t0) / 1000 }, bytes ? [bytes.buffer] : []);
    } else if (m.type === "close") {
      py.runPython("globals().pop('S', None)");
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
