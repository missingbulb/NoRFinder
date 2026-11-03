// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from
// ANSWERS (tests/test_study_runs.py), and checks the status bar: the study's stage first, a traffic light whose
// popup lists the stages; breadcrumbs of the steps done and the one to do now, which shines with its button and
// nothing else does; a popup on each crumb saying what was done; the shining crumb bringing its button into view
// and pressing it; a new image starting over; a PreGT study with no Submit GT and its ground-truth button hidden;
// the second view's switch reading Tasks with what is left while the study makes ground truth, Items otherwise;
// a Published study dropping its postprocessing and Submit GT; switching study in place bringing its own stage and steps; the disk, memory, network and CPU as grey icons and
// numbers, each opening its own tab of one dialog, each rolling its changed characters to a new value, the CPU and
// the network flashing on a sharp rise and rolling nothing when reduced motion is asked for; a separator between every two items; no question-mark pointer; the four folded into one icon at first, unfolded by hovering it, by going offline,
// a CPU over 50% or a network over 250 KB/s for 5 s or a tab over 1 GB, at once with animations off, folding back 5 to 10 s after, or set always open or hidden.
// Optional SHOTS: a directory for screenshots. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/status_bar_driver.mjs ANSWERS IMAGE.png STUDIES [SHOTS]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { helpTip, anyHelp } from "./help_tip.mjs";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { repoFile } from "./repo_file.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [answers, image, studies, shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MB = 2 ** 20;
const BIG = 6 * MB; // a download fast enough to flash the network

// the fixture's answers, each saying how much memory Python holds and how long it has worked as the real worker
// does; memory: what Python holds in use after a collection. A count keeps Python working for WORK ms, and grows
// Python's memory by 10 MB.
const WORK = 1500;
const STAND_IN = `
const A = await (await fetch("answers.json")).json();
const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
let ms = 0, heap = ${60 * MB};
const mem = () => ({ heap, files: ${20 * MB}, busy: { ms, since: null } });
const work = (n) => { postMessage({ type: "progress", text: "Counting…", ...mem(), busy: { ms, since: Date.now() } }); const t = Date.now(); while (Date.now() - t < n); ms += n; heap += ${10 * MB}; };
const first = new URL(location.href).searchParams.get("study");
if (A.ready[first]) postMessage({ type: "ready", info: A.ready[first], ...mem() });
onmessage = ({ data: m }) => {
  if (m.type === "study") postMessage({ type: "ready", info: A.ready[m.id], ...mem() });
  else if (m.type === "open") { const images = bytes(A.images); postMessage({ type: "opened", meta: A.opened, images, ...mem() }, [images.buffer]); }
  else if (m.type === "call") { work(${WORK}); const b = bytes(A.mask); postMessage({ type: "result", action: m.action, meta: A.count, bytes: b, echo: m.echo, ...mem() }, [b.buffer]); }
  else if (m.type === "memory") postMessage({ type: "memory", used: ${25 * MB}, objects: 1000, ...mem() });
};`;
let stage = null; // the fixture's stage as served; null: as committed
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  if (u === "/studies/fixture/study.json" && stage) {
    r.writeHead(200, { "content-type": "application/json" });
    return r.end(JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(repo, u))), stage }));
  }
  if (u.startsWith("/some/")) { r.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "no-store" }); return r.end(Buffer.alloc(Number(u.slice(6)) * 1024)); }
  if (u === "/big") { r.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "no-store" }); return r.end(Buffer.alloc(BIG)); }
  if (u === "/web/vendor/wheels.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end("[]"); }
  const f = u === "/web/answers.json" ? answers : u === "/web/studies.json" ? studies : repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw[process.env.PW_ENGINE || "chromium"].launch();
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what, seen) => { if (!ok) { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); } console.log("ok: " + what); };
const shot = async (page, name) => { if (shots) await page.locator("#statusbar").screenshot({ path: path.join(shots, name + ".png") }); };

