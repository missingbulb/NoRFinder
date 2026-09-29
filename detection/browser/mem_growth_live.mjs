// The whole page's memory growth, Pyodide and the real finders included (tests/test_memory.py checks
// each layer on its own in seconds). Drives the real page (web/) in headless Chromium: opens the
// reference slide, finds candidates and moves filters, first once to warm up and then over and over,
// and after each round measures what the page, its worker and the Python inside the worker still
// hold once garbage is collected.
//
//   python3 web/build.py            once, for the page's vendored wheels
//   python3 src/fetch_data.py -m '*Slide5*Slice1_up_left2*'
//   node detection/browser/mem_growth_live.mjs [--rounds N] [--finders tl,rf,...]   (about 2.5 minutes)
//
// Needs Playwright (npm i -g playwright). Remote files (Pyodide and its packages) are fetched with
// curl when HTTPS_PROXY is set, since headless Chromium does not trust a proxy's own CA.
import { createRequire } from "node:module";
import { execFileSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); }

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TIF = path.join(repo, "data", "raw", "Left Up- Edited", "Slide5_4AP_NoR.sld - Slice1_up_left2.tif");
const opt = (name, def) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : def; };
const ROUNDS = +opt("rounds", 2), MOVES = 12;
let FINDERS = opt("finders", "").split(",").filter(Boolean);   // all the page offers, unless named
const MB = 1024 * 1024;
// every wait is bounded, and the whole run too, so a message that never comes fails instead of hanging
const STEP_MS = 180000;
setTimeout(() => { console.error("gave up: the run took over 20 minutes"); process.exit(1); }, 20 * 60000).unref();
const bounded = (p, what) => Promise.race([p, new Promise((_, bad) => setTimeout(() => bad(new Error(`no ${what} within ${STEP_MS / 1000} s`)), STEP_MS).unref())]);
// What a round may leave behind, beyond the warm-up. Python and the page must come back to where they
// were; the V8 heaps get a little slack for code caches and inline caches that settle over the first rounds.
const LIMITS = { pyUsedAfterGc: 1 * MB, pyObjects: 500, pageHeap: 1 * MB, workerHeap: 1 * MB, pageBuffers: 1 * MB, workerBuffers: 1 * MB, nodes: 0, listeners: 0 };

for (const [f, how] of [[TIF, "python3 src/fetch_data.py -m '*Slide5*Slice1_up_left2*'"], [path.join(repo, "web", "vendor", "wheels.json"), "python3 web/build.py"]]) {
  if (!fs.existsSync(f)) { console.error(`missing ${path.relative(repo, f)}: run ${how}`); process.exit(2); }
}

