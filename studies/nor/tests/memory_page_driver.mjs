// Drives the page (web/) in headless Chromium with a stand-in worker that answers from ANSWERS, a folder
// of real results written by tests/test_memory.py, and checks that opening IMAGE, finding and moving
// filters over and over leaves the page holding no more JavaScript heap, array buffers, DOM nodes or
// event listeners. Prints what it measured; exits 1 on growth, 2 when it cannot run.
// THROTTLE=n slows its CPU n times over, as a slow test machine is.
//   node tests/memory_page_driver.mjs ANSWERS IMAGE
import { repoFile } from "../../../web-tests/repo_file.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { offSite } from "../../../web-tests/off_site.mjs";
import { ENGINE, LAUNCH } from "../../../web-tests/engine.mjs";
import { standInDrive, openFromDrive } from "../../../web-tests/drive_open.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [answers, image] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// answers every request the way web/worker.js does, from the folder served at answers/
const STAND_IN = `
const A = await (await fetch("answers/answers.json")).json();
const bin = async (n) => new Uint8Array(await (await fetch("answers/" + n)).arrayBuffer());
let finder;
postMessage({ type: "ready", info: { finders: A.finders, about: A.about }, secs: 0 });
onmessage = async ({ data: m }) => {
  if (m.type === "open") {
    const images = await bin("images.bin");
    postMessage({ type: "opened", meta: { H: A.H, W: A.W, um: A.um }, images, secs: 0 }, [images.buffer]);
  } else if (m.type === "call" && m.action === "detect") {
    finder = m.args.finder; const seg = await bin("seg_" + finder + ".bin");
    postMessage({ type: "result", action: "detect", meta: A.detected[finder], bytes: seg, secs: 0 }, [seg.buffer]);
  } else if (m.type === "call" && m.action === "refilter") {
    postMessage({ type: "result", action: "refilter", meta: A.filtered[finder][m.echo % 2], echo: m.echo, ms: 0 });
  }
};`;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  let f = u.startsWith("/web/answers/") ? path.join(answers, u.slice("/web/answers/".length)) : repoFile(repo, u);
  if (f.endsWith(path.sep)) f = path.join(f, "index.html");
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw[ENGINE].launch(LAUNCH);
const fail = async (why) => { console.error(why); await browser.close(); server.close(); process.exit(1); };
const ctx = await browser.newContext();
// nothing leaves this machine, and the cache of third-party files, which the stand-in never needs, is off
await ctx.route(offSite(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await standInDrive(ctx);
const page = await ctx.newPage();
page.on("pageerror", (e) => fail("page error: " + e.message));
page.setDefaultTimeout(10000);
const cdp = await ctx.newCDPSession(page);
await cdp.send("Performance.enable");
if (process.env.THROTTLE) await cdp.send("Emulation.setCPUThrottlingRate", { rate: +process.env.THROTTLE });

// resolves with the worker's next message of this type, or answer to this action (the page's own handler still gets it)
const next = (action) => page.evaluate((action) => new Promise((ok) => {
  const h = (e) => { if (e.data.type === action || (e.data.type === "result" && e.data.action === action)) { st.worker.removeEventListener("message", h); ok(); } };
  st.worker.addEventListener("message", h);
}), action);
const settled = () => page.waitForFunction(() => !st.inflight && !st.pending && $("#busy").hidden);

let opened = 0;
const slide = fs.readFileSync(image);
async function open() {
  const done = next("opened");
  // two images by turns, each the same file on Drive every time, so the image selector lists the same two
  await openFromDrive(page, { name: `corner ${(++opened % 2) + 1}.tif`, mimeType: "image/tiff", buffer: slide });
  await done; await settled();
}
// finding ends with the first filter pass on the new candidates
async function find() {
  for (const f of ["tl", "rf"]) {
    const done = next("refilter");
    await page.evaluate((f) => { $("#finder").value = f; $("#finder").dispatchEvent(new Event("change")); $("#find").click(); }, f);
    await done; await settled();
  }
}
// each numeric filter moved away from its value and back, in both views, and a filter switched off and on
async function tune() {
  const n = await page.evaluate(() => document.querySelectorAll("#filters .param.number").length);
  if (n < 6) await fail(`only ${n} filter dials to move`);
  for (let k = 0; k < 2 * n; k++) {
    const done = next("refilter");
    await page.evaluate(([k, n]) => {
      if (k === 0) nor.showView("items"); if (k === n) nor.showView("image");
      const p = document.querySelectorAll("#filters .param.number")[Math.floor(k / 2)], box = p.querySelector(".box");
      box.value = k % 2 ? st.defaults[p.dataset.name] : st.defaults[p.dataset.name] * 1.3 + 0.1; box.dispatchEvent(new Event("input"));
    }, [k, n]);
    await done; await settled();
  }
  for (const on of [false, true]) {
    const done = next("refilter");
    await page.evaluate((on) => { const c = document.querySelector("#filters .filter input[type=checkbox]"); c.checked = on; c.dispatchEvent(new Event("change")); }, on);
    await done; await settled();
  }
}

// what the page holds once garbage is collected; usedSize is the JavaScript heap, backingStorageSize
// the array buffers outside it (the image, the segments)
async function measure() {
  // The status bar's numbers hold a node or more for each character of their last change, and the network's
  // changes every second as its rate falls: written plain, and measured again whenever one changed meanwhile, the
  // count is the same whatever they last read.
  // the page's frames done first: the item view draws its cards in them as they come near, which a slow machine
  // can still be doing when the work itself has settled
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 100)))));
  // An attribute is a node of its own once something reads it as one, as Playwright does with every attribute of an
  // element it writes into an action's log, and the page adds attributes as it goes (a class the first time an
  // animation is seen off screen): each one in the document is read here, made a node whoever read it before, and
  // left out of the count, which is then the same whichever elements Playwright described and whatever state the
  // page's attributes are in.
  const attributes = () => page.evaluate(() => {
    let n = 0;
    for (const e of document.querySelectorAll("*")) { for (let i = 0; i < e.attributes.length; i++) void e.attributes[i]; n += e.attributes.length; }
    return n;
  });
  for (let tries = 0; ; tries++) {
    await page.evaluate(() => { for (const v of document.querySelectorAll("#statusbar .sb-item .v")) v.textContent = v.textContent; });
    const attrs = await attributes();
    // A node and its listeners leave the counts only when a collection's sweep reaches them, which on a slow
    // machine can trail the collection: collected again until two readings agree, garbage still unswept keeps
    // falling and a node something holds stays.
    let perf = await collected(), sweeps = 1;
    for (let was = null; sweeps < 10 && !(was && perf.Nodes === was.Nodes && perf.JSEventListeners === was.JSEventListeners); sweeps++) {
      was = perf; perf = await collected();
    }
    const h = await cdp.send("Runtime.getHeapUsage");
    // one that changed without rolling, "12%" to "2%", is still its characters a node each
    const rolled = await page.evaluate(() => [...document.querySelectorAll("#statusbar .sb-item .v")].some((v) => v.children.length || v.childNodes.length > 1));
    if ((rolled || (await attributes()) !== attrs) && tries < 10) continue;
    return { heap: h.usedSize, buffers: h.backingStorageSize, nodes: perf.Nodes - attrs, listeners: perf.JSEventListeners, sweeps, where: await where() };
  }
}
// the page's counts after a collection; twice, as DOM nodes freed by the first are swept only after it
async function collected() {
  await cdp.send("HeapProfiler.collectGarbage"); await page.waitForTimeout(50); await cdp.send("HeapProfiler.collectGarbage"); // waits on purpose: the page runs between the two collections, so the second sweeps what the first freed
  return Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
}
// the nodes in the document, by the nearest ancestor with an id, and how many that is in all
const where = () => page.evaluate(() => {
  const by = {}, walk = document.createTreeWalker(document, NodeFilter.SHOW_ALL);
  let all = 1; // the document itself
  for (let x = walk.nextNode(); x; x = walk.nextNode()) {
    all++;
    const e = (x.nodeType === 1 ? x : x.parentElement)?.closest("[id]"), k = e ? "#" + e.id : "(no id)";
    by[k] = (by[k] || 0) + 1;
  }
  return { by, all };
});
const KB = 1024;
// the heap settles by a few kilobytes of compiled code and caches over the first rounds; the image
// alone is a quarter of a megabyte and a candidate's card several kilobytes
const LIMITS = { heap: 256 * KB, buffers: 64 * KB, nodes: 0, listeners: 0 };

