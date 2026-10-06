// Drives the page (web/) in headless Chromium with a stand-in worker that answers from ANSWERS (written by
// tests/test_memory.py) and checks the ground-truth workflow: a local image warns that its ground truth cannot
// be sent; a right click marks a missing candidate, listed in the Missing view; the Ground truth button's colour
// follows the verdicts and opens a popup that names what is missing; the file holds only the candidates voted
// on and the missing marks; for an image from Google Drive (a stand-in Drive API) the popup opens a GitHub issue
// labelled for the intake. It also checks the summary mask: lassoed areas, combined by exclusive or, limit the
// summary and the CSVs but not the ground truth. Exits 1 on a failed check, 2 when it cannot run.
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

const gtColour = (page) => page.$eval("#dl-truth", (b) => b.dataset.state);

async function markAndVote(page) {
  await page.click("#find");
  await page.waitForFunction(() => st.alone && $("#busy").hidden);
  await check(await gtColour(page) === "todo", "with no verdict the Ground truth button is red");
  const m = await middle(page);
  await page.mouse.click(m.sx, m.sy, { button: "right" });
  await check(await page.isVisible("#ctx") && (await page.textContent("#ctx button")) === "Mark Missing Candidate", "a right click on the image offers Mark Missing Candidate");
  await page.click("#ctx button");
  const marks = await page.evaluate(() => st.missing);
  await check(marks.length === 1 && Math.hypot(marks[0].x - m.x, marks[0].y - m.y) < 1, `the mark lands where clicked (${JSON.stringify(marks[0])} vs ${m.x.toFixed(1)}, ${m.y.toFixed(1)})`);
  await check(await page.$$eval("#overlay .missing-marks circle", (c) => c.length) === 1, "the mark is drawn on the image");
  // a thumbs up on the first candidate, a thumbs down on the third; the second stays undecided
  await page.click("#sel-next"); await page.click("#selected .verdict .up");
  await page.click("#sel-next"); await page.click("#sel-next"); await page.click("#selected .verdict .down");
  await check(await gtColour(page) === "part", "with some verdicts but a finalist left the button is orange");
  await page.click("#switch"); await page.click("#tab-miss");
  await check(await page.$$eval("#list .card.missing", (c) => c.length) === 1, "the Missing view lists the mark");
  await check(await page.isHidden("#card-menu"), "the Missing view has no crop options");
  await page.click("#switch");
  return page.evaluate(() => ({ undecided: st.order.length - st.forced.size }));
}

// the popup the Ground truth button opens: its text, and the file its Export button downloads
async function popup(page) {
  await page.click("#dl-truth");
  await check(await page.isVisible("#gt-dlg"), "the Ground truth button opens its popup");
  return page.textContent("#gt-problems");
}
async function download(page) {
  const said = await popup(page);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#gt-export")]);
  return { said, name: dl.suggestedFilename(), gt: JSON.parse(fs.readFileSync(await dl.path(), "utf8")) };
}
const csvRows = async (page, id) => {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click(id)]);
  return fs.readFileSync(await dl.path(), "utf8").trim().split("\n").slice(1);
};

// drags a closed lasso through the image points given as fractions of its width and height
async function lasso(page, pts) {
  await page.click("#mask-add");
  const box = await page.evaluate(() => { const b = $("#base").getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; });
  const at = ([fx, fy]) => [box.l + fx * box.w, box.t + fy * box.h];
  await page.mouse.move(...at(pts[0])); await page.mouse.down();
  for (const p of [...pts.slice(1), pts[0]]) await page.mouse.move(...at(p), { steps: 6 });
  await page.mouse.up();
}

async function mask(page) {
  const passes = await page.evaluate(() => st.passes.length);
  await lasso(page, [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]]);
  const fit = await page.evaluate(() => ({ view: st.view, w: st.W * st.zoom, h: st.H * st.zoom, sw: $("#scroller").clientWidth, sh: $("#scroller").clientHeight }));
  await check(fit.view === "image" && fit.w <= fit.sw + 1 && fit.h <= fit.sh + 1, `Add mask shows the whole image (${JSON.stringify(fit)})`);
  // what the summary should count: the finalists whose centre lies in the middle square
  const inside = (page) => page.evaluate(() => st.order.filter((c) => {
    const x = c.cx / st.W, y = c.cy / st.H, mid = x > 0.25 && x < 0.75 && y > 0.25 && y < 0.75, hole = x > 0.4 && x < 0.6 && y > 0.4 && y < 0.6;
    return st.mask.length > 1 ? mid && !hole : mid;
  }).map((c) => [c.i, result(c.i) === null]));
  let want = await inside(page);
  const head = () => page.textContent("#summary > div");
  await check(want.length > 0 && want.length < (await page.evaluate(() => st.order.length)), `the lasso holds some candidates and not others (${want.length})`);
  await check((await head()).startsWith(`${want.filter(([, p]) => p).length} passing NoRs inside the mask`) && passes > want.filter(([, p]) => p).length,
    `the summary counts only the finalists inside the mask: "${await head()}"`);
  await check(await page.isVisible("#mask-clear"), "Clear mask shows while a mask is on");
  await check(await page.$$eval("#overlay .mask-marks .edge:not(.under)", (e) => e.length) === 1 && !(await page.$("#overlay .mask-marks .fill")),
    "one area is drawn as its border only");
  await check((await csvRows(page, "#dl-cands")).length === want.length, "the Candidates CSV holds only the candidates inside the mask");
  // density: the finalists inside over the lassoed square's area, a quarter of the image, per mm²
  const n = want.filter(([, p]) => p).length, sq = await page.evaluate(() => 0.25 * st.W * st.H * st.um * st.um * 1e-6);
  const dens = (await csvRows(page, "#dl-summary")).find((r) => r.startsWith("finalists_per_mm2,"));
  const got = dens && parseFloat(dens.split(",")[1]);
  await check(got && Math.abs(got / (n / sq) - 1) < 0.05, `the Summary CSV gives the finalists' density inside the mask (${got} vs ${(n / sq).toFixed(0)} per mm²)`);
  await check((await page.textContent("#summary .density")).includes(Math.round(got).toString()), `the summary shows the density: "${await page.textContent("#summary .density")}"`);
  // a second lasso inside the first cuts a hole
  await lasso(page, [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]]);
  want = await inside(page);
  await check((await head()).startsWith(`${want.filter(([, p]) => p).length} passing NoRs inside the mask`), `a lasso inside the mask cuts a hole: "${await head()}"`);
  await check(await page.$$eval("#overlay .mask-marks .edge:not(.under)", (e) => e.length) === 2 && !!(await page.$("#overlay .mask-marks .fill")),
    "a shape inside a shape is tinted inside");
  const said = await popup(page);
  await check(/mask/i.test(said), `the Ground truth popup says the mask is not exported: "${said}"`);
  await page.click("#gt-close");
}

