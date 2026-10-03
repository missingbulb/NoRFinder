// The page: holds one image's candidates and redraws everything from their current results.
// All detection and filtering is Python (detection/interactive.py) running in worker.js; this
// file only draws, keeps the user's settings, decisions and measurements, and asks the worker to refilter.
"use strict";
const $ = (s) => document.querySelector(s);
const SVGNS = "http://www.w3.org/2000/svg";
const STORE = "nor-filter-settings-v1"; // {values: {param: number}, off: [filter key]}; only what the user changed
const THEME = "nor-theme"; // "dark" | "light"; absent = follow the system
const MARKS = "nor-marks-v1:"; // + file name + "|" + finder: {"x,y": "in" | "out"}, the user's keepers and removals
const EDITS = "nor-edits-v1:"; // + file name + "|" + finder: {"x,y": {length, red, approved}}, the user's measurements
const SHOW = "nor-show-v1"; // the image view's Show menu
const CARDS = "nor-cards-v3"; // the item views' Options menu, one per view: {pass: {...}, fail: {...}}, only what the user changed
const BARS = "nor-bars-v1"; // {left, right}: side bar widths in pixels
const SOURCE = "nor-load-source"; // "local" | "drive": where Load reads from
const DRIVE_LINK = "nor-drive-link"; // the last Google Drive link pasted
const MISSING = "nor-missing-v1:"; // + file name: [[x, y]], the NoRs the user marked as missed by the finder
// a missing mark counts as found when a candidate lies within this distance: about half a NoR's
// length on the lab's slide (median 26 px), so the mark need not be placed on the NoR's centre
const MISSING_RADIUS = 12;
const MISSING_COLOUR = "#ffd400"; // yellow: none of the image's own colours
// where ground truth is submitted: an issue with this label, which the repo's daily intake reads
const REPO = "missingbulb/NoRFinder", GT_LABEL = "new-ground-truth";
const MEASURES = [
  ["length", "length", true], ["red_length", "red length", true], ["width", "width", true],
  ["red_over_length", "red / length", false], ["length_over_width", "length / width", false],
];
const BY_YOU = "rejected by you";
const SHOW_DEFAULTS = { pass: true, fails: true, nums: true, letters: true, lines: true, passW: 1, passC: "#ff69c8", failW: 1, failC: "#008cff" };
// each item view opens with its own options: the finalists with everything needed to check and adjust
// lengths, the rejected with just the NoR's borders and more context around it
const CARD_DEFAULTS = {
  pass: { pad: 4, align: true, borders: true, bars: true, lenImg: true, lenCard: false, adjust: true },
  fail: { pad: 10, align: false, borders: true, bars: false, lenImg: false, lenCard: false, adjust: false },
};

const st = {
  worker: null, H: 0, W: 0, um: null, img: null, meta: null, seg: null, cands: [],
  fails: [], alone: null, forced: new Map(), edits: new Map(), defaults: {}, values: {}, off: new Set(),
  about: {}, detectValues: {}, lastRun: null, filtersFor: null, seq: 0, inflight: false, pending: false,
  zoom: 2, fileName: "", sha: "", source: null, missing: [], numbers: new Map(), order: [], times: {}, sel: null, tab: "pass",
  show: { ...SHOW_DEFAULTS, ...readJSON(SHOW) }, opt: readOpts(), crops: new Map(),
};

function readJSON(key, fallback = {}) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function readOpts() {
  const saved = readJSON(CARDS);
  return { pass: { ...CARD_DEFAULTS.pass, ...saved.pass }, fail: { ...CARD_DEFAULTS.fail, ...saved.fail } };
}
// the options a candidate's card is drawn with: those of the view it is listed in
const optsOf = (c) => st.opt[result(c.i) === null ? "pass" : "fail"];
function writeJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode: lasts for this page only */ }
}

// ---------- saved filter settings ----------
const loadSaved = () => readJSON(STORE, { values: {}, off: [] });
function save() {
  const values = {};
  for (const [k, v] of Object.entries(st.values)) if (v !== st.defaults[k]) values[k] = v;
  writeJSON(STORE, { values, off: [...st.off] });
}

// ---------- the user's decisions and measurements: saved per file and finder, tied to each candidate's position ----------
const posKey = (c) => `${Math.round(c.cx)},${Math.round(c.cy)}`;
const fileKey = () => st.fileName + "|" + st.meta.finder;
function loadMarks() {
  st.forced = new Map(); st.edits = new Map();
  const marks = readJSON(MARKS + fileKey()), edits = readJSON(EDITS + fileKey());
  for (const c of st.cands) {
    const m = marks[posKey(c)], e = edits[posKey(c)];
    if (m) st.forced.set(c.i, m);
    if (e) st.edits.set(c.i, e);
  }
}
function saveMap(prefix, map) {
  const out = {};
  for (const [j, v] of map) out[posKey(st.cands[j])] = v;
  writeJSON(prefix + fileKey(), out);
}
// the user's word on a candidate: "approve" (a NoR, with the lengths shown), "reject" (not one), or null (the filters decide)
function decide(i, d) {
  d ? st.forced.set(i, d === "approve" ? "in" : "out") : st.forced.delete(i);
  const e = { ...(st.edits.get(i) || {}) };
  d === "approve" ? (e.approved = true) : delete e.approved;
  Object.keys(e).length ? st.edits.set(i, e) : st.edits.delete(i);
  saveMap(MARKS, st.forced); saveMap(EDITS, st.edits); render();
}
function edit(i, change) {
  const e = { ...(st.edits.get(i) || {}), ...change };
  for (const k of Object.keys(e)) if (e[k] == null || e[k] === false) delete e[k];
  Object.keys(e).length ? st.edits.set(i, e) : st.edits.delete(i);
  saveMap(EDITS, st.edits); drawLines(st.cands[i]); render();
}

// ---------- status ----------
function status(text, err) {
  const s = $("#status"); s.textContent = text; s.classList.toggle("err", !!err);
  if (st.busySince) $("#busy-text").textContent = text;
  if (err) busy(false);
}
// the spinner and elapsed time shown while Python loads or a finder runs. look "scan": a finder running over
// an image shows a photocopier's light sweeping across it instead of the spinner; "peek": the image painting
// as it arrives stays in view, the text in a pill below it
function busy(on, text, look) {
  clearInterval(st.busyTimer); st.busySince = on ? st.busySince || Date.now() : 0;
  $("#spin").classList.toggle("on", on); $("#busy").hidden = !on;
  $("#busy").classList.toggle("scan", on && look === "scan"); $("#busy").classList.toggle("peek", on && look === "peek");
  if (!on) return;
  $("#busy-text").textContent = text || $("#status").textContent; $("#busy-time").textContent = "";
  st.busyTimer = setInterval(() => { $("#busy-time").textContent = ((Date.now() - st.busySince) / 1000).toFixed(0) + " s"; }, 500);
}
function statusBar() {
  const t = st.times, parts = [];
  if (t.load != null) parts.push(`Python ${t.load.toFixed(0)} s`);
  if (t.open != null) parts.push(`image ${t.open.toFixed(1)} s`);
  if (t.detect != null) parts.push(`finding ${t.detect.toFixed(1)} s`);
  if (t.filter != null) parts.push(`filters ${t.filter.toFixed(0)} ms`);
  $("#sb-times").textContent = parts.join(" · ");
  $("#sb-file").textContent = st.fileName || "No image";
}
const fmt = (v, d = 2) => (v == null || !isFinite(v) ? "–" : Number(v).toFixed(d));

// ---------- worker ----------
async function start() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("sw.js");
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        // first visit: wait for the cache to take control so the downloads below are kept
        await Promise.race([new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true })),
                            new Promise((r) => setTimeout(r, 3000))]);
      }
    } catch (e) { console.warn("no cache for third-party files:", e); }
  }
  status("Loading Python in the background…"); $("#spin").classList.add("on");
  st.worker = new Worker("worker.js", { type: "module" });
  st.worker.onmessage = (e) => onWorker(e.data);
}

