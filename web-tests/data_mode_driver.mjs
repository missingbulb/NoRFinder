// Drives Data Management (web/data_mode.js) in headless Chromium on the fixture study, against the stand-in Google
// of stand_in_drive.mjs serving ROOT. Checks req/shell/data/drive-access, req/shell/data/mode,
// req/shell/data/folder, req/shell/data/update-previews and req/shell/data/preview-images; the previews file the page writes is saved to OUT.
// Optional SHOTS: a directory for screenshots. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/data_mode_driver.mjs ANSWERS STUDIES ROOT OUT [SHOTS]
import fs from "node:fs";
import path from "node:path";
import { standIn } from "./stand_in_drive.mjs";

const [answers, studies, rootDir, out, shots] = process.argv.slice(2);
const { FILES, writes, open, check, done } = await standIn({ answers, studies, rootDir, uploaded: (f) => { if (f.name === "rauntruth-previews.tiff") fs.writeFileSync(out, f.bytes); } });
const shot = (name) => shots && page.screenshot({ path: path.join(shots, name + ".png") });

// not signed in: no strip, no Preprocessing
let page = await open(false);
await check(await page.evaluate(() => $("#data-col").hidden && !$("#preprocessing-box").checkVisibility()), "not signed in, there is no Data Management strip, and no Preprocessing");
await check(await page.evaluate(() => [...document.querySelectorAll("#left > .box.foldable")].filter((b) => b.checkVisibility()).map((b) => b.querySelector(".step-mark").textContent).join()) === "1,2,3,4",
  "the drawers on show are numbered without Preprocessing");
await page.context().close();

page = await open(true);
const width = () => page.evaluate(() => Math.round($("#data-col").getBoundingClientRect().width));
await check(await page.evaluate(() => !$("#data-col").hidden && !document.documentElement.dataset.mode), "a data manager sees the strip, collapsed, out of the mode");
await check((await width()) < 60, "the strip is narrow", await width());
await shot("1-strip");
await page.waitForFunction(() => !$("#access-bar").hidden);
await check(/1 of .*2 folders/.test(await page.textContent("#access-text")), "the bar asks for the one folder not approved yet", await page.textContent("#access-text"));

await page.click("#data-open");
await page.waitForFunction(() => document.querySelectorAll("#data-tree .tree-folder").length === 2);
await page.waitForTimeout(600);
await check((await width()) > 200, "opening slides the column out", await width());
const access = await page.evaluate(() => [...document.querySelectorAll("#data-tree .tree-folder")].map((f) => [f.querySelector(":scope > .row .name").textContent, f.querySelector(":scope > .row .access").textContent]));
await check(JSON.stringify(access) === JSON.stringify([["Study folder one", "Writable"], ["sub", "Not approved"]]), "the tree shows every folder with its access", access);
await check(await page.evaluate(() => [...document.querySelectorAll(".tree-images")].every((b) => b.hidden)), "the images stay folded under their folders");
// Load by the boxes it draws: WebKit's checkVisibility() calls it visible though it is display: none
const shown = await page.evaluate(() => ({ load: $("#load").getClientRects().length > 0, pre: $("#preprocessing-box").checkVisibility(), study: $("#fx-box").checkVisibility(), image: $("#image-box").checkVisibility(), steps: $("#sb-steps").checkVisibility() }));
await check(!shown.load && shown.pre && !shown.study && shown.image && !shown.steps, "in the mode: Load gone, Preprocessing and the Image box shown, the study's drawers and the steps hidden", shown);

const summary = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#folder-summary dd")].map((d) => [d.dataset.k, +d.textContent])));
const folderMsg = () => page.textContent("#folder-msg");
await page.click("#data-tree .tree-folder .name");
await page.waitForFunction(() => document.querySelectorAll("#folder-items .cell").length === 3);
await check(await page.evaluate(() => !$("#folder-view").hidden && $("#image-view").hidden && $("#folder-box").checkVisibility() && !$("#image-box").checkVisibility()),
  "a folder chosen: its images in the main area, Selected Folder in place of the Image box");
await check(JSON.stringify(await summary()) === JSON.stringify({ images: 3, previews: 1, stale: 1, truth: 1, missing: 1 }), "the folder's sums", await summary());
await page.click('#folder-layout button[data-layout="list"]');
await page.waitForFunction(() => $("#folder-items").dataset.layout === "list");
await check(true, "the list button lays the images out as a list");

