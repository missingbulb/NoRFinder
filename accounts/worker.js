// The site's server (1.50): every address outside /api/ is the site's own files; under /api/ it signs a
// user in with the token Google's sign-in gives the page, keeps their session in a cookie, and keeps one
// settings record per user, {browser key: the string the page keeps under it}, in its D1 database (DB). No
// address serves anything about a user but to that user's own session. Each sign-in, sign-out and save is
// logged by the user's Google id, for Cloudflare's Workers Logs.
const DAY = 24 * 3600;
const SESSION_DAYS = 30;
// the database's tables, made on the first request an instance answers; deploying makes the database, not its tables
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT, picture TEXT,
     settings TEXT, created INTEGER NOT NULL, last_seen INTEGER NOT NULL)`,
  "CREATE INDEX IF NOT EXISTS users_last_seen ON users (last_seen)",
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users (id),
     expires INTEGER NOT NULL)`,
];
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
const log = (event, user) => console.log(JSON.stringify({ event, user: user.id }));
// the signed-in user, seen now; null for no session, an ended one or one that has run out
async function signedIn(request, env) {
  const id = sessionId(request);
  if (!id) return null;
  const now = Date.now();
  const user = await env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires > ?").bind(id, now).first();
  if (user) await env.DB.prepare("UPDATE users SET last_seen = ? WHERE id = ?").bind(now, user.id).run();
  return user;
}
const shown = (user) => ({ email: user.email, name: user.name, picture: user.picture });
const settingsOf = (user) => (user.settings ? JSON.parse(user.settings) : null);

async function api(request, env, path) {
  // a change must come from the site's own page: the browser always says where a POST, PUT or DELETE comes from
  if (request.method !== "GET" && request.headers.get("origin") !== new URL(request.url).origin) return reply(403, { error: "not from this site" });
  if (path === "/api/session") {
    if (request.method === "GET") {
      const user = await signedIn(request, env);
      return reply(200, user ? { user: shown(user), settings: settingsOf(user) } : { user: null, clientId: env.GOOGLE_CLIENT_ID || null });
    }
    if (request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return reply(400, { error: "not JSON" }); }
      const google = await verified(body && body.credential, env.GOOGLE_CLIENT_ID);
      if (!google) return reply(401, { error: "Google did not sign this in" });
      const id = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
      const now = Date.now();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO users (id, email, name, picture, created, last_seen) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
          ON CONFLICT (id) DO UPDATE SET email = ?2, name = ?3, picture = ?4, last_seen = ?5`).bind(google.id, google.email, google.name, google.picture, now),
        env.DB.prepare("INSERT INTO sessions (id, user_id, expires) VALUES (?, ?, ?)").bind(id, google.id, now + SESSION_DAYS * DAY * 1000),
        env.DB.prepare("DELETE FROM sessions WHERE expires <= ?").bind(now),
      ]);
      const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(google.id).first();
      log("sign-in", user);
      return reply(200, { user: shown(user), settings: settingsOf(user) }, { "set-cookie": cookie(id, SESSION_DAYS * DAY) });
    }
    if (request.method === "DELETE") {
      const id = sessionId(request);
      const ended = id && await env.DB.prepare("DELETE FROM sessions WHERE id = ? RETURNING user_id AS id").bind(id).first();
      if (ended) log("sign-out", ended);
      return reply(200, { user: null }, { "set-cookie": cookie("", 0) });
    }
  }
  if (path === "/api/settings" && request.method === "PUT") {
    const user = await signedIn(request, env);
    if (!user) return reply(401, { error: "not signed in" });
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_SETTINGS) return reply(413, { error: "settings over 16 KB" });
    let settings;
    try { settings = JSON.parse(text); } catch { return reply(400, { error: "not JSON" }); }
    if (!settings || typeof settings !== "object" || Array.isArray(settings) || Object.values(settings).some((v) => typeof v !== "string"))
      return reply(400, { error: "settings are {key: string}" });
    await env.DB.prepare("UPDATE users SET settings = ? WHERE id = ?").bind(text, user.id).run();
    log("settings-saved", user);
    return reply(200, { ok: true });
  }
  return reply(404, { error: "no such address" });
}

let schemaMade = null;
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path !== "/api" && !path.startsWith("/api/")) return env.ASSETS.fetch(request);
    schemaMade ||= env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql))).catch((e) => { schemaMade = null; throw e; });
    await schemaMade;
    return api(request, env, path);
  },
};
