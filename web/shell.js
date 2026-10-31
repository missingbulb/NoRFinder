// The page's shell: it runs the study the address names (/<id>, the default at the bare address), and knows
// none of them; the header's switcher offers the ones the build lists and swaps one in without a reload. What it gives a study, as shell in mount(shell): loading images (from the
// computer or Google Drive), Python (the study's own, run in worker.js), the viewer the study asks for,
// the page's state its controls are drawn from (page: get, set, watch(key, fn, {signal})), the status line and the busy screen, the steps' breadcrumbs (step(key, done, info) for the study's own) and the boxes' titles (boxDone(box, summary) once a box's task is done), notices, the user's saved settings, downloads and ground-truth
// submission; and around them the theme, the left bar, foldable boxes, Preprocessing (Split into parts, and a study's own steps in its slot), the resources dialog (storage, memory,
// network and CPU) and the version history.
//
// The study's hooks, all optional, returned from mount: ready(info) once its Python is loaded;
// opening(name, source) when an image starts to load; opened(meta) once it is shown; result(action,
// meta, bytes, echo) for each call; error() when Python failed; settled() a promise for the study's own
// work still running, holds(message) while a result is not the last of its kind, and idle() once a held
// button is free again; painter, a preview
// painter for an image's bytes as they arrive; showImage() when the shell brings the image back into
// view; stored(key), what one of the study's browser keys holds, for the Storage tab:
// {group: "settings", what} or {group: "images", image, what}, null for a key not its own; memory(), the
// study's own large holdings for the Memory tab, [{name, what, size}]; and the viewer's hooks (viewer2d.js).
// A listener a study adds outside its own panels takes shell.signal, which ends it when the study leaves.
"use strict";
import { viewer as viewer2d, GRID, MINIMAP } from "./viewer2d.js";
import { viewer3d } from "./viewer3d.js";
import { pageState } from "./page_state.js";
import { shape, stackPicture, holds, drawVolume, TURN } from "./stack.js";
import { PREVIEWS, readPreviews } from "./previews.js";
import { account } from "./account.js";
import { splitter, SPLIT_PATTERN } from "./split_dialog.js";

const $ = (s) => document.querySelector(s);
// image3d is the 2D viewer of a stack's flattened planes with a 3D view beside it, sharing the one 2D viewer
const VIEWERS = { image2d: viewer2d, image3d: (shell) => viewer3d(shell, viewers.image2d ||= viewer2d(shell)) };
const DEFAULT_STUDY = "viewer";
// the browser keys the shell saves under; their names predate studies, and a user's saved state lives in them
const THEME = "nor-theme"; // "dark" | "light"; absent = follow the system
const BARS = "nor-bars-v1"; // {left}: the left bar's width in pixels (a right bar's, from before it went, is ignored)
const SOURCE = "nor-load-source"; // "local" | "drive": where Load reads from
const DRIVE_LINK = "nor-drive-link"; // the last Google Drive link pasted, in any study
const DRIVE_LINKS = "nor-drive-links"; // {study id: the last Google Drive link pasted in that study}
const THUMBS = "nor-drive-thumbs"; // "on" | "off": whether the Drive dialog shows thumbnails
const AUTO_SAVE = "nor-drive-autosave"; // "on" | "off": whether an image downloaded from Drive is kept on this device
const SAVED_THUMB = "nor-drive-thumb:"; // + Drive id: a JPEG data URL of the image, saved when it was opened
const SAVED_THUMBS = "nor-drive-thumbs-saved"; // [Drive id], oldest first: which images have one
const THUMB_NAMES = "nor-drive-thumb-names"; // {Drive id: file name}: the image each saved thumbnail shows
const HOLDS = "nor-drive-holds"; // {Drive id: what the file holds, "3D · 8 slices" or "" when it cannot tell}, oldest first
const TIPS = "nor-tips-closed"; // [tip id]: the tips the user closed, never shown again
const THROTTLE = "nor-drive-throttled-until"; // when the wait after Google throttled the site's downloads ends, in ms
const RECENT = "nor-drive-recent"; // [{id, name, path}], newest first: images opened from Drive, path their folders under the link
// Cache Storage, + Drive id: an image downloaded from Drive, its file name (URI-encoded) and when it was saved
// in the headers
const IMAGES = "nor-images-v1", IMAGE_NAME = "x-nor-name", IMAGE_AT = "x-nor-saved-at";
// Cache Storage, + Drive folder id: the folder's rauntruth-previews.tiff, its SHA-256 and the folder's name in the headers
const FOLDER_PREVIEWS = "nor-previews-v1", PREVIEWS_SHA = "x-nor-sha256";
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
// the issue form a proposal for a new study is written on
const STUDY_REQUEST = "new-study.yml";
// signing in (1.48): these settings follow the user to every device; the rest stay with this one
const signIn = account({
  keys: [THEME, TIPS, SEEN_VERSION, MEMORY_TIP, SOURCE, DRIVE_LINK, DRIVE_LINKS, THUMBS, RECENT],
  menu: $("#user-menu"),
  applied: () => {
    let t = null;
    try { t = localStorage.getItem(THEME); } catch { /* no storage */ }
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  },
});

function readJSON(key, fallback = {}) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function writeJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode: lasts for this page only */ }
  signIn.changed(key);
}
const sizeText = (n) => (!n ? "0 KB" : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : n < 2 ** 30 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 2 ** 30).toFixed(1)} GB`);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// the page's state: the shell's fields below, and whatever the study keeps beside them
const st = { worker: null, H: 0, W: 0, um: null, umY: null, img: null, plain: null, zoom: 2, fileName: "", sha: "", source: null, heap: null, files: 0,
  ready: false, readyInfo: null, queued: null, kept: null, reopening: false, busySince: 0, busyTimer: null, peeked: false, peek: null };
// What the shell's controls are drawn from (page_state.js): image, the image open ({name, source, W, H, um, umY,
// info, planes, channels, Z, spacing}: Z slices, spacing µm between them or null) or null; opening, the one being read ({name}) or null; and the viewer's own fields.
const page = pageState({ image: null, opening: null });
// what a study leaving leaves of the state: the shell's own fields
const SHELL_STATE = new Set(Object.keys(st));
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
  const { js, total } = memoryNow(), gb = navigator.deviceMemory, el = $("#sb-memory");
  showNumber(el, total == null ? "" : `${mbOf(total)} MB`);
  el.classList.toggle("warn", !!gb && total > gb * 2 ** 30 / 4);
  el.title = total == null ? "" : `Python ${mbOf(st.heap)} MB, its files ${mbOf(st.files)} MB` + (js ? `, the page ${mbOf(js)} MB` : "") +
    `, and an estimated ${UNREAD_MB} MB for Python's compiled code and the browser. Click for more.`;
  if (tabOn("memory")) ramList();
}
function memoryNow() {
  const js = performance.memory?.usedJSHeapSize;
  return { js, total: st.heap == null ? null : st.heap + st.files + (js || 0) + UNREAD_MB * 2 ** 20 };
}
const mbOf = (n) => Math.round(n / 2 ** 20);

