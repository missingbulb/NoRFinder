// Drives the Google Drive dialog (web/) in headless Chromium against a stand-in Drive API listing a folder of
// N images and a slow subfolder, with a stand-in driveThumbs set whose thumbnail for row k is k + 1 pixels wide,
// so a thumbnail in the wrong row shows. Checks 1.18: thumbnails are fetched for the rows in view and the next
// 10, each landing in its own row whatever order they arrive in; a fast scroll skips the rows passed over; a
// stale folder listing never shows; closing stops the fetches and reopening shows those already fetched at once
// and fetches what the rows in view still lack.
// Optional SHOTS: a directory for a screenshot. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/drive_thumbs_driver.mjs [SHOTS]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const N = 60, AHEAD = 10;
const ROOT = "thumbfolder000000001", SLOW = { id: "thumbfolder000000002", name: "slow" };
const IMAGES = Array.from({ length: N }, (_, k) => ({ id: "thumbimage" + String(k).padStart(10, "0"), name: `img ${String(k).padStart(2, "0")}.tif` }));
// a grey PNG w pixels wide
function png(w) {
  const chunk = (type, data) => {
    const t = Buffer.concat([Buffer.from(type), data]), n = Buffer.alloc(4), c = Buffer.alloc(4);
    n.writeUInt32BE(data.length); c.writeUInt32BE(zlib.crc32(t));
    return Buffer.concat([n, t, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(4, 4); ihdr[8] = 8; ihdr[9] = 0;
  const rows = Buffer.concat(Array.from({ length: 4 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w, 128)])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

const CONFIG = `window.NOR_CONFIG = { google: { apiKey: "stand-in" }, drive: { defaultLink: "" } };`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(""); }
  if (u === "/web/config.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(CONFIG); }
  if (u === "/studies/viewer/study.json") {
    const m = JSON.parse(fs.readFileSync(path.join(repo, u), "utf8"));
    r.writeHead(200, { "content-type": "application/json" }); return r.end(JSON.stringify({ ...m, driveThumbs: "thumbs/" }));
  }
  if (u === "/studies/viewer/thumbs/index.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end(JSON.stringify(IMAGES.map((f) => f.id))); }
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
await ctx.route("https://www.googleapis.com/**", async (route) => {
  const q = new URL(route.request().url()).searchParams.get("q") || "";
  const slow = q.includes(SLOW.id);
  if (slow) await new Promise((ok) => setTimeout(ok, 800));
  const files = slow ? [{ ...IMAGES[0], id: "slowimage00000000001", name: "stale.tif" }]
    : [{ ...SLOW, mimeType: "application/vnd.google-apps.folder" }, ...IMAGES.map((f) => ({ ...f, mimeType: "image/tiff", size: "1000", createdTime: "2026-10-01T10:00:00Z" }))];
  return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ files }) });
});
// each thumbnail's request, in order; delay(k) says how long row k's answer takes
const asked = [];
let delay = () => 0;
await ctx.route(`${origin}/studies/viewer/thumbs/*.jpg`, async (route) => {
  const id = path.basename(new URL(route.request().url()).pathname, ".jpg"), k = IMAGES.findIndex((f) => f.id === id);
  asked.push(k);
  await new Promise((ok) => setTimeout(ok, delay(k)));
  try { await route.fulfill({ status: 200, contentType: "image/png", body: png(k + 1) }); } catch { /* aborted by the page */ }
});
await ctx.route((u) => !u.href.startsWith(origin) && !u.href.startsWith("https://www.googleapis.com/"), (r) => r.abort());
await ctx.addInitScript((link) => {
  delete Navigator.prototype.serviceWorker;
  localStorage.setItem("nor-drive-link", JSON.stringify(link));
}, `https://drive.google.com/drive/folders/${ROOT}`);
const page = await ctx.newPage();
page.on("pageerror", (e) => { failed = true; console.error("page error: " + e.message); });
page.setDefaultTimeout(10000);

// the image rows in view, by row number, and the window the page should fetch for them
const inView = () => page.evaluate(() => {
  const box = $("#drive-list").getBoundingClientRect();
  return [...document.querySelectorAll("#drive-list .item:not(.folder)")].flatMap((b, k) => {
    const r = b.getBoundingClientRect();
    return r.bottom > box.top && r.top < box.bottom ? [k] : [];
  });
});
const span = (rows) => { const out = []; for (let k = rows[0]; k <= Math.min(N - 1, rows[rows.length - 1] + AHEAD); k++) out.push(k); return out; };
// the width of the picture each image row shows, null where it shows none
const shown = () => page.evaluate(() => [...document.querySelectorAll("#drive-list .item:not(.folder) .pic")].map((p) => p.querySelector("img")?.naturalWidth || null));
// waits until no thumbnail has been asked for in a while
const quiet = async (ms = 600) => { for (let n = -1; n !== asked.length; ) { n = asked.length; await page.waitForTimeout(ms); } };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const sorted = (a) => [...new Set(a)].sort((x, y) => x - y);
const open = async () => {
  await page.click("#load-menu summary"); await page.click('#load-menu .item[data-src="drive"]');
  await page.waitForFunction((n) => document.querySelectorAll("#drive-list .item:not(.folder)").length === n, N);
};

try {
  await page.goto(origin + "/web/index.html");
  await page.waitForFunction(() => window.$ && $("#title").textContent);

  // answers arrive in reverse order of asking: the later rows' first
  delay = (k) => 400 - 5 * k;
  await open();
  await quiet();
  const first = span(await inView());
  check(same(sorted(asked), first), `fetched only the rows in view and the next ${AHEAD}: ${sorted(asked)} (want ${first})`);
  check(asked.length === first.length, `each once: ${asked.length} fetches for ${first.length} rows`);
  let pics = await shown();
  check(first.every((k) => pics[k] === k + 1), `each thumbnail in its own row, whatever order they arrived in: ${first.map((k) => pics[k])}`);
  if (shots) await page.locator("#drive-dlg").screenshot({ path: path.join(shots, "drive_thumbs.png") });

  // a fast scroll to the bottom, answers slower than the scroll: the rows passed over are never fetched
  asked.length = 0; delay = () => 400;
  const height = await page.evaluate(() => $("#drive-list").scrollHeight);
  for (let y = 0; y <= height; y += 250) { await page.evaluate((t) => { $("#drive-list").scrollTop = t; }, y); await page.waitForTimeout(20); }
  await quiet();
  const last = span(await inView());
  // the fetches started as the scroll began, before it outran them, are the only rows passed over that are fetched
  const passed = sorted(asked).filter((k) => !first.includes(k) && !last.includes(k));
  check(passed.length <= 4, `a fast scroll skips the rows passed over, bar the ${passed.length} it started on: ${passed}`);
  check(last.length > 0 && last.every((k) => first.includes(k) || asked.includes(k)), `and fetches the ${last.length} rows it stops on`);
  pics = await shown();
  check(last.every((k) => pics[k] === k + 1), `which land in their own rows: ${last.map((k) => pics[k])}`);

  // closing midway stops the fetches; reopening shows what was fetched at once and fetches the rest in view
  await page.evaluate(() => { $("#drive-list").scrollTop = 0; });
  await quiet();
  const had = (await shown()).flatMap((w, k) => (w ? [k] : []));
  asked.length = 0; delay = () => 300;
  await page.evaluate(() => { $("#drive-list").scrollTop = $("#drive-list").scrollHeight / 2; });
  await page.waitForTimeout(100);
  const middle = span(await inView()), cut = asked.length;
  check(had.length >= first.length && middle.length > AHEAD, `${had.length} thumbnails held before closing, ${middle.length} rows wanted midway`);
  await page.click("#drive-dlg button[value=close]");
  await page.waitForTimeout(500);
  check(cut > 0 && asked.length === cut, `closing the dialog stops the fetches: ${cut} asked before, ${asked.length - cut} after`);
  asked.length = 0;
  await open();
  pics = await shown();
  check(had.every((k) => pics[k] === k + 1) && asked.length === 0, `reopened, the thumbnails fetched before show at once, none fetched again: ${had.filter((k) => pics[k] !== k + 1)}; asked ${asked}`);
  await page.evaluate(() => { $("#drive-list").scrollTop = $("#drive-list").scrollHeight / 2; });
  await quiet();
  pics = await shown();
  check(middle.every((k) => pics[k] === k + 1), `and it goes on to fetch what the rows in view lack: ${middle.map((k) => pics[k])}`);
  check(asked.every((k) => !had.includes(k)), `never one it already has: ${asked.filter((k) => had.includes(k))}`);

  // a folder asked for and left before its listing arrives never shows
  await page.evaluate(() => { $("#drive-list").scrollTop = 0; });
  await page.dblclick("#drive-list .item.folder");
  await page.click("#drive-path button[data-k='0']");
  await page.waitForTimeout(1200);
  const rows = await page.evaluate(() => [...document.querySelectorAll("#drive-list .item .name")].map((e) => e.textContent));
  check(rows.length === N + 1 && !rows.includes("stale.tif"), `a listing that arrives after the user moved on is dropped: ${rows.length} rows${rows.includes("stale.tif") ? ", stale.tif among them" : ""}`);
} catch (e) {
  failed = true; console.error("FAILED: " + e.message);
}
await browser.close(); server.close();
process.exitCode = failed ? 1 : 0;