function onWorker(m) {
  if (m.type === "progress") status(m.text);
  else if (m.type === "error") status("Error: " + m.text, true);
  else if (m.type === "ready") {
    const sel = $("#finder");
    sel.innerHTML = Object.entries(m.finders).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
    sel.disabled = false; st.ready = true; $("#spin").classList.remove("on");
    st.about = m.about; st.times.load = m.secs; st.help = Object.values(m.about)[0].help;
    buildDetect(); useFilters(sel.value); statusBar();
    status("Ready. Load an image.");
    if (st.queued) { const q = st.queued; st.queued = null; send(q.name, q.bytes); }
  } else if (m.type === "opened") {
    st.H = m.H; st.W = m.W; st.um = m.um; const n = m.H * m.W;
    st.img = { r: m.images.subarray(0, n), g: m.images.subarray(n, 2 * n), b: m.images.subarray(2 * n, 3 * n) };
    st.plain = null; st.peeked = false; drawBase(); $("#empty").hidden = true; $("#stage").hidden = false; $("#thumb-wrap").hidden = false;
    setZoom(st.zoom);
    busy(false); st.times.open = m.secs; st.times.detect = st.times.filter = null; statusBar();
    showView("image"); updateFind(); fold(true); loadShine(); drawMissing();
    status("Image loaded. Press Find Candidates.");
    if (st.source && st.source.kind === "local") notice(LOCAL_GT);
  } else if (m.type === "detected") {
    busy(false);
    st.times.detect = m.secs; st.lastRun = st.running; st.running = null;
    onDetected(m.meta, m.seg); statusBar(); updateFind();
    status(m.meta.exact_refilter ? "Done." : "This finder picks between alternatives using the filters, so after a filter change press Find Candidates again for its exact result.");
  } else if (m.type === "filtered") {
    st.inflight = false;
    if (m.seq === st.seq) { st.fails = m.fails; st.alone = m.alone; st.times.filter = m.ms; statusBar(); render(); }
    if (st.pending) { st.pending = false; refilter(); }
  }
}

function detect() {
  const finder = $("#finder").value, overrides = detectOverrides(finder);
  st.running = runKey(); st.runOverrides = overrides; $("#find").disabled = true; $("#find").classList.remove("shine");
  busy(true, "Finding candidates…", "scan");
  st.worker.postMessage({ type: "detect", finder, overrides });
}

function refilter() {
  if (!st.meta) return;
  if (st.inflight) { st.pending = true; return; }
  st.inflight = true;
  st.worker.postMessage({ type: "refilter", seq: ++st.seq, spec: { values: st.values, off: [...st.off] } });
}

// ---------- loading ----------
// source: where the image came from, {kind: "local"} or {kind: "drive", id}
async function openBytes(name, bytes, source) {
  st.fileName = name; st.source = source; st.missing = readJSON(MISSING + name, []).map(([x, y]) => ({ x, y })); st.meta = null; st.lastRun = null; st.cands = []; st.order = []; st.sel = null; st.ring = null; st.crops = new Map();
  st.sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  $("#file-name").textContent = name; $("#file-name").classList.remove("dim"); statusBar();
  $("#overlay").innerHTML = ""; $("#list").replaceChildren(); $("#summary").textContent = "No candidates yet.";
  $("#switch").disabled = true; $("#sb-counts").textContent = ""; downloads(false); renderSelected();
  if (st.ready) return send(name, bytes);
  // Python is still loading: the image opens the moment it is ready
  st.queued = { name, bytes }; busy(true, "Python is still loading; your image opens as soon as it is ready…", st.peeked && "peek"); loadShine();
}
function send(name, bytes) {
  busy(true, "Reading the image…", st.peeked && "peek");
  st.worker.postMessage({ type: "open", name, bytes }, [bytes]);
}
// a painter for the image's bytes as they arrive (peek.js), shown until Python's own drawing replaces it
function peek() {
  st.peeked = false;
  const shown = () => ["show-r", "show-g", "show-b"].map((id) => $("#" + id).checked);
  return (st.peek = NorPeek.painter($("#base"), shown, (W, H) => {
    st.img = null; st.plain = null; st.W = W; st.H = H; st.peeked = true;
    $("#overlay").innerHTML = ""; $("#empty").hidden = true; $("#stage").hidden = false; $("#thumb-wrap").hidden = true;
    setZoom(st.zoom); updateFind();
  }));
}
// Load shimmers until there is an image to work on
const loadShine = () => $("#load-main").classList.toggle("shine", !st.img && !st.queued);
$("#file").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const bytes = await f.arrayBuffer(); peek()(bytes, bytes.byteLength);
  openBytes(f.name, bytes, { kind: "local" }); e.target.value = "";
};
function load(src) {
  writeJSON(SOURCE, src); $("#load-menu").open = false;
  if (src === "local") return $("#file").click();
  const home = ((window.NOR_CONFIG || {}).drive || {}).defaultLink || "";
  $("#drive-link").value = readJSON(DRIVE_LINK, "") || home; $("#drive-dlg").showModal(); $("#drive-link").select();
  if (NorDrive.parse($("#drive-link").value)?.kind === "folder") $("#drive-go").click();
}
$("#load-main").onclick = () => load(readJSON(SOURCE, "local"));
document.querySelectorAll("#load-menu .item").forEach((b) => (b.onclick = () => load(b.dataset.src)));

// the Drive dialog: a pasted file link loads at once; a folder link lists its images and subfolders
{
  const msg = (t, err) => { const m = $("#drive-msg"); m.textContent = m.title = t; m.classList.toggle("err", !!err); };
  const sizeText = (n) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
  let trail = [];
  const take = async (id, name) => {
    msg("Downloading " + (name || "the image") + "…");
    const mb = (n) => (n / 1048576).toFixed(1);
    let push, what;
    try {
      const f = await NorDrive.file(id, name, (n) => {
        what = n; $("#drive-dlg").close(); msg(""); push = peek(); busy(true, `Downloading ${n}…`, "peek");
      }, (buf, got, total) => {
        push(buf, got);
        $("#busy-text").textContent = `Downloading ${what} · ${mb(got)}${total ? " of " + mb(total) : ""} MB`;
      });
      if (f.folder) { trail = [f]; return show(); }
      openBytes(f.name, f.bytes, { kind: "drive", id });
    } catch (err) {
      busy(false); if (!$("#drive-dlg").open) $("#drive-dlg").showModal();
      msg(err.message || String(err), true);
    }
  };
  const show = async () => {
    const at = trail[trail.length - 1];
    $("#drive-path").innerHTML = trail.map((t, k) => `<button type="button" class="link" data-k="${k}">${esc(t.name)}</button>`).join(" / ");
    $("#drive-path").querySelectorAll("button").forEach((b) => (b.onclick = () => { trail = trail.slice(0, +b.dataset.k + 1); show(); }));
    $("#drive-path").scrollLeft = $("#drive-path").scrollWidth;
    $("#drive-list").replaceChildren(); msg("Reading the folder…");
    try {
      const items = await NorDrive.list(at.id);
      msg(items.length ? "" : "No TIFF or PNG images here.");
      for (const f of items) {
        const b = document.createElement("button"); b.type = "button"; b.className = "item" + (f.folder ? " folder" : "");
        const meta = [f.size == null ? "" : sizeText(f.size),
          f.created ? f.created.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""].filter(Boolean).join(" · ");
        b.innerHTML = `<span class="name">${esc(f.name)}</span><span class="meta">${esc(meta)}</span>`;
        b.onclick = () => (f.folder ? (trail.push(f), show()) : take(f.id, f.name));
        $("#drive-list").append(b);
      }
    } catch (err) { msg(err.message || String(err), true); }
  };
  if (!NorDrive.ready) {
    const d = document.querySelector('#load-menu .item[data-src="drive"]');
    d.disabled = true; d.title = "Needs this site's Google API key (issue #234)";
  }
  const open = () => {
    const link = $("#drive-link").value, ref = NorDrive.parse(link);
    $("#drive-list").replaceChildren(); $("#drive-path").replaceChildren();
    if (!ref) return msg("That does not look like a Google Drive link.", true);
    writeJSON(DRIVE_LINK, link);
    if (ref.kind === "file") return take(ref.id);
    trail = [{ id: ref.id, name: "Folder" }]; show();
  };
  $("#drive-go").onclick = open;
  $("#drive-link").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); open(); } });
}

// ---------- image ----------
function drawBase() {
  const c = $("#base"); c.width = st.W; c.height = st.H;
  const ctx = c.getContext("2d"), im = ctx.createImageData(st.W, st.H), d = im.data;
  const R = $("#show-r").checked, G = $("#show-g").checked, B = $("#show-b").checked, { r, g, b } = st.img;
  for (let i = 0, j = 0; i < r.length; i++, j += 4) { d[j] = R ? r[i] : 0; d[j + 1] = G ? g[i] : 0; d[j + 2] = B ? b[i] : 0; d[j + 3] = 255; }
  ctx.putImageData(im, 0, 0);
  // an unmodified copy for the crops
  if (!st.plain) {
    st.plain = document.createElement("canvas"); st.plain.width = st.W; st.plain.height = st.H;
    const p = st.plain.getContext("2d"), pi = p.createImageData(st.W, st.H);
    for (let i = 0, j = 0; i < r.length; i++, j += 4) { pi.data[j] = r[i]; pi.data[j + 1] = g[i]; pi.data[j + 3] = 255; }
    p.putImageData(pi, 0, 0);
  }
  const t = $("#thumb"), tw = 480; t.width = tw; t.height = Math.round((tw * st.H) / st.W);
  const tc = t.getContext("2d"); tc.imageSmoothingQuality = "high"; tc.drawImage(c, 0, 0, t.width, t.height);
  thumbView();
}

