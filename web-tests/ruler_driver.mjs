// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from
// ANSWERS (tests/test_study_runs.py) and the pixel size SCALE gives, and checks the ruler: dragging shows the
// reach as a circle, the drop leaves the ruler alone with its distance, in µm from the pixel's width and height
// each on its own axis or in pixels without a scale; a click measures nothing; the image pans once the ruler
// is down; zoom keeps it on its points; the button again, or another image, takes it away. Optional SHOTS: a
// directory for screenshots. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/ruler_driver.mjs ANSWERS IMAGE.png STUDIES [SHOTS]
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
const [answers, image, studies, shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STAND_IN = `
const A = await (await fetch("answers.json")).json();
const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
postMessage({ type: "ready", info: A.ready.fixture, heap: 0, files: 0 });
onmessage = ({ data: m }) => {
  if (m.type === "open") { const images = bytes(A.images); postMessage({ type: "opened", meta: A.opened, images }, [images.buffer]); }
};`;
let scale = [null, null]; // the pixel's width and height in µm the image opens with, null for a file without a scale
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  if (u === "/web/vendor/wheels.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end("[]"); }
  if (u === "/web/answers.json") {
    const A = JSON.parse(fs.readFileSync(answers));
    r.writeHead(200, { "content-type": "application/json" });
    return r.end(JSON.stringify({ ...A, opened: { ...A.opened, um: scale[0], um_y: scale[1] } }));
  }
  const f = u === "/web/studies.json" ? studies : repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch();
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what, seen) => { if (!ok) { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); } console.log("ok: " + what); };
const shot = async (page, name) => { if (shots) await page.locator("#view").screenshot({ path: path.join(shots, name + ".png") }); };

// the page on the fixture with an image open; um: [width, height] of a pixel in µm, or nothing for a file without a scale
async function open(um) {
  scale = um || [null, null];
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  const page = await ctx.newPage();
  page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/fixture");
  await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));
  await page.setInputFiles("#file", image);
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Image loaded.");
  return page;
}
// where an image point is on the screen
const screen = (page, x, y) => page.evaluate(([x, y]) => {
  const r = document.querySelector("#base").getBoundingClientRect();
  return [r.left + x * st.zoom, r.top + y * st.zoom];
}, [x, y]);
const ruler = (page) => page.evaluate(() => ({
  pressed: document.querySelector("#ruler-btn").getAttribute("aria-pressed"),
  circles: document.querySelectorAll("#ruler circle").length, paths: document.querySelectorAll("#ruler path").length,
  text: document.querySelector("#ruler text")?.textContent ?? null,
  // the ruler's ends, back in image pixels
  ends: (() => { const d = document.querySelector("#ruler path")?.getAttribute("d"); if (!d) return null; return d.match(/-?[\d.]+/g).slice(0, 4).map((v) => Math.round(+v / st.zoom)); })(),
}));
// zoomed in n steps, the image's top left corner in view
async function zoomIn(page, n) {
  for (let k = 0; k < n; k++) await page.click("#zoom-in");
  await page.evaluate(() => document.querySelector("#scroller").scrollTo(0, 0));
}
async function measure(page, [x1, y1], [x2, y2], during) {
  const a = await screen(page, x1, y1), b = await screen(page, x2, y2);
  await page.mouse.move(...a); await page.mouse.down();
  await page.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { steps: 3 }); await page.mouse.move(...b, { steps: 3 });
  if (during) await during();
  await page.mouse.up();
}

// a pixel 0.2 µm wide and 0.5 µm tall: 30 px across and 20 down is 6 µm by 10 µm, 11.7 µm
{
  const page = await open([0.2, 0.5]);
  // in far enough that the image is larger than the view, so a drag that is not a measure would pan it
  await zoomIn(page, 8);
  await page.click("#ruler-btn");
  await check((await ruler(page)).pressed === "true", "the Ruler button arms the ruler");
  const scroll = await page.evaluate(() => [document.querySelector("#scroller").scrollLeft, document.querySelector("#scroller").scrollTop]);
  // up and to the left from the corner in view: the way a drag that slipped through to the pan would scroll
  await measure(page, [40, 30], [10, 10], async () => {
    const r = await ruler(page); await shot(page, "ruler-dragging");
    await check(r.circles > 0 && r.text === "11.7 µm", "dragging shows the reach as a circle and the distance so far", r);
  });
  let r = await ruler(page); await shot(page, "ruler-dropped");
  await check(r.circles === 0 && r.paths > 0 && r.text === "11.7 µm", "the drop leaves the ruler, not the circle, with its distance from each axis's own pixel size", r);
  await check(r.ends.join() === "40,30,10,10", "the ruler lies between the two points", r.ends);
  const after = await page.evaluate(() => [document.querySelector("#scroller").scrollLeft, document.querySelector("#scroller").scrollTop]);
  await check(after.join() === scroll.join(), "measuring does not pan the image", [scroll, after]);

  await zoomIn(page, 1);
  r = await ruler(page);
  await check(r.ends.join() === "40,30,10,10" && r.text === "11.7 µm", "zoom keeps the ruler on its points", r);

  // once down, a drag pans again and leaves the ruler as it is
  const sc = await page.evaluate(() => document.querySelector("#scroller").getBoundingClientRect().toJSON());
  const before = await page.evaluate(() => document.querySelector("#scroller").scrollLeft);
  await page.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2); await page.mouse.down();
  await page.mouse.move(sc.x + sc.width / 2 - 60, sc.y + sc.height / 2, { steps: 5 }); await page.mouse.up();
  const panned = await page.evaluate(() => document.querySelector("#scroller").scrollLeft);
  r = await ruler(page);
  await check(panned !== before && r.text === "11.7 µm" && r.circles === 0, "with the ruler down, dragging pans the image and keeps the ruler", { before, panned, r });

  await page.click("#ruler-btn");
  r = await ruler(page);
  await check(r.pressed === "false" && r.paths === 0 && r.text === null, "the Ruler button again takes the ruler away", r);

  // a click is no measure: the ruler stays armed with nothing on the image
  await page.click("#ruler-btn");
  await page.evaluate(() => document.querySelector("#scroller").scrollTo(0, 0));
  const p = await screen(page, 20, 20); await page.mouse.click(...p);
  r = await ruler(page);
  await check(r.pressed === "true" && r.paths === 0, "a click with no drag measures nothing and keeps the ruler armed", r);

  await measure(page, [10, 10], [40, 30]);
  await page.evaluate(() => { document.querySelector("#status").textContent = ""; });
  await page.setInputFiles("#file", image);
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Image loaded.");
  r = await ruler(page);
  await check(r.pressed === "false" && r.paths === 0, "another image takes the ruler away", r);
}

// a file without a scale: the same ruler is 36.1 px
{
  const page = await open();
  await page.click("#ruler-btn");
  await measure(page, [10, 10], [40, 30]);
  const r = await ruler(page);
  await check(r.text === "36.1 px", "without a scale the distance is in pixels", r);
}
await done(0);
