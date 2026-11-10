import { WORDS } from "../web/reading.js";
// A stand-in Tesseract for the Bookshelf Reader's page tests, and the reader it is kept as: the real one comes from a
// CDN the tests do not reach. It reads the BMP's own width and height: "Title <w>x<h>", 90% sure across, 20% sure up
// or down. It counts what it is asked in window.tess: the languages each worker was made for, and the crops read.
export const TESSERACT = `const tess = (globalThis.tess = { langs: [], reads: 0 });
export default { createWorker: async (langs) => (tess.langs.push(langs.join("+")), {
  setParameters: async () => {},
  recognize: async (b) => { tess.reads++; const v = new DataView(b.buffer, b.byteOffset); const w = v.getInt32(18, true), h = v.getInt32(22, true);
    return { data: { text: "Title " + w + "x" + h + "\\n", confidence: w > h ? 90 : 20 } }; },
  terminate: async () => {},
}) };`;
// the browser keys that choose it
export const seed = { "shelves-reader": JSON.stringify("tesseract") };
// A stand-in onnxruntime-web for the text finder Find books runs: every pixel half text. It counts the runs in
// window.textRuns.
export const ORT = `globalThis.textRuns = 0;
export const env = { wasm: {} };
export class Tensor { constructor(type, data, dims) { Object.assign(this, { type, data, dims }); } }
export const InferenceSession = { create: async () => ({ inputNames: ["x"], outputNames: ["y"],
  run: async (feeds) => { globalThis.textRuns++; const [, , h, w] = feeds.x.dims; return { y: { data: new Float32Array(h * w).fill(0.5) } }; } }) };`;
const CDN = "https://cdn.jsdelivr.net/npm/";
// ctx: a browser context, its CDN requests for Tesseract and for the text finder answered by the stand-ins; with
// textFinder false, the text finder's never answered, as when it cannot be reached
export const prepare = async (ctx, { textFinder = true } = {}) => {
  await ctx.route(CDN + "tesseract.js@7.0.0/dist/tesseract.esm.min.js", (r) => r.fulfill({ contentType: "text/javascript", body: TESSERACT }));
  // the subtitle word list the readings are spelled by, a stand-in of two words
  await ctx.route(WORDS.list, (r) => r.fulfill({ contentType: "text/plain", body: "את 100\nלא 90\n" }));
  if (!textFinder) return;
  await ctx.route(CDN + "onnxruntime-web@1.31.1/dist/ort.wasm.min.mjs", (r) => r.fulfill({ contentType: "text/javascript", body: ORT }));
  await ctx.route(CDN + "@gutenye/ocr-models@1.4.2/assets/ch_PP-OCRv4_det_infer.onnx", (r) => r.fulfill({ contentType: "application/octet-stream", body: Buffer.alloc(8) }));
};