// mode: the resources block's setting the visit starts with, unless the page has kept another; none: the page's own
async function open(study, mode) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  if (mode) await ctx.addInitScript((m) => { if (localStorage.getItem("nor-resources") === null) localStorage.setItem("nor-resources", JSON.stringify(m)); }, mode);
  const page = await ctx.newPage();
  page.on("pageerror", async (e) => { console.error("page error: " + e.message); await done(1); });
  page.setDefaultTimeout(10000);
  // what each of the four numbers did: rolled (each changed character wrapped to roll, the rolled ones' animations
  // as computed), and flashed
  await page.addInitScript(() => {
    window.seen = {};
    addEventListener("DOMContentLoaded", () => {
      for (const id of ["sb-disk", "sb-memory", "sb-net", "sb-cpu"]) {
        const e = document.getElementById(id), s = (window.seen[id] = { rolled: 0, anim: [], spiked: false });
        new MutationObserver(() => {
          const r = e.querySelectorAll(".v .roll > span");
          if (r.length) { s.rolled++; s.anim.push(getComputedStyle(r[0]).animationName); s.text = e.querySelector(".v").textContent; }
          if (e.classList.contains("spike")) s.spiked = true;
        }).observe(e, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
      }
    });
  });
  await page.goto(origin + "/web/" + (study || ""));
  await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));
  return { ctx, page };
}
// the crumbs on show, the one to do now marked *, and every element that shines
const bar = (page) => page.evaluate(() => ({
  crumbs: [...document.querySelectorAll("#sb-steps .crumb")].map((c) => c.textContent + (c.classList.contains("now") ? "*" : "")),
  shining: [...document.querySelectorAll(".shine")].map((e) => "#" + e.id).sort(),
}));
const steps = async (page, want, shining) => {
  await page.waitForFunction((w) => [...document.querySelectorAll("#sb-steps .crumb")].map((c) => c.textContent + (c.classList.contains("now") ? "*" : "")).join() === w, want.join()).catch(() => {});
  const b = await bar(page);
  await check(b.crumbs.join() === want.join() && b.shining.join() === shining.join(), `crumbs ${want.join(" › ")}, shining ${shining.join() || "nothing"}`, b);
};
// what hovering a crumb says, shown above the crumb and gone once the pointer leaves; focusing it says the same
const tip = async (page, name) => {
  const sel = `#sb-${await page.evaluate((n) => [...document.querySelectorAll("#sb-steps .crumb")].find((c) => c.textContent === n).id.slice(3), name)}`;
  const t = await helpTip(page, sel);
  await check(t.side === "above", `${name}'s help shows above it`, t);
  await page.mouse.move(700, 300);
  await check(!(await anyHelp(page)), `and goes when the pointer leaves`);
  const f = await helpTip(page, sel, { focus: true });
  await check(f.text === t.text && f.side === "above", `focusing ${name} shows the same help`, f);
  await page.evaluate(() => document.activeElement.blur());
  return t.text || "";
};
// the stage: a traffic light lit in its colour, with no words
const stageIs = async (page, stage, light) => {
  const s = await page.evaluate(() => {
    const e = document.querySelector("#sb-stage"), lit = e.querySelector(".lit");
    return { stage: e.dataset.stage, text: e.textContent.trim(), lit: lit && lit.dataset.light, svg: !!e.querySelector("svg") };
  });
  await check(s.stage === stage && s.svg && s.lit === light && !s.text, `the stage, ${stage}, is a traffic light lit ${light}`, s);
};
// the one dialog, open on a tab
const tabIs = async (page, tab) => {
  await page.waitForFunction((t) => document.querySelector("#usage-dlg").open && document.querySelector(`#usage-dlg [role=tab][data-tab=${t}]`).getAttribute("aria-selected") === "true"
    && !document.querySelector(`#usage-dlg [role=tabpanel][data-tab=${t}]`).hidden, tab);
  const title = await page.evaluate(() => { const d = document.querySelector("#usage-dlg"), h = document.getElementById(d.getAttribute("aria-labelledby")); return h && d.contains(h) && h.textContent; });
  await check(title === "Resource Usage", `the dialog is open on ${tab}, titled Resource Usage`, title);
};
// the shell's switch to the item view: first in the toolbar, what it reads, whether it can be pressed
const switchIs = async (page, want, on, what) => {
  await page.waitForFunction((w) => document.querySelector("#switch")?.textContent.replace(/\s+/g, " ").trim() === w, want).catch(() => {});
  const s = await page.evaluate(() => { const b = document.querySelector("#switch"); return b && { text: b.textContent.replace(/\s+/g, " ").trim(), on: !b.disabled, shown: !!b.offsetParent, first: b === document.querySelector(".toolbar").firstElementChild }; });
  await check(s && s.text === want && s.on === on && s.shown && s.first, `the switch, first in the toolbar, reads "${want}"${on ? "" : ", off"}${what ? ": " + what : ""}`, s);
};
const loadImage = async (page) => { await page.setInputFiles("#file", image); await page.waitForFunction(() => !document.querySelector("#fx-count").disabled); };
const count = async (page) => { await page.click("#fx-count"); await page.waitForFunction(() => /pixels/.test(document.querySelector("#fx-result").textContent)); };

