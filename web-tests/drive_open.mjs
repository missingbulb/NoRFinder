// Opens an image in a study that loads from Google Drive (req/shell/load/from) the way a user does, through the
// Google Drive dialog, from a stand-in Drive: standInDrive(ctx) before the page loads gives its config an API key
// and answers Drive's API for each file handed to openFromDrive, under an id of its own; any other Drive request
// goes on to the routes set before it. Call it after the test's own routes of Google, which would otherwise answer
// in its place. openFromDrive(page, file) takes a path or {name, mimeType, buffer}, as
// setInputFiles does, the same name and bytes again being the same file on Drive, pastes the file's link into the
// dialog and returns once it is downloading.
import fs from "node:fs";
import path from "node:path";

const files = new WeakMap();

export async function standInDrive(ctx) {
  const mine = new Map();
  files.set(ctx, mine);
  // the site's config, whoever serves it, given an API key where it has none
  await ctx.addInitScript(() => {
    let config;
    Object.defineProperty(window, "NOR_CONFIG", { configurable: true, get: () => config,
      set: (v) => { config = v; if (v?.google && !v.google.apiKey) v.google.apiKey = "stand-in"; } });
  });
  await ctx.route("https://www.googleapis.com/drive/v3/files/**", (route) => {
    const u = new URL(route.request().url()), f = mine.get(decodeURIComponent(u.pathname.split("/").pop()));
    if (!f) return route.fallback();
    const cors = { "access-control-allow-origin": "*" };
    if (u.searchParams.get("alt") === "media") return route.fulfill({ status: 200, headers: cors, contentType: f.mimeType, body: f.buffer });
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json",
      body: JSON.stringify({ id: f.id, name: f.name, mimeType: f.mimeType, size: String(f.buffer.length) }) });
  });
}

let next = 0;
export async function openFromDrive(page, file) {
  const mine = files.get(page.context());
  if (!mine) throw new Error("openFromDrive needs standInDrive(context) first");
  const f = typeof file === "string"
    ? { name: path.basename(file), mimeType: /\.png$/i.test(file) ? "image/png" : "image/tiff", buffer: fs.readFileSync(file) }
    : { ...file };
  // the same file handed again is the same file on Drive
  const again = [...mine.values()].find((g) => g.name === f.name && g.buffer.equals(f.buffer));
  if (again) f.id = again.id;
  else { f.id = "standinfile" + String(++next).padStart(9, "0"); mine.set(f.id, f); }
  // the Image box may be folded: the button is pressed where it is
  await page.evaluate(() => document.querySelector("#load-drive").click());
  await page.waitForFunction(() => document.querySelector("#drive-dlg").open);
  await page.fill("#drive-link", `https://drive.google.com/file/d/${f.id}/view`);
  await page.click("#drive-go");
  // the dialog closes once the download starts; a folder it listed first may have left an error showing meanwhile
  await page.waitForFunction(() => !document.querySelector("#drive-dlg").open, null, { timeout: 15000 })
    .catch(async () => { throw new Error("the Drive dialog did not open the file: " + (await page.textContent("#drive-msg"))); });
}

// the Image box opened, as a user opens it when it has folded after an image, then Drive's button pressed
export async function pressDrive(page) {
  await unfold(page);
  await page.click("#load-drive");
}
// the image selector opened (the Image box opened first), and its nth image chosen, from 1; null leaves it open
export async function pickRecent(page, nth = 1) {
  await unfold(page);
  await page.click("#image-pick");
  if (nth != null) await page.click(`#image-menu .recent:nth-child(${nth})`);
}
async function unfold(page) {
  if (await page.evaluate(() => document.querySelector("#image-box").classList.contains("folded"))) {
    await page.click("#image-box");
    await page.waitForFunction(() => document.querySelector("#load").checkVisibility() && !document.documentElement.hasAttribute("data-drawers"));
  }
}
