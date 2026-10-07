// Times the page's start in headless Chromium: loads web/ from REPO with its real worker and prints each
// status-bar text with the time it appeared, until the finders are ready. Remote files (Pyodide and its
// packages) are fetched once by curl into CACHE (default /tmp/boot_live_cdn) and served from there over a
// simulated link of MBPS megabits/s shared by the files in flight (0: no limit, like a return visit).
//   python3 web/build.py; node boot_live.mjs [REPO] [MBPS]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); }
const [repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", ".."), mbps = "0"] = process.argv.slice(2);
const CDN = process.env.CACHE || "/tmp/boot_live_cdn";
fs.mkdirSync(CDN, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".wasm": "application/wasm" };
const server = http.createServer((q, r) => {
  const f = path.join(repo, decodeURIComponent(new URL(q.url, "http://x").pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
// the link is shared fairly by the files downloading at once
const bps = (+mbps * 1e6) / 8, active = new Set();
setInterval(() => {
  for (const t of active) { t.left -= (bps * 0.02) / active.size; if (t.left <= 0) { active.delete(t); t.done(); } }
}, 20).unref();
await ctx.route(/^https:/, async (r) => {
  const u = r.request().url();
  if (!u.includes("cdn.jsdelivr.net")) return r.abort();
  const f = path.join(CDN, encodeURIComponent(u));
  if (!fs.existsSync(f)) execSync(`curl -sSfL --max-time 300 -o ${JSON.stringify(f)} ${JSON.stringify(u)}`);
  const body = fs.readFileSync(f);
  if (bps) await new Promise((done) => active.add({ left: body.length, done }));
  const type = TYPES[path.extname(new URL(u).pathname)] || "application/octet-stream";
  return r.fulfill({ body, contentType: type, headers: { "access-control-allow-origin": "*", "content-length": String(body.length) } });
});
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("page error:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
await page.exposeFunction("__log", (t, s) => console.log(`${(t / 1000).toFixed(1).padStart(6)} s  ${s}`));
await page.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    let last = "";
    const sb = document.querySelector("#statusbar");
    new MutationObserver(() => { const s = document.querySelector("#status").textContent; if (s !== last) { last = s; window.__log(performance.now(), s); } })
      .observe(sb, { subtree: true, childList: true, characterData: true });
  });
});
await page.goto(origin + "/web/index.html");
await page.waitForFunction(() => !document.querySelector("#finder").disabled, null, { timeout: 600000 });
await browser.close(); server.close();
