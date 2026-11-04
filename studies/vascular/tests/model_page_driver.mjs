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
import { ENGINE } from "../../../web-tests/engine.mjs";
import { asTagger } from "../../../web-tests/tagger.mjs";
import { serve } from "./stand_in.mjs";
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

const browser = await pw[ENGINE].launch();
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
  await new Promise((r) => setTimeout(r, 300));
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
  await openFromDrive(page, { name: model.source, mimeType: "image/tiff", buffer: Buffer.from([0x49, 0x49, 42, 0]) });
  await page.waitForFunction(() => !$("#vm-run").disabled);
  await page.evaluate(() => { $("#notice").hidden = true; });
  check(await page.evaluate(() => $("#v3-stage #mcv") === null && $("#model-on").hidden), "a stack opens with no model");
  await page.click("#vm-run");
  await page.waitForFunction(() => !$("#model-on").hidden);
  check(/vessel edges/.test(await facts()), `Execute opens the model it draws: ${(await facts()).slice(0, 80)}`);
  const shown = () => page.evaluate(() => ({ pressed: $("#model-mode [aria-pressed=true]").dataset.v, split: $("#v3-stage").classList.contains("split"), over: !!$("#v3-stage #mcv") }));
  check(JSON.stringify(await shown()) === JSON.stringify({ pressed: "overlay", split: false, over: true }), "the model opens over the stack");
  await page.click('#model-mode [data-v="image"]');
  check((await drawn()).lit === 0, "Image shows the stack alone");
  await page.click('#model-mode [data-v="side"]');
  check((await shown()).split, "Side by side splits the view in two");
  await page.click('#model-mode [data-v="model"]');
  const alone = await drawn();
  check(!(await shown()).split && alone.lit > 500, `Model shows the model alone, over the whole view: ${alone.lit} lit pixels`);
  const depth = await page.getAttribute("#vm-depth", "aria-pressed");
  await page.click("#vm-depth");
  const flip = await drawn(), [byDepth, plain] = depth === "true" ? [alone, flip] : [flip, alone];
  check(byDepth.coloured > plain.coloured * 4 + 100, `Colour by depth paints the model in depth colours: ${plain.coloured} → ${byDepth.coloured} coloured pixels`);
  check(await page.evaluate(() => window.shellForTests.viewer.three.S.depth) === (depth === "true" ? 0 : 1), "and the stack too");
  await page.click("#vm-depth");
  await page.uncheck("#m-widths");
  const thin = await drawn();
  check(thin.lit < alone.lit * 0.7, `Vessel widths off draws the vessels as lines: ${alone.lit} → ${thin.lit} lit pixels`);
  await page.check("#m-widths");
  await page.click('#model-mode [data-v="overlay"]');

  // what the 3D view draws needs WebGL2, which a headless browser may lack
  if (await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"))) {
    const all = await brightness();
    await page.click('#review-mode [data-v="detected"]');
    const detected = await brightness();
    check(detected < all * 0.8, `Detected keeps only the signal near the model's vessels: ${all.toFixed(2)} → ${detected.toFixed(2)}`);
    await page.click('#review-mode [data-v="all"]');
  } else console.log(`not checked in this ${ENGINE}: what Detected leaves in the 3D view, which needs the WebGL2 it lacks`);

  check(await page.isHidden("#tasks-box") && await page.isHidden("#vm-truth") && await page.isVisible("#review-box #m-draw"),
    "outside a ground-truth stage there are no tasks and no Submit, and a missed vessel is drawn from Review");
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
