// Drives the Google Drive dialog (web/) in headless Chromium against a stand-in Drive API serving the folder
// IMAGES, its rauntruth-previews.tiff among them, each file with its SHA-256 where a request's fields ask, as
// Drive gives it. Checks req/shell/drive/previews: the file is not listed and is downloaded once; the images it covers show their
// preview and what they hold with no read of their own, a stack turning while the pointer is over its row; one
// it lacks, or one changed since it was made, is read as without it; a reload reads the kept copy, and a new
// file on Drive is downloaded again; Manage storage counts it with its study's thumbnails. Drive's own small picture
// (req/shell/drive/dialog) shows for every photo, the file's picture of one ignored, and never for a TIFF, which may be a stack.
// Optional SHOTS: a directory for screenshots. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/drive_previews_driver.mjs IMAGES [SHOTS]
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { offSite } from "./off_site.mjs";
import { keptContext } from "./kept_context.mjs";
import { pressDrive, pickRecent } from "./drive_open.mjs";
import { repoFile } from "./repo_file.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [images, shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ROOT = "previewfolder0000001", PREVIEWS = "rauntruth-previews.tiff", DRIVE_THUMB = "https://lh3.googleusercontent.com/drive-thumb/";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const FILES = fs.readdirSync(images).sort().map((name, k) => ({ id: "previewfile" + String(k).padStart(9, "0"), name, bytes: fs.readFileSync(path.join(images, name)) }));
const file = (name) => FILES.find((f) => f.name === name);
const CONFIG = `window.NOR_CONFIG = { google: { apiKey: "stand-in" } };`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(""); }
  if (u === "/web/config.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(CONFIG); }
  const f = repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

let failed = false;
const check = (ok, what) => { if (!ok) { failed = true; console.error("FAILED: " + what); } else console.log("ok: " + what); };
const ctx = await keptContext(pw, { viewport: { width: 1400, height: 900 } });
const cors = { "access-control-allow-origin": "*" };
// every read of a file's bytes, by name: "whole" or "piece"
const reads = [];
let inflight = 0;
await ctx.route("https://www.googleapis.com/**", async (route) => {
  const u = new URL(route.request().url()), id = u.pathname.match(/\/files\/?(.*)$/)[1], fields = u.searchParams.get("fields") || "";
  const meta = (f) => ({ id: f.id, name: f.name, mimeType: "image/tiff", size: String(f.bytes.length), createdTime: "2026-10-01T10:00:00Z", ...(fields.includes("sha256Checksum") ? { sha256Checksum: sha(f.bytes) } : {}),
    ...(fields.includes("thumbnailLink") ? { thumbnailLink: `${DRIVE_THUMB}${f.id}` } : {}) });
  if (!id) return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ files: FILES.map(meta) }) });
  const f = FILES.find((g) => g.id === id);
  if (u.searchParams.get("alt") !== "media") return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(meta(f)) });
  const range = (route.request().headers().range || "").match(/^bytes=(\d+)-(\d+)$/);
  reads.push({ name: f.name, how: range ? "piece" : "whole" }); inflight++;
  try {
    await route.fulfill(range ? { status: 206, headers: cors, contentType: "image/tiff", body: f.bytes.subarray(+range[1], +range[2] + 1) }
      : { status: 200, headers: cors, contentType: "image/tiff", body: f.bytes });
  } finally { inflight--; }
});
await ctx.route(offSite(origin, "https://www.googleapis.com/"), (r) => r.abort());
// Drive's own small pictures, by file name: the image the study opens beside TIFFs and PNGs is a JPEG here
const driveThumbs = [];
await ctx.route(DRIVE_THUMB + "*", (route) => {
  driveThumbs.push(FILES.find((f) => route.request().url().endsWith(f.id)).name);
  return route.fulfill({ status: 200, headers: cors, contentType: "image/jpeg", path: path.join(repo, "web", "poster.jpg") });
});
await ctx.route("**/studies/viewer/study.json", async (route) => {
  const own = await (await route.fetch()).json();
  return route.fulfill({ json: { ...own, files: { ...own.files, accept: own.files.accept + ",.jpg" } } });
});
await ctx.addInitScript((link) => {
  delete Navigator.prototype.serviceWorker;
  if (sessionStorage.getItem("primed")) return;
  sessionStorage.setItem("primed", "1");
  localStorage.setItem("nor-drive-link", JSON.stringify(link));
}, `https://drive.google.com/drive/folders/${ROOT}`);
const page = await ctx.newPage();
page.on("pageerror", (e) => { failed = true; console.error("page error: " + e.message); });
page.setDefaultTimeout(10000);

