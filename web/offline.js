// Working without the internet. Offline by default (req/shell/offline/default): the service worker keeps the site's copy,
// which keepSite() brings up to the release now published; with no network the page says Offline in the status
// bar's network, a red mark on its icon, and each control marked data-needs-network says so and does nothing. No
// network is the browser saying so, or the site not answering, asked all session long: a plane's Wi-Fi with no
// internet beyond it leaves the browser saying it is online.
// Making a study available offline (req/shell/offline/per-study), from the Storage tab: a popup of what the study's Python and the images
// in its remote folder take, then the download; and Install as an app, at the top of the tab.
// deps: $, esc, sizeText; remote, the remote store; kept(id), whether an image is kept on this device;
// keptIn(), the ids of the studies an image is kept in; keep(id, name, bytes, {path, study}), keeping one; throttled() and throttle(), the store's wait (req/shell/drive/throttle); stored(),
// once something is kept.
import { CORE, packagesOf } from "./python_files.js";
import { PREVIEWS } from "./previews.js";
import { studyPlace } from "./study_root.js";

// the event each part of the page follows the network by, fired on window as it goes or comes back:
// detail {online}
export const CONNECTION = "nor-connection";

// the browser key that says the user asked for the app, so the page names its manifest from then on
export const APP_ASKED = "nor-app-asked";

