// The page's shell: it runs the study the address names (?study=<id>, the default when none is named),
// and knows none of them; the header's switcher offers the ones the build lists. What it gives a study, as shell in mount(shell): loading images (from the
// computer or Google Drive), Python (the study's own, run in worker.js), the viewer the study asks for,
// the status line and the busy screen, notices, the user's saved settings, downloads and ground-truth
// submission; and around them the theme, side bars, foldable boxes, the memory popup and the version
// history.
//
// The study's hooks, all optional, returned from mount: ready(info) once its Python is loaded;
// opening(name, source) when an image starts to load; opened(meta) once it is shown; result(action,
// meta, bytes, echo) for each call; error() when Python failed; settled() a promise for the study's own
// work still running, holds(message) while a result is not the last of its kind, and idle() once a held
// button is free again; painter, a preview
// painter for an image's bytes as they arrive; showImage() when the shell brings the image back into
// view; stored(key), what one of the study's browser keys holds, for the Manage storage dialog:
// {group: "settings", what} or {group: "images", image, what}, null for a key not its own; and the viewer's
// hooks (viewer2d.js).
"use strict";
import { viewer as viewer2d } from "./viewer2d.js";

const $ = (s) => document.querySelector(s);
const VIEWERS = { image2d: viewer2d };
const DEFAULT_STUDY = "viewer";
// the browser keys the shell saves under; their names predate studies, and a user's saved state lives in them
const THEME = "nor-theme"; // "dark" | "light"; absent = follow the system
const BARS = "nor-bars-v1"; // {left, right}: side bar widths in pixels
const SOURCE = "nor-load-source"; // "local" | "drive": where Load reads from
const DRIVE_LINK = "nor-drive-link"; // the last Google Drive link pasted
const THUMBS = "nor-drive-thumbs"; // "on" | "off": whether the Drive dialog shows thumbnails
const AUTO_SAVE = "nor-drive-autosave"; // "on" | "off": whether an image downloaded from Drive is kept on this device
const SAVED_THUMB = "nor-drive-thumb:"; // + Drive id: a JPEG data URL of the image, saved when it was opened
const SAVED_THUMBS = "nor-drive-thumbs-saved"; // [Drive id], oldest first: which images have one
const THUMB_NAMES = "nor-drive-thumb-names"; // {Drive id: file name}: the image each saved thumbnail shows
const RECENT = "nor-drive-recent"; // [{id, name, path}], newest first: images opened from Drive, path their folders under the link
// Cache Storage, + Drive id: an image downloaded from Drive, its file name (URI-encoded) and when it was saved
// in the headers
const IMAGES = "nor-images-v1", IMAGE_NAME = "x-nor-name", IMAGE_AT = "x-nor-saved-at";
const SEEN_VERSION = "nor-seen-version"; // the site version the user last saw, to tell them what changed since
const MEMORY_TIP = "nor-memory-tip-off"; // true: the user asked never to see the low-memory popup again
// the page's memory with a study's Python loaded (studies/nor/detection/browser/MEMORY.md), and the device
// memory below which it asks the user to free some: browsers say only how much a computer has in all, never
// how much is free
const PAGE_GB = 1, LOW_GB = 4;
// what Chrome holds for the tab beyond what a page can read: the compiled code of Python and its packages, and the
// browser's own share; measured once as Chrome's private memory for the tab against the readable total (2026-10-07)
const UNREAD_MB = 190;
// where ground truth is submitted: an issue with the study's label, which the repo's intake reads
const REPO = "missingbulb/NoRFinder";
const LOCAL_GT = "Ground truth cannot be sent from local files, only from Google Drive.";

function readJSON(key, fallback = {}) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function writeJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode: lasts for this page only */ }
}
const sizeText = (n) => (!n ? "0 KB" : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : n < 2 ** 30 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 2 ** 30).toFixed(1)} GB`);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// the page's state: the shell's fields below, and whatever the study keeps beside them
const st = { worker: null, H: 0, W: 0, um: null, img: null, plain: null, zoom: 2, fileName: "", sha: "", source: null, heap: null, files: 0 };
let study = {}, view = null, manifest = null, base = "";

// ---------- status ----------
function status(text, err) {
  const s = $("#status"); s.textContent = text; s.classList.toggle("err", !!err);
  if (st.busySince) $("#busy-text").textContent = text;
  if (err) busy(false);
}
// the spinner and elapsed time shown while Python loads or works. look "scan": work over an image shows a
// photocopier's light sweeping across it instead of the spinner; "peek": the image painting as it arrives
// stays in view, the text in a pill below it
function busy(on, text, look) {
  clearInterval(st.busyTimer); st.busySince = on ? st.busySince || Date.now() : 0;
  $("#spin").classList.toggle("on", on); $("#busy").hidden = !on;
  $("#busy").classList.toggle("scan", on && look === "scan"); $("#busy").classList.toggle("peek", on && look === "peek");
  if (!on) return;
  $("#busy-text").textContent = text || $("#status").textContent; $("#busy-time").textContent = "";
  st.busyTimer = setInterval(() => { $("#busy-time").textContent = ((Date.now() - st.busySince) / 1000).toFixed(0) + " s"; }, 500);
}
// the memory the tab holds: Python's (the bulk, and it never shrinks), its files and, in Chrome and Edge, the
// page's own scripts, plus an estimate of what a page cannot read
function statusBar() {
  const js = performance.memory?.usedJSHeapSize, total = st.heap == null ? null : st.heap + st.files + (js || 0) + UNREAD_MB * 2 ** 20;
  const gb = navigator.deviceMemory, el = $("#sb-memory");
  el.textContent = total == null ? "" : `Memory Usage ${mbOf(total)} MB`;
  el.classList.toggle("warn", !!gb && total > gb * 2 ** 30 / 4);
  el.title = total == null ? "" : `Python ${mbOf(st.heap)} MB, its files ${mbOf(st.files)} MB` + (js ? `, the page ${mbOf(js)} MB` : "") +
    `, and an estimated ${UNREAD_MB} MB for Python's compiled code and the browser, which a page cannot read.` + (gb ? ` This computer has ${gb} GB in all.` : "");
  $("#sb-file").textContent = st.fileName || "No image";
}
const mbOf = (n) => Math.round(n / 2 ** 20);