// the Memory tab: what holds the tab's memory, the image and the study's results within the page's share
function ramList() {
  const { js, total } = memoryNow(), gb = navigator.deviceMemory;
  const image = Object.values(st.img || {}).reduce((a, c) => a + (c?.byteLength || 0), 0);
  const rows = [
    ["Python", "Its memory as far as it has grown", st.heap],
    ["Python's files", "Python's library, its packages and the study's code", st.files],
    ["The page", js == null ? "Only Chrome and Edge say it" : "Its scripts and what they hold, the indented rows among it", js],
    ...(st.img ? [["The image", `${st.W} × ${st.H} px, each colour layer`, image, true]] : []),
    ...(study.memory?.() || []).map((r) => [r.name, r.what, r.size, true]),
    ["Compiled code and the browser", "An estimate: a page cannot read it", UNREAD_MB * 2 ** 20],
  ];
  $("#ram-total").textContent = total == null ? "Python is still loading." : `This tab holds about ${mbOf(total)} MB` + (gb ? ` of this computer's ${gb} GB.` : ".");
  $("#ram-list").replaceChildren(...rows.map(([name, what, size, within]) => entry(name, what, size == null ? "–" : sizeText(size), within)));
}
// a row of a tab: a name, what it is beneath, and a size
function entry(name, what, size, within) {
  const row = document.createElement("div"); row.className = "entry" + (within ? " within" : "");
  row.innerHTML = '<span class="label"><span class="name"></span><span class="what"></span></span><span class="size"></span>';
  row.querySelector(".name").textContent = name; row.querySelector(".what").textContent = what; row.querySelector(".size").textContent = size;
  return row;
}
$("#sb-memory").onclick = () => { $("#ram-msg").textContent = ""; usage("memory"); };
$("#ram-gc").onclick = () => working($("#ram-gc"), () => { const told = until("memory"); st.worker.postMessage({ type: "memory" }); return told; });

// the disk: what the site keeps on this device, as Manage storage counts it
async function diskBar() {
  const { out, extra } = await inventory();
  showDisk(Object.entries(out).reduce((a, [g, items]) => a + items.reduce((b, e) => b + e.size, 0) + (extra[g] || 0), 0));
}
const showDisk = (n) => showNumber($("#sb-disk"), sizeText(n));
$("#sb-disk").onclick = () => usage("storage");

// ---------- the resources dialog: storage, memory, network and CPU, a tab each ----------
let usageTab = null;
const tabOn = (t) => $("#usage-dlg").open && usageTab === t;
function usage(tab) {
  const d = $("#usage-dlg"), again = tabOn(tab);
  usageTab = tab; d.dataset.tab = tab;
  for (const b of d.querySelectorAll("[role=tab]")) b.setAttribute("aria-selected", b.dataset.tab === tab);
  for (const p of d.querySelectorAll("[role=tabpanel]")) p.hidden = p.dataset.tab !== tab;
  if (!d.open) d.showModal();
  if (tab === "storage") storageTab(!again);
  else if (tab === "memory") ramList();
  else usageNow();
}
$("#usage-dlg .tab-row").onclick = (e) => { const t = e.target.closest("[role=tab]"); if (t) usage(t.dataset.tab); };
// ---------- the status bar's numbers: each changed character rolls up to its new one ----------
// Characters are paired from the right, so "9%" to "12%" rolls the 9 to a 2 and brings the 1 in from nothing;
// the old character is the rolling one's data-from, so the number reads as its new value throughout.
const SPIKE_MS = 3000, SHARP_CPU = 0.3, SHARP_RATE = 2 ** 20;
function showNumber(item, text, spike) {
  if (spike) {
    item.classList.add("spike");
    clearTimeout(item.spikeTimer);
    item.spikeTimer = setTimeout(() => item.classList.remove("spike"), SPIKE_MS);
  }
  const v = item.querySelector(".v"), was = v.textContent;
  if (text === was) return;
  if (!was) { v.textContent = text; return; }
  v.replaceChildren(...[...text].map((ch, i) => {
    const from = was[was.length - text.length + i] ?? "";
    if (from === ch || ch === " ") return ch;
    const roll = document.createElement("span"), d = document.createElement("span");
    roll.className = "roll"; d.dataset.from = from; d.textContent = ch; roll.append(d);
    return roll;
  }));
}

$("#sb-net").onclick = () => usage("network");
$("#sb-cpu").onclick = () => usage("cpu");

// ---------- what this tab downloads ----------
// A browser gives a page no total, so it is summed from three places. The page's and Python's own timings,
// which give 0 for what the service worker answered and for a site that keeps its sizes from other pages;
// the service worker's, for what it fetched for this page and for its Python (sw.js); and Drive's, which
// counts its own (drive.js). From the browser's caches nothing is downloaded and nothing counts.
const net = { page: 0, worker: 0, sw: {} };
try {
  net.page = performance.getEntriesByType("navigation")[0]?.transferSize || 0;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) net.page += e.transferSize || 0; }).observe({ type: "resource", buffered: true });
} catch { /* no timings: the service worker's and Drive's counts alone */ }
// the service worker's counts, by client: a count lower than the last is a new service worker counting from 0
function swCounted({ page, workers }) {
  for (const [id, n, role] of [[page.id, page.bytes, "page"], ...Object.entries(workers).map(([id, n]) => [id, n, "worker"])]) {
    const c = net.sw[id] ||= { role, last: 0, before: 0 };
    if (n < c.last) c.before += c.last;
    c.last = n;
  }
}
navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.type === "net") swCounted(e.data); });
const askSw = () => navigator.serviceWorker?.controller?.postMessage({ type: "net", workers: Object.keys(net.sw).filter((id) => net.sw[id].role === "worker") });
function netNow() {
  const sw = (role) => Object.values(net.sw).filter((c) => c.role === role).reduce((a, c) => a + c.before + c.last, 0);
  const page = net.page + sw("page"), python = net.worker + sw("worker"), drive = window.NorDrive?.received() || 0;
  return { page, python, drive, total: page + python + drive };
}
// how fast: what was downloaded over the last CPU_MS, as the CPU's share is counted
const netSamples = [];
function netRate(total) {
  const t = Date.now();
  netSamples.push([t, total]);
  while (netSamples.length > 1 && netSamples[1][0] <= t - CPU_MS) netSamples.shift();
  const [t0, n0] = netSamples[0];
  return t > t0 ? ((total - n0) * 1000) / (t - t0) : 0;
}
const speedText = (r) => `${sizeText(r)}/s`;
function netList(n, rate) {
  $("#net-total").textContent = `This tab is downloading ${speedText(rate)} and has downloaded ${sizeText(n.total)} since it opened.`;
  $("#net-list").replaceChildren(
    entry("The page", "Its own files; what this browser had kept counts nothing", sizeText(n.page)),
    entry("Python", "Python, its packages and the study's Python", sizeText(n.python)),
    entry("Google Drive", "Images and folder lists; not Google's small pictures of images", sizeText(n.drive)));
}

// ---------- how busy this tab's threads are ----------
// The page's thread: its long tasks, which only Chrome and Edge report (null elsewhere: unknown). Python's: the
// time it has spent working, as its last message said ({ms, since}, since set while it works), sampled each
// second. Each is a share of one core over the last CPU_MS.
const CPU_MS = 2000;
const cpu = { long: PerformanceObserver.supportedEntryTypes?.includes("longtask") ? [] : null, py: { ms: 0, since: null }, samples: [] };
if (cpu.long) new PerformanceObserver((l) => { for (const e of l.getEntries()) cpu.long.push([e.startTime, e.startTime + e.duration]); }).observe({ type: "longtask" });
function cpuNow() {
  const now = performance.now(), from = now - CPU_MS;
  let page = null;
  if (cpu.long) {
    cpu.long = cpu.long.filter(([, end]) => end > from);
    page = cpu.long.reduce((a, [start, end]) => a + end - Math.max(start, from), 0) / CPU_MS;
  }
  const t = Date.now(), worked = cpu.py.ms + (cpu.py.since ? t - cpu.py.since : 0);
  cpu.samples.push([t, worked]);
  while (cpu.samples.length > 1 && cpu.samples[1][0] <= t - CPU_MS) cpu.samples.shift();
  const [t0, w0] = cpu.samples[0], python = t > t0 ? Math.min(1, (worked - w0) / (t - t0)) : 0;
  return { page, python, total: (page || 0) + python };
}
const pct = (x) => (x == null ? "–" : Math.round(x * 100) + "%");
function cpuList(c) {
  $("#cpu-total").textContent = `This tab's threads are using about ${pct(c.total)} of one core.`;
  $("#cpu-list").replaceChildren(
    entry("The page", c.page == null ? "Unknown: only Chrome and Edge report it" : "Its long tasks: an estimate", pct(c.page)),
    entry("Python", "The time it spent working", pct(c.python)));
}

