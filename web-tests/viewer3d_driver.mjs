// Drives the 3D viewer (web/viewer3d.js) in headless Chromium, in the vascular study (viewer image3d), against a
// stand-in worker that opens a drawn stack: two channels, the first a bright tube climbing through depth and a
// second one level across it, the second a blob. Checks req/shell/viewer-3d: a stack opens on the 3D view, which draws it; the
// channel rows drive it (hiding a channel or raising its black point darkens it); the toolbar's right holds Look from's
// four buttons in a row beside Zoom, and the image box a row for the slices shown and their spacing and, per channel, Colour by depth; Side turns the view; a sideways scroll turns the picture about the line of sight; a drag turns on past
// looking straight across; the Panning label, at the bottom left, toggles panning, shift holds it on, and it is stored nowhere; the depth slab hides slices; the spacing's tooltip says where it came from; no 2D/3D switch
// anywhere, and Edit Image on a stack offers no flat-image drawing tools. And req/shell/image-viewer: the Image Viewer
// opens a stack in 3D and a flat image (a .png here) in 2D, and keeps its Image box open once either has loaded.
// Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/viewer3d_driver.mjs [SHOT.png]
import { repoFile } from "./repo_file.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { offSite } from "./off_site.mjs";
import { ENGINE, LAUNCH } from "./engine.mjs";
import { standInDrive, openFromDrive } from "./drive_open.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [shot] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// the stand-in: every study is ready at once, and any file opens as the same drawn stack, a .png as its flattened planes
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
  else if (m.type === "open" && m.name.endsWith(".png")) { const images = flat.slice(); postMessage({ type: "opened", meta: { ...meta, Z: 1 }, images }, [images.buffer]); }
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

const browser = await pw[ENGINE].launch(LAUNCH);
let failed = false;
const check = (ok, what) => { if (!ok) { failed = true; console.error("FAILED: " + what); } else console.log("ok: " + what); };
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.route(offSite(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await standInDrive(ctx);
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
  let r = 0, gr = 0, b = 0, lit = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]; gr += d[i + 1]; b += d[i + 2];
    if (d[i] + d[i + 1] + d[i + 2] > 60) { const x = (i / 4) % c.width, y = Math.floor(i / 4 / c.width); lit++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; }
  }
  const n = d.length / 4, mx = sx / lit, my = sy / lit;
  // the direction of the lit pixels' long axis on the screen, radians
  const axis = 0.5 * Math.atan2(2 * (sxy / lit - mx * my), sxx / lit - mx * mx - (syy / lit - my * my));
  return { r: r / n, g: gr / n, b: b / n, lit, sum: (r + gr + b) / n, axis };
});
// a view chosen from the reset button's arrow, which then names it and puts the view there
const look = async (v) => { await page.click("#v3-look-menu summary"); await page.click(`#v3-look [data-look="${v}"]`); };
const show = (k, on) => page.evaluate(([k, on]) => { const b = document.querySelector("#show-" + k); b.checked = on; b.dispatchEvent(new Event("change", { bubbles: true })); }, [k, on]);
const level = async (k, which, v) => page.evaluate(([k, which, v]) => {
  const s = document.querySelectorAll("#channels .channel")[k].querySelector("." + which); s.value = v; s.dispatchEvent(new Event("input", { bubbles: true }));
}, [k, which, v]);

