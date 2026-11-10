// The Bookshelf Reader's page: the books found on a photo of shelves, each a four-cornered box with its view (spine or
// cover) and the title read from it, and, while ground truth is made, one task that takes each book in turn, in the
// order they stand, its corners, its turn and its text set right, and adds the books the finder missed.
import { reader, rotate, READERS, MODELS, WORDS } from "./reading.js";

const CDN = "https://cdn.jsdelivr.net/npm/";
const TESSERACT = CDN + "tesseract.js@7.0.0/dist/", CORE = CDN + "tesseract.js-core@7.0.0", ORT = CDN + "onnxruntime-web@1.31.1/dist/";
const MODEL_FILES = CDN + "@gutenye/ocr-models@1.4.2/assets/";
const READER = "shelves-reader"; // the reader last chosen, by its key in READERS
const SVG = "http://www.w3.org/2000/svg";

// the engines, from the pinned builds the sandbox runs too (studies/shelves/reading/package.json)
function engines() {
  const bytes = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return new Uint8Array(await r.arrayBuffer()); };
  return {
    Tesseract: () => import(TESSERACT + "tesseract.esm.min.js").then((m) => m.default),
    ort: () => import(ORT + "ort.wasm.min.mjs").then((o) => { o.env.wasm.wasmPaths = ORT; return o; }), langPath: new URL("tessdata", import.meta.url).href,
    tesseract: { workerPath: TESSERACT + "worker.min.js", corePath: CORE },
    model: (name) => bytes(MODEL_FILES + name), keys: async () => new TextDecoder().decode(await bytes(MODEL_FILES + MODELS.keys)),
    words: async () => (await Promise.all([WORDS.list, new URL(WORDS.names, import.meta.url).href].map(async (u) => new TextDecoder().decode(await bytes(u))))).join("\n"),
  };
}

// the longest side of a book's picture in the task, in its pixels
const PICTURE = 640;

