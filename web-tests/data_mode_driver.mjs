// Drives Data Management (web/data_mode.js) in headless Chromium on the fixture study, against the stand-in Google
// of stand_in_drive.mjs serving ROOT. Checks req/shell/data/drive-access, req/shell/data/mode,
// req/shell/data/folder, req/shell/data/update-previews and req/shell/data/preview-images; the previews file the page writes is saved to OUT.
// Optional SHOTS: a directory for screenshots. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/data_mode_driver.mjs ANSWERS STUDIES ROOT OUT [SHOTS]
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { standIn } from "./stand_in_drive.mjs";
import { frames } from "./page_frames.mjs";

const [answers, studies, rootDir, out, shots] = process.argv.slice(2);
const PREVIEWS_DIR = "dmpreviewsfolder00001";
const { ROOT, FILES, GT, approved, writes, thumbs, open, role, check, done } = await standIn({ answers, studies, rootDir, uploaded: (f) => { if (f.parent === PREVIEWS_DIR) fs.writeFileSync(out, f.bytes); } });
// the data folder's previews file (req/shell/drive/previews): in the root's Previews folder, which the page made, under the
// data folder's id, a file someone else put there; the copy the tool left beside the images is never read
const OURS = `${ROOT}.tiff`;
FILES.push({ id: PREVIEWS_DIR, name: "Previews", parent: ROOT, folder: true, bytes: null, mine: true, props: {}, modified: "2026-11-05T07:00:00Z" },
  { id: "dmpreviewsfile000001", name: OURS, parent: PREVIEWS_DIR, folder: false, bytes: FILES.find((f) => f.name === "rauntruth-previews.tiff").bytes, mine: false, props: {}, modified: "2026-11-05T07:00:00Z" });
// an image's Needs GT marker, in the curated folder, named as its ground-truth subfolder
const neededOf = (name) => { const f = FILES.find((g) => g.name === name); return `${name.replace(/\.[^.]*$/, "")}__${createHash("sha256").update(f.bytes).digest("hex").slice(0, 8)}.needs_gt`; };
// the curated folder approved for the site, as the study manager does from the tree's head, so the page may write its markers
approved.add(GT.curated);
// someone else marked the stack as needing ground truth
FILES.push({ id: "dmmarker000000000001", name: neededOf("b stack.tif"), parent: GT.curated, folder: false, bytes: Buffer.alloc(0), mine: false, props: {}, modified: "2026-11-05T07:00:00Z" });
const shot = (name) => shots && page.screenshot({ path: path.join(shots, name + ".png") });

// not signed in: the drawers numbered as a viewer's, with no Preprocessing
let page = await open(false);
await check(await page.evaluate(() => [...document.querySelectorAll("#left > .box.foldable")].filter((b) => b.checkVisibility()).map((b) => b.querySelector(".step-mark").textContent).join()) === "1,2,3",
  "the drawers on show, a viewer's without the postprocessing, are numbered without Preprocessing");
await page.context().close();

// the images Data Management lists are the kinds the study opens: here TIFFs, a PNG and a JPEG
page = await open(true, { study: { files: { from: ["drive"], accept: ".png,.tif,.tiff,.jpg", empty: "Load an image." } } });
const width = () => page.evaluate(() => Math.round($("#data-col").getBoundingClientRect().width));
// the column at a width and its slide over; the check after it says what it found when it never gets there
const slid = (wide) => page.waitForFunction((wide) => (wide ? $("#data-col").getBoundingClientRect().width > 200 : $("#data-col").getBoundingClientRect().width < 60)
  && !document.getAnimations().some((a) => a.playState === "running"), wide, { timeout: 5000 }).catch(() => {});
// the page's handlers for what was just done have all run: a click it ignores has had every chance to act
const turned = () => frames(page);
await check(await page.evaluate(() => $("#data-col").hidden && !document.documentElement.dataset.mode), "a study manager in another role sees no Data Management");
await role(page, "Study Manager");
await page.waitForFunction(() => document.querySelectorAll("#data-tree .tree-folder").length === 2);
await slid(true);
await check((await width()) > 200, "choosing Study Manager slides the column out, open", await width());
await page.click("#data-open");
await slid(false);
await check((await width()) < 60, "its chevron folds it to a narrow strip", await width());
await shot("1-strip");
await page.click("#data-open");
await slid(true);
await check((await width()) > 200, "the chevron opens the column again", await width());
await check(await page.textContent("#data-approve") === "Approve 1 folder…" && await page.isVisible("#data-approve"), "the tree's head offers the one folder not approved yet", await page.textContent("#data-approve"));
const access = await page.evaluate(() => [...document.querySelectorAll("#data-tree .tree-folder")].map((f) => [f.querySelector(":scope > .row .name").textContent, f.querySelector(":scope > .row .access").textContent]));
await check(JSON.stringify(access) === JSON.stringify([["Study folder one", "Writable"], ["sub", "Not approved"]]), "the tree shows every folder with its access", access);
await check(await page.evaluate(() => [...document.querySelectorAll(".tree-images")].every((b) => b.hidden)), "the images stay folded under their folders");