try {
  await page.goto(origin + "/web/vascular");
  await page.waitForFunction(() => window.$ && $("#status").textContent.startsWith("Ready"));
  // the 3D view needs WebGL2, which a headless browser may lack: then only the rest is checked
  const gl3d = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"));
  if (gl3d) {
    await openFromDrive(page, { name: "stack.tif", mimeType: "image/tiff", buffer: Buffer.from([0x49, 0x49, 42, 0]) });
    await page.waitForFunction(() => !$("#v3-stage").hidden);
    check(!(await page.$("#v3-switch, #v3-2d")) && await page.isHidden("#stage"), "a stack opens on the 3D view only, with no 2D/3D switch to flatten it");
    const tools = await page.evaluate(() => {
      const looks = [...document.querySelectorAll(".toolbar #v3-look [data-look]")], zoom = $("#zoom-out").parentElement;
      const z = zoom.getBoundingClientRect(), g = $("#v3-look")?.getBoundingClientRect();
      return {
        looks: looks.map((b) => b.textContent).join(), reset: $("#v3-reset")?.textContent, closed: looks.every((b) => !b.checkVisibility()),
        beside: !!g && g.right <= z.left && z.left - g.right < 24 && Math.abs((g.top + g.bottom) / 2 - (z.top + z.bottom) / 2) < 4,
        gone: ["#v3-render-btn", "#v3-depth", "#vm-depth", "#v3-slices-btn"].filter((s) => document.querySelector(s)),
        zoom: ["#zoom-in", "#zoom-out", "#zoom-label"].every((s) => $(s).offsetParent !== null),
      };
    });
    check(tools.reset === "Top View" && tools.looks === "Top,Tilted,Side,Front" && tools.closed && tools.beside && !(await page.$("#v3-stage #v3-tools")),
      `beside Zoom a Top View button, its arrow offering Top, Tilted, Side and Front: ${JSON.stringify(tools)}`);
    check(!tools.gone.length, `the toolbar has no Render, Colour by depth or Slices tool: ${tools.gone}`);
    check(tools.zoom && await page.isHidden("#ruler-btn"), "Zoom stays in 3D, the other 2D tools step aside");
    const z0 = await page.textContent("#zoom-label");
    await page.click("#zoom-in");
    await picture();
    const z1 = await page.textContent("#zoom-label");
    check(parseInt(z1) > parseInt(z0), `Zoom in zooms the 3D view: ${z0} → ${z1}`);
    await page.click("#zoom-out");
    const slicesRow = await page.evaluate(() => { const r = $("#channels .v3-slices"); return r && !!r.querySelector("#v3-z0") && !!r.querySelector("#v3-z1") && !!r.querySelector("#v3-zs"); });
    check(slicesRow, "the slices shown and their spacing are a row in the image box, under the channels' rows");
    // req/shell/viewer-3d: Colour by depth is each channel's, a tick under its row; ticked, its colour picker is a
    // palette picker, and two channels by depth take two palettes. The study ticks CD31's from the start.
    if (await page.evaluate(() => $("#image-box").classList.contains("folded"))) { await page.click("#image-box"); await page.waitForFunction(() => !$("#image-box").classList.contains("folded")); }
    const depthRows = () => page.evaluate(() => [...document.querySelectorAll("#channels > .channel:not(.v3-slices)")].map((r) => {
      const sub = r.nextElementSibling?.matches(".v3-depth-row") ? r.nextElementSibling : null, pal = r.querySelector(".v3-palette");
      return { name: r.querySelector("label").textContent, tick: sub ? sub.querySelector("input[type=checkbox]").checked : null,
        picker: pal ? pal.dataset.palette : r.querySelector("input[type=color]") ? "colour" : null };
    }));
    const dep0 = await depthRows();
    check(dep0.length === 2 && dep0[0].tick === true && !["colour", null].includes(dep0[0].picker) && dep0[1].tick === false && dep0[1].picker === "colour",
      `CD31 opens coloured by depth, its colour picker a palette picker, and DAPI in its colour, each with its own tick: ${JSON.stringify(dep0)}`);
    await page.check("#depth-1");
    const dep1 = await depthRows();
    check(dep1[1].tick && !["colour", null, dep1[0].picker].includes(dep1[1].picker), `ticking DAPI gives it a palette of its own, not CD31's: ${JSON.stringify(dep1)}`);
    const painted = await picture();
    await page.uncheck("#depth-0");
    const plain = await picture(), dep2 = await depthRows();
    check(dep2[0].picker === "colour" && (Math.abs(painted.r - plain.r) > 1 || Math.abs(painted.g - plain.g) > 1 || Math.abs(painted.b - plain.b) > 1),
      `unticking CD31 draws it in its colour again, its picker a colour picker: ${JSON.stringify([dep2, painted, plain])}`);
    await page.check("#depth-0");
    const palWas = (await depthRows())[0].picker, pic0 = await picture();
    await page.click("#channels .channel .v3-palette");
    const offer = await page.evaluate(() => [...document.querySelectorAll(".v3-palettes [data-palette]")].map((b) => ({ p: b.dataset.palette, off: b.disabled })));
    const taken = (await depthRows())[1].picker;
    check(offer.find((o) => o.p === taken)?.off && offer.filter((o) => o.off).length === 1, `CD31's picker offers every palette but DAPI's, ${taken}: ${JSON.stringify(offer)}`);
    const palNew = offer.find((o) => !o.off && o.p !== palWas).p;
    await page.click(`.v3-palettes [data-palette="${palNew}"]`);
    const pic1 = await picture(), palNow = (await depthRows())[0].picker;
    check(palNow === palNew && (Math.abs(pic1.r - pic0.r) > 0.3 || Math.abs(pic1.g - pic0.g) > 0.3 || Math.abs(pic1.b - pic0.b) > 0.3),
      `the palette picker chooses CD31's palette and repaints it: ${palWas} → ${palNow}, ${JSON.stringify([pic0, pic1])}`);
    await page.click("#channels .channel .v3-palette"); await page.click(`.v3-palettes [data-palette="${palWas}"]`);
    await page.uncheck("#depth-1");
    const rows = await page.evaluate(() => [...document.querySelectorAll("#channels > .channel:not(.v3-slices)")].map((r) => r.querySelector("label").textContent));
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

    const top = await picture();
    await look("side");
    const sideRot = await page.evaluate(() => JSON.stringify(window.shellForTests.viewer.three.S.rot));
    check(await page.textContent("#v3-reset") === "Side View", "choosing Side names the reset button after it");
    const gl0 = await page.locator("#v3-gl").boundingBox(), at = [gl0.x + gl0.width / 2, gl0.y + gl0.height / 2];
    await page.mouse.move(...at); await page.mouse.down(); await page.mouse.move(at[0] + 50, at[1] + 30, { steps: 5 }); await page.mouse.up();
    await page.click("#v3-reset");
    check(await page.evaluate(() => JSON.stringify(window.shellForTests.viewer.three.S.rot)) === sideRot, "after a drag, Side View puts the view back to the side");
    const side = await picture();
    check(Math.abs(side.lit - top.lit) > top.lit * 0.2, `Side turns the view: ${top.lit} → ${side.lit} lit pixels`);
    await look("top");

    const box = await page.locator("#v3-gl").boundingBox(), mid = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(...mid); await page.mouse.wheel(300, 0);
    const rolled = await picture(), turned = Math.abs(Math.atan2(Math.sin(2 * (rolled.axis - top.axis)), Math.cos(2 * (rolled.axis - top.axis))) / 2);
    check(turned > 0.4 && Math.abs(rolled.lit - top.lit) < top.lit * 0.1,
      `a sideways scroll turns the picture about the line of sight: its long axis turns ${turned.toFixed(2)} rad, ${top.lit} → ${rolled.lit} lit pixels`);
    await look("top");
    await page.mouse.move(...mid); await page.mouse.down();
    await page.mouse.move(mid[0], mid[1] + Math.PI / 0.008, { steps: 20 }); await page.mouse.up();
    const under = await picture();
    check(Math.abs(under.lit - top.lit) < top.lit * 0.15,
      `dragging down by half a turn turns on past looking straight across, to the stack from beneath: ${top.lit} → ${under.lit} lit pixels`);
    await look("top");

    // the Panning label: always at the bottom of the view, blue outlined while on, grey while off; a click toggles it,
    // shift holds it on until let go, back to what the label holds; and nothing of it is stored
    // (the action log, which records the clicks for a problem report, aside)
    const stored = () => page.evaluate(() => { const l = { ...localStorage }; delete l["nor-actions"]; return JSON.stringify([l, { ...sessionStorage }]); });
    const before = await stored();
    const label = () => page.evaluate(() => {
      const b = $("#v3-pan"), v = $("#v3-stage").getBoundingClientRect(), r = b?.getBoundingClientRect();
      return b && { text: b.textContent.trim(), on: b.getAttribute("aria-pressed") === "true", fill: getComputedStyle(b).backgroundColor, tip: b.title,
        shown: b.checkVisibility(), corner: r.bottom <= v.bottom && v.bottom - r.bottom < 24 && r.left >= v.left && r.left - v.left < 24 };
    });
    const drag = async () => {
      const at = () => page.evaluate(() => { const S = window.shellForTests.viewer.three.S; return JSON.stringify([S.rot, S.pivot]); });
      const [rot0, piv0] = JSON.parse(await at());
      await page.mouse.move(...mid); await page.mouse.down(); await page.mouse.move(mid[0] + 60, mid[1] + 40, { steps: 6 }); await page.mouse.up();
      const [rot1, piv1] = JSON.parse(await at());
      return { turned: JSON.stringify(rot0) !== JSON.stringify(rot1), panned: JSON.stringify(piv0) !== JSON.stringify(piv1) };
    };
    const off = await label();
    check(off && off.text === "Panning" && off.shown && off.corner && !off.on && /press shift to pan/i.test(off.tip),
      `a Panning label shows at the 3D view's bottom left, off, its tooltip saying to press Shift: ${JSON.stringify(off)}`);
    const d0 = await drag();
    check(d0.turned && !d0.panned, `with panning off a drag turns the view: ${JSON.stringify(d0)}`);
    await page.click("#v3-pan");
    const on = await label();
    check(on.on && on.fill !== off.fill && /^rgba?\(\s*\d{1,2},\s*\d+,\s*2\d\d(,\s*1)?\)$/.test(on.fill), `clicking the label turns panning on, filled blue: ${off.fill} → ${on.fill}`);
    const d1 = await drag();
    check(d1.panned && !d1.turned, `with panning on a drag pans: ${JSON.stringify(d1)}`);
    await page.keyboard.down("Shift"); await page.keyboard.up("Shift");
    check((await label()).on, "pressing and letting go of shift leaves panning on when it was on");
    await page.click("#v3-pan");
    check(!(await label()).on, "clicking the label again turns panning off");
    await page.keyboard.down("Shift");
    const held = await label(), d2 = await drag();
    check(held.on && d2.panned && !d2.turned, `holding shift turns panning on: ${JSON.stringify({ on: held.on, ...d2 })}`);
    await page.keyboard.up("Shift");
    const let_ = await label(), d3 = await drag();
    check(!let_.on && d3.turned && !d3.panned, `letting go of shift returns panning to off: ${JSON.stringify({ on: let_.on, ...d3 })}`);
    const after = await stored(); check(after === before, `the panning state is stored nowhere: ${before} → ${after}`);
    await look("top");

    await page.evaluate(() => { const s = $("#v3-z1"); s.value = 0; s.dispatchEvent(new Event("input", { bubbles: true })); });
    const slab = await picture();
    check(slab.sum < top.sum * 0.6, `showing only the first slice hides the rest: brightness ${top.sum.toFixed(1)} → ${slab.sum.toFixed(1)}`);

    // req/shell/viewer-3d: who stated the spacing is the spacing's tooltip, and no text sits over the 3D view
    const said = await page.evaluate(() => ({ tip: $("#v3-zs").title, over: [...$("#v3-stage").querySelectorAll("p")].filter((e) => e.checkVisibility() && e.textContent.trim()).map((e) => e.textContent) }));
    check(/owner/i.test(said.tip) && !said.over.length, `the spacing's tooltip says who stated it, and no text is over the view: ${JSON.stringify(said)}`);

    // Data Management wants a signed-in Drive; its Edit Image box is only kept out of sight outside it
    await page.evaluate(() => { document.documentElement.dataset.mode = "data"; $("#edit-open").click(); });
    await page.waitForFunction(() => !$("#edit-box").hidden);
    check(await page.isVisible("#edit-slices-sec") && await page.isHidden("#edit-crop") && await page.isHidden("#edit-lasso") && await page.isHidden("#edit-split-hint"),
      "Edit Image on a stack offers no Crop or Imperfections lasso, which draw on a flat image");
    check(await page.isVisible("#v3-stage") && await page.isHidden("#stage"), "Edit Image keeps the stack in 3D");
    await page.click("#edit-done");
    await page.evaluate(() => delete document.documentElement.dataset.mode);
  } else console.log(`not checked in this ${ENGINE}: the 3D view, which needs the WebGL2 it lacks`);

  // the Image Viewer, at the bare address: the viewer follows the image, and its one step leaves the Image box open
  await page.goto(origin + "/web/");
  await page.waitForFunction(() => window.$ && $("#title").textContent === "Image Viewer" && $("#status").textContent.startsWith("Ready"));
  const loaded = async (name) => {
    await page.setInputFiles("#file", { name, mimeType: "image/tiff", buffer: Buffer.from([0x49, 0x49, 42, 0]) });
    await page.waitForFunction((name) => window.shellForTests.page.get("image")?.name === name && $("#status").textContent === "Image loaded.", name);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return page.evaluate(() => ({ in3d: !!$("#v3-stage")?.checkVisibility(), flat: $("#stage").checkVisibility(), open: !$("#image-box").classList.contains("folded") }));
  };
  if (gl3d) {
    const stack = await loaded("stack.tif");
    check(stack.in3d && !stack.flat, `the Image Viewer opens a stack in 3D: ${JSON.stringify(stack)}`);
    check(stack.open, "the Image Viewer keeps its Image box open once a stack has loaded");
  }
  const png = await loaded("flat.png");
  check(!png.in3d && png.flat, `the Image Viewer opens a flat image in 2D: ${JSON.stringify(png)}`);
  check(!(await page.$("#channels .v3-slices")), "a flat image has no slices' row");
  check(png.open, "the Image Viewer keeps its Image box open once a flat image has loaded");

  await page.goto(origin + "/web/fixture");
  await page.waitForFunction(() => window.$ && $("#title").textContent === "Fixture");
  check(!(await page.$("#v3-switch")), "a 2D study has no 2D/3D switch");

  // a browser without WebGL2: the stack still opens, flattened, its volume there for the study to read
  const noGl = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await noGl.route(offSite(origin), (r) => r.abort());
  await noGl.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return kind === "webgl2" ? null : get.call(this, kind, ...rest); };
  });
  await standInDrive(noGl);
  const p2 = await noGl.newPage();
  p2.on("pageerror", (e) => { failed = true; console.error("page error, no WebGL2: " + e.message); });
  await p2.goto(origin + "/web/vascular");
  await p2.waitForFunction(() => window.$ && $("#status").textContent.startsWith("Ready"));
  await openFromDrive(p2, { name: "stack.tif", mimeType: "image/tiff", buffer: Buffer.from([0x49, 0x49, 42, 0]) });
  await p2.waitForFunction(() => window.shellForTests.page.get("image"));
  const seen = await p2.evaluate(() => ({ shape: window.shellForTests.viewer.three?.meta?.shape || null, flat: !$("#stage").hidden, switch: !!$("#v3-switch") }));
  check(seen.shape?.length === 3 && seen.flat && !seen.switch, `with no WebGL2 the stack opens flattened, with no 2D/3D switch, its volume there: ${JSON.stringify(seen)}`);
} catch (e) {
  failed = true; console.error(e);
}
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
