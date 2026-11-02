// Keeps the third-party code the page runs (Pyodide and its packages from the CDN, and the
// wheels the build vendors under vendor/) in Cache Storage for 30 days, so a return visit starts
// without downloading ~50 MB again. The site's own files come from the network whenever it answers, so
// a deploy is picked up on the next load; a copy of the whole site, one release's, is kept beside them
// for when it does not (offline, requirement 1.55).
const CACHE = "third-party-v1";
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const STAMP = "x-nor-cached-at";
// the site's copy: a cache per release the build's offline.json lists, "site-" + the list's hash, which is
// used only once DONE marks every file in it; each file is kept with its SHA-256
const SITE = "site-", DONE = "/__complete", SHA = "x-nor-sha256";
const LIST = new URL("offline.json", self.location.href).href;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// What this worker downloads for each page and for each page's Python, for the status bar's network: a response
// it answers reports no size to the page. Bytes by client id as the browser's timings give them (a revalidated
// file counts its headers alone, one from Cache Storage nothing); which page each Python worker belongs to; and
// the fetches waiting for their timing, by URL.
const got = {}, workerOf = {}, waiting = new Map();
new PerformanceObserver((l) => {
  for (const e of l.getEntries()) {
    const ids = waiting.get(e.name), id = ids?.shift();
    if (ids && !ids.length) waiting.delete(e.name);
    if (id) got[id] = (got[id] || 0) + e.transferSize;
  }
}).observe({ type: "resource" });
const download = (req, id, init) => {
  if (!waiting.has(req.url)) waiting.set(req.url, []);
  waiting.get(req.url).push(id);
  return fetch(req, init);
};
// a page asks what was downloaded for it and for its Python, naming the Python workers it already knows; and
// asks for the site's copy to be brought up to the release now published, answered once it is with how many
// files it holds, whether the site answered at all (unreached: no network, though the browser may say it is
// online) and the cache the copy is in (null when none is whole), or why it could not be
self.addEventListener("message", (e) => {
  if (e.data?.type === "site") {
    const answer = async (m) => e.source.postMessage({ type: "site", cache: (await siteCopy())?.name || null, ...m });
    return e.waitUntil(keepSite().then((m) => answer(m), (err) => answer({ error: String(err.message || err) })));
  }
  if (e.data?.type !== "net") return;
  const page = e.source.id, workers = new Set([...(e.data.workers || []), ...Object.keys(workerOf).filter((w) => workerOf[w] === page)]);
  e.source.postMessage({ type: "net", page: { id: page, bytes: got[page] || 0 }, workers: Object.fromEntries([...workers].map((w) => [w, got[w] || 0])) });
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const u = new URL(req.url);
  const own = u.origin === self.location.origin && !u.pathname.includes("/vendor/");
  // only the code the page runs is kept: never a user's own files, such as one read from Google Drive
  const code = !own && (u.origin === self.location.origin || u.hostname === "cdn.jsdelivr.net");
  if (req.method !== "GET" || !(own || code)) return;
  const id = req.mode === "navigate" ? e.resultingClientId : e.clientId;
  if (req.destination === "worker") workerOf[e.resultingClientId] = e.clientId;
  // own files are revalidated on every load: from the browser's plain HTTP cache a fresh page could
  // arrive with the previous release's stylesheet or scripts
  e.respondWith(own ? fresh(req, id) : cached(req, id));
});

async function cached(req, id) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req.url);
  const at = hit && Number(hit.headers.get(STAMP));
  if (hit && at && Date.now() - at < MAX_AGE_MS) return hit;
  let res;
  try {
    res = await download(req, id);
  } catch (err) {
    if (hit) return hit; // offline: an expired copy beats nothing
    const site = (await siteCopy())?.cache, kept = site && (await site.match(keyOf(req.url))); // a wheel the build vendors
    if (kept) return kept;
    throw err;
  }
  if (res.ok && res.type !== "opaque") {
    const headers = new Headers(res.headers);
    headers.set(STAMP, String(Date.now()));
    const body = await res.clone().arrayBuffer();
    await cache.put(req.url, new Response(body, { status: res.status, statusText: res.statusText, headers }));
  }
  return res;
}

// one of the site's own files: the network's, else the site's copy. The copy is the whole release, so a file it
// lacks is not on the site: an address opens the page, which tells a study's address from any other, and any
// other file is not found, as Python's importer asks of every module name it lacks
async function fresh(req, id) {
  try {
    return await download(req, id, { cache: "no-cache" });
  } catch (err) {
    const site = (await siteCopy())?.cache;
    if (!site) throw err;
    return (await site.match(keyOf(req.url))) || (req.mode === "navigate" && (await site.match(keyOf(self.registration.scope))))
      || new Response("", { status: 404, statusText: "Not Found" });
  }
}
// the address a file is kept under: as the site serves it, an .html page by its name alone, with no query
function keyOf(url) {
  const u = new URL(url);
  u.search = ""; u.hash = "";
  u.pathname = u.pathname.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "");
  return u.href;
}
const sha256 = async (buf) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
async function siteCopy() {
  for (const name of await caches.keys()) {
    if (!name.startsWith(SITE)) continue;
    const cache = await caches.open(name);
    if (await cache.match(DONE)) return { name, cache };
  }
  return null;
}

// The site's copy, brought up to the release offline.json lists: each file found unchanged in the copy before is
// taken from it, each other one downloaded and checked against the list; once all are in, the copy before goes.
// A file that does not match the list (a release landing meanwhile) ends the run, for the next load to finish.
// Returns {files}, how many files the copy holds (0 with no list: a preview built before it), and unreached when
// the site did not answer.
let keeping = null;
const keepSite = () => (keeping ||= keepSiteNow().finally(() => { keeping = null; }));
async function keepSiteNow() {
  const res = await fetch(LIST, { cache: "no-cache" }).catch(() => null);
  if (!res) return { files: 0, unreached: true };
  if (!res.ok) return { files: 0 };
  const text = await res.text(), files = JSON.parse(text).files;
  const name = SITE + (await sha256(new TextEncoder().encode(text))).slice(0, 16);
  const others = (await caches.keys()).filter((n) => n.startsWith(SITE) && n !== name);
  const copy = await caches.open(name);
  if (!(await copy.match(DONE))) {
    const before = await Promise.all(others.map((n) => caches.open(n)));
    for (const f of files) {
      const key = keyOf(new URL(f.path, LIST).href);
      if (await copy.match(key)) continue; // kept by a run this one resumes
      let kept = null;
      for (const c of before) {
        const hit = await c.match(key);
        if (hit && hit.headers.get(SHA) === f.sha256) { kept = hit; break; }
      }
      if (!kept) {
        const r = await fetch(key, { cache: "no-cache" });
        if (!r.ok) throw new Error(`${f.path}: HTTP ${r.status}`);
        const body = await r.arrayBuffer();
        if ((await sha256(body)) !== f.sha256) throw new Error(`${f.path} changed while it was kept`);
        // a fresh response: one that arrived through a redirect cannot answer a page's own address
        kept = new Response(body, { headers: { "content-type": r.headers.get("content-type") || "", [SHA]: f.sha256 } });
      }
      await copy.put(key, kept);
    }
    await copy.put(DONE, new Response(""));
  }
  await Promise.all(others.map((n) => caches.delete(n)));
  return { files: files.length };
}
