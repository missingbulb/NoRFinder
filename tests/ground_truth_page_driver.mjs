// Drives the page (web/) in headless Chromium with a stand-in worker that answers from ANSWERS (written by
// tests/test_memory.py) and checks the ground-truth workflow: a local image warns that its ground truth cannot
// be sent; a right click adds a NoR, with measuring lines to correct on its card, first among the finalists and
// glowing on the image until the user decides; the measuring ends drag freely and keep the NoR on one axis; the
// Ground truth file holds only the candidates voted on, the added NoR once approved; and for an image from Google
// Drive (a stand-in Drive API) the button also opens a GitHub issue labelled for the intake. Exits 1 on a failed check, 2 when it cannot run.
//   node tests/ground_truth_page_driver.mjs ANSWERS IMAGE
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
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRIVE_ID = "FAKEDRIVEID1234567890ab";

const STAND_IN = `
const A = await (await fetch("answers/answers.json")).json();
const bin = async (n) => new Uint8Array(await (await fetch("answers/" + n)).arrayBuffer());
let finder;
postMessage({ type: "ready", finders: A.finders, about: A.about, secs: 0 });
onmessage = async ({ data: m }) => {
  if (m.type === "open") {
    const images = await bin("images.bin");
    postMessage({ type: "opened", H: A.H, W: A.W, um: A.um, images, secs: 0 }, [images.buffer]);
  } else if (m.type === "detect") {
    finder = m.finder; const seg = await bin("seg_" + finder + ".bin");
    postMessage({ type: "detected", meta: A.detected[finder], seg, secs: 0 }, [seg.buffer]);
  } else if (m.type === "refilter") {
    postMessage({ type: "filtered", ...A.filtered[finder][0], seq: m.seq, ms: 0 });
  }
};`;
const CONFIG = `window.NOR_CONFIG = { google: { apiKey: "test-key" }, drive: { defaultLink: "" } };`;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  if (u === "/web/config.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(CONFIG); }
  const f = u.startsWith("/web/answers/") ? path.join(answers, u.slice("/web/answers/".length)) : path.join(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch();
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what) => { if (!ok) { console.error("FAILED: " + what); await done(1); } console.log("ok: " + what); };
const bytes = fs.readFileSync(image);

async function open(drive) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const asked = []; // what was asked of github.com
  await ctx.route((u) => !u.href.startsWith(origin), (r) => {
    const u = new URL(r.request().url());
    if (u.host === "github.com") asked.push(u);
    if (u.host !== "www.googleapis.com") return r.abort();
    const headers = { "access-control-allow-origin": "*" };
    if (u.searchParams.get("alt") === "media") return r.fulfill({ status: 200, headers: { ...headers, "content-length": String(bytes.length) }, body: bytes });
    return r.fulfill({ status: 200, headers, contentType: "application/json", body: JSON.stringify({ name: "corner.tif", mimeType: "image/tiff" }) });
  });
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  const page = await ctx.newPage();
  page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/index.html");
  await page.waitForFunction(() => !document.querySelector("#finder").disabled);
  if (drive) {
    await page.click("#load-menu summary");
    await page.click('#load-menu .item[data-src="drive"]');
    await page.fill("#drive-link", `https://drive.google.com/file/d/${DRIVE_ID}/view`);
    await page.click("#drive-go");
  } else {
    await page.setInputFiles("#file", image);
  }
  await page.waitForFunction(() => !document.querySelector("#find").disabled);
  return { ctx, page, asked };
}

// the middle of the view, as a point on the screen and on the image
const middle = (page) => page.evaluate(() => {
  const v = $("#scroller").getBoundingClientRect(), b = $("#base").getBoundingClientRect();
  const sx = v.left + v.width / 2, sy = v.top + v.height / 2;
  return { sx, sy, x: (sx - b.left) / st.zoom, y: (sy - b.top) / st.zoom };
});

// the selected card's handle for one end of a measuring line, as a point on the screen
const handle = async (page, k, j) => {
  const b = await page.locator(`#selected .handle[data-k="${k}"][data-j="${j}"]`).boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};
async function drag(page, [x, y], dx, dy) {
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 }); await page.mouse.up();
}
// how far the four ends of a candidate's length and red lines are from one straight line, in pixels
const offAxis = (L) => {
  const [A, B] = L.length, n = Math.hypot(B[0] - A[0], B[1] - A[1]);
  return Math.max(...L.red.map((p) => Math.abs((B[0] - A[0]) * (A[1] - p[1]) - (A[0] - p[0]) * (B[1] - A[1])) / n));
};