// ---------- buttons whose action takes a while: disabled, with a small spinner, until the action is done ----------
// the worker's next message of a kind ("opened", or "result:<action>"), or its error
const waiting = {};
const kindOf = (m) => (m.type === "result" ? "result:" + m.action : m.type);
const until = (kind) => new Promise((ok, bad) => (waiting[kind] ||= []).push({ ok, bad }));
function settle(m) {
  if (m.type === "error") for (const w of Object.values(waiting)) w.splice(0).forEach((x) => x.bad(new Error(m.text)));
  else if (waiting[kindOf(m)] && !study.holds?.(m)) waiting[kindOf(m)].splice(0).forEach((x) => x.ok(m));
}
// a frame after the button is disabled, so it shows before the work holds the page
const painted = () => new Promise((ok) => requestAnimationFrame(() => setTimeout(ok)));
async function working(btn, action) {
  if (btn.classList.contains("working")) return;
  btn.classList.add("working"); btn.disabled = true;
  // whatever the page redraws meanwhile, the button stays held until the action is done
  const hold = new MutationObserver(() => { if (!btn.disabled) btn.disabled = true; });
  hold.observe(btn, { attributes: true, attributeFilter: ["disabled"] });
  try {
    await painted(); await action();
    await study.settled?.();
  } catch (e) {
    console.warn(e);
  } finally {
    hold.disconnect(); btn.classList.remove("working"); btn.disabled = false; study.idle?.();
  }
}
const slow = (btn) => { const act = btn.onclick; btn.onclick = (e) => working(btn, () => act.call(btn, e)); };

// ---------- Python ----------
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
  st.worker = new Worker("worker.js?study=" + encodeURIComponent(manifest.id), { type: "module" });
  st.worker.onmessage = (e) => onWorker(e.data);
  st.worker.onerror = (e) => onWorker({ type: "error", text: e.message || "Python stopped." });
  if (navigator.deviceMemory <= LOW_GB) memoryTip();
}
// one of the study's Python actions; its answer reaches the study's result hook
function call(action, args, echo) { st.worker.postMessage({ type: "call", action, args, echo }); }

// ---------- the low-memory popup: on a computer with little memory, and whenever the page runs out of it ----------
const OUT_OF_MEMORY = /MemoryError|out of memory|Memory\.grow|allocation failed|Maximum memory|OOM/i;
function memoryTip(ranOut) {
  if (!ranOut && readJSON(MEMORY_TIP, false)) return;
  const mac = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform || navigator.platform);
  $("#memory-mod").textContent = mac ? "⌘" : "Ctrl";
  $("#memory-why").textContent = ranOut
    ? "The page ran out of memory. Please close other tabs and apps, then reload the page."
    : `This computer has ${navigator.deviceMemory} GB of memory and this page needs about ${PAGE_GB} GB. ` +
      "Please close other tabs and apps, so it does not slow down or stop.";
  $("#memory-never").hidden = !!ranOut; $("#memory-off").checked = false;
  if (!$("#memory-dlg").open) $("#memory-dlg").showModal();
}
$("#memory-off").onchange = () => writeJSON(MEMORY_TIP, $("#memory-off").checked);

function onWorker(m) {
  if (m.heap != null) { st.heap = m.heap; st.files = m.files || 0; }
  handle(m); settle(m); statusBar();
}
function handle(m) {
  if (m.type === "progress") status(m.text);
  else if (m.type === "error") {
    // the request that failed is over: its button can be pressed again
    study.error?.();
    status("Error: " + m.text, true); if (OUT_OF_MEMORY.test(m.text)) memoryTip(true);
  } else if (m.type === "ready") {
    st.ready = true; $("#spin").classList.remove("on");
    study.ready?.(m.info); statusBar();
    status("Ready. Load an image.");
    if (st.queued) { const q = st.queued; st.queued = null; send(q.name, q.bytes); }
  } else if (m.type === "opened") {
    st.um = m.meta.um; fileInfo(m.meta.info);
    view.show(m.meta.W, m.meta.H, m.images);
    busy(false); statusBar();
    showImage(); fold(true); loadShine();
    status("Image loaded."); // the study's opened hook says what comes next, if anything
    study.opened?.(m.meta);
    if (st.source && st.source.kind === "local" && manifest.groundTruth) notice(LOCAL_GT);
    if (st.source && st.source.kind === "drive") saveThumb(st.source.id, st.fileName);
  } else if (m.type === "result") {
    study.result?.(m.action, m.meta, m.bytes, m.echo);
  }
}

