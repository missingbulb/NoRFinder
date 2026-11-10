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
// ctx: a browser context, its CDN request for Tesseract answered by the stand-in
export const prepare = (ctx) => ctx.route("https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js", (r) => r.fulfill({ contentType: "text/javascript", body: TESSERACT }));
