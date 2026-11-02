// Working without the internet. Offline by default (req/shell/offline/default): the service worker keeps the site's copy,
// which keepSite() brings up to the release now published; with no network the page says Offline in the status
// bar, and each control marked data-needs-network says so and does nothing. No network is the browser saying so,
// or the site not answering: a plane's Wi-Fi with no internet beyond it leaves the browser saying it is online.
// Making a study available offline (req/shell/offline/per-study), from the Storage tab: a popup of what the study's Python and the images
// in its Google Drive folder take, beside the room left and the time at this session's speeds, then the download;
// and Install as an app, at the top of the tab.
// deps: $, esc, sizeText; drive, the Drive module; kept(id), whether an image is kept on this device;
// keep(id, name, bytes, {path, study}), keeping one; throttled() and throttle(), Google's wait (req/shell/drive/throttle); stored(),
// once something is kept; showStorage(), opening the Storage tab.
import { CORE, packagesOf } from "./python_files.js";
import { PREVIEWS } from "./previews.js";

// the browser key that says the user asked for the app, so the page names its manifest from then on
export const APP_ASKED = "nor-app-asked";

// The quiet mark of what is available offline (req/shell/offline/mark): a study whose Python is all on this device, or an
// image kept on it; hovering on it says what that means.
const SAYS = {
  study: "Available offline: this study's Python is on this device, so the study runs without the internet.",
  image: "Available offline: this image is kept on this device, so it opens without the internet.",
};
export function offlineMark(what) {
  const m = document.createElement("span");
  m.className = "offline-mark"; m.title = SAYS[what]; m.setAttribute("role", "img"); m.setAttribute("aria-label", SAYS[what]);
  // an arrow into a tray: saved to this device
  m.innerHTML = `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5v7M5 6.8 8 9.8l3-3"/><path d="M2.5 10.5v2.2c0 .5.4.8.8.8h9.4c.4 0 .8-.3.8-.8v-2.2"/></svg>`;
  return m;
}
// el's mark, put at its end or taken away
export function markOffline(el, what, on) {
  const had = el.querySelector(":scope > .offline-mark");
  if (on && !had) el.append(offlineMark(what));
  if (!on && had) had.remove();
}
// a ticked study's Drive folder is read this deep and this far at most
const MAX_FOLDERS = 200, MAX_FILES = 2000;

