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
// tasks box, as shown)
const seen = (page) => page.evaluate(() => {
  const shows = (s) => !!document.querySelector(s)?.checkVisibility();
  return {
    role: $("#role-name").textContent.trim(),
    list: [...document.querySelectorAll("#role-list .item")].map((b) => b.textContent.trim()),
    hint: $("#role-hint").hidden ? "" : $("#role-hint").textContent.trim(),
    truth: shows("#tasks-box"), counted: shows("#fx-counted"),
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
// the header reads "[study] as [role]": the role's menu right after the study's, drawn like it
const header = await page.evaluate(() => {
  const box = (e) => e.getBoundingClientRect(), look = (e) => { const c = getComputedStyle(e); return [c.backgroundColor, c.height, c.fontSize].join(); };
  const study = $("#study-menu"), as = study.nextElementSibling, role = $("#role-menu");
  return { as: as?.textContent.trim(), next: as?.nextElementSibling === role, inOrder: box(study).right <= box(as).left && box(as).right <= box(role).left,
    name: look($("#title")) === look($("#role-name")), caret: look($("#study-menu .caret")) === look($("#role-menu .caret")) };
});
await check(header.as === "as" && header.next && header.inOrder && header.name && header.caret, "the header reads \"[study] as [role]\", both menus drawn alike", header);
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

// signed in, not a study manager: Viewer first, Ground Truth Tagger to choose
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

// a study manager kept in that role, opening where they hold it no more: Viewer, the choice kept for where they do
page = await open(true, { email: OTHER, seed: { "nor-role": "data" } });
s = await seen(page);
await check(s.role === "Viewer" && !s.data, "a role not held shows as Viewer", s);
await check(await role(page) === "data", "and the choice stays", await role(page));
await page.context().close();

// the study's study manager: Study Manager offered; choosing it opens the tree, asking only there
page = await open(true);
s = await seen(page);
await page.click("#role-menu summary"); await shot(page, "menu"); await page.click("#role-menu summary");
await check(s.list.join() === "Viewer,Ground Truth Tagger,Study Manager" && !s.data, "a study manager is offered Study Manager, and sees no Data Management until choosing it", s);
await choose(page, "Study Manager");
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
await check(s.data && s.mode === "data" && (await width()) > 200, "as Study Manager the folder tree shows, open", { ...s, width: await width(), motion: await motion(page) });
await check(!s.bar, "no bar over the image asks for folders", s);
await page.click("#data-open"); await widthReaches(false);
await check((await width()) < 60 && (await seen(page)).mode === "data", "its chevron folds the tree to a strip", await width());
await page.click("#data-open"); await widthReaches(true);
await check((await width()) > 200, "and opens it again", await width());
await choose(page, "Viewer");
s = await seen(page);
await check(!s.data && !s.mode, "choosing Viewer leaves Data Management", s);
await page.context().close();

// Google's token lasts an hour, and only a click may ask for another: the page opening after it ran out shows the
// roles Drive last gave this user, and opening the menu renews the token and asks Drive again
const GSI = `window.google = { ...window.google, accounts: { oauth2: { initTokenClient(o) {
  window.asked = [];
  return { requestAccessToken(opts = {}) { window.asked.push(opts); setTimeout(() => o.callback({ access_token: "tok-" + Date.now(), expires_in: 3599, scope: o.scope })); } };
} } } };`;
const stubGoogle = (ctx) => ctx.route("https://accounts.google.com/gsi/client", (r) => r.fulfill({ contentType: "text/javascript", body: GSI }));
const asked = (page) => page.evaluate(() => (window.asked || []).length);
page = await open(true, { prepare: stubGoogle });
const record = await page.evaluate(() => JSON.parse(localStorage.getItem("nor-google-sign-in")));
await page.context().close();
const ranOut = (r) => ({ "nor-google-sign-in": JSON.stringify({ ...r, until: Date.now() - 1000 }) });
page = await open(true, { seed: ranOut(record), prepare: stubGoogle });
s = await seen(page);
await check(s.list.join() === "Viewer,Ground Truth Tagger,Data Manager", "the token run out, the menu still lists the roles Drive last gave", s);
await check(await asked(page) === 0, "and nothing asks Google for a token before a click", await asked(page));
await page.click("#role-menu summary");
await page.waitForFunction(() => (window.asked || []).length === 1);
await page.waitForFunction(() => $("#role-hint").hidden);
s = await seen(page);
await check(s.list.join() === "Viewer,Ground Truth Tagger,Data Manager" && !s.hint, "opening the menu renews the token and Drive confirms the roles", s);
await page.context().close();
// never told before on this device: Viewer, until opening the menu renews the token and Drive answers
const { learned, ...fresh } = record;
page = await open(true, { seed: ranOut(fresh), prepare: stubGoogle });
s = await seen(page);
await check(s.list.join() === "Viewer" && !!s.hint, "with nothing remembered, Viewer alone, and a line saying why", s);
await page.click("#role-menu summary");
await page.waitForFunction(() => document.querySelectorAll("#role-list .item").length === 3);
s = await seen(page);
await check(!s.hint && await asked(page) === 1, "and opening the menu brings the roles Drive gives", { ...s, asked: await asked(page) });
await page.context().close();

// a site with no Google client signs no one in, so no one there may tag ground truth
page = await open(false, { prepare: (ctx) => ctx.route("**/web/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: 'window.NOR_CONFIG = { google: { apiKey: "stand-in", clientId: "" } };' })) });
s = await seen(page);
await check(s.list.join() === "Viewer" && s.role === "Viewer", "with no sign-in on the site, Viewer alone is offered", s);
await done(0);
