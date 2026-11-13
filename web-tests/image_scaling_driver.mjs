// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from
// ANSWERS (tests/test_study_runs.py), opens CHECKER (a checkerboard of black and white pixels) and checks what the
// screen shows of it: zoomed out, the average grey of the pixels under each screen pixel; from 100% up, black and
// white squares. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/image_scaling_driver.mjs ANSWERS STUDIES CHECKER.png
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
import { frames } from "./page_frames.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [answers, studies, checker] = process.argv.slice(2);
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
await page.setInputFiles("#file", checker);
await page.waitForFunction(() => document.querySelector("#status").textContent === "Image loaded.");
await page.mouse.move(1, 1);

// the greys the screen shows over a 40-pixel square in the middle of the view, once drawing has settled
async function onScreen() {
  await frames(page);
  const r = await page.evaluate(() => { const s = document.querySelector("#scroller").getBoundingClientRect(); return { x: s.x + s.width / 2 - 20, y: s.y + s.height / 2 - 20 }; });
  const png = (await page.screenshot({ clip: { ...r, width: 40, height: 40 } })).toString("base64");
  return page.evaluate(async (png) => {
    const i = new Image(); i.src = "data:image/png;base64," + png; await i.decode();
    const c = new OffscreenCanvas(i.width, i.height), g = c.getContext("2d"); g.drawImage(i, 0, 0);
    const d = g.getImageData(0, 0, i.width, i.height).data, v = [];
    for (let k = 0; k < d.length; k += 4) v.push(d[k]);
    return v;
  }, png);
}
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;

while ((await page.evaluate(() => st.zoom)) > 0.3) await page.click("#zoom-out");
const out = await onScreen(), far = Math.max(...out.map((v) => Math.abs(v - 128)));
await check(far <= 24, "zoomed out, every screen pixel is the average grey of the black and white pixels under it", { mean: mean(out), far });

while ((await page.evaluate(() => st.zoom)) < 2) await page.click("#zoom-in");
const near = await onScreen(), sharp = near.filter((v) => v < 8 || v > 247).length / near.length;
await check(sharp > 0.95, "from 100% up, each image pixel is a sharp black or white square", { sharp, zoom: await page.evaluate(() => st.zoom) });

await done(0);
