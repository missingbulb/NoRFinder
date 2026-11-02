// Drives the built site (SITE, as dev/tools/build/build.py assembles it with a stand-in GOOGLE_API_KEY) in headless Chromium with the real worker
// and the real Pyodide from its CDN, over a server that answers as Cloudflare does and a stand-in Drive API, and
// checks 1.55 and 1.56.
// 1.56 first, online: the Storage tab offers each study not all here Make available offline, whose popup lists the
// study's Drive folder with its subfolder's images, the total beside the room left and the time at this session's
// speeds, refuses a choice larger than that room, and downloads the study's Python and images, nothing from Drive
// before Download; the page names no app manifest until Install as an app is clicked, and then the browser finds
// the site installable.
// Then 1.55, with the network gone (the browser offline and the server refusing): the page opens at its address
// and the Python already on this device runs; the status bar says Offline; what needs the network is held; a
// prepared study runs, and From Google Drive lists the images kept here and opens one; a study whose Python is not
// here says so.
// TIFF: a small z-stack the vascular study can open. Optional SHOTS: a directory for screenshots.
// Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/offline_driver.mjs SITE TIFF [SHOTS]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [site, tiffPath, shots] = process.argv.slice(2);
const TIFF = fs.readFileSync(tiffPath);
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name + ".png") }); };

// the vascular study's own folder, from its study.json, holding an image and a subfolder with another
const vascular = JSON.parse(fs.readFileSync(path.join(site, "studies/vascular/study.json")));
const ROOT = vascular.files.folders[0].match(/folders\/([\w-]+)/)[1];
const SUB = "acmefolder0000000002";
const FILES = { [ROOT]: [{ id: "acmestack00000000001", name: "stack one.tif" }, { id: SUB, name: "sub", folder: true }], [SUB]: [{ id: "acmestack00000000002", name: "stack two.tif" }] };

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".whl": "application/zip" };
let down = false;
// as Cloudflare serves the site: /<name> is <name>.html, a folder its index.html; and an unlisted study's address in
// the app the app's page too, as the tests' repo server serves it, so the fixture study runs
const server = http.createServer((q, r) => {
  if (down) return q.socket.destroy();
  let u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  let f = path.join(site, u);
  if (u.endsWith("/")) f = path.join(f, "index.html");
  else if (!fs.existsSync(f) && fs.existsSync(f + ".html")) f += ".html";
  else if (/^\/app\/[\w-]+$/.test(u) && fs.existsSync(path.join(site, "studies", u.slice(5), "study.json"))) f = path.join(site, "app", "index.html");
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream", "content-length": fs.statSync(f).size });
  if (q.method === "HEAD") return r.end();
  fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

let failed = false;
const check = (ok, what) => { if (!ok) { failed = true; console.error("FAILED: " + what); } else console.log("ok: " + what); };

// a profile of its own: a browser's private window can install nothing
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "offline-"));
const ctx = await pw.chromium.launchPersistentContext(profile, { viewport: { width: 1400, height: 900 } });
let driveDownloads = 0;
await ctx.route("https://www.googleapis.com/**", (route) => {
  const u = new URL(route.request().url()), id = u.pathname.match(/\/drive\/v3\/files\/?(.*)$/)[1];
  const cors = { "access-control-allow-origin": "*" };
  if (!id) {
    const parent = (u.searchParams.get("q") || "").match(/'([^']+)' in parents/)[1];
    const files = (FILES[parent] || []).map((f) => f.folder ? { id: f.id, name: f.name, mimeType: "application/vnd.google-apps.folder" }
      : { id: f.id, name: f.name, mimeType: "image/tiff", size: String(TIFF.length) });
    return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ files }) });
  }
  if (u.searchParams.get("alt") === "media") { driveDownloads++; return route.fulfill({ status: 200, headers: { ...cors, "content-type": "image/tiff" }, body: TIFF }); }
  const f = Object.values(FILES).flat().find((x) => x.id === id);
  return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ id, name: f?.name, mimeType: "image/tiff" }) });
});
const page = ctx.pages()[0] || await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`console ${m.type()}:`, m.text()); });
page.on("worker", (w) => w.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`worker ${m.type()}:`, m.text()); }));
const ready = (timeout = 180000) => page.waitForFunction(() => window.st?.ready, null, { timeout });
const statusText = () => page.textContent("#status");

