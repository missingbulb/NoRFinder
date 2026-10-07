// Drives the page (web/) in headless Chromium, with a worker that never answers, and checks R8's version
// history: the version box carries no tooltip and opens the Version history popup; after an update that the
// history names, a bubble points at the box and says what version the user saw last, until they open the
// history or close the bubble; a first visit, or an update the history does not name, shows no bubble; a
// history that cannot be read says so. Optional SHOTS: a directory for screenshots.
// Exits 1 on a failed check, 2 when it cannot run.
//   node tests/version_history_driver.mjs [SHOTS]
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
const VERSION = JSON.parse(fs.readFileSync(path.join(repo, "package.json"))).version;
const [major, day, build] = VERSION.split(".");
// the page's own version, one before it with no visible change, one before that, and the first
const HISTORY = [
  { version: VERSION, changes: ["Clicking the version shows this history."] },
  { version: `${major}.${day}.${build - 2}`, changes: ["The status bar shows the memory in use.", "Slow buttons show a spinner."] },
  { version: "0.10928.2", changes: ["A help note for every setting."] },
];
let history = JSON.stringify(HISTORY);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(""); }
  if (u === "/web/version_history.json") {
    if (!history) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { "content-type": "application/json" }); return r.end(history);
  }
  const f = path.join(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch();
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what) => { if (!ok) { console.error("FAILED: " + what); await done(1); } console.log("ok: " + what); };
const shot = async (page, name, sel) => { if (shots) await (sel ? page.locator(sel) : page).screenshot({ path: path.join(shots, name + ".png") }); };

// a page whose browser last saw `seen` (null: never visited)
async function open(seen, theme = "dark") {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
  await ctx.addInitScript(([seen, theme]) => {
    delete Navigator.prototype.serviceWorker;
    if (sessionStorage.getItem("primed")) return;
    sessionStorage.setItem("primed", "1");
    localStorage.setItem("nor-theme", theme);
    if (seen) localStorage.setItem("nor-seen-version", JSON.stringify(seen));
  }, [seen, theme]);
  const page = await ctx.newPage();
  page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/index.html");
  await page.waitForFunction(() => $("#sb-version").textContent);
  await page.waitForTimeout(300); // the history arrives
  return { ctx, page };
}
const bubble = (page) => page.evaluate(() => !$("#whats-new").hidden && $("#whats-new-open").textContent);
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("nor-seen-version")));
const tags = (page) => page.evaluate(() => [...document.querySelectorAll("#history-list section")].map((s) => [s.querySelector("h3").firstChild.textContent, !!s.querySelector(".tag")]));

// ---- a first visit: no bubble; the version box opens the full history ----
{
  const { ctx, page } = await open(null);
  await check(!(await bubble(page)), "a first visit shows no bubble");
  await check(await stored(page) === VERSION, "and remembers the version seen");
  const box = await page.evaluate(() => ({ text: $("#sb-version").textContent, title: $("#sb-version").getAttribute("title") }));
  await check(box.text === "v" + VERSION && !box.title, `the version box shows "${box.text}" with no tooltip`);
  await page.click("#sb-version");
  await check(await page.evaluate(() => $("#history-dlg").open && $("#history-title").textContent === "Version history"), "clicking it opens Version history");
  const t = await tags(page);
  await check(t.length === 3 && t[0][0] === "v" + VERSION && t.every(([, tag]) => !tag), `every release is listed, newest first, none marked new: ${JSON.stringify(t)}`);
  await shot(page, "history_popup");
  await shot(page, "history_popup_box", "#history-dlg");
  await page.click("#history-dlg button[value=close]");
  await check(!(await page.evaluate(() => $("#history-dlg").open)), "Close closes it");
  await ctx.close();
}

// ---- an update the history names: the bubble, closed with its x ----
{
  const seen = "0.10928.2";
  const { ctx, page } = await open(seen);
  const text = await bubble(page);
  await check(text === `Click here to see what was updated since v${seen}.`, `after an update the bubble says: "${text}"`);
  const pos = await page.evaluate(() => { const b = $("#whats-new").getBoundingClientRect(), v = $("#sb-version").getBoundingClientRect(); return { above: b.bottom <= v.top, over: b.left < v.right && b.right > v.left }; });
  await check(pos.above && pos.over, "it sits above the version box");
  await shot(page, "bubble_corner", "body");
  if (shots) await page.screenshot({ path: path.join(shots, "bubble_zoom.png"), clip: { x: 1400 - 420, y: 900 - 160, width: 420, height: 160 } });
  await check(await stored(page) === seen, "until it is closed, the version seen stays the old one");
  await page.click("#whats-new-x");
  await check(!(await bubble(page)) && await stored(page) === VERSION, "the x closes it and remembers this version");
  await page.reload(); await page.waitForTimeout(300);
  await check(!(await bubble(page)), "so it does not come back");
  await ctx.close();
}

// ---- the bubble opens the history, marking what is new since the version seen ----
{
  const seen = "0.10928.2";
  const { ctx, page } = await open(seen, "light");
  await page.click("#whats-new-open");
  const t = await tags(page);
  await check(await page.evaluate(() => $("#history-dlg").open) && t.map(([, tag]) => tag).join() === "true,true,false", `clicking it opens the history with the newer releases marked: ${JSON.stringify(t)}`);
  const since = await page.textContent("#history-list .since");
  await check(since.includes("v" + seen), `and names the version seen: "${since}"`);
  await check(!(await bubble(page)) && await stored(page) === VERSION, "the bubble is gone and this version remembered");
  await shot(page, "history_new_light", "#history-dlg");
  await ctx.close();
}

// ---- an update the history does not name: no bubble ----
{
  const seen = `${major}.${day}.${build - 2}`;
  history = JSON.stringify(HISTORY.slice(1));
  const { ctx, page } = await open(seen);
  await check(!(await bubble(page)) && await stored(page) === VERSION, "an update with nothing in the history shows no bubble");
  await ctx.close();
}

// ---- a history that cannot be read ----
{
  history = null;
  const { ctx, page } = await open("0.10928.2");
  await check(!(await bubble(page)) && await stored(page) === "0.10928.2", "no history: no bubble, and the version seen is kept for next time");
  await page.click("#sb-version");
  const msg = await page.waitForFunction(() => /could not be loaded/.test($("#history-list").textContent)).then(() => true, () => false);
  await check(msg, "the popup says the history could not be loaded");
  await ctx.close();
}
await done(0);
