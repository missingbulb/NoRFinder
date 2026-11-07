// The page's shell: it runs the study the address names (/<id>, the default at the bare address), and knows
// none of them; the header's switcher offers the ones the build lists and swaps one in without a reload. What it gives a study, as shell in mount(shell): loading images (from the
// computer or the remote store), Python (the study's own, run in worker.js), the viewer the study asks for,
// the page's state its controls are drawn from (page: get, set, watch(key, fn, {signal})), the status line and the busy screen, the steps' breadcrumbs (step(key, done, info) for the study's own), the switch to its item view (views) and the boxes' titles (boxDone(box, summary) once a box's task is done), a Markdown outline as HTML (outline(text)), notices, the user's saved settings, downloads and ground-truth
// submission; and around them the theme, the left bar, foldable boxes, Data Management (data_mode.js) with its Preprocessing (Split into parts), the resources dialog (storage, memory,
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
import { account, SIGNED_IN, SIGNED_IN_LABEL } from "./account.js";
import { remote } from "./drive.js";
import { settingsDialog } from "./settings_dialog.js";
import { offline, APP_ASKED, markOffline, CONNECTION } from "./offline.js";
import { welcome, WELCOME } from "./welcome.js";
import { actionLog, ACTIONS } from "./action_log.js";
import { identify, verdict } from "./browsers.js";
import { problemUrl, ACTIONS_QUOTED, ERRORS_QUOTED } from "./problem_report.js";
import { dataMode } from "./data_mode.js";
import { ROLE, ROLE_NAMES, held, shown, roleMenu } from "./roles.js";
import { imageEditor, SPLIT_PATTERN } from "./image_edit.js";
import { replacedBy } from "./edit.js";
import { dialogMotion } from "./dialog_motion.js";
import { truthTagger, LOCAL_GT } from "./truth_tagger.js";
import { subfolderName } from "./truth_folders.js";

const $ = (s) => document.querySelector(s);
// what the user does here, kept on this device for a problem report (req/shell/report/action-log)
const log = actionLog();
log.watch();
// image3d is the 2D viewer of a stack's flattened planes with a 3D view beside it, sharing the one 2D viewer
const VIEWERS = { image2d: viewer2d, image3d: (shell) => viewer3d(shell, viewers.image2d ||= viewer2d(shell)) };
const DEFAULT_STUDY = "viewer";
// the browser keys the shell saves under; their names predate studies, and a user's saved state lives in them
const THEME = "nor-theme"; // "dark" | "light"; absent = follow the system
const BARS = "nor-bars-v1"; // {left, collapsed}: the left bar's width in pixels, and whether it is collapsed (a right bar's, from before it went, is ignored)
// the last remote link pasted, in any study
const REMOTE_LINK = "nor-drive-link";
// {study id: the last remote link pasted in that study}
const REMOTE_LINKS = "nor-drive-links";
// "on" | "off": whether the remote files dialog shows thumbnails
const THUMBS = "nor-drive-thumbs";
// "on" | "off": whether an image downloaded from the remote store is kept on this device
const AUTO_SAVE = "nor-drive-autosave";
// + remote id: a JPEG data URL of the image, saved when it was opened
const SAVED_THUMB = "nor-drive-thumb:";
// [remote id], oldest first: which images have one
const SAVED_THUMBS = "nor-drive-thumbs-saved";
// {remote id: file name}: the image each saved thumbnail shows
const THUMB_NAMES = "nor-drive-thumb-names";
// {remote id: what the file holds, "3D · 8 slices" or "" when it cannot tell}, oldest first
const HOLDS = "nor-drive-holds";
const TIPS = "nor-tips-closed"; // [tip id]: the tips the user closed, never shown again
// when the wait after the store throttled the site's downloads ends, in ms
const THROTTLE = "nor-drive-throttled-until";
// [{id, name, path, study, at}], newest first: images opened from the remote store, path their folders under the link, study the one it was opened in, at when it was last opened (ms; absent for one kept before that was)
const RECENT = "nor-drive-recent";
const LOCAL_RECENT = "nor-local-recent"; // [{id, name, study, at}], newest first: files opened from this computer, each the browser's reference to it kept in FILE_HANDLES under id; on this device only
const FILE_HANDLES = "nor-file-handles-v1"; // the IndexedDB database of those references
// {folder id: {at, items: [{id, name, folder, size, created, sha}]}}: each folder as the remote files dialog last listed it, created in ms
const LISTINGS = "nor-drive-listings";
// Cache Storage, + remote id: an image downloaded from the remote store, its file name (URI-encoded) and when it was saved
// in the headers
const IMAGES = "nor-images-v1", IMAGE_NAME = "x-nor-name", IMAGE_AT = "x-nor-saved-at";
// and, for one kept since offline came, its folders under the study's link (a JSON list, URI-encoded) and the study
const IMAGE_PATH = "x-nor-path", IMAGE_STUDY = "x-nor-study";
// Cache Storage, + remote folder id: the folder's rauntruth-previews.tiff, its SHA-256, the folder's name and the study it was read in in the headers
const FOLDER_PREVIEWS = "nor-previews-v1", PREVIEWS_SHA = "x-nor-sha256";
// the paths each of those caches keeps its entries under, + remote id
const PREVIEWS_PATH = "drive-previews/";
const CACHED_IMAGE_PATH = "drive-image/";
const MOTION = "nor-motion"; // false: the user turned the page's animations off
const RESOURCES = "nor-resources"; // the status bar's disk, memory, network and CPU: "hidden" | "auto" | "open"; absent = "auto"
const SEEN_VERSION = "nor-seen-version"; // the site version the user last saw, to tell them what changed since
const MEMORY_TIP = "nor-memory-tip-off"; // true: the user asked never to see the low-memory popup again
// the page's memory with a study's Python loaded (studies/nor/detection/browser/MEMORY.md), and the device
// memory below which it asks the user to free some: browsers say only how much a computer has in all, never
// how much is free
const PAGE_GB = 1, LOW_GB = 4;
// what Chrome holds for the tab beyond what a page can read: the compiled code of Python and its packages, and the
// browser's own share; measured once as Chrome's private memory for the tab against the readable total (2026-10-07)
const UNREAD_MB = 190;
// the repo the site's issues are opened on: a problem report, a new study's request
const REPO = "missingbulb/RaunTruth";
// the issue form a proposal for a new study is written on
const STUDY_REQUEST = "new-study.yml";
// signing in (req/shell/account/sign-in): these settings follow the user to every device, in their own account's storage; the rest stay with this one
const FOLLOWS = [THEME, ROLE, TIPS, SEEN_VERSION, MEMORY_TIP, REMOTE_LINK, REMOTE_LINKS, THUMBS, RECENT, MOTION, RESOURCES];
const signIn = account({
  keys: FOLLOWS,
  menu: $("#user-menu"),
  applied: () => reapply(),
  // after the page's own start, which this may run during
  changed: () => queueMicrotask(() => { data.signedIn(); showRole(); drawStudies(); remoteHint(); }),
});
// signed in, the remote store is read as the user (req/shell/drive/credentials)
remote.use(signIn);
const remoteHint = () => { $("#remote-hint").textContent = remote.words.hint(signIn.signedIn()); };
// the remote store's name, words and logo, where the page shows them
$("#logos").insertAdjacentHTML("afterbegin", remote.logo.symbol);
$("#load-remote").title = $("#load-remote").ariaLabel = `Open from ${remote.label}`;
$("#load-original").title = `Open the image itself, not its preview: from this device when it is kept here, else from ${remote.label}`;
$("#remote-title").textContent = `Load from ${remote.label}`;
$("#remote-link").placeholder = remote.words.placeholder;
$("#remote-throttle-say").textContent = remote.words.throttled;
$("#remote-autosave-l").title = `Keep each image opened from ${remote.short} on this device, so it opens again without a download`;
$("#save-remote").textContent = `Save to ${remote.label}`;

// the tagger's side of the study's ground-truth folders: the line in its ground-truth box, Clear progress and Submit
const truth = truthTagger({ account: signIn, remote, manifest: () => manifest,
  image: () => (st.img ? { name: st.fileName, sha256: st.sha, source: st.source } : null), on: () => !!manifest && makesTruth(),
  cleared: () => restudy(true) });

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
  ready: false, readyInfo: null, queued: null, kept: null, busySince: 0, busyTimer: null, peeked: false, peek: null };
// What the shell's controls are drawn from (page_state.js): image, the image open ({name, source, W, H, um, umY,
// info, planes, channels, Z, spacing}: Z slices, spacing µm between them or null) or null; opening, the one being read ({name}) or null; and the viewer's own fields.
const page = pageState({ image: null, opening: null });
// what a study leaving leaves of the state: the shell's own fields
const SHELL_STATE = new Set(Object.keys(st));
let study = {}, view = null, manifest = null, base = "";