// each second: the network and CPU in the status bar, and in their tabs when open; a sharp rise flashes
const last = { rate: 0, cpu: 0 };
const sharp = (now, was, step) => now >= 2 * was && now - was >= step;
function usageNow() {
  const n = netNow(), c = cpuNow(), rate = netRate(n.total);
  showNumber($("#sb-net"), speedText(rate), sharp(rate, last.rate, SHARP_RATE));
  showNumber($("#sb-cpu"), pct(c.total), sharp(c.total, last.cpu, SHARP_CPU));
  last.rate = rate; last.cpu = c.total;
  if (tabOn("network")) netList(n, rate);
  if (tabOn("cpu")) cpuList(c);
}
setInterval(usageNow, 1000);
setInterval(askSw, 2000);
askSw(); usageNow();

// ---------- the study's stage and steps ----------
// in order, each with its traffic light, what it means, and what moves a study on from it
const STAGES = {
  PreGT: { light: "red", what: "Its tools work, but cannot make ground truth yet, so there is nothing to export.",
    next: "To move on to GT, the study needs a way to make ground truth: an export of what you confirm, to submit." },
  GT: { light: "yellow", what: "Its tools make ground truth, to export and submit.",
    next: "To move on to PostGT, the study needs batch actions: its tools run over many images at once." },
  PostGT: { light: "green", what: "It makes ground truth, and has batch actions too.", next: "This is the last stage." },
};
function showStage() {
  const now = Object.keys(STAGES).indexOf(manifest.stage), e = $("#sb-stage");
  e.dataset.stage = manifest.stage; e.setAttribute("aria-label", "Stage: " + manifest.stage);
  e.querySelectorAll("circle").forEach((c) => c.classList.toggle("lit", c.dataset.light === STAGES[manifest.stage].light));
  $("#stage-list").replaceChildren(...Object.entries(STAGES).map(([name, s], k) => {
    const li = document.createElement("li"); li.className = k < now ? "past" : k === now ? "now" : "";
    li.innerHTML = `<span class="dot" data-light="${s.light}"></span><span class="name">${name}</span><span class="what">${esc(s.what)}</span>`;
    return li;
  }));
  $("#stage-next").textContent = STAGES[manifest.stage].next;
}
// the stages pop up while the stage is hovered or focused
{
  const pop = $("#stage-pop"), e = $("#sb-stage");
  const show = (on) => { try { on ? pop.showPopover() : pop.hidePopover(); } catch { /* already so, or no popovers */ } };
  e.addEventListener("mouseenter", () => show(true)); e.addEventListener("mouseleave", () => show(false));
  e.addEventListener("focus", () => show(true)); e.addEventListener("blur", () => show(false));
}
const makesTruth = () => manifest.stage !== "PreGT";
// The study's steps, in order, in one state that the breadcrumbs and the shining buttons are drawn from:
// [{key, name, button, done, info, at}]. Load image and Submit GT are the shell's, the study's own come from its
// study.json; the step to do now is the first not done.
let steps = [];
const stepsWatch = new MutationObserver(() => drawSteps());
function makeSteps() {
  steps = [{ key: "load", name: "Load image", button: "#load-main" }, ...manifest.phases,
    ...(makesTruth() ? [{ key: "submit", name: "Submit GT", button: manifest.groundTruth.button }] : [])]
    .map((p) => ({ ...p, done: false, info: "", at: null }));
  // a step's button shines only while it can be pressed
  stepsWatch.disconnect();
  for (const p of steps) if (p.button && $(p.button)) {
    stepsWatch.observe($(p.button), { attributes: true, attributeFilter: ["disabled", "hidden"] });
    $(p.button).addEventListener("click", () => { p.pressed = true; }, { signal: lifetime.signal });
  }
  drawSteps();
}
// a step done or not, and what was done in it (or how far it has got)
function step(key, done, info) {
  const p = steps.find((x) => x.key === key);
  if (!p) return;
  if (done && !p.done) {
    p.at = new Date();
    // the boxes follow what the user did, not a dial set back to the last run's
    if (key === "load" || !p.button || p.pressed) foldFor(key);
    p.pressed = false;
  }
  p.done = !!done;
  if (info !== undefined) p.info = info;
  drawSteps();
}
function drawSteps() {
  const now = steps.findIndex((p) => !p.done), shown = now < 0 ? steps : steps.slice(0, now + 1);
  const when = (d) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  $("#sb-steps").replaceChildren(...shown.map((p, k) => {
    const c = document.createElement("span");
    c.id = "sb-" + p.key; c.className = "crumb" + (k === now ? " now shine" : ""); c.textContent = p.name; c.tabIndex = 0;
    c.dataset.help = (p.done ? `${p.info || "Done"}\nDone at ${when(p.at)}.` : p.info || "To do now.");
    return c;
  }));
  steps.forEach((p, k) => { const b = p.button && $(p.button); if (b) b.classList.toggle("shine", k === now && !b.disabled && !b.hidden); });
}
// the shining crumb leads to its button: the box it is in unfolds, it scrolls into view, and it is pressed
function goToStep(e) {
  const c = e.target.closest(".crumb.now"), p = c && steps.find((x) => "sb-" + x.key === c.id), b = p?.button && $(p.button);
  if (!b || b.hidden) return;
  b.closest(".box.foldable")?.classList.remove("folded");
  b.scrollIntoView({ block: "nearest" });
  if (!b.disabled) b.click();
}
$("#sb-steps").onclick = goToStep;
$("#sb-steps").onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToStep(e); } };

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
  st.worker = new Worker("worker.js?study=" + encodeURIComponent(studyOf(location)), { type: "module" });
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
  if (m.busy) cpu.py = m.busy;
  if (m.net != null) net.worker = m.net;
  // a late answer for a study that has left, or a word from one still coming in
  if (m.study && m.study !== manifest?.id) return statusBar();
  handle(m); settle(m); statusBar();
}
function handle(m) {
  if (m.type === "progress") status(m.text);
  else if (m.type === "error") {
    // the request that failed is over: its button can be pressed again
    study.error?.();
    status("Error: " + m.text, true); if (OUT_OF_MEMORY.test(m.text)) memoryTip(true);
  } else if (m.type === "ready") {
    st.ready = true; st.readyInfo = m.info; $("#spin").classList.remove("on");
    study.ready?.(m.info); statusBar(); diskBar();
    $("#ram-gc").disabled = false;
    status("Ready. Load an image.");
    if (st.queued) { const q = st.queued; st.queued = null; send(q.name, q.bytes); }
    else if (st.kept) reopen();
  } else if (m.type === "opened") {
    st.um = m.meta.um; st.umY = m.meta.um_y;
    page.set({ opening: null, image: { name: st.fileName, source: st.source, W: m.meta.W, H: m.meta.H, um: st.um, umY: st.umY,
      info: m.meta.info, planes: m.images, channels: m.meta.channels || null, Z: m.meta.Z || 1, spacing: m.meta.spacing ?? null } });
    busy(false); statusBar();
    showImage();
    boxDone($("#image-box"), loadedSummary());
    step("load", true, `${st.fileName}, ${m.meta.W} × ${m.meta.H} px, from ${st.source?.kind === "drive" ? "Google Drive" : "this computer"}`);
    status("Image loaded."); // the study's opened hook says what comes next, if anything
    study.opened?.(m.meta);
    if (!st.reopening && st.source && st.source.kind === "local" && makesTruth()) notice(LOCAL_GT);
    if (!st.reopening && st.source && st.source.kind === "drive" && st.pictured !== st.source.id) saveThumb(st.source.id, st.fileName);
    st.reopening = false;
  } else if (m.type === "result") {
    study.result?.(m.action, m.meta, m.bytes, m.echo);
  } else if (m.type === "memory") {
    $("#ram-msg").textContent = `Python: ${mbOf(m.used)} MB in use of ${mbOf(m.heap)} MB reserved.`;
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
// the Image box draws from the page's state: the image's name and what its file says, Load filled until an
// image is open and plain after, and Unload once one is
function imageBox() {
  const opening = page.get("opening"), im = page.get("image"), name = opening?.name || im?.name;
  $("#file-name").textContent = name || "No image loaded"; $("#file-name").classList.toggle("dim", !name);
  fileInfo(opening ? null : im?.info || null);
  $("#load").classList.toggle("done", !!im); $("#unload").hidden = !im;
}
page.watch("image", imageBox); page.watch("opening", imageBox);

// source: where the image came from, {kind: "local"} or {kind: "drive", id}
async function openBytes(name, bytes, source) {
  const opened = until("opened"); working($("#load-main"), () => opened);
  st.fileName = name; st.source = source;
  for (const p of steps) Object.assign(p, { done: false, info: "", at: null, pressed: false });
  drawSteps(); boxes().forEach((b) => summaries.delete(b)); retitle();
  // a copy, for the next study to open: the bytes themselves go to Python
  st.kept = { name, source, bytes: bytes.slice(0) };
  study.opening?.(name, source);
  st.sha = await sha256(bytes);
  page.set({ opening: { name } }); statusBar();
  view.clear();
  if (st.ready) return send(name, bytes);
  // Python is still loading: the image opens the moment it is ready
  st.queued = { name, bytes }; busy(true, "Python is still loading; your image opens as soon as it is ready…", st.peeked && "peek");
}
async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function send(name, bytes) {
  busy(true, "Reading the image…", st.peeked && "peek");
  st.worker.postMessage({ type: "open", name, bytes }, [bytes]);
}
// the image on show, opened again in a study that has just come in
function reopen() {
  const { name, source, bytes } = st.kept, opened = until("opened");
  working($("#load-main"), () => opened);
  st.reopening = true; study.opening?.(name, source);
  send(name, bytes.slice(0));
}
// a painter for the image's bytes as they arrive, shown until Python's own drawing replaces it; the study's,
// when it has one
function peek() {
  st.peeked = false;
  return study.painter ? view.preview(study.painter) : () => false;
}
$("#file").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const bytes = await f.arrayBuffer(); peek()(bytes, bytes.byteLength);
  openBytes(f.name, bytes, { kind: "local" }); e.target.value = "";
};
// the link the Drive dialog opened on: listing it is not pasting it
let driveFrom = "";
function load(src) {
  writeJSON(SOURCE, src); $("#load-menu").open = false;
  if (src === "local") return $("#file").click();
  driveFrom = $("#drive-link").value = readJSON(DRIVE_LINKS)[manifest.id] || manifest.files.drive || readJSON(DRIVE_LINK, ""); $("#drive-dlg").showModal(); $("#drive-link").select(); showSaved();
  holdDrive();
  if (!throttled() && NorDrive.parse($("#drive-link").value)?.kind === "folder") $("#drive-go").click();
}
$("#load-main").onclick = () => load(readJSON(SOURCE, "local"));
// Unload: no image open, the study starting over as one that has just come in, and Python letting the image go
$("#unload").onclick = () => {
  if (!st.img || $("#load-main").classList.contains("working")) return;
  swapping = swapping.then(async () => {
    const { ready, readyInfo } = st, id = manifest.id;
    Object.assign(st, { kept: null, queued: null, fileName: "", source: null, sha: "", um: null, umY: null });
    if (ready) st.worker.postMessage({ type: "close" });
    page.set({ image: null, opening: null }); boxDone($("#image-box"), null);
    leaveStudy();
    try { await mountStudy(id); } catch (e) { return status("Error: " + (e.message || e), true); }
    if (ready) { st.ready = true; $("#ram-gc").disabled = false; study.ready?.(readyInfo); }
    statusBar(); status(ready ? "Ready. Load an image." : "Loading Python in the background…");
  });
};
document.querySelectorAll("#load-menu .item").forEach((b) => (b.onclick = () => load(b.dataset.src)));

// a tip: a bubble below its anchor, pointing at it, until the user closes it, after which it never shows again
function tip(id, anchor, text) {
  if (readJSON(TIPS, []).includes(id)) return;
  let t = document.querySelector(`.tip-bubble[data-tip="${id}"]`);
  if (!t) {
    t = Object.assign(document.createElement("div"), { className: "tip-bubble" });
    t.dataset.tip = id; t.setAttribute("role", "status");
    t.innerHTML = `<span></span><button type="button" class="x" aria-label="Close">×</button>`;
    t.querySelector(".x").onclick = () => closeTip(id);
    document.body.append(t);
  }
  t.querySelector("span").textContent = text;
  const r = anchor.getBoundingClientRect();
  t.style.left = Math.max(8, r.left + r.width / 2 - 22) + "px"; t.style.top = r.bottom + 10 + "px";
}
function closeTip(id) {
  const t = document.querySelector(`.tip-bubble[data-tip="${id}"]`);
  if (!t) return;
  t.remove(); writeJSON(TIPS, [...new Set([...readJSON(TIPS, []), id])]);
}
// the dropdown is what the recent-files tip asks the user to open
$("#load-menu").addEventListener("toggle", () => { if ($("#load-menu").open) closeTip("recent-files"); });

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

// once Google throttles the site's downloads the Drive dialog waits WAIT, with a notice and a countdown, and
// calls Drive for nothing; the end is kept in the browser, so a reload does not cut it short. waitEnded is the
// dialog's, which lists its link again.
const WAIT = 15 * 60000;
let ticker = 0, waitEnded = () => {};
const throttled = () => readJSON(THROTTLE, 0) > Date.now();
function holdDrive() {
  const on = throttled(), left = Math.max(0, readJSON(THROTTLE, 0) - Date.now()), two = (n) => String(n).padStart(2, "0");
  $("#drive-throttle").hidden = !on; $("#drive-dlg").classList.toggle("throttled", on);
  $("#drive-link").disabled = $("#drive-go").disabled = on;
  if (on) $("#drive-open").disabled = true;
  $("#drive-clock").textContent = `${two(Math.floor(left / 60000))}:${two(Math.floor(left / 1000) % 60)}`;
  if (on && !ticker) ticker = setInterval(holdDrive, 1000);
  if (!on && ticker) {
    clearInterval(ticker); ticker = 0;
    try { localStorage.removeItem(THROTTLE); } catch { /* nothing kept */ }
    waitEnded();
  }
}
function throttle() { writeJSON(THROTTLE, Date.now() + WAIT); holdDrive(); }

// the Drive dialog: a pasted file link loads at once; a folder link lists its images and subfolders, where a
// click selects and Open (or a double click) opens the selection
function driveDialog() {
  const msg = (t, err) => { const m = $("#drive-msg"); m.textContent = m.title = t; m.classList.toggle("err", !!err); };
  let trail = [], chosen = null, listing = 0;
  // path: the folders the image is in under the link it was opened from; sha: its SHA-256 as the listing gave
  // it (null when Drive gave none), undefined when not yet asked; recent: whether it was chosen from the recents.
  // A recent image opens from its kept copy; one chosen from Drive does only once its SHA-256 matches Drive's.
  const take = async (id, name, path, sha, recent) => {
    thumbs.stop();
    const kept = await savedImage(id);
    if (kept && !recent && sha === undefined && !throttled()) sha = await NorDrive.checksum(id).catch(() => null);
    if (kept && (recent || (sha && sha === (await sha256(kept.bytes))))) {
      $("#drive-dlg").close(); msg("");
      peek()(kept.bytes, kept.bytes.byteLength); remember(id, kept.name, path); picture(id, kept.name, kept.bytes);
      if (!recent) tip("recent-files", $("#load-menu summary"), "To load recent files click here");
      return openBytes(kept.name, kept.bytes, { kind: "drive", id });
    }
    if (throttled()) { if (!$("#drive-dlg").open) $("#drive-dlg").showModal(); return holdDrive(); }
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
      remember(id, f.name, path); picture(id, f.name, f.bytes);
      openBytes(f.name, f.bytes, { kind: "drive", id });
    } catch (err) {
      busy(false); if (!$("#drive-dlg").open) $("#drive-dlg").showModal();
      if (err.throttled) { msg(""); return throttle(); }
      msg(err.message || String(err), true);
    }
  };
  const choose = (f, b) => {
    chosen = f; $("#drive-open").disabled = !f;
    $("#drive-list").querySelectorAll(".item").forEach((e) => e.setAttribute("aria-selected", e === b));
  };
  const enter = (f) => (f.folder ? (trail.push(f), show()) : take(f.id, f.name, trail.slice(1).map((t) => t.name), f.sha));
  openRecent = (r) => take(r.id, r.name, r.path || [], undefined, true);
  const show = async () => {
    const at = trail[trail.length - 1];
    $("#drive-path").innerHTML = trail.map((t, k) => `<button type="button" class="link" data-k="${k}">${esc(t.name)}</button>`).join(" / ");
    $("#drive-path").querySelectorAll("button").forEach((b) => (b.onclick = () => { trail = trail.slice(0, +b.dataset.k + 1); show(); }));
    $("#drive-path").scrollLeft = $("#drive-path").scrollWidth;
    $("#drive-list").replaceChildren(); choose(null); thumbs.reset(); msg("Reading the folder…");
    // a listing the user has moved on from by the time it arrives is dropped
    const asked = ++listing;
    try {
      const all = await NorDrive.list(at.id);
      if (asked !== listing) return;
      const file = all.find((f) => !f.folder && f.name === PREVIEWS), items = all.filter((f) => f !== file);
      thumbs.cover(file ? folderPreviews(at, file) : null);
      msg(items.length ? "" : "No TIFF or PNG images here.");
      for (const [k, f] of items.entries()) {
        const b = document.createElement("button"); b.type = "button"; b.className = "item" + (f.folder ? " folder" : "");
        b.setAttribute("aria-selected", "false");
        const meta = [f.size == null ? "" : sizeText(f.size),
          f.created ? f.created.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""].filter(Boolean).join(" · ");
        b.innerHTML = `<span class="pic"></span><span class="name">${esc(f.name)}</span><span class="shape">${esc(readJSON(HOLDS)[f.id] || "")}</span><span class="meta">${esc(meta)}</span>`;
        b.onclick = () => choose(f, b);
        b.ondblclick = () => enter(f);
        b.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); enter(f); } };
        $("#drive-list").append(b);
        if (!f.folder) thumbs.watch(b.querySelector(".pic"), f, k);
      }
    } catch (err) { if (asked === listing) (err.throttled ? throttle() : msg(err.message || String(err), true)); }
  };
  // each image's thumbnail: the one saved when it was last opened here, else the study's ready-made one,
  // fetched for the rows in view and the next AHEAD, in order, as the user scrolls; never read from Drive,
  // which refuses a burst of reads and then the image itself. One fetched stays for the page's life. A TIFF's
  // row also says what the file holds, read once from the file's first HEAD bytes for the same rows. Progress
  // shows beside the checkbox and in the status bar.
  const thumbs = (() => {
    const made = new Map(), AT_ONCE = 4, AHEAD = 10, HEAD = 65536;
    // rows: the listing's image rows that await a ready-made thumbnail or what the file holds, in the list's
    // order, each {at, row, f, thumb, holds, asked, done}, at its place in the list; epoch: which listing they
    // belong to; dir: the study on show's ready-made thumbnails
    // asked, done and bytes count the thumbnails, which the note beside the checkbox reports; a header read for
    // what a file holds is not one
    let ctl = new AbortController(), running = 0, rows = [], epoch = 0, ready, frame = 0, asked = 0, done = 0, bytes = 0, dir = null;
    const put = (pic, url) => { const i = new Image(); i.alt = ""; i.src = url; pic.replaceChildren(i); };
    const tell = () => {
      const t = asked ? `${done} of ${asked} · ${sizeText(bytes)}` : "";
      $("#drive-thumbs-note").textContent = t;
      $("#sb-thumbs").textContent = running ? "Thumbnails " + t : "";
    };
    // the rows from the first in view to AHEAD past the last, that no fetch has been started for
    const wanted = () => {
      const list = $("#drive-list"), items = list.children;
      if (!$("#drive-dlg").open || !$("#drive-thumbs").checked || throttled() || !items.length) return [];
      const box = list.getBoundingClientRect();
      let first = 0, last = items.length - 1;
      for (let hi = last; first < hi; ) { const m = (first + hi) >> 1; if (items[m].getBoundingClientRect().bottom > box.top) hi = m; else first = m + 1; }
      for (last = first; last + 1 < items.length && items[last + 1].getBoundingClientRect().top < box.bottom; ) last++;
      return rows.filter((r) => !r.asked && r.at >= first && r.at <= last + AHEAD);
    };
    const next = () => {
      frame = 0;
      for (const want = wanted(); running < AT_ONCE && want.length; ) {
        const r = want.shift(), signal = ctl.signal;
        r.asked = true; running++; if (r.thumb) asked++;
        job(r, signal).catch((e) => { if (e.throttled) throttle(); })
          .finally(() => { if (signal.aborted) return; r.done = true; running--; if (r.thumb) done++; tell(); next(); });
      }
      tell();
    };
    const job = async (r, signal) => {
      if (r.thumb) {
        const res = await fetch(`${dir}${r.f.id}.jpg`, { signal }), b = res.ok ? await res.blob() : null;
        if (b && !signal.aborted) { bytes += b.size; made.set(r.f.id, URL.createObjectURL(b)); put(r.row.querySelector(".pic"), made.get(r.f.id)); }
      }
      if (r.holds) {
        const buf = await NorDrive.head(r.f.id, HEAD, signal);
        if (signal.aborted) return;
        r.row.querySelector(".shape").textContent = know(r.f.id, shape(buf));
      }
    };
    const later = () => { frame = frame || requestAnimationFrame(next); };
    // fetches in flight are dropped, and their rows fetched again when next wanted
    const stop = () => {
      ctl.abort(); ctl = new AbortController(); running = asked = done = bytes = 0;
      for (const r of rows) if (!r.done) r.asked = false;
      tell();
    };
    const reset = () => {
      stop(); rows = []; epoch++; covered = Promise.resolve(null);
      const own = manifest?.driveThumbs ? base + manifest.driveThumbs : null;
      if (own !== dir) { dir = own; ready = null; }
      ready = ready || (dir ? fetch(dir + "index.json").then((r) => r.json()).then((ids) => new Set(ids)).catch(() => new Set()) : Promise.resolve(new Set()));
    };
    // the folder's previews file, once read; an image it covers is shown from it with no read of its own
    let covered = Promise.resolve(null);
    const cover = (p) => { covered = p || Promise.resolve(null); };
    const fromPreviews = async (pic, e, pv) => {
      const row = pic.closest(".item");
      row.querySelector(".shape").textContent = holds({ images: 1, slices: e.slices, channels: e.channels });
      put(pic, await pv.picture(e));
      if (e.kind === "stack") turning(row, pic, pv.volume(e));
    };
    const watch = async (pic, f, at) => {
      const of = epoch, pv = await covered, e = pv?.entry(f.name, f.sha);
      if (of !== epoch) return;
      if (e) return fromPreviews(pic, e, pv);
      const url = made.get(f.id) || readJSON(SAVED_THUMB + f.id, "") || f.preview;
      if (url) put(pic, url);
      const holds = /\.tiff?$/i.test(f.name) && NorDrive.ready && !(f.id in readJSON(HOLDS)), thumb = !url && (await ready).has(f.id);
      if (of !== epoch || !(thumb || holds)) return;
      rows.push({ at, row: pic.closest(".item"), f, thumb, holds, asked: false, done: false }); later();
    };
    $("#drive-list").addEventListener("scroll", later, { passive: true });
    $("#drive-dlg").addEventListener("close", stop);
    return { reset, watch, stop, later, cover };
  })();
  $("#drive-open").onclick = () => chosen && enter(chosen);
  $("#drive-thumbs").checked = readJSON(THUMBS, "on") !== "off";
  $("#drive-thumbs").onchange = (e) => {
    writeJSON(THUMBS, e.target.checked ? "on" : "off");
    if (!e.target.checked) thumbs.stop(); else thumbs.later();
  };
  $("#drive-autosave").checked = readJSON(AUTO_SAVE, "on") !== "off";
  $("#drive-autosave").onchange = (e) => writeJSON(AUTO_SAVE, e.target.checked ? "on" : "off");
  $("#drive-storage").onclick = () => usage("storage");
  if (!NorDrive.ready) {
    const d = document.querySelector('#load-menu .item[data-src="drive"]');
    d.disabled = true; d.title = "Needs this site's Google API key (issue #234)";
  }
  const open = () => {
    const link = $("#drive-link").value, ref = NorDrive.parse(link);
    $("#drive-list").replaceChildren(); $("#drive-path").replaceChildren(); choose(null);
    if (!ref) return msg("That does not look like a Google Drive link.", true);
    if (link !== driveFrom) { writeJSON(DRIVE_LINK, link); writeJSON(DRIVE_LINKS, { ...readJSON(DRIVE_LINKS), [manifest.id]: link }); driveFrom = link; }
    if (ref.kind === "file") return take(ref.id, undefined, []);
    trail = [{ id: ref.id, name: "Folder" }]; show();
  };
  $("#drive-go").onclick = open;
  waitEnded = () => { if ($("#drive-dlg").open) open(); };
  holdDrive();
  $("#drive-link").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); open(); } });
}