// ---------- loading ----------
// what the file says about the image ([label, text] rows); null clears it
function fileInfo(rows) {
  const box = $("#file-info"), item = (tag, text, cls) => Object.assign(document.createElement(tag), { textContent: text, className: cls || "" });
  box.replaceChildren(...(rows || []).flatMap(([k, v]) => [item("dt", k), item("dd", v)]));
  if (rows && !rows.some(([k]) => k === "Microscope")) box.append(item("dd", "No microscope or acquisition details in the file.", "dim none"));
  $("#file-box").classList.toggle("empty", !rows);
  if (!rows) $("#file-box").open = false;
}

// source: where the image came from, {kind: "local"} or {kind: "drive", id}
async function openBytes(name, bytes, source) {
  const opened = until("opened"); working($("#load-main"), () => opened);
  st.fileName = name; st.source = source;
  study.opening?.(name, source);
  st.sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  $("#file-name").textContent = name; $("#file-name").classList.remove("dim"); fileInfo(null); statusBar();
  view.clear(); $("#sb-counts").textContent = "";
  if (st.ready) return send(name, bytes);
  // Python is still loading: the image opens the moment it is ready
  st.queued = { name, bytes }; busy(true, "Python is still loading; your image opens as soon as it is ready…", st.peeked && "peek"); loadShine();
}
function send(name, bytes) {
  busy(true, "Reading the image…", st.peeked && "peek");
  st.worker.postMessage({ type: "open", name, bytes }, [bytes]);
}
// a painter for the image's bytes as they arrive, shown until Python's own drawing replaces it; the study's,
// when it has one
function peek() {
  st.peeked = false;
  return study.painter ? view.preview(study.painter) : () => false;
}
// Load calls for attention until an image is open, then steps back to a plain button
const loadShine = () => { $("#load-main").classList.toggle("shine", !st.img && !st.queued); $("#load").classList.toggle("done", !!st.img); };
$("#file").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const bytes = await f.arrayBuffer(); peek()(bytes, bytes.byteLength);
  openBytes(f.name, bytes, { kind: "local" }); e.target.value = "";
};
function load(src) {
  writeJSON(SOURCE, src); $("#load-menu").open = false;
  if (src === "local") return $("#file").click();
  const home = ((window.NOR_CONFIG || {}).drive || {}).defaultLink || "";
  $("#drive-link").value = readJSON(DRIVE_LINK, "") || home; $("#drive-dlg").showModal(); $("#drive-link").select(); showSaved();
  if (NorDrive.parse($("#drive-link").value)?.kind === "folder") $("#drive-go").click();
}
$("#load-main").onclick = () => load(readJSON(SOURCE, "local"));
document.querySelectorAll("#load-menu .item").forEach((b) => (b.onclick = () => load(b.dataset.src)));

// the images opened from Drive lately, in Load's dropdown; a Drive id names one file wherever it is, so two of
// one name stay apart. openRecent is the Drive dialog's, which opens the copy kept on this device when there is one.
const RECENT_KEEP = 10;
let openRecent = () => {};
function remember(id, name, path) {
  writeJSON(RECENT, [{ id, name, path }, ...readJSON(RECENT, []).filter((r) => r.id !== id)].slice(0, RECENT_KEEP));
  showRecent();
}
function showRecent() {
  const list = readJSON(RECENT, []), box = $("#recent");
  box.hidden = !list.length;
  box.replaceChildren(box.firstElementChild, ...list.map((r) => {
    const b = document.createElement("button"), where = ["Google Drive", ...(r.path || [])].join(" / ");
    b.type = "button"; b.className = "item recent"; b.title = `${where} / ${r.name}`;
    b.innerHTML = `<svg class="drive-logo" aria-hidden="true"><use href="#drive-logo"/></svg><span><span class="name">${esc(r.name)}</span><span class="where">${esc(where)}</span></span>`;
    b.onclick = () => { $("#load-menu").open = false; openRecent(r); };
    return b;
  }));
}
showRecent();

