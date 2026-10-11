// Drives the page (web/) in headless Chromium on the fixture study, with a stand-in worker answering from
// ANSWERS (what the fixture's own Python answers, written by tests/test_study_runs.py), and checks that the
// shell runs the study the address names: its title, panels, channel and Python calls, its drawing on the
// image, and none of another study's panels; and that with no study named the page opens the default one.
// Then the same with the real worker (web/worker.js), Pyodide served from the copy installed beside the
// tests, since the fixture needs none of its packages. Prints what it saw; exits 1 on a failure, 2 when it
// cannot run.
//   node tests/study_page_driver.mjs ANSWERS IMAGE.png
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
let pyodide;
try { pyodide = path.dirname(require.resolve("pyodide/pyodide.mjs", { paths: [path.dirname(fileURLToPath(import.meta.url))] })); } catch {
  console.error("no pyodide: npm i --prefix tests pyodide@314.0.7"); process.exit(2);
}
let stub = true;

// answers every request the way web/worker.js does with the fixture's Python, from answers.json
const STAND_IN = `
const A = await (await fetch("answers.json")).json();
const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
if (new URL(location.href).searchParams.get("study") === "fixture") postMessage({ type: "ready", info: A.ready });
onmessage = ({ data: m }) => {
  if (m.type === "open") { const images = bytes(A.images); postMessage({ type: "opened", meta: A.opened, images }, [images.buffer]); }
  else if (m.type === "call") { const b = bytes(A.mask); postMessage({ type: "result", action: m.action, meta: A.count, bytes: b, echo: m.echo }, [b.buffer]); }
};`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".zip": "application/zip", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js" && stub) { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(STAND_IN); }
  // the build's list of vendored wheels, which the fixture needs none of
  if (u === "/web/vendor/wheels.json") { r.writeHead(200, { "content-type": "application/json" }); return r.end("[]"); }
  const f = u === "/web/answers.json" ? answers : path.join(repo, u);
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
    other: !!document.querySelector("#finder"), slots: document.querySelectorAll("slot-here").length,
  }));
  console.log(JSON.stringify(seen));
  if (seen.title !== "Fixture" || seen.h1 !== "Fixture") problems.push("the page does not carry the study's title");
  if (seen.threshold !== "100") problems.push("the study's ready hook did not get its Python's answer");
  if (seen.channels.join() !== "Grey" || seen.accept !== ".png") problems.push("the study's channels or file types are not the page's");
  if (seen.other || seen.slots) problems.push("another study's panels, or an unfilled slot, are on the page");
  await page.setInputFiles("#file", image);
  await page.waitForFunction(() => !document.querySelector("#fx-count").disabled);
  const base = await page.evaluate(() => [document.querySelector("#base").width, document.querySelector("#base").height]);
  if (base.join() !== "80,60") problems.push(`the viewer drew ${base} for an 80 x 60 image`);
  await page.click("#fx-count");
  await page.waitForFunction(() => /pixels/.test(document.querySelector("#fx-result").textContent));
  const result = await page.evaluate(() => [document.querySelector("#fx-result").textContent, !!document.querySelector('#overlay g[data-layer="fx"] #fx-mask')]);
  console.log(result[0]);
  if (result[0] !== "400 pixels above the threshold" || !result[1]) problems.push("the call's answer did not reach the study, or its layer was not drawn");

  // no study named: the default one, as every link from before studies
  await page.goto(origin + "/web/index.html");
  await page.waitForSelector("#finder", { state: "attached" });
  if (await page.title() !== "NoR Finder") problems.push("with no study named the page does not open the default study");

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
