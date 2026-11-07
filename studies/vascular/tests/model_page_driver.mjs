// Drives the vascular study's page (web/) in a PreGT stage in headless Chromium against a stand-in worker
// (stand_in.mjs) whose Execute answers with a model fixture. Checks req/vascular/model/view: Image, Model, Overlay and
// Side by side, colour by depth painting the model too, and vessel widths; req/vascular/model/correct: Detected keeps
// only the signal near the model, Undo takes an edit back; req/vascular/model/cards: Items shows the model's cards
// outside a ground-truth stage and approves a low-confidence vessel from one; and the model's canvas leaves the 3D
// view with the study. Exits 1 on a failed check, 2 when it cannot run.
//   node studies/vascular/tests/model_page_driver.mjs STUDIES
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { offSite } from "../../../web-tests/off_site.mjs";
import { ENGINE, LAUNCH } from "../../../web-tests/engine.mjs";
import { asTagger } from "../../../web-tests/tagger.mjs";
import { serve, drawnStack } from "./stand_in.mjs";
import { standInDrive, openFromDrive } from "../../../web-tests/drive_open.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "..", "..", "..");
const [studies] = process.argv.slice(2);
const model = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "cd31_frontal_x20_r_1_slices1-12.vessels.json"), "utf8"));
// the item views only show what was found, so they are driven in a PreGT study (req/shell/views/second)
const site = await serve(repo, studies, model, "PreGT"), origin = site.origin;

const browser = await pw[ENGINE].launch(LAUNCH);
let failed = false;
const check = (ok, what) => { if (!ok) { failed = true; console.error("FAILED: " + what); } else console.log("ok: " + what); };
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
await asTagger(ctx);
await ctx.route(offSite(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await standInDrive(ctx);
const page = await ctx.newPage();
page.on("pageerror", (e) => { failed = true; console.error("page error: " + e.message); });
page.setDefaultTimeout(10000);

// the 3D view's brightness now, its mean over every pixel of red, green and blue
const brightness = () => page.evaluate(async () => {
  // the view draws in the frame after it is changed: two frames on, the change is on the canvas
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const gl = document.querySelector("#v3-gl"), c = document.createElement("canvas"); c.width = gl.width; c.height = gl.height;
  const g = c.getContext("2d"); g.drawImage(gl, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
  return s / (d.length / 4);
});
const facts = () => page.textContent("#model-facts");
// the model's own canvas now: how many pixels are lit, and how many of those are coloured rather than grey
const drawn = () => page.evaluate(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const d = document.querySelector("#mcv").getContext("2d").getImageData(0, 0, document.querySelector("#mcv").width, document.querySelector("#mcv").height).data;
  let lit = 0, coloured = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128 || d[i] + d[i + 1] + d[i + 2] < 60) continue;
    lit++; if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 60) coloured++;
  }
  return { lit, coloured };
});