// the open image's thumbnail, every colour on show, for the Drive dialog to show next time without a download;
// shrunk and brightened as the studies' ready-made ones are, and only the latest few hundred are kept
function saveThumb(id, name) {
  const SIDE = 96, GAIN = 2;
  const full = view.picture();
  const k = SIDE / Math.max(st.W, st.H), c = document.createElement("canvas");
  c.width = Math.round(st.W * k); c.height = Math.round(st.H * k);
  const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(full, 0, 0, c.width, c.height);
  const small = x.getImageData(0, 0, c.width, c.height), p = small.data, v = [];
  for (let j = 0; j < p.length; j += 4) v.push(p[j], p[j + 1], p[j + 2]);
  v.sort((a, b) => a - b);
  const gain = Math.min(GAIN, 255 / Math.max(1, v[Math.floor(0.995 * (v.length - 1))]));
  for (let j = 0; j < p.length; j += 4) { p[j] *= gain; p[j + 1] *= gain; p[j + 2] *= gain; }
  x.putImageData(small, 0, 0);
  keepThumb(id, name, c.toDataURL("image/jpeg", 0.85));
}
// a thumbnail for the Drive dialog to show from now on; only the latest KEEP are kept
function keepThumb(id, name, url) {
  const KEEP = 100;
  const kept = readJSON(SAVED_THUMBS, []).filter((i) => i !== id).concat(id);
  for (const old of kept.splice(0, Math.max(0, kept.length - KEEP))) try { localStorage.removeItem(SAVED_THUMB + old); } catch { /* nothing kept */ }
  const names = readJSON(THUMB_NAMES);
  for (const k of Object.keys(names)) if (!kept.includes(k)) delete names[k];
  writeJSON(SAVED_THUMB + id, url); writeJSON(SAVED_THUMBS, kept); writeJSON(THUMB_NAMES, { ...names, [id]: name });
  diskBar();
}