// the part of the image in view, drawn on the thumbnail
function thumbView() {
  if (!st.W) return;
  const sc = $("#scroller"), t = $("#thumb"), k = t.clientWidth / (st.W * st.zoom), v = $("#thumb-view");
  const w = Math.min(t.clientWidth, sc.clientWidth * k), h = Math.min(t.clientHeight, sc.clientHeight * k);
  Object.assign(v.style, { left: sc.scrollLeft * k + "px", top: sc.scrollTop * k + "px", width: w + "px", height: h + "px" });
}
$("#scroller").addEventListener("scroll", thumbView);
{
  const go = (e) => {
    const t = $("#thumb").getBoundingClientRect(), sc = $("#scroller");
    const x = ((e.clientX - t.left) / t.width) * st.W, y = ((e.clientY - t.top) / t.height) * st.H;
    sc.scrollTo(x * st.zoom - sc.clientWidth / 2, y * st.zoom - sc.clientHeight / 2);
  };
  const w = $("#thumb-wrap");
  w.addEventListener("pointerdown", (e) => { w.setPointerCapture(e.pointerId); showView("image"); go(e); });
  w.addEventListener("pointermove", (e) => { if (w.hasPointerCapture(e.pointerId)) go(e); });
}

// zoom keeps the image point under `at` (a pointer event) where it is; without one, the middle of the view
function setZoom(z, at) {
  const sc = $("#scroller"), old = st.zoom, r = sc.getBoundingClientRect();
  st.zoom = Math.max(0.1, Math.min(16, z));
  const ax = at ? at.clientX - r.left : sc.clientWidth / 2, ay = at ? at.clientY - r.top : sc.clientHeight / 2;
  const ix = (sc.scrollLeft + ax) / old, iy = (sc.scrollTop + ay) / old;
  const w = st.W * st.zoom, h = st.H * st.zoom;
  Object.assign($("#base").style, { width: w + "px", height: h + "px" });
  const svg = $("#overlay"); svg.setAttribute("width", w); svg.setAttribute("height", h);
  svg.style.fontSize = 12 / st.zoom + "px";
  sc.scrollLeft = ix * st.zoom - ax; sc.scrollTop = iy * st.zoom - ay;
  $("#zoom-label").textContent = Math.round(st.zoom * 100) + "%";
  placeRing(); thumbView();
}

// ---------- candidates ----------
// Pixel-edge outlines of one segment value inside a candidate's block, as SVG path data in image coordinates.
function outline(c, blk, val) {
  const { h, w, x0, y0 } = c; let d = "";
  const at = (y, x) => (y >= 0 && y < h && x >= 0 && x < w ? blk[y * w + x] : 0);
  const isv = val === 2 ? (v) => v === 2 || v === 3 : (v) => v === val;
  for (let y = 0; y <= h; y++) { // horizontal edges between rows y-1 and y
    let run = -1;
    for (let x = 0; x <= w; x++) {
      const e = x < w && isv(at(y - 1, x)) !== isv(at(y, x));
      if (e && run < 0) run = x;
      if (!e && run >= 0) { d += `M${x0 + run} ${y0 + y}h${x - run}`; run = -1; }
    }
  }
  for (let x = 0; x <= w; x++) { // vertical edges between columns x-1 and x
    let run = -1;
    for (let y = 0; y <= h; y++) {
      const e = y < h && isv(at(y, x - 1)) !== isv(at(y, x));
      if (e && run < 0) run = y;
      if (!e && run >= 0) { d += `M${x0 + x} ${y0 + run}v${y - run}`; run = -1; }
    }
  }
  return d;
}

function onDetected(meta, seg) {
  st.meta = meta; st.seg = seg; st.crops = new Map(); st.sel = null; st.alone = null;
  if (st.filtersFor !== meta.finder) useFilters(meta.finder);
  st.cands = meta.cands.map((c) => {
    const blk = seg.subarray(c.off, c.off + c.h * c.w);
    let ty0 = c.h, tx0 = c.w, ty1 = -1, tx1 = -1;
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (blk[y * c.w + x]) {
      if (y < ty0) ty0 = y; if (y > ty1) ty1 = y; if (x < tx0) tx0 = x; if (x > tx1) tx1 = x;
    }
    return { ...c, blk, bb: [c.x0 + tx0, c.y0 + ty0, c.x0 + tx1 + 1, c.y0 + ty1 + 1] };
  });
  // one number per candidate for as long as this detection lasts, top to bottom, whatever the filters do
  st.order = st.cands.filter((c) => c.bb[2] > c.bb[0] && (c.fail0 === null || st.reasons[c.fail0]))
    .sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  st.numbers = new Map(st.order.map((c, k) => [c.i, k + 1]));
  loadMarks();
  buildOverlay(); drawMissing();
  $("#switch").disabled = false;
  refilter();
}

const el = (tag, attrs = {}) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

