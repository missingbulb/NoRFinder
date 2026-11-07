// Drives the role menu beside the avatar (req/shell/account/role) in headless Chromium on the fixture study (a GT study),
// against the stand-in Google of stand_in_drive.mjs serving ROOT: what each visitor may choose, and what each role's
// view shows. Optional SHOTS: a directory for screenshots. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/roles_driver.mjs ANSWERS STUDIES ROOT IMAGE [SHOTS]
import fs from "node:fs";
import path from "node:path";
import { standIn } from "./stand_in_drive.mjs";
import { standInDrive, openFromDrive } from "./drive_open.mjs";
import { motion } from "./page_motions.mjs";

const [answers, studies, rootDir, image, shots] = process.argv.slice(2);
const shot = (page, name) => shots && page.screenshot({ path: path.join(shots, name + ".png") });
const { ROOT, open, check, done } = await standIn({ answers, studies, rootDir });
const OTHER = "someone@example.com";

// what the page shows: the role named, the roles listed, the line under them, and each role's tools (the ground-truth
// button, in the item view's bar, as not hidden)
const seen = (page) => page.evaluate(() => {
  const shows = (s) => !!document.querySelector(s)?.checkVisibility();
  return {
    role: $("#role-name").textContent.trim(),
    list: [...document.querySelectorAll("#role-list .item")].map((b) => b.textContent.trim()),
    hint: $("#role-hint").hidden ? "" : $("#role-hint").textContent.trim(),
    truth: !$("#fx-truth").hidden, counted: shows("#fx-counted"),
    data: shows("#data-col"), mode: document.documentElement.dataset.mode || "", bar: !!document.querySelector("#access-bar"),
  };
});
// remount: the study opens afresh, its panels replaced, before the page is read again
const choose = async (page, name, remount) => {
  await page.evaluate(() => { window.panelsBefore = $("#fx-box"); });
  await page.click("#role-menu summary");
  await page.click(`#role-list .item:text-is("${name}")`);
  await page.waitForFunction(([n, again]) => $("#role-name").textContent.trim() === n && (!again || ($("#fx-box") && $("#fx-box") !== window.panelsBefore))
    && /^(Ready|Image loaded)/.test(document.querySelector("#status").textContent), [name, remount]);
};
const role = (page) => page.evaluate(() => localStorage.getItem("nor-role"));

// not signed in, where the site signs people in: Viewer alone, and nothing that makes ground truth
let page = await open(false);
let s = await seen(page);
await check(s.role === "Viewer" && s.list.join() === "Viewer" && /sign in/i.test(s.hint), "not signed in, the menu offers Viewer alone and says what signing in adds", s);
await check(!s.bar, "a viewer sees no asking bar", s);
// the header's menus at the window's right edge open leftward, wholly inside the window
for (const menu of ["#role-menu", "#user-menu"]) {
  await page.click(`${menu} summary`);
  const box = await page.evaluate((m) => {
    const r = document.querySelector(`${m} .pop`).getBoundingClientRect();
    return { left: r.left, right: r.right, width: document.documentElement.clientWidth };
  }, menu);
  await check(box.left >= 0 && box.right <= box.width, `${menu}'s popup opens inside the window`, box);
  await page.click(`${menu} summary`);
}
await page.context().close();

// signed in, not a data manager: Viewer first, Ground Truth Tagger to choose
page = await open(true, { email: OTHER, prepare: standInDrive });
s = await seen(page);
await check(s.role === "Viewer" && s.list.join() === "Viewer,Ground Truth Tagger" && !s.hint, "signed in, the page opens as Viewer, Ground Truth Tagger offered", s);
await openFromDrive(page, image);
await page.waitForFunction(() => !document.querySelector("#fx-count").disabled);
const before = await page.evaluate(() => st.fileName);
await choose(page, "Ground Truth Tagger", true);
await page.waitForFunction((n) => st.fileName === n && !document.querySelector("#fx-count").disabled, before);
s = await seen(page);
await check(await page.evaluate(() => st.fileName) === before, "and the image stays open", before);
await check(await role(page) === "tagger", "the role chosen is kept", await role(page));
await page.reload();
await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));
s = await seen(page);
await check(s.role === "Ground Truth Tagger" && s.truth, "and the page opens in it again", s);
await choose(page, "Viewer", true);
s = await seen(page);
await check(!s.truth && !s.counted, "back as Viewer, the ground-truth tools go", s);
await page.context().close();