const summary = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#folder-summary dd")].map((d) => [d.dataset.k, +d.textContent])));
const folderMsg = () => page.textContent("#folder-msg");
await page.click("#data-tree .tree-folder .name");
await page.waitForFunction(() => document.querySelectorAll("#folder-items .cell").length === 4);
await check(JSON.stringify(await summary()) === JSON.stringify({ images: 4, previews: 2, stale: 1, truth: 0, pending: 0, missing: 1 }), "the folder's sums, its photo among its images and pictured by Drive", await summary());
await page.click('#folder-layout button[data-layout="list"]');
await page.waitForFunction(() => $("#folder-items").dataset.layout === "list");
await check(true, "the list button lays the images out as a list");

await page.click("#update-previews");
await page.waitForFunction(() => /Delete it/.test($("#folder-msg").textContent));
await check(!writes.length, "a previews file the page did not make is left alone", writes);
// the user deletes it in Drive; the old file beside the images stays, unread
FILES.splice(FILES.findIndex((f) => f.name === OURS), 1);
await page.click("#data-tree .tree-folder .name");
await page.waitForFunction(() => document.querySelector('#folder-summary dd[data-k="previews"]')?.textContent === "1");
await page.click("#update-previews");
await page.waitForFunction(() => /3 previews made/.test($("#folder-msg").textContent), null, { timeout: 30000 });
await check(JSON.stringify(writes) === JSON.stringify([["create", OURS]]) && FILES.find((f) => f.name === OURS)?.parent === PREVIEWS_DIR,
  "Update previews creates the file in the root's Previews folder, named by the data folder's id, and writes nothing into the data folder", writes);
await page.waitForFunction(() => document.querySelector('#folder-summary dd[data-k="previews"]')?.textContent === "4");
await check(JSON.stringify(await summary()) === JSON.stringify({ images: 4, previews: 4, stale: 0, truth: 0, pending: 0, missing: 1 }), "then every image has a preview, the TIFFs from the file and the photo from Drive", await summary());
await page.waitForFunction(() => document.querySelectorAll("#folder-items .pic img").length === 4);
const photoPic = await page.evaluate(() => [...document.querySelectorAll("#folder-items .cell")].find((c) => c.querySelector(".name").textContent === "d photo.jpg")?.querySelector(".pic img")?.src || "");
await check(photoPic.startsWith("https://lh3.googleusercontent.com/") && thumbs.includes("d photo.jpg") && thumbs.every((n) => n === "d photo.jpg"),
  "the photo shows Drive's own small picture, and no TIFF asks Drive for one", { photoPic, thumbs });
await shot("3-list");
await page.click('#folder-layout button[data-layout="grid"]');
await page.waitForFunction(() => $("#folder-items").dataset.layout === "grid" && !document.getAnimations().some((a) => a.playState === "running"));
await page.click("#data-tree .tree-folder .count");
await page.waitForFunction(() => document.querySelectorAll("#data-tree .tree-folder .tree-image .pic img").length === 4);
await shot("2-grid");
await page.click("#data-tree .tree-folder .count");
// one image changes; the page replaces its own file, making that one preview alone
FILES.find((f) => f.name === "e plain.tif").bytes = Buffer.concat([FILES.find((f) => f.name === "e plain.tif").bytes, Buffer.from([0])]);
await page.click("#data-tree .tree-folder .name");
await page.waitForFunction(() => document.querySelector('#folder-summary dd[data-k="stale"]')?.textContent === "1");
await page.click("#update-previews");
await page.waitForFunction(() => /1 preview made, 2 kept/.test($("#folder-msg").textContent), null, { timeout: 30000 });
await check(JSON.stringify(writes.at(-1)) === JSON.stringify(["replace", OURS]), "a changed image: the page's own file is replaced, the rest kept", writes);
fs.writeFileSync(out, FILES.find((f) => f.name === OURS).bytes);

const cell = (name) => `#folder-items .cell:has(.name:text-is("${name}"))`;
await page.click(cell("e plain.tif") + " .mark-gt");
await page.waitForFunction(() => document.querySelector('#folder-summary dd[data-k="missing"]')?.textContent === "2");
const eMarker = neededOf("e plain.tif");
await check(JSON.stringify(writes.at(-1)) === JSON.stringify(["create", eMarker]) && FILES.find((f) => f.name === eMarker)?.parent === GT.curated,
  "marking an image creates its marker in the curated folder, not beside the image", writes);
await page.click(cell("e plain.tif") + " .mark-gt");
await page.waitForFunction(() => document.querySelector('#folder-summary dd[data-k="missing"]')?.textContent === "1");
await check(JSON.stringify(writes.at(-1)) === JSON.stringify(["trash", eMarker]), "unmarking trashes the page's own marker", writes);
await page.click(cell("b stack.tif") + " .mark-gt");
await page.waitForFunction(() => /Someone else/.test($("#folder-msg").textContent));
await check(writes.at(-1)[1] !== neededOf("b stack.tif"), "a marker someone else made is left alone");