try {
  await page.goto(origin + "/web/vascular");
  await page.waitForFunction(() => window.$ && $("#status").textContent.startsWith("Ready"));
  await openFromDrive(page, { name: model.source, mimeType: "image/tiff", buffer: drawnStack(model) });
  await page.waitForFunction(() => !$("#vm-run").disabled);
  await page.evaluate(() => { $("#notice").hidden = true; });
  check(await page.evaluate(() => $("#v3-stage #mcv") === null && $("#model-on").hidden), "a stack opens with no model");
  // req/vascular/model/run: the Processing box runs the algorithm on the image open, as NoR's; no model file is loaded
  check(await page.evaluate(() => !$("#model-load") && !$("#model-file") && !/model file/i.test($("#model-set").textContent + $("#model-facts").textContent)),
    "the Processing box offers no model file to load, only Execute");
  await page.click("#vm-run");
  await page.waitForFunction(() => !$("#model-on").hidden);
  check(/vessel edges/.test(await facts()), `Execute opens the model it draws: ${(await facts()).slice(0, 80)}`);
  // req/vascular/model/view: every choice of how the model shows is in one Show menu at the toolbar's left, as NoR's
  // (outside a ground-truth stage the tasks' Back to image button is not shown)
  const menu = await page.evaluate(() => { const m = $("#vm-show");
    return { menu: !!m && m.matches(".toolbar details.menu") && m.querySelector("summary").textContent.trim(),
      inside: ["#model-mode", "#m-widths", "#m-candidates", "#review-mode", "#reach"].filter((s) => !$(s)?.closest("#vm-show .pop")),
      loose: [...document.querySelectorAll(".toolbar [data-study-panel]")].filter((e) => e.id !== "vm-show" && !e.hidden).map((e) => e.id || e.tagName) }; });
  check(menu.menu === "Show" && !menu.inside.length && !menu.loose.length, `a Show menu holds the views, Vessel widths, Low-confidence and Everything, Detected, Missed: ${JSON.stringify(menu)}`);
  // a control in the menu, reached as a person reaches it: the menu opened first
  const inMenu = async (sel) => { if (!(await page.evaluate(() => $("#vm-show").open))) await page.click("#vm-show summary"); return sel; };
  const shown = () => page.evaluate(() => ({ pressed: $("#model-mode [aria-pressed=true]").dataset.v, split: $("#v3-stage").classList.contains("split"), over: !!$("#v3-stage #mcv") }));
  check(JSON.stringify(await shown()) === JSON.stringify({ pressed: "overlay", split: false, over: true }), "the model opens over the stack");
  await page.click(await inMenu('#model-mode [data-v="image"]'));
  check((await drawn()).lit === 0, "Image shows the stack alone");
  await page.click(await inMenu('#model-mode [data-v="side"]'));
  check((await shown()).split, "Side by side splits the view in two");
  await page.click(await inMenu('#model-mode [data-v="model"]'));
  const alone = await drawn();
  check(!(await shown()).split && alone.lit > 500, `Model shows the model alone, over the whole view: ${alone.lit} lit pixels`);
  // CD31's Colour by depth, its tick in the image box (req/shell/viewer-3d), paints the model as it paints the stack
  if (await page.evaluate(() => $("#image-box").classList.contains("folded"))) { await page.click("#image-box"); await page.waitForFunction(() => !$("#image-box").classList.contains("folded")); }
  const depth = await page.isChecked("#depth-0");
  await page.setChecked("#depth-0", !depth);
  const flip = await drawn(), [byDepth, plain] = depth ? [alone, flip] : [flip, alone];
  check(byDepth.coloured > plain.coloured * 4 + 100, `Colour by depth paints the model in depth colours: ${plain.coloured} → ${byDepth.coloured} coloured pixels`);
  check(await page.evaluate(() => !!window.shellForTests.viewer.three.depthPalette()) === !depth, "and the stack too");
  await page.setChecked("#depth-0", depth);
  await page.uncheck(await inMenu("#m-widths"));
  const thin = await drawn();
  check(thin.lit < alone.lit * 0.7, `Vessel widths off draws the vessels as lines: ${alone.lit} → ${thin.lit} lit pixels`);
  await page.check(await inMenu("#m-widths"));
  await page.click(await inMenu('#model-mode [data-v="overlay"]'));

  // what the 3D view draws needs WebGL2, which a headless browser may lack
  if (await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"))) {
    const all = await brightness();
    await page.click(await inMenu('#review-mode [data-v="detected"]'));
    const detected = await brightness();
    check(detected < all * 0.8, `Detected keeps only the signal near the model's vessels: ${all.toFixed(2)} → ${detected.toFixed(2)}`);
    await page.click(await inMenu('#review-mode [data-v="all"]'));
  } else console.log(`not checked in this ${ENGINE}: what Detected leaves in the 3D view, which needs the WebGL2 it lacks`);

  check(await page.isHidden("#tasks-box") && await page.isHidden("#gt-submit") && await page.isHidden("#m-draw") && await page.isVisible("#summary-box #m-lasso"),
    "outside a ground-truth stage there are no tasks, no Submit and no Draw a missed vessel, a ground-truth task; a damaged area is marked from Summary");
  // req/shell/image/toolbar: how the model shows is the toolbar's left, and the left bar holds none of it
  const where = await page.evaluate(() => ["#model-mode", "#m-widths", "#review-mode", "#reach"].map((s) => !!$(s)?.closest(".toolbar") && !$(s).closest("#left")));
  check(where.every(Boolean), `what the model shows and how sit at the toolbar's left: ${where}`);
  // the study's options and the viewer's tools together never push one out of the toolbar (a menu's popup hangs below it)
  const out = await page.evaluate(() => { const t = $("#view .toolbar").getBoundingClientRect();
    return [...$("#view .toolbar").querySelectorAll("button, label, input")].filter((e) => e.offsetParent !== null && !e.closest(".pop"))
      .filter((e) => { const r = e.getBoundingClientRect(); return r.right > t.right + 0.5 || r.bottom > t.bottom + 0.5 || r.left < t.left - 0.5; })
      .map((e) => e.id || e.textContent.trim()); });
  check(!out.length, `every toolbar control is inside the toolbar: ${out}`);
  await page.click("#switch");
  await page.click('#item-kind [data-v="vessels"]');
  await page.selectOption("#item-filter", "review");
  await page.waitForSelector("#item-list .card:not(.placeholder) button.yes");
  const cards = await page.locator("#item-list .card:not(.placeholder)").count();
  check(cards > 0, `Items shows the low-confidence vessels as cards: ${cards}`);
  await page.click("#item-list .card:not(.placeholder) button.yes");
  check(/1 approved/.test(await facts()), "a card's Approve approves the vessel");
  await page.click("#switch");
  await page.keyboard.press("Control+z");
  check(/0 approved/.test(await facts()), "Undo takes the approval back");

  // the switcher lists the studies once it has read them
  await page.waitForFunction(() => [...document.querySelectorAll("#study-list a")].some((x) => x.textContent.includes("Image Viewer")));
  await page.evaluate(() => { const a = [...document.querySelectorAll("#study-list a")].find((x) => x.textContent.includes("Image Viewer")); a.click(); });
  await page.waitForFunction(() => $("#title").textContent === "Image Viewer");
  check(await page.evaluate(() => !document.querySelector("#mcv")), "the model's canvas leaves the 3D view with the study");
} catch (e) {
  failed = true; console.error(e);
}
await browser.close(); site.close();
process.exit(failed ? 1 : 0);