export function offline({ $, esc, sizeText, drive, kept, keep, throttled, throttle, stored, showStorage }) {
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
  $("#sb-offline").onclick = () => showStorage();

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

  // ---------- the studies, and making one available offline ----------
  const sizes = new Map(); // url → its size in bytes, as the network said, or null when it would not say
  const sizeOf = (url) => sizes.has(url) ? sizes.get(url) : fetch(url, { method: "HEAD" })
    .then((r) => +r.headers.get("content-length") || null, () => null).then((n) => (sizes.set(url, n), n));
  const here = async (url) => !!(await caches.match(url).catch(() => null));
  // every listed study, [{id, title, manifest, python}], python its packages' urls, Python itself apart; read once,
  // and again after a failure
  let listing = null;
  const studyFiles = () => (listing ||= (async () => {
    const [listed, lock, vendored] = await Promise.all([new URL("studies.json", import.meta.url), CORE.at(-1), new URL("vendor/wheels.json", import.meta.url)]
      .map(async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); }));
    return Promise.all(listed.map(async (s) => {
      const m = await (await fetch(new URL(`../studies/${s.id}/study.json`, import.meta.url))).json();
      return { ...s, manifest: m, python: packagesOf(m.python, lock, vendored, new URL("vendor/", import.meta.url).href).map((w) => w.url) };
    }));
  })().catch((e) => { listing = null; throw e; }));
  // the ids of the studies whose Python is all on this device
  async function available() {
    const core = (await Promise.all(CORE.map(here))).every(Boolean), out = new Set();
    if (core) for (const s of await studyFiles()) if ((await Promise.all(s.python.map(here))).every(Boolean)) out.add(s.id);
    return out;
  }
  // what is missing of a list of urls, and its size
  async function missing(urls) {
    const out = [];
    for (const u of urls) if (!(await here(u))) out.push(u);
    const n = await Promise.all(out.map(sizeOf));
    return { urls: out, bytes: n.reduce((a, b) => a + (b || 0), 0), unknown: n.some((b) => b == null) };
  }

  // This session's download speeds, bytes per second by source, or null: Python's as the service worker measured
  // its downloads from the CDN, Google Drive's as the Drive module measured its own; else the browser's estimate of
  // the connection, flagged as one.
  async function speeds() {
    const sw = navigator.serviceWorker && (await navigator.serviceWorker.ready.catch(() => null))?.active;
    let hosts = {};
    if (sw) {
      hosts = await Promise.race([new Promise((ok) => {
        const on = (e) => { if (e.data?.type !== "speeds") return; navigator.serviceWorker.removeEventListener("message", on); ok(e.data.hosts || {}); };
        navigator.serviceWorker.addEventListener("message", on);
        sw.postMessage({ type: "speeds" });
      }), new Promise((ok) => setTimeout(() => ok({}), 1000))]);
    }
    const rate = (m) => (m && m.bytes > 0 && m.ms > 0 ? (m.bytes / m.ms) * 1000 : null);
    const guess = navigator.connection?.downlink ? { rate: navigator.connection.downlink * 125000, guessed: true } : null;
    const of = (m) => (rate(m) ? { rate: rate(m) } : guess);
    return { python: of(hosts[new URL(CORE[0]).host]), drive: of(drive.speed?.()) };
  }
  const duration = (s) => (s < 60 ? `${Math.max(1, Math.round(s))} s` : s < 3600 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`);
  // "200 MB of Python at 15 MB/s + 1 GB from Google Drive at 25 MB/s, about 1 min 20 s"
  function timeText(parts) {
    const said = [], known = [];
    for (const p of parts.filter((x) => x.bytes)) {
      if (!p.speed) { said.push(`${sizeText(p.bytes)} ${p.what}, at a speed not measured yet`); continue; }
      said.push(`${sizeText(p.bytes)} ${p.what} at ${p.speed.guessed ? "about " : ""}${sizeText(p.speed.rate)}/s${p.speed.guessed ? " (the browser's estimate)" : ""}`);
      known.push(p.bytes / p.speed.rate);
    }
    if (!said.length) return "";
    return "Time: " + said.join(" + ") + (known.length ? `, about ${duration(known.reduce((a, b) => a + b, 0))}${known.length < said.length ? " and more" : ""}.` : ".");
  }

  // the images in a study's own Drive folder and the folders under it: [{id, name, size, path, study, kept}], or
  // a sentence saying why there are none
  async function imagesOf(s) {
    const link = s.manifest.files.drive, ref = link && drive.parse(link);
    if (!ref || ref.kind !== "folder") return "This study has no Google Drive folder of its own.";
    if (!drive.ready) return "Its Google Drive folder needs this site's Google API key.";
    if (isOffline()) return "Its Google Drive folder can be read once you are online.";
    if (throttled()) return "Google is throttling this site's downloads; try again in a while.";
    const found = [];
    for (const queue = [{ id: ref.id, path: [] }], seen = new Set(); queue.length && seen.size < MAX_FOLDERS && found.length < MAX_FILES; ) {
      const at = queue.shift();
      if (seen.has(at.id)) continue;
      seen.add(at.id);
      for (const f of await drive.list(at.id)) {
        if (f.folder) queue.push({ id: f.id, path: [...at.path, f.name] });
        else if (f.name !== PREVIEWS) found.push({ ...f, path: at.path, study: s.id, kept: await kept(f.id) });
      }
    }
    return found.length ? found : "Its Google Drive folder holds no images.";
  }

  // The popup for one study: what making it available offline takes, then the download. done() once it closes.
  let ctl = null, run = 0, plan = null;
  async function makeAvailable(id, done) {
    const dlg = $("#offline-dlg"), msg = (t) => { $("#offline-msg").textContent = t; };
    const s = (await studyFiles()).find((x) => x.id === id);
    if (!s) return;
    $("#offline-title").textContent = `Make ${s.title} available offline`;
    for (const el of ["#offline-python", "#offline-total", "#offline-free", "#offline-time", "#offline-warn"]) $(el).textContent = "";
    $("#offline-files").textContent = "Reading its Google Drive folder…"; msg(""); $("#offline-go").disabled = true; $("#offline-go").hidden = false;
    $("#offline-close").onclick = () => dlg.close();
    dlg.onclose = () => { ctl?.abort(); done?.(); };
    dlg.showModal();
    const asked = ++run;
    let images = [];
    try { images = await imagesOf(s); } catch (e) {
      if (e.throttled) throttle();
      images = `Its Google Drive folder could not be read: ${e.message || e}`;
    }
    if (asked !== run) return;
    if (typeof images === "string") $("#offline-files").innerHTML = `<p class="hint">${esc(images)}</p>`;
    else {
      const fresh = images.filter((f) => !f.kept);
      $("#offline-files").innerHTML = `<p class="hint">Its images on Google Drive${fresh.length < images.length ? `, ${images.length - fresh.length} of them already on this device` : ""}:</p>` +
        (fresh.length ? `<label class="all-row"><input type="checkbox" class="all" checked> All ${fresh.length}</label>` : "") + `<div class="files"></div>`;
      $("#offline-files .files").replaceChildren(...images.map((f) => {
        const l = document.createElement("label"); l.className = "file-row";
        l.innerHTML = `<input type="checkbox" class="file"><span class="name">${esc(f.name)}</span><span class="where">${esc(["Folder", ...f.path].join(" / "))}</span><span class="size">${f.size == null ? "" : sizeText(f.size)}</span>`;
        const box = l.querySelector("input"); box.checked = true; box.disabled = f.kept; box.dataset.id = f.id;
        if (f.kept) markOffline(l.querySelector(".size"), "image", true);
        box.onchange = () => recount(s, images);
        return l;
      }));
      const all = $("#offline-files input.all");
      if (all) all.onchange = () => { for (const b of $("#offline-files").querySelectorAll("input.file:not(:disabled)")) b.checked = all.checked; recount(s, images); };
    }
    await recount(s, typeof images === "string" ? [] : images);
  }
  // what the choice downloads, beside the room left, and how long it takes; Download is refused a choice larger
  // than the room left
  async function recount(s, images) {
    const asked = ++run;
    const python = await missing([...CORE, ...s.python]);
    const ticked = new Set([...$("#offline-files").querySelectorAll("input.file:checked:not(:disabled)")].map((b) => b.dataset.id));
    const chosen = images.filter((f) => ticked.has(f.id)), imageBytes = chosen.reduce((a, f) => a + (f.size || 0), 0);
    const [speed, free] = await Promise.all([speeds(), navigator.storage?.estimate?.().then((e) => e.quota - e.usage, () => null) ?? null]);
    if (asked !== run) return;
    const bytes = python.bytes + imageBytes;
    $("#offline-python").textContent = python.urls.length ? `Its Python: ${sizeText(python.bytes)}${python.unknown ? " or more" : ""} from jsDelivr.` : "Its Python is already on this device.";
    $("#offline-free").textContent = free == null ? "This browser does not say how much more the site may keep." : `This browser lets the site keep about ${sizeText(free)} more.`;
    $("#offline-total").textContent = bytes ? `This downloads ${sizeText(bytes)}${chosen.length ? `: its Python and ${chosen.length === 1 ? "1 image" : chosen.length + " images"}` : ""}.` : "Everything is already on this device.";
    $("#offline-time").textContent = timeText([{ what: "of Python", bytes: python.bytes, speed: speed.python }, { what: "from Google Drive", bytes: imageBytes, speed: speed.drive }]);
    const tooMuch = free != null && bytes > free;
    $("#offline-warn").hidden = !tooMuch;
    $("#offline-warn").textContent = tooMuch ? `That is more than this browser lets the site keep (${sizeText(free)}). Untick some images.` : "";
    $("#offline-go").disabled = !bytes || tooMuch || isOffline() || !!ctl;
    plan = { s, python: python.urls, images: chosen, bytes };
  }

  // Download: the browser asked to keep the site's storage, the site's copy brought up to date, then each download
  // in turn, the Python first
  $("#offline-go").onclick = async () => {
    if (!plan) return;
    const { s, python, images: chosen, bytes } = plan;
    ctl = new AbortController(); const signal = ctl.signal;
    $("#offline-go").disabled = true; $("#offline-stop").hidden = false;
    const bar = $("#offline-progress"), msg = (t) => { $("#offline-msg").textContent = t; };
    bar.hidden = false; bar.max = bytes || 1; bar.value = 0;
    let done = 0, images = 0, error = null;
    const persisted = await navigator.storage?.persist?.().catch(() => false);
    try {
      msg("Keeping the site itself…"); await keepSite();
      for (const url of python) {
        if (signal.aborted) break;
        msg(`Downloading Python · ${sizeText(done)} of ${sizeText(bytes)}`);
        const r = await fetch(url, { signal });
        if (!r.ok) throw new Error(`${url.split("/").pop()}: HTTP ${r.status}`);
        for (const reader = r.body.getReader(); ; ) {
          const { done: end, value } = await reader.read();
          if (end) break;
          done += value.length; bar.value = done;
        }
      }
      for (const f of chosen) {
        if (signal.aborted) break;
        if (throttled()) throw Object.assign(new Error("Google is throttling this site's downloads"), { throttled: true });
        msg(`Downloading ${f.name} · ${sizeText(done)} of ${sizeText(bytes)}`);
        const got = await drive.file(f.id, f.name);
        await keep(f.id, got.name, got.bytes, { path: f.path, study: f.study });
        done += got.bytes.byteLength; bar.value = done; images++;
      }
    } catch (e) {
      if (e.throttled) throttle();
      if (e.name !== "AbortError") error = e;
    }
    ctl = null; bar.hidden = true; $("#offline-stop").hidden = true; $("#offline-go").hidden = true;
    stored();
    const soFar = images ? ` ${images === 1 ? "1 image" : images + " images"} kept so far.` : "";
    const keptFor = persisted ? "The browser keeps it until you delete it here." : "The browser may clear it if this device runs low on space.";
    if (error) msg(`Could not finish: ${error.message || error}.${soFar}`);
    else if (signal.aborted) msg(`Stopped.${soFar}`);
    else msg(`${s.title} is available offline: its Python${images ? ` and ${images === 1 ? "1 image" : images + " images"}` : ""}. ${keptFor}`);
  };
  $("#offline-stop").onclick = () => ctl?.abort();

  showApp();
  return { keepSite, siteCache: () => siteCache, offline: isOffline, studyFiles, available, makeAvailable, core: CORE };
}
