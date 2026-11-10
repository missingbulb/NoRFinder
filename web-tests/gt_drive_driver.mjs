// Drives the fixture study's ground truth in headless Chromium, against the stand-in Google of stand_in_drive.mjs
// serving ROOT, the study's root, set up from Data Management. Checks req/shell/ground-truth/setup (Set up ground
// truth makes the folders, shares the curated one and writes the settings file), req/shell/data/roles (Ground Truth
// Tagger offered only where the store lets the user write to submissions), req/shell/ground-truth/tagger-access,
// req/shell/ground-truth/submit and req/shell/ground-truth/layout (Submit writes the tagger's file into the image's
// subfolder, and submitting again replaces it keeping the old version), req/shell/ground-truth/clear,
// req/shell/ground-truth/pending, req/shell/ground-truth/curate, req/shell/ground-truth/summary (the Ground Truth box),
// req/shell/ground-truth/switch, req/shell/ground-truth/view and req/shell/data/folder's Needs GT (a marker in the
// curated folder, in either mode, shown GT wanted in the Drive dialog). Exits 1 on a failed
// check, 2 when it cannot run.
//   node web-tests/gt_drive_driver.mjs ANSWERS STUDIES ROOT
import { createHash } from "node:crypto";
import { standIn } from "./stand_in_drive.mjs";

const [answers, studies, rootDir] = process.argv.slice(2);
const drive = await standIn({ answers, studies, rootDir, gt: false });
const { ROOT, FILES, writes, keptForever, viewOnly, sharedOut, open, role, check, done } = drive;
const id = (name) => FILES.find((f) => f.folder && f.name === name)?.id;
// the access line once read: what it says, and whether it takes any room
const line = (page) => page.waitForFunction(() => { const e = document.querySelector("#left .gt-access"); return e?.dataset.access ? { access: e.dataset.access, text: e.textContent.trim(), room: e.getClientRects().length > 0 && e.offsetHeight > 0 } : null; }).then((h) => h.jsonValue());
const asTagger = async (page) => { await role(page, "Ground Truth Tagger"); return line(page); };
// an image's ground-truth subfolder, and what Needs GT writes for it
const subOf = (f) => `${f.name.replace(/\.[^.]*$/, "")}__${createHash("sha256").update(f.bytes).digest("hex").slice(0, 8)}`;
const neededOf = (f) => subOf(f) + ".needs_gt";
const [png, beta] = FILES.filter((f) => /\.png$/.test(f.name));
// Needs GT pressed on an image in Data Management's folder view, the marker's write landed
const markNeeded = async (page, f) => {
  await page.waitForFunction(() => document.querySelectorAll("#data-tree .tree-folder").length >= 1);
  await page.click("#data-tree .tree-folder .name");
  const b = `#folder-items .cell[data-id="${f.id}"] .mark-gt`;
  await page.waitForSelector(b + ":not([disabled])");
  const n = writes.length;
  await page.click(b);
  await page.waitForFunction((b) => document.querySelector(b)?.getAttribute("aria-pressed") === "true", b, { timeout: 10000 }).catch(() => {});
  return writes.slice(n);
};
const pressed = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#folder-items .cell")].map((c) => [c.dataset.id, c.querySelector(".mark-gt").getAttribute("aria-pressed")])));
const offered = (page) => page.evaluate(() => [...document.querySelectorAll("#role-list .item")].map((b) => b.textContent));

// not set up: nobody is offered Ground Truth Tagger, and the study manager is offered Set up ground truth
let page = await open(true);
await check(!(await offered(page)).includes("Ground Truth Tagger"), "with no submissions folder, Ground Truth Tagger is not offered", await offered(page));
await role(page, "Study Manager");
await page.waitForSelector("#gt-setup:not([hidden])");
const top = await page.evaluate(() => ({ first: document.querySelector("#data-body").firstElementChild?.id, nudged: $("#gt-setup").classList.contains("nudge"), text: $("#gt-setup").textContent.trim() }));
await check(top.text === "Set up ground truth…" && top.first === "gt-setup" && top.nudged, "a study manager is offered Set up ground truth at the top of the bar, highlighted while the folders are missing", top);
await check(await page.isHidden("#gt-box"), "with no ground-truth folders, there is no Ground Truth box");
await page.click("#gt-setup");
await page.click('#setup-dlg button[data-review="yes"]');
await page.waitForFunction(() => !$("#setup-dlg").open || $("#setup-msg").classList.contains("err"), null, { timeout: 15000 });
await check(!(await page.evaluate(() => $("#setup-dlg").open)), "choosing an option sets it up and closes the dialog", await page.textContent("#setup-msg"));
const CUR = id("GT curated"), SUBS = id("GT submissions");
const settings = FILES.find((f) => f.parent === ROOT && f.name === "rauntruth-study.json");
const doc = settings && JSON.parse(settings.bytes.toString());
await check(!!CUR && !!SUBS && doc?.curated === CUR && doc?.submissions === SUBS && doc.review === true && doc.set_by === "tester@example.com",
  "Set up with review makes GT curated and GT submissions in the root and names them in its settings file", { msg: await page.textContent("#setup-msg"), doc });