// the same study as PreGT: Ground Truth Tagger is offered, and can be chosen there
const preGT = { ...JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "studies", "fixture", "study.json"), "utf8")), stage: "PreGT",
  root: `https://drive.google.com/drive/folders/${ROOT}` };
page = await open(true, { email: OTHER, prepare: async (ctx) => { await ctx.route("**/studies/fixture/study.json", (r) => r.fulfill({ json: preGT })); await standInDrive(ctx); } });
await page.waitForFunction(() => document.documentElement.dataset.stage === "PreGT");
s = await seen(page);
await check(s.role === "Viewer" && s.list.join() === "Viewer,Ground Truth Tagger", "in a PreGT study the signed-in are offered Ground Truth Tagger", s);
await check(!s.truth && !s.counted, "a viewer there sees no ground-truth button and no postprocessing", s);
await openFromDrive(page, image);
await page.waitForFunction(() => !document.querySelector("#fx-count").disabled);
await choose(page, "Ground Truth Tagger", true);
await check(await role(page) === "tagger", "and chosen, it is the role there", await role(page));
await page.context().close();

// a data manager kept in that role, opening where they hold it no more: Viewer, the choice kept for where they do
page = await open(true, { email: OTHER, seed: { "nor-role": "data" } });
s = await seen(page);
await check(s.role === "Viewer" && !s.data, "a role not held shows as Viewer", s);
await check(await role(page) === "data", "and the choice stays", await role(page));
await page.context().close();

// the study's data manager: Data Manager offered; choosing it opens the tree, asking only there
page = await open(true);
s = await seen(page);
await page.click("#role-menu summary"); await shot(page, "menu"); await page.click("#role-menu summary");
await check(s.list.join() === "Viewer,Ground Truth Tagger,Data Manager" && !s.data, "a data manager is offered Data Manager, and sees no Data Management until choosing it", s);
await choose(page, "Data Manager");
await page.waitForFunction(() => document.querySelectorAll("#data-tree .tree-folder").length === 2);
const width = () => page.evaluate(() => Math.round($("#data-col").getBoundingClientRect().width));
// the column, folded or open, once its motion has ended at the width asked for
const widthReaches = (open) => page.waitForFunction((open) => {
  const w = $("#data-col").getBoundingClientRect().width;
  return (open ? w > 200 : w < 60) && !document.getAnimations().some((a) => a.transitionProperty && a.playState === "running");
}, open).catch(() => {});
await widthReaches(true);
s = await seen(page);
await shot(page, "data-manager");
await check(s.data && s.mode === "data" && (await width()) > 200, "as Data Manager the folder tree shows, open", { ...s, width: await width(), motion: await motion(page) });
await check(!s.bar, "no bar over the image asks for folders", s);
await page.click("#data-open"); await widthReaches(false);
await check((await width()) < 60 && (await seen(page)).mode === "data", "its chevron folds the tree to a strip", await width());
await page.click("#data-open"); await widthReaches(true);
await check((await width()) > 200, "and opens it again", await width());
await choose(page, "Viewer");
s = await seen(page);
await check(!s.data && !s.mode, "choosing Viewer leaves Data Management", s);
await page.context().close();

// a site with no Google client signs no one in, so no one there may tag ground truth
page = await open(false, { prepare: (ctx) => ctx.route("**/web/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: 'window.NOR_CONFIG = { google: { apiKey: "stand-in", clientId: "" } };' })) });
s = await seen(page);
await check(s.list.join() === "Viewer" && s.role === "Viewer", "with no sign-in on the site, Viewer alone is offered", s);
await done(0);
