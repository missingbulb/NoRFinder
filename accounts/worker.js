// The site's server (1.50): every address outside /api/ is the site's own files; under /api/ it signs a
// user in with the token Google's sign-in gives the page, keeps their session in a cookie, and keeps one
// settings record per user. Its KV store (ACCOUNTS) holds "session:<id>" → the user, and
// "settings:<Google id>" → their record, {browser key: the string the page keeps under it}.
const DAY = 24 * 3600;
const SESSION_DAYS = 30;
const COOKIE = "nor_session";
const MAX_SETTINGS = 16 * 1024;
const GOOGLE_KEYS = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const reply = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
});
const cookie = (value, maxAge) => `${COOKIE}=${value}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

// Google's signing keys, kept for as long as Google says they hold
let keys = { list: [], until: 0 };
async function googleKeys() {
  if (Date.now() < keys.until) return keys.list;
  const r = await fetch(GOOGLE_KEYS);
  if (!r.ok) throw new Error(`Google's keys answered ${r.status}`);
  const age = +((r.headers.get("cache-control") || "").match(/max-age=(\d+)/) || [])[1] || 0;
  keys = { list: (await r.json()).keys, until: Date.now() + age * 1000 };
  return keys.list;
}

// the user a Google sign-in token names, or null when the token is not one Google signed for this site
async function verified(token, clientId) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || !clientId) return null;
  let head, claims;
  try { head = JSON.parse(new TextDecoder().decode(unb64(parts[0]))); claims = JSON.parse(new TextDecoder().decode(unb64(parts[1]))); } catch { return null; }
  if (head.alg !== "RS256") return null;
  const jwk = (await googleKeys()).find((k) => k.kid === head.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, unb64(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  const now = Date.now() / 1000;
  if (!ok || claims.aud !== clientId || !ISSUERS.includes(claims.iss) || !(claims.exp > now) || claims.email_verified !== true || !claims.sub) return null;
  return { id: String(claims.sub), email: claims.email, name: claims.name || claims.email, picture: claims.picture || null };
}

const sessionId = (request) => ((request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([\\w-]{20,})`)) || [])[1] || null;
async function signedIn(request, env) {
  const id = sessionId(request);
  return id ? { id, user: await env.ACCOUNTS.get("session:" + id, "json") } : { id: null, user: null };
}
const settingsOf = (env, user) => env.ACCOUNTS.get("settings:" + user.id, "json");
const shown = (user) => ({ email: user.email, name: user.name, picture: user.picture });

async function api(request, env, path) {
  // a change must come from the site's own page: the browser always says where a POST, PUT or DELETE comes from
  if (request.method !== "GET" && request.headers.get("origin") !== new URL(request.url).origin) return reply(403, { error: "not from this site" });
  if (path === "/api/session") {
    if (request.method === "GET") {
      const { user } = await signedIn(request, env);
      return reply(200, user ? { user: shown(user), settings: await settingsOf(env, user) } : { user: null, clientId: env.GOOGLE_CLIENT_ID || null });
    }
    if (request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return reply(400, { error: "not JSON" }); }
      const user = await verified(body && body.credential, env.GOOGLE_CLIENT_ID);
      if (!user) return reply(401, { error: "Google did not sign this in" });
      const id = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
      await env.ACCOUNTS.put("session:" + id, JSON.stringify(user), { expirationTtl: SESSION_DAYS * DAY });
      return reply(200, { user: shown(user), settings: await settingsOf(env, user) }, { "set-cookie": cookie(id, SESSION_DAYS * DAY) });
    }
    if (request.method === "DELETE") {
      const id = sessionId(request);
      if (id) await env.ACCOUNTS.delete("session:" + id);
      return reply(200, { user: null }, { "set-cookie": cookie("", 0) });
    }
  }
  if (path === "/api/settings" && request.method === "PUT") {
    const { user } = await signedIn(request, env);
    if (!user) return reply(401, { error: "not signed in" });
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_SETTINGS) return reply(413, { error: "settings over 16 KB" });
    let settings;
    try { settings = JSON.parse(text); } catch { return reply(400, { error: "not JSON" }); }
    if (!settings || typeof settings !== "object" || Array.isArray(settings) || Object.values(settings).some((v) => typeof v !== "string"))
      return reply(400, { error: "settings are {key: string}" });
    await env.ACCOUNTS.put("settings:" + user.id, text);
    return reply(200, { ok: true });
  }
  return reply(404, { error: "no such address" });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    return path === "/api" || path.startsWith("/api/") ? api(request, env, path) : env.ASSETS.fetch(request);
  },
};
