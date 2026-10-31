// Drives the vascular study's page (web/) in headless Chromium against a stand-in worker that opens a drawn stack
// under the name of a stack the study ships a draft model for, so the real draft opens with it. Checks 4.3 to 4.5:
// the draft opens side by side and goes over the stack; Detected keeps only the signal near the model; Item View
// shows its cards and approves a low-confidence vessel from one; Submit Ground Truth stays off until the model carries
// a correction and then exports the corrected model, from the Item View only; undo takes the approval back; the model's canvas leaves the 3D
// view with the study. Exits 1 on a failed check, 2 when it cannot run.
//   node studies/vascular/tests/model_page_driver.mjs
import { repoFile } from "../../../web-tests/repo_file.mjs";
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
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const drafts = JSON.parse(fs.readFileSync(path.join(repo, "studies", "vascular", "web", "models", "index.json"), "utf8"));
const draft = JSON.parse(fs.readFileSync(path.join(repo, "studies", "vascular", "web", "models", drafts[0].file), "utf8"));
const NAME = drafts[0].source;

// a stack as many slices deep as the draft, its signal a grid of bright lines nowhere near most of the model's vessels
const STAND_IN = `
const W = 120, H = 120, Z = ${draft.slices}, n = W * H;
const vol = new Uint8Array(Z * n);
for (let z = 0; z < Z; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) vol[z * n + y * W + x] = (x % 17 < 2 || y % 23 < 2) ? 240 : 10;
const flat = new Uint8Array(n);
for (let z = 0; z < Z; z++) for (let i = 0; i < n; i++) flat[i] = Math.max(flat[i], vol[z * n + i]);
const meta = { W, H, Z, spacing: null, um: ${draft.um_per_px} * ${draft.size_px[0]} / W, um_y: ${draft.um_per_px} * ${draft.size_px[1]} / H,
  info: [["Slices", String(Z)]], channels: [{ name: "CD31", colour: "#ff0000" }] };
postMessage({ type: "ready", info: {} });
onmessage = ({ data: m }) => {
  if (m.type === "study") postMessage({ type: "ready", info: {} });
  else if (m.type === "open") { const images = new Uint8Array(flat.length + vol.length); images.set(flat); images.set(vol, flat.length); postMessage({ type: "opened", meta, images }, [images.buffer]); }
};`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  if (u === "/web/vendor/wheels.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end("[]"); }
  const f = repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch();
let failed = false;
const check = (ok, what) => { if (!ok) { failed = true; console.error("FAILED: " + what); } else console.log("ok: " + what); };
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
const page = await ctx.newPage();
page.on("pageerror", (e) => { failed = true; console.error("page error: " + e.message); });
page.setDefaultTimeout(10000);

// the 3D view's brightness now, its mean over every pixel of red, green and blue
const brightness = () => page.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 300));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const gl = document.querySelector("#v3-gl"), c = document.createElement("canvas"); c.width = gl.width; c.height = gl.height;
  const g = c.getContext("2d"); g.drawImage(gl, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
  return s / (d.length / 4);
});
const facts = () => page.textContent("#model-facts");

try {
  await page.goto(origin + "/web/vascular");
  await page.waitForFunction(() => window.$ && $("#status").textContent.startsWith("Ready"));
  await page.setInputFiles("#file", { name: NAME, mimeType: "image/tiff", buffer: Buffer.from([0x49, 0x49, 42, 0]) });
  await page.waitForFunction(() => !$("#model-on").hidden);
  await page.evaluate(() => { $("#notice").hidden = true; });
  check(/vessel edges/.test(await facts()), `the stack's draft opens with it: ${(await facts()).slice(0, 80)}`);
  check(await page.evaluate(() => $("#v3-stage").classList.contains("split") && !!$("#v3-stage #mcv")), "the model opens side by side with the stack");
  await page.click('#model-mode [data-v="overlay"]');
  check(await page.evaluate(() => !$("#v3-stage").classList.contains("split") && !!$("#v3-stage #mcv")), "Overlay draws it over the stack");

  const all = await brightness();
  await page.click('#review-mode [data-v="detected"]');
  const detected = await brightness();
  check(detected < all * 0.8, `Detected keeps only the signal near the model's vessels: ${all.toFixed(2)} → ${detected.toFixed(2)}`);
  await page.click('#review-mode [data-v="all"]');

  check(await page.isHidden("#vm-truth"), "Submit Ground Truth is not in the image view");
  await page.click("#item-switch");
  check(await page.isVisible("#vm-truth"), "Submit Ground Truth is in the Item View");
  await page.click("#vm-truth");
  check(await page.evaluate(() => $("#gt-dlg").open && $("#gt-export").disabled), "Submit Ground Truth has nothing to export before a correction");
  await page.click("#gt-close");

  await page.click('#item-kind [data-v="vessels"]');
  await page.selectOption("#item-filter", "review");
  await page.waitForSelector("#item-list .card:not(.placeholder) button.yes");
  const cards = await page.locator("#item-list .card:not(.placeholder)").count();
  check(cards > 0, `Item View shows the low-confidence vessels as cards: ${cards}`);
  await page.click("#item-list .card:not(.placeholder) button.yes");
  check(/1 approved/.test(await facts()), "a card's Approve approves the vessel");

  await page.click("#vm-truth");
  check(await page.evaluate(() => !$("#gt-export").disabled), "with a correction, the model can be exported");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#gt-export")]);
  const doc = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  check(doc.status === "corrected" && doc.corrections === 1 && doc.edges.some((e) => e.state === "accepted") && dl.suggestedFilename().endsWith(".vessels.corrected.json"),
    `the export is the corrected model: ${dl.suggestedFilename()}, status ${doc.status}, ${doc.corrections} correction`);
  await page.click("#gt-close");

  await page.click("#item-switch");
  await page.click("#m-undo");
  check(/0 approved/.test(await facts()), "Undo takes the approval back");

  await page.evaluate(() => { const a = [...document.querySelectorAll("#study-list a")].find((x) => x.textContent.includes("Image Viewer")); a.click(); });
  await page.waitForFunction(() => $("#title").textContent === "Image Viewer");
  check(await page.evaluate(() => !document.querySelector("#mcv")), "the model's canvas leaves the 3D view with the study");
} catch (e) {
  failed = true; console.error(e);
}
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