// ---------- status ----------
// said: the last thing the page said, {text, err}; loading: what the remote files dialog's thumbnails say while they
// load, in its place unless that was an error (req/shell/drive/dialog)
let said = null, loading = "";
const say = () => {
  const s = $("#status"); said ||= { text: s.textContent, err: false };
  s.textContent = loading && !said.err ? loading : said.text; s.classList.toggle("err", said.err);
};
function status(text, err) {
  said = { text, err: !!err }; say();
  if (err) log.add(text, "error");
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
  let got;
  // what the site keeps can change while it is counted (a cache entry deleted between listing and reading it):
  // the bar keeps its last count until the next one
  try { got = await inventory(); } catch (e) { return console.warn("what the site keeps could not be counted:", e); }
  const { sections, settings, overhead } = got;
  showDisk(sections.reduce((a, x) => a + x.entries.reduce((b, e) => b + e.size, 0), settings + overhead));
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

// ---------- the resources block: the disk, memory, network and CPU folded into one icon ----------
// (req/shell/status-bar/resources) Auto-hiding, it unfolds while hovered, and while something needs watching: the
// CPU over RAISE_CPU or the network over RAISE_RATE for RAISE_AFTER_MS, the tab over RAISE_RAM; it folds
// RAISE_LINGER_MS after the last of them ends.
const RES_MODES = ["hidden", "auto", "open"];
const RAISE_CPU = 0.5, RAISE_RATE = 250 * 1024, RAISE_RAM = 2 ** 30, RAISE_AFTER_MS = 5000, RAISE_LINGER_MS = 8000;
const raise = { cpuSince: null, netSince: null, until: 0 };
function showResources() {
  const m = readJSON(RESOURCES, "auto");
  $("#sb-res").dataset.mode = $("#res-mode").value = RES_MODES.includes(m) ? m : "auto";
}
showResources();
$("#res-mode").onchange = (e) => { writeJSON(RESOURCES, e.target.value); showResources(); };
$("#sb-res-icon").onclick = () => usage(usageTab || "storage");
$("#sb-online").onclick = () => usage("storage"); // where the page installs as an app and each study is made available offline
function raiseResources(cpuShare, rate) {
  const t = Date.now(), long = (since) => since != null && t - since > RAISE_AFTER_MS;
  raise.cpuSince = cpuShare > RAISE_CPU ? raise.cpuSince ?? t : null;
  raise.netSince = rate > RAISE_RATE ? raise.netSince ?? t : null;
  const watch = long(raise.cpuSince) || long(raise.netSince) || memoryNow().total > RAISE_RAM;
  if (watch) raise.until = t + RAISE_LINGER_MS;
  $("#sb-res").classList.toggle("raised", t < raise.until);
}
// ---------- the status bar's numbers: each changed character rolls up to its new one ----------
// Characters are paired from the right, so "9%" to "12%" rolls the 9 to a 2 and brings the 1 in from nothing;
// the old character is the rolling one's data-from, so the number reads as its new value throughout.
const SPIKE_MS = 3000, SHARP_CPU = 0.3, SHARP_RATE = 2 ** 20;
function showNumber(item, text, spike) {
  if (spike && !still()) {
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

// ---------- animations: on unless the user turned them off in the CPU tab, or asks the system for reduced motion ----------
// Off, the stylesheet stops every animation and transition but the spinners'; motion the page starts itself asks still()
const motion = $("#motion");
const showMotion = () => {
  let kept = null;
  try { kept = localStorage.getItem(MOTION); } catch { /* no storage */ }
  motion.checked = kept !== "false";
  document.documentElement.dataset.motion = motion.checked ? "on" : "off";
};
showMotion();
motion.onchange = () => { writeJSON(MOTION, motion.checked); showMotion(); };
function still() { return !motion.checked || matchMedia("(prefers-reduced-motion: reduce)").matches; }
dialogMotion(still);

$("#sb-net").onclick = () => usage("network");
$("#sb-cpu").onclick = () => usage("cpu");

// ---------- what this tab downloads ----------
// A browser gives a page no total, so it is summed from three places. The page's and Python's own timings,
// which give 0 for what the service worker answered and for a site that keeps its sizes from other pages;
// the service worker's, for what it fetched for this page and for its Python (sw.js); and the remote store's, which
// counts its own. From the browser's caches nothing is downloaded and nothing counts.
const net = { page: 0, worker: 0, sw: {} };
try {
  net.page = performance.getEntriesByType("navigation")[0]?.transferSize || 0;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) net.page += e.transferSize || 0; }).observe({ type: "resource", buffered: true });
} catch { /* no timings: the service worker's and the remote store's counts alone */ }
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
  const page = net.page + sw("page"), python = net.worker + sw("worker"), store = remote.received();
  return { page, python, store, total: page + python + store };
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
  const off = document.documentElement.classList.contains("offline") ? "Offline: no internet. " : "";
  $("#net-total").textContent = `${off}This tab is downloading ${speedText(rate)} and has downloaded ${sizeText(n.total)} since it opened.`;
  $("#net-list").replaceChildren(
    entry("The page", "Its own files; what this browser had kept counts nothing", sizeText(n.page)),
    entry("Python", "Python, its packages and the study's Python", sizeText(n.python)),
    entry(remote.label, "Images and folder lists; not its small pictures of images", sizeText(n.store)));
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
  raiseResources(c.total, rate);
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
  PostGT: { light: "green", what: "It makes ground truth, and has batch actions too.",
    next: "To move on to Published, its algorithm needs to be trusted, so the page only shows what it finds." },
  Published: { light: "all", what: "Its algorithm is trusted: the page shows what it finds, with no ground truth to make.", next: "This is the last stage." },
};
function showStage() {
  if (manifest.stage) document.documentElement.dataset.stage = manifest.stage; else delete document.documentElement.dataset.stage;
  const tag = $(`#study-list a[data-id="${manifest.id}"] .stage-tag`);
  if (tag) stageTag(tag, manifest.stage);
}
// a study's stage in the switcher: a small label bordered in the stage's colour; a study with none leaves it empty
function stageTag(tag, stage) {
  tag.textContent = stage || ""; tag.dataset.stage = stage || ""; tag.dataset.light = STAGES[stage]?.light || "";
}
// the stages, the given one highlighted and those before it crossed out, with what moves a study on from it
function fillStages(stage) {
  const now = Object.keys(STAGES).indexOf(stage);
  $("#stage-list").replaceChildren(...Object.entries(STAGES).map(([name, s], k) => {
    const li = document.createElement("li"); li.className = k < now ? "past" : k === now ? "now" : "";
    li.innerHTML = `<span class="dot" data-light="${s.light}"></span><span class="name">${name}</span><span class="what">${esc(s.what)}</span>`;
    return li;
  }));
  $("#stage-next").textContent = STAGES[stage]?.next || "";
}
// the stages pop up beside the switcher while a study's stage label is hovered, about that study
const stagePop = $("#stage-pop");
let stageLeaving = null;
function stageHover(tag) {
  tag.addEventListener("mouseenter", () => {
    if (!tag.dataset.stage) return;
    clearTimeout(stageLeaving);
    fillStages(tag.dataset.stage);
    const menu = $("#study-menu .pop").getBoundingClientRect(), row = tag.closest("a").getBoundingClientRect();
    if (!stagePop.matches(":popover-open")) stagePop.showPopover();
    stagePop.style.left = Math.max(8, Math.min(menu.right + 8, innerWidth - stagePop.offsetWidth - 8)) + "px";
    stagePop.style.top = Math.max(8, Math.min(row.top - 12, innerHeight - stagePop.offsetHeight - 8)) + "px";
  });
  tag.addEventListener("mouseleave", leaveStage);
}
function leaveStage() {
  clearTimeout(stageLeaving);
  stageLeaving = setTimeout(() => { if (!stagePop.matches(":hover") && stagePop.matches(":popover-open")) stagePop.hidePopover(); }, 300);
}
stagePop.addEventListener("mouseenter", () => clearTimeout(stageLeaving));
stagePop.addEventListener("mouseleave", leaveStage);
const stageTruth = () => manifest.stage === "GT" || manifest.stage === "PostGT";
// the study takes Ground Truth Taggers: every stage but Published, whose algorithm is trusted (req/shell/account/role)
const takesTaggers = () => manifest.stage !== "Published";
// the study makes ground truth for this user: a Ground Truth Tagger in a study that makes it (req/shell/account/role)
const makesTruth = () => stageTruth() && role === "tagger";

// ---------- the role the user works in (req/shell/account/role) ----------
let role = "viewer";
const rolesHeld = () => held({ signedIn: signIn.signedIn(), tagging: takesTaggers(), manager: data.manager });
const keptRole = () => { try { return localStorage.getItem(ROLE); } catch { return null; } };
// the role shown, as the study comes in: before its steps are drawn from it
function takeRole() {
  const roles = rolesHeld();
  role = shown(roles, keptRole());
  document.documentElement.dataset.role = role;
  const hint = roles.length > 1 ? "" : !signIn.signedIn() && signIn.offered
    ? (takesTaggers() ? `${signIn.words.signIn} to tag ground truth.` : `${signIn.words.signIn} for the roles your studies give you.`) : "";
  roleChooser.draw(roles, role, hint);
}
// the role shown again, once what it rests on may have changed (a choice, a sign-in, the settings synced): a change
// to or from Ground Truth Tagger opens the study afresh on the same image
function showRole() {
  if (!manifest) return;
  const tagger = role === "tagger";
  takeRole();
  if ((role === "tagger") !== tagger) return restudy();
  data.role(role === "data");
  truth.draw();
}
const roleChooser = roleMenu($("#role-menu"), (r) => {
  try { localStorage.setItem(ROLE, r); } catch { /* private mode: this page only */ }
  signIn.changed(ROLE);
  log.add(`Chose the role ${ROLE_NAMES[r]}`);
  showRole();
});

// ---------- the image and the item view ----------
// A study with an item view gets the switch between it and the image. While the study makes ground truth its
// cards are the tasks that make it, and the switch says how many are left; otherwise they show what was found.
// count(left, total) from the study, null until it has any; on(fn) hears the view now shown, "image" or "items".
// An item view marked data-viewing only shows what was found: while the study makes ground truth it is not shown,
// and the study lists its tasks itself. One marked data-shelved is not shown in any role.
const itemsView = () => { const v = $("#items-view"); return v && !v.hasAttribute("data-shelved") && !(makesTruth() && v.hasAttribute("data-viewing")) ? v : null; };
const views = {
  now: "image", left: null, total: null, heard: [],
  show(v) {
    views.now = v; $("#tip").hidden = true;
    $("#image-view").hidden = v !== "image"; if ($("#items-view")) $("#items-view").hidden = v !== "items" || !itemsView();
    $("#view").dataset.view = v; views.draw();
    for (const fn of views.heard) fn(v);
  },
  on(fn) { views.heard.push(fn); lifetime.signal.addEventListener("abort", () => views.heard.splice(views.heard.indexOf(fn), 1)); },
  count(left, total) { views.left = left ?? null; views.total = total ?? null; views.draw(); },
  // the item view is the tasks that make the ground truth: a bar heads them, how many done and the study's Submit
  get tasks() { return makesTruth() && !!itemsView(); },
  draw() {
    const b = $("#switch"), tasks = makesTruth(), bar = $("#tasks-bar"), m = bar.querySelector("meter");
    bar.hidden = !views.tasks;
    bar.querySelector(".done").textContent = views.total === null ? "No tasks yet" : `${views.total - views.left} of ${views.total} done`;
    m.max = views.total || 1; m.value = views.total === null ? 0 : views.total - views.left;
    b.querySelector(".name").textContent = views.now === "items" ? "Image" : tasks ? "Tasks" : "Items";
    b.querySelector(".count").textContent = views.now === "items" || views.total === null ? ""
      : !tasks ? String(views.total) : views.left ? `${views.left} left` : "done";
  },
  mount() {
    $("#switch").hidden = !itemsView(); $("#switch").disabled = true;
    views.left = views.total = null; views.show("image");
  },
};
$("#switch").onclick = () => views.show(views.now === "image" ? "items" : "image");
// The study's steps, in order, in one state that the breadcrumbs and the shining buttons are drawn from:
// [{key, name, button, done, info, at}]. Load image and Submit GT are the shell's, the study's own come from its
// study.json; the step to do now is the first not done.
let steps = [], shone = [];
const stepsWatch = new MutationObserver(() => drawSteps());
function makeSteps() {
  steps = [{ key: "load", name: "Load image", button: loadButton() }, ...manifest.phases,
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
    p.at = new Date(); log.add(`Step done: ${p.name}`);
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
  // the button lit last time may belong to no step now: the study switched, or the step's button changed
  for (const b of shone.splice(0)) b.classList.remove("shine");
  steps.forEach((p, k) => { const b = p.button && $(p.button); if (b && k === now && !b.disabled && !b.hidden) { b.classList.add("shine"); shone.push(b); } });
}
// the shining crumb leads to its button: the box it is in unfolds, it scrolls into view, and it is pressed
function goToStep(e) {
  const c = e.target.closest(".crumb.now"), p = c && steps.find((x) => "sb-" + x.key === c.id), b = p?.button && $(p.button);
  if (!b || b.hidden) return;
  if (b.closest("#tasks-bar, #items-view") && views.now !== "items") views.show("items");
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
// a wait that working() takes up a frame later: its failure counted as handled from the start, so the study leaving
// within that frame is no uncaught error
const taken = (p) => { p.catch(() => {}); return p; };
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
// once only: the shell's own buttons outlive a study, so a study slowing one again on its next mount would hold
// it from inside its own hold, and the click would do nothing
const slow = (btn) => {
  if (btn.onclick?.slow) return;
  const act = btn.onclick; btn.onclick = Object.assign((e) => working(btn, () => act.call(btn, e)), { slow: true });
};

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
    offlineCopy.keepSite().then(diskBar, (e) => console.warn("no copy of the site for offline:", e));
  }
  status("Loading Python in the background…"); $("#spin").classList.add("on");
  pythonWorker();
  if (navigator.deviceMemory <= LOW_GB) memoryTip();
}
// Python's thread, on the study the address names, in place of any before it
function pythonWorker() {
  st.worker?.terminate();
  st.worker = new Worker("worker.js?study=" + encodeURIComponent(studyOf(location)), { type: "module" });
  st.worker.onmessage = (e) => onWorker(e.data);
  st.worker.onerror = (e) => onWorker({ type: "error", text: e.message || "Python stopped." });
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
    if (!st.ready) { st.failed = true; $("#spin").classList.remove("on"); }
    // what being offline stops is said plainly: the online icon already says why (req/shell/offline/default)
    if (m.offline) status(m.text); else status("Error: " + m.text, true);
    if (OUT_OF_MEMORY.test(m.text)) memoryTip(true);
  } else if (m.type === "ready") {
    st.ready = true; st.readyInfo = m.info; $("#spin").classList.remove("on");
    study.ready?.(m.info); statusBar(); diskBar();
    $("#ram-gc").disabled = false;
    status("Ready. Load an image.");
    if (st.queued) { const q = st.queued; st.queued = null; send(q.name, q.bytes); }
  } else if (m.type === "opened") {
    st.um = m.meta.um; st.umY = m.meta.um_y;
    page.set({ opening: null, image: { name: st.fileName, source: st.source, W: m.meta.W, H: m.meta.H, um: st.um, umY: st.umY,
      info: m.meta.info, planes: m.images, channels: m.meta.channels || null, Z: m.meta.Z || 1, spacing: m.meta.spacing ?? null } });
    busy(false); statusBar();
    showImage();
    boxDone($("#image-box"), loadedSummary());
    const from = remote.owns(st.source) ? remote.label : st.source?.kind === "preview" ? `its preview in ${remote.label}` : "this computer";
    step("load", true, `${st.fileName}, ${m.meta.W} × ${m.meta.H} px, from ${from}`);
    log.add(`Opened an image from ${from}, ${m.meta.W} × ${m.meta.H} px, ${m.meta.Z || 1} slice(s)`);
    status("Image loaded."); // the study's opened hook says what comes next, if anything
    study.opened?.(m.meta);
    truth.paint(); offerTruth();
    if (st.source && st.source.kind === "local" && makesTruth()) notice(LOCAL_GT(remote));
    if (remote.owns(st.source) && st.pictured !== st.source.id) saveThumb(st.source.id, st.fileName);
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
// where the study opens images from (req/shell/load/from): Load at the box's foot for this computer alone; else the
// image selector on its top line, with the computer's button where it opens local files and the remote store's button
const fromRemote = () => remote.study(manifest).opens;
const fromLocal = () => !!manifest?.files.from.includes("local");
// the browser keeps a reference to a file a page chose only where the page chooses it itself (Chrome and Edge)
const remembersFiles = () => typeof window.showOpenFilePicker === "function";
const RECENT_KEEP = 30;
// the images opened lately in the study on show (req/shell/load/selector): from the remote store, and where it opens local
// files and the browser can keep a reference to them, from this computer; newest first
const recentHere = (list) => list.filter((r) => r.study === manifest?.id);
function recentAll() {
  const local = fromLocal() && remembersFiles() ? recentHere(readJSON(LOCAL_RECENT, [])).map((r) => ({ ...r, local: true })) : [];
  return [...recentHere(readJSON(RECENT, [])), ...local].sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity)).slice(0, RECENT_KEEP);
}
// the control the Load image step points at, and the one held while an image opens
const loadButton = () => (!fromRemote() ? "#load-main" : recentAll().length ? "#image-pick" : fromLocal() ? "#load-main" : "#load-remote");
const loadHolder = () => $(fromRemote() ? "#image-pick" : "#load-main");
function placeLoad() {
  $("#load").toggleAttribute("data-remote", fromRemote()); $("#load").toggleAttribute("data-local", fromLocal());
  if (fromRemote()) $("#file-box").before($("#load")); else $("#image-foot").prepend($("#load"));
}
// the Image box draws from the page's state: the image's name and what its file says, the control to load with
// filled until an image is open and plain after, and Unload once one is
function imageBox() {
  const opening = page.get("opening"), im = page.get("image"), name = opening?.name || im?.name, remoteOn = fromRemote();
  $("#file-name").textContent = remoteOn && name ? "Details" : name || "No image loaded"; $("#file-name").classList.toggle("dim", !name);
  fileInfo(opening ? null : im?.info || null);
  $("#load").classList.toggle("done", !!im); $("#unload").hidden = !im;
  const listed = remoteOn && recentAll().length > 0;
  $("#image-pick .pick-name").textContent = name || (listed ? "Choose an image" : "No image opened here yet");
  $("#image-pick").classList.toggle("dim", !name);
  $("#image-pick").classList.toggle("primary", !im && listed); $("#load-remote").classList.toggle("primary", !im && !listed && !fromLocal());
  $("#load-main").classList.toggle("primary", !remoteOn || (!im && !listed));
  $("#load-original").hidden = im?.source?.kind !== "preview";
}
page.watch("image", imageBox); page.watch("opening", imageBox);

