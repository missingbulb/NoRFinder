// Drives the page (web/) in headless Chromium with a stand-in worker that answers from ANSWERS (written by
// tests/test_memory.py), each answer late as on a slow computer, and checks R8's kindness to slow computers:
// a button whose action takes a while is held, with a spinner, until the action is done; the low-memory popup
// shows on a computer reporting little memory and not on one with plenty, stays away once the user asks, and
// shows whenever the page runs out of memory; the status bar shows the memory in use. Optional SHOTS: a directory for screenshots.
// Exits 1 on a failed check, 2 when it cannot run.
//   node tests/slow_machine_page_driver.mjs ANSWERS IMAGE [SHOTS]
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
const [answers, image, shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LATE = 600; // ms each answer takes

const STAND_IN = `
const A = await (await fetch("answers/answers.json")).json();
const bin = async (n) => new Uint8Array(await (await fetch("answers/" + n)).arrayBuffer());
const late = () => new Promise((ok) => setTimeout(ok, ${LATE}));
let finder, runs = 0;
postMessage({ type: "ready", finders: A.finders, about: A.about, secs: 0, heap: 300 * 2 ** 20, mem: [["Python", 31 * 2 ** 20], ["numpy", 20 * 2 ** 20], ["our code", 2 ** 20]] });
onmessage = async ({ data: m }) => {
  await late();
  if (m.type === "open") {
    const images = await bin("images.bin");
    postMessage({ type: "opened", H: A.H, W: A.W, um: A.um, images, secs: 0 }, [images.buffer]);
  } else if (m.type === "detect") {
    if (++runs === 3) return postMessage({ type: "error", text: "MemoryError" });
    finder = m.finder; const seg = await bin("seg_" + finder + ".bin");
    postMessage({ type: "detected", meta: A.detected[finder], seg, secs: 0 }, [seg.buffer]);
  } else if (m.type === "refilter") {
    postMessage({ type: "filtered", ...A.filtered[finder][0], seq: m.seq, ms: 0 });
  }
};`;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  const f = u.startsWith("/web/answers/") ? path.join(answers, u.slice("/web/answers/".length)) : path.join(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch();
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what) => { if (!ok) { console.error("FAILED: " + what); await done(1); } console.log("ok: " + what); };
const shot = async (page, name, sel) => { if (shots) await (sel ? page.locator(sel) : page).screenshot({ path: path.join(shots, name + ".png") }); };

async function open(gb) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
  await ctx.addInitScript((gb) => {
    delete Navigator.prototype.serviceWorker;
    Object.defineProperty(Navigator.prototype, "deviceMemory", { get: () => gb, configurable: true });
  }, gb);
  const page = await ctx.newPage();
  page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/index.html");
  await page.waitForFunction(() => !document.querySelector("#finder").disabled);
  return { ctx, page };
}
const held = (page, id) => page.evaluate((id) => { const b = $(id); return b.disabled && b.classList.contains("working"); }, id);
const free = (page, id) => page.waitForFunction((id) => !$(id).classList.contains("working") && !$(id).disabled, id);

// ---- plenty of memory: no popup; slow buttons are held until their action is done ----
{
  const { ctx, page } = await open(8);
  await check(!(await page.evaluate(() => $("#memory-dlg").open)), "no memory popup on a computer with 8 GB");
  const mem = await page.textContent("#sb-memory");
  await check(/^Memory Python 31 · numpy 20 · our code 1( · page \d+)? MB$/.test(mem), `the status bar shows what each thing loaded holds: "${mem}"`);
  await shot(page, "status_memory", "#statusbar");
  await page.setInputFiles("#file", image);
  await page.waitForFunction(() => $("#load-main").classList.contains("working"));
  await check(await held(page, "#load-main") && !(await page.evaluate(() => !!st.img)), "Load is held while the image opens");
  await free(page, "#load-main");
  await check(await page.evaluate(() => !!st.img), "Load is free again once the image is open");
  await page.click("#find");
  await check(await held(page, "#find"), "Find Candidates is held at once, with its spinner");
  await shot(page, "find_working", ".row:has(#find)");
  await page.waitForTimeout(LATE * 1.3);
  await check(await held(page, "#find"), "and stays held while the finder runs and the first filtering follows");
  await page.waitForFunction(() => !$("#find").classList.contains("working"), null, { timeout: 4 * LATE + 2000 });
  await check(await page.evaluate(() => st.meta && !st.inflight), "it lets go once the candidates are drawn");
  const preset = "#presets button[data-preset=precise]";
  await page.click(preset);
  await check(await held(page, preset), "a filter preset is held while the filters run again");
  await free(page, preset);
  await page.click("#switch");
  await free(page, "#switch");
  await check(await page.evaluate(() => st.view === "items"), "Item View switches views and lets go");
  await ctx.close();
}

// ---- little memory: the popup, until the user asks not to see it ----
{
  const { ctx, page } = await open(2);
  const why = await page.evaluate(() => $("#memory-dlg").open && $("#memory-why").textContent);
  await check(why && /2 GB/.test(why) && /close other tabs/.test(why), `a computer with 2 GB gets the popup: "${why}"`);
  await shot(page, "memory_popup");
  await shot(page, "memory_popup_box", "#memory-dlg");
  await page.check("#memory-off"); await page.click("#memory-dlg button.primary");
  await page.reload(); await page.waitForFunction(() => !document.querySelector("#finder").disabled);
  await check(!(await page.evaluate(() => $("#memory-dlg").open)), "after Don't show this again, it does not come back");
  // running out of memory shows it anyway, without the opt-out
  await page.setInputFiles("#file", image); await free(page, "#load-main");
  for (let k = 0; k < 3; k++) { await page.click("#find"); await page.waitForFunction(() => !$("#find").classList.contains("working"), null, { timeout: 4 * LATE + 2000 }); }
  const oom = await page.evaluate(() => $("#memory-dlg").open && $("#memory-never").hidden && $("#memory-why").textContent);
  await check(oom && /ran out of memory/.test(oom), `running out of memory shows it, whatever the user chose: "${oom}"`);
  await check(await page.evaluate(() => !$("#find").disabled), "Find Candidates is free again after the failure");
  await ctx.close();
}
await done(0);
