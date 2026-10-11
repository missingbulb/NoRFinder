// Drives the page (web/) in headless Chromium, with a worker that never answers, and checks S6: the header's
// avatar opens a menu whose Manage storage dialog lists what this device keeps, in its five groups, each entry
// with its size; deleting an entry or a group removes exactly what it lists; a thumbnail saved from now on is
// listed by its image's name. Optional SHOTS: a directory for screenshots.
// Exits 1 on a failed check, 2 when it cannot run.
//   node tests/storage_driver.mjs [SHOTS]
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

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(""); }
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
  "nor-drive-link": JSON.stringify("https://drive.google.com/drive/folders/abc"),
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
await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
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
  await page.goto(origin + "/web/index.html");
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
  await shot("storage_dialog", "#storage-dlg");

  // each group's rows: name, what is kept, size
  const groups = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#storage-list .group")].map((g) => [g.dataset.group,
    [...g.querySelectorAll(".entry")].map((e) => ({ name: e.querySelector(".name").textContent, what: e.querySelector(".what")?.textContent || "", size: e.querySelector(".size").textContent }))])));
  let g = await groups();
  const names = (k) => (g[k] || []).map((e) => e.name);
  check(Object.keys(g).join() === "code,thumbs,settings,images,other", `five groups, in order: ${Object.keys(g)}`);
  check(names("code").join() === "pyodide.asm.wasm" && /300 KB/.test(g.code[0].size), `the code kept, by file, with its size: ${JSON.stringify(g.code)}`);
  check(names("thumbs").sort().join() === "ID2,slide 1.tif", `thumbnails by image name, or Drive id when none was kept: ${names("thumbs")}`);
  check(["Theme", "Last Google Drive link", "Filter settings"].every((n) => names("settings").includes(n)), `settings, the shell's and the study's: ${names("settings")}`);
  check(names("images").sort().join() === "other.tif,slide 1.tif", `selections by image: ${names("images")}`);
  const slide = (g.images || []).find((e) => e.name === "slide 1.tif");
  check(slide && /keep/i.test(slide.what) && /mask/i.test(slide.what), `an image's row says what is kept for it: "${slide && slide.what}"`);
  check(names("other").join() === "acme-key", `what nobody names is listed as it is: ${names("other")}`);
  const all = Object.values(g).flat();
  // the seed's nine, and the version seen, which the page writes on a first visit
  check(all.length === 10 && all.every((e) => /\d/.test(e.size)), `every entry, ${all.length} of 10, shows its size`);
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
} catch (e) {
  failed = true; console.error("FAILED: " + e.message);
}
await browser.close(); server.close();
process.exitCode = failed ? 1 : 0;
