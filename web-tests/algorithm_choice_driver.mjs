// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from ANSWERS
// (tests/test_study_runs.py) and counting one pixel more for the "from" algorithm, and checks the study's algorithms
// atop its Processing box (req/shell/processing/algorithms): the list its study.json names, the first chosen, each
// with its icon, title and precision and recall where measured; how the chosen one works and how well it did; the
// study running the one chosen; and a study with no algorithms showing none. Exits 1 on a failed check, 2 when it
// cannot run.
//   node web-tests/algorithm_choice_driver.mjs ANSWERS IMAGE.png STUDIES
import { EARLY } from "./early_messages.mjs";
import { createRequire } from "node:module";
import { execFileSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { repoFile } from "./repo_file.mjs";
import { offSite } from "./off_site.mjs";
import { ENGINE, LAUNCH } from "./engine.mjs";
import { asTagger } from "./tagger.mjs";
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
  else if (m.type === "call") { const b = bytes(A.mask); postMessage({ type: "result", action: m.action, meta: { ...A.count, count: A.count.count + (m.args.algorithm === "from" ? 1 : 0) }, bytes: b, echo: m.echo }, [b.buffer]); }
};`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(EARLY + STAND_IN); }
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
const page = await ctx.newPage();
page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
page.setDefaultTimeout(10000);
await page.goto(origin + "/web/fixture");
await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));

const listed = JSON.parse(execFileSync("python3", ["py/menu.py"], { cwd: path.join(repo, "studies", "fixture"), encoding: "utf8" }));
const [first, second] = listed.algorithms;
await page.waitForFunction(() => !document.querySelector("#algorithm").disabled);
const seen = () => page.evaluate(() => {
  const sel = document.querySelector("#algorithm"), note = document.querySelector("#algorithm-note"), box = document.querySelector("#processing-box");
  return { options: [...sel.options].map((o) => [o.value, o.textContent]), value: sel.value, tip: sel.title,
    top: box.querySelector(":scope > :not(.sec-head)") === document.querySelector("#algorithm-pick"), shown: !document.querySelector("#algorithm-pick").hidden,
    about: document.querySelector("#algorithm-about summary").textContent, items: [...note.querySelectorAll("li")].map((l) => l.firstChild.textContent),
    bold: note.querySelector("strong")?.textContent || "", last: note.lastElementChild?.textContent || "" };
});
let s = await seen();
await check(s.shown && s.top, "the study's algorithms are the first thing in its Processing box", s);
await check(JSON.stringify(s.options) === JSON.stringify([[first.key, `${first.icon} ${first.title} (P\u00a0.90\u00a0·\u00a0R\u00a0.80)`], [second.key, `${second.icon} ${second.title}`]]),
  "each algorithm is listed with its icon and title, its precision and recall where measured", s.options);
await check(s.value === first.key, "the first in the study's list is chosen at first", s.value);
await check(s.tip === `Precision (P) and recall (R) of each algorithm ${listed.measured}`, "the list's tooltip says what they were measured on", s.tip);
await check(s.about === `How the ${first.title} algorithm works` && s.items.join("|") === "Count every pixel brighter than the threshold|none equal to it",
  "How the algorithm works gives the chosen one's steps as a nested list", s);
await check(s.bold === `Above algorithm shows precision of 0.90 and recall of 0.80 ${listed.measured}` && s.last.endsWith(`(${first.note})`),
  "... ending in bold with its precision and recall, its note beside it", s);

await page.setInputFiles("#file", image);
await page.waitForFunction(() => document.querySelector("#status").textContent === "Image loaded." && !document.querySelector("#fx-count").disabled);
await check(await page.evaluate(() => document.querySelector("#algorithm").checkVisibility()), "an image open, Processing opens with the list on show");
await page.click("#fx-count");
await page.waitForFunction(() => /pixels/.test(document.querySelector("#fx-result").textContent));
const once = await page.evaluate(() => document.querySelector("#fx-result").textContent);
// Processing folds once counted: opened again from its title
await page.click("#processing-box .sec-head h2"); await page.waitForFunction(() => !document.documentElement.hasAttribute("data-drawers"));
await page.selectOption("#algorithm", second.key);
s = await seen();
await check(s.about === `How the ${second.title} algorithm works` && !s.bold && s.items.length === 1, "another chosen: how it works is its own, with no precision and recall it never had", s);
await page.click("#fx-count");
await page.waitForFunction((was) => document.querySelector("#fx-result").textContent !== was, once);
const twice = await page.evaluate(() => document.querySelector("#fx-result").textContent);
await check(parseInt(twice) === parseInt(once) + 1 && twice.includes(second.title), "the study runs the algorithm chosen, and knows its title", [once, twice]);

await page.goto(origin + "/web/viewer");
await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));
await check(await page.evaluate(() => document.querySelector("#algorithm-pick").hidden), "a study offering no algorithms shows no list");
await done(0);
