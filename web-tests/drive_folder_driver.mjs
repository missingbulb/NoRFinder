// Drives the Google Drive dialog (web/) in headless Chromium, in three studies: a stand-in fixture whose
// study.json names a Drive folder, the NoR study with the folder its own study.json names, and the Image Viewer,
// which names none. Checks req/shell/drive/dialog: a study's dialog lists its own folder, whatever link was pasted
// elsewhere; the Image Viewer's opens on the link last pasted in it.
// Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/drive_folder_driver.mjs
import { repoFile } from "./repo_file.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { offSite } from "./off_site.mjs";
import { ENGINE, LAUNCH } from "./engine.mjs";
import { pressDrive, pickRecent } from "./drive_open.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const folder = (id) => `https://drive.google.com/drive/folders/${id}`;
const FIXTURE_FOLDER = folder("fixturefolder0000001"), PASTED = folder("pastedfolder00000001");
const NOR_FOLDER = JSON.parse(fs.readFileSync(path.join(repo, "studies", "nor", "study.json"), "utf8")).files.folders[0];
const CONFIG = `window.NOR_CONFIG = { google: { apiKey: "stand-in" } };`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(""); }
  if (u === "/web/config.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(CONFIG); }
  if (u === "/studies/fixture/study.json") {
    const m = JSON.parse(fs.readFileSync(path.join(repo, u), "utf8"));
    r.writeHead(200, { "content-type": "application/json" });
    return r.end(JSON.stringify({ ...m, files: { ...m.files, folders: [FIXTURE_FOLDER] } }));
  }
  const f = repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw[ENGINE].launch(LAUNCH);
let failed = false;
const check = (ok, what) => { if (!ok) { failed = true; console.error("FAILED: " + what); } else console.log("ok: " + what); };
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const cors = { "access-control-allow-origin": "*" };
// every folder is empty: what the dialog opens on is what is checked, not what it lists; listed, the folders listed
const listed = [], onList = [];
// resolves at the next folder the dialog lists
const nextListing = () => new Promise((ok) => onList.push(ok));
await ctx.route("https://www.googleapis.com/**", (route) => {
  const q = new URL(route.request().url()).searchParams.get("q");
  if (q) { listed.push(q.match(/'([^']+)' in parents/)[1]); onList.splice(0).forEach((ok) => ok()); }
  return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ files: [], name: "A folder" }) });
});
await ctx.route(offSite(origin, "https://www.googleapis.com/"), (r) => r.abort());
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
const page = await ctx.newPage();
page.on("pageerror", (e) => { failed = true; console.error("page error: " + e.message); });
page.setDefaultTimeout(10000);

// what the Drive dialog opens on, in the study at this address: the link in its field where it takes one, else the
// link of the folder it lists
const opensOn = async (address) => {
  await page.goto(origin + address);
  await page.waitForFunction(() => window.$ && $("#title").textContent);
  listed.length = 0;
  const listing = nextListing();
  await pressDrive(page);
  await page.waitForFunction(() => $("#drive-dlg").open);
  // the dialog has opened on something: a folder it lists, or the link in its field
  await Promise.race([listing, page.waitForFunction(() => window.$ && $("#drive-link")?.checkVisibility() && $("#drive-link").value).catch(() => {})]);
  const link = (await page.isVisible("#drive-link")) ? await page.inputValue("#drive-link") : listed.length ? folder(listed[listed.length - 1]) : "";
  await page.click("#drive-dlg button[value=close]");
  return link;
};
const paste = async (address, link) => {
  await page.goto(origin + address);
  await page.waitForFunction(() => window.$ && $("#title").textContent);
  await pressDrive(page);
  await page.fill("#drive-link", link); await page.click("#drive-go");
  await page.waitForFunction(() => !$("#drive-msg").textContent.includes("Reading"));
  await page.click("#drive-dlg button[value=close]");
};

try {
  check(/^https:\/\/drive\.google\.com\/drive\/folders\/[\w-]{10,}$/.test(NOR_FOLDER || ""), `the NoR study names its Drive folder: ${NOR_FOLDER}`);
  let at = await opensOn("/web/fixture");
  check(at === FIXTURE_FOLDER, `a study's dialog lists the folder its study.json names: ${at}`);
  at = await opensOn("/web/nor");
  check(at === NOR_FOLDER, `each study its own: ${at}`);

  // a link pasted in the Image Viewer
  await paste("/web/", PASTED);
  at = await opensOn("/web/");
  check(at === PASTED, `the Image Viewer's dialog opens on the link last pasted there: ${at}`);
  at = await opensOn("/web/fixture");
  check(at === FIXTURE_FOLDER, `a link pasted elsewhere leaves a study's folder: ${at}`);
  check(!(await page.evaluate(() => { $("#load-drive").click(); return $("#drive-link").checkVisibility(); })), "and a study's dialog has no link to paste");
} catch (e) {
  failed = true; console.error(e);
}
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