// the Drive dialog: a pasted file link loads at once; a folder link lists its images and subfolders, where a
// click selects and Open (or a double click) opens the selection
function driveDialog() {
  const msg = (t, err) => { const m = $("#drive-msg"); m.textContent = m.title = t; m.classList.toggle("err", !!err); };
  let trail = [], chosen = null;
  // path: the folders the image is in under the link it was opened from
  const take = async (id, name, path) => {
    thumbs.stop();
    const kept = await savedImage(id);
    if (kept) {
      $("#drive-dlg").close(); msg("");
      peek()(kept.bytes, kept.bytes.byteLength); remember(id, kept.name, path);
      return openBytes(kept.name, kept.bytes, { kind: "drive", id });
    }
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
      if ($("#drive-autosave").checked) saveImage(id, f.name, f.bytes);
      remember(id, f.name, path);
      openBytes(f.name, f.bytes, { kind: "drive", id });
    } catch (err) {
      busy(false); if (!$("#drive-dlg").open) $("#drive-dlg").showModal();
      msg(err.message || String(err), true);
    }
  };
  const choose = (f, b) => {
    chosen = f; $("#drive-open").disabled = !f;
    $("#drive-list").querySelectorAll(".item").forEach((e) => e.setAttribute("aria-selected", e === b));
  };
  const enter = (f) => (f.folder ? (trail.push(f), show()) : take(f.id, f.name, trail.slice(1).map((t) => t.name)));
  openRecent = (r) => take(r.id, r.name, r.path || []);
  const show = async () => {
    const at = trail[trail.length - 1];
    $("#drive-path").innerHTML = trail.map((t, k) => `<button type="button" class="link" data-k="${k}">${esc(t.name)}</button>`).join(" / ");
    $("#drive-path").querySelectorAll("button").forEach((b) => (b.onclick = () => { trail = trail.slice(0, +b.dataset.k + 1); show(); }));
    $("#drive-path").scrollLeft = $("#drive-path").scrollWidth;
    $("#drive-list").replaceChildren(); choose(null); thumbs.reset(); msg("Reading the folder…");
    try {
      const items = await NorDrive.list(at.id);
      msg(items.length ? "" : "No TIFF or PNG images here.");
      for (const f of items) {
        const b = document.createElement("button"); b.type = "button"; b.className = "item" + (f.folder ? " folder" : "");
        b.setAttribute("aria-selected", "false");
        const meta = [f.size == null ? "" : sizeText(f.size),
          f.created ? f.created.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""].filter(Boolean).join(" · ");
        b.innerHTML = `<span class="pic"></span><span class="name">${esc(f.name)}</span><span class="meta">${esc(meta)}</span>`;
        b.onclick = () => choose(f, b);
        b.ondblclick = () => enter(f);
        b.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); enter(f); } };
        $("#drive-list").append(b);
        if (!f.folder) thumbs.watch(b.querySelector(".pic"), f);
      }
    } catch (err) { msg(err.message || String(err), true); }
  };
  // each image's thumbnail: the one saved when it was last opened here, else the study's ready-made one,
  // fetched once its row scrolls into view; never read from Drive, which refuses a burst of reads and then
  // the image itself. Progress shows beside the checkbox and in the status bar.
  const thumbs = (() => {
    const made = new Map(), waiting = [], AT_ONCE = 4, dir = manifest.driveThumbs ? base + manifest.driveThumbs : null;
    let ctl = new AbortController(), running = 0, seen, ready, asked = 0, done = 0, bytes = 0;
    const put = (pic, url) => { const i = new Image(); i.alt = ""; i.src = url; pic.replaceChildren(i); };
    const tell = () => {
      const t = asked ? `${done} of ${asked} · ${sizeText(bytes)}` : "";
      $("#drive-thumbs-note").textContent = t;
      $("#sb-thumbs").textContent = running || waiting.length ? "Thumbnails " + t : "";
    };
    const next = () => {
      while (running < AT_ONCE && waiting.length) {
        const [pic, f] = waiting.shift(), signal = ctl.signal;
        running++;
        fetch(`${dir}${f.id}.jpg`, { signal }).then((r) => (r.ok ? r.blob() : null))
          .then((b) => { if (!b || signal.aborted) return; bytes += b.size; made.set(f.id, URL.createObjectURL(b)); put(pic, made.get(f.id)); })
          .catch(() => {})
          .finally(() => { if (signal.aborted) return; running--; done++; tell(); next(); });
      }
      tell();
    };
    const stop = () => { ctl.abort(); ctl = new AbortController(); running = 0; waiting.length = 0; asked = done = bytes = 0; tell(); };
    const reset = () => {
      stop();
      ready = ready || (dir ? fetch(dir + "index.json").then((r) => r.json()).then((ids) => new Set(ids)).catch(() => new Set()) : Promise.resolve(new Set()));
      if (seen) seen.disconnect();
      seen = new IntersectionObserver((es) => es.forEach((e) => {
        if (!e.isIntersecting || !$("#drive-thumbs").checked) return;
        seen.unobserve(e.target); waiting.push([e.target, e.target.file]); asked++; next();
      }), { root: $("#drive-list") });
    };
    const watch = async (pic, f) => {
      const url = made.get(f.id) || readJSON(SAVED_THUMB + f.id, "") || f.preview;
      if (url) return put(pic, url);
      if (!$("#drive-thumbs").checked || !(await ready).has(f.id)) return;
      pic.file = f; seen.observe(pic);
    };
    return { reset, watch, stop };
  })();
  $("#drive-open").onclick = () => chosen && enter(chosen);
  $("#drive-thumbs").checked = readJSON(THUMBS, "on") !== "off";
  $("#drive-thumbs").onchange = (e) => {
    writeJSON(THUMBS, e.target.checked ? "on" : "off");
    if (!e.target.checked) thumbs.stop(); else if (trail.length) show();
  };
  $("#drive-autosave").checked = readJSON(AUTO_SAVE, "on") !== "off";
  $("#drive-autosave").onchange = (e) => writeJSON(AUTO_SAVE, e.target.checked ? "on" : "off");
  $("#drive-storage").onclick = storageDialog;
  $("#drive-dlg").addEventListener("close", () => thumbs.stop());
  if (!NorDrive.ready) {
    const d = document.querySelector('#load-menu .item[data-src="drive"]');
    d.disabled = true; d.title = "Needs this site's Google API key (issue #234)";
  }
  const open = () => {
    const link = $("#drive-link").value, ref = NorDrive.parse(link);
    $("#drive-list").replaceChildren(); $("#drive-path").replaceChildren(); choose(null);
    if (!ref) return msg("That does not look like a Google Drive link.", true);
    writeJSON(DRIVE_LINK, link);
    if (ref.kind === "file") return take(ref.id, undefined, []);
    trail = [{ id: ref.id, name: "Folder" }]; show();
  };
  $("#drive-go").onclick = open;
  $("#drive-link").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); open(); } });
}

