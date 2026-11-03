// Signing in with Google (req/shell/account/sign-in), from the avatar's menu, with no server of the site's own: Google signs the user in
// in its own window and hands this page a token, and the page keeps the user's settings in their own Google Drive,
// in the app's hidden folder, as one file it reads whole and replaces whole: {browser key: the string this device
// keeps under it}, for the keys whose settings follow the user. The services it reaches: Google's sign-in script
// and window, Google's account details (name, email, picture), and the Drive API for that one file. A study may
// ask for more (more(scope), req/shell/data/drive-access): Google's per-file Drive permission, added to the same token.
"use strict";
import { CONNECTION } from "./offline.js";

const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";
const SCOPES = "openid email profile https://www.googleapis.com/auth/drive.appdata";
const USER_INFO = "https://openidconnect.googleapis.com/v1/userinfo";
const FILES = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FILE_NAME = "rauntruth-settings.json";
// a token this close to running out is renewed rather than used
const MARGIN_MS = 60 * 1000;
const SAVE_AFTER_MS = 400;
// who is signed in on this device: {user: {name, email, picture}, token, until (ms), scopes (what the token may do,
// as Google listed it), fileId, changed}, changed the keys whose settings this device changed since Drive last had them
export const SIGNED_IN = "nor-google-sign-in";

