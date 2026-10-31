// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from
// ANSWERS (tests/test_study_runs.py), and checks the left bar's Image box and the minimap over the image:
// Load and Unload at the box's foot, a title that keeps its place folded or open, the minimap hovering over
// the image with its collapse, expand and hide, the toolbar's minimap button and its opacity, each channel's
// row (the study's words, then the file's, then red, green and blue) with its black and white points, and
// Unload clearing the page back to where it started. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/image_box_driver.mjs ANSWERS IMAGE.png STUDIES [SHOTS]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { repoFile } from "./repo_file.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [answers, image, studies, shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// the first image opens as the fixture's Python reads it, one grey plane, with a plane's worth of the study's
// own bytes after it; every later one as a file of three channels: the first the study names, the second the file names and colours, the third named by nothing
const STAND_IN = `
const A = await (await fetch("answers.json")).json();
const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
let opens = 0;
postMessage({ type: "ready", info: A.ready.fixture });
onmessage = ({ data: m }) => {
  if (m.type === "open") {
    const one = bytes(A.images);
    // bytes past the planes the study names are its own, not a channel
    if (!opens++) { const more = new Uint8Array(one.length * 2); more.set(one); return postMessage({ type: "opened", meta: A.opened, images: more }, [more.buffer]); }
    const three = new Uint8Array(one.length * 3); three.set(one, 0); three.set(one, one.length); three.set(one, 2 * one.length);
    postMessage({ type: "opened", meta: { ...A.opened, channels: [{ name: "Ch1", colour: "#00ff00" }, { name: "Nuclei", colour: "#ff00ff" }, {}] }, images: three }, [three.buffer]);
  } else if (m.type === "call") { const b = bytes(A.mask); postMessage({ type: "result", action: m.action, meta: A.count, bytes: b, echo: m.echo }, [b.buffer]); }
};`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  const f = u === "/web/answers.json" ? answers : u === "/web/studies.json" ? studies : repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch();
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what, seen) => { if (!ok) { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); } console.log("ok: " + what); };

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
const page = await ctx.newPage();
page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
page.setDefaultTimeout(10000);
await page.goto(origin + "/web/fixture");
await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));
const shot = async (name, sel) => { if (shots) await page.locator(sel).screenshot({ path: path.join(shots, name + ".png") }); };

const loadImage = async () => {
  await page.evaluate(() => { document.querySelector("#status").textContent = ""; });
  await page.setInputFiles("#file", image);
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Image loaded.");
};
const box = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || !e.offsetParent) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
const visible = async (sel) => !!(await box(sel));
// the base canvas's pixel, red green blue
const pixel = (x, y) => page.evaluate(([x, y]) => [...document.querySelector("#base").getContext("2d").getImageData(x, y, 1, 1).data].slice(0, 3), [x, y]);
const opacity = () => page.evaluate(() => Number(getComputedStyle(document.querySelector("#minimap")).opacity));
const title = () => page.click("#image-box > .sec-head h2");

// ---- the box before an image: its title alone in its head, Load at its foot ----
const head = () => page.evaluate(() => { const h = document.querySelector("#image-box > .sec-head"); return [h.children.length, h.querySelector("h2 .title").textContent]; });
await check(JSON.stringify(await head()) === '[1,"Load Image"]', "the box is titled Load Image, with nothing else in its head", await head());
const order = await page.evaluate(() => [...document.querySelector("#image-box").children].map((e) => e.id || e.className));
await check(order[order.length - 1] === "image-foot" && (await page.$("#image-foot #load")) && (await page.$("#image-foot #unload")), "Load and Unload sit at the box's foot", order);
await check(!(await page.$("#left canvas")), "the left bar holds no picture of the image");
await check(!(await visible("#unload")), "no Unload before an image");
await check(!(await visible("#minimap")) && (await page.$eval("#minimap-btn", (b) => b.disabled)), "no minimap, and its button off, before an image");
const open = await box("#image-box > .sec-head h2");
await title(); const folded = await box("#image-box > .sec-head h2"); await title();
await check(open.y === folded.y && open.h === folded.h && open.x === folded.x, "folding the box leaves its title where it was", [open, folded]);

// ---- an image ----
await loadImage();
await title(); // the box folds when an image opens; open it to look inside
await check(await visible("#unload"), "an image open: Unload shows");
await check((await box("#unload")).x > (await box("#load")).x && Math.abs((await box("#unload")).y - (await box("#load")).y) < 4, "Unload stands beside Load");
await shot("image_box", "#image-box");

