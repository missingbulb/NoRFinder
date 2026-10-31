// Drives the Google Drive dialog (web/) in headless Chromium against a stand-in Drive API that answers Range
// requests, listing ImageJ TIFFs: a flat three-channel image, an eight-slice stack, a TIFF with no ImageJ header
// and a run of stacks below them. Checks 1.36: each row says what its file holds, read from the file's first 64 KB
// for the rows in view and the next 10, remembered so a reload reads nothing again, and not read while Show
// thumbnails is off; opening the stack saves a 3D thumbnail at once, opening the flat image does not.
// Optional SHOTS: a directory for screenshots. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/drive_shapes_driver.mjs [SHOTS]
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
const HEAD = 65536, AHEAD = 10;

// a little-endian 16-bit TIFF of `planes` W×H planes, as ImageJ writes one: the first IFD, its description, then
// the planes back to back; value(k, x, y) gives plane k's pixels
function tiff(W, H, planes, desc, value) {
  const tags = [[256, 4, W], [257, 4, H], [258, 3, 16], [259, 3, 1], [262, 3, 1], [270, 2, 0], [273, 4, 0], [277, 3, 1], [278, 4, H], [279, 4, W * H * 2]];
  if (desc == null) tags.splice(5, 1);
  const ifd = 8, text = desc == null ? Buffer.alloc(0) : Buffer.from(desc + "\0", "latin1");
  const at = ifd + 2 + tags.length * 12 + 4, data = at + text.length + (text.length % 2);
  const out = Buffer.alloc(data + planes * W * H * 2);
  out.write("II", 0, "latin1"); out.writeUInt16LE(42, 2); out.writeUInt32LE(ifd, 4); out.writeUInt16LE(tags.length, ifd);
  tags.forEach(([tag, type, v], i) => {
    const e = ifd + 2 + i * 12;
    out.writeUInt16LE(tag, e); out.writeUInt16LE(type, e + 2);
    if (tag === 270) { out.writeUInt32LE(text.length, e + 4); out.writeUInt32LE(at, e + 8); }
    else { out.writeUInt32LE(1, e + 4); out.writeUInt32LE(tag === 273 ? data : v, e + 8); }
  });
  text.copy(out, at);
  for (let k = 0; k < planes; k++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out.writeUInt16LE(value(k, x, y), data + 2 * ((k * H + y) * W + x));
  return out;
}
// a tube crossing the stack on a slant, so a 3D view of it differs from any one slice
const tube = (k, x, y) => ((x - 60 - 16 * k) ** 2 + (y - 128) ** 2 < 400 ? 3000 : 100);
const FILES = [
  { id: "shapeflat00000000001", name: "a flat.tif", bytes: tiff(256, 256, 3, "ImageJ=1.54f\nimages=3\nchannels=3\nmode=composite\n", (k, x) => 100 + k * x), want: "2D · 3 channels" },
  { id: "shapeplain0000000001", name: "b plain.tif", bytes: tiff(256, 256, 1, null, () => 500), want: "" },
  { id: "shapestack0000000001", name: "c stack.tif", bytes: tiff(256, 256, 8, "ImageJ=1.54f\nimages=8\nslices=8\nunit=micron\nspacing=4\n", tube), want: "3D · 8 slices" },
  // two channels, interleaved slice by slice as ImageJ stores a hyperstack: the tube, and a square in the other
  { id: "shapetwo00000000001", name: "c two.tif", want: "3D · 4 slices · 2 channels",
    bytes: tiff(256, 256, 8, "ImageJ=1.54f\nimages=8\nchannels=2\nslices=4\nhyperstack=true\n", (k, x, y) => (k % 2 ? (Math.abs(x - 190) < 30 && Math.abs(y - 60) < 30 ? 3000 : 100) : tube(k >> 1, x, y))) },
  ...Array.from({ length: 30 }, (_, k) => ({ id: "shapemore" + String(k).padStart(11, "0"), name: `d more ${String(k).padStart(2, "0")}.tif`, bytes: null, want: "3D · 5 slices" })),
];
const MORE = tiff(256, 256, 5, "ImageJ=1.54f\nimages=5\nslices=5\n", tube);
for (const f of FILES) f.bytes = f.bytes || MORE;
const ROOT = "shapefolder000000001";

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
// every read of a file's bytes: its row and the Range asked for ("" for the whole file)
const reads = [];
await ctx.route("https://www.googleapis.com/**", async (route) => {
  const u = new URL(route.request().url()), id = u.pathname.match(/\/files\/?(.*)$/)[1];
  if (!id) {
    const files = FILES.map((f) => ({ id: f.id, name: f.name, mimeType: "image/tiff", size: String(f.bytes.length), createdTime: "2026-10-01T10:00:00Z" }));
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ files }) });
  }
  const k = FILES.findIndex((f) => f.id === id), range = route.request().headers().range || "";
  reads.push({ k, range });
  const m = range.match(/^bytes=(\d+)-(\d+)$/), body = m ? FILES[k].bytes.subarray(+m[1], +m[2] + 1) : FILES[k].bytes;
  return route.fulfill({ status: m ? 206 : 200, headers: cors, contentType: "image/tiff", body });
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
  await page.waitForFunction((n) => document.querySelectorAll("#drive-list .item").length === n, FILES.length);
  await quiet();
};
// each row's badge text, "" where it has none
const badges = () => page.evaluate(() => [...document.querySelectorAll("#drive-list .item")].map((b) => b.querySelector(".shape")?.textContent || ""));
const inView = () => page.evaluate(() => {
  const box = $("#drive-list").getBoundingClientRect();
  return [...document.querySelectorAll("#drive-list .item")].flatMap((b, k) => { const r = b.getBoundingClientRect(); return r.bottom > box.top && r.top < box.bottom ? [k] : []; });
});
const thumbOf = (k) => page.evaluate((id) => localStorage.getItem("nor-drive-thumb:" + id), FILES[k].id);

