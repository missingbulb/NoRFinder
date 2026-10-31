// Runs the site's server (accounts/worker.js) in Node against a stand-in KV store and a stand-in Google, and
// checks 1.48: a valid Google token opens a session in an HttpOnly cookie; a token Google did not sign, for
// another site, expired, from another issuer or for an unverified email opens none; the session reads and
// replaces the user's one settings record, refused without a session, from another site, over 16 KB or not
// an object; signing out ends it; and every address outside /api/ is the site's own files.
// Exits 1 on a failed check.
//   node web-tests/accounts_driver.mjs
import { generateKeyPairSync, createSign } from "node:crypto";
import worker from "../accounts/worker.js";

let failed = false;
const check = (ok, what) => { if (!ok) { failed = true; console.error("FAILED: " + what); } else console.log("ok: " + what); };

const CLIENT = "acme-client.apps.googleusercontent.com";
const SITE = "https://acme.example";
const key = (kid) => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" } };
};
const google = key("google-1"), stranger = key("google-1");
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const token = (claims = {}, signer = google) => {
  const now = Math.floor(Date.now() / 1000);
  const body = { iss: "https://accounts.google.com", aud: CLIENT, sub: "1001", email: "ada@acme.example", email_verified: true,
    name: "Ada", picture: "https://lh3.googleusercontent.com/ada", iat: now, exp: now + 3600, ...claims };
  const head = b64({ alg: "RS256", kid: signer.kid, typ: "JWT" }) + "." + b64(body);
  return head + "." + createSign("RSA-SHA256").update(head).sign(signer.privateKey).toString("base64url");
};

// Google's keys, the only address the server may reach
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url) === "https://www.googleapis.com/oauth2/v3/certs")
    return new Response(JSON.stringify({ keys: [google.jwk] }), { headers: { "content-type": "application/json", "cache-control": "max-age=3600" } });
  throw new Error("the server reached " + url);
};
const store = new Map();
const KV = {
  get: async (k, type) => (store.has(k) ? (type === "json" ? JSON.parse(store.get(k).v) : store.get(k).v) : null),
  put: async (k, v, o = {}) => { store.set(k, { v, ttl: o.expirationTtl }); },
  delete: async (k) => { store.delete(k); },
};
const env = { ACCOUNTS: KV, GOOGLE_CLIENT_ID: CLIENT, ASSETS: { fetch: async (req) => new Response("asset " + new URL(req.url).pathname) } };
const call = (method, p, { body, cookie, origin = SITE, raw } = {}) => worker.fetch(new Request(SITE + p, {
  method, headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
  body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
}), env);
const json = async (r) => { try { return await r.json(); } catch { return null; } };

