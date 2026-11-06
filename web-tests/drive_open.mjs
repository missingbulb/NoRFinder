// Opens an image in a study that opens from Google Drive (req/shell/load/from) the way a user does, through the
// Google Drive dialog, from a stand-in Drive: standInDrive(ctx) before the page loads gives its config an API key
// and answers Drive's API for each file handed to openFromDrive, under an id of its own; while one is being opened,
// the folder the dialog lists holds the files handed over so far. Any other Drive request goes on to the routes set
// before it. Call it after the test's own routes of Google, which would otherwise answer in its place.
// openFromDrive(page, file) takes a path or {name, mimeType, buffer}, as setInputFiles does, the same name and bytes
// again being the same file on Drive; it pastes the file's link where the dialog takes one (req/shell/drive/dialog),
// else opens it from the study's first folder, and returns once it is downloading.
import fs from "node:fs";
import path from "node:path";

// per context: {files, opening}, opening true while openFromDrive runs
const files = new WeakMap();

export async function standInDrive(ctx) {
  const mine = new Map(), state = { files: mine, opening: false };
  files.set(ctx, state);
  // the site's config, whoever serves it, given an API key where it has none
  await ctx.addInitScript(() => {
    let config;
    Object.defineProperty(window, "NOR_CONFIG", { configurable: true, get: () => config,
      set: (v) => { config = v; if (v?.google && !v.google.apiKey) v.google.apiKey = "stand-in"; } });
  });
  const cors = { "access-control-allow-origin": "*" };
  // the dialog's listing (it alone asks for thumbnail links) while a file is being opened
  await ctx.route((u) => u.href.startsWith("https://www.googleapis.com/drive/v3/files?") && state.opening && /thumbnailLink/.test(u.searchParams.get("fields") || ""), (route) =>
    route.fulfill({ status: 200, headers: cors, contentType: "application/json",
      body: JSON.stringify({ files: [...mine.values()].map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: String(f.buffer.length) })) }) }));
  await ctx.route("https://www.googleapis.com/drive/v3/files/**", (route) => {
    const u = new URL(route.request().url()), f = mine.get(decodeURIComponent(u.pathname.split("/").pop()));
    if (!f) return route.fallback();
    if (u.searchParams.get("alt") === "media") return route.fulfill({ status: 200, headers: cors, contentType: f.mimeType, body: f.buffer });
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json",
      body: JSON.stringify({ id: f.id, name: f.name, mimeType: f.mimeType, size: String(f.buffer.length) }) });
  });
}

let next = 0;
export async function openFromDrive(page, file) {
  const state = files.get(page.context()), mine = state?.files;
  if (!mine) throw new Error("openFromDrive needs standInDrive(context) first");
  const f = typeof file === "string"
    ? { name: path.basename(file), mimeType: /\.png$/i.test(file) ? "image/png" : "image/tiff", buffer: fs.readFileSync(file) }
    : { ...file };
  // the same file handed again is the same file on Drive
  const again = [...mine.values()].find((g) => g.name === f.name && g.buffer.equals(f.buffer));
  if (again) f.id = again.id;
  else { f.id = "standinfile" + String(++next).padStart(9, "0"); mine.set(f.id, f); }
  state.opening = true;
  try {
    // the Image box may be folded: the button is pressed where it is
    await page.evaluate(() => document.querySelector("#load-remote").click());
    await page.waitForFunction(() => document.querySelector("#remote-dlg").open);
    if (await page.evaluate(() => document.querySelector("#remote-link").checkVisibility())) {
      await page.fill("#remote-link", `https://drive.google.com/file/d/${f.id}/view`);
      await page.click("#remote-go");
    } else {
      const row = `#remote-list .item[data-id="${f.id}"]`;
      // the study's folders listed to choose from: the first
      // a boolean: a predicate's element would come back as a handle that keeps it alive
      await page.waitForFunction((r) => !!(document.querySelector(r) || document.querySelector("#remote-list .item.folder:not(:disabled)")), row);
      if (!(await page.evaluate((r) => !!document.querySelector(r), row))) await page.dblclick("#remote-list .item.folder");
      await page.dblclick(row);
    }
    // the dialog closes once the download starts; a folder it listed first may have left an error showing meanwhile
    await page.waitForFunction(() => !document.querySelector("#remote-dlg").open, null, { timeout: 15000 })
      .catch(async () => { throw new Error("the Drive dialog did not open the file: " + (await page.textContent("#remote-msg"))); });
  } finally { state.opening = false; }
}

// the Image box opened, as a user opens it when it has folded after an image, then Drive's button pressed
export async function pressDrive(page) {
  await unfold(page);
  await page.click("#load-remote");
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