try {
  await page.goto(origin + "/app/fixture");
  await ready();
  check(true, "the fixture study's Python runs online");
  check(!(await page.$("link[rel=manifest]")), "the page names no app manifest before the user asks for the app (1.56)");

  // every file offline.json lists is kept, once the page has run
  const listed = JSON.parse(fs.readFileSync(path.join(site, "app", "offline.json"))).files.map((f) => f.path);
  const missing = () => page.evaluate(async (paths) => {
    const out = [];
    for (const p of paths) {
      const u = new URL(p.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, ""), location.origin + "/app/").href;
      if (!(await caches.match(u))) out.push(p);
    }
    return out;
  }, listed);
  let left = listed;
  for (let t = 0; t < 60 && left.length; t++) { left = await missing(); if (left.length) await page.waitForTimeout(500); }
  check(listed.length > 30 && !left.length, `the site's own ${listed.length} files are kept on this device` + (left.length ? `; missing ${left.slice(0, 5)}` : ""));

  // 1.56: the Storage tab, where each study is made available offline
  await page.click("#user-menu summary");
  await page.click("#manage-storage");
  await page.waitForFunction(() => document.querySelector("#usage-dlg").open && !/Reading/.test(document.querySelector("#storage-list").textContent));
  const studies = JSON.parse(fs.readFileSync(path.join(site, "app", "studies.json"))).map((s) => s.id);
  const offers = await page.$$eval("#storage-list .group[data-group^='study:']", (gs) => gs.map((g) => ({ id: g.dataset.group.slice(6), offer: !!g.querySelector(".make-offline") })));
  check(studies.every((id) => offers.some((o) => o.id === id)) && offers.find((o) => o.id === "vascular").offer && !offers.find((o) => o.id === "fixture"),
    "the Storage tab has a section per listed study, each not all here offering Make available offline: " + JSON.stringify(offers));
  await page.click('#storage-list .group[data-group="study:vascular"] .make-offline');
  await page.waitForSelector("#offline-dlg[open]");
  await page.waitForFunction(() => document.querySelectorAll("#offline-files input.file").length === 2, null, { timeout: 30000 });
  const data = await page.$$eval("#offline-files .file-row", (rs) => rs.map((r) => ({ text: r.textContent, on: r.querySelector("input").checked })));
  check(data.some((t) => t.text.includes("stack one.tif")) && data.some((t) => t.text.includes("stack two.tif") && t.text.includes("sub")) && data.every((t) => t.on),
    "the popup lists the images in the study's Drive folder, its subfolder's with their folder, all ticked: " + JSON.stringify(data));
  check(driveDownloads === 0, "listing the folder downloads no image");
  await page.waitForFunction(() => /\d/.test(document.querySelector("#offline-total").textContent) && /\d/.test(document.querySelector("#offline-free").textContent));
  const say = async () => ({ python: await page.textContent("#offline-python"), total: await page.textContent("#offline-total"), free: await page.textContent("#offline-free"), time: await page.textContent("#offline-time") });
  let told = await say();
  check(/MB/.test(told.python) && /MB|KB/.test(told.total) && /\d/.test(told.free), "the popup says what the study's Python and its images take, beside the room left: " + JSON.stringify(told));
  // Python downloaded this session from jsDelivr, so its speed is measured; Drive's is not yet
  check(/Python at \d+(\.\d)? (KB|MB)\/s/.test(told.time) && /Google Drive/.test(told.time) && /about/.test(told.time), "it estimates the time, source by source, at the speeds measured: " + told.time);
  // a choice larger than the room left is refused
  await page.evaluate(() => { window.realEstimate = navigator.storage.estimate.bind(navigator.storage); navigator.storage.estimate = async () => ({ quota: 1e6, usage: 9e5 }); });
  await page.uncheck("#offline-files input.all"); await page.check("#offline-files input.all");
  await page.waitForFunction(() => document.querySelector("#offline-go").disabled);
  check(/more than/i.test(await page.textContent("#offline-warn")), "a choice larger than the room left is refused, saying so: " + (await page.textContent("#offline-warn")));
  await shot(page, "offline-too-much");
  await page.evaluate(() => { navigator.storage.estimate = window.realEstimate; });
  await page.uncheck("#offline-files input.all"); await page.check("#offline-files input.all");
  await page.waitForFunction(() => !document.querySelector("#offline-go").disabled);
  await shot(page, "offline-dialog");
  await page.click("#offline-go");
  await page.waitForFunction(() => /available offline/i.test(document.querySelector("#offline-msg").textContent) || /could not/i.test(document.querySelector("#offline-msg").textContent), null, { timeout: 240000 });
  check(/available offline/i.test(await page.textContent("#offline-msg")), "Download ends saying what is on this device: " + (await page.textContent("#offline-msg")));
  check(driveDownloads === 2, `it downloads the two ticked images (${driveDownloads})`);
  await page.click("#offline-close");
  await page.waitForFunction(() => document.querySelector('#storage-list .group[data-group="study:vascular"] summary .offline-mark'), null, { timeout: 10000 }).catch(() => {});
  check(!!(await page.$('#storage-list .group[data-group="study:vascular"] summary .offline-mark')) && !(await page.$('#storage-list .group[data-group="study:vascular"] .make-offline')),
    "the study is then marked available offline, and offers it no more");
  await shot(page, "offline-prepared");

  // Install as an app: only now does the page name its manifest, and the browser finds the site installable
  await page.click("#offline-install");
  await page.waitForSelector("link[rel=manifest]", { state: "attached" });
  const cdp = await ctx.newCDPSession(page);
  let errors = ["not asked"];
  for (let t = 0; t < 20; t++) {
    errors = (await cdp.send("Page.getInstallabilityErrors")).installabilityErrors.map((e) => e.errorId);
    if (!errors.length) break;
    await page.waitForTimeout(500);
  }
  check(!errors.length, "once asked for, the site is installable" + (errors.length ? ": " + errors.join(", ") : ""));
  await page.keyboard.press("Escape");

  // 1.55: the network goes
  await ctx.setOffline(true); down = true;
  const reached = await page.evaluate(() => fetch("https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide-lock.json?offline-probe").then(() => true, () => false));
  check(!reached, "offline, nothing the cache lacks is reached, the service worker's own downloads included");
  await page.goto(origin + "/app/fixture");
  await page.waitForFunction(() => document.querySelector("#title")?.textContent, null, { timeout: 10000 }).catch(() => {});
  check(!!(await page.textContent("#title")), "offline, the page opens at its address: " + (await page.textContent("#title")));
  await ready(60000);
  check(true, "offline, the Python already on this device runs");
  check(await page.isVisible("#sb-offline"), "the status bar says Offline");
  await page.click("#sb-offline");
  check(await page.evaluate(() => document.querySelector("#usage-dlg").open && document.querySelector("#usage-dlg").dataset.tab === "storage"), "clicking it opens the Storage tab");
  await page.keyboard.press("Escape");
  check(await page.$eval("#study-request", (a) => a.getAttribute("aria-disabled") === "true" && /offline/i.test(a.title)), "Submit New Study Request is held, its tooltip saying why");
  // a click on it opens nothing
  const popup = page.waitForEvent("popup", { timeout: 1500 }).then(() => true, () => false);
  await page.evaluate(() => document.querySelector("#study-request").click());
  check(!(await popup), "offline, Submit New Study Request opens nothing");
  await shot(page, "offline-page");

  await page.goto(origin + "/app/vascular");
  await ready(60000);
  check(true, "offline, the prepared study runs");
  await page.click("#load-menu summary");
  await page.click('#load-menu .item[data-src="drive"]');
  await page.waitForFunction(() => document.querySelectorAll("#drive-list .item").length >= 2, null, { timeout: 10000 }).catch(() => {});
  const kept = await page.$$eval("#drive-list .item .name", (ns) => ns.map((n) => n.textContent));
  check(kept.includes("stack one.tif") && kept.includes("stack two.tif"), "offline, From Google Drive lists the images kept here: " + kept.join(", "));
  await shot(page, "offline-drive");
  await page.dblclick('#drive-list .item:has-text("stack two.tif")');
  await page.waitForFunction(() => window.shellForTests.page.get("image")?.name === "stack two.tif", null, { timeout: 60000 }).catch(() => {});
  check((await page.evaluate(() => window.shellForTests.page.get("image")?.name)) === "stack two.tif", "offline, a kept image opens");

  await page.goto(origin + "/app/nor");
  await page.waitForFunction(() => /not on this device/i.test(document.querySelector("#status").textContent), null, { timeout: 60000 }).catch(() => {});
  check(/not on this device/i.test(await statusText()), "offline, a study whose Python is not here says so: " + (await statusText()));

  await ctx.setOffline(false); down = false;
  // the browser here still says it is online, as on a plane's Wi-Fi: the page notices the site answering again
  await page.waitForFunction(() => document.querySelector("#sb-offline").hidden, null, { timeout: 40000 }).catch(() => {});
  check(!(await page.isVisible("#sb-offline")), "back online, Offline leaves the status bar");
  check(await page.$eval("#study-request", (a) => !a.hasAttribute("aria-disabled")), "back online, Submit New Study Request is offered again");
} catch (e) {
  failed = true; console.error("FAILED: " + (e.stack || e));
  console.error("status: " + (await statusText().catch(() => "(no page)")));
} finally {
  await ctx.close(); server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
