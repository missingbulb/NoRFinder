// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from
// ANSWERS (tests/test_study_runs.py), and checks the left bar's drawers: stacked with no gap, numbered, the
// open one marked; folding with the steps (Load Image open until an image opens; the shell's Preprocessing open
// from then until the study's first step; each study drawer opening
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

const browser = await pw.chromium.launch();
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what, seen) => { if (!ok) { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); } console.log("ok: " + what); };

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
const page = await ctx.newPage();
page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
page.setDefaultTimeout(10000);
await page.goto(origin + "/web/fixture");
await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));

// the left bar's drawers as the user sees them: the step mark, the title (a picture in it as "[img]") and
// open or folded, by its contents shown or not
const bar = () => page.evaluate(() => [...document.querySelectorAll("#left > .box.foldable")].map((b) => {
  const body = b.querySelector(":scope > :not(.sec-head)"), h = b.querySelector(".sec-head h2");
  const mark = h.querySelector(".step-mark"), t = h.querySelector(".title");
  const text = [...(t?.querySelectorAll("img, canvas") || [])].map(() => "[img] ").join("") + (t ? t.textContent.trim() : h.textContent);
  return `${mark ? mark.textContent : "?"} ${text} ${body && body.offsetParent ? "open" : "folded"}`;
}));
const boxes = async (want, what) => { const b = await bar(); await check(b.join("|") === want.join("|"), what, b); };
const title = (k) => page.locator("#left > .box.foldable > .sec-head h2").nth(k).click();
// the status line is cleared first, so the wait is for this image's load, not the last one's
const loadImage = async () => {
  await page.evaluate(() => { document.querySelector("#status").textContent = ""; });
  await page.setInputFiles("#file", image);
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Image loaded." && !document.querySelector("#fx-count").disabled);
};
const name = path.basename(image);

// drawers, not boxes: each touches the one above it
const gaps = await page.evaluate(() => { const r = [...document.querySelectorAll("#left > .box.foldable")].map((b) => b.getBoundingClientRect());
  return r.slice(1).map((x, k) => Math.round(x.top - r[k].bottom)); });
await check(gaps.every((g) => g <= 0), "the drawers stack with no gap between them", gaps);
const bars = () => page.evaluate(() => [...document.querySelectorAll("#left > .box.foldable")].map((b) => getComputedStyle(b).boxShadow !== "none"));

await boxes(["1 Load Image open", "2 Preprocessing folded", "3 Threshold folded", "4 Counted folded", "5 Notes folded"], "before an image only Load Image is open, each drawer numbered");
await check((await bars()).join() === "true,false,false,false,false", "the open drawer, and only it, carries the accent bar", await bars());
await loadImage();
await boxes(["✓ [img] " + name + "2D folded", "2 Preprocessing open", "3 Threshold open", "4 Counted folded", "5 Notes folded"],
  "an image open: Load Image folds to its preview, name and what it holds, checked; the shell's Preprocessing and the drawer opening on it open");
await title(0);
await boxes(["✓ Loaded Image open", "2 Preprocessing open", "3 Threshold open", "4 Counted folded", "5 Notes folded"], "its title opens a folded drawer, done: Loaded Image");
await title(0);
await boxes(["✓ [img] " + name + "2D folded", "2 Preprocessing open", "3 Threshold open", "4 Counted folded", "5 Notes folded"], "and folds it again");
await page.click("#fx-count");
await page.waitForFunction(() => /pixels/.test(document.querySelector("#fx-result").textContent));
await boxes(["✓ [img] " + name + "2D folded", "2 Preprocessing folded", "✓ Counted at 100 folded", "4 Counted open", "5 Notes folded"],
  "Count done: Preprocessing folds after the study's first step, Threshold folds to the study's summary of it, Counted opens, Notes waits for its title");
await title(2);
await boxes(["✓ [img] " + name + "2D folded", "2 Preprocessing folded", "✓ Threshold open", "4 Counted open", "5 Notes folded"], "a done drawer open names itself");
await title(2);
await title(4);
await boxes(["✓ [img] " + name + "2D folded", "2 Preprocessing folded", "✓ Counted at 100 folded", "4 Counted open", "5 Notes open"], "Notes opens from its title");
await loadImage();
await boxes(["✓ [img] " + name + "2D folded", "2 Preprocessing open", "3 Threshold open", "4 Counted folded", "5 Notes folded"], "another image starts over: the study's drawers wait again");
await title(0); await page.click("#unload");
await page.waitForFunction(() => document.querySelector("#unload").hidden && document.querySelectorAll("#left > .box.foldable .step-mark").length === 5);
await boxes(["1 Load Image open", "2 Preprocessing folded", "3 Threshold folded", "4 Counted folded", "5 Notes folded"], "Unload: every drawer waits again, as at first");
await done(0);
