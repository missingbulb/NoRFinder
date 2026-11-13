// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from
// ANSWERS (tests/test_study_runs.py), and checks the left bar's Image box and the minimap over the image:
// Load and Unload at the box's foot, a title that keeps its place folded or open, the minimap hovering over
// the image with its collapse, expand and hide, the toolbar's minimap button and its opacity, each channel's
// row (the study's words, then the file's, then red, green and blue) with its black and white points, and
// Unload clearing the page back to where it started. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/image_box_driver.mjs ANSWERS IMAGE.png STUDIES [SHOTS]
import { EARLY } from "./early_messages.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { repoFile } from "./repo_file.mjs";
import { helpTip } from "./help_tip.mjs";
import { offSite } from "./off_site.mjs";
import { ENGINE, LAUNCH } from "./engine.mjs";
import { motion, record, begun, moved } from "./page_motions.mjs";
import { asTagger } from "./tagger.mjs";
import { localStudy } from "./local_study.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [answers, image, studies, three, shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// the page reads each image itself; THREE is a file of three channels: the first the study names, the second the file
// names and colours, the third named by nothing
const STAND_IN = `
const A = await (await fetch("answers.json")).json();
const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
postMessage({ type: "ready", info: A.ready.fixture });
onmessage = ({ data: m }) => {
  if (m.type === "open") postMessage({ type: "held" });
  else if (m.type === "call") { const b = bytes(A.mask); postMessage({ type: "result", action: m.action, meta: A.count, bytes: b, echo: m.echo }, [b.buffer]); }
};`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(EARLY + STAND_IN); }
  const f = u === "/web/answers.json" ? answers : u === "/web/studies.json" ? studies : repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw[ENGINE].launch(LAUNCH);
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what, seen) => { if (!ok) { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); } console.log("ok: " + what); };

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

await localStudy(ctx, "fixture");

await asTagger(ctx);
await ctx.route(offSite(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await record(ctx);
const page = await ctx.newPage();
page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
page.setDefaultTimeout(10000);
await page.goto(origin + "/web/fixture");
await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));
const shot = async (name, sel) => { if (shots) await page.locator(sel).screenshot({ path: path.join(shots, name + ".png") }); };