function buildOverlay() {
  const svg = $("#overlay"); svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${st.W} ${st.H}`);
  const frag = document.createDocumentFragment();
  for (const c of st.order) {
    const g = el("g", { "data-i": c.i });
    g.append(el("path", { class: "red", d: outline(c, c.blk, 1) }), el("path", { d: outline(c, c.blk, 2) }));
    c.lineEl = el("g", { class: "lines" }); g.append(c.lineEl);
    const t = el("text", { x: c.bb[2] + 0.5, y: c.bb[1] });
    const num = el("tspan", { class: "num" }), let_ = el("tspan", { class: "let", "font-weight": "bold" });
    num.textContent = st.numbers.get(c.i); t.append(num, let_); g.append(t);
    const [a, b, cc, d] = c.bb; g.append(el("rect", { class: "hit", x: a, y: b, width: cc - a, height: d - b }));
    c.el = g; c.text = t; frag.append(g); drawLines(c);
  }
  st.ring = el("circle", { class: "ring" }); st.ring.style.display = "none";
  frag.append(st.ring);
  svg.append(frag);
}

// the measuring lines as the user left them: their own length and red lines, else the finder's
function linesOf(c) {
  if (!c.lines) return null;
  const e = st.edits.get(c.i) || {};
  return { ...c.lines, length: e.length || c.lines.length, red: e.red || c.lines.red };
}
function drawLines(c) {
  const L = linesOf(c); c.lineEl.replaceChildren();
  if (!L) return;
  for (const [k, cls] of [["length", ""], ["width", ""], ["red", "r"]]) {
    const [[x1, y1], [x2, y2]] = L[k];
    c.lineEl.append(el("line", { x1, y1, x2, y2, ...(cls ? { class: cls } : {}) }));
  }
}

// ---------- missing candidates: NoRs the user marked because the finder proposed nothing there ----------
function saveMissing() { writeJSON(MISSING + st.fileName, st.missing.map((m) => [m.x, m.y])); }
function addMissing(x, y) { st.missing.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }); saveMissing(); drawMissing(); }
function removeMissing(k) { st.missing.splice(k, 1); saveMissing(); drawMissing(); }
// the marks on the image, each a dashed circle of the radius it is scored within
function drawMissing() {
  const svg = $("#overlay"); svg.querySelector(".missing-marks")?.remove();
  $("#n-miss").textContent = st.missing.length;
  $("#dl-truth").disabled = !st.img;
  if (!st.W) return;
  svg.setAttribute("viewBox", `0 0 ${st.W} ${st.H}`);
  const g = el("g", { class: "missing-marks" });
  st.missing.forEach((m, k) => {
    const t = el("text", { x: m.x + MISSING_RADIUS + 1, y: m.y - MISSING_RADIUS });
    t.textContent = "M" + (k + 1);
    g.append(el("circle", { cx: m.x, cy: m.y, r: MISSING_RADIUS }), t);
  });
  svg.append(g);
  if (st.view === "items" && st.tab === "missing") renderList();
}
// right-clicking the image offers to mark a missing candidate there, or to remove the mark under the pointer
{
  const menu = $("#ctx");
  const close = () => { menu.hidden = true; };
  $("#scroller").addEventListener("contextmenu", (e) => {
    if (!st.img) return;
    const r = $("#base").getBoundingClientRect(), x = (e.clientX - r.left) / st.zoom, y = (e.clientY - r.top) / st.zoom;
    if (x < 0 || y < 0 || x > st.W || y > st.H) return;
    e.preventDefault();
    const k = st.missing.findIndex((m) => Math.hypot(m.x - x, m.y - y) <= MISSING_RADIUS);
    const b = menu.querySelector("button");
    b.textContent = k < 0 ? "Mark Missing Candidate" : `Remove Missing Mark M${k + 1}`;
    b.onclick = () => { close(); k < 0 ? addMissing(x, y) : removeMissing(k); };
    menu.hidden = false;
    menu.style.left = Math.min(e.clientX, innerWidth - menu.offsetWidth - 4) + "px";
    menu.style.top = Math.min(e.clientY, innerHeight - menu.offsetHeight - 4) + "px";
    b.focus();
  });
  document.addEventListener("pointerdown", (e) => { if (!menu.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  $("#scroller").addEventListener("scroll", close);
}
// a missing mark's card: the image around it, with the circle it is scored within
function missingCard(m, k) {
  const d = document.createElement("div"); d.className = "card missing";
  d.innerHTML = `<div class="head"><span class="num">M${k + 1}</span><span class="state">Missing candidate</span>
    <span class="verdict"><button type="button" class="remove" title="Remove this mark" aria-label="Remove this mark">×</button></span></div>`;
  d.querySelector(".remove").onclick = () => removeMissing(k);
  const half = MISSING_RADIUS + 8, side = 2 * half, s = Math.max(2, Math.floor(170 / side)), dpr = devicePixelRatio || 1;
  const cv = document.createElement("canvas"); cv.width = side * s * dpr; cv.height = side * s * dpr; cv.style.width = side * s + "px";
  const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0); ctx.translate(half - m.x, half - m.y);
  const sx = Math.max(0, Math.floor(m.x - half)), sy = Math.max(0, Math.floor(m.y - half));
  const sw = Math.min(st.W, Math.ceil(m.x + half)) - sx, sh = Math.min(st.H, Math.ceil(m.y + half)) - sy;
  ctx.drawImage(st.plain, sx, sy, sw, sh, sx, sy, sw, sh);
  ctx.lineWidth = 1 / s; ctx.setLineDash([3 / s, 2 / s]); ctx.strokeStyle = MISSING_COLOUR;
  ctx.beginPath(); ctx.arc(m.x, m.y, MISSING_RADIUS, 0, 2 * Math.PI); ctx.stroke();
  const wrap = document.createElement("div"); wrap.className = "crop-wrap";
  const node = document.createElement("div"); node.className = "crop"; node.append(cv); wrap.append(node);
  wrap.insertAdjacentHTML("beforeend", `<button class="goto" title="Show it on the image" aria-label="Show it on the image">${GOTO}</button>`);
  wrap.querySelector(".goto").onclick = () => { showView("image"); focusOn({ cx: m.x, cy: m.y }); };
  d.append(wrap);
  return d;
}

// the result shown for candidate i: null = pass, else a failure reason
function result(i) {
  const f = st.forced.get(i);
  if (f === "in") return null;
  if (f === "out") return BY_YOU;
  return st.fails[i];
}
const reasonOf = (k) => (k === BY_YOU ? { letter: "X", color: [255, 255, 255], title: "By you", text: "Rejected by you" } : st.reasons[k]);
const colour = (k) => `rgb(${reasonOf(k).color})`;
// every reason a rejected candidate has: the finder's own, or each filter that rejects it by itself
function whyAll(c) {
  const r = result(c.i);
  if (r === BY_YOU || r === null) return r === null ? [] : [BY_YOU];
  if (c.fail0) return [c.fail0];
  const all = (st.alone && st.alone.fails[c.i]) || [];
  const on = all.filter((k) => !st.off.has(k));
  return on.length ? on : [r];
}

// ---------- measurements ----------
const unitName = () => (st.um ? "µm" : "px");
const dist = ([[a, b], [c, d]]) => Math.hypot(c - a, d - b);
// the numbers behind the table, in pixels, with the user's lengths where they set them
function measuresPx(c) {
  if (!c.m) return {};
  const e = st.edits.get(c.i) || {}, m = { ...c.m };
  if (e.length) m.length = dist(e.length);
  if (e.red) m.red_length = dist(e.red);
  if (e.length || e.red) { m.red_over_length = m.red_length / m.length; m.length_over_width = m.length / m.width; }
  return m;
}
function measures(c) {
  const f = st.um || 1, m = measuresPx(c);
  return MEASURES.map(([k, label, scaled]) => [label + (scaled ? ` (${unitName()})` : ""), m[k] == null ? null : scaled ? m[k] * f : m[k]]);
}
const measured = (c) => { const e = st.edits.get(c.i) || {}; return e.length || e.red ? "adjusted" : e.approved ? "approved" : null; };

// ---------- controls ----------
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// a small ? beside a setting; hovering or focusing it shows what the setting does
const helpIcon = (name) => {
  const t = st.help && st.help[name];
  return t ? `<span class="help" tabindex="0" role="note" aria-label="${esc(t)}" data-help="${esc(t)}">?</span>` : "";
};
function paramRange(name, v) {
  if (/opposite|axis_dev|deg|cone/.test(name)) return [0, 180, 1];
  if (v < 1) return [0, 1, 0.01];
  const max = Math.ceil(v * 3); return [0, max, Number.isInteger(v) ? 1 : max / 300];
}
// one setting's control, the same for the finder and the filters: its name, and for a number a slider
// and a box; away from our value it is marked, with our value as a tick on the slider that puts it back
function dial(name, def, value, onset) {
  const kind = typeof def === "boolean" ? "bool" : typeof def === "number" ? "number" : "text";
  const p = document.createElement("div"); p.className = "param " + kind; p.dataset.name = name;
  let slider = "";
  if (kind === "number") {
    const [lo, hi, step] = paramRange(name, def), at = Math.min(1, Math.max(0, (def - lo) / (hi - lo)));
    slider = `<div class="slide"><input type="range" min="${lo}" max="${hi}" step="${step}"><button type="button" class="ours" style="--at:${at}"
      title="Ours: ${def}. Click to go back to it" aria-label="Back to ours, ${def}"></button></div>`;
  }
  const box = kind === "bool" ? '<input type="checkbox">' : kind === "number" ? '<input type="number" step="any" class="box">' : '<input type="text" class="box">';
  p.innerHTML = `<span class="name">${name} ${helpIcon(name)}</span>${slider}${box}`;
  const range = p.querySelector('input[type="range"]'), inp = p.querySelector(".box, input[type=checkbox]");
  p.set = (v) => {
    if (kind === "bool") inp.checked = v; else inp.value = kind === "text" ? JSON.stringify(v) : v;
    if (range) range.value = v;
    p.classList.toggle("changed", JSON.stringify(v) !== JSON.stringify(def));
  };
  const take = (raw) => {
    let v;
    try { v = kind === "bool" ? raw : kind === "number" ? parseFloat(raw) : JSON.parse(raw); } catch { return; }
    if (kind === "number" && !isFinite(v)) return;
    if (range) range.value = v; if (kind === "number" && document.activeElement !== inp) inp.value = v;
    p.classList.toggle("changed", JSON.stringify(v) !== JSON.stringify(def));
    onset(v);
  };
  inp.oninput = inp.onchange = () => take(kind === "bool" ? inp.checked : inp.value);
  if (range) range.oninput = () => { inp.value = range.value; take(range.value); };
  if (range) p.querySelector(".ours").onclick = () => { p.set(def); onset(def); };
  p.set(value);
  return p;
}
// the filters and their values for a finder: our numbers, overlaid with what this browser saved
function useFilters(finder) {
  const about = st.about[finder], saved = loadSaved();
  st.filtersFor = finder; st.filters = about.filters; st.reasons = about.reasons;
  st.defaults = {}; st.values = {};
  for (const f of about.filters) for (const [k, v] of Object.entries(f.params)) st.defaults[k] = v;
  for (const k in st.defaults) st.values[k] = k in saved.values ? saved.values[k] : st.defaults[k];
  st.off = new Set(saved.off.filter((k) => about.filters.some((f) => f.key === k)));
  buildFilters(); $("#reset-filters").disabled = false;
}

function buildFilters() {
  const box = $("#filters"); box.innerHTML = "";
  for (const f of st.filters) {
    const d = document.createElement("div"); d.className = "filter"; d.dataset.key = f.key;
    d.innerHTML = `<label class="top"><input type="checkbox" ${st.off.has(f.key) ? "" : "checked"}>
      <span class="badge" style="--c:${colour(f.key)}">${f.letter}</span><span class="title">${esc(f.title)}</span>
      <span class="n" title="X (Y): what this filter rejects&#10;X: candidates that pass every other filter that is on and fail only this one, so switching it off lets them through.&#10;Y: every candidate that fails this filter, whatever the others say."></span></label><div class="desc">${esc(f.text)}</div>`;
    d.querySelector("input").onchange = (e) => {
      e.target.checked ? st.off.delete(f.key) : st.off.add(f.key); d.classList.toggle("off", !e.target.checked); save(); refilter();
    };
    d.classList.toggle("off", st.off.has(f.key));
    for (const name of Object.keys(f.params)) {
      d.append(dial(name, st.defaults[name], st.values[name], (v) => {
        st.values[name] = v;
        document.querySelectorAll(`#filters .param[data-name="${name}"]`).forEach((o) => { if (!o.contains(document.activeElement)) o.set(v); });
        save(); refilter();
      }));
    }
    box.append(d);
  }
}

