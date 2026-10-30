// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from
// ANSWERS (what the fixture's own Python answers, written by tests/test_study_runs.py), and checks that the
// shell runs the study the address names: its title, panels, channel and Python calls, its drawing on the
// image, and none of another study's panels; that a study's path opens it and an old ?study= address is
// rewritten to that path; that the bare address opens the Image Viewer, whose empty right bar gives its
// room to the image; and that the header's switcher lists the studies in STUDIES (the build's list), ticks
// the one on show, finds one by search, and swaps studies in place: no reload, the open image kept, the
// leaving study's panels and listeners gone, back and forward too.
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

const browser = await pw.chromium.launch();
const problems = [];
const done = async () => { await browser.close(); server.close(); for (const p of problems) console.error(p); process.exitCode = problems.length ? 1 : 0; };
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.route((u) => !u.href.startsWith(origin), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
const page = await ctx.newPage();
page.on("pageerror", (e) => problems.push("page error: " + e.message));
page.setDefaultTimeout(10000);
try {
  await page.goto(origin + "/web/index.html?study=fixture");
  await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));
  const seen = await page.evaluate(() => ({
    title: document.title, h1: document.querySelector("#title").textContent, threshold: document.querySelector("#fx-threshold").value,
    channels: [...document.querySelectorAll("#channels label")].map((l) => l.textContent), accept: document.querySelector("#file").accept,
    other: !!document.querySelector("#finder"), path: location.pathname,
  }));
  console.log(JSON.stringify(seen));
  if (seen.title !== "Fixture" || seen.h1 !== "Fixture") problems.push("the page does not carry the study's title");
  if (seen.threshold !== "100") problems.push("the study's ready hook did not get its Python's answer");
  if (seen.channels.join() !== "Grey" || seen.accept !== ".png") problems.push("the study's channels or file types are not the page's");
  if (seen.other) problems.push("another study's panels are on the page");
  if (seen.path !== "/web/fixture") problems.push("the old ?study= address was not rewritten to the study's path: " + seen.path);
  await page.evaluate(() => { window.stayed = true; });
  const menu = () => page.evaluate(() => ({
    items: [...document.querySelectorAll("#study-list a")].map((a) => a.textContent + (a.getAttribute("aria-current") ? "*" : "")),
    noRight: document.querySelector("#layout").classList.contains("no-right"),
  }));
  const fixtureMenu = await menu();
  console.log(JSON.stringify(fixtureMenu));
  if (fixtureMenu.items.join() !== "Image Viewer,NoR Finder") problems.push("the switcher does not list the listed studies, or ticks one not on show: " + fixtureMenu.items);
  if (fixtureMenu.noRight) problems.push("a study with a right-hand panel lost its right bar");
  await page.setInputFiles("#file", image);
  await page.waitForFunction(() => !document.querySelector("#fx-count").disabled);
  const base = await page.evaluate(() => [document.querySelector("#base").width, document.querySelector("#base").height]);
  if (base.join() !== "80,60") problems.push(`the viewer drew ${base} for an 80 x 60 image`);
  await page.click("#fx-count");
  await page.waitForFunction(() => /pixels/.test(document.querySelector("#fx-result").textContent));
  const result = await page.evaluate(() => [document.querySelector("#fx-result").textContent, !!document.querySelector('#overlay g[data-layer="fx"] #fx-mask')]);
  console.log(result[0]);
  if (result[0] !== "400 pixels above the threshold" || !result[1]) problems.push("the call's answer did not reach the study, or its layer was not drawn");

  // the switcher swaps studies in place: found by search, the image kept, the fixture's panels gone
  const cdp = await ctx.newCDPSession(page);
  const listeners = async () => {
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
    file: document.querySelector("#file-name").textContent, fixture: !!document.querySelector("#fx-box, #fx-result"),
    css: [...document.querySelectorAll("link[rel=stylesheet]")].map((l) => l.getAttribute("href")).filter((h) => h.includes("studies/")),
    channels: [...document.querySelectorAll("#channels label")].map((l) => l.textContent).join(),
  }));
  await page.click("#study-menu summary");
  const focused = await page.waitForFunction(() => document.activeElement?.type === "search").then(() => true, () => false);
  if (!focused) problems.push("the switcher does not open on its search box");
  await page.keyboard.type("image");
  const found = await page.evaluate(() => [...document.querySelectorAll("#study-list a")].filter((a) => !a.hidden).map((a) => a.textContent).join());
  if (found !== "Image Viewer") problems.push("searching 'image' leaves " + found);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.title === "Image Viewer" && document.querySelector("#busy").hidden && document.querySelector("#status").textContent === "Image loaded.");
  const inViewer = await shown(), alone = await listeners();
  console.log(JSON.stringify(inViewer), "listeners", alone);
  if (!inViewer.stayed) problems.push("switching study reloaded the page");
  if (inViewer.path !== "/web/") problems.push("the Image Viewer's address is not the bare one: " + inViewer.path);
  if (inViewer.image !== "80,60" || inViewer.file !== "squares.png") problems.push("the open image did not stay open: " + inViewer.image + " " + inViewer.file);
  if (inViewer.fixture || inViewer.css.length) problems.push("the fixture left its panels or stylesheet behind: " + inViewer.css);
  if (inViewer.channels !== "Red,Green,Blue") problems.push("the channels are still the old study's: " + inViewer.channels);
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
  if (viewerMenu.items.join() !== "Image Viewer*,NoR Finder") problems.push("the switcher does not tick the study on show: " + viewerMenu.items);
  if (!viewerMenu.noRight) problems.push("a study with nothing on the right still keeps the right bar");

  // into NoR Finder by a click, then back: NoR's panels and listeners leave with it
  await page.click("#study-menu summary");
  await page.click("#study-list a >> text=NoR Finder");
  await page.waitForSelector("#finder", { state: "attached" });
  await page.waitForFunction(() => document.querySelector("#status").textContent !== "Reading the image…" && document.querySelector("#busy").hidden);
  const inNor = await shown();
  console.log(JSON.stringify(inNor), "listeners", await listeners());
  if (!inNor.stayed || inNor.path !== "/web/nor" || inNor.title !== "NoR Finder") problems.push("choosing NoR Finder did not swap it in at /web/nor: " + JSON.stringify(inNor));
  if (inNor.image !== "80,60") problems.push("the image did not open in NoR Finder");
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
  await real.route("https://cdn.jsdelivr.net/pyodide/**", (r) => {
    const f = path.join(pyodide, new URL(r.request().url()).pathname.split("/").pop());
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || "application/octet-stream", headers: { "access-control-allow-origin": "*" } });
  });
  await real.route((u) => !u.href.startsWith(origin) && !u.href.startsWith("https://cdn.jsdelivr.net/pyodide/"), (r) => r.abort());
  await real.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  const live = await real.newPage();
  live.on("pageerror", (e) => problems.push("page error: " + e.message));
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
