// Reading a book's title from its straightened crop, the same in the page and in the sandbox: what differs is only how
// the engines and their files are reached, which the caller hands in. A crop is {width, height, data}, RGBA.
//
// Three readers, kept side by side until the ground truth picks between them:
//   tesseract   Tesseract (Hebrew and English) on the whole crop, at each turn the book's shape allows
//   lines       PaddleOCR's text finder marks the lines of text, then Tesseract reads each line
//   ppocr       PaddleOCR finds and reads the lines itself; its reader knows Chinese and English, not Hebrew
//
// engines: {Tesseract() and ort(): the tesseract.js module and onnxruntime-web, each loaded once a reader needs it, langPath: where heb and eng .traineddata.gz sit,
// tesseract: options for its worker (workerPath, corePath), model(name): an ONNX model's bytes, keys(): the PP-OCR
// reader's character list, as text, words(): the Hebrew word list readings are spelled by, as text (words/heb.txt)}
export const READERS = {
  tesseract: "Tesseract",
  lines: "Paddle lines + Tesseract",
  ppocr: "PP-OCR (English only)",
};
// the languages a book may be read in, by Tesseract's names: both, or the one the tagger says the title is in
export const LANGS = { both: ["heb", "eng"], heb: ["heb"], eng: ["eng"] };
export const MODELS = { find: "ch_PP-OCRv4_det_infer.onnx", read: "ch_PP-OCRv4_rec_infer.onnx", keys: "ppocr_keys_v1.txt" };

// k quarter turns clockwise
export function rotate(im, k) {
  k = ((k % 4) + 4) % 4;
  if (!k) return im;
  const { width: w, height: h, data } = im, W = k === 2 ? w : h, H = k === 2 ? h : w, out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = k === 1 ? h - 1 - y : k === 2 ? w - 1 - x : y, Y = k === 1 ? x : k === 2 ? h - 1 - y : w - 1 - x, s = (y * w + x) * 4, d = (Y * W + X) * 4;
    out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3];
  }
  return { width: W, height: H, data: out };
}
export function cut(im, x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0, out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) out.set(im.data.subarray(((y0 + y) * im.width + x0) * 4, ((y0 + y) * im.width + x1) * 4), y * w * 4);
  return { width: w, height: h, data: out };
}
// the crop as a 24-bit BMP, the one encoded form both Tesseract builds read the same way
export function bmp({ width: w, height: h, data }) {
  const row = (w * 3 + 3) & ~3, size = 54 + row * h, b = new Uint8Array(size), v = new DataView(b.buffer);
  b[0] = 66; b[1] = 77; v.setUint32(2, size, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true);
  v.setInt32(18, w, true); v.setInt32(22, h, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, row * h, true);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4, d = 54 + (h - 1 - y) * row + x * 3;
    b[d] = data[s + 2]; b[d + 1] = data[s + 1]; b[d + 2] = data[s];
  }
  return b;
}
// the turns at which a crop's text may read across: a tall crop's runs up or down its length, a wide one's across it
// or upside down
export const turns = ({ width, height }) => (height > width ? [1, 3] : [0, 2]);
const best = (tries) => tries.reduce((a, b) => (b.confidence > a.confidence ? b : a));
const tidy = (t) => t.replace(/\s+/g, " ").trim();

// Hebrew letters print makes look alike, each set a reader confuses one for another; and the letters a word may be
// prefixed with
const LOOK_ALIKE = ["בכנ", "דרך", "החת", "וזןי", "סםט", "גנ", "עצ"];
const PREFIXES = "והבכלמש";
// ו and י, the letters full spelling adds and defective spelling leaves out
const MATRES = "וי";
// a reading's Hebrew words set right by a word list, most frequent first ('#' lines aside): a word of three letters
// or more that is not on it, even with one or two prefix letters off, becomes the most frequent listed word one
// look-alike letter, or one ו or י more or fewer, away, or stays as read; a final letter read inside a run of letters
// ends a word there
export function spelling(list) {
  const rank = new Map();
  for (const w of list.split("\n")) if (w && !w.startsWith("#") && !rank.has(w)) rank.set(w, rank.size);
  const listed = (w) => {
    if (rank.has(w)) return 1 / (1 + rank.get(w));
    for (const k of [1, 2]) {
      const rest = w.slice(k);
      if (rest.length > 1 && [...w.slice(0, k)].every((c) => PREFIXES.includes(c)) && rank.has(rest)) return 0.1 / (1 + rank.get(rest));
    }
    return 0;
  };
  const alike = (c) => LOOK_ALIKE.filter((g) => g.includes(c)).join("").replaceAll(c, "");
  const word = (w) => {
    if (w.length < 3 || listed(w)) return w;
    const near = [];
    for (let i = 0; i < w.length; i++) for (const c of alike(w[i])) near.push(w.slice(0, i) + c + w.slice(i + 1));
    for (let i = 1; i < w.length; i++) {
      for (const c of MATRES) near.push(w.slice(0, i) + c + w.slice(i));
      if (MATRES.includes(w[i])) near.push(w.slice(0, i) + w.slice(i + 1));
    }
    let to = w, most = 0;
    for (const v of near) { const f = listed(v); if (f > most) [to, most] = [v, f]; }
    return to;
  };
  return (text) => text.replace(/[א-ת]+/g, (run) => run.split(/(?<=[ךםןףץ])(?=[א-ת])/).map(word).join(" "));
}

