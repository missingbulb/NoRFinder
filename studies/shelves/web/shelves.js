// The Bookshelf Reader's page: the books found on a photo of shelves, each a four-cornered box with its view (spine or
// cover) and the title read from it, and, while ground truth is made, one task that takes each book in turn: its
// corners, its view and its text set right, then the books the finder missed drawn in.
import { reader, rotate, READERS, MODELS } from "./reading.js";

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
  };
}

// corners clockwise from the one nearest the photo's top left
function clockwise(pts) {
  const cx = pts.reduce((a, p) => a + p[0], 0) / 4, cy = pts.reduce((a, p) => a + p[1], 0) / 4;
  const round = [...pts].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  const first = round.reduce((k, p, i) => (p[0] + p[1] < round[k][0] + round[k][1] ? i : k), 0);
  return [...round.slice(first), ...round.slice(0, first)].map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
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
  // books: [{corners, view, text, confidence, reader, turn, source: "found" | "missed", verdict: null | "right" | "wrong",
  // proposed: what the finder and the reader said, kept for scoring}]
  let books = [], cur = null, back = [], crops = new Map(), drawing = null, dragging = null, missedDone = false, opened = false;
  let ocr = null;
  const truth = () => shell.makesTruth;
  // its tasks in the shell's list: each book found checked, then the missed ones drawn in
  if (truth()) shell.tasks.list([{ key: "books", name: "Books", title: "The books the finder found, each checked" },
    { key: "missed", name: "Missed books", title: "The books the finder missed, drawn in" }], { submit, pick: (k) => { if (k === "books") next(null); } });
  const ocrNow = () => (ocr ||= reader(engines()));

  const choice = $("#bs-reader");
  choice.replaceChildren(...Object.entries(READERS).map(([k, name]) => Object.assign(document.createElement("option"), { value: k, textContent: name })));
  choice.value = shell.readJSON(READER, "lines") in READERS ? shell.readJSON(READER, "lines") : "lines";
  choice.onchange = () => shell.writeJSON(READER, choice.value);

  // ---------- Python: finding and straightening ----------
  $("#bs-find").onclick = async () => {
    const done = shell.until("result:find");
    shell.busy(true, "Finding the books…"); shell.call("find", {});
    await done;
    await readAll();
  };
  $("#bs-read").onclick = () => readAll();
  shell.slow($("#bs-find")); shell.slow($("#bs-read"));

  async function straighten(list) {
    const done = shell.until("result:straighten");
    shell.call("straighten", { corners: list.map((b) => b.corners) });
    const m = await done;
    let at = 0;
    return m.meta.sizes.map(([width, height]) => { const data = new Uint8ClampedArray(m.bytes.buffer, m.bytes.byteOffset + at, width * height * 4); at += width * height * 4; return { width, height, data }; });
  }
  // each book in list straightened and read by the reader chosen
  async function readSome(list) {
    if (!list.length) return;
    const how = choice.value;
    shell.busy(true, "Straightening each book…");
    const got = await straighten(list);
    list.forEach((b, i) => crops.set(b, got[i]));
    const r = ocrNow();
    for (const [i, b] of list.entries()) {
      shell.busy(true, `Reading ${i + 1} of ${list.length} with ${READERS[how]}…`);
      Object.assign(b, await r.read(got[i], how), { reader: how });
      b.proposed ||= { corners: b.corners.map((p) => [...p]), view: b.view, text: b.text };
      if (b.proposed.text === undefined) b.proposed.text = b.text;
    }
    shell.busy(false);
  }
  async function readAll() {
    await readSome(books.filter((b) => b.verdict !== "wrong"));
    shell.step("read", true, `${books.filter((b) => b.text).length} of ${books.length} titles read with ${READERS[choice.value]}`);
    shell.status("Titles read.");
    if (truth() && cur === null) next();
    draw();
  }

  // ---------- drawing on the photo ----------
  const layer = () => shell.viewer.layer("bs");
  const el = (tag, attrs) => { const n = document.createElementNS(SVG, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  function draw() {
    const g = layer(), pts = (b) => b.corners.map((p) => p.join(",")).join(" ");
    g.replaceChildren(...books.filter((b) => b.verdict !== "wrong").map((b) => {
      const k = el("g", { class: `bs-book ${b.view}${b === cur ? " current" : ""}${b.verdict ? " done" : ""}` });
      k.append(el("polygon", { class: "under", points: pts(b) }), el("polygon", { class: "over", points: pts(b) }));
      return k;
    }));
    if (cur && truth()) g.append(...cur.corners.map((p, i) => el("circle", { class: "bs-corner", cx: p[0], cy: p[1], r: 6 / st.zoom, "data-corner": i })));
    if (drawing?.pts.length) g.append(el("polyline", { class: "bs-book current", points: drawing.pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: "#ffd400" }));
    list(); tasks();
  }

  // the titles, outside ground truth: what the matcher is sent
  function list() {
    $("#bs-found").textContent = books.length ? `${books.length} books: ${books.filter((b) => b.view === "spine").length} spines, ${books.filter((b) => b.view === "cover").length} covers.` : "Nothing found yet.";
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
    books: books.filter((b) => b.verdict !== "wrong").map((b, i) => ({ id: i + 1, view: b.view, text: b.text ?? "", confidence: b.confidence ?? null, reader: b.reader ?? null, corners: b.corners })) });
  // the book framed in the view: zoomed to fill most of it, unless already close to that, and in its middle
  function focus(b) {
    const xs = b.corners.map((p) => p[0]), ys = b.corners.map((p) => p[1]), sc = $("#scroller");
    const w = Math.max(...xs) - Math.min(...xs) || 1, h = Math.max(...ys) - Math.min(...ys) || 1;
    const fit = Math.min(8, 0.7 * Math.min(sc.clientWidth / w, sc.clientHeight / h));
    if (st.zoom > fit * 1.5 || st.zoom < fit / 1.5) shell.viewer.setZoom(fit);
    shell.viewer.focus((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
  }

  // ---------- the ground truth: one book at a time, then the missed ones, then Submit ----------
  const found = () => books.filter((b) => b.source === "found");
  const open = () => found().filter((b) => !b.verdict);
  function next(after = cur) {
    const all = found(), from = all.indexOf(after);
    cur = [...all.slice(from + 1), ...all.slice(0, from + 1)].find((b) => !b.verdict) || null;
    if (cur) focus(cur);
    draw();
  }
  function verdict(v) {
    if (!cur) return;
    back.push(cur); cur.verdict = v;
    if (cur.source === "missed") { cur = null; draw(); return; }
    next();
  }
  function tasks() {
    if (!truth()) return;
    const all = found(), reviewed = all.length - open().length, missed = books.filter((b) => b.source === "missed" && b.verdict !== "wrong").length;
    const reviewing = cur && (cur.source === "missed" || !cur.verdict);
    shell.tasks.count("books", reviewed, all.length, all.length > 0 && !open().length);
    shell.tasks.count("missed", missed, missed, missedDone);
    const now = reviewing && cur.source === "found" ? "books" : !open().length || cur?.source === "missed" ? "missed" : null;
    for (const k of ["books", "missed"]) shell.tasks.row(k).querySelector(".task-body").replaceChildren();
    shell.tasks.open(now)?.querySelector(".task-body").append(now === "books" ? item(cur) : missedTools());
    shell.tasks.ready(!!(all.length && !open().length && missedDone && !(cur && cur.source === "missed" && !cur.verdict)));
  }
  // the book on show: its straightened picture, its view, its text and the verdict
  function item(b) {
    const box = document.createElement("div"); box.className = "bs-item";
    box.innerHTML = `<div class="bs-tools"><a data-do="back">Back</a><a data-do="skip">Skip</a></div><canvas></canvas>
      <div class="bs-views" role="group" aria-label="View"><button type="button" data-view="spine">Spine</button><button type="button" data-view="cover">Cover</button></div>
      <input type="text" dir="auto" placeholder="The title, as printed" aria-label="Title">
      <div class="bs-verdicts"><button type="button" class="primary" data-do="right">Right</button><button type="button" data-do="wrong">Not a book</button></div>`;
    const c = crops.get(b), cv = box.querySelector("canvas");
    if (c) {
      const up = rotate(c, b.turn || 0);
      cv.width = up.width; cv.height = up.height; cv.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(up.data), up.width, up.height), 0, 0);
    } else cv.hidden = true;
    for (const v of box.querySelectorAll("[data-view]")) {
      v.setAttribute("aria-pressed", String(b.view === v.dataset.view));
      v.onclick = () => { b.view = v.dataset.view; draw(); };
    }
    const t = box.querySelector("input"); t.value = b.text || ""; t.oninput = () => { b.text = t.value; };
    box.querySelector('[data-do="right"]').onclick = () => verdict("right");
    box.querySelector('[data-do="wrong"]').onclick = () => verdict("wrong");
    box.querySelector('[data-do="skip"]').onclick = () => next();
    box.querySelector('[data-do="back"]').onclick = () => { const p = back.pop(); if (p) { p.verdict = null; cur = p; focus(p); draw(); } };
    return box;
  }
  function missedTools() {
    const box = document.createElement("div");
    if (cur?.source === "missed" && !cur.verdict) return item(cur);
    box.innerHTML = `<div class="bs-verdicts"><button type="button" data-do="draw">Draw a book</button><button type="button" data-do="none">${missedDone ? "Done" : "None missed"}</button></div>`;
    box.querySelector('[data-do="draw"]').onclick = startDrawing;
    box.querySelector('[data-do="none"]').onclick = () => { missedDone = true; draw(); };
    return box;
  }
  function startDrawing() {
    drawing = { pts: [] }; missedDone = false;
    $("#scroller").classList.add("bs-drawing"); $("#bs-draw-hint").hidden = false; draw();
  }
  function endDrawing() { drawing = null; $("#scroller").classList.remove("bs-drawing"); $("#bs-draw-hint").hidden = true; draw(); }
  async function drew(pts) {
    endDrawing();
    const b = { corners: clockwise(pts), view: "spine", source: "missed", verdict: null };
    books.push(b); cur = b; draw();
    await readSome([b]); b.proposed = null; draw();
  }
  function submit() {
    const name = st.fileName.replace(/\.[^.]*$/, ""), kept = books.filter((b) => b.verdict === "right");
    const doc = { image: st.fileName, W: st.W, H: st.H, reader: choice.value,
      books: books.filter((b) => b.verdict).map((b) => ({ source: b.source, verdict: b.verdict, corners: b.corners, view: b.view, text: b.text ?? "",
        ...(b.proposed ? { proposed: b.proposed } : {}) })) };
    const items = [{ ok: true, text: `${found().length} books the finder proposed, each reviewed` },
      { ok: true, text: `${books.filter((b) => b.source === "missed" && b.verdict === "right").length} missed books drawn in` },
      ...(kept.some((b) => !b.text) ? [{ ok: false, level: "warning", text: `${kept.filter((b) => !b.text).length} books with no title typed` }] : [])];
    shell.submitTruth({ doc, count: kept.length, file: name + "_books_gt.json", items, empty: "No book marked right yet." });
  }
  // the tagger's progress on the photo is kept nowhere but the page (req/shell/ground-truth/clear)
  shell.clearable("book marks", () => {});

  // ---------- the pointer: dragging the current book's corners, drawing a missed one ----------
  const sc = $("#scroller"), at = (e) => shell.viewer.toImage(e);
  sc.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !opened) return;
    if (drawing) { e.preventDefault(); drawing.pts.push(at(e)); if (drawing.pts.length === 4) drew(drawing.pts); else draw(); return; }
    const k = e.target.closest?.(".bs-corner");
    if (k && cur) { e.preventDefault(); sc.setPointerCapture(e.pointerId); dragging = +k.dataset.corner; }
  }, here);
  sc.addEventListener("pointermove", (e) => {
    if (dragging === null || !cur) return;
    const [x, y] = at(e);
    cur.corners[dragging] = [Math.round(Math.min(Math.max(x, 0), st.W) * 10) / 10, Math.round(Math.min(Math.max(y, 0), st.H) * 10) / 10];
    draw();
  }, here);
  const drop = async () => {
    if (dragging === null) return;
    dragging = null; cur.corners = clockwise(cur.corners);
    // the picture and the reading follow the corners
    const keep = cur.text; await readSome([cur]); if (cur && keep && cur.proposed?.text !== keep) cur.text = keep;
    draw();
  };
  sc.addEventListener("pointerup", drop, here);
  sc.addEventListener("pointercancel", drop, here);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawing) endDrawing(); }, here);

  return {
    ready() { $("#bs-find").disabled = !opened; },
    opened() {
      opened = true; books = []; cur = null; back = []; crops = new Map(); missedDone = false; drawing = null;
      $("#bs-find").disabled = false; $("#bs-read").disabled = true; $("#bs-export").disabled = true;
      shell.viewer.layer("bs").replaceChildren(); draw();
    },
    result(action, meta) {
      if (action === "find") {
        books = meta.books.map((b) => ({ ...b, source: "found", verdict: null }));
        cur = null; back = []; shell.busy(false);
        shell.step("find", true, `${books.length} books found`);
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
    pickAt(e) { const p = at(e); return books.find((b) => b.verdict !== "wrong" && inside(p, b.corners)) || null; },
    pick(b) { if (!b || drawing) return; if (truth() && b.source === "found" && b.verdict) return; cur = b; draw(); },
    zoomed: () => draw(),
  };
}