// the finder's settings: its main ones on show, every one under Advanced; both edit the same values
function buildDetect() {
  const finder = $("#finder").value, about = st.about[finder];
  const defs = about.detection_params, vals = (st.detectValues[finder] ||= { ...defs });
  $("#finder-note").textContent = about.about + (about.exact_refilter ? "" : " It picks between alternatives using the filters, so after a filter change, find again for its exact result.");
  const row = (k) => dial(k, defs[k], vals[k], (v) => {
    vals[k] = v;
    document.querySelectorAll(`#main-params .param[data-name="${k}"], #detect-params .param[data-name="${k}"]`).forEach((o) => { if (!o.contains(document.activeElement)) o.set(v); });
    updateFind();
  });
  $("#main-params").replaceChildren(...about.main_params.map(row));
  $("#detect-params").replaceChildren(...Object.keys(defs).map(row));
  updateFind();
}

function detectOverrides(finder) {
  const o = {}, defs = st.about[finder].detection_params;
  for (const [k, v] of Object.entries(st.detectValues[finder] || {})) if (JSON.stringify(v) !== JSON.stringify(defs[k])) o[k] = v;
  return o;
}
const runKey = () => JSON.stringify([$("#finder").value, detectOverrides($("#finder").value)]);
// Find Candidates shines while the finder or its settings differ from what the image was last searched with
function updateFind() {
  const finder = $("#finder").value; if (!st.about[finder]) return;
  const o = detectOverrides(finder), f = $("#find");
  $("#reset-detect").disabled = !Object.keys(o).length;
  f.disabled = !st.img || !!st.running;
  f.classList.toggle("shine", !f.disabled && runKey() !== st.lastRun);
}

// ---------- drawing ----------
function render() {
  const passes = [], rejects = [], counts = {};
  for (const c of st.order) {
    const r = result(c.i), cls = r === null ? "pass" : "fail";
    c.el.setAttribute("class", cls + (st.forced.has(c.i) ? " forced" : ""));
    const let_ = c.text.lastChild;
    if (r === null) { let_.textContent = ""; passes.push(c); }
    else { const R = reasonOf(r); let_.textContent = R.letter; let_.setAttribute("fill", `rgb(${R.color})`); rejects.push(c); counts[r] = (counts[r] || 0) + 1; }
  }
  st.passes = passes; st.rejects = rejects;
  document.querySelectorAll(".filter").forEach((d) => {
    const k = d.dataset.key;
    d.querySelector(".n").innerHTML = st.alone ? `${THUMB} ${st.alone.only[k] ?? 0} (${st.alone.counts[k] ?? 0})` : "";
  });
  $("#sb-counts").innerHTML = `<b>${st.order.length}</b> candidates · <b>${passes.length}</b> finalists`;
  $("#n-pass").textContent = passes.length; $("#n-fail").textContent = rejects.length;
  if (st.view === "items") renderList();
  renderSummary(passes, counts); renderSelected(); placeRing(); downloads(true);
}

// ---------- cards: one per candidate, in the item views and as the selection ----------
// The crop, turned so the NoR lies level when "align to horizon" is on, with its outlines, bars and
// length handles drawn over it. Cached until the options or the candidate's lengths change.
function crop(c, size) {
  const o = optsOf(c), key = JSON.stringify([size, o, st.edits.get(c.i) || null, st.show.passC, st.show.failC, result(c.i) === null]);
  const hit = st.crops.get(c.i + "|" + size);
  if (hit && hit.key === key) return hit.node;
  const L = linesOf(c), pad = o.pad;
  let th = 0, cx = (c.bb[0] + c.bb[2]) / 2, cy = (c.bb[1] + c.bb[3]) / 2;
  if (L) {
    const [[a, b], [p, q]] = L.length; cx = (a + p) / 2; cy = (b + q) / 2;
    if (o.align) { th = Math.atan2(q - b, p - a); if (Math.cos(th) < 0) th += Math.PI; }
  }
  const ax = [Math.cos(th), Math.sin(th)], nv = [-Math.sin(th), Math.cos(th)];
  const toUV = ([x, y]) => [(x - cx) * ax[0] + (y - cy) * ax[1], (x - cx) * nv[0] + (y - cy) * nv[1]];
  const toXY = ([u, v]) => [cx + u * ax[0] + v * nv[0], cy + u * ax[1] + v * nv[1]];
  // extent: every pixel of the candidate, and its lines
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  const take = (p) => { const [u, v] = toUV(p); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); };
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.blk[y * c.w + x]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) take([c.x0 + x + dx, c.y0 + y + dy]);
  if (L) for (const k of ["length", "red"]) L[k].forEach(take);
  u0 -= pad; u1 += pad; v0 -= pad; v1 += pad;
  const uw = u1 - u0, vw = v1 - v0, s = Math.max(2, Math.min(size / 10, size / Math.max(uw, vw))), dpr = devicePixelRatio || 1;
  const cv = document.createElement("canvas"); cv.width = Math.round(uw * s * dpr); cv.height = Math.round(vw * s * dpr);
  cv.style.width = uw * s + "px";
  const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0); ctx.translate(-u0, -v0);
  ctx.transform(ax[0], nv[0], ax[1], nv[1], 0, 0); ctx.translate(-cx, -cy);
  const R = Math.ceil(Math.hypot(uw, vw) / 2) + 2, sx = Math.max(0, Math.floor(cx - R)), sy = Math.max(0, Math.floor(cy - R));
  const sw = Math.min(st.W, Math.ceil(cx + R)) - sx, sh = Math.min(st.H, Math.ceil(cy + R)) - sy;
  ctx.drawImage(st.plain, sx, sy, sw, sh, sx, sy, sw, sh);
  if (o.borders) {
    ctx.lineWidth = 1 / s; ctx.strokeStyle = result(c.i) === null ? st.show.passC : st.show.failC;
    for (const [val, alpha] of [[1, 0.5], [2, 0.7]]) { ctx.globalAlpha = alpha; ctx.stroke(new Path2D(outline(c, c.blk, val))); }
    ctx.globalAlpha = 1;
  }
  const node = document.createElement("div"); node.className = "crop"; node.append(cv);
  if (L && (o.bars || o.lenImg || o.adjust)) node.append(cropMarks(c, L, { s, u0, v0, uw, vw, toUV, toXY, ax }));
  st.crops.set(c.i + "|" + size, { key, node }); return node;
}

// bars, length labels and draggable ends over a crop, in its own turned coordinates
function cropMarks(c, L, g) {
  const o = optsOf(c), f = st.um || 1, svg = el("svg", { class: "marks", viewBox: `${g.u0} ${g.v0} ${g.uw} ${g.vw}`, width: g.uw * g.s, height: g.vw * g.s });
  const px = 1 / g.s, line = (k, cls) => { const [[a, b], [p, q]] = L[k].map(g.toUV); return el("line", { x1: a, y1: b, x2: p, y2: q, class: cls }); };
  const draw = () => {
    svg.replaceChildren();
    if (o.bars) svg.append(line("length", "bar"), line("width", "bar"), line("red", "bar r"));
    if (o.lenImg) {
      for (const [k, cls, dy] of [["length", "", -5], ["red", "r", 11]]) {
        const [[a, b], [p, q]] = L[k].map(g.toUV), t = el("text", { x: (a + p) / 2, y: Math.min(b, q) + dy * px, class: cls, "font-size": 10 * px, "stroke-width": 2 * px });
        t.textContent = fmt(dist(L[k]) * f, 1); svg.append(t);
      }
    }
    if (o.adjust && result(c.i) === null) for (const k of ["length", "red"]) L[k].forEach((p, j) => {
      const [u, v] = g.toUV(p), h = el("circle", { cx: u, cy: v, r: 4 * px, class: "handle" + (k === "red" ? " r" : ""), "stroke-width": px });
      h.dataset.k = k; h.dataset.j = j; svg.append(h);
    });
  };
  draw();
  // an end slides along its own line; the result is kept in image coordinates
  svg.addEventListener("pointerdown", (e) => {
    const h = e.target.closest(".handle"); if (!h) return;
    e.preventDefault(); e.stopPropagation(); svg.setPointerCapture(e.pointerId);
    const k = h.dataset.k, j = +h.dataset.j, [A, B] = L[k], d = [B[0] - A[0], B[1] - A[1]], n = Math.hypot(...d), dir = [d[0] / n, d[1] / n];
    L = { ...L, [k]: [[...A], [...B]] };
    const move = (ev) => {
      const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const q = pt.matrixTransform(svg.getScreenCTM().inverse()), P = g.toXY([q.x, q.y]);
      let t = (P[0] - A[0]) * dir[0] + (P[1] - A[1]) * dir[1];
      t = j === 0 ? Math.min(t, n - 1) : Math.max(t, 1);
      L[k][j] = [A[0] + t * dir[0], A[1] + t * dir[1]]; draw();
    };
    const up = () => {
      svg.removeEventListener("pointermove", move); svg.removeEventListener("pointerup", up);
      edit(c.i, { [k]: L[k].map((p) => p.map((v) => Math.round(v * 100) / 100)) });
    };
    svg.addEventListener("pointermove", move); svg.addEventListener("pointerup", up);
  });
  return svg;
}

