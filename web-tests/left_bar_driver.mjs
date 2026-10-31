// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from
// ANSWERS (tests/test_study_runs.py), and checks that the left bar's boxes fold with the steps: Load Image
// open until an image opens; each study box opening after its step and folding again after the one it names;
// a box only its title opens staying folded; a title opening and closing its box; another image starting
// over. Exits 1 on a failed check, 2 when it cannot run.
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

// the left bar's boxes by title, each open or folded as the user sees it: its contents shown or not
const bar = () => page.evaluate(() => [...document.querySelectorAll("#left > .box.foldable")].map((b) => {
  const body = b.querySelector(":scope > :not(.sec-head)");
  return b.querySelector(".sec-head h2").textContent + (body && body.offsetParent ? " open" : " folded");
}));
const boxes = async (want, what) => { const b = await bar(); await check(b.join() === want.join(), what, b); };
const title = (name) => page.click(`#left > .box.foldable > .sec-head h2 >> text=${name}`);
// the status line is cleared first, so the wait is for this image's load, not the last one's
const loadImage = async () => {
  await page.evaluate(() => { document.querySelector("#status").textContent = ""; });
  await page.setInputFiles("#file", image);
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Image loaded." && !document.querySelector("#fx-count").disabled);
};

await boxes(["Load Image open", "Threshold folded", "Counted folded", "Notes folded"], "before an image only Load Image is open");
await loadImage();
await boxes(["Load Image folded", "Threshold open", "Counted folded", "Notes folded"], "an image open: Load Image folds, the box opening on it opens");
await title("Load Image");
await boxes(["Load Image open", "Threshold open", "Counted folded", "Notes folded"], "its title opens a folded box");
await title("Load Image");
await boxes(["Load Image folded", "Threshold open", "Counted folded", "Notes folded"], "and folds it again");
await page.click("#fx-count");
await page.waitForFunction(() => /pixels/.test(document.querySelector("#fx-result").textContent));
await boxes(["Load Image folded", "Threshold folded", "Counted open", "Notes folded"], "Count done: Threshold folds, Counted opens, Notes waits for its title");
await title("Notes");
await boxes(["Load Image folded", "Threshold folded", "Counted open", "Notes open"], "Notes opens from its title");
await loadImage();
await boxes(["Load Image folded", "Threshold open", "Counted folded", "Notes folded"], "another image starts over");
await done(0);
