// Drives the page (web/) in headless Chromium with a stand-in worker that answers from ANSWERS (written by
// tests/test_memory.py) and checks the ground-truth workflow: a local image warns that its ground truth cannot
// be sent; a right click adds a NoR, with measuring lines to correct on its card, first among the finalists and
// glowing on the image until the user decides; the measuring ends drag freely and keep the NoR on one axis; the
// Ground truth button's colour follows the verdicts (red while an added NoR waits for one) and opens a popup that
// names what is missing; the file holds only the candidates voted on, the added NoR once approved; for an image
// from Google Drive (a stand-in Drive API) the popup opens a GitHub issue labelled for the intake. It also checks
// the summary mask: lassoed areas, combined by exclusive or, limit the summary and the CSVs but not the ground
// truth. Exits 1 on a failed check, 2 when it cannot run.
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

// a held button (busy with its action) has finished
const idle = (page) => page.waitForFunction(() => !document.querySelector("button.working"));

// the middle of the view, as a point on the screen and on the image
const middle = (page) => page.evaluate(() => {
  const v = $("#scroller").getBoundingClientRect(), b = $("#base").getBoundingClientRect();
  const sx = v.left + v.width / 2, sy = v.top + v.height / 2;
  return { sx, sy, x: (sx - b.left) / st.zoom, y: (sy - b.top) / st.zoom };
});

// the state the Ground truth button shows: the one icon on display beside its text
const gtColour = (page) => page.$eval("#dl-truth", (b) => {
  const on = [...b.querySelectorAll(".gt-ico svg")].filter((v) => getComputedStyle(v).display !== "none");
  return on.length === 1 ? on[0].getAttribute("class") : `${on.length} icons`;
});
// the selected card's handle for one end of a measuring line, as a point on the screen
const handle = async (page, k, j) => {
  const h = page.locator(`#selected .handle[data-k="${k}"][data-j="${j}"]`);
  await h.scrollIntoViewIfNeeded(); // the right bar may be scrolled down to the downloads
  const b = await h.boundingBox();
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
  await check(await gtColour(page) === "todo", "with no verdict the Ground truth button is red");
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
  await page.click("#switch"); await idle(page);
  await check(await page.$eval("#list .card", (d) => d.dataset.i) === "u1", "the added NoR lists first among the finalists");
  await page.click("#switch"); await idle(page);
  // with another candidate voted on, only the added NoR keeps the button red
  await page.evaluate(() => decide(st.order[0].i, "approve"));
  const waiting = await page.$eval("#dl-truth", (b) => ({ state: b.dataset.state, why: b.title }));
  await page.evaluate(() => decide(st.order[0].i, null));
  await check(waiting.state === "todo" && /Approve or reject the 1 NoR you added/.test(waiting.why), `an added NoR without a verdict keeps the button red: "${waiting.why}"`);
  await page.click("#selected .verdict .up");
  await check(await page.$$eval("#overlay .added .glow", (c) => c.length) === 0, "approving it stops the glow");
  // a thumbs up on the first candidate, a thumbs down on the third; the second stays undecided
  await page.click("#sel-next"); await page.click("#selected .verdict .up");
  await page.click("#sel-next"); await page.click("#sel-next"); await page.click("#selected .verdict .down");
  // a found candidate's red end dragged off the axis only slides along it: the green ends stay put
  L = await page.evaluate(() => linesOf(candOf(st.sel)));
  if (L) {
    await page.click("#selected .verdict .down"); // back to a finalist, which has handles
    await drag(page, await handle(page, "red", 0), 15, 20);
    const M = await page.evaluate(() => linesOf(candOf(st.sel)));
    const moved = Math.hypot(M.red[0][0] - L.red[0][0], M.red[0][1] - L.red[0][1]);
    await check(offAxis(M) < 0.05 && JSON.stringify(M.length) === JSON.stringify(L.length.map((p) => p.map((v) => Math.round(v * 100) / 100))) && moved > 0.5,
      `a red end dragged off the axis slides along it (${moved.toFixed(1)} px), the green ends unmoved (${offAxis(M).toFixed(3)} px off)`);
    await page.click("#selected .verdict .down");
  }
  await check(await gtColour(page) === "part", "with some verdicts but a finalist left the button is orange");
  return page.evaluate(() => ({ undecided: st.order.length - st.forced.size }));
}

