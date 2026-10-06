// Drives the Google Drive dialog (web/) in headless Chromium against a stand-in Drive API that serves
// IMAGE... from a folder (with one subfolder holding the first of them again): a click only selects a row,
// Open loads the selection, a double click enters a folder, and each image's thumbnail is drawn from a few of
// its rows without downloading the rest, unless the remembered "Avoid downloading thumbnails" is ticked.
// Prints what it measured; exits 1 when something is wrong, 2 when it cannot run. With SHOT, also saves a
// screenshot of the dialog there.
//   node tests/drive_dialog_driver.mjs SHOT|- IMAGE...
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
const [shot, ...images] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ROOT = "rootfolder0000000001", SUB = "subfolder00000000001";
const files = images.map((p, k) => ({ id: `image0000000000000${k}`, name: path.basename(p), bytes: fs.readFileSync(p) }));
const folders = {
  [ROOT]: [{ id: SUB, name: "More slides", mimeType: "application/vnd.google-apps.folder" }, ...files.map((f) => ({ ...f, mimeType: "image/tiff" }))],
  [SUB]: [{ ...files[0], mimeType: "image/tiff" }],
};
const CONFIG = `window.NOR_CONFIG = { google: { apiKey: "stand-in" }, drive: { defaultLink: "https://drive.google.com/drive/folders/${ROOT}" } };`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(""); }
  if (u === "/web/config.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(CONFIG); }
  const f = path.join(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch();
const done = async (code, why) => { if (why) console.error(why); await browser.close(); server.close(); process.exit(code); };
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
// what the page asked of Drive: per file, the bytes it took in pieces and whether it took the whole file
const asked = Object.fromEntries(files.map((f) => [f.id, { ranged: 0, reads: 0, whole: 0 }]));
const cors = { "access-control-allow-origin": "*", "access-control-expose-headers": "content-length, content-range" };
await ctx.route("https://www.googleapis.com/**", (route) => {
  const q = route.request(), u = new URL(q.url());
  if (q.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-headers": "range" } });
  const m = u.pathname.match(/\/drive\/v3\/files\/?(.*)$/), id = m && m[1];
  if (!id) {
    const parent = u.searchParams.get("q").match(/'([\w-]+)' in parents/)[1];
    const list = (folders[parent] || []).map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.bytes ? String(f.bytes.length) : undefined, createdTime: "2026-10-01T10:00:00Z" }));
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ files: list }) });
  }
  const f = files.find((g) => g.id === id);
  if (!f) return route.fulfill({ status: 404, headers: cors, body: "{}" });
  const range = q.headers()["range"];
  if (!range) { asked[id].whole++; return route.fulfill({ status: 200, headers: cors, contentType: "image/tiff", body: f.bytes }); }
  const [, s, e] = range.match(/bytes=(\d+)-(\d+)/).map(Number), end = Math.min(e, f.bytes.length - 1);
  asked[id].ranged += end - s + 1; asked[id].reads++;
  return route.fulfill({ status: 206, headers: { ...cors, "content-range": `bytes ${s}-${end}/${f.bytes.length}` }, contentType: "image/tiff", body: f.bytes.subarray(s, end + 1) });
});
await ctx.route((u) => !u.href.startsWith(origin) && !u.href.startsWith("https://www.googleapis.com/"), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; localStorage.setItem("nor-load-source", JSON.stringify("drive")); });
const page = await ctx.newPage();
page.on("pageerror", (e) => done(1, "page error: " + e.message));
page.setDefaultTimeout(15000);
await page.goto(origin + "/web/index.html");
await page.click("#load-main");
await page.waitForSelector("#drive-list .item");
const rows = await page.$$eval("#drive-list .item", (b) => b.map((e) => e.querySelector(".name").textContent));
console.log("rows:", rows.join(" | "));
if (rows.length !== files.length + 1) await done(1, `expected ${files.length + 1} rows`);