// source: where the image came from, {kind: "local"} or the remote store's source of it
async function openBytes(name, bytes, source) {
  const opened = taken(until("opened")); working(loadHolder(), () => opened);
  st.fileName = name; st.source = source;
  for (const p of steps) Object.assign(p, { done: false, info: "", at: null, pressed: false });
  drawSteps(); boxes().forEach((b) => summaries.delete(b)); retitle();
  // a copy, for Edit Image and the problem report: the bytes themselves go to Python
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
// the study's own remote folders, which its dialog browses alone; a study naming none (the Image Viewer) takes a pasted
// link instead (req/shell/drive/dialog)
const studyFolders = () => remote.study(manifest).folders;
// the link the remote files dialog opened on: listing it is not pasting it
let remoteFrom = "", remoteOpened = () => {};
function openRemote() {
  $("#image-menu").open = false;
  const pastes = !studyFolders().length;
  $("#remote-dlg").classList.toggle("folders", !pastes);
  remoteFrom = $("#remote-link").value = pastes ? readJSON(REMOTE_LINKS)[manifest.id] || readJSON(REMOTE_LINK, "") : "";
  $("#remote-dlg").showModal(); if (pastes) $("#remote-link").select(); showSaved();
  holdRemote();
  remoteOpened();
}
// a file from this computer: through the browser's own picker where it keeps a reference to the file, so the file
// opens again from the recents (req/shell/load/selector); else through the file chooser
$("#load-main").onclick = async () => {
  if (!remembersFiles() || !fromRemote()) return $("#file").click();
  let handle;
  try { [handle] = await showOpenFilePicker({ types: [{ description: "Images", accept: { "image/*": manifest.files.accept.split(",") } }] }); } catch (e) {
    if (e.name !== "AbortError") status("Error: " + (e.message || e), true);
    return;
  }
  openLocal(handle);
};
$("#load-remote").onclick = () => { signIn.renew(); openRemote(); };
$("#image-pick").addEventListener("click", () => signIn.renew());
// a setting from before each study loaded from one place (req/shell/load/from)
try { localStorage.removeItem("nor-load-source"); } catch { /* nothing kept */ }
// no image open, nor one waiting for Python, and Python letting it go
function dropImage() {
  Object.assign(st, { kept: null, queued: null, fileName: "", source: null, sha: "", um: null, umY: null });
  if (st.ready) st.worker.postMessage({ type: "close" });
  page.set({ image: null, opening: null }); boxDone($("#image-box"), null);
  offered++; $("#truth-box").hidden = true;
}
// Unload: no image open, the study starting over as one that has just come in
$("#unload").onclick = () => {
  if (!st.img || loadHolder().classList.contains("working")) return;
  restudy(false);
};
// the study mounted again in place, Python kept; again: the image open, opened again in it
function restudy(again = true) {
  swapping = swapping.then(async () => {
    const { ready, readyInfo } = st, id = manifest.id, image = again && st.img ? st.kept : null;
    dropImage();
    leaveStudy();
    try { await mountStudy(id); } catch (e) { return status("Error: " + (e.message || e), true); }
    if (ready) { st.ready = true; $("#ram-gc").disabled = false; study.ready?.(readyInfo); }
    statusBar(); status(ready ? "Ready. Load an image." : "Loading Python in the background…");
    if (image) openBytes(image.name, image.bytes, image.source);
  });
}

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
  anchor.style.anchorName = "--tip-" + id; t.style.setProperty("--anchor", "--tip-" + id);
}
function closeTip(id) {
  const t = document.querySelector(`.tip-bubble[data-tip="${id}"]`);
  if (!t) return;
  t.remove(); writeJSON(TIPS, [...new Set([...readJSON(TIPS, []), id])]);
}
// the selector is what the recent-files tip asks the user to open; opened, its selected image has the focus, so
// Enter opens it, the arrows move between them and Escape closes it
$("#image-menu").addEventListener("toggle", () => {
  if (!$("#image-menu").open) return;
  closeTip("recent-files");
  greyRecents();
  const rows = [...$("#recent").querySelectorAll(".recent")];
  (rows.find((b) => b.getAttribute("aria-selected") === "true") || rows[0])?.focus();
});
$("#image-menu").addEventListener("keydown", (e) => {
  const rows = [...$("#recent").querySelectorAll(".recent:not(:disabled)")], at = rows.indexOf(document.activeElement);
  if (e.key === "Escape") { e.preventDefault(); $("#image-menu").open = false; $("#image-pick").focus(); }
  else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && rows.length) {
    e.preventDefault(); rows[(at + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length].focus();
  }
});

// the images opened from the remote store lately in the study on show, in the image selector; a remote id names one file wherever
// it is, so two of one name stay apart; one kept from before recents had a study belongs to none. openRecent is the remote files dialog's, which opens the copy kept on this device when there is one.
let openRecent = () => {}, showKept = () => {};
const UNREACHED = "The internet cannot be reached, and this image is not kept on this device.";
function remember(id, name, path) {
  const study = manifest.id, rest = readJSON(RECENT, []).filter((r) => r.study && !(r.id === id && r.study === study));
  const mine = [{ id, name, path, study, at: Date.now() }, ...rest.filter((r) => r.study === study)].slice(0, RECENT_KEEP);
  writeJSON(RECENT, [...mine, ...rest.filter((r) => r.study !== study)]);
  showRecent();
}
// the browser's references to files from this computer, by id, in IndexedDB: what a page cannot keep anywhere else
function handles(mode, act) {
  return new Promise((ok, bad) => {
    const q = indexedDB.open(FILE_HANDLES, 1);
    q.onupgradeneeded = () => q.result.createObjectStore("files");
    q.onerror = () => bad(q.error);
    q.onsuccess = () => {
      const t = q.result.transaction("files", mode), r = act(t.objectStore("files"));
      t.oncomplete = () => { q.result.close(); ok(r?.result); }; t.onerror = () => { q.result.close(); bad(t.error); };
    };
  });
}
// a file opened from this computer, by the browser's reference to it: one entry however often it is opened, the
// references the recents no longer list let go
async function openLocal(handle, known) {
  let file;
  try {
    if ((await handle.queryPermission({ mode: "read" })) !== "granted" && (await handle.requestPermission({ mode: "read" })) !== "granted")
      return notice(`${handle.name} was not opened: the browser was not allowed to read it again.`);
    file = await handle.getFile();
  } catch (e) {
    return notice(`${handle.name} could not be opened: it may have been moved or deleted. (${e.message || e})`);
  }
  const bytes = await file.arrayBuffer();
  let id = known;
  try {
    if (!id) for (const r of recentHere(readJSON(LOCAL_RECENT, []))) {
      const h = await handles("readonly", (s) => s.get(r.id));
      if (h && (await h.isSameEntry(handle))) { id = r.id; break; }
    }
    id ||= crypto.randomUUID();
    const study = manifest.id, rest = readJSON(LOCAL_RECENT, []).filter((r) => !(r.id === id && r.study === study));
    const list = [{ id, name: file.name, study, at: Date.now() }, ...rest].filter((r, k, all) => all.filter((x) => x.study === r.study).indexOf(r) < RECENT_KEEP);
    writeJSON(LOCAL_RECENT, list);
    const keep = new Set(list.map((r) => r.id));
    await handles("readwrite", (s) => { s.put(handle, id); s.getAllKeys().onsuccess = (e) => e.target.result.forEach((k) => keep.has(k) || s.delete(k)); });
  } catch (e) { console.warn("this file is not kept among the recent ones:", e); }
  showRecent();
  peek()(bytes, bytes.byteLength);
  openBytes(file.name, bytes, { kind: "local" });
}
async function openLocalRecent(r) {
  const h = await handles("readonly", (s) => s.get(r.id)).catch(() => null);
  if (!h) return notice(`${r.name} is no longer known to this browser: open it again with the computer's button.`);
  openLocal(h, r.id);
}
// how long since an image was last opened, "<1h", "3h", "6d", "2mo" or "1y"; "" when that is not known
function ago(at) {
  if (at == null) return "";
  const h = (Date.now() - at) / 3600000, d = h / 24;
  return h < 1 ? "<1h" : h < 24 ? `${Math.floor(h)}h` : d < 30 ? `${Math.floor(d)}d` : d < 365 ? `${Math.floor(d / 30)}mo` : `${Math.floor(d / 365)}y`;
}
const agoTag = (at) => (at == null ? "" : `<span class="age" title="Opened ${esc(new Date(at).toLocaleString())}">${ago(at)}</span>`);
function showRecent() {
  const list = recentAll(), box = $("#recent"), open = page.get("image")?.source;
  const on = remote.owns(open) && list.some((r) => r.id === open.id) ? open.id : list[0]?.id;
  box.replaceChildren(...list.map((r) => {
    const b = document.createElement("button"), where = r.local ? "This computer" : [remote.label, ...(r.path || [])].join(" / ");
    b.type = "button"; b.className = "item recent"; b.title = `${where} / ${r.name}`; b.dataset.id = r.id; if (r.local) b.dataset.local = "";
    b.setAttribute("role", "option"); b.setAttribute("aria-selected", String(r.id === on));
    const logo = r.local ? "computer-logo" : remote.logo.id;
    b.innerHTML = `<svg class="${logo}" aria-hidden="true"><use href="#${logo}"/></svg><span class="what"><span class="name">${esc(r.name)}</span><span class="where">${esc(where)}</span></span>${agoTag(r.at)}`;
    b.onclick = () => { $("#image-menu").open = false; r.local ? openLocalRecent(r) : openRecent(r); };
    return b;
  }));
  const how = fromLocal() ? "the buttons at the right open one" : `${remote.short}'s button, at the right, opens one`;
  if (!list.length) box.append(Object.assign(document.createElement("p"), { className: "hint", textContent: `No image opened here yet: ${how}.` }));
  imageBox();
  const s = steps.find((p) => p.key === "load");
  if (s && s.button !== loadButton()) { s.button = loadButton(); drawSteps(); }
}
// offline, an image not kept on this device opens nothing, and is greyed
async function greyRecents() {
  const off = offlineCopy.offline(), kept = off ? await keptIds() : null;
  for (const b of $("#recent").querySelectorAll(".recent")) b.disabled = off && !b.hasAttribute("data-local") && !kept.has(b.dataset.id);
}
page.watch("image", () => showRecent());
addEventListener(CONNECTION, () => greyRecents());

