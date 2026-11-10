// Drives the Bookshelf Reader's page in headless Chromium against stand-ins: a worker that answers Find books with three
// books and straightens each into a crop as big as its box, and a Tesseract that reads each crop as "Title <w>x<h>",
// surest when the crop is wider than tall. Checks req/shelves/books/find (the books drawn), req/shelves/read/readers
// (each read at the turn that reads across, the reader kept), req/shelves/matcher/export (the matcher's file),
// req/shelves/truth/task (one book at a time in the order the books stand, Back and Next, a book picked on the photo
// whatever its verdict, its title ready to retype, a corner dragged past the photo, a book flipped, books added and
// deleted from the right-click menu, a missed book drawn, what is approved cut out of the photo, Submit's export, the
// draft continued after a reload), req/shell/image/toolbar (no ruler or grid on a photo) and
// req/shell/waiting/visible (the light sweeping the photo while the study works). The real
// engines' readings are test_reading.py's. Exits 1 on a failed check, 2 when it cannot run.
//   node studies/shelves/tests/shelves_page_driver.mjs STUDIES
import { noisePng } from "../../../web-tests/png_fixture.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { repoFile } from "../../../web-tests/repo_file.mjs";
import { offSite } from "../../../web-tests/off_site.mjs";
import { ENGINE, LAUNCH } from "../../../web-tests/engine.mjs";
import { asTagger } from "../../../web-tests/tagger.mjs";
import { prepare, seed } from "./reader_stand_in.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const repo = path.resolve(import.meta.dirname, "..", "..", ".."), [studies] = process.argv.slice(2);
const W = 400, H = 300;
// two standing spines and a cover, clockwise from the top left; the finder lists the second spine first
const BOOKS = [
  { corners: [[60, 40], [95, 40], [95, 280], [60, 280]], view: "spine" },
  { corners: [[10, 20], [50, 20], [50, 280], [10, 280]], view: "spine" },
  { corners: [[120, 100], [300, 100], [300, 280], [120, 280]], view: "cover" },
];
const WORKER = `
const W = ${W}, H = ${H}, BOOKS = ${JSON.stringify(BOOKS)};
postMessage({ type: "ready", info: {} });
const size = (c) => [Math.round(Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1])), Math.round(Math.hypot(c[3][0] - c[0][0], c[3][1] - c[0][1]))];
onmessage = ({ data: m }) => {
  if (m.type === "study") postMessage({ type: "ready", info: {} });
  else if (m.type === "open") postMessage({ type: "held" });
  else if (m.type === "call" && m.action === "find") postMessage({ type: "result", action: "find", meta: { books: BOOKS }, bytes: null });
  else if (m.type === "call" && m.action === "straighten") {
    const sizes = m.args.corners.map(size), bytes = new Uint8Array(sizes.reduce((a, [w, h]) => a + w * h * 4, 0)).fill(200);
    postMessage({ type: "result", action: "straighten", meta: { sizes }, bytes }, [bytes.buffer]);
  }
};`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  const send = (type, body) => { r.writeHead(200, { "content-type": type }); r.end(body); };
  if (u === "/web/worker.js") return send("text/javascript", WORKER);
  if (u === "/web/vendor/wheels.json") return send("application/json", "[]");
  // the study shown to the stand-in tagger's account, as it is to its owner's (req/shell/study/visibility)
  if (u === "/studies/shelves/study.json") return send("application/json", JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(repo, u), "utf8")), visibility: { accounts: ["tagger@acme.example"] } }));
  const f = u === "/web/studies.json" ? studies : repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await pw[ENGINE].launch(LAUNCH);
let failed = false;
const check = (ok, what, seen) => { if (!ok) { failed = true; console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); } else console.log("ok: " + what); };

