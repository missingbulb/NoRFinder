// Working without the internet. Offline by default (requirement 1.55): the service worker keeps the site's copy,
// which keepSite() brings up to the release now published; with no network the page says Offline in the status
// bar, and each control marked data-needs-network says so and does nothing. No network is the browser saying so,
// or the site not answering: a plane's Wi-Fi with no internet beyond it leaves the browser saying it is online. Prepare for offline (1.56): a dialog
// where the user chooses what more to keep on this device, the site as an app, each study's Python and the images
// in each study's Google Drive folder, with what it all takes beside the room left.
// deps: $, esc, sizeText; drive, the Drive module; kept(id), whether an image is kept on this device;
// keep(id, name, bytes, {path, study}), keeping one; throttled() and throttle(), Google's wait (1.37); stored(),
// once something is kept.
import { CORE, packagesOf } from "./python_files.js";
import { PREVIEWS } from "./previews.js";

// the browser key that says the user asked for the app, so the page names its manifest from then on
export const APP_ASKED = "nor-app-asked";
// a ticked study's Drive folder is read this deep and this far at most
const MAX_FOLDERS = 200, MAX_FILES = 2000;

export function offline({ $, esc, sizeText, drive, kept, keep, throttled, throttle, stored }) {
  // ---------- offline by default ----------
  const NEEDS = "[data-needs-network]", WHY = "Needs the internet: you are offline.", AGAIN_MS = 30000;
  let unreached = false, again = 0;
  const isOffline = () => !navigator.onLine || unreached;
  const mark = () => {
    const off = isOffline();
    clearInterval(again); again = off ? setInterval(keepSite, AGAIN_MS) : 0;
    document.documentElement.classList.toggle("offline", off);
    $("#sb-offline").hidden = !off;
    for (const el of document.querySelectorAll(NEEDS)) {
      if (off && el.dataset.onlineTitle === undefined) { el.dataset.onlineTitle = el.title; el.title = WHY; el.setAttribute("aria-disabled", "true"); }
      if (!off && el.dataset.onlineTitle !== undefined) { el.title = el.dataset.onlineTitle; delete el.dataset.onlineTitle; el.removeAttribute("aria-disabled"); }
    }
  };
  addEventListener("online", () => { mark(); keepSite(); });
  addEventListener("offline", mark);
  mark();
  document.addEventListener("click", (e) => {
    if (isOffline() && e.target.closest?.(NEEDS)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  $("#sb-offline").onclick = () => prepare();

  // the site's copy, brought up to date by the service worker: {files, unreached, cache} once it answers
  let siteCache = null;
  async function keepSite() {
    const sw = navigator.serviceWorker && (await navigator.serviceWorker.ready.catch(() => null))?.active;
    if (!sw) return { error: "no service worker" };
    const answer = new Promise((ok) => {
      const on = (e) => { if (e.data?.type !== "site") return; navigator.serviceWorker.removeEventListener("message", on); ok(e.data); };
      navigator.serviceWorker.addEventListener("message", on);
    });
    sw.postMessage({ type: "site" });
    const m = await answer;
    siteCache = m.cache;
    if (!!m.unreached !== unreached) { unreached = !!m.unreached; mark(); }
    if (m.error) console.warn("the site's copy for offline is not up to date:", m.error);
    return m;
  }

  // ---------- Install as an app ----------
  let installEvent = null;
  const installed = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const nameManifest = () => {
    if (document.querySelector("link[rel=manifest]")) return;
    document.head.append(Object.assign(document.createElement("link"), { rel: "manifest", href: new URL("app.webmanifest", import.meta.url).href }));
  };
  try { if (localStorage.getItem(APP_ASKED)) nameManifest(); } catch { /* no storage: asked again next time */ }
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e; showApp(); });
  addEventListener("appinstalled", () => { installEvent = null; showApp(); });
  function showApp(text) {
    const b = $("#offline-install"), t = $("#offline-app-text");
    b.hidden = installed(); b.disabled = false;
    if (installed()) t.textContent = "The site is installed as an app on this device.";
    else if (text) t.textContent = text;
    else t.textContent = "An icon that opens the site in its own window, offline too.";
  }
  $("#offline-install").onclick = async () => {
    try { localStorage.setItem(APP_ASKED, "true"); } catch { /* no storage */ }
    nameManifest();
    if (!("onbeforeinstallprompt" in window)) {
      const safari = /Safari\//.test(navigator.userAgent) && !/Chrome|Chromium|Edg\//.test(navigator.userAgent);
      return showApp(safari ? "In Safari, choose File › Add to Dock on a Mac, or Share › Add to Home Screen on an iPhone or iPad."
        : "This browser has no install button for the page to press: look in its menu for Install or Add to Home Screen. The site opens offline here either way.");
    }
    if (!installEvent) {
      $("#offline-install").disabled = true; showApp("Getting the app ready…");
      for (let t = 0; t < 50 && !installEvent; t++) await new Promise((ok) => setTimeout(ok, 100));
      if (!installEvent) return showApp("The browser offers no install now: it may already be installed, or it installs from its own menu.");
    }
    // the browser asks only within the user's click: one that has run out asks for another
    if (!navigator.userActivation?.isActive) { $("#offline-install").textContent = "Install now"; return showApp("Ready: press Install now."); }
    const e = installEvent; installEvent = null;
    await e.prompt();
    const { outcome } = await e.userChoice;
    showApp(outcome === "accepted" ? "Installed: the site's icon opens it in its own window." : "Not installed. You can install it later from here.");
  };

  // ---------- the studies and their data ----------
  const sizes = new Map(); // url → its size in bytes, as the network said, or null when it would not say
  const sizeOf = (url) => sizes.has(url) ? sizes.get(url) : fetch(url, { method: "HEAD" })
    .then((r) => +r.headers.get("content-length") || null, () => null).then((n) => (sizes.set(url, n), n));
  const here = async (url) => !!(await caches.match(url).catch(() => null));
  let studies = [], picked = new Set(), files = new Map(), run = 0, ctl = null;
  // [{url}] each study's Python, Python itself apart
  async function pythonOf(m) {
    const [lock, vendored] = await Promise.all([fetch(CORE.at(-1)), fetch(new URL("vendor/wheels.json", import.meta.url))].map(async (r) => (await r).json()));
    return packagesOf(m.python, lock, vendored, new URL("vendor/", import.meta.url).href);
  }
  // what is missing of a list of urls, and its size
  async function missing(urls) {
    const out = [];
    for (const u of urls) if (!(await here(u))) out.push(u);
    const n = await Promise.all(out.map(sizeOf));
    return { urls: out, bytes: n.reduce((a, b) => a + (b || 0), 0), unknown: n.some((b) => b == null) };
  }
  const told = (m) => (!m.urls.length ? "on this device" : `${sizeText(m.bytes)}${m.unknown ? " or more" : ""}`);

  async function prepare() {
    $("#offline-dlg").showModal(); showApp();
    $("#offline-msg").textContent = ""; $("#offline-studies").textContent = "Reading the studies…";
    try {
      const listed = await (await fetch(new URL("studies.json", import.meta.url))).json();
      studies = await Promise.all(listed.map(async (s) => {
        const m = await (await fetch(new URL(`../studies/${s.id}/study.json`, import.meta.url))).json();
        return { ...s, manifest: m, python: (await pythonOf(m)).map((w) => w.url) };
      }));
    } catch (e) { $("#offline-studies").textContent = "The studies could not be read: " + (e.message || e); return; }
    $("#offline-studies").replaceChildren(...studies.map(row));
    await recount();
  }
  function row(s) {
    const r = document.createElement("div"); r.className = "study-row"; r.dataset.study = s.id;
    r.innerHTML = `<label class="pick-row"><input type="checkbox" class="pick"><span class="name">${esc(s.title)}</span><span class="size"></span></label><div class="data" hidden></div>`;
    const box = r.querySelector(".pick");
    box.checked = picked.has(s.id);
    box.onchange = () => { if (box.checked) picked.add(s.id); else picked.delete(s.id); showData(s, r.querySelector(".data")); recount(); };
    if (box.checked) showData(s, r.querySelector(".data"));
    return r;
  }
  // a ticked study's images, from its own Drive folder and the folders under it
  async function showData(s, el) {
    el.hidden = !picked.has(s.id);
    if (el.hidden || el.dataset.read) return;
    const link = s.manifest.files.drive, ref = link && drive.parse(link);
    if (!ref || ref.kind !== "folder") { el.innerHTML = `<p class="hint">This study has no Google Drive folder of its own.</p>`; return; }
    if (!drive.ready) { el.innerHTML = `<p class="hint">Its Google Drive folder needs this site's Google API key.</p>`; return; }
    if (isOffline()) { el.innerHTML = `<p class="hint">Its Google Drive folder can be read once you are online.</p>`; return; }
    if (throttled()) { el.innerHTML = `<p class="hint">Google is throttling this site's downloads; try again in a while.</p>`; return; }
    el.innerHTML = `<p class="hint">Reading its Google Drive folder…</p>`;
    const found = [];
    try {
      for (const queue = [{ id: ref.id, path: [] }], seen = new Set(); queue.length && seen.size < MAX_FOLDERS && found.length < MAX_FILES; ) {
        const at = queue.shift();
        if (seen.has(at.id)) continue;
        seen.add(at.id);
        for (const f of await drive.list(at.id)) {
          if (f.folder) queue.push({ id: f.id, path: [...at.path, f.name] });
          else if (f.name !== PREVIEWS) found.push({ ...f, path: at.path, study: s.id, kept: await kept(f.id) });
        }
      }
    } catch (e) {
      if (e.throttled) throttle();
      el.innerHTML = `<p class="hint err">Its Google Drive folder could not be read: ${esc(e.message || e)}</p>`; return;
    }
    el.dataset.read = "1";
    if (!found.length) { el.innerHTML = `<p class="hint">Its Google Drive folder holds no images.</p>`; return; }
    el.innerHTML = `<p class="hint">Its images on Google Drive, to keep on this device too:</p><label class="all-row"><input type="checkbox" class="all"> All ${found.length}</label><div class="files"></div>`;
    el.querySelector(".files").replaceChildren(...found.map((f) => {
      const l = document.createElement("label"); l.className = "file-row";
      l.innerHTML = `<input type="checkbox" class="file"><span class="name">${esc(f.name)}</span><span class="where">${esc(["Folder", ...f.path].join(" / "))}</span><span class="size">${f.kept ? "on this device" : f.size == null ? "" : sizeText(f.size)}</span>`;
      const box = l.querySelector("input");
      box.checked = files.has(f.id); box.disabled = f.kept;
      box.onchange = () => { if (box.checked) files.set(f.id, f); else files.delete(f.id); recount(); };
      return l;
    }));
    el.querySelector(".all").onchange = (e) => {
      for (const b of el.querySelectorAll("input.file:not(:disabled)")) { b.checked = e.target.checked; b.onchange(); }
    };
  }
  // what the choice downloads, beside the room left; Prepare is refused a choice larger than that
  async function recount() {
    const asked = ++run;
    const core = await missing(CORE);
    const rows = await Promise.all(studies.map(async (s) => ({ s, m: await missing(s.python) })));
    if (asked !== run) return;
    $("#offline-core").textContent = "Python itself, shared by every study: " + told(core) + ".";
    for (const { s, m } of rows) $(`#offline-studies [data-study="${s.id}"] .size`).textContent = told(m);
    const python = new Set(core.urls);
    for (const { s, m } of rows) if (picked.has(s.id)) m.urls.forEach((u) => python.add(u));
    const images = [...files.values()].filter((f) => picked.has(f.study));
    const bytes = (await Promise.all([...python].map(sizeOf))).reduce((a, b) => a + (b || 0), 0) + images.reduce((a, f) => a + (f.size || 0), 0);
    let free = null;
    try { const e = await navigator.storage.estimate(); free = e.quota - e.usage; } catch { /* the browser does not say */ }
    if (asked !== run) return;
    const some = !!picked.size && (python.size || images.length);
    $("#offline-free").textContent = free == null ? "This browser does not say how much more the site may keep." : `This browser lets the site keep about ${sizeText(free)} more.`;
    $("#offline-total").textContent = !picked.size ? "Tick the studies to keep." : some ? `This choice downloads ${sizeText(bytes)}.` : "Everything ticked is already on this device.";
    const tooMuch = free != null && bytes > free;
    $("#offline-warn").hidden = !tooMuch;
    $("#offline-warn").textContent = tooMuch ? `That is more than this browser lets the site keep (${sizeText(free)}). Untick some images or studies.` : "";
    $("#offline-go").disabled = !some || tooMuch || isOffline() || !!ctl;
    return { python: [...python], images, bytes };
  }

  // Prepare: the browser asked to keep the site's storage, the site's copy brought up to date, then each download
  // in turn, the Python first
  $("#offline-go").onclick = async () => {
    const plan = await recount();
    if (!plan) return;
    ctl = new AbortController(); const signal = ctl.signal;
    $("#offline-go").disabled = true; $("#offline-stop").hidden = false;
    const bar = $("#offline-progress"), msg = (t) => { $("#offline-msg").textContent = t; };
    bar.hidden = false; bar.max = plan.bytes || 1; bar.value = 0;
    let done = 0, images = 0, error = null;
    const persisted = await navigator.storage?.persist?.().catch(() => false);
    try {
      msg("Keeping the site itself…"); await keepSite();
      for (const url of plan.python) {
        if (signal.aborted) break;
        msg(`Downloading Python · ${sizeText(done)} of ${sizeText(plan.bytes)}`);
        const r = await fetch(url, { signal });
        if (!r.ok) throw new Error(`${url.split("/").pop()}: HTTP ${r.status}`);
        for (const reader = r.body.getReader(); ; ) {
          const { done: end, value } = await reader.read();
          if (end) break;
          done += value.length; bar.value = done;
        }
      }
      for (const f of plan.images) {
        if (signal.aborted) break;
        if (throttled()) throw Object.assign(new Error("Google is throttling this site's downloads"), { throttled: true });
        msg(`Downloading ${f.name} · ${sizeText(done)} of ${sizeText(plan.bytes)}`);
        const got = await drive.file(f.id, f.name);
        await keep(f.id, got.name, got.bytes, { path: f.path, study: f.study });
        f.kept = true; files.delete(f.id); done += got.bytes.byteLength; bar.value = done; images++;
      }
    } catch (e) {
      if (e.throttled) throttle();
      if (e.name !== "AbortError") error = e;
    }
    ctl = null; bar.hidden = true; $("#offline-stop").hidden = true;
    stored();
    $("#offline-studies").replaceChildren(...studies.map(row));
    await recount();
    const ticked = studies.filter((s) => picked.has(s.id)).map((s) => s.title).join(", ");
    const kept = persisted ? "The browser keeps them until you delete them in Manage storage." : "The browser may clear them if this device runs low on space.";
    if (error) msg(`Could not finish: ${error.message || error}. ${soFar(images)}`);
    else if (signal.aborted) msg(`Stopped. ${soFar(images)}`);
    else msg(`Ready for offline: ${ticked} and ${images === 1 ? "1 image" : images + " images"}. ${kept}`);
  };
  const soFar = (n) => (n ? `${n === 1 ? "1 image" : n + " images"} kept so far.` : "");
  $("#offline-stop").onclick = () => ctl?.abort();
  $("#offline-dlg").addEventListener("close", () => ctl?.abort());
  $("#prepare-offline").onclick = () => { $("#user-menu").open = false; prepare(); };

  return { keepSite, siteCache: () => siteCache, offline: isOffline };
}