await page.click("#update-previews");
await page.waitForFunction(() => /Delete it/.test($("#folder-msg").textContent));
await check(!writes.length, "a previews file the page did not make is left alone", writes);
// the user deletes it in Drive
FILES.splice(FILES.findIndex((f) => f.name === "rauntruth-previews.tiff"), 1);
await page.click("#data-tree .tree-folder .name");
await page.waitForFunction(() => document.querySelector('#folder-summary dd[data-k="previews"]')?.textContent === "0");
await page.click("#update-previews");
await page.waitForFunction(() => /3 previews made/.test($("#folder-msg").textContent), null, { timeout: 30000 });
await check(JSON.stringify(writes) === JSON.stringify([["create", "rauntruth-previews.tiff"]]), "Update previews creates the file", writes);
await page.waitForFunction(() => document.querySelector('#folder-summary dd[data-k="previews"]')?.textContent === "3");
await check(JSON.stringify(await summary()) === JSON.stringify({ images: 3, previews: 3, stale: 0, truth: 1, missing: 1 }), "then every image has a preview", await summary());
await page.waitForFunction(() => document.querySelectorAll("#folder-items .pic img").length === 3);
await shot("3-list");
await page.click('#folder-layout button[data-layout="grid"]'); await page.waitForTimeout(500);
await page.click("#data-tree .tree-folder .count"); await page.waitForTimeout(300);
await shot("2-grid");
await page.click("#data-tree .tree-folder .count");
// one image changes; the page replaces its own file, making that one preview alone
FILES.find((f) => f.name === "e plain.tif").bytes = Buffer.concat([FILES.find((f) => f.name === "e plain.tif").bytes, Buffer.from([0])]);
await page.click("#data-tree .tree-folder .name");
await page.waitForFunction(() => document.querySelector('#folder-summary dd[data-k="stale"]')?.textContent === "1");
await page.click("#update-previews");
await page.waitForFunction(() => /1 preview made, 2 kept/.test($("#folder-msg").textContent), null, { timeout: 30000 });
await check(JSON.stringify(writes.at(-1)) === JSON.stringify(["replace", "rauntruth-previews.tiff"]), "a changed image: the page's own file is replaced, the rest kept", writes);
fs.writeFileSync(out, FILES.find((f) => f.name === "rauntruth-previews.tiff").bytes);

const cell = (name) => `#folder-items .cell:has(.name:text-is("${name}"))`;
await check(await page.isDisabled(cell("a flat.tif") + " .mark-gt"), "an image with ground truth needs no marker");
await page.click(cell("e plain.tif") + " .mark-gt");
await page.waitForFunction(() => document.querySelector('#folder-summary dd[data-k="missing"]')?.textContent === "2");
await check(JSON.stringify(writes.at(-1)) === JSON.stringify(["create", "e plain.ground_truth.MISSING"]), "marking an image creates its marker", writes);
await page.click(cell("e plain.tif") + " .mark-gt");
await page.waitForFunction(() => document.querySelector('#folder-summary dd[data-k="missing"]')?.textContent === "1");
await check(JSON.stringify(writes.at(-1)) === JSON.stringify(["trash", "e plain.ground_truth.MISSING"]), "unmarking trashes the page's own marker", writes);
await page.click(cell("b stack.tif") + " .mark-gt");
await page.waitForFunction(() => /Someone else/.test($("#folder-msg").textContent));
await check(writes.at(-1)[1] !== "b stack.ground_truth.MISSING", "a marker someone else made is left alone");

await page.click("#data-tree .tree-folder .count");
await page.waitForFunction(() => document.querySelectorAll("#data-tree .tree-folder .tree-image").length === 3);
await page.waitForFunction(() => document.querySelectorAll("#data-tree .tree-folder .tree-image .pic img").length === 3);
await check(true, "a folder's images unfold with small previews");
await page.click('#data-tree .tree-image:has(.name:text-is("a flat.tif"))');
await page.waitForFunction(() => st.fileName === "a flat.preview.tif" && !$("#load-original").hidden);
await check(await page.evaluate(() => shellForTests.page.get("image").source.kind === "preview" && !$("#image-view").hidden && $("#image-box").checkVisibility()),
  "an image chosen opens from its preview, with Load Original");