// the open image's thumbnail, every colour on show, for the Drive dialog to show next time without a download;
// shrunk and brightened as the studies' ready-made ones are, and only the latest few hundred are kept
function saveThumb(id, name) {
  const SIDE = 96, GAIN = 2, KEEP = 100;
  const full = document.createElement("canvas"); full.width = st.W; full.height = st.H;
  const im = full.getContext("2d").createImageData(st.W, st.H), d = im.data, { r, g, b } = st.img;
  for (let i = 0, j = 0; i < st.W * st.H; i++, j += 4) { d[j] = r ? r[i] : 0; d[j + 1] = g ? g[i] : 0; d[j + 2] = b ? b[i] : 0; d[j + 3] = 255; }
  full.getContext("2d").putImageData(im, 0, 0);
  const k = SIDE / Math.max(st.W, st.H), c = document.createElement("canvas");
  c.width = Math.round(st.W * k); c.height = Math.round(st.H * k);
  const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(full, 0, 0, c.width, c.height);
  const small = x.getImageData(0, 0, c.width, c.height), p = small.data, v = [];
  for (let j = 0; j < p.length; j += 4) v.push(p[j], p[j + 1], p[j + 2]);
  v.sort((a, b) => a - b);
  const gain = Math.min(GAIN, 255 / Math.max(1, v[Math.floor(0.995 * (v.length - 1))]));
  for (let j = 0; j < p.length; j += 4) { p[j] *= gain; p[j + 1] *= gain; p[j + 2] *= gain; }
  x.putImageData(small, 0, 0);
  const kept = readJSON(SAVED_THUMBS, []).filter((i) => i !== id).concat(id);
  for (const old of kept.splice(0, Math.max(0, kept.length - KEEP))) try { localStorage.removeItem(SAVED_THUMB + old); } catch { /* nothing kept */ }
  const names = readJSON(THUMB_NAMES);
  for (const k of Object.keys(names)) if (!kept.includes(k)) delete names[k];
  writeJSON(SAVED_THUMB + id, c.toDataURL("image/jpeg", 0.85)); writeJSON(SAVED_THUMBS, kept); writeJSON(THUMB_NAMES, { ...names, [id]: name });
}

// images downloaded from Drive, kept on this device while Auto-save images is on
const imageUrl = (id) => new URL("drive-image/" + encodeURIComponent(id), location.href).href;
async function savedImage(id) {
  try {
    const r = await (await caches.open(IMAGES)).match(imageUrl(id));
    return r ? { name: decodeURIComponent(r.headers.get(IMAGE_NAME)), bytes: await r.arrayBuffer() } : null;
  } catch { return null; }
}
// copies the bytes at once, before the caller hands them to Python
async function saveImage(id, name, bytes) {
  const body = new Blob([bytes]);
  try {
    await (await caches.open(IMAGES)).put(imageUrl(id), new Response(body, { headers: { [IMAGE_NAME]: encodeURIComponent(name), [IMAGE_AT]: String(Date.now()) } }));
  } catch (e) { console.warn("image not saved:", e); }
  showSaved();
}
const bytesOf = (k) => 2 * (k.length + (localStorage.getItem(k) || "").length); // UTF-16
// the Drive dialog's link to Manage storage: what thumbnails and saved images take on this device
async function showSaved() {
  let n = 0;
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(SAVED_THUMB) || k === SAVED_THUMBS || k === THUMB_NAMES) n += bytesOf(k); } catch { /* no storage */ }
  try { const c = await caches.open(IMAGES); for (const q of await c.keys()) n += (await (await c.match(q)).blob()).size; } catch { /* no caches */ }
  $("#drive-storage").textContent = sizeText(n);
}

