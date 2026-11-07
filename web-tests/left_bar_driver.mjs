// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from
// ANSWERS (tests/test_study_runs.py), and checks the left bar's drawers: stacked with no gap, numbered, the
// open one marked, Data Management's own drawers not among them; folding with the steps (Load Image open until an
// image opens; each study drawer opening
// after its step and folding again after the one it names; one only its title opens staying folded); their
// titles (a done drawer folded sums up what was done, open names itself, a waiting one says its task); and
// another image, or Unload, starting over. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/left_bar_driver.mjs ANSWERS IMAGE.png STUDIES
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { repoFile } from "./repo_file.mjs";
import { offSite } from "./off_site.mjs";
import { ENGINE, LAUNCH } from "./engine.mjs";
import { asTagger } from "./tagger.mjs";
import { record, begun, moved } from "./page_motions.mjs";
import { localStudy } from "./local_study.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [answers, image, studies] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STAND_IN = `
const A = await (await fetch("answers.json")).json();
const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
postMessage({ type: "ready", info: A.ready.fixture });
onmessage = ({ data: m }) => {
  if (m.type === "open") { const images = bytes(A.images); postMessage({ type: "opened", meta: A.opened, images }, [images.buffer]); }
  else if (m.type === "call") { const b = bytes(A.mask); postMessage({ type: "result", action: m.action, meta: A.count, bytes: b, echo: m.echo }, [b.buffer]); }
};`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  if (u === "/web/vendor/wheels.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end("[]"); }
  const f = u === "/web/answers.json" ? answers : u === "/web/studies.json" ? studies : repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw[ENGINE].launch(LAUNCH);
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what, seen) => { if (!ok) { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); } console.log("ok: " + what); };

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

await localStudy(ctx, "fixture");

await asTagger(ctx);
await ctx.route(offSite(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await record(ctx);
const page = await ctx.newPage();
page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
page.setDefaultTimeout(10000);
await page.goto(origin + "/web/fixture");
await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));

// the left bar's drawers as the user sees them: the step mark, the title (a picture in it as "[img]") and
// open or folded, by its contents shown or not
// the drawers on show: Data Management's own are not, out of it
const bar = () => page.evaluate(() => [...document.querySelectorAll("#left > .box.foldable")].filter((b) => b.checkVisibility()).map((b) => {
  const body = [...b.children].find((c) => !c.matches(".sec-head, .gt-access, slot-here")), h = b.querySelector(".sec-head h2");
  const mark = h.querySelector(".step-mark"), t = h.querySelector(".title");
  const text = [...(t?.querySelectorAll("img, canvas") || [])].map(() => "[img] ").join("") + (t ? t.textContent.trim() : h.textContent);
  return `${mark ? mark.textContent : "?"} ${text} ${body && body.offsetParent ? "open" : "folded"}`;
}));
const boxes = async (want, what) => { const b = await bar(); await check(b.join("|") === want.join("|"), what, b); };
// a drawer slides open or shut: read once it has
const title = async (k) => { await page.locator("#left > .box.foldable:visible > .sec-head h2").nth(k).click(); await page.waitForFunction(() => !document.documentElement.hasAttribute("data-drawers")); };
// the status line is cleared first, so the wait is for this image's load, not the last one's
const loadImage = async () => {
  await page.evaluate(() => { document.querySelector("#status").textContent = ""; });
  await page.setInputFiles("#file", image);
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Image loaded." && !document.querySelector("#fx-count").disabled);
};
const name = path.basename(image);

// drawers, not boxes: each touches the one above it
const gaps = await page.evaluate(() => { const r = [...document.querySelectorAll("#left > .box.foldable")].filter((b) => b.checkVisibility()).map((b) => b.getBoundingClientRect());
  return r.slice(1).map((x, k) => Math.round(x.top - r[k].bottom)); });
await check(gaps.every((g) => g <= 0), "the drawers stack with no gap between them", gaps);
const bars = () => page.evaluate(() => [...document.querySelectorAll("#left > .box.foldable")].filter((b) => b.checkVisibility()).map((b) => getComputedStyle(b).boxShadow !== "none"));

await boxes(["1 Load Image open", "2 Processing folded", "3 Ground Truth Tasks folded"], "before an image only Load Image is open, each drawer numbered");
await check((await bars()).join() === "true,false,false", "the open drawer, and only it, carries the accent bar", await bars());
await loadImage();
await boxes(["✓ [img] " + name + "2D folded", "2 Processing open", "3 Ground Truth Tasks folded"],
  "an image open: Load Image folds to its preview, name and what it holds, checked, and Processing opens");
// a drawer slides open or shut, and the drawers below slide to their new places: the slide starts and ends
const before = await begun(page);
await title(0);
// where the browser has the view transitions it takes; elsewhere the drawers change at once
const slides = await page.evaluate(() => !!document.startViewTransition && CSS.supports("view-transition-group", "contain"));
const slid = slides ? await moved(page, before, /^drawer-/) : null;
await check(!slides || (!slid.missing && slid.groups.filter((g) => g.startsWith("drawer-")).length >= 2), slides ? "a drawer slides open, and the drawers below it slide down" : "a browser without the view transitions the slide takes: the drawers change at once", slid);
await boxes(["✓ Loaded Image open", "2 Processing open", "3 Ground Truth Tasks folded"], "its title opens a folded drawer, done: Loaded Image");
await title(0);
await boxes(["✓ [img] " + name + "2D folded", "2 Processing open", "3 Ground Truth Tasks folded"], "and folds it again");
// a folded drawer opens from anywhere on it, not only its title: a click at the far end of its row; an open one folds
// only from its title
const rowEnd = async (k) => { const r = await page.locator("#left > .box.foldable:visible > .sec-head").nth(k).boundingBox();
  await page.mouse.click(r.x + r.width - 4, r.y + r.height / 2); await page.waitForFunction(() => !document.documentElement.hasAttribute("data-drawers")); };
await rowEnd(2);
await boxes(["✓ [img] " + name + "2D folded", "2 Processing open", "3 Ground Truth Tasks open"], "a click anywhere on a folded drawer opens it");
await rowEnd(2);
await boxes(["✓ [img] " + name + "2D folded", "2 Processing open", "3 Ground Truth Tasks open"], "a click beside an open drawer's title leaves it open");
await title(2);
await page.click("#fx-count");
await page.waitForFunction(() => /pixels/.test(document.querySelector("#fx-result").textContent));
await boxes(["✓ [img] " + name + "2D folded", "✓ Counted at 100 folded", "3 Ground Truth Tasks open"],
  "Count done: Processing folds to the study's summary of it, and Ground Truth Tasks opens");
await title(1);
await boxes(["✓ [img] " + name + "2D folded", "✓ Processing open", "3 Ground Truth Tasks open"], "a done drawer open names itself");
await title(1);
await loadImage();
await boxes(["✓ [img] " + name + "2D folded", "2 Processing open", "3 Ground Truth Tasks folded"], "another image starts over: the study's drawers wait again");
await title(0); await page.click("#unload");
await page.waitForFunction(() => document.querySelector("#unload").hidden && [...document.querySelectorAll("#left > .box.foldable")].filter((b) => b.checkVisibility()).length === 3);
await boxes(["1 Load Image open", "2 Processing folded", "3 Ground Truth Tasks folded"], "Unload: every drawer waits again, as at first");

// req/shell/left-bar/static: the bar stays open, with no chevron, no Steps label or strip, and the gutter only resizes it
const left = () => page.evaluate(() => Math.round(document.querySelector("#left").getBoundingClientRect().width));
const settled = () => page.waitForFunction(() => !document.getAnimations().some((a) => a.transitionProperty === "grid-template-columns"));
const gone = await page.evaluate(() => ({ parts: ["#left-collapse", "#left-strip", "#left-head", "#left-expand", "#left-marks"].filter((s) => document.querySelector(s)),
  steps: [...document.querySelectorAll("#left *")].filter((e) => e.children.length === 0 && e.textContent.trim() === "Steps").length }));
await check(!gone.parts.length && !gone.steps, "the left bar has no chevron, no Steps label and no strip", gone);
const gutter = await page.evaluate(() => ({ w: Math.round(document.querySelector("#gutter-left").getBoundingClientRect().width), holds: document.querySelector("#gutter-left").children.length }));
await check(gutter.holds === 0 && gutter.w <= 12, "the gutter holds no tab, only the resize handle", gutter);
const drag = async (to) => { const g = await page.locator("#gutter-left").boundingBox(); await page.mouse.move(g.x + g.width / 2, g.y + 100); await page.mouse.down();
  for (const x of to) await page.mouse.move(x, g.y + 100, { steps: 4 }); await page.mouse.up(); await settled(); };
const barLeft = await page.evaluate(() => Math.round(document.querySelector("#left").getBoundingClientRect().left));
await drag([barLeft + 150, barLeft + 20]);
await check((await left()) >= 190, "dragging the gutter to the edge stops at the bar's narrowest, never collapsing it", await left());
await drag([barLeft + 280]);
await check(Math.abs((await left()) - 280) <= 14, "and it drags wider again", await left());
// a drag moves the columns with the pointer, the image view beside them too: no motion lags behind it
{
  const g = await page.locator("#gutter-left").boundingBox(), y = g.y + 100;
  await page.mouse.move(g.x + g.width / 2, y); await page.mouse.down();
  await page.mouse.move(barLeft + 340, y);
  const mid = await page.evaluate(() => ({ w: Math.round(document.querySelector("#left").getBoundingClientRect().width),
    moving: document.getAnimations().filter((a) => a.transitionProperty === "grid-template-columns").length }));
  await page.mouse.up();
  await check(!mid.moving && Math.abs(mid.w - 340) <= 14, "mid-drag the bar is already where the pointer is, with nothing animating", mid);
}
await done(0);
