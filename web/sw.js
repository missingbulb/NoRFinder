// Keeps the third-party code the page runs (Pyodide and its packages from the CDN, and the
// wheels the build vendors under vendor/) in Cache Storage for 30 days, so a return visit starts
// without downloading ~50 MB again. The site's own files always come from the network, so a
// deploy is picked up on the next load.
const CACHE = "third-party-v1";
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const STAMP = "x-nor-cached-at";

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
// a page asks what was downloaded for it and for its Python, naming the Python workers it already knows
self.addEventListener("message", (e) => {
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
  e.respondWith(own ? download(req, id, { cache: "no-cache" }) : cached(req, id));
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
