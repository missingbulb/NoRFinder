// Drives the page (web/) in headless Chromium against stand-ins for Google's sign-in script, its account details
// and the Drive API's app folder, and checks 1.50: a visitor who never signs in loads nothing from Google; signing
// in asks Google for the user's name, email and picture and the app's own Drive folder, nothing else of their
// Drive; the first sign-in starts the user's settings file from this device's settings that follow the user, not
// the ones that stay; a change is saved; a second device signing in takes the file's settings, the theme at once,
// and keeps its own left bar; a reload within the hour syncs with no click; once the token has run out a click
// that needs nothing from Google opens nothing, while changing a setting or opening Load's dropdown renews it in
// that click, silently, and syncs; signing out
// keeps this device's settings and saves nothing more; a site with no Google client offers no sign-in; and the
// page reaches no address but these.
// Optional SHOTS: a directory for screenshots.
// Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/account_driver.mjs [SHOTS]
import { repoFile } from "./repo_file.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { isDeepStrictEqual as same } from "node:util";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CLIENT = "acme-client.apps.googleusercontent.com";
const GSI = "https://accounts.google.com/gsi/client";
let origin, clientId = CLIENT;
// Google's script: its token client answers each request at once with a new token, recording what it was asked
const SCRIPT = `window.google = { accounts: { oauth2: { initTokenClient(o) {
  window.tokenClient = { client: o.client_id, scope: o.scope, asked: [] };
  return { requestAccessToken(opts) { window.tokenClient.asked.push(opts || {}); setTimeout(() => o.callback({ access_token: "tok-" + Date.now(), expires_in: 3599 })); } };
} } } };`;

// the user's app folder in Drive: at most one file, and every request the page made to Google
const drive = { file: null, nextId: 1, validFrom: 0 }; // validFrom: Google refuses a token issued before it (ms)
const seen = [];
const file = () => (drive.file ? JSON.parse(drive.file.body) : null);
const CONFIG = () => `window.NOR_CONFIG = { google: { apiKey: "", clientId: ${JSON.stringify(clientId)} } };`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(""); }
  if (u === "/web/config.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(CONFIG()); }
  const f = repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
origin = `http://127.0.0.1:${server.address().port}`;

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PATCH" };
async function google(route) {
  const q = route.request(), u = new URL(q.url());
  if (q.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  seen.push(`${q.method()} ${u.origin}${u.pathname}${u.search}`);
  const json = (status, body) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
  const issued = +((q.headers()["authorization"] || "").match(/^Bearer tok-(\d+)$/) || [])[1];
  if (!issued || issued < drive.validFrom) return json(401, { error: "no live token" });
  if (u.href === "https://openidconnect.googleapis.com/v1/userinfo")
    return json(200, { sub: "1001", name: "Ada Lovelace", email: "ada@acme.example", picture: origin + "/web/logo.svg" });
  if (u.pathname === "/drive/v3/files" && q.method() === "GET")
    return json(200, { files: u.searchParams.get("spaces") === "appDataFolder" && drive.file && u.searchParams.get("q").includes(drive.file.name) ? [{ id: drive.file.id }] : [] });
  if (drive.file && u.pathname === `/drive/v3/files/${drive.file.id}` && u.searchParams.get("alt") === "media")
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: drive.file.body });
  if (u.pathname === "/upload/drive/v3/files" && q.method() === "POST") {
    const body = q.postDataBuffer().toString("utf8");
    const parts = body.split(/\r\n--[^\r\n]+/).map((p) => p.split("\r\n\r\n").slice(1).join("\r\n\r\n")).filter(Boolean);
    const meta = JSON.parse(parts[0]);
    drive.file = { id: "acmefile" + drive.nextId++, name: meta.name, parents: meta.parents, body: parts[1] };
    return json(200, { id: drive.file.id });
  }
  if (drive.file && u.pathname === `/upload/drive/v3/files/${drive.file.id}` && q.method() === "PATCH") {
    drive.file.body = q.postData(); return json(200, { id: drive.file.id });
  }
  return json(404, { error: "not a call this test knows" });
}

const browser = await pw.chromium.launch();
let failed = false;
const check = (ok, what) => { if (!ok) { failed = true; console.error("FAILED: " + what); } else console.log("ok: " + what); };
const until = async (fn, ms = 5000) => { for (const end = Date.now() + ms; Date.now() < end; await new Promise((ok) => setTimeout(ok, 50))) if (await fn()) return true; return false; };
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

