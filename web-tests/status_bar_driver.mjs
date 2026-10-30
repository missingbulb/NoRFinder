// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from
// ANSWERS (tests/test_study_runs.py), and checks the status bar: the study's stage first; breadcrumbs of the
// steps done and the one to do now, which shines with its button and nothing else does; a popup on each crumb
// saying what was done; a new image starting over; a PreGT study with no Submit GT and its ground-truth button
// hidden; switching study in place bringing its own stage and steps; the memory as "RAM … MB" opening what holds it, with Run GC; the disk as "Disk …" matching Manage
// storage, which it opens; the version, memory and disk at the right, plain. Optional SHOTS: a directory for
// screenshots. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/status_bar_driver.mjs ANSWERS IMAGE.png STUDIES [SHOTS]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { repoFile } from "./repo_file.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [answers, image, studies, shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MB = 2 ** 20;

// the fixture's answers, each saying how much memory Python holds as the real worker does; memory: what
// Python holds in use after a collection
const STAND_IN = `
const A = await (await fetch("answers.json")).json();
const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const mem = { heap: ${60 * MB}, files: ${20 * MB} };
const first = new URL(location.href).searchParams.get("study");
if (A.ready[first]) postMessage({ type: "ready", info: A.ready[first], ...mem });
onmessage = ({ data: m }) => {
  if (m.type === "study") postMessage({ type: "ready", info: A.ready[m.id], ...mem });
  else if (m.type === "open") { const images = bytes(A.images); postMessage({ type: "opened", meta: A.opened, images, ...mem }, [images.buffer]); }
  else if (m.type === "call") { const b = bytes(A.mask); postMessage({ type: "result", action: m.action, meta: A.count, bytes: b, echo: m.echo, ...mem }, [b.buffer]); }
  else if (m.type === "memory") postMessage({ type: "memory", used: ${25 * MB}, objects: 1000, ...mem });
};`;
let stage = null; // the fixture's stage as served; null: as committed
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  if (u === "/studies/fixture/study.json" && stage) {
    r.writeHead(200, { "content-type": "application/json" });
    return r.end(JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(repo, u))), stage }));
  }
  if (u === "/web/vendor/wheels.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end("[]"); }
  const f = u === "/web/answers.json" ? answers : u === "/web/studies.json" ? studies : repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch();
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what, seen) => { if (!ok) { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); } console.log("ok: " + what); };
const shot = async (page, name) => { if (shots) await page.locator("#statusbar").screenshot({ path: path.join(shots, name + ".png") }); };

async function open(study) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  const page = await ctx.newPage();
  page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/" + (study || ""));
  await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));
  return { ctx, page };
}
// the crumbs on show, the one to do now marked *, and every element that shines
const bar = (page) => page.evaluate(() => ({
  crumbs: [...document.querySelectorAll("#sb-steps .crumb")].map((c) => c.textContent + (c.classList.contains("now") ? "*" : "")),
  shining: [...document.querySelectorAll(".shine")].map((e) => "#" + e.id).sort(),
}));
const steps = async (page, want, shining) => {
  await page.waitForFunction((w) => [...document.querySelectorAll("#sb-steps .crumb")].map((c) => c.textContent + (c.classList.contains("now") ? "*" : "")).join() === w, want.join()).catch(() => {});
  const b = await bar(page);
  await check(b.crumbs.join() === want.join() && b.shining.join() === shining.join(), `crumbs ${want.join(" › ")}, shining ${shining.join() || "nothing"}`, b);
};
// what hovering a crumb says
const tip = async (page, name) => {
  await page.hover(`#sb-steps .crumb >> text=${name}`);
  await page.waitForFunction(() => !document.querySelector("#tip").hidden);
  const t = await page.textContent("#tip");
  await page.mouse.move(700, 300);
  return t;
};
const loadImage = async (page) => { await page.setInputFiles("#file", image); await page.waitForFunction(() => !document.querySelector("#fx-count").disabled); };
const count = async (page) => { await page.click("#fx-count"); await page.waitForFunction(() => /pixels/.test(document.querySelector("#fx-result").textContent)); };