// once the store throttles the site's downloads the remote files dialog waits WAIT, with a notice and a countdown, and
// calls the remote store for nothing; the end is kept in the browser, so a reload does not cut it short. waitEnded is the
// dialog's, which lists its link again.
const WAIT = 15 * 60000;
let ticker = 0, waitEnded = () => {};
const throttled = () => readJSON(THROTTLE, 0) > Date.now();
function holdRemote() {
  const on = throttled(), left = Math.max(0, readJSON(THROTTLE, 0) - Date.now()), two = (n) => String(n).padStart(2, "0");
  $("#remote-throttle").hidden = !on; $("#remote-dlg").classList.toggle("throttled", on);
  $("#remote-link").disabled = $("#remote-go").disabled = on;
  if (on) $("#remote-open").disabled = true;
  $("#remote-clock").textContent = `${two(Math.floor(left / 60000))}:${two(Math.floor(left / 1000) % 60)}`;
  if (on && !ticker) ticker = setInterval(holdRemote, 1000);
  if (!on && ticker) {
    clearInterval(ticker); ticker = 0;
    try { localStorage.removeItem(THROTTLE); } catch { /* nothing kept */ }
    waitEnded();
  }
}
function throttle() { writeJSON(THROTTLE, Date.now() + WAIT); holdRemote(); }

