// Drives the page (web/) in headless Chromium, its /api/ answered by the site's real server (accounts/worker.js)
// over a stand-in KV store, with a stand-in for Google's sign-in script, and checks 1.48: a visitor who never
// signs in sees the menu as before, loads nothing from Google and only asks the server whether they have a
// session; signing in on one device shows the user and saves that device's settings that follow the user, not
// the ones that stay; a change there is saved; signing in on a second device brings them, the theme at once,
// and leaves its own left bar alone; a reload stays signed in; signing out keeps this device's settings; and a
// server with no Google client offers no sign-in.
// Optional SHOTS: a directory for screenshots.
// Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/account_driver.mjs [SHOTS]
import { repoFile } from "./repo_file.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { generateKeyPairSync, createSign } from "node:crypto";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import worker from "../accounts/worker.js";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const [shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Google: its signing key, as the server fetches it, and a sign-in token for one user
const CLIENT = "acme-client.apps.googleusercontent.com";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const JWKS = { keys: [{ ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" }] };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => (String(url) === "https://www.googleapis.com/oauth2/v3/certs"
  ? new Response(JSON.stringify(JWKS), { headers: { "content-type": "application/json" } }) : realFetch(url, init));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
let origin;
const token = () => {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "RS256", kid: "k1", typ: "JWT" }) + "." + b64({ iss: "https://accounts.google.com", aud: CLIENT, sub: "1001",
    email: "ada@acme.example", email_verified: true, name: "Ada Lovelace", picture: origin + "/web/logo.svg", iat: now, exp: now + 3600 });
  return head + "." + createSign("RSA-SHA256").update(head).sign(privateKey).toString("base64url");
};
// Google's sign-in script: its button signs the user in at once
const GSI = (t) => `window.google = { accounts: { id: {
  initialize(o) { this.cb = o.callback; },
  renderButton(el) { el.innerHTML = '<button type="button" id="gsi-stub">Sign in with Google</button>'; el.firstChild.onclick = () => this.cb({ credential: ${JSON.stringify(t)} }); },
  disableAutoSelect() { window.autoSelectOff = true; },
} } };`;

const store = new Map();
const env = {
  GOOGLE_CLIENT_ID: CLIENT,
  ACCOUNTS: {
    get: async (k, type) => (store.has(k) ? (type === "json" ? JSON.parse(store.get(k)) : store.get(k)) : null),
    put: async (k, v) => { store.set(k, v); },
    delete: async (k) => { store.delete(k); },
  },
};
const record = () => JSON.parse(store.get("settings:1001") || "null");
const api = []; // [method path] the page sent to the server
const CONFIG = `window.NOR_CONFIG = { google: { apiKey: "" }, drive: { defaultLink: "" } };`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer(async (q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u.startsWith("/api/")) {
    api.push(`${q.method} ${u}`);
    const chunks = [];
    for await (const c of q) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const res = await worker.fetch(new Request(origin + q.url, { method: q.method, headers: q.headers, body: ["GET", "HEAD"].includes(q.method) ? undefined : body }), env);
    r.writeHead(res.status, Object.fromEntries(res.headers)); return r.end(Buffer.from(await res.arrayBuffer()));
  }
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(""); }
  if (u === "/web/config.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(CONFIG); }
  const f = repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "localhost", ok));
origin = `http://localhost:${server.address().port}`;

const browser = await pw.chromium.launch();
let failed = false;
const check = (ok, what) => { if (!ok) { failed = true; console.error("FAILED: " + what); } else console.log("ok: " + what); };
const until = async (fn, ms = 5000) => { for (const end = Date.now() + ms; Date.now() < end; await new Promise((ok) => setTimeout(ok, 50))) if (await fn()) return true; return false; };

let gsiLoads = 0;
async function device(seed) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route("https://accounts.google.com/gsi/client", (route) => { gsiLoads++; route.fulfill({ status: 200, contentType: "text/javascript", body: GSI(token()) }); });
  await ctx.route((u) => !u.href.startsWith(origin) && u.href !== "https://accounts.google.com/gsi/client", (r) => r.abort());
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
  await page.waitForSelector("#gsi-stub");
  await page.click("#gsi-stub");
  await page.waitForFunction(() => !document.querySelector("#sign-out").hidden);
};
const local = (page, k) => page.evaluate((k) => localStorage.getItem(k), k);
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name + ".png"), clip: { x: 1000, y: 0, width: 400, height: 260 } }); };

