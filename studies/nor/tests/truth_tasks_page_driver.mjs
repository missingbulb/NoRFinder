// Drives the page (web/) in headless Chromium with the stand-in worker of the layout test, answering from
// real results (ANSWERS, written by tests/test_memory.py), and checks the ground-truth tasks: in a GT study
// Ground Truth Tasks takes Summary's place and the image is the only view (req/nor/truth/tasks,
// req/shell/views/second); the tasks are one walk through the image's areas, with Back and Skip
// (req/nor/truth/order); the image marks what is reviewed, under a task-named Show menu (req/nor/truth/marks,
// req/nor/show-menu); the summary's mask waits for the summary (req/nor/summary/mask); in a PreGT study the
// summary is back. Prints what it saw; exits 1 on a failure, 2 when it cannot run.
//   node tests/truth_tasks_page_driver.mjs ANSWERS IMAGE
import { EARLY } from "../../../web-tests/early_messages.mjs";
import { repoFile } from "../../../web-tests/repo_file.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { offSite } from "../../../web-tests/off_site.mjs";
import { ENGINE, LAUNCH } from "../../../web-tests/engine.mjs";
import { asTagger } from "../../../web-tests/tagger.mjs";
import { standInDrive, openFromDrive } from "../../../web-tests/drive_open.mjs";
import { frames } from "../../../web-tests/page_frames.mjs";

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
    postMessage({ type: "held", secs: 0 });
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
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(EARLY + STAND_IN); }
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

const browser = await pw[ENGINE].launch(LAUNCH);
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const fail = async (what, seen) => { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); };
const check = async (ok, what, seen) => { console.log((ok ? "ok    " : "FAIL  ") + what); if (!ok) await fail(what, seen); };

// a summary mask the user lassoed on this image before, in the Viewer
const MASKED = [[[0, 0], [60, 0], [60, 60], [0, 60]]];
// the picture the study links to, served when picture is true (a small PNG of the repo's), else turned away like
// every off-site request
let picture = true;
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 700 } });
  await ctx.route(offSite(origin), (r) => r.abort());
  if (picture) await ctx.route("https://acme.example/dog.jpg", (r) => r.fulfill({ contentType: "image/jpeg", body: fs.readFileSync(path.join(repo, "web", "poster.jpg")) }));
  await asTagger(ctx); // ground truth is made by a Ground Truth Tagger (req/shell/account/role)
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(([k, m]) => localStorage.setItem(k, JSON.stringify(m)), ["nor-mask-v1:" + path.basename(image), MASKED]);
  await standInDrive(ctx);
  // the picture's fetch failing, as the page sees it when the picture is turned away
  const pictureFailed = new Promise((ok) => ctx.on("requestfailed", (q) => { if (q.url() === "https://acme.example/dog.jpg") ok(); }));
  const page = await ctx.newPage();
  page.pictureFailed = pictureFailed;
  page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/index.html?study=nor");
  await page.waitForFunction(() => document.querySelector("#finder")?.disabled === false);
  await openFromDrive(page, image);
  await page.waitForFunction(() => !document.querySelector("#find").disabled);
  // req/shell/ground-truth/tasks: Submit is off until the study's first step is done
  await check(await page.evaluate(() => $("#gt-submit").disabled), "an image open but nothing run yet: Submit Ground Truth is off");
  await page.click("#find");
  await page.waitForFunction(() => st.alone && $("#busy").hidden);
  await page.evaluate(() => { $("#notice").hidden = true; });
  return page;
}
const shown = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden"; }, sel);

// ---- a GT study: the tasks in the left bar, the image alone in the main area ----
let page = await open();
await check(await shown(page, "#tasks-box") && !(await shown(page, "#summary-box")), "Ground Truth Tasks is in the left bar, in Summary's place");
await check(!(await shown(page, "#switch")), "no view switch over the image");
const tasks = await page.$$eval("#gt-tasks > li", (li) => li.map((l) => l.dataset.task));
await check(JSON.stringify(tasks) === JSON.stringify(["pass", "fail", "missed", "submit"]), "the tasks in order: the finalists, the rejected, the missed NoRs, Submit", tasks);
await check(await page.$eval("#gt-submit", (b) => !!b.closest('#gt-tasks > li[data-task="submit"]')), "Submit Ground Truth is the last task");