// the remote files dialog: a pasted file link loads at once; a folder link lists its images and subfolders, where a
// click selects and Open (or a double click) opens the selection
function remoteDialog() {
  const msg = (t, err) => { const m = $("#remote-msg"); m.textContent = m.title = t; m.classList.toggle("err", !!err); };
  // keptOn: the dialog lists the images kept here, offline, in place of a remote folder
  let trail = [], chosen = null, listing = 0, keptOn = false;
  // path: the folders the image is in under the link it was opened from; sha: its SHA-256 as the listing gave
  // it (null when the store gave none), undefined when not yet asked; recent: whether it was chosen from the recents.
  // A recent image opens from its kept copy; one chosen from the remote store does only once its SHA-256 matches the store's.
  const take = async (id, name, path, sha, recent) => {
    thumbs.stop();
    const kept = await savedImage(id);
    if (kept && !recent && sha === undefined && !throttled()) sha = await remote.checksum(id).catch(() => null);
    // offline, a copy kept here is the only one to be had
    if (kept && (recent || offlineCopy.offline() || (sha && sha === (await sha256(kept.bytes))))) {
      $("#remote-dlg").close(); msg("");
      peek()(kept.bytes, kept.bytes.byteLength); remember(id, kept.name, path); picture(id, kept.name, kept.bytes);
      if (!recent) tip("recent-files", $("#image-pick"), "To load recent files click here");
      return openBytes(kept.name, kept.bytes, remote.source(id));
    }
    if (throttled()) { if (!$("#remote-dlg").open) $("#remote-dlg").showModal(); return holdRemote(); }
    msg("Downloading " + (name || "the image") + "…");
    const mb = (n) => (n / 1048576).toFixed(1);
    let push, what;
    try {
      const f = await remote.file(id, name, (n) => {
        what = n; $("#remote-dlg").close(); msg(""); push = peek(); busy(true, `Downloading ${n}…`, "peek");
      }, (buf, got, total) => {
        push(buf, got);
        $("#busy-text").textContent = `Downloading ${what} · ${mb(got)}${total ? " of " + mb(total) : ""} MB`;
      });
      if (f.folder) { trail = [f]; return show(); }
      if ($("#remote-autosave").checked) saveImage(id, f.name, f.bytes, { path, study: manifest.id });
      remember(id, f.name, path); picture(id, f.name, f.bytes);
      openBytes(f.name, f.bytes, remote.source(id));
    } catch (err) {
      busy(false); if (!$("#remote-dlg").open) $("#remote-dlg").showModal();
      // what the download had painted goes: the image open before, or none
      if (push) page.get("image") ? showImage() : view.clear();
      if (err.throttled) { msg(""); return throttle(); }
      msg(err instanceof TypeError || offlineCopy.offline() ? UNREACHED : err.message || String(err), true);
    }
  };
  const choose = (f, b) => {
    chosen = f; $("#remote-open").disabled = !f;
    $("#remote-list").querySelectorAll(".item").forEach((e) => e.setAttribute("aria-selected", e === b));
  };
  // where an image is: the folders under the one it was opened from, the study's own list of folders no folder
  const enter = (f) => (f.folder ? (trail.push(f), show()) : f.kept ? take(f.id, f.name, f.path, undefined, true)
    : take(f.id, f.name, trail.filter((t) => !t.roots).slice(1).map((t) => t.name), f.sha));
  // offline, in place of a remote folder: the images kept on this device, the study's own first (req/shell/offline/default)
  showKept = async () => {
    keptOn = true; thumbs.stop(); trail = []; choose(null);
    $("#remote-path").textContent = "You are offline: the images kept on this device"; $("#remote-list").replaceChildren();
    const kept = [];
    try {
      const c = await caches.open(IMAGES);
      for (const q of await c.keys()) {
        const r = await c.match(q), path = r.headers.get(IMAGE_PATH);
        kept.push({ id: idOf(q.url), name: decodeURIComponent(r.headers.get(IMAGE_NAME) || ""),
          path: path ? JSON.parse(decodeURIComponent(path)) : [], study: r.headers.get(IMAGE_STUDY), size: (await r.blob()).size, kept: true });
      }
    } catch (e) { console.warn("cannot read the images kept here:", e); }
    kept.sort((a, b) => (b.study === manifest.id) - (a.study === manifest.id) || a.name.localeCompare(b.name));
    msg(kept.length ? "" : "No image is kept here: Make available offline, in Manage storage, keeps a study's.");
    for (const f of kept) {
      const b = document.createElement("button"); b.type = "button"; b.className = "item"; b.setAttribute("aria-selected", "false");
      const meta = [sizeText(f.size), [remote.label, ...f.path].join(" / ")].join(" · ");
      b.innerHTML = `<span class="pic"></span><span class="name">${esc(f.name)}</span><span class="kept"></span><span class="shape">${esc(readJSON(HOLDS)[f.id] || "")}</span><span class="meta">${esc(meta)}</span>`;
      markOffline(b.querySelector(".kept"), "image", true);
      const pic = readJSON(SAVED_THUMB + f.id, "");
      if (pic) b.querySelector(".pic").append(Object.assign(new Image(), { alt: "", src: pic }));
      b.onclick = () => choose(f, b);
      b.ondblclick = () => enter(f);
      b.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); enter(f); } };
      $("#remote-list").append(b);
    }
  };
  openRecent = (r) => take(r.id, r.name, r.path || [], undefined, true);
  // the folders as last listed, kept on this device so the dialog opens offline too (req/shell/drive/offline-listing),
  // the latest KEEP_LISTINGS of them; created in ms, size and sha null where the store gave none
  const KEEP_LISTINGS = 50;
  const keptListing = (id) => readJSON(LISTINGS)[id]?.items.map((f) => ({ ...f, created: f.created == null ? null : new Date(f.created) })) || null;
  const keepListing = (id, all, name) => {
    const items = all.map((f) => ({ id: f.id, name: f.name, folder: f.folder, size: f.size, created: f.created ? f.created.getTime() : null, sha: f.sha }));
    const latest = Object.entries({ ...readJSON(LISTINGS), [id]: { at: Date.now(), name, items } }).sort((x, y) => y[1].at - x[1].at).slice(0, KEEP_LISTINGS);
    writeJSON(LISTINGS, Object.fromEntries(latest));
  };
  // a folder's rows; offline, an image not kept here and a folder never listed are greyed and open nothing; seen: the
  // ids the folder held when last listed here, an image not among them new, or null when it was never listed
  const draw = async (at, all, off, asked, seen = null) => {
    const kept = await keptIds();
    if (asked !== listing) return;
    // an image an edit replaced is not listed: the folder of its edits stands in its place
    const file = all.find((f) => !f.folder && f.name === PREVIEWS), edited = replacedBy(all), items = all.filter((f) => f !== file && !edited(f));
    const opened = Object.fromEntries(recentHere(readJSON(RECENT, [])).map((r) => [r.id, r.at])), listings = readJSON(LISTINGS);
    $("#remote-list").replaceChildren(); choose(null); thumbs.reset();
    thumbs.cover(file ? folderPreviews(at, file) : null);
    msg(items.length ? "" : "No TIFF or PNG images here.");
    for (const [k, f] of items.entries()) {
      const b = document.createElement("button"); b.type = "button"; b.className = "item" + (f.folder ? " folder" : "");
      b.setAttribute("aria-selected", "false");
      const meta = f.size == null ? "" : sizeText(f.size);
      const added = f.created ? `Added to ${remote.label} on ${f.created.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : `When it was added to ${remote.label} is not known`;
      const fresh = !f.folder && seen && !seen.has(f.id) ? `<span class="new" title="${esc(added)}">new</span>` : "";
      // what only some rows show sits inward, what every image shows at the row's edge
      b.innerHTML = `<span class="pic"></span><span class="name">${esc(f.name)}</span>${fresh}${f.folder ? "" : agoTag(opened[f.id])}<span class="gt-tag"></span><span class="kept"></span><span class="shape">${esc(readJSON(HOLDS)[f.id] || "")}</span><span class="meta">${esc(meta)}</span>`;
      if (!f.folder) { b.dataset.id = f.id; markOffline(b.querySelector(".kept"), "image", kept.has(f.id)); }
      if (off && (f.folder ? !listings[f.id] : !kept.has(f.id))) {
        b.disabled = true; b.title = f.folder ? "Not listed on this device yet: it needs the internet." : "Not kept on this device: it needs the internet.";
      }
      b.onclick = () => choose(f, b);
      b.ondblclick = () => enter(f);
      b.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); enter(f); } };
      $("#remote-list").append(b);
      if (!f.folder) thumbs.watch(b.querySelector(".pic"), f, k);
    }
    if (!off) markTruth(items, asked);
  };
  // which images have ground truth, and to a tagger or data manager which have it pending (req/shell/ground-truth/pending)
  const markTruth = async (items, asked) => {
    let map;
    try { map = await truth.status(role === "tagger" || role === "data"); } catch (e) { console.warn("ground truth status not read:", e); return; }
    if (asked !== listing) return;
    for (const f of items) {
      const g = !f.folder && f.sha && map.get(subfolderName(f.name, f.sha)), tag = $("#remote-list").querySelector(`.item[data-id="${f.id}"] .gt-tag`);
      if (!g || !tag) continue;
      const [text, title] = g.pending ? ["GT pending", "A tagger submitted ground truth for it, not curated yet"] : g.curated ? ["GT", "It has curated ground truth"]
        : g.rejected ? ["GT rejected", "Its submitted ground truth was rejected"] : [];
      if (text) { tag.textContent = text; tag.title = title; tag.dataset.state = g.pending ? "pending" : g.curated ? "curated" : "rejected"; }
    }
  };
  // the study's own folders to choose from, by name (req/shell/drive/dialog)
  const showRoots = async () => {
    keptOn = false;
    const off = offlineCopy.offline(), listings = readJSON(LISTINGS), asked = ++listing;
    $("#remote-path").textContent = trail[0].name;
    const roots = studyFolders().map((id) => ({ id, name: listings[id]?.name || "Folder", folder: true }));
    await draw(trail[0], roots, off, asked);
    if (off) return;
    const named = await Promise.all(roots.map((f) => (listings[f.id]?.name ? f : remote.name(f.id).then((name) => ({ ...f, name }), () => f))));
    if (named.some((f, k) => f.name !== roots[k].name)) await draw(trail[0], named, false, asked);
  };
  const show = async () => {
    if (trail[trail.length - 1].roots) return showRoots();
    keptOn = false;
    const at = trail[trail.length - 1], off = offlineCopy.offline(), before = keptListing(at.id);
    $("#remote-path").innerHTML = trail.map((t, k) => `<button type="button" class="link" data-k="${k}">${esc(t.name)}</button>`).join(" / ");
    $("#remote-path").querySelectorAll("button").forEach((b) => (b.onclick = () => { trail = trail.slice(0, +b.dataset.k + 1); show(); }));
    $("#remote-path").scrollLeft = $("#remote-path").scrollWidth;
    // a listing the user has moved on from by the time it arrives is dropped
    const asked = ++listing;
    $("#remote-list").replaceChildren(); choose(null); thumbs.reset();
    if (before) await draw(at, before, off, asked);
    if (off) { if (!before && asked === listing) msg("This folder is not listed on this device yet: it needs the internet.", true); return; }
    if (!before) msg("Reading the folder…");
    try {
      const all = await remote.list(at.id, manifest.files.accept);
      if (asked !== listing) return;
      keepListing(at.id, all, at.unnamed ? readJSON(LISTINGS)[at.id]?.name : at.name);
      // what the store says now takes the kept listing's place, redrawn only where it differs
      if (!before || JSON.stringify(keptListing(at.id)) !== JSON.stringify(before)) await draw(at, all, false, asked, before && new Set(before.map((f) => f.id)));
    } catch (err) {
      if (asked !== listing) return;
      if (err.throttled) throttle(); else if (!before) msg(err.message || String(err), true);
    }
  };
  // each image's thumbnail: the one saved when it was last opened here, else the study's ready-made one,
  // fetched for the rows in view and the next AHEAD, in order, as the user scrolls; never read from the remote store,
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
      $("#remote-thumbs-note").textContent = t;
      loading = running && t ? "Thumbnails " + t : ""; say();
    };
    // the rows from the first in view to AHEAD past the last, that no fetch has been started for
    const wanted = () => {
      const list = $("#remote-list"), items = list.children;
      if (!$("#remote-dlg").open || !$("#remote-thumbs").checked || throttled() || !items.length) return [];
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
        const buf = await remote.head(r.f.id, HEAD, signal);
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
      const own = remote.study(manifest).thumbs ? base + remote.study(manifest).thumbs : null;
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
      const holds = /\.tiff?$/i.test(f.name) && remote.ready && !offlineCopy.offline() && !(f.id in readJSON(HOLDS)), thumb = !url && (await ready).has(f.id);
      if (of !== epoch || !(thumb || holds)) return;
      rows.push({ at, row: pic.closest(".item"), f, thumb, holds, asked: false, done: false }); later();
    };
    $("#remote-list").addEventListener("scroll", later, { passive: true });
    $("#remote-dlg").addEventListener("close", stop);
    return { reset, watch, stop, later, cover };
  })();
  $("#remote-open").onclick = () => chosen && enter(chosen);
  $("#remote-thumbs").checked = readJSON(THUMBS, "on") !== "off";
  $("#remote-thumbs").onchange = (e) => {
    writeJSON(THUMBS, e.target.checked ? "on" : "off");
    if (!e.target.checked) thumbs.stop(); else thumbs.later();
  };
  $("#remote-autosave").checked = readJSON(AUTO_SAVE, "on") !== "off";
  $("#remote-autosave").onchange = (e) => writeJSON(AUTO_SAVE, e.target.checked ? "on" : "off");
  $("#remote-storage").onclick = () => usage("storage");
  if (!remote.ready) {
    const d = $("#load-remote");
    d.disabled = true; d.title = remote.words.unready;
  }
  // offline, a folder link opens on the folder as last listed, and anything else on the images kept here
  const open = async () => {
    // a study's own folders: straight into the one, else a list of them
    const roots = studyFolders();
    if (roots.length) {
      if (offlineCopy.offline() && !roots.some((id) => keptListing(id))) return showKept();
      keptOn = false; $("#remote-list").replaceChildren(); choose(null); msg("");
      const name = readJSON(LISTINGS)[roots[0]]?.name || (offlineCopy.offline() ? null : await remote.name(roots[0]).catch(() => null));
      trail = roots.length === 1 ? [{ id: roots[0], name: name || "Folder" }] : [{ roots: true, name: "The study's folders" }];
      return show();
    }
    const link = $("#remote-link").value, ref = remote.parse(link);
    if (offlineCopy.offline() && !(ref?.kind === "folder" && keptListing(ref.id))) return showKept();
    keptOn = false;
    $("#remote-list").replaceChildren(); $("#remote-path").replaceChildren(); choose(null);
    if (!ref) return msg(remote.words.notLink, true);
    if (link !== remoteFrom) { writeJSON(REMOTE_LINK, link); writeJSON(REMOTE_LINKS, { ...readJSON(REMOTE_LINKS), [manifest.id]: link }); remoteFrom = link; }
    if (ref.kind === "file") return take(ref.id, undefined, []);
    // a pasted folder's name is not asked of the remote store: "Folder" stands in, and is not kept as its name
    trail = [{ id: ref.id, name: "Folder", unnamed: true }]; show();
  };
  $("#remote-go").onclick = open;
  waitEnded = () => { if ($("#remote-dlg").open) open(); };
  // the dialog opened: offline on what is kept here, online on its folder link read afresh
  remoteOpened = () => {
    if (offlineCopy.offline()) return open();
    if (!throttled() && (studyFolders().length || remote.parse($("#remote-link").value)?.kind === "folder")) open();
  };
  // the open dialog follows the network: once it goes, the folder on show greyed where it cannot open (or the
  // images kept here); once it is back, the folder read afresh
  addEventListener(CONNECTION, (e) => {
    if (!$("#remote-dlg").open) return;
    if (!e.detail.online) { if (keptOn) return; return trail.length && keptListing(trail[trail.length - 1].id) ? show() : showKept(); }
    if (trail.length && !keptOn) return show();
    if (remote.parse($("#remote-link").value)) return open();
    keptOn = false; $("#remote-path").replaceChildren(); $("#remote-list").replaceChildren(); msg("");
  });
  holdRemote();
  $("#remote-link").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); open(); } });
}

// the open image's thumbnail, every colour on show, for the remote files dialog to show next time without a download;
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
// a thumbnail for the remote files dialog to show from now on; only the latest KEEP are kept
function keepThumb(id, name, url) {
  const KEEP = 100;
  const kept = readJSON(SAVED_THUMBS, []).filter((i) => i !== id).concat(id);
  for (const old of kept.splice(0, Math.max(0, kept.length - KEEP))) try { localStorage.removeItem(SAVED_THUMB + old); } catch { /* nothing kept */ }
  const names = readJSON(THUMB_NAMES);
  for (const k of Object.keys(names)) if (!kept.includes(k)) delete names[k];
  writeJSON(SAVED_THUMB + id, url); writeJSON(SAVED_THUMBS, kept); writeJSON(THUMB_NAMES, { ...names, [id]: name });
  diskBar();
}

// what each remote file holds, remembered so it is read once; the latest KEEP. Returns its words for the row.
function know(id, s) {
  const KEEP = 1000, said = holds(s), all = readJSON(HOLDS);
  delete all[id]; all[id] = said;
  const ids = Object.keys(all);
  for (const old of ids.slice(0, Math.max(0, ids.length - KEEP))) delete all[old];
  writeJSON(HOLDS, all);
  return said;
}
// a remote image about to open: what it holds is remembered, and a stack's 3D thumbnail is saved at once, drawn
// from the bytes in hand; a flat image's waits until it shows
function picture(id, name, bytes) {
  const s = shape(bytes);
  know(id, s); st.pictured = null;
  const url = s && s.slices > 1 && stackPicture(bytes, s);
  if (url) { keepThumb(id, name, url); st.pictured = id; }
}

// a folder's rauntruth-previews.tiff, read: the copy kept on this device while the store gives the file the same
// SHA-256, else downloaded and kept; null when there is none to read
async function folderPreviews(folder, f) {
  const url = new URL(PREVIEWS_PATH + encodeURIComponent(folder.id), location.href).href;
  try {
    const cache = await caches.open(FOLDER_PREVIEWS), kept = await cache.match(url);
    if (kept && f.sha && kept.headers.get(PREVIEWS_SHA) === f.sha) return readPreviews(await kept.arrayBuffer());
    if (throttled()) return null;
    const got = await remote.file(f.id, f.name);
    await cache.put(url, new Response(new Blob([got.bytes]), { headers: { [PREVIEWS_SHA]: f.sha || "", [IMAGE_NAME]: encodeURIComponent(folder.name), [IMAGE_STUDY]: manifest?.id || "" } }));
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

// images downloaded from the remote store, kept on this device while Auto-save images is on
const imageUrl = (id) => new URL(CACHED_IMAGE_PATH + encodeURIComponent(id), location.href).href;
const idOf = (url) => decodeURIComponent(new URL(url).pathname.split("/").pop());
// the remote ids of the images kept here
async function keptIds() {
  try { return new Set((await (await caches.open(IMAGES)).keys()).map((q) => idOf(q.url))); } catch { return new Set(); }
}
async function savedImage(id) {
  try {
    const r = await (await caches.open(IMAGES)).match(imageUrl(id));
    return r ? { name: decodeURIComponent(r.headers.get(IMAGE_NAME)), bytes: await r.arrayBuffer() } : null;
  } catch { return null; }
}
// copies the bytes at once, before the caller hands them to Python
// where: {path, study}, the folders it is in under the study's link and the study it was kept in
async function saveImage(id, name, bytes, where = {}) {
  const body = new Blob([bytes]);
  const headers = { [IMAGE_NAME]: encodeURIComponent(name), [IMAGE_AT]: String(Date.now()), [IMAGE_PATH]: encodeURIComponent(JSON.stringify(where.path || [])), [IMAGE_STUDY]: where.study || "" };
  try {
    await (await caches.open(IMAGES)).put(imageUrl(id), new Response(body, { headers }));
  } catch (e) { console.warn("image not saved:", e); }
  showSaved(); diskBar();
}
const bytesOf = (k) => 2 * (k.length + (localStorage.getItem(k) || "").length); // UTF-16
// the remote files dialog's link to Manage storage: what thumbnails and saved images take on this device
async function showSaved() {
  let n = 0;
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(SAVED_THUMB) || k === SAVED_THUMBS || k === THUMB_NAMES) n += bytesOf(k); } catch { /* no storage */ }
  try { const c = await caches.open(IMAGES); for (const q of await c.keys()) n += (await (await c.match(q)).blob()).size; } catch { /* no caches */ }
  $("#remote-storage").textContent = sizeText(n);
}

// ---------- the user: whoever opened the page on this device, and what the site keeps here ----------
// what each of the shell's own setting keys holds, in the user's words
const OWN_SETTINGS = {
  [THEME]: "Theme", [ROLE]: "The role you work in", [BARS]: "Left bar width, and whether it is collapsed", [REMOTE_LINK]: `Last ${remote.label} link`, [REMOTE_LINKS]: `Last ${remote.label} link in each study`,
  [THUMBS]: `Show thumbnails in the ${remote.short} dialog`, [AUTO_SAVE]: `Auto-save images from ${remote.label}`, [RECENT]: `Recent images from ${remote.label}`, [LOCAL_RECENT]: "Recent files from this computer", [LISTINGS]: `${remote.label} folders as last listed, for working offline`, [HOLDS]: `What each ${remote.short} image holds (2D or 3D)`, [THROTTLE]: `Wait after ${remote.short} downloads were throttled`, [TIPS]: "Tips you closed", [SEEN_VERSION]: "Version you saw last", [MEMORY_TIP]: "Low-memory popup turned off", [SIGNED_IN]: SIGNED_IN_LABEL, [GRID]: "Grid colour and spacing", [MINIMAP]: "Minimap: shown or not, and how see-through", [SPLIT_PATTERN]: "File names of an image split into parts", [MOTION]: "Animations turned off", [RESOURCES]: "The status bar's disk, memory, network and CPU: hidden, auto-hiding or always open", [APP_ASKED]: "Asked for the site as an app", [WELCOME]: "Sign in or go on anonymously, as answered on opening the page", [ACTIONS]: "Your last actions here, for a problem report",
};
// What the site keeps, by what it takes to work offline (req/shell/storage/manage): a section per study, then what they share; settings
// apart, which Settings keeps (req/shell/account/settings), and with them what nobody names. An entry: {kind, name, what, size, del, held, ask}, del
// absent for what cannot go alone. Kinds in a section's order:
const KINDS = ["site", "python", "code", "image", "thumb", "selections", "other"];
const SHARED_ABOUT = "The site itself, so it opens offline; Python itself; and the packages two studies or more use.";
// a package's name from its wheel's file name
const packageOf = (url) => decodeURIComponent(url.split("/").pop()).split("-")[0].replace(/_/g, "-");
// [{id, title, about, mark, entries}], what the settings take apart from them, and the rest
async function inventory() {
  const drop = (...keys) => keys.forEach((k) => { try { localStorage.removeItem(k); } catch { /* nothing kept */ } });
  const studies = await offlineCopy.studyFiles().catch((e) => { console.warn("the studies could not be read:", e); return []; });
  const live = await offlineCopy.available().catch(() => new Set());
  const sections = studies.map((s) => ({ id: "study:" + s.id, study: s.id, title: s.title, mark: live.has(s.id), folders: !!s.manifest.files.folders?.length, entries: [] }));
  const shared = { id: "shared", title: "Shared by every study", about: SHARED_ABOUT, entries: [] };
  // a study's own, else the study on show's: kept before images were told apart by study
  const sectionOf = (id) => sections.find((x) => x.study === id) || sections.find((x) => x.study === manifest?.id) || shared;
  // each section's thumbnails and its folders' previews, one record
  const thumbsOf = new Map(), thumb = (x, size, del, preview) => {
    const t = thumbsOf.get(x) || { pics: 0, previews: 0, size: 0, dels: [] };
    t[preview ? "previews" : "pics"]++; t.size += size; t.dels.push(del); thumbsOf.set(x, t);
  };
  const unused = { size: 0, dels: [] };
  // the study each remote image belongs to: the one it was kept in, else the one it was last opened in
  const studyOf = {};
  for (const r of readJSON(RECENT, [])) if (r.study && !(r.id in studyOf)) studyOf[r.id] = r.study;
  let settings = 0, overhead = 0, keys = [];
  try { keys = Object.keys(localStorage); } catch { /* no storage */ }
  const stores = window.caches ? await Promise.all((await caches.keys()).map(async (n) => ({ name: n, cache: await caches.open(n) }))) : [];
  const images = stores.find((c) => c.name === IMAGES);
  if (images) for (const q of await images.cache.keys()) { const kept = (await images.cache.match(q)).headers.get(IMAGE_STUDY); if (kept) studyOf[idOf(q.url)] = kept; }

  const names = readJSON(THUMB_NAMES), selections = new Map();
  for (const k of keys) {
    if (k === SAVED_THUMBS || k === THUMB_NAMES) { overhead += bytesOf(k); continue; }
    if (k.startsWith(SAVED_THUMB)) {
      const id = k.slice(SAVED_THUMB.length);
      thumb(sectionOf(studyOf[id]), bytesOf(k), () => {
        drop(k); writeJSON(SAVED_THUMBS, readJSON(SAVED_THUMBS, []).filter((i) => i !== id));
        const n = readJSON(THUMB_NAMES); delete n[id]; writeJSON(THUMB_NAMES, n);
      });
      continue;
    }
    if (OWN_SETTINGS[k]) { settings += bytesOf(k); continue; }
    const s = study.stored?.(k);
    if (s && s.group === "images") {
      const im = selections.get(s.image) || { name: s.image, whats: new Set(), keys: [], size: 0 };
      im.whats.add(s.what); im.keys.push(k); im.size += bytesOf(k); selections.set(s.image, im);
    } else if (s) settings += bytesOf(k);
    else overhead += bytesOf(k);
  }
  for (const im of selections.values()) sectionOf(manifest?.id).entries.push({ kind: "selections", name: im.name, what: "Your selections: " + [...im.whats].join(", "), size: im.size, del: () => drop(...im.keys), held: true, ask: true });

  // the packages: whose they are; Python itself, the lock naming its packages and the build's vendored list, shared
  const users = new Map();
  for (const s of studies) for (const u of s.python) users.set(u, [...(users.get(u) || []), s]);
  const itself = new Set(offlineCopy.core), python = { size: 0, dels: [] };
  const code = {}, site = { size: 0, files: 0, del: null };
  for (const { name: c, cache } of stores) {
    for (const req of await cache.keys()) {
      const res = await cache.match(req), u = new URL(req.url), size = (await res.blob()).size, del = () => cache.delete(req);
      if (c === offlineCopy.siteCache()) {
        const id = u.pathname.match(/\/studies\/([\w-]+)\//)?.[1];
        if (id && sections.some((x) => x.study === id)) code[id] = (code[id] || 0) + size;
        else { site.size += size; site.files++; }
        site.del = () => caches.delete(c);
        continue;
      }
      if (c === FOLDER_PREVIEWS) {
        thumb(sectionOf(res.headers.get(IMAGE_STUDY)), size, del, true);
        continue;
      }
      if (c === IMAGES) {
        const at = Number(res.headers.get(IMAGE_AT)), id = idOf(req.url);
        sectionOf(studyOf[id]).entries.push({ kind: "image", name: decodeURIComponent(res.headers.get(IMAGE_NAME) || id), size, del,
          what: `Image from ${remote.label}` + (at ? " · saved " + new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "") });
        continue;
      }
      if (itself.has(req.url) || u.pathname.endsWith("/vendor/wheels.json")) { python.size += size; python.dels.push(del); continue; }
      const who = users.get(req.url) || [];
      const entry = { kind: "python", name: packageOf(req.url), size, del };
      if (who.length === 1) sectionOf(who[0].id).entries.push({ ...entry, what: "Python package" });
      else if (who.length) shared.entries.push({ ...entry, what: "Python package, used by " + who.map((x) => x.title).join(", ") });
      else { unused.size += size; unused.dels.push(del); }
    }
  }
  for (const x of sections) if (code[x.study]) x.entries.push({ kind: "code", name: "Its pages and code", what: "Part of the site's copy, kept whole with it", size: code[x.study] });
  for (const [x, t] of thumbsOf) {
    const what = [t.pics && `${t.pics} ${t.pics === 1 ? "image" : "images"}`, t.previews && `${t.previews} ${t.previews === 1 ? "folder's" : "folders'"} previews`].filter(Boolean).join(", ");
    x.entries.push({ kind: "thumb", name: "Thumbnails", what: `Small pictures for the ${remote.label} dialog: ${what}`, size: t.size, del: () => Promise.all(t.dels.map((d) => d())) });
  }
  if (unused.dels.length) shared.entries.push({ kind: "other", name: "Older code", what: `${unused.dels.length} files no study uses now`, size: unused.size, del: () => Promise.all(unused.dels.map((d) => d())) });
  if (python.dels.length) shared.entries.push({ kind: "python", name: "Python itself", what: "Every study runs on it", size: python.size, del: () => Promise.all(python.dels.map((d) => d())) });
  if (site.files) shared.entries.push({ kind: "site", name: "The site itself", what: `${site.files} files, so it opens offline; deleting it deletes every study's pages too`, size: site.size + Object.values(code).reduce((a, b) => a + b, 0), del: site.del, held: true });
  const all = [...sections, shared];
  for (const x of all) x.entries.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.name.localeCompare(b.name));
  return { sections: all, settings, overhead };
}
// the Storage tab; fresh: just opened, every section folded, where a redraw after a deletion keeps what the user unfolded
async function storageTab(fresh) {
  const list = $("#storage-list"), open = new Set(fresh ? [] : [...list.querySelectorAll(".group[open]")].map((g) => g.dataset.group));
  if (fresh) { list.textContent = "Reading what this device keeps…"; $("#storage-total").textContent = ""; }
  const { sections, settings, overhead } = await inventory();
  const held = () => { $("#storage-reload").hidden = false; $("#storage-msg").textContent = "The page still holds what you deleted until it reloads."; };
  const act = async (items, ask) => {
    if (ask && !confirm(ask)) return;
    for (const e of items) await e.del();
    if (items.some((e) => e.held)) held();
    storageTab(false);
  };
  let total = settings + overhead;
  list.replaceChildren(...sections.map((x) => {
    const items = x.entries, size = items.reduce((a, e) => a + e.size, 0), gone = items.filter((e) => e.del);
    total += size;
    const box = document.createElement("details"); box.className = "group"; box.dataset.group = x.id; box.open = open.has(x.id);
    box.innerHTML = `<summary><span class="title">${esc(x.title)}</span><span class="count">${items.length ? `${items.length} · ${sizeText(size)}` : x.study ? "Nothing of its own" : "Nothing kept"}</span></summary>`;
    if (x.mark) markOffline(box.querySelector(".title"), "study", true);
    // a study not all here offers to make it so; one that is, to keep its remote images too
    if (x.study && (!x.mark || x.folders)) {
      const make = Object.assign(document.createElement("button"), { type: "button", className: x.mark ? "link get-images" : "link make-offline", textContent: x.mark ? `Its ${remote.short} images…` : "Make available offline" });
      make.onclick = (e) => { e.preventDefault(); offlineCopy.makeAvailable(x.study, () => storageTab(false)); };
      box.firstChild.append(make);
    }
    if (gone.length) {
      const clear = Object.assign(document.createElement("button"), { type: "button", className: "link clear", textContent: "Delete all" });
      const ask = x.study ? `Delete everything kept for ${x.title} on this device? What other studies use stays, and so do its pages, kept with the site.`
        : `Delete all ${gone.length} of "${x.title}" from this device?`;
      clear.onclick = (e) => { e.preventDefault(); act(gone, ask); };
      box.firstChild.append(clear);
    }
    const about = x.about || (x.mark ? "Available offline: its Python is on this device." : "Not available offline yet: its Python is not all on this device.");
    box.append(Object.assign(document.createElement("p"), { className: "hint", textContent: about }));
    for (const e of items) {
      const row = document.createElement("div"); row.className = "entry"; row.dataset.name = e.name; row.dataset.kind = e.kind;
      row.innerHTML = `<span class="label"><span class="name"></span>${e.what ? '<span class="what"></span>' : ""}</span><span class="size">${sizeText(e.size)}</span>` +
        (e.del ? `<button type="button" class="del" title="Delete from this device" aria-label="Delete ${esc(e.name)} from this device">×</button>` : `<span class="del-none"></span>`);
      row.querySelector(".name").textContent = e.name;
      if (e.what) row.querySelector(".what").textContent = e.what;
      if (e.del) row.querySelector(".del").onclick = () => act([e], e.ask && `Delete everything kept for ${e.name}?`);
      box.append(row);
    }
    return box;
  }));
  const est = await navigator.storage?.estimate?.().catch(() => null);
  showDisk(total);
  $("#storage-total").textContent = `This site keeps ${sizeText(total)} on this device, ${sizeText(settings)} of it settings, which Settings clears` +
    (est?.quota ? `; the browser allows it up to ${sizeText(est.quota)}.` : ".");
}
$("#manage-storage").onclick = () => { $("#user-menu").open = false; usage("storage"); };

