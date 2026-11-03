// Drives the page (web/) in headless Chromium with the stand-in worker of the layout test, answering from
// real results (ANSWERS, written by tests/test_memory.py), and checks the ground-truth tasks: in a GT study
// Ground Truth Tasks takes Summary's place and the image is the only view (req/nor/truth/tasks,
// req/shell/views/second); the candidates come area by area (req/nor/truth/order); the image marks what is
// reviewed (req/nor/truth/marks); in a PreGT study the summary and the item views are back. Prints what it
// saw; exits 1 on a failure, 2 when it cannot run.
//   node tests/truth_tasks_page_driver.mjs ANSWERS IMAGE
import { repoFile } from "../../../web-tests/repo_file.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { offSite } from "../../../web-tests/off_site.mjs";
import { ENGINE } from "../../../web-tests/engine.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [answers, image] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const STAND_IN = `
const A = await (await fetch("answers/answers.json")).json();
const bin = async (n) => new Uint8Array(await (await fetch("answers/" + n)).arrayBuffer());
let finder;
postMessage({ type: "ready", info: { finders: A.finders, about: A.about }, secs: 0 });
onmessage = async ({ data: m }) => {
  if (m.type === "open") {
    const images = await bin("images.bin");
    postMessage({ type: "opened", meta: { H: A.H, W: A.W, um: A.um }, images, secs: 0 }, [images.buffer]);
  } else if (m.type === "call" && m.action === "detect") {
    finder = m.args.finder; const seg = await bin("seg_" + finder + ".bin");
    postMessage({ type: "result", action: "detect", meta: A.detected[finder], bytes: seg, secs: 0 }, [seg.buffer]);
  } else if (m.type === "call" && m.action === "refilter") {
    postMessage({ type: "result", action: "refilter", meta: A.filtered[finder][0], echo: m.echo, ms: 0 });
  }
};`;

let stage = null; // the study's stage as served; null: as committed
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  if (u === "/studies/nor/study.json" && stage) {
    r.writeHead(200, { "content-type": "application/json" });
    return r.end(JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(repo, u))), stage }));
  }
  const f = u.startsWith("/web/answers/") ? path.join(answers, u.slice("/web/answers/".length)) : repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw[ENGINE].launch();
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const fail = async (what, seen) => { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); };
const check = async (ok, what, seen) => { console.log((ok ? "ok    " : "FAIL  ") + what); if (!ok) await fail(what, seen); };

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 700 } });
  await ctx.route(offSite(origin), (r) => r.abort());
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  const page = await ctx.newPage();
  page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/index.html?study=nor");
  await page.waitForFunction(() => document.querySelector("#finder")?.disabled === false);
  await page.setInputFiles("#file", image);
  await page.waitForFunction(() => !document.querySelector("#find").disabled);
  await page.click("#find");
  await page.waitForFunction(() => st.alone && $("#busy").hidden);
  await page.evaluate(() => { $("#notice").hidden = true; });
  return page;
}
const shown = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden"; }, sel);

// ---- a GT study: the tasks in the left bar, the image alone in the main area ----
let page = await open();
await check(await shown(page, "#tasks-box") && !(await shown(page, "#summary-box")), "Ground Truth Tasks is in the left bar, in Summary's place");
await check(!(await shown(page, "#switch")) && !(await shown(page, "#tasks-bar")) && !(await shown(page, "#show-menu")), "no view switch, no tasks bar over the image, no Show menu");
const tasks = await page.$$eval("#gt-tasks > li", (li) => li.map((l) => l.dataset.task));
await check(JSON.stringify(tasks) === JSON.stringify(["pass", "fail", "missed", "submit"]), "the tasks in order: the finalists, the rejected, the missed NoRs, Submit", tasks);
await check(await page.$eval("#dl-truth", (b) => !!b.closest('#gt-tasks > li[data-task="submit"]')), "Submit Ground Truth is the last task");
await check(await page.$eval("#card-menu", (d) => !!d.closest("#tasks-box") && !d.open), "the card's options are in the task, folded");

// req/nor/truth/order: area by area, the rows of areas back and forth, top to bottom inside an area
const order = await page.evaluate(() => {
  const area = (c) => { const r = Math.min(9, Math.floor((c.cy / st.H) * 10)), k = Math.min(9, Math.floor((c.cx / st.W) * 10)); return [r, k, r * 10 + (r % 2 ? 9 - k : k)]; };
  return ["pass", "fail"].map((t) => nor.taskItems(t).map((c) => ({ i: c.i, a: area(c), cy: c.cy, pass: st.fails[c.i] === null })));
});
for (const [t, xs] of [["finalists", order[0]], ["rejected", order[1]]]) {
  const sorted = xs.every((x, k) => !k || xs[k - 1].a[2] < x.a[2] || (xs[k - 1].a[2] === x.a[2] && xs[k - 1].cy <= x.cy));
  const areas = new Set(xs.map((x) => x.a[2])).size;
  await check(xs.length > 2 && areas > 1 && sorted && xs.every((x) => x.pass === (t === "finalists")), `the ${t} (${xs.length}) come area by area, in ${areas} areas`, xs.map((x) => x.a));
}
const total = order[0].length + order[1].length;

const now = () => page.evaluate(() => ({ task: st.task, sel: st.sel, card: document.querySelector("#task-card .card")?.dataset.i, place: $("#task-place")?.textContent,
  done: $("#gt-done").textContent, n: [...document.querySelectorAll("#gt-tasks > li")].map((l) => l.querySelector(".n")?.textContent || "") }));
let s = await now();
await check(s.task === "pass" && s.card === String(order[0][0].i) && s.sel === order[0][0].i, "the finalists' task opens on its first candidate", s);
await check(s.done === `0 of ${total} reviewed` && /^1 of \d+$/.test(s.place), `the progress reads "${s.done}", the place "${s.place}"`, s);
await check(await page.$$eval("#tasks-box .card", (c) => c.length) === 1, "one card at a time");

// req/nor/truth/marks: waiting, a faint outline and nothing else
const mark = (i) => page.evaluate((i) => {
  const g = document.querySelector(`#overlay g[data-i="${i}"]`), out = g.querySelector("path:not(.red):not(.area)"), area = g.querySelector(".area");
  const cs = getComputedStyle(out), as = area && getComputedStyle(area), num = getComputedStyle(g.querySelector(".num"));
  return { cls: g.getAttribute("class"), stroke: cs.stroke, opacity: +cs.strokeOpacity, area: as ? as.display : "none", fill: as?.fill, fillOpacity: as ? +as.fillOpacity : 0, num: num.display };
}, i);
let m = await mark(order[0][1].i);
await check(/\btodo\b/.test(m.cls) && m.opacity <= 0.4 && m.area === "none" && m.num === "none" && m.stroke === "rgb(255, 255, 255)", "a candidate waiting is a faint white outline, no number", m);
const ring = await page.$eval("#overlay .ring", (r) => ({ shown: r.style.display !== "none", stroke: getComputedStyle(r).stroke }));
await check(ring.shown && ring.stroke === "rgb(255, 212, 0)", "the current candidate has a yellow ring", ring);