await check(JSON.stringify(sharedOut) === JSON.stringify([["GT curated", { type: "anyone", role: "reader" }]]), "and shares the curated folder with anyone with the link to view", sharedOut);
const tree = await page.evaluate(() => [...document.querySelectorAll("#data-tree .tree-folder .name")].map((n) => n.textContent));
await check(!tree.some((n) => /^GT/.test(n)), "the tree leaves the ground-truth folders out of the data", tree);
await check(await page.isHidden("#gt-setup"), "set up, nothing offers to set it up again");
await page.waitForFunction(() => /No image/.test($("#gt-box").textContent));
const box = await page.evaluate(() => ({ text: $("#gt-box").textContent, above: !!($("#gt-box").compareDocumentPosition($("#data-tree")) & Node.DOCUMENT_POSITION_FOLLOWING) }));
await check(box.above && /review/i.test(box.text), "a Ground Truth box above the folders says submissions are reviewed and that no image has ground truth yet", box);
// Needs GT, with review: a marker in the curated folder named as the image's subfolder, nothing written beside the image
let marked = await markNeeded(page, png);
const marker = FILES.find((f) => f.name === neededOf(png));
await check(JSON.stringify(marked) === JSON.stringify([["create", neededOf(png)]]) && marker?.parent === CUR,
  "with review, Needs GT creates the image's marker in the curated folder, and nothing else", { marked, parent: marker?.parent });
let on = await pressed(page);
await check(on[png.id] === "true" && on[beta.id] === "false", "only the image marked shows Needs GT pressed", on);
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
await check(said.access === "write" && !said.text && !said.room, "writable: the line says nothing and takes no room", said);
// req/shell/ground-truth/pending: before any ground truth, the Drive dialog tags the marked image GT wanted, the other nothing
await page.click("#load-remote");
await page.waitForFunction(() => document.querySelector("#remote-dlg").open);
const wanted = await page.waitForFunction((id) => document.querySelector(`#remote-list .item[data-id="${id}"] .gt-tag`)?.textContent || null, png.id, { timeout: 5000 }).then((h) => h.jsonValue(), () => "");
const other = await page.evaluate((id) => document.querySelector(`#remote-list .item[data-id="${id}"] .gt-tag`)?.textContent || "", beta.id);
await check(wanted === "GT wanted" && !other, "to the tagger, the Drive dialog tags the marked image GT wanted, the other nothing", { wanted, other });
await page.keyboard.press("Escape");
await page.click("#load-remote");
await page.waitForFunction(() => document.querySelector("#remote-dlg").open);
await page.dblclick(`#remote-list .item[data-id="${png.id}"]`);
await page.waitForFunction((n) => st.fileName === n && !$("#fx-count").disabled, png.name);
await page.click("#fx-count");
await page.waitForFunction(() => !$("#gt-submit").disabled);
// req/shell/ground-truth/tagging: counted, no task opens until Start GT tagging; Stop tagging closes it; a task's name starts it there
const tagging = () => page.evaluate(() => ({ open: document.querySelector("#gt-tasks > li.now")?.dataset.task || null, check: !!document.querySelector("#gt-tasks li.now #fx-check"),
  start: $("#gt-start").offsetParent ? $("#gt-start").textContent.trim() : null, first: $("#gt-list").firstElementChild === $("#gt-start") }));
let tg = await tagging();
await check(!tg.open && !tg.check && tg.start === "Start GT tagging" && tg.first, "counted, no task is open, and Start GT tagging heads the tasks", tg);
await page.click("#gt-start");
tg = await tagging();
await check(tg.open === "check" && tg.check && tg.start === "Stop tagging", "Start GT tagging opens the study's task, the button now Stop tagging", tg);
await page.click("#gt-start");
tg = await tagging();
await check(!tg.open && !tg.check && tg.start === "Start GT tagging", "Stop tagging closes it", tg);
await page.click('#gt-tasks > li[data-task="check"] .task-head .t');
tg = await tagging();
await check(tg.open === "check" && tg.start === "Stop tagging", "clicking a task's name starts tagging at that task", tg);
await page.click("#gt-start");
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
const sub = subOf(png);
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
await check(await page.evaluate(() => !!document.querySelector('#gt-tasks > li[data-task="submit"] .gt-clear') && !document.querySelector("#left .gt-access .gt-clear")),
  "Clear progress sits beside Submit Ground Truth, at the box's end");
