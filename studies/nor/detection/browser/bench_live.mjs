// Times each finder on the deployed page in headless Chromium, the way a user runs it: the page's
// own worker.js (Pyodide) opens the reference slide, detects, and runs the first refilter.
//   node bench_live.mjs [URL] [FINDER ...]      (needs Playwright; the slide in data/raw)
// Each finder gets a fresh browser, so the peak memory it reports is that finder's own: the largest
// Chromium process's resident set, sampled from /proc (Linux) every 100 ms. The page's app.js is
// blocked so only the measuring worker runs. Remote requests are fetched by curl and handed to the
// browser, so they go through the environment's proxy and its trusted CA (Chromium does not read it).
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); }

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const url = args[0] && args[0].startsWith("http") ? args.shift() : "https://missingbulb.github.io/NoRFinder/web/";
const finders = args.length ? args : ["tl", "rf", "fill", "walk", "blobs"];
const tif = path.join(repo, "data", "raw", "Left Up- Edited", "Slide5_4AP_NoR.sld - Slice1_up_left2.tif");

function treeRssMb(root) {
  // resident set of every process under root, largest single one and the sum
  const kids = new Map();
  for (const d of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const st = fs.readFileSync(`/proc/${d}/stat`, "utf8");
      const ppid = +st.slice(st.lastIndexOf(")") + 2).split(" ")[1];
      (kids.get(ppid) || kids.set(ppid, []).get(ppid)).push(+d);
    } catch {}
  }
  let max = 0, sum = 0; const todo = [root];
  while (todo.length) {
    const p = todo.pop(); todo.push(...(kids.get(p) || []));
    try {
      if (!/chrom|headless/i.test(fs.readFileSync(`/proc/${p}/comm`, "utf8"))) continue;
      const kb = +fs.readFileSync(`/proc/${p}/status`, "utf8").match(/VmRSS:\s+(\d+)/)[1];
      max = Math.max(max, kb / 1024); sum += kb / 1024;
    } catch {}
  }
  return { max, sum };
}

for (const finder of finders) {
  const browser = await pw.chromium.launch();
  const pid = process.pid;   // every Chromium process descends from this one
  let peak = { max: 0, sum: 0 };
  const poll = setInterval(() => {
    const r = treeRssMb(pid); peak = { max: Math.max(peak.max, r.max), sum: Math.max(peak.sum, r.sum) };
  }, 100);
  const ctx = await browser.newContext();
  await ctx.route(/^https:/, (r) => {
    const u = r.request().url();
    try {
      const tmp = path.join(os.tmpdir(), "bench_live_fetch");
      const type = execSync(`curl -sSfL --max-time 120 -o ${tmp} -w '%{content_type}' ${JSON.stringify(u)}`, { stdio: ["ignore", "pipe", "ignore"] }).toString() || "application/octet-stream";
      const body = fs.readFileSync(tmp);
      return r.fulfill({ body, contentType: type, headers: { "access-control-allow-origin": "*" } });
    } catch { return r.fulfill({ status: 404, body: "" }); }
  });
  const page = await ctx.newPage();
  await page.route("**/app.js", (r) => r.abort());
  await page.route("**/__bench.tif", (r) => r.fulfill({ body: fs.readFileSync(tif), contentType: "image/tiff" }));
  await page.goto(url);
  const r = await page.evaluate(async (finder) => {
    const w = new Worker(new URL("worker.js", location.href), { type: "module" });
    const next = (type) => new Promise((ok, bad) => {
      w.onmessage = (e) => { if (e.data.type === type) ok(e.data); else if (e.data.type === "error") bad(new Error(e.data.text)); };
    });
    const t0 = performance.now();
    await next("ready"); const boot = (performance.now() - t0) / 1000;
    const bytes = await (await fetch("__bench.tif")).arrayBuffer();
    let t = performance.now(); w.postMessage({ type: "open", name: "slide.tif", bytes }, [bytes]); await next("opened");
    const open = (performance.now() - t) / 1000;
    t = performance.now(); w.postMessage({ type: "detect", finder, overrides: {} }); const d = await next("detected");
    const detect = (performance.now() - t) / 1000;
    t = performance.now(); w.postMessage({ type: "refilter", seq: 1, spec: { values: {}, off: [] } }); const f = await next("filtered");
    const refilter = (performance.now() - t) / 1000;
    return { boot, open, detect, refilter, cands: (typeof d.meta === "string" ? JSON.parse(d.meta) : d.meta).cands.length, passes: f.fails.filter((x) => x === null).length };
  }, finder);
  clearInterval(poll);
  await browser.close();
  console.log(`${finder.padEnd(6)} boot ${r.boot.toFixed(1)}s  open ${r.open.toFixed(1)}s  detect ${r.detect.toFixed(1)}s  refilter ${r.refilter.toFixed(2)}s`
    + ` | peak RSS largest process ${peak.max.toFixed(0)} MB, all Chromium ${peak.sum.toFixed(0)} MB | ${r.passes}/${r.cands} pass`);
}
