// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from
// ANSWERS (tests/test_study_runs.py), and checks the status bar: the study's stage first, a traffic light whose
// popup lists the stages; breadcrumbs of the steps done and the one to do now, which shines with its button and
// nothing else does; a popup on each crumb saying what was done; the shining crumb bringing its button into view
// and pressing it; a new image starting over; a PreGT study with no Submit GT and its ground-truth button hidden;
// switching study in place bringing its own stage and steps; the disk, memory, network and CPU as grey icons and
// numbers, each opening its own tab of one dialog, each rolling its changed characters to a new value, the CPU and
// the network flashing on a sharp rise and rolling nothing when reduced motion is asked for; a separator between every two items; no question-mark pointer.
// Optional SHOTS: a directory for screenshots. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/status_bar_driver.mjs ANSWERS IMAGE.png STUDIES [SHOTS]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
  if (u === "/big") { r.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "no-store" }); return r.end(Buffer.alloc(BIG)); }
  if (u === "/web/vendor/wheels.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end("[]"); }
  const f = u === "/web/answers.json" ? answers : u === "/web/studies.json" ? studies : repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch();
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what, seen) => { if (!ok) { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); } console.log("ok: " + what); };
const shot = async (page, name) => { if (shots) await page.locator("#statusbar").screenshot({ path: path.join(shots, name + ".png") }); };

async function open(study) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
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
// what hovering a crumb says
const tip = async (page, name) => {
  await page.hover(`#sb-steps .crumb >> text=${name}`);
  await page.waitForFunction(() => !document.querySelector("#tip").hidden);
  const t = await page.textContent("#tip");
  await page.mouse.move(700, 300);
  return t;
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
const loadImage = async (page) => { await page.setInputFiles("#file", image); await page.waitForFunction(() => !document.querySelector("#fx-count").disabled); };
const count = async (page) => { await page.click("#fx-count"); await page.waitForFunction(() => /pixels/.test(document.querySelector("#fx-result").textContent)); };

// ---- a GT study: Load image, its Count, Submit GT ----
{
  const { ctx, page } = await open("fixture");
  await stageIs(page, "GT", "yellow");
  // hovering the stage lists the stages, its own highlighted and the ones before it crossed out
  await page.hover("#sb-stage");
  await page.waitForFunction(() => document.querySelector("#stage-pop").matches(":popover-open"));
  const stages = await page.evaluate(() => [...document.querySelectorAll("#stage-pop li")].map((li) => ({
    name: li.querySelector(".name").textContent, now: li.classList.contains("now"), crossed: getComputedStyle(li.querySelector(".name")).textDecorationLine,
  })));
  await check(stages.map((x) => x.name).join() === "PreGT,GT,PostGT" && stages[1].now && !stages[0].now && !stages[2].now,
    "the stage's popup lists PreGT, GT and PostGT, GT highlighted", stages);
  await check(stages[0].crossed === "line-through" && stages[1].crossed === "none" && stages[2].crossed === "none", "the stage before it is crossed out", stages);
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
    const shown = [...document.querySelectorAll("#statusbar > *")].filter((e) => e.offsetWidth && !e.matches(".grow, #whats-new"));
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
  await shot(page, "2-submit");
  await page.click("#fx-truth");
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
  await page.evaluate(() => localStorage.setItem("kept-since", "x".repeat(300000)));
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

// ---- the same study as PreGT: no ground truth to export ----
{
  stage = "PreGT";
  const { ctx, page } = await open("fixture");
  await stageIs(page, "PreGT", "red");
  await check(await page.evaluate(() => document.querySelector("#fx-truth").offsetParent === null), "its ground-truth button is hidden");
  await loadImage(page); await count(page);
  await steps(page, ["Load image", "Count"], []);
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
