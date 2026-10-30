// Drives the Google Drive dialog (web/) in headless Chromium against a stand-in Drive API whose files' bytes can
// change, and which gives each file's SHA-256 only where a request's fields ask for it, as Drive does. Checks 1.7:
// a kept image opens from this device once its SHA-256 matches Drive's, from the listing or, for a recent image,
// the file's details; one changed on Drive is downloaded again and kept in place of the old; with no SHA-256 from
// Drive, or none to be had, the kept copy opens unchecked. Then 1.39: opening a kept image from the dialog shows
// a tip at Load's dropdown arrow; its × closes it for good, after a reload too, and opening the dropdown does too.
// Optional SHOTS: a directory for a screenshot. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/drive_cache_driver.mjs [SHOTS]
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
const [shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ROOT = "cachefolder000000001";
const PNG = fs.readFileSync(path.join(repo, "dev", "tools", "build", "logo_source.png"));
// a.png's bytes on Drive; changed later to the same picture with a byte appended after its end
const FILE = { id: "cacheimage0000000001", name: "a.png", bytes: PNG };
const sha = (b) => createHash("sha256").update(b).digest("hex");
const CONFIG = `window.NOR_CONFIG = { google: { apiKey: "stand-in" }, drive: { defaultLink: "" } };`;
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
// checksums: whether Drive gives SHA-256s; details: whether file details answer; calls: every request, by kind
let checksums = true, details = true;
const calls = [];
await ctx.route("https://www.googleapis.com/**", async (route) => {
  const u = new URL(route.request().url()), id = u.pathname.match(/\/files\/?(.*)$/)[1], fields = u.searchParams.get("fields") || "";
  const media = u.searchParams.get("alt") === "media";
  calls.push(!id ? "list" : media ? "download" : "details");
  const meta = { id: FILE.id, name: FILE.name, mimeType: "image/png", size: String(FILE.bytes.length), createdTime: "2026-10-01T10:00:00Z",
    ...(checksums && fields.includes("sha256Checksum") ? { sha256Checksum: sha(FILE.bytes) } : {}) };
  if (!id) return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ files: [meta] }) });
  if (media) return route.fulfill({ status: 200, headers: cors, contentType: "image/png", body: FILE.bytes });
  if (!details) return route.abort();
  return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(meta) });
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

const downloads = () => calls.filter((c) => c === "download").length;
// opens a.png from the Drive dialog, or from the recents, and waits until the page holds it
const fromDialog = async () => {
  await page.click("#load-menu summary"); await page.click('#load-menu .item[data-src="drive"]');
  await page.waitForFunction(() => document.querySelectorAll("#drive-list .item").length === 1);
  await page.evaluate(() => { st.fileName = ""; });
  await page.dblclick("#drive-list .item");
  await page.waitForFunction(() => st.fileName === "a.png");
};
const fromRecents = async () => {
  await page.evaluate(() => { st.fileName = ""; });
  await page.click("#load-menu summary"); await page.click("#load-menu .recent");
  await page.waitForFunction(() => st.fileName === "a.png");
};
// the SHA-256 of the copy kept on this device
const keptSha = () => page.evaluate(async () => {
  const c = await caches.open("nor-images-v1"), [q] = await c.keys();
  if (!q) return null;
  const b = await (await c.match(q)).arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");
});
const settle = async () => { await page.waitForTimeout(400); };
const tip = () => page.evaluate(() => { const t = document.querySelector(".tip-bubble[data-tip]"); return t && !t.hidden ? t.dataset.tip : null; });

