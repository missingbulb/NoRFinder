// Drives the page (web/) in headless Chromium, with a worker that never answers, and checks
// req/shell/dialogs/open-from-button: a dialog a button opens is animated, and its motion ends with the dialog at its
// own size; one opened with nothing pressed, or with animations off or reduced motion asked for, appears at once.
// Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/dialog_motion_driver.mjs
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
    // each dialog's motions as the page makes them, and how many have ended, so a test asks only whether one ran
    window.dialogMotions = {};
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...a) {
      const x = animate.apply(this, a);
      if (this.localName === "dialog") {
        const m = (window.dialogMotions[this.id] ||= { made: 0, ended: 0 });
        m.made++; x.finished.then(() => m.ended++, () => m.ended++);
      }
      return x;
    };
  }, motion);
  const page = await ctx.newPage();
  page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/index.html");
  await page.waitForFunction(() => $("#sb-version").textContent);
  return { ctx, page };
}
// whether the dialog opened, and the motions made for it: the motion starts in the frame after it opens, so two
// frames on any it has are made
const opened = (page, dlg) => page.evaluate(async (dlg) => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const d = document.querySelector(dlg);
  return { open: d.open, ...(window.dialogMotions[d.id] || { made: 0, ended: 0 }) };
}, dlg);
const near = (a, b, by = 2) => Math.abs(a - b) <= by;

// ---- a button opens its dialog out of itself ----
{
  const { ctx, page } = await open({ clock: true });
  // the history arrives once, and the dialog grows with it: let that happen first
  await page.evaluate(() => { $("#sb-version").click(); $("#history-dlg").close(); });
  await page.waitForFunction(() => !/Loading/.test($("#history-list").textContent));
  // its motion runs and ends with the dialog at its own size; how it looks on the way is not checked
  for (const [btn, dlg, what] of [["#sb-version", "#history-dlg", "Version history"], ["#sb-res-icon", "#usage-dlg", "Resource Usage"]]) {
    await page.click(btn);
    const f = await opened(page, dlg);
    await check(f.open && f.made >= 1, `${btn} opens ${what}, animated`, f);
    await page.waitForFunction((id) => { const m = window.dialogMotions[id]; return m && m.ended === m.made; }, dlg.slice(1));
    const last = await page.evaluate((dlg) => { const d = document.querySelector(dlg), r = d.getBoundingClientRect(); return { w: r.width, h: r.height, ow: d.offsetWidth, oh: d.offsetHeight, n: d.getAnimations({ subtree: true }).length }; }, dlg);
    await check(near(last.w, last.ow) && near(last.h, last.oh) && last.n === 0, `then ends at its own size`, last);
    await page.keyboard.press("Escape");
  }
  // a button that opens nothing, pressed over a second ago, does not lend the dialog its place
  await page.click("#theme"); await page.click("#theme");
  // past the second after a click in which the page takes a dialog opening as that click's (web/dialog_motion.js)
  await ctx.clock.fastForward(1200);
  const was = await page.evaluate(() => window.dialogMotions["history-dlg"]?.made || 0);
  await page.evaluate(() => $("#history-dlg").showModal());
  const f = await opened(page, "#history-dlg");
  await check(f.open && f.made === was, "a dialog opened with nothing pressed lately appears at once", f);
  await ctx.close();
}

// ---- animations off, or reduced motion asked for: at once ----
for (const [opts, what] of [[{ motion: false }, "with animations off"], [{ reducedMotion: "reduce" }, "with reduced motion asked for"]]) {
  const { ctx, page } = await open(opts);
  await page.click("#sb-version");
  const f = await opened(page, "#history-dlg");
  await check(f.open && f.made === 0, `${what}, Version history appears at once`, f);
  await ctx.close();
}
await done(0);
