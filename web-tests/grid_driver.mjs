// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from
// ANSWERS (tests/test_study_runs.py), and checks the grid: its button draws it and takes it away; a click or a
// hover opens the popup of its colour and spacing; the spacing is in µm with a scale, the cells square in µm
// on a pixel taller than wide, and in pixels without one, each kept apart; the grid stays on from one image to
// the next and through zoom; the choices outlive a reload and Manage storage lists them. Optional SHOTS: a
// directory for screenshots. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/grid_driver.mjs ANSWERS IMAGE.png STUDIES [SHOTS]
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
// each image opens with the scale the driver holds at that moment
onmessage = async ({ data: m }) => {
  if (m.type === "open") { const O = await (await fetch("answers.json")).json(), images = bytes(O.images); postMessage({ type: "opened", meta: O.opened, images }, [images.buffer]); }
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

// an image opened on the page; um: [width, height] of a pixel in µm, or nothing for a file without a scale
async function load(page, um) {
  scale = um || [null, null];
  await page.evaluate(() => { document.querySelector("#status").textContent = ""; });
  await page.setInputFiles("#file", image);
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Image loaded.");
  await page.mouse.move(5, 5);
}
// the grid as drawn: its cell in image pixels, its colour; null when none is drawn
const grid = (page) => page.evaluate(() => {
  const p = document.querySelector("#grid pattern"), line = p?.querySelector("path");
  return p && { w: +(p.getAttribute("width") / st.zoom).toFixed(3), h: +(p.getAttribute("height") / st.zoom).toFixed(3), colour: line.getAttribute("stroke") };
});
const pop = (page) => page.evaluate(() => {
  const el = document.querySelector("#grid-pop");
  return { open: el.matches(":popover-open"), unit: el.querySelector("#grid-unit").textContent, spacing: el.querySelector("#grid-spacing").value, colour: el.querySelector("#grid-colour").value };
});
const set = (page, sel, v) => page.evaluate(([sel, v]) => { const i = document.querySelector(sel); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); }, [sel, v]);
const openPop = async (page) => { await page.hover("#grid-btn"); await page.waitForFunction(() => document.querySelector("#grid-pop").matches(":popover-open")); };
const closePop = async (page) => { await page.mouse.move(700, 600); await page.keyboard.press("Escape"); await page.waitForFunction(() => !document.querySelector("#grid-pop").matches(":popover-open")); };

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
const page = await ctx.newPage();
page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
page.setDefaultTimeout(10000);
const start = async () => {
  await page.goto(origin + "/web/fixture");
  await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));
};
await start();

// a pixel 0.2 µm wide and 0.5 µm tall: 10 µm is 50 pixels across and 20 down
await load(page, [0.2, 0.5]);
await check(await grid(page) === null, "no grid until asked for");
await page.click("#grid-btn");
let g = await grid(page), p = await pop(page); await shot(page, "grid-on");
await check(g && g.w === 50 && g.h === 20, "the button draws a grid of square µm cells on a pixel taller than wide", g);
await check(p.open && p.unit === "µm", "the click opens the popup, its spacing in µm", p);
await set(page, "#grid-spacing", "5"); await set(page, "#grid-colour", "#00ff00");
g = await grid(page);
await check(g.w === 25 && g.h === 10 && g.colour === "#00ff00", "the popup's spacing and colour redraw the grid", g);
await closePop(page);
await page.hover("#grid-btn");
await page.waitForFunction(() => document.querySelector("#grid-pop").matches(":popover-open")).catch(() => {});
await check((await pop(page)).open, "hovering the button opens the popup");
await page.mouse.move(700, 600);
await page.waitForFunction(() => !document.querySelector("#grid-pop").matches(":popover-open")).catch(() => {});
await check(!(await pop(page)).open, "moving away from the button and the popup closes it");
await closePop(page);
await page.click("#zoom-in");
g = await grid(page);
await check(g.w === 25 && g.h === 10, "zoom keeps the grid's spacing on the image", g);
await closePop(page);

// a file without a scale: the spacing is in pixels, its own setting, and the grid stays on
await load(page);
await openPop(page);
g = await grid(page); p = await pop(page);
await check(g && g.w === g.h && p.unit === "px" && p.spacing !== "5", "without a scale the grid stays on, its spacing in pixels and kept apart from the µm one", { g, p });
await set(page, "#grid-spacing", "20");
g = await grid(page);
await check(g.w === 20 && g.h === 20, "a spacing in pixels draws square pixel cells", g);
await load(page, [0.2, 0.5]);
g = await grid(page);
await check(g.w === 25 && g.h === 10, "back on a scale, the µm spacing is the one chosen for it", g);

await page.click("#grid-btn"); await closePop(page);
await check(await grid(page) === null && await page.getAttribute("#grid-btn", "aria-pressed") === "false", "the button again takes the grid away");

// the choices outlive a reload
await start(); await load(page, [0.2, 0.5]);
await page.click("#grid-btn");
g = await grid(page); p = await pop(page);
await check(g.w === 25 && g.colour === "#00ff00" && p.spacing === "5" && p.colour === "#00ff00", "the colour and spacing are kept for the next visit", { g, p });
await closePop(page);
await page.click("#sb-disk");
await page.waitForFunction(() => document.querySelector("#storage-list .entry"));
const listed = await page.evaluate(() => [...document.querySelectorAll("#storage-list .entry")].map((e) => e.dataset.name));
await check(listed.includes("Grid colour and spacing"), "Manage storage lists the grid's settings", listed);
await done(0);
