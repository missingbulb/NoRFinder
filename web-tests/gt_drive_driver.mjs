// Drives a Ground Truth Tagger on the fixture study in headless Chromium, against the stand-in Google of
// stand_in_drive.mjs serving ROOT, whose `submissions` and `curated` subfolders the study names as its ground-truth
// folders. Checks req/shell/ground-truth/tagger-access (the line in the study's ground-truth box: not approved, view
// only, writable), req/shell/ground-truth/submit and req/shell/ground-truth/layout (Submit writes the tagger's file
// into the image's subfolder, and submitting again replaces it keeping the old version), and
// req/shell/ground-truth/clear. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/gt_drive_driver.mjs ANSWERS STUDIES ROOT
import { createHash } from "node:crypto";
import { standIn } from "./stand_in_drive.mjs";

const [answers, studies, rootDir] = process.argv.slice(2);
const drive = await standIn({ answers, studies, rootDir });
const { FILES, writes, keptForever, approved, viewOnly, open, role, check, done } = drive;
const id = (name) => FILES.find((f) => f.folder && f.name === name).id;
const SUBS = id("submissions"), CUR = id("curated");
const link = (x) => `https://drive.google.com/drive/folders/${x}`;
const study = { groundTruth: { submissions: link(SUBS), curated: link(CUR), button: "#fx-truth" } };
const line = (page) => page.waitForFunction(() => { const t = document.querySelector("#left .gt-access")?.textContent.trim(); return t && !/Checking/.test(t) && t; }).then((h) => h.jsonValue());
const asTagger = async (page) => { await role(page, "Ground Truth Tagger"); return line(page); };

// a study that has not named its folders yet
let page = await open(true, { study: { groundTruth: { submissions: null, curated: null, button: "#fx-truth" } } });
let said = await asTagger(page);
await check(/not set up/i.test(said), "a study with no ground-truth folders says so in the box", said);
await page.context().close();

// the folder never approved for this site: the line offers to approve it
page = await open(true, { study });
said = await asTagger(page);
await check(/Not approved/.test(said) && await page.isVisible("#left .gt-access .gt-approve"), "not approved: the line says so and offers Approve", said);
await page.context().close();

// approved, but Drive gives this user only a view
approved.add(SUBS); viewOnly.add(SUBS);
page = await open(true, { study });
said = await asTagger(page);
await check(/View only/.test(said) && /edit access/.test(said), "view only: the line says to ask for edit access", said);
await page.context().close();
viewOnly.delete(SUBS);

// writable: open the image from the study's folder, count, submit
page = await open(true, { study });
said = await asTagger(page);
await check(/Writable/.test(said), "writable: the line says so", said);
const png = FILES.find((f) => /\.png$/.test(f.name));
await page.click("#load-drive");
await page.waitForFunction(() => document.querySelector("#drive-dlg").open);
await page.dblclick(`#drive-list .item[data-id="${png.id}"]`);
await page.waitForFunction((n) => st.fileName === n && !$("#fx-count").disabled, png.name);
await page.click("#fx-count");
await page.waitForFunction(() => !$("#fx-truth").disabled);
const submit = async () => {
  // the button sits in the item view's bar: pressed where it is
  await page.evaluate(() => $("#fx-truth").click());
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
const doc = JSON.parse(file.bytes.toString());
await check(doc.tagger === "tester@example.com" && !Number.isNaN(Date.parse(doc.created)) && doc.image.sha256 === createHash("sha256").update(png.bytes).digest("hex") && doc.labels.length === 1,
  "the file names its tagger, when it was made and the image's SHA-256, and holds the study's marks", doc);
msg = await submit();
await check(/Submitted/.test(msg) && writes.filter(([w]) => w === "folder").length === 1 && writes.at(-1)[0] === "replace" && keptForever.includes(file.name),
  "submitting again replaces the tagger's own file, keeping the old version", writes);

// Clear progress: asks first, naming the image, then forgets the study's progress on it
let asked = null;
page.once("dialog", (d) => { asked = d.message(); d.accept(); });
await page.click("#left .gt-access .gt-clear");
await page.waitForFunction(() => /Nothing counted/.test($("#fx-result")?.textContent) && st.fileName && !$("#fx-count").disabled);
await check(asked && asked.includes(png.name), "Clear progress asks first, naming the image", asked);
await done(0);