// ---- a GT study: Load image, its Count, Submit GT; the resources block always open, as it was before it could fold ----
{
  const { ctx, page } = await open("fixture", "open");
  await stageIs(page, "GT", "yellow");
  // hovering the stage lists the stages, its own highlighted and the ones before it crossed out
  await page.hover("#sb-stage");
  await page.waitForFunction(() => document.querySelector("#stage-pop").matches(":popover-open"));
  const stages = await page.evaluate(() => [...document.querySelectorAll("#stage-pop li")].map((li) => ({
    name: li.querySelector(".name").textContent, now: li.classList.contains("now"), crossed: getComputedStyle(li.querySelector(".name")).textDecorationLine,
  })));
  await check(stages.map((x) => x.name).join() === "PreGT,GT,PostGT,Published" && stages[1].now && stages.filter((x) => x.now).length === 1,
    "the stage's popup lists PreGT, GT, PostGT and Published, GT highlighted", stages);
  await check(stages[0].crossed === "line-through" && stages.slice(1).every((x) => x.crossed === "none"), "the stage before it is crossed out", stages);
  await check(/next|move on/i.test(await page.textContent("#stage-pop")), "and says what moves the study on", await page.textContent("#stage-pop"));
  if (shots) await page.screenshot({ path: path.join(shots, "0-stages.png") });
  await page.mouse.move(700, 300);
  await page.waitForFunction(() => !document.querySelector("#stage-pop").matches(":popover-open"));
  await steps(page, ["Load image*"], ["#load-main", "#sb-load"]);
  await shot(page, "1-start");
  // the right side: from the edge, version, CPU, network, memory, disk; each but the version a grey icon and its number
  const ITEMS = ["#sb-disk", "#sb-memory", "#sb-net", "#sb-cpu", "#sb-version"];
  await page.waitForFunction(() => /\d/.test(document.querySelector("#sb-disk").textContent));
  const right = await page.evaluate((ids) => ids.map((id) => {
    const e = document.querySelector(id), cs = getComputedStyle(e), svg = e.querySelector("svg");
    const grey = svg && getComputedStyle(svg).color.match(/\d+/g).slice(0, 3).map(Number);
    return { id, right: e.getBoundingClientRect().right, box: cs.borderTopWidth + " " + cs.backgroundColor, text: e.textContent, grey: grey && Math.max(...grey) - Math.min(...grey) };
  }), ITEMS);
  await check(right.every((e, k) => k === 0 || right[k - 1].right < e.right) && right[4].right > 1300, "disk, memory, network, CPU and version sit at the right, version at the edge", right);
  await check(right.every((e) => e.box === "0px rgba(0, 0, 0, 0)"), "none has a box", right);
  await check(right.slice(0, 4).every((e) => e.grey !== null && e.grey <= 12), "the four before the version each have a grey icon", right);
  await check(/^\d+(\.\d)? (KB|MB|GB)$/.test(right[0].text), 'the disk reads "1.4 MB", with no word', right[0].text);
  await check(/^\d+ MB$/.test(right[1].text), 'the memory reads "253 MB", with no word', right[1].text);
  await check(/^\d+(\.\d)? (KB|MB|GB)\/s$/.test(right[2].text), 'the network reads "1.2 MB/s"', right[2].text);
  await check(/^\d+%$/.test(right[3].text), 'the CPU reads "12%"', right[3].text);
  const left = await page.evaluate(() => ["#sb-stage", "#sb-steps", "#status"].map((id) => document.querySelector(id).getBoundingClientRect().left));
  await check(left[0] < 40 && left[0] < left[1] && left[1] < left[2], "the stage, then the crumbs, then what the page is doing, from the left", left);
  // a mild bar between every two items on show
  const seps = await page.evaluate(() => {
    // the resources block counts as the items within it
    const shown = [...document.querySelectorAll("#statusbar > *")].flatMap((e) => (e.id === "sb-res" ? [...e.querySelectorAll("#sb-res-items > *, #sb-res-icon")] : [e]))
      .filter((e) => e.offsetWidth && !e.matches(".grow, #whats-new"));
    return shown.slice(1).map((e, k) => {
      const a = shown[k], b = e;
      return [a.id, b.id, getComputedStyle(a).borderRightWidth === "1px" || getComputedStyle(b).borderLeftWidth === "1px"];
    });
  });
  await check(seps.length >= 7 && seps.every((x) => x[2]), "a vertical bar between every two of the eight items on show", seps);
  const pointers = await page.evaluate(() => [...document.querySelectorAll("#statusbar, #statusbar *")].map((e) => getComputedStyle(e).cursor).filter((c) => c === "help"));
  await check(!pointers.length, "nothing in the status bar shows a question-mark pointer", pointers);

  // the shining crumb is a way to its button: Load image opens the file chooser, as Load does
  const chooser = page.waitForEvent("filechooser", { timeout: 3000 }).catch(() => null);
  await page.click("#sb-load");
  await check(!!(await chooser), "clicking the shining Load image presses Load");

  await switchIs(page, "Tasks", false, "a GT study's item view is its tasks, off until there are some");
  await loadImage(page);
  await steps(page, ["Load image", "Count*"], ["#fx-count", "#sb-count"]);
  await check((await tip(page, "Load image")).includes("squares.png"), "Load image's popup names the image");
  // Count's box folded and scrolled away: its crumb unfolds it, scrolls to Count and presses it
  await page.evaluate(() => { document.querySelector("#fx-box").classList.add("folded"); document.querySelector("#left").scrollTop = 1e6; });
  await page.click("#sb-count");
  const shown = await page.evaluate(() => {
    const b = document.querySelector("#fx-count"), r = b.getBoundingClientRect(), l = document.querySelector("#left").getBoundingClientRect();
    return { unfolded: !document.querySelector("#fx-box").classList.contains("folded"), inView: r.height > 0 && r.top >= l.top && r.bottom <= l.bottom };
  });
  await check(shown.unfolded && shown.inView, "the shining crumb unfolds Count's box and brings Count into view", shown);
  await page.waitForFunction(() => /pixels/.test(document.querySelector("#fx-result").textContent));
  await check(true, "and presses Count");
  // Python worked about WORK ms of the last two seconds
  await page.waitForFunction(() => parseInt(document.querySelector("#sb-cpu").textContent) >= 30, null, { timeout: 3000 }).catch(() => {});
  await check(parseInt(await page.textContent("#sb-cpu")) >= 30, "the CPU shows Python at work", await page.textContent("#sb-cpu"));
  await page.waitForFunction(() => window.seen["sb-cpu"].spiked, null, { timeout: 3000 }).catch(() => {});
  const cpuSeen = await page.evaluate(() => ({ ...window.seen["sb-cpu"], color: getComputedStyle(document.querySelector("#sb-cpu svg")).color,
    warn: getComputedStyle(document.documentElement).getPropertyValue("--warn") }));
  await check(cpuSeen.spiked, "the CPU's sharp rise flashes it", cpuSeen);
  await check(cpuSeen.rolled > 0 && cpuSeen.anim.every((a) => a === "roll") && /^\d+%$/.test(cpuSeen.text), "the CPU rolls its changed digits, reading its number all the while", cpuSeen);
  await page.waitForFunction(() => !document.querySelector("#sb-cpu").classList.contains("spike"), null, { timeout: 6000 }).catch(() => {});
  await check(!(await page.evaluate(() => document.querySelector("#sb-cpu").classList.contains("spike"))), "and the flash fades after a few seconds");
  await steps(page, ["Load image", "Count", "Submit GT*"], ["#fx-truth", "#sb-submit"]);
  await check((await tip(page, "Count")).includes("400"), "the study's step says what it did");
  // the tasks: how many are left on the switch, the item view behind it, and none left once done
  await switchIs(page, "Tasks 1 left", true, "with how many are left");
  await check(await page.evaluate(() => document.querySelector("#fx-truth").offsetParent === null), "the image view has no submit button");
  await page.click("#switch");
  // the bar heading the tasks: how many are done, and the submit button at its end
  const bar = async () => page.evaluate(() => { const b = document.querySelector("#tasks-bar"), m = b.querySelector("meter"), t = document.querySelector("#fx-task");
    return { shown: !!b.offsetParent, text: b.querySelector(".done").textContent, meter: m && [m.value, m.max], last: b.lastElementChild.previousElementSibling?.id || b.lastElementChild.id,
      inBar: b.contains(document.querySelector("#fx-truth")) && !!document.querySelector("#fx-truth").offsetParent, open: t.classList.contains("task-open"), mark: getComputedStyle(t).borderLeftWidth }; });
  const b0 = await bar();
  await check(b0.shown && b0.text === "0 of 1 done" && b0.meter.join() === "0,1" && b0.inBar && b0.last === "fx-truth", "the tasks' bar says 0 of 1 done, with Submit at its end", b0);
  await check(b0.open && b0.mark === "3px", "the open task's card is marked", b0);
  const inItems = await page.evaluate(() => ({ items: !document.querySelector("#items-view").hidden, image: !document.querySelector("#image-view").hidden, view: document.querySelector("#view").dataset.view }));
  await check(inItems.items && !inItems.image && inItems.view === "items", "pressing it shows the item view", inItems);
  await switchIs(page, "Image", true, "and then reads Image");
  await page.check("#fx-done");
  const b1 = await bar();
  await check(b1.text === "1 of 1 done" && b1.meter.join() === "1,1" && !b1.open && b1.mark !== "3px", "a done task counts and loses its mark", b1);
  await page.click("#switch");
  await switchIs(page, "Tasks done", true, "once no task is left");
  await check(await page.evaluate(() => !document.querySelector("#image-view").hidden && document.querySelector("#items-view").hidden), "and the image is back");
  await shot(page, "2-submit");
  // from the image view, the shining Submit GT crumb opens the tasks and presses Submit
  await page.click("#sb-submit");
  await page.waitForFunction(() => document.querySelector("#gt-dlg").open);
  await check(await page.evaluate(() => !document.querySelector("#items-view").hidden), "the Submit GT crumb opens the tasks and presses Submit");
  const download = page.waitForEvent("download");
  await page.click("#gt-export");
  await download;
  await page.click("#gt-close");
  await steps(page, ["Load image", "Count", "Submit GT"], []);
  await check(/squares_gt\.json/.test(await tip(page, "Submit GT")), "Submit GT says what was exported");
  await shot(page, "3-done");
  // another image starts over
  await loadImage(page);
  await steps(page, ["Load image", "Count*"], ["#fx-count", "#sb-count"]);

  // the memory opens its tab of the one dialog, with Run GC and no essay on Python's memory
  await page.click("#sb-memory");
  await tabIs(page, "memory");
  const rows = await page.evaluate(() => [...document.querySelectorAll("#ram-list .entry .name")].map((n) => n.textContent));
  await check(["Python", "Python's files", "The image"].every((n) => rows.includes(n)), "the Memory tab lists what holds it", rows);
  await check(!/reserved for its next use/.test(await page.textContent("#usage-dlg")), "with no explanation of Python's memory");
  await page.click("#ram-gc");
  await page.waitForFunction(() => /in use/.test(document.querySelector("#ram-msg").textContent));
  await check(/25 MB in use of \d+ MB/.test(await page.textContent("#ram-msg")), "Run GC says what Python holds in use against its reserve", await page.textContent("#ram-msg"));
  if (shots) await page.screenshot({ path: path.join(shots, "4-memory.png") });
  // the tabs look alike: the total, then rows of a name, what it is and a size, in the same type
  const look = (tab) => page.evaluate((t) => {
    const p = document.querySelector(`#usage-dlg [role=tabpanel][data-tab=${t}]`), cs = (x) => x && getComputedStyle(x);
    return { total: !!p.querySelector(".total")?.textContent, name: cs(p.querySelector(".entry .name")).fontSize, size: cs(p.querySelector(".entry .size")).fontSize + " " + cs(p.querySelector(".entry .size")).color,
      what: cs(p.querySelector(".entry .what"))?.fontSize };
  }, tab);
  const memLook = await look("memory");
  // the network tab, by its tab: the page's files, Python and Google Drive, adding up to the status bar's
  await page.click("#usage-dlg [role=tab][data-tab=network]");
  await tabIs(page, "network");
  const net = await page.evaluate(() => [...document.querySelectorAll("#net-list .entry .name")].map((n) => n.textContent));
  await check(["The page", "Python", "Google Drive"].every((n) => net.includes(n)), "the Network tab splits what was downloaded", net);
  const netTotal = await page.textContent("#net-total");
  await check(/downloading \d+(\.\d)? (KB|MB|GB)\/s/.test(netTotal) && /downloaded \d+(\.\d)? (KB|MB|GB) since/.test(netTotal), "it gives the speed and the total", netTotal);
  if (shots) await page.screenshot({ path: path.join(shots, "5-network.png") });
  const netLook = await look("network");
  await page.click("#usage-dlg [role=tab][data-tab=cpu]");
  await tabIs(page, "cpu");
  const cpu = await page.evaluate(() => [...document.querySelectorAll("#cpu-list .entry .name")].map((n) => n.textContent));
  await check(["The page", "Python"].every((n) => cpu.includes(n)), "the CPU tab splits the page's thread from Python's", cpu);
  if (shots) await page.screenshot({ path: path.join(shots, "6-cpu.png") });
  const cpuLook = await look("cpu");
  await page.keyboard.press("Escape");

  // the disk opens the Storage tab, whose total it shows, counting what was kept since
  // code no study uses, which the Shared section lists as one record
  await page.evaluate(async () => (await caches.open("third-party-v1")).put(new URL("vendor/acme-0-py3-none-any.whl", location.href).href, new Response(new Uint8Array(300000))));
  await page.click("#sb-disk");
  await tabIs(page, "storage");
  await page.waitForFunction(() => /keeps/.test(document.querySelector("#storage-total").textContent));
  const total = (await page.textContent("#storage-total")).match(/keeps (.+?) on/)[1];
  await check((await page.textContent("#sb-disk")) === total, "the disk is the Storage tab's total", [total, await page.textContent("#sb-disk")]);
  for (const g of await page.$$("#storage-list .group > summary")) await g.click();
  if (shots) await page.screenshot({ path: path.join(shots, "7-storage.png") });
  const storeLook = await look("storage");
  await page.keyboard.press("Escape");
  // a fast download flashes the network; every one of the four has rolled to a new value by now
  await page.evaluate((u) => fetch(u, { cache: "no-store" }).then((r) => r.arrayBuffer()), origin + "/big");
  await page.waitForFunction(() => window.seen["sb-net"].spiked, null, { timeout: 4000 }).catch(() => {});
  const all = await page.evaluate(() => window.seen);
  await check(all["sb-net"].spiked, "a fast download flashes the network", all["sb-net"]);
  await check(Object.values(all).every((x) => x.rolled > 0 && x.anim.every((a) => a === "roll")), "the disk, memory, network and CPU each rolled to a new value", all);
  // with reduced motion asked for, a new value changes without rolling
  await page.emulateMedia({ reducedMotion: "reduce" });
  const before = all["sb-net"].rolled;
  await page.evaluate((u) => fetch(u, { cache: "no-store" }).then((r) => r.arrayBuffer()), origin + "/big");
  await page.waitForFunction((n) => window.seen["sb-net"].rolled > n, before, { timeout: 4000 }).catch(() => {});
  const calm = await page.evaluate(() => window.seen["sb-net"]);
  await check(calm.rolled > before && calm.anim.slice(-1)[0] === "none", "with reduced motion asked for, it changes without rolling", calm);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // the CPU tab's Animations checkbox, checked at first, turns every animation off but the spinners'
  await page.click("#sb-cpu"); await tabIs(page, "cpu");
  await check(await page.isChecked("#motion"), "the CPU tab's Animations checkbox is checked at first");
  await page.uncheck("#motion"); await page.keyboard.press("Escape");
  await check(await page.evaluate(() => JSON.parse(localStorage.getItem("nor-motion"))) === false, "unchecked, it is kept for the next visit");
  const still = await page.evaluate(() => {
    const cs = (sel, pseudo) => getComputedStyle(document.querySelector(sel), pseudo);
    const b = document.createElement("button"); b.className = "shine"; document.body.append(b);
    const out = { shine: getComputedStyle(b, "::after").animationName, gt: cs("#sb-cpu svg").transitionDuration, spin: cs(".spin").animationName,
      sweep: getComputedStyle(b, "::after").display, halo: getComputedStyle(b).boxShadow };
    b.className = "working"; b.disabled = true; out.working = getComputedStyle(b, "::after").animationName; b.remove();
    return out;
  });
  await check(still.shine === "none" && still.gt === "0s", "nothing shines or fades", still);
  await check(still.sweep === "none" && still.halo === "none", "a button that would shine looks plain: no light frozen on it, no halo", still);
  {
    const again = await ctx.newPage();
    await again.goto(page.url());
    await again.waitForFunction(() => document.querySelector("#title").textContent);
    const kept = await again.evaluate(() => ({ box: document.querySelector("#motion").checked, motion: document.documentElement.dataset.motion }));
    await check(!kept.box && kept.motion === "off", "the next visit opens with the animations still off", kept);
    await again.close();
  }
  await check(still.spin === "spin" && still.working === "spin", "but a spinner still turns", still);
  await page.waitForFunction(() => !document.querySelector("#sb-net").classList.contains("spike"), null, { timeout: 6000 });
  const net0 = await page.evaluate(() => { const s = window.seen["sb-net"]; s.spiked = false; return s.rolled; });
  await page.evaluate((u) => fetch(u, { cache: "no-store" }).then((r) => r.arrayBuffer()), origin + "/big");
  await page.waitForFunction((n) => window.seen["sb-net"].rolled > n, net0, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const quiet = await page.evaluate(() => window.seen["sb-net"]);
  await check(quiet.rolled > net0 && quiet.anim.slice(-1)[0] === "none" && !quiet.spiked, "a fast download neither rolls nor flashes the network", quiet);
  const alike = (a, b) => a.total && b.total && a.name === b.name && a.size === b.size && (!a.what || !b.what || a.what === b.what);
  await check([memLook, netLook, cpuLook].every((l) => alike(l, storeLook) && alike(l, memLook)), "the four tabs look alike", [storeLook, memLook, netLook, cpuLook]);
  await ctx.close();
}

// ---- the resources block: folded into one icon at first, opened by hovering it, by what needs watching, or always ----
{
  const { ctx, page } = await open("fixture");
  // open: the four items take their room, once the animation is over; folded, only the icon shows
  const block = () => page.evaluate(() => ({ items: Math.round(document.querySelector("#sb-res-items").getBoundingClientRect().width),
    icon: Math.round(document.querySelector("#sb-res-icon").getBoundingClientRect().width) }));
  const isOpen = async (want, what, ms = 1500) => {
    await page.waitForFunction((w) => (document.querySelector("#sb-res-items").getBoundingClientRect().width > 150) === w, want, { timeout: ms }).catch(() => {});
    await page.waitForTimeout(500);
    const b = await block();
    await check((b.items > 150) === want && (want || (b.icon > 10 && b.items === 0)), what, b);
  };
  await isOpen(false, "on opening the page, the disk, memory, network and CPU are folded into one icon");
  await shot(page, "9-resources-folded");
  const look = await page.evaluate(() => { const s = getComputedStyle(document.querySelector("#sb-res-items")); return { property: s.transitionProperty, ms: parseFloat(s.transitionDuration) * 1000 }; });
  await check(/max-width|width|all/.test(look.property) && look.ms >= 150, "folding and unfolding is animated", look);
  await page.hover("#sb-res-icon");
  await isOpen(true, "hovering the icon unfolds the four as they look always open");
  await check((await block()).icon > 10, "the icon staying beside them, to be clicked");
  await shot(page, "10-resources-hovered");
  await page.mouse.move(700, 300);
  await isOpen(false, "and they fold again once the pointer leaves");
  await page.click("#sb-res-icon");
  await page.waitForFunction(() => document.querySelector("#usage-dlg").open);
  if (shots) await page.screenshot({ path: path.join(shots, "12-resources-setting.png") });
  const mode = await page.evaluate(() => ({ value: document.querySelector("#res-mode")?.value, options: [...document.querySelectorAll("#res-mode option")].map((o) => o.value) }));
  await check(mode.value === "auto" && mode.options.join() === "hidden,auto,open", "clicking the icon opens the resources dialog, whose setting for the block offers hidden, auto-hiding and always open, auto-hiding chosen", mode);
  await page.keyboard.press("Escape"); await page.mouse.move(700, 300);
  await isOpen(false, "closed, the block is folded again");

  // what opens it while auto-hiding, and folds it 5 to 10 seconds after it ends
  const foldsLater = async (what) => {
    const t0 = Date.now();
    await page.waitForTimeout(3000);
    await isOpen(true, `${what}: still open 3 s after it ends`, 100);
    await page.waitForFunction(() => document.querySelector("#sb-res-items").getBoundingClientRect().width < 5, null, { timeout: 12000 }).catch(() => {});
    const s = (Date.now() - t0) / 1000;
    await check(s >= 5 && s <= 11, `${what}: folded again ${s.toFixed(1)} s after it ends`, s);
  };
  await page.evaluate(() => { window.st.heapWas = window.st.heap; window.st.heap = 1.2 * 2 ** 30; });
  await isOpen(true, "the tab holding over 1 GB opens it", 2500);
  await page.evaluate(() => { window.st.heap = window.st.heapWas; });
  await foldsLater("memory back under 1 GB");
  // the page's thread busy for 7 s: not at once, only once it has been over half a core for 5 s
  const busy = page.evaluate(async () => { const end = Date.now() + 7500; while (Date.now() < end) { const t = Date.now(); while (Date.now() - t < 400); await new Promise((r) => setTimeout(r, 40)); } });
  await page.waitForTimeout(2500);
  await isOpen(false, "a CPU over 50% for 2 s does not open it yet", 100);
  await busy;
  await isOpen(true, "over 50% for more than 5 s opens it", 2500);
  await foldsLater("the CPU calm again");
  // downloading: kb KB every 250 ms for 8 s
  const download = (kb) => page.evaluate(async (u) => { const end = Date.now() + 8000; while (Date.now() < end) { await fetch(u, { cache: "no-store" }).then((r) => r.arrayBuffer()); await new Promise((r) => setTimeout(r, 250)); } }, origin + "/some/" + kb);
  await download(25);
  await isOpen(false, "about 100 KB/s for 8 s does not open it: under 250 KB/s", 100);
  const pull = download(200);
  await page.waitForTimeout(2500);
  await isOpen(false, "the network over 250 KB/s for 2 s does not open it yet", 100);
  await pull;
  await isOpen(true, "over 250 KB/s for more than 5 s opens it", 2500);
  await foldsLater("the network quiet again");
  await ctx.setOffline(true);
  await isOpen(true, "going offline opens it", 2500);
  await page.waitForTimeout(11000);
  await isOpen(true, "and it stays open while offline", 100);
  await ctx.setOffline(false);
  await foldsLater("back online");

  // with the page's animations off, it folds and unfolds at once
  await page.evaluate(() => { document.documentElement.dataset.motion = "off"; });
  const still = await page.evaluate(() => getComputedStyle(document.querySelector("#sb-res-items")).transitionDuration);
  await check(still.split(",").every((d) => parseFloat(d) === 0), "with Animations off, folding and unfolding is not animated", still);
  await page.evaluate(() => { document.documentElement.dataset.motion = "on"; });

  // always open: as before; kept for the next visit
  await page.click("#sb-res-icon"); await page.selectOption("#res-mode", "open"); await page.keyboard.press("Escape"); await page.mouse.move(700, 300);
  await isOpen(true, "always open, the four show");
  await check((await block()).icon === 0, "with no icon");
  await check(await page.evaluate(() => JSON.parse(localStorage.getItem("nor-resources"))) === "open", "the choice is kept for the next visit");
  // hidden always: only the icon, which hovering and the network going do not unfold, the icon itself saying offline
  await page.click("#sb-disk"); await page.selectOption("#res-mode", "hidden"); await page.keyboard.press("Escape");
  await isOpen(false, "hidden always, only the icon shows");
  await page.hover("#sb-res-icon");
  await isOpen(false, "and hovering it does not unfold the four");
  await page.mouse.move(700, 300);
  await ctx.setOffline(true);
  await isOpen(false, "nor does going offline", 2500);
  await check(await page.isVisible("#sb-res-icon .no-net"), "the icon carries the red no-network mark instead");
  await shot(page, "11-resources-hidden-offline");
  await ctx.setOffline(false);
  await ctx.close();
}

// ---- the same study as PreGT: no ground truth to export ----
{
  stage = "PreGT";
  const { ctx, page } = await open("fixture");
  await stageIs(page, "PreGT", "red");
  await check(await page.evaluate(() => document.querySelector("#fx-truth").offsetParent === null), "its ground-truth button is hidden");
  await loadImage(page); await count(page);
  await steps(page, ["Load image", "Count"], []);
  await switchIs(page, "Items 1", true, "a PreGT study's item view shows what was found, how many");
  await page.click("#switch");
  await check(await page.evaluate(() => !document.querySelector("#tasks-bar").offsetParent && !document.querySelector("#fx-task").classList.contains("task-open")), "with no tasks' bar and no card marked");
  await ctx.close();
  stage = null;
}

// ---- the same study as Published: it only shows what it finds ----
{
  stage = "Published";
  const { ctx, page } = await open("fixture");
  const lights = await page.evaluate(() => ({ stage: document.querySelector("#sb-stage").dataset.stage,
    lit: [...document.querySelectorAll("#sb-stage circle")].map((c) => c.classList.contains("lit") && getComputedStyle(c).fill) }));
  const green = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--yes").trim());
  await check(lights.stage === "Published" && lights.lit.every((f) => f && f === lights.lit[0]) && lights.lit[0] !== await page.evaluate(() => getComputedStyle(document.querySelector("#sb-stage circle:not(.lit)") || document.body).fill),
    "the stage, Published, lights all three alike", { lights, green });
  const gone = await page.evaluate(() => ["#fx-counted", "#fx-truth"].map((id) => [id, document.querySelector(id).offsetParent === null]));
  await check(gone.every(([, hidden]) => hidden), "the study's postprocessing and its ground-truth button are not shown", gone);
  await loadImage(page); await count(page);
  await steps(page, ["Load image", "Count"], []);
  await switchIs(page, "Items 1", true, "its item view shows what was found, how many");
  await ctx.close();
  stage = null;
}

// ---- the Image Viewer: Load image alone ----
{
  const { ctx, page } = await open(null);
  await stageIs(page, "PreGT", "red");
  await steps(page, ["Load image*"], ["#load-main", "#sb-load"]);
  await page.setInputFiles("#file", image);
  await steps(page, ["Load image"], []);
  // switching study in place: its stage and steps come with it, the image open in it already
  await page.click("#study-menu summary");
  await page.click("#study-list a >> text=NoR Finder");
  await page.waitForFunction(() => document.querySelector("#sb-stage").dataset.stage === "GT");
  await steps(page, ["Load image", "Run algorithm*"], ["#find", "#sb-find"]);
  await ctx.close();
}
await done(0);