// the settings kept on this device only, the shell's and the study on show's, each {key, label, size}; who is signed
// in is Sign out's to forget
function deviceSettings() {
  let keys = [];
  try { keys = Object.keys(localStorage); } catch { /* no storage */ }
  return keys.map((k) => {
    const label = OWN_SETTINGS[k] && !FOLLOWS.includes(k) && k !== SIGNED_IN ? OWN_SETTINGS[k] : !OWN_SETTINGS[k] && study.stored?.(k)?.group === "settings" ? study.stored(k).what : null;
    return label && { key: k, label, size: sizeText(bytesOf(k)) };
  }).filter(Boolean).sort((a, b) => a.label.localeCompare(b.label));
}
// Settings (req/shell/account/settings): the settings that follow the user, as the shell keeps them, and those kept on this device only
const settings = settingsDialog({
  dialog: $("#settings-dlg"),
  fields: () => [
    { key: THEME, label: "Theme", kind: "choice", raw: true, fallback: "", options: [["", "Follow the system"], ["dark", "Dark"], ["light", "Light"]] },
    { key: ROLE, label: "The role you work in", kind: "choice", raw: true, fallback: "viewer", options: Object.entries(ROLE_NAMES) },
    { key: THUMBS, label: `Show thumbnails in the ${remote.label} dialog`, kind: "toggle", on: "on", off: "off", fallback: "on" },
    { key: MEMORY_TIP, label: "Show the low-memory popup", kind: "toggle", on: false, off: true, fallback: false },
    { key: REMOTE_LINK, label: `Last ${remote.label} link`, kind: "text" },
    { key: REMOTE_LINKS, label: `Last ${remote.label} link in each study`, kind: "map" },
    { key: TIPS, label: "Tips you closed (clear one to see it again)", kind: "set" },
    { key: RECENT, label: `Recent images from ${remote.label} (clear one to drop it)`, kind: "list", name: (r) => (r.study ? `${r.study}: ` : "") + (r.path?.length ? `${r.path.join("/")}/` : "") + r.name },
    { key: MOTION, label: "Animations", kind: "toggle", on: true, off: false, fallback: true },
    { key: RESOURCES, label: "The status bar's disk, memory, network and CPU", kind: "choice", fallback: "auto", options: [["hidden", "Hidden always"], ["auto", "Auto-hiding"], ["open", "Always open"]] },
    { key: SEEN_VERSION, label: "Version you saw last", kind: "text" },
    { key: "device-only", label: "Kept on this device only", kind: "device", entries: deviceSettings },
  ],
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => {
    try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode: this page only */ }
    signIn.changed(k);
  },
  where: () => signIn.kept(),
  saved: () => reapply(),
});
// the settings that follow the user, drawn again once the account's or the Settings dialog's have replaced this device's
function reapply() {
  let t = null;
  try { t = localStorage.getItem(THEME); } catch { /* no storage */ }
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  showMotion(); showResources(); showRecent(); showRole();
}
$("#open-settings").onclick = () => { $("#user-menu").open = false; settings.open(); };
$("#storage-reload").onclick = () => location.reload();
$("#usage-dlg").addEventListener("close", () => { $("#storage-msg").textContent = ""; if ($("#remote-dlg").open) showSaved(); });

