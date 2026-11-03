// Drives Data Management (web/data_mode.js) in headless Chromium on the fixture study, given permissions and a Drive
// folder, against a stand-in Google: the folder ROOT (its files, and its subfolders' files) served through the
// Drive API as a public folder, and the signed-in user's token approved for ROOT alone. With a stand-in worker
// answering ANSWERS (tests/test_study_runs.py). Checks req/shell/data/drive-access, req/shell/data/mode,
// req/shell/data/folder, req/shell/data/update-previews and req/shell/data/preview-images; the previews file the page writes is saved to OUT.
// Optional SHOTS: a directory for screenshots. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/data_mode_driver.mjs ANSWERS STUDIES ROOT OUT [SHOTS]
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { repoFile } from "./repo_file.mjs";
import { offSite } from "./off_site.mjs";
import { ENGINE } from "./engine.mjs";
import { cutShort } from "./page_errors.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [answers, studies, rootDir, out, shots] = process.argv.slice(2);
const shot = (name) => shots && page.screenshot({ path: path.join(shots, name + ".png") });
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = "dmrootfolder00000001", EMAIL = "tester@example.com";
const sha = (b) => createHash("sha256").update(b).digest("hex");

// the stand-in Drive: {id, name, parent, folder, bytes, mine}
let next = 0;
const FILES = [];
const add = (dir, parent) => {
  for (const name of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, name), folder = fs.statSync(p).isDirectory(), id = folder ? "dmsubfolder" + String(next++).padStart(9, "0") : "dmfile" + String(next++).padStart(14, "0");
    FILES.push({ id, name, parent, folder, bytes: folder ? null : fs.readFileSync(p), mine: false });
    if (folder) add(p, id);
  }
};
add(rootDir, ROOT);
const SUB = FILES.find((f) => f.folder).id;
const approved = new Set([ROOT]);
const writes = [];

const fixture = JSON.parse(fs.readFileSync(path.join(repo, "studies", "fixture", "study.json"), "utf8"));
fixture.files.folders = [`https://drive.google.com/drive/folders/${ROOT}`];
fixture.permissions = { data_management: [EMAIL] };
const STAND_IN = `
const A = await (await fetch("answers.json")).json();
const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
postMessage({ type: "ready", info: A.ready.fixture });
onmessage = ({ data: m }) => {
  if (m.type === "open") { self.lastOpen = { name: m.name, bytes: new Uint8Array(m.bytes) }; const images = bytes(A.images); postMessage({ type: "opened", meta: A.opened, images }, [images.buffer]); }
};`;
const CONFIG = `window.NOR_CONFIG = { google: { apiKey: "stand-in", clientId: "123456-stand.apps.googleusercontent.com" } };`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  const send = (type, body) => { r.writeHead(200, { "content-type": type }); r.end(body); };
  if (u === "/web/worker.js") return send("text/javascript", STAND_IN);
  if (u === "/web/config.js") return send("text/javascript", CONFIG);
  if (u === "/web/vendor/wheels.json") return send("application/json", "[]");
  if (u === "/studies/fixture/study.json") return send("application/json", JSON.stringify(fixture));
  const f = u === "/web/answers.json" ? answers : u === "/web/studies.json" ? studies : repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw[ENGINE].launch();
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what, seen) => { if (!ok) { console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); await done(1); } console.log("ok: " + what); };

