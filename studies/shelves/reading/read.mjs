// The Bookshelf Reader's readers in the sandbox: the books of one photo straightened by the study's own Python, then
// read by the page's own reading.js with the same engine builds, so a score here is the page's score.
//   npm ci --prefix studies/shelves/reading
//   node studies/shelves/reading/read.mjs IMAGE BOOKS.json|find[:VERSION] READER|none [OUT.json]
// BOOKS.json: {books: [{corners}]}, as a ground-truth file has them, or find for the finder's own (find:r5 for that
// version, py/finders.py's VERSIONS); READER: tesseract, lines or ppocr, or none to find the books and read nothing.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { reader, WORDS } from "../web/reading.js";

const [image, booksFile, how, out] = process.argv.slice(2);
const here = import.meta.dirname, require = createRequire(path.join(here, "package.json"));
// the study's Python on the page's own Pyodide build: a photo decodes to the same pixels as in the page, which the
// container's own Pillow does not promise for a JPEG
const study = JSON.parse(fs.readFileSync(path.join(here, "..", "study.json"), "utf8"));
const { loadPyodide } = require("pyodide");
const py = await loadPyodide();
await py.loadPackage(study.python.packages, { messageCallback: () => {} });
for (const dir of study.python.paths) for (const f of fs.readdirSync(path.join(here, "..", dir)).filter((f) => f.endsWith(".py")))
  py.FS.writeFile("/home/pyodide/" + f, fs.readFileSync(path.join(here, "..", dir, f)));
py.FS.writeFile("/home/pyodide/photo" + path.extname(image), fs.readFileSync(image));
py.runPython(`import importlib, json, finders, shelves; session = shelves.Session('photo${path.extname(image)}')`);

const assets = path.join(here, "node_modules", "@gutenye", "ocr-models", "assets");
const r = reader({
  Tesseract: async () => require("tesseract.js"), ort: async () => require("onnxruntime-web"), langPath: path.join(here, "..", "web", "tessdata"), tesseract: {},
  model: async (name) => fs.readFileSync(path.join(assets, name)), keys: async () => fs.readFileSync(path.join(assets, "ppocr_keys_v1.txt"), "utf8"),
  words: async () => [await (await fetch(WORDS.list)).text(), fs.readFileSync(path.join(here, "..", "web", WORDS.names), "utf8")].join("\n"),
});
// found as the page finds them: the text finder over Python's view of the photo, its map handed to the finder
let books;
if (booksFile.split(":")[0] === "find") {
  py.globals.set("version", booksFile.split(":")[1] || py.runPython("finders.DEFAULT"));
  py.globals.set("text", "");
  if (py.runPython("importlib.import_module(finders.VERSIONS[version]).READS_TEXT")) {
    const [vm, vb] = py.runPython("session.call('view', {})").toJs();
    const { width, height } = JSON.parse(vm);
    py.globals.set("text", JSON.stringify(await r.textMap({ width, height, data: vb })));
  }
  books = JSON.parse(py.runPython("session.call('find', dict(algorithm=version, text=json.loads(text) if text else None))[0]")).books;
} else books = JSON.parse(fs.readFileSync(booksFile, "utf8")).books;
if (how === "none") {
  await r.close();
  const doc = JSON.stringify({ image: path.basename(image), books }, null, 1);
  if (out) fs.writeFileSync(out, doc); else console.log(doc);
  process.exit(0);
}
py.globals.set("corners", JSON.stringify(books.map((b) => b.corners)));
const [meta, bytes] = py.runPython("session.call('straighten', dict(corners=json.loads(corners)))").toJs();
const { sizes } = JSON.parse(meta);
let at = 0;
const crops = sizes.map(([width, height]) => { const data = new Uint8ClampedArray(bytes.subarray(at, at + width * height * 4)); at += width * height * 4; return { width, height, data }; });
const read = [];
for (const [i, c] of crops.entries()) read.push({ ...books[i], ...(await r.read(c, how)), reader: how });
await r.close();
const doc = JSON.stringify({ image: path.basename(image), books: read }, null, 1);
if (out) fs.writeFileSync(out, doc); else console.log(doc);
