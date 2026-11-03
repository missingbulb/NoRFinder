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
import { ENGINE } from "./engine.mjs";

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

const browser = await pw[ENGINE].launch();
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what, seen) => { if (!ok) { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); } console.log("ok: " + what); };

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.route(offSite(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; localStorage.setItem("nor-role", "tagger"); });
const page = await ctx.newPage();
page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
page.setDefaultTimeout(10000);
await page.goto(origin + "/web/fixture");
await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));

// the left bar's drawers as the user sees them: the step mark, the title (a picture in it as "[img]") and
// open or folded, by its contents shown or not
// the drawers on show: Data Management's own are not, out of it
const bar = () => page.evaluate(() => [...document.querySelectorAll("#left > .box.foldable")].filter((b) => b.checkVisibility()).map((b) => {
  const body = b.querySelector(":scope > :not(.sec-head)"), h = b.querySelector(".sec-head h2");
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

await boxes(["1 Load Image open", "2 Threshold folded", "3 Counted folded", "4 Notes folded"], "before an image only Load Image is open, each drawer numbered");
await check((await bars()).join() === "true,false,false,false", "the open drawer, and only it, carries the accent bar", await bars());
await loadImage();
await boxes(["✓ [img] " + name + "2D folded", "2 Threshold open", "3 Counted folded", "4 Notes folded"],
  "an image open: Load Image folds to its preview, name and what it holds, checked, and the drawer opening on it opens");
// a drawer slides open or shut, and the drawers below slide to their new places
const slid = page.waitForFunction(() => document.getAnimations().filter((a) => /^::view-transition-group\(drawer-/.test(a.effect?.pseudoElement)).length >= 2).then(() => true, () => false);
await title(0);
// where the browser has the view transitions it takes; elsewhere the drawers change at once
const slides = await page.evaluate(() => !!document.startViewTransition && CSS.supports("view-transition-group", "contain"));
await check(!slides || await slid, slides ? "a drawer slides open, and the drawers below it slide down" : "a browser without the view transitions the slide takes: the drawers change at once");
await page.waitForFunction(() => !document.getAnimations().some((a) => a.effect?.pseudoElement?.startsWith("::view-transition")));
await boxes(["✓ Loaded Image open", "2 Threshold open", "3 Counted folded", "4 Notes folded"], "its title opens a folded drawer, done: Loaded Image");
await title(0);
await boxes(["✓ [img] " + name + "2D folded", "2 Threshold open", "3 Counted folded", "4 Notes folded"], "and folds it again");
await page.click("#fx-count");
await page.waitForFunction(() => /pixels/.test(document.querySelector("#fx-result").textContent));
await boxes(["✓ [img] " + name + "2D folded", "✓ Counted at 100 folded", "3 Counted open", "4 Notes folded"],
  "Count done: Threshold folds to the study's summary of it, Counted opens, Notes waits for its title");
await title(1);
await boxes(["✓ [img] " + name + "2D folded", "✓ Threshold open", "3 Counted open", "4 Notes folded"], "a done drawer open names itself");
await title(1);
await title(3);
await boxes(["✓ [img] " + name + "2D folded", "✓ Counted at 100 folded", "3 Counted open", "4 Notes open"], "Notes opens from its title");
await loadImage();
await boxes(["✓ [img] " + name + "2D folded", "2 Threshold open", "3 Counted folded", "4 Notes folded"], "another image starts over: the study's drawers wait again");
await title(0); await page.click("#unload");
await page.waitForFunction(() => document.querySelector("#unload").hidden && [...document.querySelectorAll("#left > .box.foldable")].filter((b) => b.checkVisibility()).length === 4);
await boxes(["1 Load Image open", "2 Threshold folded", "3 Counted folded", "4 Notes folded"], "Unload: every drawer waits again, as at first");

// req/shell/left-bar/collapse: the bar collapses to a narrow Steps strip and expands again, sliding, remembered
const left = () => page.evaluate(() => Math.round(document.querySelector("#left").getBoundingClientRect().width));
const viewW = () => page.evaluate(() => Math.round(document.querySelector("#view").getBoundingClientRect().width));
// the column's slide over: the grid's transition and the drawers' slide in done
const settled = () => page.waitForFunction(() => !document.getAnimations().some((a) => a.transitionProperty === "grid-template-columns" || a.animationName === "data-in"));
const wide = await left(), imageW = await viewW();
await check(await page.evaluate(() => document.querySelector("#data-col").getClientRects().length === 0), "no data manager: no sliver of the Data Management strip beside the bar");
const tab = await page.evaluate(() => { const t = document.querySelector("#left-collapse")?.getBoundingClientRect(), g = document.querySelector("#gutter-left").getBoundingClientRect();
  return t && { onGutter: t.left < g.right && t.right > g.left, middle: Math.abs((t.top + t.bottom) / 2 - (g.top + g.bottom) / 2) < 2, shown: t.width > 0 }; });
await check(tab?.onGutter && tab.middle && tab.shown, "the open bar's collapse tab sits on the gutter, at its middle", tab);
await page.click("#left-collapse");
await page.waitForTimeout(50); await settled();
await check((await left()) < 60, "collapsing leaves a narrow strip", await left());
await check((await viewW()) > imageW + 200, "and gives the image the room", [imageW, await viewW()]);
const strip = await page.evaluate(() => ({ label: document.querySelector("#left-strip .strip-name").textContent, vertical: getComputedStyle(document.querySelector("#left-strip .strip-name")).writingMode,
  marks: [...document.querySelectorAll("#left-marks .step-mark")].map((m) => m.textContent).join(),
  tab: document.querySelector("#left-collapse").checkVisibility(), drawers: [...document.querySelectorAll("#left > .box")].filter((b) => b.checkVisibility({ visibilityProperty: true })).length }));
await check(strip.label === "Steps" && strip.vertical === "vertical-rl" && strip.marks === "1,2,3,4" && !strip.tab && strip.drawers === 0,
  "the strip shows the step marks and Steps, upright, and hides the drawers and the tab", strip);
const g = await page.locator("#gutter-left").boundingBox();
await page.mouse.move(g.x + g.width / 2, g.y + 100); await page.mouse.down(); await page.mouse.move(g.x + 300, g.y + 100); await page.mouse.up();
await check((await left()) < 60, "a collapsed bar cannot be dragged wider", await left());
await page.reload();
await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));
await settled();
await check((await left()) < 60, "collapsed stays collapsed on the next visit", await left());
// expanding: the column slides out as Data Management's does, the drawers sliding in
const slideOut = () => page.waitForFunction(() => document.getAnimations().some((a) => a.transitionProperty === "grid-template-columns")
  && document.getAnimations().some((a) => a.animationName === "data-in" && a.effect?.target?.closest?.("#left"))).then(() => true, () => false);
let slid2 = slideOut();
await page.click("#left-strip .strip-name");
await check(await slid2, "clicking the strip slides the bar out and the drawers in");
await settled();
await page.waitForFunction(() => !document.querySelector("#left").classList.contains("sliding-in"));
await check((await left()) === wide, "expanding brings the bar back at its width", [wide, await left()]);
await boxes(["1 Load Image open", "2 Threshold folded", "3 Counted folded", "4 Notes folded"], "with its drawers as they were");
await page.click("#left-collapse");
await page.waitForTimeout(50); await settled();
await page.locator("#left-marks .step-mark").nth(2).click();
await settled();
await boxes(["1 Load Image open", "2 Threshold folded", "3 Counted open", "4 Notes folded"], "clicking a step mark expands the bar with that drawer open");
await done(0);
