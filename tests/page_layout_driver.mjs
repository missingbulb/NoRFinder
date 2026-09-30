// Drives the page (web/) in headless Chromium with a stand-in worker that answers from ANSWERS, a folder
// of real results written by tests/test_memory.py, and checks that no image is drawn out of its own
// proportions when the side bars are narrow: the thumbnail, the image, the cards in both item views and
// the selected card. Prints what it measured; exits 1 on a skewed image, 2 when it cannot run.
//   node tests/page_layout_driver.mjs ANSWERS IMAGE
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
    postMessage({ type: "filtered", ...A.filtered[finder][0], seq: m.seq, ms: 0 });
  }
};`;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  let f = u.startsWith("/web/answers/") ? path.join(answers, u.slice("/web/answers/".length)) : path.join(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch();
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
// every drawn canvas and image: how far its shown width / height strays from its pixels' own
const measure = (page) => page.evaluate(() => [...document.querySelectorAll("canvas, img")].filter((c) => c.offsetWidth && c.offsetHeight).map((c) => {
  const r = c.getBoundingClientRect(), w = c.naturalWidth || c.width, h = c.naturalHeight || c.height;
  return { where: c.closest("[id]").id, skew: Math.abs(r.width / r.height / (w / h) - 1) };
}));
let seen = 0, worst = { skew: 0 };
// the side bars at their narrowest, in a narrow and a wide window
for (const width of [1000, 1600]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; localStorage.setItem("nor-bars-v1", JSON.stringify({ left: 200, right: 200 })); });
  const page = await ctx.newPage();
  page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/index.html");
  await page.waitForFunction(() => !document.querySelector("#finder").disabled);
  await page.setInputFiles("#file", image);
  await page.waitForFunction(() => !document.querySelector("#find").disabled);
  await page.click("#find");
  await page.waitForFunction(() => st.alone && $("#busy").hidden);
  await page.click("#sel-next");
  const views = [["image", async () => {}], ["finalists", () => page.click("#switch")], ["rejected", () => page.click("#tab-fail")]];
  for (const [view, go] of views) {
    await go();
    const got = await measure(page);
    const cards = got.filter((g) => g.where === "list").length, selected = got.filter((g) => g.where === "selected").length;
    console.log(`${width}px ${view}: ${got.length} images, ${cards} cards, ${selected} selected`);
    if (!selected) { console.error("no selected card drawn"); await done(1); }
    if (view !== "image" && !cards) { console.error(`no ${view} cards drawn`); await done(1); }
    seen += got.length;
    for (const g of got) if (g.skew > worst.skew) worst = { ...g, width, view };
  }
  await ctx.close();
}
console.log(`${seen} images measured; most skewed ${worst.skew.toFixed(3)}`, worst.where ? `(${worst.where}, ${worst.view}, ${worst.width}px)` : "");
// a pixel of rounding in a crop's width is under 1%
await done(worst.skew > 0.02 ? 1 : 0);