// keys: the browser keys whose settings follow the user; applied(): runs once Drive's settings have replaced them;
// changed(): runs whenever who is signed in may have changed
export function account({ keys, menu, clientId, applied, changed = () => {} }) {
  const $ = (s) => menu.querySelector(s);
  // waiting: {ok, fail} of a sign-in the popup is waiting on (req/shell/account/welcome)
  let me = read(), client = null, script = null, saving = null, waiting = null;
  const answered = (how, why) => { const w = waiting; waiting = null; if (w) w[how](why); };

  function read() { try { return JSON.parse(localStorage.getItem(SIGNED_IN)) || null; } catch { return null; } }
  const keep = () => { try { if (me) localStorage.setItem(SIGNED_IN, JSON.stringify(me)); else localStorage.removeItem(SIGNED_IN); } catch { /* private mode: this page only */ } };
  const live = () => !!(me && me.token && Date.now() < me.until - MARGIN_MS);

  const here = () => {
    const out = {};
    for (const k of keys) { try { const v = localStorage.getItem(k); if (v !== null) out[k] = v; } catch { /* no storage */ } }
    return out;
  };
  // Drive's settings replace this device's: a key the file lacks is one the user never set
  const apply = (record) => {
    for (const k of keys) {
      try { if (typeof record[k] === "string") localStorage.setItem(k, record[k]); else localStorage.removeItem(k); } catch { /* no storage */ }
    }
    applied();
  };

  // a call to Google with the user's token; a refused token is forgotten, to be renewed on the next click
  async function google(url, init = {}) {
    const r = await fetch(url, { ...init, headers: { ...init.headers, authorization: "Bearer " + me.token } });
    if (r.status === 401) { me.token = null; keep(); throw new Error("Google refused the token"); }
    if (!r.ok) throw new Error(`Google answered ${r.status}`);
    return r;
  }
  async function fileId() {
    if (me.fileId) return me.fileId;
    const q = encodeURIComponent(`name = '${FILE_NAME}'`);
    const found = (await (await google(`${FILES}?spaces=appDataFolder&q=${q}&fields=files(id)`)).json()).files;
    return (me.fileId = found.length ? found[0].id : null);
  }
  async function save() {
    const body = JSON.stringify(here()), id = await fileId();
    if (id) await google(`${UPLOAD}/${id}?uploadType=media`, { method: "PATCH", headers: { "content-type": "application/json" }, body });
    else {
      // Drive's multipart upload: the file's details, then the file, written out as text
      const cut = "nor-settings-" + Math.random().toString(36).slice(2);
      const parts = [`--${cut}`, "Content-Type: application/json; charset=UTF-8", "", JSON.stringify({ name: FILE_NAME, parents: ["appDataFolder"] }),
        `--${cut}`, "Content-Type: application/json", "", body, `--${cut}--`, ""].join("\r\n");
      me.fileId = (await (await google(`${UPLOAD}?uploadType=multipart&fields=id`, { method: "POST", headers: { "content-type": `multipart/related; boundary=${cut}` }, body: parts })).json()).id;
    }
    me.changed = []; keep();
  }
  // Drive's file replaces this device's settings, but for those this device changed since, which are saved over it;
  // with no file, this device's start it
  async function sync() {
    const id = await fileId();
    if (!id) return save();
    const record = await (await google(`${FILES}/${id}?alt=media`)).json(), mine = here(), changed = me.changed || [];
    for (const k of changed) { if (k in mine) record[k] = mine[k]; else delete record[k]; }
    apply(record);
    if (changed.length) return save();
    keep();
  }
  const syncing = () => sync().catch((e) => console.warn("settings not synced with Google Drive:", e.message));

  const show = () => {
    const user = me && me.user;
    $("#who-name").textContent = user ? user.name : "You";
    $("#who-where").textContent = user ? user.email : "On this device, not signed in";
    $("#sign-in").hidden = !!user || !clientId;
    $("#sign-out").hidden = !user;
    const summary = menu.querySelector("summary"), was = summary.querySelector(".avatar");
    const pic = user && user.picture;
    if (pic && was.tagName !== "IMG") {
      summary.dataset.anonymous = was.outerHTML;
      was.replaceWith(Object.assign(document.createElement("img"), { className: "avatar", src: pic, alt: "", width: 32, height: 32, referrerPolicy: "no-referrer" }));
    } else if (!pic && was.tagName === "IMG" && summary.dataset.anonymous) {
      was.outerHTML = summary.dataset.anonymous;
    }
    summary.title = summary.ariaLabel = user ? `${user.name}, signed in` : "You, on this device";
    changed();
  };

  // Google's script, loaded only for someone signing in or signed in; its token client asks for the token
  const ready = () => (script ||= new Promise((ok, fail) => document.head.append(Object.assign(document.createElement("script"), { src: GOOGLE_SCRIPT, async: true, onload: ok, onerror: fail })))
    .then(() => {
      client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: SCOPES,
        callback: async (t) => {
          if (t.error) { console.warn("Google gave no token:", t.error); return answered("fail", t.error); }
          const first = !me || !me.user;
          me = { ...(me || {}), token: t.access_token, until: Date.now() + t.expires_in * 1000, scopes: t.scope || SCOPES };
          if (first) {
            try {
              const u = await (await google(USER_INFO)).json();
              me.user = { name: u.name || u.email, email: u.email, picture: u.picture || null };
            } catch (e) { me = null; keep(); console.warn("Google gave no account details:", e.message); return answered("fail", e.message); }
          }
          keep(); show(); syncing(); answered("ok");
        },
        // Google's window did not open, or was closed before it answered
        error_callback: (e) => { console.warn("Google's sign-in window:", e.type); answered("fail", e.type); },
      });
    })
    .catch((e) => { script = null; console.warn("Google sign-in did not load:", e); }));
  // a token can be asked for only in the user's own click or key press: Google's window opens, and closes by itself
  // while Google still remembers their consent; the new token syncs at once
  const renew = () => {
    if (!me || live() || !client || !navigator.userActivation?.isActive) return false;
    client.requestAccessToken({ prompt: "", login_hint: me.user.email });
    return true;
  };

  // in the user's click: the signed-in user goes on as themselves, asked nothing while their token lasts; settles
  // once Google has answered, failing when it gave no token
  const signIn = () => new Promise((ok, fail) => {
    if (!clientId) return fail(new Error("no Google client"));
    if (live()) return ok();
    answered("fail", "asked again");
    waiting = { ok, fail: (why) => fail(new Error(why)) };
    ready().then(() => {
      if (!client) return answered("fail", "Google's sign-in did not load");
      client.requestAccessToken(me?.user ? { prompt: "", login_hint: me.user.email } : undefined);
    });
  });
  const signOut = () => {
    clearTimeout(saving);
    me = null; keep(); show(); menu.open = false;
  };
  $("#sign-in").onclick = () => { if (client) client.requestAccessToken(); };
  menu.addEventListener("toggle", () => { if (menu.open && clientId && !me) ready(); });
  $("#sign-out").onclick = signOut;

  if (!clientId) me = null;
  show();
  if (live()) syncing();
  else if (me) ready(); // so a click that needs Google can ask at once
  // another tab signed in or out: this one follows, so its next save cannot undo that
  addEventListener("storage", (e) => {
    if (e.key !== SIGNED_IN && e.key !== null) return;
    me = clientId ? read() : null;
    if (!me) clearTimeout(saving);
    show();
  });
  // a change made offline waits for the network, then syncs while the token lasts; with none, Google's script
  // loads so the next click can ask for one
  addEventListener(CONNECTION, (e) => {
    if (!e.detail.online) return;
    if (live()) syncing();
    else if (me) ready();
  });

  return {
    // a setting the shell just wrote: saved to Drive now; with no token, a token is asked for when the user just
    // made the change, else it waits for the next sync
    changed(key) {
      if (!me || !keys.includes(key)) return;
      me.changed = [...new Set([...(me.changed || []), key])]; keep();
      if (!live()) return void renew();
      clearTimeout(saving);
      saving = setTimeout(() => save().catch((e) => console.warn("settings not saved to Google Drive:", e.message)), SAVE_AFTER_MS);
    },
    // the user is about to use Google Drive (Load): a token run out is renewed in their click, and the settings sync
    drive() { renew(); },
    signedIn: () => !!(me && me.user),
    user: () => (me && me.user) || null,
    offered: !!clientId,
    // the user is reaching for Sign in: Google's script, so their click can ask at once
    preload() { if (clientId) ready(); },
    signIn, signOut,
    email: () => (me && me.user && me.user.email) || null,
    // the token while it lasts, else null; renewing it needs the user's click (renew)
    token: () => (live() ? me.token : null),
    renew,
    // whether the token Google gave may do scope, as far as the last one said
    may: (scope) => !!(me && (me.scopes || "").split(" ").includes(scope)),
    // asks Google, in the user's click, to add scope to the token: true once it has
    more(scope) {
      if (!me || !client || !navigator.userActivation?.isActive) return Promise.resolve(false);
      answered("fail", "asked again");
      return new Promise((ok) => {
        waiting = { ok: () => ok(true), fail: () => ok(false) };
        client.requestAccessToken({ scope: SCOPES + " " + scope, include_granted_scopes: true, login_hint: me.user.email });
      }).then((got) => got && this.may(scope));
    },
  };
}