const loadImage = async (file = image) => {
  await page.evaluate(() => { document.querySelector("#status").textContent = ""; });
  await page.setInputFiles("#file", file);
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Image loaded.");
};
const box = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || !e.offsetParent) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
const visible = async (sel) => !!(await box(sel));
// the base canvas's pixel, red green blue
const pixel = (x, y) => page.evaluate(([x, y]) => [...document.querySelector("#base").getContext("2d").getImageData(x, y, 1, 1).data].slice(0, 3), [x, y]);
const opacity = () => page.evaluate(() => Number(getComputedStyle(document.querySelector("#minimap")).opacity));
// until the page shows what the next check reads, or a few seconds pass and the check says what it shows instead
const opacityNear = (want) => page.waitForFunction((w) => Math.abs(Number(getComputedStyle(document.querySelector("#minimap")).opacity) - w) < 1e-6, want, { timeout: 3000 }).catch(() => {});
const pixelIs = (x, y, rgb) => page.waitForFunction(([x, y, rgb]) => [...document.querySelector("#base").getContext("2d").getImageData(x, y, 1, 1).data].slice(0, 3).join() === rgb, [x, y, rgb], { timeout: 3000 }).catch(() => {});
// its red within 1 of a value, for a change made in more than one step, each of which the page may draw on its own
const redNear = (x, y, v) => page.waitForFunction(([x, y, v]) => Math.abs(document.querySelector("#base").getContext("2d").getImageData(x, y, 1, 1).data[0] - v) <= 1, [x, y, v], { timeout: 3000 }).catch(() => {});
const title = async () => { await page.click("#image-box > .sec-head h2"); await page.waitForFunction(() => !document.documentElement.hasAttribute("data-drawers")); };

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
for (let k = 0; k < 13; k++) await page.click("#zoom-in"); // the fixture is small: as near as it goes, so the view scrolls
await check(await visible("#minimap"), "zoomed past the view, the minimap shows");
const mm = await box("#minimap"), sc = await box("#scroller");
await check(mm && mm.x >= sc.x && mm.y >= sc.y && mm.x + mm.w <= sc.x + sc.w && mm.y + mm.h <= sc.y + sc.h, "the minimap hovers over the image", [mm, sc]);
await check(mm.x - sc.x < 40 && mm.y - sc.y < 40, "in its top left corner", [mm, sc]);
await check(await page.$eval("#minimap", (m) => { const s = getComputedStyle(m); return s.borderTopStyle === "solid" && parseFloat(s.borderTopWidth) >= 2 && s.borderTopColor === "rgb(255, 255, 255)"; }), "framed by a solid white border");
await check(await page.textContent("#minimap .mm-head") === "Minimap" || (await page.textContent("#minimap .mm-title")) === "Minimap", "its header says Minimap");
await page.mouse.move(5, 5); await opacityNear(1);
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
// hiding folds the minimap into its toolbar button, and showing unfolds it back out of it: each flight starts and
// lands, whatever it looks like on the way
// no flight still under way from the minimap showing, which WebKit holds a click behind
await page.waitForFunction(() => window.viewTransitions.every((v) => v.finished), null, { timeout: 15000 });
let flights = await begun(page);
await page.click("#minimap-hide", { timeout: 8000 }).catch(async (e) => { console.error("FAILED: hiding the minimap: the click never completed: " + (await motion(page))); throw e; });
const folding = await moved(page, flights, "minimap");
await check(!folding.missing, "hiding flies the minimap into its toolbar button, and the flight ends", folding);
await check(!(await visible("#minimap")) && (await page.getAttribute("#minimap-btn", "aria-pressed")) === "false", "hidden: the minimap goes, and its toolbar button is up");
flights = await begun(page);
await page.click("#minimap-btn");
const unfolding = await moved(page, flights, "minimap");
await check(!unfolding.missing, "and showing flies it back out of the button, and the flight ends", unfolding);
await check((await visible("#minimap canvas")) && (await page.getAttribute("#minimap-btn", "aria-pressed")) === "true", "the toolbar button opens it again");

// hovering the toolbar button opens its opacity
await page.mouse.move(5, 5); await page.hover("#minimap-btn");
await page.waitForFunction(() => document.querySelector("#minimap-pop").matches(":popover-open"));
const under = await page.evaluate(() => { const p = $("#minimap-pop").getBoundingClientRect(), b = $("#minimap-btn").getBoundingClientRect(); return { gap: p.top - b.bottom, right: p.right - b.right, inside: p.left >= 0 && p.right <= innerWidth }; });
await check(under.gap >= 4 && under.gap <= 8 && Math.abs(under.right) <= 1 && under.inside, "under its button, their right edges lined up", under);
await page.$eval("#minimap-opacity", (i) => { i.value = 40; i.dispatchEvent(new Event("input", { bubbles: true })); });
await page.mouse.move(5, 5); await opacityNear(0.4);
await check(Math.abs((await opacity()) - 0.4) < 0.01, "its popup sets the minimap's opacity at rest", await opacity());
await page.hover("#minimap canvas"); await opacityNear(1);
await check((await opacity()) === 1, "and it is opaque under the pointer", await opacity());
await page.mouse.move(5, 5);
await check(await page.evaluate(() => JSON.parse(localStorage.getItem("nor-minimap")).opacity) === 0.4, "and the opacity is kept for the next visit");

// the minimap and its button follow the page's state, whoever changes it
await page.evaluate(() => shellForTests.page.set({ minimap: "hidden" }));
await check(!(await visible("#minimap")) && (await page.getAttribute("#minimap-btn", "aria-pressed")) === "false", "the page's state hides the minimap and raises its button");
await page.evaluate(() => shellForTests.page.set({ minimap: "open" }));

// ---- Submit Ground Truth is the last of the shell's tasks, not over the image (req/shell/ground-truth/tasks); no right bar ----
const bar = await page.evaluate(() => ({ last: document.querySelector("#gt-tasks").lastElementChild.contains(document.querySelector("#gt-submit")),
  inImage: document.querySelector("#view").contains(document.querySelector("#gt-submit")), right: !!document.querySelector("#right, #gutter-right") }));
