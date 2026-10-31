// Drives the page (web/) in headless Chromium with the stand-in worker of the layout test, answering from
// real results (ANSWERS, written by tests/test_memory.py), and checks the item views' navigation and
// drawing: a drag from a label pans and selects no text (1.17); a double click on a candidate opens its
// card, and on a card shows it on the image (3.4); only the cards in view and two rows past it are drawn
// (3.22). Prints what it saw; exits 1 on a failure, 2 when it cannot run.
//   node tests/item_view_driver.mjs ANSWERS IMAGE
import { repoFile } from "../../../web-tests/repo_file.mjs";
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

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  let f = u.startsWith("/web/answers/") ? path.join(answers, u.slice("/web/answers/".length)) : repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch();
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const fail = async (what, seen) => { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); };
const ctx = await browser.newContext({ viewport: { width: 1200, height: 560 } });
await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
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
const frames = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
// the observer reports in its own task, after some frame: wait until the drawn cards stop changing
const settled = async () => {
  let last = -1, same = 0;
  for (let k = 0; k < 60 && same < 3; k++) {
    await frames();
    const n = await page.evaluate(() => document.querySelectorAll("#list .card canvas").length);
    same = n === last ? same + 1 : 0; last = n;
  }
};
const centre = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });

// ---- 1.17: a drag that starts beside a candidate's number and crosses it pans the image and selects no
// text ----
for (let k = 0; k < 4; k++) await page.click("#zoom-in");
const label = await page.evaluate(() => {
  const sc = $("#scroller"), v = sc.getBoundingClientRect();
  const t = [...document.querySelectorAll("#overlay text")].map((e) => e.getBoundingClientRect())
    .find((r) => r.width && r.left > v.left + 80 && r.right < v.right - 80 && r.top > v.top + 80 && r.bottom < v.bottom - 80);
  return t && { x: t.left - 4, y: t.top + t.height / 2, w: t.width, l: sc.scrollLeft, t: sc.scrollTop };
});
if (!label) await fail("no candidate number in view to drag from");
await page.mouse.move(label.x, label.y); await page.mouse.down();
for (let k = 1; k <= 10; k++) await page.mouse.move(label.x + (label.w + 20) * k / 10, label.y + 2 * k);
await page.mouse.up();
const after = await page.evaluate(() => ({ sel: getSelection().toString(), l: $("#scroller").scrollLeft, t: $("#scroller").scrollTop }));
console.log("drag across a label:", JSON.stringify({ before: label, after }));
if (after.sel) await fail("a drag across a label selected text", after.sel);
if (after.l === label.l && after.t === label.t) await fail("a drag across a label did not move the image");
// the ruler's length too
await page.click("#ruler-btn");
const sv = await centre("#scroller");
await page.mouse.move(sv.x - 60, sv.y); await page.mouse.down(); await page.mouse.move(sv.x + 60, sv.y, { steps: 5 }); await page.mouse.up();
const rl = await page.$eval("#ruler text", (e) => { const r = e.getBoundingClientRect(); return { x: r.left - 4, y: r.top + r.height / 2, w: r.width }; });
await page.mouse.move(rl.x, rl.y); await page.mouse.down();
for (let k = 1; k <= 10; k++) await page.mouse.move(rl.x + (rl.w + 20) * k / 10, rl.y + 2 * k);
await page.mouse.up();
const sel2 = await page.evaluate(() => getSelection().toString());
console.log("drag across the ruler's length selected:", JSON.stringify(sel2));
if (sel2) await fail("a drag across the ruler's length selected text", sel2);
await page.click("#ruler-btn"); // takes the ruler away
await page.click("#zoom-out"); for (let k = 0; k < 6; k++) await page.click("#zoom-out");

