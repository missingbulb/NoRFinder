// Drives the Bookshelf Reader's page in headless Chromium against stand-ins: a worker that answers Find books with three
// books and straightens each into a crop as big as its box, and a Tesseract that reads each crop as "Title <w>x<h>",
// surest when the crop is wider than tall. Checks req/shelves/books/find (the books drawn), req/shelves/read/readers
// (each read at the turn that reads across, the reader kept), req/shelves/matcher/export (the matcher's file) and
// req/shelves/truth/task (one book at a time, Back, a corner dragged, a missed book drawn, Submit's export). The real
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
// two standing spines and a cover, clockwise from the top left
const BOOKS = [
  { corners: [[10, 20], [50, 20], [50, 280], [10, 280]], view: "spine" },
  { corners: [[60, 40], [95, 40], [95, 280], [60, 280]], view: "spine" },
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
  await page.setInputFiles("#file", { name: "shelf.png", mimeType: "image/png", buffer: noisePng(W, H) });
  await page.waitForFunction(() => !$("#bs-find").disabled);
  await page.evaluate(() => { $("#notice").hidden = true; });
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
  await page.click("#bs-find");
  await page.waitForFunction(() => $("#status").textContent.startsWith("Titles read"));
  const drawn = await books(page);
  check(drawn.length === 3 && drawn.filter((c) => c.includes("cover")).length === 1, "Find books draws each book on the photo, the cover marked as one", drawn);
  const titles = await page.$$eval("#bs-list li", (l) => l.map((x) => x.textContent));
  // a tall spine reads across once turned a quarter, so its crop is read as its height by its width
  check(titles.join() === "Title 260x40,Title 240x35,Title 180x180", "each book is read at the turn that reads across, listed in the order found", titles);
  check(await page.evaluate(() => $("#tasks-box").hidden && !$("#summary-box").hidden), "a viewer has no ground-truth box: Summary lists the titles");
  const m = await saved(page, "#bs-export");
  const [m1, m2, m3] = m.doc.books;
  check(m.name === "shelf_books.json" && m.doc.books.length === 3 && m1.id === 1 && m1.text === "Title 260x40" && m1.confidence === 0.9 && m1.reader === "tesseract"
    && m3.view === "cover" && m2.corners.length === 4 && m.doc.W === W,
  "Download for the matcher saves each book's id, view, text, confidence, reader and corners", m);
  await page.context().close();

  // a tagger: one book at a time, then the missed ones, then Submit
  page = await open("tagger", KEPT);
  await page.click("#bs-find");
  await page.waitForFunction(() => $("#status").textContent.startsWith("Titles read"));
  const rows = () => page.$$eval("#gt-tasks > li .t", (h) => h.map((x) => x.textContent.trim()));
  check((await rows()).join() === "0/3 Books,0 Missed books" && await page.evaluate(() => $("#summary-box").hidden && !$("#tasks-box").hidden),
    "Ground Truth Tasks lists Books and Missed books, and Summary is not shown", await rows());
  check(await page.evaluate(() => $(".bs-item input").value) === "Title 260x40" && await page.$$eval(".bs-item canvas", (c) => c[0].width) === 260,
    "the first book shows upright with what the reader read, to correct");
  await page.click('.bs-views [data-view="cover"]');
  await page.fill(".bs-item input", "הארי פוטר");
  await page.click('.bs-verdicts [data-do="right"]');
  await page.click('.bs-verdicts [data-do="wrong"]');
  check((await rows())[0] === "2/3 Books", "a verdict moves on to the next book", await rows());
  await page.click('.bs-tools [data-do="back"]');
  check((await rows())[0] === "1/3 Books" && await page.evaluate(() => $(".bs-item input").value) === "Title 240x35", "Back returns to the book before, its verdict undone", await rows());
  await page.click('.bs-verdicts [data-do="right"]');
  // the cover's top-right corner dragged 40 px to the right: the book is straightened and read again
  const knob = await page.$$eval("#overlay .bs-corner", (cs) => { const r = cs[1].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const zoom = await page.evaluate(() => st.zoom);
  await page.mouse.move(...knob); await page.mouse.down(); await page.mouse.move(knob[0] + 40 * zoom, knob[1], { steps: 4 }); await page.mouse.up();
  await page.waitForFunction(() => $(".bs-item input")?.value === "Title 220x180");
  check(true, "a corner dragged on the photo re-straightens and re-reads the book");
  await page.click('.bs-verdicts [data-do="right"]');
  check((await rows())[0] === "3/3 Books" && await page.evaluate(() => $("#gt-submit").disabled), "every book reviewed, Submit waits for the missed books", await rows());
  await page.click('[data-do="draw"]');
  for (const [x, y] of [[330, 60], [380, 60], [380, 280], [330, 280]]) {
    const at = await page.evaluate(([x, y]) => { const r = $("#base").getBoundingClientRect(); return [r.left + x * st.zoom, r.top + y * st.zoom]; }, [x, y]);
    await page.mouse.click(...at);
  }
  await page.waitForFunction(() => $(".bs-item input")?.value === "Title 220x50");
  check(true, "Draw a book takes four corners on the photo, and the book drawn is read for review");
  await page.click('.bs-verdicts [data-do="right"]');
  await page.click('[data-do="none"]');
  check((await rows()).join() === "3/3 Books,1 Missed books" && !(await page.evaluate(() => $("#gt-submit").disabled)), "None missed ends the task, and Submit opens", await rows());
  await page.click("#gt-submit");
  const gt = await saved(page, "#gt-export");
  const [b1, b2, b3, b4] = gt.doc.books;
  check(gt.name === "shelf_books_gt.json" && gt.doc.books.length === 4 && b1.view === "cover" && b1.text === "הארי פוטר" && b1.proposed.view === "spine" && b1.proposed.text === "Title 260x40"
    && b2.verdict === "right" && b3.corners[1][0] === 340 && b3.proposed.corners[1][0] === 300 && b4.source === "missed" && b4.corners[0].join() === "330,60" && !b4.proposed,
  "Submit's file carries each book's verdict, corners, view and text, and what the finder and the reader proposed", gt.doc);
  await page.context().close();
} catch (e) { failed = true; console.error(e); }
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
