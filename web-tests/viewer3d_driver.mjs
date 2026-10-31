// Drives the 3D viewer (web/viewer3d.js) in headless Chromium, in the vascular study (viewer image3d), against a
// stand-in worker that opens a drawn stack: two channels, the first a bright tube climbing through depth and a
// second one level across it, the second a blob. Checks 1.48: a stack opens on the 3D view, which draws it; the
// channel rows drive it (hiding a channel or raising its black point darkens it); Colour by depth paints by
// depth; Side turns the view; the depth slab hides slices; the spacing says where it came from; a 2D study
// shows no switch. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/viewer3d_driver.mjs [SHOT.png]
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
const [shot] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// the stand-in: every study is ready at once, and any file opens as the same drawn stack
const STAND_IN = `
const W = 96, H = 80, Z = 12, C = 2, n = W * H;
const vol = new Uint8Array(C * Z * n);
for (let z = 0; z < Z; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = z * n + y * W + x;
  const t = x / (W - 1), climb = Math.hypot(y - (10 + t * 60), z - t * (Z - 1));
  const level = Math.hypot(y - (H - 1 - (x / (W - 1)) * 60), z - 2);
  vol[i] = Math.max(climb < 2.5 ? 230 : 0, level < 2.5 ? 200 : 0, 8);
  vol[Z * n + i] = Math.hypot(x - 70, y - 20, z - 6) < 6 ? 180 : 4;
}
const flat = new Uint8Array(C * n);
for (let c = 0; c < C; c++) for (let z = 0; z < Z; z++) for (let i = 0; i < n; i++) flat[c * n + i] = Math.max(flat[c * n + i], vol[c * Z * n + z * n + i]);
const meta = { W, H, Z, spacing: null, um: 1, um_y: 1, info: [["Slices", String(Z)]], channels: [{ name: "CD31", colour: "#ff0000" }, { name: "DAPI", colour: "#0000ff" }] };
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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
const page = await ctx.newPage();
page.on("pageerror", (e) => { failed = true; console.error("page error: " + e.message); });
page.setDefaultTimeout(10000);

// the 3D view's picture as it is now: mean red, green and blue (0-255), and how many pixels are lit
const picture = () => page.evaluate(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const gl = document.querySelector("#v3-gl"), c = document.createElement("canvas");
  c.width = gl.width; c.height = gl.height;
  const g = c.getContext("2d"); g.drawImage(gl, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let r = 0, gr = 0, b = 0, lit = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; if (d[i] + d[i + 1] + d[i + 2] > 60) lit++; }
  const n = d.length / 4;
  return { r: r / n, g: gr / n, b: b / n, lit, sum: (r + gr + b) / n };
});
const show = (k, on) => page.evaluate(([k, on]) => { const b = document.querySelector("#show-" + k); b.checked = on; b.dispatchEvent(new Event("change", { bubbles: true })); }, [k, on]);
const level = async (k, which, v) => page.evaluate(([k, which, v]) => {
  const s = document.querySelectorAll("#channels .channel")[k].querySelector("." + which); s.value = v; s.dispatchEvent(new Event("input", { bubbles: true }));
}, [k, which, v]);

try {
  await page.goto(origin + "/web/vascular");
  await page.waitForFunction(() => window.$ && $("#status").textContent.startsWith("Ready"));
  await page.setInputFiles("#file", { name: "stack.tif", mimeType: "image/tiff", buffer: Buffer.from([0x49, 0x49, 42, 0]) });
  await page.waitForFunction(() => !$("#v3-stage").hidden);
  check(await page.isVisible("#v3-switch"), "a stack opens on the 3D view, with the 2D/3D switch in the toolbar");
  const rows = await page.evaluate(() => [...document.querySelectorAll("#channels .channel")].map((r) => r.querySelector("label").textContent));
  check(rows.join() === "CD31,DAPI", `the channel rows are the stack's: ${rows}`);
  await level(0, "black", 0);
  const all = await picture();
  check(all.lit > 500, `the 3D view draws the stack: ${all.lit} lit pixels`);
  if (shot) await page.locator("#view").screenshot({ path: shot });

  await show(0, false);
  const noCd31 = await picture();
  check(noCd31.r < all.r * 0.5, `hiding CD31 takes its red out of the 3D view: red ${all.r.toFixed(1)} → ${noCd31.r.toFixed(1)}`);
  await show(0, true);
  await level(0, "black", 240);
  const dark = await picture();
  check(dark.r < all.r * 0.5, `raising CD31's black point darkens it in 3D: red ${all.r.toFixed(1)} → ${dark.r.toFixed(1)}`);
  await level(0, "black", 0);

  const depthOn = await page.isChecked("#v3-depth");
  await page.setChecked("#v3-depth", !depthOn);
  const other = await picture();
  const plain = depthOn ? other : all, byDepth = depthOn ? all : other;
  check(byDepth.g > plain.g + 1, `Colour by depth paints the tubes in depth colours, not CD31's red: green ${plain.g.toFixed(1)} → ${byDepth.g.toFixed(1)}`);
  await page.setChecked("#v3-depth", false);

  const top = await picture();
  await page.click('#v3-look [data-look="side"]');
  const side = await picture();
  check(Math.abs(side.lit - top.lit) > top.lit * 0.2, `Side turns the view: ${top.lit} → ${side.lit} lit pixels`);
  await page.click('#v3-look [data-look="top"]');

  await page.evaluate(() => { const s = $("#v3-z1"); s.value = 0; s.dispatchEvent(new Event("input", { bubbles: true })); });
  const slab = await picture();
  check(slab.r < top.r * 0.6, `showing only the first slice hides the rest: red ${top.r.toFixed(1)} → ${slab.r.toFixed(1)}`);

  const note = await page.textContent("#v3-note");
  check(/owner/i.test(note), `the spacing says who stated it: "${note}"`);

  await page.click("#v3-2d");
  check(await page.isHidden("#v3-stage") && await page.isVisible("#stage"), "2D shows the flattened stack again");

  await page.goto(origin + "/web/fixture");
  await page.waitForFunction(() => window.$ && $("#title").textContent === "Fixture");
  check(await page.isHidden("#v3-switch"), "a 2D study has no 2D/3D switch");
} catch (e) {
  failed = true; console.error(e);
}
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
