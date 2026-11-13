// Drives the Image Viewer in headless Chromium, signed in, against stand-ins for Google's sign-in script and a Drive
// holding one private folder only the user's token reaches. Checks req/shell/drive/renewal: with the token run out, a
// click that reads Drive renews it once, silently, and the read goes on with the new token; a click in the token's
// last ten minutes renews it while the read goes on at once; a click with a fresh token asks nothing; a read with no
// click behind it opens nothing and says to click again, as does one whose click Google's window answered with no
// token.
// The control clicked is one the test adds, reading Drive the way any of the page's controls does: the renewal
// belongs to the read, not to a list of controls.
// Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/drive_renewal_driver.mjs
import { repoFile } from "./repo_file.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { offSite } from "./off_site.mjs";
import { ENGINE } from "./engine.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OLD = "old-token", NEW = "renewed-token", PRIVATE = "privatefolder0000001";
const SCOPES = "openid email profile https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.readonly";
const CONFIG = `window.NOR_CONFIG = { google: { apiKey: "stand-in-key", clientId: "123456-stand.apps.googleusercontent.com" } };`;
// Google's script: its token client records each request and answers it a moment later, as Google's window does,
// with a new token, or, while window.gsiRefuses is set, by the window closing with none
const GSI = `window.google = { accounts: { oauth2: { initTokenClient(o) {
  window.asked = [];
  return { requestAccessToken(opts) { window.asked.push(opts || {});
    setTimeout(() => window.gsiRefuses ? o.error_callback({ type: "popup_closed" }) : o.callback({ access_token: "${NEW}", expires_in: 3599, scope: "${SCOPES}" }), 300); } };
} } } };`;
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

// a signed-in page whose token lasts `left` ms more (negative: ran out that long ago); reads: the bearer of each
// read of the private folder
async function session(left) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const reads = [], cors = { "access-control-allow-origin": "*" };
  const json = (route, body, status = 200) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
  await ctx.route("https://accounts.google.com/gsi/client", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: GSI }));
  await ctx.route("https://www.googleapis.com/**", (route) => {
    const req = route.request(), u = new URL(req.url());
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-headers": "*" } });
    const bearer = (req.headers().authorization || "").replace(/^Bearer /, "") || null;
    if (bearer !== OLD && bearer !== NEW) return json(route, { error: { code: 401, message: "no live token" } }, 401);
    // the settings sync, not a read this checks
    if (u.searchParams.get("spaces") === "appDataFolder" || u.pathname.startsWith("/upload/")) return json(route, { files: [], id: "settings" });
    if ((u.searchParams.get("q") || "").includes(`'${PRIVATE}' in parents`)) {
      reads.push(bearer);
      return json(route, { files: [{ id: "privateimage00000001", name: "private.png", mimeType: "image/png", size: "10" }] });
    }
    return json(route, { error: { code: 404, message: "File not found" } }, 404);
  });
  await ctx.route(offSite(origin, "https://www.googleapis.com/", "https://accounts.google.com/"), (r) => r.abort());
  await ctx.addInitScript(({ who, folder }) => {
    delete Navigator.prototype.serviceWorker;
    localStorage.setItem("nor-google-sign-in", JSON.stringify(who));
    localStorage.setItem("nor-welcome", JSON.stringify({ choice: "google", remember: true }));
    // a control of the test's own that reads Drive in its click, as the page's own Drive controls do
    addEventListener("DOMContentLoaded", () => {
      const b = Object.assign(document.createElement("button"), { id: "test-read", textContent: "read" });
      b.style.cssText = "position:fixed;left:0;bottom:0;z-index:99999";
      b.onclick = () => import("/web/drive.js").then(({ remote }) => remote.list(folder, ".png")).then((l) => (b.dataset.got = l.map((f) => f.name).join()), (e) => (b.dataset.got = "error: " + e.message));
      document.body.append(b);
    });
  }, { who: { user: { name: "Tester", email: "tester@example.com", picture: null }, token: OLD, until: Date.now() + left, scopes: SCOPES }, folder: PRIVATE });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { failed = true; console.error("page error: " + e.message); });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/viewer");
  await page.waitForFunction(() => window.$ && $("#title").textContent);
  return { ctx, page, reads };
}
// what the test's control read once clicked, and what Google's window was asked meanwhile
async function click(page) {
  await page.evaluate(() => { delete $("#test-read").dataset.got; });
  await page.click("#test-read");
  const got = await (await page.waitForFunction(() => $("#test-read").dataset.got)).jsonValue();
  return { got, asked: await page.evaluate(() => window.asked || []) };
}

{
  const { ctx, page, reads } = await session(-3600e3);
  const { got, asked } = await click(page);
  check(got === "private.png", "with the token run out, one click on a control that reads Drive reads it", got);
  check(asked.length === 1 && asked[0].prompt === "" && asked[0].login_hint === "tester@example.com", "and asks Google once, silently, for the same user", asked);
  check(reads.length === 1 && reads[0] === NEW, "and the read carries the renewed token", reads);
  await ctx.close();
}
{
  const { ctx, page, reads } = await session(5 * 60e3);
  const { got, asked } = await click(page);
  check(got === "private.png" && reads[0] === OLD, "in the token's last ten minutes, a click reads Drive at once with the token it still has", { got, reads });
  check(asked.length === 1, "and renews the token early", asked);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("nor-google-sign-in")).token === "renewed-token");
  const again = await click(page);
  check(again.asked.length === 1 && reads.at(-1) === NEW, "and the next click reads with the renewed token, asking nothing more", { again, reads });
  await ctx.close();
}
{
  const { ctx, page } = await session(50 * 60e3);
  const { got, asked } = await click(page);
  check(got === "private.png" && asked.length === 0, "with a fresh token, a click reads Drive and asks Google nothing", { got, asked });
  await ctx.close();
}
{
  const { ctx, page, reads } = await session(-3600e3);
  // a read once the user activation a test's evaluate itself carries (5 s) is over: no click behind it
  const err = await page.evaluate((id) => new Promise((ok) => setTimeout(ok, 5500))
    .then(() => import("/web/drive.js")).then(({ remote }) => remote.list(id, ".png")).then(() => "listed", (e) => e.message), PRIVATE);
  const asked = await page.evaluate(() => (window.asked || []).length);
  check(/click again/.test(err) && asked === 0 && reads.length === 0, "a read with no click behind it opens nothing and says to click again", { err, asked, reads });
  await page.evaluate(() => { window.gsiRefuses = true; });
  const refused = await click(page);
  check(/^error: .*click again/.test(refused.got) && refused.asked.length === 1 && reads.length === 0, "a click Google's window answers with no token fails saying to click again", { refused, reads });
  await ctx.close();
}

await browser.close(); server.close();
process.exit(failed ? 1 : 0);
