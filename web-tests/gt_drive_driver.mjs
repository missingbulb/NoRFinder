// Drives the fixture study's ground truth in headless Chromium, against the stand-in Google of stand_in_drive.mjs
// serving ROOT, the study's root, set up from Data Management. Checks req/shell/ground-truth/setup (Set up ground
// truth makes the folders, shares the curated one and writes the settings file), req/shell/data/roles (Ground Truth
// Tagger offered only where the store lets the user write to submissions), req/shell/ground-truth/tagger-access,
// req/shell/ground-truth/submit and req/shell/ground-truth/layout (Submit writes the tagger's file into the image's
// subfolder, and submitting again replaces it keeping the old version), req/shell/ground-truth/clear,
// req/shell/ground-truth/pending, req/shell/ground-truth/curate and req/shell/ground-truth/view. Exits 1 on a failed
// check, 2 when it cannot run.
//   node web-tests/gt_drive_driver.mjs ANSWERS STUDIES ROOT
import { createHash } from "node:crypto";
import { standIn } from "./stand_in_drive.mjs";

const [answers, studies, rootDir] = process.argv.slice(2);
const drive = await standIn({ answers, studies, rootDir, gt: false });
const { ROOT, FILES, writes, keptForever, viewOnly, sharedOut, open, role, check, done } = drive;
const id = (name) => FILES.find((f) => f.folder && f.name === name)?.id;
const line = (page) => page.waitForFunction(() => { const t = document.querySelector("#left .gt-access")?.textContent.trim(); return t && !/Checking/.test(t) && t; }).then((h) => h.jsonValue());
const asTagger = async (page) => { await role(page, "Ground Truth Tagger"); return line(page); };
const offered = (page) => page.evaluate(() => [...document.querySelectorAll("#role-list .item")].map((b) => b.textContent));

// not set up: nobody is offered Ground Truth Tagger, and the data manager is offered Set up ground truth
let page = await open(true);
await check(!(await offered(page)).includes("Ground Truth Tagger"), "with no submissions folder, Ground Truth Tagger is not offered", await offered(page));
await role(page, "Data Manager");
await page.waitForSelector("#gt-setup:not([hidden])");
await check((await page.textContent("#gt-setup")).trim() === "Set up ground truth…", "a data manager is offered Set up ground truth", await page.textContent("#gt-setup"));
await page.click("#gt-setup");
await page.click('#setup-dlg button[data-review="yes"]');
await page.waitForFunction(() => /^Set up|refused|may not/.test(document.querySelector("#setup-msg").textContent));
const CUR = id("GT curated"), SUBS = id("GT submissions");
const settings = FILES.find((f) => f.parent === ROOT && f.name === "rauntruth-study.json");
const doc = settings && JSON.parse(settings.bytes.toString());
await check(!!CUR && !!SUBS && doc?.curated === CUR && doc?.submissions === SUBS && doc.review === true && doc.set_by === "tester@example.com",
  "Set up with review makes GT curated and GT submissions in the root and names them in its settings file", { msg: await page.textContent("#setup-msg"), doc });
await check(JSON.stringify(sharedOut) === JSON.stringify([["GT curated", { type: "anyone", role: "reader" }]]), "and shares the curated folder with anyone with the link to view", sharedOut);
await page.click("#setup-cancel");
const tree = await page.evaluate(() => [...document.querySelectorAll("#data-tree .tree-folder .name")].map((n) => n.textContent));
await check(!tree.some((n) => /^GT/.test(n)), "the tree leaves the ground-truth folders out of the data", tree);
await check(/again/.test(await page.textContent("#gt-setup")), "set up, it offers to set up again", await page.textContent("#gt-setup"));
await page.context().close();

// a user the store lets only view the submissions folder is not offered Ground Truth Tagger
viewOnly.add(SUBS);
page = await open(true);
await check(!(await offered(page)).includes("Ground Truth Tagger"), "where the store lets the user only view submissions, Ground Truth Tagger is not offered", await offered(page));
await page.context().close();
viewOnly.delete(SUBS);

// writable: open the image from the study's folder, count, submit
page = await open(true);
let said = await asTagger(page);
await check(/Writable/.test(said), "writable: the line says so", said);
const png = FILES.find((f) => /\.png$/.test(f.name));
await page.click("#load-remote");
await page.waitForFunction(() => document.querySelector("#remote-dlg").open);
await page.dblclick(`#remote-list .item[data-id="${png.id}"]`);
await page.waitForFunction((n) => st.fileName === n && !$("#fx-count").disabled, png.name);
await page.click("#fx-count");
await page.waitForFunction(() => !$("#gt-submit").disabled);
const submit = async () => {
  // the button sits in the item view's bar: pressed where it is
  await page.evaluate(() => $("#gt-submit").click());
  await page.waitForFunction(() => $("#gt-dlg").open && !$("#gt-send").disabled);
  await page.click("#gt-send");
  await page.waitForFunction(() => /Submitted/.test($("#gt-msg").textContent) || /not/.test($("#gt-msg").textContent));
  const msg = await page.textContent("#gt-msg");
  await page.click("#gt-close");
  return msg;
};
let msg = await submit();
const sub = `${png.name.replace(/\.[^.]*$/, "")}__${createHash("sha256").update(png.bytes).digest("hex").slice(0, 8)}`;
await check(/Submitted/.test(msg), "Submit says the file landed", msg);
const folder = FILES.find((f) => f.folder && f.name === sub);
await check(!!folder && folder.parent === SUBS, "Submit makes the image's subfolder in the submissions folder", sub);
const file = FILES.find((f) => f.parent === folder.id);
await check(file?.name === "gt_tester@example.com.json", "the tagger's file is named for their email", file?.name);
const gtDoc = JSON.parse(file.bytes.toString());
await check(gtDoc.tagger === "tester@example.com" && !Number.isNaN(Date.parse(gtDoc.created)) && gtDoc.image.sha256 === createHash("sha256").update(png.bytes).digest("hex") && gtDoc.labels.length === 1,
  "the file names its tagger, when it was made and the image's SHA-256, and holds the study's marks", gtDoc);