// ---------- the user: whoever opened the page on this device, and what the site keeps here ----------
// what each of the shell's own setting keys holds, in the user's words
const OWN_SETTINGS = {
  [THEME]: "Theme", [BARS]: "Side bar widths", [SOURCE]: "Where Load reads from", [DRIVE_LINK]: "Last Google Drive link",
  [THUMBS]: "Show thumbnails in the Drive dialog", [AUTO_SAVE]: "Auto-save images from Google Drive", [RECENT]: "Recent images from Google Drive", [SEEN_VERSION]: "Version you saw last", [MEMORY_TIP]: "Low-memory popup turned off",
};
const GROUPS = [
  ["code", "Code kept for the next visit", "Python and its packages, so the page starts without downloading them again."],
  ["thumbs", "Image thumbnails", "Small pictures of the images opened from Google Drive, shown in its dialog."],
  ["files", "Images from Google Drive", "Images opened from Google Drive, kept so they open again without a download."],
  ["settings", "Settings", ""],
  ["images", "Your selections, per image", "What you marked and measured on each image, kept by its file name."],
  ["other", "Other", "Kept under this site by something the page no longer names."],
];
// every key in the browser's storage, and every file in its caches, sorted into GROUPS: [{name, what, size, del}]
async function inventory() {
  const out = Object.fromEntries(GROUPS.map(([g]) => [g, []])), extra = { thumbs: 0 };
  const drop = (...keys) => keys.forEach((k) => { try { localStorage.removeItem(k); } catch { /* nothing kept */ } });
  let keys = [];
  try { keys = Object.keys(localStorage); } catch { /* no storage */ }
  const names = readJSON(THUMB_NAMES), images = new Map();
  for (const k of keys) {
    if (k === SAVED_THUMBS || k === THUMB_NAMES) { extra.thumbs += bytesOf(k); continue; }
    if (k.startsWith(SAVED_THUMB)) {
      const id = k.slice(SAVED_THUMB.length);
      out.thumbs.push({ name: names[id] || id, what: names[id] ? "" : "Saved before names were kept", pic: readJSON(k, ""), size: bytesOf(k), del: () => {
        drop(k); writeJSON(SAVED_THUMBS, readJSON(SAVED_THUMBS, []).filter((i) => i !== id));
        const n = readJSON(THUMB_NAMES); delete n[id]; writeJSON(THUMB_NAMES, n);
      } });
      continue;
    }
    if (OWN_SETTINGS[k]) { out.settings.push({ name: OWN_SETTINGS[k], size: bytesOf(k), del: () => drop(k), held: true }); continue; }
    const s = study.stored?.(k);
    if (s && s.group === "images") {
      const im = images.get(s.image) || { name: s.image, whats: new Set(), keys: [], size: 0, held: true };
      im.whats.add(s.what); im.keys.push(k); im.size += bytesOf(k); images.set(s.image, im);
    } else if (s) out.settings.push({ name: s.what, size: bytesOf(k), del: () => drop(k), held: true });
    else out.other.push({ name: k, size: bytesOf(k), del: () => drop(k), held: true });
  }
  for (const im of images.values()) out.images.push({ name: im.name, what: [...im.whats].join(", "), size: im.size, del: () => drop(...im.keys), held: true, ask: true });
  if (window.caches) {
    for (const c of await caches.keys()) {
      const cache = await caches.open(c);
      for (const req of await cache.keys()) {
        const res = await cache.match(req), u = new URL(req.url);
        if (c === IMAGES) {
          const at = Number(res.headers.get(IMAGE_AT));
          out.files.push({ name: decodeURIComponent(res.headers.get(IMAGE_NAME) || u.pathname.split("/").pop()), size: (await res.blob()).size,
            what: "Google Drive" + (at ? " · saved " + new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""),
            del: () => cache.delete(req) });
          continue;
        }
        const at = Number(res.headers.get("x-nor-cached-at"));
        out.code.push({ name: decodeURIComponent(u.pathname.split("/").pop()) || u.href, size: (await res.blob()).size,
          what: u.host + (at ? " · kept " + new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""),
          del: () => cache.delete(req) });
      }
    }
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.name.localeCompare(b.name));
  return { out, extra };
}
async function storageDialog() {
  // every group opens folded; a redraw after a deletion keeps what the user unfolded
  const list = $("#storage-list"), fresh = !$("#storage-dlg").open, open = new Set(fresh ? [] : [...list.querySelectorAll(".group[open]")].map((g) => g.dataset.group));
  if (fresh) { list.textContent = "Reading what this device keeps…"; $("#storage-total").textContent = ""; $("#storage-dlg").showModal(); }
  const { out, extra } = await inventory();
  const held = () => { $("#storage-reload").hidden = false; $("#storage-msg").textContent = "The page still holds what you deleted until it reloads."; };
  const act = async (items, ask) => {
    if (ask && !confirm(ask)) return;
    for (const e of items) await e.del();
    if (items.some((e) => e.held)) held();
    storageDialog();
  };
  let total = 0;
  list.replaceChildren(...GROUPS.map(([g, title, about]) => {
    const items = out[g], size = items.reduce((a, e) => a + e.size, 0) + (extra[g] || 0);
    total += size;
    const box = document.createElement("details"); box.className = "group"; box.dataset.group = g; box.open = open.has(g);
    box.innerHTML = `<summary>${esc(title)}<span class="count">${items.length ? `${items.length} · ${sizeText(size)}` : "Nothing kept"}</span></summary>`;
    if (items.length) {
      const clear = Object.assign(document.createElement("button"), { type: "button", className: "link clear", textContent: "Delete all" });
      clear.onclick = (e) => { e.preventDefault(); act(items, `Delete all ${items.length} of "${title}" from this device?`); };
      box.firstChild.append(clear);
    }
    if (about) box.append(Object.assign(document.createElement("p"), { className: "hint", textContent: about }));
    for (const e of items) {
      const row = document.createElement("div"); row.className = "entry"; row.dataset.name = e.name;
      row.innerHTML = `<span class="label"><span class="name"></span>${e.what ? '<span class="what"></span>' : ""}</span><span class="size">${sizeText(e.size)}</span>` +
        `<button type="button" class="del" title="Delete from this device" aria-label="Delete ${esc(e.name)} from this device">×</button>`;
      if (e.pic) row.prepend(Object.assign(new Image(), { className: "pic", alt: "", src: e.pic }));
      row.querySelector(".name").textContent = e.name;
      if (e.what) row.querySelector(".what").textContent = e.what;
      row.querySelector(".del").onclick = () => act([e], e.ask && `Delete everything kept for ${e.name}?`);
      box.append(row);
    }
    return box;
  }));
  const est = await navigator.storage?.estimate?.().catch(() => null);
  $("#storage-total").textContent = `This site keeps ${sizeText(total)} on this device` + (est?.quota ? `; the browser allows it up to ${sizeText(est.quota)}.` : ".");
}
$("#manage-storage").onclick = () => { $("#user-menu").open = false; storageDialog(); };
$("#storage-reload").onclick = () => location.reload();
$("#storage-dlg").addEventListener("close", () => { $("#storage-msg").textContent = ""; if ($("#drive-dlg").open) showSaved(); });

