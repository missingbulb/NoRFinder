// Drives Edit Image (web/image_edit.js) in headless Chromium on the fixture study, against the stand-in Google of
// stand_in_drive.mjs serving ROOT, whose image IMAGE is the one the stand-in worker draws. Checks req/shell/data/edit
// (Split, a cut dragged, a part left out, Crop, Channels, Imperfections, Done) and req/shell/data/edit-save (the names,
// the folder made beside the image, the files in it, and the image then listed no more); writes the saved files to OUT.
// Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/image_edit_driver.mjs ANSWERS STUDIES ROOT IMAGE OUT
import fs from "node:fs";
import path from "node:path";
import { standIn } from "./stand_in_drive.mjs";
import { pressDrive, pickRecent } from "./drive_open.mjs";

const [answers, studies, rootDir, image, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const { FILES, writes, open, role, check, done } = await standIn({ answers, studies, rootDir, uploaded: (f) => fs.writeFileSync(path.join(out, f.name), f.bytes) });
const page = await open(true);

// a point of the drawing on the screen, and a drag through points of it
const screen = (x, y) => page.evaluate(([x, y]) => { const r = $("#base").getBoundingClientRect(); return [r.left + x * st.zoom, r.top + y * st.zoom]; }, [x, y]);
async function drag(points) {
  const [first, ...rest] = await Promise.all(points.map(([x, y]) => screen(x, y)));
  await page.mouse.move(...first); await page.mouse.down();
  for (const p of rest) await page.mouse.move(...p, { steps: 4 });
  await page.mouse.up();
}
const size = () => page.evaluate(() => { const im = shellForTests.page.get("image"); return [im.W, im.H]; });
const cuts = () => page.evaluate(() => [...document.querySelectorAll("#overlay .edit-cut")].map((l) => `${l.dataset.cut}=${l.getAttribute(l.dataset.cut[0] === "x" ? "x1" : "y1")}`).join());
const name = path.basename(image);

await role(page, "Study Manager");
await page.waitForFunction(() => document.querySelectorAll("#data-tree .tree-folder").length >= 1);
await page.click("#data-tree .tree-folder .name");
await page.click(`#folder-items .cell:has(.name:text-is("${name}"))`);
await page.waitForFunction((n) => st.fileName === n && shellForTests.page.get("image")?.source?.folder, name);
await check(await page.isEnabled("#edit-open"), "Edit Image waits for an image, and an image is open");
const [W, H] = await size();

await page.click("#edit-open");
await page.waitForFunction(() => !$("#edit-box").hidden);
await check(await page.evaluate(() => $("#edit-slices-sec").hidden), "a flat image has no slices to keep");
// the network gone with an edit under way (req/shell/data/mode): its marks are local, so it goes on
await page.context().setOffline(true);
await page.waitForFunction(() => document.documentElement.classList.contains("offline"));
await page.click('#edit-split button[data-n="2"]');
await page.waitForFunction((w) => shellForTests.page.get("image").W > w, W);
const gap = Math.max(4, Math.round(0.06 * Math.max(W, H)));
await check(JSON.stringify(await size()) === JSON.stringify([W + gap, H + gap]), "2 × 2 draws the parts apart, a gap between them", await size());
const mid = W / 2 + gap / 2;
await check((await cuts()) === `x1=${mid},y1=${H / 2 + gap / 2}`, "its cut lines are drawn in the gaps, offline as online", await cuts());
await page.context().setOffline(false);
await page.waitForFunction(() => !document.documentElement.classList.contains("offline"));
await page.click("#edit-done");
await page.waitForFunction(() => $("#edit-box").hidden);
await check(JSON.stringify(await size()) === JSON.stringify([W, H]), "Done shows the image as it was");

await page.click("#edit-open");
await page.waitForFunction(() => !$("#edit-box").hidden);
await page.click("#edit-crop");
await drag([[10, 10], [40, 30], [70, 50]]);
await page.waitForFunction(() => shellForTests.page.get("image").W === 60);
await check(JSON.stringify(await size()) === JSON.stringify([60, 40]) && /60 × 40 px/.test(await page.textContent("#edit-crop-size")), "Crop shows only the rectangle drawn", await size());
await page.click('#edit-split button[data-n="2"]');
await page.waitForFunction((w) => shellForTests.page.get("image").W === w, 60 + gap);
// the vertical cut, at the crop's middle, dragged 6 pixels right
await drag([[30 + gap / 2, 5], [36 + gap / 2, 5]]);
await page.waitForFunction((g) => [...document.querySelectorAll("#overlay .edit-cut.v")].some((l) => +l.getAttribute("x1") === 36 + g / 2), gap);
await check(true, "a cut line drags");
await drag([[50, 8], [50, 8]]);
await page.waitForFunction(() => /left out/.test($("#overlay").textContent));
await check(true, "a click on a part leaves it out");
await page.click("#edit-lasso");
await drag([[5, 5], [20, 5], [20, 15], [5, 15]]);
await page.waitForFunction(() => document.querySelectorAll("#edit-flaws li").length === 1);
await check(/Imperfection 1, \d+% of the image/.test(await page.textContent("#edit-flaws")), "a lasso marks an imperfection, with its share", await page.textContent("#edit-flaws"));
await page.click("#edit-lasso");
await page.uncheck("#edit-channels input");
await page.click("#edit-save");
await page.waitForFunction(() => $("#save-dlg").open);
await check(await page.isDisabled("#save-remote") && /channel/.test(await page.textContent("#save-msg")), "no channel kept holds the save");
await page.click("#save-close");
await page.check("#edit-channels input");

await page.click("#edit-save");
await page.waitForFunction(() => $("#save-dlg").open);
const listed = await page.evaluate(() => [...document.querySelectorAll("#save-names li")].map((l) => l.textContent));
const stem = name.replace(/\.[^.]*$/, "");
await check(JSON.stringify(listed) === JSON.stringify([`${stem}_r1c1.tif`, `${stem}_r2c1.tif`, `${stem}_r2c2.tif`]), "the parts kept are named by the pattern", listed);
await check(/folder .*beside/.test(await page.textContent("#save-where")), "Save… says the files go into a folder beside the image");
await page.click("#save-remote");
await page.waitForFunction(() => !$("#save-dlg").open, null, { timeout: 20000 });
const made = FILES.find((f) => f.folder && f.mine && f.name === stem);
await check(made && JSON.stringify(writes.slice(-4)) === JSON.stringify([["folder", stem], ...listed.map((n) => ["create", n])]) && FILES.filter((f) => f.parent === made.id).length === 3,
  "Save to Google Drive makes the folder named after the image and puts the files in it", writes);
await page.waitForFunction((n) => !document.querySelector(`#folder-items .cell .name`) || ![...document.querySelectorAll("#folder-items .cell .name")].some((e) => e.textContent === n), name);
await check(await page.evaluate((s) => [...document.querySelectorAll("#data-tree .tree-folder .name")].some((e) => e.textContent === s), stem), "the image is listed no more, its folder in the tree in its place");

// Load's Drive dialog, out of the mode, lists the folder and not the image
await role(page, "Viewer");
// the Viewer's page: Data Management gone, the Image box back
await page.waitForFunction(() => $("#image-box").checkVisibility() && document.documentElement.dataset.mode !== "data" && $("#data-col").hidden);
if (await page.evaluate(() => $("#image-box").classList.contains("folded"))) await page.click("#image-box .sec-head h2");
await pressDrive(page);
await page.waitForFunction(() => document.querySelectorAll("#remote-list .item").length > 0);
const items = await page.evaluate(() => [...document.querySelectorAll("#remote-list .item .name")].map((e) => e.textContent));
await check(items.includes(stem) && !items.includes(name), "Load's Drive dialog lists the folder in the image's place", items);
await done(0);
