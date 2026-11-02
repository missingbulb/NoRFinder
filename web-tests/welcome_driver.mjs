// Drives the page (web/) in headless Chromium against stand-ins for Google's sign-in script and account details,
// and checks 1.58: where the site has a Google client, opening the page fades it behind a popup offering Sign in
// with Google or Continue anonymously, with Remember this choice unticked; unticked, the popup comes back on the
// next visit, signed in or not, and there Continue anonymously signs out; ticked, signed in opens signed in with no
// popup, and anonymously opens with no popup but a tip beside the avatar, until closed; signing out from the menu
// brings the popup back; Escape changes nothing; Google's script loads only once the user reaches for its button;
// offline, Sign in with Google is held and a line says it can wait for the network; with no Google client there is
// no popup.
// Optional SHOTS: a directory for screenshots.
// Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/welcome_driver.mjs [SHOTS]
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
const [shots] = process.argv.slice(2);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const GSI = "https://accounts.google.com/gsi/client";
let clientId = "acme-client.apps.googleusercontent.com";
const SCRIPT = `window.google = { accounts: { oauth2: { initTokenClient(o) {
  window.tokenClient = { asked: [] };
  return { requestAccessToken(opts) { window.tokenClient.asked.push(opts || {}); setTimeout(() => o.callback({ access_token: "tok", expires_in: 3599 })); } };
} } } };`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(""); }
  if (u === "/web/config.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(`window.NOR_CONFIG = { google: { apiKey: "", clientId: ${JSON.stringify(clientId)} } };`); }
  const f = repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PATCH" };

const browser = await pw.chromium.launch();
let failed = false;
const check = (ok, what) => { if (!ok) { failed = true; console.error("FAILED: " + what); } else console.log("ok: " + what); };
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

let scriptLoads = 0;
// a device: its own browser storage; offline, the browser says so
async function device({ offline = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route(GSI, (route) => { scriptLoads++; route.fulfill({ status: 200, contentType: "text/javascript", body: SCRIPT }); });
  await ctx.route(/^https:\/\/(www|openidconnect)\.googleapis\.com\//, (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const u = new URL(route.request().url());
    const body = u.pathname === "/v1/userinfo" ? { name: "Ada Lovelace", email: "ada@acme.example" } : u.pathname === "/drive/v3/files" ? { files: [] } : { id: "acmefile" };
    route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
  });
  await ctx.route((u) => !u.href.startsWith(origin) && u.href !== GSI && !/^https:\/\/(www|openidconnect)\.googleapis\.com\//.test(u.href), (r) => r.abort());
  await ctx.addInitScript((offline) => {
    delete Navigator.prototype.serviceWorker;
    if (offline) { window.netDown = true; Object.defineProperty(Navigator.prototype, "onLine", { get: () => !window.netDown }); }
  }, offline);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { failed = true; console.error("page error: " + e.message); });
  page.setDefaultTimeout(10000);
  const open = async () => { await page.goto(origin + "/web/index.html"); await page.waitForFunction(() => document.querySelector("#title").textContent); await pause(300); };
  await open();
  return { ctx, page, open };
}
const popup = (page) => page.evaluate(() => { const d = document.querySelector("#welcome-dlg"); return !!d && d.open && d.matches(":modal"); });
const signedIn = (page) => page.evaluate(() => !document.querySelector("#sign-out").hidden);
const signInTip = (page) => page.evaluate(() => {
  const t = document.querySelector('.tip-bubble[data-tip="sign-in"]'), a = document.querySelector("#user-menu summary");
  if (!t) return null;
  const r = t.getBoundingClientRect(), ar = a.getBoundingClientRect();
  return { text: t.textContent, inside: r.left >= 0 && r.right <= innerWidth, below: r.top >= ar.bottom && r.top - ar.bottom < 30, under: r.left < ar.right && r.right > ar.left };
});
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name + ".png") }); };