// what each Drive file holds, remembered so it is read once; the latest KEEP. Returns its words for the row.
function know(id, s) {
  const KEEP = 1000, said = holds(s), all = readJSON(HOLDS);
  delete all[id]; all[id] = said;
  const ids = Object.keys(all);
  for (const old of ids.slice(0, Math.max(0, ids.length - KEEP))) delete all[old];
  writeJSON(HOLDS, all);
  return said;
}
// a Drive image about to open: what it holds is remembered, and a stack's 3D thumbnail is saved at once, drawn
// from the bytes in hand; a flat image's waits until it shows
function picture(id, name, bytes) {
  const s = shape(bytes);
  know(id, s); st.pictured = null;
  const url = s && s.slices > 1 && stackPicture(bytes, s);
  if (url) { keepThumb(id, name, url); st.pictured = id; }
}

// a folder's rauntruth-previews.tiff, read: the copy kept on this device while Drive gives the file the same
// SHA-256, else downloaded and kept; null when there is none to read
async function folderPreviews(folder, f) {
  const url = new URL("drive-previews/" + encodeURIComponent(folder.id), location.href).href;
  try {
    const cache = await caches.open(FOLDER_PREVIEWS), kept = await cache.match(url);
    if (kept && f.sha && kept.headers.get(PREVIEWS_SHA) === f.sha) return readPreviews(await kept.arrayBuffer());
    if (throttled()) return null;
    const got = await NorDrive.file(f.id, f.name);
    await cache.put(url, new Response(new Blob([got.bytes]), { headers: { [PREVIEWS_SHA]: f.sha || "", [IMAGE_NAME]: encodeURIComponent(folder.name) } }));
    diskBar();
    return readPreviews(got.bytes);
  } catch (e) {
    if (e.throttled) throttle();
    else console.warn("no previews for this folder:", e);
    return null;
  }
}
// a stack's row turns its volume while the pointer is over it, and shows its still again after
function turning(row, pic, volume) {
  let frame = 0, still = null;
  row.addEventListener("mouseenter", async () => {
    const v = await volume, start = performance.now();
    still = still || pic.firstChild;
    const spin = (now) => {
      const cv = drawVolume(v, TURN + ((now - start) / 1000) * (Math.PI / 2));
      cv.className = "turning"; pic.replaceChildren(cv);
      frame = requestAnimationFrame(spin);
    };
    cancelAnimationFrame(frame); frame = requestAnimationFrame(spin);
  });
  row.addEventListener("mouseleave", () => { cancelAnimationFrame(frame); if (still) pic.replaceChildren(still); });
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
  showSaved(); diskBar();
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
  [THEME]: "Theme", [BARS]: "Side bar widths", [SOURCE]: "Where Load reads from", [DRIVE_LINK]: "Last Google Drive link", [DRIVE_LINKS]: "Last Google Drive link in each study",
  [THUMBS]: "Show thumbnails in the Drive dialog", [AUTO_SAVE]: "Auto-save images from Google Drive", [RECENT]: "Recent images from Google Drive", [HOLDS]: "What each Drive image holds (2D or 3D)", [THROTTLE]: "Wait after Google throttled Drive downloads", [TIPS]: "Tips you closed", [SEEN_VERSION]: "Version you saw last", [MEMORY_TIP]: "Low-memory popup turned off", [GRID]: "Grid colour and spacing", [MINIMAP]: "Minimap: shown or not, and how see-through", [SPLIT_PATTERN]: "File names of an image split into parts",
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
        if (c === FOLDER_PREVIEWS) {
          out.thumbs.push({ name: "Previews of " + decodeURIComponent(res.headers.get(IMAGE_NAME) || "a folder"), size: (await res.blob()).size,
            what: "Google Drive", del: () => cache.delete(req) });
          continue;
        }
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
// the Storage tab; fresh: just opened, every group folded, where a redraw after a deletion keeps what the user unfolded
async function storageTab(fresh) {
  const list = $("#storage-list"), open = new Set(fresh ? [] : [...list.querySelectorAll(".group[open]")].map((g) => g.dataset.group));
  if (fresh) { list.textContent = "Reading what this device keeps…"; $("#storage-total").textContent = ""; }
  const { out, extra } = await inventory();
  const held = () => { $("#storage-reload").hidden = false; $("#storage-msg").textContent = "The page still holds what you deleted until it reloads."; };
  const act = async (items, ask) => {
    if (ask && !confirm(ask)) return;
    for (const e of items) await e.del();
    if (items.some((e) => e.held)) held();
    storageTab(false);
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
  showDisk(total);
  $("#storage-total").textContent = `This site keeps ${sizeText(total)} on this device` + (est?.quota ? `; the browser allows it up to ${sizeText(est.quota)}.` : ".");
}
$("#manage-storage").onclick = () => { $("#user-menu").open = false; usage("storage"); };
$("#storage-reload").onclick = () => location.reload();
$("#usage-dlg").addEventListener("close", () => { $("#storage-msg").textContent = ""; if ($("#drive-dlg").open) showSaved(); });

// ---------- downloads and ground truth ----------
function saveFile(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// the shell's icons, by name, as SVG markup: done, part, todo
const icon = (name) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">${$(`#icons .${name}`).innerHTML}</svg>`;
// The ground-truth dialog: a checklist of what is still open, the file to export, and a new GitHub issue,
// labelled for the study's intake, to attach it to. gt: {doc, count, file, items: [{level, ok, text}], empty,
// issue: {title, body}}, count how many of its marks the document holds, nothing to send at 0; an image from the computer can be exported but not sent.
function submitTruth(gt) {
  if (!makesTruth()) return;
  const local = !st.source || st.source.kind !== "drive", n = gt.count;
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
    step("submit", local, local ? `Exported ${gt.file}; an image from this computer cannot be sent` : `Exported ${gt.file}; the GitHub issue is next`);
    next(local ? $("#gt-close") : issue);
  };
  issue.onclick = () => {
    const q = new URLSearchParams({ labels: manifest.groundTruth.label, title: gt.issue.title,
      body: gt.issue.body + `\n\n**Attach ${gt.file} below before submitting** (drag it into this box).` });
    window.open(`https://github.com/${REPO}/issues/new?${q}`, "_blank", "noopener");
    $("#gt-msg").textContent = `Attach ${gt.file} to the GitHub issue that just opened, then submit.`;
    step("submit", true, `Exported ${gt.file} and opened a GitHub issue for it`);
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

// a setting's help, or a step's: hovering or focusing what carries data-help shows it, beside it or, in the
// status bar, above it
function helpTip(e) {
  const h = e.target.closest && e.target.closest("[data-help]"), t = $("#tip");
  if (!h) return;
  const r = h.getBoundingClientRect();
  t.textContent = h.dataset.help; t.hidden = false;
  if (h.closest("#statusbar")) { t.style.left = Math.min(r.left, innerWidth - 330) + "px"; t.style.top = r.top - 6 - t.offsetHeight + "px"; }
  else { t.style.left = Math.min(r.right + 8, innerWidth - 330) + "px"; t.style.top = r.top + "px"; }
}
const hideHelp = (e) => { if (e.target.closest && e.target.closest("[data-help]")) $("#tip").hidden = true; };
document.addEventListener("mouseover", helpTip); document.addEventListener("focusin", helpTip);
document.addEventListener("mouseout", hideHelp); document.addEventListener("focusout", hideHelp);

// ---------- boxes that fold with the steps ----------
// A box's data-opens names the step after which it opens ("user": only its title opens it), and data-folds
// the one after which it folds; one with neither is open from the start. Between steps a box stays as the
// user left it.
const boxes = () => document.querySelectorAll(".box.foldable");
function unfoldFirst() { boxes().forEach((b) => b.classList.toggle("folded", b.hasAttribute("data-opens"))); retitle(); }
// a step just done: a new image folds every box waiting for a later step
function foldFor(key) {
  boxes().forEach((b) => {
    if (b.dataset.opens === key) b.classList.remove("folded");
    else if (b.dataset.folds === key || (key === "load" && b.hasAttribute("data-opens"))) b.classList.add("folded");
  });
  retitle();
}
// A box's title: its step's number, or a check once its task is done, and its name while the task waits; done,
// the folded box sums up what was done and the open one shows its data-done-name, else its name.
const summaries = new WeakMap(); // box -> its summary: text, or a node
function retitle() {
  [...boxes()].forEach((b, k) => {
    const h = b.querySelector(":scope > .sec-head h2");
    if (!h.querySelector(".title")) {
      h.dataset.name ||= h.textContent.trim();
      h.replaceChildren(Object.assign(document.createElement("span"), { className: "step-mark" }), Object.assign(document.createElement("span"), { className: "title" }));
    }
    const sum = summaries.get(b), done = sum != null, t = h.querySelector(".title");
    b.classList.toggle("done", done);
    h.querySelector(".step-mark").textContent = done ? "✓" : String(k + 1);
    const want = done && b.classList.contains("folded") ? sum : done ? h.dataset.doneName || h.dataset.name : h.dataset.name;
    if (typeof want === "string") { if (t.textContent !== want || t.children.length) t.textContent = want; }
    else if (t.firstChild !== want) t.replaceChildren(want);
  });
}
// a box's task done, summed up (text, or a node), or waiting again (null)
function boxDone(box, summary) {
  if (summary == null) summaries.delete(box); else summaries.set(box, summary);
  retitle();
}
// Load Image done: a small preview of the image, its name, and what the file says it holds
function loadedSummary() {
  const n = document.createElement("span"); n.className = "loaded";
  const pic = document.createElement("img"); pic.className = "pic"; pic.alt = "";
  const t = $("#base"), c = document.createElement("canvas"), side = 56, k = Math.max(side / t.width, side / t.height);
  c.width = c.height = side;
  c.getContext("2d").drawImage(t, (side - t.width * k) / 2, (side - t.height * k) / 2, t.width * k, t.height * k);
  pic.src = c.toDataURL();
  const text = document.createElement("span"); text.className = "what";
  const name = document.createElement("span"); name.className = "name"; name.textContent = st.fileName;
  const tags = document.createElement("span"); tags.className = "tags";
  let said = ""; try { const k = st.kept.bytes; said = holds(shape(k.buffer || k)); } catch (e) { console.warn("cannot read what the image holds:", e); }
  for (const w of (said || "2D").split(" · ")) tags.append(Object.assign(document.createElement("span"), { className: "tag", textContent: w }));
  text.append(name, tags); n.append(pic, text);
  return n;
}
function foldable() {
  document.querySelectorAll(".box.foldable > .sec-head h2").forEach((h) => {
    h.tabIndex = 0; h.setAttribute("role", "button");
    const flip = () => { h.closest(".box").classList.toggle("folded"); retitle(); };
    h.onclick = flip; h.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } };
  });
  unfoldFirst();
}
// the image back in view, from whichever of the study's views is on show
function showImage() { study.showImage?.(); view.minimapView(); }

// ---------- the left bar and theme ----------
// the left bar takes the width it is dragged to; a double click puts it back
{
  const lay = $("#layout"), saved = readJSON(BARS), g = $("#gutter-left");
  const set = (w) => {
    if (w == null) { lay.style.removeProperty("--lw"); return; }
    lay.style.setProperty("--lw", Math.round(Math.max(200, Math.min(w, innerWidth * 0.4))) + "px");
  };
  set(saved.left);
  g.addEventListener("pointerdown", (e) => {
    g.setPointerCapture(e.pointerId); document.body.classList.add("resizing");
    const move = (ev) => { saved.left = ev.clientX - lay.getBoundingClientRect().left; set(saved.left); view?.minimapView(); };
    const up = () => { g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); document.body.classList.remove("resizing"); writeJSON(BARS, saved); };
    g.addEventListener("pointermove", move); g.addEventListener("pointerup", up);
  });
  g.addEventListener("dblclick", () => { delete saved.left; set(null); writeJSON(BARS, saved); view?.minimapView(); });
}

function theme() {
  const set = document.documentElement.dataset.theme;
  return set || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
}
$("#theme").onclick = () => {
  const t = theme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME, t); } catch { /* private mode: lasts for this page only */ }
  signIn.changed(THEME);
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
// The page's own folder: a study's address is its id there, the default study's the folder itself. An
// address from before paths, ?study=<id>, names the same study.
const HOME = new URL("./", import.meta.url).pathname;
function studyOf(loc) {
  const rest = decodeURIComponent(loc.pathname.startsWith(HOME) ? loc.pathname.slice(HOME.length) : "").replace(/\.html$/, "");
  return (rest && rest !== "index" ? rest : new URLSearchParams(loc.search).get("study")) || DEFAULT_STUDY;
}
const addressOf = (id) => (id === DEFAULT_STUDY ? HOME : HOME + encodeURIComponent(id));