// ---------- downloads and ground truth ----------
function saveFile(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// the shell's icons, by name, as SVG markup: done, part, todo
const icon = (name) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">${$(`#icons .${name}`).innerHTML}</svg>`;
// The ground-truth dialog: a checklist of what is still open, the file to export, and a new GitHub issue,
// labelled for the study's intake, to attach it to. gt: {doc, file, items: [{level, ok, text}], empty,
// issue: {title, body}}; an image from the computer can be exported but not sent.
function submitTruth(gt) {
  const local = !st.source || st.source.kind !== "drive", n = gt.doc.labels.length;
  $("#gt-problems").replaceChildren(...gt.items.map((t) => {
    const li = document.createElement("li"); li.className = t.ok ? "ok" : t.level;
    li.innerHTML = icon(t.ok ? "done" : t.level === "error" ? "todo" : "part") + `<span>${esc(t.text)}</span>`;
    return li;
  }));
  $("#gt-msg").textContent = n ? "" : gt.empty;
  $("#gt-export").disabled = !n;
  const issue = $("#gt-issue");
  issue.disabled = !n || local; issue.title = local ? LOCAL_GT : "";
  // the blue button is the next step: export, then open the issue (a local image cannot), then close
  const next = (b) => { for (const id of ["#gt-export", "#gt-issue", "#gt-close"]) $(id).classList.toggle("primary", $(id) === b); };
  next($("#gt-export"));
  $("#gt-export").onclick = () => {
    saveFile(gt.file, JSON.stringify(gt.doc, null, 1), "application/json");
    $("#gt-msg").textContent = `Downloaded ${gt.file}.` + (local ? "" : " Open the issue next and attach it there.");
    next(local ? $("#gt-close") : issue);
  };
  issue.onclick = () => {
    const q = new URLSearchParams({ labels: manifest.groundTruth.label, title: gt.issue.title,
      body: gt.issue.body + `\n\n**Attach ${gt.file} below before submitting** (drag it into this box).` });
    window.open(`https://github.com/${REPO}/issues/new?${q}`, "_blank", "noopener");
    $("#gt-msg").textContent = `Attach ${gt.file} to the GitHub issue that just opened, then submit.`;
    next($("#gt-close"));
  };
  $("#gt-dlg").showModal();
}
$("#gt-close").onclick = () => $("#gt-dlg").close();

// ---------- notices: a short message, at the top of the view or under the button it is about ----------
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

// a setting's help: hovering or focusing a .help mark shows its data-help text
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

// ---------- boxes that fold: folded until there is an image ----------
function fold(open) { document.querySelectorAll(".box.foldable").forEach((b) => b.classList.toggle("folded", !open)); }
function foldable() {
  document.querySelectorAll(".box.foldable > .sec-head h2, .box.foldable > h2").forEach((h) => {
    h.tabIndex = 0; h.setAttribute("role", "button");
    const flip = () => h.closest(".box").classList.toggle("folded");
    h.onclick = flip; h.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } };
  });
  fold(false); loadShine();
}
// the image back in view, from whichever of the study's views is on show
function showImage() { study.showImage?.(); view.thumbView(); }

// ---------- side bars and theme ----------
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
        saved[side] = w; set(side, w); view?.thumbView();
      };
      const up = () => { g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); document.body.classList.remove("resizing"); writeJSON(BARS, saved); };
      g.addEventListener("pointermove", move); g.addEventListener("pointerup", up);
    });
    g.addEventListener("dblclick", () => { delete saved[side]; set(side, null); writeJSON(BARS, saved); view?.thumbView(); });
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