try {
  // a first visit
  const a = await device();
  check(await popup(a.page), "opening the page fades it behind the sign-in popup");
  check(await a.page.evaluate(() => {
    const d = document.querySelector("#welcome-dlg");
    return /Sign in with Google/.test(d.querySelector("#welcome-google").textContent) && /anonymous/i.test(d.querySelector("#welcome-anonymous").textContent)
      && !d.querySelector("#welcome-remember").checked && getComputedStyle(d, "::backdrop").backgroundColor !== "rgba(0, 0, 0, 0)";
  }), "it offers Sign in with Google and Continue anonymously, Remember this choice unticked, over a faded page");
  check(scriptLoads === 0, "the popup loads nothing from Google by itself");
  await shot(a.page, "welcome");

  // Escape changes nothing
  await a.page.keyboard.press("Escape");
  check(!(await popup(a.page)), "Escape closes it");
  await a.open();
  check(await popup(a.page), "and it comes back on the next visit");

  // anonymously, not remembered
  await a.page.click("#welcome-anonymous");
  check(!(await popup(a.page)) && !(await signedIn(a.page)) && scriptLoads === 0, "Continue anonymously closes it, signed out, loading nothing from Google");
  check(!(await signInTip(a.page)), "and shows no tip while the choice is not remembered");
  await a.open();
  check(await popup(a.page), "unticked, the popup comes back on the next visit");

  // anonymously, remembered
  await a.page.check("#welcome-remember");
  await a.page.click("#welcome-anonymous");
  await a.open();
  check(!(await popup(a.page)), "ticked, the next visit opens with no popup");
  const t = await signInTip(a.page);
  check(t && /sign in/i.test(t.text) && /settings/i.test(t.text) && /data files/i.test(t.text), "a tip suggests signing in to keep the settings everywhere and reach the data files: " + t?.text);
  check(t && t.inside && t.below && t.under, "beside the avatar, inside the window: " + JSON.stringify(t));
  check(scriptLoads === 0, "an anonymous visit loads nothing from Google");
  await shot(a.page, "welcome_tip");
  await a.page.click('.tip-bubble[data-tip="sign-in"] .x');
  await a.open();
  check(!(await popup(a.page)) && !(await signInTip(a.page)), "the tip, once closed, does not come back");

  // signed in, not remembered
  const b = await device();
  await b.page.hover("#welcome-google");
  check(await b.page.waitForFunction(() => window.google).then(() => true, () => false), "reaching for Sign in with Google loads Google's script");
  await b.page.click("#welcome-google");
  check(await b.page.waitForFunction(() => !document.querySelector("#sign-out").hidden).then(() => true, () => false) && !(await popup(b.page)),
    "Sign in with Google signs the user in and closes the popup");
  await b.open();
  check(await popup(b.page) && await signedIn(b.page), "unticked, the next visit, still signed in, shows the popup again");
  check(/Ada Lovelace/.test(await b.page.textContent("#welcome-dlg")), "naming who is signed in");
  await b.page.click("#welcome-anonymous");
  check(!(await signedIn(b.page)) && await b.page.evaluate(() => localStorage.getItem("nor-google-sign-in")) === null, "there Continue anonymously signs out");

  // signed in, remembered
  await b.open();
  await b.page.check("#welcome-remember");
  await b.page.click("#welcome-google");
  await b.page.waitForFunction(() => !document.querySelector("#sign-out").hidden);
  await b.open();
  check(!(await popup(b.page)) && await signedIn(b.page), "ticked, the next visit opens signed in with no popup");
  check(!(await signInTip(b.page)), "and no sign-in tip");
  await b.page.click("#user-menu summary");
  await b.page.click("#sign-out");
  await b.open();
  check(await popup(b.page), "signing out from the menu brings the popup back");

  // signing in from the menu counts as remembered
  await b.page.keyboard.press("Escape");
  await b.page.click("#user-menu summary");
  await b.page.waitForFunction(() => window.tokenClient);
  await b.page.click("#sign-in");
  await b.page.waitForFunction(() => !document.querySelector("#sign-out").hidden);
  await b.open();
  check(!(await popup(b.page)) && await signedIn(b.page), "signing in from the menu counts as remembered");

  // offline
  const loads = scriptLoads;
  const c = await device({ offline: true });
  check(await popup(c.page), "offline, the popup still comes");
  const off = await c.page.evaluate(() => ({ held: document.querySelector("#welcome-google").getAttribute("aria-disabled") === "true", note: document.querySelector("#welcome-offline"), }));
  check(off.held, "Sign in with Google is held");
  check(await c.page.isVisible("#welcome-offline") && /online/i.test(await c.page.textContent("#welcome-offline")), "and a line says signing in can wait until the network is back");
  await shot(c.page, "welcome_offline");
  await c.page.hover("#welcome-google");
  await c.page.click("#welcome-google", { force: true });
  await pause(300);
  check(scriptLoads === loads && await popup(c.page), "clicking it offline reaches nothing and leaves the popup up");
  await c.page.evaluate(() => { window.netDown = false; dispatchEvent(new Event("online")); });
  check(await c.page.isHidden("#welcome-offline") && await c.page.evaluate(() => document.querySelector("#welcome-google").getAttribute("aria-disabled") !== "true"),
    "back online, Sign in with Google is offered again");
  await c.page.evaluate(() => { window.netDown = true; dispatchEvent(new Event("offline")); });
  await c.page.click("#welcome-anonymous");
  check(!(await popup(c.page)), "and offline, Continue anonymously works");

  // no Google client
  clientId = "";
  const d = await device();
  check(!(await popup(d.page)) && !(await signInTip(d.page)), "with no Google client there is no popup and no tip");
} catch (e) {
  failed = true; console.error("FAILED: " + (e.stack || e));
} finally {
  await browser.close(); server.close();
}
process.exit(failed ? 1 : 0);