const PNG = noisePng(W, H);
async function load(page, name = "shelf.png") {
  await page.setInputFiles("#file", { name, mimeType: "image/png", buffer: PNG });
  await page.waitForFunction(() => !$("#bs-find").disabled);
  await page.evaluate(() => { $("#notice").hidden = true; });
}
async function open(role, seed = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  await asTagger(ctx);
  await ctx.route(offSite(origin), (r) => r.abort());
  await prepare(ctx);
  await ctx.addInitScript(([role, seed]) => {
    delete Navigator.prototype.serviceWorker; localStorage.setItem("nor-role", role);
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, [role, seed]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { failed = true; console.error("page error: " + e.message); });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/shelves");
  await page.waitForFunction(() => window.$ && /^Ready/.test($("#status").textContent));
  await load(page);
  return page;
}
const saved = async (page, click) => { const [d] = await Promise.all([page.waitForEvent("download"), page.click(click)]); return { name: d.suggestedFilename(), doc: JSON.parse(fs.readFileSync(await d.path(), "utf8")) }; };
const books = (page) => page.$$eval('#overlay g[data-layer="bs"] g.bs-book', (gs) => gs.map((g) => g.getAttribute("class")));
const KEPT = seed;

try {
  // a viewer: the books found and read, and the file for the matcher
  let page = await open("viewer", KEPT);
  check(await page.evaluate(() => $("#bs-reader").value) === "tesseract" && await page.$$eval("#bs-reader option", (o) => o.length) === 3,
    "the three readers are offered, the one last chosen kept");
  await page.evaluate(() => { window.looks = []; new MutationObserver(() => { if (!$("#busy").hidden) looks.push($("#busy").className); }).observe($("#busy"), { attributes: true }); });
  await page.click("#bs-find");
  await page.waitForFunction(() => $("#status").textContent.startsWith("Titles read"));
  const looks = await page.evaluate(() => looks);
  check(looks.length && looks.every((c) => c.includes("scan")),
    "while the study works, the shell sweeps its light over the photo, without the study asking (req/shell/waiting/visible)", looks);
  const lines = await page.$eval('#overlay g.bs-book .over', (p) => { const s = getComputedStyle(p); return { effect: s.vectorEffect, width: parseFloat(s.strokeWidth) }; });
  check(lines.effect === "non-scaling-stroke" && lines.width >= 2, "a book's outline keeps its screen width at any zoom, thick enough to see", lines);
  const drawn = await books(page);
  check(drawn.length === 3 && drawn.filter((c) => c.includes("cover")).length === 1, "Find books draws each book on the photo, the cover marked as one", drawn);
  const titles = await page.$$eval("#bs-list li", (l) => l.map((x) => x.textContent));
  // a tall spine reads across once turned a quarter, so its crop is read as its height by its width
  check(titles.join() === "Title 240x35,Title 260x40,Title 180x180", "each book is read at the turn that reads across, listed in the order found", titles);
  check(await page.evaluate(() => $("#tasks-box").hidden && !$("#summary-box").hidden), "a viewer has no ground-truth box: Summary lists the titles");
  check(await page.evaluate(() => $("#bs-continue").hidden), "a viewer is offered no ground truth to continue");
  check(await page.evaluate(() => ["#ruler-btn", "#grid-btn"].every((s) => getComputedStyle($(s)).display === "none") && getComputedStyle($("#zoom-in")).display !== "none"),
    "a photo has no ruler or grid in the toolbar, its zoom kept (req/shell/image/toolbar)");
  const m = await saved(page, "#bs-export");
  const [m1, m2, m3] = m.doc.books;
  check(m.name === "shelf_books.json" && m.doc.books.length === 3 && m1.id === 1 && m1.text === "Title 240x35" && m1.confidence === 0.9 && m1.reader === "tesseract"
    && m3.view === "cover" && m2.corners.length === 4 && m.doc.W === W,
  "Download for the matcher saves each book's id, view, text, confidence, reader and corners", m);
  await page.context().close();

  // a tagger: one book at a time, in the order the books stand, the missed ones added, then Submit
  page = await open("tagger", KEPT);
  check(await page.evaluate(() => !$("#bs-continue").hidden && $("#bs-continue").disabled), "Continue tagging is offered, off while no draft is kept for the photo");
  await page.click("#bs-find");
  await page.waitForFunction(() => $("#status").textContent.startsWith("Titles read"));
  const rows = () => page.$$eval("#gt-tasks > li .t", (h) => h.map((x) => x.textContent.trim()));
  check((await rows()).join() === "0/3 Books" && await page.evaluate(() => $("#summary-box").hidden && !$("#tasks-box").hidden),
    "Ground Truth Tasks has one task, Books, found and missed alike, and Summary is not shown", await rows());
  check(await page.evaluate(() => !/finder found/.test($("#tasks-box").textContent)), "the tasks box carries no instructions of its own");
  check(await page.evaluate(() => !document.querySelector(".bs-item") && !document.querySelector("#gt-tasks > li.now")), "no book is open until Start GT tagging (req/shell/ground-truth/tagging)");
  await page.click("#gt-start");
  const value = () => page.evaluate(() => $(".bs-item input")?.value);
  const selected = () => page.evaluate(() => { const t = $(".bs-item input"); return document.activeElement === t && t.selectionStart === 0 && t.selectionEnd === t.value.length && t.value.length > 0; });
  check(await value() === "Title 260x40" && await page.$$eval(".bs-item canvas", (c) => c[0].width) === 260,
    "the walk starts at the leftmost book, not the finder's first, upright with what the reader read", await value());
  await page.waitForFunction(() => document.activeElement === $(".bs-item input"));
  check(await selected(), "the open book's title is focused with all its text selected, ready to retype");
  check(await page.evaluate(() => !document.querySelector(".bs-item [data-view], .bs-item [data-lang], .bs-item [data-do='turn']")),
    "the task asks no spine or cover, no language and no quarter turn: Flip alone");
  // the stand-in worker's crops are flat grey: a picture with the photo's noise in it is drawn by the page itself
  check(await page.$eval(".bs-item canvas", (c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; return new Set(Array.from(d.filter((_, i) => i % 4 === 0))).size > 10; }),
    "the book's picture is drawn by the page from the photo it shows, not by Python");
  // flipped upside down: drawn so, and read again at that turn alone, in both languages
  const reads = await page.evaluate(() => tess.reads);
  await page.click('.bs-item [data-do="flip"]');
  await page.waitForFunction((n) => tess.reads > n && $("#status").textContent === "Book read again.", reads);
  check(await page.evaluate((n) => tess.reads - n, reads) === 1 && await page.evaluate(() => tess.langs.every((l) => l === "heb+eng")),
    "Flip turns the book upside down and reads it again at that turn alone, in Hebrew and English", await page.evaluate(() => tess.langs));
  await page.fill(".bs-item input", "הארי פוטר");
  const cut = () => page.$$eval("#overlay .done-mask polygon", (p) => p.length);
  const cutShown = () => page.evaluate(() => { const g = document.querySelector("#overlay .done-mask"); return !!g && getComputedStyle(g).display !== "none"; });
  await page.click('.bs-verdicts [data-do="right"]');
  check((await rows())[0] === "1/3 Books" && await value() === "Title 240x35", "a verdict moves on to the next book along the shelf", [await rows(), await value()]);
  check(await cut() === 1 && await cutShown(), "the approved book is cut out of the photo while tagging", await cut());
  await page.click('.bs-verdicts [data-do="wrong"]');
  check((await rows())[0] === "2/3 Books" && await value() === "Title 180x180" && await cut() === 1, "Not a book moves on too, and cuts nothing out", await rows());
  await page.click('.bs-tools [data-do="back"]');
  check((await rows())[0] === "2/3 Books" && await value() === "Title 240x35" && await page.$eval('.bs-verdicts [data-do="wrong"]', (b) => b.getAttribute("aria-pressed")) === "true",
    "Back goes to the book left of this one, its verdict kept and shown", await rows());
  await page.click('.bs-verdicts [data-do="right"]');
  check((await rows())[0] === "2/3 Books" && await value() === "Title 180x180" && await cut() === 2, "a verdict changed there moves on to the next book still open");
  await page.click('.bs-tools [data-do="next"]');
  check(await value() === "הארי פוטר", "Next goes to the next book along the shelves, round to the first", await value());
  check(!(await selected()), "an approved book's title is not selected for retyping");
  // the cover picked on the photo, and a book already approved picked there too
  const toScreen = (x, y) => page.evaluate(([x, y]) => { const r = $("#base").getBoundingClientRect(); return [r.left + x * st.zoom, r.top + y * st.zoom]; }, [x, y]);
  await page.mouse.click(...(await toScreen(210, 190)));
  check(await value() === "Title 180x180", "clicking a book on the photo opens it in the task", await value());
  await page.waitForFunction(() => document.activeElement === $(".bs-item input"));
  check(await selected(), "a book picked on the photo, not yet approved, has its title selected to retype");
  await page.mouse.click(...(await toScreen(77, 200)));
  check(await value() === "Title 240x35", "a book already approved opens from the photo too", await value());
  await page.mouse.click(...(await toScreen(210, 190)));
  // the cover's top-right corner dragged 120 px to the right, past the photo's edge, the photo zoomed in so it could
  // pan: the picture follows while dragging, the book is straightened and read again with the photo never covered,
  // and the photo stays where it was (req/shell/image/minimap)
  for (let i = 0; i < 3; i++) await page.click("#zoom-in");
  await page.evaluate(() => { const sc = $("#scroller"); sc.scrollLeft = 300 * st.zoom - sc.clientWidth / 2; sc.scrollTop = 100 * st.zoom - sc.clientHeight / 2; });
  const scrolled = () => page.evaluate(() => [$("#scroller").scrollLeft, $("#scroller").scrollTop]);
  const before = await scrolled();
  const knob = await page.$$eval("#overlay .bs-corner", (cs) => { const r = cs[1].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const zoom = await page.evaluate(() => st.zoom);
  await page.evaluate(() => { window.covered = !$("#busy").hidden; new MutationObserver(() => { if (!$("#busy").hidden) covered = true; }).observe($("#busy"), { attributes: true }); });
  await page.mouse.move(...knob); await page.mouse.down(); await page.mouse.move(knob[0] + 120 * zoom, knob[1], { steps: 6 });
  const live = await page.$eval(".bs-item canvas", (c) => c.width);
  check(live === 240, "the book's picture follows the corner while it is dragged", live);
  await page.mouse.up();
  const after = await scrolled();
  check(before[0] > 0 && after.join() === before.join(), "dragging a corner moves the corner alone, never the photo under it", { before, after });
  await page.waitForFunction(() => $(".bs-item input")?.value === "Title 300x180");
  check(!(await page.evaluate(() => covered)), "a corner dragged on the photo re-straightens and re-reads the book, the photo never covered");
  for (let i = 0; i < 3; i++) await page.click("#zoom-out");
  await page.click('.bs-verdicts [data-do="right"]');
  check((await rows())[0] === "3/3 Books" && await page.evaluate(() => $("#gt-submit").disabled && !!document.querySelector('[data-do="none"]')),
    "every book decided, the task asks for the missed ones before Submit", await rows());
  // right-click on the photo: a book added where no box is, sized as the books found, and one deleted from inside it
  await page.mouse.click(...(await toScreen(390, 250)), { button: "right" });
  check(await page.$$eval("#bs-menu:not([hidden]) button:not([hidden])", (b) => b.map((x) => x.dataset.do).join()) === "add", "right-click off every book offers only Add a book");
  await page.click('#bs-menu [data-do="add"]');
  await page.waitForFunction(() => $(".bs-item input")?.value === "Title 240x40");
  check((await books(page)).length === 4 && (await rows())[0] === "3/4 Books", "Add a book here boxes a book at the click, sized as the books found, and reads it as one more book", await rows());
  await page.mouse.click(...(await toScreen(390, 250)), { button: "right" });
  await page.click('#bs-menu [data-do="delete"]');
  check((await books(page)).length === 3 && (await rows())[0] === "3/3 Books", "Delete this book takes an added book away", await rows());
  // a book can be added over a box already drawn: a box the finder drew over two books hides one of them
  await page.mouse.click(...(await toScreen(30, 150)), { button: "right" });
  check(await page.$$eval("#bs-menu:not([hidden]) button:not([hidden])", (b) => b.map((x) => x.dataset.do).join()) === "add,flip,delete", "right-click on a book offers Add a book too, with Flip and Delete");
  await page.keyboard.press("Escape");
  await page.click('[data-do="draw"]');
  for (const [x, y] of [[330, 60], [380, 60], [380, 280], [330, 280]]) await page.mouse.click(...(await toScreen(x, y)));
  await page.waitForFunction(() => $(".bs-item input")?.value === "Title 220x50");
  check((await rows())[0] === "3/4 Books", "Draw a book takes four corners on the photo, and the book drawn is one more book to review", await rows());
  await page.click('.bs-verdicts [data-do="right"]');
  await page.click('[data-do="none"]');
  check((await rows()).join() === "4/4 Books" && !(await page.evaluate(() => $("#gt-submit").disabled)), "None missed ends the task, and Submit opens", await rows());
  await page.click("#gt-start");
  check(!(await cutShown()), "out of tagging the photo is whole again");
  await page.click("#gt-start");
  await page.click("#gt-submit");
  const gt = await saved(page, "#gt-export");
  const [b1, b2, b3, b4] = gt.doc.books;
  check(gt.name === "shelf_books_gt.json" && gt.doc.books.length === 4 && !("view" in b1) && b1.text === "הארי פוטר" && b1.turn === 3 && b1.proposed.text === "Title 260x40"
    && !("view" in b1.proposed) && b2.verdict === "right" && b3.corners[1][0] === 420 && b3.proposed.corners[1][0] === 300 && b4.source === "missed" && b4.corners[0].join() === "330,60" && !b4.proposed,
  "Submit's file carries each book in the order they stand: its verdict, corners (past the photo's edge where dragged there), turn and text, and what the finder and the reader proposed", gt.doc);
  // the page reloaded, the photo opened again: the draft continues where the tagger left off, without finding again
  await page.reload();
  await page.waitForFunction(() => window.$ && /^Ready/.test($("#status").textContent));
  await load(page);
  check(await page.evaluate(() => !$("#bs-continue").disabled), "with a draft kept for the photo, Continue tagging is on");
  await page.click("#bs-continue");
  await page.waitForFunction(() => document.querySelector("#gt-tasks > li.now"));
  check((await rows()).join() === "4/4 Books" && (await books(page)).length === 4 && await page.evaluate(() => $("#gt-start").textContent === "Stop tagging" && !$("#gt-submit").disabled),
    "Continue tagging brings back every book, verdict and title, and tagging, with no Find books", await rows());
  await page.click("#user-menu summary"); await page.click("#manage-storage");
  await page.waitForFunction(() => $("#usage-dlg").open && !/Reading/.test($("#storage-list").textContent));
  const kept = await page.$$eval('#storage-list .entry[data-kind="selections"]', (es) => es.map((e) => [e.querySelector(".name").textContent, e.querySelector(".what").textContent]));
  check(kept.length === 1 && kept[0][0] === "shelf.png" && /drafted books/.test(kept[0][1]), "Manage storage lists the draft under its photo", kept);
  await page.keyboard.press("Escape");
  await load(page, "other.png");
  check(await page.evaluate(() => $("#bs-continue").disabled), "another photo has no draft to continue");
  await page.context().close();
} catch (e) { failed = true; console.error(e); }
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
