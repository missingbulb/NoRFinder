// Drives the remote files dialog in headless Chromium against a stand-in Drive folder holding images of several
// kinds. Checks req/shell/drive/dialog: a folder lists its subfolders and the images the study on show opens, by its
// study.json's files.accept: Bookshelf Reader's photos (JPEG, WebP, BMP, PNG, TIFF), the Image Viewer's TIFF and PNG
// alone, neither a kind it cannot open.
// Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/drive_accept_driver.mjs
import { repoFile } from "./repo_file.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { offSite } from "./off_site.mjs";
import { ENGINE } from "./engine.mjs";
import { pressDrive } from "./drive_open.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FOLDER = "acmefolder0000000001";
const NAMES = ["a.jpg", "b.JPEG", "c.webp", "d.bmp", "e.png", "f.tif", "g.heic", "h.pdf"];
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

const browser = await pw[ENGINE].launch();
let failed = false;
const check = (ok, what, seen) => { if (!ok) { failed = true; console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); } else console.log("ok: " + what); };
const cors = { "access-control-allow-origin": "*" };
const folder = `https://drive.google.com/drive/folders/${FOLDER}`;

// what the dialog lists for the folder in the study at this address; paste: the folder's link, where the dialog takes one
async function listed(id, paste) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route("https://www.googleapis.com/**", (route) => {
    const u = new URL(route.request().url());
    if (!u.searchParams.get("q")) return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ name: "Shelves" }) });
    const files = [{ id: "acmesub", name: "sub", mimeType: "application/vnd.google-apps.folder" },
      ...NAMES.map((n, k) => ({ id: "acmefile" + k, name: n, mimeType: "application/octet-stream", size: "100" }))];
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ files }) });
  });
  await ctx.route(offSite(origin, "https://www.googleapis.com/"), (r) => r.abort());
  // the study's own folder becomes the stand-in's, and the study is shown to anyone
  await ctx.route(`**/studies/${id}/study.json`, async (r) => {
    const m = JSON.parse(fs.readFileSync(path.join(repo, "studies", id, "study.json"), "utf8"));
    if (m.files.folders) m.files.folders = [folder];
    // shown to everyone, so the page opens it signed out
    m.visibility = "listed";
    await r.fulfill({ json: m });
  });
  await ctx.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
    localStorage.setItem("nor-welcome", JSON.stringify({ choice: "anonymous", remember: true }));
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { failed = true; console.error("page error: " + e.message); });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/" + id);
  await page.waitForFunction(() => window.$ && $("#title").textContent);
  await pressDrive(page);
  await page.waitForFunction(() => $("#remote-dlg").open);
  if (paste) { await page.fill("#remote-link", folder); await page.click("#remote-go"); }
  await page.waitForFunction(() => $("#remote-list .item")).catch(async (e) => { console.error("dialog: " + (await page.evaluate(() => [$("#title").textContent, $("#remote-dlg").className, $("#remote-msg").textContent, $("#remote-path").textContent].join(" | ")))); throw e; });
  const names = await page.$$eval("#remote-list .item .name", (rows) => rows.map((r) => r.textContent).sort());
  await ctx.close();
  return names;
}

const shelves = await listed("shelves", false);
check(JSON.stringify(shelves) === JSON.stringify(["a.jpg", "b.JPEG", "c.webp", "d.bmp", "e.png", "f.tif", "sub"]),
  "Bookshelf Reader lists its subfolders and every photo it opens: JPEG, WebP, BMP, PNG and TIFF, no HEIC or PDF", shelves);
const viewer = await listed("viewer", true);
check(JSON.stringify(viewer) === JSON.stringify(["e.png", "f.tif", "sub"]), "the Image Viewer lists its subfolders, TIFF and PNG alone", viewer);

await browser.close(); server.close();
process.exit(failed ? 1 : 0);