try {
  await page.goto(origin + "/web/index.html");
  await page.waitForFunction(() => window.$ && $("#title").textContent);
  await open();
  const seen = await inView(), window = []; for (let k = seen[0]; k <= seen[seen.length - 1] + AHEAD; k++) window.push(k);
  let b = await badges();
  check(FILES.slice(0, 4).every((f, k) => b[k] === f.want), `each row says what its file holds: ${JSON.stringify(b.slice(0, 4))}`);
  const read = [...new Set(reads.map((r) => r.k))].sort((x, y) => x - y);
  check(read.length === window.length && read.every((k, i) => k === window[i]), `read for the rows in view and the next ${AHEAD} only: ${read} (want ${window})`);
  check(reads.length > 0 && reads.length === read.length && reads.every((r) => r.range === `bytes=0-${HEAD - 1}`), `each read once, its first 64 KB: ${JSON.stringify(reads.slice(0, 3))}`);
  check(window.every((k) => b[k] === FILES[k].want), "every row read shows its badge");
  if (shots) await page.locator("#drive-dlg").screenshot({ path: path.join(shots, "drive_shapes.png") });

  // remembered: a reload reads nothing it read before
  await page.reload(); await page.waitForFunction(() => window.$ && $("#title").textContent);
  reads.length = 0;
  await open();
  b = await badges();
  check(reads.length === 0 && window.every((k) => b[k] === FILES[k].want), `after a reload, the badges show with no read: ${reads.length} reads`);

  // not read while Show thumbnails is off
  await page.uncheck("#drive-thumbs");
  await page.evaluate(() => { $("#drive-list").scrollTop = $("#drive-list").scrollHeight; });
  await quiet();
  check(reads.length === 0, `with Show thumbnails off, nothing is read: ${reads.length} reads`);
  await page.check("#drive-thumbs");
  await quiet();
  const end = await inView();
  b = await badges();
  check(end.length > 0 && end.every((k) => b[k] === FILES[k].want) && reads.every((r) => r.range), `ticked again, the rows in view are read: ${end.map((k) => b[k] || "-")}`);
  await page.evaluate(() => { $("#drive-list").scrollTop = 0; });

  // opening the stack saves its 3D thumbnail at once; opening the flat image does not (its waits for the image to show)
  await page.dblclick("#drive-list .item:nth-child(3)");
  await page.waitForFunction(() => !$("#drive-dlg").open);
  await page.waitForFunction(() => st.fileName === "c stack.tif");
  for (let t = 0; t < 30 && !(await thumbOf(2)); t++) await page.waitForTimeout(100);
  const pic = await thumbOf(2);
  check(reads.some((r) => r.k === 2 && !r.range), "opening the stack downloads the whole file");
  check(!!pic && JSON.parse(pic).startsWith("data:image/"), "and saves a thumbnail of it as it opens");
  const size = pic && await page.evaluate((u) => new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.src = u; }), JSON.parse(pic));
  check(size && size[0] > 0 && size[0] <= 128 && size[1] <= 128, `a small picture: ${size}`);
  if (shots && pic) fs.writeFileSync(path.join(shots, "stack_preview.png"), Buffer.from(JSON.parse(pic).split(",")[1], "base64"));
  await open();
  check(await page.evaluate(() => !!document.querySelector("#drive-list .item:nth-child(3) .pic img")), "the dialog shows it on the stack's row");
  // a two-channel stack: each channel in its own colour
  await page.dblclick("#drive-list .item:nth-child(4)");
  await page.waitForFunction(() => st.fileName === "c two.tif");
  for (let t = 0; t < 30 && !(await thumbOf(3)); t++) await page.waitForTimeout(100);
  const two = await thumbOf(3);
  const hues = two && await page.evaluate((u) => new Promise((ok) => {
    const i = new Image();
    i.onload = () => {
      const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight;
      const g = c.getContext("2d"); g.drawImage(i, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let green = 0, magenta = 0;
      for (let j = 0; j < d.length; j += 4) { if (d[j + 1] > 150 && d[j] < 80) green++; if (d[j] > 150 && d[j + 2] > 150 && d[j + 1] < 80) magenta++; }
      ok({ green, magenta });
    };
    i.src = u;
  }), JSON.parse(two));
  check(hues && hues.green > 10 && hues.magenta > 10, `a two-channel stack's thumbnail shows one channel green and the other magenta: ${JSON.stringify(hues)}`);
  if (shots && two) fs.writeFileSync(path.join(shots, "two_preview.png"), Buffer.from(JSON.parse(two).split(",")[1], "base64"));
  await open();
  await page.dblclick("#drive-list .item:nth-child(1)");
  await page.waitForFunction(() => st.fileName === "a flat.tif");
  await page.waitForTimeout(500);
  check(!(await thumbOf(0)), "opening a flat image saves no thumbnail before it shows");
} catch (e) {
  failed = true; console.error("FAILED: " + e.message);
}
await browser.close(); server.close();
process.exitCode = failed ? 1 : 0;