// The header's switcher, after GitHub's repository switcher: every study the build lists, each a link to its
// address, found by typing; the arrow keys mark one, Enter opens it. A plain click swaps it in place.
async function studyMenu() {
  let listed = [];
  try { listed = await (await fetch(HOME + "studies.json", { cache: "no-cache" })).json(); } catch (e) { console.warn("no list of studies:", e); }
  const use = (n) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${$(`#icons .${n}`).innerHTML}</svg>`;
  $("#study-list").replaceChildren(...listed.map((s) => {
    const a = document.createElement("a");
    a.href = addressOf(s.id); a.dataset.id = s.id;
    a.innerHTML = `<span class="tick">${use("tick")}</span>${use("study")}<span class="name"></span>`;
    a.querySelector(".name").textContent = s.title;
    a.onclick = (e) => {
      if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault(); goTo(s.id);
    };
    a.onmouseenter = () => mark(a);
    return a;
  }));
  markCurrent();
}
const rows = () => [...$("#study-list").children].filter((a) => !a.hidden);
function mark(a) { for (const r of $("#study-list").children) r.classList.toggle("active", r === a); }
function markCurrent() {
  for (const a of $("#study-list").children) {
    if (a.dataset.id === manifest?.id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
}
function filterStudies() {
  const q = $("#study-search").value.trim().toLowerCase();
  for (const a of $("#study-list").children) a.hidden = !!q && !a.textContent.toLowerCase().includes(q);
  $("#study-none").hidden = rows().length > 0;
  mark(rows().find((a) => a.hasAttribute("aria-current")) || rows()[0]);
}
$("#study-menu").addEventListener("toggle", () => {
  if (!$("#study-menu").open) return;
  $("#study-menu .pop").style.left = $("#study-menu .caret").offsetLeft + "px";
  $("#study-search").value = ""; filterStudies(); $("#study-search").focus();
});
$("#study-request").href = `https://github.com/${REPO}/issues/new?template=${STUDY_REQUEST}`;
$("#study-search").oninput = filterStudies;
$("#study-search").onkeydown = (e) => {
  const list = rows(), at = list.findIndex((a) => a.classList.contains("active"));
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (list.length) mark(list[(at + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]);
  } else if (e.key === "Enter") {
    e.preventDefault(); const a = list[at] || list[0]; if (a) goTo(a.dataset.id);
  } else if (e.key === "Escape") {
    $("#study-menu").open = false; $("#study-menu summary").focus();
  }
};

// One study at a time: the one the address names. Switching pushes the new address and swaps the study in
// place; Back and Forward swap too. Swaps run one after another, each to wherever the address is by then.
let swapping = Promise.resolve();
function goTo(id) {
  $("#study-menu").open = false;
  if (studyOf(location) === id) return;
  history.pushState(null, "", addressOf(id));
  swap();
}
addEventListener("popstate", () => swap());
function swap() {
  swapping = swapping.then(async () => {
    const id = studyOf(location);
    if (id === manifest?.id) return;
    leaveStudy();
    try {
      await mountStudy(id);
    } catch (e) { return status("Error: " + (e.message || e), true); }
    // before Python has started, it starts on this study
    if (!st.worker) return;
    $("#spin").classList.add("on");
    st.worker.postMessage({ type: "study", id });
  });
}

// the study's panels, put into the shell's slots, and its stylesheet: what leaves with it
let lifetime = new AbortController(), mounted = [], css = null;
// its panels go into the shell's slots, its stylesheet beside the shell's, then its module mounts
async function mountStudy(id) {
  if (!/^[\w-]+$/.test(id)) throw new Error(`no study "${id}"`);
  base = `../studies/${id}/`;
  const r = await fetch(base + "study.json");
  if (!r.ok) throw new Error(`no study "${id}"`);
  manifest = await r.json();
  document.title = manifest.title; $("#title").textContent = manifest.title; markCurrent();
  $("#file").accept = manifest.files.accept; $("#empty-text").textContent = manifest.files.empty;
  if (manifest.web.style) { css = document.createElement("link"); css.rel = "stylesheet"; css.href = base + manifest.web.style; document.head.append(css); }
  if (manifest.web.panels) {
    const panels = new DOMParser().parseFromString(await (await fetch(base + manifest.web.panels)).text(), "text/html");
    for (const t of panels.querySelectorAll("template[data-slot]")) {
      const nodes = [...document.importNode(t.content, true).childNodes];
      $(`slot-here[data-slot-for="${t.dataset.slot}"]`).before(...nodes); mounted.push(...nodes);
    }
  }
  // Preprocessing comes before the study's own work: it folds once the study's first step is done
  const first = manifest.phases[0]?.key;
  if (first) $("#preprocessing-box").dataset.folds = first; else delete $("#preprocessing-box").dataset.folds;
  unfoldFirst(); // before the first paint with them, so they do not fold in view
  view = viewers[manifest.viewer] ||= VIEWERS[manifest.viewer](shell);
  for (const v of new Set(Object.values(viewers))) v.active?.(v === view);
  view.channels(manifest.channels);
  const mod = await import(base + manifest.web.module);
  study = (await mod.mount(shell)) || {};
  view.use(study);
  showStage();
  if (!makesTruth() && manifest.groundTruth?.button) $(manifest.groundTruth.button).hidden = true;
  makeSteps();
  foldable();
}
const viewers = {};
// The study on show leaves: its panels, stylesheet, drawing, listeners and state go, and its Python's late
// answers are dropped; the image stays on show, to open again in the study that comes in.
function leaveStudy() {
  lifetime.abort(); lifetime = new AbortController();
  for (const n of mounted.splice(0)) n.remove();
  css?.remove(); css = null;
  study = {}; manifest = null; view?.use({}); view?.clear();
  for (const k of Object.keys(st)) if (!SHELL_STATE.has(k)) delete st[k];
  st.ready = false; $("#ram-gc").disabled = true;
  for (const w of Object.values(waiting)) w.splice(0).forEach((x) => x.bad(new Error("the study left")));
  busy(false); $("#notice").hidden = true; $("#tip").hidden = true;
  $("#image-view").hidden = false; delete $("#view").dataset.view;
}

const shell = {
  $, state: st, page, status, busy, statusBar, step, notice, slow, until, call, readJSON, writeJSON, esc, saveFile, submitTruth, icon, showImage, boxDone,
  get viewer() { return view; }, get study() { return manifest; }, get signal() { return lifetime.signal; },
};
splitter(shell);
// for the page's tests, which drive it from outside
window.st = st; window.$ = $; window.shellForTests = { saveThumb, page };

// an old address, ?study=<id> or index.html, becomes the study's own
if (new URLSearchParams(location.search).has("study") || location.pathname.endsWith("/index.html")) history.replaceState(null, "", addressOf(studyOf(location)) + location.hash);
studyMenu();
driveDialog(); slow($("#gt-export"));
mountStudy(studyOf(location)).then(start).catch((e) => status("Error: " + (e.message || e), true));