// the page's handlers for what was just done have all run: a read it would start has started
const frames = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
// every TIFF row says what it holds, the page says its thumbnails are in (the status bar's "Thumbnails n of m" gone), and no
// read is on the way once the page has run its handlers; 10 s at most, the
// checks after it saying what is missing
const quiet = async () => {
  const end = Date.now() + 10000;
  for (;;) {
    await page.waitForFunction(() => !/^Thumbnails /.test($("#status").textContent)
      && [...document.querySelectorAll("#remote-list .item")].every((b) => !/\.tiff?$/i.test(b.querySelector(".name").textContent) || b.querySelector(".shape").textContent),
      null, { timeout: Math.max(1, end - Date.now()) }).catch(() => {});
    await frames();
    if (!inflight || Date.now() >= end) break;
    await page.waitForEvent("requestfinished", { timeout: Math.max(1, end - Date.now()) }).catch(() => {});
  }
  if (Date.now() >= end) console.log("quiet: gave up after 10 s", JSON.stringify({ inflight, rows: await rows() }));
};
const open = async () => {
  await pressDrive(page);
  await page.waitForFunction((n) => document.querySelectorAll("#remote-list .item").length === n, FILES.length - 1);
  await quiet();
};
// each row: its name, what it holds and whether it shows a picture
const rows = () => page.evaluate(() => [...document.querySelectorAll("#remote-list .item")].map((b) => ({
  name: b.querySelector(".name").textContent, shape: b.querySelector(".shape").textContent, pic: !!b.querySelector(".pic img, .pic canvas") })));
const row = (all, name) => all.find((r) => r.name === name) || {};
const readsOf = (name) => reads.filter((r) => r.name === name).map((r) => r.how).join();