await page.goto(origin + "/web/?study=nor");
await page.waitForFunction(() => st.ready);
await open(); await find(); await tune();
const problems = [];
for (const [name, act] of Object.entries({ open, find, tune })) {
  await act(); await act();
  const base = await measure();
  for (let r = 0; r < +(process.env.ROUNDS || 4); r++) await act();
  const m = await measure();
  console.log(name.padEnd(5), Object.keys(LIMITS).map((k) => `${k} ${base[k]} -> ${m[k]}`).join(", "), `(collections ${base.sweeps}, ${m.sweeps})`);
  for (const [k, lim] of Object.entries(LIMITS)) if (m[k] - base[k] > lim) problems.push(`${name}: ${k} grew by ${m[k] - base[k]} over 4 rounds`);
  // where the nodes went, so a growth seen only on another machine says where to look
  if (m.nodes > base.nodes) {
    const a = base.where.by, b = m.where.by;
    const grew = Object.keys({ ...a, ...b }).filter((k) => (a[k] || 0) !== (b[k] || 0)).map((k) => `${k} ${a[k] || 0} -> ${b[k] || 0}`);
    problems.push(`${name}: in the document ${grew.join(", ") || "nothing changed"}; outside it ${base.nodes - base.where.all} -> ${m.nodes - m.where.all}`);
  }
}
await browser.close(); server.close();
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);