await page.click('#gt-tasks > li[data-task="submit"] .gt-clear');
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
// and so does the image selector's list of recent images
const recentTag = async () => {
  await page.evaluate(() => { $("#image-menu").open = true; });
  const row = `#recent .recent[data-id="${png.id}"] .gt-tag`;
  const tag = await page.waitForFunction((r) => document.querySelector(r)?.textContent || null, row, { timeout: 5000 }).then((h) => h.jsonValue(), () => "");
  await page.evaluate(() => { $("#image-menu").open = false; });
  return tag;
};
tag = await recentTag();
await check(tag === "GT pending", "to the tagger, the image selector marks the submitted image GT pending", tag);

// req/shell/ground-truth/curate: the study manager sees it pending, reviews it and accepts it into the curated folder
await role(page, "Study Manager");
await page.waitForFunction(() => /1 image.*pending/.test($("#gt-box").textContent), null, { timeout: 5000 }).catch(() => {});
await check(/1 image.*pending/.test(await page.textContent("#gt-box")), "the Ground Truth box counts the submission pending", await page.textContent("#gt-box"));
const sw = await page.evaluate(() => ({ text: $("#gt-switch").textContent.trim(), off: $("#gt-switch").disabled, why: $("#gt-switch").title }));
await check(sw.text === "Switch to unreviewed…" && sw.off && /1 submission/.test(sw.why), "while a submission is pending, switching to unreviewed waits, saying how many", sw);
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
await page.waitForFunction(() => /1 image has ground truth/.test($("#gt-box").textContent), null, { timeout: 5000 }).catch(() => {});
await check(/1 image has ground truth/.test(await page.textContent("#gt-box")), "accepted, the Ground Truth box counts it", await page.textContent("#gt-box"));
tag = await recentTag();
await check(tag === "GT", "accepted, the image selector marks the image GT", tag);

// req/shell/ground-truth/switch: nothing pending, the study switches to unreviewed, nothing moved or deleted
await page.waitForFunction(() => !$("#gt-switch").disabled);
const before = FILES.length;
await page.click("#gt-switch");
await page.waitForFunction(() => $("#switch-dlg").open);
const told = await page.textContent("#switch-text");
await check(/edit access/.test(told) && /GT curated/.test(told) && /no file/i.test(told), "the confirmation says no file moves and that taggers need edit access to GT curated", told);
await page.click("#switch-go");
await page.waitForFunction(() => !$("#switch-dlg").open || $("#switch-msg").classList.contains("err"), null, { timeout: 15000 });
const switched = JSON.parse(FILES.find((f) => f.parent === ROOT && f.name === "rauntruth-study.json").bytes.toString());
await check(switched.curated === CUR && switched.submissions === CUR && switched.review === false && switched.switched?.from?.submissions === SUBS && switched.switched?.by === "tester@example.com" && FILES.length === before && FILES.some((f) => f.id === SUBS),
  "switched, GT curated serves as both, GT submissions stays, and the settings file records the mode before and who switched", { switched, msg: await page.textContent("#switch-msg") });
await page.waitForFunction(() => /One folder/.test($("#gt-mode").textContent) && /1 image has ground truth/.test($("#gt-counts").textContent), null, { timeout: 5000 }).catch(() => {});
await check(/One folder/.test(await page.textContent("#gt-mode")) && /1 image has ground truth/.test(await page.textContent("#gt-counts")), "the Ground Truth box now says one folder, its ground truth still counted", await page.textContent("#gt-box"));
// Needs GT, one folder for both: the marker lands in that one folder too
marked = await markNeeded(page, beta);
await check(JSON.stringify(marked) === JSON.stringify([["create", neededOf(beta)]]) && FILES.find((f) => f.name === neededOf(beta))?.parent === CUR,
  "with one folder, Needs GT creates the marker in it, and nothing else", marked);
on = await pressed(page);
await check(on[beta.id] === "true" && FILES.some((f) => f.name === neededOf(png)), "the image with ground truth keeps its marker, no longer shown", on);
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
