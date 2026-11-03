// Drives the page (web/) in headless Chromium with a stand-in worker that answers only the study's ready() (READY,
// written by tests/test_processing_box.py), and checks the Processing box before any image: its settings and its
// algorithm note start folded; each finder in the list carries its icon; the note's title names the chosen
// algorithm, its explanation is drawn as a nested list of steps, and it highlights its precision and recall after the
// filters, as the list shows them, with those before any filter beside them. Prints what it saw; exits 1 on a failure, 2
// when it cannot run.
//   node tests/processing_box_driver.mjs READY
import { repoFile } from "../../../web-tests/repo_file.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { offSite } from "../../../web-tests/off_site.mjs";
import { ENGINE } from "../../../web-tests/engine.mjs";

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
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  const f = repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw[ENGINE].launch();
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
        text: n.textContent, strong: n.querySelector("strong")?.textContent, raw: /(^|\n)\s*- /.test(n.innerText), option: sel.selectedOptions[0].textContent,
      };
    });
    console.log(k, JSON.stringify(note));
    if (note.nested) nested++;
    const name = READY.finders[k];
    if (note.title !== `How the ${name} algorithm works`) problems.push(`${k}: the note's title does not name the algorithm: ${note.title}`);
    if (note.raw) problems.push(`${k}: the note shows its list's markup instead of a list`);
    // the highlighted numbers are the list's, after the best filter preset, with the finder's own before any filter
    const [, lp, lr] = note.option.match(/\(P\s(\.\d+)\s·\sR\s(\.\d+)\)/) || [];
    const own = QUALITY.finders[k].finder, m = (note.strong || "").match(/^Algorithm and filters give P:\s([\d.]+), R:\s([\d.]+) based on (\d+) images? \(without filters P:\s([\d.]+), R:\s([\d.]+)\)$/);
    if (!m) problems.push(`${k}: the note does not highlight "Algorithm and filters give P, R based on N images (without filters P, R)": ${note.strong}`);
    else if (+m[1] !== +lp || +m[2] !== +lr || +m[3] !== QUALITY.images.length || +m[4] !== +own.precision.toFixed(2) || +m[5] !== +own.recall.toFixed(2))
      problems.push(`${k}: the highlighted numbers ${m.slice(1)} are not the list's ${lp}, ${lr} on ${QUALITY.images.length} images, without filters ${own.precision}, ${own.recall}`);
  }
  if (!nested) problems.push("no finder's note draws a step with steps of its own");
} catch (e) {
  problems.push(e.stack || String(e));
}
await browser.close(); server.close();
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);