msg = await submit();
await check(/Submitted/.test(msg) && writes.filter(([w, n]) => w === "folder" && n === sub).length === 1 && JSON.stringify(writes.slice(-2)) === JSON.stringify([["replace", file.name], ["mark", sub]]) && keptForever.includes(file.name),
  "submitting again replaces the tagger's own file, keeping the old version", writes);

// Clear progress: asks first, naming the image, then forgets the study's progress on it
let asked = null;
page.once("dialog", (d) => { asked = d.message(); d.accept(); });
await page.click("#left .gt-access .gt-clear");
await page.waitForFunction(() => /Nothing counted/.test($("#fx-result")?.textContent) && st.fileName && !$("#fx-count").disabled);
await check(asked && asked.includes(png.name), "Clear progress asks first, naming the image", asked);

// req/shell/ground-truth/pending: the Drive dialog marks the image as pending for the tagger
const dialogTag = async () => {
  await page.evaluate(() => document.querySelector("#load-remote").click());
  await page.waitForFunction(() => document.querySelector("#remote-dlg").open);
  const row = `#remote-list .item[data-id="${png.id}"] .gt-tag`;
  const tag = await page.waitForFunction((r) => document.querySelector(r)?.textContent || null, row, { timeout: 5000 }).then((h) => h.jsonValue(), () => "");
  await page.keyboard.press("Escape");
  return tag;
};
let tag = await dialogTag();
await check(tag === "GT pending", "to the tagger, the Drive dialog marks the submitted image GT pending", tag);

// req/shell/ground-truth/curate: the data manager sees it pending, reviews it and accepts it into the curated folder
await role(page, "Data Manager");
await page.waitForFunction(() => document.querySelectorAll("#data-tree .tree-folder").length >= 1);
await page.click("#data-tree .tree-folder .name");
const cell = `#folder-items .cell[data-id="${png.id}"]`;
await page.waitForSelector(cell);
const sums = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#folder-summary dd")].map((d) => [d.dataset.k, +d.textContent])));
let s = await sums();
await check(s.pending === 1 && s.truth === 0 && await page.isVisible(cell + " .review-gt"), "Data Management counts it pending and offers Review GT", s);
await page.click(cell + " .review-gt");
await page.waitForFunction(() => document.querySelector("#curate-list li .accept") && !document.querySelector("#curate-list li .accept").disabled);
const who = await page.textContent("#curate-list li .who");
await check(who === "tester@example.com", "the review lists the tagger's submission", who);
await page.click("#curate-list li .accept");
await page.waitForFunction(() => /Accepted/.test($("#curate-msg").textContent) || $("#curate-msg").classList.contains("err"));
const into = FILES.find((f) => f.folder && f.name === sub && f.parent === CUR), copy = into && FILES.find((f) => f.parent === into.id);
const accepted = copy && JSON.parse(copy.bytes.toString()).accepted;
await check(copy?.name === file.name && accepted?.by === "tester@example.com" && accepted.from_sha256?.length === 64,
  "Accept copies the submission into the image's subfolder of the curated folder, recording who accepted it and from which file", accepted || await page.textContent("#curate-msg"));
await page.click("#curate-close");
await page.waitForFunction(() => +document.querySelector('#folder-summary dd[data-k="truth"]')?.textContent === 1);
s = await sums();
await check(s.truth === 1 && s.pending === 0 && !(await page.$(cell + " .review-gt")), "accepted, the image has ground truth and nothing pending", s);
await check(await page.isDisabled(cell + " .mark-gt"), "an image with ground truth needs no marker");
await page.context().close();

// req/shell/ground-truth/view: a viewer, not signed in, loads the image and its curated ground truth, with no algorithm run
page = await open(false);
// what the page downloads from the store, to tell the listing from reading the ground truth
const downloads = [];
page.on("request", (q) => { const u = new URL(q.url()); if (u.searchParams.get("alt") === "media") downloads.push(decodeURIComponent(u.pathname.split("/").pop())); });
await page.click("#load-remote");
await page.waitForFunction(() => document.querySelector("#remote-dlg").open);
await page.dblclick(`#remote-list .item[data-id="${png.id}"]`);
await page.waitForFunction((n) => st.fileName === n && !$("#fx-count").disabled, png.name);
await page.waitForSelector("#load-gt:not([hidden])", { timeout: 5000 }).catch(() => {});
await check(await page.isVisible("#load-gt"), "a viewer is offered Load GT tagging for an image with curated ground truth");
await check(downloads.every((d) => d === png.id || d === settings.id), "before the click, only the image and the root's settings file are downloaded: the curated folder's listing alone offers it", downloads);
await page.click("#load-gt");
// only the click reads the image's ground truth (req/shell/ground-truth/view)
await page.waitForFunction(() => document.querySelector("#gt-summary").textContent.trim());
const summed = await page.textContent("#gt-summary"), shown = await page.textContent("#fx-result");
await check(/tester@example\.com/.test(summed) && /accepted by/.test(summed) && /pixels counted/.test(summed), "its summary names who made it, who accepted it, and the study's counts", summed);
await check(/^Ground truth: \d+ pixels/.test(shown) && await page.evaluate(() => !document.querySelector("#busy") || $("#busy").hidden), "the study shows the final result, with nothing run", shown);
await page.context().close();
await done(0);
