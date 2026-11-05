// Drives the page (web/) in headless Chromium against stand-ins for Google's sign-in script and account details,
// and checks req/shell/account/welcome: where the site has a Google client, opening the page fades it behind a popup offering Sign in
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
import { offSite } from "./off_site.mjs";
import { ENGINE } from "./engine.mjs";
import { cutShort } from "./page_errors.mjs";

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
  return { requestAccessToken(opts) {
    window.tokenClient.asked.push(opts || {});
    const answer = window.googleAnswer || "token";
    setTimeout(() => answer === "cancel" ? o.callback({ error: "access_denied" }) : answer === "blocked" ? o.error_callback?.({ type: "popup_failed_to_open" }) : o.callback({ access_token: "tok", expires_in: 3599 }));
  } };
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

const browser = await pw[ENGINE].launch();
let failed = false;
const check = (ok, what) => { if (!ok) { failed = true; console.error("FAILED: " + what); } else console.log("ok: " + what); };
// whether the page asked for Google's script: it appends the script's element in the handler that wants it, so the
// element is there once the action that would load it returns, before any request reaches the route
const askedGoogle = (page) => page.evaluate((src) => !!document.querySelector(`script[src="${src}"]`), GSI);

let scriptLoads = 0;
// a device: its own browser storage; offline, the browser says so
async function device({ offline = false, seed = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.route(GSI, (route) => { scriptLoads++; route.fulfill({ status: 200, contentType: "text/javascript", body: SCRIPT }); });
  await ctx.route(/^https:\/\/(www|openidconnect)\.googleapis\.com\//, (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const u = new URL(route.request().url());
    const body = u.pathname === "/v1/userinfo" ? { name: "Ada Lovelace", email: "ada@acme.example" } : u.pathname === "/drive/v3/files" ? { files: [] } : { id: "acmefile" };
    route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
  });
  await ctx.route((u) => offSite(origin)(u) && u.href !== GSI && !/^https:\/\/(www|openidconnect)\.googleapis\.com\//.test(u.href), (r) => r.abort());
  await ctx.addInitScript(([offline, seed]) => {
    delete Navigator.prototype.serviceWorker;
    if (offline) { window.netDown = sessionStorage.getItem("net") !== "up"; Object.defineProperty(Navigator.prototype, "onLine", { get: () => !window.netDown }); }
    if (!localStorage.getItem("primed")) { localStorage.setItem("primed", "1"); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); }
  }, [offline, seed]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { if (cutShort(e)) return; failed = true; console.error("page error: " + e.message); });
  page.setDefaultTimeout(10000);
  // the popup and the tip are decided as the shell's module runs, before the study's title is shown
  const open = async () => { await page.goto(origin + "/web/index.html"); await page.waitForFunction(() => document.querySelector("#title").textContent); };
  await open();
  return { ctx, page, open };
}
const popup = (page) => page.evaluate(() => { const d = document.querySelector("#welcome-dlg"); return !!d && d.open && d.matches(":modal"); });
const signedIn = (page) => page.evaluate(() => !document.querySelector("#sign-out").hidden);
const signInTip = (page) => page.evaluate(() => {
  const t = document.querySelector('.tip-bubble[data-tip="sign-in"]'), a = document.querySelector("#user-menu summary");
  if (!t) return null;
  const r = t.getBoundingClientRect(), ar = a.getBoundingClientRect();
  const s = document.createElement("style"); s.textContent = ".tip-bubble::before { pointer-events: auto !important; }"; document.head.append(s);
  const arrow = t.contains(document.elementFromPoint((ar.left + ar.right) / 2, ar.bottom + 5)); s.remove();
  return { text: t.textContent, inside: r.left >= 0 && r.right <= innerWidth, below: r.top >= ar.bottom && r.top - ar.bottom < 30, under: r.left < ar.right && r.right > ar.left, arrow };
});
const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name + ".png") }); };