// ---- an image from this computer ----
{
  const { ctx, page, asked } = await open(false);
  const warn = await page.isVisible("#notice") && (await page.textContent("#notice-text"));
  await check(warn && /local files/.test(warn) && warn.split(/\s+/).length <= 15, `a local image warns its ground truth cannot be sent: "${warn}"`);
  await page.click("#notice-ok");
  await page.click("#find");
  await page.waitForFunction(() => st.alone && $("#busy").hidden);
  const none = await popup(page);
  await check(/Nothing marked/.test(none) && await page.isDisabled("#gt-export"), `with nothing marked the popup says how to mark and exports nothing: "${none}"`);
  await page.click("#gt-close");
  const { undecided } = await markAndVote(page);
  await mask(page);
  const { said, gt } = await download(page);
  await check(/finalists have no verdict/.test(said), `the popup names the finalists left without a verdict: "${said}"`);
  const kinds = gt.labels.map((L) => (L.kind === "missing" ? "missing" : L.decision)).sort().join(",");
  await check(gt.format === "norfinder-ground-truth/2" && kinds === "approved,missing,rejected" && undecided > 0,
    `the file holds only the voted candidates and the mark, inside and outside the mask (${kinds}; ${undecided} undecided left out)`);
  const miss = gt.labels.find((L) => L.kind === "missing");
  await check(miss.label === 1 && miss.radius_px > 0, `a missing mark is a real NoR with its radius (${miss.radius_px} px)`);
  await check(gt.image.location.source === "local" && !("mask" in gt), "the file says the image was local and holds no mask");
  const issue = await page.$eval("#gt-issue", (b) => ({ off: b.disabled, why: b.title }));
  await new Promise((ok) => setTimeout(ok, 300));
  await check(!asked.length && issue.off && /local files/.test(issue.why), `no issue opens for a local image, and the button says why: "${issue.why}"`);
  await page.click("#gt-close");
  await page.click("#mask-clear");
  await check(await page.evaluate(() => !st.mask.length) && await page.isHidden("#mask-clear") && !(await page.$("#overlay .mask-marks .edge")), "Clear mask removes the mask");
  await page.evaluate(() => st.passes.filter((c) => !st.forced.has(c.i)).forEach((c) => decide(c.i, "approve")));
  await check(await gtColour(page) === "done", "with every finalist voted on the button is green");
  await ctx.close();
}

// ---- an image from Google Drive ----
{
  const { ctx, page, asked } = await open(true);
  await check(await page.isHidden("#notice"), "a Drive image shows no warning");
  await markAndVote(page);
  const { said, name, gt } = await download(page);
  await check(!/mask/i.test(said), `with no mask the popup does not mention one: "${said}"`);
  await check(gt.image.location.source === "drive" && gt.image.location.drive_id === DRIVE_ID, "the file names the image's Drive id");
  await page.click("#gt-issue");
  for (let t = 0; t < 40 && !asked.length; t++) await new Promise((ok) => setTimeout(ok, 50));
  const issue = asked.length === 1 && asked[0];
  await check(issue && issue.host === "github.com" && /\/issues\/new$/.test(issue.pathname) && issue.searchParams.get("labels") === "new-ground-truth"
    && issue.searchParams.get("body").includes(gt.image.sha256) && issue.searchParams.get("body").includes(DRIVE_ID) && issue.searchParams.get("body").includes(name),
    `Open new GitHub issue opens one labelled new-ground-truth, naming the image and the file (${issue && issue.pathname})`);
  const note = await page.textContent("#gt-msg");
  await check(note.includes(name) && /Attach/.test(note), `the popup says to attach the file: "${note}"`);
  await ctx.close();
}
await done(0);