// the homography taking four points onto four others, as a 3×3 matrix by rows
function homography(from, to) {
  const A = [];
  from.forEach(([x, y], i) => {
    const [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  for (let c = 0; c < 8; c++) {
    let r = c;
    for (let k = c + 1; k < 8; k++) if (Math.abs(A[k][c]) > Math.abs(A[r][c])) r = k;
    [A[c], A[r]] = [A[r], A[c]];
    for (let k = 0; k < 8; k++) if (k !== c) { const f = A[k][c] / A[c][c]; for (let j = c; j < 9; j++) A[k][j] -= f * A[c][j]; }
  }
  return [...A.map((row, i) => row[8] / A[i][i]), 1];
}
// the photo as the viewer shows it (a canvas of the image's size), through a book's corners into an upright picture
// as wide as its top and bottom edges and as tall as its sides, on average, at most PICTURE long; black off the photo
export function picture(photo, corners) {
  const side = (a, b) => Math.hypot(corners[a][0] - corners[b][0], corners[a][1] - corners[b][1]);
  const w0 = Math.max(1, (side(0, 1) + side(3, 2)) / 2), h0 = Math.max(1, (side(0, 3) + side(1, 2)) / 2), s = Math.min(1, PICTURE / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s)), out = new Uint8ClampedArray(w * h * 4);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(photo.width, Math.ceil(Math.max(...xs))), y1 = Math.min(photo.height, Math.ceil(Math.max(...ys)));
  if (x1 <= x0 || y1 <= y0) return { width: w, height: h, data: out };
  // only the part of the photo under the box, shrunk as the picture is, read back
  const rw = Math.max(1, Math.round((x1 - x0) * s)), rh = Math.max(1, Math.round((y1 - y0) * s));
  const part = new OffscreenCanvas(rw, rh), ctx = part.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(photo, x0, y0, x1 - x0, y1 - y0, 0, 0, rw, rh);
  const src = ctx.getImageData(0, 0, rw, rh).data, fx = rw / (x1 - x0), fy = rh / (y1 - y0);
  const M = homography([[0, 0], [w, 0], [w, h], [0, h]], corners), W = photo.width, H = photo.height;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x + 0.5, Y = y + 0.5, d = M[6] * X + M[7] * Y + M[8];
    const px = (M[0] * X + M[1] * Y + M[2]) / d, py = (M[3] * X + M[4] * Y + M[5]) / d;
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const sx = Math.min(rw - 1, Math.floor((px - x0) * fx)), sy = Math.min(rh - 1, Math.floor((py - y0) * fy));
    if (sx < 0 || sy < 0) continue;
    const a = (sy * rw + sx) * 4, b = (y * w + x) * 4;
    out[b] = src[a]; out[b + 1] = src[a + 1]; out[b + 2] = src[a + 2];
  }
  return { width: w, height: h, data: out };
}

// corners clockwise from the one nearest the photo's top left
function clockwise(pts) {
  const cx = pts.reduce((a, p) => a + p[0], 0) / 4, cy = pts.reduce((a, p) => a + p[1], 0) / 4;
  const round = [...pts].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  const first = round.reduce((k, p, i) => (p[0] + p[1] < round[k][0] + round[k][1] ? i : k), 0);
  return [...round.slice(first), ...round.slice(0, first)].map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
}
// the books in the order they stand on the photo: shelf by shelf from the top, each shelf left to right. A book is on
// the shelf of the first book there while the two overlap in height by half the shorter's
export function inPlace(list) {
  const span = (b) => { const ys = b.corners.map((p) => p[1]); return [Math.min(...ys), Math.max(...ys)]; };
  const mid = (b, k) => b.corners.reduce((a, p) => a + p[k], 0) / 4;
  const rows = [];
  for (const b of [...list].sort((a, c) => mid(a, 1) - mid(c, 1))) {
    const [t, f] = span(b), row = rows.find((r) => Math.min(f, r.f) - Math.max(t, r.t) > 0.5 * Math.min(f - t, r.f - r.t));
    if (row) row.books.push(b); else rows.push({ t, f, books: [b] });
  }
  return rows.flatMap((r) => r.books.sort((a, c) => mid(a, 0) - mid(c, 0)));
}
function inside([x, y], poly) {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) yes = !yes;
  }
  return yes;
}