try {
  // a first visit
  const a = await device();
  await a.page.hover("#welcome-google");
  await a.page.focus("#welcome-google");
  check(scriptLoads === 0 && !(await askedGoogle(a.page)), "the mouse passing over Sign in with Google, or focus reaching it, loads nothing from Google");
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
  check(t && t.inside && t.below && t.under && t.arrow, "beside the avatar, inside the window, its arrow at the avatar: " + JSON.stringify(t));
  check(scriptLoads === 0, "an anonymous visit loads nothing from Google");
  await shot(a.page, "welcome_tip");
  await a.page.click('.tip-bubble[data-tip="sign-in"] .x');
  await a.open();
  check(!(await popup(a.page)) && !(await signInTip(a.page)), "the tip, once closed, does not come back");

  // signed in, not remembered
  const b = await device();
  await b.page.hover("#welcome-google");
  await b.page.mouse.down();
  check(await b.page.waitForFunction(() => window.google).then(() => true, () => false), "pressing Sign in with Google loads Google's script");
  await b.page.mouse.up();
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
  check(scriptLoads === loads && !(await askedGoogle(c.page)) && await popup(c.page), "clicking it offline reaches nothing and leaves the popup up");
  await c.page.evaluate(() => { window.netDown = false; dispatchEvent(new Event("online")); });
  check(await c.page.isHidden("#welcome-offline") && await c.page.evaluate(() => document.querySelector("#welcome-google").getAttribute("aria-disabled") !== "true"),
    "back online, Sign in with Google is offered again");
  await c.page.evaluate(() => { window.netDown = true; dispatchEvent(new Event("offline")); });
  await c.page.click("#welcome-anonymous");
  check(!(await popup(c.page)), "and offline, Continue anonymously works");

  // signed in, not remembered, opened offline: no popup, still signed in, the changes waiting for Drive kept
  const ada = { user: { name: "Ada Lovelace", email: "ada@acme.example", picture: null }, token: "tok", until: Date.now() - 1, changed: ["nor-theme"] };
  const e = await device({ offline: true, seed: { "nor-google-sign-in": JSON.stringify(ada), "nor-welcome": JSON.stringify({ choice: "google", remember: false }) } });
  check(!(await popup(e.page)) && await signedIn(e.page), "signed in and offline, the page opens with no popup, still signed in");
  check(await e.page.evaluate(() => JSON.parse(localStorage.getItem("nor-google-sign-in"))?.changed?.includes("nor-theme")), "and the settings waiting for Google Drive stay waiting");
  await e.page.evaluate(() => { sessionStorage.setItem("net", "up"); window.netDown = false; dispatchEvent(new Event("online")); });
  await e.open();
  check(await popup(e.page), "the next visit online asks again");

  // Google's window cancelled, or blocked: the popup stays, saying so; trying again signs in
  const f = await device();
  await f.page.evaluate(() => { window.googleAnswer = "cancel"; });
  await f.page.click("#welcome-google");
  check(await f.page.waitForFunction(() => /did not finish/i.test(document.querySelector("#welcome-failed")?.textContent) && !document.querySelector("#welcome-failed").hidden).then(() => true, () => false)
    && await popup(f.page) && !(await signedIn(f.page)), "a cancelled Google window leaves the popup up, saying sign-in did not finish");
  await f.page.evaluate(() => { window.googleAnswer = "blocked"; });
  await f.page.click("#welcome-google");
  await f.page.waitForSelector("#welcome-failed", { state: "visible" }).catch(() => {});
  check(await popup(f.page) && await f.page.isVisible("#welcome-failed") && !(await signedIn(f.page)), "and so does a blocked one");
  await f.page.evaluate(() => { window.googleAnswer = "token"; });
  await f.page.click("#welcome-google");
  check(await f.page.waitForFunction(() => !document.querySelector("#sign-out").hidden).then(() => true, () => false) && !(await popup(f.page)), "trying again signs in and closes it");

  // the tip follows the avatar when the window is resized
  const g = await device({ seed: { "nor-welcome": JSON.stringify({ choice: "anonymous", remember: true }) } });
  await g.page.setViewportSize({ width: 700, height: 800 });
  // the tip moves with the avatar once the page has laid the narrower window out
  await g.page.waitForFunction(() => {
    const t = document.querySelector('.tip-bubble[data-tip="sign-in"]')?.getBoundingClientRect(), a = document.querySelector("#user-menu summary").getBoundingClientRect();
    return t && t.right <= innerWidth && t.left < a.right && t.right > a.left;
  }).catch(() => {});
  const moved = await signInTip(g.page);
  check(moved && moved.inside && moved.under && moved.arrow, "the tip follows the avatar when the window narrows: " + JSON.stringify(moved));

  // a remembered anonymous choice beside a signed-in record (another tab signed in): the popup asks
  const h = await device({ seed: { "nor-google-sign-in": JSON.stringify({ ...ada, until: Date.now() + 3600e3, changed: [] }), "nor-welcome": JSON.stringify({ choice: "anonymous", remember: true }) } });
  check(await popup(h.page), "a remembered anonymous choice with someone signed in asks again");

  // two tabs: signing out in one is not undone by the other
  await h.page.keyboard.press("Escape");
  const h2 = await h.ctx.newPage();
  await h2.goto(origin + "/web/index.html"); await h2.waitForFunction(() => document.querySelector("#title").textContent);
  await h2.keyboard.press("Escape");
  await h.page.click("#user-menu summary");
  await h.page.click("#sign-out");
  await h2.waitForFunction(() => document.querySelector("#sign-out").hidden).catch(() => {});
  check(await h2.evaluate(() => document.querySelector("#sign-out").hidden), "signing out in one tab signs the other out too");
  // signed out there, the other tab's change starts nothing that could write the record later: a sign-in written
  // back would be written by the click itself
  await h2.click("#theme");
  check(await h2.evaluate(() => localStorage.getItem("nor-google-sign-in")) === null, "and a change in the other tab does not sign the user back in");

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