await check(!(await visible("#minimap")) && (await page.getAttribute("#minimap-btn", "aria-pressed")) === "true", "the whole image in view: no minimap, nothing to navigate, its button still pressed");
for (let k = 0; k < 10; k++) await page.click("#zoom-in"); // the fixture is small: as near as it goes, so the view scrolls
await check(await visible("#minimap"), "zoomed past the view, the minimap shows");
const mm = await box("#minimap"), sc = await box("#scroller");
await check(mm && mm.x >= sc.x && mm.y >= sc.y && mm.x + mm.w <= sc.x + sc.w && mm.y + mm.h <= sc.y + sc.h, "the minimap hovers over the image", [mm, sc]);
await check(mm.x - sc.x < 40 && mm.y - sc.y < 40, "in its top left corner", [mm, sc]);
await check(await page.$eval("#minimap", (m) => { const s = getComputedStyle(m); return s.borderTopStyle === "solid" && parseFloat(s.borderTopWidth) >= 2 && s.borderTopColor === "rgb(255, 255, 255)"; }), "framed by a solid white border");
await check(await page.textContent("#minimap .mm-head") === "Minimap" || (await page.textContent("#minimap .mm-title")) === "Minimap", "its header says Minimap");
await page.mouse.move(5, 5); await page.waitForTimeout(250);
await check((await opacity()) === 1, "opaque at first", await opacity());
await shot("minimap", "#view");

// the view moves where the minimap is clicked
const before = await page.evaluate(() => [document.querySelector("#scroller").scrollLeft, document.querySelector("#scroller").scrollTop]);
const c = await box("#minimap canvas");
await page.mouse.click(c.x + c.w * 0.9, c.y + c.h * 0.9);
const after = await page.evaluate(() => [document.querySelector("#scroller").scrollLeft, document.querySelector("#scroller").scrollTop]);
await check(after[0] > before[0] && after[1] > before[1], "a click on the minimap moves the view there", [before, after]);

// ^ collapses it and the same spot, now v, expands it again; an X across the title hides it
const glyph = () => page.$eval("#minimap-fold", (b) => [...b.querySelectorAll("svg")].find((g) => getComputedStyle(g).display !== "none").dataset.glyph);
const fold = await box("#minimap-fold"), hide = await box("#minimap-hide"), name = await box("#minimap .mm-title");
await check(await glyph() === "up" && /collapse/i.test(await page.getAttribute("#minimap-fold", "aria-label")), "open, its button is ^, to collapse it");
await check(hide && (hide.x + hide.w <= name.x) !== (fold.x + fold.w <= name.x), "its X, which hides it, is across the title from ^", [hide, name, fold]);
await page.mouse.click(fold.x + fold.w / 2, fold.y + fold.h / 2);
await check(!(await visible("#minimap canvas")) && (await visible("#minimap .mm-head")), "^ collapses it to its header");
const expand = await box("#minimap-fold");
await check(expand.x === fold.x && expand.y === fold.y && (await glyph()) === "down" && /expand/i.test(await page.getAttribute("#minimap-fold", "aria-label")), "^ becomes v, Expand, in the same spot", [fold, expand]);
await shot("minimap_collapsed", "#minimap");
await page.mouse.click(fold.x + fold.w / 2, fold.y + fold.h / 2);
await check(await visible("#minimap canvas"), "a second click on the same spot undoes the first");
await page.click("#minimap-hide");
await check(!(await visible("#minimap")) && (await page.getAttribute("#minimap-btn", "aria-pressed")) === "false", "hidden: the minimap goes, and its toolbar button is up");
await page.click("#minimap-btn");
await check((await visible("#minimap canvas")) && (await page.getAttribute("#minimap-btn", "aria-pressed")) === "true", "the toolbar button opens it again");

// hovering the toolbar button opens its opacity
await page.mouse.move(5, 5); await page.hover("#minimap-btn");
await page.waitForFunction(() => document.querySelector("#minimap-pop").matches(":popover-open"));
await page.$eval("#minimap-opacity", (i) => { i.value = 40; i.dispatchEvent(new Event("input", { bubbles: true })); });
await page.mouse.move(5, 5); await page.waitForTimeout(500);
await check(Math.abs((await opacity()) - 0.4) < 0.01, "its popup sets the minimap's opacity at rest", await opacity());
await page.hover("#minimap canvas"); await page.waitForTimeout(250);
await check((await opacity()) === 1, "and it is opaque under the pointer", await opacity());
await page.mouse.move(5, 5);
await check(await page.evaluate(() => JSON.parse(localStorage.getItem("nor-minimap")).opacity) === 0.4, "and the opacity is kept for the next visit");

// the minimap and its button follow the page's state, whoever changes it
await page.evaluate(() => shellForTests.page.set({ minimap: "hidden" }));
await check(!(await visible("#minimap")) && (await page.getAttribute("#minimap-btn", "aria-pressed")) === "false", "the page's state hides the minimap and raises its button");
await page.evaluate(() => shellForTests.page.set({ minimap: "open" }));

