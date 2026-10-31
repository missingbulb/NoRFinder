// Drives the Google Drive dialog (web/) in headless Chromium against a stand-in Drive API serving the folder
// IMAGES, its rauntruth-previews.tiff among them, each file with its SHA-256 where a request's fields ask, as
// Drive gives it. Checks 1.42: the file is not listed and is downloaded once; the images it covers show their
// preview and what they hold with no read of their own, a stack turning while the pointer is over its row; one
// it lacks, or one changed since it was made, is read as without it; a reload reads the kept copy, and a new
// file on Drive is downloaded again; Manage storage lists it among the thumbnails.
// Optional SHOTS: a directory for screenshots. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/drive_previews_driver.mjs IMAGES [SHOTS]
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
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
const [images, shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ROOT = "previewfolder0000001", PREVIEWS = "rauntruth-previews.tiff";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const FILES = fs.readdirSync(images).sort().map((name, k) => ({ id: "previewfile" + String(k).padStart(9, "0"), name, bytes: fs.readFileSync(path.join(images, name)) }));
const file = (name) => FILES.find((f) => f.name === name);
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
// every read of a file's bytes, by name: "whole" or "piece"
const reads = [];
await ctx.route("https://www.googleapis.com/**", async (route) => {
  const u = new URL(route.request().url()), id = u.pathname.match(/\/files\/?(.*)$/)[1], fields = u.searchParams.get("fields") || "";
  const meta = (f) => ({ id: f.id, name: f.name, mimeType: "image/tiff", size: String(f.bytes.length), createdTime: "2026-10-01T10:00:00Z", ...(fields.includes("sha256Checksum") ? { sha256Checksum: sha(f.bytes) } : {}) });
  if (!id) return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ files: FILES.map(meta) }) });
  const f = FILES.find((g) => g.id === id);
  if (u.searchParams.get("alt") !== "media") return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(meta(f)) });
  const range = (route.request().headers().range || "").match(/^bytes=(\d+)-(\d+)$/);
  reads.push({ name: f.name, how: range ? "piece" : "whole" });
  if (range) return route.fulfill({ status: 206, headers: cors, contentType: "image/tiff", body: f.bytes.subarray(+range[1], +range[2] + 1) });
  return route.fulfill({ status: 200, headers: cors, contentType: "image/tiff", body: f.bytes });
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

const quiet = async (ms = 600) => { for (let n = -1; n !== reads.length; ) { n = reads.length; await page.waitForTimeout(ms); } };
const open = async () => {
  await page.click("#load-menu summary"); await page.click('#load-menu .item[data-src="drive"]');
  await page.waitForFunction((n) => document.querySelectorAll("#drive-list .item").length === n, FILES.length - 1);
  await quiet();
};
// each row: its name, what it holds and whether it shows a picture
const rows = () => page.evaluate(() => [...document.querySelectorAll("#drive-list .item")].map((b) => ({
  name: b.querySelector(".name").textContent, shape: b.querySelector(".shape").textContent, pic: !!b.querySelector(".pic img, .pic canvas") })));
const row = (all, name) => all.find((r) => r.name === name) || {};
const readsOf = (name) => reads.filter((r) => r.name === name).map((r) => r.how).join();

