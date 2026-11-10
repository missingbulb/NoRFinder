// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from
// ANSWERS (tests/test_study_runs.py), and checks the zoom each image opens at: LARGE, larger than the view, whole in
// it; SMALL, smaller than the view, at 100% and centred; and LARGE again, after zooming in, whole in the view again.
// Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/image_fit_driver.mjs ANSWERS STUDIES LARGE.png SMALL.png
import { EARLY } from "./early_messages.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { repoFile } from "./repo_file.mjs";
import { offSite } from "./off_site.mjs";
import { ENGINE, LAUNCH } from "./engine.mjs";
import { localStudy } from "./local_study.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [answers, studies, large, small] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STAND_IN = `
const A = await (await fetch("answers.json")).json();
postMessage({ type: "ready", info: A.ready.fixture });
onmessage = ({ data: m }) => { if (m.type === "open") postMessage({ type: "held" }); };`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(EARLY + STAND_IN); }
  const f = u === "/web/answers.json" ? answers : u === "/web/studies.json" ? studies : repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw[ENGINE].launch(LAUNCH);
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what, seen) => { if (!ok) { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); } console.log("ok: " + what); };

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
await localStudy(ctx, "fixture");
await ctx.route(offSite(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
const page = await ctx.newPage();
page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
page.setDefaultTimeout(10000);
await page.goto(origin + "/web/fixture");
await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));
async function open(file) {
  await page.evaluate(() => { document.querySelector("#status").textContent = ""; });
  await page.setInputFiles("#file", file);
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Image loaded.");
  return page.evaluate(() => {
    const v = document.querySelector("#scroller").getBoundingClientRect(), b = document.querySelector("#base").getBoundingClientRect();
    return { zoom: st.zoom, W: st.W, H: st.H, left: b.left - v.left, right: v.right - b.right, top: b.top - v.top, bottom: v.bottom - b.bottom,
      fitsW: document.querySelector("#scroller").clientWidth, fitsH: document.querySelector("#scroller").clientHeight };
  });
}
const whole = (o) => o.zoom < 1 && o.W * o.zoom <= o.fitsW + 0.5 && o.H * o.zoom <= o.fitsH + 0.5 &&
  (Math.abs(o.W * o.zoom - o.fitsW) < 1 || Math.abs(o.H * o.zoom - o.fitsH) < 1);

const big = await open(large);
await check(whole(big), "an image larger than the view opens shrunk to fit it", big);
const little = await open(small);
await check(little.zoom === 1 && Math.abs(little.left - little.right) <= 1 && Math.abs(little.top - little.bottom) <= 1,
  "an image smaller than the view opens at 100%, centred", little);
for (let k = 0; k < 3; k++) await page.click("#zoom-in");
const again = await open(large);
await check(whole(again), "the next image opens fitted, whatever the last was zoomed to", again);

await done(0);