async function markAndVote(page) {
  await page.click("#find");
  await page.waitForFunction(() => st.alone && $("#busy").hidden);
  const m = await middle(page);
  await page.mouse.click(m.sx, m.sy, { button: "right" });
  await check(await page.isVisible("#ctx") && (await page.textContent("#ctx button")) === "Add a NoR Here", "a right click on the image offers Add a NoR Here");
  await page.click("#ctx button");
  const added = await page.evaluate(() => ({ sel: st.sel, c: candOf(st.sel) }));
  await check(added.sel === "u1" && Math.hypot(added.c.cx - m.x, added.c.cy - m.y) < 1, `the added NoR is centred where clicked and selected (${added.c.cx}, ${added.c.cy})`);
  await check(await page.$$eval("#overlay .added .glow", (c) => c.length) === 1, "it glows on the image");
  await check(await page.$$eval("#selected .card.added .num.added svg", (c) => c.length) === 1 && await page.$$eval("#selected .handle", (h) => h.length) === 6,
    "its card carries the added icon and six handles");
  // a green end dragged off the axis turns it; the red ends follow onto the new axis
  await drag(page, await handle(page, "length", 1), 0, -40);
  let L = await page.evaluate(() => candOf("u1").lines);
  await check(Math.abs(L.length[1][1] - L.length[0][1]) > 3 && offAxis(L) < 0.05, `a dragged green end turns the axis, the red ends staying on it (${offAxis(L).toFixed(3)} px off)`);
  // a width end sets the width
  const w0 = await page.evaluate(() => candOf("u1").m.width);
  await drag(page, await handle(page, "width", 0), 0, -25);
  const w1 = await page.evaluate(() => candOf("u1").m.width);
  await check(w1 > w0 + 1, `a dragged width end widens the NoR (${w0.toFixed(1)} to ${w1.toFixed(1)} px)`);
  await page.click("#switch");
  await check(await page.$eval("#list .card", (d) => d.dataset.i) === "u1", "the added NoR lists first among the finalists");
  await page.click("#switch");
  await page.click("#selected .verdict .up");
  await check(await page.$$eval("#overlay .added .glow", (c) => c.length) === 0, "approving it stops the glow");
  // a thumbs up on the first candidate, a thumbs down on the third; the second stays undecided
  await page.click("#sel-next"); await page.click("#selected .verdict .up");
  await page.click("#sel-next"); await page.click("#sel-next"); await page.click("#selected .verdict .down");
  // a found candidate's ends drag freely too
  L = await page.evaluate(() => linesOf(candOf(st.sel)));
  if (L) {
    await page.click("#selected .verdict .down"); // back to a finalist, which has handles
    await drag(page, await handle(page, "red", 0), 6, 12);
    L = await page.evaluate(() => linesOf(candOf(st.sel)));
    await check(offAxis(L) < 0.05, `a found candidate's red end dragged off the axis keeps the four ends on one line (${offAxis(L).toFixed(3)} px off)`);
    await page.click("#selected .verdict .down");
  }
  return page.evaluate(() => ({ undecided: st.order.length - st.forced.size }));
}

async function download(page) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dl-truth")]);
  return { name: dl.suggestedFilename(), gt: JSON.parse(fs.readFileSync(await dl.path(), "utf8")) };
}

// ---- an image from this computer ----
{
  const { ctx, page, asked } = await open(false);
  const warn = await page.isVisible("#notice") && (await page.textContent("#notice-text"));
  await check(warn && /local files/.test(warn) && warn.split(/\s+/).length <= 15, `a local image warns its ground truth cannot be sent: "${warn}"`);
  await page.click("#notice-ok");
  const { undecided } = await markAndVote(page);
  const { gt } = await download(page);
  const kinds = gt.labels.map((L) => (L.kind === "missing" ? "missing" : L.decision)).sort().join(",");
  await check(gt.format === "norfinder-ground-truth/2" && kinds === "approved,missing,rejected" && undecided > 0,
    `the file holds only the voted candidates and the mark (${kinds}; ${undecided} undecided left out)`);
  const miss = gt.labels.find((L) => L.kind === "missing");
  await check(miss.label === 1 && miss.radius_px > 0 && miss.origin === "added by user" && miss.width_px > 0 && miss.lines.width,
    `an added NoR is a real NoR with its radius, its origin and its measurements (${miss.radius_px} px, ${miss.width_px.toFixed(1)} px wide)`);
  await check(gt.image.location.source === "local", "the file says the image was local");
  const said = await page.textContent("#notice-text");
  await new Promise((ok) => setTimeout(ok, 300));
  await check(!asked.length && /local files/.test(said), `no issue opens for a local image, and the page says why: "${said}"`);
  await ctx.close();
}

// ---- an image from Google Drive ----
{
  const { ctx, page, asked } = await open(true);
  await check(await page.isHidden("#notice"), "a Drive image shows no warning");
  await markAndVote(page);
  const { name, gt } = await download(page);
  await check(gt.image.location.source === "drive" && gt.image.location.drive_id === DRIVE_ID, "the file names the image's Drive id");
  for (let t = 0; t < 40 && !asked.length; t++) await new Promise((ok) => setTimeout(ok, 50));
  const issue = asked.length === 1 && asked[0];
  await check(issue && issue.host === "github.com" && /\/issues\/new$/.test(issue.pathname) && issue.searchParams.get("labels") === "new-ground-truth"
    && issue.searchParams.get("body").includes(gt.image.sha256) && issue.searchParams.get("body").includes(DRIVE_ID),
    `a new issue opens, labelled new-ground-truth and naming the image (${issue && issue.pathname})`);
  const note = await page.textContent("#notice-text");
  await check(note.includes(name) && /Attach/.test(note) && /Only the candidates you marked/.test(note), `the button says to attach the file: "${note}"`);
  await ctx.close();
}
await done(0);