try {
  check(await (await call("GET", "/index.html")).text() === "asset /index.html", "a page outside /api/ is the site's own file");

  let got, r = await call("GET", "/api/session");
  got = await json(r);
  check(r.status === 200 && got?.user === null && got.clientId === CLIENT, "with no session, the server says nobody is signed in, and which Google client signs in");
  env.GOOGLE_CLIENT_ID = "";
  got = await json(await call("GET", "/api/session"));
  check(got?.clientId === null, "a server with no Google client says sign-in is off");
  env.GOOGLE_CLIENT_ID = CLIENT;

  for (const [what, t] of [
    ["one Google did not sign", token({}, stranger)],
    ["one for another site", token({ aud: "other.apps.googleusercontent.com" })],
    ["an expired one", token({ exp: Math.floor(Date.now() / 1000) - 60 })],
    ["one from another issuer", token({ iss: "https://evil.example" })],
    ["one for an unverified email", token({ email_verified: false })],
    ["one that is no token", "not.a.token"],
  ]) {
    r = await call("POST", "/api/session", { body: { credential: t } });
    check(r.status === 401 && !r.headers.get("set-cookie"), `a Google token opens no session when it is ${what}`);
  }
  r = await call("POST", "/api/session", { body: { credential: token() }, origin: "https://evil.example" });
  check(r.status === 403, "a sign-in sent from another site is refused");

  r = await call("POST", "/api/session", { body: { credential: token() } });
  const cookie = r.headers.get("set-cookie") || "";
  got = await json(r);
  check(r.status === 200 && got?.user?.email === "ada@acme.example" && got.user.name === "Ada" && got.user.picture && got.settings === null,
    "a valid Google token signs the user in, with no settings record yet");
  check(/HttpOnly/i.test(cookie) && /Secure/i.test(cookie) && /SameSite=Lax/i.test(cookie) && /Path=\/api/i.test(cookie) && /Max-Age=2592000/.test(cookie),
    "the session is an HttpOnly, secure cookie sent only to /api/, kept 30 days");
  const session = cookie.split(";")[0];
  check([...store.values()].some((s) => s.ttl === 2592000), "the server forgets the session after 30 days too");

  r = await call("GET", "/api/session", { cookie: session });
  got = await json(r);
  check(got?.user?.email === "ada@acme.example" && got.settings === null, "the session names the user on the next visit");

  const SETTINGS = { "nor-theme": "light", "nor-tips-closed": JSON.stringify(["drive"]) };
  check((await call("PUT", "/api/settings", { body: SETTINGS })).status === 401, "settings are not saved without a session");
  check((await call("PUT", "/api/settings", { body: SETTINGS, cookie: session, origin: "https://evil.example" })).status === 403,
    "settings sent from another site are refused");
  check((await call("PUT", "/api/settings", { body: SETTINGS, cookie: session, origin: null })).status === 403,
    "settings sent with no origin are refused");
  check((await call("PUT", "/api/settings", { body: { big: "x".repeat(17 * 1024) }, cookie: session })).status === 413,
    "a settings record over 16 KB is refused");
  for (const bad of [[1, 2], "light", { n: 1 }])
    check((await call("PUT", "/api/settings", { body: bad, cookie: session })).status === 400, `a settings record that is ${JSON.stringify(bad)} is refused`);
  check((await call("PUT", "/api/settings", { body: "{", raw: true, cookie: session })).status === 400, "a settings record that is not JSON is refused");

  r = await call("PUT", "/api/settings", { body: SETTINGS, cookie: session });
  check(r.status === 200, "the signed-in user's settings are saved");
  got = await json(await call("GET", "/api/session", { cookie: session }));
  check(JSON.stringify(got?.settings) === JSON.stringify(SETTINGS), "the session brings back the saved settings");
  await call("PUT", "/api/settings", { body: { "nor-theme": "dark" }, cookie: session });
  got = await json(await call("GET", "/api/session", { cookie: session }));
  check(JSON.stringify(got?.settings) === JSON.stringify({ "nor-theme": "dark" }), "each save replaces the whole record");

  r = await call("POST", "/api/session", { body: { credential: token() } });
  got = await json(r);
  check(JSON.stringify(got?.settings) === JSON.stringify({ "nor-theme": "dark" }), "signing in on another device brings the same record");
  const other = (r.headers.get("set-cookie") || "").split(";")[0];

  r = await call("DELETE", "/api/session", { cookie: session });
  check(r.status === 200 && /Max-Age=0/.test(r.headers.get("set-cookie") || ""), "signing out clears the cookie");
  check((await json(await call("GET", "/api/session", { cookie: session })))?.user === null, "a signed-out session names nobody");
  check((await call("PUT", "/api/settings", { body: SETTINGS, cookie: session })).status === 401, "a signed-out session saves nothing");
  check((await json(await call("GET", "/api/session", { cookie: other })))?.user?.email === "ada@acme.example",
    "signing out on one device leaves the other signed in");
  check((await json(await call("GET", "/api/session", { cookie: "nor_session=forged" })))?.user === null, "a made-up session names nobody");
  check((await call("GET", "/api/nothing")).status === 404, "an unknown /api/ address is not found");
} catch (e) {
  failed = true; console.error("FAILED: " + (e.stack || e));
} finally {
  globalThis.fetch = realFetch;
}
process.exit(failed ? 1 : 0);