// every image's thumbnail, from its rows only
await page.waitForFunction((n) => document.querySelectorAll("#drive-list .item .pic img").length === n, files.length);
const pics = await page.$$eval("#drive-list .item .pic img", (is) => is.map((i) => [i.naturalWidth, i.naturalHeight]));
console.log("thumbnails:", JSON.stringify(pics));
for (const f of files) {
  const a = asked[f.id], share = a.ranged / f.bytes.length;
  console.log(`${f.name}: ${a.reads} reads, ${(a.ranged / 1024).toFixed(0)} KB, ${(100 * share).toFixed(1)}% of the file`);
  if (a.whole || share > 0.1) await done(1, "a thumbnail took more than a tenth of its file");
}
// a colour thumbnail: its three colours differ
const colour = await page.$eval("#drive-list .item .pic img", (i) => {
  const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight;
  const x = c.getContext("2d"); x.drawImage(i, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data;
  let rg = 0, gb = 0; for (let j = 0; j < d.length; j += 4) { rg += Math.abs(d[j] - d[j + 1]); gb += Math.abs(d[j + 1] - d[j + 2]); }
  return [rg, gb].map((v) => v / (d.length / 4));
});
console.log("mean |r-g|, |g-b|:", colour.map((v) => v.toFixed(1)).join(", "));
if (Math.min(...colour) < 5) await done(1, "the thumbnail is not in colour");

// a click selects and loads nothing; Open waits for a selection
if (!(await page.$eval("#drive-open", (b) => b.disabled))) await done(1, "Open is on with nothing selected");
await page.click("#drive-list .item:nth-child(2)");
const selected = await page.$$eval("#drive-list .item", (b) => b.map((e) => e.getAttribute("aria-selected")));
if (selected.join() !== ["false", "true", ...files.slice(1).map(() => "false")].join()) await done(1, "a click did not select just that row: " + selected);
if (!(await page.$eval("#drive-dlg", (d) => d.open)) || asked[files[0].id].whole) await done(1, "a click loaded the image");
if (shot && shot !== "-") await page.locator("#drive-dlg").screenshot({ path: shot });

// a double click enters a folder, and its thumbnail is kept from before
await page.dblclick("#drive-list .item:nth-child(1)");
await page.waitForFunction(() => document.querySelector("#drive-path").textContent.includes("More slides") && document.querySelectorAll("#drive-list .item").length === 1);
await page.waitForSelector("#drive-list .item .pic img");
const reads = asked[files[0].id].reads;
// Open loads the selected image
await page.click("#drive-list .item");
await page.click("#drive-open");
await page.waitForFunction(() => !document.querySelector("#drive-dlg").open);
for (let t = 0; t < 50 && !asked[files[0].id].whole; t++) await new Promise((ok) => setTimeout(ok, 100));
if (!asked[files[0].id].whole) await done(1, "Open did not load the image");
if (asked[files[0].id].reads !== reads) await done(1, "the thumbnail was read again");
console.log("select, double click and Open all work");

// "Avoid downloading thumbnails" is off at first, and once ticked it is remembered and no row is read
const fresh = await ctx.newPage();
fresh.on("pageerror", (e) => done(1, "page error: " + e.message));
await fresh.goto(origin + "/web/index.html");
await fresh.click("#load-main");
await fresh.waitForSelector("#drive-list .item");
if (await fresh.$eval("#drive-no-thumbs", (c) => c.checked)) await done(1, "Avoid downloading thumbnails starts ticked");
await fresh.check("#drive-no-thumbs");
await fresh.reload();
const before = files.map((f) => asked[f.id].reads);
await fresh.click("#load-main");
await fresh.waitForSelector("#drive-list .item");
if (!(await fresh.$eval("#drive-no-thumbs", (c) => c.checked))) await done(1, "Avoid downloading thumbnails was not remembered");
await new Promise((ok) => setTimeout(ok, 1000));
if (files.some((f, k) => asked[f.id].reads !== before[k]) || (await fresh.$$("#drive-list .item .pic img")).length) await done(1, "a thumbnail was downloaded while avoided");
console.log("avoiding thumbnails is remembered and downloads none");
await done(0);
