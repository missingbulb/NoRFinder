// Performance pass in the page's Pyodide: the times of loading it, opening the photo and finding its books, and the heap
// after the run (WebAssembly memory never shrinks, so the tab keeps it).
//   npm ci --prefix studies/shelves/reading
//   REPS=3 node studies/shelves/reading/perf_pyodide.mjs PHOTO [TEXTMAP.json] [OUT.json]
// REPS finds on the one opened photo (default 1) are timed one after the other; the shortest is the figure to quote.
// TEXTMAP.json: {text: {width, height, data}} as lab/perf.py's inputs hold it; left out, the page's own text finder runs
// first, as find.mjs does, and is timed. OUT.json: the boxes, to compare two runs.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { reader } from "../web/reading.js";

const [image, textFile, out] = process.argv.slice(2);
const here = import.meta.dirname, require = createRequire(path.join(here, "package.json"));
const study = JSON.parse(fs.readFileSync(path.join(here, "..", "study.json"), "utf8"));
const times = {}, t0 = performance.now();
const lap = (name) => { times[name] = ((performance.now() - t0) / 1000 - Object.values(times).reduce((a, b) => a + b, 0)); };
const { loadPyodide } = require("pyodide");
const py = await loadPyodide();
await py.loadPackage(study.python.packages, { messageCallback: () => {} });
lap("load");
for (const dir of study.python.paths) for (const f of fs.readdirSync(path.join(here, "..", dir)).filter((f) => f.endsWith(".py")))
  py.FS.writeFile("/home/pyodide/" + f, fs.readFileSync(path.join(here, "..", dir, f)));
py.FS.writeFile("/home/pyodide/photo" + path.extname(image), fs.readFileSync(image));
py.runPython(`import json, shelves; session = shelves.Session('photo${path.extname(image)}')`);
lap("open");
if (textFile) py.globals.set("text", JSON.stringify(JSON.parse(fs.readFileSync(textFile, "utf8")).text));
else {
  const assets = path.join(here, "node_modules", "@gutenye", "ocr-models", "assets");
  const r = reader({
    Tesseract: async () => require("tesseract.js"), ort: async () => require("onnxruntime-web"), langPath: path.join(here, "..", "web", "tessdata"), tesseract: {},
    model: async (name) => fs.readFileSync(path.join(assets, name)), keys: async () => fs.readFileSync(path.join(assets, "ppocr_keys_v1.txt"), "utf8"), words: async () => "",
  });
  const [vm, vb] = py.runPython("session.call('view', {})").toJs();
  const { width, height } = JSON.parse(vm);
  py.globals.set("text", JSON.stringify(await r.textMap({ width, height, data: vb })));
  await r.close();
  lap("text finder");
}
const heapBefore = py._module.HEAPU8.length;
lap("setup");
let books;
const finds = [];
for (let i = 0; i < Number(process.env.REPS || 1); i++) {
  const t = performance.now();
  books = JSON.parse(py.runPython("session.call('find', dict(text=json.loads(text)))[0]")).books;
  finds.push((performance.now() - t) / 1000);
}
lap("find");
times.find = finds[0];
const heap = py._module.HEAPU8.length;
if (out) fs.writeFileSync(out, JSON.stringify({ image: path.basename(image), books }));
const fixed = (x) => x.toFixed(1) + " s";
console.log(`${path.basename(image)}: ${books.length} boxes; ` + Object.entries(times).map(([k, v]) => `${k} ${fixed(v)}`).join(", ")
  + (finds.length > 1 ? ` (finds ${finds.map(fixed).join(", ")}; shortest ${fixed(Math.min(...finds))})` : "")
  + `; total ${fixed((performance.now() - t0) / 1000)}; heap ${(heapBefore / 2 ** 20).toFixed(0)} -> ${(heap / 2 ** 20).toFixed(0)} MB`);