export function reader(engines) {
  let ort = null, find = null, read = null, keys = null, spell = null;
  const tess = {};
  // a worker for each set of languages, made the first time a book is read in it
  const tesseract = (lang) => (tess[lang] ||= engines.Tesseract().then((T) => T.createWorker(LANGS[lang], 1, { ...engines.tesseract, langPath: engines.langPath, cacheMethod: "none", gzip: true })
    .then(async (w) => { await w.setParameters({ preserve_interword_spaces: "1" }); return w; })));
  const session = (name) => Promise.all([ort, engines.model(name)]).then(([o, bytes]) => o.InferenceSession.create(bytes, { executionProviders: ["wasm"] }));
  // the text finder alone, for Find books; and with the PP-OCR reader, for reading
  const finder = async () => {
    ort ||= engines.ort().then((o) => { o.env.wasm.numThreads = 1; return o; });
    find ||= session(MODELS.find);
    // either failing, both are asked for afresh the next time
    try { const [o, f] = await Promise.all([ort, find]); return { ort: o, find: f }; } catch (e) { ort = find = null; throw e; }
  };
  const paddle = async () => {
    const f = await finder();
    read ||= session(MODELS.read);
    keys ||= engines.keys().then((t) => [...t.replace(/\r/g, "").split("\n").filter((k, i, all) => k || i < all.length - 1), " "]);
    return { ...f, read: await read, keys: await keys };
  };
  // the text finder's probability that each pixel is text, over an image W×H (multiples of 32), sampled from im
  async function textAt(im, W, H) {
    const { ort, find } = await finder();
    const x = new Float32Array(3 * W * H), mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225], n = im.data.length / (im.width * im.height);
    for (let y = 0; y < H; y++) for (let X = 0; X < W; X++) {
      const sx = Math.min(im.width - 1, Math.floor(((X + 0.5) * im.width) / W)), sy = Math.min(im.height - 1, Math.floor(((y + 0.5) * im.height) / H)), p = (sy * im.width + sx) * n;
      // the model was trained on blue, green, red, normalised channel by channel in that order
      for (let c = 0; c < 3; c++) x[c * W * H + y * W + X] = (im.data[p + 2 - c] / 255 - mean[c]) / std[c];
    }
    const out = await find.run({ [find.inputNames[0]]: new ort.Tensor("float32", x, [1, 3, H, W]) });
    return out[find.outputNames[0]].data;
  }

  async function tesseractAt(im, turn, lang) {
    const w = await tesseract(lang), { data } = await w.recognize(bmp(rotate(im, turn)));
    return { text: tidy(data.text), confidence: data.confidence / 100, turn };
  }

  // PaddleOCR's text finder over a crop turned so its text reads across: the lines, as boxes in its pixels, top first
  async function lines(im) {
    const s = Math.min(1, 960 / Math.max(im.width, im.height));
    const W = Math.max(32, Math.round((im.width * s) / 32) * 32), H = Math.max(32, Math.round((im.height * s) / 32) * 32);
    const prob = await textAt(im, W, H), on = new Uint8Array(W * H);
    for (let i = 0; i < on.length; i++) on[i] = prob[i] > 0.3;
    const seen = new Int32Array(W * H).fill(-1), boxes = [];
    for (let i = 0; i < on.length; i++) {
      if (!on[i] || seen[i] >= 0) continue;
      let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0, sum = 0;
      const stack = [i]; seen[i] = boxes.length;
      while (stack.length) {
        const j = stack.pop(), jx = j % W, jy = (j - jx) / W;
        n++; sum += prob[j]; x0 = Math.min(x0, jx); x1 = Math.max(x1, jx); y0 = Math.min(y0, jy); y1 = Math.max(y1, jy);
        for (const k of [jx > 0 ? j - 1 : -1, jx < W - 1 ? j + 1 : -1, jy > 0 ? j - W : -1, jy < H - 1 ? j + W : -1])
          if (k >= 0 && on[k] && seen[k] < 0) { seen[k] = boxes.length; stack.push(k); }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (sum / n < 0.6 || Math.min(bw, bh) < 3) continue;
      // the finder marks a line's core; it is grown back by the area over the perimeter, times 1.5
      const d = (bw * bh * 1.5) / (2 * (bw + bh));
      const fx = im.width / W, fy = im.height / H;
      boxes.push([Math.max(0, Math.floor((x0 - d) * fx)), Math.max(0, Math.floor((y0 - d) * fy)),
        Math.min(im.width, Math.ceil((x1 + 1 + d) * fx)), Math.min(im.height, Math.ceil((y1 + 1 + d) * fy))]);
    }
    return boxes.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  }

  // PaddleOCR's reader on one line: its text and its mean certainty
  async function ppocrLine(im) {
    const { ort, read, keys } = await paddle();
    const H = 48, W = Math.min(3200, Math.max(16, Math.ceil((H * im.width) / im.height))), x = new Float32Array(3 * W * H);
    for (let y = 0; y < H; y++) for (let X = 0; X < W; X++) {
      const sx = Math.min(im.width - 1, Math.floor(((X + 0.5) * im.width) / W)), sy = Math.min(im.height - 1, Math.floor(((y + 0.5) * im.height) / H)), p = (sy * im.width + sx) * 4;
      for (let c = 0; c < 3; c++) x[c * W * H + y * W + X] = (im.data[p + 2 - c] / 255 - 0.5) / 0.5;
    }
    const out = (await read.run({ [read.inputNames[0]]: new ort.Tensor("float32", x, [1, 3, H, W]) }))[read.outputNames[0]];
    const [, T, C] = out.dims, p = out.data;
    let text = "", last = 0, sure = 0, n = 0;
    for (let t = 0; t < T; t++) {
      let k = 0;
      for (let c = 1; c < C; c++) if (p[t * C + c] > p[t * C + k]) k = c;
      if (k && k !== last) { text += keys[k - 1] ?? ""; sure += p[t * C + k]; n++; }
      last = k;
    }
    return { text: tidy(text), confidence: n ? sure / n : 0 };
  }

  // each line upright: the turn of the two that reads with more certainty, or the one turn the book is known to be
  // upright at
  async function byLines(im, readLine, at) {
    const found = [];
    for (const turn of at ?? turns(im)) {
      const up = rotate(im, turn), parts = [];
      for (const [x0, y0, x1, y1] of await lines(up)) {
        const line = cut(up, x0, y0, x1, y1);
        parts.push(best(await Promise.all((at ? [0] : [0, 2]).map(async (t) => ({ ...(await readLine(rotate(line, t))), t })))));
      }
      const chars = parts.reduce((a, p) => a + p.text.length, 0);
      found.push({ text: tidy(parts.map((p) => p.text).join(" ")), turn, lines: parts.length,
        confidence: chars ? parts.reduce((a, p) => a + p.confidence * p.text.length, 0) / chars : 0 });
    }
    return best(found);
  }

  async function readAs(im, how, { turn = null, lang = "both" } = {}) {
    const at = turn == null ? null : [turn];
    if (how === "tesseract") return best(await Promise.all((at ?? turns(im)).map((t) => tesseractAt(im, t, lang))));
    if (how === "lines") return byLines(im, async (line) => { const r = await tesseractAt(line, 0, lang); return { text: r.text, confidence: r.confidence }; }, at);
    if (how === "ppocr") return byLines(im, ppocrLine, at);
    throw new Error(`no reader "${how}"`);
  }

  return {
    // the text over a whole photo as Python's view gives it ({width, height, data}, RGB, sides multiples of 32): its
    // probability per pixel, 255 for 1, base64, as the finder takes it ({width, height, data})
    async textMap(view) {
      const p = await textAt(view, view.width, view.height), b = new Uint8Array(p.length);
      for (let i = 0; i < p.length; i++) b[i] = Math.round(Math.min(1, Math.max(0, p[i])) * 255);
      let bin = "";
      for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
      return { width: view.width, height: view.height, data: btoa(bin) };
    },
    // the crop's text by one reader: {text, confidence (0 to 1), turn (quarter turns clockwise that set it upright)};
    // given a turn, it is read upright at that turn alone, and given a lang (a key of LANGS), in those languages alone
    // (PP-OCR reads English whatever it is given), its Hebrew words spelled by the word list
    async read(im, how, opts = {}) {
      spell ||= engines.words().then(spelling).catch((e) => { spell = null; throw e; });
      const [r, s] = await Promise.all([readAs(im, how, opts), spell]);
      return { ...r, text: s(r.text) };
    },
    async close() { for (const k in tess) { await (await tess[k]).terminate(); delete tess[k]; } },
  };
}
