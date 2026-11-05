// Drives the page (web/) in headless Chromium, with a worker that never answers, and checks
// req/shell/dialogs/open-from-button: a dialog a button opens starts at that button's place and size and grows to its
// own; one opened with nothing pressed, or with animations off or reduced motion asked for, appears at once.
// Optional SHOTS: a directory for a screenshot of the first frame. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/dialog_motion_driver.mjs [SHOTS]
import { repoFile } from "./repo_file.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { offSite } from "./off_site.mjs";
import { ENGINE, LAUNCH } from "./engine.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(""); }
  if (u === "/web/version_history.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end("[]"); }
  const f = repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw[ENGINE].launch(LAUNCH);
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what, seen) => { if (!ok) { console.error("FAILED: " + what + (seen ? " " + JSON.stringify(seen) : "")); await done(1); } console.log("ok: " + what); };

// clock: the page's clock made one the test can move past the page's own time windows; it runs as the real one does
async function open({ motion = true, reducedMotion = "no-preference", clock = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, reducedMotion });
  if (clock) await ctx.clock.install();
  await ctx.route(offSite(origin), (r) => r.abort());
  await ctx.addInitScript((motion) => {
    delete Navigator.prototype.serviceWorker;
    localStorage.setItem("nor-motion", JSON.stringify(motion));
  }, motion);
  const page = await ctx.newPage();
  page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/index.html");
  await page.waitForFunction(() => $("#sb-version").textContent);
  return { ctx, page };
}
// the dialog's animations, frozen at their start: where it is drawn then, where it ends, and where the button is
// (the motion starts in the frame after the dialog opens, which a loaded machine may not have drawn yet)
const firstFrame = (page, dlg, btn) => page.evaluate(async ([dlg, btn]) => {
  const d = document.querySelector(dlg);
  if (!d.getAnimations().length) await new Promise((r) => requestAnimationFrame(() => r()));
  const all = d.getAnimations({ subtree: true });
  const box = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height });
  all.forEach((a) => { a.pause(); a.currentTime = 0; });
  const start = box(d.getBoundingClientRect());
  return { open: d.open, count: all.length, running: all.filter((a) => !a.pseudoElement).length, opacity: +getComputedStyle(d).opacity,
    start, button: box(document.querySelector(btn).getBoundingClientRect()) };
}, [dlg, btn]);
const near = (a, b, by = 2) => Math.abs(a - b) <= by;
const resume = (page, dlg) => page.evaluate((dlg) => document.querySelector(dlg).getAnimations({ subtree: true }).forEach((a) => a.finish()), dlg);

// ---- a button opens its dialog out of itself ----
{
  const { ctx, page } = await open({ clock: true });
  // the history arrives once, and the dialog grows with it: let that happen first
  await page.evaluate(() => { $("#sb-version").click(); $("#history-dlg").close(); });
  await page.waitForFunction(() => !/Loading/.test($("#history-list").textContent));
  // Version history fills in at once, so it starts exactly as big as its button; Resource Usage fills in a moment
// later, past the frame its motion starts in, so it starts only about that big
for (const [btn, dlg, what, by] of [["#sb-version", "#history-dlg", "Version history", 1.02], ["#sb-res-icon", "#usage-dlg", "Resource Usage", 1.5]]) {
    await page.click(btn);
    const f = await firstFrame(page, dlg, btn);
    await check(f.open && f.running >= 1, `${btn} opens ${what}, animated`, f);
    await check(near(f.start.x, f.button.x) && near(f.start.y, f.button.y), `${what} starts centred on its button`, f);
    const about = (a, b) => a >= b / by && a <= b * by;
    await check(about(f.start.w, f.button.w) && about(f.start.h, f.button.h), `and as big as the button`, f);
    await check(f.opacity < 0.05, `and faded out`, f);
    if (shots) await page.screenshot({ path: path.join(shots, dlg.slice(1) + "_first_frame.png") });
    await resume(page, dlg);
    const last = await page.evaluate((dlg) => { const d = document.querySelector(dlg), r = d.getBoundingClientRect(); return { w: r.width, h: r.height, ow: d.offsetWidth, oh: d.offsetHeight, n: d.getAnimations({ subtree: true }).length }; }, dlg);
    await check(near(last.w, last.ow) && near(last.h, last.oh) && last.n === 0, `then grows to its own size and stops`, last);
    await page.keyboard.press("Escape");
  }
  // a button that opens nothing, pressed over a second ago, does not lend the dialog its place
  await page.click("#theme"); await page.click("#theme");
  // past the second after a click in which the page takes a dialog opening as that click's (web/dialog_motion.js)
  await ctx.clock.fastForward(1200);
  await page.evaluate(() => $("#history-dlg").showModal());
  const f = await firstFrame(page, "#history-dlg", "#sb-version");
  await check(f.open && f.count === 0, "a dialog opened with nothing pressed lately appears at once", f);
  await ctx.close();
}

// ---- animations off, or reduced motion asked for: at once ----
for (const [opts, what] of [[{ motion: false }, "with animations off"], [{ reducedMotion: "reduce" }, "with reduced motion asked for"]]) {
  const { ctx, page } = await open(opts);
  await page.click("#sb-version");
  const f = await firstFrame(page, "#history-dlg", "#sb-version");
  await check(f.open && f.count === 0, `${what}, Version history appears at once`, f);
  await ctx.close();
}
await done(0);