// ---- a GT study: Load image, its Count, Submit GT ----
{
  const { ctx, page } = await open("fixture");
  const s = await page.evaluate(() => [document.querySelector("#sb-stage").textContent, document.querySelector("#sb-stage").title]);
  await check(s[0] === "GT" && /export/i.test(s[1]), "the stage is first, its meaning on hover", s);
  await steps(page, ["Load image*"], ["#load-main", "#sb-load"]);
  await shot(page, "1-start");
  // the right side: from the edge, version, memory, disk; all plain
  await page.waitForFunction(() => /^Disk /.test(document.querySelector("#sb-disk").textContent));
  const right = await page.evaluate(() => ["#sb-disk", "#sb-memory", "#sb-version"].map((id) => {
    const e = document.querySelector(id), cs = getComputedStyle(e);
    return { id, right: e.getBoundingClientRect().right, border: cs.borderTopWidth, text: e.textContent };
  }));
  await check(right[0].right < right[1].right && right[1].right < right[2].right && right[2].right > 1300, "disk, memory and version sit at the right, version at the edge", right);
  await check(right.every((e) => e.border === "0px"), "none has a border", right);
  await check(/^RAM \d+ MB$/.test(right[1].text), 'the memory reads "RAM … MB"', right[1].text);
  await page.waitForFunction(() => /^Disk /.test(document.querySelector("#sb-disk").textContent));
  const disk = await page.textContent("#sb-disk");
  await check(/^Disk \d+(\.\d)? (KB|MB|GB)$/.test(disk), 'the disk reads "Disk …"', disk);
  const left = await page.evaluate(() => ["#sb-stage", "#sb-steps", "#status"].map((id) => document.querySelector(id).getBoundingClientRect().left));
  await check(left[0] < 40 && left[0] < left[1] && left[1] < left[2], "the stage, then the crumbs, then what the page is doing, from the left", left);

  await loadImage(page);
  await steps(page, ["Load image", "Count*"], ["#fx-count", "#sb-count"]);
  await check((await tip(page, "Load image")).includes("squares.png"), "Load image's popup names the image");
  await count(page);
  await steps(page, ["Load image", "Count", "Submit GT*"], ["#fx-truth", "#sb-submit"]);
  await check((await tip(page, "Count")).includes("400"), "the study's step says what it did");
  await shot(page, "2-submit");
  await page.click("#fx-truth");
  const download = page.waitForEvent("download");
  await page.click("#gt-export");
  await download;
  await page.click("#gt-close");
  await steps(page, ["Load image", "Count", "Submit GT"], []);
  await check(/squares_gt\.json/.test(await tip(page, "Submit GT")), "Submit GT says what was exported");
  await shot(page, "3-done");
  // another image starts over
  await loadImage(page);
  await steps(page, ["Load image", "Count*"], ["#fx-count", "#sb-count"]);

  // the memory popup and Run GC
  await page.click("#sb-memory");
  await page.waitForFunction(() => document.querySelector("#ram-pop").matches(":popover-open"));
  const rows = await page.evaluate(() => [...document.querySelectorAll("#ram-list .entry .name")].map((n) => n.textContent));
  await check(["Python", "Python's files", "The image"].every((n) => rows.includes(n)), "the memory popup lists what holds it", rows);
  await page.click("#ram-gc");
  await page.waitForFunction(() => /in use/.test(document.querySelector("#ram-msg").textContent));
  await check(/25 MB in use of 60 MB/.test(await page.textContent("#ram-msg")), "Run GC says what Python holds in use against its reserve", await page.textContent("#ram-msg"));
  if (shots) await page.screenshot({ path: path.join(shots, "4-ram.png") });
  await page.keyboard.press("Escape");

  // the disk opens Manage storage, whose total it shows
  await page.click("#sb-disk");
  await page.waitForFunction(() => document.querySelector("#storage-dlg").open && /keeps/.test(document.querySelector("#storage-total").textContent));
  const total = (await page.textContent("#storage-total")).match(/keeps (.+?) on/)[1];
  await check((await page.textContent("#sb-disk")) === "Disk " + total, "the disk is Manage storage's total", [total, await page.textContent("#sb-disk")]);
  await ctx.close();
}

// ---- the same study as PreGT: no ground truth to export ----
{
  stage = "PreGT";
  const { ctx, page } = await open("fixture");
  await check(await page.textContent("#sb-stage") === "PreGT", "a PreGT study says so");
  await check(await page.evaluate(() => document.querySelector("#fx-truth").offsetParent === null), "its ground-truth button is hidden");
  await loadImage(page); await count(page);
  await steps(page, ["Load image", "Count"], []);
  await ctx.close();
  stage = null;
}

// ---- the Image Viewer: Load image alone ----
{
  const { ctx, page } = await open(null);
  await check(await page.textContent("#sb-stage") === "PreGT", "the Image Viewer is PreGT");
  await steps(page, ["Load image*"], ["#load-main", "#sb-load"]);
  await page.setInputFiles("#file", image);
  await steps(page, ["Load image"], []);
  // switching study in place: its stage and steps come with it, the image open in it already
  await page.click("#study-menu summary");
  await page.click("#study-list a >> text=NoR Finder");
  await page.waitForFunction(() => document.querySelector("#sb-stage").textContent === "GT");
  await steps(page, ["Load image", "Run algorithm*"], ["#find", "#sb-find"]);
  await ctx.close();
}
await done(0);
