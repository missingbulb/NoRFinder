// Checks req/shell/browsers/supported, req/shell/report/bug and req/shell/report/action-log: which browsers the page tells
// apart and supports, from a table of user-agent strings; then drives the page (web/) in a headless browser, with a worker
// that never answers: no icon in a supported browser; in an unsupported one a warning icon in the status bar saying
// why, which opens a new GitHub issue on the bug-report form filled in with the browser, the page's state and the
// last five actions; Report a problem in the avatar's menu opening the same; the actions kept across a reload,
// listed in Settings and cleared there; an error the page meets kept apart from the actions; and no image's name
// reaching the log or the report. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/problem_report_driver.mjs
import { repoFile } from "./repo_file.mjs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { offSite } from "./off_site.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch {
  try { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch { console.error("no playwright: npm i -g playwright"); process.exit(2); }
}
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { identify, verdict } = await import(pathToFileURL(path.join(repo, "web", "browsers.js")).href);
const { supported } = JSON.parse(fs.readFileSync(path.join(repo, "web", "browsers.json")));
const SECRET = "SECRET-slide-42.tif";

let failed = false;
const report = (ok, what) => { console.log((ok ? "ok: " : "FAILED: ") + what); if (!ok) failed = true; };

// ---- which browser, and whether it is supported ----
const UA = {
  chrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
  oldChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
  chromeAtFloor: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  chromeBelowFloor: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0",
  firefox: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
  firefoxEsr115: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0",
  safari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
  oldSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  opera: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 OPR/120.0.0.0",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36",
  headless: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.0.0 Safari/537.36",
};
const table = [
  ["chrome", 0, "Chrome", 153, true], ["oldChrome", 0, "Chrome", 109, false], ["chromeAtFloor", 0, "Chrome", 125, true], ["chromeBelowFloor", 0, "Chrome", 124, false],
  ["edge", 0, "Edge", 150, true],
  ["firefox", 0, "Firefox", 140, false], ["firefoxEsr115", 0, "Firefox", 115, false],
  ["safari", 0, "Safari", 18, false], ["oldSafari", 0, "Safari", 16, false],
  ["opera", 0, "Opera", 120, false], ["samsung", 5, "Samsung Internet", 28, false],
  ["iphone", 5, "Safari", 18, false], ["androidChrome", 5, "Chrome", 153, false], ["headless", 0, "Chrome", 153, true],
  // an iPad asking for the desktop page reads as a Mac with a touch screen
  ["safari", 5, "Safari", 18, false],
];
for (const [key, touch, name, version, ok] of table) {
  const b = identify(UA[key], touch), v = verdict(b, supported);
  report(b.name === name && b.version === version && v.ok === ok, `${key}${touch ? " (touch)" : ""}: ${b.name} ${b.version} on ${b.os}, ${v.ok ? "supported" : "not supported: " + v.why}`);
}

// ---- the page ----
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (u === "/web/worker.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(""); }
  const f = repoFile(repo, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await pw[process.env.PW_ENGINE || "chromium"].launch();
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };
const check = async (ok, what) => { report(ok, what); if (!ok) await done(1); };

// a page in a browser saying it is `ua` (the engine's own when null), with one image from Drive among the recents;
// window.open records the address it is given
async function open(ua) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ...(ua && { userAgent: ua }) });
  await ctx.route(offSite(origin), (r) => r.abort());
  await ctx.addInitScript((secret) => {
    delete Navigator.prototype.serviceWorker;
    window.open = (url) => { window.opened = url; return null; };
    if (sessionStorage.getItem("primed")) return;
    sessionStorage.setItem("primed", "1");
    localStorage.setItem("nor-welcome", JSON.stringify("anonymous"));
    localStorage.setItem("nor-drive-recent", JSON.stringify([{ id: "d1", name: secret, path: ["Lab"], study: "viewer" }]));
  }, SECRET);
  const page = await ctx.newPage();
  page.on("pageerror", async (e) => { if (!/thrown-for-the-test/.test(e.message)) { console.error("page error: " + e.message); await done(1); } });
  page.setDefaultTimeout(10000);
  await page.goto(origin + "/web/index.html");
  await page.waitForFunction(() => $("#sb-version").textContent && !$("#recent").hidden);
  await page.waitForTimeout(300); // browsers.json arrives
  return { ctx, page };
}
const kept = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("nor-actions")) || []);
const issue = async (page) => { const u = new URL(await page.evaluate(() => window.opened)); return Object.fromEntries(u.searchParams); };