// req/nor/truth/order: one walk through the areas, the rows of areas back and forth; in each its finalists, its
// rejected, the NoRs added there, each top to bottom, and last the area's check
const area = (c, W, H) => { const r = Math.min(9, Math.floor((c.cy / H) * 10)), k = Math.min(9, Math.floor((c.cx / W) * 10)); return r * 10 + (r % 2 ? 9 - k : k); };
const walk = () => page.evaluate(() => nor.walk().map((x) => ({ key: x.key, a: x.a, t: x.t, cy: x.c?.cy, cx: x.c?.cx, pass: x.c ? st.fails[x.c.i] === null : null })));
let W = await walk();
const [IW, IH] = await page.evaluate(() => [st.W, st.H]);
{
  const rank = { pass: 0, fail: 1, missed: 2 };
  const bad = W.findIndex((x, k) => {
    if (x.cy != null && area(x, IW, IH) !== x.a) return true;
    if (x.t !== "missed" && x.pass !== (x.t === "pass")) return true;
    const p = W[k - 1]; if (!p) return false;
    if (p.a !== x.a) return p.key !== "a:" + p.a || p.a > x.a; // an area ends with its check, and the next follows
    return p.key.startsWith("a:") || rank[p.t] > rank[x.t] || (p.t === x.t && p.cy > x.cy);
  });
  const areas = W.filter((x) => x.key.startsWith("a:")).length, cands = new Set(W.filter((x) => x.cy != null).map((x) => x.a)).size;
  await check(bad < 0 && areas === 100 && cands > 1 && W.filter((x) => x.t === "pass").length > 2 && W.filter((x) => x.t === "fail").length > 2,
    `one walk through the 100 areas, ${cands} of them holding candidates: finalists, rejected, added, then the area's check`, bad < 0 ? undefined : W.slice(Math.max(0, bad - 2), bad + 2));
}
const P = W.filter((x) => x.t === "pass").length, F = W.filter((x) => x.t === "fail").length;
const isDone = (x) => page.evaluate((key) => nor.walk().find((y) => y.key === key)?.done, x.key);
// the walk's next item not done after key
const nextOpen = async (key) => {
  const xs = await page.evaluate(() => nor.walk().map((x) => ({ key: x.key, done: x.done }))), k = xs.findIndex((x) => x.key === key);
  return [...xs.slice(k + 1), ...xs.slice(0, Math.max(k, 0))].find((x) => !x.done)?.key ?? null;
};

const now = () => page.evaluate(() => ({ cur: st.cur, task: st.task, sel: st.sel, card: document.querySelector("#task-card .card")?.dataset.i,
  rows: [...document.querySelectorAll("#gt-tasks > li")].map((l) => l.querySelector(".task-head").textContent.replace(/\s+/g, " ").trim()),
  open: document.querySelector("#gt-tasks > li.now")?.dataset.task, back: !$("#task-back").disabled,
  bar: [...document.querySelectorAll("#gt-bar > span")].map((b) => ({ grow: +getComputedStyle(b).flexGrow, fill: +b.style.getPropertyValue("--done") })) }));
