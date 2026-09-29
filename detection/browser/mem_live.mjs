// Chromium's memory for the page's worker, stage by stage and process by process: the browser
// before the worker starts, after Pyodide and the packages are ready, after the slide opens, after
// detect, after the first refilter. The worker is the page's own worker.js at URL (the deployed
// site by default, or a local preview), and app.js is blocked so only the measuring worker runs.
//   node mem_live.mjs [URL] [FINDER]      (needs Playwright; the slide in data/raw)
// Memory is the proportional set size (PSS) from /proc/PID/smaps_rollup, so libraries shared
// between Chromium's processes are counted once, grouped by Chromium process type; the renderer
// holds the worker, and with it Pyodide. Remote requests go through curl, as in bench_live.mjs.
// A preview whose worker.js sets `self.py = py` after loadPyodide also gets the worker's own parts:
// the WebAssembly memory, the in-memory filesystem's files and the number of native modules loaded.
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
const finder = args[0] || "tl";
const tif = path.join(repo, "data", "raw", "Left Up- Edited", "Slide5_4AP_NoR.sld - Slice1_up_left2.tif");
const MB = 1024;

function byType() {
  // PSS in MB of every Chromium process descending from this one, keyed by --type (browser = none)
  const kids = new Map();
  for (const d of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const st = fs.readFileSync(`/proc/${d}/stat`, "utf8");
      const ppid = +st.slice(st.lastIndexOf(")") + 2).split(" ")[1];
      (kids.get(ppid) || kids.set(ppid, []).get(ppid)).push(+d);
    } catch {}
  }
  const out = {}; const todo = [process.pid];
  while (todo.length) {
    const p = todo.pop(); todo.push(...(kids.get(p) || []));
    try {
      if (!/chrom|headless/i.test(fs.readFileSync(`/proc/${p}/comm`, "utf8"))) continue;
      const cmd = fs.readFileSync(`/proc/${p}/cmdline`, "utf8");
      const type = (cmd.match(/--type=([\w-]+)/) || [, "browser"])[1];
      const kb = +fs.readFileSync(`/proc/${p}/smaps_rollup`, "utf8").match(/Pss:\s+(\d+)/)[1];
      out[type] = (out[type] || 0) + kb / MB;
    } catch {}
  }
  return out;
}

const rows = [];
let page;
async function inside() {
  const w = page.workers()[0];
  if (!w) return null;
  return w.evaluate(() => {
    const py = self.py;
    if (!py) return null;
    const files = (dir) => {
      let n = 0;
      for (const e of py.FS.readdir(dir)) {
        if (e === "." || e === "..") continue;
        const p = (dir === "/" ? "" : dir) + "/" + e;
        if (["/dev", "/proc", "/sys"].includes(p)) continue;
        const st = py.FS.lstat(p);
        n += py.FS.isDir(st.mode) ? files(p) : py.FS.isFile(st.mode) ? st.size : 0;
      }
      return n;
    };
    const MB = 2 ** 20;
    return { wasm: py._module.HEAPU8.length / MB, files: files("/") / MB,
             libs: Object.keys(py._module.LDSO.loadedLibsByName).filter((k) => k.endsWith(".so")).length };
  }).catch(() => null);
}
const mark = async (label) => rows.push([label, byType(), await inside()]);

const browser = await pw.chromium.launch();
const ctx = await browser.newContext();
await ctx.route(/^https:/, (r) => {
  const u = r.request().url();
  try {
    const tmp = path.join(os.tmpdir(), "mem_live_fetch");
    const type = execSync(`curl -sSfL --max-time 120 -o ${tmp} -w '%{content_type}' ${JSON.stringify(u)}`, { stdio: ["ignore", "pipe", "ignore"] }).toString() || "application/octet-stream";
    return r.fulfill({ body: fs.readFileSync(tmp), contentType: type, headers: { "access-control-allow-origin": "*" } });
  } catch { return r.fulfill({ status: 404, body: "" }); }
});
page = await ctx.newPage();
await page.route("**/app.js", (r) => r.abort());
await page.route("**/__bench.tif", (r) => r.fulfill({ body: fs.readFileSync(tif), contentType: "image/tiff" }));
await page.goto(url);
await page.waitForTimeout(1000);
await mark("page loaded, no worker");
await page.evaluate(() => {
  window.w = new Worker(new URL("worker.js", location.href), { type: "module" });
  window.next = (type) => new Promise((ok, bad) => {
    w.onmessage = (e) => { if (e.data.type === type) ok(e.data); else if (e.data.type === "error") bad(new Error(e.data.text)); };
  });
  window.ready = next("ready");
});
const boot = await page.evaluate(async () => (await ready).secs);
await mark(`ready (${boot.toFixed(1)} s)`);
let res = null;
try {
  await page.evaluate(async () => {
    const bytes = await (await fetch("__bench.tif")).arrayBuffer();
    w.postMessage({ type: "open", name: "slide.tif", bytes }, [bytes]); await next("opened");
  });
  await mark("slide opened");
  res = await page.evaluate(async (finder) => {
    w.postMessage({ type: "detect", finder, overrides: {} }); const d = await next("detected");
    w.postMessage({ type: "refilter", seq: 1, spec: { values: {}, off: [] } }); const f = await next("filtered");
    const meta = typeof d.meta === "string" ? JSON.parse(d.meta) : d.meta;
    return { secs: d.secs, cands: meta.cands.length, passes: f.fails.filter((x) => x === null).length };
  }, finder);
  await mark(`detect ${finder} + refilter (${res.secs.toFixed(1)} s)`);
} catch (e) { console.log(`stopped: ${e.message.split("\n")[0]}`); }
await browser.close();

const types = [...new Set(rows.flatMap(([, r]) => Object.keys(r)))].sort();
console.log(`${url}  finder ${finder}${res ? `: ${res.passes}/${res.cands} pass` : ""}. PSS in MB`);
const IN = ["wasm", "files", "libs"];
const detail = rows.some(([, , d]) => d);
console.log(["stage".padEnd(32), ...types.map((t) => t.slice(0, 10).padStart(10)), "total".padStart(7),
  ...(detail ? ["| worker:", ...IN.map((k) => k.padStart(7))] : [])].join(" "));
for (const [label, r, d] of rows) {
  const tot = Object.values(r).reduce((a, b) => a + b, 0);
  console.log([label.padEnd(32), ...types.map((t) => (r[t] || 0).toFixed(0).padStart(10)), tot.toFixed(0).padStart(7),
    ...(detail ? ["|        ", ...IN.map((k) => (d ? d[k].toFixed(0) : "").padStart(7))] : [])].join(" "));
}