const json = (route, body, status = 200) => route.fulfill({ status, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify(body) });
const meta = (f) => ({ id: f.id, name: f.name, mimeType: f.folder ? "application/vnd.google-apps.folder" : "image/tiff", ...(f.folder ? {} : { size: String(f.bytes.length), sha256Checksum: sha(f.bytes) }) });
// a multipart body's metadata and file bytes
function parts(req) {
  const body = req.postDataBuffer(), boundary = "--" + req.headers()["content-type"].match(/boundary=(.+)$/)[1];
  const chunks = [];
  for (let at = body.indexOf(boundary); at >= 0; ) {
    const end = body.indexOf(boundary, at + boundary.length);
    if (end < 0) break;
    const part = body.subarray(at + boundary.length, end), head = part.indexOf("\r\n\r\n");
    chunks.push(part.subarray(head + 4, part.length - 2));
    at = end;
  }
  return { metadata: JSON.parse(chunks[0].toString()), bytes: Buffer.from(chunks[1]) };
}
async function google(route) {
  const req = route.request(), u = new URL(req.url()), auth = req.headers().authorization, method = req.method();
  const id = decodeURIComponent((u.pathname.match(/\/files\/?([^/]*)$/) || [])[1] || ""), fields = u.searchParams.get("fields") || "";
  if (u.pathname.startsWith("/upload/")) {
    if (method === "POST") {
      const { metadata, bytes } = parts(req);
      if (metadata.parents?.[0] === "appDataFolder") return json(route, { id: "settingsfile" });
      if (!approved.has(metadata.parents[0])) return json(route, { error: { message: "The user has not granted the app write access to the folder" } }, 403);
      const f = { id: "dmmade" + String(next++).padStart(14, "0"), name: metadata.name, parent: metadata.parents[0], folder: false, bytes, mine: metadata.appProperties?.rauntruth === "made" };
      FILES.push(f); writes.push(["create", f.name]);
      if (f.name === "rauntruth-previews.tiff") fs.writeFileSync(out, bytes);
      return json(route, { id: f.id, sha256Checksum: sha(bytes) });
    }
    const f = FILES.find((g) => g.id === id);
    if (!f?.mine) return json(route, { error: { message: "File not found" } }, 404);
    f.bytes = req.postDataBuffer(); writes.push(["replace", f.name]);
    return json(route, { id: f.id });
  }
  if (!id) {
    if (u.searchParams.get("spaces") === "appDataFolder") return json(route, { files: [] });
    const parent = u.searchParams.get("q").match(/'([^']+)' in parents/)[1];
    return json(route, { files: FILES.filter((f) => f.parent === parent).map(meta) });
  }
  if (auth) {
    // the signed-in user's token: the page's own files and the folders approved for it
    if (method === "PATCH") {
      const f = FILES.find((g) => g.id === id);
      if (!f?.mine) return json(route, { error: { message: "File not found" } }, 404);
      FILES.splice(FILES.indexOf(f), 1); writes.push(["trash", f.name]);
      return json(route, { id });
    }
    if (fields.includes("capabilities")) return approved.has(id) ? json(route, { id, capabilities: { canAddChildren: true } }) : json(route, { error: { message: "File not found" } }, 404);
    const f = FILES.find((g) => g.id === id);
    return f?.mine ? json(route, { appProperties: { rauntruth: "made" } }) : json(route, { error: { message: "File not found" } }, 404);
  }
  if (id === ROOT) return json(route, { name: "Study folder one" });
  const f = FILES.find((g) => g.id === id);
  if (!f) return json(route, { error: { message: "File not found" } }, 404);
  if (u.searchParams.get("alt") !== "media") return json(route, meta(f));
  return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/octet-stream", body: f.bytes });
}

const SIGNED_IN = { user: { name: "Tester", email: EMAIL, picture: null }, token: "stand-in-token", until: Date.now() + 3600e3,
  scopes: "openid email profile https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file" };
async function open(signedIn) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route("https://www.googleapis.com/**", google);
  await ctx.route(offSite(origin, "https://www.googleapis.com/"), (r) => r.abort());
  // the welcome popup answered before, and remembered (req/shell/account/welcome)
  await ctx.addInitScript((who) => {
    delete Navigator.prototype.serviceWorker;
    if (who) localStorage.setItem("nor-google-sign-in", JSON.stringify(who));
    localStorage.setItem("nor-welcome", JSON.stringify({ choice: who ? "google" : "anonymous", remember: true }));
  }, signedIn ? SIGNED_IN : null);
  const page = await ctx.newPage();
  page.on("pageerror", async (e) => { if (cutShort(e)) return; console.error("page error: " + e.message); await done(1); });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/fixture");
  await page.waitForFunction(() => document.querySelector("#status").textContent.startsWith("Ready"));
  return page;
}

// not signed in: no strip, no Preprocessing
let page = await open(false);
await check(await page.evaluate(() => $("#data-col").hidden && !$("#preprocessing-box").checkVisibility()), "not signed in, there is no Data Management strip, and no Preprocessing");
await check(await page.evaluate(() => [...document.querySelectorAll("#left > .box.foldable")].filter((b) => b.checkVisibility()).map((b) => b.querySelector(".step-mark").textContent).join()) === "1,2,3,4",
  "the drawers on show are numbered without Preprocessing");
await page.context().close();

