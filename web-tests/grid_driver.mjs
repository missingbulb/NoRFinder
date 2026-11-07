// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from
// ANSWERS (tests/test_study_runs.py), and checks the grid: its button draws it and takes it away; a click or a
// hover opens the popup of its colour and spacing, under the button, by the browser's interest invoker or, in a
// browser without one, the page's own hover and focus; the spacing is in µm with a scale, the cells square in µm
// on a pixel taller than wide, and in pixels without one, each kept apart; the grid stays on from one image to
// the next and through zoom; the choices outlive a reload and Settings lists them. Optional SHOTS: a
// directory for screenshots. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/grid_driver.mjs ANSWERS IMAGE.png STUDIES [SHOTS]
import { scaledImage } from "./scaled_image.mjs";
import { EARLY } from "./early_messages.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { repoFile } from "./repo_file.mjs";
import { offSite } from "./off_site.mjs";
import { ENGINE, LAUNCH } from "./engine.mjs";
import { localStudy } from "./local_study.mjs";

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
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(EARLY + STAND_IN); }
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

const browser = await pw[ENGINE].launch(LAUNCH);
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what, seen) => { if (!ok) { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); } console.log("ok: " + what); };
const shot = async (page, name) => { if (shots) await page.locator("#view").screenshot({ path: path.join(shots, name + ".png") }); };

// an image opened on the page; um: [width, height] of a pixel in µm, or nothing for a file without a scale
async function load(page, um) {
  scale = um || [null, null];
  await page.evaluate(() => { document.querySelector("#status").textContent = ""; });
  await page.setInputFiles("#file", um ? scaledImage(answers, um) : image);
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
// whether the popup is open under its button, their right edges lined up and inside the window; seen: the numbers
const placed = (page, seen) => page.evaluate((seen) => {
  const p = $("#grid-pop").getBoundingClientRect(), b = $("#grid-btn").getBoundingClientRect();
  const m = { open: $("#grid-pop").matches(":popover-open"), gap: p.top - b.bottom, right: p.right - b.right, left: p.left, rightEdge: innerWidth - p.right };
  return seen ? m : m.open && m.gap >= 4 && m.gap <= 8 && Math.abs(m.right) <= 1 && m.left >= 0 && m.rightEdge >= 0;
}, !!seen);
const openPop = async (page) => { await page.hover("#grid-btn"); await page.waitForFunction(() => document.querySelector("#grid-pop").matches(":popover-open")); };
const closePop = async (page) => { await page.mouse.move(700, 600); await page.keyboard.press("Escape"); await page.waitForFunction(() => !document.querySelector("#grid-pop").matches(":popover-open")); };

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

await localStudy(ctx, "fixture");
await ctx.route(offSite(origin), (r) => r.abort());
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
// a pointer's hover, with nothing focused: closing by Escape left the button focused, which WebKit then counts as the
// keyboard's focus, and that keeps the popup open
await page.evaluate(() => document.activeElement.blur());
await page.hover("#grid-btn");
await page.waitForFunction(() => document.querySelector("#grid-pop").matches(":popover-open")).catch(() => {});
await check((await pop(page)).open, "hovering the button opens the popup");
await check(await page.evaluate(() => ("interestForElement" in HTMLButtonElement.prototype ? $("#grid-btn").interestForElement === $("#grid-pop") : !$("#grid-btn").hasAttribute("interestfor"))),
  "the browser's own hover where it has interest invokers, the button one for the popup; the page's own elsewhere");
await check(await placed(page), "the popup sits under its button, their right edges lined up", await placed(page, true));
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
await page.click("#user-menu summary"); await page.click("#open-settings");
await page.waitForFunction(() => document.querySelector("#settings-dlg").open);
const listed = await page.$$eval('#settings-dlg input[name="device-only"]', (is) => is.map((i) => i.closest("label").textContent));
await check(listed.some((t) => t.includes("Grid colour and spacing")), "Settings lists the grid's settings, kept on this device only", listed);

// a browser without interest invokers: the page's own hover opens and closes the popup, in the same place
{
  const old = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await localStudy(old, "fixture");
  await old.route(offSite(origin), (r) => r.abort());
  await old.addInitScript(() => { delete Navigator.prototype.serviceWorker; delete HTMLButtonElement.prototype.interestForElement; });
  const p2 = await old.newPage();
  p2.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
  await p2.goto(origin + "/web/fixture");
  await p2.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));
  await load(p2, [0.2, 0.5]);
  await check(!(await p2.evaluate(() => $("#grid-btn").hasAttribute("interestfor"))), "without interest invokers the button carries none");
  await p2.hover("#grid-btn");
  await p2.waitForFunction(() => document.querySelector("#grid-pop").matches(":popover-open")).catch(() => {});
  await check(await placed(p2), "hovering opens the popup under its button all the same", await placed(p2, true));
  await p2.mouse.move(700, 600);
  await p2.waitForFunction(() => !document.querySelector("#grid-pop").matches(":popover-open")).catch(() => {});
  await check(!(await pop(p2)).open, "and moving away closes it");
  await p2.focus("#grid-btn");
  await p2.waitForFunction(() => document.querySelector("#grid-pop").matches(":popover-open")).catch(() => {});
  await check((await pop(p2)).open, "focusing the button opens it too");
}
await done(0);