try {
  await page.goto(origin + "/web/index.html");
  await page.waitForFunction(() => window.$ && $("#title").textContent);

  await fromDialog();
  await page.waitForFunction(async () => (await (await caches.open("nor-images-v1")).keys()).length === 1);
  check(downloads() === 1 && (await tip()) === null, "a first open downloads the image, and shows no tip");

  // ---- 1.7 ----
  calls.length = 0;
  await fromDialog(); await settle();
  check(downloads() === 0 && !calls.includes("details"), `kept, and matching the listing's SHA-256, it opens from this device with no further request: ${calls}`);
  check((await tip()) === "recent-files", "and the tip shows");
  const near = await page.evaluate(() => {
    const t = document.querySelector(".tip-bubble[data-tip]").getBoundingClientRect(), a = $("#load-menu summary").getBoundingClientRect();
    return Math.hypot((t.left + t.right) / 2 - (a.left + a.right) / 2, Math.min(Math.abs(t.top - a.bottom), Math.abs(t.bottom - a.top)));
  });
  check(near < 200, `the tip sits by Load's dropdown arrow: ${Math.round(near)} px away`);
  check(/To load recent files click here/.test(await page.textContent(".tip-bubble[data-tip]")), "and says to click there for recent files");
  if (shots) await page.screenshot({ path: path.join(shots, "tip.png"), clip: { x: 0, y: 0, width: 520, height: 260 } });

  calls.length = 0;
  await fromRecents(); await settle();
  check(downloads() === 0 && calls.join() === "details", `from the recents, the file's details are asked for its SHA-256, and it opens from this device: ${calls}`);

  // the file changes on Drive
  FILE.bytes = Buffer.concat([PNG, Buffer.from([0])]);
  calls.length = 0;
  await fromDialog();
  await page.waitForFunction(async (want) => {
    const c = await caches.open("nor-images-v1"), [q] = await c.keys(), b = await (await c.match(q)).arrayBuffer();
    return b.byteLength === want;
  }, FILE.bytes.length);
  check(downloads() === 1, `changed on Drive, it is downloaded again: ${calls}`);
  check((await keptSha()) === sha(FILE.bytes), "and kept in place of the old copy");
  calls.length = 0;
  await fromRecents(); await settle();
  check(downloads() === 0, "after which the recents open it from this device again");

  // Drive gives no SHA-256, or cannot be asked
  checksums = false; calls.length = 0;
  await fromRecents(); await settle();
  check(downloads() === 0 && calls.join() === "details", `with no SHA-256 from Drive, the kept copy opens unchecked: ${calls}`);
  checksums = true; details = false; calls.length = 0;
  await fromRecents(); await settle();
  check(downloads() === 0, `with Drive's details unreachable, the kept copy opens unchecked: ${calls}`);
  details = true;

  // ---- 1.39 ----
  // opening the recents above closed the tip for good; start again
  check((await page.evaluate(() => JSON.parse(localStorage.getItem("nor-tips-closed")) || [])).includes("recent-files"), "opening the recents has closed the tip for good");
  await page.evaluate(() => localStorage.removeItem("nor-tips-closed"));
  await fromDialog(); await settle();
  await page.click(".tip-bubble[data-tip] .x");
  check((await tip()) === null && (await page.evaluate(() => JSON.parse(localStorage.getItem("nor-tips-closed")))).includes("recent-files"), "the tip's × closes it, and its id is kept");
  await fromDialog(); await settle();
  check((await tip()) === null, "a closed tip does not show again");
  await page.reload(); await page.waitForFunction(() => window.$ && $("#title").textContent);
  await fromDialog(); await settle();
  check((await tip()) === null, "nor after a reload");

  // opening the dropdown closes it too
  await page.evaluate(() => localStorage.removeItem("nor-tips-closed"));
  await fromDialog(); await settle();
  check((await tip()) === "recent-files", "with the closed tips cleared, it shows again");
  await page.click("#load-menu summary"); await page.click("#load-menu summary");
  check((await tip()) === null && (await page.evaluate(() => JSON.parse(localStorage.getItem("nor-tips-closed")) || [])).includes("recent-files"), "opening the dropdown closes it for good");

  await page.click("#user-menu summary"); await page.click("#manage-storage");
  await page.waitForFunction(() => $("#storage-dlg").open && !/Reading/.test($("#storage-list").textContent));
  check(await page.evaluate(() => [...document.querySelectorAll("#storage-list .group[data-group=settings] .entry .name")].some((e) => e.textContent === "Tips you closed")), "Manage storage lists the closed tips among the settings");
} catch (e) {
  failed = true; console.error("FAILED: " + e.message);
}
await browser.close(); server.close();
process.exitCode = failed ? 1 : 0;