try {
  await page.goto(origin + "/web/");
  await page.waitForFunction(() => window.$ && $("#title").textContent);
  await open();
  let all = await rows();
  check(!all.some((r) => r.name === PREVIEWS) && all.length === FILES.length - 1, `the previews file is not listed: ${all.map((r) => r.name)}`);
  check(readsOf(PREVIEWS) === "whole", `it is downloaded, once: ${readsOf(PREVIEWS)}`);
  check(row(all, "a flat.tif").pic && row(all, "a flat.tif").shape === "2D · 3 channels" && !readsOf("a flat.tif"),
    `a flat image it covers shows its preview and what it holds, with no read of its own: ${JSON.stringify(row(all, "a flat.tif"))}, reads ${readsOf("a flat.tif")}`);
  check(row(all, "b stack.tif").pic && row(all, "b stack.tif").shape === "3D · 12 slices · 2 channels" && !readsOf("b stack.tif"),
    `so does a stack: ${JSON.stringify(row(all, "b stack.tif"))}, reads ${readsOf("b stack.tif")}`);
  check(row(all, "f covered.png").pic && row(all, "f covered.png").shape === "" && !readsOf("f covered.png"),
    `a PNG shows a picture but no 2D or channel tags, which only a TIFF's header tells: ${JSON.stringify(row(all, "f covered.png"))}`);
  check(readsOf("c changed.tif") === "piece" && readsOf("d new.tif") === "piece",
    `an image changed since the file was made, and one it lacks, are read as without it: ${readsOf("c changed.tif")} / ${readsOf("d new.tif")}`);
  check(row(all, "e photo.jpg").pic && JSON.stringify(driveThumbs.sort()) === JSON.stringify(["e photo.jpg", "f covered.png"]),
    `a photo shows Drive's own small picture, even one an older previews file pictures, and a TIFF, which may be a stack, never does: ${JSON.stringify(row(all, "e photo.jpg"))}, Drive's pictures of ${driveThumbs}`);
  const colour = await page.evaluate(() => {
    const i = [...document.querySelectorAll("#remote-list .item")].find((b) => b.querySelector(".name").textContent === "a flat.tif").querySelector(".pic img");
    const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight;
    const g = c.getContext("2d"); g.drawImage(i, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
    let rg = 0, gb = 0; for (let j = 0; j < d.length; j += 4) { rg += Math.abs(d[j] - d[j + 1]); gb += Math.abs(d[j + 1] - d[j + 2]); }
    return [rg, gb].map((v) => v / (d.length / 4));
  });
  check(Math.min(...colour) > 5, `the flat preview is in colour: mean |r-g|, |g-b| ${colour.map((v) => v.toFixed(1))}`);
  if (shots) await page.locator("#remote-dlg").screenshot({ path: path.join(shots, "drive_previews.png") });

  // the stack turns while the pointer is over its row, and shows its still again after
  const stackRow = `#remote-list .item:nth-child(${all.findIndex((r) => r.name === "b stack.tif") + 1})`;
  // the turning canvas's picture, null when the row shows its still
  const frame = () => page.evaluate((sel) => document.querySelector(sel + " .pic canvas")?.toDataURL() ?? null, stackRow);
  await page.hover(stackRow);
  await page.waitForFunction((sel) => document.querySelector(sel + " .pic canvas"), stackRow, { timeout: 3000 }).catch(() => {});
  const f1 = await frame();
  await page.waitForFunction(([sel, f1]) => document.querySelector(sel + " .pic canvas")?.toDataURL() !== f1, [stackRow, f1], { timeout: 3000 }).catch(() => {});
  const f2 = await frame();
  check(!!f1 && !!f2 && f1 !== f2, "hovering a stack's row turns it");
  if (shots && f2) fs.writeFileSync(path.join(shots, "turning.png"), Buffer.from(f2.split(",")[1], "base64"));
  await page.mouse.move(5, 5);
  await page.waitForFunction((sel) => !document.querySelector(sel + " .pic canvas"), stackRow, { timeout: 3000 }).catch(() => {});
  check((await frame()) === null, "and leaving it shows its still again");
  check(!readsOf("b stack.tif"), "turning reads nothing");

  // a reload reads the kept copy; a new previews file on Drive is downloaded again
  reads.length = 0;
  await page.reload(); await page.waitForFunction(() => window.$ && $("#title").textContent);
  await open();
  check(!readsOf(PREVIEWS) && row(await rows(), "b stack.tif").pic, `after a reload it comes from this device: ${readsOf(PREVIEWS) || "no read"}`);
  const pv = file(PREVIEWS); pv.bytes = Buffer.concat([pv.bytes, Buffer.from([0])]);
  await page.click("#remote-dlg button[value=close]");
  reads.length = 0;
  await open();
  // the new file read and its pictures drawn on the rows it covers
  await page.waitForFunction(() => [...document.querySelectorAll("#remote-list .item")].find((b) => b.querySelector(".name").textContent === "a flat.tif")?.querySelector(".pic img, .pic canvas"),
    null, { timeout: 5000 }).catch(() => {});
  check(readsOf(PREVIEWS) === "whole" && row(await rows(), "a flat.tif").pic, `changed on Drive, it is downloaded again: ${readsOf(PREVIEWS)}`);
  await page.click("#remote-dlg button[value=close]");

  await page.click("#user-menu summary"); await page.click("#manage-storage");
  await page.waitForFunction(() => $("#usage-dlg").open && !/Reading/.test($("#storage-list").textContent));
  const thumbs = await page.evaluate(() => [...document.querySelectorAll("#storage-list .entry[data-kind=thumb] .what")].map((e) => e.textContent));
  check(thumbs.some((t) => /1 folder's previews/.test(t)), `Manage storage counts it with its study's thumbnails: ${thumbs}`);
} catch (e) {
  failed = true; console.error("FAILED: " + e.message);
}
await ctx.close(); server.close();
process.exitCode = failed ? 1 : 0;
