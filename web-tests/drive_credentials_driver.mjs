// Drives the Image Viewer's Google Drive dialog in headless Chromium against a stand-in Drive holding a public folder,
// which the site's API key reaches, and a private one, which only the signed-in user's token reaches. Checks
// req/shell/drive/credentials: signed in, every Drive read carries the token and never the key, the private folder
// lists and its image downloads; signed out, reads carry the key alone and the private folder is refused; signed in
// with the token run out, no read falls back to the key.
// Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/drive_credentials_driver.mjs
import { repoFile } from "./repo_file.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { offSite } from "./off_site.mjs";
import { ENGINE } from "./engine.mjs";
import { pressDrive } from "./drive_open.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEY = "stand-in-key", TOKEN = "stand-in-token";
const PUBLIC = "publicfolder00000001", PRIVATE = "privatefolder0000001", IMAGE = "privateimage00000001";
const PNG = fs.readFileSync(path.join(repo, "studies", "viewer", "web", "icon.svg"));
const CONFIG = `window.NOR_CONFIG = { google: { apiKey: "${KEY}", clientId: "123456-stand.apps.googleusercontent.com" } };`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(""); }
  if (u === "/web/config.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(CONFIG); }
  const f = repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await pw[ENGINE].launch();
let failed = false;
const check = (ok, what, seen) => { if (!ok) { failed = true; console.error("FAILED: " + what + (seen === undefined ? "" : ": " + JSON.stringify(seen))); } else console.log("ok: " + what); };

// a session's page, signed in with `who` (null: signed out); reads: each Drive request, {key, bearer, url}
async function session(who) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const reads = [], cors = { "access-control-allow-origin": "*" };
  const json = (route, body, status = 200) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
  await ctx.route("https://www.googleapis.com/**", (route) => {
    const req = route.request(), u = new URL(req.url());
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-headers": "*" } });
    // the settings sync, not a read this checks
    if (u.searchParams.get("spaces") === "appDataFolder" || u.pathname.startsWith("/upload/")) return json(route, { files: [], id: "settings" });
    const key = u.searchParams.get("key"), bearer = (req.headers().authorization || "").replace(/^Bearer /, "") || null;
    reads.push({ key, bearer, url: u.pathname + u.search });
    // Google answers a request carrying both by the token; the user's token sees both folders, the key the public one
    const user = bearer === TOKEN, site = !bearer && key === KEY;
    const parent = (u.searchParams.get("q") || "").match(/'([^']+)' in parents/)?.[1];
    const id = parent || decodeURIComponent(u.pathname.split("/").pop());
    const sees = id === PUBLIC ? user || site : (id === PRIVATE || id === IMAGE) && user;
    if (!sees) return json(route, { error: { code: 404, message: "File not found" } }, 404);
    if (parent) return json(route, { files: [{ id: IMAGE, name: "private.png", mimeType: "image/png", size: String(PNG.length) }] });
    if (u.searchParams.get("alt") === "media") return route.fulfill({ status: 200, headers: cors, contentType: "image/png", body: PNG });
    return json(route, { id, name: id === PRIVATE ? "Private folder" : "private.png", mimeType: "image/png" });
  });
  await ctx.route(offSite(origin, "https://www.googleapis.com/"), (r) => r.abort());
  await ctx.addInitScript((who) => {
    delete Navigator.prototype.serviceWorker;
    if (who) localStorage.setItem("nor-google-sign-in", JSON.stringify(who));
    localStorage.setItem("nor-welcome", JSON.stringify({ choice: who ? "google" : "anonymous", remember: true }));
  }, who);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { failed = true; console.error("page error: " + e.message); });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/viewer");
  await page.waitForFunction(() => window.$ && $("#title").textContent);
  return { ctx, page, reads };
}
// the dialog's answer to a pasted folder link: the names it lists, else its message
async function listFolder(page, id) {
  await pressDrive(page);
  await page.waitForFunction(() => $("#remote-dlg").open);
  await page.fill("#remote-link", `https://drive.google.com/drive/folders/${id}`);
  await page.click("#remote-go");
  await page.waitForFunction(() => $("#remote-list .item") || /refused|not found|sign/i.test($("#remote-dlg").textContent));
  const names = await page.$$eval("#remote-list .item", (rows) => rows.map((r) => r.textContent));
  const text = await page.evaluate(() => $("#remote-dlg").textContent);
  await page.click("#remote-dlg button[value=close]");
  return { names, text };
}

const SCOPES = "openid email profile https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.readonly";
const user = { name: "Tester", email: "tester@example.com", picture: null };

{
  const { ctx, page, reads } = await session({ user, token: TOKEN, until: Date.now() + 3600e3, scopes: SCOPES });
  const got = await listFolder(page, PRIVATE);
  check(got.names.some((n) => n.includes("private.png")), "signed in, the dialog lists a private folder the user's account can see", got);
  const bytes = await page.evaluate((id) => import("/web/drive.js").then(({ remote }) => remote.file(id)).then((f) => f.bytes.byteLength, (e) => e.message), IMAGE);
  check(bytes === PNG.length, "signed in, an image in the private folder downloads", bytes);
  check(reads.length > 0 && reads.every((r) => r.bearer === TOKEN), "signed in, every Drive read carries the user's token", reads);
  check(reads.every((r) => r.key === null), "signed in, no Drive read carries the site's API key", reads);
  await ctx.close();
}
{
  const { ctx, page, reads } = await session(null);
  const pub = await listFolder(page, PUBLIC);
  check(pub.names.some((n) => n.includes("private.png")), "signed out, the dialog lists a public folder", pub);
  const priv = await listFolder(page, PRIVATE);
  check(!priv.names.length, "signed out, a private folder lists nothing", priv);
  check(reads.length > 0 && reads.every((r) => r.key === KEY && r.bearer === null), "signed out, every Drive read carries the site's API key alone", reads);
  await ctx.close();
}
{
  // the token ran out an hour ago; nothing renews it without the user's click on Google's window
  const { ctx, page, reads } = await session({ user, token: TOKEN, until: Date.now() - 3600e3, scopes: SCOPES });
  const err = await page.evaluate((id) => import("/web/drive.js").then(({ remote }) => remote.list(id)).then(() => "listed", (e) => e.message), PUBLIC);
  check(err !== "listed" && reads.every((r) => r.key === null), "signed in with the token run out, no read falls back to the site's API key", { err, reads });
  await ctx.close();
}

await browser.close(); server.close();
process.exit(failed ? 1 : 0);
