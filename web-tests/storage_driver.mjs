// Drives the page (web/) in headless Chromium, with a worker that never answers and a stand-in Drive API, and
// checks req/shell/storage/manage: the header's avatar opens a menu whose Manage storage dialog lists what this device keeps, a section
// per study, then the shared and the rest, folded at first, each entry with its size, and no setting; deleting an
// entry removes exactly what it lists, and a study's Delete all purges it but what other studies use; a thumbnail
// saved from now on is listed by its image's name. req/shell/account/settings: Settings lists the settings kept on this device only, to
// clear. req/shell/offline/mark: the study switcher and the Drive dialog mark what is available offline. Then req/shell/drive/kept-images: the Drive dialog's Show
// thumbnails and Auto-save images, and the link beside them showing what thumbnails and images take; an image
// downloaded while Auto-save is on opens again with no download, one downloaded while it is off is not kept.
// Then req/shell/load/selector: the image selector lists the images opened from Drive, newest first, once each, two of one name told
// apart by their folder; a recent one opens from this device when it is kept there, and is downloaded when not.
// Optional SHOTS: a directory for screenshots.
// Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/storage_driver.mjs [SHOTS]
import { noisePng } from "./png_fixture.mjs";
import { repoFile } from "./repo_file.mjs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { offSite } from "./off_site.mjs";
import { keptContext } from "./kept_context.mjs";
import { cutShort } from "./page_errors.mjs";
import { until } from "./page_until.mjs";
import { pressDrive, pickRecent } from "./drive_open.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ROOT = "acmefolder0000000001";
// two images in a folder; their bytes need only be a real picture, which the worker never reads
const PNG = noisePng();
const DRIVE = [{ id: "acmeimage00000000001", name: "acme one.png" }, { id: "acmeimage00000000002", name: "acme two.png" }];
// a subfolder, listed after the images, holding an image named as the first one
const SUB = { id: "acmefolder0000000002", name: "sub" }, TWIN = { id: "acmeimage00000000003", name: "acme one.png" };
const OWN_PACKAGE = "acmepkg";
const CONFIG = `window.NOR_CONFIG = { google: { apiKey: "stand-in" } };`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(""); }
  if (u === "/web/studies.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end(LISTED); }
  if (u === "/web/vendor/wheels.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end("[]"); }
  if (u === "/web/config.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(CONFIG); }
  // NoR Finder with a package of its own, which no other study names
  if (u === "/studies/nor/study.json") {
    const m = JSON.parse(fs.readFileSync(path.join(repo, u), "utf8"));
    r.writeHead(200, { "content-type": "application/json" }); return r.end(JSON.stringify({ ...m, python: { ...m.python, packages: [...m.python.packages, OWN_PACKAGE] } }));
  }
  const f = repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

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
// Python as the CDN holds it: itself, a lock naming a stand-in file per package, the packages two studies or more
// use and one only NoR Finder does, as it is served here; the build's vendored wheels, none here
const { PYODIDE, CORE } = await import(path.join(repo, "web", "python_files.js"));
const LOCK = { packages: Object.fromEntries(["numpy", "scipy", "scikit-image", "lazy-loader", "packaging", "pillow", OWN_PACKAGE].map((n) => [n, { file_name: `${n}-1-py3-none-any.whl`, sha256: "" }])) };
const SHARED = ["numpy", "pillow"].map((n) => PYODIDE + LOCK.packages[n].file_name), OWN = PYODIDE + LOCK.packages[OWN_PACKAGE].file_name;
// the studies the build lists, as it lists them
const LISTED = JSON.stringify(fs.readdirSync(path.join(repo, "studies")).filter((d) => fs.existsSync(path.join(repo, "studies", d, "study.json")))
  .map((d) => JSON.parse(fs.readFileSync(path.join(repo, "studies", d, "study.json")))).filter((m) => m.visibility === "listed")
  .map((m) => ({ id: m.id, title: m.title })).sort((a, b) => a.title.localeCompare(b.title)));

const ctx = await keptContext(pw, { viewport: { width: 1400, height: 900 } });
// how often each image was downloaded from Drive
const downloads = Object.fromEntries([...DRIVE, TWIN].map((f) => [f.id, 0]));
const cors = { "access-control-allow-origin": "*" };
await ctx.route("https://www.googleapis.com/**", (route) => {
  const id = new URL(route.request().url()).pathname.match(/\/drive\/v3\/files\/?(.*)$/)[1];
  // each file's SHA-256, where a request's fields ask for it, as Drive gives it
  const fields = new URL(route.request().url()).searchParams.get("fields") || "";
  const hash = fields.includes("sha256Checksum") ? { sha256Checksum: createHash("sha256").update(PNG).digest("hex") } : {};
  if (!id) {
    const image = (f) => ({ ...f, mimeType: "image/png", size: String(PNG.length), createdTime: "2026-10-01T10:00:00Z", ...hash });
    const list = new URL(route.request().url()).searchParams.get("q").includes(SUB.id) ? [image(TWIN)]
      : [...DRIVE.map(image), { ...SUB, mimeType: "application/vnd.google-apps.folder" }];
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ files: list }) });
  }
  // a file's details, as Drive answers them
  if (new URL(route.request().url()).searchParams.get("alt") !== "media")
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ id, ...hash }) });
  downloads[id]++;
  return route.fulfill({ status: 200, headers: cors, contentType: "image/png", body: PNG });
});
await ctx.route(offSite(origin, "https://www.googleapis.com/"), (r) => r.abort());
await ctx.route(CORE.at(-1), (r) => r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify(LOCK) }));
await ctx.addInitScript((seed) => {
  delete Navigator.prototype.serviceWorker;
  if (sessionStorage.getItem("primed")) return;
  sessionStorage.setItem("primed", "1");
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
}, SEED);
const page = await ctx.newPage();
page.on("pageerror", (e) => { if (cutShort(e)) return; failed = true; console.error("page error: " + e.message); });
page.setDefaultTimeout(10000);
const shot = async (name, sel) => { if (shots) await page.locator(sel).screenshot({ path: path.join(shots, name + ".png") }); };
try {
  await page.goto(origin + "/web/index.html?study=nor");
  await page.waitForFunction(() => $("#title").textContent);
  // what the service worker keeps, as it keeps it: the body, stamped with when it was kept: Python itself, two
  // packages every study uses and one only NoR Finder does; and two images kept from Drive, one in NoR Finder
  await page.evaluate(async ({ core, shared, own }) => {
    const c = await caches.open("third-party-v1"), at = { "x-nor-cached-at": String(Date.now()) };
    for (const u of [...core, ...shared]) await c.put(u, new Response(new Uint8Array(1024), { headers: at }));
    await c.put(own, new Response(new Uint8Array(300 * 1024), { headers: at }));
    const im = await caches.open("nor-images-v1"), url = (id) => new URL("drive-image/" + id, location.href).href;
    await im.put(url("ID1"), new Response(new Uint8Array(2048), { headers: { "x-nor-name": "slide%201.tif", "x-nor-study": "nor" } }));
    await im.put(url("ID9"), new Response(new Uint8Array(2048), { headers: { "x-nor-name": "old.tif" } }));
  }, { core: CORE, shared: SHARED, own: OWN });

  // req/shell/offline/mark: a study whose Python is all here is marked in the switcher, green, a state rather than a
  // prompt: no tooltip and no question-mark pointer, what it means said to assistive tech only
  await page.click("#study-menu summary");
  await page.waitForFunction(() => document.querySelector('#study-list a[data-id="viewer"] .offline-mark'), null, { timeout: 5000 }).catch(() => {});
  const marks = await page.$$eval("#study-list a", (as) => as.map((a) => {
    const m = a.querySelector(".offline-mark"), cs = m && getComputedStyle(m);
    const end = Math.max(...[...a.children].filter((c) => c.offsetParent).map((c) => c.getBoundingClientRect().right));
    return { id: a.dataset.id, mark: m?.getAttribute("aria-label") || "", title: m?.title || "", cursor: cs?.cursor, colour: cs?.color, room: a.getBoundingClientRect().right - end };
  }));
  const green = await page.evaluate(() => { const s = document.createElement("span"); s.style.color = "var(--yes)"; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; });
  const viewerMark = marks.find((m) => m.id === "viewer") || {};
  check(/without the internet/.test(viewerMark.mark) && !marks.find((m) => m.id === "nor")?.mark,
    `the switcher marks the study whose Python is all here, and only it: ${JSON.stringify(marks)}`);
  check(viewerMark.colour === green && !viewerMark.title && viewerMark.cursor !== "help",
    `the mark is green, with no tooltip and no question-mark pointer: ${JSON.stringify({ ...viewerMark, green })}`);
  check(marks.every((m) => m.room >= 8), `each row keeps 8 px at its right, past its mark and stage: ${JSON.stringify(marks.map((m) => m.room))}`);
  await page.click("#study-menu summary");

  const avatar = await page.$("header #user-menu summary img, header #user-menu summary svg");
  check(!!avatar, "the header shows the user's avatar");
  if (!avatar) throw new Error("no avatar");
  await page.click("#user-menu summary");
  check(await page.isVisible("#manage-storage"), "clicking it shows Manage storage");
  await shot("user_menu", "body");
  await page.click("#manage-storage");
  await page.waitForFunction(() => $("#usage-dlg").open && !/Reading/.test($("#storage-list").textContent));
  check(await page.evaluate(() => !document.querySelector("#storage-list .group[open]")), "every section starts folded");
  await shot("storage_folded", "#usage-dlg");
  for (const s of await page.$$("#storage-list .group > summary")) await s.click();
  await shot("storage_dialog", "#usage-dlg");

  // each section's rows: kind, name, what is kept, size
  const groups = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#storage-list .group")].map((g) => [g.dataset.group,
    [...g.querySelectorAll(".entry")].map((e) => ({ kind: e.dataset.kind, name: e.querySelector(".name").textContent, what: e.querySelector(".what")?.textContent || "", size: e.querySelector(".size").textContent, del: !!e.querySelector(".del") }))])));
  let g = await groups();
  const names = (k, kind) => (g[k] || []).filter((e) => !kind || e.kind === kind).map((e) => e.name);
  check(Object.keys(g).join() === "study:viewer,study:nor,study:vascular,shared", `a section per study, by title, then the shared: ${Object.keys(g)}`);
  const titles = await page.$$eval("#storage-list .group > summary", (ss) => ss.map((s) => ({ text: s.textContent, mark: !!s.querySelector(".offline-mark") })));
  check(titles[0].mark && !titles[1].mark && /Image Viewer/.test(titles[0].text) && /NoR Finder/.test(titles[1].text), `a study's title says whether it is available offline: ${JSON.stringify(titles)}`);
  check(names("study:nor", "python").join() === OWN_PACKAGE && /300 KB/.test(g["study:nor"].find((e) => e.kind === "python").size), `a study's own Python packages, by package: ${JSON.stringify(g["study:nor"])}`);
  check(names("study:nor", "image").sort().join() === "old.tif,slide 1.tif", `the images kept in a study, by name, one kept before studies were told apart with the study on show: ${names("study:nor", "image")}`);
  const pics = g["study:nor"].filter((e) => e.kind === "thumb");
  check(pics.length === 1 && /2 images/.test(pics[0].what), `the study's thumbnails, one record for all: ${JSON.stringify(pics)}`);
  check(names("study:nor", "selections").sort().join() === "other.tif,slide 1.tif", `the study on show's selections, by image: ${names("study:nor", "selections")}`);
  const slide = g["study:nor"].find((e) => e.kind === "selections" && e.name === "slide 1.tif");
  check(slide && /keep/i.test(slide.what) && /mask/i.test(slide.what), `an image's row says what is kept for it: "${slide && slide.what}"`);
  check(names("shared").sort().join() === "Python itself,numpy,pillow", `what two studies or more use is shared: ${names("shared")}`);
  const all = Object.values(g).flat();
  check(!all.some((e) => ["Theme", "Last Google Drive link", "Filter settings"].includes(e.name)), "no setting is listed: Settings keeps them");
  check(!all.some((e) => e.name === "acme-key"), "what nobody names is not listed");
  check(all.length === 9 && all.every((e) => /\d/.test(e.size)), `every entry, ${all.length} of 9, shows its size`);
  check(/\d/.test(await page.textContent("#storage-total")) && /settings/i.test(await page.textContent("#storage-total")), "the dialog says how much the site keeps in all, settings included: " + (await page.textContent("#storage-total")));

  // deleting one image's selections removes its keys only
  page.once("dialog", (d) => d.accept());
  await page.click('#storage-list .group[data-group="study:nor"] .entry[data-kind=selections][data-name="slide 1.tif"] .del');
  await page.waitForFunction(() => !document.querySelector('#storage-list .entry[data-kind=selections][data-name="slide 1.tif"]'));
  const k = await page.evaluate(() => Object.keys(localStorage));
  check(!k.some((x) => x.includes("slide 1.tif|") || x.endsWith(":slide 1.tif")) && k.includes("nor-edits-v1:other.tif|ridge"), `deleting an image removes its selections only: ${k}`);
  check(await page.isVisible("#storage-reload"), "and offers to reload the page, which still holds them");

  // deleting the thumbnails removes each, its place in the list and its name
  await page.click('#storage-list .group[data-group="study:nor"] .entry[data-kind=thumb] .del');
  await page.waitForFunction(() => !document.querySelector('#storage-list .entry[data-kind=thumb]'));
  const thumbs = await page.evaluate(() => [localStorage.getItem("nor-drive-thumb:ID1"), localStorage.getItem("nor-drive-thumb:ID2"), localStorage.getItem("nor-drive-thumbs-saved"), localStorage.getItem("nor-drive-thumb-names")]);
  check(thumbs[0] === null && thumbs[1] === null && thumbs[2] === "[]" && thumbs[3] === "{}", `deleting the thumbnails removes them from every list: ${thumbs}`);

  // a study's Delete all purges it, leaving what other studies use
  page.once("dialog", (d) => d.accept());
  await page.click('#storage-list .group[data-group="study:nor"] .clear');
  await page.waitForFunction(() => !document.querySelector('#storage-list .group[data-group="study:nor"] .entry'));
  const left = await page.evaluate(async ({ own, shared }) => ({ own: !!(await caches.match(own)), shared: (await Promise.all(shared.map((u) => caches.match(u)))).every(Boolean),
    image: !!(await caches.match(new URL("drive-image/ID1", location.href).href)) || !!(await caches.match(new URL("drive-image/ID9", location.href).href)),
    selections: Object.keys(localStorage).filter((x) => x.startsWith("nor-edits-v1:")).length, other: localStorage.getItem("acme-key") }), { own: OWN, shared: SHARED });
  check(!left.own && !left.image && !left.selections && left.shared && left.other === "x", `a study's Delete all deletes its own packages, images and selections, and keeps the shared and what nobody names: ${JSON.stringify(left)}`);
  g = await groups();
  check(names("shared").length === 3, "and leaves the shared section alone");
  await page.click("#usage-dlg button[value=close]");

  // req/shell/account/settings: the settings kept on this device only are listed in Settings, each to clear
  await page.click("#user-menu summary"); await page.click("#open-settings");
  await page.waitForFunction(() => $("#settings-dlg").open);
  const local = await page.$$eval('#settings-dlg input[name="device-only"]', (is) => is.map((i) => ({ key: i.value, label: i.closest("label").textContent, on: i.checked })));
  check(local.some((e) => e.key === "nor-filter-settings-v1" && /Filter settings/.test(e.label) && /\d/.test(e.label) && e.on) && !local.some((e) => e.key === "nor-theme"),
    `Settings lists the settings kept on this device only, the study's too, each with its size, and not those that follow the user: ${JSON.stringify(local)}`);
  await page.uncheck('#settings-dlg input[name="device-only"][value="nor-filter-settings-v1"]');
  await page.click("#settings-save");
  check(await page.evaluate(() => localStorage.getItem("nor-filter-settings-v1") === null && localStorage.getItem("nor-theme") === "dark"), "clearing one there forgets it on Save, and only it");
  await page.click("#user-menu summary"); await page.click("#manage-storage");
  await page.waitForFunction(() => $("#usage-dlg").open && !/Reading/.test($("#storage-list").textContent));

  // a thumbnail saved from now on keeps its image's name
  await page.evaluate(() => {
    Object.assign(st, { W: 4, H: 4, img: { planes: new Uint8Array(48).fill(100), n: 3 } });
    shellForTests.saveThumb("ID3", "new slide.tif");
  });
  check((await page.evaluate(() => JSON.parse(localStorage.getItem("nor-drive-thumb-names")).ID3)) === "new slide.tif", "a thumbnail saved now keeps its image's name");
  await page.click("#usage-dlg button[value=close]");

  // ---- req/shell/drive/kept-images: the Drive dialog's options, and images kept on this device ----
  const drive = async () => {
    // Drive's button, free while an image waits for Python, which never answers here
    await pressDrive(page);
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
  await until(page, async () => (await (await caches.open("nor-images-v1")).keys()).length === 1);
  check(downloads[DRIVE[0].id] === 1, "an image opened from Drive is downloaded once");
  await drive();
  const after = await page.textContent("#drive-storage");
  check(sizeOf(after) - sizeOf(before) >= PNG.length / 1024 - 1, `the link counts the saved image: ${before} → ${after}`);
  await openRow(1);
  await page.waitForFunction((name) => st.fileName === name, DRIVE[0].name);
  check(downloads[DRIVE[0].id] === 1, "opened again, it comes from this device with no download");

  await drive();
  await page.click("#drive-storage");
  await page.waitForFunction(() => $("#usage-dlg").open && !/Reading/.test($("#storage-list").textContent));
  g = await groups();
  check(names("study:nor", "image").join() === DRIVE[0].name && /\d/.test(g["study:nor"].find((e) => e.kind === "image").size), `the link opens Manage storage, which lists the saved image in its study: ${JSON.stringify(g["study:nor"])}`);
  await page.click("#usage-dlg button[value=close]");
  // req/shell/offline/mark: in the Drive dialog, still open beneath, the kept image is marked, the other not
  const rowMarks = await page.$$eval("#drive-list .item:not(.folder)", (rs) => rs.map((r) => r.querySelector(".offline-mark")?.getAttribute("aria-label") || ""));
  check(/without the internet/.test(rowMarks[0]) && !rowMarks[1], `the Drive dialog marks the image kept on this device, and only it: ${JSON.stringify(rowMarks)}`);

  await page.uncheck("#drive-autosave");
  await page.reload(); await page.waitForFunction(() => $("#title").textContent);
  await drive();
  check(!(await page.isChecked("#drive-autosave")), "unticking Auto-save images is remembered");
  await openRow(2);
  for (let t = 0; t < 50 && !downloads[DRIVE[1].id]; t++) await page.waitForTimeout(100);
  await page.waitForTimeout(300);
  check(downloads[DRIVE[1].id] === 1 && (await saved()) === 1, "with it off, an image is downloaded and not kept");

  // ---- req/shell/load/selector: the recent images in the image selector ----
  const recents = async () => {
    await pickRecent(page, null);
    const r = await page.$$eval("#image-menu .recent", (bs) => bs.map((b) => ({ name: b.querySelector(".name").textContent, where: b.querySelector(".where").textContent, logo: !!b.querySelector("svg.drive-logo") })));
    await page.click("#image-pick");
    return r;
  };
  let r = await recents();
  check(r.map((e) => e.name).join() === `${DRIVE[1].name},${DRIVE[0].name}`, `the selector lists the images opened, newest first, once each: ${JSON.stringify(r)}`);
  check(r.every((e) => e.logo) && (await page.$("#load-drive svg.drive-logo")), "each recent, and Drive's button, shows Drive's logo");
  await pickRecent(page, null);
  const fit = await page.evaluate(() => { const p = $("#image-menu .pop").getBoundingClientRect(), bar = $("#left"), b = bar.getBoundingClientRect();
    return { pop: [Math.round(p.left), Math.round(p.right)], bar: [Math.round(b.left), Math.round(b.left + bar.clientWidth)], scrolls: bar.scrollWidth > bar.clientWidth }; });
  await shot("load_recents", "#image-menu .pop"); await page.click("#image-pick");
  check(fit.pop[0] >= fit.bar[0] && fit.pop[1] <= fit.bar[1] && !fit.scrolls, `the selector's list stays inside the left bar: ${JSON.stringify(fit)}`);
  await drive();
  await page.check("#drive-autosave");
  await page.dblclick("#drive-list .item.folder");
  await page.waitForFunction(() => document.querySelectorAll("#drive-list .item").length === 1 && /sub/.test($("#drive-path").textContent));
  await page.dblclick("#drive-list .item:nth-child(1)"); await page.waitForFunction(() => !$("#drive-dlg").open);
  await until(page, async () => (await (await caches.open("nor-images-v1")).keys()).length === 2);
  r = await recents();
  check(r.length === 3 && r[0].name === TWIN.name && r[2].name === DRIVE[0].name && /sub/.test(r[0].where) && r[0].where !== r[2].where,
    `two images of one name are listed apart, by where they are in Drive: ${JSON.stringify(r)}`);
  const pick = async (k, id) => {
    await pickRecent(page, k);
    await page.waitForFunction((i) => st.source && st.source.id === i, id);
  };
  await pick(3, DRIVE[0].id);
  check(downloads[DRIVE[0].id] === 1 && downloads[TWIN.id] === 1, "a recent image kept on this device opens with no download, the one it was chosen as");
  r = await recents();
  check(r.map((e) => e.name).join() === `${DRIVE[0].name},${TWIN.name},${DRIVE[1].name}` && /sub/.test(r[1].where), `opening it moves it to the top: ${JSON.stringify(r)}`);
  await pick(3, DRIVE[1].id);
  for (let t = 0; t < 50 && downloads[DRIVE[1].id] < 2; t++) await page.waitForTimeout(100);
  check(downloads[DRIVE[1].id] === 2, "a recent image not kept is downloaded again");
  // each study lists only the images opened in it
  const inStudy = async (id) => {
    await page.goto(origin + "/web/index.html?study=" + id);
    // the steps are drawn once the study has mounted, as the recents are
    await page.waitForFunction(() => document.querySelector("#sb-steps .crumb"));
    return page.evaluate(() => document.querySelectorAll("#image-menu .recent").length);
  };
  const other = await inStudy("vascular");
  check(other === 0, `another study lists none of the images opened in this one: ${other}`);
  const back = await inStudy("nor");
  check(back === 3, `back in the study, its own are listed again: ${back}`);
} catch (e) {
  failed = true; console.error("FAILED: " + e.message);
}
await ctx.close(); server.close();
process.exitCode = failed ? 1 : 0;