// thumbs up and down (paths from Lucide, ISC licence): the user's own verdict on a candidate
const THUMB = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>`;
const GOTO = `<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" class="dot"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/></svg>`;
function card(c, where) {
  const r = result(c.i), f = st.forced.get(c.i), d = document.createElement("div");
  d.className = "card " + (r === null ? "pass" : "fail") + (f === "in" ? " approved" : f === "out" ? " byyou" : "") +
    (where === "list" && c.i === st.sel ? " selected" : "");
  d.dataset.i = c.i;
  const state = r === null ? "Finalist" : "Rejected";
  d.innerHTML = `<div class="head"><span class="num">#${st.numbers.get(c.i)}</span><span class="state">${state}</span>
    <span class="verdict" role="group" aria-label="Your verdict"></span></div>`;
  const acts = d.querySelector(".verdict");
  const btn = (cls, on, title, fn) => {
    const b = document.createElement("button"); b.type = "button"; b.className = cls + (on ? " on" : ""); b.innerHTML = THUMB;
    b.title = title; b.setAttribute("aria-label", title); b.setAttribute("aria-pressed", on);
    b.onclick = (e) => { e.stopPropagation(); st.sel = c.i; fn(); }; acts.append(b);
  };
  btn("up", f === "in", f === "in" ? "You said this is a NoR. Click to undo" : "A NoR: keep it, with its lengths as shown (saved as ground truth)",
    () => decide(c.i, f === "in" ? null : "approve"));
  btn("down", f === "out", f === "out" ? "You said this is not a NoR. Click to let the filters decide again" : "Not a NoR: reject it (saved as ground truth)",
    () => decide(c.i, f === "out" ? null : "reject"));
  if (where === "list") d.onclick = () => select(c.i);
  const wrap = document.createElement("div"); wrap.className = "crop-wrap";
  wrap.append(crop(c, where === "selected" ? 320 : 170));
  wrap.insertAdjacentHTML("beforeend", `<button class="goto" title="Show it on the image" aria-label="Show it on the image">${GOTO}</button>`);
  wrap.querySelector(".goto").onclick = () => { select(c.i); showView("image"); focusOn(c); };
  d.append(wrap);
  const e = st.edits.get(c.i) || {};
  if (e.length || e.red) {
    d.insertAdjacentHTML("beforeend", `<div class="tag">Lengths adjusted <button class="link">reset</button></div>`);
    d.querySelector(".tag button").onclick = () => edit(c.i, { length: null, red: null });
  }
  if (r !== null) d.insertAdjacentHTML("beforeend", `<div class="why">${whyAll(c).map((k) => `<span><b class="lt" style="--c:${colour(k)}">${reasonOf(k).letter}</b> ${esc(reasonOf(k).title)}</span>`).join("")}</div>`);
  if (optsOf(c).lenCard && c.m) {
    const t = document.createElement("table");
    t.innerHTML = measures(c).map(([l, v]) => `<tr><td>${l}</td><td>${fmt(v)}</td></tr>`).join("");
    d.append(t);
  }
  return d;
}

function renderList() {
  if (st.tab === "missing") {
    $("#list").replaceChildren(...st.missing.map(missingCard));
    if (!st.missing.length) $("#list").innerHTML = `<p class="dim">No missing candidates. Right-click the image where the finder missed a NoR to mark one.</p>`;
    return;
  }
  const items = st.tab === "pass" ? st.passes || [] : st.rejects || [];
  $("#list").replaceChildren(...items.map((c) => card(c, "list")));
  if (!items.length) $("#list").innerHTML = `<p class="dim">${st.tab === "pass" ? "No finalists." : "Nothing rejected."}</p>`;
}

// ---------- selection ----------
function select(i) {
  st.sel = i; renderSelected(); placeRing();
  document.querySelectorAll("#list .card").forEach((d) => d.classList.toggle("selected", +d.dataset.i === i));
}
// in the item views, the selected candidate's card is brought into sight, on the tab that lists it
function revealSelected(block) {
  if (st.sel == null || !st.meta) return;
  const t = result(st.sel) === null ? "pass" : "fail";
  if (t !== st.tab) { setTab(t); renderList(); }
  const d = $(`#list .card[data-i="${st.sel}"]`);
  if (d) d.scrollIntoView({ block, behavior: block === "center" ? "auto" : "smooth" });
}
function renderSelected() {
  const c = st.sel == null ? null : st.cands[st.sel];
  $("#selected").classList.toggle("dim", !c);
  $("#selected").replaceChildren(c ? card(c, "selected") : "Click a candidate on the image.");
  $("#sel-prev").disabled = $("#sel-next").disabled = !st.order.length;
}
function placeRing() {
  if (!st.ring) return;
  const c = st.sel == null ? null : st.cands[st.sel];
  st.ring.style.display = c ? "" : "none";
  if (!c) return;
  const [a, b, cc, d] = c.bb;
  st.ring.setAttribute("cx", (a + cc) / 2); st.ring.setAttribute("cy", (b + d) / 2);
  st.ring.setAttribute("r", Math.hypot(cc - a, d - b) / 2 + 4 / st.zoom);
}
// the next candidate by number among those on show
// (in the item views: among the cards on show)
function step(dir) {
  const list = st.view === "items" ? (st.tab === "pass" ? st.passes : st.tab === "fail" ? st.rejects : []) || []
    : st.order.filter((c) => (result(c.i) === null ? st.show.pass : st.show.fails));
  if (!list.length) return;
  const k = list.findIndex((c) => c.i === st.sel);
  const c = list[k < 0 ? (dir > 0 ? 0 : list.length - 1) : (k + dir + list.length) % list.length];
  select(c.i); if (st.view === "image") focusOn(c); else revealSelected("nearest");
}
$("#sel-prev").onclick = () => step(-1);
$("#sel-next").onclick = () => step(1);

function stats(xs) {
  const v = xs.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b), n = v.length;
  if (!n) return { n };
  const mean = v.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(n - 1, 1));
  const med = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  return { n, mean, sd, med, min: v[0], max: v[n - 1], v };
}

function hist(label, s) {
  const W = 220, H = 70, bins = 20;
  if (!s.n) return "";
  const lo = s.min, hi = s.max === s.min ? s.min + 1 : s.max, cnt = new Array(bins).fill(0);
  for (const x of s.v) cnt[Math.min(bins - 1, Math.floor(((x - lo) / (hi - lo)) * bins))]++;
  const top = Math.max(...cnt), bw = W / bins;
  const bars = cnt.map((c, k) => `<rect x="${k * bw + 0.5}" y="${H - (c / top) * H}" width="${bw - 1}" height="${(c / top) * H}"><title>${c}</title></rect>`).join("");
  return `<div class="hist">${label}<br><svg width="${W}" height="${H + 14}"><g>${bars}</g>
    <text x="0" y="${H + 12}" fill="currentColor" font-size="10">${fmt(lo)}</text>
    <text x="${W}" y="${H + 12}" fill="currentColor" font-size="10" text-anchor="end">${fmt(hi)}</text></svg></div>`;
}