// ---------- the version ----------
// the release stamps the version into the page's <meta name="version">; the status bar shows it
const VERSION = $("#site-version").title.replace(/^version /, "");
$("#sb-version").textContent = "v" + VERSION;
// every 5 minutes, compare this page's version with the one now published; a newer one lights up the
// version box, which then reloads the page when clicked
{
  const v = $("#sb-version");
  const check = async () => {
    try {
      const html = await (await fetch(location.pathname, { cache: "no-store" })).text();
      const live = ((html.match(/id="site-version" title="version ([^"]*)"/) || [])[1]);
      if (!live || live === VERSION || v.classList.contains("stale")) return;
      v.classList.add("stale"); v.textContent = "Refresh for v" + live;
      v.title = `This page is v${VERSION}; v${live} is out. Click to refresh.`;
    } catch { /* offline: try again next time */ }
  };
  setInterval(check, 5 * 60 * 1000);
}

// Version history: the version box opens it; after an update, a bubble points at the box
const build = (version) => Number(String(version).split(".").pop());
const releaseDay = (version) => { // the middle part is years since 2025, then month and day
  const m = String(version).split(".")[1]?.match(/^(\d+)(\d\d)(\d\d)$/);
  return m ? new Date(Date.UTC(2025 + Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
};
let historyLoad = null;
const loadHistory = () => historyLoad ||= fetch("version_history.json", { cache: "no-cache" })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
async function showHistory(since) {
  const list = $("#history-list");
  list.textContent = "Loading…";
  $("#history-dlg").showModal();
  let releases;
  try { releases = await loadHistory(); } catch { historyLoad = null; list.textContent = "The version history could not be loaded. Please try again later."; return; }
  list.replaceChildren();
  if (since) list.append(Object.assign(document.createElement("p"), { className: "since", textContent: `New since v${since}, the version you saw last:` }));
  for (const r of releases) {
    const sec = document.createElement("section"), h = document.createElement("h3"), ul = document.createElement("ul");
    h.append("v" + r.version);
    const day = releaseDay(r.version);
    if (day) h.append(Object.assign(document.createElement("span"), { className: "date", textContent: day.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) }));
    if (since && build(r.version) > build(since)) h.append(Object.assign(document.createElement("span"), { className: "tag", textContent: "New" }));
    for (const c of r.changes) ul.append(Object.assign(document.createElement("li"), { textContent: c }));
    sec.append(h, ul); list.append(sec);
  }
}
{
  const v = $("#sb-version"), bubble = $("#whats-new");
  const seen = readJSON(SEEN_VERSION, null);
  const dismiss = () => { bubble.hidden = true; writeJSON(SEEN_VERSION, VERSION); };
  const place = () => { // the bubble's arrow points at the middle of the version box
    const r = v.getBoundingClientRect();
    bubble.style.right = Math.max(8, innerWidth - r.right) + "px";
    bubble.style.setProperty("--arrow", Math.max(10, r.width / 2 - 6) + "px");
  };
  v.onclick = () => {
    if (v.classList.contains("stale")) return location.reload();
    const since = bubble.hidden ? null : seen;
    if (!bubble.hidden) dismiss();
    showHistory(since);
  };
  $("#whats-new-open").onclick = () => { dismiss(); showHistory(seen); };
  $("#whats-new-x").onclick = dismiss;
  if (!seen) writeJSON(SEEN_VERSION, VERSION); // a first visit has nothing to compare with
  else if (seen !== VERSION && build(VERSION) > build(seen)) {
    // only an update that changed something the history names earns the bubble
    loadHistory().then((releases) => {
      if (!releases.some((r) => build(r.version) > build(seen))) return writeJSON(SEEN_VERSION, VERSION);
      $("#whats-new-open").textContent = `Click here to see what was updated since v${seen}.`;
      bubble.hidden = false; place();
      addEventListener("resize", place);
    }).catch(() => { historyLoad = null; /* no history to point at: ask again on the next visit */ });
  }
}

// an animation out of view is paused: Chrome keeps drawing every frame for one scrolled out of sight
const inView = new IntersectionObserver((seen) => { for (const e of seen) e.target.classList.toggle("offscreen", !e.isIntersecting); });
document.addEventListener("animationstart", (e) => inView.observe(e.target));

// ---------- the study ----------
// the header's switcher: every study the build lists, each a link to the page running it, the one on show ticked
async function studyMenu(id) {
  let listed = [];
  try { listed = await (await fetch("studies.json", { cache: "no-cache" })).json(); } catch (e) { console.warn("no list of studies:", e); }
  $("#study-list").replaceChildren(...listed.map((s) => {
    const a = document.createElement("a");
    a.href = s.id === DEFAULT_STUDY ? location.pathname : "?study=" + encodeURIComponent(s.id);
    a.textContent = s.title;
    if (s.id === id) a.setAttribute("aria-current", "page");
    return a;
  }));
}
// its panels go into the shell's slots, its stylesheet beside the shell's, then its module mounts; a side bar
// it leaves empty gives its room to the image
async function mountStudy() {
  const id = new URLSearchParams(location.search).get("study") || DEFAULT_STUDY;
  studyMenu(id);
  if (!/^[\w-]+$/.test(id)) throw new Error(`no study "${id}"`);
  base = `../studies/${id}/`;
  const r = await fetch(base + "study.json");
  if (!r.ok) throw new Error(`no study "${id}"`);
  manifest = await r.json();
  document.title = manifest.title; $("#title").textContent = manifest.title;
  $("#file").accept = manifest.files.accept; $("#empty-text").textContent = manifest.files.empty;
  if (manifest.web.style) { const css = document.createElement("link"); css.rel = "stylesheet"; css.href = base + manifest.web.style; document.head.append(css); }
  if (manifest.web.panels) {
    const panels = new DOMParser().parseFromString(await (await fetch(base + manifest.web.panels)).text(), "text/html");
    for (const t of panels.querySelectorAll("template[data-slot]")) $(`slot-here[data-slot-for="${t.dataset.slot}"]`).replaceWith(document.importNode(t.content, true));
  }
  document.querySelectorAll("slot-here").forEach((s) => s.remove());
  $("#layout").classList.toggle("no-right", !$("#right").children.length);
  fold(false); // before the first paint with them, so they do not fold in view
  view = VIEWERS[manifest.viewer](shell, manifest.channels);
  const mod = await import(base + manifest.web.module);
  study = (await mod.mount(shell)) || {};
  view.use(study);
  driveDialog(); foldable();
  slow($("#gt-export"));
}

const shell = {
  $, state: st, status, busy, statusBar, notice, slow, until, call, readJSON, writeJSON, esc, saveFile, submitTruth, icon, showImage,
  get viewer() { return view; }, get study() { return manifest; },
};
// for the page's tests, which drive it from outside
window.st = st; window.$ = $; window.shellForTests = { saveThumb };

mountStudy().then(start).catch((e) => status("Error: " + (e.message || e), true));