const rectOf = (a) => { const r = Math.floor(a / 10), k = r % 2 ? 9 - (a % 10) : a % 10; return [k * IW / 10, r * IH / 10, IW / 10, IH / 10]; };
const same = (p, q) => !!p && !!q && p.every((v, k) => Math.abs(v - q[k]) < 1e-6);
// req/shell/ground-truth/tagging: found, the image stays as it is viewed until Start GT tagging is pressed
const ring = () => page.$eval("#overlay .ring", (r) => ({ shown: r.style.display !== "none" && getComputedStyle(r).display !== "none", stroke: getComputedStyle(r).stroke })).catch(() => ({ shown: false }));
const frame = () => page.evaluate(() => { const f = document.querySelector("#overlay .area-frame"); return f && f.style.display !== "none" && getComputedStyle(f).display !== "none" ? ["x", "y", "width", "height"].map((k) => +f.getAttribute(k)) : null; });
const cutShown = () => page.evaluate(() => { const g = document.querySelector("#overlay .done-mask"); return !!g && getComputedStyle(g).display !== "none"; });
const tagRows = () => page.evaluate(() => ["show-gt-cut", "show-gt-frame"].map((id) => $("#" + id).disabled));
const startSays = () => page.evaluate(() => { const b = $("#gt-start"); return b && b.offsetParent ? b.textContent.trim() : null; });
let s = await now();
await check(!s.open && !s.card && !(await ring()).shown && !(await frame()) && !(await cutShown()), "found, no task is open: nothing ringed, framed or cut out", s);
await check(await startSays() === "Start GT tagging" && (await tagRows()).every(Boolean), "Start GT tagging heads the box, and the Show menu's Cut out and Frame rows are off", [await startSays(), await tagRows()]);
await check(s.rows[0].startsWith(`0/${P} Finalists`), "the rows count the tasks before tagging starts", s.rows);
await page.click("#gt-start");
s = await now();
await check(s.cur === W[0].key && !s.back && s.open === W[0].t && (W[0].cy == null || (await ring()).shown) && same(await frame(), rectOf(W[0].a)),
  "Start GT tagging opens the walk's first item in its framed area (ringed when it is a candidate), with nothing to go back to", s);
await check(await startSays() === "Stop tagging" && !(await tagRows()).some(Boolean), "the button now reads Stop tagging, and the Show menu's rows are on", [await startSays(), await tagRows()]);
await page.click("#gt-start");
s = await now();
await check(!s.open && !s.card && !(await ring()).shown && !(await frame()), "Stop tagging closes the task: nothing ringed or framed", s);
await page.click("#gt-start");
s = await now();
await check(s.cur === W[0].key && s.open === W[0].t, "Start again opens the walk where it was", s);
// one row per task, each counting once, never saying "review"
await check(s.rows[0].startsWith(`0/${P} Finalists`) && s.rows[1].startsWith(`0/${F} Rejected`) && s.rows[2].startsWith("0/100 Areas") && /Submit Ground Truth/.test(s.rows[3])
  && !s.rows.some((r) => /review/i.test(r)) && await page.$$eval("#tasks-box", (b) => !/\d+ of \d+/.test(b[0].textContent)), "one row per task: 0/N Finalists, 0/N Rejected, 0/100 Areas, Submit", s.rows);
// the bar, a part per task as long as the task, filled as far as done
await check(s.bar.length === 3 && s.bar[0].grow === P && s.bar[1].grow === F && s.bar[2].grow === 100 && s.bar.every((b) => b.fill === 0), "the bar has a part per task, as long as the task", s.bar);

// clicking a task goes to its next item along the walk
await page.click('#gt-tasks > li[data-task="pass"] .task-head .t');
const first = W.find((x) => x.t === "pass");
s = await now();
await check(s.cur === first.key && s.card === first.key.slice(2) && s.open === "pass", "clicking Finalists goes to the walk's first finalist, its row open", s);
await check(await page.$$eval("#tasks-box .card", (c) => c.length) === 1, "one card at a time");
// the open row carries the cogwheel, Back and Skip; the card is the crop and big thumbs under it
const look = await page.evaluate(() => {
  const r = (e) => e.getBoundingClientRect(), d = $("#task-card .card"), crop = r(d.querySelector(".crop canvas")), up = r(d.querySelector(".verdict .up"));
  const head = document.querySelector("#gt-tasks > li.now .task-head");
  const box = r($("#gt-tasks")), down = r(d.querySelector(".verdict .down"));
  return { share: crop.width / box.width, under: up.top >= crop.bottom - 1 && Math.abs(up.top - down.top) < 1 && down.left > up.left, big: up.width >= 60 && up.height >= 36,
    head: !!d.querySelector(".head, .num, .state, .goto"), ticks: [...document.querySelectorAll("#gt-tasks > li:not(.done) .tick")].filter((t) => t.offsetParent).length,
    cog: !!head.querySelector("#card-menu summary svg") && !$("#card-menu summary").textContent.trim() && !$("#card-menu").open,
    skip: head.contains($("#task-skip")) && /skip/i.test($("#task-skip").textContent), back: head.contains($("#task-back")) && /back/i.test($("#task-back").textContent) };
});
await check(look.share >= 0.97 && look.under && look.big && !look.head && !look.ticks && look.cog && look.skip && look.back,
  "the open row has the cogwheel, Back and Skip; the crop takes the box's width, big thumbs side by side under it, no number or go-to, no marks on tasks not done", look);