function summaryRows(passes) {
  return MEASURES.map((_, k) => [measures(passes[0] || { m: {} })[k][0], stats(passes.map((c) => measures(c)[k][1]))]);
}
function renderSummary(passes, counts) {
  const rows = summaryRows(passes);
  st.counts = counts;
  const tbl = `<table><tr><th>measurement</th><th>n</th><th>mean</th><th>SD</th><th>median</th><th>min</th><th>max</th></tr>` +
    rows.map(([l, s]) => `<tr><td>${l}</td><td>${s.n}</td><td>${fmt(s.mean)}</td><td>${fmt(s.sd)}</td><td>${fmt(s.med)}</td><td>${fmt(s.min)}</td><td>${fmt(s.max)}</td></tr>`).join("") + "</table>";
  const reasons = Object.entries(counts).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<b class="lt" style="--c:${colour(k)}">${reasonOf(k).letter}</b> ${esc(reasonOf(k).title)}: ${n}`).join(" · ");
  const scale = st.um ? `Scale from the file: ${st.um.toFixed(4)} µm per pixel.` : "No scale in the file, so lengths are in pixels.";
  $("#summary").classList.remove("dim");
  $("#summary").innerHTML = `<div>${passes.length} passing NoRs. ${scale}</div><div class="tbl">${tbl}</div>
    <div class="hists">${rows.map(([l, s]) => hist(l, s)).join("")}</div><div class="reasons">Rejected: ${reasons || "none"}</div>`;
}

// ---------- downloads ----------
function downloads(on) {
  for (const id of ["#dl-cands", "#dl-summary"]) $(id).disabled = !on || !st.meta;
  $("#dl-truth").disabled = !st.img;
}
const base = () => st.fileName.replace(/\.[^.]+$/, "") || "nors";
function save_(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
const csv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\n");
$("#dl-cands").onclick = () => {
  const u = st.um ? "um" : "px";
  const head = ["n", "x_px", "y_px", "status", "reason", "rejected_by", "decision", "lengths", ...MEASURES.map(([k, , s]) => (s ? `${k}_${u}` : k))];
  const rows = st.order.map((c) => {
    const r = result(c.i), f = st.forced.get(c.i);
    return [st.numbers.get(c.i), fmt(c.cx, 1), fmt(c.cy, 1), r === null ? "finalist" : "rejected", r === null ? "" : reasonOf(r).title,
      whyAll(c).map((k) => reasonOf(k).letter).join(" "), { in: "approved", out: "rejected by you" }[f] || "", measured(c) || "",
      ...measures(c).map(([, v]) => fmt(v, 3))];
  });
  save_(base() + "_candidates.csv", csv([head, ...rows]), "text/csv");
};
$("#dl-summary").onclick = () => {
  const rows = [["measurement", "n", "mean", "sd", "median", "min", "max"],
    ...summaryRows(st.passes).map(([l, s]) => [l, s.n, fmt(s.mean, 3), fmt(s.sd, 3), fmt(s.med, 3), fmt(s.min, 3), fmt(s.max, 3)]),
    [], ["rejected", "count"], ...Object.entries(st.counts).map(([k, n]) => [`${reasonOf(k).letter} ${reasonOf(k).title}`, n])];
  save_(base() + "_summary.csv", csv(rows), "text/csv");
};
// What a person decided on this image, for scoring finders in the lab (detection/nor_lab.py reads it
// with --labels) and for the repo's ground truth (detection/ground_truth.py): only what the user marked.
// A candidate nobody voted on is ambiguous, so it is left out.
function truth() {
  const labels = [];
  for (const c of st.order) {
    const f = st.forced.get(c.i); if (!f) continue;
    const L = linesOf(c), px = measuresPx(c);
    labels.push({ id: st.numbers.get(c.i), x: c.cx, y: c.cy, label: f === "in" ? 1 : 0, source: "user",
      decision: f === "in" ? "approved" : "rejected", measured: f === "in" ? measured(c) : null,
      length_px: px.length ?? null, red_length_px: px.red_length ?? null, width_px: px.width ?? null,
      lines: L ? { length: L.length, red: L.red } : null });
  }
  st.missing.forEach((m, k) => labels.push({ id: "M" + (k + 1), kind: "missing", x: m.x, y: m.y, label: 1, source: "user", radius_px: MISSING_RADIUS }));
  const src = st.source || { kind: "local" };
  const location = src.kind === "drive" ? { source: "drive", drive_id: src.id, url: `https://drive.google.com/file/d/${src.id}/view` } : { source: "local" };
  return { format: "norfinder-ground-truth/2", exported: new Date().toISOString(),
    image: { name: st.fileName, sha256: st.sha, width: st.W, height: st.H, um_per_px: st.um || null, location },
    finder: st.meta ? st.meta.finder : null, finder_settings: st.runOverrides || {}, filters: { values: st.values, off: [...st.off] }, labels };
}
// a new issue, labelled for the daily intake, naming the image; the user attaches the downloaded file to it
function issueUrl(gt, file) {
  const n = (p) => gt.labels.filter(p).length;
  const body = [`Ground truth marked on the NoR Finder page.`, ``,
    `- Image: ${gt.image.name}`, `- SHA-256: ${gt.image.sha256}`, `- Google Drive: ${gt.image.location.url}`,
    `- Finder: ${gt.finder || "none run"}`,
    `- Marked: ${n((L) => !L.kind && L.label === 1)} NoRs, ${n((L) => L.label === 0)} not NoRs, ${n((L) => L.kind === "missing")} missing candidates`,
    ``, `**Attach ${file} below before submitting** (drag it into this box).`].join("\n");
  const q = new URLSearchParams({ labels: GT_LABEL, title: `Ground truth: ${gt.image.name}`, body });
  return `https://github.com/${REPO}/issues/new?${q}`;
}
$("#dl-truth").onclick = () => {
  const gt = truth(), btn = $("#dl-truth");
  if (!gt.labels.length) return notice("Nothing marked yet: vote on candidates with the thumbs, or right-click the image to mark a missing one.", btn);
  const file = base() + "_ground_truth.json";
  save_(file, JSON.stringify(gt, null, 1), "application/json");
  if (gt.image.location.source !== "drive") return notice(LOCAL_GT, btn);
  window.open(issueUrl(gt, file), "_blank", "noopener");
  notice(`Downloaded ${file}. Attach it to the GitHub issue that just opened, then submit. ` +
    "Only the candidates you marked (thumbs up or down) and your missing candidates are sent.", btn);
};

// ---------- notices: a short message, at the top of the view or under the button it is about ----------
const LOCAL_GT = "Ground truth cannot be sent from local files, only from Google Drive.";
function notice(text, anchor) {
  const n = $("#notice");
  $("#notice-text").textContent = text; n.hidden = false; n.classList.toggle("anchored", !!anchor);
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    const top = r.bottom + 8 + n.offsetHeight > innerHeight ? r.top - 8 - n.offsetHeight : r.bottom + 8;
    Object.assign(n.style, { left: Math.max(8, Math.min(r.left, innerWidth - n.offsetWidth - 8)) + "px", top: top + "px" });
  } else {
    const r = $("#view").getBoundingClientRect();
    Object.assign(n.style, { left: r.left + (r.width - n.offsetWidth) / 2 + "px", top: r.top + 56 + "px" });
  }
  $("#notice-ok").focus();
}
$("#notice-ok").onclick = () => { $("#notice").hidden = true; };

// ---------- the image view: drag to move, scroll up and down to zoom, sideways to step ----------
function focusOn(c) {
  const sc = $("#scroller");
  sc.scrollTo({ left: c.cx * st.zoom - sc.clientWidth / 2, top: c.cy * st.zoom - sc.clientHeight / 2, behavior: "smooth" });
}
function candAt(e) {
  const g = e.target.closest && e.target.closest("g[data-i]");
  return g ? st.cands[+g.dataset.i] : null;
}
{
  const sc = $("#scroller"); let drag = null;
  sc.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !st.img) return;
    drag = { x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop, c: candAt(e), moved: false, id: e.pointerId };
  });
  sc.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) { drag.moved = true; sc.setPointerCapture(drag.id); sc.classList.add("dragging"); $("#tip").hidden = true; }
    if (drag.moved) { sc.scrollLeft = drag.l - (e.clientX - drag.x); sc.scrollTop = drag.t - (e.clientY - drag.y); }
  });
  const end = () => {
    if (drag && !drag.moved && drag.c) select(st.sel === drag.c.i ? null : drag.c.i);
    drag = null; sc.classList.remove("dragging");
  };
  sc.addEventListener("pointerup", end); sc.addEventListener("pointercancel", () => { drag = null; sc.classList.remove("dragging"); });
  let acc = 0, quietUntil = 0;
  sc.addEventListener("wheel", (e) => {
    if (!st.img) return;
    e.preventDefault();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // a trackpad swipe sends many small steps: one candidate per swipe-length, then a pause
      if (performance.now() < quietUntil) return;
      acc += e.deltaX * k;
      if (Math.abs(acc) >= 60) { step(Math.sign(acc)); acc = 0; quietUntil = performance.now() + 250; }
    } else setZoom(st.zoom * Math.exp(-e.deltaY * k * 0.0015), e);
  }, { passive: false });
}

