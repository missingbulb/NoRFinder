// Drives the Google Drive dialog (web/) in headless Chromium against a stand-in Drive API that can refuse
// downloads as Google does when it throttles a site (a 403 without the header that lets the page read it, which
// the page sees as a failed request) while
// still answering for files' details, or fail outright. Checks 1.37: a refused download, or a refused read for a
// row's badge, starts a 15-minute wait: a large notice and a red countdown, and no call to Drive from the dialog,
// across a reload; an image kept on this device still opens; when the countdown ends the dialog lists its link
// again. A failure where the details fail too starts no wait.
// Optional SHOTS: a directory for a screenshot. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/drive_throttle_driver.mjs [SHOTS]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ROOT = "throttlefolder000001";
const PNG = fs.readFileSync(path.join(repo, "dev", "tools", "build", "logo_source.png"));
const FILES = [{ id: "throttleimage0000001", name: "a.png" }, { id: "throttleimage0000002", name: "b.png" }, { id: "throttleimage0000003", name: "c.tif" }];
const CONFIG = `window.NOR_CONFIG = { google: { apiKey: "stand-in" } };`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(""); }
  if (u === "/web/config.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(CONFIG); }
  // a folder serves its index.html, as the site does: the page rewrites its own address to the folder
  let f = path.join(repo, u);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch();
let failed = false;
const check = (ok, what) => { if (!ok) { failed = true; console.error("FAILED: " + what); } else console.log("ok: " + what); };
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const cors = { "access-control-allow-origin": "*" };
// mode: "ok", "throttled" (downloads refused, details answered) or "down" (nothing answers); calls: every request
let mode = "ok";
const calls = [];
await ctx.route("https://www.googleapis.com/**", async (route) => {
  const u = new URL(route.request().url()), id = u.pathname.match(/\/files\/?(.*)$/)[1], media = u.searchParams.get("alt") === "media";
  calls.push(id ? (media ? "download" : "details") : "list");
  if (mode === "down") return route.abort();
  // Google's refusal lacks the header that lets the page read it, so the page sees a failed request
  if (media && mode === "throttled") return route.abort("failed");
  if (!id) {
    const files = FILES.map((f) => ({ ...f, mimeType: "image/png", size: String(PNG.length), createdTime: "2026-10-01T10:00:00Z" }));
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ files }) });
  }
  if (!media) return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ id, name: FILES.find((f) => f.id === id).name, mimeType: "image/png" }) });
  return route.fulfill({ status: 200, headers: cors, contentType: "image/png", body: PNG });
});
await ctx.route((u) => !u.href.startsWith(origin) && !u.href.startsWith("https://www.googleapis.com/"), (r) => r.abort());
await ctx.addInitScript((link) => {
  delete Navigator.prototype.serviceWorker;
  if (sessionStorage.getItem("primed")) return;
  sessionStorage.setItem("primed", "1");
  localStorage.setItem("nor-drive-link", JSON.stringify(link));
}, `https://drive.google.com/drive/folders/${ROOT}`);
const page = await ctx.newPage();
page.on("pageerror", (e) => { failed = true; console.error("page error: " + e.message); });
page.setDefaultTimeout(10000);
await page.clock.install();

const menu = async (sel) => { await page.click("#load-menu summary"); await page.click(sel); };
const listed = () => page.waitForFunction((n) => document.querySelectorAll("#drive-list .item").length === n, FILES.length);
// what the dialog shows of the wait: the notice, the clock and whether its controls are held
const wait = () => page.evaluate(() => ({
  notice: !$("#drive-throttle").hidden && $("#drive-throttle").textContent.includes("Try again in 15 minutes"),
  clock: $("#drive-clock").textContent, red: getComputedStyle($("#drive-clock")).color,
  held: ["#drive-link", "#drive-go", "#drive-open"].every((s) => $(s).disabled),
}));