// ---- the study's ground-truth button at the toolbar's right end; no right bar ----
const bar = await page.evaluate(() => { const t = [...document.querySelector(".toolbar").children].filter((e) => e.offsetParent && e.tagName !== "SLOT-HERE"); return { last: t[t.length - 1]?.id, right: !!document.querySelector("#right, #gutter-right") }; });
await check(bar.last === "fx-truth" && !bar.right, "the ground-truth button ends the toolbar, and there is no right bar", bar);

// ---- the channel: the study's name and description, its black and white points, its checkbox ----
const rows = () => page.$$eval("#channels .channel", (rs) => rs.map((r) => ({ name: r.querySelector("label").textContent, colour: r.dataset.colour,
  help: r.querySelector(".help")?.dataset.help || "", file: r.querySelector(".from-file")?.textContent || "", levels: r.querySelectorAll("input[type=range]").length })));
let ch = await rows();
await check(ch.length === 1 && ch[0].name === "Grey" && ch[0].colour === "#ffffff" && ch[0].levels === 2, "one row per channel, with a slider of two points", ch);
await check(ch[0].help === (await page.evaluate(async () => (await (await fetch("../studies/fixture/study.json")).json()).channels[0].about)), "its (?) shows the study's description", ch[0].help);
// the squares are 200 and 250 in the image, the rest 0
await check((await pixel(15, 15)).join() === "200,200,200", "the image as it is at first", await pixel(15, 15));
const level = (k, which, v) => page.$eval(`#channels .channel:nth-child(${k}) input.${which}`, (i, v) => { i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); }, v);
await level(1, "white", 100); await page.waitForTimeout(100);
await check((await pixel(15, 15)).join() === "255,255,255" && (await pixel(2, 2)).join() === "0,0,0", "a lower white point brightens the channel", await pixel(15, 15));
await level(1, "white", 255); await level(1, "black", 150); await page.waitForTimeout(100);
const dim = await pixel(15, 15);
await check(dim[0] === Math.round((200 - 150) / (255 - 150) * 255) || Math.abs(dim[0] - (200 - 150) / (255 - 150) * 255) <= 1, "a higher black point darkens it", dim);
await level(1, "black", 250); await level(1, "white", 240);
const pts = await page.$eval("#channels .channel:nth-child(1)", (r) => [+r.querySelector("input.black").value, +r.querySelector("input.white").value]);
await check(pts[0] < pts[1], "the black point stays below the white point", pts);
await page.dblclick("#channels .channel:nth-child(1) .levels");
await check((await pixel(15, 15)).join() === "200,200,200", "a double click puts the points back", await pixel(15, 15));
await page.click("#channels .channel:nth-child(1) input[type=checkbox]");
await check((await pixel(15, 15)).join() === "0,0,0", "its checkbox hides it");

// ---- a file of three channels: the study's words first, then the file's, then red, green and blue ----
await loadImage();
await title();
ch = await rows();
await check(ch.map((r) => r.name).join() === "Grey,Nuclei,Blue" && ch.map((r) => r.colour).join() === "#ffffff,#ff00ff,#0000ff", "the study names its channel; the file the next; red, green and blue the rest", ch);
await check(ch[0].file.includes("Ch1"), "the file's own name for a channel the study names shows beside it", ch[0]);
await check((await pixel(15, 15)).join() === "255,200,255", "each channel in its colour, added", await pixel(15, 15));
await shot("channels", "#image-box");

// ---- Unload: the page as it was before any image ----
await page.click("#unload");
await page.waitForFunction(() => document.querySelector("#file-name").textContent === "No image loaded" && document.querySelector("#fx-result") && document.querySelector("#status").textContent.startsWith("Ready"));
const clear = await page.evaluate(() => ({ stage: document.querySelector("#stage").hidden, empty: !document.querySelector("#empty").hidden,
  minimap: !!document.querySelector("#minimap").offsetParent, unload: !!document.querySelector("#unload").offsetParent, img: !!st.img,
  shine: document.querySelector("#load-main").classList.contains("shine"), done: document.querySelector("#load").classList.contains("done"),
  crumbs: [...document.querySelectorAll("#sb-steps .crumb")].map((c) => c.textContent).join(), fx: document.querySelector("#fx-result").textContent,
  overlay: document.querySelector("#overlay").children.length, status: document.querySelector("#status").textContent }));
await check(clear.stage && clear.empty && !clear.minimap && !clear.unload && !clear.img, "Unload clears the image, the minimap and itself", clear);
await check(clear.shine && !clear.done && clear.crumbs === "Load image", "Load shines again, and the steps start over", clear);
await check(clear.fx === "Nothing counted yet." && !clear.overlay && clear.status.startsWith("Ready"), "the study starts over too", clear);
await check(await page.evaluate(() => [...document.querySelectorAll("#left > .box.foldable")].map((b) => b.classList.contains("folded")).join()) === "false,true,true,true", "and the boxes fold as before any image");
await check((await rows()).map((r) => r.name).join() === "Grey", "and the channels are the study's again");
await done(0);