await page.click("#card-menu summary");
await check(await page.evaluate(() => { const p = $("#card-menu .pop"), r = p.getBoundingClientRect(); return getComputedStyle(p).position === "absolute" && r.height > 40 && !!$("#opt-borders").offsetParent && !$("#sort").offsetParent; }),
  "the cogwheel opens the options as a popup, with no sort");
await page.click("#card-menu summary");

// req/nor/truth/marks: waiting, a faint outline and nothing else; decided, cut out of the image
const holes = () => page.evaluate(() => [...document.querySelectorAll("#done-mask-clip polygon")].map((p) => { const q = p.getAttribute("points").split(" ").map((v) => v.split(",").map(Number)), xs = q.map((v) => v[0]), ys = q.map((v) => v[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; }));
const mark = (i) => page.evaluate((i) => {
  const g = document.querySelector(`#overlay g[data-i="${i}"]`), out = g.querySelector("path:not(.red)"), cs = getComputedStyle(out);
  const c = nor.candOf(i), holes = [...document.querySelectorAll("#done-mask-clip polygon")].map((p) => { const q = p.getAttribute("points").split(" ").map((v) => v.split(",").map(Number)), xs = q.map((v) => v[0]), ys = q.map((v) => v[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; });
  const cut = holes.some(([x, y, w, h]) => x <= c.bb[0] - 2 + 1e-6 && y <= c.bb[1] - 2 + 1e-6 && x + w >= c.bb[2] + 2 - 1e-6 && y + h >= c.bb[3] + 2 - 1e-6);
  return { cls: g.getAttribute("class"), stroke: cs.stroke, opacity: +cs.strokeOpacity, outline: cs.display, num: getComputedStyle(g.querySelector(".num")).display, cut };
}, i);
const second = W.filter((x) => x.t === "pass")[1];
let m = await mark(+second.key.slice(2));
await check(/\btodo\b/.test(m.cls) && m.opacity <= 0.4 && !m.cut && m.num === "none" && m.stroke === "rgb(255, 255, 255)", "a candidate waiting is a faint white outline, no number", m);
const rung = await ring();
await check(rung.shown && rung.stroke === "rgb(255, 212, 0)", "the current candidate has a yellow ring", rung);
// the view come to rest where it was sent: the image's point x, y at its centre, or as near as the image's edge lets it
// the framed area wholly in view, and the scroll unmoved since the last frame: a right click then opens a menu no
// scroll will close
const framedAtRest = () => page.waitForFunction(() => {
  const sc = $("#scroller"), v = sc.getBoundingClientRect(), f = $("#overlay .area-frame")?.getBoundingClientRect();
  const at = [sc.scrollLeft, sc.scrollTop].join(), still = window.lastScroll === at;
  window.lastScroll = at;
  return still && f && f.left >= v.left && f.right <= v.right && f.top >= v.top && f.bottom <= v.bottom;
}, null, { polling: "raf" });
const viewAt = (x, y) => page.waitForFunction(([x, y]) => {
  const sc = $("#scroller"), v = sc.getBoundingClientRect(), p = new DOMPoint(x, y).matrixTransform($("#overlay").getScreenCTM());
  const there = (off, at, end) => Math.abs(off) <= 1.5 || (off < 0 && at <= 0) || (off > 0 && at >= end - 1);
  return there(p.x - (v.left + sc.clientLeft + sc.clientWidth / 2), sc.scrollLeft, sc.scrollWidth - sc.clientWidth)
    && there(p.y - (v.top + sc.clientTop + sc.clientHeight / 2), sc.scrollTop, sc.scrollHeight - sc.clientHeight);
}, [x, y]);
await check(same(await frame(), rectOf(first.a)), "the area the walk is in is framed", [await frame(), rectOf(first.a)]);
// req/nor/summary/mask: the mask shows only with the summary
await check(await page.evaluate(() => st.mask.length === 1 && !document.querySelector("#overlay .mask-marks")), "the summary's mask is kept but not drawn while the study makes ground truth");

// req/nor/show-menu: the Show menu above the image, its rows named for the tasks' markings
await check(await shown(page, "#show-menu"), "the Show menu is above the image");
await page.click("#show-menu summary");
const rows = await page.$$eval("#show-menu .pop label", (l) => l.filter((x) => x.offsetParent).map((x) => x.textContent.trim()));
await check(JSON.stringify(rows) === JSON.stringify(["Finalists", "Rejected", "Added NoRs", "Cut out what is done", "Frame the area"]), "its rows: Finalists, Rejected, Added NoRs, Cut out what is done, Frame the area", rows);
const toggle = (label) => page.locator("#show-menu .pop label:visible", { hasText: label }).locator("input").click();
const hidden = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].every((e) => getComputedStyle(e).display === "none"), sel);
await toggle("Frame the area");
await check(!(await frame()), "Frame the area off: no frame");
await toggle("Frame the area");
await toggle("Cut out what is done");
await check(await hidden("#overlay .done-mask"), "Cut out what is done off: the image whole");
await toggle("Cut out what is done");
await toggle("Finalists");
await check(await hidden(`#overlay g.pass.todo[data-i="${second.key.slice(2)}"]`), "Finalists off: no outline on a waiting finalist");
await toggle("Finalists");
await check(!(await hidden(`#overlay g.pass.todo[data-i="${second.key.slice(2)}"]`)) && await page.evaluate(() => JSON.parse(localStorage.getItem("nor-show-v1")).gtCut === true), "and back on, remembered");
await page.click("#show-menu summary");

// a verdict moves on along the walk, and cuts the reviewed one out
const i0 = +first.key.slice(2);
await page.click("#task-card .verdict .up");
s = await now();
let want = await nextOpen(first.key);
await check(s.cur === want && s.rows[0].startsWith(`1/${P} Finalists`) && s.bar[0].fill > 0 && s.back, "a thumbs up moves on to the walk's next item and fills the bar", { s, want });
m = await mark(i0);
await check(/\byes\b/.test(m.cls) && m.cut && m.outline === "none", "voted up, its area is cut out of the image", m);
// the picture the study names stands behind the whole image, shown only where it is cut out; black under it
await page.waitForFunction(() => document.querySelector("#overlay image.done-reveal"));
const pic = await page.evaluate(() => { const im = document.querySelector("#overlay image.done-reveal"), bg = document.querySelector("#overlay .done-bg"); return { href: im?.getAttribute("href"), clip: im?.getAttribute("clip-path"), w: +im?.getAttribute("width"), bg: bg && getComputedStyle(bg).fill, bgClip: bg?.getAttribute("clip-path") }; });
await check(pic.href === "https://acme.example/dog.jpg" && /done-mask-clip/.test(pic.clip) && /done-mask-clip/.test(pic.bgClip) && pic.bg === "rgb(0, 0, 0)" && pic.w === IW, "the picture the study links to, behind the whole image, black under it, shown only where it is cut out", pic);
await page.click("#show-menu summary");
await toggle("Cut out what is done");
await check(await page.evaluate(() => !!document.querySelector("#overlay .done-mask")) && await hidden("#overlay .done-mask"), "with something cut out, Cut out what is done off: the image whole");
await toggle("Cut out what is done");
await page.click("#show-menu summary");
// Back: the item before, to change a verdict
await page.click("#task-back");
s = await now();
await check(s.cur === first.key && s.card === String(i0) && await page.$eval("#task-card .verdict .up", (b) => b.classList.contains("on")), "Back returns to the item before, showing its verdict", s);
await page.click("#task-card .verdict .down");
m = await mark(i0);
s = await now();
await check(/\bno\b/.test(m.cls) && m.cut && s.cur === want, "its verdict changed, voted down it is cut out too, and the walk goes on", { m, s });
// Skip: the walk's next item not done, with no verdict
const skipFrom = s.cur, slide = await page.evaluate(() => { $("#task-skip").click(); return { cur: st.cur, anims: $("#task-card").getAnimations({ subtree: true }).length, leaving: document.querySelectorAll("#task-stage .leaving").length, cards: document.querySelectorAll("#task-card .card").length }; });
want = await nextOpen(skipFrom);
await check(slide.cur === want && (!skipFrom.startsWith("c:") || !want.startsWith("c:") || (slide.anims > 0 && slide.leaving === 1 && slide.cards === 1)), "Skip slides the next item in over the last", { slide, want });
await check(!(await isDone({ key: skipFrom })), "and leaves the skipped one without a verdict");
await page.click("#task-back");
await check((await now()).cur === skipFrom, "Back returns to the skipped one");

// a rejected candidate's card is a finalist's: turned level, with the bars and the adjusters; changed, it can be reset
// the next rejected one not done after the current item, going round the walk
const nextFail = await page.evaluate(() => {
  const xs = nor.walk(), k = xs.findIndex((x) => x.key === st.cur);
  return [...xs.slice(k + 1), ...xs.slice(0, Math.max(k, 0))].find((x) => x.t === "fail" && !x.done)?.key;
});
await page.click('#gt-tasks > li[data-task="fail"] .task-head .t');
s = await now();
await check(s.task === "fail" && s.open === "fail" && s.cur === nextFail, "clicking Rejected goes to the walk's next rejected candidate not yet done", { s, nextFail });
const rcard = await page.evaluate(() => ({ bars: document.querySelectorAll("#task-card .marks .bar").length, handles: document.querySelectorAll("#task-card .handle").length, tag: !!document.querySelector("#task-card .tag"), reset: !!document.querySelector("#task-card .reset-lines") }));
await check(rcard.bars === 3 && rcard.handles === 6 && !rcard.tag && !rcard.reset, "a rejected candidate's card has the measurement bars and the six adjusters", rcard);
{
  const h = page.locator('#task-card .handle[data-k="length"][data-j="1"]'); await h.scrollIntoViewIfNeeded();
  const b = await h.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 15, b.y + b.height / 2 - 10, { steps: 5 }); await page.mouse.up();
}
const changed = await page.evaluate(() => ({ edits: st.edits.has(st.sel), text: $("#task-card .card").textContent, reset: $("#task-card .reset-lines")?.textContent.trim() }));
await check(changed.edits && changed.reset === "Reset measurements" && !/Lengths adjusted/.test(changed.text), "its lengths changed, a Reset measurements button shows, and nothing else says so", changed);
await page.click("#task-card .reset-lines");
await check(await page.evaluate(() => !st.edits.has(st.sel) && !document.querySelector("#task-card .reset-lines")), "Reset measurements puts the finder's lengths back");

// a candidate clicked on the image becomes the current one
const target = +W.filter((x) => x.t === "pass")[2].key.slice(2);
await page.evaluate((i) => nor.focusOn(nor.candOf(i)), target);
await viewAt(...await page.evaluate((i) => { const c = nor.candOf(i); return [c.cx, c.cy]; }, target));
const at = await page.evaluate((i) => { const r = document.querySelector(`#overlay g[data-i="${i}"] .hit`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, target);
await page.mouse.click(at.x, at.y);
s = await now();
await check(s.task === "pass" && s.sel === target && s.card === String(target), "a candidate clicked on the image is the current task's", s);
await check(!(await shown(page, "#selected-box")), "no card hovers over the image");

// an area done: every candidate in it decided, then its check; the whole area is cut out, and the walk enters the next
const A = W.find((x) => x.t === "pass").a, inA = W.filter((x) => x.a === A && x.key.startsWith("c:"));
await page.evaluate((ks) => { for (const k of ks.slice(1)) if (!st.forced.get(+k.slice(2))) nor.decide(+k.slice(2), "reject"); }, inA.map((x) => x.key));
await page.evaluate((k) => nor.goTo(k), inA[0].key);
await page.click("#task-card .verdict .up");
s = await now();
await check(s.cur === "a:" + A && s.task === "missed" && s.open === "missed" && same(await frame(), rectOf(A)) && !(await page.isDisabled("#area-ok")), "every candidate in the area decided, the walk comes to its check, the area framed", s);
await check(!(await holes()).some((h) => same(h, rectOf(A))), "the area is not cut out before it is checked");
// a NoR the finder missed, added in the area, waits for its verdict there; the view framing the area first comes to
// rest, since a scroll closes the menu
await framedAtRest();
const fr = await page.$eval("#overlay .area-frame", (f) => { const r = f.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await page.mouse.click(fr.x, fr.y, { button: "right" });
await page.click("#ctx button");
s = await now();
await check(s.cur === "c:u1" && s.card === "u1" && s.open === "missed" && await page.isDisabled("#area-ok"), "an added NoR is the current item, in the Areas task, and the area waits for it", s);
await page.click("#task-card .verdict .up");
s = await now();
await check(s.cur === "a:" + A, "its verdict given, the walk is back at the area's check", s);
// removed again, Back passes over it, once the view the verdict moved is at rest
// the NoR was added at the framed area's middle, wherever the view now has it; the view may still move, which closes
// the menu (a scroll does), so the right click and Remove are given again once it rests, as a person would
let offered = "", removed = false;
for (let k = 0; k < 3 && !removed; k++) {
  await framedAtRest();
  const mid = await page.$eval("#overlay .area-frame", (f) => { const r = f.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(mid.x, mid.y, { button: "right" });
  offered = await page.textContent("#ctx button");
  removed = /Remove/.test(offered) && await page.click("#ctx button", { timeout: 2000 }).then(() => true, () => false);
}
await check(/Remove/.test(offered) && removed, "a right click on the added NoR offers to remove it, and Remove removes it", offered);
await page.click("#task-back");
s = await now();
await check(s.cur !== null && s.cur !== "c:u1" && s.task !== "submit", "Back passes over an added NoR since removed", s);
await page.evaluate((k) => nor.goTo(k), "a:" + A);
await page.click("#area-ok");
s = await now();
await check((await holes()).some((h) => same(h, rectOf(A))) && s.rows[2].startsWith("1/100 Areas") && s.cur === await nextOpen("a:" + A),
  "No missed NoRs here cuts the whole area out and goes on to the walk's next item", s);

// everything decided and every area checked: Submit
await page.evaluate(() => { for (const x of nor.walk()) if (x.c && !x.done) nor.decide(x.c.i, "reject"); });
for (let k = 0; k < 120 && await page.evaluate(() => st.task === "missed"); k++) await page.click("#area-ok");
s = await now();
await check(s.task === "submit" && s.rows[2] === "100/100 Areas" && (await page.$eval("#gt-submit", (b) => b.dataset.state)) === "done", "every task done: Submit, its icon a check", s);
await check(await page.$$eval('#gt-tasks > li[data-task="missed"], #gt-tasks > li[data-task="pass"], #gt-tasks > li[data-task="fail"]', (l) => l.every((x) => x.classList.contains("done"))), "every task is checked done");
await page.close();

// ---- the picture's link failing: black, never the browser's broken-picture icon ----
picture = false;
page = await open();
await page.click("#gt-start");
await page.evaluate(() => nor.decide(st.order[0].i, "approve"));
await page.pictureFailed;
await frames(page, 1);
const none = await page.evaluate(() => ({ image: !!document.querySelector("#overlay image.done-reveal"), bg: getComputedStyle(document.querySelector("#overlay .done-bg")).fill }));
await check(!none.image && none.bg === "rgb(0, 0, 0)", "a picture that cannot load leaves the cut-outs black", none);
await page.close();
picture = true;

// ---- a PreGT study: the summary and its mask, the Show menu's viewing rows, no tasks and no item view ----
stage = "PreGT";
page = await open();
await check(await shown(page, "#summary-box") && !(await shown(page, "#tasks-box")) && !(await shown(page, "#switch")) && await shown(page, "#show-menu"),
  "a PreGT study has its summary and its Show menu, no tasks and no switch to an item view");
await check(await page.evaluate(() => !!document.querySelector("#overlay .mask-marks .edge")), "the summary's mask is drawn with the summary");
await page.click("#show-menu summary");
const vrows = await page.$$eval("#show-menu .pop label", (l) => l.filter((x) => x.offsetParent).map((x) => x.textContent.trim()));
await check(JSON.stringify(vrows) === JSON.stringify(["Finalists", "Rejected", "candidate numbers", "rejection reasons", "measuring lines"]), "its rows: Finalists and Rejected as the tasks name them, then the numbers, reasons and lines", vrows);
await done(0);
