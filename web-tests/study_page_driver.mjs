// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from
// ANSWERS (what the fixture's own Python answers, written by tests/test_study_runs.py), and checks that the
// shell runs the study the address names: its title, panels, channel and Python calls, its drawing on the
// image, and none of another study's panels; that a study's path opens it and an old ?study= address is
// rewritten to that path; that the bare address opens the Image Viewer, whose empty right bar gives its
// room to the image; and that the header's switcher lists the studies in STUDIES (the build's list), each with
// its stage as a bordered label and no tick, marks the one on show for assistive tech, finds one by search, and swaps studies in place: no reload, the open image unloaded, the
// leaving study's panels and listeners gone, back and forward too; and that the tab's icon is the study's own, or
// the app's for a study naming none (req/shell/site/icons).
// Then the same with the real worker (web/worker.js), Pyodide served from the copy installed beside the
// tests, since the fixture needs none of its packages. Prints what it saw; exits 1 on a failure, 2 when it
// cannot run.
//   node web-tests/study_page_driver.mjs ANSWERS IMAGE.png STUDIES
import { repoFile } from "./repo_file.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { offSite } from "./off_site.mjs";
import { ENGINE } from "./engine.mjs";
import { cutShort } from "./page_errors.mjs";
import { localStudy } from "./local_study.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [answers, image, studies] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pyodide;
try { pyodide = path.dirname(require.resolve("pyodide/pyodide.mjs", { paths: [path.dirname(fileURLToPath(import.meta.url))] })); } catch {
  console.error("no pyodide: npm i --prefix web-tests pyodide@314.0.7"); process.exit(2);
}
let stub = true;
// the switcher's titles, as the build lists the studies
// what the switcher offers a visitor not signed in: the build's list but the studies shown to named accounts alone
const offered = JSON.parse(fs.readFileSync(studies, "utf8")).filter((m) => !m.accounts), titles = offered.map((m) => m.title);

