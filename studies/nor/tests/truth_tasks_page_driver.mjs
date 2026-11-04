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
import { asTagger } from "../../../web-tests/tagger.mjs";

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
  // the study as served: its stage, and a link to a picture to reveal (turned away like every off-site request: black shows under it)
  if (u === "/studies/nor/study.json") {
    const m = JSON.parse(fs.readFileSync(path.join(repo, u)));
    r.writeHead(200, { "content-type": "application/json" });
    return r.end(JSON.stringify({ ...m, stage: stage || m.stage, groundTruth: { ...m.groundTruth, reveal: "https://acme.example/dog.jpg" } }));
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
  await asTagger(ctx); // ground truth is made by a Ground Truth Tagger (req/shell/account/role)
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
const [P, F] = [order[0].length, order[1].length];

const now = () => page.evaluate(() => ({ task: st.task, sel: st.sel, card: document.querySelector("#task-card .card")?.dataset.i,
  rows: [...document.querySelectorAll("#gt-tasks > li")].map((l) => l.querySelector(".task-head").textContent.replace(/\s+/g, " ").trim()),
  bar: [...document.querySelectorAll("#gt-bar > span")].map((b) => ({ grow: +getComputedStyle(b).flexGrow, fill: +b.style.getPropertyValue("--done") })) }));
let s = await now();
await check(s.task === "pass" && s.card === String(order[0][0].i) && s.sel === order[0][0].i, "the finalists' task opens on its first candidate", s);
// one row per task, each counting once, never saying "review"
await check(s.rows[0].startsWith(`0/${P} Finalists`) && s.rows[1] === `0/${F} Rejected` && s.rows[2] === "0/100 Areas" && /Submit Ground Truth/.test(s.rows[3])
  && !s.rows.some((r) => /review/i.test(r)) && await page.$$eval("#tasks-box", (b) => !/\d+ of \d+/.test(b[0].textContent)), "one row per task: 0/N Finalists, 0/N Rejected, 0/100 Areas, Submit", s.rows);
// the bar, a part per task as long as the task, filled as far as done
await check(s.bar.length === 3 && s.bar[0].grow === P && s.bar[1].grow === F && s.bar[2].grow === 100 && s.bar.every((b) => b.fill === 0), "the bar has a part per task, as long as the task", s.bar);
await check(await page.$$eval("#tasks-box .card", (c) => c.length) === 1, "one card at a time");
await check(!(await page.$("#task-back")), "no Go back");
// the open row carries the cogwheel and Skip; the card is the crop and big thumbs beside it
const look = await page.evaluate(() => {
  const r = (e) => e.getBoundingClientRect(), d = $("#task-card .card"), crop = r(d.querySelector(".crop canvas")), up = r(d.querySelector(".verdict .up")), card = r(d);
  const head = document.querySelector("#gt-tasks > li.now .task-head");
  const box = r($("#gt-tasks")), down = r(d.querySelector(".verdict .down"));
  return { share: crop.width / box.width, under: up.top >= crop.bottom - 1 && Math.abs(up.top - down.top) < 1 && down.left > up.left, big: up.width >= 60 && up.height >= 36,
    head: !!d.querySelector(".head, .num, .state, .goto"), ticks: [...document.querySelectorAll("#gt-tasks > li:not(.done) .tick")].filter((t) => t.offsetParent).length,
    cog: !!head.querySelector("#card-menu summary svg") && !$("#card-menu summary").textContent.trim() && !$("#card-menu").open, skip: head.contains($("#task-skip")) && /skip/i.test($("#task-skip").textContent) };
});
await check(look.share >= 0.97 && look.under && look.big && !look.head && !look.ticks && look.cog && look.skip,
  "the open row has the cogwheel and Skip; the crop takes the box's width, big thumbs side by side under it, no number or go-to, no marks on tasks not done", look);
await page.click("#card-menu summary");
await check(await page.evaluate(() => { const p = $("#card-menu .pop"), r = p.getBoundingClientRect(); return getComputedStyle(p).position === "absolute" && r.height > 40 && !!$("#opt-borders").offsetParent; }), "the cogwheel opens the options as a popup");
await page.click("#card-menu summary");

// req/nor/truth/marks: waiting, a faint outline and nothing else; decided, cut out of the image
const mark = (i) => page.evaluate((i) => {
  const g = document.querySelector(`#overlay g[data-i="${i}"]`), out = g.querySelector("path:not(.red)"), cs = getComputedStyle(out);
  const c = nor.candOf(i), holes = [...document.querySelectorAll("#gt-reveal rect")].map((r) => ["x", "y", "width", "height"].map((k) => +r.getAttribute(k)));
  const cut = holes.some(([x, y, w, h]) => x <= c.bb[0] - 2 + 1e-6 && y <= c.bb[1] - 2 + 1e-6 && x + w >= c.bb[2] + 2 - 1e-6 && y + h >= c.bb[3] + 2 - 1e-6);
  return { cls: g.getAttribute("class"), stroke: cs.stroke, opacity: +cs.strokeOpacity, outline: cs.display, num: getComputedStyle(g.querySelector(".num")).display, cut };
}, i);
let m = await mark(order[0][1].i);
await check(/\btodo\b/.test(m.cls) && m.opacity <= 0.4 && !m.cut && m.num === "none" && m.stroke === "rgb(255, 255, 255)", "a candidate waiting is a faint white outline, no number", m);
const ring = await page.$eval("#overlay .ring", (r) => ({ shown: r.style.display !== "none", stroke: getComputedStyle(r).stroke }));
await check(ring.shown && ring.stroke === "rgb(255, 212, 0)", "the current candidate has a yellow ring", ring);
// the picture the study names stands behind the whole image, shown only where it is cut out; black under it
const pic = await page.evaluate(() => { const im = document.querySelector("#overlay image.reveal"), bg = document.querySelector("#overlay .reveal-bg"); return { href: im?.getAttribute("href"), clip: im?.getAttribute("clip-path"), w: +im?.getAttribute("width"), bg: bg && getComputedStyle(bg).fill, bgClip: bg?.getAttribute("clip-path") }; });
await check(pic.href === "https://acme.example/dog.jpg" && /gt-reveal/.test(pic.clip) && /gt-reveal/.test(pic.bgClip) && pic.bg === "rgb(0, 0, 0)" && pic.w === (await page.evaluate(() => st.W)), "the picture the study links to, behind the whole image, black under it, shown only where it is cut out", pic);

// a verdict moves on to the next candidate, and cuts the reviewed one out
await page.click("#task-card .verdict .up");
s = await now();
await check(s.sel === order[0][1].i && s.card === String(order[0][1].i) && s.rows[0].startsWith(`1/${P} Finalists`) && s.bar[0].fill > 0, "a thumbs up moves on to the next candidate and fills the bar", s);
m = await mark(order[0][0].i);
await check(/\byes\b/.test(m.cls) && m.cut && m.outline === "none", "voted up, its area is cut out of the image", m);
await page.click("#task-card .verdict .down");
m = await mark(order[0][1].i);
await check(/\bno\b/.test(m.cls) && m.cut && m.outline === "none", "voted down, its area is cut out too", m);
s = await now();
await check(s.sel === order[0][2].i, "and on again", s);
// Skip slides the next card in over the last, with no verdict
const slide = await page.evaluate(() => { $("#task-skip").click(); return { sel: st.sel, anims: $("#task-card").getAnimations({ subtree: true }).length, leaving: document.querySelectorAll("#task-stage .leaving").length, cards: document.querySelectorAll("#task-card .card").length }; });
await check(slide.sel === order[0][3].i && slide.anims > 0 && slide.leaving === 1 && slide.cards === 1, "Skip slides the next card in over the last", slide);
await check((await now()).rows[0].startsWith(`2/${P} Finalists`), "and leaves the skipped one without a verdict");

// the last finalist decided moves on to the rejected
await page.evaluate((xs) => { for (const x of xs.slice(0, -1)) if (!st.forced.get(x.i)) nor.decide(x.i, "approve"); }, order[0]);
await page.click('#gt-tasks > li[data-task="pass"] .task-head .t');
s = await now();
await check(s.sel === order[0].at(-1).i, "clicking a task opens it at its first candidate with no verdict", s);
await page.click("#task-card .verdict .up");
s = await now();
await check(s.task === "fail" && s.sel === order[1][0].i && s.rows[0].startsWith(`${P}/${P} Finalists`) && s.bar[0].fill === 1, "the finalists done, the rejected's task opens on its first", s);
await check(await page.$eval('#gt-tasks > li[data-task="pass"]', (l) => l.classList.contains("done")), "a done task is checked");
await check(await page.evaluate(() => st.tab === "fail" && /Rejected/.test($("#card-menu summary").getAttribute("aria-label")) && !!document.querySelector('#gt-tasks > li[data-task="fail"] #card-menu')), "the rejected's row has the rejected's options");

// a candidate clicked on the image becomes the current one
const target = order[0][2].i;
await page.evaluate((i) => nor.focusOn(nor.candOf(i)), target);
await page.waitForTimeout(600);
const at = await page.evaluate((i) => { const r = document.querySelector(`#overlay g[data-i="${i}"] .hit`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, target);
await page.mouse.click(at.x, at.y);
s = await now();
await check(s.task === "pass" && s.sel === target && s.card === String(target), "a candidate clicked on the image is the current task's", s);
await check(!(await shown(page, "#selected-box")), "no card hovers over the image");

// the areas: each framed in turn; a right click adds a NoR there; No missed NoRs here checks the area and cuts it out
await page.click('#gt-tasks > li[data-task="missed"] .task-head .t');
await page.waitForTimeout(700); // the view pans smoothly to the area
const area = () => page.evaluate(() => { const f = document.querySelector("#overlay .area-frame"); return { a: st.area, frame: f && f.style.display !== "none" && ["x", "y", "width", "height"].map((k) => +f.getAttribute(k)), W: st.W, H: st.H }; });
let a = await area();
await check(a.a === 0 && a.frame && a.frame[0] === 0 && a.frame[1] === 0 && Math.abs(a.frame[2] - a.W / 10) < 1e-6, "the areas' task frames the first area on the image", a);
// Skip moves to the next area without checking it; five on, the area is clear of the minimap over the view's top left
for (let k = 0; k < 5; k++) await page.click("#task-skip");
await page.waitForTimeout(700);
a = await area();
await check(a.a === 5 && (await now()).rows[2].startsWith("0/100 Areas"), "Skip frames the next area, checking none", a);
const fr = await page.$eval("#overlay .area-frame", (f) => { const r = f.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await page.mouse.click(fr.x, fr.y, { button: "right" });
await page.click("#ctx button");
s = await now();
await check(s.task === "missed" && s.sel === "u1" && s.card === "u1" && await page.isDisabled("#area-ok"), "an added NoR shows its card in the areas' task, and the area waits for its verdict", s);
await page.click("#task-card .verdict .up");
await page.click("#area-ok");
a = await area();
const cutArea = await page.evaluate(() => [...document.querySelectorAll("#gt-reveal rect")].some((r) => Math.abs(+r.getAttribute("x") - st.W / 2) < 1e-6 && +r.getAttribute("y") === 0 && Math.abs(+r.getAttribute("width") - st.W / 10) < 1e-6));
await check(a.a === 6 && cutArea && (await now()).rows[2].startsWith("1/100 Areas"), "No missed NoRs here checks the area, cuts it out and frames the next", { a, cutArea });
await page.evaluate((xs) => { for (const x of xs) if (!st.forced.get(x.i)) nor.decide(x.i, "reject"); }, order[1]);
for (let k = 0; k < 120 && await page.evaluate(() => st.task === "missed"); k++) await page.click("#area-ok");
s = await now();
await check(s.task === "submit" && s.rows[2] === "100/100 Areas" && (await page.$eval("#dl-truth", (b) => b.dataset.state)) === "done", "every area checked and every task done: Submit, its icon a check", s);
await check(await page.$eval('#gt-tasks > li[data-task="missed"]', (l) => l.classList.contains("done")), "the areas' task is done");
await page.close();

// ---- a PreGT study: the summary and the item views, no tasks ----
stage = "PreGT";
page = await open();
await check(await shown(page, "#summary-box") && !(await shown(page, "#tasks-box")) && await shown(page, "#switch") && await shown(page, "#show-menu"),
  "a PreGT study has its summary, its item views and its Show menu, and no tasks");
await done(0);
