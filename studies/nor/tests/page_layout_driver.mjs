// Drives the page (web/) in headless Chromium with a stand-in worker that answers from ANSWERS, a folder
// of real results written by tests/test_memory.py, and checks that no image is drawn out of its own
// proportions when the side bar is narrow: the minimap, the image, the cards in both item views and the
// selected card; and where the selected card and Submit Ground Truth sit, with no right bar. Prints what it
// measured; exits 1 on a skewed image or a misplaced part, 2 when it cannot run.
//   node tests/page_layout_driver.mjs ANSWERS IMAGE
import { repoFile } from "../../../web-tests/repo_file.mjs";
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
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

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
    postMessage({ type: "result", action: "refilter", meta: A.filtered[finder][0], echo: m.echo, ms: 0 });
  }
};`;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  let f = u.startsWith("/web/answers/") ? path.join(answers, u.slice("/web/answers/".length)) : repoFile(repo, u);
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
  await page.goto(origin + "/web/index.html?study=nor");
  await page.waitForFunction(() => document.querySelector("#finder")?.disabled === false);
  await page.setInputFiles("#file", image);
  await page.waitForFunction(() => !document.querySelector("#find").disabled);
  await page.click("#find");
  await page.waitForFunction(() => st.alone && $("#busy").hidden);
    // ---- the selected card over the image's top right corner, only while one is selected; Submit Ground
  // Truth at the toolbar's right end; no right bar (3.2, 3.4, 3.13) ----
  const fail = async (what, seen) => { console.error("FAILED: " + what + ": " + JSON.stringify(seen)); await done(1); };
  if (await page.isVisible("#selected-box")) await fail("the selected card shows with nothing selected", true);
  const sc = await page.locator("#scroller").boundingBox();
  await page.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2);
  await page.mouse.wheel(200, 0); // a sideways swipe steps to the first candidate
  await page.waitForSelector("#selected-box", { state: "visible" });
  const layout = await page.evaluate(() => {
    const box = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const tools = [...document.querySelector(".toolbar").children].filter((e) => e.offsetParent && e.tagName !== "SLOT-HERE");
    return { sel: box("#selected-box"), view: box("#image-view"), mm: box("#minimap"), crop: box("#selected .crop-wrap canvas, #selected .crop-wrap img"),
      prev: box("#sel-prev"), next: box("#sel-next"), title: document.querySelector("#selected-box h2")?.textContent || "",
      stepIn: !!document.querySelector("#selected .crop-wrap #sel-prev"), right: !!document.querySelector("#right"),
      gt: document.querySelector("#dl-truth").textContent.trim(), gtLast: tools[tools.length - 1]?.id };
  });
  console.log(JSON.stringify(layout));
  if (layout.title) await fail("the selected card has a title", layout.title);
  if (Math.abs(layout.sel.r - layout.view.r) > 40 || Math.abs(layout.sel.t - layout.view.t) > 40) await fail("the selected card is not at the image's top right corner", layout);
  if (layout.mm && layout.mm.r > layout.sel.l) await fail("the minimap and the selected card overlap", layout);
  if (!layout.stepIn || layout.prev.b > layout.crop.b + 1 || layout.prev.t < layout.crop.t || layout.next.l < layout.prev.r - 1) await fail("previous and next do not hover side by side over the bottom of the selected crop", layout);
  if (layout.gt !== "Submit Ground Truth" || layout.gtLast !== "dl-truth") await fail("Submit Ground Truth is not the toolbar's last button", layout);
  if (layout.right) await fail("the right bar is still there", layout);
  if (process.env.SHOTS) { await page.evaluate(() => { $("#notice").hidden = true; }); await page.mouse.move(5, 5); await page.screenshot({ path: `${process.env.SHOTS}/${width}_image.png` }); }
  const views = [["image", async () => {}], ["finalists", () => page.click("#switch")], ["rejected", () => page.click("#tab-fail")]];
  for (const [view, go] of views) {
    await go(); await page.waitForFunction(() => !document.querySelector("button.working"));
    // the cards near the view are drawn as the list's observer reports them (3.22)
    if (view !== "image") await page.waitForFunction(() => document.querySelector("#list .card canvas"));
    const got = await measure(page);
    const cards = got.filter((g) => g.where === "list").length, selected = got.filter((g) => g.where === "selected").length;
    console.log(`${width}px ${view}: ${got.length} images, ${cards} cards, ${selected} selected`);
    if (!selected !== (view !== "image")) { console.error(view === "image" ? "no selected card drawn" : `the selected card shows over the ${view}`); await done(1); }
    if (view !== "image" && !cards) { console.error(`no ${view} cards drawn`); await done(1); }
    seen += got.length;
    // the rejected are never turned level, so their Options menu does not offer it
    if (view !== "image") {
      await page.click("#card-menu summary");
      const shown = await page.isVisible("#opt-align");
      if (process.env.SHOTS) await page.evaluate(() => { $("#notice").hidden = true; });
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${width}_${view}.png` });
      await page.click("#card-menu summary");
      if (shown !== (view === "finalists")) { console.error(`"align to horizon" ${shown ? "shown" : "missing"} in the ${view} options`); await done(1); }
    }
    for (const g of got) if (g.skew > worst.skew) worst = { ...g, width, view };
  }
  await ctx.close();
}
console.log(`${seen} images measured; most skewed ${worst.skew.toFixed(3)}`, worst.where ? `(${worst.where}, ${worst.view}, ${worst.width}px)` : "");
// a pixel of rounding in a crop's width is under 1%
await done(worst.skew > 0.02 ? 1 : 0);