await check(bar.last && !bar.inImage && !bar.right, "Submit Ground Truth is the last task, not over the image, and there is no right bar", bar);

// ---- the channel: the study's name and description, its black and white points, its checkbox ----
const rows = () => page.$$eval("#channels .channel", (rs) => rs.map((r) => ({ name: r.querySelector("label").textContent, colour: r.dataset.colour,
  help: r.querySelector(".help")?.dataset.help || "", file: r.querySelector(".from-file")?.textContent || "", levels: r.querySelectorAll("input[type=range]").length })));
let ch = await rows();
await check(ch.length === 1 && ch[0].name === "Grey" && ch[0].colour === "#ffffff" && ch[0].levels === 2, "one row per channel, with a slider of two points", ch);
await check(ch[0].help === (await page.evaluate(async () => (await (await fetch("../studies/fixture/study.json")).json()).channels[0].about)), "its (?) shows the study's description", ch[0].help);
const help = await helpTip(page, "#channels .channel .help");
await check(help.text === ch[0].help && help.side === "right", "hovering the (?) shows the description beside it", help);
await page.mouse.move(5, 5);
// the squares are 200 and 250 in the image, the rest 0
await check((await pixel(15, 15)).join() === "200,200,200", "the image as it is at first", await pixel(15, 15));
const level = (k, which, v) => page.$eval(`#channels .channel:nth-child(${k}) input.${which}`, (i, v) => { i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); }, v);
await level(1, "white", 100); await pixelIs(15, 15, "255,255,255");
await check((await pixel(15, 15)).join() === "255,255,255" && (await pixel(2, 2)).join() === "0,0,0", "a lower white point brightens the channel", await pixel(15, 15));
await level(1, "white", 255); await level(1, "black", 150); await redNear(15, 15, (200 - 150) / (255 - 150) * 255);
const dim = await pixel(15, 15);
await check(dim[0] === Math.round((200 - 150) / (255 - 150) * 255) || Math.abs(dim[0] - (200 - 150) / (255 - 150) * 255) <= 1, "a higher black point darkens it", dim);
await level(1, "black", 250); await level(1, "white", 240);
const pts = await page.$eval("#channels .channel:nth-child(1)", (r) => [+r.querySelector("input.black").value, +r.querySelector("input.white").value]);
await check(pts[0] < pts[1], "the black point stays below the white point", pts);
// the row is one line: its checkbox, colour, name and slider side by side
const line = await page.$eval("#channels .channel:nth-child(1)", (r) => {
  const mid = (q) => { const b = r.querySelector(q).getBoundingClientRect(); return b.top + b.height / 2; };
  const x = (q) => r.querySelector(q).getBoundingClientRect();
  return { h: r.getBoundingClientRect().height, mids: ["input[type=checkbox]", "label", ".levels", "input[type=color]"].map(mid),
    order: [x("input[type=checkbox]").right <= x("label").left, x("label").right <= x(".levels").left, x(".levels").right <= x("input[type=color]").left],
    frame: (() => { const i = r.querySelector("input[type=color]"), b = i.getBoundingClientRect(), cs = getComputedStyle(i);
      return { wide: b.width > b.height, thick: parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth) >= 3 }; })() };
});
await check(line.h <= 24 && Math.max(...line.mids) - Math.min(...line.mids) <= 4 && line.order.every(Boolean), "the row is one line: checkbox, name, slider, then the colour picker", line);
await check(line.frame.wide && line.frame.thick, "the colour picker is a swatch wider than tall in a thick frame", line.frame);
// its swatch is shaded on the diagonal: lighter at the top left, darker at the bottom right, the colour at the centre
await page.$eval("#channels .channel:nth-child(1) input[type=color]", (i) => { i.value = "#808080"; i.dispatchEvent(new Event("input", { bubbles: true })); });
const swatch = await page.locator("#channels .channel:nth-child(1) input[type=color]").screenshot();
const shade = await page.evaluate(async (b64) => {
  const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
  const c = new OffscreenCanvas(im.width, im.height), g = c.getContext("2d"); g.drawImage(im, 0, 0);
  const at = (fx, fy) => g.getImageData(Math.round(fx * (im.width - 1)), Math.round(fy * (im.height - 1)), 1, 1).data[0];
  return { topLeft: at(0.3, 0.3), centre: at(0.5, 0.5), bottomRight: at(0.7, 0.7) };
}, swatch.toString("base64"));
await check(shade.topLeft > shade.centre + 4 && shade.bottomRight < shade.centre - 4 && Math.abs(shade.centre - 128) <= 8, "its colour is shaded on the diagonal, the channel's colour at the centre", shade);
await page.$eval("#channels .channel:nth-child(1) input[type=color]", (i) => { i.value = "#ffffff"; i.dispatchEvent(new Event("input", { bubbles: true })); });
// the slider's track sits in the middle of the row, its points on it
const mids = await page.$eval("#channels .channel:nth-child(1) .levels", (l) => { const b = l.getBoundingClientRect(), t = getComputedStyle(l, "::before");
  return { row: b.height / 2, track: parseFloat(t.top) + parseFloat(t.height) / 2 }; });