// ---- 3.4: a double click on a candidate opens its card in the item views ----
const target = await page.evaluate(() => {
  const v = $("#scroller").getBoundingClientRect();
  for (const g of document.querySelectorAll("#overlay g[data-i]")) {
    const h = g.querySelector(".hit") || g, r = h.getBoundingClientRect();
    if (!r.width || r.left < v.left || r.right > v.right || r.top < v.top || r.bottom > v.bottom) continue;
    const x = r.left + r.width / 2, y = r.top + r.height / 2, c = nor.candOf(g.dataset.i[0] === "u" ? g.dataset.i : +g.dataset.i);
    // the point must pick this candidate
    if (c && document.elementFromPoint(x, y)?.closest("g[data-i]") === g) return { x, y, i: c.i };
  }
  return null;
});
if (!target) await fail("no candidate in view to double click");
await page.mouse.dblclick(target.x, target.y);
await page.waitForFunction(() => st.view === "items");
await settled();
const opened = await page.evaluate(() => {
  const d = document.querySelector(`#list .card[data-i="${st.sel}"]`), r = d?.getBoundingClientRect(), v = $("#items-view").getBoundingClientRect();
  return { sel: st.sel, view: st.view, card: !!d, outlined: d?.classList.contains("selected"), inView: !!r && r.bottom > v.top && r.top < v.bottom, drawn: !!d?.querySelector("canvas") };
});
console.log("double click on the image:", JSON.stringify(opened));
if (opened.sel !== target.i || !opened.card || !opened.outlined || !opened.inView || !opened.drawn) await fail("a double click on a candidate did not open its card", { ...opened, want: target.i });

// ---- 3.4: a double click on a card shows it on the image ----
const other = await page.evaluate(() => [...document.querySelectorAll("#list .card")].find((d) => d.dataset.i !== String(st.sel) && d.querySelector("canvas"))?.dataset.i);
if (other === undefined) await fail("no second card to double click");
await page.dblclick(`#list .card[data-i="${other}"] .state`);
await page.waitForFunction(() => st.view === "image");
const shown = await page.evaluate(() => String(st.sel));
console.log("double click on a card:", shown, "of", other);
if (shown !== other) await fail("a double click on a card did not select it on the image", { shown, other });

// ---- 3.22: only the cards in view and two rows past it are drawn ----
// a narrow, short window puts the corner's few cards in many rows
await page.setViewportSize({ width: 760, height: 420 });
await page.click("#switch");
let checked = 0, near = 0;
for (const tab of ["#tab-pass", "#tab-fail"]) {
  await page.click(tab); await page.evaluate(() => { $("#items-view").scrollTop = 0; }); await settled();
  const rows = () => page.evaluate(() => {
    const v = $("#items-view").getBoundingClientRect(), cards = [...document.querySelectorAll("#list .card")];
    const tops = [...new Set(cards.map((d) => Math.round(d.getBoundingClientRect().top)))].sort((a, b) => a - b);
    // each row: its top, and how many of its cards are drawn
    return { v: { t: v.top, b: v.bottom }, rows: tops.map((t) => { const in_ = cards.filter((d) => Math.round(d.getBoundingClientRect().top) === t); return { t, n: in_.length, drawn: in_.filter((d) => d.querySelector("canvas")).length }; }) };
  });
  const check = async (where) => {
    const { v, rows: R } = await rows();
    const firstBelow = R.findIndex((r) => r.t >= v.b), lastAbove = R.findLastIndex((r) => r.t < v.t);
    const want = (k) => (firstBelow < 0 || k < firstBelow + 2) && (k > lastAbove - 2);
    // a drawn card stays drawn, so only rows the view has never neared are left empty
    const far = (k) => where === "at the top" && firstBelow >= 0 && k >= firstBelow + 3;
    console.log(`${tab} ${where}: ${R.length} rows, drawn per row ${R.map((r) => r.drawn + "/" + r.n).join(" ")}`);
    for (const [k, r] of R.entries()) {
      if (want(k)) near++;
      if (want(k) && r.drawn !== r.n) await fail(`${tab} ${where}: row ${k}, in view or within two rows of it, is not drawn`, R);
      if (far(k) && r.drawn) await fail(`${tab} ${where}: row ${k}, far from the view, is drawn`, R);
      if (far(k)) checked++;
    }
  };
  await check("at the top");
  await page.evaluate(() => { const v = $("#items-view"); v.scrollTop = v.scrollHeight; }); await settled();
  await check("at the bottom");
}
if (!checked) await fail("no list long enough to leave a row undrawn");
// two tabs, two places each, at least the row in view at each
if (near < 4) await fail("too few rows near the view were checked", near);
await done(0);