export function mount(shell) {
  const $ = shell.$, st = shell.state, here = { signal: shell.signal };
  // books: [{corners, view, text, confidence, reader, turn, source: "found" | "missed", verdict: null | "right",
  // proposed: what the finder and the reader said, kept for scoring; while tagged, turnSet: the tagger set the turn,
  // typed: the tagger typed its text}]
  let books = [], cur = null, drawing = null, dragging = null, noneMissed = false, opened = false, selectFor = null;
  let ocr = null;
  const truth = () => shell.makesTruth;
  // the tagger tags now: a book is open, framed and its corners dragged only then (req/shell/ground-truth/tagging)
  const tagging = () => truth() && shell.tasks.tagging();
  // one task: every book, found or added, decided, and none left missed
  if (truth()) shell.tasks.list([{ key: "books", name: "Books", title: "Every book on the photo, each checked, the missed ones added" }], { submit, resume: (d) => resume(d), pick: () => { if (!cur) next(null); else draw(); },
    tagging: (on) => { if (!on) draw(); else if (cur) show(cur); else next(); } });
  const ocrNow = () => (ocr ||= reader(engines()));

  const choice = $("#bs-reader");
  choice.replaceChildren(...Object.entries(READERS).map(([k, name]) => Object.assign(document.createElement("option"), { value: k, textContent: name })));
  choice.value = shell.readJSON(READER, "lines") in READERS ? shell.readJSON(READER, "lines") : "lines";
  choice.onchange = () => shell.writeJSON(READER, choice.value);

  // ---------- the draft: the tagger's work on a photo and the book open, as data the shell keeps and hands back
  // (req/shell/ground-truth/draft) ----------
  const KEEP = ["corners", "view", "text", "confidence", "reader", "turn", "turnSet", "typed", "source", "verdict", "proposed"];
  function save() {
    if (!truth() || !opened) return;
    shell.tasks.draft({ books: books.map((b) => Object.fromEntries(KEEP.filter((k) => k in b).map((k) => [k, b[k]]))), noneMissed, open: books.indexOf(cur) });
  }
  function resume(d) {
    books = (d.books || []).map((b) => ({ ...b })); noneMissed = !!d.noneMissed; drawing = null;
    cur = books[d.open] ?? null;
    // a draft kept before Not a book took a box away holds it still
    books = books.filter((b) => b.verdict !== "wrong");
    if (!books.includes(cur)) cur = null;
    shell.step("find", true, `${books.length} books drafted`); shell.boxDone($("#bs-box"), `${books.length} books`);
    shell.step("read", true, `${books.filter((b) => b.text).length} of ${books.length} titles`);
    $("#bs-read").disabled = !books.length;
    if (!tagging()) draw(); else if (cur) show(cur); else next(null);
  }
  shell.clearable("books drafted", () => {});

  // ---------- Python: finding and straightening ----------
  // why the last Find ran without the text finder, or null when it ran with it
  let textless = null;
  // the photo's text, as the finder takes it: the text finder run on Python's own view of the photo
  async function textOf() {
    const run = python.then(async () => {
      const done = shell.until("result:view");
      shell.call("view", {});
      const m = await done;
      return { width: m.meta.width, height: m.meta.height, data: m.bytes };
    });
    python = run.catch(() => {});
    return ocrNow().textMap(await run);
  }
  $("#bs-find").onclick = async () => {
    shell.busy(true, "Finding the text…");
    let text = null;
    try { text = await textOf(); textless = null; } catch (e) { textless = String(e.message || e); console.warn("Find books without the text finder:", e); }
    const done = shell.until("result:find");
    shell.busy(true, "Finding the books…"); shell.call("find", text ? { text } : {});
    await done;
    await readAll();
  };
  $("#bs-read").onclick = () => readAll();
  shell.slow($("#bs-find")); shell.slow($("#bs-read"));

  // the crops the reader reads, straightened by the study's Python from the photo's file, one request at a time
  let python = Promise.resolve();
  function straighten(list) {
    const run = python.then(async () => {
      const done = shell.until("result:straighten");
      shell.call("straighten", { corners: list.map((b) => b.corners) });
      const m = await done;
      let at = 0;
      return m.meta.sizes.map(([width, height]) => { const data = new Uint8ClampedArray(m.bytes.buffer, m.bytes.byteOffset + at, width * height * 4); at += width * height * 4; return { width, height, data }; });
    });
    python = run.catch(() => {});
    return run;
  }
  // each book in list straightened and read by the reader chosen
  async function readSome(list) {
    if (!list.length) return;
    const how = choice.value;
    shell.busy(true, "Straightening each book…");
    const got = await straighten(list);
    const r = ocrNow();
    for (const [i, b] of list.entries()) {
      shell.busy(true, `Reading ${i + 1} of ${list.length} with ${READERS[how]}…`);
      Object.assign(b, await r.read(got[i], how), { reader: how });
      b.proposed ||= { corners: b.corners.map((p) => [...p]), text: b.text };
      if (b.proposed.text === undefined) b.proposed.text = b.text;
    }
    shell.busy(false);
  }
  async function readAll() {
    await readSome(books);
    shell.step("read", true, `${books.filter((b) => b.text).length} of ${books.length} titles read with ${READERS[choice.value]}`);
    shell.status("Titles read.");
    if (tagging() && cur === null) next();
    draw();
  }
  // one book read again while it is tagged, the photo left in view: at the turn the tagger set; a later reading of
  // the same book replaces one still under way
  async function reread(b) {
    const gen = (b.gen = (b.gen || 0) + 1), how = choice.value;
    b.reading = true; draw(); shell.status("Reading the book again…");
    try {
      const [crop] = await straighten([b]);
      if (gen !== b.gen) return;
      const r = await ocrNow().read(crop, how, { turn: b.turnSet ? b.turn : null });
      if (gen !== b.gen) return;
      const typed = b.typed ? b.text : null;
      Object.assign(b, r, { reader: how });
      if (typed !== null) b.text = typed;
      save();
      shell.status("Book read again.");
    } finally { if (gen === b.gen) { b.reading = false; draw(); } }
  }

  // ---------- drawing on the photo ----------
  const layer = () => shell.viewer.layer("bs");
  const el = (tag, attrs) => { const n = document.createElementNS(SVG, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  function drawBoxes() {
    const g = layer(), pts = (b) => b.corners.map((p) => p.join(",")).join(" ");
    g.replaceChildren(...books.map((b) => {
      const k = el("g", { class: `bs-book ${b.view}${b === cur && (tagging() || !truth()) ? " current" : ""}${b.verdict ? " done" : ""}` });
      k.append(el("polygon", { class: "under", points: pts(b) }), el("polygon", { class: "over", points: pts(b) }));
      return k;
    }));
    if (cur && tagging()) g.append(...cur.corners.map((p, i) => el("circle", { class: "bs-corner", cx: p[0], cy: p[1], r: 7 / st.zoom, "data-corner": i })));
    if (drawing?.pts.length) g.append(el("polyline", { class: "bs-book current", points: drawing.pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: "#ffd400" }));
    // what is approved, cut out of the photo by the viewer while the tagger tags
    if (truth()) shell.viewer.doneMask?.(books.filter((b) => b.verdict === "right").map((b) => b.corners));
  }
  function draw() { drawBoxes(); list(); tasks(); }

  // the titles, outside ground truth: what the matcher is sent
  function list() {
    $("#bs-found").textContent = books.length ? `${books.length} books: ${books.filter((b) => b.view === "spine").length} spines, ${books.filter((b) => b.view === "cover").length} covers.` : "";
    if (truth()) return;
    $("#bs-list").replaceChildren(...books.map((b) => {
      const li = document.createElement("li"); li.className = b === cur ? "current" : "";
      li.innerHTML = `<span class="bs-text" dir="auto"></span>`; li.querySelector(".bs-text").textContent = b.text || "";
      li.title = `${b.view}${b.confidence != null ? `, ${Math.round(b.confidence * 100)}% sure` : ""}`;
      li.onclick = () => { cur = b; focus(b); draw(); };
      return li;
    }));
    $("#bs-export").disabled = !books.length;
  }
  $("#bs-export").onclick = () => {
    const name = st.fileName.replace(/\.[^.]*$/, "");
    shell.saveFile(name + "_books.json", JSON.stringify(matcherDoc(), null, 1), "application/json");
  };
  // what the database matcher is sent: each book's text, where it is, and how sure the reading is
  const matcherDoc = () => ({ image: st.fileName, W: st.W, H: st.H,
    books: books.map((b, i) => ({ id: i + 1, view: b.view, text: b.text ?? "", confidence: b.confidence ?? null, reader: b.reader ?? null, corners: b.corners })) });
  // the book framed in the view: zoomed to fill most of it, unless already close to that, and in its middle
  function focus(b) {
    const xs = b.corners.map((p) => p[0]), ys = b.corners.map((p) => p[1]), sc = $("#scroller");
    const w = Math.max(...xs) - Math.min(...xs) || 1, h = Math.max(...ys) - Math.min(...ys) || 1;
    const fit = Math.min(8, 0.7 * Math.min(sc.clientWidth / w, sc.clientHeight / h));
    if (st.zoom > fit * 1.5 || st.zoom < fit / 1.5) shell.viewer.setZoom(fit);
    shell.viewer.focus((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
  }
  // any part of the book's box on the screen
  function inView(b) {
    const v = $("#scroller").getBoundingClientRect(), r = $("#base").getBoundingClientRect();
    const xs = b.corners.map((p) => r.left + p[0] * st.zoom), ys = b.corners.map((p) => r.top + p[1] * st.zoom);
    return Math.max(...xs) > v.left && Math.min(...xs) < v.right && Math.max(...ys) > v.top && Math.min(...ys) < v.bottom;
  }

  // ---------- the ground truth: every book in the order they stand, then the missed ones, then Submit ----------
  const walk = () => inPlace(books);
  const open = () => books.filter((b) => !b.verdict);
  // a book made the open one: a title not yet approved is selected, to retype; while tagging, the spot Continue GT
  // tagging comes back to
  function show(b, keepView = false) { cur = b; selectFor = b && b.verdict !== "right" ? b : null; if (b && !keepView) focus(b); if (tagging() && books.length) save(); draw(); }
  // the next book still open along the shelves after this one, round to the first; none once every book is decided
  function next(after = cur) {
    const all = walk(), from = all.indexOf(after);
    show([...all.slice(from + 1), ...all.slice(0, from + 1)].find((b) => !b.verdict) || null);
  }
  // Back and Next: the book beside this one along the shelves, whatever its verdict
  function step(by) {
    const all = walk();
    if (!all.length) return;
    const at = cur ? all.indexOf(cur) : by > 0 ? -1 : 0;
    show(all[(at + by + all.length) % all.length]);
  }
  function verdict(v) {
    if (!cur) return;
    if (v === "wrong") return remove(cur);
    cur.verdict = v; save();
    next();
  }
  function tasks() {
    if (!truth()) return;
    const all = books, decided = all.length - open().length;
    shell.tasks.count("books", decided, all.length, all.length > 0 && !open().length && noneMissed);
    const row = shell.tasks.row("books")?.querySelector(".task-body");
    // the title being typed keeps its place while the book is drawn again
    const typing = document.activeElement?.closest?.(".bs-item input") ? { s: document.activeElement.selectionStart, e: document.activeElement.selectionEnd } : null;
    row?.replaceChildren();
    const now = shell.tasks.open(tagging() ? "books" : null);
    if (now) {
      const box = cur ? item(cur) : missedTools();
      now.querySelector(".task-body").append(box);
      const t = box.querySelector("input");
      if (t && selectFor === cur) { selectFor = null; requestAnimationFrame(() => { if (t.isConnected) { t.focus({ preventScroll: true }); t.select(); } }); }
      else if (t && typing) { t.focus({ preventScroll: true }); t.setSelectionRange(typing.s, typing.e); }
    }
    shell.tasks.ready(!!(all.length && !open().length && noneMissed));
  }
  // the book's picture in the task, drawn here from the photo the viewer shows, at the book's turn
  function paint(cv, b) {
    if (!st.plain) { cv.hidden = true; return; }
    const up = rotate(picture(st.plain, b.corners), b.turn || 0);
    cv.width = up.width; cv.height = up.height; cv.getContext("2d").putImageData(new ImageData(up.data, up.width, up.height), 0, 0);
  }
  let painting = 0;
  const repaint = () => {
    cancelAnimationFrame(painting);
    painting = requestAnimationFrame(() => { const cv = document.querySelector(".bs-item canvas"); if (cv && cur) paint(cv, cur); });
  };
  function flip(b) { b.turn = ((b.turn || 0) + 2) % 4; b.turnSet = true; save(); draw(); reread(b); }
  // the book on show: its picture, Flip, its text and the verdict
  function item(b) {
    const box = document.createElement("div"); box.className = "bs-item";
    box.innerHTML = `<div class="bs-tools"><a data-do="back">Back</a><a data-do="next">Next</a></div><canvas></canvas>
      <div class="bs-row"><button type="button" data-do="flip" title="Turn the picture upside down">Flip</button></div>
      <input type="text" dir="auto" placeholder="The title, as printed" aria-label="Title"><p class="bs-reading dim" hidden>Reading again…</p>
      <div class="bs-verdicts"><button type="button" class="primary" data-do="right">Right</button><button type="button" data-do="wrong">Not a book</button></div>`;
    paint(box.querySelector("canvas"), b);
    box.querySelector('[data-do="flip"]').onclick = () => flip(b);
    box.querySelector(".bs-reading").hidden = !b.reading;
    const t = box.querySelector("input"); t.value = b.text || ""; t.oninput = () => { b.text = t.value; b.typed = true; save(); };
    for (const v of ["right", "wrong"]) {
      const k = box.querySelector(`[data-do="${v}"]`);
      k.setAttribute("aria-pressed", String(b.verdict === v)); k.onclick = () => verdict(v);
    }
    box.querySelector('[data-do="next"]').onclick = () => step(1);
    box.querySelector('[data-do="back"]').onclick = () => step(-1);
    return box;
  }
  function missedTools() {
    const box = document.createElement("div");
    box.innerHTML = `<p class="hint">Right-click the photo where a book was missed: Add a book here.</p>
      <div class="bs-verdicts"><button type="button" data-do="draw">Draw a book</button><button type="button" data-do="none">${noneMissed ? "Done" : "None missed"}</button></div>`;
    box.querySelector('[data-do="draw"]').onclick = startDrawing;
    box.querySelector('[data-do="none"]').onclick = () => { noneMissed = true; save(); draw(); };
    return box;
  }
  function startDrawing() {
    drawing = { pts: [] };
    $("#scroller").classList.add("bs-drawing"); $("#bs-draw-hint").hidden = false; draw();
  }
  function endDrawing() { drawing = null; $("#scroller").classList.remove("bs-drawing"); $("#bs-draw-hint").hidden = true; draw(); }
  const shape = (corners) => { const [a, b, , d] = corners; return Math.hypot(d[0] - a[0], d[1] - a[1]) > Math.hypot(b[0] - a[0], b[1] - a[1]) ? "spine" : "cover"; };
  // a book the finder missed: one more book on the photo, open now and read
  function added(corners) {
    const b = { corners: clockwise(corners), source: "missed", verdict: null, proposed: null };
    b.view = shape(b.corners); noneMissed = false;
    books.push(b); save(); show(b); reread(b);
  }
  function drew(pts) { endDrawing(); added(pts); }
  // a book added at a point of the photo: upright, as wide and as tall as the books kept so far, in the middle
  function addAt([x, y]) {
    const side = (b, i, j) => Math.hypot(b.corners[i][0] - b.corners[j][0], b.corners[i][1] - b.corners[j][1]);
    const median = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };
    const w = books.length ? median(books.map((b) => side(b, 0, 1))) : st.W / 15, h = books.length ? median(books.map((b) => side(b, 0, 3))) : st.H / 3;
    added([[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]]);
  }
  // a book taken off the photo and out of the walk, found or added alike: Not a book, or Delete this book
  function remove(b) {
    const after = walk()[walk().indexOf(b) - 1] ?? null;
    books = books.filter((x) => x !== b); save();
    if (cur === b) return next(after);
    draw();
  }
  function submit() {
    const name = st.fileName.replace(/\.[^.]*$/, ""), kept = books.filter((b) => b.verdict === "right");
    const doc = { image: st.fileName, W: st.W, H: st.H, reader: choice.value,
      books: walk().filter((b) => b.verdict).map((b) => ({ source: b.source, verdict: b.verdict, corners: b.corners, turn: b.turn || 0, text: b.text ?? "",
        ...(b.proposed ? { proposed: { corners: b.proposed.corners, text: b.proposed.text } } : {}) })) };
    const items = [{ ok: true, text: `${books.filter((b) => b.source === "found" && b.verdict === "right").length} books the finder proposed kept` },
      { ok: true, text: `${books.filter((b) => b.source === "missed" && b.verdict === "right").length} missed books added` },
      ...(kept.some((b) => !b.text) ? [{ ok: false, level: "warning", text: `${kept.filter((b) => !b.text).length} books with no title typed` }] : [])];
    shell.submitTruth({ doc, count: kept.length, file: name + "_books_gt.json", items, empty: "No book marked right yet." });
  }

  // ---------- the right-click menu: a book added anywhere, a book flipped or deleted ----------
  const menu = $("#bs-menu");
  let menuAt = null;
  // the book under a point: of several, the last drawn
  const bookAt = (p) => books.findLast((b) => inside(p, b.corners)) || null;
  const hideMenu = () => { menu.hidden = true; menuAt = null; };
  $("#scroller").addEventListener("contextmenu", (e) => {
    if (!opened || !tagging() || drawing) return;
    e.preventDefault();
    const p = at(e), b = bookAt(p), r = $("#image-view").getBoundingClientRect();
    menuAt = { p, b };
    // a box drawn over two books hides one of them: a book may be added on a box too
    for (const k of ["flip", "delete"]) menu.querySelector(`[data-do="${k}"]`).hidden = !b;
    Object.assign(menu.style, { left: e.clientX - r.left + "px", top: e.clientY - r.top + "px" });
    menu.hidden = false;
  }, here);
  menu.onclick = (e) => {
    const k = e.target.closest("button")?.dataset.do, m = menuAt;
    hideMenu();
    if (!m || !k) return;
    if (k === "add") addAt(m.p);
    if (k === "delete") remove(m.b);
    if (k === "flip") { show(m.b); flip(m.b); }
  };
  document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !menu.contains(e.target)) hideMenu(); }, { ...here, capture: true });

  // ---------- the pointer: dragging the current book's corners, drawing a missed one ----------
  const sc = $("#scroller"), at = (e) => shell.viewer.toImage(e);
  // a corner may go past the photo's edge, for a book the camera cut off, but no further than a photo's width
  const past = (v, n) => Math.round(Math.min(Math.max(v, -n), 2 * n) * 10) / 10;
  sc.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !opened) return;
    if (drawing) { e.preventDefault(); drawing.pts.push(at(e)); if (drawing.pts.length === 4) drew(drawing.pts); else draw(); return; }
    const k = e.target.closest?.(".bs-corner");
    if (k && cur) { e.preventDefault(); sc.setPointerCapture(e.pointerId); dragging = +k.dataset.corner; }
  }, here);
  sc.addEventListener("pointermove", (e) => {
    if (dragging === null || !cur) return;
    const [x, y] = at(e);
    cur.corners[dragging] = [past(x, st.W), past(y, st.H)];
    drawBoxes(); repaint();
  }, here);
  const drop = () => {
    if (dragging === null) return;
    dragging = null; cur.corners = clockwise(cur.corners); save();
    // the reading follows the corners
    reread(cur);
  };
  sc.addEventListener("pointerup", drop, here);
  sc.addEventListener("pointercancel", drop, here);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (drawing) endDrawing(); hideMenu(); } }, here);

  return {
    ready() { $("#bs-find").disabled = !opened; },
    opened() {
      opened = true; books = []; cur = null; noneMissed = false; drawing = null; selectFor = null; hideMenu();
      $("#bs-find").disabled = false; $("#bs-read").disabled = true; $("#bs-export").disabled = true;
      shell.viewer.layer("bs").replaceChildren(); draw();
    },
    result(action, meta) {
      if (action === "find") {
        books = meta.books.map((b) => ({ ...b, source: "found", verdict: null }));
        cur = null; noneMissed = false; shell.busy(false);
        shell.step("find", true, `${books.length} books found` + (textless ? `, without the text finder (${textless})` : ""));
        shell.boxDone($("#bs-box"), `${books.length} books`);
        $("#bs-read").disabled = !books.length;
        draw();
      }
    },
    // a curated ground truth's final results (req/shell/ground-truth/view): the books marked right, each boxed, and
    // none of the task's marks
    showTruth(doc) {
      books = (doc.books || []).filter((b) => b.verdict === "right" && Array.isArray(b.corners)).map((b) => ({ ...b }));
      cur = null; draw();
      const titled = books.filter((b) => b.text).length;
      return `${books.length} book${books.length === 1 ? "" : "s"}, ${titled} with a title`;
    },
    error() { shell.busy(false); },
    capturesPointer: () => !!drawing || dragging !== null,
    pickAt(e) { return bookAt(at(e)); },
    // a book clicked on the photo opens in the task, whatever its verdict, the view left where it is
    pick(b) { if (!b || drawing) return; if (truth() && !tagging()) return; if (truth()) show(b, inView(b)); else { cur = b; draw(); } },
    zoomed: () => drawBoxes(),
  };
}