let scriptLoads = 0;
const outside = []; // every address outside the page's own the browser was asked for
async function device(seed) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  ctx.on("request", (q) => { if (!q.url().startsWith(origin)) outside.push(new URL(q.url()).origin + new URL(q.url()).pathname); });
  await ctx.route(GSI, (route) => { scriptLoads++; route.fulfill({ status: 200, contentType: "text/javascript", body: SCRIPT }); });
  await ctx.route(/^https:\/\/(www|openidconnect)\.googleapis\.com\//, google);
  await ctx.route((u) => !u.href.startsWith(origin) && u.href !== GSI && !/^https:\/\/(www|openidconnect)\.googleapis\.com\//.test(u.href), (r) => r.abort());
  await ctx.addInitScript((seed) => {
    delete Navigator.prototype.serviceWorker;
    if (sessionStorage.getItem("primed")) return;
    sessionStorage.setItem("primed", "1");
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, seed);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { failed = true; console.error("page error: " + e.message); });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/index.html");
  await page.waitForFunction(() => document.querySelector("#title").textContent);
  return { ctx, page };
}
const signInVia = async (page) => {
  await page.click("#user-menu summary");
  await page.click("#sign-in");
  await page.waitForFunction(() => !document.querySelector("#sign-out").hidden);
};
const local = (page, k) => page.evaluate((k) => localStorage.getItem(k), k);
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name + ".png"), clip: { x: 1000, y: 0, width: 400, height: 260 } }); };

