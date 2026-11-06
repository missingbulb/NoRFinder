// Drives the tree's Approve folders… (web/data_mode.js, web/drive.js) in headless Chromium, against the stand-in Google of
// stand_in_drive.mjs serving ROOT, for a data manager whose token lasts but was never given Drive's per-file
// permission: the click asks Google for it, then shows Google's picker on the study's folders. Checks
// req/shell/data/drive-access. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/drive_approve_driver.mjs ANSWERS STUDIES ROOT
import { standIn } from "./stand_in_drive.mjs";

const [answers, studies, rootDir] = process.argv.slice(2);
const { ROOT, SUB, open, role, check, done } = await standIn({ answers, studies, rootDir });
const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";
// Google's sign-in script: its token client grants what it is asked at once, recording each request
const GSI = `window.google = { ...window.google, accounts: { oauth2: { initTokenClient(o) {
  window.asked = [];
  return { requestAccessToken(opts = {}) { window.asked.push(opts); setTimeout(() => o.callback({ access_token: "tok-" + Date.now(), expires_in: 3599, scope: opts.scope || o.scope })); } };
} } } };`;
// Google's picker: shown is the folders it was opened on; it answers as if the user picked them all
const PICKER = `window.gapi = { load(name, ok) { ok(); } };
window.google = { ...window.google, picker: (() => {
  const chain = (o) => new Proxy(o, { get: (t, k) => (k in t ? t[k] : () => chain(t)) });
  let ids = "", callback = null;
  const DocsView = function () { return chain({ setFileIds(v) { ids = v; return this; } }); };
  const PickerBuilder = function () { return chain({ setCallback(f) { callback = f; return this; }, build() { return { setVisible() { window.shown = ids; callback({ action: "picked" }); } }; } }); };
  return { DocsView, PickerBuilder, DocsViewMode: {}, Feature: {}, Action: { PICKED: "picked", CANCEL: "cancel" } };
})() };`;
const js = (body) => (route) => route.fulfill({ status: 200, contentType: "text/javascript", body });

const page = await open(true, {
  scopes: "openid email profile https://www.googleapis.com/auth/drive.appdata",
  prepare: async (ctx) => {
    await ctx.route("https://accounts.google.com/gsi/client", js(GSI));
    await ctx.route("https://apis.google.com/js/api.js", js(PICKER));
  },
});
await role(page, "Data Manager");
await page.waitForFunction(() => !$("#data-approve").hidden);
await check(await page.textContent("#data-approve") === "Approve 2 folders…", "with no per-file permission, the tree offers every folder", await page.textContent("#data-approve"));
await page.click("#data-approve");
const asked = await page.waitForFunction(() => window.asked?.find((o) => o.scope)?.scope, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
await check(!!asked && asked.split(" ").includes(DRIVE_FILE), "Approve folders… asks Google for the per-file permission", asked);
const shown = await page.waitForFunction(() => window.shown, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
await check(shown === [ROOT, SUB].join(","), "then Google's picker shows just the study's folders", shown);
await done(0);
