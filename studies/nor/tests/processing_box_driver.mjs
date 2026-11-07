// Drives the page (web/) in headless Chromium with a stand-in worker that answers only the study's ready() (READY,
// written by tests/test_processing_box.py), and checks the Processing box before any image: its settings and its
// algorithm note start folded; the filters and their presets have a fold of their own after the settings, which starts
// folded and is kept from a Viewer, and no box of their own follows it; each finder in the list carries its icon; the note's title names the chosen
// algorithm, its explanation is drawn as a nested list of steps, and it gives in bold its precision and recall with its
// default filters, as the list shows them, with those before any filter after them, not bold. Prints what it saw; exits 1 on a failure, 2
// when it cannot run.
//   node tests/processing_box_driver.mjs READY
import { EARLY } from "../../../web-tests/early_messages.mjs";
import { repoFile } from "../../../web-tests/repo_file.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { offSite } from "../../../web-tests/off_site.mjs";
import { ENGINE, LAUNCH } from "../../../web-tests/engine.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [ready] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const READY = JSON.parse(fs.readFileSync(ready, "utf8"));
const QUALITY = JSON.parse(fs.readFileSync(path.join(repo, "studies", "nor", "web", "finder_metrics.json"), "utf8"));

const STAND_IN = `postMessage({ type: "ready", info: ${JSON.stringify(READY)}, secs: 0 });`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(EARLY + STAND_IN); }
  const f = repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw[ENGINE].launch(LAUNCH);
const problems = [];
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.route(offSite(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
const page = await ctx.newPage();
page.on("pageerror", (e) => problems.push("page error: " + e.message));
page.setDefaultTimeout(10000);
try {
  await page.goto(origin + "/web/index.html?study=nor");
  await page.waitForFunction(() => document.querySelector("#finder")?.disabled === false);
  // the list's numbers arrive with the study's measured quality
  await page.waitForFunction(() => /\(P\s/.test(document.querySelector("#finder").options[0].textContent));
  const folds = await page.evaluate(() => ({ settings: document.querySelector("#settings-box").open, about: document.querySelector("#about-box").open }));
  console.log("folds", JSON.stringify(folds));
  if (folds.settings) problems.push("Settings starts open");
  if (folds.about) problems.push("the algorithm's note starts open");
  // the box is folded until an image opens, so it is unfolded here to see what a Viewer would see in it
  const filters = await page.evaluate(() => {
    const box = document.querySelector("#processing-box"), folded = box.classList.contains("folded"); box.classList.remove("folded"); set = document.querySelector("#settings-box"), fold = document.querySelector("#filters-fold");
    const f = document.querySelector("#filters"), p = document.querySelector("#presets");
    const got = { fold: !!fold && fold.matches("details.fold") && box.contains(fold) && fold.contains(f) && fold.contains(p),
      title: fold && fold.querySelector(":scope > summary").textContent.trim(), open: !!fold && fold.open, count: f ? f.children.length : 0,
      afterSettings: !!fold && !set.contains(fold) && !!(set.compareDocumentPosition(fold) & Node.DOCUMENT_POSITION_FOLLOWING),
      kept: !!fold && getComputedStyle(fold).display === "none" && getComputedStyle(set).display !== "none",
      boxes: [...document.querySelectorAll("#left > .box .sec-head h2")].map((h) => h.textContent.trim()) };
    box.classList.toggle("folded", folded);
    return got;
  });
  console.log("filters", JSON.stringify(filters));
  if (!filters.fold) problems.push("the filters and their presets are not a fold of their own in the Processing box");
  if (filters.title !== "Filters") problems.push(`the filters' fold is titled "${filters.title}", not "Filters"`);
  if (filters.open) problems.push("Filters starts open");
  if (!filters.afterSettings) problems.push("the filters' fold does not follow Settings");
  if (!filters.count) problems.push("no filter is listed");
  if (!filters.kept) problems.push("a Viewer sees the filters, or does not see Settings");
  if (filters.boxes.some((b) => b.endsWith("Postprocessing"))) problems.push("the left bar still has a Postprocessing box");

  const options = await page.evaluate(() => [...document.querySelector("#finder").options].map((o) => [o.value, o.textContent]));
  console.log("options", JSON.stringify(options));
  if (options.length !== Object.keys(READY.finders).length) problems.push(`the list shows ${options.length} of ${Object.keys(READY.finders).length} finders`);
  let nested = 0;
  for (const [k, text] of options) {
    const icon = READY.about[k].icon;
    if (!icon || !text.startsWith(icon + " " + READY.finders[k])) problems.push(`${k} in the list does not start with its icon: ${text}`);
    // the box is folded until an image opens, so the choice is made as the list would make it
    await page.evaluate((k) => { const s = document.querySelector("#finder"); s.value = k; s.dispatchEvent(new Event("change")); }, k);
    await page.waitForFunction((n) => document.querySelector("#about-box summary").textContent.includes(n) && document.querySelector("#finder-note strong"), READY.finders[k]).catch(() => {});
    const note = await page.evaluate(() => {
      const n = document.querySelector("#finder-note"), sel = document.querySelector("#finder");
      return {
        title: document.querySelector("#about-box summary").textContent, nested: !!n.querySelector("li > ul > li, li > ol > li"),
        text: n.textContent, strong: n.querySelector("strong")?.textContent, line: n.querySelector("strong")?.parentElement.textContent, raw: /(^|\n)\s*- /.test(n.innerText), option: sel.selectedOptions[0].textContent,
      };
    });
    console.log(k, JSON.stringify(note));
    if (note.nested) nested++;
    if (note.title !== `How the ${READY.finders[k]} algorithm works`) problems.push(`${k}: the note's title does not name the algorithm: ${note.title}`);
    if (note.raw) problems.push(`${k}: the note shows its list's markup instead of a list`);
    // the bold line gives the finder with its default filters, as the list does; the finder alone follows, not bold
    const def = QUALITY.finders[k].filtered.balanced, own = QUALITY.finders[k].finder, n = QUALITY.images.length;
    const [, lp, lr] = note.option.match(/\(P\s(\.\d+)\s·\sR\s(\.\d+)\)/) || [];
    if (+lp !== +def.precision.toFixed(2) || +lr !== +def.recall.toFixed(2)) problems.push(`${k}: the list's ${lp}, ${lr} are not its default filters' ${def.precision}, ${def.recall}`);
    const name = READY.finders[k][0].toUpperCase() + READY.finders[k].slice(1);
    const bold = `${name} algorithm plus default filters show precision of ${def.precision.toFixed(2)} and recall of ${def.recall.toFixed(2)} based on ${n} image${n > 1 ? "s" : ""}`;
    const plain = `(without filters: precision of ${own.precision.toFixed(2)} and recall of ${own.recall.toFixed(2)})`;
    if (note.strong !== bold) problems.push(`${k}: the bold line reads "${note.strong}", not "${bold}"`);
    if (!note.line || note.line.replace(/\s+/g, " ") !== `${bold} ${plain}`) problems.push(`${k}: the numbers' line reads "${note.line}", not "${bold} ${plain}"`);
  }
  if (!nested) problems.push("no finder's note draws a step with steps of its own");
} catch (e) {
  problems.push(e.stack || String(e));
}
await browser.close(); server.close();
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);