function tip(e) {
  const c = candAt(e), t = $("#tip");
  if (!c || $("#scroller").classList.contains("dragging")) { t.hidden = true; return; }
  const r = result(c.i);
  let s = `#${st.numbers.get(c.i)} ` + (r === null ? "finalist" : `rejected: ${whyAll(c).map((k) => `${reasonOf(k).letter} ${reasonOf(k).title}`).join(", ")}`);
  if (c.m) s += "\n" + measures(c).slice(0, 3).map(([l, v]) => `${l}: ${fmt(v)}`).join("\n");
  t.textContent = s; t.hidden = false;
  t.style.left = Math.min(e.clientX + 14, innerWidth - 330) + "px"; t.style.top = e.clientY + 14 + "px";
}
$("#overlay").addEventListener("mousemove", tip);
$("#overlay").addEventListener("mouseleave", () => ($("#tip").hidden = true));
function helpTip(e) {
  const h = e.target.closest && e.target.closest(".help"), t = $("#tip");
  if (!h) return;
  const r = h.getBoundingClientRect();
  t.textContent = h.dataset.help; t.hidden = false;
  t.style.left = Math.min(r.right + 8, innerWidth - 330) + "px"; t.style.top = r.top + "px";
}
const hideHelp = (e) => { if (e.target.closest && e.target.closest(".help")) $("#tip").hidden = true; };
document.addEventListener("mouseover", helpTip); document.addEventListener("focusin", helpTip);
document.addEventListener("mouseout", hideHelp); document.addEventListener("focusout", hideHelp);

$("#finder").onchange = () => { buildDetect(); if (!st.meta) useFilters($("#finder").value); };
$("#find").onclick = detect;
$("#reset-detect").onclick = () => { const f = $("#finder").value; st.detectValues[f] = { ...st.about[f].detection_params }; buildDetect(); };
$("#reset-filters").onclick = () => {
  try { localStorage.removeItem(STORE); } catch { /* nothing saved */ }
  st.values = { ...st.defaults }; st.off.clear(); buildFilters(); refilter();
};
$("#zoom-in").onclick = () => setZoom(st.zoom * 1.25);
$("#zoom-out").onclick = () => setZoom(st.zoom / 1.25);
for (const id of ["show-r", "show-g", "show-b"]) $("#" + id).onchange = () => (st.img ? drawBase() : st.peeked && st.peek.redraw());

// ---------- the Show and Options menus, remembered in this browser ----------
function applyShow() {
  const s = st.show, o = $("#overlay");
  for (const [k, cls] of [["pass", "no-pass"], ["fails", "no-fails"], ["nums", "no-nums"], ["letters", "no-letters"], ["lines", "no-lines"]]) o.classList.toggle(cls, !s[k]);
  for (const [k, v] of [["--pass-c", s.passC], ["--fail-c", s.failC], ["--pass-w", s.passW + "px"], ["--fail-w", s.failW + "px"]]) o.style.setProperty(k, v);
}
{
  const bind = { "show-pass": "pass", "show-fails": "fails", "show-nums": "nums", "show-letters": "letters", "show-lines": "lines", "pass-w": "passW", "pass-c": "passC", "fail-w": "failW", "fail-c": "failC" };
  for (const [id, k] of Object.entries(bind)) {
    const inp = $("#" + id);
    inp.type === "checkbox" ? (inp.checked = st.show[k]) : (inp.value = st.show[k]);
    inp.oninput = () => {
      st.show[k] = inp.type === "checkbox" ? inp.checked : inp.type === "range" ? +inp.value : inp.value;
      writeJSON(SHOW, st.show); applyShow(); if (/C$/.test(k) && st.meta) { st.crops.clear(); if (st.view === "items") renderList(); renderSelected(); }
    };
  }
  applyShow();
  const opts = { "opt-align": "align", "opt-borders": "borders", "opt-bars": "bars", "opt-len-img": "lenImg", "opt-len-card": "lenCard", "opt-adjust": "adjust" };
  const changed = () => {
    const diff = (t) => Object.fromEntries(Object.entries(st.opt[t]).filter(([k, v]) => v !== CARD_DEFAULTS[t][k]));
    writeJSON(CARDS, { pass: diff("pass"), fail: diff("fail") });
    if (st.meta) { if (st.view === "items") renderList(); renderSelected(); }
  };
  for (const [id, k] of Object.entries(opts)) { const inp = $("#" + id); inp.onchange = () => { st.opt[st.tab][k] = inp.checked; changed(); }; }
  // an empty box puts the view's own padding back
  const pad = $("#opt-pad");
  pad.oninput = () => { const v = parseInt(pad.value, 10); st.opt[st.tab].pad = isFinite(v) && v >= 0 ? v : CARD_DEFAULTS[st.tab].pad; changed(); };
  // the menu shows the options of the view on show
  st.showOpts = () => {
    $("#card-menu").hidden = st.tab === "missing";
    if (st.tab === "missing") return;
    for (const [id, k] of Object.entries(opts)) $("#" + id).checked = st.opt[st.tab][k];
    if (document.activeElement !== pad) pad.value = st.opt[st.tab].pad;
    pad.placeholder = CARD_DEFAULTS[st.tab].pad;
    $("#card-menu summary").textContent = (st.tab === "pass" ? "Finalist" : "Rejected") + " options";
  };
  st.showOpts();
}
for (const [id, t] of [["#tab-pass", "pass"], ["#tab-fail", "fail"], ["#tab-miss", "missing"]]) $(id).onclick = () => {
  if (st.tab !== t) setTab(t); renderList();
};
function setTab(t) {
  st.tab = t; $("#tab-pass").classList.toggle("on", t === "pass"); $("#tab-fail").classList.toggle("on", t === "fail");
  $("#tab-miss").classList.toggle("on", t === "missing"); st.showOpts();
}

// ---------- boxes that fold: the finder and the filters, folded until there is an image ----------
function fold(open) { document.querySelectorAll(".box.foldable").forEach((b) => b.classList.toggle("folded", !open)); }
document.querySelectorAll(".box.foldable > .sec-head h2, .box.foldable > h2").forEach((h) => {
  h.tabIndex = 0; h.setAttribute("role", "button");
  const flip = () => h.closest(".box").classList.toggle("folded");
  h.onclick = flip; h.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } };
});
fold(false); loadShine();

// ---------- views, side bars and theme ----------
function showView(v) {
  st.view = v; $("#tip").hidden = true;
  $("#image-view").hidden = v !== "image"; $("#items-view").hidden = v !== "items";
  $("#view").dataset.view = v;
  $("#switch").textContent = v === "image" ? "Item View" : "Image View";
  if (v === "items" && st.meta) { renderList(); revealSelected("center"); }
  if (v === "image") thumbView();
}
$("#switch").onclick = () => showView(st.view === "image" ? "items" : "image");

// the side bars take the width they are dragged to; a double click puts one back
{
  const lay = $("#layout"), saved = readJSON(BARS);
  const set = (side, w) => {
    if (w == null) { lay.style.removeProperty(side === "left" ? "--lw" : "--rw"); return; }
    lay.style.setProperty(side === "left" ? "--lw" : "--rw", Math.round(Math.max(200, Math.min(w, innerWidth * 0.4))) + "px");
  };
  set("left", saved.left); set("right", saved.right);
  for (const side of ["left", "right"]) {
    const g = $("#gutter-" + side);
    g.addEventListener("pointerdown", (e) => {
      g.setPointerCapture(e.pointerId); document.body.classList.add("resizing");
      const move = (ev) => {
        const r = lay.getBoundingClientRect(), w = side === "left" ? ev.clientX - r.left : r.right - ev.clientX;
        saved[side] = w; set(side, w); thumbView();
      };
      const up = () => { g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); document.body.classList.remove("resizing"); writeJSON(BARS, saved); };
      g.addEventListener("pointermove", move); g.addEventListener("pointerup", up);
    });
    g.addEventListener("dblclick", () => { delete saved[side]; set(side, null); writeJSON(BARS, saved); thumbView(); });
  }
}

function theme() {
  const set = document.documentElement.dataset.theme;
  return set || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
}
$("#theme").onclick = () => {
  const t = theme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME, t); } catch { /* private mode: lasts for this page only */ }
};
// a dropdown closes when the user clicks anywhere else
document.addEventListener("click", (e) => { document.querySelectorAll("details.menu[open]").forEach((m) => { if (!m.contains(e.target)) m.open = false; }); });
showView("image");
// the release writes the version into the element's title; show it as text
$("#sb-version").textContent = "v" + $("#sb-version").title.replace(/^version /, "");
// every 5 minutes, compare this page's version with the one now published; a newer one lights up the
// version box, which then reloads the page when clicked
{
  const mine = $("#sb-version").title, v = $("#sb-version");
  const check = async () => {
    try {
      const html = await (await fetch(location.pathname, { cache: "no-store" })).text();
      const live = (html.match(/id="sb-version" title="([^"]*)"/) || [])[1];
      if (!live || live === mine || v.classList.contains("stale")) return;
      v.classList.add("stale"); v.textContent = "Refresh for " + live.replace(/^version /, "v");
      v.title = `This page is ${mine}; ${live} is out. Click to refresh.`; v.setAttribute("role", "button"); v.tabIndex = 0;
      v.onclick = v.onkeydown = (e) => { if (e.type === "click" || e.key === "Enter") location.reload(); };
    } catch { /* offline: try again next time */ }
  };
  setInterval(check, 5 * 60 * 1000);
}

start();