page = await open(true);
const width = () => page.evaluate(() => Math.round($("#data-col").getBoundingClientRect().width));
await check(await page.evaluate(() => !$("#data-col").hidden && !document.documentElement.dataset.mode), "a data manager sees the strip, collapsed, out of the mode");
await check((await width()) < 60, "the strip is narrow", await width());
await shot("1-strip");
await page.waitForFunction(() => !$("#access-bar").hidden);
await check(/1 of .*2 folders/.test(await page.textContent("#access-text")), "the bar asks for the one folder not approved yet", await page.textContent("#access-text"));

await page.click("#data-open");
await page.waitForFunction(() => document.querySelectorAll("#data-tree .tree-folder").length === 2);
await page.waitForTimeout(600);
await check((await width()) > 200, "opening slides the column out", await width());
const access = await page.evaluate(() => [...document.querySelectorAll("#data-tree .tree-folder")].map((f) => [f.querySelector(":scope > .row .name").textContent, f.querySelector(":scope > .row .access").textContent]));
await check(JSON.stringify(access) === JSON.stringify([["Study folder one", "Writable"], ["sub", "Not approved"]]), "the tree shows every folder with its access", access);
await check(await page.evaluate(() => [...document.querySelectorAll(".tree-images")].every((b) => b.hidden)), "the images stay folded under their folders");
// Load by the boxes it draws: WebKit's checkVisibility() calls it visible though it is display: none
const shown = await page.evaluate(() => ({ load: $("#load").getClientRects().length > 0, pre: $("#preprocessing-box").checkVisibility(), study: $("#fx-box").checkVisibility(), image: $("#image-box").checkVisibility(), steps: $("#sb-steps").checkVisibility() }));
await check(!shown.load && shown.pre && !shown.study && shown.image && !shown.steps, "in the mode: Load gone, Preprocessing and the Image box shown, the study's drawers and the steps hidden", shown);

const summary = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#folder-summary dd")].map((d) => [d.dataset.k, +d.textContent])));
const folderMsg = () => page.textContent("#folder-msg");
await page.click("#data-tree .tree-folder .name");
await page.waitForFunction(() => document.querySelectorAll("#folder-items .cell").length === 3);
await check(await page.evaluate(() => !$("#folder-view").hidden && $("#image-view").hidden && $("#folder-box").checkVisibility() && !$("#image-box").checkVisibility()),
  "a folder chosen: its images in the main area, Selected Folder in place of the Image box");
await check(JSON.stringify(await summary()) === JSON.stringify({ images: 3, previews: 1, stale: 1, truth: 1, missing: 1 }), "the folder's sums", await summary());
await page.click('#folder-layout button[data-layout="list"]');
await page.waitForFunction(() => $("#folder-items").dataset.layout === "list");
await check(true, "the list button lays the images out as a list");

await page.click("#update-previews");
await page.waitForFunction(() => /Delete it/.test($("#folder-msg").textContent));
await check(!writes.length, "a previews file the page did not make is left alone", writes);
// the user deletes it in Drive
FILES.splice(FILES.findIndex((f) => f.name === "rauntruth-previews.tiff"), 1);
await page.click("#data-tree .tree-folder .name");
await page.waitForFunction(() => document.querySelector('#folder-summary dd[data-k="previews"]')?.textContent === "0");
await page.click("#update-previews");
await page.waitForFunction(() => /3 previews made/.test($("#folder-msg").textContent), null, { timeout: 30000 });
await check(JSON.stringify(writes) === JSON.stringify([["create", "rauntruth-previews.tiff"]]), "Update previews creates the file", writes);
await page.waitForFunction(() => document.querySelector('#folder-summary dd[data-k="previews"]')?.textContent === "3");
await check(JSON.stringify(await summary()) === JSON.stringify({ images: 3, previews: 3, stale: 0, truth: 1, missing: 1 }), "then every image has a preview", await summary());
await page.waitForFunction(() => document.querySelectorAll("#folder-items .pic img").length === 3);
await shot("3-list");
await page.click('#folder-layout button[data-layout="grid"]'); await page.waitForTimeout(500);
await page.click("#data-tree .tree-folder .count"); await page.waitForTimeout(300);
await shot("2-grid");
await page.click("#data-tree .tree-folder .count");
// one image changes; the page replaces its own file, making that one preview alone
FILES.find((f) => f.name === "e plain.tif").bytes = Buffer.concat([FILES.find((f) => f.name === "e plain.tif").bytes, Buffer.from([0])]);
await page.click("#data-tree .tree-folder .name");
await page.waitForFunction(() => document.querySelector('#folder-summary dd[data-k="stale"]')?.textContent === "1");
await page.click("#update-previews");
await page.waitForFunction(() => /1 preview made, 2 kept/.test($("#folder-msg").textContent), null, { timeout: 30000 });
await check(JSON.stringify(writes.at(-1)) === JSON.stringify(["replace", "rauntruth-previews.tiff"]), "a changed image: the page's own file is replaced, the rest kept", writes);
fs.writeFileSync(out, FILES.find((f) => f.name === "rauntruth-previews.tiff").bytes);