await shot("4-preview");
// what reached Python, for the test to open as the study would
const got = await page.workers()[0].evaluate(() => ({ name: self.lastOpen.name, bytes: Array.from(self.lastOpen.bytes) }));
await check(got.name === "a flat.preview.tif", "Python is handed the preview as a TIFF", got.name);
fs.writeFileSync(out + ".preview.tif", Buffer.from(got.bytes));
await page.click("#load-original");
// the name is set as the open starts, the image's source once it is done
await page.waitForFunction(() => shellForTests.page.get("image")?.source.kind === "drive" && $("#load-original").hidden).catch(() => {});
await check(await page.evaluate(() => st.fileName === "a flat.tif" && shellForTests.page.get("image")?.source.kind === "drive" && $("#load-original").hidden), "Load Original opens the image itself");

// offline (req/shell/offline/default): no bar asking for folders, and nothing written to Drive
await page.click("#data-tree .tree-folder .name");
await page.waitForFunction(() => document.querySelectorAll("#folder-items .cell").length === 3);
// its previews drawn first: Playwright's WebKit, set offline, fails every read of a Blob's bytes, the previews' among them
await page.waitForFunction(() => [...document.querySelectorAll("#folder-items .cell .pic")].every((p) => p.querySelector("img") || p.classList.contains("none")));
const before = writes.length;
await page.context().setOffline(true);
await page.waitForFunction(() => document.documentElement.classList.contains("offline"));
await page.click(cell("e plain.tif") + " .mark-gt", { force: true });
await page.waitForTimeout(300);
await check(writes.length === before, "offline, marking an image does nothing", writes.slice(before));
await page.context().setOffline(false);
await page.waitForFunction(() => !document.documentElement.classList.contains("offline"));

await page.click("#data-open");
await page.waitForTimeout(600);
await check((await width()) < 60 && await page.evaluate(() => !$("#load").classList.contains("gone") && !$("#preprocessing-box").checkVisibility() && !document.documentElement.dataset.mode),
  "closing the column leaves the mode: Load back, Preprocessing gone");

// a previews file whose pictures cannot be read, its index intact: each image shows no preview, and one chosen
// opens itself, with nothing left uncaught; nor is it when what the site keeps cannot be counted as it is stored
await page.evaluate(() => { CacheStorage.prototype.keys = () => Promise.reject(new Error("keys refused for the test")); });
const damage = (bytes) => {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), le = v.getUint16(0) === 0x4949;
  const values = (e) => {
    const type = v.getUint16(e + 2, le), count = v.getUint32(e + 4, le), one = type === 3 ? 2 : 4;
    const at = count * one <= 4 ? e + 8 : v.getUint32(e + 8, le);
    return Array.from({ length: count }, (_, i) => (one === 2 ? v.getUint16(at + 2 * i, le) : v.getUint32(at + 4 * i, le)));
  };
  for (let ifd = v.getUint32(4, le); ifd; ) {
    const n = v.getUint16(ifd, le), tags = {};
    for (let i = 0; i < n; i++) { const e = ifd + 2 + 12 * i; tags[v.getUint16(e, le)] = e; }
    const offsets = values(tags[273]), counts = values(tags[279]);
    offsets.forEach((o, i) => bytes.fill(0xff, o + 2, o + counts[i]));
    ifd = v.getUint32(ifd + 2 + 12 * n, le);
  }
  return bytes;
};
const kept = FILES.find((f) => f.name === "rauntruth-previews.tiff");
kept.bytes = damage(Buffer.from(kept.bytes));
await page.click("#data-open");
await page.click("#data-tree .tree-folder .name");
await page.waitForFunction(() => document.querySelectorAll("#folder-items .cell .pic.none").length === 3, null, { timeout: 5000 }).catch(() => {});
await check(await page.evaluate(() => document.querySelectorAll("#folder-items .cell .pic.none").length === 3), "a previews file that cannot be read: each image shows no preview");
await page.click(cell("a flat.tif"));
await page.waitForFunction(() => st.fileName === "a flat.tif", null, { timeout: 5000 }).catch(() => {});
await check(await page.evaluate(() => st.fileName === "a flat.tif"), "and an image chosen opens itself");
await done(0);
