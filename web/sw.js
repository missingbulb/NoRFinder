// Keeps everything that is not this site's own code (Pyodide and its packages from the CDN, and the
// wheels the build vendors under vendor/) in Cache Storage for 30 days, so a return visit starts
// without downloading ~50 MB again. The site's own files always come from the network, so a
// deploy is picked up on the next load.
const CACHE = "third-party-v1";
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const STAMP = "x-nor-cached-at";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const u = new URL(req.url);
  const own = u.origin === self.location.origin && !u.pathname.includes("/vendor/");
  if (req.method !== "GET" || own) return;
  e.respondWith(cached(req));
});

async function cached(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req.url);
  const at = hit && Number(hit.headers.get(STAMP));
  if (hit && at && Date.now() - at < MAX_AGE_MS) return hit;
  let res;
  try {
    res = await fetch(req);
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