try {
  // device A: used before, never signed in
  const a = await device({ "nor-theme": "dark", "nor-tips-closed": JSON.stringify(["recent-files"]), "nor-bars-v1": JSON.stringify({ left: 300 }) });
  await pause(300);
  check(scriptLoads === 0 && outside.length === 0, "a visitor who never signs in loads nothing from Google");
  check(await a.page.textContent("#who-where") === "On this device, not signed in" && await a.page.isHidden("#sign-out"), "not signed in, the menu says so");
  await a.page.click("#user-menu summary");
  await a.page.waitForFunction(() => window.tokenClient);
  check(await a.page.isVisible("#sign-in") && await a.page.isVisible("#manage-storage"), "opening the menu offers Sign in with Google beside Manage storage");
  const asked = await a.page.evaluate(() => window.tokenClient);
  check(asked.client === CLIENT && asked.scope.split(" ").filter((s) => /drive/.test(s)).every((s) => s === "https://www.googleapis.com/auth/drive.appdata")
    && ["email", "profile"].every((s) => asked.scope.split(" ").includes(s)),
    "signing in asks for the user's name, email and picture and the app's own Drive folder, nothing else of their Drive");
  await shot(a.page, "account_signed_out");
  await a.page.click("#sign-in");
  await a.page.waitForFunction(() => !document.querySelector("#sign-out").hidden);
  check(await a.page.textContent("#who-name") === "Ada Lovelace" && await a.page.textContent("#who-where") === "ada@acme.example",
    "signed in, the menu names the user");
  check(await a.page.evaluate(() => document.querySelector("#user-menu summary .avatar").tagName === "IMG" && document.querySelector("#sign-in").hidden),
    "the avatar is the user's picture, and Sign in is gone");
  await shot(a.page, "account_signed_in");
  check(await until(() => file()?.["nor-theme"] === "dark"), "a first sign-in starts the user's settings file from this device's");
  check(same(drive.file.parents, ["appDataFolder"]), "the file is in the app's hidden folder in the user's Drive");
  check(file()["nor-tips-closed"] === JSON.stringify(["recent-files"]) && !("nor-bars-v1" in file()),
    "the file holds the settings that follow the user, not the left bar's width");
  await a.page.click("body", { position: { x: 700, y: 500 } });
  await a.page.click("#theme");
  check(await until(() => file()?.["nor-theme"] === "light"), "switching to light while signed in saves it to the file");

  // device B: its own theme and left bar
  const b = await device({ "nor-theme": "dark", "nor-bars-v1": JSON.stringify({ left: 400 }) });
  check(await b.page.evaluate(() => document.documentElement.dataset.theme) === "dark", "a second device starts in its own theme");
  await signInVia(b.page);
  check(await until(() => b.page.evaluate(() => document.documentElement.dataset.theme === "light")), "signing in there brings the user's theme at once");
  check(await local(b.page, "nor-tips-closed") === JSON.stringify(["recent-files"]), "and the tips they closed elsewhere");
  check(await local(b.page, "nor-bars-v1") === JSON.stringify({ left: 400 }), "and leaves this device's left bar alone");
  check(file()["nor-theme"] === "light", "bringing the file's settings does not overwrite the file");

  // another device changes the file; a reload within the hour takes it with no click
  drive.file.body = JSON.stringify({ ...file(), "nor-theme": "dark" });
  const asks = await b.page.evaluate(() => window.tokenClient.asked.length);
  await b.page.reload();
  await b.page.waitForFunction(() => !document.querySelector("#sign-out").hidden);
  check(await until(() => b.page.evaluate(() => document.documentElement.dataset.theme === "dark")), "a reload within the hour stays signed in and syncs with no click");
  check(await b.page.evaluate(() => !window.tokenClient || window.tokenClient.asked.length === 0) && asks === 1, "and asks Google for no new token");

  // the hour is up: Google asks again only in a click that needs it, silently, for the same user
  const expire = async () => {
    drive.validFrom = Date.now();
    await b.page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("nor-google-sign-in")); s.until = Date.now() - 1; localStorage.setItem("nor-google-sign-in", JSON.stringify(s));
      localStorage.removeItem("nor-seen-version"); // the page writes it again as it loads: a setting that changes with no click
    });
    await b.page.reload();
    await b.page.waitForFunction(() => !document.querySelector("#sign-out").hidden && window.tokenClient);
  };
  const askedNow = () => b.page.evaluate(() => window.tokenClient.asked.length);
  await expire();
  const before = seen.length;
  // to light, by a script, once the user activation a test's evaluate itself carries (5 s) is over
  await b.page.evaluate(() => setTimeout(() => document.querySelector("#theme").click(), 5500));
  await pause(6200);
  check(await local(b.page, "nor-theme") === "light" && await askedNow() === 0 && file()["nor-theme"] === "dark", "a change no user made asks Google for nothing");
  await b.page.mouse.click(700, 500);
  await pause(500);
  check(await askedNow() === 0 && seen.length === before, "with the token run out, neither the page's own writes nor a click that needs nothing from Google open anything or reach Drive");
  await b.page.click("#theme"); // back to dark
  await b.page.click("#theme"); // to light
  check(await until(() => file()?.["nor-theme"] === "light"), "changing a setting renews the token in that click and saves it");
  const renewal = (await b.page.evaluate(() => window.tokenClient.asked))[0];
  check(await askedNow() === 1 && renewal?.prompt === "" && renewal.login_hint === "ada@acme.example", "renewing asks Google once, silently, for the same user");

  drive.file.body = JSON.stringify({ ...file(), "nor-theme": "dark" }); // another device
  await expire();
  await b.page.click("#load-menu summary");
  check(await until(() => b.page.evaluate(() => document.documentElement.dataset.theme === "dark")), "opening Load's dropdown renews the token and brings the file's settings");
  check(await until(() => typeof file()?.["nor-seen-version"] === "string" && file()["nor-theme"] === "dark"),
    "the setting this device changed meanwhile is saved beside the other device's, not over it");
  await b.page.keyboard.press("Escape");
  await b.page.mouse.click(700, 500);

  await b.page.click("#user-menu summary");
  await b.page.click("#sign-out");
  await b.page.waitForFunction(() => document.querySelector("#sign-out").hidden);
  check(await b.page.textContent("#who-where") === "On this device, not signed in" && await b.page.evaluate(() => document.querySelector("#user-menu summary .avatar").tagName === "svg"),
    "signing out shows the device's own avatar again");
  check(await local(b.page, "nor-theme") === "dark" && await local(b.page, "nor-google-sign-in") === null, "and keeps this device's settings, forgetting the user and the token");
  await b.page.click("body", { position: { x: 700, y: 500 } });
  await b.page.click("#theme");
  await pause(800);
  check(file()["nor-theme"] === "dark", "a change after signing out is not saved to the user's file");
  await b.page.reload();
  await b.page.waitForFunction(() => document.querySelector("#title").textContent);
  check(await b.page.isHidden("#sign-out"), "a reload after signing out stays signed out");

  // a site with no Google client
  clientId = "";
  const loads = scriptLoads;
  const c = await device({});
  await c.page.click("#user-menu summary");
  await pause(500);
  check(scriptLoads === loads && await c.page.isHidden("#sign-in") && await c.page.isVisible("#manage-storage"), "with no Google client, the menu offers no sign-in");

  const services = new Set(outside);
  const known = (u) => u === GSI || u === "https://openidconnect.googleapis.com/v1/userinfo"
    || /^https:\/\/www\.googleapis\.com\/(upload\/)?drive\/v3\/files(\/acmefile\d+)?$/.test(u);
  check(services.size >= 4 && [...services].every(known), `the page reached only Google's sign-in script, account details and the Drive API (${[...services].join(", ")})`);
  check(seen.filter((s) => /drive\/v3\/files(\?|$)/.test(s) && s.startsWith("GET")).every((s) => /spaces=appDataFolder/.test(s)),
    "every Drive listing it made looked only in the app's own folder");
} catch (e) {
  failed = true; console.error("FAILED: " + (e.stack || e));
} finally {
  await browser.close(); server.close();
}
process.exit(failed ? 1 : 0);