// a verdict moves on to the next candidate, and fills the reviewed one
await page.click("#task-card .verdict .up");
s = await now();
await check(s.sel === order[0][1].i && s.card === String(order[0][1].i) && s.done === `1 of ${total} reviewed` && /^2 of /.test(s.place), "a thumbs up moves on to the next candidate", s);
m = await mark(order[0][0].i);
await check(/\byes\b/.test(m.cls) && m.area !== "none" && m.fillOpacity >= 0.4 && /^rgb\(\d+, \d+, 255\)$/.test(m.fill), "voted up, it is a filled blue shape", m);
await page.click("#task-card .verdict .down");
m = await mark(order[0][1].i);
await check(/\bno\b/.test(m.cls) && m.area !== "none" && m.fill === "rgb(0, 0, 0)" && m.fillOpacity >= 0.4, "voted down, it is darkened", m);
s = await now();
await check(s.sel === order[0][2].i, "and on again", s);
await page.click("#task-prev");
s = await now();
await check(s.sel === order[0][1].i && s.done === `2 of ${total} reviewed`, "previous steps back without a verdict", s);

// the last finalist decided moves on to the rejected
await page.evaluate((xs) => { for (const x of xs.slice(0, -1)) if (!st.forced.get(x.i)) nor.decide(x.i, "approve"); }, order[0]);
await page.click('#gt-tasks > li[data-task="pass"] .task-head');
s = await now();
await check(s.sel === order[0].at(-1).i, "clicking a task opens it at its first candidate with no verdict", s);
await page.click("#task-card .verdict .up");
s = await now();
await check(s.task === "fail" && s.sel === order[1][0].i && s.n[0] === `${order[0].length} of ${order[0].length}`, "the finalists done, the rejected's task opens on its first", s);
await check(await page.$eval('#gt-tasks > li[data-task="pass"]', (l) => l.classList.contains("done")), "a done task is checked");
await check(await page.evaluate(() => st.tab === "fail" && /Rejected/.test($("#card-menu summary").textContent)), "the rejected's card options are those of the rejected");

// a candidate clicked on the image becomes the current one
const target = order[0][2].i;
await page.evaluate((i) => nor.focusOn(nor.candOf(i)), target);
await page.waitForTimeout(600);
const at = await page.evaluate((i) => { const r = document.querySelector(`#overlay g[data-i="${i}"] .hit`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, target);
await page.mouse.click(at.x, at.y);
s = await now();
await check(s.task === "pass" && s.sel === target && s.card === String(target), "a candidate clicked on the image is the current task's", s);
await check(!(await shown(page, "#selected-box")), "no card hovers over the image");

// the missed NoRs: added by a right click, decided on their card, done once looked over
const sc = await page.$eval("#stage", (e) => { const r = e.getBoundingClientRect(); return { x: r.left + 5, y: r.top + 5 }; });
await page.mouse.click(sc.x, sc.y, { button: "right" });
await page.click("#ctx button");
s = await now();
await check(s.task === "missed" && s.sel === "u1" && s.card === "u1", "an added NoR opens the missed NoRs' task at its card", s);
await page.click("#task-card .verdict .up");
await check(!(await page.$eval('#gt-tasks > li[data-task="missed"]', (l) => l.classList.contains("done"))), "the missed NoRs' task waits for the look over the image");
await page.evaluate((xs) => { for (const x of xs) if (!st.forced.get(x.i)) nor.decide(x.i, "reject"); }, order[1]);
await page.check("#missed-done");
s = await now();
await check(s.task === "submit" && (await page.$eval("#dl-truth", (b) => b.dataset.state)) === "done", "every task done: Submit, its icon a check", s);
await check(await page.$eval('#gt-tasks > li[data-task="missed"]', (l) => l.classList.contains("done")), "the missed NoRs' task is done");
await page.close();

// ---- a PreGT study: the summary and the item views, no tasks ----
stage = "PreGT";
page = await open();
await check(await shown(page, "#summary-box") && !(await shown(page, "#tasks-box")) && await shown(page, "#switch") && await shown(page, "#show-menu"),
  "a PreGT study has its summary, its item views and its Show menu, and no tasks");
await done(0);