// The mark of what is available offline (req/shell/offline/mark): a study whose Python is all on this device, with one
// of its images when it has a remote folder, or an image kept on it. Its tooltip is a tiny one; what it means in full is said to assistive tech.
const SAYS = {
  study: "Available offline: this study's Python, and an image when it has a folder of them, are on this device, so the study runs without the internet.",
  image: "Available offline: this image is kept on this device, so it opens without the internet.",
};
export function offlineMark(what) {
  const m = document.createElement("span");
  m.className = "offline-mark"; m.setAttribute("role", "img"); m.setAttribute("aria-label", SAYS[what]); m.title = "Available for offline";
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
// a ticked study's remote folder is read this deep and this far at most
const MAX_FOLDERS = 200, MAX_FILES = 2000;

// an attribute offline's hold on a control owns while it lasts, for what puts the page back to leave as it is
const HOLD = new Set(["title", "aria-disabled", "data-online-title"]);
export const holdOwns = (el, name) => el.dataset.onlineTitle !== undefined && HOLD.has(name);

export function offline({ $, esc, sizeText, remote, kept, keptIn, keep, throttled, throttle, stored }) {
  // ---------- offline by default ----------
  const NEEDS = "[data-needs-network]", WHY = "Needs the internet: you are offline.", AGAIN_MS = 30000, AGAIN_OFF_MS = 5000;
  const NET_OFF = "Offline: no internet. The page runs what is on this device. Click for more.";
  let unreached = false;
  const isOffline = () => !navigator.onLine || unreached;
  const ONLINE = "Online. Click to set up working offline.", OFFLINE = "Offline: no internet. The page runs what is on this device. Click to set up working offline.";
  const net = $("#sb-net"), netTitle = net.title, online = $("#sb-online");
  let was = null;
  const mark = () => {
    const off = isOffline();
    if (was !== null && off !== was) dispatchEvent(new CustomEvent(CONNECTION, { detail: { online: !off } }));
    was = off;
    document.documentElement.classList.toggle("offline", off);
    net.title = off ? NET_OFF : netTitle;
    online.title = off ? OFFLINE : ONLINE;
    for (const el of document.querySelectorAll(NEEDS)) {
      if (off && el.dataset.onlineTitle === undefined) { el.dataset.onlineTitle = el.title; el.title = WHY; el.setAttribute("aria-disabled", "true"); }
      if (!off && el.dataset.onlineTitle !== undefined) { el.title = el.dataset.onlineTitle; delete el.dataset.onlineTitle; el.removeAttribute("aria-disabled"); }
    }
  };
  // what is drawn while offline says so too
  new MutationObserver(() => { if (isOffline()) mark(); }).observe(document.body, { childList: true, subtree: true });
  addEventListener("online", () => { mark(); keepSite(); });
  addEventListener("offline", mark);
  mark();
  navigator.serviceWorker?.addEventListener("message", (e) => {
    if (e.data?.type === "reach" && e.data.unreached !== unreached) { unreached = e.data.unreached; mark(); }
  });
  // asked every AGAIN_MS, and every AGAIN_OFF_MS while offline, so coming back shows soon
  let asked = 0;
  setInterval(() => { if (isOffline() || Date.now() - asked >= AGAIN_MS) keepSite(); }, AGAIN_OFF_MS);
  document.addEventListener("click", (e) => {
    if (isOffline() && e.target.closest?.(NEEDS)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // the site's copy, brought up to date by the service worker: {files, unreached, cache} once it answers
  let siteCache = null;
  async function keepSite() {
    asked = Date.now();
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
  // the ids of the studies available offline: their Python all on this device and, with a remote folder of their
  // own, at least one of its images
  async function available() {
    const core = (await Promise.all(CORE.map(here))).every(Boolean), out = new Set();
    if (!core) return out;
    const images = await keptIn().catch(() => new Set());
    for (const s of await studyFiles()) {
      if (remote.study(s.manifest).root && !images.has(s.id)) continue;
      if ((await Promise.all(s.python.map(here))).every(Boolean)) out.add(s.id);
    }
    return out;
  }
  // what is missing of a list of urls, and its size
  async function missing(urls) {
    const out = [];
    for (const u of urls) if (!(await here(u))) out.push(u);
    const n = await Promise.all(out.map(sizeOf));
    return { urls: out, bytes: n.reduce((a, b) => a + (b || 0), 0), unknown: n.some((b) => b == null) };
  }

  // the images in a study's own remote folder and the folders under it: [{id, name, size, path, study, kept}], or
  // a sentence saying why there are none
  async function imagesOf(s) {
    const top = remote.study(s.manifest).root;
    if (!top) return `This study has no ${remote.label} folder of its own.`;
    if (!remote.ready) return `Its ${remote.label} folder ${remote.words.noKey}.`;
    if (isOffline()) return `Its ${remote.label} folder can be read once you are online.`;
    if (throttled()) return `${remote.words.throttling}; try again in a while.`;
    // its images are in the data folder its root's settings name, else in the root itself
    const refs = [{ id: (await studyPlace(remote, () => s.manifest).dataFolders())[0] }];
    const found = [];
    for (const queue = refs.map((r) => ({ id: r.id, path: [] })), seen = new Set(); queue.length && seen.size < MAX_FOLDERS && found.length < MAX_FILES; ) {
      const at = queue.shift();
      if (seen.has(at.id)) continue;
      seen.add(at.id);
      for (const f of await remote.list(at.id, s.manifest.files.accept)) {
        if (f.folder) queue.push({ id: f.id, path: [...at.path, f.name] });
        else if (f.name !== PREVIEWS) found.push({ ...f, path: at.path, study: s.id, kept: await kept(f.id) });
      }
    }
    return found.length ? found : `Its ${remote.label} folder holds no images.`;
  }

  // The popup for one study: what making it available offline takes, then the download. done() once it closes.
  let ctl = null, run = 0, plan = null, showing = null;
  addEventListener(CONNECTION, () => { if ($("#offline-dlg").open && !ctl && showing) makeAvailable(showing.id, showing.done); });
  async function makeAvailable(id, done) {
    showing = { id, done };
    const dlg = $("#offline-dlg"), msg = (t) => { $("#offline-msg").textContent = t; };
    const s = (await studyFiles()).find((x) => x.id === id);
    if (!s) return;
    for (const el of ["#offline-python", "#offline-warn"]) $(el).textContent = "";
    $("#offline-files").textContent = `Reading its ${remote.label} folder…`; msg(""); $("#offline-go").disabled = true; $("#offline-go").hidden = false;
    $("#offline-go").textContent = "Download Now";
    $("#offline-close").onclick = () => dlg.close();
    dlg.onclose = () => { ctl?.abort(); showing = null; done?.(); };
    if (!dlg.open) dlg.showModal();
    const asked = ++run;
    let images = [];
    try { images = await imagesOf(s); } catch (e) {
      if (e.throttled) throttle();
      images = `Its ${remote.label} folder could not be read: ${e.message || e}`;
    }
    if (asked !== run) return;
    if (typeof images === "string") $("#offline-files").innerHTML = `<p class="hint">${esc(images)}</p>`;
    else {
      const fresh = images.filter((f) => !f.kept);
      $("#offline-files").innerHTML = (fresh.length ? `<label class="all-row"><input type="checkbox" class="all" checked> All ${fresh.length} images on ${remote.label}</label>` : "") + `<div class="files"></div>`;
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
  // what the choice downloads, on Download; Download is refused a choice larger than the room left
  async function recount(s, images) {
    const asked = ++run;
    const python = await missing([...CORE, ...s.python]);
    const ticked = new Set([...$("#offline-files").querySelectorAll("input.file:checked:not(:disabled)")].map((b) => b.dataset.id));
    const chosen = images.filter((f) => ticked.has(f.id)), imageBytes = chosen.reduce((a, f) => a + (f.size || 0), 0);
    const free = await (navigator.storage?.estimate?.().then((e) => e.quota - e.usage, () => null) ?? null);
    if (asked !== run) return;
    const bytes = python.bytes + imageBytes;
    $("#offline-python").textContent = python.urls.length ? `${sizeText(python.bytes)}${python.unknown ? " or more" : ""}` : "On this device";
    markOffline($("#offline-python"), "study", !python.urls.length);
    $("#offline-go").textContent = bytes ? `Download ${sizeText(bytes)} Now` : "Download Now";
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
        if (throttled()) throw Object.assign(new Error(remote.words.throttling), { throttled: true });
        msg(`Downloading ${f.name} · ${sizeText(done)} of ${sizeText(bytes)}`);
        const got = await remote.file(f.id, f.name);
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
    if (error) {
      // what is kept stays kept: the popup counts again, Download offered for the rest once the network allows
      await makeAvailable(s.id, showing?.done);
      msg(`Could not finish: ${error.message || error}.${soFar}`);
    }
    else if (signal.aborted) msg(`Stopped.${soFar}`);
    else msg(`${s.title} is available offline: its Python${images ? ` and ${images === 1 ? "1 image" : images + " images"}` : ""}. ${keptFor}`);
  };
  $("#offline-stop").onclick = () => ctl?.abort();

  showApp();
  return { keepSite, siteCache: () => siteCache, offline: isOffline, studyFiles, available, makeAvailable, core: CORE };
}