// answers every request the way web/worker.js does with the fixture's Python, from answers.json
const STAND_IN = `
const A = await (await fetch("answers.json")).json();
const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const first = new URL(location.href).searchParams.get("study");
if (A.ready[first]) postMessage({ type: "ready", info: A.ready[first] });
onmessage = ({ data: m }) => {
  if (m.type === "study") postMessage({ type: "ready", info: A.ready[m.id] });
  else if (m.type === "open") { const images = bytes(A.images); postMessage({ type: "opened", meta: A.opened, images }, [images.buffer]); }
  else if (m.type === "call") { const b = bytes(A.mask); postMessage({ type: "result", action: m.action, meta: A.count, bytes: b, echo: m.echo }, [b.buffer]); }
};`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".zip": "application/zip", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js" && stub) { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  // the build's list of vendored wheels, which the fixture needs none of
  if (u === "/web/vendor/wheels.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end("[]"); }
  const f = u === "/web/answers.json" ? answers : u === "/web/studies.json" ? studies : repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw[ENGINE].launch();
const problems = [];
const done = async () => { await browser.close(); server.close(); for (const p of problems) console.error(p); process.exitCode = problems.length ? 1 : 0; };
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await localStudy(ctx, "fixture");
await ctx.route(offSite(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
const page = await ctx.newPage();
page.on("pageerror", (e) => { if (!cutShort(e)) problems.push("page error: " + e.message); });
page.setDefaultTimeout(10000);
try {
  await page.goto(origin + "/web/index.html?study=fixture");
  await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));
  const seen = await page.evaluate(() => ({
    title: document.title, h1: document.querySelector("#title").textContent, threshold: document.querySelector("#fx-threshold").value,
    channels: [...document.querySelectorAll("#channels label")].map((l) => l.textContent), accept: document.querySelector("#file").accept,
    other: !!document.querySelector("#finder"), path: location.pathname, icon: document.querySelector("#favicon").href,
  }));
  console.log(JSON.stringify(seen));
  if (seen.title !== "Fixture" || seen.h1 !== "Fixture") problems.push("the page does not carry the study's title");
  if (!seen.icon.endsWith("/studies/fixture/web/icon.svg")) problems.push("the tab's icon is not the study's own: " + seen.icon);
  if (seen.threshold !== "100") problems.push("the study's ready hook did not get its Python's answer");
  if (seen.channels.join() !== "Grey" || seen.accept !== ".png") problems.push("the study's channels or file types are not the page's");
  if (seen.other) problems.push("another study's panels are on the page");
  if (seen.path !== "/web/fixture") problems.push("the old ?study= address was not rewritten to the study's path: " + seen.path);
  await page.evaluate(() => { window.stayed = true; });
  const menu = () => page.evaluate(() => ({
    items: [...document.querySelectorAll("#study-list a")].map((a) => a.querySelector(".name").textContent + (a.getAttribute("aria-current") ? "*" : "")),
    right: !!document.querySelector("#right, #gutter-right"),
  }));
  const fixtureMenu = await menu();
  console.log(JSON.stringify(fixtureMenu));
  if (fixtureMenu.items.join() !== titles.join()) problems.push("the switcher does not list the listed studies, or marks one not on show: " + fixtureMenu.items);
  if (fixtureMenu.right) problems.push("the page still has a right bar");
  // req/shell/header: each row ends in its study's stage, a small bordered label in its colour no wider than its
  // word; a study with no stage shows none; the icons lined up; room to the row's right edge, and no tick on the one on show
  const rowsLook = await page.evaluate(() => [...document.querySelectorAll("#study-list a")].map((a) => {
    const t = a.querySelector(".stage-tag"), shown = t && t.textContent && getComputedStyle(t).visibility !== "hidden" ? t : null, cs = shown && getComputedStyle(shown);
    const on = [...a.children].filter((c) => c.offsetParent), icon = a.querySelector(".study-icon:not([hidden])");
    return { id: a.dataset.id, stage: shown ? shown.textContent : null, border: cs && cs.borderTopStyle !== "none" && parseFloat(cs.borderTopWidth) > 0 && cs.borderTopColor,
      small: cs && parseFloat(cs.fontSize) <= 10, last: !shown || on[on.length - 1] === shown,
      snug: !shown || shown.getBoundingClientRect().width <= shown.textContent.length * 8 + 16, iconLeft: icon && Math.round(icon.getBoundingClientRect().left),
      room: on.length && a.getBoundingClientRect().right - on[on.length - 1].getBoundingClientRect().right, tick: !!a.querySelector(".tick, .tick-icon") };
  }));
  console.log(JSON.stringify(rowsLook));
  const colours = new Set(rowsLook.map((r) => r.border));
  for (const s of JSON.parse(fs.readFileSync(studies, "utf8"))) {
    const r = rowsLook.find((x) => x.id === s.id) || {};
    if (s.stage === null ? r.stage !== null : r.stage !== s.stage || !r.border || !r.small || !r.last || !r.snug) problems.push(`the switcher does not label ${s.id} with its stage, ${s.stage}, last, small, snug and bordered: ${JSON.stringify(r)}`);
    if (!(r.room >= 8)) problems.push(`the switcher's ${s.id} row leaves ${r.room} px at its right, not 8`);
    if (r.tick) problems.push(`the switcher's ${s.id} row carries a tick`);
  }
  if (new Set(rowsLook.map((r) => r.iconLeft)).size !== 1) problems.push("the switcher's icons do not line up: " + rowsLook.map((r) => r.iconLeft));
  if (new Set(rowsLook.map((r) => r.stage).filter(Boolean)).size > 1 && colours.size < 2) problems.push("the stages' labels are all one colour: " + [...colours]);
  // each study's own icon beside its title, loaded; the generic one for a study naming none
  await page.waitForFunction(() => [...document.querySelectorAll("#study-list img")].every((i) => i.complete));
  const icons = await page.evaluate(() => [...document.querySelectorAll("#study-list a")].map((a) => {
    const img = a.querySelector("img.study-icon");
    return { id: a.dataset.id, src: img && !img.hidden && img.naturalWidth ? new URL(img.src).pathname : null, generic: a.querySelector("svg.study-icon:not([hidden])") instanceof SVGSVGElement };
  }));
  console.log(JSON.stringify(icons));
  // the control showing the study on show carries its icon too: its own, loaded, or the generic one
  const headIcon = async (want) => {
    const got = () => page.evaluate(() => {
      const img = document.querySelector("#study-menu summary img.study-icon:not([hidden])");
      if (img) return img.complete && img.naturalWidth ? new URL(img.src).pathname : "loading";
      const svg = document.querySelector("#study-menu summary svg.study-icon:not([hidden])");
      return svg instanceof SVGSVGElement ? "generic" : "none";
    });
    for (let i = 0; i < 30 && (await got()) !== want; i++) await page.waitForTimeout(100);
    const seen = await got();
    if (seen !== want) problems.push(`the switcher's control shows ${seen}, not ${want}`);
  };
  await headIcon("/studies/fixture/web/icon.svg");
  for (const s of offered) {
    const got = icons.find((i) => i.id === s.id) || {};
    const want = s.icon ? `/studies/${s.id}/${s.icon}` : null;
    if (got.src !== want || got.generic === !!s.icon) problems.push(`the switcher shows ${s.id} with ${got.src || (got.generic ? "the generic icon" : "no icon")}, not ${want || "the generic icon"}`);
  }
  await page.setInputFiles("#file", image);
  await page.waitForFunction(() => !document.querySelector("#fx-count").disabled);
  const base = await page.evaluate(() => [document.querySelector("#base").width, document.querySelector("#base").height]);
  if (base.join() !== "80,60") problems.push(`the viewer drew ${base} for an 80 x 60 image`);
  await page.click("#fx-count");
  await page.waitForFunction(() => /pixels/.test(document.querySelector("#fx-result").textContent));
  const result = await page.evaluate(() => [document.querySelector("#fx-result").textContent, !!document.querySelector('#overlay g[data-layer="fx"] #fx-mask')]);
  console.log(result[0]);
  if (result[0] !== "400 pixels above the threshold" || !result[1]) problems.push("the call's answer did not reach the study, or its layer was not drawn");

  // the switcher swaps studies in place: found by search, the image unloaded, the fixture's panels gone
  // the listeners on the shell's own objects, as only Chromium's DevTools count them: null, not counted, in another engine
  const cdp = ENGINE === "chromium" ? await ctx.newCDPSession(page) : null;
  const listeners = async () => {
    if (!cdp) return null;
    let n = 0;
    for (const expression of ["document", "window", "document.querySelector('#scroller')", "document.querySelector('#overlay')"]) {
      const { result } = await cdp.send("Runtime.evaluate", { expression });
      n += (await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId })).listeners.length;
    }
    return n;
  };
  const shown = () => page.evaluate(() => ({
    stayed: !!window.stayed, path: location.pathname, title: document.title, h1: document.querySelector("#title").textContent,
    image: !document.querySelector("#stage").hidden && [document.querySelector("#base").width, document.querySelector("#base").height].join(),
    file: document.querySelector("#file-name").textContent, unload: !document.querySelector("#unload").hidden,
    loaded: !document.querySelector("#sb-load")?.classList.contains("now"), fixture: !!document.querySelector("#fx-box, #fx-result"),
    css: [...document.querySelectorAll("link[rel=stylesheet]")].map((l) => l.getAttribute("href")).filter((h) => h.includes("studies/")),
    channels: [...document.querySelectorAll("#channels label")].map((l) => l.textContent).join(),
    noHelp: !document.querySelector("#channels .help"), icon: document.querySelector("#favicon").href,
  }));
  await page.click("#study-menu summary");
  const focused = await page.waitForFunction(() => document.activeElement?.type === "search").then(() => true, () => false);
  if (!focused) problems.push("the switcher does not open on its search box");
  const lined = await page.evaluate(() => $("#study-menu .pop").getBoundingClientRect().left - $("#study-menu .caret").getBoundingClientRect().left);
  if (Math.abs(lined) > 1) problems.push(`the switcher's popup does not open under its caret: ${lined} px off`);
  await page.keyboard.type("image");
  const found = await page.evaluate(() => [...document.querySelectorAll("#study-list a")].filter((a) => !a.hidden).map((a) => a.querySelector(".name").textContent).join());
  if (found !== "Image Viewer") problems.push("searching 'image' leaves " + found);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.title === "Image Viewer" && document.querySelector("#busy").hidden && document.querySelector("#status").textContent === "Ready. Load an image.");
  const inViewer = await shown(), alone = await listeners();
  console.log(JSON.stringify(inViewer), "listeners", alone);
  if (!inViewer.stayed) problems.push("switching study reloaded the page");
  if (!inViewer.icon.endsWith("/studies/viewer/web/icon.svg")) problems.push("switching to the Image Viewer did not swap in its icon: " + inViewer.icon);
  if (inViewer.path !== "/web/") problems.push("the Image Viewer's address is not the bare one: " + inViewer.path);
  if (inViewer.image || inViewer.file !== "No image loaded" || inViewer.unload || inViewer.loaded) problems.push("switching study did not unload the image: " + JSON.stringify(inViewer));
  if (inViewer.fixture || inViewer.css.length) problems.push("the fixture left its panels or stylesheet behind: " + inViewer.css);
  // the Image Viewer names no channels, and no image is open to give any: none are listed
  if (inViewer.channels !== "" || !inViewer.noHelp) problems.push("the channels are still the old study's: " + inViewer.channels);
  // the last row asks GitHub for a new study, on the form the repo carries
  const request = await page.evaluate(() => {
    const a = document.querySelector("#study-request"), rows = [...document.querySelectorAll("#study-menu .pop a")];
    return a && { text: a.textContent.trim(), href: a.href, target: a.target, last: rows[rows.length - 1] === a };
  });
  console.log(JSON.stringify(request));
  const form = request && new URL(request.href).searchParams.get("template");
  if (!request || request.text !== "Submit New Study Request" || !request.last || request.target !== "_blank") problems.push("no Submit New Study Request at the end of the switcher: " + JSON.stringify(request));
  else if (!form || !fs.existsSync(path.join(repo, ".github", "ISSUE_TEMPLATE", form))) problems.push("Submit New Study Request opens a form the repo does not carry: " + request.href);
  const viewerMenu = await menu();
  if (viewerMenu.items.join() !== titles.map((t) => (t === "Image Viewer" ? t + "*" : t)).join()) problems.push("the switcher does not mark the study on show: " + viewerMenu.items);
  await headIcon("/studies/viewer/web/icon.svg");

  // into NoR Finder by a click, then back: NoR's panels and listeners leave with it
  await page.click("#study-menu summary");
  await page.click("#study-list a >> text=NoR Finder");
  await page.waitForSelector("#finder", { state: "attached" });
  await page.waitForFunction(() => document.querySelector("#status").textContent !== "Reading the image…" && document.querySelector("#busy").hidden);
  const inNor = await shown();
  console.log(JSON.stringify(inNor), "listeners", await listeners());
  if (!inNor.stayed || inNor.path !== "/web/nor" || inNor.title !== "NoR Finder") problems.push("choosing NoR Finder did not swap it in at /web/nor: " + JSON.stringify(inNor));
  if (inNor.image || inNor.file !== "No image loaded") problems.push("an image opened in NoR Finder after the switch: " + JSON.stringify(inNor));
  if (!inNor.icon.endsWith("/studies/nor/web/icon.svg")) problems.push("switching to NoR Finder did not swap in its icon: " + inNor.icon);
  await headIcon("/studies/nor/web/icon.svg");
  await page.goBack();
  await page.waitForFunction(() => document.title === "Image Viewer" && !document.querySelector("#finder"));
  const back = await shown(), after = await listeners();
  console.log(JSON.stringify(back), "listeners", after);
  if (!back.stayed || back.path !== "/web/") problems.push("Back did not return to the Image Viewer in place: " + JSON.stringify(back));
  if (after !== alone) problems.push(`NoR Finder left listeners behind: ${after} on the shell, ${alone} before it came`);
  if (back.css.length) problems.push("NoR Finder left its stylesheet behind: " + back.css);
  await page.goForward();
  await page.waitForSelector("#finder", { state: "attached" });
  if (!(await shown()).stayed) problems.push("Forward reloaded the page");

  // a study's own path opens it fresh
  await page.goto(origin + "/web/fixture");
  await page.waitForSelector("#fx-count", { state: "attached" });
  if (await page.title() !== "Fixture") problems.push("the fixture's path does not open the fixture");
  await page.goto(origin + "/web/index.html");
  await page.waitForFunction(() => document.title === "Image Viewer");
  if (new URL(page.url()).pathname !== "/web/") problems.push("index.html was not rewritten to the bare address: " + page.url());

  // the real worker: the fixture's own Python in Pyodide, answering the page
  stub = false;
  const real = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await localStudy(real, "fixture");
  await real.route("https://cdn.jsdelivr.net/pyodide/**", (r) => {
    const f = path.join(pyodide, new URL(r.request().url()).pathname.split("/").pop());
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || "application/octet-stream", headers: { "access-control-allow-origin": "*" } });
  });
  await real.route(offSite(origin, "https://cdn.jsdelivr.net/pyodide/"), (r) => r.abort());
  await real.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  const live = await real.newPage();
  live.on("pageerror", (e) => { if (!cutShort(e)) problems.push("page error: " + e.message); });
  live.setDefaultTimeout(60000);
  await live.goto(origin + "/web/index.html?study=fixture");
  await live.waitForFunction(() => /^(Ready|Error)/.test(document.querySelector("#status").textContent));
  const ready = await live.textContent("#status");
  if (!ready.startsWith("Ready")) throw new Error("the real worker did not start: " + ready);
  await live.setInputFiles("#file", image);
  await live.waitForFunction(() => !document.querySelector("#fx-count").disabled);
  await live.evaluate(() => { document.querySelector("#fx-threshold").value = 100; });
  await live.click("#fx-count");
  await live.waitForFunction(() => /pixels/.test(document.querySelector("#fx-result").textContent));
  const said = await live.textContent("#fx-result");
  console.log("real worker: " + said);
  if (said !== "400 pixels above the threshold") problems.push("the real worker answered " + said);
} catch (e) {
  problems.push(String(e.message || e));
}
await done();