await page.click("#data-tree .tree-folder .count");
await page.waitForFunction(() => document.querySelectorAll("#data-tree .tree-folder .tree-image").length === 4);
await page.waitForFunction(() => document.querySelectorAll("#data-tree .tree-folder .tree-image .pic img").length === 4);
await check(true, "a folder's images unfold with small previews");
await page.click('#data-tree .tree-image:has(.name:text-is("a flat.tif"))');
await page.waitForFunction(() => st.fileName === "a flat.preview.tif" && !$("#load-original").hidden);
await check(await page.evaluate(() => shellForTests.page.get("image").source.kind === "preview"), "an image chosen opens from its preview, with Load Original");
await shot("4-preview");
// the file the page opened, which is what Python is handed at a Run, for the test to open as the study would
const got = await page.evaluate(() => ({ name: st.kept.name, bytes: Array.from(new Uint8Array(st.kept.bytes)) }));
await check(got.name === "a flat.preview.tif", "the preview opens as a TIFF, the file Python is handed", got.name);
fs.writeFileSync(out + ".preview.tif", Buffer.from(got.bytes));
await page.click("#load-original");
// the name is set as the open starts, the image's source once it is done
await page.waitForFunction(() => shellForTests.page.get("image")?.source.kind === "drive" && $("#load-original").hidden).catch(() => {});
await check(await page.evaluate(() => st.fileName === "a flat.tif" && shellForTests.page.get("image")?.source.kind === "drive" && $("#load-original").hidden), "Load Original opens the image itself");

// offline (req/shell/offline/default): no bar asking for folders, and nothing written to Drive
await page.click("#data-tree .tree-folder .name");
await page.waitForFunction(() => document.querySelectorAll("#folder-items .cell").length === 4);
// its previews drawn first: Playwright's WebKit, set offline, fails every read of a Blob's bytes, the previews' among them
await page.waitForFunction(() => [...document.querySelectorAll("#folder-items .cell .pic")].every((p) => p.querySelector("img") || p.classList.contains("none")));
const before = writes.length;
await page.context().setOffline(true);
await page.waitForFunction(() => document.documentElement.classList.contains("offline"));
await page.click(cell("e plain.tif") + " .mark-gt", { force: true });
await turned();
await check(writes.length === before, "offline, marking an image does nothing", writes.slice(before));
// Data Management as a whole needs the network: its column's chevron does nothing
const folded = () => page.evaluate(() => $("#data-open").getAttribute("aria-expanded"));
await page.click("#data-open", { force: true });
await turned();
await check(await folded() === "true", "and its chevron does nothing", await folded());
await page.context().setOffline(false);
await page.waitForFunction(() => !document.documentElement.classList.contains("offline"));

await role(page, "Viewer");
const leftMode = () => $("#data-col").hidden && !$("#load").classList.contains("gone") && !$("#preprocessing-box").checkVisibility() && !document.documentElement.dataset.mode;
await page.waitForFunction(leftMode, null, { timeout: 5000 }).catch(() => {});
await check(await page.evaluate(leftMode),
  "another role leaves the mode: the column gone, Load back, Preprocessing gone");
// offline, Study Manager is listed, says it needs the internet, and choosing it does nothing (req/shell/data/mode)
await page.context().setOffline(true);
await page.waitForFunction(() => document.documentElement.classList.contains("offline"));
await page.click("#role-menu summary");
const offered = await page.evaluate(() => { const b = [...document.querySelectorAll("#role-list .item")].find((x) => x.textContent === "Study Manager");
  return b && { needs: /needs the internet/i.test(b.title), dim: +getComputedStyle(b).opacity < 1 }; });
await page.click('#role-list .item:text-is("Study Manager")', { force: true });
// the item's own click closes the menu at once, so a menu still open is a click that reached nothing
const after = await page.evaluate(() => ({ open: $("#role-menu").open, role: $("#role-name").textContent.trim(), mode: document.documentElement.dataset.mode || "" }));
await check(offered?.needs && offered.dim && after.open && after.role === "Viewer" && !after.mode, "offline, Study Manager is listed, says it needs the internet, and choosing it does nothing", { offered, after });
await page.evaluate(() => { $("#role-menu").open = false; });
await page.context().setOffline(false);
await page.waitForFunction(() => !document.documentElement.classList.contains("offline"));

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
const kept = FILES.find((f) => f.name === OURS);
kept.bytes = damage(Buffer.from(kept.bytes));
await role(page, "Study Manager");
await page.click("#data-tree .tree-folder .name");
await page.waitForFunction(() => document.querySelectorAll("#folder-items .cell .pic.none").length === 3, null, { timeout: 5000 }).catch(() => {});
await check(await page.evaluate(() => document.querySelectorAll("#folder-items .cell .pic.none").length === 3), "a previews file that cannot be read: each TIFF shows no preview, the photo still Drive's");
await page.click(cell("a flat.tif"));
await page.waitForFunction(() => st.fileName === "a flat.tif", null, { timeout: 5000 }).catch(() => {});
await check(await page.evaluate(() => st.fileName === "a flat.tif"), "and an image chosen opens itself");
await done(0);