// the repo as the site serves it
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".py": "text/plain", ".svg": "image/svg+xml", ".png": "image/png", ".whl": "application/zip" };
const server = http.createServer((q, r) => {
  let f = path.join(repo, decodeURIComponent(new URL(q.url, "http://x").pathname));
  if (f.endsWith(path.sep)) f = path.join(f, "index.html");
  if (!f.startsWith(repo) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const url = `http://127.0.0.1:${server.address().port}/web/`;

const browser = await pw.chromium.launch();
const ctx = await browser.newContext();
// the page without its cache of third-party files, which is not what is measured here
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
if (process.env.HTTPS_PROXY) {
  const cache = path.join(os.tmpdir(), "norfinder-remote-cache"); fs.mkdirSync(cache, { recursive: true });
  await ctx.route(/^https:/, (r) => {
    const u = r.request().url(), f = path.join(cache, crypto.createHash("sha1").update(u).digest("hex"));
    try {
      if (!fs.existsSync(f)) {
        const type = execFileSync("curl", ["-sSfL", "--max-time", "300", "-o", f + ".tmp", "-w", "%{content_type}", u]).toString();
        fs.writeFileSync(f + ".type", type || "application/octet-stream"); fs.renameSync(f + ".tmp", f);
      }
      return r.fulfill({ body: fs.readFileSync(f), contentType: fs.readFileSync(f + ".type", "utf8"), headers: { "access-control-allow-origin": "*" } });
    } catch (e) { console.error("could not fetch", u, e.message); return r.fulfill({ status: 404, body: "" }); }
  });
}
const page = await ctx.newPage();
page.on("pageerror", (e) => { console.error("page error:", e.message); process.exitCode = 1; });

// DevTools on the page, and through it on the worker (a worker has no page to open a session on)
const cdp = await ctx.newCDPSession(page);
let workerSession = null, nextId = 1;
const pending = new Map();
cdp.on("Target.attachedToTarget", (e) => { if (e.targetInfo.type === "worker") workerSession = e.sessionId; });
cdp.on("Target.receivedMessageFromTarget", (e) => {
  const m = JSON.parse(e.message); const p = pending.get(m.id);
  if (p) { pending.delete(m.id); m.error ? p.bad(new Error(m.error.message)) : p.ok(m.result); }
});
const inWorker = (method, params = {}) => bounded(new Promise((ok, bad) => {
  const id = nextId++; pending.set(id, { ok, bad });
  cdp.send("Target.sendMessageToTarget", { sessionId: workerSession, message: JSON.stringify({ id, method, params }) });
}), method);
await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: false });
await cdp.send("Performance.enable");

// resolves with the worker's next message of this type (the page's own handler still gets it)
const next = (type) => bounded(page.evaluate((type) => new Promise((ok, bad) => {
  const h = (e) => {
    if (e.data.type === type) { st.worker.removeEventListener("message", h); ok(e.data.type === "memory" ? e.data : null); }
    else if (e.data.type === "error") { st.worker.removeEventListener("message", h); bad(new Error(e.data.text)); }
  };
  st.worker.addEventListener("message", h);
}), type), type);
const settled = () => page.waitForFunction(() => !st.inflight && !st.pending && $("#busy").hidden, null, { timeout: STEP_MS });

// the slide under a new name each time, as when someone goes through a folder of images
let opened = 0;
const slide = fs.readFileSync(TIF);
async function open() {
  const done = next("opened");
  await page.setInputFiles("#file", { name: `slide ${++opened}.tif`, mimeType: "image/tiff", buffer: slide }); await done; await settled();
}
async function findWith(f) {
  const done = next("filtered");   // finding ends with the first filter pass on the new candidates
  await page.evaluate((f) => { $("#finder").value = f; $("#finder").dispatchEvent(new Event("change")); $("#find").click(); }, f);
  await done; await settled();
}
async function find() { for (const f of FINDERS) await findWith(f); }
// moves each numeric filter in turn away from its value and back, in both views, as someone tuning would
async function tune() {
  const n = await page.evaluate(() => document.querySelectorAll("#filters .param.number").length);
  assert.ok(n >= 6, `only ${n} filter dials to move`);
  for (let k = 0; k < MOVES; k++) {
    const done = next("filtered");
    await page.evaluate(([k, n]) => {
      if (k === 0) showView("items"); if (k === 6) showView("image");
      const p = document.querySelectorAll("#filters .param.number")[Math.floor(k / 2) % n], box = p.querySelector(".box");
      const def = st.defaults[p.dataset.name];
      box.value = k % 2 ? def : def * 1.3 + 0.1; box.dispatchEvent(new Event("input"));
    }, [k, n]);
    await done; await settled();
  }
  // switching a filter off and on again
  for (const on of [false, true]) {
    const done = next("filtered");
    await page.evaluate((on) => { const c = document.querySelector("#filters .filter input[type=checkbox]"); c.checked = on; c.dispatchEvent(new Event("change")); }, on);
    await done; await settled();
  }
}

// what everything holds once garbage is collected. Python is measured before the worker's JS is
// collected as well as after: memory Python can only free when JavaScript collects a handle to it
// would be held for as long as the browser does not happen to collect, so it counts as held.
async function measure() {
  const memory = async () => { const done = next("memory"); await page.evaluate(() => st.worker.postMessage({ type: "memory" })); return done; };
  const early = await memory();
  await cdp.send("HeapProfiler.collectGarbage");
  await inWorker("HeapProfiler.collectGarbage");
  await page.waitForTimeout(100);   // finalizers run after the collection
  await inWorker("HeapProfiler.collectGarbage");
  const py = await memory();
  // usedSize is the JavaScript heap; backingStorageSize the array buffers outside it (images, files)
  const ph = await cdp.send("Runtime.getHeapUsage"), wh = await inWorker("Runtime.getHeapUsage");
  const perf = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  return { pyUsed: Math.max(early.used, py.used), pyUsedAfterGc: py.used, pyObjects: py.objects, wasmHeap: py.heap,
           pageHeap: ph.usedSize, workerHeap: wh.usedSize, pageBuffers: ph.backingStorageSize, workerBuffers: wh.backingStorageSize,
           nodes: perf.Nodes, listeners: perf.JSEventListeners };
}
const show = (m) => `python ${(m.pyUsed / MB).toFixed(1)} MB (${(m.pyUsedAfterGc / MB).toFixed(1)} after JS gc), ${m.pyObjects} objects, wasm heap ${(m.wasmHeap / MB).toFixed(0)} MB | `
  + `page ${(m.pageHeap / MB).toFixed(1)} MB + ${(m.pageBuffers / MB).toFixed(1)} MB buffers, worker ${(m.workerHeap / MB).toFixed(1)} MB + ${(m.workerBuffers / MB).toFixed(1)} MB buffers | `
  + `${m.nodes} nodes, ${m.listeners} listeners`;

const t0 = Date.now();
await page.goto(url);
const ticker = setInterval(async () => console.log("…", await page.evaluate(() => $("#status").textContent).catch(() => "")), 10000);
await page.waitForFunction(() => st.ready || $("#status").classList.contains("err"), null, { timeout: 600000 });
clearInterval(ticker);
if (!(await page.evaluate(() => st.ready))) throw new Error(await page.evaluate(() => $("#status").textContent));
console.log(`python ready in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (!FINDERS.length) FINDERS = await page.evaluate(() => [...$("#finder").options].map((o) => o.value));
assert.ok(FINDERS.length >= 1, "the page offers no finder");

// each action on its own, so a leak is pinned to the action that makes it
const actions = { open, find, tune };
await open(); await find(); await tune();
const failures = [];
for (const [name, act] of Object.entries(actions)) {
  await act();
  const base = await measure();
  console.log(`${name.padEnd(5)} warm   ${show(base)}`);
  let m;
  for (let r = 1; r <= ROUNDS; r++) {
    const t = Date.now();
    await act();
    m = await measure();
    const held = m.pyUsed - m.pyUsedAfterGc;   // caught only when the browser has not happened to collect first
    if (held > MB) failures.push(`${name}: Python kept ${(held / MB).toFixed(2)} MB alive until JavaScript collected`);
    console.log(`${name.padEnd(5)} round ${r} ${show(m)}  (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  }
  for (const [k, lim] of Object.entries(LIMITS)) {
    const grew = m[k] - base[k];
    if (grew > lim) failures.push(`${name}: ${k} grew by ${lim >= MB ? (grew / MB).toFixed(2) + " MB" : grew} over ${ROUNDS} rounds`);
  }
}
await browser.close(); server.close();
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s in all`);
assert.deepEqual(failures, [], "memory held after repeated actions:\n" + failures.join("\n"));
console.log("ok: no memory growth across repeated image loads, finder runs and filter changes");