try {
  // device A: used before, never signed in
  const a = await device({ "nor-theme": "dark", "nor-tips-closed": JSON.stringify(["recent-files"]), "nor-bars-v1": JSON.stringify({ left: 300 }) });
  await until(() => api.length);
  await new Promise((ok) => setTimeout(ok, 300));
  check(api.join() === "GET /api/session", "a visitor's page asks the server only whether they have a session");
  check(gsiLoads === 0, "nothing is loaded from Google before the menu is opened");
  check(await a.page.textContent("#who-where") === "On this device, not signed in" && await a.page.isHidden("#sign-out"), "not signed in, the menu says so");
  await a.page.click("#user-menu summary");
  await a.page.waitForSelector("#gsi-stub");
  check(gsiLoads === 1 && await a.page.isVisible("#manage-storage"), "opening the menu offers Sign in with Google beside Manage storage");
  await shot(a.page, "account_signed_out");
  await a.page.click("#gsi-stub");
  await a.page.waitForFunction(() => !document.querySelector("#sign-out").hidden);
  check(await a.page.textContent("#who-name") === "Ada Lovelace" && await a.page.textContent("#who-where") === "ada@acme.example",
    "signed in, the menu names the user");
  check(await a.page.evaluate(() => document.querySelector("#user-menu summary .avatar").tagName === "IMG" && document.querySelector("#sign-in").hidden),
    "the avatar is the user's picture, and Sign in is gone");
  await shot(a.page, "account_signed_in");
  check(await until(() => record()?.["nor-theme"] === "dark"), "a first sign-in saves this device's settings");
  check(record()?.["nor-tips-closed"] === JSON.stringify(["recent-files"]) && !("nor-bars-v1" in (record() || {})),
    "the record holds the settings that follow the user, not the left bar's width");
  await a.page.click("body", { position: { x: 700, y: 500 } });
  await a.page.click("#theme");
  check(await until(() => record()?.["nor-theme"] === "light"), "switching to light while signed in saves it");

  // device B: its own theme and left bar
  api.length = 0;
  const b = await device({ "nor-theme": "dark", "nor-bars-v1": JSON.stringify({ left: 400 }) });
  check(await b.page.evaluate(() => document.documentElement.dataset.theme) === "dark", "a second device starts in its own theme");
  await signInVia(b.page);
  check(await b.page.evaluate(() => document.documentElement.dataset.theme) === "light", "signing in there brings the user's theme at once");
  check(await local(b.page, "nor-tips-closed") === JSON.stringify(["recent-files"]), "and the tips they closed elsewhere");
  check(await local(b.page, "nor-bars-v1") === JSON.stringify({ left: 400 }), "and leaves this device's left bar alone");
  check(record()?.["nor-theme"] === "light", "bringing the record does not overwrite it");

  await b.page.reload();
  await b.page.waitForFunction(() => !document.querySelector("#sign-out").hidden);
  check(await b.page.textContent("#who-name") === "Ada Lovelace", "a reload stays signed in");

  await b.page.click("#user-menu summary");
  await b.page.click("#sign-out");
  await b.page.waitForFunction(() => document.querySelector("#sign-out").hidden);
  check(await b.page.textContent("#who-where") === "On this device, not signed in" && await b.page.evaluate(() => document.querySelector("#user-menu summary .avatar").tagName === "svg"),
    "signing out shows the device's own avatar again");
  check(await local(b.page, "nor-theme") === "light", "and keeps this device's settings");
  await b.page.reload();
  await b.page.waitForFunction(() => document.querySelector("#title").textContent);
  await new Promise((ok) => setTimeout(ok, 300));
  check(await b.page.isHidden("#sign-out"), "a reload after signing out stays signed out");
  await b.page.click("#theme");
  await new Promise((ok) => setTimeout(ok, 800));
  check(record()?.["nor-theme"] === "light", "a change after signing out is not saved for the user");

  // a server with no Google client
  env.GOOGLE_CLIENT_ID = "";
  const loads = gsiLoads;
  const c = await device({});
  await c.page.click("#user-menu summary");
  await new Promise((ok) => setTimeout(ok, 500));
  check(gsiLoads === loads && await c.page.isHidden("#sign-in") && await c.page.isVisible("#manage-storage"), "with no Google client, the menu offers no sign-in");
} catch (e) {
  failed = true; console.error("FAILED: " + (e.stack || e));
} finally {
  await browser.close(); server.close();
}
process.exit(failed ? 1 : 0);