await check(Math.abs(mids.row - mids.track) <= 0.5, "the slider's track is centred in its row", mids);
// the two points meet on the slider and each can still be dragged away from there
await level(1, "white", 255); await level(1, "black", 254);
const meet = await page.$eval("#channels .channel:nth-child(1) input.black", (i) => { const b = i.getBoundingClientRect(); return { x: b.right, y: b.top + b.height * 0.75 }; });
await page.mouse.move(meet.x - 3, meet.y); await page.mouse.down(); await page.mouse.move(meet.x - 60, meet.y, { steps: 5 });
const bubble = () => page.$eval("#channels .channel:nth-child(1) .levels", (l) => { const b = l.querySelector(".bubble"); return b && !b.hidden ? b.textContent : null; });
const held = [await bubble(), await page.$eval("#channels .channel:nth-child(1) input.black", (i) => i.value)];
await check(held[0] !== null && held[0] === held[1], "while dragged, a point's value shows in a bubble", held);
await page.mouse.up();
await check((await bubble()) === null, "and the bubble is gone once it is let go", await bubble());
const dragged = await page.$eval("#channels .channel:nth-child(1)", (r) => [+r.querySelector("input.black").value, +r.querySelector("input.white").value]);
await check(dragged[0] < 230 && dragged[1] === 255, "the black point, left at the white one, can be dragged back", dragged);
await level(1, "black", 0);
// only the colour picker carries the channel's colour: the checkbox and the slider look the same on every row
await page.$eval("#channels .channel:nth-child(1) input[type=color]", (i) => { i.value = "#ff0000"; i.dispatchEvent(new Event("input", { bubbles: true })); });
const plain = await page.$eval("#channels .channel:nth-child(1)", (r) => ({ accent: getComputedStyle(r.querySelector("input[type=checkbox]")).accentColor,
  ramp: getComputedStyle(r.querySelector(".levels"), "::before").backgroundImage }));
await check(plain.accent === "auto" && !plain.ramp.includes("255, 0, 0"), "the checkbox and the slider do not take the channel's colour", plain);
await page.$eval("#channels .channel:nth-child(1) input[type=color]", (i) => { i.value = "#ffffff"; i.dispatchEvent(new Event("input", { bubbles: true })); });
// its colour picker starts at the channel's colour and recolours it
await check((await page.$eval("#channels .channel:nth-child(1) input[type=color]", (i) => i.value)) === "#ffffff", "its colour picker starts at its colour");
await page.$eval("#channels .channel:nth-child(1) input[type=color]", (i) => { i.value = "#ff0000"; i.dispatchEvent(new Event("input", { bubbles: true })); });
await pixelIs(15, 15, "200,0,0");
await check((await pixel(15, 15)).join() === "200,0,0", "picking a colour recolours the channel", await pixel(15, 15));
await page.$eval("#channels .channel:nth-child(1) input[type=color]", (i) => { i.value = "#ffffff"; i.dispatchEvent(new Event("input", { bubbles: true })); });
await page.dblclick("#channels .channel:nth-child(1) .levels");
await check((await pixel(15, 15)).join() === "200,200,200", "a double click puts the points back", await pixel(15, 15));
await page.click("#channels .channel:nth-child(1) input[type=checkbox]");
await check((await pixel(15, 15)).join() === "0,0,0", "its checkbox hides it");