// the popup the Ground truth button opens: its text, and the file its Export button downloads
async function popup(page) {
  await page.click("#dl-truth");
  await check(await page.isVisible("#gt-dlg"), "the Ground truth button opens its popup");
  // a checklist of every issue, the resolved ones crossed out: what is still open
  const items = await page.$$eval("#gt-problems li", (li) => li.map((l) => ({ ok: l.classList.contains("ok"), struck: getComputedStyle(l.querySelector("span")).textDecorationLine, text: l.textContent })));
  const has = await page.evaluate(() => ({ added: st.added.length > 0, mask: st.mask.length > 0 }));
  await check(items.length === 3 + has.added + has.mask && items.every((t) => (t.struck === "line-through") === t.ok),
    `the popup lists every issue that applies, crossing out the resolved ones (${items.filter((t) => t.ok).length} of ${items.length})`);
  const line = (re) => items.find((t) => re.test(t.text));
  await check(!!line(/you added/) === has.added && !!line(/mask/) === has.mask && (!has.mask || !line(/mask/).ok),
    `the added NoRs and the mask are listed only when there are some, and the mask never as done (${items.map((t) => t.text).join(" | ")})`);
  return items.filter((t) => !t.ok).map((t) => t.text).join(" | ");
}
// which of the popup's buttons is blue: the next step
const blue = (page) => page.$$eval("#gt-dlg button.primary", (b) => b.map((x) => x.id).join());
async function download(page) {
  const said = await popup(page);
  await check(await blue(page) === "gt-export", "the popup opens with Export file blue");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#gt-export")]);
  return { said, name: dl.suggestedFilename(), gt: JSON.parse(fs.readFileSync(await dl.path(), "utf8")), after: await blue(page) };
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
  const inside = (page) => page.evaluate(() => [...addedCands(), ...st.order].filter((c) => {
    const x = c.cx / st.W, y = c.cy / st.H, mid = x > 0.25 && x < 0.75 && y > 0.25 && y < 0.75, hole = x > 0.4 && x < 0.6 && y > 0.4 && y < 0.6;
    return st.mask.length > 1 ? mid && !hole : mid;
  }).map((c) => [c.i, result(c.i) === null]));
  let want = await inside(page);
  const head = () => page.textContent("#summary > div");
  await check(want.length > 0 && want.length < (await page.evaluate(() => st.order.length)), `the lasso holds some candidates and not others (${want.length})`);
  await check((await head()).startsWith(`${want.filter(([, p]) => p).length} NoRs inside the mask`) && passes > want.filter(([, p]) => p).length,
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
  await check((await head()).startsWith(`${want.filter(([, p]) => p).length} NoRs inside the mask`), `a lasso inside the mask cuts a hole: "${await head()}"`);
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
  const csvAt = await page.evaluate(() => {
    const box = $("#summary-box").getBoundingClientRect(), sum = $("#summary").getBoundingClientRect();
    return ["#dl-cands", "#dl-summary"].map((id) => { const b = $(id).getBoundingClientRect(); return b.top >= sum.bottom && b.bottom <= box.bottom; });
  });
  await check(!/Rejected/.test(await page.textContent("#summary")), "the summary lists no filter reasons");
  const hists = await page.evaluate(() => {
    const ss = summaryRows(st.passes.filter(inMask)).map(([, s]) => s);
    return [...document.querySelectorAll("#summary .hist")].map((h, k) => {
      const line = h.querySelector(".mean"), x = +line.getAttribute("x1"), b = h.querySelectorAll(".bar");
      const at = (i) => +b[i].getAttribute("x"), lo = at(0), hi = at(b.length - 1) + +b[0].getAttribute("width");
      return { said: h.firstElementChild.textContent.includes(fmt(ss[k].mean)), where: Math.abs((x - lo) / (hi - lo) - (ss[k].mean - ss[k].min) / (ss[k].max - ss[k].min)) < 0.02,
        axis: [...h.querySelectorAll("text")].some((t) => t.textContent === String(Math.max(...[...b].map((r) => +r.textContent)))) };
    });
  });
  await check(!(await page.$("#summary table")) && hists.length >= 3 && hists.every((h) => h.said && h.where && h.axis),
    `each histogram names its mean, draws it where it falls and has a count axis, and no table repeats them (${JSON.stringify(hists)})`);
  await check(csvAt.every(Boolean), `both CSV buttons sit at the bottom of the Summary box (${csvAt})`);
  const none = await popup(page);
  await check(/Vote on at least one/.test(none) && /thumbs/.test(await page.textContent("#gt-msg")) && await page.isDisabled("#gt-export"), `with nothing marked the popup says how to mark and exports nothing: "${none}"`);
  await page.click("#gt-close");
  const { undecided } = await markAndVote(page);
  await mask(page);
  const { said, gt, after } = await download(page);
  await check(after === "gt-close", `after the export of a local image, which cannot be sent, Close turns blue (${after})`);
  await check(/have no vote/.test(said), `the popup names the finalists left without a verdict: "${said}"`);
  const kinds = gt.labels.map((L) => (L.kind === "missing" ? "missing" : L.decision)).sort().join(",");
  await check(gt.format === "norfinder-ground-truth/2" && kinds === "approved,missing,rejected" && undecided > 0,
    `the file holds only the voted candidates and the mark, inside and outside the mask (${kinds}; ${undecided} undecided left out)`);
  const miss = gt.labels.find((L) => L.kind === "missing");
  await check(miss.label === 1 && miss.radius_px > 0 && miss.origin === "added by user" && miss.width_px > 0 && miss.lines.width,
    `an added NoR is a real NoR with its radius, its origin and its measurements (${miss.radius_px} px, ${miss.width_px.toFixed(1)} px wide)`);
  // one number per candidate, finalists and rejected alike, the added NoR after the found ones; the image,
  // the cards, the CSV and the file all name a candidate by it
  const nums = await page.evaluate(() => {
    const cs = [...addedCands(), ...st.order], on = (c) => $(`#overlay g[data-i="${c.i}"] text`).firstChild.textContent;
    return { found: st.order.length, image: cs.map(on), cards: cs.map((c) => [on(c), card(c, "list").querySelector(".num").textContent]),
      at: Object.fromEntries(cs.map((c) => [on(c), [c.cx, c.cy]])) };
  });
  const all = Array.from({ length: nums.found + 1 }, (_, k) => String(k + 1));
  await check(JSON.stringify([...nums.image].sort()) === JSON.stringify([...all].sort()), `the image numbers every candidate once, 1 to ${nums.found}, the added NoR ${nums.found + 1}`);
  await check(nums.cards.every(([n, shown]) => shown === "#" + n), "each card shows its candidate's number");
  await check(miss.id === nums.found + 1 && gt.labels.every((L) => nums.at[L.id] && Math.hypot(nums.at[L.id][0] - L.x, nums.at[L.id][1] - L.y) < 1e-6),
    `the file names each candidate by its number on the image, the added NoR by ${miss.id}`);
  await check(gt.image.location.source === "local", "the file says the image was local");
  await check(!("mask" in gt), "the file holds no mask");
  const issue = await page.$eval("#gt-issue", (b) => ({ off: b.disabled, why: b.title }));
  await new Promise((ok) => setTimeout(ok, 300));
  await check(!asked.length && issue.off && /local files/.test(issue.why), `no issue opens for a local image, and the button says why: "${issue.why}"`);
  await page.click("#gt-close");
  await page.click("#mask-clear");
  await check(await page.evaluate(() => !st.mask.length) && await page.isHidden("#mask-clear") && !(await page.$("#overlay .mask-marks .edge")), "Clear mask removes the mask");
  const ns = (await csvRows(page, "#dl-cands")).map((r) => r.split(",")[0]);
  await check(ns.length === all.length && new Set(ns).size === ns.length && ns.every((n) => all.includes(n)), "the Candidates CSV names each candidate by its number");
  await page.evaluate(() => st.passes.filter((c) => !c.added && !st.forced.has(c.i)).forEach((c) => decide(c.i, "approve")));
  await check(await gtColour(page) === "done", "with every finalist voted on the button is green");
  await ctx.close();
}

// ---- an image from Google Drive ----
{
  const { ctx, page, asked } = await open(true);
  await check(await page.isHidden("#notice"), "a Drive image shows no warning");
  await markAndVote(page);
  const { said, name, gt, after } = await download(page);
  await check(after === "gt-issue", `after the export Open new GitHub issue turns blue (${after})`);
  await check(!/mask/i.test(said), `with no mask the mask item is crossed out: "${said}"`);
  await check(gt.image.location.source === "drive" && gt.image.location.drive_id === DRIVE_ID, "the file names the image's Drive id");
  await page.click("#gt-issue");
  for (let t = 0; t < 40 && !asked.length; t++) await new Promise((ok) => setTimeout(ok, 50));
  const issue = asked.length === 1 && asked[0];
  await check(issue && issue.host === "github.com" && /\/issues\/new$/.test(issue.pathname) && issue.searchParams.get("labels") === "new-ground-truth"
    && issue.searchParams.get("body").includes(gt.image.sha256) && issue.searchParams.get("body").includes(DRIVE_ID) && issue.searchParams.get("body").includes(name),
    `Open new GitHub issue opens one labelled new-ground-truth, naming the image and the file (${issue && issue.pathname})`);
  await check(await blue(page) === "gt-close", `after the issue opens Close turns blue (${await blue(page)})`);
  const note = await page.textContent("#gt-msg");
  await check(note.includes(name) && /Attach/.test(note), `the popup says to attach the file: "${note}"`);
  await ctx.close();
}
await done(0);
