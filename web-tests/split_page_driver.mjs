// Drives the page (web/) in headless Chromium on the Image Viewer, a study with nothing of its own, with a stand-in
// worker answering READY (the study's ready()) and an image of IMAGE's size, and checks the shell's Preprocessing
// drawer: it opens with the image, and its Split into parts waits for an image and opens the dialog on it; 2 × 2 and 3 × 3 draw their parts; a line dragged moves its cut; a part
// clicked is left out and clicked again kept; the channels and slices chosen, and the file-name pattern, name the
// parts, a pattern giving two parts one name holds the download; Upload to Google Drive is off and says why; the
// pattern outlives a reload. Download all parts saves the ZIP to OUT/parts.zip, and prints the cuts it was made
// with as JSON. Optional SHOTS: a directory for screenshots. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/split_page_driver.mjs READY IMAGE W H OUT [SHOTS]
import { repoFile } from "./repo_file.mjs";
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
const [ready, image, W, H, out, shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// three channels of gradients, named and coloured as a file would
const STAND_IN = `
const R = await (await fetch("ready.json")).json(), W = ${+W}, H = ${+H};
postMessage({ type: "ready", info: R, secs: 0 });
onmessage = ({ data: m }) => {
  if (m.type !== "open") return;
  const images = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; images[i] = x * 3; images[W * H + i] = y * 4; images[2 * W * H + i] = (x + y) & 64 ? 200 : 0; }
    const channels = [{ name: "Nav1.6", colour: "#ff0000" }, { name: "Caspr", colour: "#00ff00" }, { name: "DAPI", colour: "#0000ff" }];
  postMessage({ type: "opened", meta: { H, W, um: 0.25, channels }, images, secs: 0 }, [images.buffer]);
};`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  if (u === "/web/ready.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end(fs.readFileSync(ready)); }
  if (u === "/web/vendor/wheels.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end("[]"); }
  const f = repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch();
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what, seen) => { if (!ok) { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); } console.error("ok: " + what); };
const shot = async (page, name) => { if (shots) await page.locator("#split-dlg").screenshot({ path: path.join(shots, name + ".png") }); };

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
const page = await ctx.newPage();
page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
await page.goto(origin + "/web/?study=viewer");
await page.waitForFunction(() => document.querySelector("#split-open"));

await check(await page.isDisabled("#split-open"), "Split into parts waits for an image");
await page.setInputFiles("#file", image);
await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Image loaded."), null, { timeout: 8000 }).catch(async () => { await check(false, "the image loads", await page.evaluate(() => document.querySelector("#status").textContent)); });
await page.waitForFunction(() => !document.querySelector("#split-open").disabled);
await check(await page.evaluate(() => !document.querySelector("#preprocessing-box").classList.contains("folded")), "the Preprocessing drawer opens with the image");
await page.click("#split-open");
await page.waitForFunction(() => document.querySelector("#split-dlg").open);

const state = () => page.evaluate(() => ({
  cells: [...document.querySelectorAll("#split-grid .cell")].length,
  left: [...document.querySelectorAll("#split-grid .cell.left")].map((c) => c.dataset.part),
  grips: [...document.querySelectorAll("#split-grid .grip")].map((g) => g.dataset.cut + "=" + (g.dataset.cut[0] === "x" ? g.getAttribute("x1") : g.getAttribute("y1"))),
  names: [...document.querySelectorAll("#split-names li")].map((l) => l.textContent),
  channels: [...document.querySelectorAll("#split-channel-list label")].map((l) => l.textContent),
  slices: [document.querySelector("#split-slices").hidden, document.querySelector("#split-z-of").textContent],
  msg: document.querySelector("#split-msg").textContent, download: !document.querySelector("#split-download").disabled,
  drive: [document.querySelector("#split-drive").disabled, document.querySelector("#split-drive").title],
}));
let s = await state();
await check(s.cells === 4 && s.grips.length === 2, "the dialog opens on the image cut into 2 × 2", s);
await check(s.channels.join() === "Nav1.6,Caspr,DAPI" && !s.slices[0] && s.slices[1] === "of 4", "it offers the image's channels by the names the page gives them, and its 4 slices", s);
await check(s.drive[0] && /sign-in/.test(s.drive[1]), "Upload to Google Drive is off and says why", s.drive);
await check(s.names[0] === "stack_r1c1.tif" && s.download, "the parts are named _r{row}c{col} at first", s.names);
await shot(page, "split-2x2");

await page.click('#split-n [data-n="3"]');
s = await state();
await check(s.cells === 9 && s.grips.length === 4 && s.names.length === 6 && s.names[5] === "… and 4 more", "3 × 3 cuts nine parts", s);

// the first vertical cut, dragged right by a tenth of the preview
const grip = page.locator('#split-grid [data-cut="x1"]'), box = await grip.boundingBox(), view = await page.locator("#split-grid").boundingBox();
const before = s.grips.find((g) => g.startsWith("x1="));
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + view.width / 10, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
s = await state();
const after = s.grips.find((g) => g.startsWith("x1="));
await check(+after.slice(3) > +before.slice(3) + W / 20, "a line dragged moves its cut", [before, after]);

// the middle part left out, then the first, then the first kept again
const cell = async (part) => { const b = await page.locator(`#split-grid .cell[data-part="${part}"]`).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
await cell("2,2"); await cell("1,1");
s = await state();
await check(JSON.stringify(s.left) === '["1,1","2,2"]' && s.msg === "7 parts to write.", "a part clicked is left out", s);
await cell("1,1");
s = await state();
await check(s.left.join() === "2,2" && s.msg === "8 parts to write." && s.names[0] === "stack_r1c1.tif", "and clicked again is kept", s);
await shot(page, "split-3x3");

await page.uncheck("#split-channel-list label:nth-child(3) input");
await page.fill("#split-z0", "2"); await page.fill("#split-z1", "3");
await page.fill("#split-pattern", "_x");
s = await state();
await check(!s.download && /same name/.test(s.msg), "a pattern that names two parts alike holds the download", s);
await page.fill("#split-z0", "4");
await page.fill("#split-pattern", "_part{n}");
s = await state();
await check(!s.download && /slices/i.test(s.msg), "slices from after their end hold it too", s);
await page.fill("#split-z0", "2");
s = await state();
await check(s.download && s.names[0] === "stack_part1.tif" && s.names[1] === "stack_part2.tif", "the pattern names the parts", s.names);

const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#split-download")]);
fs.mkdirSync(out, { recursive: true });
await dl.saveAs(path.join(out, "parts.zip"));
await check(dl.suggestedFilename() === "stack_parts.zip", "Download all parts gives one ZIP named for the image", dl.suggestedFilename());
await page.waitForFunction(() => /^Downloaded/.test(document.querySelector("#split-msg").textContent));
await shot(page, "split-downloaded");
const cuts = s.grips;

await page.click("#split-close");
await page.reload();
await page.waitForFunction(() => document.querySelector("#split-open"));
await page.setInputFiles("#file", image);
await page.waitForFunction(() => !document.querySelector("#split-open").disabled);
await page.click("#split-open");
await page.waitForFunction(() => document.querySelector("#split-dlg").open);
await check(await page.inputValue("#split-pattern") === "_part{n}", "the pattern outlives a reload");

console.log(JSON.stringify({ cuts }));
await done(0);
