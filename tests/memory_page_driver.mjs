// Drives the page (web/) in headless Chromium with a stand-in worker that answers from ANSWERS, a folder
// of real results written by tests/test_memory.py, and checks that opening IMAGE, finding and moving
// filters over and over leaves the page holding no more JavaScript heap, array buffers, DOM nodes or
// event listeners. Prints what it measured; exits 1 on growth, 2 when it cannot run.
//   node tests/memory_page_driver.mjs ANSWERS IMAGE
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [answers, image] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// answers every request the way web/worker.js does, from the folder served at answers/
const STAND_IN = `
const A = await (await fetch("answers/answers.json")).json();
const bin = async (n) => new Uint8Array(await (await fetch("answers/" + n)).arrayBuffer());
let finder;
postMessage({ type: "ready", finders: A.finders, about: A.about, secs: 0 });
onmessage = async ({ data: m }) => {
  if (m.type === "open") {
    const images = await bin("images.bin");
    postMessage({ type: "opened", H: A.H, W: A.W, um: A.um, images, secs: 0 }, [images.buffer]);
  } else if (m.type === "detect") {
    finder = m.finder; const seg = await bin("seg_" + finder + ".bin");
    postMessage({ type: "detected", meta: A.detected[finder], seg, secs: 0 }, [seg.buffer]);
  } else if (m.type === "refilter") {
    postMessage({ type: "filtered", ...A.filtered[finder][m.seq % 2], seq: m.seq, ms: 0 });
  }
};`;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  let f = u.startsWith("/web/answers/") ? path.join(answers, u.slice("/web/answers/".length)) : path.join(repo, u);
  if (f.endsWith(path.sep)) f = path.join(f, "index.html");
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch();
const fail = async (why) => { console.error(why); await browser.close(); server.close(); process.exit(1); };
const ctx = await browser.newContext();
// nothing leaves this machine, and the cache of third-party files, which the stand-in never needs, is off
await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
const page = await ctx.newPage();
page.on("pageerror", (e) => fail("page error: " + e.message));
page.setDefaultTimeout(10000);
const cdp = await ctx.newCDPSession(page);
await cdp.send("Performance.enable");

// resolves with the worker's next message of this type (the page's own handler still gets it)
const next = (type) => page.evaluate((type) => new Promise((ok) => {
  const h = (e) => { if (e.data.type === type) { st.worker.removeEventListener("message", h); ok(); } };
  st.worker.addEventListener("message", h);
}), type);
const settled = () => page.waitForFunction(() => !st.inflight && !st.pending && $("#busy").hidden);

let opened = 0;
const slide = fs.readFileSync(image);
async function open() {
  const done = next("opened");
  await page.setInputFiles("#file", { name: `corner ${++opened}.tif`, mimeType: "image/tiff", buffer: slide });
  await done; await settled();
}
// finding ends with the first filter pass on the new candidates
async function find() {
  for (const f of ["tl", "rf"]) {
    const done = next("filtered");
    await page.evaluate((f) => { $("#finder").value = f; $("#finder").dispatchEvent(new Event("change")); $("#find").click(); }, f);
    await done; await settled();
  }
}
// each numeric filter moved away from its value and back, in both views, and a filter switched off and on
async function tune() {
  const n = await page.evaluate(() => document.querySelectorAll("#filters .param.number").length);
  if (n < 6) await fail(`only ${n} filter dials to move`);
  for (let k = 0; k < 2 * n; k++) {
    const done = next("filtered");
    await page.evaluate(([k, n]) => {
      if (k === 0) showView("items"); if (k === n) showView("image");
      const p = document.querySelectorAll("#filters .param.number")[Math.floor(k / 2)], box = p.querySelector(".box");
      box.value = k % 2 ? st.defaults[p.dataset.name] : st.defaults[p.dataset.name] * 1.3 + 0.1; box.dispatchEvent(new Event("input"));
    }, [k, n]);
    await done; await settled();
  }
  for (const on of [false, true]) {
    const done = next("filtered");
    await page.evaluate((on) => { const c = document.querySelector("#filters .filter input[type=checkbox]"); c.checked = on; c.dispatchEvent(new Event("change")); }, on);
    await done; await settled();
  }
}

// what the page holds once garbage is collected; usedSize is the JavaScript heap, backingStorageSize
// the array buffers outside it (the image, the segments)
async function measure() {
  // twice: DOM nodes freed by the first collection are swept only after it
  await cdp.send("HeapProfiler.collectGarbage"); await page.waitForTimeout(50); await cdp.send("HeapProfiler.collectGarbage");
  const h = await cdp.send("Runtime.getHeapUsage");
  const perf = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  return { heap: h.usedSize, buffers: h.backingStorageSize, nodes: perf.Nodes, listeners: perf.JSEventListeners };
}
const KB = 1024;
// the heap settles by a few kilobytes of compiled code and caches over the first rounds; the image
// alone is a quarter of a megabyte and a candidate's card several kilobytes
const LIMITS = { heap: 256 * KB, buffers: 64 * KB, nodes: 0, listeners: 0 };

await page.goto(origin + "/web/");
await page.waitForFunction(() => st.ready);
await open(); await find(); await tune();
const problems = [];
for (const [name, act] of Object.entries({ open, find, tune })) {
  await act(); await act();
  const base = await measure();
  for (let r = 0; r < +(process.env.ROUNDS || 4); r++) await act();
  const m = await measure();
  console.log(name.padEnd(5), Object.keys(LIMITS).map((k) => `${k} ${base[k]} -> ${m[k]}`).join(", "));
  for (const [k, lim] of Object.entries(LIMITS)) if (m[k] - base[k] > lim) problems.push(`${name}: ${k} grew by ${m[k] - base[k]} over 4 rounds`);
}
await browser.close(); server.close();
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);