// ---- a file of three channels: the study's words first, then the file's, then red, green and blue ----
await loadImage(three);
await title();
ch = await rows();
await check(ch.map((r) => r.name).join() === "Grey,Nuclei,Blue" && ch.map((r) => r.colour).join() === "#ffffff,#ff00ff,#0000ff", "the study names its channel; the file the next; red, green and blue the rest", ch);
await check(ch[0].file.includes("Ch1"), "the file's own name for a channel the study names shows beside it", ch[0]);
await check((await pixel(15, 15)).join() === "255,200,255", "each channel in its colour, added", await pixel(15, 15));
await shot("channels", "#image-box");
const said = await page.evaluate(() => document.querySelector("#file-info").textContent);
await check(!/microscope/i.test(said), "the details say nothing of what the file does not carry (req/shell/image/file-info)", said);
const more = await page.evaluate(() => { const d = document.querySelector("#file-more");
  return { shown: !d.hidden, open: d.open, n: +document.querySelector("#file-more-n").textContent, rows: d.querySelectorAll("dt").length,
    names: [...d.querySelectorAll("dt")].map((t) => t.textContent) }; });
await check(more.shown && !more.open && more.n === more.rows && more.names.includes("ImageJ channels"),
  "below them More details lists every other field the file carries, folded, with its count (req/shell/image/file-info)", more);

// ---- Unload: the page as it was before any image ----
await page.click("#unload");
await page.waitForFunction(() => document.querySelector("#file-box").hidden && document.querySelector("#fx-result") && document.querySelector("#status").textContent.startsWith("Ready"));
const clear = await page.evaluate(() => ({ stage: document.querySelector("#stage").hidden, empty: !document.querySelector("#empty").hidden,
  minimap: !!document.querySelector("#minimap").offsetParent, unload: !!document.querySelector("#unload").offsetParent, img: !!st.img,
  shine: document.querySelector("#load-main").classList.contains("shine"), done: document.querySelector("#load").classList.contains("done"),
  crumbs: [...document.querySelectorAll("#sb-steps .crumb")].map((c) => c.textContent).join(), fx: document.querySelector("#fx-result").textContent,
  overlay: document.querySelector("#overlay").children.length, status: document.querySelector("#status").textContent }));
await check(await page.evaluate(() => document.querySelector("#file-name").textContent === ""), "with no image, the Image box names none (req/shell/load/button)");
await check(clear.stage && clear.empty && !clear.minimap && !clear.unload && !clear.img, "Unload clears the image, the minimap and itself", clear);
await check(clear.shine && !clear.done && clear.crumbs === "Load image", "Load shines again, and the steps start over", clear);
await check(clear.fx === "Nothing counted yet." && !clear.overlay && clear.status.startsWith("Ready"), "the study starts over too", clear);
await check(await page.evaluate(() => [...document.querySelectorAll("#left > .box.foldable")].filter((b) => b.checkVisibility()).map((b) => b.classList.contains("folded")).join()) === "false,true,true", "and the boxes on show fold as before any image");
await check((await rows()).length === 0, "and no channel rows are left, with no image (req/shell/channels/rows)");

// ---- after Unload, the next image's tasks open again once tagging starts (req/shell/ground-truth/tasks, req/shell/ground-truth/tagging) ----
await loadImage();
await page.click("#fx-count");
await page.waitForFunction(() => !document.querySelector("#gt-submit").disabled);
await page.click("#gt-start");
const tasksAfter = await page.evaluate(() => ({ open: document.querySelector('#gt-tasks > li[data-task="check"]').classList.contains("now"),
  row: document.querySelector('#gt-tasks > li[data-task="check"] .t').textContent.trim() }));
await check(tasksAfter.open && tasksAfter.row === "0/1 Count checked", "after Unload, the next image's task opens again once tagging starts, nothing done", tasksAfter);
await done(0);