try {
  await page.goto(origin + "/web/index.html");
  await page.waitForFunction(() => window.$ && $("#title").textContent);
  await open();
  let all = await rows();
  check(!all.some((r) => r.name === PREVIEWS) && all.length === FILES.length - 1, `the previews file is not listed: ${all.map((r) => r.name)}`);
  check(readsOf(PREVIEWS) === "whole", `it is downloaded, once: ${readsOf(PREVIEWS)}`);
  check(row(all, "a flat.tif").pic && row(all, "a flat.tif").shape === "2D · 3 channels" && !readsOf("a flat.tif"),
    `a flat image it covers shows its preview and what it holds, with no read of its own: ${JSON.stringify(row(all, "a flat.tif"))}, reads ${readsOf("a flat.tif")}`);
  check(row(all, "b stack.tif").pic && row(all, "b stack.tif").shape === "3D · 12 slices · 2 channels" && !readsOf("b stack.tif"),
    `so does a stack: ${JSON.stringify(row(all, "b stack.tif"))}, reads ${readsOf("b stack.tif")}`);
  check(readsOf("c changed.tif") === "piece" && readsOf("d new.tif") === "piece",
    `an image changed since the file was made, and one it lacks, are read as without it: ${readsOf("c changed.tif")} / ${readsOf("d new.tif")}`);
  const colour = await page.evaluate(() => {
    const i = [...document.querySelectorAll("#drive-list .item")].find((b) => b.querySelector(".name").textContent === "a flat.tif").querySelector(".pic img");
    const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight;
    const g = c.getContext("2d"); g.drawImage(i, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
    let rg = 0, gb = 0; for (let j = 0; j < d.length; j += 4) { rg += Math.abs(d[j] - d[j + 1]); gb += Math.abs(d[j + 1] - d[j + 2]); }
    return [rg, gb].map((v) => v / (d.length / 4));
  });
  check(Math.min(...colour) > 5, `the flat preview is in colour: mean |r-g|, |g-b| ${colour.map((v) => v.toFixed(1))}`);
  if (shots) await page.locator("#drive-dlg").screenshot({ path: path.join(shots, "drive_previews.png") });

  // the stack turns while the pointer is over its row, and shows its still again after
  const stackRow = `#drive-list .item:nth-child(${all.findIndex((r) => r.name === "b stack.tif") + 1})`;
  // the turning canvas's picture, null when the row shows its still
  const frame = () => page.evaluate((sel) => document.querySelector(sel + " .pic canvas")?.toDataURL() ?? null, stackRow);
  await page.hover(stackRow);
  await page.waitForTimeout(200);
  const f1 = await frame(); await page.waitForTimeout(400); const f2 = await frame();
  check(!!f1 && !!f2 && f1 !== f2, "hovering a stack's row turns it");
  if (shots && f2) fs.writeFileSync(path.join(shots, "turning.png"), Buffer.from(f2.split(",")[1], "base64"));
  await page.mouse.move(5, 5); await page.waitForTimeout(100);
  check((await frame()) === null, "and leaving it shows its still again");
  check(!readsOf("b stack.tif"), "turning reads nothing");

  // a reload reads the kept copy; a new previews file on Drive is downloaded again
  reads.length = 0;
  await page.reload(); await page.waitForFunction(() => window.$ && $("#title").textContent);
  await open();
  check(!readsOf(PREVIEWS) && row(await rows(), "b stack.tif").pic, `after a reload it comes from this device: ${readsOf(PREVIEWS) || "no read"}`);
  const pv = file(PREVIEWS); pv.bytes = Buffer.concat([pv.bytes, Buffer.from([0])]);
  await page.click("#drive-dlg button[value=close]");
  reads.length = 0;
  await open();
  check(readsOf(PREVIEWS) === "whole" && row(await rows(), "a flat.tif").pic, `changed on Drive, it is downloaded again: ${readsOf(PREVIEWS)}`);
  await page.click("#drive-dlg button[value=close]");

  await page.click("#user-menu summary"); await page.click("#manage-storage");
  await page.waitForFunction(() => $("#usage-dlg").open && !/Reading/.test($("#storage-list").textContent));
  const thumbs = await page.evaluate(() => [...document.querySelectorAll("#storage-list .group[data-group=thumbs] .entry .name")].map((e) => e.textContent));
  check(thumbs.includes("Previews of Folder"), `Manage storage lists it among the thumbnails: ${thumbs}`);
} catch (e) {
  failed = true; console.error("FAILED: " + e.message);
}
await browser.close(); server.close();
process.exitCode = failed ? 1 : 0;