const cell = (name) => `#folder-items .cell:has(.name:text-is("${name}"))`;
await check(await page.isDisabled(cell("a flat.tif") + " .mark-gt"), "an image with ground truth needs no marker");
await page.click(cell("e plain.tif") + " .mark-gt");
await page.waitForFunction(() => document.querySelector('#folder-summary dd[data-k="missing"]')?.textContent === "2");
await check(JSON.stringify(writes.at(-1)) === JSON.stringify(["create", "e plain.ground_truth.MISSING"]), "marking an image creates its marker", writes);
await page.click(cell("e plain.tif") + " .mark-gt");
await page.waitForFunction(() => document.querySelector('#folder-summary dd[data-k="missing"]')?.textContent === "1");
await check(JSON.stringify(writes.at(-1)) === JSON.stringify(["trash", "e plain.ground_truth.MISSING"]), "unmarking trashes the page's own marker", writes);
await page.click(cell("b stack.tif") + " .mark-gt");
await page.waitForFunction(() => /Someone else/.test($("#folder-msg").textContent));
await check(writes.at(-1)[1] !== "b stack.ground_truth.MISSING", "a marker someone else made is left alone");

await page.click("#data-tree .tree-folder .count");
await page.waitForFunction(() => document.querySelectorAll("#data-tree .tree-folder .tree-image").length === 3);
await page.waitForFunction(() => document.querySelectorAll("#data-tree .tree-folder .tree-image .pic img").length === 3);
await check(true, "a folder's images unfold with small previews");
await page.click('#data-tree .tree-image:has(.name:text-is("a flat.tif"))');
await page.waitForFunction(() => st.fileName === "a flat.preview.tif" && !$("#load-original").hidden);
await check(await page.evaluate(() => shellForTests.page.get("image").source.kind === "preview" && !$("#image-view").hidden && $("#image-box").checkVisibility()),
  "an image chosen opens from its preview, with Load Original");
await shot("4-preview");
// what reached Python, for the test to open as the study would
const got = await page.workers()[0].evaluate(() => ({ name: self.lastOpen.name, bytes: Array.from(self.lastOpen.bytes) }));
await check(got.name === "a flat.preview.tif", "Python is handed the preview as a TIFF", got.name);
fs.writeFileSync(out + ".preview.tif", Buffer.from(got.bytes));
await page.click("#load-original");
// the name is set as the open starts, the image's source once it is done
await page.waitForFunction(() => shellForTests.page.get("image")?.source.kind === "drive" && $("#load-original").hidden).catch(() => {});
await check(await page.evaluate(() => st.fileName === "a flat.tif" && shellForTests.page.get("image")?.source.kind === "drive" && $("#load-original").hidden), "Load Original opens the image itself");

// offline (req/shell/offline/default): no bar asking for folders, and nothing written to Drive
await page.click("#data-tree .tree-folder .name");
await page.waitForFunction(() => document.querySelectorAll("#folder-items .cell").length === 3);
const before = writes.length;
await page.context().setOffline(true);
await page.waitForFunction(() => document.documentElement.classList.contains("offline"));
await page.click(cell("e plain.tif") + " .mark-gt", { force: true });
await page.waitForTimeout(300);
await check(writes.length === before, "offline, marking an image does nothing", writes.slice(before));
await page.context().setOffline(false);
await page.waitForFunction(() => !document.documentElement.classList.contains("offline"));

await page.click("#data-open");
await page.waitForTimeout(600);
await check((await width()) < 60 && await page.evaluate(() => !$("#load").classList.contains("gone") && !$("#preprocessing-box").checkVisibility() && !document.documentElement.dataset.mode),
  "closing the column leaves the mode: Load back, Preprocessing gone");
await done(0);