// the status bar's report icon: shown, at the bar's right, its look and words
const reportIcon = (page) => page.evaluate(() => { const b = $("#sb-report"); return { shown: !b.hidden && b.getBoundingClientRect().width > 0,
  right: b.getBoundingClientRect().left > innerWidth / 2, warns: b.classList.contains("unsupported"), label: b.getAttribute("aria-label"), title: b.title }; });

// ---- a supported browser: the plain report icon, opening a report ----
{
  const { ctx, page } = await open(null);
  const icon = await reportIcon(page);
  await check(icon.shown && icon.right && !icon.warns && icon.label === "Report a problem" && /GitHub issue/.test(icon.title),
    `in a supported browser the status bar's right side shows the plain report icon: "${icon.title}"`);
  await page.click("#sb-report");
  const q = await issue(page);
  await check(q.template === "bug-report.yml" && q.title === "Problem: " && !/not supported/.test(q.browser), `it opens a new issue on the bug-report form titled "${q.title}": ${q.browser}`);
  await ctx.close();
}

// ---- an unsupported browser: the icon, and the report it opens ----
{
  const { ctx, page } = await open(UA.opera);
  const icon = await reportIcon(page);
  await check(icon.shown && icon.right && icon.warns && icon.label === "Unsupported browser" && /Opera is not one the page supports/.test(icon.title) && /report a problem/i.test(icon.title),
    `in Opera the same icon is a warning sign, saying why: "${icon.title}"`);

  // six actions, the last five quoted, oldest first; the recent image is logged by what it is, never its name
  await page.click("#load-menu summary");
  await page.click("#recent .recent");
  // the image is not on this device and Drive cannot be reached: the Drive dialog opens on its folder
  await page.waitForFunction(() => $("#drive-dlg").open);
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !$("#drive-dlg").open);
  await page.click("#user-menu summary");
  await page.click("#open-settings");
  await page.click("#settings-cancel");
  await page.evaluate(() => setTimeout(() => { throw new Error("thrown-for-the-test"); }));
  await page.waitForTimeout(100);
  await page.click("#sb-report");
  const q = await issue(page);
  await check(q.template === "bug-report.yml" && q.title === "Unsupported browser: ", `the icon opens a new issue on the bug-report form: ${q.template}, "${q.title}"`);
  await check(/^Opera 120 on Windows, not supported \(Mozilla/.test(q.browser), `it names the browser: ${q.browser}`);
  await check(/^- Site version: \d/.test(q.state) && /- Study: Image Viewer \(viewer\)/.test(q.state) && /- Image: none open/.test(q.state) && /- Online: yes/.test(q.state),
    `and the page's state:\n${q.state}`);
  const lines = q.actions.split("\n");
  await check(lines.length === 5 && /^1\. .*Clicked “a recent image”$/.test(lines[0]) && /Clicked “Settings…”/.test(lines[2]) && /Clicked “Unsupported browser”$/.test(lines[4]),
    `and the last five actions, oldest first:\n${q.actions}`);
  await check(/thrown-for-the-test/.test(q.errors) && !/thrown-for-the-test/.test(q.actions), `the error the page met is listed apart: ${q.errors}`);
  const log = await kept(page);
  await check(log.length >= 7 && log.some((e) => /Opened the study “Image Viewer”/.test(e.text)), `the page keeps the log on this device (${log.length} entries)`);
  await check(!JSON.stringify(log).includes(SECRET) && !JSON.stringify(q).includes(SECRET), "no image's name is in the log or the report");

  // across a reload, from the avatar's menu
  await page.reload(); await page.waitForTimeout(300);
  await page.click("#user-menu summary");
  await page.click("#report-problem");
  const again = await issue(page);
  await check(again.title === "Unsupported browser: " && /Clicked “Report a problem…”$/.test(again.actions.split("\n").at(-1)) && /Clicked “Unsupported browser”/.test(again.actions),
    "after a reload the actions are still there, and Report a problem in the avatar's menu opens the same report");

  // listed in Settings, kept on this device only, and cleared there
  await page.click("#user-menu summary");
  await page.click("#open-settings");
  const listed = page.locator("#settings-dlg label.tick", { hasText: "Your last actions here" });
  await check(await listed.count() === 1, "Settings lists the actions among what is kept on this device only");
  await listed.locator("input").uncheck();
  await page.click("#settings-save");
  await check((await kept(page)).length <= 1, "unticked and saved, the log is cleared");
  await ctx.close();
}

// ---- a supported browser: Report a problem in the menu too ----
{
  const { ctx, page } = await open(null);
  await page.click("#user-menu summary");
  await page.click("#report-problem");
  const q = await issue(page);
  await check(q.title === "Problem: " && !/not supported/.test(q.browser), `in a supported browser the menu opens a report titled "${q.title}": ${q.browser}`);
  await ctx.close();
}
await done(failed ? 1 : 0);