// ---------- downloads and ground truth ----------
function saveFile(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// the shell's icons, by name, as SVG markup: done, part, todo
const icon = (name) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">${$(`#icons .${name}`).innerHTML}</svg>`;
// Load GT tagging (req/shell/ground-truth/view): for anyone but a tagger, an image from the remote store with curated ground truth
// shows it through the study's showTruth(doc), which draws only its final results and returns a line of its counts
let offered = 0;
async function offerTruth() {
  const box = $("#truth-box"), b = $("#load-gt"), say = $("#gt-summary"), mine = ++offered;
  box.hidden = true; b.hidden = false; say.hidden = true; $("#gt-offer").hidden = false;
  if (role === "tagger" || !study.showTruth || !remote.owns(st.source) || !st.sha) return;
  let got;
  try { got = await truth.curated({ name: st.fileName, sha256: st.sha }); } catch (e) { console.warn("curated ground truth not read:", e); return; }
  if (mine !== offered || !got) return;
  box.hidden = false;
  b.onclick = () => {
    const d = got.doc, when = d.created ? new Date(d.created).toLocaleString() : "an unknown time";
    const counts = study.showTruth(d);
    b.hidden = true; $("#gt-offer").hidden = true; say.hidden = false;
    say.textContent = `Ground truth by ${d.tagger || "a tagger"}, made ${when}${d.accepted?.by ? `, accepted by ${d.accepted.by}` : ""}${counts ? ": " + counts : "."}`;
    log.add("Loaded the image's curated ground truth");
  };
}

// The ground-truth dialog (req/shell/ground-truth/submit): a checklist of what is still open, the file to export,
// and Submit, which writes it to the study's submissions folder. gt: {doc, count, file, items: [{level, ok, text}],
// empty}, count how many of its marks the document holds, nothing to send at 0.
function submitTruth(gt) {
  if (!makesTruth()) return;
  const n = gt.count, send = $("#gt-send"), why = () => truth.blocked();
  $("#gt-problems").replaceChildren(...gt.items.map((t) => {
    const li = document.createElement("li"); li.className = t.ok ? "ok" : t.level;
    li.innerHTML = icon(t.ok ? "done" : t.level === "error" ? "todo" : "part") + `<span>${esc(t.text)}</span>`;
    return li;
  }));
  $("#gt-msg").textContent = n ? why() : gt.empty;
  $("#gt-export").disabled = !n;
  send.disabled = !n || !!why(); send.title = why();
  // the blue button is the next step: Submit when it can, else the export; Close once either is done
  const next = (b) => { for (const id of ["#gt-export", "#gt-send", "#gt-close"]) $(id).classList.toggle("primary", $(id) === b); };
  next(send.disabled ? $("#gt-export") : send);
  $("#gt-export").onclick = () => {
    saveFile(gt.file, JSON.stringify(gt.doc, null, 1), "application/json");
    $("#gt-msg").textContent = `Downloaded ${gt.file}.`;
    if (send.disabled) { step("submit", true, `Exported ${gt.file}; it was not submitted`); next($("#gt-close")); }
  };
  send.onclick = async () => {
    send.disabled = true; $("#gt-msg").textContent = "Submitting…";
    try {
      await truth.submit(gt.doc);
      $("#gt-msg").textContent = `Submitted to the study's submissions folder, as your ground truth for ${st.fileName}.`;
      step("submit", true, `Submitted the ground truth of ${st.fileName}`);
      log.add("Submitted ground truth");
      next($("#gt-close"));
    } catch (e) {
      $("#gt-msg").textContent = `It was not submitted: ${e.message || e}. Export the file to keep a copy.`;
      send.disabled = false;
    }
  };
  $("#gt-dlg").showModal();
}
$("#gt-close").onclick = () => $("#gt-dlg").close();

// ---------- problems: a report of what went wrong, from the status bar's icon or the avatar's menu, and whether the
// page supports this browser (req/shell/report/bug, req/shell/browsers/supported). The verdict is null until browsers.json
// is read: unknown, and the icon stays the plain one.
const thisBrowser = identify(navigator.userAgent, navigator.maxTouchPoints);
let browserVerdict = null, fullVersion = null;
fetch(new URL("browsers.json", import.meta.url)).then((r) => r.json()).then(({ supported }) => {
  browserVerdict = verdict(thisBrowser, supported);
  if (browserVerdict.ok) return;
  const b = $("#sb-report");
  b.classList.add("unsupported"); b.setAttribute("aria-label", "Unsupported browser");
  b.title = `${browserVerdict.why} Click to report a problem.`;
}).catch((e) => console.warn("the list of supported browsers could not be read:", e));
// Chromium browsers give their full version only when asked, and the report is opened within the click, so asked now
const BRANDS = { Chrome: "Google Chrome", Edge: "Microsoft Edge", Opera: "Opera" };
navigator.userAgentData?.getHighEntropyValues(["fullVersionList"])
  .then((v) => { fullVersion = v.fullVersionList?.find((b) => b.brand === BRANDS[thisBrowser.name])?.version || null; }, () => {});
function browserText() {
  const name = thisBrowser.name || "An unknown browser", unsupported = browserVerdict && !browserVerdict.ok ? ", not supported" : "";
  return `${name} ${fullVersion || thisBrowser.version || ""} on ${thisBrowser.os}${unsupported} (${navigator.userAgent})`;
}
// the page's state as a report quotes it: never the image's name
function pageNow() {
  const im = page.get("image"), from = (s) => (remote.owns(s) ? remote.label : "this computer");
  return [
    ["Site version", VERSION],
    ["Study", manifest ? `${manifest.title} (${manifest.id}), stage ${manifest.stage ?? "none"}` : "none open"],
    ["Python", st.ready ? "ready" : "loading"],
    ["Steps", steps.map((p) => p.name + (p.done ? " (done)" : "")).join(" → ") || "none"],
    ["Image", im ? `from ${from(im.source)}, ${im.W} × ${im.H} px, ${im.channels?.length ?? "?"} channel(s), ${im.Z} slice(s)` : page.get("opening") ? "opening" : "none open"],
    ["View", `${views.now}, ${manifest?.viewer || "no viewer"}`],
    ["Online", navigator.onLine ? "yes" : "no"],
    ["Signed in", $("#sign-out").hidden ? "no" : "yes"],
    ["Window", `${innerWidth} × ${innerHeight}, pixel ratio ${devicePixelRatio}`],
    ["Memory", navigator.deviceMemory ? `about ${navigator.deviceMemory} GB` : "not said by this browser"],
  ];
}
function reportProblem() {
  $("#user-menu").open = false;
  const url = problemUrl({ repo: REPO, browser: { text: browserText(), supported: browserVerdict?.ok !== false }, state: pageNow(),
    actions: log.last(ACTIONS_QUOTED, "action"), errors: log.last(ERRORS_QUOTED, "error") });
  window.open(url, "_blank", "noopener");
}
$("#sb-report").onclick = reportProblem;
$("#report-problem").onclick = reportProblem;

// ---------- notices: a short message, at the top of the view ----------
function notice(text) {
  $("#notice-text").textContent = text; $("#notice").hidden = false;
  $("#notice-ok").focus();
}
$("#notice-ok").onclick = () => { $("#notice").hidden = true; };

// ---------- boxes that fold with the steps ----------
// A box's data-opens names the step after which it opens ("user": only its title opens it), and data-folds
// the one after which it folds; one with neither is open from the start. Between steps a box stays as the
// user left it.
const boxes = () => document.querySelectorAll(".box.foldable");
function unfoldFirst() { boxes().forEach((b) => b.classList.toggle("folded", b.hasAttribute("data-opens"))); retitle(); }
// a step just done: a new image folds every box waiting for a later step
function foldFor(key) {
  // a preview keeps the Image box open: Load Original is what comes next; so does a study with no step after Load
  const keep = key === "load" && (st.source?.kind === "preview" || steps.length === 1);
  boxes().forEach((b) => {
    if (b.dataset.opens === key || (keep && b.id === "image-box")) b.classList.remove("folded");
    else if ((b.dataset.folds === key && !(keep && b.id === "image-box")) || (key === "load" && b.hasAttribute("data-opens"))) b.classList.add("folded");
  });
  retitle();
}
// A box's title: its step's number, or a check once its task is done, and its name while the task waits; done,
// the folded box sums up what was done and the open one shows its data-done-name, else its name.
const summaries = new WeakMap(); // box -> its summary: text, or a node
function retitle() {
  const shown = [...boxes()].filter((b) => b.checkVisibility());
  [...boxes()].forEach((b) => {
    const k = shown.indexOf(b);
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
  // the collapsed left bar's strip (req/shell/left-bar/collapse): a mark per drawer on show, opening it
  $("#left-marks").replaceChildren(...shown.map((b) => {
    const h = b.querySelector(":scope > .sec-head h2"), m = document.createElement("button");
    m.type = "button"; m.className = "step-mark"; m.textContent = h.querySelector(".step-mark").textContent;
    m.classList.toggle("done", b.classList.contains("done")); m.classList.toggle("open", !b.classList.contains("folded"));
    m.title = h.dataset.name; m.onclick = () => b.classList.remove("folded");
    return m;
  }));
}
// a Markdown outline drawn as HTML: paragraphs split by blank lines, "- " or "1. " items nested by their indent
function outline(text) {
  const out = document.createDocumentFragment();
  for (const para of text.split(/\n\s*\n/)) {
    const lists = []; // the open lists, outermost first: {indent, el}
    for (const line of para.split("\n").filter((l) => l.trim())) {
      const m = line.match(/^(\s*)(-|\d+\.)\s+(.*)$/);
      if (!m) { const p = document.createElement("p"); p.textContent = line.trim(); out.append(p); lists.length = 0; continue; }
      const indent = m[1].length, tag = m[2] === "-" ? "UL" : "OL";
      while (lists.length && lists.at(-1).indent > indent) lists.pop();
      if (lists.length && lists.at(-1).indent === indent && lists.at(-1).el.tagName !== tag) lists.pop();
      if (!lists.length || lists.at(-1).indent < indent) {
        const el = document.createElement(tag);
        (lists.length ? lists.at(-1).el.lastElementChild : out).append(el);
        lists.push({ indent, el });
      }
      const li = document.createElement("li"); li.textContent = m[3]; lists.at(-1).el.append(li);
    }
  }
  return out;
}
// a box's task done, summed up (text, or a node), or waiting again (null): the box, or what the study put in it
function boxDone(el, summary) {
  const box = el.closest(".box");
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
// A drawer opening or folding slides, and those below it slide to their new places: the stylesheet's motion, each
// drawer a shape of its own, clipped to the left bar, so a browser that cannot clip one changes them at once
function slide(change) {
  if (still() || !document.startViewTransition || !CSS.supports("view-transition-group", "contain")) return change();
  const root = document.documentElement, all = [...document.querySelectorAll("#left > .box")];
  all.forEach((b, k) => { b.style.viewTransitionName = "drawer-" + k; });
  root.dataset.drawers = "";
  const t = document.startViewTransition(change);
  t.ready.catch(() => {}); // cut short, the drawers have still moved: only the motion is lost
  t.finished.finally(() => { all.forEach((b) => { b.style.viewTransitionName = ""; }); delete root.dataset.drawers; });
}
function foldable() {
  document.querySelectorAll(".box.foldable > .sec-head h2").forEach((h) => {
    h.tabIndex = 0; h.setAttribute("role", "button");
    const box = h.closest(".box"), flip = () => slide(() => { box.classList.toggle("folded"); retitle(); });
    // folded, the whole drawer opens it; open, only its title folds it
    box.onclick = (e) => { if (box.classList.contains("folded") || h.contains(e.target)) flip(); };
    h.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } };
  });
  unfoldFirst();
}
// the image back in view, from whichever of the study's views is on show
function showImage() { study.showImage?.(); view.minimapView(); }

// ---------- the left bar and theme ----------
// the left bar takes the width it is dragged to; a double click puts it back. Dragged past its narrowest it
// collapses (req/shell/left-bar/collapse), and dragged out from the strip it opens again under the pointer
{
  const lay = $("#layout"), saved = readJSON(BARS), g = $("#gutter-left"), bar = $("#left"), root = document.documentElement;
  const MIN = 200, STRIP = 32, SHUT = (MIN + STRIP) / 2;
  const set = (w) => {
    if (w == null) { lay.style.removeProperty("--lw"); return; }
    lay.style.setProperty("--lw", Math.round(Math.max(MIN, Math.min(w, innerWidth * 0.4))) + "px");
  };
  set(saved.left);
  const collapse = (on) => { if (on) root.dataset.left = "collapsed"; else delete root.dataset.left; };
  collapse(!!saved.collapsed);
  const toggle = (on) => {
    if (!!saved.collapsed === on) return;
    saved.collapsed = on; writeJSON(BARS, saved);
    if (!on) { bar.classList.add("sliding-in"); setTimeout(() => bar.classList.remove("sliding-in"), 400); }
    collapse(on);
    retitle();
    setTimeout(() => view?.minimapView(), 400);
  };
  g.addEventListener("pointerdown", (e) => {
    g.setPointerCapture(e.pointerId); document.body.classList.add("resizing");
    const was = saved.left;
    const move = (ev) => {
      const w = ev.clientX - bar.getBoundingClientRect().left;
      if (w < SHUT) { saved.left = was; toggle(true); }
      else { saved.left = w; set(w); toggle(false); }
      view?.minimapView();
    };
    const up = () => { g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); document.body.classList.remove("resizing"); writeJSON(BARS, saved); };
    g.addEventListener("pointermove", move); g.addEventListener("pointerup", up);
  });
  g.addEventListener("dblclick", () => { delete saved.left; set(null); writeJSON(BARS, saved); view?.minimapView(); });
  $("#left-collapse").onclick = () => toggle(true);
  // a step mark opens its drawer first, then the click reaches the strip
  $("#left-strip").onclick = () => toggle(false);
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
  addEventListener(CONNECTION, (e) => { if (e.detail.online) check(); });
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
      bubble.hidden = false;
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

// who may see a study (req/shell/study/visibility): everyone, unless it names the accounts it is shown to
const maySee = (accounts) => !accounts || accounts.includes(signIn.email());
// The header's switcher, after GitHub's repository switcher: every study the build lists that the user may see, each a
// link to its address, found by typing; the arrow keys mark one, Enter opens it. A plain click swaps it in place.
let listed = [];
async function studyMenu() {
  try { listed = await (await fetch(HOME + "studies.json", { cache: "no-cache" })).json(); } catch (e) { console.warn("no list of studies:", e); }
  drawStudies();
}
function drawStudies() {
  $("#study-list").replaceChildren(...listed.filter((s) => maySee(s.accounts)).map((s) => {
    const a = document.createElement("a");
    a.href = addressOf(s.id); a.dataset.id = s.id;
    a.innerHTML = `<span class="name"></span><span class="stage-tag"></span>`;
    a.querySelector(".name").textContent = s.title;
    a.prepend(...studyIcon(s.id, s.icon));
    const tag = a.querySelector(".stage-tag");
    stageTag(tag, s.stage); stageHover(tag);
    a.onclick = (e) => {
      if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault(); goTo(s.id);
    };
    a.onmouseenter = () => mark(a);
    return a;
  }));
  markCurrent();
  if (manifest) showStage();
}
const glyph = (n) => `<svg class="${n}-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${$(`#icons .${n}`).innerHTML}</svg>`;
// a study's own icon (its study.json's, relative to its folder), the generic one standing while it is missing or fails to load
function studyIcon(id, icon) {
  const generic = Object.assign(document.createElement("template"), { innerHTML: glyph("study") }).content.firstChild;
  if (!icon) return [generic];
  const img = Object.assign(new Image(16, 16), { className: "study-icon", alt: "", hidden: true });
  img.onload = () => { img.hidden = false; generic.setAttribute("hidden", ""); };
  img.onerror = () => img.remove();
  img.src = new URL(`../studies/${id}/${icon}`, location.origin + HOME).href;
  return [generic, img];
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
  for (const a of $("#study-list").children) a.hidden = !!q && !a.querySelector(".name").textContent.toLowerCase().includes(q);
  $("#study-none").hidden = rows().length > 0;
  mark(rows().find((a) => a.hasAttribute("aria-current")) || rows()[0]);
}
$("#study-menu").addEventListener("toggle", () => {
  if (!$("#study-menu").open) { if (stagePop.matches(":popover-open")) stagePop.hidePopover(); return; }
  offlineCopy.available().then((ids) => { for (const a of $("#study-list").children) markOffline(a, "study", ids.has(a.dataset.id)); }, () => {});
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
// the network back: a study whose Python could not load loads again, on a Python of its own, since a worker
// keeps a module it failed to download failed; and the storage it then kept shows
addEventListener(CONNECTION, (e) => {
  if (!e.detail.online) return;
  offlineCopy.keepSite().then(diskBar, () => {});
  if (!st.failed || st.ready || !st.worker || !manifest) return;
  st.failed = false; status("Loading Python in the background…"); $("#spin").classList.add("on");
  pythonWorker();
});
function swap() {
  swapping = swapping.then(async () => {
    const id = studyOf(location);
    if (id === manifest?.id) return;
    dropImage();
    leaveStudy();
    try {
      await mountStudy(id);
    } catch (e) { return status("Error: " + (e.message || e), true); }
    // before Python has started, it starts on this study
    if (!st.worker) return;
    $("#spin").classList.add("on");
    st.worker.postMessage({ type: "study", id: manifest.id });
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
  if (!maySee(manifest.visibility.accounts)) {
    manifest = null;
    history.replaceState(null, "", addressOf(DEFAULT_STUDY));
    await mountStudy(DEFAULT_STUDY);
    return notice("That study is shown only to the accounts it names. Signed in with one of them, the switcher offers it.");
  }
  data.mount(manifest);
  takeRole();
  document.title = manifest.title; $("#title").textContent = manifest.title; $("#title-icon").replaceChildren(...studyIcon(id, manifest.icon)); markCurrent();
  log.add(`Opened the study “${manifest.title}”`);
  $("#favicon").href = manifest.icon ? base + manifest.icon : new URL("icon.svg", import.meta.url).href;
  $("#file").accept = manifest.files.accept; $("#empty-text").textContent = manifest.files.empty; placeLoad();
  if (manifest.web.style) { css = document.createElement("link"); css.rel = "stylesheet"; css.href = base + manifest.web.style; document.head.append(css); }
  if (manifest.web.panels) {
    const panels = new DOMParser().parseFromString(await (await fetch(base + manifest.web.panels)).text(), "text/html");
    for (const t of panels.querySelectorAll("template[data-slot]")) {
      const nodes = [...document.importNode(t.content, true).childNodes];
      for (const n of nodes) if (n.nodeType === 1) n.dataset.studyPanel = "";
      $(`slot-here[data-slot-for="${t.dataset.slot}"]`).before(...nodes); mounted.push(...nodes);
    }
  }
  studyBoxes();
  unfoldFirst(); // before the first paint with them, so they do not fold in view
  view = viewers[manifest.viewer] ||= VIEWERS[manifest.viewer](shell);
  for (const v of new Set(Object.values(viewers))) v.active?.(v === view);
  view.channels(manifest.channels);
  views.mount();
  const mod = await import(base + manifest.web.module);
  study = (await mod.mount(shell)) || {};
  view.use(study);
  showStage();
  if (!makesTruth() && manifest.groundTruth?.button) $(manifest.groundTruth.button).hidden = true;
  truth.draw();
  makeSteps();
  foldable();
  showRecent();
  data.role(role === "data");
}
// The left bar's boxes the study fills (req/shell/left-bar/shells): one it leaves empty is not shown, and Ground
// Truth Tasks shows in Summary's place while the study makes ground truth. Processing opens with the image and
// folds after the study's first step, which opens the others (req/shell/left-bar/folding).
const STUDY_BOXES = { processing: "#processing-box", tasks: "#tasks-box", summary: "#summary-box" };
function studyBoxes() {
  const first = manifest.phases[0]?.key || "load", truthNow = makesTruth();
  for (const [slot, sel] of Object.entries(STUDY_BOXES)) {
    const b = $(sel), filled = !!b.querySelector("[data-study-panel]");
    b.hidden = !filled || (slot === "tasks" && !truthNow) || (slot === "summary" && truthNow);
    b.dataset.opens = slot === "processing" ? "load" : first;
    if (slot === "processing" && first !== "load") b.dataset.folds = first; else delete b.dataset.folds;
    summaries.delete(b);
  }
}
const viewers = {};
// The study on show leaves: its panels, stylesheet, drawing, listeners and state go, and its Python's late
// answers are dropped.
function leaveStudy() {
  lifetime.abort(); lifetime = new AbortController();
  truth.leave();
  for (const n of mounted.splice(0)) n.remove();
  for (const sel of Object.values(STUDY_BOXES)) { $(sel).hidden = true; summaries.delete($(sel)); }
  css?.remove(); css = null;
  study = {}; manifest = null; view?.use({}); view?.clear();
  for (const k of Object.keys(st)) if (!SHELL_STATE.has(k)) delete st[k];
  st.ready = false; $("#ram-gc").disabled = true;
  for (const w of Object.values(waiting)) w.splice(0).forEach((x) => x.bad(new Error("the study left")));
  busy(false); $("#notice").hidden = true; $("#tip").hidden = true;
  $("#image-view").hidden = false; delete $("#view").dataset.view; $("#switch").hidden = true; $("#tasks-bar").hidden = true; views.now = "image";
}

const shell = {
  $, state: st, page, still, status, busy, statusBar, step, notice, slow, until, call, readJSON, writeJSON, esc, saveFile, submitTruth, icon, remote,
  clearable: (what, fn) => truth.clearable(what, fn), showImage, boxDone, outline,
  views: { show: (v) => views.show(v), on: (fn) => views.on(fn), count: (l, t) => views.count(l, t), get now() { return views.now; }, get tasks() { return views.tasks; } },
  get viewer() { return view; }, get study() { return manifest; }, get signal() { return lifetime.signal; }, get makesTruth() { return makesTruth(); },
};
const offlineCopy = offline({ $, esc, sizeText, remote, throttled, throttle, stored: () => diskBar(),
  kept: async (id) => !!(await caches.open(IMAGES).then((c) => c.match(imageUrl(id)), () => null)), keep: saveImage });
// Data Management (req/shell/data/mode): what it borrows from the shell
const data = dataMode({
  $, esc, sizeText, still, status, remote, account: signIn, working, sha256, savedImage, folderPreviews, throttle,
  // the folder's images in the main area, or the image
  showFolder(on) {
    $("#folder-view").hidden = !on; $("#image-view").hidden = on || views.now !== "image";
    if (!on) view?.minimapView();
  },
  modeChanged(on) {
    retitle(); $("#tip").hidden = true;
    if (!on && views.now !== "image") views.show("image");
    view?.minimapView();
  },
  // the drawers on show changed: their numbers again
  relabel: () => retitle(),
  openPreview: (name, bytes, source) => openBytes(name, bytes, source),
  loadOriginal,
});
// the image itself, for the preview on show: the copy kept on this device, else downloaded from the remote store
async function loadOriginal(source) {
  if (!source?.id) return;
  const kept = await savedImage(source.id);
  // where it is in the study's folders goes with it, for Edit Image to save beside it
  const opened = remote.source(source.id, { name: source.name, folder: source.folder });
  if (kept) { peek()(kept.bytes, kept.bytes.byteLength); return openBytes(kept.name, kept.bytes, opened); }
  if (document.documentElement.classList.contains("offline")) return notice("This image is not kept on this device, and needs the internet: you are offline.");
  if (throttled()) return notice(remote.words.throttled);
  const mb = (n) => (n / 1048576).toFixed(1);
  let push;
  try {
    const f = await remote.file(source.id, source.name, (n) => { push = peek(); busy(true, `Downloading ${n}…`, "peek"); },
      (buf, got, total) => { push(buf, got); $("#busy-text").textContent = `Downloading ${source.name} · ${mb(got)}${total ? " of " + mb(total) : ""} MB`; });
    if ($("#remote-autosave").checked) saveImage(source.id, f.name, f.bytes, { study: manifest.id });
    picture(source.id, f.name, f.bytes);
    openBytes(f.name, f.bytes, opened);
  } catch (e) {
    busy(false);
    if (e.throttled) throttle();
    status("Error: " + (e.message || e), true);
  }
}
$("#load-original").onclick = () => { signIn.renew(); loadOriginal(page.get("image")?.source); };
// Edit Image (req/shell/data/edit): what it borrows from the shell and Data Management
imageEditor({
  $, page, state: st, still, status, notice, readJSON, writeJSON, saveFile, boxDone, relabel: () => retitle(), loadOriginal, remote,
  viewer: () => view, original: () => st.kept, accessOf: (f) => data.accessOf(f), saveEdits: (...a) => data.saveEdits(...a),
});

// the sign-in popup on opening the page (req/shell/account/welcome); the menu's Sign in and Sign out answer it too
const welcomed = welcome({ dialog: $("#welcome-dlg"), account: signIn, avatar: $("#user-menu summary"), tip });
$("#sign-in").addEventListener("click", () => { welcomed.chose(); closeTip("sign-in"); });
$("#sign-out").addEventListener("click", () => welcomed.forgot());
$("#user-menu").addEventListener("toggle", () => { if ($("#user-menu").open) closeTip("sign-in"); });
// for the page's tests, which drive it from outside
window.st = st; window.$ = $; window.shellForTests = { saveThumb, page, get viewer() { return view; } };

// an old address, ?study=<id> or index.html, becomes the study's own
if (new URLSearchParams(location.search).has("study") || location.pathname.endsWith("/index.html")) history.replaceState(null, "", addressOf(studyOf(location)) + location.hash);
studyMenu();
remoteDialog(); slow($("#gt-export"));
mountStudy(studyOf(location)).then(start).catch((e) => status("Error: " + (e.message || e), true));