try {
  await page.goto(origin + "/web/index.html");
  await page.waitForFunction(() => window.$ && $("#title").textContent);
  // b.png opened while Drive answers, so it is kept on this device
  await menu('#load-menu .item[data-src="drive"]'); await listed();
  await page.dblclick("#drive-list .item:nth-child(2)");
  await page.waitForFunction(() => st.fileName === "b.png");
  await page.waitForFunction(async () => (await (await caches.open("nor-images-v1")).keys()).length === 1);

  // throttled: opening a.png is refused
  mode = "throttled";
  await menu('#load-menu .item[data-src="drive"]'); await listed();
  await page.dblclick("#drive-list .item:nth-child(1)");
  await page.waitForFunction(() => !$("#drive-throttle").hidden);
  let w = await wait();
  check(w.notice && /^1[45]:\d\d$/.test(w.clock) && w.held, `a refused download shows the notice and a countdown from 15:00, and holds the dialog: ${JSON.stringify(w)}`);
  check(/rgb\((1\d\d|2\d\d), \d{1,2}, \d{1,2}\)/.test(w.red), `the countdown is red: ${w.red}`);
  if (shots) await page.locator("#drive-dlg").screenshot({ path: path.join(shots, "drive_throttle.png") });
  await page.clock.fastForward(61000);
  w = await wait();
  check(/^1[34]:\d\d$/.test(w.clock), `it counts down: ${w.clock} a minute later`);

  // nothing reaches Drive from the dialog while it waits, across a reload
  calls.length = 0;
  await page.evaluate(() => { $("#drive-go").click(); $("#drive-open").click(); });
  await page.dblclick("#drive-list .item:nth-child(1)", { force: true }).catch(() => {});
  await page.click("#drive-dlg button[value=close]");
  await page.reload(); await page.waitForFunction(() => window.$ && $("#title").textContent);
  await menu('#load-menu .item[data-src="drive"]');
  await page.waitForTimeout(500);
  w = await wait();
  check(w.notice && w.held && calls.length === 0, `no call to Drive while it waits, after a reload too: ${calls}`);
  await page.click("#drive-dlg button[value=close]");

  // a kept image still opens, from this device
  await menu("#load-menu .recent:nth-of-type(1)");
  await page.waitForFunction(() => st.fileName === "b.png");
  check(calls.length === 0, "an image kept on this device opens while it waits, with no call to Drive");
  // one no longer kept shows the notice instead of downloading
  await page.evaluate(async () => { const c = await caches.open("nor-images-v1"); for (const q of await c.keys()) await c.delete(q); });
  await menu("#load-menu .recent:nth-of-type(1)");
  await page.waitForFunction(() => $("#drive-dlg").open && !$("#drive-throttle").hidden);
  await page.waitForTimeout(300);
  check(calls.length === 0, `a recent image no longer kept shows the notice, with no call to Drive: ${calls}`);
  await page.click("#drive-dlg button[value=close]");

  // the countdown ends: the notice goes and the dialog lists its link again
  mode = "ok";
  await menu('#load-menu .item[data-src="drive"]');
  await page.clock.fastForward(15 * 60000);
  await listed();
  w = await wait();
  check(!w.notice && !w.held && calls.includes("list"), `after 15 minutes the notice goes and the link is listed again: ${JSON.stringify(w)}`);

  // a failure where the details fail too is an error, not a wait
  mode = "down";
  await page.dblclick("#drive-list .item:nth-child(1)");
  await page.waitForFunction(() => $("#drive-dlg").open && $("#drive-msg").classList.contains("err"));
  w = await wait();
  check(!w.notice && !w.held, `with Drive unreachable, the dialog shows an error and does not wait: "${await page.textContent("#drive-msg")}"`);

  // a refused read for a row's badge starts the wait too
  mode = "throttled";
  await page.evaluate(() => localStorage.removeItem("nor-drive-holds"));
  await page.click("#drive-go");
  await page.waitForFunction(() => !$("#drive-throttle").hidden);
  check((await wait()).notice, "a refused read for a TIFF row's badge starts the wait too");
} catch (e) {
  failed = true; console.error("FAILED: " + e.message);
}
await browser.close(); server.close();
process.exitCode = failed ? 1 : 0;
