// Drives the page (web/) in headless Chromium, with a worker that never answers and a stand-in Drive API, and
// checks 1.6: the header's avatar opens a menu whose Manage storage dialog lists what this device keeps, in its
// six groups, folded at first, each entry with its size; deleting an entry or a group removes exactly what it
// lists; a thumbnail saved from now on is listed by its image's name. Then 1.7: the Drive dialog's Show
// thumbnails and Auto-save images, and the link beside them showing what thumbnails and images take; an image
// downloaded while Auto-save is on opens again with no download, one downloaded while it is off is not kept.
// Then 1.29: Load's dropdown lists the images opened from Drive, newest first, once each, two of one name told
// apart by their folder; a recent one opens from this device when it is kept there, and is downloaded when not.
// Optional SHOTS: a directory for screenshots.
// Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/storage_driver.mjs [SHOTS]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ROOT = "acmefolder0000000001";
// two images in a folder; their bytes need only be a real picture, which the worker never reads
const PNG = fs.readFileSync(path.join(repo, "dev", "tools", "build", "logo_source.png"));
const DRIVE = [{ id: "acmeimage00000000001", name: "acme one.png" }, { id: "acmeimage00000000002", name: "acme two.png" }];
// a subfolder, listed after the images, holding an image named as the first one
const SUB = { id: "acmefolder0000000002", name: "sub" }, TWIN = { id: "acmeimage00000000003", name: "acme one.png" };
const CONFIG = `window.NOR_CONFIG = { google: { apiKey: "stand-in" }, drive: { defaultLink: "" } };`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(""); }
  if (u === "/web/config.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(CONFIG); }
  const f = path.join(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch();
let failed = false;
const check = (ok, what) => { if (!ok) { failed = true; console.error("FAILED: " + what); } else console.log("ok: " + what); };

// what a browser that has used the page keeps: the shell's keys and the NoR study's, as their code writes them
const PIC = JSON.stringify("data:image/jpeg;base64," + "A".repeat(4000));
const SEED = {
  "nor-theme": "dark",
  "nor-drive-link": JSON.stringify(`https://drive.google.com/drive/folders/${ROOT}`),
  "nor-load-source": JSON.stringify("drive"),
  "nor-drive-thumb:ID1": PIC,
  "nor-drive-thumb:ID2": PIC,
  "nor-drive-thumbs-saved": JSON.stringify(["ID2", "ID1"]),
  "nor-drive-thumb-names": JSON.stringify({ ID1: "slide 1.tif" }),
  "nor-filter-settings-v1": JSON.stringify({ values: { min_len: 3 }, off: [] }),
  "nor-marks-v1:slide 1.tif|ridge": JSON.stringify({ "10,20": "in" }),
  "nor-mask-v1:slide 1.tif": JSON.stringify([[[0, 0], [5, 0], [5, 5]]]),
  "nor-edits-v1:other.tif|ridge": JSON.stringify({ "1,2": { length: 20 } }),
  "acme-key": "x",
};
const CODE = origin + "/cdn/pyodide.asm.wasm";

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
// how often each image was downloaded from Drive
const downloads = Object.fromEntries([...DRIVE, TWIN].map((f) => [f.id, 0]));
const cors = { "access-control-allow-origin": "*" };
await ctx.route("https://www.googleapis.com/**", (route) => {
  const id = new URL(route.request().url()).pathname.match(/\/drive\/v3\/files\/?(.*)$/)[1];
  if (!id) {
    const image = (f) => ({ ...f, mimeType: "image/png", size: String(PNG.length), createdTime: "2026-10-01T10:00:00Z" });
    const list = new URL(route.request().url()).searchParams.get("q").includes(SUB.id) ? [image(TWIN)]
      : [...DRIVE.map(image), { ...SUB, mimeType: "application/vnd.google-apps.folder" }];
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ files: list }) });
  }
  downloads[id]++;
  return route.fulfill({ status: 200, headers: cors, contentType: "image/png", body: PNG });
});
await ctx.route((u) => !u.href.startsWith(origin) && !u.href.startsWith("https://www.googleapis.com/"), (r) => r.abort());
await ctx.addInitScript((seed) => {
  delete Navigator.prototype.serviceWorker;
  if (sessionStorage.getItem("primed")) return;
  sessionStorage.setItem("primed", "1");
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
}, SEED);
const page = await ctx.newPage();
page.on("pageerror", (e) => { failed = true; console.error("page error: " + e.message); });
page.setDefaultTimeout(10000);
const shot = async (name, sel) => { if (shots) await page.locator(sel).screenshot({ path: path.join(shots, name + ".png") }); };
try {
  await page.goto(origin + "/web/index.html?study=nor");
  await page.waitForFunction(() => $("#title").textContent);
  // the code the service worker keeps, as it keeps it: the body, stamped with when it was kept
  await page.evaluate(async (url) => {
    const c = await caches.open("third-party-v1");
    await c.put(url, new Response(new Uint8Array(300 * 1024), { headers: { "x-nor-cached-at": String(Date.now()) } }));
  }, CODE);

  const avatar = await page.$("header #user-menu summary img, header #user-menu summary svg");
  check(!!avatar, "the header shows the user's avatar");
  if (!avatar) throw new Error("no avatar");
  await page.click("#user-menu summary");
  check(await page.isVisible("#manage-storage"), "clicking it shows Manage storage");
  await shot("user_menu", "body");
  await page.click("#manage-storage");
  await page.waitForFunction(() => $("#storage-dlg").open && !/Reading/.test($("#storage-list").textContent));
  check(await page.evaluate(() => document.querySelectorAll("#storage-list .group").length === 6 && !document.querySelector("#storage-list .group[open]")),
    "every group starts folded");
  await shot("storage_folded", "#storage-dlg");
  for (const s of await page.$$("#storage-list .group > summary")) await s.click();
  await shot("storage_dialog", "#storage-dlg");

  // each group's rows: name, what is kept, size
  const groups = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#storage-list .group")].map((g) => [g.dataset.group,
    [...g.querySelectorAll(".entry")].map((e) => ({ name: e.querySelector(".name").textContent, what: e.querySelector(".what")?.textContent || "", size: e.querySelector(".size").textContent }))])));
  let g = await groups();
  const names = (k) => (g[k] || []).map((e) => e.name);
  check(Object.keys(g).join() === "code,thumbs,files,settings,images,other", `six groups, in order: ${Object.keys(g)}`);
  check(names("code").join() === "pyodide.asm.wasm" && /300 KB/.test(g.code[0].size), `the code kept, by file, with its size: ${JSON.stringify(g.code)}`);
  check(names("thumbs").sort().join() === "ID2,slide 1.tif", `thumbnails by image name, or Drive id when none was kept: ${names("thumbs")}`);
  check(["Theme", "Last Google Drive link", "Filter settings"].every((n) => names("settings").includes(n)), `settings, the shell's and the study's: ${names("settings")}`);
  check(names("images").sort().join() === "other.tif,slide 1.tif", `selections by image: ${names("images")}`);
  const slide = (g.images || []).find((e) => e.name === "slide 1.tif");
  check(slide && /keep/i.test(slide.what) && /mask/i.test(slide.what), `an image's row says what is kept for it: "${slide && slide.what}"`);
  check(names("other").join() === "acme-key", `what nobody names is listed as it is: ${names("other")}`);
  const all = Object.values(g).flat();
  // the seed's nine, and the version seen, which the page writes on a first visit
  check(all.length === 11 && all.every((e) => /\d/.test(e.size)), `every entry, ${all.length} of 11, shows its size`);
  check(/\d/.test(await page.textContent("#storage-total")), "the dialog says how much the site keeps in all");

  // deleting one image's selections removes its keys only
  page.once("dialog", (d) => d.accept());
  await page.click('#storage-list .group[data-group=images] .entry[data-name="slide 1.tif"] .del');
  await page.waitForFunction(() => !document.querySelector('#storage-list .group[data-group=images] .entry[data-name="slide 1.tif"]'));
  const k = await page.evaluate(() => Object.keys(localStorage));
  check(!k.some((x) => x.includes("slide 1.tif|") || x.endsWith(":slide 1.tif")) && k.includes("nor-edits-v1:other.tif|ridge"), `deleting an image removes its selections only: ${k}`);
  check(await page.isVisible("#storage-reload"), "and offers to reload the page, which still holds them");

  // deleting a thumbnail removes it, its place in the list and its name
  await page.click('#storage-list .group[data-group=thumbs] .entry[data-name="slide 1.tif"] .del');
  await page.waitForFunction(() => !document.querySelector('#storage-list .group[data-group=thumbs] .entry[data-name="slide 1.tif"]'));
  const thumbs = await page.evaluate(() => [localStorage.getItem("nor-drive-thumb:ID1"), localStorage.getItem("nor-drive-thumbs-saved"), localStorage.getItem("nor-drive-thumb-names")]);
  check(thumbs[0] === null && thumbs[1] === '["ID2"]' && thumbs[2] === "{}", `deleting a thumbnail removes it from every list: ${thumbs}`);

  // clearing a group: the code
  page.once("dialog", (d) => d.accept());
  await page.click("#storage-list .group[data-group=code] .clear");
  await page.waitForFunction(() => !document.querySelector("#storage-list .group[data-group=code] .entry"));
  check(!(await page.evaluate(async (url) => !!(await caches.match(url)), CODE)), "clearing the code deletes it from the cache");
  g = await groups();
  check(names("settings").includes("Theme") && names("thumbs").join() === "ID2", "and leaves the other groups alone");

  // a thumbnail saved from now on keeps its image's name
  await page.evaluate(() => {
    const px = new Uint8Array(16).fill(100);
    Object.assign(st, { W: 4, H: 4, img: { r: px, g: px, b: px } });
    shellForTests.saveThumb("ID3", "new slide.tif");
  });
  check((await page.evaluate(() => JSON.parse(localStorage.getItem("nor-drive-thumb-names")).ID3)) === "new slide.tif", "a thumbnail saved now keeps its image's name");
  await page.click("#storage-dlg button[value=close]");

  // ---- 1.7: the Drive dialog's options, and images kept on this device ----
  const drive = async () => {
    // from Load's menu: Load itself is held while an image waits for Python, which never answers here
    await page.click("#load-menu summary"); await page.click('#load-menu .item[data-src="drive"]');
    await page.waitForFunction((n) => $("#drive-dlg").open && document.querySelectorAll("#drive-list .item:not(.folder)").length === n && /\d/.test($("#drive-storage").textContent), DRIVE.length);
  };
  const saved = () => page.evaluate(async () => (await (await caches.open("nor-images-v1")).keys()).length);
  const sizeOf = (t) => { const [n, u] = t.split(" "); return Number(n) * { KB: 1, MB: 1024, GB: 1024 * 1024 }[u]; };
  const openRow = async (k) => { await page.dblclick(`#drive-list .item:nth-child(${k})`); await page.waitForFunction(() => !$("#drive-dlg").open); };
  await drive();
  const labels = await page.evaluate(() => [$("#drive-thumbs-l").textContent, $("#drive-thumbs").checked, $("#drive-autosave-l").textContent, $("#drive-autosave").checked]);
  check(/^Show thumbnails/.test(labels[0]) && labels[1] && /^Auto-save images/.test(labels[2]) && labels[3], `Show thumbnails and Auto-save images, both on at first: ${labels}`);
  const before = await page.textContent("#drive-storage");
  await shot("drive_row", "#drive-dlg");
  await openRow(1);
  await page.waitForFunction(async () => (await (await caches.open("nor-images-v1")).keys()).length === 1);
  check(downloads[DRIVE[0].id] === 1, "an image opened from Drive is downloaded once");
  await drive();
  const after = await page.textContent("#drive-storage");
  check(sizeOf(after) - sizeOf(before) >= PNG.length / 1024 - 1, `the link counts the saved image: ${before} → ${after}`);
  await openRow(1);
  await page.waitForFunction((name) => st.fileName === name, DRIVE[0].name);
  check(downloads[DRIVE[0].id] === 1, "opened again, it comes from this device with no download");

  await drive();
  await page.click("#drive-storage");
  await page.waitForFunction(() => $("#storage-dlg").open && !/Reading/.test($("#storage-list").textContent));
  g = await groups();
  check(names("files").join() === DRIVE[0].name && /\d/.test(g.files[0].size), `the link opens Manage storage, which lists the saved image: ${JSON.stringify(g.files)}`);
  await page.click("#storage-dlg button[value=close]");

  await page.uncheck("#drive-autosave");
  await page.reload(); await page.waitForFunction(() => $("#title").textContent);
  await drive();
  check(!(await page.isChecked("#drive-autosave")), "unticking Auto-save images is remembered");
  await openRow(2);
  for (let t = 0; t < 50 && !downloads[DRIVE[1].id]; t++) await page.waitForTimeout(100);
  await page.waitForTimeout(300);
  check(downloads[DRIVE[1].id] === 1 && (await saved()) === 1, "with it off, an image is downloaded and not kept");

  // ---- 1.29: the recent images in Load's dropdown ----
  const recents = async () => {
    await page.click("#load-menu summary");
    const r = await page.$$eval("#load-menu .recent", (bs) => bs.map((b) => ({ name: b.querySelector(".name").textContent, where: b.querySelector(".where").textContent, logo: !!b.querySelector("svg.drive-logo") })));
    await page.click("#load-menu summary");
    return r;
  };
  let r = await recents();
  check(r.map((e) => e.name).join() === `${DRIVE[1].name},${DRIVE[0].name}`, `the dropdown lists the images opened, newest first, once each: ${JSON.stringify(r)}`);
  check(r.every((e) => e.logo) && (await page.$('#load-menu .item[data-src="drive"] svg.drive-logo')), "each recent, and From Google Drive, shows Drive's logo");
  await page.click("#load-menu summary"); await shot("load_recents", "#load-menu .pop"); await page.click("#load-menu summary");
  await drive();
  await page.check("#drive-autosave");
  await page.dblclick("#drive-list .item.folder");
  await page.waitForFunction(() => document.querySelectorAll("#drive-list .item").length === 1 && /sub/.test($("#drive-path").textContent));
  await page.dblclick("#drive-list .item:nth-child(1)"); await page.waitForFunction(() => !$("#drive-dlg").open);
  await page.waitForFunction(async () => (await (await caches.open("nor-images-v1")).keys()).length === 2);
  r = await recents();
  check(r.length === 3 && r[0].name === TWIN.name && r[2].name === DRIVE[0].name && /sub/.test(r[0].where) && r[0].where !== r[2].where,
    `two images of one name are listed apart, by where they are in Drive: ${JSON.stringify(r)}`);
  const pick = async (k, id) => {
    await page.click("#load-menu summary"); await page.click(`#load-menu .recent:nth-of-type(${k})`);
    await page.waitForFunction((i) => st.source && st.source.id === i, id);
  };
  await pick(3, DRIVE[0].id);
  check(downloads[DRIVE[0].id] === 1 && downloads[TWIN.id] === 1, "a recent image kept on this device opens with no download, the one it was chosen as");
  r = await recents();
  check(r.map((e) => e.name).join() === `${DRIVE[0].name},${TWIN.name},${DRIVE[1].name}` && /sub/.test(r[1].where), `opening it moves it to the top: ${JSON.stringify(r)}`);
  await pick(3, DRIVE[1].id);
  for (let t = 0; t < 50 && downloads[DRIVE[1].id] < 2; t++) await page.waitForTimeout(100);
  check(downloads[DRIVE[1].id] === 2, "a recent image not kept is downloaded again");
} catch (e) {
  failed = true; console.error("FAILED: " + e.message);
}
await browser.close(); server.close();
process.exitCode = failed ? 1 : 0;
